/**
 * Core Intelligent Agent implementation
 */

import { EventEmitter } from 'eventemitter3';
import { v4 as uuidv4 } from 'uuid';
import { LearningEventType } from './unified-types';
import {
  AgentInterface,
  AgentConfig,
  AgentEvent,
  AgentEventType,
  AgentError,
  ErrorCode,
  Capability,
  Task,
  TaskResult,
  Tool,
  ToolResult,
  MemoryInterface,
  MemoryQuery,
  MemoryType,
  Memory,
  LearningEvent,
  AgentCapability
} from './types';
import { MemorySystem } from '../memory/memory-system';
import { Analyzer } from './analyzer';
import { Planner } from './planner';
import { Executor } from './executor';
import { LearningEngine } from '../learning/learning-engine';
import { PerformanceOptimizer } from '../utils/performance-optimizer';
import { SecurityValidator } from '../utils/security-validator';
import { Logger } from '../utils/logger';
import { AIProvider } from '../providers/ai-provider';
import { AIProviderFactory } from '../providers/provider-factory';
import { EnhancedPromptBuilder } from './enhanced-prompts';
import { OutputModeManager } from './output-mode';
import { MCPServerManager } from './mcp-server';
import { FrequentlyModifiedAnalyzer } from './frequently-modified';

export class Agent implements AgentInterface {
  public readonly id: string;
  public readonly name: string;
  public readonly capabilities: Map<string, Capability>;
  public readonly memory: MemoryInterface;
  public readonly tools: Map<string, Tool>;
  public readonly eventBus: EventEmitter;
  public readonly config: AgentConfig;
  
  // Required by AgentInterface
  public readonly analyzer: Analyzer;
  public readonly planner: Planner;
  public readonly executor: Executor;
  public readonly learner: LearningEngine;
  public readonly optimizer: PerformanceOptimizer;
  public readonly errorHandler: any; // ErrorHandler
  public readonly securityValidator: SecurityValidator;
  public aiProvider?: AIProvider;

  private readonly logger: Logger;
  private initialized: boolean = false;
  private activeTasks: Map<string, Task> = new Map();
  private promptBuilder = new EnhancedPromptBuilder();
  private outputModeManager = new OutputModeManager();
  private mcpServerManager = new MCPServerManager();
  private freqModifiedAnalyzer = new FrequentlyModifiedAnalyzer();
  private statistics = {
    tasksExecuted: 0,
    successfulTasks: 0,
    failedTasks: 0,
    totalDuration: 0
  };

  constructor(config: AgentConfig) {
    this.id = config.id || uuidv4();
    this.name = config.name;
    this.config = config;
    this.capabilities = new Map();
    this.tools = new Map();
    this.eventBus = new EventEmitter();
    this.logger = new Logger(`Agent:${this.name}`);

    // Initialize core components with defaults
    this.memory = new MemorySystem(config.memory || {
      importanceThreshold: 0.7,
      maxMemories: 1000,
      consolidationInterval: 3600000 // 1 hour
    });
    this.analyzer = new Analyzer(this);
    this.planner = new Planner(this);
    this.executor = new Executor(this);
    this.learner = new LearningEngine(this, config.learning || {
      enabled: true,
      learningRate: 0.1,
      minConfidence: 0.7,
      maxPatterns: 100,
      evaluationInterval: 3600000 // 1 hour
    });
    this.optimizer = new PerformanceOptimizer(config.performance || {
      maxConcurrentTasks: 5,
      taskTimeout: 30000,
      cacheSize: 100,
      batchSize: 10,
      prefetchEnabled: true
    });
    this.securityValidator = new SecurityValidator(config.security || {
      sandboxed: true,
      allowedTools: [],
      deniedTools: [],
      maxFileSize: 10 * 1024 * 1024, // 10MB
      allowedFileTypes: ['*']
    });
    this.errorHandler = { handleError: (error: Error) => this.logger.error('Error:', error) };

    // Setup capabilities
    this.setupCapabilities();
    this.setupTools();
    this.setupEventListeners();
  }

