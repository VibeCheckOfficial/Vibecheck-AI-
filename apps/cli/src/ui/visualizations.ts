/**
 * UNIFIED VISUALIZATION SYSTEM
 * 
 * All CLI visual elements (gauges, bars, charts) go through here.
 * No other file should render visual elements directly.
 * 
 * This module provides consistent rendering across all CLI commands,
 * ensuring gauges, progress bars, and score displays look identical
 * regardless of which command generates them.
 * 
 * @module ui/visualizations
 */

import chalk from 'chalk';
import { getEnvironment, getSafeTerminalWidth } from '../lib/environment.js';
import type { CategoryScoreResult, CategoryScore } from '@vibecheck/core/scoring';
import type { CommandScores, CommandVerdict, SeverityCounts } from '@repo/shared-types';

// ============================================================================
// CONSTANTS
// ============================================================================

const GAUGE_CONFIG = {
  /** Default gauge width in characters */
  width: 30,
  /** Character for filled portion (Unicode) */
  filledChar: '█',
  /** Character for empty portion (Unicode) */
  emptyChar: '░',
  /** ASCII fallbacks */
  filledCharAscii: '#',
  emptyCharAscii: '-',
  /** Score thresholds for coloring */
  thresholds: [
    { min: 75, colorFn: chalk.green },
    { min: 40, colorFn: chalk.yellow },
    { min: 0, colorFn: chalk.red },
  ],
} as const;

const BAR_CONFIG = {
  /** Category bar width */
  width: 40,
  /** Left-align label space */
  labelWidth: 15,
} as const;

const VERDICT_CONFIG = {
  SHIP: { color: chalk.green, emoji: '✅', label: 'SHIP' },
  WARN: { color: chalk.yellow, emoji: '⚠️', label: 'WARN' },
  BLOCK: { color: chalk.red, emoji: '🛑', label: 'BLOCK' },
} as const;

const SEVERITY_CONFIG = {
  critical: { color: chalk.red, icon: '●' },
  high: { color: chalk.red, icon: '●' },
  medium: { color: chalk.yellow, icon: '●' },
  low: { color: chalk.dim, icon: '●' },
} as const;

// ============================================================================
// CORE GAUGE RENDERING
// ============================================================================

/**
 * Get the appropriate characters based on terminal capability
 */
function getGaugeChars(): { filled: string; empty: string } {
  const env = getEnvironment();
  return env.terminal.unicode
    ? { filled: GAUGE_CONFIG.filledChar, empty: GAUGE_CONFIG.emptyChar }
    : { filled: GAUGE_CONFIG.filledCharAscii, empty: GAUGE_CONFIG.emptyCharAscii };
}

/**
 * Get color function based on score threshold
 */
function getColorForScore(score: number): (s: string) => string {
  for (const threshold of GAUGE_CONFIG.thresholds) {
    if (score >= threshold.min) {
      return threshold.colorFn;
    }
  }
  return chalk.red;
}

/**
 * Render a score gauge: [████████████░░░░░░░░] 78%
 * 
 * @param score - Score from 0-100
 * @param width - Gauge width in characters
 * @returns Formatted gauge string with color
 */
export function renderGauge(score: number, width: number = GAUGE_CONFIG.width): string {
  // Clamp score 0-100
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  
  // Get characters and calculate fill
  const chars = getGaugeChars();
  const filledCount = Math.round((clamped / 100) * width);
  const emptyCount = width - filledCount;
  
  // Get color based on score
  const colorFn = getColorForScore(clamped);
  
  // Build gauge
  const filled = colorFn(chars.filled.repeat(filledCount));
  const empty = chalk.gray(chars.empty.repeat(emptyCount));
  
  return `[${filled}${empty}] ${colorFn(clamped + '%')}`;
}

/**
 * Render a mini gauge (10 blocks): ▓▓▓▓▓▓▓▓░░
 * 
 * @param score - Score from 0-100
 * @returns Compact gauge string
 */
export function renderMiniGauge(score: number): string {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const blocks = Math.round(clamped / 10);
  const colorFn = getColorForScore(clamped);
  const chars = getGaugeChars();
  
  return colorFn(chars.filled.repeat(blocks) + chars.empty.repeat(10 - blocks));
}

/**
 * Render a score as a simple bar without brackets
 * 
 * @param score - Score from 0-100
 * @param maxScore - Maximum score (for scaling)
 * @param width - Bar width in characters
 */
export function renderScoreBar(score: number, maxScore: number = 100, width: number = 10): string {
  const ratio = Math.max(0, Math.min(1, score / maxScore));
  const chars = getGaugeChars();
  const filledCount = Math.round(ratio * width);
  const emptyCount = width - filledCount;
  const colorFn = getColorForScore(ratio * 100);
  
  return colorFn(chars.filled.repeat(filledCount)) + chalk.dim(chars.empty.repeat(emptyCount));
}

// ============================================================================
// CATEGORY BAR RENDERING
// ============================================================================

/**
 * Render a category bar with label alignment:
 * Security       ████████████████████░░░░░░░░  85%
 * 
 * @param cat - Category score object
 * @param width - Total width for the bar
 */
