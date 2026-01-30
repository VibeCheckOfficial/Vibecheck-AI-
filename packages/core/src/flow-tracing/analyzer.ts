/**
 * Flow Tracing Analyzer
 * 
 * Analyzes parsed code to build data flow graphs and trace paths
 * from sources to sinks. Identifies missing validations and
 * potential security issues.
 * 
 * @module flow-tracing/analyzer
 */

import type {
  FlowNode,
  FlowEdge,
  FlowGraph,
  FlowPath,
  FlowIssue,
  FlowEdgeType,
} from './types.js';
import { parseSourceCode, findReferencedVariables, extractFunctionCalls } from './parser.js';
import { getDefaultConfig } from './patterns.js';
import { randomUUID } from 'node:crypto';

const generateId = () => randomUUID().slice(0, 12);

// ============================================================================
// Types
// ============================================================================

interface AnalyzerOptions {
  maxPathDepth?: number;
  includeIntermediateNodes?: boolean;
}

// ============================================================================
// Flow Graph Builder
// ============================================================================

/**
 * Build a flow graph from parsed nodes
 */
export function buildFlowGraph(
  nodes: FlowNode[],
  code: string,
  filePath: string
): FlowGraph {
  const edges: FlowEdge[] = [];
  const lines = code.split('\n');
  
  // Build a map of variable names to their defining nodes
  const varToNode = new Map<string, FlowNode>();
  for (const node of nodes) {
    if (node.type === 'variable' || node.type === 'parameter' || node.type === 'source') {
      const varName = extractVarName(node);
      if (varName) {
        varToNode.set(varName, node);
      }
    }
  }
  
  // Track node IDs for deduplication
  const nodeSet = new Set(nodes.map(n => n.id));
  
  // Build edges by analyzing data flow
  for (const node of nodes) {
    // Skip if this is a source - sources don't have incoming edges
    if (node.type === 'source') continue;
    
    const line = lines[node.location.line - 1] || '';
    const referencedVars = findReferencedVariables(line, new Set(varToNode.keys()));
    
    // Create edges from referenced variables to this node
    for (const varName of referencedVars) {
      const sourceNode = varToNode.get(varName);
      if (sourceNode && sourceNode.id !== node.id) {
        edges.push(createEdge(sourceNode, node, determineEdgeType(node)));
      }
    }
    
    // Handle function calls - connect call result to variables
    const funcCalls = extractFunctionCalls(line);
    for (const funcName of funcCalls) {
      const funcNode = nodes.find(n => 
        n.type === 'return' && 
        (n.metadata?.functionName === funcName || line.includes(`${funcName}(`))
      );
      if (funcNode && funcNode.id !== node.id) {
        edges.push(createEdge(funcNode, node, 'call'));
      }
    }
  }
  
  // Count sources and sinks
  const sourceCount = nodes.filter(n => n.type === 'source').length;
  const sinkCount = nodes.filter(n => n.type === 'sink').length;
  
  return {
    nodes,
    edges,
    metadata: {
      files: [filePath],
      analyzedAt: new Date().toISOString(),
      sourceCount,
      sinkCount,
      unvalidatedPaths: 0, // Will be calculated later
    },
  };
}

// ============================================================================
// Path Tracing
// ============================================================================

/**
 * Trace all paths from sources to sinks
 */
export function traceFlowPaths(
  graph: FlowGraph,
  options: AnalyzerOptions = {}
): FlowPath[] {
  const { maxPathDepth = 20 } = options;
  const paths: FlowPath[] = [];
  
  const sources = graph.nodes.filter(n => n.type === 'source');
  const sinks = graph.nodes.filter(n => n.type === 'sink');
  
  // Build adjacency list for faster traversal
  const adjacency = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (!adjacency.has(edge.from)) {
      adjacency.set(edge.from, []);
    }
    adjacency.get(edge.from)!.push(edge.to);
  }
  
  // For each source, find all paths to sinks
  for (const source of sources) {
    for (const sink of sinks) {
      const foundPaths = findAllPaths(
        source.id,
        sink.id,
        adjacency,
        graph.nodes,
        graph.edges,
        maxPathDepth
      );
      
      for (const pathNodeIds of foundPaths) {
        const pathNodes = pathNodeIds.map(id => graph.nodes.find(n => n.id === id)!);
        const pathEdges = getPathEdges(pathNodeIds, graph.edges);
        
        const validations = pathNodes.filter(n => n.type === 'validation');
        const transformations = pathNodes.filter(n => n.type === 'transform');
        
        paths.push({
          id: generateId(),
          source,
          sink,
          nodes: pathNodes,
          edges: pathEdges,
          hasValidation: validations.length > 0,
          validations,
          transformations,
          risk: assessPathRisk(source, sink, validations),
        });
      }
    }
  }
  
  // If no direct paths found, create implicit paths for same-line relationships
  if (paths.length === 0) {
    for (const source of sources) {
      for (const sink of sinks) {
        // Check if source and sink are on the same line or nearby
        const lineDiff = Math.abs(source.location.line - sink.location.line);
        if (lineDiff <= 10) {
          paths.push({
            id: generateId(),
            source,
            sink,
            nodes: [source, sink],
            edges: [createEdge(source, sink, 'assignment')],
            hasValidation: false,
            validations: [],
            transformations: [],
            risk: assessPathRisk(source, sink, []),
          });
        }
      }
    }
  }
  
  return paths;
}

