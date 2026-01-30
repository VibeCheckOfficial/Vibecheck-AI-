/**
 * Enhanced Memory System - Self-Aware Forge Engine
 *
 * Advanced memory capabilities for learning from:
 * - Full project history
 * - Old conversations with AI assistants
 * - Code change patterns over time
 * - Rule effectiveness feedback
 * - Cross-session learning
 *
 * This is the "brain" that makes Forge truly self-aware.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import type {
  ProjectPhase,
  RuleCategory,
  ForgeRule,
  ProjectAnalysis,
  LearnedPattern,
} from './types.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Enhanced memory store - the full brain
 */
export interface EnhancedMemory {
  version: string;
  projectId: string;
  createdAt: string;
  updatedAt: string;

  /** Project timeline - full history of the project */
  timeline: TimelineEvent[];

  /** Conversation history with AI assistants */
  conversations: ConversationMemory[];

  /** Code change history */
  codeHistory: CodeChangeRecord[];

  /** Learned insights from patterns */
  insights: ProjectInsight[];

  /** Rule effectiveness tracking */
  ruleMemory: RuleMemoryStore;

  /** Developer preferences learned over time */
  developerPreferences: DeveloperPreferences;

  /** Cross-session state */
  sessionHistory: SessionSummary[];

  /** Knowledge graph of project concepts */
  knowledgeGraph: KnowledgeGraph;

  /** Embeddings cache for semantic search */
  embeddingsCache: EmbeddingsCache;
}

/**
 * Timeline event - anything significant that happened
 */
export interface TimelineEvent {
  id: string;
  timestamp: string;
  type:
    | 'project-init'
    | 'phase-change'
    | 'major-refactor'
    | 'dependency-update'
    | 'feature-added'
    | 'bug-fixed'
    | 'test-added'
    | 'deploy'
    | 'rules-updated'
    | 'conversation'
    | 'milestone';
  title: string;
  description: string;
  metadata: Record<string, unknown>;
  impact: 'low' | 'medium' | 'high' | 'critical';
  relatedFiles?: string[];
  relatedRules?: string[];
}

/**
 * Conversation memory - what was discussed with AI
 */
export interface ConversationMemory {
  id: string;
  timestamp: string;
  source: 'cursor' | 'copilot' | 'claude' | 'chatgpt' | 'windsurf' | 'other';
  
  /** Summary of the conversation */
  summary: string;
  
  /** Key decisions made */
  decisions: ConversationDecision[];
  
  /** Code patterns discussed */
  patternsDiscussed: string[];
  
  /** Files that were modified as a result */
  filesModified: string[];
  
  /** Lessons learned */
  lessons: string[];
  
  /** Was the conversation successful? */
  outcome: 'success' | 'partial' | 'failed' | 'abandoned';
  
  /** Tags for categorization */
  tags: string[];
}

/**
 * Decision made during a conversation
 */
export interface ConversationDecision {
  question: string;
  decision: string;
  rationale: string;
  alternatives: string[];
  confidence: number;
}

/**
 * Code change record
 */
export interface CodeChangeRecord {
  id: string;
  timestamp: string;
  type: 'create' | 'modify' | 'delete' | 'rename' | 'refactor';
  filePath: string;
  
  /** What changed */
  changeDescription: string;
  
  /** Lines added/removed */
  linesAdded: number;
  linesRemoved: number;
  
  /** Complexity change */
  complexityDelta: number;
  
  /** Was this a breaking change? */
  breaking: boolean;
  
  /** Related to which feature/bug */
  relatedTo?: string;
  
  /** Commit hash if available */
  commitHash?: string;
  
  /** Author if available */
  author?: string;
}

/**
 * Project insight - learned understanding
 */
export interface ProjectInsight {
  id: string;
  discoveredAt: string;
  category: 'architecture' | 'pattern' | 'anti-pattern' | 'convention' | 'dependency' | 'performance' | 'security';
  
  /** The insight itself */
  insight: string;
  
  /** Evidence supporting this insight */
  evidence: string[];
  
  /** Confidence level */
  confidence: number;
  
  /** How many times this was observed */
  occurrences: number;
  
  /** Files where this applies */
  applicableFiles: string[];
  
  /** Has this been validated by user? */
  validated: boolean;
  
  /** User feedback if any */
  userFeedback?: string;
}

/**
 * Rule memory store - tracks rule effectiveness
 */
export interface RuleMemoryStore {
  /** Per-rule effectiveness */
  rules: Record<string, RuleEffectiveness>;
  
