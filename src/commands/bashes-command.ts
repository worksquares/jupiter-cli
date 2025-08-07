/**
 * Bashes Command
 * User-friendly command interface for managing background bash shells
 */

import { Agent } from '../core/agent';
import { BackgroundShellManager } from '../shells/shell-manager';
import { ShellStatus } from '../shells/types';
import { Command } from './types';

export class BashesCommand implements Command {
  name = 'bashes';
  description = 'List and manage background bash shells';
  
  private shellManager: BackgroundShellManager;

  constructor(_agent: Agent, shellManager?: BackgroundShellManager) {
    this.shellManager = shellManager || new BackgroundShellManager();
  }

  async execute(args: string[]): Promise<string> {
    const subcommand = args[0] || 'list';

    switch (subcommand) {
      case 'list':
        return this.listShells();
      
      case 'create':
        return this.createShell(args.slice(1).join(' '));
      
      case 'kill':
        return this.killShell(args[1], args.slice(2).join(' '));
      
      case 'output':
        return this.showOutput(args[1]);
      
      case 'clear':
        return this.clearShells();
      
      case 'help':
      default:
        return this.showHelp();
    }
  }

  /**
   * List all shells
   */
  private async listShells(): Promise<string> {
    const shells = this.shellManager.listShells();
    
    if (shells.length === 0) {
      return 'No background shells currently running or completed.';
    }

    const lines: string[] = ['Background Bash Shells:', ''];
    
    // Group by status
    const running = shells.filter(s => s.status === ShellStatus.Running);
    const completed = shells.filter(s => s.status === ShellStatus.Completed);
    const failed = shells.filter(s => s.status === ShellStatus.Failed);
    const killed = shells.filter(s => s.status === ShellStatus.Killed);

    if (running.length > 0) {
      lines.push('RUNNING:');
      running.forEach(shell => {
        const runtime = this.formatRuntime(shell.runtime);
        lines.push(`  [${shell.id.substring(0, 8)}] ${this.truncateCommand(shell.command)} (${runtime})`);
      });
      lines.push('');
    }

    if (completed.length > 0) {
      lines.push('COMPLETED:');
      completed.forEach(shell => {
        const runtime = this.formatRuntime(shell.runtime);
        lines.push(`  [${shell.id.substring(0, 8)}] ${this.truncateCommand(shell.command)} (exit: ${shell.exitCode}, ${runtime})`);
      });
      lines.push('');
    }

    if (failed.length > 0) {
      lines.push('FAILED:');
      failed.forEach(shell => {
        const runtime = this.formatRuntime(shell.runtime);
        lines.push(`  [${shell.id.substring(0, 8)}] ${this.truncateCommand(shell.command)} (exit: ${shell.exitCode}, ${runtime})`);
      });
      lines.push('');
    }

    if (killed.length > 0) {
      lines.push('KILLED:');
      killed.forEach(shell => {
        const runtime = this.formatRuntime(shell.runtime);
        lines.push(`  [${shell.id.substring(0, 8)}] ${this.truncateCommand(shell.command)} (${runtime})`);
      });
      lines.push('');
    }

    lines.push(`Total: ${shells.length} shells (${running.length} running, ${completed.length} completed, ${failed.length} failed, ${killed.length} killed)`);

    return lines.join('\n');
  }

