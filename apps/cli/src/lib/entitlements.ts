/**
 * CLI Entitlement Checking
 * 
 * Centralizes all tier/entitlement checks for the CLI.
 * Uses the shared entitlement UX map for consistent messaging.
 */

import {
  type Tier,
  type FeatureKey,
  FEATURE_METADATA,
  PLAN_DEFINITIONS,
  tierMeetsRequirement,
  hasFeatureAccess,
  UPGRADE_URLS,
} from '@repo/shared-types';
import { loadCredentials, type StoredCredentials } from './credentials.js';

// ============================================================================
// Session Management
// ============================================================================

interface CLISession {
  userId: string | null;
  tier: Tier;
  authenticated: boolean;
}

// In-memory session cache
let currentSession: CLISession = {
  userId: null,
  tier: 'free',
  authenticated: false,
};

// Track if we've loaded credentials
let credentialsLoaded = false;

/**
 * Initialize session from stored credentials (if available).
 * Called automatically when checking entitlements.
 */
async function initializeFromCredentials(): Promise<void> {
  if (credentialsLoaded) return;
  credentialsLoaded = true;
  
  try {
    const result = await loadCredentials();
    if (result.valid && result.credentials) {
      currentSession = {
        userId: result.credentials.userId ?? null,
        tier: result.credentials.tier ?? 'free',
        authenticated: true,
      };
    }
  } catch {
    // Ignore errors - fall back to defaults
  }
}

/**
 * Set the current CLI session
 */
export function setSession(session: Partial<CLISession>): void {
  currentSession = { ...currentSession, ...session };
  credentialsLoaded = true; // Mark as loaded so we don't overwrite
}

/**
 * Get the current CLI session
 */
export function getSession(): CLISession {
  return currentSession;
}

/**
 * Get the current user tier.
 * Initializes from stored credentials if not already loaded.
 */
export function getCurrentTier(): Tier {
  // Synchronously return current tier
  // For async initialization, call initializeFromCredentials() first
  return currentSession.tier;
}

/**
 * Get the current user tier (async version).
 * Ensures credentials are loaded first.
 */
export async function getCurrentTierAsync(): Promise<Tier> {
  await initializeFromCredentials();
  return currentSession.tier;
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(): boolean {
  return currentSession.authenticated;
}

/**
 * Check if user is authenticated (async version).
 * Ensures credentials are loaded first.
 */
export async function isAuthenticatedAsync(): Promise<boolean> {
  await initializeFromCredentials();
  return currentSession.authenticated;
}

// ============================================================================
// Feature Access Checking
// ============================================================================

export interface FeatureCheckResult {
  allowed: boolean;
  currentTier: Tier;
  requiredTier: Tier;
  featureKey: FeatureKey;
  featureTitle: string;
  reason: string;
  benefits: string[];
  upgradeUrl: string;
}

/**
 * Check if the current user has access to a feature
 */
export function checkFeatureAccess(featureKey: FeatureKey): FeatureCheckResult {
  const metadata = FEATURE_METADATA[featureKey];
  const currentTier = getCurrentTier();
  const allowed = hasFeatureAccess(currentTier, featureKey);
  
  return {
    allowed,
    currentTier,
    requiredTier: metadata.requiredTier,
    featureKey,
    featureTitle: metadata.title,
    reason: metadata.proReason,
    benefits: metadata.benefits,
    upgradeUrl: metadata.requiredTier === 'enterprise'
      ? UPGRADE_URLS.FULL_ENTERPRISE_CONTACT
      : UPGRADE_URLS.FULL_DASHBOARD_CHECKOUT,
  };
}

/**
 * Check if user meets minimum tier requirement
 */
export function checkTierAccess(minimumTier: Tier): {
  allowed: boolean;
  currentTier: Tier;
  requiredTier: Tier;
} {
  const currentTier = getCurrentTier();
  const allowed = tierMeetsRequirement(currentTier, minimumTier);
  
  return {
    allowed,
    currentTier,
    requiredTier: minimumTier,
  };
}

// ============================================================================
// Command Gating Configuration
// ============================================================================

/**
 * Commands that require specific tiers
 */
export const COMMAND_TIER_REQUIREMENTS: Record<string, {
  tier: Tier;
  featureKey: FeatureKey;
}> = {
  // Pro commands
  'report --type executive-summary': {
    tier: 'pro',
    featureKey: 'enterprise_reports',
  },
  'report --type compliance': {
    tier: 'pro',
    featureKey: 'enterprise_reports',
  },
  'report --format pdf': {
    tier: 'pro',
    featureKey: 'enterprise_reports',
  },
  // Enterprise commands
  'ship --sso': {
    tier: 'enterprise',
    featureKey: 'sso',
  },
};

/**
 * Options that require specific tiers (applied to any command)
 */
export const OPTION_TIER_REQUIREMENTS: Record<string, {
  tier: Tier;
  featureKey: FeatureKey;
}> = {
  '--cloud-sync': {
    tier: 'pro',
    featureKey: 'cloud_sync',
  },
  '--team-dashboard': {
    tier: 'pro',
    featureKey: 'team_dashboard',
  },
  '--webhook': {
    tier: 'pro',
    featureKey: 'webhooks',
  },
  '--api-key': {
    tier: 'pro',
    featureKey: 'api_access',
  },
  '--custom-rule': {
    tier: 'pro',
    featureKey: 'custom_rules',
  },
  '--ci-gate': {
    tier: 'pro',
    featureKey: 'ci_gate',
  },
  '--sso': {
    tier: 'enterprise',
    featureKey: 'sso',
  },
  '--audit-log': {
    tier: 'enterprise',
    featureKey: 'audit_logs',
  },
};

/**
 * Check if a command + options combination is allowed
 */
export function checkCommandAccess(
  command: string,
  options: string[]
): FeatureCheckResult | null {
  // Check command-level gating
  const cmdRequirement = COMMAND_TIER_REQUIREMENTS[command];
  if (cmdRequirement) {
    const result = checkFeatureAccess(cmdRequirement.featureKey);
    if (!result.allowed) {
      return result;
    }
  }
  
  // Check option-level gating
  for (const option of options) {
    const optRequirement = OPTION_TIER_REQUIREMENTS[option];
    if (optRequirement) {
      const result = checkFeatureAccess(optRequirement.featureKey);
      if (!result.allowed) {
        return result;
      }
    }
  }
  
  return null; // All checks passed
}

// ============================================================================
// Exit Codes
// ============================================================================

/**
 * Exit codes for tier-gated commands
 * 
 * Convention:
 * - 0: Success
 * - 1: General error
 * - 2: Fatal error
 * - 10: Tier/entitlement gate (user needs to upgrade)
 * - 130: Interrupted (SIGINT)
 */
export const EXIT_CODES = {
  SUCCESS: 0,
  ERROR: 1,
  FATAL: 2,
  TIER_GATE: 10,
  INTERRUPTED: 130,
} as const;
