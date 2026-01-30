/**
 * Secret Detection Patterns
 * 
 * Comprehensive patterns for detecting API keys, tokens, passwords, and other secrets.
 * Each pattern includes entropy thresholds for false positive reduction.
 */

import type { SecretPattern, SecretType, SecretSeverity } from './types.js';

// ============================================================================
// Cloud Provider Patterns
// ============================================================================

const AWS_PATTERNS: SecretPattern[] = [
  {
    id: 'aws_access_key',
    type: 'aws_access_key',
    name: 'AWS Access Key ID',
    pattern: /AKIA[0-9A-Z]{16}/,
    description: 'AWS Access Key ID starting with AKIA',
    minEntropy: 3.5,
    valueGroup: 0,
    severity: 'critical',
  },
  {
    id: 'aws_access_key_asia',
    type: 'aws_access_key',
    name: 'AWS Temporary Access Key ID',
    pattern: /ASIA[0-9A-Z]{16}/,
    description: 'AWS Temporary Access Key ID starting with ASIA',
    minEntropy: 3.5,
    valueGroup: 0,
    severity: 'critical',
  },
  {
    id: 'aws_secret_key',
    type: 'aws_secret_key',
    name: 'AWS Secret Access Key',
    pattern: /(?:aws[_-]?secret[_-]?(?:access[_-]?)?key|secret[_-]?key)\s*[:=]\s*['"]?([A-Za-z0-9/+=]{40})['"]?/i,
    description: 'AWS Secret Access Key (40 characters)',
    minEntropy: 4.2,
    valueGroup: 1,
    severity: 'critical',
  },
];

const GOOGLE_PATTERNS: SecretPattern[] = [
  {
    id: 'google_api_key',
    type: 'google_api_key',
    name: 'Google API Key',
    pattern: /AIza[0-9A-Za-z_-]{35}/,
    description: 'Google API Key starting with AIza',
    minEntropy: 3.5,
    valueGroup: 0,
    severity: 'high',
  },
];

// ============================================================================
// Version Control Patterns
// ============================================================================

const GITHUB_PATTERNS: SecretPattern[] = [
  {
    id: 'github_pat',
    type: 'github_token',
    name: 'GitHub Personal Access Token',
    pattern: /ghp_[a-zA-Z0-9]{36}/,
    description: 'GitHub Personal Access Token (classic)',
    minEntropy: 3.8,
    valueGroup: 0,
    severity: 'critical',
  },
  {
    id: 'github_oauth',
    type: 'github_oauth',
    name: 'GitHub OAuth Access Token',
    pattern: /gho_[a-zA-Z0-9]{36}/,
    description: 'GitHub OAuth Access Token',
    minEntropy: 3.8,
    valueGroup: 0,
    severity: 'critical',
  },
  {
    id: 'github_user_to_server',
    type: 'github_app',
    name: 'GitHub User-to-Server Token',
    pattern: /ghu_[a-zA-Z0-9]{36}/,
    description: 'GitHub User-to-Server Token',
    minEntropy: 3.8,
    valueGroup: 0,
    severity: 'critical',
  },
  {
    id: 'github_server_to_server',
    type: 'github_app',
    name: 'GitHub Server-to-Server Token',
    pattern: /ghs_[a-zA-Z0-9]{36}/,
    description: 'GitHub Server-to-Server Token',
    minEntropy: 3.8,
    valueGroup: 0,
    severity: 'critical',
  },
  {
    id: 'github_refresh',
    type: 'github_refresh',
    name: 'GitHub Refresh Token',
    pattern: /ghr_[a-zA-Z0-9]{36}/,
    description: 'GitHub Refresh Token',
    minEntropy: 3.8,
    valueGroup: 0,
    severity: 'critical',
  },
];

const GITLAB_PATTERNS: SecretPattern[] = [
  {
    id: 'gitlab_pat',
    type: 'gitlab_token',
    name: 'GitLab Personal Access Token',
    pattern: /glpat-[a-zA-Z0-9\-]{20}/,
    description: 'GitLab Personal Access Token',
    minEntropy: 3.5,
    valueGroup: 0,
    severity: 'critical',
  },
];

// ============================================================================
// Payment Patterns
// ============================================================================

const STRIPE_PATTERNS: SecretPattern[] = [
  {
    id: 'stripe_live_secret',
    type: 'stripe_live_key',
    name: 'Stripe Live Secret Key',
    pattern: /sk_live_[0-9a-zA-Z]{24,}/,
    description: 'Stripe Live Secret Key',
    minEntropy: 3.5,
    valueGroup: 0,
    severity: 'critical',
  },
  {
    id: 'stripe_live_restricted',
    type: 'stripe_restricted_key',
    name: 'Stripe Live Restricted Key',
    pattern: /rk_live_[0-9a-zA-Z]{24,}/,
    description: 'Stripe Live Restricted Key',
    minEntropy: 3.5,
    valueGroup: 0,
    severity: 'critical',
  },
  {
    id: 'stripe_test_secret',
    type: 'stripe_test_key',
    name: 'Stripe Test Secret Key',
    pattern: /sk_test_[0-9a-zA-Z]{24,}/,
    description: 'Stripe Test Secret Key',
    minEntropy: 3.0,
    valueGroup: 0,
    severity: 'medium',
  },
];

// ============================================================================
// Communication Patterns
// ============================================================================

const SLACK_PATTERNS: SecretPattern[] = [
  {
    id: 'slack_token',
    type: 'slack_token',
    name: 'Slack Token',
    pattern: /xox[baprs]-[0-9a-zA-Z\-]{10,}/,
    description: 'Slack Bot/User/App Token',
    minEntropy: 3.5,
    valueGroup: 0,
    severity: 'high',
  },
];

const SENDGRID_PATTERNS: SecretPattern[] = [
  {
    id: 'sendgrid_api_key',
    type: 'sendgrid_key',
    name: 'SendGrid API Key',
    pattern: /SG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43}/,
    description: 'SendGrid API Key',
    minEntropy: 4.0,
    valueGroup: 0,
    severity: 'high',
  },
];

