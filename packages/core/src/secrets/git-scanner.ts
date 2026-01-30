/**
 * Git History Scanner
 * 
 * Scans git commit history for leaked secrets.
 */

import { execSync } from 'child_process';
import * as path from 'path';
import * as crypto from 'crypto';

import type {
  HistoricalDetection,
  GitHistoryScanResult,
  SecretPattern,
  SecretType,
} from './types.js';

import { SECRET_PATTERNS } from './patterns.js';
import { calculateEntropy, calculateConfidence, toConfidenceLevel } from './entropy.js';

// ============================================================================
// Types
// ============================================================================

interface CommitInfo {
  hash: string;
  date: string;
  author: string;
}

interface GitScanOptions {
  /** Number of commits to scan */
  depth?: number;
  /** Branch to scan */
  branch?: string;
  /** Only scan added lines (not deletions) */
  addedOnly?: boolean;
}

// ============================================================================
// Git History Scanner
// ============================================================================

export class GitHistoryScanner {
  private patterns: SecretPattern[];

  constructor(customPatterns: SecretPattern[] = []) {
    this.patterns = [...SECRET_PATTERNS, ...customPatterns];
  }

  /**
   * Scan git history for secrets
   */
  async scan(
    projectPath: string,
    options: GitScanOptions = {}
  ): Promise<GitHistoryScanResult> {
    const { depth = 50, branch = 'HEAD', addedOnly = true } = options;

    // Verify git repository
    if (!this.isGitRepo(projectPath)) {
      return {
        findings: [],
        stats: {
          commitsScanned: 0,
          totalSecrets: 0,
          byCommit: new Map(),
          byType: {},
        },
      };
    }

    const commits = this.getCommits(projectPath, depth, branch);
    const findings: HistoricalDetection[] = [];
    const byCommit = new Map<string, number>();

    for (const commit of commits) {
      const diff = this.getCommitDiff(projectPath, commit.hash, addedOnly);
      const commitFindings = this.scanDiff(diff, commit, projectPath);
      
      findings.push(...commitFindings);
      
      if (commitFindings.length > 0) {
        byCommit.set(commit.hash, commitFindings.length);
      }
    }

    // Calculate stats by type
    const byType: Partial<Record<SecretType, number>> = {};
    for (const finding of findings) {
      byType[finding.type] = (byType[finding.type] ?? 0) + 1;
    }

    return {
      findings,
      stats: {
        commitsScanned: commits.length,
        totalSecrets: findings.length,
        byCommit,
        byType,
      },
    };
  }

  /**
   * Check if directory is a git repository
   */
  private isGitRepo(dir: string): boolean {
    try {
      execSync('git rev-parse --git-dir', {
        cwd: dir,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get commit list
   */
  private getCommits(
    projectPath: string,
    depth: number,
    branch: string
  ): CommitInfo[] {
    try {
      const output = execSync(
        `git log --format="%H|%aI|%an" -n ${depth} ${branch}`,
        {
          cwd: projectPath,
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024,
          stdio: ['pipe', 'pipe', 'pipe'],
        }
      );

      return output
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(line => {
          const [hash, date, author] = line.split('|');
          return { hash, date, author };
        });
    } catch {
      return [];
    }
  }

  /**
   * Get diff for a commit
   */
  private getCommitDiff(
    projectPath: string,
    commitHash: string,
    addedOnly: boolean
  ): string {
    try {
      const output = execSync(
        `git show ${commitHash} --format="" --unified=0`,
        {
          cwd: projectPath,
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024,
          stdio: ['pipe', 'pipe', 'pipe'],
        }
      );

      if (addedOnly) {
        // Only return added lines (starting with +, but not +++)
        return output
          .split('\n')
          .filter(line => line.startsWith('+') && !line.startsWith('+++'))
          .map(line => line.substring(1))
          .join('\n');
      }

      return output;
    } catch {
      return '';
    }
  }

  /**
   * Scan diff content for secrets
   */
  private scanDiff(
    diff: string,
    commit: CommitInfo,
    projectPath: string
  ): HistoricalDetection[] {
    const findings: HistoricalDetection[] = [];
    const lines = diff.split('\n');

    for (const pattern of this.patterns) {
      const regex = new RegExp(pattern.pattern.source, 'gi');
      let match: RegExpExecArray | null;

      while ((match = regex.exec(diff)) !== null) {
        const lineNum = diff.substring(0, match.index).split('\n').length;
        const line = lines[lineNum - 1] ?? '';

        // Extract secret value
        const secretValue = pattern.valueGroup > 0
          ? (match[pattern.valueGroup] ?? match[0])
          : match[0];

        // Check entropy
        const entropy = calculateEntropy(secretValue);
        if (pattern.minEntropy > 0 && entropy < pattern.minEntropy) {
          continue;
        }

        // Skip obvious false positives
        if (this.isFalsePositive(secretValue)) {
          continue;
        }

        const confidence = toConfidenceLevel(
          calculateConfidence(entropy, pattern.minEntropy)
        );

        const id = this.generateId(pattern.id, commit.hash, lineNum, secretValue);

        findings.push({
          id,
          patternId: pattern.id,
          type: pattern.type,
          name: pattern.name,
          severity: pattern.severity,
          file: `git:${commit.hash}`,
          line: lineNum,
          redactedMatch: this.redactSecret(secretValue),
          entropy,
          confidence,
          isTest: false,
          commit: commit.hash,
          commitDate: commit.date,
          author: commit.author,
          recommendation: {
            reason: `${pattern.name} found in git history`,
            remediation: 'Rotate the secret and remove from git history using git filter-branch or BFG',
          },
        });

        // Prevent infinite loop
        if (match.index === regex.lastIndex) {
          regex.lastIndex++;
        }
      }
    }

    return findings;
  }

  /**
   * Check for false positives
   */
  private isFalsePositive(value: string): boolean {
    const lowerValue = value.toLowerCase();
    
    const falsePositives = [
      'example', 'test', 'sample', 'demo', 'placeholder',
      'your_key', 'changeme', 'xxx', 'password123',
    ];

    return falsePositives.some(fp => lowerValue.includes(fp));
  }

  /**
   * Redact secret for display
   */
  private redactSecret(value: string): string {
    if (value.length <= 8) {
      return '*'.repeat(value.length);
    }
    const visible = Math.min(4, Math.floor(value.length / 4));
    return value.substring(0, visible) + '...' + value.substring(value.length - visible);
  }

  /**
   * Generate unique ID
   */
  private generateId(
    patternId: string,
    commit: string,
    line: number,
    value: string
  ): string {
    const hash = crypto
      .createHash('sha256')
      .update(`${patternId}:${commit}:${line}:${value}`)
      .digest('hex')
      .substring(0, 16);
    return `git_secret_${hash}`;
  }
}

// ============================================================================
// Convenience Function
// ============================================================================

/**
 * Scan git history for secrets
 */
export async function scanGitHistory(
  projectPath: string,
  options?: GitScanOptions
): Promise<GitHistoryScanResult> {
  const scanner = new GitHistoryScanner();
  return scanner.scan(projectPath, options);
}
