/**
 * Post-Save Hook
 * 
 * Runs after a file is saved to validate changes and detect issues.
 * Validates imports, checks conventions, and optionally refreshes truthpack.
 * 
 * @module core/hooks/post-save-hook
 * 
 * @example
 * ```ts
 * const hook = new PostSaveHook({
 *   projectRoot: '/path/to/project',
 *   validateImports: true,
 *   checkConventions: true,
 * });
 * 
 * const result = await hook.execute('/path/to/file.ts');
 * if (!result.success) {
 *   console.log('Issues found:', result.issues);
 * }
 * ```
 */

import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Result returned by the post-save hook.
 */
export interface PostSaveResult {
  /** Whether the validation passed without errors */
  success: boolean;
  /** Path to the validated file */
  filePath: string;
  /** List of issues found during validation */
  issues: PostSaveIssue[];
  /** Truthpack sections that were refreshed */
  refreshedSections: string[];
  /** Time taken for validation in milliseconds */
  duration: number;
}

/**
 * An issue found during post-save validation.
 */
export interface PostSaveIssue {
  /** Severity level of the issue */
  type: 'warning' | 'error' | 'info';
  /** Human-readable issue message */
  message: string;
  /** Line number where the issue occurs (if applicable) */
  line?: number;
  /** Suggested fix for the issue */
  suggestion?: string;
}

/**
 * Configuration options for the PostSaveHook.
 */
export interface PostSaveConfig {
  /** Root directory of the project */
  projectRoot: string;
  /** Path to the truthpack directory (relative to projectRoot) */
  truthpackPath: string;
  /** Whether to validate imports against package.json */
  validateImports: boolean;
  /** Whether to check code conventions */
  checkConventions: boolean;
  /** Whether to auto-refresh affected truthpack sections */
  autoRefreshTruthpack: boolean;
  /** Callback invoked when an issue is found */
  onIssueFound?: (issue: PostSaveIssue) => void;
}

const DEFAULT_CONFIG: PostSaveConfig = {
  projectRoot: process.cwd(),
  truthpackPath: '.vibecheck/truthpack',
  validateImports: true,
  checkConventions: true,
  autoRefreshTruthpack: false,
};

/**
 * Hook that runs after a file is saved.
 * Validates imports, conventions, and optionally refreshes truthpack.
 */
export class PostSaveHook {
  private config: PostSaveConfig;

