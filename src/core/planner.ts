/**
 *TaskPlanner - Creates execution plans for tasks
 */

import { Task, TaskType } from './unified-types';
import {
  AgentInterface,
  Action,
  ActionType
} from './types';
import { Analysis, ComplexityLevel } from './analyzer';
import { Logger } from '../utils/logger';

export interface ExecutionPlan {
  id: string;
  taskId: string;
  steps: ExecutionStep[];
  estimatedDuration: number;
  parallelizable: boolean;
  rollbackPlan?: RollbackPlan;
  rollback?: RollbackPlan;
  checkpoints: Checkpoint[];
  alternatives: AlternativePlan[];
}

export interface ExecutionStep {
  id: string;
  name: string;
  description: string;
  action: Action;
  dependencies: string[];
  estimatedDuration: number;
  critical: boolean;
  retryable: boolean;
  maxRetries: number;
  validation?: {
    pre?: ValidationRule[];
    post?: ValidationRule[];
    rule?: ValidationRule;
  };
  fallback?: ExecutionStep;
  rollback?: RollbackStep;
  checkpoint?: Checkpoint;
  continueOnError?: boolean;
}

export interface RollbackPlan {
  steps: RollbackStep[];
  trigger: RollbackTrigger;
  enabled?: boolean;
}

export interface RollbackStep {
  action: Action;
  description: string;
  order: number;
}

export enum RollbackTrigger {
  ERROR = 'error',
  VALIDATION_FAILURE = 'validation_failure',
  USER_CANCEL = 'user_cancel',
  TIMEOUT = 'timeout'
}

export interface Checkpoint {
  afterStep: string;
  saveState: boolean;
  validation?: ValidationRule;
}

export interface ValidationRule {
  type: ValidationType;
  condition: any;
  errorMessage?: string;
  description?: string;
  target?: string;
  validator?: (context: any) => Promise<boolean>;
}

export enum ValidationType {
  FILE_EXISTS = 'file_exists',
  FILE_CONTENT = 'file_content',
  COMMAND_SUCCESS = 'command_success',
  CUSTOM = 'custom',
  RESULT_CHECK = 'result_check',
  ARTIFACT_CHECK = 'artifact_check',
  STATE_CHECK = 'state_check'
}

export interface AlternativePlan {
  condition: string;
  steps: ExecutionStep[];
  priority: number;
}

export class Planner {
  private logger: Logger;
  private planCache: Map<string, ExecutionPlan> = new Map();

  constructor(_agent: AgentInterface) {
    this.logger = new Logger('TaskPlanner');
  }

  async initialize(): Promise<void> {
    this.logger.info('TaskPlanner initialized');
  }

  /**
   * Create an execution plan for a task
   */
  async createPlan(task: Task, analysis: Analysis): Promise<ExecutionPlan> {
    this.logger.info(`Creating execution plan for task: ${task.id}`);

    // Check if task already has a plan
    if ((task as any).plan) {
      this.logger.info('Using existing plan from task');
      const existingPlan = (task as any).plan;
      const plan: ExecutionPlan = {
        id: existingPlan.id || `plan-${task.id}`,
        taskId: task.id,
        steps: existingPlan.steps || [],
        estimatedDuration: this.calculateTotalDuration(existingPlan.steps || []),
        parallelizable: existingPlan.parallel !== false,
        rollbackPlan: existingPlan.rollbackPlan,
        checkpoints: existingPlan.checkpoints || [],
        alternatives: existingPlan.alternatives || []
      };
      this.planCache.set(task.id, plan);
      return plan;
    }

    // Check cache
    const cached = this.planCache.get(task.id);
    if (cached) {
      this.logger.debug('Using cached plan');
      return cached;
    }

    // Create plan based on task type and analysis
    let steps: ExecutionStep[];
    
    if (analysis.patterns.length > 0) {
      // Use pattern-based planning
      steps = await this.createPatternBasedPlan(task, analysis);
    } else {
      // Use task-type based planning
      steps = await this.createTypeBasedPlan(task, analysis);
    }

    // Optimize step order
    steps = this.optimizeStepOrder(steps);

    // Add checkpoints
    const checkpoints = this.createCheckpoints(steps);

    // Create rollback plan
    const rollbackPlan = this.createRollbackPlan(steps);

    // Create alternatives
    const alternatives = await this.createAlternatives(task, analysis);

    const plan: ExecutionPlan = {
      id: `plan-${task.id}`,
      taskId: task.id,
      steps,
      estimatedDuration: this.calculateTotalDuration(steps),
      parallelizable: this.canParallelize(steps),
      rollbackPlan,
      checkpoints,
      alternatives
    };

    // Cache plan
    this.planCache.set(task.id, plan);

    return plan;
  }

