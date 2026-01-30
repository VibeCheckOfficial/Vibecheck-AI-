/**
 * Config command - View and edit VibeCheck configuration
 *
 * This module provides the CLI interface for viewing, getting, and setting
 * configuration values. Supports both interactive (wizard) and non-interactive
 * (--get, --set, --list) modes.
 *
 * @module commands/config
 *
 * @example
 * ```bash
 * # List all configuration
 * vibecheck config --list
 *
 * # Get a specific value
 * vibecheck config --get validation.maxErrors
 *
 * # Set a value
 * vibecheck config --set strict=true
 *
 * # Interactive mode (when TTY available)
 * vibecheck config
 * ```
 */

import path from 'node:path';
import chalk from 'chalk';
import {
  createLogger,
  loadConfig,
  getConfigPath,
  setConfigValue,
  writeConfig,
  VibeCheckError,
  type VibeCheckConfig,
} from '../lib/index.js';
import { colors, formatKeyValue, sectionHeader } from '../ui/theme.js';
import { runConfigWizard } from '../ui/prompts/config-wizard.js';
import { env as cliEnv } from '../lib/environment.js';
import type { ConfigOptions } from '../types.js';

// ============================================================================
// Constants
// ============================================================================

/** Error code for invalid configuration */
const ERROR_CODE_CONFIG_INVALID = 'CONFIG_INVALID';

/** Error code for config write failures */
const ERROR_CODE_CONFIG_WRITE = 'CONFIG_WRITE_ERROR';

/**
 * Allowed configuration keys for --set
 * This prevents arbitrary keys from being set to avoid security issues
 * and maintain config schema integrity.
 */
const ALLOWED_CONFIG_KEYS = [
  'strict',
  'output',
  'truthpackPath',
  'rules',
  'watch.include',
  'watch.exclude',
  'watch.debounce',
  'validation.failFast',
  'validation.maxErrors',
  'validation.timeout',
  'firewall.enabled',
  'firewall.blockOnViolation',
  'firewall.strictness',
  'cache.enabled',
  'cache.location',
  'cache.strategy',
  'learning.enabled',
  'workers.enabled',
  'workers.ciWorkerRatio',
  'telemetry.enabled',
  'telemetry.crashReports',
] as const;

/**
 * Main config command handler
 *
 * Handles all configuration operations: list, get, set, and interactive editing.
 * Gracefully handles missing config files by using defaults.
 *
 * @param options - Command options from CLI parser
 * @param options.config - Optional explicit config file path
 * @param options.get - Key to retrieve (e.g., 'validation.maxErrors')
 * @param options.set - Key=value pair to set (e.g., 'strict=true')
 * @param options.list - List all configuration values
 * @param options.verbose - Enable verbose logging
 * @param options.quiet - Suppress non-essential output
 * @param options.json - Output in JSON format
 * @returns Promise that resolves when command completes
 * @throws Exits process with code 1 on error
 */
