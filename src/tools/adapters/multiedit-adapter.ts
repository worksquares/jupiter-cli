/**
 * MultiEdit Tool Adapter - Makes multiple edits to a single file
 * Enhanced version based on Claude's implementation with atomic operations
 */

import { BaseToolAdapter } from '../base-adapter';
import * as fs from 'fs/promises';
import * as path from 'path';
import { z } from 'zod';
import { createDiff, generateChangePreview } from '../../utils/diff-utils';
import { zodToJsonSchema } from '../../utils/json-schema';

// Schema for individual edit operation
const EditOperationSchema = z.object({
  old_string: z.string().describe('The text to replace'),
  new_string: z.string().describe('The text to replace it with'),
  replace_all: z.boolean()
    .default(false)
    .optional()
    .describe('Replace all occurrences of old_string (default false)')
});

// Schema for the complete multi-edit input
const MultiEditInputSchema = z.object({
  file_path: z.string().describe('The absolute path to the file to modify'),
  edits: z.array(EditOperationSchema)
    .min(1, 'At least one edit is required')
    .describe('Array of edit operations to perform sequentially on the file')
});

type EditOperation = z.infer<typeof EditOperationSchema>;
type MultiEditInput = z.infer<typeof MultiEditInputSchema>;

interface EditResult {
  index: number;
  old_string: string;
  new_string: string;
  replacements: number;
  success: boolean;
  error?: string;
}

interface ValidationResult {
  valid: boolean;
  error?: string;
  context?: string;
}

export class MultiEditAdapter extends BaseToolAdapter<
  MultiEditInput,
  {
    filePath: string;
    originalContent: string;
    finalContent: string;
    editsApplied: number;
    totalReplacements: number;
    editResults: EditResult[];
    diff: {
      added: number;
      removed: number;
      preview: string;
    };
  }
