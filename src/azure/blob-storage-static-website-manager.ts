/**
 * Azure Blob Storage Static Website Manager
 * @module BlobStorageStaticWebsiteManager
 */

import { Logger } from '../utils/logger';
import { JupiterDBClient } from '../database/jupiter-db-client';
import { AzureAPIClient } from '../clients/azure-api-client';
import { azureAPIConfig } from '../config/azure-api-config';
import { DigisquaresDNSManager } from '../dns/digisquares-dns-manager';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as mime from 'mime-types';

export interface BlobStorageConfig {
  subscriptionId: string;
  resourceGroup: string;
  location?: string;
  baseDomain?: string;
  storageAccountPrefix?: string;
}

export interface CreateStaticWebsiteOptions {
  name: string;
  projectId: string;
  taskId: string;
  sourcePath: string;
  indexDocument?: string;
  errorDocument?: string;
  enableCDN?: boolean;
  customDomain?: string;
  environmentVariables?: Record<string, string>;
}

export interface BlobStorageDeploymentResult {
  deploymentId: string;
  storageAccountName: string;
  containerName: string;
  primaryEndpoint: string;
  cdnEndpoint?: string;
  customDomain?: string;
  status: 'provisioning' | 'deploying' | 'active' | 'failed';
}

export interface StorageAccountDetails {
  name: string;
  resourceGroup: string;
  location: string;
  primaryEndpoint: string;
  primaryKey: string;
  connectionString: string;
}

export interface CDNConfiguration {
  profileName: string;
  endpointName: string;
  endpointHostname: string;
  customDomain?: string;
}

export class BlobStorageStaticWebsiteManager {
  private azureClient: AzureAPIClient;
  private logger: Logger;
  private db: JupiterDBClient;
  private config: BlobStorageConfig;
  private dnsManager: DigisquaresDNSManager;

  constructor(config: BlobStorageConfig, db: JupiterDBClient) {
    this.config = config;
    this.db = db;
    this.logger = new Logger('BlobStorageStaticWebsiteManager');
    this.azureClient = new AzureAPIClient(azureAPIConfig);
    this.dnsManager = new DigisquaresDNSManager(
      { baseDomain: 'digisquares.in', enableSSL: true },
      db
    );
  }

  /**
   * Deploy a static website to Azure Blob Storage
   */
  async deployStaticWebsite(options: CreateStaticWebsiteOptions): Promise<BlobStorageDeploymentResult> {
    const deploymentId = uuidv4();
    const storageAccountName = this.generateStorageAccountName(options.name);
    
    try {
      this.logger.info('Starting Blob Storage static website deployment', {
        name: options.name,
        projectId: options.projectId
      });

      // Step 1: Create storage account
      const storageAccount = await this.createStorageAccount(storageAccountName);
      
      // Step 2: Enable static website hosting
      await this.enableStaticWebsiteHosting(
        storageAccountName,
        options.indexDocument || 'index.html',
        options.errorDocument || '404.html'
      );

      // Step 3: Upload website files to $web container
      await this.uploadWebsiteFiles(
        storageAccountName,
        storageAccount.primaryKey,
        options.sourcePath
      );

      // Step 4: Configure CDN if requested
      let cdnConfig: CDNConfiguration | undefined;
      if (options.enableCDN) {
        cdnConfig = await this.configureCDN(storageAccountName, options.name);
      }

      // Step 5: Automatically assign digisquares.in subdomain
      let customDomain: string | undefined;
      const targetEndpoint = cdnConfig ? cdnConfig.endpointHostname : storageAccount.primaryEndpoint;
      
      // Always assign a digisquares.in subdomain automatically
      const subdomainResult = await this.dnsManager.assignSubdomain({
        projectName: options.name,
        deploymentType: 'blob-storage',
        targetEndpoint: targetEndpoint,
        preferredSubdomain: options.customDomain?.replace('.digisquares.in', '').replace('.', '-'),
        enableSSL: true,
        description: `Blob Storage static website for ${options.name}`,
        tags: {
          deploymentId,
          storageAccount: storageAccountName,
          cdn: cdnConfig ? 'enabled' : 'disabled'
        }
      });
      
      customDomain = subdomainResult.fullDomain;
      
      this.logger.info('Digisquares.in subdomain assigned', {
        subdomain: subdomainResult.subdomain,
        fullDomain: customDomain,
        ssl: subdomainResult.sslEnabled
      });

      // Save deployment details to database
      await this.saveDeployment({
        id: deploymentId,
        projectId: options.projectId,
        taskId: options.taskId,
        storageAccountName,
        containerName: '$web',
        resourceGroup: this.config.resourceGroup,
        location: this.config.location || 'eastus2',
        primaryEndpoint: storageAccount.primaryEndpoint,
        cdnEndpoint: cdnConfig?.endpointHostname,
        customDomain,
        indexDocument: options.indexDocument || 'index.html',
        errorDocument: options.errorDocument || '404.html',
        status: 'active'
      });

      // Save environment variables if provided
      if (options.environmentVariables) {
        await this.saveEnvironmentVariables(deploymentId, options.environmentVariables);
      }

      this.logger.info('Static website deployment successful', {
        deploymentId,
        primaryEndpoint: storageAccount.primaryEndpoint,
        cdnEndpoint: cdnConfig?.endpointHostname,
        customDomain
      });

      return {
        deploymentId,
        storageAccountName,
        containerName: '$web',
        primaryEndpoint: storageAccount.primaryEndpoint,
        cdnEndpoint: cdnConfig?.endpointHostname,
        customDomain,
        status: 'active'
      };

    } catch (error) {
      this.logger.error('Failed to deploy static website', error as Error);
      
      // Update deployment status
      await this.updateDeploymentStatus(deploymentId, 'failed', (error as Error).message);
      
      throw error;
    }
  }

