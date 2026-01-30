/**
 * Rollback Manager
 * 
 * Manages transaction logging, backup creation, and rollback
 * functionality for the auto-fix engine.
 * 
 * Includes comprehensive validation, atomic operations, and security checks.
 */

import { readFile, writeFile, mkdir, copyFile, unlink, readdir, stat, access, constants } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname, basename, resolve, isAbsolute } from 'path';
import type {
  Patch,
  AppliedPatch,
  TransactionLogEntry,
  ApplyResult,
} from './types.js';
import { sanitizeFilePath, SAFETY_LIMITS } from './types.js';

/**
 * Rollback configuration
 */
export interface RollbackConfig {
  enabled: boolean;
  maxHistory: number;
  logPath: string;
  backupDir: string;
  autoCleanup: boolean;
  cleanupAgeDays: number;
}

/**
 * Default rollback configuration with safe limits
 */
const DEFAULT_CONFIG: Readonly<RollbackConfig> = Object.freeze({
  enabled: true,
  maxHistory: 50,
  logPath: '.vibecheck/autofix-log.json',
  backupDir: '.vibecheck/backups',
  autoCleanup: true,
  cleanupAgeDays: 7,
});

/**
 * Maximum backup file size (50MB)
 */
const MAX_BACKUP_SIZE = 50 * 1024 * 1024;

/**
 * Error thrown by rollback operations
 */
export class RollbackError extends Error {
  constructor(
    message: string,
    public readonly code: 
      | 'TRANSACTION_NOT_FOUND'
      | 'ALREADY_ROLLED_BACK'
      | 'BACKUP_NOT_FOUND'
      | 'PERMISSION_DENIED'
      | 'INVALID_INPUT'
      | 'IO_ERROR',
    public readonly transactionId?: string
  ) {
    super(message);
    this.name = 'RollbackError';
  }
}

/**
 * Detailed transaction information
 */
export interface Transaction {
  id: string;
  timestamp: Date;
  status: 'pending' | 'committed' | 'rolled_back' | 'partial';
  fixes: TransactionFix[];
  commitHash?: string;
  summary: string;
  metadata?: Record<string, unknown>;
}

/**
 * Individual fix within a transaction
 */
export interface TransactionFix {
  issueId: string;
  filePath: string;
  backupPath?: string;
  status: 'applied' | 'rolled_back' | 'failed';
  appliedAt: Date;
  rolledBackAt?: Date;
  error?: string;
}

/**
 * Rollback result
 */
export interface RollbackResult {
  success: boolean;
  transactionId: string;
  fixesRolledBack: number;
  fixesFailed: number;
  errors: string[];
}

/**
 * RollbackManager handles transaction logging and rollback operations
 */
export class RollbackManager {
  private readonly config: RollbackConfig;
  private readonly projectRoot: string;
  private transactions: Transaction[] = [];
  private loaded = false;
  private saving = false;
  private readonly saveQueue: Array<() => void> = [];

  constructor(projectRoot: string, config?: Partial<RollbackConfig>) {
    if (!projectRoot || typeof projectRoot !== 'string') {
      throw new RollbackError('Project root is required', 'INVALID_INPUT');
    }
    
    this.projectRoot = resolve(projectRoot);
    this.config = this.validateConfig(config);
  }

  /**
   * Validate and normalize configuration
   */
  private validateConfig(config?: Partial<RollbackConfig>): RollbackConfig {
    return {
      enabled: config?.enabled ?? DEFAULT_CONFIG.enabled,
      maxHistory: Math.max(1, Math.min(config?.maxHistory ?? DEFAULT_CONFIG.maxHistory, SAFETY_LIMITS.MAX_HISTORY_ENTRIES)),
      logPath: this.sanitizeRelativePath(config?.logPath ?? DEFAULT_CONFIG.logPath),
      backupDir: this.sanitizeRelativePath(config?.backupDir ?? DEFAULT_CONFIG.backupDir),
      autoCleanup: config?.autoCleanup ?? DEFAULT_CONFIG.autoCleanup,
      cleanupAgeDays: Math.max(1, Math.min(config?.cleanupAgeDays ?? DEFAULT_CONFIG.cleanupAgeDays, 365)),
    };
  }

