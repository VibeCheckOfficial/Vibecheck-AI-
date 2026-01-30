import * as vscode from 'vscode';
import { Issue } from '../providers/DiagnosticsProvider';

export class DecorationManager implements vscode.Disposable {
  private readonly _errorDecorationType: vscode.TextEditorDecorationType;
  private readonly _warningDecorationType: vscode.TextEditorDecorationType;
  private readonly _infoDecorationType: vscode.TextEditorDecorationType;
  private readonly _gutterDecorationType: vscode.TextEditorDecorationType;

  constructor() {
    this._errorDecorationType = vscode.window.createTextEditorDecorationType({
      backgroundColor: 'rgba(255, 92, 92, 0.15)',
      borderRadius: '3px',
      overviewRulerColor: '#ff5c5c',
      overviewRulerLane: vscode.OverviewRulerLane.Right,
      isWholeLine: false,
      after: {
        contentText: ' ← error',
        color: 'rgba(255, 92, 92, 0.6)',
        fontStyle: 'italic',
        margin: '0 0 0 20px',
      },
    });

    this._warningDecorationType = vscode.window.createTextEditorDecorationType({
      backgroundColor: 'rgba(255, 204, 0, 0.12)',
      borderRadius: '3px',
      overviewRulerColor: '#ffcc00',
      overviewRulerLane: vscode.OverviewRulerLane.Right,
      isWholeLine: false,
      after: {
        contentText: ' ← warning',
        color: 'rgba(255, 204, 0, 0.6)',
        fontStyle: 'italic',
        margin: '0 0 0 20px',
      },
    });

    this._infoDecorationType = vscode.window.createTextEditorDecorationType({
      backgroundColor: 'rgba(92, 156, 255, 0.1)',
      borderRadius: '3px',
      overviewRulerColor: '#5c9cff',
      overviewRulerLane: vscode.OverviewRulerLane.Right,
      isWholeLine: false,
    });

    this._gutterDecorationType = vscode.window.createTextEditorDecorationType({
      gutterIconPath: vscode.Uri.parse(
        'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNiIgaGVpZ2h0PSIxNiIgdmlld0JveD0iMCAwIDE2IDE2Ij48Y2lyY2xlIGN4PSI4IiBjeT0iOCIgcj0iNCIgZmlsbD0iI2ZmNWM1YyIvPjwvc3ZnPg=='
      ),
      gutterIconSize: '60%',
    });
  }

  public updateDecorations(editor: vscode.TextEditor, issues: Issue[]): void {
    const config = vscode.workspace.getConfiguration('vibecheck');
    if (!config.get<boolean>('decorations.enabled')) {
      this.clearDecorations(editor);
      return;
    }

    const errorDecorations: vscode.DecorationOptions[] = [];
    const warningDecorations: vscode.DecorationOptions[] = [];
    const infoDecorations: vscode.DecorationOptions[] = [];
    const gutterDecorations: vscode.DecorationOptions[] = [];

    for (const issue of issues) {
      const startPos = new vscode.Position(issue.line - 1, issue.column - 1);
      const endPos = new vscode.Position(
        (issue.endLine ?? issue.line) - 1,
        (issue.endColumn ?? issue.column + 20) - 1
      );
      const range = new vscode.Range(startPos, endPos);

      const decoration: vscode.DecorationOptions = {
        range,
        hoverMessage: this._createHoverMessage(issue),
      };

      switch (issue.severity) {
        case 'error':
          errorDecorations.push({
            ...decoration,
            renderOptions: {
              after: {
                contentText: ` ← ${issue.rule}`,
              },
            },
          });
          gutterDecorations.push({ range: new vscode.Range(startPos, startPos) });
          break;
        case 'warning':
          warningDecorations.push({
            ...decoration,
            renderOptions: {
              after: {
                contentText: ` ← ${issue.rule}`,
              },
            },
          });
          break;
        case 'info':
        case 'hint':
          infoDecorations.push(decoration);
          break;
      }
    }

    editor.setDecorations(this._errorDecorationType, errorDecorations);
    editor.setDecorations(this._warningDecorationType, warningDecorations);
    editor.setDecorations(this._infoDecorationType, infoDecorations);
    editor.setDecorations(this._gutterDecorationType, gutterDecorations);
  }

  public clearDecorations(editor: vscode.TextEditor): void {
    editor.setDecorations(this._errorDecorationType, []);
    editor.setDecorations(this._warningDecorationType, []);
    editor.setDecorations(this._infoDecorationType, []);
    editor.setDecorations(this._gutterDecorationType, []);
  }

  public clearAll(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      this.clearDecorations(editor);
    }
  }

  private _createHoverMessage(issue: Issue): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.isTrusted = true;
    md.supportHtml = true;

    const severityIcon = {
      error: '🔴',
      warning: '🟡',
      info: '🔵',
      hint: '💡',
    }[issue.severity];

    md.appendMarkdown(`### ${severityIcon} ${issue.rule}\n\n`);
    md.appendMarkdown(`${issue.message}\n\n`);
    md.appendMarkdown(`**Engine:** ${issue.engine}\n\n`);

    if (issue.suggestion) {
      md.appendMarkdown(`**💡 Suggestion:** ${issue.suggestion}\n\n`);
    }

    md.appendMarkdown(`---\n\n`);
    md.appendMarkdown(
      `[$(sparkle) Fix](command:vibecheck.fix?${encodeURIComponent(
        JSON.stringify(issue)
      )}) | `
    );
    md.appendMarkdown(
      `[$(eye-closed) Ignore](command:vibecheck.ignoreIssue?${encodeURIComponent(
        JSON.stringify(issue.id)
      )}) | `
    );
    md.appendMarkdown(
      `[$(info) Details](command:vibecheck.showIssueDetails?${encodeURIComponent(
        JSON.stringify(issue)
      )})`
    );

    return md;
  }

  public dispose(): void {
    this._errorDecorationType.dispose();
    this._warningDecorationType.dispose();
    this._infoDecorationType.dispose();
    this._gutterDecorationType.dispose();
  }
}
