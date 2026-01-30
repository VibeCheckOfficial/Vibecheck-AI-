/**
 * Markdown Formatter
 * 
 * Generates Markdown output for PR comments and reports.
 */

import type { MarkdownOptions, SeverityConfig } from './types.js';
import { DEFAULT_MARKDOWN_OPTIONS, SEVERITY_CONFIG } from './types.js';

interface Finding {
  ruleId: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  file: string;
  line?: number;
  column?: number;
  suggestion?: string;
  lineContent?: string;
}

interface ScanResult {
  findings: Finding[];
  filesScanned: number;
  durationMs: number;
  projectName?: string;
  branch?: string;
  commit?: string;
}

/**
 * Convert scan results to Markdown format
 */
export function toMarkdown(
  result: ScanResult,
  options: MarkdownOptions = {}
): string {
  const opts = { ...DEFAULT_MARKDOWN_OPTIONS, ...options };
  const lines: string[] = [];

  // Title
  lines.push(`# ${opts.title}`);
  lines.push('');

  // Summary
  if (opts.includeSummary) {
    lines.push(...renderSummary(result, opts));
    lines.push('');
  }

  // Check if there are findings
  if (result.findings.length === 0) {
    lines.push(opts.useEmoji ? '✅ **No issues found!**' : '**No issues found!**');
    lines.push('');
  } else {
    // Findings by file
    if (opts.includeFiles) {
      lines.push(...renderFindings(result, opts));
    }
  }

  // Footer
  if (opts.includeFooter) {
    lines.push('---');
    lines.push(`*${opts.footerText}*`);
    
    if (opts.reportLink) {
      lines.push(`[View Full Report](${opts.reportLink})`);
    }
  }

  return lines.join('\n');
}

/**
 * Generate a compact summary for PR comments
 */
export function toCompactMarkdown(
  result: ScanResult,
  options: MarkdownOptions = {}
): string {
  const opts = { ...DEFAULT_MARKDOWN_OPTIONS, ...options, collapsible: true };
  const lines: string[] = [];

  const { errors, warnings, infos } = countBySeverity(result.findings);

  // Status badge
  if (errors > 0) {
    lines.push(opts.useEmoji ? '## 🔴 Security Issues Found' : '## Security Issues Found');
  } else if (warnings > 0) {
    lines.push(opts.useEmoji ? '## 🟡 Warnings Found' : '## Warnings Found');
  } else if (infos > 0) {
    lines.push(opts.useEmoji ? '## 🔵 Info' : '## Info');
  } else {
    lines.push(opts.useEmoji ? '## ✅ All Clear' : '## All Clear');
    lines.push('');
    lines.push('No security issues found.');
    return lines.join('\n');
  }

  lines.push('');

  // Compact summary
  const parts: string[] = [];
  if (errors > 0) parts.push(`${errors} error${errors > 1 ? 's' : ''}`);
  if (warnings > 0) parts.push(`${warnings} warning${warnings > 1 ? 's' : ''}`);
  if (infos > 0) parts.push(`${infos} info`);
  
  lines.push(`**Found:** ${parts.join(', ')}`);
  lines.push('');

  // Top findings (limited)
  const topFindings = result.findings
    .sort((a, b) => severityOrder(a.severity) - severityOrder(b.severity))
    .slice(0, 5);

  lines.push('<details>');
  lines.push('<summary>View top findings</summary>');
  lines.push('');

  for (const finding of topFindings) {
    const config = SEVERITY_CONFIG[finding.severity];
    const icon = opts.useEmoji ? config.icon : '';
    const location = finding.line ? `:${finding.line}` : '';
    
    lines.push(`- ${icon} **${finding.file}${location}**: ${finding.message}`);
  }

  if (result.findings.length > 5) {
    lines.push('');
    lines.push(`*...and ${result.findings.length - 5} more*`);
  }

  lines.push('');
  lines.push('</details>');

  return lines.join('\n');
}

