/**
 * Environment detection for CI/TTY and graceful degradation
 * Comprehensive detection with caching and fallbacks
 */

import ci from 'ci-info';
import os from 'node:os';

/** Terminal capabilities */
export interface TerminalCapabilities {
  /** Supports ANSI colors */
  colors: boolean;
  /** Color depth: 0=none, 1=basic, 2=256, 3=truecolor */
  colorDepth: 0 | 1 | 2 | 3;
  /** Supports Unicode characters */
  unicode: boolean;
  /** Supports hyperlinks */
  hyperlinks: boolean;
  /** Supports cursor movement */
  cursor: boolean;
  /** Terminal width in columns */
  width: number;
  /** Terminal height in rows */
  height: number;
}

/** Environment information */
export interface Environment {
  /** Running in CI environment */
  isCI: boolean;
  /** CI provider name (if detected) */
  ciName: string | null;
  /** Interactive terminal (TTY + not CI) */
  isInteractive: boolean;
  /** stdout is a TTY */
  isTTY: boolean;
  /** stderr is a TTY */
  isStderrTTY: boolean;
  /** stdin is a TTY */
  isStdinTTY: boolean;
  /** Running in debug mode */
  isDebug: boolean;
  /** Running in production */
  isProduction: boolean;
  /** Node.js version info */
  nodeVersion: { major: number; minor: number; patch: number };
  /** Operating system */
  platform: NodeJS.Platform;
  /** OS architecture */
  arch: string;
  /** Terminal capabilities */
  terminal: TerminalCapabilities;
  /** Home directory */
  homeDir: string;
  /** Temp directory */
  tempDir: string;
}

/** Symbol sets for different terminal capabilities */
interface SymbolSet {
  tick: string;
  cross: string;
  warning: string;
  info: string;
  arrow: string;
  bullet: string;
  ellipsis: string;
  pointerSmall: string;
  pointer: string;
  line: string;
  corner: string;
  tee: string;
  radioOn: string;
  radioOff: string;
  checkboxOn: string;
  checkboxOff: string;
  star: string;
}

const UNICODE_SYMBOLS: SymbolSet = {
  tick: '✓',
  cross: '✖',
  warning: '⚠',
  info: 'ℹ',
  arrow: '→',
  bullet: '•',
  ellipsis: '…',
  pointerSmall: '›',
  pointer: '❯',
  line: '─',
  corner: '└',
  tee: '├',
  radioOn: '◉',
  radioOff: '◯',
  checkboxOn: '☑',
  checkboxOff: '☐',
  star: '★',
};

const ASCII_SYMBOLS: SymbolSet = {
  tick: '√',
  cross: 'x',
  warning: '!',
  info: 'i',
  arrow: '->',
  bullet: '*',
  ellipsis: '...',
  pointerSmall: '>',
  pointer: '>',
  line: '-',
  corner: '`-',
  tee: '|-',
  radioOn: '(*)',
  radioOff: '( )',
  checkboxOn: '[x]',
  checkboxOff: '[ ]',
  star: '*',
};

// Cache for environment detection
let envCache: Environment | null = null;
let symbolsCache: SymbolSet | null = null;

/**
 * Detect Unicode support
 */
function detectUnicodeSupport(): boolean {
  // Explicit disable
  if (process.env['VIBECHECK_NO_UNICODE'] === '1') {
    return false;
  }

  // Explicit enable
  if (process.env['VIBECHECK_UNICODE'] === '1') {
    return true;
  }

  // Windows detection
  if (process.platform === 'win32') {
    // Windows Terminal supports Unicode
    if (process.env['WT_SESSION']) {
      return true;
    }
    // ConEmu supports Unicode
    if (process.env['ConEmuANSI'] === 'ON') {
      return true;
    }
    // VS Code integrated terminal
    if (process.env['TERM_PROGRAM'] === 'vscode') {
      return true;
    }
    // Check for modern Windows console
    if (process.env['TERM'] === 'xterm-256color') {
      return true;
    }
    // cmd.exe and older PowerShell have limited Unicode support
    return false;
  }

  // macOS and Linux generally support Unicode
  // Check LANG/LC_ALL for UTF-8
  const lang = process.env['LANG'] || process.env['LC_ALL'] || '';
  if (lang.toLowerCase().includes('utf-8') || lang.toLowerCase().includes('utf8')) {
    return true;
  }

  // Modern terminals default to Unicode
  return true;
}

