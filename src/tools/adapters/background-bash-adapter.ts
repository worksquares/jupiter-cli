/**
 * Background Bash Tool Adapter
 * Provides tool interface for managing background bash shells
 */

import { BaseToolAdapter } from '../base-adapter';
import { BackgroundShellManager } from '../../shells/shell-manager';
import { ShellStatus, ShellListItem } from '../../shells/types';
import { z } from 'zod';

// Input schemas
const CreateShellSchema = z.object({
  command: z.string().describe('The bash command to execute'),
  cwd: z.string().optional().describe('Working directory for the command'),
  env: z.record(z.string()).optional().describe('Environment variables'),
  timeout: z.number().optional().describe('Timeout in milliseconds')
});

const KillShellSchema = z.object({
  shellId: z.string().describe('ID of the shell to kill'),
  reason: z.string().optional().describe('Reason for killing the shell')
});

const GetShellOutputSchema = z.object({
  shellId: z.string().describe('ID of the shell to get output from')
});

const ExecuteCommandSchema = z.object({
  command: z.string().describe('The bash command to execute'),
  shellId: z.string().optional().describe('Existing shell ID to execute in (creates new if not provided)')
});

// Result types
interface CreateShellResult {
  shellId: string;
  command: string;
  status: ShellStatus;
  pid?: number;
  message: string;
}

interface ShellOutputResult {
  shellId: string;
  output: string;
  error?: string;
  exitCode?: number;
  status: ShellStatus;
  hasMore: boolean;
}

interface ListShellsResult {
  shells: ShellListItem[];
  running: number;
  completed: number;
  failed: number;
}

export class BackgroundBashAdapter extends BaseToolAdapter {
  name = 'backgroundBash';
  description = 'Manage background bash shells for long-running commands';
  
  private shellManager: BackgroundShellManager;
  
  parameters = {
    action: {
      type: 'string' as const,
      description: 'Action to perform: create, execute, kill, list, output, clear',
      required: true,
      enum: ['create', 'execute', 'kill', 'list', 'output', 'clear']
    },
    // Parameters for different actions are handled dynamically
  };

  constructor(shellManager?: BackgroundShellManager) {
    super();
    this.shellManager = shellManager || new BackgroundShellManager();
  }

  async execute(params: any): Promise<any> {
    const { action, ...actionParams } = params;

    switch (action) {
      case 'create':
        return this.createShell(actionParams);
      
      case 'execute':
        return this.executeCommand(actionParams);
      
      case 'kill':
        return this.killShell(actionParams);
      
      case 'list':
        return this.listShells();
      
      case 'output':
        return this.getShellOutput(actionParams);
      
      case 'clear':
        return this.clearCompletedShells();
      
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  /**
   * Create a new background shell
   */
  private async createShell(params: any): Promise<CreateShellResult> {
    try {
      const validated = CreateShellSchema.parse(params);
      const shell = await this.shellManager.createShell(validated);

      return {
        shellId: shell.id,
        command: shell.command,
        status: shell.status,
        pid: shell.pid,
        message: `Created background shell ${shell.id}`
      } as CreateShellResult;
    } catch (error) {
      throw new Error(`Failed to create shell: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Execute a command
   */
  private async executeCommand(params: any): Promise<any> {
    try {
      const validated = ExecuteCommandSchema.parse(params);
      const result = await this.shellManager.executeCommand(
        validated.command,
        validated.shellId
      );

      return {
        shellId: result.id,
        success: result.success,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        runtime: result.runtime,
        killed: result.killed,
        message: result.success 
          ? `Command completed successfully (exit code: ${result.exitCode})`
          : `Command failed (exit code: ${result.exitCode})`
      };
    } catch (error) {
      throw new Error(`Failed to execute command: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Kill a running shell
   */
  private async killShell(params: any): Promise<any> {
    try {
      const validated = KillShellSchema.parse(params);
      await this.shellManager.killShell(validated.shellId, validated.reason);

      return {
        shellId: validated.shellId,
        message: `Shell ${validated.shellId} has been killed`
      };
    } catch (error) {
      throw new Error(`Failed to kill shell: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * List all shells
   */
  private async listShells(): Promise<ListShellsResult> {
    const shells = this.shellManager.listShells();
    
    const running = shells.filter(s => s.status === ShellStatus.Running).length;
    const completed = shells.filter(s => s.status === ShellStatus.Completed).length;
    const failed = shells.filter(s => s.status === ShellStatus.Failed).length;

    return {
      shells,
      running,
      completed,
      failed
    } as ListShellsResult;
  }

  /**
   * Get shell output
   */
  private async getShellOutput(params: any): Promise<ShellOutputResult> {
    try {
      const validated = GetShellOutputSchema.parse(params);
      const shell = this.shellManager.getShell(validated.shellId);
      
      if (!shell) {
        throw new Error(`Shell not found: ${validated.shellId}`);
      }

      const output = this.shellManager.getShellOutput(validated.shellId);

      return {
        shellId: validated.shellId,
        output: output.stdout,
        error: output.stderr || undefined,
        exitCode: shell!.exitCode,
        status: shell!.status,
        hasMore: (output as any).hasMore || false
      } as ShellOutputResult;
    } catch (error) {
      throw new Error(`Failed to get shell output: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Clear completed shells
   */
  private async clearCompletedShells(): Promise<any> {
    this.shellManager.clearCompletedShells();
    
    return {
      message: 'Cleared all completed shells'
    };
  }

  validate(params: any): boolean {
    if (!params.action) {
      return false;
    }

    const validActions = ['create', 'execute', 'kill', 'list', 'output', 'clear'];
    if (!validActions.includes(params.action)) {
      return false;
    }

    // Additional validation based on action
    switch (params.action) {
      case 'create':
      case 'execute':
        return !!params.command;
      
      case 'kill':
      case 'output':
        return !!params.shellId;
      
      case 'list':
      case 'clear':
        return true;
      
      default:
        return false;
    }
  }

  /**
   * Get the shell manager instance
   */
  getShellManager(): BackgroundShellManager {
    return this.shellManager;
  }
}