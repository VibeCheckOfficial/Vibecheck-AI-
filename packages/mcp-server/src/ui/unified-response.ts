/**
 * Unified Response Builder for MCP Tools
 *
 * Generates responses with multiple format options:
 * - JSON: Structured data for programmatic use
 * - Text: Pretty formatted output for display
 * - HTML: Rich styled output for supporting clients
 *
 * @module unified-response
 */

import * as fmt from './text-formatters.js';
import { mcpStyles } from './styles.js';
import {
  buildTruthpackViewerHtml,
  buildFirewallResultHtml,
  buildContextPreviewHtml,
  buildStatsHtml,
  buildMessageHtml,
  type Truthpack,
  type FirewallVerdict,
  type ContextResult,
} from './response-builder.js';

// ============================================
// TYPES
// ============================================

export interface UnifiedResponse {
  /** Structured JSON data */
  data: Record<string, unknown>;
  /** Pretty text format for display */
  text: string;
  /** HTML format for rich clients (optional) */
  html?: string;
}

export type ResponseFormat = 'json' | 'text' | 'html' | 'all';

// ============================================
// FIREWALL RESPONSES
// ============================================

export interface FirewallEvaluateData {
  allowed: boolean;
  action: string;
  target: string;
  claims?: Array<{
    type: string;
    value: string;
    verified: boolean;
  }>;
  violations?: Array<{
    policy: string;
    message: string;
  }>;
  unblockPlan?: Array<{
    description: string;
    automated: boolean;
  }>;
  duration?: number;
}

/**
 * Format firewall evaluation response
 */
export function formatFirewallEvaluate(data: FirewallEvaluateData): UnifiedResponse {
  const status = data.allowed ? 'allowed' : 'blocked';

  // Build text output
  const textParts: string[] = [];

  // Header
  textParts.push(
    fmt.headerBox(
      data.allowed ? fmt.ICONS.success : fmt.ICONS.blocked,
      'FIREWALL EVALUATION',
      `Status: ${status.toUpperCase()}`,
      50
    )
  );

  textParts.push('');

  // File info
  textParts.push(fmt.keyValue([
    ['Action', data.action],
    ['Target', data.target],
    ['Result', data.allowed ? '✓ Allowed' : '✗ Blocked'],
  ]));

  // Claims verified
  if (data.claims && data.claims.length > 0) {
    textParts.push('');
    textParts.push(fmt.section('Claims Verified', '', fmt.ICONS.check));
    
    const claimTree = data.claims.map((c) => ({
      label: `${c.value}`,
      icon: c.verified ? '✓' : '✗',
    }));
    textParts.push(fmt.tree(claimTree));
  }

  // Violations
  if (data.violations && data.violations.length > 0) {
    textParts.push('');
    textParts.push(fmt.section('Violations', '', fmt.ICONS.error));
    
    for (const v of data.violations) {
      textParts.push(`  ${fmt.ICONS.arrowRight} [${v.policy}] ${v.message}`);
    }
  }

  // Unblock plan
  if (data.unblockPlan && data.unblockPlan.length > 0 && !data.allowed) {
    textParts.push('');
    textParts.push(fmt.section('Unblock Plan', '', fmt.ICONS.unlock));
    
    const steps = data.unblockPlan.map(
      (s, i) => `${s.automated ? '⚡' : '👤'} ${s.description}`
    );
    textParts.push(fmt.numberedList(steps));
  }

  // Duration
  if (data.duration) {
    textParts.push('');
    textParts.push(`${fmt.ICONS.clock} Checked in ${fmt.duration(data.duration)}`);
  }

  // Build HTML (using existing builder)
  const htmlVerdict: FirewallVerdict = {
    status: data.allowed ? 'allowed' : data.violations?.length ? 'blocked' : 'warning',
    file: data.target,
    violations: (data.violations ?? []).map((v) => ({
      rule: v.policy,
      description: v.message,
      autoFixable: false,
    })),
    unblockPlan: (data.unblockPlan ?? []).map((s) => ({
      description: s.description,
      automated: s.automated,
    })),
  };

  return {
    data: data as unknown as Record<string, unknown>,
    text: textParts.join('\n'),
    html: buildFirewallResultHtml(htmlVerdict),
  };
}

