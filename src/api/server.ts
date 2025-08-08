/**
 * API Server - REST API for the Intelligent Agent System
 */

import express, { Express, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { Agent } from '../core/agent';
import { 
  Task,
  TaskStatus,
  validate,
  TaskSchema,
  MemorySchema,
  LearningEventSchema
} from '../core/unified-types';
import { 
  AgentConfig,
  AgentError,
  RetentionType
} from '../core/types';
import { Logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { allAdapters } from '../tools/adapters';
import { AuthMiddleware, AuthRequest } from './auth-middleware';
import { validateWithSchema, ToolParameterSchemas } from '../utils/validation-schemas';
// ...existing code...
import { StaticWebsiteHandler } from './static-website-handler';
// ...existing code...
// ...existing code...
import projectEnvRoutes from './routes/project-env-routes';
// ...existing code...
import crypto from 'crypto';

// Load environment variables
dotenv.config();

export class APIServer {
  private app: Express;
  private agent: Agent;
  private logger: Logger;
  private port: number;
  private activeTasks: Map<string, Task>;
  private auth: AuthMiddleware;
  private staticHandler: StaticWebsiteHandler;

  constructor(config?: Partial<AgentConfig>) {
    this.app = express();
    this.logger = new Logger('APIServer');
    this.port = parseInt(process.env.PORT || '3002');
    this.activeTasks = new Map();

    // Initialize authentication
    const jwtSecret = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
    if (!process.env.JWT_SECRET) {
      this.logger.warn('JWT_SECRET not set in environment, using random secret');
    }
    
    this.auth = new AuthMiddleware({
      jwtSecret,
      apiKeys: process.env.API_KEYS?.split(',') || [],
      enableJWT: true,
      enableAPIKey: true,
      excludePaths: ['/health', '/auth/login', '/auth/register', '/deploy']
    });

    // Initialize static website handler
    this.staticHandler = new StaticWebsiteHandler();

    // Create agent with default config
    const agentConfig: AgentConfig = {
      name: 'Intelligent Agent API',
      capabilities: ['general-purpose'],
      tools: allAdapters.map(a => a.name),
      memory: {
        maxMemories: 10000,
        consolidationInterval: 3600000, // 1 hour
        importanceThreshold: 0.3,
        retentionPolicy: {
          type: RetentionType.HYBRID,
          duration: 7 * 24 * 60 * 60 * 1000, // 7 days
          maxCount: 5000,
          importanceThreshold: 0.5
        }
      },
      learning: {
        enabled: true,
        learningRate: 0.1,
        minConfidence: 0.6,
        maxPatterns: 1000,
        evaluationInterval: 300000 // 5 minutes
      },
      performance: {
        maxConcurrentTasks: 10,
        taskTimeout: 300000, // 5 minutes
        cacheSize: 1000,
        batchSize: 10,
        prefetchEnabled: true
      },
      security: {
        sandboxed: false,
        allowedTools: [],
        deniedTools: [],
        maxFileSize: 10 * 1024 * 1024, // 10MB
        allowedFileTypes: []
      },
      ...config
    };

    this.agent = new Agent(agentConfig);
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    try {
      // Initialize agent
      await this.agent.initialize();
      
      // Register all tool adapters
      for (const adapter of allAdapters) {
        this.agent.registerTool(adapter);
      }

      // Start server
      this.app.listen(this.port, () => {
        this.logger.info(`API Server running on port ${this.port}`);
        this.logger.info(`Agent initialized with ${this.agent.tools.size} tools`);
      });
    } catch (error) {
      this.logger.error('Failed to start server', error);
      throw error;
    }
  }

  /**
   * Setup middleware
   */
  private setupMiddleware(): void {
    // Static website handler - must be before other middleware
    this.app.use(this.staticHandler.handleUIRequest);
    
    // Security
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"]
        }
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      }
    }));
    
    // Body parsing with limits
    this.app.use(express.json({ 
      limit: '1mb',
      type: ['application/json', 'text/plain']
    }));
    this.app.use(express.urlencoded({ 
      extended: true,
      limit: '1mb'
    }));
    
    // CORS with restrictions
    this.app.use((req, res, next): void => {
      const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'];
      const origin = req.headers.origin;
      
      if (origin && allowedOrigins.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
      }
      
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
      res.header('Access-Control-Allow-Credentials', 'true');
      
      if (req.method === 'OPTIONS') {
        res.sendStatus(204);
        return;
      }
      
      next();
    });
    
    // Authentication middleware
    this.app.use(this.auth.authenticate);
    
    // Rate limiting
    this.app.use(this.auth.rateLimit(100, 60000)); // 100 requests per minute
    
    // Request logging (sanitized)
    this.app.use((req: AuthRequest, _res, next): void => {
      this.logger.info(`${req.method} ${req.path}`, {
        user: req.user?.id,
        apiKey: req.apiKey ? 'present' : 'none'
      });
      next();
    });
  }

  /**
   * Setup routes
   */
  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (_req, res): Response => {
      return res.json({
        status: 'healthy',
        agent: {
          id: this.agent.id,
          capabilities: Array.from(this.agent.capabilities.keys()),
          tools: Array.from(this.agent.tools.keys()),
          activeTasks: this.activeTasks.size
        },
        timestamp: new Date()
      });
    });

    // Auth routes
    this.app.post('/auth/login', async (req, res): Promise<Response> => {
      // Simple login endpoint - in production, verify credentials
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({
          error: 'Username and password required'
        });
      }
      
      // TODO: Verify credentials against database
      // For now, just create a token
      const token = this.auth.generateToken({
        id: uuidv4(),
        name: username,
        role: 'user'
      });
      
      return res.json({ token });
    });
    
    this.app.post('/auth/api-key', this.auth.requireRole('admin'), (_req, res): Response => {
      const apiKey = this.auth.generateAPIKey();
      return res.json({ apiKey });
    });

    // Mount project environment routes
    this.app.use('/api', projectEnvRoutes);

    // Create task
    this.app.post('/tasks', async (req: AuthRequest, res, next): Promise<void> => {
      try {
        // Validate input
        const validated = validate(TaskSchema.pick({ type: true, description: true, context: true, priority: true }), req.body);

        const task: Task = {
          ...validated,
          id: uuidv4(),
          status: TaskStatus.PENDING,
          createdAt: new Date(),
          updatedAt: new Date(),
          userId: req.user?.id || 'anonymous',
          projectId: req.body.projectId || uuidv4() // Generate if not provided
        };

        this.activeTasks.set(task.id, task);

        // Execute task asynchronously
        this.executeTask(task);

        res.status(201).json({
          task,
          message: 'Task created and queued for execution'
        });
      } catch (error) {
        next(error);
      }
    });

    // Get task status
    this.app.get('/tasks/:id', (req, res): Response => {
      const task = this.activeTasks.get(req.params.id);
      
      if (!task) {
        return res.status(404).json({
          error: 'Task not found'
        });
      }

      return res.json({ task });
    });

    // List tasks
    this.app.get('/tasks', (_req, res): Response => {
      const tasks = Array.from(this.activeTasks.values());
      
      return res.json({
        tasks,
        total: tasks.length
      });
    });

    // Execute tool
    this.app.post('/tools/:name/execute', async (req: AuthRequest, res, next): Promise<void> => {
      try {
        const { name } = req.params;
        
        // Validate tool name
        if (!name || typeof name !== 'string') {
          res.status(400).json({
            error: 'Invalid tool name'
          });
          return;
        }
        
        // Validate tool exists
        if (!this.agent.tools.has(name)) {
          res.status(404).json({
            error: 'Tool not found',
            message: `Tool '${name}' does not exist`
          });
          return;
        }
        
        // Validate params based on tool
        const params = req.body;
        try {
          const schema = ToolParameterSchemas[name as keyof typeof ToolParameterSchemas];
          if (schema) {
            try {
              const validated = validateWithSchema(schema as any, params);
              // Use validated params
              req.body = validated;
            } catch (innerError) {
              res.status(400).json({
                error: 'Invalid parameters',
                message: innerError instanceof Error ? innerError.message : 'Validation failed'
              });
              return;
            }
          }
        } catch (validationError) {
          res.status(400).json({
            error: 'Invalid parameters',
            message: validationError instanceof Error ? validationError.message : 'Validation failed'
          });
          return;
        }
        
        // Security check for dangerous tools
        const dangerousTools = ['bash', 'write', 'edit', 'multiEdit'];
        if (dangerousTools.includes(name) && req.user?.role !== 'admin') {
          res.status(403).json({
            error: 'Forbidden',
            message: 'This tool requires admin privileges'
          });
          return;
        }

        const result = await this.agent.executeTool(name, req.body);
        
        res.json({ result });
      } catch (error) {
        next(error);
      }
    });

    // List tools
    this.app.get('/tools', (_req, res): Response => {
      const tools = Array.from(this.agent.tools.values()).map(tool => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }));

      return res.json({ tools });
    });

    // Memory operations
    this.app.post('/memory', async (req, res, next): Promise<void> => {
      try {
        // Validate memory schema
        // Using MemorySchema from unified-types
        const validated = validate(MemorySchema, req.body);
        
        await this.agent.remember(validated);
        res.json({ message: 'Memory stored successfully' });
      } catch (error) {
        if (error instanceof Error && error.message.includes('Validation failed')) {
          res.status(400).json({
            error: 'Invalid memory format',
            message: error.message
          });
          return;
        }
        next(error);
      }
    });

    this.app.get('/memory', async (req, res, next): Promise<void> => {
      try {
        // Validate query parameters
        const { MemoryQuerySchema } = await import('../utils/validation-schemas');
        const validated = validateWithSchema(MemoryQuerySchema, req.query);
        
        const memories = await this.agent.recall(validated);
        res.json({ memories });
      } catch (error) {
        if (error instanceof Error && error.message.includes('Validation failed')) {
          res.status(400).json({
            error: 'Invalid query parameters',
            message: error.message
          });
          return;
        }
        next(error);
      }
    });

    // Learning endpoint
    this.app.post('/learn', async (req, res, next): Promise<void> => {
      try {
        // Validate learning event schema
        // Using LearningEventSchema from unified-types
        const validated = validate(LearningEventSchema, req.body);
        
        await this.agent.learn(validated);
        res.json({ message: 'Learning event processed' });
      } catch (error) {
        if (error instanceof Error && error.message.includes('Validation failed')) {
          res.status(400).json({
            error: 'Invalid learning event',
            message: error.message
          });
          return;
        }
        next(error);
      }
    });

    // Optimization endpoint
    this.app.post('/optimize', async (_req: AuthRequest, res, next): Promise<void> => {
      try {
        await this.agent.optimize();
        res.json({ message: 'Optimization completed' });
      } catch (error) {
        next(error);
      }
    });

    // Static site deployment endpoint
    this.app.post('/deploy/static', async (req: AuthRequest, res, next): Promise<void> => {
      try {
        const { projectId, sourceCode, framework } = req.body;
        
        if (!projectId || !sourceCode || !framework) {
          res.status(400).json({
            error: 'Missing required fields: projectId, sourceCode, framework'
          });
          return;
        }

        const result = await this.staticHandler.deployStaticSite(
          projectId,
          sourceCode,
          framework
        );

        if (result.success) {
          res.json({
            success: true,
            url: result.url,
            message: 'Static site deployed successfully'
          });
        } else {
          res.status(500).json({
            success: false,
            error: result.error
          });
        }
      } catch (error) {
        next(error);
      }
    });

    // Get static site deployment status
    this.app.get('/deploy/static/:projectId', (req: AuthRequest, res): Response => {
      const { projectId } = req.params;
      const status = this.staticHandler.getDeploymentStatus(projectId);
      
      return res.json(status);
    });

    // Deployment endpoint (no auth required for demo)
    this.app.post('/deploy', async (req, res, next): Promise<void> => {
      try {
        const { userId, projectName, description, framework, features } = req.body;
        
        // For now, create a simple code generation response
        // Real ACI deployment would require more setup
        const projectId = `${projectName}-${Date.now()}`;
        
        // Use the code generation tool to create the app structure
        try {
          // Create a basic app structure based on framework
          const codegenResult = await this.agent.executeTool('codegen', {
            prompt: `Create a ${framework} application: ${description}. Include these features: ${features?.join(', ')}`,
            language: framework === 'node' ? 'javascript' : framework
          });
          
          res.json({
            success: true,
            projectId,
            framework,
            code: codegenResult.data?.code || `// ${projectName} - ${framework} application\n// Generated code would go here`,
            message: `Generated ${framework} application successfully`,
            deployment: {
              status: 'code_generated',
              note: 'Full ACI deployment requires additional Azure setup'
            }
          });
          
        } catch (toolError) {
          // No templates - only real AI code generation
          this.logger.error('Code generation failed:', toolError);
          
          res.status(500).json({
            success: false,
            error: 'AI code generation failed. Please check your CosmosAPI key.',
            details: toolError instanceof Error ? toolError.message : 'Unknown error',
            projectId,
            framework,
            deployment: {
              status: 'failed',
              note: 'AI code generation is required. No template fallback.'
            }
          });
        }
        
      } catch (error) {
        next(error);
      }
    });
  }

  /**
   * Setup error handling
   */
  private setupErrorHandling(): void {
    // 404 handler
    this.app.use((req, res): Response => {
      return res.status(404).json({
        error: 'Not found',
        path: req.path
      });
    });

    // Error handler
    this.app.use((err: any, _req: Request, res: Response, _next: NextFunction): Response => {
      this.logger.error('Request error', err);

      if (err instanceof AgentError) {
        return res.status(400).json({
          error: err.message,
          code: err.code
          // Don't expose error details to prevent info leakage
        });
      }

      // Sanitize error messages
      const sanitized = this.auth.sanitizeError(err);
      
      return res.status(500).json({
        error: sanitized.message,
        code: sanitized.code
      });
    });
  }

  /**
   * Execute task asynchronously
   */
  private async executeTask(task: Task): Promise<void> {
    try {
      const result = await this.agent.processTask(task);
      
      // Update task with result
      task.result = result;
      task.updatedAt = new Date();
      
      this.logger.info(`Task ${task.id} completed successfully`);
    } catch (error) {
      task.error = error as Error;
      task.updatedAt = new Date();
      
      this.logger.error(`Task ${task.id} failed`, error);
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down API server...');
    
    try {
      // Wait for active tasks to complete with timeout
      const shutdownTimeout = 30000; // 30 seconds
      const startTime = Date.now();
      
      // Wait for active tasks to finish
      while (this.activeTasks.size > 0 && Date.now() - startTime < shutdownTimeout) {
        this.logger.info(`Waiting for ${this.activeTasks.size} active tasks to complete...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      if (this.activeTasks.size > 0) {
        this.logger.warn(`Forcing shutdown with ${this.activeTasks.size} active tasks`);
      }
      
      // Shutdown the agent
      await this.agent.shutdown();
      
      // Close server
      await new Promise<void>((resolve) => {
        const server = this.app.listen();
        server.close(() => resolve());
      });
      
      this.logger.info('API server shutdown complete');
      process.exit(0);
    } catch (error) {
      this.logger.error('Error during shutdown', error);
      process.exit(1);
    }
  }
}

// Create and start server if running directly
if (require.main === module) {
  const server = new APIServer();
  
  server.start().catch(error => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });

  // Handle shutdown signals
  process.on('SIGINT', () => server.shutdown());
  process.on('SIGTERM', () => server.shutdown());
}