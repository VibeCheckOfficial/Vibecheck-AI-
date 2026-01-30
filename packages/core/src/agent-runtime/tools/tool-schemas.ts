/**
 * Tool Schemas - The Safety Line
 * 
 * All tools that the agent can call must have strict Zod schemas.
 * Any invalid call is rejected and logged as a model error.
 */

import { z } from 'zod';

// ============================================================================
// Read-Only Tool Schemas (Safe)
// ============================================================================

/**
 * truthpack.get - Get truthpack data
 */
export const TruthpackGetSchema = z.object({
  /** Section to retrieve */
  section: z.enum(['routes', 'env', 'auth', 'api', 'all']),
  /** Optional filter */
  filter: z.object({
    path: z.string().optional(),
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).optional(),
    protected: z.boolean().optional(),
  }).optional(),
});

export type TruthpackGetInput = z.infer<typeof TruthpackGetSchema>;

/**
 * repo.diff - Get repository diff
 */
export const RepoDiffSchema = z.object({
  /** Base reference (commit, branch, or HEAD~n) */
  base: z.string().default('HEAD~1'),
  /** Head reference */
  head: z.string().default('HEAD'),
  /** Optional path filter */
  paths: z.array(z.string()).optional(),
  /** Include stats */
  stats: z.boolean().default(true),
});

export type RepoDiffInput = z.infer<typeof RepoDiffSchema>;

/**
 * repo.readFiles - Read files from repository
 */
export const RepoReadFilesSchema = z.object({
  /** Glob patterns to match */
  globs: z.array(z.string()).min(1).max(10),
  /** Maximum total bytes to read */
  maxBytes: z.number().max(1024 * 1024).default(512 * 1024), // 512KB default, 1MB max
  /** Include line numbers */
  includeLineNumbers: z.boolean().default(false),
});

export type RepoReadFilesInput = z.infer<typeof RepoReadFilesSchema>;

/**
 * analyze.findings - Get analysis findings
 */
export const AnalyzeFindingsSchema = z.object({
  /** Scope of analysis */
  scope: z.enum(['all', 'changed', 'staged']).default('all'),
  /** Filter by severity */
  severity: z.array(z.enum(['critical', 'high', 'medium', 'low', 'info'])).optional(),
  /** Filter by type */
  types: z.array(z.string()).optional(),
  /** Limit results */
  limit: z.number().max(100).default(50),
});

export type AnalyzeFindingsInput = z.infer<typeof AnalyzeFindingsSchema>;

/**
 * test.run - Run tests
 */
export const TestRunSchema = z.object({
  /** Type of test to run */
  type: z.enum(['typecheck', 'unit', 'lint', 'e2e']),
  /** Scope (file paths or patterns) */
  scope: z.array(z.string()).optional(),
  /** Timeout in seconds */
  timeout: z.number().max(300).default(60),
  /** Fail fast on first error */
  failFast: z.boolean().default(true),
});

export type TestRunInput = z.infer<typeof TestRunSchema>;

/**
 * reality.runProof - Execute a proof plan
 */
export const RealityRunProofSchema = z.object({
  /** Plan ID to execute */
  planId: z.string(),
  /** Optional scenario filter */
  scenarios: z.array(z.string()).optional(),
  /** Override base URL */
  baseUrl: z.string().url().optional(),
  /** Timeout in seconds */
  timeout: z.number().max(600).default(120),
  /** Collect artifacts */
  artifacts: z.object({
    screenshots: z.boolean().default(true),
    traces: z.boolean().default(false),
    networkLogs: z.boolean().default(true),
    videos: z.boolean().default(false),
  }).optional(),
});

export type RealityRunProofInput = z.infer<typeof RealityRunProofSchema>;

/**
 * reality.runChaos - Execute chaos testing
 */
