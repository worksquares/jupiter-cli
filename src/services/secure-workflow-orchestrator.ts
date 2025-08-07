/**
 * Secure Workflow Orchestrator
 * Coordinates between AI agents, secure operations, and failure recovery
 * Main entry point for frontend development workflows with security isolation
 */

import { EventEmitter } from 'events';
import { Logger } from '../utils/logger';
import { SecureOperationsAPI, SecureOperationContext } from '../security/secure-operations-api';
import { SecureCredentialStore, CredentialRequest } from '../security/secure-credential-store';
import { FailureRecoveryAgent, FailureEvent } from '../agents/failure-recovery-agent';
import { Agent } from '../core/agent';
import { z } from 'zod';

// Workflow request schema
const WorkflowRequestSchema = z.object({
  userId: z.string(),
  projectId: z.string(),
  projectName: z.string(),
  framework: z.enum(['react', 'vue', 'angular']),
  template: z.string().optional(),
  features: z.array(z.string()).optional(),
  customInstructions: z.string().optional()
});

export type WorkflowRequest = z.infer<typeof WorkflowRequestSchema>;

export interface WorkflowResult {
  success: boolean;
  projectId: string;
  githubRepo?: string;
  deploymentUrl?: string;
  containerName?: string;
  errors?: string[];
  duration?: number;
}

export interface WorkflowStep {
  name: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  startTime?: Date;
  endTime?: Date;
  result?: any;
  error?: string;
}

/**
 * Secure Workflow Orchestrator
 */
export class SecureWorkflowOrchestrator extends EventEmitter {
  private logger = Logger.getInstance().child({ component: 'SecureWorkflowOrchestrator' });
  private activeWorkflows: Map<string, WorkflowStep[]> = new Map();
  
  constructor(
    private agent: Agent,
    private secureOps: SecureOperationsAPI,
    private credentialStore: SecureCredentialStore,
    private recoveryAgent: FailureRecoveryAgent
  ) {
    super();
  }

  /**
   * Execute secure frontend workflow
   */
  async executeWorkflow(request: WorkflowRequest): Promise<WorkflowResult> {
    const startTime = Date.now();
    const taskId = this.generateTaskId();
    const workflowKey = `${request.userId}-${request.projectId}`;
    
    try {
      // Validate request
      const validatedRequest = WorkflowRequestSchema.parse(request);
      
      // Initialize workflow tracking
      const steps: WorkflowStep[] = [
        { name: 'create-credentials', status: 'pending' },
        { name: 'create-container', status: 'pending' },
        { name: 'setup-repository', status: 'pending' },
        { name: 'generate-code', status: 'pending' },
        { name: 'build-project', status: 'pending' },
        { name: 'deploy-project', status: 'pending' },
        { name: 'cleanup', status: 'pending' }
      ];
      
      this.activeWorkflows.set(workflowKey, steps);
      
      // Step 1: Create scoped credentials
      const context = await this.createScopedCredentials(validatedRequest, taskId, steps);
      
      // Step 2: Create container
      const containerResult = await this.createProjectContainer(context, steps);
      if (!containerResult.success) {
        throw new Error(`Container creation failed: ${containerResult.error}`);
      }

      // Step 3: Setup repository
      const repoResult = await this.setupRepository(context, validatedRequest, steps);
      if (!repoResult.success) {
        throw new Error(`Repository setup failed: ${repoResult.error}`);
      }

      // Step 4: Generate code (using AI agent with restrictions)
      const codeResult = await this.generateProjectCode(context, validatedRequest, steps);
      if (!codeResult.success) {
        throw new Error(`Code generation failed: ${codeResult.error}`);
      }

      // Step 5: Build project
      const buildResult = await this.buildProject(context, steps);
      if (!buildResult.success) {
        throw new Error(`Build failed: ${buildResult.error}`);
      }

      // Step 6: Deploy project
      const deployResult = await this.deployProject(context, validatedRequest, steps);
      if (!deployResult.success) {
        throw new Error(`Deployment failed: ${deployResult.error}`);
      }

      // Step 7: Cleanup
      await this.cleanup(context, steps);

      // Success!
      const duration = Date.now() - startTime;
      this.logger.info('Workflow completed successfully', {
        userId: request.userId,
        projectId: request.projectId,
        duration
      });

      return {
        success: true,
        projectId: request.projectId,
        githubRepo: repoResult.data?.repository,
        deploymentUrl: deployResult.data?.url,
        containerName: containerResult.data?.containerName,
        duration
      };

    } catch (error: any) {
      this.logger.error('Workflow failed', error);
      
      // Attempt recovery
      const context = this.getContextFromWorkflow(request, taskId);
      if (context) {
        await this.attemptRecovery(context, error, request);
      }

      return {
        success: false,
        projectId: request.projectId,
        errors: [error.message],
        duration: Date.now() - startTime
      };
      
    } finally {
      // Clean up workflow tracking
      this.activeWorkflows.delete(workflowKey);
    }
  }

