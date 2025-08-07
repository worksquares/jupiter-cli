/**
 * Enhanced Error Handler with comprehensive error recovery
 */

import { Logger } from './logger';
import { AgentError, ErrorCode } from '../core/types';

export interface ErrorContext {
  operation: string;
  component: string;
  details?: any;
}

export interface ErrorRecovery {
  canRecover: boolean;
  suggestion?: string;
  action?: () => Promise<void>;
  fallback?: any;
}

export class EnhancedErrorHandler {
  private logger = new Logger('ErrorHandler');
  private errorHistory: Array<{
    timestamp: Date;
    error: Error;
    context: ErrorContext;
    recovered: boolean;
  }> = [];

  /**
   * Handle error with recovery options
   */
  async handleError(
    error: Error | any,
    context: ErrorContext
  ): Promise<ErrorRecovery> {
    // Log the error
    this.logger.error(`Error in ${context.component}:${context.operation}`, {
      error: error.message || error,
      stack: error.stack,
      details: context.details
    });

    // Record in history
    this.errorHistory.push({
      timestamp: new Date(),
      error,
      context,
      recovered: false
    });

    // Determine recovery strategy
    const recovery = this.determineRecovery(error, context);

    // Attempt recovery if possible
    if (recovery.canRecover && recovery.action) {
      try {
        await recovery.action();
        this.errorHistory[this.errorHistory.length - 1].recovered = true;
        this.logger.info('Error recovery successful', { 
          operation: context.operation,
          suggestion: recovery.suggestion 
        });
      } catch (recoveryError) {
        this.logger.error('Error recovery failed', recoveryError);
        recovery.canRecover = false;
      }
    }

    return recovery;
  }

  /**
   * Determine recovery strategy based on error type
   */
  private determineRecovery(error: Error | any, context: ErrorContext): ErrorRecovery {
    const errorMessage = error.message || error.toString();

    // Azure authentication errors
    if (errorMessage.includes('authentication') || 
        errorMessage.includes('credential') ||
        errorMessage.includes('401')) {
      return {
        canRecover: false,
        suggestion: 'Check Azure credentials in .env file. Ensure AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, and AZURE_TENANT_ID are set correctly.',
        fallback: { 
          type: 'mock', 
          message: 'Running in mock mode due to authentication failure' 
        }
      };
    }

    // Azure subscription errors
    if (errorMessage.includes('subscription') || 
        errorMessage.includes('SubscriptionNotFound')) {
      return {
        canRecover: false,
        suggestion: 'Verify AZURE_SUBSCRIPTION_ID in .env file matches your Azure subscription.',
        fallback: { 
          type: 'local', 
          message: 'Using local execution instead of Azure containers' 
        }
      };
    }

    // Network errors
    if (errorMessage.includes('ECONNREFUSED') || 
        errorMessage.includes('ETIMEDOUT') ||
        errorMessage.includes('ENOTFOUND')) {
      return {
        canRecover: true,
        suggestion: 'Network error detected. Will retry with exponential backoff.',
        action: async () => {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      };
    }

    // File system errors
    if (errorMessage.includes('EACCES') || errorMessage.includes('EPERM')) {
      return {
        canRecover: false,
        suggestion: 'Permission denied. Check file system permissions or run with appropriate privileges.',
        fallback: { 
          type: 'memory', 
          message: 'Using in-memory storage instead of file system' 
        }
      };
    }

    // Git errors
    if (errorMessage.includes('git') && errorMessage.includes('not found')) {
      return {
        canRecover: false,
        suggestion: 'Git is not installed. Install Git to enable version control features.',
        fallback: { 
          type: 'no-vcs', 
          message: 'Proceeding without version control' 
        }
      };
    }

    // Container creation errors
    if (errorMessage.includes('container') && 
        (errorMessage.includes('failed') || errorMessage.includes('error'))) {
      return {
        canRecover: true,
        suggestion: 'Container creation failed. Will retry with different configuration.',
        action: async () => {
          // Retry with simpler configuration
          context.details = {
            ...context.details,
            useSimpleConfig: true,
            cpu: 0.5,
            memory: 1
          };
        }
      };
    }

    // API rate limit errors
    if (errorMessage.includes('429') || 
        errorMessage.includes('rate limit') ||
        errorMessage.includes('TooManyRequests')) {
      return {
        canRecover: true,
        suggestion: 'Rate limit exceeded. Waiting before retry.',
        action: async () => {
          const waitTime = this.calculateBackoff();
          this.logger.info(`Waiting ${waitTime}ms before retry`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      };
    }

    // CosmosAPI errors
    if (errorMessage.includes('CosmosAPI') || 
        errorMessage.includes('cosmosapi.digisquares.com')) {
      return {
        canRecover: false,
        suggestion: 'CosmosAPI connection failed. Check API key and network connectivity. AI code generation is required - no fallback available.',
        fallback: { 
          type: 'error', 
          message: 'AI code generation failed. Valid CosmosAPI key required.' 
        }
      };
    }

    // Generic errors
    return {
      canRecover: false,
      suggestion: 'An unexpected error occurred. Check logs for details.',
      fallback: { 
        type: 'skip', 
        message: 'Operation skipped due to error' 
      }
    };
  }

  /**
   * Calculate exponential backoff time
   */
  private calculateBackoff(): number {
    const recentErrors = this.errorHistory.filter(
      e => Date.now() - e.timestamp.getTime() < 60000 // Last minute
    ).length;
    
    return Math.min(1000 * Math.pow(2, recentErrors), 30000); // Max 30 seconds
  }

  /**
   * Get error statistics
   */
  getErrorStats(): {
    total: number;
    recovered: number;
    byComponent: Record<string, number>;
    recentErrors: Array<{ time: Date; error: string; recovered: boolean }>;
  } {
    const byComponent: Record<string, number> = {};
    
    this.errorHistory.forEach(entry => {
      const key = entry.context.component;
      byComponent[key] = (byComponent[key] || 0) + 1;
    });

    return {
      total: this.errorHistory.length,
      recovered: this.errorHistory.filter(e => e.recovered).length,
      byComponent,
      recentErrors: this.errorHistory.slice(-10).map(e => ({
        time: e.timestamp,
        error: e.error.message,
        recovered: e.recovered
      }))
    };
  }

  /**
   * Clear error history
   */
  clearHistory(): void {
    this.errorHistory = [];
  }
}

// Singleton instance
export const errorHandler = new EnhancedErrorHandler();