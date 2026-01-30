/**
 * Reality Mode
 * 
 * Detects fake data, mock APIs, and demo responses.
 * Features:
 * - Fake domain patterns (localhost, mock APIs)
 * - Fake response patterns (demo IDs, placeholder data)
 * - Traffic classification (green/yellow/red verdicts)
 * - Runtime verification with browser automation (Playwright)
 * - Evidence collection (screenshots, network logs, traces)
 * - Proof receipts with tamper detection
 */

// Core types and patterns
export * from './types.js';
export * from './patterns.js';
export * from './classifier.js';

// Safety controls
export * from './safety/index.js';

// Runtime verification
export {
  runRealityMode,
  runRealityModeSeamless,
  quickVerify,
  DEFAULT_RUNTIME_CONFIG,
  type RealityModeInput,
  type SeamlessOptions,
  type SeamlessResult,
} from './runtime/index.js';

// Auto Launcher
export {
  autoLaunch,
  detectProject,
  findRunningServer,
  isPortInUse,
  findFreePort,
  waitForPort,
  type ProjectInfo,
  type ProjectType,
  type PackageManager,
  type LaunchResult,
  type AutoLaunchOptions,
} from './runtime/index.js';

// Evidence collection
export {
  EvidenceCollector,
  createEvidenceCollector,
  formatEvidenceForDisplay,
  type EvidenceCollectorConfig,
  type CollectedEvidence,
} from './runtime/index.js';

// Runtime rules
export {
  getAllRuntimeRules,
  getRuntimeRuleById,
  executeRules,
  type RuleExecutionResult,
} from './runtime/index.js';

// Proof receipts
export {
  createProofReceipt,
  verifyReceiptSignature,
  formatReceipt,
  calculateReceiptSummary,
  type CreateReceiptOptions,
} from './proof/index.js';
