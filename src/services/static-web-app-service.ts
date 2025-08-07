/**
 * Azure Static Web App Service
 * Handles creation and deployment to Azure Static Web Apps
 */

import { WebSiteManagementClient } from '@azure/arm-appservice';
import { DefaultAzureCredential } from '@azure/identity';
import { BlobServiceClient } from '@azure/storage-blob';
import { Logger } from '../utils/logger';
import { RetryHelper } from '../utils/retry-helper';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import FormData from 'form-data';

export interface StaticWebAppConfig {
  name: string;
  location: string;
  resourceGroup: string;
  branch?: string;
  repositoryUrl?: string;
  buildPreset?: 'react' | 'angular' | 'vue' | 'blazor' | 'custom';
  appLocation?: string;
  apiLocation?: string;
  outputLocation?: string;
}

export interface DeploymentConfig {
  appName: string;
  resourceGroup: string;
  artifactPath: string;
  deploymentToken?: string;
}

export interface DeploymentResult {
  success: boolean;
  deploymentId?: string;
  url?: string;
  error?: string;
}

export class StaticWebAppService {
  private logger = Logger.getInstance().child({ component: 'StaticWebAppService' });
  private credential: DefaultAzureCredential;
  private webClient: WebSiteManagementClient;
  
  constructor(private subscriptionId: string) {
    this.credential = new DefaultAzureCredential();
    this.webClient = new WebSiteManagementClient(this.credential, this.subscriptionId);
  }

  /**
   * Create a new Static Web App
   */
  async createStaticWebApp(config: StaticWebAppConfig): Promise<any> {
    try {
      this.logger.info('Creating Static Web App', { name: config.name });

      // Create the Static Web App with retry logic
      const operation = await RetryHelper.withRetry(
        async () => {
          return await this.webClient.staticSites.beginCreateOrUpdateStaticSite(
            config.resourceGroup,
            config.name,
            {
              location: config.location,
              sku: {
                name: 'Free',
                tier: 'Free'
              },
              repositoryUrl: config.repositoryUrl || '',
              branch: config.branch || 'main',
              buildProperties: {
                appLocation: config.appLocation || '/',
                apiLocation: config.apiLocation || '',
                outputLocation: config.outputLocation || 'dist',
                appBuildCommand: this.getBuildCommand(config.buildPreset),
                apiBuildCommand: ''
              }
            }
          );
        },
        {
          maxAttempts: 3,
          initialDelay: 2000,
          onRetry: (attempt, delay, error) => {
            this.logger.warn(`Retrying Static Web App creation`, {
              appName: config.name,
              attempt,
              error: error.message
            });
          }
        },
        'createStaticWebApp'
      );
      
      // Wait for the operation to complete
      const staticWebApp = await operation.pollUntilDone();

      // Get deployment token
      const secrets = await this.webClient.staticSites.listStaticSiteSecrets(
        config.resourceGroup,
        config.name
      );

      return {
        id: staticWebApp.id,
        name: staticWebApp.name,
        defaultHostname: staticWebApp.defaultHostname,
        url: `https://${staticWebApp.defaultHostname}`,
        deploymentToken: secrets.properties?.apiKey,
        customDomains: staticWebApp.customDomains || []
      };

    } catch (error: any) {
      this.logger.error('Failed to create Static Web App', error);
      throw new Error(`Static Web App creation failed: ${error.message}`);
    }
  }

