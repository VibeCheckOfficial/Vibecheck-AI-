/**
 * HTML Visualization Renderer
 * 
 * Renders interactive dependency graphs as self-contained HTML.
 */

import type {
  DependencyGraph,
  HtmlVisualizationOptions,
} from './types.js';
import { RISK_COLORS, NODE_TYPE_COLORS } from './types.js';

// ============================================================================
// Default Options
// ============================================================================

const DEFAULT_OPTIONS: Required<HtmlVisualizationOptions> = {
  width: 1200,
  height: 800,
  interactive: true,
  showLabels: true,
  colorScheme: 'type',
};

// ============================================================================
// HTML Renderer
// ============================================================================

/**
 * Render a dependency graph as interactive HTML using D3.js
 */
export function renderHtmlVisualization(
  graph: DependencyGraph,
  options: HtmlVisualizationOptions = {}
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  // Prepare data for D3
  const nodesJson = JSON.stringify(graph.nodes.map(n => ({
    id: n.id,
    label: n.label,
    version: n.version,
    type: n.type,
    risk: n.risk,
    depth: n.depth,
  })));
  
  const edgesJson = JSON.stringify(graph.edges.map(e => ({
    source: e.from,
    target: e.to,
    type: e.type,
  })));

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dependency Graph - ${graph.root}</title>
  <script src="https://d3js.org/d3.v7.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: system-ui, sans-serif; 
      background: #0f0f0f;
      color: #fff;
    }
    #header {
      padding: 1rem 2rem;
      border-bottom: 1px solid #333;
    }
    #header h1 {
      font-size: 1.5rem;
      background: linear-gradient(135deg, #8b5cf6, #06b6d4);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    #header .stats {
      margin-top: 0.5rem;
      color: #888;
      font-size: 0.9rem;
    }
    #graph {
      width: 100%;
      height: calc(100vh - 80px);
    }
    .node circle {
      stroke: #fff;
      stroke-width: 1.5px;
      cursor: pointer;
    }
    .node text {
      font-size: 10px;
      fill: #fff;
      pointer-events: none;
    }
    .link {
      stroke: #444;
      stroke-opacity: 0.6;
      fill: none;
    }
    .link.dependency { stroke: #666; }
    .link.devDependency { stroke: #f59e0b; stroke-dasharray: 4,2; }
    .link.peerDependency { stroke: #10b981; stroke-dasharray: 2,2; }
    #tooltip {
      position: absolute;
      background: #1a1a1a;
      border: 1px solid #333;
      border-radius: 4px;
      padding: 0.75rem;
      font-size: 0.85rem;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.2s;
      max-width: 300px;
    }
    #tooltip.visible { opacity: 1; }
    #tooltip .name { font-weight: bold; color: #8b5cf6; }
    #tooltip .version { color: #888; margin-left: 0.5rem; }
    #tooltip .type { margin-top: 0.25rem; color: #aaa; }
    #tooltip .risk { margin-top: 0.25rem; font-weight: 500; }
    #tooltip .risk.critical { color: ${RISK_COLORS.critical}; }
    #tooltip .risk.high { color: ${RISK_COLORS.high}; }
    #tooltip .risk.medium { color: ${RISK_COLORS.medium}; }
    #tooltip .risk.low { color: ${RISK_COLORS.low}; }
    #legend {
      position: fixed;
      bottom: 1rem;
      left: 1rem;
      background: #1a1a1a;
      border: 1px solid #333;
      border-radius: 4px;
      padding: 0.75rem;
    }
    #legend h4 { margin-bottom: 0.5rem; font-size: 0.8rem; color: #888; }
    .legend-item { display: flex; align-items: center; gap: 0.5rem; margin: 0.25rem 0; font-size: 0.75rem; }
    .legend-color { width: 12px; height: 12px; border-radius: 50%; }
  </style>
</head>
<body>
  <div id="header">
    <h1>${graph.root} Dependencies</h1>
    <div class="stats">
      ${graph.nodes.length} packages | 
      ${graph.metadata.directCount} direct | 
      ${graph.metadata.transitiveCount} transitive |
      ${graph.metadata.vulnerableCount} vulnerable
    </div>
  </div>
  <div id="graph"></div>
  <div id="tooltip"></div>
  <div id="legend">
    <h4>Node Types</h4>
    <div class="legend-item"><div class="legend-color" style="background:${NODE_TYPE_COLORS.root}"></div> Root</div>
    <div class="legend-item"><div class="legend-color" style="background:${NODE_TYPE_COLORS.direct}"></div> Direct</div>
    <div class="legend-item"><div class="legend-color" style="background:${NODE_TYPE_COLORS.transitive}"></div> Transitive</div>
    <div class="legend-item"><div class="legend-color" style="background:${NODE_TYPE_COLORS.dev}"></div> Dev</div>
  </div>
  
  <script>
    const nodes = ${nodesJson};
    const links = ${edgesJson};
    
    const width = window.innerWidth;
    const height = window.innerHeight - 80;
    
    const colorScheme = '${opts.colorScheme}';
    const typeColors = ${JSON.stringify(NODE_TYPE_COLORS)};
    const riskColors = ${JSON.stringify(RISK_COLORS)};
    
    function getNodeColor(d) {
      if (colorScheme === 'risk' && d.risk && d.risk !== 'none') {
        return riskColors[d.risk];
      }
      return typeColors[d.type] || typeColors.transitive;
    }
    
    function getNodeRadius(d) {
      if (d.type === 'root') return 20;
      if (d.type === 'direct') return 12;
      return 8;
    }
    
    // Create SVG
    const svg = d3.select('#graph')
      .append('svg')
      .attr('width', width)
      .attr('height', height);
    
    // Add zoom
    const g = svg.append('g');
    ${opts.interactive ? `
    svg.call(d3.zoom()
      .extent([[0, 0], [width, height]])
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => g.attr('transform', event.transform))
    );` : ''}
    
    // Create simulation
    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(d => d.id).distance(80))
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(d => getNodeRadius(d) + 5));
    
    // Draw links
    const link = g.append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('class', d => 'link ' + d.type)
      .attr('stroke-width', 1);
    
    // Draw nodes
    const node = g.append('g')
      .selectAll('g')
      .data(nodes)
      .join('g')
      .attr('class', 'node')
      .call(d3.drag()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended));
    
    node.append('circle')
      .attr('r', d => getNodeRadius(d))
      .attr('fill', d => getNodeColor(d))
      .on('mouseover', showTooltip)
      .on('mouseout', hideTooltip);
    
    ${opts.showLabels ? `
    node.append('text')
      .attr('dy', d => getNodeRadius(d) + 12)
      .attr('text-anchor', 'middle')
      .text(d => d.label.length > 15 ? d.label.slice(0, 12) + '...' : d.label);` : ''}
    
    // Tooltip
    const tooltip = d3.select('#tooltip');
    
    function showTooltip(event, d) {
      let riskHtml = '';
      if (d.risk && d.risk !== 'none') {
        riskHtml = '<div class="risk ' + d.risk + '">' + d.risk.toUpperCase() + ' RISK</div>';
      }
      
      tooltip.html(
        '<span class="name">' + d.label + '</span>' +
        (d.version ? '<span class="version">v' + d.version + '</span>' : '') +
        '<div class="type">' + d.type + '</div>' +
        riskHtml
      )
      .style('left', (event.pageX + 10) + 'px')
      .style('top', (event.pageY - 10) + 'px')
      .classed('visible', true);
    }
    
    function hideTooltip() {
      tooltip.classed('visible', false);
    }
    
    // Drag handlers
    function dragstarted(event, d) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }
    
    function dragged(event, d) {
      d.fx = event.x;
      d.fy = event.y;
    }
    
    function dragended(event, d) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }
    
    // Update positions on tick
    simulation.on('tick', () => {
      link
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);
      
      node.attr('transform', d => 'translate(' + d.x + ',' + d.y + ')');
    });
  </script>
</body>
</html>`;
}