export function renderCategoryBar(cat: CategoryScore, width: number = BAR_CONFIG.width): string {
  // Capitalize first letter
  const label = cat.name.charAt(0).toUpperCase() + cat.name.slice(1);
  const paddedLabel = label.padEnd(BAR_CONFIG.labelWidth);
  
  const gaugeWidth = width - BAR_CONFIG.labelWidth - 5;
  const gauge = renderGauge(cat.score, gaugeWidth);
  
  return `${chalk.dim(paddedLabel)} ${gauge}`;
}

/**
 * Render all category bars vertically aligned
 */
export function renderCategoryBreakdown(categories: CategoryScore[], width: number = 45): string[] {
  const lines: string[] = [];
  
  for (const cat of categories) {
    lines.push(`  ${renderCategoryBar(cat, width)}`);
  }
  
  return lines;
}

// ============================================================================
// VERDICT RENDERING
// ============================================================================

/**
 * Get verdict display config
 */
export function getVerdictConfig(verdict: CommandVerdict): { color: typeof chalk.green; emoji: string; label: string } {
  return VERDICT_CONFIG[verdict] || VERDICT_CONFIG.BLOCK;
}

/**
 * Render verdict badge: ✅ SHIP
 */
export function renderVerdict(verdict: CommandVerdict): string {
  const config = getVerdictConfig(verdict);
  const env = getEnvironment();
  const emoji = env.terminal.unicode ? config.emoji + ' ' : '';
  return config.color(`${emoji}${config.label}`);
}

/**
 * Render score with verdict: 85 ✅ SHIP
 */
export function renderScoreWithVerdict(score: number, verdict: CommandVerdict): string {
  const config = getVerdictConfig(verdict);
  const env = getEnvironment();
  const emoji = env.terminal.unicode ? config.emoji : '';
  return `${config.color.bold(score.toString())} ${emoji} ${config.color(verdict)}`;
}

// ============================================================================
// FULL SCORE PANEL RENDERING
// ============================================================================

/**
 * Render a complete score panel with all details
 */
export function renderScorePanel(result: CategoryScoreResult): string {
  const lines: string[] = [];
  const verdictConfig = getVerdictConfig(result.verdict);
  const env = getEnvironment();
  
  // Header with overall score
  lines.push('');
  const emoji = env.terminal.unicode ? result.verdictEmoji + ' ' : '';
  lines.push(`  ${chalk.bold('Vibe Score:')} ${verdictConfig.color.bold(result.overall.toString())} ${emoji}${verdictConfig.color(result.verdict)}`);
  lines.push('');
  
  // Overall gauge
  lines.push(`  ${renderGauge(result.overall, 40)}`);
  lines.push('');
  
  // Category breakdown
  lines.push(`  ${chalk.bold.dim('Category Breakdown')}`);
  lines.push(chalk.dim('  ' + '─'.repeat(50)));
  
  for (const cat of result.categories) {
    lines.push(`  ${renderCategoryBar(cat, 45)}`);
  }
  
  lines.push('');
  
  // Finding summary
  if (result.findings.total > 0) {
    lines.push(`  ${chalk.bold.dim('Findings')}`);
    lines.push(chalk.dim('  ' + '─'.repeat(50)));
    
    const parts: string[] = [];
    if (result.findings.critical > 0) {
      parts.push(chalk.red(`${result.findings.critical} critical`));
    }
    if (result.findings.high > 0) {
      parts.push(chalk.red(`${result.findings.high} high`));
    }
    if (result.findings.medium > 0) {
      parts.push(chalk.yellow(`${result.findings.medium} medium`));
    }
    if (result.findings.low > 0) {
      parts.push(chalk.dim(`${result.findings.low} low`));
    }
    
    lines.push(`  ${parts.join(' · ')}`);
    lines.push('');
  }
  
  return lines.join('\n');
}

/**
 * Render a simple score panel (no category breakdown)
 */
export function renderSimpleScorePanel(scores: CommandScores, verdict: CommandVerdict): string {
  const lines: string[] = [];
  const verdictConfig = getVerdictConfig(verdict);
  const env = getEnvironment();
  
  lines.push('');
  const emoji = env.terminal.unicode ? VERDICT_CONFIG[verdict].emoji + ' ' : '';
  lines.push(`  ${chalk.bold('Score:')} ${verdictConfig.color.bold(scores.overall.toString())}/100 ${emoji}${verdictConfig.color(verdict)}`);
  lines.push('');
  lines.push(`  ${renderGauge(scores.overall, 40)}`);
  
  if (scores.confidence !== undefined) {
    lines.push(`  ${chalk.dim('Confidence:')} ${renderMiniGauge(scores.confidence)} ${scores.confidence}%`);
  }
  
  lines.push('');
  
  return lines.join('\n');
}

// ============================================================================
// SEVERITY RENDERING
// ============================================================================

/**
 * Render severity counts inline: 2 critical · 5 high · 3 medium · 1 low
 */
