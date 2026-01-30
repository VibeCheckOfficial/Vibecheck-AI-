/**
 * Ship Score UI Components
 * 
 * Beautiful visual rendering of Ship Score for CLI output.
 * 
 * @module ui/ship-score
 */

import chalk from 'chalk';
import type { ShipScoreBreakdown, ShipScoreFinding, ShipVerdict } from '@vibecheck/core/scoring';
import { symbols, formatDuration, divider, box } from './theme.js';
import { getEnvironment, getSafeTerminalWidth } from '../lib/environment.js';

// ============================================================================
// Types
// ============================================================================

export interface ShipScoreDisplayOptions {
  /** Show detailed breakdown */
  detailed?: boolean;
  /** Show metrics */
  showMetrics?: boolean;
  /** Width for rendering */
  width?: number;
}

export interface TopIssueDisplay {
  finding: ShipScoreFinding;
  index: number;
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

const DIMENSION_LABELS = {
  ghostRisk: 'Ghost Risk',
  authCoverage: 'Auth Coverage',
  envIntegrity: 'Env Integrity',
  runtimeProof: 'Runtime Proof',
  contractsAlignment: 'Contracts',
} as const;

const SEVERITY_ICONS = {
  error: '\ud83d\udd34',  // 🔴
  warning: '\ud83d\udfe1',  // 🟡
  info: '\ud83d\udfe2',  // 🟢
} as const;

const SEVERITY_COLORS = {
  error: chalk.red,
  warning: chalk.yellow,
  info: chalk.blue,
} as const;

// ============================================================================
// Progress Bar Rendering
// ============================================================================

/**
 * Render a score bar (0-20 scale)
 */
function renderScoreBar(score: number, maxScore: number = 20, width: number = 10): string {
  const env = getEnvironment();
  const filled = env.terminal.unicode ? '\u2593' : '#';  // ▓
  const empty = env.terminal.unicode ? '\u2591' : '-';   // ░
  
  const ratio = score / maxScore;
  const filledCount = Math.round(ratio * width);
  const emptyCount = width - filledCount;
  
  // Color based on score ratio
  let color: (s: string) => string;
  if (ratio >= 0.8) {
    color = chalk.green;
  } else if (ratio >= 0.6) {
    color = chalk.yellow;
  } else {
    color = chalk.red;
  }
  
  return color(filled.repeat(filledCount)) + chalk.dim(empty.repeat(emptyCount));
}

// ============================================================================
// Ship Score Box Rendering
// ============================================================================

/**
 * Render the main Ship Score box
 */
export function renderShipScoreBox(
  score: ShipScoreBreakdown,
  options: ShipScoreDisplayOptions = {}
): string {
  const env = getEnvironment();
  const width = options.width ?? Math.min(60, getSafeTerminalWidth(80));
  
  // Safe access to verdict with fallback
  const verdict = score?.verdict ?? 'WARN';
  const verdictColor = VERDICT_COLORS[verdict] ?? chalk.yellow;
  const verdictIcon = env.terminal.unicode ? (VERDICT_ICONS[verdict] ?? '') : '';
  
  const lines: string[] = [];
  
  // Header with score and verdict
  const totalScore = score?.total ?? 0;
  const scoreText = `Ship Score: ${totalScore}/100`;
  const verdictText = `${verdictIcon} ${verdict}`;
  lines.push(`  ${chalk.bold(scoreText)}  ${verdictColor(verdictText)}`);
  lines.push('');
  
  // Dimension breakdown - handle missing or empty dimensions gracefully
  const dimensions = score?.dimensions ?? {};
  const dimEntries = Object.entries(dimensions) as Array<[keyof typeof DIMENSION_LABELS, number]>;
  
  // If no dimensions, show a default set with zeros
  if (dimEntries.length === 0) {
    const defaultDimensions: Array<[keyof typeof DIMENSION_LABELS, number]> = [
      ['ghostRisk', 0],
      ['authCoverage', 0],
      ['envIntegrity', 0],
      ['runtimeProof', 0],
      ['contractsAlignment', 0],
    ];
    for (const [key, value] of defaultDimensions) {
      const label = (DIMENSION_LABELS[key] ?? key).padEnd(16);
      const scoreStr = `${value}/20`.padStart(5);
      const bar = renderScoreBar(value, 20, 10);
      lines.push(`  ${chalk.dim(label)} ${scoreStr}  ${bar}`);
    }
  } else {
    for (const [key, value] of dimEntries) {
      const label = (DIMENSION_LABELS[key] ?? key).padEnd(16);
      const scoreStr = `${value ?? 0}/20`.padStart(5);
      const bar = renderScoreBar(value ?? 0, 20, 10);
      lines.push(`  ${chalk.dim(label)} ${scoreStr}  ${bar}`);
    }
  }
  
  // Create box
  const boxContent = lines.join('\n');
  
  // Use Unicode box drawing if available
  if (env.terminal.unicode) {
    const borderTop = '\u250c' + '\u2500'.repeat(width - 2) + '\u2510';
    const borderBottom = '\u2514' + '\u2500'.repeat(width - 2) + '\u2518';
    const borderSide = '\u2502';
    
    const boxLines = [
      chalk.dim(borderTop),
      ...boxContent.split('\n').map(line => {
        const paddedLine = line + ' '.repeat(Math.max(0, width - 4 - stripAnsi(line).length));
        return chalk.dim(borderSide) + ' ' + paddedLine + ' ' + chalk.dim(borderSide);
      }),
      chalk.dim(borderBottom),
    ];
    
    return boxLines.join('\n');
  }
  
  // ASCII fallback
  const borderTop = '+' + '-'.repeat(width - 2) + '+';
  const borderBottom = '+' + '-'.repeat(width - 2) + '+';
  
  const boxLines = [
    borderTop,
    ...boxContent.split('\n').map(line => {
      const paddedLine = line + ' '.repeat(Math.max(0, width - 4 - stripAnsi(line).length));
      return '| ' + paddedLine + ' |';
    }),
    borderBottom,
  ];
  
  return boxLines.join('\n');
}

/**
 * Strip ANSI codes for length calculation
 */
function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
}

