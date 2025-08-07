/**
 * Jupiter Deployment Model - Matches existing deployments table structure
 */

export enum JupiterDeploymentStatus {
  PENDING = 'pending',
  BUILDING = 'building',
  DEPLOYING = 'deploying',
  DEPLOYED = 'deployed',
  FAILED = 'failed'
}

export enum JupiterTargetPlatform {
  WEB = 'web',
  ANDROID = 'android',
  IOS = 'ios'
}

export interface JupiterDeployment {
  id: string;
  project_id: string;
  agent_id: string;
  container_id?: string;
  status?: JupiterDeploymentStatus;
  target_platform: JupiterTargetPlatform;
  build_config?: any; // JSON field
  deployment_url?: string;
  created_at?: Date;
  updated_at?: Date;
  completed_at?: Date;
}

export interface CreateJupiterDeploymentInput {
  project_id: string;
  agent_id: string;
  target_platform: JupiterTargetPlatform;
  container_id?: string;
  status?: JupiterDeploymentStatus;
  build_config?: any;
  deployment_url?: string;
}

export function jupiterDeploymentFromRow(row: any): JupiterDeployment {
  return {
    id: row.id,
    project_id: row.project_id,
    agent_id: row.agent_id,
    container_id: row.container_id,
    status: row.status || JupiterDeploymentStatus.PENDING,
    target_platform: row.target_platform,
    build_config: typeof row.build_config === 'string' 
      ? JSON.parse(row.build_config) 
      : row.build_config,
    deployment_url: row.deployment_url,
    created_at: row.created_at ? new Date(row.created_at) : undefined,
    updated_at: row.updated_at ? new Date(row.updated_at) : undefined,
    completed_at: row.completed_at ? new Date(row.completed_at) : undefined
  };
}

export function jupiterDeploymentToRow(deployment: JupiterDeployment): any {
  return {
    id: deployment.id,
    project_id: deployment.project_id,
    agent_id: deployment.agent_id,
    container_id: deployment.container_id || null,
    status: deployment.status || JupiterDeploymentStatus.PENDING,
    target_platform: deployment.target_platform,
    build_config: deployment.build_config 
      ? JSON.stringify(deployment.build_config) 
      : null,
    deployment_url: deployment.deployment_url || null,
    created_at: deployment.created_at || new Date(),
    updated_at: deployment.updated_at || new Date(),
    completed_at: deployment.completed_at || null
  };
}