/**
 * Failure Recovery AI Agent
 * Specialized agent that only activates on failures to diagnose and recover
 * Has limited, monitored access to execute recovery operations
 */

import { EventEmitter } from 'events';
import { Logger } from '../utils/logger';
import { SecureOperationsAPI, SecureOperationContext, OperationResult } from '../security/secure-operations-api';
import { z } from 'zod';

// Failure event schema
const FailureEventSchema = z.object({
  context: z.object({
    userId: z.string(),
    projectId: z.string(),
    taskId: z.string(),
    sessionToken: z.string()
  }),
  failure: z.object({
    type: z.enum(['git', 'build', 'deploy', 'container', 'timeout', 'permission']),
    operation: z.string(),
    error: z.string(),
    timestamp: z.date(),
    attempts: z.number()
  }),
  history: z.array(z.object({
    operation: z.string(),
    result: z.boolean(),
    timestamp: z.date()
  })).optional()
});

export type FailureEvent = z.infer<typeof FailureEventSchema>;

export interface RecoveryStrategy {
  name: string;
  description: string;
  steps: RecoveryStep[];
  maxAttempts: number;
}

export interface RecoveryStep {
  action: string;
  parameters: Record<string, any>;
  validation?: string;
  fallback?: string;
}

export interface RecoveryResult {
  success: boolean;
  strategyUsed?: string;
  stepsExecuted: number;
  resolution?: string;
  error?: string;
  recommendations?: string[];
}

/**
 * Failure Recovery Agent - Activated only on failures
 */
export class FailureRecoveryAgent extends EventEmitter {
  private logger = Logger.getInstance().child({ component: 'FailureRecoveryAgent' });
  private recoveryStrategies: Map<string, RecoveryStrategy> = new Map();
  private activeRecoveries: Map<string, boolean> = new Map();
  
  constructor(
    private secureOps: SecureOperationsAPI | any,
    private maxConcurrentRecoveries: number = 5
  ) {
    super();
    this.initializeRecoveryStrategies();
  }

  /**
   * Handle failure event - Main entry point
   */
  async handleFailure(event: FailureEvent): Promise<RecoveryResult> {
    try {
      // Validate event
      const validatedEvent = FailureEventSchema.parse(event);
      
      // Check if already recovering
      const recoveryKey = this.getRecoveryKey(validatedEvent.context);
      if (this.activeRecoveries.get(recoveryKey)) {
        return {
          success: false,
          error: 'Recovery already in progress for this context',
          stepsExecuted: 0
        };
      }

      // Check concurrent recovery limit
      if (this.activeRecoveries.size >= this.maxConcurrentRecoveries) {
        return {
          success: false,
          error: 'Maximum concurrent recoveries reached',
          recommendations: ['Wait for other recoveries to complete'],
          stepsExecuted: 0
        };
      }

      // Mark as active
      this.activeRecoveries.set(recoveryKey, true);
      
      // Analyze failure and determine strategy
      const strategy = await this.analyzeAndSelectStrategy(validatedEvent);
      
      if (!strategy) {
        this.activeRecoveries.delete(recoveryKey);
        return {
          success: false,
          error: 'No suitable recovery strategy found',
          recommendations: this.getManualInterventionRecommendations(validatedEvent),
          stepsExecuted: 0
        };
      }

      // Execute recovery strategy
      const result = await this.executeRecoveryStrategy(
        validatedEvent.context,
        strategy,
        validatedEvent
      );

      // Clean up
      this.activeRecoveries.delete(recoveryKey);
      
      // Emit recovery event
      this.emit('recoveryComplete', {
        event: validatedEvent,
        result
      });

      return result;

    } catch (error: any) {
      this.logger.error('Recovery agent error', error);
      return {
        success: false,
        error: `Recovery agent error: ${error.message}`,
        stepsExecuted: 0
      };
    }
  }

  /**
   * Analyze failure and select appropriate recovery strategy
   */
  private async analyzeAndSelectStrategy(event: FailureEvent): Promise<RecoveryStrategy | null> {
    const { failure } = event;
    
    // Build strategy key based on failure type and error patterns
    let strategyKey: string = failure.type;
    
    // Analyze error message for specific patterns
    if (failure.error.includes('Permission denied')) {
      strategyKey = 'permission-denied';
    } else if (failure.error.includes('Container not found')) {
      strategyKey = 'container-missing';
    } else if (failure.error.includes('npm ERR!')) {
      strategyKey = 'npm-error';
    } else if (failure.type === 'git' || failure.error.includes('git')) {
      strategyKey = 'git-error';
    }

    // Check if we've tried too many times
    if (failure.attempts > 3) {
      this.logger.warn('Too many attempts, recommending manual intervention', {
        context: event.context,
        attempts: failure.attempts
      });
      return null;
    }

    return this.recoveryStrategies.get(strategyKey) || this.recoveryStrategies.get('generic') || null;
  }

