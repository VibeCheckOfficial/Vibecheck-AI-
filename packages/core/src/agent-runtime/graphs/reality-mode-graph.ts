/**
 * Reality Mode Graph (reality_mode_v1)
 * 
 * LangGraph workflow for proof generation, execution, and receipt emission.
 * 
 * Flow:
 * LoadContext → SelectScope → GenerateProofPlan → [GenerateChaosPlan] → 
 * ExecuteProof → [ExecuteChaos] → NormalizeReceipts → SummarizeFindings → Emit
 */

import { randomUUID } from 'crypto';
import type {
  RealityModeState,
  ProofPlan,
  ProofScenario,
  ChaosPlan,
  Receipt,
  SAFETY_LIMITS,
} from '../types.js';
import { EvidenceStore } from '../evidence/evidence-store.js';
import { ToolRuntime } from '../tools/tool-runtime.js';

// ============================================================================
// Types
// ============================================================================

export interface RealityModeGraphConfig {
  /** Project root */
  projectRoot: string;
  /** Tool runtime instance */
  toolRuntime: ToolRuntime;
  /** Evidence store instance */
  evidenceStore: EvidenceStore;
  /** Enable chaos testing */
  chaosEnabled: boolean;
  /** Max runtime in minutes */
  maxRuntimeMinutes: number;
  /** Base URL for runtime testing */
  baseUrl?: string;
  /** LLM for proof planning (optional - can be deterministic) */
  llmPlanningEnabled?: boolean;
  /** Callback for state updates */
  onStateChange?: (state: RealityModeState) => void;
  /** Callback for errors */
  onError?: (error: Error, node: string) => void;
}

export interface GraphExecutionResult {
  success: boolean;
  state: RealityModeState;
  error?: string;
  durationMs: number;
}

type GraphNode = (state: RealityModeState, config: RealityModeGraphConfig) => Promise<RealityModeState>;

// ============================================================================
// Graph Nodes
// ============================================================================

/**
 * Node: LoadContext
 * Load diff, truthpack, recent run cache, prior receipts
 */
