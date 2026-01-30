import * as vscode from 'vscode';

interface DoctorCheck {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
  category?: string;
  details?: string;
  fix?: string;
}

interface DoctorData {
  healthy: boolean;
  checks: DoctorCheck[];
  timestamp: string;
  projectName: string;
  duration: number;
  environment: {
    nodeVersion?: string;
    npmVersion?: string;
    platform?: string;
    cwd?: string;
  };
}

export class DoctorReportPanel {
  public static currentPanel: DoctorReportPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(
    extensionUri: vscode.Uri,
    doctorData: DoctorData
  ): DoctorReportPanel {
    const column = vscode.window.activeTextEditor?.viewColumn;

    if (DoctorReportPanel.currentPanel) {
      DoctorReportPanel.currentPanel._panel.reveal(column);
      DoctorReportPanel.currentPanel._update(doctorData);
      return DoctorReportPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      'vibecheckDoctorReport',
      'VibeCheck Doctor',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri],
      }
    );

    DoctorReportPanel.currentPanel = new DoctorReportPanel(panel, extensionUri, doctorData);
    return DoctorReportPanel.currentPanel;
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    doctorData: DoctorData
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    this._update(doctorData);

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'rerun':
            await vscode.commands.executeCommand('vibecheck.doctor');
            break;
          case 'openTerminal':
            const terminal = vscode.window.createTerminal('VibeCheck Doctor');
            terminal.show();
            if (message.cmd) {
              terminal.sendText(message.cmd);
            }
            break;
          case 'openSettings':
            await vscode.commands.executeCommand('workbench.action.openSettings', 'vibecheck');
            break;
          case 'installCli':
            const installTerminal = vscode.window.createTerminal('Install VibeCheck CLI');
            installTerminal.show();
            installTerminal.sendText('npm install -g @vibecheckai/cli');
            break;
        }
      },
      null,
      this._disposables
    );
  }

  private _update(doctorData: DoctorData) {
    this._panel.webview.html = this._getHtmlForWebview(doctorData);
  }

  private _getHtmlForWebview(data: DoctorData): string {
    const nonce = getNonce();
    const { healthy, checks, timestamp, projectName, duration, environment } = data;

    // Categorize checks
    const passedChecks = checks.filter(c => c.status === 'pass');
    const warningChecks = checks.filter(c => c.status === 'warn');
    const failedChecks = checks.filter(c => c.status === 'fail');

    // Group checks by category
    const categories = new Map<string, DoctorCheck[]>();
    for (const check of checks) {
      const cat = check.category || this._inferCategory(check.name);
      if (!categories.has(cat)) categories.set(cat, []);
      categories.get(cat)!.push(check);
    }

    // Calculate health score
    const totalChecks = checks.length;
    const healthScore = totalChecks > 0
      ? Math.round((passedChecks.length / totalChecks) * 100)
      : 100;

    const scoreColor = healthScore >= 80 ? '#10b981' : healthScore >= 50 ? '#f59e0b' : '#ef4444';
    const healthStatus = healthy ? 'Healthy' : failedChecks.length > 0 ? 'Issues Found' : 'Warnings';

    // Generate check cards
    const generateCheckCard = (check: DoctorCheck) => {
      const statusConfig: Record<string, { color: string; bg: string }> = {
        pass: { color: '#10b981', bg: 'rgba(16, 185, 129, 0.08)' },
        warn: { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.08)' },
        fail: { color: '#ef4444', bg: 'rgba(239, 68, 68, 0.08)' },
      };
      const config = statusConfig[check.status];

      return `
        <div class="check-card ${check.status}">
          <div class="check-status" style="background: ${config.bg}; border-color: ${config.color}">
            <span class="check-dot" style="background: ${config.color}"></span>
          </div>
          <div class="check-content">
            <div class="check-name">${this._escapeHtml(check.name)}</div>
            <div class="check-message">${this._escapeHtml(check.message)}</div>
            ${check.fix ? `
              <div class="check-fix">
                <span class="fix-label">Fix:</span>
                <code>${this._escapeHtml(check.fix)}</code>
              </div>
            ` : ''}
          </div>
        </div>
      `;
    };

    // Generate category sections
    const generateCategorySection = (category: string, categoryChecks: DoctorCheck[]) => {
      const passed = categoryChecks.filter(c => c.status === 'pass').length;
      const total = categoryChecks.length;

      return `
        <div class="category-section">
          <div class="category-header">
            <span class="category-name">${category}</span>
            <span class="category-count">${passed}/${total}</span>
          </div>
          <div class="category-checks">
            ${categoryChecks.map(check => generateCheckCard(check)).join('')}
          </div>
        </div>
      `;
    };

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this._panel.webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${this._panel.webview.cspSource}; img-src ${this._panel.webview.cspSource} https: data:;">
  <title>VibeCheck Doctor</title>
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
      --pink: #ec4899;
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
      max-width: 1200px;
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
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .logo-icon {
      font-size: 32px;
    }

    .logo-text {
      background: linear-gradient(135deg, var(--pink), var(--purple));
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
      background: linear-gradient(135deg, var(--pink), var(--purple));
      color: white;
    }

    .btn-primary:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(236, 72, 153, 0.3);
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

    /* Health Overview */
    .health-section {
      display: grid;
      grid-template-columns: 320px 1fr;
      gap: 24px;
      margin-bottom: 32px;
    }

    .health-card {
      background: var(--bg-1);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 32px;
      text-align: center;
    }

    .health-icon {
      font-size: 64px;
      margin-bottom: 16px;
    }

    .health-score {
      font-size: 56px;
      font-weight: 800;
      color: ${scoreColor};
      margin-bottom: 8px;
    }

    .health-label {
      font-size: 18px;
      font-weight: 600;
      color: ${scoreColor};
      margin-bottom: 4px;
    }

    .health-subtitle {
      font-size: 13px;
      color: var(--text-3);
    }

    /* Stats Grid */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
    }

    .stat-card {
      background: var(--bg-1);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 24px;
      text-align: center;
    }

    .stat-icon {
      font-size: 32px;
      margin-bottom: 12px;
    }

    .stat-value {
      font-size: 36px;
      font-weight: 800;
      margin-bottom: 4px;
    }

    .stat-value.passed { color: var(--green); }
    .stat-value.warnings { color: var(--yellow); }
    .stat-value.failed { color: var(--red); }

    .stat-label {
      font-size: 13px;
      color: var(--text-3);
    }

    /* Environment Info */
    .env-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      padding: 16px 20px;
      background: var(--bg-1);
      border: 1px solid var(--border);
      border-radius: 12px;
      margin-bottom: 24px;
    }

    .env-item {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      color: var(--text-2);
    }

    .env-item code {
      background: var(--bg-3);
      padding: 2px 8px;
      border-radius: 4px;
      font-family: 'SF Mono', 'JetBrains Mono', monospace;
      color: var(--cyan);
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
      background: var(--pink);
      color: white;
    }

    /* Category Sections */
    .category-section {
      background: var(--bg-1);
      border: 1px solid var(--border);
      border-radius: 12px;
      margin-bottom: 16px;
      overflow: hidden;
    }

    .category-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px 20px;
      background: var(--bg-2);
      border-bottom: 1px solid var(--border);
    }

    .category-icon {
      font-size: 20px;
    }

    .category-name {
      font-weight: 600;
      font-size: 15px;
      flex: 1;
    }

    .category-count {
      font-size: 12px;
      color: var(--text-3);
      padding: 4px 10px;
      background: var(--bg-4);
      border-radius: 6px;
    }

    .category-checks {
      padding: 12px;
    }

    /* Check Cards */
    .check-card {
      display: flex;
      gap: 16px;
      padding: 16px;
      background: var(--bg-2);
      border: 1px solid var(--border);
      border-radius: 10px;
      margin-bottom: 10px;
      transition: all 0.15s;
    }

    .check-card:last-child {
      margin-bottom: 0;
    }

    .check-card:hover {
      border-color: var(--border-hover);
    }

    .check-card.pass {
      border-left: 3px solid var(--green);
    }

    .check-card.warn {
      border-left: 3px solid var(--yellow);
    }

    .check-card.fail {
      border-left: 3px solid var(--red);
    }

    .check-status {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .check-icon {
      font-size: 18px;
      font-weight: 700;
    }

    .check-content {
      flex: 1;
      min-width: 0;
    }

    .check-name {
      font-weight: 600;
      font-size: 14px;
      margin-bottom: 4px;
    }

    .check-message {
      font-size: 13px;
      color: var(--text-2);
      line-height: 1.5;
    }

    .check-fix {
      margin-top: 12px;
      padding: 10px 12px;
      background: rgba(6, 182, 212, 0.08);
      border: 1px solid rgba(6, 182, 212, 0.2);
      border-radius: 6px;
      font-size: 12px;
    }

    .fix-label {
      color: var(--cyan);
      font-weight: 600;
      margin-right: 8px;
    }

    .check-fix code {
      background: var(--bg-4);
      padding: 2px 6px;
      border-radius: 4px;
      font-family: 'SF Mono', 'JetBrains Mono', monospace;
      color: var(--text);
    }

    /* Tab Content */
    .tab-content {
      display: none;
    }

    .tab-content.active {
      display: block;
    }

    /* All Passed State */
    .all-passed {
      text-align: center;
      padding: 60px 40px;
      background: var(--bg-1);
      border: 1px solid var(--border);
      border-radius: 16px;
    }

    .all-passed-icon {
      font-size: 72px;
      margin-bottom: 20px;
    }

    .all-passed-title {
      font-size: 28px;
      font-weight: 800;
      color: var(--green);
      margin-bottom: 8px;
    }

    .all-passed-desc {
      font-size: 15px;
      color: var(--text-3);
      max-width: 400px;
      margin: 0 auto;
    }

    /* Timestamp */
    .timestamp {
      font-size: 12px;
      color: var(--text-4);
      margin-top: 24px;
      text-align: center;
    }

    /* Empty State */
    .empty-state {
      text-align: center;
      padding: 60px 40px;
    }

    .empty-icon {
      font-size: 48px;
      margin-bottom: 16px;
      opacity: 0.5;
    }

    .empty-title {
      font-size: 18px;
      font-weight: 600;
      color: var(--text-2);
      margin-bottom: 8px;
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

    /* Quick Actions */
    .quick-actions {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 12px;
      margin-top: 16px;
    }

    .quick-action {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 16px;
      background: var(--bg-2);
      border: 1px solid var(--border);
      border-radius: 10px;
      cursor: pointer;
      transition: all 0.15s;
    }

    .quick-action:hover {
      background: var(--bg-3);
      border-color: var(--border-hover);
    }

    .quick-action-icon {
      font-size: 24px;
    }

    .quick-action-text {
      flex: 1;
    }

    .quick-action-title {
      font-weight: 600;
      font-size: 13px;
    }

    .quick-action-desc {
      font-size: 11px;
      color: var(--text-3);
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="header-left">
        <div class="logo">
          <span class="logo-icon">D</span>
          <span class="logo-text">Doctor</span>
        </div>
        <div class="project-name">${this._escapeHtml(projectName)}</div>
      </div>
      <div class="header-actions">
        <button class="btn btn-secondary" id="btnSettings">Settings</button>
        <button class="btn btn-primary" id="btnRerun">Re-run</button>
      </div>
    </div>

    <div class="health-section">
      <div class="health-card">
        <div class="health-score">${healthScore}%</div>
        <div class="health-label">${healthStatus}</div>
        <div class="health-subtitle">${totalChecks} checks completed</div>
      </div>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-dot" style="background: var(--green)"></div>
          <div class="stat-value passed">${passedChecks.length}</div>
          <div class="stat-label">Passed</div>
        </div>
        <div class="stat-card">
          <div class="stat-dot" style="background: var(--yellow)"></div>
          <div class="stat-value warnings">${warningChecks.length}</div>
          <div class="stat-label">Warnings</div>
        </div>
        <div class="stat-card">
          <div class="stat-dot" style="background: var(--red)"></div>
          <div class="stat-value failed">${failedChecks.length}</div>
          <div class="stat-label">Failed</div>
        </div>
      </div>
    </div>

    <div class="env-bar">
      <div class="env-item">Platform: <code>${environment.platform || process.platform}</code></div>
      <div class="env-item">Node: <code>${environment.nodeVersion || process.version}</code></div>
      <div class="env-item">Duration: <code>${duration}ms</code></div>
      ${environment.cwd ? `<div class="env-item">CWD: <code>${this._escapeHtml(environment.cwd)}</code></div>` : ''}
    </div>

    <div class="tabs">
      <button class="tab active" data-tab="all">All Checks <span class="tab-count">${totalChecks}</span></button>
      <button class="tab" data-tab="issues">Issues <span class="tab-count">${failedChecks.length + warningChecks.length}</span></button>
      <button class="tab" data-tab="passed">Passed <span class="tab-count">${passedChecks.length}</span></button>
    </div>

    <div class="tab-content active" id="tab-all">
      ${healthy && totalChecks > 0 ? `
        <div class="all-passed">
          <div class="all-passed-icon check-icon"></div>
          <div class="all-passed-title">All Systems Healthy</div>
          <div class="all-passed-desc">Your development environment is properly configured.</div>
        </div>
      ` : totalChecks === 0 ? `
        <div class="empty-state">
          <div class="empty-icon"></div>
          <div class="empty-title">No checks were run</div>
        </div>
      ` : Array.from(categories.entries()).map(([cat, catChecks]) =>
      generateCategorySection(cat, catChecks)
    ).join('')}
    </div>

    <div class="tab-content" id="tab-issues">
      ${failedChecks.length === 0 && warningChecks.length === 0 ? `
        <div class="all-passed">
          <div class="all-passed-icon check-icon"></div>
          <div class="all-passed-title">No Issues</div>
          <div class="all-passed-desc">All checks passed without any issues or warnings.</div>
        </div>
      ` : `
        ${failedChecks.length > 0 ? `
          <div class="category-section">
            <div class="category-header">
              <span class="category-dot" style="background: var(--red)"></span>
              <span class="category-name">Failed Checks</span>
              <span class="category-count">${failedChecks.length}</span>
            </div>
            <div class="category-checks">
              ${failedChecks.map(check => generateCheckCard(check)).join('')}
            </div>
          </div>
        ` : ''}
        ${warningChecks.length > 0 ? `
          <div class="category-section">
            <div class="category-header">
              <span class="category-dot" style="background: var(--yellow)"></span>
              <span class="category-name">Warnings</span>
              <span class="category-count">${warningChecks.length}</span>
            </div>
            <div class="category-checks">
              ${warningChecks.map(check => generateCheckCard(check)).join('')}
            </div>
          </div>
        ` : ''}
      `}
    </div>

    <div class="tab-content" id="tab-passed">
      ${passedChecks.length === 0 ? `
        <div class="empty-state">
          <div class="empty-icon"></div>
          <div class="empty-title">No Passed Checks</div>
        </div>
      ` : `
        <div class="category-section">
          <div class="category-header">
            <span class="category-dot" style="background: var(--green)"></span>
            <span class="category-name">Passed Checks</span>
            <span class="category-count">${passedChecks.length}</span>
          </div>
          <div class="category-checks">
            ${passedChecks.map(check => generateCheckCard(check)).join('')}
          </div>
        </div>
      `}
    </div>

    ${!healthy ? `
      <div class="quick-actions">
        <div class="quick-action" id="actionInstallCli">
          <div class="quick-action-text">
            <div class="quick-action-title">Install/Update CLI</div>
            <div class="quick-action-desc">npm install -g @vibecheckai/cli</div>
          </div>
        </div>
        <div class="quick-action" id="actionOpenTerminal">
          <div class="quick-action-text">
            <div class="quick-action-title">Open Terminal</div>
            <div class="quick-action-desc">Run commands manually</div>
          </div>
        </div>
        <div class="quick-action" id="actionSettings">
          <div class="quick-action-text">
            <div class="quick-action-title">Open Settings</div>
            <div class="quick-action-desc">Configure VibeCheck</div>
          </div>
        </div>
      </div>
    ` : ''}

    <div class="timestamp">
      Diagnostic run completed on ${new Date(timestamp).toLocaleString()}
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

    // Button handlers
    document.getElementById('btnRerun')?.addEventListener('click', () => {
      vscode.postMessage({ command: 'rerun' });
    });

    document.getElementById('btnSettings')?.addEventListener('click', () => {
      vscode.postMessage({ command: 'openSettings' });
    });

    // Quick actions
    document.getElementById('actionInstallCli')?.addEventListener('click', () => {
      vscode.postMessage({ command: 'installCli' });
    });

    document.getElementById('actionOpenTerminal')?.addEventListener('click', () => {
      vscode.postMessage({ command: 'openTerminal' });
    });

    document.getElementById('actionSettings')?.addEventListener('click', () => {
      vscode.postMessage({ command: 'openSettings' });
    });
  </script>
</body>
</html>`;
  }

  private _inferCategory(name: string): string {
    const lower = name.toLowerCase();
    if (lower.includes('node') || lower.includes('npm') || lower.includes('version') || lower.includes('platform')) {
      return 'Environment';
    }
    if (lower.includes('dependency') || lower.includes('package') || lower.includes('module')) {
      return 'Dependencies';
    }
    if (lower.includes('config') || lower.includes('setting') || lower.includes('env')) {
      return 'Configuration';
    }
    if (lower.includes('security') || lower.includes('auth') || lower.includes('token')) {
      return 'Security';
    }
    if (lower.includes('git') || lower.includes('repo')) {
      return 'Git';
    }
    if (lower.includes('cli') || lower.includes('command')) {
      return 'CLI';
    }
    return 'Other';
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
    DoctorReportPanel.currentPanel = undefined;
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
