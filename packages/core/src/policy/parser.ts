/**
 * Policy Parser
 * 
 * Parses YAML policy files and matches patterns against source code.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  PolicyConfig,
  PolicyRule,
  PolicyMatch,
  PolicyLoadOptions,
  PolicySource,
} from './types.js';
import { DEFAULT_POLICY_OPTIONS } from './types.js';
import { validatePolicy } from './schema.js';

// Cache for loaded policies
const policyCache = new Map<string, PolicyConfig>();

/**
 * Policy Parser
 * 
 * Loads and parses YAML policy files, then matches rules against source code.
 */
export class PolicyParser {
  private options: PolicyLoadOptions;

  constructor(options: Partial<PolicyLoadOptions> = {}) {
    this.options = { ...DEFAULT_POLICY_OPTIONS, ...options };
  }

  /**
   * Load a policy from various sources
   */
  async loadPolicy(source: string): Promise<PolicySource> {
    const result: PolicySource = {
      type: this.detectSourceType(source),
      path: source,
    };

    try {
      let rawConfig: unknown;

      switch (result.type) {
        case 'file':
          rawConfig = await this.loadFromFile(source);
          break;
        case 'url':
          if (!this.options.allowUrls) {
            throw new Error('URL loading is disabled');
          }
          rawConfig = await this.loadFromUrl(source);
          break;
        case 'npm':
          rawConfig = await this.loadFromNpm(source);
          break;
        case 'inline':
          rawConfig = this.parseYaml(source);
          break;
      }

      // Validate the config
      const validation = validatePolicy(rawConfig);
      if (!validation.valid) {
        throw new Error(`Invalid policy: ${validation.errors?.join(', ')}`);
      }

      result.config = validation.data;

      // Cache if enabled
      if (this.options.cache && result.type !== 'inline') {
        policyCache.set(source, result.config!);
      }
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
    }

    return result;
  }

  /**
   * Load multiple policies
   */
  async loadPolicies(sources: string[]): Promise<PolicySource[]> {
    return Promise.all(sources.map((s) => this.loadPolicy(s)));
  }

  /**
   * Match a rule against source code
   */
  matchRule(rule: PolicyRule, filePath: string, content: string): PolicyMatch[] {
    const matches: PolicyMatch[] = [];
    const lines = content.split('\n');

    // Check path filters
    if (!this.matchesPathFilter(filePath, rule.paths)) {
      return matches;
    }

    // Get patterns to match
    const patterns = rule.patternEither ?? (rule.pattern ? [rule.pattern] : []);

    for (const pattern of patterns) {
      const patternMatches = this.findPatternMatches(pattern, content, lines);

      for (const match of patternMatches) {
        // Apply pattern-inside filter
        if (rule.patternInside && !this.isInsidePattern(match, rule.patternInside, content)) {
          continue;
        }

        // Apply pattern-not filter
        if (rule.patternNot && this.matchesPattern(match.matchedContent, rule.patternNot)) {
          continue;
        }

        // Apply pattern-not-inside filter
        if (rule.patternNotInside && this.isInsidePattern(match, rule.patternNotInside, content)) {
          continue;
        }

        // Validate metavariable regex constraints
        if (rule.metavariableRegex && !this.validateMetavariableRegex(match.metavariables, rule.metavariableRegex)) {
          continue;
        }

        // Validate metavariable comparison constraints
        if (rule.metavariableComparison && !this.validateMetavariableComparison(match.metavariables, rule.metavariableComparison)) {
          continue;
        }

        // Interpolate message
        const message = this.interpolate(rule.message, match.metavariables);
        const fix = rule.fix ? this.interpolate(rule.fix, match.metavariables) : undefined;

        matches.push({
          rule,
          file: filePath,
          line: match.line,
          column: match.column,
          endLine: match.endLine,
          endColumn: match.endColumn,
          matchedContent: match.matchedContent,
          metavariables: match.metavariables,
          message,
          fix,
        });
      }
    }

    return matches;
  }

  /**
   * Match all rules against source code
   */
  matchRules(rules: PolicyRule[], filePath: string, content: string): PolicyMatch[] {
    const matches: PolicyMatch[] = [];

    for (const rule of rules) {
      if (rule.severity === 'off') continue;

      const ruleMatches = this.matchRule(rule, filePath, content);
      matches.push(...ruleMatches);
    }

    return matches;
  }

