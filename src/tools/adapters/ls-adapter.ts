/**
 * LS Tool Adapter - Lists files and directories
 */

import { BaseToolAdapter } from '../base-adapter';
import * as fs from 'fs/promises';
import * as path from 'path';
import { minimatch } from 'minimatch';

interface FileInfo {
  name: string;
  type: 'file' | 'directory';
  size: number;
  modified: Date;
  permissions: string;
}

export class LSAdapter extends BaseToolAdapter {
  name = 'ls';
  description = 'Lists files and directories in a given path';
  parameters = {
    path: {
      type: 'string' as const,
      description: 'The absolute path to the directory to list',
      required: true
    },
    ignore: {
      type: 'array' as const,
      description: 'List of glob patterns to ignore',
      required: false
    }
  };

  async execute(params: any): Promise<any> {
    this.validateRequired(params, ['path']);
    this.validateTypes(params, {
      path: 'string',
      ignore: 'object' // Array is object in JS
    });

    const { path: dirPath, ignore = [] } = params;

    // Ensure path is absolute
    if (!path.isAbsolute(dirPath)) {
      this.error('Path must be absolute', 'VALIDATION_ERROR');
    }

    try {
      // Check if directory exists
      const stats = await fs.stat(dirPath);
      if (!stats.isDirectory()) {
        this.error(`Path is not a directory: ${dirPath}`, 'VALIDATION_ERROR');
      }

      // Read directory contents
      const entries = await fs.readdir(dirPath);
      
      // Get file information
      const fileInfos: FileInfo[] = [];
      
      for (const entry of entries) {
        // Check ignore patterns
        if (this.shouldIgnore(entry, ignore)) {
          continue;
        }

        const fullPath = path.join(dirPath, entry);
        
        try {
          const stat = await fs.stat(fullPath);
          
          fileInfos.push({
            name: entry,
            type: stat.isDirectory() ? 'directory' : 'file',
            size: stat.size,
            modified: stat.mtime,
            permissions: this.formatPermissions(stat.mode)
          });
        } catch (error) {
          // Skip files we can't access
          this.logger.debug(`Skipping inaccessible entry: ${entry}`);
        }
      }

      // Sort: directories first, then alphabetically
      fileInfos.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });

      // Format output
      const output = this.formatOutput(fileInfos, dirPath);
      
      return this.success(output);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        this.error(`Directory not found: ${dirPath}`, 'NOT_FOUND_ERROR');
      }
      if (error.code === 'EACCES') {
        this.error(`Permission denied: ${dirPath}`, 'PERMISSION_ERROR');
      }
      this.error(`Failed to list directory: ${error instanceof Error ? error.message : String(error)}`, 'TOOL_EXECUTION_ERROR');
    }
  }

  private shouldIgnore(entry: string, ignorePatterns: string[]): boolean {
    // Always ignore .git and node_modules by default
    if (entry === '.git' || entry === 'node_modules') {
      return true;
    }

    for (const pattern of ignorePatterns) {
      if (minimatch(entry, pattern)) {
        return true;
      }
    }

    return false;
  }

  private formatPermissions(mode: number): string {
    const perms = [
      (mode & 0o400) ? 'r' : '-',
      (mode & 0o200) ? 'w' : '-',
      (mode & 0o100) ? 'x' : '-',
      (mode & 0o040) ? 'r' : '-',
      (mode & 0o020) ? 'w' : '-',
      (mode & 0o010) ? 'x' : '-',
      (mode & 0o004) ? 'r' : '-',
      (mode & 0o002) ? 'w' : '-',
      (mode & 0o001) ? 'x' : '-'
    ];
    
    return perms.join('');
  }

  private formatOutput(files: FileInfo[], dirPath: string): string {
    if (files.length === 0) {
      return `Directory is empty: ${dirPath}`;
    }

    const lines: string[] = [`Contents of ${dirPath}:\n`];
    
    // Add header
    lines.push('Type  Permissions  Size       Modified              Name');
    lines.push('----  -----------  ---------  -------------------  ----');
    
    // Add file entries
    for (const file of files) {
      const type = file.type === 'directory' ? 'DIR ' : 'FILE';
      const size = file.type === 'directory' 
        ? '        -' 
        : this.formatSize(file.size).padStart(9);
      const modified = file.modified.toISOString().replace('T', ' ').substring(0, 19);
      const name = file.type === 'directory' ? `${file.name}/` : file.name;
      
      lines.push(
        `${type}  ${file.permissions}  ${size}  ${modified}  ${name}`
      );
    }
    
    // Add summary
    const fileCount = files.filter(f => f.type === 'file').length;
    const dirCount = files.filter(f => f.type === 'directory').length;
    lines.push('');
    lines.push(`Total: ${fileCount} files, ${dirCount} directories`);
    
    return lines.join('\n');
  }

  private formatSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    if (unitIndex === 0) {
      return `${size}${units[unitIndex]}`;
    }
    
    return `${size.toFixed(1)}${units[unitIndex]}`;
  }

  validate(params: any): boolean {
    if (!params.path) return false;
    
    // Must be absolute path
    if (!path.isAbsolute(params.path)) {
      return false;
    }

    // Check for path traversal
    if (params.path.includes('..')) {
      return false;
    }

    return true;
  }
}

// Export singleton instance
export default new LSAdapter();