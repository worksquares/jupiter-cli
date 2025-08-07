/**
 * ACI File Adapter
 * Handles file operations within Azure Container Instances
 */

import { BaseToolAdapter } from '../base-adapter';
import { ParameterSchema } from '../tool-types';
import { ToolResult } from '../../core/types';
import { Logger } from '../../utils/logger';
import { AzureContainerManager } from '../../azure/aci-manager';
import { SegregationContext, validateSegregationContext } from '../../core/segregation-types';
import { z } from 'zod';
import * as path from 'path';

const ACIFileOperationSchema = z.enum([
  'read', 'write', 'append', 'delete', 'exists',
  'mkdir', 'rmdir', 'list', 'copy', 'move',
  'chmod', 'stat', 'glob'
]);

const ACIFileParamsSchema = z.object({
  context: z.object({
    userId: z.string().uuid(),
    projectId: z.string().uuid(),
    taskId: z.string().uuid(),
    tenantId: z.string().uuid().optional()
  }),
  operation: ACIFileOperationSchema,
  path: z.string(),
  content: z.string().optional(),
  targetPath: z.string().optional(),
  encoding: z.enum(['utf8', 'base64', 'binary']).default('utf8'),
  recursive: z.boolean().optional(),
  permissions: z.string().optional(),
  pattern: z.string().optional()
});

type ACIFileParams = z.infer<typeof ACIFileParamsSchema>;

export class ACIFileAdapter extends BaseToolAdapter {
  name = 'aciFile';
  description = 'File operations in Azure Container Instance';
  
  parameters: Record<string, ParameterSchema> = {
    context: {
      type: 'object',
      description: 'Segregation context with userId, projectId, and taskId',
      required: true
    },
    operation: {
      type: 'string',
      description: 'File operation: read, write, append, delete, exists, mkdir, rmdir, list, copy, move, chmod, stat, glob',
      required: true
    },
    path: {
      type: 'string',
      description: 'File or directory path',
      required: true
    },
    content: {
      type: 'string',
      description: 'Content for write/append operations',
      required: false
    },
    targetPath: {
      type: 'string',
      description: 'Target path for copy/move operations',
      required: false
    },
    encoding: {
      type: 'string',
      description: 'File encoding: utf8, base64, binary',
      required: false
    },
    recursive: {
      type: 'boolean',
      description: 'Recursive operation for directories',
      required: false
    },
    permissions: {
      type: 'string',
      description: 'Permissions for chmod operation',
      required: false
    },
    pattern: {
      type: 'string',
      description: 'Pattern for glob/list operations',
      required: false
    }
  };

  protected logger: Logger;
  private aciManager: AzureContainerManager;
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

  constructor(aciManager: AzureContainerManager) {
    super();
    this.logger = new Logger('ACIFileAdapter');
    this.aciManager = aciManager;
  }

