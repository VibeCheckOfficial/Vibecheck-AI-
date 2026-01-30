// src/index.ts - Main exports

export { scan, PATTERNS, IGNORED_PATHS } from './scanner/engines/mock-detector';
export type {
  Finding,
  ScanResult,
  ScanOptions,
  Severity,
  Category,
  Confidence,
  Pattern,
} from './scanner/engines/mock-detector/types';

export { formatReport } from './scanner/engines/mock-detector/reporter';
export type { OutputFormat } from './scanner/engines/mock-detector/reporter';

export { generateAutoFix, applyFixes } from './scanner/engines/mock-detector/auto-fixer';
export type { AutoFix } from './scanner/engines/mock-detector/auto-fixer';

export {
  AIRemediationEngine,
  applyRemediation,
} from './scanner/engines/mock-detector/ai-remediation';
export type {
  RemediationSuggestion,
  RemediationOptions,
} from './scanner/engines/mock-detector/ai-remediation';

export {
  createBaseline,
  loadBaseline,
  updateBaseline,
  pruneBaseline,
  filterBaselineFindings,
  generateFindingHash,
} from './scanner/baseline';
export type { Baseline, BaselineEntry } from './scanner/baseline';

export { loadConfig, syncTeamConfig } from './config/loader';
export type { VibeCheckConfig } from './config/loader';

export { detectMonorepo } from './config/monorepo';
export type { MonorepoConfig, MonorepoPackage } from './config/monorepo';
