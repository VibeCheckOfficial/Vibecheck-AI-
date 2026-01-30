/**
 * Structured Logger
 * 
 * Provides consistent, structured logging across all components.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  component: string;
  message: string;
  context?: Record<string, unknown>;
  duration?: number;
  error?: {
    name: string;
    message: string;
    code?: string;
    stack?: string;
  };
}

export interface LoggerConfig {
  level: LogLevel;
  component: string;
  enableConsole: boolean;
  enableStructured: boolean;
  onLog?: (entry: LogEntry) => void;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const DEFAULT_CONFIG: LoggerConfig = {
  level: 'info',
  component: 'vibecheck',
  enableConsole: true,
  enableStructured: false,
};

/**
 * Create a scoped logger instance
 */
export class Logger {
  private config: LoggerConfig;

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Create a child logger with a new component name
   */
  child(component: string): Logger {
    return new Logger({
      ...this.config,
      component: `${this.config.component}.${component}`,
    });
  }

  /**
   * Log at debug level
   */
  debug(message: string, context?: Record<string, unknown>): void {
    this.log('debug', message, context);
  }

  /**
   * Log at info level
   */
  info(message: string, context?: Record<string, unknown>): void {
    this.log('info', message, context);
  }

  /**
   * Log at warn level
   */
  warn(message: string, context?: Record<string, unknown>): void {
    this.log('warn', message, context);
  }

  /**
   * Log at error level
   */
  error(message: string, error?: Error, context?: Record<string, unknown>): void {
    const errorInfo = error ? {
      name: error.name,
      message: error.message,
      code: (error as { code?: string }).code,
      stack: error.stack,
    } : undefined;

    this.log('error', message, context, errorInfo);
  }

  /**
   * Log with timing
   */
  timed<T>(
    operation: string,
    fn: () => T | Promise<T>,
    context?: Record<string, unknown>
  ): T | Promise<T> {
    const start = performance.now();
    
    const logCompletion = (success: boolean, error?: Error) => {
      const duration = Math.round(performance.now() - start);
      if (success) {
        this.debug(`${operation} completed`, { ...context, duration });
      } else {
        this.error(`${operation} failed`, error, { ...context, duration });
      }
    };

    try {
      const result = fn();
      
      if (result instanceof Promise) {
        return result
          .then((value) => {
            logCompletion(true);
            return value;
          })
          .catch((error) => {
            logCompletion(false, error);
            throw error;
          }) as Promise<T>;
      }
      
      logCompletion(true);
      return result;
    } catch (error) {
      logCompletion(false, error as Error);
      throw error;
    }
  }

  /**
   * Create a log group for related operations
   */
  group(name: string): LogGroup {
    return new LogGroup(this, name);
  }

  private log(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
    error?: LogEntry['error']
  ): void {
    if (LOG_LEVELS[level] < LOG_LEVELS[this.config.level]) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      component: this.config.component,
      message,
      context,
      error,
    };

    // Call custom handler if provided
    if (this.config.onLog) {
      this.config.onLog(entry);
    }

    // Console output
    if (this.config.enableConsole) {
      this.writeToConsole(entry);
    }
  }

  private writeToConsole(entry: LogEntry): void {
    const prefix = `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.component}]`;
    const contextStr = entry.context ? ` ${JSON.stringify(entry.context)}` : '';

    if (this.config.enableStructured) {
      // Structured JSON output
      const output = JSON.stringify(entry);
      switch (entry.level) {
        case 'error':
          console.error(output);
          break;
        case 'warn':
          console.warn(output);
          break;
        default:
          console.log(output);
      }
    } else {
      // Human-readable output
      const message = `${prefix} ${entry.message}${contextStr}`;
      switch (entry.level) {
        case 'error':
          console.error(message);
          if (entry.error?.stack) {
            console.error(entry.error.stack);
          }
          break;
        case 'warn':
          console.warn(message);
          break;
        case 'debug':
          console.debug(message);
          break;
        default:
          console.log(message);
      }
    }
  }
}

/**
 * Log group for tracking related operations
 */
export class LogGroup {
  private logger: Logger;
  private name: string;
  private startTime: number;
  private operations: Array<{ name: string; duration: number; success: boolean }> = [];

  constructor(logger: Logger, name: string) {
    this.logger = logger;
    this.name = name;
    this.startTime = performance.now();
    this.logger.debug(`Starting: ${name}`);
  }

  /**
   * Add an operation to the group
   */
  addOperation(name: string, duration: number, success: boolean): void {
    this.operations.push({ name, duration, success });
  }

  /**
   * End the group and log summary
   */
  end(success = true): void {
    const totalDuration = Math.round(performance.now() - this.startTime);
    const failed = this.operations.filter(op => !op.success).length;
    
    if (success && failed === 0) {
      this.logger.info(`Completed: ${this.name}`, {
        duration: totalDuration,
        operationCount: this.operations.length,
      });
    } else {
      this.logger.warn(`Completed with issues: ${this.name}`, {
        duration: totalDuration,
        operationCount: this.operations.length,
        failedCount: failed,
      });
    }
  }
}

// Default logger instance
let defaultLogger: Logger | null = null;

/**
 * Get or create the default logger
 */
export function getLogger(component?: string): Logger {
  if (!defaultLogger) {
    defaultLogger = new Logger({ level: 'info', component: 'vibecheck' });
  }
  return component ? defaultLogger.child(component) : defaultLogger;
}

/**
 * Configure the default logger
 */
export function configureLogger(config: Partial<LoggerConfig>): void {
  defaultLogger = new Logger(config);
}
