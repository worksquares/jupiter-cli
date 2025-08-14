/**
 * Static Web App Manager
 * Handles deployment and management of Azure Static Web Apps via Azure API
 */

import { Logger } from '../utils/logger';
import { JupiterDBClient } from '../database/jupiter-db-client';
import { v4 as uuidv4 } from 'uuid';
import { AzureAPIClient } from '../clients/azure-api-client';
import { azureAPIConfig } from '../config/azure-api-config';
import { DigisquaresDNSManager } from '../dns/digisquares-dns-manager';

export interface StaticWebAppConfig {
  subscriptionId: string;
  resourceGroup: string;
  location?: string;
  baseDomain?: string;
  githubToken?: string;
}

export interface CreateStaticWebAppOptions {
  name: string;
  projectId: string;
  taskId: string;
  repositoryUrl: string;
  branch: string;
  framework: 'react' | 'vue' | 'angular' | 'vanilla';
  buildConfig?: {
    appLocation?: string;
    apiLocation?: string;
    outputLocation?: string;
    appBuildCommand?: string;
    apiBuildCommand?: string;
  };
  environmentVariables?: Record<string, string>;
}

export interface DeploymentResult {
  staticWebAppId: string;
  deploymentId: string;
  defaultHostname: string;
  deploymentToken: string;
  customDomain?: string;
  status: 'provisioning' | 'deploying' | 'active' | 'failed';
}

export interface DomainConfiguration {
  domainName: string;
  validationToken?: string;
  sslStatus?: 'pending' | 'provisioning' | 'active' | 'failed';
}

export class StaticWebAppManager {
  private azureClient: AzureAPIClient;
  private logger: Logger;
  private db: JupiterDBClient;
  private config: StaticWebAppConfig;
  private dnsManager: DigisquaresDNSManager;

  constructor(config: StaticWebAppConfig, db: JupiterDBClient) {
    this.config = config;
    this.db = db;
    this.logger = new Logger('StaticWebAppManager');
    this.azureClient = new AzureAPIClient(azureAPIConfig);
    this.dnsManager = new DigisquaresDNSManager(
      { baseDomain: 'digisquares.in', enableSSL: true },
      db
    );
  }

  /**
   * Create a new Static Web App
   */
  async createStaticWebApp(options: CreateStaticWebAppOptions): Promise<DeploymentResult> {
    const swaId = uuidv4();
    const deploymentId = uuidv4();
    
    try {
      this.logger.info('Creating Static Web App', { name: options.name });

      // Default build configuration based on framework
      const buildConfig = this.getBuildConfig(options.framework, options.buildConfig);

      // Create Static Web App via Azure API
      const swaRequest = {
        name: options.name,
        repositoryUrl: options.repositoryUrl,
        branch: options.branch,
        resourceGroup: this.config.resourceGroup,
        location: this.config.location || 'eastus2',
        buildCommand: buildConfig.appBuildCommand,
        apiLocation: buildConfig.apiLocation,
        outputLocation: buildConfig.outputLocation
      };

      // Deploy the Static Web App
      const response = await this.azureClient.deploySWA(swaRequest);
      
      if (!response.success) {
        throw new Error(`Failed to create Static Web App: ${response.error || response.message}`);
      }

      const result = response.data;
      const defaultHostname = result.defaultHostname || `${options.name}.azurestaticapps.net`;
      const deploymentToken = result.deploymentToken || result.apiKey || '';

      // Save to database
      await this.saveStaticWebApp({
        id: swaId,
        projectId: options.projectId,
        taskId: options.taskId,
        deploymentId,
        appName: options.name,
        resourceGroup: this.config.resourceGroup,
        location: this.config.location || 'eastus2',
        framework: options.framework,
        buildConfig: JSON.stringify(buildConfig),
        deploymentToken,
        defaultHostname: defaultHostname,
        status: 'provisioning'
      });

      // Set environment variables if provided
      if (options.environmentVariables) {
        await this.setEnvironmentVariables(swaId, options.name, options.environmentVariables);
      }

      // Automatically assign digisquares.in subdomain
      const subdomainResult = await this.dnsManager.assignSubdomain({
        projectName: options.name,
        deploymentType: 'static-web-app',
        targetEndpoint: defaultHostname,
        enableSSL: true,
        description: `Static Web App for ${options.name}`,
        tags: {
          deploymentId,
          swaId,
          repository: options.repositoryUrl
        }
      });
      
      const customDomain = subdomainResult.fullDomain;
      
      this.logger.info('Digisquares.in subdomain assigned', {
        subdomain: subdomainResult.subdomain,
        fullDomain: customDomain,
        ssl: subdomainResult.sslEnabled
      });

      this.logger.info('Static Web App created', {
        name: options.name,
        hostname: defaultHostname,
        customDomain
      });

      return {
        staticWebAppId: swaId,
        deploymentId,
        defaultHostname: defaultHostname,
        deploymentToken,
        customDomain,
        status: 'provisioning'
      };
    } catch (error) {
      this.logger.error('Failed to create Static Web App', error as Error);
      
      // Update status in database
      await this.updateStaticWebAppStatus(swaId, 'failed', (error as Error).message);
      
      throw error;
    }
  }

