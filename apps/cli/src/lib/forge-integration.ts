/**
 * Forge Integration
 *
 * Internal integration for running Forge as part of existing CLI commands.
 * NOT exposed as a public command per merge rules.
 * 
 * Forge generates AI context rules for IDE integration (Cursor, Windsurf).
 * The output is tiered based on user entitlements:
 * - Free: minimal tier (up to 5 rules)
 * - Pro: extended tier (up to 20 rules + AI contract)
 * - Enterprise: comprehensive tier (up to 50 rules + all features)
 *
 * @module forge-integration
 * @internal This module is internal and should not be exposed as a public CLI command
 */

import path from 'node:path';
import chalk from 'chalk';
import { forge, type ForgeConfig, type ForgeOutput, type RuleTier } from '@vibecheck/core';
import {
  FEATURE_KEYS,
  hasFeatureAccess,
  type Tier,
} from '@repo/shared-types';
import { formatDuration } from '../ui/theme.js';
import type { Logger } from './logger.js';

/**
 * Options for running Forge integration.
 */
export interface ForgeIntegrationOptions {
  /** Absolute path to the project root */
  projectPath: string;
  /** User's subscription tier for entitlement checking */
  userTier: Tier;
  /** Enable verbose output with additional details */
  verbose?: boolean;
  /** Output results as JSON (for CI/programmatic use) */
  json?: boolean;
  /** Suppress non-essential output */
  quiet?: boolean;
  /** Logger instance for output */
  logger: Logger;
}

/**
 * Result from running Forge integration.
 */
export interface ForgeIntegrationResult {
  /** Whether Forge was actually run */
  ran: boolean;
  /** Whether Forge completed successfully */
  success: boolean;
  /** Forge output data (only if ran and succeeded) */
  output?: ForgeOutput;
  /** Error message (only if ran and failed) */
  error?: string;
  /** Whether user needs to upgrade for requested features */
  needsUpgrade?: boolean;
  /** Tier required for the requested features */
  requiredTier?: Tier;
}

/**
 * Forge tier configuration based on entitlements.
 */
export interface ForgeTierConfig {
  /** Rule tier level */
  tier: RuleTier;
  /** Maximum number of rules to generate */
  maxRules: number;
}

/** Rule limits per tier */
const TIER_RULE_LIMITS: Readonly<Record<RuleTier, number>> = Object.freeze({
  minimal: 5,
  standard: 10,
  extended: 20,
  comprehensive: 50,
});

/**
 * Get the appropriate Forge tier configuration based on user entitlements.
 * 
 * Checks entitlements from highest to lowest tier and returns the
 * configuration for the highest tier the user has access to.
 * 
 * @param userTier - The user's subscription tier
 * @returns Forge configuration with tier and rule limit
 * 
 * @example
 * ```typescript
 * const config = getForgeConfigForTier('pro');
 * // Returns: { tier: 'extended', maxRules: 20 }
 * ```
 */
export function getForgeConfigForTier(userTier: Tier): ForgeTierConfig {
  // Check entitlements from highest to lowest
  if (hasFeatureAccess(userTier, FEATURE_KEYS.FORGE_COMPREHENSIVE)) {
    return { tier: 'comprehensive', maxRules: TIER_RULE_LIMITS.comprehensive };
  }
  if (hasFeatureAccess(userTier, FEATURE_KEYS.FORGE_EXTENDED)) {
    return { tier: 'extended', maxRules: TIER_RULE_LIMITS.extended };
  }
  // Free tier always has access to basic Forge
  return { tier: 'minimal', maxRules: TIER_RULE_LIMITS.minimal };
}

