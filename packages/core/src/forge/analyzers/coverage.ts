/**
 * Coverage Analyzer - Self-Aware Forge Engine
 *
 * Parses coverage reports if available and identifies
 * untested code paths to inform rule generation.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// ============================================================================
// TYPES
// ============================================================================

export interface CoverageReport {
  /** Whether coverage data is available */
  available: boolean;
  /** Coverage source */
  source: 'lcov' | 'istanbul' | 'vitest' | 'jest' | 'unknown' | null;
  /** Overall coverage percentage */
  overall: CoveragePercentage;
  /** Per-file coverage */
  files: FileCoverage[];
  /** Untested files */
  untestedFiles: string[];
  /** Partially tested files (< 50% coverage) */
  lowCoverageFiles: Array<{ path: string; coverage: number }>;
}

export interface CoveragePercentage {
  lines: number;
  branches: number;
  functions: number;
  statements: number;
}

export interface FileCoverage {
  path: string;
  lines: CoveragePercentage;
  uncoveredLines: number[];
}

// ============================================================================
// COVERAGE DETECTION
// ============================================================================

/**
 * Analyze coverage for a project
 */
export async function analyzeCoverage(projectPath: string): Promise<CoverageReport> {
  // Try different coverage formats
  const lcovPath = path.join(projectPath, 'coverage', 'lcov.info');
  const istanbulPath = path.join(projectPath, 'coverage', 'coverage-final.json');
  const vitestPath = path.join(projectPath, 'coverage', 'coverage-summary.json');

  if (fs.existsSync(lcovPath)) {
    return parseLcov(lcovPath, projectPath);
  }

  if (fs.existsSync(istanbulPath)) {
    return parseIstanbul(istanbulPath, projectPath);
  }

  if (fs.existsSync(vitestPath)) {
    return parseVitestSummary(vitestPath, projectPath);
  }

  // No coverage found
  return {
    available: false,
    source: null,
    overall: { lines: 0, branches: 0, functions: 0, statements: 0 },
    files: [],
    untestedFiles: [],
    lowCoverageFiles: [],
  };
}

// ============================================================================
// LCOV PARSER
// ============================================================================

/**
 * Parse LCOV format coverage
 */
function parseLcov(lcovPath: string, projectPath: string): CoverageReport {
  try {
    const content = fs.readFileSync(lcovPath, 'utf-8');
    const files: FileCoverage[] = [];

    let currentFile: string | null = null;
    let linesFound = 0;
    let linesHit = 0;
    let branchesFound = 0;
    let branchesHit = 0;
    let functionsFound = 0;
    let functionsHit = 0;
    const uncoveredLines: number[] = [];

    // Totals
    let totalLinesFound = 0;
    let totalLinesHit = 0;
    let totalBranchesFound = 0;
    let totalBranchesHit = 0;
    let totalFunctionsFound = 0;
    let totalFunctionsHit = 0;

    for (const line of content.split('\n')) {
      if (line.startsWith('SF:')) {
        currentFile = line.substring(3).trim();
        linesFound = 0;
        linesHit = 0;
        branchesFound = 0;
        branchesHit = 0;
        functionsFound = 0;
        functionsHit = 0;
        uncoveredLines.length = 0;
      } else if (line.startsWith('DA:')) {
        const [lineNum, hits] = line.substring(3).split(',').map(Number);
        linesFound++;
        if (hits > 0) {
          linesHit++;
        } else {
          uncoveredLines.push(lineNum);
        }
      } else if (line.startsWith('BRDA:')) {
        branchesFound++;
        const parts = line.substring(5).split(',');
        if (parseInt(parts[3], 10) > 0) {
          branchesHit++;
        }
      } else if (line.startsWith('FNF:')) {
        functionsFound = parseInt(line.substring(4), 10);
      } else if (line.startsWith('FNH:')) {
        functionsHit = parseInt(line.substring(4), 10);
      } else if (line === 'end_of_record' && currentFile) {
        const relativePath = path.relative(projectPath, currentFile);

        files.push({
          path: relativePath,
          lines: {
            lines: linesFound > 0 ? (linesHit / linesFound) * 100 : 0,
            branches: branchesFound > 0 ? (branchesHit / branchesFound) * 100 : 0,
            functions: functionsFound > 0 ? (functionsHit / functionsFound) * 100 : 0,
            statements: linesFound > 0 ? (linesHit / linesFound) * 100 : 0,
          },
          uncoveredLines: [...uncoveredLines],
        });

        totalLinesFound += linesFound;
        totalLinesHit += linesHit;
        totalBranchesFound += branchesFound;
        totalBranchesHit += branchesHit;
        totalFunctionsFound += functionsFound;
        totalFunctionsHit += functionsHit;

        currentFile = null;
      }
    }

    const overall: CoveragePercentage = {
      lines: totalLinesFound > 0 ? (totalLinesHit / totalLinesFound) * 100 : 0,
      branches: totalBranchesFound > 0 ? (totalBranchesHit / totalBranchesFound) * 100 : 0,
      functions: totalFunctionsFound > 0 ? (totalFunctionsHit / totalFunctionsFound) * 100 : 0,
      statements: totalLinesFound > 0 ? (totalLinesHit / totalLinesFound) * 100 : 0,
    };

    const untestedFiles = files.filter((f) => f.lines.lines === 0).map((f) => f.path);
    const lowCoverageFiles = files
      .filter((f) => f.lines.lines > 0 && f.lines.lines < 50)
      .map((f) => ({ path: f.path, coverage: f.lines.lines }))
      .sort((a, b) => a.coverage - b.coverage);

    return {
      available: true,
      source: 'lcov',
      overall,
      files,
      untestedFiles,
      lowCoverageFiles,
    };
  } catch {
    return createEmptyReport();
  }
}

