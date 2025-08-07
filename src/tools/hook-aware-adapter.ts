/**
 * Hook-Aware Tool Adapter Base Class
 * Extends BaseToolAdapter to integrate hook execution before and after tool operations
 */

import { BaseToolAdapter } from './base-adapter';
import { JupiterHookManager } from '../hooks/hook-manager';
import { HookEventType, HookExecutionContext } from '../hooks/types';
import { Logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export abstract class HookAwareToolAdapter<TInput = any, TOutput = any> extends BaseToolAdapter<TInput, TOutput> {
  protected hookManager: JupiterHookManager;
  protected declare logger: Logger;
  private sessionId: string;
  private userId: string;

  constructor(hookManager: JupiterHookManager) {
    super();
    this.hookManager = hookManager;
    this.sessionId = process.env.JUPITER_SESSION_ID || uuidv4();
    this.userId = process.env.JUPITER_USER_ID || 'user';
    // Logger will be initialized after name is set
    setTimeout(() => {
      this.logger = new Logger(`HookAware:${this.name}`);
    }, 0);
  }

  /**
   * Execute tool with hook integration
   */
  async execute(params: TInput): Promise<TOutput> {
    const toolName = this.getToolName();
    
    // Create pre-execution context
    const preContext: HookExecutionContext = {
      eventType: HookEventType.PreToolUse,
      sessionId: this.sessionId,
      userId: this.userId,
      timestamp: new Date(),
      toolName,
      parameters: params
    };

    // Execute pre-tool hooks
    const preResults = await this.hookManager.executeHooks(preContext);
    
    // Check if any hook blocked execution
    const blockingHook = preResults.find(result => result.blocked);
    if (blockingHook) {
      this.logger.warn(`Tool execution blocked by hook: ${blockingHook.hookId}`);
      
      // If hook provided stderr, show it to the model
      if (blockingHook.exitCode === 2 && blockingHook.stderr) {
        throw new Error(blockingHook.stderr);
      } else {
        throw new Error('Tool execution blocked by hook');
      }
    }

    // Show any pre-hook errors to user
    for (const result of preResults) {
      if (!result.success && result.exitCode !== 2 && result.stderr) {
        this.logger.error(`Pre-hook error: ${result.stderr}`);
        // Continue execution but log the error
      }
    }

    let toolResult: TOutput;
    let toolError: Error | undefined;

    try {
      // Set environment variables for hooks
      await this.setHookEnvironment(params);

      // Execute the actual tool
      toolResult = await this.executeInternal(params);

    } catch (error) {
      toolError = error as Error;
      throw error;
    } finally {
      // Create post-execution context
      const postContext: HookExecutionContext = {
        eventType: HookEventType.PostToolUse,
        sessionId: this.sessionId,
        userId: this.userId,
        timestamp: new Date(),
        toolName,
        parameters: params,
        metadata: {
          success: !toolError,
          error: toolError?.message,
          result: toolError ? undefined : toolResult!
        }
      };

      // Execute post-tool hooks
      const postResults = await this.hookManager.executeHooks(postContext);

      // Process post-hook results
      for (const result of postResults) {
        if (result.exitCode === 2 && result.stderr) {
          // Show to model immediately
          this.logger.info(`Post-hook feedback: ${result.stderr}`);
        } else if (!result.success && result.stderr) {
          // Show to user only
          this.logger.error(`Post-hook error: ${result.stderr}`);
        }
      }

      // Clear environment variables
      await this.clearHookEnvironment();
    }

    return toolResult!;
  }

  /**
   * Set environment variables for hooks
   */
  protected async setHookEnvironment(params: TInput): Promise<void> {
    // Default implementation - can be overridden by subclasses
    process.env.JUPITER_TOOL_NAME = this.getToolName();
    process.env.JUPITER_SESSION_ID = this.sessionId;
    process.env.JUPITER_USER_ID = this.userId;
  }

  /**
   * Clear environment variables after hook execution
   */
  protected async clearHookEnvironment(): Promise<void> {
    // Clean up environment variables
    delete process.env.JUPITER_TOOL_NAME;
    // Keep session and user IDs as they might be needed elsewhere
  }

  /**
   * Get the tool name for hook matching
   */
  protected abstract getToolName(): string;

  /**
   * Execute the actual tool logic (to be implemented by subclasses)
   */
  protected abstract executeInternal(params: TInput): Promise<TOutput>;

  /**
   * Check if hooks are enabled for this tool
   */
  protected areHooksEnabled(): boolean {
    // Can be overridden to disable hooks for specific tools
    return true;
  }

  /**
   * Get session ID
   */
  protected getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Set session ID
   */
  setSessionId(sessionId: string): void {
    this.sessionId = sessionId;
  }

  /**
   * Get user ID
   */
  protected getUserId(): string {
    return this.userId;
  }

  /**
   * Set user ID
   */
  setUserId(userId: string): void {
    this.userId = userId;
  }
}