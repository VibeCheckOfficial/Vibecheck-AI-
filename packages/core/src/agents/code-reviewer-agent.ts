/**
 * Code Reviewer Agent
 * 
 * Reviews code changes for quality, correctness, and hallucination issues.
 * Provides actionable feedback and suggestions.
 */

export interface ReviewResult {
  approved: boolean;
  score: number;
  issues: ReviewIssue[];
  suggestions: ReviewSuggestion[];
  summary: string;
}

export interface ReviewIssue {
  severity: 'error' | 'warning' | 'info';
  category: 'hallucination' | 'quality' | 'correctness' | 'style' | 'security';
  message: string;
  file?: string;
  line?: number;
  code?: string;
}

export interface ReviewSuggestion {
  type: 'improve' | 'refactor' | 'fix' | 'consider';
  description: string;
  file?: string;
  before?: string;
  after?: string;
}

export interface ReviewConfig {
  strictness: 'lenient' | 'moderate' | 'strict';
  focusAreas: ('hallucination' | 'quality' | 'correctness' | 'style' | 'security')[];
  maxIssuesBeforeReject: number;
}

const DEFAULT_CONFIG: ReviewConfig = {
  strictness: 'moderate',
  focusAreas: ['hallucination', 'quality', 'correctness', 'security'],
  maxIssuesBeforeReject: 5,
};

export class CodeReviewerAgent {
  private config: ReviewConfig;

