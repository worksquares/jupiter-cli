/**
 * Tool Parameter Type System
 * 
 * This creates a type-safe parameter system for tools that works
 * with both TypeScript compile-time checking and runtime validation.
 */

import { z } from 'zod';

// Base parameter schemas as Zod schemas
export const StringParamSchema = z.object({
  type: z.literal('string'),
  description: z.string(),
  required: z.boolean(),
  default: z.string().optional(),
  enum: z.array(z.string()).optional(),
  minLength: z.number().optional(),
  maxLength: z.number().optional()
});

export const NumberParamSchema = z.object({
  type: z.literal('number'),
  description: z.string(),
  required: z.boolean(),
  default: z.number().optional(),
  minimum: z.number().optional(),
  maximum: z.number().optional()
});

export const BooleanParamSchema = z.object({
  type: z.literal('boolean'),
  description: z.string(),
  required: z.boolean(),
  default: z.boolean().optional()
});

export const ArrayParamSchema = z.object({
  type: z.literal('array'),
  description: z.string(),
  required: z.boolean(),
  items: z.any() // This can be another parameter schema or custom object
});

export const ObjectParamSchema = z.object({
  type: z.literal('object'),
  description: z.string(),
  required: z.boolean(),
  properties: z.record(z.any()).optional()
});

// Union of all parameter types
export const ParameterSchema = z.union([
  StringParamSchema,
  NumberParamSchema,
  BooleanParamSchema,
  ArrayParamSchema,
  ObjectParamSchema
]);

// Inferred types
export type ParameterSchema = z.infer<typeof ParameterSchema>;
export type StringParam = z.infer<typeof StringParamSchema>;
export type NumberParam = z.infer<typeof NumberParamSchema>;
export type BooleanParam = z.infer<typeof BooleanParamSchema>;
export type ArrayParam = z.infer<typeof ArrayParamSchema>;
export type ObjectParam = z.infer<typeof ObjectParamSchema>;

// Tool definition with proper typing
export interface ToolDefinition<TParams = any> {
  name: string;
  description: string;
  parameters: Record<string, any>; // Allow flexibility for complex schemas
  execute(params: TParams): Promise<any>;
  validate?(params: any): params is TParams;
}
