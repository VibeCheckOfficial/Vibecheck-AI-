/**
 * Universal Command Header
 * 
 * Beautiful ASCII header for all CLI commands with consistent styling
 */

import chalk from 'chalk';
import { getSymbols, getEnvironment } from '../lib/environment.js';
import { CLI_VERSION } from '../lib/version.js';

export interface CommandHeaderOptions {
  /** Command name (e.g., "scan", "validate", "ship", "no ship") */
  command: string;
  /** Version string */
  version?: string;
  /** Target path being processed */
  target?: string;
  /** Session identifier */
  sessionId?: string;
  /** Elapsed time in ms */
  elapsedTime?: number;
  /** System status/vitals to display */
  vitals?: Array<{
    label: string;
    status: 'optimal' | 'stable' | 'warning' | 'critical';
    value: string | number;
    percentage?: number;
  }>;
  /** Diagnostic log entries */
  diagnostics?: Array<{
    level: 'pass' | 'fail' | 'warn' | 'info';
    message: string;
    details?: string;
  }>;
  /** Security audit results */
  securityAudit?: Array<{
    check: string;
    status: 'pass' | 'fail' | 'warn';
  }>;
  /** Action required section */
  actionRequired?: {
    title: string;
    message: string;
    suggestions: Array<{ command: string; description: string }>;
  };
  /** Compact mode (less detail) */
  compact?: boolean;
}

/**
 * Main VIBECHECK ASCII banner (consistent across all commands)
 */
const VIBECHECK_BANNER = [
  '██╗   ██╗██╗██████╗ ███████╗ ██████╗██╗  ██╗███████╗ ██████╗██╗  ██╗',
  '██║   ██║██║██╔══██╗██╔════╝██╔════╝██║  ██║██╔════╝██╔════╝██║ ██╔╝',
  '██║   ██║██║██████╔╝█████╗  ██║     ███████║█████╗  ██║     █████╔╝ ',
  '╚██╗ ██╔╝██║██╔══██╗██╔══╝  ██║     ██╔══██║██╔══╝  ██║     ██╔═██╗ ',
  ' ╚████╔╝ ██║██████╔╝███████╗╚██████╗██║  ██║███████╗╚██████╗██║  ██╗',
  '  ╚═══╝  ╚═╝╚═════╝ ╚══════╝ ╚═════╝╚═╝  ╚═╝╚══════╝ ╚═════╝╚═╝  ╚═╝',
];

/**
 * Command-specific ASCII patterns
 * All patterns are designed to be approximately 50-60 chars wide for centering
 */
