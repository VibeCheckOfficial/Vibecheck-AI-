/**
 * Reality Mode Type Definitions
 * 
 * Types for detecting fake data, mock APIs, and demo responses.
 */

// ============================================================================
// Verdict Types
// ============================================================================

export type Verdict = 'green' | 'yellow' | 'red';

export interface TrafficClassification {
  /** Overall verdict */
  verdict: Verdict;
  /** Confidence score (0-100) */
  score: number;
  /** Reasons for the verdict */
  reasons: VerdictReason[];
  /** Detected patterns */
  detectedPatterns: DetectedPattern[];
}

export interface VerdictReason {
  /** Type of reason */
  type: 'fake_domain' | 'fake_response' | 'missing_data' | 'api_error' | 'generic_success';
  /** Human-readable description */
  description: string;
  /** Severity */
  severity: 'critical' | 'warning' | 'info';
  /** Score impact */
  scoreImpact: number;
}

export interface DetectedPattern {
  /** Pattern name */
  name: string;
  /** Pattern category */
  category: 'domain' | 'response' | 'data';
  /** Matched value */
  matched: string;
  /** Location in response/URL */
  location?: string;
}

// ============================================================================
// Pattern Types
// ============================================================================

export interface FakePattern {
  /** Pattern identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Regex pattern */
  pattern: RegExp;
  /** Pattern category */
  category: 'domain' | 'response';
  /** Score impact when matched */
  scoreImpact: number;
  /** Severity level */
  severity: 'critical' | 'warning' | 'info';
}

// ============================================================================
// Request/Response Types
// ============================================================================

export interface HttpRequest {
  /** Request URL */
  url: string;
  /** HTTP method */
  method: string;
  /** Request headers */
  headers?: Record<string, string>;
  /** Request body (for POST, etc.) */
  body?: string;
}

export interface HttpResponse {
  /** HTTP status code */
  status: number;
  /** Response headers */
  headers?: Record<string, string>;
  /** Response body */
  body?: string;
  /** Response time in ms */
  responseTime?: number;
}

// ============================================================================
// Classification Options
// ============================================================================

export interface ClassificationOptions {
  /** Custom patterns to add */
  customPatterns?: FakePattern[];
  /** Patterns to ignore */
  ignorePatterns?: string[];
  /** Minimum score to pass (default: 60) */
  passThreshold?: number;
  /** Minimum score for warning (default: 90) */
  warnThreshold?: number;
}

// ============================================================================
// Constants
// ============================================================================

export const VERDICT_COLORS = {
  green: '#22c55e',
  yellow: '#eab308',
  red: '#ef4444',
} as const;

export const VERDICT_LABELS = {
  green: 'Real Production Data',
  yellow: 'Possible Mock/Test Data',
  red: 'Likely Fake/Mock Data',
} as const;

// ============================================================================
// Runtime Verification Types
// ============================================================================

/**
 * Runtime verification verdict
 */
export type RuntimeVerdict = 'pass' | 'warn' | 'fail';

/**
 * Route definition from truthpack
 */
export interface RouteDefinition {
  /** HTTP method */
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD';
  /** Route path */
  path: string;
  /** Authentication requirements */
  auth?: {
    required: boolean;
    roles?: string[];
  };
  /** Source location */
  source?: {
    file: string;
    line: number;
  };
}

/**
 * Authentication context for runtime verification
 */
export interface AuthContext {
  /** Authentication type */
  type: 'cookie' | 'header' | 'form' | 'basic';
  /** Credentials (will be redacted in logs) */
  credentials: Record<string, string>;
  /** Login page URL (for form auth) */
  loginUrl?: string;
  /** Login form selectors */
  loginSelectors?: {
    username?: string;
    password?: string;
    submit?: string;
  };
}

/**
 * Runtime mode configuration
 */
export interface RuntimeConfig {
  /** Base URL of the running application */
  baseUrl: string;
  
  /** URL allowlist patterns */
  allowlist: string[];
  
