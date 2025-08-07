/**
 * ACI Build Adapter
 * Handles building frontend projects within Azure Container Instances
 */

import { Tool, ToolResult } from '../../core/types';
import { Logger } from '../../utils/logger';
import { AzureContainerManager } from '../../azure/aci-manager';
import { SegregationContext } from '../../core/segregation-types';
import { ValidationError } from '../../utils/errors';

export interface BuildOptions {
  context: SegregationContext;
  framework: 'react' | 'vue' | 'angular' | 'vanilla';
  command?: string;
  outputDir?: string;
  env?: Record<string, string>;
  timeout?: number;
}

export interface BuildResult {
  success: boolean;
  output: string;
  errors?: string[];
  artifacts?: {
    path: string;
    size: number;
  }[];
  duration: number;
}

export class ACIBuildAdapter implements Tool {
  name = 'aciBuild';
  description = 'Build frontend projects in Azure Container Instance';
  private containerNameCache: Map<string, string> = new Map();

  /**
   * Get container name for context
   */
  private getContainerName(context: SegregationContext): string {
    const key = `${context.sessionId}-${context.projectId}-${context.taskId}`;
    if (!this.containerNameCache.has(key)) {
      this.containerNameCache.set(key, this.aciManager.getContainerName(context));
    }
    return this.containerNameCache.get(key)!;
  }
  parameters = {
    context: {
      type: 'object',
      description: 'Segregation context',
      required: true
    },
    framework: {
      type: 'string',
      description: 'Frontend framework',
      enum: ['react', 'vue', 'angular', 'vanilla'],
      required: true
    },
    command: {
      type: 'string',
      description: 'Custom build command (optional)'
    },
    outputDir: {
      type: 'string',
      description: 'Output directory for build artifacts',
      default: 'dist'
    },
    env: {
      type: 'object',
      description: 'Environment variables for build'
    },
    timeout: {
      type: 'number',
      description: 'Build timeout in milliseconds',
      default: 300000 // 5 minutes
    }
  };

  private logger: Logger;
  private defaultCommands = {
    react: 'npm install && npm run build',
    vue: 'npm install && npm run build',
    angular: 'npm install && npm run build',
    vanilla: 'echo "No build required for vanilla JS"'
  };

  constructor(private aciManager: AzureContainerManager) {
    this.logger = new Logger('ACIBuildAdapter');
  }

  async execute(params: BuildOptions): Promise<ToolResult> {
    const startTime = Date.now();
    
    try {
      this.validate(params);
      
      const { context, framework, command, outputDir = 'dist', env, timeout = 300000 } = params;
      
      this.logger.info('Starting build', { 
        framework, 
        containerGroup: this.aciManager.getContainerName(context) 
      });

      // Get container instance
      const container = await this.aciManager.getOrCreateContainer(context, {
        image: params.framework === 'angular' ? 'node:16' : 'node:18',
        memoryGB: 2,
        exposedPorts: []
      });
      if (!container.name) {
        throw new Error('Container name not found');
      }

      // Prepare build command
      const buildCommand = command || this.defaultCommands[framework];
      const fullCommand = this.prepareBuildCommand(buildCommand, outputDir, env);

      // Execute build
      const result = await this.aciManager.executeCommand(
        container.name!,
        fullCommand
      );

      // Check for build errors
      const errors = this.extractBuildErrors(result.stderr);
      const success = result.exitCode === 0 && errors.length === 0;

      // Get build artifacts info
      let artifacts: BuildResult['artifacts'] = [];
      if (success) {
        artifacts = await this.getBuildArtifacts(container.name, outputDir);
      }

      const duration = Date.now() - startTime;

      const buildResult: BuildResult = {
        success,
        output: result.stdout,
        errors: errors.length > 0 ? errors : undefined,
        artifacts,
        duration
      };

      this.logger.info('Build completed', { 
        success, 
        duration,
        artifactCount: artifacts?.length || 0 
      });

      return {
        success,
        data: buildResult
      };

    } catch (error) {
      this.logger.error('Build failed', error);
      
      return {
        success: false,
        error: error as Error,
        data: {
          success: false,
          output: '',
          errors: [(error as Error).message],
          duration: Date.now() - startTime
        }
      };
    }
  }

