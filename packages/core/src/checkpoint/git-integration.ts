/**
 * Git Integration for Checkpoints
 * 
 * Captures git state (branch, commit, dirty status) for checkpoint context.
 * 
 * Security: Uses execFile with argument arrays to prevent command injection.
 */

import { execSync, execFileSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

// ============================================================================
// Types
// ============================================================================

export interface GitState {
  /** Whether the directory is a git repository */
  isRepo: boolean;
  /** Current branch name */
  branch?: string;
  /** Current commit hash (short) */
  commit?: string;
  /** Full commit hash */
  commitFull?: string;
  /** Whether there are uncommitted changes */
  dirty?: boolean;
  /** List of modified files */
  modifiedFiles?: string[];
  /** Remote URL (if any) */
  remoteUrl?: string;
}

export interface GitModifiedFile {
  /** File path relative to repo root */
  path: string;
  /** Status: M (modified), A (added), D (deleted), etc. */
  status: string;
}

// ============================================================================
// Git State Capture
// ============================================================================

/**
 * Get the current git state of a directory
 */
export function getGitState(cwd: string): GitState {
  if (!isGitRepo(cwd)) {
    return { isRepo: false };
  }

  try {
    const branch = getCurrentBranch(cwd);
    const commit = getCurrentCommit(cwd);
    const commitFull = getCurrentCommitFull(cwd);
    const dirty = isDirty(cwd);
    const modifiedFiles = dirty ? getModifiedFiles(cwd) : [];
    const remoteUrl = getRemoteUrl(cwd);

    return {
      isRepo: true,
      branch,
      commit,
      commitFull,
      dirty,
      modifiedFiles,
      remoteUrl,
    };
  } catch {
    return { isRepo: true };
  }
}

/**
 * Check if directory is a git repository
 */
export function isGitRepo(cwd: string): boolean {
  try {
    execSync('git rev-parse --git-dir', {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get current branch name
 */
export function getCurrentBranch(cwd: string): string | undefined {
  try {
    const result = execSync('git branch --show-current', {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return result.trim() || undefined;
  } catch {
    // Might be in detached HEAD state
    try {
      const result = execSync('git describe --always', {
        cwd,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return `detached:${result.trim()}`;
    } catch {
      return undefined;
    }
  }
}

/**
 * Get current commit hash (short)
 */
export function getCurrentCommit(cwd: string): string | undefined {
  try {
    const result = execSync('git rev-parse --short HEAD', {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return result.trim();
  } catch {
    return undefined;
  }
}

/**
 * Get current commit hash (full)
 */
export function getCurrentCommitFull(cwd: string): string | undefined {
  try {
    const result = execSync('git rev-parse HEAD', {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return result.trim();
  } catch {
    return undefined;
  }
}

/**
 * Check if there are uncommitted changes
 */
export function isDirty(cwd: string): boolean {
  try {
    const result = execSync('git status --porcelain', {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return result.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Get list of modified files
 */
export function getModifiedFiles(cwd: string): string[] {
  try {
    const result = execSync('git status --porcelain', {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    return result
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(line => {
        // Format: XY filename (XY is status, e.g., " M", "??", "A ")
        const file = line.substring(3);
        return file;
      });
  } catch {
    return [];
  }
}

/**
 * Get modified files with their status
 */
export function getModifiedFilesWithStatus(cwd: string): GitModifiedFile[] {
  try {
    const result = execSync('git status --porcelain', {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    return result
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(line => {
        const status = line.substring(0, 2).trim() || '?';
        const filePath = line.substring(3);
        return { path: filePath, status };
      });
  } catch {
    return [];
  }
}

/**
 * Get remote URL
 */
export function getRemoteUrl(cwd: string): string | undefined {
  try {
    const result = execSync('git remote get-url origin', {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return result.trim();
  } catch {
    return undefined;
  }
}

// ============================================================================
// Git Diff for Checkpoints
// ============================================================================

/**
 * Validate commit hash format (40 hex chars for full, 7-40 for short)
 */
function validateCommitHash(hash: string): boolean {
  // Git commit hashes are hex strings, 7-40 characters
  // Reject anything with shell metacharacters or non-hex characters
  return /^[0-9a-f]{7,40}$/i.test(hash);
}

/**
 * Validate file path (prevent directory traversal and injection)
 */
function validateFilePath(filePath: string): boolean {
  // Reject paths with shell metacharacters, null bytes, or directory traversal
  if (filePath.includes('\0') || filePath.includes(';') || filePath.includes('|') || filePath.includes('&')) {
    return false;
  }
  // Reject paths that go outside repo (basic check)
  if (filePath.includes('..')) {
    return false;
  }
  return true;
}

/**
 * Get files changed since a specific commit
 * Security fix: Validates commit hash and uses execFile to prevent injection
 */
export function getFilesChangedSince(cwd: string, commitHash: string): string[] {
  // Validate commit hash to prevent command injection
  if (!validateCommitHash(commitHash)) {
    return [];
  }

  try {
    // Use execFileSync with argument array instead of string interpolation
    const result = execFileSync('git', ['diff', '--name-only', commitHash], {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 10 * 1024 * 1024, // 10MB limit
    });

    return result.trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Get tracked files in the repository
 */
export function getTrackedFiles(cwd: string): string[] {
  try {
    const result = execSync('git ls-files', {
      cwd,
      encoding: 'utf-8',
      maxBuffer: 50 * 1024 * 1024, // 50MB
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    return result.trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Check if a file is tracked by git
 * Security fix: Validates file path and uses execFile to prevent injection
 */
export function isFileTracked(cwd: string, filePath: string): boolean {
  // Validate file path to prevent command injection
  if (!validateFilePath(filePath)) {
    return false;
  }

  // Ensure file path is relative to repo root (prevent directory traversal)
  const repoRoot = getRepoRoot(cwd);
  if (repoRoot) {
    const fullPath = path.resolve(cwd, filePath);
    if (!fullPath.startsWith(repoRoot)) {
      return false;
    }
    // Normalize to relative path
    filePath = path.relative(repoRoot, fullPath);
  }

  try {
    // Use execFileSync with argument array instead of string interpolation
    execFileSync('git', ['ls-files', '--error-unmatch', filePath], {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// Git Stash Operations
// ============================================================================

/**
 * Validate stash message (prevent injection)
 */
function validateStashMessage(message: string): boolean {
  // Reject messages with shell metacharacters or null bytes
  if (message.includes('\0') || message.includes(';') || message.includes('|') || message.includes('&') || message.includes('`')) {
    return false;
  }
  // Limit length to prevent DoS
  if (message.length > 1000) {
    return false;
  }
  return true;
}

/**
 * Stash current changes
 * Security fix: Validates message and uses execFile to prevent injection
 */
export function stashChanges(cwd: string, message?: string): boolean {
  try {
    // Validate message if provided
    if (message && !validateStashMessage(message)) {
      return false;
    }

    // Use execFileSync with argument array instead of string interpolation
    const args = ['stash', 'push'];
    if (message) {
      args.push('-m', message);
    }
    
    execFileSync('git', args, {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Pop the latest stash
 */
export function stashPop(cwd: string): boolean {
  try {
    execSync('git stash pop', {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the repo root directory
 */
export function getRepoRoot(cwd: string): string | undefined {
  try {
    const result = execSync('git rev-parse --show-toplevel', {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return result.trim();
  } catch {
    return undefined;
  }
}
