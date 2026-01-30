// src/cli/commands/init.ts

import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createInterface } from 'readline';

export const initCommand = new Command('init')
  .description('Initialize VibeCheck in your project')
  .option('--yes', 'Skip prompts and use defaults')
  .action(async (options) => {
    console.log('🚀 Initializing VibeCheck Mock Detector\n');

    const config: Record<string, any> = {
      failOn: 'high',
      industries: ['general'],
      include: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
      exclude: [],
      enableAst: true,
    };

    if (!options.yes) {
      const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const question = (q: string): Promise<string> =>
        new Promise((resolve) => rl.question(q, resolve));

      const failOn = await question('Fail on severity (critical/high/medium/low) [high]: ');
      if (failOn) config.failOn = failOn;

      const industries = await question('Industries (comma-separated: fintech,healthcare,ecommerce,saas,general) [general]: ');
      if (industries) config.industries = industries.split(',').map(i => i.trim());

      const installHooks = await question('Install pre-commit hook? (y/n) [y]: ');
      const shouldInstallHooks = !installHooks || installHooks.toLowerCase() === 'y';

      rl.close();

      if (shouldInstallHooks) {
        console.log('\nInstalling pre-commit hook...');
        const { execSync } = await import('child_process');
        try {
          execSync('npx vibecheck hooks install', { stdio: 'inherit' });
        } catch {
          console.log('⚠️ Could not install hooks automatically');
        }
      }
    }

    // Write config file
    const configContent = `# VibeCheck Configuration
# https://vibecheck.dev/docs/configuration

failOn: ${config.failOn}

industries:
${config.industries.map((i: string) => `  - ${i}`).join('\n')}

include:
${config.include.map((i: string) => `  - "${i}"`).join('\n')}

exclude:
  - "**/*.test.*"
  - "**/*.spec.*"
  - "**/__tests__/**"
  - "**/__mocks__/**"

enableAst: true
enableMl: true

# Team configuration (optional)
# team: your-team-id
# apiKey: \${VIBECHECK_API_KEY}

# Custom rules (optional)
# rules:
#   - id: custom-rule
#     pattern: "your-pattern"
#     severity: high
#     category: mock-data
#     description: "Description"
#     fix: "How to fix"

# Suppressions (optional)
# suppressions:
#   - rule: rule-id
#     file: "path/to/file.ts"
#     reason: "Reason for suppression"
`;

    await fs.writeFile('.vibecheckrc.yaml', configContent);
    console.log('\n✅ Created .vibecheckrc.yaml');

    // Create .vibecheck-baseline.json placeholder
    const baselineContent = {
      version: '1.0',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      entries: [],
      metadata: {
        totalFindings: 0,
        bySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
      },
    };

    // Add to .gitignore
    try {
      const gitignorePath = '.gitignore';
      let gitignore = '';
      try {
        gitignore = await fs.readFile(gitignorePath, 'utf-8');
      } catch {}

      if (!gitignore.includes('.vibecheck-baseline.json')) {
        const addition = '\n# VibeCheck\n.vibecheck-baseline.json\n';
        await fs.appendFile(gitignorePath, addition);
        console.log('✅ Updated .gitignore');
      }
    } catch {}

    // Update package.json scripts
    try {
      const packageJsonPath = 'package.json';
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));

      packageJson.scripts = packageJson.scripts || {};
      packageJson.scripts['vibecheck'] = 'vibecheck scan:mocks';
      packageJson.scripts['vibecheck:fix'] = 'vibecheck remediate --interactive';
      packageJson.scripts['vibecheck:baseline'] = 'vibecheck baseline create';

      await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
      console.log('✅ Added npm scripts to package.json');
    } catch {
      console.log('⚠️ Could not update package.json');
    }

    console.log('\n🎉 VibeCheck initialized!\n');
    console.log('Next steps:');
    console.log('  1. Run `npm run vibecheck` to scan your codebase');
    console.log('  2. Run `npm run vibecheck:baseline` to create a baseline of existing issues');
    console.log('  3. Run `npm run vibecheck:fix` to auto-remediate issues with AI\n');
  });
