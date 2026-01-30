/**
 * Forge - Type Definitions
 *
 * Core types for the AI Context Generator.
 * Adapted for VibeCheck-Real monorepo conventions.
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

export type RuleTier = 'minimal' | 'standard' | 'extended' | 'comprehensive';
export type Platform = 'cursor' | 'windsurf' | 'copilot' | 'claude' | 'codex';

export interface ForgeConfig {
  /** Maximum number of rules to generate */
  maxRules: number;
  /** Rule tier (determines default features) */
  tier: RuleTier;
  /** Target platforms */
  platforms: Platform[];
  /** Enable incremental mode (only regenerate changed rules) */
  incremental: boolean;
  /** Generate AI Contract */
  generateContract: boolean;
  /** Verbose output */
  verbose: boolean;
  /** Auto-detect IDE and only generate rules for detected platform (default: true) */
  autoDetectIDE?: boolean;
}

// ============================================================================
// RULES
// ============================================================================

export type RuleCategory =
  | 'architecture'
  | 'avoid'
  | 'types'
  | 'components'
  | 'testing'
  | 'state'
  | 'data-flow'
  | 'environment'
  | 'hooks'
  | 'api-patterns'
  | 'security'
  | 'performance'
  | 'accessibility'
  | 'i18n'
  | 'error-handling'
  | 'logging'
  | 'caching'
  | 'database'
  | 'authentication'
  | 'authorization'
  | 'workflow';

export interface ForgeRule {
  /** Unique rule identifier */
  id: string;
  /** Rule category */
  category: RuleCategory;
  /** Human-readable name */
  name: string;
  /** Rule description */
  description: string;
  /** MDC frontmatter */
  frontmatter: {
    description: string;
    globs: string[];
    alwaysApply: boolean;
    priority: number;
  };
  /** Rule content (markdown) */
  content: string;
  /** Impact score (0-100) - higher = more important */
  impact: number;
  /** Content hash for change detection */
  hash: string;
  /** Whether this rule was generated incrementally */
  incremental: boolean;
}

export interface RuleDiff {
  /** Rules that were added */
  added: ForgeRule[];
  /** Rules that were modified */
  modified: ForgeRule[];
  /** Rules that were removed */
  removed: ForgeRule[];
  /** Rules that are unchanged */
  unchanged: ForgeRule[];
}

// ============================================================================
// AI CONTRACT
// ============================================================================

export interface AIContract {
  /** Contract version */
  version: string;
  /** Generated timestamp */
  generatedAt: string;
  /** Project identifier */
  projectId: string;

  /** Actions the AI is explicitly allowed to do */
  allowed: string[];

  /** Actions the AI must NEVER do */
  forbidden: string[];

  /** Actions that require user confirmation */
  requiresConfirmation: string[];

  /** File and directory boundaries */
  fileBoundaries: {
    /** Patterns for files/dirs the AI may create */
    mayCreate: string[];
    /** Patterns for files/dirs the AI must not modify */
    mayNotModify: string[];
    /** Patterns that require extra caution */
    restrictedPatterns: string[];
  };

  /** Code standards the AI must follow */
  codeStandards: {
    /** Required patterns/conventions */
    mustFollow: string[];
    /** Patterns to avoid */
    mustAvoid: string[];
    /** Preferred patterns (not required) */
    preferredPatterns: string[];
  };

  /** Safety rules by priority */
  safetyRules: {
    /** Critical rules - never violate */
    critical: string[];
    /** High priority rules */
    high: string[];
    /** Standard rules */
    standard: string[];
  };

  /** Context-specific rules */
  contextRules: {
    /** Rules for specific file types */
    byFileType: Record<string, string[]>;
    /** Rules for specific directories */
    byDirectory: Record<string, string[]>;
  };
}

// ============================================================================
// MANIFEST
// ============================================================================

export interface ForgeManifest {
  /** Manifest version */
  version: string;
  /** Generated timestamp */
  generatedAt: string;
  /** Project path */
  projectPath: string;
  /** Content hash for change detection */
  contentHash: string;

