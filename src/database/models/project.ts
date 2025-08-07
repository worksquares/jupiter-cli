/**
 * Project Model
 * Represents a project in the Jupiter system
 */

import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

// Project status enum
export enum ProjectStatus {
  ACTIVE = 'active',
  ARCHIVED = 'archived',
  DELETED = 'deleted'
}

// Project schema for validation
export const ProjectSchema = z.object({
  id: z.string().uuid().default(() => uuidv4()),
  name: z.string().min(1).max(255),
  userId: z.string().uuid(),
  githubRepo: z.string().url().optional(),
  defaultBranch: z.string().default('main'),
  description: z.string().optional(),
  status: z.nativeEnum(ProjectStatus).default(ProjectStatus.ACTIVE),
  metadata: z.record(z.any()).optional(),
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date())
});

// Project type
export type Project = z.infer<typeof ProjectSchema>;

// Project creation input
export const CreateProjectSchema = ProjectSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;

// Project update input
export const UpdateProjectSchema = ProjectSchema.partial().omit({
  id: true,
  userId: true,
  createdAt: true
});

export type UpdateProjectInput = z.infer<typeof UpdateProjectSchema>;

// Database row type (with snake_case fields)
export interface ProjectRow {
  id: string;
  name: string;
  user_id: string;
  github_repo?: string;
  default_branch: string;
  description?: string;
  status: string;
  metadata?: string; // JSON string
  created_at: Date;
  updated_at: Date;
}

// Convert database row to model
export function projectFromRow(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    userId: row.user_id,
    githubRepo: row.github_repo,
    defaultBranch: row.default_branch,
    description: row.description,
    status: row.status as ProjectStatus,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// Convert model to database row
export function projectToRow(project: Partial<Project>): Partial<ProjectRow> {
  const row: Partial<ProjectRow> = {};
  
  if (project.id !== undefined) row.id = project.id;
  if (project.name !== undefined) row.name = project.name;
  if (project.userId !== undefined) row.user_id = project.userId;
  if (project.githubRepo !== undefined) row.github_repo = project.githubRepo;
  if (project.defaultBranch !== undefined) row.default_branch = project.defaultBranch;
  if (project.description !== undefined) row.description = project.description;
  if (project.status !== undefined) row.status = project.status;
  if (project.metadata !== undefined) row.metadata = JSON.stringify(project.metadata);
  if (project.createdAt !== undefined) row.created_at = project.createdAt;
  if (project.updatedAt !== undefined) row.updated_at = project.updatedAt;
  
  return row;
}