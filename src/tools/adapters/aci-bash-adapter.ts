/**
 * ACI Bash Adapter
 * Executes bash commands within Azure Container Instances
 */

import { BaseToolAdapter } from '../base-adapter';
import { ParameterSchema } from '../tool-types';
import { ToolResult } from '../../core/types';
import { Logger } from '../../utils/logger';
import { AzureContainerManager } from '../../azure/aci-manager';
import { SegregationContext, validateSegregationContext } from '../../core/segregation-types';
import { WebSocketExecClient } from '../../services/websocket-exec-client';
import { z } from 'zod';

const ACIBashParamsSchema = z.object({
  context: z.object({
    userId: z.string().uuid(),
    projectId: z.string().uuid(),
    taskId: z.string().uuid(),
    tenantId: z.string().uuid().optional()
  }),
  command: z.string(),
  workdir: z.string().optional(),
  timeout: z.number().optional(),
  stream: z.boolean().optional()
});

type ACIBashParams = z.infer<typeof ACIBashParamsSchema>;

export class ACIBashAdapter extends BaseToolAdapter {
  name = 'aciBash';
  description = 'Execute bash commands in Azure Container Instance';
  
  parameters: Record<string, ParameterSchema> = {
    context: {
      type: 'object',
      description: 'Segregation context with userId, projectId, and taskId',
      required: true
    },
    command: {
      type: 'string',
      description: 'Bash command to execute',
      required: true
    },
    workdir: {
      type: 'string',
      description: 'Working directory (default: /workspace)',
      required: false
    },
    timeout: {
      type: 'number',
      description: 'Command timeout in milliseconds',
      required: false
    },
    stream: {
      type: 'boolean',
      description: 'Stream output in real-time',
      required: false
    }
  };

  protected logger: Logger;
  private aciManager: AzureContainerManager;
  private streamCallback?: (data: string, type: 'stdout' | 'stderr') => void;

  constructor(aciManager: AzureContainerManager) {
    super();
    this.logger = new Logger('ACIBashAdapter');
    this.aciManager = aciManager;
  }

  /**
   * Set stream callback for real-time output
   */
  setStreamCallback(callback: (data: string, type: 'stdout' | 'stderr') => void): void {
    this.streamCallback = callback;
  }

  async execute(params: ACIBashParams): Promise<ToolResult> {
    try {
      // Validate parameters
      const validated = ACIBashParamsSchema.parse(params);
      const context = validateSegregationContext(validated.context);
      
      this.logger.info('Executing bash command in ACI', { 
        context,
        command: validated.command.substring(0, 100) // Log first 100 chars
      });

      // Ensure container exists
      const container = await this.aciManager.getOrCreateContainer(context, {
        image: 'node:18',
        memoryGB: 1.5,
        exposedPorts: []
      });
      const containerName = this.aciManager.getContainerName(context);

      // Execute command with streaming support
      if (validated.stream) {
        // Get WebSocket URI for streaming
        const execResult = await this.aciManager.executeCommand(
          containerName,
          validated.command
        );

        if (execResult.webSocketUri) {
          // Create WebSocket client
          const wsClient = new WebSocketExecClient(execResult.webSocketUri, execResult.password || '');
          
          // Connect to WebSocket
          await wsClient.connect();
          
          // Execute command with streaming
          const streamResult = await wsClient.execute(validated.command, {
            timeout: validated.timeout,
            onData: (data) => {
              if (this.streamCallback) {
                this.streamCallback(data, 'stdout');
              }
            },
            onError: (error) => {
              if (this.streamCallback) {
                this.streamCallback(error, 'stderr');
              }
            }
          });

          return {
            success: streamResult.exitCode === 0,
            data: {
              stdout: streamResult.stdout,
              stderr: streamResult.stderr,
              exitCode: streamResult.exitCode,
              context: {
                userId: context.userId,
                projectId: context.projectId,
                taskId: context.taskId
              },
              streaming: true,
              webSocketUri: execResult.webSocketUri
            },
            metadata: {
              executionTime: Date.now(),
              toolName: this.name,
              parameters: {
                command: validated.command,
                workdir: validated.workdir
              }
            }
          };
        }
      }

      // Fallback to non-streaming execution
      const cmdWithWorkdir = validated.workdir ? 
        `cd ${validated.workdir} && ${validated.command}` : 
        validated.command;
      const result = await this.aciManager.executeCommand(
        containerName,
        `bash -c "${cmdWithWorkdir}"`
      );

      // Stream output if callback is set (for non-WebSocket streaming)
      if (this.streamCallback) {
        if (result.stdout) {
          this.streamCallback(result.stdout, 'stdout');
        }
        if (result.stderr) {
          this.streamCallback(result.stderr, 'stderr');
        }
      }

      return {
        success: result.exitCode === 0,
        data: {
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
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
            command: validated.command,
            workdir: validated.workdir
          }
        }
      };
    } catch (error) {
      this.logger.error('Bash command execution failed', error);
      
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
      ACIBashParamsSchema.parse(params);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Execute command and return parsed JSON output
   */
  async executeJson<T = any>(params: ACIBashParams): Promise<ToolResult> {
    const result = await this.execute(params);
    
    if (result.success && result.data?.stdout) {
      try {
        const parsed = JSON.parse(result.data.stdout);
        return {
          ...result,
          data: parsed
        };
      } catch (error) {
        return {
          ...result,
          success: false,
          error: new Error('Failed to parse JSON output')
        };
      }
    }
    
    return result;
  }

  /**
   * Execute multiple commands in sequence
   */
  async executeSequence(
    context: SegregationContext,
    commands: string[],
    options?: { stopOnError?: boolean; workdir?: string }
  ): Promise<ToolResult[]> {
    const results: ToolResult[] = [];
    
    for (const command of commands) {
      const result = await this.execute({
        context,
        command,
        workdir: options?.workdir
      });
      
      results.push(result);
      
      if (!result.success && options?.stopOnError) {
        break;
      }
    }
    
    return results;
  }

  /**
   * Common bash operations
   */
  
  async listFiles(context: SegregationContext, path: string = '.'): Promise<ToolResult> {
    return this.execute({
      context,
      command: `ls -la ${path}`
    });
  }

  async readFile(context: SegregationContext, path: string): Promise<ToolResult> {
    return this.execute({
      context,
      command: `cat ${path}`
    });
  }

  async writeFile(
    context: SegregationContext, 
    path: string, 
    content: string
  ): Promise<ToolResult> {
    const escapedContent = content.replace(/'/g, "'\"'\"'");
    return this.execute({
      context,
      command: `echo '${escapedContent}' > ${path}`
    });
  }

  async createDirectory(
    context: SegregationContext,
    path: string
  ): Promise<ToolResult> {
    return this.execute({
      context,
      command: `mkdir -p ${path}`
    });
  }

  async installPackages(
    context: SegregationContext,
    packages: string[],
    packageManager: 'npm' | 'yarn' | 'pip' = 'npm'
  ): Promise<ToolResult> {
    const commands = {
      npm: `npm install ${packages.join(' ')}`,
      yarn: `yarn add ${packages.join(' ')}`,
      pip: `pip install ${packages.join(' ')}`
    };
    
    return this.execute({
      context,
      command: commands[packageManager],
      workdir: '/workspace'
    });
  }

  async runScript(
    context: SegregationContext,
    script: string,
    args?: string[]
  ): Promise<ToolResult> {
    const command = args ? `${script} ${args.join(' ')}` : script;
    return this.execute({
      context,
      command,
      workdir: '/workspace'
    });
  }
}