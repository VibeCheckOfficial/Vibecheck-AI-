import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { vol } from 'memfs';
import {
  loadConfig,
  defaultConfig,
  generateConfigTemplate,
  defineConfig,
  configSchema,
  validateConfig,
  mergeConfig,
  getConfigValue,
  setConfigValue,
  clearConfigCache,
} from '../../src/lib/config.js';
import { VibeCheckError } from '../../src/lib/errors.js';

// Mock fs module with memfs
vi.mock('node:fs/promises', async () => {
  const memfs = await import('memfs');
  return memfs.fs.promises;
});

vi.mock('fs/promises', async () => {
  const memfs = await import('memfs');
  return memfs.fs.promises;
});

describe('config', () => {
  beforeEach(() => {
    vol.reset();
    clearConfigCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('defaultConfig', () => {
    it('has expected default values', () => {
      expect(defaultConfig.rules).toEqual(['routes', 'env', 'auth', 'contracts']);
      expect(defaultConfig.strict).toBe(false);
      expect(defaultConfig.output).toBe('pretty');
      expect(defaultConfig.truthpackPath).toBe('.vibecheck/truthpack');
    });

    it('has valid watch defaults', () => {
      expect(defaultConfig.watch.include).toContain('src/**/*.ts');
      expect(defaultConfig.watch.exclude).toContain('node_modules');
      expect(defaultConfig.watch.debounce).toBe(300);
    });

    it('has valid validation defaults', () => {
      expect(defaultConfig.validation.failFast).toBe(false);
      expect(defaultConfig.validation.maxErrors).toBe(50);
      expect(defaultConfig.validation.timeout).toBe(60000);
    });

    it('has valid firewall defaults', () => {
      expect(defaultConfig.firewall.enabled).toBe(true);
      expect(defaultConfig.firewall.blockOnViolation).toBe(false);
      expect(defaultConfig.firewall.strictness).toBe('medium');
    });

    it('has valid scan defaults', () => {
      expect(defaultConfig.scan.timeout).toBe(120000);
      expect(defaultConfig.scan.maxFiles).toBe(10000);
      expect(defaultConfig.scan.followSymlinks).toBe(false);
    });

    it('has valid telemetry defaults (disabled)', () => {
      expect(defaultConfig.telemetry.enabled).toBe(false);
      expect(defaultConfig.telemetry.crashReports).toBe(false);
    });
  });

  describe('configSchema', () => {
    it('validates valid config', () => {
      const result = configSchema.safeParse({
        rules: ['routes', 'env'],
        strict: true,
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid rules', () => {
      const result = configSchema.safeParse({
        rules: ['invalid-rule'],
      });
      expect(result.success).toBe(false);
    });

    it('rejects empty rules array', () => {
      const result = configSchema.safeParse({
        rules: [],
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid output format', () => {
      const result = configSchema.safeParse({
        output: 'xml',
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid debounce values', () => {
      const result = configSchema.safeParse({
        watch: { debounce: 10 }, // Too low
      });
      expect(result.success).toBe(false);
    });

    it('rejects debounce values that are too high', () => {
      const result = configSchema.safeParse({
        watch: { debounce: 20000 }, // Too high
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid maxErrors', () => {
      const result = configSchema.safeParse({
        validation: { maxErrors: 0 },
      });
      expect(result.success).toBe(false);
    });

    it('applies defaults for missing fields', () => {
      const result = configSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.rules).toEqual(['routes', 'env', 'auth', 'contracts']);
        expect(result.data.strict).toBe(false);
      }
    });
  });

  describe('validateConfig', () => {
    it('returns valid for correct config', () => {
      const result = validateConfig({ rules: ['routes'] });
      expect(result.valid).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('returns errors for invalid config', () => {
      const result = validateConfig({ rules: [] });
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });
  });

  describe('mergeConfig', () => {
    it('merges partial config with defaults', () => {
      const config = mergeConfig({ strict: true });
      expect(config.strict).toBe(true);
      expect(config.rules).toEqual(defaultConfig.rules);
    });

    it('deeply merges nested objects', () => {
      const config = mergeConfig({
        watch: { debounce: 500 },
      });
      expect(config.watch.debounce).toBe(500);
      expect(config.watch.include).toEqual(defaultConfig.watch.include);
    });
  });

  describe('getConfigValue', () => {
    it('gets top-level values', () => {
      expect(getConfigValue(defaultConfig, 'strict')).toBe(false);
    });

    it('gets nested values', () => {
      expect(getConfigValue(defaultConfig, 'watch.debounce')).toBe(300);
    });

    it('returns undefined for non-existent paths', () => {
      expect(getConfigValue(defaultConfig, 'nonexistent.path')).toBeUndefined();
    });
  });

  describe('setConfigValue', () => {
    it('sets top-level values', () => {
      const newConfig = setConfigValue(defaultConfig, 'strict', true);
      expect(newConfig.strict).toBe(true);
    });

    it('sets nested values', () => {
      const newConfig = setConfigValue(defaultConfig, 'watch.debounce', 500);
      expect(newConfig.watch.debounce).toBe(500);
    });

    it('validates the resulting config', () => {
      expect(() => setConfigValue(defaultConfig, 'rules', [])).toThrow();
    });
  });

  describe('generateConfigTemplate', () => {
    it('generates minimal template', () => {
      const template = generateConfigTemplate('minimal');
      expect(template).toContain('export default');
      expect(template).toContain("'routes'");
      expect(template).toContain("'env'");
      expect(template).not.toContain("'auth'");
    });

    it('generates standard template', () => {
      const template = generateConfigTemplate('standard');
      expect(template).toContain('export default');
      expect(template).toContain('routes');
      expect(template).toContain('env');
      expect(template).toContain('auth');
      expect(template).toContain('contracts');
    });

    it('generates strict template', () => {
      const template = generateConfigTemplate('strict');
      expect(template).toContain('export default');
      expect(template).toContain('strict: true');
      expect(template).toContain('failFast: true');
      expect(template).toContain('blockOnViolation: true');
    });

    it('default is standard template', () => {
      const defaultTemplate = generateConfigTemplate();
      const standardTemplate = generateConfigTemplate('standard');
      expect(defaultTemplate).toBe(standardTemplate);
    });
  });

  describe('defineConfig', () => {
    it('returns validated config with defaults', () => {
      const config = defineConfig({
        rules: ['routes'],
      });
      expect(config.rules).toEqual(['routes']);
      expect(config.strict).toBe(false);
      expect(config.output).toBe('pretty');
    });

    it('preserves custom values', () => {
      const config = defineConfig({
        strict: true,
        truthpackPath: 'custom/path',
      });
      expect(config.strict).toBe(true);
      expect(config.truthpackPath).toBe('custom/path');
    });

    it('throws on invalid config', () => {
      expect(() => defineConfig({ rules: [] })).toThrow();
    });
  });
});