/**
 * Find all paths between two nodes using BFS
 */
function findAllPaths(
  startId: string,
  endId: string,
  adjacency: Map<string, string[]>,
  nodes: FlowNode[],
  edges: FlowEdge[],
  maxDepth: number
): string[][] {
  const paths: string[][] = [];
  const queue: { path: string[]; visited: Set<string> }[] = [
    { path: [startId], visited: new Set([startId]) }
  ];
  
  while (queue.length > 0) {
    const { path, visited } = queue.shift()!;
    const current = path[path.length - 1];
    
    if (path.length > maxDepth) continue;
    
    if (current === endId) {
      paths.push([...path]);
      continue;
    }
    
    const neighbors = adjacency.get(current) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        const newVisited = new Set(visited);
        newVisited.add(neighbor);
        queue.push({ path: [...path, neighbor], visited: newVisited });
      }
    }
  }
  
  return paths;
}

/**
 * Get edges for a path
 */
function getPathEdges(nodeIds: string[], allEdges: FlowEdge[]): FlowEdge[] {
  const edges: FlowEdge[] = [];
  
  for (let i = 0; i < nodeIds.length - 1; i++) {
    const edge = allEdges.find(e => e.from === nodeIds[i] && e.to === nodeIds[i + 1]);
    if (edge) {
      edges.push(edge);
    }
  }
  
  return edges;
}

// ============================================================================
// Issue Detection
// ============================================================================

/**
 * Detect issues in flow paths
 */
export function detectFlowIssues(paths: FlowPath[]): FlowIssue[] {
  const issues: FlowIssue[] = [];
  
  for (const path of paths) {
    // Check for missing validation on high-risk paths
    if (!path.hasValidation && path.risk.level !== 'low') {
      issues.push({
        id: generateId(),
        severity: path.risk.level === 'critical' ? 'critical' : 
                  path.risk.level === 'high' ? 'error' : 'warning',
        type: 'missing_validation',
        title: `Unvalidated data flow to ${path.sink.sinkCategory}`,
        description: `Data from ${path.source.sourceCategory} flows to ${path.sink.sinkCategory} without validation.`,
        path,
        suggestion: getSuggestionForSink(path.sink.sinkCategory),
        docLink: getDocLinkForIssue('missing_validation'),
      });
    }
    
    // Check for unsafe sinks
    if (path.sink.riskLevel === 'critical') {
      const hasProperSanitization = path.validations.some(v => 
        v.metadata?.patternName === 'sanitization' ||
        v.metadata?.patternName === 'parameterized_query'
      );
      
      if (!hasProperSanitization) {
        issues.push({
          id: generateId(),
          severity: 'critical',
          type: 'unsafe_sink',
          title: `Potentially unsafe ${path.sink.sinkCategory}`,
          description: `Data flows to a critical sink (${path.sink.label}) without proper sanitization.`,
          path,
          suggestion: getSuggestionForSink(path.sink.sinkCategory),
          docLink: getDocLinkForIssue('unsafe_sink'),
        });
      }
    }
    
    // Check for untrusted source to sensitive sink
    if (
      path.source.sourceCategory === 'user_input' &&
      ['sql_query', 'shell_exec', 'eval', 'html_render'].includes(path.sink.sinkCategory || '')
    ) {
      issues.push({
        id: generateId(),
        severity: 'critical',
        type: 'untrusted_source',
        title: 'User input flows to sensitive operation',
        description: `User input from ${path.source.label} flows directly to ${path.sink.label}.`,
        path,
        suggestion: 'Always validate and sanitize user input before using it in sensitive operations.',
        docLink: getDocLinkForIssue('untrusted_source'),
      });
    }
  }
  
  return issues;
}

