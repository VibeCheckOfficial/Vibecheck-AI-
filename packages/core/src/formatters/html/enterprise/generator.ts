/**
 * Enterprise Report Generator
 * 
 * Main generator that orchestrates components to produce enterprise-grade HTML reports.
 */

import type {
  EnterpriseReportConfig,
  EnterpriseReportData,
  ReportType,
} from './types.js';
import {
  DEFAULT_ENTERPRISE_CONFIG,
  DEFAULT_SECTIONS_BY_REPORT_TYPE,
} from './types.js';
import { getEnterpriseStyles } from './styles.js';
import {
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

// ============================================================================
// Main Generator Function
// ============================================================================

/**
 * Generate an enterprise-grade HTML report
 */
export function generateEnterpriseReport(
  data: EnterpriseReportData,
  options: Partial<EnterpriseReportConfig> = {}
): string {
  // Merge config with defaults
  const config = mergeConfig(options);
  
  // Get styles for theme
  const styles = getEnterpriseStyles(config.theme);
  
  // Apply custom branding colors if provided
  const brandingStyles = getBrandingStyles(config);
  
  // Build the report HTML
  return `<!DOCTYPE html>
<html lang="${config.locale ?? 'en'}" data-theme="${config.theme}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="generator" content="VibeCheck Enterprise Reports">
  <meta name="description" content="Security and quality analysis report">
  <title>${getReportTitle(data, config)}</title>
  
  <!-- Preload fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  
  <style>
    ${styles}
    ${brandingStyles}
  </style>
</head>
<body>
  <div class="report-container">
    ${config.sections.header ? renderHeader(data, config) : ''}
    ${renderMainContent(data, config)}
    ${config.sections.footer ? renderFooter(data, config) : ''}
  </div>
  ${renderScripts()}
</body>
</html>`;
}

// ============================================================================
// Content Rendering
// ============================================================================

function renderMainContent(
  data: EnterpriseReportData,
  config: EnterpriseReportConfig
): string {
  const sections: string[] = [];

  // Score Overview
  if (config.sections.scoreOverview) {
    sections.push(
      config.type === 'reality-check'
        ? renderScoreOverviewRealityCheck(data)
        : renderScoreOverviewShipReadiness(data)
    );
  }

  // Key Metrics
  if (config.sections.keyMetrics) {
    sections.push(renderKeyMetrics(data));
  }

  // Reality Table
  if (config.sections.realityTable) {
    sections.push(renderRealityTable(data));
  }

  // Score Breakdown
  if (config.sections.scoreBreakdown) {
    sections.push(renderScoreBreakdown(data));
  }

  // Category Breakdown
  if (config.sections.categoryBreakdown) {
    sections.push(renderCategoryBreakdown(data));
  }

  // Runtime Validation
  if (config.sections.runtimeValidation) {
    sections.push(renderRuntimeValidation(data));
  }

  // Findings
  if (config.sections.findings) {
    sections.push(renderFindings(data, config));
  }

  // Recommendations
  if (config.sections.recommendations) {
    sections.push(renderRecommendations(data));
  }

  return sections.join('\n');
}

// ============================================================================
// Configuration Helpers
// ============================================================================

function mergeConfig(options: Partial<EnterpriseReportConfig>): EnterpriseReportConfig {
  const type = options.type ?? DEFAULT_ENTERPRISE_CONFIG.type;
  const defaultSections = DEFAULT_SECTIONS_BY_REPORT_TYPE[type];
  
  return {
    ...DEFAULT_ENTERPRISE_CONFIG,
    ...options,
    sections: {
      ...DEFAULT_ENTERPRISE_CONFIG.sections,
      ...defaultSections,
      ...options.sections,
    },
    branding: {
      ...DEFAULT_ENTERPRISE_CONFIG.branding,
      ...options.branding,
    },
    pdfOptions: {
      ...DEFAULT_ENTERPRISE_CONFIG.pdfOptions,
      ...options.pdfOptions,
    },
  };
}

function getReportTitle(
  data: EnterpriseReportData,
  config: EnterpriseReportConfig
): string {
  if (config.title) {
    return config.title;
  }
  
  const typeTitle: Record<ReportType, string> = {
    'reality-check': 'Reality Check',
    'ship-readiness': 'Ship Readiness Report',
    'executive-summary': 'Executive Summary',
    'detailed-technical': 'Technical Analysis',
    'compliance': 'Compliance Report',
  };
  
  return `${typeTitle[config.type]} - ${data.project.name}`;
}

function getBrandingStyles(config: EnterpriseReportConfig): string {
  const { branding } = config;
  if (!branding) return '';
  
  const styles: string[] = [];
  
  if (branding.primaryColor) {
    styles.push(`--brand-primary: ${branding.primaryColor};`);
    styles.push(`--brand-gradient-start: ${branding.primaryColor};`);
  }
  
  if (branding.secondaryColor) {
    styles.push(`--brand-secondary: ${branding.secondaryColor};`);
    styles.push(`--brand-gradient-end: ${branding.secondaryColor};`);
  }
  
  if (styles.length === 0) return '';
  
  return `:root {\n  ${styles.join('\n  ')}\n}`;
}

// ============================================================================
// Report Type Generators
// ============================================================================

/**
 * Generate a Reality Check report (matches first screenshot)
 */
export function generateRealityCheckReport(
  data: EnterpriseReportData,
  options: Partial<Omit<EnterpriseReportConfig, 'type'>> = {}
): string {
  return generateEnterpriseReport(data, {
    ...options,
    type: 'reality-check',
  });
}

/**
 * Generate a Ship Readiness report (matches second screenshot)
 */
export function generateShipReadinessReport(
  data: EnterpriseReportData,
  options: Partial<Omit<EnterpriseReportConfig, 'type'>> = {}
): string {
  return generateEnterpriseReport(data, {
    ...options,
    type: 'ship-readiness',
  });
}

/**
 * Generate an Executive Summary report
 */
export function generateExecutiveSummaryReport(
  data: EnterpriseReportData,
  options: Partial<Omit<EnterpriseReportConfig, 'type'>> = {}
): string {
  return generateEnterpriseReport(data, {
    ...options,
    type: 'executive-summary',
  });
}

/**
 * Generate a Detailed Technical report
 */
export function generateDetailedTechnicalReport(
  data: EnterpriseReportData,
  options: Partial<Omit<EnterpriseReportConfig, 'type'>> = {}
): string {
  return generateEnterpriseReport(data, {
    ...options,
    type: 'detailed-technical',
  });
}

/**
 * Generate a Compliance report
 */
export function generateComplianceReport(
  data: EnterpriseReportData,
  options: Partial<Omit<EnterpriseReportConfig, 'type'>> = {}
): string {
  return generateEnterpriseReport(data, {
    ...options,
    type: 'compliance',
  });
}
