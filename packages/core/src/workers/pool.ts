/**
 * Worker Pool
 * 
 * Production-grade worker pool using Piscina for parallelization.
 * Supports task queuing, cancellation, and backpressure.
 */

import { EventEmitter } from 'node:events';
import path from 'node:path';
import type {
  WorkerPoolConfig,
  WorkerTask,
  WorkerResult,
  WorkerPoolStats,
  AnalysisTask,
  AnalysisResult,
} from './types.js';
import { DEFAULT_WORKER_CONFIG, calculateWorkerCount } from './types.js';

interface PiscinaLike {
  run(task: unknown, options?: { signal?: AbortSignal }): Promise<unknown>;
  destroy(): Promise<void>;
  threads: unknown[];
  queueSize: number;
  completed: number;
}

/**
 * Worker Pool Manager
 * 
 * Manages a pool of worker threads for parallel file analysis.
 * Falls back to sequential execution if Piscina is unavailable.
 */
export class WorkerPool extends EventEmitter {
  private config: WorkerPoolConfig;
  private pool: PiscinaLike | null = null;
  private workerCount: number;
  private stats: WorkerPoolStats = {
    activeWorkers: 0,
    idleWorkers: 0,
    runningTasks: 0,
    queuedTasks: 0,
    completedTasks: 0,
    failedTasks: 0,
    avgDurationMs: 0,
    totalExecutionMs: 0,
  };
  private initialized = false;
  private taskDurations: number[] = [];

  constructor(config: Partial<WorkerPoolConfig> = {}) {
    super();
    this.config = { ...DEFAULT_WORKER_CONFIG, ...config };
    this.workerCount = calculateWorkerCount(this.config);
  }

  /**
   * Initialize the worker pool
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (!this.config.enabled) {
      this.initialized = true;
      return;
    }

    try {
      // Dynamically import Piscina
      const { default: Piscina } = await import('piscina');
      
      this.pool = new Piscina({
        filename: path.join(import.meta.url, '../analyze-worker.js').replace('file:///', ''),
        maxThreads: this.workerCount,
        minThreads: this.config.minWorkers,
        idleTimeout: this.config.idleTimeoutMs,
      }) as PiscinaLike;

      this.stats.idleWorkers = this.workerCount;
      this.initialized = true;
      this.emit('initialized', { workerCount: this.workerCount });
    } catch {
      // Piscina not available, use fallback
      this.pool = null;
      this.initialized = true;
      this.emit('fallback', { reason: 'Piscina not available' });
    }
  }

  /**
   * Run a task on the worker pool
   */
  async runTask<T, R>(task: WorkerTask<T>): Promise<WorkerResult<R>> {
    await this.initialize();

    const startTime = Date.now();
    this.stats.runningTasks++;
    this.emit('taskStart', { taskId: task.id, type: task.type });

    try {
      let result: R;

      if (this.pool) {
        // Run on worker pool
        result = await this.pool.run(task, {
          signal: task.signal,
        }) as R;
      } else {
        // Fallback: run in main thread
        result = await this.runInMainThread<T, R>(task);
      }

      const durationMs = Date.now() - startTime;
      this.recordTaskCompletion(durationMs, true);

      this.emit('taskComplete', { 
        taskId: task.id, 
        success: true, 
        durationMs 
      });

      return {
        taskId: task.id,
        success: true,
        data: result,
        durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      this.recordTaskCompletion(durationMs, false);

      const errorMessage = error instanceof Error ? error.message : String(error);
      
      this.emit('taskComplete', { 
        taskId: task.id, 
        success: false, 
        error: errorMessage,
        durationMs 
      });

      return {
        taskId: task.id,
        success: false,
        error: errorMessage,
        durationMs,
      };
    }
  }

  /**
   * Run multiple tasks in parallel
   */
  async runTasks<T, R>(tasks: WorkerTask<T>[]): Promise<WorkerResult<R>[]> {
    await this.initialize();

    this.stats.queuedTasks = tasks.length;
    this.emit('batchStart', { totalTasks: tasks.length });

    const results: WorkerResult<R>[] = [];

    // Process tasks in parallel with concurrency limit
    const concurrency = this.pool ? this.workerCount : 1;
    const chunks: WorkerTask<T>[][] = [];

    for (let i = 0; i < tasks.length; i += concurrency) {
      chunks.push(tasks.slice(i, i + concurrency));
    }

    for (const chunk of chunks) {
      const chunkResults = await Promise.all(
        chunk.map((task) => this.runTask<T, R>(task))
      );
      results.push(...chunkResults);
      this.stats.queuedTasks -= chunk.length;
    }

    this.emit('batchComplete', { 
      totalTasks: tasks.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
    });

    return results;
  }

  /**
   * Analyze files using the worker pool
   */
  async analyzeFiles(tasks: AnalysisTask[]): Promise<AnalysisResult[]> {
    const workerTasks: WorkerTask<AnalysisTask>[] = tasks.map((task, index) => ({
      id: `analysis-${index}`,
      type: 'analyze',
      filePath: task.filePath,
      payload: task,
    }));

    const results = await this.runTasks<AnalysisTask, AnalysisResult>(workerTasks);

    return results
      .filter((r) => r.success && r.data)
      .map((r) => r.data as AnalysisResult);
  }

  /**
   * Get pool statistics
   */
  getStats(): WorkerPoolStats {
    if (this.pool) {
      this.stats.activeWorkers = this.pool.threads.length;
      this.stats.queuedTasks = this.pool.queueSize;
    }

    return { ...this.stats };
  }

  /**
   * Check if pool is using workers or fallback
   */
  isUsingWorkers(): boolean {
    return this.pool !== null;
  }

  /**
   * Get worker count
   */
  getWorkerCount(): number {
    return this.workerCount;
  }

  /**
   * Destroy the worker pool
   */
  async destroy(): Promise<void> {
    if (this.pool) {
      await this.pool.destroy();
      this.pool = null;
    }
    this.initialized = false;
    this.emit('destroyed');
  }

  /**
   * Fallback execution in main thread
   */
  private async runInMainThread<T, R>(task: WorkerTask<T>): Promise<R> {
    // Import and run the worker function directly
    const { analyzeFile } = await import('./analyze-worker.js');
    return analyzeFile(task.payload as AnalysisTask) as R;
  }

  private recordTaskCompletion(durationMs: number, success: boolean): void {
    this.stats.runningTasks--;
    
    if (success) {
      this.stats.completedTasks++;
    } else {
      this.stats.failedTasks++;
    }

    this.taskDurations.push(durationMs);
    this.stats.totalExecutionMs += durationMs;

    // Keep only last 1000 durations for average calculation
    if (this.taskDurations.length > 1000) {
      this.taskDurations.shift();
    }

    this.stats.avgDurationMs = 
      this.taskDurations.reduce((a, b) => a + b, 0) / this.taskDurations.length;
  }
}

// Global worker pool instance
let globalPool: WorkerPool | null = null;

/**
 * Get or create the global worker pool
 */
export function getWorkerPool(config?: Partial<WorkerPoolConfig>): WorkerPool {
  if (!globalPool) {
    globalPool = new WorkerPool(config);
  }
  return globalPool;
}

/**
 * Create a new worker pool instance
 */
export function createWorkerPool(config?: Partial<WorkerPoolConfig>): WorkerPool {
  return new WorkerPool(config);
}

/**
 * Reset the global worker pool
 */
export async function resetWorkerPool(): Promise<void> {
  if (globalPool) {
    await globalPool.destroy();
    globalPool = null;
  }
}
