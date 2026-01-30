/**
 * Mission Intent Types
 * 
 * The unified object model for VibeCheck's Intent-centric architecture.
 * A Mission Intent governs agent behavior through:
 * - Scope (what the agent is allowed to touch)
 * - Risk Policy (what triggers WARN vs BLOCK)
 * - Proof Requirements (what evidence must exist to pass)
 * - Drift Detection (tracking changes outside scope)
 * - Proof Accumulation (receipts proving compliance)
 * 
 * Flow: Intent → Scope → Rules → Proof Receipts → Verdict
 */

// ============================================================================
// Mission Intent Core Types
// ============================================================================

/**
 * Status of a mission session
 */
export const MISSION_SESSION_STATUSES = ['active', 'paused', 'completed', 'failed', 'cancelled'] as const;
export type MissionSessionStatus = (typeof MISSION_SESSION_STATUSES)[number];

/**
 * Types of drift events
 */
export const DRIFT_EVENT_TYPES = [
  'scope_violation',    // File change outside allowed paths
  'risk_violation',     // Change to sensitive pattern
  'proof_missing',      // Required proof not present
  'operation_denied',   // Disallowed operation type
] as const;
export type DriftEventType = (typeof DRIFT_EVENT_TYPES)[number];

/**
 * Severity of drift events
 */
export const DRIFT_SEVERITIES = ['warn', 'block'] as const;
export type DriftSeverity = (typeof DRIFT_SEVERITIES)[number];

/**
 * Resolution status of a drift event
 */
export const DRIFT_RESOLUTIONS = ['pending', 'ignored', 'fixed', 'extended_scope'] as const;
export type DriftResolution = (typeof DRIFT_RESOLUTIONS)[number];

/**
 * Mission verdict
 */
export const MISSION_VERDICTS = ['SHIP', 'WARN', 'BLOCK'] as const;
export type MissionVerdict = (typeof MISSION_VERDICTS)[number];

/**
 * Allowed operations within a mission scope
 */
export const MISSION_OPERATIONS = ['read', 'write', 'modify', 'delete', 'execute'] as const;
export type MissionOperation = (typeof MISSION_OPERATIONS)[number];

// ============================================================================
// Mission Scope
// ============================================================================

/**
 * Defines what the agent is allowed to touch
 */
export interface MissionScope {
  /** Glob patterns for allowed paths */
  allowedPaths: string[];
  /** Glob patterns for excluded paths (takes precedence) */
  excludedPaths: string[];
  /** Allowed operation types */
  allowedOperations: MissionOperation[];
  /** Specific target files (if specified, restricts to these files only) */
  targetFiles?: string[];
}

// ============================================================================
// Risk Policy
// ============================================================================

/**
 * Defines what triggers WARN vs BLOCK
 */
export interface MissionRiskPolicy {
  /** 
   * Threshold for warnings (0-100)
   * Violations with risk score below this trigger warnings
   */
  warnThreshold: number;
  /**
   * Threshold for blocks (0-100)
   * Violations with risk score at or above this trigger blocks
   */
  blockThreshold: number;
  /**
   * Glob patterns that always trigger BLOCK
   * e.g., auth files, secrets, production configs
   */
  sensitivePatterns: string[];
  /**
   * Whether to auto-block on any scope violation
   */
  blockOnScopeViolation: boolean;
  /**
   * Whether to auto-block when proof requirements aren't met
   */
  blockOnMissingProof: boolean;
}

// ============================================================================
// Proof Requirements
// ============================================================================

/**
 * Defines what evidence must exist to pass
 */
export interface MissionProofRequirements {
  /** New routes must be registered in truthpack */
  requireRouteRegistration: boolean;
  /** New env vars must be declared in truthpack */
  requireEnvDeclaration: boolean;
  /** Changed code must have test coverage */
  requireTestCoverage: boolean;
  /** Types must be consistent with truthpack contracts */
  requireTypeConsistency: boolean;
  /** Custom assertion descriptions */
  customAssertions: string[];
  /** Minimum confidence score to pass (0-100) */
  minimumConfidence: number;
}

// ============================================================================
// Drift Events
// ============================================================================

/**
 * A drift event - when the agent deviates from the mission
 */
export interface DriftEvent {
  /** Unique event ID */
  id: string;
  /** When the drift occurred */
  timestamp: string;
  /** Type of drift */
  type: DriftEventType;
  /** Severity (warn or block) */
  severity: DriftSeverity;
  /** The file involved */
  file: string;
  /** Operation attempted */
  operation: MissionOperation;
  /** Human-readable description */
  description: string;
  /** Resolution status */
  resolution: DriftResolution;
  /** When the drift was resolved (if applicable) */
  resolvedAt?: string;
  /** Who/what resolved it */
  resolvedBy?: string;
  /** Additional context */
  context?: Record<string, unknown>;
}

// ============================================================================
// Proof Receipt References
// ============================================================================

/**
 * Reference to a proof receipt attached to the mission
 */
