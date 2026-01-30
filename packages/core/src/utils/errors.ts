/**
 * Custom Error Classes
 * 
 * Provides structured error handling with error codes, context, and recovery hints.
 */

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'FIREWALL_BLOCKED'
  | 'EVIDENCE_NOT_FOUND'
  | 'TRUTHPACK_LOAD_FAILED'
  | 'CONFIG_INVALID'
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'PERMISSION_DENIED'
  | 'RESOURCE_NOT_FOUND'
  | 'NETWORK_ERROR'
  | 'PARSE_ERROR'
  | 'INTERNAL_ERROR'
  | 'DEPENDENCY_MISSING'
  | 'OPERATION_CANCELLED';

export interface ErrorContext {
  code: ErrorCode;
  component: string;
  operation: string;
  details?: Record<string, unknown>;
  recoveryHint?: string;
  retryable?: boolean;
}

/**
 * Base error class for all VibeCheck errors
 */
export class VibeCheckError extends Error {
  public readonly code: ErrorCode;
  public readonly component: string;
  public readonly operation: string;
  public readonly details: Record<string, unknown>;
  public readonly recoveryHint?: string;
  public readonly retryable: boolean;
  public readonly timestamp: Date;
  public readonly cause?: Error;

  constructor(message: string, context: ErrorContext, cause?: Error) {
    super(message);
    this.name = 'VibeCheckError';
    this.code = context.code;
    this.component = context.component;
    this.operation = context.operation;
    this.details = context.details ?? {};
    this.recoveryHint = context.recoveryHint;
    this.retryable = context.retryable ?? false;
    this.timestamp = new Date();
    this.cause = cause;

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, VibeCheckError);
    }
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      component: this.component,
      operation: this.operation,
      details: this.details,
      recoveryHint: this.recoveryHint,
      retryable: this.retryable,
      timestamp: this.timestamp.toISOString(),
      stack: this.stack,
      cause: this.cause?.message,
    };
  }

  toString(): string {
    return `[${this.code}] ${this.component}.${this.operation}: ${this.message}`;
  }
}

/**
 * Validation error for invalid inputs
 */
export class ValidationError extends VibeCheckError {
  public readonly field?: string;
  public readonly value?: unknown;
  public readonly constraints?: string[];

  constructor(
    message: string,
    options: {
      component: string;
      operation: string;
      field?: string;
      value?: unknown;
      constraints?: string[];
      recoveryHint?: string;
    }
  ) {
    super(message, {
      code: 'VALIDATION_ERROR',
      component: options.component,
      operation: options.operation,
      details: { field: options.field, constraints: options.constraints },
      recoveryHint: options.recoveryHint ?? `Check the ${options.field ?? 'input'} value`,
      retryable: false,
    });
    this.name = 'ValidationError';
    this.field = options.field;
    this.value = options.value;
    this.constraints = options.constraints;
  }
}

/**
 * Firewall block error
 */
export class FirewallBlockedError extends VibeCheckError {
  public readonly violations: Array<{ policy: string; message: string; severity: string }>;
  public readonly auditId: string;

  constructor(
    message: string,
    options: {
      component: string;
      violations: Array<{ policy: string; message: string; severity: string }>;
      auditId: string;
      recoveryHint?: string;
    }
  ) {
    super(message, {
      code: 'FIREWALL_BLOCKED',
      component: options.component,
      operation: 'evaluate',
      details: { violationCount: options.violations.length, auditId: options.auditId },
      recoveryHint: options.recoveryHint ?? 'Review the violations and fix the identified issues',
      retryable: false,
    });
    this.name = 'FirewallBlockedError';
    this.violations = options.violations;
    this.auditId = options.auditId;
  }
}

/**
 * Timeout error
 */
export class TimeoutError extends VibeCheckError {
  public readonly timeoutMs: number;
  public readonly elapsed: number;

  constructor(
    message: string,
    options: {
      component: string;
      operation: string;
      timeoutMs: number;
      elapsed: number;
    }
  ) {
    super(message, {
      code: 'TIMEOUT',
      component: options.component,
      operation: options.operation,
      details: { timeoutMs: options.timeoutMs, elapsed: options.elapsed },
      recoveryHint: 'Consider increasing timeout or optimizing the operation',
      retryable: true,
    });
    this.name = 'TimeoutError';
    this.timeoutMs = options.timeoutMs;
    this.elapsed = options.elapsed;
  }
}

/**
 * Resource not found error
 */
export class ResourceNotFoundError extends VibeCheckError {
  public readonly resourceType: string;
  public readonly resourceId: string;

  constructor(
    message: string,
    options: {
      component: string;
      operation: string;
      resourceType: string;
      resourceId: string;
      recoveryHint?: string;
    }
  ) {
    super(message, {
      code: 'RESOURCE_NOT_FOUND',
      component: options.component,
      operation: options.operation,
      details: { resourceType: options.resourceType, resourceId: options.resourceId },
      recoveryHint: options.recoveryHint ?? `Verify the ${options.resourceType} exists`,
      retryable: false,
    });
    this.name = 'ResourceNotFoundError';
    this.resourceType = options.resourceType;
    this.resourceId = options.resourceId;
  }
}

