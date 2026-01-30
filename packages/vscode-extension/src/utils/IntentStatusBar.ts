import * as vscode from 'vscode';
import { FirewallService, FirewallMode, Intent, ShieldCheckResult } from '../services/FirewallService';

/**
 * Status bar items for Agent Firewall
 * Shows: [Shield Mode] [Intent] [Verdict Score]
 */
export class IntentStatusBar implements vscode.Disposable {
  private _modeItem: vscode.StatusBarItem;
  private _intentItem: vscode.StatusBarItem;
  private _verdictItem: vscode.StatusBarItem;
  private _disposables: vscode.Disposable[] = [];
  private _lastVerdict?: ShieldCheckResult;

  constructor(private readonly _firewallService: FirewallService) {
    // Mode control (leftmost) - click to toggle mode
    this._modeItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      102
    );
    this._modeItem.command = 'vibecheck.shieldQuickToggle';

    // Intent display - click to edit intent
    this._intentItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      101
    );
    this._intentItem.command = 'vibecheck.editIntent';

    // Verdict score - click to run check
    this._verdictItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100
    );
    this._verdictItem.command = 'vibecheck.shieldCheck';

    // Subscribe to changes
    this._disposables.push(
      this._firewallService.onStatusChange(() => this._update()),
      this._firewallService.onIntentChange(() => this._update())
    );

    // Register the quick toggle command
    this._disposables.push(
      vscode.commands.registerCommand('vibecheck.shieldQuickToggle', () => this._quickToggle())
    );

    // Initial update
    void this._update();
    this._modeItem.show();
    this._intentItem.show();
    this._verdictItem.show();
  }

  private async _quickToggle(): Promise<void> {
    const mode = this._firewallService.getMode();
    const modes: FirewallMode[] = ['off', 'observe', 'enforce'];
    const currentIndex = modes.indexOf(mode);
    const nextMode = modes[(currentIndex + 1) % modes.length];

    await this._firewallService.setMode(nextMode);

    const modeLabels = { off: 'OFF', observe: 'OBSERVE', enforce: 'ENFORCE' };
    const modeEmoji = { off: '⚪', observe: '👁️', enforce: '🔒' };
    void vscode.window.showInformationMessage(
      `${modeEmoji[nextMode]} Shield: ${modeLabels[nextMode]}`
    );
  }

  private async _update(): Promise<void> {
    const intent = this._firewallService.getCurrentIntent();
    const mode = this._firewallService.getMode();

    // Update mode item
    this._updateModeItem(mode);

    // Update intent item
    this._updateIntentItem(intent, mode);

    // Update verdict item
    this._updateVerdictItem();
  }

  private _updateModeItem(mode: FirewallMode): void {
    const modeConfig = {
      off: { icon: '$(circle-slash)', text: 'OFF', color: undefined, bg: undefined },
      observe: { icon: '$(eye)', text: 'OBSERVE', color: '#00d4ff', bg: undefined },
      enforce: { icon: '$(lock)', text: 'ENFORCE', color: '#a855f7', bg: new vscode.ThemeColor('statusBarItem.warningBackground') }
    };

    const config = modeConfig[mode];
    this._modeItem.text = `${config.icon} ${config.text}`;
    this._modeItem.color = config.color;
    this._modeItem.backgroundColor = config.bg;

    const tooltip = new vscode.MarkdownString();
    tooltip.isTrusted = true;
    tooltip.appendMarkdown('### 🛡️ Agent Firewall Mode\n\n');
    tooltip.appendMarkdown(`**Current:** ${config.text}\n\n`);
    tooltip.appendMarkdown('Click to cycle: OFF → OBSERVE → ENFORCE\n\n');
    tooltip.appendMarkdown('---\n');
    tooltip.appendMarkdown('[OFF](command:vibecheck.shieldOff) | ');
    tooltip.appendMarkdown('[OBSERVE](command:vibecheck.shieldObserve) | ');
    tooltip.appendMarkdown('[ENFORCE](command:vibecheck.shieldEnforce)');
    this._modeItem.tooltip = tooltip;
  }

  private _updateIntentItem(intent: Intent | null, mode: FirewallMode): void {
    if (intent && intent.summary) {
      const truncated = this._truncate(intent.summary, 25);
      this._intentItem.text = `$(lightbulb) ${truncated}`;
      this._intentItem.color = undefined;
      this._intentItem.backgroundColor = undefined;

      const tooltip = new vscode.MarkdownString();
      tooltip.isTrusted = true;
      tooltip.appendMarkdown('### 💡 Current Intent\n\n');
      tooltip.appendMarkdown(`**${intent.summary}**\n\n`);

      if (intent.constraints && intent.constraints.length > 0) {
        tooltip.appendMarkdown('**Constraints:**\n');
        for (const c of intent.constraints) {
          tooltip.appendMarkdown(`- ${c}\n`);
        }
        tooltip.appendMarkdown('\n');
      }

      tooltip.appendMarkdown('---\n');
      tooltip.appendMarkdown('Click to edit | ');
      tooltip.appendMarkdown('[Clear](command:vibecheck.clearIntent) | ');
      tooltip.appendMarkdown('[New Intent](command:vibecheck.setIntent)');
      this._intentItem.tooltip = tooltip;
    } else {
      if (mode === 'enforce') {
        this._intentItem.text = '$(warning) Set Intent';
        this._intentItem.color = '#f59e0b';
        this._intentItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        this._intentItem.tooltip = 'ENFORCE mode requires intent! Click to set.';
      } else {
        this._intentItem.text = '$(add) Set Intent';
        this._intentItem.color = undefined;
        this._intentItem.backgroundColor = undefined;
        this._intentItem.tooltip = 'Click to set intent for Agent Firewall';
      }
    }
  }

  private _updateVerdictItem(): void {
    if (this._lastVerdict) {
      const v = this._lastVerdict;
      const verdictConfig = {
        SHIP: { icon: '$(check)', color: '#10b981' },
        WARN: { icon: '$(warning)', color: '#f59e0b' },
        BLOCK: { icon: '$(error)', color: '#ef4444' }
      };

      const config = verdictConfig[v.verdict] || verdictConfig.WARN;
      this._verdictItem.text = `${config.icon} ${v.score}`;
      this._verdictItem.color = config.color;

      const tooltip = new vscode.MarkdownString();
      tooltip.isTrusted = true;
      tooltip.appendMarkdown(`### ${v.verdict === 'SHIP' ? '✅' : v.verdict === 'WARN' ? '⚠️' : '🚫'} Verdict: ${v.verdict}\n\n`);
      tooltip.appendMarkdown(`**Score:** ${v.score}\n\n`);
      tooltip.appendMarkdown(`**Findings:** ${v.findings.length}\n\n`);
      tooltip.appendMarkdown('Click to run new check\n\n');
      tooltip.appendMarkdown('---\n');
      tooltip.appendMarkdown('[Copy Verdict](command:vibecheck.copyVerdict) | ');
      tooltip.appendMarkdown('[Full Report](command:vibecheck.showVerdict)');
      this._verdictItem.tooltip = tooltip;
    } else {
      this._verdictItem.text = '$(beaker) Check';
      this._verdictItem.color = undefined;

      const tooltip = new vscode.MarkdownString();
      tooltip.isTrusted = true;
      tooltip.appendMarkdown('### 🔍 Shield Check\n\n');
      tooltip.appendMarkdown('Run verification to get verdict.\n\n');
      tooltip.appendMarkdown('Click to check');
      this._verdictItem.tooltip = tooltip;
    }
  }

  public updateVerdict(verdict: ShieldCheckResult): void {
    this._lastVerdict = verdict;
    this._updateVerdictItem();
  }

  private _truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }

  public dispose(): void {
    this._modeItem.dispose();
    this._intentItem.dispose();
    this._verdictItem.dispose();
    for (const d of this._disposables) {
      d.dispose();
    }
  }
}
