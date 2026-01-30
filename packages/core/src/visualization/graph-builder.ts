/**
 * Dependency Graph Builder
 * 
 * Builds a dependency graph from package.json files.
 */

import * as fs from 'fs';
import * as path from 'path';

import type {
  DependencyGraph,
  GraphNode,
  GraphEdge,
  GraphMetadata,
  PackageJson,
  NodeType,
  EdgeType,
  RiskLevel,
} from './types.js';

// ============================================================================
// Graph Builder Options
// ============================================================================

export interface BuildOptions {
  /** Maximum depth to traverse */
  maxDepth?: number;
  /** Include dev dependencies */
  includeDev?: boolean;
  /** Include peer dependencies */
  includePeer?: boolean;
  /** Path to node_modules */
  nodeModulesPath?: string;
  /** Vulnerability map (package@version -> risk) */
  vulnerabilities?: Map<string, RiskLevel>;
}

const DEFAULT_OPTIONS: Required<BuildOptions> = {
  maxDepth: 5,
  includeDev: false,
  includePeer: false,
  nodeModulesPath: 'node_modules',
  vulnerabilities: new Map(),
};

// ============================================================================
// Graph Builder
// ============================================================================

/**
 * Build a dependency graph from a package.json
 */
export function buildDependencyGraph(
  packageJsonPath: string,
  options: BuildOptions = {}
): DependencyGraph {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const projectDir = path.dirname(packageJsonPath);
  
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  
  // Read root package.json
  const rootPkg = readPackageJson(packageJsonPath);
  if (!rootPkg) {
    throw new Error(`Cannot read package.json at ${packageJsonPath}`);
  }
  
  // Add root node
  const rootId = rootPkg.name;
  nodes.set(rootId, {
    id: rootId,
    label: rootPkg.name,
    version: rootPkg.version,
    type: 'root',
    direct: false,
    depth: 0,
  });
  
  // Process dependencies
  const visited = new Set<string>();
  
  // Direct dependencies
  if (rootPkg.dependencies) {
    processDepencies(
      rootPkg.dependencies,
      'dependency',
      rootId,
      projectDir,
      opts,
      1,
      nodes,
      edges,
      visited
    );
  }
  
  // Dev dependencies
  if (opts.includeDev && rootPkg.devDependencies) {
    processDepencies(
      rootPkg.devDependencies,
      'devDependency',
      rootId,
      projectDir,
      opts,
      1,
      nodes,
      edges,
      visited
    );
  }
  
  // Peer dependencies
  if (opts.includePeer && rootPkg.peerDependencies) {
    processDepencies(
      rootPkg.peerDependencies,
      'peerDependency',
      rootId,
      projectDir,
      opts,
      1,
      nodes,
      edges,
      visited
    );
  }
  
  // Calculate metadata
  const nodesArray = Array.from(nodes.values());
  const metadata: GraphMetadata = {
    directCount: nodesArray.filter(n => n.direct).length,
    transitiveCount: nodesArray.filter(n => !n.direct && n.type !== 'root').length,
    maxDepth: Math.max(...nodesArray.map(n => n.depth)),
    vulnerableCount: nodesArray.filter(n => n.risk && n.risk !== 'none').length,
  };
  
  return {
    root: rootId,
    nodes: nodesArray,
    edges,
    metadata,
  };
}

/**
 * Process dependencies recursively
 */
function processDepencies(
  deps: Record<string, string>,
  edgeType: EdgeType,
  parentId: string,
  projectDir: string,
  opts: Required<BuildOptions>,
  depth: number,
  nodes: Map<string, GraphNode>,
  edges: GraphEdge[],
  visited: Set<string>
): void {
  if (depth > opts.maxDepth) {
    return;
  }
  
  for (const [name, versionRange] of Object.entries(deps)) {
    const nodeId = name;
    
    // Add edge
    edges.push({
      from: parentId,
      to: nodeId,
      type: edgeType,
    });
    
    // Skip if already processed
    if (visited.has(nodeId)) {
      continue;
    }
    visited.add(nodeId);
    
    // Try to read package from node_modules
    const pkgPath = path.join(projectDir, opts.nodeModulesPath, name, 'package.json');
    const pkg = readPackageJson(pkgPath);
    
    const version = pkg?.version ?? versionRange;
    const versionKey = `${name}@${version}`;
    
    // Determine node type
    let nodeType: NodeType = depth === 1 ? 'direct' : 'transitive';
    if (edgeType === 'devDependency') nodeType = 'dev';
    if (edgeType === 'peerDependency') nodeType = 'peer';
    
    // Add node
    nodes.set(nodeId, {
      id: nodeId,
      label: name,
      version,
      type: nodeType,
      risk: opts.vulnerabilities.get(versionKey),
      direct: depth === 1,
      depth,
    });
    
    // Recurse into transitive dependencies
    if (pkg?.dependencies && depth < opts.maxDepth) {
      processDepencies(
        pkg.dependencies,
        'dependency',
        nodeId,
        projectDir,
        opts,
        depth + 1,
        nodes,
        edges,
        visited
      );
    }
  }
}

/**
 * Read and parse package.json
 */
function readPackageJson(filePath: string): PackageJson | null {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

// ============================================================================
// Graph Utilities
// ============================================================================

/**
 * Filter graph to only show paths to vulnerable packages
 */
export function filterToVulnerable(graph: DependencyGraph): DependencyGraph {
  const vulnerableIds = new Set(
    graph.nodes.filter(n => n.risk && n.risk !== 'none').map(n => n.id)
  );
  
  if (vulnerableIds.size === 0) {
    return graph;
  }
  
  // Find all nodes on paths to vulnerable packages
  const relevantIds = new Set<string>();
  relevantIds.add(graph.root);
  
  // BFS from root to find paths
  const queue = [graph.root];
  const parents = new Map<string, string[]>();
  
  while (queue.length > 0) {
    const current = queue.shift()!;
    
    for (const edge of graph.edges) {
      if (edge.from === current && !parents.has(edge.to)) {
        parents.set(edge.to, [...(parents.get(current) ?? []), current]);
        queue.push(edge.to);
        
        // If this is vulnerable, add the path
        if (vulnerableIds.has(edge.to)) {
          for (const id of parents.get(edge.to) ?? []) {
            relevantIds.add(id);
          }
          relevantIds.add(edge.to);
        }
      }
    }
  }
  
  return {
    root: graph.root,
    nodes: graph.nodes.filter(n => relevantIds.has(n.id)),
    edges: graph.edges.filter(e => relevantIds.has(e.from) && relevantIds.has(e.to)),
    metadata: graph.metadata,
  };
}

/**
 * Get direct dependencies only
 */
export function getDirectDependencies(graph: DependencyGraph): GraphNode[] {
  return graph.nodes.filter(n => n.direct);
}

/**
 * Get nodes at a specific depth
 */
export function getNodesAtDepth(graph: DependencyGraph, depth: number): GraphNode[] {
  return graph.nodes.filter(n => n.depth === depth);
}
