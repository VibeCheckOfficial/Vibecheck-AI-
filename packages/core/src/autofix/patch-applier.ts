/**
 * Patch Applier
 * 
 * Safely applies patches to files with backup and rollback support.
 * Implements atomic operations, file locking, and comprehensive validation.
 */

import { readFile, writeFile, mkdir, copyFile, unlink, stat, access, constants } from 'fs/promises';
import { existsSync, realpathSync } from 'fs';
import { dirname, join, basename, resolve, relative, isAbsolute, extname, sep } from 'path';
import * as crypto from 'crypto';
import type { 
  Patch, 
  ApplyOptions, 
  ApplyResult, 
  AppliedPatch, 
  PatchValidationResult,
  TransactionLogEntry 
} from './types.js';
import { 
  SAFETY_LIMITS, 
  sanitizeFilePath, 
  isPathWithinBase,
  exceedsSafetyLimit 
} from './types.js';

/**
 * Default apply options with secure defaults
 */
const DEFAULT_APPLY_OPTIONS: Readonly<ApplyOptions> = Object.freeze({
  dryRun: false,
  createBackup: true,
  backupDir: '.vibecheck/backups',
  validateSyntax: true,
});

/**
 * Files that should never be modified
 */
const PROTECTED_FILES: readonly string[] = Object.freeze([
  '.git/HEAD',
  '.git/config',
  '.git/index',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  '.env',
  '.env.local',
  '.env.production',
]);

/**
 * Error thrown when patch application fails
 */
export class PatchApplicationError extends Error {
  constructor(
    message: string,
    public readonly code: 
      | 'VALIDATION_FAILED'
      | 'FILE_NOT_FOUND'
      | 'PERMISSION_DENIED'
      | 'CONTENT_MISMATCH'
      | 'PROTECTED_FILE'
      | 'PATH_TRAVERSAL'
      | 'SIZE_EXCEEDED'
      | 'WRITE_FAILED'
      | 'BACKUP_FAILED'
      | 'ROLLBACK_FAILED',
    public readonly filePath?: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'PatchApplicationError';
  }
}

/**
 * Lock manager for preventing concurrent file modifications
 */
class FileLockManager {
  private locks = new Map<string, { holder: string; timestamp: number }>();
  private readonly lockTimeout = 30000; // 30 seconds

  acquire(filePath: string, holder: string): boolean {
    const normalizedPath = this.normalizePath(filePath);
    const existing = this.locks.get(normalizedPath);
    
    // Check for stale lock
    if (existing && Date.now() - existing.timestamp > this.lockTimeout) {
      this.locks.delete(normalizedPath);
    }
    
    if (this.locks.has(normalizedPath)) {
      return false;
    }
    
    this.locks.set(normalizedPath, { holder, timestamp: Date.now() });
    return true;
  }

  release(filePath: string, holder: string): boolean {
    const normalizedPath = this.normalizePath(filePath);
    const existing = this.locks.get(normalizedPath);
    
    if (!existing || existing.holder !== holder) {
      return false;
    }
    
    this.locks.delete(normalizedPath);
    return true;
  }

  isLocked(filePath: string): boolean {
    const normalizedPath = this.normalizePath(filePath);
    const existing = this.locks.get(normalizedPath);
    
    if (!existing) {
      return false;
    }
    
    // Check for stale lock
    if (Date.now() - existing.timestamp > this.lockTimeout) {
      this.locks.delete(normalizedPath);
      return false;
    }
    
    return true;
  }

  private normalizePath(filePath: string): string {
    return filePath.toLowerCase().replace(/\\/g, '/');
  }
}

/**
 * PatchApplier handles safe application of patches to files
 */
