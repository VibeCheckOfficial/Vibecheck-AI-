/**
 * Forge Tests
 *
 * Basic tests for the Forge AI Context Generator.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { forge } from './index.js';
import { analyzeProject } from './analyzer.js';
import { generateMinimalRules, scoreRuleImpact } from './rule-generator.js';
import { generateAIContract, validateContract } from './contract-generator.js';
import type { ProjectAnalysis, ForgeRule } from './types.js';

describe('Forge', () => {
  let tempDir: string;

  beforeEach(() => {
    // Create temp directory for tests
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-test-'));

    // Create basic project structure
    fs.writeFileSync(
      path.join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'test-project',
        dependencies: {
          react: '^18.0.0',
          next: '^14.0.0',
        },
        devDependencies: {
          typescript: '^5.0.0',
          vitest: '^1.0.0',
        },
      })
    );

    fs.writeFileSync(path.join(tempDir, 'tsconfig.json'), '{}');

    // Create src directory with a component
    fs.mkdirSync(path.join(tempDir, 'src', 'components'), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, 'src', 'components', 'Button.tsx'),
      `export const Button = () => <button>Click</button>;`
    );
  });

  afterEach(() => {
    // Clean up temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('analyzeProject', () => {
    it('should detect TypeScript project', async () => {
      const analysis = await analyzeProject(tempDir, {
        maxRules: 5,
        tier: 'minimal',
        platforms: ['cursor'],
        incremental: false,
        generateContract: false,
        verbose: false,
      });

      expect(analysis.language).toBe('TypeScript');
    });

    it('should detect Next.js framework', async () => {
      const analysis = await analyzeProject(tempDir, {
        maxRules: 5,
        tier: 'minimal',
        platforms: ['cursor'],
        incremental: false,
        generateContract: false,
        verbose: false,
      });

      expect(analysis.framework).toBe('Next.js');
    });

    it('should detect React components', async () => {
      const analysis = await analyzeProject(tempDir, {
        maxRules: 5,
        tier: 'minimal',
        platforms: ['cursor'],
        incremental: false,
        generateContract: false,
        verbose: false,
      });

      expect(analysis.components.length).toBeGreaterThan(0);
      expect(analysis.components.some((c) => c.name === 'Button')).toBe(true);
    });

    it('should detect testing framework', async () => {
      const analysis = await analyzeProject(tempDir, {
        maxRules: 5,
        tier: 'minimal',
        platforms: ['cursor'],
        incremental: false,
        generateContract: false,
        verbose: false,
      });

      expect(analysis.patterns.testing).toContain('Vitest');
    });
  });

  describe('generateMinimalRules', () => {
    it('should generate rules up to maxRules limit', () => {
      const mockAnalysis: ProjectAnalysis = {
        name: 'test',
        framework: 'Next.js',
        language: 'TypeScript',
        architecture: 'App Router',
        directories: ['src', 'app', 'components'],
        components: [{ name: 'Button', path: 'src/components/Button.tsx', type: 'component' }],
        apiRoutes: [],
        models: [],
        types: { interfaces: [], types: [], enums: [] },
        envVars: { variables: [], sensitive: [], missing: [] },
        patterns: {
          hooks: [],
          stateManagement: '',
          dataFetching: [],
          styling: ['Tailwind CSS'],
          testing: ['Vitest'],
          validation: '',
          authentication: '',
          antiPatterns: [],
        },
        monorepo: { isMonorepo: false, type: '', workspaces: [], sharedPackages: [] },
        stats: { totalFiles: 10, totalLines: 500, filesByExtension: {} },
      };

      const rules = generateMinimalRules(mockAnalysis, {
        maxRules: 5,
        tier: 'minimal',
        features: ['architecture', 'avoid', 'types', 'components', 'testing'],
        diff: null,
      });

      expect(rules.length).toBeLessThanOrEqual(5);
      expect(rules.length).toBeGreaterThan(0);
    });

    it('should always include architecture and avoid rules', () => {
      const mockAnalysis: ProjectAnalysis = {
        name: 'test',
        framework: 'Next.js',
        language: 'TypeScript',
        architecture: 'Standard',
        directories: ['src'],
        components: [],
        apiRoutes: [],
        models: [],
        types: { interfaces: [], types: [], enums: [] },
        envVars: { variables: [], sensitive: [], missing: [] },
        patterns: {
          hooks: [],
          stateManagement: '',
          dataFetching: [],
          styling: [],
          testing: [],
          validation: '',
          authentication: '',
          antiPatterns: [],
        },
        monorepo: { isMonorepo: false, type: '', workspaces: [], sharedPackages: [] },
        stats: { totalFiles: 5, totalLines: 100, filesByExtension: {} },
      };

      const rules = generateMinimalRules(mockAnalysis, {
        maxRules: 10,
        tier: 'standard',
        features: ['*'],
        diff: null,
      });

      const ruleIds = rules.map((r) => r.id);
      expect(ruleIds).toContain('architecture');
      expect(ruleIds).toContain('avoid');
    });
  });

  describe('scoreRuleImpact', () => {
    it('should boost architecture score for monorepo', () => {
      const rule: ForgeRule = {
        id: 'architecture',
        category: 'architecture',
        name: 'Architecture',
        description: 'Test',
        frontmatter: { description: '', globs: [], alwaysApply: true, priority: 100 },
        content: '',
        impact: 0,
        hash: '',
        incremental: false,
      };

      const monorepoAnalysis: ProjectAnalysis = {
        name: 'test',
        framework: 'Next.js',
        language: 'TypeScript',
        architecture: 'Monorepo',
        directories: [],
        components: [],
        apiRoutes: [],
        models: [],
        types: { interfaces: [], types: [], enums: [] },
        envVars: { variables: [], sensitive: [], missing: [] },
        patterns: {
          hooks: [],
          stateManagement: '',
          dataFetching: [],
          styling: [],
          testing: [],
          validation: '',
          authentication: '',
          antiPatterns: [],
        },
        monorepo: {
          isMonorepo: true,
          type: 'pnpm',
          workspaces: [{ name: 'app', path: 'apps/app' }],
          sharedPackages: [],
        },
        stats: { totalFiles: 500, totalLines: 50000, filesByExtension: {} },
      };

      const nonMonorepoAnalysis = { ...monorepoAnalysis, monorepo: { isMonorepo: false, type: '', workspaces: [], sharedPackages: [] } };

      const monorepoScore = scoreRuleImpact(rule, monorepoAnalysis);
      const nonMonorepoScore = scoreRuleImpact(rule, nonMonorepoAnalysis);

      expect(monorepoScore).toBeGreaterThan(nonMonorepoScore);
    });
  });

  describe('generateAIContract', () => {
    it('should generate valid contract', () => {
      const mockAnalysis: ProjectAnalysis = {
        name: 'test-project',
        framework: 'Next.js',
        language: 'TypeScript',
        architecture: 'App Router',
        directories: ['src', 'app'],
        components: [],
        apiRoutes: [],
        models: [],
        types: { interfaces: [], types: [], enums: [] },
        envVars: { variables: [], sensitive: [], missing: [] },
        patterns: {
          hooks: [],
          stateManagement: '',
          dataFetching: [],
          styling: [],
          testing: [],
          validation: '',
          authentication: '',
          antiPatterns: [],
        },
        monorepo: { isMonorepo: false, type: '', workspaces: [], sharedPackages: [] },
        stats: { totalFiles: 10, totalLines: 500, filesByExtension: {} },
      };

      const rules: ForgeRule[] = [];
      const contract = generateAIContract(mockAnalysis, rules);

      expect(contract.version).toBe('1.0.0');
      expect(contract.projectId).toBe('test-project');
      expect(contract.allowed.length).toBeGreaterThan(0);
      expect(contract.forbidden.length).toBeGreaterThan(0);
      expect(contract.safetyRules.critical.length).toBeGreaterThan(0);
    });

    it('should pass validation', () => {
      const mockAnalysis: ProjectAnalysis = {
        name: 'test',
        framework: 'React',
        language: 'TypeScript',
        architecture: 'Standard',
        directories: ['src'],
        components: [],
        apiRoutes: [],
        models: [],
        types: { interfaces: [], types: [], enums: [] },
        envVars: { variables: [], sensitive: [], missing: [] },
        patterns: {
          hooks: [],
          stateManagement: '',
          dataFetching: [],
          styling: [],
          testing: [],
          validation: '',
          authentication: '',
          antiPatterns: [],
        },
        monorepo: { isMonorepo: false, type: '', workspaces: [], sharedPackages: [] },
        stats: { totalFiles: 5, totalLines: 100, filesByExtension: {} },
      };

      const contract = generateAIContract(mockAnalysis, []);
      const validation = validateContract(contract);

      expect(validation.valid).toBe(true);
      expect(validation.issues).toHaveLength(0);
    });
  });

  describe('forge (integration)', () => {
    it('should generate output files', async () => {
      const output = await forge(tempDir, {
        tier: 'minimal',
        maxRules: 5,
        incremental: false,
        generateContract: true,
        platforms: ['cursor'],
        verbose: false,
      });

      expect(output.stats.rulesGenerated).toBeGreaterThan(0);
      expect(output.stats.filesWritten).toBeGreaterThan(0);
      expect(output.files).toContain('.cursorrules');
      expect(output.contract).not.toBeNull();

      // Verify files exist
      expect(fs.existsSync(path.join(tempDir, '.cursorrules'))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, '.cursor', 'rules'))).toBe(true);
    });

    it('should generate manifest for incremental mode', async () => {
      await forge(tempDir, {
        tier: 'minimal',
        maxRules: 5,
        incremental: true,
        generateContract: false,
        platforms: ['cursor'],
        verbose: false,
      });

      const manifestPath = path.join(tempDir, '.vibecheck', 'forge-manifest.json');
      expect(fs.existsSync(manifestPath)).toBe(true);

      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      expect(manifest.version).toBe('1.0.0');
      expect(manifest.rules.length).toBeGreaterThan(0);
    });
  });
});