  /**
   * Create plan based on matched patterns
   */
  private async createPatternBasedPlan(
    _task: Task, analysis: Analysis
  ): Promise<ExecutionStep[]> {
    const steps: ExecutionStep[] = [];
    const pattern = analysis.patterns[0]; // Use highest confidence pattern

    // Handle pattern action if it exists
    if (pattern.action) {
      const step = await this.createStepFromAction(
        pattern.action,
        `pattern-step-0`,
        _task,
        analysis
      );
      steps.push(step);
    }

    return steps;
  }

  /**
   * Create plan based on task type
   */
  private async createTypeBasedPlan(
    task: Task,
    analysis: Analysis
  ): Promise<ExecutionStep[]> {
    switch (task.type) {
      case TaskType.CODE_GENERATION:
        return this.createCodeGenerationPlan(task, analysis);
      case TaskType.BUG_FIXING:
        return this.createBugFixingPlan(task, analysis);
      case TaskType.REFACTORING:
        return this.createRefactoringPlan(task, analysis);
      case TaskType.ANALYSIS:
        return this.createAnalysisPlan(task, analysis);
      case TaskType.DOCUMENTATION:
        return this.createDocumentationPlan(task, analysis);
      case TaskType.TESTING:
        return this.createTestingPlan(task, analysis);
      case TaskType.OPTIMIZATION:
        return this.createOptimizationPlan(task, analysis);
      case TaskType.RESEARCH:
        return this.createResearchPlan(task, analysis);
      default:
        return this.createGeneralPlan(task, analysis);
    }
  }

  /**
   * Create code generation plan
   */
  private async createCodeGenerationPlan(
    task: Task, analysis: Analysis
  ): Promise<ExecutionStep[]> {
    const steps: ExecutionStep[] = [];

    // Check if we have enough context or need to analyze existing code
    const needsAnalysis = task.context.files && task.context.files.length > 0;

    if (needsAnalysis) {
      // Step 1: Analyze existing code structure (optional)
      steps.push({
        id: 'analyze-structure',
        name: 'Analyze Code Structure',
        description: 'Understand existing codebase structure and patterns',
        action: {
          type: ActionType.PARALLEL,
          parameters: {
            actions: [
              { tool: 'glob', params: { pattern: '**/*.{ts,js,py}' } },
              { tool: 'read', params: { files: task.context.files } }
            ]
          }
        },
        dependencies: [],
        estimatedDuration: 3000,
        critical: false,
        retryable: true,
        maxRetries: 3
      });
    }

    // Main step: Generate code using AI
    steps.push({
      id: 'generate-code',
      name: 'Generate Code',
      description: 'Generate the requested code using AI',
      action: {
        type: ActionType.TOOL,
        tool: 'codegen',
        parameters: {
          prompt: task.description,
          language: task.context.language || 'javascript',
          requirements: task.context.requirements || []
        }
      },
      dependencies: needsAnalysis ? ['analyze-structure'] : [],
      estimatedDuration: 15000, // AI generation takes time
      critical: true,
      retryable: true,
      maxRetries: 2
    });

    // Step 4: Validate generated code
    steps.push({
      id: 'validate-code',
      name: 'Validate Code',
      description: 'Ensure generated code is syntactically correct',
      action: {
        type: ActionType.SEQUENTIAL,
        parameters: {
          actions: [
            { tool: 'bash', params: { command: 'npm run typecheck' } },
            { tool: 'bash', params: { command: 'npm run lint' } }
          ]
        }
      },
      dependencies: ['generate-code'],
      estimatedDuration: 4000,
      critical: false,
      retryable: true,
      maxRetries: 1
    });

    // Step 5: Add tests if needed
    if (analysis.requirements.some(r => r.description.includes('test'))) {
      steps.push({
        id: 'generate-tests',
        name: 'Generate Tests',
        description: 'Create unit tests for generated code',
        action: {
          type: ActionType.TOOL,
          tool: 'write',
          parameters: {
            generateTests: true,
            targetFile: 'generated_file'
          }
        },
        dependencies: ['generate-code'],
        estimatedDuration: 4000,
        critical: false,
        retryable: true,
        maxRetries: 2
      });
    }

    return steps;
  }

