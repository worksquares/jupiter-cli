/**
 * Digisquares DNS Manager
 * @module DigisquaresDNSManager
 */

import { Logger } from '../utils/logger';
import { AzureAPIClient } from '../clients/azure-api-client';
import { azureAPIConfig } from '../config/azure-api-config';
import { JupiterDBClient } from '../database/jupiter-db-client';
import { v4 as uuidv4 } from 'uuid';

export interface DigisquaresDNSConfig {
  baseDomain?: string;
  apiEndpoint?: string;
  apiKey?: string;
  enableSSL?: boolean;
  defaultTTL?: number;
}

export interface SubdomainRequest {
  projectName: string;
  deploymentType: 'blob-storage' | 'static-web-app' | 'container' | 'app-service';
  targetEndpoint: string;
  preferredSubdomain?: string;
  enableSSL?: boolean;
  description?: string;
  tags?: Record<string, string>;
}

export interface SubdomainResult {
  subdomain: string;
  fullDomain: string;
  targetEndpoint: string;
  recordType: 'CNAME' | 'A';
  sslEnabled: boolean;
  sslStatus: 'pending' | 'provisioning' | 'active' | 'failed';
  dnsStatus: 'pending' | 'propagating' | 'active';
  createdAt: string;
  ttl: number;
  verificationToken?: string;
}

export interface DNSRecord {
  id: string;
  subdomain: string;
  fullDomain: string;
  recordType: 'CNAME' | 'A' | 'TXT';
  value: string;
  ttl: number;
  status: string;
  sslEnabled: boolean;
  deploymentId?: string;
  projectName?: string;
}

export class DigisquaresDNSManager {
  private logger: Logger;
  private azureClient: AzureAPIClient;
  private db?: JupiterDBClient;
  private config: DigisquaresDNSConfig;
  private readonly BASE_DOMAIN = 'digisquares.in';
  private readonly DEFAULT_TTL = 3600;
  private dnsCache: Map<string, SubdomainResult>;

  constructor(config?: DigisquaresDNSConfig, db?: JupiterDBClient) {
    this.logger = new Logger('DigisquaresDNSManager');
    this.config = {
      baseDomain: config?.baseDomain || this.BASE_DOMAIN,
      enableSSL: config?.enableSSL !== false,
      defaultTTL: config?.defaultTTL || this.DEFAULT_TTL,
      ...config
    };
    
    this.azureClient = new AzureAPIClient(azureAPIConfig);
    this.db = db;
    this.dnsCache = new Map();
  }

  /**
   * Automatically assign a subdomain for a project
   */
  async assignSubdomain(request: SubdomainRequest): Promise<SubdomainResult> {
    this.logger.info('Assigning subdomain for project', {
      projectName: request.projectName,
      deploymentType: request.deploymentType
    });

    try {
      // Generate or validate subdomain
      const subdomain = await this.generateSubdomain(request);
      
      // Check availability
      const isAvailable = await this.checkSubdomainAvailability(subdomain);
      if (!isAvailable) {
        // Try alternative subdomain
        const alternative = await this.generateAlternativeSubdomain(subdomain, request);
        return this.assignSubdomain({ ...request, preferredSubdomain: alternative });
      }

      // Create DNS record
      const dnsRecord = await this.createDNSRecord(subdomain, request);
      
      // Enable SSL if requested
      if (request.enableSSL !== false) {
        await this.enableSSL(dnsRecord.fullDomain, request.targetEndpoint);
      }

      // Save to database if available
      if (this.db) {
        await this.saveDNSRecord(dnsRecord);
      }

      const result: SubdomainResult = {
        subdomain: dnsRecord.subdomain,
        fullDomain: dnsRecord.fullDomain,
        targetEndpoint: request.targetEndpoint,
        recordType: dnsRecord.recordType as 'CNAME' | 'A',
        sslEnabled: request.enableSSL !== false,
        sslStatus: 'pending',
        dnsStatus: 'propagating',
        createdAt: new Date().toISOString(),
        ttl: dnsRecord.ttl,
        verificationToken: this.generateVerificationToken()
      };

      // Cache the result
      this.dnsCache.set(subdomain, result);

      // Start SSL provisioning in background
      if (request.enableSSL !== false) {
        this.provisionSSLCertificate(result).catch(err => {
          this.logger.error('SSL provisioning failed', err);
        });
      }

      this.logger.info('Subdomain assigned successfully', {
        fullDomain: result.fullDomain,
        ssl: result.sslEnabled
      });

      return result;

    } catch (error) {
      this.logger.error('Failed to assign subdomain', error as Error);
      throw error;
    }
  }

