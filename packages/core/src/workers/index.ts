/**
 * Worker System
 * 
 * Parallel file analysis using worker threads.
 */

export * from './types.js';
export { WorkerPool, getWorkerPool, createWorkerPool, resetWorkerPool } from './pool.js';
export { analyzeFile } from './analyze-worker.js';
export { ResultStream, createResultStream, type StreamSummary } from './result-stream.js';

import { WorkerPool, createWorkerPool } from './pool.js';
import { ResultStream, createResultStream } from './result-stream.js';
import { GitChangeDetector, createChangeDetector } from '../git/change-detector.js';
import type {
  WorkerPoolConfig,
  AnalysisTask,
  AnalysisResult,
  Finding,
} from './types.js';

interface ParallelAnalyzerOptions {
  /** Worker pool configuration */
  workerConfig?: Partial<WorkerPoolConfig>;
  /** Working directory */
  cwd?: string;
  /** Enable incremental analysis */
  incremental?: boolean;
  /** Base branch for incremental comparison */
  baseBranch?: string;
}

/**
 * Parallel Analyzer
 * 
 * High-level interface for parallel file analysis with:
 * - Worker pool management
 * - Git-based incremental analysis
 * - Real-time result streaming
 */
export class ParallelAnalyzer {
  private pool: WorkerPool;
  private changeDetector: GitChangeDetector;
  private stream: ResultStream;
  private options: ParallelAnalyzerOptions;

  constructor(options: ParallelAnalyzerOptions = {}) {
    this.options = options;
    this.pool = createWorkerPool(options.workerConfig);
    this.changeDetector = createChangeDetector({ cwd: options.cwd });
    this.stream = createResultStream();
  }

  /**
   * Analyze files with optional incremental detection
   */
  async analyze(
    files: string[],
    rules: string[],
    options?: {
      incremental?: boolean;
      onProgress?: (progress: { processed: number; total: number }) => void;
      onFinding?: (finding: Finding) => void;
      signal?: AbortSignal;
    }
  ): Promise<AnalysisResult[]> {
    // Determine files to analyze
    let filesToAnalyze = files;

    if (options?.incremental ?? this.options.incremental) {
      const changes = this.changeDetector.detectChanges();
      if (changes.incremental && changes.files.length > 0) {
        // Filter to only changed files that are in the original list
        const changedPaths = new Set(changes.files.map((f) => f.path));
        filesToAnalyze = files.filter((f) => changedPaths.has(f));
      }
    }

    if (filesToAnalyze.length === 0) {
      return [];
    }

    // Set up streaming
    this.stream.start(filesToAnalyze.length);

    if (options?.onProgress) {
      this.stream.on('progress', (progress) => {
        options.onProgress!({
          processed: progress.processedFiles,
          total: progress.totalFiles,
        });
      });
    }

    if (options?.onFinding) {
      this.stream.on('finding', (event) => {
        options.onFinding!(event.finding);
      });
    }

    // Create analysis tasks
    const tasks: AnalysisTask[] = await Promise.all(
      filesToAnalyze.map(async (filePath) => {
        const content = await this.readFile(filePath);
        return {
          filePath,
          content,
          rules,
        };
      })
    );

    // Run analysis
    await this.pool.initialize();
    const results = await this.pool.analyzeFiles(tasks);

    // Complete streaming
    const summary = this.stream.complete();

    return results;
  }

  /**
   * Analyze only staged files (for pre-commit hooks)
   */
  async analyzeStaged(rules: string[]): Promise<AnalysisResult[]> {
    const stagedFiles = this.changeDetector.getStagedFiles();
    if (stagedFiles.length === 0) {
      return [];
    }

    const filePaths = stagedFiles.map((f) => f.path);
    return this.analyze(filePaths, rules, { incremental: false });
  }

  /**
   * Analyze files changed in current branch (for CI)
   */
  async analyzeBranchChanges(rules: string[], baseBranch?: string): Promise<AnalysisResult[]> {
    const changes = this.changeDetector.getBranchChanges(baseBranch);
    if (changes.length === 0) {
      return [];
    }

    const filePaths = changes.map((f) => f.path);
    return this.analyze(filePaths, rules, { incremental: false });
  }

  /**
   * Get the result stream for real-time monitoring
   */
  getStream(): ResultStream {
    return this.stream;
  }

  /**
   * Get worker pool statistics
   */
  getStats(): {
    pool: ReturnType<WorkerPool['getStats']>;
    stream: ReturnType<ResultStream['getProgress']>;
  } {
    return {
      pool: this.pool.getStats(),
      stream: this.stream.getProgress(),
    };
  }

  /**
   * Check if using parallel workers
   */
  isParallel(): boolean {
    return this.pool.isUsingWorkers();
  }

  /**
   * Destroy the analyzer and release resources
   */
  async destroy(): Promise<void> {
    await this.pool.destroy();
  }

  private async readFile(filePath: string): Promise<string> {
    const fs = await import('node:fs/promises');
    return fs.readFile(filePath, 'utf-8');
  }
}

/**
 * Create a parallel analyzer instance
 */
export function createParallelAnalyzer(options?: ParallelAnalyzerOptions): ParallelAnalyzer {
  return new ParallelAnalyzer(options);
}
