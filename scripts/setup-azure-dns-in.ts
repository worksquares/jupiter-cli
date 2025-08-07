#!/usr/bin/env ts-node
/**
 * Setup Azure DNS for digisquares.in
 * Fresh domain for container DNS automation
 */

import { execSync } from 'child_process';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.join(__dirname, '../.env') });

const DOMAIN = 'digisquares.in';
const RESOURCE_GROUP = process.env.AZURE_RESOURCE_GROUP || 'jupiter-agents';

async function setupAzureDNSIn() {
  console.log('\n🌐 Azure DNS Setup for digisquares.in\n');
  console.log('═'.repeat(60));
  console.log('Setting up fresh DNS zone for container automation');
  console.log('Cost: $0.50/month for DNS zone');
  console.log('═'.repeat(60));

  try {
    // Step 1: Create DNS Zone
    console.log('\n📋 Creating DNS zone for digisquares.in...');
    try {
      const createResult = execSync(
        `az network dns zone create -g ${RESOURCE_GROUP} -n ${DOMAIN} --output json`,
        { encoding: 'utf8' }
      );
      
      console.log('✅ DNS zone created successfully!');
    } catch (error: any) {
      if (error.message.includes('already exists')) {
        console.log('✅ DNS zone already exists');
      } else {
        throw error;
      }
    }

    // Step 2: Get nameservers
    console.log('\n📋 Getting Azure nameservers...');
    const nameserversJson = execSync(
      `az network dns zone show -g ${RESOURCE_GROUP} -n ${DOMAIN} --query nameServers --output json`,
      { encoding: 'utf8' }
    );
    
    const nameservers = JSON.parse(nameserversJson);
    
    console.log('\n' + '═'.repeat(60));
    console.log('🔧 UPDATE NAMESERVERS IN YOUR DOMAIN REGISTRAR');
    console.log('═'.repeat(60));
    console.log('\nIf digisquares.in is registered with:');
    
    console.log('\n📍 GoDaddy:');
    console.log('1. Log in → My Products → Domains → digisquares.in');
    console.log('2. DNS → Nameservers → Change → Custom');
    
    console.log('\n📍 Other Registrars:');
    console.log('Look for "Nameservers", "DNS Settings", or "Name Server"');
    
    console.log('\n🔧 Enter these Azure nameservers:\n');
    nameservers.forEach((ns: string, index: number) => {
      console.log(`   Nameserver ${index + 1}: ${ns}`);
    });
    
    console.log('\n⏱️  DNS propagation: 2-48 hours (usually 2-4 hours)');
    console.log('═'.repeat(60));

    // Step 3: Add initial records
    console.log('\n📋 Setting up DNS records...');

    // Add a wildcard for all app subdomains
    console.log('\n🌟 Creating wildcard subdomain for containers...');
    try {
      // For wildcard, we'll need a default IP - using Azure's sample
      execSync(
        `az network dns record-set a add-record -g ${RESOURCE_GROUP} -z ${DOMAIN} -n "*.app" --ipv4-address 1.2.3.4 --ttl 300`,
        { stdio: 'pipe' }
      );
      console.log('✅ Added: *.app.digisquares.in → 1.2.3.4 (placeholder)');
      console.log('   Note: Update this IP when you have a load balancer');
    } catch (error) {
      console.log('⚠️  Wildcard might already exist');
    }

    // Add test record
    try {
      execSync(
        `az network dns record-set a add-record -g ${RESOURCE_GROUP} -z ${DOMAIN} -n test --ipv4-address 8.8.8.8 --ttl 300`,
        { stdio: 'pipe' }
      );
      console.log('✅ Added: test.digisquares.in → 8.8.8.8 (for testing)');
    } catch (error) {
      console.log('⚠️  Test record might already exist');
    }

    // Step 4: Update environment configuration
    console.log('\n📄 Updating environment configuration...');
    
    const envPath = path.join(__dirname, '../../.env');
    let envContent = fs.readFileSync(envPath, 'utf8');
    
    // Add Azure DNS configuration
    const azureDnsConfig = `
# Azure DNS Configuration
AZURE_DNS_ZONE=${DOMAIN}
AZURE_DNS_RESOURCE_GROUP=${RESOURCE_GROUP}
DNS_PROVIDER=azure
`;

    if (!envContent.includes('AZURE_DNS_ZONE')) {
      envContent += azureDnsConfig;
      fs.writeFileSync(envPath, envContent);
      console.log('✅ Updated .env with Azure DNS configuration');
    }

    // Step 5: Create deployment example
    console.log('\n📄 Creating deployment example...');
    
    const deployExample = `#!/usr/bin/env ts-node
/**
 * Deploy Container with Azure DNS (digisquares.in)
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { execSync } from 'child_process';
import { AzureContainerManager, ACIConfig } from '../src/azure/aci-manager';

dotenv.config({ path: path.join(__dirname, '../.env') });

async function deployWithAzureDNS() {
  console.log('\\n🚀 Deploying Container with Azure DNS (digisquares.in)\\n');

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

    const context = {
      userId: 'demo',
      projectId: 'webapp',
      taskId: \`v\${Date.now()}\`,
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
    const subdomain = \`\${context.userId}-\${context.projectId}\`;

    console.log('✅ Container created!');
    console.log(\`   IP: \${containerIP}\`);
    console.log(\`   Azure FQDN: \${containerFQDN}\`);

    // Add DNS record in Azure
    if (containerIP) {
      console.log('\\n🌐 Adding DNS record...');
      
      execSync(
        \`az network dns record-set a add-record -g ${RESOURCE_GROUP} -z ${DOMAIN} -n \${subdomain} --ipv4-address \${containerIP} --ttl 300\`,
        { stdio: 'inherit' }
      );

      console.log(\`\\n✅ DNS configured: \${subdomain}.${DOMAIN} → \${containerIP}\`);
      console.log('\\n🔗 Access your container at:');
      console.log(\`   http://\${containerIP} (immediate)\`);
      console.log(\`   http://\${subdomain}.${DOMAIN} (after DNS propagation)\`);
    }

  } catch (error) {
    console.error('❌ Deployment failed:', error);
  }
}

deployWithAzureDNS().catch(console.error);`;

    const deployPath = path.join(__dirname, '../examples/deploy-azure-dns-in.ts');
    fs.writeFileSync(deployPath, deployExample);
    console.log('✅ Created: examples/deploy-azure-dns-in.ts');

    // Step 6: Show current records
    console.log('\n📋 Current DNS records:');
    const recordsJson = execSync(
      `az network dns record-set list -g ${RESOURCE_GROUP} -z ${DOMAIN} --output json`,
      { encoding: 'utf8' }
    );
    
    const records = JSON.parse(recordsJson);
    records.forEach((record: any) => {
      if (record.type === 'Microsoft.Network/dnszones/A') {
        const ip = record.aRecords?.[0]?.ipv4Address;
        if (ip) {
          console.log(`   ${record.name}.${DOMAIN} → ${ip}`);
        }
      }
    });

    // Step 7: Create helper commands
    console.log('\n📚 Quick DNS Commands:');
    console.log(`\n# Add container DNS:`);
    console.log(`az network dns record-set a add-record -g ${RESOURCE_GROUP} -z ${DOMAIN} -n demo-app --ipv4-address CONTAINER_IP`);
    
    console.log(`\n# List all records:`);
    console.log(`az network dns record-set list -g ${RESOURCE_GROUP} -z ${DOMAIN} -o table`);
    
    console.log(`\n# Delete a record:`);
    console.log(`az network dns record-set a delete -g ${RESOURCE_GROUP} -z ${DOMAIN} -n demo-app`);

    // Final summary
    console.log('\n' + '═'.repeat(60));
    console.log('✅ Azure DNS Setup Complete for digisquares.in!');
    console.log('═'.repeat(60));
    
    console.log('\n📋 Summary:');
    console.log(`   Domain: ${DOMAIN}`);
    console.log(`   Resource Group: ${RESOURCE_GROUP}`);
    console.log(`   Monthly Cost: $0.50`);
    console.log(`   Status: Ready for nameserver update`);
    
    console.log('\n🚀 Next Steps:');
    console.log('1. Update nameservers in your domain registrar');
    console.log('2. Wait 2-4 hours for propagation');
    console.log('3. Deploy containers with automatic DNS!');
    
    console.log('\n💡 After nameservers are updated:');
    console.log('   npm run deploy:azure-dns-in');
    
    console.log('\n🧪 Test DNS propagation:');
    console.log(`   nslookup -type=NS ${DOMAIN}`);
    console.log(`   nslookup test.${DOMAIN}`);

  } catch (error: any) {
    console.error('\n❌ Setup failed:', error.message);
  }
}

// Run setup
if (require.main === module) {
  setupAzureDNSIn().catch(console.error);
}