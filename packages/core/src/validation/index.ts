/**
 * Validation Module - Post-generation verification
 * 
 * Multi-source verification and traceability for AI-generated content.
 */

export { HallucinationDetector, type HallucinationReport, type HallucinationCandidate } from './hallucination-detector.js';
export { MultiSourceVerifier, type VerificationResult } from './multi-source-verifier.js';
export { CodeValidator, type CodeValidationResult } from './code-validator.js';
export { DriftDetector, type DriftReport } from './drift-detector.js';