const TWILIO_PATTERNS: SecretPattern[] = [
  {
    id: 'twilio_api_key',
    type: 'twilio_key',
    name: 'Twilio API Key',
    pattern: /SK[a-f0-9]{32}/,
    description: 'Twilio API Key',
    minEntropy: 3.5,
    valueGroup: 0,
    severity: 'high',
  },
];

// ============================================================================
// AI Provider Patterns
// ============================================================================

const AI_PATTERNS: SecretPattern[] = [
  {
    id: 'openai_api_key',
    type: 'openai_key',
    name: 'OpenAI API Key',
    pattern: /sk-[0-9a-zA-Z]{48}/,
    description: 'OpenAI API Key',
    minEntropy: 4.0,
    valueGroup: 0,
    severity: 'critical',
  },
  {
    id: 'anthropic_api_key',
    type: 'anthropic_key',
    name: 'Anthropic API Key',
    pattern: /sk-ant-[0-9a-zA-Z\-]{95}/,
    description: 'Anthropic API Key',
    minEntropy: 4.0,
    valueGroup: 0,
    severity: 'critical',
  },
];

// ============================================================================
// Authentication Patterns
// ============================================================================

const AUTH_PATTERNS: SecretPattern[] = [
  {
    id: 'jwt_token',
    type: 'jwt_token',
    name: 'JSON Web Token',
    pattern: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
    description: 'JSON Web Token (JWT)',
    minEntropy: 4.0,
    valueGroup: 0,
    severity: 'high',
  },
  {
    id: 'bearer_token',
    type: 'bearer_token',
    name: 'Bearer Token',
    pattern: /[Bb]earer\s+([a-zA-Z0-9_\-.~+/]+=*)/,
    description: 'HTTP Bearer Token',
    minEntropy: 3.5,
    valueGroup: 1,
    severity: 'high',
  },
];

// ============================================================================
// Cryptographic Patterns
// ============================================================================

