/**
 * Policy Schema
 * 
 * Zod schema for validating YAML policy files.
 * Based on Semgrep's policy format with ESLint-style inheritance.
 */

import { z } from 'zod';
import type { PolicyRule, PolicyConfig, PolicySeverity } from './types.js';

/**
 * Severity schema
 */
export const severitySchema = z.enum(['error', 'warning', 'info', 'off']);

/**
 * Metavariable comparison schema
 */
export const metavariableComparisonSchema = z.object({
  metavariable: z.string().min(1),
  comparison: z.enum(['==', '!=', '<', '>', '<=', '>=']),
  value: z.union([z.string(), z.number()]),
});

/**
 * Path filter schema
 */
export const pathFilterSchema = z.object({
  include: z.array(z.string()).optional(),
  exclude: z.array(z.string()).optional(),
});

/**
 * Autofix schema
 */
export const autofixSchema = z.object({
  pattern: z.string().min(1),
  replacement: z.string(),
});

/**
 * Rule metadata schema
 */
export const ruleMetadataSchema = z.object({
  category: z.string().optional(),
  cwe: z.array(z.string()).optional(),
  owasp: z.array(z.string()).optional(),
  references: z.array(z.string().url()).optional(),
  description: z.string().optional(),
});

/**
 * Policy rule schema
 */
export const policyRuleSchema = z.object({
  id: z.string()
    .min(1, 'Rule ID is required')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Rule ID must be alphanumeric with underscores/hyphens'),
  
  severity: severitySchema.default('warning'),
  
  message: z.string().min(1, 'Rule message is required'),
  
  // Pattern matching
  pattern: z.string().optional(),
  patternEither: z.array(z.string()).optional(),
  patternInside: z.string().optional(),
  patternNot: z.string().optional(),
  patternNotInside: z.string().optional(),
  
  // Metavariable constraints
  metavariableRegex: z.record(z.string()).optional(),
  metavariableComparison: z.array(metavariableComparisonSchema).optional(),
  
  // Path filtering
  paths: pathFilterSchema.optional(),
  
  // Fixes
  fix: z.string().optional(),
  autofix: autofixSchema.optional(),
  
  // Metadata
  metadata: ruleMetadataSchema.optional(),
  
  // Options
  options: z.record(z.unknown()).optional(),
  
  // Languages
  languages: z.array(z.string()).optional(),
}).refine(
  (data) => data.pattern || data.patternEither,
  { message: 'Either pattern or patternEither is required' }
);

/**
 * Policy config schema
 */
export const policyConfigSchema = z.object({
  version: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  
  // Inheritance
  extends: z.array(z.string()).optional(),
  
  // Rules
  rules: z.array(policyRuleSchema).min(1, 'At least one rule is required'),
  
  // Global filters
  paths: pathFilterSchema.optional(),
  
  // Global options
  options: z.record(z.unknown()).optional(),
  
  // Overrides
  severityOverrides: z.record(severitySchema).optional(),
  disabledRules: z.array(z.string()).optional(),
});

/**
 * Validate a policy rule
 */
export function validateRule(rule: unknown): { 
  valid: boolean; 
  data?: PolicyRule; 
  errors?: string[] 
} {
  const result = policyRuleSchema.safeParse(rule);
  
  if (result.success) {
    return { valid: true, data: result.data as PolicyRule };
  }
  
  return {
    valid: false,
    errors: result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
  };
}

/**
 * Validate a policy config
 */
export function validatePolicy(config: unknown): {
  valid: boolean;
  data?: PolicyConfig;
  errors?: string[];
} {
  const result = policyConfigSchema.safeParse(config);
  
  if (result.success) {
    return { valid: true, data: result.data as PolicyConfig };
  }
  
  return {
    valid: false,
    errors: result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
  };
}

/**
 * Create a default policy config
 */
export function createDefaultPolicy(): PolicyConfig {
  return {
    version: '1.0',
    name: 'default',
    rules: [],
    paths: {
      include: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
      exclude: ['node_modules/**', 'dist/**', 'build/**'],
    },
  };
}

/**
 * Example policy for reference
 */
export const EXAMPLE_POLICY: PolicyConfig = {
  version: '1.0',
  name: 'vibecheck-security',
  description: 'Security rules for VibeCheck',
  
  rules: [
    {
      id: 'no-hardcoded-secret',
      severity: 'error',
      message: 'Detected hardcoded $TYPE: $SECRET',
      pattern: '$VAR = "$SECRET"',
      metavariableRegex: {
        SECRET: '(api[_-]?key|password|secret|token)[=:]\\s*["\'][^"\']{8,}["\']',
      },
      paths: {
        exclude: ['**/*.test.ts', '**/*.spec.ts'],
      },
      fix: 'Use environment variables: process.env.$VAR',
      metadata: {
        category: 'security',
        cwe: ['CWE-798'],
        owasp: ['A3:2017'],
      },
    },
    {
      id: 'no-eval',
      severity: 'error',
      message: 'Dangerous use of eval() detected',
      patternEither: [
        'eval($CODE)',
        'new Function($CODE)',
      ],
      fix: 'Avoid eval() - use safer alternatives like JSON.parse()',
      metadata: {
        category: 'security',
        cwe: ['CWE-95'],
      },
    },
    {
      id: 'no-sql-injection',
      severity: 'error',
      message: 'Potential SQL injection vulnerability',
      pattern: '$DB.query(`$QUERY`)',
      patternNotInside: '$DB.query($QUERY, $PARAMS)',
      fix: 'Use parameterized queries',
      metadata: {
        category: 'security',
        cwe: ['CWE-89'],
        owasp: ['A1:2017'],
      },
    },
  ],
  
  paths: {
    include: ['src/**/*.ts'],
    exclude: ['**/*.test.ts', '**/*.d.ts'],
  },
};
