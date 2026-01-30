import * as vscode from 'vscode';
import { DiagnosticsProvider, Issue } from './DiagnosticsProvider';

export class VibecheckHoverProvider implements vscode.HoverProvider {
  constructor(private readonly _diagnosticsProvider: DiagnosticsProvider) {}

  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Hover> {
    const issues = this._diagnosticsProvider.getIssuesForFile(document.uri);
    const issueAtPosition = issues.find((issue) => {
      const range = new vscode.Range(
        new vscode.Position(issue.line - 1, issue.column - 1),
        new vscode.Position((issue.endLine ?? issue.line) - 1, (issue.endColumn ?? issue.column + 10) - 1)
      );
      return range.contains(position);
    });

    if (!issueAtPosition) {
      return null;
    }

    return new vscode.Hover(this._createHoverContent(issueAtPosition));
  }

  private _createHoverContent(issue: Issue): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.isTrusted = true;
    md.supportHtml = true;

    // Header with severity badge
    const severityIcon = this._getSeverityIcon(issue.severity);
    const severityColor = this._getSeverityColor(issue.severity);
    
    md.appendMarkdown(`### ${severityIcon} VibeCheck: ${issue.rule}\n\n`);
    
    // Issue message
    md.appendMarkdown(`**${issue.message}**\n\n`);
    
    // Engine info
    md.appendMarkdown(`<span style="color:${severityColor};">●</span> **Engine:** \`${issue.engine}\`\n\n`);
    
    // Code snippet if available
    if (issue.codeSnippet) {
      md.appendMarkdown('**Problematic Code:**\n');
      md.appendCodeblock(issue.codeSnippet, this._getLanguageId(issue.file));
      md.appendMarkdown('\n');
    }

    // Suggestion
    if (issue.suggestion) {
      md.appendMarkdown(`💡 **Suggestion:** ${issue.suggestion}\n\n`);
    }

    // AI Fix section
    if (issue.aiFixAvailable) {
      md.appendMarkdown(`✨ **AI Fix Available** - `);
      md.appendMarkdown(`[Apply Fix](command:vibecheck.fix?${encodeURIComponent(JSON.stringify({ issueId: issue.id }))})`);
      md.appendMarkdown('\n\n');
    }

    // Quick actions
    md.appendMarkdown('---\n\n');
    md.appendMarkdown(`[🔧 Fix](command:vibecheck.fix?${encodeURIComponent(JSON.stringify({ issueId: issue.id }))}) | `);
    md.appendMarkdown(`[🚫 Ignore](command:vibecheck.ignoreIssue?${encodeURIComponent(JSON.stringify({ issueId: issue.id }))}) | `);
    md.appendMarkdown(`[📖 Learn More](command:vibecheck.showIssueDetails?${encodeURIComponent(JSON.stringify({ issueId: issue.id }))})`);

    // Documentation link
    if (issue.documentationUrl) {
      md.appendMarkdown(` | [📚 Docs](${issue.documentationUrl})`);
    }

    return md;
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

  private _getLanguageId(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'ts':
      case 'tsx':
        return 'typescript';
      case 'js':
      case 'jsx':
        return 'javascript';
      case 'py':
        return 'python';
      case 'go':
        return 'go';
      case 'rs':
        return 'rust';
      default:
        return 'plaintext';
    }
  }
}
