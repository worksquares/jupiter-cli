/**
 * Intelligent Agent System - Main Entry Point
 */

// Core exports
export * from './core/types';
export { Agent } from './core/agent';
export { Analyzer } from './core/analyzer';
export { Planner } from './core/planner';
export { BaseExecutor } from './core/base-executor';
export { Executor } from './core/executor';
export { ToolBatcher, BatchableToolCall, BatchExecutionResult, BatchExecutionOptions } from './core/tool-batcher';
export { JupiterAgentWithHooks } from './core/agent-with-hooks';

// Memory exports
export { MemorySystem } from './memory/memory-system';

// Learning exports
export { LearningEngine } from './learning/learning-engine';

// Prompt exports
export { PromptBuilder } from './prompts/prompt-builder';

// Tool exports
export { BaseToolAdapter } from './tools/base-adapter';
export * from './tools/adapters';
export { HookAwareToolAdapter } from './tools/hook-aware-adapter';
export { PermissionAwareAdapter, PermissionAwareToolRegistry, createPermissionAwareAdapter } from './tools/permission-aware-adapter';
export { MCPToolAdapter, MCPToolRegistry } from './tools/adapters/mcp-tool-adapter';
export { WebFetchAdapter } from './tools/adapters/webfetch-adapter';
export { BackgroundBashAdapter } from './tools/adapters/background-bash-adapter';

// Hook System exports
export * from './hooks/types';
export { JupiterHookManager } from './hooks/hook-manager';
export { HookSecurityValidator } from './hooks/security-validator';

// MCP System exports
export * from './mcp/types';
export { MCPManager } from './mcp/mcp-manager';
export { STDIOMCPClient } from './mcp/clients/stdio-client';
export { HTTPMCPClient } from './mcp/clients/http-client';

// Conversation Management exports
export * from './conversation/types';
export { ConversationManager } from './conversation/conversation-manager';

// Rate Limiting exports
export * from './rate-limiting/types';
export { RateLimiter } from './rate-limiting/rate-limiter';
export { GlobalRateLimitManager, globalRateLimitManager } from './rate-limiting/global-rate-limit-manager';

// Security exports
export * from './security/permission-types';
export { PermissionSystem } from './security/permission-system';

// Shell Management exports
export * from './shells/types';
export { BackgroundShellManager } from './shells/shell-manager';

// Settings exports
export { SettingsManager } from './settings/settings-manager';

// Command System exports
export * from './commands/types';
export { CommandRegistry } from './commands/command-registry';
export { BashesCommand } from './commands/bashes-command';
export { PermissionsCommand } from './commands/permissions-command';
export { VimCommand, EditorModeManager } from './commands/vim-command';

// Utility exports
export { Logger } from './utils/logger';
export { PerformanceOptimizer } from './utils/performance-optimizer';
export { SecurityValidator } from './utils/security-validator';

// API exports
export { APIServer } from './api/server';

// Database exports
export { JupiterDBClient, createDBClient, getDBClient } from './database/jupiter-db-client';
export * from './database/models/jupiter-project';
export * from './database/models/jupiter-user';
export * from './database/models/jupiter-agent';
export * from './database/models/jupiter-deployment';
export * from './database/aci-queries';

// Services exports
export { ProjectManager } from './services/project-manager';
export { GitHubService } from './services/github-service';
export { ACILifecycleManager } from './services/aci-lifecycle-manager';

// Azure exports
export { AzureContainerManager } from './azure/aci-manager';
export { ACIGitManager } from './azure/aci-git-manager';
export { ACIDomainManager } from './azure/aci-domain-manager';

export { Tools } from './core/tools';
export { buildPrompt, AGENT_PROMPTS, SYSTEM_PROMPT, AGENT_SYSTEM_PROMPTS } from './core/prompts';

// Default export - create and initialize agent
import { Agent } from './core/agent';
import { AgentConfig } from './core/types';
import { allAdapters } from './tools/adapters';

export async function createAgent(config?: Partial<AgentConfig>): Promise<Agent> {
  const defaultConfig: AgentConfig = {
    name: 'Intelligent Agent',
    capabilities: ['general-purpose'],
    tools: allAdapters.map(a => a.name),
    memory: {
      maxMemories: 10000,
      consolidationInterval: 3600000,
      importanceThreshold: 0.3,
      retentionPolicy: {
        type: RetentionType.HYBRID,
        duration: 7 * 24 * 60 * 60 * 1000,
        maxCount: 5000,
        importanceThreshold: 0.5
      }
    },
    learning: {
      enabled: true,
      learningRate: 0.1,
      minConfidence: 0.6,
      maxPatterns: 1000,
      evaluationInterval: 300000
    },
    performance: {
      maxConcurrentTasks: 10,
      taskTimeout: 300000,
      cacheSize: 1000,
      batchSize: 10,
      prefetchEnabled: true
    },
    security: {
      sandboxed: false,
      allowedTools: [],
      deniedTools: [],
      maxFileSize: 10 * 1024 * 1024,
      allowedFileTypes: []
    },
    ...config
  };

  const agent = new Agent(defaultConfig);
  await agent.initialize();

  // Register all tools
  for (const adapter of allAdapters) {
    // Set agent reference for adapters that need it
    if ('setAgent' in adapter && typeof adapter.setAgent === 'function') {
      adapter.setAgent(agent);
    }
    agent.registerTool(adapter);
  }

  return agent;
}

// Import RetentionType
import { RetentionType } from './core/types';