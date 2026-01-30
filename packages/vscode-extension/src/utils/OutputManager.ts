import * as vscode from 'vscode';
import { Issue } from '../providers/DiagnosticsProvider';

export class OutputManager {
  private static _instance: OutputManager;
  private readonly _outputChannel: vscode.OutputChannel;
  private readonly _logChannel: vscode.LogOutputChannel;

  private constructor() {
    this._outputChannel = vscode.window.createOutputChannel('VibeCheck');
    this._logChannel = vscode.window.createOutputChannel('VibeCheck Logs', { log: true });
  }

  public static getInstance(): OutputManager {
    if (!OutputManager._instance) {
      OutputManager._instance = new OutputManager();
    }
    return OutputManager._instance;
  }

  public show(): void {
    this._outputChannel.show(true);
  }

  public clear(): void {
    this._outputChannel.clear();
  }

  public printHeader(): void {
    this._outputChannel.appendLine('');
    this._outputChannel.appendLine('╔══════════════════════════════════════════════════════════════╗');
    this._outputChannel.appendLine('║                                                              ║');
    this._outputChannel.appendLine('║   ██╗   ██╗██╗██████╗ ███████╗ ██████╗██╗  ██╗███████╗██╗  ██╗   ║');
    this._outputChannel.appendLine('║   ██║   ██║██║██╔══██╗██╔════╝██╔════╝██║  ██║██╔════╝██║ ██╔╝   ║');
    this._outputChannel.appendLine('║   ██║   ██║██║██████╔╝█████╗  ██║     ███████║█████╗  █████╔╝    ║');
    this._outputChannel.appendLine('║   ╚██╗ ██╔╝██║██╔══██╗██╔══╝  ██║     ██╔══██║██╔══╝  ██╔═██╗    ║');
    this._outputChannel.appendLine('║    ╚████╔╝ ██║██████╔╝███████╗╚██████╗██║  ██║███████╗██║  ██╗   ║');
    this._outputChannel.appendLine('║     ╚═══╝  ╚═╝╚═════╝ ╚══════╝ ╚═════╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝   ║');
    this._outputChannel.appendLine('║                                                              ║');
    this._outputChannel.appendLine('║              AI Code Security Scanner v1.0.0                 ║');
    this._outputChannel.appendLine('╚══════════════════════════════════════════════════════════════╝');
    this._outputChannel.appendLine('');
  }

  public printScanStart(target: string, isWorkspace: boolean = false): void {
    const timestamp = new Date().toLocaleTimeString();
    this._outputChannel.appendLine(`┌─────────────────────────────────────────────────────────────────┐`);
    this._outputChannel.appendLine(`│ SCAN STARTED at ${timestamp.padEnd(46)}│`);
    this._outputChannel.appendLine(`├─────────────────────────────────────────────────────────────────┤`);
    this._outputChannel.appendLine(`│ Target: ${(isWorkspace ? 'Workspace' : target).slice(0, 53).padEnd(54)}│`);
    this._outputChannel.appendLine(`│ Mode: ${(isWorkspace ? 'Full Workspace Scan' : 'Single File').padEnd(56)}│`);
    this._outputChannel.appendLine(`└─────────────────────────────────────────────────────────────────┘`);
    this._outputChannel.appendLine('');
  }

  public printProgress(current: number, total: number, fileName: string): void {
    const percentage = Math.round((current / total) * 100);
    const barLength = 30;
    const filledLength = Math.round((percentage / 100) * barLength);
    const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);
    
