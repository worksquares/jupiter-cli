/**
 * REAL Implementation of Secure Operations API
 * Actually connects to Azure and executes operations
 */

import { z } from 'zod';
import { Logger } from '../utils/logger';
import { 
  ContainerInstanceManagementClient,
  ContainerGroup,
  Container
} from '@azure/arm-containerinstance';
import { 
  DefaultAzureCredential,
  ClientSecretCredential,
  ManagedIdentityCredential
} from '@azure/identity';
import * as crypto from 'crypto';
import axios from 'axios';

// Use the same schemas from the original
import { 
  UserProjectTaskSchema,
  GitOperationSchema,
  AzureOperationSchema,
  SecureOperationContext,
  OperationResult
} from './secure-operations-api';

// Import Azure configuration
import { 
  getAzureConfig, 
  getAzureCredentialType,
  getContainerImage,
  validateAzureConfig 
} from '../config/azure-config';

/**
 * REAL Secure Operations API - Actually executes in Azure
 */
export class RealSecureOperationsAPI {
  private logger = Logger.getInstance().child({ component: 'RealSecureOperationsAPI' });
  private operationHistory: Map<string, OperationResult[]> = new Map();
  private activeContainers: Map<string, ContainerGroup> = new Map();
  private containerClient!: ContainerInstanceManagementClient;
  private credential: any;
  private credentialStore: any; // Reference to credential store for validation
  private azureConfig = getAzureConfig();
  
  constructor(
    private subscriptionId?: string,
    private resourceGroup?: string,
    credentialStore?: any
  ) {
    // Use configuration or provided values
    this.subscriptionId = subscriptionId || this.azureConfig.subscriptionId || '';
    this.resourceGroup! = resourceGroup || this.azureConfig.resourceGroup;
    this.credentialStore = credentialStore;
    
    // Initialize with proper credential type
    this.credential = this.initializeCredential();
    
    // Only initialize container client if we have a subscription ID
    if (this.subscriptionId) {
      this.containerClient = new ContainerInstanceManagementClient(
        this.credential,
        this.subscriptionId
      );
    } else {
      this.logger.warn('No Azure subscription ID configured - container operations will be limited');
    }
  }
  
  /**
   * Initialize the appropriate Azure credential based on configuration
   */
  private initializeCredential(): any {
    const credType = getAzureCredentialType();
    
    switch (credType) {
      case 'service-principal':
        const config = this.azureConfig;
        if (config.clientId && config.clientSecret && config.tenantId) {
          this.logger.info('Using Service Principal authentication');
          return new ClientSecretCredential(
            config.tenantId,
            config.clientId,
            config.clientSecret
          );
        }
        break;
        
      case 'managed-identity':
        this.logger.info('Using Managed Identity authentication');
        return new ManagedIdentityCredential();
        
      default:
        this.logger.info('Using Default Azure Credential chain');
        return new DefaultAzureCredential();
    }
  }

  /**
   * Execute Git Operation - REAL implementation
   */
  async executeGitOperation(
    context: SecureOperationContext,
    operation: z.infer<typeof GitOperationSchema>
  ): Promise<OperationResult> {
    const operationId = this.generateOperationId();
    
    try {
      // Validate session
      if (!await this.validateSession(context)) {
        this.logger.error('Session validation failed', { context });
        throw new Error('Invalid session');
      }

      // Validate operation
      const validatedOp = GitOperationSchema.parse(operation);
      
      // Build safe command
      const command = this.buildGitCommand(validatedOp, context);
      
      // Execute in real container
      const containerName = this.getContainerName(context);
      const result = await this.executeRealCommand(containerName, command);

      const opResult: OperationResult = {
        success: result.exitCode === 0,
        data: result,
        error: result.exitCode !== 0 ? result.stderr : undefined,
        operationId,
        timestamp: new Date()
      };

      this.recordOperation(context, opResult);
      return opResult;

    } catch (error: any) {
      const opResult: OperationResult = {
        success: false,
        error: error.message,
        operationId,
        timestamp: new Date()
      };

      this.recordOperation(context, opResult);
      return opResult;
    }
  }

