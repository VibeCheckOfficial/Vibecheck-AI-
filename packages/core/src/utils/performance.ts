/**
 * Performance Monitoring Utilities
 * 
 * Provides performance tracking, metrics collection, and optimization helpers.
 */

export interface PerformanceMetric {
  name: string;
  count: number;
  totalMs: number;
  minMs: number;
  maxMs: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
}

export interface TimingResult<T> {
  result: T;
  durationMs: number;
}

/**
 * Performance tracker for collecting metrics
 */
export class PerformanceTracker {
  private metrics: Map<string, number[]> = new Map();
  private maxSamples: number;

  constructor(maxSamples = 1000) {
    this.maxSamples = maxSamples;
  }

  /**
   * Record a timing
   */
  record(name: string, durationMs: number): void {
    let samples = this.metrics.get(name);
    if (!samples) {
      samples = [];
      this.metrics.set(name, samples);
    }

    samples.push(durationMs);

    // Trim old samples
    if (samples.length > this.maxSamples) {
      samples.shift();
    }
  }

  /**
   * Time an operation
   */
  async time<T>(name: string, fn: () => Promise<T>): Promise<TimingResult<T>> {
    const start = performance.now();
    try {
      const result = await fn();
      const durationMs = performance.now() - start;
      this.record(name, durationMs);
      return { result, durationMs };
    } catch (error) {
      const durationMs = performance.now() - start;
      this.record(`${name}.error`, durationMs);
      throw error;
    }
  }

  /**
   * Time a sync operation
   */
  timeSync<T>(name: string, fn: () => T): TimingResult<T> {
    const start = performance.now();
    try {
      const result = fn();
      const durationMs = performance.now() - start;
      this.record(name, durationMs);
      return { result, durationMs };
    } catch (error) {
      const durationMs = performance.now() - start;
      this.record(`${name}.error`, durationMs);
      throw error;
    }
  }

  /**
   * Get metric for a specific operation
   */
  getMetric(name: string): PerformanceMetric | null {
    const samples = this.metrics.get(name);
    if (!samples || samples.length === 0) return null;

    const sorted = [...samples].sort((a, b) => a - b);
    const count = sorted.length;
    const total = sorted.reduce((a, b) => a + b, 0);

    return {
      name,
      count,
      totalMs: total,
      minMs: sorted[0],
      maxMs: sorted[count - 1],
      avgMs: total / count,
      p50Ms: sorted[Math.floor(count * 0.5)],
      p95Ms: sorted[Math.floor(count * 0.95)],
      p99Ms: sorted[Math.floor(count * 0.99)],
    };
  }

  /**
   * Get all metrics
   */
  getAllMetrics(): PerformanceMetric[] {
    const metrics: PerformanceMetric[] = [];
    for (const name of this.metrics.keys()) {
      const metric = this.getMetric(name);
      if (metric) metrics.push(metric);
    }
    return metrics.sort((a, b) => b.totalMs - a.totalMs);
  }

  /**
   * Get metrics summary
   */
  getSummary(): {
    totalOperations: number;
    totalTimeMs: number;
    slowestOperation: string | null;
    fastestOperation: string | null;
  } {
    const metrics = this.getAllMetrics();
    
    return {
      totalOperations: metrics.reduce((sum, m) => sum + m.count, 0),
      totalTimeMs: metrics.reduce((sum, m) => sum + m.totalMs, 0),
      slowestOperation: metrics.length > 0 ? metrics[0].name : null,
      fastestOperation: metrics.length > 0 ? metrics[metrics.length - 1].name : null,
    };
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics.clear();
  }

  /**
   * Export metrics as JSON
   */
  export(): Record<string, PerformanceMetric> {
    const result: Record<string, PerformanceMetric> = {};
    for (const metric of this.getAllMetrics()) {
      result[metric.name] = metric;
    }
    return result;
  }
}

/**
 * Batch processor for efficient bulk operations
 */
export class BatchProcessor<TInput, TOutput> {
  private batchSize: number;
  private concurrency: number;
  private processor: (items: TInput[]) => Promise<TOutput[]>;

  constructor(options: {
    batchSize: number;
    concurrency: number;
    processor: (items: TInput[]) => Promise<TOutput[]>;
  }) {
    this.batchSize = options.batchSize;
    this.concurrency = options.concurrency;
    this.processor = options.processor;
  }

