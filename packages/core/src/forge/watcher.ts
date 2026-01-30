/**
 * File Watcher - Self-Aware Forge Engine
 *
 * Watches for structural changes in the project and triggers
 * Forge analysis when significant changes are detected.
 *
 * Triggers:
 * - Structural changes (components, routes, types, package.json)
 * - Git commits
 * - Batch file creation (10+ files in 5 minutes)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { EventEmitter } from 'node:events';
import type {
  FileChangeEvent,
  AccumulatedChanges,
  ForgeWatcherConfig,
} from './types.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_DEBOUNCE_MS = 500;
const DEFAULT_BATCH_THRESHOLD = 10;
const BATCH_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const COMMIT_SETTLE_MS = 5000; // Wait 5s after commit

const DEFAULT_WATCH_PATTERNS = [
  'src/**/*.ts',
  'src/**/*.tsx',
  'src/**/*.js',
  'src/**/*.jsx',
  'app/**/*.ts',
  'app/**/*.tsx',
  'components/**/*.tsx',
  'pages/**/*.tsx',
  'lib/**/*.ts',
  'types/**/*.ts',
  'package.json',
  'tsconfig.json',
];

const DEFAULT_IGNORE_PATTERNS = [
  'node_modules/**',
  '.git/**',
  'dist/**',
  'build/**',
  '.next/**',
  '.nuxt/**',
  '.vibecheck/**',
  'coverage/**',
  '.turbo/**',
  '.cache/**',
  '*.log',
  '*.tmp',
];

// File patterns that indicate structural changes
const STRUCTURAL_PATTERNS = [
  /components?\//i,
  /pages?\//i,
  /app\//i,
  /routes?\//i,
  /api\//i,
  /types?\//i,
  /models?\//i,
  /schemas?\//i,
];

const CONFIG_PATTERNS = [
  /package\.json$/,
  /tsconfig.*\.json$/,
  /\.eslintrc/,
  /\.prettierrc/,
  /vibecheck\.config/,
];

const DEPENDENCY_PATTERNS = [
  /package\.json$/,
  /pnpm-lock\.yaml$/,
  /package-lock\.json$/,
  /yarn\.lock$/,
];

// ============================================================================
// EVENTS
// ============================================================================

export interface ForgeWatcherEvents {
  change: (changes: AccumulatedChanges) => void;
  commit: () => void;
  batchCreate: (count: number) => void;
  error: (error: Error) => void;
  ready: () => void;
  stopped: () => void;
}

// ============================================================================
// FORGE WATCHER CLASS
// ============================================================================

export class ForgeWatcher extends EventEmitter {
  private config: ForgeWatcherConfig;
  private watcher: fs.FSWatcher | null = null;
  private pendingChanges: FileChangeEvent[] = [];
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private recentCreations: Array<{ path: string; time: number }> = [];
  private lastCommitHash: string | null = null;
  private commitWatchInterval: ReturnType<typeof setInterval> | null = null;
  private isRunning: boolean = false;

