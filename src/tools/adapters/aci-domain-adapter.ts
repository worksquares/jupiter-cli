/**
 * ACI Domain Adapter
 * Manages domain configuration for Azure Container Instances
 */

import { BaseToolAdapter } from '../base-adapter';
import { ParameterSchema } from '../tool-types';
import { ToolResult } from '../../core/types';
import { Logger } from '../../utils/logger';
import { ACIDomainManager, DomainResult } from '../../azure/aci-domain-manager';
import { SegregationContext, DomainConfig, validateSegregationContext } from '../../core/segregation-types';
import { z } from 'zod';

const DomainOperationSchema = z.enum([
  'configure', 'update', 'remove', 'info', 'check-availability'
]);

const ACIDomainParamsSchema = z.object({
  context: z.object({
    userId: z.string().uuid(),
    projectId: z.string().uuid(),
    taskId: z.string().uuid(),
    tenantId: z.string().uuid().optional()
  }),
  operation: DomainOperationSchema,
  config: z.object({
    subdomainPattern: z.string().default('{projectId}-{userId}'),
    sslEnabled: z.boolean().default(true),
    customDomain: z.string().optional(),
    sslCertificate: z.string().optional()
  }).optional(),
  subdomain: z.string().optional()
});

type ACIDomainParams = z.infer<typeof ACIDomainParamsSchema>;

export class ACIDomainAdapter extends BaseToolAdapter {
  name = 'aciDomain';
  description = 'Configure custom domains for Azure Container Instances';
  
  parameters: Record<string, ParameterSchema> = {
    context: {
      type: 'object',
      description: 'Segregation context with userId, projectId, and taskId',
      required: true
    },
    operation: {
      type: 'string',
      description: 'Domain operation: configure, update, remove, info, check-availability',
      required: true
    },
    config: {
      type: 'object',
      description: 'Domain configuration settings',
      required: false
    },
    subdomain: {
      type: 'string',
      description: 'Subdomain to check for availability',
      required: false
    }
  };

  protected logger: Logger;
  private domainManager: ACIDomainManager;

  constructor(domainManager: ACIDomainManager) {
    super();
    this.logger = new Logger('ACIDomainAdapter');
    this.domainManager = domainManager;
  }

  async execute(params: ACIDomainParams): Promise<ToolResult> {
    try {
      // Validate parameters
      const validated = ACIDomainParamsSchema.parse(params);
      const context = validateSegregationContext(validated.context);
      
      this.logger.info('Executing domain operation', { 
        context,
        operation: validated.operation
      });

      let result: any;
      
      switch (validated.operation) {
        case 'configure':
          result = await this.configureDomain(context, validated.config);
          break;
          
        case 'update':
          if (!validated.config) {
            throw new Error('Configuration is required for update operation');
          }
          result = await this.updateDomain(context, validated.config);
          break;
          
        case 'remove':
          result = await this.removeDomain(context);
          break;
          
        case 'info':
          result = await this.getDomainInfo(context);
          break;
          
        case 'check-availability':
          if (!validated.subdomain) {
            throw new Error('Subdomain is required for availability check');
          }
          result = await this.checkAvailability(validated.subdomain);
          break;
          
        default:
          throw new Error(`Unknown operation: ${validated.operation}`);
      }

      return {
        success: true,
        data: {
          ...result,
          operation: validated.operation,
          context: {
            userId: context.userId,
            projectId: context.projectId,
            taskId: context.taskId
          }
        },
        metadata: {
          executionTime: Date.now(),
          toolName: this.name,
          parameters: {
            operation: validated.operation
          }
        }
      };
    } catch (error) {
      this.logger.error('Domain operation failed', error);
      
      return {
        success: false,
        error: error as Error,
        data: null,
        metadata: {
          executionTime: Date.now(),
          toolName: this.name,
          parameters: params
        }
      };
    }
  }

  validate(params: any): boolean {
    try {
      ACIDomainParamsSchema.parse(params);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Configure domain for container
   */
  private async configureDomain(
    context: SegregationContext,
    config?: DomainConfig
  ): Promise<DomainResult> {
    const result = await this.domainManager.configureDomain(context, config);
    
    this.logger.info('Domain configured', {
      context,
      publicUrl: result.publicUrl,
      aciUrl: result.aciUrl
    });
    
    return result;
  }

  /**
   * Update domain configuration
   */
  private async updateDomain(
    context: SegregationContext,
    config: Partial<DomainConfig>
  ): Promise<DomainResult> {
    const result = await this.domainManager.updateDomain(context, config);
    
    this.logger.info('Domain updated', {
      context,
      publicUrl: result.publicUrl
    });
    
    return result;
  }

  /**
   * Remove domain configuration
   */
  private async removeDomain(
    context: SegregationContext
  ): Promise<{ removed: boolean }> {
    await this.domainManager.removeDomain(context);
    
    this.logger.info('Domain removed', { context });
    
    return { removed: true };
  }

  /**
   * Get domain info
   */
  private async getDomainInfo(
    context: SegregationContext
  ): Promise<DomainResult | { exists: false }> {
    const info = await this.domainManager.getDomainInfo(context.projectId);
    
    if (!info) {
      return { exists: false };
    }
    
    return info;
  }

  /**
   * Check subdomain availability
   */
  private async checkAvailability(
    subdomain: string
  ): Promise<{ available: boolean; subdomain: string }> {
    const available = await this.domainManager.isDomainAvailable(subdomain);
    
    return {
      available,
      subdomain
    };
  }

  /**
   * High-level helper methods
   */

  /**
   * Configure project with default domain
   */
  async configureProjectDomain(
    context: SegregationContext,
    enableSSL: boolean = true
  ): Promise<ToolResult> {
    return this.execute({
      context,
      operation: 'configure',
      config: {
        subdomainPattern: '{projectId}',
        sslEnabled: enableSSL
      }
    });
  }

  /**
   * Configure user-project domain
   */
  async configureUserProjectDomain(
    context: SegregationContext,
    enableSSL: boolean = true
  ): Promise<ToolResult> {
    return this.execute({
      context,
      operation: 'configure',
      config: {
        subdomainPattern: '{userId}-{projectId}',
        sslEnabled: enableSSL
      }
    });
  }

  /**
   * Configure with custom domain
   */
  async configureCustomDomain(
    context: SegregationContext,
    customDomain: string,
    sslCertificate?: string
  ): Promise<ToolResult> {
    return this.execute({
      context,
      operation: 'configure',
      config: {
        subdomainPattern: '{projectId}',
        customDomain,
        sslEnabled: true,
        sslCertificate
      }
    });
  }

  /**
   * Get public URL for project
   */
  async getPublicUrl(context: SegregationContext): Promise<string | null> {
    const result = await this.execute({
      context,
      operation: 'info'
    });
    
    if (result.success && result.data?.publicUrl) {
      return result.data.publicUrl;
    }
    
    return null;
  }

  /**
   * Get all active domains
   */
  getActiveDomains(): Map<string, DomainResult> {
    return this.domainManager.getActiveDomains();
  }
}
