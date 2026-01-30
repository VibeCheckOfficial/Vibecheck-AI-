import { describe, it, expect, vi } from 'vitest';
import {
  VibeCheckError,
  isVibeCheckError,
  wrapError,
  withRetry,
  withTimeout,
  assert,
  assertDefined,
  createErrorHandler,
} from '../../src/lib/errors.js';

describe('errors', () => {
  describe('VibeCheckError', () => {
    it('creates error with message and code', () => {
      const error = new VibeCheckError('Test error', 'CONFIG_NOT_FOUND');
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('CONFIG_NOT_FOUND');
      expect(error.name).toBe('VibeCheckError');
    });

    it('includes suggestions', () => {
      const error = new VibeCheckError('Test error', 'CONFIG_NOT_FOUND', {
        suggestions: ['Try this', 'Or that'],
      });
      expect(error.suggestions).toEqual(['Try this', 'Or that']);
    });

    it('includes cause', () => {
      const cause = new Error('Original error');
      const error = new VibeCheckError('Wrapped error', 'UNKNOWN_ERROR', {
        cause,
      });
      expect(error.cause).toBe(cause);
    });

    it('includes context', () => {
      const error = new VibeCheckError('Test error', 'FILE_NOT_FOUND', {
        context: { file: '/path/to/file', line: 42 },
      });
      expect(error.context.file).toBe('/path/to/file');
      expect(error.context.line).toBe(42);
    });

    it('sets severity based on code', () => {
      const fatal = new VibeCheckError('Fatal', 'OUT_OF_MEMORY');
      expect(fatal.severity).toBe('fatal');

      const warning = new VibeCheckError('Warning', 'TRUTHPACK_STALE');
      expect(warning.severity).toBe('warning');

      const error = new VibeCheckError('Error', 'CONFIG_NOT_FOUND');
      expect(error.severity).toBe('error');
    });

    it('sets recoverable based on code', () => {
      const recoverable = new VibeCheckError('Recoverable', 'NETWORK_TIMEOUT');
      expect(recoverable.recoverable).toBe(true);

      const notRecoverable = new VibeCheckError('Not recoverable', 'OUT_OF_MEMORY');
      expect(notRecoverable.recoverable).toBe(false);
    });

    it('creates from error code with defaults', () => {
      const error = VibeCheckError.fromCode('CONFIG_NOT_FOUND');
      expect(error.message).toBe('Configuration file not found');
      expect(error.code).toBe('CONFIG_NOT_FOUND');
      expect(error.suggestions.length).toBeGreaterThan(0);
    });

    it('creates from error code with custom message', () => {
      const error = VibeCheckError.fromCode('CONFIG_NOT_FOUND', 'Custom message');
      expect(error.message).toBe('Custom message');
      expect(error.code).toBe('CONFIG_NOT_FOUND');
    });

    it('creates from error code with context', () => {
      const error = VibeCheckError.fromCode('FILE_NOT_FOUND', undefined, {
        context: { file: '/test/file' },
      });
      expect(error.context.file).toBe('/test/file');
    });

    it('withContext creates new error with added context', () => {
      const original = new VibeCheckError('Test', 'UNKNOWN_ERROR');
      const withCtx = original.withContext({ file: '/test' });
      expect(withCtx.context.file).toBe('/test');
      expect(original.context.file).toBeUndefined();
    });

    it('withSuggestions creates new error with added suggestions', () => {
      const original = new VibeCheckError('Test', 'UNKNOWN_ERROR', {
        suggestions: ['First'],
      });
      const withSugs = original.withSuggestions(['Second']);
      expect(withSugs.suggestions).toEqual(['First', 'Second']);
    });

    it('toJSON returns serializable object', () => {
      const error = new VibeCheckError('Test', 'CONFIG_NOT_FOUND');
      const json = error.toJSON();
      expect(json.name).toBe('VibeCheckError');
      expect(json.code).toBe('CONFIG_NOT_FOUND');
      expect(json.message).toBe('Test');
      expect(json.timestamp).toBeDefined();
    });

    it('format produces readable output', () => {
      const error = new VibeCheckError('Test error', 'FILE_NOT_FOUND', {
        suggestions: ['Check the path'],
        context: { file: '/test/file.ts', line: 10 },
      });
      const formatted = error.format();
      expect(formatted).toContain('[FILE_NOT_FOUND]');
      expect(formatted).toContain('Test error');
      expect(formatted).toContain('/test/file.ts:10');
      expect(formatted).toContain('Check the path');
    });
  });

  describe('isVibeCheckError', () => {
    it('returns true for VibeCheckError', () => {
      const error = new VibeCheckError('Test', 'UNKNOWN_ERROR');
      expect(isVibeCheckError(error)).toBe(true);
    });

    it('returns false for regular Error', () => {
      const error = new Error('Test');
      expect(isVibeCheckError(error)).toBe(false);
    });

    it('returns false for non-errors', () => {
      expect(isVibeCheckError('string')).toBe(false);
      expect(isVibeCheckError(null)).toBe(false);
      expect(isVibeCheckError(undefined)).toBe(false);
      expect(isVibeCheckError({})).toBe(false);
    });
  });

  describe('wrapError', () => {
    it('returns VibeCheckError as-is', () => {
      const original = new VibeCheckError('Test', 'CONFIG_NOT_FOUND');
      const wrapped = wrapError(original);
      expect(wrapped).toBe(original);
    });

    it('wraps regular Error', () => {
      const original = new Error('Test error');
      const wrapped = wrapError(original);
      expect(wrapped).toBeInstanceOf(VibeCheckError);
      expect(wrapped.message).toBe('Test error');
      expect(wrapped.code).toBe('UNKNOWN_ERROR');
      expect(wrapped.cause).toBe(original);
    });

    it('wraps string errors', () => {
      const wrapped = wrapError('String error');
      expect(wrapped).toBeInstanceOf(VibeCheckError);
      expect(wrapped.message).toBe('String error');
      expect(wrapped.code).toBe('UNKNOWN_ERROR');
    });

    it('wraps unknown values', () => {
      const wrapped = wrapError(42);
      expect(wrapped).toBeInstanceOf(VibeCheckError);
      expect(wrapped.message).toBe('42');
    });

    it('adds context when provided', () => {
      const wrapped = wrapError(new Error('Test'), { file: '/test' });
      expect(wrapped.context.file).toBe('/test');
    });

    it('detects ENOENT as FILE_NOT_FOUND', () => {
      const error = new Error('ENOENT') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      const wrapped = wrapError(error);
      expect(wrapped.code).toBe('FILE_NOT_FOUND');
    });

    it('detects EACCES as PERMISSION_DENIED', () => {
      const error = new Error('EACCES') as NodeJS.ErrnoException;
      error.code = 'EACCES';
      const wrapped = wrapError(error);
      expect(wrapped.code).toBe('PERMISSION_DENIED');
    });
  });

  describe('createErrorHandler', () => {
    it('calls callback with wrapped error', () => {
      const callback = vi.fn();
      const handler = createErrorHandler(callback);
      handler(new Error('Test'));
      expect(callback).toHaveBeenCalledWith(expect.any(VibeCheckError));
    });
  });

  describe('withRetry', () => {
    it('succeeds on first try', async () => {
      const operation = vi.fn().mockResolvedValue('success');
      const result = await withRetry(operation);
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('retries on failure', async () => {
      const operation = vi
        .fn()
        .mockRejectedValueOnce(new VibeCheckError('Fail', 'NETWORK_TIMEOUT'))
        .mockResolvedValue('success');

      const result = await withRetry(operation, {
        maxRetries: 2,
        baseDelayMs: 10,
      });
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('throws after max retries', async () => {
      const operation = vi
        .fn()
        .mockRejectedValue(new VibeCheckError('Fail', 'NETWORK_TIMEOUT'));

      await expect(
        withRetry(operation, { maxRetries: 2, baseDelayMs: 10 })
      ).rejects.toThrow('Fail');
      expect(operation).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
    });

    it('respects shouldRetry callback', async () => {
      const operation = vi
        .fn()
        .mockRejectedValue(new VibeCheckError('Fail', 'PERMISSION_DENIED'));

      await expect(
        withRetry(operation, {
          maxRetries: 5,
          baseDelayMs: 10,
          shouldRetry: (err) => err.code !== 'PERMISSION_DENIED',
        })
      ).rejects.toThrow('Fail');
      expect(operation).toHaveBeenCalledTimes(1); // No retries
    });

    it('calls onRetry callback', async () => {
      const onRetry = vi.fn();
      const operation = vi
        .fn()
        .mockRejectedValueOnce(new VibeCheckError('Fail', 'NETWORK_TIMEOUT'))
        .mockResolvedValue('success');

      await withRetry(operation, {
        maxRetries: 2,
        baseDelayMs: 10,
        onRetry,
      });
      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(expect.any(VibeCheckError), 1);
    });
  });

  describe('withTimeout', () => {
    it('succeeds within timeout', async () => {
      const operation = async () => {
        await new Promise((r) => setTimeout(r, 10));
        return 'success';
      };
      const result = await withTimeout(operation, 1000);
      expect(result).toBe('success');
    });

    it('throws on timeout', async () => {
      const operation = async () => {
        await new Promise((r) => setTimeout(r, 1000));
        return 'success';
      };
      await expect(withTimeout(operation, 10)).rejects.toThrow('timed out');
    });

    it('uses specified error code', async () => {
      const operation = async () => {
        await new Promise((r) => setTimeout(r, 1000));
        return 'success';
      };
      await expect(withTimeout(operation, 10, 'SCAN_TIMEOUT')).rejects.toMatchObject({
        code: 'SCAN_TIMEOUT',
      });
    });
  });

  describe('assert', () => {
    it('does not throw for truthy values', () => {
      expect(() => assert(true, 'Should not throw')).not.toThrow();
      expect(() => assert(1, 'Should not throw')).not.toThrow();
      expect(() => assert('string', 'Should not throw')).not.toThrow();
      expect(() => assert({}, 'Should not throw')).not.toThrow();
    });

    it('throws for falsy values', () => {
      expect(() => assert(false, 'Should throw')).toThrow('Should throw');
      expect(() => assert(0, 'Should throw')).toThrow();
      expect(() => assert('', 'Should throw')).toThrow();
      expect(() => assert(null, 'Should throw')).toThrow();
    });

    it('uses specified error code', () => {
      expect(() => assert(false, 'Test', 'FILE_NOT_FOUND')).toThrow(
        expect.objectContaining({ code: 'FILE_NOT_FOUND' })
      );
    });
  });

  describe('assertDefined', () => {
    it('does not throw for defined values', () => {
      expect(() => assertDefined('string', 'Should not throw')).not.toThrow();
      expect(() => assertDefined(0, 'Should not throw')).not.toThrow();
      expect(() => assertDefined(false, 'Should not throw')).not.toThrow();
    });

    it('throws for null', () => {
      expect(() => assertDefined(null, 'Should throw')).toThrow('Should throw');
    });

    it('throws for undefined', () => {
      expect(() => assertDefined(undefined, 'Should throw')).toThrow('Should throw');
    });
  });
});
