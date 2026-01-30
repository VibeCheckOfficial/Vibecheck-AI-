/**
 * Command Result Types
 * 
 * Canonical output contract for all VibeCheck CLI commands.
 * This is the single source of truth for CLI output.
 * 
 * Rules:
 * - JSON output serializes this object directly
 * - Terminal UI renders from this object only
 * - No renderer may compute scores or percentages
 * 
 * @module command-result
 */

// ============================================================================
// Verdict Types
// ============================================================================

/**
 * Command verdict status
 * Higher scores lead to better verdicts
 */
export const COMMAND_VERDICTS = ['SHIP', 'WARN', 'BLOCK'] as const;
export type CommandVerdict = (typeof COMMAND_VERDICTS)[number];

/**
 * Verdict thresholds
 * - SHIP: score >= 80
 * - WARN: score >= 60
 * - BLOCK: score < 60
 */
export const VERDICT_THRESHOLDS = {
  SHIP: 80,
  WARN: 60,
} as const;

// ============================================================================
// Severity Types
// ============================================================================

/**
 * Finding severity levels (4-tier)
 * Uses 4-tier for more granular scoring
 */
export const COMMAND_SEVERITIES = ['critical', 'high', 'medium', 'low'] as const;
export type CommandSeverity = (typeof COMMAND_SEVERITIES)[number];

/**
 * Severity counts structure
 */
export interface SeverityCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

/**
 * Severity penalty weights for score calculation
 * Score = 100 - penalty, where penalty = sum(count * weight)
 */
export const SEVERITY_PENALTIES = {
  critical: 25,
  high: 10,
  medium: 3,
  low: 1,
} as const;

// ============================================================================
// Phase Timing Types
// ============================================================================

/**
 * Timing information for a single phase
 */
export interface CommandPhase {
  /** Phase name (e.g., "discovery", "analysis", "render") */
  name: string;
  /** Duration in milliseconds */
  durationMs: number;
}

// ============================================================================
// Input Types
// ============================================================================

/**
 * Command input configuration
 */
export interface CommandInputs {
  /** CLI flags that were passed */
  flags: Record<string, unknown>;
  /** Path to config file used (if any) */
  configPath?: string;
  /** File patterns included in scan */
  includePatterns: string[];
  /** File patterns excluded from scan */
  excludePatterns: string[];
}

// ============================================================================
// Count Types
// ============================================================================

/**
 * Command counts - single source of truth for all counts
 * 
 * INVARIANT: findingsTotal === sum(findingsBySeverity)
 */
export interface CommandCounts {
  /** Files that matched include patterns */
  filesConsidered: number;
  /** Files that were actually analyzed */
  filesScanned: number;
  /** Files skipped (cached, excluded, binary, etc.) */
  filesSkipped: number;
  /** Total findings count - MUST equal sum of findingsBySeverity */
  findingsTotal: number;
  /** Findings broken down by severity */
  findingsBySeverity: SeverityCounts;
  /** Findings broken down by type (e.g., ghost_route, auth_gap) */
  findingsByType: Record<string, number>;
}

// ============================================================================
// Score Types
// ============================================================================

/**
 * Command scores - always 0-100, higher is better
 */
export interface CommandScores {
  /** Primary health score (0-100) */
  overall: number;
  /** Analysis confidence score (0-100, optional) */
  confidence?: number;
}

// ============================================================================
// Verdict Types
// ============================================================================

/**
 * Command verdict with reasons
 */
export interface CommandVerdictInfo {
  /** SHIP, WARN, or BLOCK */
  status: CommandVerdict;
  /** Human-readable reasons for the verdict */
  reasons: string[];
}

// ============================================================================
// Artifact Types
// ============================================================================

/**
 * Output artifacts from command execution
 */
export interface CommandArtifacts {
  /** Path to generated report (if any) */
  reportPath?: string;
  /** Path to truthpack directory (if any) */
  truthpackPath?: string;
  /** Paths to receipt files (if any) */
  receipts?: string[];
}

