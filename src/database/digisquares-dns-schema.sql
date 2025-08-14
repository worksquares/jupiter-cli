-- Digisquares.in DNS Management Schema

-- Table for DNS records
CREATE TABLE IF NOT EXISTS digisquares_dns_records (
  id VARCHAR(36) PRIMARY KEY,
  subdomain VARCHAR(63) NOT NULL,
  full_domain VARCHAR(255) NOT NULL UNIQUE,
  record_type ENUM('A', 'CNAME', 'TXT', 'MX') NOT NULL,
  value TEXT NOT NULL,
  ttl INT DEFAULT 3600,
  priority INT DEFAULT NULL,
  status ENUM('pending', 'propagating', 'active', 'failed', 'deleted') DEFAULT 'pending',
  ssl_enabled BOOLEAN DEFAULT TRUE,
  ssl_status ENUM('pending', 'provisioning', 'active', 'failed') DEFAULT 'pending',
  ssl_certificate_id VARCHAR(255),
  project_name VARCHAR(255),
  deployment_type VARCHAR(50),
  deployment_id VARCHAR(36),
  verification_token VARCHAR(255),
  dns_provider VARCHAR(50) DEFAULT 'azure',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL,
  INDEX idx_subdomain (subdomain),
  INDEX idx_project (project_name),
  INDEX idx_status (status),
  INDEX idx_deployment (deployment_id),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table for SSL certificates
CREATE TABLE IF NOT EXISTS digisquares_ssl_certificates (
  id VARCHAR(36) PRIMARY KEY,
  domain VARCHAR(255) NOT NULL,
  dns_record_id VARCHAR(36),
  certificate_type ENUM('managed', 'custom') DEFAULT 'managed',
  issuer VARCHAR(100) DEFAULT 'Let''s Encrypt',
  fingerprint VARCHAR(255),
  serial_number VARCHAR(255),
  subject TEXT,
  valid_from TIMESTAMP,
  valid_to TIMESTAMP,
  auto_renew BOOLEAN DEFAULT TRUE,
  status ENUM('pending', 'active', 'expired', 'revoked') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  renewed_at TIMESTAMP,
  FOREIGN KEY (dns_record_id) REFERENCES digisquares_dns_records(id) ON DELETE CASCADE,
  INDEX idx_domain (domain),
  INDEX idx_expiry (valid_to)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table for DNS propagation history
CREATE TABLE IF NOT EXISTS dns_propagation_history (
  id VARCHAR(36) PRIMARY KEY,
  dns_record_id VARCHAR(36) NOT NULL,
  check_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  nameserver VARCHAR(255),
  resolved_value VARCHAR(255),
  is_propagated BOOLEAN DEFAULT FALSE,
  response_time_ms INT,
  FOREIGN KEY (dns_record_id) REFERENCES digisquares_dns_records(id) ON DELETE CASCADE,
  INDEX idx_record (dns_record_id),
  INDEX idx_check_time (check_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table for subdomain reservations
CREATE TABLE IF NOT EXISTS subdomain_reservations (
  id VARCHAR(36) PRIMARY KEY,
  subdomain VARCHAR(63) NOT NULL UNIQUE,
  reserved_for VARCHAR(255),
  reservation_type ENUM('permanent', 'temporary', 'system') DEFAULT 'temporary',
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_subdomain (subdomain),
  INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table for DNS configuration templates
CREATE TABLE IF NOT EXISTS dns_templates (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  deployment_type VARCHAR(50),
  record_sets JSON,
  ssl_config JSON,
  cdn_config JSON,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_deployment_type (deployment_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- View for active domains with SSL status
CREATE OR REPLACE VIEW v_active_digisquares_domains AS
SELECT 
  d.id,
  d.subdomain,
  d.full_domain,
  d.record_type,
  d.value AS target,
  d.ssl_enabled,
  d.ssl_status,
  d.project_name,
  d.deployment_type,
  s.valid_to AS ssl_expiry,
  DATEDIFF(s.valid_to, NOW()) AS ssl_days_remaining,
  d.created_at
FROM digisquares_dns_records d
LEFT JOIN digisquares_ssl_certificates s ON d.id = s.dns_record_id AND s.status = 'active'
WHERE d.status = 'active'
ORDER BY d.created_at DESC;

-- Stored procedure to cleanup expired records
DELIMITER //

CREATE PROCEDURE sp_cleanup_expired_dns()
BEGIN
  -- Delete expired reservations
  DELETE FROM subdomain_reservations 
  WHERE reservation_type = 'temporary' 
  AND expires_at < NOW();
  
  -- Mark deleted records older than 30 days for removal
  DELETE FROM digisquares_dns_records 
  WHERE status = 'deleted' 
  AND deleted_at < DATE_SUB(NOW(), INTERVAL 30 DAY);
  
  -- Alert on expiring SSL certificates
  SELECT 
    full_domain,
    valid_to,
    DATEDIFF(valid_to, NOW()) AS days_remaining
  FROM digisquares_ssl_certificates
  WHERE status = 'active'
  AND valid_to < DATE_ADD(NOW(), INTERVAL 30 DAY);
END //

DELIMITER ;

-- Stored procedure to reserve subdomain
DELIMITER //

CREATE PROCEDURE sp_reserve_subdomain(
  IN p_subdomain VARCHAR(63),
  IN p_reserved_for VARCHAR(255),
  IN p_duration_hours INT
)
BEGIN
  DECLARE v_exists INT;
  
  -- Check if subdomain is already taken
  SELECT COUNT(*) INTO v_exists
  FROM digisquares_dns_records
  WHERE subdomain = p_subdomain
  AND status IN ('active', 'pending', 'propagating');
  
  IF v_exists > 0 THEN
    SIGNAL SQLSTATE '45000' 
    SET MESSAGE_TEXT = 'Subdomain is already in use';
  END IF;
  
  -- Check reservations
  SELECT COUNT(*) INTO v_exists
  FROM subdomain_reservations
  WHERE subdomain = p_subdomain
  AND (reservation_type = 'permanent' OR expires_at > NOW());
  
  IF v_exists > 0 THEN
    SIGNAL SQLSTATE '45000' 
    SET MESSAGE_TEXT = 'Subdomain is reserved';
  END IF;
  
  -- Create reservation
  INSERT INTO subdomain_reservations (
    id, subdomain, reserved_for, reservation_type, expires_at
  ) VALUES (
    UUID(),
    p_subdomain,
    p_reserved_for,
    'temporary',
    DATE_ADD(NOW(), INTERVAL p_duration_hours HOUR)
  );
END //

DELIMITER ;

-- Insert default DNS templates
INSERT INTO dns_templates (id, name, deployment_type, record_sets, ssl_config, cdn_config, is_default) VALUES
(
  UUID(),
  'Blob Storage Static Website',
  'blob-storage',
  JSON_OBJECT(
    'cname', JSON_OBJECT('ttl', 3600),
    'txt_verification', JSON_OBJECT('ttl', 300)
  ),
  JSON_OBJECT(
    'enabled', true,
    'provider', 'managed',
    'auto_renew', true
  ),
  JSON_OBJECT(
    'enabled', true,
    'caching_rules', JSON_ARRAY(
      JSON_OBJECT('pattern', '*.js', 'ttl', 604800),
      JSON_OBJECT('pattern', '*.css', 'ttl', 604800),
      JSON_OBJECT('pattern', '*.html', 'ttl', 300)
    )
  ),
  true
),
(
  UUID(),
  'Static Web App',
  'static-web-app',
  JSON_OBJECT(
    'cname', JSON_OBJECT('ttl', 3600),
    'txt_verification', JSON_OBJECT('ttl', 300)
  ),
  JSON_OBJECT(
    'enabled', true,
    'provider', 'managed',
    'auto_renew', true
  ),
  JSON_OBJECT(
    'enabled', false
  ),
  true
);

-- Function to generate unique subdomain
DELIMITER //

CREATE FUNCTION fn_generate_unique_subdomain(
  p_base VARCHAR(50)
) RETURNS VARCHAR(63)
DETERMINISTIC
BEGIN
  DECLARE v_subdomain VARCHAR(63);
  DECLARE v_counter INT DEFAULT 0;
  DECLARE v_exists INT;
  
  -- Clean the base name
  SET v_subdomain = LOWER(REGEXP_REPLACE(p_base, '[^a-z0-9-]', '-'));
  SET v_subdomain = REGEXP_REPLACE(v_subdomain, '-+', '-');
  SET v_subdomain = TRIM(BOTH '-' FROM v_subdomain);
  
  -- Check if base subdomain is available
  SELECT COUNT(*) INTO v_exists
  FROM digisquares_dns_records
  WHERE subdomain = v_subdomain
  AND status != 'deleted';
  
  IF v_exists = 0 THEN
    RETURN v_subdomain;
  END IF;
  
  -- Try with counter
  WHILE v_counter < 100 DO
    SET v_counter = v_counter + 1;
    SET v_subdomain = CONCAT(
      SUBSTRING(p_base, 1, 50), 
      '-', 
      v_counter
    );
    
    SELECT COUNT(*) INTO v_exists
    FROM digisquares_dns_records
    WHERE subdomain = v_subdomain
    AND status != 'deleted';
    
    IF v_exists = 0 THEN
      RETURN v_subdomain;
    END IF;
  END WHILE;
  
  -- Final fallback with timestamp
  RETURN CONCAT(
    SUBSTRING(p_base, 1, 40),
    '-',
    UNIX_TIMESTAMP()
  );
END //

DELIMITER ;