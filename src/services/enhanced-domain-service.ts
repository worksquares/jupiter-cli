/**
 * Enhanced Domain Configuration Service
 * Well-architected domain management with SSL and comprehensive error handling
 */

import { EventEmitter } from 'events';
import { UnifiedDomainManager } from '../dns/unified-domain-manager';
import { SSLCertificateService, SSLConfiguration } from './ssl-certificate-service';
import { DomainConfigurationService } from './domain-configuration-service';
import { Logger } from '../utils/logger';
import { DatabaseService } from './database-service';

export interface EnhancedDomainConfig {
  projectId: string;
  domain: string;
  subdomain: string;
  fqdn: string;
  service: 'aci' | 'staticwebapp';
  environment: 'production' | 'staging' | 'development' | 'preview';
  ssl: {
    enabled: boolean;
    provider: 'letsencrypt' | 'azure' | 'custom';
    autoRenew: boolean;
    certificate?: any;
  };
  dns: {
    provider: 'azure' | 'cloudflare' | 'route53';
    records: Array<{
      type: 'A' | 'CNAME' | 'TXT';
      value: string;
      ttl: number;
    }>;
  };
  health: {
    enabled: boolean;
    endpoint: string;
    interval: number;
    status?: 'healthy' | 'unhealthy' | 'unknown';
    lastCheck?: Date;
  };
  deployment: {
    status: 'pending' | 'deploying' | 'active' | 'failed' | 'suspended';
    deployedAt?: Date;
    error?: string;
  };
}

export interface DomainDeploymentOptions {
  service: 'aci' | 'staticwebapp';
  environment?: 'production' | 'staging' | 'development' | 'preview';
  useAI?: boolean;
  customDomain?: string;
  ssl?: {
    enabled?: boolean;
    email?: string;
    staging?: boolean;
  };
  healthCheck?: {
    enabled?: boolean;
    endpoint?: string;
    interval?: number;
  };
  retry?: {
    maxAttempts?: number;
    backoffMs?: number;
  };
}

