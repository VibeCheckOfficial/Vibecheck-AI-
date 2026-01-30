/**
 * Unsafe Side Effect Rule
 * 
 * Blocks dangerous operations that could have unintended side effects.
 * Prevents eval(), shell injection, file deletion, and other risky patterns.
 */

import type { PolicyContext, PolicyViolation } from '../policy-engine.js';
import { BaseRule, type RuleConfig } from './base-rule.js';

export interface UnsafeSideEffectConfig extends RuleConfig {
  /** Dangerous code patterns to block */
  dangerousPatterns?: Array<{ pattern: RegExp; description: string; severity: 'error' | 'warning' }>;
  /** File operations to restrict */
  restrictedFileOps?: string[];
  /** Allow these patterns even if they match dangerous patterns */
  allowedContexts?: string[];
}

const DEFAULT_CONFIG: UnsafeSideEffectConfig = {
  enabled: true,
  severity: 'error',
  dangerousPatterns: [
    { pattern: /\beval\s*\(/, description: 'eval() can execute arbitrary code', severity: 'error' },
    { pattern: /\bnew\s+Function\s*\(/, description: 'Function() constructor can execute arbitrary code', severity: 'error' },
    { pattern: /child_process\s*\.\s*exec\s*\(/, description: 'exec() can run arbitrary shell commands', severity: 'error' },
    { pattern: /execSync\s*\(/, description: 'execSync() can run arbitrary shell commands', severity: 'error' },
    { pattern: /\$\{[^}]*\}.*exec|exec.*\$\{[^}]*\}/, description: 'Template literal in shell command (injection risk)', severity: 'error' },
    { pattern: /rm\s+-rf\s+\//, description: 'Recursive delete from root', severity: 'error' },
    { pattern: /rm\s+-rf\s+\*/, description: 'Recursive delete with wildcard', severity: 'error' },
    { pattern: /DROP\s+TABLE/i, description: 'SQL DROP TABLE statement', severity: 'error' },
    { pattern: /DELETE\s+FROM\s+\w+\s*;?\s*$/im, description: 'Unfiltered DELETE statement', severity: 'error' },
    { pattern: /TRUNCATE\s+TABLE/i, description: 'SQL TRUNCATE statement', severity: 'error' },
    { pattern: /\.innerHTML\s*=/, description: 'innerHTML assignment (XSS risk)', severity: 'warning' },
    { pattern: /document\.write\s*\(/, description: 'document.write() can overwrite page', severity: 'warning' },
    { pattern: /dangerouslySetInnerHTML/, description: 'React dangerouslySetInnerHTML', severity: 'warning' },
    { pattern: /__proto__|prototype\s*\[/, description: 'Prototype pollution risk', severity: 'error' },
    { pattern: /Object\.assign\s*\([^,]+,\s*req\.body/, description: 'Mass assignment vulnerability', severity: 'warning' },
    { pattern: /process\.exit\s*\(\s*[^0)]/, description: 'Non-zero process exit', severity: 'warning' },
    { pattern: /fs\.(unlink|rmdir|rm)Sync?\s*\(/, description: 'File/directory deletion', severity: 'warning' },
    { pattern: /require\s*\(\s*[^'"]\w+\s*\)/, description: 'Dynamic require (injection risk)', severity: 'warning' },
    { pattern: /import\s*\(\s*[^'"]\w+\s*\)/, description: 'Dynamic import (injection risk)', severity: 'warning' },
  ],
  restrictedFileOps: ['unlink', 'rmdir', 'rm', 'rmSync', 'rmdirSync', 'unlinkSync'],
  allowedContexts: [
    'test',
    'spec',
    'mock',
    '__tests__',
  ],
};

export class UnsafeSideEffectRule extends BaseRule {
  name = 'unsafe-side-effect';
  description = 'Block dangerous operations that could have unintended side effects';
  protected config: UnsafeSideEffectConfig;

  constructor(config: Partial<UnsafeSideEffectConfig> = {}) {
    super(config);
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  evaluate(context: PolicyContext): PolicyViolation | null {
    // Check each claim's context for dangerous patterns
    for (const claim of context.claims) {
      // Skip if in allowed context (e.g., test files)
      if (this.isAllowedContext(claim.context)) continue;

      const dangerousMatch = this.checkDangerousPatterns(claim.context);
      if (dangerousMatch) {
        return this.createViolation(
          `UNSAFE SIDE EFFECT: ${dangerousMatch.description}`,
          claim,
          this.generateSuggestion(dangerousMatch.pattern)
        );
      }
    }

    // Check for restricted file operations in function calls
    const functionCalls = context.claims.filter(c => c.type === 'function_call');
    for (const call of functionCalls) {
      if (this.isRestrictedFileOp(call.value)) {
        // Check if in test context
        if (!this.isAllowedContext(call.context)) {
          return this.createViolation(
            `UNSAFE SIDE EFFECT: Restricted file operation "${call.value}"`,
            call,
            'File deletion operations require explicit approval. Consider using a safer approach.'
          );
        }
      }
    }

    // Check imports for dangerous modules
    const dangerousModules = ['child_process', 'vm', 'worker_threads'];
    const imports = context.claims.filter(c => c.type === 'import' || c.type === 'package_dependency');
    
    for (const imp of imports) {
      if (dangerousModules.some(m => imp.value.includes(m))) {
        const evidence = context.evidence.find(e => e.claimId === imp.id);
        
        // Only flag if the module is actually being used in a dangerous way
        if (evidence?.found && this.hasDangerousUsage(imp.context)) {
          return this.createViolation(
            `UNSAFE SIDE EFFECT: Potentially dangerous module "${imp.value}" with risky usage`,
            imp,
            'Review the usage of this module carefully. Consider safer alternatives.'
          );
        }
      }
    }

    return null;
  }

  private checkDangerousPatterns(text: string): { pattern: RegExp; description: string; severity: 'error' | 'warning' } | null {
    if (!text) return null;

    const patterns = this.config.dangerousPatterns ?? [];
    
    for (const item of patterns) {
      if (item.pattern.test(text)) {
        return item;
      }
    }

    return null;
  }

  private isAllowedContext(context: string): boolean {
    if (!context) return false;
    const allowed = this.config.allowedContexts ?? [];
    const contextLower = context.toLowerCase();
    return allowed.some(a => contextLower.includes(a.toLowerCase()));
  }

  private isRestrictedFileOp(functionName: string): boolean {
    const restricted = this.config.restrictedFileOps ?? [];
    return restricted.some(op => functionName.includes(op));
  }

  private hasDangerousUsage(context: string): boolean {
    // Check for patterns that indicate dangerous usage
    const dangerousUsages = [
      /exec\s*\(/,
      /spawn\s*\(/,
      /runInContext/,
      /createScript/,
    ];

    return dangerousUsages.some(p => p.test(context));
  }

  private generateSuggestion(pattern: RegExp): string {
    const suggestions: Record<string, string> = {
      'eval': 'Use JSON.parse() for data, or consider a safer alternative like a sandboxed interpreter',
      'Function': 'Consider using a predefined function or a safer code generation approach',
      'exec': 'Use spawn() with explicit arguments array to prevent shell injection',
      'innerHTML': 'Use textContent for text, or sanitize input with DOMPurify',
      'DELETE': 'Add a WHERE clause to limit affected rows',
      'DROP': 'Consider using migrations for schema changes',
      'rm': 'Verify the path and add safety checks before deletion',
      '__proto__': 'Use Object.create(null) or Map for user-controlled keys',
    };

    for (const [key, suggestion] of Object.entries(suggestions)) {
      if (pattern.source.includes(key)) {
        return suggestion;
      }
    }

    return 'Review this code for potential security issues';
  }
}
