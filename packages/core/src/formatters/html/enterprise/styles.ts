/**
 * Enterprise Report Styles
 * 
 * Modern, enterprise-grade CSS for HTML/PDF reports.
 */

// ============================================================================
// CSS Variables - Dark Theme
// ============================================================================

export const DARK_THEME_VARS = `
:root {
  /* Background colors */
  --bg-primary: #0a0a0f;
  --bg-secondary: #12121a;
  --bg-card: #1a1a24;
  --bg-card-hover: #22222e;
  --bg-elevated: #252532;
  --bg-input: #16161f;
  
  /* Text colors */
  --text-primary: #f5f5f7;
  --text-secondary: #a1a1aa;
  --text-muted: #71717a;
  --text-inverse: #0a0a0f;
  
  /* Border colors */
  --border-primary: #27272a;
  --border-secondary: #3f3f46;
  --border-focus: #8b5cf6;
  
  /* Brand colors */
  --brand-primary: #8b5cf6;
  --brand-secondary: #a78bfa;
  --brand-gradient-start: #8b5cf6;
  --brand-gradient-end: #06b6d4;
  
  /* Status colors */
  --color-critical: #ef4444;
  --color-critical-bg: rgba(239, 68, 68, 0.15);
  --color-high: #f97316;
  --color-high-bg: rgba(249, 115, 22, 0.15);
  --color-medium: #eab308;
  --color-medium-bg: rgba(234, 179, 8, 0.15);
  --color-low: #22c55e;
  --color-low-bg: rgba(34, 197, 94, 0.15);
  --color-info: #3b82f6;
  --color-info-bg: rgba(59, 130, 246, 0.15);
  
  /* Score colors */
  --score-green: #22c55e;
  --score-yellow: #eab308;
  --score-orange: #f97316;
  --score-red: #ef4444;
  
  /* Category colors */
  --category-secret: #f97316;
  --category-auth: #f97316;
  --category-mock: #22c55e;
  --category-error: #22c55e;
  --category-config: #22c55e;
  --category-quality: #22c55e;
  
  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.4);
  --shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.5);
  --shadow-glow: 0 0 20px rgba(139, 92, 246, 0.3);
  
  /* Transitions */
  --transition-fast: 150ms ease;
  --transition-normal: 250ms ease;
  --transition-slow: 350ms ease;
  
  /* Border radius */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --radius-full: 9999px;
  
  /* Spacing */
  --space-xs: 0.25rem;
  --space-sm: 0.5rem;
  --space-md: 1rem;
  --space-lg: 1.5rem;
  --space-xl: 2rem;
  --space-2xl: 3rem;
}
`;

export const LIGHT_THEME_VARS = `
:root {
  /* Background colors */
  --bg-primary: #ffffff;
  --bg-secondary: #f4f4f5;
  --bg-card: #ffffff;
  --bg-card-hover: #fafafa;
  --bg-elevated: #ffffff;
  --bg-input: #f4f4f5;
  
  /* Text colors */
  --text-primary: #18181b;
  --text-secondary: #52525b;
  --text-muted: #a1a1aa;
  --text-inverse: #ffffff;
  
  /* Border colors */
  --border-primary: #e4e4e7;
  --border-secondary: #d4d4d8;
  --border-focus: #7c3aed;
  
  /* Brand colors */
  --brand-primary: #7c3aed;
  --brand-secondary: #8b5cf6;
  --brand-gradient-start: #7c3aed;
  --brand-gradient-end: #0891b2;
  
  /* Status colors */
  --color-critical: #dc2626;
  --color-critical-bg: rgba(220, 38, 38, 0.1);
  --color-high: #ea580c;
  --color-high-bg: rgba(234, 88, 12, 0.1);
  --color-medium: #ca8a04;
  --color-medium-bg: rgba(202, 138, 4, 0.1);
  --color-low: #16a34a;
  --color-low-bg: rgba(22, 163, 74, 0.1);
  --color-info: #2563eb;
  --color-info-bg: rgba(37, 99, 235, 0.1);
  
  /* Score colors */
  --score-green: #16a34a;
  --score-yellow: #ca8a04;
  --score-orange: #ea580c;
  --score-red: #dc2626;
  
  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.07);
  --shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.1);
  --shadow-glow: 0 0 20px rgba(124, 58, 237, 0.15);
}
`;

