/**
 * Advanced Scanners Module
 * 
 * Sophisticated detection engines ported from VibecheckOfficial.
 * Includes AST-based analysis, cross-file detection, and route analysis.
 * 
 * @module scanners/advanced
 */

import * as fs from 'fs/promises';
import * as fss from 'fs';
import * as path from 'path';
import { glob } from 'glob';

// ============================================================================
// Types
// ============================================================================

export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type Confidence = 'certain' | 'likely' | 'possible';

export interface AdvancedFinding {
  id: string;
  type: string;
  category: string;
  severity: Severity;
  message: string;
  description: string;
  file: string;
  line: number;
  column?: number;
  code?: string;
  fix?: string;
  confidence: Confidence;
}

export interface AdvancedScanResult {
  findings: AdvancedFinding[];
  summary: {
    total: number;
    bySeverity: Record<Severity, number>;
    byCategory: Record<string, number>;
  };
  scannedFiles: number;
  duration: number;
}

export interface AdvancedScanOptions {
  rootDir: string;
  include?: string[];
  exclude?: string[];
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
// Dead Code / Unused Function Detection
// ============================================================================

interface FunctionInfo {
  name: string;
  line: number;
  file: string;
  isExported: boolean;
  usageCount: number;
}

function findUnusedFunctions(code: string, filePath: string): AdvancedFinding[] {
  const findings: AdvancedFinding[] = [];
  const lines = code.split('\n');
  
  // Find function declarations
  const functionPatterns = [
    /function\s+(\w+)\s*\(/g,                          // function foo()
    /const\s+(\w+)\s*=\s*(?:async\s+)?function/g,     // const foo = function
    /const\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>/g, // const foo = () =>
    /const\s+(\w+)\s*=\s*(?:async\s+)?\w+\s*=>/g,     // const foo = async x =>
  ];
  
  const declaredFunctions: Map<string, { line: number, isExported: boolean }> = new Map();
  
  for (const pattern of functionPatterns) {
    let match;
    while ((match = pattern.exec(code)) !== null) {
      const funcName = match[1];
      // Skip common entry points and lifecycle methods
      if (['main', 'init', 'setup', 'configure', 'default', 'render', 'constructor', 
           'componentDidMount', 'componentDidUpdate', 'componentWillUnmount',
           'useEffect', 'useState', 'useMemo', 'useCallback'].includes(funcName)) continue;
      
      const beforeMatch = code.substring(0, match.index);
      const lineNum = beforeMatch.split('\n').length;
      
      // Check if exported
      const lineContent = lines[lineNum - 1] || '';
      const isExported = /export\s+(default\s+)?/.test(lineContent) || 
                         /^export\s/.test(lines.slice(0, lineNum).reverse().find(l => l.includes(funcName)) || '');
      
      declaredFunctions.set(funcName, { line: lineNum, isExported });
    }
  }
  
  // Count usages (excluding the declaration itself)
  for (const [funcName, info] of declaredFunctions) {
    // Skip exported functions (they might be used elsewhere)
    if (info.isExported) continue;
    
    const usagePattern = new RegExp(`\\b${funcName}\\b`, 'g');
    const usages = (code.match(usagePattern) || []).length;
    
    // If only 1 usage (the declaration), it's unused
    if (usages === 1) {
      findings.push({
        id: `adv-unused-${filePath}:${info.line}`,
        type: 'unused_function',
        category: 'dead-code',
        severity: 'medium',
        message: `Unused function: ${funcName}`,
        description: 'Function is declared but never called within this file',
        file: filePath,
        line: info.line,
        code: lines[info.line - 1]?.trim(),
        fix: 'Remove the unused function or export it if used elsewhere',
        confidence: 'likely',
      });
    }
  }
  
  return findings;
}

// ============================================================================
// Magic Numbers Detection
// ============================================================================

function findMagicNumbers(code: string, filePath: string): AdvancedFinding[] {
  const findings: AdvancedFinding[] = [];
  const lines = code.split('\n');
  const reported = new Set<string>();
  
  // Common acceptable numbers
  const ACCEPTABLE = new Set([0, 1, -1, 2, 10, 100, 1000, 24, 60, 365, 
                              200, 201, 204, 400, 401, 403, 404, 500, 502, 503]);
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Skip comments
    if (/^\s*(\/\/|\/\*|\*)/.test(line)) continue;
    // Skip import/require statements
    if (/^\s*(import|require|from)/.test(line)) continue;
    // Skip const declarations (those are named constants)
    if (/^\s*const\s+[A-Z_]+\s*=/.test(line)) continue;
    
    // Find numeric literals in calculations or comparisons
    const matches = line.matchAll(/[=<>+\-*/%]\s*(\d+)\b/g);
    for (const match of matches) {
      const num = parseInt(match[1]);
      
      // Skip acceptable numbers
      if (ACCEPTABLE.has(num)) continue;
      if (num < 10) continue;
      
      const key = `${filePath}:${i}:${num}`;
      if (reported.has(key)) continue;
      reported.add(key);
      
      findings.push({
        id: `adv-magic-${key}`,
        type: 'magic_number',
        category: 'code-quality',
        severity: 'low',
        message: `Magic number: ${num}`,
        description: 'Unexplained numeric literal - consider using a named constant',
        file: filePath,
        line: i + 1,
        code: line.trim(),
        fix: `Extract ${num} into a named constant like: const SOME_MEANINGFUL_NAME = ${num}`,
        confidence: 'possible',
      });
    }
  }
  
  return findings;
}

// ============================================================================
// Ghost Auth / Unprotected Endpoint Detection
// ============================================================================

interface RouteInfo {
  method: string;
  path: string;
  file: string;
  line: number;
  hasAuth: boolean;
}

function findGhostAuth(code: string, filePath: string): AdvancedFinding[] {
  const findings: AdvancedFinding[] = [];
  const lines = code.split('\n');
  
  // Sensitive path patterns
  const SENSITIVE_PATHS = [
    /\/api\/admin/,
    /\/api\/billing/,
    /\/api\/stripe/,
    /\/api\/org/,
    /\/api\/team/,
    /\/api\/account/,
    /\/api\/settings/,
    /\/api\/users/,
    /\/api\/user/,
    /\/api\/payment/,
    /\/api\/private/,
  ];
  
  // Auth signal patterns
  const AUTH_SIGNALS = [
    /getServerSession/,
    /\bauth\(\)/,
    /\bclerk\b/i,
    /createRouteHandlerClient/,
    /verifyToken/,
    /verifyJWT/,
    /jwtVerify/,
    /authorization/i,
    /bearer/i,
    /isAdmin/,
    /requireAuth/,
    /withAuth/,
    /middleware/i,
  ];
  
  // Route patterns (Express, Fastify, Next.js)
  const routePatterns = [
    /\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/gi,
    /router\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/gi,
    /app\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/gi,
  ];
  
  // Check if file has auth signals
  const hasFileAuthSignal = AUTH_SIGNALS.some(pattern => pattern.test(code));
  
  for (const pattern of routePatterns) {
    let match;
    while ((match = pattern.exec(code)) !== null) {
      const method = match[1].toUpperCase();
      const routePath = match[2];
      
      // Check if this is a sensitive route
      const isSensitive = SENSITIVE_PATHS.some(p => p.test(routePath));
      if (!isSensitive) continue;
      
      const beforeMatch = code.substring(0, match.index);
      const lineNum = beforeMatch.split('\n').length;
      
      // Check for auth in the handler (simple heuristic)
      // Look at the next 20 lines for auth signals
      const handlerCode = lines.slice(lineNum - 1, lineNum + 20).join('\n');
      const hasRouteAuth = AUTH_SIGNALS.some(pattern => pattern.test(handlerCode));
      
      if (!hasRouteAuth && !hasFileAuthSignal) {
        findings.push({
          id: `adv-ghost-auth-${filePath}:${lineNum}`,
          type: 'unprotected_endpoint',
          category: 'security',
          severity: 'high',
          message: `Unprotected sensitive endpoint: ${method} ${routePath}`,
          description: 'This endpoint handles sensitive data but appears to have no authentication',
          file: filePath,
          line: lineNum,
          code: lines[lineNum - 1]?.trim(),
          fix: 'Add authentication middleware or auth check at the start of the handler',
          confidence: 'likely',
        });
      }
    }
  }
  
  return findings;
}

// ============================================================================
// Rate Limit Detection
// ============================================================================

function findMissingRateLimit(code: string, filePath: string): AdvancedFinding[] {
  const findings: AdvancedFinding[] = [];
  const lines = code.split('\n');
  
  // Only check files that look like API routes
  const isApiFile = /\/(api|routes|handlers|controllers)\//i.test(filePath) ||
                    /route\.(ts|js)$/i.test(filePath);
  if (!isApiFile) return findings;
  
  // Check for rate limiting signals
  const hasRateLimit = /rateLimit|rateLimiter|throttle|slowDown|express-rate-limit|@upstash\/ratelimit/i.test(code);
  
  // Look for mutation endpoints
  const mutationPatterns = [
    /\.(post|put|patch|delete)\s*\(/gi,
    /method\s*[:=]\s*['"`](POST|PUT|PATCH|DELETE)['"`]/gi,
  ];
  
  let hasMutations = false;
  for (const pattern of mutationPatterns) {
    if (pattern.test(code)) {
      hasMutations = true;
      break;
    }
  }
  
  if (hasMutations && !hasRateLimit) {
    findings.push({
      id: `adv-rate-limit-${filePath}`,
      type: 'missing_rate_limit',
      category: 'security',
      severity: 'medium',
      message: 'API route without rate limiting',
      description: 'Mutation endpoints should have rate limiting to prevent abuse',
      file: filePath,
      line: 1,
      fix: 'Add rate limiting middleware (e.g., express-rate-limit, @upstash/ratelimit)',
      confidence: 'likely',
    });
  }
  
  return findings;
}

// ============================================================================
// Token Expiry Detection
// ============================================================================

function findMissingTokenExpiry(code: string, filePath: string): AdvancedFinding[] {
  const findings: AdvancedFinding[] = [];
  const lines = code.split('\n');
  
  // Look for JWT signing
  const jwtSignPattern = /jwt\.sign\s*\(/gi;
  let match;
  
  while ((match = jwtSignPattern.exec(code)) !== null) {
    const beforeMatch = code.substring(0, match.index);
    const lineNum = beforeMatch.split('\n').length;
    
    // Check if expiresIn is present in the surrounding context (20 lines)
    const contextStart = Math.max(0, lineNum - 5);
    const contextEnd = Math.min(lines.length, lineNum + 15);
    const context = lines.slice(contextStart, contextEnd).join('\n');
    
    if (!/expiresIn|exp\s*:/i.test(context)) {
      findings.push({
        id: `adv-jwt-expiry-${filePath}:${lineNum}`,
        type: 'missing_token_expiry',
        category: 'security',
        severity: 'high',
        message: 'JWT signed without expiration',
        description: 'JWT tokens should always have an expiration time for security',
        file: filePath,
        line: lineNum,
        code: lines[lineNum - 1]?.trim(),
        fix: "Add expiresIn option: jwt.sign(payload, secret, { expiresIn: '1h' })",
        confidence: 'likely',
      });
    }
  }
  
  return findings;
}

// ============================================================================
// Missing Route Detection (simplified - checks for 404 handlers)
// ============================================================================

function findMissingRouteHandlers(code: string, filePath: string): AdvancedFinding[] {
  const findings: AdvancedFinding[] = [];
  
  // Only check main app/server files
  const isMainFile = /(app|server|index)\.(ts|js)$/i.test(filePath) ||
                     /routes\/index/i.test(filePath);
  if (!isMainFile) return findings;
  
  // Check for 404 handler
  const has404Handler = /404|not\s*found|catch[-\s]*all/i.test(code);
  
  // Check for route definitions
  const hasRoutes = /\.(get|post|put|patch|delete|use)\s*\(/i.test(code);
  
  if (hasRoutes && !has404Handler) {
    findings.push({
      id: `adv-404-handler-${filePath}`,
      type: 'missing_404_handler',
      category: 'routes',
      severity: 'low',
      message: 'No 404 handler found',
      description: 'App should have a catch-all 404 handler for undefined routes',
      file: filePath,
      line: 1,
      fix: "Add a catch-all route: app.use('*', (req, res) => res.status(404).json({ error: 'Not Found' }))",
      confidence: 'possible',
    });
  }
  
  return findings;
}

// ============================================================================
// Empty Handler Detection
// ============================================================================

function findEmptyHandlers(code: string, filePath: string): AdvancedFinding[] {
  const findings: AdvancedFinding[] = [];
  const lines = code.split('\n');
  
  // Pattern for empty route handlers
  const emptyHandlerPattern = /\.(get|post|put|patch|delete)\s*\(\s*['"`][^'"`]+['"`]\s*,\s*(?:async\s+)?\([^)]*\)\s*=>\s*\{\s*\}\s*\)/g;
  
  let match;
  while ((match = emptyHandlerPattern.exec(code)) !== null) {
    const beforeMatch = code.substring(0, match.index);
    const lineNum = beforeMatch.split('\n').length;
    
    findings.push({
      id: `adv-empty-handler-${filePath}:${lineNum}`,
      type: 'empty_handler',
      category: 'code-quality',
      severity: 'high',
      message: 'Empty route handler',
      description: 'Route handler does nothing - requests will hang or fail',
      file: filePath,
      line: lineNum,
      code: lines[lineNum - 1]?.trim(),
      fix: 'Implement the handler or return a proper response',
      confidence: 'certain',
    });
  }
  
  return findings;
}

// ============================================================================
// Exposed Error Detection
// ============================================================================

function findExposedErrors(code: string, filePath: string): AdvancedFinding[] {
  const findings: AdvancedFinding[] = [];
  const lines = code.split('\n');
  
  // Patterns that expose error details to clients
  const exposedPatterns = [
    { regex: /res\.(?:json|send)\s*\(\s*(?:err|error|e)\.(?:stack|message)/g, type: 'stack_exposure', msg: 'Error stack/message exposed to client' },
    { regex: /res\.(?:json|send)\s*\(\s*\{\s*(?:error|message)\s*:\s*(?:err|error|e)\b/g, type: 'error_object', msg: 'Full error object sent to client' },
    { regex: /catch.*res\.status\(\d+\)\.(?:json|send)\s*\(\s*\{[^}]*stack/g, type: 'catch_stack', msg: 'Stack trace sent in error response' },
  ];
  
  for (const pattern of exposedPatterns) {
    let match;
    while ((match = pattern.regex.exec(code)) !== null) {
      const beforeMatch = code.substring(0, match.index);
      const lineNum = beforeMatch.split('\n').length;
      
      findings.push({
        id: `adv-exposed-error-${filePath}:${lineNum}`,
        type: pattern.type,
        category: 'security',
        severity: 'medium',
        message: pattern.msg,
        description: 'Error details should not be exposed to clients in production',
        file: filePath,
        line: lineNum,
        code: lines[lineNum - 1]?.trim(),
        fix: 'Return generic error message: res.status(500).json({ error: "Internal server error" })',
        confidence: 'likely',
      });
    }
  }
  
  return findings;
}

// ============================================================================
// Async Error Handling Detection
// ============================================================================

function findAsyncErrors(code: string, filePath: string): AdvancedFinding[] {
  const findings: AdvancedFinding[] = [];
  const lines = code.split('\n');
  
  // Find async handlers without try-catch
  const asyncHandlerPattern = /\.(get|post|put|patch|delete)\s*\([^,]+,\s*async\s+\([^)]*\)\s*=>\s*\{/g;
  
  let match;
  while ((match = asyncHandlerPattern.exec(code)) !== null) {
    const beforeMatch = code.substring(0, match.index);
    const startLine = beforeMatch.split('\n').length;
    
    // Find the closing brace (simplified - look for next 50 lines)
    const handlerCode = code.substring(match.index, match.index + 2000);
    
    // Check if there's a try-catch
    if (!/\btry\s*\{/.test(handlerCode.split('}')[0])) {
      findings.push({
        id: `adv-async-error-${filePath}:${startLine}`,
        type: 'unhandled_async',
        category: 'error-handling',
        severity: 'medium',
        message: 'Async handler without try-catch',
        description: 'Unhandled errors in async handlers can crash the server',
        file: filePath,
        line: startLine,
        code: lines[startLine - 1]?.trim(),
        fix: 'Wrap async handler body in try-catch or use error handling middleware',
        confidence: 'likely',
      });
    }
  }
  
  return findings;
}

// ============================================================================
// Duplicate Route Detection
// ============================================================================

function findDuplicateRoutes(code: string, filePath: string): AdvancedFinding[] {
  const findings: AdvancedFinding[] = [];
  const lines = code.split('\n');
  
  // Track routes by method+path
  const routes = new Map<string, number[]>();
  
  const routePattern = /\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
  let match;
  
  while ((match = routePattern.exec(code)) !== null) {
    const method = match[1].toUpperCase();
    const routePath = match[2];
    const key = `${method} ${routePath}`;
    
    const beforeMatch = code.substring(0, match.index);
    const lineNum = beforeMatch.split('\n').length;
    
    if (!routes.has(key)) {
      routes.set(key, []);
    }
    routes.get(key)!.push(lineNum);
  }
  
  // Find duplicates
  for (const [route, lineNums] of routes) {
    if (lineNums.length > 1) {
      findings.push({
        id: `adv-dup-route-${filePath}:${lineNums[0]}`,
        type: 'duplicate_route',
        category: 'routes',
        severity: 'high',
        message: `Duplicate route: ${route}`,
        description: `Route defined ${lineNums.length} times (lines: ${lineNums.join(', ')})`,
        file: filePath,
        line: lineNums[0],
        code: lines[lineNums[0] - 1]?.trim(),
        fix: 'Remove duplicate route definitions',
        confidence: 'certain',
      });
    }
  }
  
  return findings;
}

// ============================================================================
// Main Scanner Class
// ============================================================================

export class AdvancedScanner {
  private options: AdvancedScanOptions;
  private severityOrder: Severity[] = ['critical', 'high', 'medium', 'low'];

  constructor(options: AdvancedScanOptions) {
    this.options = {
      include: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
      exclude: [],
      ...options,
    };
  }

  async scan(): Promise<AdvancedScanResult> {
    const startTime = Date.now();
    const findings: AdvancedFinding[] = [];

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
        
        // Run all detection engines
        findings.push(...findUnusedFunctions(content, relativePath));
        findings.push(...findMagicNumbers(content, relativePath));
        findings.push(...findGhostAuth(content, relativePath));
        findings.push(...findMissingRateLimit(content, relativePath));
        findings.push(...findMissingTokenExpiry(content, relativePath));
        findings.push(...findMissingRouteHandlers(content, relativePath));
        findings.push(...findEmptyHandlers(content, relativePath));
        findings.push(...findExposedErrors(content, relativePath));
        findings.push(...findAsyncErrors(content, relativePath));
        findings.push(...findDuplicateRoutes(content, relativePath));
      } catch {
        // Skip unreadable files
      }
    }

    // Sort by severity
    findings.sort((a, b) => 
      this.severityOrder.indexOf(a.severity) - this.severityOrder.indexOf(b.severity)
    );

    return {
      findings,
      summary: this.buildSummary(findings),
      scannedFiles: filesToScan.length,
      duration: Date.now() - startTime,
    };
  }

  private buildSummary(findings: AdvancedFinding[]) {
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
    };
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

export async function runAdvancedScan(rootDir: string, options?: Partial<AdvancedScanOptions>): Promise<AdvancedScanResult> {
  const scanner = new AdvancedScanner({ rootDir, ...options });
  return scanner.scan();
}

export {
  findUnusedFunctions,
  findMagicNumbers,
  findGhostAuth,
  findMissingRateLimit,
  findMissingTokenExpiry,
  findMissingRouteHandlers,
  findEmptyHandlers,
  findExposedErrors,
  findAsyncErrors,
  findDuplicateRoutes,
};