  /**
   * Sanitize a relative path
   */
  private sanitizeRelativePath(path: string): string {
    // Remove any absolute path indicators
    let sanitized = path.replace(/^[/\\]+/, '').replace(/^[A-Za-z]:/, '');
    // Prevent directory traversal
    sanitized = sanitized.split(/[/\\]/).filter((p) => p !== '..').join('/');
    return sanitized || DEFAULT_CONFIG.logPath;
  }

  /**
   * Start a new transaction with validation
   */
  async startTransaction(summary: string): Promise<string> {
    if (!this.config.enabled) {
      throw new RollbackError('Rollback manager is disabled', 'INVALID_INPUT');
    }

    if (!summary || typeof summary !== 'string') {
      throw new RollbackError('Transaction summary is required', 'INVALID_INPUT');
    }

    // Sanitize summary to prevent injection
    const sanitizedSummary = summary.slice(0, 500).replace(/[<>]/g, '');

    await this.ensureLoaded();

    const transaction: Transaction = {
      id: this.generateTransactionId(),
      timestamp: new Date(),
      status: 'pending',
      fixes: [],
      summary: sanitizedSummary,
    };

    this.transactions.push(transaction);
    await this.save();

    return transaction.id;
  }

  /**
   * Record a fix in a transaction with validation
   */
  async recordFix(
    transactionId: string,
    patch: Patch,
    backupPath?: string
  ): Promise<void> {
    if (!transactionId || typeof transactionId !== 'string') {
      throw new RollbackError('Transaction ID is required', 'INVALID_INPUT');
    }

    if (!patch || typeof patch !== 'object') {
      throw new RollbackError('Patch is required', 'INVALID_INPUT');
    }

    await this.ensureLoaded();

    const transaction = this.findTransaction(transactionId);
    if (!transaction) {
      throw new RollbackError(
        `Transaction not found: ${transactionId}`,
        'TRANSACTION_NOT_FOUND',
        transactionId
      );
    }

    if (transaction.status !== 'pending') {
      throw new RollbackError(
        `Cannot add fixes to ${transaction.status} transaction`,
        'INVALID_INPUT',
        transactionId
      );
    }

    // Validate and sanitize paths
    const sanitizedFilePath = sanitizeFilePath(patch.filePath || '');
    const sanitizedBackupPath = backupPath ? this.resolvePath(backupPath) : undefined;

    // Verify backup exists if provided
    if (sanitizedBackupPath && !existsSync(sanitizedBackupPath)) {
      throw new RollbackError(
        `Backup file not found: ${backupPath}`,
        'BACKUP_NOT_FOUND',
        transactionId
      );
    }

    transaction.fixes.push({
      issueId: patch.issueId || 'unknown',
      filePath: sanitizedFilePath,
      backupPath: sanitizedBackupPath,
      status: 'applied',
      appliedAt: new Date(),
    });

    await this.save();
  }

  /**
   * Commit a transaction (mark as completed)
   */
  async commitTransaction(transactionId: string, commitHash?: string): Promise<void> {
    if (!transactionId || typeof transactionId !== 'string') {
      throw new RollbackError('Transaction ID is required', 'INVALID_INPUT');
    }

    await this.ensureLoaded();

    const transaction = this.findTransaction(transactionId);
    if (!transaction) {
      throw new RollbackError(
        `Transaction not found: ${transactionId}`,
        'TRANSACTION_NOT_FOUND',
        transactionId
      );
    }

    if (transaction.status !== 'pending') {
      throw new RollbackError(
        `Transaction already ${transaction.status}`,
        'INVALID_INPUT',
        transactionId
      );
    }

    transaction.status = 'committed';
    
    // Validate and store commit hash if provided
    if (commitHash && typeof commitHash === 'string') {
      // Basic validation - commit hashes are typically alphanumeric
      transaction.commitHash = commitHash.slice(0, 64).replace(/[^a-fA-F0-9]/g, '');
    }
    
    await this.save();

    // Cleanup old transactions if auto-cleanup is enabled
    if (this.config.autoCleanup) {
      // Run cleanup asynchronously to not block commit
      this.cleanup().catch((error) => {
        if (process.env.NODE_ENV === 'development') {
          console.warn('Cleanup failed:', error);
        }
      });
    }
  }

