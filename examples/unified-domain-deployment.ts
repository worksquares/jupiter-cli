#!/usr/bin/env ts-node
/**
 * Unified Domain Deployment Example
 * Demonstrates deploying both ACI and Static Web Apps with automatic DNS
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { UnifiedDomainManager } from '../src/dns/unified-domain-manager';
import { StaticWebAppDNSManager } from '../src/dns/static-web-apps-dns';

dotenv.config({ path: path.join(__dirname, '../.env') });

async function demonstrateUnifiedDeployment() {
  console.log('\n🚀 Unified Domain Deployment Demo\n');
  console.log('═'.repeat(60));

  // Initialize unified domain manager
  const domainManager = new UnifiedDomainManager({
    provider: 'azure',
    zones: ['digisquares.in'],
    defaultZone: 'digisquares.in',
    subscriptionId: process.env.AZURE_SUBSCRIPTION_ID!,
    resourceGroup: process.env.AZURE_DNS_RESOURCE_GROUP!,
    sslEnabled: true,
    monitoring: true
  });

  // Listen to events
  domainManager.on('container-deployed', (event) => {
    console.log(`\n✅ Container deployed: ${event.domain}`);
  });

  domainManager.on('staticwebapp-deployed', (event) => {
    console.log(`\n✅ Static Web App deployed: ${event.domain}`);
  });

  domainManager.on('domain-unhealthy', (record) => {
    console.log(`\n⚠️ Domain unhealthy: ${record.fqdn}`);
  });

  try {
    // Example 1: Deploy a containerized API with SSL
    console.log('\n📦 Deploying Containerized API with SSL...');
    
    const apiDeployment = await domainManager.deployContainerWithDomain(
      'api-service',
      {
        image: 'mcr.microsoft.com/azuredocs/aci-helloworld',
        cpu: 1,
        memoryGB: 1.5,
        port: 80
      },
      {
        subdomain: 'api',
        environment: 'production',
        ssl: true,
        healthCheck: true,
        monitoring: true
      }
    );

    console.log('\nAPI Deployment:');
    console.log(`  URL: https://${apiDeployment.fqdn}`);
    console.log(`  SSL: ${apiDeployment.ssl?.enabled ? 'Enabled' : 'Disabled'}`);
    console.log(`  Environment: ${apiDeployment.environment}`);

    // Example 2: Deploy a Static Web App (React App)
    console.log('\n🌐 Deploying Static Web App...');
    
    const webAppDeployment = await domainManager.deployStaticWebAppWithDomain(
      'my-react-app',
      {
        repositoryUrl: 'https://github.com/Azure-Samples/my-first-static-web-app',
        branch: 'main',
        appLocation: '/',
        outputLocation: 'build'
      },
      {
        subdomain: 'app',
        environment: 'production',
        monitoring: true
      }
    );

    console.log('\nWeb App Deployment:');
    console.log(`  URL: https://${webAppDeployment.fqdn}`);
    console.log(`  SSL: Automatic (Azure managed)`);
    console.log(`  Environment: ${webAppDeployment.environment}`);

    // Example 3: Deploy staging environment
    console.log('\n🔧 Deploying Staging Environment...');
    
    const stagingApi = await domainManager.deployContainerWithDomain(
      'api-service-staging',
      {
        image: 'mcr.microsoft.com/azuredocs/aci-helloworld',
        cpu: 0.5,
        memoryGB: 1
      },
      {
        subdomain: 'api',
        environment: 'staging',
        ssl: true
      }
    );

    console.log('\nStaging API:');
    console.log(`  URL: https://${stagingApi.fqdn}`);

    // Example 4: List all domains
    console.log('\n📋 All Deployed Domains:');
    const allDomains = await domainManager.listDomains();
    
    allDomains.forEach(domain => {
      console.log(`\n  ${domain.fqdn}`);
      console.log(`    Service: ${domain.service}`);
      console.log(`    Environment: ${domain.environment}`);
      console.log(`    SSL: ${domain.ssl?.enabled ? 'Yes' : 'No'}`);
      console.log(`    Health: ${domain.health?.status || 'Unknown'}`);
    });

    // Example 5: Get analytics
    console.log('\n📊 Domain Analytics:');
    const analytics = await domainManager.getDomainAnalytics();
    
    console.log(`  Total Domains: ${analytics.totalDomains}`);
    console.log(`  SSL Enabled: ${analytics.sslEnabled}`);
    console.log('\n  By Service:');
    Object.entries(analytics.byService).forEach(([service, count]) => {
      console.log(`    ${service}: ${count}`);
    });
    console.log('\n  By Environment:');
    Object.entries(analytics.byEnvironment).forEach(([env, count]) => {
      console.log(`    ${env}: ${count}`);
    });

    // Example 6: Preview deployment for Pull Request
    console.log('\n🔄 Creating Preview Environment...');
    
    const swaManager = new StaticWebAppDNSManager({
      subscriptionId: process.env.AZURE_SUBSCRIPTION_ID!,
      resourceGroup: process.env.AZURE_RESOURCE_GROUP!,
      dnsZone: 'digisquares.in'
    });

    const preview = await swaManager.createPreviewEnvironment(
      'my-react-app',
      123, // PR number
      'feature/new-ui'
    );

    console.log('\nPreview Environment:');
    console.log(`  URL: https://${preview.domain}`);
    console.log(`  Branch: feature/new-ui`);
    console.log(`  PR: #123`);

    // Example 7: Multi-domain deployment
    console.log('\n🌍 Multi-Domain Deployment Example:');
    
    // If we had multiple domains configured
    const multiDomainConfig = {
      provider: 'azure' as const,
      zones: ['digisquares.in', 'myapp.com', 'api.digital'],
      defaultZone: 'digisquares.in',
      subscriptionId: process.env.AZURE_SUBSCRIPTION_ID!,
      resourceGroup: process.env.AZURE_RESOURCE_GROUP!,
      sslEnabled: true,
      monitoring: false
    };

    console.log('\n  Configured domains:');
    multiDomainConfig.zones.forEach(zone => {
      console.log(`    - ${zone}`);
    });

    // Deployment URLs would be:
    console.log('\n  Example deployments:');
    console.log('    Production API: https://api.myapp.com');
    console.log('    Staging API: https://api-staging.myapp.com');
    console.log('    Web App: https://app.digisquares.in');
    console.log('    Services: https://services.api.digital');

    // Summary
    console.log('\n' + '═'.repeat(60));
    console.log('✅ Unified Domain Deployment Complete!');
    console.log('═'.repeat(60));
    
    console.log('\n📚 Key Features Demonstrated:');
    console.log('  1. Container deployment with automatic DNS and SSL');
    console.log('  2. Static Web App deployment with custom domain');
    console.log('  3. Environment-based subdomain routing');
    console.log('  4. Health monitoring and analytics');
    console.log('  5. Preview environments for PRs');
    console.log('  6. Multi-domain support');
    
    console.log('\n💡 Next Steps:');
    console.log('  - Configure GitHub Actions for automatic deployments');
    console.log('  - Set up monitoring alerts');
    console.log('  - Implement custom health checks');
    console.log('  - Add more domains to the configuration');

  } catch (error: any) {
    console.error('\n❌ Deployment failed:', error.message);
  } finally {
    // Cleanup
    await domainManager.cleanup();
  }
}

// Helper function to show deployment architecture
function showArchitecture() {
  console.log('\n🏗️ Deployment Architecture:');
  console.log(`
  ┌─────────────────────────────────────────────────────────┐
  │                    digisquares.in                       │
  ├─────────────────────────────────────────────────────────┤
  │                                                         │
  │  Production:                                            │
  │    api.digisquares.in ──────> Container (SSL)          │
  │    app.digisquares.in ──────> Static Web App           │
  │                                                         │
  │  Staging:                                               │
  │    api-staging.digisquares.in ──> Container            │
  │    app-staging.digisquares.in ──> Static Web App       │
  │                                                         │
  │  Preview (PRs):                                         │
  │    app-pr-123.digisquares.in ──> Static Web App        │
  │                                                         │
  │  Services:                                              │
  │    *.services.digisquares.in ──> Load Balancer         │
  │                                                         │
  └─────────────────────────────────────────────────────────┘
  `);
}

// Run demonstration
if (require.main === module) {
  showArchitecture();
  demonstrateUnifiedDeployment().catch(console.error);
}