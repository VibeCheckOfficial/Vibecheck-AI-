/**
 * Intelligence Engine
 *
 * The main orchestrator for Phase 5 Intelligence System.
 * Combines project learning, semantic analysis, and predictive suggestions
 * to create an AI that "just knows" your codebase.
 */

import * as path from 'path';
import type { Finding, FindingSeverity, FindingType } from '@repo/shared-types';
import { getLogger, type Logger } from '../utils/logger.js';
import { ProjectLearner, getProjectLearner } from './project-learner.js';
import {
  SemanticContextAnalyzer,
  getSemanticAnalyzer,
} from './semantic-context.js';
import {
  PredictiveEngine,
  getPredictiveEngine,
  formatSuggestions,
} from './predictive-engine.js';
import type {
  FileContext,
  IntelligenceConfig,
  ProjectInsight,
  ProjectProfile,
  SessionContext,
  Suggestion,
  FeedbackType,
  DEFAULT_INTELLIGENCE_CONFIG,
} from './types.js';

const DEFAULT_CONFIG: IntelligenceConfig = {
  dataPath: '.vibecheck/intelligence',
  autoLearn: true,
  minFeedbackForPattern: 3,
  enablePredictions: true,
  enableSemanticAnalysis: true,
  contextCacheTtlMs: 5 * 60 * 1000,
  autoSaveIntervalMs: 60 * 1000,
};

export interface IntelligenceResult {
  /** Adjusted findings with context-aware severity */
  adjustedFindings: Array<
    Finding & {
      adjustedSeverity?: FindingSeverity;
      adjustmentReason?: string;
      suppressed?: boolean;
      suppressionReason?: string;
    }
  >;

  /** File contexts for all analyzed files */
  fileContexts: Map<string, FileContext>;

  /** Project-wide insights */
  insights: ProjectInsight[];

  /** Suggested next actions */
  suggestions: Suggestion[];

  /** Summary statistics */
  summary: {
    totalFindings: number;
    suppressedCount: number;
    adjustedCount: number;
    insightCount: number;
  };
}

/**
 * Intelligence Engine - The brain of VibeCheck
 */
export class IntelligenceEngine {
  private config: IntelligenceConfig;
  private projectRoot: string;
  private learner: ProjectLearner | null = null;
  private contextAnalyzer: SemanticContextAnalyzer | null = null;
  private predictiveEngine: PredictiveEngine | null = null;
  private logger: Logger;
  private initialized = false;

  constructor(projectRoot: string, config: Partial<IntelligenceConfig> = {}) {
    this.projectRoot = projectRoot;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = getLogger('intelligence-engine');
  }

