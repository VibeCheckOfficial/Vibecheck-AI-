/**
 * Mission Service
 * 
 * Manages Mission Intents - the unified object model for VibeCheck's
 * Intent-centric architecture. Provides:
 * - Mission lifecycle (start, pause, complete, fail)
 * - Drift detection (scope violations, risk violations, missing proof)
 * - Proof accumulation (attach receipts to missions)
 * - Verdict computation (SHIP, WARN, BLOCK)
 * 
 * Flow: Intent → Scope → Rules → Proof Receipts → Verdict
 */

import type {
  MissionIntent,
  MissionDeclaration,
  MissionScope,
  MissionRiskPolicy,
  MissionProofRequirements,
  MissionSession,
  MissionStats,
  MissionStatus,
  MissionVerdict,
  MissionOperation,
  DriftEvent,
  DriftEventType,
  DriftSeverity,
  DriftResolution,
  DriftCheckResult,
  MissionVerdictResult,
  ProofReceiptRef,
} from '@repo/shared-types';

import {
  createMissionIntent,
  createDriftEvent,
  generateMissionId,
} from '@repo/shared-types';

// ============================================================================
// Event Types
// ============================================================================

export interface MissionServiceEvents {
  missionStarted: (mission: MissionIntent) => void;
  missionPaused: (mission: MissionIntent) => void;
  missionResumed: (mission: MissionIntent) => void;
  missionCompleted: (mission: MissionIntent, verdict: MissionVerdictResult) => void;
  missionFailed: (mission: MissionIntent, reason: string) => void;
  driftDetected: (event: DriftEvent, mission: MissionIntent) => void;
  receiptAttached: (receipt: ProofReceiptRef, mission: MissionIntent) => void;
  verdictChanged: (oldVerdict: MissionVerdict, newVerdict: MissionVerdict, mission: MissionIntent) => void;
}

type EventCallback<T extends keyof MissionServiceEvents> = MissionServiceEvents[T];

// ============================================================================
// Mission Service Class
// ============================================================================

export class MissionService {
  private currentMission: MissionIntent | null = null;
  private missionHistory: MissionIntent[] = [];
  private maxHistorySize = 50;
  private eventListeners: Map<keyof MissionServiceEvents, Set<EventCallback<keyof MissionServiceEvents>>> = new Map();

  // ============================================================================
  // Mission Lifecycle
  // ============================================================================

  /**
   * Start a new mission
   */
  startMission(declaration: MissionDeclaration): MissionIntent {
    // End current mission if active
    if (this.currentMission && this.currentMission.session.status === 'active') {
      this.completeMission('cancelled');
    }

    const mission = createMissionIntent(declaration);
    this.currentMission = mission;
    this.emit('missionStarted', mission);
    return mission;
  }

  /**
   * Get the current active mission
   */
  getCurrentMission(): MissionIntent | null {
    if (!this.currentMission) return null;

    // Check if mission has expired
    if (this.currentMission.session.expiresAt) {
      const expiresAt = new Date(this.currentMission.session.expiresAt);
      if (new Date() > expiresAt) {
        this.completeMission('failed');
        return null;
      }
    }

    return this.currentMission;
  }

  /**
   * Pause the current mission
   */
  pauseMission(): MissionIntent | null {
    if (!this.currentMission || this.currentMission.session.status !== 'active') {
      return null;
    }

    this.currentMission.session.status = 'paused';
    this.emit('missionPaused', this.currentMission);
    return this.currentMission;
  }

  /**
   * Resume a paused mission
   */
  resumeMission(): MissionIntent | null {
    if (!this.currentMission || this.currentMission.session.status !== 'paused') {
      return null;
    }

    this.currentMission.session.status = 'active';
    this.emit('missionResumed', this.currentMission);
    return this.currentMission;
  }

