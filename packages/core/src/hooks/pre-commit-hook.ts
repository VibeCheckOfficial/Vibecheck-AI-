/**
 * Pre-Commit Hook
 * 
 * Runs before a git commit to validate staged changes.
 * Checks for hallucinations, security issues, and convention violations.
 * 
 * @module core/hooks/pre-commit-hook
 * 
 * @example
 * ```ts
 * const hook = new PreCommitHook({
 *   projectRoot: '/path/to/project',
 *   checkHallucinations: true,
 *   checkSecurity: true,
 * });
 * 
 * const result = await hook.execute();
 * if (!result.passed) {
 *   console.log('Pre-commit failed:', result.summary);
 *   process.exit(1);
 * }
 * ```
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Result returned by the pre-commit hook.
 */
export interface PreCommitResult {
  /** Whether the commit should proceed */
  passed: boolean;
  /** List of issues found in staged files */
  issues: PreCommitIssue[];
  /** List of staged file paths */
  stagedFiles: string[];
  /** Human-readable summary of the check */
  summary: string;
  /** Time taken for validation in milliseconds */
  duration: number;
}

/**
 * An issue found during pre-commit validation.
 */
export interface PreCommitIssue {
  /** Severity level of the issue */
  severity: 'error' | 'warning' | 'info';
  /** Category of the issue */
  category: 'hallucination' | 'security' | 'quality' | 'convention';
  /** Human-readable issue message */
  message: string;
  /** File where the issue was found */
  file?: string;
  /** Line number where the issue occurs */
  line?: number;
}

/**
 * Configuration options for the PreCommitHook.
 */
export interface PreCommitConfig {
  /** Root directory of the project */
  projectRoot: string;
  /** Path to the truthpack directory (relative to projectRoot) */
  truthpackPath: string;
  /** Whether to check for hallucinations */
  checkHallucinations: boolean;
  /** Whether to check for security issues */
  checkSecurity: boolean;
  /** Whether to check conventions */
  checkConventions: boolean;
  /** Whether to block commit on errors */
  blockOnError: boolean;
  /** Whether to block commit on warnings */
  blockOnWarning: boolean;
}

const DEFAULT_CONFIG: PreCommitConfig = {
  projectRoot: process.cwd(),
  truthpackPath: '.vibecheck/truthpack',
  checkHallucinations: true,
  checkSecurity: true,
  checkConventions: true,
  blockOnError: true,
  blockOnWarning: false,
};

/**
 * Hook that runs before a git commit.
 * Validates staged changes for hallucinations, security, and conventions.
 */
export class PreCommitHook {
  private config: PreCommitConfig;

