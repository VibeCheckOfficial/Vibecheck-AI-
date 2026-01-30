/**
 * Pro Upsell Service
 * 
 * Shows strategic notifications to encourage free users to upgrade to Pro.
 * Uses VS Code's notification system with clear value propositions.
 */

import * as vscode from 'vscode';

// ============================================================================
// Types
// ============================================================================

type UpsellTrigger = 
  | 'scan_complete_with_issues'
  | 'fix_suggestion'
  | 'scan_limit_warning'
  | 'scan_limit_reached'
  | 'feature_gate'
  | 'first_scan'
  | 'weekly_reminder';

interface UpsellMessage {
  title: string;
  detail: string;
  cta: string;
  secondaryCta?: string;
}

// ============================================================================
// Upsell Messages
// ============================================================================

const UPSELL_MESSAGES: Record<UpsellTrigger, UpsellMessage> = {
  scan_complete_with_issues: {
    title: '🔧 Issues Found - Fix with Pro',
    detail: 'VibeCheck found issues in your code. Pro users can auto-fix them with one click.',
    cta: 'Start Free Trial',
    secondaryCta: 'Learn More',
  },
  fix_suggestion: {
    title: '✨ Auto-Fix Available',
    detail: 'Pro users can apply this fix automatically. Save time and reduce errors.',
    cta: 'Upgrade to Pro',
    secondaryCta: 'View Fix',
  },
  scan_limit_warning: {
    title: '⚠️ Running Low on Scans',
    detail: 'You have {remaining} scans left this month. Upgrade to Pro for unlimited scans.',
    cta: 'Get Unlimited Scans',
    secondaryCta: 'Dismiss',
  },
  scan_limit_reached: {
    title: '🛑 Scan Limit Reached',
    detail: "You've used all 10 scans this month. Upgrade to Pro for unlimited scans and cloud sync.",
    cta: 'Upgrade Now',
    secondaryCta: 'Wait Until Next Month',
  },
  feature_gate: {
    title: '🔒 Pro Feature',
    detail: 'This feature requires a Pro subscription. Unlock it with a 3-day free trial.',
    cta: 'Start Free Trial',
    secondaryCta: 'See All Pro Features',
  },
  first_scan: {
    title: '🎉 First Scan Complete!',
    detail: 'Want to track your progress and sync across devices? Try Pro free for 3 days.',
    cta: 'Try Pro Free',
    secondaryCta: 'Maybe Later',
  },
  weekly_reminder: {
    title: '📊 Weekly Code Health',
    detail: 'Pro users get weekly reports, trend analysis, and team dashboards.',
    cta: 'Explore Pro',
    secondaryCta: "Don't Show Again",
  },
};

// ============================================================================
// Service Implementation
// ============================================================================

export class ProUpsellService {
  private static instance: ProUpsellService;
  private context: vscode.ExtensionContext;
  private lastUpsellTime: number = 0;
  private suppressedUntil: number = 0;
  
  // Minimum time between upsells (5 minutes)
  private readonly MIN_UPSELL_INTERVAL_MS = 5 * 60 * 1000;
  
  // Storage keys
  private readonly STORAGE_KEY_LAST_UPSELL = 'vibecheck.lastUpsellTime';
  private readonly STORAGE_KEY_SUPPRESSED = 'vibecheck.upsellSuppressedUntil';
  private readonly STORAGE_KEY_DISMISS_COUNT = 'vibecheck.upsellDismissCount';

