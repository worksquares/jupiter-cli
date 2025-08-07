/**
 * Tool Batcher - Intelligent batching and parallel execution of tools
 */

import { Tool } from './types';
import { Logger } from '../utils/logger';

export interface BatchableToolCall {
  toolName: string;
  parameters: any;
  id?: string;
  dependencies?: string[];
}

export interface BatchExecutionResult {
  id: string;
  toolName: string;
  success: boolean;
  result?: any;
  error?: Error;
  duration: number;
}

export interface BatchExecutionOptions {
  maxConcurrency?: number;
  timeout?: number;
  continueOnError?: boolean;
  retryFailures?: boolean;
  maxRetries?: number;
}

export class ToolBatcher {
  private logger: Logger;
  private tools: Map<string, Tool>;

  constructor(tools: Map<string, Tool>) {
    this.logger = new Logger('ToolBatcher');
    this.tools = tools;
  }

  /**
   * Execute multiple tools with intelligent batching and parallelization
   */
  async executeBatch(
    calls: BatchableToolCall[], 
    options: BatchExecutionOptions = {}
  ): Promise<BatchExecutionResult[]> {
    const {
      maxConcurrency = 5,
      timeout = 30000,
      continueOnError = true,
      retryFailures = true,
      maxRetries = 2
    } = options;

    // Analyze dependencies and create execution groups
    const groups = this.analyzeAndGroupCalls(calls);
    const results: BatchExecutionResult[] = [];
    const resultMap = new Map<string, BatchExecutionResult>();

    this.logger.info(`Executing ${calls.length} tools in ${groups.length} groups`);

    // Execute groups in order
    for (const group of groups) {
      const groupResults = await this.executeGroup(
        group, 
        resultMap,
        { maxConcurrency, timeout, continueOnError, retryFailures, maxRetries }
      );
      
      results.push(...groupResults);
      
      // Store results for dependency resolution
      groupResults.forEach(result => {
        if (result.id) {
          resultMap.set(result.id, result);
        }
      });

      // Stop if critical failure and continueOnError is false
      if (!continueOnError && groupResults.some(r => !r.success)) {
        break;
      }
    }

    return results;
  }

  /**
   * Analyze tool calls and group them for optimal execution
   */
  private analyzeAndGroupCalls(calls: BatchableToolCall[]): BatchableToolCall[][] {
    // Assign IDs if not present
    calls.forEach((call, index) => {
      if (!call.id) {
        call.id = `tool-${index}`;
      }
    });

    // Build dependency graph
    const graph = new Map<string, Set<string>>();
    const inDegree = new Map<string, number>();
    
    calls.forEach(call => {
      graph.set(call.id!, new Set(call.dependencies || []));
      inDegree.set(call.id!, (call.dependencies || []).length);
    });

    // Topological sort with level grouping
    const groups: BatchableToolCall[][] = [];
    const processed = new Set<string>();

    while (processed.size < calls.length) {
      const currentGroup = calls.filter(call => {
        if (processed.has(call.id!)) return false;
        
        const deps = call.dependencies || [];
        return deps.every(dep => processed.has(dep));
      });

      if (currentGroup.length === 0) {
        // Circular dependency detected
        this.logger.warn('Circular dependency detected in tool calls');
        break;
      }

      groups.push(currentGroup);
      currentGroup.forEach(call => processed.add(call.id!));
    }

    return groups;
  }

  /**
   * Execute a group of tools in parallel
   */
  private async executeGroup(
    group: BatchableToolCall[],
    previousResults: Map<string, BatchExecutionResult>,
    options: BatchExecutionOptions
  ): Promise<BatchExecutionResult[]> {
    const { maxConcurrency, timeout, retryFailures, maxRetries } = options;

    // Create execution promises with concurrency control
    const executions = group.map(call => async () => {
      const startTime = Date.now();
      
      try {
        // Resolve parameters that may reference previous results
        const resolvedParams = this.resolveParameters(call.parameters, previousResults);
        
        // Execute with retry logic
        let lastError: Error | undefined;
        let attempts = 0;
        
        while (attempts <= (retryFailures ? maxRetries! : 0)) {
          try {
            const tool = this.tools.get(call.toolName);
            if (!tool) {
              throw new Error(`Tool not found: ${call.toolName}`);
            }

            const result = await this.executeWithTimeout(
              tool.execute(resolvedParams),
              timeout!
            );

            return {
              id: call.id!,
              toolName: call.toolName,
              success: true,
              result,
              duration: Date.now() - startTime
            };
          } catch (error) {
            lastError = error as Error;
            attempts++;
            
            if (attempts <= (retryFailures ? maxRetries! : 0)) {
              this.logger.warn(`Tool ${call.toolName} failed, retrying (${attempts}/${maxRetries})`);
              await this.delay(Math.pow(2, attempts) * 1000); // Exponential backoff
            }
          }
        }

        throw lastError || new Error('Unknown error');
      } catch (error) {
        return {
          id: call.id!,
          toolName: call.toolName,
          success: false,
          error: error as Error,
          duration: Date.now() - startTime
        };
      }
    });

    // Execute with concurrency limit
    return await this.executeWithConcurrency(executions, maxConcurrency!);
  }

