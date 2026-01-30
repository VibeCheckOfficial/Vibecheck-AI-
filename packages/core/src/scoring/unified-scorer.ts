/**
 * Unified Scorer
 * 
 * Single source of truth for all CLI command scoring.
 * All commands MUST use this module for score calculations.
 * 
 * Rules:
 * - Score is always 0-100, higher is better
 * - Verdict thresholds: SHIP >= 80, WARN >= 60, BLOCK < 60
 * - Scores are always integers (Math.round)
 * - Critical blockers force BLOCK regardless of score
 * 
 * @module scoring/unified-scorer
 */

import type {
  CommandVerdict,
  CommandCounts,
  CommandScores,
  CommandVerdictInfo,
  SeverityCounts,
} from '@repo/shared-types';

import {
  VERDICT_THRESHOLDS,
  SEVERITY_PENALTIES,
  createEmptySeverityCounts,
  createEmptyCommandCounts,
  assertCountsValid,
  assertScoresValid,
} from '@repo/shared-types';

// ============================================================================
// Score Calculation
// ============================================================================

/**
 * Calculate overall health score from finding counts
 * 
 * Formula: score = 100 - penalty
 * where penalty = min(100, sum(count * weight))
 * 
 * Weights:
 * - critical: 25 points each (4 criticals = 0 score)
 * - high: 10 points each (10 highs = 0 score)
 * - medium: 3 points each
 * - low: 1 point each
 * 
 * @param counts - Severity counts
 * @returns Score from 0-100 (integer)
 */
export function calculateHealthScore(counts: SeverityCounts): number {
  const penalty = 
    (counts.critical * SEVERITY_PENALTIES.critical) +
    (counts.high * SEVERITY_PENALTIES.high) +
    (counts.medium * SEVERITY_PENALTIES.medium) +
    (counts.low * SEVERITY_PENALTIES.low);
  
  const score = Math.max(0, 100 - Math.min(100, penalty));
  return Math.round(score);
}

/**
 * Calculate score from command counts
 * 
 * @param counts - Full command counts
 * @returns Score from 0-100 (integer)
 */
export function calculateScoreFromCounts(counts: CommandCounts): number {
  return calculateHealthScore(counts.findingsBySeverity);
}

/**
 * Calculate pass rate as a percentage
 * 
 * @param passed - Number of items that passed
 * @param total - Total number of items
 * @returns Percentage from 0-100 (integer)
 */
export function calculatePassRate(passed: number, total: number): number {
  if (total === 0) return 100;
  const rate = (passed / total) * 100;
  return Math.round(Math.max(0, Math.min(100, rate)));
}

/**
 * Calculate score from pass/fail counts
 * Maps pass rate to 0-100 score
 * 
 * @param passed - Number of items that passed
 * @param total - Total number of items
 * @returns Score from 0-100 (integer)
 */
export function calculateScoreFromPassRate(passed: number, total: number): number {
  return calculatePassRate(passed, total);
}

// ============================================================================
// Verdict Determination
// ============================================================================

/**
 * Critical blocker conditions that force BLOCK verdict
 */
export interface CriticalBlockers {
  /** Missing required environment variables */
  missingRequiredEnvVars?: number;
  /** Unprotected sensitive routes (threshold: > 2) */
  unprotectedSensitiveRoutes?: number;
  /** Ghost routes (threshold: > 5) */
  ghostRoutes?: number;
  /** Credential findings in code */
  credentialFindings?: number;
  /** Fake auth patterns */
  fakeAuthFindings?: number;
  /** Custom blocker reasons */
  customBlockers?: string[];
}

/**
 * Check if any critical blocker conditions are met
 * 
 * @param blockers - Critical blocker conditions
 * @returns Array of blocker reasons (empty if none)
 */