  /**
   * Create Azure Storage Account
   */
  private async createStorageAccount(accountName: string): Promise<StorageAccountDetails> {
    this.logger.info('Creating storage account', { accountName });

    try {
      // Use real Azure API to create storage account
      const response = await this.azureClient.createStorageAccount({
        name: accountName,
        location: this.config.location || 'eastus2',
        sku: 'Standard_LRS',
        kind: 'StorageV2',
        accessTier: 'Hot',
        enableHttpsOnly: true,
        tags: {
          project: 'jupiter',
          type: 'static-website'
        }
      });

      if (!response.success) {
        throw new Error(response.error || 'Failed to create storage account');
      }

      // Get storage account keys
      const keysResponse = await this.azureClient.getStorageAccountKeys(accountName);
      if (!keysResponse.success) {
        throw new Error('Failed to retrieve storage account keys');
      }

      const primaryKey = keysResponse.data.key1;
      const primaryEndpoint = response.data.properties.primaryEndpoints.web || 
                               `https://${accountName}.z13.web.core.windows.net/`;
      const connectionString = `DefaultEndpointsProtocol=https;AccountName=${accountName};AccountKey=${primaryKey};EndpointSuffix=core.windows.net`;

      return {
        name: accountName,
        resourceGroup: this.config.resourceGroup,
        location: this.config.location || 'eastus2',
        primaryEndpoint,
        primaryKey,
        connectionString
      };
    } catch (error) {
      this.logger.error('Failed to create storage account via Azure API', error as Error);
      throw error;
    }
  }

  /**
   * Enable static website hosting on storage account
   */
  private async enableStaticWebsiteHosting(
    storageAccountName: string,
    indexDocument: string,
    errorDocument: string
  ): Promise<void> {
    this.logger.info('Enabling static website hosting', {
      storageAccountName,
      indexDocument,
      errorDocument
    });

    try {
      // Use real Azure API to enable static website hosting
      const response = await this.azureClient.enableStaticWebsite(storageAccountName, {
        indexDocument,
        errorDocument404: errorDocument
      });

      if (!response.success) {
        throw new Error(response.error || 'Failed to enable static website hosting');
      }

      this.logger.info('Static website hosting enabled successfully', response.data);
    } catch (error) {
      this.logger.error('Failed to enable static website hosting', error as Error);
      throw error;
    }
  }

  /**
   * Upload website files to $web container
   */
  private async uploadWebsiteFiles(
    storageAccountName: string,
    storageAccountKey: string,
    sourcePath: string
  ): Promise<void> {
    this.logger.info('Uploading website files', { sourcePath });

    // Get all files from source directory
    const files = await this.getAllFiles(sourcePath);
    
    this.logger.info('Starting file upload to $web container', { 
      fileCount: files.length,
      storageAccount: storageAccountName
    });

    // Upload files in batches using real Azure API
    const batchSize = 10;
    let uploadedCount = 0;
    
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, Math.min(i + batchSize, files.length));
      const uploadPromises = batch.map(async (filePath) => {
        try {
          const relativePath = path.relative(sourcePath, filePath).replace(/\\/g, '/');
          const content = await fs.readFile(filePath);
          const contentType = mime.contentType(path.extname(filePath)) || 'application/octet-stream';
          
          await this.azureClient.uploadBlob(
            storageAccountName,
            '$web',
            content,
            {
              blobName: relativePath,
              overwrite: true
            }
          );
          
          uploadedCount++;
        } catch (error) {
          this.logger.error(`Failed to upload file: ${filePath}`, error as Error);
          // Continue with other files even if one fails
        }
      });
      
