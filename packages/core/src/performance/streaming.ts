/**
 * Streaming Results
 *
 * Shows progress immediately as files are scanned.
 * Perceived performance is instant, even on large scans.
 */

import { getLogger, type Logger } from '../utils/logger.js';
import type {
  CachedFinding,
  FileCompleteEvent,
  FindingEvent,
  ScanCompleteEvent,
  ScanErrorEvent,
  ScanProgressEvent,
  ScanStartEvent,
  StreamConfig,
  StreamEvent,
  StreamEventType,
  DEFAULT_STREAM_CONFIG,
} from './types.js';

const DEFAULT_CONFIG: StreamConfig = {
  bufferSize: 10,
  flushInterval: 100,
  includeContent: false,
  progressInterval: 250,
};

type StreamEventData =
  | ScanStartEvent
  | ScanProgressEvent
  | FindingEvent
  | FileCompleteEvent
  | ScanErrorEvent
  | ScanCompleteEvent;

/**
 * Stream buffer for batching events
 */
class StreamBuffer {
  private buffer: StreamEvent<StreamEventData>[] = [];
  private maxSize: number;
  private flushCallback: (events: StreamEvent<StreamEventData>[]) => void;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private flushInterval: number;

  constructor(
    maxSize: number,
    flushInterval: number,
    flushCallback: (events: StreamEvent<StreamEventData>[]) => void
  ) {
    this.maxSize = maxSize;
    this.flushInterval = flushInterval;
    this.flushCallback = flushCallback;
    this.startFlushTimer();
  }

  push(event: StreamEvent<StreamEventData>): void {
    this.buffer.push(event);

    if (this.buffer.length >= this.maxSize) {
      this.flush();
    }
  }

  flush(): void {
    if (this.buffer.length > 0) {
      const events = [...this.buffer];
      this.buffer = [];
      this.flushCallback(events);
    }
  }

  dispose(): void {
    this.flush();
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.flushInterval);

    if (this.flushTimer.unref) {
      this.flushTimer.unref();
    }
  }
}

/**
 * Progress tracker for scan operations
 */
class ProgressTracker {
  private startTime: number;
  private processed = 0;
  private total: number;
  private recentDurations: number[] = [];
  private maxRecentDurations = 20;

  constructor(total: number) {
    this.total = total;
    this.startTime = Date.now();
  }

  recordProgress(fileDurationMs: number): ScanProgressEvent & { currentFile: string } {
    this.processed++;

    // Track recent durations for ETA calculation
    this.recentDurations.push(fileDurationMs);
    if (this.recentDurations.length > this.maxRecentDurations) {
      this.recentDurations.shift();
    }

    const elapsedMs = Date.now() - this.startTime;
    const avgDuration =
      this.recentDurations.reduce((a, b) => a + b, 0) / this.recentDurations.length;
    const remaining = this.total - this.processed;
    const estimatedRemainingMs = Math.round(remaining * avgDuration);

    return {
      processed: this.processed,
      total: this.total,
      percentage: Math.round((this.processed / this.total) * 100),
      currentFile: '', // Will be filled by caller
      elapsedMs,
      estimatedRemainingMs,
    };
  }

  getElapsedMs(): number {
    return Date.now() - this.startTime;
  }
}

/**
 * Streaming scan results generator
 */
