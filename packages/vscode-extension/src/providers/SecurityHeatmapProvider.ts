import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

interface FileRisk {
  file: string;
  relativePath: string;
  riskScore: number;
  riskLevel: 'safe' | 'low' | 'medium' | 'high' | 'critical';
  issueCount: number;
  issues: {
    line: number;
    severity: string;
    message: string;
    engine: string;
  }[];
  hotspots: {
    line: number;
    score: number;
    reason: string;
  }[];
  metrics: {
    linesOfCode: number;
    complexity: number;
    dependencies: number;
    sensitivePatterns: number;
  };
}

interface HeatmapData {
  timestamp: string;
  workspacePath: string;
  totalFiles: number;
  totalRisk: number;
  averageRisk: number;
  files: FileRisk[];
  hotDirectories: {
    path: string;
    riskScore: number;
    fileCount: number;
  }[];
}

export class SecurityHeatmapProvider implements vscode.Disposable {
  private context: vscode.ExtensionContext;
  private panel: vscode.WebviewPanel | undefined;
  private fileDecorations: Map<string, vscode.TextEditorDecorationType[]> = new Map();
  private fileAnalysisCache: Map<string, { hotspots: { line: number; score: number; reason: string }[] }> = new Map();
  private disposables: vscode.Disposable[] = [];
  private currentHeatmap: HeatmapData | undefined;

