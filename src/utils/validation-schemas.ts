/**
 * Validation schemas for input validation
 * 
 * Re-exports schemas from unified-types for backward compatibility
 */

export {
  MemorySchema,
  TaskSchema,
  TaskContextSchema,
  Memory,
  Task,
  TaskContext,
  validate,
  safeParse
} from '../core/unified-types';

/**
 * Validation schemas for input validation
 */

import { z } from 'zod';
import { TaskType, Priority, MemoryType, LearningEventType, FeedbackType } from '../core/types';
import { TaskContextSchema as ImportedTaskContextSchema } from '../core/unified-types';

// Use the imported schema
const TaskContextSchema = ImportedTaskContextSchema;

// Task validation schemas
// TaskContextSchema imported from unified-types


export const CreateTaskSchema = z.object({
  type: z.nativeEnum(TaskType).default(TaskType.GENERAL),
  description: z.string().min(1).max(5000),
  context: TaskContextSchema.partial(),
  priority: z.nativeEnum(Priority).default(Priority.MEDIUM)
});

// Memory validation schemas
// MemorySchema moved to unified-types.ts

export const MemoryQuerySchema = z.object({
  type: z.nativeEnum(MemoryType).optional(),
  keywords: z.array(z.string().max(100)).max(20).optional(),
  timeRange: z.object({
    start: z.date(),
    end: z.date()
  }).optional(),
  minImportance: z.number().min(0).max(1).optional(),
  limit: z.number().min(1).max(1000).optional()
});

// Learning validation schemas
export const LearningEventSchema = z.object({
  id: z.string().uuid().optional(),
  timestamp: z.date().optional(),
  type: z.nativeEnum(LearningEventType),
  input: z.any(),
  output: z.any(),
  outcome: z.object({
    success: z.boolean(),
    confidence: z.number().min(0).max(1),
    improvements: z.array(z.string().max(500)).max(20).optional(),
    issues: z.array(z.string().max(500)).max(20).optional()
  }),
  metrics: z.record(z.number()).optional(),
  feedback: z.object({
    type: z.nativeEnum(FeedbackType),
    value: z.number().min(-1).max(1),
    comment: z.string().max(1000).optional(),
    suggestions: z.array(z.string().max(500)).max(10).optional()
  }).optional()
});

// Tool parameter validation schemas
export const ToolParameterSchemas = {
  read: z.object({
    file_path: z.string().min(1).max(1000),
    offset: z.number().min(0).optional(),
    limit: z.number().min(1).max(10000).default(2000)
  }),
  
  write: z.object({
    file_path: z.string().min(1).max(1000),
    content: z.string().max(10 * 1024 * 1024) // 10MB limit
  }),
  
  edit: z.object({
    file_path: z.string().min(1).max(1000),
    old_string: z.string().min(1).max(50000),
    new_string: z.string().max(50000),
    replace_all: z.boolean().default(false)
  }),
  
  multiEdit: z.object({
    file_path: z.string().min(1).max(1000),
    edits: z.array(z.object({
      old_string: z.string().min(1).max(50000),
      new_string: z.string().max(50000),
      replace_all: z.boolean().default(false)
    })).min(1).max(100)
  }),
  
  grep: z.object({
    pattern: z.string().min(1).max(1000),
    path: z.string().max(1000).default('.'),
    glob: z.string().max(200).optional(),
    type: z.string().max(20).optional(),
    output_mode: z.enum(['content', 'files_with_matches', 'count']).default('files_with_matches'),
    '-A': z.number().min(0).max(100).optional(),
    '-B': z.number().min(0).max(100).optional(),
    '-C': z.number().min(0).max(100).optional(),
    '-i': z.boolean().optional(),
    '-n': z.boolean().optional(),
    multiline: z.boolean().default(false),
    head_limit: z.number().min(1).max(10000).optional()
  }),
  
  glob: z.object({
    pattern: z.string().min(1).max(200),
    path: z.string().max(1000).optional()
  }),
  
  bash: z.object({
    command: z.string().min(1).max(10000),
    description: z.string().max(200).optional(),
    timeout: z.number().min(100).max(600000).optional()
  }),
  
  ls: z.object({
    path: z.string().min(1).max(1000),
    ignore: z.array(z.string().max(100)).max(50).optional()
  }),
  
  task: z.object({
    description: z.string().min(1).max(50),
    prompt: z.string().min(1).max(10000),
    subagent_type: z.enum(['general-purpose'])
  }),
  
  webSearch: z.object({
    query: z.string().min(2).max(500),
    allowed_domains: z.array(z.string().max(100)).max(20).optional(),
    blocked_domains: z.array(z.string().max(100)).max(20).optional()
  }),
  
  webFetch: z.object({
    url: z.string().url().max(2000),
    prompt: z.string().min(1).max(5000)
  }),
  
  todoWrite: z.object({
    todos: z.array(z.object({
      content: z.string().min(1).max(500),
      status: z.enum(['pending', 'in_progress', 'completed']),
      priority: z.enum(['high', 'medium', 'low']),
      id: z.string().min(1).max(100)
    })).min(0).max(1000)
  }),
  
  exitPlanMode: z.object({
    plan: z.string().min(1).max(50000)
  }),
  
  notebookRead: z.object({
    notebook_path: z.string().min(1).max(1000),
    cell_id: z.string().max(10).optional()
  }),
  
  notebookEdit: z.object({
    notebook_path: z.string().min(1).max(1000),
    cell_id: z.string().max(10).optional(),
    new_source: z.string().max(100000),
    cell_type: z.enum(['code', 'markdown']).optional(),
    edit_mode: z.enum(['replace', 'insert', 'delete']).default('replace')
  })
};

// Configuration validation
export const AgentConfigSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  capabilities: z.array(z.string().max(50)).max(100),
  tools: z.array(z.string().max(50)).max(100),
  memory: z.object({
    maxMemories: z.number().min(100).max(1000000),
    consolidationInterval: z.number().min(60000).max(86400000),
    importanceThreshold: z.number().min(0).max(1),
    retentionPolicy: z.object({
      type: z.enum(['time_based', 'count_based', 'importance_based', 'hybrid']),
      duration: z.number().min(3600000).optional(), // Min 1 hour
      maxCount: z.number().min(10).optional(),
      importanceThreshold: z.number().min(0).max(1).optional()
    })
  }),
  learning: z.object({
    enabled: z.boolean(),
    learningRate: z.number().min(0.001).max(1),
    minConfidence: z.number().min(0).max(1),
    maxPatterns: z.number().min(10).max(100000),
    evaluationInterval: z.number().min(60000).max(3600000)
  }),
  performance: z.object({
    maxConcurrentTasks: z.number().min(1).max(100),
    taskTimeout: z.number().min(1000).max(3600000),
    cacheSize: z.number().min(10).max(100000),
    batchSize: z.number().min(1).max(1000),
    prefetchEnabled: z.boolean()
  }),
  security: z.object({
    sandboxed: z.boolean(),
    allowedTools: z.array(z.string()).max(100),
    deniedTools: z.array(z.string()).max(100),
    maxFileSize: z.number().min(1024).max(1073741824), // 1KB to 1GB
    allowedFileTypes: z.array(z.string()).max(100)
  })
});

// Helper function to validate with better error messages
export function validateWithSchema<T>(schema: z.ZodSchema<T>, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const formattedErrors = error.errors.map(err => 
        `${err.path.join('.')}: ${err.message}`
      ).join(', ');
      throw new Error(`Validation failed: ${formattedErrors}`);
    }
    throw error;
  }
}