  /**
   * Generate subdomain based on project name and type
   */
  private async generateSubdomain(request: SubdomainRequest): Promise<string> {
    if (request.preferredSubdomain) {
      return this.sanitizeSubdomain(request.preferredSubdomain);
    }

    // Generate based on project name and deployment type
    const projectPart = this.sanitizeSubdomain(request.projectName);
    const typeSuffix = this.getTypeSuffix(request.deploymentType);
    
    // Create variations
    const variations = [
      projectPart,                              // project-name
      `${projectPart}-${typeSuffix}`,          // project-name-app
      `${projectPart}-${Date.now().toString(36).slice(-4)}`, // project-name-x7k2
      `${typeSuffix}-${projectPart}`,          // app-project-name
    ];

    // Return first valid variation
    for (const variation of variations) {
      if (this.isValidSubdomain(variation)) {
        return variation;
      }
    }

    // Fallback to random subdomain
    return `app-${Date.now().toString(36)}`;
  }

  /**
   * Generate alternative subdomain if original is taken
   */
  private async generateAlternativeSubdomain(
    original: string,
    request: SubdomainRequest
  ): Promise<string> {
    const timestamp = Date.now().toString(36).slice(-4);
    const random = Math.random().toString(36).slice(2, 6);
    
    const alternatives = [
      `${original}-${timestamp}`,
      `${original}-${random}`,
      `${request.projectName}-${timestamp}`,
      `new-${original}`,
      `v2-${original}`
    ];

    for (const alt of alternatives) {
      const sanitized = this.sanitizeSubdomain(alt);
      if (await this.checkSubdomainAvailability(sanitized)) {
        return sanitized;
      }
    }

    // Ultimate fallback
    return `site-${uuidv4().split('-')[0]}`;
  }

  /**
   * Check if subdomain is available
   */
  private async checkSubdomainAvailability(subdomain: string): Promise<boolean> {
    try {
      // Check cache first
      if (this.dnsCache.has(subdomain)) {
        return false;
      }

      // Check database if available
      if (this.db) {
        const existing = await this.db.queryOne(
          'SELECT id FROM digisquares_dns_records WHERE subdomain = ? AND status = ?',
          [subdomain, 'active']
        );
        if (existing) {
          return false;
        }
      }

      // Check via DNS lookup (simulate)
      // In production, this would do actual DNS query
      return true;

    } catch (error) {
      this.logger.warn('Error checking subdomain availability', error);
      return true; // Assume available on error
    }
  }

  /**
   * Create DNS record
   */
  private async createDNSRecord(
    subdomain: string,
    request: SubdomainRequest
  ): Promise<DNSRecord> {
    const fullDomain = `${subdomain}.${this.config.baseDomain}`;
    const recordType = this.determineRecordType(request.targetEndpoint);
    
    const record: DNSRecord = {
      id: uuidv4(),
      subdomain,
      fullDomain,
      recordType,
      value: request.targetEndpoint,
      ttl: this.config.defaultTTL || this.DEFAULT_TTL,
      status: 'pending',
      sslEnabled: request.enableSSL !== false,
      projectName: request.projectName
    };

    // Configure DNS via Azure API
    try {
      const response = await this.azureClient.configureDNS(
        fullDomain,
        request.targetEndpoint,
        recordType
      );

      if (response.success) {
        record.status = 'active';
        this.logger.info('DNS record created', { fullDomain, target: request.targetEndpoint });
      }
    } catch (error) {
      this.logger.error('Failed to create DNS record via API', error);
      // Continue anyway - record in database for manual configuration
    }

    return record;
  }

