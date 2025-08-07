#!/usr/bin/env ts-node

/**
 * Azure App Service Deployment Script for Jupiter AI
 * This script deploys the application to Azure App Service with full configuration
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

// Configuration
const CONFIG = {
  resourceGroup: 'jupiter-agents',
  appServicePlan: 'digisquares-plan',
  appName: 'jupiterapi',
  location: 'eastus',
  customDomain: 'jupiterapi.digisquares.in',
  runtime: 'NODE:18-lts',
  sku: 'B1', // Basic tier, same as azureapi
};

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function log(message: string, color: string = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function execCommand(command: string, silent: boolean = false): string {
  try {
    log(`Executing: ${command}`, colors.cyan);
    const output = execSync(command, { 
      encoding: 'utf8',
      stdio: silent ? 'pipe' : 'inherit' 
    });
    return output.toString();
  } catch (error: any) {
    if (!silent) {
      log(`Error executing command: ${error.message}`, colors.red);
    }
    return '';
  }
}

async function deployToAzure() {
  log('🚀 Starting Jupiter AI deployment to Azure App Service...', colors.green);

  // Step 1: Check Azure CLI
  log('\n📋 Checking Azure CLI...', colors.yellow);
  const azVersion = execCommand('az --version', true);
  if (!azVersion) {
    log('❌ Azure CLI is not installed. Please install it first.', colors.red);
    process.exit(1);
  }
  log('✅ Azure CLI is installed', colors.green);

  // Step 2: Login check
  log('\n🔐 Checking Azure login...', colors.yellow);
  const loginCheck = execCommand('az account show', true);
  if (!loginCheck) {
    log('Logging in to Azure...', colors.yellow);
    execCommand('az login');
  } else {
    log('✅ Already logged in to Azure', colors.green);
  }

  // Step 3: Set subscription
  if (process.env.AZURE_SUBSCRIPTION_ID) {
    log('\n📋 Setting subscription...', colors.yellow);
    execCommand(`az account set --subscription "${process.env.AZURE_SUBSCRIPTION_ID}"`);
  }

  // Step 4: Create/Check Resource Group
  log('\n📦 Setting up Resource Group...', colors.yellow);
  const rgExists = execCommand(`az group show --name ${CONFIG.resourceGroup}`, true);
  if (!rgExists) {
    execCommand(`az group create --name ${CONFIG.resourceGroup} --location ${CONFIG.location}`);
    log('✅ Resource group created', colors.green);
  } else {
    log('✅ Resource group exists', colors.green);
  }

  // Step 5: Create/Check App Service Plan
  log('\n📋 Setting up App Service Plan...', colors.yellow);
  const planExists = execCommand(
    `az appservice plan show --name ${CONFIG.appServicePlan} --resource-group ${CONFIG.resourceGroup}`,
    true
  );
  if (!planExists) {
    execCommand(`
      az appservice plan create \
        --name ${CONFIG.appServicePlan} \
        --resource-group ${CONFIG.resourceGroup} \
        --location ${CONFIG.location} \
        --sku ${CONFIG.sku} \
        --is-linux
    `);
    log('✅ App Service Plan created', colors.green);
  } else {
    log('✅ App Service Plan exists', colors.green);
  }

  // Step 6: Create/Update Web App
  log('\n🌐 Setting up Web App...', colors.yellow);
  const appExists = execCommand(
    `az webapp show --name ${CONFIG.appName} --resource-group ${CONFIG.resourceGroup}`,
    true
  );
  
  if (!appExists) {
    execCommand(`
      az webapp create \
        --resource-group ${CONFIG.resourceGroup} \
        --plan ${CONFIG.appServicePlan} \
        --name ${CONFIG.appName} \
        --runtime "${CONFIG.runtime}" \
        --startup-file "npm start"
    `);
    log('✅ Web App created', colors.green);
  } else {
    log('✅ Web App exists', colors.green);
  }

  // Step 7: Configure App Settings
  log('\n⚙️ Configuring application settings...', colors.yellow);
  
  // Build app settings
  const appSettings = [
    'NODE_ENV=production',
    'PORT=8080',
    'WEBSITE_NODE_DEFAULT_VERSION=~18',
    'SCM_DO_BUILD_DURING_DEPLOYMENT=true',
    'AI_PROVIDER=cosmos',
    'COSMOS_API_URL=https://cosmosapi.digisquares.com',
    'AZURE_API_URL=https://azureapi.digisquares.in',
    `BASE_URL=https://${CONFIG.customDomain}`,
    'ENABLE_ACI_LIFECYCLE=true',
    `JWT_SECRET=${process.env.JWT_SECRET || 'jupiter-ai-secret-2024'}`,
    `DB_HOST=${process.env.DB_HOST}`,
    `DB_PORT=${process.env.DB_PORT}`,
    `DB_USER=${process.env.DB_USER}`,
    `DB_NAME=${process.env.DB_NAME}`,
    `GITHUB_ORG=${process.env.GITHUB_ORG}`,
    `AZURE_SUBSCRIPTION_ID=${process.env.AZURE_SUBSCRIPTION_ID}`,
    `AZURE_RESOURCE_GROUP=${process.env.AZURE_RESOURCE_GROUP}`,
    `AZURE_LOCATION=${process.env.AZURE_LOCATION}`,
  ];

  // Add secrets securely (these should be added manually in Azure Portal)
  log('⚠️ Note: Sensitive settings like DB_PASSWORD, API keys should be added manually in Azure Portal', colors.yellow);

  execCommand(`
    az webapp config appsettings set \
      --resource-group ${CONFIG.resourceGroup} \
      --name ${CONFIG.appName} \
      --settings ${appSettings.join(' ')}
  `);
  log('✅ Application settings configured', colors.green);

  // Step 8: Configure CORS
  log('\n🔒 Configuring CORS...', colors.yellow);
  execCommand(`
    az webapp cors add \
      --resource-group ${CONFIG.resourceGroup} \
      --name ${CONFIG.appName} \
      --allowed-origins \
        https://jupiterapi.digisquares.in \
        https://jupiter-chat.digisquares.in \
        https://cosmosapi.digisquares.com \
        https://azureapi.digisquares.in \
        http://localhost:3000 \
        http://localhost:5000
  `);
  log('✅ CORS configured', colors.green);

  // Step 9: Add custom domain
  log('\n🌍 Adding custom domain...', colors.yellow);
  const domainAdded = execCommand(
    `az webapp config hostname add \
      --webapp-name ${CONFIG.appName} \
      --resource-group ${CONFIG.resourceGroup} \
      --hostname ${CONFIG.customDomain}`,
    true
  );
  if (domainAdded) {
    log('✅ Custom domain added', colors.green);
  } else {
    log('ℹ️ Custom domain might already be configured', colors.yellow);
  }

  // Step 10: Configure deployment
  log('\n🔧 Configuring deployment...', colors.yellow);
  const deploymentUrl = execCommand(`
    az webapp deployment source config-local-git \
      --name ${CONFIG.appName} \
      --resource-group ${CONFIG.resourceGroup} \
      --query url -o tsv
  `, true).trim();

  // Step 11: Build the application
  log('\n🔨 Building application...', colors.yellow);
  execCommand('npm run build');
  log('✅ Application built', colors.green);

  // Step 12: Create deployment package
  log('\n📦 Creating deployment package...', colors.yellow);
  const deployFiles = [
    'dist',
    'package.json',
    'package-lock.json',
    'web.config',
    '.deployment',
    'deploy.cmd'
  ];

  // Ensure all required files exist
  for (const file of deployFiles) {
    const filePath = path.join(__dirname, '..', file);
    if (!fs.existsSync(filePath)) {
      log(`⚠️ Warning: ${file} does not exist`, colors.yellow);
    }
  }

  // Summary
  log('\n' + '='.repeat(60), colors.cyan);
  log('✅ DEPLOYMENT CONFIGURATION COMPLETE!', colors.green + colors.bright);
  log('='.repeat(60), colors.cyan);
  
  log('\n📋 Configuration Summary:', colors.yellow);
  log(`   Resource Group: ${CONFIG.resourceGroup}`, colors.cyan);
  log(`   App Service Plan: ${CONFIG.appServicePlan}`, colors.cyan);
  log(`   Web App Name: ${CONFIG.appName}`, colors.cyan);
  log(`   Custom Domain: ${CONFIG.customDomain}`, colors.cyan);
  log(`   Location: ${CONFIG.location}`, colors.cyan);
  
  log('\n🔗 URLs:', colors.yellow);
  log(`   Azure URL: https://${CONFIG.appName}.azurewebsites.net`, colors.cyan);
  log(`   Custom Domain: https://${CONFIG.customDomain}`, colors.cyan);
  if (deploymentUrl) {
    log(`   Git Deployment URL: ${deploymentUrl}`, colors.cyan);
  }

  log('\n📝 Next Steps:', colors.yellow);
  log('1. Add sensitive environment variables in Azure Portal:', colors.white);
  log('   - DB_PASSWORD', colors.white);
  log('   - GITHUB_TOKEN', colors.white);
  log('   - AZURE_CLIENT_SECRET', colors.white);
  log('   - COSMOS_API_KEY', colors.white);
  log('   - AZURE_API_KEY', colors.white);
  
  log('\n2. Configure DNS (if not already done):', colors.white);
  log(`   Add CNAME record: ${CONFIG.customDomain} -> ${CONFIG.appName}.azurewebsites.net`, colors.white);
  
  log('\n3. Deploy code using Git:', colors.white);
  if (deploymentUrl) {
    log(`   git remote add azure ${deploymentUrl}`, colors.white);
  }
  log('   git push azure main', colors.white);
  
  log('\n4. Configure SSL certificate in Azure Portal', colors.white);
  
  log('\n5. Test the deployment:', colors.white);
  log(`   curl https://${CONFIG.appName}.azurewebsites.net/health`, colors.white);
  log(`   curl https://${CONFIG.customDomain}/health`, colors.white);
  
  log('\n✨ Deployment script completed successfully!', colors.green + colors.bright);
}

// Run the deployment
deployToAzure().catch((error) => {
  log(`\n❌ Deployment failed: ${error.message}`, colors.red);
  process.exit(1);
});