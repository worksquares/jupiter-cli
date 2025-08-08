/**
 * Project Environment Service
 * Fetches and manages environment variables for AI-generated projects
 * Environment variables are stored in Jupiter DB and accessed via Jupiter API
 */

import { Logger } from '../utils/logger';
import { JupiterDBClient } from '../database/jupiter-db-client';
import { encryptionService } from './encryption-service';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

export interface ProjectEnvironmentVariable {
  id?: string;
  projectId: string;
  key: string;
  value: string;
  description?: string;
  type: 'string' | 'number' | 'boolean' | 'json' | 'secret';
  category?: 'database' | 'api' | 'auth' | 'service' | 'feature' | 'custom';
  isSecret: boolean;
  isRequired: boolean;
  defaultValue?: string;
  validationRegex?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ProjectEnvConfig {
  projectId: string;
  projectName: string;
  environment: 'development' | 'staging' | 'production';
  variables: ProjectEnvironmentVariable[];
  templateId?: string;
  createdBy?: string;
}

export interface EnvTemplate {
  id: string;
  name: string;
  description: string;
  framework: string; // react, angular, vue, node, python, etc.
  variables: Omit<ProjectEnvironmentVariable, 'projectId'>[];
}

export class ProjectEnvironmentService {
  private logger: Logger;
  private envCache: Map<string, ProjectEnvConfig> = new Map();
  private templates: Map<string, EnvTemplate> = new Map();

  constructor(private dbClient: JupiterDBClient) {
    this.logger = new Logger('ProjectEnvironmentService');
    this.initializeTemplates();
  }

  /**
   * Initialize default environment templates for different frameworks
   */
  private initializeTemplates(): void {
    // React Template
    this.templates.set('react', {
      id: 'react-default',
      name: 'React Application',
      description: 'Default environment variables for React applications',
      framework: 'react',
      variables: [
        {
          key: 'REACT_APP_API_URL',
          value: 'http://localhost:3001/api',
          type: 'string',
          category: 'api',
          isSecret: false,
          isRequired: true,
          description: 'Backend API endpoint'
        },
        {
          key: 'REACT_APP_AUTH_ENABLED',
          value: 'false',
          type: 'boolean',
          category: 'auth',
          isSecret: false,
          isRequired: false,
          description: 'Enable authentication'
        },
        {
          key: 'REACT_APP_VERSION',
          value: '1.0.0',
          type: 'string',
          category: 'custom',
          isSecret: false,
          isRequired: false,
          description: 'Application version'
        }
      ]
    });

    // Node.js Template
    this.templates.set('node', {
      id: 'node-default',
      name: 'Node.js Application',
      description: 'Default environment variables for Node.js applications',
      framework: 'node',
      variables: [
        {
          key: 'PORT',
          value: '3000',
          type: 'number',
          category: 'service',
          isSecret: false,
          isRequired: true,
          description: 'Server port'
        },
        {
          key: 'NODE_ENV',
          value: 'development',
          type: 'string',
          category: 'service',
          isSecret: false,
          isRequired: true,
          description: 'Node environment',
          validationRegex: '^(development|staging|production)$'
        },
        {
          key: 'DATABASE_URL',
          value: '',
          type: 'string',
          category: 'database',
          isSecret: true,
          isRequired: false,
          description: 'Database connection string'
        },
        {
          key: 'JWT_SECRET',
          value: '',
          type: 'secret',
          category: 'auth',
          isSecret: true,
          isRequired: false,
          description: 'JWT signing secret'
        },
        {
          key: 'API_KEY',
          value: '',
          type: 'secret',
          category: 'api',
          isSecret: true,
          isRequired: false,
          description: 'API authentication key'
        }
      ]
    });

    // Python/Django Template
    this.templates.set('python', {
      id: 'python-default',
      name: 'Python Application',
      description: 'Default environment variables for Python applications',
      framework: 'python',
      variables: [
        {
          key: 'DEBUG',
          value: 'True',
          type: 'boolean',
          category: 'service',
          isSecret: false,
          isRequired: true,
          description: 'Debug mode'
        },
        {
          key: 'SECRET_KEY',
          value: '',
          type: 'secret',
          category: 'auth',
          isSecret: true,
          isRequired: true,
          description: 'Django secret key'
        },
        {
          key: 'DATABASE_URL',
          value: 'sqlite:///db.sqlite3',
          type: 'string',
          category: 'database',
          isSecret: false,
          isRequired: true,
          description: 'Database URL'
        },
        {
          key: 'ALLOWED_HOSTS',
          value: 'localhost,127.0.0.1',
          type: 'string',
          category: 'service',
          isSecret: false,
          isRequired: true,
          description: 'Allowed hosts (comma-separated)'
        }
      ]
    });

    // Angular Template
    this.templates.set('angular', {
      id: 'angular-default',
      name: 'Angular Application',
      description: 'Default environment variables for Angular applications',
      framework: 'angular',
      variables: [
        {
          key: 'API_URL',
          value: 'http://localhost:3000/api',
          type: 'string',
          category: 'api',
          isSecret: false,
          isRequired: true,
          description: 'Backend API URL'
        },
        {
          key: 'PRODUCTION',
          value: 'false',
          type: 'boolean',
          category: 'service',
          isSecret: false,
          isRequired: true,
          description: 'Production mode'
        }
      ]
    });

    // Vue Template
    this.templates.set('vue', {
      id: 'vue-default',
      name: 'Vue Application',
      description: 'Default environment variables for Vue applications',
      framework: 'vue',
      variables: [
        {
          key: 'VUE_APP_API_BASE_URL',
          value: 'http://localhost:3000',
          type: 'string',
          category: 'api',
          isSecret: false,
          isRequired: true,
          description: 'API base URL'
        },
        {
          key: 'VUE_APP_TITLE',
          value: 'My Vue App',
          type: 'string',
          category: 'custom',
          isSecret: false,
          isRequired: false,
          description: 'Application title'
        }
      ]
    });
  }

