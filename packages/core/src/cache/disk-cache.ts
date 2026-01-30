/**
 * Disk Cache Layer
 * 
 * Provides persistent file-based caching with hybrid invalidation strategy.
 * Uses metadata (mtime + size) as fast path, content hash as fallback.
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { CacheEntry, CacheConfig, TierStats } from './types.js';

interface DiskCacheOptions {
  cacheDir: string;
  maxSizeBytes: number;
  strategy: 'metadata' | 'content' | 'hybrid';
  /** Config/tool version hash - changes invalidate entire cache */
  configHash?: string;
}

interface CacheManifest {
  version: number;
  /** Tool/config version hash - invalidates all entries when changed */
  configHash?: string;
  entries: Record<string, CacheEntry>;
  totalSize: number;
  lastCleanup: number;
}

const MANIFEST_VERSION = 2;
const MANIFEST_FILE = 'cache-manifest.json';

export class DiskCache {
  private cacheDir: string;
  private maxSizeBytes: number;
  private strategy: 'metadata' | 'content' | 'hybrid';
  private configHash?: string;
  private manifest: CacheManifest;
  private stats: TierStats = {
    hits: 0,
    misses: 0,
    entries: 0,
    sizeBytes: 0,
  };

  constructor(options: DiskCacheOptions) {
    this.cacheDir = options.cacheDir;
    this.maxSizeBytes = options.maxSizeBytes;
    this.strategy = options.strategy;
    this.configHash = options.configHash;
    this.manifest = this.loadManifest();
    
    // Check if config hash changed - invalidate cache if so
    if (this.configHash && this.manifest.configHash !== this.configHash) {
      this.manifest = this.createEmptyManifest();
      this.manifest.configHash = this.configHash;
      this.saveManifest();
    }
    
    this.stats.entries = Object.keys(this.manifest.entries).length;
    this.stats.sizeBytes = this.manifest.totalSize;
  }

  /**
   * Generate a cache key for a file
   */
  generateKey(filePath: string, content?: string, stats?: { mtime: number; size: number }): string {
    const normalizedPath = path.normalize(filePath);
    
    if (this.strategy === 'content' && content) {
      return this.hashContent(`${normalizedPath}:${content}`);
    }
    
    if (this.strategy === 'metadata' && stats) {
      return this.hashContent(`${normalizedPath}:${stats.mtime}:${stats.size}`);
    }
    
    // Hybrid: use metadata for key, store content hash for validation
    if (stats) {
      return this.hashContent(`${normalizedPath}:${stats.mtime}:${stats.size}`);
    }
    
    // Fallback to path-only key
    return this.hashContent(normalizedPath);
  }

  /**
   * Get an entry from the disk cache
   */
  get<T>(key: string): CacheEntry<T> | undefined {
    const entry = this.manifest.entries[key] as CacheEntry<T> | undefined;
    
    if (!entry) {
      this.stats.misses++;
      return undefined;
    }

    // Check expiration
    if (Date.now() > entry.expiresAt) {
      this.delete(key);
      this.stats.misses++;
      return undefined;
    }

    this.stats.hits++;
    return entry;
  }

  /**
   * Get entry with validation against current file state
   */
  getValidated<T>(
    key: string,
    filePath: string,
    currentStats?: { mtime: number; size: number },
    currentContent?: string
  ): CacheEntry<T> | undefined {
    const entry = this.get<T>(key);
    if (!entry) return undefined;

    // Validate based on strategy
    if (this.strategy === 'hybrid' && currentStats) {
      // Fast path: check metadata first
      if (entry.mtime === currentStats.mtime && entry.size === currentStats.size) {
        return entry;
      }
      
      // Fallback: check content hash if available
      if (entry.contentHash && currentContent) {
        const currentHash = this.hashContent(currentContent);
        if (entry.contentHash === currentHash) {
          // Update metadata but keep the entry
          entry.mtime = currentStats.mtime;
          entry.size = currentStats.size;
          this.saveManifest();
          return entry;
        }
      }
      
      // Invalidate if neither matches
      this.delete(key);
      return undefined;
    }

    if (this.strategy === 'metadata' && currentStats) {
      if (entry.mtime !== currentStats.mtime || entry.size !== currentStats.size) {
        this.delete(key);
        return undefined;
      }
    }

    if (this.strategy === 'content' && currentContent) {
      const currentHash = this.hashContent(currentContent);
      if (entry.contentHash !== currentHash) {
        this.delete(key);
        return undefined;
      }
    }

    return entry;
  }

  /**
   * Set an entry in the disk cache
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
    const now = Date.now();
    const ttl = options.ttlMs ?? 24 * 60 * 60 * 1000; // Default 24 hours

    const entry: CacheEntry<T> = {
      key,
      mtime: options.mtime,
      size: options.size,
      contentHash: options.contentHash,
      result,
      dependencies: options.dependencies ?? [],
      createdAt: now,
      expiresAt: now + ttl,
    };

    // Estimate entry size
    const entrySize = this.estimateSize(entry);

    // Evict if necessary
    while (this.manifest.totalSize + entrySize > this.maxSizeBytes) {
      if (!this.evictOldest()) break;
    }

    this.manifest.entries[key] = entry as CacheEntry;
    this.manifest.totalSize += entrySize;
    this.stats.entries = Object.keys(this.manifest.entries).length;
    this.stats.sizeBytes = this.manifest.totalSize;

    this.saveManifest();
  }

  /**
   * Delete an entry from the cache
   */
  delete(key: string): boolean {
    const entry = this.manifest.entries[key];
    if (!entry) return false;

    const entrySize = this.estimateSize(entry);
    delete this.manifest.entries[key];
    this.manifest.totalSize -= entrySize;
    this.stats.entries = Object.keys(this.manifest.entries).length;
    this.stats.sizeBytes = this.manifest.totalSize;

    this.saveManifest();
    return true;
  }

