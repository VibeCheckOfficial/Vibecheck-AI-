/**
 * Multi-Level Cache
 *
 * Three-tier caching system:
 * - L1: Memory (fastest, limited size)
 * - L2: Disk (fast, larger capacity)
 * - L3: Shared (optional, team-wide cache)
 *
 * Provides significant speedups for repeated scans.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { createHash } from 'crypto';
import { gzip, gunzip } from 'zlib';
import { promisify } from 'util';
import { getLogger, type Logger } from '../utils/logger.js';
import type {
  CacheEntry,
  CacheLevel,
  CacheStats,
  MultiLevelCacheConfig,
  DEFAULT_MULTI_CACHE_CONFIG,
} from './types.js';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

const DEFAULT_CONFIG: MultiLevelCacheConfig = {
  memory: {
    enabled: true,
    maxSize: 100 * 1024 * 1024, // 100MB
    ttlMs: 5 * 60 * 1000, // 5 minutes
  },
  disk: {
    enabled: true,
    maxSize: 500 * 1024 * 1024, // 500MB
    ttlMs: 24 * 60 * 60 * 1000, // 24 hours
    path: '.vibecheck/cache',
    compression: true,
  },
  promoteOnAccess: true,
  writeThrough: true,
};

interface MemoryCacheEntry<T> {
  key: string;
  value: T;
  size: number;
  createdAt: number;
  expiresAt: number;
  hits: number;
}

interface DiskCacheMetadata {
  key: string;
  size: number;
  createdAt: number;
  expiresAt: number;
  compressed: boolean;
  hash: string;
}

/**
 * Multi-Level Cache
 */
export class MultiLevelCache<T = unknown> {
  private config: MultiLevelCacheConfig;
  private projectRoot: string;
  private logger: Logger;

  // L1: Memory cache
  private memoryCache = new Map<string, MemoryCacheEntry<T>>();
  private memorySize = 0;
  private memoryStats = { hits: 0, misses: 0 };

  // L2: Disk cache metadata (full data on disk)
  private diskIndex = new Map<string, DiskCacheMetadata>();
  private diskStats = { hits: 0, misses: 0 };

  // Cleanup timer
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(projectRoot: string, config: Partial<MultiLevelCacheConfig> = {}) {
    this.projectRoot = projectRoot;
    this.config = this.mergeConfig(DEFAULT_CONFIG, config);
    this.logger = getLogger('multi-level-cache');
  }

  /**
   * Initialize the cache - loads disk index
   */
  async initialize(): Promise<void> {
    if (this.config.disk.enabled) {
      await this.loadDiskIndex();
    }

    this.startCleanupTimer();
    this.logger.debug('Multi-level cache initialized');
  }

  /**
   * Get a value from cache
   */
  async get(key: string): Promise<T | null> {
    // L1: Check memory cache
    if (this.config.memory.enabled) {
      const memEntry = this.memoryCache.get(key);
      if (memEntry && !this.isExpired(memEntry)) {
        memEntry.hits++;
        this.memoryStats.hits++;
        return memEntry.value;
      }
      if (memEntry) {
        // Expired
        this.memoryCache.delete(key);
        this.memorySize -= memEntry.size;
      }
      this.memoryStats.misses++;
    }

    // L2: Check disk cache
    if (this.config.disk.enabled) {
      const diskMeta = this.diskIndex.get(key);
      if (diskMeta && !this.isExpiredMeta(diskMeta)) {
        try {
          const value = await this.readFromDisk(key, diskMeta);
          this.diskStats.hits++;

          // Promote to memory if configured
          if (this.config.promoteOnAccess && this.config.memory.enabled) {
            this.setMemory(key, value, diskMeta.expiresAt - Date.now());
          }

          return value;
        } catch {
          // Failed to read from disk
          this.diskIndex.delete(key);
        }
      }
      this.diskStats.misses++;
    }

    // L3: Shared cache would go here (not implemented - requires external service)

    return null;
  }

