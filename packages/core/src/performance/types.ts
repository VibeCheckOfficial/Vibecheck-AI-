/**
 * Phase 4: Performance System Types
 *
 * Type definitions for the high-performance scanning system.
 * Enables <100ms CLI startup and 10-100x faster scans on large codebases.
 */

// ============================================================================
// Incremental Analysis Types
// ============================================================================

export interface FileHash {
  path: string;
  hash: string;
  size: number;
  mtime: number;
}

export interface DependencyNode {
  path: string;
  imports: string[];
  exports: string[];
  reExports: string[];
}

export interface IncrementalState {
  version: string;
  lastScanTimestamp: number;
  fileHashes: Map<string, FileHash>;
  dependencyGraph: Map<string, Set<string>>;
  cachedResults: Map<string, CachedFinding[]>;
  projectRoot: string;
}

export interface CachedFinding {
  id: string;
  type: string;
  severity: string;
  message: string;
  file: string;
  line: number | null;
  column: number | null;
  hash: string; // Hash of the file when this finding was created
}

export interface ChangeSet {
  added: string[];
  modified: string[];
  deleted: string[];
  affected: string[]; // Files affected by dependency changes
}

export interface IncrementalConfig {
  /** Path to store incremental state */
  statePath: string;

  /** Enable dependency tracking */
  trackDependencies: boolean;

  /** Use git for change detection */
  useGitDiff: boolean;

  /** Maximum age of cached results (ms) */
  maxCacheAge: number;

  /** File patterns to track */
  includePatterns: string[];

  /** File patterns to ignore */
  excludePatterns: string[];
}

export const DEFAULT_INCREMENTAL_CONFIG: IncrementalConfig = {
  statePath: '.vibecheck/incremental-state.json',
  trackDependencies: true,
  useGitDiff: true,
  maxCacheAge: 24 * 60 * 60 * 1000, // 24 hours
  includePatterns: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
  excludePatterns: ['node_modules/**', 'dist/**', 'build/**', '.next/**', 'coverage/**'],
};

// ============================================================================
// Worker Pool Types
// ============================================================================

export interface WorkerTask<TInput = unknown, TOutput = unknown> {
  id: string;
  type: string;
  input: TInput;
  priority: number;
  createdAt: number;
  timeout?: number;
}

export interface WorkerResult<TOutput = unknown> {
  taskId: string;
  success: boolean;
  output?: TOutput;
  error?: string;
  durationMs: number;
}

export interface WorkerPoolConfig {
  /** Number of worker threads */
  poolSize: number;

  /** Maximum queue size */
  maxQueueSize: number;

  /** Task timeout (ms) */
  taskTimeout: number;

  /** Idle timeout before shutting down workers (ms) */
  idleTimeout: number;

  /** Enable task prioritization */
  enablePriority: boolean;
}

export const DEFAULT_WORKER_POOL_CONFIG: WorkerPoolConfig = {
  poolSize: Math.max(1, (typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 4) - 1),
  maxQueueSize: 1000,
  taskTimeout: 30000,
  idleTimeout: 60000,
  enablePriority: true,
};

export interface WorkerPoolStats {
  activeWorkers: number;
  idleWorkers: number;
  queuedTasks: number;
  completedTasks: number;
  failedTasks: number;
  avgTaskDuration: number;
  throughput: number; // tasks per second
}

// ============================================================================
// Streaming Types
// ============================================================================

export type StreamEventType = 
  | 'start'
  | 'progress'
  | 'finding'
  | 'file_complete'
  | 'error'
  | 'complete';

export interface StreamEvent<T = unknown> {
  type: StreamEventType;
  timestamp: number;
  data: T;
}

export interface ScanStartEvent {
  totalFiles: number;
  scanId: string;
  config: Record<string, unknown>;
}

export interface ScanProgressEvent {
  processed: number;
  total: number;
  percentage: number;
  currentFile: string;
  elapsedMs: number;
  estimatedRemainingMs: number;
}

