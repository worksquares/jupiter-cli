/**
 * Automation Service
 * GitHub repository creation and Azure deployment automation
 */

import { Logger } from '../utils/logger';
import { AzureAPIClient, AutomationQuickDeployRequest, AutomationDeployRequest } from '../clients/azure-api-client';
import { azureAPIConfig } from '../config/azure-api-config';

export type DeploymentTier = 'basic' | 'docker' | 'full' | 'enterprise';
export type DeploymentPreset = 'small' | 'medium' | 'large' | 'enterprise';

export interface QuickDeployOptions {
  projectName: string;
  tier?: DeploymentTier;
  githubUrl?: string;
}

export interface FullDeployOptions {
  tier: DeploymentTier;
  projectName: string;
  description?: string;
  isPrivate?: boolean;
  language?: string;
  framework?: string;
  nodeVersion?: string;
  azureSubscriptionId?: string;
  azureResourceGroup?: string;
  azureRegion?: string;
  preset?: DeploymentPreset;
  customDomain?: string;
  enableSSL?: boolean;
  environments?: string[];
  enableMonitoring?: boolean;
  enableSecurityScanning?: boolean;
  enableAutoScaling?: boolean;
  secrets?: Record<string, string>;
}

export interface GitHubDeployOptions {
  githubUrl: string;
  preset?: DeploymentPreset;
}

export interface AutomationResult {
  status: 'success' | 'preview' | 'coming_soon' | 'failed';
  projectName: string;
  tier?: DeploymentTier;
  deployment?: {
    url?: string;
    githubRepo?: string;
    azureResources?: string[];
    cicdPipeline?: string;
  };
  features?: string[];
  message?: string;
  estimatedCost?: number;
  nextSteps?: string[];
}

export interface TierInfo {
  name: DeploymentTier;
  features: string[];
  cost: string;
  status: 'available' | 'coming_soon';
  description: string;
}

export class AutomationService {
  private logger: Logger;
  private azureClient: AzureAPIClient;
  private readonly TIER_INFO: Record<DeploymentTier, TierInfo> = {
    basic: {
      name: 'basic',
      features: ['GitHub Repository', 'README', 'Basic Structure', '.gitignore'],
      cost: 'Free',
      status: 'available',
      description: 'Basic repository setup with essential files'
    },
    docker: {
      name: 'docker',
      features: ['Basic features', 'Dockerfile', 'docker-compose.yml', 'Container configuration'],
      cost: 'Free',
      status: 'available',
      description: 'Docker-ready repository with containerization'
    },
    full: {
      name: 'full',
      features: ['Docker features', 'Azure deployment', 'GitHub Actions CI/CD', 'Auto-scaling'],
      cost: '~$55/mo',
      status: 'coming_soon',
      description: 'Full CI/CD pipeline with Azure deployment'
    },
    enterprise: {
      name: 'enterprise',
      features: ['Full features', 'Multi-environment', 'Monitoring', 'Security scanning', 'SLA'],
      cost: '~$200/mo',
      status: 'coming_soon',
      description: 'Enterprise-grade deployment with advanced features'
    }
  };

  constructor() {
    this.logger = Logger.getInstance();
    
    // Validate configuration
    if (!azureAPIConfig.baseUrl || !azureAPIConfig.apiKey) {
      throw new Error('Azure API configuration is required for AutomationService');
    }
    
    try {
      this.azureClient = new AzureAPIClient(azureAPIConfig);
    } catch (error) {
      this.logger.error('Failed to initialize Azure API client', error);
      throw error;
    }
  }

