/**
 * Domain Configuration API Routes
 * RESTful endpoints for domain management
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { DomainConfigurationService } from '../../services/domain-configuration-service';
import { authMiddleware } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { Logger } from '../../utils/logger';

const router = Router();
const logger = new Logger('DomainRoutes');

// Initialize domain service (would be injected in production)
let domainService: DomainConfigurationService;

export function initializeDomainRoutes(service: DomainConfigurationService): Router {
  domainService = service;
  return router;
}

/**
 * Generate domain suggestions using AI
 * POST /api/domains/generate
 */
router.post('/generate', authMiddleware, validateRequest(
  z.object({
    projectId: z.string(),
    projectName: z.string(),
    projectDescription: z.string().optional(),
    projectType: z.enum(['webapp', 'api', 'service', 'app']).optional(),
    targetAudience: z.string().optional(),
    keywords: z.array(z.string()).optional(),
    preferredStyle: z.enum(['professional', 'creative', 'technical', 'playful']).optional()
  })
), async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    logger.info('Generating domain', { userId, projectId: req.body.projectId });

    const result = await domainService.generateDomainWithAI(req.body);

    res.json({
      success: true,
      data: {
        primary: result.subdomain,
        fqdn: `${result.subdomain}.${process.env.AZURE_DNS_ZONE || 'digisquares.in'}`,
        alternatives: result.alternatives.map(alt => ({
          subdomain: alt,
          fqdn: `${alt}.${process.env.AZURE_DNS_ZONE || 'digisquares.in'}`
        })),
        reasoning: result.reasoning,
        score: result.score
      }
    });
  } catch (error: any) {
    logger.error('Failed to generate domain', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate domain suggestions'
    });
  }
});

/**
 * Configure domain for a project
 * POST /api/domains/configure
 */
router.post('/configure', authMiddleware, validateRequest(
  z.object({
    projectId: z.string(),
    service: z.enum(['aci', 'staticwebapp']),
    environment: z.enum(['production', 'staging', 'development', 'preview']).optional(),
    customDomain: z.string().optional(),
    useAI: z.boolean().optional()
  })
), async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    logger.info('Configuring domain', { userId, ...req.body });

    const configuration = await domainService.configureDomainForProject(
      req.body.projectId,
      {
        service: req.body.service,
        environment: req.body.environment,
        customDomain: req.body.customDomain,
        useAI: req.body.useAI
      }
    );

    res.json({
      success: true,
      data: configuration
    });
  } catch (error: any) {
    logger.error('Failed to configure domain', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to configure domain'
    });
  }
});

/**
 * Deploy project with configured domain
 * POST /api/domains/deploy
 */
router.post('/deploy', authMiddleware, validateRequest(
  z.object({
    projectId: z.string(),
    deploymentConfig: z.object({}).passthrough()
  })
), async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    logger.info('Deploying with domain', { userId, projectId: req.body.projectId });

    const result = await domainService.deployProjectWithDomain(
      req.body.projectId,
      req.body.deploymentConfig
    );

    res.json({
      success: true,
      data: {
        deployment: result.deployment,
        domain: result.domain,
        url: `https://${result.domain.fqdn}`
      }
    });
  } catch (error: any) {
    logger.error('Failed to deploy with domain', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to deploy project'
    });
  }
});

/**
 * List domains for a project
 * GET /api/domains/project/:projectId
 */
router.get('/project/:projectId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { projectId } = req.params;
    
    logger.info('Listing project domains', { userId, projectId });

    const domains = await domainService.listProjectDomains(projectId);

    res.json({
      success: true,
      data: domains
    });
  } catch (error: any) {
    logger.error('Failed to list domains', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list domains'
    });
  }
});

/**
 * Get domain analytics
 * GET /api/domains/analytics
 */
router.get('/analytics', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    logger.info('Getting domain analytics', { userId });

    const analytics = await domainService.getDomainAnalytics();

    res.json({
      success: true,
      data: analytics
    });
  } catch (error: any) {
    logger.error('Failed to get analytics', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get domain analytics'
    });
  }
});

/**
 * Check domain availability
 * GET /api/domains/check/:subdomain
 */
router.get('/check/:subdomain', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { subdomain } = req.params;
    const sanitized = subdomain.toLowerCase().replace(/[^a-z0-9-]/g, '');
    
    // This would check availability
    const available = await (domainService as any).isDomainAvailable(sanitized);

    res.json({
      success: true,
      data: {
        subdomain: sanitized,
        fqdn: `${sanitized}.${process.env.AZURE_DNS_ZONE || 'digisquares.in'}`,
        available
      }
    });
  } catch (error: any) {
    logger.error('Failed to check availability', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check domain availability'
    });
  }
});

/**
 * Generate multiple domain suggestions
 * POST /api/domains/generate-batch
 */
router.post('/generate-batch', authMiddleware, validateRequest(
  z.object({
    projects: z.array(
      z.object({
        projectId: z.string(),
        projectName: z.string(),
        projectDescription: z.string().optional()
      })
    )
  })
), async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    logger.info('Generating batch domains', { userId, count: req.body.projects.length });

    const results = await Promise.all(
      req.body.projects.map(async (project: any) => {
        try {
          const result = await domainService.generateDomainWithAI(project);
          return {
            projectId: project.projectId,
            success: true,
            domain: result
          };
        } catch (error) {
          return {
            projectId: project.projectId,
            success: false,
            error: 'Generation failed'
          };
        }
      })
    );

    res.json({
      success: true,
      data: results
    });
  } catch (error: any) {
    logger.error('Failed to generate batch domains', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate batch domains'
    });
  }
});

export default router;