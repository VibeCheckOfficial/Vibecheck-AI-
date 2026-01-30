/**
 * Forge - AI Context Generator
 *
 * Generates the smallest set of rules that produce the biggest accuracy lift.
 * "Minimal but lethal" - 5-10 rules max by default, expandable tiers.
 *
 * @module forge
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import type {
  ForgeConfig,
  ForgeManifest,
  ForgeOutput,
  AIContract,
  ProjectAnalysis,
  RuleTier,
} from './types.js';
import { DEFAULT_FORGE_CONFIG, TIER_CONFIGS } from './types.js';
import { analyzeProject } from './analyzer.js';
import { generateMinimalRules } from './rule-generator.js';
import { generateAIContract, formatContractAsMarkdown } from './contract-generator.js';
import { generateManifest } from './manifest.js';
import { generateIncrementalDiff, pruneStaleRules } from './incremental.js';
import {
  writeCursorRules,
  writeWindsurfRules,
  writeSubagents,
  writeSkills,
  writeHooks,
  ensureDir,
} from './writers.js';
import {
  detectIDE,
  shouldGenerateForPlatform,
  getIDEDisplayName,
  type DetectedIDE,
  type IDEDetectionResult,
} from './ide-detector.js';

/**
 * Main Forge entry point - generates optimized AI context
 */
export async function forge(
  projectPath: string,
  options: Partial<ForgeConfig> = {}
): Promise<ForgeOutput> {
  const config: ForgeConfig = { ...DEFAULT_FORGE_CONFIG, ...options };
  const startTime = Date.now();

  // Resolve project path
  const absProjectPath = path.resolve(projectPath);

  // IDE Detection - auto-detect which platforms to generate rules for
  let ideDetection: IDEDetectionResult | null = null;
  let effectivePlatforms = config.platforms;

  if (config.autoDetectIDE !== false) {
    ideDetection = detectIDE(absProjectPath);

    // If platforms not explicitly set or set to auto, use detected platforms
    if (!options.platforms || options.platforms.length === 0) {
      effectivePlatforms = ideDetection.recommendedPlatforms as ('cursor' | 'windsurf')[];
      if (config.verbose) {
        // eslint-disable-next-line no-console
        console.log(`🔍 IDE Detection: ${getIDEDisplayName(ideDetection.ide)} (${Math.round(ideDetection.confidence * 100)}% confidence)`);
        // eslint-disable-next-line no-console
        console.log(`   Generating rules for: ${effectivePlatforms.join(', ')}`);
      }
    }
  }

  // Initialize output structure
  const output: ForgeOutput = {
    files: [],
    manifest: null as unknown as ForgeManifest,
    contract: null,
    stats: {
      rulesGenerated: 0,
      filesWritten: 0,
      timeMs: 0,
      incremental: false,
      rulesSkipped: 0,
      rulesPruned: 0,
    },
  };

  // Load existing manifest for incremental mode
  let existingManifest: ForgeManifest | null = null;
  const manifestPath = path.join(absProjectPath, '.vibecheck', 'forge-manifest.json');

  if (config.incremental && fs.existsSync(manifestPath)) {
    try {
      existingManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      output.stats.incremental = true;
    } catch {
      // Invalid manifest, regenerate everything
    }
  }

  // Analyze project
  const analysis = await analyzeProject(absProjectPath, config);

  // Calculate content hash for change detection
  const contentHash = calculateContentHash(analysis);

  // Check if regeneration is needed
  if (existingManifest && existingManifest.contentHash === contentHash && config.incremental) {
    // No changes detected, return cached output
    return {
      ...output,
      manifest: existingManifest,
      stats: {
        ...output.stats,
        timeMs: Date.now() - startTime,
        rulesSkipped: existingManifest.rules.length,
      },
    };
  }

  // Generate incremental diff if we have an existing manifest
  let diff = null;
  if (existingManifest) {
    diff = generateIncrementalDiff(existingManifest, analysis);
    output.stats.rulesPruned = diff.removed.length;
  }

  // Get tier configuration
  const tierConfig = TIER_CONFIGS[config.tier];
  const maxRules = config.maxRules || tierConfig.maxRules;

  // Generate minimal but lethal rules
  const rules = generateMinimalRules(analysis, {
    maxRules,
    tier: config.tier,
    features: tierConfig.features,
    diff,
  });

  output.stats.rulesGenerated = rules.length;

  // Generate AI Contract (what the agent may/may not do)
  if (config.generateContract) {
    output.contract = generateAIContract(analysis, rules);
  }

  // Create manifest
  output.manifest = generateManifest({
    projectPath: absProjectPath,
    contentHash,
    rules,
    contract: output.contract,
    config,
    analysis,
  });

  // Write files for each platform (using auto-detected platforms if enabled)
  const filesWritten: string[] = [];

  if (effectivePlatforms.includes('cursor')) {
    filesWritten.push(...writeCursorRules(absProjectPath, rules, output.contract));
    filesWritten.push(...writeSubagents(absProjectPath, analysis));
    filesWritten.push(...writeSkills(absProjectPath, analysis));
    filesWritten.push(...writeHooks(absProjectPath, analysis));
  }

  if (effectivePlatforms.includes('windsurf')) {
    filesWritten.push(...writeWindsurfRules(absProjectPath, rules, output.contract));
  }

  // Write contract file
  if (output.contract) {
    const contractPath = path.join(absProjectPath, '.vibecheck', 'ai-contract.json');
    ensureDir(path.dirname(contractPath));
    fs.writeFileSync(contractPath, JSON.stringify(output.contract, null, 2));
    filesWritten.push('.vibecheck/ai-contract.json');

    // Also write human-readable contract
    const contractMdPath = path.join(absProjectPath, '.vibecheck', 'AI_CONTRACT.md');
    fs.writeFileSync(contractMdPath, formatContractAsMarkdown(output.contract));
    filesWritten.push('.vibecheck/AI_CONTRACT.md');
  }

  // Write manifest file
  ensureDir(path.dirname(manifestPath));
  fs.writeFileSync(manifestPath, JSON.stringify(output.manifest, null, 2));
  filesWritten.push('.vibecheck/forge-manifest.json');

  // Prune stale rules if incremental
  if (diff && diff.removed.length > 0) {
    pruneStaleRules(absProjectPath, diff.removed);
  }

  output.files = filesWritten;
  output.stats.filesWritten = filesWritten.length;
  output.stats.timeMs = Date.now() - startTime;

  return output;
}