  /** Category-level stats */
  categories: Record<RuleCategory, CategoryStats>;
  
  /** Which rules were most helpful */
  topPerformers: string[];
  
  /** Which rules caused issues */
  problematic: string[];
  
  /** Suggested improvements */
  improvements: RuleImprovement[];
}

/**
 * Rule effectiveness tracking
 */
export interface RuleEffectiveness {
  ruleId: string;
  
  /** Times the rule was applied */
  applicationCount: number;
  
  /** Times the rule helped (user didn't override) */
  successCount: number;
  
  /** Times user manually edited after rule was applied */
  overrideCount: number;
  
  /** User ratings if provided */
  ratings: number[];
  
  /** Common modifications users make */
  commonModifications: string[];
  
  /** In which contexts this rule works best */
  bestContexts: string[];
  
  /** In which contexts this rule fails */
  worstContexts: string[];
  
  /** Effectiveness score (0-100) */
  score: number;
  
  /** Last updated */
  lastUpdated: string;
}

/**
 * Category-level statistics
 */
export interface CategoryStats {
  category: RuleCategory;
  totalRules: number;
  averageEffectiveness: number;
  mostEffectiveRule: string;
  leastEffectiveRule: string;
  recommendedForPhases: ProjectPhase[];
}

/**
 * Rule improvement suggestion
 */
export interface RuleImprovement {
  ruleId: string;
  suggestion: string;
  reason: string;
  priority: 'low' | 'medium' | 'high';
  source: 'user-feedback' | 'pattern-analysis' | 'effectiveness-drop';
}

/**
 * Developer preferences learned over time
 */
export interface DeveloperPreferences {
  /** Preferred naming conventions */
  naming: {
    files: string;
    components: string;
    functions: string;
    variables: string;
    types: string;
  };
  
  /** Code style preferences */
  codeStyle: {
    indentation: 'tabs' | 'spaces';
    indentSize: number;
    quotes: 'single' | 'double';
    semicolons: boolean;
    trailingCommas: 'none' | 'es5' | 'all';
    maxLineLength: number;
  };
  
  /** Architecture preferences */
  architecture: {
    preferredPatterns: string[];
    avoidedPatterns: string[];
    folderStructure: 'flat' | 'feature' | 'type' | 'domain';
  };
  
  /** Testing preferences */
  testing: {
    framework: string;
    coverageThreshold: number;
    preferredPatterns: string[];
  };
  
  /** Communication style with AI */
  aiInteraction: {
    verbosity: 'concise' | 'detailed' | 'verbose';
    explanationLevel: 'minimal' | 'moderate' | 'thorough';
    codeCommentStyle: 'none' | 'minimal' | 'detailed';
  };
  
  /** When preferences were last inferred */
  lastInferred: string;
  
  /** Confidence in these preferences */
  confidence: number;
}

/**
 * Session summary for cross-session learning
 */
export interface SessionSummary {
  sessionId: string;
  startTime: string;
  endTime: string;
  duration: number;
  
  /** What was accomplished */
  accomplishments: string[];
  
  /** Files touched */
  filesTouched: string[];
  
  /** Rules generated/modified */
  rulesModified: string[];
  
  /** Phase at start and end */
  phaseStart: ProjectPhase;
  phaseEnd: ProjectPhase;
  
  /** Key learnings from this session */
  learnings: string[];
  
  /** Issues encountered */
  issues: string[];
}

/**
 * Knowledge graph of project concepts
 */
export interface KnowledgeGraph {
  /** Nodes - concepts in the project */
  nodes: KnowledgeNode[];
  
  /** Edges - relationships between concepts */
  edges: KnowledgeEdge[];
  
  /** Last updated */
  updatedAt: string;
}

/**
 * Knowledge node
 */
export interface KnowledgeNode {
  id: string;
  type: 'component' | 'function' | 'type' | 'module' | 'concept' | 'pattern' | 'dependency';
  name: string;
  description: string;
  filePath?: string;
  importance: number;
  tags: string[];
}

/**
 * Knowledge edge
 */
export interface KnowledgeEdge {
  from: string;
  to: string;
  relationship: 'uses' | 'extends' | 'implements' | 'depends-on' | 'related-to' | 'part-of';
  strength: number;
}

/**
 * Embeddings cache for semantic search
 */
export interface EmbeddingsCache {
  /** File content embeddings */
  files: Record<string, { hash: string; embedding: number[] }>;
  
