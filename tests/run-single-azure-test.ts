#!/usr/bin/env ts-node
/**
 * Direct test runner for Azure deployment tests
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment
dotenv.config({ path: path.join(__dirname, '../.env') });

// Set up global test environment
(global as any).describe = (name: string, fn: () => void) => {
  console.log(`\n🧪 Test Suite: ${name}\n`);
  fn();
};

(global as any).it = async (name: string, fn: () => Promise<void>, timeout?: number) => {
  console.log(`  📋 ${name}`);
  const startTime = Date.now();
  
  try {
    await fn();
    const duration = Date.now() - startTime;
    console.log(`  ✅ Passed (${duration}ms)`);
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.log(`  ❌ Failed (${duration}ms)`);
    console.error(`     Error: ${error.message}`);
    throw error;
  }
};

(global as any).beforeAll = async (fn: () => Promise<void>) => {
  console.log('  🔧 Running beforeAll...');
  await fn();
};

(global as any).afterAll = async (fn: () => Promise<void>) => {
  console.log('  🧹 Running afterAll...');
  await fn();
};

(global as any).beforeEach = async (fn: () => Promise<void>) => {
  await fn();
};

(global as any).afterEach = async (fn: () => Promise<void>) => {
  await fn();
};

(global as any).expect = (value: any) => ({
  toBe: (expected: any) => {
    if (value !== expected) {
      throw new Error(`Expected ${value} to be ${expected}`);
    }
  },
  toBeDefined: () => {
    if (value === undefined) {
      throw new Error(`Expected value to be defined but got undefined`);
    }
  },
  toBeGreaterThanOrEqual: (expected: number) => {
    if (value < expected) {
      throw new Error(`Expected ${value} to be greater than or equal to ${expected}`);
    }
  },
  toContain: (expected: string) => {
    if (!value.includes(expected)) {
      throw new Error(`Expected "${value}" to contain "${expected}"`);
    }
  }
});

// Run the test
async function runTest() {
  console.log('🚀 Running Azure Deployment Test Directly\n');
  
  try {
    // Import and run the test
    await import('./integration/real-azure-deployment-comprehensive.test');
    console.log('\n✅ Test completed successfully!');
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

runTest();