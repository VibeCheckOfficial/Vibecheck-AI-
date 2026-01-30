/**
 * Scope Explosion Rule
 * 
 * Prevents operations that exceed the declared intent scope.
 * Guards against AI "scope creep" where changes expand beyond what was requested.
 */

import type { PolicyContext, PolicyViolation } from '../policy-engine.js';
import { BaseRule, type RuleConfig } from './base-rule.js';

export interface ScopeExplosionConfig extends RuleConfig {
  /** Maximum number of files that can be affected */
  maxAffectedFiles?: number;
  /** Maximum number of claims per request */
  maxClaims?: number;
  /** Maximum depth of directory changes from target */
  maxDirectoryDepth?: number;
  /** Patterns for paths that should never be modified */
  protectedPaths?: string[];
}

const DEFAULT_CONFIG: ScopeExplosionConfig = {
  enabled: true,
  severity: 'error',
  maxAffectedFiles: 10,
  maxClaims: 50,
  maxDirectoryDepth: 3,
  protectedPaths: [
    'package.json',
    'package-lock.json',
    'pnpm-lock.yaml',
    'yarn.lock',
    '.env',
    '.env.*',
    '*.config.js',
    '*.config.ts',
    'tsconfig.json',
  ],
};

export class ScopeExplosionRule extends BaseRule {
  name = 'scope-explosion';
  description = 'Prevent changes that exceed declared intent scope';
  protected config: ScopeExplosionConfig;

  constructor(config: Partial<ScopeExplosionConfig> = {}) {
    super(config);
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  evaluate(context: PolicyContext): PolicyViolation | null {
    // Check total claim count
    const claimCountViolation = this.checkClaimCount(context);
    if (claimCountViolation) return claimCountViolation;

    // Check affected files
    const affectedFilesViolation = this.checkAffectedFiles(context);
    if (affectedFilesViolation) return affectedFilesViolation;

    // Check for protected path modifications
    const protectedPathViolation = this.checkProtectedPaths(context);
    if (protectedPathViolation) return protectedPathViolation;

    // Check directory depth spread
    const depthViolation = this.checkDirectoryDepth(context);
    if (depthViolation) return depthViolation;

    // Check for scope creep indicators
    const scopeCreepViolation = this.checkScopeCreep(context);
    if (scopeCreepViolation) return scopeCreepViolation;

    return null;
  }

  private checkClaimCount(context: PolicyContext): PolicyViolation | null {
    const maxClaims = this.config.maxClaims ?? 50;
    
    if (context.claims.length > maxClaims) {
      return this.createViolation(
        `SCOPE EXPLOSION: Too many claims (${context.claims.length}/${maxClaims})`,
        undefined,
        `Break this change into smaller, focused modifications. Current change affects too many elements.`
      );
    }

    return null;
  }

  private checkAffectedFiles(context: PolicyContext): PolicyViolation | null {
    const maxFiles = this.config.maxAffectedFiles ?? 10;
    
    // Extract unique files from claims
    const fileRefs = context.claims.filter(c => c.type === 'file_reference');
    const importFiles = context.claims.filter(c => c.type === 'import');
    
    // Estimate affected files from file references and import patterns
    const affectedFiles = new Set<string>();
    
    for (const ref of fileRefs) {
      affectedFiles.add(ref.value);
    }
    
    for (const imp of importFiles) {
      if (imp.value.startsWith('.')) {
        affectedFiles.add(imp.value);
      }
    }

    if (affectedFiles.size > maxFiles) {
      return this.createViolation(
        `SCOPE EXPLOSION: Change affects too many files (${affectedFiles.size}/${maxFiles})`,
        fileRefs[0],
        `This change touches ${affectedFiles.size} files. Consider breaking into smaller changes.`
      );
    }

    return null;
  }

  private checkProtectedPaths(context: PolicyContext): PolicyViolation | null {
    const protectedPaths = this.config.protectedPaths ?? [];
    
    const fileRefs = context.claims.filter(c => c.type === 'file_reference');
    
    for (const ref of fileRefs) {
      for (const protectedPath of protectedPaths) {
        if (this.matchPattern(ref.value, protectedPath)) {
          return this.createViolation(
            `SCOPE EXPLOSION: Attempting to modify protected file: ${ref.value}`,
            ref,
            `File "${ref.value}" is protected. Modifications require explicit approval.`
          );
        }
      }
    }

    return null;
  }

  private checkDirectoryDepth(context: PolicyContext): PolicyViolation | null {
    const maxDepth = this.config.maxDirectoryDepth ?? 3;
    
    const fileRefs = context.claims.filter(c => c.type === 'file_reference');
    
    // Get directories from file references
    const directories = new Set<string>();
    for (const ref of fileRefs) {
      const parts = ref.value.split('/');
      if (parts.length > 1) {
        directories.add(parts.slice(0, -1).join('/'));
      }
    }

    // Check depth variation
    if (directories.size > 0) {
      const depths = Array.from(directories).map(d => d.split('/').length);
      const minDepth = Math.min(...depths);
      const maxDepthVal = Math.max(...depths);
      
      if (maxDepthVal - minDepth > maxDepth) {
        return this.createViolation(
          `SCOPE EXPLOSION: Changes span too many directory levels (${maxDepthVal - minDepth} levels)`,
          fileRefs[0],
          `Changes should be localized. This change spans from depth ${minDepth} to ${maxDepthVal}.`
        );
      }
    }

    return null;
  }

  private checkScopeCreep(context: PolicyContext): PolicyViolation | null {
    // Check intent scope vs actual scope
    const intent = context.intent?.intent;
    
    if (!intent) return null;

    // If intent was for a single file but we have multiple
    if (intent.scope === 'file') {
      const fileRefs = context.claims.filter(c => c.type === 'file_reference');
      const uniqueFiles = new Set(fileRefs.map(r => r.value));
      
      if (uniqueFiles.size > 2) { // Allow one extra for imports
        return this.createViolation(
          `SCOPE EXPLOSION: Intent was for single file but ${uniqueFiles.size} files affected`,
          fileRefs[0],
          'Declare broader intent or split into multiple focused changes'
        );
      }
    }

    // Check for category mismatches
    const claimCategories = this.categorizeClams(context.claims);
    const categoryCount = Object.keys(claimCategories).filter(k => claimCategories[k] > 0).length;
    
    if (categoryCount > 3) {
      return this.createViolation(
        `SCOPE EXPLOSION: Change spans too many categories (${categoryCount})`,
        undefined,
        'This change affects imports, types, API calls, and more. Consider splitting by concern.'
      );
    }

    return null;
  }

  private categorizeClams(claims: PolicyContext['claims']): Record<string, number> {
    return claims.reduce((acc, claim) => {
      acc[claim.type] = (acc[claim.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }
}
