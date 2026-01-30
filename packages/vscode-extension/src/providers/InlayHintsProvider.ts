import * as vscode from 'vscode';
import { DiagnosticsProvider, Issue } from './DiagnosticsProvider';

export class VibecheckInlayHintsProvider implements vscode.InlayHintsProvider {
  private _onDidChangeInlayHints: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  public readonly onDidChangeInlayHints: vscode.Event<void> = this._onDidChangeInlayHints.event;

  constructor(private readonly _diagnosticsProvider: DiagnosticsProvider) {
    _diagnosticsProvider.onDidChangeDiagnostics(() => {
      this._onDidChangeInlayHints.fire();
    });
  }

  provideInlayHints(
    document: vscode.TextDocument,
    range: vscode.Range,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.InlayHint[]> {
    const config = vscode.workspace.getConfiguration('vibecheck');
    if (!config.get<boolean>('showInlineHints', true)) {
      return [];
    }

    const issues = this._diagnosticsProvider.getIssuesForFile(document.uri);
    const hints: vscode.InlayHint[] = [];

    for (const issue of issues) {
      const issueLine = issue.line - 1;
      
      // Only show hints in the visible range
      if (issueLine < range.start.line || issueLine > range.end.line) {
        continue;
      }

      // Get the end of the line for positioning
      const line = document.lineAt(issueLine);
      const position = new vscode.Position(issueLine, line.text.length);

      // Create the inlay hint
      const hint = new vscode.InlayHint(
        position,
        this._createHintLabel(issue),
        vscode.InlayHintKind.Parameter
      );

      hint.paddingLeft = true;
      hint.tooltip = this._createTooltip(issue);

      hints.push(hint);
    }

    return hints;
  }

  private _createHintLabel(issue: Issue): vscode.InlayHintLabelPart[] {
    const severityIcon = this._getSeverityIcon(issue.severity);
    const color = this._getSeverityColor(issue.severity);

    const parts: vscode.InlayHintLabelPart[] = [];

    // Icon part with command
    const iconPart = new vscode.InlayHintLabelPart(severityIcon + ' ');
    iconPart.command = {
      title: 'Show Details',
      command: 'vibecheck.showIssueDetails',
      arguments: [{ issueId: issue.id }],
    };
    parts.push(iconPart);

    // Rule name part
    const rulePart = new vscode.InlayHintLabelPart(issue.rule);
    rulePart.command = {
      title: 'Show Details',
      command: 'vibecheck.showIssueDetails',
      arguments: [{ issueId: issue.id }],
    };
    parts.push(rulePart);

    // Fix action if available
    if (issue.aiFixAvailable || issue.suggestion) {
      const fixPart = new vscode.InlayHintLabelPart(' [fix]');
      fixPart.command = {
        title: 'Apply Fix',
        command: 'vibecheck.fix',
        arguments: [{ issueId: issue.id }],
      };
      parts.push(fixPart);
    }

    return parts;
  }

  private _createTooltip(issue: Issue): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.isTrusted = true;

    md.appendMarkdown(`**${issue.message}**\n\n`);
    md.appendMarkdown(`Engine: \`${issue.engine}\`\n\n`);

    if (issue.suggestion) {
      md.appendMarkdown(`💡 ${issue.suggestion}\n\n`);
    }

    md.appendMarkdown(`[Fix](command:vibecheck.fix?${encodeURIComponent(JSON.stringify({ issueId: issue.id }))}) `);
    md.appendMarkdown(`| [Ignore](command:vibecheck.ignoreIssue?${encodeURIComponent(JSON.stringify({ issueId: issue.id }))})`);

    return md;
  }

  private _getSeverityIcon(severity: string): string {
    switch (severity.toLowerCase()) {
      case 'error':
        return '⛔';
      case 'warning':
        return '⚠️';
      case 'info':
        return 'ℹ️';
      default:
        return '•';
    }
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

  refresh(): void {
    this._onDidChangeInlayHints.fire();
  }
}
