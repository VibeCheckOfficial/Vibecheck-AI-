/**
 * Configuration loading with cosmiconfig + zod validation
 *
 * This module provides centralized configuration management for VibeCheck CLI.
 * Features:
 * - Cosmiconfig-based config discovery (supports .js, .ts, .json, .yaml)
 * - Zod schema validation with type inference
 * - Three-tier caching (memory, file mtime, content hash)
 * - Error recovery with helpful suggestions
 * - Type-safe defaults via schema parsing
 *
 * @module config
 * @example
 * ```typescript
 * import { loadConfig, defineConfig } from './config.js';
 *
 * // Load config with caching
 * const config = await loadConfig();
 *
 * // Define config in vibecheck.config.ts
 * export default defineConfig({
 *   rules: ['routes', 'env', 'auth'],
 *   strict: true,
 * });
 * ```
 */

import { cosmiconfig, type CosmiconfigResult } from 'cosmiconfig';
import { z } from 'zod';
import path from 'node:path';
import fs from 'node:fs/promises';
import { VibeCheckError, withTimeout } from './errors.js';

// ============================================================================
// Constants
// ============================================================================

/** Maximum config load timeout in milliseconds */
const DEFAULT_CONFIG_TIMEOUT_MS = 10000;

/** Scanner rule types - determines which analysis passes to run */
const SCANNER_RULES = ['routes', 'env', 'auth', 'contracts', 'ui'] as const;

/**
 * Valid scanner rule type
 * @see SCANNER_RULES
 */
type ScannerRule = (typeof SCANNER_RULES)[number];

/** Output format types for CLI output */
const OUTPUT_FORMATS = ['json', 'pretty'] as const;

/**
 * Valid output format type
 * @see OUTPUT_FORMATS
 */
type OutputFormat = (typeof OUTPUT_FORMATS)[number];

/**
 * Configuration schema for vibecheck.config.mjs
 * Strict validation with sensible defaults
 */