/**
 * Format firewall status response
 */
export function formatFirewallStatus(data: {
  enabled: boolean;
  mode: string;
  modeDescription: string;
  statistics: {
    totalChecks: number;
    blocked: number;
    allowed: number;
    blockRate: string;
  };
}): UnifiedResponse {
  const modeIcons: Record<string, string> = {
    observe: '👁️',
    enforce: fmt.ICONS.shield,
    lockdown: fmt.ICONS.lock,
  };

  const textParts: string[] = [];

  // Header
  textParts.push(
    fmt.headerBox(fmt.ICONS.shield, 'FIREWALL STATUS', data.mode.toUpperCase(), 50)
  );

  textParts.push('');

  // Status
  textParts.push(fmt.keyValue([
    ['Status', data.enabled ? '✓ Active' : '✗ Disabled'],
    ['Mode', `${modeIcons[data.mode] ?? ''} ${data.mode}`],
    ['Description', data.modeDescription],
  ]));

  textParts.push('');

  // Stats grid
  textParts.push(fmt.section('Statistics', '', fmt.ICONS.chart));
  textParts.push('');
  textParts.push(
    fmt.statsGrid([
      { label: 'Total Checks', value: data.statistics.totalChecks, icon: '📊' },
      { label: 'Blocked', value: data.statistics.blocked, icon: '🛑' },
      { label: 'Allowed', value: data.statistics.allowed, icon: '✅' },
    ])
  );
  textParts.push('');
  textParts.push(`  Block Rate: ${data.statistics.blockRate}`);

  // Build HTML
  const html = buildStatsHtml({
    totalChecks: data.statistics.totalChecks,
    blocked: data.statistics.blocked,
    allowed: data.statistics.allowed,
  });

  return {
    data: data as unknown as Record<string, unknown>,
    text: textParts.join('\n'),
    html,
  };
}

/**
 * Format quick check response
 */
export function formatQuickCheck(data: {
  safe: boolean;
  concerns: string[];
}): UnifiedResponse {
  const textParts: string[] = [];

  // Header
  const icon = data.safe ? fmt.ICONS.success : fmt.ICONS.warning;
  const status = data.safe ? 'SAFE' : 'CONCERNS FOUND';

  textParts.push(fmt.headerBox(icon, 'QUICK CHECK', status, 40));

  if (data.concerns.length > 0) {
    textParts.push('');
    textParts.push(fmt.section('Concerns', '', fmt.ICONS.warning));
    textParts.push(fmt.bulletList(data.concerns, '⚠️'));
  } else {
    textParts.push('');
    textParts.push('  ✓ No issues detected');
  }

  return {
    data: data as unknown as Record<string, unknown>,
    text: textParts.join('\n'),
    html: buildMessageHtml(
      data.safe ? 'No issues detected' : `Found ${data.concerns.length} concerns`,
      data.safe ? 'success' : 'warning'
    ),
  };
}

// ============================================
// TRUTHPACK RESPONSES
// ============================================

export interface TruthpackGenerateData {
  success: boolean;
  generated: string[];
  results: Record<string, { count?: number; note?: string }>;
  errors?: string[];
  timestamp: string;
}

/**
 * Format truthpack generate response
 */
export function formatTruthpackGenerate(data: TruthpackGenerateData): UnifiedResponse {
  const textParts: string[] = [];

  // Header
  const icon = data.success ? fmt.ICONS.success : fmt.ICONS.warning;
  textParts.push(
    fmt.headerBox(fmt.ICONS.truthpack, 'TRUTHPACK GENERATED', data.success ? 'Success' : 'With Errors', 50)
  );

  textParts.push('');

  // Results table
  const tableData = Object.entries(data.results).map(([scanner, result]) => ({
    scanner: scanner.charAt(0).toUpperCase() + scanner.slice(1),
    count: result.count ?? 0,
    note: result.note ?? '-',
  }));

  textParts.push(
    fmt.table(
      [
        { header: 'Scanner', key: 'scanner', width: 15 },
        { header: 'Count', key: 'count', width: 10, align: 'right' as const },
        { header: 'Note', key: 'note', width: 20 },
      ],
      tableData
    )
  );

  // Errors
  if (data.errors && data.errors.length > 0) {
    textParts.push('');
    textParts.push(fmt.section('Errors', '', fmt.ICONS.error));
    textParts.push(fmt.bulletList(data.errors, '❌'));
  }

  textParts.push('');
  textParts.push(fmt.timestamp(data.timestamp));

  return {
    data: data as unknown as Record<string, unknown>,
    text: textParts.join('\n'),
  };
}