export interface ProofReceiptRef {
  /** Receipt ID */
  id: string;
  /** Receipt title */
  title: string;
  /** When it was generated */
  timestamp: string;
  /** Pass/Fail verdict */
  verdict: 'PASS' | 'FAIL' | 'SKIP' | 'TIMEOUT' | 'ERROR';
  /** Category of verification */
  category: string;
  /** Confidence score (0-100) */
  confidence: number;
  /** Subject identifier (route path, file, etc.) */
  subject: string;
}

// ============================================================================
// Mission Session
// ============================================================================

/**
 * Session tracking for a mission
 */
export interface MissionSession {
  /** When the mission started */
  startedAt: string;
  /** When the mission expires (optional) */
  expiresAt?: string;
  /** When the mission ended (if completed/failed) */
  endedAt?: string;
  /** Current status */
  status: MissionSessionStatus;
  /** Total changes tracked */
  totalChanges: number;
  /** Changes within scope */
  scopedChanges: number;
  /** Changes flagged as drift */
  driftCount: number;
}

// ============================================================================
// Mission Statistics
// ============================================================================

/**
 * Statistics for a mission
 */
export interface MissionStats {
  /** Total files touched */
  filesTouched: number;
  /** Files within scope */
  filesInScope: number;
  /** Files flagged as drift */
  filesWithDrift: number;
  /** Total proof receipts */
  totalReceipts: number;
  /** Passing receipts */
  passingReceipts: number;
  /** Failing receipts */
  failingReceipts: number;
  /** Overall confidence score (0-100) */
  overallConfidence: number;
  /** Duration in milliseconds */
  durationMs: number;
}

// ============================================================================
// Mission Intent (Main Type)
// ============================================================================

/**
 * The unified Mission Intent - governs agent behavior
 */
export interface MissionIntent {
  /** Unique mission ID */
  id: string;
  /** Human-readable title */
  title: string;
  /** Description of what the mission aims to accomplish */
  description: string;
  
  /** Scope definition */
  scope: MissionScope;
  
  /** Risk policy */
  riskPolicy: MissionRiskPolicy;
  
  /** Proof requirements */
  proofRequirements: MissionProofRequirements;
  
  /** Session tracking */
  session: MissionSession;
  
  /** Drift events during this mission */
  driftEvents: DriftEvent[];
  
  /** Proof receipts accumulated */
  receipts: ProofReceiptRef[];
  
  /** Current verdict (computed from drift + receipts) */
  currentVerdict: MissionVerdict;
  
  /** Mission statistics */
  stats: MissionStats;
  
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Mission Declaration (Input Type)
// ============================================================================

/**
 * Input for declaring a new mission
 */
export interface MissionDeclaration {
  /** Mission title */
  title: string;
  /** Mission description */
  description: string;
  
  /** Allowed paths (defaults to all files) */
  allowedPaths?: string[];
  /** Excluded paths (defaults to node_modules and .git) */
  excludedPaths?: string[];
  /** Allowed operations (defaults to read, write, modify) */
  allowedOperations?: MissionOperation[];
  /** Specific target files */
  targetFiles?: string[];
  
  /** Sensitive patterns that always block */
  sensitivePatterns?: string[];
  /** Block on scope violation (defaults to true in enforce mode) */
  blockOnScopeViolation?: boolean;
  /** Block on missing proof (defaults to false) */
  blockOnMissingProof?: boolean;
  
  /** Require route registration */
  requireRouteRegistration?: boolean;
  /** Require env declaration */
  requireEnvDeclaration?: boolean;
  /** Require test coverage */
  requireTestCoverage?: boolean;
  /** Require type consistency */
  requireTypeConsistency?: boolean;
  /** Custom assertions */
  customAssertions?: string[];
  
