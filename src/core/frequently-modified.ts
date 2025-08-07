/**
 * Frequently Modified Files Analysis
 * Analyzes git history to identify core application files
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { Logger } from '../utils/logger';

const execAsync = promisify(exec);

export interface FileModificationInfo {
  filename: string;
  modificationCount: number;
  path: string;
}

export class FrequentlyModifiedAnalyzer {
  private logger = new Logger('FrequentlyModifiedAnalyzer');

  /**
   * Get frequently modified files from git history
   */
  async getFrequentlyModifiedFiles(limit: number = 100): Promise<FileModificationInfo[]> {
    try {
      // Get file modification counts from git
      const { stdout } = await execAsync(
        `git log --pretty=format: --name-only | sort | uniq -c | sort -rg | head -${limit}`
      );

      const files: FileModificationInfo[] = [];
      const lines = stdout.trim().split('\n');

      for (const line of lines) {
        const match = line.trim().match(/^\s*(\d+)\s+(.+)$/);
        if (match) {
          const count = parseInt(match[1], 10);
          const filepath = match[2];
          const filename = filepath.split('/').pop() || filepath;
          
          files.push({
            filename,
            modificationCount: count,
            path: filepath
          });
        }
      }

      return files;
    } catch (error) {
      this.logger.error('Failed to get git history:', error);
      return [];
    }
  }

  /**
   * Analyze files to find core application logic
   */
  async analyzeCoreFiles(files: FileModificationInfo[]): Promise<string[]> {
    // Filter out common non-application files
    const excludePatterns = [
      /package-lock\.json$/,
      /yarn\.lock$/,
      /\.gitignore$/,
      /\.env/,
      /node_modules/,
      /dist\//,
      /build\//,
      /coverage\//,
      /\.test\./,
      /\.spec\./,
      /\.md$/,
      /\.txt$/,
      /\.json$/,
      /\.yaml$/,
      /\.yml$/
    ];

    const coreFiles = files
      .filter(file => !excludePatterns.some(pattern => pattern.test(file.path)))
      .filter(() => {
        // Ensure diversity - not all from same folder
        // const folder = file.path.split('/').slice(0, -1).join('/');
        return true; // More complex logic could be added here
      })
      .slice(0, 5) // Get top 5
      .map(file => file.filename);

    return coreFiles;
  }

  /**
   * Get AI analysis of frequently modified files
   */
  async getAIAnalysis(files: FileModificationInfo[], aiProvider: any): Promise<string[]> {
    const fileList = files.map(f => `${f.modificationCount} ${f.path}`).join('\n');
    
    const systemPrompt = [
      "You are an expert at analyzing git history. Given a list of files and their modification counts,",
      "return exactly five filenames that are frequently modified and represent core application logic",
      "(not auto-generated files, dependencies, or configuration). Make sure filenames are diverse,",
      "not all in the same folder, and are a mix of user and other users.",
      "Return only the filenames' basenames (without the path) separated by newlines with no explanation."
    ].join(' ');

    const response = await aiProvider.chat(systemPrompt, fileList);
    
    return response.trim().split('\n').map((f: string) => f.trim()).filter((f: string) => f);
  }
}