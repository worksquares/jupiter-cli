/**
 * Azure Container Cleanup Script
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { ContainerInstanceManagementClient } from '@azure/arm-containerinstance';
import { DefaultAzureCredential } from '@azure/identity';

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function cleanupContainer() {
  const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID || '';
  const resourceGroup = process.env.AZURE_RESOURCE_GROUP || '';
  const containerName = 'test-interactive-1754434767696';

  console.log('\n🧹 Azure Container Cleanup\n');
  console.log(`Container: ${containerName}`);
  console.log(`Resource Group: ${resourceGroup}\n`);

  const credential = new DefaultAzureCredential();
  const containerClient = new ContainerInstanceManagementClient(credential, subscriptionId);

  try {
    // Stop the container first
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
    console.log('\n🔍 Verifying deletion...');
    try {
      await containerClient.containerGroups.get(resourceGroup, containerName);
      console.log('   ⚠️  Container still exists');
    } catch (error) {
      console.log('   ✅ Confirmed - container no longer exists');
    }

    console.log('\n✅ Cleanup completed!\n');

  } catch (error: any) {
    console.error('❌ Cleanup failed:', error.message);
    process.exit(1);
  }
}

cleanupContainer().catch(console.error);