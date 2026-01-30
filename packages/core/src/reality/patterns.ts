/**
 * Fake Detection Patterns
 * 
 * Patterns for detecting mock APIs, demo data, and fake responses.
 */

import type { FakePattern } from './types.js';

// ============================================================================
// Fake Domain Patterns
// ============================================================================

/**
 * Patterns that indicate a fake/mock API domain
 */
export const FAKE_DOMAIN_PATTERNS: FakePattern[] = [
  {
    id: 'localhost',
    name: 'Localhost',
    pattern: /localhost:\d+/i,
    category: 'domain',
    scoreImpact: -100,
    severity: 'critical',
  },
  {
    id: 'localhost_ip',
    name: 'Localhost IP',
    pattern: /127\.0\.0\.1:\d+/i,
    category: 'domain',
    scoreImpact: -100,
    severity: 'critical',
  },
  {
    id: 'jsonplaceholder',
    name: 'JSONPlaceholder',
    pattern: /jsonplaceholder\.typicode\.com/i,
    category: 'domain',
    scoreImpact: -100,
    severity: 'critical',
  },
  {
    id: 'reqres',
    name: 'Reqres',
    pattern: /reqres\.in/i,
    category: 'domain',
    scoreImpact: -100,
    severity: 'critical',
  },
  {
    id: 'mockapi',
    name: 'MockAPI.io',
    pattern: /mockapi\.io/i,
    category: 'domain',
    scoreImpact: -100,
    severity: 'critical',
  },
  {
    id: 'mocky',
    name: 'Mocky.io',
    pattern: /mocky\.io/i,
    category: 'domain',
    scoreImpact: -100,
    severity: 'critical',
  },
  {
    id: 'httpbin',
    name: 'HTTPBin',
    pattern: /httpbin\.org/i,
    category: 'domain',
    scoreImpact: -100,
    severity: 'critical',
  },
  {
    id: 'ngrok',
    name: 'Ngrok Tunnel',
    pattern: /\.ngrok\.io/i,
    category: 'domain',
    scoreImpact: -40,
    severity: 'warning',
  },
  {
    id: 'ngrok_free',
    name: 'Ngrok Free Tunnel',
    pattern: /\.ngrok-free\.app/i,
    category: 'domain',
    scoreImpact: -40,
    severity: 'warning',
  },
  {
    id: 'staging',
    name: 'Staging Domain',
    pattern: /staging\./i,
    category: 'domain',
    scoreImpact: -20,
    severity: 'warning',
  },
  {
    id: 'local_domain',
    name: 'Local Domain',
    pattern: /\.local\//i,
    category: 'domain',
    scoreImpact: -60,
    severity: 'critical',
  },
  {
    id: 'test_domain',
    name: 'Test Domain',
    pattern: /\.test\//i,
    category: 'domain',
    scoreImpact: -60,
    severity: 'critical',
  },
  {
    id: 'example_api',
    name: 'Example API',
    pattern: /api\.example\.com/i,
    category: 'domain',
    scoreImpact: -80,
    severity: 'critical',
  },
  {
    id: 'fake_api',
    name: 'Fake API',
    pattern: /fake\.api/i,
    category: 'domain',
    scoreImpact: -100,
    severity: 'critical',
  },
  {
    id: 'demo_api',
    name: 'Demo API',
    pattern: /demo\.api/i,
    category: 'domain',
    scoreImpact: -80,
    severity: 'critical',
  },
];

// ============================================================================
// Fake Response Patterns
// ============================================================================

/**
 * Patterns that indicate fake/demo data in responses
 */
