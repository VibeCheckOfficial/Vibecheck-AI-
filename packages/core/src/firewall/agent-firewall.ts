/**
 * Agent Firewall
 * 
 * Central orchestrator for intercepting and validating AI agent actions.
 * Prevents hallucinated code from being written to the filesystem.
 * 
 * Features:
 * - Three modes: observe, enforce, lockdown
 * - Claim extraction and evidence resolution
 * - Policy engine with configurable rules
 * - Comprehensive audit logging
 * - Performance tracking and caching
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { IntentValidator, type Intent } from './intent-validator.js';
import { ClaimExtractor, type Claim } from './claim-extractor.js';
import { EvidenceResolver, type Evidence } from './evidence-resolver.js';
import { PolicyEngine, type PolicyDecision } from './policy-engine.js';
import { UnblockPlanner, type UnblockPlan } from './unblock-planner.js';
import {
  VibeCheckError,
  FirewallBlockedError,
  ValidationError,
  ConfigError,
  wrapError,
} from '../utils/errors.js';
import { getLogger, type Logger } from '../utils/logger.js';
import { Cache } from '../utils/cache.js';
import { PerformanceTracker } from '../utils/performance.js';
import { withTimeout, withRetry } from '../utils/retry.js';
import { validateOrThrow, string, number, oneOf } from '../utils/validation.js';

/**
 * Firewall mode determines how violations are handled:
 * - observe: Log violations but allow all actions (monitoring mode)
 * - enforce: Block actions with violations (default behavior)
 * - lockdown: Block all write operations regardless of violations
 */
export type FirewallMode = 'observe' | 'enforce' | 'lockdown';

export interface FirewallConfig {
  mode: FirewallMode;
  strictMode: boolean;
  allowPartialMatches: boolean;
  maxClaimsPerRequest: number;
  evidenceTimeout: number;
  auditLogPath: string;
  projectRoot: string;
  truthpackPath: string;
  enableAuditLog: boolean;
  enablePerformanceTracking: boolean;
  enableCaching: boolean;
  cacheTtlMs: number;
}

export interface FirewallResult {
  allowed: boolean;
  decision: PolicyDecision;
  claims: Claim[];
  evidence: Evidence[];
  violations: Array<{ policy: string; message: string; severity: string }>;
  unblockPlan?: UnblockPlan;
  auditId: string;
  durationMs?: number;
}

export interface FirewallRequest {
  agentId?: string;
  action: 'write' | 'modify' | 'delete' | 'execute';
  target: string;
  content: string;
  context?: Record<string, unknown>;
}

export interface QuickCheckResult {
  safe: boolean;
  concerns: string[];
  claimsChecked: number;
  durationMs: number;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  agentId: string;
  action: string;
  target: string;
  allowed: boolean;
  reason: string;
  claimCount: number;
  violationCount: number;
  violations: string[];
  duration: number;
  mode: FirewallMode;
}

const DEFAULT_CONFIG: FirewallConfig = {
  mode: 'enforce',
  strictMode: true,
  allowPartialMatches: false,
  maxClaimsPerRequest: 50,
  evidenceTimeout: 5000,
  auditLogPath: '.vibecheck/audit/firewall.log',
  projectRoot: process.cwd(),
  truthpackPath: '.vibecheck/truthpack',
  enableAuditLog: true,
  enablePerformanceTracking: true,
  enableCaching: true,
  cacheTtlMs: 60000, // 1 minute
};

// Validation schemas
const modeValidator = oneOf(['observe', 'enforce', 'lockdown'] as const);
const actionValidator = oneOf(['write', 'modify', 'delete', 'execute'] as const);

export class AgentFirewall {
  private config: FirewallConfig;
  private intentValidator: IntentValidator;
  private claimExtractor: ClaimExtractor;
  private evidenceResolver: EvidenceResolver;
  private policyEngine: PolicyEngine;
  private unblockPlanner: UnblockPlanner;
  private auditBuffer: AuditEntry[] = [];
  private flushInterval: ReturnType<typeof setInterval> | null = null;
  private logger: Logger;
  private performanceTracker: PerformanceTracker;
  private quickCheckCache: Cache<QuickCheckResult>;
  private disposed = false;

