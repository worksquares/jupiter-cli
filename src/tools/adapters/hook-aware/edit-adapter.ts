/**
 * Hook-Aware Edit Tool Adapter
 * Extends the Edit adapter with hook support
 */

import { HookAwareToolAdapter } from '../../hook-aware-adapter';
import { JupiterHookManager } from '../../../hooks/hook-manager';
import { EditAdapter } from '../edit-adapter';
import * as fs from 'fs/promises';
import * as path from 'path';
import { FileValidator } from '../../../utils/file-validator';
import { createDiff, generateChangePreview } from '../../../utils/diff-utils';

interface EditParams {
  file_path: string;
  old_string: string;
  new_string: string;
  replace_all?: boolean;
}

export class HookAwareEditAdapter extends HookAwareToolAdapter<EditParams, any> {
  private editAdapter: EditAdapter;
  
  name: string;
  description: string;
  parameters: any;
  
  constructor(hookManager: JupiterHookManager) {
    super(hookManager);
    this.editAdapter = new EditAdapter();
    
    // Copy properties from original adapter
    this.name = this.editAdapter.name;
    this.description = this.editAdapter.description;
    this.parameters = this.editAdapter.parameters;
  }

  protected getToolName(): string {
    return 'Edit';
  }

  protected async setHookEnvironment(params: EditParams): Promise<void> {
    await super.setHookEnvironment(params);
    
    // Set file-specific environment variables
    process.env.JUPITER_HOOK_FILE = params.file_path;
    process.env.JUPITER_HOOK_FILE_NAME = path.basename(params.file_path);
    process.env.JUPITER_HOOK_FILE_DIR = path.dirname(params.file_path);
    process.env.JUPITER_OLD_STRING = params.old_string;
    process.env.JUPITER_NEW_STRING = params.new_string;
    process.env.JUPITER_REPLACE_ALL = String(params.replace_all || false);
    
    // Try to get file size if it exists
    try {
      const stats = await fs.stat(params.file_path);
      process.env.JUPITER_FILE_SIZE = String(stats.size);
      process.env.JUPITER_FILE_EXISTS = 'true';
    } catch {
      process.env.JUPITER_FILE_EXISTS = 'false';
    }
  }

  protected async clearHookEnvironment(): Promise<void> {
    await super.clearHookEnvironment();
    
    // Clear file-specific environment variables
    delete process.env.JUPITER_HOOK_FILE;
    delete process.env.JUPITER_HOOK_FILE_NAME;
    delete process.env.JUPITER_HOOK_FILE_DIR;
    delete process.env.JUPITER_OLD_STRING;
    delete process.env.JUPITER_NEW_STRING;
    delete process.env.JUPITER_REPLACE_ALL;
    delete process.env.JUPITER_FILE_SIZE;
    delete process.env.JUPITER_FILE_EXISTS;
  }

  protected async executeInternal(params: EditParams): Promise<any> {
    // Delegate to the original edit adapter
    return this.editAdapter.execute(params);
  }

  // Override validation to use original adapter's validation
  validate(params: any): boolean {
    return this.editAdapter.validate(params);
  }
}