  /**
   * Quick deploy with minimal configuration
   */
  async quickDeploy(options: QuickDeployOptions): Promise<AutomationResult> {
    // Validate required options
    if (!options.projectName || options.projectName.trim().length === 0) {
      throw new Error('Project name is required');
    }
    
    // Sanitize project name
    options.projectName = this.sanitizeProjectName(options.projectName);
    
    // Default to basic tier if not specified
    const tier = options.tier || 'basic';
    
    // Validate tier
    if (!this.TIER_INFO[tier]) {
      throw new Error(`Invalid tier: ${tier}`);
    }
    
    this.logger.info('Starting quick deployment', { options, tier });

    try {
      const request: AutomationQuickDeployRequest = {
        projectName: options.projectName,
        tier,
        githubUrl: options.githubUrl
      };

      const response = await this.azureClient.quickDeploy(request);
      
      if (!response.success) {
        throw new Error(response.error || 'Quick deploy failed');
      }

      const result: AutomationResult = this.mapResponseToResult(response.data);
      
      this.logger.info('Quick deployment completed', { result });
      return result;

    } catch (error) {
      this.logger.error('Quick deployment failed', error);
      
      // Return appropriate status based on tier availability
      const tierInfo = this.TIER_INFO[tier];
      if (tierInfo.status === 'coming_soon') {
        return {
          status: 'coming_soon',
          projectName: options.projectName,
          tier,
          features: tierInfo.features,
          message: `${tierInfo.name} tier deployment is coming soon!`,
          estimatedCost: this.parseEstimatedCost(tierInfo.cost),
          nextSteps: ['Check back later for availability']
        };
      }
      
      throw new Error(`Failed to deploy ${options.projectName}: ${(error as Error).message}`);
    }
  }

  /**
   * Full deployment with complete configuration control
   */
  async deploy(options: FullDeployOptions): Promise<AutomationResult> {
    // Validate required options
    if (!options.projectName || options.projectName.trim().length === 0) {
      throw new Error('Project name is required');
    }
    if (!options.tier) {
      throw new Error('Deployment tier is required');
    }
    
    // Validate tier
    const tierInfo = this.TIER_INFO[options.tier];
    if (!tierInfo) {
      throw new Error(`Invalid tier: ${options.tier}`);
    }
    
    // Check tier availability
    if (tierInfo.status === 'coming_soon') {
      this.logger.info('Requested tier is coming soon', { tier: options.tier });
      return {
        status: 'coming_soon',
        projectName: options.projectName,
        tier: options.tier,
        features: tierInfo.features,
        message: `${tierInfo.name} tier with full configuration is coming soon!`,
        estimatedCost: this.parseEstimatedCost(tierInfo.cost),
        nextSteps: ['This feature will be available in Q1 2025']
      };
    }
    
    // Sanitize inputs
    options.projectName = this.sanitizeProjectName(options.projectName);
    
    // Validate secrets if provided
    if (options.secrets) {
      this.validateSecrets(options.secrets);
    }
    
    // Validate environments
    if (options.environments && options.environments.length > 0) {
      options.environments = options.environments.map(env => this.sanitizeEnvironmentName(env));
    }
    
    this.logger.info('Starting full deployment', { options });

    try {
      const request: AutomationDeployRequest = {
        tier: options.tier,
        projectName: options.projectName,
        description: options.description,
        isPrivate: options.isPrivate,
        language: options.language,
        framework: options.framework,
        nodeVersion: options.nodeVersion,
        azureSubscriptionId: options.azureSubscriptionId,
        azureResourceGroup: options.azureResourceGroup,
        azureRegion: options.azureRegion || 'eastus',
        preset: options.preset || 'medium',
        customDomain: options.customDomain,
        enableSSL: options.enableSSL !== false,
        environments: options.environments,
        enableMonitoring: options.enableMonitoring,
        enableSecurityScanning: options.enableSecurityScanning,
        enableAutoScaling: options.enableAutoScaling,
        secrets: options.secrets
      };

      const response = await this.azureClient.automationDeploy(request);
      
      if (!response.success) {
        throw new Error(response.error || 'Deployment failed');
      }

      const result: AutomationResult = this.mapResponseToResult(response.data);
      
      this.logger.info('Full deployment completed', { result });
      return result;

    } catch (error) {
      this.logger.error('Full deployment failed', error);
      throw new Error(`Failed to deploy ${options.projectName}: ${(error as Error).message}`);
    }
  }

  /**
   * Deploy from existing GitHub repository
   */
  async deployFromGitHub(options: GitHubDeployOptions): Promise<AutomationResult> {
    // Validate GitHub URL
    if (!options.githubUrl || !this.isValidGitHubUrl(options.githubUrl)) {
      throw new Error('Valid GitHub URL is required');
    }
    
    this.logger.info('Deploying from GitHub', { options });

    try {
      const response = await this.azureClient.deployFromGitHub(
        options.githubUrl,
        options.preset
      );
      
      if (!response.success) {
        throw new Error(response.error || 'GitHub deployment failed');
      }

      // Check if feature is coming soon
      if (response.data?.status === 'coming_soon') {
        return {
          status: 'coming_soon',
          projectName: this.extractProjectNameFromUrl(options.githubUrl),
          message: 'Deploy from GitHub URL feature is coming soon!',
          nextSteps: ['This feature will be available in Q1 2025']
        };
      }

      const result: AutomationResult = this.mapResponseToResult(response.data);
      
      this.logger.info('GitHub deployment completed', { result });
      return result;

    } catch (error) {
      this.logger.error('GitHub deployment failed', error);
      throw new Error(`Failed to deploy from GitHub: ${(error as Error).message}`);
    }
  }