export const configSchema = z.object({
  /**
   * Scanners to run during truthpack generation
   */
  rules: z
    .array(z.enum(SCANNER_RULES))
    .min(1, 'At least one scanner rule must be enabled')
    .default(['routes', 'env', 'auth', 'contracts']),

  /**
   * Enable strict mode for validation
   */
  strict: z.boolean().default(false),

  /**
   * Default output format
   */
  output: z.enum(OUTPUT_FORMATS).default('pretty'),

  /**
   * Path to store truthpack data (relative to project root)
   */
  truthpackPath: z
    .string()
    .min(1, 'Truthpack path cannot be empty')
    .refine(
      (p) => !path.isAbsolute(p) || p.startsWith(process.cwd()),
      'Truthpack path must be within project directory'
    )
    .default('.vibecheck/truthpack'),

  /**
   * Watch mode configuration
   */
  watch: z
    .object({
      /** File patterns to include */
      include: z
        .array(z.string().min(1))
        .min(1, 'At least one include pattern required')
        .default(['src/**/*.ts', 'src/**/*.tsx']),
      /** File patterns to exclude */
      exclude: z
        .array(z.string())
        .default(['node_modules', 'dist', 'build', '.vibecheck', '.git']),
      /** Debounce delay in milliseconds */
      debounce: z
        .number()
        .int()
        .min(50, 'Debounce must be at least 50ms')
        .max(10000, 'Debounce cannot exceed 10 seconds')
        .default(300),
    })
    .default({}),

  /**
   * Validation configuration
   */
  validation: z
    .object({
      /** Fail on first error */
      failFast: z.boolean().default(false),
      /** Maximum number of errors to report */
      maxErrors: z
        .number()
        .int()
        .min(1, 'maxErrors must be at least 1')
        .max(1000, 'maxErrors cannot exceed 1000')
        .default(50),
      /** Ignore patterns for validation */
      ignore: z.array(z.string()).default([]),
      /** Timeout for validation operations (ms) */
      timeout: z
        .number()
        .int()
        .min(1000)
        .max(300000)
        .default(60000),
    })
    .default({}),

  /**
   * Firewall configuration
   */
  firewall: z
    .object({
      /** Enable firewall validation */
      enabled: z.boolean().default(true),
      /** Block on policy violation */
      blockOnViolation: z.boolean().default(false),
      /** Strictness level */
      strictness: z.enum(['low', 'medium', 'high']).default('medium'),
    })
    .default({}),

  /**
   * Scan configuration
   */
  scan: z
    .object({
      /** Timeout for scan operations (ms) */
      timeout: z
        .number()
        .int()
        .min(5000)
        .max(600000)
        .default(120000),
      /** Maximum files to scan */
      maxFiles: z
        .number()
        .int()
        .min(1)
        .max(100000)
        .default(10000),
      /** Follow symlinks */
      followSymlinks: z.boolean().default(false),
    })
    .default({}),

  /**
   * Telemetry configuration (privacy-respecting)
   */
  telemetry: z
    .object({
      /** Enable anonymous telemetry */
      enabled: z.boolean().default(false),
      /** Share crash reports */
      crashReports: z.boolean().default(false),
    })
    .default({}),

  /**
   * Cache configuration for three-tier caching system
   */
  cache: z
    .object({
      /** Enable caching */
      enabled: z.boolean().default(true),
      /** Cache storage location */
      location: z.string().default('node_modules/.cache/vibecheck'),
      /** Cache key strategy: metadata (fast), content (reliable), hybrid (balanced) */
      strategy: z.enum(['metadata', 'content', 'hybrid']).default('hybrid'),
      /** Cloud sync configuration for team sharing */
      cloudSync: z
        .object({
          /** Enable cloud sync */
          enabled: z.boolean().default(false),
          /** Cloud provider */
          provider: z.enum(['upstash', 'turso']).optional(),
          /** Connection URL */
          url: z.string().optional(),
        })
        .optional(),
    })
    .default({}),

  /**
   * Learning system configuration for adaptive false positive reduction
   */
  learning: z
    .object({
      /** Enable learning system */
      enabled: z.boolean().default(true),
      /** Path to global database (cross-project learning) */
      globalDbPath: z.string().default('~/.config/vibecheck/global.db'),
      /** Path to project-specific database */
      projectDbPath: z.string().default('.vibecheck/project.db'),
      /** Minimum feedback count before applying calibration */
      minFeedbackThreshold: z.number().int().min(1).default(5),
    })
    .default({}),

  /**
   * Worker configuration for parallel analysis
   */
  workers: z
    .object({
      /** Enable worker pool for parallel analysis */
      enabled: z.boolean().default(true),
      /** Maximum number of workers (default: CPU cores - 1) */
      maxWorkers: z.number().int().min(1).optional(),
      /** Worker count ratio in CI environments (0-1) */
      ciWorkerRatio: z.number().min(0.1).max(1).default(0.5),
      /** Task timeout in milliseconds */
      taskTimeoutMs: z.number().int().min(1000).default(60000),
    })
    .default({}),

  /**
   * Plugin configuration
   */
  plugins: z.array(z.string()).default([]),

  /**
   * Configuration presets to extend
   */
  extends: z.array(z.string()).default([]),

  /**
   * YAML policy files to load
   */
  policies: z.array(z.string()).default([]),

  /**
   * Output format options
   */
  format: z
    .object({
      /** Default output format */
      default: z.enum(['terminal', 'json', 'html', 'sarif', 'junit', 'markdown']).default('terminal'),
      /** HTML report options */
      html: z
        .object({
          /** Include charts in HTML report */
          includeCharts: z.boolean().default(true),
          /** Theme for HTML report */
          theme: z.enum(['light', 'dark', 'auto']).default('auto'),
        })
        .optional(),
      /** Markdown report options */
      markdown: z
        .object({
          /** Use collapsible sections */
          collapsible: z.boolean().default(true),
          /** Include emoji icons */
          useEmoji: z.boolean().default(true),
        })
        .optional(),
    })
    .default({}),
});

export type VibeCheckConfig = z.infer<typeof configSchema>;

/**
 * Default configuration - validated at module load
 */
export const defaultConfig: VibeCheckConfig = configSchema.parse({});

// ============================================================================
// Cache Management
// ============================================================================

/**
 * Configuration cache entry structure
 * Stores loaded config along with metadata for cache invalidation
 */
