/**
 * Post-Generation Hook
 * 
 * Runs after code generation to validate output and detect hallucinations.
 * Checks imports, conventions, security issues, and calculates hallucination score.
 * 
 * @module mcp-server/hooks/post-generation-hook
 * 
 * @example
 * ```ts
 * const hook = new PostGenerationHook();
 * const result = await hook.execute({
 *   generatedCode: 'import { foo } from "bar";\n...',
 *   targetFile: 'src/utils/helper.ts',
 *   originalTask: 'Create a utility function',
 * });
 * 
 * if (!result.approved) {
 *   console.log('Issues found:', result.issues);
 * }
 * ```
 */

/**
 * Context provided to the post-generation hook.
 */
export interface PostGenerationContext {
  /** The generated code to validate */
  generatedCode: string;
  /** The target file path */
  targetFile: string;
  /** The original task/prompt that generated the code */
  originalTask: string;
}

/**
 * Result returned by the post-generation hook.
 */
export interface PostGenerationResult {
  /** Whether the generated code is approved */
  approved: boolean;
  /** The (potentially modified) code */
  code: string;
  /** List of validation issues found */
  issues: ValidationIssue[];
  /** Hallucination score from 0 (none) to 1 (severe) */
  hallucinationScore: number;
  /** Suggestions for fixing issues */
  suggestions: string[];
}

/**
 * A validation issue found during post-generation checks.
 */
export interface ValidationIssue {
  /** Severity level of the issue */
  type: 'error' | 'warning' | 'info';
  /** Category of the issue */
  category: 'hallucination' | 'convention' | 'security' | 'style';
  /** Human-readable issue message */
  message: string;
  /** Line number where the issue occurs (if applicable) */
  line?: number;
  /** Suggested fix for the issue */
  suggestion?: string;
}

/**
 * Hook that runs after code generation.
 * Validates output and detects potential hallucinations.
 */
export class PostGenerationHook {
  /**
   * Execute post-generation validation on generated code.
   * Checks for hallucinations, validates imports, conventions, and security.
   * 
   * @param context - The post-generation context with code and metadata
   * @returns Validation result with approval status and issues
   */
  async execute(context: PostGenerationContext): Promise<PostGenerationResult> {
    // Validate input
    if (!context || typeof context.generatedCode !== 'string') {
      return {
        approved: false,
        code: context?.generatedCode ?? '',
        issues: [{ type: 'error', category: 'hallucination', message: 'Invalid context provided' }],
        hallucinationScore: 1,
        suggestions: ['Provide valid generated code'],
      };
    }
    const issues: ValidationIssue[] = [];
    const suggestions: string[] = [];

    // Check for hallucinations
    const hallucinationCheck = await this.checkHallucinations(context.generatedCode);
    issues.push(...hallucinationCheck.issues);

    // Validate imports
    const importCheck = await this.validateImports(context.generatedCode);
    issues.push(...importCheck.issues);

    // Check conventions
    const conventionCheck = await this.checkConventions(context.generatedCode);
    issues.push(...conventionCheck.issues);

    // Security scan
    const securityCheck = await this.securityScan(context.generatedCode);
    issues.push(...securityCheck.issues);

    // Calculate hallucination score
    const hallucinationScore = this.calculateHallucinationScore(issues);

    // Generate suggestions
    for (const issue of issues) {
      if (issue.suggestion) {
        suggestions.push(issue.suggestion);
      }
    }

    const errors = issues.filter(i => i.type === 'error');
    const approved = errors.length === 0 && hallucinationScore < 0.3;

    return {
      approved,
      code: context.generatedCode,
      issues,
      hallucinationScore,
      suggestions,
    };
  }

  /**
   * Check for potential hallucinations in generated code.
   * Looks for suspicious import patterns and unverified API calls.
   * 
   * @param code - The generated code to check
   * @returns Object containing any hallucination issues found
   */
  private async checkHallucinations(code: string): Promise<{ issues: ValidationIssue[] }> {
    const issues: ValidationIssue[] = [];

    // Check for suspicious import patterns
    const suspiciousImports = code.match(/import .* from ['"]@[^\/]+\/[^\/]+\/[^\/]+\/[^'"]+['"]/g);
    if (suspiciousImports) {
      for (const imp of suspiciousImports) {
        issues.push({
          type: 'warning',
          category: 'hallucination',
          message: `Suspicious deep import: ${imp}`,
          suggestion: 'Verify this package path exists',
        });
      }
    }

    // Check for invented-looking API calls
    const apiCalls = code.match(/fetch\(['"]\/api\/[^'"]+['"]\)/g);
    if (apiCalls) {
      for (const call of apiCalls) {
        issues.push({
          type: 'warning',
          category: 'hallucination',
          message: `Unverified API call: ${call}`,
          suggestion: 'Check truthpack/routes.json for valid endpoints',
        });
      }
    }

    return { issues };
  }

