/**
 * Azure DNS Integration for Container Instances
 * Manages DNS records in Azure DNS for digisquares.in
 */

import { DnsManagementClient } from '@azure/arm-dns';
import { DefaultAzureCredential } from '@azure/identity';
import { AzureContainerManager } from '../azure/aci-manager';
import { Logger } from '../utils/logger';
import { EventEmitter } from 'events';

export interface AzureDNSConfig {
  subscriptionId: string;
  resourceGroup: string;
  zoneName: string;
  defaultTTL?: number;
}

export interface ContainerDNSRecord {
  containerName: string;
  subdomain: string;
  fqdn: string;
  ip: string;
  created: Date;
  ttl: number;
}

export class AzureDNSIntegration extends EventEmitter {
  private dnsClient: DnsManagementClient;
  private logger: Logger;
  private records: Map<string, ContainerDNSRecord> = new Map();

  constructor(
    private aciManager: AzureContainerManager,
    private config: AzureDNSConfig
  ) {
    super();
    this.logger = new Logger('AzureDNSIntegration');
    
    const credential = new DefaultAzureCredential();
    this.dnsClient = new DnsManagementClient(credential, config.subscriptionId);
    
    this.logger.info('Azure DNS Integration initialized', {
      zone: config.zoneName,
      resourceGroup: config.resourceGroup
    });
  }