// ============================================================================
// Base Styles
// ============================================================================

export const BASE_STYLES = `
/* Reset */
*, *::before, *::after {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

/* Typography */
html {
  font-size: 16px;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  background-color: var(--bg-primary);
  color: var(--text-primary);
  line-height: 1.6;
  min-height: 100vh;
}

/* Container */
.report-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: var(--space-xl);
}

/* Links */
a {
  color: var(--brand-primary);
  text-decoration: none;
  transition: color var(--transition-fast);
}

a:hover {
  color: var(--brand-secondary);
}

/* Code */
code, pre {
  font-family: 'JetBrains Mono', 'Fira Code', 'Monaco', 'Consolas', monospace;
}

/* Utilities */
.text-center { text-align: center; }
.text-right { text-align: right; }
.font-mono { font-family: 'JetBrains Mono', monospace; }
.font-bold { font-weight: 700; }
.font-semibold { font-weight: 600; }
.font-medium { font-weight: 500; }

/* Gradient Text */
.gradient-text {
  background: linear-gradient(135deg, var(--brand-gradient-start), var(--brand-gradient-end));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
`;

// ============================================================================
// Header Styles
// ============================================================================

export const HEADER_STYLES = `
/* Header */
.report-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: var(--space-lg);
  margin-bottom: var(--space-xl);
  border-bottom: 1px solid var(--border-primary);
}

.header-left {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.header-logo {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.header-logo svg {
  width: 32px;
  height: 32px;
}

.header-logo-text {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.report-title {
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--brand-primary);
}

.report-subtitle {
  display: flex;
  align-items: center;
  gap: var(--space-lg);
  margin-top: var(--space-xs);
  color: var(--text-muted);
  font-size: 0.875rem;
}

.report-subtitle span {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
}

.header-right {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.header-actions {
  display: flex;
  gap: var(--space-sm);
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-md);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
  border: 1px solid transparent;
}

.btn-ghost {
  background: transparent;
  color: var(--text-secondary);
  border-color: var(--border-primary);
}

.btn-ghost:hover {
  background: var(--bg-card);
  color: var(--text-primary);
}

.btn-primary {
  background: var(--brand-primary);
  color: white;
}

.btn-primary:hover {
  background: var(--brand-secondary);
}

/* Theme Toggle */
.theme-toggle {
  position: relative;
  width: 44px;
  height: 24px;
  background: var(--bg-input);
  border-radius: var(--radius-full);
  cursor: pointer;
  border: 1px solid var(--border-primary);
}

.theme-toggle::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  background: var(--text-primary);
  border-radius: 50%;
  transition: transform var(--transition-fast);
}

.theme-toggle.light::after {
  transform: translateX(20px);
}
`;

// ============================================================================
// Score Section Styles
// ============================================================================

