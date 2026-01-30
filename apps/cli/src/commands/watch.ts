/**
 * Watch command - Continuous validation mode
 */

import path from 'node:path';
import fs from 'node:fs/promises';
import chalk from 'chalk';
import { createLogger, loadConfig, VibeCheckError } from '../lib/index.js';
import { printBanner, symbols, colors, formatDuration } from '../ui/theme.js';
import { renderCommandHeader } from '../ui/index.js';
import { env as cliEnv } from '../lib/environment.js';
import {
  CodeValidator,
  HallucinationDetector,
} from '@vibecheck/core/validation';
import type { WatchOptions } from '../types.js';

// Simple file watcher using fs.watch
interface FileChange {
  path: string;
  type: 'change' | 'rename';
  timestamp: number;
}

export async function watchCommand(options: WatchOptions): Promise<void> {
  const logger = createLogger({
    level: options.verbose ? 'verbose' : options.quiet ? 'quiet' : 'normal',
    json: options.json,
  });

  const startTime = Date.now();

  try {
    // Show beautiful command header in interactive mode
    if (cliEnv.isInteractive && !options.json && !options.quiet) {
      renderCommandHeader({
        command: 'watch',
        target: process.cwd(),
        elapsedTime: 0,
        vitals: [
          {
            label: 'WATCH MODE',
            status: 'stable',
            value: 'Active',
            percentage: 100,
          },
        ],
        diagnostics: [
          {
            level: 'info',
            message: 'Watching for changes... Press Ctrl+C to stop',
          },
        ],
      });
    }

    // Load configuration
    const config = await loadConfig(options.config);
    const debounce = options.debounce ?? config.watch.debounce;

    // Check if truthpack exists
    const truthpackPath = path.resolve(config.truthpackPath);
    try {
      await fs.access(truthpackPath);
    } catch {
      throw VibeCheckError.fromCode('TRUTHPACK_NOT_FOUND');
    }

    logger.info('Starting watch mode...');
    logger.dim(`  ${symbols.bullet} Watching: ${config.watch.include.join(', ')}`);
    logger.dim(`  ${symbols.bullet} Ignoring: ${config.watch.exclude.join(', ')}`);
    logger.dim(`  ${symbols.bullet} Debounce: ${debounce}ms`);
    logger.newline();

    if (options.json) {
      console.log(JSON.stringify({
        status: 'watching',
        config: {
          include: config.watch.include,
          exclude: config.watch.exclude,
          debounce,
        },
      }));
    } else {
      console.log(chalk.cyan(`${symbols.info} Watching for changes... Press Ctrl+C to stop`));
      logger.newline();
    }

    // Set up validators
    const codeValidator = new CodeValidator({
      strictMode: config.strict,
      checkTypes: true,
      checkStyle: true,
      checkSecurity: true,
      projectRoot: process.cwd(),
    });
    
    const hallucinationDetector = new HallucinationDetector({
      strictness: config.strict ? 'high' : 'medium',
      truthpackPath: config.truthpackPath,
      projectRoot: process.cwd(),
    });

    // Track pending changes for debouncing
    const pendingChanges: Map<string, FileChange> = new Map();
    let debounceTimer: NodeJS.Timeout | null = null;

    // Process accumulated changes
    const processChanges = async () => {
      const changes = Array.from(pendingChanges.values());
      pendingChanges.clear();

      if (changes.length === 0) return;

      const startTime = Date.now();
      const timestamp = new Date().toLocaleTimeString();

      if (options.json) {
        console.log(JSON.stringify({
          event: 'validation_start',
          timestamp,
          files: changes.map(c => c.path),
        }));
      } else {
        console.log(chalk.dim(`[${timestamp}]`) + ` Validating ${changes.length} changed file(s)...`);
      }

      let hasErrors = false;

      for (const change of changes) {
        try {
          // Read file content
          const content = await fs.readFile(change.path, 'utf-8');
          
          // Run code validation
          const validationResult = await codeValidator.validate(content, change.path);
          
          if (!validationResult.valid) {
            hasErrors = true;
            if (options.json) {
              console.log(JSON.stringify({
                event: 'validation_error',
                file: change.path,
                errors: validationResult.errors,
              }));
            } else {
              console.log(`  ${colors.error(symbols.error)} ${path.relative(process.cwd(), change.path)}`);
              for (const error of validationResult.errors ?? []) {
                console.log(chalk.dim(`    ${symbols.arrow} ${error.message}`));
              }
            }
          } else {
            if (options.json) {
              console.log(JSON.stringify({
                event: 'validation_pass',
                file: change.path,
              }));
            } else if (options.verbose) {
              console.log(`  ${colors.success(symbols.success)} ${path.relative(process.cwd(), change.path)}`);
            }
          }

          // Run hallucination detection
          const hallucinationResult = await hallucinationDetector.detect(content, change.path);
          
          if (hallucinationResult.candidates.length > 0) {
            hasErrors = true;
            if (options.json) {
              console.log(JSON.stringify({
                event: 'hallucination_detected',
                file: change.path,
                candidates: hallucinationResult.candidates,
              }));
            } else {
              for (const candidate of hallucinationResult.candidates) {
                console.log(`  ${colors.warning(symbols.warning)} ${candidate.reason}`);
              }
            }
          }
        } catch (err) {
          if (options.json) {
            console.log(JSON.stringify({
              event: 'error',
              file: change.path,
              error: err instanceof Error ? err.message : String(err),
            }));
          } else {
            logger.error(`Failed to validate ${change.path}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      }

      const duration = Date.now() - startTime;

      if (options.json) {
        console.log(JSON.stringify({
          event: 'validation_complete',
          duration,
          hasErrors,
        }));
      } else {
        if (hasErrors) {
          console.log(chalk.dim(`  Completed with errors in ${formatDuration(duration)}`));
        } else {
          console.log(chalk.dim(`  ${colors.success('All checks passed')} in ${formatDuration(duration)}`));
        }
        logger.newline();
      }
    };

    // Simple file watcher for src directory
    const watchDir = path.resolve(process.cwd(), 'src');
    
    try {
      await fs.access(watchDir);
    } catch {
      logger.warn('No src directory found, watching current directory');
    }

    const targetDir = await fs.access(watchDir).then(() => watchDir).catch(() => process.cwd());

    // Recursive watch
    const watcher = fs.watch(targetDir, { recursive: true });

    for await (const event of watcher) {
      const filePath = path.join(targetDir, event.filename ?? '');
      
      // Skip excluded patterns
      const isExcluded = config.watch.exclude.some(pattern => {
        if (pattern.includes('*')) {
          // Simple glob matching for common patterns
          const regex = new RegExp(pattern.replace(/\*/g, '.*'));
          return regex.test(filePath);
        }
        return filePath.includes(pattern);
      });

      if (isExcluded) continue;

      // Check if it matches include patterns
      const isIncluded = config.watch.include.some(pattern => {
        if (pattern.includes('*')) {
          const regex = new RegExp(pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*'));
          return regex.test(filePath);
        }
        return filePath.endsWith(pattern);
      });

      if (!isIncluded) continue;

      // Add to pending changes
      pendingChanges.set(filePath, {
        path: filePath,
        type: event.eventType as 'change' | 'rename',
        timestamp: Date.now(),
      });

      // Debounce processing
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(processChanges, debounce);
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
