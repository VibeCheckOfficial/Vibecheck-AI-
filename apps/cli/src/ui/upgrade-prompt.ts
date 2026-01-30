/**
 * CLI Upgrade Prompt
 * 
 * Premium, clear upgrade messaging for when users hit Pro-gated features.
 * Uses the unified entitlement UX map for consistent messaging.
 * 
 * Features:
 * - Beautiful box-style card
 * - Feature-specific benefits (not generic)
 * - Clear upgrade path
 * - Exact command to rerun
 * - No stack traces or technical jargon
 */

import chalk from 'chalk';
import { 
  box, 
  colors, 
  symbols, 
  brandGradient, 
  divider,
  formatListItem,
} from './theme.js';
import {
  type FeatureKey,
  FEATURE_METADATA,
  PLAN_DEFINITIONS,
  UPGRADE_URLS,
  type Tier,
} from '@repo/shared-types';
import { getEnvironment, getSafeTerminalWidth } from '../lib/environment.js';
import { type FeatureCheckResult, EXIT_CODES } from '../lib/entitlements.js';

// ============================================================================
// Upgrade Card Renderer
// ============================================================================

export interface UpgradePromptOptions {
  /** The feature that was blocked */
  featureKey: FeatureKey;
  /** The full command the user ran */
  attemptedCommand: string;
  /** Current user tier */
  currentTier: Tier;
  /** Whether to include "rerun" suggestion */
  showRerunHint?: boolean;
}

/**
 * Render a premium upgrade prompt card
 */