  /**
   * Clear the policy cache
   */
  clearCache(): void {
    policyCache.clear();
  }

  private detectSourceType(source: string): PolicySource['type'] {
    if (source.startsWith('http://') || source.startsWith('https://')) {
      return 'url';
    }
    if (source.startsWith('@') || (!source.includes('/') && !source.includes('\\'))) {
      // Looks like an npm package
      if (!source.includes(':') && !source.includes('\n')) {
        return 'npm';
      }
    }
    if (source.includes('\n') || source.trim().startsWith('rules:')) {
      return 'inline';
    }
    return 'file';
  }

  private async loadFromFile(filePath: string): Promise<unknown> {
    // Check cache
    if (this.options.cache && policyCache.has(filePath)) {
      return policyCache.get(filePath);
    }

    const resolvedPath = this.options.baseDir
      ? path.resolve(this.options.baseDir, filePath)
      : path.resolve(filePath);

    const content = await fs.readFile(resolvedPath, 'utf-8');
    return this.parseYaml(content);
  }

  private async loadFromUrl(url: string): Promise<unknown> {
    // Check cache
    if (this.options.cache && policyCache.has(url)) {
      return policyCache.get(url);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.options.fetchTimeoutMs
    );

    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const content = await response.text();
      return this.parseYaml(content);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async loadFromNpm(packageName: string): Promise<unknown> {
    // Check cache
    if (this.options.cache && policyCache.has(packageName)) {
      return policyCache.get(packageName);
    }

    try {
      // Try to resolve the package
      const packagePath = require.resolve(`${packageName}/policy.yaml`, {
        paths: [process.cwd()],
      });
      return this.loadFromFile(packagePath);
    } catch {
      // Try loading as a JavaScript config
      try {
        const packagePath = require.resolve(packageName, {
          paths: [process.cwd()],
        });
        const module = await import(packagePath);
        return module.default ?? module;
      } catch {
        throw new Error(`Cannot find policy package: ${packageName}`);
      }
    }
  }

  private parseYaml(content: string): unknown {
    // Dynamic import of js-yaml
    try {
      const yaml = require('js-yaml');
      return yaml.load(content);
    } catch {
      // Fallback: try JSON parsing
      try {
        return JSON.parse(content);
      } catch {
        throw new Error('Failed to parse policy: neither YAML nor JSON');
      }
    }
  }

  private matchesPathFilter(
    filePath: string,
    filter?: { include?: string[]; exclude?: string[] }
  ): boolean {
    if (!filter) return true;

    const normalizedPath = filePath.replace(/\\/g, '/');

    // Check exclude patterns first
    if (filter.exclude) {
      for (const pattern of filter.exclude) {
        if (this.matchGlob(normalizedPath, pattern)) {
          return false;
        }
      }
    }

    // If no include patterns, include everything not excluded
    if (!filter.include || filter.include.length === 0) {
      return true;
    }

    // Check include patterns
    for (const pattern of filter.include) {
      if (this.matchGlob(normalizedPath, pattern)) {
        return true;
      }
    }

    return false;
  }

  private matchGlob(filePath: string, pattern: string): boolean {
    // Simple glob matching (supports * and **)
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '<<<GLOBSTAR>>>')
      .replace(/\*/g, '[^/]*')
      .replace(/<<<GLOBSTAR>>>/g, '.*');

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(filePath);
  }

