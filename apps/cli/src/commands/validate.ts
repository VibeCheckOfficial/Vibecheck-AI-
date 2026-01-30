/**
 * Validate command - Validate code against truthpack
 */

import ora from 'ora';
import chalk from 'chalk';
import path from 'node:path';
import fs from 'node:fs/promises';
import fg from 'fast-glob';
const { glob } = fg;
import {
  CodeValidator,
  type CodeValidationResult,
} from '@vibecheck/core/validation';
import {
  calculateHealthScore,
  getScoreStatus,
  getVerdictFromScore,
} from '@vibecheck/core/scoring';
import { createLogger, loadConfig, VibeCheckError } from '../lib/index.js';
import {
  formatError,
  formatWarning,
  formatDuration,
  formatCount,
  symbols,
  colors,
} from '../ui/theme.js';
import { renderCommandHeader } from '../ui/index.js';
import { env as cliEnv } from '../lib/environment.js';
import type { ValidateOptions } from '../types.js';
import type {
  CommandResult,
  ValidateResultData,
  SeverityCounts,
} from '@repo/shared-types';
import {
  createEmptyCommandCounts,
  createDefaultCommandInputs,
  createEmptySeverityCounts,
} from '@repo/shared-types';

interface ValidationSummary {
  total: number;
  passed: number;
  failed: number;
  warnings: number;
  errors: number;  // Count of actual error findings
  duration: number;
}

interface FileValidationResult extends CodeValidationResult {
  file: string;
}

