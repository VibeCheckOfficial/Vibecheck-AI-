/**
 * Output Contract Integration Tests
 * 
 * Tests that CLI commands produce output conforming to the canonical contract.
 * Validates JSON output structure, score invariants, and consistency.
 * 
 * @module tests/integration/output-contract
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execa } from 'execa';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';

// Path to the small fixture repo
const FIXTURE_PATH = path.resolve(__dirname, '../fixtures/small-repo');
const CLI_PATH = path.resolve(__dirname, '../../src/index.ts');

// Temporary directory for test output
let tempDir: string;

beforeAll(async () => {
  // Create temp directory for test runs
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vibecheck-test-'));
});

afterAll(async () => {
  // Cleanup temp directory
  if (tempDir) {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
});

/**
 * Extract JSON from stdout that may contain log messages
 * The JSON output is typically the last complete JSON object in the output
 */
function extractJson(stdout: string): unknown | undefined {
  // Try to parse the entire output first
  try {
    return JSON.parse(stdout);
  } catch {
    // Not pure JSON
  }
  
  // Find the last complete JSON object (starts with { and ends with })
  // This handles the case where log messages precede the JSON output
  const lines = stdout.split('\n');
  let jsonStart = -1;
  let braceCount = 0;
  let inJson = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!inJson && line.trimStart().startsWith('{') && !line.includes('"timestamp"')) {
      // Found potential start of our JSON (not a log line)
      jsonStart = i;
      inJson = true;
      braceCount = 0;
    }
    
    if (inJson) {
      for (const char of line) {
        if (char === '{') braceCount++;
        if (char === '}') braceCount--;
      }
      
      if (braceCount === 0 && jsonStart >= 0) {
        // Found complete JSON object
        const jsonStr = lines.slice(jsonStart, i + 1).join('\n');
        try {
          return JSON.parse(jsonStr);
        } catch {
          // Invalid JSON, continue searching
          inJson = false;
          jsonStart = -1;
        }
      }
    }
  }
  
  return undefined;
}

/**
 * Run a CLI command and return parsed JSON output
 */
async function runCli(
  command: string,
  args: string[] = [],
  cwd: string = FIXTURE_PATH
): Promise<{ stdout: string; stderr: string; exitCode: number; json?: unknown }> {
  try {
    const result = await execa('npx', ['tsx', CLI_PATH, command, ...args], {
      cwd,
      env: {
        ...process.env,
        FORCE_COLOR: '0',
        NO_COLOR: '1',
      },
    });
    
    const json = extractJson(result.stdout);
    
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode ?? 0,
      json,
    };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; exitCode?: number };
    const json = extractJson(err.stdout ?? '');
    
    return {
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? '',
      exitCode: err.exitCode ?? 1,
      json,
    };
  }
}

describe('Output Contract Integration Tests', () => {
  describe('Scan Command JSON Output', () => {
    it('produces valid CommandResult structure', async () => {
      const outputPath = path.join(tempDir, 'scan-output');
      const { json, exitCode } = await runCli('scan', [
        '--json',
        '--output', outputPath,
      ]);
      
      // Should not crash
      expect(exitCode).toBe(0);
      
      // Should have canonical fields
      expect(json).toBeDefined();
      const result = json as Record<string, unknown>;
      
      // Required identity fields
      expect(result.commandName).toBe('scan');
      expect(typeof result.version).toBe('string');
      expect(typeof result.repoRoot).toBe('string');
      
      // Required timing fields
      expect(typeof result.startedAt).toBe('string');
      expect(typeof result.durationMs).toBe('number');
      expect(Array.isArray(result.phases)).toBe(true);
      
      // Required scores
      expect(result.scores).toBeDefined();
      const scores = result.scores as Record<string, unknown>;
      expect(typeof scores.overall).toBe('number');
      expect(scores.overall).toBeGreaterThanOrEqual(0);
      expect(scores.overall).toBeLessThanOrEqual(100);
      
      // Required verdict
      expect(result.verdict).toBeDefined();
      const verdict = result.verdict as Record<string, unknown>;
      expect(['SHIP', 'WARN', 'BLOCK']).toContain(verdict.status);
      expect(Array.isArray(verdict.reasons)).toBe(true);
    });

    it('score matches verdict thresholds', async () => {
      const outputPath = path.join(tempDir, 'scan-threshold');
      const { json } = await runCli('scan', ['--json', '--output', outputPath]);
      
      const result = json as Record<string, unknown>;
      const scores = result.scores as Record<string, number>;
      const verdict = result.verdict as Record<string, unknown>;
      
      // Verify threshold alignment (unless there's a critical blocker)
      if (scores.overall >= 80) {
        expect(verdict.status).toBe('SHIP');
      } else if (scores.overall >= 60) {
        expect(verdict.status).toBe('WARN');
      } else {
        expect(verdict.status).toBe('BLOCK');
      }
    });

    it('includes scan-specific data', async () => {
      const outputPath = path.join(tempDir, 'scan-data');
      const { json } = await runCli('scan', ['--json', '--output', outputPath]);
      
      const result = json as Record<string, unknown>;
      
      // Should have data field with scan results
      expect(result.data).toBeDefined();
      const data = result.data as Record<string, unknown>;
      
      expect(typeof data.routes).toBe('number');
      expect(typeof data.env).toBe('number');
      expect(typeof data.auth).toBe('number');
      expect(typeof data.contracts).toBe('number');
    });
  });

  describe('Count Invariants', () => {
    it('findingsTotal equals sum of findingsBySeverity', async () => {
      const outputPath = path.join(tempDir, 'count-invariant');
      const { json } = await runCli('scan', ['--json', '--output', outputPath]);
      
      const result = json as Record<string, unknown>;
      const counts = result.counts as Record<string, unknown>;
      
      if (counts && counts.findingsTotal !== undefined) {
        const bySeverity = counts.findingsBySeverity as Record<string, number>;
        const sum = (bySeverity.critical ?? 0) +
                    (bySeverity.high ?? 0) +
                    (bySeverity.medium ?? 0) +
                    (bySeverity.low ?? 0);
        
        expect(counts.findingsTotal).toBe(sum);
      }
    });
  });

  describe('Score Range', () => {
    it('overall score is always 0-100 integer', async () => {
      const outputPath = path.join(tempDir, 'score-range');
      const { json } = await runCli('scan', ['--json', '--output', outputPath]);
      
      const result = json as Record<string, unknown>;
      const scores = result.scores as Record<string, number>;
      
      expect(Number.isInteger(scores.overall)).toBe(true);
      expect(scores.overall).toBeGreaterThanOrEqual(0);
      expect(scores.overall).toBeLessThanOrEqual(100);
    });
  });

  describe('Exit Codes', () => {
    it('returns 0 for SHIP verdict', async () => {
      const outputPath = path.join(tempDir, 'exit-ship');
      const { json, exitCode } = await runCli('scan', ['--json', '--output', outputPath]);
      
      const result = json as Record<string, unknown>;
      const verdict = result.verdict as Record<string, unknown>;
      
      if (verdict.status === 'SHIP' || verdict.status === 'WARN') {
        expect(exitCode).toBe(0);
      }
    });
  });

  describe('Backward Compatibility', () => {
    it('includes legacy fields for scan command', async () => {
      const outputPath = path.join(tempDir, 'legacy-scan');
      const { json } = await runCli('scan', ['--json', '--output', outputPath]);
      
      const result = json as Record<string, unknown>;
      
      // Legacy fields that may be expected by existing tooling
      expect(result.success).toBeDefined();
      expect(typeof result.success).toBe('boolean');
    });
  });
});