  constructor(config: Partial<FirewallConfig> = {}) {
    this.config = this.validateConfig({ ...DEFAULT_CONFIG, ...config });
    this.logger = getLogger('firewall');
    this.performanceTracker = new PerformanceTracker();
    this.quickCheckCache = new Cache<QuickCheckResult>({
      maxSize: 500,
      defaultTtlMs: this.config.cacheTtlMs,
    });

    this.intentValidator = new IntentValidator();
    this.claimExtractor = new ClaimExtractor();
    this.evidenceResolver = new EvidenceResolver({
      projectRoot: this.config.projectRoot,
      truthpackPath: this.config.truthpackPath,
    });
    this.policyEngine = new PolicyEngine();
    this.unblockPlanner = new UnblockPlanner();

    // Start periodic flush of audit log
    if (this.config.enableAuditLog) {
      this.flushInterval = setInterval(() => this.flushAuditBuffer(), 5000);
      // Don't prevent process exit
      if (this.flushInterval.unref) {
        this.flushInterval.unref();
      }
    }

    this.logger.info('Agent firewall initialized', {
      mode: this.config.mode,
      strictMode: this.config.strictMode,
    });
  }

  /**
   * Validate configuration
   */
  private validateConfig(config: FirewallConfig): FirewallConfig {
    try {
      validateOrThrow(config.mode, modeValidator, {
        component: 'AgentFirewall',
        operation: 'validateConfig',
        field: 'mode',
      });

      validateOrThrow(config.maxClaimsPerRequest, number({ min: 1, max: 1000, integer: true }), {
        component: 'AgentFirewall',
        operation: 'validateConfig',
        field: 'maxClaimsPerRequest',
      });

      validateOrThrow(config.evidenceTimeout, number({ min: 100, max: 60000 }), {
        component: 'AgentFirewall',
        operation: 'validateConfig',
        field: 'evidenceTimeout',
      });

      if (!config.projectRoot || typeof config.projectRoot !== 'string') {
        throw new ConfigError('projectRoot must be a non-empty string', {
          component: 'AgentFirewall',
          configKey: 'projectRoot',
        });
      }

      return config;
    } catch (error) {
      if (error instanceof VibeCheckError) throw error;
      throw new ConfigError(
        `Invalid firewall configuration: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { component: 'AgentFirewall' }
      );
    }
  }

  /**
   * Get the current firewall mode
   */
  getMode(): FirewallMode {
    return this.config.mode;
  }

  /**
   * Set the firewall mode
   */
  setMode(mode: FirewallMode): void {
    this.assertNotDisposed();
    validateOrThrow(mode, modeValidator, {
      component: 'AgentFirewall',
      operation: 'setMode',
      field: 'mode',
    });

    const previousMode = this.config.mode;
    this.config.mode = mode;
    
    this.logger.info('Firewall mode changed', { previousMode, newMode: mode });
    
    // Clear cache when mode changes (results may be different)
    this.quickCheckCache.clear();
  }

  /**
   * Evaluate a request against the firewall
   */
  async evaluate(request: FirewallRequest): Promise<FirewallResult> {
    this.assertNotDisposed();
    const startTime = performance.now();
    const auditId = this.generateAuditId();

    // Validate request
    this.validateRequest(request);

    this.logger.debug('Evaluating request', {
      auditId,
      action: request.action,
      target: request.target,
      mode: this.config.mode,
    });

    try {
      // LOCKDOWN MODE: Block all write operations immediately
      if (this.config.mode === 'lockdown') {
        if (['write', 'modify', 'delete', 'execute'].includes(request.action)) {
          const result = this.createBlockedResult(
            auditId,
            'Lockdown mode: All write operations are blocked',
            []
          );
          result.durationMs = performance.now() - startTime;
          await this.audit(auditId, request, result.decision, startTime);
          return result;
        }
      }

      // Step 1: Validate intent with timeout
      const intent = await this.withTracking('validateIntent', async () => {
        return withTimeout(
          () => this.intentValidator.validate(request),
          this.config.evidenceTimeout,
          { component: 'AgentFirewall', operation: 'validateIntent' }
        );
      });

      if (!intent.valid && this.config.mode === 'enforce') {
        const result = this.createBlockedResult(auditId, `Invalid intent: ${intent.reason ?? 'Unknown'}`, []);
        result.durationMs = performance.now() - startTime;
        await this.audit(auditId, request, result.decision, startTime);
        return result;
      }

      // Step 2: Extract claims from content
      const claims = await this.withTracking('extractClaims', async () => {
        return this.claimExtractor.extract(request.content);
      });

      if (claims.length > this.config.maxClaimsPerRequest && this.config.mode === 'enforce') {
        const result = this.createBlockedResult(
          auditId,
          `Too many claims (${claims.length} > ${this.config.maxClaimsPerRequest}). Break into smaller changes.`,
          claims
        );
        result.durationMs = performance.now() - startTime;
        await this.audit(auditId, request, result.decision, startTime);
        return result;
      }

      // Step 3: Resolve evidence for each claim with timeout
      const evidence = await this.withTracking('resolveEvidence', async () => {
        return withTimeout(
          () => this.evidenceResolver.resolveAll(claims),
          this.config.evidenceTimeout,
          { component: 'AgentFirewall', operation: 'resolveEvidence' }
        );
      });

      // Step 4: Apply policy engine
      const decision = await this.withTracking('evaluatePolicy', async () => {
        return this.policyEngine.evaluate({
          intent,
          claims,
          evidence,
          config: this.config,
        });
      });

      // Step 5: If blocked, generate unblock plan
      let unblockPlan: UnblockPlan | undefined;
      if (!decision.allowed) {
        unblockPlan = await this.withTracking('planUnblock', async () => {
          return this.unblockPlanner.plan(decision);
        });
      }

      // Audit log
      await this.audit(auditId, request, decision, startTime, claims.length);

      // Format violations for the result
      const violations = decision.violations.map(v => ({
        policy: v.policy,
        message: v.message,
        severity: v.severity,
      }));

      // OBSERVE MODE: Log violations but allow the action
      const allowed = this.config.mode === 'observe' ? true : decision.allowed;
      const durationMs = performance.now() - startTime;

      // Log result
      this.logger.info(allowed ? 'Request allowed' : 'Request blocked', {
        auditId,
        allowed,
        violationCount: violations.length,
        claimCount: claims.length,
        durationMs: Math.round(durationMs),
      });

      return {
        allowed,
        decision: {
          ...decision,
          allowed,
          reason: this.config.mode === 'observe' && !decision.allowed
            ? `[OBSERVE MODE] Would have blocked: ${decision.reason}`
            : decision.reason,
        },
        claims,
        evidence,
        violations,
        unblockPlan,
        auditId,
        durationMs,
      };
    } catch (error) {
      const durationMs = performance.now() - startTime;
      this.logger.error('Evaluation failed', error as Error, {
        auditId,
        action: request.action,
        target: request.target,
        durationMs: Math.round(durationMs),
      });

      // In enforce mode, block on errors for safety
      if (this.config.mode === 'enforce') {
        const result = this.createBlockedResult(
          auditId,
          `Evaluation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          []
        );
        result.durationMs = durationMs;
        return result;
      }

      // In observe mode, allow but log the error
      throw wrapError(error, { component: 'AgentFirewall', operation: 'evaluate' });
    }
  }

  /**
   * Quick check without full evidence resolution
   * Returns detailed result with concerns if any issues are detected
   */
  async quickCheck(content: string): Promise<QuickCheckResult> {
    this.assertNotDisposed();
    const startTime = performance.now();

    // Check cache if enabled
    if (this.config.enableCaching) {
      const cacheKey = this.hashContent(content);
      const cached = this.quickCheckCache.get(cacheKey);
      if (cached) {
        this.logger.debug('Quick check cache hit');
        return { ...cached, durationMs: performance.now() - startTime };
      }
    }

    const claims = await this.withTracking('quickCheckExtract', async () => {
      return this.claimExtractor.extract(content);
    });

    const concerns: string[] = [];

    // Check for suspicious patterns with detailed messages
    const suspiciousPatterns = [
      { pattern: /\beval\s*\(/, message: 'Contains eval() which can execute arbitrary code' },
      { pattern: /\bnew\s+Function\s*\(/, message: 'Contains Function constructor which can execute arbitrary code' },
      { pattern: /rm\s+-rf\s+[\/~]/, message: 'Contains dangerous rm -rf command targeting root or home' },
      { pattern: /DROP\s+TABLE/i, message: 'Contains SQL DROP TABLE statement' },
      { pattern: /DELETE\s+FROM\s+\w+\s*;?\s*$/im, message: 'Contains DELETE without WHERE clause' },
      { pattern: /exec\s*\([^)]*\$/, message: 'Contains shell exec with variable injection risk' },
      { pattern: /process\.env\.\w+\s*=/, message: 'Modifies process.env which affects global state' },
      { pattern: /require\s*\(\s*[^'"]/,  message: 'Dynamic require with non-literal path' },
      { pattern: /fs\.(?:unlink|rmdir|rm)Sync\s*\(/, message: 'Synchronous file deletion detected' },
      { pattern: /child_process/, message: 'Uses child_process which can execute system commands' },
    ];

    for (const { pattern, message } of suspiciousPatterns) {
      if (pattern.test(content)) {
        concerns.push(message);
      }
    }

    // Check for low confidence claims
    const lowConfidenceClaims = claims.filter(c => c.confidence < 0.5);
    if (lowConfidenceClaims.length > 0) {
      concerns.push(`${lowConfidenceClaims.length} claim(s) with low confidence (may be hallucinated)`);
    }

    // Check for excessive claims
    if (claims.length > this.config.maxClaimsPerRequest) {
      concerns.push(`Too many claims (${claims.length}) - consider breaking into smaller changes`);
    }

    // In strict mode, flag medium confidence claims
    if (this.config.strictMode) {
      const mediumConfidenceClaims = claims.filter(c => c.confidence >= 0.5 && c.confidence < 0.8);
      if (mediumConfidenceClaims.length > 3) {
        concerns.push(`${mediumConfidenceClaims.length} claims with medium confidence - verification recommended`);
      }
    }

    // Check for potentially hallucinated imports (deep paths)
    const deepImportPattern = /from\s+['"](@[^/]+\/[^/]+\/[^/]+\/[^/]+\/[^'"]+|[^@][^/]+\/[^/]+\/[^/]+\/[^/]+\/[^'"]+)['"]/g;
    let importMatch;
    while ((importMatch = deepImportPattern.exec(content)) !== null) {
      concerns.push(`Suspiciously deep import path: "${importMatch[1].slice(0, 50)}..."`);
    }

    const durationMs = performance.now() - startTime;
    const result: QuickCheckResult = {
      safe: concerns.length === 0,
      concerns,
      claimsChecked: claims.length,
      durationMs,
    };

    // Cache result
    if (this.config.enableCaching) {
      const cacheKey = this.hashContent(content);
      this.quickCheckCache.set(cacheKey, result);
    }

    this.logger.debug('Quick check completed', {
      safe: result.safe,
      concernCount: concerns.length,
      claimsChecked: claims.length,
      durationMs: Math.round(durationMs),
    });

    return result;
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): Record<string, unknown> {
    return this.performanceTracker.export();
  }

  /**
   * Clear caches
   */
  clearCaches(): void {
    this.quickCheckCache.clear();
    this.evidenceResolver.clearCache();
    this.logger.info('Caches cleared');
  }

  /**
   * Validate a request before processing
   */
  private validateRequest(request: FirewallRequest): void {
    if (!request) {
      throw new ValidationError('Request is required', {
        component: 'AgentFirewall',
        operation: 'validateRequest',
      });
    }

    validateOrThrow(request.action, actionValidator, {
      component: 'AgentFirewall',
      operation: 'validateRequest',
      field: 'action',
    });

    validateOrThrow(request.target, string({ minLength: 1, maxLength: 1000 }), {
      component: 'AgentFirewall',
      operation: 'validateRequest',
      field: 'target',
    });

    if (typeof request.content !== 'string') {
      throw new ValidationError('Content must be a string', {
        component: 'AgentFirewall',
        operation: 'validateRequest',
        field: 'content',
      });
    }

    // Limit content size for safety
    if (request.content.length > 1_000_000) {
      throw new ValidationError('Content exceeds maximum size of 1MB', {
        component: 'AgentFirewall',
        operation: 'validateRequest',
        field: 'content',
      });
    }
  }

  private createBlockedResult(
    auditId: string,
    reason: string,
    claims: Claim[]
  ): FirewallResult {
    return {
      allowed: false,
      decision: {
        allowed: false,
        reason,
        violations: [],
        confidence: 1,
      },
      claims,
      evidence: [],
      violations: [],
      auditId,
    };
  }

  private generateAuditId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2, 8);
    return `fw-${timestamp}-${random}`;
  }

  /**
   * Simple hash for cache keys
   */
  private hashContent(content: string): string {
    let hash = 0;
    for (let i = 0; i < Math.min(content.length, 10000); i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return `qc-${hash.toString(36)}-${content.length}`;
  }

  /**
   * Track performance of an operation
   */
  private async withTracking<T>(
    name: string,
    fn: () => Promise<T>
  ): Promise<T> {
    if (!this.config.enablePerformanceTracking) {
      return fn();
    }

    const { result } = await this.performanceTracker.time(name, fn);
    return result;
  }

  /**
   * Log an audit entry
   */
  private async audit(
    auditId: string,
    request: FirewallRequest,
    decision: PolicyDecision,
    startTime: number,
    claimCount = 0
  ): Promise<void> {
    if (!this.config.enableAuditLog) return;

    const entry: AuditEntry = {
      id: auditId,
      timestamp: new Date().toISOString(),
      agentId: request.agentId ?? 'unknown',
      action: request.action,
      target: request.target,
      allowed: decision.allowed,
      reason: decision.reason,
      claimCount,
      violationCount: decision.violations.length,
      violations: decision.violations.map(v => v.policy),
      duration: Math.round(performance.now() - startTime),
      mode: this.config.mode,
    };

    this.auditBuffer.push(entry);

    // Immediate flush if buffer is getting large
    if (this.auditBuffer.length >= 100) {
      await this.flushAuditBuffer();
    }
  }

  /**
   * Flush audit buffer to disk with retry
   */
  private async flushAuditBuffer(): Promise<void> {
    if (this.auditBuffer.length === 0) return;

    const entries = this.auditBuffer.splice(0, this.auditBuffer.length);

    try {
      await withRetry(
        async () => {
          const logPath = path.isAbsolute(this.config.auditLogPath)
            ? this.config.auditLogPath
            : path.join(this.config.projectRoot, this.config.auditLogPath);

          // Ensure directory exists
          await fs.mkdir(path.dirname(logPath), { recursive: true });

          // Append entries as JSONL (one JSON object per line)
          const lines = entries.map(e => JSON.stringify(e)).join('\n') + '\n';
          await fs.appendFile(logPath, lines, 'utf-8');
        },
        {
          maxAttempts: 3,
          initialDelayMs: 100,
          onRetry: (attempt, error) => {
            this.logger.warn(`Audit log write retry ${attempt}`, { error: error.message });
          },
        }
      );
    } catch (error) {
      this.logger.error('Failed to write audit log after retries', error as Error);
      // Re-add entries to buffer for next attempt
      this.auditBuffer.unshift(...entries);
    }
  }

  /**
   * Get recent audit entries
   */
  async getAuditHistory(limit = 100): Promise<AuditEntry[]> {
    this.assertNotDisposed();
    
    try {
      const logPath = path.isAbsolute(this.config.auditLogPath)
        ? this.config.auditLogPath
        : path.join(this.config.projectRoot, this.config.auditLogPath);

      const content = await fs.readFile(logPath, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);

      // Parse and return last N entries
      const entries = lines
        .slice(-limit)
        .map(line => {
          try {
            return JSON.parse(line) as AuditEntry;
          } catch {
            return null;
          }
        })
        .filter((e): e is AuditEntry => e !== null);

      return entries;
    } catch {
      return [];
    }
  }

  /**
   * Get audit statistics
   */
  async getAuditStats(since?: Date): Promise<{
    total: number;
    allowed: number;
    blocked: number;
    byViolation: Record<string, number>;
    byMode: Record<string, number>;
    avgDuration: number;
  }> {
    const entries = await this.getAuditHistory(1000);
    const filtered = since
      ? entries.filter(e => new Date(e.timestamp) >= since)
      : entries;

    const byViolation: Record<string, number> = {};
    const byMode: Record<string, number> = {};
    let totalDuration = 0;

    for (const entry of filtered) {
      totalDuration += entry.duration;
      
      byMode[entry.mode] = (byMode[entry.mode] || 0) + 1;
      
      for (const violation of entry.violations) {
        byViolation[violation] = (byViolation[violation] || 0) + 1;
      }
    }

    return {
      total: filtered.length,
      allowed: filtered.filter(e => e.allowed).length,
      blocked: filtered.filter(e => !e.allowed).length,
      byViolation,
      byMode,
      avgDuration: filtered.length > 0 ? totalDuration / filtered.length : 0,
    };
  }

  /**
   * Clear audit log
   */
  async clearAuditLog(): Promise<void> {
    const logPath = path.isAbsolute(this.config.auditLogPath)
      ? this.config.auditLogPath
      : path.join(this.config.projectRoot, this.config.auditLogPath);

    try {
      await fs.writeFile(logPath, '', 'utf-8');
      this.logger.info('Audit log cleared');
    } catch {
      // File may not exist
    }
  }

  /**
   * Assert firewall is not disposed
   */
  private assertNotDisposed(): void {
    if (this.disposed) {
      throw new VibeCheckError('Firewall has been disposed', {
        code: 'INTERNAL_ERROR',
        component: 'AgentFirewall',
        operation: 'assertNotDisposed',
        recoveryHint: 'Create a new AgentFirewall instance',
      });
    }
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    if (this.disposed) return;
    
    this.disposed = true;
    
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    
    // Final flush
    this.flushAuditBuffer().catch(() => {});
    
    // Clean up cache
    this.quickCheckCache.dispose();
    
    this.logger.info('Agent firewall disposed');
  }
}