  private findPatternMatches(
    pattern: string,
    content: string,
    lines: string[]
  ): Array<{
    line: number;
    column: number;
    endLine?: number;
    endColumn?: number;
    matchedContent: string;
    metavariables: Record<string, string>;
  }> {
    const matches: Array<{
      line: number;
      column: number;
      endLine?: number;
      endColumn?: number;
      matchedContent: string;
      metavariables: Record<string, string>;
    }> = [];

    // Convert pattern to regex with metavariable capture
    const { regex, metavariableNames } = this.patternToRegex(pattern);

    let lineNum = 0;
    for (const line of lines) {
      lineNum++;
      let match: RegExpExecArray | null;
      regex.lastIndex = 0;

      while ((match = regex.exec(line)) !== null) {
        const metavariables: Record<string, string> = {};

        // Extract captured metavariables
        for (let i = 0; i < metavariableNames.length; i++) {
          if (match[i + 1] !== undefined) {
            metavariables[metavariableNames[i]] = match[i + 1];
          }
        }

        matches.push({
          line: lineNum,
          column: match.index + 1,
          matchedContent: match[0],
          metavariables,
        });

        // Prevent infinite loops on zero-length matches
        if (match[0].length === 0) {
          regex.lastIndex++;
        }
      }
    }

    return matches;
  }

  private patternToRegex(pattern: string): {
    regex: RegExp;
    metavariableNames: string[];
  } {
    const metavariableNames: string[] = [];

    // Escape special regex characters except our metavariable syntax
    let regexStr = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Replace metavariables ($VAR) with capture groups
    regexStr = regexStr.replace(/\\\$([A-Z_][A-Z0-9_]*)/g, (_, name) => {
      metavariableNames.push(name);
      return '([\\s\\S]+?)';
    });

    // Allow flexible whitespace
    regexStr = regexStr.replace(/\s+/g, '\\s*');

    return {
      regex: new RegExp(regexStr, 'g'),
      metavariableNames,
    };
  }

  private matchesPattern(content: string, pattern: string): boolean {
    const { regex } = this.patternToRegex(pattern);
    return regex.test(content);
  }

  private isInsidePattern(
    match: { line: number; matchedContent: string },
    pattern: string,
    fullContent: string
  ): boolean {
    // Simplified check: see if the pattern exists in a broader context
    const { regex } = this.patternToRegex(pattern);
    const contextStart = Math.max(0, fullContent.indexOf(match.matchedContent) - 500);
    const contextEnd = Math.min(
      fullContent.length,
      fullContent.indexOf(match.matchedContent) + match.matchedContent.length + 500
    );
    const context = fullContent.substring(contextStart, contextEnd);
    return regex.test(context);
  }

  private validateMetavariableRegex(
    metavariables: Record<string, string>,
    constraints: Record<string, string>
  ): boolean {
    for (const [name, regexStr] of Object.entries(constraints)) {
      const value = metavariables[name];
      if (value === undefined) continue;

      try {
        const regex = new RegExp(regexStr);
        if (!regex.test(value)) {
          return false;
        }
      } catch {
        // Invalid regex, skip this constraint
      }
    }
    return true;
  }

  private validateMetavariableComparison(
    metavariables: Record<string, string>,
    constraints: Array<{
      metavariable: string;
      comparison: string;
      value: string | number;
    }>
  ): boolean {
    for (const constraint of constraints) {
      const value = metavariables[constraint.metavariable];
      if (value === undefined) continue;

      const numValue = parseFloat(value);
      const compareValue = typeof constraint.value === 'number'
        ? constraint.value
        : parseFloat(constraint.value);

      if (isNaN(numValue) || isNaN(compareValue)) {
        // String comparison
        switch (constraint.comparison) {
          case '==':
            if (value !== String(constraint.value)) return false;
            break;
          case '!=':
            if (value === String(constraint.value)) return false;
            break;
          default:
            return false;
        }
      } else {
        // Numeric comparison
        switch (constraint.comparison) {
          case '==':
            if (numValue !== compareValue) return false;
            break;
          case '!=':
            if (numValue === compareValue) return false;
            break;
          case '<':
            if (numValue >= compareValue) return false;
            break;
          case '>':
            if (numValue <= compareValue) return false;
            break;
          case '<=':
            if (numValue > compareValue) return false;
            break;
          case '>=':
            if (numValue < compareValue) return false;
            break;
        }
      }
    }
    return true;
  }

  private interpolate(template: string, vars: Record<string, string>): string {
    return template.replace(/\$([A-Z_][A-Z0-9_]*)/g, (_, name) => {
      return vars[name] ?? `$${name}`;
    });
  }
}

/**
 * Create a policy parser instance
 */
export function createPolicyParser(options?: Partial<PolicyLoadOptions>): PolicyParser {
  return new PolicyParser(options);
}
