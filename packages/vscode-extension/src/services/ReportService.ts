import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Issue } from '../providers/DiagnosticsProvider';

export type ReportFormat = 'html' | 'markdown' | 'json' | 'sarif' | 'pdf';

export interface ReportOptions {
  includeRecommendations: boolean;
  includeCodeSnippets: boolean;
  includeSummary: boolean;
  includeCharts: boolean;
  groupBy: 'file' | 'severity' | 'engine' | 'none';
  title?: string;
  author?: string;
  projectName?: string;
}

export interface ReportMetadata {
  generatedAt: string;
  scannedAt: string;
  version: string;
  workspaceName: string;
  totalFiles: number;
  totalLines: number;
  scanDuration: number;
}

export interface ScanResult {
  timestamp: string;
  filesScanned: number;
  linesScanned?: number;
  duration: number;
  issues: Issue[];
  enginesUsed?: string[];
}

export class ReportService {
  constructor() { }

  public calculateSecurityScore(issues: Issue[]): number {
    if (issues.length === 0) return 100;

    const errorWeight = 10;
    const warningWeight = 3;
    const infoWeight = 1;

    const errorCount = issues.filter(i => i.severity === 'error').length;
    const warningCount = issues.filter(i => i.severity === 'warning').length;
    const infoCount = issues.filter(i => i.severity === 'info' || i.severity === 'hint').length;

    const penalty = (errorCount * errorWeight) + (warningCount * warningWeight) + (infoCount * infoWeight);
    const maxPenalty = 100;

    return Math.max(0, Math.round(100 - (penalty / maxPenalty * 100)));
  }

  async generateReport(
    issues: Issue[],
    format: ReportFormat,
    options: ReportOptions
  ): Promise<string> {
    const scanResult = this.buildScanResult(issues);
    const metadata = this.buildMetadata(scanResult);

    switch (format) {
      case 'html':
        return this.generateHtmlReport(scanResult, options, metadata);
      case 'markdown':
        return this.generateMarkdownReport(scanResult, options, metadata);
      case 'json':
        return this.generateJsonReport(scanResult, options, metadata);
      case 'sarif':
        return this.generateSarifReport(scanResult, options, metadata);
      case 'pdf':
        return this.generatePdfReport(scanResult, options, metadata);
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  async exportReport(
    issues: Issue[],
    format: ReportFormat,
    options: ReportOptions
  ): Promise<vscode.Uri | undefined> {
    const content = await this.generateReport(issues, format, options);

    const defaultName = `vibecheck-report-${Date.now()}`;
    const extensions: Record<ReportFormat, string> = {
      html: 'html',
      markdown: 'md',
      json: 'json',
      sarif: 'sarif.json',
      pdf: 'html' // HTML for now, PDF generation requires external tool
    };

    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(
        path.join(
          vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '',
          `${defaultName}.${extensions[format]}`
        )
      ),
      filters: {
        'Report Files': [extensions[format]]
      }
    });

    if (uri) {
      await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf-8'));
      void vscode.window.showInformationMessage(`Report exported to ${uri.fsPath}`);
      return uri;
    }

    return undefined;
  }

  private buildScanResult(issues: Issue[]): ScanResult {
    const uniqueFiles = new Set(issues.map(i => i.file));
    const engines = new Set(issues.map(i => i.engine));

    return {
      timestamp: new Date().toISOString(),
      filesScanned: uniqueFiles.size,
      linesScanned: 0,
      duration: 0,
      issues,
      enginesUsed: Array.from(engines)
    };
  }

  private buildMetadata(scanResult: ScanResult): ReportMetadata {
    const workspaceName = vscode.workspace.workspaceFolders?.[0]?.name || 'Unknown';

    return {
      generatedAt: new Date().toISOString(),
      scannedAt: scanResult.timestamp,
      version: '1.0.0',
      workspaceName,
      totalFiles: scanResult.filesScanned,
      totalLines: scanResult.linesScanned || 0,
      scanDuration: scanResult.duration
    };
  }

