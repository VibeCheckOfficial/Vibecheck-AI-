/**
 * HTML Report Styles
 * 
 * CSS styles for the HTML report generator.
 */

import { SEVERITY_COLORS } from './types.js';

// ============================================================================
// Dark Theme Styles
// ============================================================================

export const DARK_THEME_CSS = `
:root {
  --bg-primary: #0f0f0f;
  --bg-secondary: #1a1a1a;
  --bg-card: #242424;
  --bg-hover: #2a2a2a;
  --text-primary: #f5f5f5;
  --text-secondary: #a0a0a0;
  --text-muted: #666666;
  --border-color: #333333;
  --accent-primary: #8b5cf6;
  --accent-secondary: #a78bfa;
  --gradient-start: #8b5cf6;
  --gradient-end: #06b6d4;
  --critical: ${SEVERITY_COLORS.critical};
  --high: ${SEVERITY_COLORS.high};
  --medium: ${SEVERITY_COLORS.medium};
  --low: ${SEVERITY_COLORS.low};
  --info: ${SEVERITY_COLORS.info};
}
`;

export const LIGHT_THEME_CSS = `
:root {
  --bg-primary: #ffffff;
  --bg-secondary: #f5f5f5;
  --bg-card: #ffffff;
  --bg-hover: #f0f0f0;
  --text-primary: #1a1a1a;
  --text-secondary: #666666;
  --text-muted: #999999;
  --border-color: #e0e0e0;
  --accent-primary: #7c3aed;
  --accent-secondary: #8b5cf6;
  --gradient-start: #7c3aed;
  --gradient-end: #0891b2;
  --critical: ${SEVERITY_COLORS.critical};
  --high: ${SEVERITY_COLORS.high};
  --medium: ${SEVERITY_COLORS.medium};
  --low: ${SEVERITY_COLORS.low};
  --info: ${SEVERITY_COLORS.info};
}
`;

// ============================================================================
// Base Styles
// ============================================================================

