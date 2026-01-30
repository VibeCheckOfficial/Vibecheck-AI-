/**
 * Prompt Verifier
 * 
 * Verifies prompts before they are sent to AI models.
 * Detects potential issues that could lead to hallucinations.
 */

export interface VerificationIssue {
  type: 'warning' | 'error' | 'info';
  category: 'ambiguity' | 'scope' | 'safety' | 'context' | 'feasibility';
  message: string;
  suggestion?: string;
  location?: {
    start: number;
    end: number;
  };
}

export interface PromptVerificationResult {
  valid: boolean;
  score: number;
  issues: VerificationIssue[];
  enhancedPrompt?: string;
  requiredContext: string[];
  estimatedRisk: 'low' | 'medium' | 'high';
}

export interface VerifierConfig {
  strictMode: boolean;
  maxPromptLength: number;
  requireExplicitFiles: boolean;
  blockDangerousPatterns: boolean;
}

const DEFAULT_CONFIG: VerifierConfig = {
  strictMode: true,
  maxPromptLength: 10000,
  requireExplicitFiles: false,
  blockDangerousPatterns: true,
};

const AMBIGUOUS_PATTERNS = [
  { pattern: /\bthe file\b/i, message: 'Ambiguous file reference - specify the exact filename' },
  { pattern: /\bthat function\b/i, message: 'Ambiguous function reference - specify the exact function name' },
  { pattern: /\bthe component\b/i, message: 'Ambiguous component reference - specify the exact component name' },
  { pattern: /\bthe class\b/i, message: 'Ambiguous class reference - specify the exact class name' },
  { pattern: /\bsomewhere\b/i, message: 'Vague location reference - specify exact location' },
  { pattern: /\bmaybe\b/i, message: 'Uncertain instruction - be more specific' },
  { pattern: /\bsimilar to\b/i, message: 'Reference by similarity - provide exact example or specification' },
];

const DANGEROUS_PATTERNS = [
  { pattern: /\bdelete all\b/i, message: 'Bulk delete operation - be specific about what to delete' },
  { pattern: /\bdrop\s+(table|database)\b/i, message: 'Database drop operation - verify intent' },
  { pattern: /\brm\s+-rf\b/i, message: 'Recursive delete command - extremely dangerous' },
  { pattern: /\beval\b/i, message: 'eval usage detected - avoid if possible' },
];

const SCOPE_EXPLOSION_PATTERNS = [
  { pattern: /\ball files\b/i, threshold: 'high' as const },
  { pattern: /\bentire project\b/i, threshold: 'high' as const },
  { pattern: /\beverything\b/i, threshold: 'high' as const },
  { pattern: /\brefactor all\b/i, threshold: 'high' as const },
  { pattern: /\bmultiple\b/i, threshold: 'medium' as const },
];

const CONTEXT_INDICATORS = {
  routes: /\b(api|endpoint|route|fetch|request)\b/i,
  env: /\b(env|environment|config|process\.env)\b/i,
  auth: /\b(auth|login|permission|role|token)\b/i,
  contracts: /\b(schema|type|interface|contract|zod)\b/i,
};

export class PromptVerifier {
  private config: VerifierConfig;