  private generateHtmlReport(
    scanResult: ScanResult,
    options: ReportOptions,
    metadata: ReportMetadata
  ): string {
    const issues = scanResult.issues;
    const errorCount = issues.filter(i => i.severity === 'error').length;
    const warningCount = issues.filter(i => i.severity === 'warning').length;
    const infoCount = issues.filter(i => i.severity === 'info').length;

    const groupedIssues = this.groupIssues(issues, options.groupBy);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${options.title || 'VibeCheck Security Report'}</title>
  <style>
    :root {
      --bg-primary: #0a0a0f;
      --bg-secondary: #12121a;
      --bg-tertiary: #1a1a24;
      --text-primary: #ffffff;
      --text-secondary: #a0a0b0;
      --text-muted: #606070;
      --accent-purple: #8b5cf6;
      --accent-blue: #3b82f6;
      --error: #ef4444;
      --warning: #f59e0b;
      --info: #3b82f6;
      --success: #10b981;
      --border: rgba(255, 255, 255, 0.1);
      --gradient: linear-gradient(135deg, #8b5cf6, #3b82f6);
    }
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      line-height: 1.6;
      min-height: 100vh;
    }
    
    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 40px 20px;
    }
    
    /* Header */
    .header {
      text-align: center;
      margin-bottom: 60px;
      position: relative;
    }
    
    .header::before {
      content: '';
      position: absolute;
      top: -100px;
      left: 50%;
      transform: translateX(-50%);
      width: 600px;
      height: 600px;
      background: radial-gradient(circle, rgba(139, 92, 246, 0.15) 0%, transparent 70%);
      pointer-events: none;
    }
    
    .logo {
      display: inline-flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 20px;
    }
    
    .logo-icon {
      width: 48px;
      height: 48px;
      background: var(--gradient);
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
    }
    
    .logo-text {
      font-size: 32px;
      font-weight: 700;
      background: var(--gradient);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    
    .report-title {
      font-size: 24px;
      color: var(--text-secondary);
      font-weight: 400;
      margin-bottom: 8px;
    }
    
    .report-meta {
      color: var(--text-muted);
      font-size: 14px;
    }
    
    /* Stats Grid */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin-bottom: 40px;
    }
    
    .stat-card {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 24px;
      text-align: center;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    
    .stat-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
    }
    
    .stat-value {
      font-size: 48px;
      font-weight: 700;
      margin-bottom: 4px;
    }
    
    .stat-value.error { color: var(--error); }
    .stat-value.warning { color: var(--warning); }
    .stat-value.info { color: var(--info); }
    .stat-value.success { color: var(--success); }
    .stat-value.neutral { color: var(--text-primary); }
    
