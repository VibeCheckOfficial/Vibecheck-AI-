/**
 * Mission Grouper
 * 
 * Groups findings into actionable missions based on:
 * - File proximity
 * - Category (auth, routes, env)
 * - Impact (ship blockers first)
 * - Fix confidence
 * 
 * @module missions/mission-grouper
 */

import { randomUUID } from 'node:crypto';
import type {
  FixMission,
  MissionStep,
  MissionProof,
  MissionPayoffLabel,
  MissionImpact,
  MissionFinding,
  MissionGroupingOptions,
  MissionsSummary,
} from '@repo/shared-types';

// ============================================================================
// Constants
// ============================================================================

/**
 * Category to payoff label mapping
 */
const CATEGORY_PAYOFF_MAP: Record<string, MissionPayoffLabel> = {
  ghost_route: 'Stop Ghost Routes',
  ghost_env: 'Fix Env Drift',
  auth_drift: 'Secure Auth',
  contract_violation: 'Align Contracts',
  env_missing: 'Fix Env Drift',
  security_issue: 'Prevent Prod Crash',
  code_quality: 'Clean Codebase',
};

/**
 * Severity to impact mapping
 */
const SEVERITY_IMPACT_MAP: Record<string, MissionImpact> = {
  error: 'critical',
  warning: 'high',
  info: 'low',
};

/**
 * Why it matters templates
 */
const WHY_IT_MATTERS: Record<MissionPayoffLabel, string> = {
  'Unblock Ship': 'These issues are blocking your deployment and must be resolved before shipping.',
  'Prevent Prod Crash': 'These issues could cause production failures or security vulnerabilities.',
  'Stop Ghost Routes': 'These routes exist in code but not in your truthpack, causing 404s in production.',
  'Secure Auth': 'These auth gaps could allow unauthorized access to protected resources.',
  'Fix Env Drift': 'These environment variable issues could cause runtime failures.',
  'Align Contracts': 'These API contracts don\'t match implementation, breaking integrations.',
  'Clean Codebase': 'These code quality issues affect maintainability and reliability.',
};

// ============================================================================
// Mission Grouper Class
// ============================================================================

/**
 * Groups findings into missions
 */
export class MissionGrouper {
  private options: MissionGroupingOptions;

  constructor(options: Partial<MissionGroupingOptions> = {}) {
    this.options = {
      maxFindingsPerMission: options.maxFindingsPerMission ?? 10,
      minConfidence: options.minConfidence ?? 0.5,
      groupByFile: options.groupByFile ?? true,
      groupByCategory: options.groupByCategory ?? true,
      prioritizeBlockers: options.prioritizeBlockers ?? true,
    };
  }

  /**
   * Group findings into missions
   */
  group(findings: MissionFinding[]): FixMission[] {
    // Filter to auto-fixable findings
    const fixableFindings = findings.filter(f => f.autoFixable);

    if (fixableFindings.length === 0) {
      return [];
    }

    // Sort findings by priority
    const sortedFindings = this.sortByPriority(fixableFindings);

    // Group findings
    const groups = this.groupFindings(sortedFindings);

    // Convert groups to missions
    return groups.map(group => this.createMission(group));
  }

  /**
   * Sort findings by priority
   */
  private sortByPriority(findings: MissionFinding[]): MissionFinding[] {
    return [...findings].sort((a, b) => {
      // Errors before warnings before info
      const severityOrder = { error: 0, warning: 1, info: 2 };
      const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (severityDiff !== 0) return severityDiff;

      // Group by category
      if (a.category !== b.category) {
        return a.category.localeCompare(b.category);
      }

      // Group by file
      if (a.file && b.file && a.file !== b.file) {
        return a.file.localeCompare(b.file);
      }

      return 0;
    });
  }

