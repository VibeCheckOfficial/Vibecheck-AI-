/**
 * Policy Resolver
 * 
 * Resolves policy inheritance and merges multiple policies.
 * Follows ESLint-style extends pattern.
 */

import type {
  PolicyConfig,
  PolicyRule,
  ResolvedPolicy,
  PolicyLoadOptions,
  PolicySource,
} from './types.js';
import { PolicyParser, createPolicyParser } from './parser.js';

interface PolicyResolverOptions extends PolicyLoadOptions {
  /** Built-in presets */
  presets?: Record<string, PolicyConfig>;
}

/**
 * Policy Resolver
 * 
 * Resolves policy inheritance chains and merges configurations.
 * Inheritance order: earlier entries are base, later entries override.
 */
export class PolicyResolver {
  private parser: PolicyParser;
  private presets: Map<string, PolicyConfig>;
  private resolvedCache: Map<string, ResolvedPolicy> = new Map();

  constructor(options: Partial<PolicyResolverOptions> = {}) {
    this.parser = createPolicyParser(options);
    this.presets = new Map(Object.entries(options.presets ?? {}));

    // Add built-in presets
    this.registerBuiltinPresets();
  }

  /**
   * Resolve a policy with all its extensions
   */
  async resolve(source: string | PolicyConfig): Promise<ResolvedPolicy> {
    const cacheKey = typeof source === 'string' ? source : JSON.stringify(source);
    
    // Check cache
    if (this.resolvedCache.has(cacheKey)) {
      return this.resolvedCache.get(cacheKey)!;
    }

    // Load the root policy
    const config = typeof source === 'string'
      ? await this.loadPolicy(source)
      : source;

    // Collect all configs in inheritance order
    const configs: Array<{ source: string; config: PolicyConfig }> = [];
    await this.collectConfigs(config, configs, new Set());

    // Merge configs
    const resolved = this.mergeConfigs(configs);

    // Cache result
    this.resolvedCache.set(cacheKey, resolved);

    return resolved;
  }

  /**
   * Resolve multiple policies and merge them
   */
  async resolveAll(sources: Array<string | PolicyConfig>): Promise<ResolvedPolicy> {
    const resolvedPolicies: ResolvedPolicy[] = [];

    for (const source of sources) {
      const resolved = await this.resolve(source);
      resolvedPolicies.push(resolved);
    }

    // Merge all resolved policies
    return this.mergeResolvedPolicies(resolvedPolicies);
  }

  /**
   * Register a preset policy
   */
  registerPreset(name: string, config: PolicyConfig): void {
    this.presets.set(name, config);
  }

  /**
   * Get available preset names
   */
  getPresetNames(): string[] {
    return Array.from(this.presets.keys());
  }

  /**
   * Clear resolution cache
   */
  clearCache(): void {
    this.resolvedCache.clear();
    this.parser.clearCache();
  }

  private async loadPolicy(source: string): Promise<PolicyConfig> {
    // Check presets first
    if (this.presets.has(source)) {
      return this.presets.get(source)!;
    }

    // Check for vibecheck: prefix for built-in presets
    if (source.startsWith('vibecheck:')) {
      const presetName = source.replace('vibecheck:', '');
      if (this.presets.has(presetName)) {
        return this.presets.get(presetName)!;
      }
      throw new Error(`Unknown preset: ${source}`);
    }

    const result = await this.parser.loadPolicy(source);
    if (result.error || !result.config) {
      throw new Error(`Failed to load policy ${source}: ${result.error}`);
    }
    return result.config;
  }

  private async collectConfigs(
    config: PolicyConfig,
    result: Array<{ source: string; config: PolicyConfig }>,
    visited: Set<string>
  ): Promise<void> {
    // Process extends first (base configs come first)
    if (config.extends) {
      for (const ext of config.extends) {
        if (visited.has(ext)) {
          continue; // Skip circular references
        }
        visited.add(ext);

        const extConfig = await this.loadPolicy(ext);
        await this.collectConfigs(extConfig, result, visited);
      }
    }

    // Add this config last (it overrides bases)
    result.push({
      source: config.name ?? 'inline',
      config,
    });
  }

