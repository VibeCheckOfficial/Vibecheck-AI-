/**
 * CLI Upgrade Prompts
 * 
 * Strategic upgrade prompts at moment-of-need trigger points.
 * Shows value proposition when users try to use Pro features.
 * 
 * @module cli-registry/upgrade-prompts
 */

import type { Tier, FeatureKey } from '@repo/shared-types';
import {
  FEATURE_METADATA,
  PLAN_DEFINITIONS,
  UPGRADE_URLS,
  tierMeetsRequirement,
} from '@repo/shared-types';

// ============================================================================
// Types
// ============================================================================

/**
 * Upgrade prompt data
 */
export interface UpgradePromptData {
  /** Feature being gated */
  feature: FeatureKey;
  /** Feature title */
  title: string;
  /** Why this is a Pro feature */
  reason: string;
  /** Benefits of upgrading */
  benefits: string[];
  /** Required tier */
  requiredTier: Tier;
  /** Upgrade URL */
  upgradeUrl: string;
  /** CLI command to upgrade */
  upgradeCommand: string;
  /** Value proposition message */
  valueMessage?: string;
}

/**
 * Trigger context for upgrade prompts
 */
export interface TriggerContext {
  /** Command being run */
  command: string;
  /** Feature attempted */
  feature: FeatureKey;
  /** User's current tier */
  currentTier: Tier;
  /** Additional context for personalization */
  context?: {
    /** Number of issues that would be fixed */
    issuesFound?: number;
    /** Number of routes that would be tested */
    routesToTest?: number;
    /** Number of drifts detected */
    driftsDetected?: number;
  };
}

// ============================================================================
// Trigger Points
// ============================================================================

/**
 * CLI commands that trigger upgrade prompts
 */
export const UPGRADE_TRIGGERS: Record<string, {
  feature: FeatureKey;
  triggerOn: string[];
  valueMessageTemplate: string;
}> = {
  'ship --reality': {
    feature: 'ship_reality' as FeatureKey,
    triggerOn: ['--reality', '-r'],
    valueMessageTemplate: 'Your last run would have caught {driftsDetected} runtime drifts.',
  },
  'ship --chaos': {
    feature: 'ship_chaos' as FeatureKey,
    triggerOn: ['--chaos'],
    valueMessageTemplate: 'AI Chaos Agent can find edge cases you would miss.',
  },
  'fix --apply': {
    feature: 'fix_apply' as FeatureKey,
    triggerOn: ['--apply', '-a'],
    valueMessageTemplate: 'Auto-fix {issuesFound} issues with one command.',
  },
  'report -f pdf': {
    feature: 'report_pdf' as FeatureKey,
    triggerOn: ['-f pdf', '--format pdf'],
    valueMessageTemplate: 'Generate shareable PDF reports for stakeholders.',
  },
  'report --compliance': {
    feature: 'report_compliance' as FeatureKey,
    triggerOn: ['--compliance', '-t compliance'],
    valueMessageTemplate: 'Meet compliance requirements with audit-ready reports.',
  },
};

// ============================================================================
// Prompt Generator
// ============================================================================

/**
 * Check if user needs upgrade for a feature
 */
export function needsUpgrade(userTier: Tier, feature: FeatureKey): boolean {
  const metadata = FEATURE_METADATA[feature];
  if (!metadata) return false;
  return !tierMeetsRequirement(userTier, metadata.requiredTier);
}

/**
 * Build upgrade prompt data
 */
export function buildUpgradePrompt(context: TriggerContext): UpgradePromptData | null {
  const metadata = FEATURE_METADATA[context.feature];
  if (!metadata) return null;

  // Check if upgrade is needed
  if (tierMeetsRequirement(context.currentTier, metadata.requiredTier)) {
    return null;
  }

  // Find trigger config
  const triggerConfig = Object.values(UPGRADE_TRIGGERS).find(
    t => t.feature === context.feature
  );

  // Build value message
  let valueMessage: string | undefined;
  if (triggerConfig && context.context) {
    valueMessage = triggerConfig.valueMessageTemplate
      .replace('{driftsDetected}', String(context.context.driftsDetected || 0))
      .replace('{issuesFound}', String(context.context.issuesFound || 0))
      .replace('{routesToTest}', String(context.context.routesToTest || 0));
  }

  return {
    feature: context.feature,
    title: metadata.title,
    reason: metadata.proReason,
    benefits: metadata.benefits,
    requiredTier: metadata.requiredTier,
    upgradeUrl: UPGRADE_URLS.FULL_DASHBOARD_CHECKOUT,
    upgradeCommand: 'vibecheck upgrade',
    valueMessage,
  };
}

