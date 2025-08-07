/**
 * Unified Type System - Single Source of Truth
 * 
 * This file uses Zod schemas as the source of truth and exports
 * both the schemas AND the inferred TypeScript types.
 */

import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

// ============ ENUMS (shared between runtime and compile-time) ============

export enum TaskType {
  CODE_GENERATION = 'code_generation',
  BUG_FIXING = 'bug_fixing',
  REFACTORING = 'refactoring',
  ANALYSIS = 'analysis',
  DOCUMENTATION = 'documentation',
  TESTING = 'testing',
  OPTIMIZATION = 'optimization',
  RESEARCH = 'research',
  GENERAL = 'general'
}

export enum Priority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum TaskStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

export enum MemoryType {
  WORKING = 'working',
  EPISODIC = 'episodic',
  SEMANTIC = 'semantic',
  PROCEDURAL = 'procedural',
  SENSORY = 'sensory',
  EMOTIONAL = 'emotional',
  META = 'meta'
}

export enum LearningEventType {
  TASK_EXECUTION = 'task_execution',
  ERROR_RECOVERY = 'error_recovery',
  PATTERN_RECOGNITION = 'pattern_recognition',
  STRATEGY_IMPROVEMENT = 'strategy_improvement',
  FEEDBACK_INTEGRATION = 'feedback_integration'
}

export enum OutputFormat {
  TEXT = 'text',
  JSON = 'json',
  STRUCTURED = 'structured',
  MARKDOWN = 'markdown',
  XML = 'xml',
  CODE = 'code'
}

export enum RetentionPolicyType {
  TIME_BASED = 'time_based',
  COUNT_BASED = 'count_based',
  IMPORTANCE_BASED = 'importance_based',
  HYBRID = 'hybrid'
}

export enum FeedbackType {
  POSITIVE = 'positive',
  NEGATIVE = 'negative',
  CORRECTIVE = 'corrective',
  SUGGESTION = 'suggestion'
}

export enum PatternType {
  TASK_SEQUENCE = 'task_sequence',
  ERROR_PATTERN = 'error_pattern',
  SUCCESS_PATTERN = 'success_pattern',
  OPTIMIZATION = 'optimization',
  BEHAVIORAL = 'behavioral'
}

export enum TriggerType {
  EVENT = 'event',
  CONDITION = 'condition',
  TIME = 'time',
  PATTERN = 'pattern'
}

export enum ActionType {
  TOOL = 'tool',
  PROCESS_DATA = 'process_data',
  ANALYZE = 'analyze',
  DECIDE = 'decide',
  STORE = 'store',
  RECALL = 'recall',
  VALIDATE = 'validate',
  TRANSFORM = 'transform',
  PARALLEL = 'parallel',
  SEQUENTIAL = 'sequential',
  COMPOSE = 'compose',
  CONDITIONAL = 'conditional'
}

export enum ConditionOperator {
  EQUALS = 'equals',
  NOT_EQUALS = 'not_equals',
  GREATER_THAN = 'greater_than',
  LESS_THAN = 'less_than',
  CONTAINS = 'contains',
  MATCHES = 'matches',
  IN = 'in',
  NOT_IN = 'not_in'
}

export enum ArtifactType {
  CODE = 'code',
  DATA = 'data',
  MODEL = 'model',
  DOCUMENT = 'document',
  RESULT = 'result'
}

export enum ComplexityLevel {
  SIMPLE = 'simple',
  MODERATE = 'moderate',
  COMPLEX = 'complex',
  VERY_COMPLEX = 'very_complex'
}

export enum ErrorCode {
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  EXECUTION_ERROR = 'EXECUTION_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  PERMISSION_ERROR = 'PERMISSION_ERROR',
  NOT_FOUND_ERROR = 'NOT_FOUND_ERROR',
  TOOL_NOT_FOUND = 'TOOL_NOT_FOUND',
  TOOL_EXECUTION_ERROR = 'TOOL_EXECUTION_ERROR',
  SECURITY_VIOLATION = 'SECURITY_VIOLATION',
  SECURITY_ERROR = 'SECURITY_ERROR',
  NOT_INITIALIZED = 'NOT_INITIALIZED',
  INITIALIZATION_ERROR = 'INITIALIZATION_ERROR'
}

export enum AgentCapability {
  TASK_PLANNING = 'task_planning',
  MEMORY_MANAGEMENT = 'memory_management',
  LEARNING = 'learning',
  TOOL_EXECUTION = 'tool_execution',
  ERROR_RECOVERY = 'error_recovery',
  PATTERN_RECOGNITION = 'pattern_recognition',
  ADAPTATION = 'adaptation'
}

export const RetentionType = RetentionPolicyType;

// ============ ZOD SCHEMAS (Runtime Validation) ============

