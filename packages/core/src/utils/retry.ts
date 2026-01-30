/**
 * Retry and Circuit Breaker Utilities
 * 
 * Provides resilient execution patterns for unreliable operations.
 */

import { TimeoutError, VibeCheckError } from './errors.js';

export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryOn?: (error: Error) => boolean;
  onRetry?: (attempt: number, error: Error, delayMs: number) => void;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 100,
  maxDelayMs: 5000,
  backoffMultiplier: 2,
};

/**
 * Execute a function with retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const cfg = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error | null = null;
  let delay = cfg.initialDelayMs;

  for (let attempt = 1; attempt <= cfg.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Check if we should retry this error
      const shouldRetry = cfg.retryOn 
        ? cfg.retryOn(lastError) 
        : isRetryable(lastError);

      if (!shouldRetry || attempt === cfg.maxAttempts) {
        break;
      }

      // Notify retry callback
      cfg.onRetry?.(attempt, lastError, delay);

      // Wait before retry
      await sleep(delay);

      // Exponential backoff with jitter
      delay = Math.min(
        delay * cfg.backoffMultiplier + Math.random() * 100,
        cfg.maxDelayMs
      );
    }
  }

  throw lastError;
}

/**
 * Check if an error is retryable
 */
function isRetryable(error: Error): boolean {
  // Check if it's a VibeCheckError with retryable flag
  if (error instanceof VibeCheckError) {
    return error.retryable;
  }

  // Common retryable error patterns
  const retryablePatterns = [
    /ECONNRESET/i,
    /ETIMEDOUT/i,
    /ECONNREFUSED/i,
    /ENOTFOUND/i,
    /network/i,
    /timeout/i,
    /rate limit/i,
    /429/,
    /503/,
    /502/,
  ];

  const message = error.message || '';
  return retryablePatterns.some(p => p.test(message));
}

/**
 * Execute with timeout
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  context: { component: string; operation: string }
): Promise<T> {
  const start = Date.now();

  return Promise.race([
    fn(),
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new TimeoutError(
          `Operation timed out after ${timeoutMs}ms`,
          {
            component: context.component,
            operation: context.operation,
            timeoutMs,
            elapsed: Date.now() - start,
          }
        ));
      }, timeoutMs);
    }),
  ]);
}

/**
 * Circuit breaker state
 */
type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  openDurationMs: number;
  onStateChange?: (from: CircuitState, to: CircuitState) => void;
}

const DEFAULT_CIRCUIT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 2,
  openDurationMs: 30000,
};

/**
 * Circuit breaker for protecting against cascading failures
 */
export class CircuitBreaker {
  private config: CircuitBreakerConfig;
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private name: string;

  constructor(name: string, config: Partial<CircuitBreakerConfig> = {}) {
    this.name = name;
    this.config = { ...DEFAULT_CIRCUIT_CONFIG, ...config };
  }

  /**
   * Execute a function through the circuit breaker
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit should transition from open to half-open
    if (this.state === 'open') {
      const timeSinceFailure = Date.now() - this.lastFailureTime;
      if (timeSinceFailure >= this.config.openDurationMs) {
        this.transition('half-open');
      } else {
        throw new VibeCheckError(
          `Circuit breaker "${this.name}" is open`,
          {
            code: 'RATE_LIMITED',
            component: 'CircuitBreaker',
            operation: 'execute',
            details: { state: this.state, name: this.name },
            recoveryHint: `Wait ${Math.ceil((this.config.openDurationMs - timeSinceFailure) / 1000)}s before retrying`,
            retryable: true,
          }
        );
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Get current state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get statistics
   */
  getStats(): {
    state: CircuitState;
    failureCount: number;
    successCount: number;
    lastFailureTime: number;
  } {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
    };
  }

  /**
   * Reset the circuit breaker
   */
  reset(): void {
    this.failureCount = 0;
    this.successCount = 0;
    this.transition('closed');
  }

  private onSuccess(): void {
    this.failureCount = 0;

    if (this.state === 'half-open') {
      this.successCount++;
      if (this.successCount >= this.config.successThreshold) {
        this.transition('closed');
      }
    }
  }

  private onFailure(): void {
    this.lastFailureTime = Date.now();
    this.successCount = 0;
    this.failureCount++;

    if (this.state === 'half-open') {
      this.transition('open');
    } else if (this.failureCount >= this.config.failureThreshold) {
      this.transition('open');
    }
  }

  private transition(to: CircuitState): void {
    if (this.state === to) return;

    const from = this.state;
    this.state = to;
    
    if (to === 'closed') {
      this.failureCount = 0;
      this.successCount = 0;
    }

    this.config.onStateChange?.(from, to);
  }
}

/**
 * Simple sleep function
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Debounce a function
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delayMs: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      fn(...args);
      timeoutId = null;
    }, delayMs);
  };
}

/**
 * Throttle a function
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  limitMs: number
): (...args: Parameters<T>) => void {
  let lastRun = 0;
  let scheduled: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>) => {
    const now = Date.now();
    const timeSinceLastRun = now - lastRun;

    if (timeSinceLastRun >= limitMs) {
      lastRun = now;
      fn(...args);
    } else if (!scheduled) {
      scheduled = setTimeout(() => {
        lastRun = Date.now();
        fn(...args);
        scheduled = null;
      }, limitMs - timeSinceLastRun);
    }
  };
}

// Global circuit breakers
const circuitBreakers = new Map<string, CircuitBreaker>();

/**
 * Get or create a named circuit breaker
 */
export function getCircuitBreaker(
  name: string,
  config?: Partial<CircuitBreakerConfig>
): CircuitBreaker {
  let breaker = circuitBreakers.get(name);
  if (!breaker) {
    breaker = new CircuitBreaker(name, config);
    circuitBreakers.set(name, breaker);
  }
  return breaker;
}
