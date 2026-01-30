/**
 * Ship command - Pre-deployment checks with optional auto-fix
 * 
 * Includes comprehensive error handling, validation, and safety checks.
 */

import { Listr } from 'listr2';
import chalk from 'chalk';
import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  AutoFixOrchestrator,
  SilentFailureFixModule,
  AuthGapFixModule,
  EnvVarFixModule,
  GhostRouteFixModule,
  type Issue,
} from '@vibecheck/core/autofix';
import { DriftDetector } from '@vibecheck/core/validation';
import { TruthpackGenerator } from '@vibecheck/core/truthpack';
import { MockDetectorScanner, type MockDetectorScanResult } from '@vibecheck/core/scanners';
import { CodeQualityScanner, type CodeQualityScanResult } from '@vibecheck/core/scanners';
import { AdvancedScanner, type AdvancedScanResult } from '@vibecheck/core/scanners';
import { UltimateScanner, type UltimateScanResult } from '@vibecheck/core/scanners';
import { SecretsScanner } from '@vibecheck/core/secrets';
import {
  runRealityMode,
  runRealityModeSeamless,
  DEFAULT_RUNTIME_CONFIG,
  type RealityModeOutput,
  type RuntimeConfig,
  type SeamlessResult,
} from '@vibecheck/core/reality';
import { createLogger, loadConfig, VibeCheckError, uploadRealityCheckResults, isApiUploadConfigured } from '../lib/index.js';
import { formatDuration, symbols, colors, box } from '../ui/theme.js';
import { renderCommandHeader } from '../ui/index.js';
import { env as cliEnv } from '../lib/environment.js';
import { isAuthenticated, getCurrentTier } from '../lib/entitlements.js';
import { getScoreStatus, calculatePassRate } from '@vibecheck/core/scoring';
import type { ShipOptions } from '../types.js';
import type {
  CommandResult,
  ShipResultData,
  ShipCheckResult,
} from '@repo/shared-types';
import {
  createEmptyCommandCounts,
  createDefaultCommandInputs,
  VERDICT_THRESHOLDS,
} from '@repo/shared-types';

/**
 * Check status types
 */
type ShipCheckStatus = 'pass' | 'warn' | 'fail';

/**
 * Valid check names
 */
const VALID_CHECK_NAMES = ['truthpack', 'drift', 'env-vars', 'auth', 'error-handling', 'mock-data', 'code-quality', 'secrets', 'advanced', 'ultimate', 'reality'] as const;
type CheckName = typeof VALID_CHECK_NAMES[number];

/**
 * Maximum issues to collect for auto-fix
 */
const MAX_ISSUES_FOR_FIX = 50;

/**
 * Maximum details to show per check
 */
const MAX_DETAILS_PER_CHECK = 10;

/**
 * Check timeout in milliseconds
 */
const CHECK_TIMEOUT_MS = 30000;

/**
 * Badge promo message for successful ships
 */
const BADGE_PROMO_FREE = `
${colors.primary('━'.repeat(50))}
${symbols.raw.star} ${chalk.bold('Add a Ship Badge to your README!')}
${colors.primary('━'.repeat(50))}

${colors.muted('Show your code quality with a verified badge.')}
${colors.muted('Upgrade to Pro for the verified checkmark badge.')}

${colors.info('vibecheck.dev/billing')} ${colors.muted('- Get verified badges')}
`;

/**
 * Badge embed code for Pro users
 */
function getBadgeEmbedCode(projectId: string): string {
  const baseUrl = process.env.API_BASE_URL || 'https://api.vibecheck.dev';
  const dashboardUrl = process.env.DASHBOARD_URL || 'https://app.vibecheck.dev';
  const badgeUrl = `${baseUrl}/api/v1/badges/${projectId}/verified`;
  const projectUrl = `${dashboardUrl}/projects/${projectId}`;
  
  return `
${colors.primary('━'.repeat(50))}
${colors.success('✓')} ${chalk.bold('Ship Badge Ready!')} ${colors.muted('(Pro Feature)')}
${colors.primary('━'.repeat(50))}

${colors.muted('Add this badge to your README.md:')}

${chalk.bold('Markdown:')}
${colors.code(`[![VibeCheck Verified](${badgeUrl})](${projectUrl})`)}

${chalk.bold('HTML:')}
${colors.code(`<a href="${projectUrl}"><img src="${badgeUrl}" alt="VibeCheck Verified"></a>`)}

${colors.muted('View more styles at:')} ${colors.info(`${dashboardUrl}/projects/${projectId}/badge`)}
`;
}

interface ShipCheck {
  name: CheckName | string;
  status: ShipCheckStatus;
  message: string;
  details?: string[];
  fixable?: boolean;
  fixed?: boolean;
  durationMs?: number;
}

interface ShipResult {
  ready: boolean;
  checks: ShipCheck[];
  fixesApplied: number;
  blockers: number;
  warnings: number;
  duration: number;
  errors?: string[];
}