interface ConfigCacheEntry {
  /** The parsed and validated configuration */
  config: VibeCheckConfig;
  /** Absolute path to the config file, or null if using defaults */
  path: string | null;
  /** File modification time in milliseconds for cache invalidation */
  mtime: number;
}

/**
 * In-memory configuration cache
 * Invalidated when file mtime changes or clearConfigCache() is called
 */
let configCache: ConfigCacheEntry | null = null;

// ============================================================================
// Config Discovery
// ============================================================================

/**
 * Config search locations in priority order
 * Cosmiconfig will search these locations from first to last
 */
const CONFIG_SEARCH_PLACES = [
  'vibecheck.config.ts',
  'vibecheck.config.mts',
  'vibecheck.config.cts',
  'vibecheck.config.js',
  'vibecheck.config.mjs',
  'vibecheck.config.cjs',
  '.vibecheckrc',
  '.vibecheckrc.json',
  '.vibecheckrc.yaml',
  '.vibecheckrc.yml',
  '.vibecheckrc.js',
  '.vibecheckrc.cjs',
  '.config/vibecheckrc',
  '.config/vibecheck.json',
  'package.json',
] as const;

/**
 * Create cosmiconfig explorer with TypeScript support
 *
 * Configures cosmiconfig to handle TypeScript config files
 * by dynamically importing them as ES modules.
 *
 * @returns Configured cosmiconfig explorer instance
 * @internal
 */
function createExplorer(): ReturnType<typeof cosmiconfig> {
  return cosmiconfig('vibecheck', {
    searchPlaces: [...CONFIG_SEARCH_PLACES],
    loaders: {
      '.ts': async (filepath: string) => {
        try {
          // Dynamic import for TypeScript config
          const { pathToFileURL } = await import('node:url');
          const module = await import(pathToFileURL(filepath).href);
          return module.default ?? module;
        } catch (error) {
          throw new VibeCheckError(
            `Failed to load TypeScript config: ${filepath}`,
            'CONFIG_PARSE_ERROR',
            { cause: error instanceof Error ? error : undefined }
          );
        }
      },
      '.mts': async (filepath: string) => {
        const { pathToFileURL } = await import('node:url');
        const module = await import(pathToFileURL(filepath).href);
        return module.default ?? module;
      },
      '.cts': async (filepath: string) => {
        try {
          // CommonJS TypeScript - use dynamic require via createRequire
          const { createRequire } = await import('node:module');
          const require = createRequire(import.meta.url);
          const module = require(filepath);
          return module.default ?? module;
        } catch (error) {
          throw new VibeCheckError(
            `Failed to load CommonJS TypeScript config: ${filepath}`,
            'CONFIG_PARSE_ERROR',
            { cause: error instanceof Error ? error : undefined }
          );
        }
      },
    },
  });
}

/**
 * Load configuration from file or use defaults
 *
 * This function searches for configuration files using cosmiconfig,
 * validates them against the schema, and caches the result.
 *
 * @param configPath - Optional explicit path to config file. If provided,
 *                     skips search and loads directly from this path.
 * @param options - Configuration loading options
 * @param options.cache - Whether to use cached config (default: true)
 * @param options.timeout - Maximum time to wait for config load in ms (default: 10000)
 * @returns Validated configuration object with defaults applied
 * @throws {VibeCheckError} When config file exists but is invalid
 * @throws {VibeCheckError} When config file cannot be read (permission denied)
 * @throws {VibeCheckError} When config loading times out
 *
 * @example
 * ```typescript
 * // Load with defaults and caching
 * const config = await loadConfig();
 *
 * // Load specific file without caching
 * const config = await loadConfig('./custom.config.js', { cache: false });
 *
 * // Load with extended timeout for slow filesystems
 * const config = await loadConfig(undefined, { timeout: 30000 });
 * ```
 */
