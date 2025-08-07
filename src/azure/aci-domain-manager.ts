/**
 * ACI Domain Manager
 * Handles custom domain configuration for Azure Container Instances
 */

import { Logger } from '../utils/logger';
import { SegregationContext, DomainConfig } from '../core/segregation-types';
import { AzureContainerManager } from './aci-manager';

export interface DomainResult {
  publicUrl: string;
  aciUrl: string;
  ipAddress?: string;
  fqdn?: string;
  ports: {
    web: number;
    dev: number;
    api: number;
  };
}

export interface ApplicationGatewayConfig {
  backendPool: string;
  frontendDomain: string;
  sslCertificate?: string;
  routing: {
    path: string;
    backend: string;
  };
}

export class ACIDomainManager {
  private logger: Logger;
  private domainMappings: Map<string, DomainResult> = new Map();

  constructor(
    private aciManager: AzureContainerManager,
    private baseConfig: {
      baseDomain: string; // e.g., "dev.jupiter.ai"
      useHttps: boolean;
      certificateKeyVault?: string;
    }
  ) {
    this.logger = new Logger('ACIDomainManager');
  }

  /**
   * Configure domain for container instance
   */
  async configureDomain(
    context: SegregationContext,
    customConfig?: DomainConfig
  ): Promise<DomainResult> {
    const containerGroup = await this.aciManager.getOrCreateContainer(context, {
      image: 'mcr.microsoft.com/azuredocs/aci-helloworld',
      memoryGB: 1.5,
      exposedPorts: [80]
    });
    
    if (!containerGroup.ipAddress) {
      throw new Error('Container does not have an IP address');
    }

    const aciFQDN = containerGroup.ipAddress.fqdn;
    const aciIP = containerGroup.ipAddress.ip;
    
    // Generate subdomain based on pattern
    const config = customConfig || this.getDefaultDomainConfig();
    const subdomain = this.generateSubdomain(context, config.subdomainPattern);
    const fullDomain = `${subdomain}.${this.baseConfig.baseDomain}`;

    // Configure DNS if using custom domain
    if (config.customDomain || this.baseConfig.baseDomain) {
      await this.configureDNS(fullDomain, aciIP || aciFQDN!);
    }

    // Configure SSL if enabled
    if (config.sslEnabled && this.baseConfig.useHttps) {
      await this.configureSSL(fullDomain, config.sslCertificate);
    }

    const result: DomainResult = {
      publicUrl: `${this.baseConfig.useHttps ? 'https' : 'http'}://${fullDomain}`,
      aciUrl: `http://${aciFQDN || aciIP}`,
      ipAddress: aciIP,
      fqdn: aciFQDN,
      ports: {
        web: 80,
        dev: 3000,
        api: 8080
      }
    };

    // Cache the domain mapping
    this.domainMappings.set(context.projectId, result);
    
    this.logger.info('Domain configured', { 
      context, 
      domain: fullDomain,
      publicUrl: result.publicUrl 
    });

    return result;
  }

  /**
   * Generate subdomain from pattern
   */
  private generateSubdomain(
    context: SegregationContext,
    pattern: string
  ): string {
    return pattern
      .replace('{userId}', context.userId.substring(0, 8))
      .replace('{projectId}', context.projectId.substring(0, 8))
      .replace('{taskId}', context.taskId.substring(0, 8))
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-');
  }

  /**
   * Configure DNS record
   */
  private async configureDNS(domain: string, target: string): Promise<void> {
    // In a real implementation, this would use Azure DNS API
    // For now, we'll log the required configuration
    
    this.logger.info('DNS configuration required', {
      type: 'A',
      name: domain,
      value: target,
      ttl: 300
    });

    // Example Azure DNS implementation:
    /*
    const dnsClient = new DnsManagementClient(credential, subscriptionId);
    await dnsClient.recordSets.createOrUpdate(
      resourceGroup,
      zoneName,
      recordSetName,
      'A',
      {
        aRecords: [{ ipv4Address: target }],
        ttl: 300
      }
    );
    */
  }

  /**
   * Configure SSL certificate
   */
  private async configureSSL(
    domain: string,
    certificateName?: string
  ): Promise<void> {
    // In a real implementation, this would configure Application Gateway
    // or Azure Front Door with SSL
    
    this.logger.info('SSL configuration required', {
      domain,
      certificate: certificateName || 'auto-generated',
      keyVault: this.baseConfig.certificateKeyVault
    });

    // Example implementation:
    /*
    if (!certificateName && this.baseConfig.certificateKeyVault) {
      // Generate Let's Encrypt certificate
      await this.generateLetsEncryptCertificate(domain);
    }
    
    // Configure Application Gateway
    await this.configureApplicationGateway({
      domain,
      certificateName,
      backendPool: this.aciManager.getContainerUrl(context)
    });
    */
  }

  /**
   * Get default domain configuration
   */
  private getDefaultDomainConfig(): DomainConfig {
    return {
      subdomainPattern: '{projectId}-{userId}',
      sslEnabled: true,
      customDomain: undefined,
      sslCertificate: undefined
    };
  }

  /**
   * Configure Application Gateway for advanced routing
   */
  async configureApplicationGateway(
    context: SegregationContext,
    config: ApplicationGatewayConfig
  ): Promise<void> {
    // This would configure Azure Application Gateway for:
    // - SSL termination
    // - Path-based routing
    // - Load balancing
    // - WAF protection
    
    this.logger.info('Application Gateway configuration', {
      context,
      frontend: config.frontendDomain,
      backend: config.backendPool,
      sslEnabled: !!config.sslCertificate
    });
  }

  /**
   * Get domain info for project
   */
  async getDomainInfo(projectId: string): Promise<DomainResult | null> {
    return this.domainMappings.get(projectId) || null;
  }

  /**
   * Remove domain configuration
   */
  async removeDomain(context: SegregationContext): Promise<void> {
    const domainInfo = this.domainMappings.get(context.projectId);
    
    if (domainInfo) {
      // Remove DNS records
      const subdomain = domainInfo.publicUrl
        .replace(/^https?:\/\//, '')
        .replace(`.${this.baseConfig.baseDomain}`, '');
      
      this.logger.info('Removing domain configuration', {
        context,
        domain: subdomain
      });
      
      // In real implementation, remove DNS records and SSL config
      
      this.domainMappings.delete(context.projectId);
    }
  }

  /**
   * Update domain configuration
   */
  async updateDomain(
    context: SegregationContext,
    newConfig: Partial<DomainConfig>
  ): Promise<DomainResult> {
    // Remove existing configuration
    await this.removeDomain(context);
    
    // Apply new configuration
    const currentConfig = this.getDefaultDomainConfig();
    const updatedConfig = { ...currentConfig, ...newConfig };
    
    return this.configureDomain(context, updatedConfig);
  }

  /**
   * Check domain availability
   */
  async isDomainAvailable(subdomain: string): Promise<boolean> {
    const fullDomain = `${subdomain}.${this.baseConfig.baseDomain}`;
    
    // Check if domain is already in use
    for (const mapping of this.domainMappings.values()) {
      if (mapping.publicUrl.includes(fullDomain)) {
        return false;
      }
    }
    
    // In real implementation, also check DNS records
    return true;
  }

  /**
   * Get all active domains
   */
  getActiveDomains(): Map<string, DomainResult> {
    return new Map(this.domainMappings);
  }
}