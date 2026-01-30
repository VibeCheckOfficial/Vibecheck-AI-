/**
 * Error Handler
 * 
 * Sanitizes errors to prevent information disclosure while maintaining
 * actionable error codes for debugging.
 */

export enum ErrorCode {
  // Path errors
  PATH_INVALID = 'E_PATH_INVALID',
  PATH_TRAVERSAL = 'E_PATH_TRAVERSAL',
  PATH_TOO_LONG = 'E_PATH_TOO_LONG',
  PATH_NOT_ALLOWED = 'E_PATH_NOT_ALLOWED',
  
  // Input errors
  INPUT_TYPE_INVALID = 'E_INPUT_TYPE_INVALID',
  CONTENT_SIZE_EXCEEDED = 'E_CONTENT_SIZE_EXCEEDED',
  STRING_LENGTH_EXCEEDED = 'E_STRING_LENGTH_EXCEEDED',
  ARRAY_SIZE_EXCEEDED = 'E_ARRAY_SIZE_EXCEEDED',
  OBJECT_DEPTH_EXCEEDED = 'E_OBJECT_DEPTH_EXCEEDED',
  
  // Rate limiting
  RATE_LIMIT_EXCEEDED = 'E_RATE_LIMIT_EXCEEDED',
  
  // Timeout
  TIMEOUT = 'E_TIMEOUT',
  
  // Regex
  REGEX_INVALID = 'E_REGEX_INVALID',
  REGEX_COMPLEXITY_EXCEEDED = 'E_REGEX_COMPLEXITY_EXCEEDED',
  
  // Concurrency
  CONCURRENCY_LIMIT_EXCEEDED = 'E_CONCURRENCY_LIMIT_EXCEEDED',
  
  // Generic
  INTERNAL_ERROR = 'E_INTERNAL_ERROR',
  VALIDATION_ERROR = 'E_VALIDATION_ERROR',
}

export interface SanitizedError {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export class ErrorHandler {
  private readonly logErrors: boolean;
  private readonly errorLogger?: (error: Error, context: Record<string, unknown>) => void;

  constructor(options: {
    logErrors?: boolean;
    errorLogger?: (error: Error, context: Record<string, unknown>) => void;
  } = {}) {
    this.logErrors = options.logErrors ?? true;
    this.errorLogger = options.errorLogger;
  }

  /**
   * Sanitize an error for client response
   */
  sanitize(error: unknown, context: Record<string, unknown> = {}): SanitizedError {
    // Log the full error server-side
    if (this.logErrors && error instanceof Error) {
      this.logError(error, context);
    }

    // Handle known error codes
    if (error && typeof error === 'object' && 'errorCode' in error) {
      const errorCode = error.errorCode as ErrorCode;
      const message = this.getErrorMessage(errorCode, error);
      return {
        code: errorCode,
        message,
        details: this.sanitizeDetails(error, context),
      };
    }

    // Handle Error instances
    if (error instanceof Error) {
      // Check if it's a known error type
      const code = this.inferErrorCode(error);
      return {
        code,
        message: this.getErrorMessage(code, error),
        details: this.sanitizeDetails(error, context),
      };
    }

    // Unknown error
    return {
      code: ErrorCode.INTERNAL_ERROR,
      message: 'An internal error occurred',
    };
  }

  /**
   * Infer error code from error message
   */
  private inferErrorCode(error: Error): ErrorCode {
    const message = error.message.toLowerCase();

    if (message.includes('path') || message.includes('file')) {
      if (message.includes('traversal') || message.includes('..')) {
        return ErrorCode.PATH_TRAVERSAL;
      }
      if (message.includes('too long') || message.includes('length')) {
        return ErrorCode.PATH_TOO_LONG;
      }
      return ErrorCode.PATH_INVALID;
    }

    if (message.includes('size') || message.includes('exceed')) {
      return ErrorCode.CONTENT_SIZE_EXCEEDED;
    }

    if (message.includes('timeout')) {
      return ErrorCode.TIMEOUT;
    }

    if (message.includes('rate limit')) {
      return ErrorCode.RATE_LIMIT_EXCEEDED;
    }

    if (message.includes('regex')) {
      return ErrorCode.REGEX_INVALID;
    }

    return ErrorCode.INTERNAL_ERROR;
  }

