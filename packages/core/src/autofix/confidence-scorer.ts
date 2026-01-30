/**
 * Confidence Scorer
 * 
 * Evaluates and scores the confidence of proposed fixes based on
 * multiple factors including fix origin, issue severity, change scope,
 * module reliability, and historical performance.
 * 
 * Includes comprehensive input validation and bounds checking.
 */

import type {
  Issue,
  Patch,
  ConfidenceScore,
  ConfidenceLevel,
  ScoreFactor,
  FixAction,
  FixStrategy,
  AutoFixPolicy,
} from './types.js';
import { 
  isFixStrategy, 
  isIssueSeverity, 
  isConfidenceLevel,
  SAFETY_LIMITS 
} from './types.js';
import type { BaseFixModule } from './modules/base-fix-module.js';

/**
 * Configuration for the confidence scorer
 */
export interface ConfidenceScorerConfig {
  /**
   * Threshold for auto-apply recommendation (0.0 - 1.0)
   */
  autoApplyThreshold: number;

  /**
   * Threshold for suggest recommendation (fixes below this are rejected)
   */
  suggestThreshold: number;

  /**
   * Whether to allow auto-apply for critical severity issues
   */
  allowCriticalAutoApply: boolean;

  /**
   * Maximum lines changed for high confidence
   */
  maxLinesForHighConfidence: number;

  /**
   * Factor weights for scoring (must sum to ~1.0)
   */
  weights: {
    fixOrigin: number;
    issueSeverity: number;
    changeScope: number;
    moduleReliability: number;
    testCoverage: number;
    historicalSuccess: number;
  };
}

/**
 * Default configuration with validated values
 */
const DEFAULT_CONFIG: Readonly<ConfidenceScorerConfig> = Object.freeze({
  autoApplyThreshold: 0.85,
  suggestThreshold: 0.3,
  allowCriticalAutoApply: false,
  maxLinesForHighConfidence: 50,
  weights: Object.freeze({
    fixOrigin: 0.25,
    issueSeverity: 0.15,
    changeScope: 0.20,
    moduleReliability: 0.20,
    testCoverage: 0.10,
    historicalSuccess: 0.10,
  }),
});

/**
 * Validate and normalize a number to a 0-1 range
 */
function clamp01(value: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

/**
 * Safely divide with default on zero/invalid
 */
function safeDivide(numerator: number, denominator: number, defaultValue = 0): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return defaultValue;
  }
  return numerator / denominator;
}

/**
 * Historical data for a fix module
 */
export interface ModuleHistory {
  moduleId: string;
  totalFixes: number;
  successfulFixes: number;
  rolledBackFixes: number;
  averageConfidence: number;
}

/**
 * Test coverage data
 */
export interface TestCoverageData {
  filePath: string;
  coveragePercent: number;
  hasRelatedTests: boolean;
}

/**
 * ConfidenceScorer evaluates and scores proposed fixes
 */
export class ConfidenceScorer {
  private readonly config: ConfidenceScorerConfig;
  private readonly moduleHistory: Map<string, ModuleHistory> = new Map();
  private readonly testCoverage: Map<string, TestCoverageData> = new Map();
  private readonly maxHistoryEntries: number;

  constructor(config: Partial<ConfidenceScorerConfig> = {}) {
    // Validate and merge config
    this.config = this.validateConfig(config);
    this.maxHistoryEntries = SAFETY_LIMITS.MAX_HISTORY_ENTRIES;
  }

