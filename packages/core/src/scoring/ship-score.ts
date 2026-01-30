/**
 * Ship Score Calculator
 * 
 * Calculates a 0-100 score representing deployment readiness
 * based on 6 key dimensions: Ghost Risk, Auth Coverage, Env Integrity,
 * Runtime Proof, Contracts Alignment, and Mock Data Cleanliness.
 * 
 * @module scoring/ship-score
 */

import type { TruthpackData, RouteDefinition, EnvVarDefinition } from '@repo/shared-types';
import type { MockDetectorScanResult } from '../scanners/mock-detector/index.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Ship Score verdict indicating deployment readiness
 */
export type ShipVerdict = 'SHIP' | 'WARN' | 'BLOCK';

/**
 * Individual dimension scores (0-16.67 each for 6 dimensions = 100 total)
 */
export interface ShipScoreDimensions {
  /** Risk from unverified routes/env vars (inverted - lower ghost count = higher score) */
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
 * Detailed breakdown of Ship Score calculation
 */
export interface ShipScoreBreakdown {
  /** Total score (0-100) */
  total: number;
  /** Individual dimension scores */
  dimensions: ShipScoreDimensions;
  /** Deployment verdict */
  verdict: ShipVerdict;
  /** Detailed metrics used in calculation */
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

/**
 * Input data for Ship Score calculation
 */
export interface ShipScoreInput {
  /** Truthpack data from scan */
  truthpack: TruthpackData;
  /** Findings from check/validate commands */
  findings?: ShipScoreFinding[];
  /** Reality mode results if available */
  realityResults?: RealityModeResults;
  /** Drift detection results */
  driftResults?: DriftResults;
  /** Mock data detection results */
  mockDetectionResults?: MockDetectorScanResult;
}

/**
 * Simplified finding for score calculation
 */
export interface ShipScoreFinding {
  type: string;
  severity: 'error' | 'warning' | 'info';
  category: 'ghost_route' | 'ghost_env' | 'auth_drift' | 'contract_violation' | 'env_missing' | 'other';
  file?: string;
  message: string;
  autoFixable?: boolean;
}

/**
 * Reality mode test results
 */
export interface RealityModeResults {
  ran: boolean;
  routesTested: number;
  routesPassed: number;
  routesFailed: number;
  coverage: number;
}

/**
 * Drift detection results
 */
export interface DriftResults {
  routeDrifts: number;
  envDrifts: number;
  authDrifts: number;
  contractDrifts: number;
}

// ============================================================================
// Constants
// ============================================================================

/** Maximum score per dimension (6 dimensions * ~16.67 = 100) */
const MAX_DIMENSION_SCORE = 17; // Slightly higher to allow for rounding to 100

/** Score thresholds for verdicts */
const VERDICT_THRESHOLDS = {
  SHIP: 80,
  WARN: 60,
} as const;

/** Weights for different issue types in ghost risk calculation */
const GHOST_WEIGHTS = {
  ROUTE: 2,
  ENV_VAR: 1,
} as const;

/** Sensitive route patterns that require auth */
const SENSITIVE_ROUTE_PATTERNS = [
  /\/api\/admin/i,
  /\/api\/users?\/(?!public)/i,
  /\/api\/auth/i,
  /\/api\/billing/i,
  /\/api\/settings/i,
  /\/api\/private/i,
  /\/api\/internal/i,
  /\/dashboard/i,
  /\/admin/i,
];

// ============================================================================
// Score Calculator Class
// ============================================================================

/**
 * Ship Score Calculator
 * 
 * Calculates deployment readiness score based on multiple dimensions.
 * 
 * @example
 * ```typescript
 * const calculator = new ShipScoreCalculator();
 * const score = calculator.calculate({
 *   truthpack: myTruthpack,
 *   findings: myFindings,
 * });
 * console.log(`Ship Score: ${score.total}/100 - ${score.verdict}`);
 * ```
 */
export class ShipScoreCalculator {
  /**
   * Calculate the Ship Score from input data
   */
  calculate(input: ShipScoreInput): ShipScoreBreakdown {
    const metrics = this.extractMetrics(input);
    const dimensions = this.calculateDimensions(metrics);
    const total = this.calculateTotal(dimensions);
    const verdict = this.determineVerdict(total, metrics);

    return {
      total,
      dimensions,
      verdict,
      metrics,
    };
  }

