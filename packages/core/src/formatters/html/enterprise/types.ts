/**
 * Enterprise Report Type Definitions
 * 
 * Comprehensive types for enterprise-grade HTML/PDF reports.
 */

// ============================================================================
// Report Configuration
// ============================================================================

export interface EnterpriseReportConfig {
  /** Report type */
  type: ReportType;
  /** Report title override */
  title?: string;
  /** Theme */
  theme: 'dark' | 'light';
  /** Branding configuration */
  branding?: BrandingConfig;
  /** Include sections */
  sections: ReportSections;
  /** Output format */
  format: 'html' | 'pdf';
  /** PDF-specific options */
  pdfOptions?: PdfOptions;
  /** Comparison with previous scan */
  comparison?: ComparisonConfig;
  /** Localization */
  locale?: string;
  /** Timezone for dates */
  timezone?: string;
}

export const REPORT_TYPES = ['reality-check', 'ship-readiness', 'executive-summary', 'detailed-technical', 'compliance'] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export interface BrandingConfig {
  /** Company/product name */
  companyName?: string;
  /** Logo URL or base64 */
  logoUrl?: string;
  /** Primary brand color (hex) */
  primaryColor?: string;
  /** Secondary brand color (hex) */
  secondaryColor?: string;
  /** Custom footer text */
  footerText?: string;
  /** Show "Powered by VibeCheck" badge */
  showPoweredBy?: boolean;
}

export interface ReportSections {
  header: boolean;
  scoreOverview: boolean;
  statusBadge: boolean;
  keyMetrics: boolean;
  realityTable: boolean;
  scoreBreakdown: boolean;
  categoryBreakdown: boolean;
  runtimeValidation: boolean;
  findings: boolean;
  trends: boolean;
  recommendations: boolean;
  compliance: boolean;
  footer: boolean;
}

export interface PdfOptions {
  /** Page format */
  format?: 'A4' | 'Letter' | 'Legal';
  /** Page orientation */
  orientation?: 'portrait' | 'landscape';
  /** Page margins (in mm) */
  margins?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  /** Include page numbers */
  pageNumbers?: boolean;
  /** Include table of contents */
  tableOfContents?: boolean;
  /** Header/footer on each page */
  headerFooter?: boolean;
}

export interface ComparisonConfig {
  /** Previous scan ID to compare */
  previousScanId?: string;
  /** Show trend indicators */
  showTrends: boolean;
  /** Historical data points */
  historicalData?: HistoricalDataPoint[];
}

export interface HistoricalDataPoint {
  date: string;
  score: number;
  findings: number;
  verdict: string;
}

// ============================================================================
// Report Data Types
// ============================================================================

export interface EnterpriseReportData {
  /** Report metadata */
  meta: ReportMeta;
  /** Project information */
  project: ProjectInfo;
  /** Overall scores and grades */
  scores: ScoreData;
  /** Ship readiness status */
  readiness: ReadinessStatus;
  /** Key metrics summary */
  metrics: KeyMetrics;
  /** Reality check comparison */
  realityCheck: RealityCheckData;
  /** Category-wise breakdown */
  categories: CategoryBreakdown[];
  /** Runtime validation results */
  runtimeValidation: RuntimeValidation;
  /** Detailed findings */
  findings: EnterpriseReportFinding[];
  /** Compliance status */
  compliance: ComplianceData;
  /** Recommendations */
  recommendations: Recommendation[];
  /** Trend data */
  trends?: TrendData;
}

export interface ReportMeta {
  /** Unique report ID */
  reportId: string;
  /** Report type */
  type: ReportType;
  /** Generation timestamp */
  generatedAt: string;
  /** VibeCheck version */
  version: string;
  /** Scan duration in ms */
  scanDuration: number;
  /** Total files analyzed */
  filesAnalyzed: number;
  /** Total lines of code */
  linesOfCode?: number;
}

export interface ProjectInfo {
  /** Project name */
  name: string;
  /** Project path */
  path: string;
  /** Git branch */
  branch?: string;
  /** Git commit SHA */
  commitSha?: string;
  /** Git commit message */
  commitMessage?: string;
  /** Repository URL */
  repoUrl?: string;
  /** Scan timestamp */
  scannedAt: string;
}

