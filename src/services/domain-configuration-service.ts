/**
 * Domain Configuration Service
 * Generates memorable domain names using AI and manages domain allocation
 */

import { UnifiedDomainManager } from '../dns/unified-domain-manager';
import { DatabaseService } from './database-service';
import { CosmosProvider } from '../providers/cosmos-provider';
import { Logger } from '../utils/logger';
import { EventEmitter } from 'events';
import crypto from 'crypto';

export interface DomainGenerationRequest {
  projectId: string;
  projectName: string;
  projectDescription?: string;
  projectType?: 'webapp' | 'api' | 'service' | 'app';
  targetAudience?: string;
  keywords?: string[];
  preferredStyle?: 'professional' | 'creative' | 'technical' | 'playful';
}

export interface DomainConfiguration {
  id: string;
  projectId: string;
  domain: string;
  subdomain: string;
  fqdn: string;
  type: 'generated' | 'custom';
  environment: 'production' | 'staging' | 'development' | 'preview';
  service: 'aci' | 'staticwebapp';
  aiGenerated: boolean;
  aiPrompt?: string;
  aiReasoning?: string;
  customDomain?: {
    domain: string;
    verified: boolean;
    sslConfigured: boolean;
  };
  status: 'pending' | 'active' | 'inactive' | 'reserved';
  created: Date;
  updated: Date;
}

export interface AIGeneratedDomain {
  subdomain: string;
  reasoning: string;
  alternatives: string[];
  score: number;
}

export class DomainConfigurationService extends EventEmitter {
  private logger: Logger;
  private domainManager: UnifiedDomainManager;
  private database: DatabaseService;
  private aiProvider: CosmosProvider;
  private defaultZone: string;
  private reservedDomains: Set<string> = new Set();

  constructor(
    private config: {
      defaultZone?: string;
      databaseConfig: any;
      aiConfig: any;
      domainManagerConfig: any;
    }
  ) {
    super();
    this.logger = new Logger('DomainConfigurationService');
    this.defaultZone = config.defaultZone || 'digisquares.in';
    
    // Initialize services
    this.database = new DatabaseService(config.databaseConfig);
    this.aiProvider = new CosmosProvider();
    this.aiProvider.initialize(config.aiConfig);
    this.domainManager = new UnifiedDomainManager(config.domainManagerConfig);
    
    this.logger.info('Domain Configuration Service initialized', {
      defaultZone: this.defaultZone
    });
    
    // Load reserved domains
    this.loadReservedDomains();
  }

  /**
   * Generate memorable domain name using AI
   */
  async generateDomainWithAI(request: DomainGenerationRequest): Promise<AIGeneratedDomain> {
    try {
      this.logger.info('Generating domain with AI', { projectName: request.projectName });

      // Create a detailed prompt for domain generation
      const prompt = this.buildDomainGenerationPrompt(request);
      
      // Call CosmosAPI to generate domain suggestions
      const response = await this.aiProvider.generateCompletion([
        {
          role: 'system',
          content: 'You are a creative domain name generator. Generate memorable, unique, and brandable subdomain names.'
        },
        {
          role: 'user',
          content: prompt
        }
      ], {
        maxTokens: 500,
        temperature: 0.8 // Higher creativity for domain names
      });

      // Parse AI response
      const aiSuggestions = this.parseAIDomainResponse(response.content);
      
      // Validate and ensure uniqueness
      const validatedDomain = await this.validateAndEnsureUniqueness(
        aiSuggestions.primary,
        aiSuggestions.alternatives
      );

      return {
        subdomain: validatedDomain.subdomain,
        reasoning: aiSuggestions.reasoning,
        alternatives: aiSuggestions.alternatives,
        score: this.calculateDomainScore(validatedDomain.subdomain)
      };

    } catch (error) {
      this.logger.error('Failed to generate domain with AI', error);
      // Fallback to algorithmic generation
      return this.generateFallbackDomain(request);
    }
  }

