/**
 * Logger wrapper with level-based filtering, file logging, and structured output
 * Features: multiple transports, timestamps, JSON output, buffering
 */

import { createConsola, type LogLevels } from 'consola';
import chalk from 'chalk';
import fs from 'node:fs';
import path from 'node:path';
import { getEnvironment, getSymbols, shouldUseColors } from './environment.js';
import { isVibeCheckError, type VibeCheckError } from './errors.js';

/** Log levels mapping */
export type LogLevel = 'silent' | 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'verbose' | 'normal' | 'quiet';

const LOG_LEVEL_MAP: Record<LogLevel, number> = {
  silent: -1,
  fatal: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
  trace: 5,
  // Aliases for CLI convenience
  verbose: 4,  // Maps to debug
  normal: 3,   // Maps to info
  quiet: 1,    // Maps to error
};

const LOG_LEVEL_NAMES: Record<number, string> = {
  [-1]: 'SILENT',
  [0]: 'FATAL',
  [1]: 'ERROR',
  [2]: 'WARN',
  [3]: 'INFO',
  [4]: 'DEBUG',
  [5]: 'TRACE',
};

/** Structured log entry */
export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  data?: unknown;
  context?: Record<string, unknown>;
  error?: {
    code?: string;
    message: string;
    stack?: string;
    suggestions?: string[];
  };
}

/** Logger options */
export interface LoggerOptions {
  /** Minimum log level */
  level?: LogLevel;
  /** Output as JSON */
  json?: boolean;
  /** Include timestamps */
  timestamps?: boolean;
  /** File path for logging (in addition to console) */
  file?: string;
  /** Prefix for all messages */
  prefix?: string;
  /** Context to include in all log entries */
  context?: Record<string, unknown>;
  /** Buffer logs and flush periodically */
  buffered?: boolean;
  /** Buffer flush interval in ms */
  flushInterval?: number;
}

/** Logger instance interface */
export interface Logger {
  success: (message: string, ...args: unknown[]) => void;
  error: (message: string, ...args: unknown[]) => void;
  warn: (message: string, ...args: unknown[]) => void;
  info: (message: string, ...args: unknown[]) => void;
  debug: (message: string, ...args: unknown[]) => void;
  trace: (message: string, ...args: unknown[]) => void;
  fatal: (message: string, ...args: unknown[]) => void;
  log: (message: string, ...args: unknown[]) => void;
  logError: (error: VibeCheckError | Error) => void;
  newline: () => void;
  dim: (message: string) => void;
  step: (message: string) => void;
  box: (message: string, title?: string) => void;
  table: (data: Record<string, unknown>[]) => void;
  json: (data: unknown) => void;
  group: (title: string) => void;
  groupEnd: () => void;
  time: (label: string) => void;
  timeEnd: (label: string) => void;
  setLevel: (level: LogLevel) => void;
  setContext: (context: Record<string, unknown>) => void;
  child: (context: Record<string, unknown>) => Logger;
  flush: () => Promise<void>;
}

/**
 * Create a logger instance with advanced features
 */
