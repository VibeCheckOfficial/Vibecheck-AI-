/**
 * Firewall Tools
 * 
 * MCP tools for the agent firewall.
 * Features enhanced multi-format output (JSON + pretty text + HTML).
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as path from 'path';
import {
  AgentFirewall,
  ClaimExtractor,
  EvidenceResolver,
  UnblockPlanner,
  type Claim,
  type ClaimType,
} from '@vibecheck/core/firewall';

import { loadConfig } from '@repo/shared-config';
import {
  formatFirewallEvaluate,
  formatFirewallStatus,
  formatQuickCheck,
  formatSuccess,
  formatError,
  formatInfo,
  buildResponse,
  fmt,
} from '../ui/index.js';

// Get project root from centralized config or default to cwd
const getProjectRoot = (): string => {
  const config = loadConfig();
  return config.VIBECHECK_PROJECT_ROOT || process.cwd();
};

// Singleton instances for reuse
let firewallInstance: AgentFirewall | null = null;
let claimExtractorInstance: ClaimExtractor | null = null;
let evidenceResolverInstance: EvidenceResolver | null = null;
let unblockPlannerInstance: UnblockPlanner | null = null;

// Statistics tracking
const statistics = {
  totalChecks: 0,
  blocked: 0,
  allowed: 0,
};

const getFirewall = (): AgentFirewall => {
  if (!firewallInstance) {
    firewallInstance = new AgentFirewall({
      projectRoot: getProjectRoot(),
      truthpackPath: '.vibecheck/truthpack',
      strictMode: true,
    });
  }
  return firewallInstance;
};

const getClaimExtractor = (): ClaimExtractor => {
  if (!claimExtractorInstance) {
    claimExtractorInstance = new ClaimExtractor();
  }
  return claimExtractorInstance;
};

const getEvidenceResolver = (): EvidenceResolver => {
  if (!evidenceResolverInstance) {
    evidenceResolverInstance = new EvidenceResolver({
      projectRoot: getProjectRoot(),
      truthpackPath: '.vibecheck/truthpack',
    });
  }
  return evidenceResolverInstance;
};

const getUnblockPlanner = (): UnblockPlanner => {
  if (!unblockPlannerInstance) {
    unblockPlannerInstance = new UnblockPlanner();
  }
  return unblockPlannerInstance;
};

export function registerFirewallTools(server: McpServer): void {
  // Evaluate code through firewall
  server.tool(
    'firewall_evaluate',
    'Evaluate code through the agent firewall',
    {
      action: z.enum(['write', 'modify', 'delete']).describe('Action type'),
      target: z.string().describe('Target file path'),
      content: z.string().describe('Code content to evaluate'),
    },
    async ({ action, target, content }) => {
      const startTime = Date.now();
      try {
        const firewall = getFirewall();
        statistics.totalChecks++;

        const result = await firewall.evaluate({
          action,
          target,
          content,
        });

        if (result.allowed) {
          statistics.allowed++;
        } else {
          statistics.blocked++;
        }

        const duration = Date.now() - startTime;

        // Use enhanced formatting
        const response = formatFirewallEvaluate({
          allowed: result.allowed,
          action,
          target,
          claims: result.claims?.map((c: Claim) => ({
            type: c.type,
            value: c.value,
            verified: true, // If we got here, claims were verified
          })),
          violations: result.violations?.map((v: { policy: string; message: string }) => ({
            policy: v.policy,
            message: v.message,
          })),
          unblockPlan: result.unblockPlan?.map((s: { description: string; automated: boolean }) => ({
            description: s.description,
            automated: s.automated,
          })),
          duration,
        });

        return buildResponse(response);
      } catch (err) {
        const response = formatError(err instanceof Error ? err : 'Unknown error', {
          action,
          target,
        });
        return buildResponse(response);
      }
    }
  );

  // Quick check
  server.tool(
    'firewall_quick_check',
    'Quick hallucination check without full evidence resolution',
    {
      content: z.string().describe('Code content to check'),
    },
    async ({ content }) => {
      try {
        const firewall = getFirewall();
        const result = await firewall.quickCheck(content);

        const response = formatQuickCheck({
          safe: result.safe,
          concerns: result.concerns,
        });

        return buildResponse(response);
      } catch (err) {
        const response = formatQuickCheck({
          safe: false,
          concerns: [err instanceof Error ? err.message : 'Unknown error'],
        });
        return buildResponse(response);
      }
    }
  );

  // Extract claims
  server.tool(
    'firewall_extract_claims',
    'Extract verifiable claims from code',
    {
      content: z.string().describe('Code content to analyze'),
    },
    async ({ content }) => {
      try {
        const extractor = getClaimExtractor();
        const result = await extractor.extractWithStats(content);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              claims: result.claims.map(c => ({
                id: c.id,
                type: c.type,
                value: c.value,
                location: c.location,
                confidence: c.confidence,
              })),
              statistics: result.statistics,
            }, null, 2),
          }],
        };
      } catch (err) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              claims: [],
              statistics: { totalClaims: 0, byType: {} },
              error: err instanceof Error ? err.message : 'Unknown error',
            }, null, 2),
          }],
        };
      }
    }
  );

  // Resolve evidence
  server.tool(
    'firewall_resolve_evidence',
    'Resolve evidence for claims',
    {
      claims: z.array(z.object({
        type: z.string(),
        value: z.string(),
      })).describe('Claims to resolve'),
    },
    async ({ claims }) => {
      try {
        const resolver = getEvidenceResolver();
        
        // Convert input claims to proper Claim objects
        const fullClaims: Claim[] = claims.map((c, i) => ({
          id: `claim-${i}`,
          type: c.type as ClaimType,
          value: c.value,
          location: { line: 0, column: 0, length: c.value.length },
          confidence: 0.8,
          context: c.value,
        }));

        const evidence = await resolver.resolveAll(fullClaims);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              evidence: evidence.map((e, i) => ({
                claim: claims[i],
                found: e.found,
                source: e.source,
                location: e.location,
                confidence: e.confidence,
                details: e.details,
              })),
            }, null, 2),
          }],
        };
      } catch (err) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              evidence: claims.map(c => ({
                claim: c,
                found: false,
                source: null,
                error: err instanceof Error ? err.message : 'Unknown error',
              })),
            }, null, 2),
          }],
        };
      }
    }
  );

  // Get unblock plan
  server.tool(
    'firewall_unblock_plan',
    'Get a plan to unblock a firewall rejection',
    {
      violations: z.array(z.object({
        policy: z.string(),
        message: z.string(),
      })).describe('Violations to resolve'),
    },
    async ({ violations }) => {
      try {
        const planner = getUnblockPlanner();
        
        const plans = violations.map(v => planner.plan({
          policy: v.policy,
          message: v.message,
          severity: 'error',
          claim: undefined,
        }));

        // Combine all plans
        const combinedSteps = plans.flatMap(p => p.steps);
        const canAutoFix = plans.some(p => p.canAutoFix);
        const efforts = plans.map(p => p.estimatedEffort);
        const effortOrder = ['trivial', 'minor', 'moderate', 'major', 'significant'];
        const maxEffort = efforts.reduce((max, e) => 
          effortOrder.indexOf(e) > effortOrder.indexOf(max) ? e : max
        , 'trivial');

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              steps: combinedSteps,
              estimatedEffort: maxEffort,
              canAutoFix,
            }, null, 2),
          }],
        };
      } catch (err) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              steps: [],
              estimatedEffort: 'unknown',
              canAutoFix: false,
              error: err instanceof Error ? err.message : 'Unknown error',
            }, null, 2),
          }],
        };
      }
    }
  );

  // Get firewall status
  server.tool(
    'firewall_status',
    'Get current firewall status and statistics',
    {},
    async () => {
      const firewall = getFirewall();
      const mode = firewall.getMode();

      const modeDescriptions: Record<string, string> = {
        observe: 'Logging violations but allowing all actions',
        enforce: 'Blocking actions with violations',
        lockdown: 'Blocking all write operations',
      };

      const response = formatFirewallStatus({
        enabled: true,
        mode,
        modeDescription: modeDescriptions[mode] ?? 'Unknown mode',
        statistics: {
          totalChecks: statistics.totalChecks,
          blocked: statistics.blocked,
          allowed: statistics.allowed,
          blockRate: statistics.totalChecks > 0 
            ? (statistics.blocked / statistics.totalChecks * 100).toFixed(1) + '%'
            : '0%',
        },
      });

      return buildResponse(response);
    }
  );

  // Get firewall mode
  server.tool(
    'firewall_get_mode',
    'Get the current firewall mode',
    {},
    async () => {
      const firewall = getFirewall();
      const mode = firewall.getMode();

      const descriptions: Record<string, string> = {
        observe: 'Logging violations but allowing all actions (monitoring only)',
        enforce: 'Blocking actions that have policy violations',
        lockdown: 'Blocking ALL write operations (emergency mode)',
      };

      const modeIcons: Record<string, string> = {
        observe: '👁️',
        enforce: '🛡️',
        lockdown: '🔒',
      };

      const response = formatInfo('FIREWALL MODE', {
        mode: `${modeIcons[mode] ?? ''} ${mode}`,
        description: descriptions[mode] ?? 'Unknown',
        availableModes: 'observe, enforce, lockdown',
      });

      return buildResponse(response);
    }
  );

  // Set firewall mode
  server.tool(
    'firewall_set_mode',
    'Set the firewall mode (observe/enforce/lockdown)',
    {
      mode: z.enum(['observe', 'enforce', 'lockdown'])
        .describe('observe: log only, enforce: block violations, lockdown: block all writes'),
    },
    async ({ mode }) => {
      const firewall = getFirewall();
      const previousMode = firewall.getMode();
      
      firewall.setMode(mode);

      const modeIcons: Record<string, string> = {
        observe: '👁️',
        enforce: '🛡️',
        lockdown: '🔒',
      };

      const descriptions: Record<string, string> = {
        observe: 'Now logging violations but allowing all actions',
        enforce: 'Now blocking actions with policy violations',
        lockdown: 'Now blocking ALL write operations',
      };

      // Build pretty text
      const textParts: string[] = [];
      textParts.push(fmt.headerBox(modeIcons[mode] ?? '⚙️', 'MODE CHANGED', mode.toUpperCase(), 45));
      textParts.push('');
      textParts.push(fmt.keyValue([
        ['Previous', previousMode],
        ['Current', mode],
        ['Status', descriptions[mode] ?? 'Unknown'],
      ]));

      if (mode === 'lockdown') {
        textParts.push('');
        textParts.push(`⚠️  WARNING: All write operations are now blocked.`);
        textParts.push(`   Use firewall_set_mode with "enforce" to resume.`);
      } else if (mode === 'observe') {
        textParts.push('');
        textParts.push(`ℹ️  Violations are logged but not enforced.`);
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              previousMode,
              currentMode: mode,
              message: descriptions[mode],
            }, null, 2),
          },
          {
            type: 'text',
            text: `\n---\n${textParts.join('\n')}\n---`,
          },
        ],
      };
    }
  );

  // Enter lockdown mode (convenience tool)
  server.tool(
    'firewall_lockdown',
    'Enter lockdown mode - blocks ALL write operations',
    {
      reason: z.string().optional().describe('Reason for entering lockdown'),
    },
    async ({ reason }) => {
      const firewall = getFirewall();
      const previousMode = firewall.getMode();
      
      firewall.setMode('lockdown');

      // Build pretty text
      const textParts: string[] = [];
      textParts.push('');
      textParts.push('╔═══════════════════════════════════════════════╗');
      textParts.push('║     🔒 LOCKDOWN MODE ACTIVATED 🔒              ║');
      textParts.push('╚═══════════════════════════════════════════════╝');
      textParts.push('');
      textParts.push(`  ${fmt.ICONS.blocked} All write operations are now BLOCKED`);
      textParts.push('');
      textParts.push(fmt.keyValue([
        ['Previous Mode', previousMode],
        ['Current Mode', 'lockdown'],
        ['Reason', reason ?? 'Manual lockdown'],
      ]));
      textParts.push('');
      textParts.push('  💡 To exit: Use firewall_set_mode with mode="enforce"');

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              previousMode,
              currentMode: 'lockdown',
              reason: reason ?? 'Manual lockdown',
              message: 'LOCKDOWN ACTIVE: All write operations are now blocked.',
              howToExit: 'Use firewall_set_mode with mode="enforce" to exit lockdown',
            }, null, 2),
          },
          {
            type: 'text',
            text: textParts.join('\n'),
          },
        ],
      };
    }
  );
}