  /**
   * Check if an entry exists
   */
  has(key: string): boolean {
    const entry = this.manifest.entries[key];
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Quick check if a file result is cached and valid based on metadata only.
   * This is useful for determining if we need to read file content at all.
   */
  isCachedByMetadata(
    filePath: string,
    stats: { mtime: number; size: number }
  ): boolean {
    const key = this.generateKey(filePath, undefined, stats);
    const entry = this.manifest.entries[key];
    
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) return false;
    if (entry.mtime !== stats.mtime || entry.size !== stats.size) return false;
    
    return true;
  }

  /**
   * Get cache entry by file path and metadata (without validation)
   */
  getByMetadata<T>(
    filePath: string,
    stats: { mtime: number; size: number }
  ): CacheEntry<T> | undefined {
    const key = this.generateKey(filePath, undefined, stats);
    return this.get<T>(key);
  }

  /**
   * Set cache entry by file path and metadata
   */
  setByMetadata<T>(
    filePath: string,
    stats: { mtime: number; size: number },
    result: T,
    options: {
      contentHash?: string;
      dependencies?: string[];
      ttlMs?: number;
    } = {}
  ): void {
    const key = this.generateKey(filePath, undefined, stats);
    this.set(key, result, {
      filePath,
      mtime: stats.mtime,
      size: stats.size,
      ...options,
    });
  }

  /**
   * Get all keys that depend on a given file
   */
  getDependents(filePath: string): string[] {
    const normalizedPath = path.normalize(filePath);
    const dependents: string[] = [];

    for (const [key, entry] of Object.entries(this.manifest.entries)) {
      if (entry.dependencies.includes(normalizedPath)) {
        dependents.push(key);
      }
    }

    return dependents;
  }

  /**
   * Invalidate all entries that depend on a file
   */
  invalidateDependents(filePath: string): string[] {
    const dependents = this.getDependents(filePath);
    for (const key of dependents) {
      this.delete(key);
    }
    return dependents;
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.manifest.entries = {};
    this.manifest.totalSize = 0;
    this.stats = { hits: 0, misses: 0, entries: 0, sizeBytes: 0 };
    this.saveManifest();
  }

  /**
   * Get cache statistics
   */
  getStats(): TierStats {
    return { ...this.stats };
  }

  /**
   * Perform cleanup of expired entries
   */
  cleanup(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of Object.entries(this.manifest.entries)) {
      if (now > entry.expiresAt) {
        this.delete(key);
        cleaned++;
      }
    }

    this.manifest.lastCleanup = now;
    this.saveManifest();
    return cleaned;
  }

  /**
   * Hash content using SHA-256
   */
  hashContent(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  private loadManifest(): CacheManifest {
    const manifestPath = path.join(this.cacheDir, MANIFEST_FILE);

    try {
      // Ensure cache directory exists
      if (!fs.existsSync(this.cacheDir)) {
        fs.mkdirSync(this.cacheDir, { recursive: true });
      }

      if (fs.existsSync(manifestPath)) {
        const data = fs.readFileSync(manifestPath, 'utf-8');
        const manifest = JSON.parse(data) as CacheManifest;

        // Version check
        if (manifest.version !== MANIFEST_VERSION) {
          return this.createEmptyManifest();
        }

        return manifest;
      }
    } catch {
      // Corrupted manifest, start fresh
    }

    return this.createEmptyManifest();
  }

  private createEmptyManifest(): CacheManifest {
    return {
      version: MANIFEST_VERSION,
      entries: {},
      totalSize: 0,
      lastCleanup: Date.now(),
    };
  }

  private saveManifest(): void {
    const manifestPath = path.join(this.cacheDir, MANIFEST_FILE);

    try {
      // Ensure cache directory exists
      if (!fs.existsSync(this.cacheDir)) {
        fs.mkdirSync(this.cacheDir, { recursive: true });
      }

      fs.writeFileSync(manifestPath, JSON.stringify(this.manifest, null, 2));
    } catch {
      // Ignore write errors (cache is non-critical)
    }
  }

  private evictOldest(): boolean {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of Object.entries(this.manifest.entries)) {
      if (entry.createdAt < oldestTime) {
        oldestTime = entry.createdAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.delete(oldestKey);
      return true;
    }

    return false;
  }

  private estimateSize(entry: CacheEntry): number {
    // Rough estimate: JSON serialization size
    return JSON.stringify(entry).length * 2;
  }
}

/**
 * Create a disk cache instance with default configuration
 */
export function createDiskCache(config: Partial<CacheConfig> & { configHash?: string } = {}): DiskCache {
  const cacheDir = config.location ?? 'node_modules/.cache/vibecheck';
  const maxSizeBytes = config.maxSizeBytes ?? 100 * 1024 * 1024; // 100MB
  const strategy = config.strategy ?? 'hybrid';

  return new DiskCache({
    cacheDir,
    maxSizeBytes,
    strategy,
    configHash: config.configHash,
  });
}

/**
 * Generate a config hash from tool version and configuration
 */
export function generateConfigHash(toolVersion: string, config: Record<string, unknown>): string {
  const content = JSON.stringify({ version: toolVersion, config });
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}
