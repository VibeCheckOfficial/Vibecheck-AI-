/**
 * DocGuard Module
 * 
 * Documentation quality enforcement and duplicate prevention system.
 * 
 * Features:
 * - Canonical Doc Registry: Track all docs with stable IDs and metadata
 * - Duplicate Detection: 3-layer similarity checking (path, MinHash, semantic)
 * - DocSpec Validation: Quality rules (anchors, examples, no fluff)
 * - Firewall Integration: Intercept .md writes with merge-not-create default
 * 
 * @module core/docguard
 * 
 * @example
 * ```ts
 * import { createDocGuard, DocGuardEngine } from '@vibecheck/core/docguard';
 * 
 * const docguard = createDocGuard({ projectRoot: '/path/to/project' });
 * 
 * const result = await docguard.evaluate({
 *   action: 'create',
 *   path: 'docs/new-feature.md',
 *   content: '# New Feature\n...',
 * });
 * 
 * if (result.verdict === 'BLOCK') {
 *   console.log('Blocked:', result.reason);
 *   console.log('Merge into:', result.duplicateCheck?.canonicalTarget);
 * }
 * ```
 */

// Types
export type {
  DocType,
  DocAnchor,
  DocEntry,
  DocRegistry,
  DocSpecRule,
  DocSpecViolation,
  DocSpecResult,
  SimilarityMatch,
  DuplicateCheckResult,
  DocGuardVerdict,
  MergePatch,
  DocGuardResult,
  DocGuardConfig,
  DocGuardRequest,
} from './types.js';

export {
  DocTypeSchema,
  DocAnchorSchema,
  DocEntrySchema,
  DocRegistrySchema,
  DocSpecRuleSchema,
  DocSpecViolationSchema,
  DocSpecResultSchema,
  SimilarityMatchSchema,
  DuplicateCheckResultSchema,
  DocGuardVerdictSchema,
  MergePatchSchema,
  DocGuardResultSchema,
  DocGuardConfigSchema,
} from './types.js';

// DocGuard Engine
export { DocGuardEngine, createDocGuard } from './docguard-engine.js';
export type { DocGuardEngineOptions } from './docguard-engine.js';

// Doc Registry
export { DocRegistryManager } from './doc-registry.js';
export type { DocRegistryOptions } from './doc-registry.js';

// Similarity Detection
export { 
  SimilarityDetector, 
  computeMinHash, 
  computeMinHashSimilarity,
  isSuspiciousFilename,
} from './similarity-detector.js';
export type { SimilarityDetectorOptions } from './similarity-detector.js';

// DocSpec Validation
export { DocSpecValidator } from './docspec-validator.js';
export type { DocSpecValidatorOptions } from './docspec-validator.js';

// Anchor Extraction
export {
  extractAnchors,
  countAnchorsByType,
  hasMinimumAnchors,
  extractFilePaths,
  extractCommands,
  referencesChangedFiles,
} from './anchor-extractor.js';

// Firewall Integration
export {
  DocGuardRule,
  createDocGuardRule,
  formatDocGuardResult,
  shouldInterceptDocWrite,
} from './firewall-rule.js';
export type { DocGuardRuleContext, DocGuardRuleResult } from './firewall-rule.js';
