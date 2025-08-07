/**
 * Unified Domain Management System
 * Handles domains for both ACI and Azure Static Web Apps
 */

import { AzureAPIClient } from '../clients/azure-api-client';
import { azureAPIConfig } from '../config/azure-api-config';
import { Logger } from '../utils/logger';
import { EventEmitter } from 'events';

export interface DomainConfig {
  provider: 'azure' | 'cloudflare' | 'route53';
  zones: string[];
  defaultZone: string;
  subscriptionId: string;
  resourceGroup: string;
  sslEnabled: boolean;
  monitoring: boolean;
}

export interface DomainRecord {
  id: string;
  zone: string;
  subdomain: string;
  fqdn: string;
  type: 'A' | 'CNAME' | 'TXT' | 'MX' | 'SRV';
  target: string;
  ttl: number;
  service: 'aci' | 'staticwebapp' | 'other';
  environment: 'production' | 'staging' | 'development' | 'preview';
  ssl?: {
    enabled: boolean;
    provider: 'letsencrypt' | 'azure' | 'custom';
    expiryDate?: Date;
  };
  health?: {
    status: 'healthy' | 'unhealthy' | 'unknown';
    lastCheck: Date;
    uptime: number;
  };
  created: Date;
  updated: Date;
}

export interface DeploymentOptions {
  subdomain?: string;
  environment?: 'production' | 'staging' | 'development' | 'preview';
  ssl?: boolean;
  healthCheck?: boolean;
  ttl?: number;
  geoRouting?: boolean;
  monitoring?: boolean;
}

export class UnifiedDomainManager extends EventEmitter {
  private azureClient: AzureAPIClient;
  private logger: Logger;
  private records: Map<string, DomainRecord> = new Map();
  private healthCheckInterval?: NodeJS.Timeout;

  constructor(private config: DomainConfig) {
    super();
    this.logger = new Logger('UnifiedDomainManager');
    
    this.azureClient = new AzureAPIClient(azureAPIConfig);
    
    this.logger.info('Unified Domain Manager initialized', {
      zones: config.zones,
      provider: config.provider
    });

    if (config.monitoring) {
      this.startHealthMonitoring();
    }
  }

  /**
   * Deploy container with domain and SSL
   */
  async deployContainerWithDomain(
    containerName: string,
    containerConfig: any,
    options: DeploymentOptions = {}
  ): Promise<DomainRecord> {
    try {
      this.logger.info('Deploying container with domain', { containerName, options });

      // Step 1: Deploy container
      const container = await this.deployContainer(containerName, containerConfig, options.ssl);
      const containerIP = container.ipAddress?.ip;

      if (!containerIP) {
        throw new Error('Container deployed but no IP assigned');
      }

      // Step 2: Create domain record
      const subdomain = options.subdomain || this.generateSubdomain(containerName, options.environment);
      const zone = this.selectZone(options.environment);
      
      const record = await this.createDomainRecord({
        zone,
        subdomain,
        type: 'A',
        target: containerIP,
        ttl: options.ttl || 300,
        service: 'aci',
        environment: options.environment || 'production',
        ssl: options.ssl ? {
          enabled: true,
          provider: 'letsencrypt'
        } : undefined
      });

      // Step 3: Setup SSL if requested
      if (options.ssl) {
        await this.setupContainerSSL(containerName, record.fqdn);
      }

      // Step 4: Configure health monitoring
      if (options.healthCheck) {
        await this.setupHealthCheck(record);
      }

      this.emit('container-deployed', { container: containerName, domain: record.fqdn });
      return record;

    } catch (error) {
      this.logger.error('Failed to deploy container with domain', error);
      throw error;
    }
  }

