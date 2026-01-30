import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  formatDuration,
  formatCount,
  formatBytes,
  formatPercent,
  truncate,
  indent,
  stripAnsi,
  visibleLength,
  padEnd,
  center,
} from '../../src/ui/theme.js';

describe('theme formatting utilities', () => {
  describe('formatDuration', () => {
    it('formats milliseconds', () => {
      expect(formatDuration(0)).toBe('0ms');
      expect(formatDuration(500)).toBe('500ms');
      expect(formatDuration(999)).toBe('999ms');
    });

    it('formats seconds', () => {
      expect(formatDuration(1000)).toBe('1.0s');
      expect(formatDuration(1500)).toBe('1.5s');
      expect(formatDuration(59999)).toBe('60.0s');
    });

    it('formats minutes and seconds', () => {
      expect(formatDuration(60000)).toBe('1m 0s');
      expect(formatDuration(90000)).toBe('1m 30s');
      expect(formatDuration(125000)).toBe('2m 5s');
    });

    it('handles negative values', () => {
      expect(formatDuration(-100)).toBe('0ms');
    });
  });

  describe('formatCount', () => {
    it('uses singular for count of 1', () => {
      expect(formatCount(1, 'file')).toBe('1 file');
      expect(formatCount(1, 'error')).toBe('1 error');
    });

    it('uses plural for other counts', () => {
      expect(formatCount(0, 'file')).toBe('0 files');
      expect(formatCount(2, 'file')).toBe('2 files');
      expect(formatCount(100, 'file')).toBe('100 files');
    });

    it('uses custom plural', () => {
      expect(formatCount(0, 'entry', 'entries')).toBe('0 entries');
      expect(formatCount(1, 'entry', 'entries')).toBe('1 entry');
      expect(formatCount(2, 'entry', 'entries')).toBe('2 entries');
    });
  });

  describe('formatBytes', () => {
    it('formats bytes', () => {
      expect(formatBytes(0)).toBe('0 B');
      expect(formatBytes(500)).toBe('500 B');
      expect(formatBytes(1023)).toBe('1023 B');
    });

    it('formats kilobytes', () => {
      expect(formatBytes(1024)).toBe('1.0 KB');
      expect(formatBytes(1536)).toBe('1.5 KB');
    });

    it('formats megabytes', () => {
      expect(formatBytes(1048576)).toBe('1.0 MB');
      expect(formatBytes(5242880)).toBe('5.0 MB');
    });

    it('formats gigabytes', () => {
      expect(formatBytes(1073741824)).toBe('1.0 GB');
    });

    it('handles negative values', () => {
      expect(formatBytes(-100)).toBe('0 B');
    });
  });

  describe('formatPercent', () => {
    it('formats percentages', () => {
      expect(formatPercent(0)).toBe('0%');
      expect(formatPercent(0.5)).toBe('50%');
      expect(formatPercent(1)).toBe('100%');
    });

    it('respects decimal places', () => {
      expect(formatPercent(0.1234, 0)).toBe('12%');
      expect(formatPercent(0.1234, 1)).toBe('12.3%');
      expect(formatPercent(0.1234, 2)).toBe('12.34%');
    });
  });

  describe('truncate', () => {
    it('returns short strings unchanged', () => {
      expect(truncate('short', 10)).toBe('short');
    });

    it('truncates long strings with ellipsis', () => {
      const result = truncate('this is a very long string', 10);
      expect(result.length).toBeLessThanOrEqual(10);
      // Ellipsis can be Unicode '…' or ASCII '...' depending on terminal capabilities
      expect(result.endsWith('…') || result.endsWith('...')).toBe(true);
    });

    it('handles exact length', () => {
      expect(truncate('exact', 5)).toBe('exact');
    });
  });

  describe('indent', () => {
    it('indents single line', () => {
      expect(indent('hello', 2)).toBe('  hello');
      expect(indent('hello', 4)).toBe('    hello');
    });

    it('indents multiple lines', () => {
      expect(indent('line1\nline2', 2)).toBe('  line1\n  line2');
    });

    it('uses default indent of 2', () => {
      expect(indent('hello')).toBe('  hello');
    });
  });

  describe('stripAnsi', () => {
    it('removes ANSI color codes', () => {
      const colored = '\x1B[31mred\x1B[0m';
      expect(stripAnsi(colored)).toBe('red');
    });

    it('removes multiple ANSI codes', () => {
      const colored = '\x1B[1m\x1B[31mbold red\x1B[0m';
      expect(stripAnsi(colored)).toBe('bold red');
    });

    it('returns plain text unchanged', () => {
      expect(stripAnsi('plain text')).toBe('plain text');
    });
  });

  describe('visibleLength', () => {
    it('returns length of plain text', () => {
      expect(visibleLength('hello')).toBe(5);
    });

    it('excludes ANSI codes from length', () => {
      const colored = '\x1B[31mhello\x1B[0m';
      expect(visibleLength(colored)).toBe(5);
    });
  });

  describe('padEnd', () => {
    it('pads short strings', () => {
      expect(padEnd('hi', 5)).toBe('hi   ');
    });

    it('accounts for ANSI codes', () => {
      const colored = '\x1B[31mhi\x1B[0m';
      const padded = padEnd(colored, 5);
      expect(stripAnsi(padded)).toBe('hi   ');
    });

    it('returns string unchanged if already long enough', () => {
      expect(padEnd('hello', 3)).toBe('hello');
    });
  });

  describe('center', () => {
    it('centers text in width', () => {
      const centered = center('hi', 6);
      expect(centered).toBe('  hi');
    });

    it('returns text unchanged if already wider', () => {
      expect(center('hello', 3)).toBe('hello');
    });
  });
});
