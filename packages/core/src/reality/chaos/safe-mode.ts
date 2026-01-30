/**
 * Chaos Agent Safe Mode
 * 
 * Provides safety controls and guardrails for the AI Chaos Agent.
 * Safe Mode defaults to read-only behavior with opt-in for riskier actions.
 * 
 * @module reality/chaos/safe-mode
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Safe Mode configuration
 */
export interface SafeModeConfig {
  /** Enable safe mode (default: true) */
  enabled: boolean;
  
  // Read-only controls
  /** Allow form submissions (default: false in safe mode) */
  allowFormSubmissions: boolean;
  /** Allow destructive inputs (delete, remove, etc.) (default: false) */
  allowDestructiveInputs: boolean;
  /** Allow authentication actions (login, logout) (default: false) */
  allowAuthentication: boolean;
  /** Allow file uploads (default: false) */
  allowFileUploads: boolean;
  /** Allow payment-related actions (default: false) */
  allowPaymentActions: boolean;
  
  // Scope controls
  /** Allowed route patterns (glob patterns) */
  allowedRoutes: string[];
  /** Denied route patterns (glob patterns) */
  deniedRoutes: string[];
  /** Denied action selectors (CSS selectors for blocked elements) */
  deniedActions: string[];
  /** Max depth of navigation from starting page */
  maxNavigationDepth: number;
  
  // Rate limits
  /** Maximum runtime in seconds */
  maxRuntime: number;
  /** Maximum total HTTP requests */
  maxRequests: number;
  /** Maximum actions per minute */
  maxActionsPerMinute: number;
  /** Minimum delay between actions in milliseconds */
  minActionDelayMs: number;
  
  // Replay and audit
  /** Random seed for reproducibility */
  seed?: number;
  /** Record all actions for replay */
  recordActions: boolean;
  /** Take screenshot after each action */
  screenshotEachAction: boolean;
}

/**
 * Default safe mode configuration
 */
export const DEFAULT_SAFE_MODE_CONFIG: SafeModeConfig = {
  enabled: true,
  
  // Read-only by default
  allowFormSubmissions: false,
  allowDestructiveInputs: false,
  allowAuthentication: false,
  allowFileUploads: false,
  allowPaymentActions: false,
  
  // Scope controls
  allowedRoutes: ['/**'],  // All routes allowed by default
  deniedRoutes: [
    '/admin/**',
    '/api/admin/**',
    '/**/delete/**',
    '/**/remove/**',
    '/**/destroy/**',
  ],
  deniedActions: [
    'button[type="submit"]',
    'input[type="submit"]',
    '[data-action="delete"]',
    '[data-action="remove"]',
    '.delete-btn',
    '.danger-btn',
  ],
  maxNavigationDepth: 5,
  
  // Rate limits
  maxRuntime: 300,  // 5 minutes
  maxRequests: 100,
  maxActionsPerMinute: 10,
  minActionDelayMs: 500,
  
  // Replay
  recordActions: true,
  screenshotEachAction: true,
};

/**
 * Aggressive mode configuration (more permissive)
 */
export const AGGRESSIVE_MODE_CONFIG: Partial<SafeModeConfig> = {
  enabled: true,
  allowFormSubmissions: true,
  allowDestructiveInputs: false,  // Still blocked
  allowAuthentication: true,
  allowFileUploads: false,
  allowPaymentActions: false,  // Always blocked
  
  deniedRoutes: [
    '/api/admin/**',
    '/**/delete/**',
  ],
  deniedActions: [
    '[data-action="delete"]',
    '.danger-btn',
  ],
  
  maxRuntime: 600,  // 10 minutes
  maxRequests: 200,
  maxActionsPerMinute: 20,
  minActionDelayMs: 250,
};

// ============================================================================
// Safe Mode Manager
// ============================================================================

/**
 * Manages safe mode configuration and enforcement
 */
export class SafeModeManager {
  private config: SafeModeConfig;
  private actionCount: number = 0;
  private requestCount: number = 0;
  private startTime: number = 0;
  private lastActionTime: number = 0;
  private navigationDepth: number = 0;
  private actionsThisMinute: number = 0;
  private minuteStartTime: number = 0;

  constructor(config: Partial<SafeModeConfig> = {}) {
    this.config = {
      ...DEFAULT_SAFE_MODE_CONFIG,
      ...config,
    };
  }

