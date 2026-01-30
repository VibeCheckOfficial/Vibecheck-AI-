/**
 * Custom error classes with actionable suggestions
 * Provides comprehensive error handling with recovery hints
 */

/** All possible error codes for categorization */
export type ErrorCode =
  | 'CONFIG_NOT_FOUND'
  | 'CONFIG_INVALID'
  | 'CONFIG_PARSE_ERROR'
  | 'CONFIG_PERMISSION_DENIED'
  | 'TRUTHPACK_NOT_FOUND'
  | 'TRUTHPACK_INVALID'
  | 'TRUTHPACK_CORRUPTED'
  | 'TRUTHPACK_STALE'
  | 'SCAN_FAILED'
  | 'SCAN_TIMEOUT'
  | 'SCAN_NO_FILES'
  | 'VALIDATION_FAILED'
  | 'VALIDATION_TIMEOUT'
  | 'FILE_NOT_FOUND'
  | 'FILE_READ_ERROR'
  | 'FILE_WRITE_ERROR'
  | 'PERMISSION_DENIED'
  | 'DIRECTORY_NOT_FOUND'
  | 'NETWORK_ERROR'
  | 'NETWORK_TIMEOUT'
  | 'INTERRUPTED'
  | 'OUT_OF_MEMORY'
  | 'INVALID_INPUT'
  | 'UNSUPPORTED_OPERATION'
  | 'DEPENDENCY_MISSING'
  | 'VERSION_MISMATCH'
  | 'UNKNOWN_ERROR';

/** Error severity levels */
export type ErrorSeverity = 'fatal' | 'error' | 'warning' | 'info';

/** Context information for debugging */
export interface ErrorContext {
  file?: string;
  line?: number;
  column?: number;
  operation?: string;
  input?: unknown;
  timestamp?: Date;
  duration?: number;
  retryCount?: number;
  maxRetries?: number;
}

/**
 * Custom error class with actionable suggestions and rich context
 */
export class VibeCheckError extends Error {
  public readonly code: ErrorCode;
  public readonly suggestions: string[];
  public readonly cause?: Error;
  public readonly severity: ErrorSeverity;
  public readonly context: ErrorContext;
  public readonly recoverable: boolean;
  public readonly timestamp: Date;

  constructor(
    message: string,
    code: ErrorCode,
    options?: {
      suggestions?: string[];
      cause?: Error;
      severity?: ErrorSeverity;
      context?: ErrorContext;
      recoverable?: boolean;
    }
  ) {
    super(message);
    this.name = 'VibeCheckError';
    this.code = code;
    this.suggestions = options?.suggestions ?? [];
    this.cause = options?.cause;
    this.severity = options?.severity ?? getSeverityForCode(code);
    this.context = options?.context ?? {};
    this.recoverable = options?.recoverable ?? isRecoverableCode(code);
    this.timestamp = new Date();

    // Maintains proper stack trace for where error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, VibeCheckError);
    }
  }

  /**
   * Create error with common suggestions based on error code
   */
  static fromCode(
    code: ErrorCode,
    message?: string,
    options?: { cause?: Error; context?: ErrorContext }
  ): VibeCheckError {
    const defaults = getErrorDefaults(code);
    return new VibeCheckError(message ?? defaults.message, code, {
      suggestions: defaults.suggestions,
      cause: options?.cause,
      context: options?.context,
      severity: defaults.severity,
      recoverable: defaults.recoverable,
    });
  }

  /**
   * Create a new error with additional context
   */
  withContext(context: Partial<ErrorContext>): VibeCheckError {
    return new VibeCheckError(this.message, this.code, {
      suggestions: this.suggestions,
      cause: this.cause,
      severity: this.severity,
      context: { ...this.context, ...context },
      recoverable: this.recoverable,
    });
  }

  /**
   * Create a new error with additional suggestions
   */
  withSuggestions(suggestions: string[]): VibeCheckError {
    return new VibeCheckError(this.message, this.code, {
      suggestions: [...this.suggestions, ...suggestions],
      cause: this.cause,
      severity: this.severity,
      context: this.context,
      recoverable: this.recoverable,
    });
  }

  /**
   * Get a serializable representation for logging/JSON output
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      severity: this.severity,
      suggestions: this.suggestions,
      context: this.context,
      recoverable: this.recoverable,
      timestamp: this.timestamp.toISOString(),
      cause: this.cause?.message,
      stack: this.stack,
    };
  }

  /**
   * Format error for display
   */
  format(options?: { verbose?: boolean; colors?: boolean }): string {
    const lines: string[] = [`[${this.code}] ${this.message}`];

    if (this.context.file) {
      const location = this.context.line
        ? `${this.context.file}:${this.context.line}${this.context.column ? `:${this.context.column}` : ''}`
        : this.context.file;
      lines.push(`  Location: ${location}`);
    }

    if (this.context.operation) {
      lines.push(`  Operation: ${this.context.operation}`);
    }

    if (this.suggestions.length > 0) {
      lines.push('  Suggestions:');
      this.suggestions.forEach((s) => lines.push(`    → ${s}`));
    }

    if (options?.verbose && this.cause) {
      lines.push(`  Caused by: ${this.cause.message}`);
    }

    return lines.join('\n');
  }
}

