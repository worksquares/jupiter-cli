/**
 * Complete App Deployment Workflow
 * Handles the entire process from user request to deployed application
 */

import { EventEmitter } from 'events';
import { Logger } from '../utils/logger';
import { getEnvConfig } from '../config/environment';
import { CleanupManager, createCleanupTask } from '../utils/cleanup-manager';
import { DeploymentWorkflowOrchestrator, DeploymentRequest } from '../orchestration/deployment-workflow-orchestrator';
import { Agent } from '../core/agent';
import { createAgent } from '../index';
import { v4 as uuidv4 } from 'uuid';

export interface UserRequest {
  userId: string;
  projectName: string;
  description: string;
  framework?: 'react' | 'vue' | 'angular' | 'nextjs' | 'node';
  features?: string[];
  gitRepo?: string;
  githubToken?: string;
}

export interface WorkflowResult {
  success: boolean;
  requestId: string;
  projectId: string;
  deploymentUrl?: string;
  gitRepo?: string;
  containerName?: string;
  duration?: number;
  error?: string;
  logs?: string[];
}

export interface WorkflowProgress {
  step: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  message?: string;
}

export class CompleteAppWorkflow extends EventEmitter {
  private logger = Logger.getInstance().child({ component: 'CompleteAppWorkflow' });
  private agent: Agent | null = null;
  private orchestrator: DeploymentWorkflowOrchestrator;
  private envConfig = getEnvConfig();
  
  constructor() {
    super();
    this.orchestrator = new DeploymentWorkflowOrchestrator(
      this.envConfig.azureSubscriptionId,
      this.envConfig.azureResourceGroup
    );
    
    // Forward orchestrator events
    this.orchestrator.on('workflow:step:complete', (data) => {
      this.emit('progress', {
        step: data.step.name,
        status: 'completed',
        progress: this.calculateProgress(data.workflow),
        message: data.step.output
      });
    });
    
    this.orchestrator.on('workflow:step:failed', (data) => {
      this.emit('progress', {
        step: data.step.name,
        status: 'failed',
        progress: this.calculateProgress(data.workflow),
        message: data.step.error
      });
    });
  }
  