export async function configCommand(options: ConfigOptions): Promise<void> {
  const logger = createLogger({
    level: options.verbose ? 'verbose' : options.quiet ? 'quiet' : 'normal',
    json: options.json,
  });

  try {
    // Try to get config path and load config
    // Handle missing config gracefully - this is NOT an error condition
    let configPath: string | null = null;
    let config: VibeCheckConfig | null = null;
    let configLoadError: string | null = null;

    try {
      configPath = await getConfigPath();
      config = await loadConfig(options.config);
    } catch (loadError) {
      // Config loading failed - not a fatal error for config command
      configLoadError = loadError instanceof Error ? loadError.message : String(loadError);
    }

    // Handle --get option
    if (options.get) {
      if (!config) {
        // No config available - print default value or inform user
        const { defaultConfig } = await import('../lib/config.js');
        const value = getNestedValue(defaultConfig, options.get);
        if (options.json) {
          console.log(JSON.stringify({ 
            key: options.get, 
            value: value ?? null,
            source: 'default',
            configExists: false,
          }, null, 2));
        } else {
          if (value !== undefined) {
            console.log(formatValue(value));
            logger.dim('(from defaults - no config file found)');
          } else {
            logger.warn(`Configuration key "${options.get}" not found`);
          }
        }
        return; // Exit 0 - command completed successfully
      }

      const value = getNestedValue(config, options.get);
      if (value === undefined) {
        // Key not found - warn but don't error
        if (options.json) {
          console.log(JSON.stringify({ key: options.get, value: null, error: 'Key not found' }, null, 2));
        } else {
          logger.warn(`Configuration key "${options.get}" not found`);
          logger.dim('Run `vibecheck config --list` to see available keys');
        }
        return; // Exit 0 - command completed
      }

      if (options.json) {
        console.log(JSON.stringify({ key: options.get, value }, null, 2));
      } else {
        console.log(formatValue(value));
      }
      return;
    }

    // Handle --set option
    if (options.set) {
      if (!config) {
        // Can't set without a valid config base
        // Use defaults and create new config
        const { defaultConfig } = await import('../lib/config.js');
        config = defaultConfig;
        configPath = path.join(process.cwd(), 'vibecheck.config.mjs');
        logger.info('No existing config found. Creating new configuration...');
      }
      await handleSetConfig(options.set, config, configPath, logger, options);
      return;
    }

    // Handle --list option (default behavior)
    if (options.list || (!options.get && !options.set)) {
      if (!config) {
        // No config found - print helpful status instead of erroring
        const repoRoot = process.cwd();
        const defaultConfigPath = path.join(repoRoot, 'vibecheck.config.mjs');
        
        if (options.json) {
          console.log(JSON.stringify({
            configExists: false,
            path: null,
            repoRoot,
            defaultConfigPath,
            message: 'No VibeCheck configuration found',
            suggestion: 'Run `vibecheck init` to create a configuration file',
            loadError: configLoadError,
          }, null, 2));
        } else {
          logger.warn('No VibeCheck configuration found');
          logger.newline();
          logger.dim(`  Repo root: ${repoRoot}`);
          logger.dim(`  Config would be: ${defaultConfigPath}`);
          if (configLoadError) {
            logger.dim(`  Load error: ${configLoadError}`);
          }
          logger.newline();
          logger.info('To create a configuration file, run:');
          logger.dim('  vibecheck init');
          logger.newline();
          logger.dim('Using default configuration in the meantime.');
        }
        return; // Exit 0 - command completed successfully
      }

      if (options.json) {
        console.log(JSON.stringify({
          configExists: true,
          path: configPath,
          config,
        }, null, 2));
      } else {
        printConfig(config, configPath, logger);
      }
      return;
    }

    // Handle interactive config editing
    if (!options.get && !options.set && !options.list) {
      if (!cliEnv.isInteractive) {
        throw new VibeCheckError(
          'Interactive config editing requires a TTY',
          ERROR_CODE_CONFIG_INVALID,
          {
            suggestions: [
              'Use --get <key> to read values',
              'Use --set <key>=<value> to set values',
              'Edit the config file directly',
            ],
          }
        );
      }

      if (!config) {
        const { defaultConfig } = await import('../lib/config.js');
        config = defaultConfig;
      }

      const changes = await runConfigWizard(config);
      if (changes) {
        logger.info('Configuration changes detected.');
        logger.dim('Use --set to apply changes: vibecheck config --set key=value');
        logger.dim('Example: vibecheck config --set strict=true');
      }
    }
  } catch (error) {
    // Only exit 1 for true internal errors, not missing config
    if (error instanceof VibeCheckError) {
      logger.logError(error);
    } else {
      logger.error(error instanceof Error ? error.message : String(error));
    }
    process.exit(1);
  }
}

/**
 * Print configuration in a human-readable format
 *
 * Displays configuration values grouped by section with
 * proper formatting and color highlighting.
 *
 * @param config - Configuration object to display
 * @param configPath - Path to config file (null if using defaults)
 * @param logger - Logger instance for output
 * @returns void
 * @internal
 */
