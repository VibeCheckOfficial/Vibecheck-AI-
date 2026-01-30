/**
 * Project Learner
 *
 * The core learning system that enables VibeCheck to learn YOUR codebase.
 * Records patterns, feedback, and adapts to project-specific conventions.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';
import { createHash } from 'crypto';
import type { FindingSeverity, FindingType, Finding } from '@repo/shared-types';
import type { ClaimType } from '../firewall/claim-extractor.js';
import { getLogger, type Logger } from '../utils/logger.js';
import { Cache } from '../utils/cache.js';
import type {
  CustomPattern,
  FeedbackType,
  FileType,
  FindingFeedback,
  IntelligenceConfig,
  LearningEvent,
  NamingConvention,
  ProjectNamingConventions,
  ProjectProfile,
  ProjectStats,
  SuppressionPattern,
  DEFAULT_INTELLIGENCE_CONFIG,
} from './types.js';

const DEFAULT_CONFIG: IntelligenceConfig = {
  dataPath: '.vibecheck/intelligence',
  autoLearn: true,
  minFeedbackForPattern: 3,
  enablePredictions: true,
  enableSemanticAnalysis: true,
  contextCacheTtlMs: 5 * 60 * 1000,
  autoSaveIntervalMs: 60 * 1000,
};

interface StoredProfile {
  profile: ProjectProfile;
  feedbackHistory: FindingFeedback[];
  learningEvents: LearningEvent[];
  version: number;
}

/**
 * Project Learner - Learns and adapts to your codebase
 */
export class ProjectLearner {
  private config: IntelligenceConfig;
  private projectRoot: string;
  private profile: ProjectProfile | null = null;
  private feedbackHistory: FindingFeedback[] = [];
  private learningEvents: LearningEvent[] = [];
  private logger: Logger;
  private dirty = false;
  private autoSaveTimer: ReturnType<typeof setInterval> | null = null;

  constructor(projectRoot: string, config: Partial<IntelligenceConfig> = {}) {
    this.projectRoot = projectRoot;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = getLogger('project-learner');
  }

  /**
   * Initialize the learner - loads existing profile or creates new one
   */
  async initialize(): Promise<void> {
    await this.load();

    if (!this.profile) {
      this.profile = await this.createInitialProfile();
      this.dirty = true;
    }

    this.startAutoSave();
    this.logger.debug('Project learner initialized', { projectId: this.profile.id });
  }

  /**
   * Get the current project profile
   */
  getProfile(): ProjectProfile | null {
    return this.profile;
  }