  /**
   * Validate and normalize configuration
   */
  private validateConfig(config: Partial<ConfidenceScorerConfig>): ConfidenceScorerConfig {
    const validated: ConfidenceScorerConfig = {
      autoApplyThreshold: clamp01(config.autoApplyThreshold ?? DEFAULT_CONFIG.autoApplyThreshold),
      suggestThreshold: clamp01(config.suggestThreshold ?? DEFAULT_CONFIG.suggestThreshold),
      allowCriticalAutoApply: Boolean(config.allowCriticalAutoApply ?? DEFAULT_CONFIG.allowCriticalAutoApply),
      maxLinesForHighConfidence: Math.max(
        1,
        Math.min(1000, config.maxLinesForHighConfidence ?? DEFAULT_CONFIG.maxLinesForHighConfidence)
      ),
      weights: this.validateWeights(config.weights),
    };

    // Ensure suggestThreshold < autoApplyThreshold
    if (validated.suggestThreshold >= validated.autoApplyThreshold) {
      validated.suggestThreshold = validated.autoApplyThreshold * 0.5;
    }

    return validated;
  }

  /**
   * Validate and normalize weights
   */
  private validateWeights(
    weights?: Partial<ConfidenceScorerConfig['weights']>
  ): ConfidenceScorerConfig['weights'] {
    const defaults = DEFAULT_CONFIG.weights;
    
    if (!weights) {
      return { ...defaults };
    }

    const validated = {
      fixOrigin: clamp01(weights.fixOrigin ?? defaults.fixOrigin),
      issueSeverity: clamp01(weights.issueSeverity ?? defaults.issueSeverity),
      changeScope: clamp01(weights.changeScope ?? defaults.changeScope),
      moduleReliability: clamp01(weights.moduleReliability ?? defaults.moduleReliability),
      testCoverage: clamp01(weights.testCoverage ?? defaults.testCoverage),
      historicalSuccess: clamp01(weights.historicalSuccess ?? defaults.historicalSuccess),
    };

    // Normalize weights to sum to 1
    const sum = Object.values(validated).reduce((a, b) => a + b, 0);
    if (sum > 0 && Math.abs(sum - 1) > 0.01) {
      const factor = 1 / sum;
      validated.fixOrigin *= factor;
      validated.issueSeverity *= factor;
      validated.changeScope *= factor;
      validated.moduleReliability *= factor;
      validated.testCoverage *= factor;
      validated.historicalSuccess *= factor;
    }

    return validated;
  }

  /**
   * Score a proposed fix with comprehensive validation
   */
  score(
    patch: Patch,
    issue: Issue,
    module: BaseFixModule,
    strategy: FixStrategy
  ): ConfidenceScore {
    // Input validation with fallbacks
    const validStrategy = isFixStrategy(strategy) ? strategy : 'manual';
    const validSeverity = isIssueSeverity(issue?.severity) ? issue.severity : 'medium';

    const factors: ScoreFactor[] = [];

    // Factor 1: Fix Origin
    try {
      factors.push(this.scoreFixOrigin(validStrategy));
    } catch {
      factors.push({
        name: 'fix_origin',
        weight: this.config.weights.fixOrigin,
        value: 0.5,
        description: 'Unable to determine fix origin',
      });
    }

    // Factor 2: Issue Severity
    try {
      factors.push(this.scoreIssueSeverity({ ...issue, severity: validSeverity }));
    } catch {
      factors.push({
        name: 'issue_severity',
        weight: this.config.weights.issueSeverity,
        value: 0.5,
        description: 'Unable to determine severity',
      });
    }

    // Factor 3: Change Scope
    try {
      factors.push(this.scoreChangeScope(patch));
    } catch {
      factors.push({
        name: 'change_scope',
        weight: this.config.weights.changeScope,
        value: 0.5,
        description: 'Unable to determine change scope',
      });
    }

    // Factor 4: Module Reliability
    try {
      factors.push(this.scoreModuleReliability(module));
    } catch {
      factors.push({
        name: 'module_reliability',
        weight: this.config.weights.moduleReliability,
        value: 0.5,
        description: 'Unable to determine module reliability',
      });
    }

    // Factor 5: Test Coverage
    try {
      factors.push(this.scoreTestCoverage(patch));
    } catch {
      factors.push({
        name: 'test_coverage',
        weight: this.config.weights.testCoverage,
        value: 0.5,
        description: 'Unable to determine test coverage',
      });
    }

    // Factor 6: Historical Success
    try {
      factors.push(this.scoreHistoricalSuccess(module));
    } catch {
      factors.push({
        name: 'historical_success',
        weight: this.config.weights.historicalSuccess,
        value: 0.5,
        description: 'Unable to determine historical success',
      });
    }

    // Calculate weighted average with validation
    const totalWeight = factors.reduce((sum, f) => sum + clamp01(f.weight), 0);
    const weightedSum = factors.reduce((sum, f) => sum + clamp01(f.weight) * clamp01(f.value), 0);
    const finalValue = clamp01(safeDivide(weightedSum, totalWeight, 0.5));

    // Determine level
    const level = this.determineLevel(finalValue);

    // Determine recommendation
    const recommendation = this.determineRecommendation(finalValue, { ...issue, severity: validSeverity });

    return {
      value: Math.round(finalValue * 100) / 100,
      level,
      factors,
      recommendation,
    };
  }

