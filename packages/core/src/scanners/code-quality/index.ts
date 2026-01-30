/**
 * Code Quality Scanner
 * 
 * Comprehensive code quality detection engine combining the best patterns
 * from all Vibecheck projects. Detects AI-generated code issues, sloppy code,
 * security vulnerabilities, and maintainability problems.
 * 
 * @module scanners/code-quality
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';

// ============================================================================
// Types
// ============================================================================

export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type Confidence = 'certain' | 'likely' | 'possible';

export interface CodeQualityFinding {
  id: string;
  type: string;
  category: string;
  severity: Severity;
  message: string;
  description: string;
  file: string;
  line: number;
  column?: number;
  code: string;
  fix?: string;
  confidence: Confidence;
  autoFixable?: boolean;
}

export interface CodeQualityScanResult {
  findings: CodeQualityFinding[];
  summary: {
    total: number;
    bySeverity: Record<Severity, number>;
    byCategory: Record<string, number>;
    autoFixable: number;
  };
  scannedFiles: number;
  duration: number;
}

export interface ScanOptions {
  rootDir: string;
  include?: string[];
  exclude?: string[];
  severityThreshold?: Severity;
}

// ============================================================================
// Ignored Paths
// ============================================================================

const IGNORED_PATHS = [
  /\.(test|spec)\.(ts|tsx|js|jsx)$/,
  /__tests__\//,
  /__mocks__\//,
  /fixtures?\//,
  /\.stories\./,
  /node_modules\//,
  /\.next\//,
  /dist\//,
  /build\//,
  /coverage\//,
  /\.d\.ts$/,
  /e2e\//,
];

function shouldExclude(filePath: string): boolean {
  return IGNORED_PATHS.some(regex => regex.test(filePath));
}

// ============================================================================
// Pattern Definitions
// ============================================================================

interface Pattern {
  regex: RegExp;
  type: string;
  category: string;
  severity: Severity;
  message: string;
  description: string;
  fix?: string;
  confidence: Confidence;
  autoFixable?: boolean;
}

// Console/Debug Patterns
const CONSOLE_PATTERNS: Pattern[] = [
  { regex: /\bconsole\.log\s*\(/, type: 'console_log', category: 'debug-code', severity: 'medium', message: 'console.log statement', description: 'Debug logging in production code', fix: 'Remove or replace with proper logger', confidence: 'certain', autoFixable: true },
  { regex: /\bconsole\.debug\s*\(/, type: 'console_debug', category: 'debug-code', severity: 'medium', message: 'console.debug statement', description: 'Debug logging in production code', fix: 'Remove or replace with proper logger', confidence: 'certain', autoFixable: true },
  { regex: /\bconsole\.trace\s*\(/, type: 'console_trace', category: 'debug-code', severity: 'medium', message: 'console.trace statement', description: 'Debug tracing in production code', fix: 'Remove or use proper debugging tools', confidence: 'certain', autoFixable: true },
  { regex: /\bdebugger\s*;/, type: 'debugger', category: 'debug-code', severity: 'critical', message: 'debugger statement', description: 'Debugger will pause execution', fix: 'Remove debugger statement', confidence: 'certain', autoFixable: true },
  { regex: /\balert\s*\([^)]*\)/, type: 'alert', category: 'debug-code', severity: 'high', message: 'alert() call', description: 'Blocks UI and bad UX', fix: 'Use proper notification system', confidence: 'certain', autoFixable: false },
];

// TODO/FIXME Patterns
const TODO_PATTERNS: Pattern[] = [
  { regex: /\/\/\s*TODO\s*:/i, type: 'todo', category: 'todo-comments', severity: 'low', message: 'TODO comment', description: 'Unfinished task marker', confidence: 'certain' },
  { regex: /\/\/\s*FIXME\s*:/i, type: 'fixme', category: 'todo-comments', severity: 'medium', message: 'FIXME comment', description: 'Known bug or issue', confidence: 'certain' },
  { regex: /\/\/\s*HACK\s*:/i, type: 'hack', category: 'todo-comments', severity: 'medium', message: 'HACK comment', description: 'Workaround code that needs cleanup', confidence: 'certain' },
  { regex: /\/\/\s*XXX\s*:/i, type: 'xxx', category: 'todo-comments', severity: 'medium', message: 'XXX comment', description: 'Problematic code marker', confidence: 'certain' },
  { regex: /\/\/\s*BUG\s*:/i, type: 'bug', category: 'todo-comments', severity: 'high', message: 'BUG comment', description: 'Known bug documented', confidence: 'certain' },
  { regex: /\/\/\s*SECURITY\s*:/i, type: 'security_comment', category: 'todo-comments', severity: 'critical', message: 'SECURITY comment', description: 'Security issue documented', confidence: 'certain' },
  { regex: /\/\/\s*TEMP\s*:/i, type: 'temp', category: 'todo-comments', severity: 'medium', message: 'TEMP comment', description: 'Temporary code that should be removed', confidence: 'certain' },
];

// Hardcoded Secrets Patterns
const SECRET_PATTERNS: Pattern[] = [
  { regex: /['"]sk[-_]live[-_][a-zA-Z0-9]{20,}['"]/, type: 'stripe_live_key', category: 'secrets', severity: 'critical', message: 'Stripe live secret key', description: 'Production Stripe key exposed', fix: 'Move to environment variable', confidence: 'certain' },
  { regex: /['"]sk[-_]test[-_][a-zA-Z0-9]{20,}['"]/, type: 'stripe_test_key', category: 'secrets', severity: 'high', message: 'Stripe test secret key', description: 'Stripe test key in code', fix: 'Move to environment variable', confidence: 'certain' },
  { regex: /['"]ghp_[a-zA-Z0-9]{36}['"]/, type: 'github_token', category: 'secrets', severity: 'critical', message: 'GitHub personal access token', description: 'GitHub PAT exposed', fix: 'Revoke and use GitHub secrets', confidence: 'certain' },
  { regex: /['"]gho_[a-zA-Z0-9]{36}['"]/, type: 'github_oauth', category: 'secrets', severity: 'critical', message: 'GitHub OAuth token', description: 'GitHub OAuth token exposed', fix: 'Revoke and use proper auth flow', confidence: 'certain' },
  { regex: /['"]xox[baprs]-[a-zA-Z0-9-]{10,}['"]/, type: 'slack_token', category: 'secrets', severity: 'critical', message: 'Slack API token', description: 'Slack token exposed', fix: 'Revoke and use environment variable', confidence: 'certain' },
  { regex: /['"]AKIA[0-9A-Z]{16}['"]/, type: 'aws_access_key', category: 'secrets', severity: 'critical', message: 'AWS access key ID', description: 'AWS credentials exposed', fix: 'Use IAM roles or environment variables', confidence: 'certain' },
  { regex: /['"]AIza[0-9A-Za-z-_]{35}['"]/, type: 'google_api_key', category: 'secrets', severity: 'critical', message: 'Google API key', description: 'Google API key exposed', fix: 'Restrict key or use environment variable', confidence: 'certain' },
  { regex: /['"]SG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43}['"]/, type: 'sendgrid_key', category: 'secrets', severity: 'critical', message: 'SendGrid API key', description: 'SendGrid key exposed', fix: 'Revoke and use environment variable', confidence: 'certain' },
  { regex: /\bAPI_KEY\s*[:=]\s*['"][a-zA-Z0-9_-]{20,}['"]/, type: 'api_key', category: 'secrets', severity: 'critical', message: 'Hardcoded API key', description: 'Generic API key in code', fix: 'Move to environment variable', confidence: 'likely' },
  { regex: /\bJWT_SECRET\s*[:=]\s*['"][^'"]+['"]/, type: 'jwt_secret', category: 'secrets', severity: 'critical', message: 'Hardcoded JWT secret', description: 'JWT signing secret exposed', fix: 'Move to environment variable', confidence: 'certain' },
  { regex: /\w+_PASSWORD\s*[:=]\s*['"][^'"]+['"]/, type: 'hardcoded_password', category: 'secrets', severity: 'critical', message: 'Hardcoded password', description: 'Password stored in plain text', fix: 'Move to environment variable or secret manager', confidence: 'certain' },
  { regex: /mongodb(\+srv)?:\/\/[^:]+:[^@]+@/, type: 'mongodb_uri', category: 'secrets', severity: 'critical', message: 'MongoDB connection with credentials', description: 'Database credentials in code', fix: 'Use environment variable for connection string', confidence: 'certain' },
  { regex: /postgres(ql)?:\/\/[^:]+:[^@]+@/, type: 'postgres_uri', category: 'secrets', severity: 'critical', message: 'PostgreSQL connection with credentials', description: 'Database credentials in code', fix: 'Use environment variable for connection string', confidence: 'certain' },
];

// Security Vulnerability Patterns
const SECURITY_PATTERNS: Pattern[] = [
  { regex: /['"`]SELECT\s.*\$\{/, type: 'sql_injection', category: 'security', severity: 'critical', message: 'SQL injection vulnerability', description: 'SQL with template literal interpolation', fix: 'Use parameterized queries', confidence: 'certain' },
  { regex: /['"`]SELECT\s.*\+\s*\w+/, type: 'sql_concat', category: 'security', severity: 'critical', message: 'SQL injection vulnerability', description: 'SQL with string concatenation', fix: 'Use parameterized queries', confidence: 'certain' },
  { regex: /\.query\s*\(\s*['"`].*\$\{/, type: 'query_injection', category: 'security', severity: 'critical', message: 'Database query injection', description: 'Query with interpolation', fix: 'Use parameterized queries', confidence: 'certain' },
  { regex: /Access-Control-Allow-Origin['":\s]+\*/, type: 'cors_wildcard', category: 'security', severity: 'high', message: 'CORS allows all origins', description: 'Overly permissive CORS', fix: 'Restrict to specific origins', confidence: 'certain' },
  { regex: /cors\s*\(\s*\{\s*origin\s*:\s*['"]?\*['"]?/, type: 'cors_config_wildcard', category: 'security', severity: 'high', message: 'CORS config allows all origins', description: 'CORS middleware too permissive', fix: 'Specify allowed origins', confidence: 'certain' },
  { regex: /httpOnly\s*:\s*false/i, type: 'insecure_cookie', category: 'security', severity: 'high', message: 'Cookie httpOnly disabled', description: 'Cookies accessible via JavaScript', fix: 'Set httpOnly: true', confidence: 'certain' },
  { regex: /secure\s*:\s*false/i, type: 'insecure_cookie_secure', category: 'security', severity: 'high', message: 'Cookie secure flag disabled', description: 'Cookies sent over HTTP', fix: 'Set secure: true in production', confidence: 'likely' },
  { regex: /password\.length\s*[<>=]+\s*[1-6]\b/, type: 'weak_password', category: 'security', severity: 'high', message: 'Weak password validation', description: 'Password length too short', fix: 'Require at least 8 characters', confidence: 'likely' },
  { regex: /minLength\s*[:=]\s*[1-6]\b/, type: 'weak_minlength', category: 'security', severity: 'high', message: 'Weak password minLength', description: 'Minimum length too permissive', fix: 'Set minLength to at least 8', confidence: 'likely' },
  { regex: /eval\s*\([^)]*\+/, type: 'eval_injection', category: 'security', severity: 'critical', message: 'eval() with dynamic code', description: 'Code injection vulnerability', fix: 'Avoid eval(), use safer alternatives', confidence: 'certain' },
  { regex: /innerHTML\s*=\s*[^'"][^;]*\+/, type: 'xss_innerhtml', category: 'security', severity: 'critical', message: 'innerHTML with dynamic content', description: 'XSS vulnerability', fix: 'Use textContent or sanitize HTML', confidence: 'likely' },
  { regex: /dangerouslySetInnerHTML/, type: 'dangerous_html', category: 'security', severity: 'high', message: 'dangerouslySetInnerHTML used', description: 'Potential XSS if not sanitized', fix: 'Sanitize HTML input', confidence: 'likely' },
];

// Code Quality Patterns
const QUALITY_PATTERNS: Pattern[] = [
  { regex: /\bvar\s+\w+/, type: 'var_usage', category: 'code-quality', severity: 'medium', message: 'Using var instead of let/const', description: 'var has function scope issues', fix: 'Use const for constants, let for variables', confidence: 'certain', autoFixable: true },
  { regex: /catch\s*\([^)]*\)\s*\{\s*\}/, type: 'empty_catch', category: 'error-handling', severity: 'high', message: 'Empty catch block', description: 'Errors silently swallowed', fix: 'Log error or handle appropriately', confidence: 'certain' },
  { regex: /catch\s*\([^)]*\)\s*\{\s*\/\//, type: 'silent_catch', category: 'error-handling', severity: 'medium', message: 'Silent catch with only comment', description: 'Error handling may be inadequate', confidence: 'likely' },
  { regex: /if\s*\(\s*(true|false|1|0)\s*\)/, type: 'constant_condition', category: 'code-quality', severity: 'high', message: 'Constant condition in if statement', description: 'Dead code or debug code', fix: 'Remove dead code', confidence: 'certain', autoFixable: true },
  { regex: /\.then\s*\([^)]*\)(?!\s*\.catch)/, type: 'unhandled_promise', category: 'error-handling', severity: 'medium', message: 'Promise without .catch()', description: 'Unhandled promise rejection', fix: 'Add .catch() handler', confidence: 'likely' },
  { regex: /async\s+function[^{]*\{[^}]*await[^}]*\}(?![^}]*catch)/, type: 'async_no_try', category: 'error-handling', severity: 'medium', message: 'Async function without try-catch', description: 'Unhandled async errors', fix: 'Wrap await in try-catch', confidence: 'possible' },
];

// Mock Data Patterns  
const MOCK_PATTERNS: Pattern[] = [
  { regex: /\bMOCK_[A-Z_]+\s*=/, type: 'mock_constant', category: 'mock-data', severity: 'medium', message: 'Mock constant declaration', description: 'Mock data in production', fix: 'Remove mock data', confidence: 'certain' },
  { regex: /\bfakeData\b|\bfake[A-Z]\w*\b/, type: 'fake_data', category: 'mock-data', severity: 'medium', message: 'Fake data variable', description: 'Test data in production', fix: 'Replace with real data', confidence: 'likely' },
  { regex: /\btest@example\.com\b|\bfake@\w+\.com\b/, type: 'fake_email', category: 'mock-data', severity: 'medium', message: 'Fake email address', description: 'Test email in production', fix: 'Use real email or env var', confidence: 'certain' },
  { regex: /\bJohn\s+Doe\b|\bJane\s+Doe\b|\bTest\s+User\b/i, type: 'fake_name', category: 'mock-data', severity: 'low', message: 'Fake user name', description: 'Test name in production', fix: 'Use real or dynamic data', confidence: 'likely' },
  { regex: /lorem\s+ipsum/i, type: 'lorem_ipsum', category: 'mock-data', severity: 'medium', message: 'Lorem ipsum placeholder', description: 'Placeholder text in production', fix: 'Replace with real content', confidence: 'certain' },
  { regex: /\bdemoMode\b|\bDEMO_MODE\b/, type: 'demo_mode', category: 'mock-data', severity: 'medium', message: 'Demo mode flag', description: 'Demo mode in production code', fix: 'Remove or conditionally enable', confidence: 'likely' },
  { regex: /import.*from\s+['"]@faker-js\/faker['"]/, type: 'faker_import', category: 'mock-data', severity: 'high', message: 'Faker library imported', description: 'Test library in production', fix: 'Remove faker dependency', confidence: 'certain' },
];

// AI-Generated Code Smell Patterns (common issues in AI-generated code)
const AI_SMELL_PATTERNS: Pattern[] = [
  { regex: /return\s+true\s*;?\s*\/\/\s*(todo|placeholder|temp)/i, type: 'stub_return', category: 'ai-smell', severity: 'high', message: 'Stub return true', description: 'AI-generated placeholder', fix: 'Implement real logic', confidence: 'certain' },
  { regex: /throw\s+new\s+Error\s*\(\s*['"]Not\s+implemented/i, type: 'not_implemented', category: 'ai-smell', severity: 'high', message: 'Not implemented error', description: 'Stub code not completed', fix: 'Implement the function', confidence: 'certain' },
  { regex: /\/\/\s*TODO:\s*(implement|add|fix|complete)/i, type: 'todo_implement', category: 'ai-smell', severity: 'medium', message: 'TODO to implement', description: 'AI left incomplete code', fix: 'Complete the implementation', confidence: 'likely' },
  { regex: /success:\s*true[^}]*error/i, type: 'fake_success', category: 'ai-smell', severity: 'high', message: 'Fake success with error', description: 'Returns success despite error', fix: 'Fix error handling', confidence: 'likely' },
  { regex: /\.catch\s*\(\s*\(\s*\w*\s*\)\s*=>\s*\{\s*\}\s*\)/, type: 'swallowed_error', category: 'ai-smell', severity: 'high', message: 'Swallowed error in catch', description: 'Error caught but ignored', fix: 'Handle or log error', confidence: 'certain' },
  { regex: /res\.json\(\s*\{\s*success\s*:\s*true\s*\}\s*\).*catch/is, type: 'optimistic_response', category: 'ai-smell', severity: 'high', message: 'Optimistic response before error handling', description: 'Response sent before handling errors', fix: 'Move response after try-catch', confidence: 'likely' },
  { regex: /function\s+\w+\s*\([^)]*\)\s*\{\s*return\s+null\s*;?\s*\}/, type: 'null_stub', category: 'ai-smell', severity: 'medium', message: 'Function always returns null', description: 'Stub function implementation', fix: 'Implement real logic', confidence: 'likely' },
];

// All patterns combined
const ALL_PATTERNS: Pattern[] = [
  ...CONSOLE_PATTERNS,
  ...TODO_PATTERNS,
  ...SECRET_PATTERNS,
  ...SECURITY_PATTERNS,
  ...QUALITY_PATTERNS,
  ...MOCK_PATTERNS,
  ...AI_SMELL_PATTERNS,
];

// ============================================================================
// Scanner Class
// ============================================================================

export class CodeQualityScanner {
  private options: ScanOptions;
  private severityOrder: Severity[] = ['critical', 'high', 'medium', 'low'];

  constructor(options: ScanOptions) {
    this.options = {
      include: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
      exclude: [],
      severityThreshold: 'low',
      ...options,
    };
  }

  async scan(): Promise<CodeQualityScanResult> {
    const startTime = Date.now();
    const findings: CodeQualityFinding[] = [];

    const files = await glob(this.options.include!, {
      cwd: this.options.rootDir,
      ignore: ['**/node_modules/**', '**/dist/**', '**/.next/**', ...this.options.exclude!],
      absolute: true,
    });

    const filesToScan = files.filter(file => !shouldExclude(file));

    for (const file of filesToScan) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        const relativePath = path.relative(this.options.rootDir, file);
        const fileFindings = this.analyzeFile(content, relativePath);
        findings.push(...fileFindings);
      } catch (error) {
        // Skip unreadable files
      }
    }

    // Filter by severity threshold
    const filteredFindings = findings.filter(f => 
      this.severityOrder.indexOf(f.severity) <= this.severityOrder.indexOf(this.options.severityThreshold!)
    );

    // Sort by severity
    filteredFindings.sort((a, b) => 
      this.severityOrder.indexOf(a.severity) - this.severityOrder.indexOf(b.severity)
    );

    return {
      findings: filteredFindings,
      summary: this.buildSummary(filteredFindings),
      scannedFiles: filesToScan.length,
      duration: Date.now() - startTime,
    };
  }

  private analyzeFile(content: string, filePath: string): CodeQualityFinding[] {
    const findings: CodeQualityFinding[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Skip comment-only lines for some patterns
      const isComment = /^\s*(\/\/|\/\*|\*|#)/.test(line);

      for (const pattern of ALL_PATTERNS) {
        // Skip secret detection in comments
        if (isComment && pattern.category === 'secrets') continue;
        // Skip quality checks in comments
        if (isComment && pattern.category === 'code-quality') continue;

        if (pattern.regex.test(line)) {
          findings.push({
            id: `cq-${pattern.type}-${filePath}:${lineNum}`,
            type: pattern.type,
            category: pattern.category,
            severity: pattern.severity,
            message: pattern.message,
            description: pattern.description,
            file: filePath,
            line: lineNum,
            code: line.trim(),
            fix: pattern.fix,
            confidence: pattern.confidence,
            autoFixable: pattern.autoFixable,
          });
          break; // One finding per line per pattern category
        }
      }
    }

    return findings;
  }

  private buildSummary(findings: CodeQualityFinding[]) {
    const bySeverity: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    const byCategory: Record<string, number> = {};

    for (const finding of findings) {
      bySeverity[finding.severity]++;
      byCategory[finding.category] = (byCategory[finding.category] || 0) + 1;
    }

    return {
      total: findings.length,
      bySeverity,
      byCategory,
      autoFixable: findings.filter(f => f.autoFixable).length,
    };
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

export async function scanCodeQuality(rootDir: string, options?: Partial<ScanOptions>): Promise<CodeQualityScanResult> {
  const scanner = new CodeQualityScanner({ rootDir, ...options });
  return scanner.scan();
}

export function hasBlockingIssues(result: CodeQualityScanResult): boolean {
  return result.summary.bySeverity.critical > 0;
}

export function hasHighSeverityIssues(result: CodeQualityScanResult): boolean {
  return result.summary.bySeverity.critical > 0 || result.summary.bySeverity.high > 0;
}

export { ALL_PATTERNS, IGNORED_PATHS };