export function renderSeverityCounts(counts: SeverityCounts): string {
  const parts: string[] = [];
  
  if (counts.critical > 0) {
    parts.push(SEVERITY_CONFIG.critical.color(`${counts.critical} critical`));
  }
  if (counts.high > 0) {
    parts.push(SEVERITY_CONFIG.high.color(`${counts.high} high`));
  }
  if (counts.medium > 0) {
    parts.push(SEVERITY_CONFIG.medium.color(`${counts.medium} medium`));
  }
  if (counts.low > 0) {
    parts.push(SEVERITY_CONFIG.low.color(`${counts.low} low`));
  }
  
  return parts.length > 0 ? parts.join(' · ') : chalk.dim('No issues');
}

/**
 * Render severity icon with color
 */
export function renderSeverityIcon(severity: keyof typeof SEVERITY_CONFIG): string {
  const config = SEVERITY_CONFIG[severity] || SEVERITY_CONFIG.low;
  return config.color(config.icon);
}

// ============================================================================
// PROGRESS RENDERING
// ============================================================================

/**
 * Render progress with label and percentage
 */
export function renderProgress(current: number, total: number, label: string): string {
  const percent = total > 0 ? Math.round((current / total) * 100) : 0;
  const gauge = renderGauge(percent, 20);
  return `${chalk.dim(label)} ${gauge} ${chalk.dim(`(${current}/${total})`)}`;
}

/**
 * Render a spinning progress indicator (frame-based)
 */
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const SPINNER_FRAMES_ASCII = ['|', '/', '-', '\\'];

export function getSpinnerFrame(frameIndex: number): string {
  const env = getEnvironment();
  const frames = env.terminal.unicode ? SPINNER_FRAMES : SPINNER_FRAMES_ASCII;
  return chalk.cyan(frames[frameIndex % frames.length]);
}

// ============================================================================
// TIMING RENDERING
// ============================================================================

/**
 * Render timing: 1.23s or 123ms
 */
export function renderTiming(ms: number): string {
  if (ms < 1000) {
    return chalk.dim(`${Math.round(ms)}ms`);
  }
  return chalk.dim(`${(ms / 1000).toFixed(2)}s`);
}

/**
 * Render timing with label
 */
export function renderTimingWithLabel(ms: number, label: string): string {
  return `${chalk.dim(label)} ${renderTiming(ms)}`;
}

// ============================================================================
// BOX RENDERING
// ============================================================================

/**
 * Get box drawing characters based on terminal capability
 */
function getBoxChars(): { tl: string; tr: string; bl: string; br: string; h: string; v: string } {
  const env = getEnvironment();
  return env.terminal.unicode
    ? { tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│' }
    : { tl: '+', tr: '+', bl: '+', br: '+', h: '-', v: '|' };
}

/**
 * Strip ANSI codes for length calculation
 */
function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
}

/**
 * Render content in a box
 */
export function renderBox(
  content: string[],
  options: {
    title?: string;
    width?: number;
    borderColor?: (s: string) => string;
  } = {}
): string {
  const chars = getBoxChars();
  const borderColor = options.borderColor ?? chalk.dim;
  const width = options.width ?? Math.min(60, getSafeTerminalWidth(80));
  
  // Calculate content width
  const contentWidth = width - 4; // 2 for borders, 2 for padding
  
  const lines: string[] = [];
  
  // Top border with optional title
  if (options.title) {
    const titleStr = ` ${options.title} `;
    const remainingWidth = width - 2 - titleStr.length;
    const leftPad = Math.floor(remainingWidth / 2);
    const rightPad = remainingWidth - leftPad;
    lines.push(borderColor(
      chars.tl + chars.h.repeat(leftPad) + titleStr + chars.h.repeat(rightPad) + chars.tr
    ));
  } else {
    lines.push(borderColor(chars.tl + chars.h.repeat(width - 2) + chars.tr));
  }
  
  // Content lines
  for (const line of content) {
    const visibleLength = stripAnsi(line).length;
    const padding = Math.max(0, contentWidth - visibleLength);
    lines.push(borderColor(chars.v) + ' ' + line + ' '.repeat(padding) + ' ' + borderColor(chars.v));
  }
  
  // Bottom border
  lines.push(borderColor(chars.bl + chars.h.repeat(width - 2) + chars.br));
  
  return lines.join('\n');
}

// ============================================================================
// DIVIDER RENDERING
// ============================================================================

/**
 * Render a horizontal divider
 */
export function renderDivider(width?: number): string {
  const w = width ?? getSafeTerminalWidth(80);
  const env = getEnvironment();
  const char = env.terminal.unicode ? '─' : '-';
  return chalk.dim(char.repeat(w));
}

/**
 * Render a section header with divider
 */
export function renderSectionHeader(title: string, width?: number): string {
  const w = width ?? Math.max(title.length + 4, 50);
  const env = getEnvironment();
  const char = env.terminal.unicode ? '─' : '-';
  return `${chalk.bold.dim(title)}\n${chalk.dim(char.repeat(w))}`;
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  GAUGE_CONFIG,
  BAR_CONFIG,
  VERDICT_CONFIG,
  SEVERITY_CONFIG,
};
