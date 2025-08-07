/**
 * Bash Tool Adapter - Executes bash commands
 */

import { BaseToolAdapter } from '../base-adapter';
import { BashParams, BashResult, ParameterSchema } from '../tool-types';
import { spawn } from 'child_process';
import * as os from 'os';
import { ToolParameterSchemas } from '../../utils/validation-schemas';

export class BashAdapter extends BaseToolAdapter<BashParams, BashResult> {
  name = 'bash';
  description = 'Executes bash commands in a persistent shell session';
  parameters: Record<string, ParameterSchema> = {
    command: {
      type: 'string' as const,
      description: 'The command to execute',
      required: true
    },
    description: {
      type: 'string' as const,
      description: 'Clear description of what this command does',
      required: false
    },
    timeout: {
      type: 'number' as const,
      description: 'Optional timeout in milliseconds (max 600000)',
      required: false
    }
  };

  async execute(params: BashParams): Promise<BashResult> {
    // Validate using schema
    const validated = ToolParameterSchemas.bash.parse(params);
    
    const { command, description, timeout = 120000 } = validated;

    // Validate timeout
    const maxTimeout = 600000; // 10 minutes
    const effectiveTimeout = Math.min(timeout, maxTimeout);

    // Log what we're doing
    if (description) {
      this.logger.info(`Executing: ${description}`);
    }

    try {
      const result = await this.executeCommand(command, effectiveTimeout);
      return this.success(result);
    } catch (error) {
      
      const message = error instanceof Error ? error.message : 'Unknown error';
      return this.error(`Command failed: ${message}`, 'COMMAND_FAILED');
    }
  }

  private executeCommand(command: string, timeout: number): Promise<BashResult> {
    return new Promise((resolve, reject) => {
      // Determine shell based on platform
      const isWindows = os.platform() === 'win32';
      const shell = isWindows ? 'cmd.exe' : '/bin/bash';
      const shellArgs = isWindows ? ['/c', command] : ['-c', command];

      const proc = spawn(shell, shellArgs, {
        cwd: process.cwd(),
        env: { ...process.env },
        shell: false,
        windowsHide: true
      });

      let stdout = '';
      let stderr = '';
      let killed = false;

      // Set timeout
      const timer = setTimeout(() => {
        killed = true;
        proc.kill('SIGTERM');
        setTimeout(() => {
          if (!proc.killed) {
            proc.kill('SIGKILL');
          }
        }, 5000);
      }, timeout);

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
        // Limit output size
        if (stdout.length > 30000) {
          stdout = stdout.substring(0, 30000) + '\n[Output truncated...]';
        }
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
        if (stderr.length > 10000) {
          stderr = stderr.substring(0, 10000) + '\n[Error output truncated...]';
        }
      });

      proc.on('close', (code) => {
        clearTimeout(timer);
        
        if (killed) {
          reject(new Error(`Command timed out after ${timeout}ms`));
          return;
        }

        resolve({
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: code ?? -1,
          success: code === 0
        });
      });

      proc.on('error', (_error) => {
        clearTimeout(timer);
        reject(_error);
      });
    });
  }

  validate(params: BashParams): boolean {
    if (!params.command) return false;
    
    const command = params.command.toLowerCase();
    
    // Check for dangerous commands
    const dangerous = [
      'rm -rf /',
      'rm -rf ~',
      'format c:',
      'del /f /s /q c:',
      ':(){ :|:& };:', // Fork bomb
      'dd if=/dev/zero of=',
      'mkfs',
      'chmod -R 777 /',
      'chown -R'
    ];

    for (const d of dangerous) {
      if (command.includes(d)) {
        return false;
      }
    }

    return true;
  }
}

// Export singleton instance
export default new BashAdapter();