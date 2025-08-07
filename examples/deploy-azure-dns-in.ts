#!/usr/bin/env ts-node
/**
 * Deploy Container with Azure DNS (digisquares.in)
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { execSync } from 'child_process';
import { AzureContainerManager, ACIConfig } from '../src/azure/aci-manager';

dotenv.config({ path: path.join(__dirname, '../.env') });

async function deployWithAzureDNS() {
  console.log('\n🚀 Deploying Container with Azure DNS (digisquares.in)\n');

  try {
    // Deploy container
    const aciConfig: ACIConfig = {
      subscriptionId: process.env.AZURE_SUBSCRIPTION_ID!,
      resourceGroup: process.env.AZURE_RESOURCE_GROUP!,
      location: process.env.AZURE_LOCATION || 'eastus',
      containerRegistry: process.env.AZURE_CONTAINER_REGISTRY_SERVER!,
      registryUsername: process.env.AZURE_CONTAINER_REGISTRY_USERNAME,
      registryPassword: process.env.AZURE_CONTAINER_REGISTRY_PASSWORD
    };

    const aciManager = new AzureContainerManager(aciConfig);

    const timestamp = Date.now();
    const context = {
      userId: 'test',
      projectId: `app${timestamp}`,
      taskId: `v${timestamp}`,
      tenantId: 'digisquares'
    };

    console.log('📦 Creating container...');
    const container = await aciManager.createProjectContainer(context, {
      image: 'mcr.microsoft.com/azuredocs/aci-helloworld',
      cpu: 0.5,
      memoryGB: 1,
      ports: [{ protocol: 'TCP' as const, port: 80, name: 'http' }]
    });

    const containerIP = container.ipAddress?.ip;
    const containerFQDN = container.ipAddress?.fqdn;
    const subdomain = `${context.userId}-${context.projectId}`;

    console.log('✅ Container created!');
    console.log(`   IP: ${containerIP}`);
    console.log(`   Azure FQDN: ${containerFQDN}`);

    // Add DNS record in Azure
    if (containerIP) {
      console.log('\n🌐 Adding DNS record...');
      
      execSync(
        `az network dns record-set a add-record -g jupiter-agents -z digisquares.in -n ${subdomain} --ipv4-address ${containerIP} --ttl 300`,
        { stdio: 'inherit' }
      );

      console.log(`\n✅ DNS configured: ${subdomain}.digisquares.in → ${containerIP}`);
      console.log('\n🔗 Access your container at:');
      console.log(`   http://${containerIP} (immediate)`);
      console.log(`   http://${subdomain}.digisquares.in (after DNS propagation)`);
    }

  } catch (error) {
    console.error('❌ Deployment failed:', error);
  }
}

deployWithAzureDNS().catch(console.error);