  validate(params: any): boolean {
    if (!params.context || !params.context.userId || !params.context.projectId) {
      throw new ValidationError('Invalid segregation context');
    }

    if (!params.framework || !(params.framework in this.defaultCommands)) {
      throw new ValidationError('Invalid or unsupported framework');
    }

    if (params.timeout && (params.timeout < 10000 || params.timeout > 600000)) {
      throw new ValidationError('Timeout must be between 10 and 600 seconds');
    }

    return true;
  }

  /**
   * Prepare the full build command with environment setup
   */
  private prepareBuildCommand(
    baseCommand: string,
    outputDir: string,
    env?: Record<string, string>
  ): string {
    const commands = ['cd /workspace'];

    // Set environment variables
    if (env) {
      for (const [key, value] of Object.entries(env)) {
        commands.push(`export ${key}="${value}"`);
      }
    }

    // Add NODE_ENV if not set
    if (!env?.NODE_ENV) {
      commands.push('export NODE_ENV=production');
    }

    // Add the build command
    commands.push(baseCommand);

    // Verify output directory exists
    commands.push(`ls -la ${outputDir} || echo "Build output directory not found"`);

    return commands.join(' && ');
  }

  /**
   * Extract build errors from stderr
   */
  private extractBuildErrors(stderr: string): string[] {
    const errors: string[] = [];
    const lines = stderr.split('\n');

    for (const line of lines) {
      // Common error patterns
      if (line.includes('ERROR') || 
          line.includes('Error:') ||
          line.includes('Failed to compile') ||
          line.includes('Module not found') ||
          line.includes('Cannot find module') ||
          line.includes('SyntaxError') ||
          line.includes('TypeError')) {
        errors.push(line.trim());
      }
    }

    return errors;
  }

  /**
   * Get information about build artifacts
   */
  private async getBuildArtifacts(
    containerName: string,
    outputDir: string
  ): Promise<BuildResult['artifacts']> {
    const context: SegregationContext = {
      userId: 'system',
      projectId: 'system',
      taskId: 'build',
      sessionId: `session-${Date.now()}`
    };
    try {
      // List files in output directory
      const listResult = await this.aciManager.executeCommand(
        containerName,
        `find /workspace/${outputDir} -type f -exec ls -la {} \;`
      );

      const artifacts: BuildResult['artifacts'] = [];
      const lines = listResult.stdout.split('\n').filter(line => line.trim());

      for (const line of lines) {
        const [path, sizeStr] = line.split(':');
        if (path && sizeStr) {
          artifacts.push({
            path: path.replace('/workspace/', ''),
            size: parseInt(sizeStr) || 0
          });
        }
      }

      return artifacts;
    } catch (error) {
      this.logger.warn('Failed to get build artifacts', error);
      return [];
    }
  }

  /**
   * Get framework-specific build hints
   */
  getFrameworkHints(framework: string): string[] {
    const hints: Record<string, string[]> = {
      react: [
        'Ensure package.json has a "build" script',
        'Check that React and React-DOM versions are compatible',
        'Verify that environment variables start with REACT_APP_',
        'Build output should be in the "build" or "dist" folder'
      ],
      vue: [
        'Ensure package.json has a "build" script',
        'Check Vue version compatibility',
        'Verify that environment variables start with VUE_APP_',
        'Build output should be in the "dist" folder'
      ],
      angular: [
        'Ensure angular.json is properly configured',
        'Check Angular CLI version',
        'Verify that the project name matches in angular.json',
        'Build output should be in the "dist" folder'
      ],
      vanilla: [
        'No build step required for vanilla JavaScript',
        'Ensure all files are in the correct location',
        'Check that index.html exists in the root'
      ]
    };

    return hints[framework] || [];
  }
}