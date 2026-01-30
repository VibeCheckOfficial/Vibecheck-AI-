/**
 * Cloud Sync Layer
 * 
 * Optional cloud synchronization for team cache sharing.
 * Supports Upstash Redis and Turso SQLite.
 * Uses fire-and-forget writes with graceful fallback.
 */

import type { CacheEntry, CloudSyncConfig, TierStats } from './types.js';

interface CloudProvider {
  get<T>(key: string): Promise<CacheEntry<T> | undefined>;
  set<T>(key: string, entry: CacheEntry<T>): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  ping(): Promise<boolean>;
}

/**
 * Upstash Redis provider
 */
class UpstashProvider implements CloudProvider {
  private url: string;
  private token: string;
  private timeoutMs: number;

  constructor(config: CloudSyncConfig) {
    this.url = config.url;
    this.token = config.token ?? '';
    this.timeoutMs = config.timeoutMs;
  }

  async get<T>(key: string): Promise<CacheEntry<T> | undefined> {
    try {
      const response = await this.fetch('GET', key);
      if (response && typeof response === 'string') {
        return JSON.parse(response) as CacheEntry<T>;
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  async set<T>(key: string, entry: CacheEntry<T>): Promise<void> {
    try {
      const ttlSeconds = Math.ceil((entry.expiresAt - Date.now()) / 1000);
      if (ttlSeconds > 0) {
        await this.fetch('SET', key, JSON.stringify(entry), 'EX', ttlSeconds.toString());
      }
    } catch {
      // Fire-and-forget: ignore errors
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.fetch('DEL', key);
    } catch {
      // Fire-and-forget: ignore errors
    }
  }

  async clear(): Promise<void> {
    try {
      await this.fetch('FLUSHDB');
    } catch {
      // Fire-and-forget: ignore errors
    }
  }

  async ping(): Promise<boolean> {
    try {
      const result = await this.fetch('PING');
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  private async fetch(...args: string[]): Promise<unknown> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.url}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(args),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json() as { result?: unknown };
      return data.result;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Turso SQLite provider
 */
class TursoProvider implements CloudProvider {
  private url: string;
  private token: string;
  private timeoutMs: number;

  constructor(config: CloudSyncConfig) {
    this.url = config.url;
    this.token = config.token ?? '';
    this.timeoutMs = config.timeoutMs;
  }

  async get<T>(key: string): Promise<CacheEntry<T> | undefined> {
    try {
      const result = await this.execute(
        'SELECT value, expires_at FROM vibecheck_cache WHERE key = ?',
        [key]
      );
      
      if (result.length > 0) {
        const row = result[0] as { value: string; expires_at: number };
        if (Date.now() < row.expires_at) {
          return JSON.parse(row.value) as CacheEntry<T>;
        }
        // Expired, delete it
        await this.delete(key);
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  async set<T>(key: string, entry: CacheEntry<T>): Promise<void> {
    try {
      await this.execute(
        `INSERT OR REPLACE INTO vibecheck_cache (key, value, expires_at, created_at) 
         VALUES (?, ?, ?, ?)`,
        [key, JSON.stringify(entry), entry.expiresAt, entry.createdAt]
      );
    } catch {
      // Fire-and-forget: ignore errors
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.execute('DELETE FROM vibecheck_cache WHERE key = ?', [key]);
    } catch {
      // Fire-and-forget: ignore errors
    }
  }

  async clear(): Promise<void> {
    try {
      await this.execute('DELETE FROM vibecheck_cache', []);
    } catch {
      // Fire-and-forget: ignore errors
    }
  }

  async ping(): Promise<boolean> {
    try {
      await this.execute('SELECT 1', []);
      return true;
    } catch {
      return false;
    }
  }

  private async execute(sql: string, args: unknown[]): Promise<unknown[]> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.url}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          statements: [{ q: sql, params: args }],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json() as { results?: { rows?: unknown[] }[] };
      return data.results?.[0]?.rows ?? [];
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Cloud Sync Manager
 * 
 * Handles synchronization with cloud cache providers.
 * Uses fire-and-forget pattern to never block local operations.
 */
export class CloudSync {
  private provider: CloudProvider | null = null;
  private config: CloudSyncConfig | undefined;
  private connected = false;
  private stats: TierStats = {
    hits: 0,
    misses: 0,
    entries: 0,
    sizeBytes: 0,
  };

  constructor(config?: CloudSyncConfig) {
    this.config = config;
    if (config?.enabled && config.url) {
      this.initializeProvider(config);
    }
  }

  /**
   * Check if cloud sync is enabled and connected
   */
  isEnabled(): boolean {
    return this.config?.enabled === true && this.provider !== null;
  }

  /**
   * Check connection status
   */
  async checkConnection(): Promise<boolean> {
    if (!this.provider) return false;
    
    try {
      this.connected = await this.provider.ping();
      return this.connected;
    } catch {
      this.connected = false;
      return false;
    }
  }

  /**
   * Get an entry from cloud cache
   */
  async get<T>(key: string): Promise<CacheEntry<T> | undefined> {
    if (!this.provider || !this.connected) {
      this.stats.misses++;
      return undefined;
    }

    try {
      const entry = await this.provider.get<T>(key);
      if (entry) {
        this.stats.hits++;
        return entry;
      }
      this.stats.misses++;
      return undefined;
    } catch {
      this.stats.misses++;
      return undefined;
    }
  }

  /**
   * Set an entry in cloud cache (fire-and-forget)
   */
  set<T>(key: string, entry: CacheEntry<T>): void {
    if (!this.provider || !this.connected) return;

    // Fire-and-forget: don't await
    this.provider.set(key, entry).catch(() => {
      // Ignore errors silently
    });
  }

  /**
   * Delete an entry from cloud cache (fire-and-forget)
   */
  delete(key: string): void {
    if (!this.provider || !this.connected) return;

    // Fire-and-forget: don't await
    this.provider.delete(key).catch(() => {
      // Ignore errors silently
    });
  }

  /**
   * Clear all entries from cloud cache
   */
  async clear(): Promise<void> {
    if (!this.provider) return;

    try {
      await this.provider.clear();
      this.stats = { hits: 0, misses: 0, entries: 0, sizeBytes: 0 };
    } catch {
      // Ignore errors
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): TierStats {
    return { ...this.stats };
  }

  /**
   * Batch sync multiple entries (fire-and-forget)
   */
  batchSet<T>(entries: Map<string, CacheEntry<T>>): void {
    if (!this.provider || !this.connected) return;

    for (const [key, entry] of entries) {
      this.set(key, entry);
    }
  }

  private initializeProvider(config: CloudSyncConfig): void {
    switch (config.provider) {
      case 'upstash':
        this.provider = new UpstashProvider(config);
        break;
      case 'turso':
        this.provider = new TursoProvider(config);
        break;
      default:
        this.provider = null;
    }

    // Check connection in background
    if (this.provider) {
      this.checkConnection().catch(() => {
        this.connected = false;
      });
    }
  }
}

/**
 * Create a cloud sync instance
 */
export function createCloudSync(config?: CloudSyncConfig): CloudSync {
  return new CloudSync(config);
}