/**
 * Format truthpack query response
 */
export function formatTruthpackQuery(data: {
  category: string;
  filter?: string;
  results: unknown[];
  count: number;
  error?: string;
}): UnifiedResponse {
  const textParts: string[] = [];

  // Header
  const categoryIcons: Record<string, string> = {
    routes: fmt.ICONS.route,
    env: fmt.ICONS.key,
    auth: fmt.ICONS.shield,
    contracts: '📝',
    types: '📋',
  };

  textParts.push(
    fmt.headerBox(
      categoryIcons[data.category] ?? fmt.ICONS.truthpack,
      `TRUTHPACK: ${data.category.toUpperCase()}`,
      `${data.count} items`,
      50
    )
  );

  if (data.filter) {
    textParts.push(`  Filter: ${data.filter}`);
  }

  textParts.push('');

  if (data.error) {
    textParts.push(`  ${fmt.ICONS.error} ${data.error}`);
  } else if (data.count === 0) {
    textParts.push('  No items found');
  } else {
    // Format results based on category
    if (data.category === 'routes') {
      const routes = data.results as Array<{ method: string; path: string; file?: string }>;
      textParts.push(
        fmt.table(
          [
            { header: 'Method', key: 'method', width: 8 },
            { header: 'Path', key: 'path', width: 25 },
            { header: 'Handler', key: 'file', width: 20 },
          ],
          routes.slice(0, 15).map((r) => ({
            method: r.method,
            path: r.path,
            file: r.file ?? '-',
          }))
        )
      );
    } else if (data.category === 'env') {
      const vars = data.results as Array<{ name: string; required?: boolean; sensitive?: boolean }>;
      textParts.push(
        fmt.table(
          [
            { header: 'Variable', key: 'name', width: 25 },
            { header: 'Required', key: 'required', width: 10 },
            { header: 'Sensitive', key: 'sensitive', width: 10 },
          ],
          vars.slice(0, 15).map((v) => ({
            name: v.name,
            required: v.required ? '✓' : '-',
            sensitive: v.sensitive ? '🔒' : '-',
          }))
        )
      );
    } else {
      // Generic list
      const items = data.results.slice(0, 10);
      textParts.push(
        fmt.tree(
          items.map((item) => ({
            label: typeof item === 'object' && item !== null
              ? JSON.stringify(item).slice(0, 50)
              : String(item),
          }))
        )
      );
    }

    if (data.count > 15) {
      textParts.push(`\n  ... and ${data.count - 15} more`);
    }
  }

  return {
    data: data as unknown as Record<string, unknown>,
    text: textParts.join('\n'),
  };
}

/**
 * Format routes response
 */
