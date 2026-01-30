/**
 * Security Test Harness
 * 
 * Replayable test harness for testing MCP server tools and security measures.
 */

import { VibeCheckServer } from '../../src/server.js';
import type { SecurityMiddleware } from '../../src/security/security-middleware.js';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';

export interface TestCase {
  name: string;
  tool: string;
  parameters: Record<string, unknown>;
  expectedResult: 'success' | 'error' | 'blocked';
  expectedErrorCode?: string;
  description?: string;
}

export interface TestResult {
  testCase: TestCase;
  passed: boolean;
  actualResult: 'success' | 'error' | 'blocked';
  error?: string;
  errorCode?: string;
  duration: number;
  timestamp: string;
}

export class SecurityTestHarness {
  private readonly server: VibeCheckServer;
  private readonly securityMiddleware: SecurityMiddleware;
  private readonly testResults: TestResult[] = [];
  private readonly tempDir: string;

  constructor(
    server: VibeCheckServer,
    securityMiddleware: SecurityMiddleware,
    tempDir?: string
  ) {
    this.server = server;
    this.securityMiddleware = securityMiddleware;
    this.tempDir = tempDir || path.join(os.tmpdir(), 'vibecheck-mcp-tests');
  }

  /**
   * Run a single test case
   */
  async runTest(testCase: TestCase): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      // Validate with security middleware first
      const validation = await this.securityMiddleware.validate({
        clientId: 'test-client',
        toolName: testCase.tool,
        parameters: testCase.parameters,
      });

      if (!validation.allowed) {
        const result: TestResult = {
          testCase,
          passed: testCase.expectedResult === 'blocked',
          actualResult: 'blocked',
          error: validation.error?.message,
          errorCode: validation.error?.code,
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        };
        this.testResults.push(result);
        return result;
      }

      // If validation passed but we expected blocking, fail
      if (testCase.expectedResult === 'blocked') {
        const result: TestResult = {
          testCase,
          passed: false,
          actualResult: 'success',
          error: 'Expected blocking but validation passed',
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        };
        this.testResults.push(result);
        return result;
      }

      // Execute the tool (simulated - actual execution would require MCP client)
      // For now, we just validate that security checks pass
      const result: TestResult = {
        testCase,
        passed: testCase.expectedResult === 'success',
        actualResult: 'success',
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
      this.testResults.push(result);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const result: TestResult = {
        testCase,
        passed: testCase.expectedResult === 'error',
        actualResult: 'error',
        error: errorMessage,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
      this.testResults.push(result);
      return result;
    }
  }

  /**
   * Run multiple test cases
   */
  async runTests(testCases: TestCase[]): Promise<TestResult[]> {
    const results: TestResult[] = [];
    for (const testCase of testCases) {
      const result = await this.runTest(testCase);
      results.push(result);
    }
    return results;
  }

  /**
   * Get test results
   */
  getResults(): TestResult[] {
    return [...this.testResults];
  }

  /**
   * Get test summary
   */
  getSummary(): {
    total: number;
    passed: number;
    failed: number;
    passRate: number;
  } {
    const total = this.testResults.length;
    const passed = this.testResults.filter(r => r.passed).length;
    const failed = total - passed;
    const passRate = total > 0 ? (passed / total) * 100 : 0;

    return { total, passed, failed, passRate };
  }

  /**
   * Export test results to JSON
   */
  async exportResults(filePath?: string): Promise<string> {
    const output = {
      summary: this.getSummary(),
      results: this.testResults,
      timestamp: new Date().toISOString(),
    };

    const json = JSON.stringify(output, null, 2);
    
    if (filePath) {
      await fs.writeFile(filePath, json, 'utf-8');
    }

    return json;
  }

  /**
   * Clear test results
   */
  clearResults(): void {
    this.testResults.length = 0;
  }
}

/**
 * Create standard security test cases
 */