  /**
   * Deploy to an existing Static Web App
   */
  async deployToStaticWebApp(
    staticWebAppId: string,
    deploymentId: string
  ): Promise<void> {
    try {
      // Get Static Web App details from database
      const swa = await this.getStaticWebApp(staticWebAppId);
      if (!swa) {
        throw new Error('Static Web App not found');
      }

      // Update deployment status
      await this.updateDeploymentStatus(deploymentId, 'deploying');

      // The actual deployment happens via GitHub Actions triggered by the push
      // We'll monitor the deployment status
      await this.monitorDeployment(swa.app_name, deploymentId);

      // Update status
      await this.updateStaticWebAppStatus(staticWebAppId, 'active');
      await this.updateDeploymentStatus(deploymentId, 'deployed');

    } catch (error) {
      this.logger.error('Deployment failed', error);
      await this.updateDeploymentStatus(deploymentId, 'failed');
      throw error;
    }
  }

  /**
   * Configure custom domain
   */
  async configureCustomDomain(
    staticWebAppId: string,
    appName: string,
    domainName: string
  ): Promise<DomainConfiguration> {
    try {
      this.logger.info('Configuring custom domain', { appName, domainName });

      // Configure custom domain via Azure API
      const domainResponse = await this.azureClient.configureDNS(
        domainName,
        `${appName}.azurestaticapps.net`,
        'CNAME'
      );

      if (!domainResponse.success) {
        throw new Error(`Failed to configure domain: ${domainResponse.error || domainResponse.message}`);
      }

      const domain = domainResponse.data;

      const validationToken = domain.validationToken || '';

      // Save domain configuration
      await this.saveDomainConfiguration({
        staticWebAppId,
        domainName,
        validationToken,
        sslStatus: 'pending'
      });

      return {
        domainName,
        validationToken,
        sslStatus: 'pending'
      };
    } catch (error) {
      this.logger.error('Failed to configure custom domain', error);
      throw error;
    }
  }

  /**
   * Get build configuration based on framework
   */
  private getBuildConfig(framework: string, customConfig?: any): any {
    const defaultConfigs: Record<string, any> = {
      react: {
        appLocation: '/',
        apiLocation: 'api',
        outputLocation: 'dist',
        appBuildCommand: 'npm run build',
        apiBuildCommand: 'npm run build'
      },
      vue: {
        appLocation: '/',
        apiLocation: 'api',
        outputLocation: 'dist',
        appBuildCommand: 'npm run build',
        apiBuildCommand: 'npm run build'
      },
      angular: {
        appLocation: '/',
        apiLocation: 'api',
        outputLocation: 'dist',
        appBuildCommand: 'npm run build',
        apiBuildCommand: 'npm run build'
      },
      vanilla: {
        appLocation: '/',
        apiLocation: 'api',
        outputLocation: '/',
        appBuildCommand: '',
        apiBuildCommand: ''
      }
    };

    return {
      ...defaultConfigs[framework],
      ...customConfig
    };
  }


