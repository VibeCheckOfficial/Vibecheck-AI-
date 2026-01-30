/**
 * Ship Gate Policy Engine
 * 
 * Deterministic policy evaluation for SHIP/WARN/BLOCK verdicts.
 * The LLM NEVER has final authority - this engine makes the decision.
 */

import { z } from 'zod';
import type {
  Receipt,
  ShipVerdict,
  ShipGateResult,
  BlockingReason,
  ReceiptSignal,
} from '../types.js';

// ============================================================================
// Policy Rule Types
// ============================================================================

export const PolicyRuleTypeSchema = z.enum(['BLOCK', 'WARN']);
export type PolicyRuleType = z.infer<typeof PolicyRuleTypeSchema>;

export const PolicyRuleSchema = z.object({
  /** Unique rule ID */
  id: z.string(),
  /** Rule type */
  type: PolicyRuleTypeSchema,
  /** Human-readable description */
  description: z.string(),
  /** Severity when triggered */
  severity: z.enum(['critical', 'high', 'medium']),
  /** Condition to evaluate (returns true to trigger) */
  condition: z.function()
    .args(z.object({
      signals: z.record(z.union([z.boolean(), z.number()])),
      receipts: z.array(z.unknown()),
      context: z.record(z.unknown()),
    }))
    .returns(z.boolean()),
  /** Category for grouping */
  category: z.enum(['test', 'runtime', 'security', 'quality', 'performance']),
});

export type PolicyRule = z.infer<typeof PolicyRuleSchema>;

// ============================================================================
// Built-in BLOCK Rules
// ============================================================================

const BLOCK_RULES: PolicyRule[] = [
  // Test Failures
  {
    id: 'typecheck-failed',
    type: 'BLOCK',
    description: 'TypeScript type checking failed',
    severity: 'critical',
    category: 'test',
    condition: ({ signals }) => signals['typecheck.failed'] === true,
  },
  {
    id: 'unit-tests-failed',
    type: 'BLOCK',
    description: 'Unit tests failed (non-flaky)',
    severity: 'critical',
    category: 'test',
    condition: ({ signals }) => 
      signals['tests.unit.failed'] === true && 
      signals['tests.unit.flaky'] !== true,
  },
  
  // Runtime/Reality Mode Failures
  {
    id: 'route-mismatch',
    type: 'BLOCK',
    description: 'Runtime proof shows broken navigation or route mismatch',
    severity: 'high',
    category: 'runtime',
    condition: ({ signals }) => signals['runtime.route.mismatch'] === true,
  },
  {
    id: 'auth-bypass',
    type: 'BLOCK',
    description: 'Protected route accessible without authentication',
    severity: 'critical',
    category: 'security',
    condition: ({ signals }) => signals['runtime.auth.bypass'] === true,
  },
  {
    id: 'critical-endpoint-error',
    type: 'BLOCK',
    description: 'Backend endpoint returns 404/500 on critical path',
    severity: 'critical',
    category: 'runtime',
    condition: ({ signals }) => 
      (signals['runtime.endpoint.404'] === true || 
       signals['runtime.endpoint.500'] === true) &&
      signals['runtime.endpoint.critical'] === true,
  },
  {
    id: 'fake-success-ui',
    type: 'BLOCK',
    description: 'UI shows success but network request failed',
    severity: 'high',
    category: 'runtime',
    condition: ({ signals }) => signals['runtime.fakeSuccess'] === true,
  },
  
  // Security
  {
    id: 'secrets-in-diff',
    type: 'BLOCK',
    description: 'Secrets detected in diff or logs',
    severity: 'critical',
    category: 'security',
    condition: ({ signals }) => signals['security.secrets.detected'] === true,
  },
  {
    id: 'sensitive-data-exposed',
    type: 'BLOCK',
    description: 'Sensitive data exposed in response',
    severity: 'critical',
    category: 'security',
    condition: ({ signals }) => signals['security.data.exposed'] === true,
  },
  
  // Mock Data Detection - Critical
  {
    id: 'hardcoded-credentials',
    type: 'BLOCK',
    description: 'Hardcoded API keys, passwords, or credentials detected',
    severity: 'critical',
    category: 'security',
    condition: ({ signals }) => {
      const count = signals['mock.credentials.count'] as number;
      return typeof count === 'number' && count > 0;
    },
  },
  {
    id: 'fake-auth-bypass',
    type: 'BLOCK',
    description: 'Fake authentication bypass detected (isAuthenticated = true)',
    severity: 'critical',
    category: 'security',
    condition: ({ signals }) => {
      const count = signals['mock.fakeAuth.count'] as number;
      return typeof count === 'number' && count > 0;
    },
  },
  {
    id: 'jwt-token-hardcoded',
    type: 'BLOCK',
    description: 'Hardcoded JWT token detected in source code',
    severity: 'critical',
    category: 'security',
    condition: ({ signals }) => signals['mock.jwt.detected'] === true,
  },
];