  /**
   * Create bug fixing plan
   */
  private async createBugFixingPlan(
    task: Task, _analysis: Analysis
  ): Promise<ExecutionStep[]> {
    const steps: ExecutionStep[] = [];

    // Step 1: Locate the bug
    steps.push({
      id: 'locate-bug',
      name: 'Locate Bug',
      description: 'Find the source of the bug',
      action: {
        type: ActionType.PARALLEL,
        parameters: {
          actions: [
            { tool: 'grep', params: { pattern: 'error|bug|issue' } },
            { tool: 'read', params: { files: task.context.files } }
          ]
        }
      },
      dependencies: [],
      estimatedDuration: 3000,
      critical: true,
      retryable: true,
      maxRetries: 2
    });

    // Step 2: Analyze root cause
    steps.push({
      id: 'analyze-cause',
      name: 'Analyze Root Cause',
      description: 'Understand why the bug occurs',
      action: {
        type: ActionType.TRANSFORM,
        transform: (input: any) => this.analyzeRootCause(input)
      },
      dependencies: ['locate-bug'],
      estimatedDuration: 4000,
      critical: true,
      retryable: false,
      maxRetries: 0
    });

    // Step 3: Fix the bug
    steps.push({
      id: 'fix-bug',
      name: 'Fix Bug',
      description: 'Apply the fix to resolve the bug',
      action: {
        type: ActionType.TOOL,
        tool: 'edit',
        parameters: {
          strategy: 'minimal_change',
          preserveStyle: true
        }
      },
      dependencies: ['analyze-cause'],
      estimatedDuration: 3000,
      critical: true,
      retryable: true,
      maxRetries: 3
    });

    // Step 4: Test the fix
    steps.push({
      id: 'test-fix',
      name: 'Test Fix',
      description: 'Verify the bug is fixed',
      action: {
        type: ActionType.TOOL,
        tool: 'bash',
        parameters: {
          command: 'npm test',
          expectSuccess: true
        }
      },
      dependencies: ['fix-bug'],
      estimatedDuration: 5000,
      critical: true,
      retryable: true,
      maxRetries: 2,
      validation: {
        post: [{
          type: ValidationType.COMMAND_SUCCESS,
          condition: 'tests_pass',
          errorMessage: 'Tests still failing after fix'
        }]
      }
    });

    return steps;
  }

