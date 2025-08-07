/**
 * Grep Tool Adapter - Search for patterns in files
 */

import { BaseToolAdapter } from '../base-adapter';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class GrepAdapter extends BaseToolAdapter {
  name = 'grep';
  description = 'Search for patterns in files using ripgrep';
  parameters = {
    pattern: {
      type: 'string' as const,
      description: 'The regular expression pattern to search for',
      required: true
    },
    path: {
      type: 'string' as const,
      description: 'File or directory to search in',
      required: false,
      default: '.'
    },
    glob: {
      type: 'string' as const,
      description: 'Glob pattern to filter files',
      required: false
    },
    type: {
      type: 'string' as const,
      description: 'File type to search',
      required: false
    },
    output_mode: {
      type: 'string' as const,
      description: 'Output mode: content, files_with_matches, or count',
      required: false,
      default: 'files_with_matches',
      enum: ['content', 'files_with_matches', 'count']
    },
    '-A': {
      type: 'number' as const,
      description: 'Lines after match',
      required: false
    },
    '-B': {
      type: 'number' as const,
      description: 'Lines before match',
      required: false
    },
    '-C': {
      type: 'number' as const,
      description: 'Lines around match',
      required: false
    },
    '-i': {
      type: 'boolean' as const,
      description: 'Case insensitive',
      required: false
    },
    '-n': {
      type: 'boolean' as const,
      description: 'Show line numbers',
      required: false
    },
    multiline: {
      type: 'boolean' as const,
      description: 'Enable multiline mode',
      required: false
    },
    head_limit: {
      type: 'number' as const,
      description: 'Limit output lines',
      required: false
    }
  };

  async execute(params: any): Promise<any> {
    this.validateRequired(params, ['pattern']);

    const {
      pattern,
      path = '.',
      glob,
      type,
      output_mode = 'files_with_matches',
      '-A': after,
      '-B': before,
      '-C': context,
      '-i': caseInsensitive,
      '-n': lineNumbers,
      multiline = false,
      head_limit
    } = params;

    const args: string[] = [];
    
    // Output mode
    if (output_mode === 'files_with_matches') {
      args.push('-l');
    } else if (output_mode === 'count') {
      args.push('-c');
    }
    
    // Context
    if (output_mode === 'content') {
      if (after !== undefined) args.push('-A', after.toString());
      if (before !== undefined) args.push('-B', before.toString());
      if (context !== undefined) args.push('-C', context.toString());
      if (lineNumbers) args.push('-n');
    }
    
    // Options
    if (caseInsensitive) args.push('-i');
    if (multiline) args.push('-U', '--multiline-dotall');
    if (glob) args.push('--glob', glob);
    if (type) args.push('--type', type);
    
    args.push(pattern, path);

    try {
      const { stdout } = await execAsync(`rg ${args.join(' ')}`, {
        maxBuffer: 10 * 1024 * 1024
      });

      let result = stdout || '';
      
      if (head_limit && result) {
        const lines = result.split('\n');
        result = lines.slice(0, head_limit).join('\n');
      }
      
      return this.success(result);
    } catch (error: any) {
      if (error.code === 1) {
        // No matches found
        return this.success('');
      }
      
      const stderr = error.stderr || '';
      if (stderr.includes('No such file or directory')) {
        this.error('Path not found', 'PATH_NOT_FOUND');
      }
      
      this.error(`Search failed: ${stderr || error.message}`, 'SEARCH_ERROR');
    }
  }

  validate(params: any): boolean {
    return !!params.pattern;
  }
}

export default new GrepAdapter();
