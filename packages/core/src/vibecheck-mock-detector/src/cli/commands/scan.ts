// src/cli/commands/scan.ts

import { Command } from 'commander';
import { scan } from '../../scanner/engines/mock-detector';
import { formatReport } from '../../scanner/engines/mock-detector/reporter';
import { loadBaseline, filterBaselineFindings } from '../../scanner/baseline';
import { loadConfig } from '../../config/loader';

export const scanCommand = new Command('scan:mocks')
  .description('Scan codebase for mock/fake data')
  .option('-d, --dir <path>', 'Directory to scan', process.cwd())
  .option('-f, --format <format>', 'Output format (text|json|sarif|markdown)', 'text')
  .option('-s, --severity <level>', 'Minimum severity to report', 'low')
  .option('--fail-on <level>', 'Exit with error if findings at severity', 'critical')
  .option('--baseline <path>', 'Baseline file to filter known issues')
  .option('--config <path>', 'Config file path')
  .option('--no-ast', 'Disable AST analysis')
  .option('--industries <list>', 'Comma-separated industries', 'general')
  .option('--staged', 'Only scan staged files')
  .action(async (options) => {
    const config = await loadConfig(options.dir);

    console.log('🔍 VibeCheck Mock Detector\n');

    const result = await scan({
      rootDir: options.dir,
      severityThreshold: options.severity,
      enableAstAnalysis: options.ast !== false,
      industries: options.industries?.split(',') || config.industries,
    });

    let filteredResult = result;

    // Apply baseline if specified
    if (options.baseline) {
      const baseline = await loadBaseline(options.baseline);
      if (baseline) {
        filteredResult = filterBaselineFindings(result, baseline);
        console.log(`📋 Baseline applied: ${result.findings.length - filteredResult.findings.length} known issues filtered\n`);
      }
    }

    const report = formatReport(filteredResult, options.format);
    console.log(report);

    // Exit code logic
    const severityOrder = ['critical', 'high', 'medium', 'low'];
    const failThreshold = severityOrder.indexOf(options.failOn);

    for (let i = 0; i <= failThreshold; i++) {
      const sev = severityOrder[i] as keyof typeof filteredResult.summary.bySeverity;
      if (filteredResult.summary.bySeverity[sev] > 0) {
        process.exit(1);
      }
    }

    process.exit(0);
  });