  /**
   * Complete the current mission
   */
  completeMission(status: 'completed' | 'failed' | 'cancelled' = 'completed'): MissionVerdictResult | null {
    if (!this.currentMission) return null;

    const mission = this.currentMission;
    mission.session.status = status;
    mission.session.endedAt = new Date().toISOString();
    
    // Calculate final stats
    const startTime = new Date(mission.session.startedAt).getTime();
    mission.stats.durationMs = Date.now() - startTime;

    // Evaluate final verdict
    const verdict = this.evaluateVerdict();
    mission.currentVerdict = verdict.verdict;

    // Archive mission
    this.missionHistory.push(mission);
    if (this.missionHistory.length > this.maxHistorySize) {
      this.missionHistory.shift();
    }

    // Clear current mission
    this.currentMission = null;

    // Emit events
    if (status === 'completed') {
      this.emit('missionCompleted', mission, verdict);
    } else if (status === 'failed') {
      this.emit('missionFailed', mission, 'Mission failed');
    }

    return verdict;
  }

  /**
   * Cancel the current mission
   */
  cancelMission(): MissionIntent | null {
    if (!this.currentMission) return null;
    
    const mission = this.currentMission;
    this.completeMission('cancelled');
    return mission;
  }

  /**
   * Get mission history
   */
  getMissionHistory(limit?: number): MissionIntent[] {
    const history = [...this.missionHistory];
    if (limit) {
      return history.slice(-limit);
    }
    return history;
  }

  // ============================================================================
  // Drift Detection
  // ============================================================================

  /**
   * Check if an action causes drift from the mission scope
   */
  checkDrift(
    filePath: string,
    operation: MissionOperation
  ): DriftCheckResult {
    const mission = this.getCurrentMission();

    // No mission = no drift (permissive by default)
    if (!mission) {
      return {
        allowed: true,
        isDrift: false,
        reason: 'No active mission - all actions allowed',
        violations: [],
        mission: null,
      };
    }

    const violations: string[] = [];
    let isDrift = false;
    let severity: DriftSeverity | undefined;
    let driftType: DriftEventType | undefined;

    // Check operation is allowed
    if (!mission.scope.allowedOperations.includes(operation)) {
      isDrift = true;
      driftType = 'operation_denied';
      severity = 'block';
      violations.push(`Operation "${operation}" not allowed in this mission`);
    }

    // Check path is in scope
    if (!this.isPathInScope(filePath, mission.scope)) {
      isDrift = true;
      driftType = driftType ?? 'scope_violation';
      severity = mission.riskPolicy.blockOnScopeViolation ? 'block' : 'warn';
      violations.push(`Path "${filePath}" is outside mission scope`);
    }

    // Check path is not excluded
    if (this.isPathExcluded(filePath, mission.scope)) {
      isDrift = true;
      driftType = driftType ?? 'scope_violation';
      severity = 'block';
      violations.push(`Path "${filePath}" is explicitly excluded from mission`);
    }

    // Check for sensitive patterns
    if (this.matchesSensitivePattern(filePath, mission.riskPolicy)) {
      isDrift = true;
      driftType = 'risk_violation';
      severity = 'block';
      violations.push(`Path "${filePath}" matches sensitive pattern - requires explicit approval`);
    }

    // Determine if allowed based on severity
    const allowed = !isDrift || severity === 'warn';

    // Record drift event if drift detected
    if (isDrift && driftType) {
      const driftEvent = createDriftEvent(
        driftType,
        severity!,
        filePath,
        operation,
        violations.join('; ')
      );
      this.recordDriftEvent(driftEvent);
    }

    // Update mission stats
    mission.session.totalChanges++;
    if (!isDrift) {
      mission.session.scopedChanges++;
      mission.stats.filesInScope++;
    } else {
      mission.session.driftCount++;
      mission.stats.filesWithDrift++;
    }
    mission.stats.filesTouched++;

    return {
      allowed,
      isDrift,
      severity,
      driftType,
      reason: isDrift
        ? `Drift detected: ${violations.join('; ')}`
        : 'Action within mission scope',
      violations,
      mission,
    };
  }

  /**
   * Record a drift event
   */
  private recordDriftEvent(event: DriftEvent): void {
    if (!this.currentMission) return;

    this.currentMission.driftEvents.push(event);
    this.emit('driftDetected', event, this.currentMission);

    // Update verdict based on drift
    this.updateVerdict();
  }

