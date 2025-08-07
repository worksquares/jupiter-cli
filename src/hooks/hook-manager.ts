/**
 * Jupiter Hook Manager
 * Manages hook registration, execution, and lifecycle
 */

import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../utils/logger';
import {
  HookConfiguration,
  HookExecutionContext,
  HookExecutionResult,
  HookEventType,
  HookExitCode,
  HookInput,
  HookPermissionLevel,
  HookStorageConfig,
  HOOK_EVENT_METADATA,
  HookConfigurationSchema
} from './types';
import { HookSecurityValidator } from './security-validator';

export class JupiterHookManager {
  private hooks: Map<string, HookConfiguration> = new Map();
  private securityValidator: HookSecurityValidator;
  private logger: Logger;
  private permissionLevel: HookPermissionLevel = HookPermissionLevel.WithWarning;
  private storageConfig: HookStorageConfig;
  private executionHistory: Map<string, HookExecutionResult[]> = new Map();
  private userConsent: Map<string, boolean> = new Map(); // Track user consent for hooks

  constructor(config?: {
    permissionLevel?: HookPermissionLevel;
    storageConfig?: HookStorageConfig;
  }) {
    this.logger = new Logger('HookManager');
    this.securityValidator = new HookSecurityValidator();
    this.permissionLevel = config?.permissionLevel || HookPermissionLevel.WithWarning;
    this.storageConfig = config?.storageConfig || {
      storageType: 'file',
      filePath: path.join(process.env.HOME || '', '.jupiter', 'hooks.json'),
      autoSave: true
    };

    this.loadHooks().catch(err => {
      this.logger.error('Failed to load hooks', err);
    });
  }

  /**
   * Register a new hook
   */
  async registerHook(config: Omit<HookConfiguration, 'id' | 'created' | 'updated'>): Promise<HookConfiguration> {
    // Validate hook configuration
    const hook: HookConfiguration = {
      ...config,
      id: uuidv4(),
      created: new Date(),
      updated: new Date()
    };

    // Validate with Zod schema
    try {
      HookConfigurationSchema.parse(hook);
    } catch (error) {
      throw new Error(`Invalid hook configuration: ${error}`);
    }

    // Security validation
    const validation = this.securityValidator.validateHook(hook);
    
    if (!validation.valid) {
      throw new Error(`Hook validation failed: ${validation.errors.join(', ')}`);
    }

    // Check permission level
    if (this.permissionLevel === HookPermissionLevel.Disabled) {
      throw new Error('Hooks are disabled');
    }

    if (this.permissionLevel === HookPermissionLevel.SafeOnly && validation.riskLevel !== 'low') {
      throw new Error(`Hook risk level (${validation.riskLevel}) exceeds allowed level for safe-only mode`);
    }

    // Store hook
    this.hooks.set(hook.id, hook);
    await this.saveHooks();

    this.logger.info(`Registered hook: ${hook.id} for event ${hook.event}`);
    
    return hook;
  }

  /**
   * Remove a hook
   */
  async removeHook(hookId: string): Promise<void> {
    if (!this.hooks.has(hookId)) {
      throw new Error(`Hook not found: ${hookId}`);
    }

    this.hooks.delete(hookId);
    this.userConsent.delete(hookId);
    this.executionHistory.delete(hookId);
    
    await this.saveHooks();
    
    this.logger.info(`Removed hook: ${hookId}`);
  }

  /**
   * Update a hook configuration
   */
  async updateHook(hookId: string, updates: Partial<HookConfiguration>): Promise<HookConfiguration> {
    const existing = this.hooks.get(hookId);
    if (!existing) {
      throw new Error(`Hook not found: ${hookId}`);
    }

    const updated: HookConfiguration = {
      ...existing,
      ...updates,
      id: hookId,
      created: existing.created,
      updated: new Date()
    };

    // Re-validate
    const validation = this.securityValidator.validateHook(updated);
    if (!validation.valid) {
      throw new Error(`Hook validation failed: ${validation.errors.join(', ')}`);
    }

    // Clear consent if command changed
    if (existing.command !== updated.command) {
      this.userConsent.delete(hookId);
    }

    this.hooks.set(hookId, updated);
    await this.saveHooks();

    return updated;
  }

  /**
   * Get all hooks
   */
  listHooks(): HookConfiguration[] {
    return Array.from(this.hooks.values());
  }

  /**
   * Get hooks for a specific event
   */
  getHooksForEvent(eventType: HookEventType, toolName?: string): HookConfiguration[] {
    return Array.from(this.hooks.values()).filter(hook => {
      if (hook.event !== eventType || !hook.enabled) {
        return false;
      }

      // Check tool matcher for PreToolUse/PostToolUse
      if (toolName && hook.matcher) {
        try {
          const regex = new RegExp(hook.matcher);
          return regex.test(toolName);
        } catch {
          // If matcher is not a valid regex, treat as exact match or pipe-separated list
          const matchers = hook.matcher.split('|').map(m => m.trim());
          return matchers.includes(toolName);
        }
      }

      return true;
    });
  }

