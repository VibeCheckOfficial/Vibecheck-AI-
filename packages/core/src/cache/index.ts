/**
 * Unified Cache Manager
 * 
 * Three-tier caching system: Memory -> Disk -> Cloud
 * Orchestrates cache lookups and updates across all tiers.
 */

import { Cache as MemoryCache, getCache } from '../utils/cache.js';
import { DiskCache, createDiskCache } from './disk-cache.js';
import { DependencyTracker, createDependencyTracker, extractImports } from './dependency-tracker.js';
import { CloudSync, createCloudSync } from './cloud-sync.js';
import type {
  CacheConfig,
  CacheEntry,
  CacheStats,
  CloudSyncConfig,
  DEFAULT_CACHE_CONFIG,
  InvalidationResult,
} from './types.js';

export * from './types.js';
export { DiskCache, createDiskCache, generateConfigHash } from './disk-cache.js';
export { DependencyTracker, createDependencyTracker, extractImports } from './dependency-tracker.js';
export { CloudSync, createCloudSync } from './cloud-sync.js';

interface CacheManagerOptions {
  /** Cache configuration */
  config?: Partial<CacheConfig>;
  /** Base directory for dependency tracking */
  baseDir?: string;
  /** Project identifier for cache namespacing */
  projectId?: string;
}

/**
 * Unified Cache Manager
 * 
 * Provides a three-tier caching system with:
 * - Memory: Fast in-process LRU cache
 * - Disk: Persistent file-based cache
 * - Cloud: Optional remote cache for team sharing
 */
export class CacheManager {
  private memory: MemoryCache<CacheEntry>;
  private disk: DiskCache;
  private cloud: CloudSync;
  private dependencies: DependencyTracker;
  private config: CacheConfig;
  private projectId: string;

  constructor(options: CacheManagerOptions = {}) {
    this.config = {
      enabled: true,
      location: 'node_modules/.cache/vibecheck',
      strategy: 'hybrid',
      maxSizeBytes: 100 * 1024 * 1024,
      defaultTtlMs: 24 * 60 * 60 * 1000,
      ...options.config,
    };

    this.projectId = options.projectId ?? 'default';
    const baseDir = options.baseDir ?? process.cwd();

    // Initialize tiers
    this.memory = getCache<CacheEntry>(`vibecheck-${this.projectId}`, {
      maxSize: 1000,
      defaultTtlMs: this.config.defaultTtlMs,
    });

    this.disk = createDiskCache({
      location: this.config.location,
      maxSizeBytes: this.config.maxSizeBytes,
      strategy: this.config.strategy,
    });

    this.cloud = createCloudSync(this.config.cloudSync);
    this.dependencies = createDependencyTracker(baseDir);
  }

  /**
   * Get a cached entry, checking all tiers
   */
  async get<T>(
    key: string,
    options?: {
      filePath?: string;
      stats?: { mtime: number; size: number };
      content?: string;
    }
  ): Promise<T | undefined> {
    if (!this.config.enabled) return undefined;

    // Tier 1: Memory
    const memoryEntry = this.memory.get(key);
    if (memoryEntry) {
      return memoryEntry.result as T;
    }

    // Tier 2: Disk
    if (options?.filePath) {
      const diskEntry = this.disk.getValidated<T>(
        key,
        options.filePath,
        options.stats,
        options.content
      );
      if (diskEntry) {
        // Promote to memory
        this.memory.set(key, diskEntry as CacheEntry);
        return diskEntry.result;
      }
    } else {
      const diskEntry = this.disk.get<T>(key);
      if (diskEntry) {
        // Promote to memory
        this.memory.set(key, diskEntry as CacheEntry);
        return diskEntry.result;
      }
    }

    // Tier 3: Cloud
    if (this.cloud.isEnabled()) {
      const cloudEntry = await this.cloud.get<T>(key);
      if (cloudEntry) {
        // Promote to disk and memory
        this.disk.set(key, cloudEntry.result, {
          filePath: options?.filePath ?? key,
          mtime: cloudEntry.mtime,
          size: cloudEntry.size,
          contentHash: cloudEntry.contentHash,
          dependencies: cloudEntry.dependencies,
          ttlMs: cloudEntry.expiresAt - Date.now(),
        });
        this.memory.set(key, cloudEntry as CacheEntry);
        return cloudEntry.result;
      }
    }

    return undefined;
  }

