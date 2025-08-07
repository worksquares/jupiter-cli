/**
 * Secure Operations API
 * Provides validated, limited-scope functions for Git and Azure operations
 * No direct credential access - all operations are scoped to user/project/task
 */

import { z } from 'zod';
import { Logger } from '../utils/logger';
import { ContainerInstanceManagementClient } from '@azure/arm-containerinstance';
import { DefaultAzureCredential } from '@azure/identity';
import * as crypto from 'crypto';

// Validation schemas
export const UserProjectTaskSchema = z.object({
  userId: z.string().min(1).max(100),
  projectId: z.string().min(1).max(100),
  taskId: z.string().min(1).max(100),
  sessionToken: z.string().min(32) // Temporary token for this session
});

export const GitOperationSchema = z.object({
  operation: z.enum(['clone', 'pull', 'commit', 'push', 'branch', 'status']),
  parameters: z.record(z.string()).optional()
});

export const AzureOperationSchema = z.object({
  operation: z.enum(['createContainer', 'executeCommand', 'getStatus', 'getLogs', 'stopContainer']),
  parameters: z.record(z.any()).optional()
});

export interface SecureOperationContext {
  userId: string;
  projectId: string;
  taskId: string;
  sessionToken: string;
  aciInstanceId?: string;
}

export interface OperationResult {
  success: boolean;
  data?: any;
  error?: string;
  operationId: string;
  timestamp: Date;
}

/**
 * Secure Operations API - Limited, validated operations only
 */
export class SecureOperationsAPI {
  private logger = Logger.getInstance().child({ component: 'SecureOperationsAPI' });
  private operationHistory: Map<string, OperationResult[]> = new Map();
  private activeContainers: Map<string, SecureOperationContext> = new Map();
  
  constructor(
    private subscriptionId: string,
    private resourceGroup: string
  ) {}

  /**
   * Validate session and get container context
   */
  private async validateSession(context: SecureOperationContext): Promise<boolean> {
    try {
      // Validate context schema
      const validated = UserProjectTaskSchema.parse(context);
      
      // Check session token validity (would check against database/cache)
      // For now, we'll do a simple validation
      if (!this.isValidSessionToken(validated.sessionToken)) {
        throw new Error('Invalid session token');
      }

      // Check if user has permission for this project/task
      if (!await this.checkUserPermissions(validated.userId, validated.projectId, validated.taskId)) {
        throw new Error('User lacks permission for this operation');
      }

      return true;
    } catch (error) {
      this.logger.error('Session validation failed', error);
      return false;
    }
  }

