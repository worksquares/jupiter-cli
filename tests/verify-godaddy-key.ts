#!/usr/bin/env ts-node
/**
 * Verify GoDaddy API Key Permissions
 */

import axios from 'axios';

async function verifyGoDaddyKey() {
  console.log('\n🔍 Verifying GoDaddy API Key\n');

  const apiKey = 'AZqVq5z8fD2_FRtXpefVfjg7K4jtGrWRiS';
  const apiSecret = '4d1bNhgezm63jj9SUcgPhF';

  const client = axios.create({
    baseURL: 'https://api.godaddy.com/v1',
    headers: {
      'Authorization': `sso-key ${apiKey}:${apiSecret}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    }
  });

  console.log('📋 Testing different API scopes:\n');

  // Test endpoints that might have different permission requirements
  const tests = [
    {
      name: 'Get API version',
      method: 'GET',
      path: '/',
      description: 'Basic API access'
    },
    {
      name: 'List domains (with status filter)',
      method: 'GET', 
      path: '/domains?statuses=ACTIVE',
      description: 'Domain read with filter'
    },
    {
      name: 'Check specific domain',
      method: 'GET',
      path: '/domains/digisquares.com',
      description: 'Direct domain access'
    },
    {
      name: 'Get domain records',
      method: 'GET',
      path: '/domains/digisquares.com/records',
      description: 'DNS records read'
    },
    {
      name: 'Get A records only',
      method: 'GET',
      path: '/domains/digisquares.com/records/A',
      description: 'Specific record type'
    },
    {
      name: 'Domain availability check',
      method: 'GET',
      path: '/domains/available?domain=testdomain12345.com&checkType=FAST&forTransfer=false',
      description: 'Public endpoint test'
    }
  ];

  let hasAccess = false;

  for (const test of tests) {
    try {
      console.log(`Testing: ${test.name}`);
      console.log(`  ${test.method} ${test.path}`);
      
      const response = await client.request({
        method: test.method,
        url: test.path
      });

      console.log(`  ✅ SUCCESS - Status: ${response.status}`);
      console.log(`  Description: ${test.description}`);
      
      // Show some response data
      if (test.path.includes('domains') && Array.isArray(response.data)) {
        console.log(`  Found ${response.data.length} items`);
      } else if (response.data.domain) {
        console.log(`  Domain: ${response.data.domain}`);
      }
      
      hasAccess = true;
      console.log('');
      
    } catch (error: any) {
      console.log(`  ❌ FAILED - Status: ${error.response?.status}`);
      console.log(`  Error: ${error.response?.data?.message || error.message}`);
      console.log('');
    }
  }

  if (!hasAccess) {
    console.log('\n⚠️  API Key Issues Detected:\n');
    console.log('Possible causes:');
    console.log('1. This might be an OTE (test environment) key being used on production API');
    console.log('2. The key might have limited scopes/permissions');
    console.log('3. The key might be from a sub-account without domain access');
    console.log('\nTo fix:');
    console.log('1. Log into GoDaddy with the PRIMARY account (not delegated access)');
    console.log('2. Go to: https://developer.godaddy.com/keys');
    console.log('3. Delete existing keys and create a new PRODUCTION key');
    console.log('4. Make sure to select "Production" not "OTE" environment');
  } else {
    console.log('\n✅ API Key is working! You have access to some endpoints.');
  }

  // Test with curl command for comparison
  console.log('\n📋 Test with curl to verify:');
  console.log('```bash');
  console.log(`curl -X GET "https://api.godaddy.com/v1/domains" \\`);
  console.log(`  -H "Authorization: sso-key ${apiKey}:${apiSecret}" \\`);
  console.log(`  -H "Accept: application/json" -v`);
  console.log('```');
}

verifyGoDaddyKey().catch(console.error);