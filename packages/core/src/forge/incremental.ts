/**
 * Forge - Incremental Diff Engine
 *
 * Only regenerates what changed - fast incremental updates.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import type { ForgeManifest, ForgeRule, RuleDiff, ProjectAnalysis, RuleCategory } from './types.js';
import { formatRuleAsMDC, ensureDir } from './writers.js';
import { generatePatternHashes } from './manifest.js';

/**
 * Generate incremental diff between existing manifest and new analysis
 */
export function generateIncrementalDiff(
  existingManifest: ForgeManifest,
  newAnalysis: ProjectAnalysis
): RuleDiff {
  const diff: RuleDiff = {
    added: [],
    modified: [],
    removed: [],
    unchanged: [],
  };

  const existingSnapshot = existingManifest.analysisSnapshot;
  const existingPatternHashes = existingSnapshot.patternHashes;
  const newPatternHashes = generatePatternHashes(newAnalysis);

  // Track which categories need regeneration
  const changedCategories = new Set<RuleCategory>();

  // Check for component changes
  if (
    existingSnapshot.componentCount !== (newAnalysis.components?.length || 0) ||
    existingPatternHashes.components !== newPatternHashes.components
  ) {
    changedCategories.add('components');
    changedCategories.add('architecture');
  }

  // Check for route changes
  if (
    existingSnapshot.routeCount !== (newAnalysis.apiRoutes?.length || 0) ||
    existingPatternHashes.routes !== newPatternHashes.routes
  ) {
    changedCategories.add('data-flow');
    changedCategories.add('api-patterns');
    changedCategories.add('architecture');
  }

  // Check for type changes
  const newTypeCount =
    (newAnalysis.types?.interfaces?.length || 0) + (newAnalysis.types?.types?.length || 0);
  if (
    existingSnapshot.typeCount !== newTypeCount ||
    existingPatternHashes.types !== newPatternHashes.types
  ) {
    changedCategories.add('types');
  }

  // Check for pattern changes
  if (existingPatternHashes.patterns !== newPatternHashes.patterns) {
    changedCategories.add('hooks');
    changedCategories.add('state');
    changedCategories.add('testing');
  }

  // Check for env changes
  if (existingPatternHashes.env !== newPatternHashes.env) {
    changedCategories.add('environment');
  }

  // Categorize existing rules
  for (const existingRule of existingManifest.rules) {
    if (changedCategories.has(existingRule.category)) {
      // Rule category changed, needs regeneration
      diff.modified.push({
        id: existingRule.id,
        category: existingRule.category,
        name: existingRule.name,
        description: '',
        frontmatter: {
          description: '',
          globs: [],
          alwaysApply: false,
          priority: 0,
        },
        content: '',
        impact: existingRule.impact,
        hash: existingRule.hash,
        incremental: true,
      });
    } else {
      // Rule unchanged
      diff.unchanged.push({
        id: existingRule.id,
        category: existingRule.category,
        name: existingRule.name,
        description: '',
        frontmatter: {
          description: '',
          globs: [],
          alwaysApply: false,
          priority: 0,
        },
        content: '',
        impact: existingRule.impact,
        hash: existingRule.hash,
        incremental: false,
      });
    }
  }

  // Check for new categories that should be added
  const newCategories = detectNewCategories(existingManifest, newAnalysis);
  for (const category of newCategories) {
    diff.added.push({
      id: category,
      category: category as RuleCategory,
      name: category,
      description: '',
      frontmatter: {
        description: '',
        globs: [],
        alwaysApply: false,
        priority: 0,
      },
      content: '',
      impact: 0,
      hash: '',
      incremental: true,
    });
  }

  // Check for removed categories
  const removedCategories = detectRemovedCategories(existingManifest, newAnalysis);
  for (const category of removedCategories) {
    const existingRule = existingManifest.rules.find((r) => r.id === category);
    if (existingRule) {
      diff.removed.push({
        id: existingRule.id,
        category: existingRule.category,
        name: existingRule.name,
        description: '',
        frontmatter: {
          description: '',
          globs: [],
          alwaysApply: false,
          priority: 0,
        },
        content: '',
        impact: existingRule.impact,
        hash: existingRule.hash,
        incremental: false,
      });

      // Remove from unchanged if it was there
      const unchangedIdx = diff.unchanged.findIndex((r) => r.id === existingRule.id);
      if (unchangedIdx !== -1) {
        diff.unchanged.splice(unchangedIdx, 1);
      }
    }
  }

  return diff;
}

