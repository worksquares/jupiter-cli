#!/usr/bin/env ts-node
/**
 * Setup Azure DNS for digisquares.com
 * Migrate DNS management from GoDaddy to Azure
 */

import { execSync } from 'child_process';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.join(__dirname, '../.env') });

const DOMAIN = 'digisquares.com';
const RESOURCE_GROUP = process.env.AZURE_RESOURCE_GROUP || 'jupiter-agents';

async function setupAzureDNS() {
  console.log('\n🌐 Azure DNS Setup for digisquares.com\n');
  console.log('═'.repeat(60));
  console.log('This will:');
  console.log('1. Create Azure DNS Zone ($0.50/month)');
  console.log('2. Show nameservers to update in GoDaddy');
  console.log('3. Set up automatic DNS management');
  console.log('═'.repeat(60));

  try {
    // Step 1: Check if DNS zone already exists
    console.log('\n📋 Checking if DNS zone exists...');
    try {
      const checkResult = execSync(
        `az network dns zone show -g ${RESOURCE_GROUP} -n ${DOMAIN} --query name -o tsv`,
        { encoding: 'utf8', stdio: 'pipe' }
      );
      
      if (checkResult.trim() === DOMAIN) {
        console.log('✅ DNS zone already exists');
      }
    } catch (error) {
      // Zone doesn't exist, create it
      console.log('Creating new DNS zone...');
      
      const createResult = execSync(
        `az network dns zone create -g ${RESOURCE_GROUP} -n ${DOMAIN} --output json`,
        { encoding: 'utf8' }
      );
      
      console.log('✅ DNS zone created successfully!');
    }

    // Step 2: Get nameservers
    console.log('\n📋 Getting Azure nameservers...');
    const nameserversJson = execSync(
      `az network dns zone show -g ${RESOURCE_GROUP} -n ${DOMAIN} --query nameServers --output json`,
      { encoding: 'utf8' }
    );
    
    const nameservers = JSON.parse(nameserversJson);
    
    console.log('\n🔧 IMPORTANT - Update GoDaddy Nameservers:');
    console.log('═'.repeat(60));
    console.log('\n1. Log into GoDaddy: https://www.godaddy.com');
    console.log('2. Go to: My Products → Domains → digisquares.com');
    console.log('3. Click: DNS → Nameservers → Change');
    console.log('4. Select: "Custom"');
    console.log('5. Enter these nameservers:\n');
    
    nameservers.forEach((ns: string, index: number) => {
      console.log(`   Nameserver ${index + 1}: ${ns}`);
    });
    
    console.log('\n6. Click "Save"');
    console.log('\n⏱️  DNS propagation takes 2-48 hours (usually 2-4 hours)');
    console.log('═'.repeat(60));

    // Step 3: Add some default records
    console.log('\n📋 Adding DNS records...');

    // Add record for the container we deployed
    try {
      execSync(
        `az network dns record-set a add-record -g ${RESOURCE_GROUP} -z ${DOMAIN} -n demo-webapp --ipv4-address 4.156.115.152`,
        { stdio: 'pipe' }
      );
      console.log('✅ Added: demo-webapp.digisquares.com → 4.156.115.152');
    } catch (error) {
      console.log('⚠️  Record might already exist');
    }

    // Add a test record
    try {
      execSync(
        `az network dns record-set a add-record -g ${RESOURCE_GROUP} -z ${DOMAIN} -n test --ipv4-address 1.2.3.4 --ttl 300`,
        { stdio: 'pipe' }
      );
      console.log('✅ Added: test.digisquares.com → 1.2.3.4 (test record)');
    } catch (error) {
      console.log('⚠️  Test record might already exist');
    }

    // Step 4: Show current records
    console.log('\n📋 Current DNS records in Azure:');
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

    // Step 5: Create Azure DNS manager
    console.log('\n📄 Creating Azure DNS manager...');
    
    const azureDnsManager = `import { DnsManagementClient } from '@azure/arm-dns';
import { DefaultAzureCredential } from '@azure/identity';
import { Logger } from '../utils/logger';

export class AzureDNSManager {
  private client: DnsManagementClient;
  private logger: Logger;
  
  constructor(
    private resourceGroup: string = '${RESOURCE_GROUP}',
    private zoneName: string = '${DOMAIN}'
  ) {
    this.logger = new Logger('AzureDNSManager');
    const credential = new DefaultAzureCredential();
    const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID!;
    this.client = new DnsManagementClient(credential, subscriptionId);
  }

  async createSubdomain(subdomain: string, ip: string, ttl: number = 300) {
    try {
      await this.client.recordSets.createOrUpdate(
        this.resourceGroup,
        this.zoneName,
        subdomain,
        'A',
        {
          ttl,
          aRecords: [{ ipv4Address: ip }]
        }
      );
      
      this.logger.info(\`Created DNS record: \${subdomain}.\${this.zoneName} → \${ip}\`);
      return true;
    } catch (error) {
      this.logger.error('Failed to create DNS record', error);
      throw error;
    }
  }

  async deleteSubdomain(subdomain: string) {
    try {
      await this.client.recordSets.delete(
        this.resourceGroup,
        this.zoneName,
        subdomain,
        'A'
      );
      
      this.logger.info(\`Deleted DNS record: \${subdomain}.\${this.zoneName}\`);
      return true;
    } catch (error) {
      this.logger.error('Failed to delete DNS record', error);
      throw error;
    }
  }

  async listSubdomains() {
    const records = [];
    try {
      for await (const record of this.client.recordSets.listByDnsZone(
        this.resourceGroup,
        this.zoneName
      )) {
        if (record.type === 'Microsoft.Network/dnszones/A' && record.aRecords) {
          records.push({
            name: record.name,
            fqdn: \`\${record.name}.\${this.zoneName}\`,
            ip: record.aRecords[0]?.ipv4Address,
            ttl: record.ttl
          });
        }
      }
    } catch (error) {
      this.logger.error('Failed to list DNS records', error);
      throw error;
    }
    return records;
  }
}`;

    const managerPath = path.join(__dirname, '../src/dns/azure-dns-manager.ts');
    fs.writeFileSync(managerPath, azureDnsManager);
    console.log('✅ Created: src/dns/azure-dns-manager.ts');

    // Step 6: Create test script
    console.log('\n📄 Creating test script...');
    
    const testScript = `#!/usr/bin/env ts-node
import { AzureDNSManager } from '../src/dns/azure-dns-manager';

async function testAzureDNS() {
  console.log('\\n🧪 Testing Azure DNS Manager\\n');
  
  const dnsManager = new AzureDNSManager();
  
  // List current records
  console.log('Current DNS records:');
  const records = await dnsManager.listSubdomains();
  records.forEach(r => console.log(\`  \${r.fqdn} → \${r.ip}\`));
  
  // Create test record
  const testName = \`azure-test-\${Date.now()}\`;
  console.log(\`\\nCreating test record: \${testName}.${DOMAIN}\`);
  await dnsManager.createSubdomain(testName, '1.2.3.4');
  
  // Clean up
  console.log('Deleting test record...');
  await dnsManager.deleteSubdomain(testName);
  
  console.log('\\n✅ Azure DNS is working!');
}

testAzureDNS().catch(console.error);`;

    const testPath = path.join(__dirname, 'test-azure-dns.ts');
    fs.writeFileSync(testPath, testScript);
    console.log('✅ Created: scripts/test-azure-dns.ts');

    // Step 7: Summary
    console.log('\n' + '═'.repeat(60));
    console.log('✅ Azure DNS Setup Complete!');
    console.log('═'.repeat(60));
    
    console.log('\n💰 Cost:');
    console.log('   - DNS Zone: $0.50/month');
    console.log('   - Queries: $0.40 per million');
    console.log('   - Total: ~$0.50-1.00/month');
    
    console.log('\n📋 Next Steps:');
    console.log('1. Update nameservers in GoDaddy (see above)');
    console.log('2. Wait 2-4 hours for DNS propagation');
    console.log('3. Test with: nslookup test.digisquares.com');
    console.log('4. Your containers will automatically get DNS!');
    
    console.log('\n🧪 After nameservers are updated:');
    console.log('   npm install @azure/arm-dns');
    console.log('   npx ts-node scripts/test-azure-dns.ts');
    
    console.log('\n📚 Commands to manage DNS:');
    console.log(`   # List all records`);
    console.log(`   az network dns record-set list -g ${RESOURCE_GROUP} -z ${DOMAIN} -o table`);
    console.log(`   \n   # Add new subdomain`);
    console.log(`   az network dns record-set a add-record -g ${RESOURCE_GROUP} -z ${DOMAIN} -n myapp --ipv4-address IP`);
    console.log(`   \n   # Delete subdomain`);
    console.log(`   az network dns record-set a delete -g ${RESOURCE_GROUP} -z ${DOMAIN} -n myapp`);

  } catch (error: any) {
    console.error('\n❌ Setup failed:', error.message);
    console.error('\nMake sure you have:');
    console.error('1. Azure CLI installed and logged in');
    console.error('2. Permissions to create DNS zones');
    console.error('3. Run: az login');
  }
}

// Run setup
if (require.main === module) {
  setupAzureDNS().catch(console.error);
}