/**
 * Enhanced Task Executor - Improved version with tool batching and parallel execution
 */

import { BaseExecutor, ExecutionContext, ExecutionStatus, StepResult } from './base-executor';
import { ToolBatcher, BatchableToolCall } from './tool-batcher';
import { ExecutionStep } from './planner';
import { AgentInterface, ActionType, TaskResult } from './types';
import { Logger } from '../utils/logger';

export class Executor extends BaseExecutor {
  private toolBatcher: ToolBatcher;
  private enhancedLogger: Logger;

  constructor(agent: AgentInterface) {
    super(agent);
    this.toolBatcher = new ToolBatcher(agent.tools);
    this.enhancedLogger = new Logger('Executor');
  }

  /**
   * Override executePlan to support parallel execution
   */
  protected async executePlan(context: ExecutionContext): Promise<TaskResult> {
    const { plan, state } = context;
    
    // Identify parallel execution groups
    const executionGroups = this.identifyParallelExecutionGroups(plan.steps);
    
    this.enhancedLogger.info(`Executing plan with ${executionGroups.length} parallel groups`);

    for (const group of executionGroups) {
      // Check if paused or cancelled
      if (state.status === ExecutionStatus.PAUSED) {
        return (this as any).createIntermediateResult(context);
      }
      
      if (state.status === ExecutionStatus.FAILED) {
        throw new Error('Execution cancelled');
      }

      // Execute group in parallel
      await this.executeParallelGroup(group, context);
    }

    state.status = ExecutionStatus.COMPLETED;
    return (this as any).createFinalResult(context);
  }

  /**
   * Execute a single step - make it public for parallel execution
   */
  private async executeStepWrapper(step: ExecutionStep, context: ExecutionContext): Promise<StepResult> {
    // Call the private method through type casting
    return (this as any).executeStep(step, context);
  }

  /**
   * Resolve parameters wrapper
   */
  private resolveParametersWrapper(params: any, context: ExecutionContext): any {
    // Call the private method through type casting
    return (this as any).resolveParameters(params, context);
  }

  /**
   * Identify groups of steps that can execute in parallel
   */
  private identifyParallelExecutionGroups(steps: ExecutionStep[]): ExecutionStep[][] {
    const groups: ExecutionStep[][] = [];
    const assigned = new Set<string>();

    // Build dependency graph
    const dependents = new Map<string, Set<string>>();
    steps.forEach(step => {
      step.dependencies.forEach(dep => {
        if (!dependents.has(dep)) {
          dependents.set(dep, new Set());
        }
        dependents.get(dep)!.add(step.id);
      });
    });

    // Group steps by execution level
    while (assigned.size < steps.length) {
      const currentGroup = steps.filter(step => {
        if (assigned.has(step.id)) return false;
        
        // Check if all dependencies are completed
        return step.dependencies.every(dep => assigned.has(dep));
      });

      if (currentGroup.length === 0) {
        // Handle circular dependencies
        this.enhancedLogger.error('Circular dependency detected');
        break;
      }

      groups.push(currentGroup);
      currentGroup.forEach(step => assigned.add(step.id));
    }

    return groups;
  }

  /**
   * Execute a group of steps in parallel
   */
  private async executeParallelGroup(
    group: ExecutionStep[], 
    context: ExecutionContext
  ): Promise<void> {
    const { state } = context;

    // Separate tool actions from other actions for batching
    const toolSteps = group.filter(step => step.action.type === ActionType.TOOL);
    const otherSteps = group.filter(step => step.action.type !== ActionType.TOOL);

    // Batch tool executions
    if (toolSteps.length > 0) {
      const validToolSteps = toolSteps.filter(step => step.action.tool);
      
      if (validToolSteps.length > 0) {
        const toolCalls: BatchableToolCall[] = validToolSteps.map(step => ({
          id: step.id,
          toolName: step.action.tool!,
          parameters: this.resolveParametersWrapper(step.action.parameters, context),
          dependencies: step.dependencies
        }));

        const batchResults = await this.toolBatcher.executeBatch(toolCalls, {
          maxConcurrency: 5,
          continueOnError: true,
          retryFailures: true,
          maxRetries: 2
        });

        // Process batch results
        batchResults.forEach((result, index) => {
          const step = validToolSteps[index];
          
          if (result.success) {
            state.completedSteps.add(step.id);
            context.results.set(step.id, {
              stepId: step.id,
              success: true,
              output: result.result,
              duration: result.duration,
              retries: 0
            });

            // Store result in artifacts if needed
            if (step.action.parameters?.storeAs) {
              context.artifacts.set(step.action.parameters.storeAs, result.result);
            }
          } else {
            state.failedSteps.add(step.id);
            context.results.set(step.id, {
              stepId: step.id,
              success: false,
              output: null,
              error: result.error,
              duration: result.duration,
              retries: 2
            });

            if (!step.continueOnError) {
              throw result.error;
            }
          }
        });
      }
    }

    // Execute other steps in parallel
    if (otherSteps.length > 0) {
      const otherPromises = otherSteps.map(step => 
        this.executeStepWrapper(step, context).catch(error => {
          if (!step.continueOnError) throw error;
          return {
            stepId: step.id,
            success: false,
            output: null,
            error: error as Error,
            duration: 0,
            retries: 0
          };
        })
      );

      await Promise.all(otherPromises);
    }
  }

