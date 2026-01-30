import * as vscode from 'vscode';
import { DashboardPanel } from './providers/DashboardPanel';
import { DiagnosticsProvider } from './providers/DiagnosticsProvider';
import { CodeActionsProvider } from './providers/CodeActionsProvider';
import { IssuesTreeProvider } from './providers/TreeDataProvider';
import { HistoryTreeProvider } from './providers/HistoryTreeProvider';
import { VibecheckHoverProvider } from './providers/HoverProvider';
import { VibecheckCodeLensProvider } from './providers/CodeLensProvider';
import { VibecheckInlayHintsProvider } from './providers/InlayHintsProvider';
import { IssueDetailPanel } from './providers/IssueDetailPanel';
import { CodeFlowProvider } from './providers/CodeFlowProvider';
import { SecurityHeatmapProvider } from './providers/SecurityHeatmapProvider';
import { ScannerService } from './services/ScannerService';
import { ConfigService } from './services/ConfigService';
import { ReportService, ReportFormat } from './services/ReportService';
import { RealityModeService } from './services/RealityModeService';
import { AiExplainerService } from './services/AiExplainerService';
import { CliService, DoctorResult, CliFinding, AuditResult, ShipResult } from './services/CliService';
import { FirewallService } from './services/FirewallService';
import { PromptBuilderService } from './services/PromptBuilderService';
import { AuthService } from './services/AuthService';
import { LockService } from './services/LockService';
import { LockDecorationProvider } from './providers/LockDecorationProvider';
// VerdictPanelProvider removed - using status bar instead
import { PromptBuilderPanel } from './providers/PromptBuilderPanel';
import { AuditReportPanel } from './providers/AuditReportPanel';
import { DoctorReportPanel } from './providers/DoctorReportPanel';
import { SidebarProvider } from './providers/SidebarProvider';
import { registerCommands } from './commands';
import { StatusBarManager } from './utils/StatusBarManager';
import { DecorationManager } from './utils/DecorationManager';
import { OutputManager } from './utils/OutputManager';
import { IntentStatusBar } from './utils/IntentStatusBar';
import { Logger } from './utils/Logger';

// ═══════════════════════════════════════════════════════════════════════════════
// Service Instances
// ═══════════════════════════════════════════════════════════════════════════════

let scannerService: ScannerService;
let diagnosticsProvider: DiagnosticsProvider;
let issuesTreeProvider: IssuesTreeProvider;
let historyTreeProvider: HistoryTreeProvider;
let statusBarManager: StatusBarManager;
let decorationManager: DecorationManager;
let outputManager: OutputManager;
let codeLensProvider: VibecheckCodeLensProvider;
let inlayHintsProvider: VibecheckInlayHintsProvider;
let reportService: ReportService;
let realityModeService: RealityModeService;
let aiExplainerService: AiExplainerService;
let codeFlowProvider: CodeFlowProvider;
let securityHeatmapProvider: SecurityHeatmapProvider;
let cliService: CliService;
let firewallService: FirewallService;
let promptBuilderService: PromptBuilderService;
let intentStatusBar: IntentStatusBar;
let authService: AuthService;
let lockService: LockService;
let lockDecorationProvider: LockDecorationProvider;
let sidebarProvider: SidebarProvider;
let watchModeDisposable: vscode.Disposable | undefined;

// ═══════════════════════════════════════════════════════════════════════════════
// Extension Activation
// ═══════════════════════════════════════════════════════════════════════════════

