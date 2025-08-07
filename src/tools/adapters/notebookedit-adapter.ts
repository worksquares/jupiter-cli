/**
 * NotebookEdit Tool Adapter - Edits Jupyter notebooks
 */

import { BaseToolAdapter } from '../base-adapter';
import * as fs from 'fs/promises';
import * as path from 'path';

interface NotebookCell {
  cell_type: 'code' | 'markdown' | 'raw';
  metadata: any;
  source: string[];
  outputs?: any[];
  execution_count?: number | null;
}

interface Notebook {
  cells: NotebookCell[];
  metadata: any;
  nbformat: number;
  nbformat_minor: number;
}

export class NotebookEditAdapter extends BaseToolAdapter {
  name = 'notebookEdit';
  description = 'Edits cells in a Jupyter notebook';
  parameters = {
    notebook_path: {
      type: 'string' as const,
      description: 'The absolute path to the notebook file',
      required: true
    },
    cell_id: {
      type: 'string' as const,
      description: 'The ID of the cell to edit',
      required: false
    },
    new_source: {
      type: 'string' as const,
      description: 'The new source for the cell',
      required: true
    },
    cell_type: {
      type: 'string' as const,
      description: 'The type of the cell',
      required: false,
      enum: ['code', 'markdown']
    },
    edit_mode: {
      type: 'string' as const,
      description: 'The type of edit to make',
      required: false,
      enum: ['replace', 'insert', 'delete'],
      default: 'replace'
    }
  };

  async execute(params: any): Promise<any> {
    this.validateRequired(params, ['notebook_path', 'new_source']);
    this.validateTypes(params, {
      notebook_path: 'string',
      cell_id: 'string',
      new_source: 'string',
      cell_type: 'string' as const,
      edit_mode: 'string'
    });

    const { 
      notebook_path, 
      cell_id, 
      new_source, 
      cell_type, 
      edit_mode = 'replace' 
    } = params;

    // Ensure path is absolute
    if (!path.isAbsolute(notebook_path)) {
      this.error('Path must be absolute', 'UNKNOWN_ERROR');
    }

    // Check file extension
    if (!notebook_path.endsWith('.ipynb')) {
      this.error('File must be a Jupyter notebook (.ipynb)', 'UNKNOWN_ERROR');
    }

    try {
      // Read notebook file
      const content = await fs.readFile(notebook_path, 'utf-8');
      const notebook: Notebook = JSON.parse(content);

      // Validate notebook format
      if (!notebook.cells || !Array.isArray(notebook.cells)) {
        this.error('Invalid notebook format: missing cells', 'INVALID_NOTEBOOK');
      }

      let result: any;

      switch (edit_mode) {
        case 'replace':
          result = this.replaceCell(notebook, cell_id, new_source, cell_type);
          break;
        
        case 'insert':
          result = this.insertCell(notebook, cell_id, new_source, cell_type);
          break;
        
        case 'delete':
          result = this.deleteCell(notebook, cell_id);
          break;
        
        default:
          this.error(`Invalid edit mode: ${edit_mode}`, 'UNKNOWN_ERROR');
      }

      if (!result.success) {
        this.error(result.error, 'UNKNOWN_ERROR');
      }

      // Write back to file
      const updatedContent = JSON.stringify(notebook, null, 2);
      await fs.writeFile(notebook_path, updatedContent, 'utf-8');

      return this.success({
        message: result.message,
        notebook_path,
        edit_mode,
        cell_id: result.cell_id,
        total_cells: notebook.cells.length
      });
    } catch (error) {
      const err = error as any;
      if (err.code === 'ENOENT') {
        this.error(`Notebook not found: ${notebook_path}`, 'UNKNOWN_ERROR');
      }
      this.error(`Failed to edit notebook: ${error instanceof Error ? error.message : String(error)}`, 'EDIT_ERROR');
    }
  }

