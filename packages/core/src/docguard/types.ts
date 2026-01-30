/**
 * DocGuard Types
 * 
 * Type definitions for the documentation quality and duplicate prevention system.
 */

import { z } from 'zod';

// ============================================================================
// Doc Registry Types
// ============================================================================

export const DocTypeSchema = z.enum([
  'guide',
  'reference',
  'adr',        // Architecture Decision Record
  'changelog',
  'runbook',
  'spec',
  'readme',
  'other',
]);
export type DocType = z.infer<typeof DocTypeSchema>;

export const DocAnchorSchema = z.object({
  /** Type of anchor */
  type: z.enum(['file', 'command', 'api', 'env', 'config', 'function', 'class']),
  /** The anchor value (path, command, endpoint, etc.) */
  value: z.string(),
  /** Line number in the doc where anchor appears */
  line: z.number().optional(),
});
export type DocAnchor = z.infer<typeof DocAnchorSchema>;

export const DocEntrySchema = z.object({
  /** Stable UUID for this doc */
  docId: z.string().uuid(),
  /** Canonical path relative to project root */
  canonicalPath: z.string(),
  /** Document type */
  type: DocTypeSchema,
  /** Searchable tags */
  tags: z.array(z.string()),
  /** Optional owner (team or person) */
  owner: z.string().optional(),
  /** Reality anchors - files, commands, APIs referenced */
  anchors: z.array(DocAnchorSchema),
  /** MinHash signature for similarity detection */
  minHashSignature: z.array(z.number()).optional(),
  /** Created timestamp */
  createdAt: z.string().datetime(),
  /** Last modified timestamp */
  updatedAt: z.string().datetime(),
  /** Last commit hash that touched this doc */
  lastCommit: z.string().optional(),
  /** Title extracted from doc */
  title: z.string().optional(),
  /** Short purpose statement */
  purpose: z.string().optional(),
});
export type DocEntry = z.infer<typeof DocEntrySchema>;

export const DocRegistrySchema = z.object({
  /** Registry version for migrations */
  version: z.string(),
  /** Last scan timestamp */
  lastScan: z.string().datetime(),
  /** All registered docs */
  docs: z.array(DocEntrySchema),
  /** Canonical doc paths by type for fast lookup */
  canonicalByType: z.record(DocTypeSchema, z.array(z.string())).optional(),
});
export type DocRegistry = z.infer<typeof DocRegistrySchema>;

// ============================================================================
// DocSpec Validation Types
// ============================================================================

export const DocSpecRuleSchema = z.enum([
  'has-purpose',
  'has-anchors',
  'has-example',
  'has-scope',
  'no-fluff',
  'no-generic-phrases',
  'min-anchors',
  'no-orphan-doc',
]);
export type DocSpecRule = z.infer<typeof DocSpecRuleSchema>;

export const DocSpecViolationSchema = z.object({
  /** Which rule was violated */
  rule: DocSpecRuleSchema,
  /** Human-readable message */
  message: z.string(),
  /** Severity */
  severity: z.enum(['error', 'warning']),
  /** Line number if applicable */
  line: z.number().optional(),
  /** Suggestion for fix */
  suggestion: z.string().optional(),
});
export type DocSpecViolation = z.infer<typeof DocSpecViolationSchema>;

export const DocSpecResultSchema = z.object({
  /** Whether the doc passes DocSpec */
  valid: z.boolean(),
  /** Violations found */
  violations: z.array(DocSpecViolationSchema),
  /** Extracted anchors */
  anchors: z.array(DocAnchorSchema),
  /** Metrics */
  metrics: z.object({
    wordCount: z.number(),
    anchorCount: z.number(),
    exampleCount: z.number(),
    fluffRatio: z.number(),
    genericPhraseCount: z.number(),
  }),
});
export type DocSpecResult = z.infer<typeof DocSpecResultSchema>;

// ============================================================================
// Similarity Detection Types
// ============================================================================

export const SimilarityMatchSchema = z.object({
  /** Path to the similar doc */
  path: z.string(),
  /** Doc ID if in registry */
  docId: z.string().optional(),
  /** Similarity score (0-1) */
  similarity: z.number(),
  /** Which layer detected this */
  detectionLayer: z.enum(['path', 'fingerprint', 'semantic']),
  /** Why it's considered similar */
  reason: z.string(),
});
export type SimilarityMatch = z.infer<typeof SimilarityMatchSchema>;