    // Use carriage return to update same line (note: VS Code output may not support this perfectly)
    this._outputChannel.appendLine(`[${bar}] ${percentage}% - ${fileName.slice(-40)}`);
  }

  public printEngineStart(engine: string): void {
    this._outputChannel.appendLine(`  ▶ Running ${engine} engine...`);
  }

  public printEngineComplete(engine: string, issueCount: number): void {
    const status = issueCount > 0 ? `⚠ ${issueCount} issue(s)` : '✓ Clean';
    this._outputChannel.appendLine(`  ✓ ${engine}: ${status}`);
  }

  public printIssue(issue: Issue, index: number): void {
    const severityIcon = this._getSeverityIcon(issue.severity);
    const severityLabel = this._getSeverityLabel(issue.severity);
    
    this._outputChannel.appendLine('');
    this._outputChannel.appendLine(`  ${severityIcon} Issue #${index + 1}: ${issue.rule}`);
    this._outputChannel.appendLine(`  ├── Severity: ${severityLabel}`);
    this._outputChannel.appendLine(`  ├── Location: ${issue.file}:${issue.line}:${issue.column}`);
    this._outputChannel.appendLine(`  ├── Engine: ${issue.engine}`);
    this._outputChannel.appendLine(`  ├── Message: ${issue.message}`);
    
    if (issue.suggestion) {
      this._outputChannel.appendLine(`  └── Suggestion: ${issue.suggestion}`);
    } else {
      this._outputChannel.appendLine(`  └── (No suggestion available)`);
    }
  }

  public printIssuesSummary(issues: Issue[]): void {
    const errors = issues.filter(i => i.severity === 'error').length;
    const warnings = issues.filter(i => i.severity === 'warning').length;
    const info = issues.filter(i => i.severity === 'info').length;

    this._outputChannel.appendLine('');
    this._outputChannel.appendLine('┌─────────────────────────────────────────────────────────────────┐');
    this._outputChannel.appendLine('│                        SCAN SUMMARY                             │');
    this._outputChannel.appendLine('├─────────────────────────────────────────────────────────────────┤');
    
    if (issues.length === 0) {
      this._outputChannel.appendLine('│                                                                 │');
      this._outputChannel.appendLine('│     ✅ ALL CLEAR! No issues detected.                          │');
      this._outputChannel.appendLine('│                                                                 │');
    } else {
      this._outputChannel.appendLine(`│  🔴 Errors:   ${errors.toString().padEnd(49)}│`);
      this._outputChannel.appendLine(`│  🟡 Warnings: ${warnings.toString().padEnd(49)}│`);
      this._outputChannel.appendLine(`│  🔵 Info:     ${info.toString().padEnd(49)}│`);
      this._outputChannel.appendLine('│─────────────────────────────────────────────────────────────────│');
      this._outputChannel.appendLine(`│  Total:       ${issues.length.toString().padEnd(49)}│`);
    }
    
    this._outputChannel.appendLine('└─────────────────────────────────────────────────────────────────┘');
  }

  public printByEngine(issues: Issue[]): void {
    const byEngine = new Map<string, Issue[]>();
    for (const issue of issues) {
      if (!byEngine.has(issue.engine)) {
        byEngine.set(issue.engine, []);
      }
      byEngine.get(issue.engine)!.push(issue);
    }

    if (byEngine.size === 0) {
      return;
    }

    this._outputChannel.appendLine('');
    this._outputChannel.appendLine('Issues by Engine:');
    this._outputChannel.appendLine('─────────────────');

    for (const [engine, engineIssues] of byEngine) {
      const errors = engineIssues.filter(i => i.severity === 'error').length;
      const warnings = engineIssues.filter(i => i.severity === 'warning').length;
      this._outputChannel.appendLine(`  ${engine}: ${errors} errors, ${warnings} warnings`);
    }
  }

  public printScanComplete(duration: number): void {
    const timestamp = new Date().toLocaleTimeString();
    this._outputChannel.appendLine('');
    this._outputChannel.appendLine(`Scan completed at ${timestamp} (${duration}ms)`);
    this._outputChannel.appendLine('─────────────────────────────────────────────────────────────────');
  }

  public printError(message: string, error?: Error): void {
    this._outputChannel.appendLine('');
    this._outputChannel.appendLine(`❌ ERROR: ${message}`);
    if (error) {
      this._outputChannel.appendLine(`   ${error.message}`);
      if (error.stack) {
        this._logChannel.error(error.stack);
      }
    }
  }

  public printInfo(message: string): void {
    this._outputChannel.appendLine(`ℹ️  ${message}`);
  }

  public printSuccess(message: string): void {
    this._outputChannel.appendLine(`✅ ${message}`);
  }

  public printWarning(message: string): void {
    this._outputChannel.appendLine(`⚠️  ${message}`);
  }

  // Logging methods (debug level)
  public debug(message: string): void {
    this._logChannel.debug(message);
  }

  public info(message: string): void {
    this._logChannel.info(message);
  }

  public warn(message: string): void {
    this._logChannel.warn(message);
  }

  public error(message: string, error?: Error): void {
    this._logChannel.error(message);
    if (error) {
      this._logChannel.error(error);
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

  private _getSeverityLabel(severity: string): string {
    switch (severity.toLowerCase()) {
      case 'error':
        return 'ERROR';
      case 'warning':
        return 'WARNING';
      case 'info':
        return 'INFO';
      default:
        return 'UNKNOWN';
    }
  }

  public dispose(): void {
    this._outputChannel.dispose();
    this._logChannel.dispose();
  }
}