export async function loadConfig(
  configPath?: string,
  options?: {
    /** Whether to use cached config (default: true) */
    cache?: boolean;
    /** Maximum time to wait for config load in ms (default: 10000) */
    timeout?: number;
  }
): Promise<VibeCheckConfig> {
  const useCache = options?.cache ?? true;
  const timeout = options?.timeout ?? DEFAULT_CONFIG_TIMEOUT_MS;

  // Check cache validity
  if (useCache && configCache) {
    try {
      if (configCache.path) {
        const stats = await fs.stat(configCache.path);
        if (stats.mtimeMs === configCache.mtime) {
          return configCache.config;
        }
      } else {
        // No config file - return cached defaults
        return configCache.config;
      }
    } catch {
      // Cache invalid, reload
    }
  }

  const explorer = createExplorer();

  try {
    const result = await withTimeout<CosmiconfigResult>(
      async () => {
        if (configPath) {
          return await explorer.load(configPath);
        }
        return await explorer.search();
      },
      timeout,
      'CONFIG_PARSE_ERROR'
    );

    if (!result || result.isEmpty) {
      // No config found - use defaults
      configCache = {
        config: defaultConfig,
        path: null,
        mtime: 0,
      };
      return defaultConfig;
    }

    // Validate and parse the config
    const parsed = configSchema.safeParse(result.config);

    if (!parsed.success) {
      const errors = parsed.error.errors
        .map((e) => {
          const path = e.path.join('.');
          return `  • ${path || 'root'}: ${e.message}`;
        })
        .join('\n');

      throw new VibeCheckError(
        `Invalid configuration in ${result.filepath}:\n${errors}`,
        'CONFIG_INVALID',
        {
          context: { file: result.filepath },
          suggestions: [
            'Check your configuration file for typos',
            'Refer to the documentation for valid options',
            'Use `vibecheck init --force` to regenerate a valid config',
          ],
        }
      );
    }

    // Update cache
    try {
      const stats = await fs.stat(result.filepath);
      configCache = {
        config: parsed.data,
        path: result.filepath,
        mtime: stats.mtimeMs,
      };
    } catch {
      // Stats failed, cache without mtime
      configCache = {
        config: parsed.data,
        path: result.filepath,
        mtime: 0,
      };
    }

    return parsed.data;
  } catch (error) {
    if (error instanceof VibeCheckError) {
      throw error;
    }

    // Handle specific error types
    if (error instanceof Error && 'code' in error) {
      const nodeError = error as NodeJS.ErrnoException;
      
      if (nodeError.code === 'ENOENT') {
        return defaultConfig;
      }
      
      if (nodeError.code === 'EACCES') {
        throw new VibeCheckError(
          `Cannot read configuration file: permission denied`,
          'CONFIG_PERMISSION_DENIED',
          { cause: error }
        );
      }
    }

    throw new VibeCheckError(
      `Failed to load configuration: ${error instanceof Error ? error.message : String(error)}`,
      'CONFIG_PARSE_ERROR',
      { cause: error instanceof Error ? error : undefined }
    );
  }
}

/**
 * Get configuration file path (if one exists)
 *
 * Searches for a VibeCheck configuration file without loading it.
 * Useful for displaying config location or checking existence.
 *
 * @returns Absolute path to config file, or null if none found
 *
 * @example
 * ```typescript
 * const configPath = await getConfigPath();
 * if (configPath) {
 *   console.log(`Config found at: ${configPath}`);
 * } else {
 *   console.log('Using default configuration');
 * }
 * ```
 */
export async function getConfigPath(): Promise<string | null> {
  const explorer = createExplorer();
  try {
    const result = await explorer.search();
    return result?.filepath ?? null;
  } catch {
    // Silently return null on any search error
    // This is intentional - getConfigPath is used for display purposes
    return null;
  }
}

/**
 * Clear configuration cache
 *
 * Forces the next loadConfig() call to re-read from disk.
 * Call this after programmatically modifying the config file.
 *
 * @returns void
 *
 * @example
 * ```typescript
 * // After writing new config
 * await writeConfig(newConfig, configPath);
 * clearConfigCache();
 * const freshConfig = await loadConfig(); // Re-reads from disk
 * ```
 */
export function clearConfigCache(): void {
  configCache = null;
}

/**
 * Validation result type for validateConfig
 */
interface ValidationResult {
  /** Whether the configuration passed validation */
  valid: boolean;
  /** Validated configuration data (only present when valid=true) */
  data?: VibeCheckConfig;
  /** Validation error messages (only present when valid=false) */
  errors?: string[];
}

