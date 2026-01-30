/**
 * Auth Drift Rule
 * 
 * Detects changes to authentication patterns that may introduce security issues.
 * Prevents accidental removal or weakening of auth controls by analyzing:
 * - Removal of auth middleware from routes
 * - Addition of auth bypass patterns
 * - Changes to protected resource configurations
 * 
 * @module firewall/rules/auth-drift
 */

import type { PolicyContext, PolicyViolation } from '../policy-engine.js';
import { BaseRule, type RuleConfig } from './base-rule.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration options for the AuthDriftRule
 */
export interface AuthDriftConfig extends RuleConfig {
  /** Keywords that indicate auth-related code */
  authKeywords?: string[];
  /** Patterns that should trigger alerts */
  sensitivePatterns?: RegExp[];
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default configuration for auth drift detection
 */
const DEFAULT_CONFIG: AuthDriftConfig = {
  enabled: true,
  severity: 'warning',
  authKeywords: [
    'authenticate',
    'authorize',
    'requireAuth',
    'isAuthenticated',
    'checkPermission',
    'requireRole',
    'verifyToken',
    'validateSession',
    'middleware',
    'guard',
  ],
  sensitivePatterns: [
    /auth\s*=\s*false/i,
    /skipAuth/i,
    /noAuth/i,
    /bypassAuth/i,
    /requireAuth\s*:\s*false/i,
    /isPublic\s*:\s*true/i,
  ],
};

// ============================================================================
// Rule Implementation
// ============================================================================

/**
 * Rule that detects potentially dangerous changes to authentication patterns.
 * 
 * Analyzes code changes to identify:
 * - Suspicious auth bypass patterns (skipAuth, noAuth, etc.)
 * - Missing auth imports that were previously present
 * - Routes losing their authentication protection
 * 
 * @example
 * const rule = new AuthDriftRule();
 * const violation = rule.evaluate(context);
 * if (violation) {
 *   console.warn(violation.message);
 * }
 */
export class AuthDriftRule extends BaseRule {
  readonly name = 'auth-drift';
  readonly description = 'Detect potentially dangerous changes to authentication patterns';
  protected config: AuthDriftConfig;

  /**
   * Creates a new AuthDriftRule instance.
   * 
   * @param config - Optional configuration overrides
   */
  constructor(config: Partial<AuthDriftConfig> = {}) {
    super(config);
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Evaluates the policy context for authentication drift violations.
   * 
   * Checks for:
   * 1. Suspicious auth bypass patterns in code
   * 2. Missing auth-related imports
   * 3. Protected routes losing authentication
   * 
   * @param context - The policy context containing claims and evidence
   * @returns A violation if found, or null if no issues detected
   * 
   * @example
   * const violation = rule.evaluate(context);
   * if (violation) {
   *   // Handle the security concern
   * }
   */
  evaluate(context: PolicyContext): PolicyViolation | null {
    // Check for suspicious patterns in claim contexts
    for (const claim of context.claims) {
      const suspiciousMatch = this.hasSuspiciousPattern(claim.context);
      if (suspiciousMatch) {
        return this.createViolation(
          `AUTH DRIFT: Suspicious auth pattern detected: "${suspiciousMatch}"`,
          claim,
          'Review this change carefully - it may weaken authentication controls'
        );
      }
    }

    // Check for auth-related imports that might be removed or modified
    const authImports = context.claims.filter(c => 
      c.type === 'import' && this.isAuthRelated(c.value)
    );

    // Check if auth imports have evidence (exist)
    for (const authImport of authImports) {
      const evidence = context.evidence.find(e => e.claimId === authImport.id);
      if (!evidence || !evidence.found) {
        return this.createViolation(
          `AUTH DRIFT: Auth-related import not found: ${authImport.value}`,
          authImport,
          'Ensure authentication middleware/utilities are properly imported'
        );
      }
    }

    // Check protected routes against truthpack
    const protectedRouteChanges = this.detectProtectedRouteChanges(context);
    if (protectedRouteChanges) {
      return protectedRouteChanges;
    }

    return null;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Checks if text contains auth-related keywords.
   * 
   * @param text - Text to analyze
   * @returns True if any auth keywords are found
   */
  private isAuthRelated(text: string): boolean {
    if (!text) return false;
    const keywords = this.config.authKeywords ?? [];
    const lowerText = text.toLowerCase();
    return keywords.some(keyword => lowerText.includes(keyword.toLowerCase()));
  }

  /**
   * Checks if text contains suspicious auth bypass patterns.
   * 
   * @param text - Text to analyze
   * @returns The matched pattern string, or null if no match
   */
  private hasSuspiciousPattern(text: string): string | null {
    if (!text) return null;
    const patterns = this.config.sensitivePatterns ?? [];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return match[0];
      }
    }
    return null;
  }

  /**
   * Detects changes to protected routes that may remove authentication.
   * 
   * @param context - Policy context with claims and evidence
   * @returns Violation if protected route is losing auth, null otherwise
   */
  private detectProtectedRouteChanges(context: PolicyContext): PolicyViolation | null {
    // Look for route claims that should be protected
    const routeClaims = context.claims.filter(c => c.type === 'api_endpoint');
    
    // Get auth-related evidence from truthpack
    const authEvidence = context.evidence.filter(e => 
      e.details && 'requiredRoles' in e.details
    );

    // If we have routes but no auth evidence, and context mentions auth removal
    if (routeClaims.length > 0 && authEvidence.length === 0) {
      // Check if the context mentions removing or disabling auth
      for (const claim of routeClaims) {
        if (this.hasSuspiciousPattern(claim.context)) {
          return this.createViolation(
            `AUTH DRIFT: Route "${claim.value}" may have authentication removed`,
            claim,
            'Verify this route should be public. Protected routes should use auth middleware.'
          );
        }
      }
    }

    return null;
  }
}