const COMMAND_ASCII: Record<string, string[]> = {
  SCAN: [
    '███████╗ ██████╗ █████╗ ███╗   ██╗',
    '██╔════╝██╔════╝██╔══██╗████╗  ██║',
    '███████╗██║     ███████║██╔██╗ ██║',
    '╚════██║██║     ██╔══██║██║╚██╗██║',
    '███████║╚██████╗██║  ██║██║ ╚████║',
    '╚══════╝ ╚═════╝╚═╝  ╚═╝╚═╝  ╚═══╝',
  ],
  VALIDATE: [
    '██╗   ██╗ █████╗ ██╗     ██╗██████╗  █████╗ ████████╗███████╗',
    '██║   ██║██╔══██╗██║     ██║██╔══██╗██╔══██╗╚══██╔══╝██╔════╝',
    '██║   ██║███████║██║     ██║██║  ██║███████║   ██║   █████╗  ',
    '╚██╗ ██╔╝██╔══██║██║     ██║██║  ██║██╔══██║   ██║   ██╔══╝  ',
    ' ╚████╔╝ ██║  ██║███████╗██║██████╔╝██║  ██║   ██║   ███████╗',
    '  ╚═══╝  ╚═╝  ╚═╝╚══════╝╚═╝╚═════╝ ╚═╝  ╚═╝   ╚═╝   ╚══════╝',
  ],
  CHECK: [
    ' ██████╗██╗  ██╗███████╗ ██████╗██╗  ██╗',
    '██╔════╝██║  ██║██╔════╝██╔════╝██║ ██╔╝',
    '██║     ███████║█████╗  ██║     █████╔╝ ',
    '██║     ██╔══██║██╔══╝  ██║     ██╔═██╗ ',
    '╚██████╗██║  ██║███████╗╚██████╗██║  ██╗',
    ' ╚═════╝╚═╝  ╚═╝╚══════╝ ╚═════╝╚═╝  ╚═╝',
  ],
  DOCTOR: [
    '██████╗  ██████╗  ██████╗████████╗ ██████╗ ██████╗ ',
    '██╔══██╗██╔═══██╗██╔════╝╚══██╔══╝██╔═══██╗██╔══██╗',
    '██║  ██║██║   ██║██║        ██║   ██║   ██║██████╔╝',
    '██║  ██║██║   ██║██║        ██║   ██║   ██║██╔══██╗',
    '██████╔╝╚██████╔╝╚██████╗   ██║   ╚██████╔╝██║  ██║',
    '╚═════╝  ╚═════╝  ╚═════╝   ╚═╝    ╚═════╝ ╚═╝  ╚═╝',
  ],
  INIT: [
    '██╗███╗   ██╗██╗████████╗',
    '██║████╗  ██║██║╚══██╔══╝',
    '██║██╔██╗ ██║██║   ██║   ',
    '██║██║╚██╗██║██║   ██║   ',
    '██║██║ ╚████║██║   ██║   ',
    '╚═╝╚═╝  ╚═══╝╚═╝   ╚═╝   ',
  ],
  WATCH: [
    '██╗    ██╗ █████╗ ████████╗ ██████╗██╗  ██╗',
    '██║    ██║██╔══██╗╚══██╔══╝██╔════╝██║  ██║',
    '██║ █╗ ██║███████║   ██║   ██║     ███████║',
    '██║███╗██║██╔══██║   ██║   ██║     ██╔══██║',
    '╚███╔███╔╝██║  ██║   ██║   ╚██████╗██║  ██║',
    ' ╚══╝╚══╝ ╚═╝  ╚═╝   ╚═╝    ╚═════╝╚═╝  ╚═╝',
  ],
  SHIP: [
    '███████╗██╗  ██╗██╗██████╗ ',
    '██╔════╝██║  ██║██║██╔══██╗',
    '███████╗███████║██║██████╔╝',
    '╚════██║██╔══██║██║██╔═══╝ ',
    '███████║██║  ██║██║██║     ',
    '╚══════╝╚═╝  ╚═╝╚═╝╚═╝     ',
  ],
  'NO SHIP': [
    '███╗   ██╗ ██████╗     ███████╗██╗  ██╗██╗██████╗ ',
    '████╗  ██║██╔═══██╗    ██╔════╝██║  ██║██║██╔══██╗',
    '██╔██╗ ██║██║   ██║    ███████╗███████║██║██████╔╝',
    '██║╚██╗██║██║   ██║    ╚════██║██╔══██║██║██╔═══╝ ',
    '██║ ╚████║╚██████╔╝    ███████║██║  ██║██║██║     ',
    '╚═╝  ╚═══╝ ╚═════╝     ╚══════╝╚═╝  ╚═╝╚═╝╚═╝     ',
  ],
  FIX: [
    '███████╗██╗██╗  ██╗',
    '██╔════╝██║╚██╗██╔╝',
    '█████╗  ██║ ╚███╔╝ ',
    '██╔══╝  ██║ ██╔██╗ ',
    '██║     ██║██╔╝ ██╗',
    '╚═╝     ╚═╝╚═╝  ╚═╝',
  ],
  AUDIT: [
    ' █████╗ ██╗   ██╗██████╗ ██╗████████╗',
    '██╔══██╗██║   ██║██╔══██╗██║╚══██╔══╝',
    '███████║██║   ██║██║  ██║██║   ██║   ',
    '██╔══██║██║   ██║██║  ██║██║   ██║   ',
    '██║  ██║╚██████╔╝██████╔╝██║   ██║   ',
    '╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚═╝   ╚═╝   ',
  ],
};

