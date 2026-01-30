/**
 * VibeCheck Agent Runtime v1 - Core Types
 * 
 * LangGraph Reality Mode + AutoFix + Ship Gate Enforcement
 */

import { z } from 'zod';
import type { ProofReceipt } from '../reality/types.js';

// ============================================================================
// Receipt Schema (Machine-Readable Evidence)
// ============================================================================

export const ReceiptKindSchema = z.enum([
  'test',
  'runtime',
  'network',
  'ui',
  'security',
  'policy',
  'chaos',
]);

export type ReceiptKind = z.infer<typeof ReceiptKindSchema>;

export const ReceiptSignalSchema = z.object({
  /** Signal identifier */
  id: z.string(),
  /** Boolean or numeric value for policy evaluation */
  value: z.union([z.boolean(), z.number()]),
  /** Human-readable description */
  description: z.string().optional(),
});

export type ReceiptSignal = z.infer<typeof ReceiptSignalSchema>;

export const ReceiptSchema = z.object({
  /** Unique receipt ID */
  receiptId: z.string(),
  /** Type of evidence */
  kind: ReceiptKindSchema,
  /** Summary of what was verified */
  summary: z.string(),
  /** Paths/hashes to actual evidence files */
  evidenceRefs: z.array(z.object({
    path: z.string(),
    hash: z.string().optional(),
    type: z.enum(['screenshot', 'trace', 'har', 'log', 'diff', 'video']),
  })),
  /** Machine-readable signals for policy engine */
  signals: z.array(ReceiptSignalSchema),
  /** Timestamp */
  timestamp: z.string(),
  /** Run ID this receipt belongs to */
  runId: z.string(),
});

export type Receipt = z.infer<typeof ReceiptSchema>;

// ============================================================================
// Ship Gate Verdict
// ============================================================================

export const ShipVerdictSchema = z.enum(['SHIP', 'WARN', 'BLOCK']);
export type ShipVerdict = z.infer<typeof ShipVerdictSchema>;

export const BlockingReasonSchema = z.object({
  /** Rule that caused the block */
  ruleId: z.string(),
  /** Human-readable message */
  message: z.string(),
  /** Receipt IDs that provide evidence */
  receiptIds: z.array(z.string()),
  /** Severity level */
  severity: z.enum(['critical', 'high', 'medium']),
});

export type BlockingReason = z.infer<typeof BlockingReasonSchema>;

export const ShipGateResultSchema = z.object({
  /** Final verdict */
  verdict: ShipVerdictSchema,
  /** Reasons for blocking (if verdict is BLOCK) */
  blockingReasons: z.array(BlockingReasonSchema),
  /** Warnings (if verdict is WARN or SHIP) */
  warnings: z.array(z.object({
    ruleId: z.string(),
    message: z.string(),
    receiptIds: z.array(z.string()),
  })),
  /** Recommended actions */
  recommendedActions: z.array(z.object({
    action: z.string(),
    missionId: z.string().optional(),
    priority: z.enum(['high', 'medium', 'low']),
  })),
  /** Total receipts evaluated */
  receiptsEvaluated: z.number(),
  /** Timestamp */
  timestamp: z.string(),
});

export type ShipGateResult = z.infer<typeof ShipGateResultSchema>;

// ============================================================================
// Proof Plan Schema
// ============================================================================

export const ProofStepSchema = z.object({
  /** Step type */
  type: z.enum(['navigate', 'click', 'fill', 'wait', 'assert', 'screenshot', 'network']),
  /** Target selector or URL */
  target: z.string().optional(),
  /** Value for fill/assert */
  value: z.string().optional(),
  /** Timeout in ms */
  timeout: z.number().optional(),
  /** Description */
  description: z.string(),
});

export type ProofStep = z.infer<typeof ProofStepSchema>;

export const ProofAssertionSchema = z.object({
  /** Assertion type */
  type: z.enum(['dom', 'network', 'console', 'status', 'auth', 'text', 'element']),
  /** What to check */
  target: z.string(),
  /** Expected value/condition */
  expected: z.string(),
  /** Comparison operator */
  operator: z.enum(['equals', 'contains', 'matches', 'exists', 'notExists', 'greaterThan', 'lessThan']).default('equals'),
  /** Description */
  description: z.string(),
});

