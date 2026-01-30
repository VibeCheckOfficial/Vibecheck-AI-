/**
 * MCP Response Builder
 *
 * Generates styled HTML responses for MCP tools.
 * Includes comprehensive HTML sanitization and XSS prevention.
 *
 * @module response-builder
 * @security All user content is sanitized to prevent XSS attacks
 */

import { mcpStyles } from './styles.js';

// ============================================
// TYPES
// ============================================

export interface TruthpackSection {
  name: string;
  count: number;
  items: Array<{
    method?: string;
    path?: string;
    name?: string;
    type?: string;
    file?: string;
  }>;
}

export interface Truthpack {
  routes: TruthpackSection;
  envVars: TruthpackSection;
  auth: TruthpackSection;
  contracts: TruthpackSection;
  types: TruthpackSection;
  version: string;
  generatedAt: string;
}

export interface FirewallViolation {
  rule: string;
  description: string;
  file?: string;
  line?: number;
  fix?: string;
  autoFixable: boolean;
}

export interface FirewallVerdict {
  status: 'blocked' | 'warning' | 'allowed';
  file: string;
  violations: FirewallViolation[];
  unblockPlan: Array<{
    description: string;
    automated: boolean;
    command?: string;
  }>;
}

export interface ContextLayer {
  name: string;
  type: string;
  items: string[];
  tokens: number;
}

export interface ContextResult {
  file: string;
  layers: ContextLayer[];
  totalTokens: number;
  freshness: number;
}

// ============================================
// SECURITY UTILITIES
// ============================================

/**
 * HTML entities for escaping
 */
const HTML_ENTITIES: Readonly<Record<string, string>> = Object.freeze({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '/': '&#x2F;',
  '`': '&#x60;',
  '=': '&#x3D;',
});

/**
 * Escape HTML to prevent XSS attacks
 * @param unsafe - Potentially unsafe string
 * @returns Escaped safe string
 */
function escapeHtml(unsafe: unknown): string {
  if (unsafe === null || unsafe === undefined) {
    return '';
  }

  const str = String(unsafe);
  return str.replace(/[&<>"'`=/]/g, (char) => HTML_ENTITIES[char] ?? char);
}

/**
 * Sanitize and truncate a string
 * @param str - String to sanitize
 * @param maxLength - Maximum length
 * @returns Sanitized and truncated string
 */
function sanitizeString(str: unknown, maxLength = 500): string {
  if (str === null || str === undefined) {
    return '';
  }

  let sanitized = String(str);

  // Remove null bytes and control characters
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // Truncate if too long
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength - 3) + '...';
  }

  return sanitized;
}

/**
 * Validate and sanitize a URL
 * @param url - URL to validate
 * @returns Sanitized URL or empty string if unsafe
 */
function sanitizeUrl(url: unknown): string {
  if (typeof url !== 'string') {
    return '';
  }

  const trimmed = url.trim().toLowerCase();

  // Block dangerous protocols
  const dangerousProtocols = ['javascript:', 'data:', 'vbscript:', 'file:'];
  for (const protocol of dangerousProtocols) {
    if (trimmed.startsWith(protocol)) {
      return '';
    }
  }

  return escapeHtml(url);
}

/**
 * Validate a number and return a safe value
 * @param num - Number to validate
 * @param defaultValue - Default if invalid
 * @param min - Minimum value
 * @param max - Maximum value
 * @returns Safe number
 */
function safeNumber(
  num: unknown,
  defaultValue = 0,
  min = 0,
  max = Number.MAX_SAFE_INTEGER
): number {
  if (typeof num !== 'number' || !Number.isFinite(num)) {
    return defaultValue;
  }
  return Math.min(max, Math.max(min, Math.floor(num)));
}

/**
 * Validate an HTTP method
 * @param method - Method to validate
 * @returns Validated method or 'GET'
 */
function validateMethod(method: unknown): string {
  const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'];
  const upper = String(method ?? 'GET').toUpperCase();
  return validMethods.includes(upper) ? upper : 'GET';
}

/**
 * Validate a status type
 * @param status - Status to validate
 * @returns Validated status
 */
function validateStatus(status: unknown): 'blocked' | 'warning' | 'allowed' {
  const validStatuses = ['blocked', 'warning', 'allowed'];
  const lower = String(status ?? 'allowed').toLowerCase();
  return validStatuses.includes(lower) ? (lower as 'blocked' | 'warning' | 'allowed') : 'allowed';
}