/**
 * Detect color support level
 */
function detectColorSupport(): { supported: boolean; depth: 0 | 1 | 2 | 3 } {
  // Explicit no color
  if (process.env['NO_COLOR'] !== undefined || process.env['VIBECHECK_NO_COLOR'] === '1') {
    return { supported: false, depth: 0 };
  }

  // Explicit force color
  const forceColor = process.env['FORCE_COLOR'];
  if (forceColor !== undefined) {
    if (forceColor === '0' || forceColor === 'false') {
      return { supported: false, depth: 0 };
    }
    if (forceColor === '1') {
      return { supported: true, depth: 1 };
    }
    if (forceColor === '2') {
      return { supported: true, depth: 2 };
    }
    if (forceColor === '3' || forceColor === 'true') {
      return { supported: true, depth: 3 };
    }
  }

  // Not a TTY
  if (!process.stdout.isTTY) {
    // Allow color in CI if FORCE_COLOR or CI supports it
    if (ci.isCI) {
      // GitHub Actions supports colors
      if (process.env['GITHUB_ACTIONS']) {
        return { supported: true, depth: 3 };
      }
      // GitLab CI supports colors
      if (process.env['GITLAB_CI']) {
        return { supported: true, depth: 2 };
      }
      // Travis CI supports colors
      if (process.env['TRAVIS']) {
        return { supported: true, depth: 1 };
      }
    }
    return { supported: false, depth: 0 };
  }

  // Check COLORTERM for truecolor
  const colorTerm = process.env['COLORTERM'];
  if (colorTerm === 'truecolor' || colorTerm === '24bit') {
    return { supported: true, depth: 3 };
  }

  // Check TERM for color depth
  const term = process.env['TERM'] || '';
  if (term.includes('256color') || term.includes('256')) {
    return { supported: true, depth: 2 };
  }
  if (term.includes('color') || term.includes('ansi')) {
    return { supported: true, depth: 1 };
  }

  // Windows
  if (process.platform === 'win32') {
    // Windows Terminal supports truecolor
    if (process.env['WT_SESSION']) {
      return { supported: true, depth: 3 };
    }
    // Windows 10+ cmd.exe supports colors
    const osRelease = os.release().split('.');
    if (parseInt(osRelease[0], 10) >= 10) {
      return { supported: true, depth: 2 };
    }
    return { supported: true, depth: 1 };
  }

  // Default to basic color support
  return { supported: true, depth: 1 };
}

/**
 * Detect hyperlink support
 */
function detectHyperlinkSupport(): boolean {
  // iTerm2 supports hyperlinks
  if (process.env['TERM_PROGRAM'] === 'iTerm.app') {
    return true;
  }
  // Windows Terminal supports hyperlinks
  if (process.env['WT_SESSION']) {
    return true;
  }
  // VS Code terminal supports hyperlinks
  if (process.env['TERM_PROGRAM'] === 'vscode') {
    return true;
  }
  // Check for VTE version (GNOME Terminal, etc.)
  const vteVersion = process.env['VTE_VERSION'];
  if (vteVersion && parseInt(vteVersion, 10) >= 5000) {
    return true;
  }
  return false;
}

/**
 * Get terminal dimensions
 */
function getTerminalSize(): { width: number; height: number } {
  // Check process.stdout first
  if (process.stdout.columns && process.stdout.rows) {
    return {
      width: process.stdout.columns,
      height: process.stdout.rows,
    };
  }

  // Check environment variables
  const columns = parseInt(process.env['COLUMNS'] || '', 10);
  const lines = parseInt(process.env['LINES'] || '', 10);
  if (!isNaN(columns) && !isNaN(lines)) {
    return { width: columns, height: lines };
  }

  // Default fallback
  return { width: 80, height: 24 };
}

/**
 * Parse Node.js version
 */
