-- Domain Configuration Schema for JupiterDB
-- This table stores domain configurations for projects

CREATE TABLE IF NOT EXISTS domain_configurations (
    id VARCHAR(36) PRIMARY KEY,
    project_id VARCHAR(36) NOT NULL,
    domain VARCHAR(255) NOT NULL DEFAULT 'digisquares.in',
    subdomain VARCHAR(63) NOT NULL,
    fqdn VARCHAR(255) NOT NULL,
    type ENUM('generated', 'custom') NOT NULL DEFAULT 'generated',
    environment ENUM('production', 'staging', 'development', 'preview') NOT NULL DEFAULT 'production',
    service ENUM('aci', 'staticwebapp') NOT NULL,
    ai_generated BOOLEAN DEFAULT FALSE,
    ai_prompt TEXT,
    ai_reasoning TEXT,
    custom_domain_config JSON,
    status ENUM('pending', 'active', 'inactive', 'reserved') NOT NULL DEFAULT 'pending',
    ssl_configured BOOLEAN DEFAULT FALSE,
    ssl_provider VARCHAR(50),
    ssl_expiry_date DATETIME,
    health_check_enabled BOOLEAN DEFAULT FALSE,
    last_health_check DATETIME,
    health_status VARCHAR(50),
    metadata JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_by VARCHAR(36),
    
    -- Indexes for performance
    INDEX idx_project_id (project_id),
    INDEX idx_subdomain (subdomain),
    INDEX idx_status (status),
    INDEX idx_environment (environment),
    INDEX idx_service (service),
    UNIQUE KEY unique_subdomain_env (subdomain, environment),
    
    -- Foreign key to projects table
    CONSTRAINT fk_domain_project FOREIGN KEY (project_id) 
        REFERENCES projects(id) ON DELETE CASCADE
);

-- Domain history table for tracking changes
CREATE TABLE IF NOT EXISTS domain_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    domain_config_id VARCHAR(36) NOT NULL,
    project_id VARCHAR(36) NOT NULL,
    action ENUM('created', 'updated', 'deleted', 'ssl_renewed', 'health_check') NOT NULL,
    previous_state JSON,
    new_state JSON,
    changed_by VARCHAR(36),
    change_reason TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_domain_config_id (domain_config_id),
    INDEX idx_project_id (project_id),
    INDEX idx_timestamp (timestamp)
);

-- AI domain generation log
CREATE TABLE IF NOT EXISTS ai_domain_generations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    project_id VARCHAR(36) NOT NULL,
    request_data JSON NOT NULL,
    ai_response JSON NOT NULL,
    selected_domain VARCHAR(63),
    alternatives JSON,
    generation_score DECIMAL(3,2),
    user_feedback ENUM('accepted', 'rejected', 'modified'),
    feedback_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_project_id (project_id),
    INDEX idx_selected_domain (selected_domain)
);

-- Custom domain verifications
CREATE TABLE IF NOT EXISTS custom_domain_verifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    domain_config_id VARCHAR(36) NOT NULL,
    custom_domain VARCHAR(255) NOT NULL,
    verification_method ENUM('dns_txt', 'dns_cname', 'file', 'meta_tag') NOT NULL,
    verification_token VARCHAR(255) NOT NULL,
    verification_status ENUM('pending', 'verified', 'failed', 'expired') NOT NULL DEFAULT 'pending',
    verified_at DATETIME,
    expires_at DATETIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_domain_config_id (domain_config_id),
    INDEX idx_custom_domain (custom_domain),
    UNIQUE KEY unique_domain_token (custom_domain, verification_token)
);

-- Domain analytics table
CREATE TABLE IF NOT EXISTS domain_analytics (
    id INT AUTO_INCREMENT PRIMARY KEY,
    domain_config_id VARCHAR(36) NOT NULL,
    date DATE NOT NULL,
    requests INT DEFAULT 0,
    unique_visitors INT DEFAULT 0,
    bandwidth_bytes BIGINT DEFAULT 0,
    avg_response_time_ms INT DEFAULT 0,
    error_count INT DEFAULT 0,
    ssl_handshake_time_ms INT DEFAULT 0,
    
    INDEX idx_domain_date (domain_config_id, date),
    UNIQUE KEY unique_domain_date (domain_config_id, date)
);