  /**
   * Get or compute a value
   */
  async getOrCompute(
    key: string,
    compute: () => T | Promise<T>,
    ttlMs?: number
  ): Promise<T> {
    const cached = await this.get(key);
    if (cached !== null) {
      return cached;
    }

    const value = await compute();
    await this.set(key, value, ttlMs);
    return value;
  }

  /**
   * Set a value in cache
   */
  async set(key: string, value: T, ttlMs?: number): Promise<void> {
    // L1: Set in memory
    if (this.config.memory.enabled) {
      this.setMemory(key, value, ttlMs ?? this.config.memory.ttlMs);
    }

    // L2: Write through to disk
    if (this.config.writeThrough && this.config.disk.enabled) {
      await this.setDisk(key, value, ttlMs ?? this.config.disk.ttlMs);
    }
  }

  /**
   * Check if a key exists
   */
  async has(key: string): Promise<boolean> {
    // Check memory
    const memEntry = this.memoryCache.get(key);
    if (memEntry && !this.isExpired(memEntry)) {
      return true;
    }

    // Check disk
    const diskMeta = this.diskIndex.get(key);
    if (diskMeta && !this.isExpiredMeta(diskMeta)) {
      return true;
    }

    return false;
  }

  /**
   * Delete a key from all cache levels
   */
  async delete(key: string): Promise<boolean> {
    let deleted = false;

    // Delete from memory
    const memEntry = this.memoryCache.get(key);
    if (memEntry) {
      this.memoryCache.delete(key);
      this.memorySize -= memEntry.size;
      deleted = true;
    }

    // Delete from disk
    if (this.diskIndex.has(key)) {
      this.diskIndex.delete(key);
      try {
        const filePath = this.getDiskPath(key);
        await fs.unlink(filePath);
        await fs.unlink(filePath + '.meta');
      } catch {
        // Ignore delete errors
      }
      deleted = true;
    }

    return deleted;
  }

  /**
   * Clear all cache levels
   */
  async clear(): Promise<void> {
    // Clear memory
    this.memoryCache.clear();
    this.memorySize = 0;

    // Clear disk
    if (this.config.disk.enabled) {
      const cacheDir = path.join(this.projectRoot, this.config.disk.path);
      try {
        const files = await fs.readdir(cacheDir);
        await Promise.all(
          files.map((f) => fs.unlink(path.join(cacheDir, f)).catch(() => {}))
        );
      } catch {
        // Directory might not exist
      }
      this.diskIndex.clear();
    }

    this.logger.debug('Cache cleared');
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const memoryHitRate =
      this.memoryStats.hits + this.memoryStats.misses > 0
        ? this.memoryStats.hits / (this.memoryStats.hits + this.memoryStats.misses)
        : 0;

    const diskHitRate =
      this.diskStats.hits + this.diskStats.misses > 0
        ? this.diskStats.hits / (this.diskStats.hits + this.diskStats.misses)
        : 0;

    const totalHits = this.memoryStats.hits + this.diskStats.hits;
    const totalMisses = this.memoryStats.misses + this.diskStats.misses;
    const totalHitRate = totalHits + totalMisses > 0 ? totalHits / (totalHits + totalMisses) : 0;

    return {
      memory: {
        size: this.memorySize,
        entries: this.memoryCache.size,
        hits: this.memoryStats.hits,
        misses: this.memoryStats.misses,
        hitRate: memoryHitRate,
      },
      disk: {
        size: this.calculateDiskSize(),
        entries: this.diskIndex.size,
        hits: this.diskStats.hits,
        misses: this.diskStats.misses,
        hitRate: diskHitRate,
      },
      totalHitRate,
    };
  }

  /**
   * Dispose resources
   */
  async dispose(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    // Save disk index
    if (this.config.disk.enabled) {
      await this.saveDiskIndex();
    }
  }

  // ============================================================================
  // Private Methods - Memory Cache
  // ============================================================================

