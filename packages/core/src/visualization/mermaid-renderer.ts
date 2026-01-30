/**
 * Mermaid Diagram Renderer
 * 
 * Renders dependency graphs as Mermaid diagrams.
 */

import type {
  DependencyGraph,
  GraphNode,
  MermaidOptions,
  RiskLevel,
} from './types.js';
import { RISK_COLORS } from './types.js';

// ============================================================================
// Default Options
// ============================================================================

const DEFAULT_OPTIONS: Required<MermaidOptions> = {
  direction: 'TB',
  includeVersions: true,
  showRiskColors: true,
  maxNodes: 50,
  vulnerableOnly: false,
};

// ============================================================================
// Mermaid Renderer
// ============================================================================

/**
 * Render a dependency graph as a Mermaid diagram
 */
export function renderMermaid(
  graph: DependencyGraph,
  options: MermaidOptions = {}
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  // Limit nodes if needed
  let nodes = graph.nodes;
  let edges = graph.edges;
  
  if (opts.vulnerableOnly) {
    const vulnerableIds = new Set(
      nodes.filter(n => n.risk && n.risk !== 'none').map(n => n.id)
    );
    // Include root and direct dependencies leading to vulnerable
    const relevantIds = getRelevantIds(graph, vulnerableIds);
    nodes = nodes.filter(n => relevantIds.has(n.id));
    edges = edges.filter(e => relevantIds.has(e.from) && relevantIds.has(e.to));
  }
  
  if (nodes.length > opts.maxNodes) {
    // Prioritize root, direct deps, and vulnerable packages
    nodes = prioritizeNodes(nodes, opts.maxNodes);
    const nodeIds = new Set(nodes.map(n => n.id));
    edges = edges.filter(e => nodeIds.has(e.from) && nodeIds.has(e.to));
  }
  
  const lines: string[] = [];
  
  // Header
  lines.push(`flowchart ${opts.direction}`);
  lines.push('');
  
  // Node definitions
  for (const node of nodes) {
    const nodeStr = formatNode(node, opts);
    lines.push(`  ${nodeStr}`);
  }
  
  lines.push('');
  
  // Edge definitions
  for (const edge of edges) {
    lines.push(`  ${sanitizeId(edge.from)} --> ${sanitizeId(edge.to)}`);
  }
  
  // Style definitions
  if (opts.showRiskColors) {
    lines.push('');
    lines.push('  %% Risk-based styling');
    
    const riskNodes = groupByRisk(nodes);
    
    for (const [risk, nodeIds] of Object.entries(riskNodes)) {
      if (nodeIds.length > 0 && risk !== 'none') {
        const color = RISK_COLORS[risk as RiskLevel];
        lines.push(`  classDef ${risk} fill:${color},stroke:${color},color:#fff`);
        lines.push(`  class ${nodeIds.join(',')} ${risk}`);
      }
    }
    
    // Root styling
    const rootNode = nodes.find(n => n.type === 'root');
    if (rootNode) {
      lines.push(`  classDef root fill:#8b5cf6,stroke:#8b5cf6,color:#fff`);
      lines.push(`  class ${sanitizeId(rootNode.id)} root`);
    }
  }
  
  return lines.join('\n');
}

/**
 * Format a node for Mermaid
 */
function formatNode(node: GraphNode, opts: Required<MermaidOptions>): string {
  const id = sanitizeId(node.id);
  let label = node.label;
  
  if (opts.includeVersions && node.version) {
    label += `\\n${node.version}`;
  }
  
  // Use different shapes for different types
  switch (node.type) {
    case 'root':
      return `${id}[["${label}"]]`;
    case 'direct':
      return `${id}["${label}"]`;
    case 'dev':
      return `${id}(["${label}"])`;
    default:
      return `${id}("${label}")`;
  }
}

/**
 * Sanitize ID for Mermaid (remove special characters)
 */
function sanitizeId(id: string): string {
  return id.replace(/[@\/\-\.]/g, '_');
}

/**
 * Group nodes by risk level
 */
function groupByRisk(nodes: GraphNode[]): Record<string, string[]> {
  const groups: Record<string, string[]> = {
    critical: [],
    high: [],
    medium: [],
    low: [],
    none: [],
  };
  
  for (const node of nodes) {
    const risk = node.risk ?? 'none';
    groups[risk].push(sanitizeId(node.id));
  }
  
  return groups;
}

/**
 * Get relevant node IDs (paths to target nodes)
 */
function getRelevantIds(
  graph: DependencyGraph,
  targetIds: Set<string>
): Set<string> {
  const relevant = new Set<string>();
  relevant.add(graph.root);
  
  // Build parent map
  const children = new Map<string, string[]>();
  for (const edge of graph.edges) {
    const existing = children.get(edge.from) ?? [];
    existing.push(edge.to);
    children.set(edge.from, existing);
  }
  
  // DFS to find paths
  function dfs(nodeId: string, path: string[]): void {
    if (targetIds.has(nodeId)) {
      for (const id of path) {
        relevant.add(id);
      }
      relevant.add(nodeId);
    }
    
    const nodeChildren = children.get(nodeId) ?? [];
    for (const child of nodeChildren) {
      if (!path.includes(child)) {
        dfs(child, [...path, nodeId]);
      }
    }
  }
  
  dfs(graph.root, []);
  
  return relevant;
}

/**
 * Prioritize nodes for display
 */
function prioritizeNodes(nodes: GraphNode[], maxNodes: number): GraphNode[] {
  // Sort by priority: root > vulnerable > direct > transitive
  const sorted = [...nodes].sort((a, b) => {
    const getPriority = (n: GraphNode): number => {
      if (n.type === 'root') return 0;
      if (n.risk && n.risk !== 'none') return 1;
      if (n.direct) return 2;
      return 3 + n.depth;
    };
    return getPriority(a) - getPriority(b);
  });
  
  return sorted.slice(0, maxNodes);
}

// ============================================================================
// Additional Formats
// ============================================================================

/**
 * Render as simple text tree
 */
export function renderTextTree(graph: DependencyGraph): string {
  const lines: string[] = [];
  const root = graph.nodes.find(n => n.type === 'root');
  
  if (!root) {
    return '';
  }
  
  // Build children map
  const children = new Map<string, string[]>();
  for (const edge of graph.edges) {
    const existing = children.get(edge.from) ?? [];
    existing.push(edge.to);
    children.set(edge.from, existing);
  }
  
  // Get node by ID
  const nodeMap = new Map(graph.nodes.map(n => [n.id, n]));
  
  function printNode(id: string, prefix: string, isLast: boolean): void {
    const node = nodeMap.get(id);
    if (!node) return;
    
    const connector = isLast ? '└── ' : '├── ';
    const risk = node.risk && node.risk !== 'none' ? ` [${node.risk.toUpperCase()}]` : '';
    const version = node.version ? `@${node.version}` : '';
    
    lines.push(`${prefix}${connector}${node.label}${version}${risk}`);
    
    const nodeChildren = children.get(id) ?? [];
    const newPrefix = prefix + (isLast ? '    ' : '│   ');
    
    for (let i = 0; i < nodeChildren.length; i++) {
      printNode(nodeChildren[i], newPrefix, i === nodeChildren.length - 1);
    }
  }
  
  lines.push(`${root.label}${root.version ? `@${root.version}` : ''}`);
  
  const rootChildren = children.get(root.id) ?? [];
  for (let i = 0; i < rootChildren.length; i++) {
    printNode(rootChildren[i], '', i === rootChildren.length - 1);
  }
  
  return lines.join('\n');
}
