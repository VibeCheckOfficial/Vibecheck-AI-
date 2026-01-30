import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('environment', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getSymbols', () => {
    it('returns unicode symbols when supported', async () => {
      process.env['WT_SESSION'] = '1'; // Windows Terminal
      const { getSymbols } = await import('../../src/lib/environment.js');
      const symbols = getSymbols();
      expect(symbols.tick).toBe('✓');
      expect(symbols.cross).toBe('✖');
    });
  });

  describe('shouldAnimate', () => {
    it('returns false in CI environment', async () => {
      process.env['CI'] = 'true';
      const { shouldAnimate } = await import('../../src/lib/environment.js');
      // In CI, isInteractive is false, so shouldAnimate returns false
      expect(shouldAnimate()).toBe(false);
    });
  });

  describe('shouldPrompt', () => {
    it('returns false in CI environment', async () => {
      process.env['CI'] = 'true';
      const { shouldPrompt } = await import('../../src/lib/environment.js');
      // In CI, isInteractive is false, so shouldPrompt returns false
      expect(shouldPrompt()).toBe(false);
    });
  });

  describe('env object', () => {
    it('has isCI property', async () => {
      // Note: ci-info caches its detection at module load time
      // We can only verify the property exists and is a boolean
      const { env } = await import('../../src/lib/environment.js');
      expect(typeof env.isCI).toBe('boolean');
    });

    it('respects NO_COLOR environment variable', async () => {
      process.env['NO_COLOR'] = '1';
      vi.resetModules();
      const { env } = await import('../../src/lib/environment.js');
      // The property is env.terminal.colors, not env.supportsColor
      expect(env.terminal.colors).toBe(false);
    });

    it('respects FORCE_COLOR environment variable', async () => {
      // Must delete NO_COLOR first since it takes precedence
      delete process.env['NO_COLOR'];
      process.env['FORCE_COLOR'] = '1';
      vi.resetModules();
      const { env } = await import('../../src/lib/environment.js');
      // The property is env.terminal.colors, not env.supportsColor
      expect(env.terminal.colors).toBe(true);
    });
  });
});
