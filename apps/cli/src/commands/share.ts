/**
 * Share Command
 * 
 * Generate shareable links and social cards for Ship Score.
 * Opens browser to share on Twitter/LinkedIn.
 */

import chalk from 'chalk';
import open from 'open';
import * as p from '@clack/prompts';
import { createLogger } from '../lib/index.js';

// ============================================================================
// Types
// ============================================================================

export interface ShareOptions {
  projectId?: string;
  platform?: 'twitter' | 'linkedin' | 'copy';
  score?: number;
  verbose?: boolean;
  json?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const API_BASE = process.env.VIBECHECK_API_URL || 'https://api.vibecheckai.dev';

// ============================================================================
// Share URL Generators
// ============================================================================

function generateTwitterShareUrl(score: number, verdict: string, projectId?: string): string {
  const verdictEmoji = verdict === 'SHIP' ? '✅' : verdict === 'WARN' ? '⚠️' : '🛑';
  const message = verdict === 'SHIP' 
    ? 'Ready to ship!' 
    : verdict === 'WARN' 
      ? 'A few things to fix first.' 
      : 'Working on improving it!';
  
  const text = encodeURIComponent(
    `${verdictEmoji} My project scored ${score}/100 on @VibeCheckAI!\n\n${message}\n\nCheck your code quality:`
  );
  const url = encodeURIComponent(`https://vibecheckai.dev${projectId ? `?project=${projectId}` : ''}`);
  return `https://twitter.com/intent/tweet?text=${text}&url=${url}`;
}

function generateLinkedInShareUrl(score: number, projectId?: string): string {
  const url = encodeURIComponent(`https://vibecheckai.dev${projectId ? `?project=${projectId}` : ''}`);
  return `https://www.linkedin.com/sharing/share-offsite/?url=${url}`;
}

// ============================================================================
// Share Command
// ============================================================================

export async function shareCommand(options: ShareOptions): Promise<void> {
  const logger = createLogger({
    level: options.verbose ? 'verbose' : 'normal',
    json: options.json,
  });

  console.log('');
  console.log(chalk.cyan.bold('  📣 Share Your Ship Score'));
  console.log(chalk.dim('  ─────────────────────────────────────'));
  console.log('');

  // Get score from options or latest scan
  let score = options.score;
  let verdict = 'SHIP';
  
  if (!score) {
    // Try to read from latest scan result
    try {
      const fs = await import('node:fs/promises');
      const shipResultPath = '.vibecheck/last-ship.json';
      const data = await fs.readFile(shipResultPath, 'utf-8');
      const shipResult = JSON.parse(data);
      score = shipResult.scores?.ship ?? shipResult.score ?? 0;
      verdict = shipResult.verdict?.status ?? shipResult.verdict ?? 'SHIP';
    } catch {
      // Default score if no result found
      score = 0;
    }
  }

  if (score === 0 && !options.json) {
    p.note(
      'No recent scan found.\n\n' +
      'Run `vibecheck ship` first to get your Ship Score,\n' +
      'then share it with your network!',
      'Tip'
    );
    return;
  }

  // Determine verdict from score if not set
  if (score >= 80) verdict = 'SHIP';
  else if (score >= 60) verdict = 'WARN';
  else verdict = 'BLOCK';

  const verdictEmoji = verdict === 'SHIP' ? '✅' : verdict === 'WARN' ? '⚠️' : '🛑';
  const verdictColor = verdict === 'SHIP' ? chalk.green : verdict === 'WARN' ? chalk.yellow : chalk.red;

  // Show current score
  console.log(`  Your Ship Score: ${verdictColor.bold(`${score}/100`)} ${verdictEmoji}`);
  console.log('');

  // Generate share URLs
  const twitterUrl = generateTwitterShareUrl(score, verdict, options.projectId);
  const linkedInUrl = generateLinkedInShareUrl(score, options.projectId);

  if (options.json) {
    console.log(JSON.stringify({
      score,
      verdict,
      twitter: twitterUrl,
      linkedin: linkedInUrl,
      cardUrl: options.projectId ? `${API_BASE}/social/${options.projectId}/card` : null,
    }, null, 2));
    return;
  }

  // Interactive platform selection
  if (!options.platform) {
    const platform = await p.select({
      message: 'Where would you like to share?',
      options: [
        { value: 'twitter', label: '𝕏 Twitter/X', hint: 'Post a tweet with your score' },
        { value: 'linkedin', label: '💼 LinkedIn', hint: 'Share with your professional network' },
        { value: 'copy', label: '📋 Copy Link', hint: 'Copy shareable link to clipboard' },
      ],
    });

    if (p.isCancel(platform)) {
      p.cancel('Cancelled');
      return;
    }

    options.platform = platform as 'twitter' | 'linkedin' | 'copy';
  }

  // Handle sharing
  switch (options.platform) {
    case 'twitter':
      console.log('');
      console.log(chalk.dim('  Opening Twitter...'));
      await open(twitterUrl);
      console.log(chalk.green('  ✓ Opened Twitter share dialog'));
      break;

    case 'linkedin':
      console.log('');
      console.log(chalk.dim('  Opening LinkedIn...'));
      await open(linkedInUrl);
      console.log(chalk.green('  ✓ Opened LinkedIn share dialog'));
      break;

    case 'copy':
      const shareText = `🚀 My project scored ${score}/100 on VibeCheck! ${verdictEmoji}\n\nCheck your code: https://vibecheckai.dev`;
      
      try {
        // Try to copy to clipboard
        const clipboardy = await import('clipboardy').catch(() => null);
        if (clipboardy) {
          await clipboardy.default.write(shareText);
          console.log('');
          console.log(chalk.green('  ✓ Copied to clipboard!'));
        } else {
          // Fallback: show text to copy manually
          console.log('');
          console.log(chalk.dim('  Copy this message:'));
          console.log('');
          console.log(chalk.cyan(`  ${shareText.replace(/\n/g, '\n  ')}`));
        }
      } catch {
        console.log('');
        console.log(chalk.dim('  Copy this message:'));
        console.log('');
        console.log(chalk.cyan(`  ${shareText.replace(/\n/g, '\n  ')}`));
      }
      break;
  }

  // Show Pro tip
  console.log('');
  console.log(chalk.dim('  ─────────────────────────────────────'));
  console.log('');
  console.log(chalk.dim('  💡 Pro tip: Add a Ship Score badge to your README:'));
  console.log(chalk.cyan('     vibecheck badge'));
  console.log('');
}
