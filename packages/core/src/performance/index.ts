/**
 * Phase 4: Performance System
 *
 * "Fast is a Feature" - <100ms CLI, 10-100x faster scans
 *
 * This module provides:
 * - Incremental analysis that only scans what changed
 * - Parallel processing using worker pools
 * - Streaming results for immediate feedback
 * - Multi-level caching (memory + disk + optional shared)
 *
 * Example usage:
 *
 * ```typescript
 * import {
 *   PerformanceScanner,
 *   getPerformanceScanner,
 *   quickScan,
 *   formatMetrics,
 * } from '@vibecheck/core/performance';
 *
 * // Quick scan with all optimizations
 * const result = await quickScan(
 *   '/path/to/project',
 *   files,
 *   async (file) => scanFile(file),
 *   { onProgress: (p) => console.log(formatProgress(p)) }
 * );
 *
 * console.log(formatMetrics(result.metrics));
 * // ┌─────────────────────────────────────────┐
 * // │         PERFORMANCE METRICS             │
 * // ├─────────────────────────────────────────┤
 * // │  Duration:              245ms           │
 * // │  Files Total:           1250            │
 * // │  Files Scanned:           47            │
 * // │  Files Cached:          1203            │
 * // │  Cache Hit Rate:          96%           │
 * // │  Time Saved:           4812ms           │
 * // └─────────────────────────────────────────┘
 *
 * // Full control with PerformanceScanner
 * const scanner = await getPerformanceScanner({
 *   projectRoot: '/path/to/project',
 *   incremental: true,
 *   parallel: true,
 *   workers: 4,
 *   streaming: true,
 *   caching: true,
 * });
 *
 * // Streaming scan with progress
 * for await (const event of scanner.scanStreaming(files, scanFile)) {
 *   if (event.type === 'progress') {
 *     console.log(formatProgress(event.data));
 *   } else if (event.type === 'finding') {
 *     console.log('Found:', event.data.finding);
 *   }
 * }
 * ```
 */

// Types
export type {
  // Incremental types
  FileHash,
  DependencyNode,
  IncrementalState,
  CachedFinding,
  ChangeSet,
  IncrementalConfig,

  // Worker pool types
  WorkerTask,
  WorkerResult,
  WorkerPoolConfig,
  WorkerPoolStats,

  // Streaming types
  StreamEventType,
  StreamEvent,
  ScanStartEvent,
  ScanProgressEvent,
  FindingEvent,
  FileCompleteEvent,
  ScanErrorEvent,
  ScanCompleteEvent,
  StreamConfig,

  // Cache types
  CacheLevel,
  CacheEntry,
  CacheLevelConfig,
  MultiLevelCacheConfig,
  CacheStats,

  // Scan types
  ScanTask,
  ScanTaskOptions,
  ScanTaskResult,

  // Metrics types
  PerformanceMetrics,
} from './types.js';

// Constants
export {
  DEFAULT_INCREMENTAL_CONFIG,
  DEFAULT_WORKER_POOL_CONFIG,
  DEFAULT_STREAM_CONFIG,
  DEFAULT_MULTI_CACHE_CONFIG,
} from './types.js';

// Incremental Engine
export {
  IncrementalEngine,
  getIncrementalEngine,
  resetIncrementalEngine,
} from './incremental-engine.js';

// Worker Pool
export {
  WorkerPool,
  createScanWorkerPool,
  parallelMap,
  parallelForEach,
  chunkArray,
  processInBatches,
} from './worker-pool.js';

// Streaming
export {
  scanStream,
  parallelScanStream,
  collectStreamEvents,
  streamToFindings,
  createProgressReporter,
  formatProgress,
} from './streaming.js';

// Multi-Level Cache
export {
  MultiLevelCache,
  getMultiLevelCache,
  resetMultiLevelCache,
  createCacheKey,
  createHashKey,
} from './multi-level-cache.js';

// Performance Scanner (main orchestrator)
export {
  PerformanceScanner,
  getPerformanceScanner,
  resetPerformanceScanner,
  quickScan,
  formatMetrics,
  type PerformanceScannerConfig,
  type ScanResult,
} from './performance-scanner.js';