export type ProofAssertion = z.infer<typeof ProofAssertionSchema>;

export const ProofScenarioSchema = z.object({
  /** Scenario name */
  name: z.string(),
  /** Preconditions required */
  preconditions: z.object({
    authState: z.enum(['anonymous', 'authenticated', 'admin']).optional(),
    seededData: z.array(z.string()).optional(),
    envVars: z.array(z.string()).optional(),
  }),
  /** Steps to execute */
  steps: z.array(ProofStepSchema),
  /** Assertions to verify */
  assertions: z.array(ProofAssertionSchema),
  /** Required artifacts */
  artifactsRequired: z.array(z.enum(['trace', 'screenshot', 'har', 'video'])),
});

export type ProofScenario = z.infer<typeof ProofScenarioSchema>;

export const ProofPlanSchema = z.object({
  /** Plan ID */
  planId: z.string(),
  /** Scenarios to execute */
  scenarios: z.array(ProofScenarioSchema).max(10), // Cap at 10 scenarios
  /** Generated from diff */
  sourceCommit: z.string().optional(),
  /** Routes impacted */
  routesImpacted: z.array(z.string()),
  /** Timestamp */
  createdAt: z.string(),
});

export type ProofPlan = z.infer<typeof ProofPlanSchema>;

// ============================================================================
// Chaos Plan Schema
// ============================================================================

export const ChaosTypeSchema = z.enum([
  'network_latency',
  'network_drop',
  'network_error',
  'data_partial_json',
  'data_null_fields',
  'auth_expired_token',
  'auth_missing_refresh',
  'browser_slow_cpu',
  'browser_storage_disabled',
]);

export type ChaosType = z.infer<typeof ChaosTypeSchema>;

export const ChaosTestSchema = z.object({
  /** Chaos type */
  type: ChaosTypeSchema,
  /** Test name */
  name: z.string(),
  /** Configuration */
  config: z.object({
    /** For network latency: p50/p95 bounds in ms */
    latencyMs: z.object({ p50: z.number(), p95: z.number() }).optional(),
    /** For network drop: percentage 0-10 */
    dropPercent: z.number().min(0).max(10).optional(),
    /** For network error: status code */
    errorStatus: z.number().optional(),
    /** Target endpoints (glob patterns) */
    targetEndpoints: z.array(z.string()).optional(),
    /** Fields to nullify */
    nullFields: z.array(z.string()).optional(),
  }),
  /** Maximum duration in seconds */
  maxDurationSec: z.number().max(60),
  /** Fail fast on first error */
  failFast: z.boolean().default(true),
});

export type ChaosTest = z.infer<typeof ChaosTestSchema>;

export const ChaosPlanSchema = z.object({
  /** Plan ID */
  planId: z.string(),
  /** Tests to run */
  tests: z.array(ChaosTestSchema).max(5), // Cap at 5 chaos tests
  /** Global max duration */
  maxTotalDurationSec: z.number().max(180), // 3 minutes max
  /** Created timestamp */
  createdAt: z.string(),
});

export type ChaosPlan = z.infer<typeof ChaosPlanSchema>;

// ============================================================================
// Mission Schema (AutoFix)
// ============================================================================

export const MissionStatusSchema = z.enum([
  'pending',
  'in_progress',
  'patch_proposed',
  'verification_pending',
  'completed',
  'failed',
  'cancelled',
]);

export type MissionStatus = z.infer<typeof MissionStatusSchema>;

export const RiskTierSchema = z.enum(['LOW', 'MEDIUM', 'HIGH']);
export type RiskTier = z.infer<typeof RiskTierSchema>;

export const MissionSchema = z.object({
  /** Unique mission ID */
  missionId: z.string(),
  /** Human-readable title */
  title: z.string(),
  /** Root cause hypothesis */
  rootCauseHypothesis: z.string(),
  /** Files in scope for this mission */
  filesInScope: z.array(z.string()).max(10), // Cap files per mission
  /** Acceptance criteria */
  acceptanceCriteria: z.array(z.string()),
  /** Verification requirements */
  verificationPlan: z.object({
    runTypecheck: z.boolean(),
    runUnitTests: z.boolean(),
    runProofScenarios: z.array(z.string()), // Scenario IDs
  }),
  /** Computed risk tier */
  riskTier: RiskTierSchema,
  /** Current status */
  status: MissionStatusSchema,
  /** Source findings that created this mission */
  sourceFindingIds: z.array(z.string()),
  /** Attempt count */
  attempts: z.number().default(0),
  /** Max attempts allowed */
  maxAttempts: z.number().default(3),
});

