#!/usr/bin/env ts-node

/**
 * Simple test to create a container
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { RealSecureOperationsAPI } from '../src/security/secure-operations-api-real';
import { SecureCredentialStore } from '../src/security/secure-credential-store';

// Load real credentials
dotenv.config({ path: path.join(__dirname, '../.env') });

async function test() {
  console.log('=== Simple Container Test ===\n');
  
  // Create instances
  const credentialStore = new SecureCredentialStore();
  const api = new RealSecureOperationsAPI(
    process.env.AZURE_SUBSCRIPTION_ID!,
    process.env.AZURE_RESOURCE_GROUP!,
    credentialStore
  );
  
  // Create credentials
  console.log('Creating credentials...');
  const credentials = await credentialStore.createScopedCredentials({
    userId: 'simple-test',
    projectId: 'test-project',
    taskId: 'test-1',
    requestedScopes: ['container:create', 'container:execute', 'container:stop'],
    duration: 10
  });
  
  const context = {
    userId: credentials.userId,
    projectId: credentials.projectId,
    taskId: credentials.taskId,
    sessionToken: credentials.sessionToken
  };
  
  try {
    console.log('\nCreating container...');
    const createResult = await api.executeAzureOperation(context, {
      operation: 'createContainer',
      parameters: {
        image: 'mcr.microsoft.com/azuredocs/aci-helloworld:latest',
        cpu: 0.5,
        memory: 0.5
      }
    });
    
    console.log('Create result:', JSON.stringify(createResult, null, 2));
    
    if (createResult.success) {
      // Wait a bit
      console.log('\nWaiting 10 seconds...');
      await new Promise(resolve => setTimeout(resolve, 10000));
      
      // Try to execute a command
      console.log('\nExecuting command...');
      const execResult = await api.executeAzureOperation(context, {
        operation: 'executeCommand',
        parameters: {
          command: 'echo "Hello from Azure!"',
          timeout: 5000
        }
      });
      
      console.log('Execute result:', JSON.stringify(execResult, null, 2));
      
      // Stop container
      console.log('\nStopping container...');
      const stopResult = await api.executeAzureOperation(context, {
        operation: 'stopContainer'
      });
      
      console.log('Stop result:', JSON.stringify(stopResult, null, 2));
    }
    
  } catch (error: any) {
    console.error('Error:', error);
  } finally {
    // Cleanup
    console.log('\nCleaning up...');
    await api.cleanupTestContainers('simple-test');
  }
}

test().catch(console.error);