// ============================================================================
// Formatted Output
// ============================================================================

/**
 * Format upgrade prompt for CLI display
 */
export function formatUpgradePrompt(prompt: UpgradePromptData): string {
  const lines: string[] = [];

  // Box top
  lines.push('\u250c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510');

  // Header
  lines.push(`\u2502  \u2b06\ufe0f  ${prompt.title} requires ${capitalize(prompt.requiredTier)}`.padEnd(54) + '\u2502');
  lines.push('\u2502'.padEnd(54) + '\u2502');

  // Value message if available
  if (prompt.valueMessage) {
    const wrapped = wrapText(prompt.valueMessage, 50);
    for (const line of wrapped) {
      lines.push(`\u2502  ${line}`.padEnd(54) + '\u2502');
    }
    lines.push('\u2502'.padEnd(54) + '\u2502');
  }

  // Benefits (show first 2)
  lines.push('\u2502  Benefits:'.padEnd(54) + '\u2502');
  for (const benefit of prompt.benefits.slice(0, 2)) {
    lines.push(`\u2502    \u2022 ${benefit}`.padEnd(54) + '\u2502');
  }
  lines.push('\u2502'.padEnd(54) + '\u2502');

  // CTA
  lines.push(`\u2502  Upgrade: ${prompt.upgradeCommand}`.padEnd(54) + '\u2502');
  lines.push(`\u2502  Or visit: ${prompt.upgradeUrl}`.padEnd(54) + '\u2502');

  // Box bottom
  lines.push('\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518');

  return lines.join('\n');
}

/**
 * Format compact upgrade prompt (single line)
 */
export function formatCompactUpgradePrompt(prompt: UpgradePromptData): string {
  return `\u2b06\ufe0f ${prompt.title} requires ${capitalize(prompt.requiredTier)}. Upgrade: ${prompt.upgradeCommand}`;
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Capitalize first letter
 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Wrap text to specified width
 */
function wrapText(text: string, width: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if (currentLine.length + word.length + 1 <= width) {
      currentLine += (currentLine ? ' ' : '') + word;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }

  if (currentLine) lines.push(currentLine);
  return lines;
}

// ============================================================================
// Feature Gate Checker
// ============================================================================

/**
 * Check feature access and return prompt if needed
 */
export function checkFeatureAccess(
  userTier: Tier,
  feature: FeatureKey,
  context?: TriggerContext['context']
): { allowed: boolean; prompt?: UpgradePromptData } {
  if (!needsUpgrade(userTier, feature)) {
    return { allowed: true };
  }

  const prompt = buildUpgradePrompt({
    command: '',
    feature,
    currentTier: userTier,
    context,
  });

  return {
    allowed: false,
    prompt: prompt || undefined,
  };
}

/**
 * Gate a feature and throw if not allowed
 */
export function gateFeature(
  userTier: Tier,
  feature: FeatureKey,
  context?: TriggerContext['context']
): void {
  const { allowed, prompt } = checkFeatureAccess(userTier, feature, context);

  if (!allowed && prompt) {
    throw new FeatureGatedError(prompt);
  }
}

/**
 * Error thrown when a feature is gated
 */
export class FeatureGatedError extends Error {
  public readonly prompt: UpgradePromptData;

  constructor(prompt: UpgradePromptData) {
    super(`${prompt.title} requires ${prompt.requiredTier} tier`);
    this.name = 'FeatureGatedError';
    this.prompt = prompt;
  }

  /**
   * Get formatted prompt for CLI display
   */
  getFormattedPrompt(): string {
    return formatUpgradePrompt(this.prompt);
  }

  /**
   * Get compact prompt
   */
  getCompactPrompt(): string {
    return formatCompactUpgradePrompt(this.prompt);
  }
}