  /** Rule embeddings */
  rules: Record<string, { hash: string; embedding: number[] }>;
  
  /** Pattern embeddings */
  patterns: Record<string, number[]>;
  
  /** Model used for embeddings */
  model: string;
  
  /** Dimensions */
  dimensions: number;
  
  /** Last updated */
  updatedAt: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const MEMORY_VERSION = '2.0.0';
const MEMORY_FILE = 'forge-brain.json';
const VIBECHECK_DIR = '.vibecheck';
const MAX_TIMELINE_EVENTS = 1000;
const MAX_CONVERSATIONS = 100;
const MAX_CODE_CHANGES = 5000;
const MAX_INSIGHTS = 500;
const MAX_SESSIONS = 50;

// ============================================================================
// ENHANCED MEMORY CLASS
// ============================================================================

export class EnhancedMemorySystem {
  private projectPath: string;
  private memoryPath: string;
  private memory: EnhancedMemory;
  private dirty: boolean = false;
  private autoSaveInterval: ReturnType<typeof setInterval> | null = null;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
    this.memoryPath = path.join(projectPath, VIBECHECK_DIR, MEMORY_FILE);
    this.memory = this.loadOrCreate();
    
    // Auto-save every 30 seconds if dirty
    this.autoSaveInterval = setInterval(() => {
      if (this.dirty) {
        this.save();
      }
    }, 30000);
  }

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  private loadOrCreate(): EnhancedMemory {
    try {
      if (fs.existsSync(this.memoryPath)) {
        const content = fs.readFileSync(this.memoryPath, 'utf-8');
        const parsed = JSON.parse(content) as EnhancedMemory;
        
        if (parsed.version !== MEMORY_VERSION) {
          return this.migrate(parsed);
        }
        
        return parsed;
      }
    } catch {
      // Fall through to create new
    }
    
    return this.createNew();
  }

  private createNew(): EnhancedMemory {
    const projectId = this.generateProjectId();
    const now = new Date().toISOString();
    
    return {
      version: MEMORY_VERSION,
      projectId,
      createdAt: now,
      updatedAt: now,
      timeline: [{
        id: this.generateId(),
        timestamp: now,
        type: 'project-init',
        title: 'Project memory initialized',
        description: 'Enhanced memory system created for this project',
        metadata: {},
        impact: 'high',
      }],
      conversations: [],
      codeHistory: [],
      insights: [],
      ruleMemory: {
        rules: {},
        categories: {} as Record<RuleCategory, CategoryStats>,
        topPerformers: [],
        problematic: [],
        improvements: [],
      },
      developerPreferences: this.createDefaultPreferences(),
      sessionHistory: [],
      knowledgeGraph: { nodes: [], edges: [], updatedAt: now },
      embeddingsCache: {
        files: {},
        rules: {},
        patterns: {},
        model: 'none',
        dimensions: 0,
        updatedAt: now,
      },
    };
  }

  private createDefaultPreferences(): DeveloperPreferences {
    return {
      naming: {
        files: 'kebab-case',
        components: 'PascalCase',
        functions: 'camelCase',
        variables: 'camelCase',
        types: 'PascalCase',
      },
      codeStyle: {
        indentation: 'spaces',
        indentSize: 2,
        quotes: 'single',
        semicolons: true,
        trailingCommas: 'es5',
        maxLineLength: 100,
      },
      architecture: {
        preferredPatterns: [],
        avoidedPatterns: [],
        folderStructure: 'type',
      },
      testing: {
        framework: 'vitest',
        coverageThreshold: 80,
        preferredPatterns: [],
      },
      aiInteraction: {
        verbosity: 'detailed',
        explanationLevel: 'moderate',
        codeCommentStyle: 'minimal',
      },
      lastInferred: new Date().toISOString(),
      confidence: 0.5,
    };
  }

  private migrate(old: Partial<EnhancedMemory>): EnhancedMemory {
    const base = this.createNew();
    
    // Preserve what we can from old memory
    return {
      ...base,
      projectId: old.projectId ?? base.projectId,
      createdAt: old.createdAt ?? base.createdAt,
      timeline: [...(old.timeline ?? []), ...base.timeline],
      conversations: old.conversations ?? [],
      codeHistory: old.codeHistory ?? [],
      insights: old.insights ?? [],
      ruleMemory: {
        ...base.ruleMemory,
        ...(old.ruleMemory ?? {}),
      },
      developerPreferences: {
        ...base.developerPreferences,
        ...(old.developerPreferences ?? {}),
      },
      sessionHistory: old.sessionHistory ?? [],
      knowledgeGraph: old.knowledgeGraph ?? base.knowledgeGraph,
      embeddingsCache: old.embeddingsCache ?? base.embeddingsCache,
      version: MEMORY_VERSION,
      updatedAt: new Date().toISOString(),
    };
  }

