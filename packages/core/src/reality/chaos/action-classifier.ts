/**
 * Action Risk Classifier
 * 
 * Classifies chaos agent actions by risk level before execution.
 * Helps enforce safe mode and provides warnings for risky actions.
 * 
 * @module reality/chaos/action-classifier
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Risk levels for actions
 */
export type RiskLevel = 'safe' | 'medium' | 'high' | 'destructive';

/**
 * Classification result
 */
export interface ActionClassification {
  /** Overall risk level */
  riskLevel: RiskLevel;
  /** Risk score (0-100) */
  riskScore: number;
  /** Reasons for the classification */
  reasons: string[];
  /** Warnings to show user */
  warnings: string[];
  /** Suggested mitigations */
  mitigations: string[];
  /** Whether user confirmation is recommended */
  requiresConfirmation: boolean;
}

/**
 * Action to classify
 */
export interface ClassifiableAction {
  /** Action type */
  type: string;
  /** Target selector */
  selector?: string;
  /** Target URL */
  url?: string;
  /** Input value */
  value?: string;
  /** Element tag name */
  tagName?: string;
  /** Element attributes */
  attributes?: Record<string, string>;
  /** Element text content */
  textContent?: string;
  /** HTTP method if applicable */
  httpMethod?: string;
  /** Form action URL */
  formAction?: string;
}

// ============================================================================
// Pattern Definitions
// ============================================================================

/**
 * Patterns that indicate safe actions
 */
const SAFE_PATTERNS = {
  selectors: [
    /^(a|button)\[href\^="#"\]/,  // Anchor links
    /^nav\s/,  // Navigation elements
    /\.nav/,
    /\.menu/,
    /\.breadcrumb/,
    /\.pagination/,
  ],
  urls: [
    /^#/,  // Hash links
    /\/docs\//,
    /\/help\//,
    /\/about/,
    /\/contact/,
  ],
  actions: ['scroll', 'hover', 'read', 'view'],
};

/**
 * Patterns that indicate medium risk
 */
const MEDIUM_PATTERNS = {
  selectors: [
    /input\[type="text"\]/,
    /input\[type="email"\]/,
    /input\[type="search"\]/,
    /textarea/,
    /select/,
    /\.form-control/,
  ],
  urls: [
    /\/search/,
    /\/filter/,
    /\/sort/,
  ],
  actions: ['type', 'select', 'focus'],
};

/**
 * Patterns that indicate high risk
 */
const HIGH_PATTERNS = {
  selectors: [
    /button\[type="submit"\]/,
    /input\[type="submit"\]/,
    /\.submit/,
    /\.btn-primary/,
    /form/,
    /input\[type="password"\]/,
  ],
  urls: [
    /\/api\//,
    /\/login/,
    /\/register/,
    /\/signup/,
    /\/checkout/,
    /\/payment/,
  ],
  keywords: ['submit', 'send', 'save', 'create', 'add', 'post', 'update'],
  httpMethods: ['POST', 'PUT', 'PATCH'],
};

/**
 * Patterns that indicate destructive actions
 */
const DESTRUCTIVE_PATTERNS = {
  selectors: [
    /\[data-action="delete"\]/,
    /\[data-action="remove"\]/,
    /\.delete/,
    /\.remove/,
    /\.destroy/,
    /\.danger/,
    /#delete/,
    /#remove/,
  ],
  urls: [
    /\/delete/,
    /\/remove/,
    /\/destroy/,
    /\/purge/,
    /\/admin\/.*\/(delete|remove)/,
  ],
  keywords: ['delete', 'remove', 'destroy', 'purge', 'drop', 'truncate', 'wipe', 'erase'],
  httpMethods: ['DELETE'],
  textPatterns: [
    /delete\s+(all|everything|this)/i,
    /remove\s+(all|everything|this)/i,
    /permanently/i,
    /cannot\s+be\s+undone/i,
    /irreversible/i,
  ],
};

// ============================================================================
// Action Classifier Class
// ============================================================================

/**
 * Classifies actions by risk level
 */
