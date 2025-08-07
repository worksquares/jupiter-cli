/**
 * Azure Container Instance Manager
 * Manages lifecycle of Azure Container Instances via Azure API
 */

import { Logger } from '../utils/logger';
import { RetryHelper, WithRetry } from '../utils/retry-helper';
import { CleanupManager, createCleanupTask } from '../utils/cleanup-manager';
import { 
  SegregationContext, 
  DockerConfig, 
  VolumeConfig,
  validateSegregationContext 
} from '../core/segregation-types';
import { AzureAPIClient } from '../clients/azure-api-client';
import { azureAPIConfig } from '../config/azure-api-config';

export interface ACIConfig {
  subscriptionId: string;
  resourceGroup: string;
  location: string;
  containerRegistry: string;
  registryUsername?: string;
  registryPassword?: string;
  defaultImage?: string;
  githubToken?: string;
}

export interface ContainerExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  webSocketUri?: string;
  password?: string;
}

export class AzureContainerManager {
  private logger: Logger;
  private cleanupManager: CleanupManager;
  private azureClient: AzureAPIClient;

  constructor(private config: ACIConfig) {
    this.logger = Logger.getInstance();
    this.cleanupManager = CleanupManager.getInstance();
    this.azureClient = new AzureAPIClient(azureAPIConfig);
  }

  /**
   * Create a new container instance with segregation context
   */
  async createContainer(
    context: SegregationContext,
    dockerConfig: DockerConfig
  ): Promise<any> {
    validateSegregationContext(context);

    const containerGroupName = `aci-${context.sessionId}-${Date.now()}`;
    
    this.logger.info('Creating container via Azure API', {
      containerGroupName,
      context,
      dockerConfig
    });

    const deployment = await this.azureClient.deployContainer({
      name: containerGroupName,
      image: dockerConfig.image || this.config.defaultImage || 'node:18',
      resourceGroup: this.config.resourceGroup,
      location: this.config.location,
      cpu: dockerConfig.resources?.cpuCount || 1,
      memoryGB: dockerConfig.resources?.memoryGB || dockerConfig.memoryGB || 1.5,
      ports: dockerConfig.exposedPorts?.map(p => ({ port: p, protocol: 'TCP' as const })) || [{port: 80, protocol: 'TCP' as const}],
      environmentVariables: {
        SESSION_ID: context.sessionId,
        PROJECT_ID: context.projectId,
        TASK_ID: context.taskId,
        USER_ID: context.userId,
        ...(dockerConfig.environment || dockerConfig.environmentVariables || {})
      },
      restartPolicy: 'Never'
    });

    // Register for cleanup
    this.cleanupManager.registerCleanup(
      createCleanupTask(
        containerGroupName,
        'container',
        async () => {
          await this.deleteContainer(containerGroupName);
        }
      )
    );

    return deployment;
  }

  /**
   * Execute command in container
   */
  async executeCommand(
    containerGroupName: string,
    command: string,
    containerName?: string
  ): Promise<ContainerExecResult> {
    this.logger.info('Executing command in container via Azure API', {
      containerGroupName,
      command
    });

    const response = await this.azureClient.executeContainerCommand(containerGroupName, { command: [command] });
    
    // Extract data from API response
    const data = response.data || response;
    
    return {
      exitCode: data.exitCode || 0,
      stdout: data.stdout || '',
      stderr: data.stderr || '',
      webSocketUri: data.webSocketUri,
      password: data.password
    };
  }

  /**
   * Get container status
   */
  async getContainerStatus(containerGroupName: string): Promise<any> {
    return this.azureClient.getContainerStatus(containerGroupName);
  }

  /**
   * Delete container instance
   */
  async deleteContainer(containerGroupName: string): Promise<void> {
    this.logger.info('Deleting container via Azure API', { containerGroupName });
    await this.azureClient.deleteContainer(containerGroupName);
  }

  /**
   * Create container with git repo volume
   */
  async createContainerWithGitRepo(
    context: SegregationContext,
    dockerConfig: DockerConfig,
    gitRepoUrl: string,
    gitBranch: string = 'main'
  ): Promise<any> {
    validateSegregationContext(context);

    const containerGroupName = `aci-git-${context.sessionId}-${Date.now()}`;
    
    // For git repos, we'll deploy with environment variables
    const deployment = await this.azureClient.deployContainer({
      name: containerGroupName,
      image: dockerConfig.image || this.config.defaultImage || 'node:18',
      resourceGroup: this.config.resourceGroup,
      location: this.config.location,
      cpu: dockerConfig.resources?.cpuCount || 1,
      memoryGB: dockerConfig.resources?.memoryGB || dockerConfig.memoryGB || 1.5,
      ports: dockerConfig.exposedPorts?.map(p => ({ port: p, protocol: 'TCP' as const })) || [{port: 80, protocol: 'TCP' as const}],
      environmentVariables: {
        SESSION_ID: context.sessionId,
        PROJECT_ID: context.projectId,
        TASK_ID: context.taskId,
        USER_ID: context.userId,
        GIT_REPO_URL: gitRepoUrl,
        GIT_BRANCH: gitBranch,
        GITHUB_TOKEN: this.config.githubToken || '',
        ...(dockerConfig.environment || dockerConfig.environmentVariables || {})
      },
      restartPolicy: 'Never'
    });

    // Clone the repo after container starts
    if (gitRepoUrl) {
      await this.executeCommand(
        containerGroupName,
        `git clone ${gitRepoUrl} /workspace && cd /workspace && git checkout ${gitBranch}`
      );
    }

    return deployment;
  }

  /**
   * Create a terminal session for interactive commands
   */
  async createTerminalSession(containerGroupName: string): Promise<any> {
    return this.azureClient.createGitSession(containerGroupName);
  }

  /**
   * List all containers for a session
   */
  async listContainers(sessionId: string): Promise<any[]> {
    // This would need to be implemented in the Azure API
    // For now, return empty array
    this.logger.warn('listContainers not yet implemented in Azure API');
    return [];
  }

  /**
   * Cleanup all containers for a session
   */
  async cleanupSession(sessionId: string): Promise<void> {
    await this.cleanupManager.cleanupByTag(`session:${sessionId}`);
  }

  /**
   * Get or create container (for backward compatibility)
   */
  async getOrCreateContainer(
    context: SegregationContext,
    dockerConfig: DockerConfig
  ): Promise<any> {
    // For now, just create a new container
    // In the future, could check if one exists for this context
    return this.createContainer(context, dockerConfig);
  }

  /**
   * Get container name for a context
   */
  getContainerName(context: SegregationContext): string {
    return `aci-${context.sessionId}-${Date.now()}`;
  }
}