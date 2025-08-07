/**
 * Jupiter Agent Model - Matches existing agents table structure
 */

export enum JupiterAgentType {
  INFRASTRUCTURE = 'infrastructure',
  DEPLOYMENT = 'deployment',
  MASTER_PLANNER = 'master-planner'
}

export enum JupiterAgentStatus {
  SCHEDULED = 'scheduled',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  PAUSED = 'paused'
}

export interface JupiterAgent {
  id: string;
  name: string;
  type: JupiterAgentType;
  project_id: string;
  status?: JupiterAgentStatus;
  config?: any; // JSON field
  created_at?: Date;
  updated_at?: Date;
  started_at?: Date;
  completed_at?: Date;
}

export interface CreateJupiterAgentInput {
  name: string;
  type: JupiterAgentType;
  project_id: string;
  status?: JupiterAgentStatus;
  config?: any;
}

export function jupiterAgentFromRow(row: any): JupiterAgent {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    project_id: row.project_id,
    status: row.status || JupiterAgentStatus.SCHEDULED,
    config: typeof row.config === 'string' ? JSON.parse(row.config) : row.config,
    created_at: row.created_at ? new Date(row.created_at) : undefined,
    updated_at: row.updated_at ? new Date(row.updated_at) : undefined,
    started_at: row.started_at ? new Date(row.started_at) : undefined,
    completed_at: row.completed_at ? new Date(row.completed_at) : undefined
  };
}

export function jupiterAgentToRow(agent: JupiterAgent): any {
  return {
    id: agent.id,
    name: agent.name,
    type: agent.type,
    project_id: agent.project_id,
    status: agent.status || JupiterAgentStatus.SCHEDULED,
    config: agent.config ? JSON.stringify(agent.config) : null,
    created_at: agent.created_at || new Date(),
    updated_at: agent.updated_at || new Date(),
    started_at: agent.started_at || null,
    completed_at: agent.completed_at || null
  };
}