/**
 * Run Forge as part of an existing command.
 *
 * This is the internal integration point - Forge is NOT exposed as a public command.
 * Instead, it's called internally from scan, fix, or ship commands.
 * 
 * @param options - Configuration options for Forge execution
 * @returns Result indicating success/failure and generated output
 * 
 * @example
 * ```typescript
 * const result = await runForgeInternal({
 *   projectPath: '/path/to/project',
 *   userTier: 'pro',
 *   logger: getLogger(),
 * });
 * 
 * if (result.success) {
 *   console.log(`Generated ${result.output?.stats.rulesGenerated} rules`);
 * }
 * ```
 * 
 * @remarks
 * - This function never throws - errors are returned in the result
 * - Output is controlled by the `quiet` and `json` options
 * - AI Contract generation requires Pro tier or higher
 * 
 * @internal This function should not be exposed in the public CLI
 */
export async function runForgeInternal(
  options: ForgeIntegrationOptions
): Promise<ForgeIntegrationResult> {
  // Input validation
  if (!options.projectPath || options.projectPath.trim().length === 0) {
    return {
      ran: false,
      success: false,
      error: 'projectPath is required',
    };
  }

  if (!options.logger) {
    return {
      ran: false,
      success: false,
      error: 'logger is required',
    };
  }

  const { projectPath, userTier, verbose, json, quiet, logger } = options;

  try {
    // Get appropriate tier based on entitlements
    const forgeConfig = getForgeConfigForTier(userTier);

    if (!quiet && !json) {
      logger.info(`Generating AI context rules (${forgeConfig.tier} tier, max ${forgeConfig.maxRules} rules)...`);
    }

    // Build Forge config
    const config: Partial<ForgeConfig> = {
      tier: forgeConfig.tier,
      maxRules: forgeConfig.maxRules,
      incremental: true,
      generateContract: hasFeatureAccess(userTier, FEATURE_KEYS.FORGE_EXTENDED),
      verbose: verbose ?? false,
      platforms: ['cursor', 'windsurf'],
    };

    // Run Forge
    const output = await forge(projectPath, config);

    if (!quiet && !json) {
      if (output.stats.rulesGenerated > 0) {
        logger.success(`Generated ${output.stats.rulesGenerated} AI context rules`);
        if (verbose) {
          logger.dim(`  Files written: ${output.stats.filesWritten}`);
          logger.dim(`  Time: ${formatDuration(output.stats.timeMs)}`);
          if (output.stats.incremental) {
            logger.dim(`  Incremental: ${output.stats.rulesSkipped} skipped, ${output.stats.rulesPruned} pruned`);
          }
          if (output.contract) {
            logger.dim(`  AI Contract: generated with ${output.contract.forbidden.length} forbidden actions`);
          }
        }
      } else if (output.stats.rulesSkipped > 0) {
        logger.dim(`AI context rules unchanged (${output.stats.rulesSkipped} rules up to date)`);
      }
    }

    return {
      ran: true,
      success: true,
      output,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (!quiet && !json) {
      logger.warn(`Could not generate AI context rules: ${message}`);
    }

    return {
      ran: true,
      success: false,
      error: message,
    };
  }
}

/**
 * Formatted Forge output for JSON serialization.
 */
export interface ForgeJsonOutput {
  /** Number of rules generated */
  rulesGenerated: number;
  /** Number of files written */
  filesWritten: number;
  /** Time taken in milliseconds */
  timeMs: number;
  /** Whether incremental mode was used */
  incremental: boolean;
  /** Number of rules skipped (unchanged) */
  rulesSkipped: number;
  /** Number of rules pruned (removed) */
  rulesPruned: number;
  /** List of files that were written */
  files: string[];
  /** Whether an AI contract was generated */
  hasContract: boolean;
  /** Generated rules summary */
  rules: Array<{
    id: string;
    category: string;
    name: string;
    impact: string;
  }>;
}

/**
 * Format Forge output for JSON serialization.
 * 
 * Extracts relevant data from ForgeOutput for JSON output,
 * suitable for CI/CD pipelines or programmatic consumption.
 * 
 * @param output - The raw Forge output
 * @returns Formatted output object suitable for JSON serialization
 * 
 * @example
 * ```typescript
 * const result = await runForgeInternal(options);
 * if (result.success && result.output) {
 *   const jsonOutput = formatForgeOutputForJson(result.output);
 *   console.log(JSON.stringify(jsonOutput, null, 2));
 * }
 * ```
 */
export function formatForgeOutputForJson(output: ForgeOutput): ForgeJsonOutput {
  return {
    rulesGenerated: output.stats.rulesGenerated,
    filesWritten: output.stats.filesWritten,
    timeMs: output.stats.timeMs,
    incremental: output.stats.incremental,
    rulesSkipped: output.stats.rulesSkipped,
    rulesPruned: output.stats.rulesPruned,
    files: output.files,
    hasContract: Boolean(output.contract),
    rules: output.manifest.rules.map((r) => ({
      id: r.id,
      category: r.category,
      name: r.name,
      impact: String(r.impact),
    })),
  };
}

/**
 * Configuration for auto-Forge behavior.
 */
export interface AutoForgeConfig {
  /** Explicit opt-in/out for auto-Forge */
  autoForge?: boolean;
}

/**
 * Check if Forge should run automatically after scan.
 *
 * Returns true if any of these conditions are met:
 * 1. User has explicitly opted in via config (`autoForge: true`)
 * 2. `.cursor/rules/` directory exists (indicates user wants AI context)
 * 3. `.cursorrules` file exists (legacy Cursor rules file)
 * 
 * @param projectPath - Absolute path to the project root
 * @param config - Configuration with optional autoForge setting
 * @returns `true` if Forge should run automatically
 * 
 * @example
 * ```typescript
 * if (shouldRunForgeAfterScan(projectPath, config)) {
 *   await runForgeInternal({ projectPath, ... });
 * }
 * ```
 */
export function shouldRunForgeAfterScan(
  projectPath: string,
  config: AutoForgeConfig
): boolean {
  // Input validation
  if (!projectPath || projectPath.trim().length === 0) {
    return false;
  }

  // Check explicit config
  if (config.autoForge !== undefined) {
    return config.autoForge;
  }

  // Check for existing Cursor rules (indicates user wants AI context)
  // Using require to avoid top-level import side effects
  const fs = require('node:fs') as typeof import('node:fs');
  const cursorRulesDir = path.join(projectPath, '.cursor', 'rules');
  const cursorRulesFile = path.join(projectPath, '.cursorrules');

  return fs.existsSync(cursorRulesDir) || fs.existsSync(cursorRulesFile);
}

/**
 * Print upgrade suggestion for Forge features.
 * 
 * Shows tier-appropriate messaging about available Forge upgrades.
 * Does nothing for Enterprise tier (already at maximum).
 * 
 * @param currentTier - The user's current subscription tier
 * @param logger - Logger instance for output
 * 
 * @example
 * ```typescript
 * // After running Forge for a free user
 * printForgeUpgradeSuggestion('free', logger);
 * // Outputs suggestion to upgrade to Pro
 * ```
 */
export function printForgeUpgradeSuggestion(
  currentTier: Tier,
  logger: Logger
): void {
  // Input validation
  if (!logger) {
    return;
  }

  if (currentTier === 'free') {
    logger.newline();
    logger.info(chalk.cyan('Tip: Upgrade to Pro for extended AI context rules'));
    logger.dim('  - 20 rules instead of 5');
    logger.dim('  - AI Contract generation');
    logger.dim('  - Security and performance rules');
    logger.dim('  - Run: vibecheck upgrade');
  } else if (currentTier === 'pro') {
    logger.newline();
    logger.info(chalk.cyan('Enterprise includes comprehensive AI context'));
    logger.dim('  - 50 rules with all categories');
    logger.dim('  - Custom subagents and skills');
    logger.dim('  - Contact sales for details');
  }
  // Enterprise tier: no upgrade available, don't show message
}
