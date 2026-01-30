/**
 * Base Fix Module
 * 
 * Abstract base class for all fix modules.
 * Each fix module handles a specific category of issues.
 * 
 * Includes comprehensive input validation, path safety checks,
 * and defensive coding practices.
 */

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, resolve, isAbsolute, relative } from 'path';
import type {
  Issue,
  IssueType,
  Patch,
  FixContext,
  ConfidenceLevel,
  PatchValidationResult,
} from '../types.js';
import { 
  sanitizeFilePath, 
  isPathWithinBase, 
  SAFETY_LIMITS,
  isIssueType 
} from '../types.js';
import { PatchGenerator, PatchGenerationError } from '../patch-generator.js';

/**
 * Metadata about a fix module
 */
export interface FixModuleMetadata {
  id: string;
  name: string;
  description: string;
  version: string;
  author?: string;
  issueTypes: IssueType[];
  confidence: ConfidenceLevel;
}

/**
 * Maximum file read size (5MB)
 */
const MAX_FILE_READ_SIZE = 5 * 1024 * 1024;

/**
 * Files that should never be modified by fix modules
 */
const PROTECTED_PATTERNS: readonly RegExp[] = [
  /\.git\//,
  /node_modules\//,
  /\.env(?:\.[^/]*)?$/,
  /package-lock\.json$/,
  /pnpm-lock\.yaml$/,
  /yarn\.lock$/,
  /\.min\.(js|css)$/,
];

/**
 * Abstract base class for fix modules
 */
export abstract class BaseFixModule {
  /**
   * Unique identifier for this module
   */
  abstract readonly id: string;

  /**
   * Human-readable name
   */
  abstract readonly name: string;

  /**
   * Issue types this module can handle
   */
  abstract readonly issueTypes: IssueType[];

  /**
   * Default confidence level for fixes from this module
   */
  abstract readonly confidence: ConfidenceLevel;

  /**
   * Patch generator instance
   */
  protected readonly patchGenerator: PatchGenerator;

  /**
   * Cache for file reads to avoid redundant disk access
   */
  private readonly fileCache: Map<string, { content: string; timestamp: number }> = new Map();
  
  /**
   * Cache TTL in milliseconds (5 seconds)
   */
  private readonly cacheTTL = 5000;

  constructor() {
    this.patchGenerator = new PatchGenerator();
  }

  /**
   * Validate that this module is properly configured
   */
  protected validateModuleConfig(): void {
    if (!this.id || typeof this.id !== 'string') {
      throw new Error('Module must have a valid id');
    }
    if (!this.name || typeof this.name !== 'string') {
      throw new Error('Module must have a valid name');
    }
    if (!Array.isArray(this.issueTypes) || this.issueTypes.length === 0) {
      throw new Error('Module must handle at least one issue type');
    }
    for (const type of this.issueTypes) {
      if (!isIssueType(type)) {
        throw new Error(`Invalid issue type: ${type}`);
      }
    }
  }

  /**
   * Check if this module can fix the given issue
   */
  abstract canFix(issue: Issue): boolean;

  /**
   * Generate a fix for the given issue
   * Returns null if the fix cannot be generated
   */
  abstract generateFix(issue: Issue, context: FixContext): Promise<Patch | null>;

  /**
   * Validate a generated patch with comprehensive checks
   */
  async validate(patch: Patch): Promise<PatchValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Null check
    if (!patch || typeof patch !== 'object') {
      errors.push('Invalid patch object');
      return { valid: false, errors, warnings };
    }

    // Check that file path is provided and valid
    if (!patch.filePath || typeof patch.filePath !== 'string') {
      errors.push('Patch has no file path');
    } else {
      // Check for path traversal attempts
      const sanitized = sanitizeFilePath(patch.filePath);
      if (sanitized !== patch.filePath.replace(/\\/g, '/')) {
        errors.push('Suspicious file path detected');
      }

      // Check for protected files
      if (this.isProtectedPath(patch.filePath)) {
        errors.push(`Cannot modify protected file: ${patch.filePath}`);
      }
    }

    // Check that patch has content
    if (!patch.newContent && !patch.originalContent) {
      errors.push('Patch has no content');
    }

    // Size checks
    if (patch.newContent) {
      const size = Buffer.byteLength(patch.newContent, 'utf-8');
      if (size > SAFETY_LIMITS.MAX_FILE_SIZE_BYTES) {
        errors.push(`New content exceeds size limit (${SAFETY_LIMITS.MAX_FILE_SIZE_BYTES} bytes)`);
      }
    }

