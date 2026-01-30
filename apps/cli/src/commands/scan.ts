// [SCANNER_ENGINES] Enhancement
// File: apps/cli/src/commands/scan.ts
// Changes:
// - Enhanced JSDoc with @param, @returns, @throws, @example
// - Added explicit return types to all functions
// - Extracted magic numbers to named constants
// - Added input validation improvements
// - Wrapped async operations with better error context
// Warnings:
// - None - all enhancements applied successfully

/**
 * Scan Command Module
 *
 * Generates a truthpack from the codebase by scanning for routes,
 * environment variables, authentication patterns, and contracts.
 *
 * @module scan
 *
 * Features:
 * - Timeout protection with configurable limits
 * - Progress reporting with interactive UI
 * - Graceful cancellation via SIGINT/SIGTERM
 * - Incremental scanning support
 * - Optional Forge integration for AI context generation
 *
 * @example
 * ```bash
 * # Basic scan
 * vibecheck scan
 *
 * # Verbose scan with JSON output
 * vibecheck scan --verbose --json
 *
 * # Scan with Forge context generation
 * vibecheck scan --forge
 * ```
 */

import { Listr } from 'listr2';
import chalk from 'chalk';
import path from 'node:path';
import fs from 'node:fs/promises';
import { TruthpackGenerator } from '@vibecheck/core/truthpack';
import { getPerformanceTracker } from '@vibecheck/core/utils';
import { getScoreStatus } from '@vibecheck/core/scoring';
import {
  createLogger,
  loadConfig,
  VibeCheckError,
  withTimeout,
  registerShutdownHandlers,
  hasEnoughMemory,
  runForgeInternal,
  getCurrentTier,
  formatForgeOutputForJson,
  printForgeUpgradeSuggestion,
} from '../lib/index.js';
import { formatDuration, formatCount, formatBytes, symbols, colors } from '../ui/theme.js';
import { renderCommandHeader } from '../ui/index.js';
import { env as cliEnv } from '../lib/environment.js';
import { isAuthenticated } from '../lib/entitlements.js';
import type { ScanOptions } from '../types.js';
import type {
  CommandResult,
  ScanResultData,
  CommandPhase,
} from '@repo/shared-types';
import {
  VERDICT_THRESHOLDS,
  createEmptyCommandCounts,
  createDefaultCommandInputs,
} from '@repo/shared-types';

// ============================================================================
// Constants
// ============================================================================

/** Minimum memory required for scanning (in megabytes) */
const MIN_MEMORY_MB = 256;

/** Default scan timeout in milliseconds (2 minutes) */
const DEFAULT_TIMEOUT_MS = 120_000;

/** Minimum allowed timeout value in milliseconds */
const MIN_TIMEOUT_MS = 1_000;

/** Category weights for overall health calculation (must sum to 1.0) */
const CATEGORY_WEIGHTS = {
  ROUTES: 0.30,      // Routes are critical for API projects
  ENV: 0.20,         // Env vars important but secondary
  AUTH: 0.30,        // Auth patterns critical for security
  CONTRACTS: 0.20,   // Contracts important for type safety
} as const;

/**
 * Calculate scan coverage score using unified scoring approach.
 * Score is 0-100, higher is better.
 * Uses category weights to calculate overall coverage.
 */
function calculateScanScore(data: ScanResultData): number {
  const categoryScores = {
    routes: data.routes > 0 ? 100 : 0,
    env: data.env > 0 ? 100 : 0,
    auth: data.auth > 0 ? 100 : 0,
    contracts: data.contracts > 0 ? 100 : 0,
  };
  
  const weightedSum = 
    (categoryScores.routes * CATEGORY_WEIGHTS.ROUTES) +
    (categoryScores.env * CATEGORY_WEIGHTS.ENV) +
    (categoryScores.auth * CATEGORY_WEIGHTS.AUTH) +
    (categoryScores.contracts * CATEGORY_WEIGHTS.CONTRACTS);
  
  return Math.round(weightedSum);
}

