-- Domain Configuration Schema Updates for JupiterDB
-- Fixes and enhancements to the domain management system

-- First, ensure projects table exists (if not already)
CREATE TABLE IF NOT EXISTS projects (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    type VARCHAR(50),
    status ENUM('active', 'inactive', 'suspended', 'deleted') DEFAULT 'active',
    metadata JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_name (name),
    INDEX idx_status (status),
    INDEX idx_created (created_at)
);

-- Add missing columns to domain_configurations if they don't exist
ALTER TABLE domain_configurations 
ADD COLUMN IF NOT EXISTS deployment_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS container_group_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45),
ADD COLUMN IF NOT EXISTS deployment_type ENUM('container', 'staticwebapp', 'function', 'vm') DEFAULT 'container',
ADD COLUMN IF NOT EXISTS ssl_certificate_id VARCHAR(36),
ADD COLUMN IF NOT EXISTS ssl_renewal_date DATETIME,
ADD COLUMN IF NOT EXISTS dns_propagated BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS dns_propagation_checked_at DATETIME,
ADD COLUMN IF NOT EXISTS error_message TEXT,
ADD COLUMN IF NOT EXISTS retry_count INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_retry_at DATETIME;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_deployment_id ON domain_configurations(deployment_id);
CREATE INDEX IF NOT EXISTS idx_ssl_renewal ON domain_configurations(ssl_renewal_date);
CREATE INDEX IF NOT EXISTS idx_dns_propagated ON domain_configurations(dns_propagated);

-- SSL Certificate tracking table
CREATE TABLE IF NOT EXISTS ssl_certificates (
    id VARCHAR(36) PRIMARY KEY,
    domain_config_id VARCHAR(36) NOT NULL,
    domain VARCHAR(255) NOT NULL,
    common_name VARCHAR(255),
    issuer VARCHAR(255),
    serial_number VARCHAR(255),
    fingerprint VARCHAR(255),
    valid_from DATETIME NOT NULL,
    valid_to DATETIME NOT NULL,
    key_type ENUM('rsa', 'ec') DEFAULT 'ec',
    key_size INT,
    alt_names JSON,
    certificate_chain LONGTEXT,
    private_key_encrypted LONGTEXT, -- Encrypted storage
    renewal_status ENUM('not_needed', 'pending', 'in_progress', 'completed', 'failed') DEFAULT 'not_needed',
    renewal_attempts INT DEFAULT 0,
    last_renewal_attempt DATETIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_domain (domain),
    INDEX idx_valid_to (valid_to),
    INDEX idx_renewal_status (renewal_status),
    CONSTRAINT fk_ssl_domain_config FOREIGN KEY (domain_config_id) 
        REFERENCES domain_configurations(id) ON DELETE CASCADE
);

-- Health monitoring data
CREATE TABLE IF NOT EXISTS domain_health_checks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    domain_config_id VARCHAR(36) NOT NULL,
    check_time DATETIME NOT NULL,
    response_time_ms INT,
    status_code INT,
    ssl_valid BOOLEAN,
    ssl_days_remaining INT,
    health_status ENUM('healthy', 'unhealthy', 'degraded', 'unknown') NOT NULL,
    error_details TEXT,
    
    INDEX idx_domain_time (domain_config_id, check_time),
    INDEX idx_health_status (health_status),
    CONSTRAINT fk_health_domain_config FOREIGN KEY (domain_config_id) 
        REFERENCES domain_configurations(id) ON DELETE CASCADE
);

-- Deployment history with more details
CREATE TABLE IF NOT EXISTS deployment_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    domain_config_id VARCHAR(36) NOT NULL,
    deployment_id VARCHAR(255),
    action ENUM('create', 'update', 'delete', 'rollback', 'scale', 'restart') NOT NULL,
    status ENUM('started', 'in_progress', 'completed', 'failed', 'rolled_back') NOT NULL,
    started_at DATETIME NOT NULL,
    completed_at DATETIME,
    duration_seconds INT,
    configuration JSON,
    error_details TEXT,
    initiated_by VARCHAR(255),
    
    INDEX idx_domain_deployment (domain_config_id, started_at),
    INDEX idx_status (status),
    CONSTRAINT fk_deployment_domain_config FOREIGN KEY (domain_config_id) 
        REFERENCES domain_configurations(id) ON DELETE CASCADE
);

