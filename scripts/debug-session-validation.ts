#!/usr/bin/env ts-node

/**
 * Debug session validation issue
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { RealSecureOperationsAPI } from '../src/security/secure-operations-api-real';
import { SecureCredentialStore } from '../src/security/secure-credential-store';

// Load real credentials
dotenv.config({ path: path.join(__dirname, '../.env') });

async function debug() {
  console.log('=== Debug Session Validation ===\n');
  
  // Create instances
  const credentialStore = new SecureCredentialStore();
  const api = new RealSecureOperationsAPI(
    process.env.AZURE_SUBSCRIPTION_ID!,
    process.env.AZURE_RESOURCE_GROUP!,
    credentialStore
  );
  
  // Create credentials
  console.log('1. Creating credentials...');
  const credentials = await credentialStore.createScopedCredentials({
    userId: 'debug-user',
    projectId: 'debug-project',
    taskId: 'debug-task',
    requestedScopes: ['container:create'],
    duration: 30
  });
  
  console.log('Credentials created:', {
    userId: credentials.userId,
    projectId: credentials.projectId,
    taskId: credentials.taskId,
    sessionToken: credentials.sessionToken.substring(0, 8) + '...',
    containerName: credentials.containerName
  });
  
  // Test validation directly
  console.log('\n2. Testing credential store validation directly...');
  const isValid = await credentialStore.validateCredentials(
    credentials.userId,
    credentials.projectId,
    credentials.taskId,
    credentials.sessionToken
  );
  console.log('Direct validation result:', isValid);
  
  // Test through API
  console.log('\n3. Testing through API...');
  const context = {
    userId: credentials.userId,
    projectId: credentials.projectId,
    taskId: credentials.taskId,
    sessionToken: credentials.sessionToken
  };
  
  try {
    const result = await api.executeAzureOperation(context, {
      operation: 'getStatus'
    });
    console.log('API call result:', result);
  } catch (error: any) {
    console.log('API call error:', error.message);
  }
  
  // Check what's in the credential store
  console.log('\n4. Checking credential store state...');
  const key = `${credentials.userId}-${credentials.projectId}-${credentials.taskId}`;
  console.log('Looking for key:', key);
  
  // Test with wrong token
  console.log('\n5. Testing with wrong token...');
  const wrongContext = {
    ...context,
    sessionToken: 'wrong-token-12345678901234567890123456789012'
  };
  
  try {
    const result = await api.executeAzureOperation(wrongContext, {
      operation: 'getStatus'
    });
    console.log('Wrong token result:', result);
  } catch (error: any) {
    console.log('Wrong token error (expected):', error.message);
  }
}

debug().catch(console.error);