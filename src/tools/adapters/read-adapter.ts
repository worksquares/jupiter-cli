/**
 * Read Tool Adapter - Reads files from the filesystem with intelligent partial reading
 */

import { BaseToolAdapter } from '../base-adapter';
import * as fs from 'fs/promises';
import * as path from 'path';
import { IntelligentFileReader } from '../../utils/intelligent-file-reader';

export class ReadAdapter extends BaseToolAdapter {
  name = 'read';
  description = 'Reads a file from the local filesystem with intelligent partial/full reading';
  parameters = {
    file_path: {
      type: 'string' as const,
      description: 'The absolute path to the file to read',
      required: true
    },
    offset: {
      type: 'number' as const,
      description: 'The line number to start reading from (overrides intelligent strategy)',
      required: false
    },
    limit: {
      type: 'number' as const,
      description: 'The number of lines to read (overrides intelligent strategy)',
      required: false
    },
    context: {
      type: 'object' as const,
      description: 'Context for intelligent reading decisions',
      required: false
    },
    force_full: {
      type: 'boolean' as const,
      description: 'Force reading the entire file',
      required: false
    }
  };

  async execute(params: any): Promise<any> {
    this.validateRequired(params, ['file_path']);
    this.validateTypes(params, {
      file_path: 'string',
      offset: 'number',
      limit: 'number',
      context: 'object',
      force_full: 'boolean'
    });

    const { file_path, offset, limit, context, force_full } = params;

    try {
      // Resolve absolute path
      const absolutePath = path.isAbsolute(file_path) 
        ? file_path 
        : path.resolve(file_path);

      // Check if file exists
      const stats = await fs.stat(absolutePath);
      
      if (!stats.isFile()) {
        return this.error(`Path is not a file: ${file_path}`, 'INVALID_PATH');
      }

      // If user explicitly provided offset/limit or force_full, use traditional reading
      if (typeof offset === 'number' || typeof limit === 'number' || force_full) {
        const content = await fs.readFile(absolutePath, 'utf-8');
        const lines = content.split('\n');
        
        if (force_full) {
          // Format entire file with line numbers
          const formattedContent = lines.map((line, index) => {
            const lineNumber = index + 1;
            return `${lineNumber.toString().padStart(6, ' ')}\t${line}`;
          }).join('\n');
          return this.success(formattedContent);
        }
        
        // Use provided offset/limit
        const actualOffset = offset || 0;
        const actualLimit = limit || 2000;
        const selectedLines = lines.slice(actualOffset, actualOffset + actualLimit);
        
        const formattedContent = selectedLines.map((line, index) => {
          const lineNumber = actualOffset + index + 1;
          return `${lineNumber.toString().padStart(6, ' ')}\t${line}`;
        }).join('\n');

        return this.success(formattedContent);
      }

      // Use intelligent file reading
      const result = await IntelligentFileReader.readFileIntelligently(
        absolutePath,
        context
      );

      // Log the strategy used
      this.logger.info(`Read strategy for ${file_path}: ${result.strategy.reason}`);

      // If the file was read partially, add analysis info
      if (!result.strategy.shouldReadFull) {
        const analysisInfo = `
File Analysis:
- Size: ${result.analysis.size} bytes
- Lines: ${result.analysis.lines}
- Type: ${result.analysis.extension}
- Strategy: ${result.strategy.reason}

${result.content}`;
        return this.success(analysisInfo);
      }

      // For full reads, format with line numbers
      const lines = result.content.split('\n');
      const formattedContent = lines.map((line, index) => {
        const lineNumber = index + 1;
        return `${lineNumber.toString().padStart(6, ' ')}\t${line}`;
      }).join('\n');

      return this.success(formattedContent);
    } catch (error) {
      const err = error as any;
      if (err.code === 'ENOENT') {
        return this.error(`File not found: ${file_path}`, 'FILE_NOT_FOUND');
      }
      if (err.code === 'EACCES') {
        return this.error(`Permission denied: ${file_path}`, 'PERMISSION_DENIED');
      }
      return this.error(`Failed to read file: ${error instanceof Error ? error.message : String(error)}`, 'READ_ERROR');
    }
  }

  validate(params: any): boolean {
    if (!params.file_path) return false;
    
    // Check for path traversal attempts
    if (params.file_path.includes('..')) {
      return false;
    }

    return true;
  }
}

// Export singleton instance
export default new ReadAdapter();