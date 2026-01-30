/**
 * Badge Command
 * 
 * Generate badge embed codes for README files.
 * Shows Ship Score badges that can be embedded in GitHub READMEs.
 */

import chalk from 'chalk';
import * as p from '@clack/prompts';
import { createLogger, isAuthenticated } from '../lib/index.js';
import { loadCredentials } from '../lib/credentials.js';
import { colors } from '../ui/theme.js';

// ============================================================================
// Types
// ============================================================================

export interface BadgeOptions {
  projectId?: string;
  style?: 'flat' | 'flat-square' | 'plastic' | 'for-the-badge';
  format?: 'markdown' | 'html' | 'url';
  verbose?: boolean;
  json?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const API_BASE = process.env.VIBECHECK_API_URL || 'https://api.vibecheckai.dev';

// ============================================================================
// Badge Templates
// ============================================================================

function getBadgeUrl(projectId: string, style: string, verified: boolean): string {
  const endpoint = verified ? 'verified' : 'svg';
  return `${API_BASE}/badges/${projectId}/${endpoint}?style=${style}`;
}

function getMarkdownEmbed(projectId: string, style: string, verified: boolean): string {
  const url = getBadgeUrl(projectId, style, verified);
  const linkUrl = `https://app.vibecheckai.dev/projects/${projectId}`;
  const alt = verified ? 'VibeCheck Verified' : 'Ship Score';
  return `[![${alt}](${url})](${linkUrl})`;
}

function getHtmlEmbed(projectId: string, style: string, verified: boolean): string {
  const url = getBadgeUrl(projectId, style, verified);
  const linkUrl = `https://app.vibecheckai.dev/projects/${projectId}`;
  const alt = verified ? 'VibeCheck Verified' : 'Ship Score';
  return `<a href="${linkUrl}"><img src="${url}" alt="${alt}" /></a>`;
}

// ============================================================================
// Badge Command
// ============================================================================

export async function badgeCommand(options: BadgeOptions): Promise<void> {
  const logger = createLogger({
    level: options.verbose ? 'verbose' : 'normal',
    json: options.json,
  });

  // Check authentication for verified badges
  const authenticated = isAuthenticated();
  let isPro = false;
  if (authenticated) {
    const credResult = await loadCredentials();
    if (credResult.success && credResult.credentials) {
      const tier = credResult.credentials.user?.tier;
      isPro = tier === 'pro' || tier === 'enterprise';
    }
  }

  console.log('');
  console.log(chalk.cyan.bold('  🏷️  Badge Generator'));
  console.log(chalk.dim('  ─────────────────────────────────────'));
  console.log('');

  // Get or prompt for project ID
  let projectId = options.projectId;
  
  if (!projectId) {
    // Try to get from local config
    try {
      const fs = await import('node:fs/promises');
      const configPath = '.vibecheck/config.json';
      const configData = await fs.readFile(configPath, 'utf-8');
      const config = JSON.parse(configData);
      projectId = config.projectId;
    } catch {
      // No local config
    }
  }

  if (!projectId && !options.json) {
    const input = await p.text({
      message: 'Enter your project ID (from dashboard):',
      placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
      validate: (value) => {
        if (!value || value.length < 10) {
          return 'Please enter a valid project ID';
        }
      },
    });

    if (p.isCancel(input)) {
      p.cancel('Cancelled');
      process.exit(0);
    }

    projectId = input as string;
  }

  if (!projectId) {
    logger.error('Project ID is required. Use --project-id or run from a VibeCheck project.');
    process.exit(1);
  }

  const style = options.style || 'flat';
  const format = options.format || 'markdown';

  // Generate badge codes
  const badges = {
    basic: {
      url: getBadgeUrl(projectId, style, false),
      markdown: getMarkdownEmbed(projectId, style, false),
      html: getHtmlEmbed(projectId, style, false),
    },
    verified: isPro ? {
      url: getBadgeUrl(projectId, style, true),
      markdown: getMarkdownEmbed(projectId, style, true),
      html: getHtmlEmbed(projectId, style, true),
    } : null,
  };

  if (options.json) {
    console.log(JSON.stringify(badges, null, 2));
    return;
  }

  // Display badges
  console.log(chalk.bold('  📊 Ship Score Badge'));
  console.log('');
  console.log(chalk.dim('  Add this to your README.md:'));
  console.log('');
  console.log(chalk.cyan('  ' + badges.basic.markdown));
  console.log('');

  if (isPro && badges.verified) {
    console.log(chalk.bold('  ✅ Verified Badge ') + chalk.dim('(Pro)'));
    console.log('');
    console.log(chalk.dim('  Shows verified status with detailed score:'));
    console.log('');
    console.log(chalk.cyan('  ' + badges.verified.markdown));
    console.log('');
  } else if (!isPro) {
    console.log('');
    console.log(chalk.dim('  ─────────────────────────────────────'));
    console.log('');
    console.log(chalk.yellow('  ⭐ Upgrade to Pro for Verified Badges'));
    console.log('');
    console.log(chalk.dim('  Verified badges show:'));
    console.log(chalk.dim('  • ✓ Verification checkmark'));
    console.log(chalk.dim('  • Last scan timestamp'));
    console.log(chalk.dim('  • Detailed score breakdown'));
    console.log('');
    console.log(chalk.dim('  Upgrade: ') + chalk.cyan.underline('https://app.vibecheckai.dev/billing'));
  }

  // Show all formats
  console.log('');
  console.log(chalk.dim('  ─────────────────────────────────────'));
  console.log('');
  console.log(chalk.bold('  All Formats:'));
  console.log('');
  console.log(chalk.dim('  Markdown:'));
  console.log(`  ${chalk.white(badges.basic.markdown)}`);
  console.log('');
  console.log(chalk.dim('  HTML:'));
  console.log(`  ${chalk.white(badges.basic.html)}`);
  console.log('');
  console.log(chalk.dim('  Direct URL:'));
  console.log(`  ${chalk.white(badges.basic.url)}`);
  console.log('');

  // Preview
  console.log(chalk.dim('  ─────────────────────────────────────'));
  console.log('');
  console.log(chalk.dim('  Preview your badge at:'));
  console.log(`  ${chalk.cyan.underline(badges.basic.url)}`);
  console.log('');
}
