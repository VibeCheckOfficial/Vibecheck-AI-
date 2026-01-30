import * as vscode from 'vscode';
import { ScannerService } from '../services/ScannerService';
import { DiagnosticsProvider, Issue } from './DiagnosticsProvider';
import { IssuesTreeProvider } from './TreeDataProvider';

export class DashboardPanel {
  public static currentPanel: DashboardPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(
    extensionUri: vscode.Uri,
    scannerService: ScannerService,
    diagnosticsProvider: DiagnosticsProvider,
    issuesTreeProvider: IssuesTreeProvider
  ) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (DashboardPanel.currentPanel) {
      DashboardPanel.currentPanel._panel.reveal(column);
      DashboardPanel.currentPanel._update(diagnosticsProvider);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'vibecheckDashboard',
      'VibeCheck Dashboard',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri],
      }
    );

    DashboardPanel.currentPanel = new DashboardPanel(
      panel,
      extensionUri,
      scannerService,
      diagnosticsProvider,
      issuesTreeProvider
    );
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    private readonly _scannerService: ScannerService,
    private readonly _diagnosticsProvider: DiagnosticsProvider,
    private readonly _issuesTreeProvider: IssuesTreeProvider
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    this._update(_diagnosticsProvider);

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'scan':
            await vscode.commands.executeCommand('vibecheck.scan');
            break;
          case 'scanWorkspace':
            await vscode.commands.executeCommand('vibecheck.scanWorkspace');
            break;
          case 'fixIssue':
            await this._fixIssue(message.issueId);
            break;
          case 'ignoreIssue':
            await this._ignoreIssue(message.issueId);
            break;
          case 'openFile':
            await this._openFile(message.file, message.line);
            break;
          case 'refresh':
            this._update(_diagnosticsProvider);
            break;
          case 'exportReport':
            await this._exportReport();
            break;
          case 'realityMode':
            await vscode.commands.executeCommand('vibecheck.realityMode');
            break;
          // CLI Commands
          case 'audit':
            await vscode.commands.executeCommand('vibecheck.audit');
            break;
          case 'doctor':
            await vscode.commands.executeCommand('vibecheck.doctor');
            break;
          case 'forge':
            await vscode.commands.executeCommand('vibecheck.forge');
            break;
          case 'ship':
            await vscode.commands.executeCommand('vibecheck.ship');
            break;
          case 'checkpoint':
            await vscode.commands.executeCommand('vibecheck.checkpoint');
            break;
          case 'checkpointRestore':
            await vscode.commands.executeCommand('vibecheck.checkpointRestore');
            break;
          case 'packs':
            await vscode.commands.executeCommand('vibecheck.packs');
            break;
          case 'aiFix':
            await vscode.commands.executeCommand('vibecheck.aiFix');
            break;
          case 'startWatch':
            await vscode.commands.executeCommand('vibecheck.startWatch');
            break;
          // Shield commands
          case 'shieldToggle':
            await vscode.commands.executeCommand('vibecheck.shieldToggle');
            break;
          case 'shieldCheck':
            await vscode.commands.executeCommand('vibecheck.shieldCheck');
            break;
          case 'showVerdict':
            await vscode.commands.executeCommand('vibecheck.showVerdict');
            break;
          // Prompt Builder
          case 'promptBuilder':
            await vscode.commands.executeCommand('vibecheck.promptBuilder');
            break;
        }
      },
      null,
      this._disposables
    );

    // Update when diagnostics change
    _diagnosticsProvider.onDidChangeDiagnostics(() => {
      this._update(_diagnosticsProvider);
    });
  }

  private _fixIssue(issueId: string) {
    // TODO: Implement fix
    void vscode.window.showInformationMessage(`Fixing issue: ${issueId}`);
  }

  private _ignoreIssue(issueId: string) {
    // TODO: Implement ignore
    void vscode.window.showInformationMessage(`Ignored issue: ${issueId}`);
  }

  private async _openFile(file: string, line: number) {
    const doc = await vscode.workspace.openTextDocument(file);
    const editor = await vscode.window.showTextDocument(doc);
    const position = new vscode.Position(line - 1, 0);
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(new vscode.Range(position, position));
  }

  private async _exportReport() {
    const report = this._generateReport();
    const uri = await vscode.window.showSaveDialog({
      filters: { 'JSON': ['json'], 'HTML': ['html'] },
      defaultUri: vscode.Uri.file('vibecheck-report.json'),
    });
    if (uri) {
      await vscode.workspace.fs.writeFile(uri, Buffer.from(report));
      void vscode.window.showInformationMessage('Report exported successfully!');
    }
  }

  private _generateReport(): string {
    const stats = this._diagnosticsProvider.getStats();
    const issues = this._diagnosticsProvider.getAllIssues();
    return JSON.stringify({ stats, issues, timestamp: new Date().toISOString() }, null, 2);
  }

  private _update(diagnosticsProvider: DiagnosticsProvider) {
    const stats = diagnosticsProvider.getStats();
    const issues = diagnosticsProvider.getAllIssues();
    this._panel.webview.html = this._getHtmlForWebview(stats, issues);
  }

  private _getHtmlForWebview(
    stats: { errors: number; warnings: number; info: number; files: number; passed: number },
    issues: Issue[]
  ) {
    const nonce = getNonce();
    const issuesJson = JSON.stringify(issues);

    // Get logo URI
    const logoUri = this._panel.webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'images', 'logo.png'));

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this._panel.webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${this._panel.webview.cspSource}; img-src ${this._panel.webview.cspSource} https:;">
  <title>VibeCheck Dashboard</title>
  <style>
    :root {
      --bg-primary: #050505;
      --bg-secondary: #0a0a0a;
      --bg-tertiary: #0f0f0f;
      --bg-card: #0a0a0a;
      --bg-glass: rgba(255, 255, 255, 0.02);
      --bg-soft: rgba(255, 255, 255, 0.03);
      --border-subtle: rgba(255, 255, 255, 0.05);
      --border-accent: rgba(255, 255, 255, 0.10);
      --text-primary: #ffffff;
      --text-secondary: rgba(255, 255, 255, 0.65);
      --text-tertiary: rgba(255, 255, 255, 0.45);
      --accent-primary: #00d4ff;
      --accent-green: #00ff88;
      --accent-red: #ff5c5c;
      --accent-yellow: #ffcc00;
      --accent-blue: #5c9cff;
      --accent-purple: #a855f7;
      --gradient-premium: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      --gradient-cyan: linear-gradient(135deg, rgba(0,212,255,0.95) 0%, rgba(0, 168, 204, 0.95) 100%);
      --gradient-purple: linear-gradient(135deg, rgba(168,85,247,0.95) 0%, rgba(139,92,246,0.95) 100%);
      --gradient-green: linear-gradient(135deg, #00ff88 0%, #00cc6a 100%);
      --gradient-red: linear-gradient(135deg, #ff5c5c 0%, #ff3333 100%);
      --shadow-glow: 0 0 32px rgba(0, 212, 255, 0.08);
      --radius-lg: 14px;
      --radius-md: 12px;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      min-height: 100vh;
      overflow-x: hidden;
    }

    /* Ambient background grid + glow */
    body::before {
      content: '';
      position: fixed;
      inset: 0;
      pointer-events: none;
      background:
        radial-gradient(1200px 800px at 20% 0%, rgba(0, 212, 255, 0.06), transparent 60%),
        radial-gradient(900px 600px at 80% 20%, rgba(168, 85, 247, 0.05), transparent 60%),
        linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px);
      background-size: auto, auto, 24px 24px, 24px 24px;
      opacity: 0.9;
    }

    /* Header */
    .header {
      background: linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01));
      border-bottom: 1px solid var(--border-subtle);
      padding: 18px 32px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      position: sticky;
      top: 0;
      z-index: 100;
      backdrop-filter: blur(20px);
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .logo {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .logo-icon {
      width: 38px;
      height: 38px;
      background: linear-gradient(135deg, rgba(255,255,255,0.10), rgba(255,255,255,0.02));
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: var(--radius-md);
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: var(--shadow-glow);
      position: relative;
      overflow: hidden;
    }

    .logo-icon::before {
      content: '';
      position: absolute;
      inset: -40%;
      background: conic-gradient(from 180deg,
        rgba(0,212,255,0.0),
        rgba(0,212,255,0.25),
        rgba(168,85,247,0.0)
      );
      animation: spin 4.5s linear infinite;
      opacity: 0.5;
    }

    .logo-icon img {
      position: relative;
      z-index: 1;
      width: 28px;
      height: 28px;
      object-fit: contain;
      border-radius: 4px;
    }

    @keyframes spin { to { transform: rotate(360deg); } }

    .logo-text {
      font-size: 22px;
      font-weight: 900;
      letter-spacing: -0.5px;
      background: linear-gradient(135deg, #fff 0%, rgba(255,255,255,0.75) 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .header-actions {
      display: flex;
      gap: 10px;
    }

    .btn {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 16px;
      border: 1px solid transparent;
      border-radius: var(--radius-md);
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.15s ease;
      position: relative;
      overflow: hidden;
    }

    .btn-primary {
      background: var(--gradient-premium);
      color: white;
      border-color: rgba(255,255,255,0.10);
      box-shadow: 0 8px 20px rgba(102, 126, 234, 0.20);
    }

    .btn-primary::before {
      content: '';
      position: absolute;
      inset: 0;
      background: radial-gradient(600px 120px at 30% 0%, rgba(255,255,255,0.20), transparent 60%);
      opacity: 0.7;
    }

    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 12px 28px rgba(102, 126, 234, 0.30);
    }

    .btn-secondary {
      background: rgba(255,255,255,0.03);
      border-color: var(--border-subtle);
      color: var(--text-primary);
    }

    .btn-secondary:hover {
      background: rgba(255,255,255,0.05);
      border-color: var(--border-accent);
      transform: translateY(-1px);
    }

    .btn-prompt-builder {
      background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
      color: white;
      border: 1px solid rgba(255,255,255,0.15);
      box-shadow: 0 4px 15px rgba(59, 130, 246, 0.3);
    }

    .btn-prompt-builder:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(59, 130, 246, 0.4);
    }

    /* Main Content */
    .main {
      padding: 28px 32px;
      max-width: 1600px;
      margin: 0 auto;
      position: relative;
    }

    /* Stats Row */
    .stats-row {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 16px;
      margin-bottom: 28px;
      position: relative;
      z-index: 1;
    }

    .stat-card {
      background: linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01));
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-lg);
      padding: 20px;
      position: relative;
      overflow: hidden;
      transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
      box-shadow: 0 6px 18px rgba(0,0,0,0.15);
    }

    .stat-card:hover {
      transform: translateY(-3px);
      border-color: var(--border-accent);
      box-shadow: 0 10px 24px rgba(0,0,0,0.20);
    }

    .stat-card.error { border-color: rgba(255,92,92,0.25); background: linear-gradient(180deg, rgba(255,92,92,0.06), rgba(255,255,255,0.01)); }
    .stat-card.warning { border-color: rgba(255,204,0,0.22); background: linear-gradient(180deg, rgba(255,204,0,0.06), rgba(255,255,255,0.01)); }
    .stat-card.success { border-color: rgba(0,255,136,0.20); background: linear-gradient(180deg, rgba(0,255,136,0.05), rgba(255,255,255,0.01)); }

    .stat-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 10px;
    }

    .stat-icon {
      width: 36px;
      height: 36px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      background: rgba(255,255,255,0.03);
      filter: drop-shadow(0 2px 8px rgba(0,0,0,0.25));
    }

    .stat-card.error .stat-icon { background: rgba(255, 92, 92, 0.12); }
    .stat-card.warning .stat-icon { background: rgba(255, 204, 0, 0.12); }
    .stat-card.success .stat-icon { background: rgba(0, 255, 136, 0.10); }

    .stat-value {
      font-size: 32px;
      font-weight: 900;
      letter-spacing: -1px;
      line-height: 1;
      margin-bottom: 4px;
    }

    .stat-card.error .stat-value { color: var(--accent-red); }
    .stat-card.warning .stat-value { color: var(--accent-yellow); }
    .stat-card.success .stat-value { color: var(--accent-green); }

    .stat-label {
      font-size: 10px;
      color: var(--text-tertiary);
      text-transform: uppercase;
      letter-spacing: 0.8px;
    }

    .stat-trend {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      color: var(--accent-green);
      margin-top: 6px;
    }

    .stat-trend.down { color: var(--accent-red); }

    /* Content Grid */
    .content-grid {
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: 20px;
      position: relative;
      z-index: 1;
    }

    /* Panels */
    .panel {
      background: linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.01));
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-lg);
      overflow: hidden;
      box-shadow: 0 6px 18px rgba(0,0,0,0.15);
    }

    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      border-bottom: 1px solid var(--border-subtle);
      background: rgba(255,255,255,0.015);
    }

    .panel-title {
      font-size: 14px;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 10px;
      letter-spacing: -0.2px;
    }

    .panel-badge {
      background: var(--accent-red);
      color: white;
      font-size: 10px;
      font-weight: 800;
      padding: 2px 8px;
      border-radius: 999px;
    }

    .panel-actions {
      display: flex;
      gap: 6px;
    }

    .icon-btn {
      width: 30px;
      height: 30px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      background: rgba(255,255,255,0.02);
      color: var(--text-secondary);
      cursor: pointer;
      transition: all 0.15s;
    }

    .icon-btn:hover {
      background: rgba(255,255,255,0.05);
      border-color: var(--border-accent);
      color: var(--text-primary);
      transform: translateY(-1px);
    }

    /* Issues List */
    .issues-list {
      max-height: 600px;
      overflow-y: auto;
    }

    .issue-item {
      display: flex;
      align-items: flex-start;
      gap: 14px;
      padding: 14px 20px;
      border-bottom: 1px solid var(--border-subtle);
      cursor: pointer;
      transition: background 0.15s, transform 0.15s;
    }

    .issue-item:hover {
      background: rgba(255,255,255,0.025);
    }

    .issue-severity {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      margin-top: 6px;
      flex-shrink: 0;
    }

    .issue-severity.error { background: var(--accent-red); box-shadow: 0 0 10px rgba(255,92,92,0.5); }
    .issue-severity.warning { background: var(--accent-yellow); box-shadow: 0 0 10px rgba(255,204,0,0.5); }
    .issue-severity.info { background: var(--accent-blue); box-shadow: 0 0 10px rgba(92,156,255,0.5); }

    .issue-content {
      flex: 1;
      min-width: 0;
    }

    .issue-title {
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 4px;
      display: flex;
      align-items: center;
      gap: 8px;
      color: rgba(255,255,255,0.9);
    }

    .issue-rule {
      font-size: 10px;
      color: var(--accent-purple);
      background: rgba(168, 85, 247, 0.12);
      padding: 2px 6px;
      border-radius: 6px;
      font-weight: 600;
    }

    .issue-location {
      font-size: 11px;
      color: var(--text-tertiary);
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }

    .issue-actions {
      display: flex;
      gap: 6px;
      opacity: 0;
      transition: opacity 0.15s;
    }

    .issue-item:hover .issue-actions {
      opacity: 1;
    }

    .issue-btn {
      padding: 5px 10px;
      font-size: 10px;
      font-weight: 700;
      border-radius: 6px;
      border: none;
      cursor: pointer;
      transition: all 0.15s;
    }

    .issue-btn.fix {
      background: var(--gradient-green);
      color: rgba(0,0,0,0.85);
    }

    .issue-btn.fix:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(0,255,136,0.25);
    }

    .issue-btn.ignore {
      background: rgba(255,255,255,0.04);
      border: 1px solid var(--border-subtle);
      color: var(--text-secondary);
    }

    .issue-btn.ignore:hover {
      background: rgba(255,255,255,0.06);
      border-color: var(--border-accent);
    }

    /* Engine Stats */
    .engine-stats {
      padding: 20px 24px;
    }

    .engine-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 0;
      border-bottom: 1px solid var(--border-subtle);
    }

    .engine-item:last-child {
      border-bottom: none;
    }

    .engine-info {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .engine-icon {
      width: 36px;
      height: 36px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      background: var(--bg-glass);
    }

    .engine-name {
      font-size: 14px;
      font-weight: 500;
    }

    .engine-desc {
      font-size: 12px;
      color: var(--text-tertiary);
    }

    .engine-count {
      font-size: 20px;
      font-weight: 700;
      color: var(--accent-red);
    }

    .engine-count.zero {
      color: var(--accent-green);
    }

    /* Activity Feed */
    .activity-feed {
      padding: 16px 24px;
    }

    .activity-item {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 12px 0;
    }

    .activity-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--accent-blue);
      margin-top: 6px;
    }

    .activity-text {
      font-size: 13px;
      color: var(--text-secondary);
    }

    .activity-time {
      font-size: 11px;
      color: var(--text-tertiary);
      margin-top: 2px;
    }

    /* Empty State */
    .empty-state {
      text-align: center;
      padding: 60px 24px;
    }

    .empty-icon {
      font-size: 48px;
      margin-bottom: 16px;
    }

    .empty-title {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 8px;
    }

    .empty-desc {
      font-size: 14px;
      color: var(--text-tertiary);
      margin-bottom: 20px;
    }

    /* Shield Panel */
    .shield-content {
      padding: 16px;
    }

    .shield-status-card {
      text-align: center;
      margin-bottom: 16px;
    }

    .shield-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 10px 20px;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 700;
      margin-bottom: 8px;
    }

    .shield-badge.off {
      background: var(--bg-glass);
      color: var(--text-tertiary);
      border: 1px solid var(--border-subtle);
    }

    .shield-badge.observe {
      background: rgba(0, 212, 255, 0.15);
      color: #00d4ff;
      border: 1px solid #00d4ff;
      box-shadow: 0 0 15px rgba(0, 212, 255, 0.2);
    }

    .shield-badge.enforce {
      background: rgba(168, 85, 247, 0.15);
      color: #a855f7;
      border: 1px solid #a855f7;
      box-shadow: 0 0 15px rgba(168, 85, 247, 0.2);
    }

    .shield-icon {
      font-size: 16px;
    }

    .shield-desc {
      font-size: 12px;
      color: var(--text-tertiary);
    }

    .shield-actions {
      display: flex;
      gap: 10px;
    }

    .shield-btn {
      flex: 1;
      padding: 10px 12px;
      background: var(--bg-glass);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      color: var(--text-secondary);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }

    .shield-btn:hover {
      background: var(--bg-tertiary);
      border-color: var(--border-accent);
      color: var(--text-primary);
    }

    /* CLI Tools Panel */
    .cli-tools-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
      padding: 14px;
    }

    .cli-tool-btn {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 11px 12px;
      background: rgba(255,255,255,0.02);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      cursor: pointer;
      transition: all 0.15s ease;
      position: relative;
      text-align: left;
    }

    .cli-tool-btn:hover {
      background: rgba(255,255,255,0.04);
      border-color: var(--border-accent);
      transform: translateY(-2px);
      box-shadow: 0 8px 18px rgba(0,0,0,0.15);
    }

    .cli-tool-btn.pro-btn {
      background: linear-gradient(180deg, rgba(102, 126, 234, 0.08), rgba(118, 75, 162, 0.05));
      border-color: rgba(102, 126, 234, 0.25);
      overflow: hidden;
    }

    .cli-tool-btn.pro-btn::before {
      content: '';
      position: absolute;
      inset: -40%;
      background: linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent);
      transform: rotate(20deg);
      animation: shimmer 4.2s ease-in-out infinite;
      opacity: 0.6;
      pointer-events: none;
    }

    @keyframes shimmer {
      0% { transform: translateX(-35%) rotate(20deg); }
      55% { transform: translateX(35%) rotate(20deg); }
      100% { transform: translateX(35%) rotate(20deg); }
    }

    .cli-tool-btn.pro-btn:hover {
      border-color: rgba(102, 126, 234, 0.45);
    }

    .cli-tool-icon {
      font-size: 18px;
      flex-shrink: 0;
      opacity: 0.9;
    }

    .cli-tool-info {
      flex: 1;
      min-width: 0;
    }

    .cli-tool-name {
      font-size: 12px;
      font-weight: 700;
      color: rgba(255,255,255,0.9);
    }

    .cli-tool-desc {
      font-size: 10px;
      color: var(--text-tertiary);
      margin-top: 2px;
    }

    .pro-tag {
      font-size: 8px;
      background: var(--gradient-premium);
      color: white;
      padding: 2px 6px;
      border-radius: 999px;
      font-weight: 700;
      position: absolute;
      top: 5px;
      right: 5px;
      letter-spacing: 0.5px;
      border: 1px solid rgba(255,255,255,0.12);
    }

    /* Scrollbar */
    ::-webkit-scrollbar {
      width: 6px;
    }

    ::-webkit-scrollbar-track {
      background: transparent;
    }

    ::-webkit-scrollbar-thumb {
      background: var(--border-accent);
      border-radius: 3px;
    }

    ::-webkit-scrollbar-thumb:hover {
      background: var(--text-tertiary);
    }

    /* Animations */
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .animate-in {
      animation: fadeIn 0.4s ease forwards;
    }
  </style>