export interface ScoreData {
  /** Overall score (0-100) */
  overall: number;
  /** Letter grade */
  grade: Grade;
  /** Score color for UI */
  color: ScoreColor;
  /** Score breakdown by category */
  breakdown: ScoreBreakdownItem[];
  /** Base score before deductions */
  baseScore: number;
  /** Total deductions */
  totalDeductions: number;
}

export const GRADES = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F'] as const;
export type Grade = (typeof GRADES)[number];

export const SCORE_COLORS = ['green', 'yellow', 'orange', 'red'] as const;
export type ScoreColor = (typeof SCORE_COLORS)[number];

export interface ScoreBreakdownItem {
  /** Category name */
  category: string;
  /** Impact on score */
  impact: number;
  /** Is this a deduction? */
  isDeduction: boolean;
  /** Severity level */
  severity: 'critical' | 'high' | 'medium' | 'low';
  /** Description */
  description: string;
}

export interface ReadinessStatus {
  /** Is the project ready to ship? */
  ready: boolean;
  /** Status label */
  status: 'READY' | 'NOT READY' | 'BLOCKED' | 'WARNING' | 'NEEDS REVIEW';
  /** Status color */
  color: 'green' | 'yellow' | 'orange' | 'red';
  /** Blocking issues count */
  blockingIssues: number;
  /** Status message */
  message: string;
  /** Conditions that must be met */
  conditions: ReadinessCondition[];
}

export interface ReadinessCondition {
  /** Condition name */
  name: string;
  /** Is condition met? */
  met: boolean;
  /** Condition description */
  description: string;
  /** Blocker severity if not met */
  severity?: 'critical' | 'high' | 'medium' | 'low';
}

export interface KeyMetrics {
  /** Missing/hallucinated APIs */
  missingApis: MetricValue;
  /** Exposed authentication endpoints */
  exposedAuth: MetricValue;
  /** Hardcoded secrets */
  secrets: MetricValue;
  /** Dead/broken links */
  deadLinks: MetricValue;
  /** Mock/test code in production */
  mockCode: MetricValue;
  /** Ghost imports */
  ghostImports: MetricValue;
  /** Ghost environment variables */
  ghostEnvVars: MetricValue;
  /** Type mismatches */
  typeMismatches: MetricValue;
}

export interface MetricValue {
  /** Count */
  count: number;
  /** Trend vs previous scan */
  trend?: 'up' | 'down' | 'same';
  /** Percentage change */
  change?: number;
  /** Severity level */
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
}

export interface RealityCheckData {
  /** Reality check items */
  items: RealityCheckItem[];
}

export interface RealityCheckItem {
  /** What developer thinks */
  assumption: string;
  /** The actual truth */
  reality: string;
  /** Status */
  status: 'pass' | 'fail' | 'warning';
  /** Count of issues */
  count?: number;
}

export interface CategoryBreakdown {
  /** Category ID */
  id: string;
  /** Category display name */
  name: string;
  /** Category icon */
  icon: string;
  /** Score percentage (0-100) */
  score: number;
  /** Score color */
  color: 'green' | 'yellow' | 'orange' | 'red';
  /** Issues in this category */
  issueCount: number;
  /** Issues by severity */
  bySeverity: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  /** Detailed checks */
  checks?: CategoryCheck[];
}

export interface CategoryCheck {
  /** Check name */
  name: string;
  /** Check passed */
  passed: boolean;
  /** Check message */
  message: string;
}

export interface RuntimeValidation {
  /** API coverage percentage */
  apiCoverage: number;
  /** UI actions verified percentage */
  uiActionsVerified: number;
  /** Auth routes verified percentage */
  authRoutes: number;
  /** P95 latency in ms */
  p95Latency: number;
  /** Test pass rate */
  testPassRate?: number;
  /** Endpoint health */
  endpointHealth?: number;
  /** Database connectivity */
  dbConnectivity?: boolean;
  /** External service health */
  externalServices?: ServiceHealth[];
}

