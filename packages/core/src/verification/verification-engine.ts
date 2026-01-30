/**
 * Verification Engine
 *
 * The main orchestrator for the Phase 6 Trust system.
 * Combines multi-source verification, evidence chains, and confidence calibration
 * to achieve "zero false positives" through rigorous, explainable verification.
 */

import type { Claim, ClaimType } from '../firewall/claim-extractor.js';
import { Cache } from '../utils/cache.js';
import { parallelLimit } from '../utils/performance.js';
import { getLogger, type Logger } from '../utils/logger.js';
import { EvidenceChainBuilder } from './evidence-chain.js';
import { ConfidenceCalibrator, getCalibrator } from './confidence-calibrator.js';
import {
  ALL_VERIFIERS,
  getVerifiersForClaimType,
  clearVerifierCaches,
} from './source-verifiers.js';
import type {
  BatchVerificationResult,
  SourceEvidence,
  VerificationContext,
  VerificationResult,
  VerificationSource,
  VerificationVerdict,
  VerifierConfig,
  DEFAULT_VERIFIER_CONFIG,
  EvidenceChain,
} from './types.js';

const DEFAULT_CONFIG: VerifierConfig = {
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

/**
 * Main Verification Engine
 *
 * Orchestrates multi-source verification with evidence chains and calibration.
 */
export class VerificationEngine {
  private config: VerifierConfig;
  private chainBuilder: EvidenceChainBuilder;
  private calibrator: ConfidenceCalibrator | null = null;
  private resultCache: Cache<VerificationResult>;
  private logger: Logger;
  private initialized = false;

  constructor(config: Partial<VerifierConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.chainBuilder = new EvidenceChainBuilder({ includeMetadata: true });
    this.resultCache = new Cache<VerificationResult>({
      maxSize: 500,
      defaultTtlMs: this.config.cacheTtlMs,
    });
    this.logger = getLogger('verification-engine');
  }

  /**
   * Initialize the engine (loads calibration data)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.calibrator = await getCalibrator(this.config.projectRoot);
    this.initialized = true;

    this.logger.debug('Verification engine initialized', {
      enabledSources: this.config.enabledSources,
      caching: this.config.enableCaching,
    });
  }

  /**
   * Verify a single claim
   */
  async verify(claim: Claim): Promise<VerificationResult> {
    await this.ensureInitialized();

    const startTime = performance.now();
    const cacheKey = this.getCacheKey(claim);

    // Check cache
    if (this.config.enableCaching) {
      const cached = this.resultCache.get(cacheKey);
      if (cached) {
        this.logger.debug('Verification cache hit', { claimId: claim.id });
        return cached;
      }
    }

    // Get applicable verifiers
    const verifiers = getVerifiersForClaimType(claim.type).filter((v) =>
      this.config.enabledSources.includes(v.name)
    );

    if (verifiers.length === 0) {
      this.logger.warn('No verifiers available for claim type', {
        claimType: claim.type,
        claimValue: claim.value,
      });

      return this.createUncertainResult(claim, startTime);
    }

    // Build verification context
    const context: VerificationContext = {
      claim,
      projectRoot: this.config.projectRoot,
      truthpackPath: this.config.truthpackPath,
    };

    // Run verifiers (parallel or sequential)
    let sourceEvidence: SourceEvidence[];

    if (this.config.parallel) {
      sourceEvidence = await this.runVerifiersParallel(verifiers, context);
    } else {
      sourceEvidence = await this.runVerifiersSequential(verifiers, context);
    }

    // Build evidence chain
    const evidenceChain = this.chainBuilder.build(claim, sourceEvidence, startTime);

    // Calculate verification result
    const result = this.buildResult(claim, sourceEvidence, evidenceChain, startTime);

    // Apply calibration if available
    if (this.calibrator) {
      result.adjustedConfidence = this.calibrator.calibrate(
        result.confidence,
        claim.type,
        this.getPrimarySource(sourceEvidence)
      );

      if (result.adjustedConfidence !== result.confidence) {
        result.adjustmentReason = 'Calibrated based on historical accuracy';
      }
    }

    // Cache result
    if (this.config.enableCaching) {
      this.resultCache.set(cacheKey, result);
    }

    this.logger.debug('Verification complete', {
      claimId: claim.id,
      verdict: result.evidenceChain.verdict,
      confidence: result.confidence,
      durationMs: Math.round(performance.now() - startTime),
    });

    return result;
  }

  /**
   * Verify multiple claims in batch
   */
  async verifyBatch(claims: Claim[]): Promise<BatchVerificationResult> {
    await this.ensureInitialized();

    const startTime = performance.now();

    if (claims.length === 0) {
      return this.createEmptyBatchResult(startTime);
    }

    this.logger.info('Starting batch verification', { count: claims.length });

    // Verify claims with parallelism
    const results = await parallelLimit(claims, this.config.parallelLimit, async (claim) => {
      try {
        return await this.verify(claim);
      } catch (error) {
        this.logger.warn('Verification failed for claim', {
          claimId: claim.id,
          error: error instanceof Error ? error.message : 'Unknown',
        });
        return this.createErrorResult(claim, error, performance.now());
      }
    });

    const summary = this.buildBatchSummary(results);

    this.logger.info('Batch verification complete', {
      total: claims.length,
      verified: summary.verified,
      unverified: summary.unverified,
      durationMs: Math.round(performance.now() - startTime),
    });

    return {
      results,
      summary,
      durationMs: performance.now() - startTime,
    };
  }

  /**
   * Verify and explain - returns detailed explanation for a claim
   */
  async verifyAndExplain(claim: Claim): Promise<{
    result: VerificationResult;
    explanation: string;
    displayChain: string;
  }> {
    const result = await this.verify(claim);
    const displayChain = this.chainBuilder.formatForDisplay(result.evidenceChain);

    return {
      result,
      explanation: result.evidenceChain.reasoning,
      displayChain,
    };
  }

  /**
   * Record user feedback for calibration
   */
  async recordFeedback(
    claimId: string,
    wasCorrect: boolean,
    claimType: ClaimType,
    reportedConfidence: number,
    source: VerificationSource
  ): Promise<void> {
    if (this.calibrator) {
      this.calibrator.recordFeedback(reportedConfidence, wasCorrect, claimType, source);
      this.logger.debug('Feedback recorded', {
        claimId,
        wasCorrect,
        claimType,
        reportedConfidence,
      });
    }
  }

  /**
   * Get calibration report
   */
  getCalibrationReport(): string {
    if (!this.calibrator) {
      return 'Calibrator not initialized';
    }
    return this.calibrator.generateReport();
  }

  /**
   * Clear all caches
   */
  clearCaches(): void {
    this.resultCache.clear();
    clearVerifierCaches();
    this.logger.debug('Caches cleared');
  }

  /**
   * Get engine statistics
   */
  getStats(): {
    cacheSize: number;
    cacheHitRate: number;
    enabledSources: VerificationSource[];
    calibrationStats: ReturnType<ConfidenceCalibrator['getStats']> | null;
  } {
    const cacheStats = this.resultCache.getStats();

    return {
      cacheSize: cacheStats.size,
      cacheHitRate: cacheStats.hitRate,
      enabledSources: this.config.enabledSources,
      calibrationStats: this.calibrator?.getStats() ?? null,
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<VerifierConfig>): void {
    this.config = { ...this.config, ...config };

    // Clear caches when config changes
    this.clearCaches();
  }

  /**
   * Dispose resources
   */
  async dispose(): Promise<void> {
    this.resultCache.dispose();

    if (this.calibrator) {
      await this.calibrator.dispose();
    }
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  private getCacheKey(claim: Claim): string {
    return `${claim.type}:${claim.value}:${this.config.enabledSources.join(',')}`;
  }

  private async runVerifiersParallel(
    verifiers: Array<{ name: VerificationSource; verify: (ctx: VerificationContext) => Promise<SourceEvidence> }>,
    context: VerificationContext
  ): Promise<SourceEvidence[]> {
    const results = await Promise.allSettled(
      verifiers.map((v) =>
        this.runWithTimeout(v.verify(context), this.config.sourceTimeout, v.name)
      )
    );

    return results.map((r, i) => {
      if (r.status === 'fulfilled') {
        return r.value;
      }
      return this.createErrorEvidence(verifiers[i].name, r.reason);
    });
  }

  private async runVerifiersSequential(
    verifiers: Array<{ name: VerificationSource; verify: (ctx: VerificationContext) => Promise<SourceEvidence> }>,
    context: VerificationContext
  ): Promise<SourceEvidence[]> {
    const results: SourceEvidence[] = [];

    for (const verifier of verifiers) {
      try {
        const evidence = await this.runWithTimeout(
          verifier.verify(context),
          this.config.sourceTimeout,
          verifier.name
        );
        results.push(evidence);

        // Early exit if we have enough positive evidence
        if (evidence.verified && evidence.confidence >= this.config.confidenceThreshold) {
          break;
        }
      } catch (error) {
        results.push(this.createErrorEvidence(verifier.name, error));
      }
    }

    return results;
  }

  private async runWithTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    sourceName: string
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`${sourceName} verification timed out`)), timeoutMs)
      ),
    ]);
  }

  private createErrorEvidence(source: VerificationSource, error: unknown): SourceEvidence {
    return {
      source,
      verified: false,
      confidence: 0,
      details: {},
      timestamp: new Date(),
      durationMs: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }

  private buildResult(
    claim: Claim,
    sourceEvidence: SourceEvidence[],
    evidenceChain: EvidenceChain,
    startTime: number
  ): VerificationResult {
    const validEvidence = sourceEvidence.filter((e) => !e.error);
    const verifiedSources = validEvidence.filter((e) => e.verified);

    // Calculate consensus
    const consensus =
      verifiedSources.length >= this.config.requiredSources &&
      evidenceChain.confidence >= this.config.consensusThreshold;

    // Find discrepancies
    const discrepancies = this.findDiscrepancies(sourceEvidence);

    return {
      claim,
      verified: consensus,
      confidence: evidenceChain.confidence,
      sources: sourceEvidence,
      consensus,
      discrepancies,
      evidenceChain,
    };
  }

  private findDiscrepancies(sourceEvidence: SourceEvidence[]): string[] {
    const discrepancies: string[] = [];
    const verified = sourceEvidence.filter((e) => e.verified && !e.error);
    const unverified = sourceEvidence.filter((e) => !e.verified && !e.error);

    if (verified.length > 0 && unverified.length > 0) {
      discrepancies.push(
        `Verified by: ${verified.map((e) => e.source).join(', ')}; ` +
          `Unverified by: ${unverified.map((e) => e.source).join(', ')}`
      );
    }

    const errors = sourceEvidence.filter((e) => e.error);
    if (errors.length > 0) {
      discrepancies.push(`Errors in: ${errors.map((e) => e.source).join(', ')}`);
    }

    return discrepancies;
  }

  private getPrimarySource(sourceEvidence: SourceEvidence[]): VerificationSource {
    // Find the verified source with highest confidence
    const verified = sourceEvidence
      .filter((e) => e.verified && !e.error)
      .sort((a, b) => b.confidence - a.confidence);

    return verified[0]?.source ?? 'truthpack';
  }

  private buildBatchSummary(
    results: VerificationResult[]
  ): BatchVerificationResult['summary'] {
    const byVerdict: Record<VerificationVerdict, number> = {
      confirmed: 0,
      likely: 0,
      uncertain: 0,
      unlikely: 0,
      dismissed: 0,
    };

    const bySource: Record<VerificationSource, { checked: number; verified: number }> = {
      truthpack: { checked: 0, verified: 0 },
      ast: { checked: 0, verified: 0 },
      filesystem: { checked: 0, verified: 0 },
      git: { checked: 0, verified: 0 },
      package_json: { checked: 0, verified: 0 },
      typescript_compiler: { checked: 0, verified: 0 },
      runtime: { checked: 0, verified: 0 },
    };

    let totalConfidence = 0;
    let verified = 0;

    for (const result of results) {
      byVerdict[result.evidenceChain.verdict]++;
      totalConfidence += result.confidence;

      if (result.verified) verified++;

      for (const source of result.sources) {
        bySource[source.source].checked++;
        if (source.verified) bySource[source.source].verified++;
      }
    }

    return {
      total: results.length,
      verified,
      unverified: results.length - verified,
      avgConfidence: results.length > 0 ? totalConfidence / results.length : 0,
      byVerdict,
      bySource,
    };
  }

  private createUncertainResult(claim: Claim, startTime: number): VerificationResult {
    const evidenceChain = this.chainBuilder.build(claim, [], startTime);

    return {
      claim,
      verified: false,
      confidence: 0,
      sources: [],
      consensus: false,
      discrepancies: ['No verifiers available for this claim type'],
      evidenceChain,
    };
  }

  private createErrorResult(
    claim: Claim,
    error: unknown,
    startTime: number
  ): VerificationResult {
    const errorEvidence: SourceEvidence = {
      source: 'truthpack',
      verified: false,
      confidence: 0,
      details: {},
      timestamp: new Date(),
      durationMs: performance.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown error',
    };

    const evidenceChain = this.chainBuilder.build(claim, [errorEvidence], startTime);

    return {
      claim,
      verified: false,
      confidence: 0,
      sources: [errorEvidence],
      consensus: false,
      discrepancies: [`Verification error: ${errorEvidence.error}`],
      evidenceChain,
    };
  }

  private createEmptyBatchResult(startTime: number): BatchVerificationResult {
    return {
      results: [],
      summary: {
        total: 0,
        verified: 0,
        unverified: 0,
        avgConfidence: 0,
        byVerdict: {
          confirmed: 0,
          likely: 0,
          uncertain: 0,
          unlikely: 0,
          dismissed: 0,
        },
        bySource: {
          truthpack: { checked: 0, verified: 0 },
          ast: { checked: 0, verified: 0 },
          filesystem: { checked: 0, verified: 0 },
          git: { checked: 0, verified: 0 },
          package_json: { checked: 0, verified: 0 },
          typescript_compiler: { checked: 0, verified: 0 },
          runtime: { checked: 0, verified: 0 },
        },
      },
      durationMs: performance.now() - startTime,
    };
  }
}

// ============================================================================
// Factory and Singleton
// ============================================================================

let globalEngine: VerificationEngine | null = null;

/**
 * Get or create the global verification engine
 */
export async function getVerificationEngine(
  config?: Partial<VerifierConfig>
): Promise<VerificationEngine> {
  if (!globalEngine) {
    globalEngine = new VerificationEngine(config);
    await globalEngine.initialize();
  } else if (config) {
    globalEngine.updateConfig(config);
  }

  return globalEngine;
}

/**
 * Reset the global verification engine
 */
export async function resetVerificationEngine(): Promise<void> {
  if (globalEngine) {
    await globalEngine.dispose();
    globalEngine = null;
  }
}

/**
 * Quick verification helper
 */
export async function quickVerify(
  claim: Claim,
  projectRoot?: string
): Promise<VerificationResult> {
  const engine = await getVerificationEngine(
    projectRoot ? { projectRoot } : undefined
  );
  return engine.verify(claim);
}