  /**
   * Record feedback for a finding
   */
  async recordFeedback(
    finding: {
      id: string;
      type: FindingType | string;
      file: string | null;
      severity: FindingSeverity;
    },
    feedback: FeedbackType,
    options?: {
      notes?: string;
      providedBy?: string;
      suppressFuture?: boolean;
    }
  ): Promise<void> {
    if (!this.profile) {
      throw new Error('Profile not initialized');
    }

    // Record the feedback
    const feedbackEntry: FindingFeedback = {
      id: `fb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      findingId: finding.id,
      findingType: finding.type,
      feedback,
      filePath: finding.file ?? '',
      notes: options?.notes,
      providedBy: options?.providedBy,
      timestamp: new Date(),
    };

    this.feedbackHistory.push(feedbackEntry);

    // Update statistics
    this.updateStats(finding, feedback);

    // Learn from feedback if enabled
    if (this.config.autoLearn) {
      await this.learnFromFeedback(feedbackEntry, finding);
    }

    // Create suppression pattern if requested
    if (options?.suppressFuture && feedback === 'false_positive') {
      await this.addSuppressionPattern(finding);
    }

    this.dirty = true;

    this.logger.debug('Feedback recorded', {
      findingId: finding.id,
      feedback,
      suppressFuture: options?.suppressFuture,
    });
  }

  /**
   * Check if a finding should be suppressed
   */
  shouldSuppress(finding: {
    type: FindingType | string;
    file: string | null;
    message?: string;
  }): { suppressed: boolean; reason?: string; pattern?: SuppressionPattern } {
    if (!this.profile) return { suppressed: false };

    for (const pattern of this.profile.suppressedPatterns) {
      // Check expiration
      if (pattern.expiresAt && new Date() > pattern.expiresAt) {
        continue;
      }

      // Check finding type match
      if (pattern.findingType && pattern.findingType !== finding.type) {
        continue;
      }

      // Check pattern match
      let matches = false;

      switch (pattern.patternType) {
        case 'exact':
          matches = finding.file === pattern.pattern || finding.message === pattern.pattern;
          break;
        case 'regex':
          try {
            const regex = new RegExp(pattern.pattern);
            matches = (finding.file && regex.test(finding.file)) ||
                      (finding.message && regex.test(finding.message)) ||
                      false;
          } catch {
            // Invalid regex, skip
          }
          break;
        case 'glob':
          if (finding.file) {
            matches = this.matchGlob(finding.file, pattern.pattern);
          }
          break;
      }

      if (matches) {
        return {
          suppressed: true,
          reason: pattern.reason ?? 'Matches suppression pattern',
          pattern,
        };
      }
    }

    return { suppressed: false };
  }

  /**
   * Add a suppression pattern
   */
  async addSuppressionPattern(
    finding: {
      type: FindingType | string;
      file: string | null;
    },
    options?: {
      patternType?: 'exact' | 'regex' | 'glob';
      pattern?: string;
      reason?: string;
      expiresAt?: Date;
    }
  ): Promise<SuppressionPattern> {
    if (!this.profile) {
      throw new Error('Profile not initialized');
    }

    // Determine pattern
    let pattern = options?.pattern;
    let patternType = options?.patternType ?? 'exact';

    if (!pattern && finding.file) {
      // Auto-generate pattern based on file path
      const ext = path.extname(finding.file);
      const dir = path.dirname(finding.file);

      // If it's in a specific directory, create a glob pattern
      if (dir.includes('test') || dir.includes('__tests__') || dir.includes('spec')) {
        pattern = `**/${path.basename(dir)}/**/*${ext}`;
        patternType = 'glob';
      } else {
        pattern = finding.file;
        patternType = 'exact';
      }
    }

    const suppression: SuppressionPattern = {
      id: `sup-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      pattern: pattern ?? finding.type,
      patternType,
      findingType: finding.type,
      reason: options?.reason,
      expiresAt: options?.expiresAt,
      suppressedAt: new Date(),
    };

    this.profile.suppressedPatterns.push(suppression);
    this.dirty = true;

    this.logger.debug('Suppression pattern added', { pattern: suppression.pattern });

    return suppression;
  }

  /**
   * Remove a suppression pattern
   */
  removeSuppressionPattern(patternId: string): boolean {
    if (!this.profile) return false;

    const index = this.profile.suppressedPatterns.findIndex((p) => p.id === patternId);
    if (index >= 0) {
      this.profile.suppressedPatterns.splice(index, 1);
      this.dirty = true;
      return true;
    }
    return false;
  }

  /**
   * Adjust confidence based on project history
   */
  adjustConfidence(
    finding: { type: FindingType | string; severity: FindingSeverity },
    baseConfidence: number
  ): { adjusted: number; reason?: string } {
    if (!this.profile) return { adjusted: baseConfidence };

    const categoryStats = this.profile.stats.byCategory[finding.type];
    if (!categoryStats) return { adjusted: baseConfidence };

    const total = categoryStats.truePositives + categoryStats.falsePositives;
    if (total < this.config.minFeedbackForPattern) {
      return { adjusted: baseConfidence };
    }

    // Calculate historical accuracy for this category
    const accuracy = categoryStats.truePositives / total;

    // Adjust confidence based on historical accuracy
    const adjusted = baseConfidence * accuracy;

    const reason = accuracy < 0.5
      ? `Historically low accuracy (${Math.round(accuracy * 100)}%) for ${finding.type}`
      : undefined;

    return { adjusted, reason };
  }