export const RealityRunChaosSchema = z.object({
  /** Plan ID to execute */
  planId: z.string(),
  /** Override base URL */
  baseUrl: z.string().url().optional(),
  /** Max duration in seconds */
  maxDuration: z.number().max(180).default(60),
});

export type RealityRunChaosInput = z.infer<typeof RealityRunChaosSchema>;

/**
 * evidence.fetch - Fetch evidence/receipts
 */
export const EvidenceFetchSchema = z.object({
  /** Run ID to fetch */
  runId: z.string(),
  /** Optional receipt IDs */
  receiptIds: z.array(z.string()).optional(),
  /** Include artifact content */
  includeArtifacts: z.boolean().default(false),
});

export type EvidenceFetchInput = z.infer<typeof EvidenceFetchSchema>;

/**
 * evidence.list - List available evidence
 */
export const EvidenceListSchema = z.object({
  /** Filter by kind */
  kind: z.enum(['test', 'runtime', 'network', 'ui', 'security', 'policy', 'chaos']).optional(),
  /** Filter by run ID */
  runId: z.string().optional(),
  /** Limit */
  limit: z.number().max(100).default(20),
});

export type EvidenceListInput = z.infer<typeof EvidenceListSchema>;

// ============================================================================
// Write Tool Schemas (Gated)
// ============================================================================

/**
 * patch.propose - Propose a patch
 */
export const PatchProposeSchema = z.object({
  /** Goal of the patch */
  goal: z.string().min(10).max(500),
  /** Files to modify */
  files: z.array(z.object({
    path: z.string(),
    /** Operation type */
    operation: z.enum(['modify', 'create', 'delete']),
    /** New content (for modify/create) */
    content: z.string().optional(),
    /** Specific changes (for modify) */
    changes: z.array(z.object({
      startLine: z.number(),
      endLine: z.number(),
      replacement: z.string(),
    })).optional(),
  })).min(1).max(10), // Cap at 10 files per patch
  /** Constraints */
  constraints: z.object({
    /** Max lines to change */
    maxLines: z.number().max(500).default(200),
    /** Allowed directories */
    allowedDirs: z.array(z.string()).optional(),
    /** Blocked patterns */
    blockedPatterns: z.array(z.string()).optional(),
  }).optional(),
  /** Associated mission ID */
  missionId: z.string().optional(),
});

export type PatchProposeInput = z.infer<typeof PatchProposeSchema>;

/**
 * patch.apply - Apply a proposed patch
 */
export const PatchApplySchema = z.object({
  /** Diff ID to apply */
  diffId: z.string(),
  /** Force apply (skip risk check) - requires explicit approval */
  force: z.boolean().default(false),
  /** Verification plan to run after */
  verificationPlan: z.object({
    runTypecheck: z.boolean().default(true),
    runTests: z.array(z.string()).optional(),
    runProofScenarios: z.array(z.string()).optional(),
  }).optional(),
});

export type PatchApplyInput = z.infer<typeof PatchApplySchema>;

/**
 * patch.rollback - Rollback to a checkpoint
 */
export const PatchRollbackSchema = z.object({
  /** Checkpoint ID to restore */
  checkpointId: z.string(),
  /** Files to rollback (optional, defaults to all) */
  files: z.array(z.string()).optional(),
});

export type PatchRollbackInput = z.infer<typeof PatchRollbackSchema>;

/**
 * git.stage - Stage files for commit
 */
export const GitStageSchema = z.object({
  /** Diff ID to stage */
  diffId: z.string(),
  /** Specific files to stage (optional) */
  files: z.array(z.string()).optional(),
});

export type GitStageInput = z.infer<typeof GitStageSchema>;

/**
 * git.commit - Create a commit (requires approval)
 */
export const GitCommitSchema = z.object({
  /** Commit message */
  message: z.string().min(10).max(500),
  /** Staged diff ID */
  diffId: z.string(),
  /** Skip pre-commit hooks (not recommended) */
  skipHooks: z.boolean().default(false),
});