-- DNS propagation tracking
CREATE TABLE IF NOT EXISTS dns_propagation_checks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    domain_config_id VARCHAR(36) NOT NULL,
    check_time DATETIME NOT NULL,
    dns_server VARCHAR(255),
    record_type ENUM('A', 'AAAA', 'CNAME', 'TXT', 'MX', 'NS') NOT NULL,
    expected_value VARCHAR(255),
    actual_value VARCHAR(255),
    is_propagated BOOLEAN,
    
    INDEX idx_domain_check (domain_config_id, check_time),
    CONSTRAINT fk_dns_domain_config FOREIGN KEY (domain_config_id) 
        REFERENCES domain_configurations(id) ON DELETE CASCADE
);

-- Add rate limit tracking for Let's Encrypt
CREATE TABLE IF NOT EXISTS ssl_rate_limits (
    id INT AUTO_INCREMENT PRIMARY KEY,
    identifier VARCHAR(255) NOT NULL, -- domain or account
    limit_type ENUM('certificates_per_domain', 'duplicate_certificate', 'failed_validation', 'new_orders') NOT NULL,
    count INT DEFAULT 1,
    window_start DATETIME NOT NULL,
    window_end DATETIME NOT NULL,
    
    UNIQUE KEY unique_identifier_type_window (identifier, limit_type, window_start),
    INDEX idx_window_end (window_end)
);

-- Enhanced AI domain generation log with feedback
ALTER TABLE ai_domain_generations
ADD COLUMN IF NOT EXISTS generation_time_ms INT,
ADD COLUMN IF NOT EXISTS model_used VARCHAR(100),
ADD COLUMN IF NOT EXISTS temperature DECIMAL(3,2),
ADD COLUMN IF NOT EXISTS prompt_tokens INT,
ADD COLUMN IF NOT EXISTS completion_tokens INT,
ADD COLUMN IF NOT EXISTS total_cost DECIMAL(10,4);

-- Create materialized view for domain statistics (as regular view in MySQL)
CREATE OR REPLACE VIEW domain_statistics AS
SELECT 
    dc.project_id,
    p.name as project_name,
    COUNT(DISTINCT dc.id) as total_domains,
    SUM(CASE WHEN dc.status = 'active' THEN 1 ELSE 0 END) as active_domains,
    SUM(CASE WHEN dc.ssl_configured = 1 THEN 1 ELSE 0 END) as ssl_enabled,
    SUM(CASE WHEN dc.health_status = 'healthy' THEN 1 ELSE 0 END) as healthy_domains,
    AVG(CASE WHEN hc.response_time_ms IS NOT NULL THEN hc.response_time_ms END) as avg_response_time,
    MAX(dc.created_at) as last_domain_created,
    MIN(sc.valid_to) as next_ssl_expiry
FROM domain_configurations dc
LEFT JOIN projects p ON dc.project_id = p.id
LEFT JOIN (
    SELECT domain_config_id, response_time_ms, health_status,
           ROW_NUMBER() OVER (PARTITION BY domain_config_id ORDER BY check_time DESC) as rn
    FROM domain_health_checks
) hc ON dc.id = hc.domain_config_id AND hc.rn = 1
LEFT JOIN ssl_certificates sc ON dc.id = sc.domain_config_id AND sc.valid_to > NOW()
GROUP BY dc.project_id, p.name;

-- Stored procedure for safe domain creation with all checks
DELIMITER //

CREATE PROCEDURE CreateDomainConfiguration(
    IN p_project_id VARCHAR(36),
    IN p_subdomain VARCHAR(63),
    IN p_service ENUM('aci', 'staticwebapp'),
    IN p_environment ENUM('production', 'staging', 'development', 'preview'),
    IN p_ssl_enabled BOOLEAN,
    IN p_ai_generated BOOLEAN,
    IN p_ai_reasoning TEXT,
    OUT p_success BOOLEAN,
    OUT p_message VARCHAR(255),
    OUT p_domain_id VARCHAR(36)
)
BEGIN
    DECLARE v_domain_available BOOLEAN;
    DECLARE v_error_message VARCHAR(255);
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SET p_success = FALSE;
        SET p_message = 'Database error occurred';
        SET p_domain_id = NULL;
    END;
    
    START TRANSACTION;
    
    -- Check domain availability
    CALL CheckDomainAvailability(p_subdomain, v_domain_available, v_error_message);
    
    IF NOT v_domain_available THEN
        SET p_success = FALSE;
        SET p_message = v_error_message;
        SET p_domain_id = NULL;
        ROLLBACK;
    ELSE
        -- Generate UUID
        SET p_domain_id = UUID();
        
        -- Insert domain configuration
        INSERT INTO domain_configurations (
            id, project_id, subdomain, domain, fqdn, type, environment,
            service, ai_generated, ai_reasoning, ssl_configured, status
        ) VALUES (
            p_domain_id, p_project_id, p_subdomain, 'digisquares.in',
            CONCAT(p_subdomain, '.digisquares.in'), 
            IF(p_ai_generated, 'generated', 'custom'),
            p_environment, p_service, p_ai_generated, p_ai_reasoning,
            p_ssl_enabled, 'pending'
        );
        
        -- Log in history
        INSERT INTO domain_history (
            domain_config_id, project_id, action, new_state
        ) VALUES (
            p_domain_id, p_project_id, 'created',
            JSON_OBJECT('subdomain', p_subdomain, 'environment', p_environment)
        );
        
        SET p_success = TRUE;
        SET p_message = 'Domain configuration created successfully';
        
        COMMIT;
    END IF;
