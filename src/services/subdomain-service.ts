/**
 * Subdomain Service
 * Interface for AI-powered subdomain generation via Azure API
 * 
 * This service leverages the Azure API's Cosmos AI integration for intelligent
 * subdomain generation. The Azure API handles:
 * - AI-powered subdomain suggestions using Cosmos AI
 * - Fallback to algorithmic generation when AI is unavailable
 * - Domain validation and availability checking
 * - Service-specific subdomain optimization (ACI, App Service, SWA)
 * - Automatic SSL configuration with digisquares.in
 */

import { Logger } from '../utils/logger';
import { AzureAPIClient, SubdomainGenerateRequest, SubdomainServiceRequest, SubdomainBulkRequest } from '../clients/azure-api-client';
import { azureAPIConfig } from '../config/azure-api-config';

export interface SubdomainOptions {
  projectName: string;
  description?: string;
  preferredName?: string;
  category?: string;
  includeRandom?: boolean;
  maxLength?: number;
}

export interface ServiceSubdomainOptions {
  serviceName: string;
  serviceType: 'aci' | 'appservice' | 'swa';
  projectName?: string;
  description?: string;
}

export interface BulkSubdomainOptions {
  services: Array<{
    name: string;
    type: 'aci' | 'appservice' | 'swa';
    description?: string;
  }>;
}

export interface SubdomainResult {
  subdomain: string;
  fullDomain: string;
  alternates?: string[];
  aiGenerated: boolean;
  baseDomain: string;
  ssl: boolean;
}

export interface BulkSubdomainResult {
  [serviceName: string]: SubdomainResult;
}

export class SubdomainService {
  private logger: Logger;
  private azureClient: AzureAPIClient;
  private cache: Map<string, SubdomainResult>;
  private readonly MAX_CACHE_SIZE = 100;
  private readonly CACHE_TTL = 3600000; // 1 hour
  private cacheTimestamps: Map<string, number>;

  constructor() {
    this.logger = Logger.getInstance();
    
    // Validate Azure API configuration
    if (!azureAPIConfig.baseUrl || !azureAPIConfig.apiKey) {
      this.logger.error('Azure API configuration is missing');
      throw new Error('Azure API configuration is required for SubdomainService');
    }
    
    try {
      this.azureClient = new AzureAPIClient(azureAPIConfig);
    } catch (error) {
      this.logger.error('Failed to initialize Azure API client', error);
      throw error;
    }
    
    this.cache = new Map();
    this.cacheTimestamps = new Map();
  }

