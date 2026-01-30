/**
 * Concurrency Limiter for Reality Mode
 * 
 * Controls the number of concurrent browser pages, routes,
 * and requests to prevent resource exhaustion.
 */

// ============================================================================
// Types
// ============================================================================

export interface ConcurrencyConfig {
  /** Maximum concurrent browser pages */
  maxPages: number;
  /** Maximum routes to verify per run */
  maxRoutes: number;
  /** Maximum concurrent network requests */
  maxRequests: number;
  /** Maximum response body size in bytes */
  maxResponseSize: number;
  /** Maximum total artifact size in bytes */
  maxTotalArtifactSize: number;
}

export interface ConcurrencyState {
  /** Current number of active pages */
  activePages: number;
  /** Current number of routes verified */
  routesVerified: number;
  /** Current number of pending requests */
  pendingRequests: number;
  /** Total artifact size accumulated */
  totalArtifactSize: number;
}

export interface AcquireResult {
  acquired: boolean;
  reason?: string;
  waitTime?: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_CONCURRENCY: ConcurrencyConfig = {
  maxPages: 2,
  maxRoutes: 50,
  maxRequests: 10,
  maxResponseSize: 5 * 1024 * 1024, // 5MB
  maxTotalArtifactSize: 500 * 1024 * 1024, // 500MB
};

export const MAX_CONCURRENCY: ConcurrencyConfig = {
  maxPages: 4,
  maxRoutes: 200,
  maxRequests: 20,
  maxResponseSize: 10 * 1024 * 1024, // 10MB
  maxTotalArtifactSize: 1024 * 1024 * 1024, // 1GB
};

// ============================================================================
// Semaphore for Generic Concurrency Control
// ============================================================================

export class Semaphore {
  private permits: number;
  private waiting: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  /**
   * Acquire a permit (blocks if none available)
   */
  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }

    return new Promise<void>(resolve => {
      this.waiting.push(resolve);
    });
  }

  /**
   * Try to acquire a permit without blocking
   */
  tryAcquire(): boolean {
    if (this.permits > 0) {
      this.permits--;
      return true;
    }
    return false;
  }

  /**
   * Release a permit
   */
  release(): void {
    const next = this.waiting.shift();
    if (next) {
      next();
    } else {
      this.permits++;
    }
  }

  /**
   * Get current available permits
   */
  available(): number {
    return this.permits;
  }

  /**
   * Get number of waiting acquires
   */
  waitingCount(): number {
    return this.waiting.length;
  }
}

// ============================================================================
// Concurrency Limiter Class
// ============================================================================

export class ConcurrencyLimiter {
  private config: ConcurrencyConfig;
  private pageSemaphore: Semaphore;
  private requestSemaphore: Semaphore;
  private routesVerified: number = 0;
  private totalArtifactSize: number = 0;

  constructor(config: Partial<ConcurrencyConfig> = {}) {
    // Apply defaults and clamp to max values
    this.config = {
      maxPages: Math.min(config.maxPages ?? DEFAULT_CONCURRENCY.maxPages, MAX_CONCURRENCY.maxPages),
      maxRoutes: Math.min(config.maxRoutes ?? DEFAULT_CONCURRENCY.maxRoutes, MAX_CONCURRENCY.maxRoutes),
      maxRequests: Math.min(config.maxRequests ?? DEFAULT_CONCURRENCY.maxRequests, MAX_CONCURRENCY.maxRequests),
      maxResponseSize: Math.min(config.maxResponseSize ?? DEFAULT_CONCURRENCY.maxResponseSize, MAX_CONCURRENCY.maxResponseSize),
      maxTotalArtifactSize: Math.min(config.maxTotalArtifactSize ?? DEFAULT_CONCURRENCY.maxTotalArtifactSize, MAX_CONCURRENCY.maxTotalArtifactSize),
    };

    this.pageSemaphore = new Semaphore(this.config.maxPages);
    this.requestSemaphore = new Semaphore(this.config.maxRequests);
  }

  /**
   * Acquire a page slot
   */
  async acquirePage(): Promise<AcquireResult> {
    if (this.pageSemaphore.available() === 0) {
      // Wait for a slot
      await this.pageSemaphore.acquire();
      return { acquired: true, waitTime: 0 }; // Simplified - actual wait time not tracked
    }

    const acquired = this.pageSemaphore.tryAcquire();
    return { acquired };
  }

  /**
   * Release a page slot
   */
  releasePage(): void {
    this.pageSemaphore.release();
  }

  /**
   * Check if we can verify another route
   */
  canVerifyRoute(): AcquireResult {
    if (this.routesVerified >= this.config.maxRoutes) {
      return {
        acquired: false,
        reason: `Route limit reached (${this.config.maxRoutes})`,
      };
    }
    return { acquired: true };
  }

  /**
   * Mark a route as verified
   */
  markRouteVerified(): void {
    this.routesVerified++;
  }

  /**
   * Acquire a request slot
   */
  async acquireRequest(): Promise<AcquireResult> {
    const acquired = this.requestSemaphore.tryAcquire();
    if (!acquired) {
      await this.requestSemaphore.acquire();
    }
    return { acquired: true };
  }

  /**
   * Release a request slot
   */
  releaseRequest(): void {
    this.requestSemaphore.release();
  }

  /**
   * Check if response size is within limits
   */
  isResponseSizeAllowed(sizeBytes: number): boolean {
    return sizeBytes <= this.config.maxResponseSize;
  }

  /**
   * Add artifact size and check if within limits
   */
  addArtifactSize(sizeBytes: number): boolean {
    if (this.totalArtifactSize + sizeBytes > this.config.maxTotalArtifactSize) {
      return false;
    }
    this.totalArtifactSize += sizeBytes;
    return true;
  }

  /**
   * Get current state
   */
  getState(): ConcurrencyState {
    return {
      activePages: this.config.maxPages - this.pageSemaphore.available(),
      routesVerified: this.routesVerified,
      pendingRequests: this.config.maxRequests - this.requestSemaphore.available(),
      totalArtifactSize: this.totalArtifactSize,
    };
  }

  /**
   * Get configuration
   */
  getConfig(): Readonly<ConcurrencyConfig> {
    return { ...this.config };
  }

  /**
   * Check if we should stop due to limits
   */
  shouldStop(): { stop: boolean; reason?: string } {
    if (this.routesVerified >= this.config.maxRoutes) {
      return { stop: true, reason: `Route limit reached (${this.config.maxRoutes})` };
    }
    if (this.totalArtifactSize >= this.config.maxTotalArtifactSize) {
      return { stop: true, reason: `Artifact size limit reached` };
    }
    return { stop: false };
  }

  /**
   * Reset counters (for new run)
   */
  reset(): void {
    this.routesVerified = 0;
    this.totalArtifactSize = 0;
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Create a concurrency limiter with default configuration
 */
export function createConcurrencyLimiter(
  config: Partial<ConcurrencyConfig> = {}
): ConcurrencyLimiter {
  return new ConcurrencyLimiter(config);
}

/**
 * Run operations with controlled concurrency
 */
export async function runWithConcurrency<T, R>(
  items: T[],
  operation: (item: T, index: number) => Promise<R>,
  maxConcurrent: number
): Promise<R[]> {
  const semaphore = new Semaphore(maxConcurrent);
  const results: R[] = [];

  const promises = items.map(async (item, index) => {
    await semaphore.acquire();
    try {
      const result = await operation(item, index);
      results[index] = result;
    } finally {
      semaphore.release();
    }
  });

  await Promise.all(promises);
  return results;
}

/**
 * Format bytes for display
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${units[i]}`;
}