interface ErrorDefaults {
  message: string;
  suggestions: string[];
  severity: ErrorSeverity;
  recoverable: boolean;
}

function getSeverityForCode(code: ErrorCode): ErrorSeverity {
  const fatalCodes: ErrorCode[] = ['OUT_OF_MEMORY', 'INTERRUPTED'];
  const warningCodes: ErrorCode[] = ['TRUTHPACK_STALE', 'VERSION_MISMATCH'];

  if (fatalCodes.includes(code)) return 'fatal';
  if (warningCodes.includes(code)) return 'warning';
  return 'error';
}

function isRecoverableCode(code: ErrorCode): boolean {
  const recoverableCodes: ErrorCode[] = [
    'CONFIG_NOT_FOUND',
    'TRUTHPACK_NOT_FOUND',
    'TRUTHPACK_STALE',
    'NETWORK_TIMEOUT',
    'SCAN_TIMEOUT',
    'VALIDATION_TIMEOUT',
  ];
  return recoverableCodes.includes(code);
}

function getErrorDefaults(code: ErrorCode): ErrorDefaults {
  const defaults: Record<ErrorCode, ErrorDefaults> = {
    CONFIG_NOT_FOUND: {
      message: 'Configuration file not found',
      suggestions: [
        'Run `vibecheck init` to create a configuration file',
        'Create a vibecheck.config.mjs file manually',
        'Specify a config path with --config <path>',
      ],
      severity: 'error',
      recoverable: true,
    },
    CONFIG_INVALID: {
      message: 'Configuration file is invalid',
      suggestions: [
        'Check your vibecheck.config.mjs for syntax errors',
        'Ensure all required fields are present',
        'Run `vibecheck config --validate` to see detailed errors',
      ],
      severity: 'error',
      recoverable: false,
    },
    CONFIG_PARSE_ERROR: {
      message: 'Failed to parse configuration file',
      suggestions: [
        'Check for JSON/TypeScript syntax errors',
        'Ensure the file exports a valid configuration object',
        'Try using a simpler configuration format like JSON',
      ],
      severity: 'error',
      recoverable: false,
    },
    CONFIG_PERMISSION_DENIED: {
      message: 'Cannot read configuration file - permission denied',
      suggestions: [
        'Check file permissions on the configuration file',
        'Ensure you have read access to the project directory',
      ],
      severity: 'error',
      recoverable: false,
    },
    TRUTHPACK_NOT_FOUND: {
      message: 'Truthpack not found',
      suggestions: [
        'Run `vibecheck scan` to generate a truthpack',
        'Check that the truthpackPath in your config is correct',
        'Ensure the .vibecheck directory exists',
      ],
      severity: 'error',
      recoverable: true,
    },
    TRUTHPACK_INVALID: {
      message: 'Truthpack is invalid or corrupted',
      suggestions: [
        'Run `vibecheck scan --force` to regenerate the truthpack',
        'Check file permissions on the .vibecheck directory',
        'Delete .vibecheck and run `vibecheck scan` again',
      ],
      severity: 'error',
      recoverable: true,
    },
    TRUTHPACK_CORRUPTED: {
      message: 'Truthpack data is corrupted',
      suggestions: [
        'Delete the .vibecheck/truthpack directory',
        'Run `vibecheck scan` to regenerate',
        'Check for disk errors or incomplete writes',
      ],
      severity: 'error',
      recoverable: true,
    },
    TRUTHPACK_STALE: {
      message: 'Truthpack is outdated',
      suggestions: [
        'Run `vibecheck scan` to update the truthpack',
        'Enable watch mode with `vibecheck watch` for automatic updates',
      ],
      severity: 'warning',
      recoverable: true,
    },
    SCAN_FAILED: {
      message: 'Failed to scan codebase',
      suggestions: [
        'Check that the target directory exists',
        'Ensure you have read permissions',
        'Try running with --verbose for more details',
      ],
      severity: 'error',
      recoverable: false,
    },
    SCAN_TIMEOUT: {
      message: 'Scan operation timed out',
      suggestions: [
        'Try scanning a smaller directory',
        'Exclude large directories in your configuration',
        'Increase the timeout with --timeout option',
      ],
      severity: 'error',
      recoverable: true,
    },
    SCAN_NO_FILES: {
      message: 'No files found to scan',
      suggestions: [
        'Check that your include patterns match existing files',
        'Verify the project directory contains source files',
        'Review exclude patterns - they may be too broad',
      ],
      severity: 'warning',
      recoverable: false,
    },
    VALIDATION_FAILED: {
      message: 'Validation failed',
      suggestions: [
        'Review the validation errors above',
        'Run with --fix to attempt automatic fixes',
        'Check that your truthpack is up to date',
      ],
      severity: 'error',
      recoverable: false,
    },
    VALIDATION_TIMEOUT: {
      message: 'Validation operation timed out',
      suggestions: [
        'Try validating fewer files at once',
        'Check for infinite loops in your code',
        'Increase the timeout with --timeout option',
      ],
      severity: 'error',
      recoverable: true,
    },
    FILE_NOT_FOUND: {
      message: 'File not found',
      suggestions: [
        'Check that the file path is correct',
        'Ensure the file exists and has not been moved',
        'Verify case sensitivity of the filename',
      ],
      severity: 'error',
      recoverable: false,
    },
    FILE_READ_ERROR: {
      message: 'Failed to read file',
      suggestions: [
        'Check file permissions',
        'Ensure the file is not locked by another process',
        'Verify the file encoding is UTF-8',
      ],
      severity: 'error',
      recoverable: false,
    },
    FILE_WRITE_ERROR: {
      message: 'Failed to write file',
      suggestions: [
        'Check write permissions on the directory',
        'Ensure there is sufficient disk space',
        'Verify the file is not locked by another process',
      ],
      severity: 'error',
      recoverable: false,
    },
    PERMISSION_DENIED: {
      message: 'Permission denied',
      suggestions: [
        'Check file/directory permissions',
        'Run with appropriate privileges if necessary',
        'Verify ownership of the files',
      ],
      severity: 'error',
      recoverable: false,
    },
    DIRECTORY_NOT_FOUND: {
      message: 'Directory not found',
      suggestions: [
        'Check that the directory path is correct',
        'Create the directory if it should exist',
        'Verify case sensitivity of the path',
      ],
      severity: 'error',
      recoverable: false,
    },
    NETWORK_ERROR: {
      message: 'Network error occurred',
      suggestions: [
        'Check your internet connection',
        'Verify firewall settings',
        'Try again later',
      ],
      severity: 'error',
      recoverable: true,
    },
    NETWORK_TIMEOUT: {
      message: 'Network request timed out',
      suggestions: [
        'Check your internet connection',
        'Try again later',
        'Increase the timeout setting',
      ],
      severity: 'error',
      recoverable: true,
    },
    INTERRUPTED: {
      message: 'Operation was interrupted',
      suggestions: [
        'The process received a termination signal',
        'Run the command again to retry',
      ],
      severity: 'fatal',
      recoverable: false,
    },
    OUT_OF_MEMORY: {
      message: 'Out of memory',
      suggestions: [
        'Try processing fewer files at once',
        'Increase Node.js memory limit with --max-old-space-size',
        'Close other applications to free memory',
      ],
      severity: 'fatal',
      recoverable: false,
    },
    INVALID_INPUT: {
      message: 'Invalid input provided',
      suggestions: [
        'Check the command syntax with --help',
        'Verify all required arguments are provided',
        'Ensure argument values are valid',
      ],
      severity: 'error',
      recoverable: false,
    },
    UNSUPPORTED_OPERATION: {
      message: 'Operation is not supported',
      suggestions: [
        'Check the documentation for supported operations',
        'Verify you are using the correct command',
      ],
      severity: 'error',
      recoverable: false,
    },
    DEPENDENCY_MISSING: {
      message: 'Required dependency is missing',
      suggestions: [
        'Run `pnpm install` to install dependencies',
        'Check that the package is listed in package.json',
      ],
      severity: 'error',
      recoverable: true,
    },
    VERSION_MISMATCH: {
      message: 'Version mismatch detected',
      suggestions: [
        'Update to the latest version with `pnpm update`',
        'Check compatibility between packages',
      ],
      severity: 'warning',
      recoverable: true,
    },
    UNKNOWN_ERROR: {
      message: 'An unexpected error occurred',
      suggestions: [
        'Run with --verbose for more details',
        'Check the error message above',
        'Report this issue if it persists',
      ],
      severity: 'error',
      recoverable: false,
    },
  };

  return defaults[code];
}

