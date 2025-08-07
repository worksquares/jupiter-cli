/**
 * REAL Integration Tests for Azure Operations
 * NO MOCKS - Uses actual Azure services
 */

import { SecureOperationsAPI, SecureOperationContext } from '../../src/security/secure-operations-api';
import { RealSecureOperationsAPI } from '../../src/security/secure-operations-api-real';
import { SecureCredentialStore } from '../../src/security/secure-credential-store';
import { ContainerInstanceManagementClient } from '@azure/arm-containerinstance';
import { DefaultAzureCredential } from '@azure/identity';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load real credentials
dotenv.config({ path: path.join(__dirname, '../../.env') });

describe('REAL Azure Operations Integration Tests', () => {
  let api: RealSecureOperationsAPI;
  let credentialStore: SecureCredentialStore;
  let context: SecureOperationContext;
  const testPrefix = `test-${Date.now()}`;
  
  // Real Azure credentials from .env
  const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID!;
  const resourceGroup = process.env.AZURE_RESOURCE_GROUP!;
  
  beforeAll(async () => {
    // Verify we have real credentials
    expect(subscriptionId).toBeDefined();
    expect(resourceGroup).toBeDefined();
    expect(process.env.AZURE_CLIENT_ID).toBeDefined();
    expect(process.env.AZURE_CLIENT_SECRET).toBeDefined();
    expect(process.env.AZURE_TENANT_ID).toBeDefined();
    
    console.log('Using real Azure credentials for testing');
    console.log(`Subscription: ${subscriptionId}`);
    console.log(`Resource Group: ${resourceGroup}`);
  });

  beforeEach(async () => {
    // Create real instances
    credentialStore = new SecureCredentialStore();
    api = new RealSecureOperationsAPI(subscriptionId, resourceGroup, credentialStore);
    
    // Create real scoped credentials
    const credentials = await credentialStore.createScopedCredentials({
      userId: testPrefix,
      projectId: 'real-test-project',
      taskId: `task-${Date.now()}`,
      requestedScopes: [
        'container:create',
        'container:execute',
        'container:read',
        'container:stop',
        'git:read',
        'git:write',
        'build:execute'
      ],
      duration: 30 // 30 minutes for testing
    });
    
    context = {
      userId: credentials.userId,
      projectId: credentials.projectId,
      taskId: credentials.taskId,
      sessionToken: credentials.sessionToken,
      aciInstanceId: credentials.containerName
    };
  });

  afterEach(async () => {
    // Clean up real resources
    try {
      // Stop and delete container
      await api.executeAzureOperation(context, {
        operation: 'stopContainer'
      });
      
      // Revoke credentials
      credentialStore.revokeCredentials(
        context.userId,
        context.projectId,
        context.taskId
      );
    } catch (error) {
      console.log('Cleanup error (expected if container was not created):', error);
    }
  });

  describe('Real Container Operations', () => {
    it('should create a real Azure Container Instance', async () => {
      const result = await api.executeAzureOperation(context, {
        operation: 'createContainer',
        parameters: {
          image: 'mcr.microsoft.com/azure-cli:latest',
          cpu: 0.5,
          memory: 1
        }
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.containerName).toContain(context.userId);
      expect(result.data.status).toBeDefined();
      
      console.log('Created real container:', result.data.containerName);
      
      // Wait for container to be ready
      await new Promise(resolve => setTimeout(resolve, 30000)); // 30 seconds
    }, 120000); // 2 minute timeout

    it('should execute real commands in container', async () => {
      // First create container
      const createResult = await api.executeAzureOperation(context, {
        operation: 'createContainer',
        parameters: {
          image: 'node:18-alpine',
          cpu: 0.5,
          memory: 1
        }
      });
      
      expect(createResult.success).toBe(true);
      
      // Wait for container to be ready
      await new Promise(resolve => setTimeout(resolve, 30000));
      
      // Execute real command
      const execResult = await api.executeAzureOperation(context, {
        operation: 'executeCommand',
        parameters: {
          command: 'node --version',
          timeout: 10000
        }
      });
      
      expect(execResult.success).toBe(true);
      expect(execResult.data).toBeDefined();
      expect(execResult.data.stdout).toContain('v18');
      
      console.log('Command output:', execResult.data.stdout);
    }, 120000);

    it('should get real container status', async () => {
      // Create container first
      await api.executeAzureOperation(context, {
        operation: 'createContainer',
        parameters: {
          image: 'mcr.microsoft.com/azure-cli:latest',
          cpu: 0.5,
          memory: 1
        }
      });
      
      await new Promise(resolve => setTimeout(resolve, 20000));
      
      const result = await api.executeAzureOperation(context, {
        operation: 'getStatus'
      });
      
      expect(result.success).toBe(true);
      expect(result.data.status).toBeDefined();
      expect(['Running', 'Succeeded', 'Pending'].includes(result.data.status)).toBe(true);
      
      console.log('Container status:', result.data.status);
    }, 120000);

    it('should get real container logs', async () => {
      // Create and run container with output
      await api.executeAzureOperation(context, {
        operation: 'createContainer',
        parameters: {
          image: 'node:18-alpine',
          cpu: 0.5,
          memory: 1
        }
      });
      
      await new Promise(resolve => setTimeout(resolve, 30000));
      
      // Execute command that produces logs
      await api.executeAzureOperation(context, {
        operation: 'executeCommand',
        parameters: {
          command: 'echo "Test log output from real container"',
          timeout: 5000
        }
      });
      
      const result = await api.executeAzureOperation(context, {
        operation: 'getLogs',
        parameters: { tail: 50 }
      });
      
      expect(result.success).toBe(true);
      expect(result.data.logs).toBeDefined();
      
      console.log('Container logs:', result.data.logs);
    }, 120000);
  });

  describe('Real Git Operations in Container', () => {
    let containerCreated = false;

    beforeEach(async () => {
      // Create container with git
      const result = await api.executeAzureOperation(context, {
        operation: 'createContainer',
        parameters: {
          image: 'alpine/git:latest',
          cpu: 0.5,
          memory: 1
        }
      });
      
      containerCreated = result.success;
      expect(containerCreated).toBe(true);
      
      // Wait for container
      await new Promise(resolve => setTimeout(resolve, 30000));
    });

    it('should execute real git operations', async () => {
      if (!containerCreated) {
        console.log('Skipping test - container not created');
        return;
      }

      // Initialize git repo
      const initResult = await api.executeAzureOperation(context, {
        operation: 'executeCommand',
        parameters: {
          command: `mkdir -p /workspace/${context.projectId} && cd /workspace/${context.projectId} && git init`,
          timeout: 10000
        }
      });
      
      expect(initResult.success).toBe(true);
      
      // Check git status
      const statusResult = await api.executeGitOperation(context, {
        operation: 'status'
      });
      
      expect(statusResult.success).toBe(true);
      console.log('Git status:', statusResult.data);
    }, 120000);

    it('should handle real git commits', async () => {
      if (!containerCreated) {
        console.log('Skipping test - container not created');
        return;
      }

      // Setup git
      await api.executeAzureOperation(context, {
        operation: 'executeCommand',
        parameters: {
          command: `cd /workspace/${context.projectId} && git init && git config user.email "test@example.com" && git config user.name "Test User"`,
          timeout: 10000
        }
      });
      
      // Create a file
      await api.executeAzureOperation(context, {
        operation: 'executeCommand',
        parameters: {
          command: `cd /workspace/${context.projectId} && echo "# Test Project" > README.md`,
          timeout: 5000
        }
      });
      
      // Commit
      const commitResult = await api.executeGitOperation(context, {
        operation: 'commit',
        parameters: {
          message: 'Initial commit - real test'
        }
      });
      
      expect(commitResult.success).toBe(true);
      console.log('Commit result:', commitResult.data);
    }, 120000);
  });

  describe('Real Build Operations', () => {
    it('should run real npm commands', async () => {
      // Create Node.js container
      const createResult = await api.executeAzureOperation(context, {
        operation: 'createContainer',
        parameters: {
          image: 'node:18-alpine',
          cpu: 1,
          memory: 2
        }
      });
      
      expect(createResult.success).toBe(true);
      await new Promise(resolve => setTimeout(resolve, 30000));
      
      // Create package.json
      const packageJson = {
        name: "test-project",
        version: "1.0.0",
        scripts: {
          test: "echo 'Tests passed!'",
          build: "echo 'Build complete!'"
        }
      };
      
      await api.executeAzureOperation(context, {
        operation: 'executeCommand',
        parameters: {
          command: `cd /workspace/${context.projectId} && echo '${JSON.stringify(packageJson)}' > package.json`,
          timeout: 5000
        }
      });
      
      // Run npm commands
      const npmResult = await api.executeAzureOperation(context, {
        operation: 'executeCommand',
        parameters: {
          command: `cd /workspace/${context.projectId} && npm test`,
          timeout: 30000
        }
      });
      
      expect(npmResult.success).toBe(true);
      expect(npmResult.data.stdout).toContain('Tests passed!');
      
      console.log('NPM test output:', npmResult.data.stdout);
    }, 180000); // 3 minute timeout
  });

  describe('Real Security Validation', () => {
    it('should block dangerous commands in real container', async () => {
      // Create container
      await api.executeAzureOperation(context, {
        operation: 'createContainer',
        parameters: {
          image: 'alpine:latest',
          cpu: 0.5,
          memory: 1
        }
      });
      
      await new Promise(resolve => setTimeout(resolve, 20000));
      
      // Try dangerous commands
      const dangerousResult = await api.executeAzureOperation(context, {
        operation: 'executeCommand',
        parameters: {
          command: 'rm -rf /',
          timeout: 5000
        }
      });
      
      expect(dangerousResult.success).toBe(false);
      expect(dangerousResult.error).toContain('Command not allowed');
      
      console.log('Security check passed - dangerous command blocked');
    }, 60000);

    it('should reject unauthorized repository clones', async () => {
      const cloneResult = await api.executeGitOperation(context, {
        operation: 'clone',
        parameters: {
          repository: 'https://github.com/evil-org/malicious-repo.git'
        }
      });
      
      expect(cloneResult.success).toBe(false);
      expect(cloneResult.error).toContain('Invalid repository URL');
      
      console.log('Security check passed - unauthorized repo blocked');
    });
  });
});

describe('REAL Azure Container Lifecycle', () => {
  it('should handle complete container lifecycle', async () => {
    const credentialStore = new SecureCredentialStore();
    const api = new RealSecureOperationsAPI(
      process.env.AZURE_SUBSCRIPTION_ID!,
      process.env.AZURE_RESOURCE_GROUP!,
      credentialStore
    );
    const testId = `lifecycle-${Date.now()}`;
    
    // Create credentials
    const credentials = await credentialStore.createScopedCredentials({
      userId: testId,
      projectId: 'lifecycle-test',
      taskId: 'task-1',
      requestedScopes: ['container:create', 'container:execute', 'container:stop'],
      duration: 10
    });
    
    const context: SecureOperationContext = {
      userId: credentials.userId,
      projectId: credentials.projectId,
      taskId: credentials.taskId,
      sessionToken: credentials.sessionToken
    };
    
    try {
      // 1. Create
      console.log('Creating container...');
      const createResult = await api.executeAzureOperation(context, {
        operation: 'createContainer',
        parameters: { image: 'alpine:latest', cpu: 0.5, memory: 1 }
      });
      expect(createResult.success).toBe(true);
      
      // 2. Wait for ready
      await new Promise(resolve => setTimeout(resolve, 30000));
      
      // 3. Execute
      console.log('Executing command...');
      const execResult = await api.executeAzureOperation(context, {
        operation: 'executeCommand',
        parameters: { command: 'echo "Hello from real Azure container!"', timeout: 5000 }
      });
      expect(execResult.success).toBe(true);
      expect(execResult.data.stdout).toContain('Hello from real Azure container!');
      
      // 4. Get status
      console.log('Getting status...');
      const statusResult = await api.executeAzureOperation(context, {
        operation: 'getStatus'
      });
      expect(statusResult.success).toBe(true);
      
      // 5. Stop
      console.log('Stopping container...');
      const stopResult = await api.executeAzureOperation(context, {
        operation: 'stopContainer'
      });
      expect(stopResult.success).toBe(true);
      
      console.log('Container lifecycle test completed successfully!');
      
    } finally {
      // Cleanup
      credentialStore.revokeCredentials(
        credentials.userId,
        credentials.projectId,
        credentials.taskId
      );
    }
  }, 180000); // 3 minute timeout
});