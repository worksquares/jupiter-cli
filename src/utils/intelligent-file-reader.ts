/**
 * Intelligent File Reader - Smart decisions about partial vs full file reading
 */

import * as fs from 'fs/promises';
import * as path from 'path';

export interface FileReadStrategy {
  shouldReadFull: boolean;
  offset?: number;
  limit?: number;
  reason: string;
}

export interface FileAnalysis {
  size: number;
  lines: number;
  extension: string;
  isLikelyBinary: boolean;
  isLikelyGenerated: boolean;
  isTest: boolean;
  isConfig: boolean;
}

export class IntelligentFileReader {
  // File size thresholds
  private static readonly SMALL_FILE_SIZE = 10 * 1024; // 10KB
  private static readonly MEDIUM_FILE_SIZE = 100 * 1024; // 100KB
  private static readonly LARGE_FILE_SIZE = 1024 * 1024; // 1MB

  // Line count thresholds
  private static readonly FEW_LINES = 100;
  private static readonly MODERATE_LINES = 500;
  private static readonly MANY_LINES = 2000;

  // File patterns
  private static readonly CONFIG_PATTERNS = /\.(json|yaml|yml|toml|ini|env|config\.(ts|js))$/i;
  private static readonly TEST_PATTERNS = /\.(test|spec)\.(ts|js|tsx|jsx)$/i;
  private static readonly GENERATED_PATTERNS = /\.(min\.|bundle\.|dist\/|build\/|\.d\.ts$)/i;
  private static readonly BINARY_EXTENSIONS = new Set([
    '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.ico', '.svg',
    '.pdf', '.doc', '.docx', '.xls', '.xlsx',
    '.zip', '.tar', '.gz', '.rar',
    '.exe', '.dll', '.so', '.dylib',
    '.mp3', '.mp4', '.avi', '.mov',
    '.woff', '.woff2', '.ttf', '.eot'
  ]);

  /**
   * Analyze a file to determine its characteristics
   */
  static async analyzeFile(filePath: string): Promise<FileAnalysis> {
    const stats = await fs.stat(filePath);
    const extension = path.extname(filePath).toLowerCase();
    
    // Quick analysis for binary files
    if (this.BINARY_EXTENSIONS.has(extension)) {
      return {
        size: stats.size,
        lines: 0,
        extension,
        isLikelyBinary: true,
        isLikelyGenerated: false,
        isTest: false,
        isConfig: false
      };
    }

    // For text files, count lines efficiently
    let lineCount = 0;
    if (stats.size > 0 && stats.size < this.LARGE_FILE_SIZE) {
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        lineCount = content.split('\n').length;
      } catch {
        // If reading fails, assume binary
        return {
          size: stats.size,
          lines: 0,
          extension,
          isLikelyBinary: true,
          isLikelyGenerated: false,
          isTest: false,
          isConfig: false
        };
      }
    } else if (stats.size >= this.LARGE_FILE_SIZE) {
      // Estimate lines for very large files
      lineCount = Math.floor(stats.size / 80); // Assume average 80 chars per line
    }

