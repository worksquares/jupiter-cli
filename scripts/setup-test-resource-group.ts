#!/usr/bin/env ts-node
/**
 * Setup Azure Test Resource Group
 * Creates a dedicated resource group for testing purposes
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';

// Load environment
dotenv.config({ path: path.join(__dirname, '../.env') });

const TEST_RESOURCE_GROUP = 'resource-test-agents';
const LOCATION = process.env.AZURE_LOCATION || 'eastus';
const SUBSCRIPTION_ID = process.env.AZURE_SUBSCRIPTION_ID;

interface ResourceGroupTags {
  purpose: string;
  environment: string;
  'created-by': string;
  'created-date': string;
  'auto-delete': string;
}

async function createTestResourceGroup() {
  console.log('\n🚀 Azure Test Resource Group Setup\n');
  console.log('═'.repeat(60));
  console.log(`Resource Group: ${TEST_RESOURCE_GROUP}`);
  console.log(`Location: ${LOCATION}`);
  console.log(`Subscription: ${SUBSCRIPTION_ID}`);
  console.log('═'.repeat(60));

  if (!SUBSCRIPTION_ID) {
    console.error('❌ Missing AZURE_SUBSCRIPTION_ID in environment');
    process.exit(1);
  }

  try {
    // Step 1: Check if resource group already exists
    console.log('\n📋 Checking if resource group exists...');
    try {
      const checkResult = execSync(
        `az group show --name ${TEST_RESOURCE_GROUP} --subscription ${SUBSCRIPTION_ID}`,
        { encoding: 'utf8', stdio: 'pipe' }
      );
      
      console.log('⚠️  Resource group already exists');
      const existingRg = JSON.parse(checkResult);
      console.log(`   Location: ${existingRg.location}`);
      console.log(`   ID: ${existingRg.id}`);
      
    } catch (error) {
      // Resource group doesn't exist, create it
      console.log('✅ Resource group does not exist, creating...');
      
      // Step 2: Create resource group with tags
      const tags: ResourceGroupTags = {
        purpose: 'testing',
        environment: 'test',
        'created-by': 'intelligent-agent-system',
        'created-date': new Date().toISOString().split('T')[0],
        'auto-delete': 'true'
      };

      const tagsString = Object.entries(tags)
        .map(([key, value]) => `${key}=${value}`)
        .join(' ');

      console.log('\n🔨 Creating resource group...');
      const createResult = execSync(
        `az group create --name ${TEST_RESOURCE_GROUP} --location ${LOCATION} --subscription ${SUBSCRIPTION_ID} --tags ${tagsString}`,
        { encoding: 'utf8', stdio: 'pipe' }
      );

      const createdRg = JSON.parse(createResult);
      console.log('✅ Resource group created successfully!');
      console.log(`   ID: ${createdRg.id}`);
      console.log(`   Location: ${createdRg.location}`);
      console.log(`   Tags:`, createdRg.tags);
    }

    // Step 3: Set up role assignments for the service principal
    console.log('\n🔐 Setting up permissions...');
    
    const clientId = process.env.AZURE_CLIENT_ID;
    if (clientId) {
      try {
        // Assign Contributor role to the service principal
        console.log('   Assigning Contributor role to service principal...');
        execSync(
          `az role assignment create --assignee ${clientId} --role Contributor --resource-group ${TEST_RESOURCE_GROUP} --subscription ${SUBSCRIPTION_ID}`,
          { stdio: 'pipe' }
        );
        console.log('   ✅ Contributor role assigned');
      } catch (error) {
        console.log('   ⚠️  Role assignment may already exist');
      }
    }

    // Step 4: Create test environment file
    console.log('\n📄 Creating test environment configuration...');
    
    const testEnvPath = path.join(__dirname, '../.env.test');
    const envContent = fs.readFileSync(path.join(__dirname, '../.env'), 'utf8');
    
    // Update resource group in test env
    const testEnvContent = envContent.replace(
      /AZURE_RESOURCE_GROUP=.*/,
      `AZURE_RESOURCE_GROUP=${TEST_RESOURCE_GROUP}`
    );
    
    // Add test environment marker
    const finalTestEnv = testEnvContent + '\n# Test Environment\nIS_TEST_ENVIRONMENT=true\n';
    
    fs.writeFileSync(testEnvPath, finalTestEnv);
    console.log('   ✅ Created .env.test with test resource group');

    // Step 5: Create test configuration file
    const testConfig = {
      resourceGroup: TEST_RESOURCE_GROUP,
      location: LOCATION,
      subscriptionId: SUBSCRIPTION_ID,
      tags: {
        purpose: 'testing',
        environment: 'test',
        'auto-cleanup': true
      },
      namingConvention: {
        prefix: 'test',
        includeTimestamp: true,
        maxLength: 63
      },
      cleanup: {
        enabled: true,
        retentionHours: 24,
        excludePatterns: ['prod-*', 'staging-*']
      }
    };

    const configPath = path.join(__dirname, '../config/test-azure-config.json');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(testConfig, null, 2));
    console.log('   ✅ Created test configuration file');

    // Step 6: Verify setup
    console.log('\n🔍 Verifying setup...');
    
    const verifyResult = execSync(
      `az group show --name ${TEST_RESOURCE_GROUP} --query "{name:name, location:location, provisioningState:properties.provisioningState}" --output json`,
      { encoding: 'utf8' }
    );
    
    const verification = JSON.parse(verifyResult);
    console.log('   ✅ Resource group verified:');
    console.log(`      Name: ${verification.name}`);
    console.log(`      Location: ${verification.location}`);
    console.log(`      State: ${verification.provisioningState}`);

    // Step 7: Summary
    console.log('\n' + '═'.repeat(60));
    console.log('✅ Test Resource Group Setup Complete!');
    console.log('═'.repeat(60));
    console.log('\n📋 Summary:');
    console.log(`   Resource Group: ${TEST_RESOURCE_GROUP}`);
    console.log(`   Location: ${LOCATION}`);
    console.log(`   Purpose: Exclusive testing environment`);
    console.log(`   Config Files:`);
    console.log(`      - .env.test (environment variables)`);
    console.log(`      - config/test-azure-config.json (test configuration)`);
    
    console.log('\n🚀 Next Steps:');
    console.log('1. Use .env.test for running tests:');
    console.log('   dotenv -e .env.test npm test');
    console.log('\n2. Or set environment variable:');
    console.log(`   export AZURE_RESOURCE_GROUP=${TEST_RESOURCE_GROUP}`);
    console.log('\n3. All test containers will now be created in the test resource group');
    console.log('   keeping production resources separate and safe.');

    // Step 8: Create helper script
    const helperScript = `#!/bin/bash
# Test Environment Helper Script

# Load test environment
export $(cat .env.test | grep -v '^#' | xargs)

echo "🧪 Test environment loaded!"
echo "   Resource Group: $AZURE_RESOURCE_GROUP"
echo "   Location: $AZURE_LOCATION"

# Run tests with test environment
if [ "$1" = "test" ]; then
    npm test
elif [ "$1" = "cleanup" ]; then
    echo "Cleaning up test resources..."
    az container list --resource-group ${TEST_RESOURCE_GROUP} --query "[].name" -o tsv | xargs -I {} az container delete --resource-group ${TEST_RESOURCE_GROUP} --name {} --yes
else
    echo "Usage: ./test-env.sh [test|cleanup]"
fi
`;

    fs.writeFileSync(path.join(__dirname, '../test-env.sh'), helperScript);
    fs.chmodSync(path.join(__dirname, '../test-env.sh'), '755');
    console.log('\n   ✅ Created test-env.sh helper script');

  } catch (error: any) {
    console.error('\n❌ Setup failed:', error.message);
    if (error.stderr) {
      console.error('Error details:', error.stderr.toString());
    }
    process.exit(1);
  }
}

// Run setup
if (require.main === module) {
  createTestResourceGroup().catch(console.error);
}

export { createTestResourceGroup, TEST_RESOURCE_GROUP };