/**
 * Determine verdict from scan score using unified thresholds.
 */
function getScanVerdict(score: number): 'SHIP' | 'WARN' | 'BLOCK' {
  if (score >= VERDICT_THRESHOLDS.SHIP) return 'SHIP';
  if (score >= VERDICT_THRESHOLDS.WARN) return 'WARN';
  return 'BLOCK';
}

/** Dashboard tracking promotion message */
const DASHBOARD_PROMO_MESSAGE = `
${colors.primary('━'.repeat(50))}
${symbols.raw.star} ${chalk.bold('Track your scans in the cloud!')}
${colors.primary('━'.repeat(50))}

${colors.muted('Connect your API key to:')}
  ${colors.success('✓')} Track all scans from CLI, MCP & VS Code
  ${colors.success('✓')} View detailed scan history & trends
  ${colors.success('✓')} Monitor code health across projects
  ${colors.success('✓')} Get Ship Score insights

${colors.muted('Get your API key:')} ${colors.info('vibecheck.dev/api-keys')}
${colors.muted('Then run:')} ${colors.code('vibecheck login')}
`;

// ============================================================================
// Types
// ============================================================================

/**
 * Result data structure for a completed scan operation.
 */
interface ScanResult {
  /** Number of routes discovered */
  routes: number;
  /** Number of environment variables discovered */
  env: number;
  /** Number of authentication patterns discovered */
  auth: number;
  /** Number of contracts discovered */
  contracts: number;
  /** Total duration of the scan in milliseconds */
  duration: number;
  /** Absolute path to the output directory */
  outputPath: string;
  /** Optional timing breakdown by phase */
  phases?: ScanPhaseTimings;
}

/**
 * Timing information for each phase of the scan.
 */
