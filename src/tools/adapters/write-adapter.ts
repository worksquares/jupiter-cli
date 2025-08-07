/**
 * Write Tool Adapter - Writes files to the filesystem
 * Enhanced with comprehensive file validation
 */

import { BaseToolAdapter } from '../base-adapter';
import * as fs from 'fs/promises';
import * as path from 'path';
import { FileValidator, FileValidationOptions } from '../../utils/file-validator';

export class WriteAdapter extends BaseToolAdapter {
  name = 'write';
  description = 'Writes a file to the local filesystem. Will overwrite existing files.';
  parameters = {
    file_path: {
      type: 'string' as const,
      description: 'The absolute path to the file to write (must be absolute, not relative)',
      required: true
    },
    content: {
      type: 'string' as const,
      description: 'The content to write to the file',
      required: true
    }
  };

  private fileValidator: FileValidator;

  constructor() {
    super();
    // Initialize file validator with appropriate settings for write operations
    this.fileValidator = new FileValidator({
      maxFileSize: 50 * 1024 * 1024, // 50MB write limit
      allowSymlinks: false,
      allowHiddenFiles: true,
      checkEncoding: false, // Don't check encoding for new files
      requireAbsolutePath: true,
      deniedExtensions: ['.exe', '.dll', '.so', '.dylib', '.bin']
    });
  }

  async execute(params: any): Promise<any> {
    this.validateRequired(params, ['file_path', 'content']);
    this.validateTypes(params, {
      file_path: 'string',
      content: 'string'
    });

    const { file_path, content } = params;

    // Enhanced file validation
    const validation = await this.fileValidator.validateFile(file_path);
    
    // For write operations, we allow non-existent files
    if (!validation.valid && !validation.warnings?.includes('File does not exist')) {
      this.error(validation.error || 'File validation failed', 'VALIDATION_ERROR');
    }

    // Check content size
    const contentSize = Buffer.byteLength(content, 'utf-8');
    if (contentSize > 50 * 1024 * 1024) {
      this.error(`Content size (${contentSize} bytes) exceeds maximum allowed (50MB)`, 'FILE_TOO_LARGE');
    }

    // Warn about sensitive files
    if (validation.warnings && validation.warnings.includes('File may contain sensitive information')) {
      // Just a warning, not blocking the operation
      console.warn(`Warning: Writing to potentially sensitive file: ${file_path}`);
    }

    try {
      // Resolve absolute path
      const absolutePath = path.isAbsolute(file_path) 
        ? file_path 
        : path.resolve(file_path);

      // Check if file exists and user should have been warned
      let existingContent: string | null = null;
      let fileExists = false;
      
      try {
        existingContent = await fs.readFile(absolutePath, 'utf-8');
        fileExists = true;
      } catch (err: any) {
        if (err.code !== 'ENOENT') {
          throw err;
        }
      }

      // Ensure directory exists
      const dir = path.dirname(absolutePath);
      await fs.mkdir(dir, { recursive: true });

      // Write file atomically using temp file
      const tempPath = `${absolutePath}.tmp.${Date.now()}`;
      
      try {
        await fs.writeFile(tempPath, content, 'utf-8');
        await fs.rename(tempPath, absolutePath);
      } catch (writeError) {
        // Clean up temp file on error
        try {
          await fs.unlink(tempPath);
        } catch { /* ignore cleanup errors */ }
        throw writeError;
      }

      // Get final file stats
      const stats = await fs.stat(absolutePath);

      return this.success({
        message: fileExists 
          ? `File overwritten successfully: ${absolutePath}`
          : `File created successfully: ${absolutePath}`,
        path: absolutePath,
        size: stats.size,
        created: !fileExists,
        overwritten: fileExists,
        contentLength: content.length,
        warnings: validation.warnings
      });
    } catch (error) {
      const err = error as any;
      
      if (err.code === 'EACCES' || err.code === 'EPERM') {
        this.error(`Permission denied: ${file_path}`, 'PERMISSION_DENIED');
      }
      
      if (err.code === 'ENOSPC') {
        this.error('No space left on device', 'SYSTEM_ERROR');
      }
      
      if (err.code === 'EISDIR') {
        this.error(`Path is a directory, not a file: ${file_path}`, 'INVALID_PATH');
      }
      
      if (err.code === 'ENOTDIR') {
        this.error(`Parent path is not a directory: ${path.dirname(file_path)}`, 'INVALID_PATH');
      }
      
      this.error(`Failed to write file: ${error instanceof Error ? error.message : String(error)}`, 'WRITE_ERROR');
    }
  }

  validate(params: any): boolean {
    if (!params.file_path || typeof params.content !== 'string') {
      return false;
    }
    
    // Basic path validation
    const pathValidation = this.fileValidator.validatePath(params.file_path);
    return pathValidation.valid;
  }
}

// Export singleton instance
export default new WriteAdapter();