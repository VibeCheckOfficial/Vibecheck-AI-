/**
 * Policy Types
 * 
 * Type definitions for the YAML policy format.
 */

export type PolicySeverity = 'error' | 'warning' | 'info' | 'off';

export interface PolicyRule {
  /** Unique rule identifier */
  id: string;
  /** Rule severity */
  severity: PolicySeverity;
  /** Human-readable message (supports $VAR interpolation) */
  message: string;
  /** Primary pattern to match */
  pattern?: string;
  /** Match any of these patterns */
  patternEither?: string[];
  /** Pattern must be inside this pattern */
  patternInside?: string;
  /** Exclude matches inside this pattern */
  patternNot?: string;
  /** Pattern must not be inside this pattern */
  patternNotInside?: string;
  /** Metavariable regex constraints */
  metavariableRegex?: Record<string, string>;
  /** Metavariable comparison constraints */
  metavariableComparison?: {
    metavariable: string;
    comparison: '==' | '!=' | '<' | '>' | '<=' | '>=';
    value: string | number;
  }[];
  /** Path filtering */
  paths?: {
    include?: string[];
    exclude?: string[];
  };
  /** Suggested fix */
  fix?: string;
  /** Autofix replacement pattern */
  autofix?: {
    pattern: string;
    replacement: string;
  };
  /** Rule metadata */
  metadata?: {
    category?: string;
    cwe?: string[];
    owasp?: string[];
    references?: string[];
    description?: string;
  };
  /** Rule-specific options */
  options?: Record<string, unknown>;
  /** Languages this rule applies to */
  languages?: string[];
}

export interface PolicyConfig {
  /** Policy version */
  version?: string;
  /** Policy name */
  name?: string;
  /** Policy description */
  description?: string;
  /** Extends other policies */
  extends?: string[];
  /** Rule definitions */
  rules: PolicyRule[];
  /** Global path filters */
  paths?: {
    include?: string[];
    exclude?: string[];
  };
  /** Global options */
  options?: Record<string, unknown>;
  /** Severity overrides by rule ID */
  severityOverrides?: Record<string, PolicySeverity>;
  /** Rule ID patterns to disable */
  disabledRules?: string[];
}

export interface ResolvedPolicy {
  /** Original policies that were merged */
  sources: string[];
  /** Final merged rules */
  rules: PolicyRule[];
  /** Final path filters */
  paths: {
    include: string[];
    exclude: string[];
  };
  /** Final options */
  options: Record<string, unknown>;
  /** Disabled rule IDs */
  disabledRules: Set<string>;
}

export interface PolicyMatch {
  /** Rule that matched */
  rule: PolicyRule;
  /** File path */
  file: string;
  /** Line number (1-based) */
  line: number;
  /** Column number (1-based) */
  column?: number;
  /** End line */
  endLine?: number;
  /** End column */
  endColumn?: number;
  /** Matched content */
  matchedContent: string;
  /** Captured metavariables */
  metavariables: Record<string, string>;
  /** Interpolated message */
  message: string;
  /** Suggested fix (interpolated) */
  fix?: string;
}

export interface PolicyLoadOptions {
  /** Base directory for resolving relative paths */
  baseDir?: string;
  /** Allow loading from URLs */
  allowUrls?: boolean;
  /** Cache loaded policies */
  cache?: boolean;
  /** Timeout for URL fetches (ms) */
  fetchTimeoutMs?: number;
}

export interface PolicySource {
  /** Source type */
  type: 'file' | 'url' | 'npm' | 'inline';
  /** Source path/URL/package name */
  path: string;
  /** Resolved policy config */
  config?: PolicyConfig;
  /** Load error if any */
  error?: string;
}

export const DEFAULT_POLICY_OPTIONS: PolicyLoadOptions = {
  allowUrls: true,
  cache: true,
  fetchTimeoutMs: 10000,
};