  /**
   * Creates a new PreCommitHook instance.
   * 
   * @param config - Configuration options (merged with defaults)
   */
  constructor(config: Partial<PreCommitConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Execute the pre-commit hook.
   * Gets staged files and validates each one.
   * 
   * @returns Validation result with issues and whether to proceed
   */
  async execute(): Promise<PreCommitResult> {
    const startTime = Date.now();
    const issues: PreCommitIssue[] = [];

    // Get staged files
    const stagedFiles = await this.getStagedFiles();
    
    if (stagedFiles.length === 0) {
      return {
        passed: true,
        issues: [],
        stagedFiles: [],
        summary: 'No staged files to check',
        duration: Date.now() - startTime,
      };
    }

    // Check each staged file
    for (const file of stagedFiles) {
      // Skip non-code files
      if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(file)) {
        continue;
      }

      try {
        const content = await this.getStagedContent(file);
        
        if (this.config.checkHallucinations) {
          const hallucinationIssues = await this.checkHallucinations(content, file);
          issues.push(...hallucinationIssues);
        }

        if (this.config.checkSecurity) {
          const securityIssues = this.checkSecurity(content, file);
          issues.push(...securityIssues);
        }

        if (this.config.checkConventions) {
          const conventionIssues = this.checkConventions(content, file);
          issues.push(...conventionIssues);
        }
      } catch (error) {
        issues.push({
          severity: 'error',
          category: 'quality',
          message: `Failed to check ${file}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          file,
        });
      }
    }

    // Determine if commit should be blocked
    const errorCount = issues.filter(i => i.severity === 'error').length;
    const warningCount = issues.filter(i => i.severity === 'warning').length;
    
    const passed = !(
      (this.config.blockOnError && errorCount > 0) ||
      (this.config.blockOnWarning && warningCount > 0)
    );

    // Generate summary
    const summary = this.generateSummary(issues, passed, stagedFiles.length);

    return {
      passed,
      issues,
      stagedFiles,
      summary,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Get list of staged files from git.
   * 
   * @returns Array of staged file paths
   */
  private async getStagedFiles(): Promise<string[]> {
    try {
      const { stdout } = await execAsync('git diff --cached --name-only --diff-filter=ACMR', {
        cwd: this.config.projectRoot,
      });
      return stdout.trim().split('\n').filter(f => f.length > 0);
    } catch {
      return [];
    }
  }

  /**
   * Get the staged content of a file from git.
   * Falls back to reading from disk if git fails.
   * 
   * @param file - The file path to read
   * @returns The staged content of the file
   */
  private async getStagedContent(file: string): Promise<string> {
    try {
      const { stdout } = await execAsync(`git show :${file}`, {
        cwd: this.config.projectRoot,
        maxBuffer: 10 * 1024 * 1024, // 10MB
      });
      return stdout;
    } catch {
      // Fall back to reading file directly
      const filePath = path.join(this.config.projectRoot, file);
      return fs.readFile(filePath, 'utf-8');
    }
  }

  /**
   * Check for potential hallucinations in file content.
   * Checks for suspicious imports and unverified API endpoints.
   * 
   * @param content - The file content to check
   * @param file - The file path
   * @returns Array of hallucination issues found
   */
  private async checkHallucinations(content: string, file: string): Promise<PreCommitIssue[]> {
    const issues: PreCommitIssue[] = [];

    // Check for suspicious deep imports
    const importPattern = /import\s+.*\s+from\s+['"](@[^'"]+\/[^'"]+\/[^'"]+\/[^'"]+)['"]/g;
    let match;
    
    while ((match = importPattern.exec(content)) !== null) {
      issues.push({
        severity: 'warning',
        category: 'hallucination',
        message: `Suspiciously deep import path: "${match[1]}"`,
        file,
      });
    }

    // Check for API endpoints that might not exist
    const truthpackPath = path.join(this.config.projectRoot, this.config.truthpackPath, 'routes.json');
    
    try {
      const routesContent = await fs.readFile(truthpackPath, 'utf-8');
      const routes = JSON.parse(routesContent);
      const routePaths = new Set((routes.routes || []).map((r: { path: string }) => r.path));

      const fetchPattern = /fetch\s*\(\s*['"`]\/api\/([^'"`]+)['"`]/g;
      while ((match = fetchPattern.exec(content)) !== null) {
        const endpoint = `/api/${match[1]}`;
        
        // Check if route exists (simplified check)
        const exists = Array.from(routePaths).some((p: unknown) => 
          (p as string).startsWith('/api/') && 
          endpoint.includes((p as string).replace(/:\w+/g, ''))
        );
        
        if (!exists && routePaths.size > 0) {
          issues.push({
            severity: 'warning',
            category: 'hallucination',
            message: `API endpoint "${endpoint}" not found in truthpack`,
            file,
          });
        }
      }
    } catch {
      // Truthpack doesn't exist
    }

    return issues;
  }

  /**
   * Check for security issues in file content.
   * Checks for eval, hardcoded secrets, SQL injection patterns.
   * 
   * @param content - The file content to check
   * @param file - The file path
   * @returns Array of security issues found
   */
  private checkSecurity(content: string, file: string): PreCommitIssue[] {
    const issues: PreCommitIssue[] = [];

    // Check for eval
    if (/\beval\s*\(/.test(content)) {
      issues.push({
        severity: 'error',
        category: 'security',
        message: 'eval() is dangerous',
        file,
      });
    }

    // Check for hardcoded secrets
    if (/(?:password|secret|api_key|apikey|token)\s*[:=]\s*['"][^'"]{8,}['"]/i.test(content)) {
      issues.push({
        severity: 'error',
        category: 'security',
        message: 'Potential hardcoded secret',
        file,
      });
    }

    // Check for SQL injection
    if (/`(?:SELECT|INSERT|UPDATE|DELETE).*\$\{/i.test(content)) {
      issues.push({
        severity: 'error',
        category: 'security',
        message: 'Potential SQL injection',
        file,
      });
    }

    return issues;
  }

  /**
   * Check coding conventions in file content.
   * Checks for any type usage and console statements.
   * 
   * @param content - The file content to check
   * @param file - The file path
   * @returns Array of convention issues found
   */
  private checkConventions(content: string, file: string): PreCommitIssue[] {
    const issues: PreCommitIssue[] = [];

    // Check for any type
    if (/:\s*any\b/.test(content)) {
      issues.push({
        severity: 'warning',
        category: 'convention',
        message: 'Uses "any" type',
        file,
      });
    }

    // Check for console.log (non-test files)
    if (!file.includes('.test.') && !file.includes('.spec.')) {
      if (/console\.(log|warn)\s*\(/.test(content)) {
        issues.push({
          severity: 'info',
          category: 'convention',
          message: 'Contains console statement',
          file,
        });
      }
    }

    return issues;
  }

  /**
   * Generate a human-readable summary of the validation.
   * 
   * @param issues - The issues found during validation
   * @param passed - Whether the validation passed
   * @param fileCount - Number of files checked
   * @returns Formatted summary string
   */
  private generateSummary(
    issues: PreCommitIssue[],
    passed: boolean,
    fileCount: number
  ): string {
    const errors = issues.filter(i => i.severity === 'error').length;
    const warnings = issues.filter(i => i.severity === 'warning').length;
    const infos = issues.filter(i => i.severity === 'info').length;

    let summary = passed 
      ? `✅ Pre-commit check passed (${fileCount} files)`
      : `❌ Pre-commit check failed (${fileCount} files)`;

    if (issues.length > 0) {
      summary += `\n${errors} error(s), ${warnings} warning(s), ${infos} info`;
    }

    if (!passed) {
      summary += '\n\nFix errors before committing.';
    }

    return summary;
  }
}
