/**
 * URL Allowlist for Reality Mode
 * 
 * Controls which URLs can be accessed during runtime verification.
 * Prevents SSRF and unwanted external requests.
 */

import { createHash } from 'crypto';

// ============================================================================
// Types
// ============================================================================

export interface UrlAllowlistConfig {
  /** User-defined allowed patterns (glob-like) */
  patterns: string[];
  /** Whether to block requests not matching allowlist */
  blockUnlisted: boolean;
}

export interface UrlCheckResult {
  allowed: boolean;
  reason?: string;
  matchedPattern?: string;
}

// ============================================================================
// Default Patterns
// ============================================================================

/**
 * Default safe patterns always included in allowlist
 * These are localhost/loopback addresses used for local development
 */
export const DEFAULT_ALLOWLIST_PATTERNS: readonly string[] = [
  'localhost',
  'localhost:*',
  '127.0.0.1',
  '127.0.0.1:*',
  '0.0.0.0',
  '0.0.0.0:*',
  '*.localhost',
  '*.local',
] as const;

/**
 * Known mock/fake API domains that should be flagged
 * These are commonly used in tutorials/demos but indicate fake data
 */
export const MOCK_API_DOMAINS: readonly string[] = [
  'jsonplaceholder.typicode.com',
  'reqres.in',
  'mockapi.io',
  'mocky.io',
  'httpbin.org',
  'dummyjson.com',
  'fakestoreapi.com',
  'api.example.com',
  'example.com',
  'test.com',
] as const;

// ============================================================================
// URL Allowlist Class
// ============================================================================

export class UrlAllowlist {
  private patterns: Set<string>;
  private blockUnlisted: boolean;
  private regexCache: Map<string, RegExp> = new Map();

  constructor(config: Partial<UrlAllowlistConfig> = {}) {
    this.blockUnlisted = config.blockUnlisted ?? true;
    this.patterns = new Set([
      ...DEFAULT_ALLOWLIST_PATTERNS,
      ...(config.patterns ?? []),
    ]);
  }

  /**
   * Check if a URL is allowed
   */
  check(url: string): UrlCheckResult {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname;
      const hostWithPort = parsed.port ? `${host}:${parsed.port}` : host;

      // Check against patterns
      for (const pattern of this.patterns) {
        if (this.matchesPattern(hostWithPort, pattern) || this.matchesPattern(host, pattern)) {
          return {
            allowed: true,
            matchedPattern: pattern,
          };
        }
      }

      // Check if it's a mock API domain (allowed but flagged)
      for (const mockDomain of MOCK_API_DOMAINS) {
        if (host === mockDomain || host.endsWith(`.${mockDomain}`)) {
          return {
            allowed: true, // Allow but caller should flag as fake
            reason: `Mock API domain detected: ${mockDomain}`,
            matchedPattern: mockDomain,
          };
        }
      }

      // Not in allowlist
      if (this.blockUnlisted) {
        return {
          allowed: false,
          reason: `URL not in allowlist: ${host}`,
        };
      }

      return { allowed: true };
    } catch {
      return {
        allowed: false,
        reason: `Invalid URL: ${url}`,
      };
    }
  }

  /**
   * Add a pattern to the allowlist
   */
  addPattern(pattern: string): void {
    this.patterns.add(pattern);
    this.regexCache.delete(pattern);
  }

  /**
   * Remove a pattern from the allowlist
   */
  removePattern(pattern: string): void {
    this.patterns.delete(pattern);
    this.regexCache.delete(pattern);
  }

  /**
   * Get all patterns
   */
  getPatterns(): string[] {
    return Array.from(this.patterns);
  }

  /**
   * Check if a host matches a pattern
   * Supports * as wildcard for any characters
   */
  private matchesPattern(host: string, pattern: string): boolean {
    // Exact match
    if (host === pattern) {
      return true;
    }

    // Get or create regex for pattern
    let regex = this.regexCache.get(pattern);
    if (!regex) {
      // Convert glob-like pattern to regex
      const escaped = pattern
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*');
      regex = new RegExp(`^${escaped}$`, 'i');
      this.regexCache.set(pattern, regex);
    }

    return regex.test(host);
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Create a URL allowlist with default configuration
 */
export function createUrlAllowlist(
  additionalPatterns: string[] = []
): UrlAllowlist {
  return new UrlAllowlist({
    patterns: additionalPatterns,
    blockUnlisted: true,
  });
}

/**
 * Quick check if URL is allowed
 */
export function isUrlAllowed(url: string, patterns: string[] = []): boolean {
  const allowlist = createUrlAllowlist(patterns);
  return allowlist.check(url).allowed;
}

/**
 * Check if URL is a known mock/fake API
 */
export function isMockApiUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return MOCK_API_DOMAINS.some(
      domain => host === domain || host.endsWith(`.${domain}`)
    );
  } catch {
    return false;
  }
}

/**
 * Generate a stable hash for allowlist configuration (for caching)
 */
export function hashAllowlistConfig(config: UrlAllowlistConfig): string {
  const sorted = [...config.patterns].sort();
  const content = JSON.stringify({ patterns: sorted, blockUnlisted: config.blockUnlisted });
  return createHash('sha256').update(content).digest('hex').slice(0, 8);
}
