// [SCANNER_ENGINES] Enhancement
// File: packages/core/src/secrets/scanner.ts
// Changes:
// - Added comprehensive JSDoc documentation with examples
// - Added explicit return types to all methods
// - Added input validation for public functions
// - Added runtime parameter validation
// - Added TODO comments for potential improvements
// Warnings:
// - Consider adding async file reading for large codebases
// - Consider caching compiled regex patterns for performance

/**
 * Secrets Scanner Module
 *
 * Main orchestrator for scanning files for potential secrets such as
 * API keys, passwords, tokens, and other sensitive data.
 *
 * @module secrets/scanner
 *
 * @example
 * ```typescript
 * import { SecretsScanner, scanForSecrets } from '@vibecheck/core/secrets';
 *
 * // Using the class directly
 * const scanner = new SecretsScanner({ minEntropy: 3.5 });
 * const result = await scanner.scan('/path/to/project');
 *
 * // Using the convenience function
 * const result = await scanForSecrets('/path/to/project', { minEntropy: 3.5 });
 * ```
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

import type {
  SecretScanOptions,
  SecretScanResult,
  SecretDetection,
  SecretPattern,
  Confidence,
} from './types.js';

import { SECRET_PATTERNS, FALSE_POSITIVE_VALUES, CONTEXT_EXCLUSION_PATTERNS } from './patterns.js';
import { calculateEntropy, calculateConfidence, toConfidenceLevel } from './entropy.js';
import { adjustRiskByContext, isTestFile, isSafeLineContext } from './contextual-risk.js';
import { sortFindings } from '../utils/stable-sort.js';

// ============================================================================
// Constants
// ============================================================================

/** Minimum length for a value to be considered for redaction display */
const MIN_REDACT_LENGTH = 8;

/** Number of visible characters at start/end of redacted secrets */
const REDACT_VISIBLE_CHARS = 4;

/** Minimum length for a value in line masking */
const MIN_MASK_LENGTH = 12;

/** Finding ID prefix for secrets */
const FINDING_ID_PREFIX = 'secret_';

/** Hash algorithm for finding IDs */
const HASH_ALGORITHM = 'sha256';

/** Length of hash substring for finding IDs */
const HASH_LENGTH = 16;

// ============================================================================
// Default Options
// ============================================================================

/**
 * Default scanner options applied when not overridden.
 */
