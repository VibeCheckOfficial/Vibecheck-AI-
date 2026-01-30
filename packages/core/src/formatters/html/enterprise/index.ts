/**
 * Enterprise Report Module
 * 
 * Comprehensive HTML/PDF report generation with enterprise-grade features.
 * 
 * @example
 * ```typescript
 * import { 
 *   generateEnterpriseReport,
 *   generateShipReadinessReport,
 *   generateRealityCheckReport,
 *   generatePdfReport,
 *   transformToEnterpriseData 
 * } from '@vibecheck/core/formatters';
 * 
 * // Transform scan results to report data
 * const reportData = transformToEnterpriseData({
 *   projectName: 'my-project',
 *   projectPath: '/path/to/project',
 *   summary: scanSummary,
 *   findings: scanFindings,
 * });
 * 
 * // Generate HTML report
 * const html = generateShipReadinessReport(reportData, {
 *   theme: 'dark',
 *   branding: {
 *     companyName: 'Acme Corp',
 *     primaryColor: '#8b5cf6',
 *   },
 * });
 * 
 * // Generate PDF
 * const pdf = await generatePdfReport(reportData, { type: 'ship-readiness' }, {
 *   outputPath: './report.pdf',
 * });
 * ```
 */

// Types
export type {
  // Report Configuration
  EnterpriseReportConfig,
  ReportType,
  BrandingConfig,
  ReportSections,
  PdfOptions,
  ComparisonConfig,
  HistoricalDataPoint,
  
  // Report Data
  EnterpriseReportData,
  ReportMeta,
  ProjectInfo,
  ScoreData,
  Grade,
  ScoreColor,
  ScoreBreakdownItem,
  ReadinessStatus,
  ReadinessCondition,
  KeyMetrics,
  MetricValue,
  RealityCheckData,
  RealityCheckItem,
  CategoryBreakdown,
  CategoryCheck,
  RuntimeValidation,
  ServiceHealth,
  EnterpriseReportFinding,
  FindingEvidence,
  ComplianceData,
  ComplianceFramework,
  ComplianceControl,
  Recommendation,
  TrendData,
  TrendPoint,
} from './types.js';

// Constants
export {
  REPORT_TYPES,
  GRADES,
  SCORE_COLORS,
  DEFAULT_ENTERPRISE_CONFIG,
  DEFAULT_SECTIONS_BY_REPORT_TYPE,
} from './types.js';

// Helper Functions
export {
  getGradeFromScore,
  getScoreColor,
  getReadinessStatus,
  generateReportId,
} from './types.js';

// HTML Generators
export {
  generateEnterpriseReport,
  generateRealityCheckReport,
  generateShipReadinessReport,
  generateExecutiveSummaryReport,
  generateDetailedTechnicalReport,
  generateComplianceReport,
} from './generator.js';

// PDF Generators
export type {
  PdfGeneratorOptions,
  PdfResult,
} from './pdf-generator.js';

export {
  generatePdfReport,
  htmlToPdf,
  generateRealityCheckPdf,
  generateShipReadinessPdf,
  generatePdfBuffer,
} from './pdf-generator.js';

// Data Transformation
export type {
  ScanResultInput,
  TransformOptions,
} from './data-transformer.js';

export {
  transformToEnterpriseData,
} from './data-transformer.js';

// Styles (for customization)
export {
  getEnterpriseStyles,
  DARK_THEME_VARS,
  LIGHT_THEME_VARS,
} from './styles.js';

// Components (for advanced customization)
export {
  escapeHtml,
  formatNumber,
  formatDate,
  formatDuration,
  ICONS,
  renderHeader,
  renderScoreOverviewRealityCheck,
  renderScoreOverviewShipReadiness,
  renderKeyMetrics,
  renderRealityTable,
  renderScoreBreakdown,
  renderCategoryBreakdown,
  renderRuntimeValidation,
  renderFindings,
  renderRecommendations,
  renderFooter,
  renderScripts,
} from './components.js';