END //

-- Stored procedure for health check update
CREATE PROCEDURE UpdateHealthCheck(
    IN p_domain_config_id VARCHAR(36),
    IN p_response_time_ms INT,
    IN p_status_code INT,
    IN p_ssl_valid BOOLEAN,
    IN p_ssl_days_remaining INT,
    IN p_health_status ENUM('healthy', 'unhealthy', 'degraded', 'unknown'),
    IN p_error_details TEXT
)
BEGIN
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
    END;
    
    START TRANSACTION;
    
    -- Insert health check record
    INSERT INTO domain_health_checks (
        domain_config_id, check_time, response_time_ms, status_code,
        ssl_valid, ssl_days_remaining, health_status, error_details
    ) VALUES (
        p_domain_config_id, NOW(), p_response_time_ms, p_status_code,
        p_ssl_valid, p_ssl_days_remaining, p_health_status, p_error_details
    );
    
    -- Update domain configuration
    UPDATE domain_configurations
    SET 
        health_status = p_health_status,
        last_health_check = NOW()
    WHERE id = p_domain_config_id;
    
    COMMIT;
END //

DELIMITER ;

-- Function to get next renewal date
DELIMITER //

CREATE FUNCTION GetNextRenewalDate(p_valid_to DATETIME) 
RETURNS DATETIME
DETERMINISTIC
BEGIN
    DECLARE v_days_before INT DEFAULT 30;
    RETURN DATE_SUB(p_valid_to, INTERVAL v_days_before DAY);
END //

DELIMITER ;

-- Trigger to update SSL renewal date
DELIMITER //

CREATE TRIGGER update_ssl_renewal_date
AFTER INSERT ON ssl_certificates
FOR EACH ROW
BEGIN
    UPDATE domain_configurations
    SET ssl_renewal_date = GetNextRenewalDate(NEW.valid_to)
    WHERE id = NEW.domain_config_id;
END //

-- Trigger to track rate limits
CREATE TRIGGER track_ssl_rate_limit
AFTER INSERT ON ssl_certificates
FOR EACH ROW
BEGIN
    DECLARE v_domain VARCHAR(255);
    
    -- Extract base domain (remove subdomains)
    SET v_domain = SUBSTRING_INDEX(NEW.domain, '.', -2);
    
    -- Track certificates per domain (50 per week)
    INSERT INTO ssl_rate_limits (identifier, limit_type, count, window_start, window_end)
    VALUES (
        v_domain,
        'certificates_per_domain',
        1,
        DATE_SUB(NOW(), INTERVAL WEEKDAY(NOW()) DAY),
        DATE_ADD(DATE_SUB(NOW(), INTERVAL WEEKDAY(NOW()) DAY), INTERVAL 7 DAY)
    )
    ON DUPLICATE KEY UPDATE count = count + 1;
END //

DELIMITER ;

-- Add cleanup job for old health checks (keep 30 days)
CREATE EVENT IF NOT EXISTS cleanup_old_health_checks
ON SCHEDULE EVERY 1 DAY
DO
    DELETE FROM domain_health_checks 
    WHERE check_time < DATE_SUB(NOW(), INTERVAL 30 DAY);

-- Add cleanup job for old DNS propagation checks (keep 7 days)
CREATE EVENT IF NOT EXISTS cleanup_old_dns_checks
ON SCHEDULE EVERY 1 DAY
DO
    DELETE FROM dns_propagation_checks 
    WHERE check_time < DATE_SUB(NOW(), INTERVAL 7 DAY);

-- Add cleanup job for expired rate limit windows
CREATE EVENT IF NOT EXISTS cleanup_expired_rate_limits
ON SCHEDULE EVERY 1 HOUR
DO
    DELETE FROM ssl_rate_limits 
    WHERE window_end < NOW();