  /**
   * Create refactoring plan
   */
  private async createRefactoringPlan(
    task: Task, analysis: Analysis
  ): Promise<ExecutionStep[]> {
    const steps: ExecutionStep[] = [];

    // Step 1: Analyze current code
    steps.push({
      id: 'analyze-current',
      name: 'Analyze Current Code',
      description: 'Understand current code structure and issues',
      action: {
        type: ActionType.PARALLEL,
        parameters: {
          actions: [
            { tool: 'read', params: { files: task.context.files } },
            { tool: 'grep', params: { pattern: 'TODO|FIXME|HACK' } }
          ]
        }
      },
      dependencies: [],
      estimatedDuration: 3000,
      critical: true,
      retryable: true,
      maxRetries: 2
    });

    // Step 2: Identify refactoring opportunities
    steps.push({
      id: 'identify-opportunities',
      name: 'Identify Opportunities',
      description: 'Find areas that need refactoring',
      action: {
        type: ActionType.TRANSFORM,
        transform: (input: any) => this.identifyRefactoringOpportunities(input)
      },
      dependencies: ['analyze-current'],
      estimatedDuration: 2000,
      critical: false,
      retryable: false,
      maxRetries: 0
    });

    // Step 3: Plan refactoring
    steps.push({
      id: 'plan-refactoring',
      name: 'Plan Refactoring',
      description: 'Create detailed refactoring plan',
      action: {
        type: ActionType.COMPOSE,
        parameters: {
          strategy: 'incremental',
          preserveAPI: true
        }
      },
      dependencies: ['identify-opportunities'],
      estimatedDuration: 2000,
      critical: true,
      retryable: false,
      maxRetries: 0
    });

    // Step 4: Execute refactoring
    steps.push({
      id: 'execute-refactoring',
      name: 'Execute Refactoring',
      description: 'Apply refactoring changes',
      action: {
        type: ActionType.TOOL,
        tool: 'multiEdit',
        parameters: {
          preserveFormatting: true,
          atomicChanges: true
        }
      },
      dependencies: ['plan-refactoring'],
      estimatedDuration: 5000,
      critical: true,
      retryable: true,
      maxRetries: 2
    });

    // Step 5: Verify refactoring
    steps.push({
      id: 'verify-refactoring',
      name: 'Verify Refactoring',
      description: 'Ensure code still works correctly',
      action: {
        type: ActionType.SEQUENTIAL,
        parameters: {
          actions: [
            { tool: 'bash', params: { command: 'npm run typecheck' } },
            { tool: 'bash', params: { command: 'npm test' } }
          ]
        }
      },
      dependencies: ['execute-refactoring'],
      estimatedDuration: 5000,
      critical: true,
      retryable: true,
      maxRetries: 1
    });

    return steps;
  }

  /**
   * Create analysis plan
   */
  private async createAnalysisPlan(
    task: Task, analysis: Analysis
  ): Promise<ExecutionStep[]> {
    const steps: ExecutionStep[] = [];

    // Step 1: Gather data
    steps.push({
      id: 'gather-data',
      name: 'Gather Data',
      description: 'Collect all relevant information',
      action: {
        type: ActionType.PARALLEL,
        parameters: {
          actions: [
            { tool: 'glob', params: { pattern: '**/*' } },
            { tool: 'grep', params: { pattern: task.description } },
            { tool: 'read', params: { files: task.context.files } }
          ]
        }
      },
      dependencies: [],
      estimatedDuration: 4000,
      critical: true,
      retryable: true,
      maxRetries: 2
    });

    // Step 2: Analyze data
    steps.push({
      id: 'analyze-data',
      name: 'Analyze Data',
      description: 'Process and analyze gathered information',
      action: {
        type: ActionType.TRANSFORM,
        transform: (input: any) => this.performAnalysis(input, task)
      },
      dependencies: ['gather-data'],
      estimatedDuration: 5000,
      critical: true,
      retryable: false,
      maxRetries: 0
    });

    // Step 3: Generate insights
    steps.push({
      id: 'generate-insights',
      name: 'Generate Insights',
      description: 'Extract meaningful insights from analysis',
      action: {
        type: ActionType.COMPOSE,
        parameters: {
          format: 'structured_report',
          includeRecommendations: true
        }
      },
      dependencies: ['analyze-data'],
      estimatedDuration: 3000,
      critical: false,
      retryable: false,
      maxRetries: 0
    });

    // Step 4: Create report
    steps.push({
      id: 'create-report',
      name: 'Create Report',
      description: 'Generate analysis report',
      action: {
        type: ActionType.TOOL,
        tool: 'write',
        parameters: {
          format: 'markdown',
          includeVisualizations: true
        }
      },
      dependencies: ['generate-insights'],
      estimatedDuration: 2000,
      critical: false,
      retryable: true,
      maxRetries: 1
    });

    return steps;
  }

