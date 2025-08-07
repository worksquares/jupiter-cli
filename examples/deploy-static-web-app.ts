#!/usr/bin/env ts-node
/**
 * Deploy Static Web App with Custom Domain
 * Simple example for Azure Static Web Apps deployment
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { StaticWebAppDNSManager } from '../src/dns/static-web-apps-dns';

dotenv.config({ path: path.join(__dirname, '../.env') });

async function deployStaticWebApp() {
  console.log('\n🚀 Deploying Static Web App with Custom Domain\n');
  console.log('═'.repeat(60));

  const manager = new StaticWebAppDNSManager({
    subscriptionId: process.env.AZURE_SUBSCRIPTION_ID!,
    resourceGroup: process.env.AZURE_RESOURCE_GROUP!,
    dnsZone: process.env.AZURE_DNS_ZONE || 'digisquares.in',
    dnsResourceGroup: process.env.AZURE_DNS_RESOURCE_GROUP
  });

  try {
    // Deploy a sample React app
    const deployment = await manager.deployWithCustomDomain(
      {
        name: 'my-portfolio-site',
        repositoryUrl: 'https://github.com/Azure-Samples/my-first-static-web-app',
        branch: 'main',
        appLocation: '/',
        apiLocation: 'api',
        outputLocation: 'build'
      },
      {
        subdomain: 'portfolio',
        environment: 'production',
        autoRenewSSL: true
      }
    );

    console.log('\n✅ Static Web App Deployed Successfully!\n');
    console.log('📋 Deployment Details:');
    console.log(`   App Name: my-portfolio-site`);
    console.log(`   Custom Domain: https://${deployment.domain}`);
    console.log(`   Default URL: https://${deployment.app.defaultHostname}`);
    console.log(`   SSL: Automatic (Azure managed)`);
    
    if (deployment.validationToken) {
      console.log('\n⚠️ Domain Validation Required:');
      console.log(`   Token: ${deployment.validationToken}`);
      console.log('   This should be handled automatically via CNAME');
    }

    console.log('\n🔗 GitHub Actions Workflow:');
    console.log('Add this secret to your GitHub repository:');
    console.log(`   AZURE_STATIC_WEB_APPS_API_TOKEN: ${deployment.app.properties?.apiKey || '[Check Azure Portal]'}`);

    console.log('\n📝 Sample GitHub Actions workflow:');
    const workflow = await manager.getGitHubActionsWorkflow('my-portfolio-site');
    console.log('\n--- .github/workflows/azure-static-web-apps.yml ---');
    console.log(workflow);
    console.log('--- End of workflow ---\n');

    console.log('🎉 Your static web app is being deployed!');
    console.log('   It may take a few minutes for the first deployment.');
    console.log(`   Once ready, access it at: https://${deployment.domain}`);

  } catch (error: any) {
    console.error('\n❌ Deployment failed:', error.message);
    console.error('\nMake sure you have:');
    console.error('1. Azure Static Web Apps resource provider registered');
    console.error('2. A valid GitHub repository URL');
    console.error('3. Correct permissions in Azure');
  }
}

// Run deployment
if (require.main === module) {
  deployStaticWebApp().catch(console.error);
}