/**
 * Fix command - Apply auto-fixes for detected issues
 * 
 * Includes comprehensive error handling, input validation, and safety checks.
 */

import { Listr } from 'listr2';
import chalk from 'chalk';
import * as p from '@clack/prompts';
import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import {
  AutoFixOrchestrator,
  ReviewPipeline,
  RollbackManager,
  SilentFailureFixModule,
  AuthGapFixModule,
  EnvVarFixModule,
  GhostRouteFixModule,
  PatchGenerator,
  type Issue,
  type FixResult,
  type ProposedFix,
} from '@vibecheck/core/autofix';
import { DriftDetector } from '@vibecheck/core/validation';
import { createLogger, loadConfig, getConfigPath, VibeCheckError } from '../lib/index.js';
import { formatDuration, symbols, printBanner } from '../ui/theme.js';
import { env as cliEnv } from '../lib/environment.js';
import type { FixOptions } from '../types.js';

/**
 * Maximum issues to process in one run
 */
const MAX_ISSUES_PER_RUN = 100;

/**
 * Maximum files to show in output
 */
const MAX_FILES_TO_DISPLAY = 20;

interface FixCommandResult {
  totalIssues: number;
  fixableIssues: number;
  appliedFixes: number;
  suggestedFixes: number;
  rejectedFixes: number;
  duration: number;
  errors?: string[];
}