  constructor(config: Partial<ReviewConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Review code changes
   */
  async review(
    code: string,
    context: {
      filePath: string;
      originalCode?: string;
      intent?: string;
      truthpack?: Record<string, unknown>;
    }
  ): Promise<ReviewResult> {
    const issues: ReviewIssue[] = [];
    const suggestions: ReviewSuggestion[] = [];

    // Run all checks based on focus areas
    if (this.config.focusAreas.includes('hallucination')) {
      const hallucinationIssues = this.checkForHallucinations(code, context);
      issues.push(...hallucinationIssues);
    }

    if (this.config.focusAreas.includes('quality')) {
      const qualityIssues = this.checkQuality(code, context);
      issues.push(...qualityIssues.issues);
      suggestions.push(...qualityIssues.suggestions);
    }

    if (this.config.focusAreas.includes('correctness')) {
      const correctnessIssues = this.checkCorrectness(code, context);
      issues.push(...correctnessIssues);
    }

    if (this.config.focusAreas.includes('style')) {
      const styleIssues = this.checkStyle(code);
      issues.push(...styleIssues.issues);
      suggestions.push(...styleIssues.suggestions);
    }

    if (this.config.focusAreas.includes('security')) {
      const securityIssues = this.checkSecurity(code);
      issues.push(...securityIssues);
    }

    // Calculate score
    const score = this.calculateScore(issues);

    // Determine approval
    const errorCount = issues.filter(i => i.severity === 'error').length;
    const approved = errorCount === 0 && 
      issues.length <= this.config.maxIssuesBeforeReject;

    // Generate summary
    const summary = this.generateSummary(issues, suggestions, approved);

    return {
      approved,
      score,
      issues,
      suggestions,
      summary,
    };
  }

  /**
   * Check for hallucination indicators
   */
  private checkForHallucinations(
    code: string,
    context: { filePath: string; truthpack?: Record<string, unknown> }
  ): ReviewIssue[] {
    const issues: ReviewIssue[] = [];

    // Check for suspicious import patterns
    const importPattern = /import\s+.*\s+from\s+['"]([^'"]+)['"]/g;
    let match;
    
    while ((match = importPattern.exec(code)) !== null) {
      const importPath = match[1];
      
      // Check for overly deep paths (potential hallucination)
      if (importPath.split('/').length > 5 && importPath.startsWith('@')) {
        issues.push({
          severity: 'warning',
          category: 'hallucination',
          message: `Suspiciously deep import path: "${importPath}" - verify this exists`,
          file: context.filePath,
          code: match[0],
        });
      }
    }

    // Check for API endpoints against truthpack
    if (context.truthpack?.routes) {
      const routePattern = /fetch\s*\(\s*['"`]([^'"`]+)['"`]/g;
      
      while ((match = routePattern.exec(code)) !== null) {
        const endpoint = match[1];
        
        // Skip external URLs
        if (endpoint.startsWith('http')) continue;
        
        const routes = context.truthpack.routes as Array<{ path: string }>;
        const exists = routes.some(r => 
          endpoint.includes(r.path) || r.path.includes(endpoint.replace(/\/:\w+/g, ''))
        );
        
        if (!exists) {
          issues.push({
            severity: 'error',
            category: 'hallucination',
            message: `API endpoint "${endpoint}" not found in truthpack routes`,
            file: context.filePath,
            code: match[0],
          });
        }
      }
    }

    // Check for invented types
    const typePattern = /:\s*([A-Z][a-zA-Z0-9]+)(?:\s*[<|,;)\]\}])/g;
    const commonTypes = new Set([
      'String', 'Number', 'Boolean', 'Object', 'Array', 'Promise',
      'React', 'Component', 'Props', 'State', 'Error', 'Date',
      'Map', 'Set', 'Record', 'Partial', 'Required', 'Readonly',
      'Pick', 'Omit', 'Exclude', 'Extract', 'NonNullable',
      'HTMLElement', 'Event', 'MouseEvent', 'KeyboardEvent',
    ]);
    
    while ((match = typePattern.exec(code)) !== null) {
      const typeName = match[1];
      
      if (!commonTypes.has(typeName) && !code.includes(`interface ${typeName}`) && !code.includes(`type ${typeName}`)) {
        issues.push({
          severity: 'info',
          category: 'hallucination',
          message: `Type "${typeName}" may need to be imported or defined`,
          file: context.filePath,
        });
      }
    }

    return issues;
  }

  /**
   * Check code quality
   */
  private checkQuality(
    code: string,
    context: { filePath: string }
  ): { issues: ReviewIssue[]; suggestions: ReviewSuggestion[] } {
    const issues: ReviewIssue[] = [];
    const suggestions: ReviewSuggestion[] = [];

    // Check for console.log
    if (/console\.(log|warn|error)\s*\(/.test(code) && !context.filePath.includes('test')) {
      issues.push({
        severity: 'warning',
        category: 'quality',
        message: 'Console statement found - remove before production',
        file: context.filePath,
      });
    }

    // Check for TODO/FIXME
    const todoMatch = code.match(/\/\/\s*(TODO|FIXME|HACK|XXX):/i);
    if (todoMatch) {
      issues.push({
        severity: 'info',
        category: 'quality',
        message: `Found ${todoMatch[1]} comment - consider addressing`,
        file: context.filePath,
      });
    }

    // Check function length
    const functionPattern = /(function\s+\w+|const\s+\w+\s*=\s*(?:async\s+)?(?:\([^)]*\)|[^=]+)\s*=>)\s*\{/g;
    let funcMatch;
    
    while ((funcMatch = functionPattern.exec(code)) !== null) {
      const startIndex = funcMatch.index;
      let braceCount = 1;
      let i = startIndex + funcMatch[0].length;
      
      while (i < code.length && braceCount > 0) {
        if (code[i] === '{') braceCount++;
        if (code[i] === '}') braceCount--;
        i++;
      }
      
      const funcCode = code.slice(startIndex, i);
      const lines = funcCode.split('\n').length;
      
      if (lines > 50) {
        suggestions.push({
          type: 'refactor',
          description: `Function is ${lines} lines long - consider breaking into smaller functions`,
          file: context.filePath,
        });
      }
    }

    // Check for deeply nested code
    const maxIndent = code.split('\n').reduce((max, line) => {
      const indent = line.match(/^(\s*)/)?.[1].length || 0;
      return Math.max(max, indent);
    }, 0);
    
    if (maxIndent > 24) { // More than 6 levels (4 spaces each)
      suggestions.push({
        type: 'refactor',
        description: 'Deep nesting detected - consider extracting logic or using early returns',
        file: context.filePath,
      });
    }

    return { issues, suggestions };
  }

  /**
   * Check correctness
   */
  private checkCorrectness(
    code: string,
    context: { filePath: string; originalCode?: string }
  ): ReviewIssue[] {
    const issues: ReviewIssue[] = [];

    // Check for potential null/undefined issues
    if (/\.\w+\s*\?\./.test(code) === false && /\w+\.\w+\.\w+/.test(code)) {
      // Has deep property access without optional chaining
      issues.push({
        severity: 'warning',
        category: 'correctness',
        message: 'Deep property access without optional chaining - may cause runtime errors',
        file: context.filePath,
      });
    }

    // Check for async/await issues
    if (/async/.test(code) && !/await/.test(code)) {
      issues.push({
        severity: 'info',
        category: 'correctness',
        message: 'Async function without await - verify this is intentional',
        file: context.filePath,
      });
    }

    // Check for unhandled promise rejections
    if (/\.then\s*\(/.test(code) && !/\.catch\s*\(/.test(code) && !/await/.test(code)) {
      issues.push({
        severity: 'warning',
        category: 'correctness',
        message: 'Promise without error handling (.catch or try/catch)',
        file: context.filePath,
      });
    }

    return issues;
  }

  /**
   * Check code style
   */
  private checkStyle(code: string): { issues: ReviewIssue[]; suggestions: ReviewSuggestion[] } {
    const issues: ReviewIssue[] = [];
    const suggestions: ReviewSuggestion[] = [];

    // Check for any type
    if (/:\s*any\b/.test(code)) {
      issues.push({
        severity: 'warning',
        category: 'style',
        message: 'Using "any" type - use specific types or "unknown"',
      });
    }

    // Check for default exports
    if (/export\s+default\b/.test(code)) {
      suggestions.push({
        type: 'consider',
        description: 'Consider using named exports for better refactoring support',
      });
    }

    // Check for var usage
    if (/\bvar\s+/.test(code)) {
      issues.push({
        severity: 'warning',
        category: 'style',
        message: 'Using "var" - prefer "const" or "let"',
      });
    }

    return { issues, suggestions };
  }

  /**
   * Check for security issues
   */
  private checkSecurity(code: string): ReviewIssue[] {
    const issues: ReviewIssue[] = [];

    // Check for eval
    if (/\beval\s*\(/.test(code)) {
      issues.push({
        severity: 'error',
        category: 'security',
        message: 'eval() is dangerous and should be avoided',
      });
    }

    // Check for innerHTML
    if (/\.innerHTML\s*=/.test(code)) {
      issues.push({
        severity: 'warning',
        category: 'security',
        message: 'innerHTML can lead to XSS - use textContent or sanitize input',
      });
    }

    // Check for hardcoded secrets
    if (/(?:password|secret|api_key|apikey)\s*[:=]\s*['"][^'"]{8,}['"]/i.test(code)) {
      issues.push({
        severity: 'error',
        category: 'security',
        message: 'Potential hardcoded secret detected - use environment variables',
      });
    }

    // Check for SQL injection risk
    if (/`SELECT.*\$\{/.test(code) || /`INSERT.*\$\{/.test(code)) {
      issues.push({
        severity: 'error',
        category: 'security',
        message: 'SQL query with interpolation - potential SQL injection risk',
      });
    }

    return issues;
  }

  /**
   * Calculate review score
   */
  private calculateScore(issues: ReviewIssue[]): number {
    let score = 100;

    for (const issue of issues) {
      switch (issue.severity) {
        case 'error':
          score -= 20;
          break;
        case 'warning':
          score -= 10;
          break;
        case 'info':
          score -= 2;
          break;
      }
    }

    return Math.max(0, score);
  }

  /**
   * Generate review summary
   */
  private generateSummary(
    issues: ReviewIssue[],
    suggestions: ReviewSuggestion[],
    approved: boolean
  ): string {
    const errors = issues.filter(i => i.severity === 'error').length;
    const warnings = issues.filter(i => i.severity === 'warning').length;
    const infos = issues.filter(i => i.severity === 'info').length;

    let summary = approved ? '✅ Code review passed' : '❌ Code review failed';
    summary += ` (${errors} errors, ${warnings} warnings, ${infos} info)`;

    if (!approved && errors > 0) {
      summary += '\n\nCritical issues must be addressed before approval.';
    }

    if (suggestions.length > 0) {
      summary += `\n\n${suggestions.length} suggestion(s) for improvement.`;
    }

    return summary;
  }
}
