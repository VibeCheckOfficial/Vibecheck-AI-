/**
 * Learning System
 * 
 * Provides adaptive learning through user feedback and Bayesian confidence calibration.
 */

export * from './types.js';
export { LearningStorage, createLearningStorage } from './storage.js';
export { ConfidenceCalibrator, createConfidenceCalibrator } from './calibration.js';
export { IssueTracker, createIssueTracker } from './issue-tracker.js';

import { LearningStorage, createLearningStorage } from './storage.js';
import { ConfidenceCalibrator, createConfidenceCalibrator } from './calibration.js';
import { IssueTracker, createIssueTracker } from './issue-tracker.js';
import type { LearningConfig } from './types.js';

interface LearningSystemOptions {
  /** Project identifier */
  projectId?: string;
  /** Configuration */
  config?: Partial<LearningConfig>;
}

/**
 * Learning System
 * 
 * Unified interface for the learning subsystem components.
 */
export class LearningSystem {
  readonly storage: LearningStorage;
  readonly calibrator: ConfidenceCalibrator;
  readonly tracker: IssueTracker;

  private initialized = false;

  constructor(options: LearningSystemOptions = {}) {
    this.storage = createLearningStorage(options.config);
    this.calibrator = createConfidenceCalibrator(this.storage, options.config);
    this.tracker = createIssueTracker(this.storage, this.calibrator, {
      projectId: options.projectId,
      config: options.config,
    });
  }

  /**
   * Initialize the learning system
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.storage.initialize();
    this.initialized = true;
  }

  /**
   * Get confidence for a rule
   */
  async getConfidence(ruleId: string): Promise<number> {
    await this.initialize();
    return this.calibrator.getConfidence(ruleId);
  }

  /**
   * Track a finding and return enhanced metadata
   */
  async trackFinding(finding: {
    ruleId: string;
    file: string;
    line: number;
    lineContent: string;
    message?: string;
    severity?: string;
  }): Promise<{
    issueId: string;
    status: string;
    confidence: number;
    calibrated: boolean;
    isNew: boolean;
  }> {
    await this.initialize();
    return this.tracker.trackFinding(finding);
  }

  /**
   * Record feedback for a finding
   */
  async recordFeedback(
    issueId: string,
    feedback: 'confirm' | 'false_positive' | 'accept',
    reason?: string
  ): Promise<boolean> {
    await this.initialize();

    switch (feedback) {
      case 'confirm':
        return this.tracker.confirmFinding(issueId, reason);
      case 'false_positive':
        return this.tracker.markFalsePositive(issueId, reason);
      case 'accept':
        return this.tracker.acceptFinding(issueId, reason);
      default:
        return false;
    }
  }

  /**
   * Check if a finding should be suppressed
   */
  async shouldSuppress(
    ruleId: string,
    filePath: string,
    lineContent: string
  ): Promise<boolean> {
    await this.initialize();
    return this.tracker.shouldSuppress(ruleId, filePath, lineContent);
  }

  /**
   * Finalize a scan and detect fixed issues
   */
  async finalizeScan(): Promise<{
    newIssues: number;
    fixedIssues: number;
    openIssues: number;
  }> {
    await this.initialize();
    return this.tracker.finalizeScan();
  }

  /**
   * Get statistics
   */
  async getStats(): Promise<{
    totalIssues: number;
    byStatus: Record<string, number>;
    calibratedRules: number;
    averageConfidence: number;
  }> {
    await this.initialize();
    return this.storage.getStats();
  }

  /**
   * Export data for backup
   */
  async export(): Promise<unknown> {
    await this.initialize();
    return this.storage.export();
  }

  /**
   * Import data from backup
   */
  async import(data: unknown): Promise<void> {
    await this.initialize();
    await this.storage.import(data as Parameters<LearningStorage['import']>[0]);
  }

  /**
   * Clear all learning data
   */
  async clear(scope?: 'global' | 'project'): Promise<void> {
    await this.initialize();
    await this.storage.clear(scope);
    this.calibrator.clearCache();
  }
}

// Global learning system instance
let globalLearningSystem: LearningSystem | null = null;

/**
 * Get or create the global learning system
 */
export function getLearningSystem(options?: LearningSystemOptions): LearningSystem {
  if (!globalLearningSystem) {
    globalLearningSystem = new LearningSystem(options);
  }
  return globalLearningSystem;
}

/**
 * Create a new learning system instance
 */
export function createLearningSystem(options?: LearningSystemOptions): LearningSystem {
  return new LearningSystem(options);
}

/**
 * Reset the global learning system
 */
export function resetLearningSystem(): void {
  globalLearningSystem = null;
}