  save(): void {
    try {
      const dir = path.dirname(this.memoryPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      this.memory.updatedAt = new Date().toISOString();
      fs.writeFileSync(this.memoryPath, JSON.stringify(this.memory, null, 2), 'utf-8');
      this.dirty = false;
    } catch (error) {
      console.error('Failed to save enhanced memory:', error);
    }
  }

  dispose(): void {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
    }
    if (this.dirty) {
      this.save();
    }
  }

  // ============================================================================
  // TIMELINE
  // ============================================================================

  /**
   * Add event to timeline
   */
  addTimelineEvent(event: Omit<TimelineEvent, 'id' | 'timestamp'>): void {
    this.memory.timeline.push({
      ...event,
      id: this.generateId(),
      timestamp: new Date().toISOString(),
    });
    
    // Trim if too long
    if (this.memory.timeline.length > MAX_TIMELINE_EVENTS) {
      this.memory.timeline = this.memory.timeline.slice(-MAX_TIMELINE_EVENTS);
    }
    
    this.dirty = true;
  }

  /**
   * Get recent timeline events
   */
  getRecentEvents(count: number = 20): TimelineEvent[] {
    return this.memory.timeline.slice(-count);
  }

  /**
   * Get events by type
   */
  getEventsByType(type: TimelineEvent['type']): TimelineEvent[] {
    return this.memory.timeline.filter((e) => e.type === type);
  }

  /**
   * Get events in date range
   */
  getEventsBetween(start: Date, end: Date): TimelineEvent[] {
    return this.memory.timeline.filter((e) => {
      const ts = new Date(e.timestamp);
      return ts >= start && ts <= end;
    });
  }

  // ============================================================================
  // CONVERSATIONS
  // ============================================================================

  /**
   * Record a conversation with AI
   */
  recordConversation(conversation: Omit<ConversationMemory, 'id' | 'timestamp'>): void {
    this.memory.conversations.push({
      ...conversation,
      id: this.generateId(),
      timestamp: new Date().toISOString(),
    });
    
    // Trim if too long
    if (this.memory.conversations.length > MAX_CONVERSATIONS) {
      this.memory.conversations = this.memory.conversations.slice(-MAX_CONVERSATIONS);
    }
    
    // Also add to timeline
    this.addTimelineEvent({
      type: 'conversation',
      title: `Conversation: ${conversation.summary.substring(0, 50)}...`,
      description: conversation.summary,
      metadata: {
        source: conversation.source,
        outcome: conversation.outcome,
        decisionsCount: conversation.decisions.length,
      },
      impact: conversation.outcome === 'success' ? 'medium' : 'low',
      relatedFiles: conversation.filesModified,
    });
    
    this.dirty = true;
  }

  /**
   * Get conversations by source
   */
  getConversationsBySource(source: ConversationMemory['source']): ConversationMemory[] {
    return this.memory.conversations.filter((c) => c.source === source);
  }

  /**
   * Get successful conversations for learning
   */
  getSuccessfulConversations(): ConversationMemory[] {
    return this.memory.conversations.filter((c) => c.outcome === 'success');
  }

  /**
   * Search conversations by tag
   */
  searchConversationsByTag(tag: string): ConversationMemory[] {
    return this.memory.conversations.filter((c) => c.tags.includes(tag));
  }

  /**
   * Get lessons learned from all conversations
   */
  getAllLessons(): string[] {
    const lessons: string[] = [];
    for (const conv of this.memory.conversations) {
      lessons.push(...conv.lessons);
    }
    return [...new Set(lessons)]; // Deduplicate
  }

  // ============================================================================
  // CODE HISTORY
  // ============================================================================

  /**
   * Record a code change
   */
  recordCodeChange(change: Omit<CodeChangeRecord, 'id' | 'timestamp'>): void {
    this.memory.codeHistory.push({
      ...change,
      id: this.generateId(),
      timestamp: new Date().toISOString(),
    });
    
    // Trim if too long
    if (this.memory.codeHistory.length > MAX_CODE_CHANGES) {
      this.memory.codeHistory = this.memory.codeHistory.slice(-MAX_CODE_CHANGES);
    }
    
    this.dirty = true;
  }