// ============================================================================
// Command-Specific Data Types
// ============================================================================

/**
 * Scan-specific result data
 */
export interface ScanResultData {
  /** Number of routes discovered */
  routes: number;
  /** Number of environment variables discovered */
  env: number;
  /** Number of auth patterns discovered */
  auth: number;
  /** Number of contracts discovered */
  contracts: number;
}

/**
 * Ship-specific check result
 */
export interface ShipCheckResult {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
  details?: string[];
  fixable?: boolean;
  fixed?: boolean;
  durationMs?: number;
}

/**
 * Ship-specific result data
 */
export interface ShipResultData {
  /** Individual check results */
  checks: ShipCheckResult[];
  /** Number of auto-fixes applied */
  fixesApplied: number;
  /** Number of blocking issues */
  blockers: number;
  /** Number of warnings */
  warnings: number;
}

/**
 * Check-specific result data
 */
export interface CheckResultData {
  /** Number of hallucinations detected */
  hallucinationCount: number;
  /** Number of drift items detected */
  driftCount: number;
}

/**
 * Validate-specific result data
 */
export interface ValidateResultData {
  /** Number of files passed validation */
  passed: number;
  /** Number of files failed validation */
  failed: number;
  /** Number of warnings */
  warnings: number;
}

// ============================================================================
// Main Command Result Type
// ============================================================================

/**
 * Canonical command result structure
 * 
 * This is the single source of truth for all CLI command outputs.
 * JSON output serializes this directly; terminal UI renders from this only.
 */
export interface CommandResult<TData = unknown> {
  // === Identity ===
  /** Command name (e.g., "scan", "ship", "check") */
  commandName: string;
  /** CLI version */
  version: string;
  /** Absolute path to repository root */
  repoRoot: string;
  
  // === Timing ===
  /** ISO 8601 timestamp when command started */
  startedAt: string;
  /** Total wall-clock duration in milliseconds */
  durationMs: number;
  /** Breakdown by phase */
  phases: CommandPhase[];
  
  // === Inputs ===
  /** Input configuration */
  inputs: CommandInputs;
  
  // === Counts ===
  /** File and finding counts (single source of truth) */
  counts: CommandCounts;
  
  // === Scores ===
  /** Health scores (0-100, higher is better) */
  scores: CommandScores;
  
  // === Verdict ===
  /** Command verdict with reasons */
  verdict: CommandVerdictInfo;
  
  // === Artifacts ===
  /** Output artifacts */
  artifacts: CommandArtifacts;
  
  // === Messages ===
  /** Warning messages */
  warnings: string[];
  /** Error messages */
  errors: string[];
  
  // === Command-Specific Data ===
  /** Additional data specific to the command */
  data?: TData;
}

// ============================================================================
// Typed Command Results
// ============================================================================

/**
 * Scan command result
 */
export type ScanCommandResult = CommandResult<ScanResultData>;

/**
 * Ship command result
 */
export type ShipCommandResult = CommandResult<ShipResultData>;

/**
 * Check command result
 */
export type CheckCommandResult = CommandResult<CheckResultData>;

/**
 * Validate command result
 */
export type ValidateCommandResult = CommandResult<ValidateResultData>;

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if a value is a valid command verdict
 */
export function isCommandVerdict(value: unknown): value is CommandVerdict {
  return typeof value === 'string' && COMMAND_VERDICTS.includes(value as CommandVerdict);
}

/**
 * Check if a value is a valid command severity
 */
export function isCommandSeverity(value: unknown): value is CommandSeverity {
  return typeof value === 'string' && COMMAND_SEVERITIES.includes(value as CommandSeverity);
}

// ============================================================================
// Invariant Assertions
// ============================================================================

/**
 * Assert that counts are internally consistent
 * @throws Error if invariant is violated
 */
