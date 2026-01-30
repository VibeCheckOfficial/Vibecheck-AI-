/**
 * MCP UI Styles
 *
 * Self-contained CSS for MCP tool responses.
 * Designed to work in any MCP client with dark/light theme support.
 */

export const mcpStyles = `
<style>
  .vc-mcp {
    --vc-bg: #171717;
    --vc-bg-subtle: #1f1f1f;
    --vc-fg: #fafafa;
    --vc-fg-muted: #a1a1aa;
    --vc-fg-dim: #71717a;
    --vc-border: rgba(255, 255, 255, 0.1);
    --vc-brand: #00d4aa;
    --vc-success: #22c55e;
    --vc-warning: #f59e0b;
    --vc-error: #ef4444;
    --vc-info: #3b82f6;
    
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    font-size: 13px;
    line-height: 1.5;
    color: var(--vc-fg);
    background: var(--vc-bg);
    border: 1px solid var(--vc-border);
    border-radius: 8px;
    overflow: hidden;
    max-width: 600px;
  }
  
  @media (prefers-color-scheme: light) {
    .vc-mcp {
      --vc-bg: #ffffff;
      --vc-bg-subtle: #f4f4f5;
      --vc-fg: #09090b;
      --vc-fg-muted: #52525b;
      --vc-fg-dim: #a1a1aa;
      --vc-border: rgba(0, 0, 0, 0.1);
    }
  }
  
  .vc-mcp-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    background: var(--vc-bg-subtle);
    border-bottom: 1px solid var(--vc-border);
  }
  
  .vc-mcp-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;
    font-size: 14px;
  }
  
  .vc-mcp-icon {
    font-size: 16px;
  }
  
  .vc-mcp-version {
    font-size: 11px;
    color: var(--vc-fg-dim);
    font-family: monospace;
  }
  
  .vc-mcp-content {
    padding: 16px;
  }
  
  .vc-mcp-footer {
    padding: 12px 16px;
    background: var(--vc-bg-subtle);
    border-top: 1px solid var(--vc-border);
    font-size: 11px;
    color: var(--vc-fg-dim);
    display: flex;
    justify-content: space-between;
  }
  
  .vc-mcp-tabs {
    display: flex;
    border-bottom: 1px solid var(--vc-border);
    padding: 0 8px;
  }
  
  .vc-mcp-tab {
    padding: 8px 12px;
    font-size: 12px;
    color: var(--vc-fg-muted);
    border-bottom: 2px solid transparent;
    cursor: pointer;
  }
  
  .vc-mcp-tab.active {
    color: var(--vc-brand);
    border-bottom-color: var(--vc-brand);
  }
  
  .vc-mcp-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }
  
  .vc-mcp-table th {
    text-align: left;
    padding: 8px;
    font-weight: 500;
    color: var(--vc-fg-dim);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border-bottom: 1px solid var(--vc-border);
  }
  
  .vc-mcp-table td {
    padding: 8px;
    border-bottom: 1px solid var(--vc-border);
  }
  
  .vc-mcp-table tr:last-child td {
    border-bottom: none;
  }
  
  .vc-mcp-badge {
    display: inline-block;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 600;
    font-family: monospace;
  }
  
  .vc-mcp-badge.get { background: rgba(34, 197, 94, 0.15); color: #22c55e; }
  .vc-mcp-badge.post { background: rgba(59, 130, 246, 0.15); color: #3b82f6; }
  .vc-mcp-badge.put { background: rgba(245, 158, 11, 0.15); color: #f59e0b; }
  .vc-mcp-badge.delete { background: rgba(239, 68, 68, 0.15); color: #ef4444; }
  .vc-mcp-badge.patch { background: rgba(168, 85, 247, 0.15); color: #a855f7; }
  
  .vc-mcp-mono {
    font-family: monospace;
    font-size: 12px;
  }
  
  .vc-mcp-muted {
    color: var(--vc-fg-dim);
  }
  
  /* Verdict Styles */
  .vc-mcp-verdict {
    border-left: 4px solid;
  }
  
  .vc-mcp-verdict.blocked {
    border-left-color: var(--vc-error);
    background: linear-gradient(90deg, rgba(239, 68, 68, 0.1) 0%, var(--vc-bg) 50%);
  }
  
  .vc-mcp-verdict.warning {
    border-left-color: var(--vc-warning);
    background: linear-gradient(90deg, rgba(245, 158, 11, 0.1) 0%, var(--vc-bg) 50%);
  }
  
  .vc-mcp-verdict.allowed {
    border-left-color: var(--vc-success);
  }
  
  .vc-mcp-verdict-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px;
  }
  
  .vc-mcp-verdict-icon {
    font-size: 32px;
  }
  
  .vc-mcp-verdict-status {
    font-size: 18px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  
  .vc-mcp-verdict-status.blocked { color: var(--vc-error); }
  .vc-mcp-verdict-status.warning { color: var(--vc-warning); }
  .vc-mcp-verdict-status.allowed { color: var(--vc-success); }
  
  .vc-mcp-verdict-file {
    font-family: monospace;
    font-size: 13px;
    color: var(--vc-fg-muted);
  }
  
  .vc-mcp-violation {
    background: var(--vc-bg-subtle);
    border-radius: 6px;
    padding: 12px;
    margin-bottom: 8px;
  }
  
  .vc-mcp-violation:last-child {
    margin-bottom: 0;
  }
  
  .vc-mcp-violation-rule {
    display: inline-block;
    background: rgba(239, 68, 68, 0.15);
    color: var(--vc-error);
    font-size: 10px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 999px;
    margin-bottom: 8px;
  }
  
  .vc-mcp-violation-desc {
    font-size: 13px;
    color: var(--vc-fg-muted);
    margin-bottom: 8px;
  }
  
  .vc-mcp-violation-fix {
    font-family: monospace;
    font-size: 11px;
    background: var(--vc-bg);
    padding: 8px;
    border-radius: 4px;
    color: var(--vc-brand);
    overflow-x: auto;
  }
  
  .vc-mcp-steps {
    list-style: none;
    padding: 0;
    margin: 0;
    counter-reset: step;
  }
  
  .vc-mcp-step {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 0;
    border-bottom: 1px solid var(--vc-border);
    font-size: 13px;
    color: var(--vc-fg-muted);
  }
  
  .vc-mcp-step:last-child {
    border-bottom: none;
  }
  
  .vc-mcp-step::before {
    counter-increment: step;
    content: counter(step);
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--vc-bg-subtle);
    border-radius: 50%;
    font-size: 11px;
    font-weight: 500;
    flex-shrink: 0;
  }
  
  .vc-mcp-step.automated::before {
    background: var(--vc-brand);
    color: white;
  }
  
  .vc-mcp-step.automated {
    color: var(--vc-fg);
  }
  
  /* Stats Grid */
  .vc-mcp-stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }
  
  .vc-mcp-stat {
    background: var(--vc-bg-subtle);
    border-radius: 6px;
    padding: 12px;
    text-align: center;
  }
  
  .vc-mcp-stat-value {
    font-size: 20px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  
  .vc-mcp-stat-label {
    font-size: 10px;
    color: var(--vc-fg-dim);
    margin-top: 4px;
  }
  
  /* Context Layer */
  .vc-mcp-layer {
    background: var(--vc-bg-subtle);
    border-radius: 6px;
    padding: 12px;
    margin-bottom: 8px;
  }
  
  .vc-mcp-layer:last-child {
    margin-bottom: 0;
  }
  
  .vc-mcp-layer-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }
  
  .vc-mcp-layer-name {
    font-weight: 500;
    font-size: 13px;
  }
  
  .vc-mcp-layer-meta {
    font-size: 11px;
    color: var(--vc-fg-dim);
  }
  
  .vc-mcp-layer-items {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  
  .vc-mcp-layer-item {
    background: var(--vc-bg);
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-family: monospace;
    color: var(--vc-fg-muted);
  }
</style>`;

/**
 * Get inline styles as a string (without style tags)
 */
export function getMcpInlineStyles(): string {
  return mcpStyles.replace(/<\/?style>/g, '');
}