interface ScanPhaseTimings {
  /** Time spent loading configuration */
  configLoad?: number;
  /** Time spent discovering files */
  fileDiscovery?: number;
  /** Time spent scanning routes */
  routeScan?: number;
  /** Time spent scanning environment variables */
  envScan?: number;
  /** Time spent scanning authentication patterns */
  authScan?: number;
  /** Time spent scanning contracts */
  contractScan?: number;
  /** Time spent computing hashes */
  hashComputation?: number;
  /** Time spent saving output */
  save?: number;
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validates scan command options.
 *
 * @param options - The scan options to validate
 * @throws {VibeCheckError} When timeout is below minimum threshold
 *
 * @example
 * ```typescript
 * validateOptions({ timeout: 5000 }); // OK
 * validateOptions({ timeout: 500 }); // Throws INVALID_INPUT error
 * ```
 */
function validateOptions(options: ScanOptions): void {
  if (options.timeout !== undefined && options.timeout < MIN_TIMEOUT_MS) {
    throw new VibeCheckError(
      `Scan timeout must be at least ${MIN_TIMEOUT_MS}ms`,
      'INVALID_INPUT'
    );
  }
}

/**
 * Checks system requirements before scanning.
 *
 * Verifies that the system has sufficient memory to perform the scan.
 *
 * @throws {VibeCheckError} When system memory is below minimum requirement
 *
 * @example
 * ```typescript
 * checkSystemRequirements(); // Throws if < 256MB available
 * ```
 */
function checkSystemRequirements(): void {
  if (!hasEnoughMemory(MIN_MEMORY_MB)) {
    throw new VibeCheckError(
      `Insufficient memory for scanning (${MIN_MEMORY_MB}MB required)`,
      'OUT_OF_MEMORY',
      {
        suggestions: [
          'Close other applications to free memory',
          'Try scanning a smaller directory',
        ],
      }
    );
  }
}


// ============================================================================
// Main Command
// ============================================================================

/**
 * Executes the scan command.
 *
 * Scans the current directory for routes, environment variables,
 * authentication patterns, and contracts, then generates a truthpack.
 *
 * @param options - Command options controlling scan behavior
 * @returns A promise that resolves when the scan completes
 * @throws {VibeCheckError} When validation fails, system requirements not met,
 *         scan times out, or is cancelled
 *
 * @example
 * ```typescript
 * // Basic scan
 * await scanCommand({});
 *
 * // Verbose scan with Forge
 * await scanCommand({ verbose: true, forge: true });
 *
 * // JSON output for CI/CD
 * await scanCommand({ json: true, quiet: true });
 * ```
 */
export async function scanCommand(options: ScanOptions): Promise<void> {
  const logger = createLogger({
    level: options.verbose ? 'verbose' : options.quiet ? 'quiet' : 'normal',
    json: options.json,
  });

  // Track if we've been cancelled
  let cancelled = false;

  // Register cleanup for graceful shutdown
  registerShutdownHandlers(() => {
    cancelled = true;
    logger.warn('Scan cancelled');
  });

  const startTime = Date.now();
  const performanceTracker = getPerformanceTracker();
  const phaseTimings: ScanPhaseTimings = {};

  try {
    // Validate options
    validateOptions(options);

    // Check system requirements
    checkSystemRequirements();

    // Load configuration (phase 1) - use defaults if no config found
    const configLoadStart = Date.now();
    let config;
    let configSource = 'file';

    try {
      config = await loadConfig(options.config);
    } catch (configError) {
      // Config loading failed - use defaults instead of erroring
      // This allows scan to work on repos without vibecheck config
      const { defaultConfig } = await import('../lib/config.js');
      config = defaultConfig;
      configSource = 'defaults';
      if (options.verbose) {
        const errorMessage = configError instanceof Error ? configError.message : String(configError);
        logger.debug(`Config not found, using defaults: ${errorMessage}`);
      }
    }

    const outputPath = options.output ?? config.truthpackPath;
    const timeout = options.timeout ?? config.scan?.timeout ?? DEFAULT_TIMEOUT_MS;
    phaseTimings.configLoad = Date.now() - configLoadStart;

    if (options.verbose) {
      logger.debug(`Config loaded in ${formatDuration(phaseTimings.configLoad)} (source: ${configSource})`);
    }

    logger.info('Scanning codebase for truthpack generation...');
    logger.debug(`Output path: ${outputPath}`);
    logger.debug(`Rules: ${config.rules.join(', ')}`);
    logger.debug(`Timeout: ${formatDuration(timeout)}`);

    // Ensure output directory exists
    const outputDir = path.resolve(outputPath);
    await fs.mkdir(outputDir, { recursive: true });

    const results: ScanResult = {
      routes: 0,
      env: 0,
      auth: 0,
      contracts: 0,
      duration: 0,
      outputPath: outputDir,
    };

    // Create generator with configuration
    const generator = new TruthpackGenerator({
      projectRoot: process.cwd(),
      outputDir: outputPath,
      scanners: {
        routes: config.rules.includes('routes'),
        env: config.rules.includes('env'),
        auth: config.rules.includes('auth'),
        contracts: config.rules.includes('contracts'),
        uiGraph: config.rules.includes('ui'),
      },
      watchMode: false,
      watchDebounceMs: config.watch.debounce,
    });

    /**
     * Internal scan operation wrapped with timeout protection.
     *
     * @throws {VibeCheckError} When scan is cancelled or times out
     */
    const scanOperation = async (): Promise<void> => {
      if (cliEnv.isInteractive && !options.json) {
        // Interactive mode with progress display
        const tasks = new Listr(
          [
            {
              title: 'Scanning codebase',
              task: async (ctx, task) => {
                // Check for cancellation
                if (cancelled) {
                  throw new VibeCheckError('Scan cancelled', 'INTERRUPTED');
                }

                task.title = 'Scanning codebase...';

                // Track generation timing
                const generateStart = Date.now();
                const truthpackResult = await performanceTracker.time('scan.generate', async () => {
                  return await generator.generate();
                });
                const truthpack = truthpackResult.result;
                phaseTimings.fileDiscovery = Date.now() - generateStart;

                // Extract per-scanner timings
                const genTimings = generator.getLastTimings();
                phaseTimings.routeScan = genTimings.routeScan;
                phaseTimings.envScan = genTimings.envScan;
                phaseTimings.authScan = genTimings.authScan;
                phaseTimings.contractScan = genTimings.contractScan;
                phaseTimings.hashComputation = genTimings.hashComputation;

                results.routes = truthpack.routes.length;
                results.env = truthpack.env.length;
                results.auth = truthpack.auth.protectedResources?.length ?? 0;
                results.contracts = truthpack.contracts.length;

                task.title = `Scanned: ${formatCount(results.routes, 'route')}, ${formatCount(results.env, 'env var')}, ${formatCount(results.auth, 'auth rule')}, ${formatCount(results.contracts, 'contract')}`;
              },
            },
            {
              title: 'Saving truthpack',
              task: async (ctx, task) => {
                if (cancelled) {
                  throw new VibeCheckError('Scan cancelled', 'INTERRUPTED');
                }

                task.title = 'Saving truthpack to disk...';
                const saveStart = Date.now();
                const savedPath = await performanceTracker.time('scan.save', async () => {
                  return await generator.generateAndSave();
                });
                phaseTimings.save = Date.now() - saveStart;
                task.title = `Saved to ${path.relative(process.cwd(), savedPath.result)}`;
              },
            },
          ],
          {
            concurrent: false,
            exitOnError: true,
            rendererOptions: {
              showTimer: true,
              collapseSubtasks: false,
            },
          }
        );

        await tasks.run();
      } else {
        // Non-interactive mode (CI or JSON output)
        logger.step('Scanning codebase...');

        // Track generation with timing
        const generateStart = Date.now();
        const truthpackResult = await performanceTracker.time('scan.generate', async () => {
          return await generator.generate();
        });
        const truthpack = truthpackResult.result;
        phaseTimings.fileDiscovery = Date.now() - generateStart;

        // Extract per-scanner timings
        const genTimings = generator.getLastTimings();
        phaseTimings.routeScan = genTimings.routeScan;
        phaseTimings.envScan = genTimings.envScan;
        phaseTimings.authScan = genTimings.authScan;
        phaseTimings.contractScan = genTimings.contractScan;
        phaseTimings.hashComputation = genTimings.hashComputation;

        if (cancelled) {
          throw new VibeCheckError('Scan cancelled', 'INTERRUPTED');
        }

        results.routes = truthpack.routes.length;
        results.env = truthpack.env.length;
        results.auth = truthpack.auth.protectedResources?.length ?? 0;
        results.contracts = truthpack.contracts.length;

        if (options.verbose) {
          logger.debug(`Found ${results.routes} routes`);
          logger.debug(`Found ${results.env} environment variables`);
          logger.debug(`Found ${results.auth} auth rules`);
          logger.debug(`Found ${results.contracts} contracts`);
          logger.debug(`Generation took ${formatDuration(phaseTimings.fileDiscovery)}`);
        }

        logger.step('Saving truthpack...');
        const saveStart = Date.now();
        await performanceTracker.time('scan.save', async () => {
          return await generator.generateAndSave();
        });
        phaseTimings.save = Date.now() - saveStart;

        if (options.verbose) {
          logger.debug(`Save took ${formatDuration(phaseTimings.save)}`);
        }
      }
    };

    // Execute with timeout
    await withTimeout(scanOperation, timeout, 'SCAN_TIMEOUT');

    results.duration = Date.now() - startTime;
    results.phases = phaseTimings;

    // Get output size
    let outputSize = 0;
    try {
      const files = await fs.readdir(outputDir);
      for (const file of files) {
        const stat = await fs.stat(path.join(outputDir, file));
        outputSize += stat.size;
      }
    } catch {
      // Ignore size calculation errors
    }

    // Calculate health metrics using unified scoring
    const scanData: ScanResultData = {
      routes: results.routes,
      env: results.env,
      auth: results.auth,
      contracts: results.contracts,
    };
    const totalItems = results.routes + results.env + results.auth + results.contracts;
    const overallScore = calculateScanScore(scanData);
    const overallStatus = getScoreStatus(overallScore);
    const verdict = getScanVerdict(overallScore);

    // Build phases for timing breakdown
    const phases: CommandPhase[] = [];
    if (phaseTimings.configLoad) {
      phases.push({ name: 'Config Load', durationMs: phaseTimings.configLoad });
    }
    if (phaseTimings.fileDiscovery) {
      phases.push({ name: 'File Discovery', durationMs: phaseTimings.fileDiscovery });
    }
    if (phaseTimings.routeScan) {
      phases.push({ name: 'Route Scan', durationMs: phaseTimings.routeScan });
    }
    if (phaseTimings.envScan) {
      phases.push({ name: 'Env Scan', durationMs: phaseTimings.envScan });
    }
    if (phaseTimings.authScan) {
      phases.push({ name: 'Auth Scan', durationMs: phaseTimings.authScan });
    }
    if (phaseTimings.contractScan) {
      phases.push({ name: 'Contract Scan', durationMs: phaseTimings.contractScan });
    }
    if (phaseTimings.save) {
      phases.push({ name: 'Save', durationMs: phaseTimings.save });
    }

    // Show updated header with results in interactive mode
    if (cliEnv.isInteractive && !options.json && !options.quiet) {
      renderCommandHeader({
        command: 'scan',
        target: process.cwd(),
        elapsedTime: results.duration,
        vitals: [
          {
            label: 'SCAN HEALTH',
            status: overallStatus,
            value: `${totalItems} items discovered`,
            percentage: overallScore,
          },
          {
            label: 'ROUTES',
            status: results.routes > 0 ? 'optimal' : 'warning',
            value: `${results.routes} routes`,
            percentage: results.routes > 0 ? 100 : 0,
          },
          {
            label: 'ENV VARS',
            status: results.env > 0 ? 'optimal' : 'stable',
            value: `${results.env} vars`,
            percentage: results.env > 0 ? 100 : 50,
          },
          {
            label: 'AUTH PATTERNS',
            status: results.auth > 0 ? 'optimal' : 'warning',
            value: `${results.auth} patterns`,
            percentage: results.auth > 0 ? 100 : 0,
          },
        ],
        diagnostics: [
          {
            level: 'info' as const,
            message: `Done in ${formatDuration(results.duration)}`,
          },
          {
            level: 'info' as const,
            message: `Size: ${formatBytes(outputSize)}`,
          },
          ...(results.routes === 0 ? [{
            level: 'warn' as const,
            message: 'No routes found',
          }] : []),
          ...(results.auth === 0 ? [{
            level: 'warn' as const,
            message: 'No auth patterns',
          }] : []),
        ],
      });
    }

    // Run Forge if requested
    let forgeResult: Awaited<ReturnType<typeof runForgeInternal>> | undefined;
    if (options.forge) {
      const userTier = getCurrentTier();
      forgeResult = await runForgeInternal({
        projectPath: process.cwd(),
        userTier,
        verbose: options.verbose,
        json: options.json,
        quiet: options.quiet,
        logger,
      });

      // Show upgrade suggestion for free tier
      if (!options.json && !options.quiet && userTier === 'free') {
        printForgeUpgradeSuggestion(userTier, logger);
      }
    }

    // Output results
    if (options.json) {
      // Build canonical CommandResult for JSON output
      const commandResult: CommandResult<ScanResultData> = {
        commandName: 'scan',
        repoRoot: process.cwd(),
        startedAt: new Date(startTime).toISOString(),
        durationMs: results.duration,
        phases,
        inputs: {
          ...createDefaultCommandInputs(),
          flags: {
            verbose: options.verbose,
            quiet: options.quiet,
            json: options.json,
            forge: options.forge,
            force: options.force,
          },
          configPath: options.config,
        },
        counts: {
          ...createEmptyCommandCounts(),
          filesScanned: totalItems, // Scan doesn't count files, use items
          filesConsidered: totalItems,
        },
        scores: {
          overall: overallScore,
        },
        verdict: {
          status: verdict,
          reasons: verdict === 'SHIP' 
            ? ['Scan completed successfully'] 
            : verdict === 'WARN'
              ? ['Some categories have no data']
              : ['Multiple categories have no data'],
        },
        artifacts: {
          truthpackPath: results.outputPath,
        },
        warnings: [
          ...(results.routes === 0 ? ['No routes found'] : []),
          ...(results.auth === 0 ? ['No auth patterns found'] : []),
        ],
        errors: [],
        data: scanData,
      };

      // Add Forge results to data if ran
      const jsonOutput: Record<string, unknown> = {
        ...commandResult,
        // Legacy fields for backward compatibility
        success: true,
        outputPath: results.outputPath,
        results: scanData,
        size: outputSize,
      };

      // Add Forge results if ran
      if (forgeResult?.ran) {
        jsonOutput.forge = forgeResult.success && forgeResult.output
          ? formatForgeOutputForJson(forgeResult.output)
          : { success: false, error: forgeResult.error };
      }

      // Add performance metrics if verbose
      if (options.verbose) {
        const metrics = performanceTracker.getAllMetrics();
        jsonOutput.performance = metrics.map(m => ({
          name: m.name,
          count: m.count,
          totalMs: m.totalMs,
          avgMs: m.avgMs,
          p95Ms: m.p95Ms,
        }));
      }

      // Using console.log for JSON output is intentional for CLI tooling
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(jsonOutput, null, 2));
    } else {
      logger.newline();
      logger.success('Truthpack generated successfully');
      logger.dim(`  ${symbols.arrow} ${formatCount(results.routes, 'route')} scanned`);
      logger.dim(`  ${symbols.arrow} ${formatCount(results.env, 'env variable')} scanned`);
      logger.dim(`  ${symbols.arrow} ${formatCount(results.auth, 'auth pattern')} scanned`);
      logger.dim(`  ${symbols.arrow} ${formatCount(results.contracts, 'contract')} scanned`);

      // Show Forge results
      if (forgeResult?.ran && forgeResult.success && forgeResult.output) {
        logger.newline();
        logger.success('AI context rules generated');
        logger.dim(`  ${symbols.arrow} ${formatCount(forgeResult.output.stats.rulesGenerated, 'rule')} generated`);
        logger.dim(`  ${symbols.arrow} ${formatCount(forgeResult.output.stats.filesWritten, 'file')} written`);
        if (forgeResult.output.contract) {
          logger.dim(`  ${symbols.arrow} AI Contract generated`);
        }
      }

      logger.newline();
      logger.dim(`Output: ${chalk.underline(results.outputPath)}`);
      if (outputSize > 0) {
        logger.dim(`Size: ${formatBytes(outputSize)}`);
      }
      logger.dim(`Duration: ${formatDuration(results.duration)}`);

      // Pro upgrade prompt with value proposition
      if (!isAuthenticated() && !options.quiet) {
        logger.newline();
        console.log(colors.primary('━'.repeat(50)));
        console.log(`${symbols.raw.star} ${chalk.bold('Pro Features Available')}`);
        console.log(colors.primary('━'.repeat(50)));
        console.log('');
        console.log(colors.muted('With Pro, this scan would also:'));
        console.log(`  ${colors.success('+')} Sync to cloud dashboard`);
        console.log(`  ${colors.success('+')} Track scan history (90 days)`);
        console.log(`  ${colors.success('+')} Generate verified Ship Badges`);
        console.log(`  ${colors.success('+')} Auto-fix issues with AI`);
        console.log(`  ${colors.success('+')} Post results to GitHub PRs`);
        console.log('');
        console.log(`${colors.muted('Start free trial:')} ${colors.info('vibecheck.dev/pro')}`);
        console.log('');
      }

      // Show dashboard promotion for non-authenticated users
      if (!isAuthenticated() && !options.quiet) {
        console.log(DASHBOARD_PROMO_MESSAGE);
      }

      // Show phase breakdown in verbose mode
      if (options.verbose && results.phases) {
        logger.newline();
        logger.info('Phase timings:');
        if (results.phases.configLoad) {
          logger.dim(`  Config load: ${formatDuration(results.phases.configLoad)}`);
        }
        if (results.phases.fileDiscovery) {
          logger.dim(`  File discovery & scanning: ${formatDuration(results.phases.fileDiscovery)}`);
        }

        // Show per-scanner timings if available
        if (results.phases.routeScan || results.phases.envScan || results.phases.authScan || results.phases.contractScan) {
          logger.newline();
          logger.info('Scanner timings:');
          if (results.phases.routeScan) {
            logger.dim(`  Routes: ${formatDuration(results.phases.routeScan)}`);
          }
          if (results.phases.envScan) {
            logger.dim(`  Environment: ${formatDuration(results.phases.envScan)}`);
          }
          if (results.phases.authScan) {
            logger.dim(`  Auth: ${formatDuration(results.phases.authScan)}`);
          }
          if (results.phases.contractScan) {
            logger.dim(`  Contracts: ${formatDuration(results.phases.contractScan)}`);
          }
          if (results.phases.hashComputation) {
            logger.dim(`  Hash computation: ${formatDuration(results.phases.hashComputation)}`);
          }
        }

        if (results.phases.save) {
          logger.dim(`  Save to disk: ${formatDuration(results.phases.save)}`);
        }

        // Show cache statistics if incremental scanning is enabled
        if (config.scan?.incremental !== false) {
          try {
            const { getCacheManager } = await import('@vibecheck/core/utils');
            const cacheManager = getCacheManager({ baseDir: process.cwd(), projectId: 'truthpack' });
            const cacheStats = cacheManager.getStats();

            if (cacheStats.hits + cacheStats.misses > 0) {
              logger.newline();
              logger.info('Cache statistics:');
              logger.dim(`  Hits: ${cacheStats.hits}`);
              logger.dim(`  Misses: ${cacheStats.misses}`);
              logger.dim(`  Hit rate: ${(cacheStats.hitRate * 100).toFixed(1)}%`);
              logger.dim(`  Entries: ${cacheStats.entries}`);
              if (cacheStats.sizeBytes > 0) {
                logger.dim(`  Size: ${formatBytes(cacheStats.sizeBytes)}`);
              }
            }
          } catch {
            // Cache stats not available, ignore
          }
        }

        // Show performance metrics summary
        const summary = performanceTracker.getSummary();
        if (summary.totalOperations > 0) {
          logger.newline();
          logger.info('Performance metrics:');
          logger.dim(`  Total operations: ${summary.totalOperations}`);
          logger.dim(`  Total time: ${formatDuration(summary.totalTimeMs)}`);
          if (summary.slowestOperation) {
            const slowest = performanceTracker.getMetric(summary.slowestOperation);
            if (slowest) {
              logger.dim(`  Slowest: ${slowest.name} (avg: ${formatDuration(slowest.avgMs)})`);
            }
          }
        }
      }
    }
  } catch (error) {
    // Handle cancellation gracefully
    if (cancelled) {
      if (!options.json) {
        logger.warn('Scan was cancelled');
      }
      process.exit(130);
    }

    if (error instanceof VibeCheckError) {
      logger.logError(error);
    } else {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(errorMessage);
    }
    process.exit(1);
  }
}
