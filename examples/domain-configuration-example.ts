#!/usr/bin/env ts-node
/**
 * Domain Configuration Service Example
 * Demonstrates AI-powered domain name generation and deployment
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { DomainConfigurationService } from '../src/services/domain-configuration-service';

dotenv.config({ path: path.join(__dirname, '../.env') });

async function demonstrateDomainConfiguration() {
  console.log('\n🌐 Domain Configuration Service Demo\n');
  console.log('═'.repeat(60));

  // Initialize service
  const domainService = new DomainConfigurationService({
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
    }
  });

  // Example 1: Generate domain for an e-commerce project
  console.log('\n🛍️ Example 1: E-commerce Platform\n');
  
  const ecommerceDomain = await domainService.generateDomainWithAI({
    projectId: 'proj-001',
    projectName: 'Fashion Marketplace',
    projectDescription: 'Modern fashion e-commerce platform for trendy clothing and accessories',
    projectType: 'webapp',
    targetAudience: 'Young adults interested in fashion',
    keywords: ['fashion', 'style', 'trendy', 'marketplace'],
    preferredStyle: 'creative'
  });

  console.log('AI Generated Domain:');
  console.log(`  Primary: ${ecommerceDomain.subdomain}.digisquares.in`);
  console.log(`  Score: ${(ecommerceDomain.score * 100).toFixed(0)}%`);
  console.log(`  Reasoning: ${ecommerceDomain.reasoning}`);
  console.log(`  Alternatives:`);
  ecommerceDomain.alternatives.forEach(alt => 
    console.log(`    - ${alt}.digisquares.in`)
  );

  // Example 2: Generate domain for a SaaS API
  console.log('\n\n🔧 Example 2: SaaS API Service\n');
  
  const apiDomain = await domainService.generateDomainWithAI({
    projectId: 'proj-002',
    projectName: 'DataSync Pro',
    projectDescription: 'Real-time data synchronization API for enterprise applications',
    projectType: 'api',
    targetAudience: 'Enterprise developers and IT teams',
    keywords: ['data', 'sync', 'api', 'enterprise', 'realtime'],
    preferredStyle: 'technical'
  });

  console.log('AI Generated Domain:');
  console.log(`  Primary: ${apiDomain.subdomain}.digisquares.in`);
  console.log(`  Score: ${(apiDomain.score * 100).toFixed(0)}%`);
  console.log(`  Reasoning: ${apiDomain.reasoning}`);

  // Example 3: Configure and deploy a project
  console.log('\n\n🚀 Example 3: Configure & Deploy Project\n');
  
  try {
    // Configure domain for a new project
    const projectConfig = await domainService.configureDomainForProject('proj-003', {
      service: 'staticwebapp',
      environment: 'production',
      useAI: true
    });

    console.log('Domain Configuration:');
    console.log(`  Project ID: ${projectConfig.projectId}`);
    console.log(`  Domain: ${projectConfig.fqdn}`);
    console.log(`  Type: ${projectConfig.type}`);
    console.log(`  Service: ${projectConfig.service}`);
    console.log(`  AI Generated: ${projectConfig.aiGenerated}`);
    
    if (projectConfig.aiReasoning) {
      console.log(`  AI Reasoning: ${projectConfig.aiReasoning}`);
    }

    // Simulate deployment
    console.log('\n📦 Deploying project with configured domain...');
    
    // This would actually deploy the project
    /*
    const deployment = await domainService.deployProjectWithDomain('proj-003', {
      service: 'staticwebapp',
      staticWebAppConfig: {
        repositoryUrl: 'https://github.com/user/project',
        branch: 'main',
        appLocation: '/',
        outputLocation: 'build'
      }
    });
    
    console.log(`✅ Deployed to: https://${deployment.domain.fqdn}`);
    */

  } catch (error: any) {
    console.error('Configuration failed:', error.message);
  }

  // Example 4: Custom domain configuration
  console.log('\n\n🎯 Example 4: Custom Domain Configuration\n');
  
  const customDomain = await domainService.configureDomainForProject('proj-004', {
    service: 'aci',
    environment: 'production',
    customDomain: 'my-awesome-app',
    useAI: false
  });

  console.log('Custom Domain Configuration:');
  console.log(`  Domain: ${customDomain.fqdn}`);
  console.log(`  Type: ${customDomain.type}`);

  // Example 5: Multi-environment deployment
  console.log('\n\n🔄 Example 5: Multi-Environment Deployment\n');
  
  const environments = ['production', 'staging', 'development'] as const;
  
  for (const env of environments) {
    const envConfig = await domainService.configureDomainForProject('proj-005', {
      service: 'aci',
      environment: env,
      useAI: true
    });
    
    console.log(`${env.padEnd(12)}: ${envConfig.fqdn}`);
  }

  // Example 6: Show AI creativity with different styles
  console.log('\n\n🎨 Example 6: AI Domain Generation Styles\n');
  
  const styles = ['professional', 'creative', 'technical', 'playful'] as const;
  const projectBase = {
    projectId: 'proj-006',
    projectName: 'Social Connect',
    projectDescription: 'Social networking platform for professionals',
    projectType: 'webapp' as const
  };

  for (const style of styles) {
    const styledDomain = await domainService.generateDomainWithAI({
      ...projectBase,
      preferredStyle: style
    });
    
    console.log(`${style.padEnd(12)}: ${styledDomain.subdomain}.digisquares.in`);
  }

  // Example 7: Domain analytics
  console.log('\n\n📊 Example 7: Domain Analytics\n');
  
  const analytics = await domainService.getDomainAnalytics();
  
  console.log('Domain Statistics:');
  console.log(`  Total Domains: ${analytics.totalDomains}`);
  console.log(`  AI Generated: ${analytics.aiGenerated}`);
  console.log(`  Custom Domains: ${analytics.customDomains}`);
  console.log('\n  By Environment:');
  Object.entries(analytics.byEnvironment).forEach(([env, count]) => {
    console.log(`    ${env}: ${count}`);
  });
  console.log('\n  By Service:');
  Object.entries(analytics.byService).forEach(([service, count]) => {
    console.log(`    ${service}: ${count}`);
  });

  // Show sample prompts
  console.log('\n\n💡 Sample AI Prompts for Different Projects:\n');
  
  const sampleProjects = [
    {
      name: 'AI Photo Editor',
      description: 'AI-powered photo editing application',
      expected: 'pixelmagic, photogenius, snapenhance'
    },
    {
      name: 'Task Management System',
      description: 'Enterprise task and project management platform',
      expected: 'taskflow, workstream, projecthub'
    },
    {
      name: 'Recipe Sharing App',
      description: 'Community platform for sharing cooking recipes',
      expected: 'recipebox, cookshare, tastehub'
    }
  ];

  sampleProjects.forEach(project => {
    console.log(`\n  ${project.name}:`);
    console.log(`    Description: ${project.description}`);
    console.log(`    Expected domains: ${project.expected}`);
  });

  // Cleanup
  await domainService.cleanup();
  
  console.log('\n\n✅ Domain Configuration Demo Complete!');
  console.log('═'.repeat(60));
}

// Show AI prompt template
function showAIPromptTemplate() {
  console.log('\n📝 AI Domain Generation Prompt Template:\n');
  console.log(`
The AI uses this template to generate memorable domain names:

1. Analyzes project name and description
2. Considers target audience and project type
3. Applies the requested style (professional/creative/technical/playful)
4. Generates short, memorable subdomains (5-15 characters)
5. Ensures uniqueness with optional suffixes
6. Provides reasoning for the selection

Example AI thought process:
- Project: "Fashion Marketplace"
- Keywords: fashion, style, trendy
- Style: creative
- Generated: "stylemart", "trendshop", "fashionly"
- Selected: "stylemart" (combines style + marketplace, easy to remember)
`);
}

// Run demonstration
if (require.main === module) {
  demonstrateDomainConfiguration()
    .then(() => showAIPromptTemplate())
    .catch(console.error);
}