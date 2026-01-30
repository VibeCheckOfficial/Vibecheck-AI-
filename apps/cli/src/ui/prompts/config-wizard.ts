/**
 * Configuration editing wizard using Clack prompts
 *
 * Provides an interactive UI for editing VibeCheck configuration values.
 * Uses @clack/prompts for a modern terminal experience with
 * spinners, multi-select, and text input.
 *
 * @module ui/prompts/config-wizard
 *
 * @example
 * ```typescript
 * import { runConfigWizard } from './config-wizard.js';
 *
 * const config = await loadConfig();
 * const changes = await runConfigWizard(config);
 *
 * if (changes) {
 *   const newConfig = { ...config, ...changes };
 *   await writeConfig(newConfig, configPath);
 * }
 * ```
 */

import * as p from '@clack/prompts';
import chalk from 'chalk';
import { type VibeCheckConfig } from '../../lib/config.js';
import { shouldPrompt } from '../../lib/environment.js';

// ============================================================================
// Types
// ============================================================================

/** Configuration section identifiers */
type ConfigSection = 'rules' | 'validation' | 'watch' | 'output';

/** Section option for the main menu */
interface SectionOption {
  /** Section identifier */
  value: ConfigSection;
  /** Display label */
  label: string;
  /** Additional hint text */
  hint: string;
}

// ============================================================================
// Constants
// ============================================================================

/** Available configuration sections for the wizard */
const CONFIG_SECTIONS: readonly SectionOption[] = [
  { value: 'rules', label: 'Scanners', hint: 'Enable/disable scanners' },
  { value: 'validation', label: 'Validation', hint: 'Validation settings' },
  { value: 'watch', label: 'Watch Mode', hint: 'File watching settings' },
  { value: 'output', label: 'Output', hint: 'Output format and paths' },
] as const;

// ============================================================================
// Main Export
// ============================================================================

/**
 * Interactively edit configuration values via wizard
 *
 * Presents a multi-step interactive UI for editing configuration.
 * Returns partial config changes that can be merged with existing config.
 *
 * @param currentConfig - Current configuration to use as defaults
 * @returns Partial configuration with changes, or null if cancelled
 *
 * @example
 * ```typescript
 * const config = await loadConfig();
 * const changes = await runConfigWizard(config);
 *
 * if (changes) {
 *   const merged = mergeConfig({ ...config, ...changes });
 *   await writeConfig(merged, configPath);
 * }
 * ```
 */
export async function runConfigWizard(
  currentConfig: VibeCheckConfig
): Promise<Partial<VibeCheckConfig> | null> {
  // Check if we're in an interactive terminal
  if (!shouldPrompt()) {
    return null;
  }

  p.intro(chalk.cyan('vibecheck config'));

  const section = await p.select<SectionOption[], ConfigSection>({
    message: 'What would you like to configure?',
    options: [...CONFIG_SECTIONS],
  });

  if (p.isCancel(section)) {
    p.cancel('Configuration cancelled.');
    return null;
  }

  // Route to appropriate section handler
  switch (section) {
    case 'rules':
      return configureRules(currentConfig);
    case 'validation':
      return configureValidation(currentConfig);
    case 'watch':
      return configureWatch(currentConfig);
    case 'output':
      return configureOutput(currentConfig);
    default: {
      // Exhaustive check - TypeScript will error if a case is missed
      const _exhaustive: never = section;
      return null;
    }
  }
}

// ============================================================================
// Section Handlers
// ============================================================================

/** Available scanner rule options */
const SCANNER_OPTIONS = [
  { value: 'routes', label: 'Routes', hint: 'API routes and endpoints' },
  { value: 'env', label: 'Environment', hint: 'Environment variables' },
  { value: 'auth', label: 'Auth', hint: 'Authentication patterns' },
  { value: 'contracts', label: 'Contracts', hint: 'API contracts and types' },
  { value: 'ui', label: 'UI Graph', hint: 'Component relationships' },
] as const;

/**
 * Configure scanner rules via interactive selection
 *
 * Presents a multi-select prompt for enabling/disabling scanners.
 *
 * @param currentConfig - Current configuration with existing rules
 * @returns Partial config with updated rules, or null if cancelled
 * @internal
 */
async function configureRules(
  currentConfig: VibeCheckConfig
): Promise<Partial<VibeCheckConfig> | null> {
  const rules = await p.multiselect({
    message: 'Select scanners to enable:',
    options: [...SCANNER_OPTIONS],
    initialValues: currentConfig.rules,
    required: true,
  });

  if (p.isCancel(rules)) {
    p.cancel('Scanner configuration cancelled.');
    return null;
  }

  p.outro(chalk.green('Rules updated!'));
  return { rules: rules as VibeCheckConfig['rules'] };
}

/**
 * Configure validation settings via interactive prompts
 *
 * Allows setting strict mode, fail-fast behavior, and error limits.
 *
 * @param currentConfig - Current configuration with existing validation settings
 * @returns Partial config with updated validation, or null if cancelled
 * @internal
 */