export function createLogger(options: LoggerOptions = {}): Logger {
  const env = getEnvironment();
  const symbols = getSymbols();
  const useColors = shouldUseColors() && !options.json;

  // Resolve options with defaults
  const level = options.level ?? 'info';
  const useJson = options.json ?? false;
  const useTimestamps = options.timestamps ?? useJson;
  const prefix = options.prefix ?? '';
  let context = options.context ?? {};

  // Color functions (with fallbacks when colors disabled)
  const c = {
    green: useColors ? chalk.green : (s: string) => s,
    red: useColors ? chalk.red : (s: string) => s,
    yellow: useColors ? chalk.yellow : (s: string) => s,
    cyan: useColors ? chalk.cyan : (s: string) => s,
    dim: useColors ? chalk.dim : (s: string) => s,
    bold: useColors ? chalk.bold : (s: string) => s,
    underline: useColors ? chalk.underline : (s: string) => s,
  };

  // Create base consola logger
  const consola = createConsola({
    level: LOG_LEVEL_MAP[level],
    formatOptions: {
      colors: useColors,
      date: false,
    },
  });

  // File logging setup
  let fileStream: fs.WriteStream | null = null;
  let logBuffer: string[] = [];
  let flushTimer: NodeJS.Timeout | null = null;

  if (options.file) {
    try {
      const logDir = path.dirname(options.file);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      fileStream = fs.createWriteStream(options.file, { flags: 'a' });
    } catch {
      // Silently fail file logging setup
    }
  }

  // Buffering setup
  if (options.buffered && fileStream) {
    const flushInterval = options.flushInterval ?? 5000;
    flushTimer = setInterval(() => {
      flushToFile();
    }, flushInterval);
  }

  // Time tracking for time/timeEnd
  const timers = new Map<string, number>();

  // Group tracking
  let groupDepth = 0;

  function getTimestamp(): string {
    return new Date().toISOString();
  }

  function getPrefix(): string {
    if (!prefix) return '';
    return `[${prefix}] `;
  }

  function getIndent(): string {
    return '  '.repeat(groupDepth);
  }

  function formatLogEntry(levelNum: LogLevels, message: string, data?: unknown): LogEntry {
    return {
      timestamp: getTimestamp(),
      level: LOG_LEVEL_NAMES[levelNum] ?? 'INFO',
      message,
      data: data !== undefined ? data : undefined,
      context: Object.keys(context).length > 0 ? context : undefined,
    };
  }

  function writeToFile(entry: LogEntry): void {
    if (!fileStream) return;

    const line = JSON.stringify(entry) + '\n';

    if (options.buffered) {
      logBuffer.push(line);
    } else {
      fileStream.write(line);
    }
  }

  function flushToFile(): void {
    if (!fileStream || logBuffer.length === 0) return;

    const data = logBuffer.join('');
    logBuffer = [];
    fileStream.write(data);
  }

  function output(
    levelNum: LogLevels,
    symbol: string,
    colorFn: (s: string) => string,
    message: string,
    ...args: unknown[]
  ): void {
    // Check log level
    if (levelNum > LOG_LEVEL_MAP[level]) return;

    const entry = formatLogEntry(levelNum, message, args.length > 0 ? args : undefined);

    // Write to file
    writeToFile(entry);

    // Console output
    if (useJson) {
      console.log(JSON.stringify(entry));
    } else {
      const timestamp = useTimestamps ? c.dim(`[${entry.timestamp}] `) : '';
      const prefixStr = getPrefix();
      const indent = getIndent();
      const formatted = `${timestamp}${indent}${prefixStr}${colorFn(symbol)} ${message}`;
      
      if (levelNum <= 1) {
        console.error(formatted, ...args);
      } else {
        console.log(formatted, ...args);
      }
    }
  }

  const logger: Logger = {
    success: (message: string, ...args: unknown[]) => {
      output(3, symbols.tick, c.green, message, ...args);
    },

    error: (message: string, ...args: unknown[]) => {
      output(1, symbols.cross, c.red, message, ...args);
    },

    warn: (message: string, ...args: unknown[]) => {
      output(2, symbols.warning, c.yellow, message, ...args);
    },

    info: (message: string, ...args: unknown[]) => {
      output(3, symbols.info, c.cyan, message, ...args);
    },

    debug: (message: string, ...args: unknown[]) => {
      output(4, symbols.bullet, c.dim, message, ...args);
    },

    trace: (message: string, ...args: unknown[]) => {
      output(5, symbols.bullet, c.dim, `[TRACE] ${message}`, ...args);
    },

    fatal: (message: string, ...args: unknown[]) => {
      output(0, symbols.cross, c.red, `FATAL: ${message}`, ...args);
    },

    log: (message: string, ...args: unknown[]) => {
      if (useJson) {
        console.log(JSON.stringify(formatLogEntry(3, message, args.length > 0 ? args : undefined)));
      } else {
        const indent = getIndent();
        console.log(`${indent}${message}`, ...args);
      }
    },

    logError: (error: VibeCheckError | Error) => {
      if (useJson) {
        const entry: LogEntry = {
          timestamp: getTimestamp(),
          level: 'ERROR',
          message: error.message,
          context,
          error: isVibeCheckError(error)
            ? {
                code: error.code,
                message: error.message,
                stack: error.stack,
                suggestions: error.suggestions,
              }
            : {
                message: error.message,
                stack: error.stack,
              },
        };
        console.error(JSON.stringify(entry));
        writeToFile(entry);
        return;
      }

      logger.error(error.message);

      if (isVibeCheckError(error)) {
        if (error.context.file) {
          logger.dim(`  Location: ${error.context.file}${error.context.line ? `:${error.context.line}` : ''}`);
        }

        if (error.suggestions.length > 0) {
          logger.newline();
          error.suggestions.forEach((suggestion) => {
            console.log(`  ${c.cyan(symbols.arrow)} ${suggestion}`);
          });
        }
      }

      // Write to file
      writeToFile({
        timestamp: getTimestamp(),
        level: 'ERROR',
        message: error.message,
        context,
        error: {
          message: error.message,
          stack: error.stack,
        },
      });
    },

    newline: () => {
      if (!useJson) {
        console.log('');
      }
    },

    dim: (message: string) => {
      if (!useJson) {
        const indent = getIndent();
        console.log(`${indent}${c.dim(message)}`);
      }
    },

    step: (message: string) => {
      if (useJson) {
        console.log(JSON.stringify(formatLogEntry(3, message)));
      } else {
        const indent = getIndent();
        console.log(`${indent}${c.cyan(symbols.pointerSmall)} ${message}`);
      }
    },

    box: (message: string, title?: string) => {
      if (useJson) {
        console.log(JSON.stringify({ type: 'box', title, message }));
        return;
      }

      const width = Math.min(60, env.terminal.width - 4);
      const lines = message.split('\n');
      const maxLineWidth = Math.max(...lines.map((l) => l.length), (title?.length ?? 0) + 4);
      const boxWidth = Math.min(width, maxLineWidth + 4);

      const horizontal = '─'.repeat(boxWidth - 2);
      const titleStr = title ? ` ${title} ` : '';
      const topBorder = `┌${titleStr}${'─'.repeat(boxWidth - 2 - titleStr.length)}┐`;

      console.log(c.dim(topBorder));
      for (const line of lines) {
        const padding = ' '.repeat(boxWidth - 4 - line.length);
        console.log(`${c.dim('│')} ${line}${padding} ${c.dim('│')}`);
      }
      console.log(c.dim(`└${horizontal}┘`));
    },

    table: (data: Record<string, unknown>[]) => {
      if (useJson) {
        console.log(JSON.stringify({ type: 'table', data }));
        return;
      }

      if (data.length === 0) return;

      // Get column headers
      const columns = Object.keys(data[0]);
      const columnWidths = columns.map((col) => {
        const maxDataWidth = Math.max(...data.map((row) => String(row[col] ?? '').length));
        return Math.max(col.length, maxDataWidth);
      });

      // Header
      const headerRow = columns.map((col, i) => col.padEnd(columnWidths[i])).join(' │ ');
      const separator = columnWidths.map((w) => '─'.repeat(w)).join('─┼─');

      console.log(c.bold(headerRow));
      console.log(c.dim(separator));

      // Rows
      for (const row of data) {
        const rowStr = columns
          .map((col, i) => String(row[col] ?? '').padEnd(columnWidths[i]))
          .join(' │ ');
        console.log(rowStr);
      }
    },

    json: (data: unknown) => {
      console.log(JSON.stringify(data, null, 2));
    },

    group: (title: string) => {
      if (!useJson) {
        const indent = getIndent();
        console.log(`${indent}${c.bold(title)}`);
      }
      groupDepth++;
    },

    groupEnd: () => {
      if (groupDepth > 0) {
        groupDepth--;
      }
    },

    time: (label: string) => {
      timers.set(label, Date.now());
      logger.debug(`Timer "${label}" started`);
    },

    timeEnd: (label: string) => {
      const start = timers.get(label);
      if (start) {
        const duration = Date.now() - start;
        timers.delete(label);
        logger.debug(`Timer "${label}": ${duration}ms`);
      }
    },

    setLevel: (newLevel: LogLevel) => {
      consola.level = LOG_LEVEL_MAP[newLevel];
    },

    setContext: (newContext: Record<string, unknown>) => {
      context = { ...context, ...newContext };
    },

    child: (childContext: Record<string, unknown>): Logger => {
      return createLogger({
        ...options,
        context: { ...context, ...childContext },
      });
    },

    flush: async () => {
      flushToFile();
      if (fileStream) {
        return new Promise((resolve) => {
          fileStream!.once('drain', resolve);
          if (!fileStream!.write('')) {
            // Buffer is full, wait for drain
          } else {
            resolve();
          }
        });
      }
    },
  };

  // Cleanup on process exit
  process.on('exit', () => {
    if (flushTimer) {
      clearInterval(flushTimer);
    }
    flushToFile();
    if (fileStream) {
      fileStream.end();
    }
  });

  return logger;
}