  /**
   * Get user-friendly error message
   */
  private getErrorMessage(code: ErrorCode, error: unknown): string {
    const messages: Record<ErrorCode, string> = {
      [ErrorCode.PATH_INVALID]: 'Invalid file path provided',
      [ErrorCode.PATH_TRAVERSAL]: 'Path traversal attempt detected',
      [ErrorCode.PATH_TOO_LONG]: 'File path exceeds maximum length',
      [ErrorCode.PATH_NOT_ALLOWED]: 'File path not in allowed directories',
      [ErrorCode.INPUT_TYPE_INVALID]: 'Invalid input type',
      [ErrorCode.CONTENT_SIZE_EXCEEDED]: 'Content size exceeds maximum allowed',
      [ErrorCode.STRING_LENGTH_EXCEEDED]: 'String length exceeds maximum allowed',
      [ErrorCode.ARRAY_SIZE_EXCEEDED]: 'Array size exceeds maximum allowed',
      [ErrorCode.OBJECT_DEPTH_EXCEEDED]: 'Object depth exceeds maximum allowed',
      [ErrorCode.RATE_LIMIT_EXCEEDED]: 'Rate limit exceeded. Please try again later.',
      [ErrorCode.TIMEOUT]: 'Operation timed out',
      [ErrorCode.REGEX_INVALID]: 'Invalid regex pattern',
      [ErrorCode.REGEX_COMPLEXITY_EXCEEDED]: 'Regex pattern too complex',
      [ErrorCode.CONCURRENCY_LIMIT_EXCEEDED]: 'Too many concurrent operations',
      [ErrorCode.INTERNAL_ERROR]: 'An internal error occurred',
      [ErrorCode.VALIDATION_ERROR]: 'Validation failed',
    };

    return messages[code] || messages[ErrorCode.INTERNAL_ERROR];
  }

  /**
   * Sanitize error details to remove sensitive information
   */
  private sanitizeDetails(error: unknown, context: Record<string, unknown>): Record<string, unknown> | undefined {
    const details: Record<string, unknown> = {};

    // Add safe context information
    if (context.tool) {
      details.tool = context.tool;
    }

    // Never include:
    // - File paths
    // - Stack traces
    // - Internal error messages
    // - User input (may contain secrets)

    // Add size information if relevant
    if (error && typeof error === 'object' && 'error' in error) {
      const errorMessage = String(error.error);
      if (errorMessage.includes('size') || errorMessage.includes('exceed')) {
        // Extract numeric values if safe
        const sizeMatch = errorMessage.match(/\d+/);
        if (sizeMatch) {
          details.maxSize = sizeMatch[0];
        }
      }
    }

    return Object.keys(details).length > 0 ? details : undefined;
  }

  /**
   * Log error server-side
   */
  private logError(error: Error, context: Record<string, unknown>): void {
    if (this.errorLogger) {
      this.errorLogger(error, context);
    } else {
      // Default logging to stderr
      const logContext = {
        ...context,
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack, // Include stack in server logs
        },
        timestamp: new Date().toISOString(),
      };
      console.error('[MCP Server Error]', JSON.stringify(logContext, null, 2));
    }
  }

  /**
   * Create a sanitized error response for MCP
   */
  createErrorResponse(error: unknown, context: Record<string, unknown> = {}): {
    content: Array<{ type: 'text'; text: string }>;
  } {
    const sanitized = this.sanitize(error, context);
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: false,
          error: {
            code: sanitized.code,
            message: sanitized.message,
            ...(sanitized.details && { details: sanitized.details }),
          },
        }, null, 2),
      }],
    };
  }
}

/**
 * Create error handler instance
 */
export function createErrorHandler(options?: {
  logErrors?: boolean;
  errorLogger?: (error: Error, context: Record<string, unknown>) => void;
}): ErrorHandler {
  return new ErrorHandler(options);
}
