/**
 * Runtime Rules for Reality Mode
 * 
 * Rules that check for fake data, missing routes, auth drift, etc.
 * Also includes sophisticated "vibe rules" for UI/UX integrity checks.
 */

import type { RuntimeRule, RuleContext, RuntimeRuleResult } from '../../types.js';
import { isMockApiUrl } from '../../safety/url-allowlist.js';
import { VIBE_RULES } from './vibe-rules.js';
import { INTERACTION_RULES } from './interaction-rules.js';

// ============================================================================
// Types
// ============================================================================

export interface RuleExecutionResult {
  rule: RuntimeRule;
  passed: boolean;
  message?: string;
  evidence?: Record<string, unknown>;
  durationMs: number;
}

// ============================================================================
// Rule: Fake Domain Detection
// ============================================================================

const ruleFakeDomain: RuntimeRule = {
  id: 'reality/fake-domain',
  name: 'Fake Domain Usage',
  description: 'Detects requests to known fake/mock API domains',
  severity: 'critical',
  
  check: async (context: RuleContext): Promise<RuntimeRuleResult> => {
    const mockDomains: string[] = [];
    
    for (const log of context.networkLogs) {
      if (isMockApiUrl(log.url)) {
        try {
          const domain = new URL(log.url).hostname;
          if (!mockDomains.includes(domain)) {
            mockDomains.push(domain);
          }
        } catch {
          // Ignore URL parse errors
        }
      }
    }
    
    if (mockDomains.length > 0) {
      return {
        pass: false,
        message: `Requests to mock API domains detected: ${mockDomains.join(', ')}`,
        evidence: { mockDomains },
      };
    }
    
    return { pass: true };
  },
};

// ============================================================================
// Rule: Missing Route Detection
// ============================================================================

const ruleMissingRoute: RuntimeRule = {
  id: 'reality/missing-route',
  name: 'Missing Route',
  description: 'Detects routes that return 404 at runtime but exist in truthpack',
  severity: 'high',
  
  check: async (context: RuleContext): Promise<RuntimeRuleResult> => {
    if (context.response.status === 404) {
      return {
        pass: false,
        message: `Route ${context.route.method} ${context.route.path} returned 404 but is declared in truthpack`,
        evidence: {
          expectedRoute: context.route,
          actualStatus: context.response.status,
        },
      };
    }
    
    return { pass: true };
  },
};

// ============================================================================
// Rule: Auth Drift Detection
// ============================================================================

const ruleAuthDrift: RuntimeRule = {
  id: 'reality/auth-drift',
  name: 'Auth Drift',
  description: 'Detects protected pages that render without auth gate',
  severity: 'critical',
  
  check: async (context: RuleContext): Promise<RuntimeRuleResult> => {
    // Skip if route doesn't require auth
    if (!context.route.auth?.required) {
      return { pass: true };
    }
    
    // Skip if we have auth context (we're testing as authenticated)
    if (context.authContext) {
      return { pass: true };
    }
    
    // Check if page was redirected to login
    const wasRedirected = context.response.url.toLowerCase().includes('login') ||
                          context.response.url.toLowerCase().includes('signin') ||
                          context.response.url.toLowerCase().includes('auth');
    
    // Check for 401/403 status
    const isUnauthorized = context.response.status === 401 || context.response.status === 403;
    
    // If not redirected and not unauthorized, potential auth drift
    if (!wasRedirected && !isUnauthorized && context.response.status === 200) {
      return {
        pass: false,
        message: `Protected route ${context.route.path} rendered content without authentication`,
        evidence: {
          route: context.route,
          expectedAuthRequired: true,
          actualStatus: context.response.status,
          redirectedToLogin: wasRedirected,
        },
      };
    }
    
    return { pass: true };
  },
};

// ============================================================================
// Rule: Fake Success Detection
// ============================================================================

