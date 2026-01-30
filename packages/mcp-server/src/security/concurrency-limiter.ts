/**
 * Concurrency Limiter
 * 
 * Limits the number of concurrent operations to prevent resource exhaustion.
 */

export interface ConcurrencyLimits {
  maxToolExecutions: number;
  maxFileOperations: number;
  maxGlobOperations: number;
}

export const DEFAULT_CONCURRENCY_LIMITS: ConcurrencyLimits = {
  maxToolExecutions: 10,
  maxFileOperations: 20,
  maxGlobOperations: 5,
};

export class ConcurrencyLimiter {
  private readonly limits: ConcurrencyLimits;
  private readonly activeToolExecutions: Set<string> = new Set();
  private readonly activeFileOperations: Set<string> = new Set();
  private readonly activeGlobOperations: Set<string> = new Set();

  constructor(limits: Partial<ConcurrencyLimits> = {}) {
    this.limits = { ...DEFAULT_CONCURRENCY_LIMITS, ...limits };
  }

  /**
   * Acquire a slot for tool execution
   */
  async acquireToolExecution(id: string): Promise<{ acquired: boolean; waitTime?: number }> {
    if (this.activeToolExecutions.size >= this.limits.maxToolExecutions) {
      return {
        acquired: false,
        waitTime: 1000, // Suggest waiting 1 second
      };
    }

    this.activeToolExecutions.add(id);
    return { acquired: true };
  }

  /**
   * Release a tool execution slot
   */
  releaseToolExecution(id: string): void {
    this.activeToolExecutions.delete(id);
  }

  /**
   * Acquire a slot for file operation
   */
  async acquireFileOperation(id: string): Promise<{ acquired: boolean; waitTime?: number }> {
    if (this.activeFileOperations.size >= this.limits.maxFileOperations) {
      return {
        acquired: false,
        waitTime: 500, // Suggest waiting 500ms
      };
    }

    this.activeFileOperations.add(id);
    return { acquired: true };
  }

  /**
   * Release a file operation slot
   */
  releaseFileOperation(id: string): void {
    this.activeFileOperations.delete(id);
  }

  /**
   * Acquire a slot for glob operation
   */
  async acquireGlobOperation(id: string): Promise<{ acquired: boolean; waitTime?: number }> {
    if (this.activeGlobOperations.size >= this.limits.maxGlobOperations) {
      return {
        acquired: false,
        waitTime: 2000, // Suggest waiting 2 seconds
      };
    }

    this.activeGlobOperations.add(id);
    return { acquired: true };
  }

  /**
   * Release a glob operation slot
   */
  releaseGlobOperation(id: string): void {
    this.activeGlobOperations.delete(id);
  }

  /**
   * Wrap a function with concurrency limiting
   */
  async withLimit<T>(
    operation: 'tool' | 'file' | 'glob',
    id: string,
    fn: () => Promise<T>
  ): Promise<T> {
    let acquire: (id: string) => Promise<{ acquired: boolean; waitTime?: number }>;
    let release: (id: string) => void;

    switch (operation) {
      case 'tool':
        acquire = this.acquireToolExecution.bind(this);
        release = this.releaseToolExecution.bind(this);
        break;
      case 'file':
        acquire = this.acquireFileOperation.bind(this);
        release = this.releaseFileOperation.bind(this);
        break;
      case 'glob':
        acquire = this.acquireGlobOperation.bind(this);
        release = this.releaseGlobOperation.bind(this);
        break;
    }

    const result = await acquire(id);
    if (!result.acquired) {
      throw new Error(`Concurrency limit exceeded for ${operation} operations`);
    }

    try {
      return await fn();
    } finally {
      release(id);
    }
  }

  /**
   * Get current usage statistics
   */
  getStats(): {
    toolExecutions: { active: number; max: number };
    fileOperations: { active: number; max: number };
    globOperations: { active: number; max: number };
  } {
    return {
      toolExecutions: {
        active: this.activeToolExecutions.size,
        max: this.limits.maxToolExecutions,
      },
      fileOperations: {
        active: this.activeFileOperations.size,
        max: this.limits.maxFileOperations,
      },
      globOperations: {
        active: this.activeGlobOperations.size,
        max: this.limits.maxGlobOperations,
      },
    };
  }
}

/**
 * Create concurrency limiter instance
 */
export function createConcurrencyLimiter(limits: Partial<ConcurrencyLimits> = {}): ConcurrencyLimiter {
  return new ConcurrencyLimiter(limits);
}
