#!/usr/bin/env ts-node
/**
 * GoDaddy DNS Setup Script
 * Configures GoDaddy API credentials and domain settings
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import * as readline from 'readline';
import { GoDaddyDNSManager } from '../src/dns/godaddy-dns-manager';

dotenv.config({ path: path.join(__dirname, '../.env') });

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query: string): Promise<string> {
  return new Promise(resolve => rl.question(query, resolve));
}

async function setupGoDaddyDNS() {
  console.log('\n🌐 GoDaddy DNS Configuration Setup\n');
  console.log('This will configure GoDaddy DNS integration for dynamic subdomains.');
  console.log('You\'ll need your GoDaddy API credentials.\n');
  
  console.log('📋 Get your API credentials from:');
  console.log('   https://developer.godaddy.com/keys\n');

  try {
    // Step 1: Collect credentials
    const apiKey = await question('GoDaddy API Key: ');
    const apiSecret = await question('GoDaddy API Secret: ');
    const domain = await question('Your domain (e.g., example.com): ');
    
    console.log('\nSelect environment:');
    console.log('1. Production (api.godaddy.com)');
    console.log('2. Test/OTE (api.ote-godaddy.com)');
    const envChoice = await question('Choice (1 or 2): ');
    const environment = envChoice === '2' ? 'test' : 'production';

    // Step 2: Test credentials
    console.log('\n🔍 Testing GoDaddy API connection...');
    
    const testManager = new GoDaddyDNSManager({
      apiKey,
      apiSecret,
      domain,
      environment: environment as 'production' | 'test'
    });

    const isValid = await testManager.verifyDomain();
    
    if (!isValid) {
      console.error('❌ Failed to verify domain. Please check your credentials.');
      rl.close();
      return;
    }

    console.log('✅ Domain verified successfully!');

    // Step 3: List existing DNS records
    console.log('\n📋 Current DNS Records:');
    const records = await testManager.listACISubdomains();
    
    if (records.length > 0) {
      records.forEach(r => {
        console.log(`   ${r.subdomain}.${domain} -> ${r.target}`);
      });
    } else {
      console.log('   No subdomain records found');
    }

    // Step 4: Update .env file
    console.log('\n💾 Saving configuration...');
    
    const envPath = path.join(__dirname, '../.env');
    let envContent = fs.readFileSync(envPath, 'utf8');
    
    // Update or add GoDaddy settings
    const godaddyConfig = `
# GoDaddy DNS Configuration
GODADDY_API_KEY=${apiKey}
GODADDY_API_SECRET=${apiSecret}
GODADDY_DOMAIN=${domain}
GODADDY_ENVIRONMENT=${environment}
`;

    if (envContent.includes('GODADDY_API_KEY')) {
      // Replace existing config
      envContent = envContent.replace(
        /# GoDaddy DNS Configuration[\s\S]*?(?=\n#|\n\n|$)/,
        godaddyConfig.trim()
      );
    } else {
      // Add new config
      envContent += '\n' + godaddyConfig;
    }

    fs.writeFileSync(envPath, envContent);
    console.log('✅ Configuration saved to .env');

    // Step 5: Create DNS config file
    const dnsConfig = {
      domain,
      environment,
      subdomainStrategy: {
        pattern: '{userId}-{projectId}',
        prefix: 'app',
        wildcard: {
          dev: true,
          test: true,
          staging: false
        }
      },
      ssl: {
        enabled: false,
        provider: 'letsencrypt',
        email: ''
      },
      cleanup: {
        enabled: true,
        retentionHours: 24,
        checkIntervalMinutes: 60
      }
    };

    const configPath = path.join(__dirname, '../config/dns-config.json');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(dnsConfig, null, 2));
    console.log('✅ DNS configuration saved to config/dns-config.json');

    // Step 6: Setup options
    console.log('\n⚙️  Additional Setup Options:\n');
    
    const setupWildcard = await question('Setup wildcard DNS for development? (y/n): ');
    
    if (setupWildcard.toLowerCase() === 'y') {
      const wildcardIP = await question('Target IP for wildcard domains: ');
      
      try {
        await testManager.createWildcardSubdomain('dev', wildcardIP);
        await testManager.createWildcardSubdomain('test', wildcardIP);
        console.log('✅ Wildcard DNS configured:');
        console.log(`   *.dev.${domain} -> ${wildcardIP}`);
        console.log(`   *.test.${domain} -> ${wildcardIP}`);
      } catch (error) {
        console.error('⚠️  Failed to create wildcard DNS:', error);
      }
    }

    // Step 7: Create example subdomain
    const createExample = await question('\nCreate example subdomain for testing? (y/n): ');
    
    if (createExample.toLowerCase() === 'y') {
      const exampleSubdomain = `test-${Date.now()}`;
      const exampleIP = '52.188.35.8'; // Example Azure IP
      
      await testManager.createSubdomain({
        subdomain: exampleSubdomain,
        target: exampleIP,
        ttl: 300,
        description: 'Test subdomain created by setup script'
      });
      
      console.log(`\n✅ Example subdomain created:`);
      console.log(`   ${exampleSubdomain}.${domain} -> ${exampleIP}`);
      console.log(`   (This is just for testing, you can delete it later)`);
    }

    // Step 8: Summary
    console.log('\n' + '═'.repeat(60));
    console.log('✅ GoDaddy DNS Setup Complete!');
    console.log('═'.repeat(60));
    console.log('\n📋 Configuration Summary:');
    console.log(`   Domain: ${domain}`);
    console.log(`   Environment: ${environment}`);
    console.log(`   API Key: ${apiKey.substring(0, 8)}...`);
    console.log('\n🚀 Next Steps:');
    console.log('1. Containers will automatically get subdomains like:');
    console.log(`   user123-project456.app.${domain}`);
    console.log('\n2. Access containers via custom domain instead of Azure IPs');
    console.log('\n3. DNS records are automatically managed during container lifecycle');

    // Create helper script
    const helperScript = `#!/usr/bin/env ts-node
/**
 * DNS Management Helper
 */

