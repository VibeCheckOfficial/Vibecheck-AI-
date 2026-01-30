/**
 * Forge Tools
 *
 * MCP tools for the Self-Aware Forge Engine.
 * Provides AI context generation, phase detection, and auto-updating.
 * Features enhanced multi-format output (JSON + pretty text + HTML).
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';
import { loadConfig } from '@repo/shared-config';
import { fmt } from '../ui/index.js';

// Get project root from centralized config or default to cwd
const getProjectRoot = (): string => {
  const config = loadConfig();
  return config.VIBECHECK_PROJECT_ROOT || process.cwd();
};

// Get forge paths
const getForgeContextPath = (): string => {
  return path.join(getProjectRoot(), '.vibecheck', 'forge-context.json');
};

const getForgeManifestPath = (): string => {
  return path.join(getProjectRoot(), '.vibecheck', 'forge-manifest.json');
};

export function registerForgeTools(server: McpServer): void {
  // ============================================================================
  // forge_generate - Generate or update AI context rules
  // ============================================================================

  server.tool(
    'forge_generate',
    'Generate or update AI context rules using the Forge engine. Creates optimized rules for Cursor, Windsurf, and other AI assistants.',
    {
      tier: z
        .enum(['minimal', 'standard', 'extended', 'comprehensive'])
        .optional()
        .describe('Rule tier: minimal (5), standard (10), extended (20), comprehensive (50)'),
      maxRules: z.number().optional().describe('Override max rules for tier'),
      incremental: z
        .boolean()
        .optional()
        .describe('Enable incremental mode - only regenerate changed rules (default: true)'),
      generateContract: z
        .boolean()
        .optional()
        .describe('Generate AI Contract defining allowed/forbidden actions (default: true)'),
      platforms: z
        .array(z.enum(['cursor', 'windsurf']))
        .optional()
        .describe('Target platforms (default: cursor, windsurf)'),
    },
    async ({ tier, maxRules, incremental, generateContract, platforms }) => {
      const projectRoot = getProjectRoot();

      try {
        // Dynamic import to avoid bundling issues
        const { forge } = await import('@vibecheck/core/forge');

        const output = await forge(projectRoot, {
          tier: tier ?? 'standard',
          maxRules: maxRules,
          incremental: incremental ?? true,
          generateContract: generateContract ?? true,
          platforms: platforms ?? ['cursor', 'windsurf'],
          verbose: false,
        });

        // Build pretty text output
        const textParts: string[] = [];
        textParts.push(fmt.headerBox(fmt.ICONS.sparkle, 'FORGE GENERATION', 'Complete', 50));
        textParts.push('');
        textParts.push(fmt.keyValue([
          ['Rules Generated', String(output.stats.rulesGenerated)],
          ['Files Written', String(output.stats.filesWritten)],
          ['Time', fmt.duration(output.stats.timeMs)],
          ['Mode', output.stats.incremental ? 'Incremental' : 'Full'],
        ]));

        if (output.stats.rulesSkipped > 0 || output.stats.rulesPruned > 0) {
          textParts.push('');
          textParts.push(`  ⏭️  ${output.stats.rulesSkipped} skipped, ${output.stats.rulesPruned} pruned`);
        }

        textParts.push('');
        textParts.push(fmt.section('Generated Rules', '', '📋'));
        
        const rulesByCategory: Record<string, Array<{ name: string; impact: number }>> = {};
        for (const r of output.manifest.rules) {
          if (!rulesByCategory[r.category]) rulesByCategory[r.category] = [];
          rulesByCategory[r.category].push({ name: r.name, impact: r.impact });
        }

        for (const [category, rules] of Object.entries(rulesByCategory)) {
          textParts.push(`\n  ${category} (${rules.length})`);
          for (const rule of rules.slice(0, 3)) {
            const impactBar = '█'.repeat(Math.ceil(rule.impact / 20));
            textParts.push(`    ${fmt.BOX.treeEnd} ${rule.name} ${impactBar}`);
          }
          if (rules.length > 3) {
            textParts.push(`       ... and ${rules.length - 3} more`);
          }
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  stats: {
                    rulesGenerated: output.stats.rulesGenerated,
                    filesWritten: output.stats.filesWritten,
                    timeMs: output.stats.timeMs,
                    incremental: output.stats.incremental,
                    rulesSkipped: output.stats.rulesSkipped,
                    rulesPruned: output.stats.rulesPruned,
                  },
                  files: output.files,
                  contractGenerated: !!output.contract,
                  rules: output.manifest.rules.map((r) => ({
                    id: r.id,
                    category: r.category,
                    name: r.name,
                    impact: r.impact,
                  })),
                },
                null,
                2
              ),
            },
            {
              type: 'text',
              text: `\n---\n${textParts.join('\n')}\n---`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: false,
                  error: error instanceof Error ? error.message : String(error),
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // ============================================================================
  // forge_status - Get current Forge status
  // ============================================================================

  server.tool(
    'forge_status',
    'Get current Forge status including phase, rule count, and last update time.',
    {},
    async () => {
      const projectRoot = getProjectRoot();

      try {
        const contextPath = getForgeContextPath();
        const manifestPath = getForgeManifestPath();

        let context = null;
        let manifest = null;

        try {
          const contextContent = await fs.readFile(contextPath, 'utf-8');
          context = JSON.parse(contextContent);
        } catch {
          // No context file
        }

        try {
          const manifestContent = await fs.readFile(manifestPath, 'utf-8');
          manifest = JSON.parse(manifestContent);
        } catch {
          // No manifest file
        }

        const status = {
          initialized: !!manifest,
          phase: context?.currentPhase ?? 'unknown',
          ruleCount: manifest?.rules?.length ?? 0,
          lastUpdate: manifest?.generatedAt ?? null,
          consecutiveSamePhase: context?.consecutiveSamePhase ?? 0,
          changeVelocity: context?.changeVelocity ?? 0,
          phaseHistory: context?.phaseHistory?.slice(-5) ?? [],
          analysisHistory: context?.analysisHistory?.slice(-5) ?? [],
          manifest: manifest
            ? {
                version: manifest.version,
                tier: manifest.config?.tier,
                platforms: manifest.config?.platforms,
                filesWritten: manifest.stats?.filesWritten,
              }
            : null,
        };

        // Build pretty text output
        const phaseIcons: Record<string, string> = {
          prototyping: '🧪',
          active_development: '🔨',
          refactoring: '🔄',
          maintenance: '🔧',
          unknown: '❓',
        };

        const textParts: string[] = [];
        textParts.push(fmt.headerBox(fmt.ICONS.gear, 'FORGE STATUS', status.phase, 50));
        textParts.push('');
        
        const icon = phaseIcons[status.phase] ?? '📊';
        textParts.push(fmt.keyValue([
          ['Initialized', status.initialized ? '✓ Yes' : '✗ No'],
          ['Phase', `${icon} ${status.phase}`],
          ['Rules', String(status.ruleCount)],
          ['Last Update', status.lastUpdate ? new Date(status.lastUpdate).toLocaleString() : 'Never'],
        ]));

        if (status.manifest) {
          textParts.push('');
          textParts.push(fmt.section('Manifest', '', '📋'));
          textParts.push(fmt.keyValue([
            ['Version', status.manifest.version ?? 'N/A'],
            ['Tier', status.manifest.tier ?? 'N/A'],
            ['Platforms', (status.manifest.platforms ?? []).join(', ')],
          ]));
        }

        if (status.phaseHistory.length > 0) {
          textParts.push('');
          textParts.push(fmt.section('Phase History', '', '📈'));
          textParts.push(`  ${status.phaseHistory.join(' → ')}`);
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(status, null, 2),
            },
            {
              type: 'text',
              text: `\n---\n${textParts.join('\n')}\n---`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: false,
                  error: error instanceof Error ? error.message : String(error),
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // ============================================================================
  // forge_phase - Get detailed phase analysis
  // ============================================================================

  server.tool(
    'forge_phase',
    'Analyze and detect the current project phase using 8 weighted signals.',
    {
      analyzeGitHistory: z
        .boolean()
        .optional()
        .describe('Include git history in analysis (default: true)'),
    },
    async ({ analyzeGitHistory }) => {
      const projectRoot = getProjectRoot();

      try {
        const { detectPhase } = await import('@vibecheck/core/forge');

        const result = await detectPhase({
          projectPath: projectRoot,
          analyzeGitHistory: analyzeGitHistory ?? true,
          transitionThreshold: 3,
          minConfidence: 0.7,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  phase: result.phase,
                  confidence: Math.round(result.confidence * 100) / 100,
                  phaseChanged: result.phaseChanged,
                  previousPhase: result.previousPhase,
                  signals: result.signals.map((s) => ({
                    name: s.name,
                    score: Math.round(s.score),
                    weight: `${Math.round(s.weight * 100)}%`,
                    explanation: s.explanation,
                  })),
                  phaseScores: Object.fromEntries(
                    Object.entries(result.phaseScores).map(([k, v]) => [k, Math.round(v)])
                  ),
                  detectedAt: result.detectedAt,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: false,
                  error: error instanceof Error ? error.message : String(error),
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // ============================================================================
  // forge_analyze - Run project analysis
  // ============================================================================

  server.tool(
    'forge_analyze',
    'Run comprehensive project analysis to understand codebase structure, patterns, and conventions.',
    {
      includeComplexity: z
        .boolean()
        .optional()
        .describe('Include complexity analysis (slower)'),
      includePatterns: z
        .boolean()
        .optional()
        .describe('Include pattern learning (slower)'),
      includeCoverage: z
        .boolean()
        .optional()
        .describe('Include test coverage analysis if available'),
    },
    async ({ includeComplexity, includePatterns, includeCoverage }) => {
      const projectRoot = getProjectRoot();

      try {
        const { analyzeProject, DEFAULT_FORGE_CONFIG } = await import(
          '@vibecheck/core/forge'
        );

        const analysis = await analyzeProject(projectRoot, DEFAULT_FORGE_CONFIG);

        const result: Record<string, unknown> = {
          name: analysis.name,
          framework: analysis.framework,
          language: analysis.language,
          architecture: analysis.architecture,
          stats: analysis.stats,
          components: {
            count: analysis.components.length,
            samples: analysis.components.slice(0, 10).map((c) => c.name),
          },
          apiRoutes: {
            count: analysis.apiRoutes.length,
            samples: analysis.apiRoutes.slice(0, 10).map((r) => `${r.method} ${r.path}`),
          },
          models: {
            count: analysis.models.length,
            names: analysis.models.map((m) => m.name),
          },
          types: {
            interfaces: analysis.types.interfaces.length,
            types: analysis.types.types.length,
            enums: analysis.types.enums.length,
          },
          patterns: {
            stateManagement: analysis.patterns.stateManagement || 'none',
            testing: analysis.patterns.testing,
            styling: analysis.patterns.styling,
            validation: analysis.patterns.validation || 'none',
            authentication: analysis.patterns.authentication || 'none',
            hooks: analysis.patterns.hooks.length,
          },
          monorepo: analysis.monorepo.isMonorepo
            ? {
                type: analysis.monorepo.type,
                workspaces: analysis.monorepo.workspaces.length,
              }
            : null,
          envVars: {
            total: analysis.envVars.variables.length,
            sensitive: analysis.envVars.sensitive.length,
            missing: analysis.envVars.missing.length,
          },
        };

        // Optional: complexity analysis
        if (includeComplexity) {
          try {
            const { calculateProjectComplexity } = await import(
              '@vibecheck/core/forge'
            );
            const complexity = await calculateProjectComplexity(projectRoot);
            result.complexity = {
              healthScore: complexity.healthScore,
              averageComplexity: complexity.averageComplexity,
              hotspots: complexity.hotspots.slice(0, 5),
              tiers: {
                low: complexity.complexityTiers.low.length,
                medium: complexity.complexityTiers.medium.length,
                high: complexity.complexityTiers.high.length,
                critical: complexity.complexityTiers.critical.length,
              },
            };
          } catch {
            result.complexity = { error: 'Failed to analyze complexity' };
          }
        }

        // Optional: pattern learning
        if (includePatterns) {
          try {
            const { learnPatterns } = await import('@vibecheck/core/forge');
            const patterns = await learnPatterns(projectRoot);
            result.learnedPatterns = {
              namingConventions: patterns.namingConventions,
              fileOrganization: patterns.fileOrganization,
              errorHandlingStyle: patterns.errorHandlingStyle,
              commonSignatures: patterns.commonSignatures.slice(0, 5),
              patternCount: patterns.patterns.length,
            };
          } catch {
            result.learnedPatterns = { error: 'Failed to learn patterns' };
          }
        }

        // Optional: coverage analysis
        if (includeCoverage) {
          try {
            const { analyzeCoverage } = await import('@vibecheck/core/forge');
            const coverage = await analyzeCoverage(projectRoot);
            result.coverage = coverage.available
              ? {
                  source: coverage.source,
                  overall: coverage.overall,
                  untestedFiles: coverage.untestedFiles.length,
                  lowCoverageFiles: coverage.lowCoverageFiles.length,
                }
              : { available: false };
          } catch {
            result.coverage = { error: 'Failed to analyze coverage' };
          }
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: false,
                  error: error instanceof Error ? error.message : String(error),
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // ============================================================================
  // forge_rules - List generated rules
  // ============================================================================

  server.tool(
    'forge_rules',
    'List all generated AI context rules with their categories and impact scores.',
    {
      category: z
        .string()
        .optional()
        .describe('Filter by category (e.g., "architecture", "components", "testing")'),
    },
    async ({ category }) => {
      try {
        const manifestPath = getForgeManifestPath();
        const manifestContent = await fs.readFile(manifestPath, 'utf-8');
        const manifest = JSON.parse(manifestContent);

        let rules = manifest.rules ?? [];

        if (category) {
          rules = rules.filter(
            (r: { category: string }) =>
              r.category.toLowerCase() === category.toLowerCase()
          );
        }

        // Sort by impact
        rules.sort((a: { impact: number }, b: { impact: number }) => b.impact - a.impact);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  totalRules: manifest.rules?.length ?? 0,
                  filteredRules: rules.length,
                  category: category ?? 'all',
                  rules: rules.map(
                    (r: {
                      id: string;
                      category: string;
                      name: string;
                      impact: number;
                      outputFile: string;
                    }) => ({
                      id: r.id,
                      category: r.category,
                      name: r.name,
                      impact: r.impact,
                      file: r.outputFile,
                    })
                  ),
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: false,
                  error:
                    'No rules found. Run forge_generate first to create rules.',
                  details: error instanceof Error ? error.message : String(error),
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // ============================================================================
  // forge_contract - Get AI Contract
  // ============================================================================

  server.tool(
    'forge_contract',
    'Get the AI Contract defining allowed and forbidden actions for this project.',
    {},
    async () => {
      try {
        const contractPath = path.join(
          getProjectRoot(),
          '.vibecheck',
          'ai-contract.json'
        );
        const contractContent = await fs.readFile(contractPath, 'utf-8');
        const contract = JSON.parse(contractContent);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  version: contract.version,
                  projectId: contract.projectId,
                  generatedAt: contract.generatedAt,
                  summary: {
                    allowedActions: contract.allowed?.length ?? 0,
                    forbiddenActions: contract.forbidden?.length ?? 0,
                    confirmationRequired: contract.requiresConfirmation?.length ?? 0,
                  },
                  allowed: contract.allowed,
                  forbidden: contract.forbidden,
                  requiresConfirmation: contract.requiresConfirmation,
                  fileBoundaries: contract.fileBoundaries,
                  codeStandards: contract.codeStandards,
                  safetyRules: {
                    critical: contract.safetyRules?.critical?.length ?? 0,
                    high: contract.safetyRules?.high?.length ?? 0,
                    standard: contract.safetyRules?.standard?.length ?? 0,
                  },
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: false,
                  error:
                    'No AI Contract found. Run forge_generate with generateContract: true.',
                  details: error instanceof Error ? error.message : String(error),
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // ============================================================================
  // forge_reset - Reset Forge state
  // ============================================================================

  server.tool(
    'forge_reset',
    'Reset Forge state and clear generated files. Use with caution.',
    {
      clearRules: z
        .boolean()
        .optional()
        .describe('Delete generated rule files (default: false)'),
      clearContext: z
        .boolean()
        .optional()
        .describe('Clear context memory (default: false)'),
      clearManifest: z
        .boolean()
        .optional()
        .describe('Delete manifest file (default: false)'),
    },
    async ({ clearRules, clearContext, clearManifest }) => {
      const projectRoot = getProjectRoot();
      const deleted: string[] = [];
      const errors: string[] = [];

      try {
        // Clear context memory
        if (clearContext) {
          try {
            await fs.unlink(getForgeContextPath());
            deleted.push('forge-context.json');
          } catch {
            // File may not exist
          }
        }

        // Clear manifest
        if (clearManifest) {
          try {
            await fs.unlink(getForgeManifestPath());
            deleted.push('forge-manifest.json');
          } catch {
            // File may not exist
          }
        }

        // Clear rules
        if (clearRules) {
          const rulePaths = [
            path.join(projectRoot, '.cursorrules'),
            path.join(projectRoot, '.cursor', 'rules'),
            path.join(projectRoot, '.cursor', 'agents'),
            path.join(projectRoot, '.cursor', 'skills'),
            path.join(projectRoot, '.cursor', 'hooks'),
            path.join(projectRoot, '.windsurf', 'rules'),
            path.join(projectRoot, '.vibecheck', 'ai-contract.json'),
            path.join(projectRoot, '.vibecheck', 'AI_CONTRACT.md'),
          ];

          for (const rulePath of rulePaths) {
            try {
              const stat = await fs.stat(rulePath);
              if (stat.isDirectory()) {
                await fs.rm(rulePath, { recursive: true });
              } else {
                await fs.unlink(rulePath);
              }
              deleted.push(path.relative(projectRoot, rulePath));
            } catch {
              // Path may not exist
            }
          }
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  deleted,
                  errors: errors.length > 0 ? errors : undefined,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: false,
                  error: error instanceof Error ? error.message : String(error),
                  deleted,
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // ============================================================================
  // forge_memory_record - Record a conversation or event in memory
  // ============================================================================

  server.tool(
    'forge_memory_record',
    'Record a conversation, decision, or learning in the enhanced memory system. Call this to help Forge learn from interactions.',
    {
      type: z
        .enum(['conversation', 'decision', 'insight', 'code_change', 'lesson'])
        .describe('Type of memory to record'),
      summary: z.string().describe('Summary of what happened'),
      details: z.record(z.unknown()).optional().describe('Additional details'),
      tags: z.array(z.string()).optional().describe('Tags for categorization'),
      outcome: z
        .enum(['success', 'partial', 'failed', 'abandoned'])
        .optional()
        .describe('Outcome of the interaction'),
      filesModified: z.array(z.string()).optional().describe('Files that were modified'),
      lessons: z.array(z.string()).optional().describe('Lessons learned'),
    },
    async ({ type, summary, details, tags, outcome, filesModified, lessons }) => {
      const projectRoot = getProjectRoot();

      try {
        const { loadEnhancedMemory } = await import('@vibecheck/core/forge');
        const memory = loadEnhancedMemory(projectRoot);

        switch (type) {
          case 'conversation':
            memory.recordConversation({
              source: 'cursor',
              summary,
              decisions: (details?.decisions as Array<{
                question: string;
                decision: string;
                rationale: string;
                alternatives: string[];
                confidence: number;
              }>) ?? [],
              patternsDiscussed: (details?.patterns as string[]) ?? [],
              filesModified: filesModified ?? [],
              lessons: lessons ?? [],
              outcome: outcome ?? 'success',
              tags: tags ?? [],
            });
            break;

          case 'decision':
            // Record as timeline event
            memory.addTimelineEvent({
              type: 'milestone',
              title: `Decision: ${summary.substring(0, 50)}`,
              description: summary,
              metadata: details ?? {},
              impact: 'medium',
              relatedFiles: filesModified,
            });
            break;

          case 'insight':
            memory.addInsight({
              category: (details?.category as 'architecture' | 'pattern' | 'anti-pattern' | 'convention' | 'dependency' | 'performance' | 'security') ?? 'pattern',
              insight: summary,
              evidence: (details?.evidence as string[]) ?? [],
              confidence: (details?.confidence as number) ?? 0.7,
              occurrences: 1,
              applicableFiles: filesModified ?? [],
              validated: false,
            });
            break;

          case 'code_change':
            memory.recordCodeChange({
              type: (details?.changeType as 'create' | 'modify' | 'delete' | 'rename' | 'refactor') ?? 'modify',
              filePath: filesModified?.[0] ?? 'unknown',
              changeDescription: summary,
              linesAdded: (details?.linesAdded as number) ?? 0,
              linesRemoved: (details?.linesRemoved as number) ?? 0,
              complexityDelta: (details?.complexityDelta as number) ?? 0,
              breaking: (details?.breaking as boolean) ?? false,
              relatedTo: details?.relatedTo as string,
            });
            break;

          case 'lesson':
            // Add lesson as insight
            memory.addInsight({
              category: 'convention',
              insight: summary,
              evidence: lessons ?? [],
              confidence: 0.8,
              occurrences: 1,
              applicableFiles: filesModified ?? [],
              validated: true,
            });
            break;
        }

        memory.save();
        memory.dispose();

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                recorded: type,
                summary: summary.substring(0, 100),
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error),
              }, null, 2),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // ============================================================================
  // forge_memory_query - Search the enhanced memory
  // ============================================================================

  server.tool(
    'forge_memory_query',
    'Search the enhanced memory for relevant information, past conversations, insights, and lessons learned.',
    {
      query: z.string().describe('Search query'),
      types: z
        .array(z.enum(['conversation', 'insight', 'timeline', 'knowledge']))
        .optional()
        .describe('Types of memory to search'),
      limit: z.number().optional().describe('Maximum results (default: 10)'),
    },
    async ({ query, types, limit }) => {
      const projectRoot = getProjectRoot();

      try {
        const { loadEnhancedMemory } = await import('@vibecheck/core/forge');
        const memory = loadEnhancedMemory(projectRoot);

        const results = memory.semanticSearch(query, limit ?? 10);

        // Filter by types if specified
        const filtered = types
          ? results.filter((r) => types.includes(r.type))
          : results;

        memory.dispose();

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                query,
                resultCount: filtered.length,
                results: filtered.map((r) => ({
                  type: r.type,
                  relevance: r.relevance,
                  item: r.item,
                })),
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error),
              }, null, 2),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // ============================================================================
  // forge_memory_stats - Get memory statistics
  // ============================================================================

  server.tool(
    'forge_memory_stats',
    'Get statistics about the enhanced memory system.',
    {},
    async () => {
      const projectRoot = getProjectRoot();

      try {
        const { loadEnhancedMemory } = await import('@vibecheck/core/forge');
        const memory = loadEnhancedMemory(projectRoot);

        const stats = memory.getStats();
        const prefs = memory.getPreferences();
        const topRules = memory.getTopPerformingRules(5);
        const lessons = memory.getAllLessons().slice(0, 10);

        memory.dispose();

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                stats,
                preferences: {
                  naming: prefs.naming,
                  architecture: prefs.architecture.folderStructure,
                  testing: prefs.testing.framework,
                  confidence: prefs.confidence,
                },
                topPerformingRules: topRules.map((r) => ({
                  id: r.ruleId,
                  score: r.score,
                  applications: r.applicationCount,
                })),
                recentLessons: lessons,
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error),
              }, null, 2),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // ============================================================================
  // forge_memory_timeline - Get project timeline
  // ============================================================================

  server.tool(
    'forge_memory_timeline',
    'Get the project timeline showing major events and milestones.',
    {
      limit: z.number().optional().describe('Number of events (default: 20)'),
      type: z
        .string()
        .optional()
        .describe('Filter by event type'),
    },
    async ({ limit, type }) => {
      const projectRoot = getProjectRoot();

      try {
        const { loadEnhancedMemory } = await import('@vibecheck/core/forge');
        const memory = loadEnhancedMemory(projectRoot);

        let events = memory.getRecentEvents(limit ?? 20);

        if (type) {
          events = events.filter((e) => e.type === type);
        }

        memory.dispose();

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                eventCount: events.length,
                events: events.map((e) => ({
                  timestamp: e.timestamp,
                  type: e.type,
                  title: e.title,
                  impact: e.impact,
                  relatedFiles: e.relatedFiles?.slice(0, 3),
                })),
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error),
              }, null, 2),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // ============================================================================
  // forge_rule_feedback - Provide feedback on a rule
  // ============================================================================

  server.tool(
    'forge_rule_feedback',
    'Provide feedback on a generated rule to help Forge learn and improve.',
    {
      ruleId: z.string().describe('ID of the rule'),
      helpful: z.boolean().describe('Was the rule helpful?'),
      rating: z.number().min(1).max(5).optional().describe('Rating 1-5'),
      modification: z.string().optional().describe('What modification was made'),
      context: z.string().optional().describe('In what context was this used'),
    },
    async ({ ruleId, helpful, rating, modification, context }) => {
      const projectRoot = getProjectRoot();

      try {
        const { loadEnhancedMemory } = await import('@vibecheck/core/forge');
        const memory = loadEnhancedMemory(projectRoot);

        memory.recordRuleApplication(ruleId, helpful, context);

        if (rating) {
          memory.recordRuleRating(ruleId, rating);
        }

        if (modification) {
          memory.recordRuleModification(ruleId, modification);
        }

        const effectiveness = memory.getRuleEffectiveness(ruleId);
        memory.save();
        memory.dispose();

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                ruleId,
                newScore: effectiveness?.score ?? 0,
                totalApplications: effectiveness?.applicationCount ?? 0,
                message: 'Thank you! This feedback helps Forge learn and improve.',
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error),
              }, null, 2),
            },
          ],
          isError: true,
        };
      }
    }
  );
}