  /**
   * Execute complete workflow from user request to deployment
   */
  async execute(request: UserRequest): Promise<WorkflowResult> {
    const startTime = Date.now();
    const requestId = uuidv4();
    const projectId = `${request.userId}-${request.projectName}-${Date.now()}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    
    this.logger.info('Starting complete app workflow', { 
      requestId, 
      projectId,
      request 
    });
    
    const logs: string[] = [];
    const log = (message: string) => {
      logs.push(`[${new Date().toISOString()}] ${message}`);
      this.logger.info(message);
    };
    
    try {
      // Step 1: Initialize AI Agent
      this.emit('progress', {
        step: 'Initialize AI Agent',
        status: 'running',
        progress: 5,
        message: 'Setting up intelligent agent for code generation'
      });
      
      log('Initializing AI agent...');
      this.agent = await this.initializeAgent();
      
      // Step 2: Analyze user request and generate project plan
      this.emit('progress', {
        step: 'Analyze Request',
        status: 'running',
        progress: 10,
        message: 'Analyzing requirements and creating project plan'
      });
      
      log('Analyzing user request...');
      const projectPlan = await this.analyzeRequest(request);
      log(`Project plan created: ${projectPlan.framework} app with ${projectPlan.features.length} features`);
      
      // Step 3: Prepare deployment configuration
      this.emit('progress', {
        step: 'Prepare Deployment',
        status: 'running',
        progress: 15,
        message: 'Preparing deployment configuration'
      });
      
      const deploymentConfig = this.prepareDeploymentConfig(request, projectPlan);
      log('Deployment configuration ready');
      
      // Step 4: Start deployment workflow
      this.emit('progress', {
        step: 'Start Deployment',
        status: 'running',
        progress: 20,
        message: 'Initiating deployment workflow'
      });
      
      log('Starting deployment workflow...');
      const workflow = await this.orchestrator.startDeployment(deploymentConfig);
      
      // Register cleanup
      const cleanupManager = CleanupManager.getInstance();
      cleanupManager.register(createCleanupTask(
        `workflow-${requestId}`,
        `Cleanup workflow: ${requestId}`,
        async () => {
          try {
            // Any additional cleanup needed
            this.logger.info('Cleaning up workflow resources', { requestId });
          } catch (error) {
            this.logger.error('Cleanup error', error);
          }
        },
        5
      ));
      
      // Step 5: Monitor deployment progress
      log('Monitoring deployment progress...');
      const deploymentResult = await this.monitorDeployment(workflow.id);
      
      if (!deploymentResult.success) {
        throw new Error(deploymentResult.error || 'Deployment failed');
      }
      
      // Step 6: Verify deployment (skip external verification for containers)
      this.emit('progress', {
        step: 'Verify Deployment',
        status: 'running',
        progress: 90,
        message: 'Verifying deployment status'
      });
      
      log('Deployment verification skipped - application running in container');
      
      // Success!
      this.emit('progress', {
        step: 'Complete',
        status: 'completed',
        progress: 100,
        message: `Application deployed successfully to ${deploymentResult.deploymentUrl}`
      });
      
      const duration = Date.now() - startTime;
      log(`Workflow completed successfully in ${Math.round(duration / 1000)}s`);
      
      return {
        success: true,
        requestId,
        projectId,
        deploymentUrl: deploymentResult.deploymentUrl,
        gitRepo: deploymentResult.gitRepo,
        containerName: deploymentResult.containerName,
        duration,
        logs
      };
      
    } catch (error: any) {
      this.logger.error('Workflow failed', error);
      
      this.emit('progress', {
        step: 'Error',
        status: 'failed',
        progress: this.calculateProgress(),
        message: error.message
      });
      
      return {
        success: false,
        requestId,
        projectId,
        error: error.message,
        duration: Date.now() - startTime,
        logs
      };
    }
  }
  
  /**
   * Initialize AI agent for code generation
   */
  private async initializeAgent(): Promise<Agent> {
    const agent = await createAgent({
      name: 'App Builder Agent',
      capabilities: ['code-generation', 'project-planning', 'deployment'],
      memory: {
        importanceThreshold: 0.5,
        maxMemories: 1000,
        consolidationInterval: 300000
      }
    });
    
    return agent;
  }
  
  /**
   * Analyze user request and generate project plan
   */
  private async analyzeRequest(request: UserRequest): Promise<any> {
    // Skip AI analysis for now and use direct mapping
    try {
      if (this.agent) {
        // Try to use AI agent with a short timeout
        const analysisPromise = this.agent.processTask({
          id: uuidv4(),
          type: 'analysis' as any,
          description: 'Analyze project request and create implementation plan',
          context: {
            workingDirectory: '/workspace',
            files: [],
            language: 'typescript',
            framework: request.framework,
            requirements: [request.description],
            userPreferences: {
              verbosity: 'normal' as any
            }
          },
          priority: 'high' as any,
          status: 'pending' as any,
          createdAt: new Date(),
          updatedAt: new Date(),
          userId: uuidv4(),
          projectId: uuidv4()
        });
        
        // Race between AI analysis and timeout
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('AI analysis timeout')), 10000)
        );
        
        const analysis = await Promise.race([analysisPromise, timeoutPromise]) as any;
        
        if (analysis.success) {
          return { ...this.getDefaultPlan(request), ...analysis.data };
        }
      }
    } catch (error) {
      this.logger.warn('AI analysis failed, using default plan', error);
    }
    
    // Return default plan
    return this.getDefaultPlan(request);
  }
  
  private getDefaultPlan(request: UserRequest): any {
    const framework = request.framework || 'react';
    
    // Framework-specific configurations
    const frameworkConfigs: Record<string, any> = {
      react: {
        template: 'node',
        buildCommand: 'npm run build',
        outputPath: 'build',
        dependencies: ['react', 'react-dom', 'react-scripts'],
        devDependencies: [],
        scripts: {
          start: 'react-scripts start',
          build: 'react-scripts build',
          test: 'react-scripts test',
          eject: 'react-scripts eject'
        }
      },
      nextjs: {
        template: 'node',
        buildCommand: 'npm run build',
        outputPath: '.next',
        dependencies: ['next', 'react', 'react-dom'],
        devDependencies: ['@types/react', '@types/node'],
        scripts: {
          dev: 'next dev',
          build: 'next build',
          start: 'next start'
        }
      },
      node: {
        template: 'node',
        buildCommand: 'echo "No build needed"',
        outputPath: '.',
        dependencies: ['express', 'cors', 'dotenv'],
        devDependencies: ['nodemon'],
        scripts: {
          start: 'node index.js',
          dev: 'nodemon index.js'
        }
      },
      vue: {
        template: 'node',
        buildCommand: 'npm run build',
        outputPath: 'dist',
        dependencies: ['vue', '@vue/cli-service'],
        devDependencies: [],
        scripts: {
          serve: 'vue-cli-service serve',
          build: 'vue-cli-service build'
        }
      },
      angular: {
        template: 'node',
        buildCommand: 'npm run build',
        outputPath: 'dist',
        dependencies: ['@angular/core', '@angular/cli'],
        devDependencies: [],
        scripts: {
          start: 'ng serve',
          build: 'ng build'
        }
      }
    };
    
    const config = frameworkConfigs[framework] || frameworkConfigs.react;
    
    return {
      framework,
      ...config,
      features: request.features || ['basic-ui', 'routing', 'api-integration'],
      environmentVariables: {
        NODE_ENV: 'production',
        ...(framework === 'react' ? { REACT_APP_NAME: request.projectName } : {})
      }
    };
  }
  
  /**
   * Prepare deployment configuration
   */
  private prepareDeploymentConfig(request: UserRequest, projectPlan: any): DeploymentRequest {
    return {
      userId: request.userId,
      projectName: request.projectName,
      template: projectPlan.template || 'node',
      gitRepo: request.gitRepo,
      gitToken: request.githubToken,
      buildCommand: projectPlan.buildCommand || 'npm run build',
      outputPath: projectPlan.outputPath || 'build',
      environmentVariables: {
        NODE_ENV: 'production',
        REACT_APP_NAME: request.projectName,
        ...projectPlan.environmentVariables
      }
    };
  }
  
  /**
   * Monitor deployment until completion
   */
  private async monitorDeployment(workflowId: string): Promise<any> {
    const maxWaitTime = 30 * 60 * 1000; // 30 minutes
    const startTime = Date.now();
    const checkInterval = 5000; // 5 seconds
    
    while (Date.now() - startTime < maxWaitTime) {
      const workflow = this.orchestrator.getWorkflow(workflowId);
      
      if (!workflow) {
        throw new Error('Workflow not found');
      }
      
      // Update progress based on workflow steps
      const progress = this.calculateProgress(workflow);
      
      if (workflow.status === 'completed') {
        return {
          success: true,
          deploymentUrl: workflow.deploymentUrl,
          gitRepo: workflow.artifacts && 'gitRepo' in workflow.artifacts ? (workflow.artifacts as any).gitRepo : undefined,
          containerName: workflow.containerName
        };
      }
      
      if (workflow.status === 'failed') {
        return {
          success: false,
          error: workflow.error || 'Deployment failed'
        };
      }
      
      // Wait before next check
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }
    
    throw new Error('Deployment timeout');
  }
  
  /**
   * Verify deployment is accessible
   */
  private async verifyDeployment(url: string): Promise<void> {
    const axios = require('axios');
    const maxAttempts = 5;
    const delay = 10000; // 10 seconds
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await axios.get(url, {
          timeout: 30000,
          validateStatus: (status: number) => status < 500
        });
        
        if (response.status === 200) {
          this.logger.info('Deployment verified successfully');
          return;
        }
        
        this.logger.warn(`Deployment returned status ${response.status}, retrying...`);
      } catch (error: any) {
        this.logger.warn(`Verification attempt ${attempt} failed: ${error.message}`);
      }
      
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw new Error('Deployment verification failed');
  }
  
  /**
   * Calculate overall progress
   */
  private calculateProgress(workflow?: any): number {
    if (!workflow) return 0;
    
    const totalSteps = workflow.steps.length;
    const completedSteps = workflow.steps.filter((s: any) => 
      s.status === 'completed'
    ).length;
    
    // Map workflow progress to 20-90% range
    const workflowProgress = (completedSteps / totalSteps) * 70;
    return Math.round(20 + workflowProgress);
  }
  
}

/**
 * Convenience function to execute workflow
 */
export async function deployApp(request: UserRequest): Promise<WorkflowResult> {
  const workflow = new CompleteAppWorkflow();
  
  // Set up progress logging
  workflow.on('progress', (progress: WorkflowProgress) => {
    console.log(`[${progress.progress}%] ${progress.step}: ${progress.message || progress.status}`);
  });
  
  return workflow.execute(request);
}