  /**
   * Extract raw metrics from input data
   */
  private extractMetrics(input: ShipScoreInput): ShipScoreMetrics {
    const { truthpack, findings = [], realityResults, driftResults, mockDetectionResults } = input;

    // Count routes and identify ghost routes
    const routes = truthpack.routes || [];
    const ghostRouteFindings = findings.filter(f => f.category === 'ghost_route');
    const ghostRoutes = ghostRouteFindings.length;
    const verifiedRoutes = routes.length - ghostRoutes;

    // Count env vars and identify ghost env vars
    const envVars = truthpack.env || [];
    const ghostEnvFindings = findings.filter(f => f.category === 'ghost_env');
    const ghostEnvVars = ghostEnvFindings.length;
    const verifiedEnvVars = envVars.length - ghostEnvVars;

    // Auth coverage analysis
    const authConfig = truthpack.auth || {};
    const protectedRoutes = this.countProtectedRoutes(routes, authConfig);
    const sensitivePaths = routes.filter(r => this.isSensitiveRoute(r.path));
    const unprotectedSensitive = sensitivePaths.filter(r => !this.isRouteProtected(r, authConfig)).length;

    // Env integrity analysis
    const requiredEnvVars = envVars.filter(e => e.required);
    const missingEnvFindings = findings.filter(f => f.category === 'env_missing');
    const missingRequiredEnvVars = missingEnvFindings.length;
    const sensitiveExposed = envVars.filter(e => e.sensitive && !e.name.includes('SECRET')).length;

    // Contracts analysis
    const contracts = truthpack.contracts || [];
    const contractViolations = findings.filter(f => f.category === 'contract_violation');
    const driftedContracts = driftResults?.contractDrifts || contractViolations.length;

    // Mock data analysis
    const mockByCategory = mockDetectionResults?.summary.byCategory || {};
    const credentialFindings = (mockByCategory['credentials'] || 0) + (mockByCategory['fake-auth'] || 0);
    const fakeAuthFindings = mockByCategory['fake-auth'] || 0;
    const debugCodeFindings = mockByCategory['debug-code'] || 0;
    const placeholderFindings = 
      (mockByCategory['placeholder-content'] || 0) + 
      (mockByCategory['mock-data'] || 0) +
      (mockByCategory['fake-user-data'] || 0);

    return {
      // Ghost Risk
      totalRoutes: routes.length,
      verifiedRoutes: Math.max(0, verifiedRoutes),
      ghostRoutes,
      totalEnvVars: envVars.length,
      verifiedEnvVars: Math.max(0, verifiedEnvVars),
      ghostEnvVars,

      // Auth Coverage
      protectedRoutes,
      unprotectedSensitiveRoutes: unprotectedSensitive,
      authConfigured: Boolean(authConfig.providers?.length || authConfig.middleware?.length),

      // Env Integrity
      requiredEnvVars: requiredEnvVars.length,
      presentEnvVars: requiredEnvVars.length - missingRequiredEnvVars,
      missingRequiredEnvVars,
      sensitiveEnvVarsExposed: sensitiveExposed,

      // Runtime Proof
      routesTestedInReality: realityResults?.routesTested || 0,
      realityModeRan: realityResults?.ran || false,
      realityPassRate: realityResults ? (realityResults.routesPassed / Math.max(1, realityResults.routesTested)) : 0,

      // Contracts
      totalContracts: contracts.length,
      alignedContracts: contracts.length - driftedContracts,
      driftedContracts,

      // Mock Data Cleanliness
      mockDataFindings: mockDetectionResults?.summary.total || 0,
      credentialFindings,
      fakeAuthFindings,
      debugCodeFindings,
      placeholderFindings,
    };
  }

  /**
   * Calculate individual dimension scores
   */
  private calculateDimensions(metrics: ShipScoreMetrics): ShipScoreDimensions {
    return {
      ghostRisk: this.calculateGhostRisk(metrics),
      authCoverage: this.calculateAuthCoverage(metrics),
      envIntegrity: this.calculateEnvIntegrity(metrics),
      runtimeProof: this.calculateRuntimeProof(metrics),
      contractsAlignment: this.calculateContractsAlignment(metrics),
      mockDataCleanliness: this.calculateMockDataCleanliness(metrics),
    };
  }