/**
 * Type guard to check if an error is a VibeCheckError
 */
export function isVibeCheckError(error: unknown): error is VibeCheckError {
  return error instanceof VibeCheckError;
}

/**
 * Wrap unknown errors in VibeCheckError with automatic code detection
 */
export function wrapError(error: unknown, context?: ErrorContext): VibeCheckError {
  if (isVibeCheckError(error)) {
    return context ? error.withContext(context) : error;
  }

  if (error instanceof Error) {
    const code = detectErrorCode(error);
    return new VibeCheckError(error.message, code, {
      cause: error,
      context,
    });
  }

  return new VibeCheckError(String(error), 'UNKNOWN_ERROR', { context });
}

/**
 * Detect appropriate error code from native Error
 */
function detectErrorCode(error: Error): ErrorCode {
  const message = error.message.toLowerCase();
  const name = error.name;

  // Check for Node.js system errors
  if ('code' in error) {
    const code = (error as NodeJS.ErrnoException).code;
    switch (code) {
      case 'ENOENT':
        return 'FILE_NOT_FOUND';
      case 'EACCES':
      case 'EPERM':
        return 'PERMISSION_DENIED';
      case 'ENOTDIR':
        return 'DIRECTORY_NOT_FOUND';
      case 'EISDIR':
        return 'FILE_READ_ERROR';
      case 'ENOSPC':
        return 'FILE_WRITE_ERROR';
      case 'ETIMEDOUT':
      case 'ESOCKETTIMEDOUT':
        return 'NETWORK_TIMEOUT';
      case 'ECONNREFUSED':
      case 'ENOTFOUND':
        return 'NETWORK_ERROR';
    }
  }

  // Check for memory errors
  if (name === 'RangeError' && message.includes('memory')) {
    return 'OUT_OF_MEMORY';
  }

  // Check for timeout patterns
  if (message.includes('timeout') || message.includes('timed out')) {
    return 'NETWORK_TIMEOUT';
  }

  // Check for permission patterns
  if (message.includes('permission') || message.includes('access denied')) {
    return 'PERMISSION_DENIED';
  }

  // Check for parse errors
  if (message.includes('parse') || message.includes('syntax') || name === 'SyntaxError') {
    return 'CONFIG_PARSE_ERROR';
  }

  return 'UNKNOWN_ERROR';
}

