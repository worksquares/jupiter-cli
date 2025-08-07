#!/usr/bin/env ts-node
/**
 * Example: Deploy ACI with Custom Domain
 * Shows how to create a container with automatic subdomain configuration
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { AzureContainerManager, ACIConfig } from '../src/azure/aci-manager';
import { ACIDNSIntegration, ACIDNSConfig } from '../src/dns/aci-dns-integration';
import { Logger } from '../src/utils/logger';

dotenv.config({ path: path.join(__dirname, '../.env') });

const logger = new Logger('ACI-DNS-Example');

async function deployContainerWithDomain() {
  // Validate environment
  const requiredEnvVars = [
    'AZURE_SUBSCRIPTION_ID',
    'AZURE_RESOURCE_GROUP',
    'GODADDY_API_KEY',
    'GODADDY_API_SECRET',
    'GODADDY_DOMAIN'
  ];

  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      console.error(`❌ Missing required environment variable: ${envVar}`);
      console.error('   Run setup scripts first:');
      console.error('   - npm run setup:azure');
      console.error('   - npx ts-node scripts/setup-godaddy-dns.ts');
      process.exit(1);
    }
  }

  console.log('\n🚀 Deploying Container with Custom Domain\n');
  console.log('═'.repeat(60));
  console.log(`Azure Resource Group: ${process.env.AZURE_RESOURCE_GROUP}`);
  console.log(`Domain: ${process.env.GODADDY_DOMAIN}`);
  console.log('═'.repeat(60));

  try {
    // Step 1: Initialize Azure Container Manager
    const aciConfig: ACIConfig = {
      subscriptionId: process.env.AZURE_SUBSCRIPTION_ID!,
      resourceGroup: process.env.AZURE_RESOURCE_GROUP!,
      location: process.env.AZURE_LOCATION || 'eastus',
      containerRegistry: process.env.AZURE_CONTAINER_REGISTRY_SERVER!,
      registryUsername: process.env.AZURE_CONTAINER_REGISTRY_USERNAME,
      registryPassword: process.env.AZURE_CONTAINER_REGISTRY_PASSWORD
    };

    const aciManager = new AzureContainerManager(aciConfig);

    // Step 2: Initialize DNS Integration
    const dnsConfig: ACIDNSConfig = {
      apiKey: process.env.GODADDY_API_KEY!,
      apiSecret: process.env.GODADDY_API_SECRET!,
      domain: process.env.GODADDY_DOMAIN!,
      environment: process.env.GODADDY_ENVIRONMENT as any || 'production',
      subdomainPrefix: 'app',
      enableSSL: false,
      autoCleanup: true
    };

    const dnsIntegration = new ACIDNSIntegration(aciManager, dnsConfig);

    // Step 3: Define container context
    const context = {
      userId: 'demo-user',
      projectId: 'hello-world',
      taskId: `deploy-${Date.now()}`,
      tenantId: 'demo-tenant'
    };

    // Step 4: Define container configuration
    const dockerConfig = {
      image: 'nginx:alpine',
      cpu: 0.5,
      memoryGB: 1,
      ports: [
        { protocol: 'TCP' as const, port: 80, name: 'http' }
      ],
      environmentVariables: {
        CUSTOM_DOMAIN: 'true',
        DEPLOYED_BY: 'aci-dns-integration'
      }
    };

    // Step 5: Deploy container with DNS
    console.log('\n📦 Creating container...');
    const result = await dnsIntegration.createContainerWithDNS(
      context,
      dockerConfig
    );

    console.log('\n✅ Deployment Complete!\n');
    console.log('📋 Container Details:');
    console.log(`   Name: ${result.container.name}`);
    console.log(`   Status: ${result.container.provisioningState}`);
    console.log(`   Azure IP: ${result.dns.ip}`);
    console.log(`   Azure URL: ${result.dns.aciUrl}`);
    
    console.log('\n🌐 Custom Domain Details:');
    console.log(`   Subdomain: ${result.dns.subdomain}`);
    console.log(`   Full URL: http://${result.dns.fqdn}`);
    console.log(`   DNS TTL: 5 minutes`);

    console.log('\n⏳ DNS Propagation:');
    console.log('   DNS changes may take 5-10 minutes to propagate globally.');
    console.log('   You can check propagation status at: https://dnschecker.org\n');

    // Step 6: Setup monitoring (optional)
    console.log('🔍 Starting DNS monitoring...');
    dnsIntegration.on('dns-configured', (mapping) => {
      logger.info('DNS configured', mapping);
    });

    dnsIntegration.on('dns-deleted', (mapping) => {
      logger.info('DNS deleted', mapping);
    });

    await dnsIntegration.startDNSMonitoring(60000); // Check every minute

    // Step 7: List all container DNS mappings
    console.log('\n📋 Current Container DNS Mappings:');
    const mappings = await dnsIntegration.listContainerDNS();
    
    if (mappings.length > 0) {
      mappings.forEach(m => {
        console.log(`   ${m.fqdn} -> ${m.ip || m.aciUrl}`);
      });
    } else {
      console.log('   No mappings found');
    }

    // Step 8: Provide management commands
    console.log('\n🛠️  Management Commands:');
    console.log(`\n1. Check DNS propagation:`);
    console.log(`   nslookup ${result.dns.fqdn}`);
    console.log(`   dig ${result.dns.fqdn}`);
    
    console.log(`\n2. Access your container:`);
    console.log(`   curl http://${result.dns.fqdn}`);
    console.log(`   Browser: http://${result.dns.fqdn}`);
    
    console.log(`\n3. View container logs:`);
    console.log(`   az container logs -g ${process.env.AZURE_RESOURCE_GROUP} -n ${result.container.name}`);
    
    console.log(`\n4. Delete container and DNS:`);
    console.log(`   # Container and DNS will be automatically cleaned up`);
    console.log(`   az container delete -g ${process.env.AZURE_RESOURCE_GROUP} -n ${result.container.name} --yes`);

    console.log('\n✅ Example completed successfully!');

  } catch (error) {
    console.error('\n❌ Deployment failed:', error);
    process.exit(1);
  }
}

// Cleanup function
async function cleanup() {
  console.log('\n🧹 Cleaning up example resources...');
  
  try {
    // Initialize managers
    const aciConfig: ACIConfig = {
      subscriptionId: process.env.AZURE_SUBSCRIPTION_ID!,
      resourceGroup: process.env.AZURE_RESOURCE_GROUP!,
      location: process.env.AZURE_LOCATION || 'eastus',
      containerRegistry: process.env.AZURE_CONTAINER_REGISTRY_SERVER!
    };

    const dnsConfig: ACIDNSConfig = {
      apiKey: process.env.GODADDY_API_KEY!,
      apiSecret: process.env.GODADDY_API_SECRET!,
      domain: process.env.GODADDY_DOMAIN!,
      environment: process.env.GODADDY_ENVIRONMENT as any || 'production'
    };

    const aciManager = new AzureContainerManager(aciConfig);
    const dnsIntegration = new ACIDNSIntegration(aciManager, dnsConfig);

    // Cleanup orphaned DNS records
    const cleaned = await dnsIntegration.cleanupOrphanedDNS();
    console.log(`✅ Cleaned ${cleaned} orphaned DNS records`);

  } catch (error) {
    console.error('Cleanup error:', error);
  }
}

// Handle command line arguments
const command = process.argv[2];

if (command === 'cleanup') {
  cleanup().catch(console.error);
} else {
  deployContainerWithDomain().catch(console.error);
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\nReceived SIGINT, shutting down gracefully...');
  process.exit(0);
});