  /**
   * Get code changes for a file
   */
  getFileHistory(filePath: string): CodeChangeRecord[] {
    return this.memory.codeHistory.filter((c) => c.filePath === filePath);
  }

  /**
   * Get recent refactors
   */
  getRecentRefactors(count: number = 10): CodeChangeRecord[] {
    return this.memory.codeHistory
      .filter((c) => c.type === 'refactor')
      .slice(-count);
  }

  /**
   * Calculate code velocity (changes per day)
   */
  getCodeVelocity(days: number = 7): number {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const recentChanges = this.memory.codeHistory.filter(
      (c) => new Date(c.timestamp).getTime() > cutoff
    );
    return recentChanges.length / days;
  }

  /**
   * Get breaking changes
   */
  getBreakingChanges(): CodeChangeRecord[] {
    return this.memory.codeHistory.filter((c) => c.breaking);
  }

  // ============================================================================
  // INSIGHTS
  // ============================================================================

  /**
   * Add a new insight
   */
  addInsight(insight: Omit<ProjectInsight, 'id' | 'discoveredAt'>): void {
    // Check if similar insight exists
    const existing = this.memory.insights.find(
      (i) => i.insight.toLowerCase() === insight.insight.toLowerCase()
    );
    
    if (existing) {
      // Update existing
      existing.occurrences++;
      existing.confidence = Math.min(1, existing.confidence + 0.1);
      existing.evidence.push(...insight.evidence);
      existing.applicableFiles.push(...insight.applicableFiles);
      existing.applicableFiles = [...new Set(existing.applicableFiles)];
    } else {
      // Add new
      this.memory.insights.push({
        ...insight,
        id: this.generateId(),
        discoveredAt: new Date().toISOString(),
      });
      
      // Trim if too long
      if (this.memory.insights.length > MAX_INSIGHTS) {
        // Remove lowest confidence insights
        this.memory.insights.sort((a, b) => b.confidence - a.confidence);
        this.memory.insights = this.memory.insights.slice(0, MAX_INSIGHTS);
      }
    }
    
    this.dirty = true;
  }

  /**
   * Get insights by category
   */
  getInsightsByCategory(category: ProjectInsight['category']): ProjectInsight[] {
    return this.memory.insights.filter((i) => i.category === category);
  }

  /**
   * Get high-confidence insights
   */
  getConfidentInsights(minConfidence: number = 0.7): ProjectInsight[] {
    return this.memory.insights.filter((i) => i.confidence >= minConfidence);
  }

  /**
   * Validate an insight (user confirmation)
   */
  validateInsight(insightId: string, feedback?: string): void {
    const insight = this.memory.insights.find((i) => i.id === insightId);
    if (insight) {
      insight.validated = true;
      insight.confidence = Math.min(1, insight.confidence + 0.2);
      if (feedback) {
        insight.userFeedback = feedback;
      }
      this.dirty = true;
    }
  }

  /**
   * Reject an insight
   */
  rejectInsight(insightId: string, reason?: string): void {
    const index = this.memory.insights.findIndex((i) => i.id === insightId);
    if (index >= 0) {
      const insight = this.memory.insights[index];
      insight.validated = false;
      insight.confidence = Math.max(0, insight.confidence - 0.3);
      if (reason) {
        insight.userFeedback = `Rejected: ${reason}`;
      }
      
      // Remove if confidence too low
      if (insight.confidence < 0.1) {
        this.memory.insights.splice(index, 1);
      }
      
      this.dirty = true;
    }
  }

  // ============================================================================
  // RULE MEMORY
  // ============================================================================

  /**
   * Record rule application
   */
  recordRuleApplication(
    ruleId: string,
    wasSuccessful: boolean,
    context?: string
  ): void {
    if (!this.memory.ruleMemory.rules[ruleId]) {
      this.memory.ruleMemory.rules[ruleId] = {
        ruleId,
        applicationCount: 0,
        successCount: 0,
        overrideCount: 0,
        ratings: [],
        commonModifications: [],
        bestContexts: [],
        worstContexts: [],
        score: 50,
        lastUpdated: new Date().toISOString(),
      };
    }
    
    const rule = this.memory.ruleMemory.rules[ruleId];
    rule.applicationCount++;
    
    if (wasSuccessful) {
      rule.successCount++;
      if (context && !rule.bestContexts.includes(context)) {
        rule.bestContexts.push(context);
      }
    } else {
      rule.overrideCount++;
      if (context && !rule.worstContexts.includes(context)) {
        rule.worstContexts.push(context);
      }
    }
    
    // Recalculate score
    rule.score = Math.round(
      (rule.successCount / rule.applicationCount) * 100
    );
    rule.lastUpdated = new Date().toISOString();
    
    // Update top performers / problematic lists
    this.updateRuleLists();
    
    this.dirty = true;
  }

