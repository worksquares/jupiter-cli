/**
 * JSON Schema Generation Utilities
 * Converts Zod schemas to JSON Schema with support for different targets
 */

import { z } from 'zod';
import { createHash } from 'crypto';

export type JsonSchemaTarget = 'jsonSchema7' | 'jsonSchema2019-09' | 'openAi';

export interface JsonSchemaOptions {
  target: JsonSchemaTarget;
  basePath: string[];
  definitionPath: string;
  $refStrategy: 'relative' | 'absolute';
  nameStrategy?: 'title' | 'ref';
}

/**
 * Convert Zod schema to JSON Schema
 */
export function zodToJsonSchema(
  schema: z.ZodType<any>,
  options: JsonSchemaOptions
): any {
  const jsonSchema = convertZodToJsonSchema(schema, options);
  
  // Add schema version based on target
  if (options.target === 'jsonSchema7') {
    jsonSchema.$schema = 'http://json-schema.org/draft-07/schema#';
  } else if (options.target === 'jsonSchema2019-09' || options.target === 'openAi') {
    jsonSchema.$schema = 'https://json-schema.org/draft/2019-09/schema#';
  }

  // Warn about OpenAI limitations
  if (options.target === 'openAi') {
    if ('anyOf' in jsonSchema || 'oneOf' in jsonSchema || 'allOf' in jsonSchema || 
        ('type' in jsonSchema && Array.isArray(jsonSchema.type))) {
      console.warn(
        'Warning: OpenAI may not support schemas with unions as roots! ' +
        'Try wrapping it in an object property.'
      );
    }
  }

  return jsonSchema;
}

/**
 * Core conversion logic from Zod to JSON Schema
 */
function convertZodToJsonSchema(
  schema: z.ZodType<any>,
  options: JsonSchemaOptions
): any {
  // Handle different Zod types
  if (schema instanceof z.ZodString) {
    return { type: 'string' };
  }
  
  if (schema instanceof z.ZodNumber) {
    return { type: 'number' };
  }
  
  if (schema instanceof z.ZodBoolean) {
    return { type: 'boolean' };
  }
  
  if (schema instanceof z.ZodArray) {
    return {
      type: 'array',
      items: convertZodToJsonSchema(schema._def.type, options)
    };
  }
  
  if (schema instanceof z.ZodObject) {
    const shape = schema._def.shape();
    const properties: any = {};
    const required: string[] = [];
    
    for (const [key, value] of Object.entries(shape)) {
      properties[key] = convertZodToJsonSchema(value as z.ZodType<any>, options);
      
      // Check if field is required
      if (!(value instanceof z.ZodOptional)) {
        required.push(key);
      }
    }
    
    return {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
      additionalProperties: false
    };
  }
  
  if (schema instanceof z.ZodOptional) {
    return convertZodToJsonSchema(schema._def.innerType, options);
  }
  
  if (schema instanceof z.ZodUnion) {
    return {
      oneOf: schema._def.options.map((option: z.ZodType<any>) => 
        convertZodToJsonSchema(option, options)
      )
    };
  }
  
  if (schema instanceof z.ZodEnum) {
    return {
      type: 'string',
      enum: schema._def.values
    };
  }
  
  if (schema instanceof z.ZodLiteral) {
    return {
      const: schema._def.value
    };
  }
  
  if (schema instanceof z.ZodDefault) {
    const innerSchema = convertZodToJsonSchema(schema._def.innerType, options);
    return {
      ...innerSchema,
      default: schema._def.defaultValue()
    };
  }
  
  // Fallback for unknown types
  return { type: 'any' };
}

/**
 * Generate a hash for schema content
 */
export function generateSchemaHash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Validate schema compatibility with target
 */
export function validateSchemaForTarget(
  schema: any,
  target: JsonSchemaTarget
): { valid: boolean; warnings: string[] } {
  const warnings: string[] = [];
  
  if (target === 'openAi') {
    // Check for unsupported features in OpenAI
    if (schema.anyOf || schema.oneOf || schema.allOf) {
      warnings.push('OpenAI may not support union types');
    }
    
    if (schema.type && Array.isArray(schema.type)) {
      warnings.push('OpenAI may not support multiple types');
    }
    
    if (schema.patternProperties) {
      warnings.push('OpenAI does not support patternProperties');
    }
    
    if (schema.additionalItems) {
      warnings.push('OpenAI does not support additionalItems');
    }
  }
  
  return {
    valid: warnings.length === 0,
    warnings
  };
}

/**
 * Create a reference object for JSON Schema
 */
export function createSchemaReference(
  definitionPath: string,
  basePath: string[],
  refStrategy: 'relative' | 'absolute'
): any {
  const pathComponents = refStrategy === 'relative' ? [] : basePath;
  const fullPath = [...pathComponents, definitionPath].join('/');
  
  return {
    $ref: `#/${fullPath}`
  };
}