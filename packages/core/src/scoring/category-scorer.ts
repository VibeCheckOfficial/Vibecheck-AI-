/**
 * Category-Based Scoring System
 * 
 * Extends the unified scorer with category weights for more granular scoring.
 * Used alongside the primary health score for detailed breakdowns.
 * 
 * @module scoring/category-scorer
 */

import {
  calculateHealthScore,
  getVerdictFromScore,
  getScoreColor,
  createEmptySeverityCounts,
  type SeverityCounts,
} from './unified-scorer.js';

// ============================================================================
// CONSTANTS - Single source of truth for all category thresholds
// ============================================================================

export const CATEGORY_SCORE_CONFIG = {
  // Category weights (must sum to 1.0)
  weights: {
    functionality: 0.25,  // Routes work, no dead UI
    security: 0.25,       // No vulnerabilities, secrets exposed
    codeQuality: 0.20,    // No silent failures, placeholder logic
    reality: 0.15,        // Runtime verification (if run)
    dependencies: 0.15,   // Package health, outdated, vulnerable
  },
  
  // Severity deductions per category (capped to prevent negative scores)
  deductions: {
    critical: { points: 15, maxTotal: 45 },
    high: { points: 8, maxTotal: 32 },
    medium: { points: 3, maxTotal: 15 },
    low: { points: 1, maxTotal: 5 },
  },
  
  // Verdict thresholds (aligned with unified scorer)
  verdicts: {
    SHIP: { min: 75, color: 'green' as const, emoji: '✅' },
    WARN: { min: 40, color: 'yellow' as const, emoji: '⚠️' },
    BLOCK: { min: 0, color: 'red' as const, emoji: '🛑' },
  },
  
  // Engine/finding type to category mappings
  engineToCategory: {
    // Functionality
    'fake-feature': 'functionality',
    'dead-route': 'functionality',
    'placeholder': 'functionality',
    'ghost_route': 'functionality',
    'unimplemented': 'functionality',
    
    // Security
    'security': 'security',
    'secrets': 'security',
    'credential': 'security',
    'auth_gap': 'security',
    'auth_drift': 'security',
    'vulnerability': 'security',
    
    // Code Quality
    'hallucination': 'codeQuality',
    'todo': 'codeQuality',
    'console': 'codeQuality',
    'mock': 'codeQuality',
    'fake_data': 'codeQuality',
    'silent_failure': 'codeQuality',
    
    // Dependencies
    'dependency': 'dependencies',
    'outdated': 'dependencies',
    'vulnerable_dep': 'dependencies',
    
    // Reality
    'reality': 'reality',
    'runtime': 'reality',
    'contract_violation': 'reality',
  } as Record<string, keyof typeof CATEGORY_SCORE_CONFIG.weights>,
} as const;

// ============================================================================
// TYPES
// ============================================================================

export interface CategoryFinding {
  id: string;
  engine: string;
  type?: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  file: string;
  line: number;
  column?: number;
  message: string;
  confidence: number; // 0-1
}

export interface CategoryScore {
  name: string;
  score: number;        // 0-100
  findingCount: number;
  weight: number;
}

export interface DeductionBreakdown {
  severity: string;
  count: number;
  points: number;
  capped: boolean;
}

export interface CategoryScoreResult {
  /** Overall weighted score 0-100 */
  overall: number;
  /** Verdict: SHIP, WARN, or BLOCK */
  verdict: 'SHIP' | 'WARN' | 'BLOCK';
  /** Color for display */
  verdictColor: 'green' | 'yellow' | 'red';
  /** Emoji for display */
  verdictEmoji: string;
  /** Per-category breakdown */
  categories: CategoryScore[];
  /** Severity deduction breakdown */
  deductions: DeductionBreakdown[];
  /** Finding counts by severity */
  findings: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    total: number;
  };
}

// ============================================================================
// CORE CALCULATION
// ============================================================================

/**
 * Calculate category-weighted score from findings.
 * 
 * This provides a more granular breakdown than the simple health score,
 * showing how each category contributes to the overall result.
 * 
 * @param findings - Array of findings with severity and engine info
 * @returns Complete score result with category breakdown
 */
