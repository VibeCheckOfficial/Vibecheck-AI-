/**
 * Context Validator
 * 
 * Validates context for freshness, completeness, and relevance.
 * Ensures context provided to AI is up-to-date and comprehensive.
 */

import * as fs from 'fs/promises';
import * as path from 'path';

export interface ValidationResult {
  valid: boolean;
  score: number;
  freshness: FreshnessResult;
  completeness: CompletenessResult;
  relevance: RelevanceResult;
  recommendations: string[];
}

export interface FreshnessResult {
  fresh: boolean;
  staleSources: StalenessInfo[];
  oldestSource?: string;
  oldestAge?: number;
}

export interface StalenessInfo {
  source: string;
  lastModified: Date;
  ageMs: number;
  threshold: number;
  reason: string;
}

export interface CompletenessResult {
  complete: boolean;
  missingSections: string[];
  partialSections: PartialSection[];
  coveragePercent: number;
}

export interface PartialSection {
  name: string;
  itemCount: number;
  expectedMin: number;
  reason: string;
}

export interface RelevanceResult {
  relevant: boolean;
  irrelevantSections: string[];
  missingRelevantSections: string[];
  relevanceScore: number;
}

export interface ValidatorConfig {
  projectRoot: string;
  truthpackPath: string;
  freshnessThresholds: Record<string, number>;
  requiredSections: string[];
  minimumCoverage: number;
}

const DEFAULT_CONFIG: ValidatorConfig = {
  projectRoot: process.cwd(),
  truthpackPath: '.vibecheck/truthpack',
  freshnessThresholds: {
    routes: 24 * 60 * 60 * 1000, // 24 hours
    env: 7 * 24 * 60 * 60 * 1000, // 7 days
    auth: 24 * 60 * 60 * 1000, // 24 hours
    contracts: 24 * 60 * 60 * 1000, // 24 hours
  },
  requiredSections: ['routes', 'env'],
  minimumCoverage: 70,
};

export class ContextValidator {
  private config: ValidatorConfig;

  constructor(config: Partial<ValidatorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Validate all context sources
   */
  async validate(taskContext?: string[]): Promise<ValidationResult> {
    const [freshness, completeness] = await Promise.all([
      this.checkFreshness(),
      this.checkCompleteness(),
    ]);

    const relevance = this.checkRelevance(taskContext || []);
    const recommendations = this.generateRecommendations(freshness, completeness, relevance);

    const score = this.calculateScore(freshness, completeness, relevance);
    const valid = score >= 60 && freshness.fresh && completeness.complete;

    return {
      valid,
      score,
      freshness,
      completeness,
      relevance,
      recommendations,
    };
  }

  /**
   * Check freshness of truthpack data
   */
  async checkFreshness(): Promise<FreshnessResult> {
    const staleSources: StalenessInfo[] = [];
    let oldestSource: string | undefined;
    let oldestAge = 0;
    const now = Date.now();

    const sections = Object.keys(this.config.freshnessThresholds);
    
    for (const section of sections) {
      const filePath = path.join(
        this.config.projectRoot,
        this.config.truthpackPath,
        `${section}.json`
      );

      try {
        const stat = await fs.stat(filePath);
        const ageMs = now - stat.mtime.getTime();
        const threshold = this.config.freshnessThresholds[section];

        if (ageMs > threshold) {
          staleSources.push({
            source: section,
            lastModified: stat.mtime,
            ageMs,
            threshold,
            reason: `${section} is ${this.formatAge(ageMs)} old (threshold: ${this.formatAge(threshold)})`,
          });
        }

        if (ageMs > oldestAge) {
          oldestAge = ageMs;
          oldestSource = section;
        }
      } catch {
        // File doesn't exist - will be caught in completeness check
      }
    }

    return {
      fresh: staleSources.length === 0,
      staleSources,
      oldestSource,
      oldestAge: oldestAge > 0 ? oldestAge : undefined,
    };
  }

  /**
   * Check completeness of truthpack data
   */
  async checkCompleteness(): Promise<CompletenessResult> {
    const missingSections: string[] = [];
    const partialSections: PartialSection[] = [];
    let availableSections = 0;
    const totalExpected = this.config.requiredSections.length;

    for (const section of this.config.requiredSections) {
      const filePath = path.join(
        this.config.projectRoot,
        this.config.truthpackPath,
        `${section}.json`
      );

      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const data = JSON.parse(content);
        availableSections++;

        // Check if section has meaningful data
        const itemCount = this.countItems(data, section);
        const expectedMin = this.getExpectedMinimum(section);

        if (itemCount < expectedMin) {
          partialSections.push({
            name: section,
            itemCount,
            expectedMin,
            reason: `${section} has only ${itemCount} items (expected at least ${expectedMin})`,
          });
        }
      } catch {
        missingSections.push(section);
      }
    }

    const coveragePercent = totalExpected > 0 
      ? Math.round((availableSections / totalExpected) * 100) 
      : 0;

    return {
      complete: missingSections.length === 0 && partialSections.length === 0,
      missingSections,
      partialSections,
      coveragePercent,
    };
  }