  /**
   * Execute Azure Operation - REAL implementation
   */
  async executeAzureOperation(
    context: SecureOperationContext,
    operation: z.infer<typeof AzureOperationSchema>
  ): Promise<OperationResult> {
    const operationId = this.generateOperationId();
    
    try {
      // Validate session
      if (!await this.validateSession(context)) {
        this.logger.error('Session validation failed', { context });
        throw new Error('Invalid session');
      }

      // Validate operation
      const validatedOp = AzureOperationSchema.parse(operation);
      
      let result: any;

      switch (validatedOp.operation) {
        case 'createContainer':
          result = await this.createRealContainer(context, validatedOp.parameters);
          break;
          
        case 'executeCommand':
          result = await this.executeRealCommandInContainer(context, validatedOp.parameters);
          break;
          
        case 'getStatus':
          result = await this.getRealContainerStatus(context);
          break;
          
        case 'getLogs':
          result = await this.getRealContainerLogs(context, validatedOp.parameters);
          break;
          
        case 'stopContainer':
          result = await this.stopRealContainer(context);
          break;
          
        default:
          throw new Error('Invalid operation');
      }

      const opResult: OperationResult = {
        success: true,
        data: result,
        operationId,
        timestamp: new Date()
      };

      this.recordOperation(context, opResult);
      return opResult;

    } catch (error: any) {
      const opResult: OperationResult = {
        success: false,
        error: error.message,
        operationId,
        timestamp: new Date()
      };

      this.recordOperation(context, opResult);
      return opResult;
    }
  }

  /**
   * Create REAL container in Azure
   */
  private async createRealContainer(
    context: SecureOperationContext,
    parameters: any = {}
  ): Promise<any> {
    const containerName = this.getContainerName(context);
    
    this.logger.info('Creating real Azure container', { containerName });

    try {
      // Check if container already exists
      try {
        const existing = await this.containerClient.containerGroups.get(
          this.resourceGroup!,
          containerName
        );
        if (existing) {
          this.logger.info('Container already exists', { containerName });
          return {
            containerName,
            status: existing.provisioningState,
            fqdn: existing.ipAddress?.fqdn,
            ip: existing.ipAddress?.ip
          };
        }
      } catch (e) {
        // Container doesn't exist, proceed to create
      }

      // Import template definitions
      const { CONTAINER_TEMPLATES } = await import('../types/container-templates');
      
      // Use configuration-based image selection
      let image = parameters.image || getContainerImage(parameters.template || 'default');
      let cpu = parameters.cpu || this.azureConfig.defaults.containerCpu;
      let memory = parameters.memory || this.azureConfig.defaults.containerMemory;
      let envVars = [
        { name: 'PROJECT_ID', value: context.projectId },
        { name: 'TASK_ID', value: context.taskId }
      ];
      
      this.logger.info('Using container configuration', { 
        template: parameters.template || 'default',
        image: image,
        cpu: cpu,
        memory: memory
      });

      // Add git repo if provided
      if (parameters.gitRepo) {
        envVars.push({ name: 'GIT_REPO', value: parameters.gitRepo });
      }
      
      // Add git token if provided
      if (parameters.gitToken) {
        envVars.push({ name: 'GIT_TOKEN', value: parameters.gitToken });
      }

      // Add any additional environment variables
      if (parameters.environmentVariables) {
        Object.entries(parameters.environmentVariables).forEach(([key, value]) => {
          envVars.push({ name: key, value: String(value) });
        });
      }

      // Create container group
      const containerGroup: ContainerGroup = {
        location: 'eastus',
        osType: 'Linux',
        restartPolicy: 'Never',
        containers: [{
          name: containerName,
          image: image,
          resources: {
            requests: {
              cpu: cpu,
              memoryInGB: memory
            }
          },
          environmentVariables: envVars,
          // Always use a command that keeps the container running
          command: ['/bin/sh', '-c', 'tail -f /dev/null']
        }],
        // Add registry credentials only if using private registry
        ...(!this.azureConfig.containerRegistry.usePublicRegistry && 
            this.azureConfig.containerRegistry.username && 
            this.azureConfig.containerRegistry.password ? {
          imageRegistryCredentials: [{
            server: this.azureConfig.containerRegistry.server,
            username: this.azureConfig.containerRegistry.username,
            password: this.azureConfig.containerRegistry.password
          }]
        } : {})
      };

      const poller = await this.containerClient.containerGroups.beginCreateOrUpdate(
        this.resourceGroup!,
        containerName,
        containerGroup
      );
      
      const result = await poller.pollUntilDone();

      // Store container reference
      this.activeContainers.set(containerName, result);

      // Wait for container to be ready
      await this.waitForContainerReady(containerName);

      return {
        containerName,
        status: result.provisioningState,
        fqdn: result.ipAddress?.fqdn,
        ip: result.ipAddress?.ip
      };

    } catch (error: any) {
      this.logger.error('Failed to create container', error);
      throw new Error(`Container creation failed: ${error.message}`);
    }
  }

