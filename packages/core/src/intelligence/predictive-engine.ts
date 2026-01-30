/**
 * Predictive Engine
 *
 * Suggests what the user probably wants to do next based on:
 * - Recent commands and their outcomes
 * - Current git status
 * - Open files and context
 * - Historical patterns
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { getLogger, type Logger } from '../utils/logger.js';
import type {
  PredictiveConfig,
  SessionContext,
  Suggestion,
  DEFAULT_PREDICTIVE_CONFIG,
} from './types.js';

const DEFAULT_CONFIG: PredictiveConfig = {
  maxSuggestions: 5,
  minConfidence: 0.6,
  enableAutoSuggestions: true,
  contextWindowMinutes: 30,
};

interface CommandHistory {
  command: string;
  timestamp: Date;
  success: boolean;
  resultSummary?: {
    findingsCount?: number;
    fixedCount?: number;
    errorCount?: number;
  };
}

interface SuggestionRule {
  id: string;
  name: string;
  condition: (context: SessionContext, history: CommandHistory[]) => boolean;
  generate: (context: SessionContext, history: CommandHistory[]) => Suggestion | null;
  priority: number;
}

/**
 * Predictive Engine - Suggests next actions
 */
export class PredictiveEngine {
  private config: PredictiveConfig;
  private projectRoot: string;
  private commandHistory: CommandHistory[] = [];
  private rules: SuggestionRule[] = [];
  private logger: Logger;

  constructor(projectRoot: string, config: Partial<PredictiveConfig> = {}) {
    this.projectRoot = projectRoot;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = getLogger('predictive-engine');
    this.initializeRules();
  }

  /**
   * Record a command execution
   */
  recordCommand(
    command: string,
    success: boolean,
    resultSummary?: CommandHistory['resultSummary']
  ): void {
    this.commandHistory.push({
      command,
      timestamp: new Date(),
      success,
      resultSummary,
    });

    // Keep history manageable
    if (this.commandHistory.length > 100) {
      this.commandHistory = this.commandHistory.slice(-100);
    }

    this.logger.debug('Command recorded', { command, success });
  }

  /**
   * Get suggestions based on current context
   */
  async getSuggestions(context: SessionContext): Promise<Suggestion[]> {
    if (!this.config.enableAutoSuggestions) {
      return [];
    }

    const recentHistory = this.getRecentHistory();
    const suggestions: Suggestion[] = [];

    // Evaluate all rules
    for (const rule of this.rules) {
      try {
        if (rule.condition(context, recentHistory)) {
          const suggestion = rule.generate(context, recentHistory);
          if (suggestion && suggestion.confidence >= this.config.minConfidence) {
            suggestions.push(suggestion);
          }
        }
      } catch (error) {
        this.logger.debug('Rule evaluation failed', {
          rule: rule.id,
          error: error instanceof Error ? error.message : 'Unknown',
        });
      }
    }

    // Sort by priority and confidence
    suggestions.sort((a, b) => {
      const priorityDiff = b.priority - a.priority;
      if (priorityDiff !== 0) return priorityDiff;
      return b.confidence - a.confidence;
    });

    return suggestions.slice(0, this.config.maxSuggestions);
  }

  /**
   * Get the most likely next action
   */
  async getTopSuggestion(context: SessionContext): Promise<Suggestion | null> {
    const suggestions = await this.getSuggestions(context);
    return suggestions[0] ?? null;
  }

  /**
   * Clear command history
   */
  clearHistory(): void {
    this.commandHistory = [];
  }

