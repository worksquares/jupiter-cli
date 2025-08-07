/**
 * Permission System
 * Manages tool permission rules and workspace access control
 */

import { EventEmitter } from 'eventemitter3';
import * as fs from 'fs/promises';
import * as path from 'path';
import { minimatch } from 'minimatch';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../utils/logger';
import {
  PermissionRule,
  PermissionType,
  PermissionCheckResult,
  PermissionContext,
  PermissionSystemConfig,
  WorkspaceConfig,
  ToolPermissionBehavior,
  PermissionRuleSchema,
  CreatePermissionRuleSchema,
  DEFAULT_PERMISSION_RULES,
  ToolMetadata,
  ToolCategory
} from './permission-types';

/**
 * Permission system events
 */
interface PermissionSystemEvents {
  'rule:added': (rule: PermissionRule) => void;
  'rule:updated': (rule: PermissionRule) => void;
  'rule:removed': (ruleId: string) => void;
  'permission:denied': (context: PermissionContext, rule: PermissionRule) => void;
  'permission:granted': (context: PermissionContext, rule?: PermissionRule) => void;
  'workspace:updated': (config: WorkspaceConfig) => void;
}

/**
 * Permission system implementation
 */
export class PermissionSystem extends EventEmitter<PermissionSystemEvents> {
  private rules: Map<string, PermissionRule> = new Map();
  private config: Required<PermissionSystemConfig>;
  private workspace: WorkspaceConfig | null = null;
  private logger: Logger;
  private permissionCache: Map<string, PermissionCheckResult> = new Map();
  private readonly CACHE_TTL = 60000; // 1 minute
  private cacheCleanupInterval: NodeJS.Timeout | null = null;

  // Tool metadata registry
  private toolMetadata: Map<string, ToolMetadata> = new Map([
    ['read', { name: 'read', category: ToolCategory.FileSystem, riskLevel: 'low' }],
    ['write', { name: 'write', category: ToolCategory.FileSystem, riskLevel: 'medium', requiresWorkspace: true }],
    ['edit', { name: 'edit', category: ToolCategory.FileSystem, riskLevel: 'medium', requiresWorkspace: true }],
    ['multiEdit', { name: 'multiEdit', category: ToolCategory.FileSystem, riskLevel: 'medium', requiresWorkspace: true }],
    ['bash', { name: 'bash', category: ToolCategory.System, riskLevel: 'high', patternSupport: true }],
    ['webFetch', { name: 'webFetch', category: ToolCategory.Network, riskLevel: 'medium', patternSupport: true }],
    ['grep', { name: 'grep', category: ToolCategory.Analysis, riskLevel: 'low' }],
    ['glob', { name: 'glob', category: ToolCategory.Analysis, riskLevel: 'low' }],
    ['ls', { name: 'ls', category: ToolCategory.FileSystem, riskLevel: 'low' }],
    ['notebookRead', { name: 'notebookRead', category: ToolCategory.FileSystem, riskLevel: 'low' }],
    ['notebookEdit', { name: 'notebookEdit', category: ToolCategory.FileSystem, riskLevel: 'medium', requiresWorkspace: true }],
    ['task', { name: 'task', category: ToolCategory.System, riskLevel: 'high' }],
    ['backgroundBash', { name: 'backgroundBash', category: ToolCategory.System, riskLevel: 'high', patternSupport: true }]
  ]);

  constructor(config?: PermissionSystemConfig) {
    super();
    this.logger = new Logger('PermissionSystem');
    
    // Initialize config with defaults
    this.config = {
      defaultBehavior: config?.defaultBehavior || 'allow',
      enableWorkspaceMode: config?.enableWorkspaceMode ?? false,
      rulesFile: config?.rulesFile || path.join(process.cwd(), '.jupiter', 'permissions.json'),
      autoSave: config?.autoSave ?? true,
      cacheResults: config?.cacheResults ?? true
    };

    // Initialize default rules
    this.initializeDefaultRules();

    // Start cache cleanup
    if (this.config.cacheResults) {
      this.cacheCleanupInterval = setInterval(() => this.cleanupCache(), 30000);
    }
  }

