/**
 * DocGuard Tools
 * 
 * MCP tools for the documentation quality system.
 * Provides tools for evaluating docs, scanning registry, and managing documentation.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  createDocGuard,
  formatDocGuardResult,
  type DocGuardEngine,
  type DocGuardConfig,
} from '@vibecheck/core/docguard';
import { loadConfig } from '@repo/shared-config';

// Get project root from centralized config or default to cwd
const getProjectRoot = (): string => {
  const config = loadConfig();
  return config.VIBECHECK_PROJECT_ROOT || process.cwd();
};

// Singleton DocGuard instance
let docguardInstance: DocGuardEngine | null = null;

const getDocGuard = (): DocGuardEngine => {
  if (!docguardInstance) {
    docguardInstance = createDocGuard({
      projectRoot: getProjectRoot(),
    });
  }
  return docguardInstance;
};

export function registerDocGuardTools(server: McpServer): void {
  // Evaluate a document
  server.tool(
    'docguard_evaluate',
    'Evaluate a markdown document against DocGuard rules (duplicate detection, quality checks)',
    {
      path: z.string().describe('Path to the document'),
      content: z.string().describe('Document content'),
      action: z.enum(['create', 'modify']).default('create').describe('Action type'),
      changedFiles: z.array(z.string()).optional().describe('List of changed files for context'),
    },
    async ({ path, content, action, changedFiles }) => {
      try {
        const docguard = getDocGuard();
        
        const result = await docguard.evaluate({
          action,
          path,
          content,
          gitContext: changedFiles ? { changedFiles } : undefined,
        });

        // Format for display
        const formatted = formatDocGuardResult(result);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                verdict: result.verdict,
                reason: result.reason,
                isDuplicate: result.duplicateCheck?.isDuplicate ?? false,
                canonicalTarget: result.duplicateCheck?.canonicalTarget,
                violations: result.docSpec?.violations ?? [],
                metrics: result.docSpec?.metrics,
                recommendedActions: result.recommendedActions,
                mergePatch: result.mergePatch,
              }, null, 2),
            },
            {
              type: 'text',
              text: `\n---\n${formatted}\n---`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: err instanceof Error ? err.message : 'Unknown error',
            }, null, 2),
          }],
        };
      }
    }
  );

  // Quick check for slop
  server.tool(
    'docguard_quick_check',
    'Quick check for AI-generated documentation slop',
    {
      content: z.string().describe('Document content to check'),
    },
    async ({ content }) => {
      try {
        const docguard = getDocGuard();
        const result = await docguard.quickCheck(content);

        const icon = result.safe ? '✅' : '⚠️';
        const status = result.safe ? 'PASS' : 'CONCERNS';

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                safe: result.safe,
                concerns: result.concerns,
              }, null, 2),
            },
            {
              type: 'text',
              text: `\n---\n${icon} DocGuard Quick Check: ${status}\n${result.concerns.map(c => `   ⚠️ ${c}`).join('\n')}\n---`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              safe: false,
              concerns: [err instanceof Error ? err.message : 'Unknown error'],
            }, null, 2),
          }],
        };
      }
    }
  );

  // Scan registry
  server.tool(
    'docguard_scan',
    'Scan project and update the documentation registry',
    {},
    async () => {
      try {
        const docguard = getDocGuard();
        const result = await docguard.scanRegistry();

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
            {
              type: 'text',
              text: `\n---\n📚 Registry Scan Complete\n   Added: ${result.added}\n   Updated: ${result.updated}\n   Removed: ${result.removed}\n---`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: err instanceof Error ? err.message : 'Unknown error',
            }, null, 2),
          }],
        };
      }
    }
  );

  // Get registry stats
  server.tool(
    'docguard_stats',
    'Get documentation registry statistics',
    {},
    async () => {
      try {
        const docguard = getDocGuard();
        const stats = await docguard.getRegistryStats();

        const lines = [
          '📊 Documentation Registry Stats',
          '',
          `Total docs: ${stats.totalDocs}`,
          `Average anchors per doc: ${stats.avgAnchors.toFixed(1)}`,
          `Last scan: ${stats.lastScan}`,
          '',
          'By type:',
        ];

        for (const [type, count] of Object.entries(stats.byType)) {
          lines.push(`   ${type}: ${count}`);
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(stats, null, 2),
            },
            {
              type: 'text',
              text: `\n---\n${lines.join('\n')}\n---`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: err instanceof Error ? err.message : 'Unknown error',
            }, null, 2),
          }],
        };
      }
    }
  );

  // Find canonical doc
  server.tool(
    'docguard_find_canonical',
    'Find the canonical document for a given topic',
    {
      topic: z.string().describe('Topic to search for'),
    },
    async ({ topic }) => {
      try {
        const docguard = getDocGuard();
        const canonicalPath = await docguard.findCanonicalDoc(topic);

        if (canonicalPath) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                found: true,
                canonicalPath,
                message: `Found canonical doc for "${topic}": ${canonicalPath}`,
              }, null, 2),
            }],
          };
        } else {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                found: false,
                message: `No canonical doc found for "${topic}"`,
              }, null, 2),
            }],
          };
        }
      } catch (err) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: err instanceof Error ? err.message : 'Unknown error',
            }, null, 2),
          }],
        };
      }
    }
  );

  // Suggest location for new content
  server.tool(
    'docguard_suggest_location',
    'Suggest where new documentation content should be placed',
    {
      content: z.string().describe('Content to place'),
    },
    async ({ content }) => {
      try {
        const docguard = getDocGuard();
        const suggestion = await docguard.suggestLocation(content);

        const lines: string[] = [];
        
        if (suggestion.existingDoc) {
          lines.push(`📄 Existing doc found: ${suggestion.existingDoc}`);
          lines.push('   Consider updating this doc instead of creating a new one.');
        } else if (suggestion.suggestedPath) {
          lines.push(`📁 Suggested location: ${suggestion.suggestedPath}`);
        }
        
        lines.push(`   Reason: ${suggestion.reason}`);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(suggestion, null, 2),
            },
            {
              type: 'text',
              text: `\n---\n${lines.join('\n')}\n---`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: err instanceof Error ? err.message : 'Unknown error',
            }, null, 2),
          }],
        };
      }
    }
  );

  // Update config
  server.tool(
    'docguard_config',
    'Get or update DocGuard configuration',
    {
      updates: z.object({
        enabled: z.boolean().optional(),
        similarityThreshold: z.number().min(0).max(1).optional(),
        minAnchors: z.number().min(0).optional(),
        maxFluffRatio: z.number().min(0).max(1).optional(),
        strictMode: z.boolean().optional(),
        enableSemanticSimilarity: z.boolean().optional(),
      }).optional().describe('Configuration updates (omit to get current config)'),
    },
    async ({ updates }) => {
      try {
        const docguard = getDocGuard();
        
        if (updates) {
          docguard.updateConfig(updates);
        }

        const config = docguard.getConfig();

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              action: updates ? 'updated' : 'get',
              config,
            }, null, 2),
          }],
        };
      } catch (err) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: err instanceof Error ? err.message : 'Unknown error',
            }, null, 2),
          }],
        };
      }
    }
  );
}