export function renderUpgradePrompt(options: UpgradePromptOptions): string {
  const { featureKey, attemptedCommand, currentTier, showRerunHint = true } = options;
  const metadata = FEATURE_METADATA[featureKey];
  const requiredPlan = PLAN_DEFINITIONS[metadata.requiredTier];
  const isEnterprise = metadata.requiredTier === 'enterprise';
  
  const env = getEnvironment();
  const width = Math.min(getSafeTerminalWidth(80), 60);
  const useUnicode = env.terminal.unicode;
  
  // Box characters
  const chars = useUnicode
    ? { tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│', bullet: '•' }
    : { tl: '+', tr: '+', bl: '+', br: '+', h: '-', v: '|', bullet: '*' };
  
  const lines: string[] = [];
  const innerWidth = width - 4; // Account for borders and padding
  
  // Helper to pad line
  const pad = (text: string, fill = ' '): string => {
    const visibleLen = stripAnsi(text).length;
    const padding = Math.max(0, innerWidth - visibleLen);
    return text + fill.repeat(padding);
  };
  
  // Helper to center text
  const center = (text: string): string => {
    const visibleLen = stripAnsi(text).length;
    const padding = Math.max(0, innerWidth - visibleLen);
    const left = Math.floor(padding / 2);
    const right = padding - left;
    return ' '.repeat(left) + text + ' '.repeat(right);
  };
  
  // Top border
  const headerText = ` PRO FEATURE: ${metadata.title.toUpperCase()} `;
  const headerPadding = width - 2 - headerText.length;
  const leftPad = Math.floor(headerPadding / 2);
  const rightPad = headerPadding - leftPad;
  
  lines.push(
    colors.primary(chars.tl) +
    colors.primary(chars.h.repeat(leftPad)) +
    chalk.bold.yellow(headerText) +
    colors.primary(chars.h.repeat(rightPad)) +
    colors.primary(chars.tr)
  );
  
  // Separator
  lines.push(
    colors.primary(chars.v) +
    colors.muted(chars.h.repeat(innerWidth)) +
    colors.primary(chars.v)
  );
  
  // Empty line
  lines.push(colors.primary(chars.v) + pad('') + colors.primary(chars.v));
  
  // "You tried" line
  const youTried = `You ran: ${colors.code(truncateCommand(attemptedCommand, innerWidth - 12))}`;
  lines.push(colors.primary(chars.v) + ' ' + pad(youTried) + colors.primary(chars.v));
  
  // Empty line
  lines.push(colors.primary(chars.v) + pad('') + colors.primary(chars.v));
  
  // "This is Pro because" line
  const reasonLines = wrapText(metadata.proReason, innerWidth - 2);
  lines.push(colors.primary(chars.v) + ' ' + pad(colors.muted('This requires ' + requiredPlan.name + ':')) + colors.primary(chars.v));
  for (const line of reasonLines) {
    lines.push(colors.primary(chars.v) + ' ' + pad(line) + colors.primary(chars.v));
  }
  
  // Empty line
  lines.push(colors.primary(chars.v) + pad('') + colors.primary(chars.v));
  
  // Benefits header
  lines.push(colors.primary(chars.v) + ' ' + pad(chalk.bold(`What ${requiredPlan.name} unlocks:`)) + colors.primary(chars.v));
  
  // Benefits list
  for (const benefit of metadata.benefits.slice(0, 4)) {
    const bulletLine = `  ${chars.bullet} ${benefit}`;
    const wrappedBenefit = wrapText(bulletLine, innerWidth - 2);
    for (const line of wrappedBenefit) {
      lines.push(colors.primary(chars.v) + ' ' + pad(colors.success(line)) + colors.primary(chars.v));
    }
  }
  
  // Empty line
  lines.push(colors.primary(chars.v) + pad('') + colors.primary(chars.v));
  
  // Upgrade URL
  const upgradeUrl = isEnterprise
    ? UPGRADE_URLS.FULL_ENTERPRISE_CONTACT
    : UPGRADE_URLS.FULL_DASHBOARD_CHECKOUT;
  
  lines.push(colors.primary(chars.v) + ' ' + pad(chalk.bold('Upgrade:') + ' ' + colors.info(upgradeUrl)) + colors.primary(chars.v));
  
  // Rerun hint
  if (showRerunHint && !isEnterprise) {
    lines.push(colors.primary(chars.v) + ' ' + pad(colors.muted('Then rerun: ') + colors.code(truncateCommand(attemptedCommand, innerWidth - 15))) + colors.primary(chars.v));
  }
  
  // Empty line
  lines.push(colors.primary(chars.v) + pad('') + colors.primary(chars.v));
  
  // Bottom border
  lines.push(
    colors.primary(chars.bl) +
    colors.primary(chars.h.repeat(width - 2)) +
    colors.primary(chars.br)
  );
  
  return lines.join('\n');
}

/**
 * Print upgrade prompt to console
 */
export function printUpgradePrompt(options: UpgradePromptOptions): void {
  console.log('');
  console.log(renderUpgradePrompt(options));
  console.log('');
}

/**
 * Print a simple one-liner upgrade message (for less intrusive contexts)
 */
export function printUpgradeHint(featureKey: FeatureKey): void {
  const metadata = FEATURE_METADATA[featureKey];
  const plan = PLAN_DEFINITIONS[metadata.requiredTier];
  const url = metadata.requiredTier === 'enterprise'
    ? UPGRADE_URLS.FULL_ENTERPRISE_CONTACT
    : UPGRADE_URLS.FULL_DASHBOARD_CHECKOUT;
  
  console.log('');
  console.log(
    colors.warning(symbols.raw.warning) +
    ' ' +
    chalk.bold(metadata.title) +
    ' requires ' +
    chalk.bold(plan.name) +
    '. Upgrade: ' +
    colors.info(url)
  );
  console.log('');
}

// ============================================================================
// Gate Handler
// ============================================================================

export interface GateHandlerOptions {
  /** The feature to check */
  featureKey: FeatureKey;
  /** The full command that was attempted */
  attemptedCommand: string;
  /** Current user tier */
  currentTier: Tier;
  /** Whether this is a "verdict command" (affects exit code) */
  isVerdictCommand?: boolean;
}

/**
 * Handle a tier gate - prints upgrade prompt and returns appropriate exit code
 */
export function handleTierGate(options: GateHandlerOptions): number {
  const { featureKey, attemptedCommand, currentTier, isVerdictCommand = false } = options;
  
  printUpgradePrompt({
    featureKey,
    attemptedCommand,
    currentTier,
    showRerunHint: true,
  });
  
  // For verdict commands (scan, check, validate, ship), return non-zero
  // For utility commands (config, report), return the tier gate code
  return isVerdictCommand ? EXIT_CODES.ERROR : EXIT_CODES.TIER_GATE;
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Strip ANSI codes from string
 */
function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
}

/**
 * Truncate command if too long
 */
function truncateCommand(command: string, maxLen: number): string {
  if (command.length <= maxLen) return command;
  return command.slice(0, maxLen - 3) + '...';
}

/**
 * Wrap text to fit within width
 */
function wrapText(text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';
  
  for (const word of words) {
    if (currentLine.length + word.length + 1 <= maxWidth) {
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
// Pre-built Messages for Common Scenarios
// ============================================================================

/**
 * Print message when user tries to use cloud sync without Pro
 */
export function printCloudSyncRequired(command: string, tier: Tier): void {
  printUpgradePrompt({
    featureKey: 'cloud_sync',
    attemptedCommand: command,
    currentTier: tier,
  });
}

/**
 * Print message when user tries to generate enterprise reports without Pro
 */
export function printEnterpriseReportsRequired(command: string, tier: Tier): void {
  printUpgradePrompt({
    featureKey: 'enterprise_reports',
    attemptedCommand: command,
    currentTier: tier,
  });
}

/**
 * Print message when user tries to use CI gate without Pro
 */
export function printCIGateRequired(command: string, tier: Tier): void {
  printUpgradePrompt({
    featureKey: 'ci_gate',
    attemptedCommand: command,
    currentTier: tier,
  });
}

/**
 * Print message when user tries to use custom rules without Pro
 */
export function printCustomRulesRequired(command: string, tier: Tier): void {
  printUpgradePrompt({
    featureKey: 'custom_rules',
    attemptedCommand: command,
    currentTier: tier,
  });
}