  private setMemory(key: string, value: T, ttlMs: number): void {
    const size = this.estimateSize(value);

    // Evict if necessary
    while (
      this.memorySize + size > this.config.memory.maxSize &&
      this.memoryCache.size > 0
    ) {
      this.evictOldest();
    }

    // Check if still too large
    if (size > this.config.memory.maxSize) {
      this.logger.debug('Value too large for memory cache', { key, size });
      return;
    }

    const entry: MemoryCacheEntry<T> = {
      key,
      value,
      size,
      createdAt: Date.now(),
      expiresAt: Date.now() + ttlMs,
      hits: 0,
    };

    // Remove old entry if exists
    const existing = this.memoryCache.get(key);
    if (existing) {
      this.memorySize -= existing.size;
    }

    this.memoryCache.set(key, entry);
    this.memorySize += size;
  }

  private evictOldest(): void {
    // Find oldest entry with fewest hits
    let oldest: MemoryCacheEntry<T> | null = null;
    let oldestScore = Infinity;

    for (const entry of this.memoryCache.values()) {
      // Score = createdAt - hits * 1000 (prefer evicting old, unhit entries)
      const score = entry.createdAt - entry.hits * 1000;
      if (score < oldestScore) {
        oldestScore = score;
        oldest = entry;
      }
    }

    if (oldest) {
      this.memoryCache.delete(oldest.key);
      this.memorySize -= oldest.size;
    }
  }

  private isExpired(entry: MemoryCacheEntry<T>): boolean {
    return Date.now() > entry.expiresAt;
  }

  // ============================================================================
  // Private Methods - Disk Cache
  // ============================================================================

  private async setDisk(key: string, value: T, ttlMs: number): Promise<void> {
    const cacheDir = path.join(this.projectRoot, this.config.disk.path);

    try {
      await fs.mkdir(cacheDir, { recursive: true });

      let data = JSON.stringify(value);
      let compressed = false;

      if (this.config.disk.compression && data.length > 1024) {
        const compressedData = await gzipAsync(Buffer.from(data));
        if (compressedData.length < data.length * 0.9) {
          data = compressedData.toString('base64');
          compressed = true;
        }
      }

      const hash = createHash('sha256').update(data).digest('hex').slice(0, 16);
      const filePath = this.getDiskPath(key);

      const metadata: DiskCacheMetadata = {
        key,
        size: data.length,
        createdAt: Date.now(),
        expiresAt: Date.now() + ttlMs,
        compressed,
        hash,
      };

      // Write data and metadata
      await fs.writeFile(filePath, data, 'utf-8');
      await fs.writeFile(filePath + '.meta', JSON.stringify(metadata), 'utf-8');

      this.diskIndex.set(key, metadata);

      // Enforce size limit
      await this.enforceDiskSizeLimit();
    } catch (error) {
      this.logger.debug('Failed to write to disk cache', {
        key,
        error: error instanceof Error ? error.message : 'Unknown',
      });
    }
  }

  private async readFromDisk(key: string, metadata: DiskCacheMetadata): Promise<T> {
    const filePath = this.getDiskPath(key);
    let data = await fs.readFile(filePath, 'utf-8');

    if (metadata.compressed) {
      const decompressed = await gunzipAsync(Buffer.from(data, 'base64'));
      data = decompressed.toString('utf-8');
    }

    return JSON.parse(data) as T;
  }

  private getDiskPath(key: string): string {
    const hash = createHash('sha256').update(key).digest('hex').slice(0, 32);
    return path.join(this.projectRoot, this.config.disk.path, hash);
  }

  private isExpiredMeta(metadata: DiskCacheMetadata): boolean {
    return Date.now() > metadata.expiresAt;
  }

