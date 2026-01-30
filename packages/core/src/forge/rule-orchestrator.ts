/**
 * Rule Orchestrator - Self-Aware Forge Engine
 *
 * Decides which rules to regenerate based on:
 * - What changed (file type, location)
 * - Current phase (scaffold = fewer rules, production = comprehensive)
 * - Historical effectiveness (prioritize impactful rules)
 */

import type {
  ProjectPhase,
  RuleCategory,
  RuleOrchestrationDecision,
  PhaseRuleConfig,
  PHASE_RULE_CONFIGS,
  AccumulatedChanges,
  ForgeContextMemory,
  ProjectAnalysis,
  ForgeRule,
} from './types.js';
import { ContextMemory } from './context-memory.js';

// ============================================================================
// PHASE CONFIGURATIONS
// ============================================================================

/**
 * Phase-specific rule configurations
 */
const PHASE_CONFIGS: Record<ProjectPhase, PhaseRuleConfig> = {
  scaffold: {
    phase: 'scaffold',
    maxRules: 5,
    focusCategories: ['architecture', 'workflow', 'avoid'],
    skipCategories: ['performance', 'caching', 'i18n', 'accessibility', 'logging'],
    contentStyle: 'minimal',
  },
  prototype: {
    phase: 'prototype',
    maxRules: 5,
    focusCategories: ['architecture', 'workflow', 'avoid', 'types'],
    skipCategories: ['performance', 'caching', 'i18n', 'security', 'logging'],
    contentStyle: 'minimal',
  },
  'active-dev': {
    phase: 'active-dev',
    maxRules: 10,
    focusCategories: ['workflow', 'components', 'types', 'testing', 'hooks', 'state', 'data-flow'],
    skipCategories: ['caching', 'i18n'],
    contentStyle: 'standard',
  },
  stabilization: {
    phase: 'stabilization',
    maxRules: 15,
    focusCategories: ['workflow', 'testing', 'error-handling', 'security', 'types', 'api-patterns'],
    skipCategories: ['i18n'],
    contentStyle: 'standard',
  },
  production: {
    phase: 'production',
    maxRules: 20,
    focusCategories: ['workflow', 'security', 'performance', 'error-handling', 'logging', 'authentication'],
    skipCategories: [],
    contentStyle: 'detailed',
  },
  maintenance: {
    phase: 'maintenance',
    maxRules: 10,
    focusCategories: ['workflow', 'architecture', 'types', 'security', 'database'],
    skipCategories: ['components', 'hooks', 'state'],
    contentStyle: 'standard',
  },
};

// ============================================================================
// CHANGE TO RULE MAPPING
// ============================================================================

/**
 * Maps file patterns to affected rule categories
 */
const CHANGE_TO_RULE_MAP: Record<string, RuleCategory[]> = {
  // Components
  'components/': ['components', 'hooks', 'state', 'accessibility'],
  'app/': ['architecture', 'components', 'data-flow'],
  'pages/': ['architecture', 'components', 'data-flow'],

  // API
  'api/': ['api-patterns', 'security', 'error-handling', 'authentication'],
  'routes/': ['api-patterns', 'data-flow'],
  'services/': ['data-flow', 'error-handling'],

  // Types
  'types/': ['types'],
  '@types/': ['types'],
  'interfaces/': ['types'],

  // Data
  'models/': ['database', 'types'],
  'schemas/': ['database', 'types'],
  'prisma/': ['database'],

  // Config
  'package.json': ['environment', 'architecture'],
  'tsconfig': ['types'],
  '.env': ['environment', 'security'],

  // Utils
  'utils/': ['avoid', 'error-handling'],
  'lib/': ['architecture', 'avoid'],
  'helpers/': ['avoid'],

  // Testing
  '.test.': ['testing'],
  '.spec.': ['testing'],
  '__tests__/': ['testing'],

  // Security
  'auth/': ['authentication', 'authorization', 'security'],
  'middleware/': ['security', 'authentication'],

  // Performance
  'cache/': ['caching', 'performance'],
  'workers/': ['performance'],
};

// ============================================================================
// RULE ORCHESTRATOR CLASS
// ============================================================================

export class RuleOrchestrator {
  private phase: ProjectPhase;
  private contextMemory: ContextMemory;
  private config: PhaseRuleConfig;

  constructor(projectPath: string, phase: ProjectPhase) {
    this.phase = phase;
    this.contextMemory = new ContextMemory(projectPath);
    this.config = PHASE_CONFIGS[phase];
  }

  /**
   * Make orchestration decision based on changes
   */
  orchestrate(
    changes: AccumulatedChanges,
    analysis?: ProjectAnalysis
  ): RuleOrchestrationDecision {
    // Determine affected categories from changes
    const affectedCategories = this.getAffectedCategories(changes);

    // Get phase configuration
    const phaseConfig = PHASE_CONFIGS[this.phase];

    // Determine rules to generate
    const rulesToGenerate = this.selectRulesToGenerate(affectedCategories, phaseConfig);

    // Determine rules to skip
    const rulesToSkip = this.selectRulesToSkip(phaseConfig);

    // Determine priority order
    const priorityOrder = this.calculatePriorityOrder(rulesToGenerate, analysis);

    // Build reasoning
    const reasoning = this.buildReasoning(changes, affectedCategories, phaseConfig);

    return {
      rulesToGenerate,
      rulesToSkip,
      priorityOrder,
      maxRules: phaseConfig.maxRules,
      focusAreas: phaseConfig.focusCategories.map((c) => c.toString()),
      reasoning,
    };
  }

