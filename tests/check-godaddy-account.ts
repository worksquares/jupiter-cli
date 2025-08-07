#!/usr/bin/env ts-node
/**
 * Check GoDaddy Account and Permissions
 */

import axios from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function checkGoDaddyAccount() {
  console.log('\n🔍 Checking GoDaddy Account Details\n');

  const apiKey = process.env.GODADDY_API_KEY!;
  const apiSecret = process.env.GODADDY_API_SECRET!;

  const client = axios.create({
    baseURL: 'https://api.godaddy.com/v1',
    headers: {
      'Authorization': `sso-key ${apiKey}:${apiSecret}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    }
  });

  try {
    // Check 1: Get shopper info (account details)
    console.log('📋 Checking account access...');
    try {
      const shopperResponse = await client.get('/shoppers/@self');
      console.log('✅ Account access confirmed');
      console.log(`   Shopper ID: ${shopperResponse.data.shopperId}`);
      console.log(`   Customer ID: ${shopperResponse.data.customerId}`);
    } catch (error: any) {
      console.log('❌ Cannot access account info');
    }

    // Check 2: List agreements (what the key can access)
    console.log('\n📋 Checking API agreements...');
    try {
      const agreementsResponse = await client.get('/agreements');
      console.log(`✅ Found ${agreementsResponse.data.length} agreements`);
    } catch (error) {
      console.log('❌ Cannot access agreements');
    }

    // Check 3: Try different domain endpoints
    console.log('\n📋 Testing domain endpoints...');
    
    const endpoints = [
      { path: '/domains', name: 'List all domains' },
      { path: '/domains/available?domain=test12345.com', name: 'Check domain availability' },
      { path: '/domains/digisquares.com', name: 'Access digisquares.com' },
      { path: '/domains/digisquares.com/records', name: 'Access DNS records' }
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await client.get(endpoint.path);
        console.log(`✅ ${endpoint.name}: SUCCESS`);
        
        if (endpoint.path === '/domains' && Array.isArray(response.data)) {
          console.log(`   Found ${response.data.length} domains`);
          response.data.slice(0, 3).forEach((d: any) => {
            console.log(`   - ${d.domain}`);
          });
        }
      } catch (error: any) {
        console.log(`❌ ${endpoint.name}: ${error.response?.status} ${error.response?.data?.code || error.message}`);
      }
    }

    // Check 4: Try to create a test TXT record (less intrusive than A record)
    console.log('\n📋 Testing DNS write permissions...');
    const testTxtName = `_test-${Date.now()}`;
    
    try {
      await client.patch('/domains/digisquares.com/records', [
        {
          type: 'TXT',
          name: testTxtName,
          data: 'DNS write test',
          ttl: 600
        }
      ]);
      console.log('✅ DNS write permissions confirmed');
      
      // Clean up
      await client.delete(`/domains/digisquares.com/records/TXT/${testTxtName}`);
      console.log('✅ Cleanup successful');
      
    } catch (error: any) {
      console.log(`❌ Cannot write DNS records: ${error.response?.status}`);
    }

  } catch (error: any) {
    console.error('\n❌ General error:', error.message);
  }

  // Recommendations
  console.log('\n💡 Recommendations:');
  console.log('If you see 403 errors above, the API key needs to be created from');
  console.log('the account that owns digisquares.com.');
  console.log('\nTo verify domain ownership:');
  console.log('1. Log into GoDaddy.com');
  console.log('2. Go to "My Products"');
  console.log('3. Check if digisquares.com is listed');
  console.log('4. If yes, create API key from that account');
}

checkGoDaddyAccount().catch(console.error);