  /**
   * Calculate Ghost Risk score (0-20)
   * Higher score = fewer ghost routes/env vars
   */
  private calculateGhostRisk(metrics: ShipScoreMetrics): number {
    const totalItems = metrics.totalRoutes + metrics.totalEnvVars;
    if (totalItems === 0) return MAX_DIMENSION_SCORE;

    const ghostPenalty = 
      (metrics.ghostRoutes * GHOST_WEIGHTS.ROUTE) + 
      (metrics.ghostEnvVars * GHOST_WEIGHTS.ENV_VAR);

    const maxPenalty = 
      (metrics.totalRoutes * GHOST_WEIGHTS.ROUTE) + 
      (metrics.totalEnvVars * GHOST_WEIGHTS.ENV_VAR);

    if (maxPenalty === 0) return MAX_DIMENSION_SCORE;

    const verificationRate = 1 - (ghostPenalty / maxPenalty);
    return Math.round(verificationRate * MAX_DIMENSION_SCORE);
  }

  /**
   * Calculate Auth Coverage score (0-20)
   * Higher score = better auth coverage on sensitive routes
   */
  private calculateAuthCoverage(metrics: ShipScoreMetrics): number {
    // No auth configured is a significant penalty
    if (!metrics.authConfigured && metrics.totalRoutes > 0) {
      return Math.round(MAX_DIMENSION_SCORE * 0.5);
    }

    if (metrics.totalRoutes === 0) return MAX_DIMENSION_SCORE;

    // Calculate base coverage
    const coverageRate = metrics.protectedRoutes / metrics.totalRoutes;
    let score = coverageRate * MAX_DIMENSION_SCORE;

    // Heavy penalty for unprotected sensitive routes
    const sensitivePenalty = metrics.unprotectedSensitiveRoutes * 3;
    score = Math.max(0, score - sensitivePenalty);

    return Math.round(score);
  }

  /**
   * Calculate Env Integrity score (0-20)
   * Higher score = all required vars present, no exposed secrets
   */
  private calculateEnvIntegrity(metrics: ShipScoreMetrics): number {
    if (metrics.requiredEnvVars === 0 && metrics.totalEnvVars === 0) {
      return MAX_DIMENSION_SCORE;
    }

    let score = MAX_DIMENSION_SCORE;

    // Penalize missing required env vars heavily
    if (metrics.requiredEnvVars > 0) {
      const presenceRate = metrics.presentEnvVars / metrics.requiredEnvVars;
      score = presenceRate * MAX_DIMENSION_SCORE;
    }

    // Penalize exposed sensitive vars
    score -= metrics.sensitiveEnvVarsExposed * 2;

    return Math.max(0, Math.round(score));
  }

  /**
   * Calculate Runtime Proof score (0-20)
   * Higher score = more routes tested in reality mode with passing results
   */
  private calculateRuntimeProof(metrics: ShipScoreMetrics): number {
    // If reality mode hasn't run, give partial credit based on other factors
    if (!metrics.realityModeRan) {
      // Give 8/20 (40%) if reality mode hasn't run - it's not a blocker but reduces confidence
      return 8;
    }

    if (metrics.totalRoutes === 0) return MAX_DIMENSION_SCORE;

    // Calculate coverage (routes tested / total routes)
    const coverageRate = metrics.routesTestedInReality / metrics.totalRoutes;
    
    // Combine coverage with pass rate
    const score = (coverageRate * 0.5 + metrics.realityPassRate * 0.5) * MAX_DIMENSION_SCORE;

    return Math.round(score);
  }

  /**
   * Calculate Contracts Alignment score (0-17)
   * Higher score = contracts match implementation
   */
  private calculateContractsAlignment(metrics: ShipScoreMetrics): number {
    if (metrics.totalContracts === 0) {
      // No contracts defined - neutral, give moderate score
      return Math.round(MAX_DIMENSION_SCORE * 0.75);
    }

    const alignmentRate = metrics.alignedContracts / metrics.totalContracts;
    return Math.round(alignmentRate * MAX_DIMENSION_SCORE);
  }

  /**
   * Calculate Mock Data Cleanliness score (0-17)
   * Higher score = no mock data, fake credentials, or debug code in production
   */
  private calculateMockDataCleanliness(metrics: ShipScoreMetrics): number {
    // If no mock data was scanned (mock detection disabled), give full score
    if (metrics.mockDataFindings === 0) {
      return MAX_DIMENSION_SCORE;
    }

    let score = MAX_DIMENSION_SCORE;

    // Credentials are critical - heavy penalty
    score -= metrics.credentialFindings * 5;

    // Fake auth is critical
    score -= metrics.fakeAuthFindings * 4;

    // Debug code is moderate
    score -= metrics.debugCodeFindings * 2;

    // Placeholder content is light penalty
    score -= metrics.placeholderFindings * 1;

    return Math.max(0, Math.round(score));
  }

