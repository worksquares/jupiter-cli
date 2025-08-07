#!/usr/bin/env ts-node
/**
 * Deploy Container with DNS - Automatic or Manual Fallback
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { AzureContainerManager, ACIConfig } from '../src/azure/aci-manager';
import { GoDaddyDNSManager } from '../src/dns/godaddy-dns-manager';
import { ManualDNSManager, ContainerDNSHelper } from '../src/dns/manual-dns-config';
import axios from 'axios';

dotenv.config({ path: path.join(__dirname, '../.env') });

async function deployWithDNSFallback() {
  console.log('\n🚀 Deploying Container with DNS Configuration\n');
  console.log('═'.repeat(60));

  try {
    // Step 1: Deploy Azure Container
    console.log('📦 Step 1: Deploying Azure Container...\n');

    const aciConfig: ACIConfig = {
      subscriptionId: process.env.AZURE_SUBSCRIPTION_ID!,
      resourceGroup: process.env.AZURE_RESOURCE_GROUP!,
      location: process.env.AZURE_LOCATION || 'eastus',
      containerRegistry: process.env.AZURE_CONTAINER_REGISTRY_SERVER!,
      registryUsername: process.env.AZURE_CONTAINER_REGISTRY_USERNAME,
      registryPassword: process.env.AZURE_CONTAINER_REGISTRY_PASSWORD
    };

    const aciManager = new AzureContainerManager(aciConfig);

    const context = {
      userId: 'demo',
      projectId: 'webapp',
      taskId: `deploy-${Date.now()}`,
      tenantId: 'digisquares'
    };

    const container = await aciManager.createProjectContainer(context, {
      image: 'mcr.microsoft.com/azuredocs/aci-helloworld',
      cpu: 0.5,
      memoryGB: 1,
      ports: [{ protocol: 'TCP' as const, port: 80, name: 'http' }]
    });

    const containerName = aciManager.getContainerName(context);
    const containerIP = container.ipAddress?.ip;
    const containerFQDN = container.ipAddress?.fqdn;

    console.log('✅ Container deployed successfully!');
    console.log(`   Name: ${containerName}`);
    console.log(`   IP: ${containerIP}`);
    console.log(`   Azure URL: http://${containerFQDN || containerIP}\n`);

    if (!containerIP) {
      console.error('❌ No IP assigned to container');
      return;
    }

    // Step 2: Try automatic DNS configuration
    console.log('🌐 Step 2: Configuring DNS for digisquares.com...\n');

    const subdomain = ContainerDNSHelper.generateSubdomain(context.userId, context.projectId);
    let dnsConfigured = false;

    // Try GoDaddy API
    if (process.env.GODADDY_API_KEY && process.env.GODADDY_API_SECRET) {
      console.log('   Attempting automatic DNS configuration...');
      
      try {
        // Quick test of API access
        const testResponse = await axios.get(
          `https://api.godaddy.com/v1/domains/digisquares.com`,
          {
            headers: {
              'Authorization': `sso-key ${process.env.GODADDY_API_KEY}:${process.env.GODADDY_API_SECRET}`,
              'Content-Type': 'application/json'
            },
            timeout: 5000
          }
        );

        if (testResponse.status === 200) {
          // API works, use automatic configuration
          const dnsManager = new GoDaddyDNSManager({
            apiKey: process.env.GODADDY_API_KEY!,
            apiSecret: process.env.GODADDY_API_SECRET!,
            domain: 'digisquares.com',
            environment: 'production'
          });

          await dnsManager.createSubdomain({
            subdomain,
            target: containerIP,
            ttl: 600,
            description: `ACI:${containerName}`
          });

          console.log('   ✅ DNS configured automatically!');
          console.log(`   URL: http://${subdomain}.digisquares.com`);
          dnsConfigured = true;
        }
      } catch (error: any) {
        console.log('   ⚠️  Automatic DNS configuration failed');
        console.log(`   Reason: ${error.response?.data?.message || error.message}`);
      }
    }

    // Step 3: Fallback to manual configuration
    if (!dnsConfigured) {
      console.log('\n📋 Using manual DNS configuration...\n');

      const manualDNS = new ManualDNSManager('digisquares.com');
      const record = manualDNS.generateDNSConfig(containerName, containerIP, subdomain);
      
      console.log(manualDNS.getManualInstructions(record));

      // Generate helper files
      const csvPath = manualDNS.generateBulkImport();
      const psPath = manualDNS.generatePowerShellScript();

      console.log('\n📁 Generated helper files:');
      console.log(`   CSV Import: ${csvPath}`);
      console.log(`   PowerShell: ${psPath}`);

      // Alternative: Use Azure FQDN with CNAME
      console.log('\n🔄 Alternative Option - Use CNAME:');
      console.log('   Instead of an A record, you can create a CNAME:');
      console.log(`   Type: CNAME`);
      console.log(`   Name: ${subdomain}`);
      console.log(`   Value: ${containerFQDN}`);
      console.log('   TTL: 600');
    }

    // Step 4: Provide access information
    console.log('\n' + '═'.repeat(60));
    console.log('✅ Deployment Complete!');
    console.log('═'.repeat(60));

    console.log('\n🔗 Access your container:');
    console.log(`   Direct IP: http://${containerIP}`);
    console.log(`   Azure FQDN: http://${containerFQDN}`);
    
    if (dnsConfigured) {
      console.log(`   Custom Domain: http://${subdomain}.digisquares.com`);
      console.log('\n   ⏱️  DNS propagation takes 5-10 minutes');
    } else {
      console.log(`   Custom Domain: http://${subdomain}.digisquares.com (after manual setup)`);
    }

    // Step 5: Test endpoints
    console.log('\n🧪 Testing container endpoints...');
    
    try {
      const response = await axios.get(`http://${containerIP}`, { timeout: 5000 });
      console.log(`   ✅ Container responding on IP: ${response.status}`);
    } catch (error) {
      console.log('   ⚠️  Container not responding yet (may need more time)');
    }

    // Cleanup instructions
    console.log('\n🧹 To clean up:');
    console.log(`   az container delete -g ${process.env.AZURE_RESOURCE_GROUP} -n ${containerName} --yes`);
    
    if (dnsConfigured) {
      console.log(`   DNS record will be cleaned automatically`);
    } else {
      console.log(`   Remember to delete DNS record: ${subdomain}.digisquares.com`);
    }

  } catch (error) {
    console.error('\n❌ Deployment failed:', error);
  }
}

// Run deployment
if (require.main === module) {
  deployWithDNSFallback().catch(console.error);
}