  /**
   * Execute hooks for a given context
   */
  async executeHooks(context: HookExecutionContext): Promise<HookExecutionResult[]> {
    const hooks = this.getHooksForEvent(context.eventType, context.toolName);
    
    if (hooks.length === 0) {
      return [];
    }

    this.logger.debug(`Executing ${hooks.length} hooks for event ${context.eventType}`);

    // Execute hooks in parallel
    const results = await Promise.all(
      hooks.map(hook => this.executeHook(hook, context))
    );

    return results;
  }

  /**
   * Execute a single hook
   */
  private async executeHook(
    hook: HookConfiguration,
    context: HookExecutionContext
  ): Promise<HookExecutionResult> {
    const startTime = Date.now();
    
    try {
      // Check user consent for high-risk hooks
      if (this.permissionLevel === HookPermissionLevel.WithWarning) {
        const validation = this.securityValidator.validateHook(hook);
        if (validation.riskLevel === 'high' || validation.riskLevel === 'critical') {
          const hasConsent = await this.checkUserConsent(hook, validation);
          if (!hasConsent) {
            return {
              hookId: hook.id,
              success: false,
              exitCode: -1,
              stdout: '',
              stderr: 'User declined to execute hook',
              duration: Date.now() - startTime,
              blocked: false
            };
          }
        }
      }

      // Prepare hook input
      const input = this.prepareHookInput(hook, context);
      const inputJson = JSON.stringify(input);

      // Set up environment
      const env = this.prepareEnvironment(hook, context);

      // Execute command
      const result = await this.executeCommand(hook.command, inputJson, env, hook.timeout);

      // Process result based on event type and exit code
      const processed = this.processHookResult(hook, result, context);

      // Store in history
      this.addToHistory(hook.id, processed);

      return processed;

    } catch (error) {
      const result: HookExecutionResult = {
        hookId: hook.id,
        success: false,
        exitCode: -1,
        stdout: '',
        stderr: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
        blocked: false,
        error: error instanceof Error ? error : new Error(String(error))
      };

      this.addToHistory(hook.id, result);
      return result;
    }
  }

