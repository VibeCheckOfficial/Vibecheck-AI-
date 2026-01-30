/**
 * Intent Middleware
 * 
 * Intercepts tool calls to validate intent before execution.
 */

export interface IntentContext {
  tool: string;
  parameters: Record<string, unknown>;
  timestamp: Date;
}

export interface IntentValidationResult {
  valid: boolean;
  intent: {
    type: string;
    scope: string;
    risk: 'low' | 'medium' | 'high';
  };
  warnings: string[];
  modifications?: Record<string, unknown>;
}

export class IntentMiddleware {
  private history: IntentContext[] = [];

  /**
   * Validate intent before tool execution
   */
  validate(tool: string, parameters: Record<string, unknown>): IntentValidationResult {
    const context: IntentContext = {
      tool,
      parameters,
      timestamp: new Date(),
    };
    
    this.history.push(context);

    // Analyze intent
    const intent = this.analyzeIntent(tool, parameters);

    // Check for suspicious patterns
    const warnings = this.checkPatterns(context);

    // Determine if modifications are needed
    const modifications = this.suggestModifications(context);

    return {
      valid: warnings.filter(w => w.startsWith('BLOCK:')).length === 0,
      intent,
      warnings,
      modifications: Object.keys(modifications).length > 0 ? modifications : undefined,
    };
  }

  /**
   * Get intent history for analysis
   */
  getHistory(): IntentContext[] {
    return [...this.history];
  }

  private analyzeIntent(
    tool: string,
    parameters: Record<string, unknown>
  ): { type: string; scope: string; risk: 'low' | 'medium' | 'high' } {
    // Determine intent type
    let type = 'unknown';
    if (tool.startsWith('truthpack_')) {
      type = 'truthpack_operation';
    } else if (tool.startsWith('firewall_')) {
      type = 'firewall_operation';
    } else if (tool.startsWith('validation_')) {
      type = 'validation_operation';
    } else if (tool.startsWith('context_')) {
      type = 'context_operation';
    } else if (tool.startsWith('register_')) {
      type = 'registration_operation';
    }

    // Determine scope
    let scope = 'local';
    if (parameters.filePath || parameters.targetFile) {
      scope = 'file';
    } else if (parameters.category === 'all') {
      scope = 'project';
    }

    // Assess risk
    let risk: 'low' | 'medium' | 'high' = 'low';
    if (tool.includes('delete') || tool.includes('modify')) {
      risk = 'medium';
    }
    if (scope === 'project' && (tool.includes('delete') || tool.includes('modify'))) {
      risk = 'high';
    }

    return { type, scope, risk };
  }

  private checkPatterns(context: IntentContext): string[] {
    const warnings: string[] = [];

    // Check for rapid repeated calls
    const recentSimilar = this.history
      .slice(-10)
      .filter(h => h.tool === context.tool);
    
    if (recentSimilar.length > 5) {
      warnings.push('High frequency of similar operations detected');
    }

    // Check for suspicious parameter values
    const paramStr = JSON.stringify(context.parameters);
    if (paramStr.length > 10000) {
      warnings.push('Unusually large parameters');
    }

    // Check for dangerous patterns in content parameters
    if (context.parameters.content && typeof context.parameters.content === 'string') {
      const content = context.parameters.content as string;
      if (content.includes('eval(') || content.includes('Function(')) {
        warnings.push('BLOCK: Content contains dangerous code patterns');
      }
    }

    return warnings;
  }

  private suggestModifications(context: IntentContext): Record<string, unknown> {
    const modifications: Record<string, unknown> = {};

    // Add default parameters if missing
    if (context.tool === 'firewall_evaluate' && !context.parameters.strict) {
      modifications.strict = true;
    }

    return modifications;
  }
}
