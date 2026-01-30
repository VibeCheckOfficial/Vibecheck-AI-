/**
 * Timeout Manager for Reality Mode
 * 
 * Manages timeouts for actions, pages, and the entire run
 * to prevent hangs and resource exhaustion.
 */

// ============================================================================
// Types
// ============================================================================

export interface TimeoutConfig {
  /** Timeout per browser action (click, type, etc.) in ms */
  perAction: number;
  /** Timeout per page load in ms */
  perPage: number;
  /** Global timeout for entire run in ms */
  globalRun: number;
  /** Timeout for network requests in ms */
  networkRequest: number;
}

export interface TimeoutState {
  /** When the run started */
  runStartedAt: number;
  /** Remaining time for the run */
  remainingMs: number;
  /** Whether global timeout has been reached */
  globalTimeoutReached: boolean;
}

export type TimeoutCallback = () => void;

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_TIMEOUTS: TimeoutConfig = {
  perAction: 10_000,      // 10 seconds
  perPage: 30_000,        // 30 seconds
  globalRun: 300_000,     // 5 minutes
  networkRequest: 15_000, // 15 seconds
};

export const MAX_TIMEOUTS: TimeoutConfig = {
  perAction: 60_000,       // 1 minute max
  perPage: 120_000,        // 2 minutes max
  globalRun: 600_000,      // 10 minutes max
  networkRequest: 60_000,  // 1 minute max
};

// ============================================================================
// Timeout Manager Class
// ============================================================================

export class TimeoutManager {
  private config: TimeoutConfig;
  private runStartedAt: number = 0;
  private globalTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private onGlobalTimeout: TimeoutCallback | null = null;
  private aborted: boolean = false;

  constructor(config: Partial<TimeoutConfig> = {}) {
    // Apply defaults and clamp to max values
    this.config = {
      perAction: Math.min(config.perAction ?? DEFAULT_TIMEOUTS.perAction, MAX_TIMEOUTS.perAction),
      perPage: Math.min(config.perPage ?? DEFAULT_TIMEOUTS.perPage, MAX_TIMEOUTS.perPage),
      globalRun: Math.min(config.globalRun ?? DEFAULT_TIMEOUTS.globalRun, MAX_TIMEOUTS.globalRun),
      networkRequest: Math.min(config.networkRequest ?? DEFAULT_TIMEOUTS.networkRequest, MAX_TIMEOUTS.networkRequest),
    };
  }

  /**
   * Start the global run timeout
   */
  startRun(onTimeout?: TimeoutCallback): void {
    this.runStartedAt = Date.now();
    this.aborted = false;

    if (onTimeout) {
      this.onGlobalTimeout = onTimeout;
      this.globalTimeoutId = setTimeout(() => {
        this.aborted = true;
        onTimeout();
      }, this.config.globalRun);
    }
  }

  /**
   * Stop the global timeout (cleanup)
   */
  stopRun(): void {
    if (this.globalTimeoutId) {
      clearTimeout(this.globalTimeoutId);
      this.globalTimeoutId = null;
    }
    this.onGlobalTimeout = null;
  }

  /**
   * Get current timeout state
   */
  getState(): TimeoutState {
    const elapsed = Date.now() - this.runStartedAt;
    const remaining = Math.max(0, this.config.globalRun - elapsed);

    return {
      runStartedAt: this.runStartedAt,
      remainingMs: remaining,
      globalTimeoutReached: this.aborted || remaining === 0,
    };
  }

  /**
   * Check if we should abort due to timeout
   */
  shouldAbort(): boolean {
    if (this.aborted) {
      return true;
    }

    const state = this.getState();
    return state.globalTimeoutReached;
  }

  /**
   * Get timeout for an action, adjusted for remaining time
   */
  getActionTimeout(): number {
    const state = this.getState();
    return Math.min(this.config.perAction, state.remainingMs);
  }

  /**
   * Get timeout for a page, adjusted for remaining time
   */
  getPageTimeout(): number {
    const state = this.getState();
    return Math.min(this.config.perPage, state.remainingMs);
  }

  /**
   * Get timeout for network requests
   */
  getNetworkTimeout(): number {
    const state = this.getState();
    return Math.min(this.config.networkRequest, state.remainingMs);
  }

  /**
   * Get the configuration
   */
  getConfig(): Readonly<TimeoutConfig> {
    return { ...this.config };
  }

  /**
   * Wrap an async operation with timeout
   */
  async withTimeout<T>(
    operation: () => Promise<T>,
    timeoutMs: number,
    operationName: string = 'operation'
  ): Promise<T> {
    if (this.shouldAbort()) {
      throw new TimeoutError(`Global timeout reached before ${operationName}`);
    }

    const effectiveTimeout = Math.min(timeoutMs, this.getState().remainingMs);

    return Promise.race([
      operation(),
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new TimeoutError(`${operationName} timed out after ${effectiveTimeout}ms`));
        }, effectiveTimeout);
      }),
    ]);
  }

  /**
   * Wrap an action with action timeout
   */
  async withActionTimeout<T>(
    operation: () => Promise<T>,
    actionName: string = 'action'
  ): Promise<T> {
    return this.withTimeout(operation, this.getActionTimeout(), actionName);
  }

  /**
   * Wrap a page operation with page timeout
   */
  async withPageTimeout<T>(
    operation: () => Promise<T>,
    pageName: string = 'page'
  ): Promise<T> {
    return this.withTimeout(operation, this.getPageTimeout(), pageName);
  }
}

// ============================================================================
// Timeout Error
// ============================================================================

export class TimeoutError extends Error {
  public readonly isTimeout = true;

  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
    Object.setPrototypeOf(this, TimeoutError.prototype);
  }
}

/**
 * Type guard for TimeoutError
 */
export function isTimeoutError(error: unknown): error is TimeoutError {
  return error instanceof Error && 'isTimeout' in error && error.isTimeout === true;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Create a timeout manager with default configuration
 */
export function createTimeoutManager(
  config: Partial<TimeoutConfig> = {}
): TimeoutManager {
  return new TimeoutManager(config);
}

/**
 * Run an operation with a simple timeout
 */
export async function withTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
  operationName: string = 'operation'
): Promise<T> {
  return Promise.race([
    operation(),
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new TimeoutError(`${operationName} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    }),
  ]);
}

/**
 * Sleep for a specified duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Format duration for display
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${seconds}s`;
}