function printConfig(
  config: VibeCheckConfig,
  configPath: string | null,
  logger: ReturnType<typeof createLogger>
): void {
  console.log(sectionHeader('VibeCheck Configuration'));
  logger.newline();

  if (configPath) {
    console.log(chalk.dim(`Config file: ${chalk.underline(configPath)}`));
  } else {
    console.log(chalk.dim('Using default configuration (no config file found)'));
  }
  logger.newline();

  // Rules
  console.log(colors.highlight('Scanners'));
  console.log(`  ${formatKeyValue('enabled', config.rules.join(', '))}`);
  logger.newline();

  // Validation
  console.log(colors.highlight('Validation'));
  console.log(`  ${formatKeyValue('strict', String(config.strict))}`);
  console.log(`  ${formatKeyValue('failFast', String(config.validation.failFast))}`);
  console.log(`  ${formatKeyValue('maxErrors', String(config.validation.maxErrors))}`);
  logger.newline();

  // Output
  console.log(colors.highlight('Output'));
  console.log(`  ${formatKeyValue('format', config.output)}`);
  console.log(`  ${formatKeyValue('truthpackPath', config.truthpackPath)}`);
  logger.newline();

  // Watch
  console.log(colors.highlight('Watch Mode'));
  console.log(`  ${formatKeyValue('include', config.watch.include.join(', '))}`);
  console.log(`  ${formatKeyValue('exclude', config.watch.exclude.join(', '))}`);
  console.log(`  ${formatKeyValue('debounce', `${config.watch.debounce}ms`)}`);
  logger.newline();

  // Firewall
  console.log(colors.highlight('Firewall'));
  console.log(`  ${formatKeyValue('enabled', String(config.firewall.enabled))}`);
  console.log(`  ${formatKeyValue('blockOnViolation', String(config.firewall.blockOnViolation))}`);
}

/**
 * Get a nested value from an object using dot-notation path
 *
 * Safely traverses nested objects without throwing on missing keys.
 *
 * @param obj - Object to traverse
 * @param valuePath - Dot-notation path (e.g., 'validation.maxErrors')
 * @returns Value at path, or undefined if not found
 * @internal
 *
 * @example
 * ```typescript
 * const obj = { a: { b: { c: 42 } } };
 * getNestedValue(obj, 'a.b.c'); // => 42
 * getNestedValue(obj, 'a.x.y'); // => undefined
 * ```
 */
function getNestedValue(obj: Record<string, unknown>, valuePath: string): unknown {
  if (!valuePath || typeof valuePath !== 'string') {
    return undefined;
  }

  const keys = valuePath.split('.');
  let current: unknown = obj;

  for (const key of keys) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }

  return current;
}

/**
 * Format a configuration value for display
 *
 * Converts various types to human-readable string representations.
 * Arrays are comma-separated, objects are JSON-formatted.
 *
 * @param value - Value to format
 * @returns Formatted string representation
 * @internal
 */