  /**
   * Initialize all intelligence components
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.logger.debug('Initializing intelligence engine');

    // Initialize learner
    this.learner = await getProjectLearner(this.projectRoot, this.config);

    // Initialize semantic analyzer
    if (this.config.enableSemanticAnalysis) {
      this.contextAnalyzer = getSemanticAnalyzer(this.projectRoot, {
        cacheTtlMs: this.config.contextCacheTtlMs,
      });
    }

    // Initialize predictive engine
    if (this.config.enablePredictions) {
      this.predictiveEngine = getPredictiveEngine(this.projectRoot);
    }

    this.initialized = true;
    this.logger.debug('Intelligence engine initialized');
  }

  /**
   * Process findings with intelligence - applies learning and context
   */
  async processFindings(
    findings: Finding[],
    sessionContext?: SessionContext
  ): Promise<IntelligenceResult> {
    await this.ensureInitialized();

    const adjustedFindings: IntelligenceResult['adjustedFindings'] = [];
    const fileContexts = new Map<string, FileContext>();
    const filesToAnalyze = new Set<string>();

    // Collect unique files
    for (const finding of findings) {
      if (finding.file) {
        filesToAnalyze.add(finding.file);
      }
    }

    // Analyze file contexts
    if (this.contextAnalyzer && this.config.enableSemanticAnalysis) {
      for (const file of filesToAnalyze) {
        try {
          const context = await this.contextAnalyzer.analyzeFile(file);
          fileContexts.set(file, context);
        } catch (error) {
          this.logger.debug('Failed to analyze file context', {
            file,
            error: error instanceof Error ? error.message : 'Unknown',
          });
        }
      }
    }

    let suppressedCount = 0;
    let adjustedCount = 0;

    // Process each finding
    for (const finding of findings) {
      const adjustedFinding: IntelligenceResult['adjustedFindings'][number] = {
        ...finding,
      };

      // Check for suppression
      if (this.learner) {
        const suppression = this.learner.shouldSuppress({
          type: finding.type as FindingType,
          file: finding.file,
          message: finding.message,
        });

        if (suppression.suppressed) {
          adjustedFinding.suppressed = true;
          adjustedFinding.suppressionReason = suppression.reason;
          suppressedCount++;
          adjustedFindings.push(adjustedFinding);
          continue;
        }
      }

      // Adjust severity based on file context
      if (finding.file && fileContexts.has(finding.file) && this.contextAnalyzer) {
        const context = fileContexts.get(finding.file)!;
        const adjustment = this.contextAnalyzer.adjustFindingSeverity(
          {
            severity: finding.severity,
            type: finding.type,
            file: finding.file,
            message: finding.message,
          },
          context
        );

        if (adjustment.severity !== finding.severity) {
          adjustedFinding.adjustedSeverity = adjustment.severity;
          adjustedFinding.adjustmentReason = adjustment.reason;
          adjustedCount++;
        }
      }

      // Adjust confidence based on project history
      if (this.learner) {
        const { adjusted, reason } = this.learner.adjustConfidence(
          { type: finding.type as FindingType, severity: finding.severity },
          0.8 // Base confidence
        );

        if (reason) {
          adjustedFinding.adjustmentReason = adjustedFinding.adjustmentReason
            ? `${adjustedFinding.adjustmentReason}; ${reason}`
            : reason;
        }
      }

      adjustedFindings.push(adjustedFinding);
    }

    // Get project insights
    let insights: ProjectInsight[] = [];
    if (this.contextAnalyzer && fileContexts.size > 0) {
      insights = await this.contextAnalyzer.getProjectInsights(fileContexts);
    }

    // Get suggestions
    let suggestions: Suggestion[] = [];
    if (this.predictiveEngine && sessionContext) {
      // Update session context with scan results
      const updatedContext: SessionContext = {
        ...sessionContext,
        lastCommand: 'scan',
        lastCommandTime: new Date(),
        lastScanResult: {
          totalFindings: findings.length,
          fixableCount: findings.filter((f) => f.suggestion).length,
          criticalCount: findings.filter((f) => f.severity === 'error').length,
        },
      };

      suggestions = await this.predictiveEngine.getSuggestions(updatedContext);

      // Record the scan command
      this.predictiveEngine.recordCommand('scan', true, {
        findingsCount: findings.length,
        errorCount: findings.filter((f) => f.severity === 'error').length,
      });
    }

    return {
      adjustedFindings,
      fileContexts,
      insights,
      suggestions,
      summary: {
        totalFindings: findings.length,
        suppressedCount,
        adjustedCount,
        insightCount: insights.length,
      },
    };
  }

  /**
   * Record feedback for a finding
   */
  async recordFeedback(
    finding: {
      id: string;
      type: FindingType | string;
      file: string | null;
      severity: FindingSeverity;
    },
    feedback: FeedbackType,
    options?: {
      notes?: string;
      suppressFuture?: boolean;
    }
  ): Promise<void> {
    await this.ensureInitialized();

    if (this.learner) {
      await this.learner.recordFeedback(finding, feedback, options);
    }
  }

  /**
   * Get suggestions for the current context
   */
  async getSuggestions(context: SessionContext): Promise<Suggestion[]> {
    await this.ensureInitialized();

    if (!this.predictiveEngine) {
      return [];
    }

    return this.predictiveEngine.getSuggestions(context);
  }

  /**
   * Get formatted suggestions for CLI
   */
  async getFormattedSuggestions(context: SessionContext): Promise<string> {
    const suggestions = await this.getSuggestions(context);
    return formatSuggestions(suggestions);
  }

  /**
   * Analyze a file and get its context
   */
  async analyzeFile(filePath: string): Promise<FileContext | null> {
    await this.ensureInitialized();

    if (!this.contextAnalyzer) {
      return null;
    }

    return this.contextAnalyzer.analyzeFile(filePath);
  }

  /**
   * Get the project profile
   */
  getProfile(): ProjectProfile | null {
    return this.learner?.getProfile() ?? null;
  }

  /**
   * Get learning statistics
   */
  getLearningStats(): ReturnType<ProjectLearner['getStatsSummary']> {
    return this.learner?.getStatsSummary() ?? null;
  }

  /**
   * Learn naming conventions from codebase
   */
  async learnNamingConventions(): Promise<void> {
    await this.ensureInitialized();

    if (this.learner) {
      await this.learner.learnNamingConventions();
    }
  }

