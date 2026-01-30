/**
 * Text Formatters for MCP Tool Responses
 *
 * Creates visually appealing ASCII/Unicode formatted output
 * that works in any MCP client (Cursor, Claude Desktop, etc.)
 *
 * @module text-formatters
 */

// ============================================
// BOX DRAWING CHARACTERS
// ============================================

export const BOX = {
  // Rounded corners (modern look)
  topLeft: '╭',
  topRight: '╮',
  bottomLeft: '╰',
  bottomRight: '╯',
  horizontal: '─',
  vertical: '│',
  leftT: '├',
  rightT: '┤',
  topT: '┬',
  bottomT: '┴',
  cross: '┼',

  // Double line (for emphasis)
  dblHorizontal: '═',
  dblVertical: '║',
  dblTopLeft: '╔',
  dblTopRight: '╗',
  dblBottomLeft: '╚',
  dblBottomRight: '╝',

  // Tree characters
  treeBranch: '├─',
  treeEnd: '└─',
  treeVertical: '│ ',
} as const;

// ============================================
// STATUS ICONS
// ============================================

export const ICONS = {
  // Status
  success: '✅',
  error: '❌',
  warning: '⚠️',
  info: 'ℹ️',
  pending: '⏳',
  blocked: '🛑',
  allowed: '✓',
  
  // Actions
  check: '✓',
  cross: '✗',
  arrow: '→',
  arrowRight: '▸',
  bullet: '•',
  
  // Categories
  fire: '🔥',
  shield: '🛡️',
  lock: '🔒',
  unlock: '🔓',
  key: '🔑',
  file: '📄',
  folder: '📁',
  package: '📦',
  route: '🔗',
  database: '🗄️',
  clock: '⏱️',
  chart: '📊',
  truthpack: '📋',
  gear: '⚙️',
  sparkle: '✨',
  
  // HTTP Methods
  get: '🟢',
  post: '🔵',
  put: '🟡',
  patch: '🟣',
  delete: '🔴',
} as const;

// ============================================
// FORMATTING UTILITIES
// ============================================

/**
 * Create a horizontal line
 */
export function line(width: number, char = BOX.horizontal): string {
  return char.repeat(width);
}

/**
 * Center text within a given width
 */
export function center(text: string, width: number): string {
  const padding = Math.max(0, width - text.length);
  const leftPad = Math.floor(padding / 2);
  const rightPad = padding - leftPad;
  return ' '.repeat(leftPad) + text + ' '.repeat(rightPad);
}

/**
 * Pad text to the right
 */
export function padRight(text: string, width: number): string {
  return text + ' '.repeat(Math.max(0, width - text.length));
}

/**
 * Pad text to the left
 */
export function padLeft(text: string, width: number): string {
  return ' '.repeat(Math.max(0, width - text.length)) + text;
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1) + '…';
}

// ============================================
// BOX BUILDERS
// ============================================

/**
 * Create a simple box around content
 */
export function box(title: string, content: string[], width = 45): string {
  const innerWidth = width - 2;
  const lines: string[] = [];

  // Top border with title
  const titleText = ` ${title} `;
  const titlePadding = innerWidth - titleText.length;
  const leftPad = Math.floor(titlePadding / 2);
  const rightPad = titlePadding - leftPad;

  lines.push(
    BOX.topLeft +
      line(leftPad) +
      titleText +
      line(rightPad) +
      BOX.topRight
  );

  // Content
  for (const row of content) {
    lines.push(BOX.vertical + ' ' + padRight(row, innerWidth - 1) + BOX.vertical);
  }

  // Bottom border
  lines.push(BOX.bottomLeft + line(innerWidth) + BOX.bottomRight);

  return lines.join('\n');
}

/**
 * Create a header box (highlighted)
 */
export function headerBox(
  icon: string,
  title: string,
  subtitle?: string,
  width = 45
): string {
  const innerWidth = width - 2;
  const lines: string[] = [];

  lines.push(BOX.topLeft + line(innerWidth) + BOX.topRight);
  lines.push(BOX.vertical + ' ' + padRight(`${icon} ${title}`, innerWidth - 1) + BOX.vertical);
  
  if (subtitle) {
    lines.push(BOX.vertical + ' ' + padRight(subtitle, innerWidth - 1) + BOX.vertical);
  }
  
  lines.push(BOX.bottomLeft + line(innerWidth) + BOX.bottomRight);

  return lines.join('\n');
}

/**
 * Create a status line
 */
export function statusLine(label: string, value: string, icon?: string): string {
  const prefix = icon ? `${icon} ` : '';
  return `${prefix}${label}: ${value}`;
}

// ============================================
// TABLE BUILDER
// ============================================

interface TableColumn {
  header: string;
  key: string;
  width?: number;
  align?: 'left' | 'right' | 'center';
}

/**
 * Create a formatted table
 */
