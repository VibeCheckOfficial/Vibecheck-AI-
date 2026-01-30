/**
 * Tests for ReviewPipeline
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ReviewPipeline } from '../review-pipeline.js';
import type { ProposedFix, FixResult } from '../types.js';

// Mock fs
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  copyFile: vi.fn(),
  unlink: vi.fn(),
}));

vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
}));

describe('ReviewPipeline', () => {
  let pipeline: ReviewPipeline;

  const createMockFix = (id: string, confidence = 0.85): ProposedFix => ({
    id,
    issue: {
      id: `issue-${id}`,
      type: 'ghost-env',
      severity: 'low',
      message: 'Test issue',
      source: 'static-analysis',
    },
    patch: {
      filePath: `test-${id}.ts`,
      hunks: [],
      originalContent: 'const x = 1;',
      newContent: 'const x = 2;',
      issueId: `issue-${id}`,
      moduleId: 'test',
    },
    strategy: 'rule-based',
    confidence: {
      value: confidence,
      level: confidence >= 0.8 ? 'high' : 'medium',
      factors: [],
      recommendation: confidence >= 0.85 ? 'auto_apply' : 'suggest',
    },
    moduleId: 'test-module',
    description: `Fix for ${id}`,
    provenance: 'Test',
  });

  beforeEach(() => {
    pipeline = new ReviewPipeline('/mock/project');
  });

  describe('addToQueue', () => {
    it('should add a fix to the queue', () => {
      const fix = createMockFix('1');
      const item = pipeline.addToQueue(fix);

      expect(item.id).toBe('1');
      expect(item.status).toBe('pending');
      expect(item.fix).toBe(fix);
    });
  });

  describe('approve', () => {
    it('should approve a pending fix', () => {
      const fix = createMockFix('1');
      pipeline.addToQueue(fix);

      const result = pipeline.approve('1', 'test-reviewer', 'Looks good');

      expect(result).toBe(true);
      
      const item = pipeline.getItem('1');
      expect(item?.status).toBe('approved');
      expect(item?.reviewedBy).toBe('test-reviewer');
      expect(item?.comment).toBe('Looks good');
    });

    it('should return false for non-existent fix', () => {
      const result = pipeline.approve('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('reject', () => {
    it('should reject a pending fix', () => {
      const fix = createMockFix('1');
      pipeline.addToQueue(fix);

      const result = pipeline.reject('1', 'reviewer', 'Not needed');

      expect(result).toBe(true);
      
      const item = pipeline.getItem('1');
      expect(item?.status).toBe('rejected');
    });
  });

  describe('skip', () => {
    it('should skip a pending fix', () => {
      const fix = createMockFix('1');
      pipeline.addToQueue(fix);

      const result = pipeline.skip('1');

      expect(result).toBe(true);
      expect(pipeline.getItem('1')?.status).toBe('skipped');
    });
  });

  describe('approveAll', () => {
    it('should approve all pending fixes', () => {
      pipeline.addToQueue(createMockFix('1'));
      pipeline.addToQueue(createMockFix('2'));
      pipeline.addToQueue(createMockFix('3'));

      const count = pipeline.approveAll('bulk-reviewer');

      expect(count).toBe(3);
      expect(pipeline.getApproved()).toHaveLength(3);
    });
  });

  describe('getSummary', () => {
    it('should return correct summary', () => {
      pipeline.addToQueue(createMockFix('1'));
      pipeline.addToQueue(createMockFix('2'));
      pipeline.approve('1');
      pipeline.reject('2');
      pipeline.addToQueue(createMockFix('3'));

      const summary = pipeline.getSummary();

      expect(summary.total).toBe(3);
      expect(summary.approved).toBe(1);
      expect(summary.rejected).toBe(1);
      expect(summary.pending).toBe(1);
    });
  });

  describe('process', () => {
    it('should route fixes from result', async () => {
      const result: FixResult = {
        totalIssues: 3,
        fixableIssues: 3,
        appliedFixes: [createMockFix('applied-1')],
        suggestedFixes: [createMockFix('suggested-1'), createMockFix('suggested-2')],
        rejectedFixes: [],
        unfixableIssues: [],
        errors: [],
      };

      const processed = await pipeline.process(result);

      expect(processed.autoApplied).toHaveLength(1);
      expect(processed.queued).toHaveLength(2);
      expect(pipeline.getPending()).toHaveLength(2);
    });
  });

  describe('format', () => {
    it('should format as markdown', () => {
      pipeline.addToQueue(createMockFix('1'));
      
      const markdown = pipeline.format('markdown');
      
      expect(markdown).toContain('# VibeCheck Auto-Fix Review');
      expect(markdown).toContain('Summary');
    });

    it('should format as JSON', () => {
      pipeline.addToQueue(createMockFix('1'));
      
      const json = pipeline.format('json');
      const parsed = JSON.parse(json);
      
      expect(parsed.items).toHaveLength(1);
      expect(parsed.summary).toBeDefined();
    });
  });

  describe('generatePRComment', () => {
    it('should generate PR comment body', () => {
      pipeline.addToQueue(createMockFix('1'));
      pipeline.addToQueue(createMockFix('2'));
      pipeline.approve('1');

      const comment = pipeline.generatePRComment();

      expect(comment).toContain('VibeCheck Auto-Fix Report');
      expect(comment).toContain('pending review');
    });
  });

  describe('clear', () => {
    it('should clear all items', () => {
      pipeline.addToQueue(createMockFix('1'));
      pipeline.addToQueue(createMockFix('2'));
      
      pipeline.clear();
      
      expect(pipeline.getAll()).toHaveLength(0);
    });
  });
});