export async function activate(context: vscode.ExtensionContext) {
  try {
    Logger.info('VibeCheck extension activating...');

    outputManager = OutputManager.getInstance();
    outputManager.printHeader();

    // ─────────────────────────────────────────────────────────────────────────────
    // Core Services
    // ─────────────────────────────────────────────────────────────────────────────

    const configService = new ConfigService();
    scannerService = new ScannerService(configService);
    diagnosticsProvider = new DiagnosticsProvider();
    issuesTreeProvider = new IssuesTreeProvider();
    historyTreeProvider = new HistoryTreeProvider();
    statusBarManager = new StatusBarManager();
    decorationManager = new DecorationManager();

    // ─────────────────────────────────────────────────────────────────────────────
    // Advanced Services (IDE-Exclusive Features)
    // ─────────────────────────────────────────────────────────────────────────────

    reportService = new ReportService();
    realityModeService = new RealityModeService(context);
    aiExplainerService = new AiExplainerService(context);
    codeFlowProvider = new CodeFlowProvider(context);
    securityHeatmapProvider = new SecurityHeatmapProvider(context);
    cliService = new CliService(configService);
    firewallService = new FirewallService(configService);
    promptBuilderService = new PromptBuilderService(context);
    intentStatusBar = new IntentStatusBar(firewallService);
    authService = AuthService.getInstance(context);
    context.subscriptions.push(intentStatusBar);

    // Initialize auth status on startup (non-blocking)
    authService.validateAndCache().catch(() => {
      // Ignore validation errors on startup
    });

    const supportedLanguages = [
      { language: 'typescript' },
      { language: 'typescriptreact' },
      { language: 'javascript' },
      { language: 'javascriptreact' },
      { language: 'python' },
      { language: 'go' },
      { language: 'rust' },
    ];

    // ─────────────────────────────────────────────────────────────────────────────
    // Sidebar Provider (Primary View)
    // ─────────────────────────────────────────────────────────────────────────────

    try {
      Logger.info('Creating SidebarProvider...');
      console.log('[VibeCheck] Creating SidebarProvider with viewType:', SidebarProvider.viewType);
      sidebarProvider = new SidebarProvider(context.extensionUri, firewallService);
      Logger.info('SidebarProvider created, registering...');
      const disposable = vscode.window.registerWebviewViewProvider(SidebarProvider.viewType, sidebarProvider, {
        webviewOptions: {
          retainContextWhenHidden: true
        }
      });
      context.subscriptions.push(disposable);
      Logger.info('SidebarProvider registered successfully');
      console.log('[VibeCheck] SidebarProvider registered successfully');
    } catch (error) {
      Logger.error('Failed to register SidebarProvider:', error);
      console.error('[VibeCheck] Failed to register SidebarProvider:', error);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Tree Views (Issues & History)
    // ─────────────────────────────────────────────────────────────────────────────

    context.subscriptions.push(
      vscode.window.registerTreeDataProvider('vibecheck.issues', issuesTreeProvider),
      vscode.window.registerTreeDataProvider('vibecheck.history', historyTreeProvider)
    );

    // ─────────────────────────────────────────────────────────────────────────────
    // Language Providers
    // ─────────────────────────────────────────────────────────────────────────────

    const codeActionsProvider = new CodeActionsProvider(scannerService, diagnosticsProvider);
    context.subscriptions.push(
      vscode.languages.registerCodeActionsProvider(
        supportedLanguages,
        codeActionsProvider,
        { providedCodeActionKinds: CodeActionsProvider.providedCodeActionKinds }
      )
    );

    const hoverProvider = new VibecheckHoverProvider(diagnosticsProvider);
    context.subscriptions.push(vscode.languages.registerHoverProvider(supportedLanguages, hoverProvider));

    codeLensProvider = new VibecheckCodeLensProvider(diagnosticsProvider);
    context.subscriptions.push(vscode.languages.registerCodeLensProvider(supportedLanguages, codeLensProvider));

    inlayHintsProvider = new VibecheckInlayHintsProvider(diagnosticsProvider);
    context.subscriptions.push(vscode.languages.registerInlayHintsProvider(supportedLanguages, inlayHintsProvider));

    // ─────────────────────────────────────────────────────────────────────────────
    // Base Commands
    // ─────────────────────────────────────────────────────────────────────────────

    registerCommands(context, scannerService, diagnosticsProvider, issuesTreeProvider, historyTreeProvider, statusBarManager, decorationManager, cliService);

    context.subscriptions.push(
      vscode.commands.registerCommand('vibecheck.openDashboard', () => {
        DashboardPanel.createOrShow(context.extensionUri, scannerService, diagnosticsProvider, issuesTreeProvider);
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('vibecheck.showIssueDetails', async (args?: { issueId: string }) => {
        if (!args?.issueId) { return; }
        const issue = diagnosticsProvider.getIssueById(args.issueId);
        if (issue) { IssueDetailPanel.createOrShow(context.extensionUri, issue); }
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('vibecheck.showOutput', () => { outputManager.show(); })
    );

    // ─────────────────────────────────────────────────────────────────────────────
    // Report Commands
    // ─────────────────────────────────────────────────────────────────────────────

    context.subscriptions.push(
      vscode.commands.registerCommand('vibecheck.exportReport', async () => {
        const format = await vscode.window.showQuickPick([
          { label: '$(file-code) HTML Report', description: 'Interactive visual report', value: 'html' as ReportFormat },
          { label: '$(markdown) Markdown Report', description: 'GitHub-compatible format', value: 'markdown' as ReportFormat },
          { label: '$(json) JSON Report', description: 'Structured data export', value: 'json' as ReportFormat },
          { label: '$(warning) SARIF Report', description: 'GitHub/Azure DevOps integration', value: 'sarif' as ReportFormat },
          { label: '$(file-pdf) PDF Report', description: 'Printable document', value: 'pdf' as ReportFormat },
        ], { placeHolder: 'Select report format', title: 'Export VibeCheck Report' });

        if (!format) { return; }

        const allIssues = diagnosticsProvider.getAllIssues();
        if (allIssues.length === 0) {
          void vscode.window.showWarningMessage('No issues to export. Run a scan first.');
          return;
        }

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        const projectName = workspaceFolder?.name ?? 'VibeCheck Scan';

        await reportService.exportReport(allIssues, format.value, {
          projectName,
          includeRecommendations: true,
          includeCodeSnippets: true,
          includeSummary: true,
          includeCharts: format.value === 'html',
          groupBy: 'file',
        });
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('vibecheck.exportReportAs', async (format: ReportFormat) => {
        const allIssues = diagnosticsProvider.getAllIssues();
        if (allIssues.length === 0) {
          void vscode.window.showWarningMessage('No issues to export. Run a scan first.');
          return;
        }
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        const projectName = workspaceFolder?.name ?? 'VibeCheck Scan';
        await reportService.exportReport(allIssues, format, {
          projectName, includeRecommendations: true, includeCodeSnippets: true, includeSummary: true, includeCharts: format === 'html', groupBy: 'file',
        });
      })
    );

    // ─────────────────────────────────────────────────────────────────────────────
    // Reality Mode Commands
    // ─────────────────────────────────────────────────────────────────────────────

    context.subscriptions.push(
      vscode.commands.registerCommand('vibecheck.realityMode', async () => { await realityModeService.runRealityMode(); })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('vibecheck.realityModeFile', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { void vscode.window.showWarningMessage('Open a file to run Reality Mode on it.'); return; }
        await realityModeService.runRealityModeForFile(editor.document.uri.fsPath);
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('vibecheck.configureRealityMode', async () => { await realityModeService.configure(); })
    );

    // ─────────────────────────────────────────────────────────────────────────────
    // Code Flow Visualizer Commands
    // ─────────────────────────────────────────────────────────────────────────────

    context.subscriptions.push(
      vscode.commands.registerCommand('vibecheck.analyzeCodeFlow', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { void vscode.window.showWarningMessage('Open a file to analyze code flow.'); return; }
        await codeFlowProvider.analyzeFile(editor.document);
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('vibecheck.showCodeFlowPanel', () => { codeFlowProvider.showPanel(); })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('vibecheck.traceVariable', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { return; }
        const selection = editor.selection;
        const wordRange = selection.isEmpty ? editor.document.getWordRangeAtPosition(selection.start) : selection;
        if (!wordRange) { void vscode.window.showWarningMessage('Select a variable to trace.'); return; }
        const variable = editor.document.getText(wordRange);
        await codeFlowProvider.traceVariable(editor.document, variable, selection.start.line);
      })
    );

    // ─────────────────────────────────────────────────────────────────────────────
    // Security Heatmap Commands
    // ─────────────────────────────────────────────────────────────────────────────

    context.subscriptions.push(
      vscode.commands.registerCommand('vibecheck.showSecurityHeatmap', async () => { await securityHeatmapProvider.showHeatmap(); })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('vibecheck.analyzeSecurityRisk', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { void vscode.window.showWarningMessage('Open a file to analyze security risk.'); return; }
        await securityHeatmapProvider.analyzeFile(editor.document);
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('vibecheck.scanWorkspaceHeatmap', async () => { await securityHeatmapProvider.scanWorkspace(); })
    );

    // ─────────────────────────────────────────────────────────────────────────────
    // AI Explainer Commands
    // ─────────────────────────────────────────────────────────────────────────────

    context.subscriptions.push(
      vscode.commands.registerCommand('vibecheck.explainCode', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { void vscode.window.showWarningMessage('Select code to explain.'); return; }
        const selection = editor.selection;
        const code = selection.isEmpty ? editor.document.lineAt(selection.start.line).text : editor.document.getText(selection);
        if (!code.trim()) { void vscode.window.showWarningMessage('Select code to explain.'); return; }
        await aiExplainerService.explainCode(code, editor.document.languageId);
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('vibecheck.explainSecurityRisk', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { void vscode.window.showWarningMessage('Select code to analyze.'); return; }
        const selection = editor.selection;
        const code = selection.isEmpty ? editor.document.lineAt(selection.start.line).text : editor.document.getText(selection);
        if (!code.trim()) { void vscode.window.showWarningMessage('Select code to analyze.'); return; }
        await aiExplainerService.explainCode(code, editor.document.languageId, { focusArea: 'security' });
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('vibecheck.configureAi', async () => { await aiExplainerService.configure(); })
    );

    // ─────────────────────────────────────────────────────────────────────────────
    // CLI Commands (vibecheck CLI integration)
    // ─────────────────────────────────────────────────────────────────────────────

    context.subscriptions.push(
      vscode.commands.registerCommand('vibecheck.doctor', async () => {
        const startTime = Date.now();
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        const projectName = workspaceFolder?.name ?? 'Unknown Project';

        // Check if CLI is available
        const cliAvailable = await cliService.isAvailable();

        // Run in terminal if CLI available (user can see live output)
        if (cliAvailable) {
          await cliService.runDoctorInTerminal();
        }

        await vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: '💊 Running Health Check...',
          cancellable: false
        }, async (progress) => {
          progress.report({ message: 'Checking environment...' });

          let checks: Array<{
            name: string;
            status: 'pass' | 'warn' | 'fail';
            message: string;
            category?: string;
            fix?: string;
          }> = [];
          let healthy = true;

          if (cliAvailable) {
            // Use CLI for doctor checks
            const result = await cliService.doctor();
            if (result.success && result.data) {
              const doctorData = result.data as DoctorResult;
              checks = doctorData.checks || [];
              healthy = doctorData.healthy;
            }
          } else {
            // Run built-in diagnostics if CLI not available
            progress.report({ message: 'Running built-in diagnostics...' });
            checks = await runBuiltInDiagnostics();
            healthy = !checks.some(c => c.status === 'fail');
          }

          const duration = Date.now() - startTime;

          // Open the Doctor Report Panel with results
          DoctorReportPanel.createOrShow(context.extensionUri, {
            healthy,
            checks,
            timestamp: new Date().toISOString(),
            projectName,
            duration,
            environment: {
              nodeVersion: process.version,
              platform: process.platform,
              cwd: workspaceFolder?.uri.fsPath,
            },
          });
        });
      })
    );

    // Built-in diagnostics when CLI is not available
    async function runBuiltInDiagnostics(): Promise<Array<{
      name: string;
      status: 'pass' | 'warn' | 'fail';
      message: string;
      category?: string;
      fix?: string;
    }>> {
      const checks: Array<{
        name: string;
        status: 'pass' | 'warn' | 'fail';
        message: string;
        category?: string;
        fix?: string;
      }> = [];

      // Check Node.js version
      const nodeVersion = process.version;
      const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0], 10);
      checks.push({
        name: 'Node.js Version',
        status: majorVersion >= 18 ? 'pass' : majorVersion >= 16 ? 'warn' : 'fail',
        message: majorVersion >= 18
          ? `Node.js ${nodeVersion} is installed (recommended)`
          : majorVersion >= 16
            ? `Node.js ${nodeVersion} works but ${'>'}=18 recommended`
            : `Node.js ${nodeVersion} is outdated. Please upgrade to v18+`,
        category: 'Environment',
        fix: majorVersion < 18 ? 'nvm install 18 && nvm use 18' : undefined,
      });

      // Check workspace
      const workspaceFolders = vscode.workspace.workspaceFolders;
      checks.push({
        name: 'Workspace Open',
        status: workspaceFolders && workspaceFolders.length > 0 ? 'pass' : 'fail',
        message: workspaceFolders && workspaceFolders.length > 0
          ? `Workspace: ${workspaceFolders[0].name}`
          : 'No workspace folder open',
        category: 'Environment',
      });

      // Check for package.json
      if (workspaceFolders && workspaceFolders.length > 0) {
        try {
          const packageJsonUri = vscode.Uri.joinPath(workspaceFolders[0].uri, 'package.json');
          await vscode.workspace.fs.stat(packageJsonUri);
          checks.push({
            name: 'package.json',
            status: 'pass',
            message: 'package.json found in workspace root',
            category: 'Configuration',
          });
        } catch {
          checks.push({
            name: 'package.json',
            status: 'warn',
            message: 'No package.json found in workspace root',
            category: 'Configuration',
            fix: 'npm init -y',
          });
        }

        // Check for .git
        try {
          const gitUri = vscode.Uri.joinPath(workspaceFolders[0].uri, '.git');
          await vscode.workspace.fs.stat(gitUri);
          checks.push({
            name: 'Git Repository',
            status: 'pass',
            message: 'Git repository initialized',
            category: 'Git',
          });
        } catch {
          checks.push({
            name: 'Git Repository',
            status: 'warn',
            message: 'Not a git repository',
            category: 'Git',
            fix: 'git init',
          });
        }

        // Check for TypeScript
        try {
          const tsconfigUri = vscode.Uri.joinPath(workspaceFolders[0].uri, 'tsconfig.json');
          await vscode.workspace.fs.stat(tsconfigUri);
          checks.push({
            name: 'TypeScript',
            status: 'pass',
            message: 'TypeScript configured (tsconfig.json found)',
            category: 'Configuration',
          });
        } catch {
          checks.push({
            name: 'TypeScript',
            status: 'warn',
            message: 'No tsconfig.json found',
            category: 'Configuration',
          });
        }

        // Check for .env file
        try {
          const envUri = vscode.Uri.joinPath(workspaceFolders[0].uri, '.env');
          await vscode.workspace.fs.stat(envUri);
          checks.push({
            name: 'Environment Variables',
            status: 'pass',
            message: '.env file found',
            category: 'Configuration',
          });
        } catch {
          checks.push({
            name: 'Environment Variables',
            status: 'warn',
            message: 'No .env file found',
            category: 'Configuration',
          });
        }

        // Check for .gitignore
        try {
          const gitignoreUri = vscode.Uri.joinPath(workspaceFolders[0].uri, '.gitignore');
          await vscode.workspace.fs.stat(gitignoreUri);
          checks.push({
            name: 'Gitignore',
            status: 'pass',
            message: '.gitignore file found',
            category: 'Git',
          });
        } catch {
          checks.push({
            name: 'Gitignore',
            status: 'warn',
            message: 'No .gitignore file found',
            category: 'Git',
            fix: 'npx gitignore node',
          });
        }
      }

      // Check CLI availability
      checks.push({
        name: 'VibeCheck CLI',
        status: 'fail',
        message: 'VibeCheck CLI not installed',
        category: 'CLI',
        fix: 'npm install -g @vibecheckai/cli',
      });

      return checks;
    }

    context.subscriptions.push(
      vscode.commands.registerCommand('vibecheck.audit', async () => {
        const startTime = Date.now();
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        const projectName = workspaceFolder?.name ?? 'Unknown Project';

        // Check if CLI is available, if not fall back to built-in scanner
        const cliAvailable = await cliService.isAvailable();

        // Run in terminal if CLI available (user can see live output)
        if (cliAvailable) {
          await cliService.runAuditInTerminal();
        }

        await vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: '🔍 Running Full Security Audit...',
          cancellable: false
        }, async (progress) => {
          progress.report({ message: 'Scanning codebase...' });

          let allIssues: Array<{
            id: string;
            file: string;
            line: number;
            column: number;
            message: string;
            severity: 'error' | 'warning' | 'info' | 'hint';
            rule: string;
            engine: string;
            suggestion?: string;
          }> = [];
          let attackScore = 0;
          let filesScanned = 0;

          if (cliAvailable) {
            // Use CLI for audit
            const result = await cliService.audit();
            if (result.success && result.data) {
              const data = result.data as AuditResult;
              const { findings } = data;
              attackScore = data.attackScore || 0;

              if (findings && findings.length > 0) {
                // Count unique files from findings
                const uniqueFiles = new Set(findings.map(f => f.file));
                filesScanned = uniqueFiles.size;

                allIssues = (findings as CliFinding[]).map((f) => ({
                  id: f.id,
                  file: f.file,
                  line: f.line || 1,
                  column: 1,
                  message: f.title || f.description || '',
                  severity: (f.severity === 'critical' || f.severity === 'high' ? 'error' : f.severity === 'medium' ? 'warning' : 'info') as 'error' | 'warning' | 'info',
                  rule: f.type,
                  engine: 'cli-audit',
                  suggestion: f.howToFix,
                }));
              }
            }
          } else {
            // Fall back to built-in scanner for workspace scan
            progress.report({ message: 'CLI not found, using built-in scanner...' });
            const scanResults = await scannerService.scanWorkspace();
            filesScanned = scanResults.size;

            for (const [_file, issues] of scanResults) {
              allIssues.push(...issues.map(issue => ({
                ...issue,
                severity: issue.severity as 'error' | 'warning' | 'info' | 'hint'
              })));
            }

            // Calculate attack score from issues
            const errorCount = allIssues.filter(i => i.severity === 'error').length;
            const warningCount = allIssues.filter(i => i.severity === 'warning').length;
            attackScore = Math.min(100, errorCount * 10 + warningCount * 3);
          }

          const scanDuration = Date.now() - startTime;

          // Update diagnostics
          const issuesByFile = new Map<string, typeof allIssues>();
          for (const issue of allIssues) {
            if (!issuesByFile.has(issue.file)) issuesByFile.set(issue.file, []);
            issuesByFile.get(issue.file)!.push(issue);
          }

          for (const [file, issues] of issuesByFile) {
            diagnosticsProvider.setIssues(vscode.Uri.file(file), issues);
          }
          issuesTreeProvider.setIssues(allIssues);

          // Calculate summary
          const summary = {
            total: allIssues.length,
            errors: allIssues.filter(i => i.severity === 'error').length,
            warnings: allIssues.filter(i => i.severity === 'warning').length,
            info: allIssues.filter(i => i.severity === 'info' || i.severity === 'hint').length,
          };

          // Open the Audit Report Panel with results
          AuditReportPanel.createOrShow(context.extensionUri, {
            issues: allIssues,
            summary,
            attackScore,
            scanDuration,
            filesScanned: filesScanned || issuesByFile.size,
            timestamp: new Date().toISOString(),
            projectName,
          });
        });
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('vibecheck.forge', async () => {
        if (!await cliService.isAvailable()) {
          void vscode.window.showErrorMessage(
            'VibeCheck CLI not found. Forge requires the CLI to generate AI rules.',
            'Install CLI'
          ).then(action => {
            if (action === 'Install CLI') {
              const terminal = vscode.window.createTerminal('VibeCheck Install');
              terminal.show();
              terminal.sendText('npm install -g @vibecheckai/cli');
            }
          });
          return;
        }

        // Run in terminal so user sees live output
        await cliService.runForgeInTerminal();

        await vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: '🔥 Generating AI rules with Forge...',
          cancellable: false
        }, async () => {
          const result = await cliService.forge();
          if (result.success) {
            void vscode.window.showInformationMessage(
              '🔥 AI rules generated! Check .cursor/rules or .vibecheck folder.',
              'Open Rules'
            ).then(async action => {
              if (action === 'Open Rules') {
                // Try to open the generated rules file
                const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
                if (workspaceFolder) {
                  const possiblePaths = [
                    vscode.Uri.joinPath(workspaceFolder.uri, '.vibecheck', 'rules.md'),
                    vscode.Uri.joinPath(workspaceFolder.uri, '.cursor', 'rules', 'project-context.mdc'),
                    vscode.Uri.joinPath(workspaceFolder.uri, '.cursorrules'),
                  ];
                  for (const rulesPath of possiblePaths) {
                    try {
                      const doc = await vscode.workspace.openTextDocument(rulesPath);
                      await vscode.window.showTextDocument(doc);
                      break;
                    } catch {
                      // Try next path
                    }
                  }
                }
              }
            });
          } else {
            void vscode.window.showErrorMessage(`Forge failed: ${result.error || 'Unknown error'}`);
          }
        });
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('vibecheck.ship', async () => {
        if (!await cliService.isAvailable()) {
          void vscode.window.showErrorMessage('VibeCheck CLI not found. Install with: npm install -g vibecheck');
          return;
        }

        // Run in terminal so user sees live output
        await cliService.runShipInTerminal();

        await vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: 'Getting ship verdict...',
          cancellable: false
        }, async () => {
          const result = await cliService.ship();
          if (result.success && result.data) {
            const { verdict, score, blockers } = result.data as ShipResult;
            const emoji = verdict === 'SHIP' ? '🚀' : verdict === 'WARN' ? '⚠️' : '🛑';

            if (verdict === 'BLOCK' && blockers?.length) {
              void vscode.window.showErrorMessage(`${emoji} ${verdict}: ${blockers.join(', ')}`);
            } else {
              void vscode.window.showInformationMessage(`${emoji} Verdict: ${verdict} (Score: ${score})`);
            }
          } else {
            outputManager.printInfo(result.output || 'Ship check completed');
            outputManager.show();
          }
        });
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('vibecheck.checkpoint', async () => {
        if (!await cliService.isAvailable()) {
          void vscode.window.showErrorMessage('VibeCheck CLI not found. Install with: npm install -g vibecheck');
          return;
        }

        // Run in terminal so user sees live output
        await cliService.runCheckpointInTerminal();

        const result = await cliService.checkpoint('create');
        if (result.success) {
          void vscode.window.showInformationMessage('Checkpoint created! Use "Restore Checkpoint" to revert.');
        } else {
          void vscode.window.showErrorMessage(`Checkpoint failed: ${result.error}`);
        }
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('vibecheck.checkpointRestore', async () => {
        if (!await cliService.isAvailable()) {
          void vscode.window.showErrorMessage('VibeCheck CLI not found. Install with: npm install -g vibecheck');
          return;
        }

        const confirm = await vscode.window.showWarningMessage(
          'Restore to last checkpoint? This will revert recent changes.',
          'Restore', 'Cancel'
        );

        if (confirm === 'Restore') {
          const result = await cliService.checkpoint('restore');
          if (result.success) {
            void vscode.window.showInformationMessage('Checkpoint restored!');
          } else {
            void vscode.window.showErrorMessage(`Restore failed: ${result.error}`);
          }
        }
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('vibecheck.packs', async () => {
        if (!await cliService.isAvailable()) {
          void vscode.window.showErrorMessage('VibeCheck CLI not found. Install with: npm install -g vibecheck');
          return;
        }

        const format = await vscode.window.showQuickPick([
          { label: '$(file-code) HTML Report', value: 'html' as const },
          { label: '$(package) ZIP Bundle', value: 'zip' as const },
          { label: '$(json) JSON Data', value: 'json' as const },
        ], { placeHolder: 'Select report format' });

        if (!format) return;

        // Run in terminal so user sees live output
        await cliService.runPacksInTerminal();

        await vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: 'Generating report bundle...',
          cancellable: false
        }, async () => {
          const result = await cliService.packs(format.value);
          if (result.success) {
            void vscode.window.showInformationMessage('Report bundle generated in .vibecheck/bundles folder!');
            // Try to open the bundle folder
            const bundlesPath = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, '.vibecheck', 'bundles');
            void vscode.commands.executeCommand('revealFileInOS', bundlesPath);
          } else {
            void vscode.window.showErrorMessage(`Report generation failed: ${result.error}`);
          }
        });
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('vibecheck.startWatch', async () => {
        if (!await cliService.isAvailable()) {
          void vscode.window.showErrorMessage('VibeCheck CLI not found. Install with: npm install -g vibecheck');
          return;
        }

        await cliService.startWatch();
        void vscode.window.showInformationMessage('VibeCheck watch mode started in terminal');
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('vibecheck.aiFix', async () => {
        if (!await cliService.isAvailable()) {
          void vscode.window.showErrorMessage('VibeCheck CLI not found. Install with: npm install -g vibecheck');
          return;
        }

        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          void vscode.window.showWarningMessage('Open a file to run AI fix');
          return;
        }

        // Get issue at cursor if any
        const issue = diagnosticsProvider.getIssueAtPosition(editor.document.uri, editor.selection.active);

        // Run in terminal so user sees live output
        await cliService.runFixInTerminal(false);

        await vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: 'Running AI auto-fix...',
          cancellable: false
        }, async () => {
          const result = await cliService.fix(issue?.id);
          if (result.success) {
            void vscode.window.showInformationMessage('AI fix applied! Review the changes.');
            // Reload the document to show changes
            void vscode.commands.executeCommand('workbench.action.files.revert');
          } else {
            if (result.error?.includes('PRO')) {
              void vscode.window.showWarningMessage('AI Fix requires VibeCheck PRO subscription');
            } else {
              void vscode.window.showErrorMessage(`AI fix failed: ${result.error}`);
            }
          }
        });
      })
    );

    // ─────────────────────────────────────────────────────────────────────────────
    // Missing CLI Commands (kickoff, link, safelist, labs, etc.)
    // ─────────────────────────────────────────────────────────────────────────────

    context.subscriptions.push(
      vscode.commands.registerCommand('vibecheck.kickoff', async () => {
        if (!await cliService.isAvailable()) {
          void vscode.window.showErrorMessage('VibeCheck CLI not found. Install with: npm install -g @vibecheckai/cli');
          return;
        }

        await vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: '🚀 Running Kickoff (link → forge → audit → ship)...',
          cancellable: false
        }, async (progress) => {
          progress.report({ message: 'Linking project...' });
          const linkResult = await cliService.runCommand('link');
          if (!linkResult.success) {
            void vscode.window.showErrorMessage(`Link failed: ${linkResult.error}`);
            return;
          }

          progress.report({ message: 'Generating AI rules...' });
          const forgeResult = await cliService.forge();
          if (!forgeResult.success) {
            void vscode.window.showWarningMessage(`Forge failed: ${forgeResult.error}`);
          }

          progress.report({ message: 'Running audit...' });
          await vscode.commands.executeCommand('vibecheck.audit');

          progress.report({ message: 'Getting ship verdict...' });
          const shipResult = await cliService.ship();
          if (shipResult.success && shipResult.data) {
            const { verdict, score } = shipResult.data as ShipResult;
            const emoji = verdict === 'SHIP' ? '🚀' : verdict === 'WARN' ? '⚠️' : '🛑';
            void vscode.window.showInformationMessage(`${emoji} Kickoff complete! Verdict: ${verdict} (Score: ${score})`);
          } else {
            void vscode.window.showInformationMessage('Kickoff complete!');
          }
        });
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('vibecheck.link', async () => {
        if (!await cliService.isAvailable()) {
          void vscode.window.showErrorMessage('VibeCheck CLI not found. Install with: npm install -g @vibecheckai/cli');
          return;
        }

        await vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: '🔗 Linking project...',
          cancellable: false
        }, async () => {
          const result = await cliService.runCommand('link');
          if (result.success) {
            void vscode.window.showInformationMessage('Project linked successfully!');
          } else {
            void vscode.window.showErrorMessage(`Link failed: ${result.error}`);
          }
        });
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('vibecheck.safelist', async () => {
        if (!await cliService.isAvailable()) {
          void vscode.window.showErrorMessage('VibeCheck CLI not found. Install with: npm install -g @vibecheckai/cli');
          return;
        }

        const result = await cliService.runCommand('safelist');
        if (result.success) {
          void vscode.window.showInformationMessage('Safelist updated! Check .vibecheck/safelist.json');
        } else {
          void vscode.window.showErrorMessage(`Safelist failed: ${result.error}`);
        }
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('vibecheck.labs', async () => {
        void vscode.window.showInformationMessage(
          '🧪 Labs contains experimental features. Check vibecheckai.dev/labs for the latest beta features.',
          'Open Labs'
        ).then(action => {
          if (action === 'Open Labs') {
            void vscode.env.openExternal(vscode.Uri.parse('https://vibecheckai.dev/labs'));
          }
        });
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('vibecheck.shield', async () => {
        // Open shield toggle menu
        await vscode.commands.executeCommand('vibecheck.shieldToggle');
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('vibecheck.reality', async () => {
        // Alias to realityMode
        await vscode.commands.executeCommand('vibecheck.realityMode');
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('vibecheck.prove', async () => {
        if (!await cliService.isAvailable()) {
          void vscode.window.showErrorMessage('VibeCheck CLI not found. Install with: npm install -g @vibecheckai/cli');
          return;
        }

        // Run in terminal so user sees live output
        await cliService.runProveInTerminal();

        await vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: '✅ Running proof loop...',
          cancellable: false
        }, async () => {
          const result = await cliService.runCommand('prove');
          if (result.success) {
            void vscode.window.showInformationMessage('Proof complete! All claims verified.');
          } else {
            void vscode.window.showErrorMessage(`Prove failed: ${result.error}`);
          }
        });
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('vibecheck.launch', async () => {
        if (!await cliService.isAvailable()) {
          void vscode.window.showErrorMessage('VibeCheck CLI not found. Install with: npm install -g @vibecheckai/cli');
          return;
        }

        await vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: '🚀 Running pre-launch validation...',
          cancellable: false
        }, async () => {
          const result = await cliService.runCommand('launch');
          if (result.success) {
            void vscode.window.showInformationMessage('Launch validation complete! Ready for deployment.');
          } else {
            void vscode.window.showErrorMessage(`Launch validation failed: ${result.error}`);
          }
        });
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('vibecheck.polish', async () => {
        if (!await cliService.isAvailable()) {
          void vscode.window.showErrorMessage('VibeCheck CLI not found. Install with: npm install -g @vibecheckai/cli');
          return;
        }

        await vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: '✨ Running production polish...',
          cancellable: false
        }, async () => {
          const result = await cliService.runCommand('polish');
          if (result.success) {
            void vscode.window.showInformationMessage('Polish complete! Code is production-ready.');
          } else {
            void vscode.window.showErrorMessage(`Polish failed: ${result.error}`);
          }
        });
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('vibecheck.seal', async () => {
        if (!await cliService.isAvailable()) {
          void vscode.window.showErrorMessage('VibeCheck CLI not found. Install with: npm install -g @vibecheckai/cli');
          return;
        }

        await vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: '🏷️ Generating ship badge and attestation...',
          cancellable: false
        }, async () => {
          const result = await cliService.runCommand('seal');
          if (result.success) {
            void vscode.window.showInformationMessage('Seal created! Ship badge generated in .vibecheck/seal/');
          } else {
            void vscode.window.showErrorMessage(`Seal failed: ${result.error}`);
          }
        });
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('vibecheck.login', async () => {
        // AuthService.login() has its own UI flow
        await authService.login();
      })
    );

    // ─────────────────────────────────────────────────────────────────────────────
    // Shield (Agent Firewall) Commands
    // ─────────────────────────────────────────────────────────────────────────────

    context.subscriptions.push(
      vscode.commands.registerCommand('vibecheck.shieldStatus', async () => {
        const status = await firewallService.getStatus();
        const modeEmoji = status.mode === 'enforce' ? '🔒' : status.mode === 'observe' ? '👁️' : '⚪';
        void vscode.window.showInformationMessage(
          `Shield Status: ${modeEmoji} ${status.mode.toUpperCase()} | Violations: ${status.violationCount} | Blocked: ${status.blockedCount}`
        );
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('vibecheck.shieldToggle', async () => {
        const currentMode = firewallService.getMode();
        const items = [
          { label: '$(lock) Enforce', description: 'Block saves that violate policy', mode: 'enforce' as const },
          { label: '$(eye) Observe', description: 'Log violations but allow saves', mode: 'observe' as const },
          { label: '$(circle-slash) Off', description: 'Disable firewall', mode: 'off' as const },
        ];

        const selection = await vscode.window.showQuickPick(items, {
          title: 'Shield Mode',
          placeHolder: `Current: ${currentMode.toUpperCase()}`,
        });

        if (selection) {
          const success = await firewallService.setMode(selection.mode);
          if (success) {
            const emoji = selection.mode === 'enforce' ? '🔒' : selection.mode === 'observe' ? '👁️' : '⚪';
            void vscode.window.showInformationMessage(`Shield mode set to: ${emoji} ${selection.mode.toUpperCase()}`);
          } else {
            if (!firewallService.isShieldAvailable()) {
              void vscode.window.showErrorMessage('Shield commands not available in your CLI version.');
            } else {
              void vscode.window.showErrorMessage('Failed to change shield mode. Is the CLI installed?');
            }
          }
        }
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('vibecheck.shieldCheck', async () => {
        // Check if CLI is available
        if (!await cliService.isAvailable()) {
          void vscode.window.showErrorMessage(
            'VibeCheck CLI not found. Shield Check requires the CLI.',
            'Install CLI'
          ).then(action => {
            if (action === 'Install CLI') {
              const terminal = vscode.window.createTerminal('VibeCheck Install');
              terminal.show();
              terminal.sendText('npm install -g @vibecheckai/cli');
            }
          });
          return;
        }

        await vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: 'Running shield check...',
          cancellable: false
        }, async () => {
          const result = await firewallService.check();
          if (result) {
            // Update status bar
            intentStatusBar.updateVerdict(result);

            const emoji = result.verdict === 'SHIP' ? '✅' : result.verdict === 'WARN' ? '⚠️' : '🚫';
            const action = await vscode.window.showInformationMessage(
              `${emoji} Shield: ${result.verdict} | Score: ${result.score} | ${result.findings.length} findings`,
              'View Details',
              'Copy Verdict'
            );

            if (action === 'View Details') {
              // Show detailed output
              const outputChannel = vscode.window.createOutputChannel('VibeCheck Shield');
              outputChannel.clear();
              outputChannel.appendLine('═══════════════════════════════════════════════════════════════');
              outputChannel.appendLine(`  🛡️ SHIELD CHECK RESULT: ${result.verdict}`);
              outputChannel.appendLine('═══════════════════════════════════════════════════════════════');
              outputChannel.appendLine('');
              outputChannel.appendLine(`  Score:     ${result.score}`);
              outputChannel.appendLine(`  Passed:    ${result.passed ? 'Yes' : 'No'}`);
              outputChannel.appendLine(`  Findings:  ${result.findings.length}`);
              outputChannel.appendLine('');

              if (result.findings.length > 0) {
                outputChannel.appendLine('───────────────────────────────────────────────────────────────');
                outputChannel.appendLine('  FINDINGS');
                outputChannel.appendLine('───────────────────────────────────────────────────────────────');
                for (const f of result.findings) {
                  const location = f.file ? `${f.file}${f.line ? ':' + f.line : ''}` : '';
                  outputChannel.appendLine('');
                  outputChannel.appendLine(`  [${f.severity.toUpperCase()}] ${f.type}`);
                  outputChannel.appendLine(`  ${f.message}`);
                  if (location) outputChannel.appendLine(`  📍 ${location}`);
                  if (f.howToFix) outputChannel.appendLine(`  💡 ${f.howToFix}`);
                }
              }

              outputChannel.appendLine('');
              outputChannel.appendLine('═══════════════════════════════════════════════════════════════');
              outputChannel.show();
            } else if (action === 'Copy Verdict') {
              void vscode.commands.executeCommand('vibecheck.copyVerdict');
            }
          } else {
            if (!firewallService.isShieldAvailable()) {
              void vscode.window.showWarningMessage('Shield commands not available in your CLI version. This feature requires a CLI with shield support.');
            } else {
              void vscode.window.showWarningMessage('Shield check failed. Is the CLI installed and project initialized?');
            }
          }
        });
      })
    );

    // Copy verdict to clipboard - variable reserved for future use
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    let _lastShieldVerdict: { verdict: string; score: number; passed: boolean; findings: unknown[] } | null = null;
    context.subscriptions.push(
      vscode.commands.registerCommand('vibecheck.copyVerdict', async () => {
        const result = await firewallService.check();
        if (result) {
          const shareData = {
            verdict: result.verdict,
            score: result.score,
            passed: result.passed,
            findingsCount: result.findings.length,
            timestamp: new Date().toISOString(),
          };
          await vscode.env.clipboard.writeText(JSON.stringify(shareData, null, 2));
          void vscode.window.showInformationMessage('Verdict copied to clipboard!');
        } else {
          void vscode.window.showWarningMessage('No verdict available. Run Shield Check first.');
        }
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('vibecheck.shieldEnforce', async () => {
        const success = await firewallService.setMode('enforce');
        if (success) {
          void vscode.window.showInformationMessage('🔒 Shield: Enforce mode enabled. Saves will be blocked on violations.');
        } else {
          void vscode.window.showErrorMessage('Failed to enable enforce mode.');
        }
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('vibecheck.shieldObserve', async () => {
        const success = await firewallService.setMode('observe');
        if (success) {
          void vscode.window.showInformationMessage('👁️ Shield: Observe mode enabled. Violations logged but not blocked.');
        } else {
          void vscode.window.showErrorMessage('Failed to enable observe mode.');
        }
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('vibecheck.shieldOff', async () => {
        const success = await firewallService.setMode('off');
        if (success) {
          void vscode.window.showInformationMessage('⚪ Shield disabled.');
        } else {
          void vscode.window.showErrorMessage('Failed to disable shield.');
        }
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('vibecheck.shieldInstall', async () => {
        const success = await firewallService.installHooks();
        if (success) {
          void vscode.window.showInformationMessage('IDE hooks installed successfully!');
        } else {
          void vscode.window.showErrorMessage('Failed to install IDE hooks.');
        }
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('vibecheck.showVerdict', async () => {
        // Run shield check and show details
        await vscode.commands.executeCommand('vibecheck.shieldCheck');
      })
    );

    // ─────────────────────────────────────────────────────────────────────────────
    // Intent Management Commands (Intent-First Agent Firewall)
    // ─────────────────────────────────────────────────────────────────────────────

    context.subscriptions.push(
      vscode.commands.registerCommand('vibecheck.setIntent', async () => {
        // Check if CLI is available for full functionality
        const cliAvailable = await cliService.isAvailable();

        const templates = firewallService.getTemplates();

        // Quick pick for templates or custom
        const options = [
          { label: '$(edit) Custom Intent', description: 'Write your own intent', isCustom: true },
          { label: '$(separator)', kind: vscode.QuickPickItemKind.Separator, description: '' },
          ...templates.map(t => ({
            label: `$(symbol-event) ${t.name}`,
            description: t.summary,
            template: t,
            isCustom: false
          }))
        ];

        interface IntentOption extends vscode.QuickPickItem {
          isCustom?: boolean;
          template?: { name: string; summary: string; constraints: string[] };
        }

        const choice = await vscode.window.showQuickPick<IntentOption>(options as IntentOption[], {
          placeHolder: 'Choose a template or write custom intent',
          title: '🛡️ Set Intent for Agent Firewall'
        });

        if (!choice) return;

        let summary: string;
        let constraints: string[] = [];

        if (choice.isCustom) {
          // Custom intent
          const inputSummary = await vscode.window.showInputBox({
            prompt: 'What are you trying to do? (one sentence)',
            placeHolder: 'e.g., Add Google OAuth login to the dashboard',
            title: '🛡️ Intent Summary'
          });

          if (!inputSummary) return;
          summary = inputSummary;

          // Ask for constraints
          const constraintsInput = await vscode.window.showInputBox({
            prompt: 'Constraints (comma-separated, optional)',
            placeHolder: 'e.g., No new env vars, Use existing auth, Protect /dashboard',
            title: '🛡️ Intent Constraints'
          });

          if (constraintsInput) {
            constraints = constraintsInput.split(',').map(c => c.trim()).filter(c => c.length > 0);
          }
        } else {
          // Template
          const template = choice.template!;

          // Let user customize the summary
          const customSummary = await vscode.window.showInputBox({
            prompt: 'Customize the intent (or keep default)',
            value: template.summary,
            title: `🛡️ ${template.name} Intent`
          });

          if (!customSummary) return;
          summary = customSummary;
          constraints = template.constraints;
        }

        // Set the intent
        await vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: 'Setting intent...'
        }, async () => {
          let success = false;

          if (cliAvailable) {
            success = await firewallService.setIntent(summary, constraints);
          } else {
            // Local-only mode: store intent in extension state
            // The intent will be displayed but CLI features won't work
            success = true;
            void vscode.window.showWarningMessage(
              'Intent saved locally. Install VibeCheck CLI for full Shield enforcement.',
              'Install CLI'
            ).then(action => {
              if (action === 'Install CLI') {
                const terminal = vscode.window.createTerminal('VibeCheck Install');
                terminal.show();
                terminal.sendText('npm install -g @vibecheckai/cli');
              }
            });
          }

          if (success) {
            const mode = firewallService.getMode();
            void vscode.window.showInformationMessage(
              `🛡️ Intent set: "${summary}" | Mode: ${mode.toUpperCase()}`,
              'Switch to Enforce',
              'View Details'
            ).then(action => {
              if (action === 'Switch to Enforce') {
                void vscode.commands.executeCommand('vibecheck.shieldEnforce');
              } else if (action === 'View Details') {
                void vscode.commands.executeCommand('vibecheck.showIntent');
              }
            });
          } else {
            void vscode.window.showErrorMessage(
              'Failed to set intent. Install VibeCheck CLI for Shield features.',
              'Install CLI'
            ).then(action => {
              if (action === 'Install CLI') {
                const terminal = vscode.window.createTerminal('VibeCheck Install');
                terminal.show();
                terminal.sendText('npm install -g @vibecheckai/cli');
              }
            });
          }
        });
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('vibecheck.editIntent', async () => {
        const currentIntent = firewallService.getCurrentIntent();

        if (currentIntent) {
          // Show current intent and offer to edit or clear
          interface EditIntentAction extends vscode.QuickPickItem {
            action: 'edit' | 'addConstraint' | 'clear' | 'mode';
          }
          const action = await vscode.window.showQuickPick<EditIntentAction>([
            { label: '$(edit) Edit Intent', description: 'Modify current intent', action: 'edit' },
            { label: '$(add) Add Constraint', description: 'Add new constraint', action: 'addConstraint' },
            { label: '$(trash) Clear Intent', description: 'Remove current intent', action: 'clear' },
            { label: '$(eye) Change Mode', description: `Current: ${firewallService.getMode().toUpperCase()}`, action: 'mode' },
          ], {
            placeHolder: `Current: "${currentIntent.summary}"`,
            title: '🛡️ Edit Intent'
          });

          if (!action) return;

          switch (action.action) {
            case 'edit':
              await vscode.commands.executeCommand('vibecheck.setIntent');
              break;
            case 'addConstraint':
              const newConstraint = await vscode.window.showInputBox({
                prompt: 'Enter new constraint',
                placeHolder: 'e.g., No changes to billing code'
              });
              if (newConstraint) {
                const newConstraints = [...currentIntent.constraints, newConstraint];
                await firewallService.setIntent(currentIntent.summary, newConstraints);
                void vscode.window.showInformationMessage(`Added constraint: "${newConstraint}"`);
              }
              break;
            case 'clear':
              await vscode.commands.executeCommand('vibecheck.clearIntent');
              break;
            case 'mode':
              await vscode.commands.executeCommand('vibecheck.shieldToggle');
              break;
          }
        } else {
          // No intent - prompt to set one
          await vscode.commands.executeCommand('vibecheck.setIntent');
        }
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('vibecheck.showIntent', async () => {
        const intent = await firewallService.getIntent();
        const mode = firewallService.getMode();

        if (!intent) {
          void vscode.window.showInformationMessage(
            '🛡️ No intent set. Set one to enable Agent Firewall enforcement.',
            'Set Intent'
          ).then(action => {
            if (action === 'Set Intent') {
              void vscode.commands.executeCommand('vibecheck.setIntent');
            }
          });
          return;
        }

        // Show detailed intent info
        const outputChannel = vscode.window.createOutputChannel('VibeCheck Intent');
        outputChannel.clear();
        outputChannel.appendLine('═══════════════════════════════════════════════════════════════');
        outputChannel.appendLine('  🛡️ AGENT FIREWALL - CURRENT INTENT');
        outputChannel.appendLine('═══════════════════════════════════════════════════════════════');
        outputChannel.appendLine('');
        outputChannel.appendLine(`  Summary:  ${intent.summary}`);
        outputChannel.appendLine(`  Mode:     ${mode.toUpperCase()}`);
        outputChannel.appendLine('');

        if (intent.constraints && intent.constraints.length > 0) {
          outputChannel.appendLine('  Constraints:');
          for (const c of intent.constraints) {
            outputChannel.appendLine(`    • ${c}`);
          }
          outputChannel.appendLine('');
        }

        if (intent.timestamp) {
          outputChannel.appendLine(`  Set at:   ${intent.timestamp}`);
        }
        if (intent.sessionId) {
          outputChannel.appendLine(`  Session:  ${intent.sessionId}`);
        }
        if (intent.hash) {
          outputChannel.appendLine(`  Hash:     ${intent.hash}`);
        }

        outputChannel.appendLine('');
        outputChannel.appendLine('───────────────────────────────────────────────────────────────');
        outputChannel.appendLine('  What this means:');
        outputChannel.appendLine('');

        if (mode === 'enforce') {
          outputChannel.appendLine('  🔒 ENFORCE MODE - Changes that violate intent will be BLOCKED');
          outputChannel.appendLine('  • AI cannot add new env vars unless declared');
          outputChannel.appendLine('  • AI cannot change auth outside intent scope');
          outputChannel.appendLine('  • AI cannot create routes not in intent');
        } else if (mode === 'observe') {
          outputChannel.appendLine('  👁️ OBSERVE MODE - Violations will be logged but not blocked');
          outputChannel.appendLine('  • Use this to test intent before enforcing');
          outputChannel.appendLine('  • Run "Shield Check" to see violations');
        } else {
          outputChannel.appendLine('  ⚪ OFF - No enforcement active');
          outputChannel.appendLine('  • Set mode to "observe" or "enforce" to activate');
        }

        outputChannel.appendLine('═══════════════════════════════════════════════════════════════');
        outputChannel.show();
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('vibecheck.clearIntent', async () => {
        const confirm = await vscode.window.showWarningMessage(
          'Clear current intent? This will remove enforcement constraints.',
          'Clear Intent',
          'Cancel'
        );

        if (confirm === 'Clear Intent') {
          const success = await firewallService.clearIntent();
          if (success) {
            void vscode.window.showInformationMessage('🛡️ Intent cleared.');
          } else {
            void vscode.window.showErrorMessage('Failed to clear intent.');
          }
        }
      })
    );

    // ─────────────────────────────────────────────────────────────────────────────
    // Quick Actions Menu (Cmd+Shift+A)
    // ─────────────────────────────────────────────────────────────────────────────

    context.subscriptions.push(
      vscode.commands.registerCommand('vibecheck.quickActions', async () => {
        interface ActionItem extends vscode.QuickPickItem { command: string; args?: string; }

        // Get current intent for display
        const currentIntent = firewallService.getCurrentIntent();
        const currentMode = firewallService.getMode();
        const intentLabel = currentIntent
          ? `Current: "${currentIntent.summary.substring(0, 30)}${currentIntent.summary.length > 30 ? '...' : ''}" | ${currentMode.toUpperCase()}`
          : 'No intent set';

        const action = await vscode.window.showQuickPick<ActionItem>([
          // Prompt Builder (Featured)
          { label: '$(sparkle) Prompt Builder', description: 'Build world-class AI prompts', command: 'vibecheck.promptBuilder' },
          { label: '$(zap) Quick Prompt', description: 'Fast prompt from description', command: 'vibecheck.promptBuilderQuick' },
          { label: '$(separator)', kind: vscode.QuickPickItemKind.Separator, description: '', command: '' },
          // Intent-First Section
          { label: '$(shield) Set Intent', description: 'Define what AI should do', command: 'vibecheck.setIntent' },
          { label: '$(edit) Edit Intent', description: intentLabel, command: 'vibecheck.editIntent' },
          { label: '$(lock) Shield: Enforce Mode', description: 'Block violations', command: 'vibecheck.shieldEnforce' },
          { label: '$(eye) Shield: Observe Mode', description: 'Log but allow', command: 'vibecheck.shieldObserve' },
          { label: '$(separator)', kind: vscode.QuickPickItemKind.Separator, description: '', command: '' },
          // Scanning
          { label: '$(search) Scan Current File', description: 'Analyze for issues', command: 'vibecheck.scan' },
          { label: '$(folder) Scan Workspace', description: 'Analyze entire project', command: 'vibecheck.scanWorkspace' },
          { label: '$(shield) Full Security Audit', description: 'CLI audit with attack score', command: 'vibecheck.audit' },
          { label: '$(rocket) Get Ship Verdict', description: 'SHIP / WARN / BLOCK', command: 'vibecheck.ship' },
          { label: '$(verified) Shield Check', description: 'Verify AI claims', command: 'vibecheck.shieldCheck' },
          { label: '$(separator)', kind: vscode.QuickPickItemKind.Separator, description: '', command: '' },
          // Tools
          { label: '$(dashboard) Open Dashboard', description: 'View analytics & trends', command: 'vibecheck.openDashboard' },
          { label: '$(beaker) Run Reality Mode', description: 'Test features work', command: 'vibecheck.realityMode' },
          { label: '$(type-hierarchy) Analyze Code Flow', description: 'Trace data paths', command: 'vibecheck.analyzeCodeFlow' },
          { label: '$(flame) Security Heatmap', description: 'Visualize risk areas', command: 'vibecheck.showSecurityHeatmap' },
          { label: '$(separator)', kind: vscode.QuickPickItemKind.Separator, description: '', command: '' },
          // CLI Tools
          { label: '$(heart) Health Check (Doctor)', description: 'Check environment & deps', command: 'vibecheck.doctor' },
          { label: '$(symbol-ruler) Generate AI Rules', description: 'Forge context rules', command: 'vibecheck.forge' },
          { label: '$(package) Generate Report Bundle', description: 'HTML/ZIP artifact', command: 'vibecheck.packs' },
          { label: '$(history) Create Checkpoint', description: 'Snapshot current state', command: 'vibecheck.checkpoint' },
          { label: '$(eye) Start Watch Mode', description: 'Continuous scanning', command: 'vibecheck.startWatch' },
          { label: '$(separator)', kind: vscode.QuickPickItemKind.Separator, description: '', command: '' },
          // Pro Features
          { label: '$(sparkle) AI Auto-Fix (PRO)', description: 'Fix issues automatically', command: 'vibecheck.aiFix' },
          { label: '$(lightbulb) Explain Code', description: 'AI analysis of selection', command: 'vibecheck.explainCode' },
          { label: '$(export) Export Report', description: 'Generate HTML/PDF/SARIF', command: 'vibecheck.exportReport' },
          { label: '$(separator)', kind: vscode.QuickPickItemKind.Separator, description: '', command: '' },
          // File Lock Section
          { label: '$(lock) Lock Current File', description: 'Protect from agent edits', command: 'vibecheck.lockFile' },
          { label: '$(list-flat) Show Locked Files', description: `${lockService?.lockCount ?? 0} locked`, command: 'vibecheck.showLockedFiles' },
          { label: '$(unlock) Unlock All', description: 'Remove all locks', command: 'vibecheck.unlockAll' },
          { label: '$(separator)', kind: vscode.QuickPickItemKind.Separator, description: '', command: '' },
          { label: '$(gear) Settings', description: 'Configure VibeCheck', command: 'workbench.action.openSettings', args: 'vibecheck' },
        ], { placeHolder: 'Select a VibeCheck action', title: '🛡️ VibeCheck Quick Actions' });

        if (action) {
          if (action.args) { void vscode.commands.executeCommand(action.command, action.args); }
          else { void vscode.commands.executeCommand(action.command); }
        }
      })
    );

    // ─────────────────────────────────────────────────────────────────────────────
    // Prompt Builder Commands
    // ─────────────────────────────────────────────────────────────────────────────

    context.subscriptions.push(
      vscode.commands.registerCommand('vibecheck.promptBuilder', async () => {
        PromptBuilderPanel.createOrShow(context.extensionUri, promptBuilderService);
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('vibecheck.promptBuilderQuick', async () => {
        // Quick prompt builder via input box
        const input = await vscode.window.showInputBox({
          prompt: 'What do you want to build?',
          placeHolder: 'e.g., Add Google OAuth login to my Next.js app',
          title: '✨ Prompt Builder'
        });

        if (!input) return;

        const template = promptBuilderService.detectTemplate(input);
        if (template) {
          // Show detected template and offer to open full builder
          const action = await vscode.window.showInformationMessage(
            `Detected: ${template.icon} ${template.name}`,
            'Open Builder',
            'Quick Build'
          );

          if (action === 'Open Builder') {
            const panel = PromptBuilderPanel.createOrShow(context.extensionUri, promptBuilderService);
          } else if (action === 'Quick Build') {
            // Quick build with defaults
            const workspaceContext = await promptBuilderService.detectWorkspaceContext();
            const defaultAnswers: Record<string, string[]> = {};

            // Get default values from template questions
            for (const q of template.contextQuestions) {
              if (q.options) {
                const defaults = q.options.filter(o => o.default).map(o => o.value);
                if (defaults.length > 0) {
                  defaultAnswers[q.id] = defaults;
                }
              }
            }

            const builtPrompt = promptBuilderService.buildPrompt(template, input, defaultAnswers, workspaceContext);
            await vscode.env.clipboard.writeText(builtPrompt.expandedPrompt);
            void vscode.window.showInformationMessage('Prompt copied to clipboard! Paste it into your AI assistant.');
          }
        } else {
          // No template detected, open full builder
          void vscode.window.showInformationMessage(
            'No specific template detected. Opening full Prompt Builder...'
          );
          PromptBuilderPanel.createOrShow(context.extensionUri, promptBuilderService);
        }
      })
    );

    // ─────────────────────────────────────────────────────────────────────────────
    // File/Folder Lock Commands (Agent Protection)
    // ─────────────────────────────────────────────────────────────────────────────

    context.subscriptions.push(
      vscode.commands.registerCommand('vibecheck.lockFile', async (uri?: vscode.Uri) => {
        if (!lockService) {
          void vscode.window.showErrorMessage('Lock service not available.');
          return;
        }
        const targetUri = uri || vscode.window.activeTextEditor?.document.uri;
        if (!targetUri) {
          void vscode.window.showWarningMessage('No file selected to lock.');
          return;
        }

        const reason = await vscode.window.showInputBox({
          prompt: 'Why are you locking this file? (optional)',
          placeHolder: 'e.g., Critical configuration, do not modify',
          title: '🔒 Lock File'
        });

        const success = await lockService.lock(targetUri, reason || undefined);
        if (success) {
          void vscode.window.showInformationMessage(`🔒 Locked: ${targetUri.fsPath.split(/[\\/]/).pop()}`);
          void vscode.commands.executeCommand('setContext', 'vibecheck.isLocked', true);
        } else {
          void vscode.window.showErrorMessage('Failed to lock file.');
        }
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('vibecheck.lockFolder', async (uri?: vscode.Uri) => {
        if (!lockService) {
          void vscode.window.showErrorMessage('Lock service not available.');
          return;
        }
        if (!uri) {
          void vscode.window.showWarningMessage('No folder selected to lock.');
          return;
        }

        const reason = await vscode.window.showInputBox({
          prompt: 'Why are you locking this folder? (optional)',
          placeHolder: 'e.g., Core modules, require approval to modify',
          title: '🔒 Lock Folder'
        });

        const success = await lockService.lock(uri, reason || undefined);
        if (success) {
          void vscode.window.showInformationMessage(`🔒 Locked folder: ${uri.fsPath.split(/[\\/]/).pop()}`);
          void vscode.commands.executeCommand('setContext', 'vibecheck.isLocked', true);
        } else {
          void vscode.window.showErrorMessage('Failed to lock folder.');
        }
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('vibecheck.unlockFile', async (uri?: vscode.Uri) => {
        if (!lockService) {
          void vscode.window.showErrorMessage('Lock service not available.');
          return;
        }
        const targetUri = uri || vscode.window.activeTextEditor?.document.uri;
        if (!targetUri) {
          void vscode.window.showWarningMessage('No file selected to unlock.');
          return;
        }

        const lockInfo = lockService.getLockInfo(targetUri);
        if (lockInfo && lockInfo.path !== targetUri.fsPath) {
          const parentName = lockInfo.path.split(/[\\/]/).pop();
          const action = await vscode.window.showWarningMessage(
            `This file is locked via parent folder "${parentName}". Do you want to unlock the entire folder?`,
            'Unlock Folder',
            'Cancel'
          );
          if (action === 'Unlock Folder') {
            await lockService.unlock(vscode.Uri.file(lockInfo.path));
            void vscode.window.showInformationMessage(`🔓 Unlocked folder: ${parentName}`);
          }
          return;
        }

        const success = await lockService.unlock(targetUri);
        if (success) {
          void vscode.window.showInformationMessage(`🔓 Unlocked: ${targetUri.fsPath.split(/[\\/]/).pop()}`);
          void vscode.commands.executeCommand('setContext', 'vibecheck.isLocked', false);
        } else {
          void vscode.window.showWarningMessage('File was not locked.');
        }
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('vibecheck.unlockFolder', async (uri?: vscode.Uri) => {
        if (!lockService) {
          void vscode.window.showErrorMessage('Lock service not available.');
          return;
        }
        if (!uri) {
          void vscode.window.showWarningMessage('No folder selected to unlock.');
          return;
        }

        const success = await lockService.unlock(uri);
        if (success) {
          void vscode.window.showInformationMessage(`🔓 Unlocked folder: ${uri.fsPath.split(/[\\/]/).pop()}`);
          void vscode.commands.executeCommand('setContext', 'vibecheck.isLocked', false);
        } else {
          void vscode.window.showWarningMessage('Folder was not locked.');
        }
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('vibecheck.toggleLock', async (uri?: vscode.Uri) => {
        if (!lockService) {
          void vscode.window.showErrorMessage('Lock service not available.');
          return;
        }
        const targetUri = uri || vscode.window.activeTextEditor?.document.uri;
        if (!targetUri) {
          void vscode.window.showWarningMessage('No file or folder selected.');
          return;
        }

        if (lockService.isDirectlyLocked(targetUri)) {
          await vscode.commands.executeCommand('vibecheck.unlockFile', targetUri);
        } else {
          await vscode.commands.executeCommand('vibecheck.lockFile', targetUri);
        }
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('vibecheck.showLockedFiles', async () => {
        if (!lockService) {
          void vscode.window.showErrorMessage('Lock service not available.');
          return;
        }
        const locks = lockService.getAllLocks();

        if (locks.length === 0) {
          void vscode.window.showInformationMessage('No files or folders are currently locked.');
          return;
        }

        interface LockItem extends vscode.QuickPickItem {
          lock: typeof locks[0];
        }

        const items: LockItem[] = locks.map(lock => ({
          label: `${lock.type === 'folder' ? '$(folder)' : '$(file)'} ${lock.path.split(/[\\/]/).pop()}`,
          description: lock.path,
          detail: lock.reason ? `Reason: ${lock.reason}` : `Locked at: ${new Date(lock.lockedAt).toLocaleString()}`,
          lock
        }));

        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: `${locks.length} locked item(s)`,
          title: '🔒 Locked Files & Folders',
          canPickMany: true
        });

        if (selected && selected.length > 0) {
          const action = await vscode.window.showQuickPick(
            ['Unlock Selected', 'Open in Explorer', 'Cancel'],
            { placeHolder: 'What would you like to do?' }
          );

          if (action === 'Unlock Selected') {
            for (const item of selected) {
              await lockService.unlock(vscode.Uri.file(item.lock.path));
            }
            void vscode.window.showInformationMessage(`🔓 Unlocked ${selected.length} item(s)`);
          } else if (action === 'Open in Explorer') {
            for (const item of selected) {
              void vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(item.lock.path));
            }
          }
        }
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('vibecheck.unlockAll', async () => {
        if (!lockService) {
          void vscode.window.showErrorMessage('Lock service not available.');
          return;
        }
        const locks = lockService.getAllLocks();

        if (locks.length === 0) {
          void vscode.window.showInformationMessage('No files or folders are currently locked.');
          return;
        }

        const confirm = await vscode.window.showWarningMessage(
          `Unlock all ${locks.length} locked item(s)?`,
          'Unlock All',
          'Cancel'
        );

        if (confirm === 'Unlock All') {
          await lockService.unlockAll();
          void vscode.window.showInformationMessage(`🔓 Unlocked all ${locks.length} item(s)`);
        }
      })
    );

    // Show Sidebar command
    context.subscriptions.push(
      vscode.commands.registerCommand('vibecheck.showSidebar', async () => {
        await vscode.commands.executeCommand('vibecheck.sidebar.focus');
      })
    );

    // ─────────────────────────────────────────────────────────────────────────────
    // Status Bar Integration
    // ─────────────────────────────────────────────────────────────────────────────

    const securityScoreItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
    securityScoreItem.command = 'vibecheck.showSecurityHeatmap';
    securityScoreItem.tooltip = 'Click to view Security Heatmap';
    context.subscriptions.push(securityScoreItem);

    const updateSecurityScore = () => {
      const issues = diagnosticsProvider.getAllIssues();
      const score = reportService.calculateSecurityScore(issues);
      let icon = '$(shield)';
      if (score >= 90) { icon = '$(shield-check)'; }
      else if (score >= 70) { icon = '$(shield)'; }
      else if (score >= 50) { icon = '$(shield-x)'; }
      else { icon = '$(warning)'; }
      securityScoreItem.text = `${icon} ${score}`;
      securityScoreItem.show();
    };

    // ─────────────────────────────────────────────────────────────────────────────
    // Event Handlers
    // ─────────────────────────────────────────────────────────────────────────────

    if (configService.get<boolean>('watchMode')) { enableWatchMode(context, configService); }

    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('vibecheck.watchMode')) {
          if (configService.get<boolean>('watchMode')) { enableWatchMode(context, configService); }
          else { disableWatchMode(); }
        }
      })
    );

    context.subscriptions.push(
      vscode.workspace.onDidSaveTextDocument((document) => {
        void (async () => {
          if (configService.get<boolean>('scanOnSave') && isSupportedLanguage(document)) {
            await scanDocument(document);
            updateSecurityScore();
          }
        })();
      })
    );

    context.subscriptions.push(
      vscode.workspace.onDidOpenTextDocument((document) => {
        void (async () => {
          if (configService.get<boolean>('scanOnOpen') && isSupportedLanguage(document)) {
            await scanDocument(document);
            updateSecurityScore();
          }
        })();
      })
    );

    context.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor) {
          decorationManager.updateDecorations(editor, diagnosticsProvider.getIssuesForFile(editor.document.uri));
          if (codeFlowProvider.isActive()) { codeFlowProvider.updateDecorations(editor); }
          if (securityHeatmapProvider.isActive()) { securityHeatmapProvider.updateDecorations(editor); }
        }
      })
    );

    // ─────────────────────────────────────────────────────────────────────────────
    // Initialize UI
    // ─────────────────────────────────────────────────────────────────────────────

    statusBarManager.show();
    updateSecurityScore();

    // Initialize lock service
    try {
      lockService = new LockService(context);
      lockDecorationProvider = new LockDecorationProvider(lockService);
      context.subscriptions.push(
        vscode.window.registerFileDecorationProvider(lockDecorationProvider)
      );
      Logger.info('Lock service initialized successfully');
    } catch (error) {
      Logger.error('Failed to initialize LockService:', error);
    }

    Logger.info('VibeCheck extension activated successfully');
    outputManager.printSuccess('VibeCheck is ready! Press Cmd+Shift+V to scan.');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : '';
    Logger.error('VibeCheck activation failed:', errorMessage);
    Logger.error('Stack:', errorStack);
    void vscode.window.showErrorMessage(`VibeCheck activation failed: ${errorMessage}`);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════════════════════

async function scanDocument(document: vscode.TextDocument): Promise<void> {
  try {
    const startTime = Date.now();
    statusBarManager.setScanning(true);
    sidebarProvider?.setScanning(true);
    
    const issues = await scannerService.scanFile(document.uri.fsPath, document.getText());
    diagnosticsProvider.setIssues(document.uri, issues);
    issuesTreeProvider.refresh();

    if (vscode.window.activeTextEditor?.document === document) {
      decorationManager.updateDecorations(vscode.window.activeTextEditor, issues);
    }

    const scanTime = Math.round((Date.now() - startTime) / 1000);
    statusBarManager.setScanning(false, issues.length);
    historyTreeProvider.addScan({ file: document.uri.fsPath, timestamp: new Date(), issueCount: issues.length });
    
    // Update sidebar with scan results
    const errors = issues.filter(i => i.severity === 'error').length;
    const warnings = issues.filter(i => i.severity === 'warning').length;
    sidebarProvider?.postScanComplete({
      errors,
      warnings,
      passed: issues.length - errors - warnings,
      files: 1
    }, scanTime);
  } catch (error) {
    Logger.error('Scan failed:', error);
    statusBarManager.setScanning(false);
    sidebarProvider?.setScanning(false);
  }
}

function enableWatchMode(context: vscode.ExtensionContext, configService: ConfigService): void {
  if (watchModeDisposable) { return; }
  const delay = configService.get<number>('watchModeDelay') ?? 1000;
  let timeout: NodeJS.Timeout | undefined;

  watchModeDisposable = vscode.workspace.onDidChangeTextDocument((e) => {
    if (!isSupportedLanguage(e.document)) { return; }
    if (timeout) { clearTimeout(timeout); }
    timeout = setTimeout(() => { void scanDocument(e.document); }, delay);
  });

  context.subscriptions.push(watchModeDisposable);
  Logger.info('Watch mode enabled');
}

function disableWatchMode(): void {
  if (watchModeDisposable) {
    watchModeDisposable.dispose();
    watchModeDisposable = undefined;
    Logger.info('Watch mode disabled');
  }
}

function isSupportedLanguage(document: vscode.TextDocument): boolean {
  return ['typescript', 'typescriptreact', 'javascript', 'javascriptreact', 'python', 'go', 'rust'].includes(document.languageId);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Extension Deactivation
// ═══════════════════════════════════════════════════════════════════════════════

export function deactivate() {
  Logger.info('VibeCheck extension deactivating...');
  diagnosticsProvider?.dispose();
  statusBarManager?.dispose();
  decorationManager?.dispose();
  codeFlowProvider?.dispose();
  securityHeatmapProvider?.dispose();
  lockService?.dispose();
  lockDecorationProvider?.dispose();
}
