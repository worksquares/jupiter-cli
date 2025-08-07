-- Jupiter Database Schema
-- This file contains the SQL schema for the Jupiter system

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  github_repo VARCHAR(500),
  default_branch VARCHAR(100) DEFAULT 'main',
  description TEXT,
  status ENUM('active', 'archived', 'deleted') DEFAULT 'active',
  metadata JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_user_id (user_id),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tasks table
CREATE TABLE IF NOT EXISTS tasks (
  id VARCHAR(36) PRIMARY KEY,
  project_id VARCHAR(36) NOT NULL,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  branch_name VARCHAR(255),
  aci_instance_id VARCHAR(255),
  git_commit_hash VARCHAR(40),
  pull_request_url VARCHAR(500),
  status ENUM('pending', 'running', 'completed', 'failed', 'cancelled') DEFAULT 'pending',
  result JSON,
  error TEXT,
  metadata JSON,
  started_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  INDEX idx_project_id (project_id),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at),
  INDEX idx_branch_name (branch_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ACI Instances table
CREATE TABLE IF NOT EXISTS aci_instances (
  instance_id VARCHAR(255) PRIMARY KEY,
  task_id VARCHAR(36),
  state ENUM('Running', 'Paused', 'Terminated') DEFAULT 'Running',
  last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  paused_at TIMESTAMP NULL,
  scheduled_termination_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL,
  INDEX idx_task_id (task_id),
  INDEX idx_state (state),
  INDEX idx_scheduled_termination (scheduled_termination_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Chat Sessions table (for tracking chat interactions)
CREATE TABLE IF NOT EXISTS chat_sessions (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  project_id VARCHAR(36),
  task_id VARCHAR(36),
  socket_id VARCHAR(255),
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMP NULL,
  
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL,
  INDEX idx_user_id (user_id),
  INDEX idx_started_at (started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create a stored procedure for ACI cleanup
DELIMITER $$

CREATE PROCEDURE IF NOT EXISTS cleanup_terminated_acis()
BEGIN
  -- Delete ACI instances that have been terminated for more than 24 hours
  DELETE FROM aci_instances 
  WHERE state = 'Terminated' 
  AND updated_at < DATE_SUB(NOW(), INTERVAL 24 HOUR);
END$$

DELIMITER ;

-- Create an event to run the cleanup procedure daily
CREATE EVENT IF NOT EXISTS daily_aci_cleanup
ON SCHEDULE EVERY 1 DAY
STARTS CURRENT_TIMESTAMP
DO CALL cleanup_terminated_acis();