function renderSummary(result: ScanResult, opts: MarkdownOptions): string[] {
  const lines: string[] = [];
  const { errors, warnings, infos } = countBySeverity(result.findings);

  lines.push('## Summary');
  lines.push('');

  // Summary table
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Files Scanned | ${result.filesScanned} |`);
  lines.push(`| Total Findings | ${result.findings.length} |`);
  lines.push(`| ${opts.useEmoji ? '🔴 ' : ''}Errors | ${errors} |`);
  lines.push(`| ${opts.useEmoji ? '🟡 ' : ''}Warnings | ${warnings} |`);
  lines.push(`| ${opts.useEmoji ? '🔵 ' : ''}Info | ${infos} |`);
  lines.push(`| Duration | ${(result.durationMs / 1000).toFixed(2)}s |`);

  if (result.branch) {
    lines.push(`| Branch | \`${result.branch}\` |`);
  }
  if (result.commit) {
    lines.push(`| Commit | \`${result.commit.substring(0, 7)}\` |`);
  }

  return lines;
}

function renderFindings(result: ScanResult, opts: MarkdownOptions): string[] {
  const lines: string[] = [];
  
  // Group by file
  const byFile = new Map<string, Finding[]>();
  for (const finding of result.findings) {
    const existing = byFile.get(finding.file) ?? [];
    existing.push(finding);
    byFile.set(finding.file, existing);
  }

  lines.push('## Findings');
  lines.push('');

  let totalShown = 0;

  for (const [file, findings] of byFile) {
    if (totalShown >= (opts.maxFindings ?? 50)) {
      lines.push(`*... ${result.findings.length - totalShown} more findings not shown*`);
      break;
    }

    // Sort by severity, then line number
    const sorted = findings
      .sort((a, b) => {
        const severityDiff = severityOrder(a.severity) - severityOrder(b.severity);
        if (severityDiff !== 0) return severityDiff;
        return (a.line ?? 0) - (b.line ?? 0);
      })
      .slice(0, opts.maxFindingsPerFile);

    const fileErrors = findings.filter(f => f.severity === 'error').length;
    const fileWarnings = findings.filter(f => f.severity === 'warning').length;
    
    let fileIcon = '';
    if (opts.useEmoji) {
      if (fileErrors > 0) fileIcon = '🔴 ';
      else if (fileWarnings > 0) fileIcon = '🟡 ';
      else fileIcon = '🔵 ';
    }

    if (opts.collapsible) {
      lines.push('<details>');
      lines.push(`<summary>${fileIcon}<strong>${file}</strong> (${findings.length} issue${findings.length > 1 ? 's' : ''})</summary>`);
      lines.push('');
    } else {
      lines.push(`### ${fileIcon}${file}`);
      lines.push('');
    }

    for (const finding of sorted) {
      totalShown++;
      lines.push(...renderFinding(finding, opts));
    }

    if (findings.length > (opts.maxFindingsPerFile ?? 10)) {
      lines.push(`*... ${findings.length - sorted.length} more findings in this file*`);
      lines.push('');
    }

    if (opts.collapsible) {
      lines.push('</details>');
      lines.push('');
    }
  }

  return lines;
}

function renderFinding(finding: Finding, opts: MarkdownOptions): string[] {
  const lines: string[] = [];
  const config = SEVERITY_CONFIG[finding.severity];
  const icon = opts.useEmoji ? config.icon + ' ' : '';
  const location = finding.line 
    ? `Line ${finding.line}${finding.column ? `:${finding.column}` : ''}`
    : '';

  lines.push(`#### ${icon}${finding.ruleId}`);
  lines.push('');

  if (location) {
    lines.push(`**Location:** ${location}`);
    lines.push('');
  }

  lines.push(finding.message);
  lines.push('');

  if (finding.lineContent) {
    lines.push('```');
    lines.push(finding.lineContent);
    lines.push('```');
    lines.push('');
  }

  if (opts.includeSuggestions && finding.suggestion) {
    lines.push(`> ${opts.useEmoji ? '💡 ' : ''}**Suggestion:** ${finding.suggestion}`);
    lines.push('');
  }

  return lines;
}

function countBySeverity(findings: Finding[]): {
  errors: number;
  warnings: number;
  infos: number;
} {
  let errors = 0;
  let warnings = 0;
  let infos = 0;

  for (const finding of findings) {
    switch (finding.severity) {
      case 'error':
        errors++;
        break;
      case 'warning':
        warnings++;
        break;
      case 'info':
        infos++;
        break;
    }
  }

  return { errors, warnings, infos };
}

function severityOrder(severity: string): number {
  switch (severity) {
    case 'error':
      return 0;
    case 'warning':
      return 1;
    case 'info':
      return 2;
    default:
      return 3;
  }
}
