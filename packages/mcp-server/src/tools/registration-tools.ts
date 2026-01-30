/**
 * Registration Tools
 * 
 * MCP tools for registering new patterns, conventions, and knowledge.
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

// Get truthpack directory path
const getTruthpackPath = (): string => {
  return path.join(getProjectRoot(), '.vibecheck', 'truthpack');
};

// Get knowledge directory path
const getKnowledgePath = (): string => {
  return path.join(getProjectRoot(), '.vibecheck', 'knowledge');
};

// Ensure directory exists
const ensureDir = async (dirPath: string): Promise<void> => {
  await fs.mkdir(dirPath, { recursive: true });
};

// Load JSON file safely
const loadJson = async <T>(filePath: string): Promise<T | null> => {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
};

// Save JSON file
const saveJson = async (filePath: string, data: unknown): Promise<void> => {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
};

export function registerRegistrationTools(server: McpServer): void {
  // Register a new pattern
  server.tool(
    'register_pattern',
    'Register a new code pattern for the AI to follow',
    {
      name: z.string().describe('Pattern name'),
      category: z.string().describe('Pattern category'),
      description: z.string().describe('Pattern description'),
      example: z.string().describe('Example code'),
      antiPatterns: z.array(z.string()).optional().describe('Anti-patterns to avoid'),
    },
    async ({ name, category, description, example, antiPatterns }) => {
      try {
        const patternsPath = path.join(getKnowledgePath(), 'patterns.json');
        const existing = await loadJson<{ patterns: Array<Record<string, unknown>> }>(patternsPath) || { patterns: [] };

        const newPattern = {
          id: `pattern-${Date.now()}`,
          name,
          category,
          description,
          example,
          antiPatterns: antiPatterns || [],
          createdAt: new Date().toISOString(),
        };

        // Check for duplicate
        const existingIndex = existing.patterns.findIndex((p: Record<string, unknown>) => p.name === name);
        if (existingIndex >= 0) {
          existing.patterns[existingIndex] = newPattern;
        } else {
          existing.patterns.push(newPattern);
        }

        await saveJson(patternsPath, existing);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              registered: true,
              pattern: newPattern,
              message: `Pattern "${name}" registered successfully`,
            }, null, 2),
          }],
        };
      } catch (err) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              registered: false,
              error: err instanceof Error ? err.message : 'Unknown error',
            }, null, 2),
          }],
        };
      }
    }
  );

  // Register a convention
  server.tool(
    'register_convention',
    'Register a coding convention',
    {
      category: z.string().describe('Convention category (naming, imports, etc.)'),
      rule: z.string().describe('The convention rule'),
      example: z.string().optional().describe('Example demonstrating the convention'),
    },
    async ({ category, rule, example }) => {
      try {
        const conventionsPath = path.join(getKnowledgePath(), 'conventions.json');
        const existing = await loadJson<{ conventions: Array<Record<string, unknown>> }>(conventionsPath) || { conventions: [] };

        const newConvention = {
          id: `convention-${Date.now()}`,
          category,
          rule,
          example,
          createdAt: new Date().toISOString(),
        };

        existing.conventions.push(newConvention);
        await saveJson(conventionsPath, existing);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              registered: true,
              convention: newConvention,
              message: `Convention in "${category}" registered successfully`,
            }, null, 2),
          }],
        };
      } catch (err) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              registered: false,
              error: err instanceof Error ? err.message : 'Unknown error',
            }, null, 2),
          }],
        };
      }
    }
  );

  // Register an API endpoint
  server.tool(
    'register_endpoint',
    'Register an API endpoint in the truthpack. Use this BEFORE creating a new route to prevent ghost-route errors.',
    {
      path: z.string().describe('API path (e.g., "/api/users/:id")'),
      method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).describe('HTTP method'),
      handler: z.string().describe('Handler function name'),
      file: z.string().describe('File containing the handler'),
      description: z.string().optional().describe('Endpoint description'),
    },
    async ({ path: routePath, method, handler, file, description }) => {
      try {
        const routesPath = path.join(getTruthpackPath(), 'routes.json');
        const existing = await loadJson<{ 
          version: string;
          generatedAt: string;
          routes: Array<{ method: string; path: string; handler: string; file: string; description?: string; line?: number }>;
          summary: Record<string, unknown>;
        }>(routesPath) || {
          version: '1.0.0',
          generatedAt: new Date().toISOString(),
          routes: [],
          summary: {},
        };

        // Check for duplicate
        const existingRoute = existing.routes.find(r => r.method === method && r.path === routePath);
        if (existingRoute) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                registered: false,
                message: `Route ${method} ${routePath} already exists`,
                existingRoute,
              }, null, 2),
            }],
          };
        }

        const newRoute = {
          method,
          path: routePath,
          handler,
          file,
          description,
          line: 1,
          registeredAt: new Date().toISOString(),
        };

        existing.routes.push(newRoute);
        existing.generatedAt = new Date().toISOString();

        // Update summary
        existing.summary = {
          totalRoutes: existing.routes.length,
          byMethod: existing.routes.reduce((acc, r) => {
            acc[r.method] = (acc[r.method] || 0) + 1;
            return acc;
          }, {} as Record<string, number>),
        };

        await saveJson(routesPath, existing);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              registered: true,
              route: newRoute,
              message: `Route ${method} ${routePath} registered successfully. You can now use this endpoint without ghost-route errors.`,
            }, null, 2),
          }],
        };
      } catch (err) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              registered: false,
              error: err instanceof Error ? err.message : 'Unknown error',
            }, null, 2),
          }],
        };
      }
    }
  );

  // Register an environment variable
  server.tool(
    'register_env_var',
    'Register an environment variable in the truthpack. Use this BEFORE using a new env var to prevent ghost-env errors.',
    {
      name: z.string().describe('Variable name (e.g., "STRIPE_SECRET_KEY")'),
      type: z.enum(['string', 'number', 'boolean', 'url', 'secret']).describe('Variable type'),
      required: z.boolean().describe('Is required'),
      description: z.string().optional().describe('Variable description'),
      defaultValue: z.string().optional().describe('Default value'),
    },
    async ({ name, type, required, description, defaultValue }) => {
      try {
        const envPath = path.join(getTruthpackPath(), 'env.json');
        const existing = await loadJson<{
          version: string;
          generatedAt: string;
          variables: Array<{ name: string; type: string; required: boolean; description?: string; defaultValue?: string; sensitive: boolean }>;
          summary: Record<string, unknown>;
        }>(envPath) || {
          version: '1.0.0',
          generatedAt: new Date().toISOString(),
          variables: [],
          environments: [],
          summary: {},
        };

        // Check for duplicate
        const existingVar = existing.variables.find(v => v.name === name);
        if (existingVar) {
          // Update existing
          Object.assign(existingVar, { type, required, description, defaultValue });
          await saveJson(envPath, existing);
          
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                registered: true,
                updated: true,
                variable: existingVar,
                message: `Environment variable "${name}" updated`,
              }, null, 2),
            }],
          };
        }

        // Determine if sensitive based on name or type
        const sensitivePatterns = ['secret', 'password', 'token', 'key', 'api_key', 'apikey', 'private', 'credential'];
        const isSensitive = type === 'secret' || sensitivePatterns.some(p => name.toLowerCase().includes(p));

        const newVar = {
          name,
          type,
          required,
          description,
          defaultValue,
          sensitive: isSensitive,
          registeredAt: new Date().toISOString(),
        };

        existing.variables.push(newVar);
        existing.generatedAt = new Date().toISOString();

        // Update summary
        existing.summary = {
          totalVariables: existing.variables.length,
          required: existing.variables.filter(v => v.required).length,
          optional: existing.variables.filter(v => !v.required).length,
          sensitive: existing.variables.filter(v => v.sensitive).length,
        };

        await saveJson(envPath, existing);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              registered: true,
              variable: newVar,
              message: `Environment variable "${name}" registered. You can now use process.env.${name} without ghost-env errors.`,
              reminder: required ? `Remember to add ${name} to your .env file!` : undefined,
            }, null, 2),
          }],
        };
      } catch (err) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              registered: false,
              error: err instanceof Error ? err.message : 'Unknown error',
            }, null, 2),
          }],
        };
      }
    }
  );

  // Register a type
  server.tool(
    'register_type',
    'Register a TypeScript type in the truthpack contracts',
    {
      name: z.string().describe('Type name'),
      definition: z.string().describe('Type definition'),
      file: z.string().describe('File containing the type'),
      description: z.string().optional().describe('Type description'),
    },
    async ({ name, definition, file, description }) => {
      try {
        const contractsPath = path.join(getTruthpackPath(), 'contracts.json');
        const existing = await loadJson<{
          version: string;
          generatedAt: string;
          contracts: Array<Record<string, unknown>>;
          types: Array<{ name: string; definition: string; file: string; description?: string }>;
        }>(contractsPath) || {
          version: '1.0.0',
          generatedAt: new Date().toISOString(),
          contracts: [],
          types: [],
        };

        // Initialize types array if not present
        if (!existing.types) {
          existing.types = [];
        }

        // Check for duplicate
        const existingType = existing.types.find(t => t.name === name);
        if (existingType) {
          Object.assign(existingType, { definition, file, description });
          await saveJson(contractsPath, existing);

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                registered: true,
                updated: true,
                type: existingType,
                message: `Type "${name}" updated`,
              }, null, 2),
            }],
          };
        }

        const newType = {
          name,
          definition,
          file,
          description,
          registeredAt: new Date().toISOString(),
        };

        existing.types.push(newType);
        existing.generatedAt = new Date().toISOString();

        await saveJson(contractsPath, existing);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              registered: true,
              type: newType,
              message: `Type "${name}" registered successfully`,
            }, null, 2),
          }],
        };
      } catch (err) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              registered: false,
              error: err instanceof Error ? err.message : 'Unknown error',
            }, null, 2),
          }],
        };
      }
    }
  );
}
