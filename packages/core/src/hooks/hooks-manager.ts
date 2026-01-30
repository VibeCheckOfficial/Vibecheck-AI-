/**
 * Hooks Manager
 * 
 * Manages and coordinates all IDE hooks with robust error handling,
 * timeouts, and performance tracking.
 * 
 * Features:
 * - Configurable hook execution
 * - Timeout protection
 * - Retry logic for transient failures
 * - Performance tracking
 * - Structured logging
 */

import { PostSaveHook, type PostSaveResult, type PostSaveConfig } from './post-save-hook.js';
import { PreCommitHook, type PreCommitResult, type PreCommitConfig } from './pre-commit-hook.js';
import { DependencyCheckHook, type DependencyCheckResult, type DependencyCheckConfig } from './dependency-check-hook.js';
import { getLogger, type Logger } from '../utils/logger.js';
import { PerformanceTracker } from '../utils/performance.js';
import { withTimeout, withRetry, CircuitBreaker } from '../utils/retry.js';
import { wrapError, TimeoutError, VibeCheckError } from '../utils/errors.js';
import { validateOrThrow, string, oneOf } from '../utils/validation.js';

export interface HooksConfig {
  projectRoot: string;
  truthpackPath: string;
  enabled: {
    postSave: boolean;
    preCommit: boolean;
    dependencyCheck: boolean;
  };
  timeouts: {
    postSave: number;
    preCommit: number;
    dependencyCheck: number;
  };
  retries: {
    maxAttempts: number;
    initialDelayMs: number;
  };
  postSave?: Partial<PostSaveConfig>;
  preCommit?: Partial<PreCommitConfig>;
  dependencyCheck?: Partial<DependencyCheckConfig>;
}

export interface HooksStatus {
  initialized: boolean;
  enabled: {
    postSave: boolean;
    preCommit: boolean;
    dependencyCheck: boolean;
  };
  lastRun: {
    postSave?: { timestamp: Date; success: boolean; duration: number };
    preCommit?: { timestamp: Date; success: boolean; duration: number };
    dependencyCheck?: { timestamp: Date; success: boolean; duration: number };
  };
  circuitBreakers: {
    postSave: 'closed' | 'open' | 'half-open';
    preCommit: 'closed' | 'open' | 'half-open';
    dependencyCheck: 'closed' | 'open' | 'half-open';
  };
}

export interface HookRunResult<T> {
  result: T | null;
  success: boolean;
  duration: number;
  error?: string;
  timedOut?: boolean;
  retriedCount?: number;
}

const DEFAULT_CONFIG: HooksConfig = {
  projectRoot: process.cwd(),
  truthpackPath: '.vibecheck/truthpack',
  enabled: {
    postSave: true,
    preCommit: true,
    dependencyCheck: true,
  },
  timeouts: {
    postSave: 5000,      // 5 seconds
    preCommit: 30000,    // 30 seconds
    dependencyCheck: 60000, // 60 seconds
  },
  retries: {
    maxAttempts: 2,
    initialDelayMs: 100,
  },
};

type HookType = 'postSave' | 'preCommit' | 'dependencyCheck';
const hookTypeValidator = oneOf(['postSave', 'preCommit', 'dependencyCheck'] as const);

export class HooksManager {
  private config: HooksConfig;
  private postSaveHook: PostSaveHook | null = null;
  private preCommitHook: PreCommitHook | null = null;
  private dependencyCheckHook: DependencyCheckHook | null = null;
  private logger: Logger;
  private performanceTracker: PerformanceTracker;
  private circuitBreakers: Map<HookType, CircuitBreaker>;
  private lastRun: Map<HookType, { timestamp: Date; success: boolean; duration: number }>;
  private disposed = false;