export function table(
  columns: TableColumn[],
  data: Array<Record<string, unknown>>,
  maxRows = 10
): string {
  // Calculate column widths
  const colWidths = columns.map((col) => {
    const headerLen = col.header.length;
    const maxDataLen = data.slice(0, maxRows).reduce((max, row) => {
      const val = String(row[col.key] ?? '');
      return Math.max(max, val.length);
    }, 0);
    return col.width ?? Math.min(30, Math.max(headerLen, maxDataLen) + 2);
  });

  const totalWidth = colWidths.reduce((sum, w) => sum + w, 0) + columns.length + 1;
  const lines: string[] = [];

  // Header separator
  lines.push(BOX.topLeft + colWidths.map((w) => line(w)).join(BOX.topT) + BOX.topRight);

  // Header row
  const headerRow = columns
    .map((col, i) => center(col.header, colWidths[i] ?? 10))
    .join(BOX.vertical);
  lines.push(BOX.vertical + headerRow + BOX.vertical);

  // Header/body separator
  lines.push(BOX.leftT + colWidths.map((w) => line(w)).join(BOX.cross) + BOX.rightT);

  // Data rows
  const displayData = data.slice(0, maxRows);
  for (const row of displayData) {
    const dataRow = columns
      .map((col, i) => {
        const width = colWidths[i] ?? 10;
        const val = truncate(String(row[col.key] ?? ''), width - 2);
        if (col.align === 'right') return padLeft(val, width);
        if (col.align === 'center') return center(val, width);
        return ' ' + padRight(val, width - 1);
      })
      .join(BOX.vertical);
    lines.push(BOX.vertical + dataRow + BOX.vertical);
  }

  // Bottom border
  lines.push(BOX.bottomLeft + colWidths.map((w) => line(w)).join(BOX.bottomT) + BOX.bottomRight);

  // Show truncation notice
  if (data.length > maxRows) {
    lines.push(`  ... and ${data.length - maxRows} more rows`);
  }

  return lines.join('\n');
}

// ============================================
// TREE BUILDER
// ============================================

interface TreeNode {
  label: string;
  icon?: string;
  children?: TreeNode[];
}

/**
 * Create a tree view
 */
export function tree(nodes: TreeNode[], prefix = ''): string {
  const lines: string[] = [];

  nodes.forEach((node, index) => {
    const isLast = index === nodes.length - 1;
    const connector = isLast ? BOX.treeEnd : BOX.treeBranch;
    const icon = node.icon ? `${node.icon} ` : '';
    
    lines.push(`${prefix}${connector} ${icon}${node.label}`);

    if (node.children && node.children.length > 0) {
      const childPrefix = prefix + (isLast ? '   ' : BOX.treeVertical + ' ');
      lines.push(tree(node.children, childPrefix));
    }
  });

  return lines.join('\n');
}

// ============================================
// PROGRESS & STATS
// ============================================

/**
 * Create a progress bar
 */
export function progressBar(
  value: number,
  max: number,
  width = 20,
  filled = '█',
  empty = '░'
): string {
  const percentage = Math.min(1, Math.max(0, value / max));
  const filledCount = Math.round(percentage * width);
  const emptyCount = width - filledCount;
  const percentText = `${Math.round(percentage * 100)}%`;
  
  return `[${filled.repeat(filledCount)}${empty.repeat(emptyCount)}] ${percentText}`;
}

/**
 * Create stats grid
 */
export function statsGrid(
  stats: Array<{ label: string; value: string | number; icon?: string }>
): string {
  return stats
    .map((s) => {
      const icon = s.icon ? `${s.icon} ` : '';
      return `${icon}${s.value} ${s.label}`;
    })
    .join('  │  ');
}

// ============================================
// VERDICT FORMATTERS
// ============================================

type VerdictStatus = 'allowed' | 'blocked' | 'warning';

/**
 * Format a firewall verdict
 */
export function formatVerdict(
  status: VerdictStatus,
  file: string,
  details?: string[]
): string {
  const statusConfig: Record<VerdictStatus, { icon: string; label: string; border: string }> = {
    allowed: { icon: ICONS.success, label: 'ALLOWED', border: '─' },
    blocked: { icon: ICONS.blocked, label: 'BLOCKED', border: '━' },
    warning: { icon: ICONS.warning, label: 'WARNING', border: '╌' },
  };

  const config = statusConfig[status];
  const lines: string[] = [];
  const width = 45;

  // Header
  lines.push(config.border.repeat(width));
  lines.push(`${config.icon}  ${config.label}`);
  lines.push(`   File: ${truncate(file, width - 10)}`);
  lines.push(config.border.repeat(width));

  // Details
  if (details && details.length > 0) {
    lines.push('');
    for (const detail of details) {
      lines.push(`  ${ICONS.arrowRight} ${detail}`);
    }
  }

  return lines.join('\n');
}

// ============================================
// SECTION FORMATTERS
// ============================================

/**
 * Format a section with header
 */
export function section(title: string, content: string, icon?: string): string {
  const header = icon ? `${icon} ${title}` : title;
  return `\n${header}\n${'─'.repeat(header.length)}\n${content}`;
}

/**
 * Format key-value pairs
 */
export function keyValue(pairs: Array<[string, string | number | boolean]>): string {
  const maxKeyLen = Math.max(...pairs.map(([k]) => k.length));
  return pairs
    .map(([key, value]) => `  ${padRight(key + ':', maxKeyLen + 1)} ${value}`)
    .join('\n');
}

/**
 * Format a list with bullets
 */
export function bulletList(items: string[], bullet: string = ICONS.bullet): string {
  return items.map((item) => `  ${bullet} ${item}`).join('\n');
}

/**
 * Format a numbered list
 */
export function numberedList(items: string[]): string {
  return items.map((item, i) => `  ${i + 1}. ${item}`).join('\n');
}

// ============================================
// HTTP METHOD BADGE
// ============================================

/**
 * Format HTTP method with icon
 */
export function httpMethod(method: string): string {
  const icons: Record<string, string> = {
    GET: ICONS.get,
    POST: ICONS.post,
    PUT: ICONS.put,
    PATCH: ICONS.patch,
    DELETE: ICONS.delete,
  };
  return `${icons[method.toUpperCase()] ?? '⚪'} ${method.toUpperCase()}`;
}

// ============================================
// TIMESTAMP FORMATTER
// ============================================

/**
 * Format timestamp
 */
export function timestamp(date?: Date | string): string {
  const d = date ? new Date(date) : new Date();
  return `${ICONS.clock} ${d.toLocaleString()}`;
}

/**
 * Format duration in ms
 */
export function duration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}
