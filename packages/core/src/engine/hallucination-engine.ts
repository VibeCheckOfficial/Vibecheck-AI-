/**
 * Hallucination Detection Engine
 *
 * The world-class unified engine that combines:
 * - Phase 4: Performance (incremental, parallel, streaming, caching)
 * - Phase 5: Intelligence (learning, semantic context, predictions)
 * - Phase 6: Trust (multi-source verification, evidence chains, calibration)
 * - Core Validators (code, drift, truthpack)
 *
 * This is the main entry point for VibeCheck hallucination detection.
 */

import * as path from 'path';
import { glob } from 'glob';
import { getLogger, type Logger } from '../utils/logger.js';

// Phase 4: Performance
import {
  PerformanceScanner,
  getPerformanceScanner,
  type ScanResult as PerformanceScanResult,
} from '../performance/performance-scanner.js';
import type { ScanProgressEvent, CachedFinding } from '../performance/types.js';

// Phase 5: Intelligence
import {
  IntelligenceEngine,
  getIntelligenceEngine,
} from '../intelligence/intelligence-engine.js';
import type { FileContext, Suggestion, ProjectInsight } from '../intelligence/types.js';

// Phase 6: Trust
import {
  VerificationEngine,
  getVerificationEngine,
} from '../verification/verification-engine.js';
import type { VerificationResult, EvidenceChain } from '../verification/types.js';

// Validators
import { CodeValidator, getCodeValidator, type CodeValidationResult, type HallucinationCandidate } from '../validation/code-validator.js';
import { DriftDetector, getDriftDetector, type DriftReport } from '../validation/drift-detector.js';
import { TruthpackValidators, type ValidationResult as TruthpackValidationResult } from '../truthpack/validators.js';

// Mock Detector Scanner
import {
  MockDetectorScanner,
  getMockDetectorScanner,
  type MockDetectorScanResult,
  type MockDetectorFinding,
  calculateMockHealthPenalty,
} from '../scanners/mock-detector/index.js';

// ============================================================================
// Types
// ============================================================================

export interface HallucinationFinding {
  id: string;
  type: HallucinationType;
  severity: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  file: string;
  line: number | null;
  column: number | null;
  evidence: string[];
  confidence: number;
  verified: boolean;
  suggestion?: string;
  autoFixable: boolean;
  category: HallucinationCategory;
}

export type HallucinationType =
  | 'fake_import'
  | 'fake_api'
  | 'fake_method'
  | 'fake_type'
  | 'fake_route'
  | 'fake_env'
  | 'invented_pattern'
  | 'ghost_route'
  | 'auth_drift'
  | 'type_drift'
  | 'env_drift'
  | 'security_issue'
  | 'syntax_error'
  | 'convention_violation';

export type HallucinationCategory =
  | 'code_quality'
  | 'security'
  | 'truthpack_drift'
  | 'hallucination'
  | 'best_practice';

export interface ScanOptions {
  /** Project root directory */
  projectRoot: string;

  /** Specific files to scan (if empty, scans all) */
  files?: string[];

  /** Enable incremental scanning */
  incremental?: boolean;

  /** Enable parallel processing */
  parallel?: boolean;

  /** Number of workers for parallel processing */
  workers?: number;

  /** Enable streaming output */
  streaming?: boolean;

  /** Enable caching */
  caching?: boolean;

  /** Enable intelligence (learning, predictions) */
  intelligence?: boolean;

  /** Enable verification (multi-source) */
  verification?: boolean;

  /** Check for drift against truthpack */
  checkDrift?: boolean;

  /** Validate truthpack files */
  validateTruthpack?: boolean;

  /** Enable mock/fake data detection */
  detectMocks?: boolean;

  /** Progress callback */
  onProgress?: (progress: ScanProgress) => void;

  /** Finding callback (for streaming) */
  onFinding?: (finding: HallucinationFinding) => void;

  /** Severity threshold */
  minSeverity?: 'info' | 'warning' | 'error' | 'critical';

  /** File patterns to include */
  includePatterns?: string[];

  /** File patterns to exclude */
  excludePatterns?: string[];
}

export interface ScanProgress {
  phase: 'initializing' | 'scanning' | 'verifying' | 'analyzing' | 'complete';
  processed: number;
  total: number;
  percentage: number;
  currentFile?: string;
  elapsedMs: number;
  estimatedRemainingMs: number;
}

export interface ScanReport {
  /** Unique scan ID */
  scanId: string;

