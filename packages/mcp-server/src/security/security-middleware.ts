/**
 * Security Middleware
 * 
 * Wraps tool execution with comprehensive security checks.
 * 
 * Features:
 * - Multi-tier rate limiting
 * - Input validation with size limits
 * - Path traversal prevention
 * - ReDoS protection for regex patterns
 * - Concurrency limiting
 * - Timeout protection
 * - Security event logging
 * - Metrics collection
 */

import {
  PathValidator,
  createPathValidator,
  type PathValidationResult,
} from './path-validator.js';
import {
  InputValidator,
  createInputValidator,
  type InputValidationResult,
} from './input-validator.js';
import {
  MultiTierRateLimiter,
  createDefaultRateLimiter,
  type RateLimitResult,
} from './rate-limiter.js';
import {
  ErrorHandler,
  createErrorHandler,
  ErrorCode,
  type SanitizedError,
} from './error-handler.js';
import {
  withToolTimeout,
  withFileTimeout,
  withGlobTimeout,
  TimeoutError,
} from './timeout-wrapper.js';
import {
  RegexValidator,
  createRegexValidator,
  type RegexValidationResult,
} from './regex-validator.js';
import {
  ConcurrencyLimiter,
  createConcurrencyLimiter,
} from './concurrency-limiter.js';

export interface SecurityConfig {
  projectRoot: string;
  allowedDirs?: string[];
  rateLimiting?: boolean;
  inputValidation?: boolean;
  pathValidation?: boolean;
  timeout?: boolean;
  concurrencyLimiting?: boolean;
  logging?: boolean;
  metricsEnabled?: boolean;
  strictMode?: boolean;
}

export interface SecurityContext {
  clientId: string;
  toolName: string;
  parameters: Record<string, unknown>;
  timestamp?: number;
  correlationId?: string;
}

export interface SecurityResult {
  allowed: boolean;
  error?: SanitizedError;
  rateLimit?: RateLimitResult;
  validationErrors?: string[];
  duration?: number;
}

export interface SecurityMetrics {
  totalRequests: number;
  allowedRequests: number;
  blockedRequests: number;
  rateLimitedRequests: number;
  validationFailures: number;
  pathTraversalAttempts: number;
  timeoutCount: number;
  averageValidationTime: number;
  byTool: Record<string, { allowed: number; blocked: number }>;
}

