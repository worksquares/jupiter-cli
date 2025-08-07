/**
 * Permission-Aware Tool Adapter
 * Wraps tool adapters with permission checking
 */

import { BaseToolAdapter } from './base-adapter';
import { PermissionSystem } from '../security/permission-system';
import { PermissionContext, ToolPermissionBehavior } from '../security/permission-types';
import { Logger } from '../utils/logger';
import { EventEmitter } from 'eventemitter3';

/**
 * Permission events
 */
interface PermissionEvents {
  'permission:granted': (tool: string, parameters: any) => void;
  'permission:denied': (tool: string, parameters: any, reason: string) => void;
  'permission:asked': (tool: string, parameters: any, approved: boolean) => void;
}

/**
 * User consent callback
 */
export type UserConsentCallback = (
  tool: string,
  parameters: any,
  message: string,
  suggestions: string[]
) => Promise<boolean>;

/**
 * Permission-aware tool adapter
 */
export class PermissionAwareAdapter<TInput = any, TOutput = any> extends BaseToolAdapter<TInput, TOutput> {
  protected logger: Logger;
  private eventEmitter: EventEmitter<PermissionEvents>;
  private userConsentCallback?: UserConsentCallback;

  // Implement abstract properties
  name: string;
  description: string;
  parameters: Record<string, any>;

  constructor(
    private wrappedAdapter: BaseToolAdapter<TInput, TOutput>,
    private permissionSystem: PermissionSystem,
    private userId: string = 'current-user',
    private sessionId: string = 'current-session'
  ) {
    super();
    this.logger = new Logger(`PermissionAware:${wrappedAdapter.name}`);
    this.eventEmitter = new EventEmitter();

    // Copy properties from wrapped adapter
    this.name = wrappedAdapter.name;
    this.description = wrappedAdapter.description;
    this.parameters = wrappedAdapter.parameters;
  }

  /**
   * Set user consent callback
   */
  setUserConsentCallback(callback: UserConsentCallback): void {
    this.userConsentCallback = callback;
  }

  /**
   * Execute with permission checking
   */
  async execute(params: TInput): Promise<TOutput> {
    // Create permission context
    const context: PermissionContext = {
      toolName: this.name,
      parameters: params as any,
      userId: this.userId,
      sessionId: this.sessionId,
      workingDirectories: this.getWorkingDirectories()
    };

    // Get tool behavior
    const behavior = await this.permissionSystem.getToolBehavior(this.name, params);

    switch (behavior.behavior) {
      case 'allow':
        return this.executeAllowed(params, behavior);

      case 'deny':
        return this.executeDenied(params, behavior);

      case 'ask':
        return this.executeAsk(params, behavior);

      default:
        this.error('Unknown permission behavior', 'PERMISSION_ERROR');
    }
  }

  /**
   * Execute allowed tool
   */
  private async executeAllowed(params: TInput, behavior: ToolPermissionBehavior): Promise<TOutput> {
    this.logger.debug(`Permission granted for ${this.name}`, { params });
    this.eventEmitter.emit('permission:granted', this.name, params);

    try {
      return await this.wrappedAdapter.execute(params);
    } catch (error) {
      // Re-throw the error as-is
      throw error;
    }
  }

  /**
   * Execute denied tool
   */
  private async executeDenied(params: TInput, behavior: ToolPermissionBehavior): Promise<TOutput> {
    const reason = behavior.message || `Tool ${this.name} is not allowed`;
    
    this.logger.warn(`Permission denied for ${this.name}: ${reason}`, { params });
    this.eventEmitter.emit('permission:denied', this.name, params, reason);

    throw new Error(reason);
  }

  /**
   * Execute tool requiring user consent
   */
  private async executeAsk(params: TInput, behavior: ToolPermissionBehavior): Promise<TOutput> {
    const message = behavior.message || `Tool ${this.name} requires approval`;
    const suggestions = behavior.suggestions || [];

    this.logger.info(`Asking user consent for ${this.name}`, { params, message });

    // Check if we have a consent callback
    if (!this.userConsentCallback) {
      this.logger.warn('No user consent callback set, denying by default');
      this.eventEmitter.emit('permission:asked', this.name, params, false);
      throw new Error('User consent required but no callback configured');
    }

    // Ask for user consent
    let approved: boolean;
    try {
      approved = await this.userConsentCallback(this.name, params, message, suggestions);
    } catch (error) {
      this.logger.error('Error getting user consent', error);
      approved = false;
    }

    this.eventEmitter.emit('permission:asked', this.name, params, approved);

    if (approved) {
      this.logger.info(`User approved ${this.name}`, { params });
      return this.executeAllowed(params, behavior);
    } else {
      this.logger.info(`User denied ${this.name}`, { params });
      throw new Error('User denied permission');
    }
  }