  /**
   * Execute a shell command
   */
  private async executeCommand(
    command: string,
    input: string,
    env: Record<string, string>,
    timeout?: number
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const proc = spawn('sh', ['-c', command], {
        env: { ...process.env, ...env },
        timeout: timeout || 60000
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      // Write input to stdin
      proc.stdin.write(input);
      proc.stdin.end();

      proc.on('close', (code) => {
        resolve({
          exitCode: code || 0,
          stdout: stdout.trim(),
          stderr: stderr.trim()
        });
      });

      proc.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Prepare hook input data
   */
  private prepareHookInput(hook: HookConfiguration, context: HookExecutionContext): HookInput {
    const base: HookInput = {
      event: context.eventType,
      timestamp: context.timestamp.toISOString(),
      sessionId: context.sessionId
    };

    // Add event-specific data
    switch (context.eventType) {
      case HookEventType.PreToolUse:
        base.tool_input = context.parameters;
        break;
      
      case HookEventType.PostToolUse:
        base.tool_input = context.parameters;
        base.tool_response = context.metadata?.result;
        break;
      
      case HookEventType.UserPromptSubmit:
        base.prompt = context.metadata?.prompt;
        break;
      
      case HookEventType.SessionStart:
        base.source = context.metadata?.source;
        break;
      
      case HookEventType.PreCompact:
        base.compactionDetails = context.metadata;
        break;
    }

    return base;
  }

  /**
   * Prepare environment variables for hook execution
   */
  private prepareEnvironment(
    hook: HookConfiguration,
    context: HookExecutionContext
  ): Record<string, string> {
    const env: Record<string, string> = {
      JUPITER_HOOK_ID: hook.id,
      JUPITER_HOOK_EVENT: context.eventType,
      JUPITER_SESSION_ID: context.sessionId,
      JUPITER_USER_ID: context.userId
    };

    // Add tool-specific environment variables
    if (context.toolName) {
      env.JUPITER_TOOL_NAME = context.toolName;
    }

    // Add file-specific variables for file operations
    if (context.parameters?.file_path) {
      env.JUPITER_HOOK_FILE = context.parameters.file_path;
    }

    return env;
  }

  /**
   * Process hook result based on event type and exit code
   */
  private processHookResult(
    hook: HookConfiguration,
    result: { exitCode: number; stdout: string; stderr: string },
    context: HookExecutionContext
  ): HookExecutionResult {
    const base: HookExecutionResult = {
      hookId: hook.id,
      success: result.exitCode === 0,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      duration: 0, // Will be set by caller
      blocked: false
    };

    // Process based on event type and exit code
    const metadata = HOOK_EVENT_METADATA[context.eventType];
    
    switch (result.exitCode) {
      case HookExitCode.Success:
        // Success - handle based on event type
        base.feedback = this.getSuccessFeedback(context.eventType, result);
        break;
      
      case HookExitCode.Block:
        // Block operation
        base.blocked = true;
        base.feedback = result.stderr || 'Operation blocked by hook';
        break;
      
      default:
        // Error - show stderr to user
        base.feedback = `Hook error: ${result.stderr}`;
        break;
    }

    return base;
  }

  /**
   * Get success feedback based on event type
   */
  private getSuccessFeedback(eventType: HookEventType, result: any): string | undefined {
    switch (eventType) {
      case HookEventType.PostToolUse:
        return result.stdout; // Show in transcript mode
      
      case HookEventType.UserPromptSubmit:
      case HookEventType.SessionStart:
        return result.stdout; // Show to Jupiter
      
      case HookEventType.PreCompact:
        return result.stdout; // Append as compact instructions
      
      default:
        return undefined; // Don't show stdout/stderr
    }
  }

  /**
   * Check user consent for high-risk hooks
   */
  private async checkUserConsent(
    hook: HookConfiguration,
    validation: any
  ): Promise<boolean> {
    // Check if we already have consent
    if (this.userConsent.has(hook.id)) {
      return this.userConsent.get(hook.id)!;
    }

    // In non-interactive mode, deny by default
    if (process.env.JUPITER_NON_INTERACTIVE === 'true') {
      return false;
    }

    // TODO: Implement interactive consent UI
    // For now, log warning and allow
    this.logger.warn(
      `High-risk hook requires consent: ${hook.id}\n` +
      `Command: ${hook.command}\n` +
      `Warnings: ${validation.warnings.join(', ')}`
    );

    // Store consent (would be from user input in real implementation)
    this.userConsent.set(hook.id, true);
    return true;
  }

  /**
   * Add execution result to history
   */
  private addToHistory(hookId: string, result: HookExecutionResult): void {
    if (!this.executionHistory.has(hookId)) {
      this.executionHistory.set(hookId, []);
    }

    const history = this.executionHistory.get(hookId)!;
    history.push(result);

    // Keep only last 100 executions per hook
    if (history.length > 100) {
      history.shift();
    }
  }

  /**
   * Get execution history for a hook
   */
  getExecutionHistory(hookId: string): HookExecutionResult[] {
    return this.executionHistory.get(hookId) || [];
  }

  /**
   * Load hooks from storage
   */
  private async loadHooks(): Promise<void> {
    if (this.storageConfig.storageType !== 'file' || !this.storageConfig.filePath) {
      return;
    }

    try {
      const data = await fs.readFile(this.storageConfig.filePath, 'utf-8');
      const hooks = JSON.parse(data) as HookConfiguration[];
      
      for (const hook of hooks) {
        // Restore dates
        hook.created = new Date(hook.created);
        hook.updated = new Date(hook.updated);
        
        // Validate
        const validation = this.securityValidator.validateHook(hook);
        if (validation.valid) {
          this.hooks.set(hook.id, hook);
        } else {
          this.logger.warn(`Skipping invalid hook ${hook.id}: ${validation.errors.join(', ')}`);
        }
      }

      this.logger.info(`Loaded ${this.hooks.size} hooks`);
    } catch (error) {
      if ((error as any).code !== 'ENOENT') {
        this.logger.error('Failed to load hooks', error);
      }
    }
  }

  /**
   * Save hooks to storage
   */
  private async saveHooks(): Promise<void> {
    if (!this.storageConfig.autoSave || this.storageConfig.storageType !== 'file' || !this.storageConfig.filePath) {
      return;
    }

    try {
      const dir = path.dirname(this.storageConfig.filePath);
      await fs.mkdir(dir, { recursive: true });

      const data = JSON.stringify(
        Array.from(this.hooks.values()),
        null,
        2
      );

      await fs.writeFile(this.storageConfig.filePath, data, 'utf-8');
      this.logger.debug('Saved hooks to storage');
    } catch (error) {
      this.logger.error('Failed to save hooks', error);
    }
  }

  /**
   * Clear all hooks
   */
  async clearAllHooks(): Promise<void> {
    this.hooks.clear();
    this.userConsent.clear();
    this.executionHistory.clear();
    await this.saveHooks();
  }

  /**
   * Set permission level
   */
  setPermissionLevel(level: HookPermissionLevel): void {
    this.permissionLevel = level;
    
    // Clear consent if switching to more restrictive mode
    if (level === HookPermissionLevel.Disabled || level === HookPermissionLevel.SafeOnly) {
      this.userConsent.clear();
    }
  }

  /**
   * Get current permission level
   */
  getPermissionLevel(): HookPermissionLevel {
    return this.permissionLevel;
  }

  /**
   * Validate all hooks
   */
  validateAllHooks(): Map<string, any> {
    return this.securityValidator.validateHooks(Array.from(this.hooks.values()));
  }
}