export interface FindingEvent {
  finding: CachedFinding;
  file: string;
}

export interface FileCompleteEvent {
  file: string;
  findingsCount: number;
  durationMs: number;
}

export interface ScanErrorEvent {
  file?: string;
  error: string;
  recoverable: boolean;
}

export interface ScanCompleteEvent {
  totalFiles: number;
  totalFindings: number;
  durationMs: number;
  fromCache: number;
  scanned: number;
  summary: {
    error: number;
    warning: number;
    info: number;
  };
}

export interface StreamConfig {
  /** Buffer size for batching events */
  bufferSize: number;

  /** Flush interval (ms) */
  flushInterval: number;

  /** Include file content in events */
  includeContent: boolean;

  /** Progress update interval (ms) */
  progressInterval: number;
}

export const DEFAULT_STREAM_CONFIG: StreamConfig = {
  bufferSize: 10,
  flushInterval: 100,
  includeContent: false,
  progressInterval: 250,
};

// ============================================================================
// Multi-Level Cache Types
// ============================================================================

export type CacheLevel = 'memory' | 'disk' | 'shared';

export interface CacheEntry<T = unknown> {
  key: string;
  value: T;
  level: CacheLevel;
  createdAt: number;
  expiresAt: number;
  size: number;
  hits: number;
  hash?: string;
}

export interface CacheLevelConfig {
  enabled: boolean;
  maxSize: number;
  ttlMs: number;
}

export interface MultiLevelCacheConfig {
  /** L1: Memory cache (fastest) */
  memory: CacheLevelConfig;

  /** L2: Disk cache */
  disk: CacheLevelConfig & {
    path: string;
    compression: boolean;
  };

  /** L3: Shared cache (optional, for team) */
  shared?: CacheLevelConfig & {
    type: 'redis' | 'memcached' | 'http';
    connectionString: string;
  };

  /** Promote entries to higher cache levels on access */
  promoteOnAccess: boolean;

  /** Write-through to lower levels */
  writeThrough: boolean;
}

export const DEFAULT_MULTI_CACHE_CONFIG: MultiLevelCacheConfig = {
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

export interface CacheStats {
  memory: {
    size: number;
    entries: number;
    hits: number;
    misses: number;
    hitRate: number;
  };
  disk: {
    size: number;
    entries: number;
    hits: number;
    misses: number;
    hitRate: number;
  };
  shared?: {
    size: number;
    entries: number;
    hits: number;
    misses: number;
    hitRate: number;
    latencyMs: number;
  };
  totalHitRate: number;
}

// ============================================================================
// Scan Task Types
// ============================================================================

export interface ScanTask {
  id: string;
  files: string[];
  options: ScanTaskOptions;
  priority: number;
}

export interface ScanTaskOptions {
  projectRoot: string;
  truthpackPath: string;
  incremental: boolean;
  parallel: boolean;
  stream: boolean;
  maxWorkers?: number;
}

export interface ScanTaskResult {
  taskId: string;
  findings: CachedFinding[];
  stats: {
    filesScanned: number;
    filesFromCache: number;
    durationMs: number;
    peakMemoryMb: number;
  };
}

// ============================================================================
// Performance Metrics Types
// ============================================================================

export interface PerformanceMetrics {
  scanId: string;
  startTime: number;
  endTime: number;
  durationMs: number;

  files: {
    total: number;
    scanned: number;
    fromCache: number;
    skipped: number;
  };

  cache: {
    hits: number;
    misses: number;
    hitRate: number;
    savedMs: number;
  };

  workers: {
    used: number;
    avgTaskMs: number;
    throughput: number;
  };

  memory: {
    peakMb: number;
    avgMb: number;
  };

  breakdown: {
    parseMs: number;
    analyzeMs: number;
    verifyMs: number;
    reportMs: number;
  };
}