  /**
   * Create documentation plan
   */
  private async createDocumentationPlan(
    task: Task, analysis: Analysis
  ): Promise<ExecutionStep[]> {
    const steps: ExecutionStep[] = [];

    // Step 1: Analyze code to document
    steps.push({
      id: 'analyze-code',
      name: 'Analyze Code',
      description: 'Understand code structure and functionality',
      action: {
        type: ActionType.TOOL,
        tool: 'read',
        parameters: {
          files: task.context.files,
          extractStructure: true
        }
      },
      dependencies: [],
      estimatedDuration: 3000,
      critical: true,
      retryable: true,
      maxRetries: 2
    });

    // Step 2: Extract documentation points
    steps.push({
      id: 'extract-points',
      name: 'Extract Documentation Points',
      description: 'Identify what needs to be documented',
      action: {
        type: ActionType.TRANSFORM,
        transform: (input: any) => this.extractDocumentationPoints(input)
      },
      dependencies: ['analyze-code'],
      estimatedDuration: 2000,
      critical: false,
      retryable: false,
      maxRetries: 0
    });

    // Step 3: Generate documentation
    steps.push({
      id: 'generate-docs',
      name: 'Generate Documentation',
      description: 'Create comprehensive documentation',
      action: {
        type: ActionType.TOOL,
        tool: 'write',
        parameters: {
          format: 'jsdoc',
          includeExamples: true
        }
      },
      dependencies: ['extract-points'],
      estimatedDuration: 4000,
      critical: true,
      retryable: true,
      maxRetries: 2
    });

    return steps;
  }

  /**
   * Create testing plan
   */
  private async createTestingPlan(
    task: Task, analysis: Analysis
  ): Promise<ExecutionStep[]> {
    const steps: ExecutionStep[] = [];

    // Step 1: Analyze code to test
    steps.push({
      id: 'analyze-testable',
      name: 'Analyze Testable Code',
      description: 'Identify functions and components to test',
      action: {
        type: ActionType.TOOL,
        tool: 'read',
        parameters: {
          files: task.context.files,
          extractFunctions: true
        }
      },
      dependencies: [],
      estimatedDuration: 3000,
      critical: true,
      retryable: true,
      maxRetries: 2
    });

    // Step 2: Generate test cases
    steps.push({
      id: 'generate-cases',
      name: 'Generate Test Cases',
      description: 'Create comprehensive test cases',
      action: {
        type: ActionType.TRANSFORM,
        transform: (input: any) => this.generateTestCases(input)
      },
      dependencies: ['analyze-testable'],
      estimatedDuration: 3000,
      critical: true,
      retryable: false,
      maxRetries: 0
    });

    // Step 3: Write tests
    steps.push({
      id: 'write-tests',
      name: 'Write Tests',
      description: 'Implement test files',
      action: {
        type: ActionType.TOOL,
        tool: 'write',
        parameters: {
          testFramework: 'jest',
          coverage: true
        }
      },
      dependencies: ['generate-cases'],
      estimatedDuration: 5000,
      critical: true,
      retryable: true,
      maxRetries: 2
    });

    // Step 4: Run tests
    steps.push({
      id: 'run-tests',
      name: 'Run Tests',
      description: 'Execute tests and verify coverage',
      action: {
        type: ActionType.TOOL,
        tool: 'bash',
        parameters: {
          command: 'npm test -- --coverage',
          expectSuccess: true
        }
      },
      dependencies: ['write-tests'],
      estimatedDuration: 5000,
      critical: true,
      retryable: true,
      maxRetries: 1
    });

    return steps;
  }

