/**
 * Reality Mode Runtime Module
 * 
 * Runtime verification engine and evidence collection.
 */

// Engine
export {
  runRealityMode,
  runRealityModeSeamless,
  quickVerify,
  DEFAULT_RUNTIME_CONFIG,
  type RealityModeInput,
  type SeamlessOptions,
  type SeamlessResult,
} from './engine.js';

// Evidence Collection
export {
  EvidenceCollector,
  createEvidenceCollector,
  formatEvidenceForDisplay,
  type EvidenceCollectorConfig,
  type CollectedEvidence,
  type ScreenshotOptions,
} from './evidence-collector.js';

// Rules
export {
  getAllRuntimeRules,
  getRuntimeRuleById,
  executeRules,
  type RuleExecutionResult,
} from './rules/index.js';

// Auto Launcher
export {
  autoLaunch,
  detectProject,
  findRunningServer,
  isPortInUse,
  findFreePort,
  waitForPort,
  startServer,
  stopServer,
  type ProjectInfo,
  type ProjectType,
  type PackageManager,
  type LaunchResult,
  type AutoLaunchOptions,
} from './auto-launcher.js';

// Report Generator
export {
  generateHtmlReport,
  openReport,
  type ReportOptions,
} from './report-generator.js';

// AI Chaos Agent
export {
  AIChaosAgent,
  runChaosAgent,
  type ChaosAgentConfig,
  type ChaosAction,
  type ChaosFinding,
  type ChaosSession,
} from './ai-chaos-agent.js';