export function getCriticalBlockerReasons(blockers: CriticalBlockers): string[] {
  const reasons: string[] = [];
  
  if (blockers.missingRequiredEnvVars && blockers.missingRequiredEnvVars > 0) {
    reasons.push(`Missing ${blockers.missingRequiredEnvVars} required environment variable(s)`);
  }
  
  if (blockers.unprotectedSensitiveRoutes && blockers.unprotectedSensitiveRoutes > 2) {
    reasons.push(`${blockers.unprotectedSensitiveRoutes} sensitive routes without authentication`);
  }
  
  if (blockers.ghostRoutes && blockers.ghostRoutes > 5) {
    reasons.push(`${blockers.ghostRoutes} unverified ghost routes detected`);
  }
  
  if (blockers.credentialFindings && blockers.credentialFindings > 0) {
    reasons.push(`${blockers.credentialFindings} credential(s) found in code`);
  }
  
  if (blockers.fakeAuthFindings && blockers.fakeAuthFindings > 0) {
    reasons.push(`${blockers.fakeAuthFindings} fake auth pattern(s) detected`);
  }
  
  if (blockers.customBlockers) {
    reasons.push(...blockers.customBlockers);
  }
  
  return reasons;
}

/**
 * Determine verdict from score
 * 
 * @param score - Health score (0-100)
 * @returns Verdict status
 */
export function getVerdictFromScore(score: number): CommandVerdict {
  if (score >= VERDICT_THRESHOLDS.SHIP) return 'SHIP';
  if (score >= VERDICT_THRESHOLDS.WARN) return 'WARN';
  return 'BLOCK';
}

/**
 * Determine verdict with full context
 * 
 * @param score - Health score (0-100)
 * @param blockers - Optional critical blocker conditions
 * @returns Full verdict info with reasons
 */
export function determineVerdict(
  score: number,
  blockers?: CriticalBlockers
): CommandVerdictInfo {
  const reasons: string[] = [];
  
  // Check for critical blockers first
  if (blockers) {
    const blockerReasons = getCriticalBlockerReasons(blockers);
    if (blockerReasons.length > 0) {
      return {
        status: 'BLOCK',
        reasons: blockerReasons,
      };
    }
  }
  
  // Score-based verdict
  const status = getVerdictFromScore(score);
  
  if (status === 'SHIP') {
    reasons.push('All checks passed');
  } else if (status === 'WARN') {
    reasons.push(`Score ${score} is below SHIP threshold (${VERDICT_THRESHOLDS.SHIP})`);
  } else {
    reasons.push(`Score ${score} is below WARN threshold (${VERDICT_THRESHOLDS.WARN})`);
  }
  
  return { status, reasons };
}

// ============================================================================
// Score Building
// ============================================================================

/**
 * Build scores object from counts
 * 
 * @param counts - Command counts
 * @param confidence - Optional confidence score
 * @returns CommandScores object
 */
export function buildScores(
  counts: CommandCounts,
  confidence?: number
): CommandScores {
  const scores: CommandScores = {
    overall: calculateScoreFromCounts(counts),
  };
  
  if (confidence !== undefined) {
    scores.confidence = Math.round(Math.max(0, Math.min(100, confidence)));
  }
  
  return scores;
}

/**
 * Build scores from pass rate
 * 
 * @param passed - Number of items that passed
 * @param total - Total number of items
 * @param confidence - Optional confidence score
 * @returns CommandScores object
 */
export function buildScoresFromPassRate(
  passed: number,
  total: number,
  confidence?: number
): CommandScores {
  const scores: CommandScores = {
    overall: calculateScoreFromPassRate(passed, total),
  };
  
  if (confidence !== undefined) {
    scores.confidence = Math.round(Math.max(0, Math.min(100, confidence)));
  }
  
  return scores;
}

// ============================================================================
// Count Building
// ============================================================================

/**
 * Build severity counts from a list of items with severity
 * 
 * @param items - Items with severity property
 * @returns SeverityCounts object
 */
export function buildSeverityCounts<T extends { severity: string }>(
  items: T[]
): SeverityCounts {
  const counts = createEmptySeverityCounts();
  
  for (const item of items) {
    const severity = item.severity.toLowerCase();
    if (severity === 'critical') counts.critical++;
    else if (severity === 'high' || severity === 'error') counts.high++;
    else if (severity === 'medium' || severity === 'warning') counts.medium++;
    else if (severity === 'low' || severity === 'info') counts.low++;
  }
  
  return counts;
}

/**
 * Build type counts from a list of items with type
 * 
 * @param items - Items with type property
 * @returns Record of type to count
 */
