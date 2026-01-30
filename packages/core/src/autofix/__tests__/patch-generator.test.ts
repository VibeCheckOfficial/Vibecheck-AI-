/**
 * Tests for PatchGenerator
 */

import { describe, it, expect } from 'vitest';
import { PatchGenerator } from '../patch-generator.js';

describe('PatchGenerator', () => {
  const generator = new PatchGenerator();

  describe('generatePatch', () => {
    it('should generate a patch for simple modifications', () => {
      const original = 'const x = 1;\nconst y = 2;\nconst z = 3;';
      const modified = 'const x = 1;\nconst y = 10;\nconst z = 3;';

      const patch = generator.generatePatch(
        'test.ts',
        original,
        modified,
        'issue-1',
        'test-module'
      );

      expect(patch.filePath).toBe('test.ts');
      expect(patch.originalContent).toBe(original);
      expect(patch.newContent).toBe(modified);
      expect(patch.issueId).toBe('issue-1');
      expect(patch.moduleId).toBe('test-module');
    });

    it('should generate a patch for additions', () => {
      const original = 'const x = 1;';
      const modified = 'const x = 1;\nconst y = 2;';

      const patch = generator.generatePatch(
        'test.ts',
        original,
        modified,
        'issue-1',
        'test-module'
      );

      expect(patch.newContent).toContain('const y = 2');
    });

    it('should generate a patch for deletions', () => {
      const original = 'const x = 1;\nconst y = 2;\nconst z = 3;';
      const modified = 'const x = 1;\nconst z = 3;';

      const patch = generator.generatePatch(
        'test.ts',
        original,
        modified,
        'issue-1',
        'test-module'
      );

      expect(patch.newContent).not.toContain('const y = 2');
    });

    it('should handle empty original content (new file)', () => {
      const original = '';
      const modified = 'const x = 1;';

      const patch = generator.generatePatch(
        'new-file.ts',
        original,
        modified,
        'issue-1',
        'test-module'
      );

      expect(patch.originalContent).toBe('');
      expect(patch.newContent).toBe(modified);
    });
  });

  describe('formatAsUnifiedDiff', () => {
    it('should format patch as unified diff', () => {
      const original = 'const x = 1;\nconst y = 2;';
      const modified = 'const x = 1;\nconst y = 10;';

      const patch = generator.generatePatch(
        'test.ts',
        original,
        modified,
        'issue-1',
        'test-module'
      );

      const diff = generator.formatAsUnifiedDiff(patch);

      expect(diff).toContain('--- a/test.ts');
      expect(diff).toContain('+++ b/test.ts');
      expect(diff).toContain('@@');
    });
  });

  describe('generateMultiFilePatch', () => {
    it('should generate patches for multiple files', () => {
      const changes = [
        {
          filePath: 'file1.ts',
          originalContent: 'const a = 1;',
          newContent: 'const a = 2;',
          issueId: 'issue-1',
          moduleId: 'test',
        },
        {
          filePath: 'file2.ts',
          originalContent: 'const b = 1;',
          newContent: 'const b = 2;',
          issueId: 'issue-2',
          moduleId: 'test',
        },
      ];

      const patches = generator.generateMultiFilePatch(changes);

      expect(patches).toHaveLength(2);
      expect(patches[0].filePath).toBe('file1.ts');
      expect(patches[1].filePath).toBe('file2.ts');
    });
  });

  describe('patchesConflict', () => {
    it('should detect conflicting patches', () => {
      const patch1 = generator.generatePatch(
        'test.ts',
        'line1\nline2\nline3',
        'line1\nmodified\nline3',
        'issue-1',
        'test'
      );

      const patch2 = generator.generatePatch(
        'test.ts',
        'line1\nline2\nline3',
        'line1\nalso modified\nline3',
        'issue-2',
        'test'
      );

      expect(generator.patchesConflict(patch1, patch2)).toBe(true);
    });

    it('should not detect conflict for different files', () => {
      const patch1 = generator.generatePatch(
        'file1.ts',
        'const x = 1;',
        'const x = 2;',
        'issue-1',
        'test'
      );

      const patch2 = generator.generatePatch(
        'file2.ts',
        'const y = 1;',
        'const y = 2;',
        'issue-2',
        'test'
      );

      expect(generator.patchesConflict(patch1, patch2)).toBe(false);
    });
  });

  describe('mergePatches', () => {
    it('should merge non-conflicting patches for the same file', () => {
      const patch1 = generator.generatePatch(
        'test.ts',
        'line1\nline2\nline3\nline4\nline5',
        'MODIFIED1\nline2\nline3\nline4\nline5',
        'issue-1',
        'test'
      );

      const patch2 = generator.generatePatch(
        'test.ts',
        'line1\nline2\nline3\nline4\nline5',
        'line1\nline2\nline3\nline4\nMODIFIED5',
        'issue-2',
        'test'
      );

      const merged = generator.mergePatches([patch1, patch2]);

      // Should merge into fewer patches if possible
      expect(merged.length).toBeLessThanOrEqual(2);
    });
  });
});
