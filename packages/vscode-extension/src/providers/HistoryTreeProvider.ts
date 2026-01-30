import * as vscode from 'vscode';
import * as path from 'path';

export interface ScanRecord {
  file: string;
  timestamp: Date;
  issueCount: number;
}

export class HistoryTreeProvider implements vscode.TreeDataProvider<HistoryTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<HistoryTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private _history: ScanRecord[] = [];
  private readonly _maxHistory = 50;

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  addScan(record: ScanRecord): void {
    this._history.unshift(record);
    if (this._history.length > this._maxHistory) {
      this._history = this._history.slice(0, this._maxHistory);
    }
    this.refresh();
  }

  clearHistory(): void {
    this._history = [];
    this.refresh();
  }

  getTreeItem(element: HistoryTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: HistoryTreeItem): Thenable<HistoryTreeItem[]> {
    if (element) {
      return Promise.resolve([]);
    }

    const items = this._history.map((record) => {
      const fileName = path.basename(record.file);
      const timeAgo = this._getTimeAgo(record.timestamp);
      
      const item = new HistoryTreeItem(
        fileName,
        vscode.TreeItemCollapsibleState.None
      );

      item.description = `${record.issueCount} issues • ${timeAgo}`;
      item.iconPath = record.issueCount > 0
        ? new vscode.ThemeIcon('warning', new vscode.ThemeColor('editorWarning.foreground'))
        : new vscode.ThemeIcon('pass', new vscode.ThemeColor('testing.iconPassed'));
      
      item.command = {
        command: 'vscode.open',
        title: 'Open File',
        arguments: [vscode.Uri.file(record.file)],
      };

      item.tooltip = new vscode.MarkdownString(
        `**${fileName}**\n\n` +
        `📍 ${record.file}\n\n` +
        `🔍 ${record.issueCount} issues found\n\n` +
        `⏰ ${record.timestamp.toLocaleString()}`
      );

      return item;
    });

    return Promise.resolve(items);
  }

  private _getTimeAgo(date: Date): string {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

    if (seconds < 60) {
      return 'just now';
    }
    if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      return `${minutes}m ago`;
    }
    if (seconds < 86400) {
      const hours = Math.floor(seconds / 3600);
      return `${hours}h ago`;
    }
    const days = Math.floor(seconds / 86400);
    return `${days}d ago`;
  }
}

export class HistoryTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(label, collapsibleState);
    this.contextValue = 'historyItem';
  }
}