  /**
   * Build AI prompt for domain generation
   */
  private buildDomainGenerationPrompt(request: DomainGenerationRequest): string {
    const styleGuide = {
      professional: 'professional, trustworthy, corporate',
      creative: 'unique, memorable, catchy',
      technical: 'tech-savvy, modern, innovative',
      playful: 'fun, friendly, approachable'
    };

    return `Generate a memorable subdomain name for the following project:

Project Name: ${request.projectName}
Description: ${request.projectDescription || 'No description provided'}
Type: ${request.projectType || 'webapp'}
Target Audience: ${request.targetAudience || 'general'}
Keywords: ${request.keywords?.join(', ') || 'none'}
Style: ${styleGuide[request.preferredStyle || 'professional']}

Requirements:
1. Create a SHORT subdomain (5-15 characters)
2. Make it memorable and easy to spell
3. Avoid numbers unless they add meaning
4. Consider the project's purpose and audience
5. Add a unique suffix if needed (2-4 characters)
6. Must be URL-safe (lowercase, no spaces, alphanumeric + hyphens)

Generate:
1. One primary subdomain suggestion
2. Three alternative suggestions
3. Brief reasoning for the primary choice

Format your response as JSON:
{
  "primary": "suggested-name",
  "alternatives": ["alt1", "alt2", "alt3"],
  "reasoning": "Explanation of why this name works"
}`;
  }

  /**
   * Parse AI response for domain suggestions
   */
  private parseAIDomainResponse(aiResponse: string): {
    primary: string;
    alternatives: string[];
    reasoning: string;
  } {
    try {
      // Try to parse as JSON first
      const parsed = JSON.parse(aiResponse);
      return {
        primary: this.sanitizeSubdomain(parsed.primary),
        alternatives: parsed.alternatives.map((alt: string) => this.sanitizeSubdomain(alt)),
        reasoning: parsed.reasoning
      };
    } catch (error) {
      // Fallback: extract domain from text
      const lines = aiResponse.split('\n').filter(l => l.trim());
      const primary = this.extractDomainFromText(lines[0]);
      
      return {
        primary: primary || 'project',
        alternatives: [],
        reasoning: 'AI response parsing failed, used fallback extraction'
      };
    }
  }

  /**
   * Sanitize subdomain to ensure URL safety
   */
  private sanitizeSubdomain(domain: string): string {
    return domain
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-') // Replace invalid chars with hyphens
      .replace(/--+/g, '-')         // Replace multiple hyphens with single
      .replace(/^-|-$/g, '')        // Remove leading/trailing hyphens
      .substring(0, 20);            // Limit length
  }

  /**
   * Extract domain from unstructured text
   */
  private extractDomainFromText(text: string): string {
    // Look for patterns that might be domain suggestions
    const patterns = [
      /"([a-z0-9-]+)"/,           // Quoted strings
      /`([a-z0-9-]+)`/,           // Backtick strings
      /:\s*([a-z0-9-]+)/,         // After colon
      /^([a-z0-9-]+)$/            // Entire line
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return this.sanitizeSubdomain(match[1]);
      }
    }

