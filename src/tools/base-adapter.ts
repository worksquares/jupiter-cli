/**
 * Base Tool Adapter - Interface for all tool adapters
 */

import { Tool } from '../core/types';
import { Logger } from '../utils/logger';
import { ParameterSchema, ToolExecutionError, ToolValidationError } from './tool-types';

export interface ToolResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export abstract class BaseToolAdapter<TParams = unknown, TResult = unknown> implements Tool {
  abstract name: string;
  abstract description: string;
  abstract parameters: Record<string, ParameterSchema>;
  
  protected logger!: Logger;
  
  constructor() {
    // Logger will be initialized after the subclass sets the name
    setTimeout(() => {
      this.logger = new Logger(`Tool:${this.name}`);
    }, 0);
  }

  abstract execute(params: TParams): Promise<TResult>;
  
  validate?(_params: TParams): boolean {
    // Default validation - override in subclasses
    return true;
  }

  /**
   * Helper to create success result
   */
  protected success(data: TResult): TResult {
    return data;
  }

  /**
   * Helper to create error result
   */
  protected error(message: string, code: string, details?: unknown): never {
    throw new ToolExecutionError(message, code, details);
  }

  /**
   * Validate required parameters
   */
  protected validateRequired(params: Record<string, unknown>, required: string[]): void {
    for (const param of required) {
      if (params[param] === undefined || params[param] === null) {
        throw new ToolValidationError(
          `Missing required parameter: ${param}`,
          param,
          'defined',
          params[param]
        );
      }
    }
  }

  /**
   * Validate parameter types
   */
  protected validateTypes(params: Record<string, unknown>, types: Record<string, string>): void {
    for (const [param, expectedType] of Object.entries(types)) {
      if (params[param] !== undefined) {
        const actualType = typeof params[param];
        if (actualType !== expectedType) {
          throw new ToolValidationError(
            `Invalid type for ${param}: expected ${expectedType}, got ${actualType}`,
            param,
            expectedType,
            params[param]
          );
        }
      }
    }
  }
}