  /**
   * Process items in batches
   */
  async process(items: TInput[]): Promise<TOutput[]> {
    if (items.length === 0) return [];

    // Split into batches
    const batches: TInput[][] = [];
    for (let i = 0; i < items.length; i += this.batchSize) {
      batches.push(items.slice(i, i + this.batchSize));
    }

    // Process batches with concurrency limit
    const results: TOutput[] = [];
    
    for (let i = 0; i < batches.length; i += this.concurrency) {
      const batchGroup = batches.slice(i, i + this.concurrency);
      const batchResults = await Promise.all(
        batchGroup.map(batch => this.processor(batch))
      );
      results.push(...batchResults.flat());
    }

    return results;
  }
}

/**
 * Resource pool for reusable resources
 */
export class ResourcePool<T> {
  private available: T[] = [];
  private inUse = new Set<T>();
  private factory: () => T | Promise<T>;
  private maxSize: number;
  private validator?: (resource: T) => boolean;

  constructor(options: {
    factory: () => T | Promise<T>;
    maxSize: number;
    validator?: (resource: T) => boolean;
    initialSize?: number;
  }) {
    this.factory = options.factory;
    this.maxSize = options.maxSize;
    this.validator = options.validator;
  }

  /**
   * Acquire a resource from the pool
   */
  async acquire(): Promise<T> {
    // Try to get an available resource
    while (this.available.length > 0) {
      const resource = this.available.pop()!;
      
      // Validate if validator is provided
      if (this.validator && !this.validator(resource)) {
        continue; // Skip invalid resource
      }

      this.inUse.add(resource);
      return resource;
    }

    // Create new resource if under limit
    if (this.inUse.size < this.maxSize) {
      const resource = await this.factory();
      this.inUse.add(resource);
      return resource;
    }

    // Wait for a resource to become available
    return new Promise((resolve) => {
      const checkInterval = setInterval(async () => {
        if (this.available.length > 0) {
          clearInterval(checkInterval);
          resolve(await this.acquire());
        }
      }, 10);
    });
  }

  /**
   * Release a resource back to the pool
   */
  release(resource: T): void {
    if (this.inUse.has(resource)) {
      this.inUse.delete(resource);
      this.available.push(resource);
    }
  }

  /**
   * Execute with a pooled resource
   */
  async withResource<R>(fn: (resource: T) => Promise<R>): Promise<R> {
    const resource = await this.acquire();
    try {
      return await fn(resource);
    } finally {
      this.release(resource);
    }
  }

  /**
   * Get pool statistics
   */
  getStats(): { available: number; inUse: number; total: number } {
    return {
      available: this.available.length,
      inUse: this.inUse.size,
      total: this.available.length + this.inUse.size,
    };
  }

  /**
   * Clear the pool
   */
  clear(): void {
    this.available = [];
    this.inUse.clear();
  }
}

/**
 * Run operations in parallel with a concurrency limit
 * 
 * Optimized implementation that efficiently tracks executing promises
 * without O(n²) promise checks.
 */
export async function parallelLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  if (limit <= 0) throw new Error('Concurrency limit must be positive');

  const results: R[] = new Array(items.length);
  const executing = new Set<Promise<void>>();
  let nextIndex = 0;

  // Helper to start next task
  const startNext = async (): Promise<void> => {
    if (nextIndex >= items.length) return;

    const index = nextIndex++;
    const promise = fn(items[index], index)
      .then(result => {
        results[index] = result;
      })
      .catch(error => {
        // Store error in results array
        throw error;
      })
      .finally(() => {
        executing.delete(promise);
        // Start next task if available
        if (nextIndex < items.length) {
          startNext();
        }
      });

    executing.add(promise);
  };

  // Start initial batch
  const initialBatch = Math.min(limit, items.length);
  for (let i = 0; i < initialBatch; i++) {
    startNext();
  }

  // Wait for all to complete
  while (executing.size > 0) {
    await Promise.race(executing);
  }

  return results;
}

/**
 * Measure memory usage
 */
export function getMemoryUsage(): {
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
} {
  if (typeof process !== 'undefined' && process.memoryUsage) {
    const usage = process.memoryUsage();
    return {
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      external: usage.external,
      rss: usage.rss,
    };
  }
  return { heapUsed: 0, heapTotal: 0, external: 0, rss: 0 };
}

// Global performance tracker
let globalTracker: PerformanceTracker | null = null;

/**
 * Get the global performance tracker
 */
export function getPerformanceTracker(): PerformanceTracker {
  if (!globalTracker) {
    globalTracker = new PerformanceTracker();
  }
  return globalTracker;
}