  /**
   * Score multiple fixes and rank them
   */
  scoreAndRank(
    fixes: Array<{
      patch: Patch;
      issue: Issue;
      module: BaseFixModule;
      strategy: FixStrategy;
    }>
  ): Array<{ fix: typeof fixes[0]; score: ConfidenceScore }> {
    const scored = fixes.map((fix) => ({
      fix,
      score: this.score(fix.patch, fix.issue, fix.module, fix.strategy),
    }));

    // Sort by confidence value descending
    return scored.sort((a, b) => b.score.value - a.score.value);
  }

  /**
   * Update module history with fix outcome
   */
  recordFixOutcome(
    moduleId: string,
    success: boolean,
    rolledBack: boolean,
    confidence: number
  ): void {
    // Input validation
    if (!moduleId || typeof moduleId !== 'string') {
      return;
    }

    const validConfidence = clamp01(confidence);
    const validSuccess = Boolean(success);
    const validRolledBack = Boolean(rolledBack);

    const existing = this.moduleHistory.get(moduleId) ?? {
      moduleId,
      totalFixes: 0,
      successfulFixes: 0,
      rolledBackFixes: 0,
      averageConfidence: 0,
    };

    const newTotal = existing.totalFixes + 1;
    
    // Prevent numeric overflow with running average
    const newAvgConfidence = clamp01(
      safeDivide(
        existing.averageConfidence * existing.totalFixes + validConfidence,
        newTotal,
        validConfidence
      )
    );

    this.moduleHistory.set(moduleId, {
      moduleId,
      totalFixes: newTotal,
      successfulFixes: existing.successfulFixes + (validSuccess ? 1 : 0),
      rolledBackFixes: existing.rolledBackFixes + (validRolledBack ? 1 : 0),
      averageConfidence: newAvgConfidence,
    });

    // Enforce history size limit
    if (this.moduleHistory.size > this.maxHistoryEntries) {
      // Remove oldest entry (first in map iteration order)
      const firstKey = this.moduleHistory.keys().next().value;
      if (firstKey) {
        this.moduleHistory.delete(firstKey);
      }
    }
  }

  /**
   * Set test coverage data for a file
   */
  setTestCoverage(filePath: string, coverage: TestCoverageData): void {
    this.testCoverage.set(filePath, coverage);
  }

  /**
   * Get the configuration
   */
  getConfig(): ConfidenceScorerConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<ConfidenceScorerConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Export module history for persistence
   */
  exportHistory(): ModuleHistory[] {
    return Array.from(this.moduleHistory.values());
  }

  /**
   * Import module history
   */
  importHistory(history: ModuleHistory[]): void {
    for (const entry of history) {
      this.moduleHistory.set(entry.moduleId, entry);
    }
  }

