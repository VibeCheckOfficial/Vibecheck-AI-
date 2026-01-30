/**
 * Audit Logger
 * 
 * Comprehensive audit logging for all VibeCheck operations.
 * Provides immutable records of firewall decisions, validations, and changes.
 * 
 * Features:
 * - Structured JSON logging
 * - Automatic log rotation
 * - Buffered writes for performance
 * - Query capabilities
 * - Statistics and reporting
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { getLogger, type Logger } from '../utils/logger.js';
import { withRetry } from '../utils/retry.js';
import { wrapError, ValidationError } from '../utils/errors.js';
import { validateOrThrow, string, oneOf } from '../utils/validation.js';

export interface AuditEntry {
  id: string;
  timestamp: Date;
  type: AuditEntryType;
  action: string;
  actor: string;
  target?: string;
  result: 'allowed' | 'blocked' | 'warning' | 'error';
  details: Record<string, unknown>;
  duration?: number;
  sessionId?: string;
  correlationId?: string;
  metadata?: Record<string, unknown>;
}

export type AuditEntryType =
  | 'firewall_check'
  | 'validation'
  | 'truthpack_update'
  | 'intent_declaration'
  | 'mode_change'
  | 'file_write'
  | 'security_scan'
  | 'dependency_check'
  | 'review'
  | 'config_change'
  | 'system_event';

export interface AuditConfig {
  logDirectory: string;
  maxFileSize: number;
  maxFiles: number;
  enableConsole: boolean;
  enableFile: boolean;
  minLevel: 'debug' | 'info' | 'warning' | 'error';
  flushIntervalMs: number;
  maxBufferSize: number;
  compressOldLogs: boolean;
}

export interface AuditQuery {
  type?: AuditEntryType | AuditEntryType[];
  result?: AuditEntry['result'] | AuditEntry['result'][];
  actor?: string;
  target?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
  correlationId?: string;
}

export interface AuditStats {
  totalEntries: number;
  byType: Record<string, number>;
  byResult: Record<string, number>;
  byActor: Record<string, number>;
  avgDuration: number;
  entriesPerHour: number;
  oldestEntry?: Date;
  newestEntry?: Date;
}

const DEFAULT_CONFIG: AuditConfig = {
  logDirectory: '.vibecheck/audit',
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxFiles: 10,
  enableConsole: false,
  enableFile: true,
  minLevel: 'info',
  flushIntervalMs: 5000,
  maxBufferSize: 100,
  compressOldLogs: false,
};

const AUDIT_TYPES = [
  'firewall_check', 'validation', 'truthpack_update', 'intent_declaration',
  'mode_change', 'file_write', 'security_scan', 'dependency_check',
  'review', 'config_change', 'system_event'
] as const;

const typeValidator = oneOf(AUDIT_TYPES);
const resultValidator = oneOf(['allowed', 'blocked', 'warning', 'error'] as const);

export class AuditLogger {
  private config: AuditConfig;
  private projectRoot: string;
  private buffer: AuditEntry[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  private currentLogFile: string | null = null;
  private sessionId: string;
  private logger: Logger;
  private disposed = false;
  private flushPromise: Promise<void> | null = null;
  private entryCount = 0;

  constructor(projectRoot: string, config: Partial<AuditConfig> = {}) {
    this.projectRoot = projectRoot;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.sessionId = this.generateSessionId();
    this.logger = getLogger('audit-logger');

    // Start periodic flush
    if (this.config.enableFile) {
      this.flushInterval = setInterval(() => this.flush(), this.config.flushIntervalMs);
      if (this.flushInterval.unref) {
        this.flushInterval.unref();
      }
    }

    this.logger.debug('Audit logger initialized', {
      sessionId: this.sessionId,
      logDirectory: this.config.logDirectory,
    });
  }

  /**
   * Log an audit entry
   */
  async log(entry: Omit<AuditEntry, 'id' | 'timestamp' | 'sessionId'>): Promise<string> {
    this.assertNotDisposed();

    // Validate entry type and result
    validateOrThrow(entry.type, typeValidator, {
      component: 'AuditLogger',
      operation: 'log',
      field: 'type',
    });
    
    validateOrThrow(entry.result, resultValidator, {
      component: 'AuditLogger',
      operation: 'log',
      field: 'result',
    });

    const fullEntry: AuditEntry = {
      ...entry,
      id: this.generateId(),
      timestamp: new Date(),
      sessionId: this.sessionId,
    };

    // Add to buffer
    this.buffer.push(fullEntry);
    this.entryCount++;

    // Console output if enabled
    if (this.config.enableConsole) {
      this.logToConsole(fullEntry);
    }

    // Flush if buffer is full
    if (this.buffer.length >= this.config.maxBufferSize) {
      await this.flush();
    }

    return fullEntry.id;
  }

  /**
   * Log a firewall check
   */
  async logFirewallCheck(
    actor: string,
    target: string,
    result: 'allowed' | 'blocked',
    details: {
      claimCount?: number;
      violations?: string[];
      mode?: string;
      duration?: number;
      auditId?: string;
    }
  ): Promise<string> {
    return this.log({
      type: 'firewall_check',
      action: 'evaluate',
      actor,
      target,
      result,
      details,
      duration: details.duration,
      correlationId: details.auditId,
    });
  }

  /**
   * Log a validation
   */
  async logValidation(
    actor: string,
    target: string,
    result: 'allowed' | 'blocked' | 'warning',
    details: {
      validationType: string;
      issueCount?: number;
      issues?: string[];
      score?: number;
    }
  ): Promise<string> {
    return this.log({
      type: 'validation',
      action: 'validate',
      actor,
      target,
      result,
      details,
    });
  }

  /**
   * Log a truthpack update
   */
  async logTruthpackUpdate(
    actor: string,
    details: {
      sections: string[];
      itemCounts: Record<string, number>;
      duration?: number;
      trigger?: string;
    }
  ): Promise<string> {
    return this.log({
      type: 'truthpack_update',
      action: 'regenerate',
      actor,
      result: 'allowed',
      details,
      duration: details.duration,
    });
  }

  /**
   * Log a mode change
   */
  async logModeChange(
    actor: string,
    details: {
      previousMode: string;
      newMode: string;
      reason?: string;
    }
  ): Promise<string> {
    return this.log({
      type: 'mode_change',
      action: 'set_mode',
      actor,
      result: 'allowed',
      details,
    });
  }

  /**
   * Log an intent declaration
   */
  async logIntentDeclaration(
    actor: string,
    details: {
      intentId: string;
      description: string;
      scope: string;
      allowedPaths?: string[];
    }
  ): Promise<string> {
    return this.log({
      type: 'intent_declaration',
      action: 'declare',
      actor,
      result: 'allowed',
      details,
    });
  }

  /**
   * Log a system event
   */
  async logSystemEvent(
    action: string,
    result: AuditEntry['result'],
    details: Record<string, unknown>
  ): Promise<string> {
    return this.log({
      type: 'system_event',
      action,
      actor: 'system',
      result,
      details,
    });
  }

  /**
   * Query audit logs
   */
  async query(query: AuditQuery = {}): Promise<AuditEntry[]> {
    // Flush buffer first to ensure we have all data
    await this.flush();

    const results: AuditEntry[] = [];
    const logDir = path.join(this.projectRoot, this.config.logDirectory);

    try {
      const files = await fs.readdir(logDir);
      const logFiles = files
        .filter(f => f.endsWith('.jsonl'))
        .sort()
        .reverse(); // Newest first

      for (const file of logFiles) {
        const filePath = path.join(logDir, file);
        
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const lines = content.trim().split('\n').filter(l => l.length > 0);

          for (const line of lines) {
            try {
              const entry = JSON.parse(line) as AuditEntry;
              entry.timestamp = new Date(entry.timestamp);

              if (this.matchesQuery(entry, query)) {
                results.push(entry);

                if (query.limit && results.length >= (query.offset ?? 0) + query.limit) {
                  // Apply offset and return
                  return results.slice(query.offset ?? 0, (query.offset ?? 0) + query.limit);
                }
              }
            } catch {
              // Skip invalid lines
            }
          }
        } catch {
          // Skip files that can't be read
        }
      }
    } catch {
      // Log directory doesn't exist
    }

    // Apply offset and limit
    const start = query.offset ?? 0;
    const end = query.limit ? start + query.limit : undefined;
    return results.slice(start, end);
  }

  /**
   * Get recent entries
   */
  async getRecent(limit = 100): Promise<AuditEntry[]> {
    return this.query({ limit });
  }

  /**
   * Get statistics
   */
  async getStatistics(since?: Date): Promise<AuditStats> {
    const entries = await this.query({
      startDate: since,
      limit: 10000,
    });

    const byType: Record<string, number> = {};
    const byResult: Record<string, number> = {};
    const byActor: Record<string, number> = {};
    let totalDuration = 0;
    let durationCount = 0;
    let oldestEntry: Date | undefined;
    let newestEntry: Date | undefined;

    for (const entry of entries) {
      byType[entry.type] = (byType[entry.type] || 0) + 1;
      byResult[entry.result] = (byResult[entry.result] || 0) + 1;
      byActor[entry.actor] = (byActor[entry.actor] || 0) + 1;

      if (entry.duration !== undefined) {
        totalDuration += entry.duration;
        durationCount++;
      }

      if (!oldestEntry || entry.timestamp < oldestEntry) {
        oldestEntry = entry.timestamp;
      }
      if (!newestEntry || entry.timestamp > newestEntry) {
        newestEntry = entry.timestamp;
      }
    }

    // Calculate entries per hour
    let entriesPerHour = 0;
    if (oldestEntry && newestEntry && entries.length > 0) {
      const hoursDiff = (newestEntry.getTime() - oldestEntry.getTime()) / (1000 * 60 * 60);
      entriesPerHour = hoursDiff > 0 ? entries.length / hoursDiff : entries.length;
    }

    return {
      totalEntries: entries.length,
      byType,
      byResult,
      byActor,
      avgDuration: durationCount > 0 ? totalDuration / durationCount : 0,
      entriesPerHour,
      oldestEntry,
      newestEntry,
    };
  }

  /**
   * Get entries grouped by correlation ID
   */
  async getCorrelatedEntries(correlationId: string): Promise<AuditEntry[]> {
    return this.query({ correlationId });
  }

  /**
   * Flush buffer to disk with retry
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0 || !this.config.enableFile) {
      return;
    }

    // Wait for any in-progress flush
    if (this.flushPromise) {
      await this.flushPromise;
    }

    const entries = this.buffer.splice(0, this.buffer.length);
    
    this.flushPromise = this.doFlush(entries);
    
    try {
      await this.flushPromise;
    } finally {
      this.flushPromise = null;
    }
  }

  /**
   * Actually write entries to disk
   */
  private async doFlush(entries: AuditEntry[]): Promise<void> {
    const logDir = path.join(this.projectRoot, this.config.logDirectory);

    try {
      await withRetry(
        async () => {
          // Ensure directory exists
          await fs.mkdir(logDir, { recursive: true });

          // Get or create log file
          if (!this.currentLogFile || await this.shouldRotate()) {
            await this.rotateIfNeeded();
            this.currentLogFile = this.getLogFileName();
          }

          const logPath = path.join(logDir, this.currentLogFile);
          const content = entries.map(e => JSON.stringify({
            ...e,
            timestamp: e.timestamp.toISOString(),
          })).join('\n') + '\n';

          await fs.appendFile(logPath, content, 'utf-8');
        },
        {
          maxAttempts: 3,
          initialDelayMs: 50,
          onRetry: (attempt, error) => {
            this.logger.warn(`Audit log write retry ${attempt}`, { error: error.message });
          },
        }
      );
    } catch (error) {
      this.logger.error('Failed to flush audit log after retries', error as Error);
      // Re-add entries to buffer for next attempt
      this.buffer.unshift(...entries);
    }
  }

  /**
   * Check if query matches an entry
   */
  private matchesQuery(entry: AuditEntry, query: AuditQuery): boolean {
    // Type filter
    if (query.type) {
      const types = Array.isArray(query.type) ? query.type : [query.type];
      if (!types.includes(entry.type)) return false;
    }

    // Result filter
    if (query.result) {
      const results = Array.isArray(query.result) ? query.result : [query.result];
      if (!results.includes(entry.result)) return false;
    }

    // Actor filter
    if (query.actor && entry.actor !== query.actor) return false;

    // Target filter (partial match)
    if (query.target && entry.target && !entry.target.includes(query.target)) return false;

    // Date range filter
    if (query.startDate && entry.timestamp < query.startDate) return false;
    if (query.endDate && entry.timestamp > query.endDate) return false;

    // Correlation ID filter
    if (query.correlationId && entry.correlationId !== query.correlationId) return false;

    return true;
  }

  private logToConsole(entry: AuditEntry): void {
    const prefix = `[AUDIT] [${entry.timestamp.toISOString()}] [${entry.type}]`;
    const message = `${entry.action} by ${entry.actor}: ${entry.result}`;
    console.log(`${prefix} ${message}`);
  }

  private generateId(): string {
    return `audit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private generateSessionId(): string {
    return `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private getLogFileName(): string {
    const date = new Date().toISOString().split('T')[0];
    return `vibecheck-audit-${date}.jsonl`;
  }

  private async shouldRotate(): Promise<boolean> {
    if (!this.currentLogFile) return true;

    try {
      const logPath = path.join(this.projectRoot, this.config.logDirectory, this.currentLogFile);
      const stat = await fs.stat(logPath);
      return stat.size >= this.config.maxFileSize;
    } catch {
      return true;
    }
  }

  private async rotateIfNeeded(): Promise<void> {
    const logDir = path.join(this.projectRoot, this.config.logDirectory);

    try {
      const files = await fs.readdir(logDir);
      const logFiles = files.filter(f => f.endsWith('.jsonl')).sort();

      // Delete old files if we have too many
      while (logFiles.length >= this.config.maxFiles) {
        const oldestFile = logFiles.shift();
        if (oldestFile) {
          const filePath = path.join(logDir, oldestFile);
          await fs.unlink(filePath);
          this.logger.debug('Rotated old audit log', { file: oldestFile });
        }
      }
    } catch {
      // Directory might not exist yet
    }
  }

  /**
   * Get entry count for this session
   */
  getSessionEntryCount(): number {
    return this.entryCount;
  }

  /**
   * Get session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Assert logger is not disposed
   */
  private assertNotDisposed(): void {
    if (this.disposed) {
      throw new ValidationError('AuditLogger has been disposed', {
        component: 'AuditLogger',
        operation: 'assertNotDisposed',
        recoveryHint: 'Create a new AuditLogger instance',
      });
    }
  }

  /**
   * Clean up resources
   */
  async dispose(): Promise<void> {
    if (this.disposed) return;
    
    this.disposed = true;
    
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    
    // Final flush
    await this.flush();
    
    this.logger.debug('Audit logger disposed', {
      sessionId: this.sessionId,
      entriesLogged: this.entryCount,
    });
  }
}
