/**
 * Git Terminal Service
 * Combines ACIGitManager, GitHubService, and WebSocketExecClient for complete Git workflows with streaming
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../utils/logger';
import { SegregationContext } from '../core/segregation-types';
import { AzureContainerManager } from '../azure/aci-manager';
import { ACIGitManager, GitStreamResult } from '../azure/aci-git-manager';
import { GitHubService, CreateRepoOptions, RepoInfo } from './github-service';
import { WebSocketExecClient } from './websocket-exec-client';
import { GitCommands } from '../tools/git-commands';

export interface GitTerminalSession {
  id: string;
  context: SegregationContext;
  containerName: string;
  webSocketUri?: string;
  wsClient?: WebSocketExecClient;
  githubConnected: boolean;
  currentDirectory: string;
  currentBranch?: string;
  remoteUrl?: string;
  createdAt: Date;
  lastActivity: Date;
  status: 'active' | 'idle' | 'disconnected';
}

export interface GitTerminalOptions {
  githubToken?: string;
  githubOrg?: string;
  defaultBranch?: string;
  workspaceDir?: string;
}

export interface GitWorkflowResult {
  success: boolean;
  message: string;
  details?: any;
  logs: string[];
}

export class GitTerminalService extends EventEmitter {
  private logger: Logger;
  private sessions: Map<string, GitTerminalSession> = new Map();
  private aciManager: AzureContainerManager;
  private gitManager: ACIGitManager;
  private githubService?: GitHubService;
  private workspaceDir: string;

  constructor(
    aciManager: AzureContainerManager,
    options?: GitTerminalOptions
  ) {
    super();
    this.logger = new Logger('GitTerminalService');
    this.aciManager = aciManager;
    this.gitManager = new ACIGitManager(aciManager);
    this.workspaceDir = options?.workspaceDir || '/workspace';

    if (options?.githubToken) {
      this.githubService = new GitHubService({
        token: options.githubToken,
        org: options.githubOrg,
        defaultBranch: options.defaultBranch || 'main'
      });
    }
  }

  /**
   * Create a new Git terminal session
   */
  async createSession(context: SegregationContext): Promise<GitTerminalSession> {
    const sessionId = uuidv4();
    
    this.logger.info('Creating Git terminal session', { sessionId, context });

    // Get or create container
    const container = await this.aciManager.getOrCreateContainer(context, {
      image: 'node:18',
      memoryGB: 1.5,
      exposedPorts: []
    });
    const containerName = this.aciManager.getContainerName(context);

    // Set up Git user
    await this.gitManager.setupGitUser(context);

    const session: GitTerminalSession = {
      id: sessionId,
      context,
      containerName,
      githubConnected: !!this.githubService,
      currentDirectory: this.workspaceDir,
      createdAt: new Date(),
      lastActivity: new Date(),
      status: 'active'
    };

    this.sessions.set(sessionId, session);
    this.emit('sessionCreated', session);

    return session;
  }

  /**
   * Execute command in session with streaming
   */
  async execute(
    sessionId: string,
    command: string,
    options?: {
      stream?: boolean;
      timeout?: number;
      onData?: (data: string) => void;
      onError?: (error: string) => void;
    }
  ): Promise<{ success: boolean; output: string; exitCode: number }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    session.lastActivity = new Date();

    // Execute with streaming if requested
    if (options?.stream) {
      const result = await this.aciManager.executeCommand(
        session.containerName,
        command
      );

      if (result.webSocketUri) {
        // Create WebSocket client for streaming
        const wsClient = new WebSocketExecClient(result.webSocketUri, result.password || '');
        session.wsClient = wsClient;
        session.webSocketUri = result.webSocketUri;

        // Set up event handlers
        if (options.onData) {
          wsClient.on('stdout', options.onData);
        }
        if (options.onError) {
          wsClient.on('stderr', options.onError);
        }

        // Connect and execute
        await wsClient.connect();
        const execResult = await wsClient.execute(command, {
          timeout: options.timeout,
          onData: options.onData,
          onError: options.onError
        });

        return {
          success: execResult.exitCode === 0,
          output: execResult.stdout,
          exitCode: execResult.exitCode
        };
      }
    }

    // Non-streaming execution
    const cmdWithDir = session.currentDirectory !== this.workspaceDir ? 
      `cd ${session.currentDirectory} && ${command}` : 
      command;
    const result = await this.aciManager.executeCommand(
      session.containerName,
      cmdWithDir
    );

    return {
      success: result.exitCode === 0,
      output: result.stdout,
      exitCode: result.exitCode
    };
  }

  /**
   * Create a new project repository
   */
  async createProjectRepo(
    sessionId: string,
    options: {
      name: string;
      description?: string;
      private?: boolean;
      template?: string;
      onOutput?: (data: string) => void;
    }
  ): Promise<GitWorkflowResult> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const logs: string[] = [];
    const log = (message: string) => {
      logs.push(message);
      this.logger.info(message);
      if (options.onOutput) options.onOutput(message + '\n');
    };

    try {
      // Step 1: Create GitHub repository
      log(`Creating GitHub repository: ${options.name}`);
      
      if (!this.githubService) {
        throw new Error('GitHub service not configured');
      }

      const repoInfo = await this.githubService.createRepository({
        name: options.name,
        description: options.description,
        private: options.private ?? true,
        autoInit: false // We'll initialize it ourselves
      });

      session.remoteUrl = repoInfo.cloneUrl;
      log(`Repository created: ${repoInfo.fullName}`);

      // Step 2: Initialize local repository
      const projectDir = `${session.currentDirectory}/${options.name}`;
      
      log('Initializing local repository...');
      await this.execute(sessionId, `mkdir -p ${projectDir}`);
      await this.execute(sessionId, `cd ${projectDir}`);
      session.currentDirectory = projectDir;

      await this.execute(sessionId, 'git init', {
        stream: true,
        onData: options.onOutput
      });

      // Step 3: Add remote
      log('Adding remote origin...');
      await this.execute(sessionId, `git remote add origin ${repoInfo.cloneUrl}`, {
        stream: true,
        onData: options.onOutput
      });

      // Step 4: Create initial files
      log('Creating initial files...');
      
      if (options.template) {
        // Use template
        await this.applyTemplate(sessionId, options.template, options.onOutput);
      } else {
        // Create basic README
        await this.execute(sessionId, `echo "# ${options.name}" > README.md`);
        await this.execute(sessionId, `echo "${options.description || ''}" >> README.md`);
      }

      // Step 5: Initial commit
      log('Creating initial commit...');
      await this.execute(sessionId, 'git add .', {
        stream: true,
        onData: options.onOutput
      });

      await this.execute(sessionId, 'git commit -m "Initial commit"', {
        stream: true,
        onData: options.onOutput
      });

      // Step 6: Push to GitHub
      log('Pushing to GitHub...');
      await this.execute(sessionId, 'git branch -M main');
      await this.execute(sessionId, 'git push -u origin main', {
        stream: true,
        onData: options.onOutput
      });

      session.currentBranch = 'main';
      log('Project repository created successfully!');

      return {
        success: true,
        message: `Repository ${options.name} created successfully`,
        details: {
          repoUrl: repoInfo.cloneUrl,
          localPath: projectDir
        },
        logs
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      log(`Error: ${errorMessage}`);
      
      return {
        success: false,
        message: `Failed to create repository: ${errorMessage}`,
        logs
      };
    }
  }

  /**
   * Create and checkout feature branch
   */
  async createFeatureBranch(
    sessionId: string,
    branchName: string,
    options?: {
      fromBranch?: string;
      push?: boolean;
      onOutput?: (data: string) => void;
    }
  ): Promise<GitWorkflowResult> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const logs: string[] = [];
    const log = (message: string) => {
      logs.push(message);
      if (options?.onOutput) options.onOutput(message + '\n');
    };

    try {
      // Checkout base branch
      if (options?.fromBranch) {
        log(`Checking out base branch: ${options.fromBranch}`);
        await this.execute(sessionId, `git checkout ${options.fromBranch}`, {
          stream: true,
          onData: options?.onOutput
        });
      }

      // Create and checkout new branch
      log(`Creating feature branch: ${branchName}`);
      const result = await this.gitManager.createBranch(session.context, branchName);
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to create branch');
      }

      session.currentBranch = branchName;

      // Push to remote if requested
      if (options?.push) {
        log('Pushing branch to remote...');
        await this.gitManager.pushStream(session.context, {
          branch: branchName,
          setUpstream: true,
          onProgress: options.onOutput
        });
      }

      return {
        success: true,
        message: `Feature branch ${branchName} created`,
        details: { branch: branchName },
        logs
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      log(`Error: ${errorMessage}`);
      
      return {
        success: false,
        message: `Failed to create branch: ${errorMessage}`,
        logs
      };
    }
  }

  /**
   * Commit and push changes
   */
  async commitAndPush(
    sessionId: string,
    message: string,
    options?: {
      files?: string[];
      push?: boolean;
      onOutput?: (data: string) => void;
    }
  ): Promise<GitWorkflowResult> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const logs: string[] = [];
    const log = (message: string) => {
      logs.push(message);
      if (options?.onOutput) options.onOutput(message + '\n');
    };

    try {
      // Stage files
      log('Staging files...');
      const stageCommand = options?.files 
        ? GitCommands.commit.stage(options.files)
        : GitCommands.commit.stageAll();
      
      await this.execute(sessionId, stageCommand, {
        stream: true,
        onData: options?.onOutput
      });

      // Commit
      log(`Committing: ${message}`);
      await this.execute(sessionId, GitCommands.commit.create(message), {
        stream: true,
        onData: options?.onOutput
      });

      // Push if requested
      if (options?.push !== false) {
        log('Pushing to remote...');
        const pushResult = await this.gitManager.pushStream(session.context, {
          branch: session.currentBranch,
          onProgress: options?.onOutput
        });

        if (!pushResult.success) {
          throw new Error(pushResult.error || 'Push failed');
        }
      }

      return {
        success: true,
        message: 'Changes committed and pushed',
        logs
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      log(`Error: ${errorMessage}`);
      
      return {
        success: false,
        message: `Failed to commit: ${errorMessage}`,
        logs
      };
    }
  }

  /**
   * Create pull request
   */
  async createPullRequest(
    sessionId: string,
    options: {
      title: string;
      body?: string;
      draft?: boolean;
      labels?: string[];
      onOutput?: (data: string) => void;
    }
  ): Promise<GitWorkflowResult> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const logs: string[] = [];
    const log = (message: string) => {
      logs.push(message);
      if (options.onOutput) options.onOutput(message + '\n');
    };

    try {
      log('Creating pull request...');
      
      // Use GitHub CLI
      const prCommand = GitCommands.github.pr.create(
        options.title,
        options.body,
        options.draft
      );

      const result = await this.execute(sessionId, prCommand, {
        stream: true,
        onData: options.onOutput
      });

      if (!result.success) {
        throw new Error('Failed to create pull request');
      }

      // Extract PR URL from output
      const prUrlMatch = result.output.match(/https:\/\/github\.com\/[\w-]+\/[\w-]+\/pull\/\d+/);
      const prUrl = prUrlMatch ? prUrlMatch[0] : undefined;

      log('Pull request created successfully!');

      return {
        success: true,
        message: 'Pull request created',
        details: { 
          prUrl,
          title: options.title 
        },
        logs
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      log(`Error: ${errorMessage}`);
      
      return {
        success: false,
        message: `Failed to create PR: ${errorMessage}`,
        logs
      };
    }
  }

  /**
   * Get terminal WebSocket for direct interaction
   */
  async getTerminalWebSocket(sessionId: string): Promise<{
    webSocketUri: string;
    password: string;
  }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Get a fresh WebSocket connection
    const result = await this.aciManager.executeCommand(
      session.containerName,
      '/bin/bash' // Start interactive shell
    );

    if (!result.webSocketUri) {
      throw new Error('Failed to get WebSocket URI');
    }

    return {
      webSocketUri: result.webSocketUri,
      password: result.password || ''
    };
  }

  /**
   * Apply project template
   */
  private async applyTemplate(
    sessionId: string,
    template: string,
    onOutput?: (data: string) => void
  ): Promise<void> {
    // This would apply various project templates
    // For now, just create a basic structure
    const commands = [
      'echo "# Project" > README.md',
      'echo "node_modules/" > .gitignore',
      'echo "dist/" >> .gitignore',
      'echo ".env" >> .gitignore',
      'mkdir -p src tests docs',
      'echo "{}" > package.json'
    ];

    for (const cmd of commands) {
      await this.execute(sessionId, cmd, {
        stream: true,
        onData: onOutput
      });
    }
  }

  /**
   * Close session
   */
  async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    // Close WebSocket if active
    if (session.wsClient) {
      session.wsClient.close();
    }

    // Update status
    session.status = 'disconnected';
    this.sessions.delete(sessionId);
    
    this.emit('sessionClosed', session);
    this.logger.info('Git terminal session closed', { sessionId });
  }

  /**
   * Get session info
   */
  getSession(sessionId: string): GitTerminalSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * List active sessions
   */
  listSessions(): GitTerminalSession[] {
    return Array.from(this.sessions.values());
  }
}