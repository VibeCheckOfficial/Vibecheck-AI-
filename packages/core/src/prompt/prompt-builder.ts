/**
 * Prompt Builder
 * 
 * Constructs high-quality prompts with verified context
 * to minimize hallucination risk during generation.
 */

import type { ContextItem } from '../context/advanced-context-manager.js';

export interface PromptConfig {
  maxTokens: number;
  includeExamples: boolean;
  includeConventions: boolean;
  includeTruthpack: boolean;
  template: string;
}

export interface BuiltPrompt {
  content: string;
  tokenCount: number;
  contextSources: string[];
  quality: {
    score: number;
    warnings: string[];
  };
}

export interface PromptSection {
  name: string;
  content: string;
  priority: number;
  required: boolean;
}

const DEFAULT_CONFIG: PromptConfig = {
  maxTokens: 8000,
  includeExamples: true,
  includeConventions: true,
  includeTruthpack: true,
  template: 'code-generation',
};

export class PromptBuilder {
  private config: PromptConfig;
  private sections: PromptSection[] = [];

  constructor(config: Partial<PromptConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Add a section to the prompt
   */
  addSection(section: PromptSection): this {
    this.sections.push(section);
    return this;
  }

  /**
   * Add context items to the prompt
   */
  addContext(items: ContextItem[]): this {
    for (const item of items) {
      this.sections.push({
        name: `context-${item.id}`,
        content: this.formatContextItem(item),
        priority: this.getPriorityForLayer(item.layer.name),
        required: item.layer.required,
      });
    }
    return this;
  }

  /**
   * Add the user's task description
   */
  setTask(task: string): this {
    this.sections.push({
      name: 'task',
      content: `## Task\n\n${task}`,
      priority: 0,
      required: true,
    });
    return this;
  }

  /**
   * Build the final prompt
   */
  build(): BuiltPrompt {
    // Sort sections by priority
    const sortedSections = [...this.sections].sort((a, b) => a.priority - b.priority);
    
    // Build content respecting token limit
    let content = '';
    let tokenCount = 0;
    const includedSources: string[] = [];
    const warnings: string[] = [];

    for (const section of sortedSections) {
      const sectionTokens = this.estimateTokens(section.content);
      
      if (tokenCount + sectionTokens <= this.config.maxTokens) {
        content += section.content + '\n\n';
        tokenCount += sectionTokens;
        includedSources.push(section.name);
      } else if (section.required) {
        // Truncate required sections to fit
        const availableTokens = this.config.maxTokens - tokenCount;
        const truncated = this.truncateToTokens(section.content, availableTokens);
        content += truncated + '\n\n';
        tokenCount += availableTokens;
        includedSources.push(section.name);
        warnings.push(`Section "${section.name}" was truncated to fit token limit`);
      } else {
        warnings.push(`Section "${section.name}" was omitted due to token limit`);
      }
    }

    const quality = this.assessQuality(includedSources, warnings);

    return {
      content: content.trim(),
      tokenCount,
      contextSources: includedSources,
      quality,
    };
  }

  /**
   * Reset the builder for a new prompt
   */
  reset(): this {
    this.sections = [];
    return this;
  }

  private formatContextItem(item: ContextItem): string {
    return `### ${item.layer.name}: ${item.source}\n\n${item.content}`;
  }

  private getPriorityForLayer(layerName: string): number {
    const priorities: Record<string, number> = {
      truthpack: 1,
      codebase_structure: 2,
      recent_changes: 3,
      conventions: 4,
      documentation: 5,
      examples: 6,
    };
    return priorities[layerName] ?? 10;
  }

  private estimateTokens(content: string): number {
    // Rough estimate: ~4 characters per token
    return Math.ceil(content.length / 4);
  }

  private truncateToTokens(content: string, maxTokens: number): string {
    const maxChars = maxTokens * 4;
    if (content.length <= maxChars) return content;
    return content.slice(0, maxChars - 3) + '...';
  }

  private assessQuality(
    includedSources: string[],
    warnings: string[]
  ): { score: number; warnings: string[] } {
    let score = 1.0;

    // Penalize for missing critical sections
    if (!includedSources.some((s) => s.includes('truthpack'))) {
      score -= 0.2;
      warnings.push('Missing truthpack context - hallucination risk increased');
    }
    if (!includedSources.includes('task')) {
      score -= 0.3;
      warnings.push('Missing task description');
    }

    // Penalize for truncations
    score -= warnings.filter((w) => w.includes('truncated')).length * 0.05;

    return {
      score: Math.max(0, score),
      warnings,
    };
  }
}
