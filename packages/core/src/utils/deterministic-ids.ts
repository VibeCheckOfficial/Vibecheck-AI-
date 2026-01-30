/**
 * Deterministic ID Generation
 * 
 * Generates stable, content-based IDs for findings and evidence receipts.
 * Same content always produces same ID, enabling deterministic outputs.
 * 
 * @module deterministic-ids
 * @example
 * ```typescript
 * const findingId = generateFindingId('no-console', 'src/app.ts', 10, 5, 'console.log');
 * // Returns: 'finding-a1b2c3d4e5f6g7h8'
 * ```
 */

import * as crypto from 'crypto';

/** Minimum length for content to be hashed */
const MIN_CONTENT_LENGTH = 1;

/** Hash algorithm used for ID generation */
const HASH_ALGORITHM = 'sha256';

/** Length of truncated hash in generated IDs */
const HASH_TRUNCATE_LENGTH = 16;

/**
 * Generate a stable finding ID from content.
 * 
 * Creates a deterministic ID based on rule, location, and matched content.
 * Same inputs always produce the same ID.
 * 
 * @param ruleId - The ID of the rule that triggered the finding
 * @param filePath - Path to the file containing the finding
 * @param line - Line number of the finding (1-indexed)
 * @param column - Column number of the finding (1-indexed)
 * @param matchedContent - The content that matched the rule
 * @returns A stable finding ID in format 'finding-{hash}'
 * @throws {Error} If ruleId or filePath is empty
 * 
 * @example
 * ```typescript
 * const id = generateFindingId('no-any', 'src/utils.ts', 42, 10, 'any');
 * // Same inputs always return the same ID
 * ```
 */
export function generateFindingId(
  ruleId: string,
  filePath: string,
  line: number,
  column: number,
  matchedContent: string
): string {
  // Input validation
  if (!ruleId || ruleId.trim().length === 0) {
    throw new Error('ruleId is required and cannot be empty');
  }
  if (!filePath || filePath.trim().length === 0) {
    throw new Error('filePath is required and cannot be empty');
  }
  if (line < 1) {
    throw new Error('line must be a positive integer (1-indexed)');
  }
  if (column < 1) {
    throw new Error('column must be a positive integer (1-indexed)');
  }

  const content = `${ruleId}:${filePath}:${line}:${column}:${matchedContent}`;
  const hash = crypto.createHash(HASH_ALGORITHM).update(content).digest('hex');
  return `finding-${hash.substring(0, HASH_TRUNCATE_LENGTH)}`;
}

/**
 * Generate a stable evidence receipt ID.
 * 
 * Creates a deterministic ID for evidence receipts based on finding,
 * evidence hash, and timestamp.
 * 
 * @param findingId - The ID of the associated finding
 * @param evidenceHash - Hash of the evidence content
 * @param timestamp - ISO timestamp of when evidence was collected
 * @returns A stable receipt ID in format 'receipt-{hash}'
 * @throws {Error} If any required parameter is empty
 * 
 * @example
 * ```typescript
 * const receiptId = generateReceiptId(
 *   'finding-abc123',
 *   'sha256hash...',
 *   '2024-01-15T10:30:00Z'
 * );
 * ```
 */
export function generateReceiptId(
  findingId: string,
  evidenceHash: string,
  timestamp: string
): string {
  // Input validation
  if (!findingId || findingId.trim().length === 0) {
    throw new Error('findingId is required and cannot be empty');
  }
  if (!evidenceHash || evidenceHash.trim().length === 0) {
    throw new Error('evidenceHash is required and cannot be empty');
  }
  if (!timestamp || timestamp.trim().length === 0) {
    throw new Error('timestamp is required and cannot be empty');
  }

  const content = `${findingId}:${evidenceHash}:${timestamp}`;
  const hash = crypto.createHash(HASH_ALGORITHM).update(content).digest('hex');
  return `receipt-${hash.substring(0, HASH_TRUNCATE_LENGTH)}`;
}

