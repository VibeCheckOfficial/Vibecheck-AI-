/**
 * Flow Tracing Types
 * 
 * Type definitions for data flow analysis and tracing.
 * Used to track where data comes from, where it goes, and
 * identify transformation points and missing validations.
 * 
 * @module flow-tracing/types
 */

// ============================================================================
// Node Types
// ============================================================================

/**
 * Types of data flow nodes
 */
export type FlowNodeType = 
  | 'source'           // Data origin (user input, API response, env var, etc.)
  | 'sink'             // Data destination (database, API call, file write, etc.)
  | 'variable'         // Variable declaration or assignment
  | 'parameter'        // Function parameter
  | 'return'           // Function return value
  | 'property'         // Object property access
  | 'transform'        // Data transformation (map, filter, parse, etc.)
  | 'validation'       // Data validation (type check, sanitization, etc.)
  | 'condition'        // Conditional branch
  | 'call'             // Function call
  | 'literal';         // Literal value

/**
 * Source categories - where data originates
 */
export type SourceCategory =
  | 'user_input'       // User-provided data (form fields, query params, etc.)
  | 'api_response'     // External API responses
  | 'database'         // Database queries
  | 'file_system'      // File reads
  | 'environment'      // Environment variables
  | 'config'           // Configuration files
  | 'external'         // Other external sources
  | 'unknown';         // Unknown/untracked source

/**
 * Sink categories - where data ends up
 */
export type SinkCategory =
  | 'database_write'   // Database insertions/updates
  | 'api_call'         // External API calls
  | 'file_write'       // File writes
  | 'html_render'      // HTML rendering (potential XSS)
  | 'sql_query'        // SQL query construction (potential injection)
  | 'shell_exec'       // Shell command execution
  | 'eval'             // Dynamic code evaluation
  | 'log'              // Logging (potential info leak)
  | 'response'         // HTTP response
  | 'unknown';         // Unknown sink

/**
 * A node in the data flow graph
 */
export interface FlowNode {
  /** Unique node identifier */
  id: string;
  /** Type of node */
  type: FlowNodeType;
  /** Human-readable label */
  label: string;
  /** Source code location */
  location: {
    file: string;
    line: number;
    column: number;
    endLine?: number;
    endColumn?: number;
  };
  /** Original source code snippet */
  code: string;
  /** For source nodes: the category of source */
  sourceCategory?: SourceCategory;
  /** For sink nodes: the category of sink */
  sinkCategory?: SinkCategory;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
  /** Whether this node has validation */
  hasValidation?: boolean;
  /** Risk level for sinks */
  riskLevel?: 'low' | 'medium' | 'high' | 'critical';
}

// ============================================================================
// Edge Types
// ============================================================================

/**
 * Types of data flow edges
 */
export type FlowEdgeType =
  | 'assignment'       // Direct assignment (a = b)
  | 'parameter'        // Passed as function parameter
  | 'return'           // Returned from function
  | 'property'         // Property access (a.b)
  | 'transform'        // Data transformation
  | 'condition'        // Conditional flow
  | 'call';            // Function call result

/**
 * An edge in the data flow graph
 */
export interface FlowEdge {
  /** Unique edge identifier */
  id: string;
  /** Source node ID */
  from: string;
  /** Target node ID */
  to: string;
  /** Type of edge */
  type: FlowEdgeType;
  /** Human-readable label */
  label?: string;
  /** Whether data is transformed on this edge */
  transforms?: boolean;
  /** Whether data is validated on this edge */
  validates?: boolean;
}

// ============================================================================
// Graph Types
// ============================================================================

/**
 * Complete data flow graph for a file or project
 */
export interface FlowGraph {
  /** All nodes in the graph */
  nodes: FlowNode[];
  /** All edges in the graph */
  edges: FlowEdge[];
  /** Graph metadata */
  metadata: {
    /** Files analyzed */
    files: string[];
    /** Analysis timestamp */
    analyzedAt: string;
    /** Number of source nodes */
    sourceCount: number;
    /** Number of sink nodes */
    sinkCount: number;
    /** Number of paths without validation */
    unvalidatedPaths: number;
  };
}