/**
 * Apply incremental diff to generate only changed files
 */
export function applyIncrementalDiff(
  projectPath: string,
  diff: RuleDiff,
  newRules: ForgeRule[]
): { written: string[]; skipped: string[]; removed: string[] } {
  const result = {
    written: [] as string[],
    skipped: [] as string[],
    removed: [] as string[],
  };

  const rulesDir = path.join(projectPath, '.cursor', 'rules');

  // Write modified and added rules
  const rulesToWrite = new Set([...diff.modified.map((r) => r.id), ...diff.added.map((r) => r.id)]);

  for (const rule of newRules) {
    const ruleFile = path.join(rulesDir, `${rule.id}.mdc`);

    if (rulesToWrite.has(rule.id)) {
      // Write this rule
      ensureDir(path.dirname(ruleFile));
      fs.writeFileSync(ruleFile, formatRuleAsMDC(rule));
      result.written.push(`.cursor/rules/${rule.id}.mdc`);
    } else {
      // Skip this rule
      result.skipped.push(`.cursor/rules/${rule.id}.mdc`);
    }
  }

  // Remove deleted rules
  for (const removed of diff.removed) {
    const ruleFile = path.join(rulesDir, `${removed.id}.mdc`);
    if (fs.existsSync(ruleFile)) {
      fs.unlinkSync(ruleFile);
      result.removed.push(`.cursor/rules/${removed.id}.mdc`);
    }
  }

  return result;
}

/**
 * Prune stale rules that are no longer relevant
 */
export function pruneStaleRules(projectPath: string, removedRules: ForgeRule[]): string[] {
  const pruned: string[] = [];
  const rulesDir = path.join(projectPath, '.cursor', 'rules');

  for (const rule of removedRules) {
    const ruleFile = path.join(rulesDir, `${rule.id}.mdc`);
    if (fs.existsSync(ruleFile)) {
      fs.unlinkSync(ruleFile);
      pruned.push(`.cursor/rules/${rule.id}.mdc`);
    }
  }

  return pruned;
}

/**
 * Check if a file needs regeneration based on hash
 */
export function needsRegeneration(filePath: string, expectedHash: string): boolean {
  if (!fs.existsSync(filePath)) {
    return true;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const actualHash = hashContent(content);

  return actualHash !== expectedHash;
}

// ============================================================================
// HELPERS
// ============================================================================

function detectNewCategories(manifest: ForgeManifest, analysis: ProjectAnalysis): string[] {
  const existingCategories = new Set(manifest.rules.map((r) => r.category));
  const newCategories: string[] = [];

  // Check if hooks should be added
  if (!existingCategories.has('hooks') && (analysis.patterns?.hooks?.length || 0) > 0) {
    newCategories.push('hooks');
  }

  // Check if state should be added
  if (!existingCategories.has('state') && analysis.patterns?.stateManagement) {
    newCategories.push('state');
  }

  // Check if testing should be added
  if (!existingCategories.has('testing') && (analysis.patterns?.testing?.length || 0) > 0) {
    newCategories.push('testing');
  }

  // Check if authentication should be added
  if (!existingCategories.has('authentication') && analysis.patterns?.authentication) {
    newCategories.push('authentication');
  }

  // Check if database should be added
  if (!existingCategories.has('database') && (analysis.models?.length || 0) > 0) {
    newCategories.push('database');
  }

  return newCategories;
}

function detectRemovedCategories(manifest: ForgeManifest, analysis: ProjectAnalysis): string[] {
  const removedCategories: string[] = [];

  for (const rule of manifest.rules) {
    // Check if hooks should be removed
    if (rule.category === 'hooks' && (analysis.patterns?.hooks?.length || 0) === 0) {
      removedCategories.push('hooks');
    }

    // Check if state should be removed
    if (rule.category === 'state' && !analysis.patterns?.stateManagement) {
      removedCategories.push('state');
    }

    // Check if testing should be removed
    if (rule.category === 'testing' && (analysis.patterns?.testing?.length || 0) === 0) {
      removedCategories.push('testing');
    }
  }

  return removedCategories;
}

function hashContent(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 12);
}
