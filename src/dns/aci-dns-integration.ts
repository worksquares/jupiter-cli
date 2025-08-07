/**
 * Azure Container Instance DNS Integration
 * Automatically configures DNS subdomains for ACI deployments
 */

import { ContainerGroup } from '@azure/arm-containerinstance';
import { GoDaddyDNSManager, GoDaddyConfig, SubdomainConfig } from './godaddy-dns-manager';
import { AzureContainerManager } from '../azure/aci-manager';
import { Logger } from '../utils/logger';
import { EventEmitter } from 'events';

export interface ACIDNSConfig extends GoDaddyConfig {
  subdomainPrefix?: string;
  enableSSL?: boolean;
  autoCleanup?: boolean;
}

export interface ContainerDNSMapping {
  containerName: string;
  subdomain: string;
  fqdn: string;
  ip?: string;
  aciUrl?: string;
  created: Date;
}

export class ACIDNSIntegration extends EventEmitter {
  private dnsManager: GoDaddyDNSManager;
  private logger: Logger;
  private mappings: Map<string, ContainerDNSMapping> = new Map();
  private subdomainPrefix: string;

  constructor(
    private aciManager: AzureContainerManager,
    private config: ACIDNSConfig
  ) {
    super();
    this.logger = new Logger('ACIDNSIntegration');
    this.dnsManager = new GoDaddyDNSManager(config);
    this.subdomainPrefix = config.subdomainPrefix || 'aci';
  }

  /**
   * Create container with automatic DNS configuration
   */
  async createContainerWithDNS(
    context: any,
    dockerConfig?: any,
    gitConfig?: any
  ): Promise<{
    container: ContainerGroup;
    dns: ContainerDNSMapping;
  }> {
    try {
      // Step 1: Create the container
      this.logger.info('Creating container...', { context });
      const container = await this.aciManager.createContainer(
        context,
        dockerConfig
      );

      // Step 2: Get container details
      const containerName = this.aciManager.getContainerName(context);
      const ip = container.ipAddress?.ip;
      const aciFqdn = container.ipAddress?.fqdn;

      if (!ip && !aciFqdn) {
        throw new Error('Container created but no IP or FQDN assigned');
      }

      // Step 3: Generate subdomain name
      const subdomain = this.generateSubdomain(context);
      const fqdn = `${subdomain}.${this.config.domain}`;

      // Step 4: Create DNS record
      this.logger.info('Configuring DNS...', { subdomain, target: ip || aciFqdn });
      
      await this.dnsManager.createSubdomain({
        subdomain,
        target: ip || aciFqdn!,
        ttl: 300, // 5 minutes for faster updates
        description: `ACI:${containerName}|User:${context.userId}|Project:${context.projectId}`
      });

      // Step 5: Create mapping
      const mapping: ContainerDNSMapping = {
        containerName,
        subdomain,
        fqdn,
        ip,
        aciUrl: aciFqdn ? `http://${aciFqdn}` : undefined,
        created: new Date()
      };

      this.mappings.set(containerName, mapping);
      this.emit('dns-configured', mapping);

      // Step 6: Return results
      this.logger.info('Container created with DNS', {
        container: containerName,
        url: `http://${fqdn}`,
        ip
      });

      return { container, dns: mapping };

    } catch (error) {
      this.logger.error('Failed to create container with DNS', error);
      throw error;
    }
  }

  /**
   * Update DNS when container IP changes
   */
  async updateContainerDNS(containerName: string): Promise<boolean> {
    try {
      const mapping = this.mappings.get(containerName);
      if (!mapping) {
        throw new Error(`No DNS mapping found for container: ${containerName}`);
      }

      // Get current container state
      const context = this.parseContainerName(containerName);
      const status = await this.aciManager.getContainerStatus(containerName);
      
      if (!status || !status.ipAddress) {
        this.logger.warn('Container has no accessible IP');
        return false;
      }

      const newTarget = status.ipAddress.ip || status.ipAddress.fqdn;

      // Update DNS if changed
      if (newTarget !== mapping.ip) {
        await this.dnsManager.updateSubdomain(mapping.subdomain, newTarget);
        mapping.ip = newTarget;
        this.logger.info('Updated DNS for container', {
          container: containerName,
          subdomain: mapping.subdomain,
          newTarget
        });
      }

      return true;
    } catch (error) {
      this.logger.error('Failed to update container DNS', error);
      throw error;
    }
  }

