#!/usr/bin/env ts-node
/**
 * Test Runner for Complete Workflow Integration Test
 * Ensures environment is properly configured before running tests
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { Logger } from '../src/utils/logger';

const logger = Logger.getInstance().child({ component: 'TestRunner' });

async function checkEnvironment(): Promise<boolean> {
  logger.info('Checking environment configuration...');
  
  // Check if .env file exists
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) {
    logger.error('.env file not found. Please create it with required credentials.');
    return false;
  }
  
  // Load environment variables
  require('dotenv').config({ path: envPath });
  
  // Check required variables
  const required = [
    'AZURE_SUBSCRIPTION_ID',
    'AZURE_RESOURCE_GROUP',
    'AZURE_CONTAINER_REGISTRY',
    'AZURE_CONTAINER_REGISTRY_USERNAME',
    'AZURE_CONTAINER_REGISTRY_PASSWORD',
    'DB_HOST',
    'DB_USER',
    'DB_PASSWORD',
    'DB_NAME',
    'GITHUB_TOKEN',
    'COSMOSAPI_KEY'
  ];
  
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    logger.error('Missing required environment variables:', missing);
    return false;
  }
  
  // Verify Azure CLI is logged in
  try {
    const { execSync } = require('child_process');
    execSync('az account show', { stdio: 'ignore' });
    logger.info('Azure CLI authenticated');
  } catch (error) {
    logger.error('Azure CLI not authenticated. Run: az login');
    return false;
  }
  
  logger.info('Environment check passed');
  return true;
}

async function runTests(): Promise<void> {
  logger.info('Starting complete workflow integration test...');
  
  const testProcess = spawn('npm', ['run', 'jest', '--', 
    'tests/integration/complete-workflow.test.ts',
    '--verbose',
    '--forceExit'
  ], {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'test',
      LOG_LEVEL: 'debug'
    }
  });
  
  testProcess.on('close', (code) => {
    if (code === 0) {
      logger.info('✅ All tests passed!');
    } else {
      logger.error(`❌ Tests failed with exit code: ${code}`);
    }
    process.exit(code || 0);
  });
}

async function main() {
  logger.info('='.repeat(60));
  logger.info('Complete Workflow Integration Test Runner');
  logger.info('='.repeat(60));
  
  // Check environment
  const envOk = await checkEnvironment();
  if (!envOk) {
    logger.error('Environment check failed. Please fix the issues above.');
    process.exit(1);
  }
  
  // Warning
  logger.warn('⚠️  WARNING: This test will create REAL Azure resources!');
  logger.warn('⚠️  Ensure you have proper Azure subscription and quotas.');
  logger.warn('⚠️  Resources will be cleaned up after the test.');
  
  // Confirm
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  readline.question('\nDo you want to continue? (yes/no): ', async (answer) => {
    readline.close();
    
    if (answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y') {
      await runTests();
    } else {
      logger.info('Test cancelled by user');
      process.exit(0);
    }
  });
}

// Handle errors
process.on('unhandledRejection', (error) => {
  logger.error('Unhandled rejection:', error);
  process.exit(1);
});

// Run
main().catch((error) => {
  logger.error('Test runner error:', error);
  process.exit(1);
});