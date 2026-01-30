/**
 * Ship Gate Graph (ship_gate_v1)
 * 
 * LangGraph workflow for deterministic ship/no-ship enforcement.
 * 
 * CRITICAL: The LLM NEVER has final authority. Ship Gate is a policy evaluation step
 * that consumes receipts. LLM usage is ONLY for summarizing and categorizing (advisory).
 * 
 * Flow:
 * CollectReceipts → EvaluatePolicy → ExplainVerdict → EmitVerdict
 */

import type {
  ShipGateState,
  Receipt,
  ShipGateResult,
} from '../types.js';
import { EvidenceStore } from '../evidence/evidence-store.js';
import { ShipGateEngine, type EvaluationContext } from '../policy/ship-gate.js';
import { ToolRuntime } from '../tools/tool-runtime.js';

// ============================================================================
// Types
// ============================================================================

export interface ShipGateGraphConfig {
  /** Project root */
  projectRoot: string;
  /** Tool runtime instance */
  toolRuntime: ToolRuntime;
  /** Evidence store instance */
  evidenceStore: EvidenceStore;
  /** Ship gate engine instance */
  shipGateEngine: ShipGateEngine;
  /** Run IDs to collect receipts from */
  runIds?: string[];
  /** Callback for state updates */
  onStateChange?: (state: ShipGateState) => void;
  /** Callback for verdict */
  onVerdict?: (result: ShipGateResult) => void;
}

export interface ShipGateGraphResult {
  success: boolean;
  state: ShipGateState;
  verdict: ShipGateResult | null;
  error?: string;
  durationMs: number;
}

type GraphNode = (state: ShipGateState, config: ShipGateGraphConfig) => Promise<ShipGateState>;

// ============================================================================
// Graph Nodes
// ============================================================================

/**
 * Node: CollectReceipts
 * Gather all receipts needed for evaluation
 */
