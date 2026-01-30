import * as vscode from 'vscode';
import { ScannerService } from '../services/ScannerService';
import { DiagnosticsProvider, Issue } from '../providers/DiagnosticsProvider';
import { IssuesTreeProvider } from '../providers/TreeDataProvider';
import { HistoryTreeProvider } from '../providers/HistoryTreeProvider';
import { StatusBarManager } from '../utils/StatusBarManager';
import { DecorationManager } from '../utils/DecorationManager';
import { CliService } from '../services/CliService';
import { AuthService } from '../services/AuthService';
import { Logger } from '../utils/Logger';

export function registerCommands(
  context: vscode.ExtensionContext,
  scannerService: ScannerService,
  diagnosticsProvider: DiagnosticsProvider,
  issuesTreeProvider: IssuesTreeProvider,
  historyTreeProvider: HistoryTreeProvider,
  statusBarManager: StatusBarManager,
  decorationManager: DecorationManager,
  cliService?: CliService
): void {
  // Scan current file
  context.subscriptions.push(
    vscode.commands.registerCommand('vibecheck.scan', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        void vscode.window.showWarningMessage('No active file to scan');
        return;
      }

      try {
        statusBarManager.setScanning(true);
        const issues = await scannerService.scanFile(
          editor.document.uri.fsPath,
          editor.document.getText()
        );

        diagnosticsProvider.setIssues(editor.document.uri, issues);
        issuesTreeProvider.setIssues(issues);
        decorationManager.updateDecorations(editor, issues);

        historyTreeProvider.addScan({
          file: editor.document.uri.fsPath,
          timestamp: new Date(),
          issueCount: issues.length,
        });

        statusBarManager.setScanning(false, issues.length);

        if (issues.length === 0) {
          void vscode.window.showInformationMessage('✨ VibeCheck: No issues found!');
        } else {
          void vscode.window.showWarningMessage(`VibeCheck: Found ${issues.length} issue(s)`);
        }
      } catch (error) {
        Logger.error('Scan failed:', error);
        statusBarManager.setScanning(false);
        void vscode.window.showErrorMessage(`VibeCheck scan failed: ${String(error)}`);
      }
    })
  );

  // Scan workspace
  context.subscriptions.push(
    vscode.commands.registerCommand('vibecheck.scanWorkspace', async () => {
      try {
        // Run CLI check in terminal for visibility
        if (cliService) {
          const cliAvailable = await cliService.isAvailable();
          if (cliAvailable) {
            await cliService.runAuditInTerminal();
          }
        }

        statusBarManager.setScanning(true);
        const results = await scannerService.scanWorkspace();

        let totalIssues = 0;
        const allIssues: Issue[] = [];

        for (const [filePath, issues] of results) {
          totalIssues += issues.length;
          allIssues.push(...issues);
          diagnosticsProvider.setIssues(vscode.Uri.file(filePath), issues);
        }

        issuesTreeProvider.setIssues(allIssues);
        statusBarManager.setScanning(false, totalIssues);

        void vscode.window.showInformationMessage(
          `VibeCheck: Scanned ${results.size} files, found ${totalIssues} issue(s)`
        );
      } catch (error) {
        Logger.error('Workspace scan failed:', error);
        statusBarManager.setScanning(false);
        void vscode.window.showErrorMessage(`VibeCheck workspace scan failed: ${String(error)}`);
      }
    })
  );

  // Fix single issue
  context.subscriptions.push(
    vscode.commands.registerCommand('vibecheck.fix', async (issueOrUri?: Issue | vscode.Uri) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }

      let issue: Issue | undefined;

      if (issueOrUri && 'id' in issueOrUri) {
        issue = issueOrUri;
      } else {
        issue = diagnosticsProvider.getIssueAtPosition(
          editor.document.uri,
          editor.selection.active
        );
      }

      if (!issue) {
        void vscode.window.showWarningMessage('No issue at cursor position');
        return;
      }

      if (issue.fix) {
        const edit = new vscode.WorkspaceEdit();
        const range = new vscode.Range(
          issue.fix.range.start.line - 1,
          issue.fix.range.start.column - 1,
          issue.fix.range.end.line - 1,
          issue.fix.range.end.column - 1
        );
        edit.replace(editor.document.uri, range, issue.fix.replacement);
        await vscode.workspace.applyEdit(edit);
        void vscode.window.showInformationMessage(`Fixed: ${issue.rule}`);
      } else {
        void vscode.window.showInformationMessage(
          `No automatic fix available for ${issue.rule}. ${issue.suggestion || ''}`
        );
      }
    })
  );

  // AI fix issue
  context.subscriptions.push(
    vscode.commands.registerCommand('vibecheck.aiFixIssue', async (uri: vscode.Uri, issue: Issue) => {
      const doc = await vscode.workspace.openTextDocument(uri);
      const fix = await scannerService.getAiFix(issue, doc.getText());

      if (fix) {
        // Show diff and let user apply
        void vscode.window.showInformationMessage(`AI suggests: ${fix}`, 'Apply').then((choice) => {
          if (choice === 'Apply') {
            // Apply fix
          }
        });
      } else {
        void vscode.window.showWarningMessage('Could not generate AI fix');
      }
    })
  );

  // Fix all issues in file using CLI
  context.subscriptions.push(
    vscode.commands.registerCommand('vibecheck.fixAll', async (uri?: vscode.Uri) => {
      // First check if CLI is available
      if (cliService && await cliService.isAvailable()) {
        // Use CLI fix command
        const choice = await vscode.window.showInformationMessage(
          'VibeCheck AI Fix will analyze and fix issues. This creates a checkpoint first.',
          'Plan Only',
          'Apply Fixes',
          'Cancel'
        );

        if (choice === 'Cancel' || !choice) {
          return;
        }

        await vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: choice === 'Plan Only' ? 'Planning fixes...' : 'Applying AI fixes...',
          cancellable: false
        }, async () => {
          const result = choice === 'Plan Only'
            ? await cliService.fixPlan()
            : await cliService.fixApply();

          if (result.success) {
            if (choice === 'Apply Fixes') {
              void vscode.window.showInformationMessage(
                'AI fixes applied! A checkpoint was created. Use "Restore Checkpoint" to undo.',
                'View Changes'
              ).then(action => {
                if (action === 'View Changes') {
                  void vscode.commands.executeCommand('workbench.action.files.revert');
                }
              });
            } else {
              // Show plan output
              const outputChannel = vscode.window.createOutputChannel('VibeCheck Fix Plan');
              outputChannel.clear();
              outputChannel.appendLine('═══════════════════════════════════════════════════');
              outputChannel.appendLine('  VIBECHECK FIX PLAN');
              outputChannel.appendLine('═══════════════════════════════════════════════════');
              outputChannel.appendLine('');
              outputChannel.appendLine(result.output || 'No output');
              outputChannel.show();
            }
          } else {
            if (result.error?.includes('PRO') || result.output?.includes('PRO')) {
              void vscode.window.showWarningMessage('AI Fix requires VibeCheck PRO subscription');
            } else {
              void vscode.window.showErrorMessage(`Fix failed: ${result.error || 'Unknown error'}`);
            }
          }
        });
      } else {
        // Fallback to local fix if available
        const editor = vscode.window.activeTextEditor;
        const targetUri = uri || editor?.document.uri;

        if (!targetUri) {
          void vscode.window.showWarningMessage('No file to fix');
          return;
        }

        const issues = diagnosticsProvider.getIssuesForFile(targetUri);
        const fixableIssues = issues.filter((i) => i.fixable && i.fix);

        if (fixableIssues.length === 0) {
          void vscode.window.showInformationMessage(
            'No auto-fixable issues. Install VibeCheck CLI for AI-powered fixes: npm install -g vibecheck'
          );
          return;
        }

        const edit = new vscode.WorkspaceEdit();

        // Sort by position to apply from bottom to top
        fixableIssues.sort((a, b) => b.line - a.line);

        for (const issue of fixableIssues) {
          if (issue.fix) {
            const range = new vscode.Range(
              issue.fix.range.start.line - 1,
              issue.fix.range.start.column - 1,
              issue.fix.range.end.line - 1,
              issue.fix.range.end.column - 1
            );
            edit.replace(targetUri, range, issue.fix.replacement);
          }
        }

        await vscode.workspace.applyEdit(edit);
        void vscode.window.showInformationMessage(`Fixed ${fixableIssues.length} issue(s)`);
      }
    })
  );

  // Toggle watch mode
  context.subscriptions.push(
    vscode.commands.registerCommand('vibecheck.toggleWatch', async () => {
      const config = vscode.workspace.getConfiguration('vibecheck');
      const current = config.get<boolean>('watchMode') ?? false;
      await config.update('watchMode', !current, vscode.ConfigurationTarget.Workspace);

      void vscode.window.showInformationMessage(
        `Watch mode ${!current ? 'enabled' : 'disabled'}`
      );
    })
  );

  // Refresh issues
  context.subscriptions.push(
    vscode.commands.registerCommand('vibecheck.refreshIssues', () => {
      issuesTreeProvider.refresh();
    })
  );

  // Clear all issues
  context.subscriptions.push(
    vscode.commands.registerCommand('vibecheck.clearIssues', () => {
      diagnosticsProvider.clearAll();
      issuesTreeProvider.clearIssues();
      decorationManager.clearAll();
      void vscode.window.showInformationMessage('VibeCheck: All issues cleared');
    })
  );

  // Ignore issue
  context.subscriptions.push(
    vscode.commands.registerCommand('vibecheck.ignoreIssue', (issueId: string) => {
      // TODO: Add to ignore list
      void vscode.window.showInformationMessage(`Ignored issue: ${issueId}`);
    })
  );

  // Ignore rule in file
  context.subscriptions.push(
    vscode.commands.registerCommand('vibecheck.ignoreRule', async (issue: Issue) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }

      const comment = `// vibecheck-disable-next-line ${issue.rule}\n`;
      const position = new vscode.Position(issue.line - 1, 0);

      await editor.edit((editBuilder) => {
        editBuilder.insert(position, comment);
      });
    })
  );

  // ═══════════════════════════════════════════════════════════════════════════════
  // Authentication Commands
  // ═══════════════════════════════════════════════════════════════════════════════
  // Note: Auth commands (login, logout, authStatus) are registered in extension.ts
  // to avoid duplicate registrations
}
