/**
 * Policy Engine
 * 
 * Evaluates firewall policies against claims and evidence
 * to make allow/deny decisions.
 * 
 * Includes comprehensive input validation and safe defaults.
 */

import type { Intent } from './intent-validator.js';
import type { Claim } from './claim-extractor.js';
import type { Evidence } from './evidence-resolver.js';
import type { FirewallConfig } from './agent-firewall.js';

/**
 * Safety limits for policy evaluation
 */
const POLICY_LIMITS = {
  MAX_POLICIES: 50,
  MAX_CLAIMS_TO_EVALUATE: 100,
  MAX_EVIDENCE_TO_CHECK: 200,
  MAX_VIOLATIONS: 50,
  MAX_MESSAGE_LENGTH: 500,
  EVALUATION_TIMEOUT_MS: 5000,
} as const;

/**
 * Valid severity levels
 */
const VALID_SEVERITIES = ['error', 'warning', 'info'] as const;
type PolicySeverity = typeof VALID_SEVERITIES[number];

export interface Policy {
  name: string;
  description: string;
  severity: PolicySeverity;
  evaluate: (context: PolicyContext) => PolicyViolation | null;
}

export interface PolicyContext {
  intent: { valid: boolean; intent: Intent };
  claims: Claim[];
  evidence: Evidence[];
  config: FirewallConfig;
}

export interface PolicyViolation {
  policy: string;
  severity: PolicySeverity;
  message: string;
  claim?: Claim;
  suggestion?: string;
}

export interface PolicyDecision {
  allowed: boolean;
  reason: string;
  violations: PolicyViolation[];
  confidence: number;
  evaluationTimeMs?: number;
}

/**
 * Validate that a value is a valid severity
 */
function isValidSeverity(value: unknown): value is PolicySeverity {
  return typeof value === 'string' && VALID_SEVERITIES.includes(value as PolicySeverity);
}

/**
 * Sanitize a message string
 */
function sanitizeMessage(message: string): string {
  if (typeof message !== 'string') return '';
  return message.slice(0, POLICY_LIMITS.MAX_MESSAGE_LENGTH).replace(/[<>]/g, '');
}

export class PolicyEngine {
  private policies: Policy[] = [];

  constructor() {
    this.initializeDefaultPolicies();
  }

  /**
   * Evaluate all policies against the context with safety checks
   */
  async evaluate(context: PolicyContext): Promise<PolicyDecision> {
    const startTime = Date.now();
    const violations: PolicyViolation[] = [];

    // Validate context
    if (!context || typeof context !== 'object') {
      return {
        allowed: false,
        reason: 'Invalid policy context',
        violations: [{
          policy: 'validation',
          severity: 'error',
          message: 'Invalid policy context provided',
        }],
        confidence: 0,
        evaluationTimeMs: Date.now() - startTime,
      };
    }

    // Limit claims and evidence to prevent DoS
    const limitedClaims = (context.claims ?? []).slice(0, POLICY_LIMITS.MAX_CLAIMS_TO_EVALUATE);
    const limitedEvidence = (context.evidence ?? []).slice(0, POLICY_LIMITS.MAX_EVIDENCE_TO_CHECK);
    
    const safeContext: PolicyContext = {
      ...context,
      claims: limitedClaims,
      evidence: limitedEvidence,
    };

    // Evaluate policies with error handling
    for (const policy of this.policies) {
      // Check timeout
      if (Date.now() - startTime > POLICY_LIMITS.EVALUATION_TIMEOUT_MS) {
        violations.push({
          policy: 'timeout',
          severity: 'warning',
          message: 'Policy evaluation timed out',
        });
        break;
      }

      try {
        const violation = policy.evaluate(safeContext);
        if (violation) {
          // Validate and sanitize violation
          violations.push({
            policy: sanitizeMessage(violation.policy || policy.name),
            severity: isValidSeverity(violation.severity) ? violation.severity : 'warning',
            message: sanitizeMessage(violation.message),
            claim: violation.claim,
            suggestion: violation.suggestion ? sanitizeMessage(violation.suggestion) : undefined,
          });

          // Limit violations
          if (violations.length >= POLICY_LIMITS.MAX_VIOLATIONS) {
            violations.push({
              policy: 'limit',
              severity: 'warning',
              message: `Maximum violations (${POLICY_LIMITS.MAX_VIOLATIONS}) reached`,
            });
            break;
          }
        }
      } catch (error) {
        // Log but don't fail on individual policy errors
        violations.push({
          policy: policy.name,
          severity: 'warning',
          message: `Policy evaluation error: ${error instanceof Error ? error.message : 'unknown'}`,
        });
      }
    }

    const errors = violations.filter((v) => v.severity === 'error');
    const strictMode = context.config?.strictMode ?? false;
    const allowed = strictMode ? errors.length === 0 : true;

    const evaluationTimeMs = Date.now() - startTime;

    return {
      allowed,
      reason: errors.length > 0 
        ? sanitizeMessage(`Blocked: ${errors.map((e) => e.message).join('; ')}`)
        : 'Allowed',
      violations,
      confidence: this.calculateConfidence(safeContext, violations),
      evaluationTimeMs,
    };
  }