  /**
   * Validate imports against package.json dependencies.
   * Checks that all imported packages are installed.
   * 
   * @param code - The generated code to validate
   * @returns Object containing any import validation issues
   */
  private async validateImports(code: string): Promise<{ issues: ValidationIssue[] }> {
    const issues: ValidationIssue[] = [];
    const { loadConfig } = await import('@repo/shared-config');
    const config = loadConfig();
    const projectRoot = config.VIBECHECK_PROJECT_ROOT || process.cwd();
    const { readFile } = await import('fs/promises');

    // Load package.json to check dependencies
    let deps: Record<string, string> = {};
    try {
      const pkgContent = await readFile(`${projectRoot}/package.json`, 'utf-8');
      const pkg = JSON.parse(pkgContent);
      deps = {
        ...(pkg.dependencies || {}),
        ...(pkg.devDependencies || {}),
      };
    } catch {
      // Package.json may not exist
    }

    // Node.js builtins
    const nodeBuiltins = new Set([
      'fs', 'path', 'os', 'crypto', 'http', 'https', 'url', 'util',
      'stream', 'events', 'buffer', 'child_process', 'cluster', 'net',
      'dns', 'tls', 'zlib', 'readline', 'assert', 'fs/promises',
    ]);

    // Find imports
    const importPattern = /import\s+(?:{[^}]*}|\*\s+as\s+\w+|\w+)\s+from\s+['"]([^'"]+)['"]/g;
    
    let match;
    while ((match = importPattern.exec(code)) !== null) {
      const importPath = match[1];
      
      // Skip relative imports
      if (importPath.startsWith('.') || importPath.startsWith('/')) {
        continue;
      }

      // Skip node: protocol
      if (importPath.startsWith('node:')) {
        continue;
      }

      // Get package name
      const packageName = importPath.startsWith('@')
        ? importPath.split('/').slice(0, 2).join('/')
        : importPath.split('/')[0];

      // Check if it's a builtin or installed package
      const isBuiltin = nodeBuiltins.has(packageName);
      const isInstalled = packageName in deps;

      if (!isBuiltin && !isInstalled) {
        // Find line number
        const beforeMatch = code.slice(0, match.index);
        const lineNumber = beforeMatch.split('\n').length;

        issues.push({
          type: 'error',
          category: 'hallucination',
          message: `Import "${packageName}" not found in package.json`,
          line: lineNumber,
          suggestion: `Run: pnpm add ${packageName}`,
        });
      }
    }

    return { issues };
  }

  /**
   * Check code against project conventions.
   * Validates naming, export style, and other conventions.
   * 
   * @param code - The generated code to check
   * @returns Object containing any convention issues found
   */
  private async checkConventions(code: string): Promise<{ issues: ValidationIssue[] }> {
    const issues: ValidationIssue[] = [];

    // Check for default exports
    if (code.includes('export default')) {
      issues.push({
        type: 'warning',
        category: 'convention',
        message: 'Uses default export instead of named export',
        suggestion: 'Use named exports for better traceability',
      });
    }

    // Check for any type
    if (/:\s*any\b/.test(code)) {
      issues.push({
        type: 'warning',
        category: 'convention',
        message: 'Uses any type',
        suggestion: 'Use specific types or unknown instead of any',
      });
    }

    // Check for console.log
    if (code.includes('console.log')) {
      issues.push({
        type: 'info',
        category: 'convention',
        message: 'Contains console.log statement',
        suggestion: 'Remove or replace with proper logging',
      });
    }

    return { issues };
  }

  /**
   * Scan code for security issues.
   * Checks for eval, innerHTML, hardcoded credentials, etc.
   * 
   * @param code - The generated code to scan
   * @returns Object containing any security issues found
   */
  private async securityScan(code: string): Promise<{ issues: ValidationIssue[] }> {
    const issues: ValidationIssue[] = [];

    // Check for eval
    if (code.includes('eval(')) {
      issues.push({
        type: 'error',
        category: 'security',
        message: 'Uses eval() which can execute arbitrary code',
        suggestion: 'Remove eval and use safer alternatives',
      });
    }

    // Check for innerHTML
    if (code.includes('.innerHTML')) {
      issues.push({
        type: 'warning',
        category: 'security',
        message: 'Uses innerHTML which can lead to XSS',
        suggestion: 'Use textContent or sanitize input',
      });
    }

    // Check for hardcoded credentials
    if (/(?:password|secret|key)\s*[:=]\s*['"][^'"]+['"]/i.test(code)) {
      issues.push({
        type: 'error',
        category: 'security',
        message: 'Potential hardcoded credentials detected',
        suggestion: 'Use environment variables for sensitive values',
      });
    }

    return { issues };
  }

  /**
   * Calculate the hallucination score based on issues found.
   * Score ranges from 0 (no hallucinations) to 1 (severe).
   * 
   * @param issues - The validation issues to score
   * @returns Hallucination score between 0 and 1
   */
  private calculateHallucinationScore(issues: ValidationIssue[]): number {
    const hallucinationIssues = issues.filter(i => i.category === 'hallucination');
    const errors = hallucinationIssues.filter(i => i.type === 'error').length;
    const warnings = hallucinationIssues.filter(i => i.type === 'warning').length;
    
    return Math.min(1, (errors * 0.3) + (warnings * 0.1));
  }
}
