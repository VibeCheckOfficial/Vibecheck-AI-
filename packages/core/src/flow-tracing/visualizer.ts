/**
 * Flow Tracing Visualizer
 * 
 * Generates visual representations of data flow for terminal and other outputs.
 * Supports ASCII art, Mermaid diagrams, and formatted text output.
 * 
 * @module flow-tracing/visualizer
 */

import type { FlowReport, FlowPath, FlowIssue, FlowNode, FlowGraph } from './types.js';
import * as path from 'node:path';

// ============================================================================
// Color Codes (ANSI)
// ============================================================================

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
};

// ============================================================================
// ASCII Box Drawing
// ============================================================================

const BOX = {
  topLeft: '┌',
  topRight: '┐',
  bottomLeft: '└',
  bottomRight: '┘',
  horizontal: '─',
  vertical: '│',
  arrow: '→',
  arrowDown: '↓',
  bullet: '•',
  check: '✓',
  cross: '✗',
  warning: '⚠',
};

// ============================================================================
// Terminal Visualizer
// ============================================================================

/**
 * Generate terminal-friendly output for a flow report
 */
export function visualizeReport(report: FlowReport, useColors = true): string {
  const c = useColors ? COLORS : Object.fromEntries(
    Object.keys(COLORS).map(k => [k, ''])
  );
  
  const lines: string[] = [];
  
  // Header
  lines.push('');
  lines.push(`${c.cyan}${c.bold}╔════════════════════════════════════════════════════════════════╗${c.reset}`);
  lines.push(`${c.cyan}${c.bold}║              📊 FLOW TRACING REPORT                            ║${c.reset}`);
  lines.push(`${c.cyan}${c.bold}╚════════════════════════════════════════════════════════════════╝${c.reset}`);
  lines.push('');
  
  // Summary
  lines.push(`${c.white}${c.bold}Summary${c.reset}`);
  lines.push(`${c.dim}${'─'.repeat(50)}${c.reset}`);
  lines.push(`  Files Analyzed:      ${c.cyan}${report.summary.filesAnalyzed}${c.reset}`);
  lines.push(`  Data Sources:        ${c.green}${report.summary.sourcesFound}${c.reset}`);
  lines.push(`  Data Sinks:          ${c.yellow}${report.summary.sinksFound}${c.reset}`);
  lines.push(`  Flow Paths Traced:   ${c.blue}${report.summary.pathsTraced}${c.reset}`);
  lines.push(`  Unvalidated Paths:   ${report.summary.unvalidatedPaths > 0 ? c.red : c.green}${report.summary.unvalidatedPaths}${c.reset}`);
  lines.push(`  Issues Found:        ${report.summary.issuesFound > 0 ? c.red : c.green}${report.summary.issuesFound}${c.reset}`);
  lines.push('');
  
  // Issues by severity
  if (report.summary.issuesFound > 0) {
    lines.push(`${c.white}${c.bold}Issues by Severity${c.reset}`);
    lines.push(`${c.dim}${'─'.repeat(50)}${c.reset}`);
    if (report.summary.issuesBySeverity.critical > 0) {
      lines.push(`  ${c.bgRed}${c.white} CRITICAL ${c.reset} ${report.summary.issuesBySeverity.critical}`);
    }
    if (report.summary.issuesBySeverity.error > 0) {
      lines.push(`  ${c.red}  ERROR   ${c.reset} ${report.summary.issuesBySeverity.error}`);
    }
    if (report.summary.issuesBySeverity.warning > 0) {
      lines.push(`  ${c.yellow}  WARNING ${c.reset} ${report.summary.issuesBySeverity.warning}`);
    }
    if (report.summary.issuesBySeverity.info > 0) {
      lines.push(`  ${c.blue}  INFO    ${c.reset} ${report.summary.issuesBySeverity.info}`);
    }
    lines.push('');
  }
  
  // Top issues
  if (report.issues.length > 0) {
    lines.push(`${c.white}${c.bold}Issues${c.reset}`);
    lines.push(`${c.dim}${'─'.repeat(50)}${c.reset}`);
    
    for (const issue of report.issues.slice(0, 10)) {
      const severityColor = getSeverityColor(issue.severity, c);
      const icon = getSeverityIcon(issue.severity);
      
      lines.push('');
      lines.push(`  ${severityColor}${icon} ${issue.title}${c.reset}`);
      lines.push(`    ${c.dim}${issue.description}${c.reset}`);
      
      // Show path
      if (issue.path) {
        const sourceLoc = formatLocation(issue.path.source.location);
        const sinkLoc = formatLocation(issue.path.sink.location);
        lines.push(`    ${c.cyan}Source:${c.reset} ${issue.path.source.label} ${c.dim}(${sourceLoc})${c.reset}`);
        lines.push(`    ${c.yellow}Sink:${c.reset}   ${issue.path.sink.label} ${c.dim}(${sinkLoc})${c.reset}`);
      }
      
      if (issue.suggestion) {
        lines.push(`    ${c.green}Fix:${c.reset}    ${issue.suggestion}`);
      }
    }
    
    if (report.issues.length > 10) {
      lines.push('');
      lines.push(`  ${c.dim}... and ${report.issues.length - 10} more issues${c.reset}`);
    }
    lines.push('');
  }
  
  // Flow paths visualization
  if (report.paths.length > 0) {
    lines.push(`${c.white}${c.bold}Data Flow Paths${c.reset}`);
    lines.push(`${c.dim}${'─'.repeat(50)}${c.reset}`);
    
    // Show top 5 paths
    for (const flowPath of report.paths.slice(0, 5)) {
      lines.push('');
      lines.push(visualizePath(flowPath, c));
    }
    
    if (report.paths.length > 5) {
      lines.push('');
      lines.push(`  ${c.dim}... and ${report.paths.length - 5} more paths${c.reset}`);
    }
    lines.push('');
  }
  
  // Footer
  lines.push(`${c.dim}${'─'.repeat(50)}${c.reset}`);
  lines.push(`${c.dim}Analysis completed in ${report.metadata.durationMs}ms${c.reset}`);
  lines.push('');
  
  return lines.join('\n');
}

