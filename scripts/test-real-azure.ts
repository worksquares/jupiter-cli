#!/usr/bin/env ts-node

/**
 * Test Runner for REAL Azure Integration Tests
 * NO MOCKS - Uses actual Azure services
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { RealSecureOperationsAPI } from '../src/security/secure-operations-api-real';
import { SecureCredentialStore } from '../src/security/secure-credential-store';
import { SecureOperationContext } from '../src/security/secure-operations-api';
import chalk from 'chalk';

// Load real credentials
dotenv.config({ path: path.join(__dirname, '../.env') });

interface TestResult {
  name: string;
  success: boolean;
  duration: number;
  error?: string;
}

class RealAzureTestRunner {
  private results: TestResult[] = [];
  private api: RealSecureOperationsAPI;
  private credentialStore: SecureCredentialStore;
  private testPrefix = `test-${Date.now()}`;
  
  constructor() {
    // Verify credentials
    this.verifyCredentials();
    
    // Initialize credential store first
    this.credentialStore = new SecureCredentialStore();
    
    // Initialize real API with credential store
    this.api = new RealSecureOperationsAPI(
      process.env.AZURE_SUBSCRIPTION_ID!,
      process.env.AZURE_RESOURCE_GROUP!,
      this.credentialStore
    );
  }

  private verifyCredentials(): void {
    const required = [
      'AZURE_SUBSCRIPTION_ID',
      'AZURE_RESOURCE_GROUP',
      'AZURE_CLIENT_ID',
      'AZURE_CLIENT_SECRET',
      'AZURE_TENANT_ID'
    ];

    const missing = required.filter(key => !process.env[key]);
    if (missing.length > 0) {
      console.error(chalk.red('Missing required credentials:'), missing);
      process.exit(1);
    }

    console.log(chalk.green('✅ All Azure credentials found'));
    console.log(chalk.gray(`Subscription: ${process.env.AZURE_SUBSCRIPTION_ID}`));
    console.log(chalk.gray(`Resource Group: ${process.env.AZURE_RESOURCE_GROUP}`));
  }

  async runTests(): Promise<void> {
    console.log(chalk.bold.blue('\n🚀 Running REAL Azure Integration Tests\n'));
    console.log(chalk.yellow('⚠️  This will create real Azure resources and incur costs\n'));

    try {
      // Test 1: Container Creation
      await this.testContainerCreation();

      // Test 2: Command Execution
      await this.testCommandExecution();

      // Test 3: Git Operations
      await this.testGitOperations();

      // Test 4: Security Validation
      await this.testSecurityValidation();

      // Test 5: Container Lifecycle
      await this.testContainerLifecycle();

    } finally {
      // Cleanup
      await this.cleanup();
    }

    // Display results
    this.displayResults();
  }

  private async testContainerCreation(): Promise<void> {
    console.log(chalk.yellow('\n📦 Test 1: Container Creation'));
    const startTime = Date.now();

    try {
      // Create credentials
      const credentials = await this.credentialStore.createScopedCredentials({
        userId: this.testPrefix,
        projectId: 'create-test',
        taskId: 'task-1',
        requestedScopes: ['container:create', 'container:read'],
        duration: 30
      });

      const context: SecureOperationContext = {
        userId: credentials.userId,
        projectId: credentials.projectId,
        taskId: credentials.taskId,
        sessionToken: credentials.sessionToken
      };

      // Create container
      console.log('Creating container...');
      const result = await this.api.executeAzureOperation(context, {
        operation: 'createContainer',
        parameters: {
          image: 'mcr.microsoft.com/azure-cli:latest',
          cpu: 0.5,
          memory: 1
        }
      });

      if (result.success) {
        console.log(chalk.green('✅ Container created successfully'));
        console.log(chalk.gray(`Container: ${result.data.containerName}`));
        console.log(chalk.gray(`Status: ${result.data.status}`));
      } else {
        throw new Error(result.error);
      }

      this.results.push({
        name: 'Container Creation',
        success: true,
        duration: Date.now() - startTime
      });

    } catch (error: any) {
      console.log(chalk.red('❌ Container creation failed'));
      console.log(chalk.red(error.message));
      
      this.results.push({
        name: 'Container Creation',
        success: false,
        duration: Date.now() - startTime,
        error: error.message
      });
    }
  }

  private async testCommandExecution(): Promise<void> {
    console.log(chalk.yellow('\n🖥️  Test 2: Command Execution'));
    const startTime = Date.now();

    try {
      // Create credentials
      const credentials = await this.credentialStore.createScopedCredentials({
        userId: this.testPrefix,
        projectId: 'exec-test',
        taskId: 'task-2',
        requestedScopes: ['container:create', 'container:execute'],
        duration: 30
      });

      const context: SecureOperationContext = {
        userId: credentials.userId,
        projectId: credentials.projectId,
        taskId: credentials.taskId,
        sessionToken: credentials.sessionToken
      };

      // Create container
      console.log('Creating Node.js container...');
      await this.api.executeAzureOperation(context, {
        operation: 'createContainer',
        parameters: {
          image: 'node:18-alpine',
          cpu: 0.5,
          memory: 1
        }
      });

      // Wait for container
      console.log('Waiting for container to be ready...');
      await new Promise(resolve => setTimeout(resolve, 30000));

      // Execute command
      console.log('Executing command...');
      const result = await this.api.executeAzureOperation(context, {
        operation: 'executeCommand',
        parameters: {
          command: 'node --version',
          timeout: 10000
        }
      });

      if (result.success) {
        console.log(chalk.green('✅ Command executed successfully'));
        console.log(chalk.gray(`Output: ${result.data.stdout}`));
      } else {
        throw new Error(result.error);
      }

      this.results.push({
        name: 'Command Execution',
        success: true,
        duration: Date.now() - startTime
      });

    } catch (error: any) {
      console.log(chalk.red('❌ Command execution failed'));
      console.log(chalk.red(error.message));
      
      this.results.push({
        name: 'Command Execution',
        success: false,
        duration: Date.now() - startTime,
        error: error.message
      });
    }
  }

  private async testGitOperations(): Promise<void> {
    console.log(chalk.yellow('\n🔀 Test 3: Git Operations'));
    const startTime = Date.now();

    try {
      // Create credentials
      const credentials = await this.credentialStore.createScopedCredentials({
        userId: this.testPrefix,
        projectId: 'git-test',
        taskId: 'task-3',
        requestedScopes: ['container:create', 'container:execute', 'git:read', 'git:write'],
        duration: 30
      });

      const context: SecureOperationContext = {
        userId: credentials.userId,
        projectId: credentials.projectId,
        taskId: credentials.taskId,
        sessionToken: credentials.sessionToken
      };

      // Create container with git
      console.log('Creating Git container...');
      await this.api.executeAzureOperation(context, {
        operation: 'createContainer',
        parameters: {
          image: 'alpine/git:latest',
          cpu: 0.5,
          memory: 1
        }
      });

      await new Promise(resolve => setTimeout(resolve, 30000));

      // Initialize git
      console.log('Initializing git repository...');
      await this.api.executeAzureOperation(context, {
        operation: 'executeCommand',
        parameters: {
          command: `mkdir -p /workspace/${context.projectId} && cd /workspace/${context.projectId} && git init`,
          timeout: 10000
        }
      });

      // Check status
      console.log('Checking git status...');
      const result = await this.api.executeGitOperation(context, {
        operation: 'status'
      });

      if (result.success) {
        console.log(chalk.green('✅ Git operations successful'));
      } else {
        throw new Error(result.error);
      }

      this.results.push({
        name: 'Git Operations',
        success: true,
        duration: Date.now() - startTime
      });

    } catch (error: any) {
      console.log(chalk.red('❌ Git operations failed'));
      console.log(chalk.red(error.message));
      
      this.results.push({
        name: 'Git Operations',
        success: false,
        duration: Date.now() - startTime,
        error: error.message
      });
    }
  }

  private async testSecurityValidation(): Promise<void> {
    console.log(chalk.yellow('\n🔒 Test 4: Security Validation'));
    const startTime = Date.now();

    try {
      // Create credentials
      const credentials = await this.credentialStore.createScopedCredentials({
        userId: this.testPrefix,
        projectId: 'security-test',
        taskId: 'task-4',
        requestedScopes: ['container:create', 'container:execute'],
        duration: 30
      });

      const context: SecureOperationContext = {
        userId: credentials.userId,
        projectId: credentials.projectId,
        taskId: credentials.taskId,
        sessionToken: credentials.sessionToken
      };

      // Test dangerous command blocking
      console.log('Testing dangerous command blocking...');
      const dangerousResult = await this.api.executeAzureOperation(context, {
        operation: 'executeCommand',
        parameters: {
          command: 'rm -rf /',
          timeout: 5000
        }
      });

      if (!dangerousResult.success && dangerousResult.error?.includes('Command not allowed')) {
        console.log(chalk.green('✅ Dangerous command blocked'));
      } else {
        throw new Error('Security check failed - dangerous command was not blocked');
      }

      // Test unauthorized repo blocking
      console.log('Testing unauthorized repository blocking...');
      const repoResult = await this.api.executeGitOperation(context, {
        operation: 'clone',
        parameters: {
          repository: 'https://github.com/evil-org/malicious-repo.git'
        }
      });

      if (!repoResult.success && repoResult.error?.includes('Invalid repository URL')) {
        console.log(chalk.green('✅ Unauthorized repository blocked'));
      } else {
        throw new Error('Security check failed - unauthorized repo was not blocked');
      }

      this.results.push({
        name: 'Security Validation',
        success: true,
        duration: Date.now() - startTime
      });

    } catch (error: any) {
      console.log(chalk.red('❌ Security validation failed'));
      console.log(chalk.red(error.message));
      
      this.results.push({
        name: 'Security Validation',
        success: false,
        duration: Date.now() - startTime,
        error: error.message
      });
    }
  }

  private async testContainerLifecycle(): Promise<void> {
    console.log(chalk.yellow('\n♻️  Test 5: Container Lifecycle'));
    const startTime = Date.now();

    try {
      // Create credentials
      const credentials = await this.credentialStore.createScopedCredentials({
        userId: this.testPrefix,
        projectId: 'lifecycle-test',
        taskId: 'task-5',
        requestedScopes: ['container:create', 'container:execute', 'container:read', 'container:stop'],
        duration: 30
      });

      const context: SecureOperationContext = {
        userId: credentials.userId,
        projectId: credentials.projectId,
        taskId: credentials.taskId,
        sessionToken: credentials.sessionToken
      };

      // Create
      console.log('1. Creating container...');
      await this.api.executeAzureOperation(context, {
        operation: 'createContainer',
        parameters: { image: 'alpine:latest', cpu: 0.5, memory: 1 }
      });

      await new Promise(resolve => setTimeout(resolve, 30000));

      // Execute
      console.log('2. Executing command...');
      await this.api.executeAzureOperation(context, {
        operation: 'executeCommand',
        parameters: { command: 'echo "Hello Azure!"', timeout: 5000 }
      });

      // Status
      console.log('3. Getting status...');
      const statusResult = await this.api.executeAzureOperation(context, {
        operation: 'getStatus'
      });

      console.log(chalk.gray(`Status: ${JSON.stringify(statusResult.data, null, 2)}`));

      // Logs
      console.log('4. Getting logs...');
      const logsResult = await this.api.executeAzureOperation(context, {
        operation: 'getLogs',
        parameters: { tail: 10 }
      });

      console.log(chalk.gray(`Logs: ${logsResult.data.logs}`));

      // Stop
      console.log('5. Stopping container...');
      const stopResult = await this.api.executeAzureOperation(context, {
        operation: 'stopContainer'
      });

      if (stopResult.success) {
        console.log(chalk.green('✅ Container lifecycle completed successfully'));
      }

      this.results.push({
        name: 'Container Lifecycle',
        success: true,
        duration: Date.now() - startTime
      });

    } catch (error: any) {
      console.log(chalk.red('❌ Container lifecycle failed'));
      console.log(chalk.red(error.message));
      
      this.results.push({
        name: 'Container Lifecycle',
        success: false,
        duration: Date.now() - startTime,
        error: error.message
      });
    }
  }

  private async cleanup(): Promise<void> {
    console.log(chalk.yellow('\n🧹 Cleaning up test containers...'));
    
    try {
      await this.api.cleanupTestContainers(this.testPrefix);
      console.log(chalk.green('✅ Cleanup completed'));
    } catch (error: any) {
      console.log(chalk.red('❌ Cleanup failed'));
      console.log(chalk.red(error.message));
    }
  }

  private displayResults(): void {
    console.log(chalk.bold.blue('\n\n📊 Test Results Summary\n'));
    console.log(chalk.gray('─'.repeat(60)));

    const total = this.results.length;
    const passed = this.results.filter(r => r.success).length;
    const failed = total - passed;

    this.results.forEach(result => {
      const status = result.success ? chalk.green('PASS') : chalk.red('FAIL');
      const duration = `${(result.duration / 1000).toFixed(2)}s`;
      
      console.log(`${status} ${result.name.padEnd(25)} ${duration}`);
      if (result.error) {
        console.log(chalk.red(`     └─ ${result.error}`));
      }
    });

    console.log(chalk.gray('─'.repeat(60)));
    console.log(`Total: ${total}  ${chalk.green(`Passed: ${passed}`)}  ${chalk.red(`Failed: ${failed}`)}`);
    
    const totalDuration = this.results.reduce((sum, r) => sum + r.duration, 0);
    console.log(`Total Duration: ${(totalDuration / 1000).toFixed(2)}s`);

    if (failed === 0) {
      console.log(chalk.bold.green('\n✅ All tests passed!'));
    } else {
      console.log(chalk.bold.red('\n❌ Some tests failed!'));
      process.exit(1);
    }
  }
}

// Run tests
if (require.main === module) {
  const runner = new RealAzureTestRunner();
  runner.runTests().catch(error => {
    console.error(chalk.red('Test runner failed:'), error);
    process.exit(1);
  });
}