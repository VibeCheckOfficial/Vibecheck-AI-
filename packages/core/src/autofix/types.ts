/**
 * Auto-Fix Types
 * 
 * Core type definitions for the auto-fix engine.
 * Includes runtime validation helpers and type guards.
 */

import type { PolicyViolation } from '../firewall/policy-engine.js';
import type { DriftItem } from '../validation/drift-detector.js';

/**
 * Severity levels for issues
 */
export type IssueSeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * All valid severity levels
 */
export const ISSUE_SEVERITIES: readonly IssueSeverity[] = ['low', 'medium', 'high', 'critical'] as const;

/**
 * Type guard for IssueSeverity
 */
export function isIssueSeverity(value: unknown): value is IssueSeverity {
  return typeof value === 'string' && ISSUE_SEVERITIES.includes(value as IssueSeverity);
}

/**
 * Confidence levels for fixes
 */
export type ConfidenceLevel = 'high' | 'medium' | 'low';

/**
 * All valid confidence levels
 */
export const CONFIDENCE_LEVELS: readonly ConfidenceLevel[] = ['high', 'medium', 'low'] as const;

/**
 * Type guard for ConfidenceLevel
 */
export function isConfidenceLevel(value: unknown): value is ConfidenceLevel {
  return typeof value === 'string' && CONFIDENCE_LEVELS.includes(value as ConfidenceLevel);
}

/**
 * Fix strategy types
 */
export type FixStrategy = 'rule-based' | 'ai-assisted' | 'manual';

/**
 * All valid fix strategies
 */
export const FIX_STRATEGIES: readonly FixStrategy[] = ['rule-based', 'ai-assisted', 'manual'] as const;

/**
 * Type guard for FixStrategy
 */
export function isFixStrategy(value: unknown): value is FixStrategy {
  return typeof value === 'string' && FIX_STRATEGIES.includes(value as FixStrategy);
}

/**
 * Fix action types
 */
export type FixAction = 'auto_apply' | 'suggest' | 'reject';

/**
 * All valid fix actions
 */
export const FIX_ACTIONS: readonly FixAction[] = ['auto_apply', 'suggest', 'reject'] as const;

/**
 * Type guard for FixAction
 */
export function isFixAction(value: unknown): value is FixAction {
  return typeof value === 'string' && FIX_ACTIONS.includes(value as FixAction);
}

/**
 * Issue types that the auto-fix engine can handle
 */
export type IssueType = 
  | 'ghost-route'
  | 'ghost-env'
  | 'ghost-type'
  | 'ghost-import'
  | 'ghost-file'
  | 'auth-gap'
  | 'silent-failure'
  | 'fake-success'
  | 'low-confidence'
  | 'excessive-claims';

/**
 * All valid issue types
 */
export const ISSUE_TYPES: readonly IssueType[] = [
  'ghost-route',
  'ghost-env',
  'ghost-type',
  'ghost-import',
  'ghost-file',
  'auth-gap',
  'silent-failure',
  'fake-success',
  'low-confidence',
  'excessive-claims',
] as const;

/**
 * Type guard for IssueType
 */
export function isIssueType(value: unknown): value is IssueType {
  return typeof value === 'string' && ISSUE_TYPES.includes(value as IssueType);
}

/**
 * Valid issue sources
 */
export type IssueSource = 'static-analysis' | 'runtime' | 'drift-detection' | 'policy-violation';

/**
 * All valid issue sources
 */
export const ISSUE_SOURCES: readonly IssueSource[] = [
  'static-analysis',
  'runtime',
  'drift-detection',
  'policy-violation',
] as const;

/**
 * Represents an issue that needs to be fixed
 */
export interface Issue {
  id: string;
  type: IssueType;
  severity: IssueSeverity;
  message: string;
  filePath?: string;
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
  suggestion?: string;
  metadata?: Record<string, unknown>;
  source: IssueSource;
  violation?: PolicyViolation;
  driftItem?: DriftItem;
}

/**
 * Validate and sanitize an issue object
 */
export function validateIssue(issue: unknown): Issue | null {
  if (!issue || typeof issue !== 'object') {
    return null;
  }

  const obj = issue as Record<string, unknown>;

  // Required fields
  if (typeof obj.id !== 'string' || obj.id.trim() === '') {
    return null;
  }
  if (!isIssueType(obj.type)) {
    return null;
  }
  if (!isIssueSeverity(obj.severity)) {
    return null;
  }
  if (typeof obj.message !== 'string') {
    return null;
  }
  if (!ISSUE_SOURCES.includes(obj.source as IssueSource)) {
    return null;
  }

  // Optional fields with validation
  const filePath = typeof obj.filePath === 'string' ? obj.filePath : undefined;
  const line = typeof obj.line === 'number' && obj.line >= 0 ? Math.floor(obj.line) : undefined;
  const column = typeof obj.column === 'number' && obj.column >= 0 ? Math.floor(obj.column) : undefined;
  const endLine = typeof obj.endLine === 'number' && obj.endLine >= 0 ? Math.floor(obj.endLine) : undefined;
  const endColumn = typeof obj.endColumn === 'number' && obj.endColumn >= 0 ? Math.floor(obj.endColumn) : undefined;
  const suggestion = typeof obj.suggestion === 'string' ? obj.suggestion : undefined;

  return {
    id: obj.id.trim(),
    type: obj.type as IssueType,
    severity: obj.severity as IssueSeverity,
    message: obj.message,
    filePath,
    line,
    column,
    endLine,
    endColumn,
    suggestion,
    metadata: obj.metadata as Record<string, unknown> | undefined,
    source: obj.source as IssueSource,
    violation: obj.violation as PolicyViolation | undefined,
    driftItem: obj.driftItem as DriftItem | undefined,
  };
}

