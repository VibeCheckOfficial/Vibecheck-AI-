/**
 * Rate Limiter
 * 
 * Implements rate limiting to prevent DoS attacks via request flooding.
 */

export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  burstSize?: number; // Burst allowance
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number; // Timestamp when limit resets
  retryAfter?: number; // Seconds to wait before retry
}

interface RequestRecord {
  count: number;
  resetAt: number;
  burstUsed: number;
}

export class RateLimiter {
  private readonly config: Required<RateLimitConfig>;
  private readonly records: Map<string, RequestRecord> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(config: RateLimitConfig) {
    this.config = {
      windowMs: config.windowMs,
      maxRequests: config.maxRequests,
      burstSize: config.burstSize ?? Math.floor(config.maxRequests * 0.1),
    };

    // Cleanup expired records every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000);
  }

  /**
   * Check if a request should be allowed
   */
  check(key: string): RateLimitResult {
    const now = Date.now();
    const record = this.records.get(key);

    if (!record || now >= record.resetAt) {
      // New window or expired, reset
      const resetAt = now + this.config.windowMs;
      this.records.set(key, {
        count: 1,
        resetAt,
        burstUsed: 0,
      });

      return {
        allowed: true,
        remaining: this.config.maxRequests - 1,
        resetAt,
      };
    }

    // Check burst allowance first
    if (record.burstUsed < this.config.burstSize) {
      record.burstUsed++;
      record.count++;
      return {
        allowed: true,
        remaining: this.config.maxRequests - record.count,
        resetAt: record.resetAt,
      };
    }

    // Check regular limit
    if (record.count >= this.config.maxRequests) {
      const retryAfter = Math.ceil((record.resetAt - now) / 1000);
      return {
        allowed: false,
        remaining: 0,
        resetAt: record.resetAt,
        retryAfter,
      };
    }

    record.count++;
    return {
      allowed: true,
      remaining: this.config.maxRequests - record.count,
      resetAt: record.resetAt,
    };
  }

  /**
   * Clean up expired records
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, record] of this.records.entries()) {
      if (now >= record.resetAt) {
        this.records.delete(key);
      }
    }
  }

  /**
   * Reset rate limit for a key
   */
  reset(key: string): void {
    this.records.delete(key);
  }

  /**
   * Get current state for a key
   */
  getState(key: string): RateLimitResult | null {
    const record = this.records.get(key);
    if (!record) {
      return null;
    }

    const now = Date.now();
    if (now >= record.resetAt) {
      return null;
    }

    return {
      allowed: record.count < this.config.maxRequests,
      remaining: Math.max(0, this.config.maxRequests - record.count),
      resetAt: record.resetAt,
      retryAfter: record.count >= this.config.maxRequests 
        ? Math.ceil((record.resetAt - now) / 1000)
        : undefined,
    };
  }

  /**
   * Destroy the rate limiter and cleanup
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.records.clear();
  }
}

/**
 * Multi-tier rate limiter
 * Applies multiple rate limits (e.g., per-client, per-tool, global)
 */
export class MultiTierRateLimiter {
  private readonly clientLimiter: RateLimiter;
  private readonly toolLimiters: Map<string, RateLimiter> = new Map();
  private readonly globalLimiter: RateLimiter;

  constructor(config: {
    client: RateLimitConfig;
    tool: RateLimitConfig;
    global: RateLimitConfig;
  }) {
    this.clientLimiter = new RateLimiter(config.client);
    this.globalLimiter = new RateLimiter(config.global);
  }

  /**
   * Check rate limits for a request
   */
  check(clientId: string, toolName?: string): RateLimitResult {
    // Check global limit first
    const globalResult = this.globalLimiter.check('global');
    if (!globalResult.allowed) {
      return globalResult;
    }

    // Check client limit
    const clientResult = this.clientLimiter.check(clientId);
    if (!clientResult.allowed) {
      return clientResult;
    }

    // Check tool limit if specified
    if (toolName) {
      let toolLimiter = this.toolLimiters.get(toolName);
      if (!toolLimiter) {
        // Create tool limiter with same config as client
        toolLimiter = new RateLimiter({
          windowMs: 60000, // 1 minute
          maxRequests: 20, // 20 requests per minute per tool
        });
        this.toolLimiters.set(toolName, toolLimiter);
      }

      const toolResult = toolLimiter.check(toolName);
      if (!toolResult.allowed) {
        return toolResult;
      }
    }

    // All checks passed
    return {
      allowed: true,
      remaining: Math.min(
        globalResult.remaining,
        clientResult.remaining
      ),
      resetAt: Math.min(globalResult.resetAt, clientResult.resetAt),
    };
  }

  /**
   * Reset limits for a client
   */
  resetClient(clientId: string): void {
    this.clientLimiter.reset(clientId);
  }

  /**
   * Destroy all limiters
   */
  destroy(): void {
    this.clientLimiter.destroy();
    this.globalLimiter.destroy();
    for (const limiter of this.toolLimiters.values()) {
      limiter.destroy();
    }
    this.toolLimiters.clear();
  }
}

/**
 * Create default rate limiter configuration
 */
export function createDefaultRateLimiter(): MultiTierRateLimiter {
  return new MultiTierRateLimiter({
    client: {
      windowMs: 60000, // 1 minute
      maxRequests: 100, // 100 requests per minute per client
      burstSize: 10, // Allow 10 burst requests
    },
    tool: {
      windowMs: 60000, // 1 minute
      maxRequests: 20, // 20 requests per minute per tool
      burstSize: 2,
    },
    global: {
      windowMs: 60000, // 1 minute
      maxRequests: 1000, // 1000 requests per minute globally
      burstSize: 100,
    },
  });
}
