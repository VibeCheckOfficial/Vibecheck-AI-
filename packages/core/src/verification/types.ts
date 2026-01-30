/**
 * Phase 6: Trust System Types
 *
 * Comprehensive type definitions for the multi-source verification system
 * that enables "zero false positives" through evidence chains and confidence calibration.
 */

import type { Claim, ClaimType } from '../firewall/claim-extractor.js';

// ============================================================================
// Verification Sources
// ============================================================================

export type VerificationSource =
  | 'truthpack'
  | 'ast'
  | 'filesystem'
  | 'git'
  | 'package_json'
  | 'typescript_compiler'
  | 'runtime';

export const SOURCE_RELIABILITY: Record<VerificationSource, number> = {
  runtime: 0.99,
  package_json: 0.99,
  typescript_compiler: 0.98,
  truthpack: 0.95,
  ast: 0.90,
  filesystem: 0.85,
  git: 0.80,
} as const;

// ============================================================================
// Evidence Types
// ============================================================================

export interface SourceEvidence {
  source: VerificationSource;
  verified: boolean;
  confidence: number;
  details: Record<string, unknown>;
  timestamp: Date;
  durationMs: number;
  error?: string;
}

export interface EvidenceStep {
  step: number;
  source: VerificationSource;
  claim: string;
  evidence: string;
  supports: boolean;
  confidence: number;
  location?: {
    file: string;
    line?: number;
    column?: number;
  };
  metadata?: Record<string, unknown>;
}

export interface EvidenceChain {
  id: string;
  claimId: string;
  claimType: ClaimType;
  claimValue: string;
  verdict: VerificationVerdict;
  confidence: number;
  chain: EvidenceStep[];
  reasoning: string;
  createdAt: Date;
  durationMs: number;
}

export type VerificationVerdict =
  | 'confirmed'      // High confidence the claim is true
  | 'likely'         // Moderate confidence the claim is true
  | 'uncertain'      // Not enough evidence either way
  | 'unlikely'       // Moderate confidence the claim is false
  | 'dismissed';     // High confidence the claim is false

export const VERDICT_THRESHOLDS = {
  confirmed: 0.9,
  likely: 0.7,
  uncertain: 0.5,
  unlikely: 0.3,
  dismissed: 0.0,
} as const;

// ============================================================================
// Verification Result Types
// ============================================================================

export interface VerificationResult {
  claim: Claim;
  verified: boolean;
  confidence: number;
  sources: SourceEvidence[];
  consensus: boolean;
  discrepancies: string[];
  evidenceChain: EvidenceChain;
  adjustedConfidence?: number;
  adjustmentReason?: string;
}

export interface BatchVerificationResult {
  results: VerificationResult[];
  summary: {
    total: number;
    verified: number;
    unverified: number;
    avgConfidence: number;
    byVerdict: Record<VerificationVerdict, number>;
    bySource: Record<VerificationSource, { checked: number; verified: number }>;
  };
  durationMs: number;
}

// ============================================================================
// Verifier Configuration
// ============================================================================

export interface VerifierConfig {
  /** Minimum number of sources required for consensus */
  requiredSources: number;

  /** Threshold for consensus (0-1) */
  consensusThreshold: number;

  /** Which sources to enable */
  enabledSources: VerificationSource[];

  /** Project root directory */
  projectRoot: string;

  /** Path to truthpack relative to project root */
  truthpackPath: string;

  /** Timeout for each verification source (ms) */
  sourceTimeout: number;

  /** Enable parallel verification */
  parallel: boolean;

  /** Max parallel verifications */
  parallelLimit: number;

  /** Enable caching */
  enableCaching: boolean;

  /** Cache TTL in milliseconds */
  cacheTtlMs: number;

  /** Enable runtime verification (slower but more accurate) */
  enableRuntimeVerification: boolean;

  /** Confidence threshold for auto-pass */
  confidenceThreshold: number;
}

export const DEFAULT_VERIFIER_CONFIG: VerifierConfig = {
  requiredSources: 2,
  consensusThreshold: 0.7,
  enabledSources: ['truthpack', 'filesystem', 'package_json', 'ast'],
  projectRoot: process.cwd(),
  truthpackPath: '.vibecheck/truthpack',
  sourceTimeout: 5000,
  parallel: true,
  parallelLimit: 10,
  enableCaching: true,
  cacheTtlMs: 5 * 60 * 1000,
  enableRuntimeVerification: false,
  confidenceThreshold: 0.8,
};

// ============================================================================
// Calibration Types
// ============================================================================

export interface CalibrationDataPoint {
  reportedConfidence: number;
  wasCorrect: boolean;
  claimType: ClaimType;
  source: VerificationSource;
  timestamp: Date;
}

export interface CalibrationBucket {
  minConfidence: number;
  maxConfidence: number;
  midpoint: number;
  total: number;
  truePositives: number;
  falsePositives: number;
  actualAccuracy: number;
}

export interface CalibrationModel {
  buckets: CalibrationBucket[];
  overallAccuracy: number;
  brier: number; // Brier score (lower is better)
  calibrationError: number; // Expected Calibration Error
  lastUpdated: Date;
  sampleSize: number;
}

export interface CalibrationConfig {
  /** Bucket boundaries for calibration */
  bucketBoundaries: number[];

  /** Minimum samples per bucket for reliable calibration */
  minSamplesPerBucket: number;

  /** Path to store calibration data */
  dataPath: string;

  /** Auto-save interval in milliseconds */
  autoSaveInterval: number;
}

export const DEFAULT_CALIBRATION_CONFIG: CalibrationConfig = {
  bucketBoundaries: [0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 1.0],
  minSamplesPerBucket: 10,
  dataPath: '.vibecheck/calibration.json',
  autoSaveInterval: 60000,
};

// ============================================================================
// Feedback Types (for learning)
// ============================================================================

export type FeedbackType = 'true_positive' | 'false_positive' | 'true_negative' | 'false_negative';

export interface VerificationFeedback {
  id: string;
  claimId: string;
  verificationResultId: string;
  feedback: FeedbackType;
  reportedConfidence: number;
  actualOutcome: boolean;
  notes?: string;
  providedBy?: string;
  timestamp: Date;
}

// ============================================================================
// Project Profile Types (for learning)
// ============================================================================

export interface ProjectProfile {
  projectId: string;
  projectRoot: string;

  /** Learned suppression patterns */
  suppressedPatterns: Array<{
    pattern: string;
    claimType: ClaimType;
    context?: string;
    suppressedAt: Date;
    suppressedBy?: string;
    reason?: string;
  }>;

  /** Statistics for confidence calibration */
  stats: {
    totalVerifications: number;
    confirmedTrue: number;
    confirmedFalse: number;
    byClaimType: Record<ClaimType, { true: number; false: number }>;
    bySource: Record<VerificationSource, { true: number; false: number }>;
  };

  /** Learned confidence adjustments */
  confidenceAdjustments: Record<ClaimType, number>;

  /** Last updated timestamp */
  lastUpdated: Date;
}

// ============================================================================
// Utility Types
// ============================================================================

export interface VerificationContext {
  claim: Claim;
  projectRoot: string;
  truthpackPath: string;
  fileContext?: {
    filePath: string;
    content?: string;
  };
}

export interface SourceVerifier {
  name: VerificationSource;
  verify: (context: VerificationContext) => Promise<SourceEvidence>;
  supports: (claimType: ClaimType) => boolean;
}