// ============================================================================
// ISTANBUL PARSER
// ============================================================================

interface IstanbulCoverageData {
  [filePath: string]: {
    path: string;
    statementMap: Record<string, unknown>;
    fnMap: Record<string, unknown>;
    branchMap: Record<string, unknown>;
    s: Record<string, number>;
    f: Record<string, number>;
    b: Record<string, number[]>;
  };
}

/**
 * Parse Istanbul JSON coverage
 */
function parseIstanbul(istanbulPath: string, projectPath: string): CoverageReport {
  try {
    const content = fs.readFileSync(istanbulPath, 'utf-8');
    const data = JSON.parse(content) as IstanbulCoverageData;

    const files: FileCoverage[] = [];
    let totalStatements = 0;
    let totalStatementsHit = 0;
    let totalFunctions = 0;
    let totalFunctionsHit = 0;
    let totalBranches = 0;
    let totalBranchesHit = 0;

    for (const [filePath, coverage] of Object.entries(data)) {
      const relativePath = path.relative(projectPath, filePath);

      // Count statements
      const statements = Object.values(coverage.s);
      const statementsHit = statements.filter((v) => v > 0).length;

      // Count functions
      const functions = Object.values(coverage.f);
      const functionsHit = functions.filter((v) => v > 0).length;

      // Count branches
      const branches = Object.values(coverage.b).flat();
      const branchesHit = branches.filter((v) => v > 0).length;

      // Find uncovered lines
      const uncoveredLines: number[] = [];
      for (const [key, hits] of Object.entries(coverage.s)) {
        if (hits === 0) {
          const stmt = coverage.statementMap[key] as { start: { line: number } } | undefined;
          if (stmt?.start?.line) {
            uncoveredLines.push(stmt.start.line);
          }
        }
      }

      files.push({
        path: relativePath,
        lines: {
          lines: statements.length > 0 ? (statementsHit / statements.length) * 100 : 0,
          branches: branches.length > 0 ? (branchesHit / branches.length) * 100 : 0,
          functions: functions.length > 0 ? (functionsHit / functions.length) * 100 : 0,
          statements: statements.length > 0 ? (statementsHit / statements.length) * 100 : 0,
        },
        uncoveredLines,
      });

      totalStatements += statements.length;
      totalStatementsHit += statementsHit;
      totalFunctions += functions.length;
      totalFunctionsHit += functionsHit;
      totalBranches += branches.length;
      totalBranchesHit += branchesHit;
    }

    const overall: CoveragePercentage = {
      lines: totalStatements > 0 ? (totalStatementsHit / totalStatements) * 100 : 0,
      branches: totalBranches > 0 ? (totalBranchesHit / totalBranches) * 100 : 0,
      functions: totalFunctions > 0 ? (totalFunctionsHit / totalFunctions) * 100 : 0,
      statements: totalStatements > 0 ? (totalStatementsHit / totalStatements) * 100 : 0,
    };

    const untestedFiles = files.filter((f) => f.lines.lines === 0).map((f) => f.path);
    const lowCoverageFiles = files
      .filter((f) => f.lines.lines > 0 && f.lines.lines < 50)
      .map((f) => ({ path: f.path, coverage: f.lines.lines }))
      .sort((a, b) => a.coverage - b.coverage);

    return {
      available: true,
      source: 'istanbul',
      overall,
      files,
      untestedFiles,
      lowCoverageFiles,
    };
  } catch {
    return createEmptyReport();
  }
}

