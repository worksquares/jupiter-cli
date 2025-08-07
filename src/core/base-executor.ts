/**
 * TaskExecutor - Executes plans and manages task execution
 */

import { v4 as uuidv4 } from 'uuid';
import {
  Task,
  TaskStatus,
  TaskResult,
  MemoryType
} from './unified-types';
import {
  AgentInterface,
  ActionType
} from './types';
import {
  ExecutionPlan,
  ExecutionStep,
  ValidationRule,
  ValidationType
} from './planner';
import { Logger } from '../utils/logger';

// ExecutionRecord interface removed - not used

// PQueue import removed - not used

export interface ExecutionContext {
  task: Task;
  plan: ExecutionPlan;
  results: Map<string, StepResult>;
  artifacts: Map<string, any>;
  state: ExecutionState;
  startTime: number;
  checkpoints: Map<string, Checkpoint>;
  stepResults: Record<string, any>;
}

export interface StepResult {
  stepId: string;
  success: boolean;
  output: any;
  error?: Error;
  duration: number;
  retries: number;
}

export interface ExecutionState {
  currentStep: string | null;
  completedSteps: Set<string>;
  failedSteps: Set<string>;
  skippedSteps: Set<string>;
  status: ExecutionStatus;
}

export enum ExecutionStatus {
  NOT_STARTED = 'not_started',
  RUNNING = 'running',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
  ROLLED_BACK = 'rolled_back'
}

export interface Checkpoint {
  stepId: string;
  state: any;
  timestamp: number;
}

export class BaseExecutor {
  private agent: AgentInterface;
  private logger: Logger;
  private activeExecutions: Map<string, ExecutionContext> = new Map();

  constructor(agent: AgentInterface) {
    this.agent = agent;
    this.logger = new Logger('TaskExecutor');
  }

  async initialize(): Promise<void> {
    this.logger.info('TaskExecutor initialized');
  }

  /**
   * Execute a task plan
   */
  async execute(task: Task, plan: ExecutionPlan): Promise<TaskResult> {
    const context: ExecutionContext = {
      task,
      plan,
      results: new Map(),
      artifacts: new Map(),
      state: {
        currentStep: null,
        completedSteps: new Set(),
        failedSteps: new Set(),
        skippedSteps: new Set(),
        status: ExecutionStatus.NOT_STARTED
      },
      startTime: Date.now(),
      checkpoints: new Map(),
      stepResults: {}
    };

    this.activeExecutions.set(task.id, context);

    try {
      // Validate plan before execution
      this.validatePlan(plan);

      // Update status
      context.state.status = ExecutionStatus.RUNNING;
      
      // Execute steps
      const result = await this.executePlan(context);
      
      // Store result
      await this.storeExecutionResult(task, result);
      
      return result;
    } catch (error) {
      this.logger.error('Execution failed', error);
      
      // Attempt rollback if configured
      if (plan.rollback?.enabled) {
        await this.rollback(context);
      }
      
      throw error;
    } finally {
      this.activeExecutions.delete(task.id);
    }
  }

  /**
   * Pause execution
   */
  async pause(taskId: string): Promise<void> {
    const context = this.activeExecutions.get(taskId);
    if (!context) {
      throw new Error(`No active execution for task ${taskId}`);
    }

    context.state.status = ExecutionStatus.PAUSED;
    this.logger.info(`Paused execution for task ${taskId}`);
  }

  /**
   * Resume execution
   */
  async resume(taskId: string): Promise<void> {
    const context = this.activeExecutions.get(taskId);
    if (!context) {
      throw new Error(`No active execution for task ${taskId}`);
    }

    if (context.state.status !== ExecutionStatus.PAUSED) {
      throw new Error(`Task ${taskId} is not paused`);
    }

    context.state.status = ExecutionStatus.RUNNING;
    this.logger.info(`Resumed execution for task ${taskId}`);
    
    // Continue execution from current step
    await this.executePlan(context);
  }

  /**
   * Cancel execution
   */
  async cancel(taskId: string): Promise<void> {
    const context = this.activeExecutions.get(taskId);
    if (!context) {
      throw new Error(`No active execution for task ${taskId}`);
    }

    context.state.status = ExecutionStatus.FAILED;
    this.activeExecutions.delete(taskId);
    
    this.logger.info(`Cancelled execution for task ${taskId}`);
  }

