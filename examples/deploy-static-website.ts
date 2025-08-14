/**
 * Example: Deploy Static Website to Azure
 * @module DeployStaticWebsiteExample
 */

import { UnifiedDeploymentService } from '../src/services/unified-deployment-service';

async function deployStaticWebsite() {
  const deploymentService = new UnifiedDeploymentService();

  console.log('🚀 Static Website Deployment Examples\n');
  console.log('=' .repeat(60));

  // Example 1: Deploy to Azure Blob Storage (Best for production with CDN)
  console.log('\n1️⃣ Deploy to Azure Blob Storage with CDN:');
  console.log('-'.repeat(40));
  
  try {
    const blobDeployment = await deploymentService.deploy({
      projectName: 'my-react-app',
      framework: 'react',
      deploymentType: 'blob-storage',  // Explicitly choose Blob Storage
      sourcePath: './dist',             // Local build output
      enableCDN: true,                  // Enable CDN for global distribution
      environment: 'prod',
      environmentVariables: {
        REACT_APP_API_URL: 'https://api.example.com',
        REACT_APP_VERSION: '1.0.0'
      }
    });

    console.log('✅ Blob Storage Deployment Success:');
    console.log(`   URL: ${blobDeployment.url}`);
    console.log(`   CDN Enabled: Yes`);
    console.log(`   Custom Domain: ${blobDeployment.customDomain || 'Not configured'}`);
    console.log(`   Estimated Cost: $${blobDeployment.analysis?.estimatedCost}/month`);
  } catch (error) {
    console.error('❌ Blob Storage deployment failed:', error);
  }

  // Example 2: Deploy to Azure Static Web Apps (Best for GitHub integration)
  console.log('\n2️⃣ Deploy to Azure Static Web Apps:');
  console.log('-'.repeat(40));
  
  try {
    const swaDeployment = await deploymentService.deploy({
      projectName: 'my-vue-app',
      framework: 'vue',
      deploymentType: 'static-web-app',  // Explicitly choose Static Web Apps
      repositoryUrl: 'https://github.com/user/my-vue-app',
      branch: 'main',
      environment: 'staging',
      environmentVariables: {
        VUE_APP_API_KEY: 'staging-key-123',
        VUE_APP_ENV: 'staging'
      }
    });

    console.log('✅ Static Web App Deployment Success:');
    console.log(`   URL: ${swaDeployment.url}`);
    console.log(`   GitHub Integration: Yes`);
    console.log(`   Auto-Deploy on Push: Yes`);
    console.log(`   Estimated Cost: $${swaDeployment.analysis?.estimatedCost}/month (Free tier)`);
  } catch (error) {
    console.error('❌ Static Web App deployment failed:', error);
  }

  // Example 3: Auto-detect best deployment option
  console.log('\n3️⃣ Auto-Detect Best Deployment Option:');
  console.log('-'.repeat(40));
  
  try {
    const autoDeployment = await deploymentService.deploy({
      projectName: 'my-portfolio',
      framework: 'vanilla',
      deploymentType: 'auto',  // Let system decide
      sourcePath: './public',
      environment: 'prod'
    });

    console.log('✅ Auto-Deployment Success:');
    console.log(`   Chosen Type: ${autoDeployment.type}`);
    console.log(`   URL: ${autoDeployment.url}`);
    console.log(`   Reason: ${autoDeployment.analysis?.reason}`);
    console.log(`   Confidence: ${(autoDeployment.analysis?.confidence || 0) * 100}%`);
  } catch (error) {
    console.error('❌ Auto-deployment failed:', error);
  }

  // Comparison table
  console.log('\n📊 Deployment Options Comparison:');
  console.log('=' .repeat(60));
  console.log(`
  ┌─────────────────────┬──────────────────────┬──────────────────────┐
  │ Feature             │ Blob Storage         │ Static Web Apps      │
  ├─────────────────────┼──────────────────────┼──────────────────────┤
  │ Cost                │ ~$5/month            │ Free (with limits)   │
  │ CDN                 │ ✅ Azure CDN         │ ✅ Built-in          │
  │ Custom Domain       │ ✅ Supported         │ ✅ Supported         │
  │ SSL Certificate     │ ✅ Free              │ ✅ Free              │
  │ GitHub Integration  │ ❌ Manual deploy     │ ✅ Auto-deploy       │
  │ API Support         │ ❌ Static only       │ ✅ Serverless APIs   │
  │ Global Distribution │ ✅ Via CDN           │ ✅ Built-in          │
  │ Staging Slots       │ ❌ Not available     │ ✅ Preview envs      │
  │ Max File Size       │ 5 TB                 │ 250 MB               │
  │ Build Process       │ Local/CI             │ GitHub Actions       │
  └─────────────────────┴──────────────────────┴──────────────────────┘
  `);

  console.log('\n💡 Recommendations:');
  console.log('• Use Blob Storage for: Large sites, existing CI/CD, need CDN control');
  console.log('• Use Static Web Apps for: GitHub repos, small sites, need API support');
  console.log('• Use Auto mode to let the system choose based on your project');
}

// Run the example
deployStaticWebsite().catch(console.error);