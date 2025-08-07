#!/usr/bin/env ts-node

/**
 * Comprehensive Test Runner for Intelligent Agent System
 * Executes all test suites and provides detailed summary
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';

interface TestResult {
  suite: string;
  passed: boolean;
  duration: number;
  tests: {
    total: number;
    passed: number;
    failed: number;
  };
  error?: string;
}

class TestRunner {
  private results: TestResult[] = [];
  private startTime: number = 0;

  async run(): Promise<void> {
    console.log(chalk.bold.blue('\n🚀 Intelligent Agent System - Comprehensive Test Suite\n'));
    console.log(chalk.gray('Testing React framework code generation, ACI building, and Azure deployment\n'));

    this.startTime = Date.now();

    // Define test suites in order
    const testSuites = [
      {
        name: 'Test Utilities',
        command: 'npm run test:unit',
        description: 'Testing mock implementations and utilities'
      },
      {
        name: 'React Code Generation',
        command: 'npm run test:react',
        description: 'Testing React app generation in Azure Container Instance'
      },
      {
        name: 'Azure Deployment',
        command: 'npm run test:deployment',
        description: 'Testing deployment to Azure Static Web Apps'
      },
      {
        name: 'End-to-End Workflow',
        command: 'npm run test:workflow',
        description: 'Testing complete workflow from generation to deployment'
      },
      {
        name: 'Performance Tests',
        command: 'npm run test:performance',
        description: 'Testing system performance and scalability'
      }
    ];

    // Run each test suite
    for (const suite of testSuites) {
      await this.runTestSuite(suite);
    }

    // Display summary
    this.displaySummary();
  }

  private async runTestSuite(suite: {
    name: string;
    command: string;
    description: string;
  }): Promise<void> {
    console.log(chalk.yellow(`\n📋 ${suite.name}`));
    console.log(chalk.gray(`   ${suite.description}`));
    console.log(chalk.gray(`   Command: ${suite.command}\n`));

    const suiteStart = Date.now();
    let result: TestResult = {
      suite: suite.name,
      passed: false,
      duration: 0,
      tests: { total: 0, passed: 0, failed: 0 }
    };

    try {
      const output = execSync(suite.command, {
        encoding: 'utf-8',
        stdio: 'pipe',
        env: { ...process.env, CI: 'true' }
      });

      // Parse Jest output
      const testMatch = output.match(/Tests:\s+(\d+)\s+failed.*?(\d+)\s+passed.*?(\d+)\s+total/);
      const passMatch = output.match(/Tests:.*?(\d+)\s+passed.*?(\d+)\s+total/);

      if (testMatch) {
        result.tests = {
          total: parseInt(testMatch[3]),
          failed: parseInt(testMatch[1]),
          passed: parseInt(testMatch[2])
        };
        result.passed = result.tests.failed === 0;
      } else if (passMatch) {
        result.tests = {
          total: parseInt(passMatch[2]),
          passed: parseInt(passMatch[1]),
          failed: 0
        };
        result.passed = true;
      }

      result.duration = Date.now() - suiteStart;

      if (result.passed) {
        console.log(chalk.green(`✅ ${suite.name} passed (${result.duration}ms)`));
      } else {
        console.log(chalk.red(`❌ ${suite.name} failed (${result.duration}ms)`));
      }
    } catch (error: any) {
      result.duration = Date.now() - suiteStart;
      result.error = error.message;
      console.log(chalk.red(`❌ ${suite.name} failed with error`));
      console.log(chalk.red(error.stdout || error.message));
    }

    this.results.push(result);
  }

  private displaySummary(): void {
    const totalDuration = Date.now() - this.startTime;
    const totalTests = this.results.reduce((sum, r) => sum + r.tests.total, 0);
    const totalPassed = this.results.reduce((sum, r) => sum + r.tests.passed, 0);
    const totalFailed = this.results.reduce((sum, r) => sum + r.tests.failed, 0);
    const allPassed = this.results.every(r => r.passed);

    console.log(chalk.bold.blue('\n\n📊 Test Summary\n'));
    console.log(chalk.gray('─'.repeat(60)));

    // Display results table
    console.log(chalk.bold('Suite Results:'));
    this.results.forEach(result => {
      const status = result.passed ? chalk.green('PASS') : chalk.red('FAIL');
      const tests = `${result.tests.passed}/${result.tests.total}`;
      const duration = `${result.duration}ms`;
      
      console.log(
        `  ${status} ${result.suite.padEnd(25)} ${tests.padEnd(10)} ${duration}`
      );
    });

    console.log(chalk.gray('─'.repeat(60)));

    // Overall statistics
    console.log(chalk.bold('\nOverall Statistics:'));
    console.log(`  Total Test Suites: ${this.results.length}`);
    console.log(`  Total Tests: ${totalTests}`);
    console.log(`  ${chalk.green(`Passed: ${totalPassed}`)}`);
    console.log(`  ${chalk.red(`Failed: ${totalFailed}`)}`);
    console.log(`  Total Duration: ${(totalDuration / 1000).toFixed(2)}s`);

    console.log(chalk.gray('─'.repeat(60)));

    // Key metrics
    console.log(chalk.bold('\n🎯 Key Metrics:'));
    console.log(`  ✓ React Generation: ${this.getMetric('React Code Generation')}`);
    console.log(`  ✓ Azure Deployment: ${this.getMetric('Azure Deployment')}`);
    console.log(`  ✓ E2E Workflow: ${this.getMetric('End-to-End Workflow')}`);
    console.log(`  ✓ Performance: ${this.getMetric('Performance Tests')}`);

    // Final status
    if (allPassed) {
      console.log(chalk.bold.green('\n\n✅ All tests passed! The system is ready for production.\n'));
    } else {
      console.log(chalk.bold.red('\n\n❌ Some tests failed. Please check the output above.\n'));
      process.exit(1);
    }
  }

  private getMetric(suiteName: string): string {
    const result = this.results.find(r => r.suite === suiteName);
    if (!result) return chalk.gray('Not run');
    
    if (result.passed) {
      return chalk.green(`Passed (${result.tests.passed}/${result.tests.total})`);
    } else {
      return chalk.red(`Failed (${result.tests.failed} failures)`);
    }
  }
}

// Run tests if executed directly
if (require.main === module) {
  const runner = new TestRunner();
  runner.run().catch(error => {
    console.error(chalk.red('Test runner failed:'), error);
    process.exit(1);
  });
}

export { TestRunner };