  /**
   * Resolve a drift event
   */
  resolveDriftEvent(
    eventId: string,
    resolution: DriftResolution,
    resolvedBy?: string
  ): DriftEvent | null {
    if (!this.currentMission) return null;

    const event = this.currentMission.driftEvents.find(e => e.id === eventId);
    if (!event) return null;

    event.resolution = resolution;
    event.resolvedAt = new Date().toISOString();
    event.resolvedBy = resolvedBy;

    // If extending scope, update the mission scope
    if (resolution === 'extended_scope') {
      this.extendScope({ allowedPaths: [event.file] });
    }

    // Update verdict after resolution
    this.updateVerdict();

    return event;
  }

  /**
   * Get pending drift events
   */
  getPendingDriftEvents(): DriftEvent[] {
    if (!this.currentMission) return [];
    return this.currentMission.driftEvents.filter(e => e.resolution === 'pending');
  }

  // ============================================================================
  // Proof Accumulation
  // ============================================================================

  /**
   * Attach a proof receipt to the current mission
   */
  attachReceipt(receipt: ProofReceiptRef): void {
    if (!this.currentMission) return;

    this.currentMission.receipts.push(receipt);
    this.currentMission.stats.totalReceipts++;

    if (receipt.verdict === 'PASS') {
      this.currentMission.stats.passingReceipts++;
    } else if (receipt.verdict === 'FAIL') {
      this.currentMission.stats.failingReceipts++;
    }

    // Update confidence
    this.updateConfidence();

    // Emit event
    this.emit('receiptAttached', receipt, this.currentMission);

    // Update verdict after new receipt
    this.updateVerdict();
  }

  /**
   * Get all receipts for the current mission
   */
  getReceipts(): ProofReceiptRef[] {
    return this.currentMission?.receipts ?? [];
  }

  /**
   * Check if proof requirements are met
   */
  checkProofRequirements(): { met: boolean; missing: string[] } {
    if (!this.currentMission) {
      return { met: true, missing: [] };
    }

    const requirements = this.currentMission.proofRequirements;
    const missing: string[] = [];

    // Check minimum confidence
    if (this.currentMission.stats.overallConfidence < requirements.minimumConfidence) {
      missing.push(`Confidence score (${this.currentMission.stats.overallConfidence}%) below minimum (${requirements.minimumConfidence}%)`);
    }

    // Check for failing receipts
    if (this.currentMission.stats.failingReceipts > 0) {
      missing.push(`${this.currentMission.stats.failingReceipts} failing proof receipts`);
    }

    // Check custom assertions (would need external verification)
    if (requirements.customAssertions.length > 0) {
      // Custom assertions need external verification - just note they exist
      const unverified = requirements.customAssertions.filter(assertion => {
        // Check if there's a matching receipt
        return !this.currentMission?.receipts.some(r => 
          r.title.toLowerCase().includes(assertion.toLowerCase())
        );
      });
      if (unverified.length > 0) {
        missing.push(`Unverified assertions: ${unverified.join(', ')}`);
      }
    }

    return {
      met: missing.length === 0,
      missing,
    };
  }

  // ============================================================================
  // Verdict Evaluation
  // ============================================================================