export interface ServiceHealth {
  /** Service name */
  name: string;
  /** Is healthy */
  healthy: boolean;
  /** Response time in ms */
  responseTime?: number;
}

export interface EnterpriseReportFinding {
  /** Unique ID */
  id: string;
  /** Finding type */
  type: string;
  /** Severity */
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  /** Category */
  category: string;
  /** Title */
  title: string;
  /** Description */
  description: string;
  /** File path */
  file: string;
  /** Line number */
  line?: number;
  /** Column number */
  column?: number;
  /** Code snippet */
  codeSnippet?: string;
  /** Highlighted lines in snippet */
  highlightLines?: number[];
  /** Suggestion for fix */
  suggestion?: string;
  /** Is auto-fixable */
  autoFixable: boolean;
  /** Fix command if auto-fixable */
  fixCommand?: string;
  /** Related documentation */
  docsUrl?: string;
  /** OWASP category if security */
  owaspCategory?: string;
  /** CWE ID if security */
  cweId?: string;
  /** Evidence */
  evidence?: FindingEvidence;
  /** Similar findings count */
  similarCount?: number;
  /** First detected date */
  firstDetected?: string;
  /** Is this a new finding vs previous scan */
  isNew?: boolean;
}

export interface FindingEvidence {
  /** Expected value */
  expected?: string;
  /** Actual value found */
  actual?: string;
  /** Context/explanation */
  context?: string;
  /** Reference locations */
  references?: string[];
}

export interface ComplianceData {
  /** Overall compliance status */
  status: 'compliant' | 'non-compliant' | 'partial';
  /** Compliance frameworks */
  frameworks: ComplianceFramework[];
}

export interface ComplianceFramework {
  /** Framework name */
  name: string;
  /** Framework version */
  version?: string;
  /** Compliance percentage */
  percentage: number;
  /** Passed controls */
  passed: number;
  /** Failed controls */
  failed: number;
  /** Total controls */
  total: number;
  /** Control details */
  controls?: ComplianceControl[];
}

export interface ComplianceControl {
  /** Control ID */
  id: string;
  /** Control name */
  name: string;
  /** Control description */
  description: string;
  /** Is control met */
  met: boolean;
  /** Severity if not met */
  severity?: 'critical' | 'high' | 'medium' | 'low';
}

export interface Recommendation {
  /** Recommendation ID */
  id: string;
  /** Priority */
  priority: 'critical' | 'high' | 'medium' | 'low';
  /** Title */
  title: string;
  /** Description */
  description: string;
  /** Category */
  category: string;
  /** Estimated effort */
  effort: 'minimal' | 'small' | 'medium' | 'large';
  /** Impact if addressed */
  impact: 'high' | 'medium' | 'low';
  /** Related finding IDs */
  relatedFindings?: string[];
  /** Action items */
  actionItems?: string[];
}

export interface TrendData {
  /** Historical scores */
  scores: TrendPoint[];
  /** Historical finding counts */
  findings: TrendPoint[];
  /** Trend direction */
  direction: 'improving' | 'declining' | 'stable';
  /** Change percentage */
  changePercent: number;
}