  /**
   * Private methods
   */
  private validatePlan(plan: ExecutionPlan): void {
    if (!plan.steps || plan.steps.length === 0) {
      throw new Error('Execution plan has no steps');
    }

    // Validate step IDs are unique
    const stepIds = new Set<string>();
    for (const step of plan.steps) {
      if (stepIds.has(step.id)) {
        throw new Error(`Duplicate step ID: ${step.id}`);
      }
      stepIds.add(step.id);
    }

    // Validate dependencies
    for (const step of plan.steps) {
      for (const dep of step.dependencies) {
        if (!stepIds.has(dep)) {
          throw new Error(`Step ${step.id} depends on unknown step ${dep}`);
        }
      }
    }
  }

  protected async executePlan(context: ExecutionContext): Promise<TaskResult> {
    const { plan, state } = context;
    
    // Get execution order
    const executionOrder = this.getExecutionOrder(plan.steps);
    
    for (const stepId of executionOrder) {
      // Check if paused or cancelled
      if (state.status === ExecutionStatus.PAUSED) {
        return this.createIntermediateResult(context);
      }
      
      if (state.status === ExecutionStatus.FAILED) {
        throw new Error('Execution cancelled');
      }
      
      // Skip if already completed
      if (state.completedSteps.has(stepId)) {
        continue;
      }
      
      // Execute step
      const step = plan.steps.find(s => s.id === stepId)!;
      state.currentStep = stepId;
      
      try {
        const result = await this.executeStep(step, context);
        context.results.set(stepId, result);
        state.completedSteps.add(stepId);
        
        // Create checkpoint if configured
        if (step.checkpoint) {
          await this.createCheckpoint(context, stepId);
        }
        
      } catch (error) {
        state.failedSteps.add(stepId);
        
        // Check if should continue
        if (!step.continueOnError) {
          state.status = ExecutionStatus.FAILED;
          throw error;
        }
        
        // Store error result
        context.results.set(stepId, {
          stepId,
          success: false,
          output: null,
          error: error as Error,
          duration: 0,
          retries: step.maxRetries || 0
        });
      }
    }
    
    // All steps completed
    state.status = ExecutionStatus.COMPLETED;
    return this.createFinalResult(context);
  }

  private async executeStep(
    step: ExecutionStep, 
    context: ExecutionContext
  ): Promise<StepResult> {
    const startTime = Date.now();
    let retries = 0;
    let lastError: Error | undefined;
    
    while (retries <= (step.maxRetries || 0)) {
      try {
        // Validate preconditions
        if (step.validation?.pre) {
          await this.validateConditions(step.validation.pre, context);
        }
        
        // Execute action
        const output = await this.executeAction(step.action, context);
        
        // Validate postconditions
        if (step.validation?.post) {
          await this.validateConditions(step.validation.post, context);
        }
        
        return {
          stepId: step.id,
          success: true,
          output,
          duration: Date.now() - startTime,
          retries
        };
        
      } catch (error) {
        lastError = error as Error;
        retries++;
        
        if (retries <= (step.maxRetries || 0)) {
          this.logger.warn(`Step ${step.id} failed, retrying (${retries}/${step.maxRetries})`);
          await this.delay(1000 * retries); // Exponential backoff
        }
      }
    }
    
    throw lastError || new Error(`Step ${step.id} failed after ${retries} retries`);
  }

