/**
 * Context Injector
 * 
 * Intelligently injects relevant context into prompts
 * based on the task at hand.
 */

import type { ContextItem } from '../context/advanced-context-manager.js';

export interface InjectionConfig {
  maxContextItems: number;
  minRelevanceScore: number;
  preferFresh: boolean;
  requiredCategories: string[];
}

export interface InjectionResult {
  injectedItems: ContextItem[];
  totalTokens: number;
  coverage: Record<string, number>;
}

const DEFAULT_CONFIG: InjectionConfig = {
  maxContextItems: 10,
  minRelevanceScore: 0.5,
  preferFresh: true,
  requiredCategories: ['truthpack'],
};

export class ContextInjector {
  private config: InjectionConfig;

  constructor(config: Partial<InjectionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Select and inject context items for a task
   */
  inject(
    availableContext: ContextItem[],
    task: string,
    maxTokens: number
  ): InjectionResult {
    // Score items by relevance to task
    const scoredItems = this.scoreItems(availableContext, task);

    // Filter by minimum relevance
    const relevantItems = scoredItems.filter(
      (item) => item.score >= this.config.minRelevanceScore
    );

    // Ensure required categories are included
    const selectedItems = this.selectItems(relevantItems, maxTokens);

    return {
      injectedItems: selectedItems.map((s) => s.item),
      totalTokens: selectedItems.reduce((sum, s) => sum + s.tokens, 0),
      coverage: this.calculateCoverage(selectedItems.map((s) => s.item)),
    };
  }

  /**
   * Inject context for a specific file edit
   */
  injectForFileEdit(
    availableContext: ContextItem[],
    filePath: string,
    maxTokens: number
  ): InjectionResult {
    // Prioritize context related to the file
    const fileRelated = availableContext.filter(
      (item) => item.metadata.relatedFiles?.includes(filePath) ||
                item.source.includes(filePath)
    );

    const otherContext = availableContext.filter(
      (item) => !fileRelated.includes(item)
    );

    // Combine with file-related items first
    const combined = [...fileRelated, ...otherContext];
    
    return this.inject(combined, `Editing file: ${filePath}`, maxTokens);
  }

  private scoreItems(
    items: ContextItem[],
    task: string
  ): Array<{ item: ContextItem; score: number; tokens: number }> {
    return items.map((item) => ({
      item,
      score: this.calculateRelevance(item, task),
      tokens: this.estimateTokens(item.content),
    }));
  }

  private calculateRelevance(item: ContextItem, task: string): number {
    let score = 0.5; // Base score

    // Boost for freshness
    if (this.config.preferFresh && item.freshness.score > 0.7) {
      score += 0.2;
    }

    // Boost for required categories
    if (this.config.requiredCategories.includes(item.layer.name)) {
      score += 0.3;
    }

    // TODO: Implement semantic similarity scoring
    // - Use embeddings to compare task to context
    // - Adjust score based on similarity

    // Simple keyword matching for now
    const taskWords = task.toLowerCase().split(/\W+/);
    const contentWords = item.content.toLowerCase().split(/\W+/);
    const overlap = taskWords.filter((w) => contentWords.includes(w)).length;
    score += Math.min(0.3, overlap * 0.05);

    return Math.min(1, score);
  }

  private selectItems(
    scoredItems: Array<{ item: ContextItem; score: number; tokens: number }>,
    maxTokens: number
  ): Array<{ item: ContextItem; score: number; tokens: number }> {
    // Sort by score descending
    const sorted = [...scoredItems].sort((a, b) => b.score - a.score);

    const selected: Array<{ item: ContextItem; score: number; tokens: number }> = [];
    let totalTokens = 0;

    // First, ensure required categories are included
    for (const category of this.config.requiredCategories) {
      const categoryItem = sorted.find(
        (s) => s.item.layer.name === category && !selected.includes(s)
      );
      if (categoryItem && totalTokens + categoryItem.tokens <= maxTokens) {
        selected.push(categoryItem);
        totalTokens += categoryItem.tokens;
      }
    }

    // Fill remaining space with highest-scoring items
    for (const item of sorted) {
      if (selected.length >= this.config.maxContextItems) break;
      if (selected.includes(item)) continue;
      if (totalTokens + item.tokens > maxTokens) continue;

      selected.push(item);
      totalTokens += item.tokens;
    }

    return selected;
  }

  private calculateCoverage(items: ContextItem[]): Record<string, number> {
    const coverage: Record<string, number> = {};
    
    for (const item of items) {
      const layer = item.layer.name;
      coverage[layer] = (coverage[layer] ?? 0) + 1;
    }

    return coverage;
  }

  private estimateTokens(content: string): number {
    return Math.ceil(content.length / 4);
  }
}
