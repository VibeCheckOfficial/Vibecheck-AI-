/**
 * CLI-specific types for VibeCheck
 * Comprehensive type definitions for all commands and options
 */

/** Base options available to all commands */
export interface CliOptions {
  /** Enable verbose output */
  verbose?: boolean;
  /** Suppress non-essential output */
  quiet?: boolean;
  /** Output as JSON */
  json?: boolean;
  /** Path to configuration file */
  config?: string;
  /** Disable colored output */
  noColor?: boolean;
  /** Suppress the ASCII banner */
  noBanner?: boolean;
}

/** Options for the scan command */
export interface ScanOptions extends CliOptions {
  /** Output path for truthpack */
  output?: string;
  /** Include patterns for file scanning */
  include?: string[];
  /** Exclude patterns for file scanning */
  exclude?: string[];
  /** Scan timeout in milliseconds */
  timeout?: number;
  /** Force regeneration even if truthpack exists */
  force?: boolean;
  /** Generate AI context rules after scan (Forge) */
  forge?: boolean;
}

/** Options for the validate command */
export interface ValidateOptions extends CliOptions {
  /** Enable strict validation */
  strict?: boolean;
  /** Attempt to fix issues automatically */
  fix?: boolean;
  /** Maximum number of errors to report */
  maxErrors?: number;
  /** Validation timeout in milliseconds */
  timeout?: number;
}

/** Options for the check command */
export interface CheckOptions extends CliOptions {
  /** Enable strict checking */
  strict?: boolean;
  /** Stop on first error */
  failFast?: boolean;
  /** Check timeout in milliseconds */
  timeout?: number;
}

/** Options for the watch command */
export interface WatchOptions extends CliOptions {
  /** Debounce delay in milliseconds */
  debounce?: number;
  /** Run validation once and exit */
  once?: boolean;
}

/** Options for the init command */
export interface InitOptions extends CliOptions {
  /** Overwrite existing configuration */
  force?: boolean;
  /** Configuration template */
  template?: 'minimal' | 'standard' | 'strict';
  /** Generate AI context rules (Forge) */
  forge?: boolean;
  /** Connect to CI/CD pipeline */
  connect?: boolean;
  /** Include ship gate in CI/CD */
  shipGate?: boolean;
  /** Quick init: auto-scan, calculate Ship Score, show top issues */
  quick?: boolean;
}

/** Options for the config command */
export interface ConfigOptions extends CliOptions {
  /** Get a specific configuration value */
  get?: string;
  /** Set a configuration value */
  set?: string;
  /** List all configuration values */
  list?: boolean;
  /** Validate the configuration file */
  validate?: boolean;
  /** Show the configuration file path */
  path?: boolean;
}

/** Options for the doctor command */
export interface DoctorOptions extends CliOptions {
  /** No additional options currently */
}

/** Options for the ship command */
export interface ShipOptions extends CliOptions {
  /** Attempt to auto-fix issues */
  fix?: boolean;
  /** Force deployment despite blockers */
  force?: boolean;
  /** Stricter pre-deploy checks */
  strict?: boolean;
  /** Enable Reality Mode (runtime verification) */
  reality?: boolean;
  /** Base URL for Reality Mode (disables auto-start if provided) */
  realityUrl?: string;
  /** Reality Mode timeout in seconds */
  realityTimeout?: number;
  /** Run Reality Mode in headless mode */
  realityHeadless?: boolean;
  /** Server startup timeout in seconds */
  realityStartupTimeout?: number;
  /** Enable AI Chaos Agent */
  chaos?: boolean;
  /** Aggressive chaos mode (includes security tests) */
  chaosAggressive?: boolean;
  /** Maximum chaos actions to perform */
  chaosActions?: number;
  /** AI provider for chaos agent */
  chaosProvider?: string;
  /** Model to use for chaos agent */
  chaosModel?: string;
  /** Base URL for ollama/local provider */
  chaosUrl?: string;
  /** API key for anthropic/openai */
  chaosApiKey?: string;
  /** Disable vision (DOM-only mode) */
  chaosNoVision?: boolean;
}

/** Options for the fix command */
export interface FixOptions extends CliOptions {
  /** Files to fix (optional filter) */
  files?: string[];
  /** Apply fixes automatically without review */
  apply?: boolean;
  /** Interactive mode - review each fix */
  interactive?: boolean;
  /** Dry run - show fixes without applying */
  dryRun?: boolean;
  /** Rollback a previous fix transaction */
  rollback?: string;
  /** Minimum confidence threshold (0-1) */
  confidence?: number;
}

/** Report type options */
export type ReportTypeOption = 'reality-check' | 'ship-readiness' | 'executive-summary' | 'detailed-technical' | 'compliance';

/** Options for the report command */
export interface ReportOptions extends CliOptions {
  /** Report type to generate */
  type?: ReportTypeOption;
  /** Output format (html or pdf) */
  format?: 'html' | 'pdf';
  /** Output file path */
  output?: string;
  /** Theme (dark or light) */
  theme?: 'dark' | 'light';
  /** Company name for branding */
  branding?: string;
  /** Open report in browser after generation */
  open?: boolean;
}

/** Output format types */
export type OutputFormat = 'json' | 'pretty';

/** Command result wrapper */
export interface CommandResult<T = unknown> {
  /** Whether the command succeeded */
  success: boolean;
  /** Result data on success */
  data?: T;
  /** Error message on failure */
  error?: string;
  /** Error code for programmatic handling */
  code?: string;
  /** Actionable suggestions for fixing issues */
  suggestions?: string[];
  /** Duration in milliseconds */
  duration?: number;
}

/** Validation issue */
export interface ValidationIssue {
  /** Issue type */
  type: 'error' | 'warning' | 'info';
  /** Human-readable message */
  message: string;
  /** File path if applicable */
  file?: string;
  /** Line number if applicable */
  line?: number;
  /** Column number if applicable */
  column?: number;
  /** Suggested fix */
  suggestion?: string;
  /** Rule or check that triggered this issue */
  rule?: string;
}

/** Scan statistics */
export interface ScanStats {
  /** Number of files scanned */
  filesScanned: number;
  /** Number of routes found */
  routes: number;
  /** Number of environment variables found */
  envVars: number;
  /** Number of auth patterns found */
  authPatterns: number;
  /** Number of contracts found */
  contracts: number;
  /** Scan duration in milliseconds */
  duration: number;
}

/** Validation summary */
export interface ValidationSummary {
  /** Total files validated */
  total: number;
  /** Files that passed validation */
  passed: number;
  /** Files that failed validation */
  failed: number;
  /** Total warnings */
  warnings: number;
  /** Total errors */
  errors: number;
  /** Duration in milliseconds */
  duration: number;
}

/** Check result */
export interface CheckResult {
  /** Number of hallucinations detected */
  hallucinations: number;
  /** Number of drift issues detected */
  drifts: number;
  /** Total issues */
  totalIssues: number;
  /** Whether the check passed */
  passed: boolean;
  /** Duration in milliseconds */
  duration: number;
}

/** Progress callback for long operations */
export type ProgressCallback = (progress: {
  current: number;
  total: number;
  message?: string;
}) => void;

/** File change event for watch mode */
export interface FileChange {
  /** File path */
  path: string;
  /** Change type */
  type: 'add' | 'change' | 'unlink';
  /** Timestamp */
  timestamp: number;
}

/** Watch mode state */
export interface WatchState {
  /** Is currently watching */
  watching: boolean;
  /** Files being watched */
  watchedFiles: number;
  /** Last validation time */
  lastValidation?: Date;
  /** Last validation result */
  lastResult?: ValidationSummary;
}
