import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Logger } from '../utils/Logger';

export interface LockedItem {
  path: string;
  type: 'file' | 'folder';
  lockedAt: string;
  reason?: string;
}

export interface LockAccessRequest {
  path: string;
  reason: string;
  requestedAt: string;
  approved?: boolean;
}

/**
 * LockService - Manages file/folder locks for agent protection
 * 
 * Allows users to lock files/folders so AI agents cannot modify them
 * without explicit permission.
 */
export class LockService {
  private _locks: Map<string, LockedItem> = new Map();
  private _pendingRequests: Map<string, LockAccessRequest> = new Map();
  private _onLocksChanged: vscode.EventEmitter<void> = new vscode.EventEmitter();
  private _context: vscode.ExtensionContext;
  private _locksFilePath: string;

  public readonly onLocksChanged = this._onLocksChanged.event;

  constructor(context: vscode.ExtensionContext) {
    this._context = context;
    this._locksFilePath = this._getLocksFilePath();
    this._loadLocks();
  }

  /**
   * Get the locks file path in .vibecheck folder
   */
  private _getLocksFilePath(): string {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
      return path.join(workspaceFolder.uri.fsPath, '.vibecheck', 'locks.json');
    }
    // Fallback to extension storage
    return path.join(this._context.globalStorageUri.fsPath, 'locks.json');
  }

  /**
   * Load locks from persistent storage
   */
  private _loadLocks(): void {
    try {
      // Try workspace storage first
      const workspaceLocks = this._context.workspaceState.get<LockedItem[]>('vibecheck.locks', []);

      // Also try file-based storage
      if (fs.existsSync(this._locksFilePath)) {
        const fileContent = fs.readFileSync(this._locksFilePath, 'utf-8');
        const fileLocks: LockedItem[] = JSON.parse(fileContent);

        // Merge both sources, file takes precedence
        for (const lock of fileLocks) {
          this._locks.set(this._normalizePath(lock.path), lock);
        }
      }

      // Add workspace state locks
      for (const lock of workspaceLocks) {
        if (!this._locks.has(this._normalizePath(lock.path))) {
          this._locks.set(this._normalizePath(lock.path), lock);
        }
      }

      Logger.info(`Loaded ${this._locks.size} file/folder locks`);
    } catch (error) {
      Logger.error('Failed to load locks:', error);
    }
  }

  /**
   * Save locks to persistent storage
   */
  private async _saveLocks(): Promise<void> {
    try {
      const locksArray = Array.from(this._locks.values());

      // Save to workspace state
      await this._context.workspaceState.update('vibecheck.locks', locksArray);

      // Also save to file for visibility
      const dir = path.dirname(this._locksFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this._locksFilePath, JSON.stringify(locksArray, null, 2));

      Logger.info(`Saved ${locksArray.length} locks`);
    } catch (error) {
      Logger.error('Failed to save locks:', error);
    }
  }

  /**
   * Normalize path for consistent comparison
   */
  private _normalizePath(filePath: string): string {
    return path.normalize(filePath).toLowerCase();
  }

  /**
   * Lock a file or folder
   */
  public async lock(uri: vscode.Uri, reason?: string): Promise<boolean> {
    try {
      const stat = await vscode.workspace.fs.stat(uri);
      const type: 'file' | 'folder' = stat.type === vscode.FileType.Directory ? 'folder' : 'file';

      const lockedItem: LockedItem = {
        path: uri.fsPath,
        type,
        lockedAt: new Date().toISOString(),
        reason,
      };

      this._locks.set(this._normalizePath(uri.fsPath), lockedItem);
      await this._saveLocks();
      this._onLocksChanged.fire();

      Logger.info(`Locked ${type}: ${uri.fsPath}`);
      return true;
    } catch (error) {
      Logger.error('Failed to lock:', error);
      return false;
    }
  }

  /**
   * Unlock a file or folder
   */
  public async unlock(uri: vscode.Uri): Promise<boolean> {
    const normalizedPath = this._normalizePath(uri.fsPath);

    if (this._locks.has(normalizedPath)) {
      this._locks.delete(normalizedPath);
      await this._saveLocks();
      this._onLocksChanged.fire();

      Logger.info(`Unlocked: ${uri.fsPath}`);
      return true;
    }

    return false;
  }

  /**
   * Check if a file or folder is locked
   */
  public isLocked(uri: vscode.Uri): boolean {
    const normalizedPath = this._normalizePath(uri.fsPath);

    // Check if directly locked
    if (this._locks.has(normalizedPath)) {
      return true;
    }

    // Check if any parent folder is locked
    for (const [lockedPath, item] of this._locks) {
      if (item.type === 'folder') {
        const parentPath = this._normalizePath(item.path);
        if (normalizedPath.startsWith(parentPath + path.sep) || normalizedPath === parentPath) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Check if a file is directly locked (not inherited from parent)
   */
  public isDirectlyLocked(uri: vscode.Uri): boolean {
    return this._locks.has(this._normalizePath(uri.fsPath));
  }

  /**
   * Get lock info for a file/folder
   */
  public getLockInfo(uri: vscode.Uri): LockedItem | undefined {
    const normalizedPath = this._normalizePath(uri.fsPath);

    // Check direct lock
    const directLock = this._locks.get(normalizedPath);
    if (directLock) {
      return directLock;
    }

    // Check parent folder locks
    for (const [lockedPath, item] of this._locks) {
      if (item.type === 'folder') {
        const parentPath = this._normalizePath(item.path);
        if (normalizedPath.startsWith(parentPath + path.sep)) {
          return item;
        }
      }
    }

    return undefined;
  }

  /**
   * Get all locked items
   */
  public getAllLocks(): LockedItem[] {
    return Array.from(this._locks.values());
  }

  /**
   * Get all locked paths (for decoration provider)
   */
  public getLockedPaths(): Set<string> {
    return new Set(this._locks.keys());
  }

  /**
   * Request access to a locked file
   * This is called when an agent tries to modify a locked file
   */
  public async requestAccess(uri: vscode.Uri, reason: string): Promise<boolean> {
    const lockInfo = this.getLockInfo(uri);

    if (!lockInfo) {
      return true; // Not locked, allow access
    }

    const request: LockAccessRequest = {
      path: uri.fsPath,
      reason,
      requestedAt: new Date().toISOString(),
    };

    // Show dialog to user
    const fileName = path.basename(uri.fsPath);
    const lockSource = lockInfo.path === uri.fsPath
      ? 'directly locked'
      : `locked via parent folder: ${path.basename(lockInfo.path)}`;

    const result = await vscode.window.showWarningMessage(
      `🔒 Agent Access Request\n\nThe agent wants to modify "${fileName}" which is ${lockSource}.\n\nReason: ${reason}`,
      { modal: true },
      'Allow Once',
      'Allow & Unlock',
      'Deny'
    );

    if (result === 'Allow Once') {
      Logger.info(`Access granted (once) to: ${uri.fsPath}`);
      return true;
    } else if (result === 'Allow & Unlock') {
      await this.unlock(uri);
      Logger.info(`Access granted and unlocked: ${uri.fsPath}`);
      return true;
    } else {
      Logger.info(`Access denied to: ${uri.fsPath}`);
      return false;
    }
  }

  /**
   * Check if modification is allowed
   * Returns true if allowed, false if blocked
   * Will prompt user if file is locked
   */
  public async checkModification(uri: vscode.Uri, reason: string): Promise<boolean> {
    if (!this.isLocked(uri)) {
      return true;
    }

    return this.requestAccess(uri, reason);
  }

  /**
   * Toggle lock state
   */
  public async toggleLock(uri: vscode.Uri): Promise<boolean> {
    if (this.isDirectlyLocked(uri)) {
      return this.unlock(uri);
    } else {
      return this.lock(uri);
    }
  }

  /**
   * Unlock all items
   */
  public async unlockAll(): Promise<void> {
    this._locks.clear();
    await this._saveLocks();
    this._onLocksChanged.fire();
    Logger.info('All locks cleared');
  }

  /**
   * Get locked items count
   */
  public get lockCount(): number {
    return this._locks.size;
  }

  /**
   * Dispose
   */
  public dispose(): void {
    this._onLocksChanged.dispose();
  }
}