  /**
   * Rollback a transaction
   */
  async rollback(transactionId: string): Promise<RollbackResult> {
    await this.ensureLoaded();

    const transaction = this.findTransaction(transactionId);
    if (!transaction) {
      return {
        success: false,
        transactionId,
        fixesRolledBack: 0,
        fixesFailed: 0,
        errors: [`Transaction not found: ${transactionId}`],
      };
    }

    if (transaction.status === 'rolled_back') {
      return {
        success: false,
        transactionId,
        fixesRolledBack: 0,
        fixesFailed: 0,
        errors: ['Transaction already rolled back'],
      };
    }

    const result: RollbackResult = {
      success: true,
      transactionId,
      fixesRolledBack: 0,
      fixesFailed: 0,
      errors: [],
    };

    // Rollback fixes in reverse order
    const fixesToRollback = [...transaction.fixes].reverse();

    for (const fix of fixesToRollback) {
      if (fix.status !== 'applied') {
        continue;
      }

      try {
        await this.rollbackFix(fix);
        fix.status = 'rolled_back';
        fix.rolledBackAt = new Date();
        result.fixesRolledBack++;
      } catch (error) {
        fix.status = 'failed';
        fix.error = error instanceof Error ? error.message : String(error);
        result.fixesFailed++;
        result.errors.push(`Failed to rollback ${fix.filePath}: ${fix.error}`);
        result.success = false;
      }
    }

    // Update transaction status
    transaction.status = result.fixesFailed > 0 ? 'partial' : 'rolled_back';
    await this.save();

    return result;
  }

  /**
   * Rollback a single fix
   */
  private async rollbackFix(fix: TransactionFix): Promise<void> {
    const fullPath = this.resolvePath(fix.filePath);

    if (fix.backupPath && existsSync(fix.backupPath)) {
      // Restore from backup
      await copyFile(fix.backupPath, fullPath);
      // Remove backup after successful restore
      await unlink(fix.backupPath);
    } else {
      throw new Error(`No backup found for ${fix.filePath}`);
    }
  }

  /**
   * Get all transactions
   */
  async getTransactions(): Promise<Transaction[]> {
    await this.ensureLoaded();
    return [...this.transactions];
  }

  /**
   * Get a specific transaction
   */
  async getTransaction(id: string): Promise<Transaction | undefined> {
    await this.ensureLoaded();
    return this.findTransaction(id);
  }

