/**
 * Auto-Fix Module
 * 
 * Automated code fixing engine for VibeCheck.
 * Provides rule-based and AI-assisted fixes for common issues
 * detected by static analysis and runtime verification.
 */

// Types
export type {
  Issue,
  IssueType,
  IssueSource,
  IssueSeverity,
  ConfidenceLevel,
  FixStrategy,
  FixAction,
  Patch,
  PatchHunk,
  FileChange,
  ApplyOptions,
  ApplyResult,
  AppliedPatch,
  PatchValidationResult,
  ScoreFactor,
  ConfidenceScore,
  ProposedFix,
  FixContext,
  TruthpackData,
  RouteData,
  EnvVarData,
  AuthData,
  ProtectedResource,
  ContractData,
  AutoFixPolicy,
  FixResult,
  FixError,
  TransactionLogEntry,
} from './types.js';

// Constants and type guards
export { 
  DEFAULT_AUTOFIX_POLICY,
  SAFETY_LIMITS,
  ISSUE_TYPES,
  ISSUE_SEVERITIES,
  CONFIDENCE_LEVELS,
  FIX_STRATEGIES,
  FIX_ACTIONS,
  ISSUE_SOURCES,
  isIssueType,
  isIssueSeverity,
  isConfidenceLevel,
  isFixStrategy,
  isFixAction,
  validateIssue,
  normalizePolicy,
  sanitizeFilePath,
  isPathWithinBase,
  exceedsSafetyLimit,
} from './types.js';

// Patch generation and application
export { 
  PatchGenerator, 
  PatchGenerationError,
  type PatchGeneratorOptions 
} from './patch-generator.js';

export { 
  PatchApplier,
  PatchApplicationError,
} from './patch-applier.js';

// Orchestrator
export { 
  AutoFixOrchestrator, 
  type OrchestratorConfig, 
  type FixStats 
} from './orchestrator.js';

// Fix modules
export { BaseFixModule, type FixModuleMetadata } from './modules/index.js';
export { SilentFailureFixModule } from './modules/silent-failure-fix.js';
export { AuthGapFixModule } from './modules/auth-gap-fix.js';
export { EnvVarFixModule } from './modules/env-var-fix.js';
export { GhostRouteFixModule } from './modules/ghost-route-fix.js';

// Confidence scoring
export { 
  ConfidenceScorer, 
  type ConfidenceScorerConfig,
  type ModuleHistory,
  type TestCoverageData 
} from './confidence-scorer.js';

// Review pipeline
export {
  ReviewPipeline,
  type ReviewItem,
  type ReviewStatus,
  type ReviewSummary,
  type ApplyApprovedOptions,
  type OutputFormat,
} from './review-pipeline.js';

// Rollback management
export {
  RollbackManager,
  RollbackError,
  type RollbackConfig,
  type Transaction,
  type TransactionFix,
  type RollbackResult,
} from './rollback-manager.js';