/**
 * Create an error handler that can be used with process error events
 */
export function createErrorHandler(
  onError: (error: VibeCheckError) => void
): (error: unknown) => void {
  return (error: unknown) => {
    const wrapped = wrapError(error);
    onError(wrapped);
  };
}

/**
 * Retry an async operation with exponential backoff
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options?: {
    maxRetries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    shouldRetry?: (error: VibeCheckError) => boolean;
    onRetry?: (error: VibeCheckError, attempt: number) => void;
  }
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 3;
  const baseDelayMs = options?.baseDelayMs ?? 1000;
  const maxDelayMs = options?.maxDelayMs ?? 30000;
  const shouldRetry = options?.shouldRetry ?? ((err) => err.recoverable);

  let lastError: VibeCheckError | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = wrapError(error, {
        retryCount: attempt,
        maxRetries,
      });

      if (attempt === maxRetries || !shouldRetry(lastError)) {
        throw lastError;
      }

      options?.onRetry?.(lastError, attempt + 1);

      // Exponential backoff with jitter
      const delay = Math.min(
        baseDelayMs * Math.pow(2, attempt) + Math.random() * 1000,
        maxDelayMs
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Wrap an operation with a timeout
 */
export async function withTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
  errorCode: ErrorCode = 'VALIDATION_TIMEOUT'
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(VibeCheckError.fromCode(errorCode, `Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    operation()
      .then((result) => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(wrapError(error));
      });
  });
}

/**
 * Assert a condition, throwing a VibeCheckError if false
 */
export function assert(
  condition: unknown,
  message: string,
  code: ErrorCode = 'INVALID_INPUT'
): asserts condition {
  if (!condition) {
    throw new VibeCheckError(message, code);
  }
}

/**
 * Assert that a value is defined (not null or undefined)
 */
export function assertDefined<T>(
  value: T | null | undefined,
  message: string,
  code: ErrorCode = 'INVALID_INPUT'
): asserts value is T {
  if (value === null || value === undefined) {
    throw new VibeCheckError(message, code);
  }
}
