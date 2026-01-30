/**
 * Timeout Wrapper
 * 
 * Wraps async operations with timeout enforcement to prevent hanging requests.
 */

export interface TimeoutConfig {
  fileOperation: number; // milliseconds
  toolExecution: number; // milliseconds
  globOperation: number; // milliseconds
  httpRequest: number; // milliseconds
}

export const DEFAULT_TIMEOUTS: TimeoutConfig = {
  fileOperation: 5000, // 5 seconds
  toolExecution: 30000, // 30 seconds
  globOperation: 10000, // 10 seconds
  httpRequest: 30000, // 30 seconds
};

export class TimeoutError extends Error {
  constructor(public readonly timeout: number, public readonly operation: string) {
    super(`Operation "${operation}" timed out after ${timeout}ms`);
    this.name = 'TimeoutError';
  }
}

/**
 * Wrap an async function with a timeout
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  operation: string = 'operation'
): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<T>((_, reject) => {
      setTimeout(() => {
        reject(new TimeoutError(timeoutMs, operation));
      }, timeoutMs);
    }),
  ]);
}

/**
 * Wrap a file operation with timeout
 */
export async function withFileTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number = DEFAULT_TIMEOUTS.fileOperation
): Promise<T> {
  return withTimeout(fn, timeoutMs, 'file operation');
}

/**
 * Wrap a tool execution with timeout
 */
export async function withToolTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number = DEFAULT_TIMEOUTS.toolExecution
): Promise<T> {
  return withTimeout(fn, timeoutMs, 'tool execution');
}

/**
 * Wrap a glob operation with timeout
 */
export async function withGlobTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number = DEFAULT_TIMEOUTS.globOperation
): Promise<T> {
  return withTimeout(fn, timeoutMs, 'glob operation');
}

/**
 * Create an abort controller for cancellation
 */
export function createAbortController(timeoutMs: number): AbortController {
  const controller = new AbortController();
  setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  return controller;
}
