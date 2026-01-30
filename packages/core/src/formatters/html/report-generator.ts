/**
 * HTML Report Generator
 * 
 * Generates self-contained HTML reports from scan results.
 */

import type {
  HtmlReportOptions,
  ReportData,
  ReportFinding,
  ScanSummary,
} from './types.js';
import { DEFAULT_REPORT_OPTIONS, SEVERITY_COLORS, SEVERITY_ICONS } from './types.js';
import { getStyles } from './styles.js';

// ============================================================================
// Main Generator
// ============================================================================

/**
 * Generate an HTML report from scan data
 */
export function generateHtmlReport(
  data: ReportData,
  options: HtmlReportOptions = {}
): string {
  const opts = { ...DEFAULT_REPORT_OPTIONS, ...options };
  const styles = getStyles(opts.theme);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(opts.title)}</title>
  <style>${styles}${opts.customCss}</style>
</head>
<body>
  <div class="container">
    ${renderHeader(data, opts)}
    ${opts.includeSummary ? renderSummary(data.summary) : ''}
    ${opts.includeCharts ? renderCharts(data.summary) : ''}
    ${renderFindings(data.findings, opts)}
    ${renderFooter(opts)}
  </div>
  ${renderScripts()}
</body>
</html>`;
}

// ============================================================================
// Header
// ============================================================================

function renderHeader(data: ReportData, opts: Required<HtmlReportOptions>): string {
  const timestamp = new Date(data.generatedAt).toLocaleString();
  
  return `
<header class="header">
  <h1>${escapeHtml(opts.title)}</h1>
  <p class="subtitle">${escapeHtml(opts.projectName)}${data.project.branch ? ` (${data.project.branch})` : ''}</p>
  <p class="timestamp">Generated on ${timestamp}</p>
</header>`;
}

// ============================================================================
// Summary Section
// ============================================================================

function renderSummary(summary: ScanSummary): string {
  const { bySeverity, totalFindings, filesScanned, durationMs, securityScore } = summary;
  
  return `
<section class="summary-section">
  ${renderScoreRing(securityScore)}
  <div class="stats-grid">
    <div class="stat-card total">
      <div class="stat-value">${totalFindings}</div>
      <div class="stat-label">Total Findings</div>
    </div>
    <div class="stat-card critical">
      <div class="stat-value">${bySeverity.critical}</div>
      <div class="stat-label">Critical</div>
    </div>
    <div class="stat-card high">
      <div class="stat-value">${bySeverity.high}</div>
      <div class="stat-label">High</div>
    </div>
    <div class="stat-card medium">
      <div class="stat-value">${bySeverity.medium}</div>
      <div class="stat-label">Medium</div>
    </div>
    <div class="stat-card low">
      <div class="stat-value">${bySeverity.low}</div>
      <div class="stat-label">Low</div>
    </div>
    <div class="stat-card info">
      <div class="stat-value">${filesScanned}</div>
      <div class="stat-label">Files Scanned</div>
    </div>
  </div>
</section>`;
}

function renderScoreRing(score: number): string {
  const circumference = 2 * Math.PI * 90; // r = 90
  const offset = circumference - (score / 100) * circumference;
  
  return `
<div class="score-container">
  <div class="score-ring">
    <svg viewBox="0 0 200 200">
      <circle class="ring-bg" cx="100" cy="100" r="90" />
      <circle class="ring-progress" cx="100" cy="100" r="90"
        stroke-dasharray="${circumference}"
        stroke-dashoffset="${offset}" />
    </svg>
    <div class="score-text">
      <div class="score-value">${score}</div>
      <div class="score-label">Security Score</div>
    </div>
  </div>
</div>`;
}

// ============================================================================
// Charts Section
// ============================================================================

function renderCharts(summary: ScanSummary): string {
  const { bySeverity, byType } = summary;
  const total = Object.values(bySeverity).reduce((a, b) => a + b, 0) || 1;
  
  return `
<section class="charts-section">
  <div class="chart-container">
    <h3>Findings by Severity</h3>
    <div class="bar-chart">
      ${renderBarItem('Critical', bySeverity.critical, total, SEVERITY_COLORS.critical)}
      ${renderBarItem('High', bySeverity.high, total, SEVERITY_COLORS.high)}
      ${renderBarItem('Medium', bySeverity.medium, total, SEVERITY_COLORS.medium)}
      ${renderBarItem('Low', bySeverity.low, total, SEVERITY_COLORS.low)}
      ${renderBarItem('Info', bySeverity.info, total, SEVERITY_COLORS.info)}
    </div>
  </div>
  ${Object.keys(byType).length > 0 ? renderTypeChart(byType) : ''}
</section>`;
}

function renderBarItem(label: string, value: number, total: number, color: string): string {
  const percentage = Math.round((value / total) * 100);
  
  return `
<div class="bar-item">
  <span class="bar-label">${label}</span>
  <div class="bar-track">
    <div class="bar-fill" style="width: ${percentage}%; background-color: ${color}"></div>
  </div>
  <span class="bar-value">${value}</span>
</div>`;
}

function renderTypeChart(byType: Record<string, number>): string {
  const total = Object.values(byType).reduce((a, b) => a + b, 0) || 1;
  const entries = Object.entries(byType).sort((a, b) => b[1] - a[1]).slice(0, 10);
  
  return `