  /** Forge configuration used */
  config: ForgeConfig;

  /** Generated rules */
  rules: ForgeManifestRule[];

  /** AI Contract reference */
  contract: AIContract | null;

  /** File outputs */
  outputs: ForgeManifestOutput[];

  /** Generation statistics */
  stats: {
    rulesGenerated: number;
    filesWritten: number;
    timeMs: number;
  };

  /** Analysis snapshot for incremental diffing */
  analysisSnapshot: {
    componentCount: number;
    routeCount: number;
    typeCount: number;
    patternHashes: Record<string, string>;
  };
}

export interface ForgeManifestRule {
  /** Rule ID */
  id: string;
  /** Rule category */
  category: RuleCategory;
  /** Rule name */
  name: string;
  /** Rule hash */
  hash: string;
  /** Impact score */
  impact: number;
  /** Output file */
  outputFile: string;
}

export interface ForgeManifestOutput {
  /** Output file path */
  path: string;
  /** Output type */
  type: 'rule' | 'contract' | 'skill' | 'agent' | 'hook' | 'manifest';
  /** File hash */
  hash: string;
  /** Generation timestamp */
  generatedAt: string;
}

// ============================================================================
// OUTPUT
// ============================================================================

export interface ForgeOutput {
  /** List of generated files */
  files: string[];
  /** Generated manifest */
  manifest: ForgeManifest;
  /** Generated AI contract */
  contract: AIContract | null;
  /** Generation statistics */
  stats: {
    rulesGenerated: number;
    filesWritten: number;
    timeMs: number;
    incremental: boolean;
    rulesSkipped: number;
    rulesPruned: number;
  };
}

// ============================================================================
// ANALYSIS (from analyzer)
// ============================================================================

export interface ProjectAnalysis {
  /** Project name */
  name: string;
  /** Detected framework */
  framework: string;
  /** Primary language */
  language: string;
  /** Architecture type */
  architecture: string;
  /** Directory structure */
  directories: string[];
  /** Components found */
  components: Array<{
    name: string;
    path: string;
    type: string;
  }>;
  /** API routes found */
  apiRoutes: Array<{
    path: string;
    method: string;
    handler: string;
    file: string;
  }>;
  /** Data models found */
  models: Array<{
    name: string;
    path: string;
    fields: string[];
  }>;
  /** Types/interfaces */
  types: {
    interfaces: Array<{ name: string; path: string }>;
    types: Array<{ name: string; path: string }>;
    enums: Array<{ name: string; path: string }>;
  };
  /** Environment variables */
  envVars: {
    variables: string[];
    sensitive: string[];
    missing: string[];
  };
  /** Detected patterns */
  patterns: {
    hooks: string[];
    stateManagement: string;
    dataFetching: string[];
    styling: string[];
    testing: string[];
    validation: string;
    authentication: string;
    antiPatterns: Array<{
      severity: 'error' | 'warning' | 'info';
      message: string;
      file?: string;
      line?: number;
    }>;
  };
  /** Monorepo info */
  monorepo: {
    isMonorepo: boolean;
    type: string;
    workspaces: Array<{
      name: string;
      path: string;
    }>;
    sharedPackages: Array<{
      name: string;
      usedIn: string[];
    }>;
  };
  /** Stats */
  stats: {
    totalFiles: number;
    totalLines: number;
    filesByExtension: Record<string, number>;
  };
}

// ============================================================================
// SUBAGENTS & SKILLS
// ============================================================================

export interface SubagentDefinition {
  /** Subagent ID */
  id: string;
  /** Subagent name */
  name: string;
  /** Description */
  description: string;
  /** Trigger conditions */
  triggers: string[];
  /** Capabilities */
  capabilities: string[];
  /** Content */
  content: string;
  /** Output path */
  path: string;
}