function parseNodeVersion(): { major: number; minor: number; patch: number } {
  const match = process.version.match(/^v(\d+)\.(\d+)\.(\d+)/);
  if (match) {
    return {
      major: parseInt(match[1], 10),
      minor: parseInt(match[2], 10),
      patch: parseInt(match[3], 10),
    };
  }
  return { major: 0, minor: 0, patch: 0 };
}

/**
 * Detect terminal capabilities
 */
function detectTerminalCapabilities(): TerminalCapabilities {
  const colorSupport = detectColorSupport();
  const size = getTerminalSize();

  return {
    colors: colorSupport.supported,
    colorDepth: colorSupport.depth,
    unicode: detectUnicodeSupport(),
    hyperlinks: detectHyperlinkSupport(),
    cursor: Boolean(process.stdout.isTTY),
    width: size.width,
    height: size.height,
  };
}

/**
 * Build environment object
 */
function buildEnvironment(): Environment {
  const terminal = detectTerminalCapabilities();

  return {
    isCI: ci.isCI,
    ciName: ci.name,
    isTTY: Boolean(process.stdout.isTTY),
    isStderrTTY: Boolean(process.stderr.isTTY),
    isStdinTTY: Boolean(process.stdin.isTTY),
    isInteractive: Boolean(process.stdout.isTTY) && !ci.isCI,
    isDebug: process.env['DEBUG'] === '1' || process.env['VIBECHECK_DEBUG'] === '1',
    isProduction: process.env['NODE_ENV'] === 'production',
    nodeVersion: parseNodeVersion(),
    platform: process.platform,
    arch: process.arch,
    terminal,
    homeDir: os.homedir(),
    tempDir: os.tmpdir(),
  };
}

/**
 * Get current environment (cached)
 */
export function getEnvironment(): Environment {
  if (!envCache) {
    envCache = buildEnvironment();
  }
  return envCache;
}

/**
 * Export cached env for convenience
 */
export const env: Environment = getEnvironment();

/**
 * Refresh environment detection (call after terminal resize, etc.)
 */
export function refreshEnvironment(): Environment {
  envCache = null;
  symbolsCache = null;
  return getEnvironment();
}

/**
 * Get symbols based on environment capabilities
 */
export function getSymbols(): SymbolSet {
  if (!symbolsCache) {
    const environment = getEnvironment();
    symbolsCache = environment.terminal.unicode ? UNICODE_SYMBOLS : ASCII_SYMBOLS;
  }
  return symbolsCache;
}

/**
 * Check if we should use animations (spinners, progress bars)
 */
export function shouldAnimate(): boolean {
  const environment = getEnvironment();
  return (
    environment.isInteractive &&
    environment.terminal.colors &&
    environment.terminal.cursor &&
    !environment.isDebug
  );
}

/**
 * Check if we should use interactive prompts
 */
export function shouldPrompt(): boolean {
  const environment = getEnvironment();
  return environment.isInteractive && environment.isStdinTTY;
}

/**
 * Check if we should use colors
 */
export function shouldUseColors(): boolean {
  const environment = getEnvironment();
  return environment.terminal.colors;
}

/**
 * Check if running in verbose mode (via env or debug)
 */
export function isVerbose(): boolean {
  return (
    process.env['VIBECHECK_VERBOSE'] === '1' ||
    process.env['DEBUG'] === '1' ||
    process.env['VIBECHECK_DEBUG'] === '1'
  );
}

/**
 * Check if running in quiet mode
 */
export function isQuiet(): boolean {
  return process.env['VIBECHECK_QUIET'] === '1';
}

/**
 * Check if profiling is enabled (VIBECHECK_PROFILE=1)
 * When enabled, detailed timing information will be logged
 */
export function isProfilingEnabled(): boolean {
  return process.env['VIBECHECK_PROFILE'] === '1';
}

/**
 * Profile a function execution and log timing if profiling is enabled
 */
export async function profileAsync<T>(
  name: string,
  fn: () => Promise<T>,
  logger?: { debug: (msg: string) => void }
): Promise<{ result: T; durationMs: number }> {
  const start = performance.now();
  const result = await fn();
  const durationMs = Math.round(performance.now() - start);
  
  if (isProfilingEnabled() && logger) {
    logger.debug(`[PROFILE] ${name}: ${durationMs}ms`);
  }
  
  return { result, durationMs };
}

