#!/usr/bin/env ts-node
/**
 * Test Complete App Workflow
 * Demonstrates the full process from user request to deployed app
 */

import { CompleteAppWorkflow, UserRequest } from '../src/workflows/complete-app-workflow';
import { Logger } from '../src/utils/logger';
import { CleanupManager } from '../src/utils/cleanup-manager';
import * as readline from 'readline';

const logger = Logger.getInstance().child({ component: 'WorkflowTest' });

// Test configurations
const testScenarios: UserRequest[] = [
  {
    userId: 'demo-user-1',
    projectName: 'my-react-app',
    description: 'Create a modern React application with routing and API integration',
    framework: 'react',
    features: ['routing', 'api-calls', 'responsive-design']
  },
  {
    userId: 'demo-user-2',
    projectName: 'simple-api',
    description: 'Create a Node.js REST API with Express',
    framework: 'node',
    features: ['rest-api', 'cors', 'error-handling']
  },
  {
    userId: 'demo-user-3',
    projectName: 'nextjs-blog',
    description: 'Create a Next.js blog with static generation',
    framework: 'nextjs',
    features: ['static-generation', 'markdown', 'seo']
  }
];

async function runWorkflowTest(scenario: UserRequest) {
  console.log('\n' + '='.repeat(60));
  console.log(`Testing: ${scenario.projectName}`);
  console.log(`Description: ${scenario.description}`);
  console.log('='.repeat(60) + '\n');
  
  const workflow = new CompleteAppWorkflow();
  const startTime = Date.now();
  
  // Set up progress monitoring
  workflow.on('progress', (progress) => {
    const progressBar = '█'.repeat(Math.floor(progress.progress / 5)).padEnd(20, '░');
    console.log(`[${progressBar}] ${progress.progress}% - ${progress.step}`);
    if (progress.message) {
      console.log(`  └─ ${progress.message}`);
    }
  });
  
  try {
    const result = await workflow.execute(scenario);
    const duration = Math.round(result.duration! / 1000);
    
    console.log('\n' + '='.repeat(60));
    if (result.success) {
      console.log('✅ DEPLOYMENT SUCCESSFUL!');
      console.log('='.repeat(60));
      console.log(`Request ID: ${result.requestId}`);
      console.log(`Project ID: ${result.projectId}`);
      console.log(`Deployment URL: ${result.deploymentUrl}`);
      console.log(`Container: ${result.containerName}`);
      console.log(`Duration: ${duration} seconds`);
      
      if (result.gitRepo) {
        console.log(`Git Repository: ${result.gitRepo}`);
      }
      
      console.log('\n📋 Deployment Logs:');
      result.logs?.slice(-10).forEach(log => console.log(`  ${log}`));
      
    } else {
      console.log('❌ DEPLOYMENT FAILED');
      console.log('='.repeat(60));
      console.log(`Error: ${result.error}`);
      console.log(`Duration: ${duration} seconds`);
      
      if (result.logs && result.logs.length > 0) {
        console.log('\n📋 Error Logs:');
        result.logs.slice(-10).forEach(log => console.log(`  ${log}`));
      }
    }
    
    return result;
    
  } catch (error: any) {
    console.error('\n❌ Workflow Error:', error.message);
    logger.error('Workflow failed', error);
    return null;
  }
}

async function selectScenario(): Promise<UserRequest | null> {
  console.log('\n🚀 Complete App Deployment Workflow Test');
  console.log('=' .repeat(60));
  console.log('\nAvailable test scenarios:\n');
  
  testScenarios.forEach((scenario, index) => {
    console.log(`${index + 1}. ${scenario.projectName} (${scenario.framework})`);
    console.log(`   ${scenario.description}`);
  });
  
  console.log('\n0. Exit');
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise((resolve) => {
    rl.question('\nSelect a scenario (0-3): ', (answer) => {
      rl.close();
      
      const choice = parseInt(answer);
      if (choice === 0 || isNaN(choice)) {
        resolve(null);
      } else if (choice >= 1 && choice <= testScenarios.length) {
        resolve(testScenarios[choice - 1]);
      } else {
        console.log('Invalid choice');
        resolve(null);
      }
    });
  });
}

async function main() {
  try {
    // Check environment
    logger.info('Checking environment configuration...');
    const { getEnvConfig } = await import('../src/config/environment');
    const config = getEnvConfig();
    
    console.log('\n✅ Environment configured');
    console.log(`Azure Subscription: ${config.azureSubscriptionId}`);
    console.log(`Resource Group: ${config.azureResourceGroup}`);
    console.log(`Container Registry: ${config.azureContainerRegistry}`);
    
    // Warning
    console.log('\n⚠️  WARNING: This will create REAL Azure resources!');
    console.log('⚠️  Ensure you have proper Azure subscription and quotas.');
    
    // Select scenario
    const scenario = await selectScenario();
    if (!scenario) {
      console.log('\nExiting...');
      return;
    }
    
    // Run test
    await runWorkflowTest(scenario);
    
    // Cleanup
    console.log('\n🧹 Running cleanup...');
    await CleanupManager.getInstance().cleanup();
    
    console.log('\n✅ Test complete!');
    
  } catch (error: any) {
    logger.error('Test failed', error);
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Handle process termination
process.on('SIGINT', async () => {
  console.log('\n\n🛑 Interrupted! Cleaning up...');
  await CleanupManager.getInstance().cleanup();
  process.exit(0);
});

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

export { runWorkflowTest };