/**
 * Frontend Workflow Manager
 * Orchestrates the complete frontend development lifecycle
 * from GitHub repo creation to Static Web Apps deployment
 */

import { Logger } from '../utils/logger';
import { JupiterDBClient } from '../database/jupiter-db-client';
import { GitHubService } from './github-service';
import { AzureContainerManager } from '../azure/aci-manager';
import { StaticWebAppManager, CreateStaticWebAppOptions } from '../azure/static-web-app-manager';
import { ProjectManager } from './project-manager';
import { AgentInterface } from '../core/types';
import { SegregationContext } from '../core/segregation-types';
import { TemplateManager } from './template-manager';
import { ProjectEnvironmentService } from './project-env-service';
import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'eventemitter3';
import * as path from 'path';

export interface FrontendWorkflowConfig {
  db: JupiterDBClient;
  github: GitHubService;
  aci: AzureContainerManager;
  projectManager: ProjectManager;
  staticWebApp: StaticWebAppManager;
  agent: AgentInterface;
  envService?: ProjectEnvironmentService;
  baseDomain?: string;
  githubOrg?: string;
}

export interface FrontendProjectRequest {
  userId: string;
  projectName: string;
  framework: 'react' | 'vue' | 'angular' | 'vanilla';
  description?: string;
  features?: string[];
  template?: string;
  metadata?: Record<string, any>;
}

export interface FrontendWorkflowResult {
  project: {
    id: string;
    name: string;
    githubRepo: string;
  };
  task: {
    id: string;
    branch: string;
  };
  deployment: {
    id: string;
    url: string;
    customDomain?: string;
    staticWebAppId: string;
  };
  aci: {
    instanceId: string;
    url: string;
  };
}

export interface WorkflowStatus {
  step: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  message: string;
  data?: any;
}

export class FrontendWorkflowManager extends EventEmitter {
  private logger: Logger;
  private config: FrontendWorkflowConfig;
  private templateManager: TemplateManager;
  private envService: ProjectEnvironmentService | null;

  constructor(config: FrontendWorkflowConfig) {
    super();
    this.config = config;
    this.logger = new Logger('FrontendWorkflowManager');
    this.templateManager = new TemplateManager();
    this.envService = config.envService || null;
    
    // Initialize env service if not provided
    if (!this.envService && config.db) {
      this.envService = new ProjectEnvironmentService(config.db);
    }
  }