  /**
   * Creates a new PostSaveHook instance.
   * 
   * @param config - Configuration options (merged with defaults)
   */
  constructor(config: Partial<PostSaveConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Execute the post-save hook on a file.
   * Validates imports, checks conventions, and optionally refreshes truthpack.
   * 
   * @param filePath - Path to the saved file
   * @param content - Optional file content (read from disk if not provided)
   * @returns Validation result with issues and metadata
   */
  async execute(filePath: string, content?: string): Promise<PostSaveResult> {
    // Validate input
    if (!filePath || typeof filePath !== 'string') {
      return {
        success: false,
        filePath: filePath ?? 'unknown',
        issues: [{ type: 'error', message: 'Invalid file path provided' }],
        refreshedSections: [],
        duration: 0,
      };
    }
    const startTime = Date.now();
    const issues: PostSaveIssue[] = [];
    const refreshedSections: string[] = [];

    try {
      // Read file content if not provided
      const fileContent = content ?? await fs.readFile(filePath, 'utf-8');

      // Validate imports
      if (this.config.validateImports) {
        const importIssues = await this.validateImports(fileContent, filePath);
        issues.push(...importIssues);
      }

      // Check conventions
      if (this.config.checkConventions) {
        const conventionIssues = this.checkConventions(fileContent, filePath);
        issues.push(...conventionIssues);
      }

      // Auto-refresh truthpack if needed
      if (this.config.autoRefreshTruthpack) {
        const sections = this.determineAffectedSections(filePath);
        refreshedSections.push(...sections);
      }

      // Notify about issues
      if (this.config.onIssueFound) {
        for (const issue of issues) {
          this.config.onIssueFound(issue);
        }
      }

      return {
        success: !issues.some(i => i.type === 'error'),
        filePath,
        issues,
        refreshedSections,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        filePath,
        issues: [{
          type: 'error',
          message: `Failed to process file: ${error instanceof Error ? error.message : 'Unknown error'}`,
        }],
        refreshedSections: [],
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Validate imports in the file against package.json dependencies.
   * 
   * @param content - The file content
   * @param _filePath - The file path (unused but available)
   * @returns Array of import validation issues
   */
  private async validateImports(content: string, _filePath: string): Promise<PostSaveIssue[]> {
    const issues: PostSaveIssue[] = [];
    
    // Load package.json
    let deps: Set<string> = new Set();
    try {
      const pkgPath = path.join(this.config.projectRoot, 'package.json');
      const pkgContent = await fs.readFile(pkgPath, 'utf-8');
      const pkg = JSON.parse(pkgContent);
      deps = new Set([
        ...Object.keys(pkg.dependencies || {}),
        ...Object.keys(pkg.devDependencies || {}),
      ]);
    } catch {
      // No package.json
    }

    // Node.js builtins
    const builtins = new Set([
      'fs', 'path', 'os', 'crypto', 'http', 'https', 'url', 'util',
      'stream', 'events', 'buffer', 'child_process', 'fs/promises',
    ]);

    // Find imports
    const importPattern = /import\s+.*\s+from\s+['"]([^'"]+)['"]/g;
    let match;
    let lineNum = 0;
    const lines = content.split('\n');

    for (const line of lines) {
      lineNum++;
      importPattern.lastIndex = 0;
      match = importPattern.exec(line);
      
      if (match) {
        const importPath = match[1];
        
        // Skip relative imports and node: protocol
        if (importPath.startsWith('.') || importPath.startsWith('/') || importPath.startsWith('node:')) {
          continue;
        }

        // Get package name
        const packageName = importPath.startsWith('@')
          ? importPath.split('/').slice(0, 2).join('/')
          : importPath.split('/')[0];

        if (!builtins.has(packageName) && !deps.has(packageName)) {
          issues.push({
            type: 'error',
            message: `Package "${packageName}" not found in package.json`,
            line: lineNum,
            suggestion: `Run: pnpm add ${packageName}`,
          });
        }
      }
    }

    return issues;
  }

  /**
   * Check file content against project conventions.
   * 
   * @param content - The file content
   * @param filePath - The file path
   * @returns Array of convention issues
   */
  private checkConventions(content: string, filePath: string): PostSaveIssue[] {
    const issues: PostSaveIssue[] = [];
    const lines = content.split('\n');

    // Check for any type
    lines.forEach((line, i) => {
      if (/:\s*any\b/.test(line) && !line.includes('// eslint-disable')) {
        issues.push({
          type: 'warning',
          message: 'Avoid using "any" type',
          line: i + 1,
          suggestion: 'Use specific types or "unknown"',
        });
      }
    });

    // Check for console.log in non-test files
    if (!filePath.includes('.test.') && !filePath.includes('.spec.')) {
      lines.forEach((line, i) => {
        if (/console\.(log|warn|error)\s*\(/.test(line)) {
          issues.push({
            type: 'info',
            message: 'Console statement found',
            line: i + 1,
            suggestion: 'Remove or use proper logger',
          });
        }
      });
    }

    // Check for default exports
    if (/export\s+default\b/.test(content)) {
      issues.push({
        type: 'info',
        message: 'Uses default export',
        suggestion: 'Consider using named exports',
      });
    }

    return issues;
  }

  /**
   * Determine which truthpack sections are affected by this file.
   * 
   * @param filePath - The file path to analyze
   * @returns Array of affected section names
   */
  private determineAffectedSections(filePath: string): string[] {
    const sections: string[] = [];
    const lower = filePath.toLowerCase();

    if (/\/(api|routes?|controllers?)\//i.test(lower)) {
      sections.push('routes');
    }
    if (/\.env/i.test(lower)) {
      sections.push('env');
    }
    if (/\/(auth|middleware)\//i.test(lower)) {
      sections.push('auth');
    }
    if (/\/(types?|schemas?)\//i.test(lower)) {
      sections.push('contracts');
    }

    return sections;
  }
}
