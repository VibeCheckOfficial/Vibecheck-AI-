/**
 * Learning Storage
 * 
 * SQLite-based storage for issue feedback and rule calibration.
 * Supports both global (cross-project) and project-specific databases.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { 
  IssueFeedback, 
  IssueStatus, 
  RuleCalibration, 
  LearningConfig,
  FeedbackStats 
} from './types.js';
import { DEFAULT_LEARNING_CONFIG } from './types.js';

// In-memory fallback when SQLite is not available
interface InMemoryStore {
  feedback: Map<string, IssueFeedback>;
  calibration: Map<string, RuleCalibration>;
}

/**
 * Learning Storage Manager
 * 
 * Provides persistent storage for learning data.
 * Falls back to in-memory storage if SQLite is unavailable.
 */
export class LearningStorage {
  private config: LearningConfig;
  private globalStore: InMemoryStore;
  private projectStore: InMemoryStore;
  private globalDbPath: string;
  private projectDbPath: string;
  private initialized = false;

  constructor(config: Partial<LearningConfig> = {}) {
    this.config = { ...DEFAULT_LEARNING_CONFIG, ...config };
    
    // Resolve paths
    this.globalDbPath = this.resolvePath(this.config.globalDbPath);
    this.projectDbPath = this.resolvePath(this.config.projectDbPath);

    // Initialize in-memory stores
    this.globalStore = { feedback: new Map(), calibration: new Map() };
    this.projectStore = { feedback: new Map(), calibration: new Map() };
  }

  /**
   * Initialize the storage (load existing data)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Load global data
    this.loadFromFile(this.globalDbPath, this.globalStore);
    
    // Load project data
    this.loadFromFile(this.projectDbPath, this.projectStore);

    this.initialized = true;
  }

  /**
   * Save feedback for an issue
   */
  async saveFeedback(feedback: IssueFeedback, scope: 'global' | 'project' = 'project'): Promise<void> {
    await this.initialize();
    
    const store = scope === 'global' ? this.globalStore : this.projectStore;
    const dbPath = scope === 'global' ? this.globalDbPath : this.projectDbPath;

    store.feedback.set(feedback.id, feedback);
    this.saveToFile(dbPath, store);
  }

  /**
   * Get feedback by ID
   */
  async getFeedback(id: string): Promise<IssueFeedback | undefined> {
    await this.initialize();

    // Check project first, then global
    return this.projectStore.feedback.get(id) ?? this.globalStore.feedback.get(id);
  }

  /**
   * Get feedback by rule ID and line hash
   */
  async getFeedbackByLineHash(
    ruleId: string,
    filePath: string,
    lineHash: string
  ): Promise<IssueFeedback | undefined> {
    await this.initialize();

    const searchId = `${ruleId}:${filePath}:${lineHash}`.replace(/[^a-zA-Z0-9:._-]/g, '_');

    // Check project first, then global
    const projectMatch = this.projectStore.feedback.get(searchId);
    if (projectMatch) return projectMatch;

    // For global, search by rule and line hash (file path may differ)
    for (const feedback of this.globalStore.feedback.values()) {
      if (feedback.ruleId === ruleId && feedback.lineHash === lineHash) {
        return feedback;
      }
    }

    return undefined;
  }

  /**
   * Get all feedback matching criteria
   */
  async queryFeedback(criteria: {
    ruleId?: string;
    filePath?: string;
    status?: IssueStatus;
    projectId?: string;
  }): Promise<IssueFeedback[]> {
    await this.initialize();

    const results: IssueFeedback[] = [];
    const allFeedback = [
      ...this.projectStore.feedback.values(),
      ...this.globalStore.feedback.values(),
    ];

    for (const feedback of allFeedback) {
      if (criteria.ruleId && feedback.ruleId !== criteria.ruleId) continue;
      if (criteria.filePath && feedback.filePath !== criteria.filePath) continue;
      if (criteria.status && feedback.status !== criteria.status) continue;
      if (criteria.projectId && feedback.projectId !== criteria.projectId) continue;
      results.push(feedback);
    }

    return results;
  }

  /**
   * Update feedback status
   */
  async updateFeedbackStatus(
    id: string,
    status: IssueStatus,
    reason?: string
  ): Promise<boolean> {
    await this.initialize();

    // Check both stores
    let feedback = this.projectStore.feedback.get(id);
    let store = this.projectStore;
    let dbPath = this.projectDbPath;

    if (!feedback) {
      feedback = this.globalStore.feedback.get(id);
      store = this.globalStore;
      dbPath = this.globalDbPath;
    }

    if (!feedback) return false;

    feedback.status = status;
    feedback.reason = reason ?? feedback.reason;
    feedback.updatedAt = Date.now();

    store.feedback.set(id, feedback);
    this.saveToFile(dbPath, store);

    return true;
  }

  /**
   * Delete feedback
   */
  async deleteFeedback(id: string): Promise<boolean> {
    await this.initialize();

    let deleted = this.projectStore.feedback.delete(id);
    if (deleted) {
      this.saveToFile(this.projectDbPath, this.projectStore);
      return true;
    }

    deleted = this.globalStore.feedback.delete(id);
    if (deleted) {
      this.saveToFile(this.globalDbPath, this.globalStore);
      return true;
    }

    return false;
  }

