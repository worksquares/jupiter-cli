/**
 * Project Environment Routes
 * API endpoints for managing project environment variables
 */

import { Router, Request, Response } from 'express';
import { ProjectEnvironmentService } from '../../services/project-env-service';
import { JupiterDBClient, getDBClient } from '../../database/jupiter-db-client';
import { Logger } from '../../utils/logger';
import { authMiddleware, requirePermissions, AuthRequest } from '../middleware/auth';

const router = Router();
const logger = new Logger('ProjectEnvRoutes');

// Service singleton with proper connection management
class ProjectEnvRouteService {
  private static instance: ProjectEnvRouteService;
  private envService: ProjectEnvironmentService | null = null;
  private dbClient: JupiterDBClient | null = null;
  private initPromise: Promise<ProjectEnvironmentService> | null = null;

  private constructor() {}

  static getInstance(): ProjectEnvRouteService {
    if (!this.instance) {
      this.instance = new ProjectEnvRouteService();
    }
    return this.instance;
  }

  async getEnvService(): Promise<ProjectEnvironmentService> {
    // If already initializing, wait for it
    if (this.initPromise) {
      return this.initPromise;
    }

    // If already initialized, return it
    if (this.envService) {
      return this.envService;
    }

    // Initialize service
    this.initPromise = this.initialize();
    return this.initPromise;
  }

  private async initialize(): Promise<ProjectEnvironmentService> {
    try {
      // Get shared database client (connection pooled)
      this.dbClient = await getDBClient();
      
      // Create service instance
      this.envService = new ProjectEnvironmentService(this.dbClient);
      
      logger.info('ProjectEnvironmentService initialized with pooled connection');
      return this.envService;
    } catch (error) {
      logger.error('Failed to initialize ProjectEnvironmentService', error);
      this.initPromise = null;
      throw error;
    }
  }

  async cleanup(): Promise<void> {
    // Don't close the connection as it's shared/pooled
    this.envService = null;
    this.dbClient = null;
    this.initPromise = null;
  }
}

const routeService = ProjectEnvRouteService.getInstance();

/**
 * GET /api/projects/:projectId/env
 * Fetch environment variables for a project
 */
router.get('/projects/:projectId/env', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { projectId } = req.params;
    const service = await routeService.getEnvService();
    
    const config = await service.fetchProjectEnvFromDB(projectId);
    
    if (!config) {
      return res.status(404).json({
        success: false,
        error: 'Project environment configuration not found'
      });
    }
    
    // Hide secret values in response
    const sanitizedConfig = {
      ...config,
      variables: config.variables.map(v => ({
        ...v,
        value: v.isSecret ? '***HIDDEN***' : v.value
      }))
    };
    
    return res.json({
      success: true,
      data: sanitizedConfig
    });
    
  } catch (error) {
    logger.error('Failed to fetch project env', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch environment variables'
    });
  }
});

/**
 * POST /api/projects/:projectId/env
 * Create or update environment configuration for a project
 */
router.post('/projects/:projectId/env', authMiddleware, requirePermissions(['env:write']), async (req: AuthRequest, res: Response) => {
  try {
    const { projectId } = req.params;
    const { projectName, framework, variables } = req.body;
    
    if (!projectName || !framework) {
      return res.status(400).json({
        success: false,
        error: 'projectName and framework are required'
      });
    }
    
    const service = await routeService.getEnvService();
    
    const config = await service.createProjectEnvConfig(
      projectId,
      projectName,
      framework,
      variables
    );
    
    return res.json({
      success: true,
      data: config,
      message: `Created environment configuration with ${config.variables.length} variables`
    });
    
  } catch (error) {
    logger.error('Failed to create project env config', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to create environment configuration'
    });
  }
});

/**
 * PUT /api/projects/:projectId/env/:key
 * Update a specific environment variable
 */
router.put('/projects/:projectId/env/:key', authMiddleware, requirePermissions(['env:write']), async (req: AuthRequest, res: Response) => {
  try {
    const { projectId, key } = req.params;
    const { value, description, type, category, isSecret, isRequired, defaultValue, validationRegex } = req.body;
    
    if (value === undefined) {
      return res.status(400).json({
        success: false,
        error: 'value is required'
      });
    }
    
    const service = await routeService.getEnvService();
    
    await service.updateProjectEnvVariable(projectId, key, value, {
      description,
      type,
      category,
      isSecret,
      isRequired,
      defaultValue,
      validationRegex
    });
    
    return res.json({
      success: true,
      message: `Updated environment variable ${key}`
    });
    
  } catch (error) {
    logger.error('Failed to update env variable', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update environment variable'
    });
  }
});

