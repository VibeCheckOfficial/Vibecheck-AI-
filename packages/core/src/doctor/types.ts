/**
 * Doctor Type Definitions
 */

// ============================================================================
// Check Types
// ============================================================================

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'skip';

export interface HealthCheck {
  /** Check identifier */
  id: string;
  /** Display name */
  name: string;
  /** Description of what this check verifies */
  description: string;
  /** Check category */
  category: CheckCategory;
  /** Whether check is required */
  required: boolean;
  /** Check function */
  check: () => Promise<CheckResult>;
}

export interface CheckResult {
  /** Check status */
  status: CheckStatus;
  /** Status message */
  message: string;
  /** Additional details */
  details?: string;
  /** Fix available */
  fixAvailable?: boolean;
  /** Fix identifier */
  fixId?: string;
  /** Time taken in ms */
  duration?: number;
}

export type CheckCategory =
  | 'environment'
  | 'dependencies'
  | 'configuration'
  | 'authentication'
  | 'permissions';

// ============================================================================
// Fix Types
// ============================================================================

export interface Fix {
  /** Fix identifier */
  id: string;
  /** Display name */
  name: string;
  /** Description */
  description: string;
  /** Fix function */
  apply: () => Promise<FixResult>;
  /** Preview of what will be changed */
  preview?: () => Promise<string>;
}

export interface FixResult {
  /** Whether fix was successful */
  success: boolean;
  /** Result message */
  message: string;
  /** What was changed */
  changes?: string[];
}

// ============================================================================
// Doctor Report Types
// ============================================================================

export interface DoctorReport {
  /** Overall status */
  status: 'healthy' | 'warnings' | 'unhealthy';
  /** All check results */
  checks: DoctorCheckResult[];
  /** Summary statistics */
  summary: DoctorSummary;
  /** Generated at timestamp */
  timestamp: string;
  /** Total duration in ms */
  totalDuration: number;
}

export interface DoctorCheckResult {
  /** Check definition */
  check: Omit<HealthCheck, 'check'>;
  /** Result */
  result: CheckResult;
}

export interface DoctorSummary {
  total: number;
  passed: number;
  warned: number;
  failed: number;
  skipped: number;
}

// ============================================================================
// Constants
// ============================================================================

export const STATUS_ICONS: Record<CheckStatus, string> = {
  pass: '✓',
  warn: '⚠',
  fail: '✗',
  skip: '○',
};

export const STATUS_COLORS: Record<CheckStatus, string> = {
  pass: 'green',
  warn: 'yellow',
  fail: 'red',
  skip: 'gray',
};