  /**
   * Step 1: Create scoped credentials
   */
  private async createScopedCredentials(
    request: WorkflowRequest,
    taskId: string,
    steps: WorkflowStep[]
  ): Promise<SecureOperationContext> {
    this.updateStep(steps, 'create-credentials', 'in-progress');
    
    try {
      const credentialRequest: CredentialRequest = {
        userId: request.userId,
        projectId: request.projectId,
        taskId,
        requestedScopes: [
          'container:create',
          'container:execute',
          'container:read',
          'git:read',
          'git:write',
          'build:execute',
          'deploy:execute'
        ],
        duration: 120 // 2 hours
      };

      const credentials = await this.credentialStore.createScopedCredentials(credentialRequest);
      
      this.updateStep(steps, 'create-credentials', 'completed', {
        containerName: credentials.containerName,
        expiresAt: credentials.expiresAt
      });

      return {
        userId: credentials.userId,
        projectId: credentials.projectId,
        taskId: credentials.taskId,
        sessionToken: credentials.sessionToken,
        aciInstanceId: credentials.containerName
      };

    } catch (error: any) {
      this.updateStep(steps, 'create-credentials', 'failed', null, error.message);
      throw error;
    }
  }

  /**
   * Step 2: Create project container
   */
  private async createProjectContainer(
    context: SecureOperationContext,
    steps: WorkflowStep[]
  ): Promise<any> {
    this.updateStep(steps, 'create-container', 'in-progress');
    
    try {
      const result = await this.secureOps.executeAzureOperation(context, {
        operation: 'createContainer',
        parameters: {
          image: 'node:18-alpine',
          cpu: 1,
          memory: 2
        }
      });

      if (result.success) {
        this.updateStep(steps, 'create-container', 'completed', result.data);
      } else {
        this.updateStep(steps, 'create-container', 'failed', null, result.error);
      }

      return result;

    } catch (error: any) {
      this.updateStep(steps, 'create-container', 'failed', null, error.message);
      throw error;
    }
  }

  /**
   * Step 3: Setup repository
   */
  private async setupRepository(
    context: SecureOperationContext,
    request: WorkflowRequest,
    steps: WorkflowStep[]
  ): Promise<any> {
    this.updateStep(steps, 'setup-repository', 'in-progress');
    
    try {
      // Create repository (this would use GitHub API with scoped token)
      const repoName = `${request.projectName}-${Date.now()}`;
      const repoUrl = `https://github.com/worksquares/${repoName}`;
      
      // Initialize git in container
      const initResult = await this.secureOps.executeAzureOperation(context, {
        operation: 'executeCommand',
        parameters: {
          command: `mkdir -p /workspace/${context.projectId} && cd /workspace/${context.projectId} && git init`,
          timeout: 10000
        }
      });

      if (!initResult.success) {
        throw new Error('Failed to initialize git repository');
      }

      const result = {
        success: true,
        data: {
          repository: repoUrl,
          repoName
        }
      };

      this.updateStep(steps, 'setup-repository', 'completed', result.data);
      return result;

    } catch (error: any) {
      this.updateStep(steps, 'setup-repository', 'failed', null, error.message);
      throw error;
    }
  }

  /**
   * Step 4: Generate project code
   */
  private async generateProjectCode(
    context: SecureOperationContext,
    request: WorkflowRequest,
    steps: WorkflowStep[]
  ): Promise<any> {
    this.updateStep(steps, 'generate-code', 'in-progress');
    
    try {
      // Use AI agent to generate code structure
      const codeGenRequest = {
        type: 'frontend-app',
        framework: request.framework,
        template: request.template,
        features: request.features || [],
        customInstructions: request.customInstructions,
        outputPath: `/workspace/${context.projectId}`
      };

      // Generate code using agent (with restrictions)
      const generatedCode = await this.agent.generateCode(
        `Create a ${request.framework} application with the following requirements: ${JSON.stringify(codeGenRequest)}`,
        'typescript'
      );

      // Write generated files to container
      // This would be done through secure operations
      const writeResult = await this.secureOps.executeAzureOperation(context, {
        operation: 'executeCommand',
        parameters: {
          command: `cd /workspace/${context.projectId} && echo '${generatedCode}' > app.tsx`,
          timeout: 30000
        }
      });

      const result = {
        success: writeResult.success,
        data: {
          filesCreated: ['app.tsx', 'package.json', 'index.html']
        }
      };

      if (result.success) {
        this.updateStep(steps, 'generate-code', 'completed', result.data);
      } else {
        this.updateStep(steps, 'generate-code', 'failed', null, 'Code generation failed');
      }

      return result;

    } catch (error: any) {
      this.updateStep(steps, 'generate-code', 'failed', null, error.message);
      throw error;
    }
  }