  /**
   * Initialize the agent and all its components
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      this.logger.warn('Agent already initialized');
      return;
    }

    try {
      this.logger.info('Initializing Intelligent Agent...');

      // Initialize AI provider
      this.aiProvider = await AIProviderFactory.getDefaultProvider();
      this.logger.info(`Using AI provider: ${this.aiProvider.name}`);

      // Initialize memory system
      await this.memory.store({
        id: uuidv4(),
        type: MemoryType.SEMANTIC,
        content: {
          event: 'agent_initialized',
          agentId: this.id,
          config: this.config,
          timestamp: new Date()
        },
        timestamp: new Date(),
        accessCount: 0,
        lastAccessed: new Date(),
        importance: 0.8,
        associations: []
      });

      // Initialize learning engine
      await this.learner.initialize();

      // Start background processes
      this.startBackgroundProcesses();

      this.initialized = true;
      this.emit(AgentEventType.INITIALIZED, {});
      this.logger.info('Agent initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize agent', error);
      throw new AgentError('Agent initialization failed', ErrorCode.INITIALIZATION_ERROR, error);
    }
  }

  /**
   * Process a task
   */
  async processTask(task: Task): Promise<TaskResult> {
    if (!this.initialized) {
      throw new AgentError('Agent not initialized', ErrorCode.NOT_INITIALIZED);
    }

    this.activeTasks.set(task.id, task);
    this.emit(AgentEventType.TASK_STARTED, { task });

    try {
      // Analyze task
      const analysis = await this.analyzer.analyze(task);
      
      // Plan execution
      const plan = await this.planner.createPlan(task, analysis);
      
      // Execute plan
      const result = await this.executor.execute(task, plan);
      
      // Learn from execution
      await this.learner.process({
        id: uuidv4(),
        type: LearningEventType.TASK_EXECUTION,
        taskId: task.id,
        success: result.success,
        data: {
          task,
          analysis,
          plan,
          result
        },
        timestamp: new Date(),
        metadata: {
          duration: Date.now() - task.createdAt.getTime(),
          toolsUsed: plan.steps.filter(s => s.action.tool).map(s => s.action.tool!)
        }
      });

      // Store result in memory
      await this.memory.store({
        id: uuidv4(),
        type: MemoryType.EPISODIC,
        content: {
          taskId: task.id,
          result,
          timestamp: new Date()
        },
        timestamp: new Date(),
        accessCount: 0,
        lastAccessed: new Date(),
        importance: result.success ? 0.7 : 0.9,
        associations: [task.id]
      });

      this.activeTasks.delete(task.id);
      this.emit(AgentEventType.TASK_COMPLETED, { task, result });
      
      // Update statistics
      this.statistics.tasksExecuted++;
      this.statistics.successfulTasks++;
      this.statistics.totalDuration += (Date.now() - task.createdAt.getTime());
      
      return result;
    } catch (error) {
      this.activeTasks.delete(task.id);
      
      const errorResult: TaskResult = {
        success: false,
        error: error as Error,
        data: null,
        metadata: {
          errorType: error instanceof Error ? error.name : 'UnknownError',
          errorMessage: error instanceof Error ? error.message : String(error)
        }
      };

      this.emit(AgentEventType.TASK_FAILED, { task, error: error instanceof Error ? error : new Error(String(error)) });
      
      // Learn from failure
      await this.learner.process({
        id: uuidv4(),
        type: LearningEventType.ERROR_RECOVERY,
        taskId: task.id,
        success: false,
        data: {
          task,
          error: errorResult.error
        },
        timestamp: new Date(),
        metadata: {
          errorType: errorResult.metadata?.errorType
        }
      });

      // Update statistics
      this.statistics.tasksExecuted++;
      this.statistics.failedTasks++;
      this.statistics.totalDuration += (Date.now() - task.createdAt.getTime());

      return errorResult;
    }
  }

  /**
   * Generate code using AI provider
   */
  async generateCode(prompt: string, language?: string): Promise<string> {
    if (!this.aiProvider) {
      throw new AgentError('AI provider not initialized', ErrorCode.NOT_INITIALIZED);
    }
    
    const result = await this.aiProvider.generateCode(prompt, language);
    return result.code;
  }

