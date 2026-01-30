/**
 * Phase 6: Trust System
 *
 * Zero False Positives Through Multi-Source Verification
 *
 * This module provides:
 * - Multi-source verification with evidence from multiple authoritative sources
 * - Evidence chains with human-readable reasoning for every decision
 * - Confidence calibration to ensure reported confidence matches actual accuracy
 *
 * Example usage:
 *
 * ```typescript
 * import {
 *   VerificationEngine,
 *   getVerificationEngine,
 *   quickVerify,
 * } from '@vibecheck/core/verification';
 *
 * // Quick verification
 * const result = await quickVerify(claim, '/path/to/project');
 *
 * // Full engine with configuration
 * const engine = await getVerificationEngine({
 *   projectRoot: '/path/to/project',
 *   enabledSources: ['truthpack', 'filesystem', 'package_json', 'ast'],
 *   confidenceThreshold: 0.8,
 * });
 *
 * const result = await engine.verify(claim);
 *
 * // Get human-readable explanation
 * const { result, explanation, displayChain } = await engine.verifyAndExplain(claim);
 * console.log(displayChain);
 *
 * // Batch verification
 * const batchResult = await engine.verifyBatch(claims);
 * console.log(batchResult.summary);
 *
 * // Record user feedback for calibration
 * await engine.recordFeedback(
 *   claim.id,
 *   true, // was the verification correct?
 *   claim.type,
 *   result.confidence,
 *   'truthpack'
 * );
 *
 * // Get calibration report
 * console.log(engine.getCalibrationReport());
 * ```
 */

// Types
export type {
  VerificationSource,
  SourceEvidence,
  EvidenceStep,
  EvidenceChain,
  VerificationVerdict,
  VerificationResult,
  BatchVerificationResult,
  VerifierConfig,
  CalibrationDataPoint,
  CalibrationBucket,
  CalibrationModel,
  CalibrationConfig,
  FeedbackType,
  VerificationFeedback,
  ProjectProfile,
  VerificationContext,
  SourceVerifier,
} from './types.js';

// Constants
export {
  SOURCE_RELIABILITY,
  VERDICT_THRESHOLDS,
  DEFAULT_VERIFIER_CONFIG,
  DEFAULT_CALIBRATION_CONFIG,
} from './types.js';

// Evidence Chain Builder
export {
  EvidenceChainBuilder,
  createQuickChain,
  type ChainBuilderConfig,
} from './evidence-chain.js';

// Source Verifiers
export {
  truthpackVerifier,
  packageJsonVerifier,
  filesystemVerifier,
  astVerifier,
  gitVerifier,
  typescriptVerifier,
  runtimeVerifier,
  ALL_VERIFIERS,
  getVerifiersForClaimType,
  clearVerifierCaches,
} from './source-verifiers.js';

// Confidence Calibrator
export {
  ConfidenceCalibrator,
  getCalibrator,
  resetGlobalCalibrator,
} from './confidence-calibrator.js';

// Verification Engine
export {
  VerificationEngine,
  getVerificationEngine,
  resetVerificationEngine,
  quickVerify,
} from './verification-engine.js';