  /** Timeout configuration */
  timeouts: {
    perAction: number;
    perPage: number;
    globalRun: number;
    networkRequest: number;
  };
  
  /** Concurrency limits */
  concurrency: {
    maxPages: number;
    maxRoutes: number;
    maxRequests: number;
  };
  
  /** Evidence collection options */
  evidence: {
    screenshots: boolean;
    traces: boolean;
    networkLogs: boolean;
    consoleErrors: boolean;
    videos?: boolean;
  };
  
  /** Browser options */
  browser: {
    headless: boolean;
    viewport: { width: number; height: number };
  };
  
  /** Sampling configuration for large route lists */
  sampling?: {
    enabled: boolean;
    strategy: 'random' | 'priority' | 'coverage';
    maxRoutes: number;
  };
}

/**
 * Network request log entry
 */
export interface NetworkLogEntry {
  /** Request URL */
  url: string;
  /** HTTP method */
  method: string;
  /** Response status code */
  status: number;
  /** Response time in ms */
  responseTime: number;
  /** Request timestamp */
  timestamp: string;
  /** Whether request was blocked by allowlist */
  blocked?: boolean;
  /** Resource type */
  resourceType?: string;
}

/**
 * Network summary for a route
 */
export interface NetworkSummary {
  /** Total requests made */
  totalRequests: number;
  /** Successful requests (2xx) */
  successfulRequests: number;
  /** Failed requests (4xx, 5xx) */
  failedRequests: number;
  /** Blocked domains (outside allowlist) */
  blockedDomains: string[];
  /** Status code distribution */
  statusCodes: Record<number, number>;
  /** Average response time in ms */
  avgResponseTime: number;
}

/**
 * Runtime finding from verification
 */
export interface RuntimeFinding {
  /** Stable finding ID */
  id: string;
  /** Rule that generated this finding */
  ruleId: string;
  /** Human-readable rule name */
  ruleName: string;
  /** Severity level */
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  /** Finding message */
  message: string;
  /** Route that was verified */
  route: {
    method: string;
    path: string;
    actualUrl: string;
  };
  /** Evidence pointers */
  evidence: RuntimeEvidence;
  /** Timing information */
  timing: {
    startedAt: string;
    completedAt: string;
    durationMs: number;
  };
}

/**
 * Evidence collected during runtime verification
 */
export interface RuntimeEvidence {
  /** Path to screenshot file */
  screenshotPath?: string;
  /** Path to trace file */
  tracePath?: string;
  /** Network request summary */
  networkSummary?: NetworkSummary;
  /** Console errors captured */
  consoleErrors?: string[];
  /** Additional context */
  context?: Record<string, unknown>;
}

/**
 * Artifacts index for a run
 */
export interface ArtifactsIndex {
  /** Run identifier */
  runId: string;
  /** Base directory for artifacts */
  baseDir: string;
  /** Index of all artifacts */
  artifacts: Array<{
    route: string;
    routeHash: string;
    type: 'screenshot' | 'trace' | 'network' | 'console';
    path: string;
    sizeBytes: number;
    timestamp: string;
  }>;
  /** Summary statistics */
  stats: {
    totalArtifacts: number;
    totalSizeBytes: number;
    screenshotCount: number;
    traceCount: number;
  };
}

/**
 * Run summary
 */
export interface RunSummary {
  /** Run identifier */
  runId: string;
  /** When the run started */
  startedAt: string;
  /** When the run completed */
  completedAt: string;
  /** Total duration in ms */
  durationMs: number;
  /** Total routes from truthpack */
  routesTotal: number;
  /** Routes successfully verified */
  routesVerified: number;
  /** Routes skipped (sampling, errors) */
  routesSkipped: number;
  /** Routes that failed verification */
  routesFailed: number;
  /** Total findings */
  findingsTotal: number;
  /** Findings by severity */
  findingsBySeverity: Record<string, number>;
  /** Overall verdict */
  verdict: RuntimeVerdict;
}

/**
 * Video artifacts from Reality Mode
 */