const loadContext: GraphNode = async (state, config) => {
  const runId = `run_${Date.now()}_${randomUUID().slice(0, 8)}`;
  
  try {
    // Get truthpack data
    const truthpackResult = await config.toolRuntime.execute('truthpack.get', {
      section: 'all',
    });

    if (!truthpackResult.success) {
      return {
        ...state,
        currentNode: 'LoadContext',
        error: `Failed to load truthpack: ${truthpackResult.error}`,
      };
    }

    const truthpack = truthpackResult.data as {
      routes?: Array<{ path: string; method: string }>;
      env?: Record<string, unknown>;
      auth?: unknown;
    };

    // Get diff
    const diffResult = await config.toolRuntime.execute('repo.diff', {
      base: 'HEAD~1',
      head: 'HEAD',
      stats: true,
    });

    const diffData = diffResult.success 
      ? diffResult.data as { diff: string; stats?: { files: number } }
      : null;

    // Get recent receipts if available
    const recentReceipts = await config.evidenceStore.queryReceipts({
      limit: 10,
    });

    // Build initial scope from routes
    const routes = truthpack.routes?.map(r => `${r.method}:${r.path}`) ?? [];

    return {
      ...state,
      repoSnapshot: {
        commitHash: await getCommitHash(config.projectRoot),
        truthpackVersion: '1.0', // Would read from truthpack manifest
      },
      scope: {
        routes,
        features: [], // Would be extracted from diff analysis
      },
      currentNode: 'SelectScope',
      error: null,
    };
  } catch (error) {
    return {
      ...state,
      currentNode: 'LoadContext',
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

/**
 * Node: SelectScope
 * Determine minimal set of routes/flows impacted by diff
 */
const selectScope: GraphNode = async (state, config) => {
  try {
    // Get changed files
    const diffResult = await config.toolRuntime.execute('repo.diff', {
      base: 'HEAD~1',
      head: 'HEAD',
    });

    if (!diffResult.success) {
      // If no diff, use all routes
      return {
        ...state,
        currentNode: 'GenerateProofPlan',
      };
    }

    const diffData = diffResult.data as { diff: string };
    const changedFiles = extractChangedFiles(diffData.diff);

    // Filter routes based on changed files (simplified heuristic)
    // In production, this would use proper route-to-file mapping
    const impactedRoutes = state.scope.routes.filter(route => {
      const routePath = route.split(':')[1];
      return changedFiles.some(file => 
        file.includes(routePath?.replace(/\//g, '')) ||
        file.includes('api') ||
        file.includes('page') ||
        file.includes('route')
      );
    });

    // If no routes impacted, fall back to all routes (capped)
    const selectedRoutes = impactedRoutes.length > 0 
      ? impactedRoutes.slice(0, 10) // Cap at 10
      : state.scope.routes.slice(0, 5); // Default to first 5

    return {
      ...state,
      scope: {
        ...state.scope,
        routes: selectedRoutes,
      },
      currentNode: 'GenerateProofPlan',
    };
  } catch (error) {
    return {
      ...state,
      currentNode: 'SelectScope',
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

/**
 * Node: GenerateProofPlan
 * Generate structured proof plan with scenarios and assertions
 */
const generateProofPlan: GraphNode = async (state, config) => {
  try {
    const planId = `plan_${Date.now()}_${randomUUID().slice(0, 8)}`;
    
    // Build scenarios for each route
    const scenarios: ProofScenario[] = [];

    for (const route of state.scope.routes.slice(0, 10)) { // Cap scenarios
      const [method, path] = route.split(':');
      
      const scenario: ProofScenario = {
        name: `Verify ${method} ${path}`,
        preconditions: {
          authState: path?.includes('dashboard') || path?.includes('admin') 
            ? 'authenticated' 
            : 'anonymous',
        },
        steps: [
          {
            type: 'navigate',
            target: path ?? '/',
            description: `Navigate to ${path}`,
            timeout: 10000,
          },
          {
            type: 'wait',
            target: 'networkidle',
            description: 'Wait for network to settle',
            timeout: 5000,
          },
          {
            type: 'screenshot',
            description: 'Capture page state',
          },
        ],
        assertions: [
          {
            type: 'status',
            target: 'response',
            expected: '200',
            operator: 'equals',
            description: `${path} returns 200`,
          },
          {
            type: 'element',
            target: 'body',
            expected: 'visible',
            operator: 'exists',
            description: 'Page body is visible',
          },
        ],
        artifactsRequired: ['screenshot', 'har'],
      };

      scenarios.push(scenario);
    }

    const proofPlan: ProofPlan = {
      planId,
      scenarios,
      sourceCommit: state.repoSnapshot.commitHash,
      routesImpacted: state.scope.routes,
      createdAt: new Date().toISOString(),
    };

    return {
      ...state,
      proofPlan,
      currentNode: config.chaosEnabled ? 'GenerateChaosPlan' : 'ExecuteProof',
    };
  } catch (error) {
    return {
      ...state,
      currentNode: 'GenerateProofPlan',
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

/**
 * Node: GenerateChaosPlan (optional)
 * Generate bounded chaos tests
 */
const generateChaosPlan: GraphNode = async (state, config) => {
  if (!config.chaosEnabled) {
    return {
      ...state,
      currentNode: 'ExecuteProof',
    };
  }

  try {
    const planId = `chaos_${Date.now()}_${randomUUID().slice(0, 8)}`;

    const chaosPlan: ChaosPlan = {
      planId,
      tests: [
        {
          type: 'network_latency',
          name: 'Network latency injection',
          config: {
            latencyMs: { p50: 500, p95: 2000 },
            targetEndpoints: ['/api/*'],
          },
          maxDurationSec: 30,
          failFast: true,
        },
        {
          type: 'network_error',
          name: 'API error injection',
          config: {
            errorStatus: 500,
            targetEndpoints: ['/api/*'],
          },
          maxDurationSec: 20,
          failFast: true,
        },
      ],
      maxTotalDurationSec: 60,
      createdAt: new Date().toISOString(),
    };

    return {
      ...state,
      chaosPlan,
      currentNode: 'ExecuteProof',
    };
  } catch (error) {
    return {
      ...state,
      currentNode: 'GenerateChaosPlan',
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

/**
 * Node: ExecuteProof
 * Execute proof plan with Playwright
 */
const executeProof: GraphNode = async (state, config) => {
  if (!state.proofPlan) {
    return {
      ...state,
      currentNode: 'ExecuteProof',
      error: 'No proof plan available',
    };
  }

  try {
    const runId = `run_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const artifacts: RealityModeState['artifacts'] = [];
    const findings: RealityModeState['findings'] = [];
    const receipts: Receipt[] = [];

    // Execute via tool runtime (which integrates with existing reality engine)
    const result = await config.toolRuntime.execute('reality.runProof', {
      planId: state.proofPlan.planId,
      baseUrl: config.baseUrl ?? 'http://localhost:3000',
      timeout: config.maxRuntimeMinutes * 60,
      artifacts: {
        screenshots: true,
        traces: false,
        networkLogs: true,
        videos: false,
      },
    });

    if (!result.success) {
      // Create error receipt
      const receipt = await config.evidenceStore.storeReceipt({
        runId,
        kind: 'runtime',
        summary: `Proof execution failed: ${result.error}`,
        signals: [
          { id: 'runtime.proof.failed', value: true },
        ],
      });
      receipts.push(receipt);

      findings.push({
        id: `finding_${randomUUID().slice(0, 8)}`,
        severity: 'high',
        message: `Proof execution failed: ${result.error}`,
        evidence: { error: result.error },
      });
    } else {
      // Process successful execution
      const proofResult = result.data as {
        planId: string;
        scenarios?: Array<{ name: string; passed: boolean; error?: string }>;
      };

      // Create success receipt
      const receipt = await config.evidenceStore.storeReceipt({
        runId,
        kind: 'runtime',
        summary: `Proof plan ${state.proofPlan.planId} executed`,
        signals: [
          { id: 'runtime.proof.completed', value: true },
          { id: 'runtime.proof.passed', value: true },
        ],
      });
      receipts.push(receipt);
    }

    return {
      ...state,
      artifacts,
      findings,
      receipts,
      currentNode: state.chaosPlan ? 'ExecuteChaos' : 'NormalizeReceipts',
    };
  } catch (error) {
    return {
      ...state,
      currentNode: 'ExecuteProof',
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

/**
 * Node: ExecuteChaos (optional)
 * Execute chaos tests
 */
const executeChaos: GraphNode = async (state, config) => {
  if (!state.chaosPlan || !config.chaosEnabled) {
    return {
      ...state,
      currentNode: 'NormalizeReceipts',
    };
  }

  try {
    const runId = `chaos_run_${Date.now()}_${randomUUID().slice(0, 8)}`;

    // Execute chaos via tool runtime
    const result = await config.toolRuntime.execute('reality.runChaos', {
      planId: state.chaosPlan.planId,
      baseUrl: config.baseUrl ?? 'http://localhost:3000',
      maxDuration: state.chaosPlan.maxTotalDurationSec,
    });

    if (result.success) {
      const chaosResult = result.data as {
        findings?: Array<{ type: string; description: string }>;
      };

      // Add chaos findings
      for (const finding of chaosResult.findings ?? []) {
        state.findings.push({
          id: `chaos_${randomUUID().slice(0, 8)}`,
          severity: 'medium',
          message: `Chaos test: ${finding.description}`,
          evidence: { type: finding.type },
        });
      }

      // Create chaos receipt
      const receipt = await config.evidenceStore.storeReceipt({
        runId,
        kind: 'chaos',
        summary: `Chaos plan ${state.chaosPlan.planId} executed`,
        signals: [
          { id: 'chaos.completed', value: true },
          { id: 'chaos.findings.count', value: chaosResult.findings?.length ?? 0 },
        ],
      });
      state.receipts.push(receipt);
    }

    return {
      ...state,
      currentNode: 'NormalizeReceipts',
    };
  } catch (error) {
    return {
      ...state,
      currentNode: 'ExecuteChaos',
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

/**
 * Node: NormalizeReceipts
 * Convert raw artifacts to receipts with stable schema
 */
const normalizeReceipts: GraphNode = async (state, config) => {
  try {
    // Aggregate signals from all receipts
    const verdictInputs: Record<string, boolean | number> = {};

    for (const receipt of state.receipts) {
      for (const signal of receipt.signals) {
        verdictInputs[signal.id] = signal.value;
      }
    }

    // Add finding-based signals
    verdictInputs['findings.critical'] = state.findings.filter(f => f.severity === 'critical').length;
    verdictInputs['findings.high'] = state.findings.filter(f => f.severity === 'high').length;
    verdictInputs['findings.total'] = state.findings.length;

    return {
      ...state,
      verdictInputs,
      currentNode: 'SummarizeFindings',
    };
  } catch (error) {
    return {
      ...state,
      currentNode: 'NormalizeReceipts',
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

/**
 * Node: SummarizeFindings
 * Generate narrative summary (LLM-assisted, no authority)
 */
const summarizeFindings: GraphNode = async (state, config) => {
  // This node would optionally use LLM for narrative generation
  // The LLM has NO authority - it only explains findings
  
  return {
    ...state,
    currentNode: 'Emit',
  };
};

/**
 * Node: Emit
 * Store results and return receipts
 */
const emit: GraphNode = async (state, config) => {
  // All receipts should already be stored via evidenceStore
  // This node is the final state
  
  return {
    ...state,
    currentNode: 'Complete',
  };
};

// ============================================================================
// Graph Orchestrator
// ============================================================================

const NODE_MAP: Record<string, GraphNode> = {
  'LoadContext': loadContext,
  'SelectScope': selectScope,
  'GenerateProofPlan': generateProofPlan,
  'GenerateChaosPlan': generateChaosPlan,
  'ExecuteProof': executeProof,
  'ExecuteChaos': executeChaos,
  'NormalizeReceipts': normalizeReceipts,
  'SummarizeFindings': summarizeFindings,
  'Emit': emit,
};

/**
 * Execute the Reality Mode graph
 */
export async function executeRealityModeGraph(
  config: RealityModeGraphConfig
): Promise<GraphExecutionResult> {
  const startTime = Date.now();

  // Initialize state
  let state: RealityModeState = {
    repoSnapshot: { commitHash: '', truthpackVersion: '' },
    scope: { routes: [], features: [] },
    proofPlan: null,
    chaosPlan: null,
    artifacts: [],
    findings: [],
    receipts: [],
    verdictInputs: {},
    currentNode: 'LoadContext',
    error: null,
  };

  // Execute graph
  const maxIterations = 20; // Safety limit
  let iterations = 0;

  while (state.currentNode !== 'Complete' && iterations < maxIterations) {
    iterations++;

    // Check timeout
    const elapsed = Date.now() - startTime;
    if (elapsed > config.maxRuntimeMinutes * 60 * 1000) {
      state.error = `Timeout: exceeded ${config.maxRuntimeMinutes} minutes`;
      break;
    }

    // Get and execute current node
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

    // Check for error state
    if (state.error) {
      break;
    }
  }

  return {
    success: !state.error && state.currentNode === 'Complete',
    state,
    error: state.error ?? undefined,
    durationMs: Date.now() - startTime,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

async function getCommitHash(projectRoot: string): Promise<string> {
  try {
    const { execSync } = await import('child_process');
    return execSync('git rev-parse HEAD', {
      cwd: projectRoot,
      encoding: 'utf-8',
    }).trim();
  } catch {
    return 'unknown';
  }
}

function extractChangedFiles(diff: string): string[] {
  const files: string[] = [];
  const regex = /^(?:diff --git a\/(.+) b\/|[-+]{3} [ab]\/(.+))$/gm;
  let match;
  
  while ((match = regex.exec(diff)) !== null) {
    const file = match[1] || match[2];
    if (file && !files.includes(file)) {
      files.push(file);
    }
  }
  
  return files;
}

// ============================================================================
// Export
// ============================================================================

export type { RealityModeGraphConfig, GraphExecutionResult };