export interface SkillDefinition {
  /** Skill ID */
  id: string;
  /** Skill name */
  name: string;
  /** Description */
  description: string;
  /** Trigger patterns */
  triggers: string[];
  /** Steps */
  steps: string[];
  /** Content */
  content: string;
  /** Output path */
  path: string;
}

export interface HookDefinition {
  /** Hook ID */
  id: string;
  /** Hook name */
  name: string;
  /** Hook type */
  type: 'pre-commit' | 'post-save' | 'on-open' | 'on-error' | 'custom';
  /** Trigger conditions */
  trigger: string;
  /** Actions to perform */
  actions: string[];
  /** Content */
  content: string;
  /** Output path */
  path: string;
}

// ============================================================================
// TIER CONFIGURATION
// ============================================================================

export const TIER_CONFIGS: Record<RuleTier, { maxRules: number; features: string[] }> = {
  minimal: {
    maxRules: 5,
    features: ['architecture', 'workflow', 'avoid', 'types', 'components', 'testing'],
  },
  standard: {
    maxRules: 10,
    features: [
      'architecture',
      'workflow',
      'avoid',
      'types',
      'components',
      'testing',
      'state',
      'data-flow',
      'environment',
      'hooks',
      'api-patterns',
    ],
  },
  extended: {
    maxRules: 20,
    features: [
      'architecture',
      'workflow',
      'avoid',
      'types',
      'components',
      'testing',
      'state',
      'data-flow',
      'environment',
      'hooks',
      'api-patterns',
      'security',
      'performance',
      'accessibility',
      'i18n',
      'error-handling',
      'logging',
      'caching',
      'database',
      'authentication',
      'authorization',
    ],
  },
  comprehensive: {
    maxRules: 50,
    features: ['*'], // All available features
  },
};

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

export const DEFAULT_FORGE_CONFIG: ForgeConfig = {
  maxRules: 10,
  tier: 'standard',
  platforms: ['cursor', 'windsurf'],
  incremental: true,
  generateContract: true,
  verbose: false,
};

// ============================================================================
// SELF-AWARE ENGINE TYPES
// ============================================================================

/**
 * Project lifecycle phases detected by the self-aware engine
 */
export type ProjectPhase =
  | 'scaffold'      // Initial project setup (< 20 files, basic structure)
  | 'prototype'     // Rapid experimentation (high churn, few tests)
  | 'active-dev'    // Feature development (growing components, some tests)
  | 'stabilization' // Bug fixes, testing focus (tests growing faster)
  | 'production'    // Deployed, careful changes (CI/CD present, high coverage)
  | 'maintenance';  // Legacy mode (low churn, dependency updates)

/**
 * Phase detection signal with weight and value
 */
export interface PhaseSignal {
  /** Signal name */
  name: string;
  /** Signal weight (0-1, must sum to 1 across all signals) */
  weight: number;
  /** Raw value (implementation-specific) */
  rawValue: number;
  /** Normalized score (0-100) */
  score: number;
  /** How this signal was calculated */
  explanation: string;
}

/**
 * Result of phase detection analysis
 */
export interface PhaseDetectionResult {
  /** Detected phase */
  phase: ProjectPhase;
  /** Confidence score (0-1) */
  confidence: number;
  /** Individual signal scores */
  signals: PhaseSignal[];
  /** Phase scores for all phases */
  phaseScores: Record<ProjectPhase, number>;
  /** Timestamp of detection */
  detectedAt: string;
  /** Whether phase changed from previous */
  phaseChanged: boolean;
  /** Previous phase (if changed) */
  previousPhase?: ProjectPhase;
}

/**
 * Configuration for phase detection
 */
export interface PhaseDetectorConfig {
  /** Project root path */
  projectPath: string;
  /** Enable git history analysis */
  analyzeGitHistory: boolean;
  /** Number of consecutive same-phase detections before transitioning */
  transitionThreshold: number;
  /** Minimum confidence to accept phase detection */
  minConfidence: number;
}

// ============================================================================
// CONTEXT MEMORY TYPES
// ============================================================================