/**
 * Generate a stable audit ID.
 * 
 * Creates a deterministic ID for audit log entries based on agent,
 * action, target, and content hash.
 * 
 * @param agentId - ID of the agent performing the action
 * @param action - The action being performed (e.g., 'write', 'delete')
 * @param target - The target of the action (e.g., file path)
 * @param contentHash - Hash of the content being acted upon
 * @returns A stable audit ID in format 'audit-{hash}'
 * @throws {Error} If any required parameter is empty
 * 
 * @example
 * ```typescript
 * const auditId = generateAuditId(
 *   'cursor-agent',
 *   'write',
 *   'src/app.ts',
 *   'sha256hash...'
 * );
 * ```
 */
export function generateAuditId(
  agentId: string,
  action: string,
  target: string,
  contentHash: string
): string {
  // Input validation
  if (!agentId || agentId.trim().length === 0) {
    throw new Error('agentId is required and cannot be empty');
  }
  if (!action || action.trim().length === 0) {
    throw new Error('action is required and cannot be empty');
  }
  if (!target || target.trim().length === 0) {
    throw new Error('target is required and cannot be empty');
  }
  if (!contentHash || contentHash.trim().length === 0) {
    throw new Error('contentHash is required and cannot be empty');
  }

  const content = `${agentId}:${action}:${target}:${contentHash}`;
  const hash = crypto.createHash(HASH_ALGORITHM).update(content).digest('hex');
  return `audit-${hash.substring(0, HASH_TRUNCATE_LENGTH)}`;
}

/**
 * Patch entry for transaction ID generation.
 */
export interface PatchEntry {
  /** Path to the file being patched */
  filePath: string;
  /** Hash of the patch content */
  contentHash: string;
}

/**
 * Generate a stable transaction ID.
 * 
 * Creates a deterministic ID for a set of patches. The patches are
 * sorted before hashing to ensure consistent IDs regardless of
 * input order.
 * 
 * @param patches - Array of patch entries with file paths and content hashes
 * @returns A stable transaction ID in format 'tx-{hash}'
 * @throws {Error} If patches array is empty or contains invalid entries
 * 
 * @example
 * ```typescript
 * const txId = generateTransactionId([
 *   { filePath: 'src/a.ts', contentHash: 'hash1' },
 *   { filePath: 'src/b.ts', contentHash: 'hash2' },
 * ]);
 * ```
 */
export function generateTransactionId(
  patches: PatchEntry[]
): string {
  // Input validation
  if (!patches || patches.length === 0) {
    throw new Error('patches array is required and cannot be empty');
  }

  for (let i = 0; i < patches.length; i++) {
    const patch = patches[i];
    if (!patch.filePath || patch.filePath.trim().length === 0) {
      throw new Error(`patches[${i}].filePath is required and cannot be empty`);
    }
    if (!patch.contentHash || patch.contentHash.trim().length === 0) {
      throw new Error(`patches[${i}].contentHash is required and cannot be empty`);
    }
  }

  const content = patches
    .map(p => `${p.filePath}:${p.contentHash}`)
    .sort()
    .join('|');
  const hash = crypto.createHash(HASH_ALGORITHM).update(content).digest('hex');
  return `tx-${hash.substring(0, HASH_TRUNCATE_LENGTH)}`;
}

/**
 * Hash content for stable comparison.
 * 
 * Creates a SHA-256 hash of the provided content. Useful for
 * content comparison and deduplication.
 * 
 * @param content - The content to hash
 * @returns The SHA-256 hash as a hex string
 * @throws {Error} If content is null or undefined
 * 
 * @example
 * ```typescript
 * const hash = hashContent('const x = 1;');
 * // Returns: '64-character hex string'
 * ```
 * 
 * @remarks
 * This function uses SHA-256 which produces a 64-character hex string.
 * The same content always produces the same hash (pure function).
 */
export function hashContent(content: string): string {
  // Input validation - allow empty string but not null/undefined
  if (content === null || content === undefined) {
    throw new Error('content is required and cannot be null or undefined');
  }

  return crypto.createHash(HASH_ALGORITHM).update(content).digest('hex');
}
