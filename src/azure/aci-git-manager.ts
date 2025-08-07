/**
 * ACI Git Manager
 * Handles all Git operations within Azure Container Instances
 */

import { Logger } from '../utils/logger';
import { SegregationContext } from '../core/segregation-types';
import { AzureContainerManager } from './aci-manager';
import { WebSocketExecClient } from '../services/websocket-exec-client';

export interface GitResult {
  success: boolean;
  output: string;
  error?: string;
  branch?: string;
  exitCode: number;
}

export interface GitStreamResult extends GitResult {
  stream?: WebSocketExecClient;
  webSocketUri?: string;
  onData?: (data: string) => void;
  onError?: (error: string) => void;
}

export interface MergeResult extends GitResult {
  conflicts?: string[];
  merged: boolean;
}

export interface GitCommitInfo {
  hash: string;
  author: string;
  date: string;
  message: string;
}

export class ACIGitManager {
  private logger: Logger;
  private containerNameCache: Map<string, string> = new Map();

  constructor(private aciManager: AzureContainerManager) {
    this.logger = new Logger('ACIGitManager');
  }

  /**
   * Get container name for a context
   */
  private getContainerNameForContext(context: SegregationContext): string {
    const key = `${context.sessionId}-${context.projectId}-${context.taskId}`;
    if (!this.containerNameCache.has(key)) {
      this.containerNameCache.set(key, this.aciManager.getContainerName(context));
    }
    return this.containerNameCache.get(key)!;
  }

  /**
   * Initialize Git configuration for user
   */
  async setupGitUser(context: SegregationContext): Promise<void> {
    await this.executeGitCommand(context, 'config', [
      '--global', 'user.email', `${context.userId}@jupiter.ai`
    ]);
    
    await this.executeGitCommand(context, 'config', [
      '--global', 'user.name', `Jupiter User ${context.userId}`
    ]);

    // Set up useful Git aliases
    await this.executeGitCommand(context, 'config', [
      '--global', 'alias.co', 'checkout'
    ]);
    await this.executeGitCommand(context, 'config', [
      '--global', 'alias.br', 'branch'
    ]);
    await this.executeGitCommand(context, 'config', [
      '--global', 'alias.ci', 'commit'
    ]);
    await this.executeGitCommand(context, 'config', [
      '--global', 'alias.st', 'status'
    ]);
  }