/**
 * Persistent context memory for learning
 */
export interface ForgeContextMemory {
  /** Memory version */
  version: string;
  /** Project identifier */
  projectId: string;
  /** Last updated timestamp */
  updatedAt: string;

  /** Phase tracking */
  phaseHistory: PhaseTransition[];
  /** Current phase */
  currentPhase: ProjectPhase;
  /** Consecutive same-phase count */
  consecutiveSamePhase: number;

  /** Rule effectiveness tracking */
  ruleEffectiveness: Record<string, RuleEffectivenessScore>;

  /** Pattern frequency tracking */
  patternFrequency: Record<string, number>;

  /** File change velocity (changes per day, rolling 7-day average) */
  changeVelocity: number;

  /** Developer behavior signals */
  behaviorSignals: DeveloperBehaviorSignal[];

  /** Analysis history (last N analyses) */
  analysisHistory: AnalysisHistoryEntry[];
}

/**
 * Phase transition record
 */
export interface PhaseTransition {
  /** Previous phase */
  from: ProjectPhase;
  /** New phase */
  to: ProjectPhase;
  /** Transition timestamp */
  timestamp: string;
  /** Confidence at transition */
  confidence: number;
  /** Trigger reason */
  reason: string;
}

/**
 * Rule effectiveness score (for learning)
 */
export interface RuleEffectivenessScore {
  /** Rule ID */
  ruleId: string;
  /** Times rule was generated */
  generationCount: number;
  /** User feedback score (if provided) */
  feedbackScore?: number;
  /** Whether rule was manually edited */
  wasEdited: boolean;
  /** Last generated timestamp */
  lastGenerated: string;
}

/**
 * Developer behavior signal
 */
export interface DeveloperBehaviorSignal {
  /** Signal type */
  type: 'file-pair' | 'edit-pattern' | 'time-pattern';
  /** Signal data */
  data: Record<string, unknown>;
  /** Frequency */
  frequency: number;
  /** Last observed */
  lastObserved: string;
}

/**
 * Analysis history entry
 */
export interface AnalysisHistoryEntry {
  /** Timestamp */
  timestamp: string;
  /** Phase detected */
  phase: ProjectPhase;
  /** File count at time */
  fileCount: number;
  /** Component count */
  componentCount: number;
  /** Test ratio */
  testRatio: number;
  /** Trigger that caused analysis */
  trigger: 'file-change' | 'commit' | 'batch-create' | 'manual';
}

// ============================================================================
// WATCHER TYPES
// ============================================================================

/**
 * File change event from watcher
 */
export interface FileChangeEvent {
  /** Change type */
  type: 'create' | 'modify' | 'delete';
  /** File path (relative to project root) */
  path: string;
  /** Absolute file path */
  absolutePath: string;
  /** Timestamp */
  timestamp: number;
  /** File extension */
  extension: string;
}

/**
 * Accumulated changes ready for processing
 */
export interface AccumulatedChanges {
  /** All changes in this batch */
  changes: FileChangeEvent[];
  /** Change categories */
  categories: {
    structural: FileChangeEvent[];
    content: FileChangeEvent[];
    config: FileChangeEvent[];
    dependency: FileChangeEvent[];
  };
  /** Batch start time */
  startTime: number;
  /** Batch end time */
  endTime: number;
  /** Trigger reason */
  trigger: 'debounce' | 'commit' | 'batch-threshold' | 'manual';
}

/**
 * Watcher configuration
 */
export interface ForgeWatcherConfig {
  /** Project root path */
  projectPath: string;
  /** Debounce delay in ms */
  debounceMs: number;
  /** Batch threshold (number of files) */
  batchThreshold: number;
  /** Patterns to watch */
  watchPatterns: string[];
  /** Patterns to ignore */
  ignorePatterns: string[];
  /** Enable git commit watching */
  watchCommits: boolean;
}

// ============================================================================
// AST ANALYZER TYPES
// ============================================================================

/**
 * AST analysis result for a file
 */
