/**
 * Tests for AutoFixOrchestrator
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AutoFixOrchestrator } from '../orchestrator.js';
import { EnvVarFixModule } from '../modules/env-var-fix.js';
import type { Issue, FixStrategy, ProposedFix } from '../types.js';

// Mock fs module
vi.mock('fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue('{}'),
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(true),
}));

describe('AutoFixOrchestrator', () => {
  let orchestrator: AutoFixOrchestrator;

  beforeEach(() => {
    orchestrator = new AutoFixOrchestrator({
      projectRoot: '/mock/project',
      truthpackPath: '.vibecheck/truthpack',
      dryRun: true,
    });
  });

  describe('registerModule', () => {
    it('should register a fix module', () => {
      const module = new EnvVarFixModule();
      orchestrator.registerModule(module);
      
      // Module should be registered for its issue types
      expect(() => orchestrator.registerModule(module)).not.toThrow();
    });
  });

  describe('selectStrategy', () => {
    it('should select rule-based strategy for ghost-env issues', () => {
      const issue: Issue = {
        id: 'issue-1',
        type: 'ghost-env',
        severity: 'medium',
        message: 'Undefined env var',
        source: 'drift-detection',
      };

      const strategy = orchestrator.selectStrategy(issue);
      expect(strategy).toBe('rule-based');
    });

    it('should select ai-assisted strategy for complex issues', () => {
      orchestrator = new AutoFixOrchestrator({
        projectRoot: '/mock/project',
        policy: { allowAIFixes: true },
      });

      const issue: Issue = {
        id: 'issue-1',
        type: 'silent-failure',
        severity: 'medium',
        message: 'Silent failure detected',
        source: 'static-analysis',
      };

      const strategy = orchestrator.selectStrategy(issue);
      expect(strategy).toBe('ai-assisted');
    });

    it('should select manual strategy when no module available', () => {
      const issue: Issue = {
        id: 'issue-1',
        type: 'low-confidence',
        severity: 'low',
        message: 'Low confidence claim',
        source: 'policy-violation',
      };

      const strategy = orchestrator.selectStrategy(issue);
      expect(strategy).toBe('manual');
    });
  });

  describe('violationsToIssues', () => {
    it('should convert policy violations to issues', () => {
      const violations = [
        {
          policy: 'ghost-env',
          severity: 'error' as const,
          message: 'GHOST ENV: API_KEY',
          claim: { id: 'c1', type: 'env_variable' as const, value: 'API_KEY', confidence: 1 },
          suggestion: 'Add API_KEY to .env',
        },
      ];

      const issues = AutoFixOrchestrator.violationsToIssues(violations);

      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe('ghost-env');
      expect(issues[0].severity).toBe('high');
      expect(issues[0].source).toBe('policy-violation');
    });
  });

  describe('driftItemsToIssues', () => {
    it('should convert drift items to issues', () => {
      const driftItems = [
        {
          type: 'added' as const,
          category: 'env' as const,
          identifier: 'NEW_VAR',
          details: 'New env var detected',
          severity: 'medium' as const,
        },
        {
          type: 'removed' as const,
          category: 'route' as const,
          identifier: '/api/old',
          details: 'Route removed',
          severity: 'high' as const,
        },
      ];

      const issues = AutoFixOrchestrator.driftItemsToIssues(driftItems);

      expect(issues).toHaveLength(2);
      expect(issues[0].type).toBe('ghost-env');
      expect(issues[1].type).toBe('ghost-route');
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', () => {
      const result = {
        totalIssues: 10,
        fixableIssues: 8,
        appliedFixes: [],
        suggestedFixes: [],
        rejectedFixes: [],
        unfixableIssues: [],
        errors: [],
      };

      // Add some mock fixes
      const mockFix: ProposedFix = {
        id: 'mock-fix',
        issue: { id: 'i1', type: 'ghost-env', severity: 'low', message: 'Test', source: 'static-analysis' },
        patch: { filePath: 'test.ts', hunks: [], originalContent: '', newContent: '', issueId: 'i1', moduleId: 'test' },
        strategy: 'rule-based',
        confidence: { value: 0.9, level: 'high', factors: [], recommendation: 'auto_apply' },
        moduleId: 'test',
        description: 'Mock fix',
        provenance: 'Test',
      };
      
      for (let i = 0; i < 5; i++) {
        result.appliedFixes.push({ ...mockFix, id: `applied-${i}` });
      }
      for (let i = 0; i < 2; i++) {
        result.suggestedFixes.push({ ...mockFix, id: `suggested-${i}` });
      }
      result.rejectedFixes.push({ ...mockFix, id: 'rejected-1' });

      const stats = orchestrator.getStats(result);

      expect(stats.totalIssues).toBe(10);
      expect(stats.fixableIssues).toBe(8);
      expect(stats.autoApplied).toBe(5);
      expect(stats.suggested).toBe(2);
      expect(stats.rejected).toBe(1);
    });
  });

  describe('formatSummary', () => {
    it('should format results as markdown', () => {
      const result = {
        totalIssues: 5,
        fixableIssues: 3,
        appliedFixes: [
          {
            id: 'fix-1',
            issue: { id: 'i1', type: 'ghost-env', severity: 'low', message: 'Test', source: 'static-analysis' as const },
            patch: { filePath: 'test.ts', hunks: [], originalContent: '', newContent: '', issueId: 'i1', moduleId: 'test' },
            strategy: 'rule-based' as const,
            confidence: { value: 0.9, level: 'high' as const, factors: [], recommendation: 'auto_apply' as const },
            moduleId: 'test',
            description: 'Fixed env var',
            provenance: 'Rule: ghost-env',
          },
        ],
        suggestedFixes: [],
        rejectedFixes: [],
        unfixableIssues: [],
        errors: [],
      };

      const summary = orchestrator.formatSummary(result);

      expect(summary).toContain('Auto-Fix Summary');
      expect(summary).toContain('Total Issues');
      expect(summary).toContain('Applied Fixes');
    });
  });
});
