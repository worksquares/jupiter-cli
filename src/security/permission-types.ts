/**
 * Permission System Types
 * Types and interfaces for the permission rules system
 */

import { z } from 'zod';

/**
 * Permission rule types
 */
export enum PermissionType {
  Allow = 'allow',
  Deny = 'deny',
  Workspace = 'workspace'
}

/**
 * Permission rule
 */
export interface PermissionRule {
  id: string;
  type: PermissionType;
  toolName: string;
  pattern?: string;
  description?: string;
  priority: number;
  enabled: boolean;
  created: Date;
  updated: Date;
  source: 'user' | 'system' | 'default';
}

/**
 * Permission check result
 */
export interface PermissionCheckResult {
  allowed: boolean;
  rule?: PermissionRule;
  reason?: string;
}

/**
 * Permission context for checking
 */
export interface PermissionContext {
  toolName: string;
  parameters: any;
  userId: string;
  sessionId: string;
  workingDirectories: Set<string>;
}

/**
 * Permission system configuration
 */
export interface PermissionSystemConfig {
  defaultBehavior?: 'allow' | 'deny';
  enableWorkspaceMode?: boolean;
  rulesFile?: string;
  autoSave?: boolean;
  cacheResults?: boolean;
}

/**
 * Tool permission behavior
 */
export interface ToolPermissionBehavior {
  behavior: 'allow' | 'deny' | 'ask';
  message?: string;
  rule?: PermissionRule;
  suggestions?: string[];
}

/**
 * Workspace configuration
 */
export interface WorkspaceConfig {
  primaryDirectory: string;
  additionalDirectories: Set<string>;
  allowSubdirectories: boolean;
  excludePatterns: string[];
}

/**
 * Permission rule schemas for validation
 */
export const PermissionRuleSchema = z.object({
  id: z.string(),
  type: z.nativeEnum(PermissionType),
  toolName: z.string(),
  pattern: z.string().optional(),
  description: z.string().optional(),
  priority: z.number(),
  enabled: z.boolean(),
  created: z.date(),
  updated: z.date(),
  source: z.enum(['user', 'system', 'default'])
});

export const CreatePermissionRuleSchema = z.object({
  type: z.nativeEnum(PermissionType),
  toolName: z.string(),
  pattern: z.string().optional(),
  description: z.string().optional(),
  priority: z.number().optional(),
  enabled: z.boolean().optional()
});

/**
 * Permission rule templates
 */
export const DEFAULT_PERMISSION_RULES: Omit<PermissionRule, 'id' | 'created' | 'updated'>[] = [
  {
    type: PermissionType.Allow,
    toolName: 'read',
    pattern: '*',
    description: 'Allow reading all files',
    priority: 100,
    enabled: true,
    source: 'default'
  },
  {
    type: PermissionType.Deny,
    toolName: 'bash',
    pattern: 'rm -rf /*',
    description: 'Deny destructive commands',
    priority: 1000,
    enabled: true,
    source: 'default'
  },
  {
    type: PermissionType.Workspace,
    toolName: 'write',
    description: 'Only allow writing in workspace directories',
    priority: 500,
    enabled: true,
    source: 'default'
  },
  {
    type: PermissionType.Deny,
    toolName: 'webFetch',
    pattern: 'domain:localhost',
    description: 'Deny fetching from localhost',
    priority: 900,
    enabled: true,
    source: 'default'
  }
];

/**
 * Tool categories for permission grouping
 */
export enum ToolCategory {
  FileSystem = 'filesystem',
  Network = 'network',
  System = 'system',
  Analysis = 'analysis',
  Generation = 'generation'
}

/**
 * Tool metadata for permissions
 */
export interface ToolMetadata {
  name: string;
  category: ToolCategory;
  riskLevel: 'low' | 'medium' | 'high';
  requiresWorkspace?: boolean;
  patternSupport?: boolean;
}