-- Reserved domains (system-wide)
CREATE TABLE IF NOT EXISTS reserved_domains (
    subdomain VARCHAR(63) PRIMARY KEY,
    reason VARCHAR(255),
    reserved_by VARCHAR(50) DEFAULT 'system',
    reserved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default reserved domains
INSERT IGNORE INTO reserved_domains (subdomain, reason) VALUES
    ('www', 'System reserved'),
    ('api', 'System reserved'),
    ('app', 'System reserved'),
    ('admin', 'System reserved'),
    ('portal', 'System reserved'),
    ('dashboard', 'System reserved'),
    ('console', 'System reserved'),
    ('mail', 'System reserved'),
    ('ftp', 'System reserved'),
    ('blog', 'Common service'),
    ('shop', 'Common service'),
    ('store', 'Common service'),
    ('help', 'Common service'),
    ('support', 'Common service'),
    ('docs', 'Common service'),
    ('status', 'Common service'),
    ('test', 'Environment reserved'),
    ('dev', 'Environment reserved'),
    ('staging', 'Environment reserved'),
    ('prod', 'Environment reserved'),
    ('production', 'Environment reserved'),
    ('preview', 'Environment reserved'),
    ('demo', 'Environment reserved');

-- Stored procedure to check domain availability
DELIMITER //

CREATE PROCEDURE CheckDomainAvailability(
    IN p_subdomain VARCHAR(63),
    OUT p_available BOOLEAN,
    OUT p_reason VARCHAR(255)
)
BEGIN
    DECLARE v_count INT;
    
    -- Check reserved domains
    SELECT COUNT(*) INTO v_count
    FROM reserved_domains
    WHERE subdomain = p_subdomain;
    
    IF v_count > 0 THEN
        SET p_available = FALSE;
        SET p_reason = 'Domain is reserved';
        LEAVE;
    END IF;
    
    -- Check active domain configurations
    SELECT COUNT(*) INTO v_count
    FROM domain_configurations
    WHERE subdomain = p_subdomain 
    AND status IN ('active', 'reserved');
    
    IF v_count > 0 THEN
        SET p_available = FALSE;
        SET p_reason = 'Domain is already in use';
    ELSE
        SET p_available = TRUE;
        SET p_reason = 'Domain is available';
    END IF;
END //

DELIMITER ;

-- Function to generate domain suggestions
DELIMITER //

CREATE FUNCTION GenerateDomainSuggestion(
    p_base_name VARCHAR(50),
    p_suffix VARCHAR(10)
) RETURNS VARCHAR(63)
DETERMINISTIC
BEGIN
    DECLARE v_domain VARCHAR(63);
    
    -- Clean base name
    SET v_domain = LOWER(p_base_name);
    SET v_domain = REPLACE(v_domain, ' ', '-');
    SET v_domain = REPLACE(v_domain, '_', '-');
    SET v_domain = REGEXP_REPLACE(v_domain, '[^a-z0-9-]', '');
    SET v_domain = REGEXP_REPLACE(v_domain, '-+', '-');
    SET v_domain = TRIM(BOTH '-' FROM v_domain);
    
    -- Add suffix if provided
    IF p_suffix IS NOT NULL AND p_suffix != '' THEN
        SET v_domain = CONCAT(v_domain, '-', p_suffix);
    END IF;
    
    -- Ensure length limit
    IF LENGTH(v_domain) > 63 THEN
        SET v_domain = LEFT(v_domain, 63);
    END IF;
    
    RETURN v_domain;
END //

DELIMITER ;

-- View for active domains with project info
CREATE OR REPLACE VIEW active_domains_view AS
SELECT 
    dc.id,
    dc.project_id,
    p.name as project_name,
    dc.subdomain,
    dc.fqdn,
    dc.environment,
    dc.service,
    dc.ai_generated,
    dc.ssl_configured,
    dc.health_status,
    dc.created_at,
    dc.updated_at
FROM domain_configurations dc
JOIN projects p ON dc.project_id = p.id
WHERE dc.status = 'active';

-- Trigger to maintain domain history
DELIMITER //

CREATE TRIGGER domain_config_update_history
AFTER UPDATE ON domain_configurations
FOR EACH ROW
BEGIN
    INSERT INTO domain_history (
        domain_config_id,
        project_id,
        action,
        previous_state,
        new_state,
        timestamp
    ) VALUES (
        NEW.id,
        NEW.project_id,
        'updated',
        JSON_OBJECT(
            'status', OLD.status,
            'ssl_configured', OLD.ssl_configured,
            'health_status', OLD.health_status
        ),
        JSON_OBJECT(
            'status', NEW.status,
            'ssl_configured', NEW.ssl_configured,
            'health_status', NEW.health_status
        ),
        NOW()
    );
END //

DELIMITER ;