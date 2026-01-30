/**
 * Evidence Store
 * 
 * Manages storage and retrieval of receipts, traces, and artifacts.
 * Provides integrity verification via content hashing.
 */

import { createHash, randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { Receipt, ReceiptKind, ReceiptSignal } from '../types.js';
import { ReceiptSchema } from '../types.js';

// ============================================================================
// Types
// ============================================================================

export interface EvidenceStoreConfig {
  /** Base directory for evidence storage */
  baseDir: string;
  /** Max storage size in bytes (default: 1GB) */
  maxStorageBytes?: number;
  /** Enable compression for large files */
  compression?: boolean;
  /** Retention days for old evidence */
  retentionDays?: number;
}

export interface StoreReceiptOptions {
  /** Run ID this receipt belongs to */
  runId: string;
  /** Type of evidence */
  kind: ReceiptKind;
  /** Summary description */
  summary: string;
  /** Signals for policy evaluation */
  signals: ReceiptSignal[];
  /** Evidence files to store */
  evidenceFiles?: Array<{
    sourcePath: string;
    type: 'screenshot' | 'trace' | 'har' | 'log' | 'diff' | 'video';
  }>;
  /** Inline evidence data */
  inlineEvidence?: Array<{
    data: string | Buffer;
    filename: string;
    type: 'screenshot' | 'trace' | 'har' | 'log' | 'diff' | 'video';
  }>;
}

export interface EvidenceQuery {
  /** Filter by run ID */
  runId?: string;
  /** Filter by kind */
  kind?: ReceiptKind;
  /** Filter by signal presence */
  hasSignal?: string;
  /** Filter by signal value */
  signalValue?: { id: string; value: boolean | number };
  /** Limit results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

export interface StorageStats {
  /** Total receipts stored */
  totalReceipts: number;
  /** Total evidence files */
  totalFiles: number;
  /** Total storage bytes */
  totalBytes: number;
  /** Receipts by kind */
  byKind: Record<ReceiptKind, number>;
  /** Storage by run */
  byRun: Record<string, { receipts: number; bytes: number }>;
}

// ============================================================================
// Evidence Store Implementation
// ============================================================================

export class EvidenceStore {
  private config: Required<EvidenceStoreConfig>;
  private index: Map<string, Receipt> = new Map();
  private initialized = false;

  constructor(config: EvidenceStoreConfig) {
    this.config = {
      baseDir: config.baseDir,
      maxStorageBytes: config.maxStorageBytes ?? 1024 * 1024 * 1024, // 1GB
      compression: config.compression ?? false,
      retentionDays: config.retentionDays ?? 30,
    };
  }

  /**
   * Initialize the store (create directories, load index)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Create directory structure
    await fs.mkdir(path.join(this.config.baseDir, 'receipts'), { recursive: true });
    await fs.mkdir(path.join(this.config.baseDir, 'artifacts'), { recursive: true });
    await fs.mkdir(path.join(this.config.baseDir, 'runs'), { recursive: true });

    // Load existing index
    await this.loadIndex();

    this.initialized = true;
  }

  /**
   * Store a new receipt with associated evidence
   */
  async storeReceipt(options: StoreReceiptOptions): Promise<Receipt> {
    await this.ensureInitialized();

    const receiptId = `rcpt_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const timestamp = new Date().toISOString();
    const evidenceRefs: Receipt['evidenceRefs'] = [];

    // Create run directory
    const runDir = path.join(this.config.baseDir, 'runs', options.runId);
    await fs.mkdir(runDir, { recursive: true });

    // Store evidence files
    if (options.evidenceFiles) {
      for (const file of options.evidenceFiles) {
        const ref = await this.storeEvidenceFile(
          file.sourcePath,
          file.type,
          options.runId,
          receiptId
        );
        evidenceRefs.push(ref);
      }
    }

    // Store inline evidence
    if (options.inlineEvidence) {
      for (const inline of options.inlineEvidence) {
        const ref = await this.storeInlineEvidence(
          inline.data,
          inline.filename,
          inline.type,
          options.runId,
          receiptId
        );
        evidenceRefs.push(ref);
      }
    }

    // Create receipt
    const receipt: Receipt = {
      receiptId,
      kind: options.kind,
      summary: options.summary,
      evidenceRefs,
      signals: options.signals,
      timestamp,
      runId: options.runId,
    };

    // Validate receipt
    const validation = ReceiptSchema.safeParse(receipt);
    if (!validation.success) {
      throw new Error(`Invalid receipt: ${validation.error.message}`);
    }

    // Store receipt JSON
    const receiptPath = path.join(runDir, `${receiptId}.json`);
    await fs.writeFile(receiptPath, JSON.stringify(receipt, null, 2));

    // Update index
    this.index.set(receiptId, receipt);
    await this.saveIndex();

    return receipt;
  }

  /**
   * Get a receipt by ID
   */
  async getReceipt(receiptId: string): Promise<Receipt | null> {
    await this.ensureInitialized();
    return this.index.get(receiptId) ?? null;
  }

  /**
   * Query receipts
   */
  async queryReceipts(query: EvidenceQuery): Promise<Receipt[]> {
    await this.ensureInitialized();

    let results = Array.from(this.index.values());

    // Apply filters
    if (query.runId) {
      results = results.filter(r => r.runId === query.runId);
    }

    if (query.kind) {
      results = results.filter(r => r.kind === query.kind);
    }

    if (query.hasSignal) {
      results = results.filter(r => 
        r.signals.some(s => s.id === query.hasSignal)
      );
    }

    if (query.signalValue) {
      results = results.filter(r =>
        r.signals.some(s => 
          s.id === query.signalValue!.id && s.value === query.signalValue!.value
        )
      );
    }

    // Sort by timestamp descending
    results.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    // Apply pagination
    if (query.offset) {
      results = results.slice(query.offset);
    }

    if (query.limit) {
      results = results.slice(0, query.limit);
    }

    return results;
  }

  /**
   * Get all receipts for a run
   */
  async getRunReceipts(runId: string): Promise<Receipt[]> {
    return this.queryReceipts({ runId });
  }

  /**
   * Get evidence file content
   */
  async getEvidenceFile(
    runId: string,
    filename: string
  ): Promise<Buffer | null> {
    await this.ensureInitialized();

    const filePath = path.join(this.config.baseDir, 'runs', runId, filename);
    
    try {
      return await fs.readFile(filePath);
    } catch {
      return null;
    }
  }

  /**
   * Verify receipt integrity
   */
  async verifyReceipt(receiptId: string): Promise<{
    valid: boolean;
    errors: string[];
  }> {
    await this.ensureInitialized();

    const errors: string[] = [];
    const receipt = this.index.get(receiptId);

    if (!receipt) {
      return { valid: false, errors: ['Receipt not found'] };
    }

    // Verify evidence files exist and hashes match
    for (const ref of receipt.evidenceRefs) {
      const filePath = path.join(
        this.config.baseDir, 
        'runs', 
        receipt.runId, 
        ref.path
      );

      try {
        const content = await fs.readFile(filePath);
        
        if (ref.hash) {
          const actualHash = this.hashContent(content);
          if (actualHash !== ref.hash) {
            errors.push(`Hash mismatch for ${ref.path}: expected ${ref.hash}, got ${actualHash}`);
          }
        }
      } catch {
        errors.push(`Evidence file missing: ${ref.path}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get storage statistics
   */
  async getStats(): Promise<StorageStats> {
    await this.ensureInitialized();

    const stats: StorageStats = {
      totalReceipts: this.index.size,
      totalFiles: 0,
      totalBytes: 0,
      byKind: {
        test: 0,
        runtime: 0,
        network: 0,
        ui: 0,
        security: 0,
        policy: 0,
        chaos: 0,
      },
      byRun: {},
    };

    for (const receipt of this.index.values()) {
      stats.byKind[receipt.kind]++;

      if (!stats.byRun[receipt.runId]) {
        stats.byRun[receipt.runId] = { receipts: 0, bytes: 0 };
      }
      stats.byRun[receipt.runId].receipts++;

      for (const ref of receipt.evidenceRefs) {
        stats.totalFiles++;
        
        try {
          const filePath = path.join(
            this.config.baseDir,
            'runs',
            receipt.runId,
            ref.path
          );
          const stat = await fs.stat(filePath);
          stats.totalBytes += stat.size;
          stats.byRun[receipt.runId].bytes += stat.size;
        } catch {
          // File missing or inaccessible
        }
      }
    }

    return stats;
  }

  /**
   * Prune old evidence based on retention policy
   */
  async prune(): Promise<{ deletedReceipts: number; freedBytes: number }> {
    await this.ensureInitialized();

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);

    let deletedReceipts = 0;
    let freedBytes = 0;

    for (const [receiptId, receipt] of this.index.entries()) {
      const receiptDate = new Date(receipt.timestamp);
      
      if (receiptDate < cutoffDate) {
        // Delete evidence files
        for (const ref of receipt.evidenceRefs) {
          try {
            const filePath = path.join(
              this.config.baseDir,
              'runs',
              receipt.runId,
              ref.path
            );
            const stat = await fs.stat(filePath);
            freedBytes += stat.size;
            await fs.unlink(filePath);
          } catch {
            // Already deleted
          }
        }

        // Delete receipt file
        try {
          const receiptPath = path.join(
            this.config.baseDir,
            'runs',
            receipt.runId,
            `${receiptId}.json`
          );
          await fs.unlink(receiptPath);
        } catch {
          // Already deleted
        }

        this.index.delete(receiptId);
        deletedReceipts++;
      }
    }

    // Clean up empty run directories
    await this.cleanEmptyDirs();

    await this.saveIndex();

    return { deletedReceipts, freedBytes };
  }

  /**
   * Export all receipts for a run as a bundle
   */
  async exportRun(runId: string): Promise<{
    receipts: Receipt[];
    manifest: Record<string, string>;
  }> {
    await this.ensureInitialized();

    const receipts = await this.getRunReceipts(runId);
    const manifest: Record<string, string> = {};

    for (const receipt of receipts) {
      for (const ref of receipt.evidenceRefs) {
        const content = await this.getEvidenceFile(runId, ref.path);
        if (content) {
          manifest[ref.path] = content.toString('base64');
        }
      }
    }

    return { receipts, manifest };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  private async storeEvidenceFile(
    sourcePath: string,
    type: Receipt['evidenceRefs'][0]['type'],
    runId: string,
    receiptId: string
  ): Promise<Receipt['evidenceRefs'][0]> {
    const content = await fs.readFile(sourcePath);
    const hash = this.hashContent(content);
    const ext = path.extname(sourcePath) || this.getExtension(type);
    const filename = `${receiptId}_${type}${ext}`;

    const destPath = path.join(
      this.config.baseDir,
      'runs',
      runId,
      filename
    );

    await fs.copyFile(sourcePath, destPath);

    return { path: filename, hash, type };
  }

  private async storeInlineEvidence(
    data: string | Buffer,
    filename: string,
    type: Receipt['evidenceRefs'][0]['type'],
    runId: string,
    receiptId: string
  ): Promise<Receipt['evidenceRefs'][0]> {
    const content = typeof data === 'string' ? Buffer.from(data) : data;
    const hash = this.hashContent(content);
    const ext = path.extname(filename) || this.getExtension(type);
    const destFilename = `${receiptId}_${filename}${ext}`;

    const destPath = path.join(
      this.config.baseDir,
      'runs',
      runId,
      destFilename
    );

    await fs.writeFile(destPath, content);

    return { path: destFilename, hash, type };
  }

  private hashContent(content: Buffer): string {
    return createHash('sha256').update(content).digest('hex').slice(0, 16);
  }

  private getExtension(type: Receipt['evidenceRefs'][0]['type']): string {
    switch (type) {
      case 'screenshot': return '.png';
      case 'trace': return '.json';
      case 'har': return '.har';
      case 'log': return '.log';
      case 'diff': return '.diff';
      case 'video': return '.webm';
      default: return '.bin';
    }
  }

  private async loadIndex(): Promise<void> {
    const indexPath = path.join(this.config.baseDir, 'index.json');

    try {
      const content = await fs.readFile(indexPath, 'utf-8');
      const data = JSON.parse(content) as Receipt[];
      
      this.index.clear();
      for (const receipt of data) {
        this.index.set(receipt.receiptId, receipt);
      }
    } catch {
      // No existing index, start fresh
      this.index.clear();
    }
  }

  private async saveIndex(): Promise<void> {
    const indexPath = path.join(this.config.baseDir, 'index.json');
    const data = Array.from(this.index.values());
    await fs.writeFile(indexPath, JSON.stringify(data, null, 2));
  }

  private async cleanEmptyDirs(): Promise<void> {
    const runsDir = path.join(this.config.baseDir, 'runs');
    
    try {
      const entries = await fs.readdir(runsDir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const dirPath = path.join(runsDir, entry.name);
          const contents = await fs.readdir(dirPath);
          
          if (contents.length === 0) {
            await fs.rmdir(dirPath);
          }
        }
      }
    } catch {
      // Ignore errors during cleanup
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createEvidenceStore(
  projectRoot: string,
  subdir = '.vibecheck/evidence'
): EvidenceStore {
  return new EvidenceStore({
    baseDir: path.join(projectRoot, subdir),
  });
}
