/**
 * Learning System Types
 * 
 * Type definitions for the learning and feedback system.
 */

export type IssueStatus = 'open' | 'accepted' | 'false_positive' | 'fixed';

export interface IssueFeedback {
  /** Unique issue identifier */
  id: string;
  /** Rule that generated the finding */
  ruleId: string;
  /** File path where issue was found */
  filePath: string;
  /** Line hash (whitespace-normalized content) for persistence across edits */
  lineHash: string;
  /** Original line number when first detected */
  originalLine: number;
  /** Current status */
  status: IssueStatus;
  /** User-provided reason for status */
  reason?: string;
  /** When the issue was first detected */
  createdAt: number;
  /** When the status was last updated */
  updatedAt: number;
  /** Project identifier */
  projectId?: string;
}

export interface RuleCalibration {
  /** Rule identifier */
  ruleId: string;
  /** Confirmed findings (alpha parameter) */
  alpha: number;
  /** False positives (beta parameter) */
  beta: number;
  /** Calculated confidence (alpha / (alpha + beta)) */
  confidence: number;
  /** Total feedback count */
  totalFeedback: number;
  /** Last update timestamp */
  lastUpdated: number;
}

export interface LearningConfig {
  /** Enable learning system */
  enabled: boolean;
  /** Path to global database */
  globalDbPath: string;
  /** Path to project-specific database */
  projectDbPath: string;
  /** Minimum feedback count before applying calibration */
  minFeedbackThreshold: number;
  /** Prior alpha for Bayesian calibration */
  priorAlpha: number;
  /** Prior beta for Bayesian calibration */
  priorBeta: number;
}

export interface FeedbackStats {
  /** Total issues tracked */
  totalIssues: number;
  /** Issues by status */
  byStatus: Record<IssueStatus, number>;
  /** Issues by rule */
  byRule: Record<string, number>;
  /** Rules with calibration data */
  calibratedRules: number;
  /** Average confidence across rules */
  averageConfidence: number;
}

export interface FindingWithConfidence {
  /** Original finding data */
  finding: unknown;
  /** Calibrated confidence score (0-1) */
  confidence: number;
  /** Whether confidence is from calibration or default */
  calibrated: boolean;
  /** Existing feedback if any */
  existingFeedback?: IssueFeedback;
}

export const DEFAULT_LEARNING_CONFIG: LearningConfig = {
  enabled: true,
  globalDbPath: '~/.config/vibecheck/global.db',
  projectDbPath: '.vibecheck/project.db',
  minFeedbackThreshold: 5,
  priorAlpha: 1.0,
  priorBeta: 1.0,
};

/**
 * Generate a line hash from content
 * Normalizes whitespace for stable hashing across edits
 */
export function generateLineHash(lineContent: string): string {
  // Normalize whitespace
  const normalized = lineContent
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
  
  // Simple hash using string reduce
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  return Math.abs(hash).toString(36);
}

/**
 * Generate a unique issue ID
 */
export function generateIssueId(ruleId: string, filePath: string, lineHash: string): string {
  return `${ruleId}:${filePath}:${lineHash}`.replace(/[^a-zA-Z0-9:._-]/g, '_');
}
