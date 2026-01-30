/**
 * Sensitive Data Redaction for Reality Mode
 * 
 * Automatically redacts tokens, passwords, API keys, and other
 * sensitive data from logs and artifacts.
 */

// ============================================================================
// Types
// ============================================================================

export interface RedactionRule {
  /** Unique identifier for the rule */
  id: string;
  /** Human-readable name */
  name: string;
  /** Pattern to match */
  pattern: RegExp;
  /** Replacement text */
  replacement: string;
}

export interface RedactionConfig {
  /** Enable redaction */
  enabled: boolean;
  /** Custom rules to add */
  customRules: RedactionRule[];
  /** Rule IDs to disable */
  disabledRules: string[];
}

export interface RedactionResult {
  /** Redacted text */
  text: string;
  /** Number of redactions made */
  redactionCount: number;
  /** Rules that matched */
  matchedRules: string[];
}

// ============================================================================
// Default Redaction Rules
// ============================================================================

export const DEFAULT_REDACTION_RULES: ReadonlyArray<RedactionRule> = [
  // JWT Tokens
  {
    id: 'jwt-bearer',
    name: 'JWT Bearer Token',
    pattern: /Bearer\s+[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+/g,
    replacement: 'Bearer [REDACTED_JWT]',
  },
  {
    id: 'jwt-standalone',
    name: 'Standalone JWT',
    pattern: /eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+/g,
    replacement: '[REDACTED_JWT]',
  },

  // API Keys
  {
    id: 'api-key-param',
    name: 'API Key Parameter',
    pattern: /api[_-]?key[=:]\s*["']?[A-Za-z0-9\-_]{20,}["']?/gi,
    replacement: 'api_key=[REDACTED_API_KEY]',
  },
  {
    id: 'api-key-header',
    name: 'API Key Header',
    pattern: /x-api-key:\s*[A-Za-z0-9\-_]{20,}/gi,
    replacement: 'x-api-key: [REDACTED_API_KEY]',
  },

  // Passwords
  {
    id: 'password-param',
    name: 'Password Parameter',
    pattern: /password[=:]\s*["']?[^"'\s&]{3,}["']?/gi,
    replacement: 'password=[REDACTED]',
  },
  {
    id: 'passwd-param',
    name: 'Passwd Parameter',
    pattern: /passwd[=:]\s*["']?[^"'\s&]{3,}["']?/gi,
    replacement: 'passwd=[REDACTED]',
  },

  // Secrets
  {
    id: 'secret-param',
    name: 'Secret Parameter',
    pattern: /secret[=:]\s*["']?[^"'\s&]{10,}["']?/gi,
    replacement: 'secret=[REDACTED]',
  },
  {
    id: 'client-secret',
    name: 'Client Secret',
    pattern: /client[_-]?secret[=:]\s*["']?[^"'\s&]{10,}["']?/gi,
    replacement: 'client_secret=[REDACTED]',
  },

  // Tokens
  {
    id: 'access-token',
    name: 'Access Token',
    pattern: /access[_-]?token[=:]\s*["']?[A-Za-z0-9\-_]{20,}["']?/gi,
    replacement: 'access_token=[REDACTED_TOKEN]',
  },
  {
    id: 'refresh-token',
    name: 'Refresh Token',
    pattern: /refresh[_-]?token[=:]\s*["']?[A-Za-z0-9\-_]{20,}["']?/gi,
    replacement: 'refresh_token=[REDACTED_TOKEN]',
  },
  {
    id: 'auth-token',
    name: 'Auth Token',
    pattern: /auth[_-]?token[=:]\s*["']?[A-Za-z0-9\-_]{20,}["']?/gi,
    replacement: 'auth_token=[REDACTED_TOKEN]',
  },

  // Session IDs
  {
    id: 'session-id',
    name: 'Session ID',
    pattern: /session[_-]?id[=:]\s*["']?[A-Za-z0-9\-_]{20,}["']?/gi,
    replacement: 'session_id=[REDACTED]',
  },
  {
    id: 'sid-cookie',
    name: 'SID Cookie',
    pattern: /sid[=:]\s*["']?[A-Za-z0-9\-_]{20,}["']?/gi,
    replacement: 'sid=[REDACTED]',
  },

  // HTTP Headers
  {
    id: 'auth-header',
    name: 'Authorization Header',
    pattern: /Authorization:\s*.+/gi,
    replacement: 'Authorization: [REDACTED]',
  },
  {
    id: 'cookie-header',
    name: 'Cookie Header',
    pattern: /Cookie:\s*.+/gi,
    replacement: 'Cookie: [REDACTED]',
  },
  {
    id: 'set-cookie-header',
    name: 'Set-Cookie Header',
    pattern: /Set-Cookie:\s*[^;]+/gi,
    replacement: 'Set-Cookie: [REDACTED]',
  },

  // Stripe Keys
  {
    id: 'stripe-secret',
    name: 'Stripe Secret Key',
    pattern: /sk_(?:live|test)_[A-Za-z0-9]{24,}/g,
    replacement: '[REDACTED_STRIPE_SK]',
  },
  {
    id: 'stripe-publishable',
    name: 'Stripe Publishable Key',
    pattern: /pk_(?:live|test)_[A-Za-z0-9]{24,}/g,
    replacement: '[REDACTED_STRIPE_PK]',
  },

  // AWS Keys
  {
    id: 'aws-access-key',
    name: 'AWS Access Key',
    pattern: /AKIA[A-Z0-9]{16}/g,
    replacement: '[REDACTED_AWS_ACCESS_KEY]',
  },
  {
    id: 'aws-secret-key',
    name: 'AWS Secret Key',
    pattern: /aws[_-]?secret[_-]?access[_-]?key[=:]\s*["']?[A-Za-z0-9/+=]{40}["']?/gi,
    replacement: 'aws_secret_access_key=[REDACTED_AWS_SECRET]',
  },

  // GitHub Tokens
  {
    id: 'github-token',
    name: 'GitHub Token',
    pattern: /ghp_[A-Za-z0-9]{36,}/g,
    replacement: '[REDACTED_GITHUB_TOKEN]',
  },
  {
    id: 'github-oauth',
    name: 'GitHub OAuth',
    pattern: /gho_[A-Za-z0-9]{36,}/g,
    replacement: '[REDACTED_GITHUB_OAUTH]',
  },

  // Generic Private Keys
  {
    id: 'private-key',
    name: 'Private Key',
    pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]+?-----END (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
    replacement: '[REDACTED_PRIVATE_KEY]',
  },

  // Credit Card Numbers (basic pattern)
  {
    id: 'credit-card',
    name: 'Credit Card Number',
    pattern: /\b(?:\d{4}[- ]?){3}\d{4}\b/g,
    replacement: '[REDACTED_CARD]',
  },
];

// ============================================================================
// Redactor Class
// ============================================================================

export class Redactor {
  private rules: RedactionRule[];
  private enabled: boolean;

  constructor(config: Partial<RedactionConfig> = {}) {
    this.enabled = config.enabled ?? true;

    // Build rules list
    const disabledSet = new Set(config.disabledRules ?? []);
    this.rules = [
      ...DEFAULT_REDACTION_RULES.filter(r => !disabledSet.has(r.id)),
      ...(config.customRules ?? []),
    ];
  }

  /**
   * Redact sensitive data from text
   */
  redact(text: string): RedactionResult {
    if (!this.enabled || !text) {
      return {
        text,
        redactionCount: 0,
        matchedRules: [],
      };
    }

    let result = text;
    let totalCount = 0;
    const matchedRules: string[] = [];

    for (const rule of this.rules) {
      // Reset regex lastIndex for global patterns
      rule.pattern.lastIndex = 0;

      const matches = result.match(rule.pattern);
      if (matches && matches.length > 0) {
        result = result.replace(rule.pattern, rule.replacement);
        totalCount += matches.length;
        if (!matchedRules.includes(rule.id)) {
          matchedRules.push(rule.id);
        }
      }
    }

    return {
      text: result,
      redactionCount: totalCount,
      matchedRules,
    };
  }

  /**
   * Redact sensitive data from an object (recursively)
   */
  redactObject<T extends Record<string, unknown>>(obj: T): T {
    if (!this.enabled) {
      return obj;
    }

    return this.redactValue(obj) as T;
  }

  /**
   * Recursively redact values
   */
  private redactValue(value: unknown): unknown {
    if (typeof value === 'string') {
      return this.redact(value).text;
    }

    if (Array.isArray(value)) {
      return value.map(item => this.redactValue(item));
    }

    if (value !== null && typeof value === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value)) {
        result[key] = this.redactValue(val);
      }
      return result;
    }

    return value;
  }

  /**
   * Get the list of active rules
   */
  getRules(): ReadonlyArray<RedactionRule> {
    return [...this.rules];
  }

  /**
   * Add a custom rule
   */
  addRule(rule: RedactionRule): void {
    this.rules.push(rule);
  }

  /**
   * Enable or disable redaction
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Create a redactor with default configuration
 */
export function createRedactor(config: Partial<RedactionConfig> = {}): Redactor {
  return new Redactor(config);
}

/**
 * Quick redact with default rules
 */
export function redactSensitive(text: string): string {
  return new Redactor().redact(text).text;
}

/**
 * Check if text contains sensitive data
 */
export function containsSensitiveData(text: string): boolean {
  const result = new Redactor().redact(text);
  return result.redactionCount > 0;
}

/**
 * Get all default rule IDs
 */
export function getDefaultRuleIds(): string[] {
  return DEFAULT_REDACTION_RULES.map(r => r.id);
}
