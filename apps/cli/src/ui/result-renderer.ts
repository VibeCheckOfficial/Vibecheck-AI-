/**
 * Unified Result Renderer
 * 
 * Single renderer module for all CLI command output.
 * All rendering MUST use this module.
 * 
 * Rules:
 * - Renders from CommandResult object only
 * - No score calculations in this module
 * - All numbers come from the result object
 * - Consistent formatting across all commands
 * 
 * @module ui/result-renderer
 */

import chalk from 'chalk';
import type {
  CommandResult,
  CommandVerdict,
  CommandCounts,
  CommandScores,
  CommandVerdictInfo,
  CommandPhase,
  SeverityCounts,
} from '@repo/shared-types';

import {
  symbols,
  colors,
  formatDuration,
  formatCount,
  formatBytes,
  box,
  divider,
  sectionHeader,
  progressBar,
} from './theme.js';
import { renderCommandHeader } from './command-header.js';
import { getEnvironment, getSafeTerminalWidth } from '../lib/environment.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Options for rendering a command result
 */
export interface RenderOptions {
  /** Show detailed phase timing breakdown */
  showPhases?: boolean;
  /** Show all findings (not just summary) */
  showFindings?: boolean;
  /** Show verbose output */
  verbose?: boolean;
  /** Compact output (less decoration) */
  compact?: boolean;
  /** Width override */
  width?: number;
}

/**
 * Finding for display
 */
export interface DisplayFinding {
  severity: 'critical' | 'high' | 'medium' | 'low';
  type: string;
  message: string;
  file?: string;
  line?: number;
  column?: number;
  suggestion?: string;
}

// ============================================================================
// Constants
// ============================================================================

const VERDICT_COLORS = {
  SHIP: chalk.green,
  WARN: chalk.yellow,
  BLOCK: chalk.red,
} as const;

const VERDICT_ICONS = {
  SHIP: '\u2705',  // ✅
  WARN: '\u26a0\ufe0f',  // ⚠️
  BLOCK: '\ud83d\uded1',  // 🛑
} as const;

const SEVERITY_COLORS = {
  critical: chalk.red.bold,
  high: chalk.red,
  medium: chalk.yellow,
  low: chalk.blue,
} as const;

const SEVERITY_ICONS = {
  critical: '\ud83d\udd34',  // 🔴
  high: '\ud83d\udfe0',  // 🟠
  medium: '\ud83d\udfe1',  // 🟡
  low: '\ud83d\udfe2',  // 🟢
} as const;

// ============================================================================
// Main Render Function
// ============================================================================

/**
 * Render a complete command result
 * 
 * @param result - The command result to render
 * @param options - Render options
 */
export function renderResult<T>(
  result: CommandResult<T>,
  options: RenderOptions = {}
): void {
  const env = getEnvironment();
  
  // If non-interactive, use simplified output
  if (!env.isInteractive || options.compact) {
    renderCompact(result, options);
    return;
  }
  
  // Full interactive rendering
  renderHeader(result);
  
  if (options.showPhases && result.phases.length > 0) {
    renderPhases(result.phases);
  }
  
  renderSummary(result.counts, result.scores, result.verdict);
  
  if (options.showFindings) {
    // Note: This requires findings to be passed separately or in data
    console.log('');
  }
  
  renderFooter(result);
}

// ============================================================================
// Header Rendering
// ============================================================================

/**
 * Render command header with vitals
 */
export function renderHeader<T>(result: CommandResult<T>): void {
  const healthStatus = getHealthStatus(result.scores.overall);
  
  // Build vitals from result
  const vitals = [
    {
      label: getVitalLabel(result.commandName),
      status: healthStatus,
      value: formatVerdictValue(result.verdict, result.counts),
      percentage: result.scores.overall,
    },
  ];
  
  // Add severity breakdown as second vital
  if (result.counts.findingsTotal > 0) {
    const bySev = result.counts.findingsBySeverity;
    const criticalHigh = bySev.critical + bySev.high;
    vitals.push({
      label: 'FINDINGS',
      status: criticalHigh > 0 ? 'critical' : bySev.medium > 0 ? 'warning' : 'stable',
      value: `${result.counts.findingsTotal} total`,
      percentage: Math.max(0, 100 - (criticalHigh * 20) - (bySev.medium * 5)),
    });
  }
  
  // Build diagnostics from result
  const diagnostics: Array<{ level: 'pass' | 'fail' | 'warn' | 'info'; message: string; details?: string }> = [];
  
  if (result.verdict.status === 'BLOCK') {
    for (const reason of result.verdict.reasons.slice(0, 3)) {
      diagnostics.push({ level: 'fail', message: reason });
    }
  } else if (result.verdict.status === 'WARN') {
    for (const reason of result.verdict.reasons.slice(0, 2)) {
      diagnostics.push({ level: 'warn', message: reason });
    }
  }
  
  if (result.warnings.length > 0) {
    for (const warning of result.warnings.slice(0, 2)) {
      diagnostics.push({ level: 'warn', message: warning });
    }
  }
  
  if (diagnostics.length === 0) {
    diagnostics.push({ level: 'pass', message: 'All checks passed' });
  }
  
  // Render using existing command header
  renderCommandHeader({
    command: result.commandName,
    version: result.version,
    target: result.repoRoot,
    elapsedTime: result.durationMs,
    vitals,
    diagnostics,
  });
}

