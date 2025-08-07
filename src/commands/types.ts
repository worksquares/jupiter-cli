/**
 * Command System Types
 * Types and interfaces for the command system
 */

/**
 * Command interface
 */
export interface Command {
  name: string;
  description: string;
  execute(args: string[]): Promise<string>;
}

/**
 * Command registry configuration
 */
export interface CommandRegistryConfig {
  caseSensitive?: boolean;
  allowOverride?: boolean;
}

/**
 * Command execution result
 */
export interface CommandExecutionResult {
  success: boolean;
  output: string;
  error?: Error;
  executionTime: number;
}

/**
 * Command metadata
 */
export interface CommandMetadata {
  name: string;
  description: string;
  usage?: string;
  examples?: string[];
  aliases?: string[];
  hidden?: boolean;
}

/**
 * Command context passed to execute
 */
export interface CommandContext {
  args: string[];
  flags: Record<string, string | boolean>;
  cwd: string;
  env: Record<string, string>;
  userId: string;
  sessionId: string;
}

/**
 * Advanced command interface with full context support
 */
export interface AdvancedCommand extends Command {
  metadata: CommandMetadata;
  validate?(context: CommandContext): Promise<boolean>;
  executeWithContext(context: CommandContext): Promise<string>;
}