export type Mission = z.infer<typeof MissionSchema>;

// ============================================================================
// Patch Schema
// ============================================================================

export const PatchProposalSchema = z.object({
  /** Unique patch ID */
  patchId: z.string(),
  /** Mission this patch addresses */
  missionId: z.string(),
  /** Unified diff */
  diff: z.string(),
  /** Files modified */
  filesModified: z.array(z.string()),
  /** Lines changed */
  linesChanged: z.number(),
  /** Explanation of changes */
  explanation: z.string(),
  /** Expected behavior changes */
  expectedBehaviorChanges: z.array(z.string()),
  /** Rollback plan */
  rollbackPlan: z.string(),
  /** How verification proves correctness */
  verificationRationale: z.string(),
  /** Risk score 0-100 */
  riskScore: z.number().min(0).max(100),
  /** Risk tier derived from score */
  riskTier: RiskTierSchema,
  /** Timestamp */
  createdAt: z.string(),
});

export type PatchProposal = z.infer<typeof PatchProposalSchema>;

// ============================================================================
// Graph State Schemas
// ============================================================================

/**
 * Reality Mode Graph State
 */
export const RealityModeStateSchema = z.object({
  /** Repo snapshot info */
  repoSnapshot: z.object({
    commitHash: z.string(),
    truthpackVersion: z.string(),
  }),
  /** Scope of verification */
  scope: z.object({
    routes: z.array(z.string()),
    features: z.array(z.string()),
  }),
  /** Generated proof plan */
  proofPlan: ProofPlanSchema.nullable(),
  /** Optional chaos plan */
  chaosPlan: ChaosPlanSchema.nullable(),
  /** Collected artifacts */
  artifacts: z.array(z.object({
    type: z.enum(['trace', 'screenshot', 'har', 'video', 'log']),
    path: z.string(),
    hash: z.string(),
  })),
  /** Runtime findings */
  findings: z.array(z.object({
    id: z.string(),
    severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
    message: z.string(),
    route: z.string().optional(),
    evidence: z.record(z.unknown()).optional(),
  })),
  /** Generated receipts */
  receipts: z.array(ReceiptSchema),
  /** Inputs for policy evaluation */
  verdictInputs: z.record(z.union([z.boolean(), z.number()])),
  /** Current node in graph */
  currentNode: z.string(),
  /** Error state */
  error: z.string().nullable(),
});

export type RealityModeState = z.infer<typeof RealityModeStateSchema>;

/**
 * AutoFix Graph State
 */
export const AutoFixStateSchema = z.object({
  /** Input findings */
  findings: z.array(z.object({
    id: z.string(),
    type: z.string(),
    severity: z.enum(['critical', 'high', 'medium', 'low']),
    message: z.string(),
    filePath: z.string().optional(),
    line: z.number().optional(),
  })),
  /** Grouped missions */
  missions: z.array(MissionSchema),
  /** Currently active mission */
  currentMission: z.string().nullable(),
  /** Patch candidates */
  patchCandidates: z.array(PatchProposalSchema),
  /** Verification plan for current patch */
  verificationPlan: z.object({
    tests: z.array(z.string()),
    proofScenarios: z.array(z.string()),
  }).nullable(),
  /** Verification results */
  verificationResults: z.object({
    receipts: z.array(ReceiptSchema),
    passed: z.boolean(),
    failureReason: z.string().optional(),
  }).nullable(),
  /** Current risk score */
  riskScore: z.number(),
  /** Checkpoint ID for rollback */
  checkpointId: z.string().nullable(),
  /** Current node */
  currentNode: z.string(),
  /** Error state */
  error: z.string().nullable(),
  /** Requires human approval */
  awaitingApproval: z.boolean(),
});

export type AutoFixState = z.infer<typeof AutoFixStateSchema>;

