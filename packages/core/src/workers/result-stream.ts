/**
 * Result Stream
 * 
 * EventEmitter-based streaming for real-time analysis results.
 * Supports backpressure handling and critical finding interruption.
 */

import { EventEmitter } from 'node:events';
import type {
  StreamEvent,
  ProgressEvent,
  FindingEvent,
  Finding,
  AnalysisResult,
} from './types.js';

interface ResultStreamOptions {
  /** Emit critical findings immediately */
  interruptOnCritical: boolean;
  /** Buffer size before applying backpressure */
  bufferSize: number;
  /** Interval for progress updates (ms) */
  progressIntervalMs: number;
}

const DEFAULT_OPTIONS: ResultStreamOptions = {
  interruptOnCritical: true,
  bufferSize: 1000,
  progressIntervalMs: 100,
};

/**
 * Result Stream
 * 
 * Streams analysis results in real-time with:
 * - Progress updates
 * - Critical finding interruption
 * - Backpressure handling
 */
export class ResultStream extends EventEmitter {
  private options: ResultStreamOptions;
  private buffer: StreamEvent[] = [];
  private totalFiles = 0;
  private processedFiles = 0;
  private currentFile?: string;
  private findings: Finding[] = [];
  private criticalFindings: Finding[] = [];
  private paused = false;
  private progressTimer?: ReturnType<typeof setInterval>;
  private startTime = 0;

  constructor(options: Partial<ResultStreamOptions> = {}) {
    super();
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Start streaming for a batch of files
   */
  start(totalFiles: number): void {
    this.totalFiles = totalFiles;
    this.processedFiles = 0;
    this.currentFile = undefined;
    this.findings = [];
    this.criticalFindings = [];
    this.paused = false;
    this.startTime = Date.now();

    this.emitEvent('start', { totalFiles });
    this.startProgressTimer();
  }

  /**
   * Report that a file is being processed
   */
  startFile(filePath: string): void {
    this.currentFile = filePath;
  }

  /**
   * Report results for a completed file
   */
  completeFile(result: AnalysisResult): void {
    this.processedFiles++;
    this.currentFile = undefined;

    for (const finding of result.findings) {
      this.addFinding(finding);
    }

    this.emitEvent('fileComplete', {
      filePath: result.filePath,
      findingCount: result.findings.length,
      durationMs: result.durationMs,
    });
  }

  /**
   * Add a finding to the stream
   */
  addFinding(finding: Finding): void {
    this.findings.push(finding);

    const isCritical = finding.severity === 'error';

    if (isCritical) {
      this.criticalFindings.push(finding);
    }

    const event: FindingEvent = {
      finding,
      file: finding.file,
      critical: isCritical,
    };

    // Emit critical findings immediately
    if (this.options.interruptOnCritical && isCritical) {
      this.emit('critical', event);
    }

    this.emitEvent('finding', event);

    // Check backpressure
    if (this.buffer.length >= this.options.bufferSize) {
      this.pause();
    }
  }

  /**
   * Report an error during processing
   */
  reportError(error: Error | string, filePath?: string): void {
    const message = error instanceof Error ? error.message : error;

    this.emitEvent('error', {
      message,
      filePath,
      timestamp: Date.now(),
    });
  }

  /**
   * Complete the stream
   */
  complete(): StreamSummary {
    this.stopProgressTimer();

    const summary: StreamSummary = {
      totalFiles: this.totalFiles,
      processedFiles: this.processedFiles,
      totalFindings: this.findings.length,
      criticalFindings: this.criticalFindings.length,
      durationMs: Date.now() - this.startTime,
      findings: this.findings,
    };

    this.emitEvent('complete', summary);
    return summary;
  }

  /**
   * Get current progress
   */
  getProgress(): ProgressEvent {
    return {
      totalFiles: this.totalFiles,
      processedFiles: this.processedFiles,
      currentFile: this.currentFile,
      percentage: this.totalFiles > 0 
        ? Math.round((this.processedFiles / this.totalFiles) * 100) 
        : 0,
    };
  }

  /**
   * Get all findings so far
   */
  getFindings(): Finding[] {
    return [...this.findings];
  }

  /**
   * Get critical findings
   */
  getCriticalFindings(): Finding[] {
    return [...this.criticalFindings];
  }

  /**
   * Check if there are critical findings
   */
  hasCriticalFindings(): boolean {
    return this.criticalFindings.length > 0;
  }

  /**
   * Pause the stream (backpressure)
   */
  pause(): void {
    if (!this.paused) {
      this.paused = true;
      this.emit('pause');
    }
  }

  /**
   * Resume the stream
   */
  resume(): void {
    if (this.paused) {
      this.paused = false;
      this.emit('resume');
      this.flushBuffer();
    }
  }

  /**
   * Check if stream is paused
   */
  isPaused(): boolean {
    return this.paused;
  }

  /**
   * Cancel the stream
   */
  cancel(): void {
    this.stopProgressTimer();
    this.emit('cancel');
  }

  /**
   * Pipe findings to another EventEmitter
   */
  pipe(target: EventEmitter): void {
    this.on('finding', (event: FindingEvent) => {
      target.emit('finding', event);
    });

    this.on('progress', (event: ProgressEvent) => {
      target.emit('progress', event);
    });

    this.on('complete', (summary: StreamSummary) => {
      target.emit('complete', summary);
    });
  }

  /**
   * Create an async iterator for findings
   */
  async *iterateFindings(): AsyncGenerator<Finding, void, undefined> {
    const queue: Finding[] = [];
    let done = false;
    let resolve: (() => void) | null = null;

    this.on('finding', (event: FindingEvent) => {
      queue.push(event.finding);
      if (resolve) {
        resolve();
        resolve = null;
      }
    });

    this.on('complete', () => {
      done = true;
      if (resolve) {
        resolve();
        resolve = null;
      }
    });

    while (!done || queue.length > 0) {
      if (queue.length > 0) {
        yield queue.shift()!;
      } else if (!done) {
        await new Promise<void>((r) => {
          resolve = r;
        });
      }
    }
  }

  private emitEvent(type: StreamEvent['type'], data: unknown): void {
    const event: StreamEvent = {
      type,
      timestamp: Date.now(),
      data,
    };

    if (this.paused && type !== 'critical') {
      this.buffer.push(event);
    } else {
      this.emit(type, data);
    }
  }

  private flushBuffer(): void {
    while (this.buffer.length > 0 && !this.paused) {
      const event = this.buffer.shift()!;
      this.emit(event.type, event.data);
    }
  }

  private startProgressTimer(): void {
    this.progressTimer = setInterval(() => {
      this.emit('progress', this.getProgress());
    }, this.options.progressIntervalMs);

    // Don't prevent process exit
    if (this.progressTimer.unref) {
      this.progressTimer.unref();
    }
  }

  private stopProgressTimer(): void {
    if (this.progressTimer) {
      clearInterval(this.progressTimer);
      this.progressTimer = undefined;
    }
  }
}

export interface StreamSummary {
  totalFiles: number;
  processedFiles: number;
  totalFindings: number;
  criticalFindings: number;
  durationMs: number;
  findings: Finding[];
}

/**
 * Create a result stream instance
 */
export function createResultStream(options?: Partial<ResultStreamOptions>): ResultStream {
  return new ResultStream(options);
}
