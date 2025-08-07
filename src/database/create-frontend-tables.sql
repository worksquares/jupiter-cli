-- Frontend deployment tables for Jupiter DB
-- Tracks Azure Static Web Apps deployments and custom domains

-- Table for tracking Static Web Apps deployments
CREATE TABLE IF NOT EXISTS `static_web_apps` (
  `id` VARCHAR(36) PRIMARY KEY,
  `project_id` VARCHAR(36) NOT NULL,
  `task_id` VARCHAR(36) NOT NULL,
  `deployment_id` VARCHAR(36),
  `app_name` VARCHAR(255) NOT NULL,
  `resource_group` VARCHAR(255) NOT NULL,
  `location` VARCHAR(50) DEFAULT 'eastus',
  `framework` ENUM('react', 'vue', 'angular', 'vanilla') DEFAULT 'react',
  `build_config` JSON,
  `deployment_token` TEXT,
  `default_hostname` VARCHAR(255),
  `custom_domains` JSON,
  `status` ENUM('provisioning', 'deploying', 'active', 'failed', 'deleted') DEFAULT 'provisioning',
  `error_message` TEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deployed_at` TIMESTAMP NULL,
  
  INDEX idx_project_id (project_id),
  INDEX idx_task_id (task_id),
  INDEX idx_deployment_id (deployment_id),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at),
  
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

-- Table for managing frontend custom domains
CREATE TABLE IF NOT EXISTS `frontend_domains` (
  `id` VARCHAR(36) PRIMARY KEY,
  `static_web_app_id` VARCHAR(36) NOT NULL,
  `domain_name` VARCHAR(255) NOT NULL UNIQUE,
  `subdomain` VARCHAR(100),
  `base_domain` VARCHAR(255),
  `ssl_status` ENUM('pending', 'provisioning', 'active', 'failed') DEFAULT 'pending',
  `dns_validation_token` TEXT,
  `dns_configured` BOOLEAN DEFAULT FALSE,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `validated_at` TIMESTAMP NULL,
  
  INDEX idx_static_web_app_id (static_web_app_id),
  INDEX idx_domain_name (domain_name),
  INDEX idx_ssl_status (ssl_status),
  
  FOREIGN KEY (static_web_app_id) REFERENCES static_web_apps(id) ON DELETE CASCADE
);

-- Extend deployments table for frontend-specific fields
ALTER TABLE `deployments` 
ADD COLUMN IF NOT EXISTS `deployment_type` ENUM('backend', 'frontend', 'mobile') DEFAULT 'backend' AFTER `target_platform`,
ADD COLUMN IF NOT EXISTS `static_web_app_id` VARCHAR(36) AFTER `deployment_url`,
ADD COLUMN IF NOT EXISTS `github_workflow_run_id` BIGINT AFTER `static_web_app_id`,
ADD COLUMN IF NOT EXISTS `build_output` TEXT AFTER `github_workflow_run_id`,
ADD INDEX IF NOT EXISTS idx_deployment_type (deployment_type),
ADD CONSTRAINT fk_static_web_app FOREIGN KEY (static_web_app_id) REFERENCES static_web_apps(id) ON DELETE SET NULL;

-- Table for tracking build artifacts
CREATE TABLE IF NOT EXISTS `build_artifacts` (
  `id` VARCHAR(36) PRIMARY KEY,
  `deployment_id` VARCHAR(36) NOT NULL,
  `artifact_type` ENUM('build', 'source', 'config') DEFAULT 'build',
  `file_path` TEXT NOT NULL,
  `file_size` BIGINT,
  `checksum` VARCHAR(64),
  `storage_url` TEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_deployment_id (deployment_id),
  INDEX idx_artifact_type (artifact_type),
  
  FOREIGN KEY (deployment_id) REFERENCES deployments(id) ON DELETE CASCADE
);

-- Table for deployment environment variables
CREATE TABLE IF NOT EXISTS `deployment_env_vars` (
  `id` VARCHAR(36) PRIMARY KEY,
  `static_web_app_id` VARCHAR(36) NOT NULL,
  `key` VARCHAR(255) NOT NULL,
  `value` TEXT,
  `is_secret` BOOLEAN DEFAULT FALSE,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  UNIQUE KEY unique_app_key (static_web_app_id, `key`),
  INDEX idx_static_web_app_id (static_web_app_id),
  
  FOREIGN KEY (static_web_app_id) REFERENCES static_web_apps(id) ON DELETE CASCADE
);

-- View for active frontend deployments
CREATE OR REPLACE VIEW active_frontend_deployments AS
SELECT 
  d.id AS deployment_id,
  d.project_id,
  d.status AS deployment_status,
  d.created_at AS deployment_created_at,
  d.deployment_url,
  swa.id AS static_web_app_id,
  swa.app_name,
  swa.framework,
  swa.default_hostname,
  swa.status AS swa_status,
  fd.domain_name AS custom_domain,
  fd.ssl_status
FROM deployments d
JOIN static_web_apps swa ON d.static_web_app_id = swa.id
LEFT JOIN frontend_domains fd ON swa.id = fd.static_web_app_id AND fd.ssl_status = 'active'
WHERE d.deployment_type = 'frontend' 
  AND d.status = 'deployed'
  AND swa.status = 'active';