  /**
   * Create container with automatic DNS configuration
   */
  async createContainerWithDNS(
    context: any,
    dockerConfig?: any,
    gitConfig?: any
  ): Promise<{
    container: any;
    dns: ContainerDNSRecord;
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

      if (!ip) {
        throw new Error('Container created but no IP assigned');
      }

      // Step 3: Generate subdomain name
      const subdomain = this.generateSubdomain(context);
      const fqdn = `${subdomain}.${this.config.zoneName}`;

      // Step 4: Create DNS record in Azure
      this.logger.info('Creating DNS record...', { subdomain, ip });
      
      await this.createDNSRecord(subdomain, ip);

      // Step 5: Create record mapping
      const dnsRecord: ContainerDNSRecord = {
        containerName,
        subdomain,
        fqdn,
        ip,
        created: new Date(),
        ttl: this.config.defaultTTL || 300
      };

      this.records.set(containerName, dnsRecord);
      this.emit('dns-created', dnsRecord);

      this.logger.info('Container created with DNS', {
        container: containerName,
        url: `http://${fqdn}`,
        ip
      });

      return { container, dns: dnsRecord };

    } catch (error) {
      this.logger.error('Failed to create container with DNS', error);
      throw error;
    }
  }

  /**
   * Create DNS A record in Azure
   */
  async createDNSRecord(subdomain: string, ip: string, ttl: number = 300): Promise<void> {
    try {
      await this.dnsClient.recordSets.createOrUpdate(
        this.config.resourceGroup,
        this.config.zoneName,
        subdomain,
        'A',
        {
          ttl,
          aRecords: [{ ipv4Address: ip }]
        }
      );
      
      this.logger.info(`DNS record created: ${subdomain}.${this.config.zoneName} → ${ip}`);
    } catch (error) {
      this.logger.error('Failed to create DNS record', error);
      throw error;
    }
  }

  /**
   * Update DNS record for existing container
   */
  async updateContainerDNS(containerName: string, newIP: string): Promise<boolean> {
    try {
      const record = this.records.get(containerName);
      if (!record) {
        throw new Error(`No DNS record found for container: ${containerName}`);
      }

      await this.createDNSRecord(record.subdomain, newIP, record.ttl);
      
      record.ip = newIP;
      this.emit('dns-updated', record);
      
      this.logger.info('Updated DNS record', {
        subdomain: record.subdomain,
        newIP
      });

      return true;
    } catch (error) {
      this.logger.error('Failed to update DNS record', error);
      throw error;
    }
  }

  /**
   * Delete DNS record when container is removed
   */
  async deleteContainerDNS(containerName: string): Promise<boolean> {
    try {
      const record = this.records.get(containerName);
      if (!record) {
        this.logger.warn('No DNS record found for container', { containerName });
        return false;
      }

      await this.dnsClient.recordSets.delete(
        this.config.resourceGroup,
        this.config.zoneName,
        record.subdomain,
        'A'
      );

      this.records.delete(containerName);
      this.emit('dns-deleted', record);

      this.logger.info('Deleted DNS record', {
        subdomain: record.subdomain
      });

      return true;
    } catch (error) {
      this.logger.error('Failed to delete DNS record', error);
      throw error;
    }
  }

  /**
   * List all DNS records for containers
   */
  async listContainerDNS(): Promise<ContainerDNSRecord[]> {
    try {
      const records = [];
      
      for await (const recordSet of this.dnsClient.recordSets.listByDnsZone(
        this.config.resourceGroup,
        this.config.zoneName
      )) {
        if (recordSet.type === 'Microsoft.Network/dnszones/A' && recordSet.aRecords) {
          const record: ContainerDNSRecord = {
            containerName: `container-${recordSet.name}`,
            subdomain: recordSet.name!,
            fqdn: recordSet.fqdn!,
            ip: recordSet.aRecords[0].ipv4Address!,
            created: new Date(),
            ttl: recordSet.ttl || 300
          };
          records.push(record);
        }
      }

      return records;
    } catch (error) {
      this.logger.error('Failed to list DNS records', error);
      throw error;
    }
  }

  /**
   * Check DNS propagation status
   */
  async checkDNSPropagation(subdomain: string): Promise<{
    propagated: boolean;
    resolvedIP?: string;
  }> {
    const fqdn = `${subdomain}.${this.config.zoneName}`;
    
    try {
      const { Resolver } = require('dns').promises;
      const resolver = new Resolver();
      resolver.setServers(['8.8.8.8', '1.1.1.1']); // Use public DNS
      
      const addresses = await resolver.resolve4(fqdn);
      
      return {
        propagated: addresses.length > 0,
        resolvedIP: addresses[0]
      };
    } catch (error) {
      return { propagated: false };
    }
  }

  /**
   * Generate subdomain for container
   */
  private generateSubdomain(context: any): string {
    const parts = [
      context.userId?.toLowerCase(),
      context.projectId?.toLowerCase()
    ].filter(Boolean);

    return parts
      .join('-')
      .replace(/[^a-z0-9-]/g, '')
      .substring(0, 63);
  }

  /**
   * Setup wildcard domain for development
   */
  async setupWildcardDomain(prefix: string, targetIP: string): Promise<void> {
    try {
      const wildcardName = `*.${prefix}`;
      
      await this.dnsClient.recordSets.createOrUpdate(
        this.config.resourceGroup,
        this.config.zoneName,
        wildcardName,
        'A',
        {
          ttl: 300,
          aRecords: [{ ipv4Address: targetIP }]
        }
      );

      this.logger.info(`Wildcard domain created: ${wildcardName}.${this.config.zoneName} → ${targetIP}`);
    } catch (error) {
      this.logger.error('Failed to create wildcard domain', error);
      throw error;
    }
  }

  /**
   * Get DNS zone information
   */
  async getDNSZoneInfo(): Promise<{
    nameservers: string[];
    recordCount: number;
  }> {
    try {
      const zone = await this.dnsClient.zones.get(
        this.config.resourceGroup,
        this.config.zoneName
      );

      let recordCount = 0;
      for await (const _ of this.dnsClient.recordSets.listByDnsZone(
        this.config.resourceGroup,
        this.config.zoneName
      )) {
        recordCount++;
      }

      return {
        nameservers: zone.nameServers || [],
        recordCount
      };
    } catch (error) {
      this.logger.error('Failed to get DNS zone info', error);
      throw error;
    }
  }
}