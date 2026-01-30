// extension/src/providers/mock-detector/code-actions.ts

import * as vscode from 'vscode';
import { generateAutoFix } from '../../../../src/scanner/engines/mock-detector/auto-fixer';
import type { Finding } from '../../../../src/scanner/engines/mock-detector/types';

export class MockDetectorCodeActionsProvider implements vscode.CodeActionProvider {
  public static readonly providedCodeActionKinds = [
    vscode.CodeActionKind.QuickFix,
  ];

  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];

    for (const diagnostic of context.diagnostics) {
      if (diagnostic.source !== 'VibeCheck') continue;

      const finding = (diagnostic as any).vibeCheckFinding as Finding | undefined;
      if (!finding) continue;

      const autoFix = generateAutoFix(finding, document.getText());
      if (autoFix) {
        actions.push(this.createFixAction(document, diagnostic, autoFix));
      }

      actions.push(this.createSuppressAction(document, diagnostic, finding));
    }

    return actions;
  }

  private createFixAction(
    document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic,
    autoFix: any
  ): vscode.CodeAction {
    const action = new vscode.CodeAction(
      `Fix: ${autoFix.description}`,
      vscode.CodeActionKind.QuickFix
    );

    action.edit = new vscode.WorkspaceEdit();
    const line = autoFix.finding.line - 1;
    const lineRange = document.lineAt(line).range;

    if (autoFix.fixedCode === '') {
      action.edit.delete(document.uri, lineRange.with({ end: lineRange.end.translate(1, 0) }));
    } else {
      action.edit.replace(document.uri, lineRange, autoFix.fixedCode);
    }

    action.diagnostics = [diagnostic];
    action.isPreferred = autoFix.safe;

    return action;
  }

  private createSuppressAction(
    document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic,
    finding: Finding
  ): vscode.CodeAction {
    const action = new vscode.CodeAction(
      `Suppress: vibecheck-disable-next-line ${finding.id}`,
      vscode.CodeActionKind.QuickFix
    );

    action.edit = new vscode.WorkspaceEdit();

    const line = finding.line - 1;
    const lineText = document.lineAt(line).text;
    const indent = lineText.match(/^\s*/)?.[0] || '';
    const suppressComment = `${indent}// vibecheck-disable-next-line ${finding.id}\n`;

    action.edit.insert(document.uri, new vscode.Position(line, 0), suppressComment);
    action.diagnostics = [diagnostic];

    return action;
  }
}