  constructor(config: Partial<VerifierConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Verify a prompt and return issues
   */
  verify(prompt: string): PromptVerificationResult {
    const issues: VerificationIssue[] = [];
    let score = 100;

    if (prompt.length > this.config.maxPromptLength) {
      issues.push({
        type: 'warning',
        category: 'scope',
        message: `Prompt is very long (${prompt.length} chars) - consider breaking into smaller requests`,
      });
      score -= 10;
    }

    if (prompt.length < 20) {
      issues.push({
        type: 'warning',
        category: 'ambiguity',
        message: 'Prompt is very short - consider adding more detail',
      });
      score -= 15;
    }

    for (const { pattern, message } of AMBIGUOUS_PATTERNS) {
      const match = prompt.match(pattern);
      if (match) {
        issues.push({
          type: 'warning',
          category: 'ambiguity',
          message,
          location: match.index !== undefined ? {
            start: match.index,
            end: match.index + match[0].length,
          } : undefined,
        });
        score -= 5;
      }
    }

    for (const { pattern, message } of DANGEROUS_PATTERNS) {
      const match = prompt.match(pattern);
      if (match) {
        const issueType = this.config.blockDangerousPatterns ? 'error' : 'warning';
        issues.push({
          type: issueType,
          category: 'safety',
          message,
          suggestion: 'Review this operation carefully before proceeding',
          location: match.index !== undefined ? {
            start: match.index,
            end: match.index + match[0].length,
          } : undefined,
        });
        score -= issueType === 'error' ? 20 : 10;
      }
    }

    let scopeRisk = 0;
    for (const { pattern, threshold } of SCOPE_EXPLOSION_PATTERNS) {
      if (pattern.test(prompt)) {
        const riskValue = { low: 1, medium: 2, high: 3 }[threshold];
        scopeRisk += riskValue;
      }
    }

    if (scopeRisk >= 3) {
      issues.push({
        type: 'warning',
        category: 'scope',
        message: 'Prompt has high scope - consider breaking into smaller, focused tasks',
        suggestion: 'Split this into multiple smaller requests',
      });
      score -= 15;
    }

    const requiredContext = this.detectRequiredContext(prompt);

    if (this.config.requireExplicitFiles) {
      const hasExplicitFile = /\b\w+\.(ts|tsx|js|jsx|json|md)\b/.test(prompt);
      if (!hasExplicitFile) {
        issues.push({
          type: 'warning',
          category: 'context',
          message: 'No specific file referenced - specify target file(s)',
        });
        score -= 10;
      }
    }

    const hasErrors = issues.some(i => i.type === 'error');
    const valid = this.config.strictMode 
      ? !hasErrors && score >= 50
      : !hasErrors;

    const estimatedRisk = this.calculateRisk(issues, scopeRisk);

    const enhancedPrompt = issues.length > 0 
      ? this.generateEnhancedPrompt(prompt, issues) 
      : undefined;

    return {
      valid,
      score: Math.max(0, score),
      issues,
      enhancedPrompt,
      requiredContext,
      estimatedRisk,
    };
  }

  private detectRequiredContext(prompt: string): string[] {
    const required: string[] = [];

    for (const [context, pattern] of Object.entries(CONTEXT_INDICATORS)) {
      if (pattern.test(prompt)) {
        required.push(context);
      }
    }

    return required;
  }

  private calculateRisk(
    issues: VerificationIssue[], 
    scopeRisk: number
  ): 'low' | 'medium' | 'high' {
    const errorCount = issues.filter(i => i.type === 'error').length;
    const warningCount = issues.filter(i => i.type === 'warning').length;
    const safetyIssues = issues.filter(i => i.category === 'safety').length;

    if (errorCount > 0 || safetyIssues > 0 || scopeRisk >= 4) {
      return 'high';
    }

    if (warningCount > 3 || scopeRisk >= 2) {
      return 'medium';
    }

    return 'low';
  }

  private generateEnhancedPrompt(
    original: string, 
    issues: VerificationIssue[]
  ): string {
    const sections: string[] = [];

    sections.push('## Enhanced Prompt');
    sections.push('');
    sections.push('### Original Request');
    sections.push(original);
    sections.push('');
    sections.push('### Clarifications Needed');
    sections.push('');

    const byCategory = issues.reduce((acc, issue) => {
      if (!acc[issue.category]) acc[issue.category] = [];
      acc[issue.category].push(issue);
      return acc;
    }, {} as Record<string, VerificationIssue[]>);

    for (const [category, categoryIssues] of Object.entries(byCategory)) {
      sections.push(`**${category.charAt(0).toUpperCase() + category.slice(1)}:**`);
      for (const issue of categoryIssues) {
        sections.push(`- ${issue.message}`);
        if (issue.suggestion) {
          sections.push(`  _Suggestion: ${issue.suggestion}_`);
        }
      }
      sections.push('');
    }

    return sections.join('\n');
  }

  /**
   * Quick check for immediate blocking issues
   */
  quickCheck(prompt: string): { blocked: boolean; reason?: string } {
    if (!this.config.blockDangerousPatterns) {
      return { blocked: false };
    }

    for (const { pattern, message } of DANGEROUS_PATTERNS) {
      if (pattern.test(prompt)) {
        return { blocked: true, reason: message };
      }
    }

    return { blocked: false };
  }
}
