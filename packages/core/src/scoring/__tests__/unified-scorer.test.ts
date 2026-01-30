/**
 * Unified Scorer Tests
 * 
 * Tests for the canonical scoring module used by all CLI commands.
 * Ensures consistency and correctness of score calculations.
 * 
 * @module scoring/__tests__/unified-scorer.test
 */

import { describe, it, expect } from 'vitest';
import {
  calculateHealthScore,
  calculateScoreFromCounts,
  calculatePassRate,
  calculateScoreFromPassRate,
  getCriticalBlockerReasons,
  getVerdictFromScore,
  determineVerdict,
  buildScores,
  buildScoresFromPassRate,
  buildSeverityCounts,
  buildTypeCounts,
  buildCommandCounts,
  buildResult,
  getScoreColor,
  getScoreStatus,
  formatScore,
  formatVerdict,
  VERDICT_THRESHOLDS,
  SEVERITY_PENALTIES,
} from '../unified-scorer.js';
import {
  createEmptySeverityCounts,
  createEmptyCommandCounts,
  assertCountsValid,
  assertScoresValid,
  assertVerdictMatchesScore,
} from '@repo/shared-types';

describe('Unified Scorer', () => {
  // ==========================================================================
  // Score Calculation Tests
  // ==========================================================================
  
  describe('calculateHealthScore', () => {
    it('returns 100 for zero findings', () => {
      const counts = createEmptySeverityCounts();
      expect(calculateHealthScore(counts)).toBe(100);
    });

    it('applies correct penalties for each severity', () => {
      // 1 critical = 25 penalty = 75 score
      expect(calculateHealthScore({ critical: 1, high: 0, medium: 0, low: 0 })).toBe(75);
      
      // 1 high = 10 penalty = 90 score
      expect(calculateHealthScore({ critical: 0, high: 1, medium: 0, low: 0 })).toBe(90);
      
      // 1 medium = 3 penalty = 97 score
      expect(calculateHealthScore({ critical: 0, high: 0, medium: 1, low: 0 })).toBe(97);
      
      // 1 low = 1 penalty = 99 score
      expect(calculateHealthScore({ critical: 0, high: 0, medium: 0, low: 1 })).toBe(99);
    });

    it('combines penalties correctly', () => {
      // 1 critical + 1 high + 1 medium + 1 low = 25 + 10 + 3 + 1 = 39 penalty = 61 score
      expect(calculateHealthScore({ critical: 1, high: 1, medium: 1, low: 1 })).toBe(61);
    });

    it('caps score at 0 for large penalties', () => {
      // 4 criticals = 100 penalty = 0 score
      expect(calculateHealthScore({ critical: 4, high: 0, medium: 0, low: 0 })).toBe(0);
      
      // 10 highs = 100 penalty = 0 score
      expect(calculateHealthScore({ critical: 0, high: 10, medium: 0, low: 0 })).toBe(0);
    });

    it('returns integer scores', () => {
      const score = calculateHealthScore({ critical: 0, high: 0, medium: 1, low: 1 });
      expect(Number.isInteger(score)).toBe(true);
    });
  });

  describe('calculatePassRate', () => {
    it('returns 100 for all passed', () => {
      expect(calculatePassRate(10, 10)).toBe(100);
    });

    it('returns 0 for none passed', () => {
      expect(calculatePassRate(0, 10)).toBe(0);
    });

    it('returns 100 for zero total', () => {
      expect(calculatePassRate(0, 0)).toBe(100);
    });

    it('rounds to integer', () => {
      expect(calculatePassRate(1, 3)).toBe(33); // 33.33% rounds to 33
      expect(calculatePassRate(2, 3)).toBe(67); // 66.67% rounds to 67
    });
  });

  // ==========================================================================
  // Verdict Tests
  // ==========================================================================
  
  describe('getVerdictFromScore', () => {
    it('returns SHIP for score >= 80', () => {
      expect(getVerdictFromScore(80)).toBe('SHIP');
      expect(getVerdictFromScore(100)).toBe('SHIP');
      expect(getVerdictFromScore(90)).toBe('SHIP');
    });

    it('returns WARN for score >= 60 and < 80', () => {
      expect(getVerdictFromScore(60)).toBe('WARN');
      expect(getVerdictFromScore(79)).toBe('WARN');
      expect(getVerdictFromScore(70)).toBe('WARN');
    });

    it('returns BLOCK for score < 60', () => {
      expect(getVerdictFromScore(59)).toBe('BLOCK');
      expect(getVerdictFromScore(0)).toBe('BLOCK');
      expect(getVerdictFromScore(30)).toBe('BLOCK');
    });

    it('uses correct threshold constants', () => {
      expect(VERDICT_THRESHOLDS.SHIP).toBe(80);
      expect(VERDICT_THRESHOLDS.WARN).toBe(60);
    });
  });

  describe('getCriticalBlockerReasons', () => {
    it('returns empty array for no blockers', () => {
      expect(getCriticalBlockerReasons({})).toEqual([]);
    });

    it('detects missing required env vars', () => {
      const reasons = getCriticalBlockerReasons({ missingRequiredEnvVars: 3 });
      expect(reasons).toHaveLength(1);
      expect(reasons[0]).toContain('3');
      expect(reasons[0]).toContain('required environment variable');
    });

    it('detects unprotected sensitive routes over threshold', () => {
      // Threshold is > 2
      expect(getCriticalBlockerReasons({ unprotectedSensitiveRoutes: 2 })).toEqual([]);
      const reasons = getCriticalBlockerReasons({ unprotectedSensitiveRoutes: 3 });
      expect(reasons).toHaveLength(1);
      expect(reasons[0]).toContain('sensitive routes');
    });

    it('detects ghost routes over threshold', () => {
      // Threshold is > 5
      expect(getCriticalBlockerReasons({ ghostRoutes: 5 })).toEqual([]);
      const reasons = getCriticalBlockerReasons({ ghostRoutes: 6 });
      expect(reasons).toHaveLength(1);
      expect(reasons[0]).toContain('ghost routes');
    });

    it('detects credential findings', () => {
      const reasons = getCriticalBlockerReasons({ credentialFindings: 1 });
      expect(reasons).toHaveLength(1);
      expect(reasons[0]).toContain('credential');
    });

    it('includes custom blockers', () => {
      const reasons = getCriticalBlockerReasons({ 
        customBlockers: ['Custom reason 1', 'Custom reason 2'] 
      });
      expect(reasons).toContain('Custom reason 1');
      expect(reasons).toContain('Custom reason 2');
    });
  });

  describe('determineVerdict', () => {
    it('returns score-based verdict when no blockers', () => {
      expect(determineVerdict(85).status).toBe('SHIP');
      expect(determineVerdict(70).status).toBe('WARN');
      expect(determineVerdict(50).status).toBe('BLOCK');
    });

    it('returns BLOCK when critical blockers present', () => {
      const result = determineVerdict(100, { credentialFindings: 1 });
      expect(result.status).toBe('BLOCK');
      expect(result.reasons).toContain('1 credential(s) found in code');
    });

    it('includes reasons in verdict', () => {
      const shipVerdict = determineVerdict(85);
      expect(shipVerdict.reasons).toContain('All checks passed');
      
      const warnVerdict = determineVerdict(70);
      expect(warnVerdict.reasons[0]).toContain('below SHIP threshold');
      
      const blockVerdict = determineVerdict(50);
      expect(blockVerdict.reasons[0]).toContain('below WARN threshold');
    });
  });

  // ==========================================================================
  // Count Building Tests
  // ==========================================================================
  
  describe('buildSeverityCounts', () => {
    it('counts severities correctly', () => {
      const items = [
        { severity: 'critical' },
        { severity: 'high' },
        { severity: 'high' },
        { severity: 'medium' },
        { severity: 'low' },
        { severity: 'low' },
        { severity: 'low' },
      ];
      
      const counts = buildSeverityCounts(items);
      expect(counts.critical).toBe(1);
      expect(counts.high).toBe(2);
      expect(counts.medium).toBe(1);
      expect(counts.low).toBe(3);
    });

    it('handles case-insensitive severity', () => {
      const items = [
        { severity: 'CRITICAL' },
        { severity: 'High' },
        { severity: 'MEDIUM' },
      ];
      
      const counts = buildSeverityCounts(items);
      expect(counts.critical).toBe(1);
      expect(counts.high).toBe(1);
      expect(counts.medium).toBe(1);
    });

    it('maps error to high and warning to medium', () => {
      const items = [
        { severity: 'error' },
        { severity: 'warning' },
        { severity: 'info' },
      ];
      
      const counts = buildSeverityCounts(items);
      expect(counts.high).toBe(1);
      expect(counts.medium).toBe(1);
      expect(counts.low).toBe(1);
    });
  });

  describe('buildTypeCounts', () => {
    it('counts types correctly', () => {
      const items = [
        { type: 'ghost_route' },
        { type: 'ghost_route' },
        { type: 'auth_gap' },
        { type: 'env_missing' },
      ];
      
      const counts = buildTypeCounts(items);
      expect(counts).toEqual({
        ghost_route: 2,
        auth_gap: 1,
        env_missing: 1,
      });
    });
  });

  describe('buildCommandCounts', () => {
    it('builds valid counts from findings', () => {
      const findings = [
        { severity: 'high', type: 'ghost_route' },
        { severity: 'medium', type: 'drift' },
        { severity: 'low', type: 'style' },
      ];
      
      const counts = buildCommandCounts(findings, 100, 50);
      
      expect(counts.filesConsidered).toBe(100);
      expect(counts.filesScanned).toBe(50);
      expect(counts.filesSkipped).toBe(50);
      expect(counts.findingsTotal).toBe(3);
      expect(counts.findingsBySeverity.high).toBe(1);
      expect(counts.findingsBySeverity.medium).toBe(1);
      expect(counts.findingsBySeverity.low).toBe(1);
      expect(counts.findingsByType.ghost_route).toBe(1);
    });

    it('maintains invariant: total = sum(bySeverity)', () => {
      const findings = [
        { severity: 'critical', type: 'a' },
        { severity: 'high', type: 'b' },
        { severity: 'medium', type: 'c' },
        { severity: 'low', type: 'd' },
      ];
      
      const counts = buildCommandCounts(findings, 10, 10);
      
      const sumBySeverity = 
        counts.findingsBySeverity.critical +
        counts.findingsBySeverity.high +
        counts.findingsBySeverity.medium +
        counts.findingsBySeverity.low;
      
      expect(counts.findingsTotal).toBe(sumBySeverity);
    });
  });

  // ==========================================================================
  // Result Building Tests
  // ==========================================================================
  
  describe('buildResult', () => {
    it('builds complete result from findings', () => {
      const result = buildResult({
        findings: [
          { severity: 'high', type: 'ghost_route' },
          { severity: 'medium', type: 'drift' },
        ],
        filesConsidered: 100,
        filesScanned: 80,
      });
      
      expect(result.counts.findingsTotal).toBe(2);
      expect(result.scores.overall).toBeLessThan(100);
      expect(['SHIP', 'WARN', 'BLOCK']).toContain(result.verdict.status);
    });

    it('applies critical blockers', () => {
      const result = buildResult({
        findings: [],
        filesConsidered: 10,
        filesScanned: 10,
        blockers: { credentialFindings: 1 },
      });
      
      expect(result.scores.overall).toBe(100); // Perfect score
      expect(result.verdict.status).toBe('BLOCK'); // But blocked by credentials
    });
  });

  // ==========================================================================
  // Invariant Tests
  // ==========================================================================
  
  describe('Invariant Assertions', () => {
    it('assertCountsValid passes for valid counts', () => {
      const counts = buildCommandCounts(
        [{ severity: 'high', type: 'test' }],
        10,
        10
      );
      expect(() => assertCountsValid(counts)).not.toThrow();
    });

    it('assertCountsValid throws for mismatched totals', () => {
      const counts = {
        ...createEmptyCommandCounts(),
        findingsTotal: 5,
        findingsBySeverity: { critical: 1, high: 1, medium: 1, low: 1 }, // sum = 4
      };
      expect(() => assertCountsValid(counts)).toThrow('invariant violation');
    });

    it('assertScoresValid passes for valid scores', () => {
      expect(() => assertScoresValid({ overall: 0 })).not.toThrow();
      expect(() => assertScoresValid({ overall: 50 })).not.toThrow();
      expect(() => assertScoresValid({ overall: 100 })).not.toThrow();
    });

    it('assertScoresValid throws for out-of-range scores', () => {
      expect(() => assertScoresValid({ overall: -1 })).toThrow('invariant violation');
      expect(() => assertScoresValid({ overall: 101 })).toThrow('invariant violation');
      expect(() => assertScoresValid({ overall: 50.5 })).toThrow('invariant violation');
    });

    it('assertVerdictMatchesScore passes for correct verdicts', () => {
      expect(() => 
        assertVerdictMatchesScore({ status: 'SHIP', reasons: [] }, 85, false)
      ).not.toThrow();
      
      expect(() => 
        assertVerdictMatchesScore({ status: 'WARN', reasons: [] }, 70, false)
      ).not.toThrow();
      
      expect(() => 
        assertVerdictMatchesScore({ status: 'BLOCK', reasons: [] }, 50, false)
      ).not.toThrow();
    });

    it('assertVerdictMatchesScore throws for mismatched verdicts', () => {
      expect(() => 
        assertVerdictMatchesScore({ status: 'SHIP', reasons: [] }, 70, false)
      ).toThrow('invariant violation');
    });

    it('assertVerdictMatchesScore requires BLOCK for critical blockers', () => {
      expect(() => 
        assertVerdictMatchesScore({ status: 'SHIP', reasons: [] }, 100, true)
      ).toThrow('critical blocker');
      
      expect(() => 
        assertVerdictMatchesScore({ status: 'BLOCK', reasons: [] }, 100, true)
      ).not.toThrow();
    });
  });

  // ==========================================================================
  // Utility Function Tests
  // ==========================================================================
  
  describe('Utility Functions', () => {
    it('getScoreColor returns correct colors', () => {
      expect(getScoreColor(80)).toBe('green');
      expect(getScoreColor(100)).toBe('green');
      expect(getScoreColor(60)).toBe('yellow');
      expect(getScoreColor(79)).toBe('yellow');
      expect(getScoreColor(59)).toBe('red');
      expect(getScoreColor(0)).toBe('red');
    });

    it('getScoreStatus returns correct statuses', () => {
      expect(getScoreStatus(90)).toBe('optimal');
      expect(getScoreStatus(80)).toBe('stable');
      expect(getScoreStatus(60)).toBe('warning');
      expect(getScoreStatus(59)).toBe('critical');
    });

    it('formatScore returns correct format', () => {
      expect(formatScore(85)).toBe('85/100');
      expect(formatScore(0)).toBe('0/100');
      expect(formatScore(100)).toBe('100/100');
    });

    it('formatVerdict returns correct format with emojis', () => {
      expect(formatVerdict('SHIP')).toContain('SHIP');
      expect(formatVerdict('WARN')).toContain('WARN');
      expect(formatVerdict('BLOCK')).toContain('BLOCK');
    });
  });

  // ==========================================================================
  // Constants Tests
  // ==========================================================================
  
  describe('Constants', () => {
    it('SEVERITY_PENALTIES are correctly weighted', () => {
      // Critical should be highest
      expect(SEVERITY_PENALTIES.critical).toBeGreaterThan(SEVERITY_PENALTIES.high);
      expect(SEVERITY_PENALTIES.high).toBeGreaterThan(SEVERITY_PENALTIES.medium);
      expect(SEVERITY_PENALTIES.medium).toBeGreaterThan(SEVERITY_PENALTIES.low);
    });

    it('4 criticals should result in score 0', () => {
      const penalty = 4 * SEVERITY_PENALTIES.critical;
      expect(penalty).toBeGreaterThanOrEqual(100);
    });

    it('10 highs should result in score 0', () => {
      const penalty = 10 * SEVERITY_PENALTIES.high;
      expect(penalty).toBeGreaterThanOrEqual(100);
    });
  });
});
