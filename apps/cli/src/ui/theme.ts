/**
 * Theme system with color semantics, symbols, and styling utilities
 * Features: caching, accessibility, graceful degradation
 */

import chalk, { type ChalkInstance } from 'chalk';
import gradient from 'gradient-string';
import figlet from 'figlet';
import { getEnvironment, getSymbols, shouldUseColors, getSafeTerminalWidth } from '../lib/environment.js';

// Cache for performance
let symbolsCache: ReturnType<typeof getSymbols> | null = null;
let colorsCache: ReturnType<typeof createColors> | null = null;

/**
 * Get cached symbols
 */
function getCachedSymbols() {
  if (!symbolsCache) {
    symbolsCache = getSymbols();
  }
  return symbolsCache;
}

/**
 * Create color functions with fallbacks
 */
function createColors() {
  const useColors = shouldUseColors();

  // Create no-op function for when colors are disabled
  const noOp = (s: string) => s;

  if (!useColors) {
    return {
      primary: noOp,
      secondary: noOp,
      success: noOp,
      error: noOp,
      warning: noOp,
      info: noOp,
      muted: noOp,
      highlight: noOp,
      code: noOp,
      path: noOp,
      number: noOp,
      boolean: noOp,
      string: noOp,
      keyword: noOp,
    };
  }

  return {
    primary: chalk.cyan,
    secondary: chalk.blue,
    success: chalk.green,
    error: chalk.red,
    warning: chalk.yellow,
    info: chalk.cyan,
    muted: chalk.dim,
    highlight: chalk.bold.white,
    code: chalk.cyan,
    path: chalk.underline,
    number: chalk.yellow,
    boolean: chalk.magenta,
    string: chalk.green,
    keyword: chalk.blue,
  };
}

/**
 * Get cached colors
 */
function getCachedColors() {
  if (!colorsCache) {
    colorsCache = createColors();
  }
  return colorsCache;
}

/**
 * Refresh caches (call after environment changes)
 */
export function refreshTheme(): void {
  symbolsCache = null;
  colorsCache = null;
}

/**
 * Semantic symbols for consistent CLI output
 */
export const symbols = {
  get success() {
    return getCachedColors().success(getCachedSymbols().tick);
  },
  get error() {
    return getCachedColors().error(getCachedSymbols().cross);
  },
  get warning() {
    return getCachedColors().warning(getCachedSymbols().warning);
  },
  get info() {
    return getCachedColors().info(getCachedSymbols().info);
  },
  get arrow() {
    return getCachedColors().info(getCachedSymbols().arrow);
  },
  get bullet() {
    return getCachedColors().muted(getCachedSymbols().bullet);
  },
  get pointer() {
    return getCachedColors().info(getCachedSymbols().pointerSmall);
  },
  get ellipsis() {
    return getCachedSymbols().ellipsis;
  },
  // Aliases for convenience
  get check() {
    return getCachedColors().success(getCachedSymbols().tick);
  },
  get cross() {
    return getCachedColors().error(getCachedSymbols().cross);
  },
  get tick() {
    return getCachedColors().success(getCachedSymbols().tick);
  },
  // Raw symbols without colors
  get raw() {
    return getCachedSymbols();
  },
};

/**
 * Semantic colors for consistent styling
 */
export const colors = getCachedColors();

/**
 * VibeCheck brand gradient colors
 */
const BRAND_COLORS = ['#00d4ff', '#7b2dff', '#ff00aa'];

/**
 * VibeCheck brand gradient
 */
export const brandGradient = gradient(BRAND_COLORS);

/**
 * Alternative gradients for variety
 */
export const gradients = {
  brand: gradient(BRAND_COLORS),
  success: gradient(['#00ff87', '#60efff']),
  error: gradient(['#ff416c', '#ff4b2b']),
  warning: gradient(['#f7971e', '#ffd200']),
  info: gradient(['#667eea', '#764ba2']),
  cool: gradient(['#00c6ff', '#0072ff']),
  warm: gradient(['#ff9a9e', '#fecfef']),
};

/**
 * Print the VibeCheck ASCII banner
 */