  /**
   * Get working directories from environment or config
   */
  private getWorkingDirectories(): Set<string> {
    const dirs = new Set<string>();
    
    // Add current working directory
    dirs.add(process.cwd());

    // Add workspace directories if configured
    const workspace = this.permissionSystem.getWorkspace();
    if (workspace) {
      dirs.add(workspace.primaryDirectory);
      workspace.additionalDirectories.forEach(dir => dirs.add(dir));
    }

    // Add any additional directories from environment
    const envDirs = process.env.JUPITER_WORKING_DIRS;
    if (envDirs) {
      envDirs.split(',').forEach(dir => dirs.add(dir.trim()));
    }

    return dirs;
  }

  /**
   * Validate parameters
   */
  validate?(params: any): boolean {
    return this.wrappedAdapter.validate ? this.wrappedAdapter.validate(params) : true;
  }

  /**
   * Get wrapped adapter
   */
  getWrappedAdapter(): BaseToolAdapter<TInput, TOutput> {
    return this.wrappedAdapter;
  }

  /**
   * Subscribe to permission events
   */
  on<K extends keyof PermissionEvents>(
    event: K,
    listener: PermissionEvents[K]
  ): void {
    this.eventEmitter.on(event, listener as any);
  }

  /**
   * Unsubscribe from permission events
   */
  off<K extends keyof PermissionEvents>(
    event: K,
    listener: PermissionEvents[K]
  ): void {
    this.eventEmitter.off(event, listener as any);
  }

  /**
   * Get permission statistics
   */
  getStatistics(): {
    granted: number;
    denied: number;
    asked: number;
    approvedByUser: number;
  } {
    // In a real implementation, we would track these
    return {
      granted: 0,
      denied: 0,
      asked: 0,
      approvedByUser: 0
    };
  }
}

/**
 * Create permission-aware adapter factory
 */
export function createPermissionAwareAdapter<TInput = any, TOutput = any>(
  adapter: BaseToolAdapter<TInput, TOutput>,
  permissionSystem: PermissionSystem,
  userId?: string,
  sessionId?: string
): PermissionAwareAdapter<TInput, TOutput> {
  return new PermissionAwareAdapter(adapter, permissionSystem, userId, sessionId);
}

/**
 * Permission-aware tool registry
 */
export class PermissionAwareToolRegistry {
  private tools: Map<string, PermissionAwareAdapter> = new Map();
  private logger: Logger;

  constructor(
    private permissionSystem: PermissionSystem,
    private userId: string = 'current-user',
    private sessionId: string = 'current-session'
  ) {
    this.logger = new Logger('PermissionAwareToolRegistry');
  }

  /**
   * Register a tool with permission checking
   */
  registerTool(adapter: BaseToolAdapter): void {
    const permissionAware = createPermissionAwareAdapter(
      adapter,
      this.permissionSystem,
      this.userId,
      this.sessionId
    );

    this.tools.set(adapter.name, permissionAware);
    this.logger.info(`Registered permission-aware tool: ${adapter.name}`);
  }

  /**
   * Get tool by name
   */
  getTool(name: string): PermissionAwareAdapter | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all tools
   */
  getAllTools(): PermissionAwareAdapter[] {
    return Array.from(this.tools.values());
  }

  /**
   * Set user consent callback for all tools
   */
  setUserConsentCallback(callback: UserConsentCallback): void {
    this.tools.forEach(tool => {
      tool.setUserConsentCallback(callback);
    });
  }

  /**
   * Get permission statistics for all tools
   */
  getStatistics(): Map<string, ReturnType<PermissionAwareAdapter['getStatistics']>> {
    const stats = new Map();
    
    this.tools.forEach((tool, name) => {
      stats.set(name, tool.getStatistics());
    });

    return stats;
  }
}