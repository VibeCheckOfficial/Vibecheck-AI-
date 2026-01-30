/**
 * Tier Gating
 * 
 * Access control based on user subscription tier.
 */

import type {
  CommandDefinition,
  CommandAccess,
  Tier,
} from './types.js';
import { TIER_INFO } from './types.js';
import { resolveCommand } from './registry.js';

// ============================================================================
// Tier Comparison
// ============================================================================

const TIER_LEVELS: Record<Tier, number> = {
  free: 0,
  pro: 1,
  enterprise: 2,
};

/**
 * Check if tier A has access to tier B features
 */
export function tierHasAccess(userTier: Tier, requiredTier: Tier): boolean {
  return TIER_LEVELS[userTier] >= TIER_LEVELS[requiredTier];
}

/**
 * Check if a command requires Pro or higher
 */
export function requiresPro(command: CommandDefinition): boolean {
  return command.tier === 'pro' || command.tier === 'enterprise';
}

/**
 * Check if a command requires Enterprise
 */
export function requiresEnterprise(command: CommandDefinition): boolean {
  return command.tier === 'enterprise';
}

/**
 * @deprecated Use requiresPro instead
 */
export function requiresTeam(command: CommandDefinition): boolean {
  return requiresPro(command);
}

/**
 * Check if a command is free
 */
export function isFreeCommand(command: CommandDefinition): boolean {
  return command.tier === 'free';
}

// ============================================================================
// Access Control
// ============================================================================

/**
 * Check if user has access to a command
 */
export function checkCommandAccess(
  commandName: string,
  userTier: Tier,
  options: { skipAuth?: boolean } = {}
): CommandAccess {
  const resolved = resolveCommand(commandName);

  if (!resolved) {
    return {
      allowed: false,
      userTier,
      requiredTier: 'free',
      reason: `Unknown command: ${commandName}`,
    };
  }

  const { command } = resolved;

  // Commands can skip auth check
  if (command.skipAuth || options.skipAuth) {
    return {
      allowed: true,
      userTier,
      requiredTier: command.tier,
    };
  }

  // Check tier access
  if (tierHasAccess(userTier, command.tier)) {
    return {
      allowed: true,
      userTier,
      requiredTier: command.tier,
    };
  }

  // Access denied
  return {
    allowed: false,
    userTier,
    requiredTier: command.tier,
    reason: `Command '${command.name}' requires ${TIER_INFO[command.tier].name} tier`,
    upgradeUrl: 'https://vibecheckai.dev/pricing',
  };
}

/**
 * Enforce command access (throws if denied)
 */
export function enforceCommandAccess(
  commandName: string,
  userTier: Tier,
  options: { skipAuth?: boolean } = {}
): CommandDefinition {
  const access = checkCommandAccess(commandName, userTier, options);

  if (!access.allowed) {
    throw new TierAccessError(access.reason ?? 'Access denied', {
      commandName,
      userTier,
      requiredTier: access.requiredTier,
      upgradeUrl: access.upgradeUrl,
    });
  }

  const resolved = resolveCommand(commandName);
  return resolved!.command;
}

// ============================================================================
// Tier Access Error
// ============================================================================

export class TierAccessError extends Error {
  public readonly commandName: string;
  public readonly userTier: Tier;
  public readonly requiredTier: Tier;
  public readonly upgradeUrl?: string;

  constructor(
    message: string,
    options: {
      commandName: string;
      userTier: Tier;
      requiredTier: Tier;
      upgradeUrl?: string;
    }
  ) {
    super(message);
    this.name = 'TierAccessError';
    this.commandName = options.commandName;
    this.userTier = options.userTier;
    this.requiredTier = options.requiredTier;
    this.upgradeUrl = options.upgradeUrl;
  }
}

// ============================================================================
// Upsell Messages
// ============================================================================

/**
 * Format denial message for user
 */
export function formatDeniedMessage(access: CommandAccess): string {
  if (access.allowed) {
    return '';
  }

  const lines = [
    `❌ ${access.reason}`,
    '',
    `Your tier: ${TIER_INFO[access.userTier].name}`,
    `Required: ${TIER_INFO[access.requiredTier].name}`,
  ];

  if (access.upgradeUrl) {
    lines.push('', `Upgrade at: ${access.upgradeUrl}`);
  }

  return lines.join('\n');
}

/**
 * Format tier badge for display
 */
export function formatTierBadge(tier: Tier): string {
  const info = TIER_INFO[tier];
  return `[${info.name}]`;
}

// ============================================================================
// Dev Mode
// ============================================================================

let devMode = false;

/**
 * Enable dev mode (bypasses tier checks)
 */
export function enableDevMode(): void {
  devMode = true;
}

/**
 * Disable dev mode
 */
export function disableDevMode(): void {
  devMode = false;
}

/**
 * Check if dev mode is enabled
 */
export function isDevMode(): boolean {
  return devMode || process.env['VIBECHECK_DEV_PRO'] === '1';
}

/**
 * Get effective tier (considers dev mode)
 */
export function getEffectiveTier(userTier: Tier): Tier {
  if (isDevMode()) {
    return 'pro';
  }
  return userTier;
}
