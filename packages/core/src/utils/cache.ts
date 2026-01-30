/**
 * Cache Manager
 * 
 * Provides in-memory caching with TTL, size limits, and statistics.
 */

export interface CacheEntry<T> {
  value: T;
  createdAt: number;
  expiresAt: number;
  hits: number;
  size: number;
}

export interface CacheConfig {
  maxSize: number;
  defaultTtlMs: number;
  cleanupIntervalMs: number;
  onEvict?: (key: string, reason: 'expired' | 'size' | 'manual') => void;
}

export interface CacheStats {
  size: number;
  hits: number;
  misses: number;
  hitRate: number;
  evictions: number;
  oldestEntryAge: number;
}

const DEFAULT_CONFIG: CacheConfig = {
  maxSize: 1000,
  defaultTtlMs: 5 * 60 * 1000, // 5 minutes
  cleanupIntervalMs: 60 * 1000, // 1 minute
};

/**
 * Generic cache with TTL support
 */
export class Cache<T = unknown> {
  private config: CacheConfig;
  private entries: Map<string, CacheEntry<T>> = new Map();
  private stats = { hits: 0, misses: 0, evictions: 0 };
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.startCleanup();
  }

  /**
   * Get a value from cache
   */
  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    
    if (!entry) {
      this.stats.misses++;
      return undefined;
    }

    // Check expiration
    if (Date.now() > entry.expiresAt) {
      this.delete(key, 'expired');
      this.stats.misses++;
      return undefined;
    }

    entry.hits++;
    this.stats.hits++;
    return entry.value;
  }

  /**
   * Get a value or compute it if missing
   */
  async getOrCompute(
    key: string,
    compute: () => T | Promise<T>,
    ttlMs?: number
  ): Promise<T> {
    const cached = this.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const value = await compute();
    this.set(key, value, ttlMs);
    return value;
  }

  /**
   * Set a value in cache
   */
  set(key: string, value: T, ttlMs?: number): void {
    // Enforce size limit
    if (this.entries.size >= this.config.maxSize && !this.entries.has(key)) {
      this.evictOldest();
    }

    const now = Date.now();
    const size = this.estimateSize(value);

    this.entries.set(key, {
      value,
      createdAt: now,
      expiresAt: now + (ttlMs ?? this.config.defaultTtlMs),
      hits: 0,
      size,
    });
  }

  /**
   * Check if key exists and is not expired
   */
  has(key: string): boolean {
    const entry = this.entries.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.delete(key, 'expired');
      return false;
    }
    return true;
  }

  /**
   * Delete a key from cache
   */
  delete(key: string, reason: 'expired' | 'size' | 'manual' = 'manual'): boolean {
    const existed = this.entries.has(key);
    if (existed) {
      this.entries.delete(key);
      this.stats.evictions++;
      this.config.onEvict?.(key, reason);
    }
    return existed;
  }

  /**
   * Clear all entries
   */
  clear(): void {
    const keys = Array.from(this.entries.keys());
    this.entries.clear();
    for (const key of keys) {
      this.config.onEvict?.(key, 'manual');
    }
    this.stats.evictions += keys.length;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const now = Date.now();
    let oldestAge = 0;

    for (const entry of this.entries.values()) {
      const age = now - entry.createdAt;
      if (age > oldestAge) oldestAge = age;
    }

    const totalRequests = this.stats.hits + this.stats.misses;
    return {
      size: this.entries.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: totalRequests > 0 ? this.stats.hits / totalRequests : 0,
      evictions: this.stats.evictions,
      oldestEntryAge: oldestAge,
    };
  }

  /**
   * Get all keys
   */
  keys(): string[] {
    return Array.from(this.entries.keys());
  }

  /**
   * Stop cleanup timer and release resources
   */
  dispose(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupIntervalMs);

    // Don't prevent process exit
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  private cleanup(): void {
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [key, entry] of this.entries) {
      if (now > entry.expiresAt) {
        toDelete.push(key);
      }
    }

    for (const key of toDelete) {
      this.delete(key, 'expired');
    }
  }

  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.entries) {
      // Prefer evicting expired entries first
      if (Date.now() > entry.expiresAt) {
        this.delete(key, 'expired');
        return;
      }

      // Then evict least recently created with fewest hits
      const score = entry.createdAt - entry.hits * 1000;
      if (score < oldestTime) {
        oldestTime = score;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.delete(oldestKey, 'size');
    }
  }

  private estimateSize(value: T): number {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'string') return value.length * 2;
    if (typeof value === 'number') return 8;
    if (typeof value === 'boolean') return 4;
    if (Array.isArray(value)) return value.length * 50;
    if (typeof value === 'object') return JSON.stringify(value).length * 2;
    return 100;
  }
}

/**
 * Create a memoized function with caching
 */
export function memoize<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => TResult | Promise<TResult>,
  options: {
    keyFn?: (...args: TArgs) => string;
    ttlMs?: number;
    maxSize?: number;
  } = {}
): (...args: TArgs) => Promise<TResult> {
  const cache = new Cache<TResult>({
    maxSize: options.maxSize ?? 100,
    defaultTtlMs: options.ttlMs ?? 60000,
  });

  const keyFn = options.keyFn ?? ((...args: TArgs) => JSON.stringify(args));

  return async (...args: TArgs): Promise<TResult> => {
    const key = keyFn(...args);
    return cache.getOrCompute(key, () => fn(...args));
  };
}

// Global cache instances
const globalCaches = new Map<string, Cache>();

/**
 * Get or create a named cache
 */
export function getCache<T>(name: string, config?: Partial<CacheConfig>): Cache<T> {
  let cache = globalCaches.get(name);
  if (!cache) {
    cache = new Cache<T>(config);
    globalCaches.set(name, cache);
  }
  return cache as Cache<T>;
}

/**
 * Clear all global caches
 */
export function clearAllCaches(): void {
  for (const cache of globalCaches.values()) {
    cache.clear();
  }
}