export function buildTypeCounts<T extends { type: string }>(
  items: T[]
): Record<string, number> {
  const counts: Record<string, number> = {};
  
  for (const item of items) {
    const type = item.type;
    counts[type] = (counts[type] || 0) + 1;
  }
  
  return counts;
}

/**
 * Build full command counts from findings
 * 
 * @param findings - Array of findings with severity and type
 * @param filesConsidered - Number of files considered
 * @param filesScanned - Number of files scanned
 * @returns CommandCounts object
 */
export function buildCommandCounts<T extends { severity: string; type: string }>(
  findings: T[],
  filesConsidered: number,
  filesScanned: number
): CommandCounts {
  const findingsBySeverity = buildSeverityCounts(findings);
  const findingsByType = buildTypeCounts(findings);
  const findingsTotal = findings.length;
  
  const counts: CommandCounts = {
    filesConsidered,
    filesScanned,
    filesSkipped: filesConsidered - filesScanned,
    findingsTotal,
    findingsBySeverity,
    findingsByType,
  };
  
  // Validate invariants
  assertCountsValid(counts);
  
  return counts;
}

// ============================================================================
// Complete Result Building
// ============================================================================

/**
 * Options for building a complete result
 */
export interface BuildResultOptions<T extends { severity: string; type: string }> {
  /** Findings from analysis */
  findings: T[];
  /** Number of files considered */
  filesConsidered: number;
  /** Number of files scanned */
  filesScanned: number;
  /** Optional confidence score */
  confidence?: number;
  /** Optional critical blockers */
  blockers?: CriticalBlockers;
}

/**
 * Result of building scores and verdict
 */
export interface BuiltResult {
  counts: CommandCounts;
  scores: CommandScores;
  verdict: CommandVerdictInfo;
}

/**
 * Build complete result (counts, scores, verdict) from findings
 * 
 * @param options - Build options
 * @returns Complete built result
 */
export function buildResult<T extends { severity: string; type: string }>(
  options: BuildResultOptions<T>
): BuiltResult {
  const counts = buildCommandCounts(
    options.findings,
    options.filesConsidered,
    options.filesScanned
  );
  
  const scores = buildScores(counts, options.confidence);
  
  // Validate scores
  assertScoresValid(scores);
  
  const verdict = determineVerdict(scores.overall, options.blockers);
  
  return { counts, scores, verdict };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get color for score display
 * 
 * @param score - Health score (0-100)
 * @returns Color name for display
 */
export function getScoreColor(score: number): 'green' | 'yellow' | 'red' {
  if (score >= VERDICT_THRESHOLDS.SHIP) return 'green';
  if (score >= VERDICT_THRESHOLDS.WARN) return 'yellow';
  return 'red';
}

/**
 * Get status label for score display
 * 
 * @param score - Health score (0-100)
 * @returns Status label
 */
export function getScoreStatus(score: number): 'optimal' | 'stable' | 'warning' | 'critical' {
  if (score >= 90) return 'optimal';
  if (score >= VERDICT_THRESHOLDS.SHIP) return 'stable';
  if (score >= VERDICT_THRESHOLDS.WARN) return 'warning';
  return 'critical';
}

/**
 * Format score for display
 * 
 * @param score - Health score (0-100)
 * @returns Formatted string (e.g., "85/100")
 */
export function formatScore(score: number): string {
  return `${score}/100`;
}

/**
 * Format verdict for display
 * 
 * @param verdict - Verdict status
 * @returns Formatted string with emoji
 */
export function formatVerdict(verdict: CommandVerdict): string {
  const emojis = {
    SHIP: '\u2705',  // ✅
    WARN: '\u26a0\ufe0f',  // ⚠️
    BLOCK: '\ud83d\uded1',  // 🛑
  };
  return `${emojis[verdict]} ${verdict}`;
}

// ============================================================================
// Re-exports for convenience
// ============================================================================

export {
  VERDICT_THRESHOLDS,
  SEVERITY_PENALTIES,
  createEmptySeverityCounts,
  createEmptyCommandCounts,
  assertCountsValid,
  assertScoresValid,
};

export type {
  CommandVerdict,
  CommandCounts,
  CommandScores,
  CommandVerdictInfo,
  SeverityCounts,
};
