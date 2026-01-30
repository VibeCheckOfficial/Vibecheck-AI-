/**
 * Context Module - Advanced context management for hallucination prevention
 */

export { AdvancedContextManager } from './advanced-context-manager.js';
export { ContextLayers, type ContextLayer, type LayerPriority } from './context-layers.js';
export { FreshnessScorer, type FreshnessScore } from './freshness-scorer.js';
export { EmbeddingService, type Embedding } from './embedding-service.js';
export { 
  ContextValidator, 
  type ValidationResult, 
  type FreshnessResult, 
  type CompletenessResult,
  type RelevanceResult,
  type ValidatorConfig 
} from './context-validator.js';
export {
  DriftDetector,
  type DriftReport,
  type TaskDriftResult,
  type PatternDriftResult,
  type TruthpackDriftResult,
  type DriftIndicator,
  type PatternViolation,
  type DriftConfig
} from './drift-detector.js';
export {
  ContextSync,
  createContextSync,
  type SyncEvent,
  type SyncConfig,
  type SyncStatus
} from './context-sync.js';
