/**
 * Intent Tools
 * 
 * MCP tools for intent declaration and management.
 * Allows AI agents to declare their intended scope of operations.
 * Features enhanced multi-format output (JSON + pretty text + HTML).
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { 
  getIntentStore,
  type IntentDeclaration,
} from '@vibecheck/core/firewall';
import { fmt } from '../ui/index.js';

export function registerIntentTools(server: McpServer): void {
  const store = getIntentStore();

  // Declare intent
  server.tool(
    'intent_declare',
    'Declare the intended scope and operations for upcoming actions',
    {
      description: z.string().describe('Description of what you intend to do'),
      allowedPaths: z.array(z.string()).optional()
        .describe('File path patterns allowed (e.g., "src/components/**/*")'),
      allowedOperations: z.array(z.enum(['read', 'write', 'modify', 'delete', 'execute'])).optional()
        .describe('Operations allowed (default: read, write, modify)'),
      scope: z.enum(['file', 'directory', 'module', 'project']).optional()
        .describe('Scope of changes (default: file)'),
      targetFiles: z.array(z.string()).optional()
        .describe('Specific files to modify'),
      excludedPaths: z.array(z.string()).optional()
        .describe('Paths to exclude from allowed operations'),
      expiresInMinutes: z.number().optional()
        .describe('Intent expiration time in minutes (default: no expiration)'),
    },
    async ({ 
      description, 
      allowedPaths, 
      allowedOperations, 
      scope, 
      targetFiles,
      excludedPaths,
      expiresInMinutes 
    }) => {
      try {
        const declaration: IntentDeclaration = {
          description,
          allowedPaths,
          allowedOperations,
          scope,
          targetFiles,
          excludedPaths,
          expiresInMs: expiresInMinutes ? expiresInMinutes * 60 * 1000 : undefined,
        };

        const intent = store.declare(declaration);

        // Build pretty text output
        const textParts: string[] = [];
        textParts.push(fmt.headerBox('🎯', 'INTENT DECLARED', intent.scope ?? 'file', 50));
        textParts.push('');
        textParts.push(`  ${fmt.ICONS.success} ${intent.description}`);
        textParts.push('');
        
        textParts.push(fmt.keyValue([
          ['ID', intent.id.slice(0, 8) + '...'],
          ['Scope', intent.scope ?? 'file'],
          ['Declared', intent.declaredAt.toLocaleString()],
        ]));

        if (intent.allowedPaths && intent.allowedPaths.length > 0) {
          textParts.push('');
          textParts.push(fmt.section('Allowed Paths', '', '📁'));
          textParts.push(fmt.bulletList(intent.allowedPaths.slice(0, 5)));
        }

        if (intent.allowedOperations && intent.allowedOperations.length > 0) {
          textParts.push('');
          textParts.push(`  Operations: ${intent.allowedOperations.join(', ')}`);
        }

        if (intent.expiresAt) {
          textParts.push('');
          textParts.push(`  ⏰ Expires: ${intent.expiresAt.toLocaleString()}`);
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                intent: {
                  id: intent.id,
                  description: intent.description,
                  allowedPaths: intent.allowedPaths,
                  allowedOperations: intent.allowedOperations,
                  scope: intent.scope,
                  targetFiles: intent.targetFiles,
                  excludedPaths: intent.excludedPaths,
                  declaredAt: intent.declaredAt.toISOString(),
                  expiresAt: intent.expiresAt?.toISOString(),
                },
                message: 'Intent declared successfully. Operations outside this scope will be flagged.',
              }, null, 2),
            },
            {
              type: 'text',
              text: `\n---\n${textParts.join('\n')}\n---`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: err instanceof Error ? err.message : 'Unknown error',
            }, null, 2),
          }],
        };
      }
    }
  );

  // Get current intent
  server.tool(
    'intent_get',
    'Get the currently active intent declaration',
    {},
    async () => {
      const intent = store.getCurrent();

      if (!intent) {
        const textParts: string[] = [];
        textParts.push(fmt.headerBox('🎯', 'CURRENT INTENT', 'None', 45));
        textParts.push('');
        textParts.push(`  ${fmt.ICONS.info} No active intent`);
        textParts.push('  All operations are currently allowed.');

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                active: false,
                message: 'No active intent. All operations are currently allowed.',
              }, null, 2),
            },
            {
              type: 'text',
              text: `\n---\n${textParts.join('\n')}\n---`,
            },
          ],
        };
      }

      const now = new Date();
      const isExpired = intent.expiresAt && now > intent.expiresAt;
      const timeRemaining = intent.expiresAt 
        ? Math.max(0, Math.floor((intent.expiresAt.getTime() - now.getTime()) / 1000))
        : null;

      // Build pretty text output
      const textParts: string[] = [];
      const statusIcon = isExpired ? '⏰' : '✅';
      const statusText = isExpired ? 'Expired' : 'Active';
      
      textParts.push(fmt.headerBox('🎯', 'CURRENT INTENT', statusText, 50));
      textParts.push('');
      textParts.push(`  ${statusIcon} ${intent.description}`);
      textParts.push('');
      
      textParts.push(fmt.keyValue([
        ['Status', isExpired ? '✗ Expired' : '✓ Active'],
        ['Scope', intent.scope ?? 'file'],
        ['Operations', (intent.allowedOperations ?? []).join(', ') || 'All'],
      ]));

      if (intent.allowedPaths && intent.allowedPaths.length > 0) {
        textParts.push('');
        textParts.push(fmt.section('Allowed Paths', '', '📁'));
        textParts.push(fmt.tree(intent.allowedPaths.slice(0, 5).map(p => ({ label: p }))));
      }

      if (timeRemaining !== null && !isExpired) {
        textParts.push('');
        const mins = Math.floor(timeRemaining / 60);
        const secs = timeRemaining % 60;
        textParts.push(`  ⏱️  Time remaining: ${mins}m ${secs}s`);
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              active: !isExpired,
              intent: {
                id: intent.id,
                description: intent.description,
                allowedPaths: intent.allowedPaths,
                allowedOperations: intent.allowedOperations,
                scope: intent.scope,
                targetFiles: intent.targetFiles,
                excludedPaths: intent.excludedPaths,
                declaredAt: intent.declaredAt.toISOString(),
                expiresAt: intent.expiresAt?.toISOString(),
                timeRemaining,
              },
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

  // Clear intent
  server.tool(
    'intent_clear',
    'Clear the current intent declaration (allows all operations)',
    {},
    async () => {
      const cleared = store.clear();

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            cleared: cleared ? {
              id: cleared.id,
              description: cleared.description,
            } : null,
            message: cleared 
              ? 'Intent cleared. All operations are now allowed.'
              : 'No active intent to clear.',
          }, null, 2),
        }],
      };
    }
  );

  // Check if an action is allowed
  server.tool(
    'intent_check',
    'Check if a specific action is allowed under current intent',
    {
      action: z.enum(['read', 'write', 'modify', 'delete', 'execute'])
        .describe('Action to check'),
      targetPath: z.string()
        .describe('Target file path'),
    },
    async ({ action, targetPath }) => {
      const result = store.checkAction(action, targetPath);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            allowed: result.allowed,
            reason: result.reason,
            violations: result.violations,
            intent: result.intent ? {
              id: result.intent.id,
              description: result.intent.description,
            } : null,
          }, null, 2),
        }],
      };
    }
  );

  // Extend current intent
  server.tool(
    'intent_extend',
    'Extend the current intent with additional permissions',
    {
      allowedPaths: z.array(z.string()).optional()
        .describe('Additional allowed paths'),
      allowedOperations: z.array(z.enum(['read', 'write', 'modify', 'delete', 'execute'])).optional()
        .describe('Additional allowed operations'),
      targetFiles: z.array(z.string()).optional()
        .describe('Additional target files'),
      extendExpirationMinutes: z.number().optional()
        .describe('Extend expiration by this many minutes'),
    },
    async ({ allowedPaths, allowedOperations, targetFiles, extendExpirationMinutes }) => {
      const extended = store.extend({
        allowedPaths,
        allowedOperations,
        targetFiles,
        expiresInMs: extendExpirationMinutes ? extendExpirationMinutes * 60 * 1000 : undefined,
      });

      if (!extended) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: 'No active intent to extend. Declare an intent first.',
            }, null, 2),
          }],
        };
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            intent: {
              id: extended.id,
              allowedPaths: extended.allowedPaths,
              allowedOperations: extended.allowedOperations,
              targetFiles: extended.targetFiles,
              expiresAt: extended.expiresAt?.toISOString(),
            },
            message: 'Intent extended successfully.',
          }, null, 2),
        }],
      };
    }
  );

  // Restrict current intent
  server.tool(
    'intent_restrict',
    'Restrict the current intent with narrower permissions',
    {
      allowedPaths: z.array(z.string()).optional()
        .describe('New restricted allowed paths'),
      allowedOperations: z.array(z.enum(['read', 'write', 'modify', 'delete', 'execute'])).optional()
        .describe('New restricted allowed operations'),
      excludedPaths: z.array(z.string()).optional()
        .describe('Additional paths to exclude'),
    },
    async ({ allowedPaths, allowedOperations, excludedPaths }) => {
      const restricted = store.restrict({
        allowedPaths,
        allowedOperations,
        excludedPaths,
      });

      if (!restricted) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: 'No active intent to restrict. Declare an intent first.',
            }, null, 2),
          }],
        };
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            intent: {
              id: restricted.id,
              allowedPaths: restricted.allowedPaths,
              allowedOperations: restricted.allowedOperations,
              excludedPaths: restricted.excludedPaths,
            },
            message: 'Intent restricted successfully.',
          }, null, 2),
        }],
      };
    }
  );

  // Get intent history
  server.tool(
    'intent_history',
    'Get history of declared intents',
    {
      limit: z.number().optional().describe('Maximum number of entries (default: 20)'),
    },
    async ({ limit }) => {
      const history = store.getHistory(limit ?? 20);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            count: history.length,
            history: history.map(intent => ({
              id: intent.id,
              description: intent.description,
              scope: intent.scope,
              declaredAt: intent.declaredAt.toISOString(),
              expiresAt: intent.expiresAt?.toISOString(),
            })),
          }, null, 2),
        }],
      };
    }
  );
}
