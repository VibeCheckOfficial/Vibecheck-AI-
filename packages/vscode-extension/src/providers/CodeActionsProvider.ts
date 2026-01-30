import * as vscode from 'vscode';
import { ScannerService } from '../services/ScannerService';
import { DiagnosticsProvider, Issue } from './DiagnosticsProvider';

export class CodeActionsProvider implements vscode.CodeActionProvider {
  public static readonly providedCodeActionKinds = [
    vscode.CodeActionKind.QuickFix,
    vscode.CodeActionKind.Source,
  ];

  constructor(
    private readonly _scannerService: ScannerService,
    private readonly _diagnosticsProvider: DiagnosticsProvider
  ) {}

  public provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    _token: vscode.CancellationToken
  ): vscode.CodeAction[] | undefined {
    const actions: vscode.CodeAction[] = [];

    // Get VibeCheck diagnostics only
    const vibecheckDiagnostics = context.diagnostics.filter(
      (d) => d.source?.startsWith('VibeCheck')
    );

    for (const diagnostic of vibecheckDiagnostics) {
      const issue = this._diagnosticsProvider.getIssueAtPosition(
        document.uri,
        diagnostic.range.start
      );

      if (!issue) {
        continue;
      }

      // Quick fix if available
      if (issue.fixable && issue.fix) {
        const fixAction = new vscode.CodeAction(
          `✨ Fix: ${issue.message}`,
          vscode.CodeActionKind.QuickFix
        );
        fixAction.edit = new vscode.WorkspaceEdit();
        const fixRange = new vscode.Range(
          issue.fix.range.start.line - 1,
          issue.fix.range.start.column - 1,
          issue.fix.range.end.line - 1,
          issue.fix.range.end.column - 1
        );
        fixAction.edit.replace(document.uri, fixRange, issue.fix.replacement);
        fixAction.isPreferred = true;
        fixAction.diagnostics = [diagnostic];
        actions.push(fixAction);
      }

      // AI-powered fix
      const aiFixAction = new vscode.CodeAction(
        `🤖 AI Fix: ${issue.rule}`,
        vscode.CodeActionKind.QuickFix
      );
      aiFixAction.command = {
        command: 'vibecheck.aiFixIssue',
        title: 'AI Fix Issue',
        arguments: [document.uri, issue],
      };
      aiFixAction.diagnostics = [diagnostic];
      actions.push(aiFixAction);

      // Ignore this issue
      const ignoreAction = new vscode.CodeAction(
        `Ignore this ${issue.rule} issue`,
        vscode.CodeActionKind.QuickFix
      );
      ignoreAction.command = {
        command: 'vibecheck.ignoreIssue',
        title: 'Ignore Issue',
        arguments: [issue.id],
      };
      ignoreAction.diagnostics = [diagnostic];
      actions.push(ignoreAction);

      // Ignore rule in file
      const ignoreRuleAction = new vscode.CodeAction(
        `Disable ${issue.rule} for this file`,
        vscode.CodeActionKind.QuickFix
      );
      ignoreRuleAction.edit = new vscode.WorkspaceEdit();
      const firstLine = document.lineAt(0);
      const comment = this._getDisableComment(document.languageId, issue.rule);
      ignoreRuleAction.edit.insert(document.uri, firstLine.range.start, comment + '\n');
      ignoreRuleAction.diagnostics = [diagnostic];
      actions.push(ignoreRuleAction);

      // Show issue details
      const detailsAction = new vscode.CodeAction(
        `ℹ️ Show details for ${issue.rule}`,
        vscode.CodeActionKind.QuickFix
      );
      detailsAction.command = {
        command: 'vibecheck.showIssueDetails',
        title: 'Show Issue Details',
        arguments: [issue],
      };
      detailsAction.diagnostics = [diagnostic];
      actions.push(detailsAction);
    }

    // Source actions (apply to whole file)
    if (vibecheckDiagnostics.length > 0) {
      const fixAllAction = new vscode.CodeAction(
        'Fix all VibeCheck issues in file',
        vscode.CodeActionKind.Source
      );
      fixAllAction.command = {
        command: 'vibecheck.fixAll',
        title: 'Fix All Issues',
        arguments: [document.uri],
      };
      actions.push(fixAllAction);
    }

    return actions;
  }

  private _getDisableComment(languageId: string, rule: string): string {
    switch (languageId) {
      case 'javascript':
      case 'typescript':
      case 'javascriptreact':
      case 'typescriptreact':
        return `// vibecheck-disable-next-line ${rule}`;
      case 'python':
        return `# vibecheck-disable-next-line ${rule}`;
      case 'go':
        return `// vibecheck-disable-next-line ${rule}`;
      case 'rust':
        return `// vibecheck-disable-next-line ${rule}`;
      default:
        return `// vibecheck-disable-next-line ${rule}`;
    }
  }
}
