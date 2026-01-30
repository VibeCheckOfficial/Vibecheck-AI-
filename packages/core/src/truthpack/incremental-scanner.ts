/**
 * Incremental Scanner
 * 
 * Provides incremental scanning capabilities by tracking file changes
 * and only scanning modified files. Uses cache system for memoization.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { getCacheManager } from '../cache/index.js';
import type { CacheManager } from '../cache/index.js';

export interface FileMetadata {
  path: string;
  mtime: number;
  size: number;
  contentHash: string;
}

export interface IncrementalScanResult {
  /** Files that were scanned */
  scannedFiles: string[];
  /** Files that were skipped (unchanged) */
  skippedFiles: string[];
  /** Files that were invalidated */
  invalidatedFiles: string[];
  /** Total files checked */
  totalFiles: number;
  /** Cache hit rate (0-1) */
  cacheHitRate: number;
}

/**
 * Incremental scanner for efficient truthpack generation
 */
export class IncrementalScanner {
  private cacheManager: CacheManager;
  private projectRoot: string;
  private cacheKeyPrefix: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    this.cacheManager = getCacheManager({
      baseDir: projectRoot,
      projectId: 'truthpack',
    });
    this.cacheKeyPrefix = 'truthpack:file:';
  }

  /**
   * Get metadata for a file
   */
  async getFileMetadata(filePath: string): Promise<FileMetadata | null> {
    try {
      const fullPath = path.isAbsolute(filePath)
        ? filePath
        : path.join(this.projectRoot, filePath);
      
      const stats = await fs.stat(fullPath);
      const content = await fs.readFile(fullPath, 'utf-8');
      const contentHash = crypto
        .createHash('sha256')
        .update(content)
        .digest('hex');

      return {
        path: path.relative(this.projectRoot, fullPath),
        mtime: stats.mtimeMs,
        size: stats.size,
        contentHash,
      };
    } catch {
      return null;
    }
  }

  /**
   * Check if a file has changed since last scan
   */
  async hasFileChanged(filePath: string): Promise<boolean> {
    const metadata = await this.getFileMetadata(filePath);
    if (!metadata) return true; // File doesn't exist or can't be read

    const cacheKey = `${this.cacheKeyPrefix}${metadata.path}`;
    const cached = await this.cacheManager.get<FileMetadata>(cacheKey, {
      filePath: metadata.path,
      stats: { mtime: metadata.mtime, size: metadata.size },
      content: undefined, // Don't need content for metadata check
    });

    if (!cached) {
      return true; // Not cached, consider it changed
    }

    // Check if metadata matches
    const cachedMeta = cached as unknown as FileMetadata;
    return (
      cachedMeta.mtime !== metadata.mtime ||
      cachedMeta.size !== metadata.size ||
      cachedMeta.contentHash !== metadata.contentHash
    );
  }

  /**
   * Get list of files that need scanning
   */
  async getFilesToScan(filePaths: string[]): Promise<{
    toScan: string[];
    toSkip: string[];
    invalidated: string[];
  }> {
    const toScan: string[] = [];
    const toSkip: string[] = [];
    const invalidated: string[] = [];

    for (const filePath of filePaths) {
      const hasChanged = await this.hasFileChanged(filePath);
      
      if (hasChanged) {
        toScan.push(filePath);
        // Invalidate cache for this file
        this.cacheManager.invalidate(filePath);
        invalidated.push(filePath);
      } else {
        toSkip.push(filePath);
      }
    }

    return { toScan, toSkip, invalidated };
  }

  /**
   * Cache file metadata after scanning
   */
  async cacheFileMetadata(filePath: string, metadata: FileMetadata): Promise<void> {
    const cacheKey = `${this.cacheKeyPrefix}${metadata.path}`;
    
    this.cacheManager.set(cacheKey, metadata, {
      filePath: metadata.path,
      mtime: metadata.mtime,
      size: metadata.size,
      contentHash: metadata.contentHash,
      dependencies: [],
      ttlMs: 24 * 60 * 60 * 1000, // 24 hours
    });
  }

  /**
   * Perform incremental scan
   */
  async scanIncremental(
    filePaths: string[],
    scanFn: (filePath: string) => Promise<unknown>
  ): Promise<IncrementalScanResult> {
    const { toScan, toSkip, invalidated } = await this.getFilesToScan(filePaths);

    // Scan only changed files
    const scanResults = await Promise.all(
      toScan.map(async (filePath) => {
        const result = await scanFn(filePath);
        
        // Cache metadata after scanning
        const metadata = await this.getFileMetadata(filePath);
        if (metadata) {
          await this.cacheFileMetadata(filePath, metadata);
        }
        
        return { filePath, result };
      })
    );

    const totalFiles = filePaths.length;
    const cacheHitRate = totalFiles > 0 ? toSkip.length / totalFiles : 0;

    return {
      scannedFiles: toScan,
      skippedFiles: toSkip,
      invalidatedFiles: invalidated,
      totalFiles,
      cacheHitRate,
    };
  }

  /**
   * Clear all cached file metadata
   */
  async clearCache(): Promise<void> {
    await this.cacheManager.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return this.cacheManager.getStats();
  }
}