<div class="chart-container">
  <h3>Findings by Type</h3>
  <div class="bar-chart">
    ${entries.map(([type, count]) => 
      renderBarItem(type, count, total, 'var(--accent-primary)')
    ).join('')}
  </div>
</div>`;
}

// ============================================================================
// Findings Section
// ============================================================================

function renderFindings(
  findings: ReportFinding[],
  opts: Required<HtmlReportOptions>
): string {
  if (findings.length === 0) {
    return `
<section class="findings-section">
  <h2>Findings</h2>
  <p style="text-align: center; color: var(--text-secondary); padding: 2rem;">
    No findings detected. Your code looks clean!
  </p>
</section>`;
  }

  const grouped = groupFindings(findings, opts.groupBy);
  
  return `
<section class="findings-section">
  <h2>Findings (${findings.length})</h2>
  ${Array.from(grouped.entries()).map(([group, items]) => 
    renderFindingGroup(group, items, opts)
  ).join('')}
</section>`;
}

function groupFindings(
  findings: ReportFinding[],
  groupBy: 'file' | 'severity' | 'type' | 'none'
): Map<string, ReportFinding[]> {
  const groups = new Map<string, ReportFinding[]>();

  if (groupBy === 'none') {
    groups.set('All Findings', findings);
    return groups;
  }

  for (const finding of findings) {
    let key: string;
    
    switch (groupBy) {
      case 'file':
        key = finding.file;
        break;
      case 'severity':
        key = finding.severity.charAt(0).toUpperCase() + finding.severity.slice(1);
        break;
      case 'type':
        key = finding.type;
        break;
      default:
        key = 'Other';
    }

    const existing = groups.get(key) ?? [];
    existing.push(finding);
    groups.set(key, existing);
  }

  // Sort groups
  if (groupBy === 'severity') {
    const order = ['Critical', 'High', 'Medium', 'Low', 'Info'];
    return new Map(
      Array.from(groups.entries()).sort(
        (a, b) => order.indexOf(a[0]) - order.indexOf(b[0])
      )
    );
  }

  return groups;
}

function renderFindingGroup(
  groupName: string,
  findings: ReportFinding[],
  opts: Required<HtmlReportOptions>
): string {
  const icon = SEVERITY_ICONS[groupName.toLowerCase() as keyof typeof SEVERITY_ICONS] ?? '📋';
  
  return `
<div class="finding-group">
  <h3>${icon} ${escapeHtml(groupName)} (${findings.length})</h3>
  ${findings.map(f => renderFindingCard(f, opts)).join('')}
</div>`;
}

function renderFindingCard(
  finding: ReportFinding,
  opts: Required<HtmlReportOptions>
): string {
  const location = finding.line ? `${finding.file}:${finding.line}` : finding.file;
  
  return `
<div class="finding-card" data-id="${finding.id}">
  <div class="finding-header" onclick="toggleFinding('${finding.id}')">
    <span class="severity-badge ${finding.severity}">${finding.severity}</span>
    <span class="finding-title">${escapeHtml(finding.title)}</span>
    <span class="finding-location">${escapeHtml(location)}</span>
  </div>
  <div class="finding-body">
    ${finding.description ? `<p class="finding-description">${escapeHtml(finding.description)}</p>` : ''}
    ${opts.includeCodeSnippets && finding.codeSnippet ? renderCodeSnippet(finding.codeSnippet) : ''}
    ${opts.includeRecommendations && finding.suggestion ? renderSuggestion(finding.suggestion) : ''}
  </div>
</div>`;
}

function renderCodeSnippet(code: string): string {
  return `
<div class="code-snippet">
  <code>${escapeHtml(code)}</code>
</div>`;
}

function renderSuggestion(suggestion: string): string {
  return `
<div class="suggestion">
  <div class="suggestion-label">💡 Suggestion</div>
  <p>${escapeHtml(suggestion)}</p>
</div>`;
}

// ============================================================================
// Footer
// ============================================================================

function renderFooter(opts: Required<HtmlReportOptions>): string {
  return `
<footer class="footer">
  <p>${escapeHtml(opts.footerText)}</p>
</footer>`;
}

// ============================================================================
// Scripts
// ============================================================================

function renderScripts(): string {
  return `
<script>
function toggleFinding(id) {
  const card = document.querySelector('[data-id="' + id + '"]');
  if (card) {
    card.classList.toggle('expanded');
  }
}

// Expand all findings with critical/high severity by default
document.addEventListener('DOMContentLoaded', function() {
  document.querySelectorAll('.severity-badge.critical, .severity-badge.high').forEach(function(badge) {
    const card = badge.closest('.finding-card');
    if (card) card.classList.add('expanded');
  });
});
</script>`;
}

// ============================================================================
// Helpers
// ============================================================================

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ============================================================================
// Score Calculation
// ============================================================================

/**
 * Calculate security score from findings
 */
export function calculateSecurityScore(findings: ReportFinding[]): number {
  if (findings.length === 0) {
    return 100;
  }

  const weights = {
    critical: 25,
    high: 15,
    medium: 5,
    low: 2,
    info: 0,
  };

  let deductions = 0;
  for (const finding of findings) {
    deductions += weights[finding.severity] ?? 0;
  }

  return Math.max(0, 100 - deductions);
}

/**
 * Get verdict from score
 */
export function getVerdictFromScore(score: number): 'pass' | 'warn' | 'fail' {
  if (score >= 80) return 'pass';
  if (score >= 50) return 'warn';
  return 'fail';
}