  /**
   * Initialize default permission rules
   */
  private initializeDefaultRules(): void {
    DEFAULT_PERMISSION_RULES.forEach(ruleTemplate => {
      const rule: PermissionRule = {
        ...ruleTemplate,
        id: uuidv4(),
        created: new Date(),
        updated: new Date()
      };
      this.rules.set(rule.id, rule);
    });
  }

  /**
   * Check permission for tool usage
   */
  async checkPermission(context: PermissionContext): Promise<PermissionCheckResult> {
    // Check cache first
    if (this.config.cacheResults) {
      const cacheKey = this.getCacheKey(context);
      const cached = this.permissionCache.get(cacheKey);
      if (cached) {
        return cached;
      }
    }

    // Get tool metadata
    const toolMeta = this.toolMetadata.get(context.toolName);
    
    // Check workspace restrictions first
    if (this.config.enableWorkspaceMode && this.workspace && toolMeta?.requiresWorkspace) {
      const workspaceCheck = this.checkWorkspaceAccess(context);
      if (!workspaceCheck.allowed) {
        this.emit('permission:denied', context, workspaceCheck.rule!);
        return this.cacheResult(context, workspaceCheck);
      }
    }

    // Get applicable rules sorted by priority (higher priority first)
    const applicableRules = this.getApplicableRules(context);
    
    // Evaluate rules in priority order
    for (const rule of applicableRules) {
      if (!rule.enabled) continue;

      const matches = this.evaluateRule(rule, context);
      if (matches) {
        const result: PermissionCheckResult = {
          allowed: rule.type === PermissionType.Allow,
          rule,
          reason: rule.description || `Permission ${rule.type}ed by rule ${rule.id}`
        };

        // Emit event
        if (result.allowed) {
          this.emit('permission:granted', context, rule);
        } else {
          this.emit('permission:denied', context, rule);
        }

        return this.cacheResult(context, result);
      }
    }

    // Default behavior
    const defaultAllowed = this.config.defaultBehavior === 'allow';
    const result: PermissionCheckResult = {
      allowed: defaultAllowed,
      reason: `Default behavior: ${this.config.defaultBehavior}`
    };

    if (defaultAllowed) {
      this.emit('permission:granted', context);
    } else {
      this.emit('permission:denied', context, {} as PermissionRule);
    }

    return this.cacheResult(context, result);
  }

  /**
   * Get tool permission behavior
   */
  async getToolBehavior(toolName: string, parameters: any): Promise<ToolPermissionBehavior> {
    const context: PermissionContext = {
      toolName,
      parameters,
      userId: 'current-user',
      sessionId: 'current-session',
      workingDirectories: this.workspace ? 
        new Set([this.workspace.primaryDirectory, ...this.workspace.additionalDirectories]) : 
        new Set()
    };

    const result = await this.checkPermission(context);
    
    if (result.allowed) {
      return { behavior: 'allow', rule: result.rule };
    }

    // Check if there's an ask rule
    const askRule = this.findAskRule(toolName);
    if (askRule) {
      return {
        behavior: 'ask',
        message: askRule.description || `Tool ${toolName} requires user approval`,
        rule: askRule,
        suggestions: this.generateSuggestions(toolName, parameters)
      };
    }

    return {
      behavior: 'deny',
      message: result.reason || `Tool ${toolName} is not allowed`,
      rule: result.rule
    };
  }

