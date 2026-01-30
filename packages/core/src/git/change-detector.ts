/**
 * Git Change Detector
 * 
 * Detects changed files using Git for incremental analysis.
 * Supports pre-commit hooks and CI/PR contexts.
 */

import { execSync, spawn } from 'node:child_process';
import path from 'node:path';

export interface ChangeDetectorOptions {
  /** Base directory for git operations */
  cwd: string;
  /** Default branch for comparison */
  defaultBranch: string;
  /** File extensions to include */
  includeExtensions?: string[];
  /** Paths to exclude */
  excludePaths?: string[];
}

export interface ChangedFile {
  /** Absolute file path */
  path: string;
  /** Relative path from repo root */
  relativePath: string;
  /** Change status */
  status: 'added' | 'modified' | 'renamed' | 'copied' | 'deleted';
  /** Old path (for renamed files) */
  oldPath?: string;
}

export interface ChangeDetectionResult {
  /** Changed files */
  files: ChangedFile[];
  /** Whether this is an incremental scan */
  incremental: boolean;
  /** Reference used for comparison */
  reference: string;
  /** Total files in scope */
  totalFiles: number;
}

/**
 * Git Change Detector
 * 
 * Detects changed files for incremental analysis using:
 * - Pre-commit: staged files
 * - CI/PR: files changed from base branch
 * - Manual: files changed from specified ref
 */
export class GitChangeDetector {
  private options: ChangeDetectorOptions;

  constructor(options: Partial<ChangeDetectorOptions> = {}) {
    this.options = {
      cwd: options.cwd ?? process.cwd(),
      defaultBranch: options.defaultBranch ?? 'main',
      includeExtensions: options.includeExtensions,
      excludePaths: options.excludePaths ?? ['node_modules', 'dist', 'build', '.git'],
    };
  }

