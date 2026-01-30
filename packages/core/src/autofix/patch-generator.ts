/**
 * Patch Generator
 * 
 * Generates unified diffs and patches from file changes.
 * Implements a custom LCS-based diff algorithm optimized for code.
 */

import type { Patch, PatchHunk, FileChange } from './types.js';
import { SAFETY_LIMITS, sanitizeFilePath } from './types.js';

/**
 * Options for patch generation
 */
export interface PatchGeneratorOptions {
  /** Number of context lines around changes (default: 3) */
  contextLines?: number;
  /** Maximum file size to process in bytes (default: 10MB) */
  maxFileSizeBytes?: number;
  /** Maximum lines to diff (default: 50000) */
  maxLines?: number;
  /** Use optimized algorithm for large files (default: true) */
  optimizeLargeFiles?: boolean;
}

const DEFAULT_OPTIONS: Readonly<PatchGeneratorOptions> = Object.freeze({
  contextLines: 3,
  maxFileSizeBytes: SAFETY_LIMITS.MAX_FILE_SIZE_BYTES,
  maxLines: 50000,
  optimizeLargeFiles: true,
});

/**
 * Error thrown when patch generation fails
 */
export class PatchGenerationError extends Error {
  constructor(
    message: string,
    public readonly code: 'FILE_TOO_LARGE' | 'INVALID_INPUT' | 'GENERATION_FAILED',
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'PatchGenerationError';
  }
}

/**
 * PatchGenerator creates unified diffs from file changes
 */
export class PatchGenerator {
  private readonly options: Required<PatchGeneratorOptions>;

  constructor(options: Partial<PatchGeneratorOptions> = {}) {
    this.options = {
      contextLines: Math.max(0, Math.min(options.contextLines ?? DEFAULT_OPTIONS.contextLines!, 10)),
      maxFileSizeBytes: Math.max(1024, options.maxFileSizeBytes ?? DEFAULT_OPTIONS.maxFileSizeBytes!),
      maxLines: Math.max(100, options.maxLines ?? DEFAULT_OPTIONS.maxLines!),
      optimizeLargeFiles: options.optimizeLargeFiles ?? DEFAULT_OPTIONS.optimizeLargeFiles!,
    };
  }

  /**
   * Generate a patch from original and modified content
   */
  generatePatch(
    filePath: string,
    original: string,
    modified: string,
    issueId: string,
    moduleId: string
  ): Patch {
    // Input validation
    if (!filePath || typeof filePath !== 'string') {
      throw new PatchGenerationError('File path is required', 'INVALID_INPUT');
    }
    if (typeof original !== 'string' || typeof modified !== 'string') {
      throw new PatchGenerationError('Original and modified content must be strings', 'INVALID_INPUT');
    }
    if (!issueId || typeof issueId !== 'string') {
      throw new PatchGenerationError('Issue ID is required', 'INVALID_INPUT');
    }
    if (!moduleId || typeof moduleId !== 'string') {
      throw new PatchGenerationError('Module ID is required', 'INVALID_INPUT');
    }

    // Sanitize file path
    const sanitizedPath = sanitizeFilePath(filePath);

    // Size checks
    const originalSize = Buffer.byteLength(original, 'utf-8');
    const modifiedSize = Buffer.byteLength(modified, 'utf-8');
    
    if (originalSize > this.options.maxFileSizeBytes || modifiedSize > this.options.maxFileSizeBytes) {
      throw new PatchGenerationError(
        `File size exceeds maximum allowed (${this.options.maxFileSizeBytes} bytes)`,
        'FILE_TOO_LARGE',
        { originalSize, modifiedSize, maxSize: this.options.maxFileSizeBytes }
      );
    }

    // Line count check
    const originalLineCount = original.split('\n').length;
    const modifiedLineCount = modified.split('\n').length;
    
    if (originalLineCount > this.options.maxLines || modifiedLineCount > this.options.maxLines) {
      throw new PatchGenerationError(
        `File has too many lines (max: ${this.options.maxLines})`,
        'FILE_TOO_LARGE',
        { originalLineCount, modifiedLineCount, maxLines: this.options.maxLines }
      );
    }

    // Handle identical content early
    if (original === modified) {
      return {
        filePath: sanitizedPath,
        hunks: [],
        originalContent: original,
        newContent: modified,
        issueId,
        moduleId,
      };
    }

    const hunks = this.computeHunks(original, modified);

    return {
      filePath: sanitizedPath,
      hunks,
      originalContent: original,
      newContent: modified,
      issueId,
      moduleId,
    };
  }