  /**
   * Set environment variables for Static Web App
   */
  private async setEnvironmentVariables(
    staticWebAppId: string,
    appName: string,
    variables: Record<string, string>
  ): Promise<void> {
    try {
      // Set environment variables via API (if supported)
      // Note: Environment variables might need to be set during deployment
      this.logger.info('Setting environment variables', { 
        appName, 
        envVarsCount: Object.keys(variables).length 
      });

      // Save to database
      for (const [key, value] of Object.entries(variables)) {
        await this.saveEnvironmentVariable(staticWebAppId, key, value);
      }
    } catch (error) {
      this.logger.error('Failed to set environment variables', error);
      throw error;
    }
  }

  /**
   * Monitor deployment status
   */
  private async monitorDeployment(
    appName: string,
    deploymentId: string,
    maxAttempts: number = 60,
    intervalMs: number = 5000
  ): Promise<void> {
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        // Get status from Azure API
        const statusResponse = await this.azureClient.getSWAStatus(appName);
        
        if (!statusResponse.success) {
          this.logger.warn('Failed to get SWA status', { appName, error: statusResponse.error });
          // Continue polling
        } else {
          const swaData = statusResponse.data;
          
          if (swaData.status === 'Running' || swaData.status === 'Ready') {
            this.logger.info('Deployment successful', { deploymentId });
            return;
          } else if (swaData.status === 'Failed') {
            throw new Error('Deployment failed');
          }
        }

        // Wait before next attempt
        await new Promise(resolve => setTimeout(resolve, intervalMs));
        attempts++;
      } catch (error) {
        this.logger.error('Error monitoring deployment', error);
        throw error;
      }
    }

    throw new Error('Deployment timeout');
  }

  /**
   * Database operations
   */
  private async saveStaticWebApp(data: any): Promise<void> {
    await this.db.execute(
      `INSERT INTO static_web_apps 
       (id, project_id, task_id, deployment_id, app_name, resource_group, 
        location, framework, build_config, deployment_token, default_hostname, 
        status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        data.id, data.projectId, data.taskId, data.deploymentId,
        data.appName, data.resourceGroup, data.location, data.framework,
        data.buildConfig, data.deploymentToken, data.defaultHostname,
        data.status
      ]
    );
  }

  private async getStaticWebApp(id: string): Promise<any> {
    return this.db.queryOne(
      'SELECT * FROM static_web_apps WHERE id = ?',
      [id]
    );
  }

  private async updateStaticWebAppStatus(
    id: string,
    status: string,
    errorMessage?: string
  ): Promise<void> {
    const updates: any = { status, updated_at: new Date() };
    if (errorMessage) updates.error_message = errorMessage;
    if (status === 'active') updates.deployed_at = new Date();

    const setClause = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const values = Object.values(updates);
    values.push(id);

    await this.db.execute(
      `UPDATE static_web_apps SET ${setClause} WHERE id = ?`,
      values
    );
  }

  private async updateDeploymentStatus(id: string, status: string): Promise<void> {
    await this.db.execute(
      'UPDATE deployments SET status = ?, updated_at = NOW() WHERE id = ?',
      [status, id]
    );
  }

  private async saveDomainConfiguration(data: {
    staticWebAppId: string;
    domainName: string;
    validationToken: string;
    sslStatus: string;
  }): Promise<void> {
    const id = uuidv4();
    const parts = data.domainName.split('.');
    const subdomain = parts[0];
    const baseDomain = parts.slice(1).join('.');

    await this.db.execute(
      `INSERT INTO frontend_domains 
       (id, static_web_app_id, domain_name, subdomain, base_domain, 
        ssl_status, dns_validation_token, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        id, data.staticWebAppId, data.domainName, subdomain,
        baseDomain, data.sslStatus, data.validationToken
      ]
    );
  }

  private async saveEnvironmentVariable(
    staticWebAppId: string,
    key: string,
    value: string,
    isSecret: boolean = false
  ): Promise<void> {
    const id = uuidv4();
    await this.db.execute(
      `INSERT INTO deployment_env_vars 
       (id, static_web_app_id, \`key\`, value, is_secret, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE value = ?, updated_at = NOW()`,
      [id, staticWebAppId, key, value, isSecret, value]
    );
  }
}