const ruleFakeSuccess: RuntimeRule = {
  id: 'reality/fake-success',
  name: 'Fake Success UI',
  description: 'Detects success UI displayed despite network failures',
  severity: 'high',
  
  check: async (context: RuleContext): Promise<RuntimeRuleResult> => {
    // Check for failed network requests
    const failedRequests = context.networkLogs.filter(r => r.status >= 400);
    
    if (failedRequests.length === 0) {
      return { pass: true };
    }
    
    // If we have page access, check for success indicators
    if (context.page) {
      try {
        const page = context.page as {
          evaluate: <T>(fn: () => T) => Promise<T>;
        };
        
        const hasSuccessUI = await page.evaluate(() => {
          const successIndicators = [
            '.success',
            '.alert-success',
            '[data-success]',
            '.toast-success',
            '.notification-success',
            '[class*="success"]',
            '[data-testid*="success"]',
          ];
          
          for (const selector of successIndicators) {
            const element = document.querySelector(selector);
            if (element) {
              const style = window.getComputedStyle(element);
              if (style.display !== 'none' && style.visibility !== 'hidden') {
                return true;
              }
            }
          }
          
          return false;
        });
        
        if (hasSuccessUI) {
          return {
            pass: false,
            message: 'Success UI shown but network requests failed',
            evidence: {
              failedRequests: failedRequests.map(r => ({
                url: r.url,
                status: r.status,
                method: r.method,
              })),
              hasSuccessUI: true,
            },
          };
        }
      } catch {
        // Can't evaluate page, skip this check
      }
    }
    
    return { pass: true };
  },
};

// ============================================================================
// Rule: Console Errors
// ============================================================================

const ruleConsoleErrors: RuntimeRule = {
  id: 'reality/console-errors',
  name: 'Console Errors',
  description: 'Detects JavaScript errors in the browser console',
  severity: 'medium',
  
  check: async (context: RuleContext): Promise<RuntimeRuleResult> => {
    // Filter out noise
    const significantErrors = context.consoleErrors.filter(error => {
      const lower = error.toLowerCase();
      // Ignore common non-issues
      if (lower.includes('favicon')) return false;
      if (lower.includes('manifest.json')) return false;
      if (lower.includes('sourcemap')) return false;
      return true;
    });
    
    if (significantErrors.length > 0) {
      return {
        pass: false,
        message: `${significantErrors.length} console error(s) detected`,
        evidence: {
          errors: significantErrors.slice(0, 10),
          totalCount: significantErrors.length,
        },
      };
    }
    
    return { pass: true };
  },
};

// ============================================================================
// Rule: Network Failures
// ============================================================================

const ruleNetworkFailures: RuntimeRule = {
  id: 'reality/network-failures',
  name: 'Network Failures',
  description: 'Detects failed network requests (4xx, 5xx)',
  severity: 'medium',
  
  check: async (context: RuleContext): Promise<RuntimeRuleResult> => {
    const failures = context.networkLogs.filter(r => r.status >= 400);
    
    // Filter out expected 404s for static assets
    const significantFailures = failures.filter(f => {
      const url = f.url.toLowerCase();
      if (f.status === 404 && (url.includes('favicon') || url.includes('.map'))) {
        return false;
      }
      return true;
    });
    
    if (significantFailures.length > 0) {
      // Categorize by status
      const clientErrors = significantFailures.filter(f => f.status >= 400 && f.status < 500);
      const serverErrors = significantFailures.filter(f => f.status >= 500);
      
      const severity = serverErrors.length > 0 ? 'server errors' : 'client errors';
      
      return {
        pass: false,
        message: `${significantFailures.length} network failure(s) detected (${severity})`,
        evidence: {
          failures: significantFailures.slice(0, 10).map(f => ({
            url: f.url,
            status: f.status,
            method: f.method,
          })),
          clientErrors: clientErrors.length,
          serverErrors: serverErrors.length,
        },
      };
    }
    
    return { pass: true };
  },
};

// ============================================================================
// Rule: Slow Response
// ============================================================================

