/**
 * Hook-Aware Write Tool Adapter
 * Extends the Write adapter with hook support
 */

import { HookAwareToolAdapter } from '../../hook-aware-adapter';
import { JupiterHookManager } from '../../../hooks/hook-manager';
import { WriteAdapter } from '../write-adapter';
import * as fs from 'fs/promises';
import * as path from 'path';

interface WriteParams {
  file_path: string;
  content: string;
}

export class HookAwareWriteAdapter extends HookAwareToolAdapter<WriteParams, any> {
  private writeAdapter: WriteAdapter;
  
  name: string;
  description: string;
  parameters: any;
  
  constructor(hookManager: JupiterHookManager) {
    super(hookManager);
    this.writeAdapter = new WriteAdapter();
    
    // Copy properties from original adapter
    this.name = this.writeAdapter.name;
    this.description = this.writeAdapter.description;
    this.parameters = this.writeAdapter.parameters;
  }

  protected getToolName(): string {
    return 'Write';
  }

  protected async setHookEnvironment(params: WriteParams): Promise<void> {
    await super.setHookEnvironment(params);
    
    // Set file-specific environment variables
    process.env.JUPITER_HOOK_FILE = params.file_path;
    process.env.JUPITER_HOOK_FILE_NAME = path.basename(params.file_path);
    process.env.JUPITER_HOOK_FILE_DIR = path.dirname(params.file_path);
    process.env.JUPITER_FILE_CONTENT_LENGTH = String(params.content.length);
    process.env.JUPITER_FILE_CONTENT_LINES = String(params.content.split('\n').length);
    
    // Check if file exists
    try {
      const stats = await fs.stat(params.file_path);
      process.env.JUPITER_FILE_EXISTS = 'true';
      process.env.JUPITER_FILE_SIZE = String(stats.size);
      process.env.JUPITER_FILE_MODE = 'update';
    } catch {
      process.env.JUPITER_FILE_EXISTS = 'false';
      process.env.JUPITER_FILE_MODE = 'create';
    }

    // Set file extension
    const ext = path.extname(params.file_path);
    if (ext) {
      process.env.JUPITER_FILE_EXTENSION = ext;
    }

    // Check if it's a special file
    if (params.file_path.endsWith('CLAUDE.md') || params.file_path.endsWith('JUPITER.md')) {
      process.env.JUPITER_SPECIAL_FILE = 'memory';
    } else if (params.file_path.includes('.env')) {
      process.env.JUPITER_SPECIAL_FILE = 'environment';
    } else if (params.file_path.includes('secret') || params.file_path.includes('password')) {
      process.env.JUPITER_SPECIAL_FILE = 'sensitive';
    }
  }

  protected async clearHookEnvironment(): Promise<void> {
    await super.clearHookEnvironment();
    
    // Clear file-specific environment variables
    delete process.env.JUPITER_HOOK_FILE;
    delete process.env.JUPITER_HOOK_FILE_NAME;
    delete process.env.JUPITER_HOOK_FILE_DIR;
    delete process.env.JUPITER_FILE_CONTENT_LENGTH;
    delete process.env.JUPITER_FILE_CONTENT_LINES;
    delete process.env.JUPITER_FILE_EXISTS;
    delete process.env.JUPITER_FILE_SIZE;
    delete process.env.JUPITER_FILE_MODE;
    delete process.env.JUPITER_FILE_EXTENSION;
    delete process.env.JUPITER_SPECIAL_FILE;
  }

  protected async executeInternal(params: WriteParams): Promise<any> {
    // Delegate to the original write adapter
    return this.writeAdapter.execute(params);
  }

  // Override validation to use original adapter's validation
  validate(params: any): boolean {
    return this.writeAdapter.validate(params);
  }
}