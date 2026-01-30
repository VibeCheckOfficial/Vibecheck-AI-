/**
 * Advanced Context Manager
 * 
 * Manages multi-layer context for AI prompts with freshness scoring
 * and relevance ranking to prevent context-related hallucinations.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { ContextLayer, CONTEXT_LAYERS, ContextLayers, type LayerPriority } from './context-layers.js';
import { FreshnessScorer, type FreshnessScore } from './freshness-scorer.js';
import type { Embedding } from './embedding-service.js';

export interface ContextItem {
  id: string;
  content: string;
  source: string;
  layer: ContextLayer;
  freshness: FreshnessScore;
  embedding?: Embedding;
  metadata: Record<string, unknown>;
  keywords?: string[];
}

export interface ContextQuery {
  query: string;
  maxItems: number;
  minFreshness?: number;
  requiredLayers?: ContextLayer[];
  targetFile?: string;
}

export interface ContextResult {
  items: ContextItem[];
  totalRelevance: number;
  coverageSummary: Record<string, number>;
  tokenEstimate: number;
}

export interface ContextManagerConfig {
  projectRoot: string;
  truthpackPath: string;
  maxContextTokens: number;
  enableCaching: boolean;
  cacheMaxAge: number;
}

const DEFAULT_CONFIG: ContextManagerConfig = {
  projectRoot: process.cwd(),
  truthpackPath: '.vibecheck/truthpack',
  maxContextTokens: 8000,
  enableCaching: true,
  cacheMaxAge: 5 * 60 * 1000, // 5 minutes
};

export class AdvancedContextManager {
  private contextItems: Map<string, ContextItem> = new Map();
  private config: ContextManagerConfig;
  private freshnessScorer: FreshnessScorer;
  private contextLayers: ContextLayers;
  private cacheTimestamp: number = 0;

  constructor(config: Partial<ContextManagerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.freshnessScorer = new FreshnessScorer();
    this.contextLayers = new ContextLayers();
  }

  /**
   * Initialize context from truthpack and project structure
   */
  async initialize(): Promise<void> {
    await this.loadTruthpackContext();
    await this.loadProjectStructure();
  }

  /**
   * Load context from truthpack files
   */
  private async loadTruthpackContext(): Promise<void> {
    const truthpackDir = path.join(this.config.projectRoot, this.config.truthpackPath);

    try {
      // Load routes
      const routesPath = path.join(truthpackDir, 'routes.json');
      const routesContent = await fs.readFile(routesPath, 'utf-8').catch(() => '{"routes":[]}');
      const routes = JSON.parse(routesContent);
      
      if (routes.routes?.length > 0) {
        await this.addContext({
          id: 'truthpack-routes',
          content: this.formatRoutesContext(routes.routes),
          source: 'truthpack',
          layer: CONTEXT_LAYERS.TRUTHPACK,
          freshness: this.freshnessScorer.calculateScore(
            new Date(routes.generatedAt || Date.now()),
            'truthpack'
          ),
          metadata: { type: 'routes', count: routes.routes.length },
          keywords: ['api', 'route', 'endpoint', 'http'],
        });
      }

      // Load env vars
      const envPath = path.join(truthpackDir, 'env.json');
      const envContent = await fs.readFile(envPath, 'utf-8').catch(() => '{"variables":[]}');
      const env = JSON.parse(envContent);

      if (env.variables?.length > 0) {
        await this.addContext({
          id: 'truthpack-env',
          content: this.formatEnvContext(env.variables),
          source: 'truthpack',
          layer: CONTEXT_LAYERS.TRUTHPACK,
          freshness: this.freshnessScorer.calculateScore(
            new Date(env.generatedAt || Date.now()),
            'truthpack'
          ),
          metadata: { type: 'env', count: env.variables.length },
          keywords: ['env', 'environment', 'config', 'variable'],
        });
      }

      // Load auth
      const authPath = path.join(truthpackDir, 'auth.json');
      const authContent = await fs.readFile(authPath, 'utf-8').catch(() => '{}');
      const auth = JSON.parse(authContent);

      if (auth.protectedResources?.length > 0 || auth.roles?.length > 0) {
        await this.addContext({
          id: 'truthpack-auth',
          content: this.formatAuthContext(auth),
          source: 'truthpack',
          layer: CONTEXT_LAYERS.TRUTHPACK,
          freshness: this.freshnessScorer.calculateScore(
            new Date(auth.generatedAt || Date.now()),
            'truthpack'
          ),
          metadata: { type: 'auth' },
          keywords: ['auth', 'authentication', 'authorization', 'role', 'permission'],
        });
      }

      // Load contracts
      const contractsPath = path.join(truthpackDir, 'contracts.json');
      const contractsContent = await fs.readFile(contractsPath, 'utf-8').catch(() => '{"contracts":[]}');
      const contracts = JSON.parse(contractsContent);

      if (contracts.contracts?.length > 0) {
        await this.addContext({
          id: 'truthpack-contracts',
          content: this.formatContractsContext(contracts.contracts),
          source: 'truthpack',
          layer: CONTEXT_LAYERS.TRUTHPACK,
          freshness: this.freshnessScorer.calculateScore(
            new Date(contracts.generatedAt || Date.now()),
            'truthpack'
          ),
          metadata: { type: 'contracts', count: contracts.contracts.length },
          keywords: ['type', 'schema', 'contract', 'interface', 'api'],
        });
      }

      this.cacheTimestamp = Date.now();
    } catch {
      // Truthpack may not exist yet
    }
  }

  /**
   * Load basic project structure context
   */
  private async loadProjectStructure(): Promise<void> {
    try {
      // Read package.json for project info
      const pkgPath = path.join(this.config.projectRoot, 'package.json');
      const pkgContent = await fs.readFile(pkgPath, 'utf-8').catch(() => '{}');
      const pkg = JSON.parse(pkgContent);

      const structureContent = this.formatProjectStructure(pkg);
      
      await this.addContext({
        id: 'project-structure',
        content: structureContent,
        source: 'file',
        layer: CONTEXT_LAYERS.CODEBASE_STRUCTURE,
        freshness: this.freshnessScorer.calculateScore(new Date(), 'file'),
        metadata: { type: 'structure' },
        keywords: ['project', 'package', 'dependency', 'script'],
      });
    } catch {
      // Package.json may not exist
    }
  }

  /**
   * Format routes for context
   */
  private formatRoutesContext(routes: Array<{ method: string; path: string; handler?: string }>): string {
    const lines = ['## Available API Routes', ''];
    for (const route of routes.slice(0, 50)) { // Limit for token budget
      lines.push(`- ${route.method} ${route.path}${route.handler ? ` → ${route.handler}` : ''}`);
    }
    if (routes.length > 50) {
      lines.push(`... and ${routes.length - 50} more routes`);
    }
    return lines.join('\n');
  }

  /**
   * Format env vars for context
   */
  private formatEnvContext(variables: Array<{ name: string; description?: string; required?: boolean }>): string {
    const lines = ['## Environment Variables', ''];
    for (const v of variables.slice(0, 30)) {
      const req = v.required ? ' (required)' : '';
      lines.push(`- ${v.name}${req}${v.description ? `: ${v.description}` : ''}`);
    }
    return lines.join('\n');
  }

  /**
   * Format auth for context
   */
  private formatAuthContext(auth: { roles?: Array<{ name: string }>; protectedResources?: Array<{ path: string }> }): string {
    const lines = ['## Authentication & Authorization', ''];
    
    if (auth.roles?.length) {
      lines.push('### Roles');
      for (const role of auth.roles) {
        lines.push(`- ${role.name}`);
      }
    }
    
    if (auth.protectedResources?.length) {
      lines.push('', '### Protected Routes');
      for (const res of auth.protectedResources.slice(0, 20)) {
        lines.push(`- ${res.path}`);
      }
    }
    
    return lines.join('\n');
  }

  /**
   * Format contracts for context
   */
  private formatContractsContext(contracts: Array<{ path: string; method?: string }>): string {
    const lines = ['## API Contracts', ''];
    for (const c of contracts.slice(0, 30)) {
      lines.push(`- ${c.method || 'ANY'} ${c.path}`);
    }
    return lines.join('\n');
  }

  /**
   * Format project structure
   */
  private formatProjectStructure(pkg: Record<string, unknown>): string {
    const lines = ['## Project Structure', ''];
    
    if (pkg.name) lines.push(`**Name:** ${pkg.name}`);
    if (pkg.description) lines.push(`**Description:** ${pkg.description}`);
    
    const deps = pkg.dependencies as Record<string, string> | undefined;
    if (deps) {
      lines.push('', '### Key Dependencies');
      const keyDeps = Object.keys(deps).slice(0, 15);
      for (const dep of keyDeps) {
        lines.push(`- ${dep}`);
      }
    }
    
    const scripts = pkg.scripts as Record<string, string> | undefined;
    if (scripts) {
      lines.push('', '### Available Scripts');
      for (const [name, cmd] of Object.entries(scripts).slice(0, 10)) {
        lines.push(`- \`${name}\`: ${cmd}`);
      }
    }
    
    return lines.join('\n');
  }

  /**
   * Add a context item to the manager
   */
  async addContext(item: ContextItem): Promise<void> {
    // Extract keywords if not provided
    if (!item.keywords) {
      item.keywords = this.extractKeywords(item.content);
    }
    this.contextItems.set(item.id, item);
  }

  /**
   * Extract keywords from content
   */
  private extractKeywords(content: string): string[] {
    const words = content.toLowerCase().match(/\b[a-z]{3,}\b/g) || [];
    const counts = new Map<string, number>();
    
    const stopWords = new Set(['the', 'and', 'for', 'with', 'this', 'that', 'from', 'are', 'was', 'were']);
    
    for (const word of words) {
      if (!stopWords.has(word)) {
        counts.set(word, (counts.get(word) || 0) + 1);
      }
    }
    
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
  }

  /**
   * Query relevant context for a given prompt
   */
  async queryContext(query: ContextQuery): Promise<ContextResult> {
    // Refresh cache if stale
    if (this.config.enableCaching && Date.now() - this.cacheTimestamp > this.config.cacheMaxAge) {
      await this.initialize();
    }

    const queryKeywords = this.extractKeywords(query.query.toLowerCase());
    const scoredItems: Array<{ item: ContextItem; score: number }> = [];

    for (const item of this.contextItems.values()) {
      // Check freshness filter
      if (query.minFreshness && item.freshness.score < query.minFreshness) {
        continue;
      }

      // Check required layers
      if (query.requiredLayers?.length) {
        const hasRequiredLayer = query.requiredLayers.some(l => l.name === item.layer.name);
        if (!hasRequiredLayer && item.layer.required === false) {
          continue;
        }
      }

      // Calculate relevance score
      const relevanceScore = this.calculateRelevance(queryKeywords, item, query.targetFile);
      
      // Weight by freshness and layer priority
      const priorityWeight = this.getPriorityWeight(item.layer.priority);
      const finalScore = relevanceScore * item.freshness.score * priorityWeight;

      if (finalScore > 0.1) { // Minimum threshold
        scoredItems.push({ item, score: finalScore });
      }
    }

    // Sort by score descending
    scoredItems.sort((a, b) => b.score - a.score);

    // Take top N items respecting token budget
    const selectedItems: ContextItem[] = [];
    let tokenEstimate = 0;
    const maxTokens = this.config.maxContextTokens;

    for (const { item } of scoredItems) {
      if (selectedItems.length >= query.maxItems) break;
      
      const itemTokens = this.estimateTokens(item.content);
      if (tokenEstimate + itemTokens <= maxTokens) {
        selectedItems.push(item);
        tokenEstimate += itemTokens;
      }
    }

    // Ensure required layers are included
    for (const item of this.contextItems.values()) {
      if (item.layer.required && !selectedItems.includes(item)) {
        const itemTokens = this.estimateTokens(item.content);
        if (tokenEstimate + itemTokens <= maxTokens) {
          selectedItems.unshift(item); // Add at beginning
          tokenEstimate += itemTokens;
        }
      }
    }

    // Calculate coverage summary
    const coverageSummary: Record<string, number> = {};
    for (const item of selectedItems) {
      coverageSummary[item.layer.name] = (coverageSummary[item.layer.name] || 0) + 1;
    }

    // Calculate total relevance
    const totalRelevance = scoredItems.length > 0
      ? scoredItems.slice(0, selectedItems.length).reduce((sum, s) => sum + s.score, 0) / selectedItems.length
      : 0;

    return {
      items: selectedItems,
      totalRelevance,
      coverageSummary,
      tokenEstimate,
    };
  }

  /**
   * Calculate relevance score between query and item
   */
  private calculateRelevance(queryKeywords: string[], item: ContextItem, targetFile?: string): number {
    let score = 0;
    const itemKeywords = item.keywords || [];

    // Keyword overlap
    const overlap = queryKeywords.filter(k => itemKeywords.includes(k)).length;
    score += overlap * 0.2;

    // Direct content match
    const queryLower = queryKeywords.join(' ');
    if (item.content.toLowerCase().includes(queryLower)) {
      score += 0.3;
    }

    // Target file relevance
    if (targetFile && item.metadata.file === targetFile) {
      score += 0.5;
    }

    // Layer type bonus (truthpack is always relevant)
    if (item.layer.name === 'truthpack') {
      score += 0.2;
    }

    return Math.min(score, 1);
  }

  /**
   * Get priority weight
   */
  private getPriorityWeight(priority: LayerPriority): number {
    const weights: Record<LayerPriority, number> = {
      critical: 1.0,
      high: 0.8,
      medium: 0.6,
      low: 0.4,
    };
    return weights[priority];
  }

  /**
   * Estimate token count (rough approximation)
   */
  private estimateTokens(content: string): number {
    return Math.ceil(content.length / 4);
  }

  /**
   * Invalidate stale context items
   */
  async invalidateStale(maxAge: number): Promise<number> {
    let removed = 0;
    const now = Date.now();

    for (const [id, item] of this.contextItems.entries()) {
      const age = now - item.freshness.lastUpdated.getTime();
      if (age > maxAge && !item.layer.required) {
        this.contextItems.delete(id);
        removed++;
      }
    }

    return removed;
  }

  /**
   * Get context coverage report
   */
  getCoverageReport(): Record<string, unknown> {
    const report: Record<string, unknown> = {
      totalItems: this.contextItems.size,
      byLayer: {} as Record<string, number>,
      bySource: {} as Record<string, number>,
      freshness: {
        fresh: 0,
        stale: 0,
      },
      estimatedTokens: 0,
    };

    for (const item of this.contextItems.values()) {
      // By layer
      const layerCounts = report.byLayer as Record<string, number>;
      layerCounts[item.layer.name] = (layerCounts[item.layer.name] || 0) + 1;

      // By source
      const sourceCounts = report.bySource as Record<string, number>;
      sourceCounts[item.source] = (sourceCounts[item.source] || 0) + 1;

      // Freshness
      const freshnessReport = report.freshness as { fresh: number; stale: number };
      if (this.freshnessScorer.isStale(item.freshness)) {
        freshnessReport.stale++;
      } else {
        freshnessReport.fresh++;
      }

      // Tokens
      (report as { estimatedTokens: number }).estimatedTokens += this.estimateTokens(item.content);
    }

    return report;
  }

  /**
   * Clear all context
   */
  clear(): void {
    this.contextItems.clear();
    this.cacheTimestamp = 0;
  }

  /**
   * Get a specific context item
   */
  getItem(id: string): ContextItem | undefined {
    return this.contextItems.get(id);
  }

  /**
   * Remove a specific context item
   */
  removeItem(id: string): boolean {
    return this.contextItems.delete(id);
  }
}