  /**
   * Execute promises with concurrency limit
   */
  private async executeWithConcurrency<T>(
    tasks: (() => Promise<T>)[],
    maxConcurrency: number
  ): Promise<T[]> {
    const results: T[] = [];
    const executing: Promise<void>[] = [];

    for (const task of tasks) {
      const promise = task().then(result => {
        results.push(result);
      });

      executing.push(promise);

      if (executing.length >= maxConcurrency) {
        await Promise.race(executing);
        executing.splice(executing.findIndex(p => 
          p === promise || (p as any).status === 'fulfilled'
        ), 1);
      }
    }

    await Promise.all(executing);
    return results;
  }

  /**
   * Execute with timeout
   */
  private executeWithTimeout<T>(promise: Promise<T>, timeout: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), timeout)
      )
    ]);
  }

  /**
   * Resolve parameters that may reference previous results
   */
  private resolveParameters(
    params: any, 
    previousResults: Map<string, BatchExecutionResult>
  ): any {
    if (typeof params === 'string' && params.startsWith('$result.')) {
      const resultId = params.substring(8);
      const result = previousResults.get(resultId);
      return result?.result;
    }

    if (typeof params === 'object' && params !== null) {
      const resolved: any = Array.isArray(params) ? [] : {};
      
      for (const [key, value] of Object.entries(params)) {
        resolved[key] = this.resolveParameters(value, previousResults);
      }
      
      return resolved;
    }

    return params;
  }

  /**
   * Analyze if tools can be batched together
   */
  analyzeToolCompatibility(calls: BatchableToolCall[]): {
    batchable: BatchableToolCall[][];
    reasons: Map<string, string>;
  } {
    const reasons = new Map<string, string>();
    const batchable: BatchableToolCall[][] = [];
    
    // Group by tool type
    const toolGroups = new Map<string, BatchableToolCall[]>();
    
    calls.forEach(call => {
      if (!toolGroups.has(call.toolName)) {
        toolGroups.set(call.toolName, []);
      }
      toolGroups.get(call.toolName)!.push(call);
    });

    // Analyze each tool group
    toolGroups.forEach((group, toolName) => {
      const tool = this.tools.get(toolName);
      
      if (!tool) {
        reasons.set(toolName, 'Tool not found');
        return;
      }

      // Check if tool supports batching (could be a tool property)
      if (this.isReadOnlyTool(toolName)) {
        batchable.push(group);
        reasons.set(toolName, 'Read-only tool - safe to batch');
      } else if (this.isIdempotentTool(toolName)) {
        // Group idempotent tools but limit batch size
        const maxBatchSize = 10;
        for (let i = 0; i < group.length; i += maxBatchSize) {
          batchable.push(group.slice(i, i + maxBatchSize));
        }
        reasons.set(toolName, 'Idempotent tool - batched with size limit');
      } else {
        // Non-batchable tools execute individually
        group.forEach(call => batchable.push([call]));
        reasons.set(toolName, 'State-modifying tool - execute individually');
      }
    });

    return { batchable, reasons };
  }

  /**
   * Check if tool is read-only
   */
  private isReadOnlyTool(toolName: string): boolean {
    const readOnlyTools = ['read', 'grep', 'glob', 'search', 'analyze', 'list'];
    return readOnlyTools.includes(toolName.toLowerCase());
  }

  /**
   * Check if tool is idempotent
   */
  private isIdempotentTool(toolName: string): boolean {
    const idempotentTools = ['validate', 'check', 'test', 'verify'];
    return idempotentTools.includes(toolName.toLowerCase());
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}