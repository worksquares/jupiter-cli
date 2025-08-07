/**
 * Jupiter Hook System Types
 * Defines types for the hook system that allows executing shell commands during agent processing
 */

import { z } from 'zod';

/**
 * Hook event types that can trigger hook execution
 */
export enum HookEventType {
  PreToolUse = 'PreToolUse',
  PostToolUse = 'PostToolUse',
  Notification = 'Notification',
  UserPromptSubmit = 'UserPromptSubmit',
  SessionStart = 'SessionStart',
  Stop = 'Stop',
  SubagentStop = 'SubagentStop',
  PreCompact = 'PreCompact'
}

/**
 * Hook execution exit codes and their meanings
 */
export enum HookExitCode {
  Success = 0,          // Success - stdout/stderr handling varies by event
  Error = 1,            // General error - show stderr to user
  Block = 2,            // Block operation - special handling per event
  // Other exit codes are treated as errors
}

/**
 * Hook event metadata for different event types
 */
export interface HookEventMetadata {
  summary: string;
  description: string;
  matcherMetadata?: {
    fieldToMatch: string;
    values: string[];
  };
}

/**
 * Hook configuration
 */
export interface HookConfiguration {
  id: string;
  event: HookEventType;
  command: string;
  matcher?: string;  // Tool name pattern for PreToolUse/PostToolUse
  source: 'settings' | 'user' | 'default';
  enabled: boolean;
  timeout?: number;  // Timeout in milliseconds (default: 60000)
  created: Date;
  updated: Date;
}

/**
 * Hook execution context
 */
export interface HookExecutionContext {
  eventType: HookEventType;
  sessionId: string;
  userId: string;
  timestamp: Date;
  toolName?: string;      // For PreToolUse/PostToolUse
  parameters?: any;       // Tool parameters or event-specific data
  metadata?: any;         // Additional event-specific metadata
}

/**
 * Hook execution result
 */
export interface HookExecutionResult {
  hookId: string;
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;      // Execution time in milliseconds
  blocked: boolean;      // Whether this hook blocked the operation
  feedback?: string;     // Feedback to show to model/user
  error?: Error;
}

/**
 * Hook input data structure (passed as JSON to hook commands)
 */
export interface HookInput {
  event: HookEventType;
  timestamp: string;
  sessionId: string;
  // Event-specific fields
  tool_input?: any;           // For PreToolUse
  tool_response?: any;        // For PostToolUse
  prompt?: string;            // For UserPromptSubmit
  source?: string;            // For SessionStart
  compactionDetails?: any;    // For PreCompact
}

/**
 * Security validation result for hook commands
 */