  /**
   * Get learned naming conventions
   */
  getNamingConventions(): ProjectNamingConventions | null {
    return this.profile?.namingConventions ?? null;
  }

  /**
   * Get statistics summary
   */
  getStatsSummary(): {
    totalFeedback: number;
    accuracy: number;
    topFalsePositives: Array<{ type: string; count: number }>;
    suppressionCount: number;
  } | null {
    if (!this.profile) return null;

    const { stats, suppressedPatterns } = this.profile;
    const totalFeedback = stats.confirmedTrue + stats.confirmedFalse;
    const accuracy = totalFeedback > 0 ? stats.confirmedTrue / totalFeedback : 0;

    const topFalsePositives = Object.entries(stats.byCategory)
      .map(([type, data]) => ({ type, count: data.falsePositives }))
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      totalFeedback,
      accuracy,
      topFalsePositives,
      suppressionCount: suppressedPatterns.length,
    };
  }

  /**
   * Learn project naming conventions from codebase
   */
  async learnNamingConventions(): Promise<ProjectNamingConventions> {
    const conventions: ProjectNamingConventions = {
      components: null,
      hooks: null,
      utilities: null,
      services: null,
      types: null,
      constants: null,
      tests: null,
    };

    const files = await glob('**/*.{ts,tsx,js,jsx}', {
      cwd: this.projectRoot,
      ignore: ['node_modules/**', 'dist/**', 'build/**'],
    });

    // Categorize files and learn patterns
    const categorized: Record<string, string[]> = {
      components: [],
      hooks: [],
      utilities: [],
      services: [],
      types: [],
      constants: [],
      tests: [],
    };

    for (const file of files) {
      const basename = path.basename(file, path.extname(file));
      const dir = path.dirname(file);

      // Components (PascalCase, in components/pages directory)
      if (
        /^[A-Z][a-zA-Z0-9]*$/.test(basename) &&
        (dir.includes('component') || dir.includes('page') || file.endsWith('.tsx'))
      ) {
        categorized.components.push(basename);
      }

      // Hooks (use* prefix)
      if (/^use[A-Z]/.test(basename)) {
        categorized.hooks.push(basename);
      }

      // Utilities (camelCase in utils/helpers)
      if (
        /^[a-z][a-zA-Z0-9]*$/.test(basename) &&
        (dir.includes('util') || dir.includes('helper') || dir.includes('lib'))
      ) {
        categorized.utilities.push(basename);
      }

      // Services
      if (
        basename.endsWith('Service') ||
        basename.endsWith('service') ||
        dir.includes('service')
      ) {
        categorized.services.push(basename);
      }

      // Types
      if (
        file.endsWith('.d.ts') ||
        dir.includes('type') ||
        basename.endsWith('Types') ||
        basename.endsWith('.types')
      ) {
        categorized.types.push(basename);
      }

      // Constants
      if (
        /^[A-Z_]+$/.test(basename) ||
        basename.endsWith('Constants') ||
        dir.includes('constant')
      ) {
        categorized.constants.push(basename);
      }

      // Tests
      if (
        basename.endsWith('.test') ||
        basename.endsWith('.spec') ||
        dir.includes('__tests__')
      ) {
        categorized.tests.push(basename);
      }
    }

    // Derive patterns from categorized files
    if (categorized.components.length >= 3) {
      conventions.components = this.derivePattern(categorized.components, 'Components');
    }

    if (categorized.hooks.length >= 3) {
      conventions.hooks = this.derivePattern(categorized.hooks, 'Hooks');
    }

    if (categorized.utilities.length >= 3) {
      conventions.utilities = this.derivePattern(categorized.utilities, 'Utilities');
    }

    if (categorized.services.length >= 3) {
      conventions.services = this.derivePattern(categorized.services, 'Services');
    }

    if (categorized.types.length >= 3) {
      conventions.types = this.derivePattern(categorized.types, 'Types');
    }

    if (categorized.tests.length >= 3) {
      conventions.tests = this.derivePattern(categorized.tests, 'Tests');
    }

    if (this.profile) {
      this.profile.namingConventions = conventions;
      this.dirty = true;
    }

    return conventions;
  }

  /**
   * Save profile to disk
   */
  async save(): Promise<void> {
    if (!this.dirty || !this.profile) return;

    const filePath = path.join(this.projectRoot, this.config.dataPath, 'profile.json');
    const dir = path.dirname(filePath);

    try {
      await fs.mkdir(dir, { recursive: true });

      const data: StoredProfile = {
        profile: this.profile,
        feedbackHistory: this.feedbackHistory.slice(-1000), // Keep last 1000
        learningEvents: this.learningEvents.slice(-500), // Keep last 500
        version: 1,
      };

      await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
      this.dirty = false;

      this.logger.debug('Profile saved');
    } catch (error) {
      this.logger.warn('Failed to save profile', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
    }
  }

  /**
   * Load profile from disk
   */
  async load(): Promise<void> {
    const filePath = path.join(this.projectRoot, this.config.dataPath, 'profile.json');

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content) as StoredProfile;

      this.profile = {
        ...data.profile,
        createdAt: new Date(data.profile.createdAt),
        updatedAt: new Date(data.profile.updatedAt),
        lastScannedAt: data.profile.lastScannedAt
          ? new Date(data.profile.lastScannedAt)
          : null,
        suppressedPatterns: data.profile.suppressedPatterns.map((p) => ({
          ...p,
          suppressedAt: new Date(p.suppressedAt),
          expiresAt: p.expiresAt ? new Date(p.expiresAt) : undefined,
        })),
        customPatterns: data.profile.customPatterns.map((p) => ({
          ...p,
          pattern: new RegExp(p.pattern.source ?? p.pattern),
          createdAt: new Date(p.createdAt),
          lastMatched: p.lastMatched ? new Date(p.lastMatched) : undefined,
        })),
      };

      this.feedbackHistory = data.feedbackHistory.map((f) => ({
        ...f,
        timestamp: new Date(f.timestamp),
      }));

      this.learningEvents = data.learningEvents.map((e) => ({
        ...e,
        timestamp: new Date(e.timestamp),
      }));

      this.logger.debug('Profile loaded', { projectId: this.profile.id });
    } catch {
      // File doesn't exist or is invalid
      this.profile = null;
    }
  }

  /**
   * Dispose resources
   */
  async dispose(): Promise<void> {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }

    await this.save();
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async createInitialProfile(): Promise<ProjectProfile> {
    const id = this.generateProjectId();

    // Detect project characteristics
    const frameworks = await this.detectFrameworks();
    const language = await this.detectLanguage();
    const packageManager = await this.detectPackageManager();
    const { srcDir, testDir, configFiles } = await this.detectProjectStructure();

    const profile: ProjectProfile = {
      id,
      projectRoot: this.projectRoot,
      name: path.basename(this.projectRoot),
      version: 1,
      namingConventions: {
        components: null,
        hooks: null,
        utilities: null,
        services: null,
        types: null,
        constants: null,
        tests: null,
      },
      suppressedPatterns: [],
      customPatterns: [],
      stats: {
        totalFindings: 0,
        confirmedTrue: 0,
        confirmedFalse: 0,
        byCategory: {},
        byFileType: {} as Record<FileType, { truePositives: number; falsePositives: number }>,
        bySeverity: {
          error: { truePositives: 0, falsePositives: 0 },
          warning: { truePositives: 0, falsePositives: 0 },
          info: { truePositives: 0, falsePositives: 0 },
        },
      },
      frameworks,
      language,
      packageManager,
      srcDir,
      testDir,
      configFiles,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastScannedAt: null,
    };

    // Learn initial naming conventions
    await this.learnNamingConventions();

    return profile;
  }

  private generateProjectId(): string {
    const hash = createHash('sha256')
      .update(this.projectRoot)
      .update(Date.now().toString())
      .digest('hex')
      .slice(0, 12);
    return `proj-${hash}`;
  }

  private async detectFrameworks(): Promise<string[]> {
    const frameworks: string[] = [];

    try {
      const pkgPath = path.join(this.projectRoot, 'package.json');
      const content = await fs.readFile(pkgPath, 'utf-8');
      const pkg = JSON.parse(content);
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };

      if (deps.next) frameworks.push('next');
      if (deps.react) frameworks.push('react');
      if (deps.vue) frameworks.push('vue');
      if (deps.svelte) frameworks.push('svelte');
      if (deps.express) frameworks.push('express');
      if (deps.fastify) frameworks.push('fastify');
      if (deps.hono) frameworks.push('hono');
      if (deps.nestjs || deps['@nestjs/core']) frameworks.push('nestjs');
      if (deps.electron) frameworks.push('electron');
      if (deps.tauri || deps['@tauri-apps/api']) frameworks.push('tauri');
    } catch {
      // No package.json or invalid
    }

    return frameworks;
  }

  private async detectLanguage(): Promise<'typescript' | 'javascript' | 'mixed'> {
    const hasTs = await this.fileExists(path.join(this.projectRoot, 'tsconfig.json'));
    const tsFiles = await glob('**/*.ts', { cwd: this.projectRoot, ignore: ['node_modules/**'] });
    const jsFiles = await glob('**/*.js', { cwd: this.projectRoot, ignore: ['node_modules/**'] });

    if (hasTs || tsFiles.length > jsFiles.length) {
      return jsFiles.length > 10 ? 'mixed' : 'typescript';
    }

    return tsFiles.length > 10 ? 'mixed' : 'javascript';
  }

  private async detectPackageManager(): Promise<'npm' | 'yarn' | 'pnpm' | 'bun' | 'unknown'> {
    if (await this.fileExists(path.join(this.projectRoot, 'pnpm-lock.yaml'))) return 'pnpm';
    if (await this.fileExists(path.join(this.projectRoot, 'yarn.lock'))) return 'yarn';
    if (await this.fileExists(path.join(this.projectRoot, 'bun.lockb'))) return 'bun';
    if (await this.fileExists(path.join(this.projectRoot, 'package-lock.json'))) return 'npm';
    return 'unknown';
  }

  private async detectProjectStructure(): Promise<{
    srcDir: string | null;
    testDir: string | null;
    configFiles: string[];
  }> {
    let srcDir: string | null = null;
    let testDir: string | null = null;

    if (await this.fileExists(path.join(this.projectRoot, 'src'))) {
      srcDir = 'src';
    } else if (await this.fileExists(path.join(this.projectRoot, 'app'))) {
      srcDir = 'app';
    } else if (await this.fileExists(path.join(this.projectRoot, 'lib'))) {
      srcDir = 'lib';
    }

    if (await this.fileExists(path.join(this.projectRoot, 'tests'))) {
      testDir = 'tests';
    } else if (await this.fileExists(path.join(this.projectRoot, 'test'))) {
      testDir = 'test';
    } else if (await this.fileExists(path.join(this.projectRoot, '__tests__'))) {
      testDir = '__tests__';
    }

    const configFiles = await glob(
      '{*.config.{js,ts,mjs,cjs},.*rc,.*rc.{js,json,yaml,yml}}',
      { cwd: this.projectRoot }
    );

    return { srcDir, testDir, configFiles };
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private updateStats(
    finding: { type: FindingType | string; severity: FindingSeverity },
    feedback: FeedbackType
  ): void {
    if (!this.profile) return;

    const isPositive = feedback === 'true_positive' || feedback === 'false_negative';

    this.profile.stats.totalFindings++;

    if (isPositive) {
      this.profile.stats.confirmedTrue++;
    } else {
      this.profile.stats.confirmedFalse++;
    }

    // By category
    if (!this.profile.stats.byCategory[finding.type]) {
      this.profile.stats.byCategory[finding.type] = { truePositives: 0, falsePositives: 0 };
    }
    if (isPositive) {
      this.profile.stats.byCategory[finding.type].truePositives++;
    } else {
      this.profile.stats.byCategory[finding.type].falsePositives++;
    }

    // By severity
    if (isPositive) {
      this.profile.stats.bySeverity[finding.severity].truePositives++;
    } else {
      this.profile.stats.bySeverity[finding.severity].falsePositives++;
    }

    this.profile.updatedAt = new Date();
  }

  private async learnFromFeedback(
    feedback: FindingFeedback,
    finding: { type: FindingType | string; file: string | null }
  ): Promise<void> {
    // Check if we have enough false positives for this type to create a suppression
    const categoryStats = this.profile?.stats.byCategory[finding.type];

    if (
      categoryStats &&
      categoryStats.falsePositives >= this.config.minFeedbackForPattern &&
      categoryStats.falsePositives > categoryStats.truePositives
    ) {
      // This category has high false positive rate - log learning event
      this.learningEvents.push({
        type: 'feedback',
        data: {
          findingType: finding.type,
          falsePositiveRate:
            categoryStats.falsePositives /
            (categoryStats.truePositives + categoryStats.falsePositives),
        },
        timestamp: new Date(),
        source: 'automatic',
      });
    }
  }

  private derivePattern(examples: string[], category: string): NamingConvention | null {
    if (examples.length < 3) return null;

    // Try common patterns
    const patterns = [
      { pattern: /^[A-Z][a-zA-Z0-9]*$/, desc: 'PascalCase' },
      { pattern: /^[a-z][a-zA-Z0-9]*$/, desc: 'camelCase' },
      { pattern: /^use[A-Z][a-zA-Z0-9]*$/, desc: 'use* hook pattern' },
      { pattern: /^[a-z]+(-[a-z]+)*$/, desc: 'kebab-case' },
      { pattern: /^[A-Z][A-Z0-9_]*$/, desc: 'SCREAMING_SNAKE_CASE' },
      { pattern: /.*\.test$/, desc: '.test suffix' },
      { pattern: /.*\.spec$/, desc: '.spec suffix' },
      { pattern: /.*Service$/, desc: '*Service suffix' },
      { pattern: /.*Types?$/, desc: '*Type(s) suffix' },
    ];

    for (const { pattern, desc } of patterns) {
      const matches = examples.filter((e) => pattern.test(e));
      const matchRate = matches.length / examples.length;

      if (matchRate >= 0.7) {
        return {
          pattern,
          description: `${category}: ${desc}`,
          examples: matches.slice(0, 3),
          confidence: matchRate,
        };
      }
    }

    return null;
  }

  private matchGlob(filePath: string, pattern: string): boolean {
    // Simple glob matching (supports * and **)
    const regexPattern = pattern
      .replace(/\*\*/g, '{{DOUBLE_STAR}}')
      .replace(/\*/g, '[^/]*')
      .replace(/{{DOUBLE_STAR}}/g, '.*')
      .replace(/\//g, '\\/');

    try {
      return new RegExp(`^${regexPattern}$`).test(filePath);
    } catch {
      return false;
    }
  }

  private startAutoSave(): void {
    if (this.autoSaveTimer) return;

    this.autoSaveTimer = setInterval(() => {
      this.save().catch(() => {});
    }, this.config.autoSaveIntervalMs);

    if (this.autoSaveTimer.unref) {
      this.autoSaveTimer.unref();
    }
  }
}

// ============================================================================
// Singleton
// ============================================================================

let globalLearner: ProjectLearner | null = null;

export async function getProjectLearner(
  projectRoot: string,
  config?: Partial<IntelligenceConfig>
): Promise<ProjectLearner> {
  if (!globalLearner || globalLearner['projectRoot'] !== projectRoot) {
    globalLearner = new ProjectLearner(projectRoot, config);
    await globalLearner.initialize();
  }
  return globalLearner;
}

export async function resetProjectLearner(): Promise<void> {
  if (globalLearner) {
    await globalLearner.dispose();
    globalLearner = null;
  }
}