  /**
   * Evaluate the current mission verdict
   */
  evaluateVerdict(): MissionVerdictResult {
    if (!this.currentMission) {
      return {
        verdict: 'SHIP',
        confidence: 100,
        summary: 'No active mission',
        blockingIssues: [],
        warnings: [],
        proofCoverage: 100,
        driftCount: 0,
        receiptsSummary: { total: 0, passed: 0, failed: 0, skipped: 0 },
      };
    }

    const mission = this.currentMission;
    const blockingIssues: string[] = [];
    const warnings: string[] = [];

    // Check for blocking drift events
    const blockingDrifts = mission.driftEvents.filter(
      e => e.severity === 'block' && e.resolution === 'pending'
    );
    if (blockingDrifts.length > 0) {
      blockingIssues.push(`${blockingDrifts.length} unresolved blocking drift events`);
    }

    // Check for warning drift events
    const warningDrifts = mission.driftEvents.filter(
      e => e.severity === 'warn' && e.resolution === 'pending'
    );
    if (warningDrifts.length > 0) {
      warnings.push(`${warningDrifts.length} unresolved warning drift events`);
    }

    // Check failing receipts
    if (mission.stats.failingReceipts > 0) {
      if (mission.riskPolicy.blockOnMissingProof) {
        blockingIssues.push(`${mission.stats.failingReceipts} failing proof receipts`);
      } else {
        warnings.push(`${mission.stats.failingReceipts} failing proof receipts`);
      }
    }

    // Check proof requirements
    const proofCheck = this.checkProofRequirements();
    if (!proofCheck.met) {
      if (mission.riskPolicy.blockOnMissingProof) {
        blockingIssues.push(...proofCheck.missing);
      } else {
        warnings.push(...proofCheck.missing);
      }
    }

    // Calculate proof coverage
    const proofCoverage = mission.stats.totalReceipts > 0
      ? Math.round((mission.stats.passingReceipts / mission.stats.totalReceipts) * 100)
      : 0;

    // Determine verdict
    let verdict: MissionVerdict;
    if (blockingIssues.length > 0) {
      verdict = 'BLOCK';
    } else if (warnings.length > 0) {
      verdict = 'WARN';
    } else {
      verdict = 'SHIP';
    }

    // Build summary
    let summary: string;
    if (verdict === 'SHIP') {
      summary = 'Mission completed successfully - ready to ship';
    } else if (verdict === 'WARN') {
      summary = `Mission completed with ${warnings.length} warning(s) - review recommended`;
    } else {
      summary = `Mission blocked - ${blockingIssues.length} issue(s) require resolution`;
    }

    const receiptsSummary = {
      total: mission.stats.totalReceipts,
      passed: mission.stats.passingReceipts,
      failed: mission.stats.failingReceipts,
      skipped: mission.stats.totalReceipts - mission.stats.passingReceipts - mission.stats.failingReceipts,
    };

    return {
      verdict,
      confidence: mission.stats.overallConfidence,
      summary,
      blockingIssues,
      warnings,
      proofCoverage,
      driftCount: mission.driftEvents.length,
      receiptsSummary,
    };
  }

  /**
   * Update the mission verdict
   */
  private updateVerdict(): void {
    if (!this.currentMission) return;

    const oldVerdict = this.currentMission.currentVerdict;
    const result = this.evaluateVerdict();
    this.currentMission.currentVerdict = result.verdict;

    if (oldVerdict !== result.verdict) {
      this.emit('verdictChanged', oldVerdict, result.verdict, this.currentMission);
    }
  }

  /**
   * Update overall confidence based on receipts
   */
  private updateConfidence(): void {
    if (!this.currentMission) return;

    const receipts = this.currentMission.receipts;
    if (receipts.length === 0) {
      this.currentMission.stats.overallConfidence = 0;
      return;
    }

    // Calculate weighted average confidence
    const totalConfidence = receipts.reduce((sum, r) => sum + r.confidence, 0);
    this.currentMission.stats.overallConfidence = Math.round(totalConfidence / receipts.length);
  }

  // ============================================================================
  // Scope Manipulation
  // ============================================================================

  /**
   * Extend the current mission scope
   */
  extendScope(extension: Partial<MissionScope>): MissionIntent | null {
    if (!this.currentMission) return null;

    const scope = this.currentMission.scope;

    if (extension.allowedPaths) {
      scope.allowedPaths = [...new Set([...scope.allowedPaths, ...extension.allowedPaths])];
    }

    if (extension.allowedOperations) {
      scope.allowedOperations = [...new Set([...scope.allowedOperations, ...extension.allowedOperations])];
    }

    if (extension.targetFiles) {
      scope.targetFiles = [...new Set([...(scope.targetFiles ?? []), ...extension.targetFiles])];
    }

    return this.currentMission;
  }