  /**
   * Add a custom rule
   */
  addRule(rule: SuggestionRule): void {
    this.rules.push(rule);
    this.rules.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Get command history
   */
  getHistory(): CommandHistory[] {
    return [...this.commandHistory];
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private getRecentHistory(): CommandHistory[] {
    const cutoff = new Date(
      Date.now() - this.config.contextWindowMinutes * 60 * 1000
    );
    return this.commandHistory.filter((h) => h.timestamp >= cutoff);
  }

  private initializeRules(): void {
    this.rules = [
      // After scan with findings → suggest fix
      {
        id: 'post-scan-fix',
        name: 'Post-Scan Auto-Fix',
        priority: 100,
        condition: (ctx) => {
          return (
            ctx.lastCommand === 'scan' &&
            ctx.lastScanResult !== undefined &&
            ctx.lastScanResult.fixableCount > 0
          );
        },
        generate: (ctx) => {
          const fixable = ctx.lastScanResult?.fixableCount ?? 0;
          return {
            id: 'suggest-fix',
            command: 'vibecheck fix --auto',
            description: `Auto-fix ${fixable} findings`,
            reason: `${fixable} findings from the last scan can be automatically fixed`,
            confidence: 0.9,
            category: 'fix',
            priority: 100,
            metadata: { fixableCount: fixable },
          };
        },
      },

      // After scan with critical findings → suggest immediate review
      {
        id: 'critical-findings',
        name: 'Critical Findings Review',
        priority: 95,
        condition: (ctx) => {
          return (
            ctx.lastCommand === 'scan' &&
            ctx.lastScanResult !== undefined &&
            ctx.lastScanResult.criticalCount > 0
          );
        },
        generate: (ctx) => {
          const critical = ctx.lastScanResult?.criticalCount ?? 0;
          return {
            id: 'review-critical',
            command: 'vibecheck check --severity=critical',
            description: `Review ${critical} critical findings`,
            reason: `${critical} critical issues require immediate attention`,
            confidence: 0.95,
            category: 'scan',
            priority: 95,
            metadata: { criticalCount: critical },
          };
        },
      },

      // Before git commit → suggest scan
      {
        id: 'pre-commit-scan',
        name: 'Pre-Commit Scan',
        priority: 90,
        condition: (ctx) => {
          return (
            ctx.gitStatus?.hasUncommitted === true &&
            ctx.gitStatus.staged.length > 0
          );
        },
        generate: (ctx) => {
          const stagedCount = ctx.gitStatus?.staged.length ?? 0;
          return {
            id: 'scan-staged',
            command: 'vibecheck scan --staged',
            description: `Scan ${stagedCount} staged files before commit`,
            reason: 'Scan staged changes to catch issues before committing',
            confidence: 0.85,
            category: 'scan',
            priority: 90,
            metadata: { stagedFiles: ctx.gitStatus?.staged },
          };
        },
      },

      // After multiple failures → suggest checkpoint restore
      {
        id: 'failure-recovery',
        name: 'Failure Recovery',
        priority: 85,
        condition: (ctx) => {
          return ctx.consecutiveFailures >= 3;
        },
        generate: (ctx) => {
          return {
            id: 'restore-checkpoint',
            command: ctx.lastCheckpointId
              ? `vibecheck checkpoint restore ${ctx.lastCheckpointId}`
              : 'vibecheck checkpoint restore latest',
            description: 'Restore to last checkpoint',
            reason: `${ctx.consecutiveFailures} consecutive failures detected. Consider restoring to a known good state.`,
            confidence: 0.7,
            category: 'checkpoint',
            priority: 85,
            metadata: { consecutiveFailures: ctx.consecutiveFailures },
          };
        },
      },

      // Modified but not scanned files → suggest scan
      {
        id: 'modified-files-scan',
        name: 'Modified Files Scan',
        priority: 80,
        condition: (ctx) => {
          return (
            ctx.gitStatus?.modified !== undefined &&
            ctx.gitStatus.modified.length > 3
          );
        },
        generate: (ctx) => {
          const modifiedCount = ctx.gitStatus?.modified.length ?? 0;
          return {
            id: 'scan-modified',
            command: 'vibecheck scan --modified',
            description: `Scan ${modifiedCount} modified files`,
            reason: 'Several files have been modified since the last scan',
            confidence: 0.75,
            category: 'scan',
            priority: 80,
            metadata: { modifiedCount },
          };
        },
      },

      // No recent scans → suggest full scan
      {
        id: 'periodic-scan',
        name: 'Periodic Full Scan',
        priority: 50,
        condition: (ctx, history) => {
          const lastScan = history.find((h) => h.command.includes('scan'));
          if (!lastScan) return true;

          const hoursSinceScan =
            (Date.now() - lastScan.timestamp.getTime()) / (1000 * 60 * 60);
          return hoursSinceScan > 4;
        },
        generate: () => {
          return {
            id: 'full-scan',
            command: 'vibecheck scan',
            description: 'Run a full scan',
            reason: "It's been a while since the last full scan",
            confidence: 0.6,
            category: 'scan',
            priority: 50,
          };
        },
      },

      // After fix → suggest verify
      {
        id: 'post-fix-verify',
        name: 'Post-Fix Verification',
        priority: 75,
        condition: (ctx, history) => {
          const lastFix = history.find((h) => h.command.includes('fix'));
          if (!lastFix) return false;

          const lastScan = history.find((h) => h.command.includes('scan'));
          if (!lastScan) return true;

          return lastFix.timestamp > lastScan.timestamp;
        },
        generate: () => {
          return {
            id: 'verify-fixes',
            command: 'vibecheck scan --quick',
            description: 'Verify recent fixes',
            reason: 'Run a quick scan to verify the fixes were applied correctly',
            confidence: 0.8,
            category: 'scan',
            priority: 75,
          };
        },
      },

      // First time user → suggest init
      {
        id: 'first-time-init',
        name: 'First Time Setup',
        priority: 100,
        condition: (ctx, history) => {
          return history.length === 0;
        },
        generate: () => {
          return {
            id: 'init-project',
            command: 'vibecheck init',
            description: 'Initialize VibeCheck for this project',
            reason: "Let's set up VibeCheck for your project",
            confidence: 0.95,
            category: 'config',
            priority: 100,
          };
        },
      },

      // After successful scan with no findings → suggest checkpoint
      {
        id: 'clean-scan-checkpoint',
        name: 'Clean Scan Checkpoint',
        priority: 70,
        condition: (ctx) => {
          return (
            ctx.lastCommand === 'scan' &&
            ctx.lastScanResult !== undefined &&
            ctx.lastScanResult.totalFindings === 0
          );
        },
        generate: () => {
          return {
            id: 'create-checkpoint',
            command: 'vibecheck checkpoint create "Clean scan"',
            description: 'Create a checkpoint of this clean state',
            reason: 'Save this clean state as a checkpoint for easy recovery',
            confidence: 0.7,
            category: 'checkpoint',
            priority: 70,
          };
        },
      },

      // Many false positives → suggest learning
      {
        id: 'learn-patterns',
        name: 'Learn From Feedback',
        priority: 65,
        condition: (ctx, history) => {
          const recentFixes = history.filter(
            (h) =>
              h.command.includes('suppress') ||
              h.command.includes('feedback') ||
              h.command.includes('ignore')
          );
          return recentFixes.length >= 3;
        },
        generate: () => {
          return {
            id: 'learn-suppressions',
            command: 'vibecheck learn --from-feedback',
            description: 'Learn from recent suppressions',
            reason:
              "You've suppressed several findings. Let VibeCheck learn your patterns.",
            confidence: 0.75,
            category: 'learn',
            priority: 65,
          };
        },
      },

      // Working on auth files → suggest auth-focused scan
      {
        id: 'auth-focus-scan',
        name: 'Auth-Focused Scan',
        priority: 60,
        condition: (ctx) => {
          const authPatterns = /auth|login|session|permission|role/i;
          return (
            ctx.openFiles.some((f) => authPatterns.test(f)) ||
            ctx.recentFiles.some((f) => authPatterns.test(f))
          );
        },
        generate: () => {
          return {
            id: 'scan-auth',
            command: 'vibecheck scan --focus=auth',
            description: 'Run auth-focused security scan',
            reason:
              "You're working on authentication files. Run a security-focused scan.",
            confidence: 0.7,
            category: 'scan',
            priority: 60,
          };
        },
      },
    ];

    // Sort by priority
    this.rules.sort((a, b) => b.priority - a.priority);
  }
}

// ============================================================================
// Singleton
// ============================================================================

let globalEngine: PredictiveEngine | null = null;

export function getPredictiveEngine(
  projectRoot: string,
  config?: Partial<PredictiveConfig>
): PredictiveEngine {
  if (!globalEngine || globalEngine['projectRoot'] !== projectRoot) {
    globalEngine = new PredictiveEngine(projectRoot, config);
  }
  return globalEngine;
}

export function resetPredictiveEngine(): void {
  globalEngine = null;
}

/**
 * Format suggestions for CLI display
 */
export function formatSuggestions(suggestions: Suggestion[]): string {
  if (suggestions.length === 0) {
    return '';
  }

  const lines: string[] = [];
  lines.push('');
  lines.push('💡 Suggested next actions:');
  lines.push('');

  for (let i = 0; i < suggestions.length; i++) {
    const s = suggestions[i];
    const confidence = Math.round(s.confidence * 100);
    const icon = getIconForCategory(s.category);

    lines.push(`  ${i + 1}. ${icon} ${s.description}`);
    lines.push(`     Command: ${s.command}`);
    lines.push(`     Reason: ${s.reason}`);
    lines.push(`     Confidence: ${confidence}%`);
    lines.push('');
  }

  return lines.join('\n');
}

function getIconForCategory(category: Suggestion['category']): string {
  switch (category) {
    case 'fix':
      return '🔧';
    case 'scan':
      return '🔍';
    case 'checkpoint':
      return '💾';
    case 'config':
      return '⚙️';
    case 'learn':
      return '🧠';
    default:
      return '📋';
  }
}