  /**
   * Score based on fix origin (rule-based vs AI)
   */
  private scoreFixOrigin(strategy: FixStrategy): ScoreFactor {
    let value: number;
    let description: string;

    switch (strategy) {
      case 'rule-based':
        value = 1.0;
        description = 'Deterministic rule-based fix';
        break;
      case 'ai-assisted':
        value = 0.6;
        description = 'AI-generated fix (requires more scrutiny)';
        break;
      case 'manual':
        value = 0.3;
        description = 'Manual fix suggested (high uncertainty)';
        break;
      default:
        value = 0.5;
        description = 'Unknown fix origin';
    }

    return {
      name: 'fix_origin',
      weight: this.config.weights.fixOrigin,
      value,
      description,
    };
  }

  /**
   * Score based on issue severity
   */
  private scoreIssueSeverity(issue: Issue): ScoreFactor {
    // Lower severity = higher confidence in safe application
    const severityMap: Record<string, { value: number; desc: string }> = {
      low: { value: 1.0, desc: 'Low severity - safe to auto-fix' },
      medium: { value: 0.8, desc: 'Medium severity - proceed with caution' },
      high: { value: 0.5, desc: 'High severity - review recommended' },
      critical: { value: 0.2, desc: 'Critical severity - manual review required' },
    };

    const { value, desc } = severityMap[issue.severity] ?? { value: 0.5, desc: 'Unknown severity' };

    return {
      name: 'issue_severity',
      weight: this.config.weights.issueSeverity,
      value,
      description: desc,
    };
  }

  /**
   * Score based on change scope
   */
  private scoreChangeScope(patch: Patch): ScoreFactor {
    // Handle missing or invalid patch
    if (!patch || typeof patch !== 'object') {
      return {
        name: 'change_scope',
        weight: this.config.weights.changeScope,
        value: 0.5,
        description: 'Unable to determine change scope',
      };
    }

    const content = patch.newContent || '';
    const originalContent = patch.originalContent || '';
    
    // Calculate actual lines changed (not just new content length)
    const newLines = content.split('\n');
    const originalLines = originalContent.split('\n');
    
    // Estimate lines changed as the difference
    const linesAdded = Math.max(0, newLines.length - originalLines.length);
    const linesRemoved = Math.max(0, originalLines.length - newLines.length);
    const estimatedChanges = linesAdded + linesRemoved + 
      (patch.hunks?.reduce((sum, h) => sum + (h.lines?.length || 0), 0) || 0) / 2;
    
    const lines = Math.max(1, Math.round(estimatedChanges));

    // Calculate scope score with smooth gradation
    let value: number;
    let description: string;

    if (lines <= 5) {
      value = 1.0;
      description = `Minimal change (${lines} line${lines !== 1 ? 's' : ''})`;
    } else if (lines <= 15) {
      value = 0.95;
      description = `Very small change (${lines} lines)`;
    } else if (lines <= 30) {
      value = 0.85;
      description = `Small change (${lines} lines)`;
    } else if (lines <= this.config.maxLinesForHighConfidence) {
      value = 0.7;
      description = `Moderate change (${lines} lines)`;
    } else if (lines <= 100) {
      value = 0.5;
      description = `Large change (${lines} lines)`;
    } else if (lines <= 200) {
      value = 0.35;
      description = `Very large change (${lines} lines) - review recommended`;
    } else {
      value = 0.2;
      description = `Extensive change (${lines} lines) - manual review required`;
    }

    return {
      name: 'change_scope',
      weight: this.config.weights.changeScope,
      value: clamp01(value),
      description,
    };
  }

  /**
   * Score based on module reliability
   */
  private scoreModuleReliability(module: BaseFixModule): ScoreFactor {
    const confidenceMap: Record<ConfidenceLevel, number> = {
      high: 1.0,
      medium: 0.7,
      low: 0.4,
    };

    const value = confidenceMap[module.confidence] ?? 0.5;

    return {
      name: 'module_reliability',
      weight: this.config.weights.moduleReliability,
      value,
      description: `Module ${module.id} confidence: ${module.confidence}`,
    };
  }