export const SCORE_STYLES = `
/* Score Overview Section */
.score-section {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-xl);
  margin-bottom: var(--space-2xl);
}

/* Score Card */
.score-card {
  background: var(--bg-card);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-xl);
  padding: var(--space-xl);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

/* Large Score Display */
.score-display {
  text-align: center;
}

.score-value {
  font-size: 6rem;
  font-weight: 800;
  line-height: 1;
  margin-bottom: var(--space-xs);
}

.score-value.green { color: var(--score-green); }
.score-value.yellow { color: var(--score-yellow); }
.score-value.orange { color: var(--score-orange); }
.score-value.red { color: var(--score-red); }

.score-max {
  font-size: 2rem;
  color: var(--text-muted);
  font-weight: 400;
}

.score-grade {
  font-size: 1.5rem;
  font-weight: 700;
  margin-top: var(--space-sm);
}

.score-grade.green { color: var(--score-green); }
.score-grade.yellow { color: var(--score-yellow); }
.score-grade.orange { color: var(--score-orange); }
.score-grade.red { color: var(--score-red); }

/* Progress Bar under score */
.score-progress {
  width: 100%;
  max-width: 400px;
  height: 8px;
  background: var(--bg-input);
  border-radius: var(--radius-full);
  margin-top: var(--space-lg);
  overflow: hidden;
}

.score-progress-fill {
  height: 100%;
  border-radius: var(--radius-full);
  transition: width var(--transition-slow);
}

.score-progress-fill.green { background: linear-gradient(90deg, var(--score-green), #4ade80); }
.score-progress-fill.yellow { background: linear-gradient(90deg, var(--score-yellow), #facc15); }
.score-progress-fill.orange { background: linear-gradient(90deg, var(--score-orange), #fb923c); }
.score-progress-fill.red { background: linear-gradient(90deg, var(--score-red), #f87171); }

/* Status Card */
.status-card {
  background: var(--bg-card);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-xl);
  padding: var(--space-xl);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
}

/* Status Badge */
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-lg);
  border-radius: var(--radius-md);
  font-weight: 700;
  font-size: 0.875rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: var(--space-lg);
}

.status-badge.ready {
  background: var(--color-low-bg);
  color: var(--score-green);
  border: 1px solid var(--score-green);
}

.status-badge.warning {
  background: var(--color-medium-bg);
  color: var(--score-yellow);
  border: 1px solid var(--score-yellow);
}

.status-badge.blocked {
  background: var(--color-critical-bg);
  color: var(--color-critical);
  border: 1px solid var(--color-critical);
}

.status-badge.not-ready {
  background: var(--color-critical-bg);
  color: var(--color-critical);
  border: 1px solid var(--color-critical);
}

.status-icon {
  width: 64px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: var(--space-md);
}

.status-icon svg {
  width: 100%;
  height: 100%;
}

.status-label {
  font-size: 1.125rem;
  font-weight: 700;
  margin-bottom: var(--space-sm);
}

.status-label.green { color: var(--score-green); }
.status-label.red { color: var(--color-critical); }
.status-label.yellow { color: var(--score-yellow); }
.status-label.orange { color: var(--score-orange); }

.status-message {
  color: var(--text-secondary);
  font-size: 0.9rem;
  max-width: 400px;
  line-height: 1.5;
  margin-bottom: var(--space-lg);
}

/* Issue Counts */
.issue-counts {
  display: flex;
  gap: var(--space-md);
  margin-top: var(--space-md);
}

.issue-count {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--space-sm) var(--space-md);
  background: var(--bg-secondary);
  border-radius: var(--radius-md);
  min-width: 60px;
}

.issue-count-value {
  font-size: 1.5rem;
  font-weight: 700;
}

.issue-count-value.critical { color: var(--color-critical); }
.issue-count-value.high { color: var(--color-high); }
.issue-count-value.medium { color: var(--color-medium); }
.issue-count-value.low { color: var(--color-low); }

.issue-count-label {
  font-size: 0.7rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* Score Ring (circular gauge) */
.score-ring-container {
  position: relative;
  width: 200px;
  height: 200px;
}

.score-ring {
  transform: rotate(-90deg);
}

.score-ring-bg {
  fill: none;
  stroke: var(--bg-secondary);
  stroke-width: 12;
}

.score-ring-progress {
  fill: none;
  stroke-width: 12;
  stroke-linecap: round;
  transition: stroke-dashoffset 1s ease-out;
}

.score-ring-progress.green { stroke: var(--score-green); }
.score-ring-progress.yellow { stroke: var(--score-yellow); }
.score-ring-progress.orange { stroke: var(--score-orange); }
.score-ring-progress.red { stroke: var(--score-red); }

.score-ring-text {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
}

.score-ring-value {
  font-size: 3.5rem;
  font-weight: 800;
  line-height: 1;
}

.score-ring-label {
  font-size: 0.75rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin-top: var(--space-xs);
}
`;

// ============================================================================
// Metrics Section Styles
// ============================================================================

export const METRICS_STYLES = `
/* Key Metrics Grid */
.metrics-section {
  margin-bottom: var(--space-2xl);
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: var(--space-md);
}

.metric-card {
  background: var(--bg-card);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-lg);
  padding: var(--space-lg);
  text-align: center;
  transition: all var(--transition-fast);
}

.metric-card:hover {
  border-color: var(--border-secondary);
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.metric-value {
  font-size: 2.5rem;
  font-weight: 700;
  line-height: 1;
  margin-bottom: var(--space-xs);
}

.metric-value.critical { color: var(--color-critical); }
.metric-value.high { color: var(--color-high); }
.metric-value.medium { color: var(--color-medium); }
.metric-value.low { color: var(--color-low); }
.metric-value.info { color: var(--color-info); }
.metric-value.brand { color: var(--brand-primary); }

.metric-label {
  font-size: 0.75rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.metric-trend {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  font-size: 0.75rem;
  margin-top: var(--space-sm);
  padding: 2px 8px;
  border-radius: var(--radius-sm);
}

.metric-trend.up {
  background: var(--color-critical-bg);
  color: var(--color-critical);
}

.metric-trend.down {
  background: var(--color-low-bg);
  color: var(--score-green);
}

.metric-trend.same {
  background: var(--bg-input);
  color: var(--text-muted);
}
`;

