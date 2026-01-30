import * as vscode from 'vscode';
import { Issue } from './DiagnosticsProvider';

export class IssueDetailPanel {
  public static currentPanel: IssueDetailPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(extensionUri: vscode.Uri, issue: Issue) {
    const column = vscode.ViewColumn.Beside;

    if (IssueDetailPanel.currentPanel) {
      IssueDetailPanel.currentPanel._panel.reveal(column);
      IssueDetailPanel.currentPanel._update(issue);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'vibecheckIssueDetail',
      `Issue: ${issue.rule}`,
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri],
      }
    );

    IssueDetailPanel.currentPanel = new IssueDetailPanel(panel, extensionUri, issue);
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    issue: Issue
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    this._update(issue);

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'fix':
            await vscode.commands.executeCommand('vibecheck.fix', { issueId: message.issueId });
            break;
          case 'ignore':
            await vscode.commands.executeCommand('vibecheck.ignoreIssue', { issueId: message.issueId });
            break;
          case 'ignoreRule':
            await vscode.commands.executeCommand('vibecheck.ignoreRule', { rule: message.rule });
            break;
          case 'goToCode':
            await this._goToCode(message.file, message.line, message.column);
            break;
          case 'copyCode':
            await vscode.env.clipboard.writeText(message.code);
            void vscode.window.showInformationMessage('Code copied to clipboard');
            break;
        }
      },
      null,
      this._disposables
    );
  }

  private async _goToCode(file: string, line: number, column: number) {
    const doc = await vscode.workspace.openTextDocument(file);
    const editor = await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
    const position = new vscode.Position(line - 1, column - 1);
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
  }

  private _update(issue: Issue) {
    this._panel.title = `Issue: ${issue.rule}`;
    this._panel.webview.html = this._getHtmlForWebview(issue);
  }

  private _getHtmlForWebview(issue: Issue) {
    const nonce = getNonce();
    const severityColor = this._getSeverityColor(issue.severity);
    const severityIcon = this._getSeverityIcon(issue.severity);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this._panel.webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Issue Detail</title>
  <style>
    :root {
      --bg-primary: #0d0d0d;
      --bg-secondary: #1a1a1a;
      --bg-tertiary: #242424;
      --bg-glass: rgba(255, 255, 255, 0.03);
      --border-subtle: rgba(255, 255, 255, 0.08);
      --border-accent: rgba(255, 255, 255, 0.15);
      --text-primary: #ffffff;
      --text-secondary: rgba(255, 255, 255, 0.7);
      --text-tertiary: rgba(255, 255, 255, 0.5);
      --accent-green: #00ff88;
      --accent-red: #ff5c5c;
      --accent-yellow: #ffcc00;
      --accent-blue: #5c9cff;
      --accent-purple: #a855f7;
      --gradient-premium: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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
      padding: 32px;
      line-height: 1.6;
    }

    .container {
      max-width: 800px;
      margin: 0 auto;
    }

    /* Header */
    .header {
      display: flex;
      align-items: flex-start;
      gap: 20px;
      margin-bottom: 32px;
      padding-bottom: 24px;
      border-bottom: 1px solid var(--border-subtle);
    }

    .severity-badge {
      width: 56px;
      height: 56px;
      border-radius: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 28px;
      flex-shrink: 0;
      background: ${severityColor}15;
      border: 2px solid ${severityColor};
      box-shadow: 0 0 20px ${severityColor}30;
    }

    .header-content {
      flex: 1;
    }

    .rule-name {
      font-size: 24px;
      font-weight: 700;
      letter-spacing: -0.5px;
      margin-bottom: 8px;
      color: ${severityColor};
    }

    .issue-message {
      font-size: 16px;
      color: var(--text-secondary);
      line-height: 1.5;
    }

    /* Meta info */
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 32px;
    }

    .meta-card {
      background: var(--bg-glass);
      border: 1px solid var(--border-subtle);
      border-radius: 12px;
      padding: 16px;
    }

    .meta-label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: var(--text-tertiary);
      margin-bottom: 6px;
    }

    .meta-value {
      font-size: 14px;
      font-weight: 500;
      color: var(--text-primary);
      word-break: break-all;
    }

    .meta-value.clickable {
      color: var(--accent-blue);
      cursor: pointer;
      text-decoration: underline;
      text-decoration-color: transparent;
      transition: text-decoration-color 0.2s;
    }

    .meta-value.clickable:hover {
      text-decoration-color: var(--accent-blue);
    }

    /* Code section */
    .section {
      margin-bottom: 32px;
    }

    .section-title {
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: var(--text-tertiary);
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .code-container {
      position: relative;
      background: var(--bg-secondary);
      border: 1px solid var(--border-subtle);
      border-radius: 12px;
      overflow: hidden;
    }

    .code-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      background: var(--bg-tertiary);
      border-bottom: 1px solid var(--border-subtle);
    }

    .code-filename {
      font-size: 12px;
      color: var(--text-secondary);
      font-family: 'SF Mono', 'Fira Code', monospace;
    }

    .code-actions {
      display: flex;
      gap: 8px;
    }

    .code-action-btn {
      background: transparent;
      border: none;
      color: var(--text-tertiary);
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      transition: all 0.2s;
    }

    .code-action-btn:hover {
      background: var(--bg-glass);
      color: var(--text-primary);
    }

    .code-block {
      padding: 16px;
      overflow-x: auto;
    }

    pre {
      margin: 0;
      font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
      font-size: 13px;
      line-height: 1.6;
    }

    code {
      color: var(--text-primary);
    }

    .line-highlight {
      background: ${severityColor}15;
      display: block;
      margin: 0 -16px;
      padding: 0 16px;
      border-left: 3px solid ${severityColor};
    }

    /* Suggestion section */
    .suggestion-card {
      background: linear-gradient(135deg, rgba(168, 85, 247, 0.1) 0%, rgba(102, 126, 234, 0.1) 100%);
      border: 1px solid rgba(168, 85, 247, 0.3);
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 32px;
    }

    .suggestion-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 12px;
    }

    .suggestion-icon {
      font-size: 20px;
    }

    .suggestion-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--accent-purple);
    }

    .suggestion-text {
      font-size: 14px;
      color: var(--text-secondary);
      line-height: 1.6;
    }

    /* Action buttons */
    .actions {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 12px 20px;
      border: none;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }

    .btn-primary {
      background: var(--gradient-premium);
      color: white;
      box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
    }

    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
    }

    .btn-secondary {
      background: var(--bg-glass);
      border: 1px solid var(--border-subtle);
      color: var(--text-primary);
    }

    .btn-secondary:hover {
      background: var(--bg-tertiary);
      border-color: var(--border-accent);
    }

    .btn-danger {
      background: rgba(255, 92, 92, 0.1);
      border: 1px solid var(--accent-red);
      color: var(--accent-red);
    }

    .btn-danger:hover {
      background: rgba(255, 92, 92, 0.2);
    }

    /* Documentation link */
    .docs-link {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 16px;
      background: var(--bg-glass);
      border: 1px solid var(--border-subtle);
      border-radius: 12px;
      color: var(--text-secondary);
      text-decoration: none;
      transition: all 0.2s;
      margin-top: 24px;
    }

    .docs-link:hover {
      background: var(--bg-tertiary);
      border-color: var(--border-accent);
      color: var(--text-primary);
    }

    /* Animations */
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .animate-in {
      animation: fadeIn 0.3s ease forwards;
    }

    .delay-1 { animation-delay: 0.1s; opacity: 0; }
    .delay-2 { animation-delay: 0.2s; opacity: 0; }
    .delay-3 { animation-delay: 0.3s; opacity: 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header animate-in">
      <div class="severity-badge">${severityIcon}</div>
      <div class="header-content">
        <div class="rule-name">${escapeHtml(issue.rule)}</div>
        <div class="issue-message">${escapeHtml(issue.message)}</div>
      </div>
    </div>

    <div class="meta-grid animate-in delay-1">
      <div class="meta-card">
        <div class="meta-label">Severity</div>
        <div class="meta-value" style="color: ${severityColor}">${issue.severity.toUpperCase()}</div>
      </div>
      <div class="meta-card">
        <div class="meta-label">Engine</div>
        <div class="meta-value">${escapeHtml(issue.engine)}</div>
      </div>
      <div class="meta-card">
        <div class="meta-label">Location</div>
        <div class="meta-value clickable" onclick="goToCode()">Line ${issue.line}, Column ${issue.column}</div>
      </div>
      <div class="meta-card">
        <div class="meta-label">File</div>
        <div class="meta-value clickable" onclick="goToCode()" title="${escapeHtml(issue.file)}">${escapeHtml(getFileName(issue.file))}</div>
      </div>
    </div>

    ${issue.codeSnippet ? `
    <div class="section animate-in delay-2">
      <div class="section-title">
        <span>📄</span> Problematic Code
      </div>
      <div class="code-container">
        <div class="code-header">
          <span class="code-filename">${escapeHtml(getFileName(issue.file))}:${issue.line}</span>
          <div class="code-actions">
            <button class="code-action-btn" onclick="copyCode()">📋 Copy</button>
            <button class="code-action-btn" onclick="goToCode()">↗️ Open</button>
          </div>
        </div>
        <div class="code-block">
          <pre><code><span class="line-highlight">${escapeHtml(issue.codeSnippet)}</span></code></pre>
        </div>
      </div>
    </div>
    ` : ''}

    ${issue.suggestion ? `
    <div class="suggestion-card animate-in delay-2">
      <div class="suggestion-header">
        <span class="suggestion-icon">💡</span>
        <span class="suggestion-title">AI Suggestion</span>
      </div>
      <div class="suggestion-text">${escapeHtml(issue.suggestion)}</div>
    </div>
    ` : ''}

    <div class="actions animate-in delay-3">
      ${issue.aiFixAvailable || issue.suggestion ? `
      <button class="btn btn-primary" onclick="fixIssue()">
        <span>✨</span> Apply AI Fix
      </button>
      ` : ''}
      <button class="btn btn-secondary" onclick="ignoreIssue()">
        <span>🚫</span> Ignore Issue
      </button>
      <button class="btn btn-secondary" onclick="ignoreRule()">
        <span>⏭️</span> Ignore Rule
      </button>
      <button class="btn btn-secondary" onclick="goToCode()">
        <span>📍</span> Go to Code
      </button>
    </div>

    ${issue.documentationUrl ? `
    <a href="${issue.documentationUrl}" class="docs-link animate-in delay-3">
      <span>📚</span>
      <span>Learn more about this issue in the documentation</span>
      <span style="margin-left: auto;">→</span>
    </a>
    ` : ''}
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const issue = ${JSON.stringify(issue)};

    function fixIssue() {
      vscode.postMessage({ command: 'fix', issueId: issue.id });
    }

    function ignoreIssue() {
      vscode.postMessage({ command: 'ignore', issueId: issue.id });
    }

    function ignoreRule() {
      vscode.postMessage({ command: 'ignoreRule', rule: issue.rule });
    }

    function goToCode() {
      vscode.postMessage({ 
        command: 'goToCode', 
        file: issue.file, 
        line: issue.line, 
        column: issue.column 
      });
    }

    function copyCode() {
      vscode.postMessage({ command: 'copyCode', code: issue.codeSnippet || '' });
    }
  </script>
</body>
</html>`;
  }

  private _getSeverityColor(severity: string): string {
    switch (severity.toLowerCase()) {
      case 'error':
        return '#ff5c5c';
      case 'warning':
        return '#ffcc00';
      case 'info':
        return '#5c9cff';
      default:
        return '#888888';
    }
  }

  private _getSeverityIcon(severity: string): string {
    switch (severity.toLowerCase()) {
      case 'error':
        return '🔴';
      case 'warning':
        return '🟡';
      case 'info':
        return '🔵';
      default:
        return '⚪';
    }
  }

  public dispose() {
    IssueDetailPanel.currentPanel = undefined;

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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getFileName(filePath: string): string {
  return filePath.split(/[\\/]/).pop() || filePath;
}