export async function fixCommand(options: FixOptions): Promise<void> {
  const logger = createLogger({
    level: options.verbose ? 'verbose' : options.quiet ? 'quiet' : 'normal',
    json: options.json,
  });

  const startTime = Date.now();
  const errors: string[] = [];

  try {
    // Validate options
    validateOptions(options);

    // Show banner in interactive mode
    if (cliEnv.isInteractive && !options.json && !options.quiet) {
      printBanner();
    }

    // Handle rollback request
    if (options.rollback) {
      await handleRollback(options.rollback, logger, options);
      return;
    }

    // Load configuration with error handling
    // For --dry-run, missing config is not fatal - we just report "nothing to fix"
    let config: { truthpackPath: string; autofix?: Record<string, unknown> };
    let configFilePath: string | null = null;
    
    // First check if a config file exists
    try {
      configFilePath = await getConfigPath();
    } catch {
      configFilePath = null;
    }
    
    // For dry-run, if no config FILE exists, exit early
    // This prevents analysis machinery from modifying files
    if (options.dryRun && !configFilePath) {
      if (options.json) {
        console.log(JSON.stringify({
          success: true,
          message: 'Nothing to fix (no VibeCheck configuration file)',
          configExists: false,
          suggestion: 'Run `vibecheck init` to configure this project',
          results: { totalIssues: 0, fixableIssues: 0, appliedFixes: 0 },
        }, null, 2));
      } else {
        logger.warn('No VibeCheck configuration file found');
        logger.dim('Run `vibecheck init` to configure this project');
        logger.newline();
        logger.success('Nothing to fix');
      }
      return; // Exit 0 - dry-run completed without creating any files
    }
    
    try {
      config = await loadConfig(options.config);
    } catch (configError) {
      // Config loading failed - use defaults
      const { defaultConfig } = await import('../lib/config.js');
      config = defaultConfig;
      
      if (!options.dryRun) {
        // Non-dry-run: warn but continue with defaults
        logger.warn('No configuration found, using defaults');
        logger.dim('Run `vibecheck init` to create a configuration file');
      }
    }

    const projectRoot = process.cwd();

    // Verify we're in a valid project
    if (!existsSync(path.join(projectRoot, 'package.json'))) {
      logger.warn('No package.json found. Are you in a project directory?');
    }

    logger.info('Analyzing codebase for fixable issues...');

    // Initialize the orchestrator with error handling
    let orchestrator: AutoFixOrchestrator;
    try {
      orchestrator = new AutoFixOrchestrator({
        projectRoot,
        truthpackPath: config.truthpackPath,
        policy: config.autofix,
        dryRun: options.dryRun,
        verbose: options.verbose,
        maxIssuesPerRun: MAX_ISSUES_PER_RUN,
      });

      // Register fix modules
      orchestrator.registerModule(new SilentFailureFixModule());
      orchestrator.registerModule(new AuthGapFixModule());
      orchestrator.registerModule(new EnvVarFixModule());
      orchestrator.registerModule(new GhostRouteFixModule());
    } catch (initError) {
      const message = initError instanceof Error ? initError.message : String(initError);
      
      // For dry-run, initialization failure is not fatal
      if (options.dryRun) {
        if (options.json) {
          console.log(JSON.stringify({
            success: true,
            message: 'Could not initialize auto-fix engine',
            details: message,
            suggestion: 'Ensure truthpack exists by running `vibecheck scan`',
            results: { totalIssues: 0, fixableIssues: 0, appliedFixes: 0 },
          }, null, 2));
        } else {
          logger.warn('Could not initialize auto-fix engine');
          logger.dim(`  Reason: ${message}`);
          logger.dim('  Ensure truthpack exists by running `vibecheck scan`');
          logger.newline();
          logger.success('Nothing to fix (initialization incomplete)');
        }
        return; // Exit 0 - dry-run completed
      }
      
      errors.push(`Initialization failed: ${message}`);
      
      if (options.json) {
        console.log(JSON.stringify({
          success: false,
          error: 'Failed to initialize auto-fix engine',
          details: message,
        }, null, 2));
      } else {
        logger.error(`Failed to initialize: ${message}`);
      }
      process.exit(1);
    }

    // Collect issues from various sources
    let issues: Issue[];
    try {
      issues = await collectIssues(projectRoot, config, options);
    } catch (collectError) {
      const message = collectError instanceof Error ? collectError.message : String(collectError);
      
      // For dry-run, issue collection failure is not fatal
      // Common cause: no truthpack exists yet
      if (options.dryRun) {
        if (options.json) {
          console.log(JSON.stringify({
            success: true,
            message: 'Could not collect issues for analysis',
            details: message,
            suggestion: 'Run `vibecheck scan` first to generate a truthpack',
            results: { totalIssues: 0, fixableIssues: 0, appliedFixes: 0 },
          }, null, 2));
        } else {
          logger.warn('Could not collect issues for analysis');
          logger.dim(`  Reason: ${message}`);
          logger.dim('  Run `vibecheck scan` first to generate a truthpack');
          logger.newline();
          logger.success('Nothing to fix (no issues found or no truthpack available)');
        }
        return; // Exit 0 - dry-run completed
      }
      
      // Non-dry-run: this is still an error
      errors.push(`Issue collection failed: ${message}`);
      
      if (options.json) {
        console.log(JSON.stringify({
          success: false,
          error: 'Failed to collect issues',
          details: message,
        }, null, 2));
      } else {
        logger.error(`Failed to collect issues: ${message}`);
      }
      process.exit(1);
    }

    if (issues.length === 0) {
      if (options.json) {
        console.log(JSON.stringify({
          success: true,
          message: 'No issues found',
          results: { totalIssues: 0 },
        }, null, 2));
      } else {
        logger.success('No issues found that require auto-fixing.');
      }
      return;
    }

    // Warn if we're limiting issues
    if (issues.length > MAX_ISSUES_PER_RUN) {
      const warning = `Found ${issues.length} issues, processing first ${MAX_ISSUES_PER_RUN}`;
      errors.push(warning);
      logger.warn(warning);
      issues = issues.slice(0, MAX_ISSUES_PER_RUN);
    } else {
      logger.info(`Found ${issues.length} issue(s) to analyze`);
    }

    // Process issues with progress tracking
    let fixResult: FixResult;
    
    if (cliEnv.isInteractive && !options.json) {
      const tasks = new Listr([
        {
          title: 'Analyzing issues',
          task: async (ctx) => {
            fixResult = await orchestrator.processIssues(issues);
            ctx.result = fixResult;
          },
        },
      ], { concurrent: false });

      await tasks.run();
      fixResult = fixResult!;
    } else {
      fixResult = await orchestrator.processIssues(issues);
    }

    // Collect any errors from processing
    if (fixResult.errors && fixResult.errors.length > 0) {
      for (const err of fixResult.errors.slice(0, 10)) {
        errors.push(`${err.phase}: ${err.message}`);
      }
    }

    // Initialize review pipeline
    const pipeline = new ReviewPipeline(projectRoot, config.autofix);
    const processResult = await pipeline.process(fixResult);
    const { autoApplied, queued, rejected } = processResult;

    // Collect processing errors
    if ('errors' in processResult && Array.isArray(processResult.errors)) {
      errors.push(...processResult.errors);
    }

    // Handle interactive mode
    if (options.interactive && cliEnv.isInteractive && queued.length > 0) {
      await handleInteractiveReview(pipeline, logger);
    } else if (options.apply && queued.length > 0) {
      // Auto-approve and apply all suggested fixes
      const approveCount = pipeline.approveAll('cli-autofix');
      logger.info(`Auto-approving ${approveCount} fix(es)...`);
      
      const applyResults = await pipeline.applyApproved({ dryRun: options.dryRun });
      
      // Report failures
      const failures = applyResults.filter((r) => !r.success);
      for (const failure of failures.slice(0, 5)) {
        errors.push(`Failed to apply fix to ${failure.filePath}: ${failure.error}`);
      }
    }

    const commandResult: FixCommandResult = {
      totalIssues: fixResult.totalIssues,
      fixableIssues: fixResult.fixableIssues,
      appliedFixes: autoApplied.length + pipeline.getApplied().length,
      suggestedFixes: pipeline.getPending().length,
      rejectedFixes: rejected.length,
      duration: Date.now() - startTime,
      errors: errors.length > 0 ? errors : undefined,
    };

    // Output results
    if (options.json) {
      const summary = pipeline.getSummary();
      console.log(JSON.stringify({
        success: errors.length === 0 || commandResult.appliedFixes > 0,
        results: commandResult,
        summary,
        appliedFixes: autoApplied.slice(0, MAX_FILES_TO_DISPLAY).map(formatFixForJson),
        suggestedFixes: pipeline.getPending().slice(0, MAX_FILES_TO_DISPLAY).map((item) => formatFixForJson(item.fix)),
        rejectedFixes: rejected.slice(0, MAX_FILES_TO_DISPLAY).map(formatFixForJson),
        errors: errors.length > 0 ? errors : undefined,
      }, null, 2));
    } else {
      printResults(commandResult, pipeline, logger, options.dryRun);
      
      // Print errors
      if (errors.length > 0 && options.verbose) {
        logger.newline();
        logger.warn('Errors encountered:');
        for (const err of errors.slice(0, 10)) {
          logger.dim(`  ${symbols.cross} ${err}`);
        }
        if (errors.length > 10) {
          logger.dim(`  ... and ${errors.length - 10} more`);
        }
      }
    }

    // Exit with error if there are unfixed high-severity issues
    const hasUnfixedHighSeverity = fixResult.unfixableIssues.some(
      (i) => i.severity === 'high' || i.severity === 'critical'
    );
    if (hasUnfixedHighSeverity && !options.dryRun) {
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
 * Validate command options
 */
function validateOptions(options: FixOptions): void {
  // Validate confidence threshold if provided
  if (options.confidence !== undefined) {
    if (typeof options.confidence !== 'number' || options.confidence < 0 || options.confidence > 1) {
      throw new VibeCheckError(
        'VALIDATION_ERROR',
        'Confidence threshold must be a number between 0 and 1'
      );
    }
  }

  // Validate rollback transaction ID format
  if (options.rollback) {
    if (typeof options.rollback !== 'string' || options.rollback.length === 0) {
      throw new VibeCheckError(
        'VALIDATION_ERROR',
        'Rollback transaction ID is required'
      );
    }
    // Basic format validation - transaction IDs start with 'tx-'
    if (!options.rollback.startsWith('tx-')) {
      throw new VibeCheckError(
        'VALIDATION_ERROR',
        'Invalid transaction ID format'
      );
    }
  }

  // Validate files array if provided
  if (options.files && !Array.isArray(options.files)) {
    throw new VibeCheckError(
      'VALIDATION_ERROR',
      'Files must be an array'
    );
  }
}

/**
 * Collect issues from various sources
 */
async function collectIssues(
  projectRoot: string,
  config: { truthpackPath: string },
  options: FixOptions
): Promise<Issue[]> {
  const issues: Issue[] = [];

  // Collect from drift detection
  const driftDetector = new DriftDetector({
    projectRoot,
    truthpackPath: config.truthpackPath,
    ignorePatterns: [],
  });

  const driftReport = await driftDetector.detect();
  if (driftReport.hasDrift) {
    issues.push(...AutoFixOrchestrator.driftItemsToIssues(driftReport.items));
  }

  // Filter by files if specified
  if (options.files && options.files.length > 0) {
    return issues.filter((issue) => {
      if (!issue.filePath) return false;
      return options.files!.some((f) => issue.filePath!.includes(f));
    });
  }

  return issues;
}

/**
 * Handle interactive review of fixes
 */
async function handleInteractiveReview(
  pipeline: ReviewPipeline,
  logger: ReturnType<typeof createLogger>
): Promise<void> {
  const pending = pipeline.getPending();
  
  if (pending.length === 0) {
    return;
  }

  logger.newline();
  logger.info(`${pending.length} fix(es) require review:`);
  logger.newline();

  const patchGenerator = new PatchGenerator();

  for (const item of pending) {
    const fix = item.fix;
    
    console.log(chalk.bold(`\n${fix.description}`));
    console.log(chalk.dim(`File: ${fix.patch.filePath}`));
    console.log(chalk.dim(`Confidence: ${Math.round(fix.confidence.value * 100)}%`));
    console.log();
    console.log(chalk.yellow('Diff:'));
    console.log(patchGenerator.formatAsUnifiedDiff(fix.patch));
    console.log();

    const action = await p.select({
      message: 'What would you like to do?',
      options: [
        { value: 'approve', label: 'Approve and apply this fix' },
        { value: 'reject', label: 'Reject this fix' },
        { value: 'skip', label: 'Skip for now' },
      ],
    });

    if (p.isCancel(action)) {
      logger.warn('Review cancelled');
      break;
    }

    switch (action) {
      case 'approve':
        pipeline.approve(item.id, 'interactive-review');
        break;
      case 'reject':
        pipeline.reject(item.id, 'interactive-review');
        break;
      case 'skip':
        pipeline.skip(item.id);
        break;
    }
  }

  // Apply approved fixes
  const approved = pipeline.getApproved();
  if (approved.length > 0) {
    logger.newline();
    logger.info(`Applying ${approved.length} approved fix(es)...`);
    const results = await pipeline.applyApproved();
    
    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;
    
    if (succeeded > 0) {
      logger.success(`Applied ${succeeded} fix(es)`);
    }
    if (failed > 0) {
      logger.warn(`Failed to apply ${failed} fix(es)`);
    }
  }
}

/**
 * Handle rollback request using RollbackManager
 */
async function handleRollback(
  transactionId: string,
  logger: ReturnType<typeof createLogger>,
  options: FixOptions
): Promise<void> {
  logger.info(`Rolling back transaction: ${transactionId}`);
  
  const projectRoot = process.cwd();
  const rollbackManager = new RollbackManager(projectRoot);

  try {
    // Get transaction info first
    const transaction = await rollbackManager.getTransaction(transactionId);
    
    if (!transaction) {
      if (options.json) {
        console.log(JSON.stringify({
          success: false,
          error: 'Transaction not found',
          transactionId,
        }, null, 2));
      } else {
        logger.error(`Transaction not found: ${transactionId}`);
      }
      process.exit(1);
    }

    // Show transaction info
    if (!options.json && !options.quiet) {
      logger.info(`Transaction: ${transaction.summary}`);
      logger.dim(`  Status: ${transaction.status}`);
      logger.dim(`  Files: ${transaction.fixes.length}`);
      logger.dim(`  Date: ${transaction.timestamp.toISOString()}`);
      logger.newline();
    }

    // Check if already rolled back
    if (transaction.status === 'rolled_back') {
      if (options.json) {
        console.log(JSON.stringify({
          success: false,
          error: 'Transaction already rolled back',
          transactionId,
        }, null, 2));
      } else {
        logger.warn('Transaction already rolled back');
      }
      return;
    }

    // Confirm rollback in interactive mode
    if (cliEnv.isInteractive && !options.json && !options.quiet) {
      const confirm = await p.confirm({
        message: `Rollback ${transaction.fixes.length} file(s)?`,
      });

      if (p.isCancel(confirm) || !confirm) {
        logger.warn('Rollback cancelled');
        return;
      }
    }

    // Perform rollback
    const result = await rollbackManager.rollback(transactionId);

    if (options.json) {
      console.log(JSON.stringify({
        success: result.success,
        transactionId,
        fixesRolledBack: result.fixesRolledBack,
        fixesFailed: result.fixesFailed,
        errors: result.errors.length > 0 ? result.errors : undefined,
      }, null, 2));
    } else {
      if (result.success) {
        logger.success(`Rolled back ${result.fixesRolledBack} file(s) successfully`);
      } else {
        logger.warn(`Rollback partially completed: ${result.fixesRolledBack} succeeded, ${result.fixesFailed} failed`);
        
        if (result.errors.length > 0) {
          logger.newline();
          logger.error('Errors:');
          for (const err of result.errors.slice(0, 5)) {
            logger.dim(`  ${symbols.cross} ${err}`);
          }
        }
      }
    }

    if (!result.success) {
      process.exit(1);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    
    if (options.json) {
      console.log(JSON.stringify({
        success: false,
        error: 'Rollback failed',
        details: message,
      }, null, 2));
    } else {
      logger.error(`Rollback failed: ${message}`);
    }
    process.exit(1);
  }
}

/**
 * Format a fix for JSON output
 */
function formatFixForJson(fix: ProposedFix): Record<string, unknown> {
  return {
    id: fix.id,
    description: fix.description,
    file: fix.patch.filePath,
    issueType: fix.issue.type,
    severity: fix.issue.severity,
    confidence: fix.confidence.value,
    confidenceLevel: fix.confidence.level,
    strategy: fix.strategy,
    provenance: fix.provenance,
  };
}

/**
 * Print results to console
 */
function printResults(
  result: FixCommandResult,
  pipeline: ReviewPipeline,
  logger: ReturnType<typeof createLogger>,
  isDryRun?: boolean
): void {
  logger.newline();
  
  if (isDryRun) {
    logger.warn('DRY RUN - No changes were made');
    logger.newline();
  }

  logger.info('Auto-Fix Summary:');
  logger.dim(`  ${symbols.arrow} Total issues: ${result.totalIssues}`);
  logger.dim(`  ${symbols.arrow} Fixable: ${result.fixableIssues}`);
  
  if (result.appliedFixes > 0) {
    logger.success(`  ${symbols.check} Applied: ${result.appliedFixes}`);
  }
  
  if (result.suggestedFixes > 0) {
    logger.warn(`  ${symbols.warning} Pending review: ${result.suggestedFixes}`);
  }
  
  if (result.rejectedFixes > 0) {
    logger.dim(`  ${symbols.cross} Rejected: ${result.rejectedFixes}`);
  }

  // Show applied fixes
  const applied = pipeline.getApplied();
  if (applied.length > 0) {
    logger.newline();
    logger.success('Applied fixes:');
    for (const item of applied) {
      logger.dim(`  ${symbols.check} ${item.fix.description}`);
      logger.dim(`     ${chalk.underline(item.fix.patch.filePath)}`);
    }
  }

  // Show pending fixes
  const pending = pipeline.getPending();
  if (pending.length > 0) {
    logger.newline();
    logger.warn('Fixes pending review:');
    for (const item of pending) {
      logger.dim(`  ${symbols.warning} ${item.fix.description}`);
      logger.dim(`     Confidence: ${Math.round(item.fix.confidence.value * 100)}%`);
    }
    logger.newline();
    logger.info('Run with --interactive to review, or --apply to apply all');
  }

  logger.newline();
  logger.dim(`Duration: ${formatDuration(result.duration)}`);
}
