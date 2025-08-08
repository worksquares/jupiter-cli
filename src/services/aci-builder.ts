/**
 * Azure Container Instance Builder Service
 * Handles code generation and building inside ACI
 */

import { ContainerInstanceManagementClient } from '@azure/arm-containerinstance';
import { DefaultAzureCredential } from '@azure/identity';
import { Logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export interface ACIBuildConfig {
  projectId: string;
  sourceCode: string;
  framework: 'react' | 'vue' | 'angular' | 'nextjs' | 'vanilla' | 'python' | 'dotnet' | 'java';
  dependencies?: string[];
  environment?: Record<string, string>;
  resourceGroup?: string;
  location?: string;
}

export interface ACIBuildResult {
  success: boolean;
  containerId?: string;
  logs?: string;
  artifactUrl?: string;
  error?: string;
  executionTime?: number;
}

export class ACIBuilder {
  private client: ContainerInstanceManagementClient;
  private logger: Logger;
  private subscriptionId: string;

  constructor() {
    this.logger = new Logger('ACIBuilder');
    this.subscriptionId = process.env.AZURE_SUBSCRIPTION_ID || '';
    
    const credential = new DefaultAzureCredential();
    this.client = new ContainerInstanceManagementClient(credential, this.subscriptionId);
  }

  /**
   * Build project inside ACI
   */
  async build(config: ACIBuildConfig): Promise<ACIBuildResult> {
    const startTime = Date.now();
    const containerGroupName = `build-${config.projectId}-${Date.now()}`;
    const resourceGroup = config.resourceGroup || process.env.AZURE_RESOURCE_GROUP || 'jupiter-ai-rg';
    const location = config.location || process.env.AZURE_LOCATION || 'eastus';

    try {
      this.logger.info(`Starting ACI build for project ${config.projectId}`);

      // Create container group specification
      const containerGroup = {
        location,
        osType: 'Linux' as const,
        containers: [
          {
            name: 'builder',
            image: this.getBuilderImage(config.framework),
            resources: {
              requests: {
                cpu: 2,
                memoryInGB: 4
              }
            },
            environmentVariables: this.getEnvironmentVariables(config),
            command: this.getBuildCommands(config),
            volumeMounts: [
              {
                name: 'source',
                mountPath: '/workspace',
                readOnly: false
              },
              {
                name: 'output',
                mountPath: '/output',
                readOnly: false
              }
            ]
          }
        ],
        volumes: [
          {
            name: 'source',
            emptyDir: {}
          },
          {
            name: 'output',
            azureFile: {
              shareName: 'builds',
              storageAccountName: process.env.AZURE_STORAGE_ACCOUNT || '',
              storageAccountKey: process.env.AZURE_STORAGE_KEY || ''
            }
          }
        ],
        restartPolicy: 'Never' as const
      };

      // Create container instance
      this.logger.info('Creating container instance...');
      const createResponse = await this.client.containerGroups.beginCreateOrUpdate(
        resourceGroup,
        containerGroupName,
        containerGroup
      );

      const result = await createResponse.pollUntilDone();
      
      if (!result.instanceView?.state || result.instanceView.state !== 'Running') {
        throw new Error('Container failed to start');
      }

      // Wait for completion and get logs
      const logs = await this.waitForCompletion(
        resourceGroup,
        containerGroupName
      );

      // Get artifact URL
      const artifactUrl = this.getArtifactUrl(config.projectId);

      // Clean up container
      await this.cleanup(resourceGroup, containerGroupName);

      const executionTime = Date.now() - startTime;

      return {
        success: true,
        containerId: containerGroupName,
        logs,
        artifactUrl,
        executionTime
      };

    } catch (error) {
      this.logger.error('ACI build failed:', error);
      
      // Try to clean up on error
      try {
        await this.cleanup(resourceGroup, containerGroupName);
      } catch (cleanupError) {
        this.logger.error('Cleanup failed:', cleanupError);
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Build failed',
        executionTime: Date.now() - startTime
      };
    }
  }

  /**
   * Get builder image for framework
   */
  private getBuilderImage(framework: string): string {
    const images: Record<string, string> = {
      react: 'node:18-alpine',
      vue: 'node:18-alpine',
      angular: 'node:18-alpine',
      nextjs: 'node:18-alpine',
      python: 'python:3.11-slim',
      dotnet: 'mcr.microsoft.com/dotnet/sdk:7.0',
      java: 'maven:3.9-openjdk-17',
      vanilla: 'nginx:alpine'
    };

    return images[framework] || 'node:18-alpine';
  }

  /**
   * Get environment variables for build
   */
  private getEnvironmentVariables(config: ACIBuildConfig): any[] {
    const baseVars = [
      { name: 'PROJECT_ID', value: config.projectId },
      { name: 'FRAMEWORK', value: config.framework },
      { name: 'NODE_ENV', value: 'production' }
    ];

    if (config.environment) {
      Object.entries(config.environment).forEach(([key, value]) => {
        baseVars.push({ name: key, value });
      });
    }

    return baseVars;
  }

  /**
   * Get build commands for framework
   */
  private getBuildCommands(config: ACIBuildConfig): string[] {
    const baseCommands = [
      'sh',
      '-c',
      this.generateBuildScript(config)
    ];

    return baseCommands;
  }

  /**
   * Generate build script
   */
  private generateBuildScript(config: ACIBuildConfig): string {
    const script = `
      set -e
      cd /workspace
      
      # Write source code
      echo '${Buffer.from(config.sourceCode).toString('base64')}' | base64 -d > app.tar.gz
      tar -xzf app.tar.gz
      
      # Install dependencies
      ${this.getInstallCommand(config.framework)}
      
      # Build application
      ${this.getBuildCommand(config.framework)}
      
      # Copy output
      cp -r ${this.getOutputDir(config.framework)} /output/
      
      echo "Build completed successfully"
    `;

    return script.trim();
  }

  /**
   * Get install command for framework
   */
  private getInstallCommand(framework: string): string {
    const commands: Record<string, string> = {
      react: 'npm ci || npm install',
      vue: 'npm ci || npm install',
      angular: 'npm ci || npm install',
      nextjs: 'npm ci || npm install',
      python: 'pip install -r requirements.txt',
      dotnet: 'dotnet restore',
      java: 'mvn install',
      vanilla: 'echo "No dependencies"'
    };

    return commands[framework] || 'npm install';
  }

  /**
   * Get build command for framework
   */
  private getBuildCommand(framework: string): string {
    const commands: Record<string, string> = {
      react: 'npm run build',
      vue: 'npm run build',
      angular: 'ng build --prod',
      nextjs: 'npm run build && npm run export',
      python: 'python setup.py build',
      dotnet: 'dotnet build -c Release',
      java: 'mvn package',
      vanilla: 'echo "No build required"'
    };

    return commands[framework] || 'npm run build';
  }

  /**
   * Get output directory for framework
   */
  private getOutputDir(framework: string): string {
    const directories: Record<string, string> = {
      react: 'build',
      vue: 'dist',
      angular: 'dist',
      nextjs: 'out',
      python: 'dist',
      dotnet: 'bin/Release',
      java: 'target',
      vanilla: '.'
    };

    return directories[framework] || 'dist';
  }

  /**
   * Wait for container completion
   */
  private async waitForCompletion(
    resourceGroup: string,
    containerGroupName: string
  ): Promise<string> {
    const maxWaitTime = 10 * 60 * 1000; // 10 minutes
    const startTime = Date.now();
    let logs = '';

    while (Date.now() - startTime < maxWaitTime) {
      const containerGroup = await this.client.containerGroups.get(
        resourceGroup,
        containerGroupName
      );

      const state = containerGroup.instanceView?.state;
      
      if (state === 'Succeeded') {
        // Get logs
        const logResponse = await this.client.containers.listLogs(
          resourceGroup,
          containerGroupName,
          'builder'
        );
        
        logs = logResponse.content || '';
        break;
      } else if (state === 'Failed') {
        // Get error logs
        const logResponse = await this.client.containers.listLogs(
          resourceGroup,
          containerGroupName,
          'builder'
        );
        
        throw new Error(`Build failed: ${logResponse.content}`);
      }

      // Wait before checking again
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    if (Date.now() - startTime >= maxWaitTime) {
      throw new Error('Build timeout');
    }

    return logs;
  }

  /**
   * Get artifact URL
   */
  private getArtifactUrl(projectId: string): string {
    const storageAccount = process.env.AZURE_STORAGE_ACCOUNT || '';
    return `https://${storageAccount}.blob.core.windows.net/builds/${projectId}/`;
  }

  /**
   * Clean up container instance
   */
  private async cleanup(
    resourceGroup: string,
    containerGroupName: string
  ): Promise<void> {
    try {
      await this.client.containerGroups.beginDelete(
        resourceGroup,
        containerGroupName
      );
      
      this.logger.info(`Cleaned up container ${containerGroupName}`);
    } catch (error) {
      this.logger.error(`Failed to clean up container ${containerGroupName}:`, error);
    }
  }
}