export const FAKE_RESPONSE_PATTERNS: FakePattern[] = [
  {
    id: 'demo_invoice_id',
    name: 'Demo Invoice ID',
    pattern: /inv_demo_/i,
    category: 'response',
    scoreImpact: -20,
    severity: 'warning',
  },
  {
    id: 'demo_user_id',
    name: 'Demo User ID',
    pattern: /user_demo_/i,
    category: 'response',
    scoreImpact: -20,
    severity: 'warning',
  },
  {
    id: 'demo_customer_id',
    name: 'Demo Customer ID',
    pattern: /cus_demo_/i,
    category: 'response',
    scoreImpact: -20,
    severity: 'warning',
  },
  {
    id: 'demo_subscription_id',
    name: 'Demo Subscription ID',
    pattern: /sub_demo_/i,
    category: 'response',
    scoreImpact: -20,
    severity: 'warning',
  },
  {
    id: 'stripe_test_key',
    name: 'Stripe Test Key',
    pattern: /sk_test_/i,
    category: 'response',
    scoreImpact: -30,
    severity: 'warning',
  },
  {
    id: 'stripe_test_pk',
    name: 'Stripe Test Public Key',
    pattern: /pk_test_/i,
    category: 'response',
    scoreImpact: -30,
    severity: 'warning',
  },
  {
    id: 'demo_success_response',
    name: 'Demo Success Response',
    pattern: /"success":\s*true.*"demo"/i,
    category: 'response',
    scoreImpact: -40,
    severity: 'warning',
  },
  {
    id: 'lorem_ipsum',
    name: 'Lorem Ipsum Placeholder',
    pattern: /lorem\s+ipsum/i,
    category: 'response',
    scoreImpact: -60,
    severity: 'critical',
  },
  {
    id: 'placeholder_name',
    name: 'Placeholder Name',
    pattern: /john\.doe|jane\.doe/i,
    category: 'response',
    scoreImpact: -40,
    severity: 'warning',
  },
  {
    id: 'placeholder_email',
    name: 'Placeholder Email',
    pattern: /user@example\.com/i,
    category: 'response',
    scoreImpact: -40,
    severity: 'warning',
  },
  {
    id: 'placeholder_domain',
    name: 'Placeholder Domain/Image',
    pattern: /placeholder\.(com|jpg|png)/i,
    category: 'response',
    scoreImpact: -50,
    severity: 'warning',
  },
  {
    id: 'fake_id_pattern',
    name: 'Fake ID Pattern',
    pattern: /"id":\s*("demo"|"test"|"fake"|1234567890)/i,
    category: 'response',
    scoreImpact: -30,
    severity: 'warning',
  },
  {
    id: 'simulated_status',
    name: 'Simulated Status',
    pattern: /"status":\s*"simulated"/i,
    category: 'response',
    scoreImpact: -60,
    severity: 'critical',
  },
  {
    id: 'mock_flag',
    name: 'Mock Flag Enabled',
    pattern: /"mock":\s*true/i,
    category: 'response',
    scoreImpact: -80,
    severity: 'critical',
  },
  {
    id: 'demo_mode_flag',
    name: 'Demo Mode Flag',
    pattern: /"isDemo":\s*true/i,
    category: 'response',
    scoreImpact: -80,
    severity: 'critical',
  },
];

// ============================================================================
// Combined Patterns
// ============================================================================

/**
 * All fake detection patterns
 */
export const ALL_FAKE_PATTERNS: FakePattern[] = [
  ...FAKE_DOMAIN_PATTERNS,
  ...FAKE_RESPONSE_PATTERNS,
];

// ============================================================================
// Pattern Helpers
// ============================================================================

/**
 * Get patterns by category
 */
export function getPatternsByCategory(
  category: 'domain' | 'response'
): FakePattern[] {
  return ALL_FAKE_PATTERNS.filter(p => p.category === category);
}

/**
 * Get pattern by ID
 */
export function getPatternById(id: string): FakePattern | undefined {
  return ALL_FAKE_PATTERNS.find(p => p.id === id);
}

/**
 * Check if a URL matches any fake domain pattern
 */
export function matchesFakeDomain(url: string): FakePattern | null {
  for (const pattern of FAKE_DOMAIN_PATTERNS) {
    if (pattern.pattern.test(url)) {
      return pattern;
    }
  }
  return null;
}

/**
 * Check if response body matches any fake response pattern
 */
export function matchesFakeResponse(body: string): FakePattern[] {
  const matches: FakePattern[] = [];
  
  for (const pattern of FAKE_RESPONSE_PATTERNS) {
    if (pattern.pattern.test(body)) {
      matches.push(pattern);
    }
  }
  
  return matches;
}

// ============================================================================
// Real Data Signals
// ============================================================================

/**
 * Patterns that indicate real production data (boost score)
 */
export const REAL_DATA_SIGNALS = [
  {
    name: 'UUID',
    pattern: /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    scoreBoost: 5,
  },
  {
    name: 'ISO Date',
    pattern: /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
    scoreBoost: 5,
  },
  {
    name: 'Real Email Domain',
    pattern: /@(gmail|outlook|yahoo|hotmail|proton|icloud)\.(com|net|org)/i,
    scoreBoost: 3,
  },
];

/**
 * Check for real data signals in response
 */
export function countRealDataSignals(body: string): number {
  let boost = 0;
  
  for (const signal of REAL_DATA_SIGNALS) {
    const matches = body.match(signal.pattern);
    if (matches) {
      // Count unique matches, max 5 per signal type
      const count = Math.min(matches.length, 5);
      boost += signal.scoreBoost * count;
    }
  }
  
  return boost;
}
