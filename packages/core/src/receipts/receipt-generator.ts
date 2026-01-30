/**
 * Receipt Generator
 * 
 * Generates signed "Reality Receipts" - shareable artifacts
 * that prove code quality and deployment readiness.
 * 
 * @module receipts/receipt-generator
 */

import { createHmac, randomUUID } from 'node:crypto';
import { execSync } from 'node:child_process';
import * as os from 'node:os';
import type {
  RealityReceipt,
  ReceiptCoverage,
  ReceiptArtifacts,
  ReceiptFailure,
  ReceiptEnvironment,
  ReceiptGenerationInput,
  ReceiptVerificationResult,
} from '@repo/shared-types';
import type { ShipScoreBreakdown } from '../scoring/index.js';

// ============================================================================
// Constants
// ============================================================================

const RECEIPT_VERSION = '1.0.0';
const VIBECHECK_VERSION = '1.0.0';
const DEFAULT_SIGNATURE_ALGORITHM = 'hmac-sha256' as const;

// ============================================================================
// Git Utilities
// ============================================================================

/**
 * Get current git commit hash
 */
function getGitCommitHash(): string {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

/**
 * Get current git branch name
 */
function getGitBranch(): string {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

// ============================================================================
// Environment Detection
// ============================================================================

/**
 * Detect CI platform from environment
 */
function detectCIPlatform(): string | undefined {
  if (process.env.GITHUB_ACTIONS) return 'github-actions';
  if (process.env.GITLAB_CI) return 'gitlab-ci';
  if (process.env.CIRCLECI) return 'circleci';
  if (process.env.TRAVIS) return 'travis-ci';
  if (process.env.JENKINS_URL) return 'jenkins';
  if (process.env.BITBUCKET_PIPELINE_UUID) return 'bitbucket-pipelines';
  if (process.env.AZURE_PIPELINES) return 'azure-pipelines';
  return undefined;
}

/**
 * Get CI build ID from environment
 */
function getCIBuildId(): string | undefined {
  return process.env.GITHUB_RUN_ID ||
         process.env.CI_JOB_ID ||
         process.env.CIRCLE_BUILD_NUM ||
         process.env.TRAVIS_BUILD_ID ||
         process.env.BUILD_NUMBER ||
         process.env.BITBUCKET_BUILD_NUMBER ||
         process.env.BUILD_BUILDID;
}

/**
 * Get CI run URL from environment
 */
function getCIRunUrl(): string | undefined {
  if (process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID) {
    return `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`;
  }
  return process.env.CI_JOB_URL || process.env.CIRCLE_BUILD_URL || process.env.TRAVIS_BUILD_WEB_URL;
}

/**
 * Build environment information
 */
function buildEnvironment(): ReceiptEnvironment {
  return {
    os: `${os.platform()} ${os.release()}`,
    nodeVersion: process.version,
    vibecheckVersion: VIBECHECK_VERSION,
    browser: 'chromium', // Default for Playwright
    ciPlatform: detectCIPlatform(),
    ciBuildId: getCIBuildId(),
    ciRunUrl: getCIRunUrl(),
  };
}

// ============================================================================
// Receipt Generator Class
// ============================================================================

/**
 * Generates and verifies Reality Receipts
 */
export class ReceiptGenerator {
  private signingSecret?: string;

  constructor(options: { signingSecret?: string } = {}) {
    this.signingSecret = options.signingSecret || process.env.VIBECHECK_SIGNING_SECRET;
  }

  /**
   * Generate a new Reality Receipt
   */
  generate(input: ReceiptGenerationInput): RealityReceipt {
    const id = `rcpt_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const timestamp = new Date().toISOString();

    // Build coverage metrics
    const coverage = this.buildCoverage(input);

    // Build artifacts
    const artifacts = this.buildArtifacts(input.artifactPaths);

    // Create receipt without signature
    const receipt: Omit<RealityReceipt, 'signature'> = {
      id,
      timestamp,
      version: RECEIPT_VERSION,
      commitHash: getGitCommitHash(),
      branch: getGitBranch(),
      projectId: input.projectId,
      projectName: input.projectName,
      coverage,
      shipScore: input.shipScore,
      artifacts,
      failures: input.failures || [],
      environment: buildEnvironment(),
      signatureAlgorithm: DEFAULT_SIGNATURE_ALGORITHM,
    };

    // Generate signature
    const signature = this.sign(receipt);

    return {
      ...receipt,
      signature,
    };
  }

  /**
   * Verify a receipt's signature
   */
  verify(receipt: RealityReceipt): ReceiptVerificationResult {
    if (!this.signingSecret) {
      return {
        valid: false,
        error: 'No signing secret configured',
        verifiedAt: new Date().toISOString(),
      };
    }

    const { signature, ...receiptWithoutSignature } = receipt;
    const expectedSignature = this.sign(receiptWithoutSignature);

    const valid = this.secureCompare(signature, expectedSignature);

    return {
      valid,
      error: valid ? undefined : 'Signature mismatch',
      verifiedAt: new Date().toISOString(),
    };
  }

  /**
   * Build coverage metrics from input
   */
  private buildCoverage(input: ReceiptGenerationInput): ReceiptCoverage {
    const scanResults = input.scanResults || { routes: 0, envVars: 0, authPatterns: 0, contracts: 0 };
    const realityResults = input.realityResults || { routesTested: 0, routesPassed: 0, routesFailed: 0 };
    
    const routesTested = realityResults.routesTested;
    const routesTotal = scanResults.routes;
    const routeCoveragePercent = routesTotal > 0 ? Math.round((routesTested / routesTotal) * 100) : 0;

    return {
      routesTested,
      routesTotal,
      routeCoveragePercent,
      envVarsVerified: scanResults.envVars,
      envVarsTotal: scanResults.envVars,
      authFlowsTested: scanResults.authPatterns,
      contractsValidated: scanResults.contracts,
      realityModeRan: realityResults.routesTested > 0,
      chaosModeRan: Boolean(input.chaosResults && input.chaosResults.actionsPerformed > 0),
    };
  }

  /**
   * Build artifacts structure
   */
  private buildArtifacts(paths?: Partial<ReceiptArtifacts>): ReceiptArtifacts {
    return {
      screenshots: paths?.screenshots || [],
      harFiles: paths?.harFiles || [],
      diffs: paths?.diffs || [],
      videos: paths?.videos,
      traces: paths?.traces,
      reportPath: paths?.reportPath,
    };
  }

  /**
   * Sign receipt content using HMAC-SHA256
   */
  private sign(receipt: Omit<RealityReceipt, 'signature'>): string {
    if (!this.signingSecret) {
      // Generate a deterministic but unsigned signature based on content
      const content = JSON.stringify(receipt);
      const hash = createHmac('sha256', 'unsigned')
        .update(content)
        .digest('hex');
      return `unsigned:${hash.slice(0, 32)}`;
    }

    const content = JSON.stringify(receipt);
    return createHmac('sha256', this.signingSecret)
      .update(content)
      .digest('hex');
  }

  /**
   * Constant-time string comparison to prevent timing attacks
   */
  private secureCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return result === 0;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new receipt generator
 */
export function createReceiptGenerator(options?: { signingSecret?: string }): ReceiptGenerator {
  return new ReceiptGenerator(options);
}

/**
 * Generate a receipt (convenience function)
 */
export function generateReceipt(input: ReceiptGenerationInput): RealityReceipt {
  const generator = createReceiptGenerator({ signingSecret: input.signingSecret });
  return generator.generate(input);
}

/**
 * Verify a receipt (convenience function)
 */
export function verifyReceipt(
  receipt: RealityReceipt,
  signingSecret?: string
): ReceiptVerificationResult {
  const generator = createReceiptGenerator({ signingSecret });
  return generator.verify(receipt);
}

// ============================================================================
// Receipt Formatting
// ============================================================================

/**
 * Format receipt for display
 */
export function formatReceiptSummary(receipt: RealityReceipt): string {
  const lines: string[] = [];
  
  lines.push(`Receipt ID: ${receipt.id}`);
  lines.push(`Generated: ${receipt.timestamp}`);
  lines.push(`Commit: ${receipt.commitHash.slice(0, 8)}`);
  lines.push(`Branch: ${receipt.branch}`);
  lines.push('');
  lines.push(`Ship Score: ${receipt.shipScore.total}/100 - ${receipt.shipScore.verdict}`);
  lines.push('');
  lines.push('Coverage:');
  lines.push(`  Routes: ${receipt.coverage.routesTested}/${receipt.coverage.routesTotal} (${receipt.coverage.routeCoveragePercent}%)`);
  lines.push(`  Env Vars: ${receipt.coverage.envVarsVerified}`);
  lines.push(`  Auth Flows: ${receipt.coverage.authFlowsTested}`);
  lines.push(`  Contracts: ${receipt.coverage.contractsValidated}`);
  
  if (receipt.failures.length > 0) {
    lines.push('');
    lines.push(`Failures: ${receipt.failures.length}`);
    for (const failure of receipt.failures.slice(0, 3)) {
      lines.push(`  - ${failure.type}: ${failure.message}`);
    }
    if (receipt.failures.length > 3) {
      lines.push(`  ... and ${receipt.failures.length - 3} more`);
    }
  }
  
  lines.push('');
  lines.push(`Signature: ${receipt.signature.slice(0, 16)}...`);
  
  return lines.join('\n');
}

/**
 * Export receipt as JSON
 */
export function exportReceiptJson(receipt: RealityReceipt): string {
  return JSON.stringify(receipt, null, 2);
}