    // Validate hunks if present
    if (Array.isArray(patch.hunks)) {
      if (patch.hunks.length === 0 && patch.originalContent !== patch.newContent) {
        warnings.push('Patch has no hunks but content differs');
      }

      if (patch.hunks.length > SAFETY_LIMITS.MAX_HUNKS_PER_PATCH) {
        warnings.push(`Patch has many hunks (${patch.hunks.length})`);
      }

      for (let i = 0; i < patch.hunks.length; i++) {
        const hunk = patch.hunks[i];
        if (!hunk || typeof hunk !== 'object') {
          warnings.push(`Invalid hunk at index ${i}`);
          continue;
        }
        if (typeof hunk.oldStart !== 'number' || hunk.oldStart < 0) {
          warnings.push(`Invalid oldStart in hunk ${i}`);
        }
        if (typeof hunk.newStart !== 'number' || hunk.newStart < 0) {
          warnings.push(`Invalid newStart in hunk ${i}`);
        }
      }
    }

    // Check for suspicious content patterns
    if (patch.newContent) {
      const suspiciousPatterns = this.detectSuspiciousContent(patch.newContent);
      for (const pattern of suspiciousPatterns) {
        warnings.push(`Suspicious content: ${pattern}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Check if a path is protected from modification
   */
  protected isProtectedPath(filePath: string): boolean {
    const normalized = filePath.toLowerCase().replace(/\\/g, '/');
    return PROTECTED_PATTERNS.some((pattern) => pattern.test(normalized));
  }

  /**
   * Detect suspicious content patterns
   */
  protected detectSuspiciousContent(content: string): string[] {
    const warnings: string[] = [];

    // Check for potential secrets
    if (/(?:api[_-]?key|secret|password|token)\s*[:=]\s*['"][^'"]{10,}['"]/i.test(content)) {
      warnings.push('Possible hardcoded secret');
    }

    // Check for eval/Function
    if (/\beval\s*\(|\bnew\s+Function\s*\(/i.test(content)) {
      warnings.push('Dynamic code execution');
    }

    // Check for shell execution
    if (/\b(?:exec|spawn|execSync)\s*\(/i.test(content)) {
      warnings.push('Shell command execution');
    }

    return warnings;
  }

  /**
   * Get a human-readable description of the fix
   */
  abstract getFixDescription(issue: Issue): string;

  /**
   * Get module metadata
   */
  getMetadata(): FixModuleMetadata {
    return {
      id: this.id,
      name: this.name,
      description: this.getModuleDescription(),
      version: '1.0.0',
      issueTypes: [...this.issueTypes],
      confidence: this.confidence,
    };
  }

  /**
   * Get module description
   */
  protected abstract getModuleDescription(): string;

  /**
   * Read a file from the project with caching and safety checks
   */
  protected async readFile(
    context: FixContext,
    relativePath: string
  ): Promise<string | null> {
    // Validate inputs
    if (!context || !context.projectRoot) {
      return null;
    }
    if (!relativePath || typeof relativePath !== 'string') {
      return null;
    }

    // Sanitize path
    const sanitizedPath = sanitizeFilePath(relativePath);
    
    // Prevent absolute paths
    if (isAbsolute(sanitizedPath)) {
      return null;
    }

    const fullPath = resolve(context.projectRoot, sanitizedPath);
    
    // Security: ensure path is within project root
    if (!fullPath.startsWith(resolve(context.projectRoot))) {
      return null;
    }

    // Check protected paths
    if (this.isProtectedPath(sanitizedPath)) {
      return null;
    }

    // Check cache first
    const cacheKey = fullPath.toLowerCase();
    const cached = this.fileCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.content;
    }
    
    if (!existsSync(fullPath)) {
      return null;
    }

    try {
      // Check file size before reading
      const { stat } = await import('fs/promises');
      const stats = await stat(fullPath);
      
      if (!stats.isFile()) {
        return null;
      }
      
      if (stats.size > MAX_FILE_READ_SIZE) {
        console.warn(`File too large to read: ${relativePath} (${stats.size} bytes)`);
        return null;
      }

      const content = await readFile(fullPath, 'utf-8');
      
      // Cache the result
      this.fileCache.set(cacheKey, { content, timestamp: Date.now() });
      
      // Limit cache size
      if (this.fileCache.size > 100) {
        const oldestKey = this.fileCache.keys().next().value;
        if (oldestKey) {
          this.fileCache.delete(oldestKey);
        }
      }
      
      return content;
    } catch (error) {
      // Log error but return null to allow graceful handling
      if (process.env.NODE_ENV === 'development') {
        console.warn(`Failed to read file ${relativePath}:`, error);
      }
      return null;
    }
  }

  /**
   * Clear the file cache
   */
  protected clearCache(): void {
    this.fileCache.clear();
  }

  /**
   * Check if a file exists in the project safely
   */
  protected fileExists(context: FixContext, relativePath: string): boolean {
    if (!context || !context.projectRoot || !relativePath) {
      return false;
    }

    const sanitizedPath = sanitizeFilePath(relativePath);
    
    if (isAbsolute(sanitizedPath)) {
      return false;
    }

    const fullPath = resolve(context.projectRoot, sanitizedPath);
    
    // Security: ensure path is within project root
    if (!fullPath.startsWith(resolve(context.projectRoot))) {
      return false;
    }

    return existsSync(fullPath);
  }

  /**
   * Create a patch from original and new content with validation
   */
  protected createPatch(
    filePath: string,
    originalContent: string,
    newContent: string,
    issueId: string
  ): Patch {
    // Validate inputs
    if (!filePath || typeof filePath !== 'string') {
      throw new PatchGenerationError('File path is required', 'INVALID_INPUT');
    }
    if (typeof originalContent !== 'string') {
      throw new PatchGenerationError('Original content must be a string', 'INVALID_INPUT');
    }
    if (typeof newContent !== 'string') {
      throw new PatchGenerationError('New content must be a string', 'INVALID_INPUT');
    }
    if (!issueId || typeof issueId !== 'string') {
      throw new PatchGenerationError('Issue ID is required', 'INVALID_INPUT');
    }

    // Check for protected paths
    if (this.isProtectedPath(filePath)) {
      throw new PatchGenerationError(`Cannot modify protected file: ${filePath}`, 'INVALID_INPUT');
    }

    // Check content size
    const newSize = Buffer.byteLength(newContent, 'utf-8');
    if (newSize > SAFETY_LIMITS.MAX_FILE_SIZE_BYTES) {
      throw new PatchGenerationError(
        `New content exceeds size limit (${SAFETY_LIMITS.MAX_FILE_SIZE_BYTES} bytes)`,
        'FILE_TOO_LARGE'
      );
    }

    return this.patchGenerator.generatePatch(
      sanitizeFilePath(filePath),
      originalContent,
      newContent,
      issueId,
      this.id
    );
  }

  /**
   * Create a patch for a new file with validation
   */
  protected createNewFilePatch(
    filePath: string,
    content: string,
    issueId: string
  ): Patch {
    // Validate inputs
    if (!filePath || typeof filePath !== 'string') {
      throw new PatchGenerationError('File path is required', 'INVALID_INPUT');
    }
    if (typeof content !== 'string') {
      throw new PatchGenerationError('Content must be a string', 'INVALID_INPUT');
    }
    if (!content.trim()) {
      throw new PatchGenerationError('Cannot create empty file', 'INVALID_INPUT');
    }

    // Check for protected paths
    if (this.isProtectedPath(filePath)) {
      throw new PatchGenerationError(`Cannot create protected file: ${filePath}`, 'INVALID_INPUT');
    }

    return this.patchGenerator.generatePatch(
      sanitizeFilePath(filePath),
      '',
      content,
      issueId,
      this.id
    );
  }

  /**
   * Extract the value from an issue's metadata or claim
   */
  protected getIssueValue(issue: Issue): string | undefined {
    // Try to get from violation claim
    if (issue.violation?.claim?.value) {
      return issue.violation.claim.value;
    }

    // Try to get from drift item
    if (issue.driftItem?.identifier) {
      return issue.driftItem.identifier;
    }

    // Try to get from metadata
    if (issue.metadata?.identifier) {
      return String(issue.metadata.identifier);
    }

    if (issue.metadata?.value) {
      return String(issue.metadata.value);
    }

    return undefined;
  }

  /**
   * Extract file path from issue
   */
  protected getIssueFilePath(issue: Issue): string | undefined {
    return issue.filePath ?? (issue.metadata?.file as string | undefined);
  }

  /**
   * Extract line number from issue
   */
  protected getIssueLine(issue: Issue): number | undefined {
    return issue.line ?? (issue.metadata?.line as number | undefined);
  }

  /**
   * Indent code by a specified number of spaces with bounds checking
   */
  protected indent(code: string, spaces: number): string {
    if (typeof code !== 'string') {
      return '';
    }
    
    // Bound the spaces to reasonable values
    const safeSpaces = Math.max(0, Math.min(spaces, 20));
    const padding = ' '.repeat(safeSpaces);
    
    return code
      .split('\n')
      .map((line) => (line.trim() ? padding + line : line))
      .join('\n');
  }

  /**
   * Detect the indentation style of existing code
   */
  protected detectIndentation(content: string): { char: string; size: number } {
    if (typeof content !== 'string' || content.length === 0) {
      return { char: ' ', size: 2 };
    }

    const lines = content.split('\n');
    const indentCounts = new Map<number, number>();
    let tabCount = 0;
    let spaceCount = 0;
    
    // Sample first 100 lines for efficiency
    const samplesToCheck = Math.min(lines.length, 100);
    
    for (let i = 0; i < samplesToCheck; i++) {
      const line = lines[i];
      const match = line.match(/^(\s+)\S/);
      
      if (match) {
        const whitespace = match[1];
        
        if (whitespace.includes('\t')) {
          tabCount++;
        } else {
          spaceCount++;
          const count = whitespace.length;
          indentCounts.set(count, (indentCounts.get(count) || 0) + 1);
        }
      }
    }
    
    // Prefer tabs if they're more common
    if (tabCount > spaceCount) {
      return { char: '\t', size: 1 };
    }
    
    // Find most common space indentation
    if (indentCounts.size > 0) {
      // Check for 2 or 4 spaces (most common)
      const count2 = indentCounts.get(2) || 0;
      const count4 = indentCounts.get(4) || 0;
      
      if (count4 > count2) {
        return { char: ' ', size: 4 };
      }
      if (count2 > 0) {
        return { char: ' ', size: 2 };
      }
      
      // Fallback to most common
      let maxCount = 0;
      let maxSize = 2;
      for (const [size, count] of indentCounts) {
        if (count > maxCount && size >= 2 && size <= 8) {
          maxCount = count;
          maxSize = size;
        }
      }
      return { char: ' ', size: maxSize };
    }

    // Default to 2 spaces
    return { char: ' ', size: 2 };
  }

  /**
   * Get the line ending style of existing content
   */
  protected detectLineEnding(content: string): string {
    if (content.includes('\r\n')) {
      return '\r\n';
    }
    return '\n';
  }

  /**
   * Normalize line endings in content
   */
  protected normalizeLineEndings(content: string, lineEnding: string): string {
    return content.replace(/\r\n|\r|\n/g, lineEnding);
  }

  /**
   * Insert content at a specific line in a file with bounds checking
   */
  protected insertAtLine(
    content: string,
    lineNumber: number,
    newContent: string
  ): string {
    if (typeof content !== 'string') {
      return typeof newContent === 'string' ? newContent : '';
    }
    if (typeof newContent !== 'string') {
      return content;
    }
    
    const lines = content.split('\n');
    const safeLineNumber = Math.max(1, Math.min(lineNumber, lines.length + 1));
    const insertIndex = safeLineNumber - 1;
    
    lines.splice(insertIndex, 0, newContent);
    return lines.join('\n');
  }

  /**
   * Replace content at specific lines with validation
   */
  protected replaceLines(
    content: string,
    startLine: number,
    endLine: number,
    newContent: string
  ): string {
    if (typeof content !== 'string') {
      return typeof newContent === 'string' ? newContent : '';
    }
    if (typeof newContent !== 'string') {
      newContent = '';
    }
    
    const lines = content.split('\n');
    
    // Normalize and bound line numbers
    const safeStartLine = Math.max(1, startLine);
    const safeEndLine = Math.max(safeStartLine, endLine);
    
    const startIndex = Math.max(0, safeStartLine - 1);
    const endIndex = Math.min(lines.length, safeEndLine);
    const deleteCount = Math.max(0, endIndex - startIndex);
    
    if (deleteCount > 0 || newContent) {
      lines.splice(startIndex, deleteCount, newContent);
    }
    
    return lines.join('\n');
  }

  /**
   * Find the line number containing a pattern
   */
  protected findLine(content: string, pattern: string | RegExp): number | null {
    const lines = content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      if (typeof pattern === 'string') {
        if (lines[i].includes(pattern)) {
          return i + 1;
        }
      } else {
        if (pattern.test(lines[i])) {
          return i + 1;
        }
      }
    }
    
    return null;
  }

  /**
   * Find all lines matching a pattern
   */
  protected findAllLines(
    content: string,
    pattern: string | RegExp
  ): number[] {
    const lines = content.split('\n');
    const matches: number[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      if (typeof pattern === 'string') {
        if (lines[i].includes(pattern)) {
          matches.push(i + 1);
        }
      } else {
        if (pattern.test(lines[i])) {
          matches.push(i + 1);
        }
      }
    }
    
    return matches;
  }

  /**
   * Get content of a specific line
   */
  protected getLine(content: string, lineNumber: number): string | null {
    const lines = content.split('\n');
    const index = lineNumber - 1;
    
    if (index >= 0 && index < lines.length) {
      return lines[index];
    }
    
    return null;
  }

  /**
   * Get content of a range of lines
   */
  protected getLines(
    content: string,
    startLine: number,
    endLine: number
  ): string[] {
    const lines = content.split('\n');
    const startIndex = Math.max(0, startLine - 1);
    const endIndex = Math.min(lines.length, endLine);
    
    return lines.slice(startIndex, endIndex);
  }
}
