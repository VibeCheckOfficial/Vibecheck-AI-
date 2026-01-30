/**
 * Confidence Calibrator
 *
 * Ensures that reported confidence scores match actual accuracy.
 * If we say 90% confident, we should be right 90% of the time.
 *
 * This is crucial for building trust - users need to know that
 * confidence scores are meaningful and reliable.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { ClaimType } from '../firewall/claim-extractor.js';
import type {
  CalibrationBucket,
  CalibrationConfig,
  CalibrationDataPoint,
  CalibrationModel,
  DEFAULT_CALIBRATION_CONFIG,
  VerificationSource,
} from './types.js';

const DEFAULT_CONFIG: CalibrationConfig = {
  bucketBoundaries: [0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 1.0],
  minSamplesPerBucket: 10,
  dataPath: '.vibecheck/calibration.json',
  autoSaveInterval: 60000,
};

interface StoredCalibrationData {
  dataPoints: CalibrationDataPoint[];
  model: CalibrationModel | null;
  version: number;
}

/**
 * Confidence Calibrator - Ensures confidence scores are well-calibrated
 */
export class ConfidenceCalibrator {
  private config: CalibrationConfig;
  private dataPoints: CalibrationDataPoint[] = [];
  private model: CalibrationModel | null = null;
  private projectRoot: string;
  private dirty = false;
  private autoSaveTimer: ReturnType<typeof setInterval> | null = null;