async function configureValidation(
  currentConfig: VibeCheckConfig
): Promise<Partial<VibeCheckConfig> | null> {
  const strict = await p.confirm({
    message: 'Enable strict mode?',
    initialValue: currentConfig.strict,
  });

  if (p.isCancel(strict)) {
    p.cancel('Validation configuration cancelled.');
    return null;
  }

  const failFast = await p.confirm({
    message: 'Stop on first error (fail-fast)?',
    initialValue: currentConfig.validation.failFast,
  });

  if (p.isCancel(failFast)) {
    p.cancel('Validation configuration cancelled.');
    return null;
  }

  const maxErrorsStr = await p.text({
    message: 'Maximum errors to report:',
    initialValue: String(currentConfig.validation.maxErrors),
    validate: (value: string): string | undefined => {
      const num = parseInt(value, 10);
      if (isNaN(num) || num < 1) {
        return 'Please enter a valid positive number (minimum 1)';
      }
      if (num > 1000) {
        return 'Maximum errors cannot exceed 1000';
      }
      return undefined;
    },
  });

  if (p.isCancel(maxErrorsStr)) {
    p.cancel('Validation configuration cancelled.');
    return null;
  }

  p.outro(chalk.green('Validation settings updated!'));

  return {
    strict: strict as boolean,
    validation: {
      ...currentConfig.validation,
      failFast: failFast as boolean,
      maxErrors: parseInt(maxErrorsStr as string, 10),
    },
  };
}

/**
 * Configure watch mode settings via interactive prompts
 *
 * Allows setting file include/exclude patterns and debounce timing.
 *
 * @param currentConfig - Current configuration with existing watch settings
 * @returns Partial config with updated watch settings, or null if cancelled
 * @internal
 */
async function configureWatch(
  currentConfig: VibeCheckConfig
): Promise<Partial<VibeCheckConfig> | null> {
  const includeStr = await p.text({
    message: 'Include patterns (comma-separated):',
    initialValue: currentConfig.watch.include.join(', '),
    placeholder: 'src/**/*.ts, src/**/*.tsx',
    validate: (value: string): string | undefined => {
      if (!value.trim()) {
        return 'At least one include pattern is required';
      }
      return undefined;
    },
  });

  if (p.isCancel(includeStr)) {
    p.cancel('Watch configuration cancelled.');
    return null;
  }

  const excludeStr = await p.text({
    message: 'Exclude patterns (comma-separated):',
    initialValue: currentConfig.watch.exclude.join(', '),
    placeholder: 'node_modules, dist, build',
  });

  if (p.isCancel(excludeStr)) {
    p.cancel('Watch configuration cancelled.');
    return null;
  }

  const debounceStr = await p.text({
    message: 'Debounce delay (ms):',
    initialValue: String(currentConfig.watch.debounce),
    validate: (value: string): string | undefined => {
      const num = parseInt(value, 10);
      if (isNaN(num) || num < 0) {
        return 'Please enter a valid non-negative number';
      }
      if (num < 50) {
        return 'Debounce must be at least 50ms for stability';
      }
      if (num > 10000) {
        return 'Debounce cannot exceed 10000ms (10 seconds)';
      }
      return undefined;
    },
  });

  if (p.isCancel(debounceStr)) {
    p.cancel('Watch configuration cancelled.');
    return null;
  }

  p.outro(chalk.green('Watch settings updated!'));

  // Parse comma-separated patterns into arrays
  const includePatterns = (includeStr as string)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const excludePatterns = (excludeStr as string)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    watch: {
      include: includePatterns,
      exclude: excludePatterns,
      debounce: parseInt(debounceStr as string, 10),
    },
  };
}

/** Output format options */
const OUTPUT_FORMAT_OPTIONS = [
  { value: 'pretty', label: 'Pretty', hint: 'Human-readable with colors' },
  { value: 'json', label: 'JSON', hint: 'Machine-readable JSON' },
] as const;

/**
 * Configure output settings via interactive prompts
 *
 * Allows setting output format and truthpack storage path.
 *
 * @param currentConfig - Current configuration with existing output settings
 * @returns Partial config with updated output settings, or null if cancelled
 * @internal
 */
async function configureOutput(
  currentConfig: VibeCheckConfig
): Promise<Partial<VibeCheckConfig> | null> {
  const output = await p.select({
    message: 'Default output format:',
    options: [...OUTPUT_FORMAT_OPTIONS],
    initialValue: currentConfig.output,
  });

  if (p.isCancel(output)) {
    p.cancel('Output configuration cancelled.');
    return null;
  }

  const truthpackPath = await p.text({
    message: 'Truthpack storage path:',
    initialValue: currentConfig.truthpackPath,
    placeholder: '.vibecheck/truthpack',
    validate: (value: string): string | undefined => {
      if (!value.trim()) {
        return 'Truthpack path cannot be empty';
      }
      // Basic path validation - no absolute paths outside project
      if (value.startsWith('/') || value.match(/^[A-Z]:\\/i)) {
        // Allow absolute paths but warn if they look suspicious
        // TODO: Consider stricter validation for security
      }
      return undefined;
    },
  });

  if (p.isCancel(truthpackPath)) {
    p.cancel('Output configuration cancelled.');
    return null;
  }

  p.outro(chalk.green('Output settings updated!'));

  return {
    output: output as 'json' | 'pretty',
    truthpackPath: (truthpackPath as string).trim(),
  };
}
