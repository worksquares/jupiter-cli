#!/usr/bin/env ts-node
/**
 * Check SSL Certificate Status
 * Monitor SSL certificates for all domains
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { SSLCertificateService } from '../src/services/ssl-certificate-service';
import { execSync } from 'child_process';

dotenv.config({ path: path.join(__dirname, '../.env') });

async function checkSSLStatus() {
  console.log('\n🔒 SSL Certificate Status Check\n');
  console.log('═'.repeat(60));

  const sslService = new SSLCertificateService({
    provider: 'letsencrypt',
    email: process.env.SSL_EMAIL || 'admin@digisquares.in',
    staging: false,
    autoRenew: false // Just checking, not renewing
  });

  try {
    // Get all active domains from Azure DNS
    console.log('📋 Fetching active domains...\n');
    
    const domains = await getActiveDomains();
    
    if (domains.length === 0) {
      console.log('No active domains found.');
      return;
    }

    console.log(`Found ${domains.length} domains:\n`);

    // Check each domain
    for (const domain of domains) {
      console.log(`\n🌐 ${domain}`);
      console.log('─'.repeat(40));

      try {
        // Check certificate status
        const certInfo = await sslService.getCertificateInfo(domain);
        
        if (!certInfo.exists) {
          console.log('  ⚠️  No certificate found');
          console.log('  📝 Certificate will be generated on first HTTPS access');
          continue;
        }

        const info = certInfo.info!;
        const now = new Date();
        const validTo = new Date(info.validTo);
        const validFrom = new Date(info.validFrom);

        // Status icon
        let statusIcon = '✅';
        let statusText = 'Valid';
        
        if (info.daysRemaining <= 0) {
          statusIcon = '❌';
          statusText = 'EXPIRED';
        } else if (info.daysRemaining <= 14) {
          statusIcon = '🔴';
          statusText = 'CRITICAL - Renew immediately';
        } else if (info.daysRemaining <= 30) {
          statusIcon = '🟡';
          statusText = 'Warning - Renewal needed';
        }

        console.log(`  Status: ${statusIcon} ${statusText}`);
        console.log(`  Issuer: ${info.issuer}`);
        console.log(`  Valid From: ${validFrom.toLocaleDateString()}`);
        console.log(`  Valid To: ${validTo.toLocaleDateString()}`);
        console.log(`  Days Remaining: ${info.daysRemaining}`);
        
        if (info.altNames.length > 1) {
          console.log(`  Alt Names: ${info.altNames.join(', ')}`);
        }

        // Check HTTPS connectivity
        const httpsStatus = await checkHTTPS(domain);
        console.log(`  HTTPS: ${httpsStatus.accessible ? '✅ Accessible' : '❌ Not accessible'}`);
        
        if (httpsStatus.error) {
          console.log(`  Error: ${httpsStatus.error}`);
        }

      } catch (error: any) {
        console.log(`  ❌ Error checking certificate: ${error.message}`);
      }
    }

    // Summary
    console.log('\n' + '═'.repeat(60));
    console.log('📊 Summary\n');
    
    const totalDomains = domains.length;
    console.log(`Total Domains: ${totalDomains}`);
    
    // Recommendations
    console.log('\n💡 Recommendations:');
    console.log('  - Enable auto-renewal for all production domains');
    console.log('  - Monitor certificates with < 30 days remaining');
    console.log('  - Use staging certificates for development');
    console.log('  - Set up email alerts for expiring certificates');

  } catch (error: any) {
    console.error('❌ Status check failed:', error.message);
  } finally {
    await sslService.cleanup();
  }
}

/**
 * Get active domains from Azure DNS
 */
async function getActiveDomains(): Promise<string[]> {
  try {
    const zone = process.env.AZURE_DNS_ZONE || 'digisquares.in';
    const resourceGroup = process.env.AZURE_DNS_RESOURCE_GROUP || 'jupiter-agents';
    
    // Get A records
    const aRecordsOutput = execSync(
      `az network dns record-set a list -g ${resourceGroup} -z ${zone} --query "[].name" -o json`,
      { encoding: 'utf8' }
    );
    
    const aRecords = JSON.parse(aRecordsOutput);
    
    // Get CNAME records
    const cnameRecordsOutput = execSync(
      `az network dns record-set cname list -g ${resourceGroup} -z ${zone} --query "[].name" -o json`,
      { encoding: 'utf8' }
    );
    
    const cnameRecords = JSON.parse(cnameRecordsOutput);
    
    // Combine and format
    const allRecords = [...aRecords, ...cnameRecords];
    const domains = allRecords
      .filter(name => name !== '@') // Skip root domain
      .map(name => `${name}.${zone}`);
    
    return [...new Set(domains)]; // Remove duplicates
    
  } catch (error) {
    console.error('Failed to fetch domains from Azure:', error);
    // Return some test domains
    return [
      'test.digisquares.in',
      'demo-webapp.digisquares.in'
    ];
  }
}

/**
 * Check HTTPS accessibility
 */
async function checkHTTPS(domain: string): Promise<{
  accessible: boolean;
  error?: string;
}> {
  try {
    const https = require('https');
    
    return new Promise((resolve) => {
      const options = {
        hostname: domain,
        port: 443,
        path: '/',
        method: 'HEAD',
        timeout: 5000,
        rejectUnauthorized: false // Accept self-signed for testing
      };
      
      const req = https.request(options, (res: any) => {
        resolve({ accessible: true });
      });
      
      req.on('error', (error: any) => {
        resolve({ 
          accessible: false, 
          error: error.code || error.message 
        });
      });
      
      req.on('timeout', () => {
        req.destroy();
        resolve({ 
          accessible: false, 
          error: 'Connection timeout' 
        });
      });
      
      req.end();
    });
    
  } catch (error: any) {
    return { 
      accessible: false, 
      error: error.message 
    };
  }
}

/**
 * Show certificate details with OpenSSL
 */
function showCertificateDetails() {
  console.log('\n📝 Manual Certificate Check Commands:\n');
  console.log('# Check certificate details:');
  console.log('openssl s_client -connect domain.com:443 -servername domain.com < /dev/null | openssl x509 -text -noout');
  console.log('\n# Check expiration date:');
  console.log('echo | openssl s_client -connect domain.com:443 -servername domain.com 2>/dev/null | openssl x509 -noout -dates');
  console.log('\n# Test SSL/TLS configuration:');
  console.log('curl -vI https://domain.com');
  console.log('\n# Online SSL test:');
  console.log('https://www.ssllabs.com/ssltest/');
}

// Run check
if (require.main === module) {
  checkSSLStatus()
    .then(() => showCertificateDetails())
    .catch(console.error);
}