export interface VideoArtifacts {
  /** URL to the main video recording */
  videoUrl?: string;
  /** URL to the video thumbnail */
  thumbnailUrl?: string;
  /** Video duration in seconds */
  duration?: number;
  /** Local path to video file (before upload) */
  localPath?: string;
  /** Screenshots with timestamps */
  screenshots?: Array<{
    url: string;
    timestamp: number;
    route?: string;
  }>;
}

/**
 * Complete output from Reality Mode
 */
export interface RealityModeOutput {
  /** Findings with evidence */
  findings: RuntimeFinding[];
  /** Artifacts index */
  artifactsIndex: ArtifactsIndex;
  /** Proof receipts */
  receipts: ProofReceipt[];
  /** Run summary */
  summary: RunSummary;
  /** Path to HTML report */
  reportPath?: string;
  /** Video artifacts (if recording enabled) */
  videoArtifacts?: VideoArtifacts;
  /** Local artifacts directory path */
  artifactsDir?: string;
}

// ============================================================================
// Proof Receipt Types
// ============================================================================

/**
 * Proof receipt category
 */
export type ProofCategory =
  | 'route_hit'
  | 'auth_gate'
  | 'ui_flow'
  | 'api_response'
  | 'error_handling'
  | 'permission';

/**
 * Proof receipt verdict
 */
export type ProofVerdict = 'PASS' | 'FAIL' | 'SKIP' | 'TIMEOUT' | 'ERROR';

/**
 * Trace pointer to evidence artifact
 */
export interface TracePointer {
  /** Reference type */
  type: 'screenshot' | 'trace' | 'network' | 'log';
  /** Relative path to artifact */
  path: string;
  /** Byte offset or line number */
  offset?: number;
  /** Timestamp within trace */
  timestamp?: string;
}

/**
 * Proof receipt for a verified route
 */
export interface ProofReceipt {
  /** Schema version for forward compatibility */
  schemaVersion: 'vibecheck.proof.v2';
  /** Unique proof ID */
  id: string;
  /** Human-readable title */
  title: string;
  /** Category of verification */
  category: ProofCategory;
  /** Pass/Fail verdict */
  verdict: ProofVerdict;
  /** Human-readable explanation */
  reason: string;
  /** Failure details (if verdict is FAIL) */
  failureDetail?: {
    expected: string;
    actual: string;
    diff?: string;
  };
  /** Subject of verification */
  subject: {
    type: 'route' | 'page' | 'api';
    identifier: string;
    method?: string;
    url?: string;
  };
  /** Pointers to evidence artifacts */
  traces: TracePointer[];
  /** Timing information */
  timing: {
    startedAt: string;
    completedAt: string;
    durationMs: number;
  };
  /** Assertions that were checked */
  assertions: Array<{
    description: string;
    passed: boolean;
    expected?: string;
    actual?: string;
  }>;
  /** Confidence score 0-100 */
  confidence: number;
  /** SHA-256 signature for tamper detection */
  signature: string;
}

// ============================================================================
// Runtime Rule Types
// ============================================================================

/**
 * Context provided to runtime rules
 */
export interface RuleContext {
  /** Route being verified */
  route: RouteDefinition;
  /** Page response */
  response: {
    url: string;
    status: number;
    headers: Record<string, string>;
  };
  /** Network logs from the page */
  networkLogs: NetworkLogEntry[];
  /** Console errors from the page */
  consoleErrors: string[];
  /** URL allowlist configuration */
  allowlist: string[];
  /** Authentication context (if provided) */
  authContext?: AuthContext;
  /** Playwright page object (if available) */
  page?: unknown;
}

/**
 * Runtime rule definition
 */
export interface RuntimeRule {
  /** Unique rule ID */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description */
  description: string;
  /** Default severity */
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  /** Check function */
  check: (context: RuleContext) => Promise<RuntimeRuleResult>;
}

/**
 * Result from a runtime rule check
 */
export interface RuntimeRuleResult {
  /** Whether the check passed */
  pass: boolean;
  /** Message (used if check failed) */
  message?: string;
  /** Evidence to attach */
  evidence?: Record<string, unknown>;
}