  /**
   * Add a custom policy with validation
   */
  addPolicy(policy: Policy): void {
    // Validate policy
    if (!policy || typeof policy !== 'object') {
      throw new Error('Invalid policy object');
    }
    if (!policy.name || typeof policy.name !== 'string') {
      throw new Error('Policy must have a name');
    }
    if (!isValidSeverity(policy.severity)) {
      throw new Error(`Invalid severity: ${policy.severity}`);
    }
    if (typeof policy.evaluate !== 'function') {
      throw new Error('Policy must have an evaluate function');
    }

    // Check limit
    if (this.policies.length >= POLICY_LIMITS.MAX_POLICIES) {
      throw new Error(`Maximum policies (${POLICY_LIMITS.MAX_POLICIES}) reached`);
    }

    // Check for duplicate
    if (this.policies.some((p) => p.name === policy.name)) {
      throw new Error(`Policy with name "${policy.name}" already exists`);
    }

    this.policies.push(policy);
  }

  /**
   * Remove a policy by name
   */
  removePolicy(name: string): boolean {
    if (!name || typeof name !== 'string') {
      return false;
    }
    const initialLength = this.policies.length;
    this.policies = this.policies.filter((p) => p.name !== name);
    return this.policies.length < initialLength;
  }

  /**
   * Get all registered policies (readonly)
   */
  getPolicies(): readonly Policy[] {
    return [...this.policies];
  }