  /** Scan timestamp */
  timestamp: Date;

  /** All findings */
  findings: HallucinationFinding[];

  /** Summary statistics */
  summary: {
    totalFiles: number;
    filesScanned: number;
    filesFromCache: number;
    totalFindings: number;
    criticalCount: number;
    errorCount: number;
    warningCount: number;
    infoCount: number;
    hallucinationsDetected: number;
    autoFixableCount: number;
    mockDataDetected: number;
  };

  /** Drift report (if checked) */
  drift?: DriftReport;

  /** Mock data detection results */
  mockDetection?: MockDetectorScanResult;

  /** Truthpack validation (if checked) */
  truthpackValidation?: {
    routes?: TruthpackValidationResult;
    env?: TruthpackValidationResult;
    auth?: TruthpackValidationResult;
    contracts?: TruthpackValidationResult;
    crossValidation?: TruthpackValidationResult;
  };

  /** Intelligence insights */
  insights?: ProjectInsight[];

  /** Suggestions for next actions */
  suggestions?: Suggestion[];

  /** Performance metrics */
  metrics: {
    durationMs: number;
    cacheHitRate: number;
    verificationRate: number;
    avgConfidence: number;
  };

  /** Overall health score (0-100) */
  healthScore: number;
}

const DEFAULT_OPTIONS: Partial<ScanOptions> = {
  incremental: true,
  parallel: true,
  workers: 4,
  streaming: true,
  caching: true,
  intelligence: true,
  verification: true,
  checkDrift: true,
  validateTruthpack: true,
  detectMocks: true,
  minSeverity: 'info',
  includePatterns: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
  excludePatterns: ['node_modules/**', 'dist/**', 'build/**', '.next/**', 'coverage/**'],
};

// ============================================================================
// Main Engine
// ============================================================================

export class HallucinationEngine {
  private options: ScanOptions;
  private logger: Logger;

  private performanceScanner: PerformanceScanner | null = null;
  private intelligenceEngine: IntelligenceEngine | null = null;
  private verificationEngine: VerificationEngine | null = null;
  private codeValidator: CodeValidator | null = null;
  private driftDetector: DriftDetector | null = null;
  private mockDetectorScanner: MockDetectorScanner | null = null;

  private initialized = false;