// Memory Query Schema
export const MemoryQuerySchema = z.object({
  type: z.nativeEnum(MemoryType).optional(),
  importance: z.number().min(0).max(1).optional(),
  minImportance: z.number().min(0).max(1).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  limit: z.number().positive().optional(),
  pattern: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  associations: z.array(z.string()).optional()
});

// Memory Statistics Schema
export const MemoryStatisticsSchema = z.object({
  totalMemories: z.number(),
  byType: z.record(z.nativeEnum(MemoryType), z.number()),
  averageImportance: z.number(),
  oldestMemory: z.coerce.date().optional(),
  newestMemory: z.coerce.date().optional(),
  totalAccessCount: z.number()
});

// Retention Policy Schema
export const RetentionPolicySchema = z.object({
  type: z.nativeEnum(RetentionPolicyType),
  duration: z.number().optional(),
  maxCount: z.number().optional(),
  importanceThreshold: z.number().min(0).max(1).optional()
});

// Memory Config Schema
export const MemoryConfigSchema = z.object({
  maxMemories: z.number().positive().default(10000),
  consolidationInterval: z.number().positive().default(3600000),
  importanceThreshold: z.number().min(0).max(1).default(0.3),
  retentionPolicy: RetentionPolicySchema.optional()
});

// Pattern Schema
export const PatternSchema = z.object({
  id: z.string().uuid().default(() => uuidv4()),
  name: z.string(),
  type: z.nativeEnum(PatternType),
  frequency: z.number().min(0),
  confidence: z.number().min(0).max(1),
  trigger: z.any().optional(),
  action: z.any().optional(),
  lastOccurred: z.coerce.date().optional(),
  examples: z.array(z.any()).default([])
});

// Trigger Schema
export const TriggerSchema = z.object({
  type: z.nativeEnum(TriggerType),
  condition: z.any(),
  threshold: z.number().optional()
});

// Feedback Schema
export const FeedbackSchema = z.object({
  type: z.nativeEnum(FeedbackType),
  content: z.string(),
  rating: z.number().min(0).max(5).optional(),
  taskId: z.string().optional(),
  timestamp: z.coerce.date().default(() => new Date())
});

// Learning Config Schema
export const LearningConfigSchema = z.object({
  enabled: z.boolean().default(true),
  learningRate: z.number().min(0).max(1).default(0.1),
  minConfidence: z.number().min(0).max(1).default(0.6),
  maxPatterns: z.number().positive().default(1000),
  evaluationInterval: z.number().positive().default(300000)
});

// Performance Config Schema
export const PerformanceConfigSchema = z.object({
  maxConcurrentTasks: z.number().positive().default(10),
  taskTimeout: z.number().positive().default(300000),
  cacheSize: z.number().positive().default(1000),
  batchSize: z.number().positive().default(10),
  prefetchEnabled: z.boolean().default(true),
  optimizationInterval: z.number().positive().optional()
});

// Security Config Schema
export const SecurityConfigSchema = z.object({
  sandboxed: z.boolean().default(false),
  allowedTools: z.array(z.string()).default([]),
  deniedTools: z.array(z.string()).default([]),
  maxFileSize: z.number().positive().default(10 * 1024 * 1024),
  allowedFileTypes: z.array(z.string()).default([])
});

// Agent Config Schema
export const AgentConfigSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  capabilities: z.array(z.string()).default([]),
  tools: z.array(z.string()).default([]),
  memory: MemoryConfigSchema.optional(),
  learning: LearningConfigSchema.optional(),
  performance: PerformanceConfigSchema.optional(),
  security: SecurityConfigSchema.optional()
});

// Capability Schema
export const CapabilitySchema = z.object({
  name: z.string(),
  description: z.string(),
  enabled: z.boolean().default(true),
  configuration: z.record(z.any()).optional()
});

// Agent Error Schema
export const AgentErrorSchema = z.object({
  message: z.string(),
  code: z.nativeEnum(ErrorCode),
  details: z.any().optional(),
  timestamp: z.coerce.date().default(() => new Date())
});

// Memory Schema - transforms data to ensure required fields
export const MemorySchema = z.object({
  id: z.string().uuid().default(() => uuidv4()),
  type: z.nativeEnum(MemoryType),
  content: z.any(),
  timestamp: z.coerce.date().default(() => new Date()),
  accessCount: z.number().min(0).default(0),
  lastAccessed: z.coerce.date().default(() => new Date()),
  importance: z.number().min(0).max(1),
  associations: z.array(z.string()).default([]),
  metadata: z.record(z.any()).optional()
});