/**
 * DELETE /api/projects/:projectId/env/:key
 * Delete an environment variable
 */
router.delete('/projects/:projectId/env/:key', authMiddleware, requirePermissions(['env:delete']), async (req: AuthRequest, res: Response) => {
  try {
    const { projectId, key } = req.params;
    const service = await routeService.getEnvService();
    
    await service.deleteProjectEnvVariable(projectId, key);
    
    return res.json({
      success: true,
      message: `Deleted environment variable ${key}`
    });
    
  } catch (error) {
    logger.error('Failed to delete env variable', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete environment variable'
    });
  }
});

/**
 * POST /api/projects/:projectId/env/generate
 * Generate .env file for a project
 */
router.post('/projects/:projectId/env/generate', authMiddleware, requirePermissions(['env:generate']), async (req: AuthRequest, res: Response) => {
  try {
    const { projectId } = req.params;
    const { outputPath, environment = 'development' } = req.body;
    
    if (!outputPath) {
      return res.status(400).json({
        success: false,
        error: 'outputPath is required'
      });
    }
    
    const service = await routeService.getEnvService();
    
    await service.generateEnvFile(projectId, outputPath, environment);
    
    return res.json({
      success: true,
      message: `Generated .env files at ${outputPath}`
    });
    
  } catch (error) {
    logger.error('Failed to generate env file', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to generate environment file'
    });
  }
});

/**
 * POST /api/projects/:projectId/env/validate
 * Validate environment variables
 */
router.post('/projects/:projectId/env/validate', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { projectId } = req.params;
    const service = await routeService.getEnvService();
    
    const config = await service.fetchProjectEnvFromDB(projectId);
    
    if (!config) {
      return res.status(404).json({
        success: false,
        error: 'Project environment configuration not found'
      });
    }
    
    const errors = service.validateEnvironmentVariables(config.variables);
    
    return res.json({
      success: errors.length === 0,
      errors,
      message: errors.length === 0 ? 'All environment variables are valid' : `Found ${errors.length} validation errors`
    });
    
  } catch (error) {
    logger.error('Failed to validate env variables', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to validate environment variables'
    });
  }
});

/**
 * GET /api/env/templates
 * Get available environment variable templates
 */
router.get('/env/templates', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const service = await routeService.getEnvService();
    const templates = service.getTemplates();
    
    return res.json({
      success: true,
      data: templates
    });
    
  } catch (error) {
    logger.error('Failed to get templates', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get templates'
    });
  }
});

/**
 * GET /api/env/templates/:framework
 * Get template for a specific framework
 */
router.get('/env/templates/:framework', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { framework } = req.params;
    const service = await routeService.getEnvService();
    
    const template = service.getTemplate(framework);
    
    if (!template) {
      return res.status(404).json({
        success: false,
        error: `Template not found for framework: ${framework}`
      });
    }
    
    return res.json({
      success: true,
      data: template
    });
    
  } catch (error) {
    logger.error('Failed to get template', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get template'
    });
  }
});

/**
 * POST /api/projects/:projectId/env/bulk
 * Bulk update environment variables
 */
router.post('/projects/:projectId/env/bulk', authMiddleware, requirePermissions(['env:write']), async (req: AuthRequest, res: Response) => {
  try {
    const { projectId } = req.params;
    const { variables } = req.body;
    
    if (!Array.isArray(variables)) {
      return res.status(400).json({
        success: false,
        error: 'variables must be an array'
      });
    }
    
    const service = await routeService.getEnvService();
    
    // Fetch existing config
    let config = await service.fetchProjectEnvFromDB(projectId);
    
    if (!config) {
      return res.status(404).json({
        success: false,
        error: 'Project environment configuration not found'
      });
    }
    
    // Update variables
    config.variables = variables.map(v => ({
      ...v,
      projectId
    }));
    
    // Validate before saving
    const errors = service.validateEnvironmentVariables(config.variables);
    
    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        errors,
        message: `Validation failed: ${errors.join(', ')}`
      });
    }
    
    // Save updated config
    await service.saveProjectEnvToDB(config);
    
    return res.json({
      success: true,
      message: `Updated ${variables.length} environment variables`,
      data: config
    });
    
  } catch (error) {
    logger.error('Failed to bulk update env variables', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to bulk update environment variables'
    });
  }
});

export default router;