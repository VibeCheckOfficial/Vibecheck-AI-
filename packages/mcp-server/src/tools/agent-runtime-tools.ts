/**
 * Agent Runtime MCP Tools
 * 
 * BYO-Agent mode: External agents can use these tools to leverage VibeCheck
 * as the truth layer. They can plan however they want, but VibeCheck returns
 * receipts and deterministic verdicts.
 * 
 * TODO: These tools require the full LangGraph integration in @vibecheck/core
 * which is not yet implemented. The types are defined but the runtime functions
 * need to be built.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  type Receipt,
  type ShipGateResult,
  SAFETY_LIMITS,
} from '@vibecheck/core/agent-runtime';

/**
 * Register agent runtime tools with the MCP server.
 * 
 * Currently a no-op while the full runtime is being implemented.
 * The following tools will be available once complete:
 * - vibecheck_reality_plan - Generate proof plans
 * - vibecheck_reality_run - Execute runtime verification
 * - vibecheck_chaos_run - Execute chaos testing
 * - vibecheck_receipts_list - List evidence receipts
 * - vibecheck_receipts_get - Get receipt details
 * - vibecheck_ship_evaluate - Evaluate ship readiness
 * - vibecheck_fix_run - Run AutoFix
 * - vibecheck_scan_run - Run static analysis
 * - vibecheck_diff_summary - Get diff summary
 */
export function registerAgentRuntimeTools(_server: McpServer): void {
  // Agent runtime tools are currently disabled pending full implementation.
  // The LangGraph integration and evidence store need to be completed first.
  // 
  // See packages/core/src/agent-runtime/types.ts for the full API spec.
  //
  // For now, use the existing tools:
  // - vibecheck_truthpack_* for truth layer
  // - vibecheck_firewall_* for code firewall
  // - vibecheck_validate_* for validation
  // - vibecheck_context_* for context gathering
  
  // Log that agent runtime tools are not yet available
  console.error('[VibeCheck MCP] Agent runtime tools not yet available - using core tools only');
}

// Re-export types for external use
export type { Receipt, ShipGateResult };
export { SAFETY_LIMITS };
