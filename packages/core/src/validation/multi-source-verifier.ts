/**
 * Multi-Source Verifier
 *
 * DEPRECATED: This module is kept for backwards compatibility.
 * Please use the new verification system from '@vibecheck/core/verification':
 *
 * ```typescript
 * import { VerificationEngine, quickVerify } from '@vibecheck/core/verification';
 * ```
 *
 * The new system provides:
 * - Evidence chains with human-readable reasoning
 * - Confidence calibration based on historical accuracy
 * - Multiple source verifiers with actual implementations
 * - Batch verification with parallel processing
 */

import type { ClaimType } from '../firewall/claim-extractor.js';
import {
  VerificationEngine,
  type VerificationSource as NewVerificationSource,
  type SourceEvidence,
  type VerificationResult as NewVerificationResult,
  type VerifierConfig as NewVerifierConfig,
} from '../verification/index.js';

// Re-export types for backwards compatibility
export type VerificationSource =
  | 'truthpack'
  | 'ast'
  | 'filesystem'
  | 'git'
  | 'package_json'
  | 'typescript_compiler';

export interface SourceResult {
  source: VerificationSource;
  verified: boolean;
  confidence: number;
  details: Record<string, unknown>;
  timestamp: Date;
}

export interface VerificationResult {
  claim: string;
  verified: boolean;
  confidence: number;
  sources: SourceResult[];
  consensus: boolean;
  discrepancies: string[];
}

export interface VerifierConfig {
  requiredSources: number;
  consensusThreshold: number;
  enabledSources: VerificationSource[];
}

const DEFAULT_CONFIG: VerifierConfig = {
  requiredSources: 2,
  consensusThreshold: 0.7,
  enabledSources: ['truthpack', 'filesystem', 'package_json', 'ast'],
};

/**
 * @deprecated Use VerificationEngine from '@vibecheck/core/verification' instead.
 *
 * This class is maintained for backwards compatibility and delegates
 * to the new Phase 6 Trust System under the hood.
 */
export class MultiSourceVerifier {
  private config: VerifierConfig;
  private engine: VerificationEngine | null = null;
  private projectRoot: string;

  constructor(config: Partial<VerifierConfig> = {}, projectRoot: string = process.cwd()) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.projectRoot = projectRoot;
  }

  private async getEngine(): Promise<VerificationEngine> {
    if (!this.engine) {
      this.engine = new VerificationEngine({
        requiredSources: this.config.requiredSources,
        consensusThreshold: this.config.consensusThreshold,
        enabledSources: this.config.enabledSources as NewVerificationSource[],
        projectRoot: this.projectRoot,
      });
      await this.engine.initialize();
    }
    return this.engine;
  }

  /**
   * Verify a claim against multiple sources
   */
  async verify(claim: string, type: string): Promise<VerificationResult> {
    const engine = await this.getEngine();

    // Create a claim object for the new engine
    const claimObj = {
      id: `legacy-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: this.mapType(type),
      value: claim,
      location: { line: 0, column: 0, length: claim.length },
      confidence: 0.8,
      context: claim,
    };

    const result = await engine.verify(claimObj);
    return this.convertResult(claim, result);
  }

  /**
   * Batch verify multiple claims
   */
  async verifyBatch(
    claims: Array<{ claim: string; type: string }>
  ): Promise<VerificationResult[]> {
    const engine = await this.getEngine();

    const claimObjs = claims.map((c, i) => ({
      id: `legacy-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
      type: this.mapType(c.type),
      value: c.claim,
      location: { line: 0, column: 0, length: c.claim.length },
      confidence: 0.8,
      context: c.claim,
    }));

    const batchResult = await engine.verifyBatch(claimObjs);

    return batchResult.results.map((result, i) =>
      this.convertResult(claims[i].claim, result)
    );
  }

  private mapType(type: string): ClaimType {
    const typeMap: Record<string, ClaimType> = {
      import: 'import',
      function: 'function_call',
      function_call: 'function_call',
      type: 'type_reference',
      type_reference: 'type_reference',
      api: 'api_endpoint',
      api_endpoint: 'api_endpoint',
      env: 'env_variable',
      env_variable: 'env_variable',
      file: 'file_reference',
      file_reference: 'file_reference',
      package: 'package_dependency',
      package_dependency: 'package_dependency',
    };

    return typeMap[type] ?? 'import';
  }

  private convertResult(claim: string, result: NewVerificationResult): VerificationResult {
    const sources: SourceResult[] = result.sources.map((s) => ({
      source: s.source as VerificationSource,
      verified: s.verified,
      confidence: s.confidence,
      details: s.details,
      timestamp: s.timestamp,
    }));

    return {
      claim,
      verified: result.verified,
      confidence: result.confidence,
      sources,
      consensus: result.consensus,
      discrepancies: result.discrepancies,
    };
  }

  /**
   * Dispose resources
   */
  async dispose(): Promise<void> {
    if (this.engine) {
      await this.engine.dispose();
      this.engine = null;
    }
  }
}
