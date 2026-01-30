/**
 * Fix Missions Types
 * 
 * Defines the schema for grouping findings into actionable "missions"
 * with payoff labels and verification steps.
 * 
 * @module missions
 */

// ============================================================================
// Mission Types
// ============================================================================

/**
 * Payoff labels for missions
 */
export type MissionPayoffLabel = 
  | 'Unblock Ship'
  | 'Prevent Prod Crash'
  | 'Stop Ghost Routes'
  | 'Secure Auth'
  | 'Fix Env Drift'
  | 'Align Contracts'
  | 'Clean Codebase';

/**
 * Mission impact level
 */
export type MissionImpact = 'critical' | 'high' | 'medium' | 'low';

/**
 * Mission status
 */
export type MissionStatus = 
  | 'pending'
  | 'in_progress'
  | 'applied'
  | 'verified'
  | 'rolled_back'
  | 'failed';

/**
 * A Fix Mission grouping related findings
 */
export interface FixMission {
  /** Unique mission identifier */
  id: string;
  
  /** Human-readable mission name */
  name: string;
  
  /** Payoff label for quick understanding */
  payoffLabel: MissionPayoffLabel;
  
  /** Detailed description of what this mission fixes */
  description: string;
  
  /** Impact level */
  impact: MissionImpact;
  
  /** Mission status */
  status: MissionStatus;
  
  /** Why this mission matters */
  whyItMatters: string;
  
  /** IDs of findings addressed by this mission */
  findingIds: string[];
  
  /** Number of findings */
  findingCount: number;
  
  /** Steps to complete the mission */
  steps: MissionStep[];
  
  /** Proof of fix */
  proof: MissionProof;
  
  /** Estimated time to complete (in minutes) */
  estimatedMinutes?: number;
  
  /** Confidence score (0-1) */
  confidence: number;
  
  /** Created timestamp */
  createdAt: string;
  
  /** Last updated timestamp */
  updatedAt: string;
}

/**
 * A step in a mission
 */
export interface MissionStep {
  /** Step identifier */
  id: string;
  
  /** Step sequence number */
  sequence: number;
  
  /** File to modify */
  file: string;
  
  /** Line number */
  line?: number;
  
  /** Description of the change */
  description: string;
  
  /** Unified diff patch */
  patch: string;
  
  /** Rollback ID for undoing */
  rollbackId: string;
  
  /** Confidence score for this fix */
  confidence: number;
  
  /** Whether this step has been applied */
  applied: boolean;
  
  /** Error if application failed */
  error?: string;
}

/**
 * Proof that mission fixed the issue
 */
export interface MissionProof {
  /** Ship Score before applying mission */
  beforeScore?: number;
  
  /** Ship Score after applying mission */
  afterScore?: number;
  
  /** Score improvement */
  improvement?: number;
  
  /** Verification command to run */
  verificationCommand: string;
  
  /** Whether verification passed */
  verified: boolean;
  
  /** Verification timestamp */
  verifiedAt?: string;
  
  /** Verification output */
  verificationOutput?: string;
}

// ============================================================================
// Mission Grouping Input
// ============================================================================

/**
 * Finding input for mission grouping
 */
export interface MissionFinding {
  id: string;
  type: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  file?: string;
  line?: number;
  category: string;
  autoFixable: boolean;
  suggestion?: string;
}

/**
 * Options for grouping findings into missions
 */
export interface MissionGroupingOptions {
  /** Maximum findings per mission */
  maxFindingsPerMission: number;
  
  /** Minimum confidence threshold for inclusion */
  minConfidence: number;
  
  /** Group by file proximity */
  groupByFile: boolean;
  
  /** Group by category */
  groupByCategory: boolean;
  
  /** Prioritize ship blockers */
  prioritizeBlockers: boolean;
}

/**
 * Default grouping options
 */
export const DEFAULT_GROUPING_OPTIONS: MissionGroupingOptions = {
  maxFindingsPerMission: 10,
  minConfidence: 0.5,
  groupByFile: true,
  groupByCategory: true,
  prioritizeBlockers: true,
};

// ============================================================================
// Mission Summary
// ============================================================================

/**
 * Summary of all missions for a project
 */
export interface MissionsSummary {
  /** Total missions */
  total: number;
  
  /** Missions by status */
  byStatus: Record<MissionStatus, number>;
  
  /** Missions by impact */
  byImpact: Record<MissionImpact, number>;
  
  /** Total findings addressed */
  totalFindings: number;
  
  /** Total estimated minutes */
  totalEstimatedMinutes: number;
  
  /** Average confidence */
  averageConfidence: number;
}
