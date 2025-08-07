-- New tables needed for Jupiter DB to support ACI instance tracking and chat integration

-- ACI Instances table for tracking container lifecycle
CREATE TABLE IF NOT EXISTS `aci_instances` (
  `instance_id` VARCHAR(255) PRIMARY KEY,
  `agent_id` VARCHAR(36),
  `deployment_id` VARCHAR(36),
  `container_name` VARCHAR(255) NOT NULL,
  `resource_group` VARCHAR(255) NOT NULL,
  `state` ENUM('Running', 'Paused', 'Terminated') DEFAULT 'Running',
  `fqdn` VARCHAR(500),
  `ip_address` VARCHAR(45),
  `last_activity_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `paused_at` TIMESTAMP NULL,
  `scheduled_termination_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`deployment_id`) REFERENCES `deployments`(`id`) ON DELETE SET NULL,
  INDEX idx_agent_id (`agent_id`),
  INDEX idx_deployment_id (`deployment_id`),
  INDEX idx_state (`state`),
  INDEX idx_scheduled_termination (`scheduled_termination_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Agent Tasks table (since agents table is more like agent definitions)
CREATE TABLE IF NOT EXISTS `agent_tasks` (
  `id` VARCHAR(36) PRIMARY KEY,
  `agent_id` VARCHAR(36) NOT NULL,
  `project_id` VARCHAR(36) NOT NULL,
  `type` VARCHAR(50) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `description` TEXT,
  `branch_name` VARCHAR(255),
  `git_commit_hash` VARCHAR(40),
  `pull_request_url` VARCHAR(500),
  `status` ENUM('pending', 'running', 'completed', 'failed', 'cancelled') DEFAULT 'pending',
  `result` JSON,
  `error` TEXT,
  `metadata` JSON,
  `started_at` TIMESTAMP NULL,
  `completed_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE,
  INDEX idx_agent_id (`agent_id`),
  INDEX idx_project_id (`project_id`),
  INDEX idx_status (`status`),
  INDEX idx_created_at (`created_at`),
  INDEX idx_branch_name (`branch_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Chat Sessions table for tracking chat interactions
CREATE TABLE IF NOT EXISTS `chat_sessions` (
  `id` VARCHAR(36) PRIMARY KEY,
  `user_id` VARCHAR(200) NOT NULL,
  `project_id` VARCHAR(36),
  `agent_id` VARCHAR(36),
  `task_id` VARCHAR(36),
  `socket_id` VARCHAR(255),
  `started_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `ended_at` TIMESTAMP NULL,
  
  FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`task_id`) REFERENCES `agent_tasks`(`id`) ON DELETE SET NULL,
  INDEX idx_user_id (`user_id`),
  INDEX idx_started_at (`started_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Project GitHub Integration (to link projects with GitHub repos)
CREATE TABLE IF NOT EXISTS `project_github_repos` (
  `id` VARCHAR(36) PRIMARY KEY,
  `project_id` VARCHAR(36) NOT NULL,
  `github_repo_url` VARCHAR(500) NOT NULL,
  `default_branch` VARCHAR(100) DEFAULT 'main',
  `is_primary` BOOLEAN DEFAULT TRUE,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE,
  UNIQUE KEY `project_repo_unique` (`project_id`, `github_repo_url`),
  INDEX idx_project_id (`project_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Stored procedure for ACI cleanup
DELIMITER $$

CREATE PROCEDURE IF NOT EXISTS cleanup_terminated_acis()
BEGIN
  -- Delete ACI instances that have been terminated for more than 24 hours
  DELETE FROM aci_instances 
  WHERE state = 'Terminated' 
  AND updated_at < DATE_SUB(NOW(), INTERVAL 24 HOUR);
END$$

DELIMITER ;

-- Event to run the cleanup procedure daily
CREATE EVENT IF NOT EXISTS daily_aci_cleanup
ON SCHEDULE EVERY 1 DAY
STARTS CURRENT_TIMESTAMP
DO CALL cleanup_terminated_acis();

-- Enable event scheduler if not already enabled
SET GLOBAL event_scheduler = ON;