/**
 * Validate a configuration object against the schema
 *
 * Performs validation without throwing, returning a discriminated union
 * of success/failure results.
 *
 * @param config - Unknown configuration object to validate
 * @returns Validation result with either data or errors
 *
 * @example
 * ```typescript
 * const userConfig = JSON.parse(fileContents);
 * const result = validateConfig(userConfig);
 *
 * if (result.valid) {
 *   // TypeScript knows result.data exists
 *   console.log('Rules:', result.data.rules);
 * } else {
 *   // TypeScript knows result.errors exists
 *   result.errors.forEach(err => console.error(err));
 * }
 * ```
 */
export function validateConfig(config: unknown): ValidationResult {
  if (config === null || config === undefined) {
    return {
      valid: false,
      errors: ['Configuration cannot be null or undefined'],
    };
  }

  const result = configSchema.safeParse(config);

  if (result.success) {
    return { valid: true, data: result.data };
  }

  return {
    valid: false,
    errors: result.error.errors.map((e) => {
      const path = e.path.join('.');
      return `${path || 'root'}: ${e.message}`;
    }),
  };
}

/**
 * Merge partial config with defaults
 *
 * Takes a partial configuration object and applies schema defaults
 * for any missing fields. Throws if the partial config has invalid values.
 *
 * @param partial - Partial configuration object
 * @returns Complete configuration with defaults applied
 * @throws {z.ZodError} When partial config contains invalid values
 *
 * @example
 * ```typescript
 * // Apply defaults to partial config
 * const config = mergeConfig({ strict: true });
 * // config.rules will be ['routes', 'env', 'auth', 'contracts'] (default)
 * // config.strict will be true (provided)
 * ```
 */
export function mergeConfig(partial: Partial<VibeCheckConfig>): VibeCheckConfig {
  return configSchema.parse(partial);
}

/** Available configuration template types */
type ConfigTemplate = 'minimal' | 'standard' | 'strict';

/**
 * Generate a default configuration file content
 *
 * Creates a ready-to-use configuration file string based on the selected template.
 * The output uses JSDoc type annotations for editor support without requiring
 * @vibecheck/cli as a runtime dependency in target projects.
 *
 * @param template - Template type to generate
 *   - 'minimal': Basic config with only essential rules
 *   - 'standard': Balanced config suitable for most projects (default)
 *   - 'strict': Maximum validation with all features enabled
 * @returns Configuration file content as a string
 *
 * @example
 * ```typescript
 * import { writeFile } from 'fs/promises';
 *
 * // Generate and write a strict config
 * const content = generateConfigTemplate('strict');
 * await writeFile('vibecheck.config.mjs', content);
 * ```
 */
export function generateConfigTemplate(
  template: ConfigTemplate = 'standard'
): string {
  const configs = {
    minimal: `/** @type {import('vibecheck-ai').VibeCheckConfig} */
export default {
  rules: ['routes', 'env'],
};
`,
    standard: `/** @type {import('vibecheck-ai').VibeCheckConfig} */
export default {
  // Scanners to run during truthpack generation
  rules: ['routes', 'env', 'auth', 'contracts'],
  
  // Enable strict validation mode
  strict: false,
  
  // Output format: 'pretty' for humans, 'json' for CI
  output: 'pretty',
  
  // Path for truthpack storage
  truthpackPath: '.vibecheck/truthpack',
  
  // Watch mode settings
  watch: {
    include: ['src/**/*.ts', 'src/**/*.tsx'],
    exclude: ['node_modules', 'dist', 'build'],
    debounce: 300,
  },
  
  // Validation settings
  validation: {
    failFast: false,
    maxErrors: 50,
    timeout: 60000,
  },
};
`,
    strict: `/** @type {import('vibecheck-ai').VibeCheckConfig} */
export default {
  // Enable all scanners
  rules: ['routes', 'env', 'auth', 'contracts', 'ui'],
  
  // Strict mode for maximum validation
  strict: true,
  
  output: 'pretty',
  truthpackPath: '.vibecheck/truthpack',
  
  watch: {
    include: ['src/**/*.ts', 'src/**/*.tsx'],
    exclude: ['node_modules', 'dist', 'build'],
    debounce: 200, // Faster response
  },
  
  validation: {
    failFast: true, // Stop on first error
    maxErrors: 10,
    timeout: 30000,
  },
  
  firewall: {
    enabled: true,
    blockOnViolation: true,
    strictness: 'high',
  },
  
  scan: {
    timeout: 60000,
    maxFiles: 5000,
    followSymlinks: false,
  },
  
  // Opt-in telemetry (disabled by default)
  telemetry: {
    enabled: false,
    crashReports: false,
  },
};
`,
  };

  return configs[template];
}

