/**
 * NotebookEdit Tool Adapter - Edit Jupyter notebooks
 * Enhanced version based on Claude's implementation
 */

import { BaseToolAdapter } from '../base-adapter';
import * as fs from 'fs/promises';
import * as path from 'path';
import { z } from 'zod';
import { zodToJsonSchema } from '../../utils/json-schema';
import { v4 as uuidv4 } from 'uuid';

// Schema for notebook cell types
const CellTypeSchema = z.enum(['code', 'markdown']);

// Schema for edit modes
const EditModeSchema = z.enum(['replace', 'insert', 'delete']);

// Schema for notebook edit input
const NotebookEditInputSchema = z.object({
  notebook_path: z.string().describe('The absolute path to the Jupyter notebook file to edit'),
  cell_id: z.string().optional().describe('The ID of the cell to edit. When inserting, the new cell will be inserted after this cell'),
  cell_type: z.enum(['code', 'markdown']).optional().describe('The type of the cell (required for insert mode)'),
  edit_mode: z.enum(['replace', 'insert', 'delete']).default('replace').describe('The type of edit to make'),
  new_source: z.string().describe('The new source for the cell (not required for delete mode)')
});

type CellType = z.infer<typeof CellTypeSchema>;
type EditMode = z.infer<typeof EditModeSchema>;
type NotebookEditInput = z.infer<typeof NotebookEditInputSchema>;

interface NotebookCell {
  id?: string;
  cell_type: 'code' | 'markdown';
  metadata?: any;
  source: string[];
  outputs?: any[];
  execution_count?: number | null;
}

interface NotebookData {
  cells: NotebookCell[];
  metadata?: any;
  nbformat?: number;
  nbformat_minor?: number;
}

export class NotebookEditAdapter extends BaseToolAdapter<
  NotebookEditInput,
  {
    notebookPath: string;
    cellsModified: number;
    operation: string;
    cellId?: string;
    cellIndex?: number;
    cellType?: string;
    preview?: string;
  }
