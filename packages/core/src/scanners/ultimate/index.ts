/**
 * UltimateScanner - The World's Most Accurate Code Scanner
 * 
 * Combines the best of VibeCheck-Real and VibecheckOfficial with all missing patterns.
 * 
 * Categories:
 * - CREDENTIALS: Hardcoded API keys, secrets, passwords, tokens
 * - SECURITY: SQL injection, XSS, command injection, path traversal, SSRF, etc.
 * - FAKE_FEATURES: Empty functions, stub returns, optimistic error handling
 * - HALLUCINATIONS: Fake npm packages, placeholder URLs, made-up methods
 * - MOCK_DATA: Test data in production, placeholder content
 * - CODE_QUALITY: Ghost env vars, silent fails, dead code, auth drift
 */

import * as fs from 'fs';
import * as path from 'path';

// =============================================================================
// TYPES
// =============================================================================

export type Severity = 'critical' | 'high' | 'medium' | 'low';

export type Category = 
  | 'credentials'
  | 'security'
  | 'fake-features'
  | 'hallucinations'
  | 'mock-data'
  | 'code-quality';

export interface UltimateFinding {
  id: string;
  file: string;
  line: number;
  column?: number;
  code: string;
  rule: string;
  category: Category;
  severity: Severity;
  message: string;
  explanation?: string;
  fix?: string;
  confidence: number; // 0-100
}

export interface UltimateScanResult {
  findings: UltimateFinding[];
  scannedFiles: number;
  duration: number;
  summary: {
    total: number;
    bySeverity: Record<Severity, number>;
    byCategory: Record<Category, number>;
    critical: number;
    fixable: number;
  };
}

export interface UltimateScannerOptions {
  rootDir: string;
  excludePatterns?: string[];
  includePatterns?: string[];
  severityThreshold?: Severity;
  maxFileSize?: number;
  envFiles?: string[];
}

// =============================================================================
// CONSTANTS
// =============================================================================

const DEFAULT_EXCLUDE_PATTERNS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/.next/**',
  '**/.nuxt/**',
  '**/coverage/**',
  '**/.git/**',
  '**/vendor/**',
  '**/*.min.js',
  '**/*.bundle.js',
];

// Test file patterns - should NOT be scanned for most issues
const TEST_FILE_PATTERNS = [
  /__tests__\//,
  /__mocks__\//,
  /\.test\.(ts|tsx|js|jsx)$/,
  /\.spec\.(ts|tsx|js|jsx)$/,
  /\.stories\.(ts|tsx|js|jsx)$/,
  /test-utils?\.(ts|tsx|js|jsx)$/,
  /fixtures?\//,
  /mocks?\//,
  /setupTests\.(ts|js)$/,
  /jest\.config\./,
  /vitest\.config\./,
];

// Config/example file patterns - should NOT be flagged for credentials
const CONFIG_EXAMPLE_PATTERNS = [
  /\.example$/,
  /\.sample\./,
  /\.template\./,
  /examples?\//,
  /templates?\//,
  /docs?\//,
];

// Critical paths - issues here are more severe
const CRITICAL_PATHS = [
  /\/api\//,
  /\/auth\//,
  /\/payment/,
  /\/billing/,
  /\/admin/,
  /\/checkout/,
  /\/users\//,
  /\/account/,
];

// =============================================================================
// DETECTION PATTERNS
// =============================================================================

interface DetectionPattern {
  name: string;
  regex: RegExp;
  severity: Severity;
  category: Category;
  message: string;
  explanation?: string;
  fix?: string;
  confidence: number;
  excludeInTests?: boolean;
  multiline?: boolean;
  requiresContext?: (line: string, lines: string[], index: number) => boolean;
}

