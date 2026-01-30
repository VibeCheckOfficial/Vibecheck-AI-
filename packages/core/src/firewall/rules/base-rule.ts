/**
 * Base Rule
 * 
 * Abstract base class for firewall rules.
 */

import type { Policy, PolicyContext, PolicyViolation } from '../policy-engine.js';

export interface RuleConfig {
  enabled: boolean;
  severity: 'error' | 'warning' | 'info';
  allowList?: string[];
  denyList?: string[];
}

export abstract class BaseRule {
  abstract name: string;
  abstract description: string;
  protected config: RuleConfig;

  constructor(config: Partial<RuleConfig> = {}) {
    this.config = {
      enabled: true,
      severity: 'error',
      ...config,
    };
  }

  /**
   * Evaluate the rule against the context
   */
  abstract evaluate(context: PolicyContext): PolicyViolation | null;

  /**
   * Check if a value is in the allow list
   */
  protected isAllowed(value: string): boolean {
    if (!this.config.allowList) return false;
    return this.config.allowList.some(pattern => 
      this.matchPattern(value, pattern)
    );
  }

  /**
   * Check if a value is in the deny list
   */
  protected isDenied(value: string): boolean {
    if (!this.config.denyList) return false;
    return this.config.denyList.some(pattern => 
      this.matchPattern(value, pattern)
    );
  }

  /**
   * Match a value against a pattern (supports * wildcard)
   */
  protected matchPattern(value: string, pattern: string): boolean {
    if (pattern === '*') return true;
    if (pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      return regex.test(value);
    }
    return value === pattern;
  }

  /**
   * Convert to Policy interface for PolicyEngine
   */
  toPolicy(): Policy {
    return {
      name: this.name,
      description: this.description,
      severity: this.config.severity,
      evaluate: (context: PolicyContext) => {
        if (!this.config.enabled) return null;
        return this.evaluate(context);
      },
    };
  }

  /**
   * Create a violation object
   */
  protected createViolation(
    message: string,
    claim?: PolicyContext['claims'][0],
    suggestion?: string
  ): PolicyViolation {
    return {
      policy: this.name,
      severity: this.config.severity,
      message,
      claim,
      suggestion,
    };
  }
}
