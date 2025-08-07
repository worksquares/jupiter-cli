/**
 * Background Shell Manager
 * Manages creation, execution, and lifecycle of background bash shells
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'eventemitter3';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../utils/logger';
import {
  BackgroundShell,
  BackgroundShellConfig,
  ShellStatus,
  ShellExecutionResult,
  ShellEventType,
  ShellManagerConfig,
  ShellListItem,
  ShellOutputChunk
} from './types';

export class BackgroundShellManager {
  private shells: Map<string, BackgroundShell> = new Map();
  private logger: Logger;
  private config: Required<ShellManagerConfig>;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(config: ShellManagerConfig = {}) {
    this.logger = new Logger('ShellManager');
    this.config = {
      maxConcurrentShells: config.maxConcurrentShells || 10,
      defaultTimeout: config.defaultTimeout || 600000, // 10 minutes
      maxOutputSize: config.maxOutputSize || 1048576, // 1MB
      cleanupInterval: config.cleanupInterval || 60000, // 1 minute
      persistShells: config.persistShells || false,
      shellHistoryLimit: config.shellHistoryLimit || 100
    };

    this.startCleanupTimer();
  }

  /**
   * Create and start a new background shell
   */
  async createShell(config: Omit<BackgroundShellConfig, 'id'>): Promise<BackgroundShell> {
    const shellId = uuidv4();
    
    // Check concurrent shell limit
    const runningShells = this.getRunningShells();
    if (runningShells.length >= this.config.maxConcurrentShells) {
      throw new Error(`Maximum concurrent shells (${this.config.maxConcurrentShells}) reached`);
    }

    const shell: BackgroundShell = {
      id: shellId,
      command: config.command,
      status: ShellStatus.Running,
      stdout: '',
      stderr: '',
      startTime: new Date(),
      runtime: 0,
      eventEmitter: new EventEmitter()
    };

    try {
      // Spawn the process
      const proc = spawn('bash', ['-c', config.command], {
        cwd: config.cwd || process.cwd(),
        env: { ...process.env, ...config.env },
        detached: false
      });

      shell.process = proc;
      shell.pid = proc.pid;

      // Set up output handlers
      this.setupOutputHandlers(shell, proc);

      // Set up timeout if specified
      if (config.timeout || this.config.defaultTimeout) {
        const timeout = config.timeout || this.config.defaultTimeout;
        setTimeout(() => {
          if (shell.status === ShellStatus.Running) {
            this.killShell(shellId, 'Timeout');
          }
        }, timeout);
      }

      // Handle process completion
      proc.on('close', (code) => {
        this.handleShellCompletion(shell, code);
      });

      proc.on('error', (error) => {
        this.handleShellError(shell, error);
      });

      this.shells.set(shellId, shell);
      shell.eventEmitter.emit(ShellEventType.Started, { shellId });
      
      this.logger.info(`Created shell ${shellId}: ${config.command}`);
      return shell;

    } catch (error) {
      shell.status = ShellStatus.Failed;
      shell.endTime = new Date();
      shell.runtime = shell.endTime.getTime() - shell.startTime.getTime();
      
      this.shells.set(shellId, shell);
      throw error;
    }
  }

  /**
   * Execute a command in an existing shell or create a new one
   */
  async executeCommand(command: string, shellId?: string): Promise<ShellExecutionResult> {
    if (shellId) {
      // Execute in existing shell
      const shell = this.shells.get(shellId);
      if (!shell) {
        throw new Error(`Shell not found: ${shellId}`);
      }

      if (shell.status !== ShellStatus.Running) {
        throw new Error(`Shell ${shellId} is not running (status: ${shell.status})`);
      }

      // For persistent shells, we'd need a different approach
      // For now, we'll create a new shell for each command
      this.logger.warn('Executing in existing shell not yet supported, creating new shell');
    }

    // Create new shell for command
    const shell = await this.createShell({ command });
    
    return new Promise((resolve) => {
      const checkCompletion = setInterval(() => {
        const updatedShell = this.shells.get(shell.id);
        if (!updatedShell || updatedShell.status !== ShellStatus.Running) {
          clearInterval(checkCompletion);
          
          const result: ShellExecutionResult = {
            id: shell.id,
            success: updatedShell?.exitCode === 0,
            exitCode: updatedShell?.exitCode,
            stdout: updatedShell?.stdout || '',
            stderr: updatedShell?.stderr || '',
            runtime: updatedShell?.runtime || 0,
            killed: updatedShell?.status === ShellStatus.Killed
          };
          
          resolve(result);
        }
      }, 100);
    });
  }

  /**
   * Kill a running shell
   */
  async killShell(shellId: string, reason?: string): Promise<void> {
    const shell = this.shells.get(shellId);
    if (!shell) {
      throw new Error(`Shell not found: ${shellId}`);
    }

    if (shell.status !== ShellStatus.Running) {
      throw new Error(`Shell ${shellId} is not running`);
    }

    if (shell.process) {
      try {
        // Try graceful shutdown first
        shell.process.kill('SIGTERM');
        
        // Give it 5 seconds to terminate gracefully
        setTimeout(() => {
          if (shell.process && !shell.process.killed) {
            shell.process.kill('SIGKILL');
          }
        }, 5000);

        shell.status = ShellStatus.Killed;
        shell.endTime = new Date();
        shell.runtime = shell.endTime.getTime() - shell.startTime.getTime();
        
        shell.eventEmitter.emit(ShellEventType.Killed, { 
          shellId, 
          reason: reason || 'User requested' 
        });
        
        this.logger.info(`Killed shell ${shellId}: ${reason || 'User requested'}`);
      } catch (error) {
        this.logger.error(`Failed to kill shell ${shellId}`, error);
        throw error;
      }
    }
  }

  /**
   * Get shell by ID
   */
  getShell(shellId: string): BackgroundShell | undefined {
    return this.shells.get(shellId);
  }

  /**
   * List all shells
   */
  listShells(): ShellListItem[] {
    return Array.from(this.shells.values()).map(shell => ({
      id: shell.id,
      command: shell.command,
      status: shell.status,
      runtime: shell.runtime,
      startTime: shell.startTime,
      exitCode: shell.exitCode
    }));
  }

  /**
   * Get running shells
   */
  getRunningShells(): BackgroundShell[] {
    return Array.from(this.shells.values()).filter(
      shell => shell.status === ShellStatus.Running
    );
  }

  /**
   * Get shell output (stdout + stderr)
   */
  getShellOutput(shellId: string): { stdout: string; stderr: string } {
    const shell = this.shells.get(shellId);
    if (!shell) {
      throw new Error(`Shell not found: ${shellId}`);
    }

    return {
      stdout: shell.stdout,
      stderr: shell.stderr
    };
  }

  /**
   * Stream shell output
   */
  streamShellOutput(shellId: string, callback: (chunk: ShellOutputChunk) => void): () => void {
    const shell = this.shells.get(shellId);
    if (!shell) {
      throw new Error(`Shell not found: ${shellId}`);
    }

    const outputHandler = (data: ShellOutputChunk) => {
      callback(data);
    };

    shell.eventEmitter.on(ShellEventType.Output, outputHandler);

    // Return unsubscribe function
    return () => {
      shell.eventEmitter.off(ShellEventType.Output, outputHandler);
    };
  }

  /**
   * Clear completed shells
   */
  clearCompletedShells(): void {
    const completed = Array.from(this.shells.values()).filter(
      shell => shell.status !== ShellStatus.Running
    );

    for (const shell of completed) {
      this.shells.delete(shell.id);
    }

    this.logger.info(`Cleared ${completed.length} completed shells`);
  }

  /**
   * Shutdown manager and kill all running shells
   */
  async shutdown(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    const runningShells = this.getRunningShells();
    
    await Promise.all(
      runningShells.map(shell => 
        this.killShell(shell.id, 'Manager shutdown').catch(err => 
          this.logger.error(`Failed to kill shell ${shell.id} during shutdown`, err)
        )
      )
    );

    this.shells.clear();
    this.logger.info('Shell manager shutdown complete');
  }

  /**
   * Set up output handlers for a shell process
   */
  private setupOutputHandlers(shell: BackgroundShell, proc: ChildProcess): void {
    const maxSize = this.config.maxOutputSize;

    // Handle stdout
    proc.stdout?.on('data', (data) => {
      const chunk = data.toString();
      
      if (shell.stdout.length + chunk.length <= maxSize) {
        shell.stdout += chunk;
      } else {
        const remaining = maxSize - shell.stdout.length;
        if (remaining > 0) {
          shell.stdout += chunk.substring(0, remaining);
          shell.stdout += '\n[Output truncated...]';
        }
      }

      shell.eventEmitter.emit(ShellEventType.Output, {
        type: 'stdout',
        data: chunk,
        timestamp: new Date()
      });
    });

    // Handle stderr
    proc.stderr?.on('data', (data) => {
      const chunk = data.toString();
      
      if (shell.stderr.length + chunk.length <= maxSize) {
        shell.stderr += chunk;
      } else {
        const remaining = maxSize - shell.stderr.length;
        if (remaining > 0) {
          shell.stderr += chunk.substring(0, remaining);
          shell.stderr += '\n[Output truncated...]';
        }
      }

      shell.eventEmitter.emit(ShellEventType.Output, {
        type: 'stderr',
        data: chunk,
        timestamp: new Date()
      });
    });
  }

  /**
   * Handle shell completion
   */
  private handleShellCompletion(shell: BackgroundShell, code: number | null): void {
    shell.status = code === 0 ? ShellStatus.Completed : ShellStatus.Failed;
    shell.exitCode = code || undefined;
    shell.endTime = new Date();
    shell.runtime = shell.endTime.getTime() - shell.startTime.getTime();
    
    shell.eventEmitter.emit(ShellEventType.Completed, {
      shellId: shell.id,
      exitCode: code
    });

    this.logger.info(`Shell ${shell.id} completed with code ${code}`);

    // Clean up process reference
    delete shell.process;
  }

  /**
   * Handle shell error
   */
  private handleShellError(shell: BackgroundShell, error: Error): void {
    shell.status = ShellStatus.Failed;
    shell.endTime = new Date();
    shell.runtime = shell.endTime.getTime() - shell.startTime.getTime();
    shell.stderr += `\nError: ${error.message}`;
    
    shell.eventEmitter.emit(ShellEventType.Error, {
      shellId: shell.id,
      error
    });

    this.logger.error(`Shell ${shell.id} error`, error);

    // Clean up process reference
    delete shell.process;
  }

  /**
   * Start cleanup timer
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.performCleanup();
    }, this.config.cleanupInterval);
  }

  /**
   * Perform periodic cleanup
   */
  private performCleanup(): void {
    // Remove old completed shells beyond history limit
    const completed = Array.from(this.shells.values())
      .filter(shell => shell.status !== ShellStatus.Running)
      .sort((a, b) => (b.endTime?.getTime() || 0) - (a.endTime?.getTime() || 0));

    if (completed.length > this.config.shellHistoryLimit) {
      const toRemove = completed.slice(this.config.shellHistoryLimit);
      for (const shell of toRemove) {
        this.shells.delete(shell.id);
      }
      
      if (toRemove.length > 0) {
        this.logger.debug(`Cleaned up ${toRemove.length} old shells`);
      }
    }

    // Update runtime for running shells
    const running = this.getRunningShells();
    for (const shell of running) {
      shell.runtime = Date.now() - shell.startTime.getTime();
    }
  }
}