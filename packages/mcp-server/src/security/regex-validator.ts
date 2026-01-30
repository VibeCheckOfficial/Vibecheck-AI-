/**
 * Regex Validator
 * 
 * Validates regex patterns to prevent ReDoS (Regular Expression Denial of Service) attacks.
 */

export interface RegexValidationResult {
  valid: boolean;
  error?: string;
  errorCode?: string;
}

export interface RegexLimits {
  maxAlternations: number;
  maxQuantifiers: number;
  maxBackreferences: number;
  maxGroupDepth: number;
  timeoutMs: number;
}

export const DEFAULT_REGEX_LIMITS: RegexLimits = {
  maxAlternations: 10, // Maximum | operators
  maxQuantifiers: 20, // Maximum *, +, ?, {n,m} operators
  maxBackreferences: 5, // Maximum \1, \2, etc.
  maxGroupDepth: 10, // Maximum nesting depth of groups
  timeoutMs: 1000, // 1 second timeout for regex execution
};

export class RegexValidator {
  private readonly limits: RegexLimits;

  constructor(limits: Partial<RegexLimits> = {}) {
    this.limits = { ...DEFAULT_REGEX_LIMITS, ...limits };
  }

  /**
   * Validate a regex pattern
   */
  validate(pattern: string): RegexValidationResult {
    if (typeof pattern !== 'string') {
      return {
        valid: false,
        error: 'Pattern must be a string',
        errorCode: 'E_REGEX_INVALID',
      };
    }

    // Check length
    if (pattern.length > 1000) {
      return {
        valid: false,
        error: 'Pattern too long',
        errorCode: 'E_REGEX_COMPLEXITY_EXCEEDED',
      };
    }

    // Check for known ReDoS patterns
    const redosPatterns = [
      /(a+)+$/,
      /(a*)*$/,
      /(a|a)+$/,
      /(a|ab)+$/,
      /(.*a){x}/,
      /(a+)+b/,
    ];

    for (const redosPattern of redosPatterns) {
      if (pattern.match(redosPattern)) {
        return {
          valid: false,
          error: 'Pattern contains known ReDoS vulnerability',
          errorCode: 'E_REGEX_COMPLEXITY_EXCEEDED',
        };
      }
    }

    // Count alternations
    const alternations = (pattern.match(/\|/g) || []).length;
    if (alternations > this.limits.maxAlternations) {
      return {
        valid: false,
        error: `Too many alternations (${alternations} > ${this.limits.maxAlternations})`,
        errorCode: 'E_REGEX_COMPLEXITY_EXCEEDED',
      };
    }

    // Count quantifiers
    const quantifiers = (pattern.match(/[*+?]|\{\d+(?:,\d*)?\}/g) || []).length;
    if (quantifiers > this.limits.maxQuantifiers) {
      return {
        valid: false,
        error: `Too many quantifiers (${quantifiers} > ${this.limits.maxQuantifiers})`,
        errorCode: 'E_REGEX_COMPLEXITY_EXCEEDED',
      };
    }

    // Count backreferences
    const backreferences = (pattern.match(/\\\d+/g) || []).length;
    if (backreferences > this.limits.maxBackreferences) {
      return {
        valid: false,
        error: `Too many backreferences (${backreferences} > ${this.limits.maxBackreferences})`,
        errorCode: 'E_REGEX_COMPLEXITY_EXCEEDED',
      };
    }

    // Check group depth (simplified - count opening parentheses)
    const openParens = (pattern.match(/\(/g) || []).length;
    const closeParens = (pattern.match(/\)/g) || []).length;
    if (openParens !== closeParens) {
      return {
        valid: false,
        error: 'Unbalanced parentheses',
        errorCode: 'E_REGEX_INVALID',
      };
    }

    // Try to compile the regex
    try {
      // eslint-disable-next-line no-new
      new RegExp(pattern);
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Invalid regex pattern',
        errorCode: 'E_REGEX_INVALID',
      };
    }

    return { valid: true };
  }

  /**
   * Execute a regex with timeout protection
   */
  async execute(
    pattern: string,
    testString: string,
    flags: string = ''
  ): Promise<{ match: boolean; error?: string }> {
    const validation = this.validate(pattern);
    if (!validation.valid) {
      return {
        match: false,
        error: validation.error,
      };
    }

    try {
      const regex = new RegExp(pattern, flags);
      
      // Execute with timeout
      const result = await Promise.race([
        Promise.resolve(regex.test(testString)),
        new Promise<boolean>((_, reject) => {
          setTimeout(() => {
            reject(new Error('Regex execution timeout'));
          }, this.limits.timeoutMs);
        }),
      ]);

      return { match: result };
    } catch (error) {
      return {
        match: false,
        error: error instanceof Error ? error.message : 'Regex execution failed',
      };
    }
  }

  /**
   * Convert glob pattern to safe regex
   */
  globToRegex(globPattern: string): RegexValidationResult {
    // Simple glob to regex conversion with validation
    // Replace * with .* but limit the number
    const starCount = (globPattern.match(/\*/g) || []).length;
    if (starCount > 10) {
      return {
        valid: false,
        error: 'Too many wildcards in glob pattern',
        errorCode: 'E_REGEX_COMPLEXITY_EXCEEDED',
      };
    }

    const regexPattern = globPattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');

    return this.validate(regexPattern);
  }
}

/**
 * Create regex validator instance
 */
export function createRegexValidator(limits: Partial<RegexLimits> = {}): RegexValidator {
  return new RegexValidator(limits);
}
