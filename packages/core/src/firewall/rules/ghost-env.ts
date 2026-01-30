/**
 * Ghost Env Rule
 * 
 * Blocks usage of environment variables that aren't declared.
 * Prevents hallucinated environment variable references.
 */

import type { PolicyContext, PolicyViolation } from '../policy-engine.js';
import { BaseRule, type RuleConfig } from './base-rule.js';

export interface GhostEnvConfig extends RuleConfig {
  /** Built-in Node.js env vars that are always allowed */
  builtinAllowed?: string[];
  /** Additional env vars to allow without checking */
  additionalAllowed?: string[];
}

const DEFAULT_CONFIG: GhostEnvConfig = {
  enabled: true,
  severity: 'error',
  builtinAllowed: [
    'NODE_ENV',
    'PATH',
    'HOME',
    'USER',
    'SHELL',
    'LANG',
    'PWD',
    'TERM',
    'CI',
    'DEBUG',
  ],
  additionalAllowed: [],
};

export class GhostEnvRule extends BaseRule {
  name = 'ghost-env';
  description = 'Block usage of undeclared environment variables';
  protected config: GhostEnvConfig;

  constructor(config: Partial<GhostEnvConfig> = {}) {
    super(config);
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  evaluate(context: PolicyContext): PolicyViolation | null {
    // Find all env variable claims
    const envClaims = context.claims.filter(c => c.type === 'env_variable');
    
    if (envClaims.length === 0) return null;

    // Find claims without evidence
    const ghostEnvVars = envClaims.filter(claim => {
      // Skip if it's a builtin
      if (this.isBuiltinOrAllowed(claim.value)) return false;

      // Check if evidence exists
      const evidence = context.evidence.find(e => e.claimId === claim.id);
      return !evidence || !evidence.found;
    });

    if (ghostEnvVars.length === 0) return null;

    // Return violation for ghost env vars
    const ghostVar = ghostEnvVars[0];
    const allGhostVars = ghostEnvVars.map(v => v.value).join(', ');

    return this.createViolation(
      `GHOST ENV: Environment variable(s) not defined: ${allGhostVars}`,
      ghostVar,
      this.generateSuggestion(ghostVar.value)
    );
  }

  private isBuiltinOrAllowed(varName: string): boolean {
    const builtins = this.config.builtinAllowed ?? [];
    const additional = this.config.additionalAllowed ?? [];
    const allAllowed = [...builtins, ...additional];

    return allAllowed.some(allowed => {
      if (allowed.includes('*')) {
        return this.matchPattern(varName, allowed);
      }
      return varName === allowed;
    });
  }

  private generateSuggestion(varName: string): string {
    // Provide specific suggestions based on variable name patterns
    const suggestions: string[] = [];

    suggestions.push(`Add ${varName} to .env.example with a description`);
    suggestions.push(`Set the value in .env`);
    suggestions.push(`Run: vibecheck truthpack --scope env`);

    // Add hints based on naming
    if (varName.includes('SECRET') || varName.includes('KEY') || varName.includes('TOKEN')) {
      suggestions.unshift('This appears to be a sensitive value - ensure it\'s not committed to git');
    }

    if (varName.includes('URL') || varName.includes('URI')) {
      suggestions.unshift('This appears to be a URL - verify the format is correct');
    }

    return suggestions.join('. ');
  }
}