export class PatchApplier {
  private readonly projectRoot: string;
  private appliedPatches: AppliedPatch[] = [];
  private transactionLog: TransactionLogEntry[] = [];
  private readonly lockManager = new FileLockManager();
  private readonly instanceId = `applier-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  constructor(projectRoot: string) {
    if (!projectRoot || typeof projectRoot !== 'string') {
      throw new Error('Project root is required');
    }
    this.projectRoot = resolve(projectRoot);
  }

  /**
   * Apply a single patch to a file
   */
  async apply(patch: Patch, options: Partial<ApplyOptions> = {}): Promise<ApplyResult> {
    const opts = { ...DEFAULT_APPLY_OPTIONS, ...options };
    
    // Input validation
    if (!patch || typeof patch !== 'object') {
      return {
        success: false,
        filePath: 'unknown',
        error: 'Invalid patch object',
      };
    }

    if (!patch.filePath || typeof patch.filePath !== 'string') {
      return {
        success: false,
        filePath: 'unknown',
        error: 'Patch missing file path',
      };
    }

    const sanitizedPath = sanitizeFilePath(patch.filePath);
    const fullPath = this.resolvePath(sanitizedPath);

    // Security: Check for protected files
    if (this.isProtectedFile(sanitizedPath)) {
      return {
        success: false,
        filePath: sanitizedPath,
        error: `Cannot modify protected file: ${sanitizedPath}`,
      };
    }

    // Security: Verify path is within project root
    if (!this.isWithinProjectRoot(fullPath)) {
      return {
        success: false,
        filePath: sanitizedPath,
        error: 'Path traversal detected - file is outside project root',
      };
    }

    // Acquire file lock
    if (!this.lockManager.acquire(fullPath, this.instanceId)) {
      return {
        success: false,
        filePath: sanitizedPath,
        error: 'File is locked by another operation',
      };
    }

    try {
      // Validate the patch first
      const validation = await this.validate(patch);
      if (!validation.valid) {
        return {
          success: false,
          filePath: sanitizedPath,
          error: `Validation failed: ${validation.errors.join(', ')}`,
        };
      }

      // Size check
      const newContentSize = Buffer.byteLength(patch.newContent || '', 'utf-8');
      if (exceedsSafetyLimit('MAX_FILE_SIZE_BYTES', newContentSize)) {
        return {
          success: false,
          filePath: sanitizedPath,
          error: `New content exceeds maximum file size (${SAFETY_LIMITS.MAX_FILE_SIZE_BYTES} bytes)`,
        };
      }

      // Create backup if requested
      let backupPath: string | undefined;
      let backupChecksum: string | undefined;
      if (opts.createBackup && !opts.dryRun && existsSync(fullPath)) {
        try {
          // Read original content for checksum
          const originalContent = await readFile(fullPath, 'utf-8');
          backupChecksum = this.calculateChecksum(originalContent);
          
          // Create backup
          backupPath = await this.createBackup(sanitizedPath, opts.backupDir!);
          
          // Verify backup integrity
          const backupContent = await readFile(backupPath, 'utf-8');
          const backupContentChecksum = this.calculateChecksum(backupContent);
          
          if (backupChecksum !== backupContentChecksum) {
            // Clean up invalid backup
            await unlink(backupPath).catch(() => {});
            return {
              success: false,
              filePath: sanitizedPath,
              error: 'Backup verification failed - checksum mismatch',
            };
          }
        } catch (backupError) {
          return {
            success: false,
            filePath: sanitizedPath,
            error: `Backup creation failed: ${backupError instanceof Error ? backupError.message : String(backupError)}`,
          };
        }
      }

      // Dry run - just validate without applying
      if (opts.dryRun) {
        return {
          success: true,
          filePath: sanitizedPath,
        };
      }

      // Ensure directory exists
      const dir = dirname(fullPath);
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
      }

      // Check write permissions if file exists
      if (existsSync(fullPath)) {
        try {
          await access(fullPath, constants.W_OK);
        } catch {
          return {
            success: false,
            filePath: sanitizedPath,
            error: 'No write permission for file',
          };
        }
      }

      // Atomic write: write to temp file first, then rename
      // Use cross-platform temp directory for better Windows compatibility
      const { createTempFile, cleanupTempFile, unregisterTempFile } = await import('../utils/temp-cleanup.js');
      const tempPath = await createTempFile({
        prefix: 'patch',
        suffix: extname(fullPath) || '.tmp',
      });
      
      try {
        await writeFile(tempPath, patch.newContent, 'utf-8');
        
        // Verify temp file was written correctly
        const written = await readFile(tempPath, 'utf-8');
        if (written !== patch.newContent) {
          await cleanupTempFile(tempPath).catch(() => {});
          return {
            success: false,
            filePath: sanitizedPath,
            error: 'Write verification failed - content mismatch',
          };
        }

        // Move temp file to target (atomic on most filesystems)
        // Cross-platform: use fs.rename which works on Windows if on same drive
        const { rename } = await import('fs/promises');
        await rename(tempPath, fullPath);
        
        // Unregister since we successfully moved it
        const { unregisterTempFile } = await import('../utils/temp-cleanup.js');
        unregisterTempFile(tempPath);
      } catch (writeError) {
        // Clean up temp file if it exists
        await cleanupTempFile(tempPath).catch(() => {});
        throw writeError;
      }

      // Track applied patch
      const appliedPatch: AppliedPatch = {
        ...patch,
        filePath: sanitizedPath,
        appliedAt: new Date(),
        backupPath,
        backupChecksum,
      };
      this.appliedPatches.push(appliedPatch);

      // Enforce history limit
      if (this.appliedPatches.length > SAFETY_LIMITS.MAX_HISTORY_ENTRIES) {
        this.appliedPatches = this.appliedPatches.slice(-SAFETY_LIMITS.MAX_HISTORY_ENTRIES);
      }

      return {
        success: true,
        filePath: sanitizedPath,
        backupPath,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        filePath: sanitizedPath,
        error: message,
      };
    } finally {
      // Always release the lock
      this.lockManager.release(fullPath, this.instanceId);
    }
  }

  /**
   * Check if a file is protected from modification
   */
  private isProtectedFile(filePath: string): boolean {
    const normalized = filePath.toLowerCase().replace(/\\/g, '/');
    return PROTECTED_FILES.some((protected_) => 
      normalized.endsWith(protected_.toLowerCase()) ||
      normalized.includes(`/${protected_.toLowerCase()}`)
    );
  }

  /**
   * Check if a path is within the project root
   * Enhanced with symlink resolution and canonicalization
   */
  private isWithinProjectRoot(fullPath: string): boolean {
    try {
      // Resolve project root to absolute path
      const projectRoot = resolve(this.projectRoot);
      
      // Resolve target path (handles relative paths, .., etc.)
      const targetResolved = resolve(projectRoot, fullPath);
      
      // Resolve symlinks to get real path (prevents symlink escape)
      const targetReal = realpathSync(targetResolved);
      const rootReal = realpathSync(projectRoot);
      
      // Normalize paths for comparison (handle Windows/Unix differences)
      const normalizedTarget = targetReal + (targetReal.endsWith(sep) ? '' : sep);
      const normalizedRoot = rootReal + (rootReal.endsWith(sep) ? '' : sep);
      
      // Check if target is within root (must start with root path)
      return normalizedTarget.startsWith(normalizedRoot) || targetReal === rootReal;
    } catch (error) {
      // If realpathSync fails (broken symlink, invalid path), reject
      // This is safer than allowing potentially dangerous paths
      return false;
    }
  }

  /**
   * Apply multiple patches as a transaction
   * All patches succeed or all are rolled back
   */
  async applyTransaction(
    patches: Patch[], 
    options: Partial<ApplyOptions> = {}
  ): Promise<{
    success: boolean;
    results: ApplyResult[];
    transactionId: string;
    rollbackErrors?: string[];
  }> {
    // Input validation
    if (!Array.isArray(patches)) {
      return {
        success: false,
        results: [],
        transactionId: 'invalid',
      };
    }

    if (patches.length === 0) {
      return {
        success: true,
        results: [],
        transactionId: this.generateTransactionId(),
      };
    }

    // Enforce transaction size limit
    if (exceedsSafetyLimit('MAX_PATCHES_PER_TRANSACTION', patches.length)) {
      return {
        success: false,
        results: [],
        transactionId: 'invalid',
        rollbackErrors: [`Transaction exceeds maximum patch count (${SAFETY_LIMITS.MAX_PATCHES_PER_TRANSACTION})`],
      };
    }

    const transactionId = this.generateTransactionId();
    const results: ApplyResult[] = [];
    const appliedInTransaction: AppliedPatch[] = [];

    // Create transaction log entry
    const transaction: TransactionLogEntry = {
      id: transactionId,
      timestamp: new Date(),
      fixes: [],
      status: 'pending',
    };
    this.transactionLog.push(transaction);

    // Enforce transaction log limit
    if (this.transactionLog.length > SAFETY_LIMITS.MAX_HISTORY_ENTRIES) {
      this.transactionLog = this.transactionLog.slice(-SAFETY_LIMITS.MAX_HISTORY_ENTRIES);
    }

    try {
      // Pre-validate all patches before applying any
      const validationResults = await Promise.all(
        patches.map((patch) => this.validate(patch))
      );
      
      const invalidPatches = validationResults
        .map((v, i) => ({ validation: v, index: i }))
        .filter(({ validation }) => !validation.valid);

      if (invalidPatches.length > 0) {
        transaction.status = 'rolled_back';
        return {
          success: false,
          results: validationResults.map((v, i) => ({
            success: v.valid,
            filePath: patches[i]?.filePath || 'unknown',
            error: v.valid ? undefined : v.errors.join(', '),
          })),
          transactionId,
          rollbackErrors: invalidPatches.map(
            ({ index, validation }) => `Patch ${index}: ${validation.errors.join(', ')}`
          ),
        };
      }

      // Apply patches sequentially
      for (const patch of patches) {
        const result = await this.apply(patch, options);
        results.push(result);

        if (!result.success) {
          // Rollback all patches applied in this transaction
          const rollbackErrors: string[] = [];
          
          for (const applied of [...appliedInTransaction].reverse()) {
            try {
              const rollbackSuccess = await this.rollbackPatch(applied);
              if (!rollbackSuccess) {
                rollbackErrors.push(`Failed to rollback ${applied.filePath}`);
              }
            } catch (rollbackError) {
              rollbackErrors.push(
                `Error rolling back ${applied.filePath}: ${
                  rollbackError instanceof Error ? rollbackError.message : String(rollbackError)
                }`
              );
            }
          }

          transaction.status = 'rolled_back';
          
          return {
            success: false,
            results,
            transactionId,
            rollbackErrors: rollbackErrors.length > 0 ? rollbackErrors : undefined,
          };
        }

        // Track successfully applied patch
        const lastApplied = this.appliedPatches[this.appliedPatches.length - 1];
        if (lastApplied) {
          appliedInTransaction.push(lastApplied);
        }
      }

      transaction.fixes = appliedInTransaction;
      transaction.status = 'committed';

      return {
        success: true,
        results,
        transactionId,
      };
    } catch (error) {
      // Rollback on any error
      const rollbackErrors: string[] = [];
      
      for (const applied of [...appliedInTransaction].reverse()) {
        try {
          await this.rollbackPatch(applied);
        } catch (rollbackError) {
          rollbackErrors.push(
            `Error rolling back ${applied.filePath}: ${
              rollbackError instanceof Error ? rollbackError.message : String(rollbackError)
            }`
          );
        }
      }

      transaction.status = 'rolled_back';
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      return {
        success: false,
        results,
        transactionId,
        rollbackErrors: [...rollbackErrors, `Transaction error: ${errorMessage}`],
      };
    }
  }

  /**
   * Perform a dry run without making changes
   */
  async dryRun(patch: Patch): Promise<PatchValidationResult> {
    return this.validate(patch);
  }

  /**
   * Validate a patch before applying
   */
  async validate(patch: Patch): Promise<PatchValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Basic validation
    if (!patch || typeof patch !== 'object') {
      errors.push('Invalid patch object');
      return { valid: false, errors, warnings };
    }

    if (!patch.filePath || typeof patch.filePath !== 'string') {
      errors.push('Missing or invalid file path');
      return { valid: false, errors, warnings };
    }

    const sanitizedPath = sanitizeFilePath(patch.filePath);
    const fullPath = this.resolvePath(sanitizedPath);

    // Security validations
    if (this.isProtectedFile(sanitizedPath)) {
      errors.push(`Cannot modify protected file: ${sanitizedPath}`);
    }

    if (!this.isWithinProjectRoot(fullPath)) {
      errors.push('Path traversal detected - file is outside project root');
    }

    // Size validation
    if (patch.newContent) {
      const contentSize = Buffer.byteLength(patch.newContent, 'utf-8');
      if (exceedsSafetyLimit('MAX_FILE_SIZE_BYTES', contentSize)) {
        errors.push(`Content size exceeds limit (${SAFETY_LIMITS.MAX_FILE_SIZE_BYTES} bytes)`);
      }
    }

    // Check if file exists when we expect original content
    if (patch.originalContent && patch.originalContent.length > 0 && !existsSync(fullPath)) {
      errors.push(`File does not exist: ${sanitizedPath}`);
    }

    // Verify original content matches if file exists
    if (existsSync(fullPath) && patch.originalContent && patch.originalContent.length > 0) {
      try {
        const stats = await stat(fullPath);
        
        // Check if it's a regular file
        if (!stats.isFile()) {
          errors.push(`Path is not a regular file: ${sanitizedPath}`);
        } else {
          const currentContent = await readFile(fullPath, 'utf-8');
          if (currentContent !== patch.originalContent) {
            errors.push('File content has changed since patch was generated');
            
            // Provide more details about the mismatch
            const currentLines = currentContent.split('\n').length;
            const expectedLines = patch.originalContent.split('\n').length;
            if (currentLines !== expectedLines) {
              warnings.push(`Line count mismatch: expected ${expectedLines}, found ${currentLines}`);
            }
          }
        }
      } catch (readError) {
        if ((readError as NodeJS.ErrnoException).code === 'ENOENT') {
          errors.push(`File does not exist: ${sanitizedPath}`);
        } else if ((readError as NodeJS.ErrnoException).code === 'EACCES') {
          errors.push(`No read permission for file: ${sanitizedPath}`);
        } else {
          errors.push(`Unable to read file: ${sanitizedPath}`);
        }
      }
    }

    // Check for empty new content (could be intentional file deletion)
    if ((!patch.newContent || patch.newContent.length === 0) && patch.originalContent && patch.originalContent.length > 0) {
      warnings.push('Patch will result in empty file');
    }

    // Hunk validation
    if (Array.isArray(patch.hunks)) {
      if (exceedsSafetyLimit('MAX_HUNKS_PER_PATCH', patch.hunks.length)) {
        errors.push(`Too many hunks in patch (max: ${SAFETY_LIMITS.MAX_HUNKS_PER_PATCH})`);
      }

      for (let i = 0; i < patch.hunks.length; i++) {
        const hunk = patch.hunks[i];
        if (!hunk || typeof hunk !== 'object') {
          warnings.push(`Invalid hunk at index ${i}`);
          continue;
        }
        if (hunk.lines && exceedsSafetyLimit('MAX_LINES_PER_HUNK', hunk.lines.length)) {
          warnings.push(`Hunk ${i} has too many lines (max: ${SAFETY_LIMITS.MAX_LINES_PER_HUNK})`);
        }
      }
    }

    // Validate syntax for known file types
    if (patch.newContent && patch.newContent.length > 0) {
      if (sanitizedPath.endsWith('.ts') || sanitizedPath.endsWith('.tsx') || 
          sanitizedPath.endsWith('.js') || sanitizedPath.endsWith('.jsx')) {
        const syntaxError = this.validateTypeScriptSyntax(patch.newContent);
        if (syntaxError) {
          errors.push(`Syntax error: ${syntaxError}`);
        }
      } else if (sanitizedPath.endsWith('.json')) {
        const syntaxError = this.validateJsonSyntax(patch.newContent);
        if (syntaxError) {
          errors.push(`JSON syntax error: ${syntaxError}`);
        }
      }
    }

    // Check for suspicious patterns in new content
    if (patch.newContent) {
      const suspiciousPatterns = this.detectSuspiciousPatterns(patch.newContent);
      for (const pattern of suspiciousPatterns) {
        warnings.push(`Suspicious pattern detected: ${pattern}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Detect suspicious patterns in code
   */
  private detectSuspiciousPatterns(content: string): string[] {
    const warnings: string[] = [];

    // Check for hardcoded secrets patterns
    const secretPatterns = [
      /api[_-]?key\s*[:=]\s*['"][^'"]{20,}['"]/i,
      /secret\s*[:=]\s*['"][^'"]{20,}['"]/i,
      /password\s*[:=]\s*['"][^'"]{8,}['"]/i,
      /token\s*[:=]\s*['"][^'"]{20,}['"]/i,
    ];

    for (const pattern of secretPatterns) {
      if (pattern.test(content)) {
        warnings.push('Possible hardcoded secret');
        break;
      }
    }

    // Check for eval/Function constructor
    if (/\beval\s*\(/.test(content) || /new\s+Function\s*\(/.test(content)) {
      warnings.push('Dynamic code execution detected (eval or Function constructor)');
    }

    // Check for debug statements
    if (/console\.(log|debug|info)\s*\(/g.test(content)) {
      warnings.push('Console logging statements found');
    }

    // Check for TODO/FIXME markers
    if (/\b(TODO|FIXME|HACK|XXX)\b/i.test(content)) {
      warnings.push('Contains TODO/FIXME markers');
    }

    return warnings;
  }

  /**
   * Rollback a single applied patch
   */
  async rollbackPatch(appliedPatch: AppliedPatch): Promise<boolean> {
    try {
      const fullPath = this.resolvePath(appliedPatch.filePath);

      if (appliedPatch.backupPath && existsSync(appliedPatch.backupPath)) {
        // Verify backup integrity before restoring
        if (appliedPatch.backupChecksum) {
          const backupContent = await readFile(appliedPatch.backupPath, 'utf-8');
          const backupContentChecksum = this.calculateChecksum(backupContent);
          
          if (backupContentChecksum !== appliedPatch.backupChecksum) {
            console.error(`Backup checksum mismatch for ${appliedPatch.filePath}. Backup may be corrupted.`);
            // Fall through to try originalContent
          } else {
            // Restore from verified backup
            await copyFile(appliedPatch.backupPath, fullPath);
            await unlink(appliedPatch.backupPath);
            return true;
          }
        } else {
          // No checksum available, restore anyway (backward compatibility)
          await copyFile(appliedPatch.backupPath, fullPath);
          await unlink(appliedPatch.backupPath);
          return true;
        }
      }
      
      // Fallback to originalContent if backup unavailable or invalid
      if (appliedPatch.originalContent) {
        // Restore original content
        await writeFile(fullPath, appliedPatch.originalContent, 'utf-8');
      } else {
        // File was created, so delete it
        if (existsSync(fullPath)) {
          await unlink(fullPath);
        }
      }

      // Remove from applied patches
      const index = this.appliedPatches.findIndex(
        (p) => p.filePath === appliedPatch.filePath && p.appliedAt === appliedPatch.appliedAt
      );
      if (index !== -1) {
        this.appliedPatches.splice(index, 1);
      }

      return true;
    } catch (error) {
      console.error('Failed to rollback patch:', error);
      return false;
    }
  }

  /**
   * Rollback an entire transaction
   */
  async rollbackTransaction(transactionId: string): Promise<boolean> {
    const transaction = this.transactionLog.find((t) => t.id === transactionId);
    if (!transaction) {
      return false;
    }

    let success = true;
    for (const patch of transaction.fixes.reverse()) {
      const result = await this.rollbackPatch(patch);
      if (!result) {
        success = false;
      }
    }

    transaction.status = 'rolled_back';
    return success;
  }

  /**
   * Calculate SHA-256 checksum of content
   */
  private calculateChecksum(content: string): string {
    return crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
  }

  /**
   * Create a backup of a file
   */
  async createBackup(filePath: string, backupDir: string): Promise<string> {
    const fullPath = this.resolvePath(filePath);
    const backupRoot = join(this.projectRoot, backupDir);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = join(backupRoot, `${basename(filePath)}.${timestamp}.bak`);

    // Ensure backup directory exists
    if (!existsSync(backupRoot)) {
      await mkdir(backupRoot, { recursive: true });
    }

    await copyFile(fullPath, backupPath);
    return backupPath;
  }

  /**
   * Get list of all applied patches
   */
  getAppliedPatches(): AppliedPatch[] {
    return [...this.appliedPatches];
  }

  /**
   * Get transaction log
   */
  getTransactionLog(): TransactionLogEntry[] {
    return [...this.transactionLog];
  }

  /**
   * Clear applied patches history
   */
  clearHistory(): void {
    this.appliedPatches = [];
    this.transactionLog = [];
  }

  /**
   * Save transaction log to file
   */
  async saveTransactionLog(filePath: string): Promise<void> {
    const fullPath = this.resolvePath(filePath);
    const dir = dirname(fullPath);
    
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }

    await writeFile(
      fullPath, 
      JSON.stringify(this.transactionLog, null, 2), 
      'utf-8'
    );
  }

  /**
   * Load transaction log from file
   */
  async loadTransactionLog(filePath: string): Promise<void> {
    const fullPath = this.resolvePath(filePath);
    
    if (!existsSync(fullPath)) {
      return;
    }

    try {
      const content = await readFile(fullPath, 'utf-8');
      this.transactionLog = JSON.parse(content);
    } catch {
      // Invalid or empty log file
      this.transactionLog = [];
    }
  }

  /**
   * Resolve a file path relative to project root
   */
  private resolvePath(filePath: string): string {
    if (filePath.startsWith('/') || filePath.match(/^[A-Za-z]:/)) {
      return filePath;
    }
    return join(this.projectRoot, filePath);
  }

  /**
   * Generate a unique transaction ID
   */
  private generateTransactionId(): string {
    return `tx-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  /**
   * Basic TypeScript syntax validation
   * Performs bracket matching and basic syntax checks
   */
  private validateTypeScriptSyntax(content: string): string | null {
    if (!content || typeof content !== 'string') {
      return null; // Empty content is valid (might be intentional)
    }

    // Limit validation to reasonable file size
    if (content.length > 500000) {
      return null; // Skip validation for very large files
    }

    // Basic bracket matching
    const brackets: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
    const closingBrackets = new Set(Object.values(brackets));
    const stack: Array<{ char: string; position: number }> = [];
    
    let inString = false;
    let stringChar = '';
    let inComment = false;
    let inMultilineComment = false;
    let inRegex = false;
    let lastNonWhitespace = '';

    for (let i = 0; i < content.length; i++) {
      const char = content[i];
      const nextChar = content[i + 1] || '';
      const prevChar = content[i - 1] || '';

      // Handle comments
      if (!inString && !inRegex && char === '/' && nextChar === '/') {
        inComment = true;
        continue;
      }
      if (!inString && !inRegex && char === '/' && nextChar === '*') {
        inMultilineComment = true;
        i++;
        continue;
      }
      if (inMultilineComment && char === '*' && nextChar === '/') {
        inMultilineComment = false;
        i++;
        continue;
      }
      if (inComment && char === '\n') {
        inComment = false;
        continue;
      }
      if (inComment || inMultilineComment) {
        continue;
      }

      // Handle regex literals (simplified detection)
      if (!inString && !inRegex && char === '/' && 
          (lastNonWhitespace === '=' || lastNonWhitespace === '(' || 
           lastNonWhitespace === ',' || lastNonWhitespace === '[' ||
           lastNonWhitespace === '!' || lastNonWhitespace === '&' ||
           lastNonWhitespace === '|' || lastNonWhitespace === ':' ||
           lastNonWhitespace === ';' || lastNonWhitespace === '{' ||
           lastNonWhitespace === '}' || lastNonWhitespace === 'return')) {
        inRegex = true;
        continue;
      }
      if (inRegex && char === '/' && prevChar !== '\\') {
        inRegex = false;
        continue;
      }
      if (inRegex) {
        continue;
      }

      // Handle strings
      if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar) {
          inString = false;
          stringChar = '';
        }
        continue;
      }
      if (inString) {
        // Handle template literal expressions
        if (stringChar === '`' && char === '$' && nextChar === '{') {
          // Enter template expression - need to track nested braces
          // This is a simplified check
        }
        continue;
      }

      // Track last non-whitespace for regex detection
      if (!/\s/.test(char)) {
        lastNonWhitespace = char;
      }

      // Handle brackets
      if (brackets[char]) {
        stack.push({ char: brackets[char], position: i });
      } else if (closingBrackets.has(char)) {
        if (stack.length === 0) {
          const line = content.slice(0, i).split('\n').length;
          return `Unmatched closing bracket '${char}' at line ${line}`;
        }
        const expected = stack.pop()!;
        if (expected.char !== char) {
          const line = content.slice(0, i).split('\n').length;
          return `Mismatched bracket: expected '${expected.char}', found '${char}' at line ${line}`;
        }
      }
    }

    if (stack.length > 0) {
      const unclosed = stack[stack.length - 1];
      const line = content.slice(0, unclosed.position).split('\n').length;
      return `Unclosed bracket at line ${line}, expected '${unclosed.char}'`;
    }

    if (inString) {
      return `Unclosed string literal (started with ${stringChar})`;
    }

    if (inMultilineComment) {
      return 'Unclosed multi-line comment';
    }

    return null;
  }

  /**
   * Validate JSON syntax
   */
  private validateJsonSyntax(content: string): string | null {
    try {
      JSON.parse(content);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : 'Invalid JSON';
    }
  }
}