  /**
   * Fetch environment variables for a project from Jupiter DB
   */
  async fetchProjectEnvFromDB(projectId: string): Promise<ProjectEnvConfig | null> {
    try {
      // Check cache first
      if (this.envCache.has(projectId)) {
        return this.envCache.get(projectId)!;
      }

      // Fetch project details
      const project = await this.dbClient.queryOne<any>(
        'SELECT * FROM projects WHERE id = ?',
        [projectId]
      );

      if (!project) {
        this.logger.warn(`Project not found: ${projectId}`);
        return null;
      }

      // Fetch environment variables
      const variables = await this.dbClient.query<any>(
        `SELECT * FROM project_env_variables 
         WHERE project_id = ? 
         ORDER BY category, key`,
        [projectId]
      );

      const config: ProjectEnvConfig = {
        projectId,
        projectName: project.name,
        environment: project.environment || 'development',
        variables: variables.map(v => ({
          id: v.id,
          projectId: v.project_id,
          key: v.key,
          value: v.is_secret ? this.decryptValue(v.value, projectId) : v.value,
          description: v.description,
          type: v.type,
          category: v.category,
          isSecret: v.is_secret,
          isRequired: v.is_required,
          defaultValue: v.default_value,
          validationRegex: v.validation_regex,
          createdAt: v.created_at,
          updatedAt: v.updated_at
        }))
      };

      // Cache the configuration
      this.envCache.set(projectId, config);

      this.logger.info(`Fetched ${variables.length} env variables for project ${projectId}`);
      return config;

    } catch (error) {
      this.logger.error('Failed to fetch project env from DB', error);
      throw error;
    }
  }