  /**
   * Start a new session
   */
  startSession(): void {
    this.actionCount = 0;
    this.requestCount = 0;
    this.startTime = Date.now();
    this.lastActionTime = 0;
    this.navigationDepth = 0;
    this.actionsThisMinute = 0;
    this.minuteStartTime = Date.now();
  }

  /**
   * Check if safe mode is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Get current configuration
   */
  getConfig(): SafeModeConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<SafeModeConfig>): void {
    this.config = {
      ...this.config,
      ...updates,
    };
  }

  /**
   * Check if a URL is allowed
   */
  isUrlAllowed(url: string): SafeModeCheckResult {
    if (!this.config.enabled) {
      return { allowed: true };
    }

    const pathname = new URL(url, 'http://localhost').pathname;

    // Check denied routes first
    for (const pattern of this.config.deniedRoutes) {
      if (this.matchesPattern(pathname, pattern)) {
        return {
          allowed: false,
          reason: `URL matches denied pattern: ${pattern}`,
          pattern,
        };
      }
    }

    // Check allowed routes
    const isAllowed = this.config.allowedRoutes.some(
      (pattern) => this.matchesPattern(pathname, pattern)
    );

    if (!isAllowed) {
      return {
        allowed: false,
        reason: 'URL does not match any allowed pattern',
      };
    }

    return { allowed: true };
  }

  /**
   * Check if an action is allowed
   */
  isActionAllowed(action: ChaosAction): SafeModeCheckResult {
    if (!this.config.enabled) {
      return { allowed: true };
    }

    // Check action type restrictions
    if (action.type === 'submit' && !this.config.allowFormSubmissions) {
      return {
        allowed: false,
        reason: 'Form submissions are disabled in safe mode',
        actionType: action.type,
      };
    }

    if (action.type === 'login' || action.type === 'logout') {
      if (!this.config.allowAuthentication) {
        return {
          allowed: false,
          reason: 'Authentication actions are disabled in safe mode',
          actionType: action.type,
        };
      }
    }

    if (action.type === 'upload' && !this.config.allowFileUploads) {
      return {
        allowed: false,
        reason: 'File uploads are disabled in safe mode',
        actionType: action.type,
      };
    }

    if (action.type === 'payment' && !this.config.allowPaymentActions) {
      return {
        allowed: false,
        reason: 'Payment actions are always disabled',
        actionType: action.type,
      };
    }

    // Check selector against denied actions
    if (action.selector) {
      for (const deniedSelector of this.config.deniedActions) {
        if (this.selectorMatches(action.selector, deniedSelector)) {
          return {
            allowed: false,
            reason: `Action selector matches denied pattern: ${deniedSelector}`,
            selector: action.selector,
          };
        }
      }
    }

    // Check for destructive input values
    if (action.value && !this.config.allowDestructiveInputs) {
      const destructivePatterns = [
        /delete/i,
        /remove/i,
        /destroy/i,
        /drop\s+table/i,
        /truncate/i,
      ];

      for (const pattern of destructivePatterns) {
        if (pattern.test(action.value)) {
          return {
            allowed: false,
            reason: 'Destructive input value detected',
            value: action.value,
          };
        }
      }
    }

    return { allowed: true };
  }

  /**
   * Check rate limits before action
   */
  checkRateLimits(): SafeModeCheckResult {
    if (!this.config.enabled) {
      return { allowed: true };
    }

    const now = Date.now();
    const elapsedSeconds = (now - this.startTime) / 1000;

    // Check runtime limit
    if (elapsedSeconds >= this.config.maxRuntime) {
      return {
        allowed: false,
        reason: `Runtime limit exceeded (${this.config.maxRuntime}s)`,
        limit: 'maxRuntime',
      };
    }

    // Check request limit
    if (this.requestCount >= this.config.maxRequests) {
      return {
        allowed: false,
        reason: `Request limit exceeded (${this.config.maxRequests})`,
        limit: 'maxRequests',
      };
    }

    // Check actions per minute
    if (now - this.minuteStartTime >= 60000) {
      // Reset minute counter
      this.actionsThisMinute = 0;
      this.minuteStartTime = now;
    }

    if (this.actionsThisMinute >= this.config.maxActionsPerMinute) {
      return {
        allowed: false,
        reason: `Actions per minute limit exceeded (${this.config.maxActionsPerMinute})`,
        limit: 'maxActionsPerMinute',
      };
    }

    // Check minimum delay
    if (this.lastActionTime > 0) {
      const timeSinceLastAction = now - this.lastActionTime;
      if (timeSinceLastAction < this.config.minActionDelayMs) {
        return {
          allowed: false,
          reason: `Minimum action delay not met (${this.config.minActionDelayMs}ms)`,
          limit: 'minActionDelayMs',
          waitMs: this.config.minActionDelayMs - timeSinceLastAction,
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Check navigation depth
   */
  checkNavigationDepth(): SafeModeCheckResult {
    if (!this.config.enabled) {
      return { allowed: true };
    }

    if (this.navigationDepth >= this.config.maxNavigationDepth) {
      return {
        allowed: false,
        reason: `Navigation depth limit exceeded (${this.config.maxNavigationDepth})`,
        limit: 'maxNavigationDepth',
      };
    }

    return { allowed: true };
  }

  /**
   * Record an action (call after action completes)
   */
  recordAction(): void {
    this.actionCount++;
    this.actionsThisMinute++;
    this.lastActionTime = Date.now();
  }

  /**
   * Record a request
   */
  recordRequest(): void {
    this.requestCount++;
  }

  /**
   * Record navigation
   */
  recordNavigation(): void {
    this.navigationDepth++;
  }

  /**
   * Reset navigation depth (e.g., when returning to start)
   */
  resetNavigationDepth(): void {
    this.navigationDepth = 0;
  }

  /**
   * Get current statistics
   */
  getStats(): SafeModeStats {
    const now = Date.now();
    return {
      actionCount: this.actionCount,
      requestCount: this.requestCount,
      navigationDepth: this.navigationDepth,
      elapsedSeconds: (now - this.startTime) / 1000,
      actionsThisMinute: this.actionsThisMinute,
    };
  }

  /**
   * Check if a path matches a glob pattern
   */
  private matchesPattern(path: string, pattern: string): boolean {
    // Convert glob to regex
    const regexPattern = pattern
      .replace(/\*\*/g, '<<<GLOBSTAR>>>')
      .replace(/\*/g, '[^/]*')
      .replace(/<<<GLOBSTAR>>>/g, '.*');

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(path);
  }

  /**
   * Check if a selector might match a denied selector pattern
   */
  private selectorMatches(selector: string, deniedPattern: string): boolean {
    // Simple check - could be more sophisticated
    return selector.includes(deniedPattern) || deniedPattern.includes(selector);
  }
}

// ============================================================================
// Types for Actions and Results
// ============================================================================

/**
 * Chaos action representation
 */
export interface ChaosAction {
  /** Action type */
  type: 'click' | 'type' | 'submit' | 'navigate' | 'scroll' | 'hover' | 'login' | 'logout' | 'upload' | 'payment' | 'other';
  /** CSS selector for target element */
  selector?: string;
  /** Input value */
  value?: string;
  /** Target URL for navigation */
  url?: string;
  /** Action description */
  description?: string;
}

/**
 * Result of a safe mode check
 */
export interface SafeModeCheckResult {
  /** Whether the action is allowed */
  allowed: boolean;
  /** Reason if not allowed */
  reason?: string;
  /** Relevant pattern if pattern-based */
  pattern?: string;
  /** Relevant selector */
  selector?: string;
  /** Relevant action type */
  actionType?: string;
  /** Relevant value */
  value?: string;
  /** Limit that was exceeded */
  limit?: string;
  /** Time to wait in ms if rate limited */
  waitMs?: number;
}

/**
 * Safe mode statistics
 */
export interface SafeModeStats {
  /** Total actions performed */
  actionCount: number;
  /** Total HTTP requests */
  requestCount: number;
  /** Current navigation depth */
  navigationDepth: number;
  /** Elapsed time in seconds */
  elapsedSeconds: number;
  /** Actions in current minute */
  actionsThisMinute: number;
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a safe mode manager
 */
export function createSafeModeManager(config?: Partial<SafeModeConfig>): SafeModeManager {
  return new SafeModeManager(config);
}

/**
 * Create an aggressive mode manager
 */
export function createAggressiveModeManager(): SafeModeManager {
  return new SafeModeManager(AGGRESSIVE_MODE_CONFIG);
}

/**
 * Create a disabled safe mode manager (no restrictions)
 */
export function createDisabledSafeModeManager(): SafeModeManager {
  return new SafeModeManager({ enabled: false });
}
