/**
 * Embedding Service
 * 
 * Generates and manages embeddings for semantic context retrieval.
 * Used for finding relevant context based on query similarity.
 */

export type Embedding = number[];

export interface EmbeddingResult {
  embedding: Embedding;
  model: string;
  dimensions: number;
  tokenCount: number;
}

export interface SimilarityResult {
  id: string;
  similarity: number;
  content: string;
}

export interface EmbeddingServiceConfig {
  model: string;
  dimensions: number;
  cacheEnabled: boolean;
  cachePath?: string;
}

const DEFAULT_CONFIG: EmbeddingServiceConfig = {
  model: 'text-embedding-3-small',
  dimensions: 1536,
  cacheEnabled: true,
};

export class EmbeddingService {
  private config: EmbeddingServiceConfig;
  private cache: Map<string, EmbeddingResult> = new Map();

  constructor(config: Partial<EmbeddingServiceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Generate embedding for text content
   */
  async generateEmbedding(content: string): Promise<EmbeddingResult> {
    // Check cache first
    const cacheKey = this.getCacheKey(content);
    if (this.config.cacheEnabled && this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    // TODO: Implement actual embedding generation via API
    const embedding = this.generatePlaceholderEmbedding();
    
    const result: EmbeddingResult = {
      embedding,
      model: this.config.model,
      dimensions: this.config.dimensions,
      tokenCount: this.estimateTokenCount(content),
    };

    if (this.config.cacheEnabled) {
      this.cache.set(cacheKey, result);
    }

    return result;
  }

  /**
   * Calculate cosine similarity between two embeddings
   */
  calculateSimilarity(a: Embedding, b: Embedding): number {
    if (a.length !== b.length) {
      throw new Error('Embeddings must have the same dimensions');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Find similar items from a collection
   */
  async findSimilar(
    query: string,
    items: Array<{ id: string; content: string; embedding?: Embedding }>,
    topK: number = 5
  ): Promise<SimilarityResult[]> {
    const queryEmbedding = await this.generateEmbedding(query);
    
    const results: SimilarityResult[] = [];
    
    for (const item of items) {
      const itemEmbedding = item.embedding ?? 
        (await this.generateEmbedding(item.content)).embedding;
      
      const similarity = this.calculateSimilarity(
        queryEmbedding.embedding,
        itemEmbedding
      );
      
      results.push({
        id: item.id,
        similarity,
        content: item.content,
      });
    }

    return results
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);
  }

  private getCacheKey(content: string): string {
    // Simple hash for cache key
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `${this.config.model}:${hash}`;
  }

  private generatePlaceholderEmbedding(): Embedding {
    // TODO: Replace with actual API call
    return Array(this.config.dimensions).fill(0).map(() => Math.random() - 0.5);
  }

  private estimateTokenCount(content: string): number {
    // Rough estimate: ~4 characters per token
    return Math.ceil(content.length / 4);
  }
}
