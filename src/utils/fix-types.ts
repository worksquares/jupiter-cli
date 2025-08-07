// Temporary file to fix type issues
export type ToolParamType = 'string' | 'number' | 'boolean' | 'array' | 'object';

export const paramType = {
  string: 'string' as ToolParamType,
  number: 'number' as ToolParamType,
  boolean: 'boolean' as ToolParamType,
  array: 'array' as ToolParamType,
  object: 'object' as ToolParamType
} as const;