function formatValue(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (value === undefined) {
    return 'undefined';
  }
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(', ') : '(empty array)';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

/**
 * Handle --set option: parse KEY=VALUE and persist to config file
 *
 * Parses the KEY=VALUE argument, validates the key against allowed keys,
 * updates the configuration, and writes it to disk.
 *
 * @param setArg - The KEY=VALUE string from --set argument
 * @param currentConfig - Current configuration to modify
 * @param configPath - Path to existing config file, or null to create new
 * @param logger - Logger instance for output
 * @param options - Command options for JSON output mode
 * @returns Promise that resolves when config is written
 * @throws {VibeCheckError} When argument format is invalid
 * @throws {VibeCheckError} When key is not allowed
 * @throws {VibeCheckError} When value is invalid for the key
 * @throws {VibeCheckError} When file cannot be written
 * @internal
 */
async function handleSetConfig(
  setArg: string,
  currentConfig: VibeCheckConfig,
  configPath: string | null,
  logger: ReturnType<typeof createLogger>,
  options: ConfigOptions
): Promise<void> {
  // Validate input
  if (!setArg || typeof setArg !== 'string') {
    throw new VibeCheckError(
      'Set argument must be a non-empty string',
      ERROR_CODE_CONFIG_INVALID
    );
  }

  // Parse KEY=VALUE format
  const equalsIndex = setArg.indexOf('=');
  if (equalsIndex === -1) {
    throw new VibeCheckError(
      'Invalid --set format. Use KEY=VALUE format.',
      ERROR_CODE_CONFIG_INVALID,
      {
        suggestions: [
          'Example: vibecheck config --set strict=true',
          'Example: vibecheck config --set validation.maxErrors=100',
        ],
      }
    );
  }

  const key = setArg.slice(0, equalsIndex).trim();
  const rawValue = setArg.slice(equalsIndex + 1).trim();

  // Validate key is allowed (security: prevent arbitrary key injection)
  if (!ALLOWED_CONFIG_KEYS.includes(key as typeof ALLOWED_CONFIG_KEYS[number])) {
    throw new VibeCheckError(
      `Unknown configuration key: "${key}"`,
      ERROR_CODE_CONFIG_INVALID,
      {
        suggestions: [
          'Run `vibecheck config --list` to see available keys',
          `Allowed keys: ${ALLOWED_CONFIG_KEYS.slice(0, 5).join(', ')}...`,
        ],
      }
    );
  }

  // Warn about sensitive keys (though none are truly secret in this config)
  const sensitivePatterns = ['token', 'secret', 'password', 'key', 'api'];
  if (sensitivePatterns.some((p) => key.toLowerCase().includes(p))) {
    logger.warn('Warning: Consider using environment variables for sensitive values.');
  }

  // Parse the value (handle booleans, numbers, arrays)
  const parsedValue = parseConfigValue(rawValue);

  // Update config
  let newConfig: VibeCheckConfig;
  try {
    newConfig = setConfigValue(currentConfig, key, parsedValue);
  } catch (error) {
    throw new VibeCheckError(
      `Invalid value for "${key}": ${error instanceof Error ? error.message : String(error)}`,
      ERROR_CODE_CONFIG_INVALID,
      {
        suggestions: [
          'Check the expected type for this configuration key',
          'Run `vibecheck config --get <key>` to see the current value',
        ],
      }
    );
  }

  // Determine config file path
  const targetPath = configPath ?? path.join(process.cwd(), 'vibecheck.config.mjs');

  // Write config
  try {
    await writeConfig(newConfig, targetPath);
  } catch (error) {
    throw new VibeCheckError(
      `Failed to write configuration: ${error instanceof Error ? error.message : String(error)}`,
      ERROR_CODE_CONFIG_WRITE,
      {
        suggestions: [
          'Check file permissions',
          'Ensure the directory exists',
        ],
      }
    );
  }

  // Output result
  if (options.json) {
    console.log(JSON.stringify({
      success: true,
      key,
      value: parsedValue,
      configPath: targetPath,
    }, null, 2));
  } else {
    logger.success(`Set ${chalk.cyan(key)} = ${chalk.green(formatValue(parsedValue))}`);
    logger.dim(`Config saved to: ${targetPath}`);
  }
}

/**
 * Parse a string value into appropriate type
 *
 * Automatically converts string values to appropriate types:
 * - 'true'/'false' → boolean
 * - Numeric strings → number
 * - Comma-separated → array
 * - JSON objects/arrays → parsed objects
 * - Everything else → string
 *
 * @param value - String value to parse
 * @returns Parsed value in appropriate type
 * @internal
 *
 * @example
 * ```typescript
 * parseConfigValue('true');        // => true
 * parseConfigValue('42');          // => 42
 * parseConfigValue('a, b, c');     // => ['a', 'b', 'c']
 * parseConfigValue('{"x": 1}');    // => { x: 1 }
 * parseConfigValue('hello');       // => 'hello'
 * ```
 */
function parseConfigValue(value: string): unknown {
  // Handle empty string
  if (value.trim() === '') {
    return '';
  }

  // Handle boolean (case-insensitive)
  const lowerValue = value.toLowerCase();
  if (lowerValue === 'true') return true;
  if (lowerValue === 'false') return false;

  // Handle number (only if entire string is a valid number)
  const trimmed = value.trim();
  if (trimmed !== '' && !isNaN(Number(trimmed))) {
    const num = Number(trimmed);
    // Avoid converting things like phone numbers or zip codes
    if (Number.isFinite(num)) {
      return num;
    }
  }

  // Handle array (comma-separated values)
  if (value.includes(',')) {
    return value
      .split(',')
      .map((v) => v.trim())
      .filter((v) => v.length > 0);
  }

  // Handle JSON objects and arrays
  if (
    (value.startsWith('{') && value.endsWith('}')) ||
    (value.startsWith('[') && value.endsWith(']'))
  ) {
    try {
      return JSON.parse(value);
    } catch {
      // Not valid JSON, fall through to string
    }
  }

  // Default to string
  return value;
}