  private constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.loadState();
  }

  static getInstance(context: vscode.ExtensionContext): ProUpsellService {
    if (!ProUpsellService.instance) {
      ProUpsellService.instance = new ProUpsellService(context);
    }
    return ProUpsellService.instance;
  }

  private loadState(): void {
    this.lastUpsellTime = this.context.globalState.get(this.STORAGE_KEY_LAST_UPSELL, 0);
    this.suppressedUntil = this.context.globalState.get(this.STORAGE_KEY_SUPPRESSED, 0);
  }

  private async saveState(): Promise<void> {
    await this.context.globalState.update(this.STORAGE_KEY_LAST_UPSELL, this.lastUpsellTime);
    await this.context.globalState.update(this.STORAGE_KEY_SUPPRESSED, this.suppressedUntil);
  }

  /**
   * Check if user is on free tier (would need to integrate with auth service)
   */
  private async isFreeTier(): Promise<boolean> {
    // TODO: Integrate with AuthService to check actual tier
    // For now, return true if no subscription detected
    const tier = this.context.globalState.get<string>('vibecheck.userTier', 'free');
    return tier === 'free';
  }

  /**
   * Check if we should show an upsell
   */
  private canShowUpsell(): boolean {
    const now = Date.now();
    
    // Check if suppressed
    if (now < this.suppressedUntil) {
      return false;
    }
    
    // Check minimum interval
    if (now - this.lastUpsellTime < this.MIN_UPSELL_INTERVAL_MS) {
      return false;
    }
    
    return true;
  }

  /**
   * Show an upsell notification
   */
  async showUpsell(trigger: UpsellTrigger, replacements?: Record<string, string>): Promise<void> {
    // Only show to free tier users
    if (!await this.isFreeTier()) {
      return;
    }

    // Check if we can show
    if (!this.canShowUpsell()) {
      return;
    }

    const message = UPSELL_MESSAGES[trigger];
    let detail = message.detail;
    
    // Apply replacements
    if (replacements) {
      for (const [key, value] of Object.entries(replacements)) {
        detail = detail.replace(`{${key}}`, value);
      }
    }

    // Show notification
    const result = await vscode.window.showInformationMessage(
      `${message.title}\n\n${detail}`,
      message.cta,
      message.secondaryCta ?? 'Dismiss'
    );

    // Update state
    this.lastUpsellTime = Date.now();
    await this.saveState();

    // Handle response
    if (result === message.cta) {
      // Primary CTA - open upgrade page
      vscode.env.openExternal(vscode.Uri.parse('https://app.vibecheckai.dev/billing?action=trial&source=vscode'));
    } else if (result === 'Learn More' || result === 'See All Pro Features') {
      // Secondary informational CTA
      vscode.env.openExternal(vscode.Uri.parse('https://vibecheckai.dev/pro'));
    } else if (result === "Don't Show Again") {
      // Suppress for 7 days
      this.suppressedUntil = Date.now() + (7 * 24 * 60 * 60 * 1000);
      await this.saveState();
    }
  }

  /**
   * Show scan limit warning
   */
  async showScanLimitWarning(remaining: number): Promise<void> {
    if (remaining <= 0) {
      await this.showUpsell('scan_limit_reached');
    } else if (remaining <= 3) {
      await this.showUpsell('scan_limit_warning', { remaining: String(remaining) });
    }
  }

  /**
   * Show issues found upsell
   */
  async showIssuesFoundUpsell(issueCount: number): Promise<void> {
    if (issueCount > 0) {
      await this.showUpsell('scan_complete_with_issues');
    }
  }

  /**
   * Show first scan celebration
   */
  async showFirstScanCelebration(): Promise<void> {
    const hasScanned = this.context.globalState.get<boolean>('vibecheck.hasScannedBefore', false);
    if (!hasScanned) {
      await this.context.globalState.update('vibecheck.hasScannedBefore', true);
      // Delay to let user see results first
      setTimeout(() => {
        this.showUpsell('first_scan');
      }, 3000);
    }
  }

  /**
   * Show feature gate message
   */
  async showFeatureGate(featureName: string): Promise<void> {
    const result = await vscode.window.showWarningMessage(
      `🔒 "${featureName}" is a Pro feature`,
      'Start 3-Day Trial',
      'See All Pro Features'
    );

    if (result === 'Start 3-Day Trial') {
      vscode.env.openExternal(vscode.Uri.parse('https://app.vibecheckai.dev/billing?action=trial&source=vscode'));
    } else if (result === 'See All Pro Features') {
      vscode.env.openExternal(vscode.Uri.parse('https://vibecheckai.dev/pro'));
    }
  }
}
