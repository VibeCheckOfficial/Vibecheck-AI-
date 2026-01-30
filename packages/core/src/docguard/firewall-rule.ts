/**
 * DocGuard Firewall Rule
 * 
 * Integrates DocGuard with the Agent Firewall to intercept .md file writes.
 * Implements "merge-not-create" as default behavior for documentation.
 */

import type { BaseRule, RuleConfig } from '../firewall/rules/base-rule.js';
import { DocGuardEngine, createDocGuard } from './docguard-engine.js';
import type { DocGuardResult, DocGuardConfig } from './types.js';

// ============================================================================
// Rule Types
// ============================================================================

export interface DocGuardRuleContext {
  action: 'write' | 'modify' | 'delete';
  target: string;
  content: string;
  projectRoot: string;
  gitContext?: {
    commit?: string;
    branch?: string;
    changedFiles?: string[];
  };
}

export interface DocGuardRuleResult {
  allowed: boolean;
  violations: Array<{
    policy: string;
    message: string;
    severity: 'error' | 'warning';
  }>;
  docGuardResult?: DocGuardResult;
}

// ============================================================================
// DocGuard Firewall Rule
// ============================================================================

export class DocGuardRule implements BaseRule {
  readonly id = 'docguard';
  readonly name = 'DocGuard Rule';
  readonly description = 'Enforces documentation quality and prevents duplicate docs';
  readonly category = 'quality';
  
  private engine: DocGuardEngine | null = null;
  private config: Partial<DocGuardConfig>;

  constructor(config: Partial<DocGuardConfig> = {}) {
    this.config = config;
  }

  /**
   * Check if this rule applies to the given target
   */
  appliesTo(target: string): boolean {
    return target.endsWith('.md');
  }

  /**
   * Initialize the engine lazily
   */
  private getEngine(projectRoot: string): DocGuardEngine {
    if (!this.engine) {
      this.engine = createDocGuard({
        projectRoot,
        config: this.config,
      });
    }
    return this.engine;
  }

  /**
   * Evaluate the rule against the context
   */
  async evaluate(context: DocGuardRuleContext): Promise<DocGuardRuleResult> {
    // Only check markdown files
    if (!this.appliesTo(context.target)) {
      return { allowed: true, violations: [] };
    }

    // Skip delete operations
    if (context.action === 'delete') {
      return { allowed: true, violations: [] };
    }

    const engine = this.getEngine(context.projectRoot);
    
    const result = await engine.evaluate({
      action: context.action === 'write' ? 'create' : 'modify',
      path: context.target,
      content: context.content,
      gitContext: context.gitContext,
    });

    const violations: DocGuardRuleResult['violations'] = [];

    // Convert DocGuard result to firewall violations
    if (result.verdict === 'BLOCK') {
      violations.push({
        policy: 'docguard:blocked',
        message: result.reason,
        severity: 'error',
      });

      // Add duplicate-specific violation
      if (result.duplicateCheck?.isDuplicate && result.duplicateCheck.canonicalTarget) {
        violations.push({
          policy: 'docguard:duplicate',
          message: `Duplicate detected. Merge into: ${result.duplicateCheck.canonicalTarget}`,
          severity: 'error',
        });
      }

      // Add DocSpec violations
      if (result.docSpec) {
        for (const v of result.docSpec.violations.filter(v => v.severity === 'error')) {
          violations.push({
            policy: `docguard:docspec:${v.rule}`,
            message: v.message,
            severity: 'error',
          });
        }
      }
    } else if (result.verdict === 'WARN') {
      // Add warnings
      if (result.docSpec) {
        for (const v of result.docSpec.violations) {
          violations.push({
            policy: `docguard:docspec:${v.rule}`,
            message: v.message,
            severity: 'warning',
          });
        }
      }
    }

    return {
      allowed: result.verdict !== 'BLOCK',
      violations,
      docGuardResult: result,
    };
  }

  /**
   * Get suggested fix for violations
   */
  getSuggestedFix(result: DocGuardRuleResult): string | undefined {
    if (!result.docGuardResult) return undefined;

    const suggestions: string[] = [];

    // Merge patch suggestion
    if (result.docGuardResult.mergePatch) {
      const patch = result.docGuardResult.mergePatch;
      suggestions.push(`Apply patch: ${patch.operation} to ${patch.targetPath}`);
    }

    // Action suggestions
    for (const action of result.docGuardResult.recommendedActions.slice(0, 3)) {
      suggestions.push(action.action);
    }

    return suggestions.join('\n');
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createDocGuardRule(config?: Partial<DocGuardConfig>): DocGuardRule {
  return new DocGuardRule(config);
}

// ============================================================================
// Firewall Integration Helpers
// ============================================================================

/**
 * Format DocGuard result for display
 */
export function formatDocGuardResult(result: DocGuardResult): string {
  const icon = result.verdict === 'ALLOW' ? '✅' : 
               result.verdict === 'WARN' ? '⚠️' : '❌';
  
  const lines: string[] = [
    `${icon} DocGuard Verdict: ${result.verdict}`,
    `   Reason: ${result.reason}`,
  ];

  // Duplicate info
  if (result.duplicateCheck?.isDuplicate) {
    lines.push('');
    lines.push('📋 Duplicate Detected:');
    for (const match of result.duplicateCheck.matches.slice(0, 3)) {
      lines.push(`   ${Math.round(match.similarity * 100)}% similar to: ${match.path}`);
    }
    if (result.duplicateCheck.canonicalTarget) {
      lines.push(`   Suggested action: Merge into ${result.duplicateCheck.canonicalTarget}`);
    }
  }

  // DocSpec violations
  if (result.docSpec && result.docSpec.violations.length > 0) {
    lines.push('');
    lines.push('📝 DocSpec Violations:');
    for (const v of result.docSpec.violations) {
      const vIcon = v.severity === 'error' ? '❌' : '⚠️';
      lines.push(`   ${vIcon} ${v.message}`);
      if (v.suggestion) {
        lines.push(`      💡 ${v.suggestion}`);
      }
    }
  }

  // Metrics
  if (result.docSpec) {
    const m = result.docSpec.metrics;
    lines.push('');
    lines.push('📊 Metrics:');
    lines.push(`   Words: ${m.wordCount}, Anchors: ${m.anchorCount}, Examples: ${m.exampleCount}`);
    lines.push(`   Fluff ratio: ${(m.fluffRatio * 100).toFixed(1)}%`);
  }

  // Recommended actions
  if (result.recommendedActions.length > 0) {
    lines.push('');
    lines.push('🔧 Recommended Actions:');
    for (const action of result.recommendedActions.slice(0, 5)) {
      const priorityIcon = action.priority === 'high' ? '🔴' : 
                          action.priority === 'medium' ? '🟡' : '🔵';
      lines.push(`   ${priorityIcon} ${action.action}`);
    }
  }

  // Merge patch
  if (result.mergePatch) {
    lines.push('');
    lines.push('📦 Merge Patch Available:');
    lines.push(`   Operation: ${result.mergePatch.operation}`);
    lines.push(`   Target: ${result.mergePatch.targetPath}`);
  }

  return lines.join('\n');
}

/**
 * Check if a file write should be intercepted by DocGuard
 */
export function shouldInterceptDocWrite(filePath: string): boolean {
  // Only intercept .md files
  if (!filePath.endsWith('.md')) return false;

  // Skip common non-doc files
  const skipPatterns = [
    'node_modules',
    'dist',
    '.git',
    'CHANGELOG.md', // Let changelogs through
    'package.json',
  ];

  return !skipPatterns.some(pattern => filePath.includes(pattern));
}
