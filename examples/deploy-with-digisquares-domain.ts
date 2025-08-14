/**
 * Example: Deploy with Automatic Digisquares.in Subdomain
 * @module DeployWithDigisquaresDomain
 */

import { UnifiedDeploymentService } from '../src/services/unified-deployment-service';

async function deployWithAutomaticSubdomain() {
  const deploymentService = new UnifiedDeploymentService();

  console.log('🌐 Automatic Digisquares.in Subdomain Assignment Examples\n');
  console.log('=' .repeat(60));
  console.log('All deployments automatically receive:');
  console.log('✅ Free subdomain on digisquares.in');
  console.log('🔒 SSL certificate (auto-provisioned)');
  console.log('🚀 Instant DNS configuration');
  console.log('🌍 Global accessibility\n');

  // Example 1: Simple deployment with automatic subdomain
  console.log('1️⃣ Simple React App Deployment:');
  console.log('-'.repeat(40));
  
  try {
    const simpleDeployment = await deploymentService.deploy({
      projectName: 'my-portfolio',
      framework: 'react',
      deploymentType: 'blob-storage',
      sourcePath: './dist',
      enableCDN: true,
      environment: 'prod'
    });

    console.log('✅ Deployment Successful!');
    console.log(`   🌐 Your site is live at: https://${simpleDeployment.customDomain}`);
    console.log(`   📝 Subdomain: ${simpleDeployment.customDomain?.split('.')[0]}.digisquares.in`);
    console.log(`   🔒 SSL Status: Active`);
    console.log(`   🚀 CDN: Enabled`);
    console.log(`   💰 Cost: $${simpleDeployment.analysis?.estimatedCost}/month\n`);
  } catch (error) {
    console.error('❌ Deployment failed:', error);
  }

  // Example 2: Deployment with preferred subdomain
  console.log('2️⃣ Deployment with Preferred Subdomain:');
  console.log('-'.repeat(40));
  
  try {
    const customDeployment = await deploymentService.deploy({
      projectName: 'awesome-blog',
      framework: 'gatsby',
      deploymentType: 'blob-storage',
      sourcePath: './public',
      customDomain: 'awesome-blog',  // Will become awesome-blog.digisquares.in
      enableCDN: true,
      environment: 'prod',
      environmentVariables: {
        GATSBY_API_URL: 'https://api.digisquares.in',
        GATSBY_SITE_NAME: 'Awesome Blog'
      }
    });

    console.log('✅ Custom Subdomain Deployment Successful!');
    console.log(`   🌐 Live at: https://${customDeployment.customDomain}`);
    console.log(`   📝 Custom subdomain secured!`);
    console.log(`   🔒 SSL: Auto-configured`);
    console.log(`   🌍 Global CDN: Active\n`);
  } catch (error) {
    console.error('❌ Deployment failed:', error);
  }

  // Example 3: GitHub-based Static Web App
  console.log('3️⃣ GitHub Static Web App with Auto-Domain:');
  console.log('-'.repeat(40));
  
  try {
    const githubDeployment = await deploymentService.deploy({
      projectName: 'company-website',
      framework: 'vue',
      deploymentType: 'static-web-app',
      repositoryUrl: 'https://github.com/company/website',
      branch: 'main',
      environment: 'prod'
    });

    console.log('✅ GitHub Deployment Successful!');
    console.log(`   🌐 Website: https://${githubDeployment.customDomain}`);
    console.log(`   🔄 Auto-deploy on git push`);
    console.log(`   🔒 SSL: Managed by digisquares.in`);
    console.log(`   📦 Backup: ${githubDeployment.url}\n`);
  } catch (error) {
    console.error('❌ Deployment failed:', error);
  }

  // Example 4: Multiple deployments for the same project
  console.log('4️⃣ Multi-Environment Deployment:');
  console.log('-'.repeat(40));
  
  const environments = ['dev', 'staging', 'prod'] as const;
  
  for (const env of environments) {
    try {
      const envDeployment = await deploymentService.deploy({
        projectName: `myapp-${env}`,
        framework: 'next',
        deploymentType: 'auto',
        sourcePath: './out',
        environment: env,
        enableCDN: env === 'prod'
      });

      console.log(`✅ ${env.toUpperCase()} Environment:`);
      console.log(`   URL: https://${envDeployment.customDomain}`);
    } catch (error) {
      console.error(`❌ ${env} deployment failed:`, error);
    }
  }

  // Show subdomain patterns
  console.log('\n📋 Automatic Subdomain Patterns:');
  console.log('=' .repeat(60));
  console.log(`
  Project Name          →  Generated Subdomain
  ─────────────────────────────────────────────
  my-app               →  my-app.digisquares.in
  MyAwesomeProject     →  myawesomeproject.digisquares.in
  test_application     →  test-application.digisquares.in
  2024-portfolio       →  2024-portfolio.digisquares.in
  
  If subdomain is taken, alternatives are generated:
  my-app               →  my-app-2.digisquares.in
  my-app               →  my-app-x7k2.digisquares.in
  `);

  // Benefits summary
  console.log('\n🎯 Benefits of Digisquares.in Subdomains:');
  console.log('=' .repeat(60));
  console.log(`
  ✅ No Domain Registration Required
     - Save $10-50/year on domain costs
     - No renewal hassles
  
  ✅ Instant SSL Certificates
     - Automatic HTTPS encryption
     - Let's Encrypt integration
     - Auto-renewal
  
  ✅ Professional URLs
     - Clean, memorable subdomains
     - Perfect for portfolios, demos, staging
  
  ✅ Zero Configuration
     - DNS configured automatically
     - No manual CNAME/A records
     - Works immediately
  
  ✅ Global CDN Ready
     - Azure CDN integration
     - Low latency worldwide
     - DDoS protection included
  
  ✅ Multiple Environments
     - dev.myapp.digisquares.in
     - staging.myapp.digisquares.in
     - myapp.digisquares.in (production)
  `);

  // Technical details
  console.log('\n🔧 Technical Implementation:');
  console.log('=' .repeat(60));
  console.log(`
  1. Deployment Request
     └─> Generate unique subdomain
  
  2. DNS Configuration
     ├─> Create CNAME record
     ├─> Point to Azure endpoint
     └─> Enable SSL
  
  3. SSL Provisioning
     ├─> Domain validation
     ├─> Certificate request (Let's Encrypt)
     └─> Auto-renewal setup
  
  4. CDN Configuration (if enabled)
     ├─> Create CDN profile
     ├─> Configure caching rules
     └─> Enable compression
  
  5. Final Result
     └─> https://your-app.digisquares.in
  `);
}

// Run the example
deployWithAutomaticSubdomain().catch(console.error);