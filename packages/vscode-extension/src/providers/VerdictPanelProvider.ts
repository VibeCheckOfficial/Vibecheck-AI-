import * as vscode from 'vscode';
import { FirewallService, FirewallMode, ShieldCheckResult, FirewallVerdict } from '../services/FirewallService';

export class VerdictPanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'vibecheck.verdict';

  private _view?: vscode.WebviewView;
  private _currentVerdict?: ShieldCheckResult;
  private _firewallMode: FirewallMode = 'off';

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _firewallService: FirewallService
  ) {
    // Subscribe to status changes
    _firewallService.onStatusChange((status) => {
      this._firewallMode = status.mode;
      this._updateView();
    });
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage((message) => {
      void (async () => {
        switch (message.command) {
          case 'refresh':
            await this._runCheck();
            break;
          case 'setMode':
            await this._setMode(message.mode);
            break;
          case 'openFile':
            await this._openFile(message.file, message.line);
            break;
          case 'copyVerdict':
            await this._copyVerdict();
            break;
        }
      })();
    });

    // Initialize
    void this._initialize();
  }

  private async _initialize(): Promise<void> {
    const status = await this._firewallService.getStatus();
    this._firewallMode = status.mode;
    this._updateView();
  }

  private async _runCheck(): Promise<void> {
    if (this._view) {
      void this._view.webview.postMessage({ command: 'loading', loading: true });
    }

    const result = await this._firewallService.check();
    this._currentVerdict = result || undefined;
    this._updateView();
  }

  private async _setMode(mode: FirewallMode): Promise<void> {
    await this._firewallService.setMode(mode);
    this._firewallMode = mode;
    this._updateView();
  }

  private async _openFile(file: string, line?: number): Promise<void> {
    if (!file) return;

    try {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders) return;

      const uri = vscode.Uri.joinPath(workspaceFolders[0].uri, file);
      const doc = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(doc);

      if (line && line > 0) {
        const position = new vscode.Position(line - 1, 0);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(
          new vscode.Range(position, position),
          vscode.TextEditorRevealType.InCenter
        );
      }
    } catch {
      // File might not exist
    }
  }

  private async _copyVerdict(): Promise<void> {
    if (!this._currentVerdict) {
      void vscode.window.showWarningMessage('No verdict available. Run check first.');
      return;
    }

    const shareData = {
      verdict: this._currentVerdict.verdict,
      score: this._currentVerdict.score,
      passed: this._currentVerdict.passed,
      findingsCount: this._currentVerdict.findings.length,
      timestamp: new Date().toISOString(),
    };

    await vscode.env.clipboard.writeText(JSON.stringify(shareData, null, 2));
    void vscode.window.showInformationMessage('Verdict copied to clipboard!');
  }

  public updateVerdict(verdict: ShieldCheckResult): void {
    this._currentVerdict = verdict;
    this._updateView();
  }

  private _updateView(): void {
    if (this._view) {
      void this._view.webview.postMessage({
        command: 'update',
        verdict: this._currentVerdict,
        mode: this._firewallMode,
      });
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Shield Verdict</title>
  <style>
    :root {
      --bg-primary: #0a0a0a;
      --bg-secondary: #111111;
      --bg-elevated: #171717;
      --bg-hover: #1f1f1f;
      --text-primary: #fafafa;
      --text-secondary: #a1a1aa;
      --text-muted: #71717a;
      --border: #27272a;
      --neon-green: #10b981;
      --neon-yellow: #f59e0b;
      --neon-red: #ef4444;
      --neon-cyan: #00d4ff;
      --neon-purple: #a855f7;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      padding: 12px;
      font-size: 12px;
    }

    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--border);
    }

    .title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 600;
    }

    .shield-icon {
      font-size: 18px;
    }

    .mode-badge {
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 4px;
      text-transform: uppercase;
      font-weight: 600;
    }

    .mode-badge.off {
      background: var(--bg-elevated);
      color: var(--text-muted);
    }

    .mode-badge.observe {
      background: rgba(0, 212, 255, 0.15);
      color: var(--neon-cyan);
      border: 1px solid var(--neon-cyan);
    }

    .mode-badge.enforce {
      background: rgba(168, 85, 247, 0.15);
      color: var(--neon-purple);
      border: 1px solid var(--neon-purple);
    }

    .verdict-card {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 16px;
      text-align: center;
      margin-bottom: 12px;
    }

    .verdict-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 700;
      text-transform: uppercase;
    }

    .verdict-badge.ship {
      background: rgba(16, 185, 129, 0.15);
      color: var(--neon-green);
      border: 1px solid var(--neon-green);
      box-shadow: 0 0 15px rgba(16, 185, 129, 0.2);
    }

    .verdict-badge.warn {
      background: rgba(245, 158, 11, 0.15);
      color: var(--neon-yellow);
      border: 1px solid var(--neon-yellow);
      box-shadow: 0 0 15px rgba(245, 158, 11, 0.2);
    }

    .verdict-badge.block {
      background: rgba(239, 68, 68, 0.15);
      color: var(--neon-red);
      border: 1px solid var(--neon-red);
      box-shadow: 0 0 15px rgba(239, 68, 68, 0.2);
    }

    .score {
      font-size: 28px;
      font-weight: 700;
      margin-top: 12px;
    }

    .score-label {
      font-size: 11px;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .stats-row {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      margin-bottom: 12px;
    }

    .stat {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 10px;
      text-align: center;
    }

    .stat-value {
      font-size: 18px;
      font-weight: 700;
    }

    .stat-value.critical { color: var(--neon-red); }
    .stat-value.high { color: #f97316; }
    .stat-value.medium { color: var(--neon-yellow); }

    .stat-label {
      font-size: 10px;
      color: var(--text-muted);
      text-transform: uppercase;
      margin-top: 2px;
    }

    .findings-section {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 8px;
      overflow: hidden;
      margin-bottom: 12px;
    }

    .findings-header {
      display: flex;
      justify-content: space-between;
      padding: 8px 12px;
      background: var(--bg-elevated);
      border-bottom: 1px solid var(--border);
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      color: var(--text-secondary);
    }

    .findings-list {
      max-height: 200px;
      overflow-y: auto;
    }

    .finding-item {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 8px 12px;
      border-bottom: 1px solid var(--border);
      cursor: pointer;
      transition: background 0.15s;
    }

    .finding-item:hover {
      background: var(--bg-hover);
    }

    .finding-item:last-child {
      border-bottom: none;
    }

    .finding-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      margin-top: 4px;
      flex-shrink: 0;
    }

    .finding-dot.critical { background: var(--neon-red); }
    .finding-dot.high { background: #f97316; }
    .finding-dot.medium { background: var(--neon-yellow); }
    .finding-dot.low { background: var(--neon-cyan); }

    .finding-content { flex: 1; min-width: 0; }

    .finding-message {
      font-size: 11px;
      color: var(--text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .finding-location {
      font-size: 10px;
      color: var(--text-muted);
      margin-top: 2px;
    }

    .mode-selector {
      display: flex;
      gap: 6px;
      margin-bottom: 12px;
    }

    .mode-btn {
      flex: 1;
      padding: 8px;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: var(--bg-secondary);
      color: var(--text-secondary);
      font-size: 10px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s;
      text-transform: uppercase;
    }

    .mode-btn:hover {
      background: var(--bg-hover);
      border-color: var(--text-muted);
    }

    .mode-btn.active {
      background: var(--neon-purple);
      color: white;
      border-color: var(--neon-purple);
    }

    .mode-btn.active.observe {
      background: var(--neon-cyan);
      border-color: var(--neon-cyan);
      color: var(--bg-primary);
    }

    .mode-btn.active.off {
      background: var(--bg-elevated);
      border-color: var(--text-muted);
      color: var(--text-muted);
    }

    .actions {
      display: flex;
      gap: 8px;
    }

    .btn {
      flex: 1;
      padding: 10px;
      border: none;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }

    .btn-primary {
      background: var(--neon-cyan);
      color: var(--bg-primary);
    }

    .btn-primary:hover {
      box-shadow: 0 0 15px rgba(0, 212, 255, 0.3);
    }

    .btn-secondary {
      background: var(--bg-elevated);
      color: var(--text-primary);
      border: 1px solid var(--border);
    }

    .btn-secondary:hover {
      background: var(--bg-hover);
    }

    .empty-state {
      text-align: center;
      padding: 24px;
      color: var(--text-muted);
    }

    .empty-icon {
      font-size: 32px;
      margin-bottom: 8px;
    }

    .loading {
      display: none;
      text-align: center;
      padding: 24px;
      color: var(--text-secondary);
    }

    .loading.active {
      display: block;
    }

    .spinner {
      width: 24px;
      height: 24px;
      border: 2px solid var(--border);
      border-top-color: var(--neon-cyan);
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 8px;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="title">
      <span class="shield-icon">🛡️</span>
      <span>Agent Firewall</span>
    </div>
    <span class="mode-badge off" id="modeBadge">OFF</span>
  </div>

  <div class="mode-selector">
    <button class="mode-btn active off" id="modeOff" onclick="setMode('off')">Off</button>
    <button class="mode-btn observe" id="modeObserve" onclick="setMode('observe')">Observe</button>
    <button class="mode-btn enforce" id="modeEnforce" onclick="setMode('enforce')">Enforce</button>
  </div>

  <div id="content">
    <div class="empty-state">
      <div class="empty-icon">🔍</div>
      <div>No verdict yet</div>
      <div style="font-size: 10px; margin-top: 4px;">Click Check to verify AI claims</div>
    </div>
  </div>

  <div class="loading" id="loading">
    <div class="spinner"></div>
    <div>Running shield check...</div>
  </div>

  <div class="actions">
    <button class="btn btn-primary" id="checkBtn" onclick="runCheck()">
      ⟳ Check
    </button>
    <button class="btn btn-secondary" onclick="copyVerdict()">
      📋 Copy
    </button>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let currentMode = 'off';
    let currentVerdict = null;

    function runCheck() {
      vscode.postMessage({ command: 'refresh' });
    }

    function setMode(mode) {
      vscode.postMessage({ command: 'setMode', mode });
    }

    function openFile(file, line) {
      vscode.postMessage({ command: 'openFile', file, line });
    }

    function copyVerdict() {
      vscode.postMessage({ command: 'copyVerdict' });
    }

    function updateModeUI(mode) {
      currentMode = mode;
      
      // Update mode badge
      const badge = document.getElementById('modeBadge');
      badge.className = 'mode-badge ' + mode;
      badge.textContent = mode.toUpperCase();

      // Update mode buttons
      document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.classList.remove('active');
      });
      
      if (mode === 'off') {
        document.getElementById('modeOff').classList.add('active');
      } else if (mode === 'observe') {
        document.getElementById('modeObserve').classList.add('active');
      } else if (mode === 'enforce') {
        document.getElementById('modeEnforce').classList.add('active');
      }
    }

    function renderVerdict(verdict) {
      const content = document.getElementById('content');
      
      if (!verdict) {
        content.innerHTML = \`
          <div class="empty-state">
            <div class="empty-icon">🔍</div>
            <div>No verdict yet</div>
            <div style="font-size: 10px; margin-top: 4px;">Click Check to verify AI claims</div>
          </div>
        \`;
        return;
      }

      currentVerdict = verdict;
      const verdictClass = verdict.verdict.toLowerCase();
      const icon = verdict.verdict === 'SHIP' ? '✅' : verdict.verdict === 'WARN' ? '⚠️' : '🚫';
      
      const criticalCount = verdict.findings.filter(f => f.severity === 'critical').length;
      const highCount = verdict.findings.filter(f => f.severity === 'high').length;
      const mediumCount = verdict.findings.filter(f => f.severity === 'medium').length;

      let findingsHtml = '';
      for (const f of verdict.findings.slice(0, 8)) {
        const location = f.file ? (f.line ? f.file + ':' + f.line : f.file) : '';
        findingsHtml += \`
          <div class="finding-item" onclick="openFile('\${f.file || ''}', \${f.line || 0})">
            <div class="finding-dot \${f.severity}"></div>
            <div class="finding-content">
              <div class="finding-message">\${escapeHtml(f.message)}</div>
              \${location ? '<div class="finding-location">' + escapeHtml(location) + '</div>' : ''}
            </div>
          </div>
        \`;
      }

      if (verdict.findings.length > 8) {
        findingsHtml += \`
          <div class="finding-item" style="justify-content: center; color: var(--text-muted);">
            +\${verdict.findings.length - 8} more findings
          </div>
        \`;
      }

      content.innerHTML = \`
        <div class="verdict-card">
          <div class="verdict-badge \${verdictClass}">
            \${icon} \${verdict.verdict}
          </div>
          <div class="score">\${verdict.score}</div>
          <div class="score-label">Shield Score</div>
        </div>

        <div class="stats-row">
          <div class="stat">
            <div class="stat-value critical">\${criticalCount}</div>
            <div class="stat-label">Critical</div>
          </div>
          <div class="stat">
            <div class="stat-value high">\${highCount}</div>
            <div class="stat-label">High</div>
          </div>
          <div class="stat">
            <div class="stat-value medium">\${mediumCount}</div>
            <div class="stat-label">Medium</div>
          </div>
        </div>

        \${verdict.findings.length > 0 ? \`
          <div class="findings-section">
            <div class="findings-header">
              <span>Findings</span>
              <span>\${verdict.findings.length}</span>
            </div>
            <div class="findings-list">
              \${findingsHtml}
            </div>
          </div>
        \` : ''}
      \`;
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    window.addEventListener('message', event => {
      const message = event.data;
      
      if (message.command === 'loading') {
        document.getElementById('loading').classList.toggle('active', message.loading);
        document.getElementById('content').style.display = message.loading ? 'none' : 'block';
      } else if (message.command === 'update') {
        document.getElementById('loading').classList.remove('active');
        document.getElementById('content').style.display = 'block';
        
        if (message.mode) {
          updateModeUI(message.mode);
        }
        if (message.verdict !== undefined) {
          renderVerdict(message.verdict);
        }
      }
    });
  </script>
</body>
</html>`;
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
