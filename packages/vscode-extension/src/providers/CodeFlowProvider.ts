import * as vscode from 'vscode';
import * as path from 'path';

interface FlowNode {
  id: string;
  type: 'source' | 'transform' | 'sink' | 'branch' | 'call';
  label: string;
  file: string;
  line: number;
  column: number;
  code: string;
  tainted?: boolean;
  riskLevel?: 'safe' | 'low' | 'medium' | 'high' | 'critical';
}

interface FlowEdge {
  from: string;
  to: string;
  label?: string;
  type: 'data' | 'control' | 'call';
}

interface DataFlow {
  id: string;
  name: string;
  description: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  entryPoint: string;
  exitPoints: string[];
  taintedPaths: string[][];
}

export class CodeFlowProvider implements vscode.Disposable {
  private context: vscode.ExtensionContext;
  private decorationType: vscode.TextEditorDecorationType;
  private flowLineDecoration: vscode.TextEditorDecorationType;
  private panel: vscode.WebviewPanel | undefined;
  private currentFlow: DataFlow | undefined;
  private disposables: vscode.Disposable[] = [];

  constructor(context: vscode.ExtensionContext) {
    this.context = context;

    // Create decorations for flow visualization
    this.decorationType = vscode.window.createTextEditorDecorationType({
      backgroundColor: 'rgba(139, 92, 246, 0.15)',
      borderRadius: '3px',
      after: {
        margin: '0 0 0 12px',
        color: 'rgba(139, 92, 246, 0.8)',
        fontStyle: 'italic'
      }
    });

    this.flowLineDecoration = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      overviewRulerColor: 'rgba(139, 92, 246, 0.6)',
      overviewRulerLane: vscode.OverviewRulerLane.Left,
      gutterIconPath: vscode.Uri.file(path.join(context.extensionPath, 'images', 'icon-flow.svg')),
      gutterIconSize: '60%'
    });

    // Track active editor changes
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(() => this.updateDecorations())
    );
  }

  async analyzeDataFlow(
    document: vscode.TextDocument,
    position?: vscode.Position
  ): Promise<DataFlow | undefined> {
    const text = document.getText();
    const fileName = path.basename(document.fileName);

    // Parse the code and trace data flow
    const flow = await this.traceFlow(text, document.fileName, position);

    if (flow) {
      this.currentFlow = flow;
      this.showFlowPanel(flow);
      this.updateDecorations();
    }

    return flow;
  }

  private async traceFlow(
    code: string,
    filePath: string,
    startPosition?: vscode.Position
  ): Promise<DataFlow | undefined> {
    const nodes: FlowNode[] = [];
    const edges: FlowEdge[] = [];
    const lines = code.split('\n');

    // Find data sources (user input, API responses, etc.)
    const sourcePatterns = [
      { pattern: /req\.(body|query|params|headers)\[?['"]?(\w+)['"]?\]?/g, type: 'user-input', risk: 'high' as const },
      { pattern: /document\.(getElementById|querySelector|forms)\s*\([^)]+\)/g, type: 'dom-input', risk: 'medium' as const },
      { pattern: /fetch\s*\([^)]+\)|axios\.(get|post)\s*\([^)]+\)/g, type: 'api-response', risk: 'medium' as const },
      { pattern: /localStorage\.(getItem|get)\s*\([^)]+\)/g, type: 'storage', risk: 'low' as const },
      { pattern: /process\.env\.\w+/g, type: 'env-var', risk: 'low' as const },
      { pattern: /useParams|useSearchParams|useQuery/g, type: 'url-param', risk: 'high' as const }
    ];

    // Find data sinks (dangerous operations)
    const sinkPatterns = [
      { pattern: /eval\s*\(/g, type: 'code-exec', risk: 'critical' as const },
      { pattern: /innerHTML\s*=/g, type: 'dom-xss', risk: 'high' as const },
      { pattern: /document\.write\s*\(/g, type: 'dom-xss', risk: 'high' as const },
      { pattern: /\.query\s*\([^)]*\$\{/g, type: 'sql-injection', risk: 'critical' as const },
      { pattern: /exec\s*\(|spawn\s*\(/g, type: 'cmd-injection', risk: 'critical' as const },
      { pattern: /redirect\s*\(|res\.redirect\s*\(/g, type: 'open-redirect', risk: 'high' as const },
      { pattern: /dangerouslySetInnerHTML/g, type: 'react-xss', risk: 'high' as const }
    ];

    // Find transforms
    const transformPatterns = [
      { pattern: /\.replace\s*\([^)]+\)/g, type: 'sanitize', safe: true },
      { pattern: /encodeURIComponent|escape|sanitize/g, type: 'encode', safe: true },
      { pattern: /\.toLowerCase\(\)|\.toUpperCase\(\)|\.trim\(\)/g, type: 'normalize', safe: false },
      { pattern: /JSON\.(parse|stringify)\s*\(/g, type: 'json', safe: false },
      { pattern: /parseInt|parseFloat|Number\s*\(/g, type: 'cast', safe: true }
    ];

    let nodeId = 0;
    const fileName = path.basename(filePath);

    // Scan for sources
    for (const { pattern, type, risk } of sourcePatterns) {
      let match;
      while ((match = pattern.exec(code)) !== null) {
        const line = code.substring(0, match.index).split('\n').length;
        const column = match.index - code.lastIndexOf('\n', match.index - 1);

        nodes.push({
          id: `node-${nodeId++}`,
          type: 'source',
          label: `Data Source: ${type}`,
          file: fileName,
          line,
          column,
          code: match[0],
          tainted: true,
          riskLevel: risk
        });
      }
    }

    // Scan for sinks
    for (const { pattern, type, risk } of sinkPatterns) {
      let match;
      while ((match = pattern.exec(code)) !== null) {
        const line = code.substring(0, match.index).split('\n').length;
        const column = match.index - code.lastIndexOf('\n', match.index - 1);

        nodes.push({
          id: `node-${nodeId++}`,
          type: 'sink',
          label: `Dangerous Sink: ${type}`,
          file: fileName,
          line,
          column,
          code: match[0],
          riskLevel: risk
        });
      }
    }

    // Scan for transforms
    for (const { pattern, type, safe } of transformPatterns) {
      let match;
      while ((match = pattern.exec(code)) !== null) {
        const line = code.substring(0, match.index).split('\n').length;
        const column = match.index - code.lastIndexOf('\n', match.index - 1);

        nodes.push({
          id: `node-${nodeId++}`,
          type: 'transform',
          label: `Transform: ${type}`,
          file: fileName,
          line,
          column,
          code: match[0],
          riskLevel: safe ? 'safe' : 'low'
        });
      }
    }

    // Sort nodes by line number
    nodes.sort((a, b) => a.line - b.line);

    // Build edges based on variable tracking
    const variableFlows = this.trackVariables(code, nodes);
    edges.push(...variableFlows);

    // Find tainted paths (source -> sink without sanitization)
    const taintedPaths = this.findTaintedPaths(nodes, edges);

    if (nodes.length === 0) {
      return undefined;
    }

    return {
      id: `flow-${Date.now()}`,
      name: `Data Flow Analysis: ${fileName}`,
      description: `Traced ${nodes.length} data flow points`,
      nodes,
      edges,
      entryPoint: nodes[0]?.id || '',
      exitPoints: nodes.filter(n => n.type === 'sink').map(n => n.id),
      taintedPaths
    };
  }

  private trackVariables(code: string, nodes: FlowNode[]): FlowEdge[] {
    const edges: FlowEdge[] = [];
    const variableAssignments = new Map<string, string[]>();

    // Track variable assignments
    const assignmentPattern = /(?:const|let|var)\s+(\w+)\s*=|(\w+)\s*=/g;
    let match;

    while ((match = assignmentPattern.exec(code)) !== null) {
      const varName = match[1] || match[2];
      const line = code.substring(0, match.index).split('\n').length;

      // Find nodes on this line
      const lineNodes = nodes.filter(n => n.line === line);
      if (lineNodes.length > 0 && varName) {
        if (!variableAssignments.has(varName)) {
          variableAssignments.set(varName, []);
        }
        variableAssignments.get(varName)!.push(lineNodes[0].id);
      }
    }

    // Connect nodes based on variable usage
    for (let i = 0; i < nodes.length - 1; i++) {
      const current = nodes[i];
      const next = nodes[i + 1];

      // Check if they share variables
      const currentVars = this.extractVariables(current.code);
      const nextVars = this.extractVariables(next.code);

      const shared = currentVars.filter(v => nextVars.includes(v));

      if (shared.length > 0) {
        edges.push({
          from: current.id,
          to: next.id,
          label: shared.join(', '),
          type: 'data'
        });
      }
    }

    // Connect sources directly to sinks if on same data path
    const sources = nodes.filter(n => n.type === 'source');
    const sinks = nodes.filter(n => n.type === 'sink');

    for (const source of sources) {
      for (const sink of sinks) {
        if (source.line < sink.line) {
          // Check if there's a sanitization transform between them
          const transforms = nodes.filter(
            n => n.type === 'transform' &&
              n.line > source.line &&
              n.line < sink.line &&
              n.riskLevel === 'safe'
          );

          if (transforms.length === 0) {
            // Direct path from source to sink - dangerous!
            edges.push({
              from: source.id,
              to: sink.id,
              label: '⚠️ Unsanitized',
              type: 'data'
            });
          }
        }
      }
    }

    return edges;
  }

  private extractVariables(code: string): string[] {
    const varPattern = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\b/g;
    const keywords = new Set(['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'true', 'false', 'null', 'undefined']);
    const vars: string[] = [];
    let match;

    while ((match = varPattern.exec(code)) !== null) {
      if (!keywords.has(match[1])) {
        vars.push(match[1]);
      }
    }

    return [...new Set(vars)];
  }

  private findTaintedPaths(nodes: FlowNode[], edges: FlowEdge[]): string[][] {
    const paths: string[][] = [];
    const sources = nodes.filter(n => n.type === 'source' && n.tainted);
    const sinks = nodes.filter(n => n.type === 'sink');

    for (const source of sources) {
      for (const sink of sinks) {
        // DFS to find paths
        const path = this.dfs(source.id, sink.id, edges, new Set());
        if (path.length > 0) {
          paths.push(path);
        }
      }
    }

    return paths;
  }

  private dfs(current: string, target: string, edges: FlowEdge[], visited: Set<string>): string[] {
    if (current === target) {
      return [current];
    }

    if (visited.has(current)) {
      return [];
    }

    visited.add(current);

    for (const edge of edges) {
      if (edge.from === current) {
        const path = this.dfs(edge.to, target, edges, visited);
        if (path.length > 0) {
          return [current, ...path];
        }
      }
    }

    return [];
  }

  private showFlowPanel(flow: DataFlow): void {
    if (this.panel) {
      this.panel.reveal();
    } else {
      this.panel = vscode.window.createWebviewPanel(
        'vibecheckFlow',
        'VibeCheck Code Flow',
        vscode.ViewColumn.Two,
        { enableScripts: true }
      );

      this.panel.onDidDispose(() => {
        this.panel = undefined;
      });

      // Handle messages from webview
      this.panel.webview.onDidReceiveMessage((message) => {
        void (async () => {
          if (message.command === 'gotoNode') {
            await this.goToNode(message.nodeId);
          }
        })();
      });
    }

    this.panel.webview.html = this.getFlowPanelHtml(flow);
  }

  private async goToNode(nodeId: string): Promise<void> {
    if (!this.currentFlow) return;

    const node = this.currentFlow.nodes.find(n => n.id === nodeId);
    if (!node) return;

    const editor = vscode.window.activeTextEditor;
    if (editor) {
      const position = new vscode.Position(node.line - 1, node.column);
      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(
        new vscode.Range(position, position),
        vscode.TextEditorRevealType.InCenter
      );
    }
  }


  clearDecorations(): void {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      editor.setDecorations(this.decorationType, []);
      editor.setDecorations(this.flowLineDecoration, []);
    }
    this.currentFlow = undefined;
  }

  // Public API methods for extension.ts

  isActive(): boolean {
    return this.currentFlow !== undefined;
  }

  async analyzeFile(document: vscode.TextDocument): Promise<void> {
    const flow = await this.analyzeDataFlow(document);
    if (flow) {
      this.showFlowPanel(flow);
    }
  }

  async traceVariable(document: vscode.TextDocument, variableName: string, startLine?: number): Promise<void> {
    const text = document.getText();

    // Find the variable in the document
    const variablePattern = new RegExp(`\\b${variableName}\\b`, 'g');
    let match;
    const occurrences: vscode.Position[] = [];

    while ((match = variablePattern.exec(text)) !== null) {
      const pos = document.positionAt(match.index);
      occurrences.push(pos);
    }

    if (occurrences.length === 0) {
      void vscode.window.showWarningMessage(`Variable "${variableName}" not found in file.`);
      return;
    }

    // Use the line hint if provided, otherwise use first occurrence
    let startPos = occurrences[0];
    if (startLine !== undefined) {
      const nearLine = occurrences.find(p => p.line === startLine) ||
        occurrences.find(p => Math.abs(p.line - startLine) <= 2);
      if (nearLine) startPos = nearLine;
    }

    // Trace from the determined position
    const flow = await this.analyzeDataFlow(document, startPos);

    if (flow) {
      // Filter to only show nodes related to this variable
      const filteredNodes = flow.nodes.filter(n =>
        n.code.includes(variableName) || n.label.includes(variableName)
      );

      if (filteredNodes.length > 0) {
        const filteredFlow: DataFlow = {
          ...flow,
          name: `Trace: ${variableName}`,
          description: `Data flow trace for variable "${variableName}"`,
          nodes: filteredNodes,
          edges: flow.edges.filter(e =>
            filteredNodes.some(n => n.id === e.from) ||
            filteredNodes.some(n => n.id === e.to)
          )
        };
        this.currentFlow = filteredFlow;
        this.showFlowPanel(filteredFlow);
        this.updateDecorations();
      } else {
        void vscode.window.showInformationMessage(`No significant data flow found for "${variableName}".`);
      }
    }
  }

  updateDecorations(editor?: vscode.TextEditor): void {
    const targetEditor = editor || vscode.window.activeTextEditor;
    if (!targetEditor || !this.currentFlow) {
      return;
    }

    const decorations: vscode.DecorationOptions[] = [];
    const lineDecorations: vscode.DecorationOptions[] = [];
    const riskEmoji: Record<string, string> = {
      safe: '✅',
      low: '🟢',
      medium: '🟡',
      high: '🟠',
      critical: '🔴'
    };

    for (const node of this.currentFlow.nodes) {
      if (node.file !== targetEditor.document.fileName) continue;

      const line = node.line - 1;
      if (line < 0 || line >= targetEditor.document.lineCount) continue;

      const range = new vscode.Range(line, node.column, line, node.column + node.code.length);

      decorations.push({
        range,
        renderOptions: {
          after: {
            contentText: `  ${riskEmoji[node.riskLevel || 'low']} ${node.label}`,
            color: node.riskLevel === 'critical' || node.riskLevel === 'high'
              ? 'rgba(239, 68, 68, 0.8)'
              : 'rgba(139, 92, 246, 0.8)'
          }
        }
      });

      lineDecorations.push({
        range: new vscode.Range(line, 0, line, 0)
      });
    }

    targetEditor.setDecorations(this.decorationType, decorations);
    targetEditor.setDecorations(this.flowLineDecoration, lineDecorations);
  }

  showPanel(): void {
    if (this.currentFlow) {
      this.showFlowPanel(this.currentFlow);
    } else {
      void vscode.window.showInformationMessage('Run "Analyze Code Flow" first to generate a flow graph.');
    }
  }

  private getFlowPanelHtml(flow: DataFlow): string {
    const nodeColors: Record<string, string> = {
      source: '#f59e0b',
      transform: '#3b82f6',
      sink: '#ef4444',
      branch: '#8b5cf6',
      call: '#10b981'
    };

    const riskColors: Record<string, string> = {
      safe: '#10b981',
      low: '#3b82f6',
      medium: '#f59e0b',
      high: '#ef4444',
      critical: '#dc2626'
    };

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Code Flow</title>
  <style>
    :root {
      --bg: #0a0a0f;
      --bg-card: #12121a;
      --border: rgba(255,255,255,0.1);
      --text: #fff;
      --text-secondary: #a0a0b0;
    }
    
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: var(--bg);
      color: var(--text);
      padding: 24px;
    }
    
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 24px;
    }
    
    .title {
      font-size: 20px;
      font-weight: 600;
    }
    
    .subtitle {
      color: var(--text-secondary);
      font-size: 13px;
      margin-top: 4px;
    }
    
    .legend {
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
    }
    
    .legend-item {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
    }
    
    .legend-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
    }
    
    .alert {
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid rgba(239, 68, 68, 0.3);
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 24px;
    }
    
    .alert-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 600;
      color: #ef4444;
      margin-bottom: 8px;
    }
    
    .alert-text {
      font-size: 13px;
      color: var(--text-secondary);
    }
    
    .flow-graph {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 24px;
      overflow-x: auto;
    }
    
    .flow-container {
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: max-content;
    }
    
    .flow-row {
      display: flex;
      align-items: center;
    }
    
    .flow-node {
      background: var(--bg);
      border: 2px solid;
      border-radius: 8px;
      padding: 12px 16px;
      cursor: pointer;
      transition: transform 0.15s, box-shadow 0.15s;
      min-width: 200px;
    }
    
    .flow-node:hover {
      transform: scale(1.02);
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    }
    
    .flow-node.source { border-color: ${nodeColors.source}; }
    .flow-node.transform { border-color: ${nodeColors.transform}; }
    .flow-node.sink { border-color: ${nodeColors.sink}; }
    
    .node-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }
    
    .node-type {
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 4px;
      text-transform: uppercase;
      font-weight: 600;
    }
    
    .node-type.source { background: rgba(245, 158, 11, 0.2); color: ${nodeColors.source}; }
    .node-type.transform { background: rgba(59, 130, 246, 0.2); color: ${nodeColors.transform}; }
    .node-type.sink { background: rgba(239, 68, 68, 0.2); color: ${nodeColors.sink}; }
    
    .node-risk {
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 4px;
      margin-left: auto;
    }
    
    .node-risk.safe { background: rgba(16, 185, 129, 0.2); color: ${riskColors.safe}; }
    .node-risk.low { background: rgba(59, 130, 246, 0.2); color: ${riskColors.low}; }
    .node-risk.medium { background: rgba(245, 158, 11, 0.2); color: ${riskColors.medium}; }
    .node-risk.high { background: rgba(239, 68, 68, 0.2); color: ${riskColors.high}; }
    .node-risk.critical { background: rgba(220, 38, 38, 0.3); color: ${riskColors.critical}; }
    
    .node-label {
      font-weight: 500;
      font-size: 13px;
      margin-bottom: 4px;
    }
    
    .node-code {
      font-family: 'SF Mono', Monaco, monospace;
      font-size: 11px;
      color: var(--text-secondary);
      background: var(--bg);
      padding: 4px 8px;
      border-radius: 4px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    
    .node-location {
      font-size: 11px;
      color: var(--text-secondary);
      margin-top: 8px;
    }
    
    .flow-edge {
      display: flex;
      align-items: center;
      padding: 4px 0 4px 24px;
    }
    
    .edge-line {
      width: 2px;
      height: 24px;
      background: var(--border);
      margin-right: 16px;
    }
    
    .edge-arrow {
      color: var(--text-secondary);
      font-size: 16px;
    }
    
    .edge-label {
      font-size: 11px;
      color: var(--text-secondary);
      margin-left: 8px;
      padding: 2px 8px;
      background: var(--bg);
      border-radius: 4px;
    }
    
    .edge-label.danger {
      background: rgba(239, 68, 68, 0.15);
      color: #ef4444;
    }
    
    .tainted-paths {
      margin-top: 24px;
    }
    
    .section-title {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 12px;
    }
    
    .path-card {
      background: var(--bg-card);
      border: 1px solid rgba(239, 68, 68, 0.3);
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 12px;
    }
    
    .path-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
    }
    
    .path-badge {
      background: rgba(239, 68, 68, 0.2);
      color: #ef4444;
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
    }
    
    .path-steps {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }
    
    .path-step {
      font-size: 12px;
      padding: 4px 10px;
      background: var(--bg);
      border-radius: 4px;
    }
    
    .path-arrow {
      color: var(--text-secondary);
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1 class="title">🔀 Data Flow Analysis</h1>
      <p class="subtitle">${flow.name}</p>
    </div>
    <div class="legend">
      <div class="legend-item">
        <div class="legend-dot" style="background: ${nodeColors.source}"></div>
        <span>Source</span>
      </div>
      <div class="legend-item">
        <div class="legend-dot" style="background: ${nodeColors.transform}"></div>
        <span>Transform</span>
      </div>
      <div class="legend-item">
        <div class="legend-dot" style="background: ${nodeColors.sink}"></div>
        <span>Sink</span>
      </div>
    </div>
  </div>
  
  ${flow.taintedPaths.length > 0 ? `
    <div class="alert">
      <div class="alert-title">
        ⚠️ ${flow.taintedPaths.length} Unsanitized Data Path${flow.taintedPaths.length > 1 ? 's' : ''} Detected
      </div>
      <div class="alert-text">
        Data flows from user input to dangerous sinks without proper sanitization.
        This could lead to injection vulnerabilities.
      </div>
    </div>
  ` : ''}
  
  <div class="flow-graph">
    <div class="flow-container">
      ${flow.nodes.map((node, i) => `
        <div class="flow-row">
          <div class="flow-node ${node.type}" onclick="gotoNode('${node.id}')">
            <div class="node-header">
              <span class="node-type ${node.type}">${node.type}</span>
              ${node.riskLevel ? `<span class="node-risk ${node.riskLevel}">${node.riskLevel}</span>` : ''}
            </div>
            <div class="node-label">${node.label}</div>
            <div class="node-code">${this.escapeHtml(node.code)}</div>
            <div class="node-location">📍 ${node.file}:${node.line}</div>
          </div>
        </div>
        ${i < flow.nodes.length - 1 ? `
          <div class="flow-edge">
            <div class="edge-line"></div>
            <span class="edge-arrow">↓</span>
            ${flow.edges.find(e => e.from === node.id)?.label ? `
              <span class="edge-label ${flow.edges.find(e => e.from === node.id)?.label?.includes('⚠️') ? 'danger' : ''}">
                ${flow.edges.find(e => e.from === node.id)?.label}
              </span>
            ` : ''}
          </div>
        ` : ''}
      `).join('')}
    </div>
  </div>
  
  ${flow.taintedPaths.length > 0 ? `
    <div class="tainted-paths">
      <h2 class="section-title">🚨 Vulnerable Data Paths</h2>
      ${flow.taintedPaths.map((path, i) => `
        <div class="path-card">
          <div class="path-header">
            <span class="path-badge">Path ${i + 1}</span>
          </div>
          <div class="path-steps">
            ${path.map((nodeId, j) => {
      const node = flow.nodes.find(n => n.id === nodeId);
      return `
                <span class="path-step">${node?.label || nodeId}</span>
                ${j < path.length - 1 ? '<span class="path-arrow">→</span>' : ''}
              `;
    }).join('')}
          </div>
        </div>
      `).join('')}
    </div>
  ` : ''}
  
  <script>
    const vscode = acquireVsCodeApi();
    
    function gotoNode(nodeId) {
      vscode.postMessage({ command: 'gotoNode', nodeId });
    }
  </script>
</body>
</html>`;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  dispose(): void {
    this.decorationType.dispose();
    this.flowLineDecoration.dispose();
    this.panel?.dispose();
    this.disposables.forEach(d => d.dispose());
  }
}