  /**
   * Get categories affected by changes
   */
  private getAffectedCategories(changes: AccumulatedChanges): Set<RuleCategory> {
    const affected = new Set<RuleCategory>();

    // Always include these for structural changes
    if (changes.categories.structural.length > 0) {
      affected.add('architecture');
      affected.add('components');
    }

    // Always include for dependency changes
    if (changes.categories.dependency.length > 0) {
      affected.add('environment');
      affected.add('avoid');
    }

    // Always include for config changes
    if (changes.categories.config.length > 0) {
      affected.add('environment');
      affected.add('types');
    }

    // Map file paths to categories
    for (const change of changes.changes) {
      for (const [pattern, categories] of Object.entries(CHANGE_TO_RULE_MAP)) {
        if (change.path.includes(pattern)) {
          for (const category of categories) {
            affected.add(category);
          }
        }
      }
    }

    return affected;
  }

  /**
   * Select rules to generate based on affected categories and phase
   */
  private selectRulesToGenerate(
    affected: Set<RuleCategory>,
    phaseConfig: PhaseRuleConfig
  ): RuleCategory[] {
    const toGenerate = new Set<RuleCategory>();

    // Always include focus categories
    for (const category of phaseConfig.focusCategories) {
      if (!phaseConfig.skipCategories.includes(category)) {
        toGenerate.add(category);
      }
    }

    // Add affected categories (if not skipped)
    for (const category of affected) {
      if (!phaseConfig.skipCategories.includes(category)) {
        toGenerate.add(category);
      }
    }

    // Always include architecture, workflow, and avoid
    toGenerate.add('architecture');
    toGenerate.add('workflow');
    toGenerate.add('avoid');

    return Array.from(toGenerate);
  }

  /**
   * Select rules to skip based on phase
   */
  private selectRulesToSkip(phaseConfig: PhaseRuleConfig): RuleCategory[] {
    return [...phaseConfig.skipCategories];
  }

  /**
   * Calculate priority order for rules
   */
  private calculatePriorityOrder(
    categories: RuleCategory[],
    analysis?: ProjectAnalysis
  ): RuleCategory[] {
    const effectiveness = this.contextMemory.getRuleEffectiveness();

    // Score each category
    const scores = new Map<RuleCategory, number>();

    for (const category of categories) {
      let score = 50; // Base score

      // Boost from phase focus
      if (this.config.focusCategories.includes(category)) {
        score += 30;
      }

      // Boost from effectiveness history
      const ruleEffect = effectiveness[category];
      if (ruleEffect?.feedbackScore) {
        score += ruleEffect.feedbackScore / 2;
      }

      // Boost from project analysis
      if (analysis) {
        score += this.getAnalysisBoost(category, analysis);
      }

      scores.set(category, score);
    }

    // Sort by score
    return categories.sort((a, b) => (scores.get(b) ?? 0) - (scores.get(a) ?? 0));
  }

  /**
   * Get boost from project analysis
   */
  private getAnalysisBoost(category: RuleCategory, analysis: ProjectAnalysis): number {
    switch (category) {
      case 'workflow':
        return 25; // Always high priority - helps vibe coders track progress
      case 'components':
        return analysis.components.length > 10 ? 15 : 5;
      case 'api-patterns':
        return analysis.apiRoutes.length > 5 ? 15 : 5;
      case 'database':
        return analysis.models.length > 0 ? 20 : 0;
      case 'types':
        return analysis.language === 'TypeScript' ? 15 : 0;
      case 'testing':
        return analysis.patterns.testing.length > 0 ? 15 : 0;
      case 'state':
        return analysis.patterns.stateManagement ? 15 : 0;
      case 'authentication':
        return analysis.patterns.authentication ? 20 : 0;
      case 'hooks':
        return analysis.patterns.hooks.length > 0 ? 10 : 0;
      default:
        return 0;
    }
  }

  /**
   * Build reasoning for decision
   */
  private buildReasoning(
    changes: AccumulatedChanges,
    affected: Set<RuleCategory>,
    phaseConfig: PhaseRuleConfig
  ): string {
    const parts: string[] = [];

    parts.push(`Phase: ${this.phase}`);
    parts.push(`Max rules: ${phaseConfig.maxRules}`);
    parts.push(`Changes: ${changes.changes.length} files`);
    parts.push(`Trigger: ${changes.trigger}`);

    if (changes.categories.structural.length > 0) {
      parts.push(`Structural changes: ${changes.categories.structural.length}`);
    }

    if (affected.size > 0) {
      parts.push(`Affected categories: ${Array.from(affected).join(', ')}`);
    }

    parts.push(`Focus areas: ${phaseConfig.focusCategories.join(', ')}`);

    if (phaseConfig.skipCategories.length > 0) {
      parts.push(`Skipping: ${phaseConfig.skipCategories.join(', ')}`);
    }

    return parts.join('. ');
  }