export function createSecurityTestCases(): TestCase[] {
  return [
    // Path traversal tests
    {
      name: 'Path traversal - relative',
      tool: 'context_for_file',
      parameters: { filePath: '../../../etc/passwd' },
      expectedResult: 'blocked',
      expectedErrorCode: 'E_PATH_TRAVERSAL',
      description: 'Should block relative path traversal',
    },
    {
      name: 'Path traversal - absolute',
      tool: 'context_for_file',
      parameters: { filePath: '/etc/passwd' },
      expectedResult: 'blocked',
      expectedErrorCode: 'E_PATH_TRAVERSAL',
      description: 'Should block absolute paths outside project',
    },
    {
      name: 'Path traversal - encoded',
      tool: 'context_for_file',
      parameters: { filePath: '..%2F..%2Fetc%2Fpasswd' },
      expectedResult: 'blocked',
      expectedErrorCode: 'E_PATH_TRAVERSAL',
      description: 'Should block encoded path traversal',
    },
    {
      name: 'Valid relative path',
      tool: 'context_for_file',
      parameters: { filePath: 'src/index.ts' },
      expectedResult: 'success',
      description: 'Should allow valid relative paths',
    },

    // Input size tests
    {
      name: 'Oversized content',
      tool: 'firewall_evaluate',
      parameters: {
        action: 'write',
        target: 'test.ts',
        content: 'x'.repeat(11 * 1024 * 1024), // 11MB
      },
      expectedResult: 'blocked',
      expectedErrorCode: 'E_CONTENT_SIZE_EXCEEDED',
      description: 'Should block content exceeding size limit',
    },
    {
      name: 'Oversized file path',
      tool: 'context_for_file',
      parameters: { filePath: 'x'.repeat(5000) },
      expectedResult: 'blocked',
      expectedErrorCode: 'E_PATH_LENGTH_EXCEEDED',
      description: 'Should block paths exceeding length limit',
    },
    {
      name: 'Oversized array',
      tool: 'intent_declare',
      parameters: {
        description: 'test',
        allowedPaths: Array(2000).fill('src/**/*'),
      },
      expectedResult: 'blocked',
      expectedErrorCode: 'E_ARRAY_SIZE_EXCEEDED',
      description: 'Should block arrays exceeding size limit',
    },

    // Regex DoS tests
    {
      name: 'ReDoS pattern - nested quantifiers',
      tool: 'truthpack_query',
      parameters: {
        category: 'routes',
        filter: '((a+)+)+$',
      },
      expectedResult: 'blocked',
      expectedErrorCode: 'E_REGEX_COMPLEXITY_EXCEEDED',
      description: 'Should block ReDoS patterns',
    },
    {
      name: 'ReDoS pattern - alternation',
      tool: 'truthpack_query',
      parameters: {
        category: 'routes',
        filter: '(a|a)+$',
      },
      expectedResult: 'blocked',
      expectedErrorCode: 'E_REGEX_COMPLEXITY_EXCEEDED',
      description: 'Should block ReDoS alternation patterns',
    },
    {
      name: 'Valid regex pattern',
      tool: 'truthpack_query',
      parameters: {
        category: 'routes',
        filter: '/api/users/*',
      },
      expectedResult: 'success',
      description: 'Should allow valid regex patterns',
    },

    // Rate limiting tests (would need actual rate limiter state)
    {
      name: 'Rate limit - rapid requests',
      tool: 'firewall_status',
      parameters: {},
      expectedResult: 'success', // First request should succeed
      description: 'First request should succeed',
    },
  ];
}

/**
 * Create path validation test cases
 */
export function createPathValidationTestCases(): TestCase[] {
  return [
    {
      name: 'Null byte in path',
      tool: 'context_for_file',
      parameters: { filePath: 'src\0index.ts' },
      expectedResult: 'blocked',
      expectedErrorCode: 'E_PATH_INVALID',
      description: 'Should block null bytes in paths',
    },
    {
      name: 'Path with control characters',
      tool: 'context_for_file',
      parameters: { filePath: 'src/\nindex.ts' },
      expectedResult: 'blocked',
      expectedErrorCode: 'E_PATH_INVALID',
      description: 'Should block control characters',
    },
  ];
}

/**
 * Run security test suite
 */
export async function runSecurityTests(
  server: VibeCheckServer,
  securityMiddleware: SecurityMiddleware
): Promise<{ passed: number; failed: number; results: TestResult[] }> {
  const harness = new SecurityTestHarness(server, securityMiddleware);
  const testCases = [
    ...createSecurityTestCases(),
    ...createPathValidationTestCases(),
  ];

  await harness.runTests(testCases);
  const summary = harness.getSummary();

  return {
    passed: summary.passed,
    failed: summary.failed,
    results: harness.getResults(),
  };
}