export interface TrendPoint {
  /** Date */
  date: string;
  /** Value */
  value: number;
  /** Label */
  label?: string;
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_ENTERPRISE_CONFIG: EnterpriseReportConfig = {
  type: 'ship-readiness',
  theme: 'dark',
  branding: {
    showPoweredBy: true,
  },
  sections: {
    header: true,
    scoreOverview: true,
    statusBadge: true,
    keyMetrics: true,
    realityTable: true,
    scoreBreakdown: true,
    categoryBreakdown: true,
    runtimeValidation: true,
    findings: true,
    trends: true,
    recommendations: true,
    compliance: true,
    footer: true,
  },
  format: 'html',
  pdfOptions: {
    format: 'A4',
    orientation: 'portrait',
    margins: { top: 20, right: 20, bottom: 20, left: 20 },
    pageNumbers: true,
    tableOfContents: false,
    headerFooter: true,
  },
};

export const DEFAULT_SECTIONS_BY_REPORT_TYPE: Record<ReportType, Partial<ReportSections>> = {
  'reality-check': {
    scoreOverview: true,
    statusBadge: true,
    keyMetrics: true,
    realityTable: true,
    scoreBreakdown: true,
    categoryBreakdown: false,
    runtimeValidation: false,
    findings: true,
    trends: false,
    recommendations: true,
    compliance: false,
  },
  'ship-readiness': {
    scoreOverview: true,
    statusBadge: true,
    keyMetrics: true,
    realityTable: false,
    scoreBreakdown: true,
    categoryBreakdown: true,
    runtimeValidation: true,
    findings: true,
    trends: true,
    recommendations: true,
    compliance: true,
  },
  'executive-summary': {
    scoreOverview: true,
    statusBadge: true,
    keyMetrics: true,
    realityTable: false,
    scoreBreakdown: true,
    categoryBreakdown: true,
    runtimeValidation: false,
    findings: false,
    trends: true,
    recommendations: true,
    compliance: true,
  },
  'detailed-technical': {
    scoreOverview: true,
    statusBadge: true,
    keyMetrics: true,
    realityTable: true,
    scoreBreakdown: true,
    categoryBreakdown: true,
    runtimeValidation: true,
    findings: true,
    trends: true,
    recommendations: true,
    compliance: true,
  },
  'compliance': {
    scoreOverview: true,
    statusBadge: true,
    keyMetrics: false,
    realityTable: false,
    scoreBreakdown: false,
    categoryBreakdown: false,
    runtimeValidation: false,
    findings: true,
    trends: false,
    recommendations: true,
    compliance: true,
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate grade from score
 */
export function getGradeFromScore(score: number): Grade {
  if (score >= 97) return 'A+';
  if (score >= 93) return 'A';
  if (score >= 90) return 'A-';
  if (score >= 87) return 'B+';
  if (score >= 83) return 'B';
  if (score >= 80) return 'B-';
  if (score >= 77) return 'C+';
  if (score >= 73) return 'C';
  if (score >= 70) return 'C-';
  if (score >= 67) return 'D+';
  if (score >= 63) return 'D';
  if (score >= 60) return 'D-';
  return 'F';
}

/**
 * Get score color based on value
 */
export function getScoreColor(score: number): ScoreColor {
  if (score >= 80) return 'green';
  if (score >= 60) return 'yellow';
  if (score >= 40) return 'orange';
  return 'red';
}

/**
 * Get readiness status from score and findings
 */
export function getReadinessStatus(
  score: number,
  criticalCount: number,
  highCount: number
): ReadinessStatus {
  if (criticalCount > 0) {
    return {
      ready: false,
      status: 'BLOCKED',
      color: 'red',
      blockingIssues: criticalCount,
      message: `Your application has ${criticalCount} critical issue${criticalCount > 1 ? 's' : ''} that must be resolved before deployment.`,
      conditions: [],
    };
  }

  if (score < 40) {
    return {
      ready: false,
      status: 'NOT READY',
      color: 'red',
      blockingIssues: highCount,
      message: 'Your application needs significant improvements before it can be deployed.',
      conditions: [],
    };
  }

  if (score < 60 || highCount > 5) {
    return {
      ready: false,
      status: 'NEEDS REVIEW',
      color: 'orange',
      blockingIssues: highCount,
      message: 'Your application requires review before deployment.',
      conditions: [],
    };
  }

  if (score < 80 || highCount > 0) {
    return {
      ready: true,
      status: 'WARNING',
      color: 'yellow',
      blockingIssues: 0,
      message: 'Your application can be deployed but has issues that should be addressed.',
      conditions: [],
    };
  }

  return {
    ready: true,
    status: 'READY',
    color: 'green',
    blockingIssues: 0,
    message: 'Your application is ready for deployment.',
    conditions: [],
  };
}

/**
 * Generate unique report ID
 */
export function generateReportId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const prefix = 'VC';
  let id = prefix + '-';
  for (let i = 0; i < 10; i++) {
    if (i === 5) id += '-';
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}
