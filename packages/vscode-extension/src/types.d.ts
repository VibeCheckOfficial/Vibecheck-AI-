/**
 * VibeCheck VS Code Extension Types
 */

/** Issue severity levels */
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

/** Security issue detected by scanner */
export interface Issue {
  /** Unique identifier */
  id: string;
  /** Rule that triggered this issue */
  rule: string;
  /** Human-readable message */
  message: string;
  /** Detailed description */
  description?: string;
  /** Issue severity */
  severity: Severity;
  /** File path */
  file: string;
  /** Line number (1-indexed) */
  line: number;
  /** Column number (1-indexed) */
  column: number;
  /** End line (for multi-line issues) */
  endLine?: number;
  /** End column */
  endColumn?: number;
  /** Source code snippet */
  snippet?: string;
  /** Whether an auto-fix is available */
  hasFix: boolean;
  /** Fix suggestion */
  fix?: IssueFix;
  /** Related documentation URL */
  docs?: string;
  /** Tags for categorization */
  tags?: string[];
  /** CWE ID if applicable */
  cwe?: string;
  /** OWASP category if applicable */
  owasp?: string;
}

/** Auto-fix for an issue */
export interface IssueFix {
  /** Fix description */
  description: string;
  /** Text edits to apply */
  edits: TextEdit[];
}

/** Text edit for applying fixes */
export interface TextEdit {
  /** Range to replace */
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  /** New text to insert */
  newText: string;
}

/** Scan result from the scanner */
export interface ScanResult {
  /** Whether scan completed successfully */
  success: boolean;
  /** Files scanned */
  filesScanned: number;
  /** Total lines scanned */
  linesScanned: number;
  /** Issues found */
  issues: Issue[];
  /** Security score (0-100) */
  score: number;
  /** Scan duration in milliseconds */
  duration: number;
  /** Scan timestamp */
  timestamp: Date;
  /** Errors during scan */
  errors?: string[];
}

/** Reality Mode test result */
export interface RealityTestResult {
  /** Test name */
  name: string;
  /** Test passed */
  passed: boolean;
  /** Duration in milliseconds */
  duration: number;
  /** Error message if failed */
  error?: string;
  /** Screenshot path */
  screenshot?: string;
  /** Related issues */
  issues?: Issue[];
}

/** Reality Mode session */
export interface RealityModeSession {
  /** Session ID */
  id: string;
  /** Base URL being tested */
  baseUrl: string;
  /** Browser type */
  browser: 'chromium' | 'firefox' | 'webkit';
  /** Test results */
  results: RealityTestResult[];
  /** Session status */
  status: 'running' | 'completed' | 'failed';
  /** Start time */
  startedAt: Date;
  /** End time */
  completedAt?: Date;
}

/** Code flow node for visualization */
export interface CodeFlowNode {
  /** Node ID */
  id: string;
  /** Node type */
  type: 'source' | 'sink' | 'transform' | 'sanitizer' | 'validator';
  /** Node label */
  label: string;
  /** File location */
  file: string;
  /** Line number */
  line: number;
  /** Column number */
  column: number;
  /** Code snippet */
  code?: string;
}

/** Code flow edge connecting nodes */
export interface CodeFlowEdge {
  /** Source node ID */
  from: string;
  /** Target node ID */
  to: string;
  /** Edge label */
  label?: string;
  /** Whether this path is tainted (unsanitized) */
  tainted: boolean;
}

/** Code flow graph */
export interface CodeFlow {
  /** Flow identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Nodes in the flow */
  nodes: CodeFlowNode[];
  /** Edges connecting nodes */
  edges: CodeFlowEdge[];
  /** Related security issue */
  issue?: Issue;
}

/** Security heatmap data */
export interface HeatmapData {
  /** File path */
  file: string;
  /** Risk scores per line */
  lines: Map<number, number>;
  /** Overall file risk score */
  fileScore: number;
  /** Hotspots (highest risk areas) */
  hotspots: HeatmapHotspot[];
}

/** High-risk area in heatmap */
export interface HeatmapHotspot {
  /** Start line */
  startLine: number;
  /** End line */
  endLine: number;
  /** Risk score (0-100) */
  score: number;
  /** Reason for high risk */
  reason: string;
  /** Related issues */
  issues: Issue[];
}

/** Report format options */
export type ReportFormat = 'html' | 'pdf' | 'markdown' | 'json' | 'sarif';

/** Report configuration */
export interface ReportConfig {
  /** Output format */
  format: ReportFormat;
  /** Include executive summary */
  includeSummary: boolean;
  /** Include issue details */
  includeDetails: boolean;
  /** Include remediation guidance */
  includeRemediation: boolean;
  /** Include code snippets */
  includeCode: boolean;
  /** Maximum issues per severity */
  maxIssuesPerSeverity?: number;
  /** Custom branding */
  branding?: {
    logo?: string;
    companyName?: string;
    primaryColor?: string;
  };
}

/** Extension configuration */
export interface VibeCheckConfig {
  /** Enable auto-scan on save */
  autoScanOnSave: boolean;
  /** Enable auto-scan on open */
  autoScanOnOpen: boolean;
  /** Minimum severity to show */
  minSeverity: Severity;
  /** Ignored rules */
  ignoredRules: string[];
  /** Ignored paths */
  ignoredPaths: string[];
  /** Reality Mode configuration */
  realityMode: {
    enabled: boolean;
    baseUrl?: string;
    browser: 'chromium' | 'firefox' | 'webkit';
    headless: boolean;
    timeout: number;
  };
  /** Heatmap configuration */
  heatmap: {
    enabled: boolean;
    threshold: number;
    colors: {
      low: string;
      medium: string;
      high: string;
      critical: string;
    };
  };
  /** AI features configuration */
  ai: {
    enabled: boolean;
    provider: 'openai' | 'anthropic' | 'local';
    model?: string;
    apiKey?: string;
  };
}

/** Message types for webview communication */
export type WebviewMessage =
  | { type: 'scan' }
  | { type: 'scanWorkspace' }
  | { type: 'realityMode' }
  | { type: 'openDashboard' }
  | { type: 'goToIssue'; index: number }
  | { type: 'fixIssue'; index: number }
  | { type: 'exportReport' }
  | { type: 'ready' }
  | { type: 'showHeatmap' }
  | { type: 'analyzeFlow' }
  | { type: 'fixAll' }
  | { type: 'openFile'; path: string };

/** Message from extension to webview */
export type ExtensionMessage =
  | { type: 'updateScore'; score: number }
  | { type: 'updateIssues'; issues: Issue[] }
  | { type: 'updateData'; data: DashboardData }
  | { type: 'scanStarted' }
  | { type: 'scanComplete' };

/** Dashboard data structure */
export interface DashboardData {
  /** Security score */
  score: number;
  /** All issues */
  issues: Issue[];
  /** Files with issues */
  files: FileStats[];
  /** Historical data */
  history: number[];
  /** Project name */
  projectName?: string;
}

/** File statistics */
export interface FileStats {
  /** File name */
  name: string;
  /** Full path */
  path: string;
  /** Issue count */
  issues: number;
  /** File risk score */
  score: number;
}

/** Telemetry event */
export interface TelemetryEvent {
  /** Event name */
  name: string;
  /** Event properties */
  properties?: Record<string, string | number | boolean>;
  /** Event timestamp */
  timestamp: Date;
}
