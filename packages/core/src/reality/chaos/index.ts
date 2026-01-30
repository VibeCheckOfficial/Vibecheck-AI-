/**
 * Chaos Module
 * 
 * Provides safety guardrails, action classification, and replay
 * for the AI Chaos Agent.
 * 
 * @module reality/chaos
 */

// Safe Mode
export {
  SafeModeManager,
  createSafeModeManager,
  createAggressiveModeManager,
  createDisabledSafeModeManager,
  DEFAULT_SAFE_MODE_CONFIG,
  AGGRESSIVE_MODE_CONFIG,
} from './safe-mode.js';

export type {
  SafeModeConfig,
  ChaosAction,
  SafeModeCheckResult,
  SafeModeStats,
} from './safe-mode.js';

// Action Classifier
export {
  ActionClassifier,
  createActionClassifier,
  classifyAction,
  getRiskLevel,
} from './action-classifier.js';

export type {
  RiskLevel,
  ActionClassification,
  ClassifiableAction,
} from './action-classifier.js';

// Replay System
export {
  ChaosSessionRecorder,
  createSessionRecorder,
  exportToPlaywright,
  generateSeed,
  parseSessionRecording,
  serializeSessionRecording,
  DEFAULT_REPLAY_OPTIONS,
} from './replay.js';

export type {
  RecordedAction,
  ChaosSessionRecording,
  SessionSummary,
  SessionEnvironment,
  SessionConfig,
  ReplayOptions,
  ReplayResult,
  ReplayDifference,
} from './replay.js';
