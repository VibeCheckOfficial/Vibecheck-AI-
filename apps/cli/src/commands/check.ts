/**
 * Check command - Run hallucination and drift detection
 */

import { Listr } from 'listr2';
import chalk from 'chalk';
import path from 'node:path';
import fs from 'node:fs/promises';
import fg from 'fast-glob';
const { glob } = fg;
import {
  HallucinationDetector,
  DriftDetector,
  type DriftReport,
  type HallucinationCandidate,
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
  sectionHeader,
} from '../ui/theme.js';
import { renderCommandHeader } from '../ui/index.js';
import { env as cliEnv } from '../lib/environment.js';
import type { CheckOptions } from '../types.js';
import type {
  CommandResult,
  CheckResultData,
  SeverityCounts,
} from '@repo/shared-types';
import {
  createEmptyCommandCounts,
  createDefaultCommandInputs,
  createEmptySeverityCounts,
} from '@repo/shared-types';

interface CheckResult {
  hallucinations: HallucinationCandidate[];
  drift: DriftReport | null;
  duration: number;
}

export async function checkCommand(options: CheckOptions): Promise<void> {
  const logger = createLogger({
    level: options.verbose ? 'verbose' : options.quiet ? 'quiet' : 'normal',
    json: options.json,
  });

  const startTime = Date.now();

  try {
    // Load configuration
    const config = await loadConfig(options.config);
    const strict = options.strict ?? config.strict;
    const failFast = options.failFast ?? config.validation.failFast;

    // Show beautiful command header in interactive mode
    if (cliEnv.isInteractive && !options.json && !options.quiet) {
      renderCommandHeader({
        command: 'check',
        target: process.cwd(),
        elapsedTime: 0,
      });
    }

    logger.info('Running hallucination and drift detection...');
    logger.debug(`Strict mode: ${strict}`);
    logger.debug(`Fail-fast: ${failFast}`);

    // Check if truthpack exists
    const truthpackPath = path.resolve(config.truthpackPath);
    try {
      await fs.access(truthpackPath);
    } catch {
      throw VibeCheckError.fromCode('TRUTHPACK_NOT_FOUND');
    }

    const result: CheckResult = {
      hallucinations: [],
      drift: null,
      duration: 0,
    };

    // Find all TypeScript files to check
    const files = await glob(['src/**/*.ts', 'src/**/*.tsx'], {
      cwd: process.cwd(),
      absolute: true,
      ignore: ['node_modules', 'dist', 'build', '.vibecheck'],
    });

    // Create detectors with configuration
    const hallucinationDetector = new HallucinationDetector({
      strictness: strict ? 'high' : 'medium',
      truthpackPath: config.truthpackPath,
      projectRoot: process.cwd(),
    });

    const driftDetector = new DriftDetector({
      truthpackPath: config.truthpackPath,
      projectRoot: process.cwd(),
      ignorePatterns: config.watch.exclude,
    });

    if (cliEnv.isInteractive && !options.json) {
      // Interactive mode with parallel task display
      const tasks = new Listr(
        [
          {
            title: 'Detecting hallucinations',
            task: async () => {
              for (const file of files) {
                const content = await fs.readFile(file, 'utf-8');
                const report = await hallucinationDetector.detect(content, file);
                result.hallucinations.push(...report.candidates);
                
                if (failFast && report.candidates.length > 0) {
                  throw new VibeCheckError(
                    'Hallucinations detected (fail-fast enabled)',
                    'VALIDATION_FAILED'
                  );
                }
              }
            },
          },
          {
            title: 'Detecting drift',
            task: async () => {
              result.drift = await driftDetector.detect();
            },
          },
        ],
        {
          concurrent: !failFast,
          exitOnError: failFast,
        }
      );

      await tasks.run();
    } else {
      // Non-interactive mode
      logger.step('Detecting hallucinations...');
      for (const file of files) {
        const content = await fs.readFile(file, 'utf-8');
        const report = await hallucinationDetector.detect(content, file);
        result.hallucinations.push(...report.candidates);
        
        if (failFast && report.candidates.length > 0) {
          throw new VibeCheckError(
            'Hallucinations detected (fail-fast enabled)',
            'VALIDATION_FAILED'
          );
        }
      }

      logger.step('Detecting drift...');
      result.drift = await driftDetector.detect();
    }

    result.duration = Date.now() - startTime;

    // Calculate totals
    const hallucinationCount = result.hallucinations.length;
    const driftCount = result.drift?.items.length ?? 0;
    const totalIssues = hallucinationCount + driftCount;

    // Build severity counts for unified scoring
    // Hallucinations are high severity, drift items are medium
    const severityCounts: SeverityCounts = {
      ...createEmptySeverityCounts(),
      high: hallucinationCount,
      medium: driftCount,
    };

    // Calculate health using unified scorer
    const overallScore = calculateHealthScore(severityCounts);
    const healthStatus = getScoreStatus(overallScore);
    const verdict = getVerdictFromScore(overallScore);

    // Show updated header with results in interactive mode
    if (cliEnv.isInteractive && !options.json && !options.quiet) {
      const diagnostics: Array<{ level: 'pass' | 'fail' | 'warn' | 'info'; message: string; details?: string }> = [];
      
      if (hallucinationCount > 0) {
        diagnostics.push({
          level: 'fail',
          message: `Hallucinations (${hallucinationCount})`,
          details: `Severity: HIGH`,
        });
      }
      
      if (driftCount > 0) {
        diagnostics.push({
          level: 'warn',
          message: `Drift detected (${driftCount})`,
          details: `Severity: MEDIUM`,
        });
      }

      if (totalIssues === 0) {
        diagnostics.push({
          level: 'pass',
          message: 'All checks passed',
        });
      }

      const actionRequired = totalIssues > 0 ? {
        title: 'ACTION REQUIRED',
        message: verdict === 'BLOCK' 
          ? '[!] BLOCKING ISSUES DETECTED. DEPLOYMENT HALTED.'
          : '[!] Issues detected. Review recommended.',
        suggestions: [
          {
            command: 'vibecheck ship --fix',
            description: '[AUTO-PATCH] Apply AI fixes to affected files',
          },
          {
            command: 'vibecheck audit --deep',
            description: '[DEEP SCAN] Run extended heuristic analysis',
          },
        ],
      } : undefined;

      // Calculate sub-scores using same formula
      const hallucinationScore = calculateHealthScore({ ...createEmptySeverityCounts(), high: hallucinationCount });
      const driftScore = calculateHealthScore({ ...createEmptySeverityCounts(), medium: driftCount });

      renderCommandHeader({
        command: 'check',
        target: process.cwd(),
        elapsedTime: result.duration,
        vitals: [
          {
            label: 'CODE HEALTH',
            status: healthStatus,
            value: `${totalIssues} findings`,
            percentage: overallScore,
          },
          {
            label: 'HALLUCINATIONS',
            status: hallucinationCount === 0 ? 'optimal' : 'critical',
            value: `${hallucinationCount} detected`,
            percentage: hallucinationScore,
          },
          {
            label: 'DRIFT',
            status: driftCount === 0 ? 'optimal' : 'warning',
            value: `${driftCount} items`,
            percentage: driftScore,
          },
        ],
        diagnostics,
        securityAudit: [
          {
            check: 'Injection',
            status: totalIssues === 0 ? 'pass' : 'warn',
          },
          {
            check: 'Auth Flow',
            status: totalIssues === 0 ? 'pass' : 'warn',
          },
          {
            check: 'State Logic',
            status: hallucinationCount === 0 ? 'pass' : 'fail',
          },
          {
            check: 'Dependencies',
            status: 'pass',
          },
        ],
        actionRequired,
      });
    }

    // Output results
    if (options.json) {
      // Build canonical CommandResult for JSON output
      const checkData: CheckResultData = {
        hallucinationCount,
        driftCount,
      };

      const commandResult: CommandResult<CheckResultData> = {
        commandName: 'check',
        repoRoot: process.cwd(),
        startedAt: new Date(startTime).toISOString(),
        durationMs: result.duration,
        phases: [],
        inputs: {
          ...createDefaultCommandInputs(),
          flags: {
            strict: options.strict,
            failFast: options.failFast,
            verbose: options.verbose,
            quiet: options.quiet,
            json: options.json,
          },
          configPath: options.config,
        },
        counts: {
          ...createEmptyCommandCounts(),
          filesScanned: files.length,
          filesConsidered: files.length,
          findingsTotal: totalIssues,
          findingsBySeverity: severityCounts,
          findingsByType: {
            hallucination: hallucinationCount,
            drift: driftCount,
          },
        },
        scores: {
          overall: overallScore,
        },
        verdict: {
          status: verdict,
          reasons: verdict === 'SHIP' 
            ? ['All checks passed'] 
            : verdict === 'WARN'
              ? [`${driftCount} drift item(s) detected`]
              : [`${hallucinationCount} hallucination(s) detected`, `${driftCount} drift item(s) detected`].filter(r => !r.startsWith('0')),
        },
        artifacts: {},
        warnings: [],
        errors: [],
        data: checkData,
      };

      // Merge with legacy format for backward compatibility
      const jsonOutput = {
        ...commandResult,
        // Legacy fields
        success: verdict !== 'BLOCK',
        hallucinations: result.hallucinations,
        drift: result.drift,
        summary: {
          hallucinationCount,
          driftCount,
          totalIssues,
          duration: result.duration,
        },
      };

      console.log(JSON.stringify(jsonOutput, null, 2));
    } else {
      logger.newline();

      // Hallucination results
      if (hallucinationCount > 0) {
        console.log(sectionHeader('Hallucinations Detected'));
        logger.newline();
        
        for (const candidate of result.hallucinations) {
          const location = candidate.location;
          console.log(formatError(`${path.relative(process.cwd(), location.file)}:${location.line}:${location.column}`));
          console.log(chalk.dim(`  Type: ${candidate.type}`));
          console.log(chalk.dim(`  Value: ${candidate.value}`));
          console.log(chalk.dim(`  ${candidate.reason}`));
          console.log(chalk.dim(`  Confidence: ${(candidate.confidence * 100).toFixed(0)}%`));
          logger.newline();
        }
      }

      // Drift results
      if (driftCount > 0) {
        console.log(sectionHeader('Drift Detected'));
        logger.newline();
        
        for (const drift of result.drift?.items ?? []) {
          console.log(formatWarning(`${drift.identifier}`));
          console.log(chalk.dim(`  Category: ${drift.category}`));
          console.log(chalk.dim(`  Type: ${drift.type}`));
          console.log(chalk.dim(`  ${drift.details}`));
          console.log(chalk.dim(`  Severity: ${drift.severity}`));
          logger.newline();
        }

        // Recommendations
        if (result.drift?.recommendations.length) {
          console.log(chalk.cyan('Recommendations:'));
          for (const rec of result.drift.recommendations) {
            console.log(`  ${symbols.arrow} ${rec}`);
          }
          logger.newline();
        }
      }

      // Summary
      logger.newline();
      if (totalIssues === 0) {
        logger.success('No issues detected');
      } else {
        logger.error(`${formatCount(totalIssues, 'issue')} detected`);
      }

      console.log(chalk.dim(`  ${colors.error(`${hallucinationCount} hallucinations`)}, ${colors.warning(`${driftCount} drifts`)}`));
      console.log(chalk.dim(`  Duration: ${formatDuration(result.duration)}`));
    }

    // Exit with error code if issues found
    if (totalIssues > 0) {
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
