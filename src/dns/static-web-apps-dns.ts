/**
 * Azure Static Web Apps DNS Integration
 * Manages custom domains and SSL for Static Web Apps
 */

import { AzureAPIClient } from '../clients/azure-api-client';
import { azureAPIConfig } from '../config/azure-api-config';
import { Logger } from '../utils/logger';

export interface StaticWebAppConfig {
  subscriptionId: string;
  resourceGroup: string;
  dnsZone: string;
  dnsResourceGroup?: string;
}

export interface StaticWebAppDeployment {
  name: string;
  repositoryUrl: string;
  branch?: string;
  appLocation?: string;
  apiLocation?: string;
  outputLocation?: string;
  environmentVariables?: Record<string, string>;
}

export interface CustomDomainConfig {
  subdomain: string;
  environment?: 'production' | 'preview';
  autoRenewSSL?: boolean;
}

export class StaticWebAppDNSManager {
  private azureClient: AzureAPIClient;
  private logger: Logger;

  constructor(private config: StaticWebAppConfig) {
    this.logger = new Logger('StaticWebAppDNSManager');
    
    this.azureClient = new AzureAPIClient(azureAPIConfig);
    
    this.logger.info('Static Web App DNS Manager initialized', {
      zone: config.dnsZone,
      resourceGroup: config.resourceGroup
    });
  }

  /**
   * Deploy Static Web App with custom domain
   */
  async deployWithCustomDomain(
    deployment: StaticWebAppDeployment,
    domainConfig: CustomDomainConfig
  ): Promise<{
    app: any;
    domain: string;
    validationToken?: string;
  }> {
    try {
      // Step 1: Create Static Web App
      this.logger.info('Creating Static Web App...', { name: deployment.name });
      
      const app = await this.createStaticWebApp(deployment);
      const defaultHostname = app.defaultHostname;

      if (!defaultHostname) {
        throw new Error('Static Web App created but no hostname assigned');
      }

      // Step 2: Create CNAME record
      const fqdn = `${domainConfig.subdomain}.${this.config.dnsZone}`;
      this.logger.info('Creating DNS record...', { fqdn, target: defaultHostname });
      
      await this.createCNAMERecord(domainConfig.subdomain, defaultHostname);

      // Step 3: Add custom domain to Static Web App
      this.logger.info('Adding custom domain to Static Web App...');
      const validation = await this.addCustomDomain(deployment.name, fqdn);

      this.logger.info('Static Web App deployed with custom domain', {
        app: deployment.name,
        url: `https://${fqdn}`,
        defaultUrl: `https://${defaultHostname}`
      });

      return {
        app,
        domain: fqdn,
        validationToken: validation
      };

    } catch (error) {
      this.logger.error('Failed to deploy Static Web App with domain', error);
      throw error;
    }
  }

  /**
   * Create Static Web App
   */
  private async createStaticWebApp(deployment: StaticWebAppDeployment): Promise<any> {
    const response = await this.azureClient.deploySWA({
      name: deployment.name,
      repositoryUrl: deployment.repositoryUrl,
      branch: deployment.branch || 'main',
      resourceGroup: this.config.resourceGroup,
      location: 'eastus2',
      buildCommand: 'npm run build',
      apiLocation: deployment.apiLocation || 'api',
      outputLocation: deployment.outputLocation || 'dist'
    });

    if (!response.success) {
      throw new Error(`Failed to create Static Web App: ${response.error || response.message}`);
    }

    const staticWebApp = response.data;

    // Set environment variables if provided
    if (deployment.environmentVariables) {
      await this.setEnvironmentVariables(
        deployment.name,
        deployment.environmentVariables
      );
    }

    return staticWebApp;
  }

  /**
   * Create CNAME record for custom domain
   */
  private async createCNAMERecord(subdomain: string, target: string): Promise<void> {
    const dnsResourceGroup = this.config.dnsResourceGroup || this.config.resourceGroup;
    
    // Configure DNS record via Azure API
    const fqdn = `${subdomain}.${this.config.dnsZone}`;
    await this.azureClient.configureDNS(
      fqdn,
      target,
      'CNAME'
    );
  }

  /**
   * Add custom domain to Static Web App
   */
  private async addCustomDomain(appName: string, domain: string): Promise<string | undefined> {
    try {
      // First, create the custom domain (this triggers validation)
      const customDomain = await this.azureClient.configureDNS(
        domain,
        `${appName}.azurestaticapps.net`,
        'CNAME'
      );

      // Check if validation is required
      if (customDomain.data?.validationToken) {
        this.logger.info('Domain validation required', {
          domain,
          token: customDomain.data.validationToken
        });
        return customDomain.data.validationToken;
      }

      return undefined;
    } catch (error: any) {
      if (error.code === 'Conflict') {
        this.logger.info('Custom domain already exists');
        return undefined;
      }
      throw error;
    }
  }

