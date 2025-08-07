/**
 * Task Model
 * Represents a task within a project
 */

import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

// Task status enum
export enum TaskStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

// Task type enum
export enum TaskType {
  CODE_GENERATION = 'code_generation',
  CODE_ANALYSIS = 'code_analysis',
  DEBUGGING = 'debugging',
  TESTING = 'testing',
  DOCUMENTATION = 'documentation',
  REFACTORING = 'refactoring',
  FRONTEND_DEVELOPMENT = 'frontend_development',
  GENERAL = 'general'
}

// Task schema for validation
export const TaskSchema = z.object({
  id: z.string().uuid().default(() => uuidv4()),
  projectId: z.string().uuid(),
  type: z.nativeEnum(TaskType).default(TaskType.GENERAL),
  title: z.string().min(1).max(255),
  description: z.string(),
  branchName: z.string().optional(),
  aciInstanceId: z.string().optional(),
  gitCommitHash: z.string().optional(),
  pullRequestUrl: z.string().url().optional(),
  status: z.nativeEnum(TaskStatus).default(TaskStatus.PENDING),
  result: z.any().optional(),
  error: z.string().optional(),
  metadata: z.record(z.any()).optional(),
  startedAt: z.date().optional(),
  completedAt: z.date().optional(),
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date())
});

// Task type
export type Task = z.infer<typeof TaskSchema>;

// Task creation input
export const CreateTaskSchema = TaskSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;

// Task update input
export const UpdateTaskSchema = TaskSchema.partial().omit({
  id: true,
  projectId: true,
  createdAt: true
});

export type UpdateTaskInput = z.infer<typeof UpdateTaskSchema>;

// Database row type (with snake_case fields)
export interface TaskRow {
  id: string;
  project_id: string;
  type: string;
  title: string;
  description: string;
  branch_name?: string;
  aci_instance_id?: string;
  git_commit_hash?: string;
  pull_request_url?: string;
  status: string;
  result?: string; // JSON string
  error?: string;
  metadata?: string; // JSON string
  started_at?: Date;
  completed_at?: Date;
  created_at: Date;
  updated_at: Date;
}

// Convert database row to model
export function taskFromRow(row: TaskRow): Task {
  return {
    id: row.id,
    projectId: row.project_id,
    type: row.type as TaskType,
    title: row.title,
    description: row.description,
    branchName: row.branch_name,
    aciInstanceId: row.aci_instance_id,
    gitCommitHash: row.git_commit_hash,
    pullRequestUrl: row.pull_request_url,
    status: row.status as TaskStatus,
    result: row.result ? JSON.parse(row.result) : undefined,
    error: row.error,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// Convert model to database row
export function taskToRow(task: Partial<Task>): Partial<TaskRow> {
  const row: Partial<TaskRow> = {};
  
  if (task.id !== undefined) row.id = task.id;
  if (task.projectId !== undefined) row.project_id = task.projectId;
  if (task.type !== undefined) row.type = task.type;
  if (task.title !== undefined) row.title = task.title;
  if (task.description !== undefined) row.description = task.description;
  if (task.branchName !== undefined) row.branch_name = task.branchName;
  if (task.aciInstanceId !== undefined) row.aci_instance_id = task.aciInstanceId;
  if (task.gitCommitHash !== undefined) row.git_commit_hash = task.gitCommitHash;
  if (task.pullRequestUrl !== undefined) row.pull_request_url = task.pullRequestUrl;
  if (task.status !== undefined) row.status = task.status;
  if (task.result !== undefined) row.result = JSON.stringify(task.result);
  if (task.error !== undefined) row.error = task.error;
  if (task.metadata !== undefined) row.metadata = JSON.stringify(task.metadata);
  if (task.startedAt !== undefined) row.started_at = task.startedAt;
  if (task.completedAt !== undefined) row.completed_at = task.completedAt;
  if (task.createdAt !== undefined) row.created_at = task.createdAt;
  if (task.updatedAt !== undefined) row.updated_at = task.updatedAt;
  
  return row;
}