  async execute(params: ACIFileParams): Promise<ToolResult> {
    try {
      // Validate parameters
      const validated = ACIFileParamsSchema.parse(params);
      const context = validateSegregationContext(validated.context);
      
      this.logger.info('Executing file operation in ACI', { 
        context,
        operation: validated.operation,
        path: validated.path
      });

      // Ensure container exists
      await this.aciManager.getOrCreateContainer(context, {
        image: 'node:18',
        memoryGB: 1.5,
        exposedPorts: []
      });

      // Execute operation based on type
      let result: any;
      
      switch (validated.operation) {
        case 'read':
          result = await this.readFile(context, validated.path, validated.encoding);
          break;
          
        case 'write':
          if (!validated.content) {
            throw new Error('Content is required for write operation');
          }
          result = await this.writeFile(context, validated.path, validated.content, validated.encoding);
          break;
          
        case 'append':
          if (!validated.content) {
            throw new Error('Content is required for append operation');
          }
          result = await this.appendFile(context, validated.path, validated.content);
          break;
          
        case 'delete':
          result = await this.deleteFile(context, validated.path);
          break;
          
        case 'exists':
          result = await this.fileExists(context, validated.path);
          break;
          
        case 'mkdir':
          result = await this.createDirectory(context, validated.path, validated.recursive);
          break;
          
        case 'rmdir':
          result = await this.removeDirectory(context, validated.path, validated.recursive);
          break;
          
        case 'list':
          result = await this.listDirectory(context, validated.path, validated.pattern);
          break;
          
        case 'copy':
          if (!validated.targetPath) {
            throw new Error('Target path is required for copy operation');
          }
          result = await this.copyFile(context, validated.path, validated.targetPath);
          break;
          
        case 'move':
          if (!validated.targetPath) {
            throw new Error('Target path is required for move operation');
          }
          result = await this.moveFile(context, validated.path, validated.targetPath);
          break;
          
        case 'chmod':
          if (!validated.permissions) {
            throw new Error('Permissions are required for chmod operation');
          }
          result = await this.changePermissions(context, validated.path, validated.permissions);
          break;
          
        case 'stat':
          result = await this.getFileStats(context, validated.path);
          break;
          
        case 'glob':
          if (!validated.pattern) {
            throw new Error('Pattern is required for glob operation');
          }
          result = await this.globFiles(context, validated.path, validated.pattern);
          break;
          
        default:
          throw new Error(`Unknown operation: ${validated.operation}`);
      }

      return {
        success: true,
        data: {
          ...result,
          operation: validated.operation,
          path: validated.path,
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
            operation: validated.operation,
            path: validated.path
          }
        }
      };
    } catch (error) {
      this.logger.error('File operation failed', error);
      
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
      ACIFileParamsSchema.parse(params);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * File operation implementations
   */

  private async readFile(
    context: SegregationContext,
    filePath: string,
    encoding: 'utf8' | 'base64' | 'binary'
  ): Promise<{ content: string; size: number }> {
    const safePath = this.sanitizePath(filePath);
    const command = encoding === 'base64' 
      ? `base64 ${safePath}`
      : `cat ${safePath}`;
    
    const containerName = this.getContainerName(context);
    const result = await this.aciManager.executeCommand(
      containerName,
      `bash -c "${command}"`
    );

    if (result.exitCode !== 0) {
      throw new Error(`Failed to read file: ${result.stderr}`);
    }

    return {
      content: result.stdout || '',
      size: result.stdout?.length || 0
    };
  }

  private async writeFile(
    context: SegregationContext,
    filePath: string,
    content: string,
    encoding: 'utf8' | 'base64' | 'binary'
  ): Promise<{ written: boolean; size: number }> {
    const safePath = this.sanitizePath(filePath);
    const dir = path.dirname(safePath);
    
    // Ensure directory exists
    await this.aciManager.executeCommand(
      this.getContainerName(context),
      `mkdir -p ${dir}`
    );

    // Write content
    const encodedContent = encoding === 'base64' 
      ? Buffer.from(content).toString('base64')
      : content;
    
    const escapedContent = encodedContent.replace(/'/g, "'\"'\"'");
    const command = encoding === 'base64'
      ? `echo '${escapedContent}' | base64 -d > ${safePath}`
      : `echo '${escapedContent}' > ${safePath}`;
    
    const containerName = this.getContainerName(context);
    const result = await this.aciManager.executeCommand(
      containerName,
      `bash -c "${command}"`
    );

    if (result.exitCode !== 0) {
      throw new Error(`Failed to write file: ${result.stderr}`);
    }

    return {
      written: true,
      size: content.length
    };
  }

  private async appendFile(
    context: SegregationContext,
    filePath: string,
    content: string
  ): Promise<{ appended: boolean }> {
    const safePath = this.sanitizePath(filePath);
    const escapedContent = content.replace(/'/g, "'\"'\"'");
    
    const result = await this.aciManager.executeCommand(
      this.getContainerName(context),
      `bash -c "echo '${escapedContent}' >> ${safePath}"`
    );

    if (result.exitCode !== 0) {
      throw new Error(`Failed to append to file: ${result.stderr}`);
    }

    return { appended: true };
  }

  private async deleteFile(
    context: SegregationContext,
    filePath: string
  ): Promise<{ deleted: boolean }> {
    const safePath = this.sanitizePath(filePath);
    
    const result = await this.aciManager.executeCommand(
      this.getContainerName(context),
      `rm -f ${safePath}`
    );

    if (result.exitCode !== 0) {
      throw new Error(`Failed to delete file: ${result.stderr}`);
    }

    return { deleted: true };
  }

  private async fileExists(
    context: SegregationContext,
    filePath: string
  ): Promise<{ exists: boolean; isFile: boolean; isDirectory: boolean }> {
    const safePath = this.sanitizePath(filePath);
    
    const result = await this.aciManager.executeCommand(
      this.getContainerName(context),
      `bash -c "if [ -e ${safePath} ]; then echo 'exists'; fi; if [ -f ${safePath} ]; then echo 'file'; fi; if [ -d ${safePath} ]; then echo 'directory'; fi"`
    );

    const output = result.stdout || '';
    return {
      exists: output.includes('exists'),
      isFile: output.includes('file'),
      isDirectory: output.includes('directory')
    };
  }

  private async createDirectory(
    context: SegregationContext,
    dirPath: string,
    recursive?: boolean
  ): Promise<{ created: boolean }> {
    const safePath = this.sanitizePath(dirPath);
    const args = ['mkdir'];
    
    if (recursive) {
      args.push('-p');
    }
    
    args.push(safePath);
    
    const result = await this.aciManager.executeCommand(
      this.getContainerName(context),
      args.join(' ')
    );

    if (result.exitCode !== 0) {
      throw new Error(`Failed to create directory: ${result.stderr}`);
    }

    return { created: true };
  }

  private async removeDirectory(
    context: SegregationContext,
    dirPath: string,
    recursive?: boolean
  ): Promise<{ removed: boolean }> {
    const safePath = this.sanitizePath(dirPath);
    const args = ['rm'];
    
    if (recursive) {
      args.push('-rf');
    } else {
      args.push('-d');
    }
    
    args.push(safePath);
    
    const result = await this.aciManager.executeCommand(
      this.getContainerName(context),
      args.join(' ')
    );

    if (result.exitCode !== 0) {
      throw new Error(`Failed to remove directory: ${result.stderr}`);
    }

    return { removed: true };
  }

  private async listDirectory(
    context: SegregationContext,
    dirPath: string,
    pattern?: string
  ): Promise<{ files: string[]; directories: string[] }> {
    const safePath = this.sanitizePath(dirPath);
    const command = pattern
      ? `find ${safePath} -name "${pattern}" -type f -o -name "${pattern}" -type d`
      : `ls -la ${safePath}`;
    
    const containerName = this.getContainerName(context);
    const result = await this.aciManager.executeCommand(
      containerName,
      `bash -c "${command}"`
    );

    if (result.exitCode !== 0) {
      throw new Error(`Failed to list directory: ${result.stderr}`);
    }

    const lines = (result.stdout || '').split('\n').filter(line => line.trim());
    const files: string[] = [];
    const directories: string[] = [];

    if (pattern) {
      // Using find command output
      for (const line of lines) {
        const statResult = await this.aciManager.executeCommand(
          containerName,
          `stat -c '%F' ${line.trim()}`
        );
        
        if (statResult.stdout?.includes('directory')) {
          directories.push(line.trim());
        } else {
          files.push(line.trim());
        }
      }
    } else {
      // Parsing ls output
      for (const line of lines) {
        if (line.startsWith('d')) {
          const parts = line.split(/\s+/);
          const name = parts[parts.length - 1];
          if (name !== '.' && name !== '..') {
            directories.push(name);
          }
        } else if (line.startsWith('-')) {
          const parts = line.split(/\s+/);
          files.push(parts[parts.length - 1]);
        }
      }
    }

    return { files, directories };
  }

  private async copyFile(
    context: SegregationContext,
    sourcePath: string,
    targetPath: string
  ): Promise<{ copied: boolean }> {
    const safeSrcPath = this.sanitizePath(sourcePath);
    const safeTgtPath = this.sanitizePath(targetPath);
    
    const result = await this.aciManager.executeCommand(
      this.getContainerName(context),
      `cp -r ${safeSrcPath} ${safeTgtPath}`
    );

    if (result.exitCode !== 0) {
      throw new Error(`Failed to copy file: ${result.stderr}`);
    }

    return { copied: true };
  }

  private async moveFile(
    context: SegregationContext,
    sourcePath: string,
    targetPath: string
  ): Promise<{ moved: boolean }> {
    const safeSrcPath = this.sanitizePath(sourcePath);
    const safeTgtPath = this.sanitizePath(targetPath);
    
    const result = await this.aciManager.executeCommand(
      this.getContainerName(context),
      `mv ${safeSrcPath} ${safeTgtPath}`
    );

    if (result.exitCode !== 0) {
      throw new Error(`Failed to move file: ${result.stderr}`);
    }

    return { moved: true };
  }

  private async changePermissions(
    context: SegregationContext,
    filePath: string,
    permissions: string
  ): Promise<{ changed: boolean }> {
    const safePath = this.sanitizePath(filePath);
    
    const result = await this.aciManager.executeCommand(
      this.getContainerName(context),
      `chmod ${permissions} ${safePath}`
    );

    if (result.exitCode !== 0) {
      throw new Error(`Failed to change permissions: ${result.stderr}`);
    }

    return { changed: true };
  }

  private async getFileStats(
    context: SegregationContext,
    filePath: string
  ): Promise<any> {
    const safePath = this.sanitizePath(filePath);
    
    const result = await this.aciManager.executeCommand(
      this.getContainerName(context),
      `stat -c '%n|%s|%a|%U|%G|%Y|%F' ${safePath}`
    );

    if (result.exitCode !== 0) {
      throw new Error(`Failed to get file stats: ${result.stderr}`);
    }

    const parts = (result.stdout || '').trim().split('|');
    return {
      name: parts[0],
      size: parseInt(parts[1], 10),
      permissions: parts[2],
      owner: parts[3],
      group: parts[4],
      modifiedTime: new Date(parseInt(parts[5], 10) * 1000),
      type: parts[6]
    };
  }

  private async globFiles(
    context: SegregationContext,
    basePath: string,
    pattern: string
  ): Promise<{ matches: string[] }> {
    const safePath = this.sanitizePath(basePath);
    
    const result = await this.aciManager.executeCommand(
      this.getContainerName(context),
      `bash -c "cd ${safePath} && ls -1 ${pattern} 2>/dev/null || true"`
    );

    const matches = (result.stdout || '')
      .split('\n')
      .filter(line => line.trim())
      .map(file => path.join(basePath, file));

    return { matches };
  }

  /**
   * Sanitize file path to prevent directory traversal
   */
  private sanitizePath(filePath: string): string {
    // Remove any directory traversal attempts
    const cleaned = filePath.replace(/\.\.\/|\.\.\\/g, '');
    
    // Ensure path is within workspace
    if (path.isAbsolute(cleaned)) {
      return cleaned;
    }
    
    return path.join('/workspace', cleaned);
  }
}