/**
 * Visualize a single flow path
 */
export function visualizePath(flowPath: FlowPath, c: typeof COLORS): string {
  const lines: string[] = [];
  const riskColor = getRiskColor(flowPath.risk.level, c);
  
  // Path header
  lines.push(`  ${riskColor}${BOX.bullet} ${flowPath.source.sourceCategory} → ${flowPath.sink.sinkCategory}${c.reset}`);
  
  // Draw flow
  const nodes = flowPath.nodes;
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const isLast = i === nodes.length - 1;
    const nodeIcon = getNodeIcon(node);
    const nodeColor = getNodeColor(node, c);
    
    if (i === 0) {
      lines.push(`    ${nodeColor}${nodeIcon} ${node.label}${c.reset}`);
    } else {
      lines.push(`    ${c.dim}│${c.reset}`);
      lines.push(`    ${c.dim}▼${c.reset}`);
      lines.push(`    ${nodeColor}${nodeIcon} ${node.label}${c.reset}`);
    }
    
    // Show location
    lines.push(`    ${c.dim}  ${formatLocation(node.location)}${c.reset}`);
  }
  
  // Validation status
  if (flowPath.hasValidation) {
    lines.push(`    ${c.green}${BOX.check} Has validation${c.reset}`);
  } else {
    lines.push(`    ${c.red}${BOX.cross} No validation${c.reset}`);
  }
  
  return lines.join('\n');
}

/**
 * Generate a Mermaid diagram from a flow graph
 */
