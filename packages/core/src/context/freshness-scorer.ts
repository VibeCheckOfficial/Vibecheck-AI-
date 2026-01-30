/**
 * Freshness Scorer
 * 
 * Scores context items based on recency, relevance decay,
 * and source reliability to prevent stale context hallucinations.
 */

export interface FreshnessScore {
  score: number; // 0-1, where 1 is freshest
  lastUpdated: Date;
  decayRate: number;
  confidence: number;
}

export interface FreshnessConfig {
  maxAge: number; // milliseconds
  decayFunction: 'linear' | 'exponential' | 'step';
  sourceWeights: Record<string, number>;
}

const DEFAULT_CONFIG: FreshnessConfig = {
  maxAge: 24 * 60 * 60 * 1000, // 24 hours
  decayFunction: 'exponential',
  sourceWeights: {
    truthpack: 1.0,
    git: 0.9,
    file: 0.8,
    cache: 0.5,
  },
};

export class FreshnessScorer {
  private config: FreshnessConfig;

  constructor(config: Partial<FreshnessConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Calculate freshness score for a context item
   */
  calculateScore(lastUpdated: Date, source: string): FreshnessScore {
    const age = Date.now() - lastUpdated.getTime();
    const normalizedAge = Math.min(age / this.config.maxAge, 1);
    
    let decayScore: number;
    switch (this.config.decayFunction) {
      case 'linear':
        decayScore = 1 - normalizedAge;
        break;
      case 'exponential':
        decayScore = Math.exp(-3 * normalizedAge);
        break;
      case 'step':
        decayScore = normalizedAge < 0.5 ? 1 : normalizedAge < 0.8 ? 0.5 : 0.1;
        break;
      default:
        decayScore = 1 - normalizedAge;
    }

    const sourceWeight = this.config.sourceWeights[source] ?? 0.5;
    const finalScore = decayScore * sourceWeight;

    return {
      score: Math.max(0, Math.min(1, finalScore)),
      lastUpdated,
      decayRate: this.config.decayFunction === 'exponential' ? 3 : 1,
      confidence: sourceWeight,
    };
  }

  /**
   * Check if a context item is stale
   */
  isStale(freshnessScore: FreshnessScore, threshold: number = 0.3): boolean {
    return freshnessScore.score < threshold;
  }

  /**
   * Get recommended refresh interval for a source
   */
  getRefreshInterval(source: string): number {
    const weight = this.config.sourceWeights[source] ?? 0.5;
    // Higher weight sources need less frequent refresh
    return this.config.maxAge * weight;
  }
}