  /**
   * Generate AI-powered subdomain for a project
   * 
   * The Azure API's subdomain generation process:
   * 1. If preferredName is provided and valid, it uses that
   * 2. Attempts to generate using Cosmos AI with project context
   * 3. Falls back to algorithmic generation if AI is unavailable
   * 4. Returns subdomain with digisquares.in as base domain
   */
  async generateForProject(options: SubdomainOptions): Promise<SubdomainResult> {
    // Validate required options
    if (!options.projectName) {
      throw new Error('Project name is required for subdomain generation');
    }
    
    // Sanitize project name
    options.projectName = options.projectName.trim();
    if (options.projectName.length === 0) {
      throw new Error('Project name cannot be empty');
    }
    
    this.logger.info('Generating AI-powered subdomain via Azure API', { options });

    // Check cache first to avoid unnecessary API calls
    const cacheKey = this.getCacheKey(options);
    const cachedResult = this.getCachedResult(cacheKey);
    if (cachedResult) {
      this.logger.debug('Returning cached subdomain', { cacheKey });
      return cachedResult;
    }

    try {
      // Prepare request for Azure API's subdomain generator
      // The API will use Cosmos AI to generate intelligent subdomains
      const request: SubdomainGenerateRequest = {
        projectName: options.projectName,
        description: options.description,
        preferredName: options.preferredName,
        category: options.category,
        includeRandom: options.includeRandom,
        maxLength: options.maxLength || 20
      };

      // Call Azure API which handles:
      // - Cosmos AI integration for intelligent generation
      // - Validation and sanitization
      // - Availability checking
      // - Fallback to algorithmic generation
      const response = await this.azureClient.generateSubdomain(request);
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to generate subdomain');
      }

      const result: SubdomainResult = {
        subdomain: response.data.subdomain,
        fullDomain: response.data.fullDomain,
        alternates: response.data.alternates,
        aiGenerated: response.data.aiGenerated, // True if Cosmos AI was used
        baseDomain: response.data.baseDomain,   // Always digisquares.in
        ssl: response.data.ssl                  // Always true with Let's Encrypt
      };

      // Cache the result for performance
      this.setCachedResult(cacheKey, result);

      this.logger.info('AI subdomain generated successfully', { 
        result,
        aiGenerated: result.aiGenerated 
      });
      return result;

    } catch (error) {
      this.logger.error('Failed to generate subdomain via Azure API', error);
      
      // Local fallback in case Azure API is unavailable
      // This ensures the app maker can continue functioning
      return this.generateFallbackSubdomain(options);
    }
  }

  /**
   * Generate subdomain optimized for specific Azure service
   * 
   * Service-specific optimization by Azure API:
   * - ACI: Uses 'api' category for API services
   * - App Service: Uses 'app' category for applications
   * - SWA: Uses 'web' category for static websites
   * 
   * The Azure API ensures subdomains are appropriate for each service type
   */
  async generateForService(options: ServiceSubdomainOptions): Promise<SubdomainResult> {
    this.logger.info('Generating service-optimized subdomain via Azure API', { options });

    try {
      // Request subdomain optimized for the specific Azure service
      const request: SubdomainServiceRequest = {
        serviceName: options.serviceName,
        serviceType: options.serviceType,
        projectName: options.projectName,
        description: options.description
      };

      // Azure API applies service-specific logic:
      // - Maps service types to appropriate categories
      // - Uses Cosmos AI with service context
      // - Generates alternates if main subdomain is taken
      const response = await this.azureClient.generateSubdomainForService(request);
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to generate service subdomain');
      }

      const result: SubdomainResult = {
        subdomain: response.data.subdomain,
        fullDomain: response.data.fullDomain,
        alternates: response.data.alternates,
        aiGenerated: response.data.aiGenerated,
        baseDomain: response.data.baseDomain,
        ssl: response.data.ssl
      };

      this.logger.info('Service-optimized subdomain generated', { 
        result,
        serviceType: options.serviceType 
      });
      return result;

    } catch (error) {
      this.logger.error('Failed to generate service subdomain via Azure API', error);
      
      // Local fallback for service subdomain
      return this.generateFallbackServiceSubdomain(options);
    }
  }

  /**
   * Generate subdomains for multiple services in bulk
   * 
   * Efficient bulk generation via Azure API:
   * - Single API call for multiple services
   * - Cosmos AI generates unique subdomains for each service
   * - Ensures no subdomain conflicts between services
   * - Returns map of service names to subdomain results
   */
  async generateBulk(options: BulkSubdomainOptions): Promise<BulkSubdomainResult> {
    this.logger.info('Generating bulk subdomains via Azure API', { 
      serviceCount: options.services.length 
    });

    try {
      // Prepare bulk request for Azure API
      const request: SubdomainBulkRequest = {
        services: options.services
      };

      // Azure API handles bulk generation efficiently:
      // - Uses Cosmos AI to generate unique subdomains
      // - Ensures no conflicts between service subdomains
      // - Applies service-specific optimization for each
      const response = await this.azureClient.generateBulkSubdomains(request);
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to generate bulk subdomains');
      }

      // Transform response to typed result
      const result: BulkSubdomainResult = {};
      
      for (const [serviceName, serviceData] of Object.entries(response.data)) {
        result[serviceName] = {
          subdomain: (serviceData as any).subdomain,
          fullDomain: (serviceData as any).fullDomain,
          alternates: (serviceData as any).alternates,
          aiGenerated: (serviceData as any).aiGenerated,
          baseDomain: (serviceData as any).baseDomain,
          ssl: (serviceData as any).ssl
        };
      }

      this.logger.info('Bulk subdomains generated successfully', { 
        count: Object.keys(result).length,
        aiGenerated: Object.values(result).filter(r => r.aiGenerated).length
      });
      return result;

    } catch (error) {
      this.logger.error('Failed to generate bulk subdomains via Azure API', error);
      
      // Fallback: Generate individually if bulk fails
      const result: BulkSubdomainResult = {};
      for (const service of options.services) {
        result[service.name] = await this.generateFallbackServiceSubdomain({
          serviceName: service.name,
          serviceType: service.type,
          description: service.description
        });
      }
      return result;
    }
  }

  /**
   * Check if a subdomain is available
   */
  async checkAvailability(subdomain: string): Promise<boolean> {
    if (!subdomain || subdomain.trim().length === 0) {
      this.logger.warn('Invalid subdomain provided for availability check');
      return false;
    }
    
    this.logger.info('Checking subdomain availability', { subdomain });

    try {
      const response = await this.azureClient.checkSubdomainAvailability(subdomain.trim());
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to check availability');
      }

      return response.data?.available === true;

    } catch (error) {
      this.logger.error('Failed to check subdomain availability', error);
      // Conservative approach: assume unavailable on error
      return false;
    }
  }

  /**
   * Reserve a subdomain for a project
   */
  async reserve(subdomain: string, projectId: string): Promise<void> {
    if (!subdomain || subdomain.trim().length === 0) {
      throw new Error('Subdomain is required for reservation');
    }
    if (!projectId || projectId.trim().length === 0) {
      throw new Error('Project ID is required for reservation');
    }
    
    this.logger.info('Reserving subdomain', { subdomain, projectId });

    try {
      const response = await this.azureClient.reserveSubdomain(
        subdomain.trim(), 
        projectId.trim()
      );
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to reserve subdomain');
      }

      this.logger.info('Subdomain reserved successfully', { subdomain, projectId });

    } catch (error) {
      this.logger.error('Failed to reserve subdomain', error);
      throw error;
    }
  }

  /**
   * Release a reserved subdomain
   */
  async release(subdomain: string): Promise<void> {
    this.logger.info('Releasing subdomain', { subdomain });

    try {
      const response = await this.azureClient.releaseSubdomain(subdomain);
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to release subdomain');
      }

      // Clear from cache
      for (const [key, value] of this.cache.entries()) {
        if (value.subdomain === subdomain) {
          this.cache.delete(key);
        }
      }

      this.logger.info('Subdomain released successfully', { subdomain });

    } catch (error) {
      this.logger.error('Failed to release subdomain', error);
      throw error;
    }
  }

  /**
   * Clear the subdomain cache
   */
  clearCache(): void {
    this.cache.clear();
    this.cacheTimestamps.clear();
    this.logger.info('Subdomain cache cleared');
  }
  
  /**
   * Clear expired cache entries
   */
  private cleanupCache(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];
    
    for (const [key, timestamp] of this.cacheTimestamps.entries()) {
      if (now - timestamp > this.CACHE_TTL) {
        expiredKeys.push(key);
      }
    }
    
    for (const key of expiredKeys) {
      this.cache.delete(key);
      this.cacheTimestamps.delete(key);
    }
    
    if (expiredKeys.length > 0) {
      this.logger.debug('Cleaned up expired cache entries', { count: expiredKeys.length });
    }
  }
  
  private getCachedResult(key: string): SubdomainResult | null {
    const timestamp = this.cacheTimestamps.get(key);
    if (!timestamp) return null;
    
    // Check if cache entry is expired
    if (Date.now() - timestamp > this.CACHE_TTL) {
      this.cache.delete(key);
      this.cacheTimestamps.delete(key);
      return null;
    }
    
    return this.cache.get(key) || null;
  }
  
  private setCachedResult(key: string, result: SubdomainResult): void {
    // Enforce cache size limit
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      // Remove oldest entry
      const oldestKey = this.cacheTimestamps.entries().next().value?.[0];
      if (oldestKey) {
        this.cache.delete(oldestKey);
        this.cacheTimestamps.delete(oldestKey);
      }
    }
    
    this.cache.set(key, result);
    this.cacheTimestamps.set(key, Date.now());
  }

  // Private helper methods

  private getCacheKey(options: SubdomainOptions): string {
    // Create a consistent cache key
    const parts = [
      options.projectName.toLowerCase(),
      options.category || 'default',
      options.preferredName || 'auto',
      options.includeRandom ? 'rand' : 'norand'
    ];
    return parts.join('-');
  }

  /**
   * Local fallback subdomain generation
   * Used when Azure API is unavailable to ensure app maker continues functioning
   * Mimics the Azure API's algorithmic generation logic
   */
  private generateFallbackSubdomain(options: SubdomainOptions): SubdomainResult {
    const timestamp = Date.now().toString(36);
    const projectSlug = this.slugify(options.projectName);
    const category = options.category || 'app';
    
    let subdomain = options.preferredName || projectSlug;
    
    // Add randomness if requested or to ensure uniqueness
    if (options.includeRandom !== false) {
      subdomain = `${subdomain}-${timestamp}`;
    }

    // Ensure max length constraint
    if (options.maxLength && subdomain.length > options.maxLength) {
      subdomain = subdomain.substring(0, options.maxLength);
    }

    const result: SubdomainResult = {
      subdomain,
      fullDomain: `${subdomain}.digisquares.in`,
      alternates: [
        `${subdomain}1.digisquares.in`,
        `${category}-${subdomain}.digisquares.in`,
        `${subdomain}-${timestamp}.digisquares.in`
      ],
      aiGenerated: false, // False since this is algorithmic fallback
      baseDomain: 'digisquares.in',
      ssl: true // SSL is always enabled with Let's Encrypt
    };

    this.logger.info('Generated fallback subdomain (Azure API unavailable)', { result });
    return result;
  }

  /**
   * Local fallback for service-specific subdomain generation
   * Mimics Azure API's service type categorization:
   * - ACI gets 'api-' prefix
   * - App Service gets 'app-' prefix
   * - Static Web Apps get 'web-' prefix
   */
  private generateFallbackServiceSubdomain(options: ServiceSubdomainOptions): SubdomainResult {
    const timestamp = Date.now().toString(36);
    const serviceSlug = this.slugify(options.serviceName);
    
    // Apply service-specific prefixes matching Azure API logic
    let prefix = '';
    switch (options.serviceType) {
      case 'aci':
        prefix = 'api-'; // Container instances typically host APIs
        break;
      case 'appservice':
        prefix = 'app-'; // App services host applications
        break;
      case 'swa':
        prefix = 'web-'; // Static web apps are frontend websites
        break;
    }

    const subdomain = `${prefix}${serviceSlug}-${timestamp}`;

    const result: SubdomainResult = {
      subdomain,
      fullDomain: `${subdomain}.digisquares.in`,
      alternates: [
        `${subdomain}1.digisquares.in`,
        `${serviceSlug}-${options.serviceType}.digisquares.in`
      ],
      aiGenerated: false, // False since this is fallback
      baseDomain: 'digisquares.in',
      ssl: true
    };

    this.logger.info('Generated fallback service subdomain', { 
      result,
      serviceType: options.serviceType 
    });
    return result;
  }

  private slugify(text: string): string {
    if (!text) return '';
    
    return text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 20) || 'app'; // Fallback if empty
  }
}