/**
 * Validate a date string
 * @param dateStr - Date string to validate
 * @returns Valid date string or current date
 */
function validateDate(dateStr: unknown): string {
  if (typeof dateStr !== 'string') {
    return new Date().toISOString();
  }

  try {
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) {
      return new Date().toISOString();
    }
    return date.toLocaleString();
  } catch {
    return new Date().toISOString();
  }
}

// ============================================
// BUILDERS
// ============================================

/**
 * Build HTML for truthpack viewer
 * @param truthpack - Truthpack data
 * @returns Safe HTML string
 */
export function buildTruthpackViewerHtml(truthpack: Truthpack): string {
  // Validate inputs
  const version = escapeHtml(sanitizeString(truthpack?.version ?? '1.0.0', 20));
  const generatedAt = validateDate(truthpack?.generatedAt);

  // Build sections with validation
  const sections = [
    { key: 'routes', label: 'Routes', icon: '🔗' },
    { key: 'envVars', label: 'Env Vars', icon: '🔑' },
    { key: 'auth', label: 'Auth', icon: '🛡️' },
    { key: 'contracts', label: 'Contracts', icon: '📝' },
    { key: 'types', label: 'Types', icon: '📋' },
  ];

  const tabsHtml = sections
    .map((s, i) => {
      const section = truthpack?.[s.key as keyof Truthpack] as TruthpackSection | undefined;
      const count = safeNumber(section?.count, 0, 0, 99999);
      const active = i === 0 ? ' active' : '';
      return `<div class="vc-mcp-tab${active}">${s.icon} ${escapeHtml(s.label)} (${count})</div>`;
    })
    .join('');

  // Build routes table (primary view) with validation
  const routes = Array.isArray(truthpack?.routes?.items) ? truthpack.routes.items : [];
  const validRoutes = routes.slice(0, 15).filter((r) => r && typeof r === 'object');

  const routesHtml =
    validRoutes.length > 0
      ? `<table class="vc-mcp-table">
          <thead>
            <tr>
              <th>Method</th>
              <th>Path</th>
              <th>Handler</th>
            </tr>
          </thead>
          <tbody>
            ${validRoutes
              .map((r) => {
                const method = validateMethod(r.method);
                const path = escapeHtml(sanitizeString(r.path, 100));
                const file = escapeHtml(sanitizeString(r.file, 100));
                return `
              <tr>
                <td><span class="vc-mcp-badge ${method.toLowerCase()}">${method}</span></td>
                <td class="vc-mcp-mono">${path}</td>
                <td class="vc-mcp-mono vc-mcp-muted">${file}</td>
              </tr>
            `;
              })
              .join('')}
          </tbody>
        </table>
        ${routes.length > 15 ? `<div class="vc-mcp-muted" style="padding: 8px; font-size: 11px;">... and ${safeNumber(routes.length - 15)} more</div>` : ''}`
      : '<div style="padding: 16px; text-align: center; color: var(--vc-fg-dim);">No routes found</div>';

  const routeCount = safeNumber(truthpack?.routes?.count, 0);
  const envVarCount = safeNumber(truthpack?.envVars?.count, 0);
  const typeCount = safeNumber(truthpack?.types?.count, 0);

  return `
${mcpStyles}
<div class="vc-mcp">
  <div class="vc-mcp-header">
    <div class="vc-mcp-title">
      <span class="vc-mcp-icon">📋</span>
      <span>Truthpack Viewer</span>
    </div>
    <span class="vc-mcp-version">v${version}</span>
  </div>
  
  <div class="vc-mcp-tabs">
    ${tabsHtml}
  </div>
  
  <div class="vc-mcp-content">
    ${routesHtml}
  </div>
  
  <div class="vc-mcp-footer">
    <span>Generated: ${generatedAt}</span>
    <span>${routeCount} routes • ${envVarCount} env vars • ${typeCount} types</span>
  </div>
</div>`;
}

/**
 * Build HTML for firewall verdict
 * @param verdict - Firewall verdict data
 * @returns Safe HTML string
 */