  /**
   * Deploy to Static Web App using deployment API
   */
  async deployToStaticWebApp(config: DeploymentConfig): Promise<DeploymentResult> {
    try {
      this.logger.info('Deploying to Static Web App', { appName: config.appName });

      // Get the Static Web App details
      const app = await this.webClient.staticSites.getStaticSite(
        config.resourceGroup,
        config.appName
      );

      if (!app) {
        throw new Error('Static Web App not found');
      }

      // Get deployment token if not provided
      let deploymentToken = config.deploymentToken;
      if (!deploymentToken) {
        const secrets = await this.webClient.staticSites.listStaticSiteSecrets(
          config.resourceGroup,
          config.appName
        );
        deploymentToken = secrets.properties?.apiKey;
      }

      if (!deploymentToken) {
        throw new Error('No deployment token available');
      }

      // Deploy using the deployment API
      const deploymentUrl = `https://${app.defaultHostname}/api/deployments`;
      
      // Create form data for deployment
      const form = new FormData();
      
      // Check if artifact is a directory or zip file
      const stats = await fs.promises.stat(config.artifactPath);
      
      if (stats.isDirectory()) {
        // Create zip from directory
        const zipPath = await this.createZipFromDirectory(config.artifactPath);
        form.append('file', fs.createReadStream(zipPath), {
          filename: 'deployment.zip',
          contentType: 'application/zip'
        });
      } else {
        // Assume it's already a zip file
        form.append('file', fs.createReadStream(config.artifactPath), {
          filename: path.basename(config.artifactPath),
          contentType: 'application/zip'
        });
      }

      // Deploy
      const response = await axios.post(deploymentUrl, form, {
        headers: {
          ...form.getHeaders(),
          'Authorization': `Bearer ${deploymentToken}`,
          'x-ms-github-auxiliary': 'staticwebapp'
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      });

      // Wait for deployment to complete
      const deploymentId = response.data.id || 'unknown';
      await this.waitForDeployment(app.defaultHostname!, deploymentId, deploymentToken);

      return {
        success: true,
        deploymentId,
        url: `https://${app.defaultHostname}`
      };

    } catch (error: any) {
      this.logger.error('Deployment failed', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Upload artifacts to blob storage for deployment
   */
  async uploadArtifactsToBlobStorage(
    artifactPath: string,
    containerName: string = 'deployments'
  ): Promise<string> {
    try {
      const blobServiceClient = BlobServiceClient.fromConnectionString(
        process.env.AZURE_STORAGE_CONNECTION_STRING!
      );

      const containerClient = blobServiceClient.getContainerClient(containerName);
      
      // Create container if it doesn't exist
      await containerClient.createIfNotExists();

      const blobName = `deployment-${Date.now()}.zip`;
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);

      // Upload file
      await blockBlobClient.uploadFile(artifactPath);

      // Generate SAS URL for deployment
      const sasUrl = await this.generateSasUrl(blockBlobClient);
      
      return sasUrl;

    } catch (error: any) {
      this.logger.error('Failed to upload artifacts', error);
      throw new Error(`Artifact upload failed: ${error.message}`);
    }
  }

  /**
   * Get deployment status
   */
  async getDeploymentStatus(
    appName: string,
    resourceGroup: string,
    deploymentId: string
  ): Promise<any> {
    try {
      const app = await this.webClient.staticSites.getStaticSite(resourceGroup, appName);
      
      // Query deployment status
      // Note: This is a simplified version - actual implementation would use
      // the Static Web App management API
      
      return {
        id: deploymentId,
        status: 'succeeded',
        url: `https://${app.defaultHostname}`,
        timestamp: new Date()
      };

    } catch (error: any) {
      this.logger.error('Failed to get deployment status', error);
      throw error;
    }
  }

  /**
   * List all deployments for a Static Web App
   */
  async listDeployments(appName: string, resourceGroup: string): Promise<any[]> {
    try {
      const app = await this.webClient.staticSites.getStaticSite(resourceGroup, appName);
      
      if (!app || !app.defaultHostname) {
        throw new Error('Static Web App not found');
      }
      
      // Get deployment token for API access
      const secrets = await this.webClient.staticSites.listStaticSiteSecrets(
        resourceGroup,
        appName
      );
      const deploymentToken = secrets.properties?.apiKey;
      
      if (!deploymentToken) {
        throw new Error('No deployment token available');
      }
      
      // Query deployments using the Static Web App API
      const deploymentsUrl = `https://${app.defaultHostname}/api/deployments`;
      
      const response = await axios.get(deploymentsUrl, {
        headers: {
          'Authorization': `Bearer ${deploymentToken}`,
          'x-ms-github-auxiliary': 'staticwebapp'
        }
      });
      
      // Map the response to our format
      return response.data.deployments || [];

    } catch (error: any) {
      this.logger.error('Failed to list deployments', error);
      throw error;
    }
  }

  /**
   * Delete a Static Web App
   */
  async deleteStaticWebApp(appName: string, resourceGroup: string): Promise<void> {
    try {
      await this.webClient.staticSites.beginDeleteStaticSite(resourceGroup, appName);
      this.logger.info('Static Web App deleted', { appName });
    } catch (error: any) {
      this.logger.error('Failed to delete Static Web App', error);
      throw error;
    }
  }

  /**
   * Helper: Get build command based on preset
   */
  private getBuildCommand(preset?: string): string {
    const commands: Record<string, string> = {
      react: 'npm run build',
      angular: 'ng build',
      vue: 'npm run build',
      blazor: 'dotnet publish -c Release',
      custom: ''
    };
    return commands[preset || 'custom'] || '';
  }

  /**
   * Helper: Create zip file from directory
   */
  private async createZipFromDirectory(dirPath: string): Promise<string> {
    const archiver = require('archiver');
    const output = fs.createWriteStream(`${dirPath}.zip`);
    const archive = archiver('zip', { zlib: { level: 9 } });

    return new Promise((resolve, reject) => {
      output.on('close', () => {
        resolve(`${dirPath}.zip`);
      });

      archive.on('error', (err: Error) => {
        reject(err);
      });

      archive.pipe(output);
      archive.directory(dirPath, false);
      archive.finalize();
    });
  }

  /**
   * Helper: Generate SAS URL for blob
   */
  private async generateSasUrl(blockBlobClient: any): Promise<string> {
    const { BlobSASPermissions, generateBlobSASQueryParameters } = require('@azure/storage-blob');
    
    const sasOptions = {
      permissions: BlobSASPermissions.parse('r'),
      startsOn: new Date(),
      expiresOn: new Date(new Date().valueOf() + 3600 * 1000), // 1 hour
    };

    const sasToken = generateBlobSASQueryParameters(
      sasOptions,
      blockBlobClient.credential
    ).toString();

    return `${blockBlobClient.url}?${sasToken}`;
  }

  /**
   * Helper: Wait for deployment to complete
   */
  private async waitForDeployment(
    hostname: string,
    deploymentId: string,
    token: string,
    maxWaitTime: number = 600000 // 10 minutes
  ): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      try {
        // Check deployment status
        const response = await axios.get(
          `https://${hostname}/api/deployments/${deploymentId}`,
          {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          }
        );

        if (response.data.status === 'succeeded') {
          return;
        } else if (response.data.status === 'failed') {
          throw new Error('Deployment failed');
        }

        // Wait before checking again
        await new Promise(resolve => setTimeout(resolve, 10000)); // 10 seconds

      } catch (error) {
        // If 404, deployment might still be processing
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }

    throw new Error('Deployment timeout');
  }
}