/**
 * Box width constant
 */
const BOX_WIDTH = 78;

/**
 * Generate progress bar
 */
function generateProgressBar(
  percentage: number,
  width: number = 25,
  status: 'optimal' | 'stable' | 'warning' | 'critical' = 'stable'
): string {
  const filled = Math.round((percentage / 100) * width);
  const empty = width - filled;

  const blocks: Record<string, string> = {
    optimal: '█',
    stable: '█',
    warning: '▓',
    critical: '░',
  };

  const block = blocks[status];
  const emptyBlock = '░';

  return `[${block.repeat(filled)}${emptyBlock.repeat(empty)}]`;
}

/**
 * Format status with color and symbol
 */
function formatStatus(
  status: 'optimal' | 'stable' | 'warning' | 'critical' | 'pass' | 'fail' | 'warn' | 'info'
): string {
  const colors: Record<string, typeof chalk.green> = {
    optimal: chalk.green,
    stable: chalk.cyan,
    warning: chalk.yellow,
    critical: chalk.red,
    pass: chalk.green,
    fail: chalk.red,
    warn: chalk.yellow,
    info: chalk.blue,
  };

  const labels: Record<string, string> = {
    optimal: '[OPTIMAL]',
    stable: '[STABLE]',
    warning: '[WARNING]',
    critical: '[CRITICAL]',
    pass: '✓',
    fail: '✖',
    warn: '⚠',
    info: 'ℹ',
  };

  const colorFn = colors[status] || chalk.white;
  return colorFn(labels[status] || `[${status.toUpperCase()}]`);
}

/**
 * Format elapsed time
 */