/**
 * A single hunk in a patch (a contiguous set of changes)
 */
export interface PatchHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
}

/**
 * Represents a patch for a single file
 */
export interface Patch {
  filePath: string;
  hunks: PatchHunk[];
  originalContent: string;
  newContent: string;
  issueId: string;
  moduleId: string;
}

/**
 * Represents a change to a file
 */
export interface FileChange {
  filePath: string;
  originalContent: string;
  newContent: string;
  issueId: string;
  moduleId: string;
}

/**
 * Patch application options
 */
export interface ApplyOptions {
  dryRun?: boolean;
  createBackup?: boolean;
  backupDir?: string;
  validateSyntax?: boolean;
}

/**
 * Result of applying a patch
 */
export interface ApplyResult {
  success: boolean;
  filePath: string;
  backupPath?: string;
  error?: string;
}

/**
 * Applied patch with metadata for rollback
 */
export interface AppliedPatch extends Patch {
  appliedAt: Date;
  backupPath?: string;
  backupChecksum?: string;  // SHA-256 checksum of backup for verification
}

/**
 * Validation result for patches
 */
export interface PatchValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Factors that influence confidence scoring
 */
export interface ScoreFactor {
  name: string;
  weight: number;
  value: number;
  description: string;
}

/**
 * Confidence score for a proposed fix
 */
export interface ConfidenceScore {
  value: number;
  level: ConfidenceLevel;
  factors: ScoreFactor[];
  recommendation: FixAction;
}

/**
 * A proposed fix with its patch and metadata
 */
export interface ProposedFix {
  id: string;
  issue: Issue;
  patch: Patch;
  strategy: FixStrategy;
  confidence: ConfidenceScore;
  moduleId: string;
  description: string;
  provenance: string;
}

/**
 * Context provided to fix modules
 */
export interface FixContext {
  projectRoot: string;
  truthpackPath: string;
  truthpack: TruthpackData | null;
  policy: AutoFixPolicy;
  existingPatches: Patch[];
}

/**
 * Truthpack data structure (simplified)
 */
export interface TruthpackData {
  routes?: RouteData[];
  env?: EnvVarData[];
  auth?: AuthData;
  contracts?: ContractData[];
}

export interface RouteData {
  method: string;
  path: string;
  handler: string;
  file: string;
  line?: number;
  middleware?: string[];
  auth?: boolean;
}

export interface EnvVarData {
  name: string;
  type?: string;
  required: boolean;
  defaultValue?: string;
  description?: string;
  sensitive?: boolean;
}

export interface AuthData {
  providers: string[];
  roles: string[];
  protectedResources: ProtectedResource[];
  publicPaths: string[];
}

export interface ProtectedResource {
  path: string;
  roles?: string[];
  methods?: string[];
}

export interface ContractData {
  name: string;
  type: 'interface' | 'type' | 'schema';
  file: string;
  line?: number;
}

/**
 * Auto-fix policy configuration
 */
export interface AutoFixPolicy {
  enabled: boolean;
  maxFilesPerFix: number;
  maxLinesPerFix: number;
  blockedPaths: string[];
  severityThresholds: {
    low: FixAction;
    medium: FixAction;
    high: FixAction;
    critical: FixAction;
  };
  confidenceThreshold: number;
  requireTests: boolean;
  allowAIFixes: boolean;
}

/**
 * Default auto-fix policy with conservative settings
 */
export const DEFAULT_AUTOFIX_POLICY: Readonly<AutoFixPolicy> = Object.freeze({
  enabled: true,
  maxFilesPerFix: 5,
  maxLinesPerFix: 100,
  blockedPaths: [
    'migrations/',
    '*.lock',
    'package-lock.json',
    'pnpm-lock.yaml',
    'yarn.lock',
    '.env',
    '.env.*',
    '*.min.js',
    '*.min.css',
    'dist/',
    'build/',
    'node_modules/',
  ],
  severityThresholds: {
    low: 'auto_apply',
    medium: 'auto_apply',
    high: 'suggest',
    critical: 'suggest',
  },
  confidenceThreshold: 0.7,
  requireTests: false,
  allowAIFixes: true,
});

/**
 * Validate and merge policy with defaults
 */