  /**
   * Execute REAL command in container
   */
  private async executeRealCommandInContainer(
    context: SecureOperationContext,
    parameters: any = {}
  ): Promise<any> {
    const { command, timeout = 60000 } = parameters; // Increased default to 60 seconds
    
    if (!command || typeof command !== 'string') {
      throw new Error('Invalid command');
    }

    // Validate command
    if (!this.isAllowedCommand(command)) {
      throw new Error('Command not allowed');
    }

    const containerName = this.getContainerName(context);
    
    return await this.executeRealCommand(containerName, command, timeout);
  }

  /**
   * Execute command using Azure Container Instance exec
   */
  private async executeRealCommand(
    containerGroupName: string,
    command: string,
    timeout: number = 30000
  ): Promise<any> {
    try {
      this.logger.info('Executing real command in container', { 
        containerGroupName, 
        command: command.substring(0, 50) + '...' 
      });

      // Execute command via exec API
      const execResult = await this.containerClient.containers.executeCommand(
        this.resourceGroup!,
        containerGroupName,
        containerGroupName, // container name same as group name
        {
          command: `/bin/sh -c "${command}"`,
          terminalSize: {
            rows: 24,
            cols: 80
          }
        }
      );

      // Get the exec result
      const webSocketUri = execResult.webSocketUri;
      const password = execResult.password;

      if (!webSocketUri) {
        throw new Error('No WebSocket URI returned');
      }

      // Use WebSocket client for real execution
      const { WebSocketExecClient } = await import('../services/websocket-exec-client');
      const wsClient = new WebSocketExecClient(webSocketUri, password || '');
      
      try {
        await wsClient.connect();
        const result = await wsClient.execute(command, { timeout });
        wsClient.close();
        return result;
      } catch (error: any) {
        wsClient.close();
        throw error;
      }

    } catch (error: any) {
      this.logger.error('Command execution failed', error);
      return {
        stdout: '',
        stderr: error.message,
        exitCode: 1
      };
    }
  }

  /**
   * Get REAL container status
   */
  private async getRealContainerStatus(context: SecureOperationContext): Promise<any> {
    const containerName = this.getContainerName(context);
    
    try {
      const containerGroup = await this.containerClient.containerGroups.get(
        this.resourceGroup!,
        containerName
      );

      return {
        containerName,
        status: containerGroup.provisioningState,
        state: containerGroup.instanceView?.state,
        containers: containerGroup.containers?.map(c => ({
          name: c.name,
          state: c.instanceView?.currentState?.state,
          ready: c.instanceView?.currentState?.state === 'Running'
        }))
      };

    } catch (error: any) {
      if (error.statusCode === 404) {
        return {
          containerName,
          status: 'NotFound',
          error: 'Container not found'
        };
      }
      throw error;
    }
  }