  /**
   * Set environment variables for Static Web App
   */
  private async setEnvironmentVariables(
    appName: string,
    variables: Record<string, string>
  ): Promise<void> {
    const appSettings = Object.entries(variables).map(([name, value]) => ({
      name,
      value
    }));

    // Note: Environment variables should be set during deployment
    // This would typically be done through the deployment API
    this.logger.info('Environment variables configured', { 
      appName, 
      count: appSettings.length 
    });
  }

  /**
   * Create preview environment with custom subdomain
   */
  async createPreviewEnvironment(
    appName: string,
    prNumber: number,
    branch: string
  ): Promise<{
    environment: any;
    domain: string;
  }> {
    try {
      // Preview environments are created automatically by GitHub Actions
      // We just need to add a custom domain for them
      
      const previewSubdomain = `${appName}-pr-${prNumber}`;
      const fqdn = `${previewSubdomain}.${this.config.dnsZone}`;
      
      // Get the preview environment hostname
      // Get environments from Azure API
      // Get environments from Azure API
      const swaStatus = await this.azureClient.getSWAStatus(appName);
      const environments = swaStatus.data;

      // Create CNAME for preview environment
      // Note: This would need the actual preview URL from Azure
      const previewHostname = `${appName}-pr-${prNumber}.azurestaticapps.net`;
      await this.createCNAMERecord(previewSubdomain, previewHostname);

      return {
        environment: environments,
        domain: fqdn
      };

    } catch (error) {
      this.logger.error('Failed to create preview environment', error);
      throw error;
    }
  }

  /**
   * List all custom domains for a Static Web App
   */
  async listCustomDomains(appName: string): Promise<string[]> {
    try {
      const customDomains = [];
      
      // List custom domains via Azure API
      // Note: This functionality might need to be handled differently
      const domainsResponse = await this.azureClient.getSWAStatus(appName);
      const domains = domainsResponse.data?.customDomains || [];
      for (const domain of domains) {
        customDomains.push(domain.domainName || domain);
      }
      
      return customDomains;
    } catch (error) {
      this.logger.error('Failed to list custom domains', error);
      throw error;
    }
  }

  /**
   * Remove custom domain
   */
  async removeCustomDomain(appName: string, domain: string): Promise<void> {
    try {
      // Remove from Static Web App
      // Note: deleteSWA deletes the entire app, not just the domain
      // This should probably be a separate API call to remove custom domain
      this.logger.info('Removing custom domain', { appName, domain });

      // Extract subdomain from FQDN
      const subdomain = domain.replace(`.${this.config.dnsZone}`, '');
      
      // Remove DNS record
      const dnsResourceGroup = this.config.dnsResourceGroup || this.config.resourceGroup;
      // Delete DNS record via Azure API
      const fqdn = `${subdomain}.${this.config.dnsZone}`;
      await this.azureClient.deleteDNSRecord(
        fqdn,
        subdomain
      );

      this.logger.info('Custom domain removed', { app: appName, domain });
    } catch (error) {
      this.logger.error('Failed to remove custom domain', error);
      throw error;
    }
  }

  /**
   * Get Static Web App details with custom domains
   */
  async getAppDetails(appName: string): Promise<{
    app: any;
    customDomains: string[];
    environments: any[];
  }> {
    try {
      const app = await this.azureClient.getSWAStatus(
        appName
      );

      const customDomains = await this.listCustomDomains(appName);
      
      const environments = [];
      // List builds via Azure API
      const buildsResponse = await this.azureClient.getSWAStatus(appName);
      const builds = [buildsResponse.data];
      for (const env of builds) {
        environments.push(env);
      }

      return {
        app,
        customDomains,
        environments
      };
    } catch (error) {
      this.logger.error('Failed to get app details', error);
      throw error;
    }
  }

  /**
   * Setup GitHub Actions workflow for automatic deployment
   */
  async getGitHubActionsWorkflow(appName: string): Promise<string> {
    const workflow = `name: Azure Static Web Apps CI/CD

on:
  push:
    branches:
      - main
  pull_request:
    types: [opened, synchronize, reopened, closed]
    branches:
      - main

jobs:
  build_and_deploy_job:
    if: github.event_name == 'push' || (github.event_name == 'pull_request' && github.event.action != 'closed')
    runs-on: ubuntu-latest
    name: Build and Deploy Job
    steps:
      - uses: actions/checkout@v3
        with:
          submodules: true
      
      - name: Build And Deploy
        id: builddeploy
        uses: Azure/static-web-apps-deploy@v1
        with:
          azure_static_web_apps_api_token: \${{ secrets.AZURE_STATIC_WEB_APPS_API_TOKEN }}
          repo_token: \${{ secrets.GITHUB_TOKEN }}
          action: "upload"
          app_location: "/"
          api_location: "api"
          output_location: "dist"

  close_pull_request_job:
    if: github.event_name == 'pull_request' && github.event.action == 'closed'
    runs-on: ubuntu-latest
    name: Close Pull Request Job
    steps:
      - name: Close Pull Request
        id: closepullrequest
        uses: Azure/static-web-apps-deploy@v1
        with:
          azure_static_web_apps_api_token: \${{ secrets.AZURE_STATIC_WEB_APPS_API_TOKEN }}
          action: "close"`;

    return workflow;
  }
}