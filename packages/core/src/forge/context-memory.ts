/**
 * Context Memory - Self-Aware Forge Engine
 *
 * Persistent context memory for learning and adaptation.
 * Stores phase history, rule effectiveness, pattern frequency,
 * and developer behavior signals.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import type {
  ForgeContextMemory,
  ProjectPhase,
  PhaseTransition,
  PhaseDetectionResult,
  RuleEffectivenessScore,
  DeveloperBehaviorSignal,
  AnalysisHistoryEntry,
  FileChangeEvent,
} from './types.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const CONTEXT_FILE = 'forge-context.json';
const VIBECHECK_DIR = '.vibecheck';
const MEMORY_VERSION = '1.0.0';
const MAX_HISTORY_ENTRIES = 100;
const MAX_BEHAVIOR_SIGNALS = 50;
const VELOCITY_WINDOW_DAYS = 7;

// ============================================================================
// CONTEXT MEMORY CLASS
// ============================================================================

export class ContextMemory {
  private projectPath: string;
  private contextPath: string;
  private memory: ForgeContextMemory;
  private dirty: boolean = false;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
    this.contextPath = path.join(projectPath, VIBECHECK_DIR, CONTEXT_FILE);
    this.memory = this.loadOrCreate();
  }

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  /**
   * Load existing context or create new one
   */
  private loadOrCreate(): ForgeContextMemory {
    try {
      if (fs.existsSync(this.contextPath)) {
        const content = fs.readFileSync(this.contextPath, 'utf-8');
        const parsed = JSON.parse(content) as ForgeContextMemory;

        // Migrate if needed
        if (parsed.version !== MEMORY_VERSION) {
          return this.migrate(parsed);
        }

        return parsed;
      }
    } catch {
      // Fall through to create new
    }

    return this.createNew();
  }

  /**
   * Create new context memory
   */
  private createNew(): ForgeContextMemory {
    return {
      version: MEMORY_VERSION,
      projectId: this.generateProjectId(),
      updatedAt: new Date().toISOString(),
      phaseHistory: [],
      currentPhase: 'scaffold',
      consecutiveSamePhase: 0,
      ruleEffectiveness: {},
      patternFrequency: {},
      changeVelocity: 0,
      behaviorSignals: [],
      analysisHistory: [],
    };
  }

  /**
   * Migrate old context format
   */
  private migrate(old: Partial<ForgeContextMemory>): ForgeContextMemory {
    return {
      ...this.createNew(),
      ...old,
      version: MEMORY_VERSION,
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Save context to disk
   */
  save(): void {
    if (!this.dirty) return;

    try {
      // Ensure directory exists
      const dir = path.dirname(this.contextPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      this.memory.updatedAt = new Date().toISOString();
      fs.writeFileSync(this.contextPath, JSON.stringify(this.memory, null, 2), 'utf-8');
      this.dirty = false;
    } catch (error) {
      // Log but don't throw - context memory is not critical
      console.error('Failed to save context memory:', error);
    }
  }

  /**
   * Get the raw memory object (readonly)
   */
  getMemory(): Readonly<ForgeContextMemory> {
    return this.memory;
  }

  // ============================================================================
  // PHASE TRACKING
  // ============================================================================

  /**
   * Update phase based on detection result
   */
  updatePhase(result: PhaseDetectionResult): void {
    const previousPhase = this.memory.currentPhase;

    if (result.phase === previousPhase) {
      this.memory.consecutiveSamePhase++;
    } else {
      // Check if we should transition
      if (this.shouldTransition(result)) {
        this.transitionPhase(result.phase, result.confidence, 'Detection confidence threshold met');
      }
    }

    this.dirty = true;
  }

  /**
   * Check if phase should transition
   */
  private shouldTransition(result: PhaseDetectionResult): boolean {
    // Require high confidence and consistent detection
    // Lower threshold for first detection
    if (this.memory.phaseHistory.length === 0) {
      return result.confidence > 0.5;
    }

    // Standard transition requires confidence > 0.7 and 3+ consecutive detections
    return result.confidence > 0.7 && this.memory.consecutiveSamePhase >= 3;
  }

  /**
   * Perform phase transition
   */
  private transitionPhase(newPhase: ProjectPhase, confidence: number, reason: string): void {
    const transition: PhaseTransition = {
      from: this.memory.currentPhase,
      to: newPhase,
      timestamp: new Date().toISOString(),
      confidence,
      reason,
    };

    this.memory.phaseHistory.push(transition);
    this.memory.currentPhase = newPhase;
    this.memory.consecutiveSamePhase = 1;

    // Trim history if too long
    if (this.memory.phaseHistory.length > 20) {
      this.memory.phaseHistory = this.memory.phaseHistory.slice(-20);
    }

    this.dirty = true;
  }

  /**
   * Force phase transition (manual override)
   */
  forcePhase(phase: ProjectPhase, reason: string): void {
    this.transitionPhase(phase, 1.0, `Manual override: ${reason}`);
  }

  /**
   * Get current phase
   */
  getCurrentPhase(): ProjectPhase {
    return this.memory.currentPhase;
  }

  /**
   * Get phase history
   */
  getPhaseHistory(): PhaseTransition[] {
    return [...this.memory.phaseHistory];
  }

  // ============================================================================
  // RULE EFFECTIVENESS
  // ============================================================================

  /**
   * Record rule generation
   */
  recordRuleGeneration(ruleId: string): void {
    if (!this.memory.ruleEffectiveness[ruleId]) {
      this.memory.ruleEffectiveness[ruleId] = {
        ruleId,
        generationCount: 0,
        wasEdited: false,
        lastGenerated: new Date().toISOString(),
      };
    }

    this.memory.ruleEffectiveness[ruleId].generationCount++;
    this.memory.ruleEffectiveness[ruleId].lastGenerated = new Date().toISOString();
    this.dirty = true;
  }

  /**
   * Record user feedback for a rule
   */
  recordRuleFeedback(ruleId: string, score: number): void {
    if (!this.memory.ruleEffectiveness[ruleId]) {
      this.recordRuleGeneration(ruleId);
    }

    this.memory.ruleEffectiveness[ruleId].feedbackScore = score;
    this.dirty = true;
  }

  /**
   * Record that a rule was manually edited
   */
  recordRuleEdit(ruleId: string): void {
    if (!this.memory.ruleEffectiveness[ruleId]) {
      this.recordRuleGeneration(ruleId);
    }

    this.memory.ruleEffectiveness[ruleId].wasEdited = true;
    this.dirty = true;
  }

  /**
   * Get effectiveness scores for all rules
   */
  getRuleEffectiveness(): Record<string, RuleEffectivenessScore> {
    return { ...this.memory.ruleEffectiveness };
  }

  /**
   * Get rules sorted by effectiveness
   */
  getRulesByEffectiveness(): RuleEffectivenessScore[] {
    return Object.values(this.memory.ruleEffectiveness).sort((a, b) => {
      // Prioritize rules with positive feedback
      const aScore = a.feedbackScore ?? 50;
      const bScore = b.feedbackScore ?? 50;

      // Penalize edited rules (they needed manual intervention)
      const aPenalty = a.wasEdited ? 10 : 0;
      const bPenalty = b.wasEdited ? 10 : 0;

      return bScore - bPenalty - (aScore - aPenalty);
    });
  }

  // ============================================================================
  // PATTERN FREQUENCY
  // ============================================================================

  /**
   * Record pattern occurrence
   */
  recordPattern(patternId: string, count: number = 1): void {
    this.memory.patternFrequency[patternId] =
      (this.memory.patternFrequency[patternId] ?? 0) + count;
    this.dirty = true;
  }

  /**
   * Get pattern frequency
   */
  getPatternFrequency(patternId: string): number {
    return this.memory.patternFrequency[patternId] ?? 0;
  }

  /**
   * Get all patterns sorted by frequency
   */
  getPatternsByFrequency(): Array<{ pattern: string; frequency: number }> {
    return Object.entries(this.memory.patternFrequency)
      .map(([pattern, frequency]) => ({ pattern, frequency }))
      .sort((a, b) => b.frequency - a.frequency);
  }

  // ============================================================================
  // CHANGE VELOCITY
  // ============================================================================

  /**
   * Update change velocity based on file changes
   */
  updateChangeVelocity(changes: FileChangeEvent[]): void {
    const now = Date.now();
    const windowMs = VELOCITY_WINDOW_DAYS * 24 * 60 * 60 * 1000;

    // Get recent history entries within window
    const recentHistory = this.memory.analysisHistory.filter(
      (entry) => now - new Date(entry.timestamp).getTime() < windowMs
    );

    // Calculate average changes per day
    const totalChanges = changes.length + recentHistory.length;
    this.memory.changeVelocity = totalChanges / VELOCITY_WINDOW_DAYS;
    this.dirty = true;
  }

  /**
   * Get current change velocity
   */
  getChangeVelocity(): number {
    return this.memory.changeVelocity;
  }

  // ============================================================================
  // BEHAVIOR SIGNALS
  // ============================================================================

  /**
   * Record file pair edit (files commonly edited together)
   */
  recordFilePairEdit(file1: string, file2: string): void {
    const pairKey = [file1, file2].sort().join(':');

    const existing = this.memory.behaviorSignals.find(
      (s) => s.type === 'file-pair' && s.data.pairKey === pairKey
    );

    if (existing) {
      existing.frequency++;
      existing.lastObserved = new Date().toISOString();
    } else {
      this.memory.behaviorSignals.push({
        type: 'file-pair',
        data: { pairKey, file1, file2 },
        frequency: 1,
        lastObserved: new Date().toISOString(),
      });
    }

    // Trim to max signals
    this.trimBehaviorSignals();
    this.dirty = true;
  }

  /**
   * Record edit pattern (time of day, file types)
   */
  recordEditPattern(fileType: string, hourOfDay: number): void {
    const patternKey = `${fileType}:${hourOfDay}`;

    const existing = this.memory.behaviorSignals.find(
      (s) => s.type === 'edit-pattern' && s.data.patternKey === patternKey
    );

    if (existing) {
      existing.frequency++;
      existing.lastObserved = new Date().toISOString();
    } else {
      this.memory.behaviorSignals.push({
        type: 'edit-pattern',
        data: { patternKey, fileType, hourOfDay },
        frequency: 1,
        lastObserved: new Date().toISOString(),
      });
    }

    this.trimBehaviorSignals();
    this.dirty = true;
  }

  /**
   * Get common file pairs
   */
  getCommonFilePairs(): Array<{ file1: string; file2: string; frequency: number }> {
    return this.memory.behaviorSignals
      .filter((s) => s.type === 'file-pair')
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 10)
      .map((s) => ({
        file1: s.data.file1 as string,
        file2: s.data.file2 as string,
        frequency: s.frequency,
      }));
  }

  /**
   * Trim behavior signals to max count
   */
  private trimBehaviorSignals(): void {
    if (this.memory.behaviorSignals.length > MAX_BEHAVIOR_SIGNALS) {
      // Sort by frequency and keep top signals
      this.memory.behaviorSignals.sort((a, b) => b.frequency - a.frequency);
      this.memory.behaviorSignals = this.memory.behaviorSignals.slice(0, MAX_BEHAVIOR_SIGNALS);
    }
  }

  // ============================================================================
  // ANALYSIS HISTORY
  // ============================================================================

  /**
   * Record analysis
   */
  recordAnalysis(
    phase: ProjectPhase,
    fileCount: number,
    componentCount: number,
    testRatio: number,
    trigger: AnalysisHistoryEntry['trigger']
  ): void {
    this.memory.analysisHistory.push({
      timestamp: new Date().toISOString(),
      phase,
      fileCount,
      componentCount,
      testRatio,
      trigger,
    });

    // Trim to max entries
    if (this.memory.analysisHistory.length > MAX_HISTORY_ENTRIES) {
      this.memory.analysisHistory = this.memory.analysisHistory.slice(-MAX_HISTORY_ENTRIES);
    }

    this.dirty = true;
  }

  /**
   * Get analysis history
   */
  getAnalysisHistory(): AnalysisHistoryEntry[] {
    return [...this.memory.analysisHistory];
  }

  /**
   * Get recent analysis trend
   */
  getAnalysisTrend(
    windowSize: number = 10
  ): {
    fileCountTrend: 'growing' | 'stable' | 'shrinking';
    componentTrend: 'growing' | 'stable' | 'shrinking';
    testRatioTrend: 'improving' | 'stable' | 'declining';
  } {
    const recent = this.memory.analysisHistory.slice(-windowSize);

    if (recent.length < 2) {
      return {
        fileCountTrend: 'stable',
        componentTrend: 'stable',
        testRatioTrend: 'stable',
      };
    }

    const first = recent[0];
    const last = recent[recent.length - 1];

    const fileCountChange = last.fileCount - first.fileCount;
    const componentChange = last.componentCount - first.componentCount;
    const testRatioChange = last.testRatio - first.testRatio;

    return {
      fileCountTrend:
        fileCountChange > 5 ? 'growing' : fileCountChange < -5 ? 'shrinking' : 'stable',
      componentTrend:
        componentChange > 2 ? 'growing' : componentChange < -2 ? 'shrinking' : 'stable',
      testRatioTrend:
        testRatioChange > 0.05 ? 'improving' : testRatioChange < -0.05 ? 'declining' : 'stable',
    };
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  /**
   * Generate unique project ID
   */
  private generateProjectId(): string {
    const projectName = path.basename(this.projectPath);
    const hash = crypto.createHash('md5').update(this.projectPath).digest('hex').substring(0, 8);
    return `${projectName}-${hash}`;
  }

  /**
   * Clear all context (reset)
   */
  clear(): void {
    this.memory = this.createNew();
    this.dirty = true;
    this.save();
  }

  /**
   * Export context for debugging
   */
  export(): string {
    return JSON.stringify(this.memory, null, 2);
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Load or create context memory for a project
 */
export function loadContextMemory(projectPath: string): ContextMemory {
  return new ContextMemory(projectPath);
}

/**
 * Check if context memory exists for a project
 */
export function hasContextMemory(projectPath: string): boolean {
  const contextPath = path.join(projectPath, VIBECHECK_DIR, CONTEXT_FILE);
  return fs.existsSync(contextPath);
}