// ============================================================================
// Reality Check Table Styles
// ============================================================================

export const REALITY_TABLE_STYLES = `
/* Reality Check Section */
.reality-section {
  margin-bottom: var(--space-2xl);
}

.section-header {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  margin-bottom: var(--space-lg);
}

.section-indicator {
  width: 4px;
  height: 24px;
  background: var(--color-critical);
  border-radius: var(--radius-sm);
}

.section-indicator.brand {
  background: var(--brand-primary);
}

.section-title {
  font-size: 1.25rem;
  font-weight: 700;
}

/* Reality Table */
.reality-table {
  width: 100%;
  background: var(--bg-card);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.reality-table-header {
  display: grid;
  grid-template-columns: 1fr 1fr 100px;
  background: var(--bg-secondary);
  padding: var(--space-md) var(--space-lg);
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.reality-table-row {
  display: grid;
  grid-template-columns: 1fr 1fr 100px;
  padding: var(--space-md) var(--space-lg);
  border-top: 1px solid var(--border-primary);
  align-items: center;
}

.reality-table-row:hover {
  background: var(--bg-card-hover);
}

.reality-assumption {
  color: var(--text-secondary);
}

.reality-truth {
  color: var(--text-primary);
}

.reality-status {
  display: flex;
  justify-content: center;
}

.status-x {
  color: var(--color-critical);
  font-size: 1.25rem;
}

.status-check {
  color: var(--score-green);
  font-size: 1.25rem;
}

.status-warning {
  color: var(--score-yellow);
  font-size: 1.25rem;
}
`;

// ============================================================================
// Score Breakdown Styles
// ============================================================================

export const BREAKDOWN_STYLES = `
/* Score Breakdown Section */
.breakdown-section {
  margin-bottom: var(--space-2xl);
}

.breakdown-table {
  background: var(--bg-card);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.breakdown-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-md) var(--space-lg);
  border-bottom: 1px solid var(--border-primary);
}

.breakdown-row:last-child {
  border-bottom: none;
}

.breakdown-row.total {
  background: var(--bg-secondary);
  font-weight: 700;
}

.breakdown-label {
  color: var(--text-primary);
}

.breakdown-value {
  font-weight: 600;
  font-family: 'JetBrains Mono', monospace;
}

.breakdown-value.positive { color: var(--score-green); }
.breakdown-value.negative { color: var(--color-critical); }
.breakdown-value.neutral { color: var(--text-muted); }
`;

// ============================================================================
// Category Breakdown Styles
// ============================================================================

export const CATEGORY_STYLES = `
/* Category Breakdown Section */
.category-section {
  margin-bottom: var(--space-2xl);
}

.category-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-lg);
}

.category-count {
  font-size: 0.875rem;
  color: var(--text-muted);
  padding: var(--space-xs) var(--space-md);
  background: var(--bg-card);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-full);
}

.category-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: var(--space-md);
}

.category-card {
  background: var(--bg-card);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-lg);
  padding: var(--space-lg);
}

.category-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-md);
}

.category-name {
  font-size: 0.875rem;
  color: var(--text-secondary);
}

.category-score {
  font-size: 1.25rem;
  font-weight: 700;
}

.category-score.green { color: var(--score-green); }
.category-score.yellow { color: var(--score-yellow); }
.category-score.orange { color: var(--score-orange); }
.category-score.red { color: var(--score-red); }

.category-progress {
  height: 6px;
  background: var(--bg-input);
  border-radius: var(--radius-full);
  overflow: hidden;
}

.category-progress-fill {
  height: 100%;
  border-radius: var(--radius-full);
  transition: width var(--transition-slow);
}

.category-progress-fill.green { background: var(--score-green); }
.category-progress-fill.yellow { background: var(--score-yellow); }
.category-progress-fill.orange { background: var(--score-orange); }
.category-progress-fill.red { background: var(--score-red); }
`;

// ============================================================================
// Runtime Validation Styles
// ============================================================================

