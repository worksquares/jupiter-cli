/**
 * Diff and Patch Utilities
 * Provides functions for creating and applying text diffs
 */

import { diffLines, createPatch, applyPatch } from 'diff';

export interface DiffResult {
  added: number;
  removed: number;
  patch: string;
}

/**
 * Create a unified diff patch between two strings
 */
export function createDiff(original: string, modified: string, filename?: string): DiffResult {
  const patch = createPatch(
    filename || 'file',
    original,
    modified,
    'original',
    'modified',
    { context: 3 }
  );

  // Count added and removed lines
  let added = 0;
  let removed = 0;
  
  const lines = patch.split('\n');
  for (const line of lines) {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      added++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      removed++;
    }
  }

  return { added, removed, patch };
}

/**
 * Apply a patch to a string
 */
export function applyDiff(original: string, patch: string): string | null {
  const result = applyPatch(original, patch);
  return result === false ? null : result;
}

/**
 * Create a simple line-by-line diff
 */
export function getLineDiff(original: string, modified: string): Array<{
  type: 'added' | 'removed' | 'unchanged';
  line: string;
  lineNumber?: number;
}> {
  const diff = diffLines(original, modified);
  const result: Array<{
    type: 'added' | 'removed' | 'unchanged';
    line: string;
    lineNumber?: number;
  }> = [];

  let originalLineNumber = 1;
  let modifiedLineNumber = 1;

  for (const part of diff) {
    const lines = part.value.split('\n').filter(line => line !== '');
    
    for (const line of lines) {
      if (part.added) {
        result.push({
          type: 'added',
          line,
          lineNumber: modifiedLineNumber++
        });
      } else if (part.removed) {
        result.push({
          type: 'removed',
          line,
          lineNumber: originalLineNumber++
        });
      } else {
        result.push({
          type: 'unchanged',
          line,
          lineNumber: originalLineNumber
        });
        originalLineNumber++;
        modifiedLineNumber++;
      }
    }
  }

  return result;
}

/**
 * Generate a preview of changes
 */
export function generateChangePreview(
  original: string,
  modified: string,
  maxLines: number = 10
): string {
  const diff = getLineDiff(original, modified);
  const preview: string[] = [];
  let count = 0;

  for (const item of diff) {
    if (item.type !== 'unchanged' && count < maxLines) {
      const prefix = item.type === 'added' ? '+' : '-';
      const lineNum = item.lineNumber?.toString().padStart(4, ' ') || '    ';
      preview.push(`${lineNum} ${prefix} ${item.line}`);
      count++;
    }
  }

  if (count === maxLines && diff.filter(d => d.type !== 'unchanged').length > maxLines) {
    preview.push(`... and ${diff.filter(d => d.type !== 'unchanged').length - maxLines} more changes`);
  }

  return preview.join('\n');
}

// Export the underlying diff library functions for direct use
export { createPatch, applyPatch } from 'diff';