  /**
   * Create optimization plan
   */
  private async createOptimizationPlan(
    task: Task, analysis: Analysis
  ): Promise<ExecutionStep[]> {
    const steps: ExecutionStep[] = [];

    // Step 1: Profile current performance
    steps.push({
      id: 'profile-performance',
      name: 'Profile Performance',
      description: 'Measure current performance metrics',
      action: {
        type: ActionType.TOOL,
        tool: 'bash',
        parameters: {
          command: 'npm run profile',
          captureOutput: true
        }
      },
      dependencies: [],
      estimatedDuration: 5000,
      critical: true,
      retryable: true,
      maxRetries: 1
    });

    // Step 2: Identify bottlenecks
    steps.push({
      id: 'identify-bottlenecks',
      name: 'Identify Bottlenecks',
      description: 'Find performance bottlenecks',
      action: {
        type: ActionType.TRANSFORM,
        transform: (input: any) => this.identifyBottlenecks(input)
      },
      dependencies: ['profile-performance'],
      estimatedDuration: 3000,
      critical: true,
      retryable: false,
      maxRetries: 0
    });

    // Step 3: Apply optimizations
    steps.push({
      id: 'apply-optimizations',
      name: 'Apply Optimizations',
      description: 'Implement performance improvements',
      action: {
        type: ActionType.TOOL,
        tool: 'multiEdit',
        parameters: {
          optimizationLevel: 'aggressive',
          preserveFunctionality: true
        }
      },
      dependencies: ['identify-bottlenecks'],
      estimatedDuration: 5000,
      critical: true,
      retryable: true,
      maxRetries: 2
    });

    // Step 4: Verify improvements
    steps.push({
      id: 'verify-improvements',
      name: 'Verify Improvements',
      description: 'Confirm performance gains',
      action: {
        type: ActionType.SEQUENTIAL,
        parameters: {
          actions: [
            { tool: 'bash', params: { command: 'npm test' } },
            { tool: 'bash', params: { command: 'npm run profile' } }
          ]
        }
      },
      dependencies: ['apply-optimizations'],
      estimatedDuration: 6000,
      critical: true,
      retryable: true,
      maxRetries: 1
    });

    return steps;
  }

  /**
   * Create research plan
   */
  private async createResearchPlan(
    task: Task, analysis: Analysis
  ): Promise<ExecutionStep[]> {
    const steps: ExecutionStep[] = [];

    // Step 1: Search for information
    steps.push({
      id: 'search-info',
      name: 'Search Information',
      description: 'Search for relevant information',
      action: {
        type: ActionType.PARALLEL,
        parameters: {
          actions: [
            { tool: 'webSearch', params: { query: task.description } },
            { tool: 'grep', params: { pattern: task.description } }
          ]
        }
      },
      dependencies: [],
      estimatedDuration: 4000,
      critical: true,
      retryable: true,
      maxRetries: 2
    });

    // Step 2: Fetch detailed information
    steps.push({
      id: 'fetch-details',
      name: 'Fetch Details',
      description: 'Get detailed information from sources',
      action: {
        type: ActionType.TOOL,
        tool: 'webFetch',
        parameters: {
          extractContent: true,
          summarize: true
        }
      },
      dependencies: ['search-info'],
      estimatedDuration: 5000,
      critical: false,
      retryable: true,
      maxRetries: 3
    });

    // Step 3: Analyze findings
    steps.push({
      id: 'analyze-findings',
      name: 'Analyze Findings',
      description: 'Process and analyze research results',
      action: {
        type: ActionType.TRANSFORM,
        transform: (input: any) => this.analyzeResearchFindings(input)
      },
      dependencies: ['fetch-details'],
      estimatedDuration: 3000,
      critical: false,
      retryable: false,
      maxRetries: 0
    });

    // Step 4: Create summary
    steps.push({
      id: 'create-summary',
      name: 'Create Summary',
      description: 'Generate research summary',
      action: {
        type: ActionType.TOOL,
        tool: 'write',
        parameters: {
          format: 'research_report',
          includeReferences: true
        }
      },
      dependencies: ['analyze-findings'],
      estimatedDuration: 3000,
      critical: false,
      retryable: true,
      maxRetries: 1
    });

    return steps;
  }