  /**
   * Add a new permission rule
   */
  async addRule(input: z.infer<typeof CreatePermissionRuleSchema>): Promise<PermissionRule> {
    const validated = CreatePermissionRuleSchema.parse(input);
    
    const rule: PermissionRule = {
      id: uuidv4(),
      type: validated.type,
      toolName: validated.toolName,
      pattern: validated.pattern,
      description: validated.description,
      priority: validated.priority || this.getNextPriority(),
      enabled: validated.enabled ?? true,
      created: new Date(),
      updated: new Date(),
      source: 'user'
    };

    // Validate rule
    PermissionRuleSchema.parse(rule);
    
    this.rules.set(rule.id, rule);
    this.clearCache();
    
    this.emit('rule:added', rule);
    
    if (this.config.autoSave) {
      await this.saveRules();
    }

    this.logger.info(`Added permission rule: ${rule.id}`, { rule });
    return rule;
  }

  /**
   * Update an existing rule
   */
  async updateRule(ruleId: string, updates: Partial<PermissionRule>): Promise<PermissionRule> {
    const existing = this.rules.get(ruleId);
    if (!existing) {
      throw new Error(`Permission rule not found: ${ruleId}`);
    }

    if (existing.source === 'default') {
      throw new Error('Cannot update default permission rules');
    }

    const updated: PermissionRule = {
      ...existing,
      ...updates,
      id: existing.id, // Preserve ID
      created: existing.created, // Preserve creation date
      updated: new Date(),
      source: existing.source // Preserve source
    };

    // Validate updated rule
    PermissionRuleSchema.parse(updated);
    
    this.rules.set(ruleId, updated);
    this.clearCache();
    
    this.emit('rule:updated', updated);
    
    if (this.config.autoSave) {
      await this.saveRules();
    }

    this.logger.info(`Updated permission rule: ${ruleId}`, { updates });
    return updated;
  }

  /**
   * Remove a permission rule
   */
  async removeRule(ruleId: string): Promise<void> {
    const rule = this.rules.get(ruleId);
    if (!rule) {
      throw new Error(`Permission rule not found: ${ruleId}`);
    }

    if (rule.source === 'default') {
      throw new Error('Cannot remove default permission rules');
    }

    this.rules.delete(ruleId);
    this.clearCache();
    
    this.emit('rule:removed', ruleId);
    
    if (this.config.autoSave) {
      await this.saveRules();
    }

    this.logger.info(`Removed permission rule: ${ruleId}`);
  }