  /**
   * Calculate total score from dimensions
   */
  private calculateTotal(dimensions: ShipScoreDimensions): number {
    const total = (
      dimensions.ghostRisk +
      dimensions.authCoverage +
      dimensions.envIntegrity +
      dimensions.runtimeProof +
      dimensions.contractsAlignment +
      dimensions.mockDataCleanliness
    );
    // Cap at 100
    return Math.min(100, total);
  }

  /**
   * Determine verdict based on score and critical issues
   */
  private determineVerdict(total: number, metrics: ShipScoreMetrics): ShipVerdict {
    // Critical blockers that force BLOCK regardless of score
    if (metrics.missingRequiredEnvVars > 0) return 'BLOCK';
    if (metrics.unprotectedSensitiveRoutes > 2) return 'BLOCK';
    if (metrics.ghostRoutes > 5) return 'BLOCK';
    
    // Mock data critical blockers - credentials and fake auth
    if (metrics.credentialFindings > 0) return 'BLOCK';
    if (metrics.fakeAuthFindings > 0) return 'BLOCK';

    // Score-based verdict
    if (total >= VERDICT_THRESHOLDS.SHIP) return 'SHIP';
    if (total >= VERDICT_THRESHOLDS.WARN) return 'WARN';
    return 'BLOCK';
  }

  /**
   * Count routes that have auth protection
   */
  private countProtectedRoutes(routes: RouteDefinition[], authConfig: TruthpackData['auth']): number {
    const protectedPaths = authConfig?.protectedRoutes || [];
    
    return routes.filter(route => {
      // Check explicit auth on route
      if (route.auth?.required) return true;
      
      // Check if route matches protected patterns
      if (protectedPaths.some(pattern => this.matchesPattern(route.path, pattern))) {
        return true;
      }

      // Check middleware
      if (route.middleware?.some(m => 
        m.toLowerCase().includes('auth') || 
        m.toLowerCase().includes('protect') ||
        m.toLowerCase().includes('guard')
      )) {
        return true;
      }

      return false;
    }).length;
  }

  /**
   * Check if a route path is sensitive and should require auth
   */
  private isSensitiveRoute(path: string): boolean {
    return SENSITIVE_ROUTE_PATTERNS.some(pattern => pattern.test(path));
  }

  /**
   * Check if a specific route is protected
   */
  private isRouteProtected(route: RouteDefinition, authConfig: TruthpackData['auth']): boolean {
    if (route.auth?.required) return true;
    
    const protectedPaths = authConfig?.protectedRoutes || [];
    if (protectedPaths.some(pattern => this.matchesPattern(route.path, pattern))) {
      return true;
    }

    if (route.middleware?.some(m => 
      m.toLowerCase().includes('auth') || 
      m.toLowerCase().includes('protect')
    )) {
      return true;
    }

    return false;
  }

  /**
   * Check if a path matches a pattern (supports wildcards)
   */
  private matchesPattern(path: string, pattern: string): boolean {
    if (pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      return regex.test(path);
    }
    return path.startsWith(pattern);
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create a new Ship Score calculator instance
 */
export function createShipScoreCalculator(): ShipScoreCalculator {
  return new ShipScoreCalculator();
}

/**
 * Quick calculation helper
 */
export function calculateShipScore(input: ShipScoreInput): ShipScoreBreakdown {
  const calculator = new ShipScoreCalculator();
  return calculator.calculate(input);
}

/**
 * Get top fixable issues from findings
 */
export function getTopFixableIssues(
  findings: ShipScoreFinding[],
  limit: number = 3
): ShipScoreFinding[] {
  // Sort by severity (error > warning > info) and autoFixable
  const sorted = [...findings].sort((a, b) => {
    const severityOrder = { error: 0, warning: 1, info: 2 };
    const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (severityDiff !== 0) return severityDiff;
    
    // Prefer auto-fixable
    if (a.autoFixable && !b.autoFixable) return -1;
    if (!a.autoFixable && b.autoFixable) return 1;
    
    return 0;
  });

  return sorted.slice(0, limit);
}

/**
 * Format Ship Score for display
 */
export function formatShipScore(score: ShipScoreBreakdown): string {
  const verdictEmoji = {
    SHIP: '\u2705',  // ✅
    WARN: '\u26a0\ufe0f',  // ⚠️
    BLOCK: '\ud83d\uded1',  // 🛑
  };

  return `Ship Score: ${score.total}/100 ${verdictEmoji[score.verdict]} ${score.verdict}`;
}

// Export default calculator
export const shipScoreCalculator = createShipScoreCalculator();