export class ActionClassifier {
  /**
   * Classify an action
   */
  classify(action: ClassifiableAction): ActionClassification {
    const reasons: string[] = [];
    const warnings: string[] = [];
    const mitigations: string[] = [];
    let riskScore = 0;

    // Check for destructive patterns first
    const destructiveScore = this.checkDestructivePatterns(action, reasons, warnings);
    if (destructiveScore > 0) {
      riskScore += destructiveScore;
    }

    // Check for high risk patterns
    const highRiskScore = this.checkHighRiskPatterns(action, reasons, warnings);
    if (highRiskScore > 0) {
      riskScore += highRiskScore;
    }

    // Check for medium risk patterns
    const mediumRiskScore = this.checkMediumRiskPatterns(action, reasons);
    if (mediumRiskScore > 0) {
      riskScore += mediumRiskScore;
    }

    // Check for safe patterns (can reduce score)
    const safeScore = this.checkSafePatterns(action, reasons);
    riskScore = Math.max(0, riskScore - safeScore);

    // Determine risk level
    const riskLevel = this.determineRiskLevel(riskScore);

    // Add mitigations based on risk level
    this.addMitigations(riskLevel, action, mitigations);

    return {
      riskLevel,
      riskScore: Math.min(100, riskScore),
      reasons,
      warnings,
      mitigations,
      requiresConfirmation: riskLevel === 'high' || riskLevel === 'destructive',
    };
  }

  /**
   * Quick check if action is likely safe
   */
  isLikelySafe(action: ClassifiableAction): boolean {
    const classification = this.classify(action);
    return classification.riskLevel === 'safe';
  }

  /**
   * Quick check if action is destructive
   */
  isDestructive(action: ClassifiableAction): boolean {
    const classification = this.classify(action);
    return classification.riskLevel === 'destructive';
  }

  /**
   * Check for destructive patterns
   */
  private checkDestructivePatterns(
    action: ClassifiableAction,
    reasons: string[],
    warnings: string[]
  ): number {
    let score = 0;

    // Check HTTP method
    if (action.httpMethod && DESTRUCTIVE_PATTERNS.httpMethods.includes(action.httpMethod)) {
      score += 50;
      reasons.push(`HTTP method ${action.httpMethod} is destructive`);
      warnings.push('This action uses a destructive HTTP method');
    }

    // Check selector
    if (action.selector) {
      for (const pattern of DESTRUCTIVE_PATTERNS.selectors) {
        if (pattern.test(action.selector)) {
          score += 40;
          reasons.push(`Selector matches destructive pattern: ${pattern}`);
          warnings.push('Target element appears to be a destructive action');
          break;
        }
      }
    }

    // Check URL
    if (action.url) {
      for (const pattern of DESTRUCTIVE_PATTERNS.urls) {
        if (pattern.test(action.url)) {
          score += 40;
          reasons.push(`URL matches destructive pattern: ${pattern}`);
          warnings.push('Target URL appears to be a destructive endpoint');
          break;
        }
      }
    }

    // Check keywords in text content
    if (action.textContent) {
      const lowerText = action.textContent.toLowerCase();
      for (const keyword of DESTRUCTIVE_PATTERNS.keywords) {
        if (lowerText.includes(keyword)) {
          score += 30;
          reasons.push(`Text contains destructive keyword: ${keyword}`);
          break;
        }
      }

      // Check text patterns
      for (const pattern of DESTRUCTIVE_PATTERNS.textPatterns) {
        if (pattern.test(action.textContent)) {
          score += 20;
          reasons.push('Text contains destructive pattern');
          warnings.push('Action text suggests this is irreversible');
          break;
        }
      }
    }

    // Check input value
    if (action.value) {
      const lowerValue = action.value.toLowerCase();
      for (const keyword of DESTRUCTIVE_PATTERNS.keywords) {
        if (lowerValue.includes(keyword)) {
          score += 25;
          reasons.push(`Input value contains destructive keyword: ${keyword}`);
          break;
        }
      }
    }

    return score;
  }