  /**
   * Record a command execution for predictions
   */
  recordCommand(
    command: string,
    success: boolean,
    resultSummary?: {
      findingsCount?: number;
      fixedCount?: number;
      errorCount?: number;
    }
  ): void {
    if (this.predictiveEngine) {
      this.predictiveEngine.recordCommand(command, success, resultSummary);
    }
  }

  /**
   * Generate a learning report
   */
  generateReport(): string {
    const profile = this.getProfile();
    const stats = this.getLearningStats();

    if (!profile || !stats) {
      return 'Intelligence system not initialized or no data available.';
    }

    const lines: string[] = [];

    lines.push('╔══════════════════════════════════════════════════════════════╗');
    lines.push('║               INTELLIGENCE LEARNING REPORT                    ║');
    lines.push('╠══════════════════════════════════════════════════════════════╣');
    lines.push(`║  Project: ${profile.name.padEnd(50)} ║`);
    lines.push(`║  Language: ${profile.language.padEnd(49)} ║`);
    lines.push(`║  Frameworks: ${profile.frameworks.join(', ').padEnd(47)} ║`);
    lines.push('╠══════════════════════════════════════════════════════════════╣');
    lines.push('║  LEARNING STATISTICS                                          ║');
    lines.push('╟──────────────────────────────────────────────────────────────╢');
    lines.push(`║  Total Feedback:        ${stats.totalFeedback.toString().padStart(8)}                        ║`);
    lines.push(`║  Accuracy:              ${(stats.accuracy * 100).toFixed(1).padStart(7)}%                        ║`);
    lines.push(`║  Suppression Patterns:  ${stats.suppressionCount.toString().padStart(8)}                        ║`);

    if (stats.topFalsePositives.length > 0) {
      lines.push('╠══════════════════════════════════════════════════════════════╣');
      lines.push('║  TOP FALSE POSITIVE TYPES                                     ║');
      lines.push('╟──────────────────────────────────────────────────────────────╢');
      for (const { type, count } of stats.topFalsePositives) {
        lines.push(`║  ${type.padEnd(30)} ${count.toString().padStart(8)} false positives ║`);
      }
    }

    // Naming conventions
    const conventions = profile.namingConventions;
    const hasConventions = Object.values(conventions).some((c) => c !== null);

    if (hasConventions) {
      lines.push('╠══════════════════════════════════════════════════════════════╣');
      lines.push('║  LEARNED NAMING CONVENTIONS                                   ║');
      lines.push('╟──────────────────────────────────────────────────────────────╢');

      for (const [key, convention] of Object.entries(conventions)) {
        if (convention) {
          const conf = Math.round(convention.confidence * 100);
          lines.push(
            `║  ${key.padEnd(12)}: ${convention.description.padEnd(35)} (${conf}%) ║`
          );
        }
      }
    }

    lines.push('╚══════════════════════════════════════════════════════════════╝');

    return lines.join('\n');
  }

  /**
   * Save all data
   */
  async save(): Promise<void> {
    if (this.learner) {
      await this.learner.save();
    }
  }

  /**
   * Dispose all resources
   */
  async dispose(): Promise<void> {
    if (this.learner) {
      await this.learner.dispose();
    }

    if (this.contextAnalyzer) {
      this.contextAnalyzer.dispose();
    }

    this.initialized = false;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }
}

// ============================================================================
// Singleton and Helpers
// ============================================================================

let globalEngine: IntelligenceEngine | null = null;

/**
 * Get or create the global intelligence engine
 */
export async function getIntelligenceEngine(
  projectRoot: string,
  config?: Partial<IntelligenceConfig>
): Promise<IntelligenceEngine> {
  if (!globalEngine || globalEngine['projectRoot'] !== projectRoot) {
    globalEngine = new IntelligenceEngine(projectRoot, config);
    await globalEngine.initialize();
  }
  return globalEngine;
}

/**
 * Reset the global intelligence engine
 */
export async function resetIntelligenceEngine(): Promise<void> {
  if (globalEngine) {
    await globalEngine.dispose();
    globalEngine = null;
  }
}

/**
 * Quick helper to process findings with intelligence
 */
export async function processWithIntelligence(
  findings: Finding[],
  projectRoot: string,
  sessionContext?: SessionContext
): Promise<IntelligenceResult> {
  const engine = await getIntelligenceEngine(projectRoot);
  return engine.processFindings(findings, sessionContext);
}
