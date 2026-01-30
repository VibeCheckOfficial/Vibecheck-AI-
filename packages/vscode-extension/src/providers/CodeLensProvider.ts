import * as vscode from 'vscode';
import { DiagnosticsProvider, Issue } from './DiagnosticsProvider';

export class VibecheckCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

  constructor(private readonly _diagnosticsProvider: DiagnosticsProvider) {
    // Refresh code lenses when diagnostics change
    _diagnosticsProvider.onDidChangeDiagnostics(() => {
      this._onDidChangeCodeLenses.fire();
    });
  }

  provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.CodeLens[]> {
    const issues = this._diagnosticsProvider.getIssuesForFile(document.uri);
    
    if (issues.length === 0) {
      return [];
    }

    const codeLenses: vscode.CodeLens[] = [];
    
    // Group issues by line
    const issuesByLine = new Map<number, Issue[]>();
    for (const issue of issues) {
      const line = issue.line - 1; // Convert to 0-indexed
      if (!issuesByLine.has(line)) {
        issuesByLine.set(line, []);
      }
      issuesByLine.get(line)!.push(issue);
    }

    // Create code lenses for each line with issues
    for (const [line, lineIssues] of issuesByLine) {
      const range = new vscode.Range(line, 0, line, 0);
      
      // Count by severity
      const errors = lineIssues.filter(i => i.severity === 'error').length;
      const warnings = lineIssues.filter(i => i.severity === 'warning').length;
      
      // Main issue indicator
      const mainLens = new vscode.CodeLens(range);
      codeLenses.push(mainLens);

      // Quick fix lens if available
      const fixableIssues = lineIssues.filter(i => i.aiFixAvailable || i.suggestion);
      if (fixableIssues.length > 0) {
        const fixLens = new vscode.CodeLens(range);
        codeLenses.push(fixLens);
      }
    }

    // Add file-level summary lens at top
    if (issues.length > 0) {
      const summaryRange = new vscode.Range(0, 0, 0, 0);
      const summaryLens = new vscode.CodeLens(summaryRange);
      codeLenses.unshift(summaryLens);
    }

    return codeLenses;
  }

  resolveCodeLens(
    codeLens: vscode.CodeLens,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.CodeLens> {
    const document = vscode.window.activeTextEditor?.document;
    if (!document) {
      return codeLens;
    }

    const issues = this._diagnosticsProvider.getIssuesForFile(document.uri);
    const line = codeLens.range.start.line;
    
    // File summary lens (line 0, first lens)
    if (line === 0) {
      const errors = issues.filter(i => i.severity === 'error').length;
      const warnings = issues.filter(i => i.severity === 'warning').length;
      
      let title = '✓ VibeCheck: ';
      const parts: string[] = [];
      
      if (errors > 0) {
        parts.push(`${errors} error${errors > 1 ? 's' : ''}`);
      }
      if (warnings > 0) {
        parts.push(`${warnings} warning${warnings > 1 ? 's' : ''}`);
      }
      
      if (parts.length === 0) {
        return null; // No lens needed
      }
      
      title += parts.join(', ');
      
      codeLens.command = {
        title,
        command: 'vibecheck.openDashboard',
        tooltip: 'Open VibeCheck Dashboard',
      };
      
      return codeLens;
    }

    // Line-specific lens
    const lineIssues = issues.filter(i => i.line - 1 === line);
    
    if (lineIssues.length === 0) {
      return null;
    }

    const errors = lineIssues.filter(i => i.severity === 'error').length;
    const warnings = lineIssues.filter(i => i.severity === 'warning').length;
    
    // Determine which lens this is (indicator or fix)
    const issueIndex = issues.filter(i => i.line - 1 < line).length;
    const isFixLens = codeLens.range.start.character > 0 || 
      (lineIssues.some(i => i.aiFixAvailable || i.suggestion));

    if (!isFixLens || errors + warnings === 0) {
      // Issue indicator lens
      let icon = '⚠️';
      if (errors > 0) {
        icon = '🔴';
      } else if (warnings > 0) {
        icon = '🟡';
      }

      const issueText = lineIssues.map(i => i.rule).join(', ');
      
      codeLens.command = {
        title: `${icon} ${issueText}`,
        command: 'vibecheck.showIssueDetails',
        arguments: [{ issueId: lineIssues[0].id }],
        tooltip: lineIssues.map(i => i.message).join('\n'),
      };
    } else {
      // Fix lens
      const fixableCount = lineIssues.filter(i => i.aiFixAvailable || i.suggestion).length;
      
      codeLens.command = {
        title: `✨ Fix ${fixableCount > 1 ? `(${fixableCount})` : ''}`,
        command: 'vibecheck.fix',
        arguments: [{ line: line + 1 }],
        tooltip: 'Apply AI-powered fix',
      };
    }

    return codeLens;
  }

  refresh(): void {
    this._onDidChangeCodeLenses.fire();
  }
}