export type GitCommitInput = z.infer<typeof GitCommitSchema>;

// ============================================================================
// Tool Result Schemas
// ============================================================================

export const ToolResultSchema = z.object({
  /** Whether the operation succeeded */
  success: z.boolean(),
  /** Result data (varies by tool) */
  data: z.unknown().optional(),
  /** Error message if failed */
  error: z.string().optional(),
  /** Metadata */
  metadata: z.object({
    /** Duration in ms */
    durationMs: z.number().optional(),
    /** Tool name */
    tool: z.string(),
    /** Timestamp */
    timestamp: z.string(),
  }),
});

export type ToolResult = z.infer<typeof ToolResultSchema>;

export const WriteToolResultSchema = ToolResultSchema.extend({
  /** Whether approval is required */
  requiresApproval: z.boolean(),
  /** Risk assessment */
  riskAssessment: z.object({
    tier: z.enum(['LOW', 'MEDIUM', 'HIGH']),
    reasons: z.array(z.string()),
    score: z.number().min(0).max(100),
  }).optional(),
  /** Checkpoint created before write */
  checkpointId: z.string().optional(),
  /** Diff preview */
  diffPreview: z.string().optional(),
});

export type WriteToolResult = z.infer<typeof WriteToolResultSchema>;

// ============================================================================
// Tool Category Type
// ============================================================================

export type ReadOnlyTool = 
  | 'truthpack.get'
  | 'repo.diff'
  | 'repo.readFiles'
  | 'analyze.findings'
  | 'test.run'
  | 'reality.runProof'
  | 'reality.runChaos'
  | 'evidence.fetch'
  | 'evidence.list';

export type WriteTool =
  | 'patch.propose'
  | 'patch.apply'
  | 'patch.rollback'
  | 'git.stage'
  | 'git.commit';

export type ToolName = ReadOnlyTool | WriteTool;

export const READ_ONLY_TOOLS: ReadOnlyTool[] = [
  'truthpack.get',
  'repo.diff',
  'repo.readFiles',
  'analyze.findings',
  'test.run',
  'reality.runProof',
  'reality.runChaos',
  'evidence.fetch',
  'evidence.list',
];

export const WRITE_TOOLS: WriteTool[] = [
  'patch.propose',
  'patch.apply',
  'patch.rollback',
  'git.stage',
  'git.commit',
];

// ============================================================================
// Schema Registry
// ============================================================================

export const TOOL_SCHEMAS: Record<ToolName, z.ZodSchema> = {
  'truthpack.get': TruthpackGetSchema,
  'repo.diff': RepoDiffSchema,
  'repo.readFiles': RepoReadFilesSchema,
  'analyze.findings': AnalyzeFindingsSchema,
  'test.run': TestRunSchema,
  'reality.runProof': RealityRunProofSchema,
  'reality.runChaos': RealityRunChaosSchema,
  'evidence.fetch': EvidenceFetchSchema,
  'evidence.list': EvidenceListSchema,
  'patch.propose': PatchProposeSchema,
  'patch.apply': PatchApplySchema,
  'patch.rollback': PatchRollbackSchema,
  'git.stage': GitStageSchema,
  'git.commit': GitCommitSchema,
};

/**
 * Validate tool input against schema
 */
export function validateToolInput(
  tool: ToolName,
  input: unknown
): { valid: true; data: unknown } | { valid: false; errors: string[] } {
  const schema = TOOL_SCHEMAS[tool];
  
  if (!schema) {
    return { valid: false, errors: [`Unknown tool: ${tool}`] };
  }

  const result = schema.safeParse(input);
  
  if (result.success) {
    return { valid: true, data: result.data };
  }

  return {
    valid: false,
    errors: result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
  };
}

/**
 * Check if a tool is a write tool
 */
export function isWriteTool(tool: ToolName): tool is WriteTool {
  return WRITE_TOOLS.includes(tool as WriteTool);
}
