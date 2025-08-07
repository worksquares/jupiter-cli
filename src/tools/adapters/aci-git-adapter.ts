/**
 * ACI Git Adapter
 * Provides Git functionality within Azure Container Instances
 */

import { BaseToolAdapter } from '../base-adapter';
import { ParameterSchema } from '../tool-types';
import { ToolResult } from '../../core/types';
import { Logger } from '../../utils/logger';
import { ACIGitManager } from '../../azure/aci-git-manager';
import { SegregationContext, validateSegregationContext } from '../../core/segregation-types';
import { z } from 'zod';

const ACIGitParamsSchema = z.object({
  context: z.object({
    userId: z.string().uuid(),
    projectId: z.string().uuid(),
    taskId: z.string().uuid(),
    tenantId: z.string().uuid().optional()
  }),
  command: z.enum([
    'clone', 'pull', 'push', 'commit', 'branch', 'checkout',
    'merge', 'rebase', 'cherry-pick', 'status', 'log', 'diff',
    'stash', 'tag', 'reset', 'revert', 'remote', 'fetch'
  ]),
  args: z.array(z.string()).optional(),
  workDir: z.string().optional(),
  options: z.object({
    stream: z.boolean().optional(),
    timeout: z.number().optional()
  }).optional()
});

type ACIGitParams = z.infer<typeof ACIGitParamsSchema>;

export class ACIGitAdapter extends BaseToolAdapter {
  name = 'aciGit';
  description = 'Execute Git commands in Azure Container Instance';
  private streamCallback?: (data: string, type: 'stdout' | 'stderr') => void;
  
  parameters: Record<string, ParameterSchema> = {
    context: {
      type: 'object',
      description: 'Segregation context with userId, projectId, and taskId',
      required: true
    },
    command: {
      type: 'string',
      description: 'Git command to execute (clone, pull, push, commit, branch, etc.)',
      required: true
    },
    args: {
      type: 'array',
      description: 'Command arguments',
      required: false
    },
    workDir: {
      type: 'string',
      description: 'Working directory',
      required: false
    },
    options: {
      type: 'object',
      description: 'Additional options (stream: boolean for real-time output)',
      required: false
    }
  };

  protected logger: Logger;
  private gitManager: ACIGitManager;

  constructor(gitManager: ACIGitManager) {
    super();
    this.logger = new Logger('ACIGitAdapter');
    this.gitManager = gitManager;
  }