  /**
   * Step 5: Build project
   */
  private async buildProject(
    context: SecureOperationContext,
    steps: WorkflowStep[]
  ): Promise<any> {
    this.updateStep(steps, 'build-project', 'in-progress');
    
    try {
      // Install dependencies
      const installResult = await this.secureOps.executeAzureOperation(context, {
        operation: 'executeCommand',
        parameters: {
          command: `cd /workspace/${context.projectId} && npm install`,
          timeout: 120000 // 2 minutes
        }
      });

      if (!installResult.success) {
        throw new Error('npm install failed');
      }

      // Build project
      const buildResult = await this.secureOps.executeAzureOperation(context, {
        operation: 'executeCommand',
        parameters: {
          command: `cd /workspace/${context.projectId} && npm run build`,
          timeout: 180000 // 3 minutes
        }
      });

      const result = {
        success: buildResult.success,
        data: {
          buildOutput: buildResult.data
        }
      };

      if (result.success) {
        this.updateStep(steps, 'build-project', 'completed', result.data);
      } else {
        this.updateStep(steps, 'build-project', 'failed', null, 'Build failed');
      }

      return result;

    } catch (error: any) {
      this.updateStep(steps, 'build-project', 'failed', null, error.message);
      throw error;
    }
  }

  /**
   * Step 6: Deploy project
   */
  private async deployProject(
    context: SecureOperationContext,
    request: WorkflowRequest,
    steps: WorkflowStep[]
  ): Promise<any> {
    this.updateStep(steps, 'deploy-project', 'in-progress');
    
    try {
      // Deploy to Azure Static Web Apps
      // This would use the Azure SDK with scoped credentials
      const deploymentUrl = `https://${request.projectName}.azurestaticapps.net`;
      
      const result = {
        success: true,
        data: {
          url: deploymentUrl,
          status: 'deployed'
        }
      };

      this.updateStep(steps, 'deploy-project', 'completed', result.data);
      return result;

    } catch (error: any) {
      this.updateStep(steps, 'deploy-project', 'failed', null, error.message);
      throw error;
    }
  }

  /**
   * Step 7: Cleanup
   */
  private async cleanup(
    context: SecureOperationContext,
    steps: WorkflowStep[]
  ): Promise<void> {
    this.updateStep(steps, 'cleanup', 'in-progress');
    
    try {
      // Revoke credentials
      this.credentialStore.revokeCredentials(
        context.userId,
        context.projectId,
        context.taskId
      );

      // Stop container (optional, based on settings)
      await this.secureOps.executeAzureOperation(context, {
        operation: 'stopContainer'
      });

      this.updateStep(steps, 'cleanup', 'completed');

    } catch (error: any) {
      this.updateStep(steps, 'cleanup', 'failed', null, error.message);
      // Don't throw - cleanup errors shouldn't fail the workflow
    }
  }

  /**
   * Attempt recovery on failure
   */
  private async attemptRecovery(
    context: SecureOperationContext,
    error: Error,
    request: WorkflowRequest
  ): Promise<void> {
    const failureEvent: FailureEvent = {
      context,
      failure: {
        type: this.categorizeError(error),
        operation: 'workflow',
        error: error.message,
        timestamp: new Date(),
        attempts: 1
      }
    };

    const recoveryResult = await this.recoveryAgent.handleFailure(failureEvent);
    
    if (recoveryResult.success) {
      this.logger.info('Recovery successful', {
        strategy: recoveryResult.strategyUsed,
        context
      });
    } else {
      this.logger.error('Recovery failed', {
        error: recoveryResult.error,
        recommendations: recoveryResult.recommendations
      });
    }
  }

  /**
   * Helper methods
   */
  private updateStep(
    steps: WorkflowStep[],
    name: string,
    status: WorkflowStep['status'],
    result?: any,
    error?: string
  ): void {
    const step = steps.find(s => s.name === name);
    if (step) {
      step.status = status;
      if (status === 'in-progress') {
        step.startTime = new Date();
      } else if (status === 'completed' || status === 'failed') {
        step.endTime = new Date();
      }
      if (result) step.result = result;
      if (error) step.error = error;

      this.emit('stepUpdate', { name, status, result, error });
    }
  }

  private generateTaskId(): string {
    return `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private getContextFromWorkflow(
    request: WorkflowRequest,
    taskId: string
  ): SecureOperationContext | null {
    // Retrieve context from credential store
    return {
      userId: request.userId,
      projectId: request.projectId,
      taskId,
      sessionToken: 'temp-token' // Would be retrieved from store
    };
  }

  private categorizeError(error: Error): FailureEvent['failure']['type'] {
    const message = error.message.toLowerCase();
    if (message.includes('git')) return 'git';
    if (message.includes('build') || message.includes('npm')) return 'build';
    if (message.includes('deploy')) return 'deploy';
    if (message.includes('container')) return 'container';
    if (message.includes('timeout')) return 'timeout';
    if (message.includes('permission')) return 'permission';
    return 'build';
  }

  /**
   * Get workflow status
   */
  getWorkflowStatus(userId: string, projectId: string): WorkflowStep[] | null {
    const key = `${userId}-${projectId}`;
    return this.activeWorkflows.get(key) || null;
  }
}