> {
  name = 'multiEdit';
  description = 'Makes multiple edits to a single file in one atomic operation. All edits must succeed or none are applied.';
  
  // Generate JSON schema for Jupiter tools
  inputJSONSchema = zodToJsonSchema(MultiEditInputSchema, {
    target: 'jsonSchema7',
    basePath: [],
    definitionPath: 'MultiEditInput',
    $refStrategy: 'relative'
  });
  
  parameters = {
    file_path: {
      type: 'string' as const,
      description: 'The absolute path to the file to modify (must be absolute, not relative)',
      required: true
    },
    edits: {
      type: 'array' as const,
      description: 'Array of edit operations to perform sequentially on the file',
      required: true,
      items: {
        old_string: { 
          type: 'string' as const, 
          description: 'The text to replace',
          required: true 
        },
        new_string: { 
          type: 'string' as const, 
          description: 'The text to replace it with',
          required: true 
        },
        replace_all: { 
          type: 'boolean' as const, 
          description: 'Replace all occurrences of old_string (default false)',
          required: false, 
          default: false 
        }
      }
    }
  };

  /**
   * Validate edit operation
   */
  private validateEdit(edit: any, index: number): ValidationResult {
    if (!edit || typeof edit !== 'object') {
      return { 
        valid: false, 
        error: `Edit at index ${index} is not an object` 
      };
    }

    if (!edit.old_string || typeof edit.old_string !== 'string') {
      return { 
        valid: false, 
        error: `Edit at index ${index}: old_string is required and must be a string` 
      };
    }

    if (!edit.new_string || typeof edit.new_string !== 'string') {
      return { 
        valid: false, 
        error: `Edit at index ${index}: new_string is required and must be a string` 
      };
    }

    if (edit.old_string === edit.new_string) {
      return { 
        valid: false, 
        error: `Edit at index ${index}: old_string and new_string must be different` 
      };
    }

    if (edit.old_string.length === 0) {
      return { 
        valid: false, 
        error: `Edit at index ${index}: old_string cannot be empty` 
      };
    }

    return { valid: true };
  }

  /**
   * Find string with context for better error messages
   */
  private findStringWithContext(content: string, searchString: string, contextLength: number = 50): string {
    const index = content.indexOf(searchString);
    if (index === -1) return '';

    const start = Math.max(0, index - contextLength);
    const end = Math.min(content.length, index + searchString.length + contextLength);
    
    let context = content.substring(start, end);
    if (start > 0) context = '...' + context;
    if (end < content.length) context = context + '...';
    
    return context;
  }

  /**
   * Apply single edit operation
   */
  private applyEdit(
    content: string, 
    edit: EditOperation, 
    index: number
  ): { 
    newContent: string; 
    replacements: number; 
    error?: string 
  } {
    const { old_string, new_string, replace_all = false } = edit;

    // Check if old_string exists
    if (!content.includes(old_string)) {
      const similarContext = this.findStringWithContext(content, old_string.substring(0, 20));
      return {
        newContent: content,
        replacements: 0,
        error: `String not found: "${old_string}". ${
          similarContext ? `Similar context found: "${similarContext}"` : 'Previous edits may have removed it.'
        }`
      };
    }

    // Count occurrences
    const occurrences = content.split(old_string).length - 1;

    // Check if unique (when not replace_all)
    if (!replace_all && occurrences > 1) {
      const context = this.findStringWithContext(content, old_string);
      return {
        newContent: content,
        replacements: 0,
        error: `String is not unique (found ${occurrences} occurrences). ` +
               `Use replace_all=true or provide more context. ` +
               `Example context: "${context}"`
      };
    }

    // Perform replacement
    let newContent: string;
    if (replace_all) {
      newContent = content.split(old_string).join(new_string);
    } else {
      const idx = content.indexOf(old_string);
      newContent = 
        content.substring(0, idx) + 
        new_string + 
        content.substring(idx + old_string.length);
    }

    return {
      newContent,
      replacements: replace_all ? occurrences : 1
    };
  }

  async execute(params: any): Promise<any> {
    // Basic validation
    this.validateRequired(params, ['file_path', 'edits']);
    this.validateTypes(params, {
      file_path: 'string',
      edits: 'object' // Array is object in JS
    });

    const { file_path, edits } = params;

    // Validate edits array
    if (!Array.isArray(edits)) {
      this.error('edits must be an array', 'INVALID_PARAMS');
    }

    if (edits.length === 0) {
      this.error('edits array cannot be empty', 'INVALID_PARAMS');
    }

    // Validate each edit
    for (let i = 0; i < edits.length; i++) {
      const validation = this.validateEdit(edits[i], i);
      if (!validation.valid) {
        this.error(validation.error!, 'INVALID_PARAMS');
      }
    }

    try {
      // Resolve absolute path
      const absolutePath = path.isAbsolute(file_path) 
        ? file_path 
        : path.resolve(file_path);

      // Check if file exists or if we're creating a new file
      let originalContent = '';
      let isNewFile = false;
      
      try {
        originalContent = await fs.readFile(absolutePath, 'utf-8');
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          // File doesn't exist - check if first edit is creating new file
          if (edits.length > 0 && edits[0].old_string === '') {
            isNewFile = true;
            originalContent = '';
          } else {
            this.error(`File not found: ${file_path}`, 'FILE_NOT_FOUND');
          }
        } else {
          throw error;
        }
      }

      // Create directory if needed for new file
      if (isNewFile) {
        const dir = path.dirname(absolutePath);
        await fs.mkdir(dir, { recursive: true });
      }

      // Apply edits atomically - all must succeed
      let content = originalContent;
      const editResults: EditResult[] = [];
      let totalReplacements = 0;
      let allSuccessful = true;

      // First pass - validate all edits can be applied
      let tempContent = content;
      for (let i = 0; i < edits.length; i++) {
        const edit = edits[i];
        const result = this.applyEdit(tempContent, edit, i);
        
        if (result.error) {
          editResults.push({
            index: i,
            old_string: edit.old_string.substring(0, 50) + (edit.old_string.length > 50 ? '...' : ''),
            new_string: edit.new_string.substring(0, 50) + (edit.new_string.length > 50 ? '...' : ''),
            replacements: 0,
            success: false,
            error: result.error
          });
          allSuccessful = false;
          break;
        }
        
        tempContent = result.newContent;
        editResults.push({
          index: i,
          old_string: edit.old_string.substring(0, 50) + (edit.old_string.length > 50 ? '...' : ''),
          new_string: edit.new_string.substring(0, 50) + (edit.new_string.length > 50 ? '...' : ''),
          replacements: result.replacements,
          success: true
        });
      }

      // If validation failed, report error
      if (!allSuccessful) {
        const failedEdit = editResults.find(r => !r.success);
        this.error(
          `Edit ${failedEdit!.index}: ${failedEdit!.error}`,
          'OPERATION_FAILED'
        );
      }

      // Second pass - actually apply all edits
      content = originalContent;
      totalReplacements = 0;
      
      for (let i = 0; i < edits.length; i++) {
        const edit = edits[i];
        const result = this.applyEdit(content, edit, i);
        content = result.newContent;
        totalReplacements += result.replacements;
      }

      // Check if any changes were made
      if (!isNewFile && content === originalContent) {
        this.error('No changes were made to the file', 'NO_CHANGES');
      }

      // Generate diff
      const diff = createDiff(originalContent, content, file_path);
      const preview = generateChangePreview(originalContent, content, 20);

      // Write back to file atomically
      const tempPath = `${absolutePath}.tmp.${Date.now()}`;
      await fs.writeFile(tempPath, content, 'utf-8');
      
      try {
        await fs.rename(tempPath, absolutePath);
      } catch (renameError) {
        // Cleanup temp file on rename failure
        try {
          await fs.unlink(tempPath);
        } catch { /* ignore cleanup errors */ }
        throw renameError;
      }

      return this.success({
        filePath: absolutePath,
        originalContent: originalContent,
        finalContent: content,
        editsApplied: editResults.filter(r => r.success).length,
        totalReplacements,
        editResults: editResults,
        diff: {
          added: diff.added,
          removed: diff.removed,
          preview: preview
        }
      });
    } catch (error) {
      const err = error as any;
      
      if (err.code === 'ENOENT') {
        this.error(`File or directory not found: ${file_path}`, 'FILE_NOT_FOUND');
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
    if (!params.file_path || !params.edits) {
      return false;
    }

    // Check for path traversal
    if (params.file_path.includes('..')) {
      return false;
    }

    // Basic array check
    if (!Array.isArray(params.edits)) {
      return false;
    }

    return true;
  }
}

// Export singleton instance
export default new MultiEditAdapter();