  constructor(options: ScanOptions) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.logger = getLogger('hallucination-engine');
  }

  /**
   * Initialize all subsystems
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const startTime = Date.now();

    // Initialize in parallel for speed
    const initPromises: Promise<void>[] = [];

    // Performance scanner
    initPromises.push(
      (async () => {
        this.performanceScanner = await getPerformanceScanner({
          projectRoot: this.options.projectRoot,
          incremental: this.options.incremental ?? true,
          parallel: this.options.parallel ?? true,
          workers: this.options.workers ?? 4,
          streaming: this.options.streaming ?? true,
          caching: this.options.caching ?? true,
        });
      })()
    );

    // Intelligence engine
    if (this.options.intelligence) {
      initPromises.push(
        (async () => {
          this.intelligenceEngine = await getIntelligenceEngine(this.options.projectRoot);
          await this.intelligenceEngine.initialize();
        })()
      );
    }

    // Verification engine
    if (this.options.verification) {
      initPromises.push(
        (async () => {
          this.verificationEngine = await getVerificationEngine(this.options.projectRoot);
          await this.verificationEngine.initialize();
        })()
      );
    }

    // Code validator
    initPromises.push(
      (async () => {
        this.codeValidator = await getCodeValidator({
          projectRoot: this.options.projectRoot,
        });
      })()
    );

    // Drift detector
    if (this.options.checkDrift) {
      initPromises.push(
        (async () => {
          this.driftDetector = getDriftDetector({
            projectRoot: this.options.projectRoot,
          });
        })()
      );
    }

    // Mock detector scanner
    if (this.options.detectMocks) {
      initPromises.push(
        (async () => {
          this.mockDetectorScanner = await getMockDetectorScanner({
            projectRoot: this.options.projectRoot,
            includePatterns: this.options.includePatterns,
            excludePatterns: this.options.excludePatterns,
          });
        })()
      );
    }

    await Promise.all(initPromises);

    this.initialized = true;

    const initTime = Date.now() - startTime;
    this.logger.debug('Hallucination engine initialized', { initTimeMs: initTime });
  }

  /**
   * Run a full scan
   */
  async scan(): Promise<ScanReport> {
    await this.ensureInitialized();

    const scanId = `scan-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const startTime = Date.now();
    const findings: HallucinationFinding[] = [];

    // Get files to scan
    const files = this.options.files ?? await this.getFilesToScan();

    this.emitProgress({
      phase: 'initializing',
      processed: 0,
      total: files.length,
      percentage: 0,
      elapsedMs: 0,
      estimatedRemainingMs: 0,
    });

    // Phase 1: Code validation with performance optimizations
    this.emitProgress({
      phase: 'scanning',
      processed: 0,
      total: files.length,
      percentage: 0,
      elapsedMs: Date.now() - startTime,
      estimatedRemainingMs: files.length * 10,
    });

    const scanResult = await this.performanceScanner!.scan(
      files,
      async (file) => this.scanSingleFile(file),
      {
        onProgress: (progress) => {
          this.emitProgress({
            phase: 'scanning',
            processed: progress.processed,
            total: progress.total,
            percentage: progress.percentage,
            currentFile: progress.currentFile,
            elapsedMs: progress.elapsedMs,
            estimatedRemainingMs: progress.estimatedRemainingMs,
          });
        },
        onFinding: (finding) => {
          const converted = this.convertToHallucinationFinding(finding);
          findings.push(converted);
          this.options.onFinding?.(converted);
        },
      }
    );

    // Convert cached findings
    for (const cachedFinding of scanResult.findings) {
      const existing = findings.find((f) => f.id === cachedFinding.id);
      if (!existing) {
        findings.push(this.convertToHallucinationFinding(cachedFinding));
      }
    }

    // Phase 2: Verification (multi-source)
    if (this.options.verification && this.verificationEngine) {
      this.emitProgress({
        phase: 'verifying',
        processed: 0,
        total: findings.length,
        percentage: 0,
        elapsedMs: Date.now() - startTime,
        estimatedRemainingMs: findings.length * 50,
      });

      await this.verifyFindings(findings);
    }

    // Phase 3: Intelligence (learning, context, predictions)
    let insights: ProjectInsight[] = [];
    let suggestions: Suggestion[] = [];

    if (this.options.intelligence && this.intelligenceEngine) {
      this.emitProgress({
        phase: 'analyzing',
        processed: 0,
        total: 1,
        percentage: 0,
        elapsedMs: Date.now() - startTime,
        estimatedRemainingMs: 1000,
      });

      const intelligenceResult = await this.applyIntelligence(findings, files);
      insights = intelligenceResult.insights;
      suggestions = intelligenceResult.suggestions;

      // Update findings with intelligence adjustments
      findings.splice(0, findings.length, ...intelligenceResult.adjustedFindings);
    }

    // Phase 4: Drift detection
    let drift: DriftReport | undefined;
    if (this.options.checkDrift && this.driftDetector) {
      drift = await this.driftDetector.detect();

      // Add drift items as findings
      for (const item of drift.items) {
        findings.push({
          id: `drift-${item.category}-${item.identifier}`,
          type: this.mapDriftToType(item.category),
          severity: this.mapDriftSeverity(item.severity),
          message: item.details,
          file: item.location?.file ?? 'truthpack',
          line: item.location?.line ?? null,
          column: null,
          evidence: [item.truthpackValue ?? '', item.codebaseValue ?? ''].filter(Boolean),
          confidence: 0.95,
          verified: true,
          suggestion: drift.recommendations[0],
          autoFixable: item.type === 'added',
          category: 'truthpack_drift',
        });
      }
    }

    // Phase 5: Truthpack validation
    let truthpackValidation: ScanReport['truthpackValidation'];
    if (this.options.validateTruthpack) {
      truthpackValidation = await this.validateTruthpack();
    }

    // Phase 6: Mock/fake data detection
    let mockDetection: MockDetectorScanResult | undefined;
    if (this.options.detectMocks && this.mockDetectorScanner) {
      this.logger.debug('Starting mock detection scan');
      mockDetection = await this.mockDetectorScanner.scan();

      // Add mock findings to main findings list
      for (const mockFinding of mockDetection.findings) {
        findings.push({
          id: mockFinding.id,
          type: this.mapMockCategoryToType(mockFinding.subtype),
          severity: mockFinding.severity,
          message: mockFinding.message,
          file: mockFinding.file,
          line: mockFinding.line,
          column: mockFinding.column,
          evidence: [mockFinding.code],
          confidence: mockFinding.confidence === 'certain' ? 1.0 : mockFinding.confidence === 'likely' ? 0.8 : 0.6,
          verified: true,
          suggestion: mockFinding.fix,
          autoFixable: mockFinding.autoFixable,
          category: 'security', // Mock data is a security/quality concern
        });
      }

      this.logger.debug('Mock detection complete', {
        total: mockDetection.summary.total,
        critical: mockDetection.summary.bySeverity.critical,
        error: mockDetection.summary.bySeverity.error,
      });
    }

    // Calculate metrics
    const durationMs = Date.now() - startTime;
    const metrics = {
      durationMs,
      cacheHitRate: scanResult.metrics.cache.hitRate,
      verificationRate: findings.filter((f) => f.verified).length / Math.max(findings.length, 1),
      avgConfidence: findings.reduce((sum, f) => sum + f.confidence, 0) / Math.max(findings.length, 1),
    };

    // Calculate health score (includes mock detection penalty)
    const healthScore = this.calculateHealthScore(findings, drift, mockDetection);

    // Build summary
    const summary = {
      totalFiles: files.length,
      filesScanned: scanResult.metrics.files.scanned,
      filesFromCache: scanResult.metrics.files.fromCache,
      totalFindings: findings.length,
      criticalCount: findings.filter((f) => f.severity === 'critical').length,
      errorCount: findings.filter((f) => f.severity === 'error').length,
      warningCount: findings.filter((f) => f.severity === 'warning').length,
      infoCount: findings.filter((f) => f.severity === 'info').length,
      hallucinationsDetected: findings.filter((f) => f.category === 'hallucination').length,
      autoFixableCount: findings.filter((f) => f.autoFixable).length,
      mockDataDetected: mockDetection?.summary.total ?? 0,
    };

    this.emitProgress({
      phase: 'complete',
      processed: files.length,
      total: files.length,
      percentage: 100,
      elapsedMs: durationMs,
      estimatedRemainingMs: 0,
    });

    // Record command for predictions
    if (this.intelligenceEngine) {
      this.intelligenceEngine.recordCommand('scan', summary.totalFindings === 0);
    }

    return {
      scanId,
      timestamp: new Date(),
      findings: this.filterBySeverity(findings),
      summary,
      drift,
      mockDetection,
      truthpackValidation,
      insights,
      suggestions,
      metrics,
      healthScore,
    };
  }

  /**
   * Quick scan - faster but less thorough
   */
  async quickScan(): Promise<ScanReport> {
    const originalOptions = { ...this.options };

    // Disable expensive operations
    this.options.verification = false;
    this.options.validateTruthpack = false;

    try {
      return await this.scan();
    } finally {
      this.options = originalOptions;
    }
  }

  /**
   * Scan a single file
   */
  async scanFile(filePath: string): Promise<HallucinationFinding[]> {
    await this.ensureInitialized();

    const findings = await this.scanSingleFile(filePath);
    return findings.map((f) => this.convertToHallucinationFinding(f));
  }

  /**
   * Verify a specific claim
   */
  async verifyClaim(
    claim: string,
    claimType: string
  ): Promise<{ verified: boolean; confidence: number; evidence: EvidenceChain }> {
    await this.ensureInitialized();

    if (!this.verificationEngine) {
      return {
        verified: false,
        confidence: 0,
        evidence: {
          claimId: 'manual',
          claim,
          claimType,
          steps: [],
          overallConfidence: 0,
          verdict: 'uncertain',
          reasoning: 'Verification engine not enabled',
          createdAt: Date.now(),
        },
      };
    }

    const result = await this.verificationEngine.verifyAndExplain(claim, claimType);
    return {
      verified: result.result.verdict === 'confirmed' || result.result.verdict === 'likely',
      confidence: result.result.confidence,
      evidence: result.chain,
    };
  }

  /**
   * Record user feedback for learning
   */
  async recordFeedback(
    findingId: string,
    feedback: 'true_positive' | 'false_positive'
  ): Promise<void> {
    if (this.intelligenceEngine) {
      await this.intelligenceEngine.recordFeedback(findingId, feedback);
    }

    if (this.verificationEngine) {
      this.verificationEngine.recordFeedback(findingId, feedback);
    }
  }

  /**
   * Get suggestions for next actions
   */
  async getSuggestions(): Promise<Suggestion[]> {
    if (!this.intelligenceEngine) return [];

    return this.intelligenceEngine.getSuggestions({
      commandHistory: [],
      gitStatus: { staged: [], modified: [], untracked: [] },
      openFiles: [],
      consecutiveFailures: 0,
    });
  }

  /**
   * Get learning report
   */
  async getLearningReport(): Promise<string> {
    if (!this.intelligenceEngine) return 'Intelligence engine not enabled';

    return this.intelligenceEngine.generateReport();
  }

  /**
   * Get calibration report
   */
  async getCalibrationReport(): Promise<string> {
    if (!this.verificationEngine) return 'Verification engine not enabled';

    return this.verificationEngine.getCalibrationReport();
  }

  /**
   * Clear all caches
   */
  async clearCaches(): Promise<void> {
    if (this.performanceScanner) {
      await this.performanceScanner.clearCaches();
    }
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  private async getFilesToScan(): Promise<string[]> {
    const files = await glob(this.options.includePatterns ?? ['**/*.ts', '**/*.tsx'], {
      cwd: this.options.projectRoot,
      ignore: this.options.excludePatterns ?? ['node_modules/**'],
      absolute: false,
    });

    return files;
  }

  private async scanSingleFile(filePath: string): Promise<CachedFinding[]> {
    const findings: CachedFinding[] = [];
    const absolutePath = path.join(this.options.projectRoot, filePath);

    try {
      const fs = await import('fs/promises');
      const content = await fs.readFile(absolutePath, 'utf-8');

      // Run code validation
      if (this.codeValidator) {
        const result = await this.codeValidator.validate(content, filePath);

        // Convert errors to findings
        for (const error of result.errors) {
          findings.push({
            id: `${filePath}:${error.code}:${error.location.line}`,
            type: this.mapErrorType(error.type),
            severity: error.severity === 'critical' ? 'error' : 'warning',
            message: error.message,
            file: filePath,
            line: error.location.line,
            column: error.location.column,
            hash: '',
          });
        }

        // Convert warnings to findings
        for (const warning of result.warnings) {
          findings.push({
            id: `${filePath}:${warning.type}:${warning.location.line}`,
            type: warning.type,
            severity: warning.type === 'security' ? 'error' : 'warning',
            message: warning.message,
            file: filePath,
            line: warning.location.line,
            column: warning.location.column,
            hash: '',
          });
        }

        // Convert hallucinations to findings (highest priority)
        for (const hallucination of result.hallucinations) {
          findings.push({
            id: `${filePath}:hallucination:${hallucination.type}:${hallucination.location.line}`,
            type: hallucination.type,
            severity: 'error',
            message: `Potential hallucination: ${hallucination.evidence}`,
            file: filePath,
            line: hallucination.location.line,
            column: hallucination.location.column,
            hash: '',
          });
        }
      }
    } catch (error) {
      this.logger.debug('Failed to scan file', {
        file: filePath,
        error: error instanceof Error ? error.message : 'Unknown',
      });
    }

    return findings;
  }

  private async verifyFindings(findings: HallucinationFinding[]): Promise<void> {
    if (!this.verificationEngine) return;

    // Filter findings that need verification
    const toVerify = findings.filter(
      (f) => f.category === 'hallucination' || f.type.startsWith('fake_')
    );

    // Verify in batches for performance
    const batchSize = 10;
    for (let i = 0; i < toVerify.length; i += batchSize) {
      const batch = toVerify.slice(i, i + batchSize);

      const claims = batch.map((f) => ({
        claim: f.message,
        claimType: f.type,
      }));

      try {
        const results = await this.verificationEngine.verifyBatch(claims);

        for (let j = 0; j < batch.length; j++) {
          const finding = batch[j];
          const result = results.results[j];

          finding.verified = true;
          finding.confidence = result.confidence;

          // Adjust severity based on verification
          if (result.verdict === 'confirmed' || result.verdict === 'likely') {
            // Finding is real - keep or escalate severity
            if (result.verdict === 'confirmed' && finding.severity === 'warning') {
              finding.severity = 'error';
            }
          } else if (result.verdict === 'unlikely' || result.verdict === 'dismissed') {
            // Finding is likely a false positive - downgrade
            finding.severity = 'info';
          }
        }
      } catch (error) {
        this.logger.debug('Verification failed for batch', { error });
      }
    }
  }

  private async applyIntelligence(
    findings: HallucinationFinding[],
    files: string[]
  ): Promise<{
    adjustedFindings: HallucinationFinding[];
    insights: ProjectInsight[];
    suggestions: Suggestion[];
  }> {
    if (!this.intelligenceEngine) {
      return { adjustedFindings: findings, insights: [], suggestions: [] };
    }

    // Convert to format expected by intelligence engine
    const coreFindings = findings.map((f) => ({
      id: f.id,
      type: f.type,
      severity: f.severity,
      message: f.message,
      file: f.file,
      line: f.line,
    }));

    const result = await this.intelligenceEngine.processFindings(coreFindings, files);

    // Apply adjustments
    const adjustedFindings: HallucinationFinding[] = [];

    for (const adjusted of result.adjustedFindings) {
      const original = findings.find((f) => f.id === adjusted.id);
      if (!original) continue;

      if (adjusted.suppressed) {
        continue; // Skip suppressed findings
      }

      adjustedFindings.push({
        ...original,
        severity: adjusted.adjustedSeverity ?? original.severity,
        confidence: adjusted.adjustedConfidence ?? original.confidence,
      });
    }

    return {
      adjustedFindings,
      insights: result.insights,
      suggestions: result.suggestions,
    };
  }

  private async validateTruthpack(): Promise<ScanReport['truthpackValidation']> {
    const truthpackDir = path.join(this.options.projectRoot, '.vibecheck/truthpack');
    const fs = await import('fs/promises');

    const validation: ScanReport['truthpackValidation'] = {};

    try {
      // Validate routes
      try {
        const routesContent = await fs.readFile(path.join(truthpackDir, 'routes.json'), 'utf-8');
        validation.routes = TruthpackValidators.validateRoutes(JSON.parse(routesContent));
      } catch {
        // Routes file doesn't exist
      }

      // Validate env
      try {
        const envContent = await fs.readFile(path.join(truthpackDir, 'env.json'), 'utf-8');
        validation.env = TruthpackValidators.validateEnv(JSON.parse(envContent));
      } catch {
        // Env file doesn't exist
      }

      // Validate auth
      try {
        const authContent = await fs.readFile(path.join(truthpackDir, 'auth.json'), 'utf-8');
        validation.auth = TruthpackValidators.validateAuth(JSON.parse(authContent));
      } catch {
        // Auth file doesn't exist
      }

      // Validate contracts
      try {
        const contractsContent = await fs.readFile(path.join(truthpackDir, 'contracts.json'), 'utf-8');
        validation.contracts = TruthpackValidators.validateContracts(JSON.parse(contractsContent));
      } catch {
        // Contracts file doesn't exist
      }

      // Cross-validation
      if (validation.routes || validation.auth || validation.contracts) {
        validation.crossValidation = TruthpackValidators.crossValidate({
          routes: validation.routes ? JSON.parse(await fs.readFile(path.join(truthpackDir, 'routes.json'), 'utf-8').catch(() => '{}')) : undefined,
          auth: validation.auth ? JSON.parse(await fs.readFile(path.join(truthpackDir, 'auth.json'), 'utf-8').catch(() => '{}')) : undefined,
          contracts: validation.contracts ? JSON.parse(await fs.readFile(path.join(truthpackDir, 'contracts.json'), 'utf-8').catch(() => '{}')) : undefined,
        });
      }
    } catch (error) {
      this.logger.debug('Truthpack validation failed', { error });
    }

    return validation;
  }

  private convertToHallucinationFinding(cached: CachedFinding): HallucinationFinding {
    return {
      id: cached.id,
      type: this.mapCachedType(cached.type),
      severity: this.mapSeverity(cached.severity),
      message: cached.message,
      file: cached.file,
      line: cached.line,
      column: cached.column,
      evidence: [],
      confidence: 0.8,
      verified: false,
      autoFixable: this.isAutoFixable(cached.type),
      category: this.determineCategory(cached.type),
    };
  }

  private mapCachedType(type: string): HallucinationType {
    const typeMap: Record<string, HallucinationType> = {
      fake_import: 'fake_import',
      fake_api: 'fake_api',
      fake_method: 'fake_method',
      fake_type: 'fake_type',
      hallucination: 'invented_pattern',
      security: 'security_issue',
      syntax: 'syntax_error',
      type: 'fake_type',
      import: 'fake_import',
      convention: 'convention_violation',
      style: 'convention_violation',
    };

    return typeMap[type] ?? 'invented_pattern';
  }

  private mapErrorType(type: string): string {
    return type;
  }

  private mapSeverity(severity: string): 'info' | 'warning' | 'error' | 'critical' {
    const severityMap: Record<string, 'info' | 'warning' | 'error' | 'critical'> = {
      info: 'info',
      warning: 'warning',
      error: 'error',
      critical: 'critical',
    };

    return severityMap[severity] ?? 'warning';
  }

  private mapDriftToType(category: string): HallucinationType {
    const typeMap: Record<string, HallucinationType> = {
      route: 'ghost_route',
      env: 'env_drift',
      auth: 'auth_drift',
      type: 'type_drift',
    };

    return typeMap[category] ?? 'type_drift';
  }

  private mapDriftSeverity(severity: string): 'info' | 'warning' | 'error' | 'critical' {
    const severityMap: Record<string, 'info' | 'warning' | 'error' | 'critical'> = {
      low: 'info',
      medium: 'warning',
      high: 'error',
      critical: 'critical',
    };

    return severityMap[severity] ?? 'warning';
  }

  private mapMockCategoryToType(category: string): HallucinationType {
    // Map mock-detector categories to hallucination types
    const typeMap: Record<string, HallucinationType> = {
      'credentials': 'security_issue',
      'fake-auth': 'security_issue',
      'mock-data': 'invented_pattern',
      'fake-user-data': 'fake_type',
      'stub-response': 'fake_api',
      'placeholder-content': 'invented_pattern',
      'debug-code': 'convention_violation',
      'hardcoded-config': 'security_issue',
      'placeholder-ids': 'fake_type',
      'fake-dates': 'fake_type',
      'test-in-prod': 'convention_violation',
      'pii-exposure': 'security_issue',
      'financial-mock': 'security_issue',
      'healthcare-mock': 'security_issue',
    };

    return typeMap[category] ?? 'invented_pattern';
  }

  private isAutoFixable(type: string): boolean {
    const autoFixable = new Set([
      'fake_import',
      'syntax',
      'style',
      'convention',
    ]);

    return autoFixable.has(type);
  }

  private determineCategory(type: string): HallucinationCategory {
    if (type.startsWith('fake_') || type === 'hallucination' || type === 'invented_pattern') {
      return 'hallucination';
    }
    if (type === 'security' || type === 'security_issue') {
      return 'security';
    }
    if (type.endsWith('_drift') || type === 'ghost_route') {
      return 'truthpack_drift';
    }
    if (type === 'style' || type === 'convention' || type === 'convention_violation') {
      return 'best_practice';
    }
    return 'code_quality';
  }

  private filterBySeverity(findings: HallucinationFinding[]): HallucinationFinding[] {
    const severityOrder = ['info', 'warning', 'error', 'critical'];
    const minIndex = severityOrder.indexOf(this.options.minSeverity ?? 'info');

    return findings.filter((f) => severityOrder.indexOf(f.severity) >= minIndex);
  }

  private calculateHealthScore(
    findings: HallucinationFinding[],
    drift?: DriftReport,
    mockDetection?: MockDetectorScanResult
  ): number {
    let score = 100;

    // Deduct points for findings
    for (const finding of findings) {
      switch (finding.severity) {
        case 'critical':
          score -= 15;
          break;
        case 'error':
          score -= 10;
          break;
        case 'warning':
          score -= 3;
          break;
        case 'info':
          score -= 1;
          break;
      }

      // Extra deduction for hallucinations
      if (finding.category === 'hallucination') {
        score -= 5;
      }
    }

    // Deduct for drift
    if (drift) {
      score -= drift.summary.criticalCount * 10;
      score -= drift.summary.highCount * 5;
    }

    // Deduct for mock data (credentials/auth bypass are especially severe)
    if (mockDetection) {
      // Use the mock health penalty calculator
      const mockPenalty = 20 - calculateMockHealthPenalty(mockDetection);
      score -= mockPenalty;
    }

    return Math.max(0, Math.min(100, score));
  }

  private emitProgress(progress: ScanProgress): void {
    this.options.onProgress?.(progress);
  }
}

// ============================================================================
// Singleton and Helpers
// ============================================================================

let globalEngine: HallucinationEngine | null = null;

export async function getHallucinationEngine(
  options: ScanOptions
): Promise<HallucinationEngine> {
  if (!globalEngine || globalEngine['options'].projectRoot !== options.projectRoot) {
    globalEngine = new HallucinationEngine(options);
    await globalEngine.initialize();
  }
  return globalEngine;
}

export async function resetHallucinationEngine(): Promise<void> {
  globalEngine = null;
}

/**
 * Quick scan helper
 */
export async function quickHallucinationScan(
  projectRoot: string,
  options?: Partial<ScanOptions>
): Promise<ScanReport> {
  const engine = await getHallucinationEngine({
    projectRoot,
    ...options,
  });

  return engine.scan();
}

/**
 * Format scan report for CLI display
 */
export function formatScanReport(report: ScanReport): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('╔═══════════════════════════════════════════════════════════════════╗');
  lines.push('║                    VIBECHECK SCAN REPORT                          ║');
  lines.push('╠═══════════════════════════════════════════════════════════════════╣');
  lines.push(`║  Health Score: ${getHealthBar(report.healthScore)} ${report.healthScore}%`.padEnd(68) + '║');
  lines.push('╠═══════════════════════════════════════════════════════════════════╣');
  lines.push(`║  Files Scanned:      ${String(report.summary.filesScanned).padStart(6)}                                   ║`);
  lines.push(`║  Files from Cache:   ${String(report.summary.filesFromCache).padStart(6)}                                   ║`);
  lines.push(`║  Total Findings:     ${String(report.summary.totalFindings).padStart(6)}                                   ║`);
  lines.push('╠═══════════════════════════════════════════════════════════════════╣');

  if (report.summary.criticalCount > 0) {
    lines.push(`║  🔴 Critical:        ${String(report.summary.criticalCount).padStart(6)}                                   ║`);
  }
  if (report.summary.errorCount > 0) {
    lines.push(`║  🟠 Errors:          ${String(report.summary.errorCount).padStart(6)}                                   ║`);
  }
  if (report.summary.warningCount > 0) {
    lines.push(`║  🟡 Warnings:        ${String(report.summary.warningCount).padStart(6)}                                   ║`);
  }
  if (report.summary.hallucinationsDetected > 0) {
    lines.push(`║  👻 Hallucinations:  ${String(report.summary.hallucinationsDetected).padStart(6)}                                   ║`);
  }

  lines.push('╠═══════════════════════════════════════════════════════════════════╣');
  lines.push(`║  Duration:           ${String(report.metrics.durationMs).padStart(6)}ms                                 ║`);
  lines.push(`║  Cache Hit Rate:     ${String(Math.round(report.metrics.cacheHitRate * 100)).padStart(5)}%                                  ║`);
  lines.push(`║  Avg Confidence:     ${String(Math.round(report.metrics.avgConfidence * 100)).padStart(5)}%                                  ║`);
  lines.push('╚═══════════════════════════════════════════════════════════════════╝');

  // Show top findings
  if (report.findings.length > 0) {
    lines.push('');
    lines.push('Top Findings:');
    lines.push('─'.repeat(68));

    const topFindings = report.findings
      .sort((a, b) => {
        const severityOrder = { critical: 0, error: 1, warning: 2, info: 3 };
        return severityOrder[a.severity] - severityOrder[b.severity];
      })
      .slice(0, 5);

    for (const finding of topFindings) {
      const icon = finding.severity === 'critical' ? '🔴' :
                   finding.severity === 'error' ? '🟠' :
                   finding.severity === 'warning' ? '🟡' : '⚪';
      lines.push(`${icon} ${finding.file}:${finding.line ?? 0}`);
      lines.push(`   ${finding.message}`);
      if (finding.suggestion) {
        lines.push(`   💡 ${finding.suggestion}`);
      }
      lines.push('');
    }
  }

  // Show suggestions
  if (report.suggestions && report.suggestions.length > 0) {
    lines.push('');
    lines.push('Suggested Next Actions:');
    lines.push('─'.repeat(68));

    for (const suggestion of report.suggestions.slice(0, 3)) {
      lines.push(`  → ${suggestion.description}`);
      lines.push(`    Run: ${suggestion.command}`);
    }
  }

  return lines.join('\n');
}

function getHealthBar(score: number): string {
  const filled = Math.round(score / 10);
  const empty = 10 - filled;

  if (score >= 80) {
    return '█'.repeat(filled) + '░'.repeat(empty) + ' 🟢';
  } else if (score >= 60) {
    return '█'.repeat(filled) + '░'.repeat(empty) + ' 🟡';
  } else if (score >= 40) {
    return '█'.repeat(filled) + '░'.repeat(empty) + ' 🟠';
  } else {
    return '█'.repeat(filled) + '░'.repeat(empty) + ' 🔴';
  }
}
