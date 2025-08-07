/**
 * Edit Tool Adapter - Performs exact string replacements in files
 * Enhanced with file validation and atomic operations
 */

import { BaseToolAdapter } from '../base-adapter';
import * as fs from 'fs/promises';
import * as path from 'path';
import { FileValidator } from '../../utils/file-validator';
import { createDiff, generateChangePreview } from '../../utils/diff-utils';

export class EditAdapter extends BaseToolAdapter {
  name = 'edit';
  description = 'Performs exact string replacements in files. Preserves exact indentation and formatting.';
  parameters = {
    file_path: {
      type: 'string' as const,
      description: 'The absolute path to the file to modify',
      required: true
    },
    old_string: {
      type: 'string' as const,
      description: 'The text to replace (must match exactly including whitespace)',
      required: true
    },
    new_string: {
      type: 'string' as const,
      description: 'The text to replace it with (must be different from old_string)',
      required: true
    },
    replace_all: {
      type: 'boolean' as const,
      description: 'Replace all occurrences of old_string (default false)',
      required: false,
      default: false
    }
  };

  private fileValidator: FileValidator;

  constructor() {
    super();
    // Initialize file validator for edit operations
    this.fileValidator = new FileValidator({
      maxFileSize: 10 * 1024 * 1024, // 10MB limit for edits
      allowSymlinks: false,
      allowHiddenFiles: true,
      checkEncoding: true,
      requireAbsolutePath: true
    });
  }

  /**
   * Find context around a string for better error messages
   */
  private findContext(content: string, searchString: string, contextLength: number = 50): string {
    const index = content.indexOf(searchString);
    if (index === -1) return '';

    const start = Math.max(0, index - contextLength);
    const end = Math.min(content.length, index + searchString.length + contextLength);
    
    let context = content.substring(start, end);
    if (start > 0) context = '...' + context;
    if (end < content.length) context = context + '...';
    
    return context.replace(/\n/g, '\\n').replace(/\t/g, '\\t');
  }

  async execute(params: any): Promise<any> {
    this.validateRequired(params, ['file_path', 'old_string', 'new_string']);
    this.validateTypes(params, {
      file_path: 'string',
      old_string: 'string',
      new_string: 'string',
      replace_all: 'boolean'
    });

    const { file_path, old_string, new_string, replace_all = false } = params;

    // Validate strings are different
    if (old_string === new_string) {
      this.error('old_string and new_string must be different', 'INVALID_PARAMS');
    }

    // Validate old_string is not empty
    if (old_string.length === 0) {
      this.error('old_string cannot be empty', 'INVALID_PARAMS');
    }

    // Enhanced file validation
    const validation = await this.fileValidator.validateFile(file_path);
    if (!validation.valid) {
      this.error(validation.error || 'File validation failed', 'VALIDATION_ERROR');
    }

    // Warn about binary files
    if (validation.metadata?.isBinary) {
      this.error('Cannot edit binary files', 'INVALID_FILE_TYPE');
    }

    try {
      // Resolve absolute path
      const absolutePath = path.isAbsolute(file_path) 
        ? file_path 
        : path.resolve(file_path);

      // Read current content
      const content = await fs.readFile(absolutePath, 'utf-8');

      // Check if old_string exists
      if (!content.includes(old_string)) {
        const context = this.findContext(content, old_string.substring(0, 50));
        const helpMessage = context 
          ? `No match found. Similar context: "${context}"`
          : 'No match found. Check for exact whitespace and line endings.';
        
        this.error(
          `String not found in file: "${old_string}". ${helpMessage}`,
          'STRING_NOT_FOUND'
        );
      }

      // Count occurrences
      const occurrences = content.split(old_string).length - 1;

      // Check if unique (when not replace_all)
      if (!replace_all && occurrences > 1) {
        const firstContext = this.findContext(content, old_string);
        this.error(
          `String is not unique (found ${occurrences} occurrences). ` +
          `Use replace_all=true or provide more context. ` +
          `First occurrence context: "${firstContext}"`,
          'STRING_NOT_UNIQUE'
        );
      }

      // Perform replacement
      let newContent: string;
      if (replace_all) {
        newContent = content.split(old_string).join(new_string);
      } else {
        const index = content.indexOf(old_string);
        newContent = 
          content.substring(0, index) + 
          new_string + 
          content.substring(index + old_string.length);
      }

      // Ensure content actually changed
      if (content === newContent) {
        this.error('No changes were made to the file', 'NO_CHANGES');
      }

      // Generate diff for preview
      const diff = createDiff(content, newContent, file_path);
      const preview = generateChangePreview(content, newContent, 10);

      // Write back to file atomically
      const tempPath = `${absolutePath}.tmp.${Date.now()}`;
      
      try {
        await fs.writeFile(tempPath, newContent, 'utf-8');
        await fs.rename(tempPath, absolutePath);
      } catch (writeError) {
        // Clean up temp file on error
        try {
          await fs.unlink(tempPath);
        } catch { /* ignore cleanup errors */ }
        throw writeError;
      }

      // Find line numbers of changes
      const newLines = newContent.split('\n');
      const changedLines: number[] = [];
      newLines.forEach((line, index) => {
        if (line.includes(new_string)) {
          changedLines.push(index + 1);
        }
      });

      return this.success({
        message: replace_all 
          ? `Replaced ${occurrences} occurrence${occurrences > 1 ? 's' : ''} in file`
          : 'File updated successfully',
        path: absolutePath,
        replacements: replace_all ? occurrences : 1,
        changedLines: changedLines.slice(0, 10),
        totalChangedLines: changedLines.length,
        diff: {
          added: diff.added,
          removed: diff.removed,
          preview: preview
        }
      });
    } catch (error) {
      const err = error as any;
      
      if (err.code === 'ENOENT') {
        this.error(`File not found: ${file_path}`, 'FILE_NOT_FOUND');
      }
      
      if (err.code === 'EACCES' || err.code === 'EPERM') {
        this.error(`Permission denied: ${file_path}`, 'PERMISSION_DENIED');
      }
      
      if (err.code === 'EISDIR') {
        this.error(`Path is a directory, not a file: ${file_path}`, 'INVALID_PATH');
      }
      
      if (err.code === 'ENOSPC') {
        this.error('No space left on device', 'SYSTEM_ERROR');
      }
      
      this.error(
        `Failed to edit file: ${error instanceof Error ? error.message : String(error)}`, 
        'EDIT_ERROR'
      );
    }
  }

  validate(params: any): boolean {
    if (!params.file_path || !params.old_string || typeof params.new_string !== 'string') {
      return false;
    }

    // Basic path validation
    const pathValidation = this.fileValidator.validatePath(params.file_path);
    return pathValidation.valid;
  }
}

// Export singleton instance
export default new EditAdapter();