export class EnhancedDomainService extends EventEmitter {
  private logger: Logger;
  private domainConfigService: DomainConfigurationService;
  private sslService: SSLCertificateService;
  private domainManager: UnifiedDomainManager;
  private database: DatabaseService;
  private healthCheckIntervals: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    private config: {
      defaultZone: string;
      databaseConfig: any;
      aiConfig: any;
      domainManagerConfig: any;
      sslConfig?: SSLConfiguration;
      monitoring?: {
        enabled: boolean;
        interval: number;
      };
    }
  ) {
    super();
    this.logger = new Logger('EnhancedDomainService');
    
    // Initialize services
    this.database = new DatabaseService(config.databaseConfig);
    this.domainConfigService = new DomainConfigurationService(config);
    this.sslService = new SSLCertificateService(config.sslConfig);
    this.domainManager = new UnifiedDomainManager(config.domainManagerConfig);
    
    // Setup event handlers
    this.setupEventHandlers();
    
    this.logger.info('Enhanced Domain Service initialized', {
      defaultZone: config.defaultZone,
      sslEnabled: true,
      monitoring: config.monitoring?.enabled
    });
  }

  /**
   * Deploy project with enhanced domain configuration
   */
  async deployProjectWithEnhancedDomain(
    projectId: string,
    deploymentConfig: any,
    options: Partial<DomainDeploymentOptions> = {}
  ): Promise<{
    success: boolean;
    domain?: EnhancedDomainConfig;
    deployment?: any;
    errors?: string[];
  }> {
    const errors: string[] = [];
    let domainConfig: EnhancedDomainConfig | null = null;
    
    try {
      // Step 1: Validate inputs
      this.validateDeploymentRequest(projectId, deploymentConfig, options);
      
      // Step 2: Configure domain with AI or custom
      this.logger.info('Configuring domain for project', { projectId, options });
      
      const baseDomainConfig = await this.domainConfigService.configureDomainForProject(
        projectId,
        {
          service: options.service || 'staticwebapp',
          environment: (options.environment === 'preview' ? 'staging' : options.environment) || 'production',
          customDomain: options.customDomain,
          useAI: options.useAI !== false
        }
      );

      // Step 3: Prepare enhanced domain configuration
      domainConfig = await this.prepareEnhancedDomainConfig(baseDomainConfig, options);
      
      // Step 4: Deploy with retry logic
      const deployment = await this.deployWithRetry(
        domainConfig,
        deploymentConfig,
        options.retry
      );
      
      // Step 5: Configure SSL if enabled
      if (options.ssl?.enabled !== false) {
        await this.configureSSL(domainConfig, options.ssl);
      }
      
      // Step 6: Setup health monitoring
      if (options.healthCheck?.enabled !== false) {
        await this.setupHealthMonitoring(domainConfig, options.healthCheck);
      }
      
      // Step 7: Save configuration
      await this.saveEnhancedConfiguration(domainConfig);
      
      // Step 8: Verify deployment
      const verified = await this.verifyDeployment(domainConfig);
      if (!verified) {
        errors.push('Deployment verification failed');
      }
      
      this.emit('deployment-success', {
        projectId,
        domain: domainConfig.fqdn,
        ssl: domainConfig.ssl.enabled
      });
      
      return {
        success: true,
        domain: domainConfig,
        deployment
      };
      
    } catch (error: any) {
      this.logger.error('Deployment failed', error);
      errors.push(error.message);
      
      // Rollback on failure
      if (domainConfig) {
        await this.rollbackDeployment(domainConfig).catch(e => 
          this.logger.error('Rollback failed', e)
        );
      }
      
      this.emit('deployment-failed', {
        projectId,
        error: error.message
      });
      
      return {
        success: false,
        errors
      };
    }
  }

  /**
   * Validate deployment request
   */
  private validateDeploymentRequest(
    projectId: string,
    deploymentConfig: any,
    options: Partial<DomainDeploymentOptions>
  ): void {
    if (!projectId) {
      throw new ValidationError('Project ID is required');
    }
    
    if (!options.service) {
      throw new ValidationError('Service type (aci/staticwebapp) is required');
    }
    
    if (options.service === 'aci' && !deploymentConfig.containerConfig) {
      throw new ValidationError('Container configuration is required for ACI deployment');
    }
    
    if (options.service === 'staticwebapp' && !deploymentConfig.staticWebAppConfig) {
      throw new ValidationError('Static Web App configuration is required');
    }
    
    if (options.customDomain && !this.isValidDomainFormat(options.customDomain)) {
      throw new ValidationError('Invalid custom domain format');
    }
  }

  /**
   * Prepare enhanced domain configuration
   */
  private async prepareEnhancedDomainConfig(
    baseDomainConfig: any,
    options: Partial<DomainDeploymentOptions>
  ): Promise<EnhancedDomainConfig> {
    return {
      projectId: baseDomainConfig.projectId,
      domain: baseDomainConfig.domain,
      subdomain: baseDomainConfig.subdomain,
      fqdn: baseDomainConfig.fqdn,
      service: baseDomainConfig.service,
      environment: baseDomainConfig.environment,
      ssl: {
        enabled: options.ssl?.enabled !== false,
        provider: 'letsencrypt',
        autoRenew: true
      },
      dns: {
        provider: 'azure',
        records: []
      },
      health: {
        enabled: options.healthCheck?.enabled !== false,
        endpoint: options.healthCheck?.endpoint || '/health',
        interval: options.healthCheck?.interval || 60000
      },
      deployment: {
        status: 'pending'
      }
    };
  }

  /**
   * Deploy with retry logic
   */
  private async deployWithRetry(
    domainConfig: EnhancedDomainConfig,
    deploymentConfig: any,
    retryOptions?: { maxAttempts?: number; backoffMs?: number }
  ): Promise<any> {
    const maxAttempts = retryOptions?.maxAttempts || 3;
    const backoffMs = retryOptions?.backoffMs || 2000;
    
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        this.logger.info(`Deployment attempt ${attempt}/${maxAttempts}`, {
          domain: domainConfig.fqdn
        });
        
        domainConfig.deployment.status = 'deploying';
        
        // Deploy based on service type
        let deployment;
        if (domainConfig.service === 'aci') {
          deployment = await this.deployContainer(domainConfig, deploymentConfig);
        } else {
          deployment = await this.deployStaticWebApp(domainConfig, deploymentConfig);
        }
        
        domainConfig.deployment.status = 'active';
        domainConfig.deployment.deployedAt = new Date();
        
        return deployment;
        
      } catch (error: any) {
        lastError = error;
        this.logger.error(`Deployment attempt ${attempt} failed`, error);
        
        if (attempt < maxAttempts) {
          // Check if error is retryable
          if (this.isRetryableError(error)) {
            const waitTime = backoffMs * attempt;
            this.logger.info(`Waiting ${waitTime}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
          } else {
            throw error; // Non-retryable error
          }
        }
      }
    }
    
    domainConfig.deployment.status = 'failed';
    domainConfig.deployment.error = lastError?.message;
    
    throw new DeploymentError(
      `Deployment failed after ${maxAttempts} attempts: ${lastError?.message}`
    );
  }

  /**
   * Deploy container with enhanced configuration
   */
  private async deployContainer(
    domainConfig: EnhancedDomainConfig,
    deploymentConfig: any
  ): Promise<any> {
    try {
      // Add SSL support via Caddy if enabled
      if (domainConfig.ssl.enabled) {
        deploymentConfig.containerConfig = this.addCaddySSLContainer(
          deploymentConfig.containerConfig,
          domainConfig.fqdn
        );
      }
      
      const deployment = await this.domainManager.deployContainerWithDomain(
        `${domainConfig.projectId}-${domainConfig.environment}`,
        deploymentConfig.containerConfig,
        {
          subdomain: domainConfig.subdomain,
          environment: domainConfig.environment,
          ssl: domainConfig.ssl.enabled,
          healthCheck: domainConfig.health.enabled
        }
      );
      
      // Update DNS records
      domainConfig.dns.records.push({
        type: 'A',
        value: deployment.target,
        ttl: 300
      });
      
      return deployment;
      
    } catch (error) {
      throw new DeploymentError(`Container deployment failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Deploy Static Web App with enhanced configuration
   */
  private async deployStaticWebApp(
    domainConfig: EnhancedDomainConfig,
    deploymentConfig: any
  ): Promise<any> {
    try {
      const deployment = await this.domainManager.deployStaticWebAppWithDomain(
        `${domainConfig.projectId}-${domainConfig.environment}`,
        deploymentConfig.staticWebAppConfig,
        {
          subdomain: domainConfig.subdomain,
          environment: domainConfig.environment
        }
      );
      
      // Update DNS records
      domainConfig.dns.records.push({
        type: 'CNAME',
        value: deployment.target,
        ttl: 3600
      });
      
      // SSL is automatic for Static Web Apps
      domainConfig.ssl.provider = 'azure';
      
      return deployment;
      
    } catch (error) {
      throw new DeploymentError(`Static Web App deployment failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Add Caddy SSL container configuration
   */
  private addCaddySSLContainer(containerConfig: any, domain: string): any {
    const caddyConfig = `
{
    email ${this.config.sslConfig?.email || 'admin@' + domain}
    acme_ca ${this.config.sslConfig?.staging ? 
      'https://acme-staging-v02.api.letsencrypt.org/directory' : 
      'https://acme-v02.api.letsencrypt.org/directory'}
}

${domain} {
    reverse_proxy app:8080
    
    tls {
        on_demand
    }
    
    encode gzip
    
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        X-XSS-Protection "1; mode=block"
        Referrer-Policy "strict-origin-when-cross-origin"
    }
    
    handle_errors {
        respond "{http.error.status_code} {http.error.status_text}"
    }
}`;

    return {
      ...containerConfig,
      containers: [
        {
          name: 'app',
          properties: {
            ...containerConfig,
            ports: [{ port: 8080 }]
          }
        },
        {
          name: 'caddy',
          properties: {
            image: 'caddy:alpine',
            resources: {
              requests: {
                cpu: 0.25,
                memoryInGB: 0.5
              }
            },
            ports: [
              { protocol: 'TCP', port: 80 },
              { protocol: 'TCP', port: 443 }
            ],
            environmentVariables: [
              { name: 'CADDYFILE', value: caddyConfig }
            ],
            command: ['caddy', 'run', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile']
          }
        }
      ]
    };
  }

  /**
   * Configure SSL certificate
   */
  private async configureSSL(
    domainConfig: EnhancedDomainConfig,
    sslOptions?: any
  ): Promise<void> {
    try {
      if (domainConfig.service === 'staticwebapp') {
        // SSL is automatic for Static Web Apps
        this.logger.info('SSL configured automatically for Static Web App');
        return;
      }
      
      // For containers, Caddy handles SSL automatically
      // But we can track certificate information
      const certInfo = await this.sslService.getCertificateInfo(domainConfig.fqdn);
      
      if (!certInfo.exists) {
        // Certificate will be generated on first access
        this.logger.info('SSL certificate will be generated on first access', {
          domain: domainConfig.fqdn
        });
      } else {
        domainConfig.ssl.certificate = certInfo.info;
      }
      
    } catch (error) {
      this.logger.error('SSL configuration failed', error);
      throw new SSLConfigurationError(`SSL setup failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Setup health monitoring
   */
  private async setupHealthMonitoring(
    domainConfig: EnhancedDomainConfig,
    healthOptions?: any
  ): Promise<void> {
    try {
      const checkHealth = async () => {
        try {
          const protocol = domainConfig.ssl.enabled ? 'https' : 'http';
          const url = `${protocol}://${domainConfig.fqdn}${domainConfig.health.endpoint}`;
          
          const response = await fetch(url, {
            method: 'GET',
            signal: AbortSignal.timeout(5000)
          });
          
          domainConfig.health.status = response.ok ? 'healthy' : 'unhealthy';
          domainConfig.health.lastCheck = new Date();
          
          if (!response.ok) {
            this.emit('health-check-failed', {
              domain: domainConfig.fqdn,
              status: response.status
            });
          }
          
        } catch (error) {
          domainConfig.health.status = 'unhealthy';
          domainConfig.health.lastCheck = new Date();
          
          this.emit('health-check-error', {
            domain: domainConfig.fqdn,
            error: error instanceof Error ? error.message : String(error)
          });
        }
        
        // Update in database
        await this.updateHealthStatus(domainConfig);
      };
      
      // Initial check
      await checkHealth();
      
      // Setup interval
      const interval = setInterval(checkHealth, domainConfig.health.interval);
      this.healthCheckIntervals.set(domainConfig.fqdn, interval);
      
      this.logger.info('Health monitoring configured', {
        domain: domainConfig.fqdn,
        endpoint: domainConfig.health.endpoint,
        interval: domainConfig.health.interval
      });
      
    } catch (error) {
      this.logger.error('Health monitoring setup failed', error);
      // Non-fatal error
    }
  }

  /**
   * Save enhanced configuration to database
   */
  private async saveEnhancedConfiguration(config: EnhancedDomainConfig): Promise<void> {
    const query = `
      UPDATE domain_configurations 
      SET 
        ssl_configured = ?,
        ssl_provider = ?,
        health_check_enabled = ?,
        metadata = ?,
        updated_at = NOW()
      WHERE project_id = ? AND subdomain = ?
    `;
    
    const metadata = JSON.stringify({
      ssl: config.ssl,
      dns: config.dns,
      health: config.health,
      deployment: config.deployment
    });
    
    await this.database.query(query, [
      config.ssl.enabled,
      config.ssl.provider,
      config.health.enabled,
      metadata,
      config.projectId,
      config.subdomain
    ]);
  }

  /**
   * Update health status in database
   */
  private async updateHealthStatus(config: EnhancedDomainConfig): Promise<void> {
    const query = `
      UPDATE domain_configurations 
      SET 
        last_health_check = ?,
        health_status = ?,
        updated_at = NOW()
      WHERE project_id = ? AND subdomain = ?
    `;
    
    await this.database.query(query, [
      config.health.lastCheck,
      config.health.status,
      config.projectId,
      config.subdomain
    ]);
  }

  /**
   * Verify deployment
   */
  private async verifyDeployment(config: EnhancedDomainConfig): Promise<boolean> {
    try {
      // Check DNS propagation
      const dnsPropagated = await this.checkDNSPropagation(config.fqdn);
      if (!dnsPropagated) {
        this.logger.warn('DNS not fully propagated yet', { domain: config.fqdn });
      }
      
      // Check if service is accessible
      const protocol = config.ssl.enabled ? 'https' : 'http';
      const url = `${protocol}://${config.fqdn}`;
      
      const response = await fetch(url, {
        method: 'HEAD',
        signal: AbortSignal.timeout(10000)
      });
      
      return response.ok;
      
    } catch (error) {
      this.logger.error('Deployment verification failed', error);
      return false;
    }
  }

  /**
   * Check DNS propagation
   */
  private async checkDNSPropagation(domain: string): Promise<boolean> {
    try {
      const dns = require('dns').promises;
      const resolver = new dns.Resolver();
      resolver.setServers(['8.8.8.8', '1.1.1.1']);
      
      const addresses = await resolver.resolve4(domain);
      return addresses.length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Rollback deployment on failure
   */
  private async rollbackDeployment(config: EnhancedDomainConfig): Promise<void> {
    this.logger.info('Rolling back deployment', { domain: config.fqdn });
    
    try {
      // Remove DNS records
      if (config.dns.records.length > 0) {
        // Implementation depends on DNS provider
      }
      
      // Remove health check
      const interval = this.healthCheckIntervals.get(config.fqdn);
      if (interval) {
        clearInterval(interval);
        this.healthCheckIntervals.delete(config.fqdn);
      }
      
      // Update database
      const query = `
        UPDATE domain_configurations 
        SET status = 'failed', updated_at = NOW()
        WHERE project_id = ? AND subdomain = ?
      `;
      
      await this.database.query(query, [config.projectId, config.subdomain]);
      
    } catch (error) {
      this.logger.error('Rollback failed', error);
    }
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    // Domain configuration events
    this.domainConfigService.on('domain-configured', (event) => {
      this.emit('domain-configured', event);
    });
    
    // SSL events
    this.sslService.on('certificate-generated', (event) => {
      this.emit('ssl-certificate-generated', event);
    });
    
    this.sslService.on('certificate-renewed', (event) => {
      this.emit('ssl-certificate-renewed', event);
    });
    
    // Domain manager events
    this.domainManager.on('container-deployed', (event) => {
      this.emit('container-deployed', event);
    });
    
    this.domainManager.on('staticwebapp-deployed', (event) => {
      this.emit('staticwebapp-deployed', event);
    });
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: any): boolean {
    const retryableErrors = [
      'ECONNRESET',
      'ETIMEDOUT',
      'ENOTFOUND',
      'ECONNREFUSED',
      'RATE_LIMIT',
      'QUOTA_EXCEEDED'
    ];
    
    return retryableErrors.some(code => 
      error.code === code || error.message?.includes(code)
    );
  }

  /**
   * Validate domain format
   */
  private isValidDomainFormat(domain: string): boolean {
    const domainRegex = /^[a-z0-9]+(-[a-z0-9]+)*$/i;
    return domainRegex.test(domain) && domain.length <= 63;
  }

  /**
   * Get deployment status
   */
  async getDeploymentStatus(projectId: string): Promise<{
    domains: EnhancedDomainConfig[];
    overall: {
      active: number;
      failed: number;
      pending: number;
    };
  }> {
    const query = `
      SELECT * FROM domain_configurations 
      WHERE project_id = ?
      ORDER BY created_at DESC
    `;
    
    const results = await this.database.query(query, [projectId]);
    
    const domains = results.map((row: any) => {
      const metadata = JSON.parse(row.metadata || '{}');
      return {
        ...row,
        ...metadata
      };
    });
    
    const overall = {
      active: domains.filter((d: any) => d.deployment?.status === 'active').length,
      failed: domains.filter((d: any) => d.deployment?.status === 'failed').length,
      pending: domains.filter((d: any) => d.deployment?.status === 'pending').length
    };
    
    return { domains, overall };
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    // Clear all health check intervals
    for (const interval of this.healthCheckIntervals.values()) {
      clearInterval(interval);
    }
    this.healthCheckIntervals.clear();
    
    // Cleanup services
    await this.domainConfigService.cleanup();
    await this.sslService.cleanup();
    await this.domainManager.cleanup();
    await this.database.close();
  }
}

// Custom error classes
export class DomainServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DomainServiceError';
  }
}

export class ValidationError extends DomainServiceError {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class DeploymentError extends DomainServiceError {
  constructor(message: string) {
    super(message);
    this.name = 'DeploymentError';
  }
}

export class SSLConfigurationError extends DomainServiceError {
  constructor(message: string) {
    super(message);
    this.name = 'SSLConfigurationError';
  }
}

export class DNSConfigurationError extends DomainServiceError {
  constructor(message: string) {
    super(message);
    this.name = 'DNSConfigurationError';
  }
}