  /**
   * Set a cached entry across all tiers
   */
  set<T>(
    key: string,
    result: T,
    options: {
      filePath: string;
      mtime: number;
      size: number;
      contentHash?: string;
      dependencies?: string[];
      ttlMs?: number;
    }
  ): void {
    if (!this.config.enabled) return;

    const ttlMs = options.ttlMs ?? this.config.defaultTtlMs;
    const now = Date.now();

    const entry: CacheEntry<T> = {
      key,
      mtime: options.mtime,
      size: options.size,
      contentHash: options.contentHash,
      result,
      dependencies: options.dependencies ?? [],
      createdAt: now,
      expiresAt: now + ttlMs,
    };

    // Update all tiers
    this.memory.set(key, entry as CacheEntry);
    this.disk.set(key, result, options);
    
    if (this.cloud.isEnabled()) {
      this.cloud.set(key, entry as CacheEntry);
    }

    // Update dependency tracking
    if (options.dependencies && options.dependencies.length > 0) {
      this.dependencies.setDependencies(options.filePath, options.dependencies);
    }
  }

  /**
   * Delete a cached entry from all tiers
   */
  delete(key: string): void {
    this.memory.delete(key);
    this.disk.delete(key);
    
    if (this.cloud.isEnabled()) {
      this.cloud.delete(key);
    }
  }

  /**
   * Invalidate a file and all its dependents
   */
  invalidate(filePath: string): InvalidationResult {
    const result = this.dependencies.invalidate(filePath);

    for (const file of result.invalidated) {
      // Generate the key for this file and delete it
      const key = this.disk.generateKey(file);
      this.delete(key);
    }

    return result;
  }

  /**
   * Check if a key exists in any tier
   */
  has(key: string): boolean {
    return this.memory.has(key) || this.disk.has(key);
  }

  /**
   * Clear all caches
   */
  async clear(): Promise<void> {
    this.memory.clear();
    this.disk.clear();
    await this.cloud.clear();
    this.dependencies.clear();
  }

  /**
   * Perform cleanup of expired entries
   */
  cleanup(): number {
    return this.disk.cleanup();
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const memoryStats = this.memory.getStats();
    const diskStats = this.disk.getStats();
    const cloudStats = this.cloud.getStats();
    const depStats = this.dependencies.getStats();

    const totalHits = memoryStats.hits + diskStats.hits + cloudStats.hits;
    const totalMisses = memoryStats.misses + diskStats.misses + cloudStats.misses;

    return {
      entries: memoryStats.size + diskStats.entries,
      sizeBytes: diskStats.sizeBytes,
      hits: totalHits,
      misses: totalMisses,
      hitRate: totalHits + totalMisses > 0 ? totalHits / (totalHits + totalMisses) : 0,
      evictions: memoryStats.evictions,
      invalidations: depStats.invalidationCount,
      byTier: {
        memory: {
          hits: memoryStats.hits,
          misses: memoryStats.misses,
          entries: memoryStats.size,
          sizeBytes: 0, // Memory size estimation not available
        },
        disk: diskStats,
        cloud: cloudStats,
      },
    };
  }

  /**
   * Get the dependency tracker
   */
  getDependencyTracker(): DependencyTracker {
    return this.dependencies;
  }

  /**
   * Generate a cache key for a file
   */
  generateKey(
    filePath: string,
    options?: {
      content?: string;
      stats?: { mtime: number; size: number };
    }
  ): string {
    return this.disk.generateKey(filePath, options?.content, options?.stats);
  }

  /**
   * Hash content using SHA-256
   */
  hashContent(content: string): string {
    return this.disk.hashContent(content);
  }

  /**
   * Check cloud connection status
   */
  async checkCloudConnection(): Promise<boolean> {
    return this.cloud.checkConnection();
  }
}

// Global cache manager instance
let globalCacheManager: CacheManager | null = null;

/**
 * Get or create the global cache manager
 */
export function getCacheManager(options?: CacheManagerOptions): CacheManager {
  if (!globalCacheManager) {
    globalCacheManager = new CacheManager(options);
  }
  return globalCacheManager;
}

/**
 * Create a new cache manager instance
 */
export function createCacheManager(options?: CacheManagerOptions): CacheManager {
  return new CacheManager(options);
}

/**
 * Reset the global cache manager
 */
export function resetCacheManager(): void {
  if (globalCacheManager) {
    globalCacheManager.clear().catch(() => {});
    globalCacheManager = null;
  }
}