export interface HookSecurityValidation {
  valid: boolean;
  warnings: string[];
  errors: string[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Hook template for common use cases
 */
export interface HookTemplate {
  id: string;
  name: string;
  description: string;
  event: HookEventType;
  command: string;
  matcher?: string;
  category: 'security' | 'logging' | 'validation' | 'notification' | 'custom';
  riskLevel: 'low' | 'medium' | 'high';
}

/**
 * Zod schemas for validation
 */

export const HookConfigurationSchema = z.object({
  id: z.string(),
  event: z.nativeEnum(HookEventType),
  command: z.string().min(1),
  matcher: z.string().optional(),
  source: z.enum(['settings', 'user', 'default']),
  enabled: z.boolean(),
  timeout: z.number().min(1000).max(600000).optional(),
  created: z.date(),
  updated: z.date()
});

export const HookInputSchema = z.object({
  event: z.nativeEnum(HookEventType),
  timestamp: z.string(),
  sessionId: z.string(),
  tool_input: z.any().optional(),
  tool_response: z.any().optional(),
  prompt: z.string().optional(),
  source: z.string().optional(),
  compactionDetails: z.any().optional()
});

/**
 * Hook event descriptions and metadata
 */
export const HOOK_EVENT_METADATA: Record<HookEventType, HookEventMetadata> = {
  [HookEventType.PreToolUse]: {
    summary: 'Before tool execution',
    description: `Input to command is JSON of tool call arguments.
Exit code 0 - stdout/stderr not shown
Exit code 2 - show stderr to model and block tool call
Other exit codes - show stderr to user only but continue with tool call`,
    matcherMetadata: {
      fieldToMatch: 'tool_name',
      values: [] // Will be populated with available tool names
    }
  },
  [HookEventType.PostToolUse]: {
    summary: 'After tool execution',
    description: `Input to command is JSON with fields "inputs" (tool call arguments) and "response" (tool call response).
Exit code 0 - stdout shown in transcript mode
Exit code 2 - show stderr to model immediately
Other exit codes - show stderr to user only`,
    matcherMetadata: {
      fieldToMatch: 'tool_name',
      values: [] // Will be populated with available tool names
    }
  },
  [HookEventType.Notification]: {
    summary: 'When notifications are sent',
    description: 'Receives notification data as JSON input'
  },
  [HookEventType.UserPromptSubmit]: {
    summary: 'When the user submits a prompt',
    description: `Input to command is JSON with original user prompt text.
Exit code 0 - stdout shown to Jupiter
Exit code 2 - block processing, erase original prompt, and show stderr to user only
Other exit codes - show stderr to user only`
  },
  [HookEventType.SessionStart]: {
    summary: 'When a new session is started',
    description: `Input to command is JSON with session start source.
Exit code 0 - stdout shown to Jupiter
Blocking errors are ignored
Other exit codes - show stderr to user only`,
    matcherMetadata: {
      fieldToMatch: 'source',
      values: ['startup', 'resume', 'clear', 'compact']
    }
  },
  [HookEventType.Stop]: {
    summary: 'Right before Jupiter concludes its response',
    description: `Exit code 0 - stdout/stderr not shown
Exit code 2 - show stderr to model and continue conversation
Other exit codes - show stderr to user only`
  },
  [HookEventType.SubagentStop]: {
    summary: 'Right before a subagent (Task tool call) concludes its response',
    description: `Exit code 0 - stdout/stderr not shown
Exit code 2 - show stderr to subagent and continue having it run
Other exit codes - show stderr to user only`
  },
  [HookEventType.PreCompact]: {
    summary: 'Before conversation compaction',
    description: `Input to command is JSON with compaction details.
Exit code 0 - stdout appended as custom compact instructions
Exit code 2 - block compaction
Other exit codes - show stderr to user only but continue with compaction`,
    matcherMetadata: {
      fieldToMatch: 'trigger',
      values: ['manual', 'auto']
    }
  }
};

/**
 * Default hook templates
 */
export const DEFAULT_HOOK_TEMPLATES: HookTemplate[] = [
  {
    id: 'log-file-changes',
    name: 'Log File Changes',
    description: 'Log all file modifications to a file',
    event: HookEventType.PostToolUse,
    command: 'jq -r \'"\\(.tool_input.file_path // "N/A") - \\(.timestamp)"\' >> ~/.jupiter/file-changes.log',
    matcher: 'Write|Edit|MultiEdit',
    category: 'logging',
    riskLevel: 'low'
  },
  {
    id: 'validate-json',
    name: 'Validate JSON Files',
    description: 'Ensure JSON files are valid before writing',
    event: HookEventType.PreToolUse,
    command: 'jq -r \'.tool_input.file_path | select(endswith(".json"))\' | xargs -r jq . > /dev/null',
    matcher: 'Write',
    category: 'validation',
    riskLevel: 'low'
  },
  {
    id: 'backup-before-edit',
    name: 'Backup Before Edit',
    description: 'Create backup of files before editing',
    event: HookEventType.PreToolUse,
    command: 'cp "$JUPITER_HOOK_FILE" "$JUPITER_HOOK_FILE.bak" 2>/dev/null || true',
    matcher: 'Edit|MultiEdit',
    category: 'security',
    riskLevel: 'low'
  },
  {
    id: 'notify-on-error',
    name: 'Notify on Tool Error',
    description: 'Send notification when tool execution fails',
    event: HookEventType.PostToolUse,
    command: 'jq -r \'select(.response.error) | "Tool \\(.tool_name) failed: \\(.response.error)"\' | notify-send "Jupiter Error" 2>/dev/null || true',
    category: 'notification',
    riskLevel: 'medium'
  },
  {
    id: 'security-check',
    name: 'Security Check on Sensitive Files',
    description: 'Prevent editing of sensitive files',
    event: HookEventType.PreToolUse,
    command: 'jq -r \'.tool_input.file_path | select(test(".env|.ssh|secrets|password|token"; "i"))\' | xargs -r -I {} sh -c \'echo "Blocked access to sensitive file: {}" >&2; exit 2\'',
    matcher: 'Write|Edit|MultiEdit|Read',
    category: 'security',
    riskLevel: 'low'
  }
];

/**
 * Hook permission levels
 */
export enum HookPermissionLevel {
  Disabled = 'disabled',        // No hooks allowed
  SafeOnly = 'safe-only',      // Only pre-approved safe hooks
  WithWarning = 'with-warning', // All hooks with user warning
  Unrestricted = 'unrestricted' // All hooks without warning (dangerous!)
}

/**
 * Hook storage configuration
 */
export interface HookStorageConfig {
  storageType: 'file' | 'memory';
  filePath?: string;  // For file storage
  autoSave?: boolean;
  encryptionKey?: string;
}