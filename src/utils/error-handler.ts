/**
 * Comprehensive error handling system
 */

import { Logger } from './logger';
import { AgentError, ErrorCode } from '../core/types';

export interface ErrorContext {
  component: string;
  operation: string;
  details?: unknown;
  userId?: string;
  taskId?: string;
  timestamp?: Date;
}

export interface ErrorRecoveryStrategy {
  type: 'retry' | 'fallback' | 'compensate' | 'ignore' | 'escalate';
  maxRetries?: number;
  retryDelay?: number;
  fallbackFn?: () => Promise<unknown>;
  compensateFn?: (error: Error) => Promise<void>;
}

export class ErrorHandler {
  private logger: Logger;
  private recoveryStrategies: Map<string, ErrorRecoveryStrategy>;
  private errorHistory: Array<{ error: Error; context: ErrorContext; timestamp: Date }>;
  private maxHistorySize = 100;

  constructor() {
    this.logger = new Logger('ErrorHandler');
    this.recoveryStrategies = new Map();
    this.errorHistory = [];
    
    // Register default strategies
    this.registerDefaultStrategies();
  }

  /**
   * Handle an error with appropriate recovery strategy
   */
  async handle(
    error: Error | unknown,
    context: ErrorContext,
    strategy?: ErrorRecoveryStrategy
  ): Promise<unknown> {
    const actualError = this.normalizeError(error);
    
    // Log error
    this.logger.error(`Error in ${context.component}.${context.operation}`, {
      error: actualError,
      context
    });
    
    // Record in history
    this.recordError(actualError, context);
    
    // Determine recovery strategy
    const recoveryStrategy = strategy || this.getRecoveryStrategy(actualError, context);
    
    // Execute recovery
    return this.executeRecovery(actualError, context, recoveryStrategy);
  }

  /**
   * Wrap a function with error handling
   */
  wrap<T extends (...args: any[]) => any>(
    fn: T,
    context: Omit<ErrorContext, 'operation'>,
    strategy?: ErrorRecoveryStrategy
  ): T {
    return (async (...args: Parameters<T>): Promise<ReturnType<T>> => {
      try {
        return await fn(...args);
      } catch (error) {
        return this.handle(error, {
          ...context,
          operation: fn.name || 'anonymous'
        }, strategy) as ReturnType<T>;
      }
    }) as T;
  }

  /**
   * Create a circuit breaker for a function
   */
  createCircuitBreaker<T extends (...args: any[]) => any>(
    fn: T,
    options: {
      failureThreshold: number;
      resetTimeout: number;
      halfOpenRequests?: number;
    }
  ): T {
    let failures = 0;
    let lastFailureTime = 0;
    let state: 'closed' | 'open' | 'half-open' = 'closed';
    let halfOpenAttempts = 0;

    return (async (...args: Parameters<T>): Promise<ReturnType<T>> => {
      // Check circuit state
      if (state === 'open') {
        const timeSinceFailure = Date.now() - lastFailureTime;
        if (timeSinceFailure < options.resetTimeout) {
          throw new Error('Circuit breaker is open');
        }
        state = 'half-open';
        halfOpenAttempts = 0;
      }

      try {
        const result = await fn(...args);
        
        // Success - reset failures
        if (state === 'half-open') {
          halfOpenAttempts++;
          if (halfOpenAttempts >= (options.halfOpenRequests || 1)) {
            state = 'closed';
            failures = 0;
          }
        }
        
        return result;
      } catch (error) {
        failures++;
        lastFailureTime = Date.now();
        
        if (failures >= options.failureThreshold) {
          state = 'open';
        }
        
        throw error;
      }
    }) as T;
  }

  /**
   * Register a recovery strategy
   */
  registerStrategy(
    errorPattern: string | RegExp,
    strategy: ErrorRecoveryStrategy
  ): void {
    const key = errorPattern instanceof RegExp ? errorPattern.source : errorPattern;
    this.recoveryStrategies.set(key, strategy);
  }

  /**
   * Get error statistics
   */
  getStatistics(): {
    totalErrors: number;
    errorsByComponent: Record<string, number>;
    errorsByType: Record<string, number>;
    recentErrors: Array<{ error: string; context: ErrorContext; timestamp: Date }>;
  } {
    const stats = {
      totalErrors: this.errorHistory.length,
      errorsByComponent: {} as Record<string, number>,
      errorsByType: {} as Record<string, number>,
      recentErrors: this.errorHistory.slice(-10).map(entry => ({
        error: entry.error.message,
        context: entry.context,
        timestamp: entry.timestamp
      }))
    };

    for (const entry of this.errorHistory) {
      // Count by component
      const component = entry.context.component;
      stats.errorsByComponent[component] = (stats.errorsByComponent[component] || 0) + 1;
      
      // Count by type
      const errorType = entry.error.constructor.name;
      stats.errorsByType[errorType] = (stats.errorsByType[errorType] || 0) + 1;
    }

    return stats;
  }

