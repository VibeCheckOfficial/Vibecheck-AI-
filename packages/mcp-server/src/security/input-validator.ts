/**
 * Input Validator
 * 
 * Validates input sizes and structures to prevent resource exhaustion attacks.
 */

export interface InputValidationResult {
  valid: boolean;
  error?: string;
  errorCode?: string;
}

export interface InputLimits {
  maxContentSize: number; // bytes
  maxFilePathLength: number; // characters
  maxArraySize: number; // items
  maxStringLength: number; // characters
  maxObjectDepth: number; // nesting levels
}

export const DEFAULT_LIMITS: InputLimits = {
  maxContentSize: 10 * 1024 * 1024, // 10MB
  maxFilePathLength: 4096, // filesystem limit
  maxArraySize: 1000,
  maxStringLength: 1024 * 1024, // 1MB
  maxObjectDepth: 20,
};

export class InputValidator {
  private readonly limits: InputLimits;

  constructor(limits: Partial<InputLimits> = {}) {
    this.limits = { ...DEFAULT_LIMITS, ...limits };
  }

  /**
   * Validate content size
   */
  validateContentSize(content: string): InputValidationResult {
    if (typeof content !== 'string') {
      return {
        valid: false,
        error: 'Content must be a string',
        errorCode: 'E_INPUT_TYPE_INVALID',
      };
    }

    const size = Buffer.byteLength(content, 'utf8');
    if (size > this.limits.maxContentSize) {
      return {
        valid: false,
        error: `Content size ${size} exceeds maximum ${this.limits.maxContentSize}`,
        errorCode: 'E_CONTENT_SIZE_EXCEEDED',
      };
    }

    if (content.length > this.limits.maxStringLength) {
      return {
        valid: false,
        error: `Content length ${content.length} exceeds maximum ${this.limits.maxStringLength}`,
        errorCode: 'E_STRING_LENGTH_EXCEEDED',
      };
    }

    return { valid: true };
  }

  /**
   * Validate file path length
   */
  validateFilePath(filePath: string): InputValidationResult {
    if (typeof filePath !== 'string') {
      return {
        valid: false,
        error: 'File path must be a string',
        errorCode: 'E_INPUT_TYPE_INVALID',
      };
    }

    if (filePath.length > this.limits.maxFilePathLength) {
      return {
        valid: false,
        error: `File path length ${filePath.length} exceeds maximum ${this.limits.maxFilePathLength}`,
        errorCode: 'E_PATH_LENGTH_EXCEEDED',
      };
    }

    return { valid: true };
  }

  /**
   * Validate array size
   */
  validateArraySize<T>(array: T[]): InputValidationResult {
    if (!Array.isArray(array)) {
      return {
        valid: false,
        error: 'Input must be an array',
        errorCode: 'E_INPUT_TYPE_INVALID',
      };
    }

    if (array.length > this.limits.maxArraySize) {
      return {
        valid: false,
        error: `Array size ${array.length} exceeds maximum ${this.limits.maxArraySize}`,
        errorCode: 'E_ARRAY_SIZE_EXCEEDED',
      };
    }

    return { valid: true };
  }

  /**
   * Validate object depth
   */
  validateObjectDepth(obj: unknown, currentDepth = 0): InputValidationResult {
    if (currentDepth > this.limits.maxObjectDepth) {
      return {
        valid: false,
        error: `Object depth ${currentDepth} exceeds maximum ${this.limits.maxObjectDepth}`,
        errorCode: 'E_OBJECT_DEPTH_EXCEEDED',
      };
    }

    if (obj === null || typeof obj !== 'object') {
      return { valid: true };
    }

    if (Array.isArray(obj)) {
      for (const item of obj) {
        const result = this.validateObjectDepth(item, currentDepth + 1);
        if (!result.valid) {
          return result;
        }
      }
    } else {
      for (const value of Object.values(obj)) {
        const result = this.validateObjectDepth(value, currentDepth + 1);
        if (!result.valid) {
          return result;
        }
      }
    }

    return { valid: true };
  }

  /**
   * Validate tool parameters
   */
  validateToolParams(params: Record<string, unknown>): InputValidationResult {
    // Validate object depth
    const depthResult = this.validateObjectDepth(params);
    if (!depthResult.valid) {
      return depthResult;
    }

    // Validate string fields
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'string') {
        // Special handling for content fields
        if (key === 'content' || key === 'code' || key === 'prompt' || key === 'generatedCode') {
          const contentResult = this.validateContentSize(value);
          if (!contentResult.valid) {
            return contentResult;
          }
        } else if (key === 'filePath' || key === 'targetFile' || key === 'target' || key === 'file') {
          const pathResult = this.validateFilePath(value);
          if (!pathResult.valid) {
            return pathResult;
          }
        } else {
          // Generic string validation
          if (value.length > this.limits.maxStringLength) {
            return {
              valid: false,
              error: `String field ${key} length exceeds maximum`,
              errorCode: 'E_STRING_LENGTH_EXCEEDED',
            };
          }
        }
      } else if (Array.isArray(value)) {
        const arrayResult = this.validateArraySize(value);
        if (!arrayResult.valid) {
          return arrayResult;
        }
      }
    }

    return { valid: true };
  }

  /**
   * Get current limits
   */
  getLimits(): Readonly<InputLimits> {
    return { ...this.limits };
  }
}

/**
 * Create an input validator instance
 */
export function createInputValidator(limits: Partial<InputLimits> = {}): InputValidator {
  return new InputValidator(limits);
}