// ============================================================================
// Risk Assessment
// ============================================================================

/**
 * Assess the risk level of a flow path
 */
function assessPathRisk(
  source: FlowNode,
  sink: FlowNode,
  validations: FlowNode[]
): { level: 'low' | 'medium' | 'high' | 'critical'; reasons: string[] } {
  const reasons: string[] = [];
  let level: 'low' | 'medium' | 'high' | 'critical' = 'low';
  
  // Check sink risk level
  if (sink.riskLevel === 'critical') {
    level = 'critical';
    reasons.push(`Critical sink: ${sink.sinkCategory}`);
  } else if (sink.riskLevel === 'high') {
    level = level === 'critical' ? 'critical' : 'high';
    reasons.push(`High-risk sink: ${sink.sinkCategory}`);
  } else if (sink.riskLevel === 'medium') {
    level = ['critical', 'high'].includes(level) ? level : 'medium';
    reasons.push(`Medium-risk sink: ${sink.sinkCategory}`);
  }
  
  // Check source category
  if (source.sourceCategory === 'user_input') {
    if (level !== 'critical') level = 'high';
    reasons.push('Data originates from user input');
  } else if (source.sourceCategory === 'external') {
    if (!['critical', 'high'].includes(level)) level = 'medium';
    reasons.push('Data originates from external source');
  }
  
  // Reduce risk if validations exist
  if (validations.length > 0) {
    if (level === 'critical') level = 'high';
    else if (level === 'high') level = 'medium';
    else if (level === 'medium') level = 'low';
    reasons.push(`Has ${validations.length} validation(s)`);
  }
  
  return { level, reasons };
}

// ============================================================================
// Helper Functions
// ============================================================================

function extractVarName(node: FlowNode): string | null {
  if (node.type === 'variable' || node.type === 'parameter') {
    return node.label;
  }
  if (node.type === 'source') {
    // Extract variable name from source code
    const match = node.code.match(/(?:const|let|var)\s+(\w+)\s*=/);
    return match ? match[1] : null;
  }
  return null;
}

function createEdge(from: FlowNode, to: FlowNode, type: FlowEdgeType): FlowEdge {
  return {
    id: generateId(),
    from: from.id,
    to: to.id,
    type,
    label: `${from.label} → ${to.label}`,
    transforms: to.type === 'transform',
    validates: to.type === 'validation',
  };
}

function determineEdgeType(node: FlowNode): FlowEdgeType {
  switch (node.type) {
    case 'parameter':
      return 'parameter';
    case 'return':
      return 'return';
    case 'transform':
      return 'transform';
    case 'property':
      return 'property';
    case 'call':
      return 'call';
    default:
      return 'assignment';
  }
}

function getSuggestionForSink(sinkCategory?: string): string {
  switch (sinkCategory) {
    case 'sql_query':
      return 'Use parameterized queries or an ORM to prevent SQL injection.';
    case 'html_render':
      return 'Use a sanitization library like DOMPurify or escape HTML entities.';
    case 'shell_exec':
      return 'Avoid shell execution with user input. If necessary, use strict allowlists.';
    case 'eval':
      return 'Avoid eval() entirely. Use safer alternatives like JSON.parse().';
    case 'database_write':
      return 'Validate data types and constraints before writing to the database.';
    case 'file_write':
      return 'Validate file paths and content before writing.';
    default:
      return 'Add input validation using Zod, Joi, or similar validation library.';
  }
}

function getDocLinkForIssue(issueType: string): string {
  const baseUrl = 'https://docs.vibecheckai.dev/security';
  return `${baseUrl}/${issueType}`;
}

// ============================================================================
// Main Analysis Function
// ============================================================================

/**
 * Analyze a single file for data flow
 */
export function analyzeFile(
  code: string,
  filePath: string,
  options: AnalyzerOptions = {}
): { graph: FlowGraph; paths: FlowPath[]; issues: FlowIssue[] } {
  const config = getDefaultConfig();
  
  // Parse the source code
  const parseResult = parseSourceCode(code, filePath, config);
  
  // Build the flow graph
  const graph = buildFlowGraph(parseResult.nodes, code, filePath);
  
  // Trace all paths
  const paths = traceFlowPaths(graph, options);
  
  // Update unvalidated paths count
  graph.metadata.unvalidatedPaths = paths.filter(p => !p.hasValidation).length;
  
  // Detect issues
  const issues = detectFlowIssues(paths);
  
  return { graph, paths, issues };
}