/** Default logger instance */
let defaultLogger: Logger | null = null;

/**
 * Get or create the default logger
 */
export function getLogger(): Logger {
  if (!defaultLogger) {
    defaultLogger = createLogger();
  }
  return defaultLogger;
}

/**
 * Set the default logger
 */
export function setDefaultLogger(logger: Logger): void {
  defaultLogger = logger;
}

/**
 * Convenience export for the default logger
 */
export const logger = {
  get success() {
    return getLogger().success;
  },
  get error() {
    return getLogger().error;
  },
  get warn() {
    return getLogger().warn;
  },
  get info() {
    return getLogger().info;
  },
  get debug() {
    return getLogger().debug;
  },
  get log() {
    return getLogger().log;
  },
  get logError() {
    return getLogger().logError;
  },
  get newline() {
    return getLogger().newline;
  },
  get dim() {
    return getLogger().dim;
  },
  get step() {
    return getLogger().step;
  },
};

/**
 * Create a spinner-compatible logger that can be paused
 */
export function createSpinnerLogger(baseLogger: Logger): Logger & { pause: () => void; resume: () => void } {
  let paused = false;
  const buffer: Array<() => void> = [];

  const wrap =
    <T extends (...args: unknown[]) => void>(fn: T) =>
    (...args: Parameters<T>) => {
      if (paused) {
        buffer.push(() => fn(...args));
      } else {
        fn(...args);
      }
    };

  return {
    ...baseLogger,
    success: wrap(baseLogger.success),
    error: wrap(baseLogger.error),
    warn: wrap(baseLogger.warn),
    info: wrap(baseLogger.info),
    debug: wrap(baseLogger.debug),
    log: wrap(baseLogger.log),
    dim: wrap(baseLogger.dim),
    step: wrap(baseLogger.step),
    pause: () => {
      paused = true;
    },
    resume: () => {
      paused = false;
      // Flush buffer
      while (buffer.length > 0) {
        const fn = buffer.shift();
        fn?.();
      }
    },
  };
}