  constructor(config: Partial<ForgeWatcherConfig> & { projectPath: string }) {
    super();
    this.config = {
      projectPath: config.projectPath,
      debounceMs: config.debounceMs ?? DEFAULT_DEBOUNCE_MS,
      batchThreshold: config.batchThreshold ?? DEFAULT_BATCH_THRESHOLD,
      watchPatterns: config.watchPatterns ?? DEFAULT_WATCH_PATTERNS,
      ignorePatterns: config.ignorePatterns ?? DEFAULT_IGNORE_PATTERNS,
      watchCommits: config.watchCommits ?? true,
    };
  }

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  /**
   * Start watching for changes
   */
  start(): void {
    if (this.isRunning) return;

    try {
      // Start file system watcher
      this.startFileWatcher();

      // Start commit watcher if enabled
      if (this.config.watchCommits) {
        this.startCommitWatcher();
      }

      this.isRunning = true;
      this.emit('ready');
    } catch (error) {
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Stop watching
   */
  stop(): void {
    if (!this.isRunning) return;

    // Stop file watcher
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }

    // Stop commit watcher
    if (this.commitWatchInterval) {
      clearInterval(this.commitWatchInterval);
      this.commitWatchInterval = null;
    }

    // Clear timers
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    // Clear state
    this.pendingChanges = [];
    this.recentCreations = [];
    this.isRunning = false;

    this.emit('stopped');
  }

  /**
   * Check if watcher is running
   */
  isWatching(): boolean {
    return this.isRunning;
  }

  // ============================================================================
  // FILE WATCHING
  // ============================================================================

  /**
   * Start the file system watcher
   */
  private startFileWatcher(): void {
    // Use recursive watch on the project root
    this.watcher = fs.watch(
      this.config.projectPath,
      { recursive: true },
      (eventType, filename) => {
        if (!filename) return;

        // Convert to forward slashes for consistency
        const normalizedPath = filename.replace(/\\/g, '/');

        // Check if file should be ignored
        if (this.shouldIgnore(normalizedPath)) return;

        // Check if file matches watch patterns
        if (!this.shouldWatch(normalizedPath)) return;

        // Create change event
        const event: FileChangeEvent = {
          type: eventType === 'rename' ? 'create' : 'modify',
          path: normalizedPath,
          absolutePath: path.join(this.config.projectPath, normalizedPath),
          timestamp: Date.now(),
          extension: path.extname(normalizedPath),
        };

        // Check if file exists to determine create vs delete
        if (eventType === 'rename') {
          const exists = fs.existsSync(event.absolutePath);
          event.type = exists ? 'create' : 'delete';

          // Track creations for batch detection
          if (exists) {
            this.trackCreation(normalizedPath);
          }
        }

        this.handleChange(event);
      }
    );

    this.watcher.on('error', (error) => {
      this.emit('error', error);
    });
  }

  /**
   * Handle a file change event
   */
  private handleChange(event: FileChangeEvent): void {
    this.pendingChanges.push(event);

    // Reset debounce timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.flushChanges('debounce');
    }, this.config.debounceMs);
  }

  /**
   * Flush accumulated changes
   */
  private flushChanges(trigger: AccumulatedChanges['trigger']): void {
    if (this.pendingChanges.length === 0) return;

    const changes = [...this.pendingChanges];
    this.pendingChanges = [];

    const accumulated = this.categorizeChanges(changes, trigger);
    this.emit('change', accumulated);
  }

  /**
   * Categorize changes by type
   */
  private categorizeChanges(
    changes: FileChangeEvent[],
    trigger: AccumulatedChanges['trigger']
  ): AccumulatedChanges {
    const structural: FileChangeEvent[] = [];
    const content: FileChangeEvent[] = [];
    const config: FileChangeEvent[] = [];
    const dependency: FileChangeEvent[] = [];

    for (const change of changes) {
      const category = this.categorizeChange(change);
      switch (category) {
        case 'structural':
          structural.push(change);
          break;
        case 'config':
          config.push(change);
          break;
        case 'dependency':
          dependency.push(change);
          break;
        default:
          content.push(change);
      }
    }

    const timestamps = changes.map((c) => c.timestamp);

    return {
      changes,
      categories: { structural, content, config, dependency },
      startTime: Math.min(...timestamps),
      endTime: Math.max(...timestamps),
      trigger,
    };
  }

  /**
   * Categorize a single change
   */
  private categorizeChange(
    change: FileChangeEvent
  ): 'structural' | 'content' | 'config' | 'dependency' {
    const filePath = change.path;

    // Check dependency patterns first
    if (DEPENDENCY_PATTERNS.some((p) => p.test(filePath))) {
      return 'dependency';
    }

    // Check config patterns
    if (CONFIG_PATTERNS.some((p) => p.test(filePath))) {
      return 'config';
    }

    // Check structural patterns
    if (STRUCTURAL_PATTERNS.some((p) => p.test(filePath))) {
      return 'structural';
    }

    // Default to content change
    return 'content';
  }

  // ============================================================================
  // BATCH DETECTION
  // ============================================================================

  /**
   * Track file creation for batch detection
   */
  private trackCreation(filePath: string): void {
    const now = Date.now();

    // Add new creation
    this.recentCreations.push({ path: filePath, time: now });

    // Remove old creations outside window
    this.recentCreations = this.recentCreations.filter(
      (c) => now - c.time < BATCH_WINDOW_MS
    );

    // Check if batch threshold reached
    if (this.recentCreations.length >= this.config.batchThreshold) {
      this.emit('batchCreate', this.recentCreations.length);

      // Flush immediately with batch trigger
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = null;
      }
      this.flushChanges('batch-threshold');

      // Reset batch tracking
      this.recentCreations = [];
    }
  }

  // ============================================================================
  // COMMIT WATCHING
  // ============================================================================

  /**
   * Start watching for git commits
   */
  private startCommitWatcher(): void {
    // Get initial commit hash
    this.lastCommitHash = this.getCurrentCommitHash();

    // Poll for new commits every 2 seconds
    this.commitWatchInterval = setInterval(() => {
      const currentHash = this.getCurrentCommitHash();

      if (currentHash && currentHash !== this.lastCommitHash) {
        this.lastCommitHash = currentHash;

        // Wait for file system to settle after commit
        setTimeout(() => {
          this.emit('commit');

          // Flush any pending changes with commit trigger
          if (this.pendingChanges.length > 0) {
            if (this.debounceTimer) {
              clearTimeout(this.debounceTimer);
              this.debounceTimer = null;
            }
            this.flushChanges('commit');
          }
        }, COMMIT_SETTLE_MS);
      }
    }, 2000);
  }

  /**
   * Get current git commit hash
   */
  private getCurrentCommitHash(): string | null {
    try {
      const headPath = path.join(this.config.projectPath, '.git', 'HEAD');
      if (!fs.existsSync(headPath)) return null;

      const headContent = fs.readFileSync(headPath, 'utf-8').trim();

      // Check if HEAD is a ref or direct hash
      if (headContent.startsWith('ref: ')) {
        const refPath = path.join(
          this.config.projectPath,
          '.git',
          headContent.substring(5)
        );
        if (fs.existsSync(refPath)) {
          return fs.readFileSync(refPath, 'utf-8').trim().substring(0, 8);
        }
      }

      return headContent.substring(0, 8);
    } catch {
      return null;
    }
  }

  // ============================================================================
  // PATTERN MATCHING
  // ============================================================================

  /**
   * Check if file should be ignored
   */
  private shouldIgnore(filePath: string): boolean {
    return this.config.ignorePatterns.some((pattern) => {
      return this.matchGlobPattern(filePath, pattern);
    });
  }

  /**
   * Check if file should be watched
   */
  private shouldWatch(filePath: string): boolean {
    // If no patterns specified, watch everything not ignored
    if (this.config.watchPatterns.length === 0) return true;

    return this.config.watchPatterns.some((pattern) => {
      return this.matchGlobPattern(filePath, pattern);
    });
  }

  /**
   * Simple glob pattern matching
   */
  private matchGlobPattern(filePath: string, pattern: string): boolean {
    // Convert glob to regex
    const regexPattern = pattern
      .replace(/\*\*/g, '{{GLOBSTAR}}')
      .replace(/\*/g, '[^/]*')
      .replace(/\{\{GLOBSTAR\}\}/g, '.*')
      .replace(/\./g, '\\.')
      .replace(/\?/g, '.');

    const regex = new RegExp(`^${regexPattern}$`, 'i');
    return regex.test(filePath);
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  /**
   * Get pending change count
   */
  getPendingChangeCount(): number {
    return this.pendingChanges.length;
  }

  /**
   * Force flush pending changes
   */
  forceFlush(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.flushChanges('manual');
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ForgeWatcherConfig>): void {
    const wasRunning = this.isRunning;

    if (wasRunning) {
      this.stop();
    }

    this.config = { ...this.config, ...config };

    if (wasRunning) {
      this.start();
    }
  }
}