  constructor(config: Partial<HooksConfig> = {}) {
    this.config = this.mergeConfig(DEFAULT_CONFIG, config);
    this.logger = getLogger('hooks-manager');
    this.performanceTracker = new PerformanceTracker();
    this.lastRun = new Map();
    
    // Initialize circuit breakers for each hook type
    this.circuitBreakers = new Map([
      ['postSave', new CircuitBreaker('postSave', {
        failureThreshold: 3,
        successThreshold: 2,
        openDurationMs: 30000,
        onStateChange: (from, to) => this.logger.info('Circuit breaker state change', { hook: 'postSave', from, to }),
      })],
      ['preCommit', new CircuitBreaker('preCommit', {
        failureThreshold: 3,
        successThreshold: 2,
        openDurationMs: 60000,
        onStateChange: (from, to) => this.logger.info('Circuit breaker state change', { hook: 'preCommit', from, to }),
      })],
      ['dependencyCheck', new CircuitBreaker('dependencyCheck', {
        failureThreshold: 3,
        successThreshold: 2,
        openDurationMs: 120000,
        onStateChange: (from, to) => this.logger.info('Circuit breaker state change', { hook: 'dependencyCheck', from, to }),
      })],
    ]);

    this.initialize();
    this.logger.info('Hooks manager initialized', {
      enabled: this.config.enabled,
      timeouts: this.config.timeouts,
    });
  }

  /**
   * Merge configs with deep merge for nested objects
   */
  private mergeConfig(defaults: HooksConfig, overrides: Partial<HooksConfig>): HooksConfig {
    return {
      ...defaults,
      ...overrides,
      enabled: { ...defaults.enabled, ...overrides.enabled },
      timeouts: { ...defaults.timeouts, ...overrides.timeouts },
      retries: { ...defaults.retries, ...overrides.retries },
    };
  }

  /**
   * Initialize hooks
   */
  private initialize(): void {
    try {
      if (this.config.enabled.postSave) {
        this.postSaveHook = new PostSaveHook({
          projectRoot: this.config.projectRoot,
          truthpackPath: this.config.truthpackPath,
          ...this.config.postSave,
        });
        this.logger.debug('PostSaveHook initialized');
      }

      if (this.config.enabled.preCommit) {
        this.preCommitHook = new PreCommitHook({
          projectRoot: this.config.projectRoot,
          truthpackPath: this.config.truthpackPath,
          ...this.config.preCommit,
        });
        this.logger.debug('PreCommitHook initialized');
      }

      if (this.config.enabled.dependencyCheck) {
        this.dependencyCheckHook = new DependencyCheckHook({
          projectRoot: this.config.projectRoot,
          ...this.config.dependencyCheck,
        });
        this.logger.debug('DependencyCheckHook initialized');
      }
    } catch (error) {
      this.logger.error('Failed to initialize hooks', error as Error);
      throw wrapError(error, { component: 'HooksManager', operation: 'initialize' });
    }
  }

  /**
   * Run post-save hook with timeout and retry
   */
  async runPostSave(filePath: string, content?: string): Promise<HookRunResult<PostSaveResult>> {
    this.assertNotDisposed();
    
    validateOrThrow(filePath, string({ minLength: 1, maxLength: 1000 }), {
      component: 'HooksManager',
      operation: 'runPostSave',
      field: 'filePath',
    });

    if (!this.postSaveHook) {
      return { result: null, success: true, duration: 0 };
    }

    return this.runHookWithProtection(
      'postSave',
      async () => this.postSaveHook!.execute(filePath, content),
      this.config.timeouts.postSave
    );
  }

  /**
   * Run pre-commit hook with timeout and retry
   */
  async runPreCommit(): Promise<HookRunResult<PreCommitResult>> {
    this.assertNotDisposed();
    
    if (!this.preCommitHook) {
      return { result: null, success: true, duration: 0 };
    }

    return this.runHookWithProtection(
      'preCommit',
      async () => this.preCommitHook!.execute(),
      this.config.timeouts.preCommit
    );
  }

  /**
   * Run dependency check with timeout and retry
   */
  async runDependencyCheck(): Promise<HookRunResult<DependencyCheckResult>> {
    this.assertNotDisposed();
    
    if (!this.dependencyCheckHook) {
      return { result: null, success: true, duration: 0 };
    }

    return this.runHookWithProtection(
      'dependencyCheck',
      async () => this.dependencyCheckHook!.execute(),
      this.config.timeouts.dependencyCheck
    );
  }

