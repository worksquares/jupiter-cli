/**
 * ACI Deploy Adapter
 * Handles deployment of frontend projects to Azure Static Web Apps from ACI
 */

import { Tool, ToolResult } from '../../core/types';
import { Logger } from '../../utils/logger';
import { AzureContainerManager } from '../../azure/aci-manager';
import { StaticWebAppManager } from '../../azure/static-web-app-manager';
import { SegregationContext } from '../../core/segregation-types';
import { ValidationError } from '../../utils/errors';

export interface DeployOptions {
  context: SegregationContext;
  staticWebAppName: string;
  deploymentToken: string;
  buildOutput?: string;
  apiLocation?: string;
  skipBuild?: boolean;
  environment?: 'production' | 'preview';
  environmentName?: string;
}

export interface DeployResult {
  success: boolean;
  deploymentId?: string;
  url?: string;
  customDomain?: string;
  logs: string[];
  duration: number;
}

export class ACIDeployAdapter implements Tool {
  name = 'aciDeploy';
  description = 'Deploy frontend projects to Azure Static Web Apps from ACI';
  private containerNameCache: Map<string, string> = new Map();

  /**
   * Get container name for context
   */
  private getContainerName(context: SegregationContext): string {
    const key = `${context.sessionId}-${context.projectId}-${context.taskId}`;
    if (!this.containerNameCache.has(key)) {
      this.containerNameCache.set(key, this.aciManager.getContainerName(context));
    }
    return this.containerNameCache.get(key)!;
  }
  parameters = {
    context: {
      type: 'object',
      description: 'Segregation context',
      required: true
    },
    staticWebAppName: {
      type: 'string',
      description: 'Name of the Static Web App',
      required: true
    },
    deploymentToken: {
      type: 'string',
      description: 'Static Web App deployment token',
      required: true
    },
    buildOutput: {
      type: 'string',
      description: 'Build output directory',
      default: 'dist'
    },
    apiLocation: {
      type: 'string',
      description: 'API directory location',
      default: 'api'
    },
    skipBuild: {
      type: 'boolean',
      description: 'Skip the build step',
      default: false
    },
    environment: {
      type: 'string',
      description: 'Deployment environment',
      enum: ['production', 'preview'],
      default: 'production'
    },
    environmentName: {
      type: 'string',
      description: 'Custom environment name for preview deployments'
    }
  };

  private logger: Logger;

  constructor(
    private aciManager: AzureContainerManager,
    private swaManager?: StaticWebAppManager
  ) {
    this.logger = new Logger('ACIDeployAdapter');
  }

  async execute(params: DeployOptions): Promise<ToolResult> {
    const startTime = Date.now();
    const logs: string[] = [];
    
    try {
      this.validate(params);
      
      const { 
        context, 
        staticWebAppName, 
        deploymentToken,
        buildOutput = 'dist',
        apiLocation = 'api',
        skipBuild = false,
        environment = 'production',
        environmentName
      } = params;
      
      this.logger.info('Starting deployment', { 
        staticWebAppName,
        environment,
        containerGroup: this.aciManager.getContainerName(context) 
      });

      // Get container instance
      const container = await this.aciManager.getOrCreateContainer(context, {
        image: 'node:18',
        memoryGB: 2,
        exposedPorts: []
      });
      if (!container.name) {
        throw new Error('Container name not found');
      }

      // Install SWA CLI if not already installed
      logs.push('Installing Azure Static Web Apps CLI...');
      const containerName = this.getContainerName(context);
      const installResult = await this.aciManager.executeCommand(
        containerName,
        `sh -c "cd /workspace && npm list -g @azure/static-web-apps-cli || npm install -g @azure/static-web-apps-cli"`
      );
      
      if (installResult.exitCode !== 0 && !installResult.stdout.includes('@azure/static-web-apps-cli')) {
        throw new Error('Failed to install SWA CLI');
      }

      // Prepare deployment command
      const deployCommand = this.buildDeployCommand({
        buildOutput,
        apiLocation,
        deploymentToken,
        skipBuild,
        environment,
        environmentName
      });

      logs.push('Deploying to Azure Static Web Apps...');
      
      // Execute deployment
      const deployResult = await this.aciManager.executeCommand(
        containerName,
        `sh -c "cd /workspace && ${deployCommand}"`
      );

      // Parse deployment output
      const deploymentInfo = this.parseDeploymentOutput(deployResult.stdout);
      
      if (deployResult.exitCode !== 0 || !deploymentInfo.success) {
        throw new Error(`Deployment failed: ${deployResult.stderr || 'Unknown error'}`);
      }

      logs.push('Deployment successful!');
      
      // Get deployment URL
      const url = deploymentInfo.url || `https://${staticWebAppName}.azurestaticapps.net`;
      
      const deployResultData: DeployResult = {
        success: true,
        deploymentId: deploymentInfo.deploymentId,
        url,
        customDomain: deploymentInfo.customDomain,
        logs,
        duration: Date.now() - startTime
      };

      this.logger.info('Deployment completed', { 
        url,
        duration: deployResultData.duration 
      });

      return {
        success: true,
        data: deployResultData
      };

    } catch (error) {
      this.logger.error('Deployment failed', error);
      logs.push(`Error: ${(error as Error).message}`);
      
      return {
        success: false,
        error: error as Error,
        data: {
          success: false,
          logs,
          duration: Date.now() - startTime
        }
      };
    }
  }