  /**
   * Create a new shell
   */
  private async createShell(command: string): Promise<string> {
    if (!command) {
      return 'Error: No command provided. Usage: bashes create <command>';
    }

    try {
      const shell = await this.shellManager.createShell({ command });
      return `Created background shell ${shell.id.substring(0, 8)} for command: ${command}\nPID: ${shell.pid}`;
    } catch (error) {
      return `Error creating shell: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /**
   * Kill a shell
   */
  private async killShell(shellId: string, reason?: string): Promise<string> {
    if (!shellId) {
      return 'Error: No shell ID provided. Usage: bashes kill <shell-id> [reason]';
    }

    try {
      // Handle short ID
      const fullId = this.findShellByShortId(shellId);
      if (!fullId) {
        return `Error: Shell not found: ${shellId}`;
      }

      await this.shellManager.killShell(fullId, reason);
      return `Killed shell ${shellId}${reason ? ` (reason: ${reason})` : ''}`;
    } catch (error) {
      return `Error killing shell: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /**
   * Show shell output
   */
  private async showOutput(shellId: string): Promise<string> {
    if (!shellId) {
      return 'Error: No shell ID provided. Usage: bashes output <shell-id>';
    }

    try {
      // Handle short ID
      const fullId = this.findShellByShortId(shellId);
      if (!fullId) {
        return `Error: Shell not found: ${shellId}`;
      }

      const shell = this.shellManager.getShell(fullId);
      if (!shell) {
        return `Error: Shell not found: ${shellId}`;
      }

      const output = this.shellManager.getShellOutput(fullId);
      const lines: string[] = [
        `Shell ${shellId} Output:`,
        `Command: ${shell.command}`,
        `Status: ${shell.status}`,
        `Runtime: ${this.formatRuntime(shell.runtime)}`,
        ''
      ];

      if (shell.exitCode !== undefined) {
        lines.push(`Exit Code: ${shell.exitCode}`, '');
      }

      if (output.stdout) {
        lines.push('STDOUT:', '---', output.stdout, '---', '');
      } else {
        lines.push('STDOUT: (empty)', '');
      }

      if (output.stderr) {
        lines.push('STDERR:', '---', output.stderr, '---');
      } else {
        lines.push('STDERR: (empty)');
      }

      return lines.join('\n');
    } catch (error) {
      return `Error getting shell output: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /**
   * Clear completed shells
   */
  private async clearShells(): Promise<string> {
    this.shellManager.clearCompletedShells();
    return 'Cleared all completed shells.';
  }

  /**
   * Show help
   */
  private showHelp(): string {
    return `
Bashes Command - Manage background bash shells

Usage:
  bashes [subcommand] [args]

Subcommands:
  list              List all shells (default)
  create <command>  Create a new background shell
  kill <id> [reason] Kill a running shell
  output <id>       Show shell output
  clear             Clear all completed shells
  help              Show this help message

Examples:
  bashes                          # List all shells
  bashes create npm run build     # Create a background build process
  bashes kill abc12345           # Kill shell with ID starting with abc12345
  bashes output abc12345         # Show output from shell
  bashes clear                   # Remove all completed shells

Note: Shell IDs can be shortened to the first 8 characters.
`.trim();
  }

  /**
   * Find shell by short ID
   */
  private findShellByShortId(shortId: string): string | null {
    const shells = this.shellManager.listShells();
    const matches = shells.filter(s => s.id.startsWith(shortId));
    
    if (matches.length === 1) {
      return matches[0].id;
    } else if (matches.length > 1) {
      throw new Error(`Ambiguous shell ID: ${shortId} matches ${matches.length} shells`);
    }
    
    return null;
  }

  /**
   * Truncate command for display
   */
  private truncateCommand(command: string, maxLength: number = 50): string {
    if (command.length <= maxLength) {
      return command;
    }
    return command.substring(0, maxLength - 3) + '...';
  }

  /**
   * Format runtime duration
   */
  private formatRuntime(ms: number): string {
    if (ms < 1000) {
      return `${ms}ms`;
    } else if (ms < 60000) {
      return `${(ms / 1000).toFixed(1)}s`;
    } else if (ms < 3600000) {
      const minutes = Math.floor(ms / 60000);
      const seconds = Math.floor((ms % 60000) / 1000);
      return `${minutes}m ${seconds}s`;
    } else {
      const hours = Math.floor(ms / 3600000);
      const minutes = Math.floor((ms % 3600000) / 60000);
      return `${hours}h ${minutes}m`;
    }
  }
}