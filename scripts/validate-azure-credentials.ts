#!/usr/bin/env ts-node

/**
 * Azure Credentials Validation Script
 * Validates that all Azure credentials are properly configured
 */

import { DefaultAzureCredential } from '@azure/identity';
import { ContainerInstanceManagementClient } from '@azure/arm-containerinstance';
import { WebSiteManagementClient } from '@azure/arm-appservice';
import { ContainerRegistryManagementClient } from '@azure/arm-containerregistry';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';

// Load environment variables
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
  console.log(chalk.green('✅ Loaded .env file'));
} else {
  console.log(chalk.red('❌ No .env file found. Please run setup-azure-credentials script first.'));
  process.exit(1);
}

interface ValidationResult {
  name: string;
  success: boolean;
  message: string;
  details?: any;
}

class AzureCredentialsValidator {
  private results: ValidationResult[] = [];

  async validate(): Promise<void> {
    console.log(chalk.bold.blue('\n🔍 Azure Credentials Validator\n'));

    // Validate environment variables
    await this.validateEnvironmentVariables();

    // Validate Azure authentication
    await this.validateAzureAuth();

    // Validate resource access
    await this.validateResourceAccess();

    // Display results
    this.displayResults();
  }

  private async validateEnvironmentVariables(): Promise<void> {
    console.log(chalk.yellow('📋 Validating Environment Variables...'));

    const requiredVars = [
      'AZURE_SUBSCRIPTION_ID',
      'AZURE_RESOURCE_GROUP',
      'AZURE_LOCATION',
      'AZURE_CONTAINER_REGISTRY',
      'AZURE_CLIENT_ID',
      'AZURE_CLIENT_SECRET',
      'AZURE_TENANT_ID'
    ];

    const optionalVars = [
      'AZURE_CONTAINER_REGISTRY_USERNAME',
      'AZURE_CONTAINER_REGISTRY_PASSWORD',
      'GITHUB_TOKEN',
      'COSMOS_API_KEY'
    ];

    // Check required variables
    for (const varName of requiredVars) {
      const value = process.env[varName];
      if (value && value !== `your-${varName.toLowerCase()}`) {
        this.results.push({
          name: `Environment: ${varName}`,
          success: true,
          message: 'Set',
          details: `${value.substring(0, 8)}...`
        });
      } else {
        this.results.push({
          name: `Environment: ${varName}`,
          success: false,
          message: 'Missing or invalid'
        });
      }
    }

    // Check optional variables
    for (const varName of optionalVars) {
      const value = process.env[varName];
      if (value && !value.includes('your-')) {
        this.results.push({
          name: `Environment: ${varName}`,
          success: true,
          message: 'Set (optional)',
          details: `${value.substring(0, 8)}...`
        });
      } else {
        this.results.push({
          name: `Environment: ${varName}`,
          success: false,
          message: 'Not configured (optional)'
        });
      }
    }
  }

  private async validateAzureAuth(): Promise<void> {
    console.log(chalk.yellow('\n🔐 Validating Azure Authentication...'));

    try {
      const credential = new DefaultAzureCredential();
      const token = await credential.getToken('https://management.azure.com/.default');
      
      if (token) {
        this.results.push({
          name: 'Azure Authentication',
          success: true,
          message: 'Successfully authenticated',
          details: `Token expires: ${new Date(token.expiresOnTimestamp).toLocaleString()}`
        });
      }
    } catch (error: any) {
      this.results.push({
        name: 'Azure Authentication',
        success: false,
        message: 'Authentication failed',
        details: error.message
      });
    }
  }