import { GoDaddyDNSManager } from '../src/dns/godaddy-dns-manager';
import * as dotenv from 'dotenv';

dotenv.config();

const manager = new GoDaddyDNSManager({
  apiKey: process.env.GODADDY_API_KEY!,
  apiSecret: process.env.GODADDY_API_SECRET!,
  domain: process.env.GODADDY_DOMAIN!,
  environment: process.env.GODADDY_ENVIRONMENT as any
});

async function main() {
  const command = process.argv[2];
  
  switch (command) {
    case 'list':
      const records = await manager.listACISubdomains();
      console.log('Current subdomains:');
      records.forEach(r => console.log(\`  \${r.subdomain}.\${process.env.GODADDY_DOMAIN} -> \${r.target}\`));
      break;
      
    case 'create':
      const subdomain = process.argv[3];
      const target = process.argv[4];
      if (!subdomain || !target) {
        console.log('Usage: dns-helper create <subdomain> <ip>');
        break;
      }
      await manager.createSubdomain({ subdomain, target });
      console.log(\`Created: \${subdomain}.\${process.env.GODADDY_DOMAIN} -> \${target}\`);
      break;
      
    case 'delete':
      const subdomainDel = process.argv[3];
      if (!subdomainDel) {
        console.log('Usage: dns-helper delete <subdomain>');
        break;
      }
      await manager.deleteSubdomain(subdomainDel);
      console.log(\`Deleted: \${subdomainDel}.\${process.env.GODADDY_DOMAIN}\`);
      break;
      
    default:
      console.log('Usage: dns-helper [list|create|delete]');
  }
}

main().catch(console.error);
`;

    fs.writeFileSync(path.join(__dirname, 'dns-helper.ts'), helperScript);
    console.log('\n✅ Created dns-helper.ts for DNS management');

  } catch (error) {
    console.error('\n❌ Setup failed:', error);
  } finally {
    rl.close();
  }
}

// Run setup
if (require.main === module) {
  setupGoDaddyDNS().catch(console.error);
}