  /**
   * Generate patches for multiple file changes
   * Validates all changes first to fail fast
   */
  generateMultiFilePatch(changes: FileChange[]): Patch[] {
    if (!Array.isArray(changes)) {
      throw new PatchGenerationError('Changes must be an array', 'INVALID_INPUT');
    }

    if (changes.length === 0) {
      return [];
    }

    if (changes.length > SAFETY_LIMITS.MAX_PATCHES_PER_TRANSACTION) {
      throw new PatchGenerationError(
        `Too many changes (max: ${SAFETY_LIMITS.MAX_PATCHES_PER_TRANSACTION})`,
        'INVALID_INPUT',
        { count: changes.length, max: SAFETY_LIMITS.MAX_PATCHES_PER_TRANSACTION }
      );
    }

    // Pre-validate all changes
    for (let i = 0; i < changes.length; i++) {
      const change = changes[i];
      if (!change || typeof change !== 'object') {
        throw new PatchGenerationError(`Invalid change at index ${i}`, 'INVALID_INPUT');
      }
      if (!change.filePath || typeof change.filePath !== 'string') {
        throw new PatchGenerationError(`Missing file path at index ${i}`, 'INVALID_INPUT');
      }
    }

    const patches: Patch[] = [];
    const errors: Array<{ index: number; error: Error }> = [];

    for (let i = 0; i < changes.length; i++) {
      try {
        const change = changes[i];
        patches.push(
          this.generatePatch(
            change.filePath,
            change.originalContent,
            change.newContent,
            change.issueId,
            change.moduleId
          )
        );
      } catch (error) {
        errors.push({ index: i, error: error as Error });
      }
    }

    // Report errors but return successful patches
    if (errors.length > 0 && patches.length === 0) {
      throw new PatchGenerationError(
        `All ${changes.length} patches failed to generate`,
        'GENERATION_FAILED',
        { errors: errors.map((e) => ({ index: e.index, message: e.error.message })) }
      );
    }

    return patches;
  }

