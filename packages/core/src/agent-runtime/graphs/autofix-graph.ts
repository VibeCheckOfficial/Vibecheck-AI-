/**
 * AutoFix Graph (autofix_v1)
 * 
 * LangGraph workflow for mission-driven auto-fixing.
 * 
 * Flow:
 * IngestFindings → ClusterToMissions → SelectMission → ProposePatch → 
 * RiskScorePatch → ApprovalGate → ApplyPatch → VerifyPatch → AcceptOrRollback → Emit
 */

import { randomUUID } from 'crypto';
import type {
  AutoFixState,
  Mission,
  MissionStatus,
  PatchProposal,
  Receipt,
  RiskTier,
  SAFETY_LIMITS,
} from '../types.js';
import { EvidenceStore } from '../evidence/evidence-store.js';
import { ToolRuntime } from '../tools/tool-runtime.js';

// ============================================================================
// Types
// ============================================================================

export interface AutoFixGraphConfig {
  /** Project root */
  projectRoot: string;
  /** Tool runtime instance */
  toolRuntime: ToolRuntime;
  /** Evidence store instance */
  evidenceStore: EvidenceStore;
  /** Auto-approval threshold (0-100) */
  autoApprovalThreshold: number;
  /** Max attempts per mission */
  maxMissionAttempts: number;
  /** Max patch lines */
  maxPatchLines: number;
  /** Callback for approval requests */
  onApprovalRequired?: (mission: Mission, patch: PatchProposal) => Promise<boolean>;
  /** Callback for state updates */
  onStateChange?: (state: AutoFixState) => void;
  /** Callback for errors */
  onError?: (error: Error, node: string) => void;
}

export interface AutoFixGraphResult {
  success: boolean;
  state: AutoFixState;
  missionsCompleted: number;
  missionsFailed: number;
  error?: string;
  durationMs: number;
}

type GraphNode = (state: AutoFixState, config: AutoFixGraphConfig) => Promise<AutoFixState>;

// ============================================================================
// Graph Nodes
// ============================================================================

/**
 * Node: IngestFindings
 * Load and validate input findings
 */