  /**
   * Git Operations - Limited and validated
   */
  async executeGitOperation(
    context: SecureOperationContext,
    operation: z.infer<typeof GitOperationSchema>
  ): Promise<OperationResult> {
    const operationId = this.generateOperationId();
    
    try {
      // Validate session
      if (!await this.validateSession(context)) {
        throw new Error('Invalid session');
      }

      // Validate operation
      const validatedOp = GitOperationSchema.parse(operation);
      
      // Get or create container for this context
      const containerName = await this.getOrCreateContainer(context);
      
      // Build safe command based on operation
      const command = this.buildGitCommand(validatedOp, context);
      
      // Execute in container with timeout and resource limits
      const result = await this.executeInContainer(containerName, command, {
        timeout: 30000, // 30 seconds max
        maxOutput: 1048576 // 1MB max output
      });

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
   * Azure Container Operations - Limited and validated
   */
  async executeAzureOperation(
    context: SecureOperationContext,
    operation: z.infer<typeof AzureOperationSchema>
  ): Promise<OperationResult> {
    const operationId = this.generateOperationId();
    
    try {
      // Validate session
      if (!await this.validateSession(context)) {
        throw new Error('Invalid session');
      }

      // Validate operation
      const validatedOp = AzureOperationSchema.parse(operation);
      
      let result: any;

      switch (validatedOp.operation) {
        case 'createContainer':
          result = await this.createScopedContainer(context, validatedOp.parameters);
          break;
          
        case 'executeCommand':
          result = await this.executeScopedCommand(context, validatedOp.parameters);
          break;
          
        case 'getStatus':
          result = await this.getContainerStatus(context);
          break;
          
        case 'getLogs':
          result = await this.getContainerLogs(context, validatedOp.parameters);
          break;
          
        case 'stopContainer':
          result = await this.stopScopedContainer(context);
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
   * Build safe Git command with validation
   */
  private buildGitCommand(
    operation: z.infer<typeof GitOperationSchema>,
    context: SecureOperationContext
  ): string {
    const { operation: op, parameters = {} } = operation;
    
    // Sanitize all parameters
    const safe = (param: string) => param.replace(/[;&|`$()]/g, '');
    
    switch (op) {
      case 'clone':
        // Only allow cloning from approved GitHub org
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

  /**
   * Create container with limited scope
   */
  private async createScopedContainer(
    context: SecureOperationContext,
    parameters: any = {}
  ): Promise<any> {
    const containerName = `aci-${context.userId}-${context.projectId}-${context.taskId}`.toLowerCase();
    
    // Container configuration with security restrictions
    const containerConfig = {
      name: containerName,
      image: parameters.image || 'mcr.microsoft.com/azure-cli:latest',
      resources: {
        requests: {
          cpu: 0.5,
          memoryInGB: 1
        },
        limits: {
          cpu: 1,
          memoryInGB: 2
        }
      },
      environmentVariables: [
        // Only safe environment variables
        { name: 'PROJECT_ID', value: context.projectId },
        { name: 'TASK_ID', value: context.taskId },
        { name: 'WORKSPACE', value: `/workspace/${context.projectId}` }
      ],
      // No direct credential access
      volumes: [],
      // Network isolation
      networkProfile: {
        id: 'isolated-network-profile'
      }
    };

    // Create container with Azure SDK
    const credential = new DefaultAzureCredential();
    const client = new ContainerInstanceManagementClient(credential, this.subscriptionId);
    
    const result = await client.containerGroups.beginCreateOrUpdate(
      this.resourceGroup,
      containerName,
      {
        location: 'eastus',
        containers: [containerConfig],
        osType: 'Linux',
        restartPolicy: 'Never'
      }
    );

    // Wait for the operation to complete
    const containerGroup = await result.pollUntilDone();
    
    // Store container association
    this.activeContainers.set(containerName, context);
    
    return {
      containerName,
      status: containerGroup.provisioningState,
      fqdn: containerGroup.ipAddress?.fqdn
    };
  }

  /**
   * Execute command in scoped container
   */
  private async executeScopedCommand(
    context: SecureOperationContext,
    parameters: any = {}
  ): Promise<any> {
    const { command, timeout = 30000 } = parameters;
    
    if (!command || typeof command !== 'string') {
      throw new Error('Invalid command');
    }

    // Validate command against whitelist
    if (!this.isAllowedCommand(command)) {
      throw new Error('Command not allowed');
    }

    const containerName = await this.getOrCreateContainer(context);
    
    return await this.executeInContainer(containerName, command, {
      timeout,
      maxOutput: 1048576 // 1MB max
    });
  }

  /**
   * Check if command is in allowed list
   */
  private isAllowedCommand(command: string): boolean {
    const allowedPrefixes = [
      'git ',
      'npm ',
      'node ',
      'ls ',
      'cat ',
      'echo ',
      'pwd',
      'cd ',
      'mkdir ',
      'cp ',
      'mv '
    ];

    const blockedPatterns = [
      /rm\s+-rf/,
      /sudo/,
      /chmod/,
      /chown/,
      /apt-get/,
      /yum/,
      /wget/,
      /curl.*http/,
      /ssh/,
      /telnet/
    ];

    // Check if command starts with allowed prefix
    const hasAllowedPrefix = allowedPrefixes.some(prefix => command.startsWith(prefix));
    
    // Check for blocked patterns
    const hasBlockedPattern = blockedPatterns.some(pattern => pattern.test(command));
    
    return hasAllowedPrefix && !hasBlockedPattern;
  }

  /**
   * Get or create container for context
   */
  private async getOrCreateContainer(context: SecureOperationContext): Promise<string> {
    const containerName = `aci-${context.userId}-${context.projectId}-${context.taskId}`.toLowerCase();
    
    // Check if container exists
    if (this.activeContainers.has(containerName)) {
      return containerName;
    }

    // Create new container
    await this.createScopedContainer(context);
    return containerName;
  }

  /**
   * Execute command in container with limits
   */
  private async executeInContainer(
    containerName: string,
    command: string,
    options: { timeout: number; maxOutput: number }
  ): Promise<any> {
    // This would use Azure Container Instance exec API
    // For now, returning mock result
    return {
      stdout: `Executed: ${command}`,
      stderr: '',
      exitCode: 0
    };
  }

  /**
   * Helper methods
   */
  private generateOperationId(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  private isValidSessionToken(token: string): boolean {
    // Implement actual token validation
    return token.length >= 32;
  }

  private async checkUserPermissions(
    userId: string,
    projectId: string,
    taskId: string
  ): Promise<boolean> {
    // Check against database/permissions service
    return true; // Mock for now
  }

  private recordOperation(context: SecureOperationContext, result: OperationResult): void {
    const key = `${context.userId}-${context.projectId}-${context.taskId}`;
    if (!this.operationHistory.has(key)) {
      this.operationHistory.set(key, []);
    }
    this.operationHistory.get(key)!.push(result);
  }

  private async getContainerStatus(context: SecureOperationContext): Promise<any> {
    const containerName = `aci-${context.userId}-${context.projectId}-${context.taskId}`.toLowerCase();
    // Get status from Azure
    return { status: 'Running', containerName };
  }

  private async getContainerLogs(context: SecureOperationContext, parameters: any = {}): Promise<any> {
    const { tail = 100 } = parameters;
    const containerName = `aci-${context.userId}-${context.projectId}-${context.taskId}`.toLowerCase();
    // Get logs from Azure
    return { logs: 'Container logs here...', containerName };
  }

  private async stopScopedContainer(context: SecureOperationContext): Promise<any> {
    const containerName = `aci-${context.userId}-${context.projectId}-${context.taskId}`.toLowerCase();
    // Stop container in Azure
    this.activeContainers.delete(containerName);
    return { status: 'Stopped', containerName };
  }
}