export function buildFirewallResultHtml(verdict: FirewallVerdict): string {
  // Validate status
  const status = validateStatus(verdict?.status);
  const file = escapeHtml(sanitizeString(verdict?.file ?? 'unknown', 200));

  const statusIcons: Record<string, string> = {
    blocked: '🛑',
    warning: '⚠️',
    allowed: '✅',
  };

  // Validate and sanitize violations
  const violations = Array.isArray(verdict?.violations) ? verdict.violations : [];
  const validViolations = violations
    .slice(0, 20) // Limit to 20 violations
    .filter((v) => v && typeof v === 'object');

  const violationsHtml =
    validViolations.length > 0
      ? validViolations
          .map((v) => {
            const rule = escapeHtml(sanitizeString(v.rule, 50));
            const description = escapeHtml(sanitizeString(v.description, 200));
            const fix = v.fix ? escapeHtml(sanitizeString(v.fix, 200)) : '';

            return `
        <div class="vc-mcp-violation">
          <div class="vc-mcp-violation-rule">${rule}</div>
          <div class="vc-mcp-violation-desc">${description}</div>
          ${fix ? `<div class="vc-mcp-violation-fix">${fix}</div>` : ''}
        </div>
      `;
          })
          .join('')
      : '<div style="padding: 16px; text-align: center; color: var(--vc-success);">✓ No violations</div>';

  // Validate and sanitize unblock plan
  const unblockPlan = Array.isArray(verdict?.unblockPlan) ? verdict.unblockPlan : [];
  const validSteps = unblockPlan
    .slice(0, 10) // Limit to 10 steps
    .filter((s) => s && typeof s === 'object');

  const stepsHtml =
    status !== 'allowed' && validSteps.length > 0
      ? `
      <div style="padding: 16px; border-top: 1px solid var(--vc-border);">
        <div style="font-weight: 600; margin-bottom: 12px;">🔓 Unblock Plan</div>
        <ol class="vc-mcp-steps">
          ${validSteps
            .map((step) => {
              const description = escapeHtml(sanitizeString(step.description, 200));
              const automated = Boolean(step.automated);
              return `<li class="vc-mcp-step${automated ? ' automated' : ''}">${description}</li>`;
            })
            .join('')}
        </ol>
      </div>
    `
      : '';

  return `
${mcpStyles}
<div class="vc-mcp vc-mcp-verdict ${status}">
  <div class="vc-mcp-verdict-header">
    <div class="vc-mcp-verdict-icon">${statusIcons[status]}</div>
    <div>
      <div class="vc-mcp-verdict-status ${status}">${status.toUpperCase()}</div>
      <div class="vc-mcp-verdict-file">${file}</div>
    </div>
  </div>
  
  <div class="vc-mcp-content">
    <div style="font-weight: 500; margin-bottom: 12px;">Violations (${safeNumber(validViolations.length)})</div>
    ${violationsHtml}
  </div>
  
  ${stepsHtml}
</div>`;
}

/**
 * Build HTML for context preview
 * @param context - Context data
 * @returns Safe HTML string
 */
