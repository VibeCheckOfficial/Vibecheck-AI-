/**
 * Similarity Detector
 * 
 * Multi-layer duplicate detection for documentation:
 * Layer 1: Path + name heuristics
 * Layer 2: MinHash text fingerprinting
 * Layer 3: Semantic similarity (optional, with embeddings)
 */

import * as path from 'path';
import type {
  SimilarityMatch,
  DuplicateCheckResult,
  DocEntry,
  DocGuardConfig,
} from './types.js';
import type { DocRegistryManager } from './doc-registry.js';

// ============================================================================
// MinHash Implementation
// ============================================================================

const MINHASH_NUM_HASHES = 128;
const MINHASH_PRIME = 2147483647; // Large prime for hash

// Pre-computed hash coefficients
const HASH_A = Array.from({ length: MINHASH_NUM_HASHES }, (_, i) => 
  ((i + 1) * 31) % MINHASH_PRIME
);
const HASH_B = Array.from({ length: MINHASH_NUM_HASHES }, (_, i) => 
  ((i + 1) * 37) % MINHASH_PRIME
);

/**
 * Tokenize content for MinHash
 * Uses word n-grams (shingles)
 */
function tokenize(content: string, ngramSize = 3): Set<string> {
  // Normalize: lowercase, remove punctuation, collapse whitespace
  const normalized = content
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const words = normalized.split(' ').filter(w => w.length > 2);
  const shingles = new Set<string>();

  for (let i = 0; i <= words.length - ngramSize; i++) {
    const shingle = words.slice(i, i + ngramSize).join(' ');
    shingles.add(shingle);
  }

  return shingles;
}

/**
 * Simple string hash function
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Compute MinHash signature for content
 */
export function computeMinHash(content: string): number[] {
  const shingles = tokenize(content);
  const signature: number[] = new Array(MINHASH_NUM_HASHES).fill(Infinity);

  for (const shingle of shingles) {
    const shingleHash = hashString(shingle);
    
    for (let i = 0; i < MINHASH_NUM_HASHES; i++) {
      const hashValue = (HASH_A[i] * shingleHash + HASH_B[i]) % MINHASH_PRIME;
      if (hashValue < signature[i]) {
        signature[i] = hashValue;
      }
    }
  }

  return signature;
}

/**
 * Compute Jaccard similarity from MinHash signatures
 */
export function computeMinHashSimilarity(sig1: number[], sig2: number[]): number {
  if (sig1.length !== sig2.length) {
    throw new Error('MinHash signatures must have same length');
  }

  let matches = 0;
  for (let i = 0; i < sig1.length; i++) {
    if (sig1[i] === sig2[i]) {
      matches++;
    }
  }

  return matches / sig1.length;
}

// ============================================================================
// Path Heuristics
// ============================================================================

/**
 * Suspicious filename patterns that indicate potential duplicates
 */
const SUSPICIOUS_PATTERNS = [
  /readme\s*\(?2\)?\.md$/i,
  /readme[-_]?copy\.md$/i,
  /notes\.md$/i,
  /todo\.md$/i,
  /temp\.md$/i,
  /draft\.md$/i,
  /old[-_]?.*\.md$/i,
  /.*[-_]v\d+\.md$/i,      // feature-v2.md
  /.*[-_]new\.md$/i,        // feature-new.md
  /.*[-_]backup\.md$/i,
  /.*\s*\(\d+\)\.md$/i,    // file (2).md
  /.*[-_]wip\.md$/i,
];

/**
 * Check if a filename looks suspicious (likely duplicate)
 */
export function isSuspiciousFilename(filename: string): boolean {
  return SUSPICIOUS_PATTERNS.some(pattern => pattern.test(filename));
}

/**
 * Compute filename similarity (Levenshtein-based)
 */
function filenameSimilarity(name1: string, name2: string): number {
  const s1 = name1.toLowerCase().replace(/\.md$/i, '');
  const s2 = name2.toLowerCase().replace(/\.md$/i, '');

  // Exact match
  if (s1 === s2) return 1;

  // One is substring of other
  if (s1.includes(s2) || s2.includes(s1)) {
    return 0.9;
  }

  // Levenshtein distance
  const distance = levenshteinDistance(s1, s2);
  const maxLen = Math.max(s1.length, s2.length);
  return 1 - (distance / maxLen);
}

/**
 * Levenshtein distance between two strings
 */
function levenshteinDistance(s1: string, s2: string): number {
  const m = s1.length;
  const n = s2.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => 
    Array(n + 1).fill(0)
  );

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  return dp[m][n];
}

// ============================================================================
// Similarity Detector Class
// ============================================================================

export interface SimilarityDetectorOptions {
  config: DocGuardConfig;
  registry: DocRegistryManager;
}

export class SimilarityDetector {
  private config: DocGuardConfig;
  private registry: DocRegistryManager;

  constructor(options: SimilarityDetectorOptions) {
    this.config = options.config;
    this.registry = options.registry;
  }