  /**
   * Execute any Git command
   */
  async executeGitCommand(
    context: SegregationContext,
    command: string,
    args: string[] = [],
    workDir?: string
  ): Promise<GitResult> {
    const fullCommand = ['git', command, ...args];
    
    this.logger.info(`Executing Git command: ${fullCommand.join(' ')}`, { context });
    
    try {
      const containerName = this.getContainerNameForContext(context);
      const commandStr = fullCommand.join(' ');
      const cdCommand = workDir ? `cd ${workDir} && ${commandStr}` : commandStr;
      const result = await this.aciManager.executeCommand(
        containerName,
        cdCommand
      );
      
      const branch = command !== 'branch' ? await this.getCurrentBranch(context) : undefined;
      
      return {
        success: result.exitCode === 0,
        output: result.stdout,
        error: result.stderr,
        exitCode: result.exitCode,
        branch
      };
    } catch (error) {
      this.logger.error('Git command failed', error);
      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : 'Unknown error',
        exitCode: 1
      };
    }
  }

  /**
   * Execute Git command with streaming support
   */
  async executeGitCommandStream(
    context: SegregationContext,
    command: string,
    args: string[] = [],
    options?: {
      workDir?: string;
      onData?: (data: string) => void;
      onError?: (error: string) => void;
      timeout?: number;
    }
  ): Promise<GitStreamResult> {
    const fullCommand = ['git', command, ...args];
    
    this.logger.info(`Executing Git command with streaming: ${fullCommand.join(' ')}`, { context });
    
    try {
      // Get container name from context
      const containerName = this.getContainerNameForContext(context);
      
      // Execute command with streaming enabled
      const result = await this.aciManager.executeCommand(
        containerName,
        fullCommand.join(' ')
      );
      
      // If WebSocket URI is returned, create streaming client
      if (result.webSocketUri) {
        const wsClient = new WebSocketExecClient(result.webSocketUri, result.password || '');
        
        // Set up event handlers
        if (options?.onData) {
          wsClient.on('stdout', options.onData);
        }
        if (options?.onError) {
          wsClient.on('stderr', options.onError);
        }
        
        // Connect to WebSocket
        await wsClient.connect();
        
        // Execute the command through WebSocket
        const execResult = await wsClient.execute(fullCommand.join(' '), {
          timeout: options?.timeout,
          onData: options?.onData,
          onError: options?.onError
        });
        
        const branch = command !== 'branch' ? await this.getCurrentBranch(context) : undefined;
        
        return {
          success: execResult.exitCode === 0,
          output: execResult.stdout,
          error: execResult.stderr,
          exitCode: execResult.exitCode,
          branch,
          stream: wsClient,
          webSocketUri: result.webSocketUri
        };
      }
      
      // Fallback to non-streaming
      const branch = command !== 'branch' ? await this.getCurrentBranch(context) : undefined;
      
      return {
        success: result.exitCode === 0,
        output: result.stdout,
        error: result.stderr,
        exitCode: result.exitCode,
        branch
      };
    } catch (error) {
      this.logger.error('Git command stream failed', error);
      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : 'Unknown error',
        exitCode: 1
      };
    }
  }

  /**
   * Clone repository
   */
  async cloneRepository(
    context: SegregationContext,
    repoUrl: string,
    directory?: string,
    branch?: string
  ): Promise<GitResult> {
    const args = [repoUrl];
    
    if (directory) {
      args.push(directory);
    }
    
    if (branch) {
      args.push('-b', branch);
    }
    
    args.push('--depth', '1'); // Shallow clone for performance
    
    return this.executeGitCommand(context, 'clone', args);
  }

  /**
   * Clone repository with streaming output
   */
  async cloneRepositoryStream(
    context: SegregationContext,
    repoUrl: string,
    options?: {
      directory?: string;
      branch?: string;
      depth?: number;
      onProgress?: (data: string) => void;
      onError?: (error: string) => void;
    }
  ): Promise<GitStreamResult> {
    const args = [repoUrl];
    
    if (options?.directory) {
      args.push(options.directory);
    }
    
    if (options?.branch) {
      args.push('-b', options.branch);
    }
    
    args.push('--progress'); // Force progress output
    args.push('--depth', String(options?.depth || 1));
    
    return this.executeGitCommandStream(context, 'clone', args, {
      onData: options?.onProgress,
      onError: options?.onError
    });
  }

  /**
   * Create and checkout new branch
   */
  async createBranch(
    context: SegregationContext,
    branchName: string,
    baseBranch?: string
  ): Promise<GitResult> {
    if (baseBranch) {
      await this.executeGitCommand(context, 'checkout', [baseBranch]);
    }
    
    return this.executeGitCommand(context, 'checkout', ['-b', branchName]);
  }

  /**
   * Commit changes
   */
  async commit(
    context: SegregationContext,
    message: string,
    files?: string[]
  ): Promise<GitResult> {
    // Stage files
    if (files && files.length > 0) {
      await this.executeGitCommand(context, 'add', files);
    } else {
      await this.executeGitCommand(context, 'add', ['.']);
    }
    
    // Commit with message
    return this.executeGitCommand(context, 'commit', ['-m', message]);
  }

  /**
   * Push changes to remote
   */
  async push(
    context: SegregationContext,
    remote: string = 'origin',
    branch?: string,
    force: boolean = false
  ): Promise<GitResult> {
    const args = [remote];
    
    if (branch) {
      args.push(branch);
    }
    
    if (force) {
      args.push('--force');
    }
    
    return this.executeGitCommand(context, 'push', args);
  }

  /**
   * Push changes with streaming output
   */
  async pushStream(
    context: SegregationContext,
    options?: {
      remote?: string;
      branch?: string;
      force?: boolean;
      setUpstream?: boolean;
      onProgress?: (data: string) => void;
      onError?: (error: string) => void;
    }
  ): Promise<GitStreamResult> {
    const args = [options?.remote || 'origin'];
    
    if (options?.branch) {
      args.push(options.branch);
    }
    
    if (options?.force) {
      args.push('--force');
    }
    
    if (options?.setUpstream) {
      args.push('--set-upstream');
    }
    
    args.push('--progress'); // Force progress output
    
    return this.executeGitCommandStream(context, 'push', args, {
      onData: options?.onProgress,
      onError: options?.onError
    });
  }

  /**
   * Merge branches with different strategies
   */
  async mergeBranches(
    context: SegregationContext,
    sourceBranch: string,
    targetBranch: string,
    strategy: 'merge' | 'rebase' | 'squash' = 'merge'
  ): Promise<MergeResult> {
    // Checkout target branch
    await this.executeGitCommand(context, 'checkout', [targetBranch]);
    
    let result: GitResult;
    
    switch (strategy) {
      case 'rebase':
        result = await this.executeGitCommand(context, 'rebase', [sourceBranch]);
        break;
        
      case 'squash':
        result = await this.executeGitCommand(context, 'merge', ['--squash', sourceBranch]);
        if (result.success) {
          result = await this.commit(context, `Squashed merge from ${sourceBranch}`);
        }
        break;
        
      default:
        result = await this.executeGitCommand(context, 'merge', [sourceBranch]);
    }
    
    // Check for conflicts
    const conflicts = await this.getConflicts(context);
    
    return {
      ...result,
      merged: result.success,
      conflicts: conflicts.length > 0 ? conflicts : undefined
    };
  }

  /**
   * Cherry-pick commits
   */
  async cherryPick(
    context: SegregationContext,
    commitHashes: string[]
  ): Promise<GitResult> {
    return this.executeGitCommand(context, 'cherry-pick', commitHashes);
  }

  /**
   * Get commit history
   */
  async getCommitHistory(
    context: SegregationContext,
    limit: number = 10,
    branch?: string
  ): Promise<GitCommitInfo[]> {
    const args = [
      '--pretty=format:%H|%an|%ad|%s',
      `--max-count=${limit}`
    ];
    
    if (branch) {
      args.push(branch);
    }
    
    const result = await this.executeGitCommand(context, 'log', args);
    
    if (!result.success) {
      return [];
    }
    
    return result.output
      .split('\n')
      .filter(line => line.trim())
      .map(line => {
        const [hash, author, date, message] = line.split('|');
        return { hash, author, date, message };
      });
  }

  /**
   * Get file diff
   */
  async getDiff(
    context: SegregationContext,
    file?: string,
    cached: boolean = false
  ): Promise<string> {
    const args = [];
    
    if (cached) {
      args.push('--cached');
    }
    
    if (file) {
      args.push(file);
    }
    
    const result = await this.executeGitCommand(context, 'diff', args);
    return result.output;
  }

  /**
   * Stash changes
   */
  async stash(
    context: SegregationContext,
    message?: string,
    includeUntracked: boolean = true
  ): Promise<GitResult> {
    const args = ['push'];
    
    if (includeUntracked) {
      args.push('-u');
    }
    
    if (message) {
      args.push('-m', message);
    }
    
    return this.executeGitCommand(context, 'stash', args);
  }

  /**
   * Apply stash
   */
  async stashApply(
    context: SegregationContext,
    stashRef: string = 'stash@{0}'
  ): Promise<GitResult> {
    return this.executeGitCommand(context, 'stash', ['apply', stashRef]);
  }

  /**
   * Reset to commit
   */
  async reset(
    context: SegregationContext,
    commitRef: string,
    mode: 'soft' | 'mixed' | 'hard' = 'mixed'
  ): Promise<GitResult> {
    return this.executeGitCommand(context, 'reset', [`--${mode}`, commitRef]);
  }

  /**
   * Tag a commit
   */
  async createTag(
    context: SegregationContext,
    tagName: string,
    message?: string,
    commitRef?: string
  ): Promise<GitResult> {
    const args = [tagName];
    
    if (message) {
      args.push('-a', '-m', message);
    }
    
    if (commitRef) {
      args.push(commitRef);
    }
    
    return this.executeGitCommand(context, 'tag', args);
  }

  /**
   * Get current branch
   */
  async getCurrentBranch(context: SegregationContext): Promise<string> {
    const result = await this.executeGitCommand(context, 'branch', ['--show-current']);
    return result.output.trim();
  }

  /**
   * Get all branches
   */
  async getBranches(
    context: SegregationContext,
    remote: boolean = false
  ): Promise<string[]> {
    const args = remote ? ['-r'] : [];
    const result = await this.executeGitCommand(context, 'branch', args);
    
    return result.output
      .split('\n')
      .map(line => line.trim().replace('* ', ''))
      .filter(line => line);
  }

  /**
   * Get modified files
   */
  async getModifiedFiles(context: SegregationContext): Promise<string[]> {
    const result = await this.executeGitCommand(context, 'status', ['--porcelain']);
    
    return result.output
      .split('\n')
      .filter(line => line.trim())
      .map(line => line.substring(3)); // Remove status prefix
  }

  /**
   * Get conflicts
   */
  private async getConflicts(context: SegregationContext): Promise<string[]> {
    const result = await this.executeGitCommand(context, 'diff', ['--name-only', '--diff-filter=U']);
    
    return result.output
      .split('\n')
      .filter(line => line.trim());
  }

  /**
   * Configure SSH key for private repositories
   */
  async configureSshKey(
    context: SegregationContext,
    sshKey: string
  ): Promise<void> {
    const containerName = this.getContainerNameForContext(context);
    
    // Write SSH key to container
    await this.aciManager.executeCommand(
      containerName,
      'mkdir -p /root/.ssh'
    );
    
    await this.aciManager.executeCommand(
      containerName,
      `sh -c 'echo "${sshKey}" > /root/.ssh/id_rsa'`
    );
    
    await this.aciManager.executeCommand(
      containerName,
      'chmod 600 /root/.ssh/id_rsa'
    );
    
    // Configure SSH to skip host verification (for automation)
    await this.aciManager.executeCommand(
      containerName,
      'sh -c \'echo "Host *\n  StrictHostKeyChecking no\n  UserKnownHostsFile /dev/null" > /root/.ssh/config\''
    );
  }
}