export function buildContextPreviewHtml(context: ContextResult): string {
  // Validate inputs
  const file = escapeHtml(sanitizeString(context?.file ?? 'unknown', 100));
  const totalTokens = safeNumber(context?.totalTokens, 0, 0, 1_000_000);
  const freshness = safeNumber(context?.freshness, 0, 0, 100);

  // Validate layers
  const layers = Array.isArray(context?.layers) ? context.layers : [];
  const validLayers = layers
    .slice(0, 10) // Limit to 10 layers
    .filter((l) => l && typeof l === 'object');

  const layerIcons: Record<string, string> = {
    truthpack: '📋',
    file: '📄',
    convention: '✨',
    type: '📝',
    import: '📦',
  };

  const layersHtml = validLayers
    .map((layer) => {
      const name = escapeHtml(sanitizeString(layer.name, 50));
      const type = sanitizeString(layer.type, 20);
      const tokens = safeNumber(layer.tokens, 0, 0, 100_000);
      const items = Array.isArray(layer.items) ? layer.items : [];
      const validItems = items.slice(0, 8).map((item) => escapeHtml(sanitizeString(item, 50)));
      const icon = layerIcons[type] ?? '📁';

      return `
    <div class="vc-mcp-layer">
      <div class="vc-mcp-layer-header">
        <div class="vc-mcp-layer-name">${icon} ${name}</div>
        <div class="vc-mcp-layer-meta">${validItems.length} items • ${tokens.toLocaleString()} tokens</div>
      </div>
      ${
        validItems.length > 0
          ? `
        <div class="vc-mcp-layer-items">
          ${validItems.map((item) => `<span class="vc-mcp-layer-item">${item}</span>`).join('')}
          ${items.length > 8 ? `<span class="vc-mcp-layer-item">+${safeNumber(items.length - 8)} more</span>` : ''}
        </div>
      `
          : ''
      }
    </div>
  `;
    })
    .join('');

  const freshnessColor =
    freshness >= 80 ? 'var(--vc-success)' : freshness >= 50 ? 'var(--vc-warning)' : 'var(--vc-error)';

  return `
${mcpStyles}
<div class="vc-mcp">
  <div class="vc-mcp-header">
    <div class="vc-mcp-title">
      <span class="vc-mcp-icon">📄</span>
      <span>Context for ${file}</span>
    </div>
    <span style="color: ${freshnessColor}; font-size: 12px;">${freshness}% fresh</span>
  </div>
  
  <div class="vc-mcp-content">
    ${layersHtml || '<div style="padding: 16px; text-align: center; color: var(--vc-fg-dim);">No context layers</div>'}
  </div>
  
  <div class="vc-mcp-footer">
    <span>${validLayers.length} layers</span>
    <span>${totalTokens.toLocaleString()} total tokens</span>
  </div>
</div>`;
}

/**
 * Build HTML for stats summary
 * @param stats - Statistics data
 * @returns Safe HTML string
 */
export function buildStatsHtml(stats: {
  totalChecks: number;
  blocked: number;
  allowed: number;
  warnings?: number;
}): string {
  // Validate all numbers
  const totalChecks = safeNumber(stats?.totalChecks, 0, 0, 1_000_000_000);
  const blocked = safeNumber(stats?.blocked, 0, 0, 1_000_000_000);
  const allowed = safeNumber(stats?.allowed, 0, 0, 1_000_000_000);

  return `
${mcpStyles}
<div class="vc-mcp">
  <div class="vc-mcp-header">
    <div class="vc-mcp-title">
      <span class="vc-mcp-icon">📊</span>
      <span>Firewall Statistics</span>
    </div>
  </div>
  
  <div class="vc-mcp-content">
    <div class="vc-mcp-stats">
      <div class="vc-mcp-stat">
        <div class="vc-mcp-stat-value">${totalChecks.toLocaleString()}</div>
        <div class="vc-mcp-stat-label">Total Checks</div>
      </div>
      <div class="vc-mcp-stat">
        <div class="vc-mcp-stat-value" style="color: var(--vc-error);">${blocked.toLocaleString()}</div>
        <div class="vc-mcp-stat-label">Blocked</div>
      </div>
      <div class="vc-mcp-stat">
        <div class="vc-mcp-stat-value" style="color: var(--vc-success);">${allowed.toLocaleString()}</div>
        <div class="vc-mcp-stat-label">Allowed</div>
      </div>
    </div>
  </div>
</div>`;
}

/**
 * Build a simple message HTML
 * @param message - Message text
 * @param type - Message type
 * @returns Safe HTML string
 */
export function buildMessageHtml(
  message: string,
  type: 'info' | 'success' | 'warning' | 'error' = 'info'
): string {
  const icons: Record<string, string> = {
    info: 'ℹ️',
    success: '✅',
    warning: '⚠️',
    error: '❌',
  };

  const sanitizedMessage = escapeHtml(sanitizeString(message, 500));
  const icon = icons[type] ?? icons.info;

  return `
${mcpStyles}
<div class="vc-mcp">
  <div class="vc-mcp-content" style="text-align: center; padding: 24px;">
    <div style="font-size: 32px; margin-bottom: 12px;">${icon}</div>
    <div>${sanitizedMessage}</div>
  </div>
</div>`;
}

/**
 * Build an error HTML response
 * @param error - Error message or Error object
 * @returns Safe HTML string
 */
export function buildErrorHtml(error: unknown): string {
  let message: string;

  if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === 'string') {
    message = error;
  } else {
    message = 'An unknown error occurred';
  }

  return buildMessageHtml(message, 'error');
}
