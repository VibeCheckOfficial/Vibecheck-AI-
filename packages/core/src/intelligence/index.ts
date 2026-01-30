/**
 * Phase 5: Intelligence System
 *
 * "It Just Knows" - Project-Specific Learning and Context-Aware Analysis
 *
 * This module provides:
 * - Project-specific learning that adapts to YOUR codebase
 * - Semantic context analysis that understands what files DO
 * - Predictive suggestions for what to do next
 * - Automatic severity adjustment based on context
 *
 * Example usage:
 *
 * ```typescript
 * import {
 *   IntelligenceEngine,
 *   getIntelligenceEngine,
 *   processWithIntelligence,
 * } from '@vibecheck/core/intelligence';
 *
 * // Quick processing
 * const result = await processWithIntelligence(findings, '/path/to/project');
 * console.log(`Suppressed: ${result.summary.suppressedCount}`);
 * console.log(`Adjusted: ${result.summary.adjustedCount}`);
 *
 * // Full engine with configuration
 * const engine = await getIntelligenceEngine('/path/to/project', {
 *   autoLearn: true,
 *   enablePredictions: true,
 *   enableSemanticAnalysis: true,
 * });
 *
 * // Process findings with intelligence
 * const result = await engine.processFindings(findings, sessionContext);
 *
 * // Record user feedback
 * await engine.recordFeedback(finding, 'false_positive', {
 *   suppressFuture: true,
 *   notes: 'This is a test file',
 * });
 *
 * // Get suggestions
 * const suggestions = await engine.getSuggestions(sessionContext);
 *
 * // Analyze file context
 * const context = await engine.analyzeFile('src/auth/login.ts');
 * console.log(context.fileType);    // 'api'
 * console.log(context.purpose);     // 'authentication'
 * console.log(context.sensitivity); // 'critical'
 *
 * // Generate learning report
 * console.log(engine.generateReport());
 * ```
 */

// Types
export type {
  // File context types
  FileType,
  FilePurpose,
  FileSensitivity,
  FileContext,

  // Project profile types
  NamingConvention,
  ProjectNamingConventions,
  SuppressionPattern,
  CustomPattern,
  ProjectStats,
  ProjectProfile,

  // Learning types
  FeedbackType,
  FindingFeedback,
  LearningEvent,

  // Predictive types
  SessionContext,
  Suggestion,
  PredictiveConfig,

  // Analysis types
  SemanticAnalysisResult,
  ProjectInsight,

  // Configuration types
  IntelligenceConfig,
} from './types.js';

// Constants
export {
  DEFAULT_PREDICTIVE_CONFIG,
  DEFAULT_INTELLIGENCE_CONFIG,
} from './types.js';

// Project Learner
export {
  ProjectLearner,
  getProjectLearner,
  resetProjectLearner,
} from './project-learner.js';

// Semantic Context Analyzer
export {
  SemanticContextAnalyzer,
  getSemanticAnalyzer,
  resetSemanticAnalyzer,
} from './semantic-context.js';

// Predictive Engine
export {
  PredictiveEngine,
  getPredictiveEngine,
  resetPredictiveEngine,
  formatSuggestions,
} from './predictive-engine.js';

// Intelligence Engine (main orchestrator)
export {
  IntelligenceEngine,
  getIntelligenceEngine,
  resetIntelligenceEngine,
  processWithIntelligence,
  type IntelligenceResult,
} from './intelligence-engine.js';