  /**
   * Check if current directory is a git repository
   */
  isGitRepo(): boolean {
    try {
      execSync('git rev-parse --is-inside-work-tree', {
        cwd: this.options.cwd,
        stdio: 'pipe',
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the git repository root
   */
  getRepoRoot(): string | null {
    try {
      const root = execSync('git rev-parse --show-toplevel', {
        cwd: this.options.cwd,
        encoding: 'utf-8',
      }).trim();
      return root;
    } catch {
      return null;
    }
  }

  /**
   * Get staged files (for pre-commit hooks)
   * Uses: git diff --cached --name-only --diff-filter=ACMR
   */
  getStagedFiles(): ChangedFile[] {
    try {
      const output = execSync(
        'git diff --cached --name-only --diff-filter=ACMR',
        {
          cwd: this.options.cwd,
          encoding: 'utf-8',
        }
      ).trim();

      return this.parseFileList(output, 'staged');
    } catch {
      return [];
    }
  }

  /**
   * Get files changed in current branch compared to base branch (for CI/PR)
   * Uses: git diff --name-only main...HEAD
   */
  getBranchChanges(baseBranch?: string): ChangedFile[] {
    const base = baseBranch ?? this.options.defaultBranch;

    try {
      // First, try the three-dot syntax for proper branch comparison
      const output = execSync(
        `git diff --name-only ${base}...HEAD`,
        {
          cwd: this.options.cwd,
          encoding: 'utf-8',
        }
      ).trim();

      return this.parseFileList(output, 'branch');
    } catch {
      // Fallback to two-dot syntax
      try {
        const output = execSync(
          `git diff --name-only ${base}..HEAD`,
          {
            cwd: this.options.cwd,
            encoding: 'utf-8',
          }
        ).trim();

        return this.parseFileList(output, 'branch');
      } catch {
        return [];
      }
    }
  }

  /**
   * Get uncommitted changes (staged + unstaged)
   */
  getUncommittedChanges(): ChangedFile[] {
    try {
      const output = execSync(
        'git diff --name-only HEAD',
        {
          cwd: this.options.cwd,
          encoding: 'utf-8',
        }
      ).trim();

      const uncommitted = this.parseFileList(output, 'uncommitted');
      const staged = this.getStagedFiles();

      // Merge and deduplicate
      const seen = new Set<string>();
      const result: ChangedFile[] = [];

      for (const file of [...staged, ...uncommitted]) {
        if (!seen.has(file.path)) {
          seen.add(file.path);
          result.push(file);
        }
      }

      return result;
    } catch {
      return this.getStagedFiles();
    }
  }

  /**
   * Auto-detect the best change detection strategy
   */
  detectChanges(): ChangeDetectionResult {
    // Check if in CI environment
    const isCI = process.env.CI === 'true' || process.env.CI === '1';
    const prBase = process.env.GITHUB_BASE_REF || 
                   process.env.CI_MERGE_REQUEST_TARGET_BRANCH_NAME ||
                   process.env.BITBUCKET_PR_DESTINATION_BRANCH;

    if (!this.isGitRepo()) {
      return {
        files: [],
        incremental: false,
        reference: 'none',
        totalFiles: 0,
      };
    }

    // PR context: use base branch comparison
    if (prBase) {
      const files = this.getBranchChanges(prBase);
      return {
        files,
        incremental: true,
        reference: `${prBase}...HEAD`,
        totalFiles: files.length,
      };
    }

    // CI context without PR: use default branch
    if (isCI) {
      const files = this.getBranchChanges();
      return {
        files,
        incremental: true,
        reference: `${this.options.defaultBranch}...HEAD`,
        totalFiles: files.length,
      };
    }

    // Pre-commit context: check for staged files
    const stagedFiles = this.getStagedFiles();
    if (stagedFiles.length > 0) {
      return {
        files: stagedFiles,
        incremental: true,
        reference: 'staged',
        totalFiles: stagedFiles.length,
      };
    }

    // Fallback: uncommitted changes
    const uncommitted = this.getUncommittedChanges();
    if (uncommitted.length > 0) {
      return {
        files: uncommitted,
        incremental: true,
        reference: 'uncommitted',
        totalFiles: uncommitted.length,
      };
    }

    // No changes detected
    return {
      files: [],
      incremental: false,
      reference: 'none',
      totalFiles: 0,
    };
  }

  /**
   * Get current branch name
   */
  getCurrentBranch(): string | null {
    try {
      return execSync('git branch --show-current', {
        cwd: this.options.cwd,
        encoding: 'utf-8',
      }).trim();
    } catch {
      return null;
    }
  }

  /**
   * Get current commit SHA
   */
  getCurrentCommit(): string | null {
    try {
      return execSync('git rev-parse HEAD', {
        cwd: this.options.cwd,
        encoding: 'utf-8',
      }).trim();
    } catch {
      return null;
    }
  }

  /**
   * Check if a file exists in the working tree
   */
  fileExists(relativePath: string): boolean {
    try {
      execSync(`git ls-files --error-unmatch "${relativePath}"`, {
        cwd: this.options.cwd,
        stdio: 'pipe',
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get file content at a specific revision
   */
  async getFileAtRevision(relativePath: string, revision: string): Promise<string | null> {
    return new Promise((resolve) => {
      const git = spawn('git', ['show', `${revision}:${relativePath}`], {
        cwd: this.options.cwd,
      });

      let content = '';
      let error = '';

      git.stdout.on('data', (data) => {
        content += data.toString();
      });

      git.stderr.on('data', (data) => {
        error += data.toString();
      });

      git.on('close', (code) => {
        if (code === 0) {
          resolve(content);
        } else {
          resolve(null);
        }
      });
    });
  }

  private parseFileList(output: string, source: string): ChangedFile[] {
    if (!output) return [];

    const repoRoot = this.getRepoRoot() ?? this.options.cwd;
    const files: ChangedFile[] = [];

    for (const line of output.split('\n')) {
      const relativePath = line.trim();
      if (!relativePath) continue;

      // Apply extension filter
      if (this.options.includeExtensions) {
        const ext = path.extname(relativePath).toLowerCase();
        if (!this.options.includeExtensions.includes(ext)) continue;
      }

      // Apply exclude filter
      if (this.options.excludePaths) {
        const shouldExclude = this.options.excludePaths.some(
          (exclude) => relativePath.startsWith(exclude) || relativePath.includes(`/${exclude}/`)
        );
        if (shouldExclude) continue;
      }

      files.push({
        path: path.join(repoRoot, relativePath),
        relativePath,
        status: this.inferStatus(relativePath, source),
      });
    }

    return files;
  }

  private inferStatus(filePath: string, source: string): ChangedFile['status'] {
    // For more accurate status, we'd need to parse git status --porcelain
    // For now, assume modified unless the file doesn't exist
    try {
      const repoRoot = this.getRepoRoot() ?? this.options.cwd;
      const fullPath = path.join(repoRoot, filePath);
      require('node:fs').accessSync(fullPath);
      return 'modified';
    } catch {
      return 'deleted';
    }
  }
}

/**
 * Create a change detector instance
 */
export function createChangeDetector(options?: Partial<ChangeDetectorOptions>): GitChangeDetector {
  return new GitChangeDetector(options);
}

/**
 * Quick check for staged files (for pre-commit hooks)
 */
export function getStagedFiles(cwd?: string): string[] {
  const detector = new GitChangeDetector({ cwd });
  return detector.getStagedFiles().map((f) => f.path);
}

/**
 * Quick check for branch changes (for CI)
 */
export function getBranchChanges(baseBranch?: string, cwd?: string): string[] {
  const detector = new GitChangeDetector({ cwd });
  return detector.getBranchChanges(baseBranch).map((f) => f.path);
}