  /**
   * Get rule calibration data
   */
  async getCalibration(ruleId: string): Promise<RuleCalibration | undefined> {
    await this.initialize();

    // Check project first, then global
    return this.projectStore.calibration.get(ruleId) ?? 
           this.globalStore.calibration.get(ruleId);
  }

  /**
   * Save rule calibration data
   */
  async saveCalibration(
    calibration: RuleCalibration,
    scope: 'global' | 'project' = 'project'
  ): Promise<void> {
    await this.initialize();

    const store = scope === 'global' ? this.globalStore : this.projectStore;
    const dbPath = scope === 'global' ? this.globalDbPath : this.projectDbPath;

    store.calibration.set(calibration.ruleId, calibration);
    this.saveToFile(dbPath, store);
  }

  /**
   * Get all calibration data
   */
  async getAllCalibrations(): Promise<RuleCalibration[]> {
    await this.initialize();

    const calibrations = new Map<string, RuleCalibration>();

    // Global first (can be overridden by project)
    for (const [ruleId, cal] of this.globalStore.calibration) {
      calibrations.set(ruleId, cal);
    }

    // Project overrides
    for (const [ruleId, cal] of this.projectStore.calibration) {
      calibrations.set(ruleId, cal);
    }

    return Array.from(calibrations.values());
  }

  /**
   * Get feedback statistics
   */
  async getStats(): Promise<FeedbackStats> {
    await this.initialize();

    const allFeedback = [
      ...this.projectStore.feedback.values(),
      ...this.globalStore.feedback.values(),
    ];

    const byStatus: Record<IssueStatus, number> = {
      open: 0,
      accepted: 0,
      false_positive: 0,
      fixed: 0,
    };

    const byRule: Record<string, number> = {};

    for (const feedback of allFeedback) {
      byStatus[feedback.status]++;
      byRule[feedback.ruleId] = (byRule[feedback.ruleId] ?? 0) + 1;
    }

    const calibrations = await this.getAllCalibrations();
    const avgConfidence = calibrations.length > 0
      ? calibrations.reduce((sum, c) => sum + c.confidence, 0) / calibrations.length
      : 1.0;

    return {
      totalIssues: allFeedback.length,
      byStatus,
      byRule,
      calibratedRules: calibrations.length,
      averageConfidence: avgConfidence,
    };
  }

  /**
   * Clear all data
   */
  async clear(scope?: 'global' | 'project'): Promise<void> {
    await this.initialize();

    if (!scope || scope === 'project') {
      this.projectStore.feedback.clear();
      this.projectStore.calibration.clear();
      this.saveToFile(this.projectDbPath, this.projectStore);
    }

    if (!scope || scope === 'global') {
      this.globalStore.feedback.clear();
      this.globalStore.calibration.clear();
      this.saveToFile(this.globalDbPath, this.globalStore);
    }
  }

  /**
   * Export data for backup
   */
  async export(): Promise<{
    global: { feedback: IssueFeedback[]; calibration: RuleCalibration[] };
    project: { feedback: IssueFeedback[]; calibration: RuleCalibration[] };
  }> {
    await this.initialize();

    return {
      global: {
        feedback: Array.from(this.globalStore.feedback.values()),
        calibration: Array.from(this.globalStore.calibration.values()),
      },
      project: {
        feedback: Array.from(this.projectStore.feedback.values()),
        calibration: Array.from(this.projectStore.calibration.values()),
      },
    };
  }

  /**
   * Import data from backup
   */
  async import(data: {
    global?: { feedback?: IssueFeedback[]; calibration?: RuleCalibration[] };
    project?: { feedback?: IssueFeedback[]; calibration?: RuleCalibration[] };
  }): Promise<void> {
    await this.initialize();

    if (data.global?.feedback) {
      for (const feedback of data.global.feedback) {
        this.globalStore.feedback.set(feedback.id, feedback);
      }
    }
    if (data.global?.calibration) {
      for (const cal of data.global.calibration) {
        this.globalStore.calibration.set(cal.ruleId, cal);
      }
    }
    this.saveToFile(this.globalDbPath, this.globalStore);

    if (data.project?.feedback) {
      for (const feedback of data.project.feedback) {
        this.projectStore.feedback.set(feedback.id, feedback);
      }
    }
    if (data.project?.calibration) {
      for (const cal of data.project.calibration) {
        this.projectStore.calibration.set(cal.ruleId, cal);
      }
    }
    this.saveToFile(this.projectDbPath, this.projectStore);
  }

  private resolvePath(filePath: string): string {
    if (filePath.startsWith('~')) {
      return path.join(os.homedir(), filePath.slice(1));
    }
    return path.resolve(filePath);
  }

  private loadFromFile(filePath: string, store: InMemoryStore): void {
    try {
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as {
          feedback?: [string, IssueFeedback][];
          calibration?: [string, RuleCalibration][];
        };

        if (data.feedback) {
          store.feedback = new Map(data.feedback);
        }
        if (data.calibration) {
          store.calibration = new Map(data.calibration);
        }
      }
    } catch {
      // Ignore load errors, start with empty store
    }
  }

  private saveToFile(filePath: string, store: InMemoryStore): void {
    try {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const data = {
        feedback: Array.from(store.feedback.entries()),
        calibration: Array.from(store.calibration.entries()),
      };

      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch {
      // Ignore save errors (non-critical)
    }
  }
}

/**
 * Create a learning storage instance
 */
export function createLearningStorage(config?: Partial<LearningConfig>): LearningStorage {
  return new LearningStorage(config);
}
