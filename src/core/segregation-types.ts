/**
 * Segregation Types - Core types for multi-tenant isolation
 * All operations must include these identifiers for proper segregation
 */

import { z } from 'zod';

// Core segregation context that must be included in all operations
export interface SegregationContext {
  userId: string;
  projectId: string;
  taskId: string;
  sessionId: string; // Session identifier for container instances
  tenantId?: string; // Optional for multi-tenant scenarios
}

// Zod schema for validation
export const SegregationContextSchema = z.object({
  userId: z.string().uuid(),
  projectId: z.string().uuid(),
  taskId: z.string().uuid(),
  sessionId: z.string(),
  tenantId: z.string().uuid().optional()
});

// Extended types with segregation
export interface SegregatedRequest<T = any> {
  context: SegregationContext;
  data: T;
  timestamp: Date;
  requestId: string;
}

export interface SegregatedResponse<T = any> {
  context: SegregationContext;
  data: T;
  timestamp: Date;
  requestId: string;
  success: boolean;
  error?: string;
}

// WebSocket message format with segregation
export interface SegregatedWebSocketMessage<T = any> {
  context: SegregationContext;
  event: string;
  data: T;
  timestamp: Date;
  messageId: string;
}

// WebSocket request types
export interface WebSocketTaskCreateRequest {
  context: SegregationContext;
  data: any;
}

export interface WebSocketConsoleStreamRequest {
  context: SegregationContext;
  enable?: boolean;
}

export interface WebSocketActionExecuteRequest {
  context: SegregationContext;
  action: any;
  confirmed?: boolean;
}

// Project with segregation
export interface SegregatedProject {
  id: string;
  userId: string;
  name: string;
  gitRepo: string;
  dockerConfig?: DockerConfig;
  activeTasks: Map<string, string>; // taskId -> branchName
  aciInstanceId?: string;
  domain?: DomainConfig;
  createdAt: Date;
  updatedAt: Date;
}

// Task isolation modes
export enum TaskIsolationMode {
  SHARED_CONTAINER = 'shared',      // Tasks share the same ACI
  SEPARATE_CONTAINER = 'separate',  // Each task gets its own ACI
  BRANCH_BASED = 'branch'          // Tasks work on different Git branches
}

// Docker/ACI configuration
export interface DockerConfig {
  image: string;
  cpu?: number;
  memoryGB?: number;
  environmentVariables?: Record<string, string>;
  environment?: Record<string, string>; // Alias for environmentVariables
  volumes?: VolumeConfig[];
  ports?: PortConfig[];
  exposedPorts?: number[]; // Simple port array
  resources?: {
    cpuCount?: number;
    memoryGB?: number;
  };
}

export interface VolumeConfig {
  name: string;
  mountPath: string;
  readOnly?: boolean;
  gitRepo?: {
    repository: string;
    directory?: string;
    revision?: string;
  };
}

export interface PortConfig {
  protocol: 'TCP' | 'UDP';
  port: number;
  name?: string;
}

// Domain configuration
export interface DomainConfig {
  customDomain?: string;
  subdomainPattern: string; // e.g., "{projectId}-{userId}.dev.jupiter.ai"
  sslEnabled: boolean;
  sslCertificate?: string;
}

// Validation helpers
export function validateSegregationContext(context: any): SegregationContext {
  return SegregationContextSchema.parse(context);
}

export function createSegregationContext(
  userId: string,
  projectId: string,
  taskId: string,
  tenantId?: string
): SegregationContext {
  return validateSegregationContext({ userId, projectId, taskId, tenantId });
}

// Type guards
export function hasSegregationContext(obj: any): obj is { context: SegregationContext } {
  return obj && obj.context && 
         typeof obj.context.userId === 'string' &&
         typeof obj.context.projectId === 'string' &&
         typeof obj.context.taskId === 'string';
}