/**
 * Configuration error
 */
export class ConfigError extends VibeCheckError {
  public readonly configKey?: string;

  constructor(
    message: string,
    options: {
      component: string;
      configKey?: string;
      recoveryHint?: string;
    }
  ) {
    super(message, {
      code: 'CONFIG_INVALID',
      component: options.component,
      operation: 'configure',
      details: { configKey: options.configKey },
      recoveryHint: options.recoveryHint ?? 'Check configuration values',
      retryable: false,
    });
    this.name = 'ConfigError';
    this.configKey = options.configKey;
  }
}

// ============================================================================
// New Module Error Classes (Vibecheck-4 Integration)
// ============================================================================

/**
 * Checkpoint system error
 */
export class CheckpointError extends VibeCheckError {
  public readonly checkpointId?: string;

  constructor(
    message: string,
    options: {
      operation: string;
      checkpointId?: string;
      details?: Record<string, unknown>;
      recoveryHint?: string;
      cause?: Error;
    }
  ) {
    super(message, {
      code: 'INTERNAL_ERROR',
      component: 'Checkpoint',
      operation: options.operation,
      details: { checkpointId: options.checkpointId, ...options.details },
      recoveryHint: options.recoveryHint,
      retryable: false,
    }, options.cause);
    this.name = 'CheckpointError';
    this.checkpointId = options.checkpointId;
  }
}

/**
 * Secrets scanner error
 */
export class SecretsError extends VibeCheckError {
  public readonly filePath?: string;

  constructor(
    message: string,
    options: {
      operation: string;
      filePath?: string;
      details?: Record<string, unknown>;
      recoveryHint?: string;
      cause?: Error;
    }
  ) {
    super(message, {
      code: 'INTERNAL_ERROR',
      component: 'Secrets',
      operation: options.operation,
      details: { filePath: options.filePath, ...options.details },
      recoveryHint: options.recoveryHint,
      retryable: false,
    }, options.cause);
    this.name = 'SecretsError';
    this.filePath = options.filePath;
  }
}

/**
 * Formatter error (SARIF, HTML, etc.)
 */
export class FormatterError extends VibeCheckError {
  public readonly format?: string;

  constructor(
    message: string,
    options: {
      operation: string;
      format?: string;
      details?: Record<string, unknown>;
      recoveryHint?: string;
      cause?: Error;
    }
  ) {
    super(message, {
      code: 'INTERNAL_ERROR',
      component: 'Formatter',
      operation: options.operation,
      details: { format: options.format, ...options.details },
      recoveryHint: options.recoveryHint,
      retryable: false,
    }, options.cause);
    this.name = 'FormatterError';
    this.format = options.format;
  }
}

/**
 * CLI Registry error
 */
export class RegistryError extends VibeCheckError {
  public readonly commandName?: string;

  constructor(
    message: string,
    options: {
      operation: string;
      commandName?: string;
      details?: Record<string, unknown>;
      recoveryHint?: string;
    }
  ) {
    super(message, {
      code: 'INTERNAL_ERROR',
      component: 'Registry',
      operation: options.operation,
      details: { commandName: options.commandName, ...options.details },
      recoveryHint: options.recoveryHint,
      retryable: false,
    });
    this.name = 'RegistryError';
    this.commandName = options.commandName;
  }
}

/**
 * Visualization error
 */
export class VisualizationError extends VibeCheckError {
  public readonly outputFormat?: string;

  constructor(
    message: string,
    options: {
      operation: string;
      outputFormat?: string;
      details?: Record<string, unknown>;
      recoveryHint?: string;
      cause?: Error;
    }
  ) {
    super(message, {
      code: 'INTERNAL_ERROR',
      component: 'Visualization',
      operation: options.operation,
      details: { outputFormat: options.outputFormat, ...options.details },
      recoveryHint: options.recoveryHint,
      retryable: false,
    }, options.cause);
    this.name = 'VisualizationError';
    this.outputFormat = options.outputFormat;
  }
}

/**
 * Check if an error is a VibeCheckError
 */
export function isVibeCheckError(error: unknown): error is VibeCheckError {
  return error instanceof VibeCheckError;
}

/**
 * Wrap unknown errors in a VibeCheckError
 */
export function wrapError(
  error: unknown,
  context: { component: string; operation: string }
): VibeCheckError {
  if (isVibeCheckError(error)) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  const cause = error instanceof Error ? error : undefined;

  return new VibeCheckError(message, {
    code: 'INTERNAL_ERROR',
    component: context.component,
    operation: context.operation,
    retryable: false,
  }, cause);
}

/**
 * Assert a condition and throw if false
 */
export function assertCondition(
  condition: boolean,
  message: string,
  context: { component: string; operation: string; code?: ErrorCode }
): asserts condition {
  if (!condition) {
    throw new VibeCheckError(message, {
      code: context.code ?? 'VALIDATION_ERROR',
      component: context.component,
      operation: context.operation,
    });
  }
}
