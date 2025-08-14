-- Azure Blob Storage Static Website Deployment Schema

-- Table for blob storage deployments
CREATE TABLE IF NOT EXISTS blob_storage_deployments (
  id VARCHAR(36) PRIMARY KEY,
  project_id VARCHAR(255) NOT NULL,
  task_id VARCHAR(255),
  storage_account_name VARCHAR(24) NOT NULL UNIQUE,
  container_name VARCHAR(63) DEFAULT '$web',
  resource_group VARCHAR(90) NOT NULL,
  location VARCHAR(50) NOT NULL,
  primary_endpoint VARCHAR(255) NOT NULL,
  cdn_endpoint VARCHAR(255),
  cdn_profile_name VARCHAR(260),
  cdn_endpoint_name VARCHAR(260),
  custom_domain VARCHAR(255),
  index_document VARCHAR(255) DEFAULT 'index.html',
  error_document VARCHAR(255) DEFAULT '404.html',
  status ENUM('provisioning', 'deploying', 'active', 'failed', 'deleted') DEFAULT 'provisioning',
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deployed_at TIMESTAMP,
  INDEX idx_project_id (project_id),
  INDEX idx_storage_account (storage_account_name),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table for blob deployment environment variables
CREATE TABLE IF NOT EXISTS blob_deployment_env_vars (
  id VARCHAR(36) PRIMARY KEY,
  deployment_id VARCHAR(36) NOT NULL,
  `key` VARCHAR(255) NOT NULL,
  value TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (deployment_id) REFERENCES blob_storage_deployments(id) ON DELETE CASCADE,
  UNIQUE KEY unique_deployment_key (deployment_id, `key`),
  INDEX idx_deployment_id (deployment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table for CDN caching rules
CREATE TABLE IF NOT EXISTS cdn_caching_rules (
  id VARCHAR(36) PRIMARY KEY,
  deployment_id VARCHAR(36) NOT NULL,
  rule_name VARCHAR(255) NOT NULL,
  rule_order INT NOT NULL,
  file_extensions JSON,
  cache_behavior ENUM('Override', 'BypassCache', 'SetIfMissing') DEFAULT 'Override',
  cache_duration VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (deployment_id) REFERENCES blob_storage_deployments(id) ON DELETE CASCADE,
  INDEX idx_deployment_id (deployment_id),
  INDEX idx_rule_order (rule_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table for deployment files tracking
CREATE TABLE IF NOT EXISTS blob_deployment_files (
  id VARCHAR(36) PRIMARY KEY,
  deployment_id VARCHAR(36) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  content_type VARCHAR(100),
  file_size BIGINT,
  etag VARCHAR(255),
  last_modified TIMESTAMP,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (deployment_id) REFERENCES blob_storage_deployments(id) ON DELETE CASCADE,
  INDEX idx_deployment_id (deployment_id),
  INDEX idx_file_path (file_path(255))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table for CDN purge history
CREATE TABLE IF NOT EXISTS cdn_purge_history (
  id VARCHAR(36) PRIMARY KEY,
  deployment_id VARCHAR(36) NOT NULL,
  purge_paths JSON,
  status ENUM('pending', 'completed', 'failed') DEFAULT 'pending',
  initiated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  FOREIGN KEY (deployment_id) REFERENCES blob_storage_deployments(id) ON DELETE CASCADE,
  INDEX idx_deployment_id (deployment_id),
  INDEX idx_initiated_at (initiated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- View for active blob storage deployments with details
CREATE OR REPLACE VIEW v_active_blob_deployments AS
SELECT 
  d.id,
  d.project_id,
  d.storage_account_name,
  d.primary_endpoint,
  d.cdn_endpoint,
  d.custom_domain,
  COALESCE(d.custom_domain, d.cdn_endpoint, d.primary_endpoint) AS access_url,
  d.status,
  d.created_at,
  d.deployed_at,
  COUNT(DISTINCT f.id) AS file_count,
  SUM(f.file_size) AS total_size_bytes
FROM blob_storage_deployments d
LEFT JOIN blob_deployment_files f ON d.id = f.deployment_id
WHERE d.status = 'active'
GROUP BY d.id;

-- Stored procedure to clean up old deployments
DELIMITER //

CREATE PROCEDURE sp_cleanup_old_blob_deployments(
  IN days_to_keep INT
)
BEGIN
  DELETE FROM blob_storage_deployments 
  WHERE status IN ('failed', 'deleted') 
  AND updated_at < DATE_SUB(NOW(), INTERVAL days_to_keep DAY);
END //

DELIMITER ;