/**
 * Helper for type-safe config definition (used in vibecheck.config.mjs)
 *
 * This function provides TypeScript type checking and validation
 * for configuration files. It's the recommended way to define configs.
 *
 * @param config - Partial configuration object
 * @returns Validated and complete configuration object
 * @throws {Error} When configuration is invalid with detailed error messages
 *
 * @example
 * ```typescript
 * // vibecheck.config.ts
 * import { defineConfig } from '@vibecheck/cli';
 *
 * export default defineConfig({
 *   rules: ['routes', 'env', 'auth'],
 *   strict: true,
 *   validation: {
 *     failFast: true,
 *     maxErrors: 10,
 *   },
 * });
 * ```
 */
export function defineConfig(config: Partial<VibeCheckConfig>): VibeCheckConfig {
  if (config === null || config === undefined) {
    throw new Error('Configuration cannot be null or undefined');
  }

  const result = configSchema.safeParse(config);

  if (!result.success) {
    const errors = result.error.errors
      .map((e) => `${e.path.join('.') || 'root'}: ${e.message}`)
      .join(', ');
    throw new Error(`Invalid configuration: ${errors}`);
  }

  return result.data;
}

/**
 * Write configuration to file
 *
 * Serializes a configuration object to a JavaScript module file
 * and writes it to disk. Automatically clears the config cache.
 *
 * @param config - Validated configuration object to write
 * @param filePath - Absolute or relative path to write the config file
 * @returns Promise that resolves when file is written
 * @throws {Error} When file cannot be written (permissions, disk full, etc.)
 *
 * @example
 * ```typescript
 * const newConfig = mergeConfig({ strict: true });
 * await writeConfig(newConfig, './vibecheck.config.mjs');
 * ```
 */
