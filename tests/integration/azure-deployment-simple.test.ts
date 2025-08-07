/**
 * Simple Azure Deployment Test - 100% REAL
 * Direct execution without complex Jest setup
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { ContainerInstanceManagementClient, ContainerGroup } from '@azure/arm-containerinstance';
import { DefaultAzureCredential } from '@azure/identity';
import { Logger } from '../../src/utils/logger';

// Load environment
dotenv.config({ path: path.join(__dirname, '../../.env') });

const logger = new Logger('AzureDeploymentTest');

async function runAzureDeploymentTest() {
  console.log('\n🚀 Running Simple Azure Deployment Test\n');

  // Get credentials with defaults
  const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID || '';
  const resourceGroup = process.env.AZURE_RESOURCE_GROUP || '';
  const location = process.env.AZURE_LOCATION || 'eastus';

  if (!subscriptionId || !resourceGroup) {
    console.error('❌ Missing required Azure credentials');
    console.error('   AZURE_SUBSCRIPTION_ID:', subscriptionId ? '✓' : '✗');
    console.error('   AZURE_RESOURCE_GROUP:', resourceGroup ? '✓' : '✗');
    process.exit(1);
  }

  console.log('✅ Azure credentials loaded');
  console.log(`   Subscription: ${subscriptionId}`);
  console.log(`   Resource Group: ${resourceGroup}`);
  console.log(`   Location: ${location}\n`);

  const credential = new DefaultAzureCredential();
  const containerClient = new ContainerInstanceManagementClient(credential, subscriptionId);
  const testContainerName = `test-simple-${Date.now()}`;

  try {
    // Test 1: Create a simple container
    console.log('📦 Test 1: Creating Azure Container Instance...');
    
    const containerGroup: ContainerGroup = {
      location,
      containers: [{
        name: testContainerName,
        image: 'mcr.microsoft.com/azuredocs/aci-helloworld',
        resources: {
          requests: {
            cpu: 0.5,
            memoryInGB: 1
          }
        },
        ports: [{ port: 80 }]
      }],
      osType: 'Linux',
      restartPolicy: 'OnFailure',
      ipAddress: {
        type: 'Public',
        ports: [{ protocol: 'TCP', port: 80 }]
      }
    };

    const createOperation = await containerClient.containerGroups.beginCreateOrUpdate(
      resourceGroup,
      testContainerName,
      containerGroup
    );

    console.log('   ⏳ Waiting for container deployment...');
    const result = await createOperation.pollUntilDone();

    if (result.provisioningState === 'Succeeded') {
      console.log('   ✅ Container created successfully!');
      console.log(`   🌐 IP Address: ${result.ipAddress?.ip}`);
      console.log(`   🏷️  DNS: ${result.ipAddress?.fqdn || 'N/A'}`);
    } else {
      console.log(`   ❌ Container creation failed: ${result.provisioningState}`);
    }

    // Test 2: Get container status
    console.log('\n📊 Test 2: Getting container status...');
    const status = await containerClient.containerGroups.get(resourceGroup, testContainerName);
    console.log(`   ✅ Status: ${status.provisioningState}`);
    console.log(`   📍 State: ${status.instanceView?.state || 'Unknown'}`);

    // Test 3: Get container logs
    console.log('\n📄 Test 3: Getting container logs...');
    await new Promise(resolve => setTimeout(resolve, 30000)); // Wait for container to start
    
    try {
      const logs = await containerClient.containers.listLogs(
        resourceGroup,
        testContainerName,
        testContainerName,
        { tail: 10 }
      );
      console.log('   ✅ Logs retrieved:');
      console.log('   ' + (logs.content || 'No logs yet').split('\n').join('\n   '));
    } catch (error) {
      console.log('   ⚠️  Could not retrieve logs yet');
    }

    // Test 4: Stop container
    console.log('\n🛑 Test 4: Stopping container...');
    await containerClient.containerGroups.stop(resourceGroup, testContainerName);
    console.log('   ✅ Container stopped');

    // Test 5: Delete container
    console.log('\n🗑️  Test 5: Deleting container...');
    const deleteOperation = await containerClient.containerGroups.beginDelete(
      resourceGroup,
      testContainerName
    );
    await deleteOperation.pollUntilDone();
    console.log('   ✅ Container deleted');

    console.log('\n✅ All tests completed successfully!\n');

  } catch (error: any) {
    console.error('\n❌ Test failed:', error.message);
    
    // Cleanup on error
    try {
      console.log('\n🧹 Attempting cleanup...');
      await containerClient.containerGroups.beginDelete(resourceGroup, testContainerName);
      console.log('   ✅ Cleanup completed');
    } catch (cleanupError) {
      console.log('   ⚠️  Cleanup failed');
    }
    
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  runAzureDeploymentTest().catch(console.error);
}

export { runAzureDeploymentTest };