// ============================================================================
// Built-in WARN Rules
// ============================================================================

const WARN_RULES: PolicyRule[] = [
  // Test Warnings
  {
    id: 'flaky-tests',
    type: 'WARN',
    description: 'Flaky test results detected',
    severity: 'medium',
    category: 'test',
    condition: ({ signals }) => signals['tests.flaky'] === true,
  },
  
  // Runtime Warnings
  {
    id: 'missing-env-var',
    type: 'WARN',
    description: 'New environment variable required but not declared',
    severity: 'medium',
    category: 'runtime',
    condition: ({ signals }) => signals['runtime.env.missing'] === true,
  },
  {
    id: 'missing-error-handling',
    type: 'WARN',
    description: 'New network call missing error handling',
    severity: 'medium',
    category: 'quality',
    condition: ({ signals }) => signals['quality.errorHandling.missing'] === true,
  },
  
  // Performance Warnings
  {
    id: 'performance-regression',
    type: 'WARN',
    description: 'Performance regression detected beyond threshold',
    severity: 'medium',
    category: 'performance',
    condition: ({ signals }) => {
      const current = signals['performance.responseTime.p95'] as number;
      const baseline = signals['performance.responseTime.baseline'] as number;
      if (typeof current !== 'number' || typeof baseline !== 'number') return false;
      return current > baseline * 1.5; // 50% regression threshold
    },
  },
  
  // Quality Warnings
  {
    id: 'console-errors',
    type: 'WARN',
    description: 'Console errors detected in runtime',
    severity: 'medium',
    category: 'quality',
    condition: ({ signals }) => {
      const count = signals['runtime.consoleErrors.count'] as number;
      return typeof count === 'number' && count > 0;
    },
  },
  {
    id: 'low-coverage',
    type: 'WARN',
    description: 'Test coverage below threshold',
    severity: 'medium',
    category: 'quality',
    condition: ({ signals }) => {
      const coverage = signals['tests.coverage.percent'] as number;
      return typeof coverage === 'number' && coverage < 60;
    },
  },
  
  // Mock Data Warnings
  {
    id: 'mock-data-in-code',
    type: 'WARN',
    description: 'Mock/fake data variables detected in production code',
    severity: 'medium',
    category: 'quality',
    condition: ({ signals }) => {
      const count = signals['mock.mockData.count'] as number;
      return typeof count === 'number' && count > 0;
    },
  },
  {
    id: 'debug-code-remaining',
    type: 'WARN',
    description: 'Debug code (console.log, debugger) remaining in codebase',
    severity: 'medium',
    category: 'quality',
    condition: ({ signals }) => {
      const count = signals['mock.debugCode.count'] as number;
      return typeof count === 'number' && count > 2;
    },
  },
  {
    id: 'placeholder-content',
    type: 'WARN',
    description: 'Placeholder content (Lorem ipsum, TBD) detected',
    severity: 'medium',
    category: 'quality',
    condition: ({ signals }) => {
      const count = signals['mock.placeholder.count'] as number;
      return typeof count === 'number' && count > 0;
    },
  },
  {
    id: 'hardcoded-localhost',
    type: 'WARN',
    description: 'Hardcoded localhost URLs detected in code',
    severity: 'medium',
    category: 'quality',
    condition: ({ signals }) => {
      const count = signals['mock.localhost.count'] as number;
      return typeof count === 'number' && count > 0;
    },
  },
  {
    id: 'fake-user-data',
    type: 'WARN',
    description: 'Fake user data (John Doe, test@example.com) detected',
    severity: 'medium',
    category: 'quality',
    condition: ({ signals }) => {
      const count = signals['mock.fakeUserData.count'] as number;
      return typeof count === 'number' && count > 0;
    },
  },
];