const PATTERNS: DetectionPattern[] = [
  // ==========================================================================
  // CREDENTIALS - Hardcoded secrets (19 patterns)
  // ==========================================================================
  {
    name: 'stripe-live-key',
    regex: /['"`](sk_live_[a-zA-Z0-9]{20,})['"`]/,
    severity: 'critical',
    category: 'credentials',
    message: 'Stripe live secret key hardcoded',
    explanation: 'Live API keys should never be committed to source code',
    fix: 'Use environment variable: process.env.STRIPE_SECRET_KEY',
    confidence: 98,
    excludeInTests: false, // Even test files shouldn't have live keys
  },
  {
    name: 'stripe-publishable-key',
    regex: /['"`](pk_live_[a-zA-Z0-9]{20,})['"`]/,
    severity: 'high',
    category: 'credentials',
    message: 'Stripe live publishable key hardcoded',
    explanation: 'While publishable keys are less sensitive, they should still be in env vars',
    fix: 'Use environment variable: process.env.NEXT_PUBLIC_STRIPE_KEY',
    confidence: 95,
    excludeInTests: true,
  },
  {
    name: 'stripe-test-key',
    regex: /['"`](sk_test_[a-zA-Z0-9]{20,})['"`]/,
    severity: 'high',
    category: 'credentials',
    message: 'Stripe test key hardcoded - should use env var',
    fix: 'Use environment variable even for test keys',
    confidence: 90,
    excludeInTests: true,
  },
  {
    name: 'aws-access-key',
    regex: /['"`](AKIA[0-9A-Z]{16})['"`]/,
    severity: 'critical',
    category: 'credentials',
    message: 'AWS Access Key ID hardcoded',
    explanation: 'AWS credentials can lead to complete infrastructure compromise',
    fix: 'Use AWS SDK credential chain or environment variables',
    confidence: 99,
    excludeInTests: false,
  },
  {
    name: 'aws-secret-key',
    regex: /aws_secret_access_key\s*[:=]\s*['"`]([^'"`]{20,})['"`]/i,
    severity: 'critical',
    category: 'credentials',
    message: 'AWS Secret Access Key hardcoded',
    fix: 'Use AWS_SECRET_ACCESS_KEY environment variable',
    confidence: 98,
    excludeInTests: false,
  },
  {
    name: 'openai-api-key',
    regex: /['"`](sk-[a-zA-Z0-9]{32,})['"`]/,
    severity: 'critical',
    category: 'credentials',
    message: 'OpenAI API key hardcoded',
    fix: 'Use OPENAI_API_KEY environment variable',
    confidence: 95,
    excludeInTests: true,
  },
  {
    name: 'anthropic-api-key',
    regex: /['"`](sk-ant-[a-zA-Z0-9-]{40,})['"`]/,
    severity: 'critical',
    category: 'credentials',
    message: 'Anthropic API key hardcoded',
    fix: 'Use ANTHROPIC_API_KEY environment variable',
    confidence: 98,
    excludeInTests: true,
  },
  {
    name: 'sendgrid-api-key',
    regex: /['"`](SG\.[a-zA-Z0-9_-]{22,}\.[a-zA-Z0-9_-]{20,})['"`]/,
    severity: 'critical',
    category: 'credentials',
    message: 'SendGrid API key hardcoded',
    fix: 'Use SENDGRID_API_KEY environment variable',
    confidence: 98,
    excludeInTests: true,
  },
  {
    name: 'twilio-account-sid',
    regex: /['"`](AC[a-f0-9]{32})['"`]/,
    severity: 'high',
    category: 'credentials',
    message: 'Twilio Account SID hardcoded',
    fix: 'Use TWILIO_ACCOUNT_SID environment variable',
    confidence: 95,
    excludeInTests: true,
  },
  {
    name: 'twilio-auth-token',
    regex: /twilio.*auth.*token.*['"`]([a-f0-9]{32})['"`]|['"`]([a-f0-9]{32})['"`].*twilio.*auth/i,
    severity: 'critical',
    category: 'credentials',
    message: 'Twilio Auth Token hardcoded',
    fix: 'Use TWILIO_AUTH_TOKEN environment variable',
    confidence: 85,
    excludeInTests: true,
  },
  {
    name: 'firebase-api-key',
    regex: /['"`](AIza[0-9A-Za-z-_]{35})['"`]/,
    severity: 'high',
    category: 'credentials',
    message: 'Firebase API key hardcoded',
    fix: 'Use NEXT_PUBLIC_FIREBASE_API_KEY environment variable',
    confidence: 95,
    excludeInTests: true,
  },
  {
    name: 'slack-token',
    regex: /['"`](xox[baprs]-[a-zA-Z0-9-]{10,})['"`]/,
    severity: 'critical',
    category: 'credentials',
    message: 'Slack token hardcoded',
    fix: 'Use SLACK_TOKEN environment variable',
    confidence: 98,
    excludeInTests: true,
  },
  {
    name: 'slack-webhook',
    regex: /hooks\.slack\.com\/services\/[A-Z0-9]+\/[A-Z0-9]+\/[a-zA-Z0-9]+/,
    severity: 'high',
    category: 'credentials',
    message: 'Slack webhook URL hardcoded',
    fix: 'Use SLACK_WEBHOOK_URL environment variable',
    confidence: 95,
    excludeInTests: true,
  },
  {
    name: 'jwt-secret',
    regex: /jwt[_-]?secret\s*[:=]\s*['"`]([^'"`]{8,})['"`]/i,
    severity: 'critical',
    category: 'credentials',
    message: 'JWT secret hardcoded',
    explanation: 'JWT secrets must be kept secure to prevent token forgery',
    fix: 'Use JWT_SECRET environment variable',
    confidence: 90,
    excludeInTests: true,
  },
  {
    name: 'private-key',
    regex: /-----BEGIN\s+(RSA\s+|EC\s+|OPENSSH\s+)?PRIVATE\s+KEY-----/,
    severity: 'critical',
    category: 'credentials',
    message: 'Private key embedded in source code',
    explanation: 'Private keys should never be in source control',
    fix: 'Store private keys in secure key management system',
    confidence: 99,
    excludeInTests: false,
  },
  {
    name: 'hardcoded-password',
    regex: /\bpassword\s*[:=]\s*['"`]([^'"`]{4,})['"`]/i,
    severity: 'critical',
    category: 'credentials',
    message: 'Password hardcoded in source code',
    fix: 'Use environment variable or secure credential storage',
    confidence: 85,
    excludeInTests: true,
  },
  {
    name: 'database-connection-string',
    regex: /(mongodb(\+srv)?|postgres(ql)?|mysql|redis):\/\/[^:]+:[^@]+@[^\s'"]+/i,
    severity: 'critical',
    category: 'credentials',
    message: 'Database connection string with credentials hardcoded',
    fix: 'Use DATABASE_URL environment variable',
    confidence: 98,
    excludeInTests: true,
  },
  {
    name: 'sentry-dsn',
    regex: /https:\/\/[a-f0-9]+@[a-z0-9.]+\.ingest\.sentry\.io\/\d+/,
    severity: 'high',
    category: 'credentials',
    message: 'Sentry DSN hardcoded',
    fix: 'Use SENTRY_DSN environment variable',
    confidence: 95,
    excludeInTests: true,
  },
  {
    name: 'insecure-env-fallback',
    regex: /process\.env\.(\w+)\s*(\?\?|\|\|)\s*['"`]([^'"`]{8,})['"`]/,
    severity: 'high',
    category: 'credentials',
    message: 'Insecure fallback value for environment variable',
    explanation: 'Fallback values may leak into production if env var is missing',
    fix: 'Throw an error if required env vars are missing',
    confidence: 85,
    excludeInTests: true,
  },

  // ==========================================================================
  // SECURITY VULNERABILITIES (20 patterns)
  // ==========================================================================
  {
    name: 'sql-injection-template',
    regex: /['"`]SELECT\s+.*\$\{/i,
    severity: 'critical',
    category: 'security',
    message: 'SQL injection vulnerability - template literal in query',
    explanation: 'User input in SQL queries can allow data theft or deletion',
    fix: 'Use parameterized queries: pool.query("SELECT * FROM users WHERE id = $1", [id])',
    confidence: 95,
    excludeInTests: true,
  },
  {
    name: 'sql-injection-concat',
    regex: /['"`]SELECT\s+[^'"`]*['"`]\s*\+\s*\w+/i,
    severity: 'critical',
    category: 'security',
    message: 'SQL injection vulnerability - string concatenation in query',
    fix: 'Use parameterized queries instead of string concatenation',
    confidence: 90,
    excludeInTests: true,
  },
  {
    name: 'sql-injection-query',
    regex: /\.query\s*\(\s*`[^`]*\$\{/,
    severity: 'critical',
    category: 'security',
    message: 'SQL injection - interpolation in query method',
    fix: 'Use parameterized queries',
    confidence: 95,
    excludeInTests: true,
  },
  {
    name: 'dangerous-innerhtml',
    regex: /dangerouslySetInnerHTML\s*=\s*\{\s*\{\s*__html\s*:/,
    severity: 'critical',
    category: 'security',
    message: 'XSS vulnerability - dangerouslySetInnerHTML used',
    explanation: 'Unsanitized HTML can execute malicious scripts',
    fix: 'Use DOMPurify to sanitize HTML or avoid innerHTML entirely',
    confidence: 90,
    excludeInTests: true,
  },
  {
    name: 'innerhtml-assignment',
    regex: /\.innerHTML\s*=\s*[^'"`]/,
    severity: 'critical',
    category: 'security',
    message: 'XSS vulnerability - innerHTML assignment with dynamic value',
    fix: 'Use textContent for text or sanitize HTML with DOMPurify',
    confidence: 85,
    excludeInTests: true,
  },
  {
    name: 'command-injection-exec',
    regex: /\bexec(Sync)?\s*\(\s*`[^`]*\$\{/,
    severity: 'critical',
    category: 'security',
    message: 'Command injection vulnerability - user input in exec',
    explanation: 'Attackers can execute arbitrary system commands',
    fix: 'Use spawn with array arguments or validate/escape input strictly',
    confidence: 95,
    excludeInTests: true,
  },
  {
    name: 'command-injection-concat',
    regex: /\bexec(Sync)?\s*\(\s*['"`][^'"`]*['"`]\s*\+/,
    severity: 'critical',
    category: 'security',
    message: 'Command injection - string concatenation in exec',
    fix: 'Use spawn with array arguments instead',
    confidence: 90,
    excludeInTests: true,
  },
  {
    name: 'command-injection-spawn-shell',
    regex: /spawn\s*\([^,]+,\s*\{[^}]*shell\s*:\s*true/,
    severity: 'critical',
    category: 'security',
    message: 'Command injection risk - spawn with shell: true',
    fix: 'Use spawn without shell option and pass args as array',
    confidence: 85,
    excludeInTests: true,
  },
  {
    name: 'path-traversal-concat',
    regex: /['"`]\.\/[^'"`]*['"`]\s*\+\s*\w+/,
    severity: 'critical',
    category: 'security',
    message: 'Path traversal vulnerability - user input in file path',
    fix: 'Use path.basename() to strip directory components and validate input',
    confidence: 85,
    excludeInTests: true,
  },
  {
    name: 'path-traversal-template',
    regex: /`\.\/[^`]*\$\{[^}]+\}/,
    severity: 'critical',
    category: 'security',
    message: 'Path traversal - template literal in file path',
    fix: 'Validate and sanitize file paths, use allowlist of valid paths',
    confidence: 85,
    excludeInTests: true,
  },
  {
    name: 'ssrf-vulnerability',
    regex: /fetch\s*\(\s*req\.(query|params|body)\.\w+/,
    severity: 'critical',
    category: 'security',
    message: 'SSRF vulnerability - user-controlled URL in fetch',
    explanation: 'Attackers can access internal services or cloud metadata',
    fix: 'Validate URLs against allowlist of permitted domains',
    confidence: 90,
    excludeInTests: true,
  },
  {
    name: 'ssrf-url-param',
    regex: /(fetch|axios|got|request)\s*\(\s*\w*[Uu]rl/,
    severity: 'high',
    category: 'security',
    message: 'Potential SSRF - URL from variable (verify source)',
    fix: 'Ensure URL is validated against allowlist before use',
    confidence: 70,
    excludeInTests: true,
  },
  {
    name: 'eval-usage',
    regex: /\beval\s*\(/,
    severity: 'critical',
    category: 'security',
    message: 'Code injection risk - eval() usage',
    explanation: 'eval can execute arbitrary code from user input',
    fix: 'Use safer alternatives like JSON.parse() or specific parsers',
    confidence: 95,
    excludeInTests: true,
  },
  {
    name: 'function-constructor',
    regex: /new\s+Function\s*\(/,
    severity: 'critical',
    category: 'security',
    message: 'Code injection risk - Function constructor',
    fix: 'Avoid dynamic code generation, use safer alternatives',
    confidence: 90,
    excludeInTests: true,
  },
  {
    name: 'weak-hash-md5',
    regex: /createHash\s*\(\s*['"`]md5['"`]\s*\)/,
    severity: 'high',
    category: 'security',
    message: 'Weak cryptographic hash - MD5 is broken',
    fix: 'Use SHA-256 or stronger: createHash("sha256")',
    confidence: 95,
    excludeInTests: true,
  },
  {
    name: 'weak-hash-sha1',
    regex: /createHash\s*\(\s*['"`]sha1['"`]\s*\)/,
    severity: 'high',
    category: 'security',
    message: 'Weak cryptographic hash - SHA1 is deprecated',
    fix: 'Use SHA-256 or stronger: createHash("sha256")',
    confidence: 95,
    excludeInTests: true,
  },
  {
    name: 'weak-cipher',
    regex: /createCipher(iv)?\s*\(\s*['"`](des|rc4|rc2|blowfish)['"`]/i,
    severity: 'critical',
    category: 'security',
    message: 'Weak encryption algorithm',
    fix: 'Use AES-256-GCM: createCipheriv("aes-256-gcm", key, iv)',
    confidence: 95,
    excludeInTests: true,
  },
  {
    name: 'insecure-random',
    regex: /Math\.random\s*\(\)/,
    severity: 'high',
    category: 'security',
    message: 'Insecure random number generation',
    explanation: 'Math.random() is predictable and not suitable for security',
    fix: 'Use crypto.randomBytes() or crypto.randomUUID()',
    confidence: 80,
    excludeInTests: true,
    requiresContext: (line) => {
      // Only flag if used for security purposes
      const securityContexts = ['token', 'secret', 'password', 'key', 'session', 'auth', 'id'];
      return securityContexts.some(ctx => line.toLowerCase().includes(ctx));
    },
  },
  {
    name: 'cors-wildcard',
    regex: /Access-Control-Allow-Origin['":\s]*\*|origin\s*:\s*['"`]?\*/,
    severity: 'high',
    category: 'security',
    message: 'CORS misconfiguration - wildcard origin',
    explanation: 'Wildcard CORS allows any website to make requests',
    fix: 'Specify allowed origins explicitly',
    confidence: 90,
    excludeInTests: true,
  },
  {
    name: 'prototype-pollution',
    regex: /\[req\.(body|query|params)\[/,
    severity: 'critical',
    category: 'security',
    message: 'Prototype pollution vulnerability',
    explanation: 'User input as object key can pollute Object.prototype',
    fix: 'Use Object.create(null) or validate keys against allowlist',
    confidence: 85,
    excludeInTests: true,
  },
  {
    name: 'open-redirect',
    regex: /res\.redirect\s*\(\s*req\.(query|params|body)\.\w+\s*\)/,
    severity: 'high',
    category: 'security',
    message: 'Open redirect vulnerability',
    explanation: 'Attackers can redirect users to malicious sites',
    fix: 'Validate redirect URLs against allowlist of trusted domains',
    confidence: 90,
    excludeInTests: true,
  },
  {
    name: 'mass-assignment',
    regex: /Object\.assign\s*\([^,]+,\s*req\.body\s*\)|\.findByIdAndUpdate\s*\([^,]+,\s*req\.body\s*\)/,
    severity: 'high',
    category: 'security',
    message: 'Mass assignment vulnerability',
    explanation: 'User can set any object property including admin flags',
    fix: 'Explicitly pick allowed fields from request body',
    confidence: 85,
    excludeInTests: true,
  },
  {
    name: 'regex-dos',
    regex: /new\s+RegExp\s*\(\s*(req|user|input)/,
    severity: 'high',
    category: 'security',
    message: 'ReDoS vulnerability - user-controlled regex',
    fix: 'Use fixed regex patterns or validate user input strictly',
    confidence: 85,
    excludeInTests: true,
  },

  // ==========================================================================
  // FAKE FEATURES (14 patterns)
  // ==========================================================================
  {
    name: 'empty-function',
    regex: /function\s+\w+\s*\([^)]*\)\s*\{\s*\}/,
    severity: 'high',
    category: 'fake-features',
    message: 'Empty function body - feature not implemented',
    fix: 'Implement the function or throw NotImplementedError',
    confidence: 90,
    excludeInTests: true,
  },
  {
    name: 'empty-arrow-function',
    regex: /=>\s*\{\s*\}/,
    severity: 'high',
    category: 'fake-features',
    message: 'Empty arrow function - no implementation',
    fix: 'Implement the function or remove it',
    confidence: 85,
    excludeInTests: true,
    requiresContext: (line) => {
      // Skip if it's a noop callback
      return !line.includes('noop') && !line.includes('// intentional');
    },
  },
  {
    name: 'optimistic-catch-success',
    regex: /catch\s*\([^)]*\)\s*\{[^}]*return\s*\{\s*success\s*:\s*true/,
    severity: 'critical',
    category: 'fake-features',
    message: 'Optimistic error handling - returns success on error',
    explanation: 'Error is swallowed and success is reported falsely',
    fix: 'Return { success: false, error: error.message } in catch block',
    confidence: 95,
    excludeInTests: true,
  },
  {
    name: 'catch-return-true',
    regex: /catch\s*\([^)]*\)\s*\{[^}]*return\s+true/,
    severity: 'critical',
    category: 'fake-features',
    message: 'Error swallowed - returns true despite error',
    fix: 'Return false or throw error in catch block',
    confidence: 90,
    excludeInTests: true,
  },
  {
    name: 'stub-success-return',
    regex: /return\s*\{\s*success\s*:\s*true\s*,?\s*\}[^;]*$/,
    severity: 'high',
    category: 'fake-features',
    message: 'Stub return - always returns success without logic',
    fix: 'Implement actual logic or throw NotImplementedError',
    confidence: 75,
    excludeInTests: true,
  },
  {
    name: 'not-implemented-error',
    regex: /throw\s+new\s+Error\s*\(\s*['"`]Not\s+implemented/i,
    severity: 'high',
    category: 'fake-features',
    message: 'Function throws NotImplementedError',
    fix: 'Implement the function before shipping',
    confidence: 95,
    excludeInTests: true,
  },
  {
    name: 'todo-implement',
    regex: /\/\/\s*TODO\s*:?\s*(implement|add|complete|finish)/i,
    severity: 'medium',
    category: 'fake-features',
    message: 'TODO: implementation pending',
    fix: 'Complete the implementation before shipping',
    confidence: 90,
    excludeInTests: true,
  },
  {
    name: 'fixme-comment',
    regex: /\/\/\s*FIXME\s*:/i,
    severity: 'medium',
    category: 'fake-features',
    message: 'FIXME: known bug not fixed',
    fix: 'Fix the issue before shipping',
    confidence: 95,
    excludeInTests: true,
  },
  {
    name: 'hack-comment',
    regex: /\/\/\s*HACK\s*:/i,
    severity: 'medium',
    category: 'fake-features',
    message: 'HACK: temporary workaround in production code',
    fix: 'Replace hack with proper implementation',
    confidence: 90,
    excludeInTests: true,
  },
  {
    name: 'auth-always-true',
    regex: /return\s+true\s*;?\s*\/\/\s*(todo|implement|fix|check)/i,
    severity: 'critical',
    category: 'fake-features',
    message: 'Authentication/authorization always returns true',
    explanation: 'This bypasses all security checks',
    fix: 'Implement proper authentication logic',
    confidence: 90,
    excludeInTests: true,
  },
  {
    name: 'console-only-function',
    regex: /function\s+\w+\s*\([^)]*\)\s*\{\s*console\.log\s*\([^)]*\)\s*;?\s*\}/,
    severity: 'medium',
    category: 'fake-features',
    message: 'Function only contains console.log - no real logic',
    fix: 'Implement actual functionality',
    confidence: 85,
    excludeInTests: true,
  },
  {
    name: 'hardcoded-calculation',
    regex: /return\s+\w+\s*\*\s*0\.\d+\s*;/,
    severity: 'medium',
    category: 'fake-features',
    message: 'Hardcoded calculation - ignores input parameters',
    fix: 'Implement proper calculation logic',
    confidence: 70,
    excludeInTests: true,
  },

  // ==========================================================================
  // HALLUCINATIONS (11 patterns)
  // ==========================================================================
  {
    name: 'fake-npm-package',
    regex: /from\s+['"`](json-schema-validator-pro|crypto-secure-utils|super-fast-cache|email-validator-advanced|date-format-utils|http-request-helper|data-transform-utils|config-loader-pro|logger-factory-utils|queue-manager-pro|express-smart-router|reactive-state-manager|graphql-query-helper|mongoose-utils-pro|sequelize-helper-advanced)['"`]/,
    severity: 'critical',
    category: 'hallucinations',
    message: 'Import from non-existent npm package (AI hallucination)',
    explanation: 'This package does not exist on npm - likely AI-generated code',
    fix: 'Find real package that provides this functionality or implement it',
    confidence: 99,
    excludeInTests: true,
  },
  {
    name: 'fake-lodash-path',
    regex: /from\s+['"`]lodash\/[a-z]+\/[a-z]+['"`]/,
    severity: 'critical',
    category: 'hallucinations',
    message: 'Import from non-existent lodash subpath',
    fix: 'Use correct lodash import path',
    confidence: 95,
    excludeInTests: true,
  },
  {
    name: 'example-domain-url',
    regex: /['"`]https?:\/\/(api\.)?example\.(com|org|net)[^'"`]*['"`]/,
    severity: 'high',
    category: 'hallucinations',
    message: 'Placeholder URL (example.com) in production code',
    fix: 'Replace with real API endpoint',
    confidence: 90,
    excludeInTests: true,
  },
  {
    name: 'localhost-url',
    regex: /['"`]https?:\/\/localhost(:\d+)?[^'"`]*['"`]/,
    severity: 'high',
    category: 'hallucinations',
    message: 'Localhost URL in non-development code',
    fix: 'Use environment variable for API URL',
    confidence: 85,
    excludeInTests: true,
  },
  {
    name: 'placeholder-url',
    regex: /['"`]https?:\/\/your-[a-z-]+\.(com|io|org)[^'"`]*['"`]/,
    severity: 'high',
    category: 'hallucinations',
    message: 'Placeholder URL pattern (your-*.com)',
    fix: 'Replace with actual URL or environment variable',
    confidence: 95,
    excludeInTests: true,
  },
  {
    name: 'test-api-url',
    regex: /['"`]https?:\/\/(httpbin\.org|jsonplaceholder\.typicode\.com|reqres\.in)[^'"`]*['"`]/,
    severity: 'high',
    category: 'hallucinations',
    message: 'Test API URL in production code',
    fix: 'Replace with real API endpoint',
    confidence: 90,
    excludeInTests: true,
  },
  {
    name: 'todo-url',
    regex: /['"`]https?:\/\/[^'"`]*TODO[^'"`]*['"`]/i,
    severity: 'high',
    category: 'hallucinations',
    message: 'URL contains TODO placeholder',
    fix: 'Replace with actual URL',
    confidence: 95,
    excludeInTests: true,
  },
  {
    name: 'nonexistent-method',
    regex: /\.(setGlobalMiddleware|setDefaultHeaders|registerPlugin|setGlobalConfig)\s*\(/,
    severity: 'high',
    category: 'hallucinations',
    message: 'Call to non-existent method (AI hallucination)',
    fix: 'Use actual method from the library documentation',
    confidence: 85,
    excludeInTests: true,
  },
  {
    name: 'wrong-middleware-signature',
    regex: /app\.middleware\s*\(\s*\{/,
    severity: 'high',
    category: 'hallucinations',
    message: 'Incorrect middleware signature',
    fix: 'Use app.use() with function argument',
    confidence: 90,
    excludeInTests: true,
  },
  {
    name: 'deprecated-express-send',
    regex: /res\.send\s*\(\s*\{[^}]*status[^}]*\}\s*\)/,
    severity: 'medium',
    category: 'hallucinations',
    message: 'Deprecated Express response pattern',
    fix: 'Use res.status(code).json(data)',
    confidence: 70,
    excludeInTests: true,
  },

  // ==========================================================================
  // MOCK DATA (9 patterns)
  // ==========================================================================
  {
    name: 'test-email',
    regex: /['"`](test|fake|dummy|sample)@(example|test|fake)\.(com|org|net)['"`]/i,
    severity: 'medium',
    category: 'mock-data',
    message: 'Test/placeholder email in production code',
    fix: 'Remove test data or use proper test fixtures',
    confidence: 90,
    excludeInTests: true,
  },
  {
    name: 'john-doe-data',
    regex: /['"`](John|Jane)\s+(Doe|Smith)['"`]/,
    severity: 'medium',
    category: 'mock-data',
    message: 'Placeholder name (John/Jane Doe) in production code',
    fix: 'Remove placeholder data',
    confidence: 90,
    excludeInTests: true,
  },
  {
    name: 'placeholder-id',
    regex: /['"`](user_123|txn_123456789|id_12345|test_\d+)['"`]/,
    severity: 'medium',
    category: 'mock-data',
    message: 'Placeholder ID in production code',
    fix: 'Remove test IDs or use proper test fixtures',
    confidence: 85,
    excludeInTests: true,
  },
  {
    name: 'null-uuid',
    regex: /['"`]00000000-0000-0000-0000-000000000000['"`]/,
    severity: 'medium',
    category: 'mock-data',
    message: 'Null UUID placeholder in production code',
    fix: 'Generate proper UUIDs',
    confidence: 95,
    excludeInTests: true,
  },
  {
    name: 'lorem-ipsum',
    regex: /lorem\s+ipsum/i,
    severity: 'low',
    category: 'mock-data',
    message: 'Lorem ipsum placeholder text',
    fix: 'Replace with actual content',
    confidence: 99,
    excludeInTests: true,
  },
  {
    name: 'debug-mode-flag',
    regex: /\b(debugMode|testMode|demoMode|devMode)\s*[:=]\s*true\b/,
    severity: 'high',
    category: 'mock-data',
    message: 'Debug/test mode flag enabled',
    fix: 'Set to false in production or use environment check',
    confidence: 90,
    excludeInTests: true,
  },
  {
    name: 'skip-auth-flag',
    regex: /\b(skipAuth|bypassAuth|disableAuth)\s*[:=]\s*true\b/,
    severity: 'critical',
    category: 'mock-data',
    message: 'Authentication bypass flag enabled',
    fix: 'Remove auth bypass or ensure it only works in development',
    confidence: 95,
    excludeInTests: true,
  },
  {
    name: 'test-phone-number',
    regex: /['"`](\+1\s*)?555-\d{3}-\d{4}['"`]/,
    severity: 'low',
    category: 'mock-data',
    message: 'Test phone number (555-xxx-xxxx)',
    fix: 'Remove test data',
    confidence: 95,
    excludeInTests: true,
  },
  {
    name: 'debug-user',
    regex: /id\s*:\s*['"`](debug|test|admin)['"`]|name\s*:\s*['"`](Debug|Test)\s+User['"`]/,
    severity: 'high',
    category: 'mock-data',
    message: 'Debug/test user in production code',
    fix: 'Remove debug user data',
    confidence: 90,
    excludeInTests: true,
  },

  // ==========================================================================
  // CODE QUALITY (from VibecheckOfficial)
  // ==========================================================================
  {
    name: 'empty-catch-block',
    regex: /catch\s*\(\s*\w*\s*\)\s*\{\s*\}/,
    severity: 'high',
    category: 'code-quality',
    message: 'Empty catch block - errors are silently swallowed',
    explanation: 'Errors disappear with no logging or feedback',
    fix: 'Add error logging or user feedback in catch block',
    confidence: 95,
    excludeInTests: true,
  },
  {
    name: 'silent-catch',
    regex: /catch\s*\(\s*\w+\s*\)\s*\{\s*(\/\/[^\n]*\n\s*)*\}/,
    severity: 'medium',
    category: 'code-quality',
    message: 'Silent catch block - only has comments',
    fix: 'Add error handling or at least console.error',
    confidence: 85,
    excludeInTests: true,
  },
  {
    name: 'auth-bypass-dev-mode',
    regex: /NODE_ENV.*[=!]=.*['"`](development|dev)['"`].*return\s+next\(\)/,
    severity: 'critical',
    category: 'code-quality',
    message: 'Auth bypass in development mode (may leak to production)',
    fix: 'Remove development-only auth bypasses',
    confidence: 90,
    excludeInTests: true,
  },
  {
    name: 'query-param-bypass',
    regex: /req\.query\.(bypass|debug|skip|admin)\s*===?\s*['"`]?(true|1)/,
    severity: 'critical',
    category: 'code-quality',
    message: 'Auth bypass via query parameter',
    fix: 'Remove query parameter bypasses',
    confidence: 95,
    excludeInTests: true,
  },
  {
    name: 'hardcoded-admin-creds',
    regex: /username\s*===?\s*['"`]admin['"`]\s*&&\s*password\s*===?\s*['"`][^'"`]+['"`]/,
    severity: 'critical',
    category: 'code-quality',
    message: 'Hardcoded admin credentials in authentication',
    fix: 'Remove backdoor admin accounts',
    confidence: 98,
    excludeInTests: true,
  },

  // ==========================================================================
  // ADDITIONAL CREDENTIALS (GitHub, npm, Google, Azure, etc.)
  // ==========================================================================
  {
    name: 'github-personal-token',
    regex: /['"`](ghp_[a-zA-Z0-9]{36})['"`]/,
    severity: 'critical',
    category: 'credentials',
    message: 'GitHub Personal Access Token hardcoded',
    fix: 'Use GITHUB_TOKEN environment variable',
    confidence: 99,
    excludeInTests: false,
  },
  {
    name: 'github-oauth-token',
    regex: /['"`](gho_[a-zA-Z0-9]{36})['"`]/,
    severity: 'critical',
    category: 'credentials',
    message: 'GitHub OAuth Token hardcoded',
    fix: 'Use environment variable for GitHub OAuth',
    confidence: 99,
    excludeInTests: false,
  },
  {
    name: 'github-app-token',
    regex: /['"`](ghu_[a-zA-Z0-9]{36}|ghs_[a-zA-Z0-9]{36})['"`]/,
    severity: 'critical',
    category: 'credentials',
    message: 'GitHub App Token hardcoded',
    fix: 'Use environment variable for GitHub App credentials',
    confidence: 99,
    excludeInTests: false,
  },
  {
    name: 'npm-token',
    regex: /['"`](npm_[a-zA-Z0-9]{36})['"`]/,
    severity: 'critical',
    category: 'credentials',
    message: 'NPM Access Token hardcoded',
    fix: 'Use NPM_TOKEN environment variable',
    confidence: 98,
    excludeInTests: false,
  },
  {
    name: 'google-oauth-client-secret',
    regex: /client_secret['"`]?\s*[:=]\s*['"`]([a-zA-Z0-9_-]{24})['"`]/,
    severity: 'critical',
    category: 'credentials',
    message: 'Google OAuth Client Secret hardcoded',
    fix: 'Use GOOGLE_CLIENT_SECRET environment variable',
    confidence: 85,
    excludeInTests: true,
  },
  {
    name: 'azure-client-secret',
    regex: /['"`]([a-zA-Z0-9_~.-]{34,40})['"`].*azure|azure.*['"`]([a-zA-Z0-9_~.-]{34,40})['"`]/i,
    severity: 'critical',
    category: 'credentials',
    message: 'Azure Client Secret hardcoded',
    fix: 'Use AZURE_CLIENT_SECRET environment variable',
    confidence: 75,
    excludeInTests: true,
  },
  {
    name: 'mailchimp-api-key',
    regex: /['"`]([a-f0-9]{32}-us\d{1,2})['"`]/,
    severity: 'high',
    category: 'credentials',
    message: 'Mailchimp API Key hardcoded',
    fix: 'Use MAILCHIMP_API_KEY environment variable',
    confidence: 95,
    excludeInTests: true,
  },
  {
    name: 'discord-bot-token',
    regex: /['"`]([MN][A-Za-z0-9]{23,28}\.[A-Za-z0-9-_]{6}\.[A-Za-z0-9-_]{27,38})['"`]/,
    severity: 'critical',
    category: 'credentials',
    message: 'Discord Bot Token hardcoded',
    fix: 'Use DISCORD_BOT_TOKEN environment variable',
    confidence: 95,
    excludeInTests: true,
  },
  {
    name: 'telegram-bot-token',
    regex: /['"`](\d{8,10}:[A-Za-z0-9_-]{35})['"`]/,
    severity: 'critical',
    category: 'credentials',
    message: 'Telegram Bot Token hardcoded',
    fix: 'Use TELEGRAM_BOT_TOKEN environment variable',
    confidence: 95,
    excludeInTests: true,
  },
  {
    name: 'heroku-api-key',
    regex: /['"`]([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})['"`].*heroku|heroku.*['"`]([a-f0-9-]{36})['"`]/i,
    severity: 'high',
    category: 'credentials',
    message: 'Heroku API Key hardcoded',
    fix: 'Use HEROKU_API_KEY environment variable',
    confidence: 80,
    excludeInTests: true,
  },
  {
    name: 'vercel-token',
    regex: /['"`]([a-zA-Z0-9]{24})['"`].*vercel|vercel.*['"`]([a-zA-Z0-9]{24})['"`]/i,
    severity: 'high',
    category: 'credentials',
    message: 'Vercel Token hardcoded',
    fix: 'Use VERCEL_TOKEN environment variable',
    confidence: 75,
    excludeInTests: true,
  },
  {
    name: 'datadog-api-key',
    regex: /['"`]([a-f0-9]{32})['"`].*datadog|datadog.*['"`]([a-f0-9]{32})['"`]/i,
    severity: 'high',
    category: 'credentials',
    message: 'Datadog API Key hardcoded',
    fix: 'Use DD_API_KEY environment variable',
    confidence: 80,
    excludeInTests: true,
  },
  {
    name: 'supabase-key',
    regex: /['"`](eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+)['"`].*supabase|supabase.*['"`](eyJ[^'"`]+)['"`]/i,
    severity: 'high',
    category: 'credentials',
    message: 'Supabase Key hardcoded',
    fix: 'Use SUPABASE_KEY environment variable',
    confidence: 85,
    excludeInTests: true,
  },

  // ==========================================================================
  // ADDITIONAL SECURITY PATTERNS
  // ==========================================================================
  {
    name: 'timing-attack-vulnerable',
    regex: /===?\s*['"`][a-zA-Z0-9_-]{16,}['"`]\s*\)?[;,]?\s*$/,
    severity: 'high',
    category: 'security',
    message: 'Potential timing attack - use constant-time comparison',
    explanation: 'String comparison can leak information via timing',
    fix: 'Use crypto.timingSafeEqual() for secret comparison',
    confidence: 70,
    excludeInTests: true,
    requiresContext: (line) => {
      return line.includes('token') || line.includes('secret') || line.includes('key') || line.includes('password');
    },
  },
  {
    name: 'json-parse-untrusted',
    regex: /JSON\.parse\s*\(\s*req\.(body|query|params)/,
    severity: 'high',
    category: 'security',
    message: 'JSON.parse on untrusted input without validation',
    fix: 'Validate input with Zod/Joi before parsing or use body-parser',
    confidence: 80,
    excludeInTests: true,
  },
  {
    name: 'hardcoded-ip',
    regex: /['"`](\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})['"`]/,
    severity: 'medium',
    category: 'security',
    message: 'Hardcoded IP address',
    fix: 'Use environment variable or configuration file',
    confidence: 75,
    excludeInTests: true,
    requiresContext: (line) => {
      // Skip common local IPs
      return !line.includes('127.0.0.1') && !line.includes('0.0.0.0') && !line.includes('192.168.');
    },
  },
  {
    name: 'unsafe-deserialize',
    regex: /\b(serialize|deserialize|pickle|unpickle|marshal|unmarshal)\s*\(/i,
    severity: 'high',
    category: 'security',
    message: 'Potentially unsafe serialization/deserialization',
    fix: 'Validate input and use safe serialization libraries',
    confidence: 70,
    excludeInTests: true,
  },
  {
    name: 'xml-parser-xxe',
    regex: /new\s+(DOMParser|XMLParser)\s*\(\s*\)|parseXml\s*\(/i,
    severity: 'high',
    category: 'security',
    message: 'XML parsing may be vulnerable to XXE attacks',
    fix: 'Disable external entity processing in XML parser options',
    confidence: 75,
    excludeInTests: true,
  },
  {
    name: 'insecure-cookie',
    regex: /res\.cookie\s*\([^)]*\{[^}]*(httpOnly\s*:\s*false|secure\s*:\s*false)/,
    severity: 'high',
    category: 'security',
    message: 'Insecure cookie settings',
    fix: 'Set httpOnly: true and secure: true for sensitive cookies',
    confidence: 90,
    excludeInTests: true,
  },
  {
    name: 'missing-csp',
    regex: /helmet\s*\(\s*\{[^}]*contentSecurityPolicy\s*:\s*false/,
    severity: 'high',
    category: 'security',
    message: 'Content Security Policy disabled',
    fix: 'Enable CSP with appropriate directives',
    confidence: 95,
    excludeInTests: true,
  },
  {
    name: 'unsafe-allow-origin-reflect',
    regex: /res\.setHeader\s*\(\s*['"`]Access-Control-Allow-Origin['"`]\s*,\s*req\.(headers\.origin|query)/,
    severity: 'critical',
    category: 'security',
    message: 'CORS origin reflection vulnerability',
    explanation: 'Reflecting origin without validation allows any site',
    fix: 'Validate origin against allowlist',
    confidence: 95,
    excludeInTests: true,
  },
  {
    name: 'no-csrf-protection',
    regex: /app\.(post|put|patch|delete)\s*\([^)]+(?!csrf)/,
    severity: 'medium',
    category: 'security',
    message: 'State-changing endpoint may lack CSRF protection',
    fix: 'Add CSRF token validation for state-changing requests',
    confidence: 60,
    excludeInTests: true,
  },
  {
    name: 'clickjacking-vulnerable',
    regex: /X-Frame-Options.*ALLOWALL|frame-ancestors\s+\*/,
    severity: 'high',
    category: 'security',
    message: 'Page is vulnerable to clickjacking',
    fix: 'Set X-Frame-Options: DENY or frame-ancestors: self',
    confidence: 95,
    excludeInTests: true,
  },

  // ==========================================================================
  // FRAMEWORK-SPECIFIC PATTERNS (Next.js, React, Express)
  // ==========================================================================
  {
    name: 'nextjs-exposed-server-action',
    regex: /['"`]use server['"`].*export\s+(async\s+)?function\s+\w+.*\{[^}]*\beval\b/,
    severity: 'critical',
    category: 'security',
    message: 'Server action with dangerous eval usage',
    fix: 'Remove eval from server actions',
    confidence: 90,
    excludeInTests: true,
  },
  {
    name: 'nextjs-api-no-auth',
    regex: /export\s+(async\s+)?function\s+(GET|POST|PUT|DELETE|PATCH)\s*\([^)]*\)\s*\{(?![^}]*auth|[^}]*session|[^}]*token|[^}]*verify)/,
    severity: 'medium',
    category: 'security',
    message: 'Next.js API route may lack authentication',
    fix: 'Add authentication check at the start of the handler',
    confidence: 60,
    excludeInTests: true,
  },
  {
    name: 'react-useeffect-missing-deps',
    regex: /useEffect\s*\(\s*\(\)\s*=>\s*\{[^}]*\b(\w+)\b[^}]*\}\s*,\s*\[\s*\]\s*\)/,
    severity: 'medium',
    category: 'code-quality',
    message: 'useEffect with empty dependencies but uses external values',
    fix: 'Add missing dependencies or use useCallback/useMemo',
    confidence: 65,
    excludeInTests: true,
  },
  {
    name: 'react-setstate-in-render',
    regex: /function\s+\w+\s*\([^)]*\)\s*\{[^}]*const\s+\[[^,]+,\s*set\w+\][^}]*set\w+\s*\([^)]*\)[^}]*return\s*\(/,
    severity: 'high',
    category: 'code-quality',
    message: 'setState called during render (infinite loop risk)',
    fix: 'Move state update to useEffect or event handler',
    confidence: 70,
    excludeInTests: true,
  },
  {
    name: 'express-no-helmet',
    regex: /const\s+app\s*=\s*express\s*\(\)(?![^]*helmet)/,
    severity: 'medium',
    category: 'security',
    message: 'Express app without Helmet security headers',
    fix: 'Add app.use(helmet()) for security headers',
    confidence: 70,
    excludeInTests: true,
  },
  {
    name: 'express-trust-proxy-all',
    regex: /app\.set\s*\(\s*['"`]trust proxy['"`]\s*,\s*true\s*\)/,
    severity: 'medium',
    category: 'security',
    message: 'Express trusts all proxies - may allow IP spoofing',
    fix: 'Set specific number of trusted proxies: app.set("trust proxy", 1)',
    confidence: 85,
    excludeInTests: true,
  },

  // ==========================================================================
  // ADDITIONAL HALLUCINATIONS
  // ==========================================================================
  {
    name: 'react-18-legacy-api',
    regex: /ReactDOM\.render\s*\(/,
    severity: 'medium',
    category: 'hallucinations',
    message: 'Legacy ReactDOM.render (deprecated in React 18)',
    fix: 'Use createRoot().render() for React 18+',
    confidence: 90,
    excludeInTests: true,
  },
  {
    name: 'nextjs-getserverprops-pages',
    regex: /export\s+(async\s+)?function\s+getServerSideProps.*app\//,
    severity: 'high',
    category: 'hallucinations',
    message: 'getServerSideProps in App Router (not supported)',
    fix: 'Use server components or generateMetadata in App Router',
    confidence: 85,
    excludeInTests: true,
  },
  {
    name: 'fake-react-hook',
    regex: /\buse[A-Z][a-zA-Z]*\s*=\s*\(\)\s*=>\s*\{[^}]*\}/,
    severity: 'medium',
    category: 'hallucinations',
    message: 'Custom hook may not follow rules of hooks',
    fix: 'Ensure hook is defined as function and follows hook rules',
    confidence: 60,
    excludeInTests: true,
  },
  {
    name: 'moment-import-deprecated',
    regex: /import\s+moment\s+from\s+['"`]moment['"`]/,
    severity: 'low',
    category: 'code-quality',
    message: 'Moment.js is deprecated - consider alternatives',
    fix: 'Use date-fns, dayjs, or Intl API instead',
    confidence: 95,
    excludeInTests: true,
  },
  {
    name: 'request-library-deprecated',
    regex: /import\s+.*from\s+['"`]request['"`]|require\s*\(\s*['"`]request['"`]\s*\)/,
    severity: 'medium',
    category: 'code-quality',
    message: 'Request library is deprecated',
    fix: 'Use fetch, axios, or got instead',
    confidence: 95,
    excludeInTests: true,
  },

  // ==========================================================================
  // ADDITIONAL MOCK DATA PATTERNS  
  // ==========================================================================
  {
    name: 'mock-credit-card',
    regex: /['"`]4[0-9]{12}(?:[0-9]{3})?['"`]|['"`](?:4\d{3}|5[1-5]\d{2}|6011|3[47]\d{2})[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}['"`]/,
    severity: 'medium',
    category: 'mock-data',
    message: 'Test credit card number in code',
    fix: 'Use payment provider test mode instead of hardcoded numbers',
    confidence: 90,
    excludeInTests: true,
  },
  {
    name: 'mock-ssn',
    regex: /['"`]\d{3}-\d{2}-\d{4}['"`]/,
    severity: 'high',
    category: 'mock-data',
    message: 'SSN-like pattern in code',
    fix: 'Remove sensitive test data',
    confidence: 80,
    excludeInTests: true,
  },
  {
    name: 'hardcoded-version',
    regex: /version\s*[:=]\s*['"`](\d+\.\d+\.\d+)['"`]/,
    severity: 'low',
    category: 'code-quality',
    message: 'Hardcoded version number',
    fix: 'Read version from package.json',
    confidence: 70,
    excludeInTests: true,
  },
  {
    name: 'sleep-in-code',
    regex: /setTimeout\s*\(\s*(?:async\s*)?\(\)\s*=>\s*(?:resolve|res)\s*\(\)/,
    severity: 'medium',
    category: 'code-quality',
    message: 'Sleep/delay pattern - may indicate fake async',
    fix: 'Remove artificial delays in production code',
    confidence: 70,
    excludeInTests: true,
  },
];

// =============================================================================
// ULTIMATE SCANNER CLASS
// =============================================================================

export class UltimateScanner {
  private options: Required<UltimateScannerOptions>;
  private envVars: Set<string> = new Set();
  private declaredEnvVars: Set<string> = new Set();

  constructor(options: UltimateScannerOptions) {
    this.options = {
      rootDir: options.rootDir,
      excludePatterns: options.excludePatterns || DEFAULT_EXCLUDE_PATTERNS,
      includePatterns: options.includePatterns || ['**/*.{ts,tsx,js,jsx}'],
      severityThreshold: options.severityThreshold || 'low',
      maxFileSize: options.maxFileSize || 1024 * 1024, // 1MB
      envFiles: options.envFiles || ['.env', '.env.local', '.env.example', '.env.template'],
    };
  }

  async scan(): Promise<UltimateScanResult> {
    const startTime = Date.now();
    const findings: UltimateFinding[] = [];
    let scannedFiles = 0;

    // Load declared environment variables
    await this.loadDeclaredEnvVars();

    // Get all files to scan
    const files = await this.getFiles();

    // Scan each file
    for (const file of files) {
      const relativePath = path.relative(this.options.rootDir, file);
      const isTestFile = this.isTestFile(relativePath);
      const isConfigExample = this.isConfigExample(relativePath);
      const isCriticalPath = this.isCriticalPath(relativePath);

      try {
        const content = fs.readFileSync(file, 'utf-8');
        
        // Skip files that are too large
        if (content.length > this.options.maxFileSize) {
          continue;
        }

        const lines = content.split('\n');
        scannedFiles++;

        // Track env var usage
        this.trackEnvVarUsage(content);

        // Run pattern detection
        for (const pattern of PATTERNS) {
          // Skip patterns in test files if configured
          if (pattern.excludeInTests && isTestFile) {
            continue;
          }

          // Skip credential patterns in config examples
          if (pattern.category === 'credentials' && isConfigExample) {
            continue;
          }

          // Check each line
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const match = pattern.regex.exec(line);

            if (match) {
              // Check context requirement if exists
              if (pattern.requiresContext && !pattern.requiresContext(line, lines, i)) {
                continue;
              }

              // Determine severity (escalate in critical paths)
              let severity = pattern.severity;
              if (isCriticalPath && severity !== 'critical') {
                severity = this.escalateSeverity(severity);
              }

              findings.push({
                id: `${pattern.name}-${relativePath}:${i + 1}`,
                file: relativePath,
                line: i + 1,
                column: match.index,
                code: line.trim().substring(0, 100),
                rule: pattern.name,
                category: pattern.category,
                severity,
                message: pattern.message,
                explanation: pattern.explanation,
                fix: pattern.fix,
                confidence: pattern.confidence,
              });
            }
          }
        }
      } catch (error) {
        // Skip files that can't be read
        continue;
      }
    }

    // Detect ghost environment variables
    const ghostEnvFindings = this.detectGhostEnvVars();
    findings.push(...ghostEnvFindings);

    // Calculate summary
    const summary = this.calculateSummary(findings);

    return {
      findings: this.filterBySeverity(findings),
      scannedFiles,
      duration: Date.now() - startTime,
      summary,
    };
  }

  private async getFiles(): Promise<string[]> {
    const fg = await import('fast-glob').then(m => m.default);
    return fg.sync(this.options.includePatterns, {
      cwd: this.options.rootDir,
      absolute: true,
      ignore: this.options.excludePatterns,
    });
  }

  private isTestFile(relativePath: string): boolean {
    return TEST_FILE_PATTERNS.some(pattern => pattern.test(relativePath));
  }

  private isConfigExample(relativePath: string): boolean {
    return CONFIG_EXAMPLE_PATTERNS.some(pattern => pattern.test(relativePath));
  }

  private isCriticalPath(relativePath: string): boolean {
    return CRITICAL_PATHS.some(pattern => pattern.test(relativePath));
  }

  private escalateSeverity(severity: Severity): Severity {
    const escalation: Record<Severity, Severity> = {
      low: 'medium',
      medium: 'high',
      high: 'critical',
      critical: 'critical',
    };
    return escalation[severity];
  }

  private async loadDeclaredEnvVars(): Promise<void> {
    for (const envFile of this.options.envFiles) {
      const envPath = path.join(this.options.rootDir, envFile);
      if (fs.existsSync(envPath)) {
        try {
          const content = fs.readFileSync(envPath, 'utf-8');
          const varMatches = content.matchAll(/^([A-Z][A-Z0-9_]+)\s*=/gm);
          for (const match of varMatches) {
            this.declaredEnvVars.add(match[1]);
          }
        } catch {
          // Skip unreadable env files
        }
      }
    }
  }

  private trackEnvVarUsage(content: string): void {
    const envMatches = content.matchAll(/process\.env\.([A-Z][A-Z0-9_]+)/g);
    for (const match of envMatches) {
      this.envVars.add(match[1]);
    }
  }

  private detectGhostEnvVars(): UltimateFinding[] {
    const findings: UltimateFinding[] = [];
    
    for (const envVar of this.envVars) {
      if (!this.declaredEnvVars.has(envVar)) {
        findings.push({
          id: `ghost-env-${envVar}`,
          file: '(multiple files)',
          line: 0,
          code: `process.env.${envVar}`,
          rule: 'ghost-env-var',
          category: 'code-quality',
          severity: 'high',
          message: `Environment variable ${envVar} is used but not declared`,
          explanation: 'This variable may be undefined at runtime',
          fix: `Add ${envVar}=your_value to .env.example`,
          confidence: 90,
        });
      }
    }

    return findings;
  }

  private calculateSummary(findings: UltimateFinding[]): UltimateScanResult['summary'] {
    const bySeverity: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    const byCategory: Record<Category, number> = {
      credentials: 0,
      security: 0,
      'fake-features': 0,
      hallucinations: 0,
      'mock-data': 0,
      'code-quality': 0,
    };

    for (const finding of findings) {
      bySeverity[finding.severity]++;
      byCategory[finding.category]++;
    }

    return {
      total: findings.length,
      bySeverity,
      byCategory,
      critical: bySeverity.critical,
      fixable: findings.filter(f => f.fix).length,
    };
  }

  private filterBySeverity(findings: UltimateFinding[]): UltimateFinding[] {
    const severityOrder: Severity[] = ['critical', 'high', 'medium', 'low'];
    const threshold = severityOrder.indexOf(this.options.severityThreshold);

    return findings.filter(f => {
      const findingSeverity = severityOrder.indexOf(f.severity);
      return findingSeverity <= threshold;
    });
  }
}

export default UltimateScanner;
