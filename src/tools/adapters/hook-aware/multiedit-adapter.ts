/**
 * Hook-Aware MultiEdit Tool Adapter
 * Extends the MultiEdit adapter with hook support
 */

import { HookAwareToolAdapter } from '../../hook-aware-adapter';
import { JupiterHookManager } from '../../../hooks/hook-manager';
import { MultiEditAdapter } from '../multiedit-adapter';
import * as fs from 'fs/promises';
import * as path from 'path';

interface EditOperation {
  old_string: string;
  new_string: string;
  replace_all?: boolean;
}

interface MultiEditParams {
  file_path: string;
  edits: EditOperation[];
}

export class HookAwareMultiEditAdapter extends HookAwareToolAdapter<MultiEditParams, any> {
  private multiEditAdapter: MultiEditAdapter;
  
  name: string;
  description: string;
  parameters: any;
  
  constructor(hookManager: JupiterHookManager) {
    super(hookManager);
    this.multiEditAdapter = new MultiEditAdapter();
    
    // Copy properties from original adapter
    this.name = this.multiEditAdapter.name;
    this.description = this.multiEditAdapter.description;
    this.parameters = this.multiEditAdapter.parameters;
  }

  protected getToolName(): string {
    return 'MultiEdit';
  }

  protected async setHookEnvironment(params: MultiEditParams): Promise<void> {
    await super.setHookEnvironment(params);
    
    // Set file-specific environment variables
    process.env.JUPITER_HOOK_FILE = params.file_path;
    process.env.JUPITER_HOOK_FILE_NAME = path.basename(params.file_path);
    process.env.JUPITER_HOOK_FILE_DIR = path.dirname(params.file_path);
    process.env.JUPITER_EDIT_COUNT = String(params.edits.length);
    
    // Set first edit info (most hooks will only care about this)
    if (params.edits.length > 0) {
      process.env.JUPITER_FIRST_OLD_STRING = params.edits[0].old_string;
      process.env.JUPITER_FIRST_NEW_STRING = params.edits[0].new_string;
      process.env.JUPITER_FIRST_REPLACE_ALL = String(params.edits[0].replace_all || false);
    }

    // Check if file exists
    try {
      const stats = await fs.stat(params.file_path);
      process.env.JUPITER_FILE_EXISTS = 'true';
      process.env.JUPITER_FILE_SIZE = String(stats.size);
      
      // Check if it's a new file creation (first edit with empty old_string)
      if (params.edits.length > 0 && params.edits[0].old_string === '') {
        process.env.JUPITER_FILE_MODE = 'create';
      } else {
        process.env.JUPITER_FILE_MODE = 'update';
      }
    } catch {
      process.env.JUPITER_FILE_EXISTS = 'false';
      process.env.JUPITER_FILE_MODE = 'create';
    }

    // Set file extension
    const ext = path.extname(params.file_path);
    if (ext) {
      process.env.JUPITER_FILE_EXTENSION = ext;
    }

    // Serialize all edits as JSON for advanced hooks
    process.env.JUPITER_ALL_EDITS = JSON.stringify(params.edits);
  }

  protected async clearHookEnvironment(): Promise<void> {
    await super.clearHookEnvironment();
    
    // Clear file-specific environment variables
    delete process.env.JUPITER_HOOK_FILE;
    delete process.env.JUPITER_HOOK_FILE_NAME;
    delete process.env.JUPITER_HOOK_FILE_DIR;
    delete process.env.JUPITER_EDIT_COUNT;
    delete process.env.JUPITER_FIRST_OLD_STRING;
    delete process.env.JUPITER_FIRST_NEW_STRING;
    delete process.env.JUPITER_FIRST_REPLACE_ALL;
    delete process.env.JUPITER_FILE_EXISTS;
    delete process.env.JUPITER_FILE_SIZE;
    delete process.env.JUPITER_FILE_MODE;
    delete process.env.JUPITER_FILE_EXTENSION;
    delete process.env.JUPITER_ALL_EDITS;
  }

  protected async executeInternal(params: MultiEditParams): Promise<any> {
    // Delegate to the original multiedit adapter
    return this.multiEditAdapter.execute(params);
  }

  // Override validation to use original adapter's validation
  validate(params: any): boolean {
    return this.multiEditAdapter.validate(params);
  }
}