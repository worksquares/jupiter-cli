#!/usr/bin/env ts-node
/**
 * Test GoDaddy OTE (Test Environment) API
 */

import axios from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function testGoDaddyOTE() {
  console.log('\n🧪 Testing GoDaddy API - Both Environments\n');

  const apiKey = process.env.GODADDY_API_KEY;
  const apiSecret = process.env.GODADDY_API_SECRET;

  if (!apiKey || !apiSecret) {
    console.error('❌ Missing API credentials');
    return;
  }

  // Test both environments
  const environments = [
    { name: 'Production', url: 'https://api.godaddy.com/v1' },
    { name: 'OTE/Test', url: 'https://api.ote-godaddy.com/v1' }
  ];

  for (const env of environments) {
    console.log(`\n📋 Testing ${env.name} Environment:`);
    console.log(`   URL: ${env.url}`);

    try {
      const client = axios.create({
        baseURL: env.url,
        headers: {
          'Authorization': `sso-key ${apiKey}:${apiSecret}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      // Test 1: List available domains
      console.log('\n   Test 1: Checking domains...');
      const domainsResponse = await client.get('/domains?limit=5');
      
      console.log(`   ✅ API Access OK - Found ${domainsResponse.data.length} domains`);
      
      if (domainsResponse.data.length > 0) {
        console.log('   Domains:');
        domainsResponse.data.forEach((d: any) => {
          console.log(`     - ${d.domain} (${d.status})`);
        });
      }

      // Check if digisquares.com exists
      const hasDigisquares = domainsResponse.data.some((d: any) => d.domain === 'digisquares.com');
      if (hasDigisquares) {
        console.log('\n   ✅ digisquares.com found in this environment!');
        
        // Get domain details
        const domainResponse = await client.get('/domains/digisquares.com');
        console.log('   Domain details:');
        console.log(`     Status: ${domainResponse.data.status}`);
        console.log(`     Expires: ${domainResponse.data.expires}`);
        console.log(`     Nameservers: ${domainResponse.data.nameServers?.join(', ')}`);
      } else {
        console.log('\n   ⚠️  digisquares.com not found in this environment');
      }

    } catch (error: any) {
      console.log(`   ❌ ${env.name} Error: ${error.response?.status || error.message}`);
      
      if (error.response?.data) {
        console.log(`   Details: ${JSON.stringify(error.response.data)}`);
      }
    }
  }

  console.log('\n\n📝 Notes:');
  console.log('- If your API key works in OTE but not Production, it\'s a test key');
  console.log('- If digisquares.com is not found, check which GoDaddy account owns it');
  console.log('- Production API keys only work with domains in the same account');
}

testGoDaddyOTE().catch(console.error);