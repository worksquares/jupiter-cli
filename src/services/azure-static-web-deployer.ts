/**
 * Azure Static Web Apps Deployer
 * Handles deployment to Azure Static Web Apps using Azure API
 */

import { Logger } from '../utils/logger';
import axios from 'axios';
import FormData from 'form-data';
import * as fs from 'fs';
import * as path from 'path';

export interface StaticWebAppConfig {
  name: string;
  resourceGroup: string;
  location?: string;
  sku?: 'Free' | 'Standard';
  branch?: string;
  apiToken?: string;
}

export interface DeploymentConfig {
  projectId: string;
  artifactPath: string;
  appName?: string;
  environment?: 'production' | 'preview';
}

export class AzureStaticWebDeployer {
  private logger: Logger;
  private subscriptionId: string;
  private apiToken?: string;

  constructor() {
    this.logger = new Logger('AzureStaticWebDeployer');
    this.subscriptionId = process.env.AZURE_SUBSCRIPTION_ID || '';
    this.apiToken = process.env.AZURE_STATIC_WEB_APPS_API_TOKEN;
  }

  /**
   * Deploy to Azure Static Web Apps
   */
  async deploy(config: DeploymentConfig): Promise<{
    success: boolean;
    url?: string;
    error?: string;
  }> {
    try {
      this.logger.info(`Deploying ${config.projectId} to Azure Static Web Apps`);

      // Validate artifact exists
      if (!fs.existsSync(config.artifactPath)) {
        throw new Error(`Artifact not found at ${config.artifactPath}`);
      }

      const appName = config.appName || `jupiter-${config.projectId}`;
      const environment = config.environment || 'production';

      // Deploy using Azure Static Web Apps API
      if (this.apiToken) {
        return await this.deployWithAPIToken(
          config.artifactPath,
          appName,
          environment
        );
      }

      // Deploy using Azure Management API
      return await this.deployWithManagementAPI(
        config.artifactPath,
        appName,
        environment
      );

    } catch (error) {
      this.logger.error('Static Web App deployment failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Deployment failed'
      };
    }
  }

  /**
   * Deploy using API token (GitHub Actions style)
   */
  private async deployWithAPIToken(
    artifactPath: string,
    appName: string,
    environment: string
  ): Promise<{ success: boolean; url?: string; error?: string }> {
    try {
      const deploymentUrl = `https://${appName}.azurestaticapps.net/api/deployment`;
      
      // Create form data with the artifact
      const form = new FormData();
      form.append('app', fs.createReadStream(artifactPath), {
        filename: 'app.zip',
        contentType: 'application/zip'
      });
      form.append('environment', environment);
      form.append('version', Date.now().toString());

      // Deploy to Static Web Apps
      const response = await axios.post(deploymentUrl, form, {
        headers: {
          ...form.getHeaders(),
          'Authorization': `Bearer ${this.apiToken}`,
          'x-ms-static-web-apps-api-token': this.apiToken
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      });

      if (response.status === 200 || response.status === 201) {
        const url = `https://${appName}.azurestaticapps.net`;
        this.logger.info(`Deployment successful: ${url}`);
        
        return {
          success: true,
          url
        };
      }

      throw new Error(`Deployment failed with status ${response.status}`);

    } catch (error) {
      if (axios.isAxiosError(error)) {
        this.logger.error('API token deployment failed:', error.response?.data);
        return {
          success: false,
          error: error.response?.data?.message || error.message
        };
      }
      throw error;
    }
  }

  /**
   * Deploy using Azure Management API
   */
  private async deployWithManagementAPI(
    artifactPath: string,
    appName: string,
    environment: string
  ): Promise<{ success: boolean; url?: string; error?: string }> {
    try {
      // Get access token
      const token = await this.getAccessToken();
      
      const resourceGroup = process.env.AZURE_RESOURCE_GROUP || 'jupiter-ai-rg';
      const apiVersion = '2021-02-01';
      
      // Create or update Static Web App
      const createUrl = `https://management.azure.com/subscriptions/${this.subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Web/staticSites/${appName}?api-version=${apiVersion}`;
      
      const siteConfig = {
        location: 'Central US',
        sku: {
          name: 'Free',
          tier: 'Free'
        },
        properties: {
          repositoryUrl: '',
          branch: 'main',
          buildProperties: {
            appLocation: '/',
            apiLocation: '',
            outputLocation: 'build'
          }
        }
      };

      // Create the static web app
      const createResponse = await axios.put(createUrl, siteConfig, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (createResponse.status !== 200 && createResponse.status !== 201) {
        throw new Error(`Failed to create static web app: ${createResponse.status}`);
      }

      // Upload the artifact
      const uploadUrl = `${createUrl}/builds/${environment}?api-version=${apiVersion}`;
      
      const uploadForm = new FormData();
      uploadForm.append('file', fs.createReadStream(artifactPath));
      
      const uploadResponse = await axios.post(uploadUrl, uploadForm, {
        headers: {
          ...uploadForm.getHeaders(),
          'Authorization': `Bearer ${token}`
        }
      });

      if (uploadResponse.status === 200 || uploadResponse.status === 201) {
        const url = `https://${appName}.azurestaticapps.net`;
        return {
          success: true,
          url
        };
      }

      throw new Error(`Upload failed with status ${uploadResponse.status}`);

    } catch (error) {
      if (axios.isAxiosError(error)) {
        this.logger.error('Management API deployment failed:', error.response?.data);
        return {
          success: false,
          error: error.response?.data?.error?.message || error.message
        };
      }
      throw error;
    }
  }

  /**
   * Get Azure access token
   */
  private async getAccessToken(): Promise<string> {
    try {
      const { execSync } = require('child_process');
      
      // Try to get token using Azure CLI
      const token = execSync('az account get-access-token --query accessToken -o tsv', {
        encoding: 'utf8'
      }).trim();
      
      return token;
    } catch (error) {
      // Fallback to managed identity or service principal
      const response = await axios.get(
        'http://169.254.169.254/metadata/identity/oauth2/token?api-version=2018-02-01&resource=https://management.azure.com/',
        {
          headers: {
            'Metadata': 'true'
          }
        }
      );
      
      return response.data.access_token;
    }
  }

  /**
   * Create Static Web App configuration
   */
  async createStaticWebApp(config: StaticWebAppConfig): Promise<{
    success: boolean;
    apiToken?: string;
    url?: string;
    error?: string;
  }> {
    try {
      const token = await this.getAccessToken();
      const apiVersion = '2021-02-01';
      
      const url = `https://management.azure.com/subscriptions/${this.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.Web/staticSites/${config.name}?api-version=${apiVersion}`;
      
      const siteConfig = {
        location: config.location || 'Central US',
        sku: {
          name: config.sku || 'Free',
          tier: config.sku || 'Free'
        },
        properties: {
          branch: config.branch || 'main',
          buildProperties: {
            appLocation: '/',
            outputLocation: 'build'
          }
        }
      };

      const response = await axios.put(url, siteConfig, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.status === 200 || response.status === 201) {
        // Get deployment token
        const tokenUrl = `${url}/listSecrets?api-version=${apiVersion}`;
        const tokenResponse = await axios.post(tokenUrl, {}, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        return {
          success: true,
          apiToken: tokenResponse.data.properties?.apiKey,
          url: `https://${config.name}.azurestaticapps.net`
        };
      }

      throw new Error(`Failed to create static web app: ${response.status}`);

    } catch (error) {
      this.logger.error('Static web app creation failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Creation failed'
      };
    }
  }
}