const CRYPTO_PATTERNS: SecretPattern[] = [
  {
    id: 'private_key_rsa',
    type: 'private_key',
    name: 'RSA Private Key',
    pattern: /-----BEGIN RSA PRIVATE KEY-----/,
    description: 'RSA Private Key Header',
    minEntropy: 0, // Structure-based, not entropy
    valueGroup: 0,
    severity: 'critical',
  },
  {
    id: 'private_key_ec',
    type: 'private_key',
    name: 'EC Private Key',
    pattern: /-----BEGIN EC PRIVATE KEY-----/,
    description: 'EC Private Key Header',
    minEntropy: 0,
    valueGroup: 0,
    severity: 'critical',
  },
  {
    id: 'private_key_dsa',
    type: 'private_key',
    name: 'DSA Private Key',
    pattern: /-----BEGIN DSA PRIVATE KEY-----/,
    description: 'DSA Private Key Header',
    minEntropy: 0,
    valueGroup: 0,
    severity: 'critical',
  },
  {
    id: 'private_key_openssh',
    type: 'ssh_key',
    name: 'OpenSSH Private Key',
    pattern: /-----BEGIN OPENSSH PRIVATE KEY-----/,
    description: 'OpenSSH Private Key Header',
    minEntropy: 0,
    valueGroup: 0,
    severity: 'critical',
  },
  {
    id: 'private_key_generic',
    type: 'private_key',
    name: 'Private Key',
    pattern: /-----BEGIN PRIVATE KEY-----/,
    description: 'Generic Private Key Header',
    minEntropy: 0,
    valueGroup: 0,
    severity: 'critical',
  },
];

// ============================================================================
// Database Patterns
// ============================================================================

