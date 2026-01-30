/**
 * Issue Lifecycle Tracker
 * 
 * Manages issue lifecycle with SonarQube-style states.
 * Uses line hash tracking for persistence across file edits.
 */

import type { 
  IssueFeedback, 
  IssueStatus, 
  LearningConfig,
  FindingWithConfidence 
} from './types.js';
import { 
  DEFAULT_LEARNING_CONFIG, 
  generateLineHash, 
  generateIssueId 
} from './types.js';
import type { LearningStorage } from './storage.js';
import type { ConfidenceCalibrator } from './calibration.js';

interface IssueTrackerOptions {
  /** Storage instance */
  storage: LearningStorage;
  /** Confidence calibrator */
  calibrator: ConfidenceCalibrator;
  /** Project identifier */
  projectId?: string;
  /** Configuration */
  config?: Partial<LearningConfig>;
}

interface Finding {
  ruleId: string;
  file: string;
  line: number;
  lineContent: string;
  message?: string;
  severity?: string;
}

interface TrackedFinding extends Finding {
  issueId: string;
  status: IssueStatus;
  confidence: number;
  calibrated: boolean;
  isNew: boolean;
  feedback?: IssueFeedback;
}

/**
 * Issue Lifecycle Tracker
 * 
 * Tracks issues across scans with states:
 * - Open: Active issue requiring attention
 * - Accepted: Acknowledged but deferred (technical debt)
 * - False Positive: Incorrectly flagged (improves calibration)
 * - Fixed: Auto-detected when issue disappears from scan
 */
export class IssueTracker {
  private storage: LearningStorage;
  private calibrator: ConfidenceCalibrator;
  private projectId: string;
  private config: LearningConfig;
  private currentScanFindings: Map<string, Finding> = new Map();

  constructor(options: IssueTrackerOptions) {
    this.storage = options.storage;
    this.calibrator = options.calibrator;
    this.projectId = options.projectId ?? 'default';
    this.config = { ...DEFAULT_LEARNING_CONFIG, ...options.config };
  }

  /**
   * Track a finding from the current scan
   */
  async trackFinding(finding: Finding): Promise<TrackedFinding> {
    const lineHash = generateLineHash(finding.lineContent);
    const issueId = generateIssueId(finding.ruleId, finding.file, lineHash);

    // Store for end-of-scan processing
    this.currentScanFindings.set(issueId, finding);

    // Check for existing feedback
    const existingFeedback = await this.storage.getFeedbackByLineHash(
      finding.ruleId,
      finding.file,
      lineHash
    );

    // Get calibrated confidence
    const calibratedConfidence = await this.calibrator.calibrateFinding(
      finding,
      finding.ruleId
    );

    if (existingFeedback) {
      // Update existing issue if it was marked as fixed but reappeared
      if (existingFeedback.status === 'fixed') {
        existingFeedback.status = 'open';
        existingFeedback.updatedAt = Date.now();
        await this.storage.saveFeedback(existingFeedback);
      }

      return {
        ...finding,
        issueId,
        status: existingFeedback.status,
        confidence: calibratedConfidence.confidence,
        calibrated: calibratedConfidence.calibrated,
        isNew: false,
        feedback: existingFeedback,
      };
    }

    // New issue - create feedback entry
    const newFeedback: IssueFeedback = {
      id: issueId,
      ruleId: finding.ruleId,
      filePath: finding.file,
      lineHash,
      originalLine: finding.line,
      status: 'open',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      projectId: this.projectId,
    };

    await this.storage.saveFeedback(newFeedback);

    return {
      ...finding,
      issueId,
      status: 'open',
      confidence: calibratedConfidence.confidence,
      calibrated: calibratedConfidence.calibrated,
      isNew: true,
      feedback: newFeedback,
    };
  }

  /**
   * Track multiple findings from a scan
   */
  async trackFindings(findings: Finding[]): Promise<TrackedFinding[]> {
    const tracked: TrackedFinding[] = [];

    for (const finding of findings) {
      const result = await this.trackFinding(finding);
      tracked.push(result);
    }

    return tracked;
  }

  /**
   * Mark a finding as confirmed (true positive)
   * Updates calibration to increase confidence
   */
  async confirmFinding(issueId: string, reason?: string): Promise<boolean> {
    const feedback = await this.storage.getFeedback(issueId);
    if (!feedback) return false;

    // Update status
    await this.storage.updateFeedbackStatus(issueId, 'open', reason);

    // Update calibration
    await this.calibrator.confirmFinding(feedback.ruleId);

    return true;
  }

  /**
   * Mark a finding as false positive
   * Updates calibration to decrease confidence
   */
  async markFalsePositive(issueId: string, reason?: string): Promise<boolean> {
    const feedback = await this.storage.getFeedback(issueId);
    if (!feedback) return false;

    // Update status
    await this.storage.updateFeedbackStatus(issueId, 'false_positive', reason);

    // Update calibration
    await this.calibrator.markFalsePositive(feedback.ruleId);

    return true;
  }

