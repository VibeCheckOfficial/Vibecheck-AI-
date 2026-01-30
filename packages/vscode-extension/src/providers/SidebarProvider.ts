import * as vscode from 'vscode';
import { FirewallService, FirewallMode } from '../services/FirewallService';

interface Stats {
  errors: number;
  warnings: number;
  passed: number;
  files: number;
}

export class SidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'vibecheck.sidebar';

  private _view?: vscode.WebviewView;
  private _stats: Stats = { errors: 0, warnings: 0, passed: 0, files: 0 };
  private _scanning: boolean = false;
  private _firewallMode: FirewallMode = 'off';
  private _firewallService?: FirewallService;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    firewallService?: FirewallService
  ) {
    console.log('[VibeCheck] SidebarProvider constructor called');
    try {
      // Listen for firewall status changes
      if (firewallService) {
        this._firewallService = firewallService;
        firewallService.onStatusChange((status) => {
          this._firewallMode = status.mode;
          this._updateWebview();
        });
      }
      console.log('[VibeCheck] SidebarProvider constructor completed');
    } catch (error) {
      console.error('[VibeCheck] SidebarProvider constructor error:', error);
    }
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void | Thenable<void> {
    console.log('[VibeCheck] SidebarProvider.resolveWebviewView called');
    
    try {
      this._view = webviewView;

      webviewView.webview.options = {
        enableScripts: true,
        localResourceRoots: [this._extensionUri],
      };

      // Ensure the view content is retained when hidden
      webviewView.onDidChangeVisibility(() => {
        console.log('[VibeCheck] Sidebar visibility changed:', webviewView.visible);
      });

      webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
      console.log('[VibeCheck] Sidebar HTML set successfully');
    } catch (error) {
      console.error('[VibeCheck] Error in resolveWebviewView:', error);
      // Fallback to simple HTML
      webviewView.webview.html = `<!DOCTYPE html><html><body><h1>VibeCheck</h1><p>Error loading sidebar</p></body></html>`;
    }

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.command) {
        case 'scan':
          await vscode.commands.executeCommand('vibecheck.scan');
          break;
        case 'scanWorkspace':
          await vscode.commands.executeCommand('vibecheck.scanWorkspace');
          break;
        case 'openDashboard':
          await vscode.commands.executeCommand('vibecheck.openDashboard');
          break;
        case 'promptBuilder':
          await vscode.commands.executeCommand('vibecheck.promptBuilder');
          break;
        case 'securityHeatmap':
          await vscode.commands.executeCommand('vibecheck.showSecurityHeatmap');
          break;
        case 'healthCheck':
          await vscode.commands.executeCommand('vibecheck.doctor');
          break;
        case 'auditReport':
          await vscode.commands.executeCommand('vibecheck.audit');
          break;
        case 'quickActions':
          await vscode.commands.executeCommand('vibecheck.quickActions');
          break;
        case 'setIntent':
          await vscode.commands.executeCommand('vibecheck.setIntent');
          break;
        case 'shieldCheck':
          await vscode.commands.executeCommand('vibecheck.shieldCheck');
          break;
        case 'setFirewallMode':
          if (this._firewallService) {
            await this._firewallService.setMode(data.mode);
          } else {
            // Fallback to command
            switch (data.mode) {
              case 'observe':
                await vscode.commands.executeCommand('vibecheck.shieldObserve');
                break;
              case 'enforce':
                await vscode.commands.executeCommand('vibecheck.shieldEnforce');
                break;
              case 'off':
                await vscode.commands.executeCommand('vibecheck.shieldOff');
                break;
            }
          }
          break;
        case 'getStats':
          this._sendStats();
          break;
        case 'realityMode':
          await vscode.commands.executeCommand('vibecheck.realityMode');
          break;
        case 'forge':
          await vscode.commands.executeCommand('vibecheck.forge');
          break;
        case 'ship':
          await vscode.commands.executeCommand('vibecheck.ship');
          break;
      }
    });
  }

  public setScanning(scanning: boolean) {
    this._scanning = scanning;
    this._updateWebview();
  }

  public updateStats(stats: Stats) {
    this._stats = stats;
    this._updateWebview();
  }

  private _sendStats() {
    if (this._view) {
      this._view.webview.postMessage({
        command: 'updateStats',
        data: this._stats,
      });
    }
  }

  private _updateWebview() {
    if (this._view) {
      this._view.webview.postMessage({
        command: this._scanning ? 'scanStarted' : 'scanComplete',
        data: this._stats,
        firewallMode: this._firewallMode,
      });
    }
  }

  public postScanComplete(stats: Stats, scanTime: number) {
    this._stats = stats;
    this._scanning = false;
    if (this._view) {
      this._view.webview.postMessage({
        command: 'scanComplete',
        data: { ...stats, scanTime },
        firewallMode: this._firewallMode,
      });
    }
  }

  private _getHtmlForWebview(_webview: vscode.Webview): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VibeCheck</title>
  <style>
    ${this._getStyles()}
  </style>
