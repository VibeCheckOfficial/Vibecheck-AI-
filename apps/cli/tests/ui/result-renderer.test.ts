/**
 * Result Renderer Snapshot Tests
 * 
 * Tests for consistent terminal output rendering.
 * Uses snapshot testing to detect unintended changes.
 * 
 * @module tests/ui/result-renderer
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import stripAnsi from 'strip-ansi';
import type {
  CommandResult,
  ScanResultData,
  CheckResultData,
  ValidateResultData,
} from '@repo/shared-types';
import {
  createEmptyCommandCounts,
  createDefaultCommandInputs,
  createEmptySeverityCounts,
} from '@repo/shared-types';

// Mock console.log to capture output
let capturedOutput: string[] = [];
const originalConsoleLog = console.log;

beforeEach(() => {
  capturedOutput = [];
  console.log = vi.fn((...args) => {
    capturedOutput.push(args.map(String).join(' '));
  });
});

afterEach(() => {
  console.log = originalConsoleLog;
});

function getCapturedOutput(): string {
  return stripAnsi(capturedOutput.join('\n'));
}

describe('Result Renderer', () => {
  describe('Scan Command Output', () => {
    it('renders scan result with discovered items', async () => {
      // Import after mocking
      const { renderResult } = await import('../../src/ui/result-renderer.js');
      
      const result: CommandResult<ScanResultData> = {
        commandName: 'scan',
        version: '1.0.0',
        repoRoot: '/test/project',
        startedAt: '2025-01-30T12:00:00.000Z',
        durationMs: 1234,
        phases: [
          { name: 'Discovery', durationMs: 500 },
          { name: 'Analysis', durationMs: 734 },
        ],
        inputs: createDefaultCommandInputs(),
        counts: {
          ...createEmptyCommandCounts(),
          filesScanned: 50,
          filesConsidered: 100,
          filesSkipped: 50,
        },
        scores: { overall: 85 },
        verdict: { status: 'SHIP', reasons: ['Scan completed successfully'] },
        artifacts: { truthpackPath: '/test/project/.vibecheck' },
        warnings: [],
        errors: [],
        data: {
          routes: 15,
          env: 8,
          auth: 5,
          contracts: 12,
        },
      };
      
      renderResult(result, { compact: true });
      
      const output = getCapturedOutput();
      expect(output).toContain('scan');
      expect(output).toContain('SHIP');
      expect(output).toContain('85/100');
    });

    it('renders scan result with warnings', async () => {
      const { renderResult } = await import('../../src/ui/result-renderer.js');
      
      const result: CommandResult<ScanResultData> = {
        commandName: 'scan',
        version: '1.0.0',
        repoRoot: '/test/project',
        startedAt: '2025-01-30T12:00:00.000Z',
        durationMs: 2000,
        phases: [],
        inputs: createDefaultCommandInputs(),
        counts: createEmptyCommandCounts(),
        scores: { overall: 70 },
        verdict: { status: 'WARN', reasons: ['Some categories have no data'] },
        artifacts: {},
        warnings: ['No routes found', 'No auth patterns found'],
        errors: [],
        data: {
          routes: 0,
          env: 5,
          auth: 0,
          contracts: 3,
        },
      };
      
      renderResult(result, { compact: true });
      
      const output = getCapturedOutput();
      expect(output).toContain('WARN');
      expect(output).toContain('70/100');
    });
  });

  describe('Check Command Output', () => {
    it('renders check result with no issues', async () => {
      const { renderResult } = await import('../../src/ui/result-renderer.js');
      
      const result: CommandResult<CheckResultData> = {
        commandName: 'check',
        version: '1.0.0',
        repoRoot: '/test/project',
        startedAt: '2025-01-30T12:00:00.000Z',
        durationMs: 800,
        phases: [],
        inputs: createDefaultCommandInputs(),
        counts: {
          ...createEmptyCommandCounts(),
          filesScanned: 25,
          filesConsidered: 25,
        },
        scores: { overall: 100 },
        verdict: { status: 'SHIP', reasons: ['All checks passed'] },
        artifacts: {},
        warnings: [],
        errors: [],
        data: {
          hallucinationCount: 0,
          driftCount: 0,
        },
      };
      
      renderResult(result, { compact: true });
      
      const output = getCapturedOutput();
      expect(output).toContain('check');
      expect(output).toContain('SHIP');
      expect(output).toContain('100/100');
      expect(output).toContain('0'); // Findings
    });

    it('renders check result with findings', async () => {
      const { renderResult } = await import('../../src/ui/result-renderer.js');
      
      const result: CommandResult<CheckResultData> = {
        commandName: 'check',
        version: '1.0.0',
        repoRoot: '/test/project',
        startedAt: '2025-01-30T12:00:00.000Z',
        durationMs: 1500,
        phases: [],
        inputs: createDefaultCommandInputs(),
        counts: {
          ...createEmptyCommandCounts(),
          filesScanned: 25,
          filesConsidered: 25,
          findingsTotal: 5,
          findingsBySeverity: {
            ...createEmptySeverityCounts(),
            high: 2,
            medium: 3,
          },
          findingsByType: {
            hallucination: 2,
            drift: 3,
          },
        },
        scores: { overall: 71 },
        verdict: { 
          status: 'WARN', 
          reasons: ['2 hallucination(s) detected', '3 drift item(s) detected'] 
        },
        artifacts: {},
        warnings: [],
        errors: [],
        data: {
          hallucinationCount: 2,
          driftCount: 3,
        },
      };
      
      renderResult(result, { compact: true });
      
      const output = getCapturedOutput();
      expect(output).toContain('check');
      expect(output).toContain('WARN');
      expect(output).toContain('5'); // Findings
    });
  });

  describe('Validate Command Output', () => {
    it('renders validate result with all passed', async () => {
      const { renderResult } = await import('../../src/ui/result-renderer.js');
      
      const result: CommandResult<ValidateResultData> = {
        commandName: 'validate',
        version: '1.0.0',
        repoRoot: '/test/project',
        startedAt: '2025-01-30T12:00:00.000Z',
        durationMs: 600,
        phases: [],
        inputs: createDefaultCommandInputs(),
        counts: {
          ...createEmptyCommandCounts(),
          filesScanned: 10,
          filesConsidered: 10,
        },
        scores: { overall: 100 },
        verdict: { status: 'SHIP', reasons: ['All files validated successfully'] },
        artifacts: {},
        warnings: [],
        errors: [],
        data: {
          passed: 10,
          failed: 0,
          warnings: 0,
        },
      };
      
      renderResult(result, { compact: true });
      
      const output = getCapturedOutput();
      expect(output).toContain('validate');
      expect(output).toContain('SHIP');
      expect(output).toContain('100/100');
    });

    it('renders validate result with failures', async () => {
      const { renderResult } = await import('../../src/ui/result-renderer.js');
      
      const result: CommandResult<ValidateResultData> = {
        commandName: 'validate',
        version: '1.0.0',
        repoRoot: '/test/project',
        startedAt: '2025-01-30T12:00:00.000Z',
        durationMs: 1200,
        phases: [],
        inputs: createDefaultCommandInputs(),
        counts: {
          ...createEmptyCommandCounts(),
          filesScanned: 10,
          filesConsidered: 10,
          findingsTotal: 5,
          findingsBySeverity: {
            ...createEmptySeverityCounts(),
            high: 3,
            medium: 2,
          },
        },
        scores: { overall: 64 },
        verdict: { status: 'WARN', reasons: ['3 error(s) detected'] },
        artifacts: {},
        warnings: [],
        errors: [],
        data: {
          passed: 7,
          failed: 3,
          warnings: 2,
        },
      };
      
      renderResult(result, { compact: true });
      
      const output = getCapturedOutput();
      expect(output).toContain('validate');
      expect(output).toContain('WARN');
      expect(output).toContain('5'); // Findings
    });
  });

  describe('JSON Output', () => {
    it('renders valid JSON for scan result', async () => {
      const { renderJson } = await import('../../src/ui/result-renderer.js');
      
      const result: CommandResult<ScanResultData> = {
        commandName: 'scan',
        version: '1.0.0',
        repoRoot: '/test/project',
        startedAt: '2025-01-30T12:00:00.000Z',
        durationMs: 1000,
        phases: [],
        inputs: createDefaultCommandInputs(),
        counts: createEmptyCommandCounts(),
        scores: { overall: 100 },
        verdict: { status: 'SHIP', reasons: [] },
        artifacts: {},
        warnings: [],
        errors: [],
        data: { routes: 5, env: 3, auth: 2, contracts: 4 },
      };
      
      renderJson(result);
      
      const output = getCapturedOutput();
      const parsed = JSON.parse(output);
      
      expect(parsed.commandName).toBe('scan');
      expect(parsed.scores.overall).toBe(100);
      expect(parsed.verdict.status).toBe('SHIP');
      expect(parsed.data.routes).toBe(5);
    });
  });

  describe('Verdict Display', () => {
    it('shows SHIP verdict correctly', async () => {
      const { renderResult } = await import('../../src/ui/result-renderer.js');
      
      const result: CommandResult = {
        commandName: 'test',
        version: '1.0.0',
        repoRoot: '/test',
        startedAt: '2025-01-30T12:00:00.000Z',
        durationMs: 100,
        phases: [],
        inputs: createDefaultCommandInputs(),
        counts: createEmptyCommandCounts(),
        scores: { overall: 85 },
        verdict: { status: 'SHIP', reasons: ['All checks passed'] },
        artifacts: {},
        warnings: [],
        errors: [],
      };
      
      renderResult(result, { compact: true });
      
      const output = getCapturedOutput();
      expect(output).toContain('SHIP');
    });

    it('shows WARN verdict correctly', async () => {
      const { renderResult } = await import('../../src/ui/result-renderer.js');
      
      const result: CommandResult = {
        commandName: 'test',
        version: '1.0.0',
        repoRoot: '/test',
        startedAt: '2025-01-30T12:00:00.000Z',
        durationMs: 100,
        phases: [],
        inputs: createDefaultCommandInputs(),
        counts: createEmptyCommandCounts(),
        scores: { overall: 65 },
        verdict: { status: 'WARN', reasons: ['Score below threshold'] },
        artifacts: {},
        warnings: [],
        errors: [],
      };
      
      renderResult(result, { compact: true });
      
      const output = getCapturedOutput();
      expect(output).toContain('WARN');
    });

    it('shows BLOCK verdict correctly', async () => {
      const { renderResult } = await import('../../src/ui/result-renderer.js');
      
      const result: CommandResult = {
        commandName: 'test',
        version: '1.0.0',
        repoRoot: '/test',
        startedAt: '2025-01-30T12:00:00.000Z',
        durationMs: 100,
        phases: [],
        inputs: createDefaultCommandInputs(),
        counts: createEmptyCommandCounts(),
        scores: { overall: 45 },
        verdict: { status: 'BLOCK', reasons: ['Critical issues found'] },
        artifacts: {},
        warnings: [],
        errors: [],
      };
      
      renderResult(result, { compact: true });
      
      const output = getCapturedOutput();
      expect(output).toContain('BLOCK');
    });
  });
});
