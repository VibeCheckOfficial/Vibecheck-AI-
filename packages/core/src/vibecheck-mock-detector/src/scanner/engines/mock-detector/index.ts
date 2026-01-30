// src/scanner/engines/mock-detector/index.ts

import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';
import { PATTERNS, IGNORED_PATHS } from './patterns';
import type { Pattern, Finding, ScanResult, ScanOptions, Severity, Category } from './types';

const DEFAULT_INCLUDE = ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'];
const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low'];

export async function scan(options: ScanOptions): Promise<ScanResult> {
  const startTime = Date.now();
  const findings: Finding[] = [];

  const {
    rootDir,
    include = DEFAULT_INCLUDE,
    exclude = [],
    severityThreshold = 'low',
    enableAstAnalysis = true,
  } = options;

  // Get files to scan
  const files = await glob(include, {
    cwd: rootDir,
    ignore: ['**/node_modules/**', '**/dist/**', '**/.next/**', ...exclude],
    absolute: true,
  });

  // Filter ignored paths
  const filesToScan = files.filter((file) => !IGNORED_PATHS.some((regex) => regex.test(file)));

  // Scan each file
  for (const file of filesToScan) {
    try {
      const content = await fs.readFile(file, 'utf-8');
      const lines = content.split('\n');
      const relativePath = path.relative(rootDir, file);

      // Pattern-based scanning
      for (const pattern of PATTERNS) {
        if (!shouldIncludeSeverity(pattern.severity, severityThreshold)) continue;

        const matches = findMatches(content, pattern, lines);
        for (const match of matches) {
          findings.push({
            ...match,
            file: relativePath,
            category: pattern.category,
            severity: pattern.severity,
            description: pattern.description,
            fix: pattern.fix,
            autoFixable: pattern.autoFixable || false,
            confidence: pattern.confidence,
          });
        }
      }

      // AST-based scanning for deeper analysis
      if (enableAstAnalysis) {
        try {
          const { analyzeAdvanced } = await import('./analyzer-advanced');
          const astFindings = await analyzeAdvanced(content, relativePath);
          findings.push(...astFindings);
        } catch {
          // AST analysis not available, skip
        }
      }
    } catch (error) {
      console.warn(`Warning: Could not scan ${file}:`, error);
    }
  }

  // Sort findings by severity
  findings.sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));

  // Build summary
  const summary = buildSummary(findings);

  return {
    findings,
    summary,
    scannedFiles: filesToScan.length,
    duration: Date.now() - startTime,
    timestamp: new Date().toISOString(),
  };
}

function findMatches(
  content: string,
  pattern: Pattern,
  lines: string[]
): Array<{ id: string; line: number; column: number; code: string }> {
  const matches: Array<{ id: string; line: number; column: number; code: string }> = [];
  const regex = new RegExp(pattern.pattern.source, pattern.pattern.flags);

  let match;
  while ((match = regex.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const lineNumber = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    // Get context (the full line)
    const codeLine = lines[lineNumber - 1]?.trim() || match[0];

    matches.push({
      id: pattern.id,
      line: lineNumber,
      column,
      code: codeLine,
    });
  }

  return matches;
}

function shouldIncludeSeverity(findingSeverity: Severity, threshold: Severity): boolean {
  return SEVERITY_ORDER.indexOf(findingSeverity) <= SEVERITY_ORDER.indexOf(threshold);
}

function buildSummary(findings: Finding[]) {
  const bySeverity: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  const byCategory: Record<string, number> = {};

  for (const finding of findings) {
    bySeverity[finding.severity]++;
    byCategory[finding.category] = (byCategory[finding.category] || 0) + 1;
  }

  return {
    total: findings.length,
    bySeverity,
    byCategory: byCategory as Record<Category, number>,
    autoFixable: findings.filter(f => f.autoFixable).length,
  };
}

// Re-export types and patterns
export { PATTERNS, IGNORED_PATHS } from './patterns';
export * from './types';
