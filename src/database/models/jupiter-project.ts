/**
 * Jupiter Project Model - Matches existing projects table structure
 */

export enum JupiterProjectStatus {
  ACTIVE = 'active',
  ARCHIVED = 'archived',
  DELETED = 'deleted'
}

export interface JupiterProject {
  id: string;
  name: string;
  description?: string;
  owner_id: string; // References user.id
  created_at?: Date;
  updated_at?: Date;
  status?: JupiterProjectStatus;
  tech_stack?: string;
}

export interface CreateJupiterProjectInput {
  name: string;
  description?: string;
  owner_id: string;
  status?: JupiterProjectStatus;
  tech_stack?: string;
}

export function jupiterProjectFromRow(row: any): JupiterProject {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    owner_id: row.owner_id,
    created_at: row.created_at ? new Date(row.created_at) : undefined,
    updated_at: row.updated_at ? new Date(row.updated_at) : undefined,
    status: row.status || JupiterProjectStatus.ACTIVE,
    tech_stack: row.tech_stack
  };
}

export function jupiterProjectToRow(project: JupiterProject): any {
  return {
    id: project.id,
    name: project.name,
    description: project.description || null,
    owner_id: project.owner_id,
    created_at: project.created_at || new Date(),
    updated_at: project.updated_at || new Date(),
    status: project.status || JupiterProjectStatus.ACTIVE,
    tech_stack: project.tech_stack || null
  };
}