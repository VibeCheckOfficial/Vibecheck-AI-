/**
 * Bayesian Confidence Calibration
 * 
 * Implements Beta-Binomial model for calibrating rule confidence
 * based on user feedback (confirmed findings vs false positives).
 */

import type { 
  RuleCalibration, 
  LearningConfig, 
  FindingWithConfidence 
} from './types.js';
import { DEFAULT_LEARNING_CONFIG } from './types.js';
import type { LearningStorage } from './storage.js';

interface CalibrationOptions {
  /** Storage instance for persisting calibration data */
  storage: LearningStorage;
  /** Configuration */
  config?: Partial<LearningConfig>;
}

/**
 * Bayesian Confidence Calibrator
 * 
 * Uses Beta-Binomial conjugate prior model:
 * - Prior: Beta(alpha, beta) - typically Beta(1, 1) = Uniform
 * - Likelihood: Binomial (confirmed vs false positive)
 * - Posterior: Beta(alpha + confirmed, beta + false_positive)
 * - Confidence: Posterior mean = alpha / (alpha + beta)
 */
export class ConfidenceCalibrator {
  private storage: LearningStorage;
  private config: LearningConfig;
  private calibrationCache: Map<string, RuleCalibration> = new Map();

  constructor(options: CalibrationOptions) {
    this.storage = options.storage;
    this.config = { ...DEFAULT_LEARNING_CONFIG, ...options.config };
  }

  /**
   * Record a confirmed finding (increments alpha)
   */
  async confirmFinding(ruleId: string): Promise<RuleCalibration> {
    const calibration = await this.getOrCreateCalibration(ruleId);
    
    calibration.alpha += 1;
    calibration.totalFeedback += 1;
    calibration.confidence = this.calculateConfidence(calibration.alpha, calibration.beta);
    calibration.lastUpdated = Date.now();

    await this.storage.saveCalibration(calibration);
    this.calibrationCache.set(ruleId, calibration);

    return calibration;
  }

  /**
   * Record a false positive (increments beta)
   */
  async markFalsePositive(ruleId: string): Promise<RuleCalibration> {
    const calibration = await this.getOrCreateCalibration(ruleId);
    
    calibration.beta += 1;
    calibration.totalFeedback += 1;
    calibration.confidence = this.calculateConfidence(calibration.alpha, calibration.beta);
    calibration.lastUpdated = Date.now();

    await this.storage.saveCalibration(calibration);
    this.calibrationCache.set(ruleId, calibration);

    return calibration;
  }

  /**
   * Get the confidence score for a rule
   */
  async getConfidence(ruleId: string): Promise<number> {
    // Check cache first
    const cached = this.calibrationCache.get(ruleId);
    if (cached) {
      return cached.confidence;
    }

    const calibration = await this.storage.getCalibration(ruleId);
    if (calibration) {
      this.calibrationCache.set(ruleId, calibration);
      return calibration.confidence;
    }

    // No calibration data, return default confidence
    return this.calculateConfidence(this.config.priorAlpha, this.config.priorBeta);
  }

  /**
   * Get calibration data for a rule
   */
  async getCalibration(ruleId: string): Promise<RuleCalibration | undefined> {
    // Check cache first
    const cached = this.calibrationCache.get(ruleId);
    if (cached) return cached;

    const calibration = await this.storage.getCalibration(ruleId);
    if (calibration) {
      this.calibrationCache.set(ruleId, calibration);
    }
    return calibration;
  }

  /**
   * Apply confidence calibration to a finding
   */
  async calibrateFinding<T>(
    finding: T,
    ruleId: string
  ): Promise<FindingWithConfidence> {
    const calibration = await this.getCalibration(ruleId);
    
    const isCalibrated = calibration !== undefined && 
      calibration.totalFeedback >= this.config.minFeedbackThreshold;

    const confidence = isCalibrated
      ? calibration.confidence
      : this.calculateConfidence(this.config.priorAlpha, this.config.priorBeta);

    return {
      finding,
      confidence,
      calibrated: isCalibrated,
    };
  }