  /**
   * Check relevance of context for a task
   */
  checkRelevance(taskContext: string[]): RelevanceResult {
    if (taskContext.length === 0) {
      return {
        relevant: true,
        irrelevantSections: [],
        missingRelevantSections: [],
        relevanceScore: 100,
      };
    }

    const irrelevantSections: string[] = [];
    const missingRelevantSections: string[] = [];

    // Determine what context is needed based on task keywords
    const neededSections = new Set<string>();
    
    for (const ctx of taskContext) {
      const lower = ctx.toLowerCase();
      
      if (/api|route|endpoint|fetch/.test(lower)) {
        neededSections.add('routes');
      }
      if (/env|config|setting/.test(lower)) {
        neededSections.add('env');
      }
      if (/auth|login|permission|role/.test(lower)) {
        neededSections.add('auth');
      }
      if (/type|schema|contract|interface/.test(lower)) {
        neededSections.add('contracts');
      }
    }

    // Check for missing relevant sections
    for (const section of neededSections) {
      if (!this.config.requiredSections.includes(section)) {
        missingRelevantSections.push(section);
      }
    }

    // Calculate relevance score
    const relevanceScore = neededSections.size > 0
      ? Math.round(((neededSections.size - missingRelevantSections.length) / neededSections.size) * 100)
      : 100;

    return {
      relevant: missingRelevantSections.length === 0,
      irrelevantSections,
      missingRelevantSections,
      relevanceScore,
    };
  }

  /**
   * Validate a specific section
   */
  async validateSection(section: string): Promise<{
    exists: boolean;
    fresh: boolean;
    complete: boolean;
    itemCount: number;
    lastModified?: Date;
  }> {
    const filePath = path.join(
      this.config.projectRoot,
      this.config.truthpackPath,
      `${section}.json`
    );

    try {
      const stat = await fs.stat(filePath);
      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content);
      
      const ageMs = Date.now() - stat.mtime.getTime();
      const threshold = this.config.freshnessThresholds[section] ?? 24 * 60 * 60 * 1000;
      const itemCount = this.countItems(data, section);
      const expectedMin = this.getExpectedMinimum(section);

      return {
        exists: true,
        fresh: ageMs <= threshold,
        complete: itemCount >= expectedMin,
        itemCount,
        lastModified: stat.mtime,
      };
    } catch {
      return {
        exists: false,
        fresh: false,
        complete: false,
        itemCount: 0,
      };
    }
  }

  /**
   * Get sections that need refresh
   */
  async getSectionsNeedingRefresh(): Promise<string[]> {
    const sections: string[] = [];
    const freshness = await this.checkFreshness();
    
    for (const stale of freshness.staleSources) {
      sections.push(stale.source);
    }

    const completeness = await this.checkCompleteness();
    for (const missing of completeness.missingSections) {
      if (!sections.includes(missing)) {
        sections.push(missing);
      }
    }

    return sections;
  }

  private countItems(data: unknown, section: string): number {
    if (!data || typeof data !== 'object') return 0;

    const itemArrays: Record<string, string> = {
      routes: 'routes',
      env: 'variables',
      auth: 'roles',
      contracts: 'contracts',
    };

    const arrayKey = itemArrays[section];
    if (arrayKey && arrayKey in (data as Record<string, unknown>)) {
      const arr = (data as Record<string, unknown>)[arrayKey];
      return Array.isArray(arr) ? arr.length : 0;
    }

    return Object.keys(data as object).length;
  }

  private getExpectedMinimum(section: string): number {
    const minimums: Record<string, number> = {
      routes: 1,
      env: 1,
      auth: 0, // Auth may legitimately be empty
      contracts: 0, // Contracts may not exist yet
    };

    return minimums[section] ?? 0;
  }

  private formatAge(ms: number): string {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days} day${days > 1 ? 's' : ''}`;
    }
    if (hours > 0) {
      return `${hours} hour${hours > 1 ? 's' : ''}`;
    }
    return 'less than an hour';
  }

  private generateRecommendations(
    freshness: FreshnessResult,
    completeness: CompletenessResult,
    relevance: RelevanceResult
  ): string[] {
    const recommendations: string[] = [];

    if (!freshness.fresh) {
      const staleNames = freshness.staleSources.map(s => s.source).join(', ');
      recommendations.push(`Refresh stale truthpack sections: ${staleNames}`);
    }

    if (completeness.missingSections.length > 0) {
      recommendations.push(`Generate missing truthpack sections: ${completeness.missingSections.join(', ')}`);
    }

    if (completeness.partialSections.length > 0) {
      for (const partial of completeness.partialSections) {
        recommendations.push(`Expand ${partial.name} section (${partial.reason})`);
      }
    }

    if (relevance.missingRelevantSections.length > 0) {
      recommendations.push(`Add relevant context sections: ${relevance.missingRelevantSections.join(', ')}`);
    }

    if (recommendations.length === 0) {
      recommendations.push('Context is valid and up-to-date');
    }

    return recommendations;
  }

  private calculateScore(
    freshness: FreshnessResult,
    completeness: CompletenessResult,
    relevance: RelevanceResult
  ): number {
    let score = 100;

    // Freshness: up to -30 points
    const freshnessWeight = Math.min(freshness.staleSources.length * 10, 30);
    score -= freshnessWeight;

    // Completeness: up to -40 points
    const missingWeight = completeness.missingSections.length * 15;
    const partialWeight = completeness.partialSections.length * 5;
    score -= Math.min(missingWeight + partialWeight, 40);

    // Relevance: up to -30 points
    const relevanceWeight = relevance.missingRelevantSections.length * 10;
    score -= Math.min(relevanceWeight, 30);

    return Math.max(0, score);
  }
}
