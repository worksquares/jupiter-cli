#!/usr/bin/env ts-node
/**
 * Basic GoDaddy API Test - Direct Request
 */

import axios from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function testBasicGoDaddy() {
  console.log('\n🧪 Testing GoDaddy API - Basic Request\n');

  const apiKey = 'AZqVq5z8fD2_FRtXpefVfjg7K4jtGrWRiS';
  const apiSecret = '4d1bNhgezm63jj9SUcgPhF';

  console.log('Using credentials:');
  console.log(`Key: ${apiKey}`);
  console.log(`Secret: ${apiSecret}\n`);

  // Test different authorization formats
  const authFormats = [
    {
      name: 'sso-key format',
      header: `sso-key ${apiKey}:${apiSecret}`
    },
    {
      name: 'Bearer format',
      header: `Bearer ${apiKey}:${apiSecret}`
    },
    {
      name: 'Basic auth format',
      header: 'Basic ' + Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')
    }
  ];

  for (const auth of authFormats) {
    console.log(`\nTesting ${auth.name}...`);
    
    try {
      const response = await axios.get('https://api.godaddy.com/v1/domains', {
        headers: {
          'Authorization': auth.header,
          'Accept': 'application/json'
        },
        timeout: 10000
      });

      console.log(`✅ ${auth.name} WORKS!`);
      console.log(`   Status: ${response.status}`);
      console.log(`   Found ${response.data.length} domains`);
      
      // List domains
      if (response.data.length > 0) {
        console.log('   Domains:');
        response.data.forEach((domain: any) => {
          console.log(`     - ${domain.domain} (${domain.status})`);
        });
      }
      
      return; // Success, stop trying other formats
      
    } catch (error: any) {
      console.log(`❌ ${auth.name} failed: ${error.response?.status || error.message}`);
      if (error.response?.data) {
        console.log(`   Error: ${JSON.stringify(error.response.data)}`);
      }
    }
  }

  // If all formats failed, try a simple test
  console.log('\n\nTrying direct curl equivalent...');
  console.log('Run this command to test:');
  console.log(`curl -X GET "https://api.godaddy.com/v1/domains" \\`);
  console.log(`  -H "Authorization: sso-key ${apiKey}:${apiSecret}" \\`);
  console.log(`  -H "Accept: application/json"`);
}

testBasicGoDaddy().catch(console.error);