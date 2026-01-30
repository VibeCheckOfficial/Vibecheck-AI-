/**
 * Batch Detector - Self-Aware Forge Engine
 *
 * Tracks file creation count in a sliding window and
 * triggers analysis when batch threshold is reached.
 * This detects scaffold operations (e.g., `create-next-app`).
 */

import { EventEmitter } from 'node:events';
import type { FileChangeEvent } from './types.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_THRESHOLD = 10; // 10+ files = scaffold detection
const CLEANUP_INTERVAL_MS = 30 * 1000; // Clean up every 30 seconds

// ============================================================================
// BATCH DETECTOR CLASS
// ============================================================================

export interface BatchDetectorConfig {
  /** Window size in milliseconds */
  windowMs: number;
  /** Number of files to trigger batch event */
  threshold: number;
}

export interface BatchEvent {
  /** Number of files created */
  count: number;
  /** Files created */
  files: string[];
  /** Window start time */
  windowStart: number;
  /** Window end time */
  windowEnd: number;
  /** Average files per minute */
  velocity: number;
}

export class BatchDetector extends EventEmitter {
  private config: BatchDetectorConfig;
  private creations: Array<{ path: string; time: number }> = [];
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private lastBatchTime: number = 0;
  private batchCooldownMs: number = 10000; // 10s cooldown between batch events

  constructor(config?: Partial<BatchDetectorConfig>) {
    super();
    this.config = {
      windowMs: config?.windowMs ?? DEFAULT_WINDOW_MS,
      threshold: config?.threshold ?? DEFAULT_THRESHOLD,
    };
  }

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  /**
   * Start the batch detector
   */
  start(): void {
    // Start cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, CLEANUP_INTERVAL_MS);
  }

  /**
   * Stop the batch detector
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.creations = [];
  }

  // ============================================================================
  // TRACKING
  // ============================================================================

  /**
   * Track a file creation event
   */
  trackCreation(event: FileChangeEvent): void {
    if (event.type !== 'create') return;

    const now = Date.now();

    // Add to tracking
    this.creations.push({
      path: event.path,
      time: now,
    });

    // Cleanup old entries
    this.cleanup();

    // Check if threshold reached
    this.checkThreshold();
  }

  /**
   * Track multiple file creations
   */
  trackCreations(events: FileChangeEvent[]): void {
    for (const event of events) {
      if (event.type === 'create') {
        this.trackCreation(event);
      }
    }
  }

  /**
   * Remove old entries outside the window
   */
  private cleanup(): void {
    const now = Date.now();
    const cutoff = now - this.config.windowMs;
    this.creations = this.creations.filter((c) => c.time >= cutoff);
  }

  /**
   * Check if batch threshold is reached
   */
  private checkThreshold(): void {
    const now = Date.now();

    // Check cooldown
    if (now - this.lastBatchTime < this.batchCooldownMs) {
      return;
    }

    if (this.creations.length >= this.config.threshold) {
      const event = this.createBatchEvent();
      this.lastBatchTime = now;

      // Reset tracking after batch event
      this.creations = [];

      this.emit('batch', event);
    }
  }

  /**
   * Create batch event from current state
   */
  private createBatchEvent(): BatchEvent {
    const files = this.creations.map((c) => c.path);
    const times = this.creations.map((c) => c.time);
    const windowStart = Math.min(...times);
    const windowEnd = Math.max(...times);
    const durationMinutes = (windowEnd - windowStart) / 60000 || 1;
    const velocity = files.length / durationMinutes;

    return {
      count: files.length,
      files,
      windowStart,
      windowEnd,
      velocity,
    };
  }

  // ============================================================================
  // QUERIES
  // ============================================================================

  /**
   * Get current creation count in window
   */
  getCount(): number {
    this.cleanup();
    return this.creations.length;
  }

  /**
   * Get recent files
   */
  getRecentFiles(): string[] {
    this.cleanup();
    return this.creations.map((c) => c.path);
  }

  /**
   * Get velocity (files per minute)
   */
  getVelocity(): number {
    this.cleanup();

    if (this.creations.length < 2) return 0;

    const times = this.creations.map((c) => c.time);
    const windowStart = Math.min(...times);
    const windowEnd = Math.max(...times);
    const durationMinutes = (windowEnd - windowStart) / 60000;

    if (durationMinutes < 0.1) return this.creations.length; // Very fast

    return this.creations.length / durationMinutes;
  }

  /**
   * Check if currently in batch mode (high velocity)
   */
  isInBatchMode(): boolean {
    return this.getVelocity() > 5; // More than 5 files/minute
  }

  /**
   * Get progress toward threshold
   */
  getProgress(): { current: number; threshold: number; percentage: number } {
    const current = this.getCount();
    return {
      current,
      threshold: this.config.threshold,
      percentage: Math.round((current / this.config.threshold) * 100),
    };
  }

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  /**
   * Update threshold
   */
  setThreshold(threshold: number): void {
    this.config.threshold = threshold;
  }

  /**
   * Update window size
   */
  setWindowMs(windowMs: number): void {
    this.config.windowMs = windowMs;
  }

  /**
   * Reset tracking
   */
  reset(): void {
    this.creations = [];
    this.lastBatchTime = 0;
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a batch detector
 */
export function createBatchDetector(config?: Partial<BatchDetectorConfig>): BatchDetector {
  return new BatchDetector(config);
}

// ============================================================================
// SCAFFOLD DETECTION HELPERS
// ============================================================================

/**
 * Patterns that indicate scaffold/generator output
 */
const SCAFFOLD_PATTERNS = [
  // Create-next-app
  /^(app|pages|public|styles)\//,
  /^next\.config\./,
  /^tailwind\.config\./,

  // Create-react-app
  /^src\/(App|index|reportWebVitals)/,

  // Vite
  /^vite\.config\./,

  // General
  /^src\/components\//,
  /^src\/lib\//,
  /^src\/utils\//,
  /^\.eslintrc/,
  /^\.prettierrc/,
  /^tsconfig/,
  /^package\.json$/,
  /^README\.md$/,
];

/**
 * Check if a batch of files looks like scaffold output
 */
export function isScaffoldBatch(files: string[]): {
  isScaffold: boolean;
  scaffoldType: string | null;
  confidence: number;
} {
  const matchCount = files.filter((f) =>
    SCAFFOLD_PATTERNS.some((p) => p.test(f))
  ).length;

  const scaffoldRatio = matchCount / files.length;

  // Detect specific scaffold types
  let scaffoldType: string | null = null;

  if (files.some((f) => f.includes('next.config'))) {
    scaffoldType = 'create-next-app';
  } else if (files.some((f) => f.includes('vite.config'))) {
    scaffoldType = 'vite';
  } else if (files.some((f) => f.includes('reportWebVitals'))) {
    scaffoldType = 'create-react-app';
  } else if (scaffoldRatio > 0.5) {
    scaffoldType = 'generic-scaffold';
  }

  return {
    isScaffold: scaffoldRatio > 0.4,
    scaffoldType,
    confidence: scaffoldRatio,
  };
}