const DEFAULT_OPTIONS: Required<SecretScanOptions> = {
  paths: ['.'],
  include: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.json', '**/*.env', '**/*.yaml', '**/*.yml'],
  exclude: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**', '**/coverage/**', '**/__tests__/**', '**/__mocks__/**', '**/*.test.*', '**/*.spec.*'],
  incremental: false,
  since: 'HEAD~10',
  includeHistory: false,
  historyDepth: 50,
  minEntropy: 0,
  customPatterns: [],
  skipTestFiles: true, // Skip test files by default to avoid false positives
};

// ============================================================================
// Scanner Class
// ============================================================================

/**
 * SecretsScanner class for detecting secrets in source code.
 *
 * Scans files for patterns matching known secret formats such as API keys,
 * tokens, passwords, and other sensitive data. Uses entropy analysis and
 * contextual risk adjustment to reduce false positives.
 *
 * @example
 * ```typescript
 * // Basic usage
 * const scanner = new SecretsScanner();
 * const result = await scanner.scan('/path/to/project');
 * console.log(`Found ${result.findings.length} potential secrets`);
 *
 * // With custom options
 * const scanner = new SecretsScanner({
 *   minEntropy: 4.0,
 *   exclude: ['test', 'node_modules'],
 *   customPatterns: [
 *     {
 *       id: 'custom-api-key',
 *       name: 'Custom API Key',
 *       pattern: /CUSTOM_[A-Z0-9]{32}/,
 *       type: 'api_key',
 *       severity: 'high',
 *       minEntropy: 3.5,
 *       valueGroup: 0,
 *     }
 *   ],
 * });
 * ```
 */
export class SecretsScanner {
  /** Merged scanner options */
  private options: Required<SecretScanOptions>;

  /** Combined list of secret patterns (built-in + custom) */
  private patterns: SecretPattern[];

  /**
   * Creates a new SecretsScanner instance.
   *
   * @param options - Scanner configuration options
   *
   * @example
   * ```typescript
   * const scanner = new SecretsScanner({
   *   minEntropy: 3.5,
   *   exclude: ['**/fixtures/**'],
   * });
   * ```
   */
  constructor(options: SecretScanOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.patterns = [...SECRET_PATTERNS, ...this.options.customPatterns];
  }

  /**
   * Scans a project directory for secrets.
   *
   * Recursively scans files matching the include patterns, excluding
   * files matching exclude patterns. Results are deduplicated and sorted
   * for deterministic output.
   *
   * @param projectPath - Absolute path to the project root
   * @returns Scan result containing findings and statistics
   * @throws {Error} When projectPath is empty or invalid
   *
   * @example
   * ```typescript
   * const result = await scanner.scan('/home/user/project');
   *
   * // Check results
   * if (result.findings.length > 0) {
   *   console.log(`Found ${result.stats.secretsFound} secrets`);
   *   console.log(`Critical: ${result.stats.bySeverity.critical}`);
   *   console.log(`High: ${result.stats.bySeverity.high}`);
   * }
   * ```
   */
  async scan(projectPath: string): Promise<SecretScanResult> {
    // Input validation
    if (!projectPath || typeof projectPath !== 'string') {
      throw new Error('projectPath is required and must be a non-empty string');
    }

    const startTime = Date.now();
    const findings: SecretDetection[] = [];

    const files = this.getFilesToScan(projectPath);
    let linesScanned = 0;

    for (const file of files) {
      try {
        const content = fs.readFileSync(file, 'utf-8');
        const lines = content.split('\n');
        linesScanned += lines.length;

        const fileFindings = this.scanFileContent(content, file, projectPath);
        findings.push(...fileFindings);
      } catch {
        // Skip unreadable files silently
        // TODO: Consider adding a verbose mode that logs skipped files
      }
    }

    // Deduplicate findings by unique key
    const uniqueFindings = this.deduplicateFindings(findings);

    // Sort findings for deterministic output
    const sortedFindings = sortFindings(uniqueFindings);

    // Calculate statistics
    const stats = this.calculateStats(sortedFindings, files.length, linesScanned, startTime);

    return {
      projectPath,
      findings: sortedFindings,
      stats,
    };
  }

  /**
   * Scans a single file's content for secrets.
   *
   * This method can be used to scan content that isn't necessarily
   * from a file on disk (e.g., from a diff, clipboard, or API).
   *
   * @param content - The file content to scan
   * @param filePath - Path to the file (for reporting purposes)
   * @param projectRoot - Project root path for relative path calculation
   * @returns Array of secret detections found in the content
   *
   * @example
   * ```typescript
   * const content = `
   *   const apiKey = 'sk_live_abc123...';
   *   const password = process.env.PASSWORD;
   * `;
   *
   * const findings = scanner.scanFileContent(
   *   content,
   *   '/project/src/config.ts',
   *   '/project'
   * );
   *
   * // findings[0].type might be 'stripe_key'
   * ```
   */
  scanFileContent(
    content: string,
    filePath: string,
    projectRoot: string
  ): SecretDetection[] {
    // Input validation
    if (typeof content !== 'string') {
      return [];
    }

    const findings: SecretDetection[] = [];
    const lines = content.split('\n');
    const relativePath = path.relative(projectRoot, filePath).replace(/\\/g, '/');
    const isTest = isTestFile(relativePath);

    // Skip test files if option is enabled (default: true)
    if (this.options.skipTestFiles && isTest) {
      return [];
    }

    for (const pattern of this.patterns) {
      // Create a new regex with global flag for iteration
      const regex = new RegExp(pattern.pattern.source, 'gi');
      let match: RegExpExecArray | null;

      while ((match = regex.exec(content)) !== null) {
        const lineNum = content.substring(0, match.index).split('\n').length;
        const line = lines[lineNum - 1] ?? '';
        const column = match.index - content.lastIndexOf('\n', match.index - 1);

        // Extract the secret value from the appropriate capture group
        const secretValue = pattern.valueGroup > 0
          ? (match[pattern.valueGroup] ?? match[0])
          : match[0];

        // Skip false positives
        if (this.isFalsePositive(secretValue, line, relativePath)) {
          continue;
        }

        // Check entropy threshold
        const entropy = calculateEntropy(secretValue);
        const minEntropy = this.options.minEntropy || pattern.minEntropy;

        if (minEntropy > 0 && entropy < minEntropy) {
          continue;
        }

        // Calculate confidence level
        const confidenceValue = calculateConfidence(entropy, minEntropy);
        const confidence = toConfidenceLevel(confidenceValue);

        // Adjust severity based on context (test files get lower severity)
        const adjustment = adjustRiskByContext(pattern.severity, relativePath, entropy);

        // Generate unique finding ID
        const id = this.generateFindingId(pattern.id, relativePath, lineNum, secretValue);

        findings.push({
          id,
          patternId: pattern.id,
          ruleId: pattern.id, // For secrets, ruleId is same as patternId
          type: pattern.type,
          name: pattern.name,
          severity: adjustment.adjustedSeverity,
          file: relativePath,
          line: lineNum,
          column: column || 1,
          redactedMatch: this.redactSecret(secretValue),
          entropy,
          confidence,
          isTest,
          lineContent: this.maskLine(line),
          recommendation: {
            reason: `${pattern.name} detected in ${adjustment.context} file`,
            remediation: 'Move to environment variable or secrets manager',
          },
        });

        // Prevent infinite loop for zero-length matches
        if (match.index === regex.lastIndex) {
          regex.lastIndex++;
        }
      }
    }

    return findings;
  }

  /**
   * Checks if a match is a false positive.
   *
   * Uses multiple heuristics to identify false positives:
   * - Known placeholder values (example, test, demo, etc.)
   * - Context exclusion patterns (comments, documentation)
   * - Repeating character patterns
   * - Sequential character patterns
   *
   * @param value - The matched secret value
   * @param line - The full line containing the match
   * @param filePath - The file path for context
   * @returns True if the match is likely a false positive
   */
  private isFalsePositive(value: string, line: string, filePath: string): boolean {
    const lowerValue = value.toLowerCase();
    const lowerLine = line.toLowerCase();

    // Check against known false positive values
    for (const fp of FALSE_POSITIVE_VALUES) {
      if (lowerValue.includes(fp)) {
        return true;
      }
    }

    // Check line context against exclusion patterns
    if (CONTEXT_EXCLUSION_PATTERNS.some(p => p.test(line))) {
      return true;
    }

    // Check if it's a safe line context (e.g., type definitions)
    if (isSafeLineContext(line)) {
      return true;
    }

    // Check for repeating characters (e.g., 'aaaaaa')
    if (/^(.)\1{5,}$/.test(value)) {
      return true;
    }

    // Check for sequential patterns (e.g., '123456', 'abcdef')
    if (/^(012|123|234|345|456|567|678|789|abc|bcd|cde)/i.test(value)) {
      return true;
    }

    // Check for example/placeholder indicators in line
    if (/example|sample|demo|placeholder|your[_-]?key/i.test(lowerLine)) {
      return true;
    }

    return false;
  }

  /**
   * Gets the list of files to scan based on configured patterns.
   *
   * @param projectPath - The project root path
   * @returns Array of absolute file paths to scan
   */
  private getFilesToScan(projectPath: string): string[] {
    const files: string[] = [];

    // TODO: Use fast-glob for better performance with include/exclude patterns
    this.walkDirectory(projectPath, files);

    return files;
  }

  /**
   * Recursively walks a directory, collecting files to scan.
   *
   * @param dir - Directory to walk
   * @param results - Array to collect file paths into
   */
  private walkDirectory(dir: string, results: string[]): void {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const normalizedPath = fullPath.replace(/\\/g, '/');

        // Check exclusions first for performance
        if (this.shouldExclude(normalizedPath)) {
          continue;
        }

        if (entry.isDirectory()) {
          this.walkDirectory(fullPath, results);
        } else if (this.shouldInclude(normalizedPath)) {
          results.push(fullPath);
        }
      }
    } catch {
      // Skip unreadable directories silently
    }
  }

  /**
   * Checks if a path should be excluded from scanning.
   *
   * @param filePath - The file path to check
   * @returns True if the path should be excluded
   */
  private shouldExclude(filePath: string): boolean {
    return this.options.exclude.some(pattern => {
      // Convert glob pattern to regex
      const regex = new RegExp(
        pattern
          .replace(/\*\*/g, '.*')
          .replace(/\*/g, '[^/]*')
          .replace(/\//g, '[\\\\/]')
      );
      return regex.test(filePath);
    });
  }

  /**
   * Checks if a path should be included in scanning.
   *
   * @param filePath - The file path to check
   * @returns True if the path should be included
   */
  private shouldInclude(filePath: string): boolean {
    const extensions = ['.ts', '.tsx', '.js', '.jsx', '.json', '.env', '.yaml', '.yml'];
    return extensions.some(ext => filePath.endsWith(ext));
  }

  /**
   * Redacts a secret value for safe display.
   *
   * Shows only the first and last few characters to allow
   * identification while protecting the actual value.
   *
   * @param value - The secret value to redact
   * @returns Redacted version of the secret
   *
   * @example
   * ```typescript
   * redactSecret('sk_live_abc123xyz789');
   * // Returns: 'sk_l...789'
   * ```
   */
  private redactSecret(value: string): string {
    if (value.length <= MIN_REDACT_LENGTH) {
      return '*'.repeat(value.length);
    }
    const visibleChars = Math.min(REDACT_VISIBLE_CHARS, Math.floor(value.length / 4));
    return value.substring(0, visibleChars) + '...' + value.substring(value.length - visibleChars);
  }

  /**
   * Masks potential secret values in a line for safe display.
   *
   * @param line - The line content to mask
   * @returns Line with potential secrets masked
   */
  private maskLine(line: string): string {
    // Mask potential secret values in quoted strings
    return line.replace(/(['"])[A-Za-z0-9_\-/+=]{12,}(['"])/g, (match, q1, q2) => {
      const inner = match.slice(1, -1);
      if (inner.length > MIN_MASK_LENGTH) {
        return `${q1}${inner.slice(0, 4)}****${inner.slice(-4)}${q2}`;
      }
      return `${q1}****${q2}`;
    });
  }

  /**
   * Generates a unique, deterministic finding ID.
   *
   * @param patternId - The pattern that matched
   * @param file - The file path
   * @param line - The line number
   * @param value - The matched value
   * @returns A unique finding ID
   */
  private generateFindingId(
    patternId: string,
    file: string,
    line: number,
    value: string
  ): string {
    const hash = crypto
      .createHash(HASH_ALGORITHM)
      .update(`${patternId}:${file}:${line}:${value}`)
      .digest('hex')
      .substring(0, HASH_LENGTH);
    return `${FINDING_ID_PREFIX}${hash}`;
  }

  /**
   * Deduplicates findings based on a stable key.
   *
   * @param findings - Array of findings to deduplicate
   * @returns Deduplicated array of findings
   */
  private deduplicateFindings(findings: SecretDetection[]): SecretDetection[] {
    const seen = new Set<string>();
    return findings.filter(f => {
      // Use stable key: file, line, column, ruleId, redactedMatch
      const key = `${f.file}:${f.line}:${f.column || 1}:${f.ruleId}:${f.redactedMatch}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  /**
   * Calculates scan statistics from findings.
   *
   * @param findings - Array of findings to analyze
   * @param filesScanned - Number of files scanned
   * @param linesScanned - Number of lines scanned
   * @param startTime - Scan start timestamp
   * @returns Scan statistics object
   */
  private calculateStats(
    findings: SecretDetection[],
    filesScanned: number,
    linesScanned: number,
    startTime: number
  ): SecretScanResult['stats'] {
    const byType: Partial<Record<string, number>> = {};
    const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };

    for (const finding of findings) {
      byType[finding.type] = (byType[finding.type] ?? 0) + 1;
      bySeverity[finding.severity]++;
    }

    return {
      filesScanned,
      linesScanned,
      secretsFound: findings.length,
      byType,
      bySeverity,
      durationMs: Date.now() - startTime,
    };
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Scans a project for secrets with default options.
 *
 * Convenience function that creates a SecretsScanner instance
 * and runs a scan in one call.
 *
 * @param projectPath - Absolute path to the project root
 * @param options - Optional scanner configuration
 * @returns Scan result containing findings and statistics
 * @throws {Error} When projectPath is empty or invalid
 *
 * @example
 * ```typescript
 * // Basic usage
 * const result = await scanForSecrets('/path/to/project');
 *
 * // With options
 * const result = await scanForSecrets('/path/to/project', {
 *   minEntropy: 4.0,
 *   exclude: ['**/test/**'],
 * });
 *
 * console.log(`Found ${result.findings.length} potential secrets`);
 * ```
 */
export async function scanForSecrets(
  projectPath: string,
  options?: SecretScanOptions
): Promise<SecretScanResult> {
  // Input validation
  if (!projectPath || typeof projectPath !== 'string') {
    throw new Error('projectPath is required and must be a non-empty string');
  }

  const scanner = new SecretsScanner(options);
  return scanner.scan(projectPath);
}

/**
 * Scans a single file's content for secrets.
 *
 * Convenience function for scanning content without creating
 * a full scanner instance.
 *
 * @param content - The file content to scan
 * @param filePath - Path to the file (for reporting)
 * @param options - Optional scanner configuration
 * @returns Array of secret detections found
 *
 * @example
 * ```typescript
 * const code = `const API_KEY = 'sk_live_123456789';`;
 *
 * const findings = scanContent(code, 'src/config.ts', {
 *   minEntropy: 3.0,
 * });
 *
 * if (findings.length > 0) {
 *   console.log('Secrets detected!');
 * }
 * ```
 */
export function scanContent(
  content: string,
  filePath: string,
  options?: SecretScanOptions
): SecretDetection[] {
  const scanner = new SecretsScanner(options);
  return scanner.scanFileContent(content, filePath, path.dirname(filePath));
}
