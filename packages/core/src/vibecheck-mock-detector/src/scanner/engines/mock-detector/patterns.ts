// src/scanner/engines/mock-detector/patterns.ts

import type { Pattern, Category, Severity, Confidence } from './types';

export const IGNORED_PATHS = [
  // Test files
  /\.(test|spec)\.(ts|tsx|js|jsx)$/,
  /__tests__\//,
  /__mocks__\//,
  /fixtures?\//,
  /seeds?\//,
  /seeders?\//,
  /\.spec\./,
  /\.test\./,
  /test-utils?\//,
  /testing\//,
  /\.test\//,
  
  // Storybook
  /storybook\//,
  /\.stories\.(ts|tsx|js|jsx)$/,
  
  // E2E testing
  /cypress\//,
  /playwright\//,
  /e2e\//,
  /integration\//,
  
  // Example/sample files
  /\.env\.example$/,
  /\.env\.sample$/,
  /\.env\.template$/,
  /examples?\//,
  /samples?\//,
  /demo\//,
  
  // Build outputs
  /node_modules\//,
  /\.next\//,
  /dist\//,
  /build\//,
  /\.output\//,
  /coverage\//,
  
  // Documentation
  /docs?\//,
  /\.md$/,
  /README/i,
  
  // Config files (often have defaults)
  /config\.defaults?\./,
  /\.config\.(ts|js)$/,
  
  // Type definition files
  /\.d\.ts$/,
  /types?\.(ts|d\.ts)$/,
  
  // Benchmark/test repos (cloned external repos)
  /bench\/results\//,
  /bench\/repos\//,
  
  // Mock/stub directories (intentional)
  /mocks?\//,
  /stubs?\//,
  /fakes?\//,
  
  // Detection tool pattern definitions (self-references)
  /vibecheck-mock-detector\/.*patterns/,
  /vibecheck-mock-detector\/.*auto-fixer/,
  /secrets\/patterns/,
  /reality\/patterns/,
  /reality\/.*rules/,
];