  /**
   * Get recent transactions
   */
  async getRecentTransactions(limit = 10): Promise<Transaction[]> {
    await this.ensureLoaded();
    return this.transactions
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  /**
   * Get transactions by status
   */
  async getTransactionsByStatus(
    status: Transaction['status']
  ): Promise<Transaction[]> {
    await this.ensureLoaded();
    return this.transactions.filter((t) => t.status === status);
  }

  /**
   * Create a backup of a file with validation
   */
  async createBackup(filePath: string): Promise<string | undefined> {
    if (!this.config.enabled) {
      return undefined;
    }

    if (!filePath || typeof filePath !== 'string') {
      return undefined;
    }

    const sanitizedPath = sanitizeFilePath(filePath);
    const fullPath = this.resolvePath(sanitizedPath);
    
    // Security: verify path is within project root
    if (!this.isWithinProjectRoot(fullPath)) {
      throw new RollbackError(
        'Cannot backup file outside project root',
        'PERMISSION_DENIED'
      );
    }
    
    if (!existsSync(fullPath)) {
      return undefined;
    }

    // Check file size before backup
    try {
      const stats = await stat(fullPath);
      if (!stats.isFile()) {
        return undefined;
      }
      if (stats.size > MAX_BACKUP_SIZE) {
        throw new RollbackError(
          `File too large to backup (${stats.size} bytes, max ${MAX_BACKUP_SIZE})`,
          'INVALID_INPUT'
        );
      }
    } catch (error) {
      if (error instanceof RollbackError) throw error;
      return undefined;
    }

    const backupDir = this.resolvePath(this.config.backupDir);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeBasename = basename(sanitizedPath).replace(/[^a-zA-Z0-9._-]/g, '_');
    const randomSuffix = Math.random().toString(36).slice(2, 6);
    const backupPath = join(backupDir, `${safeBasename}.${timestamp}.${randomSuffix}.bak`);

    // Ensure backup directory exists
    await mkdir(backupDir, { recursive: true });

    // Atomic backup: copy to temp then rename
    const tempPath = `${backupPath}.tmp`;
    try {
      await copyFile(fullPath, tempPath);
      
      // Verify the backup
      const originalStats = await stat(fullPath);
      const backupStats = await stat(tempPath);
      
      if (originalStats.size !== backupStats.size) {
        await unlink(tempPath).catch(() => {});
        throw new RollbackError('Backup verification failed', 'IO_ERROR');
      }

      // Rename to final path
      const { rename } = await import('fs/promises');
      await rename(tempPath, backupPath);
      
      return backupPath;
    } catch (error) {
      // Clean up temp file
      await unlink(tempPath).catch(() => {});
      if (error instanceof RollbackError) throw error;
      throw new RollbackError(
        `Backup failed: ${error instanceof Error ? error.message : String(error)}`,
        'IO_ERROR'
      );
    }
  }

  /**
   * Check if a path is within the project root
   */
  private isWithinProjectRoot(fullPath: string): boolean {
    const resolved = resolve(fullPath);
    return resolved.startsWith(this.projectRoot + (this.projectRoot.endsWith('/') ? '' : '/')) ||
           resolved.startsWith(this.projectRoot + (this.projectRoot.endsWith('\\') ? '' : '\\')) ||
           resolved === this.projectRoot;
  }

  /**
   * Cleanup old transactions and backups
   */
  async cleanup(): Promise<{
    transactionsRemoved: number;
    backupsRemoved: number;
  }> {
    await this.ensureLoaded();

    let transactionsRemoved = 0;
    let backupsRemoved = 0;

    // Remove transactions beyond maxHistory
    if (this.transactions.length > this.config.maxHistory) {
      const toRemove = this.transactions.length - this.config.maxHistory;
      const removed = this.transactions.splice(0, toRemove);
      transactionsRemoved = removed.length;
      await this.save();
    }

    // Remove old backup files
    const backupDir = this.resolvePath(this.config.backupDir);
    if (existsSync(backupDir)) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.config.cleanupAgeDays);

      try {
        const files = await readdir(backupDir);
        
        for (const file of files) {
          const filePath = join(backupDir, file);
          const stats = await stat(filePath);
          
          if (stats.mtime < cutoffDate) {
            await unlink(filePath);
            backupsRemoved++;
          }
        }
      } catch {
        // Backup directory doesn't exist or can't be read
      }
    }

