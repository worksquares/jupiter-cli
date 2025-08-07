/**
 * Secure Credential Store
 * Manages isolated credentials per user/project/task
 * No direct credential access - only through secure operations
 */

import * as crypto from 'crypto';
import { Logger } from '../utils/logger';
import { getEnvConfig } from '../config/environment';

export interface ScopedCredentials {
  userId: string;
  projectId: string;
  taskId: string;
  containerName: string;
  githubToken?: string; // Encrypted, scoped token
  azureContainerAccess?: {
    containerGroupName: string;
    resourceGroup: string;
    allowedOperations: string[];
  };
  createdAt: Date;
  expiresAt: Date;
  sessionToken: string;
}

export interface CredentialRequest {
  userId: string;
  projectId: string;
  taskId: string;
  requestedScopes: string[];
  duration: number; // in minutes
}

/**
 * Secure Credential Store with encryption and isolation
 */
export class SecureCredentialStore {
  private logger = Logger.getInstance().child({ component: 'SecureCredentialStore' });
  private credentials: Map<string, ScopedCredentials> = new Map();
  private encryptionKey: Buffer;
  
  constructor() {
    // Use validated encryption key from environment config
    const envConfig = getEnvConfig();
    this.encryptionKey = crypto.scryptSync(
      envConfig.credentialEncryptionKey,
      'salt',
      32
    );
  }

  /**
   * Create scoped credentials for a specific task
   */
  async createScopedCredentials(request: CredentialRequest): Promise<ScopedCredentials> {
    const { userId, projectId, taskId, requestedScopes, duration } = request;
    
    // Validate request
    this.validateCredentialRequest(request);
    
    // Generate unique session token
    const sessionToken = this.generateSessionToken();
    
    // Create container name
    const containerName = `aci-${userId}-${projectId}-${taskId}`.toLowerCase();
    
    // Create scoped credentials
    const credentials: ScopedCredentials = {
      userId,
      projectId,
      taskId,
      containerName,
      sessionToken,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + duration * 60 * 1000),
      azureContainerAccess: {
        containerGroupName: containerName,
        resourceGroup: getEnvConfig().azureResourceGroup,
        allowedOperations: this.mapScopesToOperations(requestedScopes)
      }
    };

    // If GitHub access is requested, create a scoped token
    if (requestedScopes.includes('github:read') || requestedScopes.includes('github:write')) {
      credentials.githubToken = await this.createScopedGitHubToken(
        projectId,
        requestedScopes.includes('github:write')
      );
    }

    // Store credentials
    const key = this.getCredentialKey(userId, projectId, taskId);
    this.credentials.set(key, credentials);
    
    // Set expiration
    setTimeout(() => {
      this.revokeCredentials(userId, projectId, taskId);
    }, duration * 60 * 1000);

    this.logger.info('Created scoped credentials', {
      userId,
      projectId,
      taskId,
      scopes: requestedScopes,
      expiresAt: credentials.expiresAt
    });