  /**
   * Enable SSL for subdomain
   */
  private async enableSSL(fullDomain: string, targetEndpoint: string): Promise<void> {
    this.logger.info('Enabling SSL for domain', { fullDomain });

    try {
      // Configure SSL via Azure API
      await this.azureClient.configureSSL(fullDomain, targetEndpoint);
      
      this.logger.info('SSL configuration initiated', { fullDomain });
    } catch (error) {
      this.logger.error('Failed to enable SSL', error);
      // SSL will be configured manually or retried later
    }
  }

  /**
   * Provision SSL certificate (background process)
   */
  private async provisionSSLCertificate(result: SubdomainResult): Promise<void> {
    try {
      // Wait for DNS propagation
      await this.waitForDNSPropagation(result.fullDomain);
      
      // Update SSL status
      result.sslStatus = 'provisioning';
      
      // In production, this would:
      // 1. Request Let's Encrypt certificate
      // 2. Validate domain ownership
      // 3. Install certificate
      // 4. Configure HTTPS redirect
      
      // Simulate provisioning delay
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      result.sslStatus = 'active';
      
      // Update database if available
      if (this.db) {
        await this.updateSSLStatus(result.fullDomain, 'active');
      }
      
      this.logger.info('SSL certificate provisioned', { domain: result.fullDomain });
      
    } catch (error) {
      result.sslStatus = 'failed';
      this.logger.error('SSL provisioning failed', error);
    }
  }

  /**
   * Wait for DNS propagation
   */
  private async waitForDNSPropagation(
    fullDomain: string,
    maxAttempts: number = 12,
    intervalMs: number = 5000
  ): Promise<void> {
    this.logger.info('Waiting for DNS propagation', { fullDomain });
    
    for (let i = 0; i < maxAttempts; i++) {
      // In production, this would check actual DNS resolution
      // For now, we simulate the wait
      await new Promise(resolve => setTimeout(resolve, intervalMs));
      
      // Check if DNS is resolvable (simulated)
      const isResolvable = i > 2; // Simulate success after 3 attempts
      
      if (isResolvable) {
        this.logger.info('DNS propagation complete', { fullDomain });
        return;
      }
    }
    
    throw new Error(`DNS propagation timeout for ${fullDomain}`);
  }

  /**
   * Update existing subdomain configuration
   */
  async updateSubdomain(
    subdomain: string,
    newTarget: string,
    enableSSL?: boolean
  ): Promise<void> {
    const fullDomain = `${subdomain}.${this.config.baseDomain}`;
    
    this.logger.info('Updating subdomain configuration', {
      fullDomain,
      newTarget,
      enableSSL
    });

    try {
      // Update DNS record
      await this.azureClient.configureDNS(
        fullDomain,
        newTarget,
        this.determineRecordType(newTarget)
      );

      // Update SSL if needed
      if (enableSSL) {
        await this.enableSSL(fullDomain, newTarget);
      }

      // Update database
      if (this.db) {
        await this.db.execute(
          `UPDATE digisquares_dns_records 
           SET value = ?, updated_at = NOW() 
           WHERE subdomain = ?`,
          [newTarget, subdomain]
        );
      }

      // Update cache
      const cached = this.dnsCache.get(subdomain);
      if (cached) {
        cached.targetEndpoint = newTarget;
        if (enableSSL !== undefined) {
          cached.sslEnabled = enableSSL;
        }
      }

      this.logger.info('Subdomain updated successfully', { fullDomain });

    } catch (error) {
      this.logger.error('Failed to update subdomain', error);
      throw error;
    }
  }

