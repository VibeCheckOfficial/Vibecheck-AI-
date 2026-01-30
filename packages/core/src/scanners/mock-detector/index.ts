/**
 * Mock Detector Scanner Integration
 * 
 * Integrates the vibecheck-mock-detector into the main scanning pipeline.
 * Detects mock/fake data, placeholder content, debug code, and hardcoded credentials.
 * 
 * @module scanners/mock-detector
 */

import * as path from 'path';
import { getLogger, type Logger } from '../../utils/logger.js';

// Import from the vibecheck-mock-detector module
import {
  scan as mockDetectorScan,
  PATTERNS,
  IGNORED_PATHS,
} from '../../vibecheck-mock-detector/src/scanner/engines/mock-detector/index.js';

import type {
  Finding as MockFinding,
  ScanResult as MockScanResult,
  ScanOptions as MockScanOptions,
  Severity as MockSeverity,
  Category as MockCategory,
  Confidence as MockConfidence,
} from '../../vibecheck-mock-detector/src/scanner/engines/mock-detector/types.js';

import { formatReport } from '../../vibecheck-mock-detector/src/scanner/engines/mock-detector/reporter.js';
import type { OutputFormat } from '../../vibecheck-mock-detector/src/scanner/engines/mock-detector/reporter.js';

// ============================================================================
// Types
// ============================================================================

export type { MockFinding, MockScanResult, MockScanOptions, MockSeverity, MockCategory, MockConfidence };
export type { OutputFormat };

/**
 * Mock detector integrated finding (normalized for VibeCheck core)
 */
export interface MockDetectorFinding {
  id: string;
  type: 'mock_data';
  subtype: MockCategory;
  severity: 'critical' | 'error' | 'warning' | 'info';
  message: string;
  description: string;
  file: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  code: string;
  fix?: string;
  autoFixable: boolean;
  confidence: MockConfidence;
  tags?: string[];
  cwe?: string;
}

/**
 * Mock detector scan result (normalized for VibeCheck core)
 */
export interface MockDetectorScanResult {
  findings: MockDetectorFinding[];
  summary: {
    total: number;
    bySeverity: {
      critical: number;
      error: number;
      warning: number;
      info: number;
    };
    byCategory: Record<string, number>;
    autoFixable: number;
  };
  scannedFiles: number;
  duration: number;
  timestamp: string;
}

/**
 * Options for the mock detector scanner
 */
export interface MockDetectorOptions {
  /** Project root directory */
  projectRoot: string;
  
  /** Specific files to scan (if empty, scans all) */
  files?: string[];
  
  /** File patterns to include */
  includePatterns?: string[];
  
  /** File patterns to exclude */
  excludePatterns?: string[];
  
  /** Minimum severity threshold */
  severityThreshold?: MockSeverity;
  
  /** Enable AST-based analysis */
  enableAstAnalysis?: boolean;
  
  /** Industry-specific patterns */
  industries?: Array<'fintech' | 'healthcare' | 'ecommerce' | 'saas' | 'general'>;
  
  /** Progress callback */
  onProgress?: (progress: { phase: string; percentage: number }) => void;
  
  /** Finding callback (for streaming) */
  onFinding?: (finding: MockDetectorFinding) => void;
}

// ============================================================================
// Severity Mapping
// ============================================================================

/**
 * Map mock-detector severity to VibeCheck core severity
 */
function mapSeverity(mockSeverity: MockSeverity): 'critical' | 'error' | 'warning' | 'info' {
  const mapping: Record<MockSeverity, 'critical' | 'error' | 'warning' | 'info'> = {
    critical: 'critical',
    high: 'error',
    medium: 'warning',
    low: 'info',
  };
  return mapping[mockSeverity];
}

/**
 * Map VibeCheck core severity back to mock-detector severity
 */
function mapToMockSeverity(coreSeverity: 'critical' | 'error' | 'warning' | 'info'): MockSeverity {
  const mapping: Record<string, MockSeverity> = {
    critical: 'critical',
    error: 'high',
    warning: 'medium',
    info: 'low',
  };
  return mapping[coreSeverity] ?? 'low';
}

// ============================================================================
// Mock Detector Scanner Class
// ============================================================================