// ============================================================================
// Path Types
// ============================================================================

/**
 * A complete data flow path from source to sink
 */
export interface FlowPath {
  /** Unique path identifier */
  id: string;
  /** Starting source node */
  source: FlowNode;
  /** Ending sink node */
  sink: FlowNode;
  /** All nodes in the path (ordered) */
  nodes: FlowNode[];
  /** All edges in the path (ordered) */
  edges: FlowEdge[];
  /** Whether this path has any validation */
  hasValidation: boolean;
  /** List of validation nodes in the path */
  validations: FlowNode[];
  /** List of transformation nodes in the path */
  transformations: FlowNode[];
  /** Risk assessment */
  risk: {
    level: 'low' | 'medium' | 'high' | 'critical';
    reasons: string[];
  };
}

// ============================================================================
// Issue Types
// ============================================================================

/**
 * A potential issue found in data flow
 */
export interface FlowIssue {
  /** Issue identifier */
  id: string;
  /** Issue severity */
  severity: 'info' | 'warning' | 'error' | 'critical';
  /** Issue type */
  type: 
    | 'missing_validation'
    | 'unsafe_sink'
    | 'untrusted_source'
    | 'missing_sanitization'
    | 'type_coercion'
    | 'null_propagation';
  /** Issue title */
  title: string;
  /** Detailed description */
  description: string;
  /** Related flow path */
  path: FlowPath;
  /** Suggested fix */
  suggestion?: string;
  /** Documentation link */
  docLink?: string;
}

// ============================================================================
// Report Types
// ============================================================================

/**
 * Complete flow tracing report
 */
export interface FlowReport {
  /** Report summary */
  summary: {
    /** Total files analyzed */
    filesAnalyzed: number;
    /** Total sources found */
    sourcesFound: number;
    /** Total sinks found */
    sinksFound: number;
    /** Total paths traced */
    pathsTraced: number;
    /** Paths without validation */
    unvalidatedPaths: number;
    /** Total issues found */
    issuesFound: number;
    /** Issues by severity */
    issuesBySeverity: {
      info: number;
      warning: number;
      error: number;
      critical: number;
    };
  };
  /** Full flow graph */
  graph: FlowGraph;
  /** All traced paths */
  paths: FlowPath[];
  /** All issues found */
  issues: FlowIssue[];
  /** Analysis metadata */
  metadata: {
    /** Analysis start time */
    startedAt: string;
    /** Analysis end time */
    completedAt: string;
    /** Duration in milliseconds */
    durationMs: number;
    /** Analyzer version */
    version: string;
  };
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Flow tracing configuration
 */
export interface FlowTracingConfig {
  /** Files/patterns to include */
  include: string[];
  /** Files/patterns to exclude */
  exclude: string[];
  /** Source patterns to track */
  sourcePatterns: SourcePattern[];
  /** Sink patterns to track */
  sinkPatterns: SinkPattern[];
  /** Validation patterns to recognize */
  validationPatterns: ValidationPattern[];
  /** Maximum path depth */
  maxPathDepth: number;
  /** Whether to trace across files */
  crossFileTracing: boolean;
}

/**
 * Pattern for identifying data sources
 */
export interface SourcePattern {
  /** Pattern name */
  name: string;
  /** Category of source */
  category: SourceCategory;
  /** Patterns to match (function names, property accesses, etc.) */
  patterns: string[];
  /** Description */
  description?: string;
}

/**
 * Pattern for identifying data sinks
 */
export interface SinkPattern {
  /** Pattern name */
  name: string;
  /** Category of sink */
  category: SinkCategory;
  /** Patterns to match */
  patterns: string[];
  /** Risk level */
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  /** Description */
  description?: string;
}

/**
 * Pattern for identifying validations
 */
export interface ValidationPattern {
  /** Pattern name */
  name: string;
  /** Patterns to match */
  patterns: string[];
  /** What this validation protects against */
  protectsAgainst: string[];
  /** Description */
  description?: string;
}
