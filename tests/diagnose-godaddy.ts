#!/usr/bin/env ts-node
/**
 * GoDaddy API Diagnostic Tool
 */

import axios from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function diagnoseGoDaddy() {
  console.log('\n🔍 GoDaddy API Diagnostic Tool\n');
  console.log('═'.repeat(60));

  const apiKey = process.env.GODADDY_API_KEY;
  const apiSecret = process.env.GODADDY_API_SECRET;

  console.log('📋 Configuration Check:');
  console.log(`   API Key: ${apiKey ? apiKey.substring(0, 15) + '...' : 'NOT SET'}`);
  console.log(`   API Secret: ${apiSecret ? '***' + apiSecret.substring(apiSecret.length - 4) : 'NOT SET'}`);
  console.log(`   Key Length: ${apiKey?.length || 0} chars`);
  console.log(`   Secret Length: ${apiSecret?.length || 0} chars`);

  if (!apiKey || !apiSecret) {
    console.error('\n❌ API credentials missing!');
    return;
  }

  // Check key format
  console.log('\n📋 Key Format Check:');
  if (apiKey.includes('_')) {
    console.log('   ✅ Key format looks correct (contains underscore)');
  } else {
    console.log('   ⚠️  Key format might be incorrect');
  }

  // Test basic auth
  console.log('\n📋 Testing Authentication:');
  
  try {
    // Test with a simple endpoint that should work with any valid key
    const response = await axios.get('https://api.godaddy.com/v1/abuse/tickets', {
      headers: {
        'Authorization': `sso-key ${apiKey}:${apiSecret}`,
        'Accept': 'application/json'
      },
      timeout: 10000
    });

    console.log('   ✅ Authentication successful!');
    console.log(`   Response status: ${response.status}`);

  } catch (error: any) {
    console.log('   ❌ Authentication failed');
    console.log(`   Status: ${error.response?.status}`);
    console.log(`   Message: ${error.response?.data?.message || error.message}`);

    if (error.response?.status === 401) {
      console.log('\n🔐 Diagnosis: Invalid API credentials');
      console.log('   - Double-check your API key and secret');
      console.log('   - Make sure you copied them correctly');
      console.log('   - Ensure they are from the Production environment');
    } else if (error.response?.status === 403) {
      console.log('\n🚫 Diagnosis: Access denied');
      console.log('   - The API key is valid but lacks permissions');
      console.log('   - This key may not have access to domain management');
    }
  }

  // Instructions for getting correct credentials
  console.log('\n📝 To get correct API credentials:');
  console.log('1. Go to: https://developer.godaddy.com/keys');
  console.log('2. Sign in with the GoDaddy account that owns digisquares.com');
  console.log('3. Create a new "Production" key (not OTE/Test)');
  console.log('4. Copy both the Key and Secret');
  console.log('5. Update your .env file');

  console.log('\n💡 Common Issues:');
  console.log('- Using OTE/Test keys instead of Production keys');
  console.log('- API key from different account than domain owner');
  console.log('- Copying key incorrectly (missing characters)');
  console.log('- Using expired or revoked keys');

  // Alternative approach
  console.log('\n🔄 Alternative Approach:');
  console.log('If API access continues to fail, you can:');
  console.log('1. Manually create DNS records in GoDaddy dashboard');
  console.log('2. Use GoDaddy\'s DNS management UI');
  console.log('3. Set up a CNAME record pointing to Azure Container Instance FQDN');
  
  console.log('\nExample manual setup:');
  console.log('   Type: A');
  console.log('   Name: app');
  console.log('   Value: [Your Azure Container IP]');
  console.log('   TTL: 600');
}

diagnoseGoDaddy().catch(console.error);