const ruleSlowResponse: RuntimeRule = {
  id: 'reality/slow-response',
  name: 'Slow Response',
  description: 'Detects slow page loads or API responses',
  severity: 'low',
  
  check: async (context: RuleContext): Promise<RuntimeRuleResult> => {
    const SLOW_THRESHOLD = 3000; // 3 seconds
    
    const slowRequests = context.networkLogs.filter(
      r => r.responseTime > SLOW_THRESHOLD
    );
    
    if (slowRequests.length > 0) {
      const avgResponseTime = slowRequests.reduce((sum, r) => sum + r.responseTime, 0) / slowRequests.length;
      
      return {
        pass: false,
        message: `${slowRequests.length} slow request(s) detected (avg ${Math.round(avgResponseTime)}ms)`,
        evidence: {
          slowRequests: slowRequests.slice(0, 5).map(r => ({
            url: r.url,
            responseTime: r.responseTime,
          })),
          averageResponseTime: avgResponseTime,
          threshold: SLOW_THRESHOLD,
        },
      };
    }
    
    return { pass: true };
  },
};

// ============================================================================
// Rule Registry
// ============================================================================

/**
 * Core rules - data integrity and network checks
 */
const CORE_RULES: RuntimeRule[] = [
  ruleFakeDomain,
  ruleMissingRoute,
  ruleAuthDrift,
  ruleFakeSuccess,
  ruleConsoleErrors,
  ruleNetworkFailures,
  ruleSlowResponse,
];

/**
 * All rules combined - core + vibe + interaction rules
 * 
 * Rule categories:
 * - reality/*: Core data integrity checks (fake domains, mock APIs, auth drift)
 * - vibe/*: UI/UX integrity checks (empty routes, broken buttons, placeholder text)
 * - interaction/*: Active verification (click buttons, fill forms, test dropdowns)
 */
const ALL_RULES: RuntimeRule[] = [
  ...CORE_RULES,
  ...VIBE_RULES,
  ...INTERACTION_RULES,
];

/**
 * Get all runtime rules (core + vibe rules)
 */
export function getAllRuntimeRules(): RuntimeRule[] {
  return [...ALL_RULES];
}

/**
 * Get only core rules (data integrity, network checks)
 */
export function getCoreRules(): RuntimeRule[] {
  return [...CORE_RULES];
}

/**
 * Get only vibe rules (UI/UX integrity checks)
 */
export function getVibeRules(): RuntimeRule[] {
  return [...VIBE_RULES];
}

/**
 * Get only interaction rules (active verification)
 */
export function getInteractionRules(): RuntimeRule[] {
  return [...INTERACTION_RULES];
}

/**
 * Get a runtime rule by ID
 */
export function getRuntimeRuleById(id: string): RuntimeRule | undefined {
  return ALL_RULES.find(r => r.id === id);
}

/**
 * Get rules by category prefix
 */
export function getRulesByCategory(category: 'reality' | 'vibe' | 'interaction'): RuntimeRule[] {
  return ALL_RULES.filter(r => r.id.startsWith(`${category}/`));
}

/**
 * Get rules by severity
 */
export function getRulesBySeverity(severity: 'critical' | 'high' | 'medium' | 'low' | 'info'): RuntimeRule[] {
  return ALL_RULES.filter(r => r.severity === severity);
}

// Re-export rules for direct access
export { VIBE_RULES } from './vibe-rules.js';
export { INTERACTION_RULES } from './interaction-rules.js';

/**
 * Execute all rules against a context
 */
export async function executeRules(
  rules: RuntimeRule[],
  context: RuleContext
): Promise<RuleExecutionResult[]> {
  const results: RuleExecutionResult[] = [];
  
  for (const rule of rules) {
    const startTime = Date.now();
    
    try {
      const result = await rule.check(context);
      
      results.push({
        rule,
        passed: result.pass,
        message: result.message,
        evidence: result.evidence,
        durationMs: Date.now() - startTime,
      });
    } catch (error) {
      results.push({
        rule,
        passed: false,
        message: error instanceof Error ? error.message : 'Rule execution failed',
        durationMs: Date.now() - startTime,
      });
    }
  }
  
  return results;
}