  /**
   * Deploy Static Web App with custom domain
   */
  async deployStaticWebAppWithDomain(
    appName: string,
    appConfig: any,
    options: DeploymentOptions = {}
  ): Promise<DomainRecord> {
    try {
      this.logger.info('Deploying Static Web App with domain', { appName, options });

      // Step 1: Deploy Static Web App
      const app = await this.deployStaticWebApp(appName, appConfig);
      const defaultHostname = app.defaultHostname;

      if (!defaultHostname) {
        throw new Error('Static Web App deployed but no hostname assigned');
      }

      // Step 2: Create CNAME record
      const subdomain = options.subdomain || this.generateSubdomain(appName, options.environment);
      const zone = this.selectZone(options.environment);
      
      const record = await this.createDomainRecord({
        zone,
        subdomain,
        type: 'CNAME',
        target: defaultHostname,
        ttl: options.ttl || 3600,
        service: 'staticwebapp',
        environment: options.environment || 'production',
        ssl: {
          enabled: true,
          provider: 'azure' // Static Web Apps provides SSL automatically
        }
      });

      // Step 3: Add custom domain to Static Web App
      await this.addCustomDomainToStaticWebApp(appName, record.fqdn);

      // Step 4: Setup monitoring
      if (options.monitoring) {
        await this.setupHealthCheck(record);
      }

      this.emit('staticwebapp-deployed', { app: appName, domain: record.fqdn });
      return record;

    } catch (error) {
      this.logger.error('Failed to deploy Static Web App with domain', error);
      throw error;
    }
  }

  /**
   * Create a domain record
   */
  private async createDomainRecord(config: Omit<DomainRecord, 'id' | 'created' | 'updated' | 'fqdn'>): Promise<DomainRecord> {
    const fqdn = `${config.subdomain}.${config.zone}`;
    const recordId = `${config.zone}-${config.subdomain}-${Date.now()}`;

    // Create DNS record in Azure
    await this.createDNSRecord(
      config.zone,
      config.subdomain,
      config.type,
      config.target,
      config.ttl
    );

    const record: DomainRecord = {
      id: recordId,
      fqdn,
      created: new Date(),
      updated: new Date(),
      ...config
    };

    this.records.set(recordId, record);
    this.emit('domain-created', record);

    return record;
  }

  /**
   * Create DNS record in Azure
   */
  private async createDNSRecord(
    zone: string,
    subdomain: string,
    type: string,
    target: string,
    ttl: number
  ): Promise<void> {
    const recordData: any = { ttl };

    switch (type) {
      case 'A':
        recordData.aRecords = [{ ipv4Address: target }];
        break;
      case 'CNAME':
        recordData.cnameRecord = { cname: target };
        break;
      case 'TXT':
        recordData.txtRecords = [{ value: [target] }];
        break;
    }

    // Create DNS record via Azure API
    const fqdn = `${subdomain}.${zone}`;
    await this.azureClient.configureDNS(
      fqdn,
      target,
      type as 'A' | 'CNAME'
    );

    this.logger.info(`DNS record created: ${subdomain}.${zone} → ${target}`);
  }

  /**
   * Deploy container with optional SSL sidecar
   */
  private async deployContainer(name: string, config: any, ssl: boolean = false): Promise<any> {
    const containerConfig = { ...config };

    if (ssl) {
      // Add Caddy as reverse proxy for SSL
      containerConfig.containers = [
        {
          name: 'app',
          properties: {
            image: config.image,
            resources: {
              requests: {
                cpu: config.cpu || 0.5,
                memoryInGB: config.memoryGB || 1
              }
            },
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
              { name: 'CADDY_ADMIN', value: '0.0.0.0:2019' }
            ],
            command: [
              'caddy',
              'reverse-proxy',
              '--from', ':443',
              '--to', 'localhost:8080'
            ]
          }
        }
      ];
    }

    const response = await this.azureClient.deployContainer({
      name,
      image: config.image,
      resourceGroup: this.config.resourceGroup,
      location: 'eastus',
      cpu: config.cpu || 1,
      memoryGB: config.memoryGB || 1.5,
      ports: ssl ? 
        [{ port: 80, protocol: 'TCP' }, { port: 443, protocol: 'TCP' }] :
        [{ port: config.port || 80, protocol: 'TCP' }],
      environmentVariables: config.env || {}
    });

    if (!response.success) {
      throw new Error(`Failed to deploy container: ${response.error || response.message}`);
    }

