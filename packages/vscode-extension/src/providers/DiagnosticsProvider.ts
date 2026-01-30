import * as vscode from 'vscode';

export interface Issue {
  id: string;
  file: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  message: string;
  severity: 'error' | 'warning' | 'info' | 'hint';
  rule: string;
  engine: string;
  suggestion?: string;
  codeSnippet?: string;
  aiFixAvailable?: boolean;
  documentationUrl?: string;
  fixable?: boolean;
  fix?: {
    range: { start: { line: number; column: number }; end: { line: number; column: number } };
    replacement: string;
  };
}

export class DiagnosticsProvider implements vscode.Disposable {
  private readonly _diagnosticCollection: vscode.DiagnosticCollection;
  private readonly _issuesByFile: Map<string, Issue[]> = new Map();
  private readonly _onDidChangeDiagnostics = new vscode.EventEmitter<void>();
  public readonly onDidChangeDiagnostics = this._onDidChangeDiagnostics.event;

  constructor() {
    this._diagnosticCollection = vscode.languages.createDiagnosticCollection('vibecheck');
  }

  public setIssues(uri: vscode.Uri, issues: Issue[]): void {
    const diagnostics: vscode.Diagnostic[] = issues.map((issue) => {
      const range = new vscode.Range(
        issue.line - 1,
        issue.column - 1,
        (issue.endLine ?? issue.line) - 1,
        (issue.endColumn ?? issue.column + 10) - 1
      );

      const diagnostic = new vscode.Diagnostic(
        range,
        issue.message,
        this._mapSeverity(issue.severity)
      );

      diagnostic.code = {
        value: issue.rule,
        target: vscode.Uri.parse(`https://vibecheck.dev/rules/${issue.rule}`),
      };
      diagnostic.source = `VibeCheck (${issue.engine})`;

      // Add related information if available
      if (issue.suggestion) {
        diagnostic.relatedInformation = [
          new vscode.DiagnosticRelatedInformation(
            new vscode.Location(uri, range),
            `💡 Suggestion: ${issue.suggestion}`
          ),
        ];
      }

      // Mark as fixable if available
      if (issue.fixable) {
        diagnostic.tags = [vscode.DiagnosticTag.Unnecessary];
      }

      return diagnostic;
    });

    this._diagnosticCollection.set(uri, diagnostics);
    this._issuesByFile.set(uri.fsPath, issues);
    this._onDidChangeDiagnostics.fire();
  }

  public getIssuesForFile(uri: vscode.Uri): Issue[] {
    return this._issuesByFile.get(uri.fsPath) ?? [];
  }

  public getAllIssues(): Issue[] {
    const allIssues: Issue[] = [];
    for (const issues of this._issuesByFile.values()) {
      allIssues.push(...issues);
    }
    return allIssues;
  }

  public getIssueById(id: string): Issue | undefined {
    for (const issues of this._issuesByFile.values()) {
      const found = issues.find(issue => issue.id === id);
      if (found) {
        return found;
      }
    }
    return undefined;
  }

  public getIssueAtPosition(uri: vscode.Uri, position: vscode.Position): Issue | undefined {
    const issues = this._issuesByFile.get(uri.fsPath);
    if (!issues) {
      return undefined;
    }

    return issues.find((issue) => {
      const startLine = issue.line - 1;
      const endLine = (issue.endLine ?? issue.line) - 1;
      return position.line >= startLine && position.line <= endLine;
    });
  }

  public getStats(): {
    errors: number;
    warnings: number;
    info: number;
    files: number;
    passed: number;
  } {
    let errors = 0;
    let warnings = 0;
    let info = 0;
    let passed = 0;
    let files = 0;

    for (const [_, issues] of this._issuesByFile) {
      files++;
      let fileHasIssues = false;

      for (const issue of issues) {
        fileHasIssues = true;
        switch (issue.severity) {
          case 'error':
            errors++;
            break;
          case 'warning':
            warnings++;
            break;
          case 'info':
          case 'hint':
            info++;
            break;
        }
      }

      if (!fileHasIssues) {
        passed++;
      }
    }

    return { errors, warnings, info, files, passed };
  }

  public clearFile(uri: vscode.Uri): void {
    this._diagnosticCollection.delete(uri);
    this._issuesByFile.delete(uri.fsPath);
    this._onDidChangeDiagnostics.fire();
  }

  public clearAll(): void {
    this._diagnosticCollection.clear();
    this._issuesByFile.clear();
    this._onDidChangeDiagnostics.fire();
  }

  private _mapSeverity(severity: Issue['severity']): vscode.DiagnosticSeverity {
    const config = vscode.workspace.getConfiguration('vibecheck');

    switch (severity) {
      case 'error': {
        const mapped = config.get<string>('severity.error') ?? 'Error';
        return this._stringToSeverity(mapped);
      }
      case 'warning': {
        const mapped = config.get<string>('severity.warning') ?? 'Warning';
        return this._stringToSeverity(mapped);
      }
      case 'info':
        return vscode.DiagnosticSeverity.Information;
      case 'hint':
        return vscode.DiagnosticSeverity.Hint;
      default:
        return vscode.DiagnosticSeverity.Warning;
    }
  }

  private _stringToSeverity(severity: string): vscode.DiagnosticSeverity {
    switch (severity) {
      case 'Error':
        return vscode.DiagnosticSeverity.Error;
      case 'Warning':
        return vscode.DiagnosticSeverity.Warning;
      case 'Information':
        return vscode.DiagnosticSeverity.Information;
      case 'Hint':
        return vscode.DiagnosticSeverity.Hint;
      default:
        return vscode.DiagnosticSeverity.Warning;
    }
  }

  public dispose(): void {
    this._diagnosticCollection.dispose();
    this._onDidChangeDiagnostics.dispose();
  }
}
