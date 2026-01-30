/**
 * Phase 5: Intelligence System Types
 *
 * Type definitions for the project learning and context-aware analysis system.
 * This enables VibeCheck to "just know" your codebase patterns.
 */

import type { ClaimType } from '../firewall/claim-extractor.js';
import type { FindingSeverity, FindingType } from '@repo/shared-types';

// ============================================================================
// File Context Types
// ============================================================================

export type FileType =
  | 'component'      // React/Vue/Svelte component
  | 'hook'           // React hook
  | 'page'           // Page/route component
  | 'api'            // API route handler
  | 'middleware'     // Middleware
  | 'service'        // Service/business logic
  | 'repository'     // Data access layer
  | 'utility'        // Utility functions
  | 'config'         // Configuration file
  | 'test'           // Test file
  | 'type'           // Type definitions
  | 'constant'       // Constants
  | 'style'          // CSS/SCSS/styles
  | 'unknown';

export type FilePurpose =
  | 'authentication'
  | 'authorization'
  | 'data-fetching'
  | 'data-mutation'
  | 'state-management'
  | 'form-handling'
  | 'validation'
  | 'error-handling'
  | 'logging'
  | 'caching'
  | 'ui-rendering'
  | 'navigation'
  | 'integration'
  | 'unknown';

export type FileSensitivity = 'critical' | 'high' | 'medium' | 'low';

export interface FileContext {
  filePath: string;
  fileType: FileType;
  purpose: FilePurpose;
  sensitivity: FileSensitivity;
  dependencies: string[];
  exports: string[];
  imports: string[];
  hasTests: boolean;
  testCoverage?: number;
  complexity?: number;
  lastModified: Date;
  analyzedAt: Date;
}

// ============================================================================
// Project Profile Types
// ============================================================================

export interface NamingConvention {
  pattern: RegExp;
  description: string;
  examples: string[];
  confidence: number;
}

export interface ProjectNamingConventions {
  components: NamingConvention | null;
  hooks: NamingConvention | null;
  utilities: NamingConvention | null;
  services: NamingConvention | null;
  types: NamingConvention | null;
  constants: NamingConvention | null;
  tests: NamingConvention | null;
}

export interface SuppressionPattern {
  id: string;
  pattern: string;
  patternType: 'exact' | 'regex' | 'glob';
  context?: string;
  findingType?: FindingType | string;
  claimType?: ClaimType;
  suppressedAt: Date;
  suppressedBy?: string;
  reason?: string;
  expiresAt?: Date;
}

export interface CustomPattern {
  id: string;
  name: string;
  description: string;
  pattern: RegExp;
  severity: FindingSeverity;
  category: string;
  learnedFrom: string[];
  confidence: number;
  createdAt: Date;
  lastMatched?: Date;
  matchCount: number;
}

export interface ProjectStats {
  totalFindings: number;
  confirmedTrue: number;
  confirmedFalse: number;
  byCategory: Record<string, { truePositives: number; falsePositives: number }>;
  byFileType: Record<FileType, { truePositives: number; falsePositives: number }>;
  bySeverity: Record<FindingSeverity, { truePositives: number; falsePositives: number }>;
}

export interface ProjectProfile {
  id: string;
  projectRoot: string;
  name: string;
  version: number;

  // Learned naming conventions
  namingConventions: ProjectNamingConventions;

  // Learned suppression patterns
  suppressedPatterns: SuppressionPattern[];

  // Custom patterns learned from this project
  customPatterns: CustomPattern[];

  // Statistics for confidence calibration
  stats: ProjectStats;

  // Framework detection
  frameworks: string[];
  language: 'typescript' | 'javascript' | 'mixed';
  packageManager: 'npm' | 'yarn' | 'pnpm' | 'bun' | 'unknown';

  // Project structure
  srcDir: string | null;
  testDir: string | null;
  configFiles: string[];

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  lastScannedAt: Date | null;
}

// ============================================================================
// Learning Types
// ============================================================================

export type FeedbackType = 'true_positive' | 'false_positive' | 'true_negative' | 'false_negative';

export interface FindingFeedback {
  id: string;
  findingId: string;
  findingType: FindingType | string;
  feedback: FeedbackType;
  filePath: string;
  fileType?: FileType;
  pattern?: string;
  notes?: string;
  providedBy?: string;
  timestamp: Date;
}

export interface LearningEvent {
  type: 'suppression' | 'custom_pattern' | 'naming_convention' | 'feedback';
  data: unknown;
  timestamp: Date;
  source: 'user' | 'automatic';
}

// ============================================================================
// Predictive Types
// ============================================================================

export interface SessionContext {
  lastCommand?: string;
  lastCommandTime?: Date;
  lastScanResult?: {
    totalFindings: number;
    fixableCount: number;
    criticalCount: number;
  };
  openFiles: string[];
  recentFiles: string[];
  gitStatus?: {
    branch: string;
    staged: string[];
    modified: string[];
    hasUncommitted: boolean;
  };
  consecutiveFailures: number;
  lastCheckpointId?: string;
}

export interface Suggestion {
  id: string;
  command: string;
  description: string;
  reason: string;
  confidence: number;
  category: 'fix' | 'scan' | 'checkpoint' | 'config' | 'learn';
  priority: number;
  metadata?: Record<string, unknown>;
}

export interface PredictiveConfig {
  maxSuggestions: number;
  minConfidence: number;
  enableAutoSuggestions: boolean;
  contextWindowMinutes: number;
}

export const DEFAULT_PREDICTIVE_CONFIG: PredictiveConfig = {
  maxSuggestions: 5,
  minConfidence: 0.6,
  enableAutoSuggestions: true,
  contextWindowMinutes: 30,
};

// ============================================================================
// Semantic Analysis Types
// ============================================================================

export interface SemanticAnalysisResult {
  fileContext: FileContext;
  risks: Array<{
    type: string;
    description: string;
    severity: FileSensitivity;
    location?: { line: number; column: number };
  }>;
  suggestions: string[];
  relatedFiles: string[];
  confidenceScore: number;
}

export interface ProjectInsight {
  type: 'pattern' | 'anomaly' | 'improvement' | 'risk';
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'critical';
  affectedFiles: string[];
  suggestedAction?: string;
  confidence: number;
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface IntelligenceConfig {
  /** Path to store learned data */
  dataPath: string;

  /** Enable automatic learning from feedback */
  autoLearn: boolean;

  /** Minimum feedback count before learning a pattern */
  minFeedbackForPattern: number;

  /** Enable predictive suggestions */
  enablePredictions: boolean;

  /** Enable semantic file analysis */
  enableSemanticAnalysis: boolean;

  /** Cache TTL for file contexts */
  contextCacheTtlMs: number;

  /** Auto-save interval */
  autoSaveIntervalMs: number;
}

export const DEFAULT_INTELLIGENCE_CONFIG: IntelligenceConfig = {
  dataPath: '.vibecheck/intelligence',
  autoLearn: true,
  minFeedbackForPattern: 3,
  enablePredictions: true,
  enableSemanticAnalysis: true,
  contextCacheTtlMs: 5 * 60 * 1000, // 5 minutes
  autoSaveIntervalMs: 60 * 1000, // 1 minute
};
