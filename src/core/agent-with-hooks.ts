/**
 * Jupiter Agent with Hook Support
 * Extends the base agent to integrate hook execution throughout the lifecycle
 */

import { Agent } from './agent';
import { AgentConfig, Task, TaskResult } from './types';
import { TaskType, MemoryType } from './unified-types';
import { JupiterHookManager } from '../hooks/hook-manager';
import { HookEventType, HookExecutionContext, HookConfiguration, HookPermissionLevel } from '../hooks/types';
import { HookAwareWriteAdapter } from '../tools/adapters/hook-aware/write-adapter';
import { HookAwareEditAdapter } from '../tools/adapters/hook-aware/edit-adapter';
import { HookAwareMultiEditAdapter } from '../tools/adapters/hook-aware/multiedit-adapter';
import { HookAwareNotebookEditAdapter } from '../tools/adapters/hook-aware/notebook-edit-adapter';
import { Logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export interface AgentWithHooksConfig extends AgentConfig {
  hooks?: {
    enabled?: boolean;
    permissionLevel?: HookPermissionLevel;
    storageFile?: string;
  };
}

export class JupiterAgentWithHooks extends Agent {
  private hookManager: JupiterHookManager;
  private sessionId: string;
  private sessionStarted: boolean = false;
  private hookLogger: Logger;

  constructor(config: AgentWithHooksConfig) {
    super(config);
    
    // Initialize logger
    this.hookLogger = new Logger('AgentWithHooks');
    
    // Initialize hook manager
    this.hookManager = new JupiterHookManager({
      permissionLevel: config.hooks?.permissionLevel || HookPermissionLevel.WithWarning,
      storageConfig: {
        storageType: 'file',
        filePath: config.hooks?.storageFile || '.jupiter/hooks.json',
        autoSave: true
      }
    });

    // Generate session ID
    this.sessionId = uuidv4();

    // Initialize hook-aware tools if hooks are enabled
    if (config.hooks?.enabled !== false) {
      this.initializeHookAwareTools();
    }
  }

  /**
   * Initialize hook-aware tool adapters
   */
  private initializeHookAwareTools(): void {
    // Replace standard tool adapters with hook-aware versions
    const writeAdapter = new HookAwareWriteAdapter(this.hookManager);
    writeAdapter.setSessionId(this.sessionId);
    writeAdapter.setUserId(this.config.id || 'user');
    this.tools.set('Write', writeAdapter);
    this.tools.set('write', writeAdapter); // Support lowercase alias

    const editAdapter = new HookAwareEditAdapter(this.hookManager);
    editAdapter.setSessionId(this.sessionId);
    editAdapter.setUserId(this.config.id || 'user');
    this.tools.set('Edit', editAdapter);
    this.tools.set('edit', editAdapter);

    const multiEditAdapter = new HookAwareMultiEditAdapter(this.hookManager);
    multiEditAdapter.setSessionId(this.sessionId);
    multiEditAdapter.setUserId(this.config.id || 'user');
    this.tools.set('MultiEdit', multiEditAdapter);
    this.tools.set('multiEdit', multiEditAdapter);

    const notebookEditAdapter = new HookAwareNotebookEditAdapter(this.hookManager);
    notebookEditAdapter.setSessionId(this.sessionId);
    notebookEditAdapter.setUserId(this.config.id || 'user');
    this.tools.set('NotebookEdit', notebookEditAdapter);
    this.tools.set('notebookEdit', notebookEditAdapter);

    this.hookLogger.info('Initialized hook-aware tool adapters');
  }

  /**
   * Start a new session with hook support
   */
  async initialize(): Promise<void> {
    await super.initialize();

    if (!this.sessionStarted) {
      // Execute SessionStart hooks
      await this.executeSessionStartHooks('startup');
      this.sessionStarted = true;
    }
  }

  /**
   * Process user prompt with hook support
   */
  async processUserPrompt(prompt: string): Promise<string> {
    // Execute UserPromptSubmit hooks
    const context: HookExecutionContext = {
      eventType: HookEventType.UserPromptSubmit,
      sessionId: this.sessionId,
      userId: this.config.id || 'user',
      timestamp: new Date(),
      metadata: { prompt }
    };

    const results = await this.hookManager.executeHooks(context);

    // Check if any hook blocked the prompt
    const blockingHook = results.find(r => r.blocked);
    if (blockingHook) {
      // Exit code 2 blocks processing and shows stderr to user
      throw new Error(blockingHook.stderr || 'Prompt blocked by hook');
    }

    // Add any hook stdout to the prompt context
    let enhancedPrompt = prompt;
    for (const result of results) {
      if (result.success && result.stdout) {
        enhancedPrompt = `${result.stdout}\n\n${enhancedPrompt}`;
      }
    }

    return enhancedPrompt;
  }

  /**
   * Process a task with hook integration
   */
  async processTask(task: Task): Promise<TaskResult> {
    // Process the task
    const result = await super.processTask(task);

    // After task completion, check if we should execute Stop hooks
    if (this.shouldExecuteStopHooks(task)) {
      await this.executeStopHooks(task);
    }

    return result;
  }

  /**
   * Execute session start hooks
   */
  private async executeSessionStartHooks(source: 'startup' | 'resume' | 'clear' | 'compact'): Promise<void> {
    const context: HookExecutionContext = {
      eventType: HookEventType.SessionStart,
      sessionId: this.sessionId,
      userId: this.config.id || 'user',
      timestamp: new Date(),
      metadata: { source }
    };

    const results = await this.hookManager.executeHooks(context);

    // Add any hook stdout to agent context
    for (const result of results) {
      if (result.success && result.stdout) {
        // Store in memory for agent context
        await this.memory.store({
          id: uuidv4(),
          type: MemoryType.SEMANTIC,
          content: {
            source: 'SessionStartHook',
            data: result.stdout
          },
          timestamp: new Date(),
          accessCount: 0,
          lastAccessed: new Date(),
          importance: 0.6,
          associations: ['hook', 'session-start']
        });
      }
    }
  }

  /**
   * Execute stop hooks
   */
  private async executeStopHooks(task?: Task): Promise<void> {
    const context: HookExecutionContext = {
      eventType: HookEventType.Stop,
      sessionId: this.sessionId,
      userId: this.config.id || 'user',
      timestamp: new Date(),
      metadata: { task }
    };

    const results = await this.hookManager.executeHooks(context);

    // Process stop hook results
    for (const result of results) {
      if (result.exitCode === 2 && result.stderr) {
        // Show to model and continue conversation
        this.hookLogger.info(`Stop hook feedback: ${result.stderr}`);
        // TODO: Feed this back into the conversation
      }
    }
  }

  /**
   * Execute pre-compact hooks
   */
  async executePreCompactHooks(trigger: 'manual' | 'auto', details: any): Promise<string | null> {
    const context: HookExecutionContext = {
      eventType: HookEventType.PreCompact,
      sessionId: this.sessionId,
      userId: this.config.id || 'user',
      timestamp: new Date(),
      metadata: { trigger, ...details }
    };

    const results = await this.hookManager.executeHooks(context);

    // Check if any hook blocked compaction
    const blockingHook = results.find(r => r.blocked);
    if (blockingHook) {
      throw new Error(blockingHook.stderr || 'Compaction blocked by hook');
    }

    // Collect custom compact instructions
    const instructions: string[] = [];
    for (const result of results) {
      if (result.success && result.stdout) {
        instructions.push(result.stdout);
      }
    }

    return instructions.length > 0 ? instructions.join('\n') : null;
  }

  /**
   * Determine if we should execute stop hooks
   */
  private shouldExecuteStopHooks(task: Task): boolean {
    // Execute stop hooks at the end of major task completions
    // This is a simplified heuristic - could be made more sophisticated
    return task.type === TaskType.CODE_GENERATION || 
           task.type === TaskType.REFACTORING ||
           task.priority === 'high';
  }

  /**
   * Hook management methods
   */

  async registerHook(config: Omit<HookConfiguration, 'id' | 'created' | 'updated'>): Promise<HookConfiguration> {
    return this.hookManager.registerHook(config);
  }

  async removeHook(hookId: string): Promise<void> {
    return this.hookManager.removeHook(hookId);
  }

  async updateHook(hookId: string, updates: Partial<HookConfiguration>): Promise<HookConfiguration> {
    return this.hookManager.updateHook(hookId, updates);
  }

  async listHooks(): Promise<HookConfiguration[]> {
    return this.hookManager.listHooks();
  }

  async getHooksForEvent(eventType: HookEventType): Promise<HookConfiguration[]> {
    return this.hookManager.getHooksForEvent(eventType);
  }

  async validateAllHooks(): Promise<Map<string, any>> {
    return this.hookManager.validateAllHooks();
  }

  async clearAllHooks(): Promise<void> {
    return this.hookManager.clearAllHooks();
  }

  setHookPermissionLevel(level: HookPermissionLevel): void {
    this.hookManager.setPermissionLevel(level);
  }

  getHookPermissionLevel(): HookPermissionLevel {
    return this.hookManager.getPermissionLevel();
  }

  /**
   * Get available tool names for hook configuration
   */
  getAvailableToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Shutdown the agent
   */
  async shutdown(): Promise<void> {
    // Execute stop hooks before shutdown
    if (this.sessionStarted) {
      await this.executeStopHooks();
    }

    await super.shutdown();
  }
}