// ============================================================================
// Phase Rendering
// ============================================================================

/**
 * Render phase timing breakdown
 */
export function renderPhases(phases: CommandPhase[]): void {
  if (phases.length === 0) return;
  
  console.log('');
  console.log(sectionHeader('Phase Timings'));
  console.log('');
  
  const totalMs = phases.reduce((sum, p) => sum + p.durationMs, 0);
  
  for (const phase of phases) {
    const percent = totalMs > 0 ? Math.round((phase.durationMs / totalMs) * 100) : 0;
    const bar = progressBar(percent, 20);
    console.log(
      `  ${phase.name.padEnd(20)} ${formatDuration(phase.durationMs).padStart(8)} ${bar} ${percent}%`
    );
  }
  
  console.log('');
}

// ============================================================================
// Summary Rendering
// ============================================================================

/**
 * Render counts, scores, and verdict summary
 */
export function renderSummary(
  counts: CommandCounts,
  scores: CommandScores,
  verdict: CommandVerdictInfo
): void {
  console.log('');
  
  // Score gauge
  const scoreColor = getScoreColor(scores.overall);
  const verdictColor = VERDICT_COLORS[verdict.status];
  const verdictIcon = getEnvironment().terminal.unicode ? VERDICT_ICONS[verdict.status] : '';
  
  console.log(
    `  ${chalk.bold('Score:')} ${scoreColor(`${scores.overall}/100`)} ` +
    `${verdictColor(`${verdictIcon} ${verdict.status}`)}`
  );
  
  // Counts breakdown
  if (counts.findingsTotal > 0) {
    console.log('');
    console.log(`  ${chalk.bold('Findings:')}`);
    const bySev = counts.findingsBySeverity;
    if (bySev.critical > 0) console.log(`    ${SEVERITY_ICONS.critical} Critical: ${bySev.critical}`);
    if (bySev.high > 0) console.log(`    ${SEVERITY_ICONS.high} High: ${bySev.high}`);
    if (bySev.medium > 0) console.log(`    ${SEVERITY_ICONS.medium} Medium: ${bySev.medium}`);
    if (bySev.low > 0) console.log(`    ${SEVERITY_ICONS.low} Low: ${bySev.low}`);
  }
  
  // File stats
  if (counts.filesScanned > 0) {
    console.log('');
    console.log(`  ${chalk.dim(`Files: ${counts.filesScanned} scanned`)}`);
    if (counts.filesSkipped > 0) {
      console.log(`  ${chalk.dim(`       ${counts.filesSkipped} skipped (cached/excluded)`)}`);
    }
  }
  
  console.log('');
}

// ============================================================================
// Findings Rendering
// ============================================================================

/**
 * Render a list of findings
 */
export function renderFindings(
  findings: DisplayFinding[],
  options: { limit?: number; groupByFile?: boolean } = {}
): void {
  if (findings.length === 0) return;
  
  const limit = options.limit ?? 10;
  const displayFindings = findings.slice(0, limit);
  
  console.log('');
  console.log(sectionHeader(`Top ${Math.min(limit, findings.length)} Findings`));
  console.log('');
  
  for (const finding of displayFindings) {
    const severityColor = SEVERITY_COLORS[finding.severity];
    const icon = SEVERITY_ICONS[finding.severity];
    
    // Severity and type
    console.log(`  ${icon} ${severityColor(finding.type.toUpperCase())}: ${finding.message}`);
    
    // Location
    if (finding.file) {
      const location = finding.line 
        ? `${finding.file}:${finding.line}${finding.column ? `:${finding.column}` : ''}`
        : finding.file;
      console.log(`     ${chalk.dim(`at ${location}`)}`);
    }
    
    // Suggestion
    if (finding.suggestion) {
      console.log(`     ${chalk.cyan(symbols.raw.arrow)} ${chalk.dim(finding.suggestion)}`);
    }
    
    console.log('');
  }
  
  if (findings.length > limit) {
    console.log(chalk.dim(`  ... and ${findings.length - limit} more findings`));
    console.log('');
  }
}