    return '';
  }

  /**
   * Validate and ensure domain uniqueness
   */
  private async validateAndEnsureUniqueness(
    primary: string,
    alternatives: string[]
  ): Promise<{ subdomain: string; isAlternative: boolean }> {
    const candidates = [primary, ...alternatives];
    
    for (const candidate of candidates) {
      // Check if domain is available
      const isAvailable = await this.isDomainAvailable(candidate);
      if (isAvailable) {
        return { subdomain: candidate, isAlternative: candidate !== primary };
      }
      
      // Try with random suffix
      const withSuffix = `${candidate}-${this.generateRandomSuffix()}`;
      const suffixAvailable = await this.isDomainAvailable(withSuffix);
      if (suffixAvailable) {
        return { subdomain: withSuffix, isAlternative: true };
      }
    }

    // Last resort: use project ID with random suffix
    const fallback = `project-${this.generateRandomSuffix()}`;
    return { subdomain: fallback, isAlternative: true };
  }

  /**
   * Check if domain is available
   */
  private async isDomainAvailable(subdomain: string): Promise<boolean> {
    // Check reserved domains
    if (this.reservedDomains.has(subdomain)) {
      return false;
    }

    // Check database for existing domains
    try {
      const query = `
        SELECT COUNT(*) as count 
        FROM domain_configurations 
        WHERE subdomain = ? AND status IN ('active', 'reserved')
      `;
      const result = await this.database.query(query, [subdomain]);
      return result[0].count === 0;
    } catch (error) {
      this.logger.error('Failed to check domain availability', error);
      return false;
    }
  }

  /**
   * Generate fallback domain without AI
   */
  private async generateFallbackDomain(request: DomainGenerationRequest): Promise<AIGeneratedDomain> {
    const baseSubdomain = this.sanitizeSubdomain(request.projectName);
    const suffix = this.generateRandomSuffix();
    const subdomain = `${baseSubdomain}-${suffix}`;

    return {
      subdomain,
      reasoning: 'Generated using project name with unique suffix',
      alternatives: [
        `${baseSubdomain}-app-${suffix}`,
        `${baseSubdomain}-${request.projectType || 'web'}-${suffix}`,
        `${request.projectType || 'app'}-${baseSubdomain}-${suffix}`
      ],
      score: 0.7
    };
  }

  /**
   * Generate random suffix for uniqueness
   */
  private generateRandomSuffix(): string {
    // Use combination of timestamp and random for uniqueness
    const timestamp = Date.now().toString(36).slice(-3);
    const random = crypto.randomBytes(2).toString('hex').slice(0, 3);
    return `${timestamp}${random}`;
  }

  /**
   * Calculate domain quality score
   */
  private calculateDomainScore(subdomain: string): number {
    let score = 1.0;

    // Length scoring (optimal: 6-12 characters)
    const length = subdomain.length;
    if (length >= 6 && length <= 12) {
      score *= 1.0;
    } else if (length < 6) {
      score *= 0.8;
    } else {
      score *= (20 - length) / 10;
    }

    // Memorability (no numbers, few hyphens)
    if (!/\d/.test(subdomain)) score *= 1.1; // No numbers
    const hyphenCount = (subdomain.match(/-/g) || []).length;
    score *= Math.max(0.7, 1 - hyphenCount * 0.1);

    // Pronounceability (basic check)
    if (/[aeiou]/i.test(subdomain)) score *= 1.1; // Has vowels

    return Math.min(1.0, Math.max(0.1, score));
  }

  /**
   * Configure domain for a project
   */
  async configureDomainForProject(
    projectId: string,
    options: {
      service: 'aci' | 'staticwebapp';
      environment?: 'production' | 'staging' | 'development';
      customDomain?: string;
      useAI?: boolean;
    } = { service: 'aci', useAI: true }
  ): Promise<DomainConfiguration> {
    try {
      this.logger.info('Configuring domain for project', { projectId, options });

      // Get project details from database
      const project = await this.getProjectDetails(projectId);
      
      let subdomain: string;
      let aiGenerated = false;
      let aiReasoning: string | undefined;

      if (options.customDomain) {
        // Use custom domain
        subdomain = this.sanitizeSubdomain(options.customDomain);
      } else if (options.useAI !== false) {
        // Generate with AI
        const aiDomain = await this.generateDomainWithAI({
          projectId,
          projectName: project.name,
          projectDescription: project.description,
          projectType: project.type,
          targetAudience: project.target_audience,
          keywords: project.keywords,
          preferredStyle: project.style || 'professional'
        });
        
        subdomain = aiDomain.subdomain;
        aiGenerated = true;
        aiReasoning = aiDomain.reasoning;
      } else {
        // Fallback generation
        const fallback = await this.generateFallbackDomain({
          projectId,
          projectName: project.name,
          projectType: project.type
        });
        subdomain = fallback.subdomain;
      }

      // Create domain configuration
      const domainConfig: DomainConfiguration = {
        id: crypto.randomUUID(),
        projectId,
        domain: this.defaultZone,
        subdomain,
        fqdn: `${subdomain}.${this.defaultZone}`,
        type: options.customDomain ? 'custom' : 'generated',
        environment: options.environment || 'production',
        service: options.service,
        aiGenerated,
        aiReasoning,
        status: 'pending',
        created: new Date(),
        updated: new Date()
      };

      // Save to database
      await this.saveDomainConfiguration(domainConfig);

      // Reserve the domain
      this.reservedDomains.add(subdomain);

      this.emit('domain-configured', domainConfig);
      return domainConfig;

    } catch (error) {
      this.logger.error('Failed to configure domain', error);
      throw error;
    }
  }

  /**
   * Deploy project with configured domain
   */
  async deployProjectWithDomain(
    projectId: string,
    deploymentConfig: any
  ): Promise<{
    deployment: any;
    domain: DomainConfiguration;
  }> {
    try {
      // Get or create domain configuration
      let domainConfig = await this.getDomainConfiguration(projectId);
      
      if (!domainConfig) {
        domainConfig = await this.configureDomainForProject(projectId, {
          service: deploymentConfig.service || 'aci',
          environment: deploymentConfig.environment || 'production'
        });
      }

      // Deploy using unified domain manager
      let deployment;
      
      if (domainConfig.service === 'aci') {
        deployment = await this.domainManager.deployContainerWithDomain(
          `${projectId}-${domainConfig.environment}`,
          deploymentConfig.containerConfig,
          {
            subdomain: domainConfig.subdomain,
            environment: domainConfig.environment,
            ssl: true,
            healthCheck: true
          }
        );
      } else {
        deployment = await this.domainManager.deployStaticWebAppWithDomain(
          `${projectId}-${domainConfig.environment}`,
          deploymentConfig.staticWebAppConfig,
          {
            subdomain: domainConfig.subdomain,
            environment: domainConfig.environment
          }
        );
      }

      // Update domain status
      domainConfig.status = 'active';
      await this.updateDomainConfiguration(domainConfig);

      this.emit('project-deployed', { projectId, domain: domainConfig.fqdn });

      return { deployment, domain: domainConfig };

    } catch (error) {
      this.logger.error('Failed to deploy project with domain', error);
      throw error;
    }
  }

  /**
   * Get project details from database
   */
  private async getProjectDetails(projectId: string): Promise<any> {
    const query = `
      SELECT 
        p.id,
        p.name,
        p.description,
        p.type,
        p.status,
        p.metadata
      FROM projects p
      WHERE p.id = ?
    `;
    
    const results = await this.database.query(query, [projectId]);
    
    if (results.length === 0) {
      throw new Error(`Project not found: ${projectId}`);
    }

    const project = results[0];
    
    // Parse metadata if it's JSON
    if (project.metadata) {
      try {
        const metadata = JSON.parse(project.metadata);
        return { ...project, ...metadata };
      } catch (error) {
        // Metadata is not valid JSON
      }
    }

    return project;
  }

  /**
   * Save domain configuration to database
   */
  private async saveDomainConfiguration(config: DomainConfiguration): Promise<void> {
    const query = `
      INSERT INTO domain_configurations (
        id, project_id, domain, subdomain, fqdn, type, environment, 
        service, ai_generated, ai_reasoning, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    await this.database.query(query, [
      config.id,
      config.projectId,
      config.domain,
      config.subdomain,
      config.fqdn,
      config.type,
      config.environment,
      config.service,
      config.aiGenerated,
      config.aiReasoning,
      config.status,
      config.created,
      config.updated
    ]);
  }

  /**
   * Get domain configuration for project
   */
  private async getDomainConfiguration(projectId: string): Promise<DomainConfiguration | null> {
    const query = `
      SELECT * FROM domain_configurations 
      WHERE project_id = ? AND status = 'active'
      ORDER BY created_at DESC
      LIMIT 1
    `;
    
    const results = await this.database.query(query, [projectId]);
    
    if (results.length === 0) {
      return null;
    }

    return this.mapToDomainConfiguration(results[0]);
  }

  /**
   * Update domain configuration
   */
  private async updateDomainConfiguration(config: DomainConfiguration): Promise<void> {
    const query = `
      UPDATE domain_configurations 
      SET status = ?, updated_at = ?
      WHERE id = ?
    `;
    
    await this.database.query(query, [
      config.status,
      new Date(),
      config.id
    ]);
  }

  /**
   * Load reserved domains from database
   */
  private async loadReservedDomains(): Promise<void> {
    try {
      const query = `
        SELECT subdomain FROM domain_configurations 
        WHERE status IN ('active', 'reserved')
      `;
      
      const results = await this.database.query(query);
      
      results.forEach((row: any) => {
        this.reservedDomains.add(row.subdomain);
      });

      // Also add system reserved domains
      const systemReserved = [
        'www', 'api', 'app', 'admin', 'portal', 'dashboard',
        'blog', 'shop', 'store', 'mail', 'ftp', 'test', 'dev',
        'staging', 'prod', 'production', 'help', 'support'
      ];
      
      systemReserved.forEach(domain => this.reservedDomains.add(domain));

      this.logger.info(`Loaded ${this.reservedDomains.size} reserved domains`);
    } catch (error) {
      this.logger.error('Failed to load reserved domains', error);
    }
  }

  /**
   * Map database row to DomainConfiguration
   */
  private mapToDomainConfiguration(row: any): DomainConfiguration {
    return {
      id: row.id,
      projectId: row.project_id,
      domain: row.domain,
      subdomain: row.subdomain,
      fqdn: row.fqdn,
      type: row.type,
      environment: row.environment,
      service: row.service,
      aiGenerated: row.ai_generated,
      aiReasoning: row.ai_reasoning,
      status: row.status,
      created: new Date(row.created_at),
      updated: new Date(row.updated_at)
    };
  }

  /**
   * List all domains for a project
   */
  async listProjectDomains(projectId: string): Promise<DomainConfiguration[]> {
    const query = `
      SELECT * FROM domain_configurations 
      WHERE project_id = ?
      ORDER BY created_at DESC
    `;
    
    const results = await this.database.query(query, [projectId]);
    return results.map((row: any) => this.mapToDomainConfiguration(row));
  }

  /**
   * Get domain analytics
   */
  async getDomainAnalytics(): Promise<{
    totalDomains: number;
    aiGenerated: number;
    customDomains: number;
    byEnvironment: Record<string, number>;
    byService: Record<string, number>;
    topProjects: Array<{ projectId: string; domains: number }>;
  }> {
    const analytics = await this.database.query(`
      SELECT 
        COUNT(*) as total_domains,
        SUM(CASE WHEN ai_generated = 1 THEN 1 ELSE 0 END) as ai_generated,
        SUM(CASE WHEN type = 'custom' THEN 1 ELSE 0 END) as custom_domains,
        environment,
        service,
        project_id,
        COUNT(*) as domain_count
      FROM domain_configurations
      WHERE status = 'active'
      GROUP BY environment, service, project_id
    `);

    // Process results
    const byEnvironment: Record<string, number> = {};
    const byService: Record<string, number> = {};
    const projectCounts: Record<string, number> = {};

    analytics.forEach((row: any) => {
      byEnvironment[row.environment] = (byEnvironment[row.environment] || 0) + row.domain_count;
      byService[row.service] = (byService[row.service] || 0) + row.domain_count;
      projectCounts[row.project_id] = row.domain_count;
    });

    const topProjects = Object.entries(projectCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([projectId, domains]) => ({ projectId, domains }));

    return {
      totalDomains: analytics[0]?.total_domains || 0,
      aiGenerated: analytics[0]?.ai_generated || 0,
      customDomains: analytics[0]?.custom_domains || 0,
      byEnvironment,
      byService,
      topProjects
    };
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    await this.database.close();
    await this.domainManager.cleanup();
  }
}