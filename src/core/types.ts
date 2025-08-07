/**
 * Core types and interfaces for the Intelligent Agent System
 */

import { EventEmitter } from 'eventemitter3';

// Import all types from unified-types.ts first
import type * as UnifiedTypes from './unified-types';

// Re-export types that don't need aliasing
export {
  TaskType,
  TaskStatus,
  TaskContext,
  Priority,
  MemoryType,
  MemoryConfig,
  RetentionPolicyType,
  RetentionPolicyType as RetentionType, // alias for backward compatibility
  RetentionPolicy,
  LearningEventType,
  LearningConfig,
  Feedback,
  FeedbackType,
  PatternType,
  Trigger,
  TriggerType,
  PerformanceConfig,
  SecurityConfig,
  AgentCapability,
  AgentError,
  ErrorCode,
  ActionType, // Export enum directly
  ConditionOperator,
  ArtifactType,
  ComplexityLevel,
  OutputFormat, // Export enum directly
  Verbosity
} from './unified-types';

// Re-export types that may have naming conflicts
export type Task = UnifiedTypes.Task;
export type TaskResult = UnifiedTypes.TaskResult;
export type Memory = UnifiedTypes.Memory;
export type MemoryQuery = UnifiedTypes.MemoryQuery;
export type MemoryStatistics = UnifiedTypes.MemoryStatistics;
export type LearningEvent = UnifiedTypes.LearningEvent;
export type Pattern = UnifiedTypes.Pattern;
export type AgentConfig = UnifiedTypes.AgentConfig;
export type Capability = UnifiedTypes.Capability;

// Tool Types
export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, any>;
  execute: (params: any) => Promise<any>;
  validate?: (params: any) => boolean;
  cost?: number;
  timeout?: number;
}

export interface ToolResult {
  success: boolean;
  data?: any;
  error?: Error;
  metadata?: {
    executionTime: number;
    toolName: string;
    parameters: any;
  };
}

// Agent Interface
export interface AgentInterface {
  id: string;
  config: UnifiedTypes.AgentConfig;
  capabilities: Map<string, UnifiedTypes.Capability>;
  tools: Map<string, Tool>;
  memory: MemoryInterface;
  analyzer: any; // TaskAnalyzer
  planner: any; // TaskPlanner
  executor: any; // TaskExecutor
  learner: any; // LearningEngine
  optimizer: any; // PerformanceOptimizer
  securityValidator: any; // SecurityValidator
  errorHandler: any; // ErrorHandler
  eventBus: EventEmitter;
  
  // Core methods
  initialize(): Promise<void>;
  processTask(task: UnifiedTypes.Task): Promise<UnifiedTypes.TaskResult>;
  recall(query: UnifiedTypes.MemoryQuery): Promise<UnifiedTypes.Memory[]>;
  learn(event: UnifiedTypes.LearningEvent): Promise<void>;
  generateCode?(prompt: string, language?: string): Promise<string>;
  shutdown(): Promise<void>;
}

// Memory Interface
export interface MemoryInterface {
  store(memory: UnifiedTypes.Memory): Promise<void>;
  retrieve(query: UnifiedTypes.MemoryQuery): Promise<UnifiedTypes.Memory[]>;
  update(id: string, updates: Partial<UnifiedTypes.Memory>): Promise<void>;
  delete(id: string): Promise<void>;
  consolidate(): Promise<void>;
  getStatistics(): Promise<UnifiedTypes.MemoryStatistics>;
}

// Additional types for prompt building
export interface PromptTemplate {
  id: string;
  name: string;
  template: string;
  variables: PromptVariable[];
  examples?: Example[];
  format?: UnifiedTypes.OutputFormat;
  metadata?: Record<string, any>;
}

export interface PromptVariable {
  name: string;
  type: VariableType;
  description?: string;
  required: boolean;
  default?: any;
  validation?: (value: any) => boolean;
}

export enum VariableType {
  STRING = 'string',
  NUMBER = 'number',
  BOOLEAN = 'boolean',
  ARRAY = 'array',
  OBJECT = 'object',
  DATE = 'date',
  ENUM = 'enum',
  INPUT = 'input',
  CONTENT = 'content'
}

export interface Example {
  input: Record<string, any>;
  output: string;
  explanation?: string;
  description?: string;
}

// Action types
export interface Action {
  type: UnifiedTypes.ActionType;
  tool?: string;
  parameters?: any;
  transform?: (input: any) => any;
  data?: any;
}

// Validation types  
export interface ValidationResult {
  valid: boolean;
  errors?: string[];
  warnings?: string[];
}

// Additional error codes not in unified-types
export enum AdditionalErrorCode {
  INITIALIZATION_FAILED = 'INITIALIZATION_FAILED',
  CAPABILITY_NOT_FOUND = 'CAPABILITY_NOT_FOUND',
  INVALID_TOOL_PARAMS = 'INVALID_TOOL_PARAMS',
  TASK_FAILED = 'TASK_FAILED',
  TASK_TIMEOUT = 'TASK_TIMEOUT',
  MEMORY_ERROR = 'MEMORY_ERROR',
  MEMORY_FULL = 'MEMORY_FULL',
  OPTIMIZATION_ERROR = 'OPTIMIZATION_ERROR',
  LEARNING_ERROR = 'LEARNING_ERROR',
  SECURITY_ERROR = 'SECURITY_ERROR'
}

// Event Types
export interface AgentEvent {
  type: AgentEventType;
  agentId: string;
  timestamp: Date;
  task?: UnifiedTypes.Task;
  result?: UnifiedTypes.TaskResult;
  error?: Error;
  memory?: UnifiedTypes.Memory;
  pattern?: UnifiedTypes.Pattern;
  data?: any;
}

export enum AgentEventType {
  INITIALIZED = 'initialized',
  AGENT_INITIALIZED = 'agent_initialized',
  TASK_STARTED = 'task_started',
  TASK_COMPLETED = 'task_completed',
  TASK_FAILED = 'task_failed',
  TOOL_EXECUTED = 'tool_executed',
  CAPABILITY_LOADED = 'capability_loaded',
  MEMORY_STORED = 'memory_stored',
  LEARNING_OCCURRED = 'learning_occurred',
  ERROR_OCCURRED = 'error_occurred',
  OPTIMIZATION_COMPLETED = 'optimization_completed',
  OPTIMIZATION_ERROR = 'optimization_error'
}