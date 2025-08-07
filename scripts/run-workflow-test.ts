#!/usr/bin/env ts-node
/**
 * Non-interactive runner for workflow test
 */

import { execSync } from 'child_process';
import * as path from 'path';

// Set environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'info';

// Run the test directly
try {
  console.log('Starting complete workflow integration test...\n');
  
  execSync('npm run jest -- tests/integration/complete-workflow.test.ts --verbose --forceExit', {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit',
    env: process.env
  });
  
  console.log('\n✅ Test completed successfully!');
  process.exit(0);
} catch (error) {
  console.error('\n❌ Test failed!');
  process.exit(1);
}