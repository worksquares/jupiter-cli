#!/usr/bin/env ts-node
/**
 * Verify Test Resource Group Setup
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { ContainerInstanceManagementClient, ContainerGroup } from '@azure/arm-containerinstance';
import { DefaultAzureCredential } from '@azure/identity';

// Load TEST environment
dotenv.config({ path: path.join(__dirname, '../.env.test') });

async function verifyTestResourceGroup() {
  console.log('\n🧪 Verifying Test Resource Group Setup\n');

  const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID || '';
  const resourceGroup = process.env.AZURE_RESOURCE_GROUP || '';
  const location = process.env.AZURE_LOCATION || 'eastus';

  console.log('📋 Test Environment Configuration:');
  console.log(`   Resource Group: ${resourceGroup}`);
  console.log(`   Expected: resource-test-agents`);
  console.log(`   Match: ${resourceGroup === 'resource-test-agents' ? '✅' : '❌'}`);
  console.log(`   Subscription: ${subscriptionId}`);
  console.log(`   Location: ${location}\n`);

  if (resourceGroup !== 'resource-test-agents') {
    console.error('❌ Test environment not properly configured!');
    console.error('   Make sure to use .env.test file');
    process.exit(1);
  }

  const credential = new DefaultAzureCredential();
  const containerClient = new ContainerInstanceManagementClient(credential, subscriptionId);

  try {
    // Create a small test container
    console.log('🚀 Creating test container in test resource group...');
    const testContainerName = `verify-test-${Date.now()}`;

    const containerGroup: ContainerGroup = {
      location,
      containers: [{
        name: testContainerName,
        image: 'mcr.microsoft.com/hello-world:latest',
        resources: {
          requests: {
            cpu: 0.25,
            memoryInGB: 0.5
          }
        }
      }],
      osType: 'Linux',
      restartPolicy: 'Never',
      tags: {
        'test': 'verification',
        'auto-delete': 'true'
      }
    };

    const createOperation = await containerClient.containerGroups.beginCreateOrUpdate(
      resourceGroup,
      testContainerName,
      containerGroup
    );

    console.log('   ⏳ Waiting for deployment...');
    const result = await createOperation.pollUntilDone();

    if (result.provisioningState === 'Succeeded') {
      console.log('   ✅ Test container created successfully!');
      console.log(`   ✅ Container: ${testContainerName}`);
      console.log(`   ✅ Resource Group: ${resourceGroup}`);

      // Wait for completion
      await new Promise(resolve => setTimeout(resolve, 20000));

      // Get logs to verify it ran
      try {
        const logs = await containerClient.containers.listLogs(
          resourceGroup,
          testContainerName,
          testContainerName
        );
        console.log('\n📄 Container Output:');
        console.log(logs.content || 'No output');
      } catch (error) {
        console.log('   ⚠️  Could not retrieve logs');
      }

      // Clean up
      console.log('\n🧹 Cleaning up test container...');
      await containerClient.containerGroups.beginDelete(resourceGroup, testContainerName);
      console.log('   ✅ Test container deleted');

      console.log('\n✅ Test Resource Group Verification Complete!');
      console.log('   The test environment is properly configured and working.');

    } else {
      console.error('   ❌ Container creation failed:', result.provisioningState);
    }

  } catch (error: any) {
    console.error('\n❌ Verification failed:', error.message);
    process.exit(1);
  }
}

// Run verification
if (require.main === module) {
  verifyTestResourceGroup().catch(console.error);
}

export { verifyTestResourceGroup };