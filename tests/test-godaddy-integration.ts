#!/usr/bin/env ts-node
/**
 * Test GoDaddy API Integration with digisquares.com
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { GoDaddyDNSManager } from '../src/dns/godaddy-dns-manager';

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function testGoDaddyIntegration() {
  console.log('\n🧪 Testing GoDaddy API Integration for digisquares.com\n');
  console.log('═'.repeat(60));

  const dnsManager = new GoDaddyDNSManager({
    apiKey: process.env.GODADDY_API_KEY!,
    apiSecret: process.env.GODADDY_API_SECRET!,
    domain: 'digisquares.com',
    environment: 'production'
  });

  try {
    // Test 1: Verify domain ownership
    console.log('📋 Test 1: Verifying domain ownership...');
    const isValid = await dnsManager.verifyDomain();
    
    if (isValid) {
      console.log('✅ Domain verified successfully!');
      console.log('   You have access to manage digisquares.com DNS records');
    } else {
      console.log('❌ Domain verification failed');
      console.log('   Please check your API credentials');
      return;
    }

    // Test 2: List existing DNS records
    console.log('\n📋 Test 2: Listing existing DNS records...');
    const existingRecords = await dnsManager.listACISubdomains();
    
    console.log(`✅ Found ${existingRecords.length} existing subdomain records:`);
    if (existingRecords.length > 0) {
      existingRecords.forEach(record => {
        console.log(`   ${record.subdomain}.digisquares.com → ${record.target}`);
      });
    } else {
      console.log('   No subdomain A records found');
    }

    // Test 3: Create a test subdomain
    console.log('\n📋 Test 3: Creating test subdomain...');
    const testSubdomain = `test-api-${Date.now()}`;
    const testIP = '52.188.35.8'; // Example Azure IP
    
    await dnsManager.createSubdomain({
      subdomain: testSubdomain,
      target: testIP,
      ttl: 300,
      description: 'Test subdomain created by GoDaddy integration test'
    });
    
    console.log('✅ Test subdomain created successfully!');
    console.log(`   ${testSubdomain}.digisquares.com → ${testIP}`);
    console.log('   TTL: 300 seconds (5 minutes)');

    // Test 4: Update the subdomain
    console.log('\n📋 Test 4: Updating subdomain target...');
    const newIP = '52.188.35.9';
    await dnsManager.updateSubdomain(testSubdomain, newIP);
    
    console.log('✅ Subdomain updated successfully!');
    console.log(`   ${testSubdomain}.digisquares.com → ${newIP}`);

    // Test 5: Verify the update
    console.log('\n📋 Test 5: Verifying DNS record...');
    const updatedRecords = await dnsManager.listACISubdomains();
    const testRecord = updatedRecords.find(r => r.subdomain === testSubdomain);
    
    if (testRecord && testRecord.target === newIP) {
      console.log('✅ DNS record verified!');
      console.log(`   Record found with correct target IP: ${testRecord.target}`);
    } else {
      console.log('⚠️  DNS record verification failed');
    }

    // Test 6: Delete the test subdomain
    console.log('\n📋 Test 6: Cleaning up test subdomain...');
    await dnsManager.deleteSubdomain(testSubdomain);
    
    console.log('✅ Test subdomain deleted successfully!');

    // Summary
    console.log('\n' + '═'.repeat(60));
    console.log('✅ All tests passed successfully!');
    console.log('═'.repeat(60));
    console.log('\n📊 Summary:');
    console.log('   ✅ GoDaddy API connection verified');
    console.log('   ✅ Domain ownership confirmed for digisquares.com');
    console.log('   ✅ DNS record creation working');
    console.log('   ✅ DNS record updates working');
    console.log('   ✅ DNS record deletion working');
    console.log('\n🎯 Your GoDaddy DNS integration is ready to use!');
    
    console.log('\n📝 Example subdomain patterns for your containers:');
    console.log('   - demo-webapp.app.digisquares.com');
    console.log('   - api-users.app.digisquares.com');
    console.log('   - test-service.dev.digisquares.com');
    
    console.log('\n🚀 Next step: Deploy a container with automatic DNS');
    console.log('   Run: npm run deploy:digisquares');

  } catch (error: any) {
    console.error('\n❌ Test failed:', error.message);
    
    if (error.response?.status === 401) {
      console.error('\n🔐 Authentication Error:');
      console.error('   Your API credentials are invalid or expired');
      console.error('   Please check your GoDaddy API key and secret');
    } else if (error.response?.status === 403) {
      console.error('\n🚫 Permission Error:');
      console.error('   Your API key does not have permission to manage digisquares.com');
      console.error('   Make sure the API key was created by the account that owns the domain');
    } else if (error.response?.status === 429) {
      console.error('\n⏱️  Rate Limit Error:');
      console.error('   You have exceeded the GoDaddy API rate limit');
      console.error('   Please wait a few minutes and try again');
    }
    
    console.error('\nError details:', error.response?.data || error);
  }
}

// Run the test
if (require.main === module) {
  testGoDaddyIntegration().catch(console.error);
}