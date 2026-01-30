// src/scanner/engines/mock-detector/reporter.ts

import type { ScanResult, Finding, Severity } from './types';

export type OutputFormat = 'text' | 'json' | 'sarif' | 'markdown';

export function formatReport(result: ScanResult, format: OutputFormat): string {
  switch (format) {
    case 'json':
      return JSON.stringify(result, null, 2);
    case 'sarif':
      return formatSarif(result);
    case 'markdown':
      return formatMarkdown(result);
    default:
      return formatText(result);
  }
}

function formatText(result: ScanResult): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('╔══════════════════════════════════════════════════════════════╗');
  lines.push('║           VIBECHECK MOCK/FAKE DATA SCAN RESULTS              ║');
  lines.push('╚══════════════════════════════════════════════════════════════╝');
  lines.push('');

  lines.push(`📊 Summary`);
  lines.push(`   Files scanned: ${result.scannedFiles}`);
  lines.push(`   Total findings: ${result.summary.total}`);
  lines.push(`   Duration: ${result.duration}ms`);
  lines.push('');

  lines.push(`🎯 By Severity`);
  lines.push(`   🔴 Critical: ${result.summary.bySeverity.critical}`);
  lines.push(`   🟠 High: ${result.summary.bySeverity.high}`);
  lines.push(`   🟡 Medium: ${result.summary.bySeverity.medium}`);
  lines.push(`   🟢 Low: ${result.summary.bySeverity.low}`);
  lines.push('');

  if (result.findings.length > 0) {
    lines.push('─'.repeat(64));
    lines.push('FINDINGS');
    lines.push('─'.repeat(64));

    for (const finding of result.findings) {
      const icon = getSeverityIcon(finding.severity);
      lines.push('');
      lines.push(`${icon} [${finding.severity.toUpperCase()}] ${finding.description}`);
      lines.push(`   📁 ${finding.file}:${finding.line}:${finding.column}`);
      lines.push(`   📝 ${finding.code}`);
      if (finding.fix) {
        lines.push(`   💡 Fix: ${finding.fix}`);
      }
      lines.push(`   🎯 Confidence: ${finding.confidence}`);
    }
  }

  lines.push('');
  lines.push('─'.repeat(64));

  if (result.summary.bySeverity.critical > 0) {
    lines.push('❌ CRITICAL issues found - blocking deployment');
  } else if (result.summary.bySeverity.high > 0) {
    lines.push('⚠️  HIGH severity issues found - review before deployment');
  } else {
    lines.push('✅ No blocking issues found');
  }

  return lines.join('\n');
}

function formatMarkdown(result: ScanResult): string {
  const lines: string[] = [];

  lines.push('# VibeCheck Mock/Fake Data Scan Results\n');

  lines.push('## Summary\n');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Files scanned | ${result.scannedFiles} |`);
  lines.push(`| Total findings | ${result.summary.total} |`);
  lines.push(`| Duration | ${result.duration}ms |`);
  lines.push('');

  lines.push('## By Severity\n');
  lines.push('| Severity | Count |');
  lines.push('|----------|-------|');
  lines.push(`| 🔴 Critical | ${result.summary.bySeverity.critical} |`);
  lines.push(`| 🟠 High | ${result.summary.bySeverity.high} |`);
  lines.push(`| 🟡 Medium | ${result.summary.bySeverity.medium} |`);
  lines.push(`| 🟢 Low | ${result.summary.bySeverity.low} |`);
  lines.push('');

  if (result.findings.length > 0) {
    lines.push('## Findings\n');

    for (const finding of result.findings) {
      lines.push(`### ${getSeverityIcon(finding.severity)} ${finding.description}\n`);
      lines.push(`- **File:** \`${finding.file}:${finding.line}\``);
      lines.push(`- **Severity:** ${finding.severity}`);
      lines.push(`- **Category:** ${finding.category}`);
      lines.push(`- **Confidence:** ${finding.confidence}`);
      lines.push('');
      lines.push('```');
      lines.push(finding.code);
      lines.push('```');
      if (finding.fix) {
        lines.push(`\n**Fix:** ${finding.fix}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

function formatSarif(result: ScanResult): string {
  const sarif = {
    $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'VibeCheck Mock Detector',
            version: '1.0.0',
            informationUri: 'https://vibecheck.dev',
            rules: [...new Set(result.findings.map((f) => f.id))].map((id) => {
              const finding = result.findings.find((f) => f.id === id);
              return {
                id,
                shortDescription: { text: finding?.description || id },
                defaultConfiguration: {
                  level: mapSeverityToSarif(finding?.severity || 'medium'),
                },
              };
            }),
          },
        },
        results: result.findings.map((f) => ({
          ruleId: f.id,
          level: mapSeverityToSarif(f.severity),
          message: { text: f.description },
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: f.file },
                region: {
                  startLine: f.line,
                  startColumn: f.column,
                  endLine: f.endLine || f.line,
                },
              },
            },
          ],
        })),
      },
    ],
  };

  return JSON.stringify(sarif, null, 2);
}

function getSeverityIcon(severity: string): string {
  const icons: Record<string, string> = {
    critical: '🔴',
    high: '🟠',
    medium: '🟡',
    low: '🟢',
  };
  return icons[severity] || '⚪';
}

function mapSeverityToSarif(severity: string): string {
  const map: Record<string, string> = {
    critical: 'error',
    high: 'error',
    medium: 'warning',
    low: 'note',
  };
  return map[severity] || 'note';
}

export { getSeverityIcon, mapSeverityToSarif };
