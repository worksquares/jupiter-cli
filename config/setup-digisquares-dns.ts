#!/usr/bin/env ts-node
/**
 * Quick Setup for digisquares.com DNS Integration
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '../.env') });

// Add GoDaddy configuration for digisquares.com
const godaddyConfig = `
# GoDaddy DNS Configuration for digisquares.com
GODADDY_DOMAIN=digisquares.com
GODADDY_ENVIRONMENT=production
`;

const envPath = path.join(__dirname, '../.env');
let envContent = fs.readFileSync(envPath, 'utf8');

// Check if GoDaddy API credentials exist
if (!envContent.includes('GODADDY_API_KEY')) {
  console.log('⚠️  GoDaddy API credentials not found in .env');
  console.log('\nTo complete setup, add these to your .env file:');
  console.log('GODADDY_API_KEY=your-api-key');
  console.log('GODADDY_API_SECRET=your-api-secret');
  console.log('\nGet your API credentials from: https://developer.godaddy.com/keys');
} else {
  console.log('✅ GoDaddy API credentials found');
}

// Update domain configuration
if (envContent.includes('GODADDY_DOMAIN=')) {
  envContent = envContent.replace(/GODADDY_DOMAIN=.*/, 'GODADDY_DOMAIN=digisquares.com');
} else {
  envContent += godaddyConfig;
}

fs.writeFileSync(envPath, envContent);

console.log('\n✅ Updated configuration for digisquares.com');
console.log('\nYour containers will be accessible at:');
console.log('   → {user}-{project}.app.digisquares.com');
console.log('   → {user}-{project}.dev.digisquares.com');
console.log('   → {user}-{project}.test.digisquares.com');

// Create DNS configuration
const dnsConfig = {
  domain: 'digisquares.com',
  environment: 'production',
  subdomainStrategy: {
    patterns: {
      production: '{userId}-{projectId}.app',
      development: '{userId}-{projectId}.dev',
      testing: '{userId}-{projectId}.test'
    },
    defaults: {
      prefix: 'app',
      ttl: 300
    }
  },
  wildcard: {
    enabled: true,
    subdomains: ['dev', 'test', 'demo']
  },
  ssl: {
    enabled: false,
    provider: 'letsencrypt',
    email: 'admin@digisquares.com'
  },
  cleanup: {
    enabled: true,
    retentionHours: 24,
    checkIntervalMinutes: 60
  }
};

const configPath = path.join(__dirname, 'digisquares-dns-config.json');
fs.writeFileSync(configPath, JSON.stringify(dnsConfig, null, 2));

console.log('\n✅ Created digisquares-dns-config.json');
console.log('\nNext steps:');
console.log('1. Make sure to add your GoDaddy API credentials to .env');
console.log('2. Run: npm run setup:dns');
console.log('3. Deploy a test container: npm run example:aci-dns');