  /**
   * Get REAL container logs
   */
  private async getRealContainerLogs(
    context: SecureOperationContext,
    parameters: any = {}
  ): Promise<any> {
    const { tail = 100 } = parameters;
    const containerName = this.getContainerName(context);
    
    try {
      const logs = await this.containerClient.containers.listLogs(
        this.resourceGroup!,
        containerName,
        containerName, // container name same as group name
        { tail }
      );

      return {
        containerName,
        logs: logs.content || ''
      };

    } catch (error: any) {
      this.logger.error('Failed to get logs', error);
      return {
        containerName,
        logs: '',
        error: error.message
      };
    }
  }

  /**
   * Stop REAL container
   */
  private async stopRealContainer(context: SecureOperationContext): Promise<any> {
    const containerName = this.getContainerName(context);
    
    try {
      await this.containerClient.containerGroups.stop(
        this.resourceGroup!,
        containerName
      );

      // Remove from active containers
      this.activeContainers.delete(containerName);

      return {
        containerName,
        status: 'Stopped'
      };

    } catch (error: any) {
      if (error.statusCode === 404) {
        return {
          containerName,
          status: 'NotFound',
          error: 'Container not found'
        };
      }
      throw error;
    }
  }

  /**
   * Wait for container to be ready
   */
  private async waitForContainerReady(
    containerName: string,
    maxWaitTime: number = 180000 // Increased to 3 minutes
  ): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      try {
        const containerGroup = await this.containerClient.containerGroups.get(
          this.resourceGroup!,
          containerName
        );

        this.logger.info('Container status', {
          containerName,
          provisioningState: containerGroup.provisioningState,
          instanceViewState: containerGroup.instanceView?.state,
          containers: containerGroup.containers?.map(c => ({
            name: c.name,
            state: c.instanceView?.currentState?.state
          }))
        });

        // Check if provisioning succeeded
        if (containerGroup.provisioningState === 'Succeeded') {
          // For devcontainer images, we just need the container to be in Running state
          const containersRunning = containerGroup.containers?.every(c => {
            const state = c.instanceView?.currentState?.state;
            return state === 'Running' || state === 'Terminated';
          });

          if (containersRunning) {
            this.logger.info('Container is ready', { containerName });
            return;
          }
        } else if (containerGroup.provisioningState === 'Failed') {
          throw new Error(`Container provisioning failed: ${containerGroup.instanceView?.events?.map(e => e.message).join(', ')}`);
        }

        // Wait 5 seconds before checking again
        await new Promise(resolve => setTimeout(resolve, 5000));

      } catch (error) {
        this.logger.error('Error checking container status', error);
        throw error;
      }
    }

    throw new Error(`Container did not become ready within ${maxWaitTime}ms`);
  }

  /**
   * Helper methods (same as original)
   */
  private async validateSession(context: SecureOperationContext): Promise<boolean> {
    try {
      // Extract only the fields needed for validation
      const contextForValidation = {
        userId: context.userId,
        projectId: context.projectId,
        taskId: context.taskId,
        sessionToken: context.sessionToken
      };
      
      const validated = UserProjectTaskSchema.parse(contextForValidation);
      
      // If we have a credential store, use it for validation
      if (this.credentialStore) {
        this.logger.debug('Validating with credential store', {
          userId: context.userId,
          projectId: context.projectId,
          taskId: context.taskId,
          hasToken: !!context.sessionToken,
          tokenLength: context.sessionToken?.length
        });
        
        const isValid = await this.credentialStore.validateCredentials(
          context.userId,
          context.projectId,
          context.taskId,
          context.sessionToken
        );
        
        this.logger.debug('Credential store validation result', { isValid });
        return isValid;
      }
      
      // Otherwise just check token format
      this.logger.debug('No credential store, checking token format');
      return this.isValidSessionToken(validated.sessionToken);
    } catch (error: any) {
      this.logger.error('Session validation error', { 
        error: error.message,
        stack: error.stack,
        name: error.name
      });
      return false;
    }
  }

  private isValidSessionToken(token: string): boolean {
    return token.length >= 32;
  }

  private getContainerName(context: SecureOperationContext): string {
    // Create shorter container name to stay within 63 char limit
    const userId = context.userId.substring(0, 8);
    const projectId = context.projectId.substring(0, 8);
    const taskId = context.taskId.substring(0, 8);
    
    const name = `aci-${userId}-${projectId}-${taskId}`
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-');
      
    // Ensure it ends with alphanumeric character
    let finalName = name.substring(0, 63);
    while (finalName.length > 0 && !finalName.match(/[a-z0-9]$/)) {
      finalName = finalName.substring(0, finalName.length - 1);
    }
    
    return finalName || 'aci-container';
  }

  private buildGitCommand(
    operation: z.infer<typeof GitOperationSchema>,
    context: SecureOperationContext
  ): string {
    const { operation: op, parameters = {} } = operation;
    const safe = (param: string) => param.replace(/[;&|`$()]/g, '');
    
    switch (op) {
      case 'clone':
        const repoUrl = parameters.repository;
        if (!repoUrl || !repoUrl.includes('github.com/worksquares/')) {
          throw new Error('Invalid repository URL');
        }
        return `git clone ${safe(repoUrl)} /workspace/${context.projectId}`;
        
      case 'pull':
        return `cd /workspace/${context.projectId} && git pull origin main`;
        
      case 'commit':
        const message = parameters.message || 'Auto-commit';
        return `cd /workspace/${context.projectId} && git add -A && git commit -m "${safe(message)}"`;
        
      case 'push':
        return `cd /workspace/${context.projectId} && git push origin main`;
        
      case 'branch':
        const branchName = parameters.name;
        if (!branchName || !/^[a-zA-Z0-9\-_\/]+$/.test(branchName)) {
          throw new Error('Invalid branch name');
        }
        return `cd /workspace/${context.projectId} && git checkout -b ${branchName}`;
        
      case 'status':
        return `cd /workspace/${context.projectId} && git status`;
        
      default:
        throw new Error('Invalid git operation');
    }
  }

  private isAllowedCommand(command: string): boolean {
    const allowedPrefixes = [
      'git ', 'npm ', 'node ', 'ls ', 'cat ', 'echo ', 
      'pwd', 'cd ', 'mkdir ', 'cp ', 'mv ', 'yarn '
    ];

    const blockedPatterns = [
      /rm\s+-rf/, /sudo/, /chmod/, /chown/, /apt-get/, /yum/,
      /wget/, /curl.*http/, /ssh/, /telnet/, /nc\s+/
    ];

    const hasAllowedPrefix = allowedPrefixes.some(prefix => command.startsWith(prefix));
    const hasBlockedPattern = blockedPatterns.some(pattern => pattern.test(command));
    
    return hasAllowedPrefix && !hasBlockedPattern;
  }

  private generateOperationId(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  private recordOperation(context: SecureOperationContext, result: OperationResult): void {
    const key = `${context.userId}-${context.projectId}-${context.taskId}`;
    if (!this.operationHistory.has(key)) {
      this.operationHistory.set(key, []);
    }
    this.operationHistory.get(key)!.push(result);
  }

  /**
   * Cleanup all containers for testing
   */
  async cleanupTestContainers(prefix: string): Promise<void> {
    try {
      const containerGroups = await this.containerClient.containerGroups.listByResourceGroup(
        this.resourceGroup!
      );

      // containerGroups is a PagedAsyncIterableIterator, need to iterate properly
      for await (const group of containerGroups) {
        if (group.name?.startsWith(`aci-${prefix}`)) {
          this.logger.info('Cleaning up test container', { name: group.name });
          try {
            const deletePoller = await this.containerClient.containerGroups.beginDelete(
              this.resourceGroup!,
              group.name
            );
            await deletePoller.pollUntilDone();
          } catch (e) {
            this.logger.error('Failed to delete container', e);
          }
        }
      }
    } catch (error) {
      this.logger.error('Cleanup failed', error);
    }
  }
}