export function printBanner(options?: {
  compact?: boolean;
  tagline?: boolean;
}): void {
  const env = getEnvironment();
  const showTagline = options?.tagline ?? true;
  const compact = options?.compact ?? false;

  // Non-interactive or very narrow terminal: simple banner
  if (!env.isInteractive || env.terminal.width < 60) {
    console.log('');
    console.log('VibeCheck');
    if (showTagline) {
      console.log(chalk.dim('Hallucination prevention for AI-assisted development'));
    }
    console.log('');
    return;
  }

  try {
    const font = compact ? 'Small' : 'Standard';
    const banner = figlet.textSync('VibeCheck', {
      font,
      horizontalLayout: 'default',
    });

    console.log('');

    if (shouldUseColors()) {
      console.log(brandGradient.multiline(banner));
    } else {
      console.log(banner);
    }

    if (showTagline) {
      console.log(chalk.dim('  Hallucination prevention for AI-assisted development'));
    }
    console.log('');
  } catch {
    // Fallback if figlet fails
    console.log('');
    if (shouldUseColors()) {
      console.log(brandGradient('VibeCheck'));
    } else {
      console.log('VibeCheck');
    }
    if (showTagline) {
      console.log(chalk.dim('Hallucination prevention for AI-assisted development'));
    }
    console.log('');
  }
}

/**
 * Format a file path for display
 */
export function formatPath(filePath: string): string {
  return getCachedColors().path(filePath);
}

/**
 * Format a code snippet for display
 */
export function formatCode(code: string): string {
  return getCachedColors().code(`\`${code}\``);
}

/**
 * Format inline code (without backticks)
 */
export function formatInlineCode(code: string): string {
  return getCachedColors().code(code);
}

/**
 * Format a key-value pair
 */
export function formatKeyValue(key: string, value: string | number | boolean): string {
  const c = getCachedColors();
  let formattedValue: string;

  if (typeof value === 'boolean') {
    formattedValue = c.boolean(String(value));
  } else if (typeof value === 'number') {
    formattedValue = c.number(String(value));
  } else {
    formattedValue = value;
  }

  return `${c.muted(key + ':')} ${formattedValue}`;
}

/**
 * Format a list item
 */
export function formatListItem(item: string, indent = 0): string {
  const spaces = '  '.repeat(indent);
  return `${spaces}${symbols.bullet} ${item}`;
}

/**
 * Format a success message
 */
export function formatSuccess(message: string): string {
  return `${symbols.success} ${message}`;
}

/**
 * Format an error message
 */
export function formatError(message: string): string {
  return `${symbols.error} ${message}`;
}

/**
 * Format a warning message
 */
export function formatWarning(message: string): string {
  return `${symbols.warning} ${message}`;
}

/**
 * Format an info message
 */
export function formatInfo(message: string): string {
  return `${symbols.info} ${message}`;
}

/**
 * Format a step in a process
 */
export function formatStep(step: number, total: number, message: string): string {
  const c = getCachedColors();
  const progress = c.muted(`[${step}/${total}]`);
  return `${progress} ${message}`;
}

/**
 * Format a duration in human-readable format
 */
export function formatDuration(ms: number): string {
  if (ms < 0) return '0ms';

  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }

  if (ms < 60000) {
    const seconds = ms / 1000;
    return `${seconds.toFixed(1)}s`;
  }

  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

/**
 * Format a count with proper pluralization
 */
export function formatCount(count: number, singular: string, plural?: string): string {
  const p = plural ?? `${singular}s`;
  return `${count} ${count === 1 ? singular : p}`;
}

/**
 * Format bytes in human-readable format
 */