  /**
   * Analyze execution patterns for optimization
   */
  analyzeExecutionPatterns(history: Array<{
    steps?: Array<{
      action?: {
        type?: ActionType;
        tool?: string;
      }
    }>
  }>): {
    toolUsagePatterns: Map<string, number>;
    commonSequences: string[][];
    optimizationSuggestions: string[];
  } {
    const toolUsage = new Map<string, number>();
    const sequences: string[][] = [];
    const suggestions: string[] = [];

    // Analyze tool usage frequency
    history.forEach(execution => {
      execution.steps?.forEach(step => {
        if (step.action?.type === ActionType.TOOL && step.action.tool) {
          const count = toolUsage.get(step.action.tool) || 0;
          toolUsage.set(step.action.tool, count + 1);
        }
      });
    });

    // Find common sequences
    const sequenceMap = new Map<string, number>();
    history.forEach(execution => {
      const tools = execution.steps
        ?.filter(s => s.action?.type === ActionType.TOOL && s.action?.tool)
        .map(s => s.action!.tool!) || [];
      
      for (let i = 0; i < tools.length - 1; i++) {
        const seq = [tools[i], tools[i + 1]];
        const key = seq.join('-');
        sequenceMap.set(key, (sequenceMap.get(key) || 0) + 1);
      }
    });

    // Generate suggestions
    const mostUsedTools = Array.from(toolUsage.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    if (mostUsedTools.length > 0) {
      suggestions.push(
        `Consider caching results for frequently used tools: ${
          mostUsedTools.map(([tool]) => tool).join(', ')
        }`
      );
    }

    // Check for repeated sequences
    sequenceMap.forEach((count, sequence) => {
      if (count > 3) {
        sequences.push(sequence.split('-'));
        suggestions.push(
          `Common sequence detected: ${sequence}. Consider creating a composite action.`
        );
      }
    });

    // Check for parallelization opportunities
    const readOnlyTools = ['read', 'grep', 'glob', 'search'];
    const readOnlyUsage = Array.from(toolUsage.entries())
      .filter(([tool]) => readOnlyTools.includes(tool))
      .reduce((sum, [, count]) => sum + count, 0);

    if (readOnlyUsage > 10) {
      suggestions.push(
        'High read-only tool usage detected. These can be batched for better performance.'
      );
    }

    return {
      toolUsagePatterns: toolUsage,
      commonSequences: sequences,
      optimizationSuggestions: suggestions
    };
  }

  /**
   * Get execution metrics
   */
  getExecutionMetrics(): {
    totalExecutions: number;
    averageDuration: number;
    successRate: number;
    parallelizationRate: number;
    toolBatchingRate: number;
  } {
    // This would be populated from actual execution history
    return {
      totalExecutions: 0,
      averageDuration: 0,
      successRate: 0,
      parallelizationRate: 0,
      toolBatchingRate: 0
    };
  }

  /**
   * Create final result with enhanced metadata
   */
  protected createFinalResult(context: ExecutionContext): TaskResult {
    const baseResult = super.createFinalResult(context);
    
    // Add execution metrics
    baseResult.metadata = {
      ...baseResult.metadata,
      parallelGroups: this.identifyParallelExecutionGroups(context.plan.steps).length,
      toolsExecuted: Array.from(context.results.values())
        .filter((r: any) => r.toolName).length,
      cachingUsed: false, // Would be implemented
      optimizationsApplied: ['parallel_execution', 'tool_batching']
    };

    return baseResult;
  }
}