function formatElapsedTime(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Truncate path for display
 */
function truncatePath(filePath: string, maxLength: number = 35): string {
  if (filePath.length <= maxLength) return filePath;
  const parts = filePath.split(/[/\\]/);
  if (parts.length <= 2) return filePath.slice(0, maxLength - 3) + '...';
  
  const start = parts[0];
  const end = parts[parts.length - 1];
  return `${start}/.../${end}`.slice(0, maxLength);
}

/**
 * Center text within a given width
 */
function centerText(text: string, width: number): string {
  const visibleLength = text.replace(/\x1b\[[0-9;]*m/g, '').length;
  const paddingLeft = Math.floor((width - visibleLength) / 2);
  const paddingRight = width - visibleLength - paddingLeft;
  return ' '.repeat(Math.max(0, paddingLeft)) + text + ' '.repeat(Math.max(0, paddingRight));
}

/**
 * Pad text to exact width
 */
function padText(text: string, width: number): string {
  const visibleLength = text.replace(/\x1b\[[0-9;]*m/g, '').length;
  return text + ' '.repeat(Math.max(0, width - visibleLength));
}

/**
 * Get command ASCII art
 */
function getCommandAscii(command: string): string[] {
  const key = command.toUpperCase();
  return COMMAND_ASCII[key] || [`[ ${key} ]`];
}

/**
 * Render the universal command header
 */
export function renderCommandHeader(options: CommandHeaderOptions): void {
  const { command, version = CLI_VERSION, target, sessionId, elapsedTime = 0 } = options;
  
  // Generate session ID if not provided
  const session = sessionId || `${Math.random().toString(36).substring(2, 4).toUpperCase()}-${Math.floor(Math.random() * 1000)}`;
  
  // Get command ASCII
  const commandAscii = getCommandAscii(command);
  
  // Calculate system integrity status
  const integrityStatus = options.vitals && options.vitals.length > 0 
    ? options.vitals[0].status.toUpperCase()
    : 'READY';

  // Colors
  const border = chalk.cyan;
  const dim = chalk.dim;

  // ═══════════════════════════════════════════════════════════════════════════
  // TOP BORDER
  // ═══════════════════════════════════════════════════════════════════════════
  console.log(border('╔' + '═'.repeat(BOX_WIDTH) + '╗'));

  // Empty line
  console.log(border('║') + ' '.repeat(BOX_WIDTH) + border('║'));

  // ═══════════════════════════════════════════════════════════════════════════
  // VIBECHECK BANNER (centered)
  // ═══════════════════════════════════════════════════════════════════════════
  for (const line of VIBECHECK_BANNER) {
    console.log(border('║') + centerText(border(line), BOX_WIDTH) + border('║'));
  }

  // Empty line
  console.log(border('║') + ' '.repeat(BOX_WIDTH) + border('║'));

  // ═══════════════════════════════════════════════════════════════════════════
  // COMMAND ASCII (centered)
  // ═══════════════════════════════════════════════════════════════════════════
  for (const line of commandAscii) {
    // Color based on command type
    let coloredLine: string;
    if (command.toUpperCase() === 'NO SHIP') {
      coloredLine = chalk.red(line);
    } else if (command.toUpperCase() === 'SHIP') {
      coloredLine = chalk.green(line);
    } else {
      coloredLine = border(line);
    }
    console.log(border('║') + centerText(coloredLine, BOX_WIDTH) + border('║'));
  }

  // Empty line
  console.log(border('║') + ' '.repeat(BOX_WIDTH) + border('║'));

  // ═══════════════════════════════════════════════════════════════════════════
  // INFO LINES
  // ═══════════════════════════════════════════════════════════════════════════
  const targetPath = target ? truncatePath(target, 35) : truncatePath(process.cwd(), 35);
  const elapsed = formatElapsedTime(elapsedTime);
  
  const infoLine1 = `  v${version}  ::  SYSTEM INTEGRITY: ${integrityStatus}`;
  const infoLine2 = `  Target: ${targetPath}      Session: #${session} | Time: ${elapsed}`;
  
  console.log(border('║') + dim(padText(infoLine1, BOX_WIDTH)) + border('║'));
  console.log(border('║') + dim(padText(infoLine2, BOX_WIDTH)) + border('║'));

  // ═══════════════════════════════════════════════════════════════════════════
  // VITALS + DIAGNOSTICS (two-column layout)
  // ═══════════════════════════════════════════════════════════════════════════
  if (options.vitals || options.diagnostics) {
    // Column separator
    console.log(border('╠' + '═'.repeat(44) + '╤' + '═'.repeat(33) + '╣'));

    // Headers
    console.log(
      border('║') +
      chalk.bold(' SYSTEM VITALS') + ' '.repeat(30) +
      border('│') +
      chalk.bold(' DIAGNOSTIC LOG') + ' '.repeat(18) +
      border('║')
    );

    // Sub-divider
    console.log(
      border('║') +
      ' ' + '─'.repeat(43) +
      border('┼') +
      ' ' + '─'.repeat(32) +
      border('║')
    );

    // Empty row
    console.log(
      border('║') + ' '.repeat(44) + border('│') + ' '.repeat(33) + border('║')
    );

    // Render vitals and diagnostics
    const vitals = options.vitals || [];
    const diagnostics = options.diagnostics || [];
    const maxRows = Math.max(vitals.length * 3, diagnostics.length * 2, 4);

    let vitalIndex = 0;
    let vitalLine = 0;
    let diagIndex = 0;
    let diagLine = 0;

    for (let row = 0; row < maxRows; row++) {
      let leftContent = '';
      let rightContent = '';

      // Left column (vitals)
      if (vitalIndex < vitals.length) {
        const vital = vitals[vitalIndex];
        if (vitalLine === 0) {
          // Label and status
          const statusLabel = formatStatus(vital.status);
          leftContent = `  ${vital.label.padEnd(18)}${statusLabel}`;
        } else if (vitalLine === 1) {
          // Progress bar
          const pct = vital.percentage ?? 0;
          const bar = generateProgressBar(pct, 25, vital.status);
          leftContent = `  ${bar} ${pct}%`;
        } else if (vitalLine === 2) {
          // Value (if different from percentage)
          const val = String(vital.value);
          if (val && val !== String(vital.percentage) && val !== `${vital.percentage}%`) {
            leftContent = `  ${dim(val)}`;
          }
          vitalIndex++;
          vitalLine = -1;
        }
        vitalLine++;
      }

      // Right column (diagnostics) - 33 chars wide, need to fit content
      if (diagIndex < diagnostics.length) {
        const diag = diagnostics[diagIndex];
        if (diagLine === 0) {
          const levelLabel = formatStatus(diag.level);
          // Max 28 chars for message (33 - 2 padding - 2 for symbol - 1 space)
          const maxMsgLen = 28;
          const msg = diag.message.length > maxMsgLen 
            ? diag.message.slice(0, maxMsgLen - 2) + '..'
            : diag.message;
          rightContent = ` ${levelLabel} ${msg}`;
        } else if (diagLine === 1 && diag.details) {
          rightContent = `    ${dim(diag.details.slice(0, 26))}`;
          diagIndex++;
          diagLine = -1;
        } else {
          diagIndex++;
          diagLine = -1;
        }
        diagLine++;
      }

      console.log(
        border('║') +
        padText(leftContent, 44) +
        border('│') +
        padText(rightContent, 33) +
        border('║')
      );
    }

    // Separator before next section
    console.log(border('╠' + '═'.repeat(44) + '╧' + '═'.repeat(33) + '╣'));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY AUDIT
  // ═══════════════════════════════════════════════════════════════════════════
  if (options.securityAudit && options.securityAudit.length > 0) {
    console.log(border('║') + chalk.bold(' SECURITY AUDIT') + ' '.repeat(63) + border('║'));
    console.log(border('║') + ' '.repeat(BOX_WIDTH) + border('║'));

    for (const audit of options.securityAudit) {
      const statusSymbol = audit.status === 'pass' ? chalk.green('✓') : 
                          audit.status === 'fail' ? chalk.red('✖') : chalk.yellow('⚠');
      const statusText = audit.status === 'pass' ? 'PASS' : 
                        audit.status === 'fail' ? 'FAIL' : 'WARN';
      const dots = '.'.repeat(Math.max(1, 30 - audit.check.length));
      const line = `  ${statusSymbol} ${audit.check}${dots}${statusText}`;
      console.log(border('║') + padText(line, BOX_WIDTH) + border('║'));
    }

    console.log(border('║') + ' '.repeat(BOX_WIDTH) + border('║'));
    console.log(border('╠' + '═'.repeat(BOX_WIDTH) + '╣'));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ACTION REQUIRED
  // ═══════════════════════════════════════════════════════════════════════════
  if (options.actionRequired) {
    console.log(border('║') + chalk.bold(` ${options.actionRequired.title}`) + ' '.repeat(BOX_WIDTH - options.actionRequired.title.length - 1) + border('║'));
    console.log(border('║') + ' ' + '─'.repeat(BOX_WIDTH - 2) + ' ' + border('║'));
    console.log(border('║') + ' '.repeat(BOX_WIDTH) + border('║'));

    // Message (word wrap)
    const msgChunks = options.actionRequired.message.match(/.{1,74}/g) || [];
    for (const chunk of msgChunks) {
      console.log(border('║') + `  ${chunk}` + ' '.repeat(Math.max(0, BOX_WIDTH - chunk.length - 2)) + border('║'));
    }

    console.log(border('║') + ' '.repeat(BOX_WIDTH) + border('║'));

    // Suggestions
    for (const sug of options.actionRequired.suggestions) {
      const sugLine = `  > ${sug.command.padEnd(25)} ${chalk.dim(sug.description)}`;
      console.log(border('║') + padText(sugLine, BOX_WIDTH) + border('║'));
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BOTTOM BORDER
  // ═══════════════════════════════════════════════════════════════════════════
  console.log(border('╚' + '═'.repeat(BOX_WIDTH) + '╝'));
  console.log('');
}