  /**
   * Accept a finding (acknowledge as technical debt)
   */
  async acceptFinding(issueId: string, reason?: string): Promise<boolean> {
    return this.storage.updateFeedbackStatus(issueId, 'accepted', reason);
  }

  /**
   * Reopen a finding (change from accepted/false_positive back to open)
   */
  async reopenFinding(issueId: string, reason?: string): Promise<boolean> {
    return this.storage.updateFeedbackStatus(issueId, 'open', reason);
  }

  /**
   * Finalize scan and detect fixed issues
   * Call this after all findings from a scan have been tracked
   */
  async finalizeScan(): Promise<{
    newIssues: number;
    fixedIssues: number;
    openIssues: number;
  }> {
    // Get all open issues for this project
    const openIssues = await this.storage.queryFeedback({
      projectId: this.projectId,
      status: 'open',
    });

    let fixedCount = 0;
    let newCount = 0;
    let stillOpenCount = 0;

    for (const issue of openIssues) {
      const stillExists = this.currentScanFindings.has(issue.id);

      if (!stillExists) {
        // Issue no longer appears in scan - mark as fixed
        await this.storage.updateFeedbackStatus(issue.id, 'fixed');
        fixedCount++;
      } else {
        stillOpenCount++;
      }
    }

    // Count new issues (those that weren't in previous scans)
    for (const [issueId] of this.currentScanFindings) {
      const existing = await this.storage.getFeedback(issueId);
      if (!existing || existing.status === 'fixed') {
        newCount++;
      }
    }

    // Clear current scan findings for next scan
    this.currentScanFindings.clear();

    return {
      newIssues: newCount,
      fixedIssues: fixedCount,
      openIssues: stillOpenCount,
    };
  }

  /**
   * Get issue summary for a file
   */
  async getFileSummary(filePath: string): Promise<{
    total: number;
    byStatus: Record<IssueStatus, number>;
    issues: IssueFeedback[];
  }> {
    const issues = await this.storage.queryFeedback({ filePath });

    const byStatus: Record<IssueStatus, number> = {
      open: 0,
      accepted: 0,
      false_positive: 0,
      fixed: 0,
    };

    for (const issue of issues) {
      byStatus[issue.status]++;
    }

    return {
      total: issues.length,
      byStatus,
      issues,
    };
  }

  /**
   * Get all open issues
   */
  async getOpenIssues(): Promise<IssueFeedback[]> {
    return this.storage.queryFeedback({ status: 'open' });
  }

  /**
   * Get all false positives
   */
  async getFalsePositives(): Promise<IssueFeedback[]> {
    return this.storage.queryFeedback({ status: 'false_positive' });
  }

  /**
   * Get all accepted issues (technical debt)
   */
  async getAcceptedIssues(): Promise<IssueFeedback[]> {
    return this.storage.queryFeedback({ status: 'accepted' });
  }

  /**
   * Check if a finding should be suppressed based on feedback
   */
  async shouldSuppress(
    ruleId: string,
    filePath: string,
    lineContent: string
  ): Promise<boolean> {
    const lineHash = generateLineHash(lineContent);
    const feedback = await this.storage.getFeedbackByLineHash(ruleId, filePath, lineHash);

    if (!feedback) return false;

    // Suppress false positives and accepted issues
    return feedback.status === 'false_positive' || feedback.status === 'accepted';
  }

  /**
   * Filter findings based on feedback status
   * Removes false positives and optionally accepted issues
   */
  async filterFindings<T extends Finding>(
    findings: T[],
    options?: { includedAccepted?: boolean }
  ): Promise<T[]> {
    const includeAccepted = options?.includedAccepted ?? false;
    const filtered: T[] = [];

    for (const finding of findings) {
      const shouldSuppress = await this.shouldSuppress(
        finding.ruleId,
        finding.file,
        finding.lineContent
      );

      if (shouldSuppress) {
        const lineHash = generateLineHash(finding.lineContent);
        const feedback = await this.storage.getFeedbackByLineHash(
          finding.ruleId,
          finding.file,
          lineHash
        );

        // Include accepted issues if requested
        if (includeAccepted && feedback?.status === 'accepted') {
          filtered.push(finding);
        }
        // Skip false positives
        continue;
      }

      filtered.push(finding);
    }

    return filtered;
  }

  /**
   * Get issue history for a specific finding
   */
  async getIssueHistory(issueId: string): Promise<IssueFeedback | undefined> {
    return this.storage.getFeedback(issueId);
  }
}

/**
 * Create an issue tracker instance
 */
export function createIssueTracker(
  storage: LearningStorage,
  calibrator: ConfidenceCalibrator,
  options?: {
    projectId?: string;
    config?: Partial<LearningConfig>;
  }
): IssueTracker {
  return new IssueTracker({
    storage,
    calibrator,
    projectId: options?.projectId,
    config: options?.config,
  });
}