  /**
   * Record rule rating
   */
  recordRuleRating(ruleId: string, rating: number): void {
    if (!this.memory.ruleMemory.rules[ruleId]) {
      this.recordRuleApplication(ruleId, true);
    }
    
    const rule = this.memory.ruleMemory.rules[ruleId];
    rule.ratings.push(rating);
    
    // Keep last 20 ratings
    if (rule.ratings.length > 20) {
      rule.ratings = rule.ratings.slice(-20);
    }
    
    // Factor ratings into score
    const avgRating = rule.ratings.reduce((a, b) => a + b, 0) / rule.ratings.length;
    rule.score = Math.round((rule.score + avgRating * 20) / 2);
    rule.lastUpdated = new Date().toISOString();
    
    this.dirty = true;
  }

  /**
   * Record rule modification
   */
  recordRuleModification(ruleId: string, modification: string): void {
    if (!this.memory.ruleMemory.rules[ruleId]) {
      this.recordRuleApplication(ruleId, false);
    }
    
    const rule = this.memory.ruleMemory.rules[ruleId];
    
    if (!rule.commonModifications.includes(modification)) {
      rule.commonModifications.push(modification);
      
      // Keep last 10 modifications
      if (rule.commonModifications.length > 10) {
        rule.commonModifications = rule.commonModifications.slice(-10);
      }
    }
    
    this.dirty = true;
  }

  /**
   * Get rule effectiveness
   */
  getRuleEffectiveness(ruleId: string): RuleEffectiveness | null {
    return this.memory.ruleMemory.rules[ruleId] ?? null;
  }

  /**
   * Get top performing rules
   */
  getTopPerformingRules(count: number = 10): RuleEffectiveness[] {
    return Object.values(this.memory.ruleMemory.rules)
      .sort((a, b) => b.score - a.score)
      .slice(0, count);
  }

  /**
   * Get problematic rules
   */
  getProblematicRules(threshold: number = 50): RuleEffectiveness[] {
    return Object.values(this.memory.ruleMemory.rules)
      .filter((r) => r.score < threshold && r.applicationCount >= 3)
      .sort((a, b) => a.score - b.score);
  }

  private updateRuleLists(): void {
    const rules = Object.values(this.memory.ruleMemory.rules);
    
    // Top performers (score > 80, at least 5 applications)
    this.memory.ruleMemory.topPerformers = rules
      .filter((r) => r.score > 80 && r.applicationCount >= 5)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map((r) => r.ruleId);
    
    // Problematic (score < 50, at least 3 applications)
    this.memory.ruleMemory.problematic = rules
      .filter((r) => r.score < 50 && r.applicationCount >= 3)
      .sort((a, b) => a.score - b.score)
      .slice(0, 10)
      .map((r) => r.ruleId);
  }

  // ============================================================================
  // DEVELOPER PREFERENCES
  // ============================================================================

  /**
   * Learn preferences from project analysis
   */
  learnPreferences(analysis: ProjectAnalysis, patterns: LearnedPattern[]): void {
    const prefs = this.memory.developerPreferences;
    
    // Learn naming from analysis
    // This would be enhanced with pattern learning
    
    // Learn architecture preferences
    if (analysis.patterns.stateManagement) {
      if (!prefs.architecture.preferredPatterns.includes(analysis.patterns.stateManagement)) {
        prefs.architecture.preferredPatterns.push(analysis.patterns.stateManagement);
      }
    }
    
    // Learn testing preferences
    if (analysis.patterns.testing.length > 0) {
      prefs.testing.framework = analysis.patterns.testing[0];
    }
    
    // Learn from patterns
    for (const pattern of patterns) {
      if (pattern.category === 'naming' && pattern.confidence > 0.7) {
        // Update naming preferences based on high-confidence patterns
        const description = pattern.description.toLowerCase();
        if (description.includes('pascalcase')) {
          if (description.includes('component')) {
            prefs.naming.components = 'PascalCase';
          } else if (description.includes('type')) {
            prefs.naming.types = 'PascalCase';
          }
        }
      }
    }
    
    prefs.lastInferred = new Date().toISOString();
    prefs.confidence = Math.min(1, prefs.confidence + 0.1);
    
    this.dirty = true;
  }

