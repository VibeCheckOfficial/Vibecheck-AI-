import * as vscode from 'vscode';

export class StatusBarManager implements vscode.Disposable {
  private readonly _statusBarItem: vscode.StatusBarItem;
  private _isScanning = false;
  private _animationInterval?: NodeJS.Timeout;

  constructor() {
    this._statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100
    );
    this._statusBarItem.command = 'vibecheck.scan';
    this._statusBarItem.tooltip = 'Click to scan current file';
    this._updateDisplay(0);
  }

  public show(): void {
    this._statusBarItem.show();
  }

  public hide(): void {
    this._statusBarItem.hide();
  }

  public setScanning(isScanning: boolean, issueCount?: number): void {
    this._isScanning = isScanning;

    if (isScanning) {
      this._startAnimation();
    } else {
      this._stopAnimation();
      this._updateDisplay(issueCount ?? 0);
    }
  }

  private _startAnimation(): void {
    if (this._animationInterval) {
      return;
    }

    const frames = ['$(loading~spin)', '$(sync~spin)'];
    let frameIndex = 0;

    this._statusBarItem.text = `${frames[0]} VibeCheck`;
    this._statusBarItem.tooltip = 'Scanning...';

    this._animationInterval = setInterval(() => {
      frameIndex = (frameIndex + 1) % frames.length;
      this._statusBarItem.text = `${frames[frameIndex]} VibeCheck`;
    }, 500);
  }

  private _stopAnimation(): void {
    if (this._animationInterval) {
      clearInterval(this._animationInterval);
      this._animationInterval = undefined;
    }
  }

  private _updateDisplay(issueCount: number): void {
    if (issueCount === 0) {
      this._statusBarItem.text = '$(pass-filled) VibeCheck';
      this._statusBarItem.backgroundColor = undefined;
      this._statusBarItem.tooltip = 'All clear! Click to scan';
    } else {
      this._statusBarItem.text = `$(warning) VibeCheck (${issueCount})`;
      this._statusBarItem.backgroundColor = new vscode.ThemeColor(
        'statusBarItem.warningBackground'
      );
      this._statusBarItem.tooltip = `${issueCount} issue(s) found. Click to scan`;
    }
  }

  public dispose(): void {
    this._stopAnimation();
    this._statusBarItem.dispose();
  }
}
