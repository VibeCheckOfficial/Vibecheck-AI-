import * as vscode from 'vscode';
import * as path from 'path';
import { LockService, LockedItem } from '../services/LockService';

/**
 * LockDecorationProvider - Provides visual decorations for locked files/folders
 * 
 * Shows locked files/folders with:
 * - 🔒 Badge icon
 * - Strikethrough text
 * - Grayed out / faded color
 */
export class LockDecorationProvider implements vscode.FileDecorationProvider {
  private _onDidChangeFileDecorations: vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined> =
    new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>();

  readonly onDidChangeFileDecorations: vscode.Event<vscode.Uri | vscode.Uri[] | undefined> =
    this._onDidChangeFileDecorations.event;

  private _lockService: LockService;
  private _disposables: vscode.Disposable[] = [];

  constructor(lockService: LockService) {
    this._lockService = lockService;

    // Listen for lock changes and refresh decorations
    this._disposables.push(
      this._lockService.onLocksChanged(() => {
        this._onDidChangeFileDecorations.fire(undefined);
      })
    );
  }

  /**
   * Provide file decoration for a URI
   */
  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    // Check if this file/folder is locked
    if (!this._lockService.isLocked(uri)) {
      return undefined;
    }

    const isDirectLock = this._lockService.isDirectlyLocked(uri);
    const lockInfo = this._lockService.getLockInfo(uri);

    // Create decoration
    const decoration: vscode.FileDecoration = {
      // Badge shows lock icon (L for locked - VS Code limits to 2 chars)
      badge: 'L',

      // Tooltip with lock info
      tooltip: this._getTooltip(uri, isDirectLock, lockInfo),

      // Color - use a faded/gray color
      color: new vscode.ThemeColor('vibecheck.lockedFile'),

      // Propagate to children if it's a folder lock
      propagate: isDirectLock && lockInfo?.type === 'folder',
    };

    return decoration;
  }

  /**
   * Generate tooltip for locked file
   */
  private _getTooltip(uri: vscode.Uri, isDirectLock: boolean, lockInfo: LockedItem | undefined): string {
    const fileName = path.basename(uri.fsPath);

    if (isDirectLock) {
      let tooltip = `🔒 Locked: ${fileName}`;
      if (lockInfo?.reason) {
        tooltip += `\nReason: ${lockInfo.reason}`;
      }
      if (lockInfo?.lockedAt) {
        const date = new Date(lockInfo.lockedAt);
        tooltip += `\nLocked at: ${date.toLocaleString()}`;
      }
      tooltip += '\n\nRight-click to unlock';
      return tooltip;
    } else {
      // Inherited lock from parent
      const parentName = lockInfo ? path.basename(lockInfo.path) : 'parent folder';
      return `🔒 Locked (inherited from ${parentName})\n\nUnlock the parent folder to edit this file`;
    }
  }

  /**
   * Refresh decorations for specific URIs or all
   */
  public refresh(uris?: vscode.Uri | vscode.Uri[]): void {
    this._onDidChangeFileDecorations.fire(uris);
  }

  /**
   * Refresh all decorations
   */
  public refreshAll(): void {
    this._onDidChangeFileDecorations.fire(undefined);
  }

  /**
   * Dispose
   */
  public dispose(): void {
    this._onDidChangeFileDecorations.dispose();
    for (const disposable of this._disposables) {
      disposable.dispose();
    }
  }
}