  /**
   * Get status of an automation deployment
   */
  async getStatus(projectName: string): Promise<AutomationResult> {
    if (!projectName || projectName.trim().length === 0) {
      throw new Error('Project name is required');
    }
    
    this.logger.info('Getting automation status', { projectName });

    try {
      const response = await this.azureClient.getAutomationStatus(projectName);
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to get status');
      }

      const result: AutomationResult = this.mapResponseToResult(response.data);
      
      this.logger.info('Automation status retrieved', { result });
      return result;

    } catch (error) {
      this.logger.error('Failed to get automation status', error);
      throw new Error(`Failed to get status for ${projectName}: ${(error as Error).message}`);
    }
  }

  /**
   * Get information about available tiers
   */
  getTierInfo(tier?: DeploymentTier): TierInfo | TierInfo[] {
    if (tier) {
      const info = this.TIER_INFO[tier];
      if (!info) {
        throw new Error(`Invalid tier: ${tier}`);
      }
      return info;
    }
    
    return Object.values(this.TIER_INFO);
  }

  /**
   * Estimate cost for a deployment configuration
   */
  estimateCost(options: FullDeployOptions): number {
    const tierInfo = this.TIER_INFO[options.tier];
    let baseCost = this.parseEstimatedCost(tierInfo.cost);
    
    // Add costs for additional features
    if (options.environments && options.environments.length > 1) {
      baseCost += (options.environments.length - 1) * 10; // $10 per additional environment
    }
    
    if (options.enableMonitoring) {
      baseCost += 15; // $15 for monitoring
    }
    
    if (options.enableSecurityScanning) {
      baseCost += 20; // $20 for security scanning
    }
    
    if (options.customDomain) {
      baseCost += 5; // $5 for custom domain
    }
    
    return baseCost;
  }

  // Private helper methods

  private mapResponseToResult(data: any): AutomationResult {
    return {
      status: data.status || 'preview',
      projectName: data.projectName || data.deployment?.projectName || 'unknown',
      tier: data.tier,
      deployment: {
        url: data.deployment?.url,
        githubRepo: data.deployment?.githubRepo,
        azureResources: data.deployment?.azureResources,
        cicdPipeline: data.deployment?.cicdPipeline
      },
      features: data.features,
      message: data.message,
      estimatedCost: data.estimatedCost,
      nextSteps: data.nextSteps
    };
  }

  private sanitizeProjectName(name: string): string {
    return name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/--+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 63);
  }

  private sanitizeEnvironmentName(env: string): string {
    return env
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .substring(0, 20) || 'env';
  }

  private validateSecrets(secrets: Record<string, string>): void {
    for (const [key, value] of Object.entries(secrets)) {
      if (!key || key.trim().length === 0) {
        throw new Error('Secret key cannot be empty');
      }
      if (!value || value.trim().length === 0) {
        throw new Error(`Secret value for ${key} cannot be empty`);
      }
      if (key.length > 100) {
        throw new Error(`Secret key ${key} is too long (max 100 characters)`);
      }
      // Check for common sensitive patterns that shouldn't be in plain text
      if (value.includes('password') || value.includes('secret') || value.includes('key')) {
        this.logger.warn('Potential sensitive data detected in secrets', { key });
      }
    }
  }

  private isValidGitHubUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.hostname === 'github.com' && 
             parsed.pathname.split('/').filter(p => p).length >= 2;
    } catch {
      return false;
    }
  }

  private extractProjectNameFromUrl(githubUrl: string): string {
    try {
      const parsed = new URL(githubUrl);
      const parts = parsed.pathname.split('/').filter(p => p);
      return parts[parts.length - 1] || 'github-project';
    } catch {
      return 'github-project';
    }
  }

  private parseEstimatedCost(costString: string): number {
    if (costString === 'Free') return 0;
    
    const match = costString.match(/\$(\d+)/);
    if (match) {
      return parseInt(match[1], 10);
    }
    
    return 0;
  }
}