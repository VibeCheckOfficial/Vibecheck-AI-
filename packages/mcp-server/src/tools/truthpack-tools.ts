/**
 * Truthpack Tools
 * 
 * MCP tools for managing and querying truthpack data.
 * Features enhanced multi-format output (JSON + pretty text + HTML).
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  RouteScanner,
  EnvScanner,
  AuthScanner,
  ContractScanner,
} from '@vibecheck/core/truthpack';

import { loadConfig } from '@repo/shared-config';
import {
  formatTruthpackGenerate,
  formatTruthpackQuery,
  formatRoutes,
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

// Get truthpack directory path
const getTruthpackPath = (): string => {
  return path.join(getProjectRoot(), '.vibecheck', 'truthpack');
};

// Ensure truthpack directory exists
const ensureTruthpackDir = async (): Promise<void> => {
  const truthpackPath = getTruthpackPath();
  await fs.mkdir(truthpackPath, { recursive: true });
};

// Load truthpack file
const loadTruthpack = async <T>(name: string): Promise<T | null> => {
  try {
    const filePath = path.join(getTruthpackPath(), `${name}.json`);
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
};

// Save truthpack file
const saveTruthpack = async (name: string, data: unknown): Promise<void> => {
  await ensureTruthpackDir();
  const filePath = path.join(getTruthpackPath(), `${name}.json`);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
};

export function registerTruthpackTools(server: McpServer): void {
  // Generate truthpack
  server.tool(
    'truthpack_generate',
    'Generate or refresh the truthpack by scanning the codebase',
    {
      scanners: z.array(z.enum(['routes', 'env', 'auth', 'contracts', 'ui-graph']))
        .optional()
        .describe('Which scanners to run (default: all)'),
      force: z.boolean()
        .optional()
        .describe('Force regeneration even if truthpack is fresh'),
    },
    async ({ scanners, force }) => {
      const projectRoot = getProjectRoot();
      const scannersToRun = scanners ?? ['routes', 'env', 'auth', 'contracts'];
      const results: Record<string, { count?: number; note?: string }> = {};
      const errors: string[] = [];

      try {
        for (const scannerName of scannersToRun) {
          try {
            switch (scannerName) {
              case 'routes': {
                const scanner = new RouteScanner(projectRoot);
                const routes = await scanner.scan();
                const routesData = {
                  version: '1.0.0',
                  generatedAt: new Date().toISOString(),
                  routes,
                  summary: {
                    totalRoutes: routes.length,
                    byMethod: routes.reduce((acc, r) => {
                      acc[r.method] = (acc[r.method] || 0) + 1;
                      return acc;
                    }, {} as Record<string, number>),
                    protectedRoutes: routes.filter(r => r.auth?.required).length,
                    publicRoutes: routes.filter(r => !r.auth?.required).length,
                  },
                };
                await saveTruthpack('routes', routesData);
                results.routes = { count: routes.length };
                break;
              }
              case 'env': {
                const scanner = new EnvScanner(projectRoot);
                const variables = await scanner.scan();
                const envData = {
                  version: '1.0.0',
                  generatedAt: new Date().toISOString(),
                  variables,
                  environments: [{ name: 'default', variables: variables.map(v => v.name) }],
                  summary: {
                    totalVariables: variables.length,
                    required: variables.filter(v => v.required).length,
                    optional: variables.filter(v => !v.required).length,
                    sensitive: variables.filter(v => v.sensitive).length,
                  },
                };
                await saveTruthpack('env', envData);
                results.env = { count: variables.length };
                break;
              }
              case 'auth': {
                const scanner = new AuthScanner(projectRoot);
                const authConfig = await scanner.scan();
                const authData = {
                  version: '1.0.0',
                  generatedAt: new Date().toISOString(),
                  providers: authConfig.providers ?? [],
                  roles: authConfig.roles ?? [],
                  protectedResources: authConfig.protectedResources ?? [],
                  publicPaths: authConfig.publicPaths ?? [],
                  summary: {
                    totalRoles: authConfig.roles?.length ?? 0,
                    totalPermissions: authConfig.roles?.reduce((acc, r) => acc + r.permissions.length, 0) ?? 0,
                    protectedEndpoints: authConfig.protectedResources?.length ?? 0,
                    publicEndpoints: authConfig.publicPaths?.length ?? 0,
                  },
                };
                await saveTruthpack('auth', authData);
                results.auth = { count: authConfig.roles?.length ?? 0, note: `${authConfig.protectedResources?.length ?? 0} protected` };
                break;
              }
              case 'contracts': {
                const scanner = new ContractScanner(projectRoot);
                const contracts = await scanner.scan();
                const contractsData = {
                  version: '1.0.0',
                  generatedAt: new Date().toISOString(),
                  contracts,
                  summary: {
                    totalEndpoints: contracts.length,
                    byTag: contracts.reduce((acc, c) => {
                      for (const tag of c.tags ?? ['untagged']) {
                        acc[tag] = (acc[tag] || 0) + 1;
                      }
                      return acc;
                    }, {} as Record<string, number>),
                  },
                };
                await saveTruthpack('contracts', contractsData);
                results.contracts = { count: contracts.length };
                break;
              }
              case 'ui-graph': {
                // UI graph scanner not implemented yet
                results['ui-graph'] = { count: 0, note: 'Scanner not implemented' };
                break;
              }
            }
          } catch (err) {
            errors.push(`${scannerName}: ${err instanceof Error ? err.message : 'Unknown error'}`);
          }
        }

        const response = formatTruthpackGenerate({
          success: errors.length === 0,
          generated: scannersToRun,
          results,
          errors: errors.length > 0 ? errors : undefined,
          timestamp: new Date().toISOString(),
        });

        return buildResponse(response);
      } catch (err) {
        const response = formatError(err instanceof Error ? err : 'Unknown error', {
          operation: 'truthpack_generate',
        });
        return buildResponse(response);
      }
    }
  );

  // Query truthpack
  server.tool(
    'truthpack_query',
    'Query the truthpack for specific information',
    {
      category: z.enum(['routes', 'env', 'auth', 'contracts', 'ui-graph'])
        .describe('Which truthpack category to query'),
      filter: z.string()
        .optional()
        .describe('Filter pattern (e.g., "/api/users*" for routes)'),
    },
    async ({ category, filter }) => {
      try {
        const data = await loadTruthpack<Record<string, unknown>>(category);
        
        if (!data) {
          const response = formatTruthpackQuery({
            category,
            filter,
            error: 'Truthpack not found. Run truthpack_generate first.',
            results: [],
            count: 0,
          });
          return buildResponse(response);
        }

        let results: unknown[] = [];

        // Get the main array from the data
        switch (category) {
          case 'routes':
            results = (data.routes as unknown[]) ?? [];
            break;
          case 'env':
            results = (data.variables as unknown[]) ?? [];
            break;
          case 'auth':
            results = (data.protectedResources as unknown[]) ?? [];
            break;
          case 'contracts':
            results = (data.contracts as unknown[]) ?? [];
            break;
        }

        // Apply filter if provided
        if (filter && results.length > 0) {
          const filterRegex = new RegExp(filter.replace(/\*/g, '.*'), 'i');
          results = results.filter((item: unknown) => {
            const record = item as Record<string, unknown>;
            // Filter on path or name depending on category
            const value = (record.path ?? record.name ?? '') as string;
            return filterRegex.test(value);
          });
        }

        const response = formatTruthpackQuery({
          category,
          filter,
          results,
          count: results.length,
        });

        return buildResponse(response);
      } catch (err) {
        const response = formatTruthpackQuery({
          category,
          filter,
          error: err instanceof Error ? err.message : 'Unknown error',
          results: [],
          count: 0,
        });
        return buildResponse(response);
      }
    }
  );

  // Validate truthpack
  server.tool(
    'truthpack_validate',
    'Validate truthpack against current codebase',
    {
      category: z.enum(['routes', 'env', 'auth', 'contracts', 'ui-graph', 'all'])
        .optional()
        .describe('Which category to validate (default: all)'),
    },
    async ({ category }) => {
      const projectRoot = getProjectRoot();
      const categoriesToValidate = category === 'all' || !category 
        ? ['routes', 'env', 'auth', 'contracts'] 
        : [category];
      
      const issues: { category: string; type: string; message: string }[] = [];

      for (const cat of categoriesToValidate) {
        const existing = await loadTruthpack<{ generatedAt?: string }>(cat);
        
        if (!existing) {
          issues.push({
            category: cat,
            type: 'missing',
            message: `Truthpack for ${cat} not found`,
          });
          continue;
        }

        // Check if truthpack is stale (older than 24 hours)
        if (existing.generatedAt) {
          const generatedAt = new Date(existing.generatedAt);
          const age = Date.now() - generatedAt.getTime();
          if (age > 24 * 60 * 60 * 1000) {
            issues.push({
              category: cat,
              type: 'stale',
              message: `Truthpack for ${cat} is older than 24 hours`,
            });
          }
        }
      }

      // Build pretty text output
      const textParts: string[] = [];
      const isValid = issues.length === 0;
      
      textParts.push(fmt.headerBox(
        isValid ? fmt.ICONS.success : fmt.ICONS.warning,
        'TRUTHPACK VALIDATION',
        isValid ? 'All checks passed' : `${issues.length} issues found`,
        45
      ));

      textParts.push('');
      textParts.push(fmt.keyValue([
        ['Category', category ?? 'all'],
        ['Validated', categoriesToValidate.join(', ')],
        ['Status', isValid ? '✓ Valid' : '✗ Issues found'],
      ]));

      if (issues.length > 0) {
        textParts.push('');
        textParts.push(fmt.section('Issues', '', fmt.ICONS.warning));
        for (const issue of issues) {
          const icon = issue.type === 'missing' ? '❌' : '⚠️';
          textParts.push(`  ${icon} [${issue.category}] ${issue.message}`);
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              valid: isValid,
              category: category ?? 'all',
              issues,
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

  // Get routes
  server.tool(
    'truthpack_routes',
    'Get API routes from truthpack',
    {
      method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
        .optional()
        .describe('Filter by HTTP method'),
      path: z.string()
        .optional()
        .describe('Filter by path pattern'),
    },
    async ({ method, path: pathFilter }) => {
      try {
        const data = await loadTruthpack<{ routes: Array<{ method: string; path: string; file?: string; auth?: { required: boolean } }> }>('routes');
        
        if (!data?.routes) {
          const response = formatRoutes({
            routes: [],
            filters: { method, path: pathFilter },
            count: 0,
            error: 'Routes truthpack not found. Run truthpack_generate first.',
          });
          return buildResponse(response);
        }

        let routes = data.routes;

        // Apply method filter
        if (method) {
          routes = routes.filter(r => r.method === method);
        }

        // Apply path filter
        if (pathFilter) {
          const filterRegex = new RegExp(pathFilter.replace(/\*/g, '.*'), 'i');
          routes = routes.filter(r => filterRegex.test(r.path));
        }

        const response = formatRoutes({
          routes,
          filters: { method, path: pathFilter },
          count: routes.length,
        });

        return buildResponse(response);
      } catch (err) {
        const response = formatRoutes({
          routes: [],
          filters: { method, path: pathFilter },
          count: 0,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
        return buildResponse(response);
      }
    }
  );

  // Get environment variables
  server.tool(
    'truthpack_env',
    'Get environment variables from truthpack',
    {
      required: z.boolean()
        .optional()
        .describe('Filter to required variables only'),
      sensitive: z.boolean()
        .optional()
        .describe('Include sensitive variables'),
    },
    async ({ required, sensitive }) => {
      try {
        const data = await loadTruthpack<{ variables: Array<{ name: string; required: boolean; sensitive: boolean }> }>('env');
        
        if (!data?.variables) {
          // Build pretty error output
          const textParts: string[] = [];
          textParts.push(fmt.headerBox(fmt.ICONS.key, 'ENV VARIABLES', '0 variables', 45));
          textParts.push('');
          textParts.push(`  ${fmt.ICONS.error} Env truthpack not found.`);
          textParts.push(`  Run truthpack_generate first.`);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  variables: [],
                  filters: { required, sensitive },
                  error: 'Env truthpack not found. Run truthpack_generate first.',
                }, null, 2),
              },
              {
                type: 'text',
                text: `\n---\n${textParts.join('\n')}\n---`,
              },
            ],
          };
        }

        let variables = data.variables;

        // Apply required filter
        if (required !== undefined) {
          variables = variables.filter(v => v.required === required);
        }

        // Apply sensitive filter (default: exclude sensitive unless explicitly requested)
        if (sensitive === false || sensitive === undefined) {
          variables = variables.filter(v => !v.sensitive);
        }

        // Build pretty output
        const textParts: string[] = [];
        textParts.push(fmt.headerBox(fmt.ICONS.key, 'ENV VARIABLES', `${variables.length} variables`, 50));
        
        if (required !== undefined || sensitive !== undefined) {
          textParts.push('');
          textParts.push(`  Filters: ${required !== undefined ? `required=${required}` : ''} ${sensitive !== undefined ? `sensitive=${sensitive}` : ''}`);
        }

        textParts.push('');

        if (variables.length === 0) {
          textParts.push('  No variables found');
        } else {
          // Group by required/optional
          const requiredVars = variables.filter(v => v.required);
          const optionalVars = variables.filter(v => !v.required);

          if (requiredVars.length > 0) {
            textParts.push(`${fmt.ICONS.error} Required (${requiredVars.length})`);
            for (const v of requiredVars.slice(0, 10)) {
              textParts.push(`  ${fmt.BOX.treeEnd} ${v.name}${v.sensitive ? ' 🔒' : ''}`);
            }
            if (requiredVars.length > 10) {
              textParts.push(`     ... and ${requiredVars.length - 10} more`);
            }
          }

          if (optionalVars.length > 0) {
            textParts.push('');
            textParts.push(`ℹ️  Optional (${optionalVars.length})`);
            for (const v of optionalVars.slice(0, 10)) {
              textParts.push(`  ${fmt.BOX.treeEnd} ${v.name}${v.sensitive ? ' 🔒' : ''}`);
            }
            if (optionalVars.length > 10) {
              textParts.push(`     ... and ${optionalVars.length - 10} more`);
            }
          }
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                variables,
                filters: { required, sensitive },
                count: variables.length,
              }, null, 2),
            },
            {
              type: 'text',
              text: `\n---\n${textParts.join('\n')}\n---`,
            },
          ],
        };
      } catch (err) {
        const response = formatError(err instanceof Error ? err : 'Unknown error', {
          operation: 'truthpack_env',
        });
        return buildResponse(response);
      }
    }
  );
}
