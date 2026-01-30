/**
 * Ship Score Types for shared-types
 * 
 * Re-exports Ship Score types for use across packages
 * 
 * @module ship-score
 */

/**
 * Ship Score verdict indicating deployment readiness
 */
export type ShipVerdict = 'SHIP' | 'WARN' | 'BLOCK';

/**
 * Individual dimension scores (0-17 each for 6 dimensions = 100 total)
 */
export interface ShipScoreDimensions {
  /** Risk from unverified routes/env vars */
  ghostRisk: number;
  /** Percentage of routes with proper auth gating */
  authCoverage: number;
  /** Environment variable validation status */
  envIntegrity: number;
  /** Routes tested via reality mode */
  runtimeProof: number;
  /** API contracts alignment with implementation */
  contractsAlignment: number;
  /** Mock/fake data cleanliness (no hardcoded credentials, mock data in prod) */
  mockDataCleanliness: number;
}

/**
 * Ship Score breakdown
 */
export interface ShipScoreBreakdown {
  /** Total score (0-100) */
  total: number;
  /** Individual dimension scores */
  dimensions: ShipScoreDimensions;
  /** Deployment verdict */
  verdict: ShipVerdict;
}

/**
 * Ship Score with metrics
 */
export interface ShipScoreWithMetrics extends ShipScoreBreakdown {
  /** Raw metrics used in calculation */
  metrics: ShipScoreMetrics;
}

/**
 * Raw metrics used in score calculation
 */
export interface ShipScoreMetrics {
  // Ghost Risk metrics
  totalRoutes: number;
  verifiedRoutes: number;
  ghostRoutes: number;
  totalEnvVars: number;
  verifiedEnvVars: number;
  ghostEnvVars: number;
  
  // Auth Coverage metrics
  protectedRoutes: number;
  unprotectedSensitiveRoutes: number;
  authConfigured: boolean;
  
  // Env Integrity metrics
  requiredEnvVars: number;
  presentEnvVars: number;
  missingRequiredEnvVars: number;
  sensitiveEnvVarsExposed: number;
  
  // Runtime Proof metrics
  routesTestedInReality: number;
  realityModeRan: boolean;
  realityPassRate: number;
  
  // Contracts Alignment metrics
  totalContracts: number;
  alignedContracts: number;
  driftedContracts: number;
  
  // Mock Data Cleanliness metrics
  mockDataFindings: number;
  credentialFindings: number;
  fakeAuthFindings: number;
  debugCodeFindings: number;
  placeholderFindings: number;
}

// ============================================================================
// Mock Detector Types
// ============================================================================

/**
 * Mock detector severity levels
 */
export type MockSeverity = 'critical' | 'high' | 'medium' | 'low';

/**
 * Mock detector categories
 */
export type MockCategory =
  | 'credentials'
  | 'fake-auth'
  | 'mock-data'
  | 'placeholder-content'
  | 'fake-user-data'
  | 'stub-response'
  | 'debug-code'
  | 'hardcoded-config'
  | 'placeholder-ids'
  | 'fake-dates'
  | 'test-in-prod'
  | 'pii-exposure'
  | 'financial-mock'
  | 'healthcare-mock';

/**
 * Confidence level for mock detection findings
 */
export type MockConfidence = 'certain' | 'likely' | 'possible';

/**
 * Mock detection finding
 */
export interface MockFinding {
  id: string;
  file: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  code: string;
  category: MockCategory;
  severity: MockSeverity;
  description: string;
  fix?: string;
  autoFixable: boolean;
  confidence: MockConfidence;
  tags?: string[];
  cwe?: string;
}

/**
 * Mock detection scan summary
 */
export interface MockScanSummary {
  total: number;
  bySeverity: Record<MockSeverity, number>;
  byCategory: Record<MockCategory, number>;
  autoFixable: number;
}

/**
 * Mock detection scan result
 */
export interface MockScanResult {
  findings: MockFinding[];
  summary: MockScanSummary;
  scannedFiles: number;
  duration: number;
  timestamp: string;
}