export const RUNTIME_STYLES = `
/* Runtime Validation Section */
.runtime-section {
  margin-bottom: var(--space-2xl);
}

.runtime-card {
  background: var(--bg-card);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-lg);
  padding: var(--space-xl);
}

.runtime-header {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  margin-bottom: var(--space-lg);
}

.runtime-icon {
  width: 40px;
  height: 40px;
  background: linear-gradient(135deg, var(--brand-gradient-start), var(--brand-gradient-end));
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
}

.runtime-title {
  font-size: 1.125rem;
  font-weight: 600;
}

.runtime-subtitle {
  font-size: 0.875rem;
  color: var(--text-muted);
}

.runtime-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-md);
}

.runtime-metric {
  background: var(--bg-secondary);
  border-radius: var(--radius-lg);
  padding: var(--space-lg);
  text-align: center;
}

.runtime-metric-value {
  font-size: 2rem;
  font-weight: 700;
  margin-bottom: var(--space-xs);
}

.runtime-metric-value.green { color: var(--score-green); }
.runtime-metric-value.yellow { color: var(--score-yellow); }
.runtime-metric-value.orange { color: var(--score-orange); }
.runtime-metric-value.red { color: var(--score-red); }
.runtime-metric-value.brand { color: var(--brand-primary); }

.runtime-metric-label {
  font-size: 0.75rem;
  color: var(--text-muted);
}
`;

// ============================================================================
// Findings Section Styles
// ============================================================================

export const FINDINGS_STYLES = `
/* Findings Section */
.findings-section {
  margin-bottom: var(--space-2xl);
}

.findings-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-lg);
}

.findings-filters {
  display: flex;
  gap: var(--space-sm);
}

.filter-btn {
  padding: var(--space-xs) var(--space-md);
  background: var(--bg-card);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-md);
  font-size: 0.875rem;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.filter-btn:hover,
.filter-btn.active {
  background: var(--brand-primary);
  border-color: var(--brand-primary);
  color: white;
}

/* Finding Card */
.finding-card {
  background: var(--bg-card);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-lg);
  margin-bottom: var(--space-md);
  overflow: hidden;
  transition: all var(--transition-fast);
}

.finding-card:hover {
  border-color: var(--border-secondary);
}

.finding-card-header {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-md) var(--space-lg);
  cursor: pointer;
}

.finding-card-header:hover {
  background: var(--bg-card-hover);
}

.severity-badge {
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-sm);
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.severity-badge.critical {
  background: var(--color-critical);
  color: white;
}

.severity-badge.high {
  background: var(--color-high);
  color: white;
}

.severity-badge.medium {
  background: var(--color-medium);
  color: var(--text-inverse);
}

.severity-badge.low {
  background: var(--color-low);
  color: var(--text-inverse);
}

.severity-badge.info {
  background: var(--color-info);
  color: white;
}

.finding-title {
  flex: 1;
  font-weight: 500;
}

.finding-location {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.8rem;
  color: var(--text-muted);
}

.finding-expand-icon {
  color: var(--text-muted);
  transition: transform var(--transition-fast);
}

.finding-card.expanded .finding-expand-icon {
  transform: rotate(180deg);
}

.finding-card-body {
  display: none;
  padding: var(--space-lg);
  border-top: 1px solid var(--border-primary);
  background: var(--bg-secondary);
}

.finding-card.expanded .finding-card-body {
  display: block;
}

.finding-description {
  color: var(--text-secondary);
  margin-bottom: var(--space-md);
  line-height: 1.6;
}

/* Code Snippet */
.code-snippet {
  background: var(--bg-primary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-md);
  padding: var(--space-md);
  margin-bottom: var(--space-md);
  overflow-x: auto;
}

.code-snippet pre {
  margin: 0;
  font-size: 0.85rem;
  line-height: 1.6;
}

.code-snippet code {
  color: var(--text-primary);
}

.code-line {
  display: block;
  padding: 0 var(--space-sm);
}

.code-line.highlight {
  background: var(--color-critical-bg);
  border-left: 3px solid var(--color-critical);
  margin-left: -3px;
}

.code-line-number {
  display: inline-block;
  width: 40px;
  color: var(--text-muted);
  user-select: none;
}

/* Suggestion */
.finding-suggestion {
  background: rgba(139, 92, 246, 0.1);
  border-left: 3px solid var(--brand-primary);
  padding: var(--space-md);
  border-radius: 0 var(--radius-md) var(--radius-md) 0;
}

.finding-suggestion-label {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  color: var(--brand-primary);
  font-weight: 600;
  font-size: 0.875rem;
  margin-bottom: var(--space-sm);
}

.finding-suggestion-text {
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.finding-meta {
  display: flex;
  gap: var(--space-lg);
  margin-top: var(--space-md);
  padding-top: var(--space-md);
  border-top: 1px solid var(--border-primary);
}

.finding-meta-item {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  font-size: 0.8rem;
  color: var(--text-muted);
}

.finding-meta-item a {
  color: var(--brand-primary);
}
`;