  /** Expiration in milliseconds */
  expiresInMs?: number;
  
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Drift Check Result
// ============================================================================

/**
 * Result of checking an action against the mission scope
 */
export interface DriftCheckResult {
  /** Whether the action is allowed */
  allowed: boolean;
  /** Whether drift was detected */
  isDrift: boolean;
  /** Severity of the drift (if any) */
  severity?: DriftSeverity;
  /** Type of drift (if any) */
  driftType?: DriftEventType;
  /** Human-readable reason */
  reason: string;
  /** Specific violations */
  violations: string[];
  /** The active mission (if any) */
  mission: MissionIntent | null;
}

// ============================================================================
// Mission Verdict Result
// ============================================================================

/**
 * Result of evaluating the mission verdict
 */
export interface MissionVerdictResult {
  /** The verdict */
  verdict: MissionVerdict;
  /** Confidence score (0-100) */
  confidence: number;
  /** Human-readable summary */
  summary: string;
  /** Blocking issues (if BLOCK) */
  blockingIssues: string[];
  /** Warnings (if WARN) */
  warnings: string[];
  /** Proof coverage percentage */
  proofCoverage: number;
  /** Drift events count */
  driftCount: number;
  /** Receipts summary */
  receiptsSummary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if a value is a valid mission session status
 */
export function isMissionSessionStatus(value: unknown): value is MissionSessionStatus {
  return typeof value === 'string' && MISSION_SESSION_STATUSES.includes(value as MissionSessionStatus);
}

/**
 * Check if a value is a valid drift event type
 */
export function isDriftEventType(value: unknown): value is DriftEventType {
  return typeof value === 'string' && DRIFT_EVENT_TYPES.includes(value as DriftEventType);
}

/**
 * Check if a value is a valid drift severity
 */
export function isDriftSeverity(value: unknown): value is DriftSeverity {
  return typeof value === 'string' && DRIFT_SEVERITIES.includes(value as DriftSeverity);
}

/**
 * Check if a value is a valid mission verdict
 */
export function isMissionVerdict(value: unknown): value is MissionVerdict {
  return typeof value === 'string' && MISSION_VERDICTS.includes(value as MissionVerdict);
}

/**
 * Check if a value is a valid mission operation
 */
export function isMissionOperation(value: unknown): value is MissionOperation {
  return typeof value === 'string' && MISSION_OPERATIONS.includes(value as MissionOperation);
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Generate a unique mission ID
 */
export function generateMissionId(): string {
  return `mission-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Generate a unique drift event ID
 */
export function generateDriftEventId(): string {
  return `drift-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Create default scope
 */
export function createDefaultScope(): MissionScope {
  return {
    allowedPaths: ['**/*'],
    excludedPaths: ['node_modules/**', '.git/**', 'dist/**', 'build/**'],
    allowedOperations: ['read', 'write', 'modify'],
    targetFiles: undefined,
  };
}

/**
 * Create default risk policy
 */
export function createDefaultRiskPolicy(): MissionRiskPolicy {
  return {
    warnThreshold: 30,
    blockThreshold: 70,
    sensitivePatterns: [
      '**/.env*',
      '**/secrets/**',
      '**/credentials*',
      '**/*secret*',
      '**/*password*',
      '**/auth/**',
      '**/middleware/auth*',
    ],
    blockOnScopeViolation: true,
    blockOnMissingProof: false,
  };
}

/**
 * Create default proof requirements
 */
export function createDefaultProofRequirements(): MissionProofRequirements {
  return {
    requireRouteRegistration: true,
    requireEnvDeclaration: true,
    requireTestCoverage: false,
    requireTypeConsistency: false,
    customAssertions: [],
    minimumConfidence: 50,
  };
}

/**
 * Create initial mission stats
 */
export function createInitialStats(): MissionStats {
  return {
    filesTouched: 0,
    filesInScope: 0,
    filesWithDrift: 0,
    totalReceipts: 0,
    passingReceipts: 0,
    failingReceipts: 0,
    overallConfidence: 0,
    durationMs: 0,
  };
}

/**
 * Create a new mission intent from a declaration
 */
export function createMissionIntent(declaration: MissionDeclaration): MissionIntent {
  const now = new Date().toISOString();
  
  return {
    id: generateMissionId(),
    title: declaration.title,
    description: declaration.description,
    
    scope: {
      allowedPaths: declaration.allowedPaths ?? ['**/*'],
      excludedPaths: declaration.excludedPaths ?? ['node_modules/**', '.git/**', 'dist/**', 'build/**'],
      allowedOperations: declaration.allowedOperations ?? ['read', 'write', 'modify'],
      targetFiles: declaration.targetFiles,
    },
    
    riskPolicy: {
      warnThreshold: 30,
      blockThreshold: 70,
      sensitivePatterns: declaration.sensitivePatterns ?? [
        '**/.env*',
        '**/secrets/**',
        '**/credentials*',
        '**/auth/**',
      ],
      blockOnScopeViolation: declaration.blockOnScopeViolation ?? true,
      blockOnMissingProof: declaration.blockOnMissingProof ?? false,
    },
    
    proofRequirements: {
      requireRouteRegistration: declaration.requireRouteRegistration ?? true,
      requireEnvDeclaration: declaration.requireEnvDeclaration ?? true,
      requireTestCoverage: declaration.requireTestCoverage ?? false,
      requireTypeConsistency: declaration.requireTypeConsistency ?? false,
      customAssertions: declaration.customAssertions ?? [],
      minimumConfidence: 50,
    },
    
    session: {
      startedAt: now,
      expiresAt: declaration.expiresInMs 
        ? new Date(Date.now() + declaration.expiresInMs).toISOString()
        : undefined,
      status: 'active',
      totalChanges: 0,
      scopedChanges: 0,
      driftCount: 0,
    },
    
    driftEvents: [],
    receipts: [],
    currentVerdict: 'SHIP',
    stats: createInitialStats(),
    metadata: declaration.metadata,
  };
}

/**
 * Create a drift event
 */
export function createDriftEvent(
  type: DriftEventType,
  severity: DriftSeverity,
  file: string,
  operation: MissionOperation,
  description: string,
  context?: Record<string, unknown>
): DriftEvent {
  return {
    id: generateDriftEventId(),
    timestamp: new Date().toISOString(),
    type,
    severity,
    file,
    operation,
    description,
    resolution: 'pending',
    context,
  };
}
