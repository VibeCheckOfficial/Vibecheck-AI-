/**
 * Code Validator
 *
 * Validates generated code for correctness, style compliance,
 * and consistency with project conventions.
 *
 * This is a world-class implementation that catches hallucinations
 * before they reach production.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { getLogger, type Logger } from '../utils/logger.js';

export interface CodeValidationResult {
  valid: boolean;
  errors: CodeError[];
  warnings: CodeWarning[];
  metrics: CodeMetrics;
  hallucinations: HallucinationCandidate[];
}

export interface CodeError {
  type: 'syntax' | 'type' | 'import' | 'convention';
  message: string;
  location: CodeLocation;
  suggestion?: string;
  severity: 'error' | 'critical';
  code: string;
}

export interface CodeWarning {
  type: 'style' | 'complexity' | 'deprecation' | 'security' | 'hallucination';
  message: string;
  location: CodeLocation;
  suggestion?: string;
}

export interface CodeLocation {
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
}

export interface CodeMetrics {
  lines: number;
  linesOfCode: number;
  complexity: number;
  imports: number;
  functions: number;
  types: number;
  classes: number;
  comments: number;
  hallucinationRisk: number;
}

export interface HallucinationCandidate {
  type: 'fake_import' | 'fake_api' | 'fake_method' | 'fake_type' | 'invented_pattern';
  evidence: string;
  location: CodeLocation;
  confidence: number;
  suggestion: string;
}

export interface ValidatorConfig {
  strictMode: boolean;
  checkTypes: boolean;
  checkStyle: boolean;
  checkSecurity: boolean;
  checkHallucinations: boolean;
  projectRoot: string;
  packageJsonPath?: string;
  tsconfigPath?: string;
}

const DEFAULT_CONFIG: ValidatorConfig = {
  strictMode: true,
  checkTypes: true,
  checkStyle: true,
  checkSecurity: true,
  checkHallucinations: true,
  projectRoot: process.cwd(),
};

// Known legitimate packages that are commonly used
const KNOWN_PACKAGES = new Set([
  // Node.js built-ins
  'fs', 'path', 'os', 'crypto', 'http', 'https', 'url', 'util', 'stream',
  'buffer', 'events', 'child_process', 'cluster', 'dns', 'net', 'tls',
  'readline', 'zlib', 'querystring', 'assert', 'async_hooks', 'perf_hooks',
  'worker_threads', 'fs/promises', 'node:fs', 'node:path', 'node:crypto',
  // Common npm packages
  'react', 'react-dom', 'next', 'express', 'fastify', 'koa', 'hapi',
  'lodash', 'underscore', 'ramda', 'axios', 'node-fetch', 'got', 'superagent',
  'typescript', 'zod', 'yup', 'joi', 'ajv', 'class-validator',
  'prisma', '@prisma/client', 'mongoose', 'sequelize', 'typeorm', 'knex',
  'jest', 'mocha', 'vitest', 'ava', 'tape', 'chai', 'sinon',
  'eslint', 'prettier', 'webpack', 'vite', 'rollup', 'esbuild', 'parcel',
  'dotenv', 'commander', 'yargs', 'inquirer', 'chalk', 'ora', 'boxen',
  'uuid', 'nanoid', 'date-fns', 'dayjs', 'moment', 'luxon',
  'socket.io', 'ws', 'redis', 'ioredis', 'bullmq', 'bee-queue',
  'jsonwebtoken', 'bcrypt', 'bcryptjs', 'argon2', 'passport',
  '@aws-sdk', '@azure', '@google-cloud', 'firebase', 'supabase',
  '@clerk/clerk-sdk-node', '@clerk/nextjs', '@auth0/auth0-react',
  'stripe', 'twilio', 'sendgrid', 'mailgun', 'nodemailer',
  'winston', 'pino', 'bunyan', 'morgan', 'debug',
  'glob', 'minimatch', 'fast-glob', 'chokidar', 'fs-extra',
]);

// Patterns that suggest hallucinated code
const HALLUCINATION_PATTERNS = [
  // Fake API patterns
  { pattern: /(?:fetch|axios\.get|axios\.post)\s*\(\s*['"`]https?:\/\/api\.example\.com/gi, type: 'fake_api' as const },
  { pattern: /(?:fetch|axios\.get|axios\.post)\s*\(\s*['"`]https?:\/\/localhost:\d+\/api\/v\d+\/fake/gi, type: 'fake_api' as const },
  { pattern: /(?:fetch|axios\.get|axios\.post)\s*\(\s*['"`]https?:\/\/jsonplaceholder/gi, type: 'fake_api' as const },
  { pattern: /(?:fetch|axios\.get|axios\.post)\s*\(\s*['"`]https?:\/\/reqres\.in/gi, type: 'fake_api' as const },

  // Fake method patterns
  { pattern: /\.(doMagic|autoSolve|fixEverything|smartFix|aiGenerate|hallucinate)\s*\(/gi, type: 'fake_method' as const },
  { pattern: /\.(superMethod|megaFunction|ultraHelper|gptGenerate)\s*\(/gi, type: 'fake_method' as const },

  // Invented patterns
  { pattern: /\/\/\s*TODO:\s*implement\s+(?:later|this|properly)/gi, type: 'invented_pattern' as const },
  { pattern: /throw\s+new\s+Error\s*\(\s*['"`]Not\s+implemented['"`]\s*\)/gi, type: 'invented_pattern' as const },
  { pattern: /return\s+(?:null|undefined|{});\s*\/\/\s*placeholder/gi, type: 'invented_pattern' as const },
];

// Security patterns
const SECURITY_PATTERNS = [
  { pattern: /eval\s*\(/g, message: 'Avoid eval() - it can execute arbitrary code', severity: 'critical' as const },
  { pattern: /new\s+Function\s*\(/g, message: 'Avoid new Function() - similar risks to eval()', severity: 'critical' as const },
  { pattern: /innerHTML\s*=/g, message: 'innerHTML can lead to XSS - use textContent or sanitize', severity: 'high' as const },
  { pattern: /document\.write\s*\(/g, message: 'document.write is dangerous and deprecated', severity: 'high' as const },
  { pattern: /dangerouslySetInnerHTML/g, message: 'dangerouslySetInnerHTML can lead to XSS', severity: 'medium' as const },
  { pattern: /(?:password|secret|api_key|apikey|token)\s*[:=]\s*['"`][^'"`]{8,}['"`]/gi, message: 'Potential hardcoded secret detected', severity: 'critical' as const },
  { pattern: /(?:SELECT|INSERT|UPDATE|DELETE).*\+.*(?:req\.|params\.|query\.)/gi, message: 'Potential SQL injection - use parameterized queries', severity: 'critical' as const },
  { pattern: /\$\{.*(?:req\.|params\.|query\.).*\}/g, message: 'Template literal with user input - potential injection', severity: 'high' as const },
  { pattern: /exec\s*\(\s*(?:req\.|params\.|query\.)/g, message: 'Command injection risk - sanitize input', severity: 'critical' as const },
  { pattern: /\.createReadStream\s*\(\s*(?:req\.|params\.|query\.)/g, message: 'Path traversal risk - validate file paths', severity: 'high' as const },
];

export class CodeValidator {
  private config: ValidatorConfig;
  private logger: Logger;
  private packageJson: Record<string, unknown> | null = null;
  private dependencies: Set<string> = new Set();

  constructor(config: Partial<ValidatorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = getLogger('code-validator');
  }

  /**
   * Initialize validator - load package.json, etc.
   */
  async initialize(): Promise<void> {
    await this.loadPackageJson();
  }

  /**
   * Validate code content
   */
  async validate(content: string, filePath: string): Promise<CodeValidationResult> {
    const errors: CodeError[] = [];
    const warnings: CodeWarning[] = [];
    const hallucinations: HallucinationCandidate[] = [];

    // Ensure initialized
    if (!this.packageJson) {
      await this.initialize();
    }

    const lines = content.split('\n');

    // Syntax validation
    const syntaxErrors = await this.validateSyntax(content, filePath, lines);
    errors.push(...syntaxErrors);

    // Import validation - critical for hallucination detection
    const importErrors = await this.validateImports(content, filePath, lines);
    errors.push(...importErrors);

    // Type validation
    if (this.config.checkTypes) {
      const typeErrors = await this.validateTypes(content, filePath, lines);
      errors.push(...typeErrors);
    }

    // Convention validation
    const conventionErrors = await this.validateConventions(content, filePath, lines);
    errors.push(...conventionErrors);

    // Style warnings
    if (this.config.checkStyle) {
      const styleWarnings = await this.checkStyle(content, filePath, lines);
      warnings.push(...styleWarnings);
    }

    // Security warnings
    if (this.config.checkSecurity) {
      const securityWarnings = await this.checkSecurity(content, filePath, lines);
      warnings.push(...securityWarnings);
    }

    // Hallucination detection
    if (this.config.checkHallucinations) {
      const hallucinationCandidates = await this.detectHallucinations(content, filePath, lines);
      hallucinations.push(...hallucinationCandidates);

      // Add warnings for hallucinations
      for (const h of hallucinationCandidates) {
        warnings.push({
          type: 'hallucination',
          message: `Potential hallucination: ${h.type} - ${h.evidence}`,
          location: h.location,
          suggestion: h.suggestion,
        });
      }
    }

    const metrics = this.calculateMetrics(content, lines, hallucinations);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      metrics,
      hallucinations,
    };
  }

  /**
   * Quick check if code has obvious issues
   */
  async quickCheck(content: string): Promise<{ ok: boolean; issues: string[] }> {
    const issues: string[] = [];

    // Check for obvious syntax errors
    const braceCount = (content.match(/{/g) ?? []).length - (content.match(/}/g) ?? []).length;
    if (braceCount !== 0) {
      issues.push(`Unbalanced braces: ${braceCount > 0 ? 'missing }' : 'extra }'}`);
    }

    const parenCount = (content.match(/\(/g) ?? []).length - (content.match(/\)/g) ?? []).length;
    if (parenCount !== 0) {
      issues.push(`Unbalanced parentheses: ${parenCount > 0 ? 'missing )' : 'extra )'}`);
    }

    const bracketCount = (content.match(/\[/g) ?? []).length - (content.match(/\]/g) ?? []).length;
    if (bracketCount !== 0) {
      issues.push(`Unbalanced brackets: ${bracketCount > 0 ? 'missing ]' : 'extra ]'}`);
    }

    // Check for obvious hallucination patterns
    for (const { pattern, type } of HALLUCINATION_PATTERNS) {
      if (pattern.test(content)) {
        issues.push(`Potential hallucination detected: ${type}`);
      }
    }

    return { ok: issues.length === 0, issues };
  }

  // ============================================================================
  // Private Methods - Syntax Validation
  // ============================================================================

  private async validateSyntax(
    content: string,
    filePath: string,
    lines: string[]
  ): Promise<CodeError[]> {
    const errors: CodeError[] = [];
    const ext = path.extname(filePath).toLowerCase();

    // Check brace/bracket/paren balance
    const balanceErrors = this.checkBalancing(content, lines);
    errors.push(...balanceErrors);

    // Check for common syntax issues
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Double semicolons
      if (/;;(?!\s*$)/.test(line)) {
        errors.push({
          type: 'syntax',
          message: 'Double semicolon detected',
          location: { line: lineNum, column: line.indexOf(';;') + 1 },
          suggestion: 'Remove the extra semicolon',
          severity: 'error',
          code: 'SYNTAX_DOUBLE_SEMICOLON',
        });
      }

      // Missing semicolon before closing brace (common AI mistake)
      if (/[^;{}\s]\s*}\s*$/.test(line) && !line.includes('=>') && !line.includes('//')) {
        const prevLine = i > 0 ? lines[i - 1] : '';
        if (!prevLine.trim().endsWith('{') && !prevLine.trim().endsWith(',')) {
          // This might be intentional, skip
        }
      }

      // Typos in keywords
      const keywordTypos: Array<[RegExp, string]> = [
        [/\bfunciton\b/g, 'function'],
        [/\bretrun\b/g, 'return'],
        [/\bconts\b/g, 'const'],
        [/\bawiat\b/g, 'await'],
        [/\basnyc\b/g, 'async'],
        [/\bimprot\b/g, 'import'],
        [/\bexprot\b/g, 'export'],
        [/\binterafce\b/g, 'interface'],
        [/\bclss\b/g, 'class'],
      ];

      for (const [typo, correct] of keywordTypos) {
        const match = typo.exec(line);
        if (match) {
          errors.push({
            type: 'syntax',
            message: `Typo: "${match[0]}" should be "${correct}"`,
            location: { line: lineNum, column: match.index + 1 },
            suggestion: `Replace with "${correct}"`,
            severity: 'error',
            code: 'SYNTAX_TYPO',
          });
        }
      }
    }

    // TypeScript/JavaScript specific checks
    if (ext === '.ts' || ext === '.tsx') {
      const tsErrors = this.validateTypeScriptSyntax(content, lines);
      errors.push(...tsErrors);
    }

    return errors;
  }

  private checkBalancing(content: string, lines: string[]): CodeError[] {
    const errors: CodeError[] = [];
    const stack: Array<{ char: string; line: number; column: number }> = [];
    const pairs: Record<string, string> = { '{': '}', '[': ']', '(': ')' };
    const closers: Record<string, string> = { '}': '{', ']': '[', ')': '(' };

    let inString = false;
    let stringChar = '';
    let inComment = false;
    let inMultilineComment = false;

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];

      for (let col = 0; col < line.length; col++) {
        const char = line[col];
        const nextChar = line[col + 1];
        const prevChar = line[col - 1];

        // Handle comments
        if (!inString) {
          if (char === '/' && nextChar === '/') {
            break; // Rest of line is comment
          }
          if (char === '/' && nextChar === '*') {
            inMultilineComment = true;
            continue;
          }
          if (char === '*' && nextChar === '/') {
            inMultilineComment = false;
            col++;
            continue;
          }
        }

        if (inMultilineComment) continue;

        // Handle strings
        if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
          if (!inString) {
            inString = true;
            stringChar = char;
          } else if (char === stringChar) {
            inString = false;
          }
          continue;
        }

        if (inString) continue;

        // Check brackets
        if (pairs[char]) {
          stack.push({ char, line: lineIdx + 1, column: col + 1 });
        } else if (closers[char]) {
          const last = stack.pop();
          if (!last) {
            errors.push({
              type: 'syntax',
              message: `Unexpected "${char}" - no matching opening bracket`,
              location: { line: lineIdx + 1, column: col + 1 },
              severity: 'error',
              code: 'SYNTAX_UNMATCHED_BRACKET',
            });
          } else if (pairs[last.char] !== char) {
            errors.push({
              type: 'syntax',
              message: `Mismatched brackets: expected "${pairs[last.char]}" but found "${char}"`,
              location: { line: lineIdx + 1, column: col + 1 },
              suggestion: `Check the bracket at line ${last.line}, column ${last.column}`,
              severity: 'error',
              code: 'SYNTAX_MISMATCHED_BRACKET',
            });
          }
        }
      }
    }

    // Check for unclosed brackets
    for (const unclosed of stack) {
      errors.push({
        type: 'syntax',
        message: `Unclosed "${unclosed.char}"`,
        location: { line: unclosed.line, column: unclosed.column },
        suggestion: `Add closing "${pairs[unclosed.char]}"`,
        severity: 'error',
        code: 'SYNTAX_UNCLOSED_BRACKET',
      });
    }

    return errors;
  }

  private validateTypeScriptSyntax(content: string, lines: string[]): CodeError[] {
    const errors: CodeError[] = [];

    // Check for common TypeScript mistakes
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Using 'any' type
      if (/:\s*any\b/.test(line) && !line.includes('// eslint-disable')) {
        errors.push({
          type: 'type',
          message: 'Avoid using "any" type - use "unknown" or specific types',
          location: { line: lineNum, column: line.indexOf('any') + 1 },
          suggestion: 'Replace with specific type or "unknown"',
          severity: 'error',
          code: 'TS_NO_ANY',
        });
      }

      // Non-null assertion overuse
      const nonNullCount = (line.match(/!\./g) ?? []).length;
      if (nonNullCount > 2) {
        errors.push({
          type: 'type',
          message: 'Excessive non-null assertions - indicates type safety issues',
          location: { line: lineNum, column: 1 },
          suggestion: 'Use proper null checks or fix the type definitions',
          severity: 'error',
          code: 'TS_EXCESSIVE_NON_NULL',
        });
      }
    }

    return errors;
  }

  // ============================================================================
  // Private Methods - Import Validation
  // ============================================================================

  private async validateImports(
    content: string,
    filePath: string,
    lines: string[]
  ): Promise<CodeError[]> {
    const errors: CodeError[] = [];

    // Extract all imports
    const importRegex = /import\s+(?:{[^}]+}|\*\s+as\s+\w+|\w+)?\s*(?:,\s*{[^}]+})?\s*from\s+['"]([^'"]+)['"]/g;
    const requireRegex = /(?:const|let|var)\s+(?:{[^}]+}|\w+)\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

    let match;

    // Check imports
    while ((match = importRegex.exec(content)) !== null) {
      const importPath = match[1];
      const lineNum = this.getLineNumber(content, match.index);

      const importError = await this.validateSingleImport(importPath, filePath, lineNum);
      if (importError) {
        errors.push(importError);
      }
    }

    // Check requires
    while ((match = requireRegex.exec(content)) !== null) {
      const requirePath = match[1];
      const lineNum = this.getLineNumber(content, match.index);

      const importError = await this.validateSingleImport(requirePath, filePath, lineNum);
      if (importError) {
        errors.push(importError);
      }
    }

    return errors;
  }

  private async validateSingleImport(
    importPath: string,
    filePath: string,
    lineNum: number
  ): Promise<CodeError | null> {
    // Skip relative imports (validated separately)
    if (importPath.startsWith('.')) {
      return this.validateRelativeImport(importPath, filePath, lineNum);
    }

    // Check if it's a known package
    const packageName = this.extractPackageName(importPath);

    if (KNOWN_PACKAGES.has(packageName) || KNOWN_PACKAGES.has(importPath)) {
      return null; // Known valid package
    }

    // Check if it's in package.json dependencies
    if (this.dependencies.has(packageName)) {
      return null; // Listed in package.json
    }

    // Check if it's a workspace package
    if (packageName.startsWith('@vibecheck/') || packageName.startsWith('@repo/')) {
      return null; // Workspace package
    }

    // Check if it's a node: prefix import
    if (importPath.startsWith('node:')) {
      return null;
    }

    // Unknown package - potential hallucination!
    return {
      type: 'import',
      message: `Unknown package "${packageName}" - not in package.json or known packages`,
      location: { line: lineNum, column: 1 },
      suggestion: `Run "npm install ${packageName}" or verify the package name`,
      severity: 'error',
      code: 'IMPORT_UNKNOWN_PACKAGE',
    };
  }

  private async validateRelativeImport(
    importPath: string,
    filePath: string,
    lineNum: number
  ): Promise<CodeError | null> {
    const fileDir = path.dirname(filePath);
    const absoluteImportPath = path.resolve(this.config.projectRoot, fileDir, importPath);

    // Try various extensions
    const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '.json', '/index.ts', '/index.tsx', '/index.js'];

    for (const ext of extensions) {
      try {
        await fs.access(absoluteImportPath + ext);
        return null; // File exists
      } catch {
        // Try next extension
      }
    }

    // File not found - this is often a hallucination
    return {
      type: 'import',
      message: `Import target not found: "${importPath}"`,
      location: { line: lineNum, column: 1 },
      suggestion: 'Verify the file exists or create it',
      severity: 'error',
      code: 'IMPORT_NOT_FOUND',
    };
  }

  private extractPackageName(importPath: string): string {
    // Handle scoped packages (@org/package)
    if (importPath.startsWith('@')) {
      const parts = importPath.split('/');
      return parts.slice(0, 2).join('/');
    }

    // Handle regular packages
    return importPath.split('/')[0];
  }

  // ============================================================================
  // Private Methods - Type Validation
  // ============================================================================

  private async validateTypes(
    content: string,
    filePath: string,
    lines: string[]
  ): Promise<CodeError[]> {
    const errors: CodeError[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Check for @ts-ignore without explanation
      if (/@ts-ignore\s*$/.test(line)) {
        errors.push({
          type: 'type',
          message: '@ts-ignore should include an explanation',
          location: { line: lineNum, column: line.indexOf('@ts-ignore') + 1 },
          suggestion: 'Add explanation: // @ts-ignore - reason here',
          severity: 'error',
          code: 'TS_IGNORE_NO_REASON',
        });
      }

      // Check for as any casting
      if (/as\s+any\b/.test(line)) {
        errors.push({
          type: 'type',
          message: 'Avoid "as any" casting - use proper type narrowing',
          location: { line: lineNum, column: line.indexOf('as any') + 1 },
          suggestion: 'Use type guards or specific type assertions',
          severity: 'error',
          code: 'TS_AS_ANY',
        });
      }
    }

    return errors;
  }

  // ============================================================================
  // Private Methods - Convention Validation
  // ============================================================================

  private async validateConventions(
    content: string,
    filePath: string,
    lines: string[]
  ): Promise<CodeError[]> {
    const errors: CodeError[] = [];
    const fileName = path.basename(filePath);

    // Check naming conventions
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // React component should be PascalCase
      if (/^export\s+(?:default\s+)?(?:function|const)\s+([a-z][a-zA-Z0-9]*)/.test(line)) {
        if (fileName.endsWith('.tsx') || fileName.endsWith('.jsx')) {
          const match = line.match(/(?:function|const)\s+([a-z][a-zA-Z0-9]*)/);
          if (match && /^[a-z]/.test(match[1])) {
            // Check if it returns JSX (likely a component)
            const functionBody = this.extractFunctionBody(content, i);
            if (functionBody && (functionBody.includes('<') || functionBody.includes('React.createElement'))) {
              errors.push({
                type: 'convention',
                message: `React component "${match[1]}" should use PascalCase`,
                location: { line: lineNum, column: line.indexOf(match[1]) + 1 },
                suggestion: `Rename to "${match[1].charAt(0).toUpperCase() + match[1].slice(1)}"`,
                severity: 'error',
                code: 'CONV_COMPONENT_NAMING',
              });
            }
          }
        }
      }

      // Hooks should start with "use"
      if (/^export\s+(?:function|const)\s+(?!use)([a-z][a-zA-Z0-9]*).*useState|useEffect|useRef|useMemo|useCallback/.test(line)) {
        const match = line.match(/(?:function|const)\s+([a-zA-Z][a-zA-Z0-9]*)/);
        if (match && !match[1].startsWith('use')) {
          errors.push({
            type: 'convention',
            message: `Custom hook "${match[1]}" should start with "use"`,
            location: { line: lineNum, column: line.indexOf(match[1]) + 1 },
            suggestion: `Rename to "use${match[1].charAt(0).toUpperCase() + match[1].slice(1)}"`,
            severity: 'error',
            code: 'CONV_HOOK_NAMING',
          });
        }
      }

      // Constants should be SCREAMING_SNAKE_CASE if exported and primitive
      if (/^export\s+const\s+([a-z][a-zA-Z0-9_]*)\s*=\s*(?:['"`]|[0-9]|true|false)/.test(line)) {
        const match = line.match(/const\s+([a-z][a-zA-Z0-9_]*)/);
        if (match && !/^[A-Z_]+$/.test(match[1])) {
          // Only flag if it looks like a true constant
          errors.push({
            type: 'convention',
            message: `Exported constant "${match[1]}" should use SCREAMING_SNAKE_CASE`,
            location: { line: lineNum, column: line.indexOf(match[1]) + 1 },
            suggestion: `Rename to "${this.toScreamingSnakeCase(match[1])}"`,
            severity: 'error',
            code: 'CONV_CONSTANT_NAMING',
          });
        }
      }
    }

    return errors;
  }

  // ============================================================================
  // Private Methods - Style Checking
  // ============================================================================

  private async checkStyle(
    content: string,
    filePath: string,
    lines: string[]
  ): Promise<CodeWarning[]> {
    const warnings: CodeWarning[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Line too long
      if (line.length > 120) {
        warnings.push({
          type: 'style',
          message: `Line exceeds 120 characters (${line.length})`,
          location: { line: lineNum, column: 121 },
          suggestion: 'Break into multiple lines',
        });
      }

      // Trailing whitespace
      if (/\s+$/.test(line)) {
        warnings.push({
          type: 'style',
          message: 'Trailing whitespace',
          location: { line: lineNum, column: line.trimEnd().length + 1 },
        });
      }

      // Console.log in production code
      if (/console\.(log|debug|info)\s*\(/.test(line) && !filePath.includes('.test.') && !filePath.includes('.spec.')) {
        warnings.push({
          type: 'style',
          message: 'console.log should not be in production code',
          location: { line: lineNum, column: line.indexOf('console') + 1 },
          suggestion: 'Use a proper logger or remove',
        });
      }

      // Magic numbers
      const magicNumberMatch = /(?<![a-zA-Z_])(?<!\.)\b(\d{4,})\b(?!\s*[:=])/.exec(line);
      if (magicNumberMatch && !line.includes('//')) {
        warnings.push({
          type: 'style',
          message: `Magic number ${magicNumberMatch[1]} - consider using a named constant`,
          location: { line: lineNum, column: (magicNumberMatch.index ?? 0) + 1 },
        });
      }
    }

    // Check complexity
    const complexity = this.calculateCyclomaticComplexity(content);
    if (complexity > 15) {
      warnings.push({
        type: 'complexity',
        message: `High cyclomatic complexity (${complexity}) - consider refactoring`,
        location: { line: 1, column: 1 },
        suggestion: 'Break into smaller functions',
      });
    }

    return warnings;
  }

  // ============================================================================
  // Private Methods - Security Checking
  // ============================================================================

  private async checkSecurity(
    content: string,
    filePath: string,
    lines: string[]
  ): Promise<CodeWarning[]> {
    const warnings: CodeWarning[] = [];

    for (const { pattern, message, severity } of SECURITY_PATTERNS) {
      let match;
      const regex = new RegExp(pattern.source, pattern.flags);

      while ((match = regex.exec(content)) !== null) {
        const lineNum = this.getLineNumber(content, match.index);

        warnings.push({
          type: 'security',
          message: `[${severity.toUpperCase()}] ${message}`,
          location: { line: lineNum, column: 1 },
        });
      }
    }

    return warnings;
  }

  // ============================================================================
  // Private Methods - Hallucination Detection
  // ============================================================================

  private async detectHallucinations(
    content: string,
    filePath: string,
    lines: string[]
  ): Promise<HallucinationCandidate[]> {
    const hallucinations: HallucinationCandidate[] = [];

    // Check for hallucination patterns
    for (const { pattern, type } of HALLUCINATION_PATTERNS) {
      let match;
      const regex = new RegExp(pattern.source, pattern.flags);

      while ((match = regex.exec(content)) !== null) {
        const lineNum = this.getLineNumber(content, match.index);

        hallucinations.push({
          type,
          evidence: match[0],
          location: { line: lineNum, column: 1 },
          confidence: 0.9,
          suggestion: this.getHallucinationSuggestion(type, match[0]),
        });
      }
    }

    // Check for suspicious API endpoints
    const apiPatterns = [
      /fetch\s*\(\s*['"`]([^'"`]+)['"`]/g,
      /axios\.[a-z]+\s*\(\s*['"`]([^'"`]+)['"`]/g,
    ];

    for (const pattern of apiPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const url = match[1];
        if (this.isSuspiciousUrl(url)) {
          const lineNum = this.getLineNumber(content, match.index);
          hallucinations.push({
            type: 'fake_api',
            evidence: url,
            location: { line: lineNum, column: 1 },
            confidence: 0.8,
            suggestion: 'Verify this API endpoint exists and is correct',
          });
        }
      }
    }

    // Check for invented method names
    const methodCallRegex = /\.([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g;
    let match;

    while ((match = methodCallRegex.exec(content)) !== null) {
      const methodName = match[1];
      if (this.isSuspiciousMethodName(methodName)) {
        const lineNum = this.getLineNumber(content, match.index);
        hallucinations.push({
          type: 'fake_method',
          evidence: methodName,
          location: { line: lineNum, column: match.index + 1 },
          confidence: 0.7,
          suggestion: 'Verify this method exists on the object',
        });
      }
    }

    return hallucinations;
  }

  private isSuspiciousUrl(url: string): boolean {
    const suspiciousPatterns = [
      /example\.com/i,
      /test\.api/i,
      /fake-?api/i,
      /placeholder/i,
      /lorem/i,
      /sample-?api/i,
      /dummy/i,
      /mock-?server/i,
      /jsonplaceholder/i,
      /reqres\.in/i,
    ];

    return suspiciousPatterns.some((p) => p.test(url));
  }

  private isSuspiciousMethodName(name: string): boolean {
    const suspiciousPatterns = [
      /^do[A-Z][a-z]+Magic$/,
      /^auto(Solve|Fix|Generate|Heal)/,
      /^smart[A-Z]/,
      /^ai[A-Z]/,
      /^magic[A-Z]/,
      /^super[A-Z][a-z]+$/,
      /^mega[A-Z]/,
      /^ultra[A-Z]/,
    ];

    return suspiciousPatterns.some((p) => p.test(name));
  }

  private getHallucinationSuggestion(type: string, evidence: string): string {
    switch (type) {
      case 'fake_api':
        return 'Replace with a real API endpoint or remove';
      case 'fake_method':
        return 'Check if this method exists in the API documentation';
      case 'fake_import':
        return 'Verify the package exists on npm';
      case 'fake_type':
        return 'Check if this type is defined';
      case 'invented_pattern':
        return 'Implement the actual functionality';
      default:
        return 'Verify this is not a hallucination';
    }
  }

  // ============================================================================
  // Private Methods - Metrics
  // ============================================================================

  private calculateMetrics(
    content: string,
    lines: string[],
    hallucinations: HallucinationCandidate[]
  ): CodeMetrics {
    const totalLines = lines.length;

    // Count lines of code (excluding comments and empty lines)
    let linesOfCode = 0;
    let comments = 0;
    let inMultilineComment = false;

    for (const line of lines) {
      const trimmed = line.trim();

      if (inMultilineComment) {
        comments++;
        if (trimmed.includes('*/')) {
          inMultilineComment = false;
        }
        continue;
      }

      if (trimmed.startsWith('/*')) {
        inMultilineComment = true;
        comments++;
        continue;
      }

      if (trimmed.startsWith('//') || trimmed === '') {
        if (trimmed.startsWith('//')) comments++;
        continue;
      }

      linesOfCode++;
    }

    const imports = (content.match(/import\s+/g) ?? []).length;
    const functions = (content.match(/(?:function\s+\w+|=>\s*{|=>\s*[^{])/g) ?? []).length;
    const types = (content.match(/(?:interface|type)\s+\w+/g) ?? []).length;
    const classes = (content.match(/class\s+\w+/g) ?? []).length;
    const complexity = this.calculateCyclomaticComplexity(content);

    // Calculate hallucination risk (0-1)
    const hallucinationRisk = Math.min(
      1,
      (hallucinations.length * 0.2) +
        (hallucinations.filter((h) => h.confidence > 0.8).length * 0.3)
    );

    return {
      lines: totalLines,
      linesOfCode,
      complexity,
      imports,
      functions,
      types,
      classes,
      comments,
      hallucinationRisk,
    };
  }

  private calculateCyclomaticComplexity(content: string): number {
    const decisionPoints = [
      /\bif\s*\(/g,
      /\belse\s+if\s*\(/g,
      /\bfor\s*\(/g,
      /\bwhile\s*\(/g,
      /\bdo\s*{/g,
      /\bswitch\s*\(/g,
      /\bcase\s+[^:]+:/g,
      /\bcatch\s*\(/g,
      /\?\?/g,
      /\|\|/g,
      /&&/g,
      /\?[^:]+:/g, // Ternary
    ];

    let complexity = 1; // Base complexity

    for (const pattern of decisionPoints) {
      complexity += (content.match(pattern) ?? []).length;
    }

    return complexity;
  }

  // ============================================================================
  // Private Methods - Utilities
  // ============================================================================

  private async loadPackageJson(): Promise<void> {
    const packageJsonPath =
      this.config.packageJsonPath ??
      path.join(this.config.projectRoot, 'package.json');

    try {
      const content = await fs.readFile(packageJsonPath, 'utf-8');
      this.packageJson = JSON.parse(content) as Record<string, unknown>;

      // Extract dependencies
      const deps = this.packageJson.dependencies as Record<string, string> | undefined;
      const devDeps = this.packageJson.devDependencies as Record<string, string> | undefined;
      const peerDeps = this.packageJson.peerDependencies as Record<string, string> | undefined;

      if (deps) {
        for (const dep of Object.keys(deps)) {
          this.dependencies.add(dep);
        }
      }
      if (devDeps) {
        for (const dep of Object.keys(devDeps)) {
          this.dependencies.add(dep);
        }
      }
      if (peerDeps) {
        for (const dep of Object.keys(peerDeps)) {
          this.dependencies.add(dep);
        }
      }
    } catch {
      this.logger.debug('Could not load package.json');
    }
  }

  private getLineNumber(content: string, index: number): number {
    return content.slice(0, index).split('\n').length;
  }

  private extractFunctionBody(content: string, startLine: number): string | null {
    const lines = content.split('\n');
    let braceCount = 0;
    let started = false;
    const body: string[] = [];

    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i];

      for (const char of line) {
        if (char === '{') {
          braceCount++;
          started = true;
        } else if (char === '}') {
          braceCount--;
        }
      }

      if (started) {
        body.push(line);
      }

      if (started && braceCount === 0) {
        break;
      }
    }

    return body.join('\n');
  }

  private toScreamingSnakeCase(str: string): string {
    return str
      .replace(/([a-z])([A-Z])/g, '$1_$2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
      .toUpperCase();
  }
}

// ============================================================================
// Export singleton helper
// ============================================================================

let globalValidator: CodeValidator | null = null;

export async function getCodeValidator(
  config?: Partial<ValidatorConfig>
): Promise<CodeValidator> {
  if (!globalValidator) {
    globalValidator = new CodeValidator(config);
    await globalValidator.initialize();
  }
  return globalValidator;
}
