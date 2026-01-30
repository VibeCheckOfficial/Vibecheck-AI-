/**
 * Reality Receipt Types
 * 
 * Defines the schema for signed "Reality Receipts" - shareable artifacts
 * that prove code quality and deployment readiness.
 * 
 * @module receipts
 */

import type { ShipScoreBreakdown as ShipScoreBreakdownType } from './ship-score.js';

// ============================================================================
// Receipt Types
// ============================================================================

/**
 * A signed Reality Receipt documenting a verification run
 */
export interface RealityReceipt {
  /** Unique receipt identifier */
  id: string;
  
  /** ISO timestamp when receipt was generated */
  timestamp: string;
  
  /** Version of the receipt schema */
  version: string;
  
  /** Git commit hash at time of verification */
  commitHash: string;
  
  /** Git branch name */
  branch: string;
  
  /** Project identifier */
  projectId: string;
  
  /** Project name */
  projectName?: string;
  
  /** Coverage metrics */
  coverage: ReceiptCoverage;
  
  /** Ship Score breakdown */
  shipScore: ShipScoreBreakdownType;
  
  /** Artifact references */
  artifacts: ReceiptArtifacts;
  
  /** Failures encountered */
  failures: ReceiptFailure[];
  
  /** Environment information */
  environment: ReceiptEnvironment;
  
  /** Digital signature for verification */
  signature: string;
  
  /** Signature algorithm used */
  signatureAlgorithm: 'hmac-sha256' | 'ed25519';
}

/**
 * Coverage metrics for the receipt
 */
export interface ReceiptCoverage {
  /** Number of routes tested */
  routesTested: number;
  
  /** Total number of routes */
  routesTotal: number;
  
  /** Route coverage percentage */
  routeCoveragePercent: number;
  
  /** Number of env vars verified */
  envVarsVerified: number;
  
  /** Total env vars defined */
  envVarsTotal: number;
  
  /** Number of auth flows tested */
  authFlowsTested: number;
  
  /** Number of contracts validated */
  contractsValidated: number;
  
  /** Reality mode ran */
  realityModeRan: boolean;
  
  /** Chaos mode ran */
  chaosModeRan: boolean;
}

/**
 * Artifact references in the receipt
 */
export interface ReceiptArtifacts {
  /** Screenshot file paths */
  screenshots: string[];
  
  /** HAR (HTTP Archive) file paths */
  harFiles: string[];
  
  /** Diff file paths */
  diffs: string[];
  
  /** Video recording paths */
  videos?: string[];
  
  /** Trace file paths */
  traces?: string[];
  
  /** Full report path */
  reportPath?: string;
}

/**
 * A failure encountered during verification
 */
export interface ReceiptFailure {
  /** Failure type */
  type: 'route_failure' | 'auth_failure' | 'env_failure' | 'contract_failure' | 'runtime_error' | 'timeout';
  
  /** Severity level */
  severity: 'critical' | 'high' | 'medium' | 'low';
  
  /** Route or resource that failed */
  target: string;
  
  /** Failure message */
  message: string;
  
  /** Expected value or behavior */
  expected?: string;
  
  /** Actual value or behavior */
  actual?: string;
  
  /** Screenshot at time of failure */
  screenshot?: string;
  
  /** Stack trace if available */
  stackTrace?: string;
  
  /** Timestamp of failure */
  timestamp: string;
}

/**
 * Environment information for the receipt
 */
export interface ReceiptEnvironment {
  /** Operating system */
  os: string;
  
  /** Node.js version */
  nodeVersion: string;
  
  /** VibeCheck CLI version */
  vibecheckVersion: string;
  
  /** Browser used for reality mode */
  browser?: string;
  
  /** Browser version */
  browserVersion?: string;
  
  /** CI/CD platform if applicable */
  ciPlatform?: string;
  
  /** CI build ID */
  ciBuildId?: string;
  
  /** CI run URL */
  ciRunUrl?: string;
}

// ============================================================================
// PR Comment Types
// ============================================================================

/**
 * Data for GitHub PR comment
 */
export interface PRCommentData {
  /** Ship Score total */
  score: number;
  
  /** Verdict */
  verdict: 'SHIP' | 'WARN' | 'BLOCK';
  
  /** Dimension breakdown */
  dimensions: Array<{
    name: string;
    score: number;
    maxScore: number;
  }>;
  
  /** Top blockers */
  blockers: Array<{
    type: string;
    target: string;
    message: string;
  }>;
  
  /** Link to full report */
  reportUrl?: string;
  
  /** Receipt ID */
  receiptId: string;
  
  /** Commit SHA */
  commitSha: string;
  
  /** Branch name */
  branch: string;
}

/**
 * GitHub Check status
 */
export interface GitHubCheckStatus {
  /** Check name */
  name: string;
  
  /** Check conclusion */
  conclusion: 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'action_required';
  
  /** Summary title */
  title: string;
  
  /** Summary text */
  summary: string;
  
  /** Detailed text */
  text?: string;
  
  /** Annotations for specific lines */
  annotations?: GitHubAnnotation[];
}

/**
 * GitHub annotation for a specific file/line
 */
export interface GitHubAnnotation {
  /** File path */
  path: string;
  
  /** Start line */
  startLine: number;
  
  /** End line */
  endLine?: number;
  
  /** Annotation level */
  annotationLevel: 'notice' | 'warning' | 'failure';
  
  /** Annotation message */
  message: string;
  
  /** Annotation title */
  title?: string;
}

// ============================================================================
// Badge Types
// ============================================================================

/**
 * Badge status for README
 */
export type BadgeStatus = 'SHIP' | 'WARN' | 'BLOCK';

/**
 * Badge configuration
 */
export interface BadgeConfig {
  /** Badge style */
  style: 'flat' | 'flat-square' | 'plastic' | 'for-the-badge';
  
  /** Include score number */
  includeScore: boolean;
  
  /** Custom label */
  label?: string;
  
  /** Show verified checkmark (Pro feature) */
  verified?: boolean;
}

/**
 * Badge generation result
 */
export interface BadgeResult {
  /** SVG content */
  svg: string;
  
  /** Markdown embed code */
  markdown: string;
  
  /** HTML embed code */
  html: string;
  
  /** Direct URL to badge */
  url: string;
}

// ============================================================================
// Receipt Generation Input
// ============================================================================

/**
 * Input for generating a receipt
 */
export interface ReceiptGenerationInput {
  /** Project path */
  projectPath: string;
  
  /** Project ID */
  projectId: string;
  
  /** Project name */
  projectName?: string;
  
  /** Ship Score result */
  shipScore: ShipScoreBreakdownType;
  
  /** Scan results */
  scanResults?: {
    routes: number;
    envVars: number;
    authPatterns: number;
    contracts: number;
  };
  
  /** Reality mode results */
  realityResults?: {
    routesTested: number;
    routesPassed: number;
    routesFailed: number;
  };
  
  /** Chaos mode results */
  chaosResults?: {
    actionsPerformed: number;
    issuesFound: number;
  };
  
  /** Failures encountered */
  failures?: ReceiptFailure[];
  
  /** Artifact paths */
  artifactPaths?: Partial<ReceiptArtifacts>;
  
  /** Signing secret (HMAC key) */
  signingSecret?: string;
}

// ============================================================================
// Receipt Verification
// ============================================================================

/**
 * Result of verifying a receipt signature
 */
export interface ReceiptVerificationResult {
  /** Whether signature is valid */
  valid: boolean;
  
  /** Error message if invalid */
  error?: string;
  
  /** Timestamp of verification */
  verifiedAt: string;
}