export interface SecurityEvent {
  timestamp: Date;
  type: SecurityEventType;
  clientId: string;
  toolName: string;
  details: Record<string, unknown>;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export type SecurityEventType =
  | 'rate_limit'
  | 'validation_failure'
  | 'path_traversal'
  | 'regex_dos'
  | 'timeout'
  | 'input_size_exceeded'
  | 'blocked_pattern'
  | 'suspicious_activity';

// Dangerous patterns to block
const DANGEROUS_PATTERNS = [
  /\beval\s*\(/i,
  /\bnew\s+Function\s*\(/i,
  /\bprocess\.env\b.*=/, // env manipulation
  /\brequire\s*\(\s*[^'"]/i, // dynamic require
  /\bchild_process\b/i,
  /\bfs\.(?:unlink|rmdir|rm)Sync?\s*\(/i,
  /\bexec(?:Sync)?\s*\(/i,
  /rm\s+-rf\s+[\/~]/i,
  />\s*\/dev\/(?:sd|hd|nvme)/i, // disk writes
  /\bsudo\b/i,
];

// Suspicious patterns to warn about
const SUSPICIOUS_PATTERNS = [
  /password\s*[:=]/i,
  /api[_-]?key\s*[:=]/i,
  /secret\s*[:=]/i,
  /token\s*[:=]/i,
  /\.env\b/,
  /credentials/i,
];

export class SecurityMiddleware {
  private readonly pathValidator: PathValidator;
  private readonly inputValidator: InputValidator;
  private readonly rateLimiter: MultiTierRateLimiter;
  private readonly errorHandler: ErrorHandler;
  private readonly regexValidator: RegexValidator;
  private readonly concurrencyLimiter: ConcurrencyLimiter;
  private readonly config: Required<SecurityConfig>;
  private readonly metrics: SecurityMetrics;
  private readonly eventLog: SecurityEvent[] = [];
  private readonly maxEventLogSize = 1000;
  private validationTimeSum = 0;
  private validationCount = 0;

  constructor(config: SecurityConfig) {
    this.config = {
      projectRoot: config.projectRoot,
      allowedDirs: config.allowedDirs ?? [],
      rateLimiting: config.rateLimiting ?? true,
      inputValidation: config.inputValidation ?? true,
      pathValidation: config.pathValidation ?? true,
      timeout: config.timeout ?? true,
      concurrencyLimiting: config.concurrencyLimiting ?? true,
      logging: config.logging ?? true,
      metricsEnabled: config.metricsEnabled ?? true,
      strictMode: config.strictMode ?? false,
    };

    this.pathValidator = createPathValidator(
      this.config.projectRoot,
      this.config.allowedDirs
    );
    this.inputValidator = createInputValidator();
    this.rateLimiter = createDefaultRateLimiter();
    this.errorHandler = createErrorHandler();
    this.regexValidator = createRegexValidator();
    this.concurrencyLimiter = createConcurrencyLimiter();

    this.metrics = {
      totalRequests: 0,
      allowedRequests: 0,
      blockedRequests: 0,
      rateLimitedRequests: 0,
      validationFailures: 0,
      pathTraversalAttempts: 0,
      timeoutCount: 0,
      averageValidationTime: 0,
      byTool: {},
    };
  }

  /**
   * Validate a tool call before execution
   */
  async validate(context: SecurityContext): Promise<SecurityResult> {
    const startTime = performance.now();
    const validationErrors: string[] = [];

    try {
      this.metrics.totalRequests++;
      this.initToolMetrics(context.toolName);

      // 1. Rate limiting
      if (this.config.rateLimiting) {
        const rateLimitResult = this.rateLimiter.check(context.clientId, context.toolName);
        if (!rateLimitResult.allowed) {
          this.metrics.rateLimitedRequests++;
          this.metrics.blockedRequests++;
          this.metrics.byTool[context.toolName].blocked++;
          
          this.logSecurityEvent({
            type: 'rate_limit',
            clientId: context.clientId,
            toolName: context.toolName,
            details: { remaining: rateLimitResult.remaining, resetTime: rateLimitResult.resetTime },
            severity: 'medium',
          });

          return {
            allowed: false,
            rateLimit: rateLimitResult,
            error: this.errorHandler.sanitize(
              new Error(`Rate limit exceeded. Try again in ${Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000)}s`),
              { tool: context.toolName, code: ErrorCode.RATE_LIMIT_EXCEEDED }
            ),
            duration: performance.now() - startTime,
          };
        }
      }

      // 2. Input validation
      if (this.config.inputValidation) {
        const inputResult = this.inputValidator.validateToolParams(context.parameters);
        if (!inputResult.valid) {
          validationErrors.push(inputResult.error ?? 'Input validation failed');
          this.metrics.validationFailures++;
          this.metrics.blockedRequests++;
          this.metrics.byTool[context.toolName].blocked++;

          this.logSecurityEvent({
            type: 'input_size_exceeded',
            clientId: context.clientId,
            toolName: context.toolName,
            details: { error: inputResult.error, errorCode: inputResult.errorCode },
            severity: 'low',
          });

          return {
            allowed: false,
            validationErrors,
            error: this.errorHandler.sanitize(
              new Error(inputResult.error ?? 'Input validation failed'),
              { tool: context.toolName, code: inputResult.errorCode as ErrorCode }
            ),
            duration: performance.now() - startTime,
          };
        }
      }

      // 3. Path validation for file-related tools
      if (this.config.pathValidation) {
        const pathResult = await this.validatePaths(context);
        if (!pathResult.valid) {
          validationErrors.push(pathResult.error ?? 'Path validation failed');
          
          if (pathResult.errorCode === 'E_PATH_TRAVERSAL') {
            this.metrics.pathTraversalAttempts++;
            this.logSecurityEvent({
              type: 'path_traversal',
              clientId: context.clientId,
              toolName: context.toolName,
              details: { error: pathResult.error },
              severity: 'critical',
            });
          }

          this.metrics.validationFailures++;
          this.metrics.blockedRequests++;
          this.metrics.byTool[context.toolName].blocked++;

          return {
            allowed: false,
            validationErrors,
            error: this.errorHandler.sanitize(
              new Error(pathResult.error ?? 'Path validation failed'),
              { tool: context.toolName, code: pathResult.errorCode as ErrorCode }
            ),
            duration: performance.now() - startTime,
          };
        }
      }

      // 4. Regex validation for filter parameters
      const regexResult = await this.validateRegex(context);
      if (!regexResult.valid) {
        validationErrors.push(regexResult.error ?? 'Regex validation failed');
        
        this.logSecurityEvent({
          type: 'regex_dos',
          clientId: context.clientId,
          toolName: context.toolName,
          details: { error: regexResult.error },
          severity: 'high',
        });

        this.metrics.validationFailures++;
        this.metrics.blockedRequests++;
        this.metrics.byTool[context.toolName].blocked++;

        return {
          allowed: false,
          validationErrors,
          error: this.errorHandler.sanitize(
            new Error(regexResult.error ?? 'Regex validation failed'),
            { tool: context.toolName, code: regexResult.errorCode as ErrorCode }
          ),
          duration: performance.now() - startTime,
        };
      }

      // 5. Dangerous pattern detection
      const dangerousResult = this.checkDangerousPatterns(context);
      if (!dangerousResult.safe) {
        validationErrors.push(dangerousResult.error ?? 'Dangerous pattern detected');
        
        this.logSecurityEvent({
          type: 'blocked_pattern',
          clientId: context.clientId,
          toolName: context.toolName,
          details: { pattern: dangerousResult.pattern },
          severity: 'critical',
        });

        this.metrics.validationFailures++;
        this.metrics.blockedRequests++;
        this.metrics.byTool[context.toolName].blocked++;

        return {
          allowed: false,
          validationErrors,
          error: this.errorHandler.sanitize(
            new Error(dangerousResult.error ?? 'Dangerous pattern detected'),
            { tool: context.toolName, code: ErrorCode.VALIDATION_ERROR }
          ),
          duration: performance.now() - startTime,
        };
      }

      // 6. Suspicious pattern detection (warning only in non-strict mode)
      const suspiciousResult = this.checkSuspiciousPatterns(context);
      if (!suspiciousResult.safe) {
        if (this.config.strictMode) {
          validationErrors.push(suspiciousResult.error ?? 'Suspicious pattern detected');
          
          this.metrics.validationFailures++;
          this.metrics.blockedRequests++;
          this.metrics.byTool[context.toolName].blocked++;

          return {
            allowed: false,
            validationErrors,
            error: this.errorHandler.sanitize(
              new Error(suspiciousResult.error ?? 'Suspicious pattern detected'),
              { tool: context.toolName, code: ErrorCode.VALIDATION_ERROR }
            ),
            duration: performance.now() - startTime,
          };
        } else {
          // Log warning but allow
          this.logSecurityEvent({
            type: 'suspicious_activity',
            clientId: context.clientId,
            toolName: context.toolName,
            details: { pattern: suspiciousResult.pattern, warning: true },
            severity: 'medium',
          });
        }
      }

      // Success
      this.metrics.allowedRequests++;
      this.metrics.byTool[context.toolName].allowed++;
      this.updateValidationTime(performance.now() - startTime);

      return {
        allowed: true,
        duration: performance.now() - startTime,
      };
    } catch (error) {
      this.metrics.blockedRequests++;
      
      return {
        allowed: false,
        error: this.errorHandler.sanitize(error, { tool: context.toolName }),
        duration: performance.now() - startTime,
      };
    }
  }

  /**
   * Check for dangerous patterns in content
   */
  private checkDangerousPatterns(context: SecurityContext): { safe: boolean; error?: string; pattern?: string } {
    const contentFields = ['content', 'code', 'prompt', 'generatedCode', 'command'];
    
    for (const field of contentFields) {
      if (field in context.parameters && typeof context.parameters[field] === 'string') {
        const content = context.parameters[field] as string;
        
        for (const pattern of DANGEROUS_PATTERNS) {
          if (pattern.test(content)) {
            return {
              safe: false,
              error: `Dangerous pattern detected: ${pattern.source.slice(0, 30)}...`,
              pattern: pattern.source,
            };
          }
        }
      }
    }

    return { safe: true };
  }

  /**
   * Check for suspicious patterns in content
   */
  private checkSuspiciousPatterns(context: SecurityContext): { safe: boolean; error?: string; pattern?: string } {
    const contentFields = ['content', 'code', 'prompt', 'generatedCode'];
    
    for (const field of contentFields) {
      if (field in context.parameters && typeof context.parameters[field] === 'string') {
        const content = context.parameters[field] as string;
        
        for (const pattern of SUSPICIOUS_PATTERNS) {
          if (pattern.test(content)) {
            return {
              safe: false,
              error: `Suspicious pattern detected: possible credential exposure`,
              pattern: pattern.source,
            };
          }
        }
      }
    }

    return { safe: true };
  }

  /**
   * Validate paths in parameters
   */
  private async validatePaths(context: SecurityContext): Promise<PathValidationResult> {
    const pathFields = ['filePath', 'targetFile', 'target', 'file', 'rootPath', 'path', 'directory'];
    
    for (const field of pathFields) {
      if (field in context.parameters && typeof context.parameters[field] === 'string') {
        const pathValue = context.parameters[field] as string;
        const result = await this.pathValidator.validate(pathValue, false);
        if (!result.valid) {
          return result;
        }
      }
    }

    // Validate arrays of paths
    const pathArrayFields = ['targetFiles', 'allowedPaths', 'excludedPaths', 'files', 'paths'];
    for (const field of pathArrayFields) {
      if (field in context.parameters && Array.isArray(context.parameters[field])) {
        const paths = context.parameters[field] as unknown[];
        for (const pathValue of paths) {
          if (typeof pathValue === 'string') {
            const result = await this.pathValidator.validate(pathValue, false);
            if (!result.valid) {
              return result;
            }
          }
        }
      }
    }

    return { valid: true, normalizedPath: null };
  }

  /**
   * Validate regex patterns in parameters
   */
  private async validateRegex(context: SecurityContext): Promise<RegexValidationResult> {
    const regexFields = ['filter', 'pattern', 'regex', 'match', 'search'];
    
    for (const field of regexFields) {
      if (field in context.parameters && typeof context.parameters[field] === 'string') {
        const pattern = context.parameters[field] as string;
        const result = this.regexValidator.validate(pattern);
        if (!result.valid) {
          return result;
        }
      }
    }

    return { valid: true };
  }

  /**
   * Wrap tool execution with security checks
   */
  async wrapToolExecution<T>(
    context: SecurityContext,
    fn: () => Promise<T>
  ): Promise<T> {
    // Validate first
    const validation = await this.validate(context);
    if (!validation.allowed) {
      throw new Error(validation.error?.message ?? 'Security validation failed');
    }

    // Execute with concurrency limiting and timeout
    const operationId = `${context.clientId}-${context.toolName}-${Date.now()}`;
    
    try {
      if (this.config.concurrencyLimiting) {
        return await this.concurrencyLimiter.withLimit('tool', operationId, async () => {
          if (this.config.timeout) {
            return await withToolTimeout(fn);
          }
          return await fn();
        });
      } else if (this.config.timeout) {
        return await withToolTimeout(fn);
      } else {
        return await fn();
      }
    } catch (error) {
      if (error instanceof TimeoutError) {
        this.metrics.timeoutCount++;
        this.logSecurityEvent({
          type: 'timeout',
          clientId: context.clientId,
          toolName: context.toolName,
          details: { error: error.message },
          severity: 'low',
        });
        throw this.errorHandler.sanitize(error, { tool: context.toolName });
      }
      throw error;
    }
  }

  /**
   * Wrap file operation with security checks
   */
  async wrapFileOperation<T>(
    filePath: string,
    fn: () => Promise<T>,
    clientId = 'system'
  ): Promise<T> {
    // Validate path
    if (this.config.pathValidation) {
      const pathResult = await this.pathValidator.validate(filePath, false);
      if (!pathResult.valid) {
        this.logSecurityEvent({
          type: 'path_traversal',
          clientId,
          toolName: 'file_operation',
          details: { path: filePath, error: pathResult.error },
          severity: 'critical',
        });
        throw new Error(pathResult.error ?? 'Path validation failed');
      }
    }

    // Execute with concurrency limiting and timeout
    const operationId = `file-${Date.now()}`;
    
    if (this.config.concurrencyLimiting) {
      return await this.concurrencyLimiter.withLimit('file', operationId, async () => {
        if (this.config.timeout) {
          return await withFileTimeout(fn);
        }
        return await fn();
      });
    } else if (this.config.timeout) {
      return await withFileTimeout(fn);
    } else {
      return await fn();
    }
  }

  /**
   * Wrap glob operation with security checks
   */
  async wrapGlobOperation<T>(
    fn: () => Promise<T>
  ): Promise<T> {
    const operationId = `glob-${Date.now()}`;
    
    if (this.config.concurrencyLimiting) {
      return await this.concurrencyLimiter.withLimit('glob', operationId, async () => {
        if (this.config.timeout) {
          return await withGlobTimeout(fn);
        }
        return await fn();
      });
    } else if (this.config.timeout) {
      return await withGlobTimeout(fn);
    } else {
      return await fn();
    }
  }

  /**
   * Log a security event
   */
  private logSecurityEvent(event: Omit<SecurityEvent, 'timestamp'>): void {
    if (!this.config.logging) return;

    const fullEvent: SecurityEvent = {
      ...event,
      timestamp: new Date(),
    };

    this.eventLog.push(fullEvent);

    // Trim log if too large
    if (this.eventLog.length > this.maxEventLogSize) {
      this.eventLog.splice(0, this.eventLog.length - this.maxEventLogSize);
    }

    // Log critical events to console
    if (event.severity === 'critical' || event.severity === 'high') {
      console.warn(`[SECURITY] ${event.type}: ${event.toolName} by ${event.clientId}`, event.details);
    }
  }

  /**
   * Initialize metrics for a tool
   */
  private initToolMetrics(toolName: string): void {
    if (!this.metrics.byTool[toolName]) {
      this.metrics.byTool[toolName] = { allowed: 0, blocked: 0 };
    }
  }

  /**
   * Update average validation time
   */
  private updateValidationTime(duration: number): void {
    this.validationTimeSum += duration;
    this.validationCount++;
    this.metrics.averageValidationTime = this.validationTimeSum / this.validationCount;
  }

  /**
   * Get security metrics
   */
  getMetrics(): Readonly<SecurityMetrics> {
    return { ...this.metrics };
  }

  /**
   * Get recent security events
   */
  getSecurityEvents(limit = 100, severity?: SecurityEvent['severity']): SecurityEvent[] {
    let events = this.eventLog.slice(-limit);
    if (severity) {
      events = events.filter(e => e.severity === severity);
    }
    return events;
  }

  /**
   * Get error handler for creating error responses
   */
  getErrorHandler(): ErrorHandler {
    return this.errorHandler;
  }

  /**
   * Get path validator
   */
  getPathValidator(): PathValidator {
    return this.pathValidator;
  }

  /**
   * Get rate limiter
   */
  getRateLimiter(): MultiTierRateLimiter {
    return this.rateLimiter;
  }

  /**
   * Get input validator
   */
  getInputValidator(): InputValidator {
    return this.inputValidator;
  }

  /**
   * Reset metrics (useful for testing)
   */
  resetMetrics(): void {
    this.metrics.totalRequests = 0;
    this.metrics.allowedRequests = 0;
    this.metrics.blockedRequests = 0;
    this.metrics.rateLimitedRequests = 0;
    this.metrics.validationFailures = 0;
    this.metrics.pathTraversalAttempts = 0;
    this.metrics.timeoutCount = 0;
    this.metrics.averageValidationTime = 0;
    this.metrics.byTool = {};
    this.validationTimeSum = 0;
    this.validationCount = 0;
  }

  /**
   * Clear event log
   */
  clearEventLog(): void {
    this.eventLog.length = 0;
  }
}

/**
 * Create security middleware instance
 */
export function createSecurityMiddleware(config: SecurityConfig): SecurityMiddleware {
  return new SecurityMiddleware(config);
}
