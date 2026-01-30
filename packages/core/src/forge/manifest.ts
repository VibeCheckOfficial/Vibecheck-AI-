/**
 * Forge - Manifest Generator
 *
 * Generates and manages the forge manifest for incremental updates.
 */

import * as crypto from 'node:crypto';
import type {
  ForgeManifest,
  ForgeManifestRule,
  ForgeManifestOutput,
  ForgeRule,
  AIContract,
  ForgeConfig,
  ProjectAnalysis,
} from './types.js';

interface ManifestInput {
  projectPath: string;
  contentHash: string;
  rules: ForgeRule[];
  contract: AIContract | null;
  config: ForgeConfig;
  analysis: ProjectAnalysis;
}

/**
 * Generate a manifest from forge output
 */
export function generateManifest(input: ManifestInput): ForgeManifest {
  const { projectPath, contentHash, rules, contract, config, analysis } = input;

  const manifest: ForgeManifest = {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    projectPath,
    contentHash,
    config,
    rules: rules.map(ruleToManifestRule),
    contract,
    outputs: generateOutputs(rules, contract),
    stats: {
      rulesGenerated: rules.length,
      filesWritten: 0, // Will be updated after writing
      timeMs: 0, // Will be updated after completion
    },
    analysisSnapshot: {
      componentCount: analysis.components?.length || 0,
      routeCount: analysis.apiRoutes?.length || 0,
      typeCount:
        (analysis.types?.interfaces?.length || 0) + (analysis.types?.types?.length || 0),
      patternHashes: generatePatternHashes(analysis),
    },
  };

  return manifest;
}

/**
 * Validate a manifest for integrity
 */
export function validateManifest(manifest: ForgeManifest): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  // Check version
  if (!manifest.version) {
    issues.push('Missing manifest version');
  }

  // Check content hash
  if (!manifest.contentHash || manifest.contentHash.length < 8) {
    issues.push('Invalid or missing content hash');
  }

  // Check rules
  if (!manifest.rules || manifest.rules.length === 0) {
    issues.push('No rules in manifest');
  }

  // Check for duplicate rule IDs
  const ruleIds = new Set<string>();
  for (const rule of manifest.rules) {
    if (ruleIds.has(rule.id)) {
      issues.push(`Duplicate rule ID: ${rule.id}`);
    }
    ruleIds.add(rule.id);
  }

  // Check outputs
  if (!manifest.outputs || manifest.outputs.length === 0) {
    issues.push('No outputs in manifest');
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

/**
 * Update manifest with new generation results
 */
export function updateManifest(
  existing: ForgeManifest,
  updates: Partial<ManifestInput>
): ForgeManifest {
  const updated: ForgeManifest = {
    ...existing,
    generatedAt: new Date().toISOString(),
    version: existing.version,
  };

  if (updates.contentHash) {
    updated.contentHash = updates.contentHash;
  }

  if (updates.rules) {
    updated.rules = updates.rules.map(ruleToManifestRule);
  }

  if (updates.contract !== undefined) {
    updated.contract = updates.contract;
  }

  if (updates.analysis) {
    updated.analysisSnapshot = {
      componentCount: updates.analysis.components?.length || 0,
      routeCount: updates.analysis.apiRoutes?.length || 0,
      typeCount:
        (updates.analysis.types?.interfaces?.length || 0) +
        (updates.analysis.types?.types?.length || 0),
      patternHashes: generatePatternHashes(updates.analysis),
    };
  }

  // Regenerate outputs
  if (updates.rules || updates.contract !== undefined) {
    updated.outputs = generateOutputs(
      updates.rules ||
        existing.rules.map((r) => ({ id: r.id, hash: r.hash }) as unknown as ForgeRule),
      updates.contract !== undefined ? updates.contract : existing.contract
    );
  }

  return updated;
}

// ============================================================================
// HELPERS
// ============================================================================

function ruleToManifestRule(rule: ForgeRule): ForgeManifestRule {
  return {
    id: rule.id,
    category: rule.category,
    name: rule.name,
    hash: rule.hash,
    impact: rule.impact,
    outputFile: `.cursor/rules/${rule.id}.mdc`,
  };
}

function generateOutputs(
  rules: ForgeRule[] | ForgeManifestRule[],
  contract: AIContract | null
): ForgeManifestOutput[] {
  const outputs: ForgeManifestOutput[] = [];
  const now = new Date().toISOString();

  // Main cursorrules file
  outputs.push({
    path: '.cursorrules',
    type: 'rule',
    hash: hashContent('cursorrules'),
    generatedAt: now,
  });

  // MDC rule files
  for (const rule of rules) {
    const ruleData =
      'id' in rule && typeof (rule as ForgeRule).content === 'string'
        ? (rule as ForgeRule)
        : null;

    outputs.push({
      path: `.cursor/rules/${rule.id}.mdc`,
      type: 'rule',
      hash: ruleData?.hash || rule.hash,
      generatedAt: now,
    });
  }

  // Contract
  if (contract) {
    outputs.push({
      path: '.vibecheck/ai-contract.json',
      type: 'contract',
      hash: hashContent(JSON.stringify(contract)),
      generatedAt: now,
    });
    outputs.push({
      path: '.vibecheck/AI_CONTRACT.md',
      type: 'contract',
      hash: hashContent(JSON.stringify(contract)),
      generatedAt: now,
    });
  }

  // Manifest itself
  outputs.push({
    path: '.vibecheck/forge-manifest.json',
    type: 'manifest',
    hash: hashContent('manifest'),
    generatedAt: now,
  });

  return outputs;
}

export function generatePatternHashes(analysis: ProjectAnalysis): Record<string, string> {
  const hashes: Record<string, string> = {};

  // Hash components
  if (analysis.components?.length) {
    hashes.components = hashContent(
      JSON.stringify(analysis.components.map((c) => c.name).sort())
    );
  }

  // Hash routes
  if (analysis.apiRoutes?.length) {
    hashes.routes = hashContent(
      JSON.stringify(analysis.apiRoutes.map((r) => `${r.method}:${r.path}`).sort())
    );
  }

  // Hash types
  if (analysis.types?.interfaces?.length || analysis.types?.types?.length) {
    const typeNames = [
      ...(analysis.types?.interfaces?.map((i) => i.name) || []),
      ...(analysis.types?.types?.map((t) => t.name) || []),
    ].sort();
    hashes.types = hashContent(JSON.stringify(typeNames));
  }

  // Hash patterns
  if (analysis.patterns) {
    const patternSummary = {
      hooks: analysis.patterns.hooks?.length || 0,
      state: analysis.patterns.stateManagement || '',
      styling: analysis.patterns.styling?.join(',') || '',
      testing: analysis.patterns.testing?.join(',') || '',
    };
    hashes.patterns = hashContent(JSON.stringify(patternSummary));
  }

  // Hash env vars
  if (analysis.envVars?.variables?.length) {
    hashes.env = hashContent(JSON.stringify(analysis.envVars.variables.sort()));
  }

  return hashes;
}

function hashContent(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 12);
}
