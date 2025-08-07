#!/usr/bin/env ts-node

/**
 * Test Runner for REAL Git Operations in Azure Container Instances
 * Uses digisquarescontainers registry
 * NO MOCKS - Real Azure services, real git operations
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
  details?: string;
}

class RealGitACITestRunner {
  private results: TestResult[] = [];
  private api: RealSecureOperationsAPI;
  private credentialStore: SecureCredentialStore;
  private testPrefix = `git-aci-${Date.now()}`;
  
  constructor() {
    this.verifyCredentials();
    
    this.credentialStore = new SecureCredentialStore();
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
      'AZURE_TENANT_ID',
      'AZURE_CONTAINER_REGISTRY'
    ];

    const missing = required.filter(key => !process.env[key]);
    if (missing.length > 0) {
      console.error(chalk.red('Missing required credentials:'), missing);
      process.exit(1);
    }

    // Verify using digisquarescontainers
    if (process.env.AZURE_CONTAINER_REGISTRY !== 'digisquarescontainers') {
      console.error(chalk.red('Error: Must use digisquarescontainers registry'));
      process.exit(1);
    }

    console.log(chalk.green('✅ All credentials verified'));
    console.log(chalk.gray(`Registry: ${process.env.AZURE_CONTAINER_REGISTRY}.azurecr.io`));
  }

  async runTests(): Promise<void> {
    console.log(chalk.bold.blue('\n🚀 Running REAL Git Operations in ACI Tests\n'));
    console.log(chalk.yellow('⚠️  This will create real Azure resources\n'));

    try {
      // Test 1: Basic Git Repository Creation
      await this.testGitRepoCreation();

      // Test 2: Git Clone Operations
      await this.testGitClone();

      // Test 3: Complex Bash Operations
      await this.testComplexBashOperations();

      // Test 4: Full Development Workflow
      await this.testFullDevWorkflow();

    } finally {
      await this.cleanup();
    }

    this.displayResults();
  }

  private async testGitRepoCreation(): Promise<void> {
    console.log(chalk.yellow('\n📦 Test 1: Git Repository Creation in ACI'));
    const startTime = Date.now();

    try {
      // Create credentials
      const credentials = await this.credentialStore.createScopedCredentials({
        userId: this.testPrefix,
        projectId: 'git-create',
        taskId: 'task-1',
        requestedScopes: ['container:create', 'container:execute', 'git:write'],
        duration: 30
      });

      const context: SecureOperationContext = {
        userId: credentials.userId,
        projectId: credentials.projectId,
        taskId: credentials.taskId,
        sessionToken: credentials.sessionToken
      };

      // Create container
      console.log('Creating container with git...');
      const createResult = await this.api.executeAzureOperation(context, {
        operation: 'createContainer',
        parameters: {
          image: 'alpine/git:latest',
          cpu: 0.5,
          memory: 1
        }
      });

      if (!createResult.success) throw new Error(createResult.error);
      console.log(chalk.green('✅ Container created'));

      // Wait for container
      await new Promise(resolve => setTimeout(resolve, 30000));

      // Initialize git repo
      console.log('Initializing git repository...');
      const commands = [
        'mkdir -p /workspace/test-repo && cd /workspace/test-repo',
        'git init',
        'git config user.email "test@digisquares.com"',
        'git config user.name "Test User"',
        'echo "# Test Repository" > README.md',
        'git add README.md',
        'git commit -m "Initial commit"'
      ];

      for (const cmd of commands) {
        const result = await this.api.executeAzureOperation(context, {
          operation: 'executeCommand',
          parameters: { command: cmd, timeout: 10000 }
        });
        
        if (!result.success) {
          throw new Error(`Command failed: ${cmd} - ${result.error}`);
        }
      }

      // Verify repository
      const verifyResult = await this.api.executeAzureOperation(context, {
        operation: 'executeCommand',
        parameters: { 
          command: 'cd /workspace/test-repo && git log --oneline',
          timeout: 10000
        }
      });

      if (verifyResult.success && verifyResult.data.stdout.includes('Initial commit')) {
        console.log(chalk.green('✅ Git repository created successfully'));
        this.results.push({
          name: 'Git Repository Creation',
          success: true,
          duration: Date.now() - startTime,
          details: 'Repository initialized with initial commit'
        });
      } else {
        throw new Error('Repository verification failed');
      }

    } catch (error: any) {
      console.log(chalk.red('❌ Git repository creation failed'));
      console.log(chalk.red(error.message));
      
      this.results.push({
        name: 'Git Repository Creation',
        success: false,
        duration: Date.now() - startTime,
        error: error.message
      });
    }
  }

  private async testGitClone(): Promise<void> {
    console.log(chalk.yellow('\n🔀 Test 2: Git Clone Operations'));
    const startTime = Date.now();

    try {
      // Create credentials
      const credentials = await this.credentialStore.createScopedCredentials({
        userId: this.testPrefix,
        projectId: 'git-clone',
        taskId: 'task-2',
        requestedScopes: ['container:create', 'container:execute', 'git:read'],
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
      await this.api.executeAzureOperation(context, {
        operation: 'createContainer',
        parameters: {
          image: 'alpine/git:latest',
          cpu: 0.5,
          memory: 1
        }
      });

      await new Promise(resolve => setTimeout(resolve, 30000));

      // Clone repository
      console.log('Cloning public repository...');
      const cloneResult = await this.api.executeAzureOperation(context, {
        operation: 'executeCommand',
        parameters: {
          command: 'cd /workspace && git clone https://github.com/octocat/Hello-World.git',
          timeout: 60000
        }
      });

      if (!cloneResult.success) throw new Error(cloneResult.error);

      // Verify clone
      const verifyResult = await this.api.executeAzureOperation(context, {
        operation: 'executeCommand',
        parameters: {
          command: 'ls -la /workspace/Hello-World/ | head -10',
          timeout: 10000
        }
      });

      if (verifyResult.success && verifyResult.data.stdout.includes('.git')) {
        console.log(chalk.green('✅ Repository cloned successfully'));
        this.results.push({
          name: 'Git Clone Operations',
          success: true,
          duration: Date.now() - startTime,
          details: 'Successfully cloned Hello-World repository'
        });
      } else {
        throw new Error('Clone verification failed');
      }

    } catch (error: any) {
      console.log(chalk.red('❌ Git clone failed'));
      console.log(chalk.red(error.message));
      
      this.results.push({
        name: 'Git Clone Operations',
        success: false,
        duration: Date.now() - startTime,
        error: error.message
      });
    }
  }

  private async testComplexBashOperations(): Promise<void> {
    console.log(chalk.yellow('\n🔧 Test 3: Complex Bash Operations on Git Repo'));
    const startTime = Date.now();

    try {
      // Create credentials
      const credentials = await this.credentialStore.createScopedCredentials({
        userId: this.testPrefix,
        projectId: 'bash-ops',
        taskId: 'task-3',
        requestedScopes: ['container:create', 'container:execute', 'build:execute'],
        duration: 30
      });

      const context: SecureOperationContext = {
        userId: credentials.userId,
        projectId: credentials.projectId,
        taskId: credentials.taskId,
        sessionToken: credentials.sessionToken
      };

      // Create container with more tools
      console.log('Creating container with development tools...');
      await this.api.executeAzureOperation(context, {
        operation: 'createContainer',
        parameters: {
          image: 'node:18-alpine',
          cpu: 1,
          memory: 1
        }
      });

      await new Promise(resolve => setTimeout(resolve, 30000));

      // Install tools
      console.log('Installing additional tools...');
      const installResult = await this.api.executeAzureOperation(context, {
        operation: 'executeCommand',
        parameters: {
          command: 'apk add --no-cache git bash',
          timeout: 30000
        }
      });

      if (!installResult.success) throw new Error('Failed to install tools');

      // Run complex bash script
      console.log('Running complex bash operations...');
      const bashScript = `
#!/bin/bash
cd /workspace
mkdir test-analysis && cd test-analysis
git init

# Create multiple files
for i in {1..5}; do
  echo "File $i content" > file$i.txt
done

# Create subdirectories
mkdir -p src/{components,utils,tests}

# Add and commit
git add .
git config user.email "bash@test.com"
git config user.name "Bash Test"
git commit -m "Add test files"

# Count files
echo "Total files: $(find . -type f -not -path './.git/*' | wc -l)"

# Show structure
echo "Directory structure:"
find . -type d -not -path './.git/*' | sort
`;

      const scriptResult = await this.api.executeAzureOperation(context, {
        operation: 'executeCommand',
        parameters: {
          command: bashScript,
          timeout: 30000
        }
      });

      if (scriptResult.success && scriptResult.data.stdout.includes('Total files: 5')) {
        console.log(chalk.green('✅ Complex bash operations completed'));
        this.results.push({
          name: 'Complex Bash Operations',
          success: true,
          duration: Date.now() - startTime,
          details: 'Successfully executed complex bash script'
        });
      } else {
        throw new Error('Bash operations verification failed');
      }

    } catch (error: any) {
      console.log(chalk.red('❌ Complex bash operations failed'));
      console.log(chalk.red(error.message));
      
      this.results.push({
        name: 'Complex Bash Operations',
        success: false,
        duration: Date.now() - startTime,
        error: error.message
      });
    }
  }

  private async testFullDevWorkflow(): Promise<void> {
    console.log(chalk.yellow('\n🚀 Test 4: Full Development Workflow'));
    const startTime = Date.now();

    try {
      // Create credentials
      const credentials = await this.credentialStore.createScopedCredentials({
        userId: this.testPrefix,
        projectId: 'full-workflow',
        taskId: 'task-4',
        requestedScopes: [
          'container:create', 
          'container:execute', 
          'git:read', 
          'git:write',
          'build:execute'
        ],
        duration: 30
      });

      const context: SecureOperationContext = {
        userId: credentials.userId,
        projectId: credentials.projectId,
        taskId: credentials.taskId,
        sessionToken: credentials.sessionToken
      };

      // Create container
      console.log('Creating Node.js development container...');
      await this.api.executeAzureOperation(context, {
        operation: 'createContainer',
        parameters: {
          image: 'node:18-alpine',
          cpu: 1,
          memory: 2
        }
      });

      await new Promise(resolve => setTimeout(resolve, 40000));

      // Install git
      await this.api.executeAzureOperation(context, {
        operation: 'executeCommand',
        parameters: {
          command: 'apk add --no-cache git',
          timeout: 30000
        }
      });

      // Create and run a complete Node.js project
      console.log('Creating Node.js project...');
      const projectCommands = [
        'cd /workspace && mkdir node-app && cd node-app',
        'git init',
        'git config user.email "dev@digisquares.com"',
        'git config user.name "Dev User"',
        `cat > package.json << 'EOF'
{
  "name": "aci-node-app",
  "version": "1.0.0",
  "main": "index.js",
  "scripts": {
    "start": "node index.js"
  }
}
EOF`,
        `cat > index.js << 'EOF'
console.log('Hello from ACI Node.js app!');
console.log('Environment:', process.env.NODE_ENV || 'development');
console.log('Time:', new Date().toISOString());
EOF`,
        'git add .',
        'git commit -m "Initial Node.js project"',
        'npm start'
      ];

      let lastOutput = '';
      for (const cmd of projectCommands) {
        const result = await this.api.executeAzureOperation(context, {
          operation: 'executeCommand',
          parameters: { command: cmd, timeout: 20000 }
        });
        
        if (!result.success) {
          throw new Error(`Command failed: ${cmd}`);
        }
        
        if (cmd.includes('npm start')) {
          lastOutput = result.data.stdout;
        }
      }

      if (lastOutput.includes('Hello from ACI Node.js app!')) {
        console.log(chalk.green('✅ Full development workflow completed'));
        this.results.push({
          name: 'Full Development Workflow',
          success: true,
          duration: Date.now() - startTime,
          details: 'Created and ran Node.js project with git'
        });
      } else {
        throw new Error('Project execution verification failed');
      }

    } catch (error: any) {
      console.log(chalk.red('❌ Full development workflow failed'));
      console.log(chalk.red(error.message));
      
      this.results.push({
        name: 'Full Development Workflow',
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
    console.log(chalk.bold.blue('\n\n📊 Git ACI Test Results Summary\n'));
    console.log(chalk.gray('─'.repeat(60)));

    const total = this.results.length;
    const passed = this.results.filter(r => r.success).length;
    const failed = total - passed;

    this.results.forEach(result => {
      const status = result.success ? chalk.green('PASS') : chalk.red('FAIL');
      const duration = `${(result.duration / 1000).toFixed(2)}s`;
      
      console.log(`${status} ${result.name.padEnd(30)} ${duration}`);
      if (result.details) {
        console.log(chalk.gray(`     └─ ${result.details}`));
      }
      if (result.error) {
        console.log(chalk.red(`     └─ ${result.error}`));
      }
    });

    console.log(chalk.gray('─'.repeat(60)));
    console.log(`Total: ${total}  ${chalk.green(`Passed: ${passed}`)}  ${chalk.red(`Failed: ${failed}`)}`);
    
    const totalDuration = this.results.reduce((sum, r) => sum + r.duration, 0);
    console.log(`Total Duration: ${(totalDuration / 1000).toFixed(2)}s`);

    if (failed === 0) {
      console.log(chalk.bold.green('\n✅ All Git ACI tests passed!'));
    } else {
      console.log(chalk.bold.red('\n❌ Some tests failed!'));
      process.exit(1);
    }
  }
}

// Run tests
if (require.main === module) {
  const runner = new RealGitACITestRunner();
  runner.runTests().catch(error => {
    console.error(chalk.red('Test runner failed:'), error);
    process.exit(1);
  });
}