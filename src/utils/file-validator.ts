/**
 * Enhanced File Validation Utilities
 * Provides comprehensive file validation for security and safety
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { Buffer } from 'buffer';

export interface FileValidationOptions {
  maxFileSize?: number;
  allowedExtensions?: string[];
  deniedExtensions?: string[];
  allowSymlinks?: boolean;
  allowHiddenFiles?: boolean;
  checkEncoding?: boolean;
  requireAbsolutePath?: boolean;
  basePath?: string;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  warnings?: string[];
  metadata?: {
    size?: number;
    extension?: string;
    encoding?: string;
    isBinary?: boolean;
    isSymlink?: boolean;
    isHidden?: boolean;
  };
}

export class FileValidator {
  private defaultOptions: FileValidationOptions = {
    maxFileSize: 10 * 1024 * 1024, // 10MB
    allowSymlinks: false,
    allowHiddenFiles: true,
    checkEncoding: true,
    requireAbsolutePath: true
  };

  // Common binary file extensions
  private binaryExtensions = new Set([
    '.exe', '.dll', '.so', '.dylib', '.bin', '.dat',
    '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.ico', '.webp',
    '.mp3', '.mp4', '.avi', '.mov', '.wav', '.flac',
    '.zip', '.tar', '.gz', '.rar', '.7z',
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.pyc', '.pyo', '.class', '.o', '.a', '.lib'
  ]);

  // Sensitive file patterns
  private sensitivePatterns = [
    /\.env$/i,
    /\.git\//,
    /\.ssh\//,
    /private.*key/i,
    /secret/i,
    /password/i,
    /token/i,
    /credentials/i,
    /\.pem$/i,
    /\.key$/i,
    /\.cert$/i
  ];

  constructor(private options: FileValidationOptions = {}) {
    this.options = { ...this.defaultOptions, ...options };
  }

  /**
   * Validate a file path and its contents
   */
  async validateFile(filePath: string): Promise<ValidationResult> {
    const warnings: string[] = [];
    const metadata: any = {};

    // 1. Path validation
    const pathValidation = this.validatePath(filePath);
    if (!pathValidation.valid) {
      return pathValidation;
    }

    // 2. Check if path is absolute
    if (this.options.requireAbsolutePath && !path.isAbsolute(filePath)) {
      return {
        valid: false,
        error: 'Path must be absolute'
      };
    }

    // 3. Path traversal check
    if (this.hasPathTraversal(filePath)) {
      return {
        valid: false,
        error: 'Path traversal detected'
      };
    }

    // 4. Base path restriction
    if (this.options.basePath) {
      const resolvedPath = path.resolve(filePath);
      const resolvedBase = path.resolve(this.options.basePath);
      if (!resolvedPath.startsWith(resolvedBase)) {
        return {
          valid: false,
          error: `Path must be within ${this.options.basePath}`
        };
      }
    }

    // 5. Extension validation
    const ext = path.extname(filePath).toLowerCase();
    metadata.extension = ext;

    if (this.options.allowedExtensions && this.options.allowedExtensions.length > 0) {
      if (!this.options.allowedExtensions.includes(ext)) {
        return {
          valid: false,
          error: `File extension ${ext} is not allowed`
        };
      }
    }

    if (this.options.deniedExtensions && this.options.deniedExtensions.includes(ext)) {
      return {
        valid: false,
        error: `File extension ${ext} is denied`
      };
    }

    // Check if file exists
    try {
      const stats = await fs.stat(filePath);

      // 6. Check if it's a file
      if (!stats.isFile()) {
        return {
          valid: false,
          error: 'Path is not a file'
        };
      }

      // 7. File size check
      metadata.size = stats.size;
      if (this.options.maxFileSize && stats.size > this.options.maxFileSize) {
        return {
          valid: false,
          error: `File size (${this.formatSize(stats.size)}) exceeds maximum allowed (${this.formatSize(this.options.maxFileSize)})`
        };
      }

      // 8. Symlink check
      const lstat = await fs.lstat(filePath);
      metadata.isSymlink = lstat.isSymbolicLink();
      if (metadata.isSymlink && !this.options.allowSymlinks) {
        return {
          valid: false,
          error: 'Symbolic links are not allowed'
        };
      }

      // 9. Hidden file check
      const basename = path.basename(filePath);
      metadata.isHidden = basename.startsWith('.');
      if (metadata.isHidden && !this.options.allowHiddenFiles) {
        return {
          valid: false,
          error: 'Hidden files are not allowed'
        };
      }

      // 10. Binary file detection
      metadata.isBinary = await this.isBinaryFile(filePath, ext);
      if (metadata.isBinary) {
        warnings.push('File appears to be binary');
      }

      // 11. Encoding check for text files
      if (this.options.checkEncoding && !metadata.isBinary) {
        const encoding = await this.detectEncoding(filePath);
        metadata.encoding = encoding;
        if (encoding !== 'utf8' && encoding !== 'ascii') {
          warnings.push(`File encoding is ${encoding}, not UTF-8`);
        }
      }

      // 12. Sensitive file check
      if (this.isSensitiveFile(filePath)) {
        warnings.push('File may contain sensitive information');
      }

      return {
        valid: true,
        warnings: warnings.length > 0 ? warnings : undefined,
        metadata
      };

    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // File doesn't exist - this might be valid for create operations
        return {
          valid: true,
          warnings: ['File does not exist'],
          metadata
        };
      }
      
      if (error.code === 'EACCES' || error.code === 'EPERM') {
        return {
          valid: false,
          error: 'Permission denied'
        };
      }

      return {
        valid: false,
        error: `Validation error: ${error.message}`
      };
    }
  }

  /**
   * Validate just the path without checking file contents
   */
  validatePath(filePath: string): ValidationResult {
    if (!filePath || typeof filePath !== 'string') {
      return {
        valid: false,
        error: 'Path must be a non-empty string'
      };
    }

    // Check for null bytes
    if (filePath.includes('\0')) {
      return {
        valid: false,
        error: 'Path contains null bytes'
      };
    }

    // Check for invalid characters on Windows
    if (process.platform === 'win32') {
      const invalidChars = /[<>:"|?*]/;
      if (invalidChars.test(path.basename(filePath))) {
        return {
          valid: false,
          error: 'Path contains invalid characters for Windows'
        };
      }
    }

    return { valid: true };
  }

  /**
   * Check for path traversal attempts
   */
  private hasPathTraversal(filePath: string): boolean {
    const normalized = path.normalize(filePath);
    const parts = normalized.split(path.sep);
    
    // Check for .. in path components
    if (parts.includes('..')) {
      return true;
    }

    // Check for absolute path escapes
    if (normalized.includes('..')) {
      return true;
    }

    return false;
  }

  /**
   * Check if file is likely binary
   */
  private async isBinaryFile(filePath: string, extension: string): Promise<boolean> {
    // Check by extension first
    if (this.binaryExtensions.has(extension)) {
      return true;
    }

    try {
      // Read first 512 bytes
      const buffer = Buffer.alloc(512);
      const fd = await fs.open(filePath, 'r');
      await fd.read(buffer, 0, 512, 0);
      await fd.close();

      // Check for null bytes (common in binary files)
      for (let i = 0; i < buffer.length; i++) {
        if (buffer[i] === 0) {
          return true;
        }
      }

      // Check for high ratio of non-printable characters
      let nonPrintable = 0;
      for (let i = 0; i < buffer.length; i++) {
        const byte = buffer[i];
        if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) {
          nonPrintable++;
        }
      }

      return nonPrintable / buffer.length > 0.3;
    } catch {
      // If we can't read the file, assume it's not binary
      return false;
    }
  }

  /**
   * Detect file encoding
   */
  private async detectEncoding(filePath: string): Promise<string> {
    try {
      const buffer = await fs.readFile(filePath);
      
      // Check for BOM
      if (buffer.length >= 3 && buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
        return 'utf8-bom';
      }
      if (buffer.length >= 2 && buffer[0] === 0xFF && buffer[1] === 0xFE) {
        return 'utf16le';
      }
      if (buffer.length >= 2 && buffer[0] === 0xFE && buffer[1] === 0xFF) {
        return 'utf16be';
      }

      // Try to decode as UTF-8
      try {
        buffer.toString('utf8');
        
        // Check if it's pure ASCII
        let isAscii = true;
        for (let i = 0; i < buffer.length; i++) {
          if (buffer[i] > 127) {
            isAscii = false;
            break;
          }
        }
        
        return isAscii ? 'ascii' : 'utf8';
      } catch {
        return 'unknown';
      }
    } catch {
      return 'unknown';
    }
  }

  /**
   * Check if file might contain sensitive information
   */
  private isSensitiveFile(filePath: string): boolean {
    const normalizedPath = filePath.toLowerCase();
    
    for (const pattern of this.sensitivePatterns) {
      if (pattern.test(normalizedPath)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Format file size for display
   */
  private formatSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  /**
   * Create a safe file validator with strict defaults
   */
  static createStrictValidator(): FileValidator {
    return new FileValidator({
      maxFileSize: 5 * 1024 * 1024, // 5MB
      allowedExtensions: [
        '.ts', '.js', '.tsx', '.jsx', '.json', '.md', '.txt',
        '.css', '.scss', '.html', '.xml', '.yaml', '.yml',
        '.py', '.java', '.cpp', '.c', '.h', '.go', '.rs',
        '.sh', '.bash', '.zsh', '.fish', '.ps1'
      ],
      allowSymlinks: false,
      allowHiddenFiles: false,
      checkEncoding: true,
      requireAbsolutePath: true
    });
  }
}

// Export a default instance
export const fileValidator = new FileValidator();