  /**
   * Create general plan
   */
  private async createGeneralPlan(
    task: Task, analysis: Analysis
  ): Promise<ExecutionStep[]> {
    const steps: ExecutionStep[] = [];

    // Step 1: Initial analysis
    steps.push({
      id: 'initial-analysis',
      name: 'Initial Analysis',
      description: 'Understand the task requirements',
      action: {
        type: ActionType.TRANSFORM,
        transform: (input: any) => this.performInitialAnalysis(task, analysis)
      },
      dependencies: [],
      estimatedDuration: 2000,
      critical: true,
      retryable: false,
      maxRetries: 0
    });

    // Step 2: Execute main action
    steps.push({
      id: 'main-action',
      name: 'Execute Main Action',
      description: 'Perform the primary task action',
      action: {
        type: ActionType.CONDITIONAL,
        parameters: {
          conditions: analysis.suggestedTools.map(tool => ({
            if: `requires_${tool}`,
            then: { tool, params: {} }
          }))
        }
      },
      dependencies: ['initial-analysis'],
      estimatedDuration: 5000,
      critical: true,
      retryable: true,
      maxRetries: 2
    });

    // Step 3: Verify results
    steps.push({
      id: 'verify-results',
      name: 'Verify Results',
      description: 'Ensure task completed successfully',
      action: {
        type: ActionType.TRANSFORM,
        transform: (input: any) => this.verifyResults(input, task)
      },
      dependencies: ['main-action'],
      estimatedDuration: 2000,
      critical: false,
      retryable: false,
      maxRetries: 0
    });

    return steps;
  }

  /**
   * Helper methods
   */
  private async createStepFromAction(
    action: Action,
    stepId: string,
    _task: Task, analysis: Analysis
  ): Promise<ExecutionStep> {
    return {
      id: stepId,
      name: `Execute ${action.type}`,
      description: `Perform ${action.type} action`,
      action,
      dependencies: [],
      estimatedDuration: 3000,
      critical: true,
      retryable: action.type === ActionType.TOOL,
      maxRetries: 2
    };
  }