// Learning Event Schema
export const LearningEventSchema = z.object({
  id: z.string().uuid().default(() => uuidv4()),
  type: z.nativeEnum(LearningEventType),
  timestamp: z.coerce.date().default(() => new Date()),
  data: z.any().optional(),
  input: z.any().optional(),
  output: z.any().optional(),
  outcome: z.object({
    success: z.boolean(),
    confidence: z.number().min(0).max(1),
    error: z.string().optional()
  }).optional(),
  feedback: z.any().optional(),
  taskId: z.string().optional(),
  success: z.boolean(),
  metadata: z.record(z.any()).optional()
});

// Task Context Schema
export const TaskContextSchema = z.object({
  workingDirectory: z.string(),
  files: z.array(z.string()).default([]),
  language: z.string().optional(),
  framework: z.string().optional(),
  requirements: z.array(z.string()).optional(),
  constraints: z.array(z.string()).optional(),
  userPreferences: z.object({
    verbosity: z.enum(['minimal', 'normal', 'detailed', 'debug']).optional(),
    outputFormat: z.nativeEnum(OutputFormat).optional(),
    codeStyle: z.object({
      indentation: z.enum(['tabs', 'spaces']),
      indentSize: z.number().min(1).max(8),
      semicolons: z.boolean(),
      quotes: z.enum(['single', 'double']),
      trailingComma: z.boolean(),
      bracketSpacing: z.boolean(),
      lineWidth: z.number().min(50).max(200)
    }).optional()
  }).optional()
});

// Task Schema
export const TaskSchema = z.object({
  id: z.string().uuid().default(() => uuidv4()),
  type: z.nativeEnum(TaskType),
  description: z.string(),
  context: TaskContextSchema,
  priority: z.nativeEnum(Priority).default(Priority.MEDIUM),
  status: z.nativeEnum(TaskStatus).default(TaskStatus.PENDING),
  createdAt: z.coerce.date().default(() => new Date()),
  updatedAt: z.coerce.date().default(() => new Date()),
  completedAt: z.coerce.date().optional(),
  result: z.any().optional(),
  // Segregation fields
  userId: z.string().uuid(),
  projectId: z.string().uuid(),
  parentTaskId: z.string().uuid().optional(),
  branchName: z.string().optional(),
  dockerInstanceId: z.string().optional(),
  gitRepoUrl: z.string().url().optional(),
  workspaceId: z.string().uuid().optional(),
  error: z.any().optional()
});

// Task Result Schema
export const TaskResultSchema = z.object({
  success: z.boolean(),
  data: z.any().optional(),
  error: z.any().optional(),
  metadata: z.record(z.any()).optional(),
  taskId: z.string().optional(),
  status: z.nativeEnum(TaskStatus).optional(),
  output: z.any().optional()
});

// ============ INFERRED TYPES (Compile-time) ============

// These types are automatically inferred from Zod schemas
// They will always match the runtime validation exactly
export type Memory = z.infer<typeof MemorySchema>;
export type MemoryQuery = z.infer<typeof MemoryQuerySchema>;
export type MemoryStatistics = z.infer<typeof MemoryStatisticsSchema>;
export type MemoryConfig = z.infer<typeof MemoryConfigSchema>;
export type RetentionPolicy = z.infer<typeof RetentionPolicySchema>;
export type LearningEvent = z.infer<typeof LearningEventSchema>;
export type LearningConfig = z.infer<typeof LearningConfigSchema>;
export type Pattern = z.infer<typeof PatternSchema>;
export type Trigger = z.infer<typeof TriggerSchema>;
export type Feedback = z.infer<typeof FeedbackSchema>;
export type TaskContext = z.infer<typeof TaskContextSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type TaskResult = z.infer<typeof TaskResultSchema>;
export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export type PerformanceConfig = z.infer<typeof PerformanceConfigSchema>;
export type SecurityConfig = z.infer<typeof SecurityConfigSchema>;
export type Capability = z.infer<typeof CapabilitySchema>;
export type AgentErrorType = z.infer<typeof AgentErrorSchema>;

// Additional types that match the Zod inference
export type Verbosity = NonNullable<TaskContext['userPreferences']>['verbosity'];

// ============ VALIDATION HELPERS ============

/**
 * Validates and transforms data using a Zod schema
 * Returns the transformed data with proper types
 */
export function validate<T extends z.ZodType>(
  schema: T,
  data: unknown
): z.infer<T> {
  return schema.parse(data);
}

/**
 * Safe validation that returns a result object
 */
export function safeParse<T extends z.ZodType>(
  schema: T,
  data: unknown
): { success: true; data: z.infer<T> } | { success: false; error: z.ZodError } {
  const result = schema.safeParse(data);
  return result as any;
}

// ============ ERROR CLASS ============

export class AgentError extends Error {
  code: ErrorCode;
  details?: any;
  timestamp: Date;

  constructor(message: string, code: ErrorCode, details?: any) {
    super(message);
    this.name = 'AgentError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date();
  }
}