  /**
   * Update phase
   */
  setPhase(phase: ProjectPhase): void {
    this.phase = phase;
    this.config = PHASE_CONFIGS[phase];
  }

  /**
   * Get current phase config
   */
  getPhaseConfig(): PhaseRuleConfig {
    return { ...this.config };
  }
}

// ============================================================================
// ORCHESTRATION HELPERS
// ============================================================================

/**
 * Get phase-appropriate rule count
 */
export function getRuleCountForPhase(phase: ProjectPhase): number {
  return PHASE_CONFIGS[phase].maxRules;
}

/**
 * Get focus categories for phase
 */
export function getFocusCategoriesForPhase(phase: ProjectPhase): RuleCategory[] {
  return [...PHASE_CONFIGS[phase].focusCategories];
}

/**
 * Check if category is relevant for phase
 */
export function isCategoryRelevantForPhase(
  category: RuleCategory,
  phase: ProjectPhase
): boolean {
  const config = PHASE_CONFIGS[phase];
  return !config.skipCategories.includes(category);
}

/**
 * Get content style for phase
 */
export function getContentStyleForPhase(
  phase: ProjectPhase
): 'minimal' | 'standard' | 'detailed' {
  return PHASE_CONFIGS[phase].contentStyle;
}

// ============================================================================
// RULE CONTENT MODIFIERS
// ============================================================================

/**
 * Modify rule content based on phase
 */
export function modifyRuleForPhase(rule: ForgeRule, phase: ProjectPhase): ForgeRule {
  const style = getContentStyleForPhase(phase);

  if (style === 'minimal') {
    // Trim content to essentials
    return {
      ...rule,
      content: trimToMinimal(rule.content),
    };
  }

  if (style === 'detailed') {
    // Add more context and examples
    return {
      ...rule,
      content: expandToDetailed(rule.content, rule.category),
    };
  }

  return rule;
}

/**
 * Trim content to minimal essentials
 */
function trimToMinimal(content: string): string {
  const lines = content.split('\n');
  const essentialLines: string[] = [];
  let inCodeBlock = false;
  let codeBlockLines = 0;

  for (const line of lines) {
    // Track code blocks
    if (line.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      codeBlockLines = 0;
    }

    // Keep headers
    if (line.startsWith('#')) {
      essentialLines.push(line);
      continue;
    }

    // Keep first few lines of code blocks
    if (inCodeBlock) {
      codeBlockLines++;
      if (codeBlockLines <= 10) {
        essentialLines.push(line);
      } else if (codeBlockLines === 11) {
        essentialLines.push('// ... more ...');
      }
      continue;
    }

    // Keep bullet points (first level only)
    if (line.match(/^[-*]\s/)) {
      essentialLines.push(line);
      continue;
    }

    // Keep important keywords
    if (
      /\b(MUST|NEVER|ALWAYS|REQUIRED|CRITICAL|IMPORTANT)\b/i.test(line)
    ) {
      essentialLines.push(line);
    }
  }

  return essentialLines.join('\n');
}

/**
 * Expand content with more detail
 */
function expandToDetailed(content: string, category: RuleCategory): string {
  const additions: string[] = [];

  // Add category-specific detail sections
  switch (category) {
    case 'workflow':
      additions.push('\n## Progress Communication Best Practices\n');
      additions.push('- Always provide specific, actionable next steps');
      additions.push('- Include estimated complexity for remaining tasks');
      additions.push('- List any blockers or dependencies');
      additions.push('- Celebrate completion milestones explicitly');
      break;

    case 'security':
      additions.push('\n## Security Checklist\n');
      additions.push('- [ ] Input validation on all user inputs');
      additions.push('- [ ] Output encoding for XSS prevention');
      additions.push('- [ ] CSRF protection on state-changing operations');
      additions.push('- [ ] Rate limiting on sensitive endpoints');
      break;

    case 'performance':
      additions.push('\n## Performance Checklist\n');
      additions.push('- [ ] Lazy loading for large components');
      additions.push('- [ ] Memoization for expensive computations');
      additions.push('- [ ] Image optimization');
      additions.push('- [ ] Bundle size monitoring');
      break;

    case 'error-handling':
      additions.push('\n## Error Handling Checklist\n');
      additions.push('- [ ] All async operations have error handling');
      additions.push('- [ ] User-friendly error messages');
      additions.push('- [ ] Error logging and monitoring');
      additions.push('- [ ] Graceful degradation');
      break;
  }

  if (additions.length > 0) {
    return content + '\n' + additions.join('\n');
  }

  return content;
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create a rule orchestrator
 */
export function createRuleOrchestrator(
  projectPath: string,
  phase: ProjectPhase
): RuleOrchestrator {
  return new RuleOrchestrator(projectPath, phase);
}
