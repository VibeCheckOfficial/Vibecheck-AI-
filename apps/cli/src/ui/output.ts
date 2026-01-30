/**
 * UNIFIED OUTPUT SYSTEM
 * 
 * All CLI output goes through here. JSON and text share the same structure.
 * This ensures consistency between machine-readable and human-readable output.
 * 
 * Rules:
 * - JSON output serializes the ScanOutput object directly
 * - Text output is rendered from the same ScanOutput object
 * - No renderer may compute scores or percentages - they come pre-calculated
 * 
 * @module ui/output
 */

import chalk from 'chalk';
import { CLI_VERSION } from '../lib/version.js';
import type { 
  CommandResult,
  CommandScores,
  CommandVerdict,
  CommandCounts,
  SeverityCounts,
} from '@repo/shared-types';
import type { CategoryScoreResult, CategoryScore } from '@vibecheck/core/scoring';
import {
  renderScorePanel,
  renderSimpleScorePanel,
  renderGauge,
  renderSeverityCounts,
  renderTiming,
  renderDivider,
  renderSectionHeader,
  renderVerdict,
  getVerdictConfig,
} from './visualizations.js';
import { getEnvironment, getSafeTerminalWidth } from '../lib/environment.js';
import { formatDuration } from './theme.js';

// ============================================================================
// OUTPUT TYPES (consistent across all commands)
// ============================================================================

export interface ScanOutput {
  /** CLI version */
  version: string;
  /** Command that was run */
  command: string;
  /** ISO timestamp */
  timestamp: string;
  /** Absolute path to project */
  projectPath: string;
  
  /** Overall score 0-100 integer */
  score: number;
  /** Verdict: SHIP | WARN | BLOCK */
  verdict: CommandVerdict;
  
  /** Category breakdown (optional, for detailed reports) */
  categories?: Array<{
    name: string;
    score: number;
    weight: number;
    findingCount: number;
  }>;
  
  /** All findings */
  findings: Array<{
    id: string;
    engine: string;
    type?: string;
    severity: string;
    file: string;
    line: number;
    column?: number;
    message: string;
    confidence: number;
    suggestion?: string;
  }>;
  
  /** Finding counts by severity */
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    total: number;
  };
  
  /** Timing information */
  timing: {
    total: number;
    engines?: Record<string, number>;
    phases?: Array<{ name: string; durationMs: number }>;
  };
  
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// OUTPUT FORMATTERS
// ============================================================================

/**
 * Format output in the requested format
 */
export function formatOutput(
  data: ScanOutput,
  format: 'text' | 'json' | 'sarif'
): string {
  switch (format) {
    case 'json':
      return formatJson(data);
    
    case 'sarif':
      return formatSarif(data);
    
    case 'text':
    default:
      return formatText(data);
  }
}

/**
 * Format as pretty JSON
 */
export function formatJson(data: ScanOutput): string {
  return JSON.stringify(data, null, 2);
}

/**
 * Format as human-readable text
 */
export function formatText(data: ScanOutput): string {
  const lines: string[] = [];
  const verdictConfig = getVerdictConfig(data.verdict);
  const env = getEnvironment();
  const width = Math.min(70, getSafeTerminalWidth(80));
  
  // Header
  lines.push('');
  lines.push(chalk.bold.cyan('  VibeCheck Scan Results'));
  lines.push(chalk.dim(`  ${data.projectPath}`));
  lines.push('');
  
  // Score panel
  lines.push(`  ${chalk.bold('Vibe Score:')} ${verdictConfig.color.bold(data.score.toString())}/100 ${renderVerdict(data.verdict)}`);
  lines.push('');
  lines.push(`  ${renderGauge(data.score, 40)}`);
  lines.push('');
  
  // Category breakdown (if provided)
  if (data.categories && data.categories.length > 0) {
    lines.push(`  ${chalk.bold.dim('Category Breakdown')}`);
    lines.push(chalk.dim('  ' + '─'.repeat(width - 4)));
    
    for (const cat of data.categories) {
      const label = cat.name.charAt(0).toUpperCase() + cat.name.slice(1);
      const paddedLabel = label.padEnd(15);
      const scoreStr = `${cat.score}%`.padStart(5);
      const gauge = renderGauge(cat.score, 25);
      lines.push(`  ${chalk.dim(paddedLabel)} ${scoreStr}  ${gauge}`);
    }
    lines.push('');
  }
  
  // Finding summary
  if (data.summary.total > 0) {
    lines.push(`  ${chalk.bold.dim('Findings')}`);
    lines.push(chalk.dim('  ' + '─'.repeat(width - 4)));
    lines.push(`  ${renderSeverityCounts(data.summary)}`);
    lines.push('');
  }
  
  // Top findings (max 10 in text mode)
  if (data.findings.length > 0) {
    lines.push(`  ${chalk.bold.dim('Top Findings')}`);
    lines.push(chalk.dim('  ' + '─'.repeat(width - 4)));
    
    const topFindings = data.findings.slice(0, 10);
    for (const f of topFindings) {
      const sevColor = f.severity === 'critical' || f.severity === 'high'
        ? chalk.red
        : f.severity === 'medium'
          ? chalk.yellow
          : chalk.dim;
      
      // Make path relative
      const relPath = f.file.replace(data.projectPath, '.').replace(/\\/g, '/');
      lines.push(`  ${sevColor('●')} ${chalk.dim(`${relPath}:${f.line}`)} ${f.message}`);
    }
    
    if (data.findings.length > 10) {
      lines.push(chalk.dim(`  ... and ${data.findings.length - 10} more findings`));
    }
    lines.push('');
  }
  
  // Timing
  lines.push(`  ${chalk.dim('Completed in')} ${renderTiming(data.timing.total)}`);
  lines.push('');
  
  return lines.join('\n');
}

