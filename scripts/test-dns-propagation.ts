#!/usr/bin/env ts-node
/**
 * Test DNS Propagation
 * Check if DNS records have propagated to public DNS servers
 */

import * as dns from 'dns';
import { promisify } from 'util';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const resolve4 = promisify(dns.resolve4);
const resolveCname = promisify(dns.resolveCname);
const resolveNs = promisify(dns.resolveNs);

interface DNSServer {
  name: string;
  ip: string;
}

const publicDNSServers: DNSServer[] = [
  { name: 'Google', ip: '8.8.8.8' },
  { name: 'Cloudflare', ip: '1.1.1.1' },
  { name: 'Quad9', ip: '9.9.9.9' },
  { name: 'OpenDNS', ip: '208.67.222.222' },
  { name: 'Azure', ip: '168.63.129.16' }
];

async function testDNSPropagation(domain: string, recordType: 'A' | 'CNAME' | 'NS' = 'A') {
  console.log(`\n🔍 Testing DNS Propagation for: ${domain}`);
  console.log(`   Record Type: ${recordType}`);
  console.log('═'.repeat(60));

  const results: { server: string; status: string; result?: string; error?: string }[] = [];

  for (const server of publicDNSServers) {
    try {
      // Create a resolver that uses specific DNS server
      const resolver = new dns.Resolver();
      resolver.setServers([server.ip]);

      let result: string | string[];
      
      switch (recordType) {
        case 'A':
          const resolve4WithServer = promisify(resolver.resolve4.bind(resolver));
          result = await resolve4WithServer(domain);
          break;
        case 'CNAME':
          const resolveCnameWithServer = promisify(resolver.resolveCname.bind(resolver));
          result = await resolveCnameWithServer(domain);
          break;
        case 'NS':
          const resolveNsWithServer = promisify(resolver.resolveNs.bind(resolver));
          result = await resolveNsWithServer(domain);
          break;
      }

      results.push({
        server: server.name,
        status: '✅',
        result: Array.isArray(result) ? result.join(', ') : result
      });

    } catch (error: any) {
      results.push({
        server: server.name,
        status: '❌',
        error: error.code || error.message
      });
    }
  }

  // Display results
  console.log('\n📊 Propagation Results:\n');
  
  let propagatedCount = 0;
  for (const result of results) {
    console.log(`${result.status} ${result.server.padEnd(12)} ${result.result || result.error}`);
    if (result.status === '✅') propagatedCount++;
  }

  const propagationPercentage = (propagatedCount / publicDNSServers.length) * 100;
  
  console.log('\n' + '─'.repeat(60));
  console.log(`📈 Propagation Status: ${propagatedCount}/${publicDNSServers.length} servers (${propagationPercentage.toFixed(0)}%)`);
  
  if (propagationPercentage === 100) {
    console.log('✅ DNS has fully propagated!');
  } else if (propagationPercentage >= 60) {
    console.log('⏳ DNS is propagating... (may take up to 48 hours)');
  } else {
    console.log('⏳ DNS propagation just started (typically takes 2-4 hours)');
  }
}

async function checkMultipleDomains() {
  const zone = process.env.AZURE_DNS_ZONE || 'digisquares.in';
  
  console.log('\n🌐 DNS Propagation Check for ' + zone);
  console.log('═'.repeat(60));

  // Check nameservers first
  await testDNSPropagation(zone, 'NS');

  // Check some common subdomains
  const subdomains = [
    'test',
    'demo-webapp',
    'api',
    'app',
    'www'
  ];

  for (const subdomain of subdomains) {
    const fqdn = `${subdomain}.${zone}`;
    
    // Try A record first
    console.log('\n' + '─'.repeat(60));
    await testDNSPropagation(fqdn, 'A');
  }

  // Show DNS cache tips
  console.log('\n💡 DNS Cache Tips:');
  console.log('   - Clear browser cache: Ctrl+Shift+Delete');
  console.log('   - Flush DNS cache:');
  console.log('     Windows: ipconfig /flushdns');
  console.log('     macOS: sudo dscacheutil -flushcache');
  console.log('     Linux: sudo systemctl restart systemd-resolved');
}

async function testSpecificDomain(domain: string, type?: string) {
  const recordType = (type?.toUpperCase() || 'A') as 'A' | 'CNAME' | 'NS';
  await testDNSPropagation(domain, recordType);
}

// Main execution
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    // Test all domains
    checkMultipleDomains().catch(console.error);
  } else {
    // Test specific domain
    const domain = args[0];
    const type = args[1];
    testSpecificDomain(domain, type).catch(console.error);
  }
}