  private async executeAction(
    action: any,
    context: ExecutionContext
  ): Promise<any> {
    
    switch (action.type) {
      case ActionType.TOOL:
        return await this.executeTool(action, context);
        
      case ActionType.PROCESS_DATA:
        return await this.processData(action, context);
        
      case ActionType.ANALYZE:
        return await this.analyze(action, context);
        
      case ActionType.DECIDE:
        return await this.decide(action, context);
        
      case ActionType.STORE:
        return await this.store(action, context);
        
      case ActionType.RECALL:
        return await this.recall(action, context);
        
      case ActionType.TRANSFORM:
        return await this.transform(action, context);
        
      case ActionType.COMPOSE:
        return await this.compose(action, context);
        
      case ActionType.PARALLEL:
        // For parallel actions, execute all sub-actions concurrently
        if (action.actions && Array.isArray(action.actions)) {
          const results = await Promise.all(
            action.actions.map((subAction: any) => this.executeAction(subAction, context))
          );
          return { type: 'parallel', results };
        }
        return { type: 'parallel', results: [] };
        
      case ActionType.SEQUENTIAL:
        // For sequential actions, execute sub-actions one by one
        if (action.actions && Array.isArray(action.actions)) {
          const results = [];
          for (const subAction of action.actions) {
            const result = await this.executeAction(subAction, context);
            results.push(result);
            // Update context with result for next action
            context.stepResults[`${subAction.id || 'seq'}-${results.length}`] = result;
          }
          return { type: 'sequential', results };
        }
        return { type: 'sequential', results: [] };
        
      case ActionType.CONDITIONAL:
        // For conditional actions, evaluate condition and execute appropriate branch
        if (action.condition) {
          const conditionResult = this.evaluateCondition(context, action.condition);
          if (conditionResult && action.thenAction) {
            return await this.executeAction(action.thenAction, context);
          } else if (!conditionResult && action.elseAction) {
            return await this.executeAction(action.elseAction, context);
          }
        }
        return { type: 'conditional', executed: false };
        
      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }
  }


  private async executeTool(action: any, context: ExecutionContext): Promise<any> {
    const tool = this.agent.tools.get(action.tool);
    if (!tool) {
      throw new Error(`Tool not found: ${action.tool}`);
    }
    
    // Prepare parameters (may reference previous results)
    const params = this.resolveParameters(action.parameters, context);
    
    // Execute tool
    const result = await tool.execute(params);
    
    // Store artifact if specified
    if (action.artifact) {
      context.artifacts.set(action.artifact, result);
    }
    
    return result;
  }

  private async processData(action: any, context: ExecutionContext): Promise<any> {
    // Get input data
    const input = this.resolveParameters(action.input, context);
    
    // Apply transformations
    let result = input;
    for (const transform of action.transformations || []) {
      result = await this.applyTransformation(result, transform);
    }
    
    return result;
  }

  private async analyze(action: any, context: ExecutionContext): Promise<any> {
    const input = this.resolveParameters(action.input, context);
    
    // Perform analysis based on type
    switch (action.analysisType) {
      case 'pattern':
        return await this.agent.analyzer.findPatterns(input);
      case 'complexity':
        return await this.agent.analyzer.assessComplexity(input);
      case 'requirements':
        return await this.agent.analyzer.extractRequirements(input);
      default:
        throw new Error(`Unknown analysis type: ${action.analysisType}`);
    }
  }

  private async decide(action: any, context: ExecutionContext): Promise<any> {
    const input = this.resolveParameters(action.input, context);
    
    // Make decision based on criteria
    for (const criterion of action.criteria) {
      if (this.evaluateCriterion(input, criterion)) {
        return criterion.result;
      }
    }
    
    return action.defaultResult;
  }

  private async store(action: any, context: ExecutionContext): Promise<void> {
    const data = this.resolveParameters(action.data, context);
    const memory = {
      ...data,
      type: action.memoryType,
      importance: action.importance || 0.5
    };
    
    await this.agent.memory.store(memory);
  }

  private async recall(action: any, context: ExecutionContext): Promise<any> {
    const query = this.resolveParameters(action.query, context);
    return await this.agent.memory.retrieve(query);
  }

  private async transform(action: any, context: ExecutionContext): Promise<any> {
    const input = this.resolveParameters(action.input, context);
    
    // Apply transformation based on transform type
    if (action.transformationType) {
      return this.applyTransformation(input, {
        type: action.transformationType,
        ...action
      });
    }
    
    // Custom transformation function
    if (action.transformer && typeof action.transformer === 'function') {
      return action.transformer(input);
    }
    
    return input;
  }

