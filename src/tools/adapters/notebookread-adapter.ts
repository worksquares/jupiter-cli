/**
 * NotebookRead Tool Adapter - Reads Jupyter notebooks
 */

import { BaseToolAdapter } from '../base-adapter';
import * as fs from 'fs/promises';
import * as path from 'path';

interface NotebookCell {
  cell_type: 'code' | 'markdown' | 'raw';
  metadata: any;
  source: string[];
  outputs?: any[];
  execution_count?: number;
}

interface Notebook {
  cells: NotebookCell[];
  metadata: any;
  nbformat: number;
  nbformat_minor: number;
}

export class NotebookReadAdapter extends BaseToolAdapter {
  name = 'notebookRead';
  description = 'Reads a Jupyter notebook and returns cells with outputs';
  parameters = {
    notebook_path: {
      type: 'string' as const,
      description: 'The absolute path to the notebook file',
      required: true
    },
    cell_id: {
      type: 'string' as const,
      description: 'The ID of a specific cell to read',
      required: false
    }
  };

  async execute(params: any): Promise<any> {
    this.validateRequired(params, ['notebook_path']);
    this.validateTypes(params, {
      notebook_path: 'string',
      cell_id: 'string'
    });

    const { notebook_path, cell_id } = params;

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

      // If specific cell requested
      if (cell_id) {
        const cellIndex = parseInt(cell_id);
        if (isNaN(cellIndex) || cellIndex < 0 || cellIndex >= notebook.cells.length) {
          this.error(`Invalid cell ID: ${cell_id}`, 'INVALID_CELL');
        }

        const cell = notebook.cells[cellIndex];
        return this.success({
          cell: this.formatCell(cell, cellIndex),
          totalCells: notebook.cells.length
        });
      }

      // Return all cells
      const formattedCells = notebook.cells.map((cell, index) => 
        this.formatCell(cell, index)
      );

      return this.success({
        notebook: {
          path: notebook_path,
          format: `${notebook.nbformat}.${notebook.nbformat_minor}`,
          metadata: notebook.metadata,
          cellCount: notebook.cells.length
        },
        cells: formattedCells
      });
    } catch (error) {
      const err = error as any;
      if (err.code === 'ENOENT') {
        this.error(`Notebook not found: ${notebook_path}`, 'UNKNOWN_ERROR');
      }
      if (error instanceof SyntaxError) {
        this.error('Invalid notebook format: not valid JSON', 'INVALID_NOTEBOOK');
      }
      this.error(`Failed to read notebook: ${error instanceof Error ? error.message : String(error)}`, 'READ_ERROR');
    }
  }

  private formatCell(cell: NotebookCell, index: number): any {
    const formatted: any = {
      id: index,
      type: cell.cell_type,
      source: Array.isArray(cell.source) ? cell.source.join('') : cell.source
    };

    // Add execution count for code cells
    if (cell.cell_type === 'code' && cell.execution_count !== null) {
      formatted.execution_count = cell.execution_count;
    }

    // Format outputs for code cells
    if (cell.cell_type === 'code' && cell.outputs && cell.outputs.length > 0) {
      formatted.outputs = cell.outputs.map(output => this.formatOutput(output));
    }

    // Add metadata if significant
    if (cell.metadata && Object.keys(cell.metadata).length > 0) {
      formatted.metadata = cell.metadata;
    }

    return formatted;
  }

  private formatOutput(output: any): any {
    if (output.output_type === 'stream') {
      return {
        type: 'stream',
        name: output.name,
        text: Array.isArray(output.text) ? output.text.join('') : output.text
      };
    }

    if (output.output_type === 'execute_result') {
      return {
        type: 'execute_result',
        execution_count: output.execution_count,
        data: output.data,
        metadata: output.metadata
      };
    }

    if (output.output_type === 'display_data') {
      return {
        type: 'display_data',
        data: output.data,
        metadata: output.metadata
      };
    }

    if (output.output_type === 'error') {
      return {
        type: 'error',
        name: output.ename,
        value: output.evalue,
        traceback: output.traceback
      };
    }

    return output;
  }

  validate(params: any): boolean {
    if (!params.notebook_path) return false;
    
    // Must be absolute path
    if (!path.isAbsolute(params.notebook_path)) {
      return false;
    }

    // Check for path traversal
    if (params.notebook_path.includes('..')) {
      return false;
    }

    return true;
  }
}

// Export singleton instance
export default new NotebookReadAdapter();