/**
 * Static Website Handler
 * Handles UI requests and returns static website URLs
 */

import { Request, Response, NextFunction } from 'express';
import { Logger } from '../utils/logger';
import { StaticSiteGenerator } from '../services/static-site-generator';
import { ACIBuilder } from '../services/aci-builder';

export interface StaticSiteMapping {
  pattern: RegExp;
  staticUrl: string;
  fallbackUrl?: string;
  cache?: boolean;
}

export class StaticWebsiteHandler {
  private logger: Logger;
  private staticSiteGenerator: StaticSiteGenerator;
  private aciBuilder: ACIBuilder;
  private siteMappings: Map<string, StaticSiteMapping>;
  private deployedSites: Map<string, string>;

  constructor() {
    this.logger = new Logger('StaticWebsiteHandler');
    this.staticSiteGenerator = new StaticSiteGenerator();
    this.aciBuilder = new ACIBuilder();
    this.siteMappings = new Map();
    this.deployedSites = new Map();
    
    this.initializeMappings();
  }

  /**
   * Initialize URL mappings
   */
  private initializeMappings(): void {
    // Default mappings for UI routes
    const mappings: StaticSiteMapping[] = [
      {
        pattern: /^\/$/,
        staticUrl: process.env.STATIC_SITE_URL || 'https://jupiter-ai.azurestaticapps.net',
        fallbackUrl: 'https://jupiter-ai-backup.azurewebsites.net',
        cache: true
      },
      {
        pattern: /^\/app\/?.*$/,
        staticUrl: process.env.STATIC_SITE_URL || 'https://jupiter-ai.azurestaticapps.net',
        cache: true
      },
      {
        pattern: /^\/chat\/?.*$/,
        staticUrl: process.env.CHAT_SITE_URL || 'https://jupiter-chat.azurestaticapps.net',
        cache: true
      },
      {
        pattern: /^\/dashboard\/?.*$/,
        staticUrl: process.env.DASHBOARD_URL || 'https://jupiter-dashboard.azurestaticapps.net',
        cache: true
      }
    ];

    mappings.forEach(mapping => {
      this.siteMappings.set(mapping.pattern.source, mapping);
    });
  }

  /**
   * Middleware to handle UI requests
   */
  handleUIRequest = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      // Check if this is an API request
      if (this.isAPIRequest(req)) {
        return next();
      }

      // Check if this is a UI request
      const mapping = this.findMapping(req.path);
      
      if (!mapping) {
        // Not a UI route, continue to next middleware
        return next();
      }

      // Check for deployed site URL
      const deployedUrl = this.deployedSites.get(req.path);
      
      if (deployedUrl) {
        this.logger.info(`Serving cached static URL for ${req.path}`);
        return this.redirectToStaticSite(res, deployedUrl);
      }

      // Use mapped static URL
      const targetUrl = this.constructTargetUrl(mapping.staticUrl, req);
      
      // Check if static site is available
      const isAvailable = await this.checkStaticSiteAvailability(targetUrl);
      
      if (isAvailable) {
        if (mapping.cache) {
          this.deployedSites.set(req.path, targetUrl);
        }
        return this.redirectToStaticSite(res, targetUrl);
      }

      // Use fallback if available
      if (mapping.fallbackUrl) {
        this.logger.warn(`Primary static site unavailable, using fallback for ${req.path}`);
        return this.redirectToStaticSite(res, mapping.fallbackUrl);
      }

      // No static site available, continue to next middleware
      this.logger.warn(`No static site available for ${req.path}`);
      next();

    } catch (error) {
      this.logger.error('Error handling UI request:', error);
      next(error);
    }
  };

  /**
   * Deploy new static site
   */
  async deployStaticSite(
    projectId: string,
    sourceCode: string,
    framework: 'react' | 'vue' | 'angular' | 'nextjs' | 'vanilla' | 'python' | 'dotnet' | 'java'
  ): Promise<{ success: boolean; url?: string; error?: string }> {
    try {
      this.logger.info(`Deploying static site for project ${projectId}`);

      // Build in ACI first
      const buildResult = await this.aciBuilder.build({
        projectId,
        sourceCode,
        framework,
        environment: {
          NODE_ENV: 'production',
          REACT_APP_API_URL: process.env.API_URL || 'https://api.jupiter-ai.com'
        }
      });

      if (!buildResult.success) {
        return {
          success: false,
          error: buildResult.error
        };
      }

      // Generate and deploy static site
      const deploymentResult = await this.staticSiteGenerator.generate({
        projectId,
        framework,
        sourceDir: `/tmp/builds/${projectId}`,
        environment: {
          AZURE_STATIC_WEB_APPS_API_TOKEN: process.env.AZURE_STATIC_WEB_APPS_API_TOKEN || ''
        }
      });

      if (deploymentResult.success && deploymentResult.url) {
        // Cache the deployment
        this.deployedSites.set(`/${projectId}`, deploymentResult.url);
        
        return {
          success: true,
          url: deploymentResult.url
        };
      }

      return {
        success: false,
        error: deploymentResult.error
      };

    } catch (error) {
      this.logger.error('Static site deployment failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Deployment failed'
      };
    }
  }

  /**
   * Check if request is for API
   */
  private isAPIRequest(req: Request): boolean {
    const apiPaths = [
      '/api',
      '/auth',
      '/health',
      '/tasks',
      '/tools',
      '/memory',
      '/learn',
      '/optimize',
      '/deploy'
    ];

    return apiPaths.some(path => req.path.startsWith(path));
  }

  /**
   * Find mapping for path
   */
  private findMapping(path: string): StaticSiteMapping | undefined {
    for (const [_, mapping] of this.siteMappings) {
      if (mapping.pattern.test(path)) {
        return mapping;
      }
    }
    return undefined;
  }

  /**
   * Construct target URL
   */
  private constructTargetUrl(baseUrl: string, req: Request): string {
    const path = req.path === '/' ? '' : req.path;
    const query = req.query ? '?' + new URLSearchParams(req.query as any).toString() : '';
    return `${baseUrl}${path}${query}`;
  }

  /**
   * Check static site availability
   */
  private async checkStaticSiteAvailability(url: string): Promise<boolean> {
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000)
      });
      
      return response.ok;
    } catch (error) {
      this.logger.error(`Static site unavailable at ${url}:`, error);
      return false;
    }
  }

  /**
   * Redirect to static site
   */
  private redirectToStaticSite(res: Response, url: string): void {
    res.set({
      'X-Static-Site': 'true',
      'Cache-Control': 'public, max-age=3600'
    });
    
    res.redirect(301, url);
  }

  /**
   * Get deployment status
   */
  getDeploymentStatus(projectId: string): {
    deployed: boolean;
    url?: string;
  } {
    const url = this.deployedSites.get(`/${projectId}`);
    return {
      deployed: !!url,
      url
    };
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.deployedSites.clear();
    this.logger.info('Static site cache cleared');
  }
}