// ============================================================================
// Top Issues Rendering
// ============================================================================

/**
 * Render the top fixable issues
 */
export function renderTopIssues(
  findings: ShipScoreFinding[],
  limit: number = 3
): string {
  if (findings.length === 0) {
    return chalk.dim('  No issues found');
  }
  
  const lines: string[] = [];
  lines.push('');
  lines.push(chalk.bold('Top ' + Math.min(limit, findings.length) + ' Fixable Issues:'));
  lines.push('');
  
  const topFindings = findings.slice(0, limit);
  
  for (let i = 0; i < topFindings.length; i++) {
    const finding = topFindings[i];
    const icon = SEVERITY_ICONS[finding.severity] || SEVERITY_ICONS.info;
    const color = SEVERITY_COLORS[finding.severity] || SEVERITY_COLORS.info;
    
    // Format category nicely
    const category = formatCategory(finding.category);
    
    lines.push(`${i + 1}. ${icon} ${color(category)}: ${finding.message}`);
    
    if (finding.file) {
      lines.push(`   ${chalk.dim('File:')} ${chalk.underline(finding.file)}`);
    }
    
    lines.push('');
  }
  
  return lines.join('\n');
}

/**
 * Format finding category for display
 */
function formatCategory(category: string): string {
  const categoryMap: Record<string, string> = {
    ghost_route: 'Ghost Route',
    ghost_env: 'Ghost Env Var',
    auth_drift: 'Auth Drift',
    contract_violation: 'Contract Violation',
    env_missing: 'Missing Env Var',
    other: 'Issue',
  };
  
  return categoryMap[category] || category;
}

// ============================================================================
// Call to Action Rendering
// ============================================================================

/**
 * Render the fix call-to-action
 */
export function renderFixCTA(
  hasFixableIssues: boolean,
  isPro: boolean = false
): string {
  const lines: string[] = [];
  
  if (hasFixableIssues) {
    if (isPro) {
      lines.push(chalk.cyan('Fix these in 1 click: ') + chalk.bold('vibecheck fix -i'));
    } else {
      lines.push(chalk.cyan('Fix these in 1 click: ') + chalk.bold('vibecheck fix -i'));
      lines.push(chalk.dim('(or upgrade to Pro for auto-apply: vibecheck fix --apply)'));
    }
  } else {
    lines.push(chalk.green(symbols.raw.tick + ' All checks passed! Ready to ship.'));
  }
  
  return lines.join('\n');
}

// ============================================================================
// Complete Quick Init Output
// ============================================================================

/**
 * Render the complete quick init output
 */
export function renderQuickInitOutput(
  score: ShipScoreBreakdown,
  findings: ShipScoreFinding[],
  duration: number,
  options: {
    isPro?: boolean;
    projectPath?: string;
  } = {}
): string {
  const lines: string[] = [];
  
  // Add some spacing
  lines.push('');
  
  // Ship Score box
  lines.push(renderShipScoreBox(score));
  
  // Top issues (if any)
  const errorAndWarnings = findings.filter(f => f.severity === 'error' || f.severity === 'warning');
  if (errorAndWarnings.length > 0) {
    lines.push(renderTopIssues(errorAndWarnings, 3));
  } else {
    lines.push('');
    lines.push(chalk.green('\u2705 No critical issues found!'));
    lines.push('');
  }
  
  // CTA
  lines.push(renderFixCTA(errorAndWarnings.length > 0, options.isPro));
  
  // Duration
  lines.push('');
  lines.push(chalk.dim(`Completed in ${formatDuration(duration)}`));
  
  return lines.join('\n');
}

// ============================================================================
// Exports
// ============================================================================

export {
  renderScoreBar,
  formatCategory,
  VERDICT_COLORS,
  VERDICT_ICONS,
  DIMENSION_LABELS,
  SEVERITY_ICONS,
  SEVERITY_COLORS,
};