  /**
   * Execute the complete frontend workflow
   */
  async executeFrontendWorkflow(request: FrontendProjectRequest): Promise<FrontendWorkflowResult> {
    const workflowId = uuidv4();
    this.logger.info('Starting frontend workflow', { workflowId, request });

    try {
      // Step 1: Create or get project with GitHub repo
      this.emitStatus('project_creation', 'in_progress', 'Creating project and GitHub repository...');
      
      const projectResult = await this.createOrGetProject(request);
      
      this.emitStatus('project_creation', 'completed', 'Project created', {
        projectId: projectResult.project.id,
        githubRepo: projectResult.githubRepo.url
      });

      // Step 2: Create task and branch
      this.emitStatus('task_creation', 'in_progress', 'Creating task and branch...');
      
      const taskResult = await this.config.projectManager.createTask(projectResult.project.id, {
        type: 'frontend_development' as any,
        title: `Frontend: ${request.projectName} (${request.framework})`,
        description: this.buildTaskDescription(request),
        metadata: {
          framework: request.framework,
          features: request.features,
          template: request.template,
          workflowId
        }
      });

      this.emitStatus('task_creation', 'completed', 'Task created', {
        taskId: taskResult.task.id,
        branch: taskResult.branch
      });

      // Step 3: Generate frontend code using AI agent
      this.emitStatus('code_generation', 'in_progress', 'Generating frontend code...');
      
      const context: SegregationContext = {
        userId: request.userId,
        projectId: projectResult.project.id,
        taskId: taskResult.task.id,
        sessionId: `session-${Date.now()}`
      };

      await this.generateFrontendCode(context, request, taskResult.branch);
      
      this.emitStatus('code_generation', 'completed', 'Frontend code generated');

      // Step 3.5: Configure environment variables
      this.emitStatus('env_configuration', 'in_progress', 'Configuring environment variables...');
      
      await this.configureProjectEnvironment(
        projectResult.project.id,
        projectResult.project.name,
        request.framework,
        context
      );
      
      this.emitStatus('env_configuration', 'completed', 'Environment variables configured');

      // Step 4: Build the project in ACI
      this.emitStatus('build', 'in_progress', 'Building frontend project...');
      
      await this.buildFrontendProject(context, request.framework);
      
      this.emitStatus('build', 'completed', 'Build successful');

      // Step 5: Create Static Web App
      this.emitStatus('static_web_app', 'in_progress', 'Creating Azure Static Web App...');
      
      const appName = this.generateAppName(request.projectName);
      const swaOptions: CreateStaticWebAppOptions = {
        name: appName,
        projectId: projectResult.project.id,
        taskId: taskResult.task.id,
        repositoryUrl: projectResult.githubRepo.url,
        branch: taskResult.branch,
        framework: request.framework,
        environmentVariables: {
          NODE_ENV: 'production',
          VITE_API_URL: process.env.API_URL || '/api',
          REACT_APP_API_URL: process.env.API_URL || '/api'
        }
      };

      const deploymentResult = await this.config.staticWebApp.createStaticWebApp(swaOptions);
      
      this.emitStatus('static_web_app', 'completed', 'Static Web App created', {
        hostname: deploymentResult.defaultHostname,
        customDomain: deploymentResult.customDomain
      });

      // Step 6: Commit and push code
      this.emitStatus('commit', 'in_progress', 'Committing and pushing code...');
      
      await this.commitAndPushCode(context, taskResult.branch, request);
      
      this.emitStatus('commit', 'completed', 'Code committed and pushed');

      // Step 7: Deploy to Static Web App
      this.emitStatus('deployment', 'in_progress', 'Deploying to Azure Static Web App...');
      
      await this.config.staticWebApp.deployToStaticWebApp(
        deploymentResult.staticWebAppId,
        deploymentResult.deploymentId
      );
      
      const deploymentUrl = deploymentResult.customDomain 
        ? `https://${deploymentResult.customDomain}`
        : `https://${deploymentResult.defaultHostname}`;

      this.emitStatus('deployment', 'completed', 'Deployment successful', {
        url: deploymentUrl
      });

      // Step 8: Update task and deployment status
      await this.updateFinalStatus(taskResult.task.id, deploymentResult.deploymentId);

      const result: FrontendWorkflowResult = {
        project: {
          id: projectResult.project.id,
          name: projectResult.project.name,
          githubRepo: projectResult.githubRepo.url
        },
        task: {
          id: taskResult.task.id,
          branch: taskResult.branch
        },
        deployment: {
          id: deploymentResult.deploymentId,
          url: deploymentUrl,
          customDomain: deploymentResult.customDomain,
          staticWebAppId: deploymentResult.staticWebAppId
        },
        aci: {
          instanceId: taskResult.aciInstance.id,
          url: taskResult.aciInstance.url
        }
      };

      this.logger.info('Frontend workflow completed', { workflowId, result });
      this.emitStatus('workflow', 'completed', 'Frontend workflow completed successfully', result);

      return result;

    } catch (error) {
      this.logger.error('Frontend workflow failed', { workflowId, error: error as Error });
      this.emitStatus('workflow', 'failed', `Workflow failed: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Create or get project with GitHub repo
   */
  private async createOrGetProject(request: FrontendProjectRequest) {
    return this.config.projectManager.getOrCreateProject(
      request.userId,
      request.projectName,
      request.description || `${request.framework} frontend application`
    );
  }

  /**
   * Generate frontend code using AI agent
   */
  private async generateFrontendCode(
    context: SegregationContext,
    request: FrontendProjectRequest,
    branch: string
  ): Promise<void> {
    // Check if we should use a template instead of AI generation
    if (request.template && ['react', 'vue', 'angular'].includes(request.template)) {
      await this.useTemplate(context, request.template, request.projectName);
      return;
    }

    // First, configure environment variables if service is available
    if (this.envService) {
      try {
        await this.envService.createProjectEnvConfig(
          context.projectId!,
          request.projectName,
          request.framework,
          // Add any custom variables specific to the project
          request.metadata?.envVariables
        );
      } catch (error) {
        this.logger.warn('Failed to configure env variables before code generation', error);
      }
    }

    const prompt = this.buildCodeGenerationPrompt(request);
    
    const agentTask = {
      id: context.taskId!,
      type: 'frontend_development' as any,
      description: prompt,
      context: {
        query: prompt,
        environment: 'aci',
        segregation: context,
        workingDirectory: '/workspace',
        branch,
        framework: request.framework,
        features: request.features,
        files: [] // Add required fields
      },
      priority: 'high' as any,
      status: 'pending' as any,
      userId: context.userId,
      projectId: context.projectId,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await this.config.agent.processTask(agentTask);
    
    if (!result.success) {
      throw new Error(`Code generation failed: ${result.error?.message}`);
    }
  }

  /**
   * Use a template to create the frontend project
   */
  private async useTemplate(
    context: SegregationContext,
    templateId: string,
    projectName: string
  ): Promise<void> {
    const bashAdapter = this.config.agent.tools.get('aciBash');
    if (!bashAdapter) {
      throw new Error('Bash adapter not found');
    }

    // Clear workspace
    await bashAdapter.execute({
      context,
      command: 'cd /workspace && rm -rf * .[^.]*',
      timeout: 10000
    });

    // Copy template files
    await this.templateManager.initializeProject(
      templateId,
      '/workspace',
      projectName
    );

    this.logger.info(`Template '${templateId}' initialized for project '${projectName}'`);
  }

  /**
   * Build frontend project in ACI
   */
  private async buildFrontendProject(
    context: SegregationContext,
    framework: string
  ): Promise<void> {
    const buildCommands: Record<string, string> = {
      react: 'npm install && npm run build',
      vue: 'npm install && npm run build',
      angular: 'npm install && npm run build',
      vanilla: 'echo "No build required for vanilla JS"'
    };

    const bashAdapter = this.config.agent.tools.get('aciBash');
    if (!bashAdapter) {
      throw new Error('Bash adapter not found');
    }

    const buildCommand = buildCommands[framework];
    const result = await bashAdapter.execute({
      context,
      command: `cd /workspace && ${buildCommand}`,
      timeout: 300000 // 5 minutes
    });

    if (!result.success) {
      throw new Error(`Build failed: ${result.error}`);
    }
  }

  /**
   * Commit and push code to GitHub
   */
  private async commitAndPushCode(
    context: SegregationContext,
    branch: string,
    request: FrontendProjectRequest
  ): Promise<void> {
    const gitAdapter = this.config.agent.tools.get('aciGit');
    if (!gitAdapter) {
      throw new Error('Git adapter not found');
    }

    // Add all files
    await gitAdapter.execute({
      context,
      operation: 'add',
      files: ['.']
    });

    // Commit with descriptive message
    const commitMessage = `feat: Create ${request.framework} frontend application

- Framework: ${request.framework}
- Features: ${request.features?.join(', ') || 'Basic setup'}
- Generated by Intelligent Agent System

🤖 Generated with Jupiter Agent
Co-Authored-By: Jupiter Agent <agent@jupiter.ai>`;

    await gitAdapter.execute({
      context,
      operation: 'commit',
      message: commitMessage
    });

    // Push to branch
    await gitAdapter.execute({
      context,
      operation: 'push',
      remote: 'origin',
      branch
    });
  }

  /**
   * Configure environment variables for the project
   */
  private async configureProjectEnvironment(
    projectId: string,
    projectName: string,
    framework: string,
    context: SegregationContext
  ): Promise<void> {
    if (!this.envService) {
      this.logger.warn('Environment service not available, skipping env configuration');
      return;
    }

    try {
      // Create or fetch environment configuration from Jupiter DB
      const envConfig = await this.envService.createProjectEnvConfig(
        projectId,
        projectName,
        framework,
        // Add framework-specific custom variables
        this.getFrameworkSpecificEnvVars(framework)
      );

      // Generate .env files in the ACI workspace
      const bashAdapter = this.config.agent.tools.get('aciBash');
      if (!bashAdapter) {
        this.logger.warn('Bash adapter not found, cannot generate .env files');
        return;
      }

      // Generate .env file content
      await this.envService.generateEnvFile(
        projectId,
        '/tmp',  // Generate to temp first
        'development'
      );

      // Copy generated .env files to workspace
      await bashAdapter.execute({
        context,
        command: 'cp /tmp/.env /workspace/.env && cp /tmp/.env.example /workspace/.env.example',
        timeout: 5000
      });

      this.logger.info('Environment variables configured for project', {
        projectId,
        framework,
        variableCount: envConfig.variables.length
      });

    } catch (error) {
      this.logger.error('Failed to configure environment variables', error);
      // Don't fail the workflow, just log the error
    }
  }

  /**
   * Get framework-specific environment variables
   */
  private getFrameworkSpecificEnvVars(framework: string): any[] {
    const commonVars = [
      {
        key: 'JUPITER_PROJECT_ID',
        value: '',
        type: 'string',
        category: 'service',
        isSecret: false,
        isRequired: true,
        description: 'Jupiter project identifier'
      },
      {
        key: 'JUPITER_API_URL',
        value: process.env.JUPITER_API_URL || 'https://api.jupiter.ai',
        type: 'string',
        category: 'api',
        isSecret: false,
        isRequired: true,
        description: 'Jupiter API endpoint'
      }
    ];

    const frameworkSpecific: Record<string, any[]> = {
      react: [
        ...commonVars,
        {
          key: 'VITE_JUPITER_API_KEY',
          value: '',
          type: 'secret',
          category: 'api',
          isSecret: true,
          isRequired: false,
          description: 'API key for Jupiter services'
        }
      ],
      vue: [
        ...commonVars,
        {
          key: 'VUE_APP_JUPITER_API_KEY',
          value: '',
          type: 'secret',
          category: 'api',
          isSecret: true,
          isRequired: false,
          description: 'API key for Jupiter services'
        }
      ],
      angular: [
        ...commonVars,
        {
          key: 'NG_APP_JUPITER_API_KEY',
          value: '',
          type: 'secret',
          category: 'api',
          isSecret: true,
          isRequired: false,
          description: 'API key for Jupiter services'
        }
      ],
      vanilla: commonVars
    };

    return frameworkSpecific[framework] || commonVars;
  }

  /**
   * Update final status in database
   */
  private async updateFinalStatus(taskId: string, deploymentId: string): Promise<void> {
    // Update task status
    await this.config.projectManager.updateTaskStatus(taskId, 'completed' as any);

    // Update deployment record
    await this.config.db.execute(
      `UPDATE deployments 
       SET status = 'deployed', completed_at = NOW() 
       WHERE id = ?`,
      [deploymentId]
    );
  }

  /**
   * Build task description for AI agent
   */
  private buildTaskDescription(request: FrontendProjectRequest): string {
    const features = request.features?.join(', ') || 'basic setup';
    return `Create a ${request.framework} frontend application with the following requirements:
- Project: ${request.projectName}
- Framework: ${request.framework}
- Features: ${features}
- Description: ${request.description || 'Modern web application'}`;
  }

  /**
   * Build code generation prompt
   */
  private buildCodeGenerationPrompt(request: FrontendProjectRequest): string {
    const prompts: Record<string, string> = {
      react: `Create a React application with the following specifications:
- Use Vite as the build tool
- Include TypeScript
- Set up a clean project structure with components, pages, and services folders
- Add React Router for navigation
- Include a basic layout with header and footer
- Add Tailwind CSS for styling
- Create a home page and about page
- Include proper error boundaries
- Add environment variable support
${request.features ? `- Additional features: ${request.features.join(', ')}` : ''}
- Ensure the build output goes to 'dist' folder
- Configure for Azure Static Web Apps deployment`,

      vue: `Create a Vue 3 application with the following specifications:
- Use Vite as the build tool
- Include TypeScript
- Set up Composition API
- Add Vue Router for navigation
- Include Pinia for state management
- Add Tailwind CSS for styling
- Create a clean project structure
- Include home and about pages
- Add proper error handling
${request.features ? `- Additional features: ${request.features.join(', ')}` : ''}
- Ensure the build output goes to 'dist' folder
- Configure for Azure Static Web Apps deployment`,

      angular: `Create an Angular application with the following specifications:
- Use Angular CLI latest version
- Include TypeScript (default)
- Set up routing
- Create a clean module structure
- Add Angular Material for UI components
- Include home and about components
- Set up proper error handling
- Add environment configuration
${request.features ? `- Additional features: ${request.features.join(', ')}` : ''}
- Configure the build to output to 'dist' folder
- Set up for Azure Static Web Apps deployment`,

      vanilla: `Create a vanilla JavaScript/HTML/CSS application with:
- Modern, clean HTML5 structure
- Responsive CSS with CSS Grid/Flexbox
- Modular JavaScript with ES6+ features
- Simple routing using History API
- Home and about pages
- Clean file organization
${request.features ? `- Additional features: ${request.features.join(', ')}` : ''}
- No build step required
- Ready for Azure Static Web Apps deployment`
    };

    return prompts[request.framework] || prompts.vanilla;
  }

  /**
   * Generate app name for Static Web App
   */
  private generateAppName(projectName: string): string {
    const timestamp = Date.now();
    return `${projectName}-${timestamp}`
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .substring(0, 60); // Azure limit
  }

  /**
   * Emit workflow status
   */
  private emitStatus(step: string, status: WorkflowStatus['status'], message: string, data?: any): void {
    const statusEvent: WorkflowStatus = { step, status, message, data };
    this.emit('status', statusEvent);
    this.logger.info('Workflow status', statusEvent);
  }
}