/**
 * Format as SARIF (Static Analysis Results Interchange Format)
 * Compatible with GitHub Code Scanning, VS Code SARIF Viewer, etc.
 */
export function formatSarif(data: ScanOutput): string {
  // Get unique engines as rules
  const engineSet = new Set(data.findings.map(f => f.engine));
  const engines = Array.from(engineSet);
  
  const sarif = {
    $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [{
      tool: {
        driver: {
          name: 'VibeCheck',
          version: data.version,
          informationUri: 'https://vibecheck.dev',
          rules: engines.map(engine => ({
            id: engine,
            name: engine.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
            shortDescription: { text: `${engine} detection rule` },
            defaultConfiguration: {
              level: 'warning',
            },
            properties: {
              tags: ['vibecheck', engine],
            },
          })),
        },
      },
      results: data.findings.map(f => ({
        ruleId: f.engine,
        level: mapSeverityToSarifLevel(f.severity),
        message: { text: f.message },
        locations: [{
          physicalLocation: {
            artifactLocation: { 
              uri: f.file.replace(data.projectPath, '').replace(/^[/\\]/, ''),
              uriBaseId: '%SRCROOT%',
            },
            region: { 
              startLine: f.line, 
              startColumn: f.column || 1,
            },
          },
        }],
        partialFingerprints: {
          primaryLocationLineHash: f.id,
        },
        properties: {
          confidence: f.confidence,
          ...(f.suggestion ? { suggestion: f.suggestion } : {}),
        },
      })),
      invocations: [{
        executionSuccessful: true,
        endTimeUtc: data.timestamp,
      }],
    }],
  };
  
  return JSON.stringify(sarif, null, 2);
}

/**
 * Map our severity to SARIF level
 */
function mapSeverityToSarifLevel(severity: string): 'error' | 'warning' | 'note' {
  switch (severity) {
    case 'critical':
    case 'high':
      return 'error';
    case 'medium':
      return 'warning';
    case 'low':
    default:
      return 'note';
  }
}

// ============================================================================
// CONVERSION HELPERS
// ============================================================================

/**
 * Convert CommandResult to ScanOutput
 */
export function toScanOutput<T>(
  result: CommandResult<T>,
  findings: ScanOutput['findings']
): ScanOutput {
  return {
    version: result.version,
    command: result.commandName,
    timestamp: result.startedAt,
    projectPath: result.repoRoot,
    score: result.scores.overall,
    verdict: result.verdict.status,
    findings,
    summary: {
      critical: result.counts.findingsBySeverity.critical,
      high: result.counts.findingsBySeverity.high,
      medium: result.counts.findingsBySeverity.medium,
      low: result.counts.findingsBySeverity.low,
      total: result.counts.findingsTotal,
    },
    timing: {
      total: result.durationMs,
      phases: result.phases,
    },
  };
}

/**
 * Convert CategoryScoreResult to ScanOutput categories
 */
export function toCategoryOutput(result: CategoryScoreResult): ScanOutput['categories'] {
  return result.categories.map(cat => ({
    name: cat.name,
    score: cat.score,
    weight: cat.weight,
    findingCount: cat.findingCount,
  }));
}

/**
 * Create a minimal ScanOutput for quick results
 */
export function createQuickOutput(
  score: number,
  verdict: CommandVerdict,
  findings: ScanOutput['findings'],
  projectPath: string,
  durationMs: number
): ScanOutput {
  const severityCounts: SeverityCounts = {
    critical: findings.filter(f => f.severity === 'critical').length,
    high: findings.filter(f => f.severity === 'high').length,
    medium: findings.filter(f => f.severity === 'medium').length,
    low: findings.filter(f => f.severity === 'low').length,
  };
  
  return {
    version: CLI_VERSION,
    command: 'scan',
    timestamp: new Date().toISOString(),
    projectPath,
    score,
    verdict,
    findings,
    summary: {
      ...severityCounts,
      total: findings.length,
    },
    timing: {
      total: durationMs,
    },
  };
}

// ============================================================================
// CONSOLE OUTPUT HELPERS
// ============================================================================

/**
 * Print output to console
 */
export function printOutput(
  data: ScanOutput,
  format: 'text' | 'json' | 'sarif'
): void {
  console.log(formatOutput(data, format));
}

/**
 * Print a success message
 */
export function printSuccess(message: string): void {
  console.log(chalk.green('✓') + ' ' + message);
}

/**
 * Print an error message
 */
export function printError(message: string): void {
  console.error(chalk.red('✗') + ' ' + message);
}

/**
 * Print a warning message
 */
export function printWarning(message: string): void {
  console.warn(chalk.yellow('⚠') + ' ' + message);
}

/**
 * Print a timing summary
 */
export function printTimingSummary(timings: Map<string, number>): void {
  const sorted = Array.from(timings.entries()).sort((a, b) => b[1] - a[1]);
  const total = sorted.reduce((sum, [, ms]) => sum + ms, 0);
  
  console.log('');
  console.log(chalk.bold.dim('Timing Breakdown'));
  console.log(chalk.dim('─'.repeat(50)));
  
  for (const [name, ms] of sorted) {
    const pct = total > 0 ? Math.round((ms / total) * 100) : 0;
    const bar = renderGauge(pct, 15);
    console.log(`  ${name.padEnd(20)} ${formatDuration(ms).padStart(8)} ${bar}`);
  }
  
  console.log(chalk.dim('─'.repeat(50)));
  console.log(`  ${'Total'.padEnd(20)} ${formatDuration(total).padStart(8)}`);
  console.log('');
}
