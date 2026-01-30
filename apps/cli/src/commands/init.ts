/**
 * Init command - Initialize vibecheck configuration
 * 
 * Supports a --quick mode for 60-second first-run flow that:
 * 1. Creates minimal config
 * 2. Auto-runs scan
 * 3. Calculates Ship Score
 * 4. Shows top 3 fixable issues with CTA
 */

import path from 'node:path';
import fs from 'node:fs/promises';
import chalk from 'chalk';
import {
  createLogger,
  VibeCheckError,
  getConfigPath,
  generateConfigTemplate,
  runForgeInternal,
  getCurrentTier,
  formatForgeOutputForJson,
  printForgeUpgradeSuggestion,
} from '../lib/index.js';
import {
  detectCIPlatform,
  integrateWithCI,
  type CIIntegrationResult,
} from '../lib/ci-integration.js';
import { symbols, formatDuration } from '../ui/theme.js';
import { renderCommandHeader } from '../ui/index.js';
import { renderQuickInitOutput } from '../ui/ship-score.js';
import { runInitWizard, confirmOverwrite } from '../ui/prompts/init-wizard.js';
import { env as cliEnv } from '../lib/environment.js';
import type { InitOptions } from '../types.js';
import { CLI_VERSION } from '../lib/version.js';

const CONFIG_FILENAME = 'vibecheck.config.mjs';
const VIBECHECK_DIR = '.vibecheck';