  /**
   * Save environment variables to Jupiter DB
   */
  async saveProjectEnvToDB(config: ProjectEnvConfig): Promise<void> {
    const connection = await this.dbClient.beginTransaction();

    try {
      // Create or update project env table if not exists
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS project_env_variables (
          id VARCHAR(36) PRIMARY KEY,
          project_id VARCHAR(36) NOT NULL,
          key VARCHAR(255) NOT NULL,
          value TEXT,
          description TEXT,
          type VARCHAR(20) DEFAULT 'string',
          category VARCHAR(50),
          is_secret BOOLEAN DEFAULT FALSE,
          is_required BOOLEAN DEFAULT FALSE,
          default_value TEXT,
          validation_regex VARCHAR(500),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
          UNIQUE KEY unique_project_key (project_id, key),
          INDEX idx_project_env (project_id),
          INDEX idx_category (category)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      // Insert or update variables
      for (const variable of config.variables) {
        const id = variable.id || uuidv4();
        
        await connection.execute(
          `INSERT INTO project_env_variables 
           (id, project_id, key, value, description, type, category, 
            is_secret, is_required, default_value, validation_regex)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
           value = VALUES(value),
           description = VALUES(description),
           type = VALUES(type),
           category = VALUES(category),
           is_secret = VALUES(is_secret),
           is_required = VALUES(is_required),
           default_value = VALUES(default_value),
           validation_regex = VALUES(validation_regex),
           updated_at = NOW()`,
          [
            id,
            config.projectId,
            variable.key,
            variable.isSecret ? this.encryptValue(variable.value, config.projectId) : variable.value,
            variable.description,
            variable.type,
            variable.category,
            variable.isSecret,
            variable.isRequired,
            variable.defaultValue,
            variable.validationRegex
          ]
        );
      }

      await this.dbClient.commit(connection);
      
      // Update cache
      this.envCache.set(config.projectId, config);
      
      this.logger.info(`Saved ${config.variables.length} env variables for project ${config.projectId}`);

    } catch (error) {
      await this.dbClient.rollback(connection);
      this.logger.error('Failed to save project env to DB', error);
      throw error;
    }
  }

  /**
   * Generate .env file for a project
   */
  async generateEnvFile(
    projectId: string,
    outputPath: string,
    environment: 'development' | 'staging' | 'production' = 'development'
  ): Promise<void> {
    try {
      const config = await this.fetchProjectEnvFromDB(projectId);
      
      if (!config) {
        throw new Error(`No environment configuration found for project ${projectId}`);
      }

      // Build .env content
      let envContent = `# Environment Configuration for ${config.projectName}\n`;
      envContent += `# Generated at: ${new Date().toISOString()}\n`;
      envContent += `# Environment: ${environment}\n\n`;

      // Group variables by category
      const grouped = this.groupVariablesByCategory(config.variables);

      for (const [category, variables] of Object.entries(grouped)) {
        envContent += `# ${category.toUpperCase()}\n`;
        
        for (const variable of variables) {
          if (variable.description) {
            envContent += `# ${variable.description}\n`;
          }
          
          // Use environment-specific value if available
          let value = variable.value;
          
          // Don't expose secrets in non-production environments
          if (variable.isSecret && environment !== 'production') {
            value = variable.defaultValue || `<${variable.key}_SECRET>`;
          }
          
          envContent += `${variable.key}=${value}\n`;
        }
        
        envContent += '\n';
      }

      // Write .env file
      const envFilePath = path.join(outputPath, '.env');
      fs.writeFileSync(envFilePath, envContent, 'utf8');
      
      // Generate .env.example without secrets
      const exampleContent = this.generateEnvExample(config);
      const exampleFilePath = path.join(outputPath, '.env.example');
      fs.writeFileSync(exampleFilePath, exampleContent, 'utf8');

      this.logger.info(`Generated .env files for project ${projectId} at ${outputPath}`);

    } catch (error) {
      this.logger.error('Failed to generate env file', error);
      throw error;
    }
  }

  /**
   * Generate .env.example file content
   */
  private generateEnvExample(config: ProjectEnvConfig): string {
    let content = `# Environment Configuration Example for ${config.projectName}\n`;
    content += `# Copy this file to .env and fill in the values\n\n`;

    const grouped = this.groupVariablesByCategory(config.variables);

    for (const [category, variables] of Object.entries(grouped)) {
      content += `# ${category.toUpperCase()}\n`;
      
      for (const variable of variables) {
        if (variable.description) {
          content += `# ${variable.description}\n`;
        }
        
        if (variable.isRequired) {
          content += `# Required\n`;
        }
        
        if (variable.validationRegex) {
          content += `# Format: ${variable.validationRegex}\n`;
        }
        
        let value = variable.defaultValue || '';
        
        if (variable.isSecret) {
          value = `your-${variable.key.toLowerCase().replace(/_/g, '-')}-here`;
        } else if (!value && variable.type === 'boolean') {
          value = 'false';
        } else if (!value && variable.type === 'number') {
          value = '0';
        }
        
        content += `${variable.key}=${value}\n`;
      }
      
      content += '\n';
    }

    return content;
  }

  /**
   * Create environment configuration for a new project
   */
  async createProjectEnvConfig(
    projectId: string,
    projectName: string,
    framework: string,
    customVariables?: Partial<ProjectEnvironmentVariable>[]
  ): Promise<ProjectEnvConfig> {
    try {
      // Get template for framework
      const template = this.templates.get(framework.toLowerCase());
      
      if (!template) {
        this.logger.warn(`No template found for framework: ${framework}, using node template`);
      }
      
      const baseVariables = template?.variables || this.templates.get('node')!.variables;
      
      // Create config with template variables
      const config: ProjectEnvConfig = {
        projectId,
        projectName,
        environment: 'development',
        variables: baseVariables.map(v => ({
          ...v,
          projectId,
          id: uuidv4()
        }))
      };

      // Add custom variables if provided
      if (customVariables && customVariables.length > 0) {
        for (const customVar of customVariables) {
          const existingIndex = config.variables.findIndex(v => v.key === customVar.key);
          
          if (existingIndex >= 0) {
            // Update existing variable
            config.variables[existingIndex] = {
              ...config.variables[existingIndex],
              ...customVar,
              projectId
            };
          } else {
            // Add new variable
            config.variables.push({
              key: customVar.key!,
              value: customVar.value || '',
              type: customVar.type || 'string',
              category: customVar.category || 'custom',
              isSecret: customVar.isSecret || false,
              isRequired: customVar.isRequired || false,
              description: customVar.description,
              defaultValue: customVar.defaultValue,
              validationRegex: customVar.validationRegex,
              projectId,
              id: uuidv4()
            });
          }
        }
      }

      // Save to database
      await this.saveProjectEnvToDB(config);

      this.logger.info(`Created env config for project ${projectId} with ${config.variables.length} variables`);
      return config;

    } catch (error) {
      this.logger.error('Failed to create project env config', error);
      throw error;
    }
  }

  /**
   * Update environment variable for a project
   */
  async updateProjectEnvVariable(
    projectId: string,
    key: string,
    value: string,
    options?: Partial<ProjectEnvironmentVariable>
  ): Promise<void> {
    try {
      const config = await this.fetchProjectEnvFromDB(projectId);
      
      if (!config) {
        throw new Error(`No environment configuration found for project ${projectId}`);
      }

      const variableIndex = config.variables.findIndex(v => v.key === key);
      
      if (variableIndex >= 0) {
        // Update existing variable
        config.variables[variableIndex] = {
          ...config.variables[variableIndex],
          value,
          ...options
        };
      } else {
        // Add new variable
        config.variables.push({
          projectId,
          key,
          value,
          type: options?.type || 'string',
          category: options?.category || 'custom',
          isSecret: options?.isSecret || false,
          isRequired: options?.isRequired || false,
          description: options?.description,
          defaultValue: options?.defaultValue,
          validationRegex: options?.validationRegex
        });
      }

      // Save updated config
      await this.saveProjectEnvToDB(config);

      this.logger.info(`Updated env variable ${key} for project ${projectId}`);

    } catch (error) {
      this.logger.error('Failed to update project env variable', error);
      throw error;
    }
  }

  /**
   * Delete environment variable for a project
   */
  async deleteProjectEnvVariable(projectId: string, key: string): Promise<void> {
    try {
      await this.dbClient.execute(
        'DELETE FROM project_env_variables WHERE project_id = ? AND key = ?',
        [projectId, key]
      );

      // Update cache
      const config = this.envCache.get(projectId);
      if (config) {
        config.variables = config.variables.filter(v => v.key !== key);
      }

      this.logger.info(`Deleted env variable ${key} for project ${projectId}`);

    } catch (error) {
      this.logger.error('Failed to delete project env variable', error);
      throw error;
    }
  }

  /**
   * Validate environment variables
   */
  validateEnvironmentVariables(variables: ProjectEnvironmentVariable[]): string[] {
    const errors: string[] = [];

    for (const variable of variables) {
      // Check required variables
      if (variable.isRequired && !variable.value && !variable.defaultValue) {
        errors.push(`Required variable ${variable.key} has no value`);
      }

      // Validate against regex if provided
      if (variable.validationRegex && variable.value) {
        const regex = new RegExp(variable.validationRegex);
        if (!regex.test(variable.value)) {
          errors.push(`Variable ${variable.key} does not match validation pattern: ${variable.validationRegex}`);
        }
      }

      // Type validation
      if (variable.type === 'number' && variable.value) {
        if (isNaN(Number(variable.value))) {
          errors.push(`Variable ${variable.key} must be a number`);
        }
      }

      if (variable.type === 'boolean' && variable.value) {
        if (!['true', 'false', '1', '0'].includes(variable.value.toLowerCase())) {
          errors.push(`Variable ${variable.key} must be a boolean (true/false)`);
        }
      }

      if (variable.type === 'json' && variable.value) {
        try {
          JSON.parse(variable.value);
        } catch {
          errors.push(`Variable ${variable.key} must be valid JSON`);
        }
      }
    }

    return errors;
  }

  /**
   * Group variables by category
   */
  private groupVariablesByCategory(
    variables: ProjectEnvironmentVariable[]
  ): Record<string, ProjectEnvironmentVariable[]> {
    const grouped: Record<string, ProjectEnvironmentVariable[]> = {};

    for (const variable of variables) {
      const category = variable.category || 'custom';
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(variable);
    }

    return grouped;
  }

  /**
   * Encrypt sensitive value
   */
  private encryptValue(value: string, projectId?: string): string {
    if (!value) return value;
    return encryptionService.encryptEnvValue(value, projectId || 'default');
  }

  /**
   * Decrypt sensitive value
   */
  private decryptValue(value: string, projectId?: string): string {
    if (!value) return value;
    return encryptionService.decryptEnvValue(value, projectId || 'default');
  }

  /**
   * Clear cache for a project
   */
  clearCache(projectId?: string): void {
    if (projectId) {
      this.envCache.delete(projectId);
    } else {
      this.envCache.clear();
    }
  }

  /**
   * Get all available templates
   */
  getTemplates(): EnvTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * Get template by framework
   */
  getTemplate(framework: string): EnvTemplate | undefined {
    return this.templates.get(framework.toLowerCase());
  }
}