  private async compose(action: any, context: ExecutionContext): Promise<any> {
    // Compose results from multiple sources
    const sources = action.sources || [];
    const composed: any = {};
    
    for (const source of sources) {
      const sourceData = this.resolveParameters(source.data, context);
      if (source.field) {
        composed[source.field] = sourceData;
      } else if (typeof sourceData === 'object') {
        Object.assign(composed, sourceData);
      }
    }
    
    // Apply template if provided
    if (action.template) {
      return this.applyTemplate(action.template, composed);
    }
    
    return composed;
  }

  private async validateConditions(
    rules: ValidationRule[],
    context: ExecutionContext
  ): Promise<void> {
    for (const rule of rules) {
      const isValid = await this.evaluateRule(rule, context);
      if (!isValid) {
        throw new Error(`Validation failed: ${rule.description || rule.errorMessage || 'Unknown validation error'}`);
      }
    }
  }

  private async evaluateRule(
    rule: ValidationRule,
    context: ExecutionContext
  ): Promise<boolean> {
    switch (rule.type) {
      case ValidationType.RESULT_CHECK:
        return this.checkResult(rule, context);
        
      case ValidationType.ARTIFACT_CHECK:
        return this.checkArtifact(rule, context);
        
      case ValidationType.STATE_CHECK:
        return this.checkState(rule, context);
        
      case ValidationType.CUSTOM:
        return await this.evaluateCustomRule(rule, context);
        
      default:
        return true;
    }
  }

  private checkResult(rule: ValidationRule, context: ExecutionContext): boolean {
    if (!rule.target) return false;
    const result = context.results.get(rule.target);
    if (!result) return false;
    
    return this.evaluateCondition(result.output, rule.condition);
  }

  private checkArtifact(rule: ValidationRule, context: ExecutionContext): boolean {
    if (!rule.target) return false;
    const artifact = context.artifacts.get(rule.target);
    if (!artifact) return false;
    
    return this.evaluateCondition(artifact, rule.condition);
  }

  private checkState(rule: ValidationRule, context: ExecutionContext): boolean {
    return this.evaluateCondition(context.state, rule.condition);
  }

  private async evaluateCustomRule(
    rule: ValidationRule,
    context: ExecutionContext
  ): Promise<boolean> {
    // Custom validation logic
    if (rule.validator) {
      return await rule.validator(context);
    }
    return true;
  }

  private evaluateCondition(value: any, condition: any): boolean {
    // Simple condition evaluation
    if (condition.equals !== undefined) {
      return value === condition.equals;
    }
    if (condition.notEquals !== undefined) {
      return value !== condition.notEquals;
    }
    if (condition.contains !== undefined) {
      return value?.includes?.(condition.contains);
    }
    if (condition.matches !== undefined) {
      return new RegExp(condition.matches).test(value);
    }
    return true;
  }

  private async rollback(context: ExecutionContext): Promise<void> {
    this.logger.info('Starting rollback...');
    const { plan, state } = context;
    
    // Execute rollback steps in reverse order
    const completedSteps = Array.from(state.completedSteps).reverse();
    
    for (const stepId of completedSteps) {
      const step = plan.steps.find(s => s.id === stepId);
      if (!step?.rollback) continue;
      
      try {
        await this.executeRollbackAction(step.rollback, context);
        state.completedSteps.delete(stepId);
      } catch (error) {
        this.logger.error(`Rollback failed for step ${stepId}`, error);
      }
    }
    
    state.status = ExecutionStatus.ROLLED_BACK;
  }

  private async executeRollbackAction(action: any, context: ExecutionContext): Promise<void> {
    // Execute rollback action
    switch (action.type) {
      case 'undo-tool':
        await this.undoToolAction(action, context);
        break;
      case 'restore-state':
        await this.restoreState(action, context);
        break;
      case 'custom':
        await action.handler(context);
        break;
    }
  }

  private async undoToolAction(action: any, context: ExecutionContext): Promise<void> {
    const tool = this.agent.tools.get(action.tool);
    if (!tool) return;
    
    const params = this.resolveParameters(action.parameters, context);
    await tool.execute(params);
  }

  private async restoreState(action: any, context: ExecutionContext): Promise<void> {
    const checkpoint = context.checkpoints.get(action.checkpointId);
    if (!checkpoint) return;
    
    // Restore state from checkpoint
    Object.assign(context.state, checkpoint.state);
  }