  private mergeConfigs(
    configs: Array<{ source: string; config: PolicyConfig }>
  ): ResolvedPolicy {
    const sources: string[] = [];
    const rulesById = new Map<string, PolicyRule>();
    const includePatterns = new Set<string>();
    const excludePatterns = new Set<string>();
    const options: Record<string, unknown> = {};
    const disabledRules = new Set<string>();
    const severityOverrides = new Map<string, PolicyConfig['rules'][0]['severity']>();

    for (const { source, config } of configs) {
      sources.push(source);

      // Merge rules (later configs override)
      for (const rule of config.rules) {
        rulesById.set(rule.id, { ...rulesById.get(rule.id), ...rule });
      }

      // Merge paths
      if (config.paths?.include) {
        for (const pattern of config.paths.include) {
          includePatterns.add(pattern);
        }
      }
      if (config.paths?.exclude) {
        for (const pattern of config.paths.exclude) {
          excludePatterns.add(pattern);
        }
      }

      // Merge options
      if (config.options) {
        Object.assign(options, config.options);
      }

      // Merge disabled rules
      if (config.disabledRules) {
        for (const ruleId of config.disabledRules) {
          disabledRules.add(ruleId);
        }
      }

      // Apply severity overrides
      if (config.severityOverrides) {
        for (const [ruleId, severity] of Object.entries(config.severityOverrides)) {
          severityOverrides.set(ruleId, severity);
        }
      }
    }

    // Apply severity overrides and filter disabled rules
    const rules: PolicyRule[] = [];
    for (const [id, rule] of rulesById) {
      if (disabledRules.has(id)) {
        continue;
      }

      const finalRule = { ...rule };
      if (severityOverrides.has(id)) {
        finalRule.severity = severityOverrides.get(id)!;
      }

      rules.push(finalRule);
    }

    return {
      sources,
      rules,
      paths: {
        include: Array.from(includePatterns),
        exclude: Array.from(excludePatterns),
      },
      options,
      disabledRules,
    };
  }

  private mergeResolvedPolicies(policies: ResolvedPolicy[]): ResolvedPolicy {
    const sources: string[] = [];
    const rulesById = new Map<string, PolicyRule>();
    const includePatterns = new Set<string>();
    const excludePatterns = new Set<string>();
    const options: Record<string, unknown> = {};
    const disabledRules = new Set<string>();

    for (const policy of policies) {
      sources.push(...policy.sources);

      for (const rule of policy.rules) {
        rulesById.set(rule.id, { ...rulesById.get(rule.id), ...rule });
      }

      for (const pattern of policy.paths.include) {
        includePatterns.add(pattern);
      }
      for (const pattern of policy.paths.exclude) {
        excludePatterns.add(pattern);
      }

      Object.assign(options, policy.options);

      for (const ruleId of policy.disabledRules) {
        disabledRules.add(ruleId);
      }
    }

    // Filter disabled rules
    const rules = Array.from(rulesById.values()).filter(
      (rule) => !disabledRules.has(rule.id)
    );

    return {
      sources,
      rules,
      paths: {
        include: Array.from(includePatterns),
        exclude: Array.from(excludePatterns),
      },
      options,
      disabledRules,
    };
  }

  private registerBuiltinPresets(): void {
    // Recommended security rules
    this.presets.set('recommended', {
      name: 'vibecheck:recommended',
      rules: [
        {
          id: 'no-hardcoded-secrets',
          severity: 'error',
          message: 'Detected hardcoded secret',
          patternEither: [
            'password = "$SECRET"',
            'apiKey = "$SECRET"',
            'secret = "$SECRET"',
            'token = "$SECRET"',
          ],
          metavariableRegex: {
            SECRET: '.{8,}',
          },
        },
        {
          id: 'no-eval',
          severity: 'error',
          message: 'Avoid using eval()',
          patternEither: ['eval($CODE)', 'new Function($CODE)'],
        },
        {
          id: 'no-console',
          severity: 'warning',
          message: 'Unexpected console statement',
          pattern: 'console.$METHOD($ARGS)',
          paths: {
            exclude: ['**/*.test.ts', '**/*.spec.ts'],
          },
        },
      ],
      paths: {
        include: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
        exclude: ['node_modules/**', 'dist/**', 'build/**'],
      },
    });

    // Strict security rules
    this.presets.set('strict', {
      name: 'vibecheck:strict',
      extends: ['vibecheck:recommended'],
      rules: [
        {
          id: 'no-any',
          severity: 'error',
          message: 'Avoid using "any" type',
          pattern: ': any',
          paths: {
            include: ['**/*.ts', '**/*.tsx'],
          },
        },
        {
          id: 'no-unsafe-regex',
          severity: 'warning',
          message: 'Potentially unsafe regex',
          pattern: 'new RegExp($INPUT)',
        },
      ],
    });

    // Minimal security rules
    this.presets.set('minimal', {
      name: 'vibecheck:minimal',
      rules: [
        {
          id: 'no-hardcoded-secrets',
          severity: 'error',
          message: 'Detected hardcoded secret',
          patternEither: [
            'password = "$SECRET"',
            'apiKey = "$SECRET"',
          ],
          metavariableRegex: {
            SECRET: '.{8,}',
          },
        },
      ],
    });
  }
}

/**
 * Create a policy resolver instance
 */
export function createPolicyResolver(
  options?: Partial<PolicyResolverOptions>
): PolicyResolver {
  return new PolicyResolver(options);
}