export const DuplicateCheckResultSchema = z.object({
  /** Whether a duplicate was detected */
  isDuplicate: z.boolean(),
  /** Matches found */
  matches: z.array(SimilarityMatchSchema),
  /** The best canonical doc to merge into */
  canonicalTarget: z.string().optional(),
  /** Suggested merge action */
  mergeAction: z.enum(['merge', 'update', 'link', 'none']).optional(),
});
export type DuplicateCheckResult = z.infer<typeof DuplicateCheckResultSchema>;

// ============================================================================
// DocGuard Decision Types
// ============================================================================

export const DocGuardVerdictSchema = z.enum([
  'ALLOW',   // Doc passes all checks
  'WARN',    // Doc has issues but can proceed
  'BLOCK',   // Doc fails checks, should not be created
]);
export type DocGuardVerdict = z.infer<typeof DocGuardVerdictSchema>;

export const MergePatchSchema = z.object({
  /** Type of patch operation */
  operation: z.enum(['append', 'prepend', 'replace-section', 'add-section']),
  /** Target file path */
  targetPath: z.string(),
  /** Section header to target (for section operations) */
  sectionHeader: z.string().optional(),
  /** Content to add/replace */
  content: z.string(),
  /** Anchors to add */
  anchorsToAdd: z.array(z.string()).optional(),
});
export type MergePatch = z.infer<typeof MergePatchSchema>;

export const DocGuardResultSchema = z.object({
  /** Overall verdict */
  verdict: DocGuardVerdictSchema,
  /** Reason for verdict */
  reason: z.string(),
  /** DocSpec validation result */
  docSpec: DocSpecResultSchema.optional(),
  /** Duplicate check result */
  duplicateCheck: DuplicateCheckResultSchema.optional(),
  /** Suggested merge patch if blocked */
  mergePatch: MergePatchSchema.optional(),
  /** Recommended actions */
  recommendedActions: z.array(z.object({
    action: z.string(),
    priority: z.enum(['high', 'medium', 'low']),
  })),
  /** Proof receipts footer data */
  receiptsFooter: z.object({
    commit: z.string().optional(),
    touchedFiles: z.array(z.string()),
    proofLink: z.string().optional(),
    owner: z.string().optional(),
  }).optional(),
});
export type DocGuardResult = z.infer<typeof DocGuardResultSchema>;

// ============================================================================
// Configuration Types
// ============================================================================

export const DocGuardConfigSchema = z.object({
  /** Enable/disable DocGuard */
  enabled: z.boolean().default(true),
  /** Path to registry file */
  registryPath: z.string().default('docs/.vibecheck-docs/registry.json'),
  /** Similarity threshold (0-1) for duplicate detection */
  similarityThreshold: z.number().min(0).max(1).default(0.8),
  /** Minimum anchors required */
  minAnchors: z.number().min(0).default(2),
  /** Maximum fluff ratio (0-1) */
  maxFluffRatio: z.number().min(0).max(1).default(0.4),
  /** Directories to scan for docs */
  docDirectories: z.array(z.string()).default(['docs', 'README.md']),
  /** Patterns to ignore */
  ignorePatterns: z.array(z.string()).default(['**/node_modules/**', '**/dist/**']),
  /** Enable semantic similarity (requires embeddings) */
  enableSemanticSimilarity: z.boolean().default(false),
  /** Strict mode - block instead of warn */
  strictMode: z.boolean().default(false),
  /** Auto-generate merge patches */
  autoGenerateMergePatch: z.boolean().default(true),
});
export type DocGuardConfig = z.infer<typeof DocGuardConfigSchema>;

// ============================================================================
// Request Types
// ============================================================================

export interface DocGuardRequest {
  /** Action being performed */
  action: 'create' | 'modify';
  /** Target file path */
  path: string;
  /** Document content */
  content: string;
  /** Git context */
  gitContext?: {
    commit?: string;
    branch?: string;
    changedFiles?: string[];
  };
}