    return credentials;
  }

  /**
   * Get credentials for validation (not for direct use)
   */
  async validateCredentials(
    userId: string,
    projectId: string,
    taskId: string,
    sessionToken: string
  ): Promise<boolean> {
    const key = this.getCredentialKey(userId, projectId, taskId);
    const credentials = this.credentials.get(key);
    
    this.logger.debug('Validating credentials', {
      key,
      hasCredentials: !!credentials,
      allKeys: Array.from(this.credentials.keys()),
      providedToken: sessionToken?.substring(0, 8) + '...',
      storedToken: credentials?.sessionToken?.substring(0, 8) + '...'
    });
    
    if (!credentials) {
      this.logger.debug('No credentials found for key', { key });
      return false;
    }

    // Check session token
    if (credentials.sessionToken !== sessionToken) {
      this.logger.debug('Session token mismatch');
      return false;
    }

    // Check expiration
    if (new Date() > credentials.expiresAt) {
      this.logger.debug('Credentials expired');
      this.revokeCredentials(userId, projectId, taskId);
      return false;
    }

    this.logger.debug('Credentials valid');
    return true;
  }

  /**
   * Get allowed operations for a session
   */
  getAllowedOperations(
    userId: string,
    projectId: string,
    taskId: string
  ): string[] {
    const key = this.getCredentialKey(userId, projectId, taskId);
    const credentials = this.credentials.get(key);
    
    if (!credentials) {
      return [];
    }

    return credentials.azureContainerAccess?.allowedOperations || [];
  }

  /**
   * Revoke credentials
   */
  revokeCredentials(userId: string, projectId: string, taskId: string): void {
    const key = this.getCredentialKey(userId, projectId, taskId);
    const credentials = this.credentials.get(key);
    
    if (credentials) {
      // Clean up any resources
      this.cleanupResources(credentials);
      
      // Remove from store
      this.credentials.delete(key);
      
      this.logger.info('Revoked credentials', {
        userId,
        projectId,
        taskId
      });
    }
  }

  /**
   * Create a scoped GitHub token
   */
  private async createScopedGitHubToken(
    projectId: string,
    writeAccess: boolean
  ): Promise<string> {
    // In production, this would:
    // 1. Use GitHub Apps to create installation access tokens
    // 2. Scope the token to specific repository
    // 3. Set short expiration
    
    // For now, we encrypt a marker that indicates the scope
    const scopeData = {
      projectId,
      writeAccess,
      createdAt: new Date(),
      type: 'github-scoped'
    };

    return this.encrypt(JSON.stringify(scopeData));
  }

  /**
   * Map requested scopes to allowed operations
   */
  private mapScopesToOperations(scopes: string[]): string[] {
    const operationMap: Record<string, string[]> = {
      'container:create': ['createContainer'],
      'container:execute': ['executeCommand'],
      'container:read': ['getStatus', 'getLogs'],
      'container:stop': ['stopContainer'],
      'git:read': ['clone', 'pull', 'status'],
      'git:write': ['commit', 'push', 'branch'],
      'build:execute': ['executeCommand'],
      'deploy:execute': ['executeCommand']
    };

    const allowedOperations = new Set<string>();
    
    for (const scope of scopes) {
      const operations = operationMap[scope];
      if (operations) {
        operations.forEach(op => allowedOperations.add(op));
      }
    }

    return Array.from(allowedOperations);
  }

  /**
   * Validate credential request
   */
  private validateCredentialRequest(request: CredentialRequest): void {
    const { userId, projectId, taskId, requestedScopes, duration } = request;
    
    if (!userId || !projectId || !taskId) {
      throw new Error('Missing required identifiers');
    }

    if (!requestedScopes || requestedScopes.length === 0) {
      throw new Error('No scopes requested');
    }

    if (duration < 1 || duration > 240) { // Max 4 hours
      throw new Error('Invalid duration (1-240 minutes)');
    }

    // Validate scope format
    const validScopes = [
      'container:create',
      'container:execute',
      'container:read',
      'container:stop',
      'git:read',
      'git:write',
      'build:execute',
      'deploy:execute'
    ];

    for (const scope of requestedScopes) {
      if (!validScopes.includes(scope)) {
        throw new Error(`Invalid scope: ${scope}`);
      }
    }
  }

  /**
   * Clean up resources when credentials are revoked
   */
  private cleanupResources(credentials: ScopedCredentials): void {
    // In production, this would:
    // 1. Revoke any created tokens
    // 2. Stop/delete associated containers
    // 3. Clean up temporary resources
    
    this.logger.info('Cleaning up resources for revoked credentials', {
      containerName: credentials.containerName
    });
  }

  /**
   * Utility methods
   */
  private getCredentialKey(userId: string, projectId: string, taskId: string): string {
    return `${userId}:${projectId}:${taskId}`;
  }

  private generateSessionToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  private encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', this.encryptionKey, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  private decrypt(text: string): string {
    const parts = text.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const decipher = crypto.createDecipheriv('aes-256-cbc', this.encryptionKey, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  /**
   * Get credential statistics
   */
  getStats(): {
    activeCredentials: number;
    credentialsByUser: Map<string, number>;
    upcomingExpirations: number;
  } {
    const now = new Date();
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);
    
    const credentialsByUser = new Map<string, number>();
    let upcomingExpirations = 0;

    for (const [, creds] of this.credentials) {
      // Count by user
      const count = credentialsByUser.get(creds.userId) || 0;
      credentialsByUser.set(creds.userId, count + 1);
      
      // Check upcoming expirations
      if (creds.expiresAt <= fiveMinutesFromNow) {
        upcomingExpirations++;
      }
    }

    return {
      activeCredentials: this.credentials.size,
      credentialsByUser,
      upcomingExpirations
    };
  }
}