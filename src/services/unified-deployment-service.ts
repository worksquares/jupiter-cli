/**
 * Unified Deployment Service
 * Smart deployment system with auto-detection and optimization
 */

import { Logger } from '../utils/logger';
import { AzureAPIClient, UnifiedDeploymentRequest, APIResponse } from '../clients/azure-api-client';
import { azureAPIConfig } from '../config/azure-api-config';
import { SubdomainService } from './subdomain-service';

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
  recommendedService: 'container-instance' | 'app-service' | 'static-web-app';
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
}

export class UnifiedDeploymentService {
  private logger: Logger;
  private azureClient: AzureAPIClient;
  private subdomainService: SubdomainService;
  private activeDeployments: Map<string, DeploymentResult>;
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 2000;

  constructor() {
    this.logger = Logger.getInstance();
    
    try {
      this.azureClient = new AzureAPIClient(azureAPIConfig);
      this.subdomainService = new SubdomainService();
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

    // Check API health before deployment
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

  private mapServiceType(type: string | undefined): 'container-instance' | 'app-service' | 'static-web-app' {
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
      default:
        this.logger.warn(`Unknown service type: ${type}, defaulting to app-service`);
        return 'app-service';
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