export function formatBytes(bytes: number): string {
  if (bytes < 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }

  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

/**
 * Format a percentage
 */
export function formatPercent(value: number, decimals = 0): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

/**
 * Create a horizontal divider
 */
export function divider(width?: number): string {
  const w = width ?? getSafeTerminalWidth(80);
  const raw = getCachedSymbols();
  return getCachedColors().muted(raw.line.repeat(w));
}

/**
 * Create section header
 */
export function sectionHeader(title: string): string {
  const c = getCachedColors();
  return `\n${c.highlight(title)}\n${divider(title.length)}`;
}

/**
 * Create a box around text
 */
export function box(content: string, options?: {
  title?: string;
  padding?: number;
  borderColor?: keyof ReturnType<typeof getCachedColors>;
}): string {
  const env = getEnvironment();
  const c = getCachedColors();
  const padding = options?.padding ?? 1;
  const borderColorFn = options?.borderColor ? c[options.borderColor] : c.muted;

  // Non-unicode fallback
  const useUnicode = env.terminal.unicode;
  const corners = useUnicode
    ? { tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│' }
    : { tl: '+', tr: '+', bl: '+', br: '+', h: '-', v: '|' };

  const lines = content.split('\n');
  const maxWidth = Math.max(
    ...lines.map((l) => l.length),
    (options?.title?.length ?? 0) + 4
  );
  const boxWidth = maxWidth + padding * 2;

  const result: string[] = [];

  // Top border
  const titleStr = options?.title ? ` ${options.title} ` : '';
  const topPadding = corners.h.repeat(boxWidth - titleStr.length);
  result.push(borderColorFn(`${corners.tl}${titleStr}${topPadding}${corners.tr}`));

  // Padding lines
  for (let i = 0; i < padding; i++) {
    result.push(borderColorFn(corners.v) + ' '.repeat(boxWidth) + borderColorFn(corners.v));
  }

  // Content lines
  for (const line of lines) {
    const paddedLine = line + ' '.repeat(maxWidth - line.length);
    const leftPad = ' '.repeat(padding);
    const rightPad = ' '.repeat(padding);
    result.push(
      borderColorFn(corners.v) + leftPad + paddedLine + rightPad + borderColorFn(corners.v)
    );
  }

  // Padding lines
  for (let i = 0; i < padding; i++) {
    result.push(borderColorFn(corners.v) + ' '.repeat(boxWidth) + borderColorFn(corners.v));
  }

  // Bottom border
  result.push(borderColorFn(`${corners.bl}${corners.h.repeat(boxWidth)}${corners.br}`));

  return result.join('\n');
}

/**
 * Create a progress bar
 */
export function progressBar(
  current: number,
  total: number,
  options?: {
    width?: number;
    showPercent?: boolean;
    showCount?: boolean;
    filled?: string;
    empty?: string;
  }
): string {
  const env = getEnvironment();
  const c = getCachedColors();

  const width = options?.width ?? 30;
  const showPercent = options?.showPercent ?? true;
  const showCount = options?.showCount ?? false;

  const filled = options?.filled ?? (env.terminal.unicode ? '█' : '#');
  const empty = options?.empty ?? (env.terminal.unicode ? '░' : '-');

  const ratio = Math.max(0, Math.min(1, current / total));
  const filledWidth = Math.round(ratio * width);
  const emptyWidth = width - filledWidth;

  const bar = c.success(filled.repeat(filledWidth)) + c.muted(empty.repeat(emptyWidth));

  const parts = [bar];

  if (showPercent) {
    parts.push(c.muted(formatPercent(ratio)));
  }

  if (showCount) {
    parts.push(c.muted(`(${current}/${total})`));
  }

  return parts.join(' ');
}

/**
 * Truncate text with ellipsis if too long
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const raw = getCachedSymbols();
  return text.slice(0, maxLength - raw.ellipsis.length) + raw.ellipsis;
}

/**
 * Indent text by a number of spaces
 */
export function indent(text: string, spaces = 2): string {
  const prefix = ' '.repeat(spaces);
  return text
    .split('\n')
    .map((line) => prefix + line)
    .join('\n');
}

/**
 * Strip ANSI codes from a string
 */
export function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
}

/**
 * Get visible length of a string (excluding ANSI codes)
 */
export function visibleLength(text: string): number {
  return stripAnsi(text).length;
}

/**
 * Pad string to length, accounting for ANSI codes
 */
export function padEnd(text: string, length: number): string {
  const visible = visibleLength(text);
  if (visible >= length) return text;
  return text + ' '.repeat(length - visible);
}

/**
 * Center text within a width
 */
export function center(text: string, width: number): string {
  const visible = visibleLength(text);
  if (visible >= width) return text;
  const padding = Math.floor((width - visible) / 2);
  return ' '.repeat(padding) + text;
}

/**
 * Create a tree structure display
 */
export function tree(
  items: Array<{ name: string; children?: Array<{ name: string }> }>
): string {
  const raw = getCachedSymbols();
  const c = getCachedColors();
  const lines: string[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const isLast = i === items.length - 1;
    const prefix = isLast ? raw.corner : raw.tee;

    lines.push(`${c.muted(prefix)} ${item.name}`);

    if (item.children) {
      for (let j = 0; j < item.children.length; j++) {
        const child = item.children[j];
        const childIsLast = j === item.children.length - 1;
        const childPrefix = childIsLast ? raw.corner : raw.tee;
        const connector = isLast ? ' ' : c.muted('│');

        lines.push(`${connector}   ${c.muted(childPrefix)} ${child.name}`);
      }
    }
  }

  return lines.join('\n');
}