  /**
   * Clear error history
   */
  clearHistory(): void {
    this.errorHistory = [];
  }

  /**
   * Private methods
   */
  private normalizeError(error: unknown): Error {
    if (error instanceof Error) {
      return error;
    }
    
    if (typeof error === 'string') {
      return new Error(error);
    }
    
    if (typeof error === 'object' && error !== null) {
      const err = new Error(JSON.stringify(error));
      Object.assign(err, error);
      return err;
    }
    
    return new Error('Unknown error');
  }

  private recordError(error: Error, context: ErrorContext): void {
    this.errorHistory.push({
      error,
      context: { ...context, timestamp: new Date() },
      timestamp: new Date()
    });
    
    // Trim history if too large
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory = this.errorHistory.slice(-this.maxHistorySize);
    }
  }

  private getRecoveryStrategy(
    error: Error, _context: ErrorContext
  ): ErrorRecoveryStrategy {
    // Check registered strategies
    for (const [pattern, strategy] of this.recoveryStrategies) {
      if (error.message.includes(pattern)) {
        return strategy;
      }
    }
    
    // Default strategies based on error type
    if (error instanceof AgentError) {
      switch ((error as any).code) {
        case ErrorCode.TOOL_NOT_FOUND:
        case ErrorCode.VALIDATION_ERROR:
          return { type: 'fallback' };
        
        case ErrorCode.TIMEOUT_ERROR:
        case ErrorCode.EXECUTION_ERROR:
          return { type: 'retry', maxRetries: 3, retryDelay: 1000 };
        
        case ErrorCode.UNKNOWN_ERROR:
          return { type: 'compensate', compensateFn: async () => {
            this.logger.warn('Unknown error - attempting recovery');
          }};
        
        default:
          return { type: 'escalate' };
      }
    }
    
    // Network errors - retry
    if (error.message.includes('ECONNREFUSED') || 
        error.message.includes('ETIMEDOUT') ||
        error.message.includes('ENOTFOUND')) {
      return { type: 'retry', maxRetries: 3, retryDelay: 2000 };
    }
    
    // Default - escalate
    return { type: 'escalate' };
  }

  private async executeRecovery(
    error: Error, context: ErrorContext,
    strategy: ErrorRecoveryStrategy
  ): Promise<unknown> {
    switch (strategy.type) {
      case 'retry':
        return this.executeRetry(error, context, strategy);
      
      case 'fallback':
        return this.executeFallback(error, context, strategy);
      
      case 'compensate':
        return this.executeCompensate(error, context, strategy);
      
      case 'ignore':
        this.logger.warn('Ignoring error', { error, context });
        return null;
      
      case 'escalate':
      default:
        throw error;
    }
  }

  private async executeRetry(
    error: Error, context: ErrorContext,
    strategy: ErrorRecoveryStrategy
  ): Promise<unknown> {
    const maxRetries = strategy.maxRetries || 3;
    const retryDelay = strategy.retryDelay || 1000;
    
    this.logger.info(`Retrying operation ${context.operation}`, {
      maxRetries,
      retryDelay
    });
    
    // In a real implementation, would retry the original operation
    // For now, just throw the error
    throw error;
  }

  private async executeFallback(
    _error: Error, context: ErrorContext,
    strategy: ErrorRecoveryStrategy
  ): Promise<unknown> {
    if (strategy.fallbackFn) {
      this.logger.info(`Executing fallback for ${context.operation}`);
      return strategy.fallbackFn();
    }
    
    // No fallback function - return null
    return null;
  }

  private async executeCompensate(
    error: Error, context: ErrorContext,
    strategy: ErrorRecoveryStrategy
  ): Promise<unknown> {
    if (strategy.compensateFn) {
      this.logger.info(`Executing compensation for ${context.operation}`);
      await strategy.compensateFn(error);
    }
    
    // Still throw the error after compensation
    throw error;
  }

  private registerDefaultStrategies(): void {
    // File not found - use fallback
    this.registerStrategy('ENOENT', {
      type: 'fallback',
      fallbackFn: async () => ({ error: 'File not found', data: null })
    });
    
    // Permission denied - escalate
    this.registerStrategy('EACCES', { type: 'escalate' });
    this.registerStrategy('EPERM', { type: 'escalate' });
    
    // Out of memory - compensate and escalate
    this.registerStrategy('ENOMEM', {
      type: 'compensate',
      compensateFn: async () => {
        this.logger.warn('Out of memory - attempting cleanup');
        if (global.gc) {
          global.gc();
        }
      }
    });
  }
}

// Export singleton instance
export const errorHandler = new ErrorHandler();