const DATABASE_PATTERNS: SecretPattern[] = [
  {
    id: 'mongodb_url',
    type: 'database_url',
    name: 'MongoDB Connection String',
    pattern: /mongodb(?:\+srv)?:\/\/[^:]+:[^@]+@[^\s"']+/i,
    description: 'MongoDB Connection String with credentials',
    minEntropy: 0, // Structure-based
    valueGroup: 0,
    severity: 'critical',
  },
  {
    id: 'postgres_url',
    type: 'database_url',
    name: 'PostgreSQL Connection String',
    pattern: /postgres(?:ql)?:\/\/[^:]+:[^@]+@[^\s"']+/i,
    description: 'PostgreSQL Connection String with credentials',
    minEntropy: 0,
    valueGroup: 0,
    severity: 'critical',
  },
  {
    id: 'mysql_url',
    type: 'database_url',
    name: 'MySQL Connection String',
    pattern: /mysql:\/\/[^:]+:[^@]+@[^\s"']+/i,
    description: 'MySQL Connection String with credentials',
    minEntropy: 0,
    valueGroup: 0,
    severity: 'critical',
  },
  {
    id: 'redis_url',
    type: 'database_url',
    name: 'Redis Connection String',
    pattern: /redis:\/\/[^:]+:[^@]+@[^\s"']+/i,
    description: 'Redis Connection String with credentials',
    minEntropy: 0,
    valueGroup: 0,
    severity: 'high',
  },
];

// ============================================================================
// Generic Patterns (require higher entropy)
// ============================================================================

const GENERIC_PATTERNS: SecretPattern[] = [
  {
    id: 'generic_api_key',
    type: 'api_key',
    name: 'Generic API Key',
    pattern: /['"]?api[_-]?key['"]?\s*[:=]\s*['"]([^'"]{16,})['"]?/i,
    description: 'Generic API Key assignment',
    minEntropy: 4.0,
    valueGroup: 1,
    severity: 'high',
  },
  {
    id: 'generic_secret',
    type: 'generic_secret',
    name: 'Generic Secret',
    pattern: /['"]?secret[_-]?key['"]?\s*[:=]\s*['"]([^'"]{16,})['"]?/i,
    description: 'Generic secret key assignment',
    minEntropy: 4.0,
    valueGroup: 1,
    severity: 'high',
  },
  {
    id: 'generic_password',
    type: 'password',
    name: 'Hardcoded Password',
    pattern: /['"]?password['"]?\s*[:=]\s*['"]([^'"]{8,})['"]?/i,
    description: 'Hardcoded password assignment',
    minEntropy: 3.0,
    valueGroup: 1,
    severity: 'high',
  },
  {
    id: 'generic_auth_token',
    type: 'bearer_token',
    name: 'Auth Token',
    pattern: /['"]?auth[_-]?token['"]?\s*[:=]\s*['"]([^'"]{16,})['"]?/i,
    description: 'Generic auth token assignment',
    minEntropy: 4.0,
    valueGroup: 1,
    severity: 'high',
  },
];

// ============================================================================
// All Patterns Combined
// ============================================================================

export const SECRET_PATTERNS: SecretPattern[] = [
  ...AWS_PATTERNS,
  ...GOOGLE_PATTERNS,
  ...GITHUB_PATTERNS,
  ...GITLAB_PATTERNS,
  ...STRIPE_PATTERNS,
  ...SLACK_PATTERNS,
  ...SENDGRID_PATTERNS,
  ...TWILIO_PATTERNS,
  ...AI_PATTERNS,
  ...AUTH_PATTERNS,
  ...CRYPTO_PATTERNS,
  ...DATABASE_PATTERNS,
  ...GENERIC_PATTERNS,
];

// ============================================================================
// Pattern Lookup Helpers
// ============================================================================

/**
 * Get pattern by ID
 */
export function getPatternById(id: string): SecretPattern | undefined {
  return SECRET_PATTERNS.find(p => p.id === id);
}

/**
 * Get patterns by type
 */
export function getPatternsByType(type: SecretType): SecretPattern[] {
  return SECRET_PATTERNS.filter(p => p.type === type);
}

/**
 * Get patterns by severity
 */
export function getPatternsBySeverity(severity: SecretSeverity): SecretPattern[] {
  return SECRET_PATTERNS.filter(p => p.severity === severity);
}

// ============================================================================
// False Positive Prevention
// ============================================================================

/**
 * Known placeholder/test values that should be ignored
 */
export const FALSE_POSITIVE_VALUES = new Set([
  'example',
  'test',
  'sample',
  'demo',
  'placeholder',
  'mock',
  'fake',
  'dummy',
  'your_key',
  'your_secret',
  'your_token',
  'changeme',
  'replace_me',
  'xxx',
  'password',
  'password123',
  'secret',
  'admin',
  '12345',
  'qwerty',
  'letmein',
  'abc123',
  'test123',
  'your-api-key',
  'your-secret-key',
  'insert-key-here',
  'api-key-here',
]);

/**
 * Patterns that indicate test/example context
 */
export const TEST_CONTEXT_PATTERNS = [
  /\.test\./i,
  /\.spec\./i,
  /__tests__/i,
  /__mocks__/i,
  /\/test\//i,
  /\/tests\//i,
  /\/fixtures\//i,
  /\/examples\//i,
  /\.example/i,
  /\.template/i,
  /\.sample/i,
  /\.env\.example/i,
  /\.env\.template/i,
  /\.env\.sample/i,
];

/**
 * Line context patterns that indicate false positives
 */
export const CONTEXT_EXCLUSION_PATTERNS = [
  // Schema/validation
  /\.min\s*\(/i,
  /\.max\s*\(/i,
  /\.length\s*[<>=]/i,
  /\bschema\b/i,
  /\bvalidat(?:ion|or)\b/i,
  /\bzod\./i,
  /\byup\./i,
  /\bjoi\./i,
  /\.string\s*\(\)/i,
  /\.required\s*\(/i,
  // Type definitions
  /:\s*string\s*[;,)]/i,
  /type\s+\w+\s*=/i,
  /interface\s+\w+/i,
  // Documentation/comments
  /\/\/.*example/i,
  /\/\*.*example.*\*\//i,
  /@param|@returns|@example/i,
  // Environment variable references (safe)
  /process\.env\.\w+/i,
  /import\.meta\.env\.\w+/i,
  /\$\{\s*\w+\s*\}/,
  // Test utilities
  /\bexpect\s*\(/i,
  /\bdescribe\s*\(/i,
  /\bit\s*\(/i,
  /\btest\s*\(/i,
  /\bjest\./i,
  /\bvitest\./i,
];