export interface FileASTAnalysis {
  /** File path */
  filePath: string;
  /** File hash */
  fileHash: string;
  /** Functions found */
  functions: FunctionAnalysis[];
  /** Imports */
  imports: ImportAnalysis[];
  /** Exports */
  exports: ExportAnalysis[];
  /** Component props (if React component) */
  componentProps?: ComponentPropsAnalysis;
  /** Hooks used */
  hooksUsed: string[];
  /** Error handling patterns */
  errorPatterns: ErrorPattern[];
  /** Complexity metrics */
  complexity: ComplexityMetrics;
}

/**
 * Function analysis result
 */
export interface FunctionAnalysis {
  /** Function name */
  name: string;
  /** Function type */
  type: 'function' | 'arrow' | 'method' | 'constructor';
  /** Is async */
  isAsync: boolean;
  /** Is exported */
  isExported: boolean;
  /** Parameter count */
  paramCount: number;
  /** Line count */
  lineCount: number;
  /** Cyclomatic complexity */
  cyclomaticComplexity: number;
  /** Cognitive complexity */
  cognitiveComplexity: number;
  /** Start line */
  startLine: number;
  /** End line */
  endLine: number;
}

/**
 * Import analysis
 */
export interface ImportAnalysis {
  /** Module path */
  module: string;
  /** Is relative import */
  isRelative: boolean;
  /** Named imports */
  namedImports: string[];
  /** Default import name */
  defaultImport?: string;
  /** Is type-only import */
  isTypeOnly: boolean;
}

/**
 * Export analysis
 */
export interface ExportAnalysis {
  /** Export name */
  name: string;
  /** Export type */
  type: 'named' | 'default' | 're-export';
  /** Is type-only export */
  isTypeOnly: boolean;
}

/**
 * Component props analysis
 */
export interface ComponentPropsAnalysis {
  /** Props interface/type name */
  propsTypeName?: string;
  /** Individual props */
  props: Array<{
    name: string;
    type: string;
    required: boolean;
    defaultValue?: string;
  }>;
}

/**
 * Error handling pattern
 */
export interface ErrorPattern {
  /** Pattern type */
  type: 'try-catch' | 'error-boundary' | 'promise-catch' | 'throw';
  /** Line number */
  line: number;
  /** Has specific error type */
  hasSpecificType: boolean;
  /** Has recovery logic */
  hasRecovery: boolean;
}

/**
 * Complexity metrics for a file or function
 */
export interface ComplexityMetrics {
  /** Cyclomatic complexity (decision points + 1) */
  cyclomatic: number;
  /** Cognitive complexity (nested complexity) */
  cognitive: number;
  /** Lines of code */
  loc: number;
  /** Lines of logic (excluding blank/comments) */
  lloc: number;
  /** Max nesting depth */
  maxNestingDepth: number;
  /** Parameter count (for functions) */
  parameterCount?: number;
}

// ============================================================================
// PATTERN LEARNER TYPES
// ============================================================================

/**
 * Learned pattern from codebase
 */
export interface LearnedPattern {
  /** Pattern ID */
  id: string;
  /** Pattern category */
  category: 'naming' | 'structure' | 'function' | 'error-handling' | 'import' | 'export' | 'component';
  /** Pattern description */
  description: string;
  /** Pattern regex or matcher */
  matcher: string;
  /** Examples found in codebase */
  examples: string[];
  /** Frequency (0-1) */
  frequency: number;
  /** Confidence (0-1) */
  confidence: number;
  /** Files where pattern was found */
  foundIn: string[];
}

/**
 * Pattern learning result
 */
export interface PatternLearningResult {
  /** All learned patterns */
  patterns: LearnedPattern[];
  /** Naming conventions detected */
  namingConventions: {
    files: string;
    components: string;
    functions: string;
    variables: string;
    types: string;
  };
  /** File organization patterns */
  fileOrganization: {
    structure: 'flat' | 'feature-based' | 'type-based' | 'domain-driven';
    patterns: string[];
  };
  /** Common function signatures */
  commonSignatures: Array<{
    pattern: string;
    frequency: number;
    examples: string[];
  }>;
  /** Error handling style */
  errorHandlingStyle: 'try-catch' | 'result-type' | 'callback' | 'mixed';
}