// ============================================================================
// Footer Styles
// ============================================================================

export const FOOTER_STYLES = `
/* Footer */
.report-footer {
  text-align: center;
  padding-top: var(--space-xl);
  border-top: 1px solid var(--border-primary);
  color: var(--text-muted);
  font-size: 0.875rem;
}

.footer-powered-by {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  margin-top: var(--space-sm);
}

.footer-powered-by svg {
  width: 20px;
  height: 20px;
}
`;

// ============================================================================
// Print Styles
// ============================================================================

export const PRINT_STYLES = `
@media print {
  body {
    background: white !important;
    color: black !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  
  .report-container {
    max-width: none;
    padding: 0;
  }
  
  .btn, .header-actions, .theme-toggle {
    display: none !important;
  }
  
  .finding-card-body {
    display: block !important;
  }
  
  .score-section, .metrics-grid, .category-grid, .runtime-grid {
    break-inside: avoid;
  }
  
  .finding-card {
    break-inside: avoid;
    margin-bottom: 1rem;
  }
  
  @page {
    margin: 2cm;
  }
}
`;

// ============================================================================
// Animation Styles
// ============================================================================

export const ANIMATION_STYLES = `
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateX(-20px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

@keyframes countUp {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.animate-fade-in {
  animation: fadeIn 0.5s ease forwards;
}

.animate-slide-in {
  animation: slideIn 0.3s ease forwards;
}

.animate-pulse {
  animation: pulse 2s infinite;
}

/* Staggered animation delays */
.stagger-1 { animation-delay: 0.1s; }
.stagger-2 { animation-delay: 0.2s; }
.stagger-3 { animation-delay: 0.3s; }
.stagger-4 { animation-delay: 0.4s; }
.stagger-5 { animation-delay: 0.5s; }
`;

// ============================================================================
// Responsive Styles
// ============================================================================

export const RESPONSIVE_STYLES = `
@media (max-width: 1024px) {
  .score-section {
    grid-template-columns: 1fr;
  }
  
  .metrics-grid {
    grid-template-columns: repeat(3, 1fr);
  }
  
  .runtime-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .report-container {
    padding: var(--space-md);
  }
  
  .report-header {
    flex-direction: column;
    text-align: center;
    gap: var(--space-md);
  }
  
  .header-left {
    flex-direction: column;
  }
  
  .metrics-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  
  .reality-table-header,
  .reality-table-row {
    grid-template-columns: 1fr 1fr 80px;
    font-size: 0.85rem;
  }
  
  .category-grid {
    grid-template-columns: 1fr 1fr;
  }
  
  .runtime-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 480px) {
  .metrics-grid {
    grid-template-columns: 1fr;
  }
  
  .category-grid {
    grid-template-columns: 1fr;
  }
  
  .issue-counts {
    flex-wrap: wrap;
    justify-content: center;
  }
}
`;

// ============================================================================
// Export Combined Styles
// ============================================================================

export function getEnterpriseStyles(theme: 'dark' | 'light'): string {
  const themeVars = theme === 'dark' ? DARK_THEME_VARS : LIGHT_THEME_VARS;
  
  return [
    themeVars,
    BASE_STYLES,
    HEADER_STYLES,
    SCORE_STYLES,
    METRICS_STYLES,
    REALITY_TABLE_STYLES,
    BREAKDOWN_STYLES,
    CATEGORY_STYLES,
    RUNTIME_STYLES,
    FINDINGS_STYLES,
    FOOTER_STYLES,
    ANIMATION_STYLES,
    RESPONSIVE_STYLES,
    PRINT_STYLES,
  ].join('\n');
}