/**
 * Calculate content hash for change detection
 */
function calculateContentHash(analysis: ProjectAnalysis): string {
  const content = JSON.stringify({
    components: analysis.components,
    routes: analysis.apiRoutes,
    types: analysis.types,
    patterns: analysis.patterns,
    envVars: analysis.envVars,
    models: analysis.models,
    stats: analysis.stats,
  });

  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

/**
 * CLI-friendly entry point
 */
export async function runForge(args: string[]): Promise<number> {
  const options = parseArgs(args);

  if (options.help) {
    printHelp();
    return 0;
  }

  try {
    const output = await forge(options.path, options);

    // eslint-disable-next-line no-console
    console.log('\n🔥 FORGE COMPLETE\n');
    // eslint-disable-next-line no-console
    console.log(`Files generated: ${output.stats.filesWritten}`);
    // eslint-disable-next-line no-console
    console.log(`Rules created: ${output.stats.rulesGenerated}`);
    // eslint-disable-next-line no-console
    console.log(`Rules skipped: ${output.stats.rulesSkipped}`);
    // eslint-disable-next-line no-console
    console.log(`Rules pruned: ${output.stats.rulesPruned}`);
    // eslint-disable-next-line no-console
    console.log(`Time: ${output.stats.timeMs}ms`);
    // eslint-disable-next-line no-console
    console.log(`Incremental: ${output.stats.incremental ? 'Yes' : 'No'}`);

    if (output.contract) {
      // eslint-disable-next-line no-console
      console.log('\n📜 AI Contract generated');
      // eslint-disable-next-line no-console
      console.log(`  Allowed actions: ${output.contract.allowed.length}`);
      // eslint-disable-next-line no-console
      console.log(`  Forbidden actions: ${output.contract.forbidden.length}`);
    }

    // eslint-disable-next-line no-console
    console.log('\nGenerated files:');
    output.files.forEach((f) => {
      // eslint-disable-next-line no-console
      console.log(`  • ${f}`);
    });

    return 0;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Forge failed:', error);
    return 1;
  }
}

function parseArgs(args: string[]): ForgeConfig & { help: boolean; path: string } {
  const opts: ForgeConfig & { help: boolean; path: string } = {
    ...DEFAULT_FORGE_CONFIG,
    help: false,
    path: '.',
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') opts.help = true;
    if (arg === '--path' || arg === '-p') opts.path = args[++i];
    if (arg.startsWith('--path=')) opts.path = arg.split('=')[1];
    if (arg === '--tier' || arg === '-t') opts.tier = args[++i] as RuleTier;
    if (arg.startsWith('--tier=')) opts.tier = arg.split('=')[1] as RuleTier;
    if (arg === '--max-rules') opts.maxRules = parseInt(args[++i]);
    if (arg.startsWith('--max-rules=')) opts.maxRules = parseInt(arg.split('=')[1]);
    if (arg === '--no-incremental') opts.incremental = false;
    if (arg === '--no-contract') opts.generateContract = false;
    if (arg === '--verbose' || arg === '-v') opts.verbose = true;
    if (arg === '--cursor-only') opts.platforms = ['cursor'];
    if (arg === '--windsurf-only') opts.platforms = ['windsurf'];
    if (arg === '--auto-detect' || arg === '--auto-detect-ide') opts.autoDetectIDE = true;
    if (arg === '--no-auto-detect') opts.autoDetectIDE = false;
    if (arg === '--all-platforms') {
      opts.platforms = ['cursor', 'windsurf'];
      opts.autoDetectIDE = false;
    }
    if (arg === 'minimal') opts.tier = 'minimal';
    if (arg === 'standard') opts.tier = 'standard';
    if (arg === 'extended') opts.tier = 'extended';
    if (arg === 'comprehensive') opts.tier = 'comprehensive';
  }

  return opts;
}

function printHelp(): void {
  // eslint-disable-next-line no-console
  console.log(`
🔥 FORGE - AI Context Generator v1.0

Generate the smallest set of rules that produce the biggest accuracy lift.
"Minimal but lethal" - 5-10 rules max by default, expandable tiers.

USAGE:
  forge [options] [tier]

TIERS:
  minimal          5 rules max - core essentials only
  standard         10 rules max - balanced coverage (default)
  extended         20 rules max - comprehensive coverage
  comprehensive    50 rules max - everything included

OPTIONS:
  --path, -p <dir>       Project directory (default: current)
  --tier, -t <tier>      Rule tier (minimal|standard|extended|comprehensive)
  --max-rules <n>        Override max rules for tier
  --no-incremental       Regenerate all rules (don't diff)
  --no-contract          Skip AI contract generation
  --cursor-only          Generate only Cursor rules
  --windsurf-only        Generate only Windsurf rules
  --auto-detect          Auto-detect IDE (default behavior)
  --no-auto-detect       Disable IDE auto-detection
  --all-platforms        Generate rules for ALL platforms (no auto-detect)
  --verbose, -v          Show detailed output
  --help, -h             Show this help

IDE DETECTION:
  By default, Forge auto-detects which IDE you're using (Cursor vs Windsurf)
  and ONLY generates rules for that IDE. This avoids repo bloat from unused
  rule files. Use --all-platforms to generate for both IDEs.

OUTPUTS:
  .cursorrules           Main Cursor rules file
  .cursor/rules/*.mdc    MDC specification files
  .cursor/skills/        Auto-generated skills
  .cursor/agents/        Subagent definitions
  .cursor/hooks/         Automation hooks
  .windsurf/rules/       Windsurf rules
  .vibecheck/ai-contract.json    AI Contract
  .vibecheck/AI_CONTRACT.md      Human-readable contract
  .vibecheck/forge-manifest.json Manifest for incremental updates

EXAMPLES:
  forge                          # Standard tier, incremental
  forge minimal                  # Minimal tier (5 rules)
  forge --max-rules=7            # Custom rule count
  forge --no-incremental         # Force full regeneration
`);
}

// Export all sub-modules
export * from './types.js';
export { analyzeProject } from './analyzer.js';
export { generateMinimalRules, scoreRuleImpact } from './rule-generator.js';
export { generateAIContract, validateContract, formatContractAsMarkdown } from './contract-generator.js';
export { generateManifest, validateManifest, updateManifest } from './manifest.js';
export { generateIncrementalDiff, applyIncrementalDiff, pruneStaleRules } from './incremental.js';
export {
  writeCursorRules,
  writeWindsurfRules,
  writeSubagents,
  writeSkills,
  writeHooks,
} from './writers.js';

// Self-Aware Engine exports
export { detectPhase, SIGNAL_WEIGHTS } from './phase-detector.js';
export { ContextMemory, loadContextMemory, hasContextMemory } from './context-memory.js';
export { ForgeWatcher, ChangeAccumulator, createForgeWatcher } from './watcher.js';
export { BatchDetector, createBatchDetector, isScaffoldBatch } from './batch-detector.js';
export {
  RuleOrchestrator,
  createRuleOrchestrator,
  getRuleCountForPhase,
  getFocusCategoriesForPhase,
  isCategoryRelevantForPhase,
  getContentStyleForPhase,
  modifyRuleForPhase,
} from './rule-orchestrator.js';

// Enhanced Memory System
export {
  EnhancedMemorySystem,
  loadEnhancedMemory,
  hasEnhancedMemory,
  type EnhancedMemory,
  type TimelineEvent,
  type ConversationMemory,
  type ConversationDecision,
  type CodeChangeRecord,
  type ProjectInsight,
  type RuleMemoryStore,
  type RuleEffectiveness,
  type DeveloperPreferences,
  type SessionSummary,
  type KnowledgeGraph,
  type KnowledgeNode,
  type KnowledgeEdge,
} from './enhanced-memory.js';

// Analyzers
export * from './analyzers/index.js';

// IDE Detection
export {
  detectIDE,
  shouldGenerateForPlatform,
  getIDEDisplayName,
  type DetectedIDE,
  type IDEDetectionResult,
} from './ide-detector.js';
