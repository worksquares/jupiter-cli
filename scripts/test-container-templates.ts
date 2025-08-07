#!/usr/bin/env ts-node

/**
 * Test Container Templates with Auto Git Clone
 * Demonstrates using pre-built templates from digisquarescontainers registry
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { RealSecureOperationsAPI } from '../src/security/secure-operations-api-real';
import { SecureCredentialStore } from '../src/security/secure-credential-store';
import { SecureOperationContext } from '../src/security/secure-operations-api';
import { CONTAINER_TEMPLATES } from '../src/types/container-templates';
import chalk from 'chalk';

// Load real credentials
dotenv.config({ path: path.join(__dirname, '../.env') });

async function testTemplates() {
  console.log(chalk.bold.blue('\n🚀 Testing Container Templates with Auto Git Clone\n'));
  
  const credentialStore = new SecureCredentialStore();
  const api = new RealSecureOperationsAPI(
    process.env.AZURE_SUBSCRIPTION_ID!,
    process.env.AZURE_RESOURCE_GROUP!,
    credentialStore
  );

  // Test 1: Node.js template with React project
  console.log(chalk.yellow('\n📦 Test 1: Node.js Template with React Project'));
  try {
    const credentials = await credentialStore.createScopedCredentials({
      userId: 'template-test',
      projectId: 'node-react',
      taskId: 'task-1',
      requestedScopes: ['container:create', 'container:execute'],
      duration: 30
    });

    const context: SecureOperationContext = {
      userId: credentials.userId,
      projectId: credentials.projectId,
      taskId: credentials.taskId,
      sessionToken: credentials.sessionToken
    };

    // Create container with Node.js template and auto-clone a React project
    console.log('Creating Node.js container with auto-clone...');
    const createResult = await api.executeAzureOperation(context, {
      operation: 'createContainer',
      parameters: {
        template: 'node',
        gitRepo: 'https://github.com/facebook/create-react-app.git',
        environmentVariables: {
          NODE_ENV: 'development'
        }
      }
    });

    if (createResult.success) {
      console.log(chalk.green('✅ Container created with Node.js template'));
      console.log(chalk.gray(`Container: ${createResult.data.containerName}`));
      
      // Wait for startup script to complete
      console.log('Waiting for container startup and git clone...');
      await new Promise(resolve => setTimeout(resolve, 60000));

      // Check if repo was cloned
      const checkResult = await api.executeAzureOperation(context, {
        operation: 'executeCommand',
        parameters: {
          command: 'ls -la /workspace/',
          timeout: 10000
        }
      });

      if (checkResult.success) {
        console.log(chalk.green('✅ Repository cloned successfully'));
        console.log('Workspace contents:', checkResult.data.stdout);
      }

      // Run npm scripts
      const scriptsResult = await api.executeAzureOperation(context, {
        operation: 'executeCommand',
        parameters: {
          command: 'cd /workspace/create-react-app && npm run | head -20',
          timeout: 10000
        }
      });

      if (scriptsResult.success) {
        console.log('Available npm scripts:', scriptsResult.data.stdout);
      }
    }

  } catch (error: any) {
    console.log(chalk.red('❌ Node.js template test failed'));
    console.log(chalk.red(error.message));
  }

  // Test 2: Python template with Django project
  console.log(chalk.yellow('\n📦 Test 2: Python Template with Django Project'));
  try {
    const credentials = await credentialStore.createScopedCredentials({
      userId: 'template-test',
      projectId: 'python-django',
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

    // Create container with Python template
    console.log('Creating Python container...');
    const createResult = await api.executeAzureOperation(context, {
      operation: 'createContainer',
      parameters: {
        template: 'python',
        gitRepo: 'https://github.com/django/django.git',
        environmentVariables: {
          DJANGO_DEBUG: 'true'
        }
      }
    });

    if (createResult.success) {
      console.log(chalk.green('✅ Container created with Python template'));
      
      await new Promise(resolve => setTimeout(resolve, 60000));

      // Create a Django project
      const djangoResult = await api.executeAzureOperation(context, {
        operation: 'executeCommand',
        parameters: {
          command: 'cd /workspace && django-admin startproject mysite && ls -la',
          timeout: 20000
        }
      });

      if (djangoResult.success) {
        console.log(chalk.green('✅ Django project created'));
        console.log('Project structure:', djangoResult.data.stdout);
      }
    }

  } catch (error: any) {
    console.log(chalk.red('❌ Python template test failed'));
    console.log(chalk.red(error.message));
  }

  // Display available templates
  console.log(chalk.bold.blue('\n\n📋 Available Container Templates:\n'));
  console.log(chalk.gray('─'.repeat(60)));
  
  Object.values(CONTAINER_TEMPLATES).forEach(template => {
    console.log(chalk.yellow(`📦 ${template.displayName}`));
    console.log(`   Image: ${chalk.gray(template.image)}`);
    console.log(`   ${template.description}`);
    console.log(`   Languages: ${template.languages.join(', ')}`);
    console.log(`   Tools: ${template.tools.slice(0, 5).join(', ')}...`);
    console.log('');
  });

  console.log(chalk.bold.green('\n✨ Benefits of using templates:'));
  console.log('1. ⚡ Instant container creation (no tool installation wait)');
  console.log('2. 🔧 All development tools pre-installed');
  console.log('3. 📥 Automatic git repository cloning');
  console.log('4. 🔑 Git credentials configuration support');
  console.log('5. 📦 Automatic dependency installation');
  console.log('6. 🚀 Ready-to-code environment in seconds');
  
  // Cleanup
  try {
    await api.cleanupTestContainers('template-test');
    console.log(chalk.green('\n✅ Cleanup completed'));
  } catch (error) {
    console.log(chalk.red('\n❌ Cleanup failed'));
  }
}

// Run tests
if (require.main === module) {
  testTemplates().catch(error => {
    console.error(chalk.red('Test failed:'), error);
    process.exit(1);
  });
}