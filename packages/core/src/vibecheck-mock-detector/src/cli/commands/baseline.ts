// src/cli/commands/baseline.ts

import { Command } from 'commander';
import { execSync } from 'child_process';
import { scan } from '../../scanner/engines/mock-detector';
import {
  createBaseline,
  loadBaseline,
  updateBaseline,
  pruneBaseline,
  filterBaselineFindings,
} from '../../scanner/baseline';

export const baselineCommand = new Command('baseline')
  .description('Manage baseline of known issues')
  .addCommand(
    new Command('create')
      .description('Create baseline from current scan')
      .option('-d, --dir <path>', 'Directory to scan', process.cwd())
      .option('-o, --output <path>', 'Baseline output path', '.vibecheck-baseline.json')
      .option('-r, --reason <text>', 'Reason for baselining', 'Initial baseline')
      .option('--project <name>', 'Project name')
      .action(async (options) => {
        console.log('🔍 Scanning codebase...');

        const result = await scan({
          rootDir: options.dir,
          enableAstAnalysis: true,
        });

        console.log(`Found ${result.summary.total} findings`);
        console.log('Creating baseline...');

        let commit: string | undefined;
        try {
          commit = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
        } catch {}

        const baseline = await createBaseline(result, {
          outputPath: options.output,
          project: options.project,
          reason: options.reason,
          commit,
        });

        console.log(`\n✅ Baseline created: ${options.output}`);
        console.log(`   Entries: ${baseline.entries.length}`);
        console.log(`   🔴 Critical: ${baseline.metadata.bySeverity.critical}`);
        console.log(`   🟠 High: ${baseline.metadata.bySeverity.high}`);
        console.log(`   🟡 Medium: ${baseline.metadata.bySeverity.medium}`);
        console.log(`   🟢 Low: ${baseline.metadata.bySeverity.low}`);
      })
  )
  .addCommand(
    new Command('update')
      .description('Add current findings to baseline')
      .option('-d, --dir <path>', 'Directory to scan', process.cwd())
      .option('-b, --baseline <path>', 'Baseline file path', '.vibecheck-baseline.json')
      .option('-r, --reason <text>', 'Reason for adding to baseline')
      .option('--severity <level>', 'Only baseline findings at or below severity')
      .action(async (options) => {
        console.log('🔍 Scanning codebase...');

        const result = await scan({
          rootDir: options.dir,
          enableAstAnalysis: true,
        });

        let findingsToAdd = result.findings;

        if (options.severity) {
          const severityOrder = ['critical', 'high', 'medium', 'low'];
          const maxIndex = severityOrder.indexOf(options.severity);
          findingsToAdd = findingsToAdd.filter(f =>
            severityOrder.indexOf(f.severity) >= maxIndex
          );
        }

        await updateBaseline(options.baseline, findingsToAdd, {
          reason: options.reason,
        });
      })
  )
  .addCommand(
    new Command('prune')
      .description('Remove fixed issues from baseline')
      .option('-d, --dir <path>', 'Directory to scan', process.cwd())
      .option('-b, --baseline <path>', 'Baseline file path', '.vibecheck-baseline.json')
      .action(async (options) => {
        console.log('🔍 Scanning codebase...');

        const result = await scan({
          rootDir: options.dir,
          enableAstAnalysis: true,
        });

        console.log('Pruning baseline...');

        const { removed, remaining } = await pruneBaseline(
          options.baseline,
          result.findings
        );

        console.log(`\n✅ Baseline pruned`);
        console.log(`   Removed: ${removed} (fixed issues)`);
        console.log(`   Remaining: ${remaining}`);
      })
  )
  .addCommand(
    new Command('show')
      .description('Show baseline contents')
      .option('-b, --baseline <path>', 'Baseline file path', '.vibecheck-baseline.json')
      .option('--severity <level>', 'Filter by severity')
      .option('--json', 'Output as JSON')
      .action(async (options) => {
        const baseline = await loadBaseline(options.baseline);

        if (!baseline) {
          console.error('❌ Baseline not found');
          process.exit(1);
        }

        if (options.json) {
          console.log(JSON.stringify(baseline, null, 2));
          return;
        }

        console.log('\n📋 VIBECHECK BASELINE');
        console.log('═'.repeat(60));
        console.log(`Created: ${baseline.createdAt}`);
        console.log(`Updated: ${baseline.updatedAt}`);
        console.log(`Entries: ${baseline.entries.length}`);
        console.log('');
        console.log('By Severity:');
        console.log(`  🔴 Critical: ${baseline.metadata.bySeverity.critical}`);
        console.log(`  🟠 High: ${baseline.metadata.bySeverity.high}`);
        console.log(`  🟡 Medium: ${baseline.metadata.bySeverity.medium}`);
        console.log(`  🟢 Low: ${baseline.metadata.bySeverity.low}`);
        console.log('═'.repeat(60));

        let entries = baseline.entries;
        if (options.severity) {
          entries = entries.filter(e => e.severity === options.severity);
        }

        for (const entry of entries.slice(0, 20)) {
          const icon = {
            critical: '🔴',
            high: '🟠',
            medium: '🟡',
            low: '🟢',
          }[entry.severity] || '⚪';

          console.log(`\n${icon} ${entry.ruleId}`);
          console.log(`   File: ${entry.file}:${entry.line}`);
          console.log(`   Code: ${entry.code.slice(0, 60)}...`);
          if (entry.reason) {
            console.log(`   Reason: ${entry.reason}`);
          }
        }

        if (entries.length > 20) {
          console.log(`\n... and ${entries.length - 20} more entries`);
        }
      })
  )
  .addCommand(
    new Command('diff')
      .description('Show new issues not in baseline')
      .option('-d, --dir <path>', 'Directory to scan', process.cwd())
      .option('-b, --baseline <path>', 'Baseline file path', '.vibecheck-baseline.json')
      .action(async (options) => {
        console.log('🔍 Scanning codebase...');

        const result = await scan({
          rootDir: options.dir,
          enableAstAnalysis: true,
        });

        const baseline = await loadBaseline(options.baseline);

        if (!baseline) {
          console.log('No baseline found - all findings are new');
          console.log(`Total: ${result.summary.total}`);
          process.exit(result.summary.bySeverity.critical > 0 ? 1 : 0);
        }

        const filtered = filterBaselineFindings(result, baseline);

        console.log('\n📊 BASELINE DIFF');
        console.log('═'.repeat(60));
        console.log(`Total findings: ${result.summary.total}`);
        console.log(`Baseline entries: ${baseline.entries.length}`);
        console.log(`New findings: ${filtered.summary.total}`);
        console.log('═'.repeat(60));

        if (filtered.summary.total === 0) {
          console.log('\n✅ No new issues found!');
        } else {
          console.log('\n⚠️  NEW ISSUES:');

          for (const finding of filtered.findings.slice(0, 10)) {
            const icon = {
              critical: '🔴',
              high: '🟠',
              medium: '🟡',
              low: '🟢',
            }[finding.severity] || '⚪';

            console.log(`\n${icon} [${finding.severity}] ${finding.description}`);
            console.log(`   ${finding.file}:${finding.line}`);
          }

          if (filtered.findings.length > 10) {
            console.log(`\n... and ${filtered.findings.length - 10} more`);
          }
        }

        if (filtered.summary.bySeverity.critical > 0 || filtered.summary.bySeverity.high > 0) {
          process.exit(1);
        }
      })
  );
