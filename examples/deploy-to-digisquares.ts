#!/usr/bin/env ts-node
/**
 * Deploy Container to digisquares.com Subdomain
 * Example deployment with automatic DNS configuration
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { AzureContainerManager, ACIConfig } from '../src/azure/aci-manager';
import { ACIDNSIntegration, ACIDNSConfig } from '../src/dns/aci-dns-integration';
import { GoDaddyDNSManager } from '../src/dns/godaddy-dns-manager';

dotenv.config({ path: path.join(__dirname, '../.env') });

async function deployToDigiSquares() {
  console.log('\n🚀 Deploying to digisquares.com\n');
  console.log('═'.repeat(60));

  // Check for GoDaddy credentials
  if (!process.env.GODADDY_API_KEY || !process.env.GODADDY_API_SECRET) {
    console.error('❌ GoDaddy API credentials not configured!');
    console.error('\nTo get your API credentials:');
    console.error('1. Go to: https://developer.godaddy.com/keys');
    console.error('2. Create a production API key');
    console.error('3. Add to .env file:');
    console.error('   GODADDY_API_KEY=your-key-here');
    console.error('   GODADDY_API_SECRET=your-secret-here');
    console.error('\nThen run: npm run setup:dns');
    process.exit(1);
  }

  try {
    // Initialize Azure Container Manager
    const aciConfig: ACIConfig = {
      subscriptionId: process.env.AZURE_SUBSCRIPTION_ID!,
      resourceGroup: process.env.AZURE_RESOURCE_GROUP!,
      location: process.env.AZURE_LOCATION || 'eastus',
      containerRegistry: process.env.AZURE_CONTAINER_REGISTRY_SERVER!,
      registryUsername: process.env.AZURE_CONTAINER_REGISTRY_USERNAME,
      registryPassword: process.env.AZURE_CONTAINER_REGISTRY_PASSWORD
    };

    const aciManager = new AzureContainerManager(aciConfig);

    // Initialize DNS Integration for digisquares.com
    const dnsConfig: ACIDNSConfig = {
      apiKey: process.env.GODADDY_API_KEY!,
      apiSecret: process.env.GODADDY_API_SECRET!,
      domain: 'digisquares.com',
      environment: 'production',
      subdomainPrefix: 'app', // Will create subdomains under app.digisquares.com
      enableSSL: false,
      autoCleanup: true
    };

    const dnsIntegration = new ACIDNSIntegration(aciManager, dnsConfig);

    // Example deployments
    const deployments = [
      {
        context: {
          userId: 'demo',
          projectId: 'webapp',
          taskId: `v${Date.now()}`,
          tenantId: 'digisquares'
        },
        config: {
          image: 'nginx:alpine',
          cpu: 0.5,
          memoryGB: 1,
          ports: [{ protocol: 'TCP' as const, port: 80, name: 'http' }],
          environmentVariables: {
            APP_NAME: 'DigiSquares Demo App',
            DOMAIN: 'digisquares.com'
          }
        },
        description: 'Demo Web Application'
      },
      {
        context: {
          userId: 'api',
          projectId: 'backend',
          taskId: 'prod',
          tenantId: 'digisquares'
        },
        config: {
          image: 'mcr.microsoft.com/azuredocs/aci-helloworld',
          cpu: 0.5,
          memoryGB: 1,
          ports: [{ protocol: 'TCP' as const, port: 80, name: 'http' }]
        },
        description: 'API Backend Service'
      }
    ];

    console.log(`📦 Deploying ${deployments.length} containers to digisquares.com...\n`);

    for (const deployment of deployments) {
      console.log(`\n🔄 Deploying: ${deployment.description}`);
      console.log(`   User: ${deployment.context.userId}`);
      console.log(`   Project: ${deployment.context.projectId}`);

      try {
        const result = await dnsIntegration.createContainerWithDNS(
          deployment.context,
          deployment.config
        );

        console.log(`\n✅ Deployment Successful!`);
        console.log(`   Container: ${result.container.name}`);
        console.log(`   Azure IP: ${result.dns.ip}`);
        console.log(`   Custom URL: http://${result.dns.fqdn}`);
        console.log(`   Status: ${result.container.provisioningState}`);

        // Expected URLs:
        // - demo-webapp.app.digisquares.com
        // - api-backend.app.digisquares.com

      } catch (error) {
        console.error(`❌ Failed to deploy ${deployment.description}:`, error);
      }
    }

    // List all digisquares.com subdomains
    console.log('\n📋 Current digisquares.com Subdomains:');
    console.log('━'.repeat(60));

    const dnsManager = new GoDaddyDNSManager(dnsConfig);
    const subdomains = await dnsManager.listACISubdomains();

    if (subdomains.length > 0) {
      subdomains.forEach(sub => {
        console.log(`   ${sub.subdomain}.digisquares.com → ${sub.target}`);
        if (sub.description) {
          console.log(`      Description: ${sub.description}`);
        }
      });
    } else {
      console.log('   No subdomains configured yet');
    }

    // Setup wildcard domains for development
    console.log('\n🌐 Setting up wildcard domains...');
    
    const setupWildcard = false; // Set to true if you want wildcard domains
    if (setupWildcard) {
      // This would create *.dev.digisquares.com → target IP
      const wildcardIP = '52.188.35.8'; // Replace with your target IP
      await dnsIntegration.setupWildcardDNS(wildcardIP);
      console.log(`   ✅ *.dev.digisquares.com → ${wildcardIP}`);
      console.log(`   ✅ *.test.digisquares.com → ${wildcardIP}`);
    }

    // Provide management info
    console.log('\n🛠️  Management Commands:');
    console.log('━'.repeat(60));
    console.log('\n1. Check DNS propagation:');
    console.log('   nslookup demo-webapp.app.digisquares.com');
    console.log('   dig demo-webapp.app.digisquares.com');
    
    console.log('\n2. List all subdomains:');
    console.log('   npm run dns:helper list');
    
    console.log('\n3. Create custom subdomain:');
    console.log('   npm run dns:helper create myapp 52.188.35.8');
    console.log('   → Creates: myapp.digisquares.com');
    
    console.log('\n4. Access your containers:');
    subdomains.forEach(sub => {
      console.log(`   http://${sub.subdomain}.digisquares.com`);
    });

    console.log('\n✅ Deployment to digisquares.com completed!');

  } catch (error) {
    console.error('\n❌ Deployment failed:', error);
    process.exit(1);
  }
}

// Run deployment
if (require.main === module) {
  deployToDigiSquares().catch(console.error);
}