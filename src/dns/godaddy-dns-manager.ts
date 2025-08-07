/**
 * GoDaddy DNS Manager for Dynamic Subdomain Configuration
 * Manages DNS records for Azure Container Instances
 */

import axios, { AxiosInstance } from 'axios';
import { Logger } from '../utils/logger';

export interface GoDaddyConfig {
  apiKey: string;
  apiSecret: string;
  domain: string;
  environment?: 'production' | 'test';
}

export interface DNSRecord {
  type: 'A' | 'CNAME' | 'TXT';
  name: string;
  data: string;
  ttl?: number;
  priority?: number;
}

export interface SubdomainConfig {
  subdomain: string;
  target: string; // IP or FQDN
  ttl?: number;
  description?: string;
}

export class GoDaddyDNSManager {
  private client: AxiosInstance;
  private logger: Logger;
  private domain: string;
  private baseUrl: string;

  constructor(private config: GoDaddyConfig) {
    this.logger = new Logger('GoDaddyDNSManager');
    this.domain = config.domain;
    
    // GoDaddy API endpoint
    this.baseUrl = config.environment === 'test' 
      ? 'https://api.ote-godaddy.com/v1'  // Test environment
      : 'https://api.godaddy.com/v1';     // Production
    
    // Initialize axios client with auth headers
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Authorization': `sso-key ${config.apiKey}:${config.apiSecret}`,
        'Content-Type': 'application/json'
      }
    });

    this.logger.info('GoDaddy DNS Manager initialized', { 
      domain: this.domain,
      environment: config.environment || 'production' 
    });
  }

  /**
   * Create or update a subdomain A record
   */
  async createSubdomain(config: SubdomainConfig): Promise<boolean> {
    try {
      const record: DNSRecord = {
        type: 'A',
        name: config.subdomain,
        data: config.target,
        ttl: config.ttl || 600 // 10 minutes default
      };

      // Check if record exists
      const existing = await this.getRecord(config.subdomain, 'A');
      
      if (existing) {
        // Update existing record
        await this.updateRecord(record);
        this.logger.info(`Updated subdomain: ${config.subdomain}.${this.domain} -> ${config.target}`);
      } else {
        // Create new record
        await this.createRecord(record);
        this.logger.info(`Created subdomain: ${config.subdomain}.${this.domain} -> ${config.target}`);
      }

      // Add TXT record for metadata
      if (config.description) {
        await this.createRecord({
          type: 'TXT',
          name: `_aci.${config.subdomain}`,
          data: config.description,
          ttl: config.ttl || 600
        });
      }

      return true;
    } catch (error) {
      this.logger.error('Failed to create subdomain', error);
      throw error;
    }
  }

  /**
   * Create multiple subdomains in batch
   */
  async createSubdomains(configs: SubdomainConfig[]): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();
    
    for (const config of configs) {
      try {
        const success = await this.createSubdomain(config);
        results.set(config.subdomain, success);
      } catch (error) {
        results.set(config.subdomain, false);
        this.logger.error(`Failed to create subdomain ${config.subdomain}`, error);
      }
    }
    
    return results;
  }

  /**
   * Delete a subdomain
   */
  async deleteSubdomain(subdomain: string): Promise<boolean> {
    try {
      await this.deleteRecord(subdomain, 'A');
      
      // Also delete associated TXT record
      try {
        await this.deleteRecord(`_aci.${subdomain}`, 'TXT');
      } catch (error) {
        // TXT record might not exist
      }
      
      this.logger.info(`Deleted subdomain: ${subdomain}.${this.domain}`);
      return true;
    } catch (error) {
      this.logger.error('Failed to delete subdomain', error);
      throw error;
    }
  }

  /**
   * Get all subdomains with ACI prefix
   */
  async listACISubdomains(): Promise<SubdomainConfig[]> {
    try {
      const records = await this.listRecords('A');
      const txtRecords = await this.listRecords('TXT');
      
      // Build TXT record map for descriptions
      const txtMap = new Map<string, string>();
      txtRecords
        .filter(r => r.name.startsWith('_aci.'))
        .forEach(r => {
          const subdomain = r.name.replace('_aci.', '');
          txtMap.set(subdomain, r.data);
        });
      
      // Filter and map A records
      return records
        .filter(r => r.name !== '@') // Exclude root domain
        .map(r => ({
          subdomain: r.name,
          target: r.data,
          ttl: r.ttl,
          description: txtMap.get(r.name)
        }));
    } catch (error) {
      this.logger.error('Failed to list subdomains', error);
      throw error;
    }
  }

  /**
   * Update subdomain target (IP or FQDN)
   */
  async updateSubdomain(subdomain: string, newTarget: string): Promise<boolean> {
    try {
      await this.updateRecord({
        type: 'A',
        name: subdomain,
        data: newTarget,
        ttl: 600
      });
      
      this.logger.info(`Updated subdomain: ${subdomain}.${this.domain} -> ${newTarget}`);
      return true;
    } catch (error) {
      this.logger.error('Failed to update subdomain', error);
      throw error;
    }
  }

  /**
   * Create wildcard subdomain for dynamic routing
   */
  async createWildcardSubdomain(prefix: string, target: string): Promise<boolean> {
    try {
      const record: DNSRecord = {
        type: 'A',
        name: `*.${prefix}`,
        data: target,
        ttl: 600
      };
      
      await this.createRecord(record);
      this.logger.info(`Created wildcard subdomain: *.${prefix}.${this.domain} -> ${target}`);
      return true;
    } catch (error) {
      this.logger.error('Failed to create wildcard subdomain', error);
      throw error;
    }
  }

  /**
   * Verify domain ownership
   */
  async verifyDomain(): Promise<boolean> {
    try {
      const response = await this.client.get(`/domains/${this.domain}`);
      return response.status === 200;
    } catch (error) {
      this.logger.error('Failed to verify domain', error);
      return false;
    }
  }

  // Private helper methods

  private async createRecord(record: DNSRecord): Promise<void> {
    const endpoint = `/domains/${this.domain}/records`;
    await this.client.post(endpoint, [record]);
  }

  private async updateRecord(record: DNSRecord): Promise<void> {
    const endpoint = `/domains/${this.domain}/records/${record.type}/${record.name}`;
    await this.client.put(endpoint, [record]);
  }

  private async deleteRecord(name: string, type: string): Promise<void> {
    const endpoint = `/domains/${this.domain}/records/${type}/${name}`;
    await this.client.delete(endpoint);
  }

  private async getRecord(name: string, type: string): Promise<DNSRecord | null> {
    try {
      const endpoint = `/domains/${this.domain}/records/${type}/${name}`;
      const response = await this.client.get(endpoint);
      return response.data[0] || null;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  private async listRecords(type?: string): Promise<DNSRecord[]> {
    const endpoint = type 
      ? `/domains/${this.domain}/records/${type}`
      : `/domains/${this.domain}/records`;
    
    const response = await this.client.get(endpoint);
    return response.data;
  }

  /**
   * Generate subdomain name for container
   */
  static generateSubdomainName(
    userId: string,
    projectId: string,
    containerName?: string
  ): string {
    // Clean and format subdomain name
    const parts = [
      userId.toLowerCase().replace(/[^a-z0-9]/g, ''),
      projectId.toLowerCase().replace(/[^a-z0-9]/g, '')
    ];
    
    if (containerName) {
      parts.push(containerName.toLowerCase().replace(/[^a-z0-9]/g, ''));
    }
    
    // Ensure valid subdomain (max 63 chars, alphanumeric and hyphens)
    return parts
      .filter(p => p.length > 0)
      .join('-')
      .substring(0, 63)
      .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
  }
}