  /**
   * Batch calibrate multiple findings
   */
  async calibrateFindings<T extends { ruleId?: string }>(
    findings: T[]
  ): Promise<FindingWithConfidence[]> {
    const results: FindingWithConfidence[] = [];

    for (const finding of findings) {
      const ruleId = finding.ruleId ?? 'unknown';
      const calibrated = await this.calibrateFinding(finding, ruleId);
      results.push(calibrated);
    }

    return results;
  }

  /**
   * Get confidence interval (Bayesian credible interval)
   */
  getCredibleInterval(
    ruleId: string,
    level: number = 0.95
  ): { lower: number; upper: number } {
    const cached = this.calibrationCache.get(ruleId);
    const alpha = cached?.alpha ?? this.config.priorAlpha;
    const beta = cached?.beta ?? this.config.priorBeta;

    // Approximate credible interval using normal approximation
    const mean = alpha / (alpha + beta);
    const variance = (alpha * beta) / ((alpha + beta) ** 2 * (alpha + beta + 1));
    const std = Math.sqrt(variance);
    
    // Z-score for confidence level
    const z = this.normalQuantile((1 + level) / 2);
    
    return {
      lower: Math.max(0, mean - z * std),
      upper: Math.min(1, mean + z * std),
    };
  }

  /**
   * Reset calibration for a rule (back to prior)
   */
  async resetCalibration(ruleId: string): Promise<void> {
    const calibration = this.createDefaultCalibration(ruleId);
    await this.storage.saveCalibration(calibration);
    this.calibrationCache.set(ruleId, calibration);
  }

  /**
   * Get all calibration data
   */
  async getAllCalibrations(): Promise<RuleCalibration[]> {
    return this.storage.getAllCalibrations();
  }

  /**
   * Clear calibration cache
   */
  clearCache(): void {
    this.calibrationCache.clear();
  }

  /**
   * Calculate confidence (posterior mean)
   */
  private calculateConfidence(alpha: number, beta: number): number {
    return alpha / (alpha + beta);
  }

  /**
   * Get or create calibration for a rule
   */
  private async getOrCreateCalibration(ruleId: string): Promise<RuleCalibration> {
    const existing = await this.getCalibration(ruleId);
    if (existing) return existing;

    return this.createDefaultCalibration(ruleId);
  }

  /**
   * Create default calibration with prior parameters
   */
  private createDefaultCalibration(ruleId: string): RuleCalibration {
    return {
      ruleId,
      alpha: this.config.priorAlpha,
      beta: this.config.priorBeta,
      confidence: this.calculateConfidence(this.config.priorAlpha, this.config.priorBeta),
      totalFeedback: 0,
      lastUpdated: Date.now(),
    };
  }

  /**
   * Approximate normal quantile function (inverse CDF)
   * Uses Abramowitz and Stegun approximation
   */
  private normalQuantile(p: number): number {
    if (p <= 0) return -Infinity;
    if (p >= 1) return Infinity;
    if (p === 0.5) return 0;

    const a = [
      -3.969683028665376e1,
      2.209460984245205e2,
      -2.759285104469687e2,
      1.383577518672690e2,
      -3.066479806614716e1,
      2.506628277459239e0,
    ];
    const b = [
      -5.447609879822406e1,
      1.615858368580409e2,
      -1.556989798598866e2,
      6.680131188771972e1,
      -1.328068155288572e1,
    ];
    const c = [
      -7.784894002430293e-3,
      -3.223964580411365e-1,
      -2.400758277161838e0,
      -2.549732539343734e0,
      4.374664141464968e0,
      2.938163982698783e0,
    ];
    const d = [
      7.784695709041462e-3,
      3.224671290700398e-1,
      2.445134137142996e0,
      3.754408661907416e0,
    ];

    const pLow = 0.02425;
    const pHigh = 1 - pLow;

    let q: number;
    let r: number;

    if (p < pLow) {
      q = Math.sqrt(-2 * Math.log(p));
      return (
        (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
        ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
      );
    }

    if (p <= pHigh) {
      q = p - 0.5;
      r = q * q;
      return (
        ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
        (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
      );
    }

    q = Math.sqrt(-2 * Math.log(1 - p));
    return (
      -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
}

/**
 * Create a confidence calibrator instance
 */
export function createConfidenceCalibrator(
  storage: LearningStorage,
  config?: Partial<LearningConfig>
): ConfidenceCalibrator {
  return new ConfidenceCalibrator({ storage, config });
}