// ============================================================================
// Ship Gate Engine
// ============================================================================

export interface ShipGateConfig {
  /** Strictness level */
  strictness: 'relaxed' | 'standard' | 'paranoid';
  /** Custom BLOCK rules */
  customBlockRules?: PolicyRule[];
  /** Custom WARN rules */
  customWarnRules?: PolicyRule[];
  /** Disabled rule IDs */
  disabledRules?: string[];
  /** Required receipts (by kind) */
  requiredReceipts?: string[];
}

export interface EvaluationContext {
  /** Static scan findings */
  staticFindings?: Array<{ id: string; severity: string; message: string }>;
  /** Diff summary */
  diffSummary?: {
    filesChanged: number;
    linesAdded: number;
    linesRemoved: number;
  };
  /** Additional context */
  metadata?: Record<string, unknown>;
}

export class ShipGateEngine {
  private config: ShipGateConfig;
  private blockRules: PolicyRule[];
  private warnRules: PolicyRule[];

  constructor(config: ShipGateConfig = { strictness: 'standard' }) {
    this.config = config;
    this.blockRules = this.buildBlockRules();
    this.warnRules = this.buildWarnRules();
  }

  /**
   * Evaluate receipts against policy and return verdict
   */
  evaluate(
    receipts: Receipt[],
    context: EvaluationContext = {}
  ): ShipGateResult {
    const timestamp = new Date().toISOString();

    // Extract signals from all receipts
    const signals = this.aggregateSignals(receipts);
    
    // Add context-derived signals
    this.addContextSignals(signals, context);

    // Check for missing required receipts
    const missingReceipts = this.checkRequiredReceipts(receipts);
    if (missingReceipts.length > 0) {
      return this.createBlockedResult(
        missingReceipts.map(kind => ({
          ruleId: 'missing-receipt',
          message: `Missing required receipt: ${kind}`,
          receiptIds: [],
          severity: 'high' as const,
        })),
        receipts.length,
        timestamp
      );
    }

    // Evaluate BLOCK rules
    const blockingReasons: BlockingReason[] = [];
    
    for (const rule of this.blockRules) {
      if (this.config.disabledRules?.includes(rule.id)) continue;

      const triggered = rule.condition({
        signals,
        receipts: receipts as unknown[],
        context: context as Record<string, unknown>,
      });

      if (triggered) {
        // Find receipts that provide evidence for this rule
        const evidenceReceipts = this.findEvidenceReceipts(receipts, rule);
        
        blockingReasons.push({
          ruleId: rule.id,
          message: rule.description,
          receiptIds: evidenceReceipts.map(r => r.receiptId),
          severity: rule.severity,
        });
      }
    }

    // If any BLOCK rule triggered, return BLOCK verdict
    if (blockingReasons.length > 0) {
      return this.createBlockedResult(blockingReasons, receipts.length, timestamp);
    }

    // Evaluate WARN rules
    const warnings: Array<{
      ruleId: string;
      message: string;
      receiptIds: string[];
    }> = [];

    for (const rule of this.warnRules) {
      if (this.config.disabledRules?.includes(rule.id)) continue;

      const triggered = rule.condition({
        signals,
        receipts: receipts as unknown[],
        context: context as Record<string, unknown>,
      });

      if (triggered) {
        const evidenceReceipts = this.findEvidenceReceipts(receipts, rule);
        
        warnings.push({
          ruleId: rule.id,
          message: rule.description,
          receiptIds: evidenceReceipts.map(r => r.receiptId),
        });
      }
    }

    // Determine verdict
    const verdict: ShipVerdict = warnings.length > 0 ? 'WARN' : 'SHIP';

    // Build recommended actions
    const recommendedActions = this.buildRecommendedActions(warnings, context);

    return {
      verdict,
      blockingReasons: [],
      warnings,
      recommendedActions,
      receiptsEvaluated: receipts.length,
      timestamp,
    };
  }