</head>
<body>
  <div class="app">
    <!-- Header -->
    <div class="header">
      <div class="logo">
        <div class="logo-text">VibeCheck</div>
      </div>
      <div class="live-badge">
        <div class="live-dot"></div>
        LIVE
      </div>
    </div>

    <!-- Score Card -->
    <div class="score-card">
      <div class="score-value" id="scoreValue">100</div>
      <div class="score-label">Security Score</div>
      
      <div class="progress-bar">
        <div class="progress-fill" id="progressFill" style="width: 100%"></div>
      </div>

      <div class="status-badge secure" id="statusBadge">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
          <polyline points="22 4 12 14.01 9 11.01"></polyline>
        </svg>
        <span id="statusText">Secure</span>
      </div>

      <div class="mini-stats">
        <div class="mini-stat">
          <div class="mini-stat-value" id="filesScanned">0</div>
          <div class="mini-stat-label">Files</div>
        </div>
        <div class="mini-stat">
          <div class="mini-stat-value" id="scanTime">0s</div>
          <div class="mini-stat-label">Time</div>
        </div>
        <div class="mini-stat">
          <div class="mini-stat-value">99%</div>
          <div class="mini-stat-label">Accuracy</div>
        </div>
      </div>
    </div>

    <!-- Shield Mode Switcher -->
    <div class="shield-section">
      <div class="shield-header">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
        </svg>
        <span>Agent Firewall</span>
      </div>
      <div class="shield-modes">
        <button class="shield-mode-btn" id="modeOff" data-mode="off" title="Disabled">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
          </svg>
          <span>Off</span>
        </button>
        <button class="shield-mode-btn active" id="modeObserve" data-mode="observe" title="Monitor without blocking">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
          <span>Observe</span>
        </button>
        <button class="shield-mode-btn" id="modeEnforce" data-mode="enforce" title="Block violations">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
          <span>Enforce</span>
        </button>
      </div>
    </div>

    <!-- Stats Grid -->
    <div class="stats-grid">
      <div class="stat-card error">
        <div class="stat-label">Critical</div>
        <div class="stat-value" id="errorCount">0</div>
        <div class="stat-icon">⚠</div>
      </div>
      <div class="stat-card warning">
        <div class="stat-label">High</div>
        <div class="stat-value" id="highCount">0</div>
        <div class="stat-icon">!</div>
      </div>
      <div class="stat-card info">
        <div class="stat-label">Medium</div>
        <div class="stat-value" id="warningCount">0</div>
        <div class="stat-icon">◆</div>
      </div>
      <div class="stat-card success">
        <div class="stat-label">Low</div>
        <div class="stat-value" id="lowCount">0</div>
        <div class="stat-icon">○</div>
      </div>
    </div>

    <!-- Actions -->
    <div class="actions">
      <div class="btn-grid">
        <button class="btn btn-secondary" id="btnPromptBuilder">
          <span class="btn-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
            </svg>
          </span>
          Prompt Builder
        </button>
        <button class="btn btn-secondary" id="btnHeatmap">
          <span class="btn-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
            </svg>
          </span>
          Heatmap
        </button>
        <button class="btn btn-secondary" id="btnHealthCheck">
          <span class="btn-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20.42 4.58a5.4 5.4 0 0 0-7.65 0l-.77.78-.77-.78a5.4 5.4 0 0 0-7.65 7.65l.77.78L12 19.66l7.65-7.65.77-.78a5.4 5.4 0 0 0 0-7.65z"></path>
            </svg>
          </span>
          Health Check
        </button>
        <button class="btn btn-secondary" id="btnAuditReport">
          <span class="btn-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
          </span>
          Audit Report
        </button>
      </div>

      <button class="btn btn-dashboard" id="btnDashboard">
        <span class="dashboard-text">Open Dashboard</span>
      </button>
    </div>

    <!-- Issues Section -->
    <div class="issues-section">
      <div class="issues-header">
        <div class="issues-title">Issues</div>
        <div class="issues-count" id="issuesCount">0 Found</div>
      </div>
      
      <div class="issues-body" id="issuesBody">
        <div class="empty-state">
          <div class="empty-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
          </div>
          <div class="empty-title">All Systems Secure</div>
          <div class="empty-subtitle">No issues detected in your code</div>
        </div>
      </div>
    </div>

    <!-- AI Tip -->
    <div class="ai-tip">
      <div class="ai-tip-icon">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
        </svg>
      </div>
      <div class="ai-tip-content">
        <div class="ai-tip-title">AI Insight</div>
        <div class="ai-tip-text">
          Set an Intent before coding to enable Agent Firewall protection against context drift.
        </div>
      </div>
    </div>

    <!-- Quick Actions Footer -->
    <div class="footer-actions">
      <button class="footer-btn" id="btnSetIntent" title="Set Intent">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
        </svg>
        Set Intent
      </button>
      <button class="footer-btn" id="btnQuickActions" title="Quick Actions">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
        </svg>
        Quick Actions
      </button>
    </div>

    <!-- Scanning Overlay -->
    <div class="scanning-overlay" id="scanningOverlay">
      <div class="scanner-ring"></div>
      <div class="scanning-text">Analyzing code...</div>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    // Stats
    let stats = { errors: 0, warnings: 0, passed: 0, files: 0 };
    let scanTime = 0;
    let score = 100;

    // Elements
    const scoreValue = document.getElementById('scoreValue');
    const progressFill = document.getElementById('progressFill');
    const statusBadge = document.getElementById('statusBadge');
    const statusText = document.getElementById('statusText');
    const filesScanned = document.getElementById('filesScanned');
    const scanTimeEl = document.getElementById('scanTime');
    const errorCount = document.getElementById('errorCount');
    const warningCount = document.getElementById('warningCount');
    const issuesCount = document.getElementById('issuesCount');
    const issuesBody = document.getElementById('issuesBody');
    const scanningOverlay = document.getElementById('scanningOverlay');

    // Shield mode buttons
    const modeOff = document.getElementById('modeOff');
    const modeObserve = document.getElementById('modeObserve');
    const modeEnforce = document.getElementById('modeEnforce');

    // Button handlers
    document.getElementById('btnPromptBuilder').addEventListener('click', () => {
      vscode.postMessage({ command: 'promptBuilder' });
    });

    document.getElementById('btnHeatmap').addEventListener('click', () => {
      vscode.postMessage({ command: 'securityHeatmap' });
    });

    document.getElementById('btnHealthCheck').addEventListener('click', () => {
      vscode.postMessage({ command: 'healthCheck' });
    });

    document.getElementById('btnAuditReport').addEventListener('click', () => {
      vscode.postMessage({ command: 'auditReport' });
    });

    document.getElementById('btnDashboard').addEventListener('click', () => {
      vscode.postMessage({ command: 'openDashboard' });
    });

    document.getElementById('btnSetIntent').addEventListener('click', () => {
      vscode.postMessage({ command: 'setIntent' });
    });

    document.getElementById('btnQuickActions').addEventListener('click', () => {
      vscode.postMessage({ command: 'quickActions' });
    });

    // Shield mode handlers
    function setShieldMode(mode) {
      modeOff.classList.remove('active');
      modeObserve.classList.remove('active');
      modeEnforce.classList.remove('active');
      
      if (mode === 'off') modeOff.classList.add('active');
      else if (mode === 'observe') modeObserve.classList.add('active');
      else if (mode === 'enforce') modeEnforce.classList.add('active');
      
      vscode.postMessage({ command: 'setFirewallMode', mode: mode });
    }

    modeOff.addEventListener('click', () => setShieldMode('off'));
    modeObserve.addEventListener('click', () => setShieldMode('observe'));
    modeEnforce.addEventListener('click', () => setShieldMode('enforce'));

    // Calculate score
    function calculateScore(data) {
      const total = data.errors + data.warnings + data.passed;
      if (total === 0) return 100;
      
      const errorWeight = 10;
      const warningWeight = 3;
      const maxDeduction = data.errors * errorWeight + data.warnings * warningWeight;
      return Math.max(0, Math.min(100, 100 - maxDeduction));
    }

    // Update UI
    function updateUI() {
      scoreValue.textContent = score;
      progressFill.style.width = score + '%';
      filesScanned.textContent = stats.files;
      scanTimeEl.textContent = scanTime + 's';
      errorCount.textContent = stats.errors;
      warningCount.textContent = stats.warnings;
      
      const total = stats.errors + stats.warnings;
      issuesCount.textContent = total + ' Found';

      // Update score appearance
      scoreValue.className = 'score-value';
      if (score < 50) {
        scoreValue.classList.add('critical');
        statusBadge.className = 'status-badge critical';
        statusText.textContent = 'Critical';
      } else if (score < 70) {
        scoreValue.classList.add('warning');
        statusBadge.className = 'status-badge at-risk';
        statusText.textContent = 'At Risk';
      } else if (score < 90) {
        statusBadge.className = 'status-badge good';
        statusText.textContent = 'Good';
      } else {
        statusBadge.className = 'status-badge secure';
        statusText.textContent = 'Secure';
      }

      // Update issues body
      if (total === 0) {
        issuesBody.innerHTML = \`
          <div class="empty-state">
            <div class="empty-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
            </div>
            <div class="empty-title">All Systems Secure</div>
            <div class="empty-subtitle">No issues detected in your code</div>
          </div>
        \`;
      } else {
        issuesBody.innerHTML = \`
          <div class="issues-summary">
            <div class="issue-row error">
              <span class="issue-icon">⚠</span>
              <span class="issue-label">\${stats.errors} Critical issues</span>
            </div>
            <div class="issue-row warning">
              <span class="issue-icon">!</span>
              <span class="issue-label">\${stats.warnings} Warnings</span>
            </div>
          </div>
        \`;
      }
    }

    // Listen for messages
    window.addEventListener('message', event => {
      const message = event.data;
      
      switch (message.command) {
        case 'updateStats':
        case 'updateResults':
          stats = message.data;
          score = calculateScore(stats);
          updateUI();
          break;
        case 'scanStarted':
          scanningOverlay.classList.add('active');
          break;
        case 'scanComplete':
          scanningOverlay.classList.remove('active');
          if (message.data) {
            stats = message.data;
            scanTime = message.data.scanTime || 2;
            score = calculateScore(stats);
            updateUI();
          }
          break;
        case 'updateFirewallMode':
          if (message.mode === 'off') {
            modeOff.classList.add('active');
            modeObserve.classList.remove('active');
            modeEnforce.classList.remove('active');
          } else if (message.mode === 'observe') {
            modeOff.classList.remove('active');
            modeObserve.classList.add('active');
            modeEnforce.classList.remove('active');
          } else if (message.mode === 'enforce') {
            modeOff.classList.remove('active');
            modeObserve.classList.remove('active');
            modeEnforce.classList.add('active');
          }
          break;
      }
    });

    // Request initial stats
    vscode.postMessage({ command: 'getStats' });
  </script>
</body>
</html>`;
  }

  private _getStyles(): string {
    return `
:root {
  --vsc-bg: var(--vscode-sideBar-background, #030303);
  --vsc-fg: var(--vscode-foreground, #fff);
  --vsc-muted: var(--vscode-descriptionForeground, rgba(255,255,255,0.55));
  --vsc-border: var(--vscode-widget-border, rgba(255,255,255,0.05));
  --vsc-focus: var(--vscode-focusBorder, rgba(0, 212, 255, 0.85));
  --vsc-link: var(--vscode-textLink-foreground, #00d4ff);
  --accent-primary: #00d4ff;
  --accent-green: #00ff88;
  --accent-red: #ff5c5c;
  --accent-yellow: #ffcc00;
  --accent-blue: #5c9cff;
  --bg-glass: rgba(255,255,255,0.015);
  --border-subtle: rgba(255,255,255,0.04);
  --border-accent: rgba(255,255,255,0.08);
  --text-primary: var(--vsc-fg);
  --text-secondary: var(--vsc-muted);
  --gradient-premium: linear-gradient(135deg, #00d4ff 0%, #00a8cc 100%);
  --shadow-1: 0 10px 30px rgba(0,0,0,0.35);
  --radius-lg: 14px;
  --radius-md: 12px;
}

* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: var(--vsc-bg);
  color: var(--text-primary);
  padding: 12px;
  min-height: 100vh;
  overflow-x: hidden;
}

body::before {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(800px 500px at 30% 0%, rgba(0,212,255,0.05), transparent 60%),
    radial-gradient(600px 400px at 80% 30%, rgba(0,168,204,0.04), transparent 60%);
  opacity: 0.9;
}

.app {
  position: relative;
  border-radius: var(--radius-lg);
  border: 1px solid rgba(255,255,255,0.10);
  background: linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.015));
  box-shadow: var(--shadow-1);
  padding: 12px;
  overflow: hidden;
}

.header {
  text-align: center;
  margin-bottom: 10px;
  position: relative;
  z-index: 1;
}

.logo {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin-bottom: 4px;
}

.logo-text {
  font-size: 20px;
  font-weight: 900;
  letter-spacing: -0.4px;
  background: linear-gradient(135deg, #fff 0%, rgba(255,255,255,0.75) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.live-badge {
  position: absolute;
  right: 0;
  top: 4px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  background: rgba(0,255,136,0.1);
  border: 1px solid rgba(0,255,136,0.3);
  border-radius: 999px;
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: var(--accent-green);
}

.live-dot {
  width: 5px;
  height: 5px;
  background: var(--accent-green);
  border-radius: 50%;
  box-shadow: 0 0 10px rgba(0,255,136,0.55);
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.55; transform: scale(0.92); }
}

.score-card {
  border-radius: var(--radius-md);
  border: 1px solid var(--border-subtle);
  background: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02));
  padding: 16px 12px;
  margin-bottom: 10px;
  text-align: center;
  position: relative;
  z-index: 1;
}

.score-value {
  font-size: 56px;
  font-weight: 900;
  letter-spacing: -2px;
  line-height: 1;
  background: linear-gradient(135deg, #22d3ee, #3b82f6);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.score-value.warning {
  background: linear-gradient(135deg, #fbbf24, #f97316);
  -webkit-background-clip: text;
  background-clip: text;
}

.score-value.critical {
  background: linear-gradient(135deg, #ef4444, #dc2626);
  -webkit-background-clip: text;
  background-clip: text;
}

.score-label {
  font-size: 11px;
  color: var(--text-secondary);
  margin-top: 2px;
}

.progress-bar {
  height: 5px;
  background: rgba(255,255,255,0.05);
  border-radius: 999px;
  margin: 12px 0;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: 999px;
  transition: width 0.5s ease;
  background: linear-gradient(90deg, #22d3ee, #3b82f6);
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.6px;
}

.status-badge.secure {
  background: rgba(0,255,136,0.1);
  color: var(--accent-green);
  border: 1px solid rgba(0,255,136,0.3);
}

.status-badge.good {
  background: rgba(59,130,246,0.1);
  color: var(--accent-blue);
  border: 1px solid rgba(59,130,246,0.3);
}

.status-badge.at-risk {
  background: rgba(255,204,0,0.1);
  color: var(--accent-yellow);
  border: 1px solid rgba(255,204,0,0.3);
}

.status-badge.critical {
  background: rgba(255,92,92,0.1);
  color: var(--accent-red);
  border: 1px solid rgba(255,92,92,0.3);
}

.mini-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border-subtle);
}

.mini-stat { text-align: center; }

.mini-stat-value {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
}

.mini-stat-label {
  font-size: 8px;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-top: 1px;
}

/* Shield Section */
.shield-section {
  border-radius: var(--radius-md);
  border: 1px solid rgba(0,212,255,0.2);
  background: linear-gradient(180deg, rgba(0,212,255,0.06), rgba(0,168,204,0.03));
  padding: 10px;
  margin-bottom: 10px;
  position: relative;
  z-index: 1;
}

.shield-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: var(--accent-primary);
  margin-bottom: 8px;
}

.shield-modes {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}

.shield-mode-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 4px;
  background: rgba(255,255,255,0.03);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  color: rgba(255,255,255,0.5);
  cursor: pointer;
  transition: all 0.15s ease;
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}

.shield-mode-btn:hover {
  background: rgba(255,255,255,0.06);
  border-color: var(--border-accent);
  color: rgba(255,255,255,0.8);
}

.shield-mode-btn.active {
  background: rgba(0,212,255,0.15);
  border-color: rgba(0,212,255,0.4);
  color: var(--accent-primary);
}

.shield-mode-btn.active[data-mode="enforce"] {
  background: rgba(168,85,247,0.15);
  border-color: rgba(168,85,247,0.4);
  color: #a855f7;
}

.shield-mode-btn.active[data-mode="off"] {
  background: rgba(255,255,255,0.08);
  border-color: rgba(255,255,255,0.2);
  color: rgba(255,255,255,0.7);
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  margin-bottom: 10px;
  position: relative;
  z-index: 1;
}

.stat-card {
  border-radius: var(--radius-md);
  padding: 10px;
  border: 1px solid var(--border-subtle);
  background: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02));
  display: grid;
  grid-template-columns: 1fr auto;
  grid-template-rows: auto auto;
  column-gap: 8px;
  row-gap: 1px;
  align-items: center;
  min-height: 54px;
}

.stat-icon {
  grid-column: 2;
  grid-row: 1 / span 2;
  font-size: 16px;
  opacity: 0.9;
}

.stat-value {
  font-size: 24px;
  font-weight: 900;
  letter-spacing: -0.8px;
  line-height: 1.05;
}

.stat-label {
  font-size: 10px;
  color: rgba(255,255,255,0.55);
  text-transform: uppercase;
  letter-spacing: 0.8px;
}

.stat-card.error { 
  border-color: rgba(255,92,92,0.28); 
  background: linear-gradient(180deg, rgba(255,92,92,0.08), rgba(255,255,255,0.02)); 
}
.stat-card.warning { 
  border-color: rgba(255,204,0,0.26); 
  background: linear-gradient(180deg, rgba(255,204,0,0.08), rgba(255,255,255,0.02)); 
}
.stat-card.success { 
  border-color: rgba(0,255,136,0.24); 
  background: linear-gradient(180deg, rgba(0,255,136,0.07), rgba(255,255,255,0.02)); 
}
.stat-card.info { 
  border-color: rgba(92,156,255,0.26); 
  background: linear-gradient(180deg, rgba(92,156,255,0.08), rgba(255,255,255,0.02)); 
}

.stat-card.error .stat-value { color: var(--accent-red); }
.stat-card.warning .stat-value { color: var(--accent-yellow); }
.stat-card.success .stat-value { color: var(--accent-green); }
.stat-card.info .stat-value { color: var(--accent-blue); }

.actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 10px;
  position: relative;
  z-index: 1;
}

.btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 9px 10px;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.14s ease;
  position: relative;
  overflow: hidden;
  user-select: none;
}

.btn:active { transform: translateY(1px) scale(0.99); }

.btn-secondary {
  background: rgba(255,255,255,0.035);
  border-color: var(--border-subtle);
  color: var(--text-primary);
}

.btn-secondary:hover {
  background: rgba(255,255,255,0.06);
  border-color: var(--border-accent);
}

.btn-dashboard {
  background: rgba(255,255,255,0.035);
  border-color: var(--border-subtle);
  color: var(--text-primary);
  font-size: 12px;
  padding: 10px 14px;
}

.btn-dashboard:hover {
  background: rgba(255,255,255,0.06);
  border-color: var(--border-accent);
}

.btn-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.btn-icon {
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-icon svg {
  width: 16px;
  height: 16px;
}

.dashboard-text {
  font-size: 13px;
  font-weight: 700;
}

.issues-section {
  border-radius: var(--radius-md);
  border: 1px solid var(--border-subtle);
  background: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02));
  overflow: hidden;
  margin-bottom: 10px;
  position: relative;
  z-index: 1;
}

.issues-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-subtle);
}

.issues-title, .issues-count {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--text-secondary);
}

.issues-body { padding: 12px; }

.empty-state {
  text-align: center;
  padding: 24px 12px;
}

.empty-icon {
  width: 48px;
  height: 48px;
  margin: 0 auto 12px;
  background: linear-gradient(135deg, var(--accent-green), #22d3ee);
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8px 32px rgba(0,255,136,0.3);
}

.empty-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 3px;
}

.empty-subtitle {
  font-size: 11px;
  color: var(--text-secondary);
}

.issues-summary { display: flex; flex-direction: column; gap: 8px; }

.issue-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 600;
}

.issue-row.error {
  background: rgba(255,92,92,0.1);
  color: var(--accent-red);
}

.issue-row.warning {
  background: rgba(255,204,0,0.1);
  color: var(--accent-yellow);
}

.ai-tip {
  border-radius: var(--radius-md);
  border: 1px solid rgba(59,130,246,0.25);
  background: rgba(59,130,246,0.06);
  padding: 10px;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 10px;
  position: relative;
  z-index: 1;
}

.ai-tip-icon {
  width: 22px;
  height: 22px;
  background: rgba(59,130,246,0.15);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.ai-tip-icon svg { stroke: var(--accent-blue); }

.ai-tip-title {
  font-size: 10px;
  font-weight: 700;
  color: var(--accent-blue);
  margin-bottom: 2px;
  text-transform: uppercase;
  letter-spacing: 0.6px;
}

.ai-tip-text {
  font-size: 10px;
  color: rgba(255,255,255,0.7);
  line-height: 1.4;
}

.footer-actions {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  position: relative;
  z-index: 1;
}

.footer-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 8px;
  background: var(--gradient-premium);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: var(--radius-md);
  color: rgba(0,0,0,0.85);
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.14s ease;
  box-shadow: 0 6px 16px rgba(0,212,255,0.2);
}

.footer-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 8px 20px rgba(0,212,255,0.3);
}

.footer-btn svg {
  stroke: rgba(0,0,0,0.85);
}

.scanning-overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.72);
  backdrop-filter: blur(10px);
  z-index: 100;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 12px;
}

.scanning-overlay.active { display: flex; }

.scanner-ring {
  width: 52px;
  height: 52px;
  border: 3px solid rgba(255,255,255,0.10);
  border-top-color: var(--accent-primary);
  border-right-color: rgba(168,85,247,0.75);
  border-radius: 50%;
  animation: spin 0.9s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

.scanning-text {
  color: rgba(255,255,255,0.78);
  font-size: 12px;
  letter-spacing: 0.4px;
}
`;
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
