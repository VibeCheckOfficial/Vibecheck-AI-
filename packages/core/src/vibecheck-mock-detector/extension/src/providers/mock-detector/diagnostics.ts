// extension/src/providers/mock-detector/diagnostics.ts

import * as vscode from 'vscode';
import { scan } from '../../../../src/scanner/engines/mock-detector';
import { PATTERNS } from '../../../../src/scanner/engines/mock-detector/patterns';
import type { Finding, ScanResult, Severity } from '../../../../src/scanner/engines/mock-detector/types';

export class MockDetectorDiagnostics implements vscode.Disposable {
  private diagnosticCollection: vscode.DiagnosticCollection;
  private disposables: vscode.Disposable[] = [];
  private scanResults: Map<string, Finding[]> = new Map();
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private statusBarItem: vscode.StatusBarItem;

  constructor() {
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection('vibecheck-mocks');
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.statusBarItem.command = 'vibecheck.showReport';

    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument(e => this.onDocumentChange(e)),
      vscode.workspace.onDidOpenTextDocument(doc => this.scanDocument(doc)),
      vscode.workspace.onDidSaveTextDocument(doc => this.scanDocument(doc, true)),
      vscode.window.onDidChangeActiveTextEditor(e => {
        if (e?.document) this.updateStatusBar(e.document.uri);
      })
    );

    vscode.workspace.textDocuments.forEach(doc => this.scanDocument(doc));
  }

  private onDocumentChange(event: vscode.TextDocumentChangeEvent): void {
    const uri = event.document.uri.toString();
    const existingTimer = this.debounceTimers.get(uri);
    if (existingTimer) clearTimeout(existingTimer);

    const timer = setTimeout(() => {
      this.scanDocument(event.document);
      this.debounceTimers.delete(uri);
    }, 500);

    this.debounceTimers.set(uri, timer);
  }

  async scanDocument(document: vscode.TextDocument, force = false): Promise<void> {
    if (!this.isRelevantFile(document)) return;
    if (this.shouldIgnore(document.uri.fsPath)) return;

    const uri = document.uri;
    const content = document.getText();
    const findings: Finding[] = [];
    const lines = content.split('\n');

    for (const pattern of PATTERNS) {
      const regex = new RegExp(pattern.pattern.source, pattern.pattern.flags);
      let match;

      while ((match = regex.exec(content)) !== null) {
        const beforeMatch = content.slice(0, match.index);
        const lineNumber = beforeMatch.split('\n').length;
        const lastNewline = beforeMatch.lastIndexOf('\n');
        const column = match.index - lastNewline;

        findings.push({
          id: pattern.id,
          file: document.uri.fsPath,
          line: lineNumber,
          column,
          code: lines[lineNumber - 1]?.trim() || match[0],
          category: pattern.category,
          severity: pattern.severity,
          description: pattern.description,
          fix: pattern.fix,
          autoFixable: pattern.autoFixable || false,
          confidence: pattern.confidence,
        });
      }
    }

    this.scanResults.set(uri.toString(), findings);

    const diagnostics = findings.map(finding => this.findingToDiagnostic(finding, document));
    this.diagnosticCollection.set(uri, diagnostics);
    this.updateStatusBar(uri);
  }

  private findingToDiagnostic(finding: Finding, document: vscode.TextDocument): vscode.Diagnostic {
    const line = finding.line - 1;
    const lineText = document.lineAt(line).text;
    const range = new vscode.Range(line, 0, line, lineText.length);

    const diagnostic = new vscode.Diagnostic(
      range,
      `[${finding.category}] ${finding.description}`,
      this.severityToDiagnosticSeverity(finding.severity)
    );

    diagnostic.source = 'VibeCheck';
    diagnostic.code = finding.id;
    (diagnostic as any).vibeCheckFinding = finding;

    return diagnostic;
  }

  private severityToDiagnosticSeverity(severity: Severity): vscode.DiagnosticSeverity {
    switch (severity) {
      case 'critical':
      case 'high':
        return vscode.DiagnosticSeverity.Error;
      case 'medium':
        return vscode.DiagnosticSeverity.Warning;
      default:
        return vscode.DiagnosticSeverity.Information;
    }
  }

  private updateStatusBar(uri: vscode.Uri): void {
    const findings = this.scanResults.get(uri.toString()) || [];
    const critical = findings.filter(f => f.severity === 'critical').length;
    const high = findings.filter(f => f.severity === 'high').length;

    if (critical > 0) {
      this.statusBarItem.text = `$(error) ${critical} critical`;
      this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    } else if (high > 0) {
      this.statusBarItem.text = `$(warning) ${high} mock issues`;
      this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    } else if (findings.length > 0) {
      this.statusBarItem.text = `$(info) ${findings.length} findings`;
      this.statusBarItem.backgroundColor = undefined;
    } else {
      this.statusBarItem.text = `$(check) No mocks`;
      this.statusBarItem.backgroundColor = undefined;
    }

    this.statusBarItem.tooltip = `VibeCheck: ${findings.length} findings`;
    this.statusBarItem.show();
  }

  private isRelevantFile(document: vscode.TextDocument): boolean {
    return ['typescript', 'typescriptreact', 'javascript', 'javascriptreact'].includes(document.languageId);
  }

  private shouldIgnore(filePath: string): boolean {
    const ignorePatterns = [
      /node_modules/,
      /\.next/,
      /dist/,
      /\.(test|spec)\.(ts|tsx|js|jsx)$/,
      /__tests__/,
      /__mocks__/,
    ];
    return ignorePatterns.some(p => p.test(filePath));
  }

  async scanWorkspace(): Promise<ScanResult> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      throw new Error('No workspace folder open');
    }

    return scan({
      rootDir: workspaceFolder.uri.fsPath,
      enableAstAnalysis: true,
    });
  }

  getFindings(uri: vscode.Uri): Finding[] {
    return this.scanResults.get(uri.toString()) || [];
  }

  getAllFindings(): Finding[] {
    const all: Finding[] = [];
    this.scanResults.forEach(findings => all.push(...findings));
    return all;
  }

  dispose(): void {
    this.diagnosticCollection.dispose();
    this.statusBarItem.dispose();
    this.disposables.forEach(d => d.dispose());
    this.debounceTimers.forEach(t => clearTimeout(t));
  }
}