  /**
   * Check for high risk patterns
   */
  private checkHighRiskPatterns(
    action: ClassifiableAction,
    reasons: string[],
    warnings: string[]
  ): number {
    let score = 0;

    // Check HTTP method
    if (action.httpMethod && HIGH_PATTERNS.httpMethods.includes(action.httpMethod)) {
      score += 25;
      reasons.push(`HTTP method ${action.httpMethod} modifies data`);
    }

    // Check selector
    if (action.selector) {
      for (const pattern of HIGH_PATTERNS.selectors) {
        if (pattern.test(action.selector)) {
          score += 20;
          reasons.push(`Selector matches high-risk pattern: ${pattern}`);
          break;
        }
      }
    }

    // Check URL
    if (action.url) {
      for (const pattern of HIGH_PATTERNS.urls) {
        if (pattern.test(action.url)) {
          score += 20;
          reasons.push(`URL matches high-risk pattern: ${pattern}`);
          break;
        }
      }
    }

    // Check keywords
    if (action.textContent) {
      const lowerText = action.textContent.toLowerCase();
      for (const keyword of HIGH_PATTERNS.keywords) {
        if (lowerText.includes(keyword)) {
          score += 15;
          reasons.push(`Text contains high-risk keyword: ${keyword}`);
          break;
        }
      }
    }

    // Check action type
    if (action.type === 'submit') {
      score += 20;
      reasons.push('Form submission action');
      warnings.push('This action will submit a form');
    }

    // Check for password fields
    if (action.selector?.includes('password') || action.attributes?.type === 'password') {
      score += 15;
      reasons.push('Interaction with password field');
    }

    return score;
  }

  /**
   * Check for medium risk patterns
   */
  private checkMediumRiskPatterns(action: ClassifiableAction, reasons: string[]): number {
    let score = 0;

    // Check selector
    if (action.selector) {
      for (const pattern of MEDIUM_PATTERNS.selectors) {
        if (pattern.test(action.selector)) {
          score += 10;
          reasons.push(`Selector matches medium-risk pattern: ${pattern}`);
          break;
        }
      }
    }

    // Check URL
    if (action.url) {
      for (const pattern of MEDIUM_PATTERNS.urls) {
        if (pattern.test(action.url)) {
          score += 10;
          reasons.push(`URL matches medium-risk pattern: ${pattern}`);
          break;
        }
      }
    }

    // Check action type
    if (action.type && MEDIUM_PATTERNS.actions.includes(action.type)) {
      score += 5;
      reasons.push(`Action type is medium risk: ${action.type}`);
    }

    return score;
  }

  /**
   * Check for safe patterns (reduces score)
   */
  private checkSafePatterns(action: ClassifiableAction, reasons: string[]): number {
    let score = 0;

    // Check selector
    if (action.selector) {
      for (const pattern of SAFE_PATTERNS.selectors) {
        if (pattern.test(action.selector)) {
          score += 15;
          reasons.push('Selector matches safe navigation pattern');
          break;
        }
      }
    }

    // Check URL
    if (action.url) {
      for (const pattern of SAFE_PATTERNS.urls) {
        if (pattern.test(action.url)) {
          score += 15;
          reasons.push('URL matches safe pattern');
          break;
        }
      }
    }

    // Check action type
    if (action.type && SAFE_PATTERNS.actions.includes(action.type)) {
      score += 20;
      reasons.push(`Action type is safe: ${action.type}`);
    }

    return score;
  }

  /**
   * Determine risk level from score
   */
  private determineRiskLevel(score: number): RiskLevel {
    if (score >= 60) return 'destructive';
    if (score >= 40) return 'high';
    if (score >= 20) return 'medium';
    return 'safe';
  }

  /**
   * Add mitigations based on risk level
   */
  private addMitigations(
    riskLevel: RiskLevel,
    action: ClassifiableAction,
    mitigations: string[]
  ): void {
    switch (riskLevel) {
      case 'destructive':
        mitigations.push('Take a screenshot before this action');
        mitigations.push('Create a database backup if possible');
        mitigations.push('Consider skipping this action');
        mitigations.push('Log this action for audit');
        break;
      case 'high':
        mitigations.push('Take a screenshot before this action');
        mitigations.push('Consider user confirmation');
        mitigations.push('Log this action');
        break;
      case 'medium':
        mitigations.push('Monitor for unexpected state changes');
        break;
      case 'safe':
        // No mitigations needed
        break;
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create an action classifier
 */
export function createActionClassifier(): ActionClassifier {
  return new ActionClassifier();
}

/**
 * Quick classify function
 */
export function classifyAction(action: ClassifiableAction): ActionClassification {
  const classifier = new ActionClassifier();
  return classifier.classify(action);
}

/**
 * Get risk level for an action
 */
export function getRiskLevel(action: ClassifiableAction): RiskLevel {
  const classifier = new ActionClassifier();
  return classifier.classify(action).riskLevel;
}
