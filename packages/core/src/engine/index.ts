/**
 * VibeCheck Engine
 *
 * The unified hallucination detection engine that combines all systems
 * into a single, world-class API.
 *
 * Example usage:
 *
 * ```typescript
 * import {
 *   HallucinationEngine,
 *   quickHallucinationScan,
 *   formatScanReport,
 * } from '@vibecheck/core/engine';
 *
 * // Quick scan
 * const report = await quickHallucinationScan('/path/to/project');
 * console.log(formatScanReport(report));
 *
 * // Full control
 * const engine = new HallucinationEngine({
 *   projectRoot: '/path/to/project',
 *   incremental: true,
 *   parallel: true,
 *   intelligence: true,
 *   verification: true,
 *   onProgress: (p) => console.log(`${p.percentage}% - ${p.currentFile}`),
 *   onFinding: (f) => console.log(`Found: ${f.message}`),
 * });
 *
 * await engine.initialize();
 * const report = await engine.scan();
 *
 * // Verify specific claim
 * const verification = await engine.verifyClaim(
 *   'import { foo } from "bar"',
 *   'import'
 * );
 *
 * // Record feedback for learning
 * await engine.recordFeedback('finding-123', 'false_positive');
 *
 * // Get suggestions
 * const suggestions = await engine.getSuggestions();
 * ```
 */

// Main engine
export {
  HallucinationEngine,
  getHallucinationEngine,
  resetHallucinationEngine,
  quickHallucinationScan,
  formatScanReport,
} from './hallucination-engine.js';

// Types
export type {
  HallucinationFinding,
  HallucinationType,
  HallucinationCategory,
  ScanOptions,
  ScanProgress,
  ScanReport,
} from './hallucination-engine.js';

// Claim extractor
export {
  ClaimExtractor,
  getClaimExtractor,
  extractClaimsFromCode,
  extractClaimsFromPrompt,
} from './claim-extractor.js';

export type {
  ExtractedClaim,
  ClaimExtractionResult,
} from './claim-extractor.js';

// Real-time analyzer
export {
  RealtimeAnalyzer,
  getRealtimeAnalyzer,
  disposeRealtimeAnalyzer,
  quickAnalyze,
} from './realtime-analyzer.js';

export type {
  RealtimeAnalysisResult,
  RealtimeIssue,
  QuickFix,
  CursorSuggestion,
  RealtimeAnalyzerConfig,
} from './realtime-analyzer.js';

// Optimized Scanner Engine
export {
  runScanEngine,
  clearFileCache,
  getFileCacheStats,
  toCachedFinding,
  formatEngineTimings,
  // Re-exports from performance
  getPerformanceScanner,
  quickScan,
  formatMetrics,
} from './scanner-engine.js';

export type {
  FileContext,
  ScanContext,
  EngineDefinition,
  EngineFinding,
  EngineResult,
  ScanEngineOptions,
  ScanEngineResult,
  PerformanceScannerConfig,
  ScanResult,
  CachedFinding,
  ScanProgressEvent,
  PerformanceMetrics,
} from './scanner-engine.js';