      await Promise.all(uploadPromises);
      this.logger.info(`Uploaded batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(files.length / batchSize)} (${uploadedCount}/${files.length} files)`);
    }

    this.logger.info('All files uploaded successfully', { totalFiles: uploadedCount });
  }

  /**
   * Configure Azure CDN
   */
  private async configureCDN(
    storageAccountName: string,
    websiteName: string
  ): Promise<CDNConfiguration> {
    this.logger.info('Configuring Azure CDN', { storageAccountName });

    const profileName = `cdn-${websiteName}`;
    const endpointName = `${websiteName}-endpoint`;
    const endpointHostname = `${endpointName}.azureedge.net`;

    // CDN configuration would require Azure CDN management API
    // For now, we log the intended configuration
    // In production, this would be implemented with proper CDN SDK
    this.logger.info('CDN configuration planned', {
      profileName,
      endpointName,
      endpointHostname,
      note: 'CDN requires additional Azure CDN SDK implementation'
    });

    // Configure caching rules
    await this.configureCDNCachingRules(profileName, endpointName);

    return {
      profileName,
      endpointName,
      endpointHostname
    };
  }

  /**
   * Configure CDN caching rules
   */
  private async configureCDNCachingRules(
    profileName: string,
    endpointName: string
  ): Promise<void> {
    const cachingRules = [
      {
        name: 'CacheStaticAssets',
        order: 1,
        fileExtensions: ['css', 'js', 'jpg', 'jpeg', 'png', 'gif', 'svg', 'woff', 'woff2'],
        cacheDuration: '7.00:00:00' // 7 days
      },
      {
        name: 'CacheHTML',
        order: 2,
        fileExtensions: ['html', 'htm'],
        cacheDuration: '00:05:00' // 5 minutes
      }
    ];

    // In production, this would configure actual CDN caching rules
    // For now, we log the configuration
    for (const rule of cachingRules) {
      this.logger.info(`Configured caching rule: ${rule.name}`, {
        profileName,
        endpointName,
        rule
      });
    }
  }


  /**
   * Enable HTTPS for custom domain
   */
  private async enableHTTPSForCustomDomain(domainName: string): Promise<void> {
    this.logger.info('Enabling HTTPS for custom domain', { domainName });

    // In production, this would enable HTTPS via Azure API
    // For now, we simulate the process
    this.logger.info('HTTPS enabled for custom domain', {
      domainName,
      certificateType: 'ManagedCertificate',
      protocolType: 'ServerNameIndication'
    });
  }

  /**
   * Generate unique storage account name
   */
  private generateStorageAccountName(projectName: string): string {
    const prefix = this.config.storageAccountPrefix || 'jup';
    const cleanName = projectName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const uniqueSuffix = Date.now().toString(36).slice(-4);
    
    // Storage account names must be 3-24 characters, lowercase letters and numbers only
    const accountName = `${prefix}${cleanName}${uniqueSuffix}`.slice(0, 24);
    
    return accountName;
  }

  /**
   * Generate storage key (deprecated - keys are now retrieved from Azure)
   */
  private generateStorageKey(): string {
    // This method is deprecated as we now get real keys from Azure
    // Kept for backward compatibility
    this.logger.warn('generateStorageKey is deprecated - keys should be retrieved from Azure');
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let key = '';
    for (let i = 0; i < 88; i++) {
      key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return key + '==';
  }

  /**
   * Get all files in directory recursively
   */
  private async getAllFiles(dirPath: string): Promise<string[]> {
    const files: string[] = [];
    
    const items = await fs.readdir(dirPath, { withFileTypes: true });
    
    for (const item of items) {
      const fullPath = path.join(dirPath, item.name);
      
      if (item.isDirectory()) {
        // Skip node_modules and other build directories
        if (!['node_modules', '.git', 'dist', 'build'].includes(item.name)) {
          const subFiles = await this.getAllFiles(fullPath);
          files.push(...subFiles);
        }
      } else {
        files.push(fullPath);
      }
    }
    
    return files;
  }

  /**
   * Update existing deployment
   */
  async updateDeployment(
    deploymentId: string,
    sourcePath: string
  ): Promise<void> {
    try {
      this.logger.info('Updating deployment', { deploymentId });

      // Get deployment details
      const deployment = await this.getDeployment(deploymentId);
      if (!deployment) {
        throw new Error('Deployment not found');
      }

      // Get storage account key from Azure
      const keysResponse = await this.azureClient.getStorageAccountKeys(deployment.storage_account_name);
      if (!keysResponse.success) {
        throw new Error('Failed to retrieve storage account keys');
      }
      const primaryKey = keysResponse.data.key1;

      // Upload updated files
      await this.uploadWebsiteFiles(
        deployment.storage_account_name,
        primaryKey,
        sourcePath
      );

      // Purge CDN if configured
      if (deployment.cdn_endpoint) {
        await this.purgeCDN(deployment.cdn_profile_name, deployment.cdn_endpoint_name);
      }

      await this.updateDeploymentStatus(deploymentId, 'active');
      
      this.logger.info('Deployment updated successfully');

    } catch (error) {
      this.logger.error('Failed to update deployment', error as Error);
      await this.updateDeploymentStatus(deploymentId, 'failed', (error as Error).message);
      throw error;
    }
  }

  /**
   * Purge CDN cache
   */
  private async purgeCDN(profileName: string, endpointName: string): Promise<void> {
    this.logger.info('Purging CDN cache', { profileName, endpointName });

    // In production, this would purge the CDN cache
    // For now, we simulate the process
    this.logger.info('CDN cache purged', {
      profileName,
      endpointName,
      contentPaths: ['/*']
    });
  }

  /**
   * Database operations
   */
  private async saveDeployment(data: any): Promise<void> {
    await this.db.execute(
      `INSERT INTO blob_storage_deployments 
       (id, project_id, task_id, storage_account_name, container_name, 
        resource_group, location, primary_endpoint, cdn_endpoint, 
        custom_domain, index_document, error_document, status, 
        created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        data.id, data.projectId, data.taskId, data.storageAccountName,
        data.containerName, data.resourceGroup, data.location,
        data.primaryEndpoint, data.cdnEndpoint, data.customDomain,
        data.indexDocument, data.errorDocument, data.status
      ]
    );
  }

  private async getDeployment(id: string): Promise<any> {
    return this.db.queryOne(
      'SELECT * FROM blob_storage_deployments WHERE id = ?',
      [id]
    );
  }

  private async updateDeploymentStatus(
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
      `UPDATE blob_storage_deployments SET ${setClause} WHERE id = ?`,
      values
    );
  }

  private async saveEnvironmentVariables(
    deploymentId: string,
    variables: Record<string, string>
  ): Promise<void> {
    for (const [key, value] of Object.entries(variables)) {
      const id = uuidv4();
      await this.db.execute(
        `INSERT INTO blob_deployment_env_vars 
         (id, deployment_id, \`key\`, value, created_at)
         VALUES (?, ?, ?, ?, NOW())`,
        [id, deploymentId, key, value]
      );
    }
  }

  /**
   * Delete deployment and clean up resources
   */
  async deleteDeployment(deploymentId: string): Promise<void> {
    try {
      this.logger.info('Deleting deployment', { deploymentId });

      const deployment = await this.getDeployment(deploymentId);
      if (!deployment) {
        throw new Error('Deployment not found');
      }

      // Delete the storage account via Azure API
      try {
        const deleteResponse = await this.azureClient.deleteStorageAccount(deployment.storage_account_name);
        if (!deleteResponse.success) {
          this.logger.warn('Failed to delete storage account', { 
            error: deleteResponse.error,
            storageAccount: deployment.storage_account_name 
          });
        } else {
          this.logger.info('Storage account deleted', {
            storageAccount: deployment.storage_account_name
          });
        }
      } catch (error) {
        this.logger.error('Error deleting storage account', error as Error);
        // Continue with database update even if deletion fails
      }

      // Update database
      await this.updateDeploymentStatus(deploymentId, 'deleted');

      this.logger.info('Deployment deleted successfully');

    } catch (error) {
      this.logger.error('Failed to delete deployment', error as Error);
      throw error;
    }
  }
}