  /**
   * Score based on test coverage
   */
  private scoreTestCoverage(patch: Patch): ScoreFactor {
    const coverage = this.testCoverage.get(patch.filePath);

    if (!coverage) {
      return {
        name: 'test_coverage',
        weight: this.config.weights.testCoverage,
        value: 0.5,
        description: 'No test coverage data available',
      };
    }

    let value: number;
    let description: string;

    if (coverage.hasRelatedTests && coverage.coveragePercent >= 80) {
      value = 1.0;
      description = `High test coverage (${coverage.coveragePercent}%) with related tests`;
    } else if (coverage.hasRelatedTests) {
      value = 0.8;
      description = `Has related tests (${coverage.coveragePercent}% coverage)`;
    } else if (coverage.coveragePercent >= 50) {
      value = 0.6;
      description = `Moderate test coverage (${coverage.coveragePercent}%)`;
    } else {
      value = 0.4;
      description = `Low test coverage (${coverage.coveragePercent}%)`;
    }

    return {
      name: 'test_coverage',
      weight: this.config.weights.testCoverage,
      value,
      description,
    };
  }

  /**
   * Score based on historical success rate
   */
  private scoreHistoricalSuccess(module: BaseFixModule): ScoreFactor {
    const history = this.moduleHistory.get(module.id);

    if (!history || history.totalFixes < 5) {
      return {
        name: 'historical_success',
        weight: this.config.weights.historicalSuccess,
        value: 0.5,
        description: 'Insufficient historical data',
      };
    }

    const successRate = history.successfulFixes / history.totalFixes;
    const rollbackRate = history.rolledBackFixes / history.totalFixes;

    // Penalize for rollbacks
    const adjustedRate = successRate - rollbackRate * 0.5;
    const value = Math.max(0, Math.min(1, adjustedRate));

    return {
      name: 'historical_success',
      weight: this.config.weights.historicalSuccess,
      value,
      description: `Historical success rate: ${Math.round(successRate * 100)}% (${history.totalFixes} fixes)`,
    };
  }

  /**
   * Determine confidence level from score
   */
  private determineLevel(score: number): ConfidenceLevel {
    if (score >= 0.8) {
      return 'high';
    } else if (score >= 0.5) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  /**
   * Determine recommendation based on score and issue
   */
  private determineRecommendation(score: number, issue: Issue): FixAction {
    // Never auto-apply critical issues unless explicitly allowed
    if (issue.severity === 'critical' && !this.config.allowCriticalAutoApply) {
      return score >= this.config.suggestThreshold ? 'suggest' : 'reject';
    }

    // Check thresholds
    if (score >= this.config.autoApplyThreshold) {
      return 'auto_apply';
    } else if (score >= this.config.suggestThreshold) {
      return 'suggest';
    } else {
      return 'reject';
    }
  }

  /**
   * Create a scorer from policy configuration
   */
  static fromPolicy(policy: AutoFixPolicy): ConfidenceScorer {
    return new ConfidenceScorer({
      autoApplyThreshold: policy.confidenceThreshold,
      suggestThreshold: 0.3,
      maxLinesForHighConfidence: policy.maxLinesPerFix,
      allowCriticalAutoApply: policy.severityThresholds.critical === 'auto_apply',
    });
  }

  /**
   * Format a confidence score as a human-readable string
   */
  static formatScore(score: ConfidenceScore): string {
    const lines: string[] = [
      `**Confidence Score: ${Math.round(score.value * 100)}% (${score.level})**`,
      `**Recommendation: ${score.recommendation}**`,
      '',
      'Factors:',
    ];

    for (const factor of score.factors) {
      const percentage = Math.round(factor.value * 100);
      const bar = '█'.repeat(Math.floor(percentage / 10)) + '░'.repeat(10 - Math.floor(percentage / 10));
      lines.push(`- ${factor.name}: ${bar} ${percentage}%`);
      lines.push(`  ${factor.description}`);
    }

    return lines.join('\n');
  }
}
