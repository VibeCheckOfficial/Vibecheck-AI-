/**
 * Context Tools
 * 
 * MCP tools for gathering and managing context.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';

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

// Load a JSON file safely
const loadJson = async <T>(filePath: string): Promise<T | null> => {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
};

// Extract imports from file content
const extractImportsFromContent = (content: string): string[] => {
  const imports: string[] = [];
  const importRegex = /import\s+(?:{[^}]+}|\*\s+as\s+\w+|\w+)\s+from\s+['"]([^'"]+)['"]/g;
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }
  return imports;
};

export function registerContextTools(server: McpServer): void {
  // Gather context for a task
  server.tool(
    'context_gather',
    'Gather relevant context for a code generation task',
    {
      task: z.string().describe('Description of the task'),
      targetFile: z.string().optional().describe('Target file path'),
      maxTokens: z.number().optional().describe('Maximum context tokens'),
    },
    async ({ task, targetFile, maxTokens }) => {
      try {
        const projectRoot = getProjectRoot();
        const truthpackPath = getTruthpackPath();
        const knowledgePath = getKnowledgePath();

        // Load relevant truthpack data based on task keywords
        const taskLower = task.toLowerCase();
        const truthpack: Record<string, unknown> = {};

        // Load routes if task mentions API, endpoint, route
        if (taskLower.match(/api|endpoint|route|fetch|request/)) {
          const routes = await loadJson(path.join(truthpackPath, 'routes.json'));
          if (routes) truthpack.routes = routes;
        }

        // Load env if task mentions env, config, environment
        if (taskLower.match(/env|config|environment|variable/)) {
          const env = await loadJson(path.join(truthpackPath, 'env.json'));
          if (env) truthpack.env = env;
        }

        // Load auth if task mentions auth, login, permission, role
        if (taskLower.match(/auth|login|permission|role|protect|session/)) {
          const auth = await loadJson(path.join(truthpackPath, 'auth.json'));
          if (auth) truthpack.auth = auth;
        }

        // Load contracts if task mentions schema, type, contract, api
        if (taskLower.match(/schema|type|contract|api|interface/)) {
          const contracts = await loadJson(path.join(truthpackPath, 'contracts.json'));
          if (contracts) truthpack.contracts = contracts;
        }

        // Load conventions
        const conventions = await loadJson<{ conventions: unknown[] }>(
          path.join(knowledgePath, 'conventions.json')
        );

        // Load patterns
        const patterns = await loadJson<{ patterns: unknown[] }>(
          path.join(knowledgePath, 'patterns.json')
        );

        // Find related files if targetFile is specified
        const relatedFiles: string[] = [];
        if (targetFile) {
          // Get files in the same directory
          const targetDir = path.dirname(targetFile);
          try {
            const files = await glob('*.{ts,tsx,js,jsx}', {
              cwd: path.join(projectRoot, targetDir),
              ignore: ['node_modules/**'],
            });
            relatedFiles.push(...files.map(f => path.join(targetDir, f)));
          } catch {
            // Directory might not exist
          }
        }

        // Estimate tokens (rough: ~4 chars per token)
        const contextStr = JSON.stringify({ truthpack, conventions: conventions?.conventions, patterns: patterns?.patterns });
        const estimatedTokens = Math.ceil(contextStr.length / 4);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              task,
              targetFile,
              context: {
                truthpack,
                relatedFiles: relatedFiles.slice(0, 10),
                conventions: conventions?.conventions ?? [],
                patterns: patterns?.patterns ?? [],
              },
              totalTokens: estimatedTokens,
              maxTokens: maxTokens ?? 'unlimited',
            }, null, 2),
          }],
        };
      } catch (err) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              task,
              targetFile,
              context: { truthpack: {}, relatedFiles: [], conventions: [] },
              error: err instanceof Error ? err.message : 'Unknown error',
            }, null, 2),
          }],
        };
      }
    }
  );

  // Get context for a file
  server.tool(
    'context_for_file',
    'Get relevant context for editing a specific file',
    {
      filePath: z.string().describe('Path to the file'),
      includeImports: z.boolean().optional().describe('Include imported files'),
      includeImporters: z.boolean().optional().describe('Include files that import this one'),
    },
    async ({ filePath, includeImports, includeImporters }) => {
      try {
        const projectRoot = getProjectRoot();
        const fullPath = path.isAbsolute(filePath) 
          ? filePath 
          : path.join(projectRoot, filePath);

        // Read the file
        const fileContent = await fs.readFile(fullPath, 'utf-8');
        
        // Extract imports
        const imports = extractImportsFromContent(fileContent);

        // Find files that import this one (if requested)
        const importers: string[] = [];
        if (includeImporters) {
          const allFiles = await glob('**/*.{ts,tsx,js,jsx}', {
            cwd: projectRoot,
            ignore: ['node_modules/**', 'dist/**', 'build/**'],
          });

          const fileName = path.basename(filePath, path.extname(filePath));
          const relativePath = path.relative(projectRoot, fullPath).replace(/\\/g, '/');

          for (const file of allFiles.slice(0, 100)) { // Limit search
            try {
              const content = await fs.readFile(path.join(projectRoot, file), 'utf-8');
              if (content.includes(fileName) || content.includes(relativePath)) {
                const fileImports = extractImportsFromContent(content);
                if (fileImports.some(imp => 
                  imp.includes(fileName) || imp.endsWith(relativePath.replace(/\.[tj]sx?$/, ''))
                )) {
                  importers.push(file);
                }
              }
            } catch {
              // Skip files that can't be read
            }
          }
        }

        // Extract type references
        const typePattern = /(?:interface|type|class|enum)\s+(\w+)/g;
        const types: string[] = [];
        let match;
        while ((match = typePattern.exec(fileContent)) !== null) {
          types.push(match[1]);
        }

        // Load conventions
        const conventions = await loadJson<{ conventions: unknown[] }>(
          path.join(getKnowledgePath(), 'conventions.json')
        );

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              filePath,
              imports: includeImports !== false ? imports : [],
              importers: importers.slice(0, 20),
              relatedTypes: types,
              conventions: conventions?.conventions ?? [],
              fileInfo: {
                lines: fileContent.split('\n').length,
                size: fileContent.length,
              },
            }, null, 2),
          }],
        };
      } catch (err) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              filePath,
              imports: [],
              importers: [],
              relatedTypes: [],
              conventions: [],
              error: err instanceof Error ? err.message : 'Unknown error',
            }, null, 2),
          }],
        };
      }
    }
  );

  // Get project structure
  server.tool(
    'context_structure',
    'Get project structure overview',
    {
      depth: z.number().optional().describe('Directory depth (default: 3)'),
      includeFiles: z.boolean().optional().describe('Include file names'),
    },
    async ({ depth, includeFiles }) => {
      try {
        const projectRoot = getProjectRoot();
        const maxDepth = depth ?? 3;

        interface DirEntry {
          name: string;
          type: 'directory' | 'file';
          children?: DirEntry[];
        }

        const buildTree = async (dirPath: string, currentDepth: number): Promise<DirEntry[]> => {
          if (currentDepth > maxDepth) return [];

          const entries: DirEntry[] = [];
          const items = await fs.readdir(dirPath, { withFileTypes: true });

          for (const item of items) {
            // Skip hidden files and common ignore patterns
            if (item.name.startsWith('.') || 
                ['node_modules', 'dist', 'build', '.next', 'coverage'].includes(item.name)) {
              continue;
            }

            if (item.isDirectory()) {
              const children = await buildTree(
                path.join(dirPath, item.name),
                currentDepth + 1
              );
              entries.push({
                name: item.name,
                type: 'directory',
                children: children.length > 0 ? children : undefined,
              });
            } else if (includeFiles) {
              entries.push({
                name: item.name,
                type: 'file',
              });
            }
          }

          return entries.sort((a, b) => {
            // Directories first
            if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
            return a.name.localeCompare(b.name);
          });
        };

        const structure = await buildTree(projectRoot, 1);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              structure,
              depth: maxDepth,
              includeFiles: includeFiles ?? false,
            }, null, 2),
          }],
        };
      } catch (err) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              structure: {},
              depth: depth ?? 3,
              error: err instanceof Error ? err.message : 'Unknown error',
            }, null, 2),
          }],
        };
      }
    }
  );

  // Get conventions
  server.tool(
    'context_conventions',
    'Get project coding conventions',
    {
      category: z.string().optional().describe('Convention category (e.g., naming, imports)'),
    },
    async ({ category }) => {
      try {
        const conventionsPath = path.join(getKnowledgePath(), 'conventions.json');
        const data = await loadJson<{ conventions: Array<{ category: string; rules: unknown[] }> }>(conventionsPath);

        let conventions = data?.conventions ?? [];

        // Filter by category if specified
        if (category && conventions.length > 0) {
          conventions = conventions.filter(c => 
            c.category?.toLowerCase().includes(category.toLowerCase())
          );
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              conventions,
              category: category ?? 'all',
              count: conventions.length,
            }, null, 2),
          }],
        };
      } catch (err) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              conventions: [],
              category,
              error: err instanceof Error ? err.message : 'Unknown error',
            }, null, 2),
          }],
        };
      }
    }
  );

  // Update embeddings (placeholder - would require embedding model)
  server.tool(
    'context_update_embeddings',
    'Update context embeddings for semantic search',
    {
      files: z.array(z.string()).optional().describe('Specific files to update'),
      force: z.boolean().optional().describe('Force update all embeddings'),
    },
    async ({ files, force }) => {
      // This would require an embedding model integration
      // For now, return a placeholder response
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            updated: 0,
            force: force ?? false,
            files: files ?? [],
            note: 'Embedding updates require an embedding model integration. Consider using external embedding services.',
            suggestion: 'Run truthpack_generate to update the indexed code context instead.',
          }, null, 2),
        }],
      };
    }
  );
}