  /**
   * Execute recovery strategy
   */
  private async executeRecoveryStrategy(
    context: SecureOperationContext,
    strategy: RecoveryStrategy,
    event: FailureEvent
  ): Promise<RecoveryResult> {
    this.logger.info('Executing recovery strategy', {
      strategy: strategy.name,
      context
    });

    let stepsExecuted = 0;
    let lastError: string | undefined;

    try {
      for (const step of strategy.steps) {
        this.logger.info('Executing recovery step', {
          action: step.action,
          step: stepsExecuted + 1,
          total: strategy.steps.length
        });

        const result = await this.executeRecoveryStep(context, step, event);
        stepsExecuted++;

        if (!result.success) {
          lastError = result.error;
          
          // Try fallback if available
          if (step.fallback) {
            const fallbackStep: RecoveryStep = {
              action: step.fallback,
              parameters: step.parameters
            };
            const fallbackResult = await this.executeRecoveryStep(context, fallbackStep, event);
            
            if (!fallbackResult.success) {
              throw new Error(`Step failed with fallback: ${fallbackResult.error}`);
            }
          } else {
            throw new Error(`Step failed: ${result.error}`);
          }
        }

        // Validate if needed
        if (step.validation) {
          const validationResult = await this.validateRecoveryStep(context, step.validation);
          if (!validationResult) {
            throw new Error('Step validation failed');
          }
        }
      }

      return {
        success: true,
        strategyUsed: strategy.name,
        stepsExecuted,
        resolution: `Successfully recovered using ${strategy.name} strategy`
      };

    } catch (error: any) {
      return {
        success: false,
        strategyUsed: strategy.name,
        stepsExecuted,
        error: error.message || lastError,
        recommendations: this.getRecoveryRecommendations(event, strategy)
      };
    }
  }

  /**
   * Execute a single recovery step
   */
  private async executeRecoveryStep(
    context: SecureOperationContext,
    step: RecoveryStep,
    event: FailureEvent
  ): Promise<OperationResult> {
    switch (step.action) {
      case 'restart-container':
        return await this.restartContainer(context);
        
      case 'clean-workspace':
        return await this.cleanWorkspace(context);
        
      case 'reset-git':
        return await this.resetGitRepository(context, step.parameters);
        
      case 'clear-npm-cache':
        return await this.clearNpmCache(context);
        
      case 'increase-resources':
        return await this.increaseContainerResources(context, step.parameters);
        
      case 'check-connectivity':
        return await this.checkConnectivity(context);
        
      case 'wait':
        return await this.waitAndRetry(step.parameters.duration || 5000);
        
      default:
        return {
          success: false,
          error: `Unknown recovery action: ${step.action}`,
          operationId: 'unknown',
          timestamp: new Date()
        };
    }
  }

  /**
   * Recovery Actions
   */
  private async restartContainer(context: SecureOperationContext): Promise<OperationResult> {
    // Stop existing container
    await this.secureOps.executeAzureOperation(context, {
      operation: 'stopContainer'
    });

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Create new container
    return await this.secureOps.executeAzureOperation(context, {
      operation: 'createContainer'
    });
  }

  private async cleanWorkspace(context: SecureOperationContext): Promise<OperationResult> {
    return await this.secureOps.executeAzureOperation(context, {
      operation: 'executeCommand',
      parameters: {
        command: `cd /workspace/${context.projectId} && rm -rf node_modules package-lock.json`,
        timeout: 30000
      }
    });
  }

  private async resetGitRepository(
    context: SecureOperationContext,
    parameters: Record<string, any>
  ): Promise<OperationResult> {
    const branch = parameters.branch || 'main';
    
    return await this.secureOps.executeGitOperation(context, {
      operation: 'status',
      parameters: {}
    });
  }

  private async clearNpmCache(context: SecureOperationContext): Promise<OperationResult> {
    return await this.secureOps.executeAzureOperation(context, {
      operation: 'executeCommand',
      parameters: {
        command: 'npm cache clean --force',
        timeout: 30000
      }
    });
  }

  private async increaseContainerResources(
    context: SecureOperationContext,
    parameters: Record<string, any>
  ): Promise<OperationResult> {
    // Stop current container
    await this.secureOps.executeAzureOperation(context, {
      operation: 'stopContainer'
    });

    // Create with increased resources
    return await this.secureOps.executeAzureOperation(context, {
      operation: 'createContainer',
      parameters: {
        cpu: parameters.cpu || 2,
        memory: parameters.memory || 4
      }
    });
  }

