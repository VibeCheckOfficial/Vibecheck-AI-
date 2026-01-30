// extension/src/extension.ts

import * as vscode from 'vscode';
import { MockDetectorDiagnostics } from './providers/mock-detector/diagnostics';
import { MockDetectorCodeActionsProvider } from './providers/mock-detector/code-actions';

let diagnosticsProvider: MockDetectorDiagnostics;

export function activate(context: vscode.ExtensionContext) {
  console.log('VibeCheck Mock Detector activated');

  // Initialize diagnostics provider
  diagnosticsProvider = new MockDetectorDiagnostics();
  context.subscriptions.push(diagnosticsProvider);

  // Register code actions provider
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      [
        { language: 'typescript' },
        { language: 'typescriptreact' },
        { language: 'javascript' },
        { language: 'javascriptreact' },
      ],
      new MockDetectorCodeActionsProvider(),
      {
        providedCodeActionKinds: MockDetectorCodeActionsProvider.providedCodeActionKinds,
      }
    )
  );

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('vibecheck.scanMocks', async () => {
      await scanWorkspace();
    }),

    vscode.commands.registerCommand('vibecheck.scanCurrentFile', async () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        await diagnosticsProvider.scanDocument(editor.document, true);
        vscode.window.showInformationMessage('VibeCheck scan complete');
      }
    }),

    vscode.commands.registerCommand('vibecheck.showReport', () => {
      showReport();
    })
  );
}

async function scanWorkspace() {
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'VibeCheck: Scanning workspace...',
      cancellable: true,
    },
    async (progress) => {
      const result = await diagnosticsProvider.scanWorkspace();
      
      const { critical, high } = result.summary.bySeverity;
      
      if (critical > 0 || high > 0) {
        vscode.window.showWarningMessage(
          `VibeCheck found ${critical} critical and ${high} high severity issues`
        );
      } else {
        vscode.window.showInformationMessage(
          `VibeCheck: ${result.summary.total} findings (no critical/high issues)`
        );
      }
    }
  );
}

function showReport() {
  const findings = diagnosticsProvider.getAllFindings();
  
  const panel = vscode.window.createWebviewPanel(
    'vibecheck.report',
    'VibeCheck Report',
    vscode.ViewColumn.Beside,
    { enableScripts: true }
  );

  const critical = findings.filter(f => f.severity === 'critical').length;
  const high = findings.filter(f => f.severity === 'high').length;
  const medium = findings.filter(f => f.severity === 'medium').length;
  const low = findings.filter(f => f.severity === 'low').length;

  panel.webview.html = `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: system-ui; padding: 20px; background: #1e1e1e; color: #fff; }
    .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
    .stat { padding: 16px; border-radius: 8px; text-align: center; }
    .stat.critical { background: rgba(255,0,0,0.2); border: 1px solid #f00; }
    .stat.high { background: rgba(255,165,0,0.2); border: 1px solid #ffa500; }
    .stat.medium { background: rgba(255,255,0,0.2); border: 1px solid #ff0; }
    .stat.low { background: rgba(0,255,0,0.2); border: 1px solid #0f0; }
    .stat-num { font-size: 32px; font-weight: bold; }
    .finding { padding: 12px; margin: 8px 0; background: #2d2d2d; border-radius: 6px; }
  </style>
</head>
<body>
  <h1>🔍 VibeCheck Report</h1>
  <div class="stats">
    <div class="stat critical"><div class="stat-num">${critical}</div>Critical</div>
    <div class="stat high"><div class="stat-num">${high}</div>High</div>
    <div class="stat medium"><div class="stat-num">${medium}</div>Medium</div>
    <div class="stat low"><div class="stat-num">${low}</div>Low</div>
  </div>
  <h2>Findings</h2>
  ${findings.slice(0, 50).map(f => `
    <div class="finding">
      <strong>${f.severity.toUpperCase()}</strong>: ${f.description}<br>
      <code>${f.file}:${f.line}</code>
    </div>
  `).join('')}
</body>
</html>`;
}

export function deactivate() {
  if (diagnosticsProvider) {
    diagnosticsProvider.dispose();
  }
}