export const BASE_CSS = `
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  background-color: var(--bg-primary);
  color: var(--text-primary);
  line-height: 1.6;
  padding: 2rem;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
}

/* Header */
.header {
  text-align: center;
  margin-bottom: 3rem;
  padding-bottom: 2rem;
  border-bottom: 1px solid var(--border-color);
}

.header h1 {
  font-size: 2.5rem;
  background: linear-gradient(135deg, var(--gradient-start), var(--gradient-end));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin-bottom: 0.5rem;
}

.header .subtitle {
  color: var(--text-secondary);
  font-size: 1.1rem;
}

.header .timestamp {
  color: var(--text-muted);
  font-size: 0.9rem;
  margin-top: 0.5rem;
}

/* Stats Grid */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1.5rem;
  margin-bottom: 3rem;
}

.stat-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 1.5rem;
  text-align: center;
  transition: transform 0.2s, box-shadow 0.2s;
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.stat-value {
  font-size: 2.5rem;
  font-weight: 700;
  margin-bottom: 0.25rem;
}

.stat-label {
  color: var(--text-secondary);
  font-size: 0.9rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.stat-card.critical .stat-value { color: var(--critical); }
.stat-card.high .stat-value { color: var(--high); }
.stat-card.medium .stat-value { color: var(--medium); }
.stat-card.low .stat-value { color: var(--low); }
.stat-card.info .stat-value { color: var(--info); }
.stat-card.total .stat-value { color: var(--accent-primary); }

/* Score Ring */
.score-container {
  display: flex;
  justify-content: center;
  margin-bottom: 3rem;
}

.score-ring {
  position: relative;
  width: 200px;
  height: 200px;
}

.score-ring svg {
  transform: rotate(-90deg);
}

.score-ring .ring-bg {
  fill: none;
  stroke: var(--bg-secondary);
  stroke-width: 12;
}

.score-ring .ring-progress {
  fill: none;
  stroke: var(--accent-primary);
  stroke-width: 12;
  stroke-linecap: round;
  transition: stroke-dashoffset 0.5s ease;
}

.score-ring .score-text {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
}

.score-ring .score-value {
  font-size: 3rem;
  font-weight: 700;
}

.score-ring .score-label {
  color: var(--text-secondary);
  font-size: 0.9rem;
}

/* Findings */
.findings-section {
  margin-bottom: 3rem;
}

.findings-section h2 {
  font-size: 1.5rem;
  margin-bottom: 1.5rem;
  padding-bottom: 0.5rem;
  border-bottom: 2px solid var(--accent-primary);
}

.finding-group {
  margin-bottom: 2rem;
}

.finding-group h3 {
  font-size: 1.1rem;
  color: var(--text-secondary);
  margin-bottom: 1rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.finding-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  margin-bottom: 1rem;
  overflow: hidden;
}

.finding-header {
  display: flex;
  align-items: center;
  padding: 1rem;
  gap: 1rem;
  cursor: pointer;
  transition: background-color 0.2s;
}

.finding-header:hover {
  background-color: var(--bg-hover);
}

.severity-badge {
  padding: 0.25rem 0.75rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
}

.severity-badge.critical { background-color: var(--critical); color: white; }
.severity-badge.high { background-color: var(--high); color: white; }
.severity-badge.medium { background-color: var(--medium); color: black; }
.severity-badge.low { background-color: var(--low); color: black; }
.severity-badge.info { background-color: var(--info); color: white; }

.finding-title {
  flex: 1;
  font-weight: 500;
}

.finding-location {
  color: var(--text-muted);
  font-size: 0.9rem;
  font-family: monospace;
}

.finding-body {
  padding: 1rem;
  border-top: 1px solid var(--border-color);
  display: none;
}

.finding-card.expanded .finding-body {
  display: block;
}

.finding-description {
  margin-bottom: 1rem;
  color: var(--text-secondary);
}

.code-snippet {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 1rem;
  overflow-x: auto;
  font-family: 'Fira Code', 'Monaco', 'Consolas', monospace;
  font-size: 0.85rem;
  line-height: 1.5;
  margin-bottom: 1rem;
}

.code-snippet code {
  color: var(--text-primary);
}

.suggestion {
  background: rgba(139, 92, 246, 0.1);
  border-left: 3px solid var(--accent-primary);
  padding: 1rem;
  border-radius: 0 4px 4px 0;
}

.suggestion-label {
  color: var(--accent-primary);
  font-weight: 600;
  margin-bottom: 0.5rem;
}

/* Footer */
.footer {
  text-align: center;
  padding-top: 2rem;
  border-top: 1px solid var(--border-color);
  color: var(--text-muted);
  font-size: 0.9rem;
}

/* Charts */
.chart-container {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 1.5rem;
  margin-bottom: 2rem;
}

.chart-container h3 {
  margin-bottom: 1rem;
  font-size: 1.1rem;
}

.bar-chart {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.bar-item {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.bar-label {
  width: 80px;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.bar-track {
  flex: 1;
  height: 24px;
  background: var(--bg-secondary);
  border-radius: 4px;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.3s ease;
}

.bar-value {
  width: 40px;
  text-align: right;
  font-weight: 600;
  font-size: 0.9rem;
}

/* Print Styles */
@media print {
  body {
    background: white;
    color: black;
  }
  
  .finding-body {
    display: block !important;
  }
  
  .finding-header {
    cursor: default;
  }
  
  .code-snippet {
    white-space: pre-wrap;
    word-break: break-all;
  }
}

/* Animations */
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.animate-in {
  animation: fadeIn 0.3s ease forwards;
}
`;

// ============================================================================
// Get Combined Styles
// ============================================================================

export function getStyles(theme: 'dark' | 'light'): string {
  const themeCSS = theme === 'dark' ? DARK_THEME_CSS : LIGHT_THEME_CSS;
  return themeCSS + BASE_CSS;
}