  /**
   * Check if ship is allowed (quick boolean check)
   */
  canShip(receipts: Receipt[], context: EvaluationContext = {}): boolean {
    const result = this.evaluate(receipts, context);
    return result.verdict !== 'BLOCK';
  }

  /**
   * Get all active rules
   */
  getRules(): { block: PolicyRule[]; warn: PolicyRule[] } {
    return {
      block: this.blockRules.filter(r => !this.config.disabledRules?.includes(r.id)),
      warn: this.warnRules.filter(r => !this.config.disabledRules?.includes(r.id)),
    };
  }

  /**
   * Add a custom rule at runtime
   */
  addRule(rule: PolicyRule): void {
    if (rule.type === 'BLOCK') {
      this.blockRules.push(rule);
    } else {
      this.warnRules.push(rule);
    }
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private buildBlockRules(): PolicyRule[] {
    const rules = [...BLOCK_RULES];
    
    if (this.config.customBlockRules) {
      rules.push(...this.config.customBlockRules);
    }

    // In paranoid mode, promote some WARN rules to BLOCK
    if (this.config.strictness === 'paranoid') {
      const promotedRules: PolicyRule[] = [
        {
          ...WARN_RULES.find(r => r.id === 'flaky-tests')!,
          type: 'BLOCK',
          severity: 'high',
        },
        {
          ...WARN_RULES.find(r => r.id === 'console-errors')!,
          type: 'BLOCK',
          severity: 'high',
        },
      ].filter(Boolean);
      
      rules.push(...promotedRules);
    }

    return rules;
  }

  private buildWarnRules(): PolicyRule[] {
    const rules = [...WARN_RULES];
    
    if (this.config.customWarnRules) {
      rules.push(...this.config.customWarnRules);
    }

    // In relaxed mode, demote some WARN rules
    if (this.config.strictness === 'relaxed') {
      // Remove some rules in relaxed mode
      const relaxedExclusions = ['low-coverage', 'performance-regression'];
      return rules.filter(r => !relaxedExclusions.includes(r.id));
    }

    return rules;
  }

  private aggregateSignals(receipts: Receipt[]): Record<string, boolean | number> {
    const signals: Record<string, boolean | number> = {};

    for (const receipt of receipts) {
      for (const signal of receipt.signals) {
        // Use most recent value for duplicate signals
        signals[signal.id] = signal.value;
      }
    }

    return signals;
  }

  private addContextSignals(
    signals: Record<string, boolean | number>,
    context: EvaluationContext
  ): void {
    // Add signals from static findings
    if (context.staticFindings) {
      const criticalCount = context.staticFindings.filter(
        f => f.severity === 'critical'
      ).length;
      const highCount = context.staticFindings.filter(
        f => f.severity === 'high'
      ).length;

      signals['static.findings.critical'] = criticalCount;
      signals['static.findings.high'] = highCount;
      signals['static.findings.any'] = context.staticFindings.length > 0;
    }

    // Add signals from diff
    if (context.diffSummary) {
      signals['diff.filesChanged'] = context.diffSummary.filesChanged;
      signals['diff.linesAdded'] = context.diffSummary.linesAdded;
      signals['diff.linesRemoved'] = context.diffSummary.linesRemoved;
      signals['diff.large'] = 
        context.diffSummary.linesAdded + context.diffSummary.linesRemoved > 500;
    }
  }

  private checkRequiredReceipts(receipts: Receipt[]): string[] {
    if (!this.config.requiredReceipts || this.config.requiredReceipts.length === 0) {
      return [];
    }

    const presentKinds = new Set(receipts.map(r => r.kind));
    return this.config.requiredReceipts.filter(kind => !presentKinds.has(kind as Receipt['kind']));
  }

  private findEvidenceReceipts(receipts: Receipt[], rule: PolicyRule): Receipt[] {
    // Find receipts whose signals relate to this rule
    return receipts.filter(receipt => {
      // Check if any signal in this receipt is related to the rule
      return receipt.signals.some(signal => 
        signal.id.toLowerCase().includes(rule.category) ||
        rule.id.includes(receipt.kind)
      );
    });
  }

  private createBlockedResult(
    blockingReasons: BlockingReason[],
    receiptsEvaluated: number,
    timestamp: string
  ): ShipGateResult {
    return {
      verdict: 'BLOCK',
      blockingReasons,
      warnings: [],
      recommendedActions: blockingReasons.map(reason => ({
        action: `Fix: ${reason.message}`,
        priority: reason.severity === 'critical' ? 'high' as const : 'medium' as const,
      })),
      receiptsEvaluated,
      timestamp,
    };
  }

  private buildRecommendedActions(
    warnings: Array<{ ruleId: string; message: string }>,
    context: EvaluationContext
  ): ShipGateResult['recommendedActions'] {
    const actions: ShipGateResult['recommendedActions'] = [];

    for (const warning of warnings) {
      actions.push({
        action: `Address warning: ${warning.message}`,
        priority: 'medium',
      });
    }

    // Add context-based recommendations
    if (context.diffSummary && context.diffSummary.filesChanged > 20) {
      actions.push({
        action: 'Consider splitting this change into smaller PRs',
        priority: 'low',
      });
    }

    return actions;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createShipGate(config?: ShipGateConfig): ShipGateEngine {
  return new ShipGateEngine(config ?? { strictness: 'standard' });
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a custom BLOCK rule
 */
export function createBlockRule(
  id: string,
  description: string,
  condition: (ctx: { signals: Record<string, boolean | number>; receipts: unknown[] }) => boolean,
  options: {
    severity?: 'critical' | 'high' | 'medium';
    category?: 'test' | 'runtime' | 'security' | 'quality' | 'performance';
  } = {}
): PolicyRule {
  return {
    id,
    type: 'BLOCK',
    description,
    severity: options.severity ?? 'high',
    category: options.category ?? 'quality',
    condition: condition as PolicyRule['condition'],
  };
}

/**
 * Create a custom WARN rule
 */
export function createWarnRule(
  id: string,
  description: string,
  condition: (ctx: { signals: Record<string, boolean | number>; receipts: unknown[] }) => boolean,
  options: {
    severity?: 'critical' | 'high' | 'medium';
    category?: 'test' | 'runtime' | 'security' | 'quality' | 'performance';
  } = {}
): PolicyRule {
  return {
    id,
    type: 'WARN',
    description,
    severity: options.severity ?? 'medium',
    category: options.category ?? 'quality',
    condition: condition as PolicyRule['condition'],
  };
}

/**
 * Format ship gate result for display
 */
export function formatShipGateResult(result: ShipGateResult): string {
  const icon = result.verdict === 'SHIP' ? '✅' : result.verdict === 'WARN' ? '⚠️' : '❌';
  const lines: string[] = [
    `${icon} Ship Gate Verdict: ${result.verdict}`,
    `   Receipts evaluated: ${result.receiptsEvaluated}`,
    '',
  ];

  if (result.blockingReasons.length > 0) {
    lines.push('Blocking Reasons:');
    for (const reason of result.blockingReasons) {
      lines.push(`  ❌ [${reason.severity}] ${reason.message}`);
      if (reason.receiptIds.length > 0) {
        lines.push(`     Evidence: ${reason.receiptIds.join(', ')}`);
      }
    }
    lines.push('');
  }

  if (result.warnings.length > 0) {
    lines.push('Warnings:');
    for (const warning of result.warnings) {
      lines.push(`  ⚠️ ${warning.message}`);
    }
    lines.push('');
  }

  if (result.recommendedActions.length > 0) {
    lines.push('Recommended Actions:');
    for (const action of result.recommendedActions) {
      const priorityIcon = action.priority === 'high' ? '🔴' : 
                           action.priority === 'medium' ? '🟡' : '🔵';
      lines.push(`  ${priorityIcon} ${action.action}`);
    }
  }

  return lines.join('\n');
}
