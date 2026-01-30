/**
 * Quality Analyzer
 * 
 * Analyzes prompt quality and provides recommendations
 * for improvement to reduce hallucination risk.
 */

export interface QualityReport {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  factors: QualityFactor[];
  recommendations: string[];
  hallucinationRisk: 'low' | 'medium' | 'high';
}

export interface QualityFactor {
  name: string;
  score: number;
  weight: number;
  details: string;
}

export interface AnalyzerConfig {
  minAcceptableScore: number;
  requiredFactors: string[];
}

const DEFAULT_CONFIG: AnalyzerConfig = {
  minAcceptableScore: 0.6,
  requiredFactors: ['context_coverage', 'task_clarity'],
};

export class QualityAnalyzer {
  private config: AnalyzerConfig;

  constructor(config: Partial<AnalyzerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Analyze prompt quality
   */
  analyze(prompt: string, contextSources: string[]): QualityReport {
    const factors: QualityFactor[] = [];

    // Analyze context coverage
    factors.push(this.analyzeContextCoverage(contextSources));

    // Analyze task clarity
    factors.push(this.analyzeTaskClarity(prompt));

    // Analyze specificity
    factors.push(this.analyzeSpecificity(prompt));

    // Analyze length
    factors.push(this.analyzeLength(prompt));

    // Analyze grounding
    factors.push(this.analyzeGrounding(prompt, contextSources));

    const score = this.calculateOverallScore(factors);
    const grade = this.scoreToGrade(score);
    const recommendations = this.generateRecommendations(factors);
    const hallucinationRisk = this.assessHallucinationRisk(score, factors);

    return {
      score,
      grade,
      factors,
      recommendations,
      hallucinationRisk,
    };
  }

  /**
   * Quick quality check
   */
  quickCheck(prompt: string): { acceptable: boolean; issues: string[] } {
    const issues: string[] = [];

    if (prompt.length < 100) {
      issues.push('Prompt is too short - add more context');
    }

    if (!prompt.includes('##') && !prompt.includes('Task')) {
      issues.push('Prompt lacks clear structure');
    }

    if (prompt.split(/\s+/).length < 50) {
      issues.push('Prompt may lack sufficient detail');
    }

    return {
      acceptable: issues.length === 0,
      issues,
    };
  }

  private analyzeContextCoverage(contextSources: string[]): QualityFactor {
    const expectedSources = ['truthpack', 'conventions', 'examples'];
    const covered = expectedSources.filter((s) => 
      contextSources.some((cs) => cs.includes(s))
    );
    
    const score = covered.length / expectedSources.length;

    return {
      name: 'context_coverage',
      score,
      weight: 0.3,
      details: `${covered.length}/${expectedSources.length} expected context types included`,
    };
  }

  private analyzeTaskClarity(prompt: string): QualityFactor {
    let score = 0.5;

    // Check for clear task section
    if (prompt.includes('## Task') || prompt.includes('Task:')) {
      score += 0.2;
    }

    // Check for actionable verbs
    const actionVerbs = ['create', 'implement', 'fix', 'add', 'update', 'modify', 'refactor'];
    if (actionVerbs.some((v) => prompt.toLowerCase().includes(v))) {
      score += 0.15;
    }

    // Check for specificity indicators
    if (prompt.includes('should') || prompt.includes('must')) {
      score += 0.15;
    }

    return {
      name: 'task_clarity',
      score: Math.min(1, score),
      weight: 0.25,
      details: 'Task description clarity assessment',
    };
  }

  private analyzeSpecificity(prompt: string): QualityFactor {
    let score = 0.5;

    // Check for file references
    if (/\w+\.(ts|js|tsx|jsx|json)/.test(prompt)) {
      score += 0.2;
    }

    // Check for code examples
    if (prompt.includes('```')) {
      score += 0.15;
    }

    // Check for type references
    if (/:\s*\w+/.test(prompt)) {
      score += 0.15;
    }

    return {
      name: 'specificity',
      score: Math.min(1, score),
      weight: 0.2,
      details: 'Level of specific details and references',
    };
  }

  private analyzeLength(prompt: string): QualityFactor {
    const wordCount = prompt.split(/\s+/).length;
    
    let score: number;
    if (wordCount < 100) {
      score = 0.3;
    } else if (wordCount < 300) {
      score = 0.6;
    } else if (wordCount < 1000) {
      score = 0.9;
    } else if (wordCount < 2000) {
      score = 1.0;
    } else {
      score = 0.8; // Too long can be problematic
    }

    return {
      name: 'length',
      score,
      weight: 0.1,
      details: `${wordCount} words`,
    };
  }

  private analyzeGrounding(prompt: string, contextSources: string[]): QualityFactor {
    let score = 0.5;

    // Check for truthpack grounding
    if (contextSources.some((s) => s.includes('truthpack'))) {
      score += 0.3;
    }

    // Check for explicit grounding statements
    if (prompt.includes('based on') || prompt.includes('according to')) {
      score += 0.1;
    }

    // Check for verification instructions
    if (prompt.includes('verify') || prompt.includes('check')) {
      score += 0.1;
    }

    return {
      name: 'grounding',
      score: Math.min(1, score),
      weight: 0.15,
      details: 'Level of grounding in verified facts',
    };
  }

  private calculateOverallScore(factors: QualityFactor[]): number {
    const weightSum = factors.reduce((sum, f) => sum + f.weight, 0);
    const weightedScore = factors.reduce((sum, f) => sum + f.score * f.weight, 0);
    return weightedScore / weightSum;
  }

  private scoreToGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
    if (score >= 0.9) return 'A';
    if (score >= 0.8) return 'B';
    if (score >= 0.7) return 'C';
    if (score >= 0.6) return 'D';
    return 'F';
  }

  private generateRecommendations(factors: QualityFactor[]): string[] {
    const recommendations: string[] = [];

    for (const factor of factors) {
      if (factor.score < 0.6) {
        switch (factor.name) {
          case 'context_coverage':
            recommendations.push('Add more context types (truthpack, conventions, examples)');
            break;
          case 'task_clarity':
            recommendations.push('Make the task description more specific with clear action verbs');
            break;
          case 'specificity':
            recommendations.push('Include file names, type references, or code examples');
            break;
          case 'length':
            recommendations.push('Add more detail to the prompt');
            break;
          case 'grounding':
            recommendations.push('Ground the request in verified truthpack data');
            break;
        }
      }
    }

    return recommendations;
  }

  private assessHallucinationRisk(
    score: number,
    factors: QualityFactor[]
  ): 'low' | 'medium' | 'high' {
    const groundingFactor = factors.find((f) => f.name === 'grounding');
    const contextFactor = factors.find((f) => f.name === 'context_coverage');

    if (score >= 0.8 && groundingFactor && groundingFactor.score >= 0.7) {
      return 'low';
    }

    if (score < 0.5 || (contextFactor && contextFactor.score < 0.5)) {
      return 'high';
    }

    return 'medium';
  }
}
