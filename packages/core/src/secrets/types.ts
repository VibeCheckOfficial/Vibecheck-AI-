/**
 * Secrets Detection Type Definitions
 */

// ============================================================================
// Secret Types
// ============================================================================

export type SecretType =
  | 'aws_access_key'
  | 'aws_secret_key'
  | 'github_token'
  | 'github_oauth'
  | 'github_app'
  | 'github_refresh'
  | 'gitlab_token'
  | 'slack_token'
  | 'stripe_live_key'
  | 'stripe_test_key'
  | 'stripe_restricted_key'
  | 'sendgrid_key'
  | 'twilio_key'
  | 'google_api_key'
  | 'openai_key'
  | 'anthropic_key'
  | 'jwt_token'
  | 'private_key'
  | 'ssh_key'
  | 'database_url'
  | 'api_key'
  | 'password'
  | 'bearer_token'
  | 'generic_secret';

export type SecretSeverity = 'critical' | 'high' | 'medium' | 'low';

export type Confidence = 'high' | 'medium' | 'low';

// ============================================================================
// Pattern Definition
// ============================================================================

export interface SecretPattern {
  /** Unique identifier for the pattern */
  id: string;
  /** Type of secret this pattern detects */
  type: SecretType;
  /** Human-readable name */
  name: string;
  /** Regex pattern (without global flag - added by scanner) */
  pattern: RegExp;
  /** Description of what this pattern detects */
  description: string;
  /** Minimum entropy threshold (0 = skip entropy check) */
  minEntropy: number;
  /** Capture group index for the secret value (0 = full match) */
  valueGroup: number;
  /** Default severity for findings of this type */
  severity: SecretSeverity;
}

// ============================================================================
// Detection Results
// ============================================================================

export interface SecretDetection {
  /** Unique ID for this detection */
  id: string;
  /** Pattern that matched */
  patternId: string;
  /** Rule ID (same as patternId for secrets) */
  ruleId: string;
  /** Type of secret detected */
  type: SecretType;
  /** Human-readable name */
  name: string;
  /** Severity of the finding */
  severity: SecretSeverity;
  /** File path (relative to project root) */
  file: string;
  /** Line number (1-indexed) */
  line: number;
  /** Column number (1-indexed) */
  column?: number;
  /** Redacted match for display */
  redactedMatch: string;
  /** Calculated entropy of the secret */
  entropy: number;
  /** Confidence level */
  confidence: Confidence;
  /** Whether this is in a test file */
  isTest: boolean;
  /** Original line content (masked) */
  lineContent?: string;
  /** Recommendation for remediation */
  recommendation?: {
    reason: string;
    remediation: string;
  };
}

export interface SecretScanResult {
  /** Project path scanned */
  projectPath: string;
  /** All detected secrets */
  findings: SecretDetection[];
  /** Scan statistics */
  stats: {
    filesScanned: number;
    linesScanned: number;
    secretsFound: number;
    byType: Partial<Record<SecretType, number>>;
    bySeverity: Record<SecretSeverity, number>;
    durationMs: number;
  };
}

// ============================================================================
// Scanner Options
// ============================================================================

export interface SecretScanOptions {
  /** Paths to scan (relative to project root) */
  paths?: string[];
  /** File patterns to include */
  include?: string[];
  /** File patterns to exclude */
  exclude?: string[];
  /** Enable incremental scanning (only changed files) */
  incremental?: boolean;
  /** Git ref for incremental scanning */
  since?: string;
  /** Scan git history for leaked secrets */
  includeHistory?: boolean;
  /** Number of commits to scan in history */
  historyDepth?: number;
  /** Minimum entropy threshold override */
  minEntropy?: number;
  /** Custom patterns to add */
  customPatterns?: SecretPattern[];
  /** Skip test files entirely (default: true) */
  skipTestFiles?: boolean;
}

// ============================================================================
// Git History Types
// ============================================================================

export interface HistoricalDetection extends SecretDetection {
  /** Git commit hash */
  commit: string;
  /** Commit date */
  commitDate: string;
  /** Commit author */
  author: string;
}

export interface GitHistoryScanResult {
  /** All historical detections */
  findings: HistoricalDetection[];
  /** Summary statistics */
  stats: {
    commitsScanned: number;
    totalSecrets: number;
    byCommit: Map<string, number>;
    byType: Partial<Record<SecretType, number>>;
  };
}

// ============================================================================
// Allowlist Types
// ============================================================================

export interface AllowlistEntry {
  /** SHA256 fingerprint of the allowed secret */
  fingerprint: string;
  /** Reason for allowlisting */
  reason?: string;
  /** When it was added */
  addedAt: string;
  /** Who added it */
  addedBy?: string;
}

// ============================================================================
// Contextual Risk Types
// ============================================================================

export type FileContext = 
  | 'production'
  | 'development'
  | 'test'
  | 'example'
  | 'documentation'
  | 'configuration'
  | 'unknown';

export interface ContextualRiskAdjustment {
  /** Original severity */
  originalSeverity: SecretSeverity;
  /** Adjusted severity */
  adjustedSeverity: SecretSeverity;
  /** File context */
  context: FileContext;
  /** Reason for adjustment */
  reason: string;
}
