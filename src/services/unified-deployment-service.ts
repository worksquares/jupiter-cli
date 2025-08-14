/**
 * Unified Deployment Service
 * Smart deployment system with auto-detection and optimization
 */

import { Logger } from '../utils/logger';
import { AzureAPIClient, UnifiedDeploymentRequest, APIResponse } from '../clients/azure-api-client';
import { azureAPIConfig } from '../config/azure-api-config';
import { SubdomainService } from './subdomain-service';
import { StaticWebAppManager } from '../azure/static-web-app-manager';
import { BlobStorageStaticWebsiteManager } from '../azure/blob-storage-static-website-manager';
import { JupiterDBClient } from '../database/jupiter-db-client';

export interface DeploymentOptions {
  projectName: string;
  sourceUrl?: string;
  dockerImage?: string;
  framework?: string;
  runtime?: string;
  customDomain?: string;
  environment?: 'dev' | 'staging' | 'prod';
  autoDetect?: boolean;
  enableSSL?: boolean;
  enableMonitoring?: boolean;
  deploymentType?: 'auto' | 'static-web-app' | 'blob-storage' | 'container' | 'app-service';
  enableCDN?: boolean;
  sourcePath?: string;
  repositoryUrl?: string;
  branch?: string;
  resources?: {
    cpu?: number;
    memory?: number;
    sku?: string;
  };
  environmentVariables?: Record<string, string>;
  tags?: Record<string, string>;
}

export interface DeploymentResult {
  deploymentId: string;
  name: string;
  type: string;
  url: string;
  customDomain?: string;
  state: string;
  runtime?: string;
  framework?: string;
  location: string;
  createdAt: string;
  analysis?: {
    serviceType: string;
    confidence: number;
    reason: string;
    estimatedCost: number;
  };
  nextSteps?: string[];
}

export interface DeploymentAnalysis {
  recommendedService: 'container-instance' | 'app-service' | 'static-web-app' | 'blob-storage';
  confidence: number;
  reasoning: string;
  estimatedCost: number;
  suggestedResources: {
    cpu?: number;
    memory?: number;
    sku?: string;
  };
  detectedFramework?: string;
  detectedRuntime?: string;
  hasBackend: boolean;
  hasDatabase: boolean;
  expectedTraffic: 'low' | 'medium' | 'high';
  recommendCDN?: boolean;
}

export class UnifiedDeploymentService {
  private logger: Logger;
  private azureClient: AzureAPIClient;
  private subdomainService: SubdomainService;
  private staticWebAppManager?: StaticWebAppManager;
  private blobStorageManager?: BlobStorageStaticWebsiteManager;
  private db?: JupiterDBClient;
  private activeDeployments: Map<string, DeploymentResult>;
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 2000;

  constructor() {
    this.logger = Logger.getInstance();
    
    try {
      this.azureClient = new AzureAPIClient(azureAPIConfig);
      this.subdomainService = new SubdomainService();
      
      // Initialize database connection if available
      try {
        const dbConfig = {
          host: process.env.MYSQL_HOST || 'localhost',
          port: parseInt(process.env.MYSQL_PORT || '3306'),
          user: process.env.MYSQL_USER || 'root',
          password: process.env.MYSQL_PASSWORD || '',
          database: process.env.MYSQL_DATABASE || 'jupiterdb'
        };
        
        this.db = new JupiterDBClient(dbConfig);
        
        // Initialize managers with database
        const azureConfig = {
          subscriptionId: process.env.AZURE_SUBSCRIPTION_ID || '',
          resourceGroup: process.env.AZURE_RESOURCE_GROUP || 'jupiter-resources',
          location: process.env.AZURE_LOCATION || 'eastus2',
          baseDomain: process.env.BASE_DOMAIN || 'digisquares.in'
        };
        
        if (this.db) {
          this.staticWebAppManager = new StaticWebAppManager(azureConfig, this.db);
          this.blobStorageManager = new BlobStorageStaticWebsiteManager(azureConfig, this.db);
        }
      } catch (dbError) {
        this.logger.warn('Database not available, some features may be limited', dbError);
      }
    } catch (error) {
      this.logger.error('Failed to initialize services', error);
      throw new Error('Failed to initialize UnifiedDeploymentService: ' + (error as Error).message);
    }
    
    this.activeDeployments = new Map();
  }

