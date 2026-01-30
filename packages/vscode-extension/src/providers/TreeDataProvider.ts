import * as vscode from 'vscode';
import * as path from 'path';
import { Issue } from './DiagnosticsProvider';

export class IssuesTreeProvider implements vscode.TreeDataProvider<IssueTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<IssueTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private _issues: Issue[] = [];
  private _groupBy: 'file' | 'severity' | 'engine' = 'file';

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  setIssues(issues: Issue[]): void {
    this._issues = issues;
    this.refresh();
  }

  addIssues(issues: Issue[]): void {
    this._issues.push(...issues);
    this.refresh();
  }

  clearIssues(): void {
    this._issues = [];
    this.refresh();
  }

  setGroupBy(groupBy: 'file' | 'severity' | 'engine'): void {
    this._groupBy = groupBy;
    this.refresh();
  }

  getTreeItem(element: IssueTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: IssueTreeItem): Thenable<IssueTreeItem[]> {
    if (!element) {
      // Root level - return groups
      return Promise.resolve(this._getGroups());
    }

    if (element.contextValue === 'group') {
      // Return issues in this group
      return Promise.resolve(this._getIssuesInGroup(element.groupKey!));
    }

    return Promise.resolve([]);
  }

  private _getGroups(): IssueTreeItem[] {
    const groups = new Map<string, Issue[]>();

    for (const issue of this._issues) {
      let key: string;
      switch (this._groupBy) {
        case 'file':
          key = issue.file;
          break;
        case 'severity':
          key = issue.severity;
          break;
        case 'engine':
          key = issue.engine;
          break;
      }

      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(issue);
    }

    const items: IssueTreeItem[] = [];
    for (const [key, issues] of groups) {
      const label = this._groupBy === 'file' ? path.basename(key) : key;
      const item = new IssueTreeItem(
        `${label} (${issues.length})`,
        vscode.TreeItemCollapsibleState.Expanded,
        'group'
      );
      item.groupKey = key;
      item.iconPath = this._getGroupIcon(key);
      item.description = this._groupBy === 'file' ? path.dirname(key) : undefined;
      items.push(item);
    }

    return items.sort((a, b) => a.label!.toString().localeCompare(b.label!.toString()));
  }

  private _getIssuesInGroup(groupKey: string): IssueTreeItem[] {
    const issues = this._issues.filter((issue) => {
      switch (this._groupBy) {
        case 'file':
          return issue.file === groupKey;
        case 'severity':
          return issue.severity === groupKey;
        case 'engine':
          return issue.engine === groupKey;
      }
    });

    return issues.map((issue) => {
      const item = new IssueTreeItem(
        issue.message,
        vscode.TreeItemCollapsibleState.None,
        'issue'
      );
      item.issue = issue;
      item.description = `${path.basename(issue.file)}:${issue.line}`;
      item.iconPath = this._getSeverityIcon(issue.severity);
      item.command = {
        command: 'vibecheck.showIssueDetails',
        title: 'Show Issue Details',
        arguments: [issue],
      };
      item.tooltip = new vscode.MarkdownString(
        `**${issue.rule}**\n\n${issue.message}\n\n` +
          `📍 ${issue.file}:${issue.line}:${issue.column}\n\n` +
          `🔧 Engine: ${issue.engine}\n\n` +
          (issue.suggestion ? `💡 ${issue.suggestion}` : '')
      );
      return item;
    });
  }

  private _getGroupIcon(key: string): vscode.ThemeIcon {
    if (this._groupBy === 'file') {
      return vscode.ThemeIcon.File;
    }
    if (this._groupBy === 'severity') {
      return this._getSeverityIcon(key as Issue['severity']);
    }
    // Engine icons
    switch (key) {
      case 'fake-feature':
        return new vscode.ThemeIcon('symbol-event');
      case 'security':
        return new vscode.ThemeIcon('shield');
      case 'hallucination':
        return new vscode.ThemeIcon('robot');
      case 'dependency':
        return new vscode.ThemeIcon('package');
      default:
        return new vscode.ThemeIcon('symbol-misc');
    }
  }

  private _getSeverityIcon(severity: string): vscode.ThemeIcon {
    switch (severity) {
      case 'error':
        return new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'));
      case 'warning':
        return new vscode.ThemeIcon('warning', new vscode.ThemeColor('editorWarning.foreground'));
      case 'info':
        return new vscode.ThemeIcon('info', new vscode.ThemeColor('editorInfo.foreground'));
      case 'hint':
        return new vscode.ThemeIcon('lightbulb', new vscode.ThemeColor('editorHint.foreground'));
      default:
        return new vscode.ThemeIcon('circle-outline');
    }
  }
}

export class IssueTreeItem extends vscode.TreeItem {
  public issue?: Issue;
  public groupKey?: string;

  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly contextValue: 'group' | 'issue'
  ) {
    super(label, collapsibleState);
  }
}
