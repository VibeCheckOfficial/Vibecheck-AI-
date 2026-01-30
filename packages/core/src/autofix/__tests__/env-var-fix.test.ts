/**
 * Tests for EnvVarFixModule
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EnvVarFixModule } from '../modules/env-var-fix.js';
import type { Issue, FixContext } from '../types.js';

describe('EnvVarFixModule', () => {
  let module: EnvVarFixModule;
  let mockContext: FixContext;

  beforeEach(() => {
    module = new EnvVarFixModule();
    mockContext = {
      projectRoot: '/mock/project',
      truthpackPath: '.vibecheck/truthpack',
      truthpack: {
        env: [
          { name: 'NODE_ENV', required: true, description: 'Node environment' },
          { name: 'PORT', required: false, defaultValue: '3000', description: 'Server port' },
        ],
      },
      policy: {
        enabled: true,
        maxFilesPerFix: 5,
        maxLinesPerFix: 100,
        blockedPaths: [],
        severityThresholds: {
          low: 'auto_apply',
          medium: 'auto_apply',
          high: 'suggest',
          critical: 'suggest',
        },
        confidenceThreshold: 0.7,
        requireTests: false,
        allowAIFixes: true,
      },
      existingPatches: [],
    };
  });

  describe('canFix', () => {
    it('should return true for ghost-env issues', () => {
      const issue: Issue = {
        id: 'issue-1',
        type: 'ghost-env',
        severity: 'medium',
        message: 'Undefined env var: API_KEY',
        source: 'drift-detection',
      };

      expect(module.canFix(issue)).toBe(true);
    });

    it('should return false for other issue types', () => {
      const issue: Issue = {
        id: 'issue-1',
        type: 'ghost-route',
        severity: 'medium',
        message: 'Missing route',
        source: 'drift-detection',
      };

      expect(module.canFix(issue)).toBe(false);
    });
  });

  describe('getFixDescription', () => {
    it('should return a descriptive message', () => {
      const issue: Issue = {
        id: 'issue-1',
        type: 'ghost-env',
        severity: 'medium',
        message: 'Undefined env var',
        source: 'policy-violation',
        violation: {
          policy: 'ghost-env',
          severity: 'error',
          message: 'GHOST ENV: API_KEY',
          claim: { id: 'c1', type: 'env_variable', value: 'API_KEY', confidence: 1 },
        },
      };

      const description = module.getFixDescription(issue);
      expect(description).toContain('API_KEY');
      expect(description).toContain('.env.example');
    });
  });

  describe('module metadata', () => {
    it('should have correct id', () => {
      expect(module.id).toBe('env-var-fix');
    });

    it('should have correct issue types', () => {
      expect(module.issueTypes).toContain('ghost-env');
    });

    it('should have high confidence', () => {
      expect(module.confidence).toBe('high');
    });
  });
});
