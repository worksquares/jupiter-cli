/**
 * Retry Helper Utility
 * Provides configurable retry logic with exponential backoff
 */

import { Logger } from './logger';

export interface RetryOptions {
  maxAttempts?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  retryableErrors?: (error: Error) => boolean;
  onRetry?: (attempt: number, delay: number, error: Error) => void;
}

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, 'retryableErrors' | 'onRetry'>> = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2
};

export class RetryHelper {
  private static logger = Logger.getInstance().child({ component: 'RetryHelper' });

  /**
   * Execute a function with retry logic
   */
  static async withRetry<T>(
    fn: () => Promise<T>,
    options: RetryOptions = {},
    context?: string
  ): Promise<T> {
    const config = { ...DEFAULT_OPTIONS, ...options };
    let lastError: Error | undefined;
    
    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;
        
        // Check if error is retryable
        if (config.retryableErrors && !config.retryableErrors(error)) {
          throw error;
        }
        
        // Check if we should retry based on error type
        if (!this.isRetryableError(error)) {
          throw error;
        }
        
        // Check if we've exhausted attempts
        if (attempt === config.maxAttempts) {
          break;
        }
        
        // Calculate delay with exponential backoff
        const delay = Math.min(
          config.initialDelay * Math.pow(config.backoffMultiplier, attempt - 1),
          config.maxDelay
        );
        
        this.logger.warn(`Operation failed, retrying...`, {
          context,
          attempt,
          maxAttempts: config.maxAttempts,
          delay,
          error: error.message
        });
        
        // Call retry callback if provided
        if (config.onRetry) {
          config.onRetry(attempt, delay, error);
        }
        
        // Wait before retrying
        await this.delay(delay);
      }
    }
    
    // All attempts failed
    throw new Error(
      `Operation failed after ${config.maxAttempts} attempts${context ? ` (${context})` : ''}: ${lastError?.message}`
    );
  }

  /**
   * Execute multiple operations with retry logic
   */
  static async withRetryBatch<T>(
    operations: Array<() => Promise<T>>,
    options: RetryOptions = {},
    context?: string
  ): Promise<T[]> {
    return Promise.all(
      operations.map((op, index) => 
        this.withRetry(op, options, `${context || 'batch'}[${index}]`)
      )
    );
  }

  /**
   * Check if an error is retryable
   */
  private static isRetryableError(error: any): boolean {
    // Network errors
    if (error.code === 'ECONNREFUSED' || 
        error.code === 'ENOTFOUND' || 
        error.code === 'ETIMEDOUT' ||
        error.code === 'ECONNRESET' ||
        error.code === 'EPIPE') {
      return true;
    }
    
    // HTTP errors that are retryable
    if (error.response) {
      const status = error.response.status;
      // Retry on 429 (rate limit), 502 (bad gateway), 503 (service unavailable), 504 (gateway timeout)
      if (status === 429 || status === 502 || status === 503 || status === 504) {
        return true;
      }
    }
    
    // Azure-specific errors
    if (error.message && (
        error.message.includes('ECONNRESET') ||
        error.message.includes('socket hang up') ||
        error.message.includes('request timeout') ||
        error.message.includes('Too Many Requests') ||
        error.message.includes('Service Unavailable'))) {
      return true;
    }
    
    // Default to not retryable
    return false;
  }

  /**
   * Delay for specified milliseconds
   */
  private static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Decorator for adding retry logic to async methods
 */
export function WithRetry(options: RetryOptions = {}) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      const context = `${target.constructor.name}.${propertyKey}`;
      return RetryHelper.withRetry(
        () => originalMethod.apply(this, args),
        options,
        context
      );
    };
    
    return descriptor;
  };
}