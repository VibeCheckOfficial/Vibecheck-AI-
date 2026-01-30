/**
 * Configuration Loader Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadConfig, clearConfigCache, printConfig } from '../loader.js';
import { configSchema } from '../schema.js';
import { redactSecrets } from '../redaction.js';

describe('loadConfig', () => {
  beforeEach(() => {
    clearConfigCache();
    // Clear all env vars for clean tests
    Object.keys(process.env).forEach((key) => {
      if (key.startsWith('VIBECHECK_') || 
          key.startsWith('JWT_') ||
          key.startsWith('DATABASE_') ||
          key.startsWith('REDIS_')) {
        delete process.env[key];
      }
    });
  });

  it('should load config with defaults', () => {
    const config = loadConfig({ useDefaults: true });
    
    expect(config.NODE_ENV).toBe('development');
    expect(config.PORT).toBe(3001);
    expect(config.HOST).toBe('0.0.0.0');
    expect(config.API_URL).toBe('http://localhost:3001');
  });

  it('should validate and normalize types', () => {
    process.env.PORT = '8080';
    process.env.RATE_LIMIT_MAX = '200';
    process.env.VIBECHECK_DEBUG = 'true';
    
    const config = loadConfig();
    
    expect(config.PORT).toBe(8080);
    expect(typeof config.PORT).toBe('number');
    expect(config.RATE_LIMIT_MAX).toBe(200);
    expect(config.VIBECHECK_DEBUG).toBe(true);
  });

  it('should fail on invalid values', () => {
    process.env.PORT = '99999'; // Invalid port
    
    expect(() => loadConfig()).toThrow();
  });

  it('should require critical secrets in production', () => {
    process.env.NODE_ENV = 'production';
    
    expect(() => loadConfig({ failFast: true })).toThrow(/Production requires strong secrets/);
  });

  it('should allow safe defaults in development', () => {
    process.env.NODE_ENV = 'development';
    
    const config = loadConfig({ useDefaults: true });
    
    expect(config.JWT_SECRET).toBeDefined();
    expect(config.DATABASE_URL).toBeDefined();
  });

  it('should cache config', () => {
    const config1 = loadConfig();
    const config2 = loadConfig();
    
    expect(config1).toBe(config2);
  });

  it('should clear cache', () => {
    loadConfig();
    clearConfigCache();
    
    const config = loadConfig();
    expect(config).toBeDefined();
  });
});

describe('configSchema', () => {
  it('should validate valid config', () => {
    const valid = {
      NODE_ENV: 'development',
      PORT: '3001',
      HOST: '0.0.0.0',
    };
    
    const result = configSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('should reject invalid enum values', () => {
    const invalid = {
      NODE_ENV: 'invalid',
    };
    
    const result = configSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should coerce numbers', () => {
    const withStringNumber = {
      PORT: '3001',
    };
    
    const result = configSchema.safeParse(withStringNumber);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(typeof result.data.PORT).toBe('number');
      expect(result.data.PORT).toBe(3001);
    }
  });

  it('should validate URLs', () => {
    const invalidUrl = {
      API_URL: 'not-a-url',
    };
    
    const result = configSchema.safeParse(invalidUrl);
    expect(result.success).toBe(false);
  });
});

describe('redactSecrets', () => {
  it('should redact secret values', () => {
    const config = {
      JWT_SECRET: 'my-secret-key-12345',
      PORT: 3001,
      API_URL: 'http://localhost:3001',
    };
    
    const redacted = redactSecrets(config);
    
    expect(redacted.JWT_SECRET).not.toBe(config.JWT_SECRET);
    expect(redacted.JWT_SECRET).toContain('***REDACTED***');
    expect(redacted.PORT).toBe(config.PORT); // Non-secret unchanged
  });

  it('should redact URLs with credentials', () => {
    const config = {
      DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
    };
    
    const redacted = redactSecrets(config);
    
    expect(redacted.DATABASE_URL).not.toContain('user:pass');
    expect(redacted.DATABASE_URL).toContain('***REDACTED***');
  });
});

describe('printConfig', () => {
  it('should print config without errors', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    
    printConfig();
    
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('should redact secrets by default', () => {
    process.env.JWT_SECRET = 'test-secret-12345';
    clearConfigCache();
    
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    
    printConfig();
    
    const firstCall = consoleSpy.mock.calls[0];
    expect(firstCall).toBeDefined();
    const callArg = firstCall![0];
    const parsed = JSON.parse(callArg);
    expect(parsed.JWT_SECRET).not.toBe('test-secret-12345');
    
    consoleSpy.mockRestore();
  });
});