  /**
   * List all rules
   */
  listRules(filter?: { toolName?: string; type?: PermissionType; source?: string }): PermissionRule[] {
    let rules = Array.from(this.rules.values());

    if (filter) {
      if (filter.toolName) {
        rules = rules.filter(r => r.toolName === filter.toolName);
      }
      if (filter.type) {
        rules = rules.filter(r => r.type === filter.type);
      }
      if (filter.source) {
        rules = rules.filter(r => r.source === filter.source);
      }
    }

    // Sort by priority (descending) and creation date
    return rules.sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      return a.created.getTime() - b.created.getTime();
    });
  }

  /**
   * Set workspace configuration
   */
  async setWorkspace(config: WorkspaceConfig): Promise<void> {
    // Validate directories exist
    try {
      await fs.access(config.primaryDirectory);
      for (const dir of config.additionalDirectories) {
        await fs.access(dir);
      }
    } catch (error) {
      throw new Error(`Invalid workspace directory: ${error instanceof Error ? error.message : String(error)}`);
    }

    this.workspace = config;
    this.config.enableWorkspaceMode = true;
    this.clearCache();
    
    this.emit('workspace:updated', config);
    
    this.logger.info('Updated workspace configuration', { workspace: config });
  }

  /**
   * Clear workspace configuration
   */
  clearWorkspace(): void {
    this.workspace = null;
    this.config.enableWorkspaceMode = false;
    this.clearCache();
    
    this.logger.info('Cleared workspace configuration');
  }

  /**
   * Get workspace configuration
   */
  getWorkspace(): WorkspaceConfig | null {
    return this.workspace;
  }

  /**
   * Load rules from file
   */
  async loadRules(): Promise<void> {
    try {
      const data = await fs.readFile(this.config.rulesFile, 'utf-8');
      const parsed = JSON.parse(data);
      
      // Clear existing user rules
      for (const [id, rule] of this.rules.entries()) {
        if (rule.source === 'user') {
          this.rules.delete(id);
        }
      }

      // Load new rules
      if (parsed.rules && Array.isArray(parsed.rules)) {
        for (const ruleData of parsed.rules) {
          try {
            const rule: PermissionRule = {
              ...ruleData,
              created: new Date(ruleData.created),
              updated: new Date(ruleData.updated)
            };
            PermissionRuleSchema.parse(rule);
            this.rules.set(rule.id, rule);
          } catch (error) {
            this.logger.error(`Failed to load rule: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }

      // Load workspace config
      if (parsed.workspace) {
        this.workspace = parsed.workspace;
        this.config.enableWorkspaceMode = true;
      }

      this.clearCache();
      this.logger.info(`Loaded ${parsed.rules?.length || 0} rules from ${this.config.rulesFile}`);
    } catch (error) {
      if ((error as any).code !== 'ENOENT') {
        this.logger.error(`Failed to load rules: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  /**
   * Save rules to file
   */
  async saveRules(): Promise<void> {
    const userRules = this.listRules({ source: 'user' });
    
    const data = {
      version: '1.0',
      rules: userRules,
      workspace: this.workspace,
      savedAt: new Date().toISOString()
    };

    // Ensure directory exists
    const dir = path.dirname(this.config.rulesFile);
    await fs.mkdir(dir, { recursive: true });

    // Write file
    await fs.writeFile(this.config.rulesFile, JSON.stringify(data, null, 2));
    
    this.logger.info(`Saved ${userRules.length} rules to ${this.config.rulesFile}`);
  }

  /**
   * Get applicable rules for context
   */
  private getApplicableRules(context: PermissionContext): PermissionRule[] {
    return this.listRules()
      .filter(rule => {
        // Tool name must match
        if (rule.toolName !== '*' && rule.toolName !== context.toolName) {
          return false;
        }

        // Workspace rules apply when workspace mode is enabled
        if (rule.type === PermissionType.Workspace && !this.config.enableWorkspaceMode) {
          return false;
        }

        return true;
      });
  }

  /**
   * Evaluate if rule matches context
   */
  private evaluateRule(rule: PermissionRule, context: PermissionContext): boolean {
    // Tool name check (already filtered in getApplicableRules)
    if (rule.toolName !== '*' && rule.toolName !== context.toolName) {
      return false;
    }

    // Pattern matching
    if (rule.pattern) {
      const toolMeta = this.toolMetadata.get(context.toolName);
      if (!toolMeta?.patternSupport) {
        return false;
      }

      return this.matchPattern(rule.pattern, context);
    }

    // Workspace type rules
    if (rule.type === PermissionType.Workspace) {
      return true; // Already checked in checkWorkspaceAccess
    }

    return true;
  }

  /**
   * Match pattern against context
   */
  private matchPattern(pattern: string, context: PermissionContext): boolean {
    const { toolName, parameters } = context;

    // Special patterns
    if (pattern.startsWith('domain:') && toolName === 'webFetch') {
      const domain = pattern.substring(7);
      const url = parameters.url;
      if (url && typeof url === 'string') {
        try {
          const parsed = new URL(url);
          return parsed.hostname.includes(domain);
        } catch {
          return false;
        }
      }
    }

    // Command pattern for bash
    if ((toolName === 'bash' || toolName === 'backgroundBash') && parameters.command) {
      const command = String(parameters.command);
      
      // Exact match
      if (command === pattern) return true;
      
      // Glob match
      if (pattern.includes('*') || pattern.includes('?')) {
        return minimatch(command, pattern);
      }
      
      // Substring match
      return command.includes(pattern);
    }

    // File path patterns
    if (parameters.file_path || parameters.path) {
      const filePath = String(parameters.file_path || parameters.path);
      return minimatch(filePath, pattern);
    }

    return false;
  }

  /**
   * Check workspace access
   */
  private checkWorkspaceAccess(context: PermissionContext): PermissionCheckResult {
    if (!this.workspace) {
      return { allowed: true };
    }

    const toolMeta = this.toolMetadata.get(context.toolName);
    if (!toolMeta?.requiresWorkspace) {
      return { allowed: true };
    }

    // Get file path from parameters
    const filePath = context.parameters.file_path || 
                    context.parameters.path || 
                    context.parameters.notebook_path;
    
    if (!filePath || typeof filePath !== 'string') {
      return { allowed: true }; // No path to check
    }

    // Normalize path
    const normalizedPath = path.resolve(filePath);

    // Check against workspace directories
    const allowedDirs = [
      this.workspace.primaryDirectory,
      ...this.workspace.additionalDirectories
    ];

    const isInWorkspace = allowedDirs.some(dir => {
      const normalizedDir = path.resolve(dir);
      if (this.workspace!.allowSubdirectories) {
        return normalizedPath.startsWith(normalizedDir);
      } else {
        return path.dirname(normalizedPath) === normalizedDir;
      }
    });

    // Check exclude patterns
    if (isInWorkspace && this.workspace.excludePatterns.length > 0) {
      const isExcluded = this.workspace.excludePatterns.some(pattern => 
        minimatch(normalizedPath, pattern)
      );
      
      if (isExcluded) {
        return {
          allowed: false,
          reason: `Path matches exclude pattern`
        };
      }
    }

    if (!isInWorkspace) {
      return {
        allowed: false,
        rule: {
          id: 'workspace-restriction',
          type: PermissionType.Workspace,
          toolName: context.toolName,
          description: 'File operations restricted to workspace directories',
          priority: 9999,
          enabled: true,
          created: new Date(),
          updated: new Date(),
          source: 'system'
        },
        reason: `Path ${normalizedPath} is outside workspace directories`
      };
    }

    return { allowed: true };
  }

  /**
   * Find ask rule for tool
   */
  private findAskRule(toolName: string): PermissionRule | undefined {
    // In future, we could have specific "ask" type rules
    // For now, return undefined
    return undefined;
  }

  /**
   * Generate suggestions for tool usage
   */
  private generateSuggestions(toolName: string, parameters: any): string[] {
    const suggestions: string[] = [];
    
    if (toolName === 'bash' || toolName === 'backgroundBash') {
      suggestions.push(
        'Consider if this command modifies important files',
        'Check if the command has been tested',
        'Verify the command parameters are correct'
      );
    } else if (toolName === 'write' || toolName === 'edit') {
      suggestions.push(
        'Ensure the file path is correct',
        'Consider backing up the file first',
        'Check if this will overwrite existing content'
      );
    }

    return suggestions;
  }

  /**
   * Get next available priority
   */
  private getNextPriority(): number {
    const rules = Array.from(this.rules.values());
    const maxPriority = Math.max(...rules.map(r => r.priority), 0);
    return maxPriority + 10;
  }

  /**
   * Get cache key for context
   */
  private getCacheKey(context: PermissionContext): string {
    return `${context.toolName}:${JSON.stringify(context.parameters)}`;
  }

  /**
   * Cache result
   */
  private cacheResult(context: PermissionContext, result: PermissionCheckResult): PermissionCheckResult {
    if (this.config.cacheResults) {
      const key = this.getCacheKey(context);
      this.permissionCache.set(key, result);
      
      // Set TTL
      setTimeout(() => {
        this.permissionCache.delete(key);
      }, this.CACHE_TTL);
    }
    return result;
  }

  /**
   * Clear cache
   */
  private clearCache(): void {
    this.permissionCache.clear();
  }

  /**
   * Cleanup expired cache entries
   */
  private cleanupCache(): void {
    // In this implementation, we use setTimeout for each entry
    // So no cleanup needed here
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    if (this.cacheCleanupInterval) {
      clearInterval(this.cacheCleanupInterval);
    }
    this.clearCache();
    this.removeAllListeners();
  }
}