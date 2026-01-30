/**
 * Context Layers
 * 
 * Defines hierarchical context layers for organizing and prioritizing
 * context information during prompt construction.
 */

export type LayerPriority = 'critical' | 'high' | 'medium' | 'low';

export interface ContextLayer {
  name: string;
  priority: LayerPriority;
  maxTokens: number;
  required: boolean;
}

export const CONTEXT_LAYERS = {
  TRUTHPACK: {
    name: 'truthpack',
    priority: 'critical' as LayerPriority,
    maxTokens: 2000,
    required: true,
  },
  CODEBASE_STRUCTURE: {
    name: 'codebase_structure',
    priority: 'high' as LayerPriority,
    maxTokens: 1500,
    required: true,
  },
  RECENT_CHANGES: {
    name: 'recent_changes',
    priority: 'high' as LayerPriority,
    maxTokens: 1000,
    required: false,
  },
  CONVENTIONS: {
    name: 'conventions',
    priority: 'medium' as LayerPriority,
    maxTokens: 800,
    required: false,
  },
  DOCUMENTATION: {
    name: 'documentation',
    priority: 'medium' as LayerPriority,
    maxTokens: 1000,
    required: false,
  },
  EXAMPLES: {
    name: 'examples',
    priority: 'low' as LayerPriority,
    maxTokens: 500,
    required: false,
  },
} as const;

export class ContextLayers {
  private layers: Map<string, ContextLayer> = new Map();

  constructor() {
    // Initialize with default layers
    Object.values(CONTEXT_LAYERS).forEach((layer) => {
      this.layers.set(layer.name, layer);
    });
  }

  /**
   * Get layer by name
   */
  getLayer(name: string): ContextLayer | undefined {
    return this.layers.get(name);
  }

  /**
   * Get all layers sorted by priority
   */
  getLayersByPriority(): ContextLayer[] {
    const priorityOrder: Record<LayerPriority, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
    };

    return Array.from(this.layers.values()).sort(
      (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]
    );
  }

  /**
   * Calculate total token budget
   */
  getTotalTokenBudget(): number {
    return Array.from(this.layers.values()).reduce(
      (sum, layer) => sum + layer.maxTokens,
      0
    );
  }
}