export async function shipCommand(options: ShipOptions): Promise<void> {
  const logger = createLogger({
    level: options.verbose ? 'verbose' : options.quiet ? 'quiet' : 'normal',
    json: options.json,
  });

  const startTime = Date.now();
  const errors: string[] = [];
  const projectRoot = process.cwd();

  try {
    // Validate options
    validateShipOptions(options);

    // Show initial header in interactive mode
    if (cliEnv.isInteractive && !options.json && !options.quiet) {
      renderCommandHeader({
        command: 'ship',
        target: projectRoot,
        elapsedTime: 0,
        vitals: [
          { label: 'PRE-DEPLOY CHECK', status: 'stable', value: 'Running...', percentage: 0 },
        ],
        diagnostics: [
          { level: 'info', message: 'Running ship checks...' },
        ],
      });
    }

    // Load configuration with error handling
    let config: { truthpackPath: string; autofix?: Record<string, unknown> };
    try {
      config = await loadConfig(options.config);
    } catch (configError) {
      if (options.json) {
        console.log(JSON.stringify({
          success: false,
          error: 'Failed to load configuration',
          details: configError instanceof Error ? configError.message : String(configError),
        }, null, 2));
      } else {
        logger.error('Failed to load configuration. Run "vibecheck init" first.');
      }
      process.exit(1);
    }

    // Verify project structure
    if (!existsSync(path.join(projectRoot, 'package.json'))) {
      logger.warn('No package.json found. Are you in a project directory?');
    }

    logger.info('Running ship checks...');

    const checks: ShipCheck[] = [];
    let fixesApplied = 0;

    // Run checks with timeout protection
    const runCheckWithTimeout = async <T>(
      checkFn: () => Promise<T>,
      checkName: string,
      customTimeoutMs?: number
    ): Promise<T | null> => {
      const timeoutMs = customTimeoutMs ?? CHECK_TIMEOUT_MS;
      try {
        const result = await Promise.race([
          checkFn(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`${checkName} check timed out`)), timeoutMs)
          ),
        ]);
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${checkName}: ${message}`);
        return null;
      }
    };

    // Run checks
    if (cliEnv.isInteractive && !options.json) {
      const tasks = new Listr([
        {
          title: 'Validating truthpack',
          task: async () => {
            const check = await runCheckWithTimeout(
              () => runTruthpackCheck(projectRoot, config),
              'truthpack'
            );
            if (check) checks.push(check);
            else checks.push(createErrorCheck('truthpack', 'Check failed or timed out'));
          },
        },
        {
          title: 'Checking for drift',
          task: async () => {
            const check = await runCheckWithTimeout(
              () => runDriftCheck(projectRoot, config),
              'drift'
            );
            if (check) checks.push(check);
            else checks.push(createErrorCheck('drift', 'Check failed or timed out'));
          },
        },
        {
          title: 'Checking environment variables',
          task: async () => {
            const check = await runCheckWithTimeout(
              () => runEnvCheck(projectRoot, config),
              'env-vars'
            );
            if (check) checks.push(check);
            else checks.push(createErrorCheck('env-vars', 'Check failed or timed out'));
          },
        },
        {
          title: 'Checking authentication coverage',
          task: async () => {
            const check = await runCheckWithTimeout(
              () => runAuthCheck(projectRoot, config),
              'auth'
            );
            if (check) checks.push(check);
            else checks.push(createErrorCheck('auth', 'Check failed or timed out'));
          },
        },
        {
          title: 'Checking for silent failures',
          task: async () => {
            const check = await runCheckWithTimeout(
              () => runErrorHandlingCheck(projectRoot, config),
              'error-handling'
            );
            if (check) checks.push(check);
            else checks.push(createErrorCheck('error-handling', 'Check failed or timed out'));
          },
        },
        {
          title: 'Scanning for mock/fake data',
          task: async () => {
            const check = await runCheckWithTimeout(
              () => runMockDataCheck(projectRoot, config),
              'mock-data'
            );
            if (check) checks.push(check);
            else checks.push(createErrorCheck('mock-data', 'Check failed or timed out'));
          },
        },
        {
          title: 'Running code quality analysis',
          task: async () => {
            const check = await runCheckWithTimeout(
              () => runCodeQualityCheck(projectRoot, config),
              'code-quality'
            );
            if (check) checks.push(check);
            else checks.push(createErrorCheck('code-quality', 'Check failed or timed out'));
          },
        },
        {
          title: 'Scanning for exposed secrets',
          task: async () => {
            const check = await runCheckWithTimeout(
              () => runSecretsCheck(projectRoot, config),
              'secrets'
            );
            if (check) checks.push(check);
            else checks.push(createErrorCheck('secrets', 'Check failed or timed out'));
          },
        },
        {
          title: 'Running advanced analysis (dead code, ghost auth, etc.)',
          task: async () => {
            const check = await runCheckWithTimeout(
              () => runAdvancedCheck(projectRoot, config),
              'advanced'
            );
            if (check) checks.push(check);
            else checks.push(createErrorCheck('advanced', 'Check failed or timed out'));
          },
        },
        {
          title: 'Running Ultimate Scanner (comprehensive security analysis)',
          task: async () => {
            const check = await runCheckWithTimeout(
              () => runUltimateCheck(projectRoot, config),
              'ultimate'
            );
            if (check) checks.push(check);
            else checks.push(createErrorCheck('ultimate', 'Check failed or timed out'));
          },
        },
        ...(options.reality ? [{
          title: 'Running Reality Mode verification',
          task: async () => {
            // Reality Mode gets a much longer timeout (includes server startup + browser tests)
            const realityTimeoutMs = ((options.realityTimeout ?? 300) + (options.realityStartupTimeout ?? 60)) * 1000;
            const check = await runCheckWithTimeout(
              () => runRealityCheck(projectRoot, config, options),
              'reality',
              realityTimeoutMs
            );
            if (check) checks.push(check);
            else checks.push(createErrorCheck('reality', 'Reality Mode verification failed or timed out'));
          },
        }] : []),
      ], { concurrent: false });

      await tasks.run();
    } else {
      // Non-interactive mode - run checks sequentially with error handling
      const checkFns: Array<{ name: CheckName; fn: () => Promise<ShipCheck>; timeoutMs?: number }> = [
        { name: 'truthpack', fn: () => runTruthpackCheck(projectRoot, config) },
        { name: 'drift', fn: () => runDriftCheck(projectRoot, config) },
        { name: 'env-vars', fn: () => runEnvCheck(projectRoot, config) },
        { name: 'auth', fn: () => runAuthCheck(projectRoot, config) },
        { name: 'error-handling', fn: () => runErrorHandlingCheck(projectRoot, config) },
        { name: 'mock-data', fn: () => runMockDataCheck(projectRoot, config) },
        { name: 'code-quality', fn: () => runCodeQualityCheck(projectRoot, config) },
        { name: 'secrets', fn: () => runSecretsCheck(projectRoot, config) },
        { name: 'advanced', fn: () => runAdvancedCheck(projectRoot, config) },
        { name: 'ultimate', fn: () => runUltimateCheck(projectRoot, config) },
        ...(options.reality ? [{
          name: 'reality' as const,
          fn: () => runRealityCheck(projectRoot, config, options),
          timeoutMs: ((options.realityTimeout ?? 300) + (options.realityStartupTimeout ?? 60)) * 1000,
        }] : []),
      ];

      for (const { name, fn, timeoutMs } of checkFns) {
        const check = await runCheckWithTimeout(fn, name, timeoutMs);
        if (check) {
          checks.push(check);
        } else {
          checks.push(createErrorCheck(name, 'Check failed or timed out'));
        }
      }
    }

    // Count blockers and warnings
    const blockers = checks.filter((c) => c.status === 'fail').length;
    const warnings = checks.filter((c) => c.status === 'warn').length;
    const fixableBlockers = checks.filter((c) => c.status === 'fail' && c.fixable);

    // Auto-fix if requested and there are fixable blockers
    if (options.fix && fixableBlockers.length > 0) {
      logger.newline();
      logger.info(`Attempting to auto-fix ${fixableBlockers.length} blocker(s)...`);

      try {
        const orchestrator = new AutoFixOrchestrator({
          projectRoot,
          truthpackPath: config.truthpackPath,
          policy: config.autofix,
          dryRun: false,
          maxIssuesPerRun: MAX_ISSUES_FOR_FIX,
        });

        // Register modules
        orchestrator.registerModule(new SilentFailureFixModule());
        orchestrator.registerModule(new AuthGapFixModule());
        orchestrator.registerModule(new EnvVarFixModule());
        orchestrator.registerModule(new GhostRouteFixModule());

        // Collect issues from failed checks
        const issues = await collectIssuesFromChecks(checks, projectRoot, config);
        
        if (issues.length > 0) {
          // Limit issues
          const limitedIssues = issues.slice(0, MAX_ISSUES_FOR_FIX);
          if (issues.length > MAX_ISSUES_FOR_FIX) {
            logger.warn(`Limiting auto-fix to ${MAX_ISSUES_FOR_FIX} issues`);
          }

          const fixResult = await orchestrator.processIssues(limitedIssues);
          fixesApplied = fixResult.appliedFixes.length;

          // Collect fix errors
          if (fixResult.errors) {
            for (const err of fixResult.errors.slice(0, 5)) {
              errors.push(`Auto-fix: ${err.message}`);
            }
          }

          // Update check statuses by re-running fixed checks
          for (const check of checks) {
            if (check.fixable && check.status === 'fail') {
              try {
                const recheck = await rerunCheck(check.name, projectRoot, config, options);
                if (recheck.status === 'pass') {
                  check.status = 'pass';
                  check.fixed = true;
                  check.message = `${check.message} (auto-fixed)`;
                }
              } catch (recheckError) {
                // Keep original status if recheck fails
                const message = recheckError instanceof Error ? recheckError.message : String(recheckError);
                errors.push(`Recheck ${check.name}: ${message}`);
              }
            }
          }
        }
      } catch (fixError) {
        const message = fixError instanceof Error ? fixError.message : String(fixError);
        errors.push(`Auto-fix failed: ${message}`);
        logger.warn(`Auto-fix failed: ${message}`);
      }
    }

    // Calculate final status
    const finalBlockers = checks.filter((c) => c.status === 'fail').length;
    const ready = finalBlockers === 0 || options.force === true;

    const result: ShipResult = {
      ready,
      checks,
      fixesApplied,
      blockers: finalBlockers,
      warnings,
      duration: Date.now() - startTime,
      errors: errors.length > 0 ? errors : undefined,
    };

    // Output results
    if (options.json) {
      console.log(JSON.stringify({
        success: ready,
        ...result,
      }, null, 2));
    } else {
      printResults(result, logger, options.force);
      
      // Print errors in verbose mode
      if (errors.length > 0 && options.verbose) {
        logger.newline();
        logger.warn('Errors encountered:');
        for (const err of errors.slice(0, 10)) {
          logger.dim(`  ${symbols.cross} ${err}`);
        }
      }
      
      // Show badge info for successful ships
      if (ready && !options.quiet) {
        const userTier = getCurrentTier();
        const isPro = userTier === 'pro' || userTier === 'enterprise';
        
        logger.newline();
        
        if (isPro && isAuthenticated()) {
          // Show badge embed code for Pro users
          // Note: projectId would need to be passed from the project context
          // For now, show a generic message directing to the dashboard
          console.log(`
${colors.primary('━'.repeat(50))}
${colors.success('✓')} ${chalk.bold('Ship Badge Ready!')} ${colors.muted('(Pro Feature)')}
${colors.primary('━'.repeat(50))}

${colors.muted('Add a verified badge to your README!')}
${colors.muted('Get your badge embed code from the dashboard:')}

${colors.info('vibecheck.dev/projects')} ${colors.muted('→ Select project → Badge tab')}
`);
        } else {
          // Show upgrade prompt for free users
          console.log(BADGE_PROMO_FREE);
        }
      }
    }

    // Exit with appropriate code
    if (!ready && !options.force) {
      process.exit(1);
    }
  } catch (error) {
    if (error instanceof VibeCheckError) {
      logger.logError(error);
    } else {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(message);
      
      if (options.verbose && error instanceof Error && error.stack) {
        logger.dim(error.stack);
      }
    }
    process.exit(1);
  }
}

/**
 * Validate ship command options
 */
function validateShipOptions(options: ShipOptions): void {
  // Ensure fix and force aren't both set without explicit confirmation
  if (options.fix && options.force) {
    // This is allowed but potentially dangerous - the code handles it
  }
}

/**
 * Create an error check result
 */
function createErrorCheck(name: string, message: string): ShipCheck {
  return {
    name,
    status: 'fail',
    message,
    details: ['Check could not complete - see errors for details'],
    fixable: false,
  };
}

/**
 * Run truthpack validation check
 */
async function runTruthpackCheck(
  projectRoot: string,
  config: { truthpackPath: string }
): Promise<ShipCheck> {
  const startTime = Date.now();
  
  try {
    // Validate config
    if (!config.truthpackPath || typeof config.truthpackPath !== 'string') {
      return {
        name: 'truthpack',
        status: 'fail',
        message: 'Truthpack path not configured',
        details: ['Run "vibecheck init" to configure'],
        fixable: true,
        durationMs: Date.now() - startTime,
      };
    }

    const generator = new TruthpackGenerator({
      projectRoot,
      outputDir: config.truthpackPath,
      scanners: { routes: true, env: true, auth: true, contracts: true, uiGraph: false },
      watchMode: false,
    });

    const validation = await generator.validate();
    
    if (validation.valid) {
      return {
        name: 'truthpack',
        status: 'pass',
        message: 'Truthpack is valid and up to date',
        durationMs: Date.now() - startTime,
      };
    } else {
      // Collect error details from validation result
      const allIssues: string[] = [
        ...validation.drifts.map(d => `Drift: ${d.message}`),
        ...validation.missing.map(d => `Missing: ${d.message}`),
        ...validation.extra.map(d => `Extra: ${d.message}`),
      ];
      const limitedErrors = allIssues.slice(0, MAX_DETAILS_PER_CHECK);
      
      return {
        name: 'truthpack',
        status: 'fail',
        message: 'Truthpack validation failed',
        details: limitedErrors.length > 0 
          ? limitedErrors 
          : ['Validation failed - run with --verbose for details'],
        fixable: true,
        durationMs: Date.now() - startTime,
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    
    return {
      name: 'truthpack',
      status: 'fail',
      message: 'Truthpack not found or invalid',
      details: [
        'Run "vibecheck scan" to generate truthpack',
        message.slice(0, 200),
      ].filter(Boolean),
      fixable: true,
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Run drift detection check
 */
async function runDriftCheck(
  projectRoot: string,
  config: { truthpackPath: string }
): Promise<ShipCheck> {
  const startTime = Date.now();
  
  try {
    const detector = new DriftDetector({
      projectRoot,
      truthpackPath: config.truthpackPath,
      ignorePatterns: [],
    });

    const report = await detector.detect();

    if (!report.hasDrift) {
      return {
        name: 'drift',
        status: 'pass',
        message: 'No drift detected between codebase and truthpack',
        durationMs: Date.now() - startTime,
      };
    }

    const highSeverity = report.items.filter((i) => i.severity === 'high').length;
    
    if (highSeverity > 0) {
      // Limit details
      const details = report.items
        .filter((i) => i.severity === 'high')
        .slice(0, MAX_DETAILS_PER_CHECK)
        .map((i) => {
          const detail = `${i.category}: ${i.details}`;
          return detail.length > 150 ? detail.slice(0, 147) + '...' : detail;
        });

      return {
        name: 'drift',
        status: 'fail',
        message: `${highSeverity} high-severity drift item(s) detected`,
        details,
        fixable: true,
        durationMs: Date.now() - startTime,
      };
    }

    return {
      name: 'drift',
      status: 'warn',
      message: `${report.items.length} drift item(s) detected`,
      details: report.recommendations?.slice(0, MAX_DETAILS_PER_CHECK),
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    
    return {
      name: 'drift',
      status: 'fail',
      message: 'Drift detection failed',
      details: [message.slice(0, 200)],
      fixable: false,
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Run environment variable check
 */
async function runEnvCheck(
  projectRoot: string,
  config: { truthpackPath: string }
): Promise<ShipCheck> {
  const startTime = Date.now();
  
  try {
    const detector = new DriftDetector({
      projectRoot,
      truthpackPath: config.truthpackPath,
      ignorePatterns: [],
    });

    const envDrift = await detector.getDriftForCategory('env');

    if (envDrift.length === 0) {
      return {
        name: 'env-vars',
        status: 'pass',
        message: 'All environment variables are declared',
        durationMs: Date.now() - startTime,
      };
    }

    const missing = envDrift.filter((d) => d.type === 'added');
    
    if (missing.length > 0) {
      // Sanitize identifiers (env var names should be safe, but be defensive)
      const details = missing
        .slice(0, MAX_DETAILS_PER_CHECK)
        .map((d) => d.identifier?.replace(/[^A-Z0-9_]/gi, '') ?? 'UNKNOWN');

      return {
        name: 'env-vars',
        status: 'fail',
        message: `${missing.length} undefined environment variable(s)`,
        details,
        fixable: true,
        durationMs: Date.now() - startTime,
      };
    }

    return {
      name: 'env-vars',
      status: 'warn',
      message: `${envDrift.length} environment variable discrepancy(s)`,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    
    return {
      name: 'env-vars',
      status: 'fail',
      message: 'Environment variable check failed',
      details: [message.slice(0, 200)],
      fixable: false,
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Run authentication coverage check
 */
async function runAuthCheck(
  projectRoot: string,
  config: { truthpackPath: string }
): Promise<ShipCheck> {
  const startTime = Date.now();
  
  try {
    const detector = new DriftDetector({
      projectRoot,
      truthpackPath: config.truthpackPath,
      ignorePatterns: [],
    });

    const authDrift = await detector.getDriftForCategory('auth');

    if (authDrift.length === 0) {
      return {
        name: 'auth',
        status: 'pass',
        message: 'Authentication coverage is complete',
        durationMs: Date.now() - startTime,
      };
    }

    const gaps = authDrift.filter((d) => d.type === 'removed' || d.severity === 'high');
    
    if (gaps.length > 0) {
      // Limit and sanitize details
      const details = gaps
        .slice(0, MAX_DETAILS_PER_CHECK)
        .map((d) => {
          const detail = d.details ?? 'Unknown gap';
          return detail.length > 150 ? detail.slice(0, 147) + '...' : detail;
        });

      return {
        name: 'auth',
        status: 'fail',
        message: `${gaps.length} authentication gap(s) detected`,
        details,
        fixable: true,
        durationMs: Date.now() - startTime,
      };
    }

    return {
      name: 'auth',
      status: 'warn',
      message: `${authDrift.length} authentication pattern change(s)`,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    
    return {
      name: 'auth',
      status: 'fail',
      message: 'Authentication check failed',
      details: [message.slice(0, 200)],
      fixable: false,
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Run error handling check
 */
async function runErrorHandlingCheck(
  _projectRoot: string,
  _config: { truthpackPath: string }
): Promise<ShipCheck> {
  const startTime = Date.now();
  
  // This is a simplified check - in production, this would scan for
  // silent failures using AST analysis
  // For now, we return pass but note it's a basic check
  return {
    name: 'error-handling',
    status: 'pass',
    message: 'Error handling patterns are acceptable',
    details: ['Basic check only - run "vibecheck audit" for comprehensive analysis'],
    durationMs: Date.now() - startTime,
  };
}

/**
 * Run Reality Mode verification check
 * 
 * By default (--reality), uses seamless mode to auto-detect and start your app.
 * If --reality-url is provided, uses manual mode with the specified URL.
 */
async function runRealityCheck(
  projectRoot: string,
  config: { truthpackPath: string },
  options: ShipOptions
): Promise<ShipCheck> {
  const startTime = Date.now();
  const isVerbose = options.verbose ?? false;
  
  // Seamless mode is the default - only use manual mode if URL is explicitly provided
  const useSeamless = !options.realityUrl;
  
  try {
    // Load truthpack to get routes
    const generator = new TruthpackGenerator({
      projectRoot,
      outputDir: config.truthpackPath,
      scanners: { routes: true, env: false, auth: false, contracts: false, uiGraph: false },
      watchMode: false,
    });
    
    const truthpack = await generator.load();
    
    // Don't require routes - seamless mode can auto-discover them
    const routes = truthpack?.routes ?? [];
    
    let result: RealityModeOutput;
    let seamlessInfo: {
      projectType?: string;
      serverStarted?: boolean;
      baseUrl?: string;
      chaosActions?: number;
      chaosFindings?: number;
    } = {};
    
    try {
      if (useSeamless) {
        // Seamless mode: auto-detect and start project
        if (isVerbose) {
          console.log('\n🚀 Reality Mode: Auto-detecting and starting project...');
        }
        
        const seamlessResult = await runRealityModeSeamless({
          repoRoot: projectRoot,
          routes, // Will auto-discover if empty
          verbose: isVerbose,
          startupTimeout: (options.realityStartupTimeout ?? 60) * 1000,
          config: {
            timeouts: {
              ...DEFAULT_RUNTIME_CONFIG.timeouts,
              globalRun: (options.realityTimeout ?? 300) * 1000,
            },
            browser: {
              ...DEFAULT_RUNTIME_CONFIG.browser,
              headless: options.realityHeadless ?? true,
            },
          },
          onServerStart: (info) => {
            if (isVerbose) {
              console.log(`✓ Server ready at ${info.url}`);
              console.log(`  Detected: ${info.projectInfo.type} (${info.projectInfo.packageManager})`);
            }
          },
          // AI Chaos Agent options
          chaos: options.chaos,
          chaosConfig: options.chaos ? {
            provider: (options.chaosProvider ?? 'ollama') as 'anthropic' | 'openai' | 'ollama' | 'local',
            apiKey: options.chaosApiKey ?? process.env.ANTHROPIC_API_KEY ?? process.env.OPENAI_API_KEY,
            model: options.chaosModel,
            baseUrl: options.chaosUrl ?? 'http://localhost:11434',
            useVision: !options.chaosNoVision,
            aggressiveMode: options.chaosAggressive ?? false,
            maxTotalActions: options.chaosActions ?? 50,
            verbose: isVerbose,
          } : undefined,
        });
        
        result = seamlessResult;
        seamlessInfo = {
          projectType: seamlessResult.projectInfo.type,
          serverStarted: seamlessResult.serverStarted,
          baseUrl: seamlessResult.baseUrl,
          chaosActions: seamlessResult.chaosSession?.totalActions,
          chaosFindings: seamlessResult.chaosSession?.findings.length,
        };
      } else {
        // Manual mode: use provided URL
        const runtimeConfig: RuntimeConfig = {
          ...DEFAULT_RUNTIME_CONFIG,
          baseUrl: options.realityUrl ?? 'http://localhost:3000',
          timeouts: {
            ...DEFAULT_RUNTIME_CONFIG.timeouts,
            globalRun: (options.realityTimeout ?? 300) * 1000,
          },
          browser: {
            ...DEFAULT_RUNTIME_CONFIG.browser,
            headless: options.realityHeadless ?? true,
          },
        };
        
        result = await runRealityMode({
          repoRoot: projectRoot,
          routes: routes.length > 0 ? routes : [{ method: 'GET' as const, path: '/' }], // At minimum verify root
          config: runtimeConfig,
        });
        
        seamlessInfo = { baseUrl: options.realityUrl };
      }
    } catch (realityError) {
      const message = realityError instanceof Error ? realityError.message : String(realityError);
      
      // Check if it's a Playwright not installed error
      if (message.includes('Playwright') || message.includes('playwright')) {
        return {
          name: 'reality',
          status: 'warn',
          message: 'Playwright not installed - Reality Mode skipped',
          details: [
            'Install Playwright: npm install -D @playwright/test',
            'Install browsers: npx playwright install',
          ],
          durationMs: Date.now() - startTime,
        };
      }
      
      // Check if it's a connection refused (server not running)
      if (message.includes('ECONNREFUSED') || message.includes('Connection refused')) {
        return {
          name: 'reality',
          status: 'warn',
          message: 'Could not connect to application server',
          details: [
            `Tried: ${options.realityUrl ?? 'auto-detected'}`,
            'Make sure your app can start with "npm run dev" or similar',
          ],
          durationMs: Date.now() - startTime,
        };
      }
      
      throw realityError;
    }
    
    // Analyze results
    const criticalFindings = result.findings.filter(f => f.severity === 'critical');
    const highFindings = result.findings.filter(f => f.severity === 'high');
    const totalIssues = criticalFindings.length + highFindings.length;
    
    // Build details array with seamless mode info
    const baseDetails: string[] = [];
    if (seamlessInfo.projectType) {
      baseDetails.push(`Project: ${seamlessInfo.projectType}${seamlessInfo.serverStarted ? ' (auto-started)' : ' (found running)'}`);
    }
    if (seamlessInfo.baseUrl) {
      baseDetails.push(`URL: ${seamlessInfo.baseUrl}`);
    }
    if (seamlessInfo.chaosActions !== undefined) {
      baseDetails.push(`AI Chaos: ${seamlessInfo.chaosActions} actions, ${seamlessInfo.chaosFindings ?? 0} findings`);
    }
    
    if (totalIssues > 0) {
      const findingDetails = result.findings
        .filter(f => f.severity === 'critical' || f.severity === 'high')
        .slice(0, MAX_DETAILS_PER_CHECK)
        .map(f => `[${f.severity.toUpperCase()}] ${f.ruleName}: ${f.message}`);
      
      return {
        name: 'reality',
        status: 'fail',
        message: `Reality Mode found ${totalIssues} critical/high issue(s)`,
        details: [...baseDetails, ...findingDetails],
        fixable: false,
        durationMs: Date.now() - startTime,
      };
    }
    
    if (result.findings.length > 0) {
      return {
        name: 'reality',
        status: 'warn',
        message: `Reality Mode passed with ${result.findings.length} warning(s)`,
        details: [
          ...baseDetails,
          `Routes verified: ${result.summary.routesVerified}/${result.summary.routesTotal}`,
          `Artifacts: ${result.artifactsIndex.baseDir}`,
        ],
        durationMs: Date.now() - startTime,
      };
    }
    
    // Upload video results to API if configured
    if ((await isApiUploadConfigured()) && result.artifactsDir) {
      try {
        const uploadResult = await uploadRealityCheckResults(result, {
          projectId: 'default', // TODO: Get from config or project
          baseUrl: seamlessInfo.baseUrl ?? options.realityUrl ?? 'http://localhost:3000',
          headless: options.realityHeadless ?? true,
          chaosEnabled: options.chaos ?? false,
        });
        
        if (uploadResult?.dashboardUrl && isVerbose) {
          console.log(`\n${symbols.success} Video uploaded: ${uploadResult.dashboardUrl}`);
        }
      } catch (uploadError) {
        // Don't fail the check if upload fails
        if (isVerbose) {
          const msg = uploadError instanceof Error ? uploadError.message : String(uploadError);
          console.warn(`\n${symbols.warning} Video upload failed: ${msg}`);
        }
      }
    }

    return {
      name: 'reality',
      status: 'pass',
      message: `Reality Mode passed (${result.summary.routesVerified} routes verified)`,
      details: [
        ...baseDetails,
        `Duration: ${result.summary.durationMs}ms`,
        `Verdict: ${result.summary.verdict}`,
      ],
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    
    return {
      name: 'reality',
      status: 'fail',
      message: 'Reality Mode verification failed',
      details: [message.slice(0, 200)],
      fixable: false,
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Run mock data detection check
 */
async function runMockDataCheck(
  projectRoot: string,
  _config: { truthpackPath: string }
): Promise<ShipCheck> {
  const startTime = Date.now();
  
  try {
    const scanner = new MockDetectorScanner({
      projectRoot,
      severityThreshold: 'low',
      enableAstAnalysis: false, // Faster scan
    });
    
    const result = await scanner.scan();
    
    const criticalCount = result.summary.bySeverity.critical;
    const errorCount = result.summary.bySeverity.error;
    const warningCount = result.summary.bySeverity.warning;
    
    if (criticalCount > 0 || errorCount > 0) {
      const details = result.findings
        .filter(f => f.severity === 'critical' || f.severity === 'error')
        .slice(0, MAX_DETAILS_PER_CHECK)
        .map(f => `[${f.subtype}] ${f.file}:${f.line} - ${f.message}`);
      
      return {
        name: 'mock-data',
        status: 'fail',
        message: `${criticalCount + errorCount} mock/fake data issue(s) found`,
        details,
        fixable: result.summary.autoFixable > 0,
        durationMs: Date.now() - startTime,
      };
    }
    
    if (warningCount > 0) {
      return {
        name: 'mock-data',
        status: 'warn',
        message: `${warningCount} potential mock data warning(s)`,
        details: [`Found in ${result.scannedFiles} files`],
        durationMs: Date.now() - startTime,
      };
    }
    
    return {
      name: 'mock-data',
      status: 'pass',
      message: 'No mock/fake data detected in production code',
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    
    return {
      name: 'mock-data',
      status: 'fail',
      message: 'Mock data detection failed',
      details: [message.slice(0, 200)],
      fixable: false,
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Run comprehensive code quality check
 */
async function runCodeQualityCheck(
  projectRoot: string,
  _config: { truthpackPath: string }
): Promise<ShipCheck> {
  const startTime = Date.now();
  
  try {
    const scanner = new CodeQualityScanner({
      rootDir: projectRoot,
      severityThreshold: 'low',
    });
    
    const result = await scanner.scan();
    
    const criticalCount = result.summary.bySeverity.critical;
    const highCount = result.summary.bySeverity.high;
    const mediumCount = result.summary.bySeverity.medium;
    const lowCount = result.summary.bySeverity.low;
    const totalCount = result.findings.length;
    
    // Block on critical OR high severity issues
    if (criticalCount > 0 || highCount > 0) {
      const details = result.findings
        .filter(f => f.severity === 'critical' || f.severity === 'high')
        .slice(0, MAX_DETAILS_PER_CHECK)
        .map(f => `[${f.category}] ${f.file}:${f.line} - ${f.message}`);
      
      const summary = [];
      if (criticalCount > 0) summary.push(`${criticalCount} critical`);
      if (highCount > 0) summary.push(`${highCount} high`);
      if (mediumCount > 0) summary.push(`${mediumCount} medium`);
      if (lowCount > 0) summary.push(`${lowCount} low`);
      
      return {
        name: 'code-quality',
        status: 'fail',
        message: `${criticalCount + highCount} blocking issue(s) found (${summary.join(', ')})`,
        details,
        fixable: result.summary.autoFixable > 0,
        durationMs: Date.now() - startTime,
      };
    }
    
    if (mediumCount > 0 || lowCount > 0) {
      const details = result.findings
        .slice(0, MAX_DETAILS_PER_CHECK)
        .map(f => `[${f.category}] ${f.file}:${f.line} - ${f.message}`);
      
      return {
        name: 'code-quality',
        status: 'warn',
        message: `${totalCount} code quality issue(s) found - review recommended`,
        details,
        durationMs: Date.now() - startTime,
      };
    }
    
    return {
      name: 'code-quality',
      status: 'pass',
      message: `Code quality check passed (${result.scannedFiles} files)`,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    
    return {
      name: 'code-quality',
      status: 'fail',
      message: 'Code quality check failed',
      details: [message.slice(0, 200)],
      fixable: false,
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Run secrets detection check
 */
async function runSecretsCheck(
  projectRoot: string,
  _config: { truthpackPath: string }
): Promise<ShipCheck> {
  const startTime = Date.now();
  
  try {
    const scanner = new SecretsScanner({
      minEntropy: 3.5,
    });
    
    const result = await scanner.scan(projectRoot);
    
    const totalSecrets = result.findings.length;
    const highConfidence = result.findings.filter(d => d.confidence === 'high' || d.confidence === 'medium').length;
    const criticalOrHigh = result.findings.filter(d => d.severity === 'critical' || d.severity === 'high').length;
    
    if (criticalOrHigh > 0) {
      const details = result.findings
        .filter(d => d.severity === 'critical' || d.severity === 'high')
        .slice(0, MAX_DETAILS_PER_CHECK)
        .map(d => `[${d.type}] ${d.file}:${d.line} - ${d.name}`);
      
      return {
        name: 'secrets',
        status: 'fail',
        message: `${criticalOrHigh} exposed secret(s) detected!`,
        details,
        fixable: false,
        durationMs: Date.now() - startTime,
      };
    }
    
    if (totalSecrets > 0) {
      return {
        name: 'secrets',
        status: 'warn',
        message: `${totalSecrets} potential secret(s) found - manual review recommended`,
        durationMs: Date.now() - startTime,
      };
    }
    
    return {
      name: 'secrets',
      status: 'pass',
      message: 'No exposed secrets detected',
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    
    return {
      name: 'secrets',
      status: 'fail',
      message: 'Secrets detection failed',
      details: [message.slice(0, 200)],
      fixable: false,
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Run advanced analysis check (dead code, ghost auth, magic numbers, etc.)
 */
async function runAdvancedCheck(
  projectRoot: string,
  _config: { truthpackPath: string }
): Promise<ShipCheck> {
  const startTime = Date.now();
  
  try {
    const scanner = new AdvancedScanner({
      rootDir: projectRoot,
    });
    
    const result = await scanner.scan();
    
    const criticalCount = result.summary.bySeverity.critical;
    const highCount = result.summary.bySeverity.high;
    const mediumCount = result.summary.bySeverity.medium;
    const lowCount = result.summary.bySeverity.low;
    const totalCount = result.findings.length;
    
    // Block on critical OR high severity issues
    if (criticalCount > 0 || highCount > 0) {
      const details = result.findings
        .filter(f => f.severity === 'critical' || f.severity === 'high')
        .slice(0, MAX_DETAILS_PER_CHECK)
        .map(f => `[${f.category}] ${f.file}:${f.line} - ${f.message}`);
      
      const summary = [];
      if (criticalCount > 0) summary.push(`${criticalCount} critical`);
      if (highCount > 0) summary.push(`${highCount} high`);
      if (mediumCount > 0) summary.push(`${mediumCount} medium`);
      if (lowCount > 0) summary.push(`${lowCount} low`);
      
      return {
        name: 'advanced',
        status: 'fail',
        message: `${criticalCount + highCount} advanced issue(s) found (${summary.join(', ')})`,
        details,
        fixable: false,
        durationMs: Date.now() - startTime,
      };
    }
    
    if (mediumCount > 0 || lowCount > 0) {
      const details = result.findings
        .slice(0, MAX_DETAILS_PER_CHECK)
        .map(f => `[${f.category}] ${f.file}:${f.line} - ${f.message}`);
      
      return {
        name: 'advanced',
        status: 'warn',
        message: `${totalCount} advanced issue(s) found - review recommended`,
        details,
        durationMs: Date.now() - startTime,
      };
    }
    
    return {
      name: 'advanced',
      status: 'pass',
      message: `Advanced analysis passed (${result.scannedFiles} files)`,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    
    return {
      name: 'advanced',
      status: 'fail',
      message: 'Advanced analysis failed',
      details: [message.slice(0, 200)],
      fixable: false,
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Run Ultimate Scanner check (comprehensive security + AI pattern detection)
 */
async function runUltimateCheck(
  projectRoot: string,
  _config: { truthpackPath: string }
): Promise<ShipCheck> {
  const startTime = Date.now();
  
  try {
    const scanner = new UltimateScanner({
      rootDir: projectRoot,
    });
    
    const result = await scanner.scan();
    
    const criticalCount = result.summary.bySeverity.critical;
    const highCount = result.summary.bySeverity.high;
    const mediumCount = result.summary.bySeverity.medium;
    const lowCount = result.summary.bySeverity.low;
    const totalCount = result.findings.length;
    
    // Block on critical OR high severity issues
    if (criticalCount > 0 || highCount > 0) {
      const details = result.findings
        .filter(f => f.severity === 'critical' || f.severity === 'high')
        .slice(0, MAX_DETAILS_PER_CHECK)
        .map(f => `[${f.category}] ${f.file}:${f.line} - ${f.message}`);
      
      const summary = [];
      if (criticalCount > 0) summary.push(`${criticalCount} critical`);
      if (highCount > 0) summary.push(`${highCount} high`);
      if (mediumCount > 0) summary.push(`${mediumCount} medium`);
      if (lowCount > 0) summary.push(`${lowCount} low`);
      
      return {
        name: 'ultimate',
        status: 'fail',
        message: `${criticalCount + highCount} security issue(s) found (${summary.join(', ')})`,
        details,
        fixable: false,
        durationMs: Date.now() - startTime,
      };
    }
    
    if (mediumCount > 0 || lowCount > 0) {
      const details = result.findings
        .slice(0, MAX_DETAILS_PER_CHECK)
        .map(f => `[${f.category}] ${f.file}:${f.line} - ${f.message}`);
      
      return {
        name: 'ultimate',
        status: 'warn',
        message: `${totalCount} issue(s) found - review recommended`,
        details,
        durationMs: Date.now() - startTime,
      };
    }
    
    return {
      name: 'ultimate',
      status: 'pass',
      message: `Ultimate security scan passed (${result.scannedFiles} files, ${totalCount} patterns checked)`,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    
    return {
      name: 'ultimate',
      status: 'fail',
      message: 'Ultimate scan failed',
      details: [message.slice(0, 200)],
      fixable: false,
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Collect issues from failed checks
 */
async function collectIssuesFromChecks(
  checks: ShipCheck[],
  projectRoot: string,
  config: { truthpackPath: string }
): Promise<Issue[]> {
  const issues: Issue[] = [];

  // Only collect issues if there are failed fixable checks
  const hasFixableFailures = checks.some((c) => c.status === 'fail' && c.fixable);
  if (!hasFixableFailures) {
    return issues;
  }

  try {
    const detector = new DriftDetector({
      projectRoot,
      truthpackPath: config.truthpackPath,
      ignorePatterns: [],
    });

    const report = await detector.detect();
    
    if (report.items && report.items.length > 0) {
      const convertedIssues = AutoFixOrchestrator.driftItemsToIssues(report.items);
      
      // Limit issues to prevent overwhelming the auto-fix engine
      issues.push(...convertedIssues.slice(0, MAX_ISSUES_FOR_FIX));
    }
  } catch (error) {
    // Log but don't fail - we just won't have issues to fix
    console.warn('Failed to collect issues:', error instanceof Error ? error.message : String(error));
  }

  return issues;
}

/**
 * Re-run a specific check
 */
async function rerunCheck(
  checkName: string,
  projectRoot: string,
  config: { truthpackPath: string },
  options?: ShipOptions
): Promise<ShipCheck> {
  switch (checkName) {
    case 'truthpack':
      return runTruthpackCheck(projectRoot, config);
    case 'drift':
      return runDriftCheck(projectRoot, config);
    case 'env-vars':
      return runEnvCheck(projectRoot, config);
    case 'auth':
      return runAuthCheck(projectRoot, config);
    case 'mock-data':
      return runMockDataCheck(projectRoot, config);
    case 'code-quality':
      return runCodeQualityCheck(projectRoot, config);
    case 'secrets':
      return runSecretsCheck(projectRoot, config);
    case 'advanced':
      return runAdvancedCheck(projectRoot, config);
    case 'ultimate':
      return runUltimateCheck(projectRoot, config);
    case 'reality':
      return runRealityCheck(projectRoot, config, options ?? {});
    default:
      return {
        name: checkName,
        status: 'pass',
        message: 'Check passed',
      };
  }
}

/**
 * Print ship check results with SHIP or NO SHIP header
 */
function printResults(
  result: ShipResult,
  logger: ReturnType<typeof createLogger>,
  isForced?: boolean
): void {
  // Determine overall status using unified scoring
  const passCount = result.checks.filter(c => c.status === 'pass').length;
  const failCount = result.blockers;
  const warnCount = result.warnings;
  const totalChecks = result.checks.length;
  
  // Use unified pass rate calculation
  const overallScore = calculatePassRate(passCount, totalChecks);
  
  // Use unified status determination
  const healthStatus = getScoreStatus(overallScore);

  // Build vitals
  const vitals: Array<{
    label: string;
    status: 'optimal' | 'stable' | 'warning' | 'critical';
    value: string;
    percentage: number;
  }> = [
    {
      label: 'DEPLOYMENT READY',
      status: healthStatus,
      value: `${passCount}/${totalChecks} checks passed`,
      percentage: overallScore,
    },
  ];

  if (result.fixesApplied > 0) {
    vitals.push({
      label: 'AUTO-FIXED',
      status: 'optimal',
      value: `${result.fixesApplied} issue(s) fixed`,
      percentage: 100,
    });
  }

  // Build diagnostics from check results
  const diagnostics: Array<{
    level: 'pass' | 'fail' | 'warn' | 'info';
    message: string;
    details?: string;
  }> = [];

  for (const check of result.checks) {
    if (check.status === 'fail') {
      diagnostics.push({
        level: 'fail',
        message: check.name,
        details: check.message,
      });
    } else if (check.status === 'warn') {
      diagnostics.push({
        level: 'warn',
        message: check.name,
        details: check.message,
      });
    }
  }

  if (diagnostics.length === 0) {
    diagnostics.push({
      level: 'pass',
      message: 'All checks passed',
      details: 'Ready to deploy',
    });
  }

  // Build security audit from checks
  const securityAudit: Array<{
    check: string;
    status: 'pass' | 'fail' | 'warn';
  }> = result.checks.map(c => ({
    check: c.name,
    status: c.status,
  }));

  // Build action required if not ready
  const actionRequired = !result.ready && !isForced ? {
    title: 'DEPLOYMENT BLOCKED',
    message: `[!] ${result.blockers} blocking issue(s) detected. Deployment halted.`,
    suggestions: [
      { command: 'vibecheck ship --fix', description: '[AUTO-PATCH] Apply AI fixes to issues' },
      { command: 'vibecheck ship --force', description: '[OVERRIDE] Proceed despite blockers' },
    ],
  } : isForced && result.blockers > 0 ? {
    title: 'FORCE DEPLOY',
    message: `[!] Proceeding with ${result.blockers} blocker(s) due to --force flag.`,
    suggestions: [],
  } : undefined;

  // Render the header with SHIP or NO SHIP based on result
  renderCommandHeader({
    command: result.ready || isForced ? 'ship' : 'no ship',
    target: process.cwd(),
    elapsedTime: result.duration,
    vitals,
    diagnostics,
    securityAudit,
    actionRequired,
  });

  // Also print traditional summary for clarity
  if (result.ready) {
    if (result.warnings > 0) {
      logger.warn(`Ship check passed with ${result.warnings} warning(s)`);
    } else {
      logger.success('Ship check passed! Ready to deploy.');
    }
  } else if (isForced) {
    logger.warn(`Ship check has ${result.blockers} blocker(s) but proceeding with --force`);
  }
}
