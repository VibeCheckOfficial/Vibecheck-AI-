/**
 * Policy System
 * 
 * YAML-first policy format with ESLint-style inheritance.
 */

export * from './types.js';
export {
  policyRuleSchema,
  policyConfigSchema,
  validateRule,
  validatePolicy,
  createDefaultPolicy,
  EXAMPLE_POLICY,
} from './schema.js';
export { PolicyParser, createPolicyParser } from './parser.js';
export { PolicyResolver, createPolicyResolver } from './resolver.js';

import { PolicyParser, createPolicyParser } from './parser.js';
import { PolicyResolver, createPolicyResolver } from './resolver.js';
import type {
  PolicyConfig,
  PolicyRule,
  PolicyMatch,
  ResolvedPolicy,
  PolicyLoadOptions,
} from './types.js';

interface PolicyEngineOptions extends PolicyLoadOptions {
  /** Built-in presets */
  presets?: Record<string, PolicyConfig>;
}

/**
 * Policy Engine
 * 
 * High-level interface for policy loading, resolution, and matching.
 */
export class PolicyEngine {
  private parser: PolicyParser;
  private resolver: PolicyResolver;

  constructor(options: Partial<PolicyEngineOptions> = {}) {
    this.parser = createPolicyParser(options);
    this.resolver = createPolicyResolver(options);
  }

  /**
   * Load and resolve a policy configuration
   */
  async loadPolicy(source: string | PolicyConfig): Promise<ResolvedPolicy> {
    return this.resolver.resolve(source);
  }

  /**
   * Load and resolve multiple policies
   */
  async loadPolicies(sources: Array<string | PolicyConfig>): Promise<ResolvedPolicy> {
    return this.resolver.resolveAll(sources);
  }

  /**
   * Match rules against a file
   */
  matchFile(
    policy: ResolvedPolicy,
    filePath: string,
    content: string
  ): PolicyMatch[] {
    return this.parser.matchRules(policy.rules, filePath, content);
  }

  /**
   * Match rules against multiple files
   */
  async matchFiles(
    policy: ResolvedPolicy,
    files: Array<{ path: string; content: string }>
  ): Promise<Map<string, PolicyMatch[]>> {
    const results = new Map<string, PolicyMatch[]>();

    for (const file of files) {
      const matches = this.matchFile(policy, file.path, file.content);
      if (matches.length > 0) {
        results.set(file.path, matches);
      }
    }

    return results;
  }

  /**
   * Get available presets
   */
  getPresets(): string[] {
    return this.resolver.getPresetNames();
  }

  /**
   * Register a custom preset
   */
  registerPreset(name: string, config: PolicyConfig): void {
    this.resolver.registerPreset(name, config);
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.parser.clearCache();
    this.resolver.clearCache();
  }
}

// Global policy engine instance
let globalEngine: PolicyEngine | null = null;

/**
 * Get or create the global policy engine
 */
export function getPolicyEngine(options?: Partial<PolicyEngineOptions>): PolicyEngine {
  if (!globalEngine) {
    globalEngine = new PolicyEngine(options);
  }
  return globalEngine;
}

/**
 * Create a new policy engine instance
 */
export function createPolicyEngine(options?: Partial<PolicyEngineOptions>): PolicyEngine {
  return new PolicyEngine(options);
}

/**
 * Reset the global policy engine
 */
export function resetPolicyEngine(): void {
  if (globalEngine) {
    globalEngine.clearCache();
    globalEngine = null;
  }
}
