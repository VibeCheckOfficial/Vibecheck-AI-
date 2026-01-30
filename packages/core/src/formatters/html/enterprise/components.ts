/**
 * Enterprise Report Components
 * 
 * Reusable HTML components for enterprise reports.
 */

import type {
  EnterpriseReportData,
  EnterpriseReportConfig,
  CategoryBreakdown,
  EnterpriseReportFinding,
  RealityCheckItem,
  ScoreBreakdownItem,
  Recommendation,
} from './types.js';

// ============================================================================
// Utility Functions
// ============================================================================

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function formatNumber(num: number): string {
  return num.toLocaleString();
}

export function formatDate(dateString: string, locale: string = 'en-US'): string {
  const date = new Date(dateString);
  return date.toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

// ============================================================================
// SVG Icons
// ============================================================================

export const ICONS = {
  vibecheck: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
    <path d="M12 6v6l4 2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  </svg>`,
  
  folder: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" stroke="currentColor" stroke-width="2"/>
  </svg>`,
  
  calendar: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" stroke-width="2"/>
    <path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  </svg>`,
  
  tag: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M7 7h.01M21 12l-9 9-9-9V3h9l9 9z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
  
  print: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" stroke="currentColor" stroke-width="2"/>
    <rect x="6" y="14" width="12" height="8" stroke="currentColor" stroke-width="2"/>
  </svg>`,
  
  check: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.2"/>
    <path d="M9 12l2 2 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
  
  x: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.2"/>
    <path d="M15 9l-6 6M9 9l6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  </svg>`,
  
  warning: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" stroke-width="2"/>
  </svg>`,
  
  lightbulb: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M9 21h6M12 3a6 6 0 00-3 11.2V17h6v-2.8A6 6 0 0012 3z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  </svg>`,
  
  chevronDown: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
  
  externalLink: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
  
  flame: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2c0 4-4 6-4 10a6 6 0 1012 0c0-4-4-6-4-10-2 2-4 2-4 0z" stroke="currentColor" stroke-width="2"/>
  </svg>`,
  
  shield: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" stroke-width="2"/>
  </svg>`,
  
  trendUp: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M23 6l-9.5 9.5-5-5L1 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <path d="M17 6h6v6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
  
  trendDown: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M23 18l-9.5-9.5-5 5L1 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <path d="M17 18h6v-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
};

// ============================================================================
// Header Component
// ============================================================================

export function renderHeader(
  data: EnterpriseReportData,
  config: EnterpriseReportConfig
): string {
  const title = config.title ?? getDefaultTitle(config.type);
  const logoHtml = config.branding?.logoUrl
    ? `<img src="${escapeHtml(config.branding.logoUrl)}" alt="Logo" class="header-logo-img" />`
    : `<span class="header-logo-icon">${ICONS.vibecheck}</span>`;

  return `
<header class="report-header">
  <div class="header-left">
    <div class="header-logo">
      ${logoHtml}
      <span class="header-logo-text">${escapeHtml(config.branding?.companyName ?? 'VIBECHECK')}</span>
    </div>
    <div>
      <h1 class="report-title">${escapeHtml(title)}</h1>
      <div class="report-subtitle">
        <span>${ICONS.folder} ${escapeHtml(data.project.name)}</span>
        <span>${ICONS.calendar} ${formatDate(data.meta.generatedAt, config.locale)}</span>
        <span>${ICONS.tag} ${escapeHtml(data.meta.reportId)}</span>
      </div>
    </div>
  </div>
  <div class="header-right">
    <div class="header-actions">
      <div class="theme-toggle ${config.theme}" onclick="toggleTheme()"></div>
      <button class="btn btn-ghost" onclick="window.print()">
        ${ICONS.print}
        <span>Print</span>
      </button>
    </div>
  </div>
</header>`;
}

function getDefaultTitle(type: string): string {
  switch (type) {
    case 'reality-check': return 'Reality Check';
    case 'ship-readiness': return 'Ship Readiness Report';
    case 'executive-summary': return 'Executive Summary';
    case 'detailed-technical': return 'Technical Analysis Report';
    case 'compliance': return 'Compliance Report';
    default: return 'VibeCheck Report';
  }
}

// ============================================================================
// Score Overview Component (Reality Check Style)
// ============================================================================

export function renderScoreOverviewRealityCheck(data: EnterpriseReportData): string {
  const { scores, readiness } = data;
  const progressWidth = Math.min(100, Math.max(0, scores.overall));
  
  const statusIcon = readiness.ready
    ? `<svg viewBox="0 0 24 24" fill="none" class="status-icon-svg">
         <circle cx="12" cy="12" r="10" stroke="var(--score-green)" stroke-width="2"/>
         <path d="M9 12l2 2 4-4" stroke="var(--score-green)" stroke-width="2" stroke-linecap="round"/>
       </svg>`
    : `<svg viewBox="0 0 24 24" fill="none" class="status-icon-svg">
         <circle cx="12" cy="12" r="10" stroke="var(--color-critical)" stroke-width="2"/>
         <path d="M15 9l-6 6M9 9l6 6" stroke="var(--color-critical)" stroke-width="2" stroke-linecap="round"/>
       </svg>`;

  return `
<section class="score-section">
  <div class="score-card">
    <div class="score-display">
      <div class="score-value ${scores.color}">
        ${scores.overall}<span class="score-max">/100</span>
      </div>
      <div class="score-grade ${scores.color}">Grade: ${scores.grade}</div>
      <div class="score-progress">
        <div class="score-progress-fill ${scores.color}" style="width: ${progressWidth}%"></div>
      </div>
    </div>
  </div>
  
  <div class="status-card">
    <div class="status-icon">
      ${statusIcon}
    </div>
    <div class="status-label ${readiness.color}">${readiness.status}</div>
  </div>
</section>`;
}

// ============================================================================
// Score Overview Component (Ship Readiness Style with Ring)
// ============================================================================

export function renderScoreOverviewShipReadiness(data: EnterpriseReportData): string {
  const { scores, readiness } = data;
  
  // Calculate SVG circle values
  const radius = 80;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (scores.overall / 100) * circumference;

  // Count issues by severity
  const criticalCount = data.findings.filter(f => f.severity === 'critical').length;
  const highCount = data.findings.filter(f => f.severity === 'high').length;
  const mediumCount = data.findings.filter(f => f.severity === 'medium').length;
  const lowCount = data.findings.filter(f => f.severity === 'low').length;

  return `
<section class="score-section">
  <div class="score-card">
    <div class="score-ring-container">
      <svg class="score-ring" viewBox="0 0 200 200" width="200" height="200">
        <circle class="score-ring-bg" cx="100" cy="100" r="${radius}" />
        <circle 
          class="score-ring-progress ${scores.color}" 
          cx="100" cy="100" r="${radius}"
          stroke-dasharray="${circumference}"
          stroke-dashoffset="${offset}"
        />
      </svg>
      <div class="score-ring-text">
        <div class="score-ring-value ${scores.color}">${scores.overall}</div>
        <div class="score-ring-label">Overall Score</div>
      </div>
    </div>
  </div>
  
  <div class="status-card">
    <div class="status-badge ${readiness.status.toLowerCase().replace(' ', '-')}">
      ${readiness.ready ? ICONS.check : ICONS.x}
      ${readiness.status}
    </div>
    <p class="status-message">${escapeHtml(readiness.message)}</p>
    <div class="issue-counts">
      <div class="issue-count">
        <span class="issue-count-value critical">${criticalCount}</span>
        <span class="issue-count-label">Critical</span>
      </div>
      <div class="issue-count">
        <span class="issue-count-value high">${highCount}</span>
        <span class="issue-count-label">High</span>
      </div>
      <div class="issue-count">
        <span class="issue-count-value medium">${mediumCount}</span>
        <span class="issue-count-label">Medium</span>
      </div>
      <div class="issue-count">
        <span class="issue-count-value low">${lowCount}</span>
        <span class="issue-count-label">Low</span>
      </div>
    </div>
  </div>
</section>`;
}

// ============================================================================
// Key Metrics Component
// ============================================================================

export function renderKeyMetrics(data: EnterpriseReportData): string {
  const { metrics } = data;
  
  const metricItems = [
    { value: metrics.missingApis.count, label: 'Missing APIs', severity: metrics.missingApis.severity, trend: metrics.missingApis.trend },
    { value: metrics.exposedAuth.count, label: 'Exposed Auth', severity: metrics.exposedAuth.severity, trend: metrics.exposedAuth.trend },
    { value: metrics.secrets.count, label: 'Secrets', severity: metrics.secrets.severity, trend: metrics.secrets.trend },
    { value: metrics.deadLinks.count, label: 'Dead Links', severity: metrics.deadLinks.severity, trend: metrics.deadLinks.trend },
    { value: metrics.mockCode.count, label: 'Mock Code', severity: metrics.mockCode.severity, trend: metrics.mockCode.trend },
  ];

  return `
<section class="metrics-section">
  <div class="metrics-grid">
    ${metricItems.map(item => renderMetricCard(item)).join('')}
  </div>
</section>`;
}

function renderMetricCard(item: {
  value: number;
  label: string;
  severity: string;
  trend?: 'up' | 'down' | 'same';
}): string {
  const trendHtml = item.trend
    ? `<span class="metric-trend ${item.trend}">
         ${item.trend === 'up' ? ICONS.trendUp : item.trend === 'down' ? ICONS.trendDown : '—'}
       </span>`
    : '';

  return `
<div class="metric-card">
  <div class="metric-value ${item.severity}">${formatNumber(item.value)}</div>
  <div class="metric-label">${escapeHtml(item.label)}</div>
  ${trendHtml}
</div>`;
}

// ============================================================================
// Reality Table Component
// ============================================================================

export function renderRealityTable(data: EnterpriseReportData): string {
  if (!data.realityCheck?.items || data.realityCheck.items.length === 0) {
    return '';
  }

  return `
<section class="reality-section">
  <div class="section-header">
    <div class="section-indicator"></div>
    <h2 class="section-title">The Reality</h2>
  </div>
  
  <div class="reality-table">
    <div class="reality-table-header">
      <span>What You Think</span>
      <span>The Truth</span>
      <span>Status</span>
    </div>
    ${data.realityCheck.items.map(renderRealityRow).join('')}
  </div>
</section>`;
}

function renderRealityRow(item: RealityCheckItem): string {
  const statusIcon = item.status === 'pass'
    ? `<span class="status-check">${ICONS.check}</span>`
    : item.status === 'warning'
    ? `<span class="status-warning">${ICONS.warning}</span>`
    : `<span class="status-x">${ICONS.x}</span>`;

  return `
<div class="reality-table-row">
  <span class="reality-assumption">"${escapeHtml(item.assumption)}"</span>
  <span class="reality-truth">${escapeHtml(item.reality)}</span>
  <span class="reality-status">${statusIcon}</span>
</div>`;
}

// ============================================================================
// Score Breakdown Component
// ============================================================================

export function renderScoreBreakdown(data: EnterpriseReportData): string {
  const { scores } = data;

  return `
<section class="breakdown-section">
  <div class="section-header">
    <div class="section-indicator brand"></div>
    <h2 class="section-title">Score Breakdown</h2>
  </div>
  
  <div class="breakdown-table">
    <div class="breakdown-row">
      <span class="breakdown-label">Base Score</span>
      <span class="breakdown-value positive">${scores.baseScore}</span>
    </div>
    ${scores.breakdown.map(renderBreakdownRow).join('')}
    <div class="breakdown-row total">
      <span class="breakdown-label">Final Score</span>
      <span class="breakdown-value ${scores.overall >= 60 ? 'positive' : 'negative'}">${scores.overall}</span>
    </div>
  </div>
</section>`;
}

function renderBreakdownRow(item: ScoreBreakdownItem): string {
  const valueClass = item.isDeduction ? 'negative' : 'positive';
  const valuePrefix = item.isDeduction ? '-' : '+';
  
  return `
<div class="breakdown-row">
  <span class="breakdown-label">${escapeHtml(item.category)} (${item.severity})</span>
  <span class="breakdown-value ${valueClass}">${valuePrefix}${Math.abs(item.impact)}</span>
</div>`;
}

// ============================================================================
// Category Breakdown Component
// ============================================================================

export function renderCategoryBreakdown(data: EnterpriseReportData): string {
  if (!data.categories || data.categories.length === 0) {
    return '';
  }

  return `
<section class="category-section">
  <div class="category-header">
    <div class="section-header">
      <div class="section-indicator brand"></div>
      <h2 class="section-title">Category Breakdown</h2>
    </div>
    <span class="category-count">${data.categories.length} categories</span>
  </div>
  
  <div class="category-grid">
    ${data.categories.map(renderCategoryCard).join('')}
  </div>
</section>`;
}

function renderCategoryCard(category: CategoryBreakdown): string {
  return `
<div class="category-card">
  <div class="category-card-header">
    <span class="category-name">${escapeHtml(category.name)}</span>
    <span class="category-score ${category.color}">${category.score}%</span>
  </div>
  <div class="category-progress">
    <div class="category-progress-fill ${category.color}" style="width: ${category.score}%"></div>
  </div>
</div>`;
}

// ============================================================================
// Runtime Validation Component
// ============================================================================

export function renderRuntimeValidation(data: EnterpriseReportData): string {
  const { runtimeValidation } = data;
  if (!runtimeValidation) return '';

  const getColor = (value: number): string => {
    if (value >= 90) return 'green';
    if (value >= 70) return 'yellow';
    if (value >= 50) return 'orange';
    return 'red';
  };

  const getLatencyColor = (ms: number): string => {
    if (ms <= 200) return 'green';
    if (ms <= 500) return 'yellow';
    if (ms <= 1000) return 'orange';
    return 'red';
  };

  return `
<section class="runtime-section">
  <div class="runtime-card">
    <div class="runtime-header">
      <div class="runtime-icon">${ICONS.flame}</div>
      <div>
        <div class="runtime-title">Reality Mode</div>
        <div class="runtime-subtitle">Runtime validation results from Playwright testing</div>
      </div>
    </div>
    
    <div class="runtime-grid">
      <div class="runtime-metric">
        <div class="runtime-metric-value ${getColor(runtimeValidation.apiCoverage)}">${runtimeValidation.apiCoverage}%</div>
        <div class="runtime-metric-label">API Coverage</div>
      </div>
      <div class="runtime-metric">
        <div class="runtime-metric-value ${getColor(runtimeValidation.uiActionsVerified)}">${runtimeValidation.uiActionsVerified}%</div>
        <div class="runtime-metric-label">UI Actions Verified</div>
      </div>
      <div class="runtime-metric">
        <div class="runtime-metric-value ${getColor(runtimeValidation.authRoutes)}">${runtimeValidation.authRoutes}%</div>
        <div class="runtime-metric-label">Auth Routes</div>
      </div>
      <div class="runtime-metric">
        <div class="runtime-metric-value ${getLatencyColor(runtimeValidation.p95Latency)}">${runtimeValidation.p95Latency}ms</div>
        <div class="runtime-metric-label">P95 Latency</div>
      </div>
    </div>
  </div>
</section>`;
}

// ============================================================================
// Findings Component
// ============================================================================

export function renderFindings(
  data: EnterpriseReportData,
  config: EnterpriseReportConfig
): string {
  if (!data.findings || data.findings.length === 0) {
    return `
<section class="findings-section">
  <div class="section-header">
    <div class="section-indicator brand"></div>
    <h2 class="section-title">Findings</h2>
  </div>
  <div class="empty-state">
    <p>No findings detected. Your code looks clean!</p>
  </div>
</section>`;
  }

  // Group by severity
  const grouped = {
    critical: data.findings.filter(f => f.severity === 'critical'),
    high: data.findings.filter(f => f.severity === 'high'),
    medium: data.findings.filter(f => f.severity === 'medium'),
    low: data.findings.filter(f => f.severity === 'low'),
    info: data.findings.filter(f => f.severity === 'info'),
  };

  return `
<section class="findings-section">
  <div class="findings-header">
    <div class="section-header">
      <div class="section-indicator brand"></div>
      <h2 class="section-title">Findings (${data.findings.length})</h2>
    </div>
    <div class="findings-filters">
      <button class="filter-btn active" data-filter="all">All</button>
      <button class="filter-btn" data-filter="critical">Critical (${grouped.critical.length})</button>
      <button class="filter-btn" data-filter="high">High (${grouped.high.length})</button>
      <button class="filter-btn" data-filter="medium">Medium (${grouped.medium.length})</button>
    </div>
  </div>
  
  <div class="findings-list">
    ${data.findings.map(finding => renderFindingCard(finding)).join('')}
  </div>
</section>`;
}

function renderFindingCard(finding: EnterpriseReportFinding): string {
  const location = finding.line
    ? `${finding.file}:${finding.line}`
    : finding.file;

  const codeSnippetHtml = finding.codeSnippet
    ? `<div class="code-snippet">
         <pre><code>${escapeHtml(finding.codeSnippet)}</code></pre>
       </div>`
    : '';

  const suggestionHtml = finding.suggestion
    ? `<div class="finding-suggestion">
         <div class="finding-suggestion-label">${ICONS.lightbulb} Suggestion</div>
         <p class="finding-suggestion-text">${escapeHtml(finding.suggestion)}</p>
       </div>`
    : '';

  const metaItems: string[] = [];
  if (finding.autoFixable) {
    metaItems.push(`<span class="finding-meta-item">Auto-fixable</span>`);
  }
  if (finding.owaspCategory) {
    metaItems.push(`<span class="finding-meta-item">OWASP: ${escapeHtml(finding.owaspCategory)}</span>`);
  }
  if (finding.cweId) {
    metaItems.push(`<span class="finding-meta-item">CWE: ${escapeHtml(finding.cweId)}</span>`);
  }
  if (finding.docsUrl) {
    metaItems.push(`<span class="finding-meta-item"><a href="${escapeHtml(finding.docsUrl)}" target="_blank">Documentation ${ICONS.externalLink}</a></span>`);
  }

  return `
<div class="finding-card" data-severity="${finding.severity}" data-id="${finding.id}">
  <div class="finding-card-header" onclick="toggleFinding('${finding.id}')">
    <span class="severity-badge ${finding.severity}">${finding.severity}</span>
    <span class="finding-title">${escapeHtml(finding.title)}</span>
    <span class="finding-location">${escapeHtml(location)}</span>
    <span class="finding-expand-icon">${ICONS.chevronDown}</span>
  </div>
  <div class="finding-card-body">
    <p class="finding-description">${escapeHtml(finding.description)}</p>
    ${codeSnippetHtml}
    ${suggestionHtml}
    ${metaItems.length > 0 ? `<div class="finding-meta">${metaItems.join('')}</div>` : ''}
  </div>
</div>`;
}

// ============================================================================
// Recommendations Component
// ============================================================================

export function renderRecommendations(data: EnterpriseReportData): string {
  if (!data.recommendations || data.recommendations.length === 0) {
    return '';
  }

  return `
<section class="recommendations-section">
  <div class="section-header">
    <div class="section-indicator brand"></div>
    <h2 class="section-title">Recommendations</h2>
  </div>
  
  <div class="recommendations-list">
    ${data.recommendations.map(renderRecommendationCard).join('')}
  </div>
</section>`;
}

function renderRecommendationCard(rec: Recommendation): string {
  const priorityColors: Record<string, string> = {
    critical: 'critical',
    high: 'high',
    medium: 'medium',
    low: 'low',
  };

  return `
<div class="recommendation-card">
  <div class="recommendation-header">
    <span class="severity-badge ${priorityColors[rec.priority]}">${rec.priority}</span>
    <span class="recommendation-title">${escapeHtml(rec.title)}</span>
  </div>
  <p class="recommendation-description">${escapeHtml(rec.description)}</p>
  ${rec.actionItems && rec.actionItems.length > 0 ? `
  <ul class="recommendation-actions">
    ${rec.actionItems.map(item => `<li>${escapeHtml(item)}</li>`).join('')}
  </ul>
  ` : ''}
</div>`;
}

// ============================================================================
// Footer Component
// ============================================================================

export function renderFooter(
  data: EnterpriseReportData,
  config: EnterpriseReportConfig
): string {
  const poweredBy = config.branding?.showPoweredBy !== false
    ? `<div class="footer-powered-by">
         ${ICONS.vibecheck}
         <span>Powered by VibeCheck v${data.meta.version}</span>
       </div>`
    : '';

  const footerText = config.branding?.footerText ?? 'Generated by VibeCheck';

  return `
<footer class="report-footer">
  <p>${escapeHtml(footerText)}</p>
  ${poweredBy}
</footer>`;
}

// ============================================================================
// Scripts
// ============================================================================

export function renderScripts(): string {
  return `
<script>
// Toggle finding expansion
function toggleFinding(id) {
  const card = document.querySelector('[data-id="' + id + '"]');
  if (card) {
    card.classList.toggle('expanded');
  }
}

// Auto-expand critical and high severity findings
document.addEventListener('DOMContentLoaded', function() {
  document.querySelectorAll('.finding-card[data-severity="critical"], .finding-card[data-severity="high"]').forEach(function(card) {
    card.classList.add('expanded');
  });
});

// Filter findings
document.querySelectorAll('.filter-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    const filter = this.dataset.filter;
    
    // Update active state
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    this.classList.add('active');
    
    // Filter findings
    document.querySelectorAll('.finding-card').forEach(function(card) {
      if (filter === 'all' || card.dataset.severity === filter) {
        card.style.display = 'block';
      } else {
        card.style.display = 'none';
      }
    });
  });
});

// Theme toggle
function toggleTheme() {
  const toggle = document.querySelector('.theme-toggle');
  const root = document.documentElement;
  
  if (toggle.classList.contains('light')) {
    toggle.classList.remove('light');
    // Switch to dark theme
    root.style.setProperty('--bg-primary', '#0a0a0f');
    root.style.setProperty('--bg-secondary', '#12121a');
    root.style.setProperty('--bg-card', '#1a1a24');
    root.style.setProperty('--text-primary', '#f5f5f7');
    root.style.setProperty('--text-secondary', '#a1a1aa');
    root.style.setProperty('--border-primary', '#27272a');
  } else {
    toggle.classList.add('light');
    // Switch to light theme
    root.style.setProperty('--bg-primary', '#ffffff');
    root.style.setProperty('--bg-secondary', '#f4f4f5');
    root.style.setProperty('--bg-card', '#ffffff');
    root.style.setProperty('--text-primary', '#18181b');
    root.style.setProperty('--text-secondary', '#52525b');
    root.style.setProperty('--border-primary', '#e4e4e7');
  }
}

// Animate numbers on load
function animateValue(element, start, end, duration) {
  const range = end - start;
  const startTime = performance.now();
  
  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easeOut = 1 - Math.pow(1 - progress, 3);
    const current = Math.floor(start + range * easeOut);
    element.textContent = current;
    
    if (progress < 1) {
      requestAnimationFrame(update);
    } else {
      element.textContent = end;
    }
  }
  
  requestAnimationFrame(update);
}

// Initialize animations
document.addEventListener('DOMContentLoaded', function() {
  // Animate score ring
  const scoreRing = document.querySelector('.score-ring-progress');
  if (scoreRing) {
    scoreRing.style.strokeDashoffset = scoreRing.getAttribute('stroke-dashoffset');
  }
});
</script>`;
}
