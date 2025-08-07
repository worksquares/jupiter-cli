/**
 * ACI Database Queries
 * All queries for managing ACI lifecycle in code
 */

export const ACIQueries = {
  // Insert new ACI instance
  createInstance: `
    INSERT INTO aci_instances 
    (instance_id, agent_id, deployment_id, container_name, resource_group, 
     state, fqdn, ip_address, last_activity_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'Running', ?, ?, NOW(), NOW(), NOW())
  `,

  // Update ACI activity
  updateActivity: `
    UPDATE aci_instances 
    SET last_activity_at = NOW(), updated_at = NOW() 
    WHERE instance_id = ? AND state = 'Running'
  `,

  // Find inactive containers to pause (> 5 minutes)
  findInactiveContainers: `
    SELECT instance_id, agent_id, last_activity_at,
           TIMESTAMPDIFF(MINUTE, last_activity_at, NOW()) as minutes_inactive
    FROM aci_instances
    WHERE state = 'Running' 
    AND last_activity_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)
  `,

  // Pause container
  pauseContainer: `
    UPDATE aci_instances 
    SET state = 'Paused',
        paused_at = NOW(),
        scheduled_termination_at = DATE_ADD(NOW(), INTERVAL ? HOUR),
        updated_at = NOW()
    WHERE instance_id = ?
  `,

  // Find paused containers to terminate (> 4 hours)
  findExpiredContainers: `
    SELECT instance_id, agent_id, paused_at, scheduled_termination_at
    FROM aci_instances
    WHERE state = 'Paused' 
    AND scheduled_termination_at <= NOW()
  `,

  // Terminate container
  terminateContainer: `
    UPDATE aci_instances 
    SET state = 'Terminated',
        updated_at = NOW()
    WHERE instance_id = ?
  `,

  // Delete old terminated containers (> 24 hours)
  cleanupTerminated: `
    DELETE FROM aci_instances 
    WHERE state = 'Terminated' 
    AND updated_at < DATE_SUB(NOW(), INTERVAL ? HOUR)
  `,

  // Get container by ID
  getContainer: `
    SELECT * FROM aci_instances 
    WHERE instance_id = ?
  `,

  // Get containers by state
  getContainersByState: `
    SELECT * FROM aci_instances 
    WHERE state = ?
    ORDER BY created_at DESC
  `,

  // Get status summary
  getStatusSummary: `
    SELECT 
      state,
      COUNT(*) as count,
      MIN(created_at) as oldest_instance,
      MAX(created_at) as newest_instance
    FROM aci_instances
    GROUP BY state
  `,

  // Get containers pending termination
  getPendingTermination: `
    SELECT 
      instance_id,
      agent_id,
      state,
      paused_at,
      scheduled_termination_at,
      TIMESTAMPDIFF(MINUTE, NOW(), scheduled_termination_at) as minutes_until_termination
    FROM aci_instances
    WHERE state = 'Paused' 
    AND scheduled_termination_at IS NOT NULL
    ORDER BY scheduled_termination_at ASC
  `
};

// Agent task queries
export const AgentTaskQueries = {
  // Create task
  createTask: `
    INSERT INTO agent_tasks 
    (id, agent_id, project_id, type, title, description, branch_name, 
     status, metadata, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, NOW(), NOW())
  `,

  // Update task status
  updateTaskStatus: `
    UPDATE agent_tasks 
    SET status = ?, 
        updated_at = NOW()
    WHERE id = ?
  `,

  // Update task with result
  updateTaskResult: `
    UPDATE agent_tasks 
    SET status = ?, 
        result = ?,
        completed_at = NOW(),
        updated_at = NOW()
    WHERE id = ?
  `,

  // Update task with error
  updateTaskError: `
    UPDATE agent_tasks 
    SET status = 'failed', 
        error = ?,
        completed_at = NOW(),
        updated_at = NOW()
    WHERE id = ?
  `,

  // Get task by ID
  getTask: `
    SELECT * FROM agent_tasks 
    WHERE id = ?
  `,

  // Get tasks by agent
  getTasksByAgent: `
    SELECT * FROM agent_tasks 
    WHERE agent_id = ?
    ORDER BY created_at DESC
  `,

  // Get running tasks
  getRunningTasks: `
    SELECT * FROM agent_tasks 
    WHERE status = 'running'
    ORDER BY started_at ASC
  `
};

// Chat session queries
export const ChatSessionQueries = {
  // Create session
  createSession: `
    INSERT INTO chat_sessions 
    (id, user_id, project_id, agent_id, task_id, socket_id, started_at)
    VALUES (?, ?, ?, ?, ?, ?, NOW())
  `,

  // End session
  endSession: `
    UPDATE chat_sessions 
    SET ended_at = NOW()
    WHERE id = ?
  `,

  // Update session project
  updateSessionProject: `
    UPDATE chat_sessions 
    SET project_id = ?
    WHERE id = ?
  `,

  // Update session task
  updateSessionTask: `
    UPDATE chat_sessions 
    SET task_id = ?
    WHERE id = ?
  `,

  // Get active sessions
  getActiveSessions: `
    SELECT * FROM chat_sessions 
    WHERE ended_at IS NULL
    ORDER BY started_at DESC
  `
};

// Project GitHub repo queries
export const ProjectGitHubQueries = {
  // Add GitHub repo to project
  addRepo: `
    INSERT INTO project_github_repos 
    (id, project_id, github_repo_url, default_branch, is_primary, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, NOW(), NOW())
  `,

  // Get repos for project
  getProjectRepos: `
    SELECT * FROM project_github_repos 
    WHERE project_id = ?
    ORDER BY is_primary DESC, created_at ASC
  `,

  // Get primary repo
  getPrimaryRepo: `
    SELECT * FROM project_github_repos 
    WHERE project_id = ? AND is_primary = TRUE
    LIMIT 1
  `
};