  /**
   * Get current preferences
   */
  getPreferences(): DeveloperPreferences {
    return { ...this.memory.developerPreferences };
  }

  /**
   * Update a specific preference
   */
  updatePreference<K extends keyof DeveloperPreferences>(
    category: K,
    value: DeveloperPreferences[K]
  ): void {
    this.memory.developerPreferences[category] = value;
    this.memory.developerPreferences.lastInferred = new Date().toISOString();
    this.dirty = true;
  }

  // ============================================================================
  // SESSION HISTORY
  // ============================================================================

  /**
   * Start a new session
   */
  startSession(): string {
    const sessionId = this.generateId();
    
    const session: SessionSummary = {
      sessionId,
      startTime: new Date().toISOString(),
      endTime: '',
      duration: 0,
      accomplishments: [],
      filesTouched: [],
      rulesModified: [],
      phaseStart: 'active-dev', // Will be updated
      phaseEnd: 'active-dev',
      learnings: [],
      issues: [],
    };
    
    this.memory.sessionHistory.push(session);
    
    // Trim if too long
    if (this.memory.sessionHistory.length > MAX_SESSIONS) {
      this.memory.sessionHistory = this.memory.sessionHistory.slice(-MAX_SESSIONS);
    }
    
    this.dirty = true;
    return sessionId;
  }

  /**
   * End a session
   */
  endSession(
    sessionId: string,
    summary: Partial<Omit<SessionSummary, 'sessionId' | 'startTime' | 'endTime' | 'duration'>>
  ): void {
    const session = this.memory.sessionHistory.find((s) => s.sessionId === sessionId);
    if (!session) return;
    
    session.endTime = new Date().toISOString();
    session.duration = new Date(session.endTime).getTime() - new Date(session.startTime).getTime();
    
    Object.assign(session, summary);
    
    // Add to timeline
    this.addTimelineEvent({
      type: 'milestone',
      title: `Session completed: ${session.accomplishments.length} accomplishments`,
      description: session.accomplishments.join(', '),
      metadata: {
        sessionId,
        duration: session.duration,
        filesCount: session.filesTouched.length,
      },
      impact: session.accomplishments.length > 3 ? 'high' : 'medium',
      relatedFiles: session.filesTouched,
      relatedRules: session.rulesModified,
    });
    
    this.dirty = true;
  }

  /**
   * Get session summary
   */
  getSessionSummary(sessionId: string): SessionSummary | null {
    return this.memory.sessionHistory.find((s) => s.sessionId === sessionId) ?? null;
  }

  /**
   * Get recent sessions
   */
  getRecentSessions(count: number = 10): SessionSummary[] {
    return this.memory.sessionHistory.slice(-count);
  }

  // ============================================================================
  // KNOWLEDGE GRAPH
  // ============================================================================

  /**
   * Add a node to the knowledge graph
   */
  addKnowledgeNode(node: Omit<KnowledgeNode, 'id'>): string {
    const id = this.generateId();
    
    this.memory.knowledgeGraph.nodes.push({
      ...node,
      id,
    });
    
    this.memory.knowledgeGraph.updatedAt = new Date().toISOString();
    this.dirty = true;
    
    return id;
  }

  /**
   * Add an edge to the knowledge graph
   */
  addKnowledgeEdge(edge: KnowledgeEdge): void {
    // Check if edge already exists
    const existing = this.memory.knowledgeGraph.edges.find(
      (e) => e.from === edge.from && e.to === edge.to && e.relationship === edge.relationship
    );
    
    if (existing) {
      existing.strength = Math.min(1, existing.strength + 0.1);
    } else {
      this.memory.knowledgeGraph.edges.push(edge);
    }
    
    this.memory.knowledgeGraph.updatedAt = new Date().toISOString();
    this.dirty = true;
  }

  /**
   * Get related nodes
   */
  getRelatedNodes(nodeId: string): KnowledgeNode[] {
    const relatedIds = this.memory.knowledgeGraph.edges
      .filter((e) => e.from === nodeId || e.to === nodeId)
      .map((e) => (e.from === nodeId ? e.to : e.from));
    
    return this.memory.knowledgeGraph.nodes.filter((n) => relatedIds.includes(n.id));
  }