  /**
   * Execute a tool
   */
  async executeTool(toolName: string, params: unknown): Promise<ToolResult> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      throw new AgentError(`Tool not found: ${toolName}`, ErrorCode.TOOL_NOT_FOUND);
    }

    // Validate security
    if (!this.securityValidator.validateToolExecution(tool, params)) {
      throw new AgentError('Tool execution not allowed', ErrorCode.SECURITY_VIOLATION);
    }

    try {
      const result = await tool.execute(params);
      
      // Track tool usage
      await this.memory.store({
        id: uuidv4(),
        type: MemoryType.PROCEDURAL,
        content: {
          tool: toolName,
          params,
          result,
          timestamp: new Date()
        },
        timestamp: new Date(),
        accessCount: 0,
        lastAccessed: new Date(),
        importance: 0.5,
        associations: []
      });

      return result;
    } catch (error: unknown) {
      this.logger.error(`Tool execution failed: ${toolName}`, error);
      throw new AgentError(
        `Tool execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 
        ErrorCode.TOOL_EXECUTION_ERROR,
        error
      );
    }
  }

  /**
   * Store a memory
   */
  async remember(memory: Memory): Promise<void> {
    await this.memory.store(memory);
  }

  /**
   * Recall memories
   */
  async recall(query: MemoryQuery): Promise<Memory[]> {
    return this.memory.retrieve(query);
  }

  /**
   * Learn from an event
   */
  async learn(event: LearningEvent): Promise<void> {
    await this.learner.process(event);
  }

  /**
   * Optimize performance
   */
  async optimize(): Promise<void> {
    // Optimize memory
    await this.memory.consolidate();
    
    // Optimize learning patterns
    this.learner.optimizePatterns();
    
    // Clear performance caches
    this.optimizer.clearCache();
    
    this.logger.info('Optimization completed');
  }

  /**
   * Get agent statistics
   */
  async getStatistics(): Promise<{
    tasksExecuted: number;
    successRate: number;
    averageDuration: number;
    memoryStats: any;
    patternsLearned: number;
  }> {
    const memoryStats = this.memory.getStatistics();
    const learningInsights = await this.learner.getInsights();
    
    return {
      tasksExecuted: this.statistics.tasksExecuted,
      successRate: this.statistics.tasksExecuted > 0 
        ? this.statistics.successfulTasks / this.statistics.tasksExecuted 
        : 0,
      averageDuration: this.statistics.totalDuration / Math.max(1, this.statistics.tasksExecuted),
      memoryStats,
      patternsLearned: learningInsights.totalPatterns
    };
  }

  /**
   * Register a tool
   */
  registerTool(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      this.logger.warn(`Tool already registered: ${tool.name}`);
      return;
    }

    // Check if tool needs agent reference (like CodeGenAdapter)
    if ('setAgent' in tool && typeof (tool as any).setAgent === 'function') {
      (tool as any).setAgent(this);
      this.logger.debug(`Agent reference set for tool: ${tool.name}`);
    }

    this.tools.set(tool.name, tool);
    this.logger.info(`Tool registered: ${tool.name}`);
  }

  /**
   * Shutdown the agent
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down agent...');
    
    // Wait for active tasks
    if (this.activeTasks.size > 0) {
      this.logger.info(`Waiting for ${this.activeTasks.size} active tasks...`);
      const timeout = setTimeout(() => {
        this.logger.warn('Timeout waiting for tasks, forcing shutdown');
      }, 30000);

      while (this.activeTasks.size > 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      clearTimeout(timeout);
    }

    // Cleanup
    this.eventBus.removeAllListeners();
    await this.memory.consolidate();
    
    this.initialized = false;
    this.logger.info('Agent shutdown complete');
  }

  /**
   * Setup capabilities
   */
  private setupCapabilities(): void {
    // Add configured capabilities
    for (const cap of this.config.capabilities || []) {
      this.capabilities.set(cap, {
        name: cap,
        description: `${cap} capability`,
        enabled: true
      });
    }

    // Add default capabilities
    const defaultCapabilities: AgentCapability[] = [
      AgentCapability.TASK_PLANNING,
      AgentCapability.MEMORY_MANAGEMENT,
      AgentCapability.LEARNING,
      AgentCapability.TOOL_EXECUTION
    ];

    for (const cap of defaultCapabilities) {
      if (!this.capabilities.has(cap)) {
        this.capabilities.set(cap, {
          name: cap,
          description: `${cap} capability`,
          enabled: true
        });
      }
    }
  }

  /**
   * Setup tools
   */
  private setupTools(): void {
    // Tools will be registered externally via registerTool
    this.logger.debug('Tools setup complete');
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    this.eventBus.on(AgentEventType.TASK_STARTED, (event) => {
      this.logger.info(`Task started: ${event.task.id}`);
    });

    this.eventBus.on(AgentEventType.TASK_COMPLETED, (event) => {
      this.logger.info(`Task completed: ${event.task.id}`);
    });

    this.eventBus.on(AgentEventType.TASK_FAILED, (event) => {
      this.logger.error(`Task failed: ${event.task.id}`, event.error);
    });

    this.eventBus.on(AgentEventType.MEMORY_STORED, (event) => {
      this.logger.debug(`Memory stored: ${event.memory.id}`);
    });

    this.eventBus.on(AgentEventType.LEARNING_OCCURRED, (event) => {
      this.logger.info(`Learning occurred: ${event.pattern.name}`);
    });
  }

  /**
   * Start background processes
   */
  /**
   * Get frequently modified files analysis
   */
  async getFrequentlyModifiedFiles(limit: number = 100): Promise<string[]> {
    const files = await this.freqModifiedAnalyzer.getFrequentlyModifiedFiles(limit);
    if (this.aiProvider) {
      return this.freqModifiedAnalyzer.getAIAnalysis(files, this.aiProvider);
    }
    return this.freqModifiedAnalyzer.analyzeCoreFiles(files);
  }

  /**
   * Set output mode
   */
  setOutputMode(mode: string): boolean {
    return this.outputModeManager.setMode(mode);
  }

  /**
   * Get available output modes
   */
  getOutputModes(): string[] {
    return this.outputModeManager.getAvailableModes();
  }

  /**
   * Register MCP server
   */
  registerMCPServer(server: any): void {
    this.mcpServerManager.registerServer(server);
  }

  /**
   * Build enhanced system prompt
   */
  async buildSystemPrompt(modelName: string, additionalDirs?: string[]): Promise<string> {
    const config = {
      modelName,
      additionalDirectories: additionalDirs,
      outputMode: this.outputModeManager.getCurrentMode()?.name,
      mcpServers: this.mcpServerManager.getAllServers(),
      availableTools: new Set(this.tools.keys()),
      enableCodeReferences: true,
      enableTaskManagement: this.tools.has('TodoWrite'),
      jupiterDocsUrl: 'https://docs.anthropic.com/en/docs/jupiter',
      jupiterDocsSubpages: 'overview, quickstart, memory, common-workflows, troubleshooting'
    };

    const [systemPrompts, envBlock] = await Promise.all([
      this.promptBuilder.buildSystemPrompt(config),
      this.promptBuilder.buildEnvironmentBlock(modelName, additionalDirs)
    ]);

    return [...systemPrompts, envBlock].join('\n\n');
  }

  private startBackgroundProcesses(): void {
    // Memory consolidation
    if (this.config.memory?.consolidationInterval) {
      setInterval(() => {
        this.memory.consolidate().catch(error => {
          this.logger.error('Memory consolidation failed', error);
        });
      }, this.config.memory.consolidationInterval);
    }

    // Learning evaluation
    if (this.config.learning?.evaluationInterval) {
      setInterval(() => {
        // Evaluate learning patterns periodically
        this.logger.debug('Learning evaluation triggered');
      }, this.config.learning.evaluationInterval);
    }

    // Performance optimization
    if (this.config.performance?.optimizationInterval) {
      setInterval(() => {
        this.optimize().catch(error => {
          this.logger.error('Optimization failed', error);
        });
      }, this.config.performance.optimizationInterval);
    }
  }

  /**
   * Emit an event
   */
  private emit(type: AgentEventType, data: Partial<AgentEvent>): void {
    this.eventBus.emit(type, {
      type,
      agentId: this.id,
      timestamp: new Date(),
      ...data
    });
  }

}