const ingestFindings: GraphNode = async (state, config) => {
  try {
    // Validate findings
    const validFindings = state.findings.filter(f => 
      f.id && f.type && f.severity && f.message
    );

    return {
      ...state,
      findings: validFindings,
      currentNode: 'ClusterToMissions',
      error: null,
    };
  } catch (error) {
    return {
      ...state,
      currentNode: 'IngestFindings',
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

/**
 * Node: ClusterToMissions
 * Group findings into missions by root cause
 */
const clusterToMissions: GraphNode = async (state, config) => {
  try {
    const missions: Mission[] = [];
    const findingsByType = new Map<string, typeof state.findings>();

    // Group findings by type
    for (const finding of state.findings) {
      const existing = findingsByType.get(finding.type) ?? [];
      existing.push(finding);
      findingsByType.set(finding.type, existing);
    }

    // Create missions from grouped findings
    for (const [type, findings] of findingsByType) {
      const missionId = `mission_${Date.now()}_${randomUUID().slice(0, 8)}`;
      
      // Extract affected files
      const filesInScope = [...new Set(
        findings
          .map(f => f.filePath)
          .filter((p): p is string => !!p)
          .slice(0, 10) // Cap files
      )];

      // Determine risk tier based on finding severity
      const hasCritical = findings.some(f => f.severity === 'critical');
      const hasHigh = findings.some(f => f.severity === 'high');
      const riskTier: RiskTier = hasCritical ? 'HIGH' : hasHigh ? 'MEDIUM' : 'LOW';

      const mission: Mission = {
        missionId,
        title: `Fix ${type} issues (${findings.length} finding${findings.length > 1 ? 's' : ''})`,
        rootCauseHypothesis: generateRootCauseHypothesis(type, findings),
        filesInScope,
        acceptanceCriteria: generateAcceptanceCriteria(type),
        verificationPlan: {
          runTypecheck: true,
          runUnitTests: filesInScope.some(f => f.includes('test')),
          runProofScenarios: [],
        },
        riskTier,
        status: 'pending',
        sourceFindingIds: findings.map(f => f.id),
        attempts: 0,
        maxAttempts: config.maxMissionAttempts,
      };

      missions.push(mission);
    }

    // Sort by priority (highest severity first, then smallest scope)
    missions.sort((a, b) => {
      const riskOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
      const riskDiff = riskOrder[a.riskTier] - riskOrder[b.riskTier];
      if (riskDiff !== 0) return riskDiff;
      return a.filesInScope.length - b.filesInScope.length;
    });

    return {
      ...state,
      missions,
      currentNode: 'SelectMission',
    };
  } catch (error) {
    return {
      ...state,
      currentNode: 'ClusterToMissions',
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

/**
 * Node: SelectMission
 * Select next mission to process
 */
const selectMission: GraphNode = async (state, config) => {
  try {
    // Find next pending mission
    const nextMission = state.missions.find(m => 
      m.status === 'pending' && m.attempts < m.maxAttempts
    );

    if (!nextMission) {
      // No more missions to process
      return {
        ...state,
        currentMission: null,
        currentNode: 'Emit',
      };
    }

    // Update mission status
    const updatedMissions = state.missions.map(m =>
      m.missionId === nextMission.missionId
        ? { ...m, status: 'in_progress' as MissionStatus, attempts: m.attempts + 1 }
        : m
    );

    return {
      ...state,
      missions: updatedMissions,
      currentMission: nextMission.missionId,
      currentNode: 'ProposePatch',
    };
  } catch (error) {
    return {
      ...state,
      currentNode: 'SelectMission',
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

/**
 * Node: ProposePatch
 * Generate a patch proposal for the current mission
 */
const proposePatch: GraphNode = async (state, config) => {
  const mission = state.missions.find(m => m.missionId === state.currentMission);
  
  if (!mission) {
    return {
      ...state,
      currentNode: 'SelectMission',
      error: 'Mission not found',
    };
  }

  try {
    // Use tool runtime to propose patch
    const result = await config.toolRuntime.execute('patch.propose', {
      goal: mission.title,
      files: mission.filesInScope.map(path => ({
        path,
        operation: 'modify' as const,
      })),
      constraints: {
        maxLines: config.maxPatchLines,
      },
      missionId: mission.missionId,
    });

    if (!result.success) {
      // Mark mission as failed and move to next
      const updatedMissions = state.missions.map(m =>
        m.missionId === mission.missionId
          ? { ...m, status: 'failed' as MissionStatus }
          : m
      );

      return {
        ...state,
        missions: updatedMissions,
        currentMission: null,
        currentNode: 'SelectMission',
      };
    }

    const patchData = result.data as { patchId: string; linesChanged: number };
    
    // Create patch proposal
    const patch: PatchProposal = {
      patchId: patchData.patchId,
      missionId: mission.missionId,
      diff: '', // Would be populated from tool result
      filesModified: mission.filesInScope,
      linesChanged: patchData.linesChanged,
      explanation: `Addressing ${mission.title}`,
      expectedBehaviorChanges: mission.acceptanceCriteria,
      rollbackPlan: 'Restore from checkpoint',
      verificationRationale: 'Run typecheck and targeted tests',
      riskScore: 0, // Will be calculated in RiskScorePatch
      riskTier: 'LOW',
      createdAt: new Date().toISOString(),
    };

    return {
      ...state,
      patchCandidates: [...state.patchCandidates, patch],
      currentNode: 'RiskScorePatch',
    };
  } catch (error) {
    return {
      ...state,
      currentNode: 'ProposePatch',
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

/**
 * Node: RiskScorePatch
 * Calculate risk score for the current patch
 */
const riskScorePatch: GraphNode = async (state, config) => {
  const currentPatch = state.patchCandidates[state.patchCandidates.length - 1];
  const mission = state.missions.find(m => m.missionId === state.currentMission);

  if (!currentPatch || !mission) {
    return {
      ...state,
      currentNode: 'SelectMission',
      error: 'No patch or mission found',
    };
  }

  try {
    let riskScore = 0;

    // Factor 1: Files touched
    const sensitivePatterns = [
      /auth/i, /security/i, /payment/i, /billing/i, /config/i, /env/i, /secret/i
    ];
    
    for (const file of currentPatch.filesModified) {
      if (sensitivePatterns.some(p => p.test(file))) {
        riskScore += 20;
      }
    }

    // Factor 2: Lines changed
    if (currentPatch.linesChanged > 100) {
      riskScore += 15;
    } else if (currentPatch.linesChanged > 50) {
      riskScore += 10;
    }

    // Factor 3: Number of files
    if (currentPatch.filesModified.length > 5) {
      riskScore += 15;
    }

    // Factor 4: Mission risk tier
    const tierRisk = { HIGH: 30, MEDIUM: 15, LOW: 0 };
    riskScore += tierRisk[mission.riskTier];

    // Cap at 100
    riskScore = Math.min(100, riskScore);

    // Determine tier
    const riskTier: RiskTier = riskScore >= 60 ? 'HIGH' : riskScore >= 30 ? 'MEDIUM' : 'LOW';

    // Update patch
    const updatedPatches = state.patchCandidates.map((p, i) =>
      i === state.patchCandidates.length - 1
        ? { ...p, riskScore, riskTier }
        : p
    );

    return {
      ...state,
      patchCandidates: updatedPatches,
      riskScore,
      currentNode: 'ApprovalGate',
    };
  } catch (error) {
    return {
      ...state,
      currentNode: 'RiskScorePatch',
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

/**
 * Node: ApprovalGate
 * Check if patch requires approval
 */
const approvalGate: GraphNode = async (state, config) => {
  const currentPatch = state.patchCandidates[state.patchCandidates.length - 1];
  const mission = state.missions.find(m => m.missionId === state.currentMission);

  if (!currentPatch || !mission) {
    return {
      ...state,
      currentNode: 'SelectMission',
      error: 'No patch or mission found',
    };
  }

  try {
    const requiresApproval = currentPatch.riskTier === 'HIGH' || 
      state.riskScore > config.autoApprovalThreshold;

    if (requiresApproval) {
      if (!config.onApprovalRequired) {
        // No approval handler - mark as awaiting
        return {
          ...state,
          awaitingApproval: true,
          currentNode: 'AwaitingApproval',
        };
      }

      const approved = await config.onApprovalRequired(mission, currentPatch);

      if (!approved) {
        // Approval denied - skip this mission
        const updatedMissions = state.missions.map(m =>
          m.missionId === mission.missionId
            ? { ...m, status: 'cancelled' as MissionStatus }
            : m
        );

        return {
          ...state,
          missions: updatedMissions,
          currentMission: null,
          awaitingApproval: false,
          currentNode: 'SelectMission',
        };
      }
    }

    return {
      ...state,
      awaitingApproval: false,
      currentNode: 'ApplyPatch',
    };
  } catch (error) {
    return {
      ...state,
      currentNode: 'ApprovalGate',
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

/**
 * Node: ApplyPatch
 * Apply the patch with checkpoint creation
 */
const applyPatch: GraphNode = async (state, config) => {
  const currentPatch = state.patchCandidates[state.patchCandidates.length - 1];

  if (!currentPatch) {
    return {
      ...state,
      currentNode: 'SelectMission',
      error: 'No patch found',
    };
  }

  try {
    // Apply via tool runtime (creates checkpoint automatically)
    const result = await config.toolRuntime.execute('patch.apply', {
      diffId: currentPatch.patchId,
      verificationPlan: state.verificationPlan ?? {
        runTypecheck: true,
      },
    });

    if (!result.success) {
      return {
        ...state,
        currentNode: 'AcceptOrRollback',
        verificationResults: {
          receipts: [],
          passed: false,
          failureReason: result.error,
        },
      };
    }

    const applyResult = result.data as { checkpointId?: string };

    return {
      ...state,
      checkpointId: applyResult.checkpointId ?? null,
      currentNode: 'VerifyPatch',
    };
  } catch (error) {
    return {
      ...state,
      currentNode: 'ApplyPatch',
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

/**
 * Node: VerifyPatch
 * Run verification tests on applied patch
 */
const verifyPatch: GraphNode = async (state, config) => {
  const mission = state.missions.find(m => m.missionId === state.currentMission);

  if (!mission) {
    return {
      ...state,
      currentNode: 'AcceptOrRollback',
      verificationResults: {
        receipts: [],
        passed: false,
        failureReason: 'Mission not found',
      },
    };
  }

  try {
    const receipts: Receipt[] = [];
    let passed = true;
    let failureReason: string | undefined;

    // Run typecheck
    if (mission.verificationPlan.runTypecheck) {
      const result = await config.toolRuntime.execute('test.run', {
        type: 'typecheck',
        timeout: 60,
      });

      if (!result.success) {
        passed = false;
        failureReason = 'Typecheck failed';
      }

      // Create receipt
      const receipt = await config.evidenceStore.storeReceipt({
        runId: `verify_${state.currentMission}`,
        kind: 'test',
        summary: `Typecheck: ${result.success ? 'passed' : 'failed'}`,
        signals: [
          { id: 'typecheck.passed', value: result.success },
        ],
      });
      receipts.push(receipt);
    }

    // Run unit tests if needed
    if (mission.verificationPlan.runUnitTests && passed) {
      const result = await config.toolRuntime.execute('test.run', {
        type: 'unit',
        scope: mission.filesInScope.filter(f => f.includes('test')),
        timeout: 120,
        failFast: true,
      });

      if (!result.success) {
        passed = false;
        failureReason = 'Unit tests failed';
      }

      const receipt = await config.evidenceStore.storeReceipt({
        runId: `verify_${state.currentMission}`,
        kind: 'test',
        summary: `Unit tests: ${result.success ? 'passed' : 'failed'}`,
        signals: [
          { id: 'tests.unit.passed', value: result.success },
        ],
      });
      receipts.push(receipt);
    }

    return {
      ...state,
      verificationResults: {
        receipts,
        passed,
        failureReason,
      },
      currentNode: 'AcceptOrRollback',
    };
  } catch (error) {
    return {
      ...state,
      currentNode: 'VerifyPatch',
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

/**
 * Node: AcceptOrRollback
 * Accept patch or rollback based on verification
 */
const acceptOrRollback: GraphNode = async (state, config) => {
  const mission = state.missions.find(m => m.missionId === state.currentMission);

  if (!mission) {
    return {
      ...state,
      currentMission: null,
      currentNode: 'SelectMission',
    };
  }

  try {
    if (state.verificationResults?.passed) {
      // Accept patch - update mission status
      const updatedMissions = state.missions.map(m =>
        m.missionId === mission.missionId
          ? { ...m, status: 'completed' as MissionStatus }
          : m
      );

      return {
        ...state,
        missions: updatedMissions,
        currentMission: null,
        verificationResults: null,
        currentNode: 'SelectMission',
      };
    }

    // Rollback
    if (state.checkpointId) {
      await config.toolRuntime.execute('patch.rollback', {
        checkpointId: state.checkpointId,
      });
    }

    // Check if we should retry
    const canRetry = mission.attempts < mission.maxAttempts;

    const updatedMissions = state.missions.map(m =>
      m.missionId === mission.missionId
        ? { 
            ...m, 
            status: canRetry ? 'pending' as MissionStatus : 'failed' as MissionStatus 
          }
        : m
    );

    return {
      ...state,
      missions: updatedMissions,
      currentMission: null,
      checkpointId: null,
      verificationResults: null,
      currentNode: 'SelectMission',
    };
  } catch (error) {
    return {
      ...state,
      currentNode: 'AcceptOrRollback',
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

/**
 * Node: Emit
 * Final node - emit results
 */
const emit: GraphNode = async (state, config) => {
  return {
    ...state,
    currentNode: 'Complete',
  };
};

// ============================================================================
// Graph Orchestrator
// ============================================================================

const NODE_MAP: Record<string, GraphNode> = {
  'IngestFindings': ingestFindings,
  'ClusterToMissions': clusterToMissions,
  'SelectMission': selectMission,
  'ProposePatch': proposePatch,
  'RiskScorePatch': riskScorePatch,
  'ApprovalGate': approvalGate,
  'ApplyPatch': applyPatch,
  'VerifyPatch': verifyPatch,
  'AcceptOrRollback': acceptOrRollback,
  'Emit': emit,
};

/**
 * Execute the AutoFix graph
 */
export async function executeAutoFixGraph(
  findings: AutoFixState['findings'],
  config: AutoFixGraphConfig
): Promise<AutoFixGraphResult> {
  const startTime = Date.now();

  // Initialize state
  let state: AutoFixState = {
    findings,
    missions: [],
    currentMission: null,
    patchCandidates: [],
    verificationPlan: null,
    verificationResults: null,
    riskScore: 0,
    checkpointId: null,
    currentNode: 'IngestFindings',
    error: null,
    awaitingApproval: false,
  };

  // Execute graph
  const maxIterations = 100; // Safety limit
  let iterations = 0;

  while (state.currentNode !== 'Complete' && iterations < maxIterations) {
    iterations++;

    // Check for awaiting approval state
    if (state.currentNode === 'AwaitingApproval') {
      break;
    }

    const node = NODE_MAP[state.currentNode];
    
    if (!node) {
      state.error = `Unknown node: ${state.currentNode}`;
      break;
    }

    try {
      state = await node(state, config);
      config.onStateChange?.(state);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      config.onError?.(err, state.currentNode);
      state.error = err.message;
      break;
    }

    if (state.error) {
      break;
    }
  }

  const missionsCompleted = state.missions.filter(m => m.status === 'completed').length;
  const missionsFailed = state.missions.filter(m => m.status === 'failed').length;

  return {
    success: !state.error && state.currentNode === 'Complete',
    state,
    missionsCompleted,
    missionsFailed,
    error: state.error ?? undefined,
    durationMs: Date.now() - startTime,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

function generateRootCauseHypothesis(type: string, findings: AutoFixState['findings']): string {
  const typeHypotheses: Record<string, string> = {
    'ghost-env': 'Environment variable referenced but not defined in configuration',
    'ghost-route': 'Route referenced in code but not defined in router',
    'ghost-import': 'Module imported but package not installed or export not found',
    'auth-gap': 'Protected resource accessible without proper authentication',
    'silent-failure': 'Error condition not properly handled or reported',
    'fake-success': 'Success state shown despite underlying failure',
  };

  return typeHypotheses[type] ?? `Issue of type ${type} detected in ${findings.length} location(s)`;
}

function generateAcceptanceCriteria(type: string): string[] {
  const typeCriteria: Record<string, string[]> = {
    'ghost-env': [
      'Environment variable is defined or reference is removed',
      'No undefined env var errors in build',
    ],
    'ghost-route': [
      'Route is properly registered in router',
      'Route returns expected response',
    ],
    'ghost-import': [
      'Import resolves correctly',
      'No module resolution errors',
    ],
    'auth-gap': [
      'Protected resource requires authentication',
      'Unauthenticated access returns 401/403',
    ],
    'silent-failure': [
      'Error is properly caught and reported',
      'User sees appropriate error message',
    ],
  };

  return typeCriteria[type] ?? ['Issue is resolved', 'No regressions introduced'];
}

// ============================================================================
// Export
// ============================================================================

export type { AutoFixGraphConfig, AutoFixGraphResult };