  /**
   * Get nodes by type
   */
  getNodesByType(type: KnowledgeNode['type']): KnowledgeNode[] {
    return this.memory.knowledgeGraph.nodes.filter((n) => n.type === type);
  }

  // ============================================================================
  // SEMANTIC SEARCH (placeholder for embeddings)
  // ============================================================================

  /**
   * Search memory semantically (placeholder - would use embeddings)
   */
  semanticSearch(query: string, limit: number = 10): Array<{
    type: 'conversation' | 'insight' | 'timeline' | 'knowledge';
    item: unknown;
    relevance: number;
  }> {
    // Simple keyword-based search as placeholder
    // In production, this would use embeddings
    const queryLower = query.toLowerCase();
    const results: Array<{
      type: 'conversation' | 'insight' | 'timeline' | 'knowledge';
      item: unknown;
      relevance: number;
    }> = [];
    
    // Search conversations
    for (const conv of this.memory.conversations) {
      if (conv.summary.toLowerCase().includes(queryLower)) {
        results.push({
          type: 'conversation',
          item: conv,
          relevance: 0.8,
        });
      }
    }
    
    // Search insights
    for (const insight of this.memory.insights) {
      if (insight.insight.toLowerCase().includes(queryLower)) {
        results.push({
          type: 'insight',
          item: insight,
          relevance: 0.7,
        });
      }
    }
    
    // Search timeline
    for (const event of this.memory.timeline) {
      if (
        event.title.toLowerCase().includes(queryLower) ||
        event.description.toLowerCase().includes(queryLower)
      ) {
        results.push({
          type: 'timeline',
          item: event,
          relevance: 0.6,
        });
      }
    }
    
    // Search knowledge graph
    for (const node of this.memory.knowledgeGraph.nodes) {
      if (
        node.name.toLowerCase().includes(queryLower) ||
        node.description.toLowerCase().includes(queryLower)
      ) {
        results.push({
          type: 'knowledge',
          item: node,
          relevance: 0.75,
        });
      }
    }
    
    // Sort by relevance and limit
    return results.sort((a, b) => b.relevance - a.relevance).slice(0, limit);
  }

  // ============================================================================
  // EXPORT / IMPORT
  // ============================================================================

  /**
   * Export memory for backup or transfer
   */
  export(): string {
    return JSON.stringify(this.memory, null, 2);
  }

  /**
   * Import memory from backup
   */
  import(json: string): void {
    try {
      const imported = JSON.parse(json) as EnhancedMemory;
      this.memory = this.migrate(imported);
      this.dirty = true;
      this.save();
    } catch (error) {
      throw new Error(`Failed to import memory: ${error}`);
    }
  }

  /**
   * Get memory statistics
   */
  getStats(): {
    timelineEvents: number;
    conversations: number;
    codeChanges: number;
    insights: number;
    rulesTracked: number;
    sessions: number;
    knowledgeNodes: number;
    knowledgeEdges: number;
    memorySize: string;
  } {
    const json = JSON.stringify(this.memory);
    const sizeBytes = Buffer.byteLength(json, 'utf-8');
    const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(2);
    
    return {
      timelineEvents: this.memory.timeline.length,
      conversations: this.memory.conversations.length,
      codeChanges: this.memory.codeHistory.length,
      insights: this.memory.insights.length,
      rulesTracked: Object.keys(this.memory.ruleMemory.rules).length,
      sessions: this.memory.sessionHistory.length,
      knowledgeNodes: this.memory.knowledgeGraph.nodes.length,
      knowledgeEdges: this.memory.knowledgeGraph.edges.length,
      memorySize: `${sizeMB} MB`,
    };
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  private generateId(): string {
    return crypto.randomBytes(8).toString('hex');
  }

  private generateProjectId(): string {
    const projectName = path.basename(this.projectPath);
    const hash = crypto.createHash('md5').update(this.projectPath).digest('hex').substring(0, 8);
    return `${projectName}-${hash}`;
  }
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create or load enhanced memory for a project
 */
export function loadEnhancedMemory(projectPath: string): EnhancedMemorySystem {
  return new EnhancedMemorySystem(projectPath);
}

/**
 * Check if enhanced memory exists
 */
export function hasEnhancedMemory(projectPath: string): boolean {
  const memoryPath = path.join(projectPath, VIBECHECK_DIR, MEMORY_FILE);
  return fs.existsSync(memoryPath);
}