export async function* scanStream(
  files: string[],
  scanner: (file: string) => Promise<CachedFinding[]>,
  options: Partial<StreamConfig> = {}
): AsyncGenerator<StreamEvent<StreamEventData>> {
  const config = { ...DEFAULT_CONFIG, ...options };
  const logger = getLogger('scan-stream');

  const scanId = `scan-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const total = files.length;
  const tracker = new ProgressTracker(total);

  let totalFindings = 0;
  let fromCache = 0;
  const summary = { error: 0, warning: 0, info: 0 };

  // Emit start event
  yield createEvent('start', {
    totalFiles: total,
    scanId,
    config: { ...config, includeContent: false },
  } as ScanStartEvent);

  let lastProgressTime = 0;

  for (const file of files) {
    const fileStartTime = Date.now();

    try {
      const findings = await scanner(file);
      const fileDurationMs = Date.now() - fileStartTime;

      // Count findings by severity
      for (const finding of findings) {
        totalFindings++;
        if (finding.severity === 'error') summary.error++;
        else if (finding.severity === 'warning') summary.warning++;
        else summary.info++;

        // Emit finding event
        yield createEvent('finding', {
          finding,
          file,
        } as FindingEvent);
      }

      // Emit file complete event
      yield createEvent('file_complete', {
        file,
        findingsCount: findings.length,
        durationMs: fileDurationMs,
      } as FileCompleteEvent);

      // Emit progress event (throttled)
      const now = Date.now();
      if (now - lastProgressTime >= config.progressInterval) {
        const progress = tracker.recordProgress(fileDurationMs);
        progress.currentFile = file;

        yield createEvent('progress', progress as ScanProgressEvent);
        lastProgressTime = now;
      } else {
        // Still update tracker for ETA calculation
        tracker.recordProgress(fileDurationMs);
      }
    } catch (error) {
      yield createEvent('error', {
        file,
        error: error instanceof Error ? error.message : 'Unknown error',
        recoverable: true,
      } as ScanErrorEvent);
    }
  }

  // Emit complete event
  yield createEvent('complete', {
    totalFiles: total,
    totalFindings,
    durationMs: tracker.getElapsedMs(),
    fromCache,
    scanned: total - fromCache,
    summary,
  } as ScanCompleteEvent);
}

/**
 * Streaming scan with parallel processing
 */
export async function* parallelScanStream(
  files: string[],
  scanner: (file: string) => Promise<CachedFinding[]>,
  options: Partial<StreamConfig & { concurrency: number }> = {}
): AsyncGenerator<StreamEvent<StreamEventData>> {
  const config = { ...DEFAULT_CONFIG, concurrency: 4, ...options };
  const logger = getLogger('parallel-scan-stream');

  const scanId = `scan-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const total = files.length;
  const startTime = Date.now();

  let processed = 0;
  let totalFindings = 0;
  const summary = { error: 0, warning: 0, info: 0 };

  // Emit start event
  yield createEvent('start', {
    totalFiles: total,
    scanId,
    config: { ...config, includeContent: false },
  } as ScanStartEvent);

  // Process files in parallel with concurrency limit
  const pending: Array<Promise<{
    file: string;
    findings: CachedFinding[];
    error?: string;
    durationMs: number;
  }>> = [];

  let fileIndex = 0;

  const processNext = async (): Promise<{
    file: string;
    findings: CachedFinding[];
    error?: string;
    durationMs: number;
  } | null> => {
    if (fileIndex >= files.length) return null;

    const file = files[fileIndex++];
    const fileStartTime = Date.now();

    try {
      const findings = await scanner(file);
      return {
        file,
        findings,
        durationMs: Date.now() - fileStartTime,
      };
    } catch (error) {
      return {
        file,
        findings: [],
        error: error instanceof Error ? error.message : 'Unknown error',
        durationMs: Date.now() - fileStartTime,
      };
    }
  };

  // Fill initial batch
  while (pending.length < config.concurrency && fileIndex < files.length) {
    const promise = processNext();
    if (promise) pending.push(promise as Promise<{
      file: string;
      findings: CachedFinding[];
      error?: string;
      durationMs: number;
    }>);
  }

  // Process results as they complete
  while (pending.length > 0) {
    const result = await Promise.race(pending);

    // Remove completed from pending
    const index = pending.findIndex((p) => p === Promise.resolve(result));
    if (index >= 0) {
      pending.splice(index, 1);
    }

    // Add new task if available
    const nextPromise = processNext();
    if (nextPromise) {
      pending.push(nextPromise as Promise<{
        file: string;
        findings: CachedFinding[];
        error?: string;
        durationMs: number;
      }>);
    }

    if (!result) continue;

    processed++;

    if (result.error) {
      yield createEvent('error', {
        file: result.file,
        error: result.error,
        recoverable: true,
      } as ScanErrorEvent);
      continue;
    }

    // Emit findings
    for (const finding of result.findings) {
      totalFindings++;
      if (finding.severity === 'error') summary.error++;
      else if (finding.severity === 'warning') summary.warning++;
      else summary.info++;

      yield createEvent('finding', {
        finding,
        file: result.file,
      } as FindingEvent);
    }

    // Emit file complete
    yield createEvent('file_complete', {
      file: result.file,
      findingsCount: result.findings.length,
      durationMs: result.durationMs,
    } as FileCompleteEvent);

    // Emit progress
    const elapsedMs = Date.now() - startTime;
    const avgDuration = elapsedMs / processed;
    const remaining = total - processed;

    yield createEvent('progress', {
      processed,
      total,
      percentage: Math.round((processed / total) * 100),
      currentFile: result.file,
      elapsedMs,
      estimatedRemainingMs: Math.round(remaining * avgDuration),
    } as ScanProgressEvent);
  }

  // Emit complete
  yield createEvent('complete', {
    totalFiles: total,
    totalFindings,
    durationMs: Date.now() - startTime,
    fromCache: 0,
    scanned: total,
    summary,
  } as ScanCompleteEvent);
}

/**
 * Create a stream event
 */
function createEvent<T extends StreamEventData>(
  type: StreamEventType,
  data: T
): StreamEvent<T> {
  return {
    type,
    timestamp: Date.now(),
    data,
  };
}

/**
 * Collect all events from a stream
 */
export async function collectStreamEvents(
  stream: AsyncGenerator<StreamEvent<StreamEventData>>
): Promise<StreamEvent<StreamEventData>[]> {
  const events: StreamEvent<StreamEventData>[] = [];

  for await (const event of stream) {
    events.push(event);
  }

  return events;
}

/**
 * Transform stream events into findings
 */
export async function* streamToFindings(
  stream: AsyncGenerator<StreamEvent<StreamEventData>>
): AsyncGenerator<CachedFinding> {
  for await (const event of stream) {
    if (event.type === 'finding') {
      yield (event.data as FindingEvent).finding;
    }
  }
}

/**
 * Create a progress reporter for CLI
 */
export function createProgressReporter(
  onProgress: (progress: ScanProgressEvent) => void,
  onComplete: (complete: ScanCompleteEvent) => void
): (event: StreamEvent<StreamEventData>) => void {
  return (event) => {
    switch (event.type) {
      case 'progress':
        onProgress(event.data as ScanProgressEvent);
        break;
      case 'complete':
        onComplete(event.data as ScanCompleteEvent);
        break;
    }
  };
}

/**
 * Format progress for CLI display
 */
export function formatProgress(progress: ScanProgressEvent): string {
  const bar = createProgressBar(progress.percentage, 30);
  const eta = formatDuration(progress.estimatedRemainingMs);
  const elapsed = formatDuration(progress.elapsedMs);

  return `${bar} ${progress.percentage}% | ${progress.processed}/${progress.total} files | ${elapsed} elapsed | ETA: ${eta}`;
}

/**
 * Create ASCII progress bar
 */
function createProgressBar(percentage: number, width: number): string {
  const filled = Math.round((percentage / 100) * width);
  const empty = width - filled;
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}]`;
}

/**
 * Format duration in human-readable form
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}