> {
  name = 'notebookEdit';
  description = 'Completely replaces the contents of a specific cell in a Jupyter notebook (.ipynb file) with new source';
  
  // Generate JSON schema for Jupiter tools
  inputJSONSchema = zodToJsonSchema(NotebookEditInputSchema, {
    target: 'jsonSchema7',
    basePath: [],
    definitionPath: 'NotebookEditInput',
    $refStrategy: 'relative'
  });
  
  parameters = {
    notebook_path: {
      type: 'string' as const,
      description: 'The absolute path to the Jupyter notebook file to edit (must be absolute, not relative)',
      required: true
    },
    cell_id: {
      type: 'string' as const,
      description: 'The ID of the cell to edit. When inserting, the new cell will be inserted after this cell',
      required: false
    },
    cell_type: {
      type: 'string' as const,
      description: 'The type of the cell (code or markdown). Required for insert mode',
      required: false,
      enum: ['code', 'markdown']
    },
    edit_mode: {
      type: 'string' as const,
      description: 'The type of edit to make (replace, insert, delete). Defaults to replace',
      required: false,
      default: 'replace',
      enum: ['replace', 'insert', 'delete']
    },
    new_source: {
      type: 'string' as const,
      description: 'The new source for the cell',
      required: true
    }
  };

  /**
   * Convert source string to notebook cell source array
   */
  private sourceToArray(source: string): string[] {
    if (!source) return [];
    
    // Split by newlines but preserve the newlines
    const lines = source.split('\n');
    const result: string[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      if (i < lines.length - 1) {
        result.push(lines[i] + '\n');
      } else if (lines[i].length > 0) {
        result.push(lines[i]);
      }
    }
    
    return result;
  }

  /**
   * Convert notebook cell source array to string
   */
  private arrayToSource(source: string[]): string {
    return source.join('');
  }

  /**
   * Generate a cell ID if not present
   */
  private ensureCellId(cell: NotebookCell): string {
    if (!cell.id) {
      cell.id = uuidv4().replace(/-/g, '');
    }
    return cell.id;
  }

  /**
   * Find cell by ID or index
   */
  private findCell(cells: NotebookCell[], cellId?: string): { cell: NotebookCell | null; index: number } {
    if (!cellId) {
      return { cell: null, index: -1 };
    }

    // Try to find by ID first
    const indexById = cells.findIndex(c => c.id === cellId);
    if (indexById !== -1) {
      return { cell: cells[indexById], index: indexById };
    }

    // Try to parse as index
    const index = parseInt(cellId, 10);
    if (!isNaN(index) && index >= 0 && index < cells.length) {
      return { cell: cells[index], index };
    }

    return { cell: null, index: -1 };
  }

  /**
   * Create a preview of cell content
   */
  private createPreview(source: string, maxLines: number = 5): string {
    const lines = source.split('\n');
    const preview = lines.slice(0, maxLines);
    
    if (lines.length > maxLines) {
      preview.push(`... (${lines.length - maxLines} more lines)`);
    }
    
    return preview.join('\n');
  }

  async execute(params: any): Promise<any> {
    // Basic validation
    this.validateRequired(params, ['notebook_path']);
    this.validateTypes(params, {
      notebook_path: 'string',
      cell_id: 'string',
      cell_type: 'string',
      edit_mode: 'string',
      new_source: 'string'
    });

    const { 
      notebook_path, 
      cell_id, 
      cell_type, 
      edit_mode = 'replace', 
      new_source = '' 
    } = params;

    // Validate edit mode
    if (!['replace', 'insert', 'delete'].includes(edit_mode)) {
      this.error('edit_mode must be one of: replace, insert, delete', 'INVALID_PARAMS');
    }

    // Validate cell type for insert mode
    if (edit_mode === 'insert' && !cell_type) {
      this.error('cell_type is required when using insert mode', 'INVALID_PARAMS');
    }

    // Validate cell type values
    if (cell_type && !['code', 'markdown'].includes(cell_type)) {
      this.error('cell_type must be either "code" or "markdown"', 'INVALID_PARAMS');
    }

    // Validate new_source for non-delete operations
    if (edit_mode !== 'delete' && typeof new_source !== 'string') {
      this.error('new_source is required for replace and insert modes', 'INVALID_PARAMS');
    }

    try {
      // Resolve absolute path
      const absolutePath = path.isAbsolute(notebook_path) 
        ? notebook_path 
        : path.resolve(notebook_path);

      // Check file extension
      if (!absolutePath.endsWith('.ipynb')) {
        this.error('File must be a Jupyter notebook (.ipynb)', 'INVALID_PATH');
      }

      // Read notebook file
      const content = await fs.readFile(absolutePath, 'utf-8');
      let notebook: NotebookData;
      
      try {
        notebook = JSON.parse(content);
      } catch (parseError) {
        this.error('Invalid notebook format: Failed to parse JSON', 'INVALID_FORMAT');
      }

      // Validate notebook structure
      if (!notebook.cells || !Array.isArray(notebook.cells)) {
        this.error('Invalid notebook format: Missing cells array', 'INVALID_FORMAT');
      }

      // Ensure all cells have IDs
      notebook.cells.forEach(cell => this.ensureCellId(cell));

      let cellsModified = 0;
      let operationDetails: any = {
        operation: edit_mode
      };

      // Handle different edit modes
      switch (edit_mode) {
        case 'replace': {
          if (!cell_id) {
            this.error('cell_id is required for replace mode', 'INVALID_PARAMS');
          }

          const { cell, index } = this.findCell(notebook.cells, cell_id);
          if (!cell) {
            this.error(`Cell not found: ${cell_id}`, 'CELL_NOT_FOUND');
          }

          // Replace cell content
          const oldSource = this.arrayToSource(cell.source);
          cell.source = this.sourceToArray(new_source);
          
          // Clear outputs for code cells when content changes
          if (cell.cell_type === 'code' && oldSource !== new_source) {
            cell.outputs = [];
            cell.execution_count = null;
          }

          cellsModified = 1;
          operationDetails = {
            ...operationDetails,
            cellId: cell.id,
            cellIndex: index,
            cellType: cell.cell_type,
            preview: this.createPreview(new_source)
          };
          break;
        }

        case 'insert': {
          // Create new cell
          const newCell: NotebookCell = {
            id: uuidv4().replace(/-/g, ''),
            cell_type: cell_type as CellType,
            metadata: {},
            source: this.sourceToArray(new_source)
          };

          if (cell_type === 'code') {
            newCell.outputs = [];
            newCell.execution_count = null;
          }

          // Find insertion point
          let insertIndex = notebook.cells.length; // Default to end
          if (cell_id) {
            const { index } = this.findCell(notebook.cells, cell_id);
            if (index !== -1) {
              insertIndex = index + 1; // Insert after the specified cell
            }
          } else {
            insertIndex = 0; // Insert at beginning if no cell_id
          }

          // Insert the cell
          notebook.cells.splice(insertIndex, 0, newCell);

          cellsModified = 1;
          operationDetails = {
            ...operationDetails,
            cellId: newCell.id,
            cellIndex: insertIndex,
            cellType: cell_type,
            preview: this.createPreview(new_source)
          };
          break;
        }

        case 'delete': {
          if (!cell_id) {
            this.error('cell_id is required for delete mode', 'INVALID_PARAMS');
          }

          const { cell, index } = this.findCell(notebook.cells, cell_id);
          if (!cell) {
            this.error(`Cell not found: ${cell_id}`, 'CELL_NOT_FOUND');
          }

          // Remove the cell
          notebook.cells.splice(index, 1);

          cellsModified = 1;
          operationDetails = {
            ...operationDetails,
            cellId: cell.id,
            cellIndex: index,
            cellType: cell.cell_type
          };
          break;
        }
      }

      // Write back to file atomically
      const tempPath = `${absolutePath}.tmp.${Date.now()}`;
      const updatedContent = JSON.stringify(notebook, null, 2);
      
      await fs.writeFile(tempPath, updatedContent, 'utf-8');
      
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
        message: `Notebook ${edit_mode}d successfully`,
        notebookPath: absolutePath,
        cellsModified,
        ...operationDetails
      });

    } catch (error) {
      const err = error as any;
      
      if (err.code === 'ENOENT') {
        this.error(`Notebook file not found: ${notebook_path}`, 'FILE_NOT_FOUND');
      }
      
      if (err.code === 'EACCES' || err.code === 'EPERM') {
        this.error(`Permission denied: ${notebook_path}`, 'PERMISSION_DENIED');
      }
      
      if (err.code === 'EISDIR') {
        this.error(`Path is a directory, not a file: ${notebook_path}`, 'INVALID_PATH');
      }
      
      this.error(
        `Failed to edit notebook: ${error instanceof Error ? error.message : String(error)}`, 
        'EDIT_ERROR'
      );
    }
  }

  validate(params: any): boolean {
    if (!params.notebook_path) {
      return false;
    }

    // Check for path traversal
    if (params.notebook_path.includes('..')) {
      return false;
    }

    // Validate edit mode
    if (params.edit_mode && !['replace', 'insert', 'delete'].includes(params.edit_mode)) {
      return false;
    }

    return true;
  }
}

// Export singleton instance
export default new NotebookEditAdapter();