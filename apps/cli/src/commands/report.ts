/**
 * Report command - Generate enterprise-grade HTML/PDF reports
 * 
 * Produces beautiful, detailed reports from VibeCheck scan results.
 * 
 * Tier Gating:
 * - Free: reality-check, ship-readiness (HTML only)
 * - Pro: executive-summary, detailed-technical, compliance, PDF output
 */

import { Listr } from 'listr2';
import chalk from 'chalk';
import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import {
  generateEnterpriseReport,
  generateRealityCheckReport,
  generateShipReadinessReport,
  generateExecutiveSummaryReport,
  generateDetailedTechnicalReport,
  transformToEnterpriseData,
  generatePdfReport,
  type EnterpriseReportConfig,
  type ReportType,
  type ScanResultInput,
} from '@vibecheck/core/formatters';
import { DriftDetector } from '@vibecheck/core/validation';
import { TruthpackGenerator } from '@vibecheck/core/truthpack';
import type { Finding, ScanSummary, ScanVerdict } from '@repo/shared-types';
import {
  createLogger,
  loadConfig,
  VibeCheckError,
} from '../lib/index.js';
import { formatDuration, symbols } from '../ui/theme.js';
import { renderCommandHeader } from '../ui/index.js';
import { env as cliEnv } from '../lib/environment.js';
import type { ReportOptions } from '../types.js';
import { getCurrentTier, EXIT_CODES } from '../lib/entitlements.js';
import { printUpgradePrompt } from '../ui/upgrade-prompt.js';

/** Default output filename */
const DEFAULT_HTML_FILENAME = 'vibecheck-report.html';
const DEFAULT_PDF_FILENAME = 'vibecheck-report.pdf';

/** Report generation timeout (60 seconds) */
const REPORT_TIMEOUT_MS = 60000;

interface ReportResult {
  outputPath: string;
  format: 'html' | 'pdf';
  reportType: ReportType;
  duration: number;
  score: number;
  findingsCount: number;
  fileSize?: number;
}

/** Pro-only report types */
const PRO_REPORT_TYPES: ReportType[] = ['executive-summary', 'detailed-technical', 'compliance'];

/** Free report types */
const FREE_REPORT_TYPES: ReportType[] = ['reality-check', 'ship-readiness'];

/**
 * Check if report options require Pro tier
 * Returns the feature key if gated, null if allowed
 */
function checkReportTierGate(options: ReportOptions): 'enterprise_reports' | null {
  const currentTier = getCurrentTier();
  
  // Pro tier has access to everything
  if (currentTier === 'pro' || currentTier === 'enterprise') {
    return null;
  }
  
  // Check if report type is Pro-only
  if (options.type && PRO_REPORT_TYPES.includes(options.type as ReportType)) {
    return 'enterprise_reports';
  }
  
  // Check if PDF format is requested (Pro-only)
  if (options.format === 'pdf') {
    return 'enterprise_reports';
  }
  
  return null;
}

/**
 * Validate report options
 */
function validateOptions(options: ReportOptions): void {
  const validTypes: ReportType[] = ['reality-check', 'ship-readiness', 'executive-summary', 'detailed-technical', 'compliance'];
  
  if (options.type && !validTypes.includes(options.type as ReportType)) {
    throw new VibeCheckError(
      `Invalid report type: ${options.type}. Valid types are: ${validTypes.join(', ')}`,
      'INVALID_INPUT'
    );
  }

  if (options.format && !['html', 'pdf'].includes(options.format)) {
    throw new VibeCheckError(
      `Invalid format: ${options.format}. Valid formats are: html, pdf`,
      'INVALID_INPUT'
    );
  }
}

/**
 * Generate report command
 */