  private async createCheckpoint(context: ExecutionContext, stepId: string): Promise<void> {
    const checkpoint: Checkpoint = {
      stepId,
      state: { ...context.state },
      timestamp: Date.now()
    };
    
    context.checkpoints.set(stepId, checkpoint);
  }

  private async storeExecutionResult(task: Task, result: TaskResult): Promise<void> {
    // Store execution details in memory
    await this.agent.memory.store({
      id: uuidv4(),
      type: MemoryType.EPISODIC,
      content: {
        taskId: task.id,
        taskType: task.type,
        result: result.success,
        duration: result.metadata?.duration,
        steps: result.metadata?.steps
      },
      timestamp: new Date(),
      accessCount: 0,
      lastAccessed: new Date(),
      importance: result.success ? 0.7 : 0.9,
      associations: [task.id]
    });
  }

  private createIntermediateResult(context: ExecutionContext): TaskResult {
    return {
      taskId: context.task.id,
      success: false,
      status: TaskStatus.IN_PROGRESS,
      output: null,
      metadata: {
        completedSteps: Array.from(context.state.completedSteps),
        currentStep: context.state.currentStep,
        duration: Date.now() - context.startTime
      }
    };
  }

  protected createFinalResult(context: ExecutionContext): TaskResult {
    const artifacts: { [key: string]: any } = {};
    context.artifacts.forEach((value, key) => {
      artifacts[key] = value;
    });
    
    return {
      taskId: context.task.id,
      success: context.state.failedSteps.size === 0,
      status: context.state.failedSteps.size === 0 ? TaskStatus.COMPLETED : TaskStatus.FAILED,
      output: artifacts,
      metadata: {
        completedSteps: Array.from(context.state.completedSteps),
        failedSteps: Array.from(context.state.failedSteps),
        duration: Date.now() - context.startTime,
        steps: context.plan.steps.length
      }
    };
  }

  private getExecutionOrder(steps: ExecutionStep[]): string[] {
    // Topological sort for dependency resolution
    const visited = new Set<string>();
    const order: string[] = [];
    
    const visit = (stepId: string) => {
      if (visited.has(stepId)) return;
      
      const step = steps.find(s => s.id === stepId);
      if (!step) return;
      
      // Visit dependencies first
      for (const dep of step.dependencies) {
        visit(dep);
      }
      
      visited.add(stepId);
      order.push(stepId);
    };
    
    // Visit all steps
    for (const step of steps) {
      visit(step.id);
    }
    
    return order;
  }

  private resolveParameters(params: any, context: ExecutionContext): any {
    if (typeof params === 'string' && params.startsWith('$')) {
      // Reference to previous result or artifact
      const ref = params.substring(1);
      if (ref.startsWith('results.')) {
        const stepId = ref.substring(8);
        return context.results.get(stepId)?.output;
      }
      if (ref.startsWith('artifacts.')) {
        const artifactId = ref.substring(10);
        return context.artifacts.get(artifactId);
      }
    }
    
    if (typeof params === 'object' && params !== null) {
      // Recursively resolve nested parameters
      const resolved: { [key: string]: any } = {};
      for (const [key, value] of Object.entries(params)) {
        resolved[key] = this.resolveParameters(value, context);
      }
      return resolved;
    }
    
    return params;
  }

  private applyTransformation(data: any, transform: any): any {
    switch (transform.type) {
      case 'map':
        return data.map(transform.function);
      case 'filter':
        return data.filter(transform.function);
      case 'reduce':
        return data.reduce(transform.function, transform.initial);
      case 'extract':
        return this.extractField(data, transform.field);
      default:
        return data;
    }
  }

  private extractField(data: any, field: string): any {
    const parts = field.split('.');
    let result = data;
    for (const part of parts) {
      result = result?.[part];
    }
    return result;
  }

  private evaluateCriterion(input: any, criterion: any): boolean {
    // Evaluate decision criterion
    if (criterion.condition) {
      return this.evaluateCondition(input, criterion.condition);
    }
    return false;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private applyTemplate(template: string, data: any): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return data[key] || match;
    });
  }
}