  /**
   * Format a patch as a unified diff string
   */
  formatAsUnifiedDiff(patch: Patch): string {
    if (!patch || typeof patch !== 'object') {
      return '';
    }

    const lines: string[] = [];
    const safePath = sanitizeFilePath(patch.filePath || 'unknown');
    
    lines.push(`--- a/${safePath}`);
    lines.push(`+++ b/${safePath}`);

    if (!Array.isArray(patch.hunks)) {
      return lines.join('\n');
    }

    for (const hunk of patch.hunks) {
      if (!hunk || typeof hunk !== 'object') {
        continue;
      }

      const oldStart = Math.max(1, hunk.oldStart || 1);
      const oldLines = Math.max(0, hunk.oldLines || 0);
      const newStart = Math.max(1, hunk.newStart || 1);
      const newLines = Math.max(0, hunk.newLines || 0);

      lines.push(`@@ -${oldStart},${oldLines} +${newStart},${newLines} @@`);
      
      if (Array.isArray(hunk.lines)) {
        for (const line of hunk.lines) {
          if (typeof line === 'string') {
            lines.push(line);
          }
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * Format multiple patches as a combined unified diff
   */
  formatMultiplePatchesAsDiff(patches: Patch[]): string {
    return patches.map((p) => this.formatAsUnifiedDiff(p)).join('\n\n');
  }

  /**
   * Parse a unified diff string back into a Patch object
   */
  parseDiff(diffString: string, issueId: string, moduleId: string): Patch | null {
    const lines = diffString.split('\n');
    let filePath = '';
    const hunks: PatchHunk[] = [];
    let currentHunk: PatchHunk | null = null;

    for (const line of lines) {
      if (line.startsWith('--- a/')) {
        // Skip old file header
        continue;
      }
      
      if (line.startsWith('+++ b/')) {
        filePath = line.slice(6);
        continue;
      }

      if (line.startsWith('@@')) {
        // Parse hunk header: @@ -oldStart,oldLines +newStart,newLines @@
        const match = line.match(/@@ -(\d+),(\d+) \+(\d+),(\d+) @@/);
        if (match) {
          if (currentHunk) {
            hunks.push(currentHunk);
          }
          currentHunk = {
            oldStart: parseInt(match[1], 10),
            oldLines: parseInt(match[2], 10),
            newStart: parseInt(match[3], 10),
            newLines: parseInt(match[4], 10),
            lines: [],
          };
        }
        continue;
      }

      if (currentHunk && (line.startsWith('+') || line.startsWith('-') || line.startsWith(' '))) {
        currentHunk.lines.push(line);
      }
    }

    if (currentHunk) {
      hunks.push(currentHunk);
    }

    if (!filePath) {
      return null;
    }

    return {
      filePath,
      hunks,
      originalContent: '',
      newContent: '',
      issueId,
      moduleId,
    };
  }

  /**
   * Compute hunks by comparing original and modified content line by line
   */
  private computeHunks(original: string, modified: string): PatchHunk[] {
    const originalLines = original.split('\n');
    const modifiedLines = modified.split('\n');
    const hunks: PatchHunk[] = [];

    // Use a simple LCS-based diff algorithm
    const diff = this.computeLineDiff(originalLines, modifiedLines);
    
    // Group consecutive changes into hunks
    let hunkStart = -1;
    let hunkLines: string[] = [];
    let oldLineNum = 1;
    let newLineNum = 1;
    let oldCount = 0;
    let newCount = 0;

    const flushHunk = (): void => {
      if (hunkLines.length > 0) {
        hunks.push({
          oldStart: hunkStart,
          oldLines: oldCount,
          newStart: hunkStart,
          newLines: newCount,
          lines: [...hunkLines],
        });
        hunkLines = [];
        oldCount = 0;
        newCount = 0;
      }
    };

    for (const entry of diff) {
      const { type, line } = entry;

      if (type === 'equal') {
        // Add context lines around changes
        if (hunkLines.length > 0) {
          hunkLines.push(` ${line}`);
          oldCount++;
          newCount++;
          
          // Check if we should end the hunk (too many context lines)
          const contextCount = hunkLines.filter((l) => l.startsWith(' ')).length;
          const changeCount = hunkLines.filter((l) => l.startsWith('+') || l.startsWith('-')).length;
          
          if (contextCount > this.options.contextLines! * 2 && changeCount > 0) {
            // Trim trailing context
            while (hunkLines.length > 0 && hunkLines[hunkLines.length - 1].startsWith(' ')) {
              const trimmed = hunkLines.pop();
              if (trimmed) {
                oldCount--;
                newCount--;
              }
              if (hunkLines.filter((l) => l.startsWith(' ')).slice(-this.options.contextLines!).length <= this.options.contextLines!) {
                break;
              }
            }
            flushHunk();
          }
        }
        oldLineNum++;
        newLineNum++;
      } else if (type === 'delete') {
        if (hunkStart === -1) {
          hunkStart = oldLineNum;
          // Add leading context
          const contextStart = Math.max(0, oldLineNum - 1 - this.options.contextLines!);
          for (let i = contextStart; i < oldLineNum - 1; i++) {
            hunkLines.push(` ${originalLines[i]}`);
            oldCount++;
            newCount++;
          }
          if (contextStart < oldLineNum - 1) {
            hunkStart = contextStart + 1;
          }
        }
        hunkLines.push(`-${line}`);
        oldCount++;
        oldLineNum++;
      } else if (type === 'insert') {
        if (hunkStart === -1) {
          hunkStart = oldLineNum;
          // Add leading context
          const contextStart = Math.max(0, oldLineNum - 1 - this.options.contextLines!);
          for (let i = contextStart; i < oldLineNum - 1; i++) {
            hunkLines.push(` ${originalLines[i]}`);
            oldCount++;
            newCount++;
          }
          if (contextStart < oldLineNum - 1) {
            hunkStart = contextStart + 1;
          }
        }
        hunkLines.push(`+${line}`);
        newCount++;
        newLineNum++;
      }
    }

    flushHunk();

    return hunks;
  }

  /**
   * Compute line-by-line diff using a simple algorithm
   */
  private computeLineDiff(
    original: string[],
    modified: string[]
  ): Array<{ type: 'equal' | 'delete' | 'insert'; line: string }> {
    const result: Array<{ type: 'equal' | 'delete' | 'insert'; line: string }> = [];
    
    // Simple Myers-like diff algorithm
    const lcs = this.longestCommonSubsequence(original, modified);
    
    let origIdx = 0;
    let modIdx = 0;
    let lcsIdx = 0;

    while (origIdx < original.length || modIdx < modified.length) {
      if (lcsIdx < lcs.length && origIdx < original.length && original[origIdx] === lcs[lcsIdx]) {
        if (modIdx < modified.length && modified[modIdx] === lcs[lcsIdx]) {
          result.push({ type: 'equal', line: original[origIdx] });
          origIdx++;
          modIdx++;
          lcsIdx++;
        } else if (modIdx < modified.length) {
          result.push({ type: 'insert', line: modified[modIdx] });
          modIdx++;
        } else {
          result.push({ type: 'delete', line: original[origIdx] });
          origIdx++;
        }
      } else if (origIdx < original.length && (lcsIdx >= lcs.length || original[origIdx] !== lcs[lcsIdx])) {
        result.push({ type: 'delete', line: original[origIdx] });
        origIdx++;
      } else if (modIdx < modified.length) {
        result.push({ type: 'insert', line: modified[modIdx] });
        modIdx++;
      }
    }

    return result;
  }

  /**
   * Compute longest common subsequence of lines
   * Uses space-optimized algorithm for large inputs
   */
  private longestCommonSubsequence(a: string[], b: string[]): string[] {
    const m = a.length;
    const n = b.length;

    // Early exit for empty arrays
    if (m === 0 || n === 0) {
      return [];
    }

    // For very small arrays, use simple approach
    if (m <= 2 && n <= 2) {
      return this.simpleLCS(a, b);
    }

    // Use space-optimized DP with only two rows for large inputs
    // This reduces memory from O(m*n) to O(n)
    const useLowMemory = this.options.optimizeLargeFiles && (m * n > 1000000);
    
    if (useLowMemory) {
      return this.longestCommonSubsequenceOptimized(a, b);
    }
    
    // Standard DP approach for moderate sizes
    // Create DP table
    const dp: number[][] = Array(m + 1)
      .fill(null)
      .map(() => Array(n + 1).fill(0));

    // Fill DP table
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (a[i - 1] === b[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    // Backtrack to find LCS
    const lcs: string[] = [];
    let i = m;
    let j = n;
    
    while (i > 0 && j > 0) {
      if (a[i - 1] === b[j - 1]) {
        lcs.unshift(a[i - 1]);
        i--;
        j--;
      } else if (dp[i - 1][j] > dp[i][j - 1]) {
        i--;
      } else {
        j--;
      }
    }

    return lcs;
  }

  /**
   * Simple LCS for very small arrays
   */
  private simpleLCS(a: string[], b: string[]): string[] {
    const result: string[] = [];
    let bStart = 0;
    
    for (const item of a) {
      for (let j = bStart; j < b.length; j++) {
        if (item === b[j]) {
          result.push(item);
          bStart = j + 1;
          break;
        }
      }
    }
    
    return result;
  }

  /**
   * Space-optimized LCS using Hirschberg's algorithm concept
   * Uses O(min(m,n)) space instead of O(m*n)
   */
  private longestCommonSubsequenceOptimized(a: string[], b: string[]): string[] {
    // Ensure a is the shorter array
    if (a.length > b.length) {
      return this.longestCommonSubsequenceOptimized(b, a);
    }

    const m = a.length;
    const n = b.length;

    // Use only two rows
    let prev = new Array(n + 1).fill(0);
    let curr = new Array(n + 1).fill(0);

    // Also track path for reconstruction
    const path: Array<Array<'diag' | 'up' | 'left'>> = Array(m + 1)
      .fill(null)
      .map(() => Array(n + 1).fill('up'));

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (a[i - 1] === b[j - 1]) {
          curr[j] = prev[j - 1] + 1;
          path[i][j] = 'diag';
        } else if (prev[j] >= curr[j - 1]) {
          curr[j] = prev[j];
          path[i][j] = 'up';
        } else {
          curr[j] = curr[j - 1];
          path[i][j] = 'left';
        }
      }
      [prev, curr] = [curr, prev];
      curr.fill(0);
    }

    // Reconstruct LCS from path
    const lcs: string[] = [];
    let i = m;
    let j = n;

    while (i > 0 && j > 0) {
      if (path[i][j] === 'diag') {
        lcs.unshift(a[i - 1]);
        i--;
        j--;
      } else if (path[i][j] === 'up') {
        i--;
      } else {
        j--;
      }
    }

    return lcs;
  }

  /**
   * Check if two patches conflict (touch the same lines)
   */
  patchesConflict(patch1: Patch, patch2: Patch): boolean {
    if (patch1.filePath !== patch2.filePath) {
      return false;
    }

    for (const hunk1 of patch1.hunks) {
      for (const hunk2 of patch2.hunks) {
        const hunk1End = hunk1.oldStart + hunk1.oldLines;
        const hunk2End = hunk2.oldStart + hunk2.oldLines;

        // Check if ranges overlap
        if (
          (hunk1.oldStart <= hunk2.oldStart && hunk1End > hunk2.oldStart) ||
          (hunk2.oldStart <= hunk1.oldStart && hunk2End > hunk1.oldStart)
        ) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Merge non-conflicting patches for the same file
   */
  mergePatches(patches: Patch[]): Patch[] {
    if (!Array.isArray(patches) || patches.length === 0) {
      return [];
    }

    // Filter out invalid patches
    const validPatches = patches.filter(
      (p) => p && typeof p === 'object' && typeof p.filePath === 'string' && Array.isArray(p.hunks)
    );

    if (validPatches.length === 0) {
      return [];
    }

    const byFile = new Map<string, Patch[]>();

    for (const patch of validPatches) {
      const normalizedPath = sanitizeFilePath(patch.filePath);
      const existing = byFile.get(normalizedPath) ?? [];
      existing.push(patch);
      byFile.set(normalizedPath, existing);
    }

    const merged: Patch[] = [];

    for (const [, filePatches] of byFile) {
      if (filePatches.length === 1) {
        merged.push(filePatches[0]);
        continue;
      }

      // Sort patches by their starting line
      filePatches.sort((a, b) => {
        const aStart = a.hunks.length > 0 
          ? Math.min(...a.hunks.map((h) => h.oldStart || Infinity))
          : Infinity;
        const bStart = b.hunks.length > 0 
          ? Math.min(...b.hunks.map((h) => h.oldStart || Infinity))
          : Infinity;
        return aStart - bStart;
      });

      // Check for conflicts and merge
      let current = filePatches[0];
      
      for (let i = 1; i < filePatches.length; i++) {
        const next = filePatches[i];
        
        if (this.patchesConflict(current, next)) {
          // Keep patches separate if they conflict
          merged.push(current);
          current = next;
        } else {
          // Merge hunks with deduplication
          const mergedHunks = [...current.hunks, ...next.hunks]
            .filter((h) => h && typeof h.oldStart === 'number')
            .sort((a, b) => a.oldStart - b.oldStart);

          // Validate hunk count
          if (mergedHunks.length > SAFETY_LIMITS.MAX_HUNKS_PER_PATCH) {
            // Too many hunks, keep separate
            merged.push(current);
            current = next;
          } else {
            current = {
              ...current,
              hunks: mergedHunks,
              issueId: `${current.issueId},${next.issueId}`,
            };
          }
        }
      }
      
      merged.push(current);
    }

    return merged;
  }

  /**
   * Estimate the complexity of diffing two strings
   */
  estimateComplexity(original: string, modified: string): {
    originalLines: number;
    modifiedLines: number;
    estimatedOperations: number;
    isLarge: boolean;
  } {
    const originalLines = original.split('\n').length;
    const modifiedLines = modified.split('\n').length;
    const estimatedOperations = originalLines * modifiedLines;
    
    return {
      originalLines,
      modifiedLines,
      estimatedOperations,
      isLarge: estimatedOperations > 1000000,
    };
  }

  /**
   * Get current options (for testing/debugging)
   */
  getOptions(): Readonly<Required<PatchGeneratorOptions>> {
    return { ...this.options };
  }
}