  private optimizeStepOrder(steps: ExecutionStep[]): ExecutionStep[] {
    // Topological sort based on dependencies
    const sorted: ExecutionStep[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (step: ExecutionStep) => {
      if (visited.has(step.id)) return;
      if (visiting.has(step.id)) {
        throw new Error('Circular dependency detected');
      }

      visiting.add(step.id);

      for (const depId of step.dependencies) {
        const depStep = steps.find(s => s.id === depId);
        if (depStep) visit(depStep);
      }

      visiting.delete(step.id);
      visited.add(step.id);
      sorted.push(step);
    };

    for (const step of steps) {
      visit(step);
    }

    return sorted;
  }

  private createCheckpoints(steps: ExecutionStep[]): Checkpoint[] {
    const checkpoints: Checkpoint[] = [];

    // Add checkpoint after critical steps
    for (const step of steps) {
      if (step.critical) {
        checkpoints.push({
          afterStep: step.id,
          saveState: true,
          validation: step.validation?.rule || step.validation?.post?.[0]
        });
      }
    }

    return checkpoints;
  }

  private createRollbackPlan(steps: ExecutionStep[]): RollbackPlan {
    const rollbackSteps: RollbackStep[] = [];

    // Create rollback for each modifying step
    for (const step of steps) {
      if (step.action.type === ActionType.TOOL && 
          ['write', 'edit', 'multiEdit'].includes(step.action.tool || '')) {
        rollbackSteps.push({
          action: {
            type: ActionType.TOOL,
            tool: 'bash',
            parameters: { command: 'git checkout -- .' }
          },
          description: `Rollback changes from ${step.name}`,
          order: rollbackSteps.length
        });
      }
    }

    return {
      steps: rollbackSteps.reverse(),
      trigger: RollbackTrigger.ERROR
    };
  }

  private async createAlternatives(
    task: Task, analysis: Analysis
  ): Promise<AlternativePlan[]> {
    const alternatives: AlternativePlan[] = [];

    // Alternative for high complexity
    if (analysis.complexity === ComplexityLevel.VERY_COMPLEX) {
      alternatives.push({
        condition: 'main_plan_fails',
        steps: await this.createSimplifiedPlan(task, analysis),
        priority: 1
      });
    }

    return alternatives;
  }

  private async createSimplifiedPlan(
    task: Task, analysis: Analysis
  ): Promise<ExecutionStep[]> {
    // Create a simplified version of the plan
    return [{
      id: 'simplified-execution',
      name: 'Simplified Execution',
      description: 'Execute task with minimal steps',
      action: {
        type: ActionType.TOOL,
        tool: 'task',
        parameters: {
          prompt: task.description,
          subagent_type: 'general-purpose'
        }
      },
      dependencies: [],
      estimatedDuration: 10000,
      critical: true,
      retryable: true,
      maxRetries: 1
    }];
  }

  private calculateTotalDuration(steps: ExecutionStep[]): number {
    // Consider parallelization
    const groups = this.identifyParallelGroups(steps);
    let totalDuration = 0;

    for (const group of groups) {
      const maxDuration = Math.max(...group.map(s => s.estimatedDuration));
      totalDuration += maxDuration;
    }

    return totalDuration;
  }

  private canParallelize(steps: ExecutionStep[]): boolean {
    // Check if any steps can run in parallel
    return steps.some(step => 
      steps.some(other => 
        step.id !== other.id &&
        !step.dependencies.includes(other.id) &&
        !other.dependencies.includes(step.id)
      )
    );
  }

  private identifyParallelGroups(steps: ExecutionStep[]): ExecutionStep[][] {
    const groups: ExecutionStep[][] = [];
    const assigned = new Set<string>();

    for (const step of steps) {
      if (assigned.has(step.id)) continue;

      const group = [step];
      assigned.add(step.id);

      // Find steps that can run in parallel
      for (const other of steps) {
        if (assigned.has(other.id)) continue;
        if (this.canRunInParallel(step, other, steps)) {
          group.push(other);
          assigned.add(other.id);
        }
      }

      groups.push(group);
    }

    return groups;
  }

  private canRunInParallel(
    step1: ExecutionStep,
    step2: ExecutionStep,
    allSteps: ExecutionStep[]
  ): boolean {
    // Check if steps have conflicting dependencies
    return !step1.dependencies.includes(step2.id) &&
           !step2.dependencies.includes(step1.id) &&
           !this.haveSharedDependents(step1, step2, allSteps);
  }

  private haveSharedDependents(
    step1: ExecutionStep,
    step2: ExecutionStep,
    allSteps: ExecutionStep[]
  ): boolean {
    for (const step of allSteps) {
      if (step.dependencies.includes(step1.id) &&
          step.dependencies.includes(step2.id)) {
        return true;
      }
    }
    return false;
  }

  // Transform methods (simplified implementations)
  private extractCodePatterns(input: any): any {
    return { patterns: [], conventions: {} };
  }

  private analyzeRootCause(input: any): any {
    return { cause: 'unknown', confidence: 0.5 };
  }

  private identifyRefactoringOpportunities(input: any): any {
    return { opportunities: [] };
  }

  private performAnalysis(input: any, task: Task): any {
    return { results: {}, insights: [] };
  }

  private extractDocumentationPoints(input: any): any {
    return { points: [] };
  }

  private generateTestCases(input: any): any {
    return { cases: [] };
  }

  private identifyBottlenecks(input: any): any {
    return { bottlenecks: [] };
  }

  private analyzeResearchFindings(input: any): any {
    return { findings: [], summary: '' };
  }

  private performInitialAnalysis(task: Task, analysis: Analysis): any {
    return { approach: 'general', confidence: 0.7 };
  }

  private verifyResults(input: any, task: Task): any {
    return { verified: true, issues: [] };
  }
}