  private replaceCell(
    notebook: Notebook, 
    cell_id: string | undefined, 
    new_source: string, 
    cell_type?: string
  ): any {
    if (cell_id === undefined) {
      return { success: false, error: 'cell_id required for replace mode' };
    }

    const cellIndex = parseInt(cell_id);
    if (isNaN(cellIndex) || cellIndex < 0 || cellIndex >= notebook.cells.length) {
      return { success: false, error: `Invalid cell ID: ${cell_id}` };
    }

    const cell = notebook.cells[cellIndex];
    
    // Update source
    cell.source = this.splitSource(new_source);
    
    // Update type if specified
    if (cell_type && ['code', 'markdown'].includes(cell_type)) {
      cell.cell_type = cell_type as 'code' | 'markdown';
      
      // Clear outputs if changing to markdown
      if (cell_type === 'markdown' && cell.outputs) {
        delete cell.outputs;
        delete cell.execution_count;
      }
      
      // Add outputs array if changing to code
      if (cell_type === 'code' && !cell.outputs) {
        cell.outputs = [];
        cell.execution_count = null;
      }
    }

    return { 
      success: true, 
      message: `Cell ${cellIndex} updated successfully`,
      cell_id: cellIndex
    };
  }

  private insertCell(
    notebook: Notebook, 
    cell_id: string | undefined, 
    new_source: string, 
    cell_type?: string
  ): any {
    const type = cell_type || 'code';
    if (!['code', 'markdown'].includes(type)) {
      return { success: false, error: 'cell_type must be "code" or "markdown" for insert' };
    }

    const newCell: NotebookCell = {
      cell_type: type as 'code' | 'markdown',
      metadata: {},
      source: this.splitSource(new_source)
    };

    if (type === 'code') {
      newCell.outputs = [];
      newCell.execution_count = null;
    }

    // Insert at specific position or at end
    if (cell_id !== undefined) {
      const cellIndex = parseInt(cell_id);
      if (isNaN(cellIndex) || cellIndex < 0 || cellIndex > notebook.cells.length) {
        return { success: false, error: `Invalid cell ID for insert: ${cell_id}` };
      }
      
      notebook.cells.splice(cellIndex, 0, newCell);
      return { 
        success: true, 
        message: `New cell inserted at position ${cellIndex}`,
        cell_id: cellIndex
      };
    } else {
      notebook.cells.push(newCell);
      return { 
        success: true, 
        message: `New cell appended at end`,
        cell_id: notebook.cells.length - 1
      };
    }
  }

  private deleteCell(notebook: Notebook, cell_id: string | undefined): any {
    if (cell_id === undefined) {
      return { success: false, error: 'cell_id required for delete mode' };
    }

    const cellIndex = parseInt(cell_id);
    if (isNaN(cellIndex) || cellIndex < 0 || cellIndex >= notebook.cells.length) {
      return { success: false, error: `Invalid cell ID: ${cell_id}` };
    }

    notebook.cells.splice(cellIndex, 1);
    
    return { 
      success: true, 
      message: `Cell ${cellIndex} deleted successfully`,
      cell_id: cellIndex
    };
  }

  private splitSource(source: string): string[] {
    // Split source into lines, preserving newlines for notebook format
    const lines = source.split('\n');
    
    // Add newline to all lines except the last
    return lines.map((line, index) => 
      index < lines.length - 1 ? line + '\n' : line
    );
  }

  validate(params: any): boolean {
    if (!params.notebook_path || !params.new_source) {
      return false;
    }

    // Must be absolute path
    if (!path.isAbsolute(params.notebook_path)) {
      return false;
    }

    // Check for path traversal
    if (params.notebook_path.includes('..')) {
      return false;
    }

    // Validate edit mode
    if (params.edit_mode && 
        !['replace', 'insert', 'delete'].includes(params.edit_mode)) {
      return false;
    }

    // Validate cell type
    if (params.cell_type && 
        !['code', 'markdown'].includes(params.cell_type)) {
      return false;
    }

    return true;
  }
}

// Export singleton instance
export default new NotebookEditAdapter();