/**
 * Ship Gate Graph State
 */
export const ShipGateStateSchema = z.object({
  /** Truthpack snapshot */
  truthpackSnapshot: z.object({
    version: z.string(),
    hash: z.string(),
  }),
  /** Diff summary */
  diffSummary: z.object({
    filesChanged: z.number(),
    linesAdded: z.number(),
    linesRemoved: z.number(),
    affectedRoutes: z.array(z.string()),
  }),
  /** Static scan findings */
  staticFindings: z.array(z.object({
    id: z.string(),
    severity: z.string(),
    message: z.string(),
  })),
  /** Reality mode receipts */
  runtimeReceipts: z.array(ReceiptSchema),
  /** Test receipts */
  testReceipts: z.array(ReceiptSchema),
  /** Collected policy signals */
  policySignals: z.record(z.union([z.boolean(), z.number()])),
  /** Final result */
  result: ShipGateResultSchema.nullable(),
  /** Current node */
  currentNode: z.string(),
  /** Error state */
  error: z.string().nullable(),
});

export type ShipGateState = z.infer<typeof ShipGateStateSchema>;

// ============================================================================
// Tool Call Result Types
// ============================================================================

export interface ToolCallResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  /** Tool-specific metadata */
  metadata?: Record<string, unknown>;
}

export interface WriteToolResult extends ToolCallResult {
  /** Whether the write requires approval */
  requiresApproval: boolean;
  /** Risk assessment */
  riskAssessment?: {
    tier: RiskTier;
    reasons: string[];
  };
  /** Checkpoint created before write */
  checkpointId?: string;
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface AgentRuntimeConfig {
  /** Project root path */
  projectRoot: string;
  /** Truthpack path relative to project root */
  truthpackPath: string;
  /** Evidence storage path */
  evidencePath: string;
  /** Policy configuration */
  policy: PolicyConfig;
  /** Budget limits */
  budgets: BudgetConfig;
  /** Feature flags */
  features: FeatureFlags;
}

export interface PolicyConfig {
  /** Strictness level */
  strictness: 'relaxed' | 'standard' | 'paranoid';
  /** Allow lockfile edits */
  allowLockfileEdits: boolean;
  /** Max lines per patch */
  maxPatchLines: number;
  /** Max runtime minutes per run type */
  maxRuntimeMinutes: Record<string, number>;
  /** Enable chaos testing */
  chaosEnabled: boolean;
  /** Required receipts per repo type */
  requiredReceipts: string[];
  /** Custom BLOCK rules */
  customBlockRules: string[];
}

export interface BudgetConfig {
  /** Token budget per run type */
  tokenBudgets: Record<string, number>;
  /** BYO key mode */
  byoKeyEnabled: boolean;
  /** Offline mode (local models) */
  offlineMode: boolean;
}

export interface FeatureFlags {
  /** Enable AI-assisted proof planning */
  aiProofPlanning: boolean;
  /** Enable AI-assisted patch generation */
  aiPatchGeneration: boolean;
  /** Enable chaos testing */
  chaosEnabled: boolean;
  /** Enable auto-approval for low-risk patches */
  autoApprovalLowRisk: boolean;
}

// ============================================================================
// Safety Limits (Non-Configurable)
// ============================================================================

export const SAFETY_LIMITS = {
  /** Max scenarios per proof plan */
  MAX_SCENARIOS: 10,
  /** Max assertions per scenario */
  MAX_ASSERTIONS_PER_SCENARIO: 15,
  /** Max chaos tests per plan */
  MAX_CHAOS_TESTS: 5,
  /** Max runtime per local run (minutes) */
  MAX_RUNTIME_LOCAL_MINUTES: 10,
  /** Max runtime per CI run (minutes) */
  MAX_RUNTIME_CI_MINUTES: 15,
  /** Max mission attempts */
  MAX_MISSION_ATTEMPTS: 3,
  /** Max patch size (lines) */
  MAX_PATCH_LINES: 500,
  /** Max files per mission */
  MAX_FILES_PER_MISSION: 10,
  /** Flake retry count */
  FLAKE_RETRY_COUNT: 1,
} as const;

// ============================================================================
// Exports
// ============================================================================

export {
  type ProofReceipt,
};
