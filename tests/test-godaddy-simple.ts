#!/usr/bin/env ts-node
/**
 * Simple GoDaddy API Test
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import axios from 'axios';

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function testGoDaddyAPI() {
  console.log('\n🧪 Testing GoDaddy API Connection\n');

  const apiKey = process.env.GODADDY_API_KEY;
  const apiSecret = process.env.GODADDY_API_SECRET;
  const domain = 'digisquares.com';

  if (!apiKey || !apiSecret) {
    console.error('❌ Missing API credentials in .env');
    return;
  }

  console.log('📋 Credentials loaded:');
  console.log(`   API Key: ${apiKey.substring(0, 10)}...`);
  console.log(`   Domain: ${domain}\n`);

  try {
    // Test 1: Check domain availability (simple API test)
    console.log('Test 1: Checking API access...');
    
    const client = axios.create({
      baseURL: 'https://api.godaddy.com/v1',
      headers: {
        'Authorization': `sso-key ${apiKey}:${apiSecret}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    // Get domain info
    const response = await client.get(`/domains/${domain}`);
    
    console.log('✅ API connection successful!');
    console.log(`   Domain: ${response.data.domain}`);
    console.log(`   Status: ${response.data.status}`);
    console.log(`   Expires: ${response.data.expires}`);

    // Test 2: List DNS records
    console.log('\nTest 2: Listing DNS records...');
    const recordsResponse = await client.get(`/domains/${domain}/records/A`);
    
    console.log(`✅ Found ${recordsResponse.data.length} A records:`);
    recordsResponse.data.forEach((record: any) => {
      console.log(`   ${record.name === '@' ? domain : record.name + '.' + domain} → ${record.data}`);
    });

    // Test 3: Create test subdomain
    console.log('\nTest 3: Creating test subdomain...');
    const testName = `test-${Date.now()}`;
    
    await client.patch(`/domains/${domain}/records`, [
      {
        type: 'A',
        name: testName,
        data: '52.188.35.8',
        ttl: 600
      }
    ]);

    console.log(`✅ Created: ${testName}.${domain} → 52.188.35.8`);

    // Test 4: Delete test subdomain
    console.log('\nTest 4: Cleaning up...');
    await client.delete(`/domains/${domain}/records/A/${testName}`);
    console.log('✅ Test subdomain deleted');

    console.log('\n✅ All tests passed! GoDaddy API is working correctly.');
    console.log('\nYou can now deploy containers with automatic DNS:');
    console.log('   npm run deploy:digisquares');

  } catch (error: any) {
    console.error('\n❌ API Error:', error.response?.status || error.message);
    
    if (error.response?.data) {
      console.error('Details:', error.response.data);
    }

    if (error.response?.status === 401) {
      console.error('\n🔐 Authentication failed - check your API key and secret');
    } else if (error.response?.status === 403) {
      console.error('\n🚫 Access denied - make sure the API key has access to digisquares.com');
    } else if (error.response?.status === 404) {
      console.error('\n❓ Domain not found - verify digisquares.com is in your GoDaddy account');
    }
  }
}

testGoDaddyAPI().catch(console.error);