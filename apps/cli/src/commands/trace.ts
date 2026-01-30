/**
 * Trace command - Run data flow analysis
 * 
 * Traces data flow from sources (user input, API responses, etc.)
 * to sinks (database writes, API calls, etc.) and identifies
 * missing validations and potential security issues.
 */

import path from 'node:path';
import fs from 'node:fs/promises';
import chalk from 'chalk';
import {
  traceFile,
  traceDirectory,
  visualizeReport,
  generateMermaidDiagram,
  generateSummaryLine,
  type FlowReport,
} from '@vibecheck/core';
import { createLogger, loadConfig, VibeCheckError } from '../lib/index.js';
import { renderCommandHeader } from '../ui/index.js';
import { env as cliEnv } from '../lib/environment.js';

// ============================================================================
// Types
// ============================================================================

export interface TraceOptions {
  /** Target file or directory */
  target?: string;
  /** Output format */
  format?: 'text' | 'json' | 'mermaid';
  /** Output file path */
  output?: string;
  /** Maximum path depth */
  maxDepth?: number;
  /** Show all paths (not just issues) */
  showAll?: boolean;
  /** Verbose output */
  verbose?: boolean;
  /** Quiet output */
  quiet?: boolean;
  /** JSON output */
  json?: boolean;
  /** Config file path */
  config?: string;
}

// ============================================================================
// Command Implementation
// ============================================================================

export async function traceCommand(options: TraceOptions): Promise<void> {
  const logger = createLogger({
    level: options.verbose ? 'verbose' : options.quiet ? 'quiet' : 'normal',
    json: options.json,
  });

  const startTime = Date.now();

  try {
    // Determine target
    const target = options.target ?? process.cwd();
    const resolvedTarget = path.resolve(target);

    // Check if target exists
    try {
      await fs.access(resolvedTarget);
    } catch {
      throw new VibeCheckError(`Target not found: ${resolvedTarget}`, 'TARGET_NOT_FOUND');
    }

    // Determine if target is file or directory
    const stats = await fs.stat(resolvedTarget);
    const isFile = stats.isFile();

    // Show command header in interactive mode
    if (cliEnv.isInteractive && !options.json && !options.quiet) {
      renderCommandHeader({
        command: 'trace',
        version: '1.0.0',
        target: resolvedTarget,
        elapsedTime: 0,
      });
    }

    logger.info(`Tracing data flow in ${isFile ? 'file' : 'directory'}: ${resolvedTarget}`);

    // Run analysis
    const result = isFile
      ? await traceFile(resolvedTarget)
      : await traceDirectory(resolvedTarget);

    if (!result.success) {
      throw new VibeCheckError(result.error ?? 'Flow tracing failed', 'TRACE_FAILED');
    }

    const { report } = result;
    const duration = Date.now() - startTime;

    // Output based on format
    if (options.json || options.format === 'json') {
      console.log(JSON.stringify(report, null, 2));
    } else if (options.format === 'mermaid') {
      const diagram = generateMermaidDiagram(report.graph);
      if (options.output) {
        await fs.writeFile(options.output, diagram, 'utf-8');
        logger.success(`Mermaid diagram written to ${options.output}`);
      } else {
        console.log(diagram);
      }
    } else {
      // Text output
      if (options.quiet) {
        console.log(generateSummaryLine(report));
      } else {
        console.log(visualizeReport(report, true));
        
        // Show updated header with results
        if (cliEnv.isInteractive && !options.quiet) {
          const hasIssues = report.summary.issuesFound > 0;
          
          renderCommandHeader({
            command: 'trace',
            version: '1.0.0',
            target: resolvedTarget,
            elapsedTime: duration,
            vitals: [
              {
                label: 'FLOW HEALTH',
                status: hasIssues ? (report.summary.issuesBySeverity.critical > 0 ? 'critical' : 'warning') : 'optimal',
                value: `${report.summary.issuesFound} issues`,
                percentage: Math.max(0, 100 - report.summary.issuesFound * 10),
              },
              {
                label: 'DATA SOURCES',
                status: 'optimal',
                value: `${report.summary.sourcesFound} found`,
                percentage: 100,
              },
              {
                label: 'DATA SINKS',
                status: report.summary.sinksFound > 0 ? 'optimal' : 'warning',
                value: `${report.summary.sinksFound} found`,
                percentage: 100,
              },
              {
                label: 'VALIDATED PATHS',
                status: report.summary.unvalidatedPaths > 0 ? 'warning' : 'optimal',
                value: `${report.summary.pathsTraced - report.summary.unvalidatedPaths}/${report.summary.pathsTraced}`,
                percentage: report.summary.pathsTraced > 0 
                  ? Math.round(((report.summary.pathsTraced - report.summary.unvalidatedPaths) / report.summary.pathsTraced) * 100)
                  : 100,
              },
            ],
            diagnostics: report.issues.slice(0, 5).map(issue => ({
              level: issue.severity === 'critical' ? 'fail' : 
                     issue.severity === 'error' ? 'fail' :
                     issue.severity === 'warning' ? 'warn' : 'info',
              message: issue.title,
              details: issue.description,
            })),
          });
        }
      }
    }

    // Write output file if specified
    if (options.output && options.format !== 'mermaid') {
      const outputData = options.format === 'json' 
        ? JSON.stringify(report, null, 2)
        : visualizeReport(report, false);
      await fs.writeFile(options.output, outputData, 'utf-8');
      logger.success(`Report written to ${options.output}`);
    }

    // Summary
    if (!options.quiet && !options.json) {
      logger.newline();
      logger.info(`Flow tracing completed in ${duration}ms`);
      logger.info(`  ${report.summary.filesAnalyzed} files analyzed`);
      logger.info(`  ${report.summary.pathsTraced} flow paths traced`);
      
      if (report.summary.issuesFound > 0) {
        logger.error(`  ${report.summary.issuesFound} issues found`);
        process.exit(1);
      } else {
        logger.success(`  No flow issues found`);
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