export async function initCommand(options: InitOptions): Promise<void> {
  const logger = createLogger({
    level: options.verbose ? 'verbose' : options.quiet ? 'quiet' : 'normal',
    json: options.json,
  });

  const startTime = Date.now();

  try {
    // Show beautiful command header in interactive mode
    if (cliEnv.isInteractive && !options.json) {
      renderCommandHeader({
        command: 'init',
        version: CLI_VERSION,
        target: process.cwd(),
        elapsedTime: 0,
      });
    }

    const configPath = path.resolve(process.cwd(), CONFIG_FILENAME);
    const vibecheckDir = path.resolve(process.cwd(), VIBECHECK_DIR);

    // Check if config already exists
    const existingConfig = await getConfigPath();
    if (existingConfig && !options.force) {
      if (cliEnv.isInteractive && !options.json) {
        const shouldOverwrite = await confirmOverwrite(existingConfig);
        if (!shouldOverwrite) {
          logger.info('Initialization cancelled');
          return;
        }
      } else {
        throw new VibeCheckError(
          `Configuration already exists at ${existingConfig}`,
          'CONFIG_INVALID',
          {
            suggestions: [
              'Use --force to overwrite existing configuration',
              'Edit the existing configuration file directly',
            ],
          }
        );
      }
    }

    let configContent: string;

    if (cliEnv.isInteractive && !options.json && !options.template) {
      // Run interactive wizard
      const result = await runInitWizard();
      if (!result) {
        return; // User cancelled
      }
      configContent = result.configContent;
    } else {
      // Use template directly
      const template = options.template ?? 'standard';
      configContent = generateConfigTemplate(template);
    }

    // Create .vibecheck directory
    logger.debug(`Creating ${VIBECHECK_DIR} directory...`);
    await fs.mkdir(vibecheckDir, { recursive: true });

    // Create .gitignore in .vibecheck if it doesn't exist
    const gitignorePath = path.join(vibecheckDir, '.gitignore');
    try {
      await fs.access(gitignorePath);
    } catch {
      await fs.writeFile(gitignorePath, '# VibeCheck cache\n*.cache\n*.tmp\n');
    }

    // Write config file
    logger.debug(`Writing configuration to ${CONFIG_FILENAME}...`);
    await fs.writeFile(configPath, configContent, 'utf-8');

    // Run Forge to generate AI context rules if requested
    let forgeResult: Awaited<ReturnType<typeof runForgeInternal>> | undefined;
    if (options.forge) {
      logger.newline();
      const userTier = getCurrentTier();
      forgeResult = await runForgeInternal({
        projectPath: process.cwd(),
        userTier,
        verbose: options.verbose,
        json: options.json,
        quiet: options.quiet,
        logger,
      });
    }

    // Quick mode: auto-scan and show Ship Score
    let quickModeResult: {
      score: import('@vibecheck/core/scoring').ShipScoreBreakdown;
      findings: import('@vibecheck/core/scoring').ShipScoreFinding[];
      scanDuration: number;
    } | undefined;

    if (options.quick) {
      logger.newline();
      if (!options.json) {
        logger.info('Running quick scan...');
      }

      try {
        // Import core modules
        const { TruthpackGenerator } = await import('@vibecheck/core/truthpack');
        const { calculateShipScore, getTopFixableIssues } = await import('@vibecheck/core/scoring');
        const { DriftDetector } = await import('@vibecheck/core/validation');

        const scanStartTime = Date.now();

        // Create generator and run scan
        const generator = new TruthpackGenerator({
          projectRoot: process.cwd(),
          outputDir: '.vibecheck/truthpack',
          scanners: {
            routes: true,
            env: true,
            auth: true,
            contracts: true,
            uiGraph: false,
          },
          watchMode: false,
        });

        // Generate and save truthpack
        const truthpack = await generator.generate();
        await generator.generateAndSave();

        // Run drift detection to find issues
        const driftDetector = new DriftDetector({
          projectRoot: process.cwd(),
          truthpackPath: '.vibecheck/truthpack',
        });

        const driftReport = await driftDetector.detect();

        // Convert drift items to findings
        const findings: import('@vibecheck/core/scoring').ShipScoreFinding[] = driftReport.items.map(item => ({
          type: item.type,
          severity: item.severity === 'critical' || item.severity === 'high' ? 'error' as const : 
                   item.severity === 'medium' ? 'warning' as const : 'info' as const,
          category: item.category === 'route' ? 'ghost_route' as const :
                    item.category === 'env' ? 'ghost_env' as const :
                    item.category === 'auth' ? 'auth_drift' as const :
                    item.category === 'api' ? 'contract_violation' as const : 'other' as const,
          file: item.location?.file,
          message: item.details,
          autoFixable: true,
        }));

        // Calculate Ship Score
        const score = calculateShipScore({
          truthpack: {
            routes: truthpack.routes || [],
            env: truthpack.env || [],
            auth: truthpack.auth || {},
            contracts: truthpack.contracts || [],
          },
          findings,
          driftResults: {
            routeDrifts: driftReport.items.filter(i => i.category === 'route').length,
            envDrifts: driftReport.items.filter(i => i.category === 'env').length,
            authDrifts: driftReport.items.filter(i => i.category === 'auth').length,
            contractDrifts: driftReport.items.filter(i => i.category === 'api').length,
          },
        });

        quickModeResult = {
          score,
          findings: getTopFixableIssues(findings, 3),
          scanDuration: Date.now() - scanStartTime,
        };

      } catch (scanError) {
        // Quick scan failed - continue with normal init output
        if (options.verbose) {
          const errorMessage = scanError instanceof Error ? scanError.message : String(scanError);
          logger.warn(`Quick scan failed: ${errorMessage}`);
        }
      }
    }

    // Connect to CI/CD if requested
    let ciResult: CIIntegrationResult | undefined;
    if (options.connect) {
      logger.newline();
      if (!options.json) {
        logger.info('Detecting CI/CD platform...');
      }

      const detection = await detectCIPlatform(process.cwd());
      
      if (!options.json) {
        logger.info(`Detected: ${chalk.cyan(detection.platform)}`);
      }

      ciResult = await integrateWithCI({
        projectPath: process.cwd(),
        includeCheck: true,
        includeShip: options.shipGate,
        includeForge: options.forge,
        failOnError: true,
        runOnPR: true,
      });

      if (!options.json && ciResult.success) {
        logger.success(`CI/CD integration configured for ${detection.platform}`);
      }
    }

    const duration = Date.now() - startTime;

    // Build diagnostics for header
    const diagnostics: Array<{ level: 'pass' | 'warn' | 'fail' | 'info'; message: string }> = [
      { level: 'pass', message: `Created ${CONFIG_FILENAME}` },
      { level: 'pass', message: `Created ${VIBECHECK_DIR}/ directory` },
    ];

    if (forgeResult?.ran) {
      if (forgeResult.success && forgeResult.output) {
        diagnostics.push({
          level: 'pass',
          message: `Generated ${forgeResult.output.stats.rulesGenerated} AI context rules`,
        });
      } else {
        diagnostics.push({
          level: 'warn',
          message: `AI context rules: ${forgeResult.error || 'failed'}`,
        });
      }
    }

    if (ciResult) {
      if (ciResult.success) {
        diagnostics.push({
          level: 'pass',
          message: `CI/CD connected: ${ciResult.platform}`,
        });
        for (const file of ciResult.filesCreated) {
          diagnostics.push({
            level: 'info',
            message: `Created ${file}`,
          });
        }
        for (const file of ciResult.filesModified) {
          diagnostics.push({
            level: 'info',
            message: `Modified ${file}`,
          });
        }
      } else {
        diagnostics.push({
          level: 'warn',
          message: `CI/CD: ${ciResult.errors?.[0] || 'failed'}`,
        });
      }
    }

    // Show updated header with results in interactive mode
    if (cliEnv.isInteractive && !options.json) {
      renderCommandHeader({
        command: 'init',
        version: CLI_VERSION,
        target: process.cwd(),
        elapsedTime: duration,
        vitals: [
          {
            label: 'INITIALIZATION',
            status: 'optimal',
            value: 'Complete',
            percentage: 100,
          },
        ],
        diagnostics,
      });
    }

    // Output results
    if (options.json) {
      const jsonOutput: Record<string, unknown> = {
        success: true,
        configPath,
        vibecheckDir,
      };

      // Add Forge results if ran
      if (forgeResult?.ran) {
        jsonOutput.forge = forgeResult.success && forgeResult.output
          ? formatForgeOutputForJson(forgeResult.output)
          : { success: false, error: forgeResult.error };
      }

      // Add CI/CD results if ran
      if (ciResult) {
        jsonOutput.ci = {
          success: ciResult.success,
          platform: ciResult.platform,
          filesCreated: ciResult.filesCreated,
          filesModified: ciResult.filesModified,
          instructions: ciResult.instructions,
          errors: ciResult.errors,
        };
      }

      // Add quick mode results
      if (quickModeResult) {
        jsonOutput.shipScore = {
          total: quickModeResult.score.total,
          verdict: quickModeResult.score.verdict,
          dimensions: quickModeResult.score.dimensions,
          topIssues: quickModeResult.findings.map(f => ({
            type: f.type,
            severity: f.severity,
            category: f.category,
            message: f.message,
            file: f.file,
            autoFixable: f.autoFixable,
          })),
        };
        jsonOutput.scanDuration = quickModeResult.scanDuration;
      }

      console.log(JSON.stringify(jsonOutput, null, 2));
    } else if (quickModeResult) {
      // Quick mode interactive output
      const userTier = getCurrentTier();
      console.log(renderQuickInitOutput(
        quickModeResult.score,
        quickModeResult.findings,
        duration,
        {
          isPro: userTier === 'pro' || userTier === 'enterprise',
          projectPath: process.cwd(),
        }
      ));
    } else {
      logger.newline();
      logger.success('VibeCheck initialized successfully!');
      logger.newline();
      console.log(`  ${symbols.bullet} Created ${chalk.cyan(CONFIG_FILENAME)}`);
      console.log(`  ${symbols.bullet} Created ${chalk.cyan(VIBECHECK_DIR + '/')}`);
      
      // Show Forge results
      if (forgeResult?.ran && forgeResult.success && forgeResult.output) {
        console.log(`  ${symbols.bullet} Generated ${chalk.cyan(forgeResult.output.stats.rulesGenerated + ' AI context rules')}`);
        if (forgeResult.output.contract) {
          console.log(`  ${symbols.bullet} Created ${chalk.cyan('AI Contract')}`);
        }
      }

      // Show CI/CD results
      if (ciResult?.success) {
        console.log(`  ${symbols.bullet} Connected to ${chalk.cyan(ciResult.platform)}`);
        for (const file of ciResult.filesCreated) {
          console.log(`    ${symbols.arrow} Created ${chalk.green(file)}`);
        }
        for (const file of ciResult.filesModified) {
          console.log(`    ${symbols.arrow} Modified ${chalk.yellow(file)}`);
        }
      }
      
      logger.newline();
      console.log(chalk.dim('Next steps:'));
      console.log(`  ${symbols.arrow} Run ${chalk.cyan('vibecheck scan')} to generate your truthpack`);
      console.log(`  ${symbols.arrow} Run ${chalk.cyan('vibecheck check')} to validate your codebase`);
      if (!options.forge) {
        console.log(`  ${symbols.arrow} Run ${chalk.cyan('vibecheck init --forge')} to generate AI context rules`);
      }
      if (!options.connect) {
        console.log(`  ${symbols.arrow} Run ${chalk.cyan('vibecheck init --connect')} to integrate with CI/CD`);
      }
      console.log(`  ${symbols.arrow} Edit ${chalk.cyan(CONFIG_FILENAME)} to customize settings`);

      // Show CI/CD instructions
      if (ciResult?.success && ciResult.instructions.length > 0) {
        logger.newline();
        console.log(chalk.dim('CI/CD Integration:'));
        for (const instruction of ciResult.instructions) {
          console.log(`  ${symbols.info} ${instruction}`);
        }
      }
      
      // Show upgrade suggestion for free tier
      if (forgeResult?.ran) {
        const userTier = getCurrentTier();
        if (userTier === 'free') {
          printForgeUpgradeSuggestion(userTier, logger);
        }
      }
    }
  } catch (error) {
    if (error instanceof VibeCheckError) {
      logger.logError(error);
    } else {
      logger.error(error instanceof Error ? error.message : String(error));
    }
    process.exit(1);
  }
}