  constructor(projectRoot: string, config: Partial<CalibrationConfig> = {}) {
    this.projectRoot = projectRoot;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize the calibrator - loads existing data if available
   */
  async initialize(): Promise<void> {
    await this.load();
    this.startAutoSave();
  }

  /**
   * Record feedback from user verification
   */
  recordFeedback(
    reportedConfidence: number,
    wasCorrect: boolean,
    claimType: ClaimType,
    source: VerificationSource
  ): void {
    this.dataPoints.push({
      reportedConfidence,
      wasCorrect,
      claimType,
      source,
      timestamp: new Date(),
    });

    this.dirty = true;

    // Recalibrate if we have enough new data points
    if (this.dataPoints.length % 50 === 0) {
      this.recalibrate();
    }
  }

  /**
   * Record batch feedback
   */
  recordBatchFeedback(
    feedbacks: Array<{
      reportedConfidence: number;
      wasCorrect: boolean;
      claimType: ClaimType;
      source: VerificationSource;
    }>
  ): void {
    for (const feedback of feedbacks) {
      this.dataPoints.push({
        ...feedback,
        timestamp: new Date(),
      });
    }

    this.dirty = true;
    this.recalibrate();
  }

  /**
   * Calibrate a raw confidence score based on historical data
   */
  calibrate(rawConfidence: number, claimType?: ClaimType, source?: VerificationSource): number {
    if (!this.model || this.model.sampleSize < this.config.minSamplesPerBucket * 3) {
      // Not enough data for calibration, return raw confidence
      return rawConfidence;
    }

    // Find the bucket this confidence falls into
    const bucket = this.model.buckets.find(
      (b) => rawConfidence >= b.minConfidence && rawConfidence < b.maxConfidence
    );

    if (!bucket || bucket.total < this.config.minSamplesPerBucket) {
      return rawConfidence;
    }

    // Apply Platt scaling-inspired adjustment
    // If actual accuracy < reported confidence, reduce it
    // If actual accuracy > reported confidence, increase it
    const adjustment = bucket.actualAccuracy / bucket.midpoint;
    let calibrated = rawConfidence * adjustment;

    // Apply claim-type specific adjustments if available
    if (claimType && this.hasClaimTypeData(claimType)) {
      const typeAccuracy = this.getClaimTypeAccuracy(claimType);
      if (typeAccuracy !== null) {
        // Blend with type-specific accuracy
        calibrated = calibrated * 0.7 + typeAccuracy * rawConfidence * 0.3;
      }
    }

    // Clamp to valid range
    return Math.max(0, Math.min(1, calibrated));
  }

  /**
   * Get the current calibration model
   */
  getModel(): CalibrationModel | null {
    return this.model;
  }

  /**
   * Get calibration statistics
   */
  getStats(): {
    totalDataPoints: number;
    overallAccuracy: number;
    brierScore: number;
    calibrationError: number;
    byClaimType: Record<string, { accuracy: number; count: number }>;
    bySource: Record<string, { accuracy: number; count: number }>;
  } {
    const byClaimType: Record<string, { correct: number; total: number }> = {};
    const bySource: Record<string, { correct: number; total: number }> = {};

    let totalCorrect = 0;
    let brierSum = 0;

    for (const dp of this.dataPoints) {
      if (dp.wasCorrect) totalCorrect++;

      // Brier score: (forecast - outcome)^2
      const outcome = dp.wasCorrect ? 1 : 0;
      brierSum += Math.pow(dp.reportedConfidence - outcome, 2);

      // By claim type
      if (!byClaimType[dp.claimType]) {
        byClaimType[dp.claimType] = { correct: 0, total: 0 };
      }
      byClaimType[dp.claimType].total++;
      if (dp.wasCorrect) byClaimType[dp.claimType].correct++;

      // By source
      if (!bySource[dp.source]) {
        bySource[dp.source] = { correct: 0, total: 0 };
      }
      bySource[dp.source].total++;
      if (dp.wasCorrect) bySource[dp.source].correct++;
    }

    const total = this.dataPoints.length;
    const overallAccuracy = total > 0 ? totalCorrect / total : 0;
    const brierScore = total > 0 ? brierSum / total : 0;

    return {
      totalDataPoints: total,
      overallAccuracy,
      brierScore,
      calibrationError: this.model?.calibrationError ?? 0,
      byClaimType: Object.fromEntries(
        Object.entries(byClaimType).map(([type, data]) => [
          type,
          { accuracy: data.total > 0 ? data.correct / data.total : 0, count: data.total },
        ])
      ),
      bySource: Object.fromEntries(
        Object.entries(bySource).map(([source, data]) => [
          source,
          { accuracy: data.total > 0 ? data.correct / data.total : 0, count: data.total },
        ])
      ),
    };
  }

  /**
   * Recalibrate the model based on all data points
   */
  recalibrate(): void {
    if (this.dataPoints.length < this.config.minSamplesPerBucket) {
      return;
    }

    const buckets = this.buildBuckets();
    const brierScore = this.calculateBrierScore();
    const calibrationError = this.calculateExpectedCalibrationError(buckets);
    const overallAccuracy = this.calculateOverallAccuracy();

    this.model = {
      buckets,
      overallAccuracy,
      brier: brierScore,
      calibrationError,
      lastUpdated: new Date(),
      sampleSize: this.dataPoints.length,
    };

    this.dirty = true;
  }

  /**
   * Build calibration buckets from data points
   */
  private buildBuckets(): CalibrationBucket[] {
    const boundaries = this.config.bucketBoundaries;
    const buckets: CalibrationBucket[] = [];

    for (let i = 0; i < boundaries.length - 1; i++) {
      const min = boundaries[i];
      const max = boundaries[i + 1];
      const midpoint = (min + max) / 2;

      const pointsInBucket = this.dataPoints.filter(
        (dp) => dp.reportedConfidence >= min && dp.reportedConfidence < max
      );

      const total = pointsInBucket.length;
      const truePositives = pointsInBucket.filter((dp) => dp.wasCorrect).length;
      const falsePositives = total - truePositives;
      const actualAccuracy = total > 0 ? truePositives / total : 0;

      buckets.push({
        minConfidence: min,
        maxConfidence: max,
        midpoint,
        total,
        truePositives,
        falsePositives,
        actualAccuracy,
      });
    }

    return buckets;
  }

  /**
   * Calculate Brier score (lower is better, 0 is perfect)
   */
  private calculateBrierScore(): number {
    if (this.dataPoints.length === 0) return 1;

    let sum = 0;
    for (const dp of this.dataPoints) {
      const outcome = dp.wasCorrect ? 1 : 0;
      sum += Math.pow(dp.reportedConfidence - outcome, 2);
    }

    return sum / this.dataPoints.length;
  }

  /**
   * Calculate Expected Calibration Error (ECE)
   */
  private calculateExpectedCalibrationError(buckets: CalibrationBucket[]): number {
    const totalSamples = this.dataPoints.length;
    if (totalSamples === 0) return 0;

    let ece = 0;
    for (const bucket of buckets) {
      if (bucket.total === 0) continue;

      const bucketWeight = bucket.total / totalSamples;
      const calibrationGap = Math.abs(bucket.actualAccuracy - bucket.midpoint);
      ece += bucketWeight * calibrationGap;
    }

    return ece;
  }

  /**
   * Calculate overall accuracy
   */
  private calculateOverallAccuracy(): number {
    if (this.dataPoints.length === 0) return 0;

    const correct = this.dataPoints.filter((dp) => dp.wasCorrect).length;
    return correct / this.dataPoints.length;
  }

  /**
   * Check if we have enough data for a specific claim type
   */
  private hasClaimTypeData(claimType: ClaimType): boolean {
    const count = this.dataPoints.filter((dp) => dp.claimType === claimType).length;
    return count >= this.config.minSamplesPerBucket;
  }

  /**
   * Get accuracy for a specific claim type
   */
  private getClaimTypeAccuracy(claimType: ClaimType): number | null {
    const typePoints = this.dataPoints.filter((dp) => dp.claimType === claimType);
    if (typePoints.length < this.config.minSamplesPerBucket) return null;

    const correct = typePoints.filter((dp) => dp.wasCorrect).length;
    return correct / typePoints.length;
  }

  /**
   * Load calibration data from disk
   */
  async load(): Promise<void> {
    const filePath = path.join(this.projectRoot, this.config.dataPath);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content) as StoredCalibrationData;

      this.dataPoints = data.dataPoints.map((dp) => ({
        ...dp,
        timestamp: new Date(dp.timestamp),
      }));

      if (data.model) {
        this.model = {
          ...data.model,
          lastUpdated: new Date(data.model.lastUpdated),
        };
      }
    } catch {
      // File doesn't exist or is invalid, start fresh
      this.dataPoints = [];
      this.model = null;
    }
  }

  /**
   * Save calibration data to disk
   */
  async save(): Promise<void> {
    if (!this.dirty) return;

    const filePath = path.join(this.projectRoot, this.config.dataPath);
    const dir = path.dirname(filePath);

    try {
      await fs.mkdir(dir, { recursive: true });

      const data: StoredCalibrationData = {
        dataPoints: this.dataPoints,
        model: this.model,
        version: 1,
      };

      await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
      this.dirty = false;
    } catch (error) {
      // Log but don't throw - saving calibration data is not critical
      console.warn('Failed to save calibration data:', error);
    }
  }

  /**
   * Start auto-save timer
   */
  private startAutoSave(): void {
    if (this.autoSaveTimer) return;

    this.autoSaveTimer = setInterval(() => {
      this.save().catch(() => {
        // Ignore save errors
      });
    }, this.config.autoSaveInterval);

    // Don't prevent process exit
    if (this.autoSaveTimer.unref) {
      this.autoSaveTimer.unref();
    }
  }

  /**
   * Stop auto-save and save final data
   */
  async dispose(): Promise<void> {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }

    await this.save();
  }

  /**
   * Reset all calibration data
   */
  reset(): void {
    this.dataPoints = [];
    this.model = null;
    this.dirty = true;
  }

  /**
   * Export calibration data for analysis
   */
  exportData(): {
    dataPoints: CalibrationDataPoint[];
    model: CalibrationModel | null;
  } {
    return {
      dataPoints: [...this.dataPoints],
      model: this.model ? { ...this.model } : null,
    };
  }

  /**
   * Generate a calibration report
   */
  generateReport(): string {
    const stats = this.getStats();
    const lines: string[] = [];

    lines.push('╔══════════════════════════════════════════════════════════════╗');
    lines.push('║              CONFIDENCE CALIBRATION REPORT                    ║');
    lines.push('╠══════════════════════════════════════════════════════════════╣');
    lines.push(`║  Total Data Points:     ${stats.totalDataPoints.toString().padStart(8)}                        ║`);
    lines.push(`║  Overall Accuracy:      ${(stats.overallAccuracy * 100).toFixed(1).padStart(7)}%                        ║`);
    lines.push(`║  Brier Score:           ${stats.brierScore.toFixed(4).padStart(8)}  (lower is better)     ║`);
    lines.push(`║  Calibration Error:     ${(stats.calibrationError * 100).toFixed(2).padStart(7)}%                        ║`);
    lines.push('╠══════════════════════════════════════════════════════════════╣');

    if (this.model && this.model.buckets.length > 0) {
      lines.push('║  CALIBRATION BUCKETS                                          ║');
      lines.push('║  Confidence Range    Samples    Actual Accuracy    Gap        ║');
      lines.push('╟──────────────────────────────────────────────────────────────╢');

      for (const bucket of this.model.buckets) {
        const range = `${(bucket.minConfidence * 100).toFixed(0)}-${(bucket.maxConfidence * 100).toFixed(0)}%`;
        const samples = bucket.total.toString();
        const accuracy = bucket.total > 0 ? `${(bucket.actualAccuracy * 100).toFixed(1)}%` : 'N/A';
        const gap = bucket.total > 0
          ? `${((bucket.actualAccuracy - bucket.midpoint) * 100).toFixed(1)}%`
          : 'N/A';

        lines.push(
          `║  ${range.padEnd(16)}   ${samples.padStart(7)}    ${accuracy.padStart(14)}    ${gap.padStart(6)}    ║`
        );
      }
    }

    lines.push('╠══════════════════════════════════════════════════════════════╣');
    lines.push('║  ACCURACY BY CLAIM TYPE                                       ║');
    lines.push('╟──────────────────────────────────────────────────────────────╢');

    for (const [type, data] of Object.entries(stats.byClaimType)) {
      const accuracy = data.count > 0 ? `${(data.accuracy * 100).toFixed(1)}%` : 'N/A';
      lines.push(`║  ${type.padEnd(20)}   ${data.count.toString().padStart(6)} samples   ${accuracy.padStart(7)}      ║`);
    }

    lines.push('╠══════════════════════════════════════════════════════════════╣');
    lines.push('║  ACCURACY BY SOURCE                                           ║');
    lines.push('╟──────────────────────────────────────────────────────────────╢');

    for (const [source, data] of Object.entries(stats.bySource)) {
      const accuracy = data.count > 0 ? `${(data.accuracy * 100).toFixed(1)}%` : 'N/A';
      lines.push(`║  ${source.padEnd(20)}   ${data.count.toString().padStart(6)} samples   ${accuracy.padStart(7)}      ║`);
    }

    lines.push('╚══════════════════════════════════════════════════════════════╝');

    return lines.join('\n');
  }
}

/**
 * Create a singleton calibrator for a project
 */
let globalCalibrator: ConfidenceCalibrator | null = null;

export async function getCalibrator(projectRoot: string): Promise<ConfidenceCalibrator> {
  if (!globalCalibrator || globalCalibrator['projectRoot'] !== projectRoot) {
    globalCalibrator = new ConfidenceCalibrator(projectRoot);
    await globalCalibrator.initialize();
  }
  return globalCalibrator;
}

export function resetGlobalCalibrator(): void {
  if (globalCalibrator) {
    globalCalibrator.dispose().catch(() => {});
    globalCalibrator = null;
  }
}