  /**
   * Deploy application with smart auto-detection
   */
  async deploy(options: DeploymentOptions): Promise<DeploymentResult> {
    // Validate required options
    if (!options.projectName || options.projectName.trim().length === 0) {
      throw new Error('Project name is required for deployment');
    }
    
    // Sanitize project name
    options.projectName = options.projectName.trim();
    
    this.logger.info('Starting unified deployment', { options });

    // Determine deployment type
    const deploymentType = await this.determineDeploymentType(options);
    
    // Route to appropriate deployment method
    if (deploymentType === 'blob-storage') {
      return this.deployToBlobStorage(options);
    } else if (deploymentType === 'static-web-app') {
      return this.deployToStaticWebApp(options);
    }

    // Check API health before deployment (for container/app-service)
    try {
      await this.azureClient.ensureHealthy();
    } catch (error) {
      this.logger.error('Azure API is not available', error);
      throw new Error('Cannot deploy: Azure API service is unavailable');
    }

    try {
      // Generate subdomain if no custom domain provided
      let domain = options.customDomain;
      if (!domain) {
        const subdomainResult = await this.subdomainService.generateForProject({
          projectName: options.projectName,
          description: `${options.framework || 'Web'} application`,
          category: this.getCategory(options)
        });
        domain = subdomainResult.fullDomain;
        this.logger.info('Generated subdomain', { domain });
      }

      // Prepare deployment request
      const deploymentRequest: UnifiedDeploymentRequest = {
        name: this.sanitizeName(options.projectName),
        projectName: options.projectName,
        source: this.getSourceConfig(options),
        serviceType: options.autoDetect !== false ? 'auto' : undefined,
        framework: options.framework,
        runtime: options.runtime,
        hasBackend: this.hasBackend(options),
        hasDatabase: this.hasDatabase(options),
        expectedTraffic: this.estimateTraffic(options),
        domain: {
          custom: domain,
          generateUnique: !options.customDomain
        },
        resources: options.resources,
        environment: options.environment || 'prod',
        environmentVariables: options.environmentVariables,
        autoScale: options.environment === 'prod',
        enableSSL: options.enableSSL !== false,
        enableMonitoring: options.enableMonitoring !== false,
        tags: {
          ...options.tags,
          project: options.projectName,
          environment: options.environment || 'prod',
          managedBy: 'jupiter-ai'
        }
      };

      // Deploy via Azure API with retry logic
      let response: any;
      let lastError: Error | null = null;
      
      for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
        try {
          response = await this.azureClient.deploy(deploymentRequest);
          
          if (response.success) {
            break;
          }
          
          lastError = new Error(response.error || 'Deployment failed');
          
          // Don't retry on client errors (4xx)
          if ((lastError as any).status >= 400 && (lastError as any).status < 500) {
            throw lastError;
          }
          
        } catch (error) {
          lastError = error as Error;
          
          // Don't retry on validation errors
          if ((error as any).status >= 400 && (error as any).status < 500) {
            throw error;
          }
          
          if (attempt < this.MAX_RETRIES) {
            this.logger.warn(`Deployment attempt ${attempt} failed, retrying...`, { error });
            await this.delay(this.RETRY_DELAY * attempt);
          }
        }
      }
      
      if (!response?.success) {
        throw lastError || new Error('Deployment failed after retries');
      }

      const result: DeploymentResult = {
        deploymentId: response.data?.deployment?.name || this.generateDeploymentId(options.projectName),
        name: response.data?.deployment?.name || options.projectName,
        type: response.data?.deployment?.type || 'unknown',
        url: response.data?.deployment?.url || '',
        customDomain: response.data?.deployment?.customDomain || domain,
        state: response.data?.deployment?.state || 'pending',
        runtime: response.data?.deployment?.runtime,
        framework: response.data?.deployment?.framework,
        location: response.data?.deployment?.location || 'eastus',
        createdAt: response.data?.deployment?.createdAt || new Date().toISOString(),
        analysis: response.data?.analysis,
        nextSteps: response.data?.nextSteps || []
      };
      
      // Store active deployment
      this.activeDeployments.set(result.deploymentId, result);

      this.logger.info('Deployment successful', { result });
      return result;

    } catch (error) {
      this.logger.error('Deployment failed', error);
      
      // Provide more context in error message
      const enhancedError = new Error(
        `Failed to deploy ${options.projectName}: ${(error as Error).message}`
      );
      (enhancedError as any).originalError = error;
      throw enhancedError;
    }
  }

  /**
   * Analyze deployment without actually deploying
   */
  async analyzeDeployment(options: DeploymentOptions): Promise<DeploymentAnalysis> {
    this.logger.info('Analyzing deployment requirements', { options });

    try {
      const deploymentRequest: UnifiedDeploymentRequest = {
        name: this.sanitizeName(options.projectName),
        projectName: options.projectName,
        source: this.getSourceConfig(options),
        serviceType: 'auto',
        framework: options.framework,
        runtime: options.runtime,
        hasBackend: this.hasBackend(options),
        hasDatabase: this.hasDatabase(options),
        expectedTraffic: this.estimateTraffic(options),
        resources: options.resources,
        environment: options.environment || 'prod'
      };

      const response = await this.azureClient.analyzeDeployment(deploymentRequest);
      
      if (!response.success) {
        throw new Error(response.error || 'Analysis failed');
      }

      const analysis: DeploymentAnalysis = {
        recommendedService: this.mapServiceType(response.data.serviceType),
        confidence: response.data.confidence,
        reasoning: response.data.reason,
        estimatedCost: response.data.estimatedCost,
        suggestedResources: response.data.suggestedResources,
        detectedFramework: response.data.detectedFramework,
        detectedRuntime: response.data.detectedRuntime,
        hasBackend: response.data.hasBackend,
        hasDatabase: response.data.hasDatabase,
        expectedTraffic: response.data.expectedTraffic
      };

      this.logger.info('Analysis complete', { analysis });
      return analysis;

    } catch (error) {
      this.logger.error('Analysis failed', error);
      throw error;
    }
  }

  /**
   * Get deployment status
   */
  async getStatus(deploymentId: string): Promise<any> {
    if (!deploymentId || deploymentId.trim().length === 0) {
      throw new Error('Deployment ID is required');
    }
    
    this.logger.info('Getting deployment status', { deploymentId });

    // Check local cache first
    const cachedDeployment = this.activeDeployments.get(deploymentId);
    if (cachedDeployment) {
      this.logger.debug('Returning cached deployment status', { deploymentId });
    }

    try {
      const response = await this.azureClient.getDeploymentStatus(deploymentId);
      
      if (!response.success) {
        // Return cached if API fails
        if (cachedDeployment) {
          return cachedDeployment;
        }
        throw new Error(response.error || 'Failed to get status');
      }

      return response.data;

    } catch (error) {
      this.logger.error('Failed to get deployment status', error);
      
      // Return cached deployment if available
      if (cachedDeployment) {
        this.logger.warn('Returning cached deployment due to API error');
        return cachedDeployment;
      }
      
      throw error;
    }
  }

  /**
   * Update deployment configuration
   */
  async updateDeployment(deploymentId: string, updates: Partial<DeploymentOptions>): Promise<any> {
    this.logger.info('Updating deployment', { deploymentId, updates });

    try {
      const updateRequest: Partial<UnifiedDeploymentRequest> = {
        resources: updates.resources,
        environmentVariables: updates.environmentVariables,
        autoScale: updates.environment === 'prod',
        enableSSL: updates.enableSSL,
        enableMonitoring: updates.enableMonitoring,
        tags: updates.tags
      };

      const response = await this.azureClient.updateDeployment(deploymentId, updateRequest);
      
      if (!response.success) {
        throw new Error(response.error || 'Update failed');
      }

      return response.data;

    } catch (error) {
      this.logger.error('Failed to update deployment', error);
      throw error;
    }
  }

  /**
   * Rollback deployment to previous version
   */
  async rollback(deploymentId: string, version?: string): Promise<any> {
    this.logger.info('Rolling back deployment', { deploymentId, version });

    try {
      const response = await this.azureClient.rollbackDeployment(deploymentId, version);
      
      if (!response.success) {
        throw new Error(response.error || 'Rollback failed');
      }

      return response.data;

    } catch (error) {
      this.logger.error('Rollback failed', error);
      throw error;
    }
  }

  /**
   * Delete deployment
   */
  async deleteDeployment(deploymentId: string): Promise<void> {
    if (!deploymentId || deploymentId.trim().length === 0) {
      throw new Error('Deployment ID is required');
    }
    
    this.logger.info('Deleting deployment', { deploymentId });

    try {
      const response = await this.azureClient.deleteDeployment(deploymentId);
      
      if (!response.success) {
        throw new Error(response.error || 'Delete failed');
      }

      // Remove from active deployments
      this.activeDeployments.delete(deploymentId);
      
      this.logger.info('Deployment deleted successfully', { deploymentId });

    } catch (error) {
      this.logger.error('Failed to delete deployment', error);
      throw error;
    }
  }

  // Helper methods
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  private generateDeploymentId(projectName: string): string {
    const timestamp = Date.now().toString(36);
    const sanitized = this.sanitizeName(projectName);
    return `${sanitized}-${timestamp}`;
  }
  
  private getSourceConfig(options: DeploymentOptions): UnifiedDeploymentRequest['source'] {
    if (options.dockerImage) {
      return {
        type: 'docker',
        dockerImage: options.dockerImage
      };
    }

    if (options.sourceUrl) {
      return {
        type: 'github',
        url: options.sourceUrl,
        branch: 'main'
      };
    }

    return {
      type: 'local'
    };
  }

  private getCategory(options: DeploymentOptions): string {
    if (options.framework?.toLowerCase().includes('react') ||
        options.framework?.toLowerCase().includes('vue') ||
        options.framework?.toLowerCase().includes('angular')) {
      return 'frontend';
    }

    if (options.runtime?.toLowerCase().includes('node') ||
        options.runtime?.toLowerCase().includes('python') ||
        options.runtime?.toLowerCase().includes('java')) {
      return 'backend';
    }

    return 'web';
  }

  private hasBackend(options: DeploymentOptions): boolean {
    return Boolean(
      options.runtime || 
      options.framework?.toLowerCase().includes('express') ||
      options.framework?.toLowerCase().includes('fastapi') ||
      options.framework?.toLowerCase().includes('django') ||
      options.framework?.toLowerCase().includes('spring') ||
      options.framework?.toLowerCase().includes('nest')
    );
  }

  private hasDatabase(options: DeploymentOptions): boolean {
    const envVars = options.environmentVariables || {};
    return Object.keys(envVars).some(key => 
      key.toLowerCase().includes('database') ||
      key.toLowerCase().includes('db_') ||
      key.toLowerCase().includes('mongo') ||
      key.toLowerCase().includes('postgres') ||
      key.toLowerCase().includes('mysql')
    );
  }

  private estimateTraffic(options: DeploymentOptions): 'low' | 'medium' | 'high' {
    if (options.environment === 'dev') return 'low';
    if (options.environment === 'staging') return 'medium';
    if (options.resources?.cpu && options.resources.cpu >= 2) return 'high';
    if (options.resources?.memory && options.resources.memory >= 4) return 'high';
    return 'medium';
  }

  private sanitizeName(name: string): string {
    if (!name) return 'app';
    
    const sanitized = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/--+/g, '-')
      .replace(/^-|-$/g, '');
    
    // Ensure minimum length
    if (sanitized.length < 3) {
      return `app-${sanitized || 'deploy'}`;
    }
    
    return sanitized.substring(0, 63);
  }

  private mapServiceType(type: string | undefined): 'container-instance' | 'app-service' | 'static-web-app' | 'blob-storage' {
    if (!type) return 'app-service';
    
    const normalizedType = type.toLowerCase();
    
    switch (normalizedType) {
      case 'container-instance':
      case 'container':
      case 'aci':
        return 'container-instance';
      case 'app-service':
      case 'appservice':
      case 'app':
        return 'app-service';
      case 'static-web-app':
      case 'static':
      case 'swa':
        return 'static-web-app';
      case 'blob-storage':
      case 'blob':
      case 'storage':
        return 'blob-storage';
      default:
        this.logger.warn(`Unknown service type: ${type}, defaulting to app-service`);
        return 'app-service';
    }
  }

  /**
   * Determine the best deployment type based on options
   */
  private async determineDeploymentType(options: DeploymentOptions): Promise<string> {
    // If explicitly specified, use that
    if (options.deploymentType && options.deploymentType !== 'auto') {
      return options.deploymentType;
    }

    // Auto-detect based on characteristics
    const isStaticSite = this.isStaticSite(options);
    const hasGitRepo = Boolean(options.repositoryUrl || options.sourceUrl?.includes('github'));
    const expectedTraffic = this.estimateTraffic(options);
    const needsCDN = options.enableCDN || expectedTraffic === 'high';
    const hasSourcePath = Boolean(options.sourcePath);

    // Decision logic
    if (isStaticSite) {
      if (hasGitRepo && !needsCDN) {
        // GitHub integration favors Static Web Apps
        return 'static-web-app';
      } else if (hasSourcePath || needsCDN) {
        // Local files or CDN requirement favors Blob Storage
        return 'blob-storage';
      } else {
        // Default for static sites
        return options.environment === 'prod' ? 'blob-storage' : 'static-web-app';
      }
    }

    // For dynamic applications
    if (options.dockerImage) {
      return 'container';
    }

    return 'app-service';
  }

  /**
   * Check if the project is a static website
   */
  private isStaticSite(options: DeploymentOptions): boolean {
    const staticFrameworks = ['react', 'vue', 'angular', 'svelte', 'next', 'gatsby', 'vanilla', 'html'];
    const framework = options.framework?.toLowerCase() || '';
    
    // Check if it's a known static framework
    if (staticFrameworks.some(f => framework.includes(f))) {
      // But not if it has backend indicators
      return !this.hasBackend(options);
    }

    // Check for static indicators in environment
    return !options.runtime && !options.dockerImage && !this.hasBackend(options);
  }

  /**
   * Deploy to Azure Blob Storage
   */
  private async deployToBlobStorage(options: DeploymentOptions): Promise<DeploymentResult> {
    if (!this.blobStorageManager) {
      throw new Error('Blob Storage deployment is not available. Database connection required.');
    }

    this.logger.info('Deploying to Azure Blob Storage', { projectName: options.projectName });

    try {
      const deployment = await this.blobStorageManager.deployStaticWebsite({
        name: options.projectName,
        projectId: options.projectName,
        taskId: `task-${Date.now()}`,
        sourcePath: options.sourcePath || './dist',
        indexDocument: 'index.html',
        errorDocument: '404.html',
        enableCDN: options.enableCDN !== false,
        customDomain: options.customDomain,
        environmentVariables: options.environmentVariables
      });

      const result: DeploymentResult = {
        deploymentId: deployment.deploymentId,
        name: options.projectName,
        type: 'blob-storage',
        url: deployment.customDomain || deployment.cdnEndpoint || deployment.primaryEndpoint,
        customDomain: deployment.customDomain,
        state: deployment.status,
        framework: options.framework,
        location: 'eastus2',
        createdAt: new Date().toISOString(),
        analysis: {
          serviceType: 'blob-storage',
          confidence: 0.95,
          reason: 'Static website deployed to Azure Blob Storage with CDN and automatic digisquares.in subdomain',
          estimatedCost: 5
        },
        nextSteps: [
          `✅ Website is live at: https://${deployment.customDomain}`,
          '🔒 SSL certificate automatically configured',
          deployment.cdnEndpoint ? '🌍 CDN endpoint configured for global distribution' : '',
          '📊 Monitor usage in Azure Portal',
          `🔗 Primary endpoint: ${deployment.primaryEndpoint}`
        ].filter(Boolean)
      };

      this.activeDeployments.set(result.deploymentId, result);
      return result;

    } catch (error) {
      this.logger.error('Blob Storage deployment failed', error);
      throw new Error(`Failed to deploy to Blob Storage: ${(error as Error).message}`);
    }
  }

  /**
   * Deploy to Azure Static Web Apps
   */
  private async deployToStaticWebApp(options: DeploymentOptions): Promise<DeploymentResult> {
    if (!this.staticWebAppManager) {
      throw new Error('Static Web App deployment is not available. Database connection required.');
    }

    this.logger.info('Deploying to Azure Static Web Apps', { projectName: options.projectName });

    try {
      const deployment = await this.staticWebAppManager.createStaticWebApp({
        name: options.projectName,
        projectId: options.projectName,
        taskId: `task-${Date.now()}`,
        repositoryUrl: options.repositoryUrl || '',
        branch: options.branch || 'main',
        framework: (options.framework as any) || 'react',
        environmentVariables: options.environmentVariables
      });

      const result: DeploymentResult = {
        deploymentId: deployment.deploymentId,
        name: options.projectName,
        type: 'static-web-app',
        url: `https://${deployment.customDomain}` || deployment.defaultHostname,
        customDomain: deployment.customDomain,
        state: deployment.status,
        framework: options.framework,
        location: 'eastus2',
        createdAt: new Date().toISOString(),
        analysis: {
          serviceType: 'static-web-app',
          confidence: 0.9,
          reason: 'Static Web App with GitHub integration and automatic digisquares.in subdomain',
          estimatedCost: 0
        },
        nextSteps: [
          `✅ Website is live at: https://${deployment.customDomain}`,
          '🔒 SSL certificate automatically configured',
          '🚀 Push code to GitHub repository to trigger deployment',
          `📦 Default hostname: ${deployment.defaultHostname}`,
          '📊 Monitor deployment in Azure Portal'
        ].filter(Boolean)
      };

      this.activeDeployments.set(result.deploymentId, result);
      return result;

    } catch (error) {
      this.logger.error('Static Web App deployment failed', error);
      throw new Error(`Failed to deploy Static Web App: ${(error as Error).message}`);
    }
  }
  
  /**
   * Get all active deployments
   */
  getActiveDeployments(): DeploymentResult[] {
    return Array.from(this.activeDeployments.values());
  }
  
  /**
   * Clear deployment cache
   */
  clearCache(): void {
    this.activeDeployments.clear();
    this.logger.info('Deployment cache cleared');
  }
}