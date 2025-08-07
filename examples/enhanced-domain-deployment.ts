#!/usr/bin/env ts-node
/**
 * Enhanced Domain Deployment Example
 * Demonstrates deployment with automatic SSL and comprehensive error handling
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { EnhancedDomainService } from '../src/services/enhanced-domain-service';

dotenv.config({ path: path.join(__dirname, '../.env') });

async function demonstrateEnhancedDeployment() {
  console.log('\n🚀 Enhanced Domain Deployment with SSL\n');
  console.log('═'.repeat(60));

  // Initialize enhanced domain service
  const domainService = new EnhancedDomainService({
    defaultZone: 'digisquares.in',
    databaseConfig: {
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME
    },
    aiConfig: {
      baseUrl: process.env.AI_BASE_URL || 'https://cosmosapi.digisquares.com',
      apiKey: process.env.AI_API_KEY,
      model: process.env.AI_MODEL || 'default'
    },
    domainManagerConfig: {
      provider: 'azure',
      zones: ['digisquares.in'],
      defaultZone: 'digisquares.in',
      subscriptionId: process.env.AZURE_SUBSCRIPTION_ID!,
      resourceGroup: process.env.AZURE_DNS_RESOURCE_GROUP!,
      sslEnabled: true,
      monitoring: true
    },
    sslConfig: {
      provider: 'letsencrypt',
      email: process.env.SSL_EMAIL || 'admin@digisquares.in',
      staging: process.env.NODE_ENV !== 'production',
      autoRenew: true,
      renewBeforeDays: 30,
      challengeType: 'http-01'
    },
    monitoring: {
      enabled: true,
      interval: 60000 // 1 minute
    }
  });

  // Listen to events
  domainService.on('deployment-success', (event) => {
    console.log(`\n✅ Deployment successful: https://${event.domain}`);
  });

  domainService.on('ssl-certificate-generated', (event) => {
    console.log(`\n🔒 SSL certificate generated for: ${event.domain}`);
  });

  domainService.on('health-check-failed', (event) => {
    console.log(`\n⚠️ Health check failed for ${event.domain}: ${event.status}`);
  });

  domainService.on('deployment-failed', (event) => {
    console.log(`\n❌ Deployment failed: ${event.error}`);
  });

  try {
    // Example 1: Deploy container with automatic SSL
    console.log('\n📦 Example 1: Container with Let\'s Encrypt SSL\n');
    
    const containerResult = await domainService.deployProjectWithEnhancedDomain(
      'proj-ssl-demo-001',
      {
        containerConfig: {
          image: 'nginx:alpine',
          cpu: 1,
          memoryGB: 1.5,
          environmentVariables: [
            { name: 'NODE_ENV', value: 'production' }
          ]
        }
      },
      {
        service: 'aci',
        environment: 'production',
        ssl: {
          enabled: true,
          email: 'admin@digisquares.in',
          staging: false // Use production Let's Encrypt
        },
        healthCheck: {
          enabled: true,
          endpoint: '/health',
          interval: 30000 // 30 seconds
        },
        retry: {
          maxAttempts: 3,
          backoffMs: 2000
        }
      }
    );

    if (containerResult.success) {
      console.log('\n✅ Container Deployment Details:');
      console.log(`  Domain: https://${containerResult.domain?.fqdn}`);
      console.log(`  SSL: ${containerResult.domain?.ssl.enabled ? 'Enabled' : 'Disabled'}`);
      console.log(`  SSL Provider: ${containerResult.domain?.ssl.provider}`);
      console.log(`  Health Check: ${containerResult.domain?.health.enabled ? 'Enabled' : 'Disabled'}`);
      console.log(`  Status: ${containerResult.domain?.deployment.status}`);
    } else {
      console.log('\n❌ Container deployment failed:');
      containerResult.errors?.forEach(error => console.log(`  - ${error}`));
    }

    // Example 2: Deploy Static Web App (SSL automatic)
    console.log('\n\n🌐 Example 2: Static Web App with Azure SSL\n');
    
    const staticResult = await domainService.deployProjectWithEnhancedDomain(
      'proj-static-demo-001',
      {
        staticWebAppConfig: {
          repositoryUrl: 'https://github.com/Azure-Samples/my-first-static-web-app',
          branch: 'main',
          appLocation: '/',
          outputLocation: 'build'
        }
      },
      {
        service: 'staticwebapp',
        environment: 'production',
        ssl: {
          enabled: true // Azure handles SSL automatically
        },
        healthCheck: {
          enabled: true,
          endpoint: '/',
          interval: 60000
        }
      }
    );

    if (staticResult.success) {
      console.log('\n✅ Static Web App Deployment:');
      console.log(`  Domain: https://${staticResult.domain?.fqdn}`);
      console.log(`  SSL: Automatic (Azure managed)`);
      console.log(`  Status: ${staticResult.domain?.deployment.status}`);
    }

    // Example 3: Deployment with custom domain
    console.log('\n\n🎯 Example 3: Custom Domain with SSL\n');
    
    const customResult = await domainService.deployProjectWithEnhancedDomain(
      'proj-custom-demo-001',
      {
        containerConfig: {
          image: 'mcr.microsoft.com/azuredocs/aci-helloworld',
          cpu: 0.5,
          memoryGB: 1
        }
      },
      {
        service: 'aci',
        environment: 'production',
        customDomain: 'my-secure-app',
        ssl: {
          enabled: true,
          email: 'ssl@digisquares.in'
        }
      }
    );

    if (customResult.success) {
      console.log('\n✅ Custom Domain Deployment:');
      console.log(`  URL: https://${customResult.domain?.fqdn}`);
      console.log(`  Custom Subdomain: ${customResult.domain?.subdomain}`);
    }

    // Example 4: Multi-environment deployment
    console.log('\n\n🔄 Example 4: Multi-Environment with SSL\n');
    
    const environments = ['production', 'staging', 'development'] as const;
    
    for (const env of environments) {
      const envResult = await domainService.deployProjectWithEnhancedDomain(
        'proj-multi-env-001',
        {
          containerConfig: {
            image: 'nginx:alpine',
            cpu: env === 'production' ? 1 : 0.5,
            memoryGB: env === 'production' ? 2 : 1
          }
        },
        {
          service: 'aci',
          environment: env,
          ssl: {
            enabled: true,
            staging: env !== 'production' // Use staging SSL for non-prod
          }
        }
      );
      
      if (envResult.success) {
        console.log(`\n${env.padEnd(12)}: https://${envResult.domain?.fqdn}`);
      }
    }

    // Example 5: Get deployment status
    console.log('\n\n📊 Example 5: Deployment Status\n');
    
    const status = await domainService.getDeploymentStatus('proj-ssl-demo-001');
    
    console.log('Deployment Overview:');
    console.log(`  Total Domains: ${status.domains.length}`);
    console.log(`  Active: ${status.overall.active}`);
    console.log(`  Failed: ${status.overall.failed}`);
    console.log(`  Pending: ${status.overall.pending}`);
    
    console.log('\nDomain Details:');
    status.domains.forEach(domain => {
      console.log(`  ${domain.fqdn}:`);
      console.log(`    Status: ${domain.deployment?.status}`);
      console.log(`    SSL: ${domain.ssl?.enabled ? 'Enabled' : 'Disabled'}`);
      console.log(`    Health: ${domain.health?.status || 'Unknown'}`);
    });

    // Example 6: Error handling demonstration
    console.log('\n\n⚠️ Example 6: Error Handling\n');
    
    // Simulate various error scenarios
    const errorScenarios = [
      {
        name: 'Invalid project ID',
        projectId: '',
        expectedError: 'ValidationError'
      },
      {
        name: 'Missing configuration',
        projectId: 'proj-error-001',
        config: {},
        expectedError: 'ValidationError'
      },
      {
        name: 'Invalid custom domain',
        projectId: 'proj-error-002',
        options: { customDomain: 'invalid domain!' },
        expectedError: 'ValidationError'
      }
    ];

    for (const scenario of errorScenarios) {
      try {
        await domainService.deployProjectWithEnhancedDomain(
          scenario.projectId,
          scenario.config || { containerConfig: { image: 'nginx' } },
          scenario.options || { service: 'aci' }
        );
      } catch (error: any) {
        console.log(`${scenario.name}: ${error.name} - ${error.message}`);
      }
    }

    // Summary
    console.log('\n' + '═'.repeat(60));
    console.log('✅ Enhanced Domain Deployment Demo Complete!');
    console.log('═'.repeat(60));
    
    console.log('\n📚 Key Features Demonstrated:');
    console.log('  1. Automatic Let\'s Encrypt SSL for containers');
    console.log('  2. Azure-managed SSL for Static Web Apps');
    console.log('  3. Health monitoring with auto-checks');
    console.log('  4. Retry logic with exponential backoff');
    console.log('  5. Comprehensive error handling');
    console.log('  6. Multi-environment support');
    
    console.log('\n🔒 SSL Certificate Features:');
    console.log('  - Automatic generation on first access');
    console.log('  - 90-day certificates with auto-renewal');
    console.log('  - Staging certificates for development');
    console.log('  - HTTP-01 and DNS-01 challenges');
    console.log('  - Certificate monitoring and alerts');

  } catch (error: any) {
    console.error('\n❌ Demo failed:', error.message);
    console.error('Error type:', error.name);
  } finally {
    // Cleanup
    await domainService.cleanup();
  }
}

// Show SSL configuration details
function showSSLConfiguration() {
  console.log('\n🔐 SSL Configuration with Caddy:\n');
  console.log(`
When SSL is enabled, the system automatically:

1. Adds a Caddy reverse proxy container
2. Configures Let's Encrypt certificate generation
3. Sets up automatic renewal (30 days before expiry)
4. Enables HTTP to HTTPS redirect
5. Adds security headers (HSTS, CSP, etc.)

Caddy Configuration Example:
{
    email admin@digisquares.in
    acme_ca https://acme-v02.api.letsencrypt.org/directory
}

myapp.digisquares.in {
    reverse_proxy app:8080
    
    tls {
        on_demand
    }
    
    encode gzip
    
    header {
        Strict-Transport-Security "max-age=31536000"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
    }
}

Benefits:
- Zero-downtime certificate renewal
- Automatic OCSP stapling
- HTTP/2 support
- Built-in rate limiting
`);
}

// Run demonstration
if (require.main === module) {
  demonstrateEnhancedDeployment()
    .then(() => showSSLConfiguration())
    .catch(console.error);
}