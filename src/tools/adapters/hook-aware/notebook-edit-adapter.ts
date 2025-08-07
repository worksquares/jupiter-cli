/**
 * Hook-Aware NotebookEdit Tool Adapter
 * Extends the NotebookEdit adapter with hook support
 */

import { HookAwareToolAdapter } from '../../hook-aware-adapter';
import { JupiterHookManager } from '../../../hooks/hook-manager';
import { NotebookEditAdapter } from '../notebook-edit-adapter';
import * as fs from 'fs/promises';
import * as path from 'path';

interface NotebookEditParams {
  notebook_path: string;
  cell_id?: string;
  cell_type?: 'code' | 'markdown';
  edit_mode?: 'replace' | 'insert' | 'delete';
  new_source: string;
}

export class HookAwareNotebookEditAdapter extends HookAwareToolAdapter<NotebookEditParams, any> {
  private notebookEditAdapter: NotebookEditAdapter;
  
  name: string;
  description: string;
  parameters: any;
  
  constructor(hookManager: JupiterHookManager) {
    super(hookManager);
    this.notebookEditAdapter = new NotebookEditAdapter();
    
    // Copy properties from original adapter
    this.name = this.notebookEditAdapter.name;
    this.description = this.notebookEditAdapter.description;
    this.parameters = this.notebookEditAdapter.parameters;
  }

  protected getToolName(): string {
    return 'NotebookEdit';
  }

  protected async setHookEnvironment(params: NotebookEditParams): Promise<void> {
    await super.setHookEnvironment(params);
    
    // Set notebook-specific environment variables
    process.env.JUPITER_HOOK_FILE = params.notebook_path;
    process.env.JUPITER_HOOK_FILE_NAME = path.basename(params.notebook_path);
    process.env.JUPITER_HOOK_FILE_DIR = path.dirname(params.notebook_path);
    process.env.JUPITER_NOTEBOOK_PATH = params.notebook_path;
    
    // Set cell-specific variables
    if (params.cell_id !== undefined) {
      process.env.JUPITER_CELL_ID = params.cell_id;
    }
    
    process.env.JUPITER_CELL_TYPE = params.cell_type || 'code';
    process.env.JUPITER_EDIT_MODE = params.edit_mode || 'replace';
    process.env.JUPITER_NEW_SOURCE_LENGTH = String(params.new_source.length);
    process.env.JUPITER_NEW_SOURCE_LINES = String(params.new_source.split('\n').length);
    
    // Check if notebook exists
    try {
      const stats = await fs.stat(params.notebook_path);
      process.env.JUPITER_FILE_EXISTS = 'true';
      process.env.JUPITER_FILE_SIZE = String(stats.size);
      
      // Try to count cells in notebook
      try {
        const content = await fs.readFile(params.notebook_path, 'utf-8');
        const notebook = JSON.parse(content);
        if (notebook.cells && Array.isArray(notebook.cells)) {
          process.env.JUPITER_NOTEBOOK_CELL_COUNT = String(notebook.cells.length);
        }
      } catch {
        // Ignore JSON parsing errors
      }
    } catch {
      process.env.JUPITER_FILE_EXISTS = 'false';
    }

    // Set operation type for clarity
    if (params.edit_mode === 'insert') {
      process.env.JUPITER_OPERATION = 'add_cell';
    } else if (params.edit_mode === 'delete') {
      process.env.JUPITER_OPERATION = 'delete_cell';
    } else {
      process.env.JUPITER_OPERATION = 'update_cell';
    }
  }

  protected async clearHookEnvironment(): Promise<void> {
    await super.clearHookEnvironment();
    
    // Clear notebook-specific environment variables
    delete process.env.JUPITER_HOOK_FILE;
    delete process.env.JUPITER_HOOK_FILE_NAME;
    delete process.env.JUPITER_HOOK_FILE_DIR;
    delete process.env.JUPITER_NOTEBOOK_PATH;
    delete process.env.JUPITER_CELL_ID;
    delete process.env.JUPITER_CELL_TYPE;
    delete process.env.JUPITER_EDIT_MODE;
    delete process.env.JUPITER_NEW_SOURCE_LENGTH;
    delete process.env.JUPITER_NEW_SOURCE_LINES;
    delete process.env.JUPITER_FILE_EXISTS;
    delete process.env.JUPITER_FILE_SIZE;
    delete process.env.JUPITER_NOTEBOOK_CELL_COUNT;
    delete process.env.JUPITER_OPERATION;
  }

  protected async executeInternal(params: NotebookEditParams): Promise<any> {
    // Delegate to the original notebook edit adapter
    return this.notebookEditAdapter.execute(params);
  }

  // Override validation to use original adapter's validation
  validate(params: any): boolean {
    return this.notebookEditAdapter.validate(params);
  }
}