export function calculateCategoryScore(findings: CategoryFinding[]): CategoryScoreResult {
  const { weights, deductions: deductConfig, verdicts, engineToCategory } = CATEGORY_SCORE_CONFIG;
  
  // 1. Group findings by category
  const categoryFindings: Record<string, CategoryFinding[]> = {};
  for (const cat of Object.keys(weights)) {
    categoryFindings[cat] = [];
  }
  
  for (const finding of findings) {
    // Try engine first, then type, default to codeQuality
    const category = engineToCategory[finding.engine] 
      || engineToCategory[finding.type ?? ''] 
      || 'codeQuality';
    
    if (categoryFindings[category]) {
      categoryFindings[category].push(finding);
    } else {
      categoryFindings.codeQuality.push(finding);
    }
  }
  
  // 2. Calculate category scores (100 - weighted deductions)
  const categories: CategoryScore[] = [];
  let weightedSum = 0;
  
  const weightEntries = Object.entries(weights) as Array<[string, number]>;
  for (const [catName, weight] of weightEntries) {
    const catFindings = categoryFindings[catName] || [];
    let catDeduction = 0;
    
    for (const finding of catFindings) {
      const config = deductConfig[finding.severity];
      catDeduction += config.points * (finding.confidence ?? 1);
    }
    
    // Category score: 100 - deductions, floored at 0
    const catScore = Math.max(0, Math.round(100 - catDeduction));
    categories.push({
      name: catName,
      score: catScore,
      findingCount: catFindings.length,
      weight,
    });
    
    weightedSum += catScore * weight;
  }
  
  // 3. Calculate severity-based deductions for display
  const severityCounts: SeverityCounts = {
    critical: findings.filter(f => f.severity === 'critical').length,
    high: findings.filter(f => f.severity === 'high').length,
    medium: findings.filter(f => f.severity === 'medium').length,
    low: findings.filter(f => f.severity === 'low').length,
  };
  
  const deductionBreakdown: DeductionBreakdown[] = [];
  let totalDeduction = 0;
  
  const severityEntries = Object.entries(severityCounts) as Array<[keyof typeof deductConfig, number]>;
  for (const [sev, count] of severityEntries) {
    if (count === 0) continue;
    
    const config = deductConfig[sev];
    const rawDeduction = count * config.points;
    const cappedDeduction = Math.min(rawDeduction, config.maxTotal);
    
    deductionBreakdown.push({
      severity: sev,
      count,
      points: cappedDeduction,
      capped: rawDeduction > config.maxTotal,
    });
    
    totalDeduction += cappedDeduction;
  }
  
  // 4. Final score: weighted category average - severity deductions
  const overall = Math.max(0, Math.round(weightedSum - totalDeduction));
  
  // 5. Determine verdict
  let verdict: 'SHIP' | 'WARN' | 'BLOCK' = 'BLOCK';
  if (overall >= verdicts.SHIP.min) verdict = 'SHIP';
  else if (overall >= verdicts.WARN.min) verdict = 'WARN';
  
  const verdictConfig = verdicts[verdict];
  
  return {
    overall,
    verdict,
    verdictColor: verdictConfig.color,
    verdictEmoji: verdictConfig.emoji,
    categories,
    deductions: deductionBreakdown,
    findings: {
      ...severityCounts,
      total: findings.length,
    },
  };
}

/**
 * Get category for a finding type/engine
 */
export function getCategoryForEngine(engine: string, type?: string): string {
  const { engineToCategory } = CATEGORY_SCORE_CONFIG;
  return engineToCategory[engine] || engineToCategory[type ?? ''] || 'codeQuality';
}

/**
 * Convert CategoryFinding array to SeverityCounts for use with unified scorer
 */
export function toSeverityCounts(findings: CategoryFinding[]): SeverityCounts {
  return {
    critical: findings.filter(f => f.severity === 'critical').length,
    high: findings.filter(f => f.severity === 'high').length,
    medium: findings.filter(f => f.severity === 'medium').length,
    low: findings.filter(f => f.severity === 'low').length,
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Format a score as a percentage string
 */
export function formatScorePercent(score: number): string {
  return `${Math.round(score)}%`;
}

/**
 * Format a score as X/100
 */
export function formatScoreOutOf100(score: number): string {
  return `${Math.round(score)}/100`;
}

/**
 * Get all category names
 */
export function getCategoryNames(): string[] {
  return Object.keys(CATEGORY_SCORE_CONFIG.weights);
}

/**
 * Get weight for a category
 */
export function getCategoryWeight(category: string): number {
  return CATEGORY_SCORE_CONFIG.weights[category as keyof typeof CATEGORY_SCORE_CONFIG.weights] ?? 0;
}

// Re-export unified scorer functions for convenience
export {
  calculateHealthScore,
  getVerdictFromScore,
  getScoreColor,
  createEmptySeverityCounts,
};