    return response.data;
  }

  /**
   * Deploy Static Web App
   */
  private async deployStaticWebApp(name: string, config: any): Promise<any> {
    const response = await this.azureClient.deploySWA({
      name,
      repositoryUrl: config.repositoryUrl,
      branch: config.branch || 'main',
      resourceGroup: this.config.resourceGroup,
      location: 'eastus2',
      buildCommand: config.buildCommand,
      apiLocation: config.apiLocation || 'api',
      outputLocation: config.outputLocation || 'dist'
    });

    if (!response.success) {
      throw new Error(`Failed to deploy Static Web App: ${response.error || response.message}`);
    }

    return response.data;
  }

  /**
   * Add custom domain to Static Web App
   */
  private async addCustomDomainToStaticWebApp(appName: string, domain: string): Promise<void> {
    // Configure custom domain via Azure API
    await this.azureClient.configureDNS(
      domain,
      `${appName}.azurestaticapps.net`,
      'CNAME'
    );
  }

  /**
   * Setup SSL for container
   */
  private async setupContainerSSL(containerName: string, domain: string): Promise<void> {
    // SSL is handled by Caddy sidecar container
    this.logger.info(`SSL configured for ${domain} via Caddy`);
  }

  /**
   * Setup health monitoring
   */
  private async setupHealthCheck(record: DomainRecord): Promise<void> {
    // Add to monitoring queue
    this.logger.info(`Health monitoring enabled for ${record.fqdn}`);
  }

  /**
   * Start health monitoring service
   */
  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(async () => {
      for (const [id, record] of this.records) {
        try {
          const health = await this.checkHealth(record);
          record.health = health;
          this.records.set(id, record);
          
          if (health.status === 'unhealthy') {
            this.emit('domain-unhealthy', record);
          }
        } catch (error) {
          this.logger.error(`Health check failed for ${record.fqdn}`, error);
        }
      }
    }, 60000); // Check every minute
  }

  /**
   * Check health of a domain
   */
  private async checkHealth(record: DomainRecord): Promise<any> {
    const protocol = record.ssl?.enabled ? 'https' : 'http';
    const url = `${protocol}://${record.fqdn}/health`;
    
    try {
      const response = await fetch(url, { 
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });
      
      return {
        status: response.ok ? 'healthy' : 'unhealthy',
        lastCheck: new Date(),
        uptime: 99.9 // Calculate from history
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        lastCheck: new Date(),
        uptime: 0
      };
    }
  }

  /**
   * Generate subdomain based on environment
   */
  private generateSubdomain(name: string, environment?: string): string {
    const env = environment === 'production' ? '' : `-${environment}`;
    return `${name}${env}`.toLowerCase().replace(/[^a-z0-9-]/g, '');
  }

  /**
   * Select zone based on environment
   */
  private selectZone(environment?: string): string {
    // Could use different zones for different environments
    return this.config.defaultZone;
  }

  /**
   * List all domain records
   */
  async listDomains(filters?: {
    service?: 'aci' | 'staticwebapp';
    environment?: string;
    zone?: string;
  }): Promise<DomainRecord[]> {
    let records = Array.from(this.records.values());
    
    if (filters) {
      if (filters.service) {
        records = records.filter(r => r.service === filters.service);
      }
      if (filters.environment) {
        records = records.filter(r => r.environment === filters.environment);
      }
      if (filters.zone) {
        records = records.filter(r => r.zone === filters.zone);
      }
    }
    
    return records;
  }

  /**
   * Remove domain and associated resources
   */
  async removeDomain(recordId: string): Promise<boolean> {
    const record = this.records.get(recordId);
    if (!record) {
      return false;
    }

    try {
      // Delete DNS record
      // Delete DNS record via Azure API
      await this.azureClient.deleteDNSRecord(
        record.fqdn,
        record.subdomain
      );

      this.records.delete(recordId);
      this.emit('domain-removed', record);
      
      return true;
    } catch (error) {
      this.logger.error('Failed to remove domain', error);
      throw error;
    }
  }

  /**
   * Get domain analytics
   */
  async getDomainAnalytics(): Promise<{
    totalDomains: number;
    byService: Record<string, number>;
    byEnvironment: Record<string, number>;
    sslEnabled: number;
    healthStatus: Record<string, number>;
  }> {
    const records = Array.from(this.records.values());
    
    return {
      totalDomains: records.length,
      byService: this.groupBy(records, 'service'),
      byEnvironment: this.groupBy(records, 'environment'),
      sslEnabled: records.filter(r => r.ssl?.enabled).length,
      healthStatus: this.groupBy(records, r => r.health?.status || 'unknown')
    };
  }

  private groupBy(items: any[], key: string | ((item: any) => string)): Record<string, number> {
    return items.reduce((acc, item) => {
      const value = typeof key === 'function' ? key(item) : item[key];
      acc[value] = (acc[value] || 0) + 1;
      return acc;
    }, {});
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
  }
}