export function generateMermaidDiagram(graph: FlowGraph): string {
  const lines: string[] = [];
  
  lines.push('```mermaid');
  lines.push('flowchart TD');
  lines.push('');
  
  // Add nodes
  for (const node of graph.nodes) {
    const shape = getNodeShape(node);
    const label = escapeLabel(node.label);
    lines.push(`    ${node.id}${shape.open}"${label}"${shape.close}`);
  }
  
  lines.push('');
  
  // Add edges
  for (const edge of graph.edges) {
    const label = edge.label ? `|${escapeLabel(edge.label)}|` : '';
    lines.push(`    ${edge.from} -->${label} ${edge.to}`);
  }
  
  lines.push('');
  
  // Add styling
  lines.push('    classDef source fill:#4ade80,stroke:#166534');
  lines.push('    classDef sink fill:#f87171,stroke:#991b1b');
  lines.push('    classDef validation fill:#60a5fa,stroke:#1e40af');
  
  // Apply classes
  const sources = graph.nodes.filter(n => n.type === 'source').map(n => n.id);
  const sinks = graph.nodes.filter(n => n.type === 'sink').map(n => n.id);
  const validations = graph.nodes.filter(n => n.type === 'validation').map(n => n.id);
  
  if (sources.length > 0) {
    lines.push(`    class ${sources.join(',')} source`);
  }
  if (sinks.length > 0) {
    lines.push(`    class ${sinks.join(',')} sink`);
  }
  if (validations.length > 0) {
    lines.push(`    class ${validations.join(',')} validation`);
  }
  
  lines.push('```');
  
  return lines.join('\n');
}

// ============================================================================
// Helper Functions
// ============================================================================

function getSeverityColor(severity: string, c: typeof COLORS): string {
  switch (severity) {
    case 'critical': return c.bgRed + c.white;
    case 'error': return c.red;
    case 'warning': return c.yellow;
    case 'info': return c.blue;
    default: return c.white;
  }
}

function getSeverityIcon(severity: string): string {
  switch (severity) {
    case 'critical': return '🔴';
    case 'error': return '🟠';
    case 'warning': return '🟡';
    case 'info': return '🔵';
    default: return '⚪';
  }
}

function getRiskColor(level: string, c: typeof COLORS): string {
  switch (level) {
    case 'critical': return c.red + c.bold;
    case 'high': return c.red;
    case 'medium': return c.yellow;
    case 'low': return c.green;
    default: return c.white;
  }
}

function getNodeIcon(node: FlowNode): string {
  switch (node.type) {
    case 'source': return '📥';
    case 'sink': return '📤';
    case 'validation': return '✅';
    case 'transform': return '🔄';
    case 'variable': return '📦';
    case 'parameter': return '📋';
    case 'return': return '↩️';
    default: return '•';
  }
}

function getNodeColor(node: FlowNode, c: typeof COLORS): string {
  switch (node.type) {
    case 'source': return c.green;
    case 'sink': return node.riskLevel === 'critical' ? c.red : c.yellow;
    case 'validation': return c.blue;
    case 'transform': return c.magenta;
    default: return c.white;
  }
}

function getNodeShape(node: FlowNode): { open: string; close: string } {
  switch (node.type) {
    case 'source': return { open: '([', close: '])' };
    case 'sink': return { open: '[[', close: ']]' };
    case 'validation': return { open: '{', close: '}' };
    case 'condition': return { open: '{', close: '}' };
    default: return { open: '[', close: ']' };
  }
}

function formatLocation(loc: FlowNode['location']): string {
  const fileName = path.basename(loc.file);
  return `${fileName}:${loc.line}`;
}

function escapeLabel(label: string): string {
  return label
    .replace(/"/g, "'")
    .replace(/\[/g, '(')
    .replace(/\]/g, ')')
    .substring(0, 50);
}

// ============================================================================
// Export Summary
// ============================================================================

/**
 * Generate a compact one-line summary
 */
export function generateSummaryLine(report: FlowReport): string {
  const { summary } = report;
  
  if (summary.issuesFound === 0) {
    return `✓ No flow issues found (${summary.sourcesFound} sources → ${summary.sinksFound} sinks, ${summary.pathsTraced} paths)`;
  }
  
  const parts: string[] = [];
  if (summary.issuesBySeverity.critical > 0) {
    parts.push(`${summary.issuesBySeverity.critical} critical`);
  }
  if (summary.issuesBySeverity.error > 0) {
    parts.push(`${summary.issuesBySeverity.error} errors`);
  }
  if (summary.issuesBySeverity.warning > 0) {
    parts.push(`${summary.issuesBySeverity.warning} warnings`);
  }
  
  return `✗ ${parts.join(', ')} (${summary.unvalidatedPaths}/${summary.pathsTraced} unvalidated paths)`;
}
