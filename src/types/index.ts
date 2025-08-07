// Note: Type definitions are consolidated in this file
// Individual type files can be created as the codebase grows

// Common types
export interface AgentConfig {
  name?: string;
  cosmosConfig?: {
    baseURL: string;
    apiKey: string;
    model?: string;
  };
  capabilities?: string[];
  tools?: string[];
  memory?: {
    maxMemories: number;
    consolidationInterval: number;
    importanceThreshold: number;
    retentionPolicy?: {
      type: string;
      duration?: number;
      maxCount?: number;
      importanceThreshold?: number;
    };
  };
  learning?: {
    enabled: boolean;
    learningRate: number;
    minConfidence: number;
    maxPatterns: number;
    evaluationInterval: number;
  };
  performance?: {
    maxConcurrentTasks: number;
    taskTimeout: number;
    cacheSize: number;
    batchSize: number;
    prefetchEnabled: boolean;
  };
  security?: {
    sandboxed: boolean;
    allowedTools: string[];
    deniedTools: string[];
    maxFileSize: number;
    allowedFileTypes: string[];
  };
}

export interface Task {
  id: string;
  description: string;
  type: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  createdAt: Date;
  updatedAt?: Date;
  completedAt?: Date;
  plan?: TaskPlan;
  context?: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface TaskPlan {
  taskId: string;
  steps: TaskStep[];
  estimatedDuration: number;
  createdAt: Date;
}

export interface TaskStep {
  id: string;
  name: string;
  description: string;
  tool?: string;
  parameters: Record<string, any>;
  dependencies: string[];
  order: number;
}

export interface ExecutionResult {
  success: boolean;
  output: string;
  error?: string;
  artifacts?: Array<{
    type: string;
    path?: string;
    content?: string;
  }>;
  metrics?: {
    startTime: Date;
    endTime: Date;
    duration: number;
  };
}

export interface Tool {
  name: string;
  description: string;
  parameters: ToolParameter[];
  execute: (params: Record<string, any>) => Promise<string>;
}

export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required: boolean;
  description?: string;
}

export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
  metadata?: Record<string, any>;
}

export interface Memory {
  id: string;
  type: string;
  content: any;
  timestamp: Date;
  metadata?: Record<string, any>;
}