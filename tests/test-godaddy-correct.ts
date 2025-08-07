#!/usr/bin/env ts-node
/**
 * Test GoDaddy API with correct endpoints from documentation
 */

import axios from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function testGoDaddyCorrect() {
  console.log('\n🧪 Testing GoDaddy API - Following Official Documentation\n');

  const apiKey = 'AZqVq5z8fD2_FRtXpefVfjg7K4jtGrWRiS';
  const apiSecret = '4d1bNhgezm63jj9SUcgPhF';
  const domain = 'digisquares.com';

  // Create axios instance with correct configuration
  const client = axios.create({
    baseURL: 'https://api.godaddy.com',
    headers: {
      'Authorization': `sso-key ${apiKey}:${apiSecret}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    timeout: 10000
  });

  console.log('📋 Testing API endpoints from official documentation:\n');

  try {
    // Test 1: List domains (from the domains endpoint documentation)
    console.log('1. Testing GET /v1/domains');
    try {
      const domainsResponse = await client.get('/v1/domains', {
        params: {
          limit: 10
        }
      });
      
      console.log('   ✅ SUCCESS - Domains endpoint working!');
      console.log(`   Found ${domainsResponse.data.length} domains`);
      
      if (domainsResponse.data.length > 0) {
        console.log('   Domains:');
        domainsResponse.data.forEach((d: any) => {
          console.log(`     - ${d.domain} (${d.status})`);
        });
      }
    } catch (error: any) {
      console.log(`   ❌ FAILED: ${error.response?.status} ${error.response?.statusText}`);
      if (error.response?.data) {
        console.log(`   Error: ${JSON.stringify(error.response.data)}`);
      }
    }

    // Test 2: Get specific domain
    console.log(`\n2. Testing GET /v1/domains/${domain}`);
    try {
      const domainResponse = await client.get(`/v1/domains/${domain}`);
      
      console.log('   ✅ SUCCESS - Domain endpoint working!');
      console.log(`   Domain: ${domainResponse.data.domain}`);
      console.log(`   Status: ${domainResponse.data.status}`);
      console.log(`   Expires: ${domainResponse.data.expires}`);
      console.log(`   Nameservers: ${domainResponse.data.nameServers?.join(', ')}`);
    } catch (error: any) {
      console.log(`   ❌ FAILED: ${error.response?.status} ${error.response?.statusText}`);
      if (error.response?.data) {
        console.log(`   Error: ${JSON.stringify(error.response.data)}`);
      }
    }

    // Test 3: Get DNS records
    console.log(`\n3. Testing GET /v1/domains/${domain}/records`);
    try {
      const recordsResponse = await client.get(`/v1/domains/${domain}/records`);
      
      console.log('   ✅ SUCCESS - DNS records endpoint working!');
      console.log(`   Found ${recordsResponse.data.length} DNS records`);
      
      // Group by type
      const recordTypes: { [key: string]: number } = {};
      recordsResponse.data.forEach((record: any) => {
        recordTypes[record.type] = (recordTypes[record.type] || 0) + 1;
      });
      
      console.log('   Record types:');
      Object.entries(recordTypes).forEach(([type, count]) => {
        console.log(`     - ${type}: ${count} records`);
      });
    } catch (error: any) {
      console.log(`   ❌ FAILED: ${error.response?.status} ${error.response?.statusText}`);
      if (error.response?.data) {
        console.log(`   Error: ${JSON.stringify(error.response.data)}`);
      }
    }

    // Test 4: Get only A records
    console.log(`\n4. Testing GET /v1/domains/${domain}/records/A`);
    try {
      const aRecordsResponse = await client.get(`/v1/domains/${domain}/records/A`);
      
      console.log('   ✅ SUCCESS - A records endpoint working!');
      console.log(`   Found ${aRecordsResponse.data.length} A records:`);
      
      aRecordsResponse.data.forEach((record: any) => {
        const name = record.name === '@' ? domain : `${record.name}.${domain}`;
        console.log(`     - ${name} → ${record.data} (TTL: ${record.ttl})`);
      });
    } catch (error: any) {
      console.log(`   ❌ FAILED: ${error.response?.status} ${error.response?.statusText}`);
      if (error.response?.data) {
        console.log(`   Error: ${JSON.stringify(error.response.data)}`);
      }
    }

    // Test 5: Create a test A record
    console.log(`\n5. Testing PATCH /v1/domains/${domain}/records (Create A record)`);
    const testSubdomain = `api-test-${Date.now()}`;
    try {
      await client.patch(`/v1/domains/${domain}/records`, [
        {
          type: 'A',
          name: testSubdomain,
          data: '1.2.3.4',
          ttl: 600
        }
      ]);
      
      console.log('   ✅ SUCCESS - DNS record created!');
      console.log(`   Created: ${testSubdomain}.${domain} → 1.2.3.4`);
      
      // Clean up - delete the test record
      console.log('\n6. Cleaning up test record...');
      await client.delete(`/v1/domains/${domain}/records/A/${testSubdomain}`);
      console.log('   ✅ Test record deleted');
      
    } catch (error: any) {
      console.log(`   ❌ FAILED: ${error.response?.status} ${error.response?.statusText}`);
      if (error.response?.data) {
        console.log(`   Error: ${JSON.stringify(error.response.data)}`);
      }
    }

  } catch (error: any) {
    console.error('\n❌ Unexpected error:', error.message);
  }

  // Show the exact headers being used
  console.log('\n📋 Headers being sent:');
  console.log(`   Authorization: sso-key ${apiKey}:${apiSecret}`);
  console.log('   Content-Type: application/json');
  console.log('   Accept: application/json');
  
  console.log('\n💡 If all tests fail with 403:');
  console.log('   1. The API key might be for OTE (test) environment');
  console.log('   2. The API key might have restricted permissions');
  console.log('   3. Try creating a new key at: https://developer.godaddy.com/keys');
  console.log('   4. Make sure to select "Production" environment when creating the key');
}

testGoDaddyCorrect().catch(console.error);