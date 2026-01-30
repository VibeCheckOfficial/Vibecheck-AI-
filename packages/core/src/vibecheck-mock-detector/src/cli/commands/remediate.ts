// src/cli/commands/remediate.ts

import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createInterface } from 'readline';
import { scan } from '../../scanner/engines/mock-detector';
import { AIRemediationEngine, applyRemediation } from '../../scanner/engines/mock-detector/ai-remediation';

export const remediateCommand = new Command('remediate')
  .description('AI-powered auto-remediation of mock/fake data issues')
  .option('-d, --dir <path>', 'Directory to scan', process.cwd())
  .option('--auto', 'Automatically apply high-confidence fixes')
  .option('--interactive', 'Review and approve each fix')
  .option('--dry-run', 'Show fixes without applying')
  .option('--severity <level>', 'Only remediate findings at or above severity', 'high')
  .option('--max-fixes <n>', 'Maximum number of fixes to apply', '10')
  .option('--output <path>', 'Output fixes to file instead of applying')
  .action(async (options) => {
    console.log('🔍 Scanning for mock/fake data issues...\n');

    const result = await scan({
      rootDir: options.dir,
      enableAstAnalysis: true,
    });

    const severityOrder = ['critical', 'high', 'medium', 'low'];
    const maxSeverityIndex = severityOrder.indexOf(options.severity);

    const targetFindings = result.findings.filter(f =>
      severityOrder.indexOf(f.severity) <= maxSeverityIndex
    ).slice(0, parseInt(options.maxFixes));

    if (targetFindings.length === 0) {
      console.log('✅ No issues found to remediate');
      return;
    }

    console.log(`Found ${targetFindings.length} issues to remediate\n`);

    const engine = new AIRemediationEngine();

    const fileContents = new Map<string, string>();
    for (const finding of targetFindings) {
      if (!fileContents.has(finding.file)) {
        const fullPath = path.join(options.dir, finding.file);
        try {
          const content = await fs.readFile(fullPath, 'utf-8');
          fileContents.set(finding.file, content);
        } catch {
          console.warn(`⚠️ Could not read file: ${finding.file}`);
        }
      }
    }

    console.log('🤖 Generating AI remediations...\n');

    const suggestions = await engine.generateBatchRemediations(
      targetFindings,
      fileContents
    );

    if (options.output) {
      await fs.writeFile(
        options.output,
        JSON.stringify(suggestions, null, 2)
      );
      console.log(`✅ Saved ${suggestions.length} suggestions to ${options.output}`);
      return;
    }

    const applied: string[] = [];
    const skipped: string[] = [];

    for (const suggestion of suggestions) {
      const { finding } = suggestion;

      console.log('─'.repeat(60));
      console.log(`\n📍 ${finding.file}:${finding.line}`);
      console.log(`   Rule: ${finding.id}`);
      console.log(`   Severity: ${finding.severity}`);
      console.log(`   Description: ${finding.description}`);
      console.log(`\n   Original:`);
      console.log(`   ${suggestion.diff?.original || finding.code}`);
      console.log(`\n   Suggested fix:`);
      console.log(`   ${suggestion.suggestedFix || '(no fix suggested)'}`);
      console.log(`\n   Explanation: ${suggestion.explanation}`);
      console.log(`   Confidence: ${suggestion.confidence}`);
      console.log(`   Requires review: ${suggestion.requiresReview}`);

      if (!suggestion.suggestedFix) {
        console.log('\n   ⏭️ Skipped (no fix available)');
        skipped.push(finding.id);
        continue;
      }

      let shouldApply = false;

      if (options.dryRun) {
        console.log('\n   🔍 Dry run - not applying');
      } else if (options.auto && suggestion.confidence === 'high' && !suggestion.requiresReview) {
        shouldApply = true;
        console.log('\n   ✅ Auto-applying (high confidence)');
      } else if (options.interactive) {
        shouldApply = await promptUser('\n   Apply this fix? (y/n): ');
      } else if (options.auto) {
        console.log('\n   ⏭️ Skipped (requires review)');
        skipped.push(finding.id);
      }

      if (shouldApply) {
        const fullPath = path.join(options.dir, finding.file);
        const { success } = await applyRemediation(fullPath, suggestion, false);

        if (success) {
          applied.push(finding.id);
          console.log('   ✅ Applied');
        } else {
          skipped.push(finding.id);
          console.log('   ❌ Failed to apply');
        }
      }
    }

    console.log('\n' + '═'.repeat(60));
    console.log('REMEDIATION SUMMARY');
    console.log('═'.repeat(60));
    console.log(`Total suggestions: ${suggestions.length}`);
    console.log(`Applied: ${applied.length}`);
    console.log(`Skipped: ${skipped.length}`);

    if (applied.length > 0) {
      console.log('\n✅ Applied fixes:');
      applied.forEach(id => console.log(`   - ${id}`));
    }

    if (skipped.length > 0 && !options.dryRun) {
      console.log('\n⏭️ Skipped (review manually):');
      skipped.forEach(id => console.log(`   - ${id}`));
    }
  });

async function promptUser(question: string): Promise<boolean> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}