export async function validateCommand(
  files: string[],
  options: ValidateOptions
): Promise<void> {
  const logger = createLogger({
    level: options.verbose ? 'verbose' : options.quiet ? 'quiet' : 'normal',
    json: options.json,
  });

  const startTime = Date.now();

  try {
    // Show beautiful command header in interactive mode
    if (cliEnv.isInteractive && !options.json && !options.quiet) {
      renderCommandHeader({
        command: 'validate',
        target: process.cwd(),
        elapsedTime: 0,
      });
    }

    // Load configuration
    const config = await loadConfig(options.config);
    const strict = options.strict ?? config.strict;

    // Resolve file paths - if no files provided, scan src directory
    let resolvedFiles: string[];
    if (files.length > 0) {
      resolvedFiles = files.map(f => path.resolve(f));
    } else {
      // Find all TypeScript files in src
      resolvedFiles = await glob(['src/**/*.ts', 'src/**/*.tsx'], {
        cwd: process.cwd(),
        absolute: true,
        ignore: ['node_modules', 'dist', 'build', '.vibecheck'],
      });
    }

    if (resolvedFiles.length === 0) {
      logger.warn('No files found to validate');
      return;
    }

    logger.info(`Validating ${formatCount(resolvedFiles.length, 'file')}...`);
    logger.debug(`Strict mode: ${strict}`);

    // Check if truthpack exists
    const truthpackPath = path.resolve(config.truthpackPath);
    try {
      await fs.access(truthpackPath);
    } catch {
      throw VibeCheckError.fromCode('TRUTHPACK_NOT_FOUND');
    }

    const summary: ValidationSummary = {
      total: 0,
      passed: 0,
      failed: 0,
      warnings: 0,
      errors: 0,  // Track actual error count
      duration: 0,
    };

    const results: FileValidationResult[] = [];

    // Create validator with configuration
    const validator = new CodeValidator({
      strictMode: strict,
      checkTypes: true,
      checkStyle: true,
      checkSecurity: true,
      projectRoot: process.cwd(),
    });

    if (cliEnv.isInteractive && !options.json) {
      const spinner = ora('Validating files...').start();

      for (const file of resolvedFiles) {
        spinner.text = `Validating ${path.basename(file)}...`;
        
        // Read file content
        const content = await fs.readFile(file, 'utf-8');
        const result = await validator.validate(content, file);
        
        results.push({ ...result, file });
        summary.total++;

        if (result.valid) {
          summary.passed++;
        } else {
          summary.failed++;
        }
        summary.errors += result.errors?.length ?? 0;
        summary.warnings += result.warnings?.length ?? 0;
      }

      spinner.stop();
    } else {
      for (const file of resolvedFiles) {
        logger.step(`Validating ${path.basename(file)}...`);
        
        // Read file content
        const content = await fs.readFile(file, 'utf-8');
        const result = await validator.validate(content, file);
        
        results.push({ ...result, file });
        summary.total++;

        if (result.valid) {
          summary.passed++;
        } else {
          summary.failed++;
        }
        summary.errors += result.errors?.length ?? 0;
        summary.warnings += result.warnings?.length ?? 0;
      }
    }

    summary.duration = Date.now() - startTime;

    // Build severity counts for unified scoring
    // Errors are high severity, warnings are medium
    const severityCounts: SeverityCounts = {
      ...createEmptySeverityCounts(),
      high: summary.errors,
      medium: summary.warnings,
    };

    // Calculate health using unified scorer
    const overallScore = calculateHealthScore(severityCounts);
    const healthStatus = getScoreStatus(overallScore);
    const verdict = getVerdictFromScore(overallScore);

    // Show updated header with results in interactive mode
    if (cliEnv.isInteractive && !options.json && !options.quiet) {
      const diagnostics: Array<{ level: 'pass' | 'fail' | 'warn' | 'info'; message: string; details?: string }> = [];
      
      if (summary.failed > 0) {
        diagnostics.push({
          level: 'fail',
          message: `Validation failed for ${summary.failed} file(s)`,
          details: `${summary.errors} errors`,
        });
      }
      
      if (summary.warnings > 0) {
        diagnostics.push({
          level: 'warn',
          message: `${summary.warnings} warning(s) detected`,
        });
      }

      if (summary.failed === 0 && summary.warnings === 0) {
        diagnostics.push({
          level: 'pass',
          message: 'All files validated successfully',
        });
      }

      // Calculate sub-scores using same formula
      const errorScore = calculateHealthScore({ ...createEmptySeverityCounts(), high: summary.errors });
      const warningScore = calculateHealthScore({ ...createEmptySeverityCounts(), medium: summary.warnings });

      renderCommandHeader({
        command: 'validate',
        target: process.cwd(),
        elapsedTime: summary.duration,
        vitals: [
          {
            label: 'VALIDATION',
            status: healthStatus,
            value: `${summary.passed}/${summary.total} passed`,
            percentage: overallScore,
          },
          {
            label: 'ERRORS',
            status: summary.errors === 0 ? 'optimal' : 'critical',
            value: `${summary.errors} errors`,
            percentage: errorScore,
          },
          {
            label: 'WARNINGS',
            status: summary.warnings === 0 ? 'optimal' : 'warning',
            value: `${summary.warnings} warnings`,
            percentage: warningScore,
          },
        ],
        diagnostics,
      });
    }

    // Output results
    if (options.json) {
      // Build canonical CommandResult for JSON output
      const validateData: ValidateResultData = {
        passed: summary.passed,
        failed: summary.failed,
        warnings: summary.warnings,
      };

      const commandResult: CommandResult<ValidateResultData> = {
        commandName: 'validate',
        repoRoot: process.cwd(),
        startedAt: new Date(startTime).toISOString(),
        durationMs: summary.duration,
        phases: [],
        inputs: {
          ...createDefaultCommandInputs(),
          flags: {
            strict: options.strict,
            fix: options.fix,
            maxErrors: options.maxErrors,
            verbose: options.verbose,
            quiet: options.quiet,
            json: options.json,
          },
          configPath: options.config,
        },
        counts: {
          ...createEmptyCommandCounts(),
          filesScanned: summary.total,
          filesConsidered: resolvedFiles.length,
          findingsTotal: summary.errors + summary.warnings,
          findingsBySeverity: severityCounts,
          findingsByType: {
            error: summary.errors,
            warning: summary.warnings,
          },
        },
        scores: {
          overall: overallScore,
        },
        verdict: {
          status: verdict,
          reasons: verdict === 'SHIP' 
            ? ['All files validated successfully'] 
            : verdict === 'WARN'
              ? [`${summary.warnings} warning(s) detected`]
              : [`Validation failed for ${summary.failed} file(s)`],
        },
        artifacts: {},
        warnings: [],
        errors: [],
        data: validateData,
      };

      // Merge with legacy format for backward compatibility
      const jsonOutput = {
        ...commandResult,
        // Legacy fields
        success: summary.failed === 0,
        summary,
        results,
      };

      console.log(JSON.stringify(jsonOutput, null, 2));
    } else {
      logger.newline();

      // Show errors first
      for (const result of results) {
        if (!result.valid && result.errors) {
          for (const error of result.errors) {
            const location = error.location ? `:${error.location.line}:${error.location.column}` : '';
            console.log(formatError(`${path.relative(process.cwd(), result.file)}${location} - ${error.message}`));
            if (error.suggestion) {
              console.log(chalk.dim(`  ${symbols.arrow} ${error.suggestion}`));
            }
          }
        }
      }

      // Show warnings
      if (!options.quiet) {
        for (const result of results) {
          if (result.warnings) {
            for (const warning of result.warnings) {
              const location = warning.location ? `:${warning.location.line}:${warning.location.column}` : '';
              console.log(formatWarning(`${path.relative(process.cwd(), result.file)}${location} - ${warning.message}`));
            }
          }
        }
      }

      logger.newline();

      // Summary
      if (summary.failed === 0) {
        logger.success(`All validations passed`);
      } else {
        logger.error(`Validation failed`);
      }

      console.log(chalk.dim(`  ${colors.success(`${summary.passed} passed`)}, ${colors.error(`${summary.failed} failed`)}, ${colors.warning(`${summary.warnings} warnings`)}`));
      console.log(chalk.dim(`  Duration: ${formatDuration(summary.duration)}`));
    }

    // Exit with error code if validation failed
    if (summary.failed > 0) {
      process.exit(1);
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