// ============================================================================
// RULE ORCHESTRATOR TYPES
// ============================================================================

/**
 * Rule orchestration decision
 */
export interface RuleOrchestrationDecision {
  /** Rules to generate */
  rulesToGenerate: RuleCategory[];
  /** Rules to skip */
  rulesToSkip: RuleCategory[];
  /** Priority order */
  priorityOrder: RuleCategory[];
  /** Max rules for current phase */
  maxRules: number;
  /** Focus areas for current phase */
  focusAreas: string[];
  /** Reason for decision */
  reasoning: string;
}

/**
 * Phase-specific rule configuration
 */
export interface PhaseRuleConfig {
  /** Phase */
  phase: ProjectPhase;
  /** Max rules */
  maxRules: number;
  /** Focus categories */
  focusCategories: RuleCategory[];
  /** Skip categories */
  skipCategories: RuleCategory[];
  /** Rule content style */
  contentStyle: 'minimal' | 'standard' | 'detailed';
}

/**
 * Default phase rule configurations
 */
export const PHASE_RULE_CONFIGS: Record<ProjectPhase, PhaseRuleConfig> = {
  scaffold: {
    phase: 'scaffold',
    maxRules: 5,
    focusCategories: ['architecture', 'workflow', 'avoid'],
    skipCategories: ['performance', 'caching', 'i18n', 'accessibility'],
    contentStyle: 'minimal',
  },
  prototype: {
    phase: 'prototype',
    maxRules: 5,
    focusCategories: ['architecture', 'workflow', 'avoid', 'types'],
    skipCategories: ['performance', 'caching', 'i18n', 'security'],
    contentStyle: 'minimal',
  },
  'active-dev': {
    phase: 'active-dev',
    maxRules: 10,
    focusCategories: ['workflow', 'components', 'types', 'testing', 'hooks', 'state'],
    skipCategories: ['caching', 'i18n'],
    contentStyle: 'standard',
  },
  stabilization: {
    phase: 'stabilization',
    maxRules: 15,
    focusCategories: ['workflow', 'testing', 'error-handling', 'security', 'types'],
    skipCategories: ['i18n'],
    contentStyle: 'standard',
  },
  production: {
    phase: 'production',
    maxRules: 20,
    focusCategories: ['workflow', 'security', 'performance', 'error-handling', 'logging'],
    skipCategories: [],
    contentStyle: 'detailed',
  },
  maintenance: {
    phase: 'maintenance',
    maxRules: 10,
    focusCategories: ['workflow', 'architecture', 'types', 'security'],
    skipCategories: ['components', 'hooks', 'state'],
    contentStyle: 'standard',
  },
};

// ============================================================================
// NOTIFICATION TYPES
// ============================================================================

/**
 * Forge notification event
 */
export interface ForgeNotification {
  /** Notification type */
  type: 'info' | 'success' | 'warning' | 'error' | 'progress';
  /** Message */
  message: string;
  /** Detail (optional) */
  detail?: string;
  /** Auto-dismiss after ms (0 = no auto-dismiss) */
  autoDismissMs: number;
  /** Progress (0-100, for progress type) */
  progress?: number;
  /** Timestamp */
  timestamp: number;
}

/**
 * Forge status for UI
 */
export interface ForgeStatus {
  /** Current state */
  state: 'idle' | 'watching' | 'analyzing' | 'updating' | 'error';
  /** Current phase */
  phase: ProjectPhase;
  /** Rule count */
  ruleCount: number;
  /** Last update timestamp */
  lastUpdate: string | null;
  /** Last error (if state is error) */
  lastError?: string;
  /** Files being watched */
  watchedFiles: number;
  /** Pending changes */
  pendingChanges: number;
}