export async function reportCommand(options: ReportOptions): Promise<void> {
  const logger = createLogger({
    level: options.verbose ? 'verbose' : options.quiet ? 'quiet' : 'normal',
    json: options.json,
  });

  const startTime = Date.now();

  try {
    // Validate options
    validateOptions(options);

    // Check tier gating for Pro features
    const gatedFeature = checkReportTierGate(options);
    if (gatedFeature) {
      const attemptedCommand = buildCommandString(options);
      printUpgradePrompt({
        featureKey: gatedFeature,
        attemptedCommand,
        currentTier: getCurrentTier(),
        showRerunHint: true,
      });
      process.exit(EXIT_CODES.TIER_GATE);
    }

    const projectRoot = process.cwd();
    const reportType: ReportType = (options.type as ReportType) ?? 'ship-readiness';
    const format = options.format ?? 'html';
    const theme = options.theme ?? 'dark';

    // Show header in interactive mode
    if (cliEnv.isInteractive && !options.json && !options.quiet) {
      renderCommandHeader({
        command: 'report',
        target: projectRoot,
        elapsedTime: 0,
        vitals: [
          { label: 'REPORT TYPE', status: 'stable', value: reportType, percentage: 0 },
          { label: 'FORMAT', status: 'stable', value: format.toUpperCase(), percentage: 0 },
        ],
        diagnostics: [
          { level: 'info', message: 'Generating report...' },
        ],
      });
    }

    // Load configuration
    let config: { truthpackPath: string };
    try {
      config = await loadConfig(options.config);
    } catch {
      throw new VibeCheckError(
        'Failed to load configuration. Run "vibecheck init" first.',
        'CONFIG_NOT_FOUND'
      );
    }

    logger.info(`Generating ${reportType} report...`);

    let scanInput: ScanResultInput;
    let result: ReportResult;

    if (cliEnv.isInteractive && !options.json) {
      // Interactive mode with progress
      const tasks = new Listr([
        {
          title: 'Collecting scan data',
          task: async (ctx) => {
            ctx.scanInput = await collectScanData(projectRoot, config);
          },
        },
        {
          title: 'Transforming data for report',
          task: async (ctx) => {
            ctx.reportData = transformToEnterpriseData(ctx.scanInput, {
              reportType,
            });
          },
        },
        {
          title: `Generating ${format.toUpperCase()} report`,
          task: async (ctx, task) => {
            const reportConfig: Partial<EnterpriseReportConfig> = {
              type: reportType,
              theme: theme as 'dark' | 'light',
              branding: options.branding ? {
                companyName: options.branding,
                showPoweredBy: true,
              } : undefined,
            };

            // Determine output path
            const defaultFilename = format === 'pdf' ? DEFAULT_PDF_FILENAME : DEFAULT_HTML_FILENAME;
            const outputPath = options.output 
              ? path.resolve(options.output)
              : path.join(projectRoot, '.vibecheck', 'reports', defaultFilename);

            // Ensure output directory exists
            await fs.mkdir(path.dirname(outputPath), { recursive: true });

            if (format === 'pdf') {
              task.title = 'Generating PDF report (this may take a moment)...';
              
              try {
                const pdfResult = await generatePdfReport(ctx.reportData, reportConfig, {
                  outputPath,
                });
                ctx.outputPath = pdfResult.path ?? outputPath;
              } catch (pdfError) {
                // Fall back to HTML if PDF generation fails
                const errorMsg = pdfError instanceof Error ? pdfError.message : String(pdfError);
                if (errorMsg.includes('puppeteer')) {
                  task.title = 'PDF generation requires puppeteer. Falling back to HTML...';
                  const html = generateEnterpriseReport(ctx.reportData, reportConfig);
                  const htmlPath = outputPath.replace('.pdf', '.html');
                  await fs.writeFile(htmlPath, html, 'utf-8');
                  ctx.outputPath = htmlPath;
                  ctx.format = 'html';
                } else {
                  throw pdfError;
                }
              }
            } else {
              // Generate HTML
              let html: string;
              switch (reportType) {
                case 'reality-check':
                  html = generateRealityCheckReport(ctx.reportData, reportConfig);
                  break;
                case 'ship-readiness':
                  html = generateShipReadinessReport(ctx.reportData, reportConfig);
                  break;
                case 'executive-summary':
                  html = generateExecutiveSummaryReport(ctx.reportData, reportConfig);
                  break;
                case 'detailed-technical':
                  html = generateDetailedTechnicalReport(ctx.reportData, reportConfig);
                  break;
                default:
                  html = generateEnterpriseReport(ctx.reportData, reportConfig);
              }

              await fs.writeFile(outputPath, html, 'utf-8');
              ctx.outputPath = outputPath;
            }

            ctx.format = ctx.format ?? format;
            task.title = `Generated ${ctx.format.toUpperCase()} report`;
          },
        },
      ], { concurrent: false });

      const ctx = await tasks.run();
      
      // Get file size
      let fileSize: number | undefined;
      try {
        const stats = await fs.stat(ctx.outputPath);
        fileSize = stats.size;
      } catch {
        // Ignore size errors
      }

      result = {
        outputPath: ctx.outputPath,
        format: ctx.format,
        reportType,
        duration: Date.now() - startTime,
        score: ctx.reportData.scores.overall,
        findingsCount: ctx.reportData.findings.length,
        fileSize,
      };
    } else {
      // Non-interactive mode
      logger.step('Collecting scan data...');
      scanInput = await collectScanData(projectRoot, config);

      logger.step('Transforming data...');
      const reportData = transformToEnterpriseData(scanInput, {
        reportType,
      });

      logger.step(`Generating ${format.toUpperCase()} report...`);

      const reportConfig: Partial<EnterpriseReportConfig> = {
        type: reportType,
        theme: theme as 'dark' | 'light',
        branding: options.branding ? {
          companyName: options.branding,
          showPoweredBy: true,
        } : undefined,
      };

      // Determine output path
      const defaultFilename = format === 'pdf' ? DEFAULT_PDF_FILENAME : DEFAULT_HTML_FILENAME;
      const outputPath = options.output 
        ? path.resolve(options.output)
        : path.join(projectRoot, '.vibecheck', 'reports', defaultFilename);

      // Ensure output directory exists
      await fs.mkdir(path.dirname(outputPath), { recursive: true });

      let finalFormat = format;
      let finalPath = outputPath;

      if (format === 'pdf') {
        try {
          const pdfResult = await generatePdfReport(reportData, reportConfig, {
            outputPath,
          });
          finalPath = pdfResult.path ?? outputPath;
        } catch (pdfError) {
          const errorMsg = pdfError instanceof Error ? pdfError.message : String(pdfError);
          if (errorMsg.includes('puppeteer')) {
            logger.warn('PDF generation requires puppeteer. Falling back to HTML...');
            const html = generateEnterpriseReport(reportData, reportConfig);
            finalPath = outputPath.replace('.pdf', '.html');
            await fs.writeFile(finalPath, html, 'utf-8');
            finalFormat = 'html';
          } else {
            throw pdfError;
          }
        }
      } else {
        const html = generateEnterpriseReport(reportData, reportConfig);
        await fs.writeFile(outputPath, html, 'utf-8');
      }

      // Get file size
      let fileSize: number | undefined;
      try {
        const stats = await fs.stat(finalPath);
        fileSize = stats.size;
      } catch {
        // Ignore size errors
      }

      result = {
        outputPath: finalPath,
        format: finalFormat as 'html' | 'pdf',
        reportType,
        duration: Date.now() - startTime,
        score: reportData.scores.overall,
        findingsCount: reportData.findings.length,
        fileSize,
      };
    }

    // Output results
    if (options.json) {
      console.log(JSON.stringify({
        success: true,
        report: {
          path: result.outputPath,
          format: result.format,
          type: result.reportType,
          score: result.score,
          findings: result.findingsCount,
          size: result.fileSize,
        },
        duration: result.duration,
      }, null, 2));
    } else {
      logger.newline();
      logger.success(`Report generated successfully!`);
      logger.dim(`  ${symbols.arrow} Type: ${chalk.cyan(result.reportType)}`);
      logger.dim(`  ${symbols.arrow} Format: ${chalk.cyan(result.format.toUpperCase())}`);
      logger.dim(`  ${symbols.arrow} Score: ${getScoreColor(result.score)}${result.score}/100${chalk.reset('')}`);
      logger.dim(`  ${symbols.arrow} Findings: ${result.findingsCount}`);
      if (result.fileSize) {
        logger.dim(`  ${symbols.arrow} Size: ${formatBytes(result.fileSize)}`);
      }
      logger.newline();
      logger.info(`Output: ${chalk.underline(result.outputPath)}`);
      logger.dim(`Duration: ${formatDuration(result.duration)}`);
      
      // Hint to open the report
      if (result.format === 'html') {
        logger.newline();
        logger.dim(`Open the report in your browser to view it.`);
      }

      // Show in updated header
      if (cliEnv.isInteractive && !options.quiet) {
        renderCommandHeader({
          command: 'report',
          target: projectRoot,
          elapsedTime: result.duration,
          vitals: [
            {
              label: 'REPORT SCORE',
              status: result.score >= 80 ? 'optimal' : result.score >= 60 ? 'stable' : result.score >= 40 ? 'warning' : 'critical',
              value: `${result.score}/100`,
              percentage: result.score,
            },
            {
              label: 'FINDINGS',
              status: result.findingsCount === 0 ? 'optimal' : result.findingsCount < 10 ? 'stable' : 'warning',
              value: `${result.findingsCount} issues`,
              percentage: Math.max(0, 100 - result.findingsCount * 5),
            },
          ],
          diagnostics: [
            { level: 'pass', message: `Report saved to ${path.basename(result.outputPath)}` },
          ],
        });
      }
    }

    // Open report in browser if requested
    if (options.open && result.format === 'html') {
      try {
        const { exec } = await import('node:child_process');
        const openCommand = process.platform === 'win32' ? 'start' : process.platform === 'darwin' ? 'open' : 'xdg-open';
        exec(`${openCommand} "${result.outputPath}"`);
        logger.info('Opening report in browser...');
      } catch {
        logger.warn('Could not open report automatically. Please open it manually.');
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

/**
 * Collect scan data from the project
 */
async function collectScanData(
  projectRoot: string,
  config: { truthpackPath: string }
): Promise<ScanResultInput> {
  const findings: Finding[] = [];
  let filesScanned = 0;

  // Try to get drift data
  try {
    const detector = new DriftDetector({
      projectRoot,
      truthpackPath: config.truthpackPath,
      ignorePatterns: [],
    });

    const report = await detector.detect();
    
    // Convert drift items to findings
    for (const item of report.items) {
      findings.push({
        id: `drift-${findings.length}`,
        scanId: 'cli-scan',
        projectId: 'cli-project',
        type: `ghost_${item.category}`,
        severity: item.severity === 'high' ? 'error' : item.severity === 'medium' ? 'warning' : 'info',
        message: item.details,
        file: item.file ?? null,
        line: item.line ?? null,
        column: null,
        evidence: null,
        suggestion: null,
        autoFixable: false,
        resolved: false,
        resolvedAt: null,
        resolvedBy: null,
        createdAt: new Date(),
      });
    }

    filesScanned = report.summary?.filesChecked ?? 0;
  } catch {
    // No drift data available
  }

  // Try to get truthpack info
  let projectName = path.basename(projectRoot);
  let branch: string | undefined;
  
  try {
    const generator = new TruthpackGenerator({
      projectRoot,
      outputDir: config.truthpackPath,
      scanners: { routes: true, env: true, auth: true, contracts: true, uiGraph: false },
      watchMode: false,
    });
    
    const truthpack = await generator.generate();
    
    // Add ghost routes/env/auth as findings if they exist in code but not truthpack
    // This is a simplified version - real implementation would do deeper analysis
  } catch {
    // No truthpack available
  }

  // Try to get git info
  try {
    const { execSync } = await import('node:child_process');
    branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: projectRoot, encoding: 'utf-8' }).trim();
  } catch {
    // Not a git repo
  }

  // Calculate summary
  const errorCount = findings.filter(f => f.severity === 'error').length;
  const warningCount = findings.filter(f => f.severity === 'warning').length;
  const infoCount = findings.filter(f => f.severity === 'info').length;

  const verdict: ScanVerdict = errorCount > 0 ? 'BLOCK' : warningCount > 5 ? 'WARN' : 'SHIP';

  const summary: ScanSummary = {
    totalFindings: findings.length,
    bySeverity: {
      error: errorCount,
      warning: warningCount,
      info: infoCount,
    },
    byType: findings.reduce((acc, f) => {
      acc[f.type] = (acc[f.type] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>),
    verdict,
    filesScanned,
  };

  return {
    projectName,
    projectPath: projectRoot,
    branch,
    scannedAt: new Date().toISOString(),
    summary,
    findings,
    filesScanned,
    duration: 0,
  };
}

/**
 * Get colored score text
 */
function getScoreColor(score: number): string {
  if (score >= 80) return chalk.green.bold('');
  if (score >= 60) return chalk.yellow.bold('');
  if (score >= 40) return chalk.hex('#f97316').bold('');
  return chalk.red.bold('');
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Build command string from options for display in upgrade prompt
 */
function buildCommandString(options: ReportOptions): string {
  const parts = ['vibecheck report'];
  
  if (options.type) {
    parts.push(`--type ${options.type}`);
  }
  if (options.format) {
    parts.push(`--format ${options.format}`);
  }
  if (options.output) {
    parts.push(`--output ${options.output}`);
  }
  if (options.theme) {
    parts.push(`--theme ${options.theme}`);
  }
  if (options.branding) {
    parts.push(`--branding "${options.branding}"`);
  }
  
  return parts.join(' ');
}