  async execute(params: ACIGitParams): Promise<ToolResult> {
    try {
      // Validate parameters
      const validated = ACIGitParamsSchema.parse(params);
      const context = validateSegregationContext(validated.context);
      
      this.logger.info('Executing Git command in ACI', { 
        context,
        command: validated.command,
        args: validated.args
      });

      // Check if streaming is requested
      const stream = validated.options?.stream === true;
      
      let result;
      if (stream && this.streamCallback) {
        // Execute with streaming
        result = await this.gitManager.executeGitCommandStream(
          context,
          validated.command,
          validated.args || [],
          {
            workDir: validated.workDir,
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
          }
        );
      } else {
        // Non-streaming execution
        result = await this.gitManager.executeGitCommand(
          context,
          validated.command,
          validated.args || [],
          validated.workDir
        );
      }

      return {
        success: result.success,
        data: {
          output: result.output,
          branch: result.branch,
          exitCode: result.exitCode,
          error: result.error,
          context: {
            userId: context.userId,
            projectId: context.projectId,
            taskId: context.taskId
          },
          streaming: stream,
          webSocketUri: (result as any).webSocketUri
        },
        metadata: {
          executionTime: Date.now(),
          toolName: this.name,
          parameters: {
            command: validated.command,
            args: validated.args,
            workDir: validated.workDir
          }
        }
      };
    } catch (error) {
      this.logger.error('Git command execution failed', error);
      
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
      ACIGitParamsSchema.parse(params);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * High-level Git operations
   */

  async clone(
    context: SegregationContext,
    repoUrl: string,
    directory?: string,
    options?: { branch?: string; depth?: number }
  ): Promise<ToolResult> {
    const args = [repoUrl];
    
    if (directory) {
      args.push(directory);
    }
    
    if (options?.branch) {
      args.unshift('-b', options.branch);
    }
    
    if (options?.depth) {
      args.unshift('--depth', options.depth.toString());
    }

    return this.execute({
      context,
      command: 'clone',
      args
    });
  }

  async commit(
    context: SegregationContext,
    message: string,
    files?: string[]
  ): Promise<ToolResult> {
    // First, add files if specified
    if (files && files.length > 0) {
      await this.gitManager.executeGitCommand(
        context,
        'add',
        files
      );
    }

    // Then commit
    return this.execute({
      context,
      command: 'commit',
      args: ['-m', message]
    });
  }

  async createBranch(
    context: SegregationContext,
    branchName: string,
    checkout: boolean = true
  ): Promise<ToolResult> {
    if (checkout) {
      return this.execute({
        context,
        command: 'checkout',
        args: ['-b', branchName]
      });
    } else {
      return this.execute({
        context,
        command: 'branch',
        args: [branchName]
      });
    }
  }

  async push(
    context: SegregationContext,
    remote: string = 'origin',
    branch?: string,
    force: boolean = false
  ): Promise<ToolResult> {
    const args = [remote];
    
    if (branch) {
      args.push(branch);
    }
    
    if (force) {
      args.unshift('--force');
    }

    return this.execute({
      context,
      command: 'push',
      args
    });
  }

  async pull(
    context: SegregationContext,
    remote: string = 'origin',
    branch?: string,
    rebase: boolean = false
  ): Promise<ToolResult> {
    const args = [remote];
    
    if (branch) {
      args.push(branch);
    }
    
    if (rebase) {
      args.unshift('--rebase');
    }

    return this.execute({
      context,
      command: 'pull',
      args
    });
  }

  async merge(
    context: SegregationContext,
    branch: string,
    options?: { noFf?: boolean; message?: string }
  ): Promise<ToolResult> {
    const args = [branch];
    
    if (options?.noFf) {
      args.unshift('--no-ff');
    }
    
    if (options?.message) {
      args.push('-m', options.message);
    }

    return this.execute({
      context,
      command: 'merge',
      args
    });
  }

  async getStatus(context: SegregationContext): Promise<ToolResult> {
    return this.execute({
      context,
      command: 'status',
      args: ['--porcelain']
    });
  }

  async getLog(
    context: SegregationContext,
    options?: { limit?: number; oneline?: boolean }
  ): Promise<ToolResult> {
    const args: string[] = [];
    
    if (options?.limit) {
      args.push(`-${options.limit}`);
    }
    
    if (options?.oneline) {
      args.push('--oneline');
    }

    return this.execute({
      context,
      command: 'log',
      args
    });
  }

  async getDiff(
    context: SegregationContext,
    options?: { staged?: boolean; nameOnly?: boolean }
  ): Promise<ToolResult> {
    const args: string[] = [];
    
    if (options?.staged) {
      args.push('--staged');
    }
    
    if (options?.nameOnly) {
      args.push('--name-only');
    }

    return this.execute({
      context,
      command: 'diff',
      args
    });
  }

  async stash(
    context: SegregationContext,
    action: 'save' | 'pop' | 'list' = 'save',
    message?: string
  ): Promise<ToolResult> {
    const args: string[] = [];
    
    if (action === 'save') {
      args.push('save');
      if (message) {
        args.push('-m', message);
      }
    } else {
      args.push(action);
    }

    return this.execute({
      context,
      command: 'stash',
      args
    });
  }

  async tag(
    context: SegregationContext,
    tagName: string,
    message?: string,
    commit?: string
  ): Promise<ToolResult> {
    const args = [tagName];
    
    if (message) {
      args.unshift('-a');
      args.push('-m', message);
    }
    
    if (commit) {
      args.push(commit);
    }

    return this.execute({
      context,
      command: 'tag',
      args
    });
  }

  async reset(
    context: SegregationContext,
    mode: 'soft' | 'mixed' | 'hard' = 'mixed',
    commit: string = 'HEAD'
  ): Promise<ToolResult> {
    return this.execute({
      context,
      command: 'reset',
      args: [`--${mode}`, commit]
    });
  }

  async revert(
    context: SegregationContext,
    commit: string,
    noCommit: boolean = false
  ): Promise<ToolResult> {
    const args = [commit];
    
    if (noCommit) {
      args.push('--no-commit');
    }

    return this.execute({
      context,
      command: 'revert',
      args
    });
  }

  async addRemote(
    context: SegregationContext,
    name: string,
    url: string
  ): Promise<ToolResult> {
    return this.execute({
      context,
      command: 'remote',
      args: ['add', name, url]
    });
  }

  async fetch(
    context: SegregationContext,
    remote: string = 'origin',
    options?: { all?: boolean; tags?: boolean }
  ): Promise<ToolResult> {
    const args = [remote];
    
    if (options?.all) {
      args.unshift('--all');
    }
    
    if (options?.tags) {
      args.push('--tags');
    }

    return this.execute({
      context,
      command: 'fetch',
      args
    });
  }
}