  /**
   * Delete DNS records when container is removed
   */
  async deleteContainerDNS(containerName: string): Promise<boolean> {
    try {
      const mapping = this.mappings.get(containerName);
      if (!mapping) {
        this.logger.warn('No DNS mapping found for container', { containerName });
        return false;
      }

      await this.dnsManager.deleteSubdomain(mapping.subdomain);
      this.mappings.delete(containerName);
      this.emit('dns-deleted', mapping);

      this.logger.info('Deleted DNS for container', {
        container: containerName,
        subdomain: mapping.subdomain
      });

      return true;
    } catch (error) {
      this.logger.error('Failed to delete container DNS', error);
      throw error;
    }
  }

  /**
   * List all container DNS mappings
   */
  async listContainerDNS(): Promise<ContainerDNSMapping[]> {
    // Sync with actual DNS records
    const dnsRecords = await this.dnsManager.listACISubdomains();
    
    // Update local mappings
    for (const record of dnsRecords) {
      if (record.description?.startsWith('ACI:')) {
        const parts = record.description.split('|');
        const containerName = parts[0].replace('ACI:', '');
        
        if (!this.mappings.has(containerName)) {
          this.mappings.set(containerName, {
            containerName,
            subdomain: record.subdomain,
            fqdn: `${record.subdomain}.${this.config.domain}`,
            ip: record.target,
            created: new Date()
          });
        }
      }
    }

    return Array.from(this.mappings.values());
  }

  /**
   * Setup wildcard DNS for development containers
   */
  async setupWildcardDNS(target: string): Promise<boolean> {
    try {
      // Create *.dev.domain.com -> target
      await this.dnsManager.createWildcardSubdomain('dev', target);
      
      // Create *.test.domain.com -> target  
      await this.dnsManager.createWildcardSubdomain('test', target);
      
      this.logger.info('Wildcard DNS configured', {
        patterns: ['*.dev', '*.test'],
        target
      });

      return true;
    } catch (error) {
      this.logger.error('Failed to setup wildcard DNS', error);
      throw error;
    }
  }

  /**
   * Cleanup orphaned DNS records
   */
  async cleanupOrphanedDNS(): Promise<number> {
    try {
      const dnsRecords = await this.dnsManager.listACISubdomains();
      let cleaned = 0;

      for (const record of dnsRecords) {
        if (record.description?.startsWith('ACI:')) {
          const parts = record.description.split('|');
          const containerName = parts[0].replace('ACI:', '');
          
          // Check if container still exists
          const context = this.parseContainerName(containerName);
          const status = await this.aciManager.getContainerStatus(context);
          
          if (status === 'NotFound') {
            // Container doesn't exist, remove DNS
            await this.dnsManager.deleteSubdomain(record.subdomain);
            cleaned++;
            this.logger.info('Cleaned orphaned DNS record', {
              subdomain: record.subdomain,
              container: containerName
            });
          }
        }
      }

      return cleaned;
    } catch (error) {
      this.logger.error('Failed to cleanup orphaned DNS', error);
      throw error;
    }
  }

  /**
   * Generate subdomain for container
   */
  private generateSubdomain(context: any): string {
    const base = GoDaddyDNSManager.generateSubdomainName(
      context.userId,
      context.projectId,
      context.taskId
    );

    return this.subdomainPrefix ? `${base}.${this.subdomainPrefix}` : base;
  }

  /**
   * Parse container name back to context
   */
  private parseContainerName(containerName: string): any {
    // Container name format: jupiter-{userId}-{projectId}-{taskId}
    const parts = containerName.split('-');
    if (parts.length < 4) {
      throw new Error(`Invalid container name format: ${containerName}`);
    }

    return {
      userId: parts[1],
      projectId: parts[2],
      taskId: parts.slice(3).join('-')
    };
  }

  /**
   * Monitor container and update DNS
   */
  async startDNSMonitoring(intervalMs: number = 300000): Promise<void> {
    setInterval(async () => {
      try {
        // Check all mapped containers
        for (const [containerName, mapping] of this.mappings) {
          await this.updateContainerDNS(containerName);
        }

        // Cleanup orphaned records
        if (this.config.autoCleanup) {
          const cleaned = await this.cleanupOrphanedDNS();
          if (cleaned > 0) {
            this.logger.info(`Cleaned ${cleaned} orphaned DNS records`);
          }
        }
      } catch (error) {
        this.logger.error('DNS monitoring error', error);
      }
    }, intervalMs);

    this.logger.info('DNS monitoring started', { intervalMs });
  }
}