  /**
   * Group findings into logical groups
   */
  private groupFindings(findings: MissionFinding[]): MissionFinding[][] {
    const groups: MissionFinding[][] = [];
    const used = new Set<string>();

    for (const finding of findings) {
      if (used.has(finding.id)) continue;

      // Start a new group
      const group: MissionFinding[] = [finding];
      used.add(finding.id);

      // Find related findings
      for (const other of findings) {
        if (used.has(other.id)) continue;
        if (group.length >= this.options.maxFindingsPerMission) break;

        if (this.areRelated(finding, other)) {
          group.push(other);
          used.add(other.id);
        }
      }

      groups.push(group);
    }

    return groups;
  }

  /**
   * Check if two findings are related
   */
  private areRelated(a: MissionFinding, b: MissionFinding): boolean {
    // Same category
    if (this.options.groupByCategory && a.category === b.category) {
      return true;
    }

    // Same file
    if (this.options.groupByFile && a.file && b.file) {
      if (a.file === b.file) return true;

      // Same directory
      const dirA = a.file.split('/').slice(0, -1).join('/');
      const dirB = b.file.split('/').slice(0, -1).join('/');
      if (dirA === dirB && dirA.length > 0) return true;
    }

    return false;
  }

  /**
   * Create a mission from a group of findings
   */
  private createMission(findings: MissionFinding[]): FixMission {
    const id = `mission_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const now = new Date().toISOString();

    // Determine payoff label based on most common category
    const categoryCount: Record<string, number> = {};
    for (const f of findings) {
      categoryCount[f.category] = (categoryCount[f.category] || 0) + 1;
    }
    const dominantCategory = Object.entries(categoryCount)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 'other';

    const payoffLabel = CATEGORY_PAYOFF_MAP[dominantCategory] || 'Clean Codebase';

    // Determine impact based on highest severity
    const hasError = findings.some(f => f.severity === 'error');
    const hasWarning = findings.some(f => f.severity === 'warning');
    const impact: MissionImpact = hasError ? 'critical' : hasWarning ? 'high' : 'medium';

    // Generate name
    const name = this.generateMissionName(findings, payoffLabel);

    // Generate description
    const description = this.generateDescription(findings, dominantCategory);

    // Create steps
    const steps = this.createSteps(findings);

    // Calculate confidence
    const confidence = this.calculateConfidence(findings);

    // Estimate time
    const estimatedMinutes = Math.ceil(findings.length * 2);

    // Create proof structure
    const proof: MissionProof = {
      verificationCommand: this.generateVerificationCommand(dominantCategory),
      verified: false,
    };

    return {
      id,
      name,
      payoffLabel,
      description,
      impact,
      status: 'pending',
      whyItMatters: WHY_IT_MATTERS[payoffLabel],
      findingIds: findings.map(f => f.id),
      findingCount: findings.length,
      steps,
      proof,
      estimatedMinutes,
      confidence,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Generate mission name
   */
  private generateMissionName(findings: MissionFinding[], payoffLabel: MissionPayoffLabel): string {
    const count = findings.length;
    const firstFile = findings[0]?.file;

    if (payoffLabel === 'Stop Ghost Routes') {
      return `Fix ${count} Ghost Route${count > 1 ? 's' : ''}`;
    }

    if (payoffLabel === 'Secure Auth') {
      return `Secure ${count} Auth Gap${count > 1 ? 's' : ''}`;
    }

    if (payoffLabel === 'Fix Env Drift') {
      return `Fix ${count} Env Issue${count > 1 ? 's' : ''}`;
    }

    if (firstFile) {
      const fileName = firstFile.split('/').pop();
      return `Fix ${count} issue${count > 1 ? 's' : ''} in ${fileName}`;
    }

    return `Fix ${count} issue${count > 1 ? 's' : ''}`;
  }

  /**
   * Generate mission description
   */
  private generateDescription(findings: MissionFinding[], category: string): string {
    const count = findings.length;
    const files = [...new Set(findings.map(f => f.file).filter(Boolean))];

    let desc = `This mission addresses ${count} ${category.replace(/_/g, ' ')} issue${count > 1 ? 's' : ''}`;

    if (files.length > 0) {
      desc += ` across ${files.length} file${files.length > 1 ? 's' : ''}`;
    }

    desc += '.';

    // Add sample messages
    const samples = findings.slice(0, 3).map(f => f.message);
    if (samples.length > 0) {
      desc += '\n\nIssues include:\n' + samples.map(s => `• ${s}`).join('\n');
      if (findings.length > 3) {
        desc += `\n• ...and ${findings.length - 3} more`;
      }
    }

    return desc;
  }

  /**
   * Create steps from findings
   */
  private createSteps(findings: MissionFinding[]): MissionStep[] {
    return findings.map((finding, index) => ({
      id: `step_${index + 1}`,
      sequence: index + 1,
      file: finding.file || 'unknown',
      line: finding.line,
      description: finding.suggestion || `Fix: ${finding.message}`,
      patch: '', // Will be generated by autofix system
      rollbackId: `rollback_${randomUUID().replace(/-/g, '').slice(0, 8)}`,
      confidence: 0.8, // Default confidence
      applied: false,
    }));
  }

  /**
   * Calculate overall confidence
   */
  private calculateConfidence(findings: MissionFinding[]): number {
    // Higher confidence for well-categorized findings
    let confidence = 0.7;

    // Boost for consistent category
    const categories = new Set(findings.map(f => f.category));
    if (categories.size === 1) {
      confidence += 0.1;
    }

    // Boost for having suggestions
    const withSuggestions = findings.filter(f => f.suggestion).length;
    confidence += (withSuggestions / findings.length) * 0.1;

    // Boost for having file locations
    const withFiles = findings.filter(f => f.file).length;
    confidence += (withFiles / findings.length) * 0.1;

    return Math.min(1, confidence);
  }

  /**
   * Generate verification command
   */
  private generateVerificationCommand(category: string): string {
    switch (category) {
      case 'ghost_route':
        return 'vibecheck check --strict';
      case 'auth_drift':
        return 'vibecheck check && vibecheck ship --reality';
      case 'env_missing':
      case 'ghost_env':
        return 'vibecheck validate';
      case 'contract_violation':
        return 'vibecheck check --contracts';
      default:
        return 'vibecheck check';
    }
  }
}

// ============================================================================
// Summary Generation
// ============================================================================

/**
 * Generate summary from missions
 */
export function generateMissionsSummary(missions: FixMission[]): MissionsSummary {
  const byStatus: Record<string, number> = {
    pending: 0,
    in_progress: 0,
    applied: 0,
    verified: 0,
    rolled_back: 0,
    failed: 0,
  };

  const byImpact: Record<string, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };

  let totalFindings = 0;
  let totalEstimatedMinutes = 0;
  let totalConfidence = 0;

  for (const mission of missions) {
    byStatus[mission.status] = (byStatus[mission.status] || 0) + 1;
    byImpact[mission.impact] = (byImpact[mission.impact] || 0) + 1;
    totalFindings += mission.findingCount;
    totalEstimatedMinutes += mission.estimatedMinutes || 0;
    totalConfidence += mission.confidence;
  }

  return {
    total: missions.length,
    byStatus: byStatus as Record<import('@repo/shared-types').MissionStatus, number>,
    byImpact: byImpact as Record<import('@repo/shared-types').MissionImpact, number>,
    totalFindings,
    totalEstimatedMinutes,
    averageConfidence: missions.length > 0 ? totalConfidence / missions.length : 0,
  };
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a mission grouper
 */
export function createMissionGrouper(options?: Partial<MissionGroupingOptions>): MissionGrouper {
  return new MissionGrouper(options);
}

/**
 * Group findings into missions (convenience function)
 */
export function groupFindingsIntoMissions(
  findings: MissionFinding[],
  options?: Partial<MissionGroupingOptions>
): FixMission[] {
  const grouper = new MissionGrouper(options);
  return grouper.group(findings);
}
