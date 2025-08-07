/**
 * Type definitions for tool parameters and results
 */

import { z } from 'zod';
import { ToolParameterSchemas } from '../utils/validation-schemas';

// Define parameter types based on validation schemas
export type ReadParams = z.infer<typeof ToolParameterSchemas.read>;
export type WriteParams = z.infer<typeof ToolParameterSchemas.write>;
export type EditParams = z.infer<typeof ToolParameterSchemas.edit>;
export type MultiEditParams = z.infer<typeof ToolParameterSchemas.multiEdit>;
export type GrepParams = z.infer<typeof ToolParameterSchemas.grep>;
export type GlobParams = z.infer<typeof ToolParameterSchemas.glob>;
export type BashParams = z.infer<typeof ToolParameterSchemas.bash>;
export type LSParams = z.infer<typeof ToolParameterSchemas.ls>;
export type TaskParams = z.infer<typeof ToolParameterSchemas.task>;
export type WebSearchParams = z.infer<typeof ToolParameterSchemas.webSearch>;
export type WebFetchParams = z.infer<typeof ToolParameterSchemas.webFetch>;
export type TodoWriteParams = z.infer<typeof ToolParameterSchemas.todoWrite>;
export type ExitPlanModeParams = z.infer<typeof ToolParameterSchemas.exitPlanMode>;
export type NotebookReadParams = z.infer<typeof ToolParameterSchemas.notebookRead>;
export type NotebookEditParams = z.infer<typeof ToolParameterSchemas.notebookEdit>;

// Union type for all tool parameters
export type ToolParams = 
  | ReadParams 
  | WriteParams 
  | EditParams 
  | MultiEditParams 
  | GrepParams 
  | GlobParams 
  | BashParams 
  | LSParams 
  | TaskParams 
  | WebSearchParams 
  | WebFetchParams 
  | TodoWriteParams 
  | ExitPlanModeParams 
  | NotebookReadParams 
  | NotebookEditParams;

// Result types for each tool
export interface ReadResult {
  content: string;
  lineCount: number;
  fileSize: number;
}

export interface WriteResult {
  file_path: string;
  bytesWritten: number;
  success: boolean;
}

export interface EditResult {
  file_path: string;
  editsApplied: number;
  success: boolean;
}

export interface GrepResult {
  matches: Array<{
    file: string;
    line?: number;
    content?: string;
    count?: number;
  }>;
  totalMatches: number;
}

export interface GlobResult {
  files: string[];
  count: number;
}

export interface BashResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  success: boolean;
}

export interface LSResult {
  entries: Array<{
    name: string;
    type: 'file' | 'directory';
    size?: number;
    modified?: Date;
  }>;
  count: number;
}

export interface TaskResult {
  taskId: string;
  output: unknown;
  success: boolean;
}

export interface WebSearchResult {
  results: Array<{
    title: string;
    url: string;
    snippet: string;
  }>;
  count: number;
}

export interface WebFetchResult {
  content: string;
  url: string;
  statusCode?: number;
}

export interface TodoWriteResult {
  todosUpdated: number;
  success: boolean;
}

export interface ExitPlanModeResult {
  planSaved: boolean;
  success: boolean;
}

export interface NotebookReadResult {
  cells: Array<{
    id: string;
    type: 'code' | 'markdown';
    source: string;
    outputs?: unknown[];
  }>;
}

export interface NotebookEditResult {
  cellsModified: number;
  success: boolean;
}

// Union type for all tool results
export type ToolSpecificResult = 
  | ReadResult 
  | WriteResult 
  | EditResult 
  | GrepResult 
  | GlobResult 
  | BashResult 
  | LSResult 
  | TaskResult 
  | WebSearchResult 
  | WebFetchResult 
  | TodoWriteResult 
  | ExitPlanModeResult 
  | NotebookReadResult 
  | NotebookEditResult;

// Parameter schema type helper
// Parameter schema types - supports complex nested structures
export type ParameterType = 'string' | 'number' | 'boolean' | 'array' | 'object';

export interface BaseParameterSchema {
  type: ParameterType;
  description: string;
  required: boolean;
  default?: any;
  enum?: string[];
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  [key: string]: any; // Allow additional properties
}

export interface StringParameterSchema extends BaseParameterSchema {
  type: 'string';
  enum?: string[];
  minLength?: number;
  maxLength?: number;
}

export interface NumberParameterSchema extends BaseParameterSchema {
  type: 'number';
  minimum?: number;
  maximum?: number;
}

export interface BooleanParameterSchema extends BaseParameterSchema {
  type: 'boolean';
}

export interface ArrayParameterSchema extends BaseParameterSchema {
  type: 'array';
  items?: ParameterSchema | Record<string, any>;
}

export interface ObjectParameterSchema extends BaseParameterSchema {
  type: 'object';
  properties?: Record<string, ParameterSchema>;
}

export type ParameterSchema = 
  | StringParameterSchema 
  | NumberParameterSchema 
  | BooleanParameterSchema 
  | ArrayParameterSchema 
  | ObjectParameterSchema;

// Error types
export class ToolExecutionError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ToolExecutionError';
  }
}

export class ToolValidationError extends Error {
  constructor(
    message: string,
    public field: string,
    public expectedType: string,
    public actualValue: unknown
  ) {
    super(message);
    this.name = 'ToolValidationError';
  }
}