// ============================================================================
// CHANGE ACCUMULATOR CLASS
// ============================================================================

/**
 * Accumulates changes and provides analysis
 */
export class ChangeAccumulator {
  private changes: FileChangeEvent[] = [];
  private startTime: number = 0;

  /**
   * Add a change
   */
  add(event: FileChangeEvent): void {
    if (this.changes.length === 0) {
      this.startTime = event.timestamp;
    }
    this.changes.push(event);
  }

  /**
   * Get accumulated changes and reset
   */
  flush(trigger: AccumulatedChanges['trigger']): AccumulatedChanges | null {
    if (this.changes.length === 0) return null;

    const changes = [...this.changes];
    this.changes = [];

    const structural: FileChangeEvent[] = [];
    const content: FileChangeEvent[] = [];
    const config: FileChangeEvent[] = [];
    const dependency: FileChangeEvent[] = [];

    for (const change of changes) {
      const category = categorizeChange(change);
      switch (category) {
        case 'structural':
          structural.push(change);
          break;
        case 'config':
          config.push(change);
          break;
        case 'dependency':
          dependency.push(change);
          break;
        default:
          content.push(change);
      }
    }

    const endTime = Date.now();
    const result: AccumulatedChanges = {
      changes,
      categories: { structural, content, config, dependency },
      startTime: this.startTime,
      endTime,
      trigger,
    };

    this.startTime = 0;
    return result;
  }

  /**
   * Check if has structural changes
   */
  hasStructuralChanges(): boolean {
    return this.changes.some((c) => categorizeChange(c) === 'structural');
  }

  /**
   * Get change count
   */
  count(): number {
    return this.changes.length;
  }

  /**
   * Clear without flushing
   */
  clear(): void {
    this.changes = [];
    this.startTime = 0;
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Categorize a file change
 */
function categorizeChange(
  change: FileChangeEvent
): 'structural' | 'content' | 'config' | 'dependency' {
  const filePath = change.path;

  if (DEPENDENCY_PATTERNS.some((p) => p.test(filePath))) {
    return 'dependency';
  }

  if (CONFIG_PATTERNS.some((p) => p.test(filePath))) {
    return 'config';
  }

  if (STRUCTURAL_PATTERNS.some((p) => p.test(filePath))) {
    return 'structural';
  }

  return 'content';
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a new ForgeWatcher
 */
export function createForgeWatcher(
  projectPath: string,
  options?: Partial<Omit<ForgeWatcherConfig, 'projectPath'>>
): ForgeWatcher {
  return new ForgeWatcher({
    projectPath,
    ...options,
  });
}
