/**
 * Checkpoint Storage
 * 
 * Handles file system operations for checkpoint storage with optional compression.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { promisify } from 'util';
import { gzip, gunzip } from 'zlib';

import type {
  CheckpointIndex,
  CheckpointSummary,
  StorageSettings,
  StorageStatus,
  StorageOptions,
} from './types.js';
import { DEFAULT_STORAGE_SETTINGS } from './types.js';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

// ============================================================================
// Constants
// ============================================================================

const INDEX_FILE = 'index.json';
const INDEX_VERSION = 1;

// ============================================================================
// Storage Class
// ============================================================================

export class CheckpointStorage {
  private storageDir: string;
  private options: StorageOptions;

  constructor(projectRoot: string, options: StorageOptions = {}) {
    this.storageDir = path.join(projectRoot, '.vibecheck', 'checkpoints');
    this.options = {
      compress: options.compress ?? false,
      compressionLevel: options.compressionLevel ?? 6,
    };
  }

  /**
   * Ensure storage directory exists
   */
  ensureStorageDir(): void {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
  }

  /**
   * Get storage directory path
   */
  getStoragePath(): string {
    return this.storageDir;
  }

  /**
   * Get checkpoint directory path
   */
  getCheckpointPath(checkpointId: string): string {
    return path.join(this.storageDir, checkpointId);
  }

  /**
   * Get files directory within a checkpoint
   */
  getFilesPath(checkpointId: string): string {
    return path.join(this.getCheckpointPath(checkpointId), 'files');
  }

  // ============================================================================
  // Index Operations
  // ============================================================================

  /**
   * Read the checkpoint index
   */
  readIndex(): CheckpointIndex {
    const indexPath = path.join(this.storageDir, INDEX_FILE);

    if (!fs.existsSync(indexPath)) {
      return {
        version: INDEX_VERSION,
        checkpoints: [],
        settings: { ...DEFAULT_STORAGE_SETTINGS },
      };
    }

    try {
      const content = fs.readFileSync(indexPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return {
        version: INDEX_VERSION,
        checkpoints: [],
        settings: { ...DEFAULT_STORAGE_SETTINGS },
      };
    }
  }

  /**
   * Write the checkpoint index
   */
  writeIndex(index: CheckpointIndex): void {
    this.ensureStorageDir();
    const indexPath = path.join(this.storageDir, INDEX_FILE);
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8');
  }

  /**
   * Add checkpoint to index
   */
  addToIndex(summary: CheckpointSummary): void {
    const index = this.readIndex();
    index.checkpoints.push(summary);
    this.writeIndex(index);
  }

  /**
   * Remove checkpoint from index
   */
  removeFromIndex(checkpointId: string): void {
    const index = this.readIndex();
    index.checkpoints = index.checkpoints.filter(c => c.id !== checkpointId);
    this.writeIndex(index);
  }

  /**
   * Update storage settings
   */
  updateSettings(settings: Partial<StorageSettings>): void {
    const index = this.readIndex();
    index.settings = { ...index.settings, ...settings };
    this.writeIndex(index);
  }

  // ============================================================================
  // File Operations
  // ============================================================================

  /**
   * Store a file in the checkpoint
   */
  async storeFile(
    checkpointId: string,
    relativePath: string,
    content: Buffer
  ): Promise<{ hash: string; size: number }> {
    const filesDir = this.getFilesPath(checkpointId);
    if (!fs.existsSync(filesDir)) {
      fs.mkdirSync(filesDir, { recursive: true });
    }

    // Calculate hash
    const hash = crypto.createHash('sha256').update(content).digest('hex');

    // Prepare file path (flatten directory structure with encoded path)
    const encodedPath = this.encodePath(relativePath);
    const filePath = path.join(filesDir, encodedPath);

    // Optionally compress
    let dataToWrite = content;
    if (this.options.compress) {
      dataToWrite = await gzipAsync(content, { level: this.options.compressionLevel });
    }

    // Write file
    fs.writeFileSync(filePath, dataToWrite);

    return { hash, size: content.length };
  }

  /**
   * Retrieve a file from the checkpoint
   */
  async retrieveFile(checkpointId: string, relativePath: string): Promise<Buffer | null> {
    const filesDir = this.getFilesPath(checkpointId);
    const encodedPath = this.encodePath(relativePath);
    const filePath = path.join(filesDir, encodedPath);

    if (!fs.existsSync(filePath)) {
      return null;
    }

    let content = fs.readFileSync(filePath);

    // Decompress if needed
    if (this.options.compress) {
      try {
        content = await gunzipAsync(content);
      } catch {
        // File might not be compressed, return as-is
      }
    }

    return content;
  }

  /**
   * Store checkpoint manifest
   */
  storeManifest(checkpointId: string, manifest: unknown): void {
    const checkpointDir = this.getCheckpointPath(checkpointId);
    if (!fs.existsSync(checkpointDir)) {
      fs.mkdirSync(checkpointDir, { recursive: true });
    }

    const manifestPath = path.join(checkpointDir, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  }

  /**
   * Read checkpoint manifest
   */
  readManifest<T>(checkpointId: string): T | null {
    const manifestPath = path.join(this.getCheckpointPath(checkpointId), 'manifest.json');

    if (!fs.existsSync(manifestPath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(manifestPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  /**
   * Delete a checkpoint
   */
  deleteCheckpoint(checkpointId: string): boolean {
    const checkpointDir = this.getCheckpointPath(checkpointId);

    if (!fs.existsSync(checkpointDir)) {
      return false;
    }

    // Remove directory recursively
    fs.rmSync(checkpointDir, { recursive: true, force: true });

    // Remove from index
    this.removeFromIndex(checkpointId);

    return true;
  }

  // ============================================================================
  // Size Calculations
  // ============================================================================

  /**
   * Get size of a directory
   */
  getDirectorySize(dir: string): number {
    if (!fs.existsSync(dir)) {
      return 0;
    }

    let size = 0;
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        size += this.getDirectorySize(fullPath);
      } else {
        const stat = fs.statSync(fullPath);
        size += stat.size;
      }
    }

    return size;
  }

  /**
   * Get total storage size
   */
  getTotalSize(): number {
    return this.getDirectorySize(this.storageDir);
  }

  /**
   * Get checkpoint size
   */
  getCheckpointSize(checkpointId: string): number {
    return this.getDirectorySize(this.getCheckpointPath(checkpointId));
  }

  // ============================================================================
  // Status
  // ============================================================================

  /**
   * Get storage status
   */
  getStatus(): StorageStatus {
    const index = this.readIndex();
    const checkpoints = index.checkpoints;

    let oldest: string | undefined;
    let newest: string | undefined;

    if (checkpoints.length > 0) {
      const sorted = [...checkpoints].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
      oldest = sorted[0].timestamp;
      newest = sorted[sorted.length - 1].timestamp;
    }

    return {
      storagePath: this.storageDir,
      totalCheckpoints: checkpoints.length,
      totalSize: this.getTotalSize(),
      oldestCheckpoint: oldest,
      newestCheckpoint: newest,
      settings: index.settings,
    };
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  /**
   * Encode a file path for safe storage
   */
  private encodePath(relativePath: string): string {
    // Replace path separators and encode special characters
    return relativePath
      .replace(/\\/g, '/')
      .replace(/\//g, '__')
      .replace(/[<>:"|?*]/g, '_');
  }

  /**
   * Decode a stored file path
   */
  decodePath(encodedPath: string): string {
    return encodedPath.replace(/__/g, '/');
  }

  /**
   * List all files in a checkpoint
   */
  listCheckpointFiles(checkpointId: string): string[] {
    const filesDir = this.getFilesPath(checkpointId);

    if (!fs.existsSync(filesDir)) {
      return [];
    }

    return fs.readdirSync(filesDir).map(f => this.decodePath(f));
  }
}

// ============================================================================
// Hash Utilities
// ============================================================================

/**
 * Calculate SHA256 hash of a file
 */
export function hashFile(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Calculate SHA256 hash of content
 */
export function hashContent(content: Buffer | string): string {
  const data = typeof content === 'string' ? Buffer.from(content) : content;
  return crypto.createHash('sha256').update(data).digest('hex');
}

// ============================================================================
// Size Formatting
// ============================================================================

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${units[i]}`;
}