    return { transactionsRemoved, backupsRemoved };
  }

  /**
   * Clear all transaction history
   */
  async clear(): Promise<void> {
    this.transactions = [];
    await this.save();
  }

  /**
   * Format transaction history as text
   */
  formatHistory(): string {
    const lines: string[] = ['# Auto-Fix Transaction History', ''];

    for (const transaction of this.transactions.slice(-20).reverse()) {
      const statusIcon = 
        transaction.status === 'committed' ? '✓' :
        transaction.status === 'rolled_back' ? '↺' :
        transaction.status === 'partial' ? '⚠' : '○';

      lines.push(`## ${statusIcon} ${transaction.summary}`);
      lines.push(`ID: ${transaction.id}`);
      lines.push(`Date: ${transaction.timestamp.toISOString()}`);
      lines.push(`Status: ${transaction.status}`);
      lines.push(`Fixes: ${transaction.fixes.length}`);
      
      if (transaction.commitHash) {
        lines.push(`Commit: ${transaction.commitHash}`);
      }

      lines.push('');
      lines.push('Files:');
      for (const fix of transaction.fixes) {
        const fixIcon = fix.status === 'applied' ? '✓' : fix.status === 'rolled_back' ? '↺' : '✗';
        lines.push(`  ${fixIcon} ${fix.filePath}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Ensure transaction log is loaded
   */
  private async ensureLoaded(): Promise<void> {
    if (this.loaded) {
      return;
    }

    const logPath = this.resolvePath(this.config.logPath);

    if (existsSync(logPath)) {
      try {
        const content = await readFile(logPath, 'utf-8');
        const data = JSON.parse(content);
        
        this.transactions = data.transactions.map((t: Transaction) => ({
          ...t,
          timestamp: new Date(t.timestamp),
          fixes: t.fixes.map((f: TransactionFix) => ({
            ...f,
            appliedAt: new Date(f.appliedAt),
            rolledBackAt: f.rolledBackAt ? new Date(f.rolledBackAt) : undefined,
          })),
        }));
      } catch {
        this.transactions = [];
      }
    }

    this.loaded = true;
  }

  /**
   * Save transaction log with atomic write and serialization
   */
  private async save(): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    // Serialize saves to prevent race conditions
    if (this.saving) {
      return new Promise((resolve) => {
        this.saveQueue.push(resolve);
      });
    }

    this.saving = true;

    try {
      const logPath = this.resolvePath(this.config.logPath);
      const logDir = dirname(logPath);

      if (!existsSync(logDir)) {
        await mkdir(logDir, { recursive: true });
      }

      const data = {
        version: '1.0.0',
        lastUpdated: new Date().toISOString(),
        transactionCount: this.transactions.length,
        transactions: this.transactions,
      };

      // Atomic write: write to temp file, then rename
      const tempPath = `${logPath}.tmp.${Date.now()}`;
      const jsonContent = JSON.stringify(data, null, 2);
      
      await writeFile(tempPath, jsonContent, 'utf-8');
      
      // Verify written content
      const written = await readFile(tempPath, 'utf-8');
      if (written !== jsonContent) {
        await unlink(tempPath).catch(() => {});
        throw new RollbackError('Save verification failed', 'IO_ERROR');
      }

      // Rename to final path (atomic on most filesystems)
      const { rename } = await import('fs/promises');
      await rename(tempPath, logPath);
    } finally {
      this.saving = false;
      
      // Process queued saves
      const nextSave = this.saveQueue.shift();
      if (nextSave) {
        this.save().then(nextSave).catch(() => nextSave());
      }
    }
  }

  /**
   * Find a transaction by ID
   */
  private findTransaction(id: string): Transaction | undefined {
    return this.transactions.find((t) => t.id === id);
  }

  /**
   * Generate a unique transaction ID
   */
  private generateTransactionId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2, 8);
    return `tx-${timestamp}-${random}`;
  }

  /**
   * Resolve a path relative to project root with security checks
   */
  private resolvePath(filePath: string): string {
    if (!filePath || typeof filePath !== 'string') {
      return this.projectRoot;
    }

    // If already absolute, verify it's within project root
    if (isAbsolute(filePath)) {
      const resolved = resolve(filePath);
      if (this.isWithinProjectRoot(resolved)) {
        return resolved;
      }
      // Fall back to treating as relative
      filePath = basename(filePath);
    }

    // Sanitize and join with project root
    const sanitized = sanitizeFilePath(filePath);
    return resolve(join(this.projectRoot, sanitized));
  }

  /**
   * Get current configuration (readonly copy)
   */
  getConfig(): Readonly<RollbackConfig> {
    return { ...this.config };
  }

  /**
   * Check if rollback manager is enabled
   */
  get enabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Get the number of stored transactions
   */
  get transactionCount(): number {
    return this.transactions.length;
  }
}