export function assertCountsValid(counts: CommandCounts): void {
  const sumBySeverity = 
    counts.findingsBySeverity.critical +
    counts.findingsBySeverity.high +
    counts.findingsBySeverity.medium +
    counts.findingsBySeverity.low;
  
  if (counts.findingsTotal !== sumBySeverity) {
    throw new Error(
      `Count invariant violation: findingsTotal (${counts.findingsTotal}) !== ` +
      `sum of findingsBySeverity (${sumBySeverity})`
    );
  }
  
  const sumByType = Object.values(counts.findingsByType).reduce((a, b) => a + b, 0);
  if (counts.findingsTotal !== sumByType && sumByType > 0) {
    throw new Error(
      `Count invariant violation: findingsTotal (${counts.findingsTotal}) !== ` +
      `sum of findingsByType (${sumByType})`
    );
  }
}

/**
 * Assert that scores are in valid range
 * @throws Error if score is out of range
 */
export function assertScoresValid(scores: CommandScores): void {
  if (scores.overall < 0 || scores.overall > 100 || !Number.isInteger(scores.overall)) {
    throw new Error(
      `Score invariant violation: overall score (${scores.overall}) must be integer 0-100`
    );
  }
  
  if (scores.confidence !== undefined) {
    if (scores.confidence < 0 || scores.confidence > 100 || !Number.isInteger(scores.confidence)) {
      throw new Error(
        `Score invariant violation: confidence score (${scores.confidence}) must be integer 0-100`
      );
    }
  }
}

/**
 * Assert that verdict matches score thresholds (unless critical blocker)
 * @throws Error if verdict doesn't match score
 */
export function assertVerdictMatchesScore(
  verdict: CommandVerdictInfo,
  score: number,
  hasCriticalBlocker: boolean
): void {
  if (hasCriticalBlocker && verdict.status !== 'BLOCK') {
    throw new Error(
      `Verdict invariant violation: critical blocker present but verdict is ${verdict.status}`
    );
  }
  
  if (!hasCriticalBlocker) {
    const expectedVerdict = 
      score >= VERDICT_THRESHOLDS.SHIP ? 'SHIP' :
      score >= VERDICT_THRESHOLDS.WARN ? 'WARN' : 'BLOCK';
    
    if (verdict.status !== expectedVerdict) {
      throw new Error(
        `Verdict invariant violation: score ${score} should yield ${expectedVerdict} ` +
        `but got ${verdict.status}`
      );
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create empty severity counts
 */
export function createEmptySeverityCounts(): SeverityCounts {
  return {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };
}

/**
 * Create empty command counts
 */
export function createEmptyCommandCounts(): CommandCounts {
  return {
    filesConsidered: 0,
    filesScanned: 0,
    filesSkipped: 0,
    findingsTotal: 0,
    findingsBySeverity: createEmptySeverityCounts(),
    findingsByType: {},
  };
}

/**
 * Create default command inputs
 */
export function createDefaultCommandInputs(): CommandInputs {
  return {
    flags: {},
    includePatterns: [],
    excludePatterns: [],
  };
}

/**
 * Create a minimal command result
 */
export function createCommandResult<TData = unknown>(
  partial: Partial<CommandResult<TData>> & Pick<CommandResult<TData>, 'commandName' | 'version' | 'repoRoot'>
): CommandResult<TData> {
  const now = new Date().toISOString();
  
  return {
    commandName: partial.commandName,
    version: partial.version,
    repoRoot: partial.repoRoot,
    startedAt: partial.startedAt ?? now,
    durationMs: partial.durationMs ?? 0,
    phases: partial.phases ?? [],
    inputs: partial.inputs ?? createDefaultCommandInputs(),
    counts: partial.counts ?? createEmptyCommandCounts(),
    scores: partial.scores ?? { overall: 100 },
    verdict: partial.verdict ?? { status: 'SHIP', reasons: [] },
    artifacts: partial.artifacts ?? {},
    warnings: partial.warnings ?? [],
    errors: partial.errors ?? [],
    data: partial.data,
  };
}