// ============================================================================
// Footer Rendering
// ============================================================================

/**
 * Render footer with artifacts and next steps
 */
export function renderFooter<T>(result: CommandResult<T>): void {
  // Duration
  console.log(chalk.dim(`  Duration: ${formatDuration(result.durationMs)}`));
  
  // Artifacts
  if (result.artifacts.truthpackPath) {
    console.log(chalk.dim(`  Output: ${result.artifacts.truthpackPath}`));
  }
  if (result.artifacts.reportPath) {
    console.log(chalk.dim(`  Report: ${result.artifacts.reportPath}`));
  }
  
  // Errors
  if (result.errors.length > 0) {
    console.log('');
    console.log(chalk.red.bold('  Errors:'));
    for (const error of result.errors.slice(0, 3)) {
      console.log(`    ${symbols.error} ${error}`);
    }
  }
  
  console.log('');
}

// ============================================================================
// Compact Rendering
// ============================================================================

/**
 * Render compact output for non-interactive mode
 */
function renderCompact<T>(result: CommandResult<T>, options: RenderOptions): void {
  const verdictColor = VERDICT_COLORS[result.verdict.status];
  
  console.log('');
  console.log(`${chalk.bold(result.commandName)} - ${verdictColor(result.verdict.status)}`);
  console.log(`  Score: ${result.scores.overall}/100`);
  console.log(`  Findings: ${result.counts.findingsTotal}`);
  console.log(`  Duration: ${formatDuration(result.durationMs)}`);
  
  if (result.verdict.reasons.length > 0) {
    console.log(`  Reasons:`);
    for (const reason of result.verdict.reasons) {
      console.log(`    - ${reason}`);
    }
  }
  
  console.log('');
}

// ============================================================================
// JSON Rendering
// ============================================================================

/**
 * Render result as JSON
 */
export function renderJson<T>(result: CommandResult<T>): void {
  // JSON output is the canonical format - just serialize the result
  console.log(JSON.stringify(result, null, 2));
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get health status from score
 */
function getHealthStatus(score: number): 'optimal' | 'stable' | 'warning' | 'critical' {
  if (score >= 90) return 'optimal';
  if (score >= 80) return 'stable';
  if (score >= 60) return 'warning';
  return 'critical';
}

/**
 * Get vital label for command
 */
function getVitalLabel(commandName: string): string {
  const labels: Record<string, string> = {
    scan: 'SCAN HEALTH',
    ship: 'DEPLOYMENT READY',
    check: 'CODE HEALTH',
    validate: 'VALIDATION STATUS',
    fix: 'FIX STATUS',
  };
  return labels[commandName] || 'STATUS';
}

/**
 * Format verdict value for display
 */
function formatVerdictValue(verdict: CommandVerdictInfo, counts: CommandCounts): string {
  if (verdict.status === 'SHIP') {
    return counts.findingsTotal === 0 ? 'Ready to ship' : `${counts.findingsTotal} findings`;
  }
  if (verdict.status === 'WARN') {
    return `${counts.findingsTotal} findings (non-blocking)`;
  }
  return `${counts.findingsTotal} blocking issue(s)`;
}

/**
 * Get chalk color function for score
 */
function getScoreColor(score: number): typeof chalk.green {
  if (score >= 80) return chalk.green;
  if (score >= 60) return chalk.yellow;
  return chalk.red;
}

// ============================================================================
// Success/Error Message Rendering
// ============================================================================

/**
 * Render success message
 */
export function renderSuccess(message: string, details?: string[]): void {
  console.log('');
  console.log(`${symbols.success} ${chalk.green(message)}`);
  if (details) {
    for (const detail of details) {
      console.log(`  ${symbols.arrow} ${chalk.dim(detail)}`);
    }
  }
  console.log('');
}

/**
 * Render error message
 */
export function renderError(message: string, details?: string[]): void {
  console.log('');
  console.log(`${symbols.error} ${chalk.red(message)}`);
  if (details) {
    for (const detail of details) {
      console.log(`  ${symbols.arrow} ${chalk.dim(detail)}`);
    }
  }
  console.log('');
}

/**
 * Render warning message
 */
export function renderWarning(message: string, details?: string[]): void {
  console.log('');
  console.log(`${symbols.warning} ${chalk.yellow(message)}`);
  if (details) {
    for (const detail of details) {
      console.log(`  ${symbols.arrow} ${chalk.dim(detail)}`);
    }
  }
  console.log('');
}

// ============================================================================
// Exports
// ============================================================================

export {
  VERDICT_COLORS,
  VERDICT_ICONS,
  SEVERITY_COLORS,
  SEVERITY_ICONS,
};
