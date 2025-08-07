/**
 * Azure Container Cleanup Script - Remove All Test Containers
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { ContainerInstanceManagementClient } from '@azure/arm-containerinstance';
import { DefaultAzureCredential } from '@azure/identity';

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function cleanupAllContainers() {
  const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID || '';
  const resourceGroup = process.env.AZURE_RESOURCE_GROUP || '';

  console.log('\n🧹 Azure Container Cleanup - Remove All Containers\n');
  console.log(`Resource Group: ${resourceGroup}\n`);

  const credential = new DefaultAzureCredential();
  const containerClient = new ContainerInstanceManagementClient(credential, subscriptionId);

  try {
    // List all containers
    console.log('📋 Listing all containers...\n');
    const containers = [];
    
    for await (const container of containerClient.containerGroups.listByResourceGroup(resourceGroup)) {
      containers.push({
        name: container.name!,
        state: container.instanceView?.state || 'Unknown',
        ip: container.ipAddress?.ip || 'N/A'
      });
    }

    if (containers.length === 0) {
      console.log('✅ No containers found in resource group');
      return;
    }

    console.log(`Found ${containers.length} container(s):\n`);
    containers.forEach((c, i) => {
      console.log(`${i + 1}. ${c.name}`);
      console.log(`   State: ${c.state}`);
      console.log(`   IP: ${c.ip}\n`);
    });

    console.log('⚠️  Starting cleanup process...\n');

    // Delete each container
    for (const container of containers) {
      try {
        console.log(`🗑️  Processing: ${container.name}`);
        
        // Try to stop first if running
        if (container.state === 'Running') {
          console.log('   🛑 Stopping container...');
          try {
            await containerClient.containerGroups.stop(resourceGroup, container.name);
            console.log('   ✅ Stopped');
            await new Promise(resolve => setTimeout(resolve, 3000));
          } catch (error) {
            console.log('   ⚠️  Could not stop (may already be stopped)');
          }
        }

        // Delete the container
        console.log('   🗑️  Deleting container...');
        const deleteOperation = await containerClient.containerGroups.beginDelete(
          resourceGroup,
          container.name
        );
        await deleteOperation.pollUntilDone();
        console.log('   ✅ Deleted successfully\n');

      } catch (error: any) {
        console.error(`   ❌ Failed to delete ${container.name}: ${error.message}\n`);
      }
    }

    // Verify all are deleted
    console.log('🔍 Verifying cleanup...');
    const remainingContainers = [];
    
    for await (const container of containerClient.containerGroups.listByResourceGroup(resourceGroup)) {
      remainingContainers.push(container.name!);
    }

    if (remainingContainers.length === 0) {
      console.log('✅ All containers successfully removed!');
    } else {
      console.log(`⚠️  ${remainingContainers.length} container(s) still remain:`);
      remainingContainers.forEach(name => console.log(`   - ${name}`));
    }

    console.log('\n✅ Cleanup process completed!\n');

  } catch (error: any) {
    console.error('❌ Cleanup failed:', error.message);
    process.exit(1);
  }
}

// Add confirmation prompt
async function main() {
  console.log('⚠️  WARNING: This will delete ALL containers in the jupiter-agents resource group!');
  console.log('Containers to be deleted:');
  console.log('- aci-demo-user-2-simple-api-1754392555313-dfd0fadb-95df-44fb-a7b');
  console.log('- aci-final-te-final-te-da98d6e0');
  console.log('\nProceeding with cleanup in 5 seconds... (Ctrl+C to cancel)\n');
  
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  await cleanupAllContainers();
}

main().catch(console.error);