/**
 * Glob Tool Adapter - Fast file pattern matching
 */

import { BaseToolAdapter } from '../base-adapter';
import { glob } from 'glob';
import * as path from 'path';
import * as fs from 'fs/promises';

export class GlobAdapter extends BaseToolAdapter {
  name = 'glob';
  description = 'Fast file pattern matching tool';
  parameters = {
    pattern: {
      type: 'string' as const,
      description: 'The glob pattern to match files against',
      required: true
    },
    path: {
      type: 'string' as const, 
      description: 'The directory to search in',
      required: false
    }
  };

  async execute(params: any): Promise<any> {
    this.validateRequired(params, ['pattern']);
    this.validateTypes(params, {
      pattern: 'string',
      path: 'string'
    });

    const { pattern, path: searchPath = process.cwd() } = params;

    try {
      // Resolve search path
      const basePath = path.isAbsolute(searchPath) 
        ? searchPath 
        : path.resolve(searchPath);

      // Verify directory exists
      const stats = await fs.stat(basePath).catch(() => null);
      if (!stats || !stats.isDirectory()) {
        this.error(`Directory not found: ${searchPath}`, 'SEARCH_ERROR');
      }

      // Execute glob search
      const matches = await glob(pattern, {
        cwd: basePath,
        absolute: true,
        nodir: true, // Only files
        ignore: ['**/node_modules/**', '**/.git/**'],
        dot: true // Include dotfiles
      });

      // Sort by modification time
      const fileStats = await Promise.all(
        matches.map(async (file) => {
          try {
            const stat = await fs.stat(file);
            return {
              path: file,
              mtime: stat.mtime.getTime(),
              size: stat.size
            };
          } catch {
            return null;
          }
        })
      );

      // Filter out failed stats and sort
      const validFiles = fileStats
        .filter(f => f !== null)
        .sort((a, b) => b!.mtime - a!.mtime)
        .map(f => f!.path);

      return this.success(validFiles);
    } catch (error: any) {
      this.error(`Glob search failed: ${error.message}`, 'SEARCH_ERROR');
    }
  }

  validate(params: any): boolean {
    if (!params.pattern) return false;
    
    // Check for dangerous patterns
    const dangerous = ['**/../**', '**/..**'];
    for (const d of dangerous) {
      if (params.pattern.includes(d)) {
        return false;
      }
    }

    return true;
  }
}

// Export singleton instance
export default new GlobAdapter();