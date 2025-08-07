import { Tools } from '../core/tools';
import * as fs from 'fs/promises';
import * as path from 'path';

export function registerDefaultTools(executor: Tools): void {
  // Write tool for creating files
  executor.registerTool({
    name: 'write',
    description: 'Write content to a file',
    parameters: [
      { name: 'filepath', type: 'string', required: true },
      { name: 'content', type: 'string', required: true }
    ],
    execute: async (params) => {
      const { filepath, content } = params;
      const fullPath = path.resolve(filepath);
      
      // Create directory if it doesn't exist
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      
      // Write file
      await fs.writeFile(fullPath, content, 'utf-8');
      
      return `File written successfully: ${fullPath}`;
    }
  });

  // Read tool for reading files
  executor.registerTool({
    name: 'read',
    description: 'Read content from a file',
    parameters: [
      { name: 'filepath', type: 'string', required: true }
    ],
    execute: async (params) => {
      const { filepath } = params;
      const fullPath = path.resolve(filepath);
      
      try {
        const content = await fs.readFile(fullPath, 'utf-8');
        return content;
      } catch (error) {
        if ((error as any).code === 'ENOENT') {
          throw new Error(`File not found: ${fullPath}`);
        }
        throw error;
      }
    }
  });

  // List tool for listing directory contents
  executor.registerTool({
    name: 'list',
    description: 'List files in a directory',
    parameters: [
      { name: 'directory', type: 'string', required: true }
    ],
    execute: async (params) => {
      const { directory } = params;
      const fullPath = path.resolve(directory);
      
      try {
        const files = await fs.readdir(fullPath);
        return files.join('\n');
      } catch (error) {
        if ((error as any).code === 'ENOENT') {
          throw new Error(`Directory not found: ${fullPath}`);
        }
        throw error;
      }
    }
  });

  // Delete tool for removing files
  executor.registerTool({
    name: 'delete',
    description: 'Delete a file',
    parameters: [
      { name: 'filepath', type: 'string', required: true }
    ],
    execute: async (params) => {
      const { filepath } = params;
      const fullPath = path.resolve(filepath);
      
      try {
        await fs.unlink(fullPath);
        return `File deleted successfully: ${fullPath}`;
      } catch (error) {
        if ((error as any).code === 'ENOENT') {
          throw new Error(`File not found: ${fullPath}`);
        }
        throw error;
      }
    }
  });

  // Bash tool for executing commands
  executor.registerTool({
    name: 'bash',
    description: 'Execute a bash command',
    parameters: [
      { name: 'command', type: 'string', required: true }
    ],
    execute: async (params) => {
      const { command } = params;
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      
      try {
        const { stdout, stderr } = await execAsync(command);
        if (stderr) {
          return `Output:\n${stdout}\n\nErrors:\n${stderr}`;
        }
        return stdout;
      } catch (error: any) {
        throw new Error(`Command failed: ${error.message}`);
      }
    }
  });

  // Search tool for finding text in files
  executor.registerTool({
    name: 'search',
    description: 'Search for text in files',
    parameters: [
      { name: 'directory', type: 'string', required: true },
      { name: 'pattern', type: 'string', required: true },
      { name: 'filePattern', type: 'string', required: false }
    ],
    execute: async (params) => {
      const { directory, pattern, filePattern = '*' } = params;
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      
      try {
        const command = `grep -r "${pattern}" ${directory} --include="${filePattern}"`;
        const { stdout } = await execAsync(command);
        return stdout || 'No matches found';
      } catch (error) {
        return 'No matches found';
      }
    }
  });

  // CodeGen tool for generating code
  executor.registerTool({
    name: 'codegen',
    description: 'Generate code based on requirements',
    parameters: [
      { name: 'requirements', type: 'string', required: true },
      { name: 'language', type: 'string', required: true },
      { name: 'framework', type: 'string', required: false }
    ],
    execute: async (params) => {
      // This is a placeholder that will be handled by the AI provider
      return JSON.stringify({
        tool: 'codegen',
        params
      });
    }
  });

  // Analyze tool for code analysis
  executor.registerTool({
    name: 'analyze',
    description: 'Analyze code for issues and improvements',
    parameters: [
      { name: 'code', type: 'string', required: true },
      { name: 'language', type: 'string', required: true }
    ],
    execute: async (params) => {
      // This is a placeholder that will be handled by the AI provider
      return JSON.stringify({
        tool: 'analyze',
        params
      });
    }
  });
}