  private async validateResourceAccess(): Promise<void> {
    console.log(chalk.yellow('\n🔧 Validating Resource Access...'));

    const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID;
    const resourceGroup = process.env.AZURE_RESOURCE_GROUP;
    const acrName = process.env.AZURE_CONTAINER_REGISTRY;

    if (!subscriptionId || !resourceGroup) {
      this.results.push({
        name: 'Resource Access',
        success: false,
        message: 'Missing subscription or resource group'
      });
      return;
    }

    try {
      const credential = new DefaultAzureCredential();

      // Test Container Instance access
      try {
        const aciClient = new ContainerInstanceManagementClient(credential, subscriptionId);
        const containerGroups = await aciClient.containerGroups.list();
        
        this.results.push({
          name: 'Container Instance Access',
          success: true,
          message: 'Can access Container Instances',
          details: 'List permission verified'
        });
      } catch (error: any) {
        this.results.push({
          name: 'Container Instance Access',
          success: false,
          message: 'Cannot access Container Instances',
          details: error.message
        });
      }

      // Test Static Web Apps access
      try {
        const swaClient = new WebSiteManagementClient(credential, subscriptionId);
        const staticSites = await swaClient.staticSites.list();
        
        this.results.push({
          name: 'Static Web Apps Access',
          success: true,
          message: 'Can access Static Web Apps',
          details: 'List permission verified'
        });
      } catch (error: any) {
        this.results.push({
          name: 'Static Web Apps Access',
          success: false,
          message: 'Cannot access Static Web Apps',
          details: error.message
        });
      }

      // Test Container Registry access
      if (acrName) {
        try {
          const acrClient = new ContainerRegistryManagementClient(credential, subscriptionId);
          const registry = await acrClient.registries.get(resourceGroup, acrName);
          
          this.results.push({
            name: 'Container Registry Access',
            success: true,
            message: 'Can access Container Registry',
            details: `${acrName} - ${registry.sku?.name}`
          });
        } catch (error: any) {
          this.results.push({
            name: 'Container Registry Access',
            success: false,
            message: 'Cannot access Container Registry',
            details: error.message
          });
        }
      }

    } catch (error: any) {
      this.results.push({
        name: 'Resource Access',
        success: false,
        message: 'General access error',
        details: error.message
      });
    }
  }

  private displayResults(): void {
    console.log(chalk.bold.blue('\n\n📊 Validation Results\n'));
    console.log(chalk.gray('─'.repeat(70)));

    let successCount = 0;
    let failureCount = 0;

    for (const result of this.results) {
      const status = result.success ? chalk.green('✅ PASS') : chalk.red('❌ FAIL');
      const name = result.name.padEnd(35);
      const message = result.message;
      
      console.log(`${status} ${name} ${message}`);
      
      if (result.details) {
        console.log(chalk.gray(`     └─ ${result.details}`));
      }

      if (result.success) {
        successCount++;
      } else {
        failureCount++;
      }
    }

    console.log(chalk.gray('─'.repeat(70)));

    // Summary
    console.log(chalk.bold('\n📈 Summary:'));
    console.log(`   Total checks: ${this.results.length}`);
    console.log(`   ${chalk.green(`Passed: ${successCount}`)}`);
    console.log(`   ${chalk.red(`Failed: ${failureCount}`)}`);

    // Recommendations
    if (failureCount > 0) {
      console.log(chalk.yellow('\n💡 Recommendations:'));
      
      const missingEnvVars = this.results
        .filter(r => r.name.startsWith('Environment:') && !r.success && !r.message.includes('optional'))
        .map(r => r.name.replace('Environment: ', ''));
      
      if (missingEnvVars.length > 0) {
        console.log(chalk.white('   1. Run the setup script to configure missing variables:'));
        console.log(chalk.cyan('      ./scripts/setup-azure-credentials.ps1  (Windows)'));
        console.log(chalk.cyan('      ./scripts/setup-azure-credentials.sh   (Linux/macOS)'));
      }

      if (this.results.find(r => r.name === 'Azure Authentication' && !r.success)) {
        console.log(chalk.white('   2. Check your Azure CLI login:'));
        console.log(chalk.cyan('      az login'));
        console.log(chalk.cyan('      az account set --subscription <your-subscription-id>'));
      }

      if (this.results.find(r => r.name.includes('Access') && !r.success)) {
        console.log(chalk.white('   3. Verify service principal permissions:'));
        console.log(chalk.cyan('      az role assignment list --assignee <service-principal-id>'));
      }
    } else {
      console.log(chalk.bold.green('\n✅ All validations passed! Your Azure credentials are properly configured.'));
    }

    // Exit code
    process.exit(failureCount > 0 ? 1 : 0);
  }
}

// Run validation
if (require.main === module) {
  const validator = new AzureCredentialsValidator();
  validator.validate().catch(error => {
    console.error(chalk.red('Validation failed:'), error);
    process.exit(1);
  });
}

export { AzureCredentialsValidator };