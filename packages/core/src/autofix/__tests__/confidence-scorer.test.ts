/**
 * Tests for ConfidenceScorer
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ConfidenceScorer } from '../confidence-scorer.js';
import type { Issue, Patch, ConfidenceLevel, IssueType } from '../types.js';
import { BaseFixModule } from '../modules/base-fix-module.js';

// Mock fix module for testing
class MockFixModule extends BaseFixModule {
  readonly id = 'mock-module';
  readonly name = 'Mock Module';
  readonly issueTypes: IssueType[] = ['ghost-env'];
  readonly confidence: ConfidenceLevel;

  constructor(confidence: ConfidenceLevel = 'high') {
    super();
    this.confidence = confidence;
  }

  canFix(): boolean {
    return true;
  }

  async generateFix(): Promise<Patch | null> {
    return null;
  }

  getFixDescription(): string {
    return 'Mock fix';
  }

  protected getModuleDescription(): string {
    return 'Mock module for testing';
  }
}

describe('ConfidenceScorer', () => {
  let scorer: ConfidenceScorer;

  beforeEach(() => {
    scorer = new ConfidenceScorer();
  });

  describe('score', () => {
    it('should score a high-confidence rule-based fix highly', () => {
      const patch: Patch = {
        filePath: 'test.ts',
        hunks: [],
        originalContent: 'const x = 1;',
        newContent: 'const x = 2;',
        issueId: 'issue-1',
        moduleId: 'test',
      };

      const issue: Issue = {
        id: 'issue-1',
        type: 'ghost-env',
        severity: 'low',
        message: 'Test issue',
        source: 'static-analysis',
      };

      const module = new MockFixModule('high');
      const score = scorer.score(patch, issue, module, 'rule-based');

      expect(score.value).toBeGreaterThanOrEqual(0.7);
      expect(score.level).toBe('high');
    });

    it('should score AI-assisted fixes lower', () => {
      const patch: Patch = {
        filePath: 'test.ts',
        hunks: [],
        originalContent: 'const x = 1;',
        newContent: 'const x = 2;',
        issueId: 'issue-1',
        moduleId: 'test',
      };

      const issue: Issue = {
        id: 'issue-1',
        type: 'ghost-env',
        severity: 'low',
        message: 'Test issue',
        source: 'static-analysis',
      };

      const module = new MockFixModule('high');
      const ruleBasedScore = scorer.score(patch, issue, module, 'rule-based');
      const aiScore = scorer.score(patch, issue, module, 'ai-assisted');

      expect(aiScore.value).toBeLessThan(ruleBasedScore.value);
    });

    it('should penalize high-severity issues', () => {
      const patch: Patch = {
        filePath: 'test.ts',
        hunks: [],
        originalContent: 'const x = 1;',
        newContent: 'const x = 2;',
        issueId: 'issue-1',
        moduleId: 'test',
      };

      const lowIssue: Issue = {
        id: 'issue-1',
        type: 'ghost-env',
        severity: 'low',
        message: 'Test issue',
        source: 'static-analysis',
      };

      const highIssue: Issue = {
        id: 'issue-2',
        type: 'ghost-env',
        severity: 'high',
        message: 'Test issue',
        source: 'static-analysis',
      };

      const module = new MockFixModule('high');
      const lowScore = scorer.score(patch, lowIssue, module, 'rule-based');
      const highScore = scorer.score(patch, highIssue, module, 'rule-based');

      expect(highScore.value).toBeLessThan(lowScore.value);
    });

    it('should penalize large changes', () => {
      const smallPatch: Patch = {
        filePath: 'test.ts',
        hunks: [],
        originalContent: 'const x = 1;',
        newContent: 'const x = 2;',
        issueId: 'issue-1',
        moduleId: 'test',
      };

      const largePatch: Patch = {
        filePath: 'test.ts',
        hunks: [],
        originalContent: 'const x = 1;',
        newContent: Array(100).fill('const line = 1;').join('\n'),
        issueId: 'issue-1',
        moduleId: 'test',
      };

      const issue: Issue = {
        id: 'issue-1',
        type: 'ghost-env',
        severity: 'low',
        message: 'Test issue',
        source: 'static-analysis',
      };

      const module = new MockFixModule('high');
      const smallScore = scorer.score(smallPatch, issue, module, 'rule-based');
      const largeScore = scorer.score(largePatch, issue, module, 'rule-based');

      expect(largeScore.value).toBeLessThan(smallScore.value);
    });

    it('should include relevant factors', () => {
      const patch: Patch = {
        filePath: 'test.ts',
        hunks: [],
        originalContent: 'const x = 1;',
        newContent: 'const x = 2;',
        issueId: 'issue-1',
        moduleId: 'test',
      };

      const issue: Issue = {
        id: 'issue-1',
        type: 'ghost-env',
        severity: 'low',
        message: 'Test issue',
        source: 'static-analysis',
      };

      const module = new MockFixModule('high');
      const score = scorer.score(patch, issue, module, 'rule-based');

      const factorNames = score.factors.map((f) => f.name);
      expect(factorNames).toContain('fix_origin');
      expect(factorNames).toContain('issue_severity');
      expect(factorNames).toContain('change_scope');
      expect(factorNames).toContain('module_reliability');
    });
  });

  describe('scoreAndRank', () => {
    it('should rank fixes by confidence', () => {
      const fixes = [
        {
          patch: {
            filePath: 'test.ts',
            hunks: [],
            originalContent: 'x',
            newContent: Array(100).fill('line').join('\n'),
            issueId: 'issue-1',
            moduleId: 'test',
          },
          issue: {
            id: 'issue-1',
            type: 'ghost-env' as IssueType,
            severity: 'high' as const,
            message: 'Test',
            source: 'static-analysis' as const,
          },
          module: new MockFixModule('low'),
          strategy: 'ai-assisted' as const,
        },
        {
          patch: {
            filePath: 'test.ts',
            hunks: [],
            originalContent: 'x',
            newContent: 'y',
            issueId: 'issue-2',
            moduleId: 'test',
          },
          issue: {
            id: 'issue-2',
            type: 'ghost-env' as IssueType,
            severity: 'low' as const,
            message: 'Test',
            source: 'static-analysis' as const,
          },
          module: new MockFixModule('high'),
          strategy: 'rule-based' as const,
        },
      ];

      const ranked = scorer.scoreAndRank(fixes);

      // Second fix should be ranked higher (better conditions)
      expect(ranked[0].fix.issue.id).toBe('issue-2');
    });
  });

  describe('recordFixOutcome', () => {
    it('should track fix outcomes for historical scoring', () => {
      scorer.recordFixOutcome('test-module', true, false, 0.9);
      scorer.recordFixOutcome('test-module', true, false, 0.85);
      scorer.recordFixOutcome('test-module', false, false, 0.7);

      const history = scorer.exportHistory();
      const moduleHistory = history.find((h) => h.moduleId === 'test-module');

      expect(moduleHistory).toBeDefined();
      expect(moduleHistory!.totalFixes).toBe(3);
      expect(moduleHistory!.successfulFixes).toBe(2);
    });
  });

  describe('formatScore', () => {
    it('should format score as readable string', () => {
      const patch: Patch = {
        filePath: 'test.ts',
        hunks: [],
        originalContent: 'const x = 1;',
        newContent: 'const x = 2;',
        issueId: 'issue-1',
        moduleId: 'test',
      };

      const issue: Issue = {
        id: 'issue-1',
        type: 'ghost-env',
        severity: 'low',
        message: 'Test issue',
        source: 'static-analysis',
      };

      const module = new MockFixModule('high');
      const score = scorer.score(patch, issue, module, 'rule-based');

      const formatted = ConfidenceScorer.formatScore(score);

      expect(formatted).toContain('Confidence Score');
      expect(formatted).toContain('Recommendation');
      expect(formatted).toContain('Factors');
    });
  });
});
