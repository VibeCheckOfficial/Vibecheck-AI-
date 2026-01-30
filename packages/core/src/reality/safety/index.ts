/**
 * Safety Controls for Reality Mode
 * 
 * Provides URL allowlisting, SSRF protection, timeout management,
 * sensitive data redaction, and concurrency limiting.
 */

// URL Allowlist
export {
  UrlAllowlist,
  createUrlAllowlist,
  isUrlAllowed,
  isMockApiUrl,
  hashAllowlistConfig,
  DEFAULT_ALLOWLIST_PATTERNS,
  MOCK_API_DOMAINS,
  type UrlAllowlistConfig,
  type UrlCheckResult,
} from './url-allowlist.js';

// SSRF Guard
export {
  SsrfGuard,
  createSsrfGuard,
  isBlockedIp,
  getBlockedRanges,
  type SsrfGuardConfig,
  type IpCheckResult,
} from './ssrf-guard.js';

// Timeout Manager
export {
  TimeoutManager,
  TimeoutError,
  createTimeoutManager,
  withTimeout,
  isTimeoutError,
  sleep,
  formatDuration,
  DEFAULT_TIMEOUTS,
  MAX_TIMEOUTS,
  type TimeoutConfig,
  type TimeoutState,
} from './timeout-manager.js';

// Redaction
export {
  Redactor,
  createRedactor,
  redactSensitive,
  containsSensitiveData,
  getDefaultRuleIds,
  DEFAULT_REDACTION_RULES,
  type RedactionConfig,
  type RedactionRule,
  type RedactionResult,
} from './redaction.js';

// Concurrency
export {
  ConcurrencyLimiter,
  Semaphore,
  createConcurrencyLimiter,
  runWithConcurrency,
  formatBytes,
  DEFAULT_CONCURRENCY,
  MAX_CONCURRENCY,
  type ConcurrencyConfig,
  type ConcurrencyState,
  type AcquireResult,
} from './concurrency.js';

// ============================================================================
// Combined Safety Guard
// ============================================================================

import { UrlAllowlist, type UrlAllowlistConfig } from './url-allowlist.js';
import { SsrfGuard, type SsrfGuardConfig } from './ssrf-guard.js';
import { TimeoutManager, type TimeoutConfig } from './timeout-manager.js';
import { Redactor, type RedactionConfig } from './redaction.js';
import { ConcurrencyLimiter, type ConcurrencyConfig } from './concurrency.js';

export interface SafetyGuardConfig {
  urlAllowlist?: Partial<UrlAllowlistConfig>;
  ssrfGuard?: Partial<SsrfGuardConfig>;
  timeouts?: Partial<TimeoutConfig>;
  redaction?: Partial<RedactionConfig>;
  concurrency?: Partial<ConcurrencyConfig>;
}

/**
 * Combined safety guard that coordinates all safety controls
 */
export class SafetyGuard {
  public readonly urlAllowlist: UrlAllowlist;
  public readonly ssrfGuard: SsrfGuard;
  public readonly timeoutManager: TimeoutManager;
  public readonly redactor: Redactor;
  public readonly concurrencyLimiter: ConcurrencyLimiter;

  constructor(config: SafetyGuardConfig = {}) {
    this.urlAllowlist = new UrlAllowlist(config.urlAllowlist);
    this.ssrfGuard = new SsrfGuard(config.ssrfGuard);
    this.timeoutManager = new TimeoutManager(config.timeouts);
    this.redactor = new Redactor(config.redaction);
    this.concurrencyLimiter = new ConcurrencyLimiter(config.concurrency);
  }

  /**
   * Check if a URL is safe to access
   */
  async isUrlSafe(url: string): Promise<{ safe: boolean; reason?: string }> {
    // Check allowlist
    const allowlistResult = this.urlAllowlist.check(url);
    if (!allowlistResult.allowed) {
      return { safe: false, reason: allowlistResult.reason };
    }

    // Check SSRF (resolve hostname and check IP)
    try {
      const parsed = new URL(url);
      const ssrfResult = await this.ssrfGuard.checkHostname(parsed.hostname);
      if (ssrfResult.blocked) {
        return { safe: false, reason: ssrfResult.reason };
      }
    } catch {
      return { safe: false, reason: `Invalid URL: ${url}` };
    }

    return { safe: true };
  }

  /**
   * Redact sensitive data from text
   */
  redact(text: string): string {
    return this.redactor.redact(text).text;
  }

  /**
   * Start a run (initializes timeouts)
   */
  startRun(onTimeout?: () => void): void {
    this.timeoutManager.startRun(onTimeout);
    this.concurrencyLimiter.reset();
  }

  /**
   * Stop a run (cleanup)
   */
  stopRun(): void {
    this.timeoutManager.stopRun();
  }

  /**
   * Check if we should abort the run
   */
  shouldAbort(): { abort: boolean; reason?: string } {
    if (this.timeoutManager.shouldAbort()) {
      return { abort: true, reason: 'Global timeout reached' };
    }

    const concurrencyCheck = this.concurrencyLimiter.shouldStop();
    if (concurrencyCheck.stop) {
      return { abort: true, reason: concurrencyCheck.reason };
    }

    return { abort: false };
  }
}

/**
 * Create a safety guard with default configuration
 */
export function createSafetyGuard(config: SafetyGuardConfig = {}): SafetyGuard {
  return new SafetyGuard(config);
}