    .stat-label {
      color: var(--text-secondary);
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    
    /* Score Ring */
    .score-section {
      display: flex;
      justify-content: center;
      margin-bottom: 60px;
    }
    
    .score-ring {
      position: relative;
      width: 200px;
      height: 200px;
    }
    
    .score-ring svg {
      transform: rotate(-90deg);
    }
    
    .score-ring circle {
      fill: none;
      stroke-width: 12;
    }
    
    .score-ring .bg {
      stroke: var(--bg-tertiary);
    }
    
    .score-ring .progress {
      stroke: url(#scoreGradient);
      stroke-linecap: round;
      transition: stroke-dashoffset 1s ease;
    }
    
    .score-value {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      text-align: center;
    }
    
    .score-number {
      font-size: 56px;
      font-weight: 700;
      background: var(--gradient);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    
    .score-label {
      color: var(--text-secondary);
      font-size: 14px;
    }
    
    /* Charts */
    .charts-section {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 24px;
      margin-bottom: 40px;
    }
    
    .chart-card {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 24px;
    }
    
    .chart-title {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 20px;
      color: var(--text-primary);
    }
    
    .bar-chart {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    
    .bar-row {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    
    .bar-label {
      width: 120px;
      font-size: 13px;
      color: var(--text-secondary);
    }
    
    .bar-track {
      flex: 1;
      height: 8px;
      background: var(--bg-tertiary);
      border-radius: 4px;
      overflow: hidden;
    }
    
    .bar-fill {
      height: 100%;
      border-radius: 4px;
      transition: width 0.5s ease;
    }
    
    .bar-fill.error { background: var(--error); }
    .bar-fill.warning { background: var(--warning); }
    .bar-fill.info { background: var(--info); }
    .bar-fill.purple { background: var(--accent-purple); }
    
    .bar-count {
      width: 40px;
      text-align: right;
      font-size: 13px;
      font-weight: 600;
    }
    
    /* Issues Section */
    .section {
      margin-bottom: 40px;
    }
    
    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 20px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--border);
    }
    
    .section-title {
      font-size: 20px;
      font-weight: 600;
    }
    
    .section-count {
      background: var(--bg-tertiary);
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 13px;
      color: var(--text-secondary);
    }
    
    .issue-group {
      margin-bottom: 32px;
    }
    
    .group-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
      padding: 12px 16px;
      background: var(--bg-tertiary);
      border-radius: 8px;
    }
    
    .group-icon {
      font-size: 16px;
    }
    
    .group-name {
      font-weight: 600;
      flex: 1;
    }
    
    .group-count {
      font-size: 13px;
      color: var(--text-secondary);
    }
    
    .issue-card {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 12px;
      margin-bottom: 12px;
      overflow: hidden;
      transition: border-color 0.2s;
    }
    
    .issue-card:hover {
      border-color: var(--accent-purple);
    }
    
    .issue-header {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 16px;
    }
    
    .severity-badge {
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .severity-badge.error {
      background: rgba(239, 68, 68, 0.15);
      color: var(--error);
    }
    
    .severity-badge.warning {
      background: rgba(245, 158, 11, 0.15);
      color: var(--warning);
    }
    
    .severity-badge.info {
      background: rgba(59, 130, 246, 0.15);
      color: var(--info);
    }
    
    .issue-content {
      flex: 1;
    }
    
    .issue-message {
      font-weight: 500;
      margin-bottom: 8px;
    }
    
    .issue-location {
      font-size: 13px;
      color: var(--text-secondary);
      font-family: 'SF Mono', Monaco, monospace;
    }
    
    .issue-meta {
      display: flex;
      gap: 16px;
      margin-top: 8px;
    }
    
    .meta-item {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 12px;
      color: var(--text-muted);
    }
    
    .code-snippet {
      background: var(--bg-primary);
      border-top: 1px solid var(--border);
      padding: 16px;
      font-family: 'SF Mono', Monaco, monospace;
      font-size: 13px;
      overflow-x: auto;
    }
    
    .code-line {
      display: flex;
      line-height: 1.8;
    }
    
    .line-number {
      color: var(--text-muted);
      width: 40px;
      text-align: right;
      margin-right: 16px;
      user-select: none;
    }
    
    .line-content {
      flex: 1;
      white-space: pre;
    }
    
    .line-content.highlighted {
      background: rgba(239, 68, 68, 0.1);
      border-left: 3px solid var(--error);
      margin-left: -8px;
      padding-left: 5px;
    }
    
    .recommendation {
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.2);
      border-radius: 8px;
      padding: 12px 16px;
      margin: 12px 16px 16px;
      font-size: 13px;
      color: var(--success);
    }
    
    .recommendation-label {
      font-weight: 600;
      margin-bottom: 4px;
    }
    
    /* Footer */
    .footer {
      text-align: center;
      padding-top: 40px;
      border-top: 1px solid var(--border);
      color: var(--text-muted);
      font-size: 13px;
    }
    
    .footer a {
      color: var(--accent-purple);
      text-decoration: none;
    }
    
    /* Print Styles */
    @media print {
      body {
        background: white;
        color: black;
      }
      
      .stat-card, .chart-card, .issue-card {
        break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <header class="header">
      <div class="logo">
        <div class="logo-icon">✓</div>
        <span class="logo-text">VibeCheck</span>
      </div>
      <h1 class="report-title">${options.title || 'Security Analysis Report'}</h1>
      <p class="report-meta">
        ${metadata.workspaceName} • Generated ${new Date(metadata.generatedAt).toLocaleString()}
      </p>
    </header>
    
    ${options.includeSummary ? `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value error">${errorCount}</div>
        <div class="stat-label">Errors</div>
      </div>
      <div class="stat-card">
        <div class="stat-value warning">${warningCount}</div>
        <div class="stat-label">Warnings</div>
      </div>
      <div class="stat-card">
        <div class="stat-value info">${infoCount}</div>
        <div class="stat-label">Info</div>
      </div>
      <div class="stat-card">
        <div class="stat-value neutral">${metadata.totalFiles}</div>
        <div class="stat-label">Files Scanned</div>
      </div>
      <div class="stat-card">
        <div class="stat-value success">${Math.round(metadata.scanDuration)}ms</div>
        <div class="stat-label">Scan Time</div>
      </div>
    </div>
    
    <div class="score-section">
      <div class="score-ring">
        <svg viewBox="0 0 200 200">
          <defs>
            <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#8b5cf6" />
              <stop offset="100%" stop-color="#3b82f6" />
            </linearGradient>
          </defs>
          <circle class="bg" cx="100" cy="100" r="88" />
          <circle class="progress" cx="100" cy="100" r="88" 
            stroke-dasharray="${2 * Math.PI * 88}"
            stroke-dashoffset="${2 * Math.PI * 88 * (1 - this.calculateScore(scanResult) / 100)}" />
        </svg>
        <div class="score-value">
          <div class="score-number">${this.calculateScore(scanResult)}</div>
          <div class="score-label">Security Score</div>
        </div>
      </div>
    </div>
    ` : ''}
    
    ${options.includeCharts ? `
    <div class="charts-section">
      <div class="chart-card">
        <h3 class="chart-title">Issues by Severity</h3>
        <div class="bar-chart">
          ${this.generateBarChart([
      { label: 'Errors', count: errorCount, class: 'error' },
      { label: 'Warnings', count: warningCount, class: 'warning' },
      { label: 'Info', count: infoCount, class: 'info' }
    ])}
        </div>
      </div>
      <div class="chart-card">
        <h3 class="chart-title">Issues by Engine</h3>
        <div class="bar-chart">
          ${this.generateEngineChart(issues)}
        </div>
      </div>
    </div>
    ` : ''}
    
    <section class="section">
      <div class="section-header">
        <h2 class="section-title">Detected Issues</h2>
        <span class="section-count">${issues.length} total</span>
      </div>
      
      ${Object.entries(groupedIssues).map(([group, groupIssues]) => `
        <div class="issue-group">
          <div class="group-header">
            <span class="group-icon">${this.getGroupIcon(options.groupBy, group)}</span>
            <span class="group-name">${group}</span>
            <span class="group-count">${groupIssues.length} issues</span>
          </div>
          
          ${groupIssues.map(issue => `
            <div class="issue-card">
              <div class="issue-header">
                <span class="severity-badge ${issue.severity}">${issue.severity}</span>
                <div class="issue-content">
                  <div class="issue-message">${this.escapeHtml(issue.message)}</div>
                  <div class="issue-location">${issue.file}:${issue.line}:${issue.column}</div>
                  <div class="issue-meta">
                    <span class="meta-item">🔧 ${issue.engine}</span>
                    <span class="meta-item">📏 ${issue.rule}</span>
                  </div>
                </div>
              </div>
              
              ${options.includeCodeSnippets && issue.codeSnippet ? `
                <div class="code-snippet">
                  ${this.formatCodeSnippet(issue.codeSnippet, issue.line)}
                </div>
              ` : ''}
              
              ${options.includeRecommendations && issue.suggestion ? `
                <div class="recommendation">
                  <div class="recommendation-label">💡 Recommendation</div>
                  <div>${this.escapeHtml(issue.suggestion)}</div>
                </div>
              ` : ''}
            </div>
          `).join('')}
        </div>
      `).join('')}
    </section>
    
    <footer class="footer">
      <p>Generated by <a href="https://vibecheck.dev">VibeCheck</a> v${metadata.version}</p>
      <p>AI-Native Code Security for Modern Development</p>
    </footer>
  </div>
</body>
</html>`;
  }

  private generateMarkdownReport(
    scanResult: ScanResult,
    options: ReportOptions,
    metadata: ReportMetadata
  ): string {
    const issues = scanResult.issues;
    const errorCount = issues.filter(i => i.severity === 'error').length;
    const warningCount = issues.filter(i => i.severity === 'warning').length;
    const infoCount = issues.filter(i => i.severity === 'info').length;
    const groupedIssues = this.groupIssues(issues, options.groupBy);

    let md = `# ${options.title || 'VibeCheck Security Report'}

**Project:** ${metadata.workspaceName}  
**Generated:** ${new Date(metadata.generatedAt).toLocaleString()}  
**Scan Duration:** ${Math.round(metadata.scanDuration)}ms  

---

`;

    if (options.includeSummary) {
      md += `## Summary

| Metric | Value |
|--------|-------|
| 🔴 Errors | ${errorCount} |
| 🟡 Warnings | ${warningCount} |
| 🔵 Info | ${infoCount} |
| 📁 Files Scanned | ${metadata.totalFiles} |
| ⏱️ Duration | ${Math.round(metadata.scanDuration)}ms |
| 🎯 Security Score | ${this.calculateScore(scanResult)}/100 |

---

`;
    }

    md += `## Issues (${issues.length} total)

`;

    for (const [group, groupIssues] of Object.entries(groupedIssues)) {
      md += `### ${group} (${groupIssues.length})

`;
      for (const issue of groupIssues) {
        const severityEmoji = issue.severity === 'error' ? '🔴' : issue.severity === 'warning' ? '🟡' : '🔵';

        md += `#### ${severityEmoji} ${issue.message}

- **Location:** \`${issue.file}:${issue.line}:${issue.column}\`
- **Engine:** ${issue.engine}
- **Rule:** ${issue.rule}

`;

        if (options.includeCodeSnippets && issue.codeSnippet) {
          md += `\`\`\`${this.getLanguageFromFile(issue.file)}
${issue.codeSnippet}
\`\`\`

`;
        }

        if (options.includeRecommendations && issue.suggestion) {
          md += `> 💡 **Recommendation:** ${issue.suggestion}

`;
        }
      }
    }

    md += `---

*Generated by [VibeCheck](https://vibecheck.dev) v${metadata.version}*
`;

    return md;
  }

  private generateJsonReport(
    scanResult: ScanResult,
    options: ReportOptions,
    metadata: ReportMetadata
  ): string {
    return JSON.stringify({
      $schema: 'https://vibecheck.dev/schemas/report-v1.json',
      metadata,
      summary: {
        totalIssues: scanResult.issues.length,
        errors: scanResult.issues.filter(i => i.severity === 'error').length,
        warnings: scanResult.issues.filter(i => i.severity === 'warning').length,
        info: scanResult.issues.filter(i => i.severity === 'info').length,
        score: this.calculateScore(scanResult)
      },
      issues: scanResult.issues,
      options: {
        groupBy: options.groupBy,
        engines: scanResult.enginesUsed
      }
    }, null, 2);
  }

  private generateSarifReport(
    scanResult: ScanResult,
    _options: ReportOptions,
    metadata: ReportMetadata
  ): string {
    // SARIF 2.1.0 format for GitHub/Azure DevOps integration
    const sarif = {
      $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
      version: '2.1.0',
      runs: [{
        tool: {
          driver: {
            name: 'VibeCheck',
            informationUri: 'https://vibecheck.dev',
            version: metadata.version,
            rules: this.extractRules(scanResult.issues)
          }
        },
        results: scanResult.issues.map(issue => ({
          ruleId: issue.rule,
          level: this.toSarifLevel(issue.severity),
          message: {
            text: issue.message
          },
          locations: [{
            physicalLocation: {
              artifactLocation: {
                uri: issue.file,
                uriBaseId: '%SRCROOT%'
              },
              region: {
                startLine: issue.line,
                startColumn: issue.column,
                endLine: issue.endLine || issue.line,
                endColumn: issue.endColumn || issue.column + 1
              }
            }
          }],
          fixes: issue.suggestion ? [{
            description: {
              text: issue.suggestion
            }
          }] : undefined
        })),
        invocations: [{
          executionSuccessful: true,
          startTimeUtc: metadata.scannedAt,
          endTimeUtc: metadata.generatedAt
        }]
      }]
    };

    return JSON.stringify(sarif, null, 2);
  }

  private generatePdfReport(
    scanResult: ScanResult,
    options: ReportOptions,
    metadata: ReportMetadata
  ): string {
    // Generate HTML with print-optimized styles
    // User can print to PDF from browser
    return this.generateHtmlReport(scanResult, {
      ...options,
      title: (options.title || 'VibeCheck Security Report') + ' (Print Version)'
    }, metadata);
  }

  private calculateScore(scanResult: ScanResult): number {
    return this.calculateSecurityScore(scanResult.issues);
  }

  private groupIssues(issues: Issue[], groupBy: string): Record<string, Issue[]> {
    if (groupBy === 'none') {
      return { 'All Issues': issues };
    }

    return issues.reduce((acc, issue) => {
      let key: string;
      switch (groupBy) {
        case 'file':
          key = issue.file;
          break;
        case 'severity':
          key = issue.severity.charAt(0).toUpperCase() + issue.severity.slice(1) + 's';
          break;
        case 'engine':
          key = issue.engine;
          break;
        default:
          key = 'Other';
      }

      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(issue);
      return acc;
    }, {} as Record<string, Issue[]>);
  }

  private getGroupIcon(groupBy: string, group: string): string {
    if (groupBy === 'severity') {
      if (group.includes('Error')) return '🔴';
      if (group.includes('Warning')) return '🟡';
      return '🔵';
    }
    if (groupBy === 'engine') return '🔧';
    return '📄';
  }

  private generateBarChart(data: Array<{ label: string; count: number; class: string }>): string {
    const maxCount = Math.max(...data.map(d => d.count), 1);

    return data.map(item => `
      <div class="bar-row">
        <span class="bar-label">${item.label}</span>
        <div class="bar-track">
          <div class="bar-fill ${item.class}" style="width: ${(item.count / maxCount) * 100}%"></div>
        </div>
        <span class="bar-count">${item.count}</span>
      </div>
    `).join('');
  }

  private generateEngineChart(issues: Issue[]): string {
    const engines = issues.reduce((acc, issue) => {
      acc[issue.engine] = (acc[issue.engine] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const maxCount = Math.max(...Object.values(engines), 1);

    return Object.entries(engines).map(([engine, count]) => `
      <div class="bar-row">
        <span class="bar-label">${engine}</span>
        <div class="bar-track">
          <div class="bar-fill purple" style="width: ${(count / maxCount) * 100}%"></div>
        </div>
        <span class="bar-count">${count}</span>
      </div>
    `).join('');
  }

  private formatCodeSnippet(code: string, highlightLine: number): string {
    const lines = code.split('\n');
    const startLine = Math.max(1, highlightLine - 2);

    return lines.map((line, i) => {
      const lineNum = startLine + i;
      const isHighlighted = lineNum === highlightLine;
      return `
        <div class="code-line">
          <span class="line-number">${lineNum}</span>
          <span class="line-content${isHighlighted ? ' highlighted' : ''}">${this.escapeHtml(line)}</span>
        </div>
      `;
    }).join('');
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private getLanguageFromFile(file: string): string {
    const ext = path.extname(file).slice(1);
    const langMap: Record<string, string> = {
      js: 'javascript',
      jsx: 'jsx',
      ts: 'typescript',
      tsx: 'tsx',
      py: 'python',
      go: 'go',
      rs: 'rust'
    };
    return langMap[ext] || ext;
  }

  private extractRules(issues: Issue[]): Array<{ id: string; name: string; shortDescription: { text: string } }> {
    const seen = new Set<string>();
    const rules: Array<{ id: string; name: string; shortDescription: { text: string } }> = [];

    for (const issue of issues) {
      if (!seen.has(issue.rule)) {
        seen.add(issue.rule);
        rules.push({
          id: issue.rule,
          name: issue.rule,
          shortDescription: { text: issue.message }
        });
      }
    }

    return rules;
  }

  private toSarifLevel(severity: string): string {
    switch (severity) {
      case 'error': return 'error';
      case 'warning': return 'warning';
      default: return 'note';
    }
  }
}