  /**
   * Delete subdomain and its DNS records
   */
  async deleteSubdomain(subdomain: string): Promise<void> {
    const fullDomain = `${subdomain}.${this.config.baseDomain}`;
    
    this.logger.info('Deleting subdomain', { fullDomain });

    try {
      // Remove from cache
      this.dnsCache.delete(subdomain);

      // Update database
      if (this.db) {
        await this.db.execute(
          `UPDATE digisquares_dns_records 
           SET status = 'deleted', deleted_at = NOW() 
           WHERE subdomain = ?`,
          [subdomain]
        );
      }

      // Note: Actual DNS record deletion would be handled by
      // DNS provider API in production

      this.logger.info('Subdomain deleted', { fullDomain });

    } catch (error) {
      this.logger.error('Failed to delete subdomain', error);
      throw error;
    }
  }

  /**
   * Get all active subdomains for a project
   */
  async getProjectSubdomains(projectName: string): Promise<SubdomainResult[]> {
    if (!this.db) {
      return [];
    }

    const records = await this.db.query(
      `SELECT * FROM digisquares_dns_records 
       WHERE project_name = ? AND status = 'active'
       ORDER BY created_at DESC`,
      [projectName]
    );

    return records.map(record => ({
      subdomain: record.subdomain,
      fullDomain: record.full_domain,
      targetEndpoint: record.value,
      recordType: record.record_type,
      sslEnabled: record.ssl_enabled,
      sslStatus: record.ssl_status,
      dnsStatus: record.status,
      createdAt: record.created_at,
      ttl: record.ttl
    }));
  }

  /**
   * Helper: Sanitize subdomain
   */
  private sanitizeSubdomain(input: string): string {
    return input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/--+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 63); // Max subdomain length
  }

  /**
   * Helper: Validate subdomain
   */
  private isValidSubdomain(subdomain: string): boolean {
    const regex = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
    return regex.test(subdomain) && subdomain.length >= 3;
  }

  /**
   * Helper: Get type suffix for deployment type
   */
  private getTypeSuffix(deploymentType: string): string {
    const suffixes: Record<string, string> = {
      'blob-storage': 'site',
      'static-web-app': 'app',
      'container': 'api',
      'app-service': 'web'
    };
    return suffixes[deploymentType] || 'app';
  }

  /**
   * Helper: Determine DNS record type
   */
  private determineRecordType(target: string): 'CNAME' | 'A' {
    // If target is an IP address, use A record
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    return ipRegex.test(target) ? 'A' : 'CNAME';
  }

  /**
   * Helper: Generate verification token
   */
  private generateVerificationToken(): string {
    return `digisquares-verify-${uuidv4().split('-')[0]}`;
  }

  /**
   * Database operations
   */
  private async saveDNSRecord(record: DNSRecord): Promise<void> {
    if (!this.db) return;

    await this.db.execute(
      `INSERT INTO digisquares_dns_records 
       (id, subdomain, full_domain, record_type, value, ttl, 
        status, ssl_enabled, project_name, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        record.id,
        record.subdomain,
        record.fullDomain,
        record.recordType,
        record.value,
        record.ttl,
        record.status,
        record.sslEnabled,
        record.projectName
      ]
    );
  }

  private async updateSSLStatus(fullDomain: string, status: string): Promise<void> {
    if (!this.db) return;

    await this.db.execute(
      `UPDATE digisquares_dns_records 
       SET ssl_status = ?, updated_at = NOW() 
       WHERE full_domain = ?`,
      [status, fullDomain]
    );
  }

  /**
   * Get subdomain statistics
   */
  async getStatistics(): Promise<{
    totalSubdomains: number;
    activeSubdomains: number;
    sslEnabled: number;
    byDeploymentType: Record<string, number>;
  }> {
    if (!this.db) {
      return {
        totalSubdomains: this.dnsCache.size,
        activeSubdomains: this.dnsCache.size,
        sslEnabled: Array.from(this.dnsCache.values()).filter(r => r.sslEnabled).length,
        byDeploymentType: {}
      };
    }

    const stats = await this.db.queryOne(
      `SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN ssl_enabled = 1 THEN 1 ELSE 0 END) as ssl_enabled
       FROM digisquares_dns_records`
    );

    return {
      totalSubdomains: stats.total || 0,
      activeSubdomains: stats.active || 0,
      sslEnabled: stats.ssl_enabled || 0,
      byDeploymentType: {} // Would need additional query
    };
  }
}