const collectReceipts: GraphNode = async (state, config) => {
  try {
    // Get truthpack snapshot
    const truthpackResult = await config.toolRuntime.execute('truthpack.get', {
      section: 'all',
    });

    const truthpackData = truthpackResult.success 
      ? truthpackResult.data as Record<string, unknown>
      : {};

    // Get diff summary
    const diffResult = await config.toolRuntime.execute('repo.diff', {
      base: 'HEAD~1',
      head: 'HEAD',
      stats: true,
    });

    const diffData = diffResult.success
      ? diffResult.data as { diff: string; stats?: { files: number; additions: number; deletions: number } }
      : null;

    // Collect runtime receipts
    const runtimeReceipts: Receipt[] = [];
    if (config.runIds && config.runIds.length > 0) {
      for (const runId of config.runIds) {
        const receipts = await config.evidenceStore.getRunReceipts(runId);
        runtimeReceipts.push(...receipts.filter(r => r.kind === 'runtime' || r.kind === 'chaos'));
      }
    } else {
      // Get most recent receipts
      const recent = await config.evidenceStore.queryReceipts({
        kind: 'runtime',
        limit: 50,
      });
      runtimeReceipts.push(...recent);
    }

    // Collect test receipts
    const testReceipts = await config.evidenceStore.queryReceipts({
      kind: 'test',
      limit: 50,
    });

    // Get static findings (would come from scan results)
    const analysisResult = await config.toolRuntime.execute('analyze.findings', {
      scope: 'changed',
      limit: 100,
    });

    const staticFindings = analysisResult.success
      ? (analysisResult.data as { findings: Array<{ id: string; severity: string; message: string }> }).findings
      : [];

    // Extract affected routes from diff
    const affectedRoutes = extractAffectedRoutes(diffData?.diff ?? '', truthpackData);

    return {
      ...state,
      truthpackSnapshot: {
        version: '1.0',
        hash: generateHash(JSON.stringify(truthpackData)),
      },
      diffSummary: {
        filesChanged: diffData?.stats?.files ?? 0,
        linesAdded: diffData?.stats?.additions ?? 0,
        linesRemoved: diffData?.stats?.deletions ?? 0,
        affectedRoutes,
      },
      staticFindings,
      runtimeReceipts,
      testReceipts,
      currentNode: 'EvaluatePolicy',
      error: null,
    };
  } catch (error) {
    return {
      ...state,
      currentNode: 'CollectReceipts',
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

/**
 * Node: EvaluatePolicy
 * Run deterministic policy evaluation - THE CRITICAL NODE
 */
const evaluatePolicy: GraphNode = async (state, config) => {
  try {
    // Combine all receipts
    const allReceipts = [...state.runtimeReceipts, ...state.testReceipts];

    // Build evaluation context
    const context: EvaluationContext = {
      staticFindings: state.staticFindings,
      diffSummary: {
        filesChanged: state.diffSummary.filesChanged,
        linesAdded: state.diffSummary.linesAdded,
        linesRemoved: state.diffSummary.linesRemoved,
      },
      metadata: {
        affectedRoutes: state.diffSummary.affectedRoutes,
        truthpackVersion: state.truthpackSnapshot.version,
      },
    };

    // Extract policy signals from receipts
    const policySignals: Record<string, boolean | number> = {};
    for (const receipt of allReceipts) {
      for (const signal of receipt.signals) {
        policySignals[signal.id] = signal.value;
      }
    }

    // Add static finding signals
    const criticalFindings = state.staticFindings.filter(f => f.severity === 'critical');
    const highFindings = state.staticFindings.filter(f => f.severity === 'high');
    
    policySignals['static.findings.critical.count'] = criticalFindings.length;
    policySignals['static.findings.high.count'] = highFindings.length;
    policySignals['static.findings.any'] = state.staticFindings.length > 0;

    // CRITICAL: Run deterministic policy evaluation
    // The ShipGateEngine is the ONLY authority for the verdict
    const result = config.shipGateEngine.evaluate(allReceipts, context);

    return {
      ...state,
      policySignals,
      result,
      currentNode: 'ExplainVerdict',
    };
  } catch (error) {
    return {
      ...state,
      currentNode: 'EvaluatePolicy',
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

/**
 * Node: ExplainVerdict
 * Generate narrative explanation (LLM-assisted, NO AUTHORITY)
 * The LLM can ONLY explain, NEVER change the verdict
 */
const explainVerdict: GraphNode = async (state, config) => {
  // The verdict is ALREADY decided by EvaluatePolicy
  // This node only adds explanation text - it CANNOT change the verdict
  
  if (!state.result) {
    return {
      ...state,
      currentNode: 'ExplainVerdict',
      error: 'No result to explain',
    };
  }

  // In a full implementation, this would optionally use an LLM to generate
  // a human-readable explanation. The LLM sees the verdict as READ-ONLY.
  
  // For now, we just pass through
  return {
    ...state,
    currentNode: 'EmitVerdict',
  };
};

/**
 * Node: EmitVerdict
 * Emit the final verdict
 */
const emitVerdict: GraphNode = async (state, config) => {
  if (state.result) {
    config.onVerdict?.(state.result);
  }

  return {
    ...state,
    currentNode: 'Complete',
  };
};

// ============================================================================
// Graph Orchestrator
// ============================================================================

const NODE_MAP: Record<string, GraphNode> = {
  'CollectReceipts': collectReceipts,
  'EvaluatePolicy': evaluatePolicy,
  'ExplainVerdict': explainVerdict,
  'EmitVerdict': emitVerdict,
};

/**
 * Execute the Ship Gate graph
 */
export async function executeShipGateGraph(
  config: ShipGateGraphConfig
): Promise<ShipGateGraphResult> {
  const startTime = Date.now();

  // Initialize state
  let state: ShipGateState = {
    truthpackSnapshot: { version: '', hash: '' },
    diffSummary: {
      filesChanged: 0,
      linesAdded: 0,
      linesRemoved: 0,
      affectedRoutes: [],
    },
    staticFindings: [],
    runtimeReceipts: [],
    testReceipts: [],
    policySignals: {},
    result: null,
    currentNode: 'CollectReceipts',
    error: null,
  };

  // Execute graph
  const maxIterations = 10;
  let iterations = 0;

  while (state.currentNode !== 'Complete' && iterations < maxIterations) {
    iterations++;

    const node = NODE_MAP[state.currentNode];
    
    if (!node) {
      state.error = `Unknown node: ${state.currentNode}`;
      break;
    }

    try {
      state = await node(state, config);
      config.onStateChange?.(state);
    } catch (error) {
      state.error = error instanceof Error ? error.message : String(error);
      break;
    }

    if (state.error) {
      break;
    }
  }

  return {
    success: !state.error && state.currentNode === 'Complete',
    state,
    verdict: state.result,
    error: state.error ?? undefined,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Quick ship check - simple API for CI
 */
export async function quickShipCheck(
  config: ShipGateGraphConfig
): Promise<{
  canShip: boolean;
  verdict: string;
  blockingReasons: string[];
  warnings: string[];
}> {
  const result = await executeShipGateGraph(config);

  if (!result.verdict) {
    return {
      canShip: false,
      verdict: 'ERROR',
      blockingReasons: [result.error ?? 'Unknown error'],
      warnings: [],
    };
  }

  return {
    canShip: result.verdict.verdict !== 'BLOCK',
    verdict: result.verdict.verdict,
    blockingReasons: result.verdict.blockingReasons.map(r => r.message),
    warnings: result.verdict.warnings.map(w => w.message),
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

function extractAffectedRoutes(
  diff: string,
  truthpack: Record<string, unknown>
): string[] {
  const routes: string[] = [];
  const routeList = truthpack.routes as Array<{ path: string; method: string }> | undefined;

  if (!routeList) return routes;

  // Simple heuristic: check if route paths appear in diff
  for (const route of routeList) {
    const pathSegments = route.path.split('/').filter(Boolean);
    const found = pathSegments.some(segment => 
      diff.includes(segment) && segment.length > 2
    );
    
    if (found) {
      routes.push(`${route.method}:${route.path}`);
    }
  }

  return routes;
}

function generateHash(content: string): string {
  // Simple hash for demo - would use crypto in production
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).slice(0, 8);
}

// ============================================================================
// Export
// ============================================================================

export type { ShipGateGraphConfig, ShipGateGraphResult };