/**
 * Profile a sync function execution
 */
export function profileSync<T>(
  name: string,
  fn: () => T,
  logger?: { debug: (msg: string) => void }
): { result: T; durationMs: number } {
  const start = performance.now();
  const result = fn();
  const durationMs = Math.round(performance.now() - start);
  
  if (isProfilingEnabled() && logger) {
    logger.debug(`[PROFILE] ${name}: ${durationMs}ms`);
  }
  
  return { result, durationMs };
}

/**
 * Create a profiler for collecting multiple timing measurements
 */
export function createProfiler(): {
  start: (name: string) => void;
  end: (name: string) => number;
  getTimings: () => Record<string, number>;
  log: (logger: { debug: (msg: string) => void }) => void;
} {
  const starts = new Map<string, number>();
  const timings: Record<string, number> = {};
  
  return {
    start(name: string) {
      starts.set(name, performance.now());
    },
    end(name: string): number {
      const start = starts.get(name);
      if (start === undefined) return 0;
      
      const duration = Math.round(performance.now() - start);
      timings[name] = duration;
      starts.delete(name);
      return duration;
    },
    getTimings() {
      return { ...timings };
    },
    log(logger: { debug: (msg: string) => void }) {
      if (!isProfilingEnabled()) return;
      
      logger.debug('[PROFILE] Timing breakdown:');
      const entries = Object.entries(timings).sort((a, b) => b[1] - a[1]);
      for (const [name, ms] of entries) {
        logger.debug(`  ${name}: ${ms}ms`);
      }
    },
  };
}

/**
 * Get a safe terminal width (capped for readability)
 */
export function getSafeTerminalWidth(max = 120, min = 40): number {
  const environment = getEnvironment();
  return Math.max(min, Math.min(max, environment.terminal.width));
}

/**
 * Format text to fit terminal width
 */
export function wrapText(text: string, maxWidth?: number): string {
  const width = maxWidth ?? getSafeTerminalWidth();
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if (currentLine.length + word.length + 1 <= width) {
      currentLine += (currentLine ? ' ' : '') + word;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);

  return lines.join('\n');
}

/**
 * Create a hyperlink (if supported)
 */
export function hyperlink(text: string, url: string): string {
  const environment = getEnvironment();
  if (environment.terminal.hyperlinks) {
    // OSC 8 escape sequence for hyperlinks
    return `\u001B]8;;${url}\u0007${text}\u001B]8;;\u0007`;
  }
  // Fallback: just return text
  return text;
}

/**
 * Get number of CPU cores (for parallel operations)
 */
export function getCpuCount(): number {
  return os.cpus().length;
}

/**
 * Get available memory in MB
 */
export function getAvailableMemoryMB(): number {
  return Math.floor(os.freemem() / 1024 / 1024);
}

/**
 * Check if we have enough memory for an operation
 */
export function hasEnoughMemory(requiredMB: number): boolean {
  return getAvailableMemoryMB() >= requiredMB;
}

/**
 * Listen for terminal resize events
 */
export function onTerminalResize(callback: () => void): () => void {
  const handler = () => {
    refreshEnvironment();
    callback();
  };

  process.stdout.on('resize', handler);

  // Return cleanup function
  return () => {
    process.stdout.off('resize', handler);
  };
}

/**
 * Register signal handlers for graceful shutdown
 */
export function registerShutdownHandlers(
  cleanup: () => void | Promise<void>
): void {
  let shuttingDown = false;

  const handler = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;

    try {
      await cleanup();
    } catch {
      // Ignore cleanup errors during shutdown
    }

    process.exit(signal === 'SIGTERM' ? 0 : 1);
  };

  process.on('SIGINT', () => handler('SIGINT'));
  process.on('SIGTERM', () => handler('SIGTERM'));

  // Windows-specific
  if (process.platform === 'win32') {
    process.on('SIGHUP', () => handler('SIGHUP'));
  }
}

// Setup terminal resize listener to refresh environment
if (process.stdout.isTTY) {
  process.stdout.on('resize', () => {
    refreshEnvironment();
  });
}