</head>
<body>
  <header class="header">
    <div class="header-left">
      <div class="logo">
        <div class="logo-icon"><img src="${logoUri}" alt="VibeCheck" /></div>
        <span class="logo-text">VibeCheck Dashboard</span>
      </div>
    </div>
    <div class="header-actions">
      <button class="btn btn-prompt-builder" id="btnPromptBuilder">
        Prompt Builder
      </button>
      <button class="btn btn-secondary" id="btnDoctor">
        Doctor
      </button>
      <button class="btn btn-secondary" id="btnExportReport">
        Export
      </button>
      <button class="btn btn-secondary" id="btnRealityMode">
        Reality
      </button>
      <button class="btn btn-primary" id="btnAudit">
        Full Audit
      </button>
    </div>
  </header>

  <main class="main">
    <div class="stats-row animate-in">
      <div class="stat-card error">
        <div class="stat-header">
          <div class="stat-dot" style="background: var(--accent-red)"></div>
        </div>
        <div class="stat-value">${stats.errors}</div>
        <div class="stat-label">Errors</div>
      </div>
      <div class="stat-card warning">
        <div class="stat-header">
          <div class="stat-dot" style="background: var(--accent-yellow)"></div>
        </div>
        <div class="stat-value">${stats.warnings}</div>
        <div class="stat-label">Warnings</div>
      </div>
      <div class="stat-card">
        <div class="stat-header">
          <div class="stat-dot" style="background: var(--accent-blue)"></div>
        </div>
        <div class="stat-value">${stats.info}</div>
        <div class="stat-label">Info</div>
      </div>
      <div class="stat-card success">
        <div class="stat-header">
          <div class="stat-dot" style="background: var(--accent-green)"></div>
        </div>
        <div class="stat-value">${stats.passed}</div>
        <div class="stat-label">Passed</div>
      </div>
      <div class="stat-card">
        <div class="stat-header">
          <div class="stat-dot" style="background: var(--text-tertiary)"></div>
        </div>
        <div class="stat-value">${stats.files}</div>
        <div class="stat-label">Files</div>
      </div>
    </div>

    <div class="content-grid animate-in" style="animation-delay: 0.1s">
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">
            Issues
            ${issues.length > 0 ? `<span class="panel-badge">${issues.length}</span>` : ''}
          </div>
          <div class="panel-actions">
            <button class="icon-btn" id="btnRefresh" title="Refresh">Refresh</button>
          </div>
        </div>
        <div class="issues-list">
          ${issues.length === 0 ? `
            <div class="empty-state">
              <div class="empty-icon check-icon"></div>
              <div class="empty-title">All Clear</div>
              <div class="empty-desc">No issues detected in scanned files.</div>
              <button class="btn btn-primary" id="btnScanEmpty">Scan Current File</button>
            </div>
          ` : issues.map((issue, i) => `
            <div class="issue-item" data-file="${issue.file}" data-line="${issue.line}">
              <div class="issue-severity ${issue.severity}"></div>
              <div class="issue-content">
                <div class="issue-title">
                  ${issue.message}
                  <span class="issue-rule">${issue.rule}</span>
                </div>
                <div class="issue-location">${issue.file.split('/').pop()}:${issue.line}:${issue.column}</div>
              </div>
              <div class="issue-actions">
                <button class="issue-btn fix" data-action="fix" data-id="${issue.id}">Fix</button>
                <button class="issue-btn ignore" data-action="ignore" data-id="${issue.id}">Ignore</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <div>
        <div class="panel" style="margin-bottom: 24px">
          <div class="panel-header">
            <div class="panel-title">Scan Engines</div>
          </div>
          <div class="engine-stats">
            <div class="engine-item">
              <div class="engine-info">
                <div class="engine-dot" style="background: var(--accent-purple)"></div>
                <div>
                  <div class="engine-name">Fake Feature</div>
                  <div class="engine-desc">Non-functional code</div>
                </div>
              </div>
              <div class="engine-count ${getEngineCount(issues, 'fake-feature') === 0 ? 'zero' : ''}">${getEngineCount(issues, 'fake-feature')}</div>
            </div>
            <div class="engine-item">
              <div class="engine-info">
                <div class="engine-dot" style="background: var(--accent-red)"></div>
                <div>
                  <div class="engine-name">Security</div>
                  <div class="engine-desc">Vulnerabilities</div>
                </div>
              </div>
              <div class="engine-count ${getEngineCount(issues, 'security') === 0 ? 'zero' : ''}">${getEngineCount(issues, 'security')}</div>
            </div>
            <div class="engine-item">
              <div class="engine-info">
                <div class="engine-dot" style="background: var(--accent-yellow)"></div>
                <div>
                  <div class="engine-name">Hallucination</div>
                  <div class="engine-desc">AI mistakes</div>
                </div>
              </div>
              <div class="engine-count ${getEngineCount(issues, 'hallucination') === 0 ? 'zero' : ''}">${getEngineCount(issues, 'hallucination')}</div>
            </div>
            <div class="engine-item">
              <div class="engine-info">
                <div class="engine-dot" style="background: var(--accent-blue)"></div>
                <div>
                  <div class="engine-name">Dependency</div>
                  <div class="engine-desc">Package issues</div>
                </div>
              </div>
              <div class="engine-count ${getEngineCount(issues, 'dependency') === 0 ? 'zero' : ''}">${getEngineCount(issues, 'dependency')}</div>
            </div>
          </div>
        </div>

        <div class="panel shield-panel">
          <div class="panel-header">
            <div class="panel-title">Agent Firewall</div>
            <div class="panel-actions">
              <button class="icon-btn" id="btnShieldToggle" title="Toggle Mode">Toggle</button>
            </div>
          </div>
          <div class="shield-content">
            <div class="shield-status-card">
              <div class="shield-badge off" id="shieldBadge">
                <span class="shield-dot"></span>
                <span class="shield-label">OFF</span>
              </div>
              <div class="shield-desc">AI claim verification disabled</div>
            </div>
            <div class="shield-actions">
              <button class="shield-btn" id="btnShieldCheck">
                Check Claims
              </button>
              <button class="shield-btn" id="btnShieldVerdictPanel">
                Verdict Panel
              </button>
            </div>
          </div>
        </div>

        <div class="panel cli-tools-panel">
          <div class="panel-header">
            <div class="panel-title">CLI Tools</div>
          </div>
          <div class="cli-tools-grid">
            <button class="cli-tool-btn" id="btnForge">
              <div class="cli-tool-info">
                <div class="cli-tool-name">Forge</div>
                <div class="cli-tool-desc">Generate AI rules</div>
              </div>
            </button>
            <button class="cli-tool-btn" id="btnShip">
              <div class="cli-tool-info">
                <div class="cli-tool-name">Ship</div>
                <div class="cli-tool-desc">Get verdict</div>
              </div>
              <span class="pro-tag">PRO</span>
            </button>
            <button class="cli-tool-btn" id="btnCheckpoint">
              <div class="cli-tool-info">
                <div class="cli-tool-name">Checkpoint</div>
                <div class="cli-tool-desc">Snapshot state</div>
              </div>
            </button>
            <button class="cli-tool-btn" id="btnRestore">
              <div class="cli-tool-info">
                <div class="cli-tool-name">Restore</div>
                <div class="cli-tool-desc">Revert changes</div>
              </div>
            </button>
            <button class="cli-tool-btn" id="btnPacks">
              <div class="cli-tool-info">
                <div class="cli-tool-name">Report</div>
                <div class="cli-tool-desc">Bundle artifacts</div>
              </div>
            </button>
            <button class="cli-tool-btn" id="btnWatch">
              <div class="cli-tool-info">
                <div class="cli-tool-name">Watch</div>
                <div class="cli-tool-desc">Continuous scan</div>
              </div>
            </button>
            <button class="cli-tool-btn pro-btn" id="btnAiFix">
              <div class="cli-tool-info">
                <div class="cli-tool-name">AI Fix</div>
                <div class="cli-tool-desc">Auto-repair</div>
              </div>
              <span class="pro-tag">PRO</span>
            </button>
            <button class="cli-tool-btn" id="btnScanWorkspace">
              <div class="cli-tool-info">
                <div class="cli-tool-name">Workspace</div>
                <div class="cli-tool-desc">Scan all files</div>
              </div>
            </button>
          </div>
        </div>

        <div class="panel">
          <div class="panel-header">
            <div class="panel-title">Recent Activity</div>
          </div>
          <div class="activity-feed">
            <div class="activity-item">
              <div class="activity-dot"></div>
              <div>
                <div class="activity-text">Dashboard opened</div>
                <div class="activity-time">Just now</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </main>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const issues = ${issuesJson};

    // Attach event listeners to static buttons
    const btnExportReport = document.getElementById('btnExportReport');
    const btnRealityMode = document.getElementById('btnRealityMode');
    const btnScanWorkspace = document.getElementById('btnScanWorkspace');
    const btnRefresh = document.getElementById('btnRefresh');
    const btnScanEmpty = document.getElementById('btnScanEmpty');

    if (btnExportReport) btnExportReport.addEventListener('click', () => vscode.postMessage({ command: 'exportReport' }));
    if (btnRealityMode) btnRealityMode.addEventListener('click', () => vscode.postMessage({ command: 'realityMode' }));
    if (btnScanWorkspace) btnScanWorkspace.addEventListener('click', () => vscode.postMessage({ command: 'scanWorkspace' }));
    if (btnRefresh) btnRefresh.addEventListener('click', () => vscode.postMessage({ command: 'refresh' }));
    if (btnScanEmpty) btnScanEmpty.addEventListener('click', () => vscode.postMessage({ command: 'scan' }));

    // Prompt Builder event listener
    const btnPromptBuilder = document.getElementById('btnPromptBuilder');
    if (btnPromptBuilder) btnPromptBuilder.addEventListener('click', () => vscode.postMessage({ command: 'promptBuilder' }));

    // CLI Tools event listeners
    const btnAudit = document.getElementById('btnAudit');
    const btnDoctor = document.getElementById('btnDoctor');
    const btnForge = document.getElementById('btnForge');
    const btnShip = document.getElementById('btnShip');
    const btnCheckpoint = document.getElementById('btnCheckpoint');
    const btnRestore = document.getElementById('btnRestore');
    const btnPacks = document.getElementById('btnPacks');
    const btnWatch = document.getElementById('btnWatch');
    const btnAiFix = document.getElementById('btnAiFix');

    if (btnAudit) btnAudit.addEventListener('click', () => vscode.postMessage({ command: 'audit' }));
    if (btnDoctor) btnDoctor.addEventListener('click', () => vscode.postMessage({ command: 'doctor' }));
    if (btnForge) btnForge.addEventListener('click', () => vscode.postMessage({ command: 'forge' }));
    if (btnShip) btnShip.addEventListener('click', () => vscode.postMessage({ command: 'ship' }));
    if (btnCheckpoint) btnCheckpoint.addEventListener('click', () => vscode.postMessage({ command: 'checkpoint' }));
    if (btnRestore) btnRestore.addEventListener('click', () => vscode.postMessage({ command: 'checkpointRestore' }));
    if (btnPacks) btnPacks.addEventListener('click', () => vscode.postMessage({ command: 'packs' }));
    if (btnWatch) btnWatch.addEventListener('click', () => vscode.postMessage({ command: 'startWatch' }));
    if (btnAiFix) btnAiFix.addEventListener('click', () => vscode.postMessage({ command: 'aiFix' }));

    // Shield event listeners
    const btnShieldToggle = document.getElementById('btnShieldToggle');
    const btnShieldCheck = document.getElementById('btnShieldCheck');
    const btnShieldVerdictPanel = document.getElementById('btnShieldVerdictPanel');

    if (btnShieldToggle) btnShieldToggle.addEventListener('click', () => vscode.postMessage({ command: 'shieldToggle' }));
    if (btnShieldCheck) btnShieldCheck.addEventListener('click', () => vscode.postMessage({ command: 'shieldCheck' }));
    if (btnShieldVerdictPanel) btnShieldVerdictPanel.addEventListener('click', () => vscode.postMessage({ command: 'showVerdict' }));

    // Event delegation for dynamic issue items
    document.querySelector('.issues-list')?.addEventListener('click', (e) => {
      const target = e.target;
      
      // Handle fix/ignore button clicks
      if (target.dataset && target.dataset.action) {
        e.stopPropagation();
        const action = target.dataset.action;
        const issueId = target.dataset.id;
        if (action === 'fix') {
          vscode.postMessage({ command: 'fixIssue', issueId });
        } else if (action === 'ignore') {
          vscode.postMessage({ command: 'ignoreIssue', issueId });
        }
        return;
      }
      
      // Handle issue item clicks (navigate to file)
      const issueItem = target.closest('.issue-item');
      if (issueItem && issueItem.dataset.file) {
        vscode.postMessage({ 
          command: 'openFile', 
          file: issueItem.dataset.file, 
          line: parseInt(issueItem.dataset.line, 10) 
        });
      }
    });
  </script>
</body>
</html>`;
  }

  public dispose() {
    DashboardPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

function getEngineCount(issues: Issue[], engine: string): number {
  return issues.filter(i => i.engine === engine).length;
}