export const PATTERNS: Pattern[] = [
  // ============ CRITICAL: Credentials ============
  {
    id: 'hardcoded-api-key',
    category: 'credentials',
    severity: 'critical',
    pattern: /(['"`])(sk_live_[a-zA-Z0-9]{24,}|sk_test_[a-zA-Z0-9]{24,}|pk_live_[a-zA-Z0-9]{24,}|pk_test_[a-zA-Z0-9]{24,})\1/g,
    description: 'Stripe API key hardcoded',
    fix: 'Move to environment variable: process.env.STRIPE_SECRET_KEY',
    confidence: 'certain',
  },
  {
    id: 'aws-access-key',
    category: 'credentials',
    severity: 'critical',
    pattern: /(['"`])(AKIA[0-9A-Z]{16})\1/g,
    description: 'AWS access key hardcoded',
    fix: 'Move to environment variable or use IAM roles',
    confidence: 'certain',
  },
  {
    id: 'hardcoded-password',
    category: 'credentials',
    severity: 'critical',
    // More specific: looks for actual password values, not type defs or masked values
    // Excludes: type definitions, masked values (***), placeholder patterns
    pattern: /(?:password|passwd|pwd)\s*[:=]\s*(['"`])(?!process\.env|env\.|import\.meta\.env|\*|<|{|\$)(?!password|string|Password)[a-zA-Z0-9!@#$%^&*()_+-]{8,}\1/gi,
    description: 'Hardcoded password detected',
    fix: 'Move to environment variable',
    confidence: 'likely',
  },
  {
    id: 'jwt-token',
    category: 'credentials',
    severity: 'critical',
    pattern: /(['"`])(eyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,})\1/g,
    description: 'Hardcoded JWT token',
    fix: 'Remove hardcoded token, use proper auth flow',
    confidence: 'certain',
  },
  {
    id: 'private-key',
    category: 'credentials',
    severity: 'critical',
    pattern: /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/g,
    description: 'Private key in source code',
    fix: 'Move to secure secret storage, never commit keys',
    confidence: 'certain',
  },
  {
    id: 'generic-api-key',
    category: 'credentials',
    severity: 'critical',
    pattern: /(?:api[_-]?key|apikey|api[_-]?secret)\s*[:=]\s*(['"`])(?!process\.env)[a-zA-Z0-9_-]{16,}\1/gi,
    description: 'Hardcoded API key',
    fix: 'Move to environment variable',
    confidence: 'likely',
  },

  // ============ CRITICAL: Fake Auth ============
  {
    id: 'bypass-auth',
    category: 'fake-auth',
    severity: 'high',  // Reduced from critical - needs manual review
    // More specific: only match when it looks like a bypass, not initialization
    // Excludes: default values in options, test setup, type definitions
    pattern: /(?:\/\/\s*)?(?:isAuthenticated|isAuthed|isLoggedIn)\s*[:=]\s*true\s*[,;]?\s*(?:\/\/.*(?:bypass|skip|temp|hack|todo))?/gi,
    description: 'Potential authentication bypass - hardcoded true',
    fix: 'Implement proper authentication check',
    confidence: 'possible',  // Reduced - high FP rate
  },
  {
    id: 'skip-auth-comment',
    category: 'fake-auth',
    severity: 'high',  // Reduced from critical
    // Only match comments that clearly indicate production bypass
    pattern: /\/\/\s*(?:TODO|FIXME|HACK|TEMP)?\s*:?\s*(?:skip|bypass|disable)\s+auth(?:entication)?\s+(?:for|in|during)\s+(?:prod|production|deploy)/gi,
    description: 'Auth bypass indicated in comment for production',
    fix: 'Remove bypass and implement real auth',
    confidence: 'likely',
  },
  // Removed fake-user-session - too many false positives from legitimate code

  // ============ HIGH: Mock Data ============
  {
    id: 'mock-variable',
    category: 'mock-data',
    severity: 'medium',  // Reduced - these may be legitimate in some contexts
    // Removed 'test' prefix - too many false positives (testId, testUtils, etc.)
    // Removed 'sample' - sometimes legitimate (sampleRate, etc.)
    pattern: /(?:const|let|var)\s+(mock[A-Z]\w*|fake[A-Z]\w*|dummy[A-Z]\w*)\s*=/gi,
    description: 'Variable with mock/fake/dummy prefix',
    fix: 'Replace with real data source or move to test files',
    confidence: 'likely',
  },
  {
    id: 'mock-function',
    category: 'mock-data',
    severity: 'medium',  // Reduced
    pattern: /(?:function|const)\s+(getMock\w*|getFake\w*|generateFake\w*|createMock\w*|makeFake\w*)/gi,
    description: 'Mock data generator function',
    fix: 'Remove or move to test utilities',
    confidence: 'likely',
  },
  {
    id: 'faker-import',
    category: 'mock-data',
    severity: 'high',
    pattern: /import.*from\s+['"`]@faker-js\/faker['"`]/g,
    description: 'Faker library imported in production code',
    fix: 'Remove faker import, use real data',
    confidence: 'certain',
  },

  // ============ HIGH: Fake User Data ============
  // Note: Many "fake user data" patterns are actually legitimate in:
  // - Form placeholders (placeholder="...")
  // - Documentation/JSDoc comments
  // - example.com is reserved for examples per RFC 2606
  {
    id: 'john-doe',
    category: 'fake-user-data',
    severity: 'low',  // Reduced - often legitimate placeholders
    // Exclude: placeholder attributes, JSDoc comments, string literals that look like examples
    // Only flag when it appears as an actual assigned value (not in comments or placeholders)
    pattern: /(?:name|userName|user_name|fullName|displayName)\s*[:=]\s*(['"`])(john\s*doe|jane\s*doe|test\s*user|admin\s*user)\1/gi,
    description: 'Hardcoded fake name in data',
    fix: 'Use dynamic data source',
    confidence: 'likely',
  },
  {
    id: 'test-email-hardcoded',
    category: 'fake-user-data',
    severity: 'medium',  // Reduced - example.com is valid for examples
    // Only flag when assigned to email-like fields, not placeholders or docs
    // Exclude: placeholder=, example in comments, @example.com (RFC reserved)
    pattern: /(?:email|userEmail|user_email|emailAddress)\s*[:=]\s*(['"`])[\w.-]+@(test|fake|mock|foo)\.(com|org|net)\1/gi,
    description: 'Hardcoded test email in data',
    fix: 'Use dynamic email or environment variable',
    confidence: 'likely',
  },
  // Note: @example.com, @example.org, @example.net are RFC 2606 reserved domains
  // specifically FOR documentation and examples - they should NOT be flagged
  {
    id: 'test-phone',
    category: 'fake-user-data',
    severity: 'medium',
    // Only match 555 prefix (standard US fake number prefix)
    pattern: /(['"`])(\+?1?\s*)?\(?(555)\)?[\s.-]?\d{3}[\s.-]?\d{4}\1/g,
    description: 'Fake phone number (555 prefix)',
    fix: 'Remove hardcoded phone number',
    confidence: 'certain',
  },
  {
    id: 'test-credit-card',
    category: 'fake-user-data',
    severity: 'high',
    pattern: /(['"`])(4111[\s-]?1111[\s-]?1111[\s-]?1111|4242[\s-]?4242[\s-]?4242[\s-]?4242)\1/g,
    description: 'Test credit card number',
    fix: 'Remove test card, use Stripe test mode properly',
    confidence: 'certain',
  },
  {
    id: 'fake-ssn',
    category: 'fake-user-data',
    severity: 'high',
    // Only match well-known fake SSN patterns, not all XXX-XX-XXXX patterns
    pattern: /(['"`])(123-45-6789|000-00-0000|111-11-1111|999-99-9999|987-65-4321)\1/g,
    description: 'Hardcoded fake SSN pattern',
    fix: 'Remove hardcoded SSN',
    confidence: 'certain',
  },

  // ============ MEDIUM: Placeholder IDs ============
  {
    id: 'zero-uuid',
    category: 'placeholder-ids',
    severity: 'low',  // Reduced - nil UUID is often a valid sentinel value
    pattern: /(['"`])(00000000-0000-0000-0000-000000000000)\1/g,
    description: 'Nil UUID placeholder',
    fix: 'Generate real UUID or get from data source',
    confidence: 'possible',  // May be intentional
  },
  {
    id: 'hardcoded-id',
    category: 'placeholder-ids',
    severity: 'low',  // Reduced - often legitimate defaults
    // More specific: only match obvious test IDs, not config defaults
    pattern: /(?:userId|user_id)\s*[:=]\s*(['"`])(test-id|fake-id|temp-id|mock-id)\1(?:\s*[,;}])/g,
    description: 'Hardcoded test ID value',
    fix: 'Get ID from data source or auth context',
    confidence: 'likely',
  },

  // ============ MEDIUM: Stub Responses ============
  {
    id: 'empty-return',
    category: 'stub-response',
    severity: 'medium',
    pattern: /return\s+(\{\s*\}|\[\s*\]|null|undefined)\s*;?\s*\/\/.*(?:todo|fixme|temp|mock|stub)/gi,
    description: 'Stub return with TODO comment',
    fix: 'Implement actual logic',
    confidence: 'certain',
  },
  {
    id: 'not-implemented',
    category: 'stub-response',
    severity: 'medium',
    pattern: /(?:throw\s+new\s+Error\s*\(\s*)?(['"`])(?:not\s+implemented|todo|coming\s+soon|stub)\1/gi,
    description: 'Not implemented placeholder',
    fix: 'Implement the feature or remove the code path',
    confidence: 'certain',
  },
  // Removed fake-delay - setTimeout with resolve is a standard async pattern, too many FPs

  // ============ MEDIUM: Placeholder Content ============
  {
    id: 'lorem-ipsum',
    category: 'placeholder-content',
    severity: 'medium',
    pattern: /lorem\s+ipsum/gi,
    description: 'Lorem ipsum placeholder text',
    fix: 'Replace with real content',
    confidence: 'certain',
  },
  {
    id: 'tbd-placeholder',
    category: 'placeholder-content',
    severity: 'medium',
    // Removed "Placeholder" and "N/A" - too many false positives from property names
    pattern: /(['"`])(TBD|TBA|Coming Soon|Under Construction)\1/gi,
    description: 'Placeholder content string',
    fix: 'Replace with real content or remove',
    confidence: 'certain',
  },
  // Removed empty-content - empty strings are very often valid defaults, too many FPs
  {
    id: 'placeholder-image',
    category: 'placeholder-content',
    severity: 'medium',
    pattern: /(['"`])(https?:\/\/)?(via\.placeholder\.com|placekitten\.com|placehold\.it|picsum\.photos|placeholder\.com)/gi,
    description: 'Placeholder image service URL',
    fix: 'Replace with real image or proper fallback',
    confidence: 'certain',
  },

  // ============ MEDIUM: Debug Code ============
  {
    id: 'debugger-statement',
    category: 'debug-code',
    severity: 'high',
    pattern: /^\s*debugger\s*;?\s*$/gm,
    description: 'Debugger statement',
    fix: 'Remove debugger statement',
    confidence: 'certain',
    autoFixable: true,
  },
  // Removed console-log - too noisy, most projects have their own console policies
  // Keep console.error detection only as it may indicate unhandled issues
  {
    id: 'if-true-false',
    category: 'debug-code',
    severity: 'high',
    pattern: /if\s*\(\s*(true|false|1|0)\s*\)/g,
    description: 'Hardcoded conditional (debug code)',
    fix: 'Remove dead code or implement proper condition',
    confidence: 'certain',
    autoFixable: true,
  },

  // ============ MEDIUM: Hardcoded Config ============
  {
    id: 'hardcoded-localhost',
    category: 'hardcoded-config',
    severity: 'low',  // Reduced - localhost is often a valid default/fallback
    // Only flag when it's NOT part of a fallback pattern (|| or ??)
    pattern: /(?:api[Uu]rl|baseUrl|endpoint|serverUrl|BASE_URL)\s*[:=]\s*(['"`])(https?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?(?:\/[^'"`]*)?\1(?!\s*\|\||\s*\?\?)/g,
    description: 'Hardcoded localhost URL without fallback',
    fix: 'Use environment variable for API URL',
    confidence: 'possible',
  },
  // Removed hardcoded-port - ports are almost always hardcoded with env fallback, too many FPs
  {
    id: 'hardcoded-url',
    category: 'hardcoded-config',
    severity: 'low',  // Reduced - production URLs may be intentional
    // Only flag production-looking URLs, not localhost
    pattern: /(?:api[Uu]rl|baseUrl|endpoint|BASE_URL)\s*[:=]\s*(['"`])https?:\/\/(?!localhost|127\.0\.0\.1)[a-z0-9.-]+\.[a-z]{2,}[^'"`]*\1(?!\s*\|\||\s*\?\?)/g,
    description: 'Hardcoded production API URL',
    fix: 'Move URL to environment variable',
    confidence: 'possible',
  },

  // ============ LOW: Fake Dates ============
  {
    id: 'hardcoded-date',
    category: 'fake-dates',
    severity: 'low',
    pattern: /new\s+Date\s*\(\s*(['"`])(2024|2023|2025)-\d{2}-\d{2}\1\s*\)/g,
    description: 'Hardcoded date',
    fix: 'Use dynamic date or make configurable',
    confidence: 'possible',
  },
  {
    id: 'magic-timestamp',
    category: 'fake-dates',
    severity: 'low',
    pattern: /(?:timestamp|time|date|expiry)\s*[:=]\s*(1234567890|0|1)(?:\s*[,;}])/g,
    description: 'Magic timestamp value',
    fix: 'Use proper date calculation',
    confidence: 'likely',
  },

  // ============ TODO/FIXME Markers ============
  // Removed generic todo-marker - too noisy, every codebase has TODOs
  // Only keep HACK and TEMP as they're more likely to be ship-blockers
  {
    id: 'hack-marker',
    category: 'debug-code',
    severity: 'low',
    pattern: /\/\/\s*(HACK|TEMP|XXX)[\s:]/gi,
    description: 'HACK/TEMP marker found - may indicate workaround code',
    fix: 'Address the hack or convert to proper solution',
    confidence: 'likely',
  },
];

export default PATTERNS;
