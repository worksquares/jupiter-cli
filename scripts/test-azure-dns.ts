#!/usr/bin/env ts-node
import { AzureDNSManager } from '../src/dns/azure-dns-manager';

async function testAzureDNS() {
  console.log('\n🧪 Testing Azure DNS Manager\n');
  
  const dnsManager = new AzureDNSManager();
  
  // List current records
  console.log('Current DNS records:');
  const records = await dnsManager.listSubdomains();
  records.forEach(r => console.log(`  ${r.fqdn} → ${r.ip}`));
  
  // Create test record
  const testName = `azure-test-${Date.now()}`;
  console.log(`\nCreating test record: ${testName}.digisquares.com`);
  await dnsManager.createSubdomain(testName, '1.2.3.4');
  
  // Clean up
  console.log('Deleting test record...');
  await dnsManager.deleteSubdomain(testName);
  
  console.log('\n✅ Azure DNS is working!');
}

testAzureDNS().catch(console.error);