/**
 * Cache Types
 * 
 * Type definitions for the three-tier caching system.
 */

export interface CacheEntry<T = unknown> {
  /** Unique cache key */
  key: string;
  /** File modification time (for metadata-based invalidation) */
  mtime: number;
  /** File size in bytes */
  size: number;
  /** SHA-256 content hash (for content-based invalidation) */
  contentHash?: string;
  /** Cached result data */
  result: T;
  /** File dependencies for cascade invalidation */
  dependencies: string[];
  /** Timestamp when entry was created */
  createdAt: number;
  /** Timestamp when entry expires */
  expiresAt: number;
}

export interface CacheConfig {
  /** Enable caching */
  enabled: boolean;
  /** Cache storage location */
  location: string;
  /** Cache key strategy */
  strategy: 'metadata' | 'content' | 'hybrid';
  /** Maximum cache size in bytes */
  maxSizeBytes: number;
  /** Default TTL in milliseconds */
  defaultTtlMs: number;
  /** Cloud sync configuration */
  cloudSync?: CloudSyncConfig;
}

export interface CloudSyncConfig {
  /** Enable cloud sync */
  enabled: boolean;
  /** Cloud provider */
  provider: 'upstash' | 'turso';
  /** Connection URL */
  url: string;
  /** Authentication token */
  token?: string;
  /** Sync timeout in milliseconds */
  timeoutMs: number;
}

export interface CacheStats {
  /** Total entries in cache */
  entries: number;
  /** Cache size in bytes */
  sizeBytes: number;
  /** Cache hits */
  hits: number;
  /** Cache misses */
  misses: number;
  /** Hit rate (0-1) */
  hitRate: number;
  /** Entries evicted due to size limits */
  evictions: number;
  /** Entries invalidated due to dependency changes */
  invalidations: number;
  /** Stats by tier */
  byTier: {
    memory: TierStats;
    disk: TierStats;
    cloud: TierStats;
  };
}

export interface TierStats {
  hits: number;
  misses: number;
  entries: number;
  sizeBytes: number;
}

export interface CacheKeyOptions {
  /** File path for cache key generation */
  filePath: string;
  /** File content (optional, for content-based keys) */
  content?: string;
  /** File stats (optional, for metadata-based keys) */
  stats?: {
    mtime: number;
    size: number;
  };
  /** Additional context for key uniqueness */
  context?: Record<string, unknown>;
}

export interface DependencyMap {
  /** Forward dependencies: file -> files it imports */
  forward: Map<string, Set<string>>;
  /** Reverse dependencies: file -> files that import it */
  reverse: Map<string, Set<string>>;
}

export interface InvalidationResult {
  /** Files that were invalidated */
  invalidated: string[];
  /** Reason for invalidation */
  reason: 'changed' | 'dependency' | 'expired' | 'manual';
}

export const DEFAULT_CACHE_CONFIG: CacheConfig = {
  enabled: true,
  location: 'node_modules/.cache/vibecheck',
  strategy: 'hybrid',
  maxSizeBytes: 100 * 1024 * 1024, // 100MB
  defaultTtlMs: 24 * 60 * 60 * 1000, // 24 hours
};
