/**
 * Secrets Allowlist Management
 * 
 * Manages SHA256 fingerprints of approved/suppressed secret detections.
 * Allows false positives to be tracked and excluded from future scans.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

import type { AllowlistEntry, SecretDetection } from './types.js';

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_ALLOWLIST_PATH = '.vibecheck/secrets.allowlist';
const SHA256_REGEX = /^[a-f0-9]{64}$/i;

// ============================================================================
// Allowlist Class
// ============================================================================

export class SecretsAllowlist {
  private entries: Map<string, AllowlistEntry>;
  private filePath: string;

  constructor(projectRoot: string, customPath?: string) {
    this.filePath = customPath ?? path.join(projectRoot, DEFAULT_ALLOWLIST_PATH);
    this.entries = new Map();
    this.load();
  }

  /**
   * Load allowlist from disk
   */
  load(): void {
    this.entries.clear();

    if (!fs.existsSync(this.filePath)) {
      return;
    }

    try {
      const content = fs.readFileSync(this.filePath, 'utf-8');
      const lines = content.split('\n');

      for (const line of lines) {
        const trimmed = line.trim();

        // Skip empty lines and comments
        if (!trimmed || trimmed.startsWith('#')) {
          continue;
        }

        // Parse line (fingerprint or fingerprint with metadata)
        const parts = trimmed.split(/\s+/);
        const fingerprint = parts[0];

        // Validate SHA256 format
        if (!SHA256_REGEX.test(fingerprint)) {
          continue;
        }

        this.entries.set(fingerprint.toLowerCase(), {
          fingerprint: fingerprint.toLowerCase(),
          addedAt: new Date().toISOString(),
        });
      }
    } catch {
      // Failed to load, start fresh
    }
  }

  /**
   * Save allowlist to disk
   */
  save(): void {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const lines = [
      '# vibecheck Secrets Allowlist',
      '# SHA256 fingerprints of approved/suppressed detections',
      '# One fingerprint per line',
      '',
    ];

    // Sort fingerprints for consistent output
    const sortedEntries = Array.from(this.entries.values()).sort((a, b) =>
      a.fingerprint.localeCompare(b.fingerprint)
    );

    for (const entry of sortedEntries) {
      lines.push(entry.fingerprint);
    }

    fs.writeFileSync(this.filePath, lines.join('\n') + '\n', 'utf-8');
  }

  /**
   * Check if a fingerprint is allowlisted
   */
  isAllowlisted(fingerprint: string): boolean {
    return this.entries.has(fingerprint.toLowerCase());
  }

  /**
   * Check if a detection is allowlisted
   */
  isDetectionAllowlisted(detection: SecretDetection): boolean {
    const fingerprint = generateFingerprint(detection);
    return this.isAllowlisted(fingerprint);
  }

  /**
   * Add a fingerprint to the allowlist
   */
  add(fingerprint: string, reason?: string, addedBy?: string): boolean {
    const lower = fingerprint.toLowerCase();

    if (!SHA256_REGEX.test(lower)) {
      return false;
    }

    if (this.entries.has(lower)) {
      return false; // Already exists
    }

    this.entries.set(lower, {
      fingerprint: lower,
      reason,
      addedAt: new Date().toISOString(),
      addedBy,
    });

    return true;
  }

  /**
   * Add a detection to the allowlist
   */
  addDetection(
    detection: SecretDetection,
    reason?: string,
    addedBy?: string
  ): boolean {
    const fingerprint = generateFingerprint(detection);
    return this.add(fingerprint, reason, addedBy);
  }

  /**
   * Remove a fingerprint from the allowlist
   */
  remove(fingerprint: string): boolean {
    return this.entries.delete(fingerprint.toLowerCase());
  }

  /**
   * Get all entries
   */
  getAll(): AllowlistEntry[] {
    return Array.from(this.entries.values());
  }

  /**
   * Get the number of allowlisted items
   */
  size(): number {
    return this.entries.size;
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.entries.clear();
  }

  /**
   * Import from a baseline file (JSON or line-delimited)
   */
  addFromBaseline(content: string): number {
    let added = 0;

    // Try JSON format first
    try {
      const json = JSON.parse(content);
      
      if (Array.isArray(json.findings)) {
        for (const finding of json.findings) {
          if (finding.fingerprint && this.add(finding.fingerprint)) {
            added++;
          }
        }
        return added;
      }
    } catch {
      // Not JSON, try line-delimited
    }

    // Line-delimited format
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && SHA256_REGEX.test(trimmed)) {
        if (this.add(trimmed)) {
          added++;
        }
      }
    }

    return added;
  }

  /**
   * Filter out allowlisted detections from results
   */
  filterAllowlisted(detections: SecretDetection[]): SecretDetection[] {
    return detections.filter(d => !this.isDetectionAllowlisted(d));
  }
}

// ============================================================================
// Fingerprint Generation
// ============================================================================

/**
 * Generate a SHA256 fingerprint for a secret detection
 * 
 * The fingerprint is based on:
 * - Pattern ID
 * - File path
 * - Line number
 * - Redacted match (to avoid storing actual secrets)
 */
export function generateFingerprint(detection: SecretDetection): string {
  const data = [
    detection.patternId,
    detection.file,
    detection.line.toString(),
    detection.redactedMatch,
  ].join(':');

  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Generate a fingerprint for a raw secret value
 * 
 * WARNING: This hashes the actual secret. Use with caution.
 * Prefer generateFingerprint(detection) when possible.
 */
export function generateValueFingerprint(
  patternId: string,
  file: string,
  line: number,
  value: string
): string {
  const data = [patternId, file, line.toString(), value].join(':');
  return crypto.createHash('sha256').update(data).digest('hex');
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Load or create an allowlist
 */
export function loadAllowlist(projectRoot: string): SecretsAllowlist {
  return new SecretsAllowlist(projectRoot);
}

/**
 * Check if a detection should be suppressed
 */
export function shouldSuppress(
  detection: SecretDetection,
  allowlist: SecretsAllowlist
): boolean {
  return allowlist.isDetectionAllowlisted(detection);
}
