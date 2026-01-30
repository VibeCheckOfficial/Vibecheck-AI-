/**
 * Intent Validator
 * 
 * Validates that AI agent intentions align with user goals
 * and project constraints before allowing execution.
 */

export interface Intent {
  type: 'create' | 'modify' | 'delete' | 'refactor' | 'fix' | 'test';
  target: string;
  scope: 'file' | 'function' | 'class' | 'module' | 'project';
  description: string;
  valid: boolean;
  confidence: number;
}

export interface IntentValidation {
  valid: boolean;
  intent: Intent;
  warnings: string[];
  suggestions: string[];
}

export interface ValidationRule {
  name: string;
  check: (intent: Intent) => boolean;
  message: string;
}

export class IntentValidator {
  private rules: ValidationRule[] = [];

  constructor() {
    this.initializeDefaultRules();
  }

  /**
   * Validate an intent from a request
   */
  async validate(request: {
    action: string;
    target: string;
    content: string;
    context: Record<string, unknown>;
  }): Promise<IntentValidation> {
    const intent = this.extractIntent(request);
    const warnings: string[] = [];
    const suggestions: string[] = [];

    // Apply all validation rules
    for (const rule of this.rules) {
      if (!rule.check(intent)) {
        warnings.push(rule.message);
      }
    }

    // Check for scope creep
    if (this.detectScopeCreep(intent, request.context)) {
      warnings.push('Intent scope exceeds expected boundaries');
      suggestions.push('Consider breaking this into smaller changes');
    }

    return {
      valid: warnings.length === 0,
      intent: { ...intent, valid: warnings.length === 0 },
      warnings,
      suggestions,
    };
  }

  /**
   * Add a custom validation rule
   */
  addRule(rule: ValidationRule): void {
    this.rules.push(rule);
  }

  private extractIntent(request: {
    action: string;
    target: string;
    content: string;
  }): Intent {
    // TODO: Implement intent extraction using NLP or heuristics
    return {
      type: this.mapActionToType(request.action),
      target: request.target,
      scope: this.inferScope(request.target),
      description: '',
      valid: true,
      confidence: 0.5,
    };
  }

  private mapActionToType(action: string): Intent['type'] {
    const mapping: Record<string, Intent['type']> = {
      write: 'create',
      modify: 'modify',
      delete: 'delete',
      execute: 'modify',
    };
    return mapping[action] ?? 'modify';
  }

  private inferScope(target: string): Intent['scope'] {
    if (target.includes('package.json') || target.includes('tsconfig')) {
      return 'project';
    }
    if (target.endsWith('.ts') || target.endsWith('.js')) {
      return 'file';
    }
    return 'module';
  }

  private detectScopeCreep(intent: Intent, context: Record<string, unknown>): boolean {
    // TODO: Implement scope creep detection
    return false;
  }

  private initializeDefaultRules(): void {
    this.rules = [
      {
        name: 'non-empty-target',
        check: (intent) => intent.target.length > 0,
        message: 'Intent must have a valid target',
      },
      {
        name: 'valid-scope',
        check: (intent) => ['file', 'function', 'class', 'module', 'project'].includes(intent.scope),
        message: 'Intent must have a valid scope',
      },
      {
        name: 'reasonable-confidence',
        check: (intent) => intent.confidence >= 0.3,
        message: 'Intent confidence is too low',
      },
    ];
  }
}