  // Risk patterns and their weights
  private riskPatterns = [
    // Critical - Code execution
    { pattern: /eval\s*\(/g, weight: 100, category: 'code-execution', message: 'eval() usage' },
    { pattern: /Function\s*\(/g, weight: 90, category: 'code-execution', message: 'Dynamic function creation' },
    { pattern: /new\s+Function\s*\(/g, weight: 90, category: 'code-execution', message: 'Dynamic function creation' },

    // High - Injection vulnerabilities
    { pattern: /innerHTML\s*=/g, weight: 80, category: 'xss', message: 'innerHTML assignment' },
    { pattern: /document\.write\s*\(/g, weight: 80, category: 'xss', message: 'document.write usage' },
    { pattern: /dangerouslySetInnerHTML/g, weight: 75, category: 'xss', message: 'dangerouslySetInnerHTML' },
    { pattern: /\.query\s*\([^)]*\$\{/g, weight: 85, category: 'sql-injection', message: 'String interpolation in query' },
    { pattern: /\.exec\s*\([^)]*\$\{/g, weight: 90, category: 'cmd-injection', message: 'String interpolation in exec' },

    // High - Auth/Secrets
    { pattern: /password\s*[:=]\s*['"`][^'"`]+['"`]/gi, weight: 85, category: 'secrets', message: 'Hardcoded password' },
    { pattern: /api[_-]?key\s*[:=]\s*['"`][^'"`]+['"`]/gi, weight: 85, category: 'secrets', message: 'Hardcoded API key' },
    { pattern: /secret\s*[:=]\s*['"`][^'"`]+['"`]/gi, weight: 80, category: 'secrets', message: 'Hardcoded secret' },
    { pattern: /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g, weight: 100, category: 'secrets', message: 'Private key in code' },

    // Medium - Input handling
    { pattern: /req\.(body|query|params|headers)\[/g, weight: 50, category: 'input', message: 'Direct user input access' },
    { pattern: /process\.env\./g, weight: 20, category: 'config', message: 'Environment variable access' },

    // Medium - Unsafe patterns
    { pattern: /JSON\.parse\s*\([^)]*req\./g, weight: 60, category: 'parsing', message: 'Parsing user input' },
    { pattern: /\bexec\s*\(/g, weight: 70, category: 'cmd-execution', message: 'Command execution' },
    { pattern: /\bspawn\s*\(/g, weight: 60, category: 'cmd-execution', message: 'Process spawn' },
    { pattern: /child_process/g, weight: 50, category: 'cmd-execution', message: 'Child process import' },

    // Low - Code quality concerns
    { pattern: /console\.(log|debug|info)\s*\(/g, weight: 10, category: 'debug', message: 'Console output' },
    { pattern: /TODO|FIXME|HACK|XXX/g, weight: 15, category: 'todo', message: 'TODO marker' },
    { pattern: /\/\/\s*eslint-disable/g, weight: 20, category: 'lint-disable', message: 'ESLint disable' },
    { pattern: /any\s*[;)]/g, weight: 15, category: 'typescript', message: 'TypeScript any type' },
    { pattern: /@ts-ignore|@ts-nocheck/g, weight: 25, category: 'typescript', message: 'TypeScript ignore' }
  ];

  constructor(context: vscode.ExtensionContext) {
    this.context = context;

    // Track editor changes
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(() => this.updateEditorDecorations())
    );
  }

  async generateHeatmap(): Promise<HeatmapData | undefined> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      void vscode.window.showErrorMessage('No workspace folder open');
      return undefined;
    }

    const workspacePath = workspaceFolder.uri.fsPath;

    // Show progress
    return vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'Generating Security Heatmap',
      cancellable: true
    }, async (progress, token) => {
      progress.report({ message: 'Scanning files...' });

      const files = await this.findCodeFiles(workspacePath);
      const fileRisks: FileRisk[] = [];

      let processed = 0;
      for (const file of files) {
        if (token.isCancellationRequested) break;

        progress.report({
          message: `Analyzing ${path.basename(file)}`,
          increment: (1 / files.length) * 100
        });

        const risk = await this.analyzeFileRisk(file, workspacePath);
        if (risk) {
          fileRisks.push(risk);
        }
        processed++;
      }

      // Calculate directory risks
      const hotDirectories = this.calculateDirectoryRisks(fileRisks);

      // Calculate totals
      const totalRisk = fileRisks.reduce((sum, f) => sum + f.riskScore, 0);
      const averageRisk = files.length > 0 ? totalRisk / files.length : 0;

      // Sort by risk
      fileRisks.sort((a, b) => b.riskScore - a.riskScore);

      this.currentHeatmap = {
        timestamp: new Date().toISOString(),
        workspacePath,
        totalFiles: files.length,
        totalRisk,
        averageRisk,
        files: fileRisks,
        hotDirectories: hotDirectories.slice(0, 10)
      };

      this.showHeatmapPanel();

      return this.currentHeatmap;
    });
  }

  private async analyzeFileRisk(filePath: string, workspacePath: string): Promise<FileRisk | undefined> {
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const lines = content.split('\n');
      const relativePath = path.relative(workspacePath, filePath);

      let totalScore = 0;
      const issues: FileRisk['issues'] = [];
      const hotspots: FileRisk['hotspots'] = [];
      const lineScores = new Map<number, { score: number; reasons: string[] }>();

      // Analyze each pattern
      for (const { pattern, weight, category, message } of this.riskPatterns) {
        let match;
        const regex = new RegExp(pattern.source, pattern.flags);

        while ((match = regex.exec(content)) !== null) {
          const line = content.substring(0, match.index).split('\n').length;

          // Add to line score
          const existing = lineScores.get(line) || { score: 0, reasons: [] };
          existing.score += weight;
          existing.reasons.push(message);
          lineScores.set(line, existing);

          totalScore += weight;

          issues.push({
            line,
            severity: weight >= 80 ? 'error' : weight >= 50 ? 'warning' : 'info',
            message,
            engine: category
          });
        }
      }

      // Convert line scores to hotspots
      for (const [line, data] of lineScores) {
        hotspots.push({
          line,
          score: data.score,
          reason: data.reasons.join(', ')
        });
      }

      // Sort hotspots by score
      hotspots.sort((a, b) => b.score - a.score);

      // Calculate metrics
      const complexity = this.estimateComplexity(content);
      const dependencies = (content.match(/import\s+|require\s*\(/g) || []).length;
      const sensitivePatterns = issues.filter(i => i.engine === 'secrets' || i.engine === 'xss').length;

      // Normalize score (0-100)
      const normalizedScore = Math.min(100, totalScore / 10);

      return {
        file: filePath,
        relativePath,
        riskScore: normalizedScore,
        riskLevel: this.getRiskLevel(normalizedScore),
        issueCount: issues.length,
        issues,
        hotspots: hotspots.slice(0, 10),
        metrics: {
          linesOfCode: lines.length,
          complexity,
          dependencies,
          sensitivePatterns
        }
      };
    } catch (error) {
      return undefined;
    }
  }

  private estimateComplexity(content: string): number {
    // Simple cyclomatic complexity estimate
    const conditionals = (content.match(/if\s*\(|else\s*{|\?\s*:/g) || []).length;
    const loops = (content.match(/for\s*\(|while\s*\(|\.forEach\(|\.map\(/g) || []).length;
    const catches = (content.match(/catch\s*\(/g) || []).length;

    return 1 + conditionals + loops + catches;
  }

  private getRiskLevel(score: number): 'safe' | 'low' | 'medium' | 'high' | 'critical' {
    if (score < 10) return 'safe';
    if (score < 30) return 'low';
    if (score < 60) return 'medium';
    if (score < 85) return 'high';
    return 'critical';
  }

  private calculateDirectoryRisks(files: FileRisk[]): { path: string; riskScore: number; fileCount: number }[] {
    const dirRisks = new Map<string, { score: number; count: number }>();

    for (const file of files) {
      const dir = path.dirname(file.relativePath);
      const existing = dirRisks.get(dir) || { score: 0, count: 0 };
      existing.score += file.riskScore;
      existing.count += 1;
      dirRisks.set(dir, existing);
    }

    return Array.from(dirRisks.entries())
      .map(([dir, data]) => ({
        path: dir,
        riskScore: data.score / data.count,
        fileCount: data.count
      }))
      .sort((a, b) => b.riskScore - a.riskScore);
  }

  private async findCodeFiles(workspacePath: string): Promise<string[]> {
    const files: string[] = [];
    const extensions = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.vue', '.svelte', '.py', '.go', '.rs'];
    const ignoreDirs = ['node_modules', 'dist', 'build', '.next', '.git', 'coverage', '__pycache__', 'venv'];

    const walk = async (dir: string) => {
      try {
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);

          if (entry.isDirectory()) {
            if (!ignoreDirs.includes(entry.name) && !entry.name.startsWith('.')) {
              await walk(fullPath);
            }
          } else if (extensions.some(ext => entry.name.endsWith(ext))) {
            files.push(fullPath);
          }
        }
      } catch { }
    };

    await walk(workspacePath);
    return files;
  }

  private showHeatmapPanel(): void {
    if (!this.currentHeatmap) return;

    if (this.panel) {
      this.panel.reveal();
    } else {
      this.panel = vscode.window.createWebviewPanel(
        'vibecheckHeatmap',
        'Security Heatmap',
        vscode.ViewColumn.One,
        { enableScripts: true }
      );

      this.panel.onDidDispose(() => {
        this.panel = undefined;
      });

      this.panel.webview.onDidReceiveMessage((message) => {
        void (async () => {
          if (message.command === 'openFile') {
            const uri = vscode.Uri.file(message.file);
            const doc = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(doc);

            if (message.line) {
              const editor = vscode.window.activeTextEditor;
              if (editor) {
                const position = new vscode.Position(message.line - 1, 0);
                editor.selection = new vscode.Selection(position, position);
                editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
              }
            }
          }
        })();
      });
    }

    this.panel.webview.html = this.getHeatmapHtml(this.currentHeatmap);
  }

  private updateEditorDecorations(): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !this.currentHeatmap) return;

    const filePath = editor.document.uri.fsPath;
    const fileRisk = this.currentHeatmap.files.find(f => f.file === filePath);

    if (!fileRisk) return;

    // Clear old decorations
    const existing = this.fileDecorations.get(filePath);
    if (existing) {
      existing.forEach(d => d.dispose());
    }

    const newDecorations: vscode.TextEditorDecorationType[] = [];

    // Create decorations for hotspots
    for (const hotspot of fileRisk.hotspots) {
      const line = hotspot.line - 1;
      if (line < 0 || line >= editor.document.lineCount) continue;

      const color = this.getHeatColor(hotspot.score);
      const decoration = vscode.window.createTextEditorDecorationType({
        isWholeLine: true,
        backgroundColor: color,
        overviewRulerColor: color,
        overviewRulerLane: vscode.OverviewRulerLane.Right
      });

      editor.setDecorations(decoration, [
        {
          range: new vscode.Range(line, 0, line, 0),
          hoverMessage: new vscode.MarkdownString(`**Risk Score:** ${hotspot.score}\n\n${hotspot.reason}`)
        }
      ]);

      newDecorations.push(decoration);
    }

    this.fileDecorations.set(filePath, newDecorations);
  }

  private getHeatColor(score: number): string {
    // Gradient from green (safe) to red (dangerous)
    if (score < 20) return 'rgba(16, 185, 129, 0.1)';
    if (score < 40) return 'rgba(245, 158, 11, 0.1)';
    if (score < 60) return 'rgba(245, 158, 11, 0.2)';
    if (score < 80) return 'rgba(239, 68, 68, 0.15)';
    return 'rgba(239, 68, 68, 0.25)';
  }

  private getHeatmapHtml(heatmap: HeatmapData): string {
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
  <title>Security Heatmap</title>
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
      margin-bottom: 32px;
    }
    
    .title {
      font-size: 28px;
      font-weight: 700;
      margin-bottom: 8px;
      background: linear-gradient(135deg, #ef4444, #f59e0b);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    
    .subtitle {
      color: var(--text-secondary);
    }
    
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 16px;
      margin-bottom: 32px;
    }
    
    .stat-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px;
      text-align: center;
    }
    
    .stat-value {
      font-size: 36px;
      font-weight: 700;
    }
    
    .stat-label {
      color: var(--text-secondary);
      font-size: 13px;
      margin-top: 4px;
    }
    
    .section {
      margin-bottom: 32px;
    }
    
    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
    }
    
    .section-title {
      font-size: 18px;
      font-weight: 600;
    }
    
    .treemap {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
      gap: 4px;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 12px;
    }
    
    .treemap-cell {
      aspect-ratio: 1;
      border-radius: 6px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: transform 0.15s, opacity 0.15s;
      padding: 8px;
      text-align: center;
      overflow: hidden;
    }
    
    .treemap-cell:hover {
      transform: scale(1.05);
      opacity: 0.9;
    }
    
    .treemap-cell.safe { background: rgba(16, 185, 129, 0.3); }
    .treemap-cell.low { background: rgba(59, 130, 246, 0.3); }
    .treemap-cell.medium { background: rgba(245, 158, 11, 0.4); }
    .treemap-cell.high { background: rgba(239, 68, 68, 0.4); }
    .treemap-cell.critical { background: rgba(220, 38, 38, 0.5); }
    
    .cell-name {
      font-size: 10px;
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 100%;
    }
    
    .cell-score {
      font-size: 18px;
      font-weight: 700;
      margin-top: 4px;
    }
    
    .file-list {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
    }
    
    .file-item {
      display: flex;
      align-items: center;
      padding: 12px 16px;
      border-bottom: 1px solid var(--border);
      cursor: pointer;
      transition: background 0.15s;
    }
    
    .file-item:hover {
      background: rgba(255,255,255,0.05);
    }
    
    .file-item:last-child {
      border-bottom: none;
    }
    
    .file-risk-bar {
      width: 60px;
      height: 8px;
      background: rgba(255,255,255,0.1);
      border-radius: 4px;
      overflow: hidden;
      margin-right: 16px;
    }
    
    .file-risk-fill {
      height: 100%;
      border-radius: 4px;
      transition: width 0.3s;
    }
    
    .file-info {
      flex: 1;
    }
    
    .file-name {
      font-weight: 500;
      font-size: 13px;
      margin-bottom: 2px;
    }
    
    .file-path {
      font-size: 11px;
      color: var(--text-secondary);
      font-family: monospace;
    }
    
    .file-metrics {
      display: flex;
      gap: 16px;
    }
    
    .metric {
      font-size: 11px;
      color: var(--text-secondary);
    }
    
    .metric-value {
      font-weight: 600;
      color: var(--text);
    }
    
    .risk-badge {
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
    }
    
    .risk-badge.safe { background: rgba(16, 185, 129, 0.2); color: ${riskColors.safe}; }
    .risk-badge.low { background: rgba(59, 130, 246, 0.2); color: ${riskColors.low}; }
    .risk-badge.medium { background: rgba(245, 158, 11, 0.2); color: ${riskColors.medium}; }
    .risk-badge.high { background: rgba(239, 68, 68, 0.2); color: ${riskColors.high}; }
    .risk-badge.critical { background: rgba(220, 38, 38, 0.3); color: ${riskColors.critical}; }
    
    .dir-list {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 12px;
    }
    
    .dir-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px;
    }
    
    .dir-name {
      font-weight: 500;
      font-size: 13px;
      margin-bottom: 8px;
      font-family: monospace;
    }
    
    .dir-stats {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      color: var(--text-secondary);
    }
    
    .progress-bar {
      height: 4px;
      background: rgba(255,255,255,0.1);
      border-radius: 2px;
      margin-top: 8px;
      overflow: hidden;
    }
    
    .progress-fill {
      height: 100%;
      border-radius: 2px;
    }
  </style>
</head>
<body>
  <header class="header">
    <h1 class="title">🔥 Security Heatmap</h1>
    <p class="subtitle">Visual risk analysis across your codebase</p>
  </header>
  
  <div class="stats-grid">
    <div class="stat-card">
      <div class="stat-value">${heatmap.totalFiles}</div>
      <div class="stat-label">Files Scanned</div>
    </div>
    <div class="stat-card">
      <div class="stat-value" style="color: ${riskColors[this.getRiskLevel(heatmap.averageRisk)]}">${Math.round(heatmap.averageRisk)}</div>
      <div class="stat-label">Average Risk Score</div>
    </div>
    <div class="stat-card">
      <div class="stat-value" style="color: #ef4444">${heatmap.files.filter(f => f.riskLevel === 'high' || f.riskLevel === 'critical').length}</div>
      <div class="stat-label">High Risk Files</div>
    </div>
    <div class="stat-card">
      <div class="stat-value" style="color: #10b981">${heatmap.files.filter(f => f.riskLevel === 'safe').length}</div>
      <div class="stat-label">Safe Files</div>
    </div>
  </div>
  
  <section class="section">
    <div class="section-header">
      <h2 class="section-title">📊 Risk Treemap</h2>
    </div>
    <div class="treemap">
      ${heatmap.files.slice(0, 50).map(file => `
        <div class="treemap-cell ${file.riskLevel}" onclick="openFile('${file.file.replace(/\\/g, '\\\\')}')">
          <span class="cell-name">${path.basename(file.file)}</span>
          <span class="cell-score">${Math.round(file.riskScore)}</span>
        </div>
      `).join('')}
    </div>
  </section>
  
  <section class="section">
    <div class="section-header">
      <h2 class="section-title">🔥 Hot Directories</h2>
    </div>
    <div class="dir-list">
      ${heatmap.hotDirectories.map(dir => `
        <div class="dir-card">
          <div class="dir-name">📁 ${dir.path || '.'}</div>
          <div class="dir-stats">
            <span>${dir.fileCount} files</span>
            <span style="color: ${riskColors[this.getRiskLevel(dir.riskScore)]}">${Math.round(dir.riskScore)} avg risk</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${dir.riskScore}%; background: ${riskColors[this.getRiskLevel(dir.riskScore)]}"></div>
          </div>
        </div>
      `).join('')}
    </div>
  </section>
  
  <section class="section">
    <div class="section-header">
      <h2 class="section-title">📄 File Risk Details</h2>
    </div>
    <div class="file-list">
      ${heatmap.files.slice(0, 20).map(file => `
        <div class="file-item" onclick="openFile('${file.file.replace(/\\/g, '\\\\')}')">
          <div class="file-risk-bar">
            <div class="file-risk-fill" style="width: ${file.riskScore}%; background: ${riskColors[file.riskLevel]}"></div>
          </div>
          <div class="file-info">
            <div class="file-name">${path.basename(file.file)}</div>
            <div class="file-path">${file.relativePath}</div>
          </div>
          <div class="file-metrics">
            <span class="metric"><span class="metric-value">${file.issueCount}</span> issues</span>
            <span class="metric"><span class="metric-value">${file.metrics.linesOfCode}</span> LOC</span>
          </div>
          <span class="risk-badge ${file.riskLevel}">${file.riskLevel}</span>
        </div>
      `).join('')}
    </div>
  </section>
  
  <script>
    const vscode = acquireVsCodeApi();
    
    function openFile(file, line) {
      vscode.postMessage({ command: 'openFile', file, line });
    }
  </script>
</body>
</html>`;
  }

  // Public API methods for extension.ts

  private overlayActive: boolean = false;

  isOverlayActive(): boolean {
    return this.overlayActive;
  }

  toggleOverlay(): void {
    this.overlayActive = !this.overlayActive;
    if (this.overlayActive) {
      this.updateEditorDecorations();
      void vscode.window.showInformationMessage('Security heatmap overlay enabled');
    } else {
      this.clearDecorations();
      void vscode.window.showInformationMessage('Security heatmap overlay disabled');
    }
  }

  async analyzeWorkspace(): Promise<void> {
    const heatmap = await this.generateHeatmap();
    if (heatmap) {
      this.overlayActive = true;
      this.showHeatmapPanel();
    }
  }

  async analyzeFile(document: vscode.TextDocument): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) return;

    const filePath = document.uri.fsPath;
    const text = document.getText();
    const lines = text.split('\n');

    // Simple risk analysis for this file
    let riskScore = 0;
    const hotspots: { line: number; score: number; reason: string }[] = [];

    lines.forEach((line, index) => {
      let lineScore = 0;
      const reasons: string[] = [];

      this.riskPatterns.forEach(({ pattern, weight, message }) => {
        const matches = line.match(pattern);
        if (matches) {
          lineScore += weight * matches.length;
          reasons.push(message);
        }
      });

      if (lineScore > 0) {
        riskScore += lineScore;
        hotspots.push({
          line: index + 1,
          score: lineScore,
          reason: reasons.join(', ')
        });
      }
    });

    // Cache the analysis
    this.fileAnalysisCache.set(filePath, { hotspots });

    // Apply decorations
    const editor = vscode.window.activeTextEditor;
    if (editor && editor.document === document) {
      this.applyFileDecorations(editor, hotspots);
    }

    const riskLevel = this.calculateRiskLevel(riskScore);
    void vscode.window.showInformationMessage(
      `Security Analysis: ${riskLevel.toUpperCase()} risk (score: ${riskScore}), ${hotspots.length} hotspots found`
    );
  }

  async showHeatmap(): Promise<void> {
    if (this.currentHeatmap) {
      this.showHeatmapPanel();
    } else {
      await this.generateHeatmap();
    }
  }

  async scanWorkspace(): Promise<void> {
    await this.analyzeWorkspace();
  }

  private applyFileDecorations(
    editor: vscode.TextEditor,
    hotspots: { line: number; score: number; reason: string }[]
  ): void {
    const decorations: vscode.DecorationOptions[] = [];

    hotspots.forEach(hotspot => {
      const line = hotspot.line - 1;
      const range = new vscode.Range(line, 0, line, editor.document.lineAt(line).text.length);

      const opacity = Math.min(0.5, hotspot.score / 200);
      const decorationType = vscode.window.createTextEditorDecorationType({
        backgroundColor: `rgba(239, 68, 68, ${opacity})`,
        isWholeLine: true,
        overviewRulerColor: 'rgba(239, 68, 68, 0.8)',
        overviewRulerLane: vscode.OverviewRulerLane.Right
      });

      editor.setDecorations(decorationType, [{
        range,
        hoverMessage: new vscode.MarkdownString(`**Risk Score:** ${hotspot.score}\n\n**Reason:** ${hotspot.reason}`)
      }]);

      // Track for cleanup
      const existing = this.fileDecorations.get(editor.document.uri.fsPath) || [];
      existing.push(decorationType);
      this.fileDecorations.set(editor.document.uri.fsPath, existing);
    });
  }

  private calculateRiskLevel(score: number): 'safe' | 'low' | 'medium' | 'high' | 'critical' {
    if (score >= 500) return 'critical';
    if (score >= 200) return 'high';
    if (score >= 100) return 'medium';
    if (score >= 30) return 'low';
    return 'safe';
  }

  clearDecorations(): void {
    this.fileDecorations.forEach(decorations => {
      decorations.forEach(d => d.dispose());
    });
    this.fileDecorations.clear();
  }

  isActive(): boolean {
    return this.panel !== undefined || this.fileDecorations.size > 0;
  }

  updateDecorations(editor: vscode.TextEditor): void {
    if (!this.isActive()) { return; }

    const filePath = editor.document.uri.fsPath;
    const analysis = this.fileAnalysisCache.get(filePath);

    if (analysis) {
      this.applyFileDecorations(editor, analysis.hotspots);
    }
  }

  dispose(): void {
    this.panel?.dispose();
    this.fileDecorations.forEach(decorations => decorations.forEach(d => d.dispose()));
    this.disposables.forEach(d => d.dispose());
  }
}