// ============================================================================
// VITEST/JEST SUMMARY PARSER
// ============================================================================

interface CoverageSummaryData {
  total: {
    lines: { total: number; covered: number; pct: number };
    branches: { total: number; covered: number; pct: number };
    functions: { total: number; covered: number; pct: number };
    statements: { total: number; covered: number; pct: number };
  };
  [filePath: string]: {
    lines: { total: number; covered: number; pct: number };
    branches: { total: number; covered: number; pct: number };
    functions: { total: number; covered: number; pct: number };
    statements: { total: number; covered: number; pct: number };
  };
}

/**
 * Parse Vitest/Jest coverage summary
 */
function parseVitestSummary(summaryPath: string, projectPath: string): CoverageReport {
  try {
    const content = fs.readFileSync(summaryPath, 'utf-8');
    const data = JSON.parse(content) as CoverageSummaryData;

    const files: FileCoverage[] = [];

    for (const [filePath, coverage] of Object.entries(data)) {
      if (filePath === 'total') continue;

      const relativePath = path.relative(projectPath, filePath);

      files.push({
        path: relativePath,
        lines: {
          lines: coverage.lines?.pct ?? 0,
          branches: coverage.branches?.pct ?? 0,
          functions: coverage.functions?.pct ?? 0,
          statements: coverage.statements?.pct ?? 0,
        },
        uncoveredLines: [], // Not available in summary
      });
    }

    const overall: CoveragePercentage = {
      lines: data.total?.lines?.pct ?? 0,
      branches: data.total?.branches?.pct ?? 0,
      functions: data.total?.functions?.pct ?? 0,
      statements: data.total?.statements?.pct ?? 0,
    };

    const untestedFiles = files.filter((f) => f.lines.lines === 0).map((f) => f.path);
    const lowCoverageFiles = files
      .filter((f) => f.lines.lines > 0 && f.lines.lines < 50)
      .map((f) => ({ path: f.path, coverage: f.lines.lines }))
      .sort((a, b) => a.coverage - b.coverage);

    return {
      available: true,
      source: 'vitest',
      overall,
      files,
      untestedFiles,
      lowCoverageFiles,
    };
  } catch {
    return createEmptyReport();
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function createEmptyReport(): CoverageReport {
  return {
    available: false,
    source: null,
    overall: { lines: 0, branches: 0, functions: 0, statements: 0 },
    files: [],
    untestedFiles: [],
    lowCoverageFiles: [],
  };
}

/**
 * Get coverage tier based on percentage
 */
export function getCoverageTier(percentage: number): 'excellent' | 'good' | 'fair' | 'poor' {
  if (percentage >= 80) return 'excellent';
  if (percentage >= 60) return 'good';
  if (percentage >= 40) return 'fair';
  return 'poor';
}

/**
 * Get files that need more testing
 */
export function getTestingPriorities(report: CoverageReport): string[] {
  const priorities: string[] = [];

  // Prioritize untested files
  priorities.push(...report.untestedFiles.slice(0, 10));

  // Then low coverage files
  for (const file of report.lowCoverageFiles) {
    if (!priorities.includes(file.path) && priorities.length < 20) {
      priorities.push(file.path);
    }
  }

  return priorities;
}
