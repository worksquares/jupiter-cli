/**
 * Interactive Azure Deployment Test - 100% REAL
 * Creates container and waits for user confirmation before deletion
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as readline from 'readline';
import { ContainerInstanceManagementClient, ContainerGroup } from '@azure/arm-containerinstance';
import { DefaultAzureCredential } from '@azure/identity';
import { Logger } from '../../src/utils/logger';

// Load environment
dotenv.config({ path: path.join(__dirname, '../../.env') });

const logger = new Logger('AzureDeploymentTest');

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function askQuestion(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

async function createAzureContainer() {
  console.log('\n🚀 Azure Container Creation Test - Step 1\n');

  // Get credentials
  const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID || '';
  const resourceGroup = process.env.AZURE_RESOURCE_GROUP || '';
  const location = process.env.AZURE_LOCATION || 'eastus';

  if (!subscriptionId || !resourceGroup) {
    console.error('❌ Missing required Azure credentials');
    process.exit(1);
  }

  console.log('✅ Azure credentials loaded');
  console.log(`   Subscription: ${subscriptionId}`);
  console.log(`   Resource Group: ${resourceGroup}`);
  console.log(`   Location: ${location}\n`);

  const credential = new DefaultAzureCredential();
  const containerClient = new ContainerInstanceManagementClient(credential, subscriptionId);
  const testContainerName = `test-interactive-${Date.now()}`;

  try {
    // Create container
    console.log('📦 Creating Azure Container Instance...');
    console.log(`   Name: ${testContainerName}`);
    
    const containerGroup: ContainerGroup = {
      location,
      containers: [{
        name: testContainerName,
        image: 'mcr.microsoft.com/azuredocs/aci-helloworld',
        resources: {
          requests: {
            cpu: 1,
            memoryInGB: 1.5
          }
        },
        ports: [{ port: 80 }],
        environmentVariables: [
          { name: 'NODE_ENV', value: 'test' },
          { name: 'CREATED_AT', value: new Date().toISOString() }
        ]
      }],
      osType: 'Linux',
      restartPolicy: 'OnFailure',
      ipAddress: {
        type: 'Public',
        ports: [{ protocol: 'TCP', port: 80 }],
        dnsNameLabel: testContainerName.toLowerCase()
      },
      tags: {
        'purpose': 'interactive-test',
        'created-by': 'intelligent-agent-system',
        'test-session': new Date().toISOString()
      }
    };

    const createOperation = await containerClient.containerGroups.beginCreateOrUpdate(
      resourceGroup,
      testContainerName,
      containerGroup
    );

    console.log('   ⏳ Deploying container (this may take 30-60 seconds)...');
    const result = await createOperation.pollUntilDone();

    if (result.provisioningState === 'Succeeded') {
      console.log('\n✅ Container created successfully!\n');
      console.log('📊 Container Details:');
      console.log('━'.repeat(50));
      console.log(`   Name: ${testContainerName}`);
      console.log(`   Status: ${result.provisioningState}`);
      console.log(`   IP Address: ${result.ipAddress?.ip}`);
      console.log(`   FQDN: ${result.ipAddress?.fqdn}`);
      console.log(`   URL: http://${result.ipAddress?.ip || result.ipAddress?.fqdn}`);
      console.log(`   State: ${result.instanceView?.state || 'Running'}`);
      console.log('━'.repeat(50));

      // Wait for container to be fully ready
      console.log('\n⏳ Waiting for container to be fully ready...');
      await new Promise(resolve => setTimeout(resolve, 20000));

      // Get logs
      try {
        const logs = await containerClient.containers.listLogs(
          resourceGroup,
          testContainerName,
          testContainerName,
          { tail: 20 }
        );
        console.log('\n📄 Container Logs:');
        console.log('━'.repeat(50));
        console.log(logs.content || 'No logs available yet');
        console.log('━'.repeat(50));
      } catch (error) {
        console.log('⚠️  Logs not available yet');
      }

      // Get detailed status
      const status = await containerClient.containerGroups.get(resourceGroup, testContainerName);
      console.log('\n📊 Container Instance View:');
      console.log(`   Current State: ${status.instanceView?.state}`);
      console.log(`   Events: ${status.instanceView?.events?.length || 0} events recorded`);
      
      if (status.instanceView?.events && status.instanceView.events.length > 0) {
        console.log('\n📅 Recent Events:');
        status.instanceView.events.slice(-3).forEach(event => {
          console.log(`   - ${event.name}: ${event.message} (${event.firstTimestamp})`);
        });
      }

      return { containerClient, testContainerName, resourceGroup };
    } else {
      console.log(`❌ Container creation failed: ${result.provisioningState}`);
      return null;
    }

  } catch (error: any) {
    console.error('❌ Failed to create container:', error.message);
    return null;
  }
}

async function deleteAzureContainer(
  containerClient: ContainerInstanceManagementClient,
  containerName: string,
  resourceGroup: string
) {
  console.log('\n🗑️  Step 2: Container Deletion\n');

  try {
    // First stop the container
    console.log('🛑 Stopping container...');
    await containerClient.containerGroups.stop(resourceGroup, containerName);
    console.log('   ✅ Container stopped');

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Delete the container
    console.log('\n🗑️  Deleting container...');
    const deleteOperation = await containerClient.containerGroups.beginDelete(
      resourceGroup,
      containerName
    );
    await deleteOperation.pollUntilDone();
    console.log('   ✅ Container deleted successfully');

    // Verify deletion
    try {
      await containerClient.containerGroups.get(resourceGroup, containerName);
      console.log('   ⚠️  Container still exists');
    } catch (error) {
      console.log('   ✅ Deletion verified - container no longer exists');
    }

  } catch (error: any) {
    console.error('❌ Failed to delete container:', error.message);
  }
}

async function runInteractiveTest() {
  console.log('═'.repeat(60));
  console.log('   Azure Container Interactive Test');
  console.log('   This test will create a real container and wait for');
  console.log('   your confirmation before deleting it.');
  console.log('═'.repeat(60));

  // Step 1: Create container
  const containerInfo = await createAzureContainer();

  if (!containerInfo) {
    console.log('\n❌ Container creation failed. Exiting.');
    rl.close();
    process.exit(1);
  }

  // Wait for user confirmation
  console.log('\n' + '━'.repeat(60));
  console.log('🎯 CONTAINER IS NOW RUNNING!');
  console.log('━'.repeat(60));
  console.log('\nYou can now:');
  console.log('1. Check the container in Azure Portal');
  console.log('2. Visit the container URL in your browser');
  console.log('3. Run Azure CLI commands to inspect it');
  console.log(`\nExample commands:`);
  console.log(`   az container show -g ${containerInfo.resourceGroup} -n ${containerInfo.testContainerName}`);
  console.log(`   az container logs -g ${containerInfo.resourceGroup} -n ${containerInfo.testContainerName}`);
  console.log(`   az container exec -g ${containerInfo.resourceGroup} -n ${containerInfo.testContainerName} --exec-command "/bin/sh"`);
  
  console.log('\n' + '━'.repeat(60));
  const answer = await askQuestion('\n⚠️  Press ENTER when ready to delete the container...');

  // Step 2: Delete container
  await deleteAzureContainer(
    containerInfo.containerClient,
    containerInfo.testContainerName,
    containerInfo.resourceGroup
  );

  console.log('\n✅ Interactive test completed!\n');
  rl.close();
}

// Run if executed directly
if (require.main === module) {
  runInteractiveTest().catch(error => {
    console.error('Fatal error:', error);
    rl.close();
    process.exit(1);
  });
}

export { runInteractiveTest };