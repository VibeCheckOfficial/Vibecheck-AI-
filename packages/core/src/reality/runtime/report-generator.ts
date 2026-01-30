/**
 * Reality Mode HTML Report Generator
 * 
 * Creates a comprehensive HTML report with:
 * - Summary of all findings
 * - Screenshots and videos for each route
 * - Network logs and console errors
 * - Evidence for each issue found
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type {
  RealityModeOutput,
  RuntimeFinding,
  RunSummary,
} from '../types.js';

export interface ReportOptions {
  /** Title for the report */
  title?: string;
  /** Project name */
  projectName?: string;
  /** Base URL that was tested */
  baseUrl?: string;
  /** Output directory for artifacts */
  artifactsDir: string;
}

/**
 * Generate an HTML report for Reality Mode results
 */
export async function generateHtmlReport(
  output: RealityModeOutput,
  options: ReportOptions
): Promise<string> {
  const {
    title = 'Reality Mode Report',
    projectName = 'Unknown Project',
    baseUrl = 'localhost',
    artifactsDir,
  } = options;
  
  const { findings, summary, artifactsIndex } = output;
  
  // Group findings by severity
  const criticalFindings = findings.filter(f => f.severity === 'critical');
  const highFindings = findings.filter(f => f.severity === 'high');
  const mediumFindings = findings.filter(f => f.severity === 'medium');
  const lowFindings = findings.filter(f => f.severity === 'low');
  const infoFindings = findings.filter(f => f.severity === 'info');
  
  // Get list of videos
  const videos = artifactsIndex.artifacts.filter(a => a.type === 'video' || a.path.endsWith('.webm'));
  const screenshots = artifactsIndex.artifacts.filter(a => a.type === 'screenshot');
  
  // Scan for video files in the videos directory
  let videoFiles: string[] = [];
  try {
    const videosDir = path.join(artifactsDir, 'videos');
    const files = await fs.readdir(videosDir);
    videoFiles = files.filter(f => f.endsWith('.webm') || f.endsWith('.mp4'));
  } catch {
    // No videos directory
  }
  
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      --bg: #0a0a0a;
      --card: #141414;
      --border: #2a2a2a;
      --text: #e5e5e5;
      --text-muted: #888;
      --accent: #3b82f6;
      --critical: #ef4444;
      --high: #f97316;
      --medium: #eab308;
      --low: #22c55e;
      --info: #6b7280;
    }
    
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      padding: 2rem;
    }
    
    .container {
      max-width: 1400px;
      margin: 0 auto;
    }
    
    header {
      text-align: center;
      margin-bottom: 3rem;
      padding-bottom: 2rem;
      border-bottom: 1px solid var(--border);
    }
    
    h1 {
      font-size: 2.5rem;
      margin-bottom: 0.5rem;
      background: linear-gradient(135deg, #3b82f6, #8b5cf6);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    
    .subtitle {
      color: var(--text-muted);
      font-size: 1.1rem;
    }
    
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }
    
    .summary-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.5rem;
      text-align: center;
    }
    
    .summary-card h3 {
      color: var(--text-muted);
      font-size: 0.875rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 0.5rem;
    }
    
    .summary-card .value {
      font-size: 2rem;
      font-weight: 700;
    }
    
    .summary-card.critical .value { color: var(--critical); }
    .summary-card.high .value { color: var(--high); }
    .summary-card.medium .value { color: var(--medium); }
    .summary-card.pass .value { color: var(--low); }
    
    .verdict {
      display: inline-block;
      padding: 0.5rem 1.5rem;
      border-radius: 9999px;
      font-weight: 600;
      font-size: 1.25rem;
      margin-top: 1rem;
    }
    
    .verdict.fail { background: var(--critical); color: white; }
    .verdict.warn { background: var(--medium); color: black; }
    .verdict.pass { background: var(--low); color: white; }
    
    section {
      margin-bottom: 3rem;
    }
    
    section h2 {
      font-size: 1.5rem;
      margin-bottom: 1rem;
      padding-bottom: 0.5rem;
      border-bottom: 1px solid var(--border);
    }
    
    .finding {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.5rem;
      margin-bottom: 1rem;
    }
    
    .finding-header {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 1rem;
    }
    
    .severity-badge {
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
    }
    
    .severity-badge.critical { background: var(--critical); color: white; }
    .severity-badge.high { background: var(--high); color: white; }
    .severity-badge.medium { background: var(--medium); color: black; }
    .severity-badge.low { background: var(--low); color: white; }
    .severity-badge.info { background: var(--info); color: white; }
    
    .finding-title {
      font-size: 1.1rem;
      font-weight: 600;
    }
    
    .finding-route {
      color: var(--accent);
      font-family: monospace;
      font-size: 0.9rem;
    }
    
    .finding-message {
      color: var(--text-muted);
      margin: 0.5rem 0;
    }
    
    .evidence-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 1rem;
      margin-top: 1rem;
    }
    
    .evidence-item {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      overflow: hidden;
    }
    
    .evidence-item img,
    .evidence-item video {
      width: 100%;
      display: block;
    }
    
    .evidence-item .caption {
      padding: 0.75rem;
      font-size: 0.875rem;
      color: var(--text-muted);
    }
    
    .videos-section {
      margin-top: 2rem;
    }
    
    .video-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
      gap: 1.5rem;
    }
    
    .video-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
    }
    
    .video-card video {
      width: 100%;
      display: block;
    }
    
    .video-card .info {
      padding: 1rem;
    }
    
    .video-card .info h4 {
      margin-bottom: 0.25rem;
    }
    
    .video-card .info p {
      color: var(--text-muted);
      font-size: 0.875rem;
    }
    
    .console-errors {
      background: #1a1a1a;
      border: 1px solid var(--critical);
      border-radius: 8px;
      padding: 1rem;
      margin-top: 1rem;
      font-family: monospace;
      font-size: 0.875rem;
      color: var(--critical);
      max-height: 200px;
      overflow-y: auto;
    }
    
    .network-log {
      background: #1a1a1a;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1rem;
      margin-top: 1rem;
      font-family: monospace;
      font-size: 0.8rem;
      max-height: 300px;
      overflow-y: auto;
    }
    
    .network-entry {
      display: flex;
      gap: 1rem;
      padding: 0.25rem 0;
      border-bottom: 1px solid var(--border);
    }
    
    .network-entry:last-child {
      border-bottom: none;
    }
    
    .network-status {
      width: 40px;
      text-align: center;
    }
    
    .network-status.ok { color: var(--low); }
    .network-status.error { color: var(--critical); }
    
    .network-method {
      width: 60px;
      color: var(--accent);
    }
    
    .network-url {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    
    .meta-info {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.5rem;
      margin-bottom: 2rem;
    }
    
    .meta-item {
      display: flex;
      flex-direction: column;
    }
    
    .meta-item label {
      color: var(--text-muted);
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    
    .meta-item span {
      font-weight: 500;
    }
    
    footer {
      text-align: center;
      padding-top: 2rem;
      border-top: 1px solid var(--border);
      color: var(--text-muted);
      font-size: 0.875rem;
    }
    
    .no-findings {
      text-align: center;
      padding: 3rem;
      color: var(--text-muted);
    }
    
    .no-findings .icon {
      font-size: 3rem;
      margin-bottom: 1rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>🔍 ${escapeHtml(title)}</h1>
      <p class="subtitle">${escapeHtml(projectName)} • ${escapeHtml(baseUrl)}</p>
      <div class="verdict ${summary.verdict}">${summary.verdict.toUpperCase()}</div>
    </header>
    
    <div class="meta-info">
      <div class="meta-item">
        <label>Run ID</label>
        <span>${escapeHtml(summary.runId)}</span>
      </div>
      <div class="meta-item">
        <label>Started</label>
        <span>${new Date(summary.startedAt).toLocaleString()}</span>
      </div>
      <div class="meta-item">
        <label>Duration</label>
        <span>${(summary.durationMs / 1000).toFixed(1)}s</span>
      </div>
      <div class="meta-item">
        <label>Routes Tested</label>
        <span>${summary.routesVerified} / ${summary.routesTotal}</span>
      </div>
    </div>
    
    <div class="summary-grid">
      <div class="summary-card critical">
        <h3>Critical</h3>
        <div class="value">${criticalFindings.length}</div>
      </div>
      <div class="summary-card high">
        <h3>High</h3>
        <div class="value">${highFindings.length}</div>
      </div>
      <div class="summary-card medium">
        <h3>Medium</h3>
        <div class="value">${mediumFindings.length}</div>
      </div>
      <div class="summary-card pass">
        <h3>Low/Info</h3>
        <div class="value">${lowFindings.length + infoFindings.length}</div>
      </div>
    </div>
    
    ${videoFiles.length > 0 ? `
    <section class="videos-section">
      <h2>📹 Recorded Sessions</h2>
      <div class="video-grid">
        ${videoFiles.map((video, i) => `
        <div class="video-card">
          <video controls>
            <source src="videos/${escapeHtml(video)}" type="video/webm">
            Your browser does not support video playback.
          </video>
          <div class="info">
            <h4>Session Recording ${i + 1}</h4>
            <p>${escapeHtml(video)}</p>
          </div>
        </div>
        `).join('')}
      </div>
    </section>
    ` : ''}
    
    ${findings.length > 0 ? `
    <section>
      <h2>🚨 Findings (${findings.length})</h2>
      ${findings.map(finding => renderFinding(finding, artifactsDir)).join('')}
    </section>
    ` : `
    <div class="no-findings">
      <div class="icon">✅</div>
      <h3>No Issues Found</h3>
      <p>All routes passed verification</p>
    </div>
    `}
    
    <footer>
      <p>Generated by VibeCheck Reality Mode • ${new Date().toISOString()}</p>
    </footer>
  </div>
</body>
</html>`;
  
  // Write the report
  const reportPath = path.join(artifactsDir, 'report.html');
  await fs.writeFile(reportPath, html);
  
  return reportPath;
}

/**
 * Render a single finding
 */
function renderFinding(finding: RuntimeFinding, artifactsDir: string): string {
  const screenshotPath = finding.evidence?.screenshotPath;
  const consoleErrors = finding.evidence?.consoleErrors ?? [];
  const networkSummary = finding.evidence?.networkSummary;
  
  return `
  <div class="finding">
    <div class="finding-header">
      <span class="severity-badge ${finding.severity}">${finding.severity}</span>
      <span class="finding-title">${escapeHtml(finding.ruleName)}</span>
    </div>
    <div class="finding-route">${escapeHtml(finding.route.method)} ${escapeHtml(finding.route.path)}</div>
    <p class="finding-message">${escapeHtml(finding.message)}</p>
    
    ${screenshotPath ? `
    <div class="evidence-grid">
      <div class="evidence-item">
        <img src="${escapeHtml(screenshotPath)}" alt="Screenshot of ${escapeHtml(finding.route.path)}" loading="lazy">
        <div class="caption">Screenshot at time of issue</div>
      </div>
    </div>
    ` : ''}
    
    ${consoleErrors.length > 0 ? `
    <div class="console-errors">
      <strong>Console Errors:</strong><br>
      ${consoleErrors.map(err => `• ${escapeHtml(err)}`).join('<br>')}
    </div>
    ` : ''}
    
    ${networkSummary ? `
    <div style="margin-top: 1rem; color: var(--text-muted); font-size: 0.875rem;">
      Network: ${networkSummary.totalRequests} requests, 
      ${networkSummary.failedRequests} failed, 
      avg ${networkSummary.avgResponseTime}ms
    </div>
    ` : ''}
  </div>
  `;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Open the report in the default browser
 */
export async function openReport(reportPath: string): Promise<void> {
  const { exec } = await import('child_process');
  
  const command = process.platform === 'win32'
    ? `start "" "${reportPath}"`
    : process.platform === 'darwin'
    ? `open "${reportPath}"`
    : `xdg-open "${reportPath}"`;
  
  exec(command);
}
