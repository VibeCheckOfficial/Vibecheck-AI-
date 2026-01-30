/**
 * Prompt Tools
 * 
 * MCP tools for enhanced prompt building, verification, and task planning.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';

import { loadConfig } from '@repo/shared-config';

// Get project root from centralized config or default to cwd
const getProjectRoot = (): string => {
  const config = loadConfig();
  return config.VIBECHECK_PROJECT_ROOT || process.cwd();
};

// Simple truthpack loader
const loadTruthpack = async (section: string): Promise<unknown | null> => {
  const filePath = path.join(getProjectRoot(), '.vibecheck', 'truthpack', `${section}.json`);
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
};

export function registerPromptTools(server: McpServer): void {
  // Plan a task
  server.tool(
    'prompt_plan_task',
    'Break down a complex task into smaller, verifiable sub-tasks',
    {
      task: z.string().describe('The task to plan'),
      includeTests: z.boolean().optional().describe('Include test tasks (default: true)'),
      includeDocumentation: z.boolean().optional().describe('Include documentation tasks (default: false)'),
    },
    async ({ task, includeTests, includeDocumentation }) => {
      try {
        const { TaskPlanner } = await import('@vibecheck/core/prompt');
        
        const planner = new TaskPlanner({
          includeTests: includeTests ?? true,
          includeDocumentation: includeDocumentation ?? false,
        });

        const plan = planner.plan(task);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              originalTask: plan.originalTask,
              totalComplexity: plan.totalComplexity,
              taskCount: plan.tasks.length,
              tasks: plan.tasks.map(t => ({
                id: t.id,
                description: t.description,
                type: t.type,
                complexity: t.estimatedComplexity,
                dependencies: t.dependencies,
                verificationPoints: t.verificationPoints.length,
              })),
              executionOrder: plan.executionOrder,
              warnings: plan.warnings,
              requiredContext: plan.requiredContext,
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

  // Get task details with prompt
  server.tool(
    'prompt_get_task',
    'Get detailed prompt for a specific planned task',
    {
      task: z.string().describe('The original task description'),
      taskIndex: z.number().describe('Index of the sub-task to get (0-based)'),
      includeContext: z.boolean().optional().describe('Include truthpack context (default: true)'),
    },
    async ({ task, taskIndex, includeContext }) => {
      try {
        const { TaskPlanner } = await import('@vibecheck/core/prompt');
        
        const planner = new TaskPlanner();
        const plan = planner.plan(task);

        if (taskIndex < 0 || taskIndex >= plan.tasks.length) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                error: `Task index ${taskIndex} out of range (0-${plan.tasks.length - 1})`,
              }, null, 2),
            }],
          };
        }

        const selectedTask = plan.tasks[taskIndex];
        
        // Load context if requested
        let context: Record<string, unknown> = {};
        if (includeContext !== false) {
          for (const section of plan.requiredContext) {
            const data = await loadTruthpack(section);
            if (data) {
              context[section] = data;
            }
          }
        }

        const prompt = planner.generateTaskPrompt(selectedTask, context);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              taskId: selectedTask.id,
              description: selectedTask.description,
              type: selectedTask.type,
              complexity: selectedTask.estimatedComplexity,
              verificationPoints: selectedTask.verificationPoints,
              prompt,
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

  // Verify a prompt
  server.tool(
    'prompt_verify',
    'Verify a prompt for potential issues before sending to AI',
    {
      prompt: z.string().describe('The prompt to verify'),
      strictMode: z.boolean().optional().describe('Enable strict validation (default: true)'),
    },
    async ({ prompt, strictMode }) => {
      try {
        const { PromptVerifier } = await import('@vibecheck/core/prompt');
        
        const verifier = new PromptVerifier({
          strictMode: strictMode ?? true,
        });

        const result = verifier.verify(prompt);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              valid: result.valid,
              score: result.score,
              estimatedRisk: result.estimatedRisk,
              issueCount: result.issues.length,
              issues: result.issues.map(i => ({
                type: i.type,
                category: i.category,
                message: i.message,
                suggestion: i.suggestion,
              })),
              requiredContext: result.requiredContext,
              enhancedPrompt: result.enhancedPrompt,
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

  // Quick check prompt
  server.tool(
    'prompt_quick_check',
    'Quick check if a prompt has blocking issues',
    {
      prompt: z.string().describe('The prompt to check'),
    },
    async ({ prompt }) => {
      try {
        const { PromptVerifier } = await import('@vibecheck/core/prompt');
        
        const verifier = new PromptVerifier();
        const result = verifier.quickCheck(prompt);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              blocked: result.blocked,
              reason: result.reason,
              safe: !result.blocked,
            }, null, 2),
          }],
        };
      } catch (err) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              blocked: false,
              error: err instanceof Error ? err.message : 'Unknown error',
            }, null, 2),
          }],
        };
      }
    }
  );

  // Build enhanced prompt
  server.tool(
    'prompt_build',
    'Build an enhanced prompt with truthpack context injection',
    {
      task: z.string().describe('The task description'),
      includeRoutes: z.boolean().optional().describe('Include API routes context'),
      includeEnv: z.boolean().optional().describe('Include environment variables context'),
      includeAuth: z.boolean().optional().describe('Include authentication context'),
      includeContracts: z.boolean().optional().describe('Include API contracts context'),
    },
    async ({ task, includeRoutes, includeEnv, includeAuth, includeContracts }) => {
      try {
        const sections: string[] = [];
        const contextInjected: string[] = [];

        // Build prompt header
        sections.push('## Task');
        sections.push('');
        sections.push(task);
        sections.push('');
        sections.push('## Verified Context');
        sections.push('');
        sections.push('The following information is verified ground truth from the codebase.');
        sections.push('Use ONLY these facts. Do NOT invent APIs, types, or endpoints not listed here.');
        sections.push('');

        // Include routes
        if (includeRoutes) {
          const routes = await loadTruthpack('routes') as { routes?: Array<{ method: string; path: string }>; summary?: { totalRoutes: number } } | null;
          if (routes?.routes) {
            sections.push('### API Routes');
            sections.push('');
            const routeList = routes.routes.slice(0, 15).map(r => `- ${r.method} ${r.path}`);
            sections.push(routeList.join('\n'));
            if (routes.routes.length > 15) {
              sections.push(`- ... and ${routes.routes.length - 15} more`);
            }
            sections.push('');
            contextInjected.push('routes');
          }
        }

        // Include env
        if (includeEnv) {
          const env = await loadTruthpack('env') as { variables?: Array<{ name: string; required: boolean }> } | null;
          if (env?.variables) {
            sections.push('### Environment Variables');
            sections.push('');
            const envList = env.variables.slice(0, 10).map(v => `- ${v.name}${v.required ? ' (required)' : ''}`);
            sections.push(envList.join('\n'));
            sections.push('');
            contextInjected.push('env');
          }
        }

        // Include auth
        if (includeAuth) {
          const auth = await loadTruthpack('auth') as { roles?: Array<{ name: string }>; publicPaths?: string[] } | null;
          if (auth) {
            sections.push('### Authentication');
            sections.push('');
            if (auth.roles) {
              sections.push(`**Roles:** ${auth.roles.map(r => r.name).join(', ')}`);
            }
            if (auth.publicPaths) {
              sections.push(`**Public paths:** ${auth.publicPaths.slice(0, 5).join(', ')}`);
            }
            sections.push('');
            contextInjected.push('auth');
          }
        }

        // Include contracts
        if (includeContracts) {
          const contracts = await loadTruthpack('contracts') as { contracts?: Array<{ path: string; method?: string }> } | null;
          if (contracts?.contracts) {
            sections.push('### API Contracts');
            sections.push('');
            const contractList = contracts.contracts.slice(0, 10).map(c => `- ${c.method || 'ANY'} ${c.path}`);
            sections.push(contractList.join('\n'));
            sections.push('');
            contextInjected.push('contracts');
          }
        }

        // Verification requirements
        sections.push('## Verification Requirements');
        sections.push('');
        sections.push('Before generating code, ensure:');
        sections.push('1. All imports exist in package.json or as local files');
        sections.push('2. All API endpoints match routes listed above');
        sections.push('3. All environment variables are declared');
        sections.push('4. Types match truthpack schemas');

        const prompt = sections.join('\n');
        const tokenEstimate = Math.ceil(prompt.length / 4);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              prompt,
              contextInjected,
              tokenEstimate,
              warnings: tokenEstimate > 4000 ? ['Prompt exceeds recommended token limit'] : [],
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

  // Get prompt templates
  server.tool(
    'prompt_templates',
    'Get available prompt templates',
    {},
    async () => {
      const templates = [
        {
          id: 'create-component',
          name: 'Create Component',
          description: 'Create a new React/Vue component',
          variables: ['framework', 'componentName', 'requirements'],
          requiredContext: ['routes', 'contracts'],
        },
        {
          id: 'add-api-endpoint',
          name: 'Add API Endpoint',
          description: 'Add a new API endpoint',
          variables: ['method', 'path', 'requirements'],
          requiredContext: ['routes', 'auth', 'contracts'],
        },
        {
          id: 'fix-bug',
          name: 'Fix Bug',
          description: 'Fix a bug in existing code',
          variables: ['issue', 'files', 'expectedBehavior', 'currentBehavior'],
          requiredContext: [],
        },
        {
          id: 'refactor',
          name: 'Refactor Code',
          description: 'Refactor existing code',
          variables: ['goal', 'currentImplementation', 'files'],
          requiredContext: ['conventions'],
        },
      ];

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            templates,
            count: templates.length,
          }, null, 2),
        }],
      };
    }
  );
}
