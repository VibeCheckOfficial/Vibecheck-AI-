/**
 * Flow Tracing Module
 * 
 * Data flow analysis for tracking where data comes from, where it goes,
 * and identifying missing validations and security issues.
 * 
 * @module flow-tracing
 * 
 * @example
 * ```typescript
 * import { traceFile, traceDirectory, visualizeReport } from '@vibecheck/core/flow-tracing';
 * 
 * // Trace a single file
 * const result = await traceFile('./src/api/users.ts');
 * console.log(visualizeReport(result.report));
 * 
 * // Trace a directory
 * const dirResult = await traceDirectory('./src');
 * console.log(visualizeReport(dirResult.report));
 * ```
 */

// Types
export type {
  FlowNode,
  FlowNodeType,
  FlowEdge,
  FlowEdgeType,
  FlowGraph,
  FlowPath,
  FlowIssue,
  FlowReport,
  FlowTracingConfig,
  SourceCategory,
  SinkCategory,
  SourcePattern,
  SinkPattern,
  ValidationPattern,
} from './types.js';

// Engine
export {
  FlowTracingEngine,
  createFlowTracingEngine,
  traceFile,
  traceDirectory,
  type FlowTracingOptions,
  type FlowTracingResult,
} from './engine.js';

// Analyzer
export {
  analyzeFile,
  buildFlowGraph,
  traceFlowPaths,
  detectFlowIssues,
} from './analyzer.js';

// Parser
export {
  parseSourceCode,
  findReferencedVariables,
  extractFunctionCalls,
} from './parser.js';

// Patterns
export {
  DEFAULT_SOURCE_PATTERNS,
  DEFAULT_SINK_PATTERNS,
  DEFAULT_VALIDATION_PATTERNS,
  getDefaultConfig,
} from './patterns.js';

// Visualizer
export {
  visualizeReport,
  visualizePath,
  generateMermaidDiagram,
  generateSummaryLine,
} from './visualizer.js';
