import * as vscode from 'vscode';
import { Issue } from './DiagnosticsProvider';

interface AuditData {
  issues: Issue[];
  summary: {
    total: number;
    errors: number;
    warnings: number;
    info: number;
  };
  attackScore: number;
  scanDuration: number;
  filesScanned: number;
  timestamp: string;
  projectName: string;
}

export class AuditReportPanel {
  public static currentPanel: AuditReportPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(
    extensionUri: vscode.Uri,
    auditData: AuditData
  ): AuditReportPanel {
    const column = vscode.window.activeTextEditor?.viewColumn;

    if (AuditReportPanel.currentPanel) {
      AuditReportPanel.currentPanel._panel.reveal(column);
      AuditReportPanel.currentPanel._update(auditData);
      return AuditReportPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      'vibecheckAuditReport',
      'VibeCheck Audit Report',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri],
      }
    );

    AuditReportPanel.currentPanel = new AuditReportPanel(panel, extensionUri, auditData);
    return AuditReportPanel.currentPanel;
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    auditData: AuditData
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    this._update(auditData);

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'openFile':
            await this._openFile(message.file, message.line);
            break;
          case 'fixIssue':
            await vscode.commands.executeCommand('vibecheck.aiFix');
            break;
          case 'exportReport':
            await vscode.commands.executeCommand('vibecheck.exportReport');
            break;
          case 'rescan':
            await vscode.commands.executeCommand('vibecheck.audit');
            break;
        }
      },
      null,
      this._disposables
    );
  }

  private async _openFile(file: string, line: number) {
    try {
      const doc = await vscode.workspace.openTextDocument(file);
      const editor = await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
      const position = new vscode.Position(Math.max(0, line - 1), 0);
      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
    } catch (error) {
      void vscode.window.showErrorMessage(`Could not open file: ${file}`);
    }
  }

  private _update(auditData: AuditData) {
    this._panel.webview.html = this._getHtmlForWebview(auditData);
  }

  private _getHtmlForWebview(data: AuditData): string {
    const nonce = getNonce();
    const { issues, summary, attackScore, scanDuration, filesScanned, timestamp, projectName } = data;

    // Group issues by file
    const issuesByFile = new Map<string, Issue[]>();
    for (const issue of issues) {
      if (!issuesByFile.has(issue.file)) {
        issuesByFile.set(issue.file, []);
      }
      issuesByFile.get(issue.file)!.push(issue);
    }

    // Group issues by severity
    const criticalIssues = issues.filter(i => i.severity === 'error');
    const warningIssues = issues.filter(i => i.severity === 'warning');
    const infoIssues = issues.filter(i => i.severity === 'info' || i.severity === 'hint');

    // Calculate security score
    const securityScore = Math.max(0, 100 - attackScore);
    const scoreColor = securityScore >= 80 ? '#22c55e' : securityScore >= 50 ? '#eab308' : '#ef4444';
    const scoreLabel = securityScore >= 80 ? 'Good' : securityScore >= 50 ? 'Needs Attention' : 'Critical';

    // Generate issue cards HTML
    const generateIssueCard = (issue: Issue, index: number) => {
      const severityColors: Record<string, string> = {
        error: '#ef4444',
        warning: '#f59e0b',
        info: '#3b82f6',
        hint: '#8b5cf6'
      };
      const color = severityColors[issue.severity] || '#6b7280';
      const fileName = issue.file.split(/[/\\]/).pop() || issue.file;

      return `
        <div class="issue-card" data-file="${this._escapeHtml(issue.file)}" data-line="${issue.line}">
          <div class="issue-header">
            <span class="issue-severity"><span class="severity-dot" style="background: ${color}"></span>${issue.severity.toUpperCase()}</span>
            <span class="issue-rule">${this._escapeHtml(issue.rule || 'unknown')}</span>
          </div>
          <div class="issue-message">${this._escapeHtml(issue.message)}</div>
          <div class="issue-location">
            <span class="issue-file" title="${this._escapeHtml(issue.file)}">${this._escapeHtml(fileName)}</span>
            <span class="issue-line">Line ${issue.line}</span>
          </div>
          ${issue.suggestion ? `<div class="issue-suggestion">${this._escapeHtml(issue.suggestion)}</div>` : ''}
        </div>
      `;
    };

    // Generate file group HTML
    const generateFileGroup = (file: string, fileIssues: Issue[]) => {
      const fileName = file.split(/[/\\]/).pop() || file;
      const errorCount = fileIssues.filter(i => i.severity === 'error').length;
      const warningCount = fileIssues.filter(i => i.severity === 'warning').length;

      return `
        <div class="file-group">
          <div class="file-header" onclick="toggleFileGroup(this)">
            <span class="file-toggle">▼</span>
            <span class="file-name">${this._escapeHtml(fileName)}</span>
            <span class="file-path">${this._escapeHtml(file)}</span>
            <div class="file-badges">
              ${errorCount > 0 ? `<span class="badge badge-error">${errorCount} errors</span>` : ''}
              ${warningCount > 0 ? `<span class="badge badge-warning">${warningCount} warnings</span>` : ''}
            </div>
          </div>
          <div class="file-issues">
            ${fileIssues.map((issue, idx) => generateIssueCard(issue, idx)).join('')}
          </div>
        </div>
      `;
    };

    const fileGroupsHtml = Array.from(issuesByFile.entries())
      .sort((a, b) => b[1].length - a[1].length)
      .map(([file, fileIssues]) => generateFileGroup(file, fileIssues))
      .join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this._panel.webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${this._panel.webview.cspSource}; img-src ${this._panel.webview.cspSource} https: data:;">
  <title>VibeCheck Audit Report</title>
  <style>
    :root {
      --bg-0: #09090b;
      --bg-1: #0c0c0f;
      --bg-2: #111114;
      --bg-3: #161619;
      --bg-4: #1c1c20;
      --border: #27272a;
      --border-hover: #3f3f46;
      --text: #fafafa;
      --text-2: #a1a1aa;
      --text-3: #71717a;
      --text-4: #52525b;
      --red: #ef4444;
      --yellow: #eab308;
      --green: #22c55e;
      --blue: #3b82f6;
      --purple: #a855f7;
      --cyan: #06b6d4;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    body {
      font-family: system-ui, -apple-system, sans-serif;
      background: var(--bg-0);
      color: var(--text);
      line-height: 1.6;
      min-height: 100vh;
    }

    .container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 24px;
    }

    /* Header */
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 32px;
      padding-bottom: 24px;
      border-bottom: 1px solid var(--border);
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .logo {
      font-size: 28px;
      font-weight: 800;
      background: linear-gradient(135deg, var(--cyan), var(--purple));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .project-name {
      font-size: 14px;
      color: var(--text-3);
      padding: 4px 12px;
      background: var(--bg-2);
      border-radius: 6px;
    }

    .header-actions {
      display: flex;
      gap: 8px;
    }

    .btn {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 10px 16px;
      border: none;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s;
    }

    .btn-primary {
      background: linear-gradient(135deg, var(--green), #16a34a);
      color: white;
    }

    .btn-primary:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(34, 197, 94, 0.3);
    }

    .btn-secondary {
      background: var(--bg-3);
      color: var(--text);
      border: 1px solid var(--border);
    }

    .btn-secondary:hover {
      background: var(--bg-4);
      border-color: var(--border-hover);
    }

    /* Score Section */
    .score-section {
      display: grid;
      grid-template-columns: 300px 1fr;
      gap: 24px;
      margin-bottom: 32px;
    }

    .score-card {
      background: var(--bg-1);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 32px;
      text-align: center;
    }

    .score-ring {
      position: relative;
      width: 180px;
      height: 180px;
      margin: 0 auto 20px;
    }

    .score-ring svg {
      transform: rotate(-90deg);
    }

    .score-ring circle {
      fill: none;
      stroke-width: 12;
    }

    .score-ring .bg {
      stroke: var(--bg-3);
    }

    .score-ring .progress {
      stroke: ${scoreColor};
      stroke-linecap: round;
      stroke-dasharray: ${securityScore * 5.02} 502;
      transition: stroke-dasharray 1s ease;
    }

    .score-value {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-size: 48px;
      font-weight: 800;
      color: ${scoreColor};
    }

    .score-label {
      font-size: 18px;
      font-weight: 600;
      color: ${scoreColor};
      margin-bottom: 4px;
    }

    .score-subtitle {
      font-size: 13px;
      color: var(--text-3);
    }

    /* Stats Grid */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
    }

    .stat-card {
      background: var(--bg-1);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px;
    }

    .stat-value {
      font-size: 32px;
      font-weight: 800;
      margin-bottom: 4px;
    }

    .stat-value.errors { color: var(--red); }
    .stat-value.warnings { color: var(--yellow); }
    .stat-value.info { color: var(--blue); }
    .stat-value.files { color: var(--cyan); }

    .stat-label {
      font-size: 13px;
      color: var(--text-3);
    }

    /* Summary Bar */
    .summary-bar {
      display: flex;
      gap: 24px;
      padding: 16px 24px;
      background: var(--bg-1);
      border: 1px solid var(--border);
      border-radius: 12px;
      margin-bottom: 24px;
    }

    .summary-item {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      color: var(--text-2);
    }

    .summary-item strong {
      color: var(--text);
    }

    /* Tabs */
    .tabs {
      display: flex;
      gap: 4px;
      margin-bottom: 24px;
      background: var(--bg-1);
      padding: 4px;
      border-radius: 10px;
      width: fit-content;
    }

    .tab {
      padding: 10px 20px;
      border: none;
      background: transparent;
      color: var(--text-3);
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      border-radius: 8px;
      transition: all 0.15s;
    }

    .tab:hover {
      color: var(--text);
      background: var(--bg-2);
    }

    .tab.active {
      background: var(--bg-3);
      color: var(--text);
    }

    .tab-count {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 20px;
      height: 20px;
      padding: 0 6px;
      margin-left: 6px;
      font-size: 11px;
      font-weight: 700;
      border-radius: 10px;
      background: var(--bg-4);
    }

    .tab.active .tab-count {
      background: var(--cyan);
      color: black;
    }

    /* File Groups */
    .file-group {
      background: var(--bg-1);
      border: 1px solid var(--border);
      border-radius: 12px;
      margin-bottom: 12px;
      overflow: hidden;
    }

    .file-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px 20px;
      cursor: pointer;
      transition: background 0.15s;
    }

    .file-header:hover {
      background: var(--bg-2);
    }

    .file-toggle {
      font-size: 12px;
      color: var(--text-3);
      transition: transform 0.2s;
    }

    .file-group.collapsed .file-toggle {
      transform: rotate(-90deg);
    }

    .file-name {
      font-weight: 600;
      font-size: 14px;
    }

    .file-path {
      flex: 1;
      font-size: 12px;
      color: var(--text-4);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .file-badges {
      display: flex;
      gap: 8px;
    }

    .badge {
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 700;
    }

    .badge-error {
      background: rgba(239, 68, 68, 0.15);
      color: var(--red);
    }

    .badge-warning {
      background: rgba(234, 179, 8, 0.15);
      color: var(--yellow);
    }

    .file-issues {
      border-top: 1px solid var(--border);
      padding: 12px;
    }

    .file-group.collapsed .file-issues {
      display: none;
    }

    /* Issue Cards */
    .issue-card {
      background: var(--bg-2);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 16px;
      margin-bottom: 10px;
      cursor: pointer;
      transition: all 0.15s;
    }

    .issue-card:last-child {
      margin-bottom: 0;
    }

    .issue-card:hover {
      border-color: var(--border-hover);
      background: var(--bg-3);
    }

    .issue-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 8px;
    }

    .issue-severity {
      font-size: 11px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .severity-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }

    .issue-rule {
      font-size: 11px;
      color: var(--text-4);
      padding: 2px 8px;
      background: var(--bg-4);
      border-radius: 4px;
    }

    .issue-message {
      font-size: 14px;
      margin-bottom: 8px;
      line-height: 1.5;
    }

    .issue-location {
      display: flex;
      gap: 12px;
      font-size: 12px;
      color: var(--text-3);
    }

    .issue-file {
      color: var(--cyan);
    }

    .issue-suggestion {
      margin-top: 12px;
      padding: 10px 12px;
      background: rgba(34, 197, 94, 0.08);
      border: 1px solid rgba(34, 197, 94, 0.2);
      border-radius: 6px;
      font-size: 13px;
      color: var(--green);
    }

    /* Empty State */
    .empty-state {
      text-align: center;
      padding: 80px 40px;
    }

    .empty-icon {
      width: 48px;
      height: 48px;
      margin-bottom: 20px;
      border: 2px solid var(--border);
      border-radius: 50%;
    }

    .empty-icon.check-icon {
      border-color: var(--green);
      position: relative;
    }

    .empty-icon.check-icon::after {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      width: 12px;
      height: 20px;
      border: solid var(--green);
      border-width: 0 3px 3px 0;
      transform: translate(-50%, -60%) rotate(45deg);
    }

    .empty-title {
      font-size: 24px;
      font-weight: 700;
      margin-bottom: 8px;
    }

    .empty-desc {
      color: var(--text-3);
      max-width: 400px;
      margin: 0 auto;
    }

    /* Tab Content */
    .tab-content {
      display: none;
    }

    .tab-content.active {
      display: block;
    }

    /* Scrollbar */
    ::-webkit-scrollbar {
      width: 8px;
      height: 8px;
    }

    ::-webkit-scrollbar-track {
      background: var(--bg-1);
    }

    ::-webkit-scrollbar-thumb {
      background: var(--bg-4);
      border-radius: 4px;
    }

    ::-webkit-scrollbar-thumb:hover {
      background: var(--border-hover);
    }

    /* Timestamp */
    .timestamp {
      font-size: 12px;
      color: var(--text-4);
      margin-top: 24px;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="header-left">
        <div class="logo">VibeCheck Audit Report</div>
        <div class="project-name">${this._escapeHtml(projectName)}</div>
      </div>
      <div class="header-actions">
        <button class="btn btn-secondary" id="btnRescan">Re-scan</button>
        <button class="btn btn-secondary" id="btnExport">Export</button>
        ${criticalIssues.length > 0 ? '<button class="btn btn-primary" id="btnFix">Auto-Fix</button>' : ''}
      </div>
    </div>

    <div class="score-section">
      <div class="score-card">
        <div class="score-ring">
          <svg width="180" height="180" viewBox="0 0 180 180">
            <circle class="bg" cx="90" cy="90" r="80"/>
            <circle class="progress" cx="90" cy="90" r="80"/>
          </svg>
          <div class="score-value">${securityScore}</div>
        </div>
        <div class="score-label">${scoreLabel}</div>
        <div class="score-subtitle">Security Score</div>
      </div>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value errors">${summary.errors}</div>
          <div class="stat-label">Critical Issues</div>
        </div>
        <div class="stat-card">
          <div class="stat-value warnings">${summary.warnings}</div>
          <div class="stat-label">Warnings</div>
        </div>
        <div class="stat-card">
          <div class="stat-value info">${summary.info}</div>
          <div class="stat-label">Info</div>
        </div>
        <div class="stat-card">
          <div class="stat-value files">${filesScanned}</div>
          <div class="stat-label">Files Scanned</div>
        </div>
      </div>
    </div>

    <div class="summary-bar">
      <div class="summary-item"><strong>${summary.total}</strong> total issues</div>
      <div class="summary-item"><strong>${issuesByFile.size}</strong> affected files</div>
      <div class="summary-item"><strong>${(scanDuration / 1000).toFixed(1)}s</strong> scan time</div>
      <div class="summary-item">Attack Score: <strong>${attackScore}/100</strong></div>
    </div>

    <div class="tabs">
      <button class="tab active" data-tab="all">All Issues <span class="tab-count">${summary.total}</span></button>
      <button class="tab" data-tab="errors">Errors <span class="tab-count">${summary.errors}</span></button>
      <button class="tab" data-tab="warnings">Warnings <span class="tab-count">${summary.warnings}</span></button>
      <button class="tab" data-tab="info">Info <span class="tab-count">${summary.info}</span></button>
    </div>

    <div class="tab-content active" id="tab-all">
      ${summary.total === 0 ? `
        <div class="empty-state">
          <div class="empty-icon check-icon"></div>
          <div class="empty-title">No Issues Found</div>
          <div class="empty-desc">Your codebase passed all security checks.</div>
        </div>
      ` : fileGroupsHtml}
    </div>

    <div class="tab-content" id="tab-errors">
      ${criticalIssues.length === 0 ? `
        <div class="empty-state">
          <div class="empty-icon check-icon"></div>
          <div class="empty-title">No Critical Issues</div>
          <div class="empty-desc">No critical security issues were found.</div>
        </div>
      ` : criticalIssues.map((issue, idx) => generateIssueCard(issue, idx)).join('')}
    </div>

    <div class="tab-content" id="tab-warnings">
      ${warningIssues.length === 0 ? `
        <div class="empty-state">
          <div class="empty-icon check-icon"></div>
          <div class="empty-title">No Warnings</div>
          <div class="empty-desc">No warnings were found.</div>
        </div>
      ` : warningIssues.map((issue, idx) => generateIssueCard(issue, idx)).join('')}
    </div>

    <div class="tab-content" id="tab-info">
      ${infoIssues.length === 0 ? `
        <div class="empty-state">
          <div class="empty-icon check-icon"></div>
          <div class="empty-title">No Info Issues</div>
          <div class="empty-desc">No informational issues were found.</div>
        </div>
      ` : infoIssues.map((issue, idx) => generateIssueCard(issue, idx)).join('')}
    </div>

    <div class="timestamp">
      Generated on ${new Date(timestamp).toLocaleString()}
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    // Tab switching
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
      });
    });

    // File group toggle
    window.toggleFileGroup = function(header) {
      header.parentElement.classList.toggle('collapsed');
    };

    // Issue card click - open file
    document.querySelectorAll('.issue-card').forEach(card => {
      card.addEventListener('click', () => {
        const file = card.dataset.file;
        const line = parseInt(card.dataset.line, 10);
        vscode.postMessage({ command: 'openFile', file, line });
      });
    });

    // Button handlers
    document.getElementById('btnRescan')?.addEventListener('click', () => {
      vscode.postMessage({ command: 'rescan' });
    });

    document.getElementById('btnExport')?.addEventListener('click', () => {
      vscode.postMessage({ command: 'exportReport' });
    });

    document.getElementById('btnFix')?.addEventListener('click', () => {
      vscode.postMessage({ command: 'fixIssue' });
    });
  </script>
</body>
</html>`;
  }

  private _escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  public dispose() {
    AuditReportPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const d = this._disposables.pop();
      if (d) d.dispose();
    }
  }
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
