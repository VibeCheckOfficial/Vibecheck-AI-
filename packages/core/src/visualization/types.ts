/**
 * Visualization Type Definitions
 */

// ============================================================================
// Graph Types
// ============================================================================

export interface DependencyGraph {
  /** Root package name */
  root: string;
  /** All nodes in the graph */
  nodes: GraphNode[];
  /** All edges (dependencies) */
  edges: GraphEdge[];
  /** Graph metadata */
  metadata: GraphMetadata;
}

export interface GraphNode {
  /** Package name */
  id: string;
  /** Display label */
  label: string;
  /** Package version */
  version?: string;
  /** Node type */
  type: NodeType;
  /** Risk level (if available) */
  risk?: RiskLevel;
  /** Whether this is a direct dependency */
  direct: boolean;
  /** Depth from root */
  depth: number;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

export interface GraphEdge {
  /** Source node ID */
  from: string;
  /** Target node ID */
  to: string;
  /** Dependency type */
  type: EdgeType;
}

export interface GraphMetadata {
  /** Total direct dependencies */
  directCount: number;
  /** Total transitive dependencies */
  transitiveCount: number;
  /** Maximum depth */
  maxDepth: number;
  /** Packages with vulnerabilities */
  vulnerableCount: number;
}

export type NodeType = 'root' | 'direct' | 'transitive' | 'dev' | 'peer';
export type EdgeType = 'dependency' | 'devDependency' | 'peerDependency' | 'optionalDependency';
export type RiskLevel = 'critical' | 'high' | 'medium' | 'low' | 'none';

// ============================================================================
// Renderer Options
// ============================================================================

export interface MermaidOptions {
  /** Diagram direction */
  direction?: 'TB' | 'BT' | 'LR' | 'RL';
  /** Include versions */
  includeVersions?: boolean;
  /** Show risk colors */
  showRiskColors?: boolean;
  /** Max nodes to render */
  maxNodes?: number;
  /** Only show paths to vulnerable packages */
  vulnerableOnly?: boolean;
}

export interface HtmlVisualizationOptions {
  /** Width of the visualization */
  width?: number;
  /** Height of the visualization */
  height?: number;
  /** Enable zoom/pan */
  interactive?: boolean;
  /** Show node labels */
  showLabels?: boolean;
  /** Node color scheme */
  colorScheme?: 'risk' | 'depth' | 'type';
}

// ============================================================================
// Package.json Types
// ============================================================================

export interface PackageJson {
  name: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

// ============================================================================
// Constants
// ============================================================================

export const RISK_COLORS: Record<RiskLevel, string> = {
  critical: '#dc2626',
  high: '#ea580c',
  medium: '#ca8a04',
  low: '#22c55e',
  none: '#64748b',
};

export const NODE_TYPE_COLORS: Record<NodeType, string> = {
  root: '#8b5cf6',
  direct: '#3b82f6',
  transitive: '#64748b',
  dev: '#f59e0b',
  peer: '#10b981',
};
