/**
 * Scoring Module
 * 
 * Provides Ship Score calculation and unified scoring utilities.
 * 
 * @module scoring
 */

// ============================================================================
// Unified Scorer (Canonical CLI Scoring)
// ============================================================================

export {
  // Score calculation
  calculateHealthScore,
  calculateScoreFromCounts,
  calculatePassRate,
  calculateScoreFromPassRate,
  // Verdict determination
  getCriticalBlockerReasons,
  getVerdictFromScore,
  determineVerdict,
  // Score building
  buildScores,
  buildScoresFromPassRate,
  // Count building
  buildSeverityCounts,
  buildTypeCounts,
  buildCommandCounts,
  // Complete result building
  buildResult,
  // Utility functions
  getScoreColor,
  getScoreStatus,
  formatScore,
  formatVerdict,
  // Re-exports from shared-types
  VERDICT_THRESHOLDS,
  SEVERITY_PENALTIES,
  createEmptySeverityCounts,
  createEmptyCommandCounts,
  assertCountsValid,
  assertScoresValid,
} from './unified-scorer.js';

export type {
  CriticalBlockers,
  BuildResultOptions,
  BuiltResult,
} from './unified-scorer.js';

// ============================================================================
// Category Scorer (Weighted Category-Based Scoring)
// ============================================================================

export {
  CATEGORY_SCORE_CONFIG,
  calculateCategoryScore,
  getCategoryForEngine,
  toSeverityCounts,
  formatScorePercent,
  formatScoreOutOf100,
  getCategoryNames,
  getCategoryWeight,
} from './category-scorer.js';

export type {
  CategoryFinding,
  CategoryScore,
  CategoryScoreResult,
  DeductionBreakdown,
} from './category-scorer.js';

// ============================================================================
// Ship Score (6-Dimension Detailed Scoring)
// ============================================================================

export {
  ShipScoreCalculator,
  createShipScoreCalculator,
  calculateShipScore,
  getTopFixableIssues,
  formatShipScore,
  shipScoreCalculator,
} from './ship-score.js';

export type {
  ShipVerdict,
  ShipScoreDimensions,
  ShipScoreBreakdown,
  ShipScoreMetrics,
  ShipScoreInput,
  ShipScoreFinding,
  RealityModeResults,
  DriftResults,
} from './ship-score.js';