  validate(params: any): boolean {
    if (!params.context || !params.context.userId || !params.context.projectId) {
      throw new ValidationError('Invalid segregation context');
    }

    if (!params.staticWebAppName) {
      throw new ValidationError('Static Web App name is required');
    }

    if (!params.deploymentToken) {
      throw new ValidationError('Deployment token is required');
    }

    if (params.environment && !['production', 'preview'].includes(params.environment)) {
      throw new ValidationError('Environment must be either "production" or "preview"');
    }

    return true;
  }

  /**
   * Build the SWA CLI deployment command
   */
  private buildDeployCommand(options: {
    buildOutput: string;
    apiLocation: string;
    deploymentToken: string;
    skipBuild: boolean;
    environment: string;
    environmentName?: string;
  }): string {
    const args = [
      'swa deploy',
      `./${options.buildOutput}`,
      '--deployment-token', options.deploymentToken,
      '--api-location', options.apiLocation
    ];

    if (options.skipBuild) {
      args.push('--no-build');
    }

    if (options.environment === 'preview' && options.environmentName) {
      args.push('--env', options.environmentName);
    } else if (options.environment === 'production') {
      args.push('--env', 'production');
    }

    // Add verbose output for better logging
    args.push('--verbose');

    return args.join(' ');
  }

  /**
   * Parse deployment output to extract useful information
   */
  private parseDeploymentOutput(output: string): {
    success: boolean;
    deploymentId?: string;
    url?: string;
    customDomain?: string;
  } {
    const lines = output.split('\n');
    let success = false;
    let deploymentId: string | undefined;
    let url: string | undefined;
    let customDomain: string | undefined;

    for (const line of lines) {
      // Check for success indicators
      if (line.includes('Deployment successful') || 
          line.includes('Successfully deployed') ||
          line.includes('Deployment complete')) {
        success = true;
      }

      // Extract deployment ID
      const deployIdMatch = line.match(/Deployment ID: ([a-zA-Z0-9-]+)/);
      if (deployIdMatch) {
        deploymentId = deployIdMatch[1];
      }

      // Extract URL
      const urlMatch = line.match(/https?:\/\/[^\s]+\.azurestaticapps\.net/);
      if (urlMatch) {
        url = urlMatch[0];
      }

      // Extract custom domain if mentioned
      const domainMatch = line.match(/Custom domain: ([^\s]+)/);
      if (domainMatch) {
        customDomain = domainMatch[1];
      }
    }

    return { success, deploymentId, url, customDomain };
  }

  /**
   * Create a deployment configuration file
   */
  async createDeploymentConfig(
    containerName: string,
    config: {
      appLocation: string;
      apiLocation: string;
      outputLocation: string;
      appBuildCommand?: string;
      apiBuildCommand?: string;
    }
  ): Promise<void> {
    const configContent = {
      $schema: 'https://aka.ms/azure/static-web-apps-cli/schema',
      configurations: {
        default: {
          appLocation: config.appLocation,
          apiLocation: config.apiLocation,
          outputLocation: config.outputLocation,
          appBuildCommand: config.appBuildCommand,
          apiBuildCommand: config.apiBuildCommand
        }
      }
    };

    const command = `cd /workspace && echo '${JSON.stringify(configContent, null, 2)}' > swa-cli.config.json`;
    
    await this.aciManager.executeCommand(
      containerName,
      command
    );
  }
}