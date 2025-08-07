#!/usr/bin/env ts-node
/**
 * Azure Deployment Test Runner
 * Executes all Azure integration tests and generates comprehensive report
 */

import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

interface TestResult {
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  error?: string;
  logs?: string[];
}

interface TestReport {
  timestamp: string;
  environment: {
    subscriptionId?: string;
    resourceGroup?: string;
    location?: string;
    registryServer?: string;
    nodeVersion: string;
    platform: string;
  };
  tests: TestResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    duration: number;
  };
  azureResources?: {
    containersCreated: number;
    containersDeleted: number;
    errors: string[];
  };
}

class AzureTestRunner {
  private report: TestReport;
  private startTime: number;

  constructor() {
    this.startTime = Date.now();
    this.report = {
      timestamp: new Date().toISOString(),
      environment: {
        subscriptionId: process.env.AZURE_SUBSCRIPTION_ID,
        resourceGroup: process.env.AZURE_RESOURCE_GROUP,
        location: process.env.AZURE_LOCATION,
        registryServer: process.env.AZURE_CONTAINER_REGISTRY_SERVER,
        nodeVersion: process.version,
        platform: process.platform
      },
      tests: [],
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        duration: 0
      },
      azureResources: {
        containersCreated: 0,
        containersDeleted: 0,
        errors: []
      }
    };
  }

  async validateEnvironment(): Promise<boolean> {
    console.log('🔍 Validating Azure environment...\n');

    const requiredVars = [
      'AZURE_SUBSCRIPTION_ID',
      'AZURE_RESOURCE_GROUP',
      'AZURE_CLIENT_ID',
      'AZURE_CLIENT_SECRET',
      'AZURE_TENANT_ID',
      'AZURE_CONTAINER_REGISTRY_SERVER'
    ];

    const missing = requiredVars.filter(v => !process.env[v]);

    if (missing.length > 0) {
      console.error('❌ Missing required environment variables:');
      missing.forEach(v => console.error(`   - ${v}`));
      console.error('\nRun "node configure-azure.js" to set up Azure credentials.\n');
      return false;
    }

    console.log('✅ All required environment variables are set');
    console.log(`📋 Subscription: ${process.env.AZURE_SUBSCRIPTION_ID}`);
    console.log(`📦 Resource Group: ${process.env.AZURE_RESOURCE_GROUP}`);
    console.log(`🏷️  Registry: ${process.env.AZURE_CONTAINER_REGISTRY_SERVER}\n`);

    // Test Azure CLI access
    try {
      execSync('az account show', { stdio: 'pipe' });
      console.log('✅ Azure CLI is authenticated\n');
    } catch (error) {
      console.warn('⚠️  Azure CLI not authenticated - some tests may fail\n');
    }

    return true;
  }

  async runTest(testFile: string): Promise<TestResult> {
    const testName = path.basename(testFile, '.test.ts');
    console.log(`\n🧪 Running test: ${testName}`);
    console.log('━'.repeat(60));

    const startTime = Date.now();
    const result: TestResult = {
      name: testName,
      status: 'passed',
      duration: 0,
      logs: []
    };

    try {
      // Run the test with increased timeout and memory
      const output = execSync(
        `npx jest ${testFile} --testTimeout=300000 --forceExit --detectOpenHandles`,
        {
          cwd: path.join(__dirname, '..'),
          env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=4096' },
          maxBuffer: 10 * 1024 * 1024, // 10MB buffer
          timeout: 600000 // 10 minute timeout
        }
      ).toString();

      result.logs = output.split('\n').filter(line => line.trim());
      
      // Parse test output for container metrics
      const containerMatches = output.match(/Created container: ([\w-]+)/g) || [];
      this.report.azureResources!.containersCreated += containerMatches.length;

      const deletedMatches = output.match(/Deleted resource: ([\w-]+)/g) || [];
      this.report.azureResources!.containersDeleted += deletedMatches.length;

      console.log('✅ Test passed');
    } catch (error: any) {
      result.status = 'failed';
      result.error = error.message;
      result.logs = error.stdout?.toString().split('\n').filter((line: string) => line.trim()) || [];
      
      console.error('❌ Test failed');
      console.error(error.stderr?.toString() || error.message);

      // Extract Azure errors
      const azureErrors = (error.stderr?.toString() || '').match(/Error:.*Azure.*/g) || [];
      this.report.azureResources!.errors.push(...azureErrors);
    }

    result.duration = Date.now() - startTime;
    console.log(`⏱️  Duration: ${(result.duration / 1000).toFixed(2)}s`);

    return result;
  }

  async runAllTests(): Promise<void> {
    const testFiles = [
      'real-azure-operations.test.ts',
      'real-azure-deployment-comprehensive.test.ts',
      'real-git-operations-aci.test.ts'
    ];

    console.log(`\n🚀 Running ${testFiles.length} Azure integration test suites\n`);

    for (const testFile of testFiles) {
      const testPath = path.join(__dirname, 'integration', testFile);
      
      if (!fs.existsSync(testPath)) {
        console.warn(`⚠️  Test file not found: ${testFile}`);
        continue;
      }

      const result = await this.runTest(testPath);
      this.report.tests.push(result);
      this.report.summary.total++;
      
      switch (result.status) {
        case 'passed':
          this.report.summary.passed++;
          break;
        case 'failed':
          this.report.summary.failed++;
          break;
        case 'skipped':
          this.report.summary.skipped++;
          break;
      }

      // Add delay between tests to avoid Azure rate limiting
      if (testFiles.indexOf(testFile) < testFiles.length - 1) {
        console.log('\n⏳ Waiting 30 seconds before next test suite...');
        await new Promise(resolve => setTimeout(resolve, 30000));
      }
    }

    this.report.summary.duration = Date.now() - this.startTime;
  }

  async generateReport(): Promise<void> {
    console.log('\n\n📊 TEST SUMMARY');
    console.log('═'.repeat(60));
    console.log(`Total Tests: ${this.report.summary.total}`);
    console.log(`✅ Passed: ${this.report.summary.passed}`);
    console.log(`❌ Failed: ${this.report.summary.failed}`);
    console.log(`⏭️  Skipped: ${this.report.summary.skipped}`);
    console.log(`⏱️  Total Duration: ${(this.report.summary.duration / 1000 / 60).toFixed(2)} minutes`);
    
    console.log('\n🔧 Azure Resources');
    console.log(`Containers Created: ${this.report.azureResources!.containersCreated}`);
    console.log(`Containers Deleted: ${this.report.azureResources!.containersDeleted}`);
    console.log(`Errors: ${this.report.azureResources!.errors.length}`);

    // Save detailed report
    const reportDir = path.join(__dirname, '../test-results');
    fs.mkdirSync(reportDir, { recursive: true });
    
    const reportPath = path.join(reportDir, `azure-test-report-${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(this.report, null, 2));
    
    console.log(`\n📄 Detailed report saved to: ${reportPath}`);

    // Save summary report
    const summaryPath = path.join(reportDir, 'azure-test-summary.md');
    const summary = this.generateMarkdownSummary();
    fs.writeFileSync(summaryPath, summary);
    
    console.log(`📄 Summary report saved to: ${summaryPath}\n`);
  }

  private generateMarkdownSummary(): string {
    const duration = (this.report.summary.duration / 1000 / 60).toFixed(2);
    const passRate = ((this.report.summary.passed / this.report.summary.total) * 100).toFixed(1);

    let md = `# Azure Deployment Test Report\n\n`;
    md += `**Generated:** ${this.report.timestamp}\n`;
    md += `**Duration:** ${duration} minutes\n`;
    md += `**Pass Rate:** ${passRate}%\n\n`;

    md += `## Environment\n`;
    md += `- **Subscription:** ${this.report.environment.subscriptionId}\n`;
    md += `- **Resource Group:** ${this.report.environment.resourceGroup}\n`;
    md += `- **Location:** ${this.report.environment.location}\n`;
    md += `- **Registry:** ${this.report.environment.registryServer}\n\n`;

    md += `## Test Results\n\n`;
    md += `| Test Suite | Status | Duration | Notes |\n`;
    md += `|------------|--------|----------|-------|\n`;

    for (const test of this.report.tests) {
      const duration = (test.duration / 1000).toFixed(2);
      const status = test.status === 'passed' ? '✅' : test.status === 'failed' ? '❌' : '⏭️';
      const notes = test.error ? test.error.substring(0, 50) + '...' : '-';
      md += `| ${test.name} | ${status} | ${duration}s | ${notes} |\n`;
    }

    md += `\n## Azure Resources\n`;
    md += `- **Containers Created:** ${this.report.azureResources!.containersCreated}\n`;
    md += `- **Containers Cleaned Up:** ${this.report.azureResources!.containersDeleted}\n`;
    md += `- **Errors:** ${this.report.azureResources!.errors.length}\n`;

    if (this.report.azureResources!.errors.length > 0) {
      md += `\n### Errors\n`;
      this.report.azureResources!.errors.forEach((error, i) => {
        md += `${i + 1}. ${error}\n`;
      });
    }

    md += `\n## Recommendations\n`;
    if (this.report.summary.failed > 0) {
      md += `- ⚠️ ${this.report.summary.failed} tests failed - review logs for details\n`;
    }
    if (this.report.azureResources!.containersCreated > this.report.azureResources!.containersDeleted) {
      md += `- ⚠️ Some containers may not have been cleaned up - check Azure portal\n`;
    }
    if (passRate === '100') {
      md += `- ✅ All tests passed! Azure deployment is fully functional\n`;
    }

    return md;
  }

  async cleanupOrphanedResources(): Promise<void> {
    console.log('\n🧹 Checking for orphaned Azure resources...');
    
    try {
      // List all container groups in resource group
      const output = execSync(
        `az container list --resource-group ${process.env.AZURE_RESOURCE_GROUP} --query "[?contains(name, 'test-')].name" -o tsv`,
        { encoding: 'utf8' }
      );

      const orphanedContainers = output.trim().split('\n').filter(name => name);
      
      if (orphanedContainers.length > 0) {
        console.log(`Found ${orphanedContainers.length} test containers to clean up`);
        
        for (const container of orphanedContainers) {
          try {
            console.log(`  Deleting: ${container}`);
            execSync(
              `az container delete --resource-group ${process.env.AZURE_RESOURCE_GROUP} --name ${container} --yes`,
              { stdio: 'pipe' }
            );
          } catch (error) {
            console.error(`  Failed to delete ${container}`);
          }
        }
      } else {
        console.log('No orphaned test containers found');
      }
    } catch (error) {
      console.error('Failed to check for orphaned resources:', error);
    }
  }
}

// Main execution
async function main() {
  console.log('🚀 Azure Deployment Test Suite\n');
  console.log('This will run comprehensive tests against real Azure services.');
  console.log('Tests may take 15-30 minutes to complete.\n');

  const runner = new AzureTestRunner();

  // Validate environment
  if (!await runner.validateEnvironment()) {
    process.exit(1);
  }

  try {
    // Run all tests
    await runner.runAllTests();
    
    // Generate report
    await runner.generateReport();
    
    // Cleanup orphaned resources
    await runner.cleanupOrphanedResources();
    
    // Exit with appropriate code
    process.exit(runner.report.summary.failed > 0 ? 1 : 0);
  } catch (error) {
    console.error('\n💥 Fatal error:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}

export { AzureTestRunner };