    return {
      size: stats.size,
      lines: lineCount,
      extension,
      isLikelyBinary: false,
      isLikelyGenerated: this.GENERATED_PATTERNS.test(filePath),
      isTest: this.TEST_PATTERNS.test(filePath),
      isConfig: this.CONFIG_PATTERNS.test(filePath)
    };
  }

  /**
   * Determine the optimal reading strategy based on file analysis and context
   */
  static determineReadStrategy(
    analysis: FileAnalysis,
    context?: {
      taskType?: string;
      searchPattern?: string;
      previousReads?: string[];
      userIntent?: string;
    }
  ): FileReadStrategy {
    // Always read full for binary files (though they should be handled differently)
    if (analysis.isLikelyBinary) {
      return {
        shouldReadFull: false,
        reason: 'Binary file - should use specialized handler'
      };
    }

    // Always read full for small files
    if (analysis.size <= this.SMALL_FILE_SIZE || analysis.lines <= this.FEW_LINES) {
      return {
        shouldReadFull: true,
        reason: 'Small file - reading full content'
      };
    }

    // Always read full for config files (usually important and small)
    if (analysis.isConfig) {
      return {
        shouldReadFull: true,
        reason: 'Configuration file - reading full content'
      };
    }

    // For test files, read partially unless specifically analyzing tests
    if (analysis.isTest && context?.taskType !== 'testing') {
      return {
        shouldReadFull: false,
        offset: 0,
        limit: 50,
        reason: 'Test file - reading first 50 lines for context'
      };
    }

    // For generated files, always read partially
    if (analysis.isLikelyGenerated) {
      return {
        shouldReadFull: false,
        offset: 0,
        limit: 100,
        reason: 'Generated file - reading first 100 lines'
      };
    }

    // Context-based decisions
    if (context) {
      // If searching for something specific, read full for medium files
      if (context.searchPattern && analysis.size <= this.MEDIUM_FILE_SIZE) {
        return {
          shouldReadFull: true,
          reason: `Searching for pattern "${context.searchPattern}" - reading full content`
        };
      }

      // If user is debugging or analyzing, read more
      if (context.taskType === 'debugging' || context.taskType === 'analysis') {
        if (analysis.lines <= this.MODERATE_LINES) {
          return {
            shouldReadFull: true,
            reason: 'Debugging/analysis task - reading full content'
          };
        }
      }

      // If this file was recently read partially, maybe read more
      if (context.previousReads?.includes(analysis.extension)) {
        return {
          shouldReadFull: false,
          offset: 0,
          limit: Math.min(analysis.lines, 500),
          reason: 'Previously read file type - reading extended preview'
        };
      }
    }

    // Default strategy based on size
    if (analysis.lines <= this.MODERATE_LINES) {
      return {
        shouldReadFull: true,
        reason: 'Moderate size file - reading full content'
      };
    }

    // For large files, read intelligently
    return {
      shouldReadFull: false,
      offset: 0,
      limit: 200,
      reason: `Large file (${analysis.lines} lines) - reading first 200 lines`
    };
  }

  /**
   * Get strategic read points for large files
   */
  static getStrategicReadPoints(
    analysis: FileAnalysis,
    purpose?: string
  ): Array<{ offset: number; limit: number; description: string }> {
    const points = [];

    // Always include the beginning
    points.push({
      offset: 0,
      limit: 100,
      description: 'File header and imports'
    });

    // For code files, try to get class/function definitions
    if (['.ts', '.js', '.py', '.java', '.cs'].includes(analysis.extension)) {
      // Sample from middle
      const middleOffset = Math.floor(analysis.lines / 2);
      points.push({
        offset: middleOffset,
        limit: 50,
        description: 'Middle section sample'
      });

      // Get the end for exports/summary
      if (analysis.lines > 200) {
        points.push({
          offset: Math.max(0, analysis.lines - 50),
          limit: 50,
          description: 'File ending and exports'
        });
      }
    }

    return points;
  }

  /**
   * Smart file reading with context awareness
   */
  static async readFileIntelligently(
    filePath: string,
    context?: {
      taskType?: string;
      searchPattern?: string;
      previousReads?: string[];
      userIntent?: string;
    }
  ): Promise<{
    content: string;
    strategy: FileReadStrategy;
    analysis: FileAnalysis;
  }> {
    const analysis = await this.analyzeFile(filePath);
    const strategy = this.determineReadStrategy(analysis, context);

    let content: string;

    if (strategy.shouldReadFull) {
      content = await fs.readFile(filePath, 'utf-8');
    } else {
      const fullContent = await fs.readFile(filePath, 'utf-8');
      const lines = fullContent.split('\n');
      const offset = strategy.offset || 0;
      const limit = strategy.limit || 200;
      
      const selectedLines = lines.slice(offset, offset + limit);
      content = selectedLines.map((line, index) => {
        const lineNumber = offset + index + 1;
        return `${lineNumber.toString().padStart(6, ' ')}\t${line}`;
      }).join('\n');

      // Add a note about partial reading
      content = `[Note: Showing lines ${offset + 1}-${offset + selectedLines.length} of ${lines.length} total lines]\n\n${content}`;
    }

    return {
      content,
      strategy,
      analysis
    };
  }
}

// Helper function for quick decisions
export async function shouldReadFullFile(
  filePath: string,
  context?: any
): Promise<boolean> {
  try {
    const analysis = await IntelligentFileReader.analyzeFile(filePath);
    const strategy = IntelligentFileReader.determineReadStrategy(analysis, context);
    return strategy.shouldReadFull;
  } catch (error) {
    // On error, default to partial read
    return false;
  }
}