  private async loadDiskIndex(): Promise<void> {
    const cacheDir = path.join(this.projectRoot, this.config.disk.path);

    try {
      const files = await fs.readdir(cacheDir);
      const metaFiles = files.filter((f) => f.endsWith('.meta'));

      for (const metaFile of metaFiles) {
        try {
          const content = await fs.readFile(path.join(cacheDir, metaFile), 'utf-8');
          const metadata = JSON.parse(content) as DiskCacheMetadata;

          if (!this.isExpiredMeta(metadata)) {
            this.diskIndex.set(metadata.key, metadata);
          } else {
            // Clean up expired entry
            const dataFile = metaFile.replace('.meta', '');
            await fs.unlink(path.join(cacheDir, dataFile)).catch(() => {});
            await fs.unlink(path.join(cacheDir, metaFile)).catch(() => {});
          }
        } catch {
          // Invalid metadata file
        }
      }

      this.logger.debug('Loaded disk cache index', { entries: this.diskIndex.size });
    } catch {
      // Cache directory doesn't exist yet
    }
  }

  private async saveDiskIndex(): Promise<void> {
    // Index is maintained per-entry, no separate index file needed
  }

  private async enforceDiskSizeLimit(): Promise<void> {
    const totalSize = this.calculateDiskSize();

    if (totalSize <= this.config.disk.maxSize) return;

    // Sort by creation time (oldest first)
    const entries = Array.from(this.diskIndex.entries()).sort(
      (a, b) => a[1].createdAt - b[1].createdAt
    );

    let currentSize = totalSize;

    for (const [key, metadata] of entries) {
      if (currentSize <= this.config.disk.maxSize * 0.9) break;

      await this.delete(key);
      currentSize -= metadata.size;
    }
  }

  private calculateDiskSize(): number {
    let size = 0;
    for (const metadata of this.diskIndex.values()) {
      size += metadata.size;
    }
    return size;
  }

  // ============================================================================
  // Private Methods - Utility
  // ============================================================================

  private estimateSize(value: T): number {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'string') return value.length * 2;
    if (typeof value === 'number') return 8;
    if (typeof value === 'boolean') return 4;
    if (Array.isArray(value)) return value.length * 50;
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value).length * 2;
      } catch {
        return 100;
      }
    }
    return 100;
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, 60000); // Run every minute

    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  private cleanup(): void {
    const now = Date.now();

    // Clean memory cache
    for (const [key, entry] of this.memoryCache) {
      if (now > entry.expiresAt) {
        this.memoryCache.delete(key);
        this.memorySize -= entry.size;
      }
    }

    // Disk cleanup happens during loadDiskIndex and enforceDiskSizeLimit
  }

  private mergeConfig(
    defaults: MultiLevelCacheConfig,
    overrides: Partial<MultiLevelCacheConfig>
  ): MultiLevelCacheConfig {
    return {
      memory: { ...defaults.memory, ...overrides.memory },
      disk: { ...defaults.disk, ...overrides.disk },
      shared: overrides.shared ?? defaults.shared,
      promoteOnAccess: overrides.promoteOnAccess ?? defaults.promoteOnAccess,
      writeThrough: overrides.writeThrough ?? defaults.writeThrough,
    };
  }
}

// ============================================================================
// Singleton and Helpers
// ============================================================================

let globalCache: MultiLevelCache | null = null;

export async function getMultiLevelCache<T = unknown>(
  projectRoot: string,
  config?: Partial<MultiLevelCacheConfig>
): Promise<MultiLevelCache<T>> {
  if (!globalCache || globalCache['projectRoot'] !== projectRoot) {
    globalCache = new MultiLevelCache(projectRoot, config);
    await globalCache.initialize();
  }
  return globalCache as MultiLevelCache<T>;
}

export async function resetMultiLevelCache(): Promise<void> {
  if (globalCache) {
    await globalCache.dispose();
    globalCache = null;
  }
}

/**
 * Create a cache key from multiple parts
 */
export function createCacheKey(...parts: (string | number)[]): string {
  return parts.join(':');
}

/**
 * Create a hash-based cache key
 */
export function createHashKey(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}