export function formatRoutes(data: {
  routes: Array<{ method: string; path: string; file?: string; auth?: { required: boolean } }>;
  filters: { method?: string; path?: string };
  count: number;
  error?: string;
}): UnifiedResponse {
  const textParts: string[] = [];

  textParts.push(
    fmt.headerBox(fmt.ICONS.route, 'API ROUTES', `${data.count} routes`, 55)
  );

  if (data.filters.method || data.filters.path) {
    textParts.push('');
    textParts.push(`  Filters: ${data.filters.method ? `Method=${data.filters.method}` : ''} ${data.filters.path ? `Path=${data.filters.path}` : ''}`);
  }

  textParts.push('');

  if (data.error) {
    textParts.push(`  ${fmt.ICONS.error} ${data.error}`);
  } else if (data.routes.length === 0) {
    textParts.push('  No routes found');
  } else {
    // Group by method
    const byMethod: Record<string, typeof data.routes> = {};
    for (const route of data.routes) {
      if (!byMethod[route.method]) byMethod[route.method] = [];
      byMethod[route.method]?.push(route);
    }

    for (const [method, routes] of Object.entries(byMethod)) {
      textParts.push(`\n${fmt.httpMethod(method)} (${routes.length})`);
      for (const route of routes.slice(0, 5)) {
        const auth = route.auth?.required ? ' 🔒' : '';
        textParts.push(`  ${fmt.BOX.treeEnd} ${route.path}${auth}`);
      }
      if (routes.length > 5) {
        textParts.push(`     ... and ${routes.length - 5} more`);
      }
    }
  }

  return {
    data: data as unknown as Record<string, unknown>,
    text: textParts.join('\n'),
  };
}

// ============================================
// GENERIC RESPONSES
// ============================================

/**
 * Format a success message
 */
export function formatSuccess(message: string, details?: Record<string, unknown>): UnifiedResponse {
  const textParts: string[] = [];

  textParts.push(`${fmt.ICONS.success} ${message}`);

  if (details) {
    textParts.push('');
    const pairs = Object.entries(details).map(([k, v]) => [k, String(v)] as [string, string]);
    textParts.push(fmt.keyValue(pairs));
  }

  return {
    data: { success: true, message, ...details },
    text: textParts.join('\n'),
    html: buildMessageHtml(message, 'success'),
  };
}

/**
 * Format an error message
 */
export function formatError(error: string | Error, context?: Record<string, unknown>): UnifiedResponse {
  const message = error instanceof Error ? error.message : error;
  const textParts: string[] = [];

  textParts.push(fmt.headerBox(fmt.ICONS.error, 'ERROR', '', 40));
  textParts.push('');
  textParts.push(`  ${message}`);

  if (context) {
    textParts.push('');
    textParts.push(fmt.section('Context', '', fmt.ICONS.info));
    const pairs = Object.entries(context).map(([k, v]) => [k, String(v)] as [string, string]);
    textParts.push(fmt.keyValue(pairs));
  }

  return {
    data: { success: false, error: message, ...context },
    text: textParts.join('\n'),
    html: buildMessageHtml(message, 'error'),
  };
}

/**
 * Format info message
 */
export function formatInfo(title: string, content: Record<string, unknown>): UnifiedResponse {
  const textParts: string[] = [];

  textParts.push(fmt.headerBox(fmt.ICONS.info, title, '', 45));
  textParts.push('');

  const pairs = Object.entries(content).map(([k, v]) => [k, String(v)] as [string, string]);
  textParts.push(fmt.keyValue(pairs));

  return {
    data: content,
    text: textParts.join('\n'),
    html: buildMessageHtml(title, 'info'),
  };
}

// ============================================
// RESPONSE WRAPPER
// ============================================

/**
 * Build MCP tool response with multiple formats
 */
export function buildResponse(
  response: UnifiedResponse,
  format: ResponseFormat = 'all'
): { content: Array<{ type: string; text: string }> } {
  const content: Array<{ type: string; text: string }> = [];

  if (format === 'json' || format === 'all') {
    // Always include JSON for programmatic use
    content.push({
      type: 'text',
      text: JSON.stringify(response.data, null, 2),
    });
  }

  if (format === 'text' || format === 'all') {
    // Add formatted text
    content.push({
      type: 'text',
      text: `\n---\n${response.text}\n---`,
    });
  }

  if ((format === 'html' || format === 'all') && response.html) {
    // Add HTML for rich clients
    content.push({
      type: 'text',
      text: `<!-- HTML_RENDER -->\n${response.html}`,
    });
  }

  return { content };
}

/**
 * Build simple text response (for backwards compatibility)
 */
export function buildTextResponse(text: string): { content: Array<{ type: string; text: string }> } {
  return {
    content: [{
      type: 'text',
      text,
    }],
  };
}