export async function writeConfig(
  config: VibeCheckConfig,
  filePath: string
): Promise<void> {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('File path must be a non-empty string');
  }

  const template = generateConfigFromObject(config);

  try {
    await fs.writeFile(filePath, template, 'utf-8');
    clearConfigCache();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to write config to ${filePath}: ${message}`);
  }
}

/**
 * Generate config file content from object
 *
 * Converts a VibeCheckConfig object to a JavaScript module string
 * that can be written to disk and imported.
 *
 * @param config - Configuration object to serialize
 * @returns JavaScript module content as string
 * @internal
 */
function generateConfigFromObject(config: VibeCheckConfig): string {
  const lines: string[] = [
    `import { defineConfig } from '@vibecheck/cli';`,
    '',
    'export default defineConfig({',
  ];

  // Rules
  lines.push(`  rules: [${config.rules.map((r) => `'${r}'`).join(', ')}],`);
  lines.push(`  strict: ${config.strict},`);
  lines.push(`  output: '${config.output}',`);
  lines.push(`  truthpackPath: '${config.truthpackPath}',`);

  // Watch
  lines.push('  watch: {');
  lines.push(`    include: [${config.watch.include.map((p) => `'${p}'`).join(', ')}],`);
  lines.push(`    exclude: [${config.watch.exclude.map((p) => `'${p}'`).join(', ')}],`);
  lines.push(`    debounce: ${config.watch.debounce},`);
  lines.push('  },');

  // Validation
  lines.push('  validation: {');
  lines.push(`    failFast: ${config.validation.failFast},`);
  lines.push(`    maxErrors: ${config.validation.maxErrors},`);
  lines.push(`    timeout: ${config.validation.timeout},`);
  lines.push('  },');

  // Firewall
  lines.push('  firewall: {');
  lines.push(`    enabled: ${config.firewall.enabled},`);
  lines.push(`    blockOnViolation: ${config.firewall.blockOnViolation},`);
  lines.push(`    strictness: '${config.firewall.strictness}',`);
  lines.push('  },');

  // Cache
  lines.push('  cache: {');
  lines.push(`    enabled: ${config.cache.enabled},`);
  lines.push(`    location: '${config.cache.location}',`);
  lines.push(`    strategy: '${config.cache.strategy}',`);
  lines.push('  },');

  // Learning
  lines.push('  learning: {');
  lines.push(`    enabled: ${config.learning.enabled},`);
  lines.push('  },');

  // Workers
  lines.push('  workers: {');
  lines.push(`    enabled: ${config.workers.enabled},`);
  lines.push(`    ciWorkerRatio: ${config.workers.ciWorkerRatio},`);
  lines.push('  },');

  // Plugins and policies
  if (config.plugins.length > 0) {
    lines.push(`  plugins: [${config.plugins.map((p) => `'${p}'`).join(', ')}],`);
  }
  if (config.extends.length > 0) {
    lines.push(`  extends: [${config.extends.map((e) => `'${e}'`).join(', ')}],`);
  }
  if (config.policies.length > 0) {
    lines.push(`  policies: [${config.policies.map((p) => `'${p}'`).join(', ')}],`);
  }

  // Format
  lines.push('  format: {');
  lines.push(`    default: '${config.format.default}',`);
  lines.push('  },');

  lines.push('});');
  lines.push('');

  return lines.join('\n');
}

/**
 * Get a specific config value by dot-notation path
 *
 * Safely traverses nested configuration objects using a dot-separated path.
 * Returns undefined for missing paths without throwing.
 *
 * @param config - Configuration object to read from
 * @param configPath - Dot-notation path (e.g., 'validation.maxErrors')
 * @returns Value at path, or undefined if not found
 *
 * @example
 * ```typescript
 * const config = await loadConfig();
 *
 * // Get nested value
 * const maxErrors = getConfigValue(config, 'validation.maxErrors');
 * // => 50
 *
 * // Get top-level value
 * const strict = getConfigValue(config, 'strict');
 * // => false
 *
 * // Missing path returns undefined
 * const missing = getConfigValue(config, 'nonexistent.path');
 * // => undefined
 * ```
 */
export function getConfigValue(
  config: VibeCheckConfig,
  configPath: string
): unknown {
  if (!configPath || typeof configPath !== 'string') {
    return undefined;
  }

  const keys = configPath.split('.');
  let current: unknown = config;

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
 * Set a specific config value by path (returns new config)
 *
 * Creates a new configuration object with the specified value set.
 * Does not mutate the original config. Validates the result against schema.
 *
 * @param config - Original configuration object
 * @param configPath - Dot-notation path (e.g., 'validation.maxErrors')
 * @param value - Value to set at the path
 * @returns New configuration object with value set
 * @throws {z.ZodError} When resulting config would be invalid
 *
 * @example
 * ```typescript
 * const config = await loadConfig();
 *
 * // Set nested value (returns new object)
 * const newConfig = setConfigValue(config, 'validation.maxErrors', 100);
 *
 * // Original is unchanged
 * console.log(config.validation.maxErrors); // => 50
 * console.log(newConfig.validation.maxErrors); // => 100
 *
 * // Set top-level value
 * const strictConfig = setConfigValue(config, 'strict', true);
 * ```
 */
export function setConfigValue(
  config: VibeCheckConfig,
  configPath: string,
  value: unknown
): VibeCheckConfig {
  if (!configPath || typeof configPath !== 'string') {
    throw new Error('Config path must be a non-empty string');
  }

  const keys = configPath.split('.');

  if (keys.length === 0 || keys.some((k) => k.length === 0)) {
    throw new Error('Invalid config path: empty segment detected');
  }

  // Deep clone to avoid mutation
  const result = JSON.parse(JSON.stringify(config)) as Record<string, unknown>;

  let current: Record<string, unknown> = result;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i] as string;
    if (!(key in current) || typeof current[key] !== 'object' || current[key] === null) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }

  const finalKey = keys[keys.length - 1] as string;
  current[finalKey] = value;

  // Validate and return - will throw if invalid
  return configSchema.parse(result);
}