  private async checkConnectivity(context: SecureOperationContext): Promise<OperationResult> {
    return await this.secureOps.executeAzureOperation(context, {
      operation: 'executeCommand',
      parameters: {
        command: 'ping -c 4 github.com',
        timeout: 10000
      }
    });
  }

  private async waitAndRetry(duration: number): Promise<OperationResult> {
    await new Promise(resolve => setTimeout(resolve, duration));
    return {
      success: true,
      operationId: 'wait',
      timestamp: new Date()
    };
  }

  /**
   * Validate recovery step
   */
  private async validateRecoveryStep(
    context: SecureOperationContext,
    validation: string
  ): Promise<boolean> {
    // Execute validation command
    const result = await this.secureOps.executeAzureOperation(context, {
      operation: 'executeCommand',
      parameters: {
        command: validation,
        timeout: 10000
      }
    });

    return result.success;
  }

  /**
   * Initialize recovery strategies
   */
  private initializeRecoveryStrategies(): void {
    // Git errors
    this.recoveryStrategies.set('git-error', {
      name: 'Git Recovery',
      description: 'Recover from git-related failures',
      maxAttempts: 3,
      steps: [
        {
          action: 'check-connectivity',
          parameters: {},
          validation: 'git ls-remote origin'
        },
        {
          action: 'reset-git',
          parameters: { branch: 'main' },
          fallback: 'clean-workspace'
        }
      ]
    });

    // NPM errors
    this.recoveryStrategies.set('npm-error', {
      name: 'NPM Recovery',
      description: 'Recover from npm-related failures',
      maxAttempts: 3,
      steps: [
        {
          action: 'clear-npm-cache',
          parameters: {}
        },
        {
          action: 'clean-workspace',
          parameters: {}
        },
        {
          action: 'wait',
          parameters: { duration: 3000 }
        }
      ]
    });

    // Container missing
    this.recoveryStrategies.set('container-missing', {
      name: 'Container Recovery',
      description: 'Recover from missing container',
      maxAttempts: 2,
      steps: [
        {
          action: 'wait',
          parameters: { duration: 5000 }
        },
        {
          action: 'restart-container',
          parameters: {}
        }
      ]
    });

    // Timeout
    this.recoveryStrategies.set('timeout', {
      name: 'Timeout Recovery',
      description: 'Recover from timeout failures',
      maxAttempts: 2,
      steps: [
        {
          action: 'increase-resources',
          parameters: { cpu: 2, memory: 4 }
        }
      ]
    });

    // Generic recovery
    this.recoveryStrategies.set('generic', {
      name: 'Generic Recovery',
      description: 'Generic recovery strategy',
      maxAttempts: 2,
      steps: [
        {
          action: 'wait',
          parameters: { duration: 5000 }
        },
        {
          action: 'restart-container',
          parameters: {}
        }
      ]
    });
  }

  /**
   * Get recommendations
   */
  private getManualInterventionRecommendations(event: FailureEvent): string[] {
    const recommendations: string[] = [];
    
    switch (event.failure.type) {
      case 'permission':
        recommendations.push('Check user permissions for the project');
        recommendations.push('Verify GitHub token has necessary scopes');
        break;
        
      case 'git':
        recommendations.push('Verify repository exists and is accessible');
        recommendations.push('Check if branch protection rules are blocking operations');
        break;
        
      case 'build':
        recommendations.push('Review build logs for specific errors');
        recommendations.push('Check if dependencies are correctly specified');
        break;
        
      case 'deploy':
        recommendations.push('Verify deployment configuration');
        recommendations.push('Check Azure Static Web App settings');
        break;
    }

    recommendations.push('Contact support if issue persists');
    
    return recommendations;
  }

  private getRecoveryRecommendations(
    event: FailureEvent,
    strategy: RecoveryStrategy
  ): string[] {
    return [
      `Recovery strategy "${strategy.name}" failed after ${event.failure.attempts} attempts`,
      'Consider manual intervention',
      'Check system logs for detailed error information',
      ...this.getManualInterventionRecommendations(event)
    ];
  }

  private getRecoveryKey(context: SecureOperationContext): string {
    return `${context.userId}:${context.projectId}:${context.taskId}`;
  }

  /**
   * Get recovery statistics
   */
  getStats(): {
    activeRecoveries: number;
    strategiesAvailable: number;
    recoveryHistory: Array<{
      timestamp: Date;
      success: boolean;
      strategy?: string;
    }>;
  } {
    return {
      activeRecoveries: this.activeRecoveries.size,
      strategiesAvailable: this.recoveryStrategies.size,
      recoveryHistory: [] // Would be populated from a history store
    };
  }
}