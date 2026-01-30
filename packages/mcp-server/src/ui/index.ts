/**
 * MCP UI Exports
 *
 * Central export point for MCP server UI utilities.
 */

// Core styles
export { mcpStyles, getMcpInlineStyles } from './styles.js';

// HTML response builders
export {
  buildTruthpackViewerHtml,
  buildFirewallResultHtml,
  buildContextPreviewHtml,
  buildStatsHtml,
  buildMessageHtml,
  buildErrorHtml,
} from './response-builder.js';

export type {
  TruthpackSection,
  Truthpack,
  FirewallViolation,
  FirewallVerdict,
  ContextLayer,
  ContextResult,
} from './response-builder.js';

// Text formatters for ASCII/Unicode output
export * as fmt from './text-formatters.js';
export {
  BOX,
  ICONS,
  box,
  headerBox,
  table,
  tree,
  progressBar,
  statsGrid,
  formatVerdict,
  section,
  keyValue,
  bulletList,
  numberedList,
  httpMethod,
  timestamp,
  duration,
} from './text-formatters.js';

// Unified response builder (multi-format)
export {
  formatFirewallEvaluate,
  formatFirewallStatus,
  formatQuickCheck,
  formatTruthpackGenerate,
  formatTruthpackQuery,
  formatRoutes,
  formatSuccess,
  formatError,
  formatInfo,
  buildResponse,
  buildTextResponse,
} from './unified-response.js';

export type {
  UnifiedResponse,
  ResponseFormat,
  FirewallEvaluateData,
  TruthpackGenerateData,
} from './unified-response.js';
