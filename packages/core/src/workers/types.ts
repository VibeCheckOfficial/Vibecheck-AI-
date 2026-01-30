/**
 * Worker Types
 * 
 * Type definitions for the worker parallelization system.
 */

export interface WorkerPoolConfig {
  /** Enable worker pool */
  enabled: boolean;
  /** Maximum number of workers */
  maxWorkers?: number;
  /** Worker count ratio in CI environments */
  ciWorkerRatio: number;
  /** Minimum workers to use */
  minWorkers: number;
  /** Idle timeout before terminating workers (ms) */
  idleTimeoutMs: number;
  /** Task timeout (ms) */
  taskTimeoutMs: number;
}

export interface WorkerTask<T = unknown> {
  /** Task identifier */
  id: string;
  /** Task type */
  type: string;
  /** File path to analyze */
  filePath: string;
  /** Task payload */
  payload: T;
  /** Task priority (higher = more urgent) */
  priority?: number;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
}

export interface WorkerResult<T = unknown> {
  /** Task identifier */
  taskId: string;
  /** Whether task succeeded */
  success: boolean;
  /** Result data */
  data?: T;
  /** Error message if failed */
  error?: string;
  /** Execution time in milliseconds */
  durationMs: number;
  /** Worker that processed this task */
  workerId?: number;
}

export interface AnalysisTask {
  /** File path to analyze */
  filePath: string;
  /** File content */
  content: string;
  /** Rules to apply */
  rules: string[];
  /** Analysis configuration */
  config?: Record<string, unknown>;
}

export interface AnalysisResult {
  /** File path analyzed */
  filePath: string;
  /** Findings from analysis */
  findings: Finding[];
  /** Parse errors if any */
  parseErrors: ParseError[];
  /** Analysis duration in milliseconds */
  durationMs: number;
  /** Whether file was cached */
  cached: boolean;
}

export interface Finding {
  /** Rule that generated this finding */
  ruleId: string;
  /** Severity level */
  severity: 'error' | 'warning' | 'info';
  /** Human-readable message */
  message: string;
  /** File path */
  file: string;
  /** Line number (1-based) */
  line: number;
  /** Column number (1-based) */
  column?: number;
  /** End line number */
  endLine?: number;
  /** End column number */
  endColumn?: number;
  /** Line content */
  lineContent: string;
  /** Suggested fix */
  suggestion?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

export interface ParseError {
  /** Error message */
  message: string;
  /** File path */
  file: string;
  /** Line number */
  line?: number;
  /** Column number */
  column?: number;
}

export interface WorkerPoolStats {
  /** Number of active workers */
  activeWorkers: number;
  /** Number of idle workers */
  idleWorkers: number;
  /** Tasks currently running */
  runningTasks: number;
  /** Tasks waiting in queue */
  queuedTasks: number;
  /** Total tasks completed */
  completedTasks: number;
  /** Total tasks failed */
  failedTasks: number;
  /** Average task duration (ms) */
  avgDurationMs: number;
  /** Total execution time (ms) */
  totalExecutionMs: number;
}

export interface StreamEvent {
  type: 'start' | 'progress' | 'finding' | 'error' | 'complete';
  timestamp: number;
  data: unknown;
}

export interface ProgressEvent {
  /** Total files to process */
  totalFiles: number;
  /** Files processed so far */
  processedFiles: number;
  /** Current file being processed */
  currentFile?: string;
  /** Percentage complete */
  percentage: number;
}

export interface FindingEvent {
  /** The finding */
  finding: Finding;
  /** File that produced the finding */
  file: string;
  /** Whether this is a critical finding */
  critical: boolean;
}

export const DEFAULT_WORKER_CONFIG: WorkerPoolConfig = {
  enabled: true,
  ciWorkerRatio: 0.5,
  minWorkers: 1,
  idleTimeoutMs: 30000,
  taskTimeoutMs: 60000,
};

/**
 * Calculate optimal worker count based on environment
 */
export function calculateWorkerCount(config: WorkerPoolConfig): number {
  const cpuCount = typeof navigator !== 'undefined' 
    ? navigator.hardwareConcurrency || 4
    : require('node:os').cpus().length;

  const isCI = process.env.CI === 'true' || process.env.CI === '1';

  if (config.maxWorkers) {
    return Math.max(config.minWorkers, Math.min(config.maxWorkers, cpuCount - 1));
  }

  if (isCI) {
    return Math.max(config.minWorkers, Math.floor(cpuCount * config.ciWorkerRatio));
  }

  // Default: CPU cores - 1 (leave one for main thread)
  return Math.max(config.minWorkers, cpuCount - 1);
}