  /**
   * Run full duplicate check on new doc content
   */
  async checkDuplicates(
    targetPath: string,
    content: string
  ): Promise<DuplicateCheckResult> {
    const matches: SimilarityMatch[] = [];

    // Layer 1: Path heuristics
    const pathMatches = await this.checkPathHeuristics(targetPath);
    matches.push(...pathMatches);

    // Layer 2: Text fingerprinting (MinHash)
    const fingerprintMatches = await this.checkTextFingerprint(content, targetPath);
    matches.push(...fingerprintMatches);

    // Layer 3: Semantic similarity (if enabled)
    if (this.config.enableSemanticSimilarity) {
      const semanticMatches = await this.checkSemanticSimilarity(content, targetPath);
      matches.push(...semanticMatches);
    }

    // Deduplicate matches by path
    const uniqueMatches = this.deduplicateMatches(matches);

    // Determine if it's a duplicate
    const isDuplicate = uniqueMatches.some(
      m => m.similarity >= this.config.similarityThreshold
    );

    // Find best canonical target
    const canonicalTarget = this.findBestCanonicalTarget(uniqueMatches);

    // Determine merge action
    const mergeAction = this.determineMergeAction(uniqueMatches, targetPath);

    return {
      isDuplicate,
      matches: uniqueMatches,
      canonicalTarget,
      mergeAction,
    };
  }

  /**
   * Layer 1: Check path-based heuristics
   */
  private async checkPathHeuristics(targetPath: string): Promise<SimilarityMatch[]> {
    const matches: SimilarityMatch[] = [];
    const targetName = path.basename(targetPath);
    const targetDir = path.dirname(targetPath);

    // Check if filename is suspicious
    if (isSuspiciousFilename(targetName)) {
      matches.push({
        path: targetPath,
        similarity: 0.7,
        detectionLayer: 'path',
        reason: `Suspicious filename pattern: ${targetName}`,
      });
    }

    // Check for similar filenames in same directory
    const allDocs = this.registry.getAllDocs();
    
    for (const doc of allDocs) {
      if (doc.canonicalPath === targetPath) continue;

      const docName = path.basename(doc.canonicalPath);
      const docDir = path.dirname(doc.canonicalPath);

      // Same directory + similar filename
      if (docDir === targetDir) {
        const nameSimilarity = filenameSimilarity(targetName, docName);
        if (nameSimilarity > 0.7) {
          matches.push({
            path: doc.canonicalPath,
            docId: doc.docId,
            similarity: nameSimilarity,
            detectionLayer: 'path',
            reason: `Similar filename in same directory: ${docName}`,
          });
        }
      }

      // Same name in different directory
      if (targetName.toLowerCase() === docName.toLowerCase() && docDir !== targetDir) {
        matches.push({
          path: doc.canonicalPath,
          docId: doc.docId,
          similarity: 0.85,
          detectionLayer: 'path',
          reason: `Same filename in different directory`,
        });
      }
    }

    return matches;
  }

  /**
   * Layer 2: Check text fingerprint similarity
   */
  private async checkTextFingerprint(
    content: string,
    targetPath: string
  ): Promise<SimilarityMatch[]> {
    const matches: SimilarityMatch[] = [];
    const targetSignature = computeMinHash(content);

    const similarDocs = this.registry.findSimilarDocs(
      targetSignature,
      this.config.similarityThreshold * 0.8 // Lower threshold for candidates
    );

    for (const { doc, similarity } of similarDocs) {
      if (doc.canonicalPath === targetPath) continue;

      matches.push({
        path: doc.canonicalPath,
        docId: doc.docId,
        similarity,
        detectionLayer: 'fingerprint',
        reason: `${Math.round(similarity * 100)}% content similarity (MinHash)`,
      });
    }

    return matches;
  }

  /**
   * Layer 3: Check semantic similarity (placeholder - requires embeddings)
   */
  private async checkSemanticSimilarity(
    content: string,
    targetPath: string
  ): Promise<SimilarityMatch[]> {
    // TODO: Implement with embedding service when available
    // For now, return empty - can be enabled with external embedding API
    return [];
  }

  /**
   * Deduplicate matches by path, keeping highest similarity
   */
  private deduplicateMatches(matches: SimilarityMatch[]): SimilarityMatch[] {
    const byPath = new Map<string, SimilarityMatch>();

    for (const match of matches) {
      const existing = byPath.get(match.path);
      if (!existing || match.similarity > existing.similarity) {
        byPath.set(match.path, match);
      }
    }

    return Array.from(byPath.values())
      .sort((a, b) => b.similarity - a.similarity);
  }

  /**
   * Find the best canonical doc to merge into
   */
  private findBestCanonicalTarget(matches: SimilarityMatch[]): string | undefined {
    if (matches.length === 0) return undefined;

    // Prefer high similarity matches
    const highSimilarity = matches.filter(
      m => m.similarity >= this.config.similarityThreshold
    );

    if (highSimilarity.length === 0) return undefined;

    // Prefer fingerprint matches over path matches (more reliable)
    const fingerprintMatch = highSimilarity.find(m => m.detectionLayer === 'fingerprint');
    if (fingerprintMatch) return fingerprintMatch.path;

    // Fall back to highest similarity
    return highSimilarity[0].path;
  }

  /**
   * Determine what merge action to suggest
   */
  private determineMergeAction(
    matches: SimilarityMatch[],
    targetPath: string
  ): DuplicateCheckResult['mergeAction'] {
    if (matches.length === 0) return 'none';

    const maxSimilarity = Math.max(...matches.map(m => m.similarity));

    if (maxSimilarity >= 0.95) return 'merge';  // Near-duplicate
    if (maxSimilarity >= 0.8) return 'update';  // Should update existing
    if (maxSimilarity >= 0.6) return 'link';    // Should link instead
    
    return 'none';
  }
}