export function normalizePolicy(policy?: Partial<AutoFixPolicy>): AutoFixPolicy {
  if (!policy) {
    return { ...DEFAULT_AUTOFIX_POLICY };
  }

  return {
    enabled: typeof policy.enabled === 'boolean' ? policy.enabled : DEFAULT_AUTOFIX_POLICY.enabled,
    maxFilesPerFix: clampNumber(policy.maxFilesPerFix, 1, 50, DEFAULT_AUTOFIX_POLICY.maxFilesPerFix),
    maxLinesPerFix: clampNumber(policy.maxLinesPerFix, 1, 1000, DEFAULT_AUTOFIX_POLICY.maxLinesPerFix),
    blockedPaths: Array.isArray(policy.blockedPaths) 
      ? policy.blockedPaths.filter((p) => typeof p === 'string')
      : [...DEFAULT_AUTOFIX_POLICY.blockedPaths],
    severityThresholds: normalizeSeverityThresholds(policy.severityThresholds),
    confidenceThreshold: clampNumber(policy.confidenceThreshold, 0, 1, DEFAULT_AUTOFIX_POLICY.confidenceThreshold),
    requireTests: typeof policy.requireTests === 'boolean' ? policy.requireTests : DEFAULT_AUTOFIX_POLICY.requireTests,
    allowAIFixes: typeof policy.allowAIFixes === 'boolean' ? policy.allowAIFixes : DEFAULT_AUTOFIX_POLICY.allowAIFixes,
  };
}

/**
 * Normalize severity thresholds with validation
 */
function normalizeSeverityThresholds(
  thresholds?: Partial<AutoFixPolicy['severityThresholds']>
): AutoFixPolicy['severityThresholds'] {
  const defaults = DEFAULT_AUTOFIX_POLICY.severityThresholds;
  
  if (!thresholds) {
    return { ...defaults };
  }

  return {
    low: isFixAction(thresholds.low) ? thresholds.low : defaults.low,
    medium: isFixAction(thresholds.medium) ? thresholds.medium : defaults.medium,
    high: isFixAction(thresholds.high) ? thresholds.high : defaults.high,
    critical: isFixAction(thresholds.critical) ? thresholds.critical : defaults.critical,
  };
}

/**
 * Clamp a number to a range with default fallback
 */
function clampNumber(value: unknown, min: number, max: number, defaultValue: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return defaultValue;
  }
  return Math.max(min, Math.min(max, value));
}

/**
 * Result of processing issues through the auto-fix engine
 */
export interface FixResult {
  totalIssues: number;
  fixableIssues: number;
  appliedFixes: ProposedFix[];
  suggestedFixes: ProposedFix[];
  rejectedFixes: ProposedFix[];
  unfixableIssues: Issue[];
  errors: FixError[];
}

/**
 * Error that occurred during fix processing
 */
export interface FixError {
  issueId: string;
  phase: 'detection' | 'generation' | 'validation' | 'application';
  message: string;
  stack?: string;
}

/**
 * Transaction log entry for rollback support
 */
export interface TransactionLogEntry {
  id: string;
  timestamp: Date;
  fixes: AppliedPatch[];
  status: 'pending' | 'committed' | 'rolled_back';
  commitHash?: string;
}

/**
 * Maximum values for safety constraints
 */
export const SAFETY_LIMITS = Object.freeze({
  MAX_PATCH_SIZE_BYTES: 1024 * 1024, // 1MB max patch size
  MAX_FILE_SIZE_BYTES: 10 * 1024 * 1024, // 10MB max file size
  MAX_HUNKS_PER_PATCH: 100,
  MAX_LINES_PER_HUNK: 500,
  MAX_PATCHES_PER_TRANSACTION: 50,
  MAX_CONCURRENT_APPLIES: 5,
  BACKUP_RETENTION_DAYS: 7,
  MAX_HISTORY_ENTRIES: 1000,
});

/**
 * Check if a value exceeds safety limits
 */
export function exceedsSafetyLimit(
  limit: keyof typeof SAFETY_LIMITS,
  value: number
): boolean {
  return value > SAFETY_LIMITS[limit];
}

/**
 * Sanitize a file path to prevent directory traversal
 */
export function sanitizeFilePath(filePath: string): string {
  // Remove null bytes
  let sanitized = filePath.replace(/\0/g, '');
  
  // Normalize path separators
  sanitized = sanitized.replace(/\\/g, '/');
  
  // Remove leading/trailing whitespace
  sanitized = sanitized.trim();
  
  // Prevent directory traversal
  const parts = sanitized.split('/').filter((part) => part !== '..' && part !== '.');
  
  return parts.join('/');
}

/**
 * Check if a file path is within a base directory
 */
export function isPathWithinBase(filePath: string, basePath: string): boolean {
  const normalizedFile = sanitizeFilePath(filePath);
  const normalizedBase = sanitizeFilePath(basePath);
  
  // Simple prefix check after sanitization
  return normalizedFile.startsWith(normalizedBase) || !normalizedFile.startsWith('/');
}