  /**
   * Run a hook with timeout, retry, and circuit breaker protection
   */
  private async runHookWithProtection<T>(
    hookType: HookType,
    fn: () => Promise<T>,
    timeout: number
  ): Promise<HookRunResult<T>> {
    const startTime = performance.now();
    const circuitBreaker = this.circuitBreakers.get(hookType)!;
    let retriedCount = 0;

    this.logger.debug(`Running ${hookType} hook`);

    try {
      const result = await circuitBreaker.execute(async () => {
        return withRetry(
          async () => {
            return withTimeout(
              fn,
              timeout,
              { component: 'HooksManager', operation: hookType }
            );
          },
          {
            maxAttempts: this.config.retries.maxAttempts,
            initialDelayMs: this.config.retries.initialDelayMs,
            onRetry: (attempt, error) => {
              retriedCount = attempt;
              this.logger.warn(`${hookType} hook retry ${attempt}`, { error: error.message });
            },
          }
        );
      });

      const duration = performance.now() - startTime;
      this.recordRun(hookType, true, duration);
      this.performanceTracker.record(hookType, duration);

      this.logger.info(`${hookType} hook completed`, {
        duration: Math.round(duration),
        retriedCount,
      });

      return {
        result,
        success: true,
        duration,
        retriedCount: retriedCount > 0 ? retriedCount : undefined,
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      this.recordRun(hookType, false, duration);

      const isTimeout = error instanceof TimeoutError;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      this.logger.error(`${hookType} hook failed`, error as Error, {
        duration: Math.round(duration),
        timedOut: isTimeout,
        retriedCount,
      });

      return {
        result: null,
        success: false,
        duration,
        error: errorMessage,
        timedOut: isTimeout,
        retriedCount: retriedCount > 0 ? retriedCount : undefined,
      };
    }
  }

  /**
   * Record a hook run for status tracking
   */
  private recordRun(hookType: HookType, success: boolean, duration: number): void {
    this.lastRun.set(hookType, {
      timestamp: new Date(),
      success,
      duration,
    });
  }

  /**
   * Run all enabled hooks in parallel
   */
  async runAll(filePath?: string): Promise<{
    postSave?: HookRunResult<PostSaveResult>;
    preCommit?: HookRunResult<PreCommitResult>;
    dependencyCheck?: HookRunResult<DependencyCheckResult>;
    overall: { passed: boolean; duration: number };
  }> {
    this.assertNotDisposed();
    const startTime = performance.now();

    this.logger.info('Running all hooks', { filePath: filePath ?? 'none' });

    // Run hooks in parallel
    const [postSave, preCommit, dependencyCheck] = await Promise.all([
      filePath ? this.runPostSave(filePath) : Promise.resolve(undefined),
      this.runPreCommit(),
      this.runDependencyCheck(),
    ]);

    const duration = performance.now() - startTime;
    
    // Determine overall pass/fail
    const passed = [postSave, preCommit, dependencyCheck]
      .filter((r): r is HookRunResult<unknown> => r !== undefined)
      .every(r => r.success);

    this.logger.info('All hooks completed', {
      passed,
      duration: Math.round(duration),
    });

    return {
      postSave,
      preCommit,
      dependencyCheck,
      overall: { passed, duration },
    };
  }

  /**
   * Get current status
   */
  getStatus(): HooksStatus {
    const lastRunMap: HooksStatus['lastRun'] = {};
    
    for (const [hook, data] of this.lastRun) {
      lastRunMap[hook] = data;
    }

    return {
      initialized: !this.disposed,
      enabled: { ...this.config.enabled },
      lastRun: lastRunMap,
      circuitBreakers: {
        postSave: this.circuitBreakers.get('postSave')!.getState(),
        preCommit: this.circuitBreakers.get('preCommit')!.getState(),
        dependencyCheck: this.circuitBreakers.get('dependencyCheck')!.getState(),
      },
    };
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): Record<string, unknown> {
    return this.performanceTracker.export();
  }

  /**
   * Enable or disable a specific hook
   */
  setEnabled(hook: HookType, enabled: boolean): void {
    this.assertNotDisposed();
    
    validateOrThrow(hook, hookTypeValidator, {
      component: 'HooksManager',
      operation: 'setEnabled',
      field: 'hook',
    });

    this.config.enabled[hook] = enabled;
    this.logger.info('Hook enabled state changed', { hook, enabled });

    // Reinitialize the specific hook
    if (hook === 'postSave') {
      this.postSaveHook = enabled ? new PostSaveHook({
        projectRoot: this.config.projectRoot,
        truthpackPath: this.config.truthpackPath,
        ...this.config.postSave,
      }) : null;
    } else if (hook === 'preCommit') {
      this.preCommitHook = enabled ? new PreCommitHook({
        projectRoot: this.config.projectRoot,
        truthpackPath: this.config.truthpackPath,
        ...this.config.preCommit,
      }) : null;
    } else if (hook === 'dependencyCheck') {
      this.dependencyCheckHook = enabled ? new DependencyCheckHook({
        projectRoot: this.config.projectRoot,
        ...this.config.dependencyCheck,
      }) : null;
    }
  }

  /**
   * Reset circuit breakers
   */
  resetCircuitBreakers(): void {
    for (const breaker of this.circuitBreakers.values()) {
      breaker.reset();
    }
    this.logger.info('Circuit breakers reset');
  }

  /**
   * Check if all checks passed (convenience method)
   */
  async checkAll(): Promise<{ passed: boolean; summary: string; details: Record<string, unknown> }> {
    const results = await this.runAll();
    const issues: string[] = [];
    const details: Record<string, unknown> = {};

    if (results.preCommit) {
      details.preCommit = {
        success: results.preCommit.success,
        duration: Math.round(results.preCommit.duration),
      };
      
      if (!results.preCommit.success) {
        if (results.preCommit.timedOut) {
          issues.push('Pre-commit: Timed out');
        } else {
          issues.push(`Pre-commit: ${results.preCommit.error ?? 'Failed'}`);
        }
      } else if (results.preCommit.result && !results.preCommit.result.passed) {
        const errorCount = results.preCommit.result.issues.filter(i => i.severity === 'error').length;
        issues.push(`Pre-commit: ${errorCount} error(s)`);
      }
    }

    if (results.dependencyCheck) {
      details.dependencyCheck = {
        success: results.dependencyCheck.success,
        duration: Math.round(results.dependencyCheck.duration),
      };
      
      if (!results.dependencyCheck.success) {
        if (results.dependencyCheck.timedOut) {
          issues.push('Dependency check: Timed out');
        } else {
          issues.push(`Dependency check: ${results.dependencyCheck.error ?? 'Failed'}`);
        }
      } else if (results.dependencyCheck.result && !results.dependencyCheck.result.passed) {
        const errorCount = results.dependencyCheck.result.issues.filter(i => i.severity === 'error').length;
        issues.push(`Dependencies: ${errorCount} error(s)`);
      }
    }

    const passed = issues.length === 0;
    const summary = passed
      ? '✅ All checks passed'
      : `❌ Checks failed:\n${issues.map(i => `  - ${i}`).join('\n')}`;

    return { passed, summary, details };
  }

  /**
   * Assert manager is not disposed
   */
  private assertNotDisposed(): void {
    if (this.disposed) {
      throw new VibeCheckError('HooksManager has been disposed', {
        code: 'INTERNAL_ERROR',
        component: 'HooksManager',
        operation: 'assertNotDisposed',
        recoveryHint: 'Create a new HooksManager instance',
      });
    }
  }

  /**
   * Dispose and clean up resources
   */
  dispose(): void {
    if (this.disposed) return;
    
    this.disposed = true;
    this.postSaveHook = null;
    this.preCommitHook = null;
    this.dependencyCheckHook = null;
    
    this.logger.info('Hooks manager disposed');
  }
}