  /**
   * Restrict the current mission scope
   */
  restrictScope(restriction: Partial<MissionScope>): MissionIntent | null {
    if (!this.currentMission) return null;

    const scope = this.currentMission.scope;

    if (restriction.allowedPaths) {
      scope.allowedPaths = restriction.allowedPaths;
    }

    if (restriction.allowedOperations) {
      scope.allowedOperations = restriction.allowedOperations;
    }

    if (restriction.excludedPaths) {
      scope.excludedPaths = [...new Set([...scope.excludedPaths, ...restriction.excludedPaths])];
    }

    return this.currentMission;
  }

  // ============================================================================
  // Path Matching Utilities
  // ============================================================================

  private isPathInScope(path: string, scope: MissionScope): boolean {
    // If target files specified, must be in that list
    if (scope.targetFiles && scope.targetFiles.length > 0) {
      return scope.targetFiles.some(target => 
        path === target || 
        path.endsWith(target) ||
        this.matchGlob(path, target)
      );
    }

    // Otherwise check against allowed paths
    return scope.allowedPaths.some(pattern => this.matchGlob(path, pattern));
  }

  private isPathExcluded(path: string, scope: MissionScope): boolean {
    return scope.excludedPaths.some(pattern => this.matchGlob(path, pattern));
  }

  private matchesSensitivePattern(path: string, policy: MissionRiskPolicy): boolean {
    return policy.sensitivePatterns.some(pattern => this.matchGlob(path, pattern));
  }

  private matchGlob(path: string, pattern: string): boolean {
    // Normalize paths
    const normalizedPath = path.replace(/\\/g, '/');
    const normalizedPattern = pattern.replace(/\\/g, '/');

    // Exact match
    if (normalizedPath === normalizedPattern) return true;

    // Wildcard matching
    if (normalizedPattern.includes('*')) {
      const regexPattern = normalizedPattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape special regex chars except * and ?
        .replace(/\*\*/g, '<<<GLOBSTAR>>>')
        .replace(/\*/g, '[^/]*')
        .replace(/<<<GLOBSTAR>>>/g, '.*')
        .replace(/\?/g, '.');
      
      const regex = new RegExp(`^${regexPattern}$`);
      return regex.test(normalizedPath);
    }

    // Directory matching
    if (normalizedPattern.endsWith('/')) {
      return normalizedPath.startsWith(normalizedPattern);
    }

    return false;
  }

  // ============================================================================
  // Event System
  // ============================================================================

  /**
   * Subscribe to an event
   */
  on<T extends keyof MissionServiceEvents>(
    event: T,
    callback: EventCallback<T>
  ): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback as EventCallback<keyof MissionServiceEvents>);

    // Return unsubscribe function
    return () => {
      this.eventListeners.get(event)?.delete(callback as EventCallback<keyof MissionServiceEvents>);
    };
  }

  /**
   * Emit an event
   */
  private emit<T extends keyof MissionServiceEvents>(
    event: T,
    ...args: Parameters<MissionServiceEvents[T]>
  ): void {
    const listeners = this.eventListeners.get(event);
    if (!listeners) return;

    for (const callback of listeners) {
      try {
        (callback as (...args: Parameters<MissionServiceEvents[T]>) => void)(...args);
      } catch (error) {
        console.error(`Error in MissionService event listener for ${event}:`, error);
      }
    }
  }

  // ============================================================================
  // Serialization
  // ============================================================================

  /**
   * Serialize current mission to JSON
   */
  toJSON(): MissionIntent | null {
    return this.currentMission ? { ...this.currentMission } : null;
  }

  /**
   * Restore mission from JSON
   */
  fromJSON(data: MissionIntent): MissionIntent {
    this.currentMission = { ...data };
    return this.currentMission;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalMissionService: MissionService | null = null;

export function getMissionService(): MissionService {
  if (!globalMissionService) {
    globalMissionService = new MissionService();
  }
  return globalMissionService;
}

export function resetMissionService(): void {
  globalMissionService = null;
}