  private initializeDefaultPolicies(): void {
    this.policies = [
      // Ghost Route - Block API calls to undefined routes
      {
        name: 'ghost-route',
        description: 'Block references to non-existent API endpoints',
        severity: 'error',
        evaluate: (ctx) => {
          const ghostRoutes = ctx.claims
            .filter((c) => c.type === 'api_endpoint')
            .filter((c) => !ctx.evidence.find((e) => e.claimId === c.id && e.found));

          if (ghostRoutes.length > 0) {
            return {
              policy: 'ghost-route',
              severity: 'error',
              message: `GHOST ROUTE: ${ghostRoutes.map((c) => c.value).join(', ')}`,
              claim: ghostRoutes[0],
              suggestion: `Register route: vibecheck register route "${ghostRoutes[0].value}"`,
            };
          }
          return null;
        },
      },
      // Ghost Env - Block usage of undeclared env vars
      {
        name: 'ghost-env',
        description: 'Block usage of undeclared environment variables',
        severity: 'error',
        evaluate: (ctx) => {
          const ghostEnvVars = ctx.claims
            .filter((c) => c.type === 'env_variable')
            .filter((c) => !ctx.evidence.find((e) => e.claimId === c.id && e.found));

          if (ghostEnvVars.length > 0) {
            return {
              policy: 'ghost-env',
              severity: 'error',
              message: `GHOST ENV: ${ghostEnvVars.map((c) => c.value).join(', ')}`,
              claim: ghostEnvVars[0],
              suggestion: `Register env var: vibecheck register env "${ghostEnvVars[0].value}"`,
            };
          }
          return null;
        },
      },
      // Ghost Type - Warn on undefined type references
      {
        name: 'ghost-type',
        description: 'Warn when referencing undefined types',
        severity: 'warning',
        evaluate: (ctx) => {
          const ghostTypes = ctx.claims
            .filter((c) => c.type === 'type_reference')
            .filter((c) => !ctx.evidence.find((e) => e.claimId === c.id && e.found));

          if (ghostTypes.length > 0) {
            return {
              policy: 'ghost-type',
              severity: 'warning',
              message: `GHOST TYPE: ${ghostTypes.map((c) => c.value).join(', ')}`,
              claim: ghostTypes[0],
              suggestion: `Define type in contracts or ensure import exists`,
            };
          }
          return null;
        },
      },
      // Ghost Import - Block imports that cannot be verified
      {
        name: 'ghost-import',
        description: 'Block imports that cannot be verified',
        severity: 'error',
        evaluate: (ctx) => {
          const ghostImports = ctx.claims
            .filter((c) => c.type === 'import' || c.type === 'package_dependency')
            .filter((c) => !ctx.evidence.find((e) => e.claimId === c.id && e.found));

          if (ghostImports.length > 0) {
            return {
              policy: 'ghost-import',
              severity: 'error',
              message: `GHOST IMPORT: ${ghostImports.map((c) => c.value).join(', ')}`,
              claim: ghostImports[0],
              suggestion: 'Verify packages exist in package.json or are valid local imports',
            };
          }
          return null;
        },
      },
      // Ghost File - Block references to non-existent files
      {
        name: 'ghost-file',
        description: 'Block references to non-existent files',
        severity: 'error',
        evaluate: (ctx) => {
          const ghostFiles = ctx.claims
            .filter((c) => c.type === 'file_reference')
            .filter((c) => !ctx.evidence.find((e) => e.claimId === c.id && e.found));

          if (ghostFiles.length > 0) {
            return {
              policy: 'ghost-file',
              severity: 'error',
              message: `GHOST FILE: ${ghostFiles.map((c) => c.value).join(', ')}`,
              claim: ghostFiles[0],
              suggestion: 'Ensure file exists or create it before referencing',
            };
          }
          return null;
        },
      },
      // Low Confidence - Warn about claims with low confidence
      {
        name: 'low-confidence',
        description: 'Warn about claims with low confidence',
        severity: 'warning',
        evaluate: (ctx) => {
          const lowConfidence = ctx.claims.filter((c) => c.confidence < 0.5);
          if (lowConfidence.length > ctx.claims.length * 0.3 && ctx.claims.length > 3) {
            return {
              policy: 'low-confidence',
              severity: 'warning',
              message: `${lowConfidence.length} of ${ctx.claims.length} claims have low confidence`,
              suggestion: 'Consider adding more context to improve verification',
            };
          }
          return null;
        },
      },
      // Excessive Claims - Warn when too many claims in one change
      {
        name: 'excessive-claims',
        description: 'Warn when change has too many unverified claims',
        severity: 'warning',
        evaluate: (ctx) => {
          const unverifiedCount = ctx.claims.filter(
            (c) => !ctx.evidence.find((e) => e.claimId === c.id && e.found)
          ).length;

          if (unverifiedCount > 10) {
            return {
              policy: 'excessive-claims',
              severity: 'warning',
              message: `${unverifiedCount} unverified claims - consider breaking into smaller changes`,
              suggestion: 'Large changes with many unverified claims are risky',
            };
          }
          return null;
        },
      },
    ];
  }

  private calculateConfidence(context: PolicyContext, violations: PolicyViolation[]): number {
    const evidenceConfidence = context.evidence.length > 0
      ? context.evidence.reduce((sum, e) => sum + e.confidence, 0) / context.evidence.length
      : 0;

    const violationPenalty = violations.reduce((sum, v) => {
      if (v.severity === 'error') return sum + 0.3;
      if (v.severity === 'warning') return sum + 0.1;
      return sum;
    }, 0);

    return Math.max(0, Math.min(1, evidenceConfidence - violationPenalty));
  }
}