/**
 * Mock Detector Scanner
 * 
 * Scans codebase for mock/fake data, placeholder content, debug code,
 * and hardcoded credentials that shouldn't ship to production.
 */
export class MockDetectorScanner {
  private options: MockDetectorOptions;
  private logger: Logger;
  private initialized = false;

  constructor(options: MockDetectorOptions) {
    this.options = {
      severityThreshold: 'low',
      enableAstAnalysis: true,
      industries: ['general'],
      ...options,
    };
    this.logger = getLogger('mock-detector-scanner');
  }

  /**
   * Initialize the scanner
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.logger.debug('Mock detector scanner initialized', {
      projectRoot: this.options.projectRoot,
    });
    this.initialized = true;
  }

  /**
   * Run a full mock detection scan
   */
  async scan(): Promise<MockDetectorScanResult> {
    await this.initialize();
    
    const startTime = Date.now();
    
    this.options.onProgress?.({ phase: 'scanning', percentage: 0 });

    const mockScanOptions: MockScanOptions = {
      rootDir: this.options.projectRoot,
      include: this.options.includePatterns ?? ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
      exclude: this.options.excludePatterns ?? [],
      severityThreshold: this.options.severityThreshold,
      enableAstAnalysis: this.options.enableAstAnalysis,
      industries: this.options.industries,
    };

    const result = await mockDetectorScan(mockScanOptions);

    this.options.onProgress?.({ phase: 'processing', percentage: 80 });

    // Convert findings to normalized format
    const findings = result.findings.map((finding) => this.convertFinding(finding));

    // Emit findings if streaming
    if (this.options.onFinding) {
      for (const finding of findings) {
        this.options.onFinding(finding);
      }
    }

    this.options.onProgress?.({ phase: 'complete', percentage: 100 });

    // Build normalized summary
    const summary = {
      total: findings.length,
      bySeverity: {
        critical: findings.filter((f) => f.severity === 'critical').length,
        error: findings.filter((f) => f.severity === 'error').length,
        warning: findings.filter((f) => f.severity === 'warning').length,
        info: findings.filter((f) => f.severity === 'info').length,
      },
      byCategory: this.countByCategory(findings),
      autoFixable: findings.filter((f) => f.autoFixable).length,
    };

    return {
      findings,
      summary,
      scannedFiles: result.scannedFiles,
      duration: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Scan specific files
   */
  async scanFiles(files: string[]): Promise<MockDetectorScanResult> {
    const originalFiles = this.options.files;
    this.options.files = files;
    
    try {
      return await this.scan();
    } finally {
      this.options.files = originalFiles;
    }
  }

  /**
   * Quick scan - scan only specific categories
   */
  async quickScan(categories: MockCategory[] = ['credentials', 'fake-auth']): Promise<MockDetectorScanResult> {
    const result = await this.scan();
    
    // Filter to only specified categories
    const filteredFindings = result.findings.filter((f) => 
      categories.includes(f.subtype as MockCategory)
    );

    return {
      ...result,
      findings: filteredFindings,
      summary: {
        ...result.summary,
        total: filteredFindings.length,
        bySeverity: {
          critical: filteredFindings.filter((f) => f.severity === 'critical').length,
          error: filteredFindings.filter((f) => f.severity === 'error').length,
          warning: filteredFindings.filter((f) => f.severity === 'warning').length,
          info: filteredFindings.filter((f) => f.severity === 'info').length,
        },
        byCategory: this.countByCategory(filteredFindings),
        autoFixable: filteredFindings.filter((f) => f.autoFixable).length,
      },
    };
  }

  /**
   * Get blocking issues only (critical + high severity)
   */
  getBlockingIssues(result: MockDetectorScanResult): MockDetectorFinding[] {
    return result.findings.filter((f) => 
      f.severity === 'critical' || f.severity === 'error'
    );
  }

  /**
   * Get credential-related issues (always critical)
   */
  getCredentialIssues(result: MockDetectorScanResult): MockDetectorFinding[] {
    return result.findings.filter((f) => 
      f.subtype === 'credentials' || f.subtype === 'fake-auth'
    );
  }

  /**
   * Format scan result for output
   */
  formatResult(result: MockDetectorScanResult, format: OutputFormat = 'text'): string {
    // Convert back to mock-detector format for reporting
    const mockResult: MockScanResult = {
      findings: result.findings.map((f) => ({
        id: f.id,
        file: f.file,
        line: f.line,
        column: f.column,
        endLine: f.endLine,
        endColumn: f.endColumn,
        code: f.code,
        category: f.subtype,
        severity: mapToMockSeverity(f.severity),
        description: f.description,
        fix: f.fix,
        autoFixable: f.autoFixable,
        confidence: f.confidence,
        tags: f.tags,
        cwe: f.cwe,
      })),
      summary: {
        total: result.summary.total,
        bySeverity: {
          critical: result.summary.bySeverity.critical,
          high: result.summary.bySeverity.error,
          medium: result.summary.bySeverity.warning,
          low: result.summary.bySeverity.info,
        },
        byCategory: result.summary.byCategory as Record<MockCategory, number>,
        autoFixable: result.summary.autoFixable,
      },
      scannedFiles: result.scannedFiles,
      duration: result.duration,
      timestamp: result.timestamp,
    };

    return formatReport(mockResult, format);
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private convertFinding(mockFinding: MockFinding): MockDetectorFinding {
    return {
      id: `mock-${mockFinding.id}-${mockFinding.file}:${mockFinding.line}`,
      type: 'mock_data',
      subtype: mockFinding.category,
      severity: mapSeverity(mockFinding.severity),
      message: mockFinding.description,
      description: mockFinding.description,
      file: mockFinding.file,
      line: mockFinding.line,
      column: mockFinding.column,
      endLine: mockFinding.endLine,
      endColumn: mockFinding.endColumn,
      code: mockFinding.code,
      fix: mockFinding.fix,
      autoFixable: mockFinding.autoFixable,
      confidence: mockFinding.confidence,
      tags: mockFinding.tags,
      cwe: mockFinding.cwe,
    };
  }

  private countByCategory(findings: MockDetectorFinding[]): Record<string, number> {
    const counts: Record<string, number> = {};
    
    for (const finding of findings) {
      counts[finding.subtype] = (counts[finding.subtype] || 0) + 1;
    }
    
    return counts;
  }
}

// ============================================================================
// Factory and Helpers
// ============================================================================

let globalScanner: MockDetectorScanner | null = null;

/**
 * Get or create a mock detector scanner instance
 */
export async function getMockDetectorScanner(
  options: MockDetectorOptions
): Promise<MockDetectorScanner> {
  if (!globalScanner || globalScanner['options'].projectRoot !== options.projectRoot) {
    globalScanner = new MockDetectorScanner(options);
    await globalScanner.initialize();
  }
  return globalScanner;
}

/**
 * Reset the global scanner instance
 */
export function resetMockDetectorScanner(): void {
  globalScanner = null;
}

/**
 * Quick scan helper
 */
export async function quickMockScan(
  projectRoot: string,
  options?: Partial<MockDetectorOptions>
): Promise<MockDetectorScanResult> {
  const scanner = await getMockDetectorScanner({
    projectRoot,
    ...options,
  });
  return scanner.scan();
}

/**
 * Check if a scan result has blocking issues
 */
export function hasMockBlockingIssues(result: MockDetectorScanResult): boolean {
  return result.summary.bySeverity.critical > 0 || result.summary.bySeverity.error > 0;
}

/**
 * Calculate mock data health penalty for ship score
 * Returns a value from 0-20 (lower = more penalty)
 */
export function calculateMockHealthPenalty(result: MockDetectorScanResult): number {
  const maxScore = 20;
  let penalty = 0;

  // Critical issues (credentials, auth bypass) = heavy penalty
  penalty += result.summary.bySeverity.critical * 5;
  
  // High severity issues = moderate penalty  
  penalty += result.summary.bySeverity.error * 3;
  
  // Medium severity issues = light penalty
  penalty += result.summary.bySeverity.warning * 1;
  
  // Cap at max penalty
  return Math.max(0, maxScore - penalty);
}

// Re-export patterns for reference
export { PATTERNS, IGNORED_PATHS };
