/**
 * DocGuard Engine
 * 
 * Central orchestrator for documentation quality enforcement.
 * Intercepts .md file writes and validates against:
 * - Duplicate detection (merge-not-create default)
 * - DocSpec quality rules (anchors, examples, no fluff)
 * - Registry management (canonical doc system)
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import type {
  DocGuardResult,
  DocGuardVerdict,
  DocGuardConfig,
  DocGuardRequest,
  MergePatch,
  DocSpecResult,
  DuplicateCheckResult,
} from './types.js';
import { DocRegistryManager } from './doc-registry.js';
import { SimilarityDetector } from './similarity-detector.js';
import { DocSpecValidator } from './docspec-validator.js';
import { extractAnchors } from './anchor-extractor.js';
import { getLogger, type Logger } from '../utils/logger.js';

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: DocGuardConfig = {
  enabled: true,
  registryPath: 'docs/.vibecheck-docs/registry.json',
  similarityThreshold: 0.8,
  minAnchors: 2,
  maxFluffRatio: 0.4,
  docDirectories: ['docs', 'README.md'],
  ignorePatterns: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
  enableSemanticSimilarity: false,
  strictMode: false,
  autoGenerateMergePatch: true,
};

// ============================================================================
// DocGuard Engine
// ============================================================================

export interface DocGuardEngineOptions {
  projectRoot: string;
  config?: Partial<DocGuardConfig>;
}

export class DocGuardEngine {
  private projectRoot: string;
  private config: DocGuardConfig;
  private registry: DocRegistryManager;
  private similarityDetector: SimilarityDetector;
  private docSpecValidator: DocSpecValidator;
  private logger: Logger;
  private initialized = false;

  constructor(options: DocGuardEngineOptions) {
    this.projectRoot = options.projectRoot;
    this.config = { ...DEFAULT_CONFIG, ...options.config };
    this.logger = getLogger('docguard');

    this.registry = new DocRegistryManager({
      projectRoot: this.projectRoot,
      config: this.config,
    });

    this.similarityDetector = new SimilarityDetector({
      config: this.config,
      registry: this.registry,
    });

    this.docSpecValidator = new DocSpecValidator({
      config: this.config,
    });
  }

  /**
   * Initialize DocGuard (load registry)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    await this.registry.load();
    this.initialized = true;
    this.logger.info('DocGuard initialized', {
      registryPath: this.config.registryPath,
      strictMode: this.config.strictMode,
    });
  }

  /**
   * Main evaluation method - called on .md file write attempts
   */
  async evaluate(request: DocGuardRequest): Promise<DocGuardResult> {
    await this.initialize();

    const relativePath = this.getRelativePath(request.path);
    this.logger.debug('Evaluating doc', { path: relativePath, action: request.action });

    // Skip if not a markdown file
    if (!request.path.endsWith('.md')) {
      return this.createAllowResult('Not a markdown file');
    }

    // Skip ignored paths
    if (this.isIgnoredPath(relativePath)) {
      return this.createAllowResult('Path is in ignore list');
    }

    // Run all checks
    const [docSpecResult, duplicateResult] = await Promise.all([
      this.runDocSpecCheck(request.content, request.gitContext?.changedFiles),
      request.action === 'create' 
        ? this.runDuplicateCheck(relativePath, request.content)
        : Promise.resolve(null),
    ]);

    // Determine verdict
    const verdict = this.determineVerdict(docSpecResult, duplicateResult);

    // Build recommended actions
    const recommendedActions = this.buildRecommendedActions(
      docSpecResult,
      duplicateResult,
      relativePath
    );

    // Generate merge patch if blocked and auto-generate is enabled
    let mergePatch: MergePatch | undefined;
    if (
      verdict === 'BLOCK' &&
      duplicateResult?.canonicalTarget &&
      this.config.autoGenerateMergePatch
    ) {
      mergePatch = await this.generateMergePatch(
        request.content,
        duplicateResult.canonicalTarget,
        relativePath
      );
    }

    // Build receipts footer
    const receiptsFooter = this.buildReceiptsFooter(request, docSpecResult);

    // Build reason
    const reason = this.buildReason(docSpecResult, duplicateResult, verdict);

    const result: DocGuardResult = {
      verdict,
      reason,
      docSpec: docSpecResult,
      duplicateCheck: duplicateResult ?? undefined,
      mergePatch,
      recommendedActions,
      receiptsFooter,
    };

    // Log result
    this.logger.info(`DocGuard ${verdict}`, {
      path: relativePath,
      violations: docSpecResult.violations.length,
      isDuplicate: duplicateResult?.isDuplicate ?? false,
    });

    return result;
  }

  /**
   * Quick check without full evaluation
   */
  async quickCheck(content: string): Promise<{ safe: boolean; concerns: string[] }> {
    const slopCheck = this.docSpecValidator.quickSlopCheck(content);
    
    return {
      safe: !slopCheck.isSlop,
      concerns: slopCheck.reasons,
    };
  }

  /**
   * Scan and update the doc registry
   */
  async scanRegistry(): Promise<{ added: number; updated: number; removed: number }> {
    await this.initialize();
    return this.registry.scan();
  }

  /**
   * Get registry statistics
   */
  async getRegistryStats(): Promise<{
    totalDocs: number;
    byType: Record<string, number>;
    avgAnchors: number;
    lastScan: string;
  }> {
    await this.initialize();
    return this.registry.getStats();
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private getRelativePath(filePath: string): string {
    if (path.isAbsolute(filePath)) {
      return path.relative(this.projectRoot, filePath);
    }
    return filePath;
  }

  private isIgnoredPath(relativePath: string): boolean {
    for (const pattern of this.config.ignorePatterns) {
      // Simple glob matching
      const regex = new RegExp(
        '^' + pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*') + '$'
      );
      if (regex.test(relativePath)) {
        return true;
      }
    }
    return false;
  }

  private async runDocSpecCheck(
    content: string,
    changedFiles?: string[]
  ): Promise<DocSpecResult> {
    return this.docSpecValidator.validate(content, changedFiles);
  }

  private async runDuplicateCheck(
    targetPath: string,
    content: string
  ): Promise<DuplicateCheckResult | null> {
    try {
      return await this.similarityDetector.checkDuplicates(targetPath, content);
    } catch (error) {
      this.logger.warn('Duplicate check failed', { error });
      return null;
    }
  }

  private determineVerdict(
    docSpecResult: DocSpecResult,
    duplicateResult: DuplicateCheckResult | null
  ): DocGuardVerdict {
    // BLOCK if duplicate detected (merge-not-create default)
    if (duplicateResult?.isDuplicate) {
      return 'BLOCK';
    }

    // BLOCK if DocSpec has errors in strict mode
    if (this.config.strictMode && !docSpecResult.valid) {
      return 'BLOCK';
    }

    // WARN if DocSpec has errors (non-strict) or warnings
    if (!docSpecResult.valid || docSpecResult.violations.length > 0) {
      return 'WARN';
    }

    return 'ALLOW';
  }

  private buildReason(
    docSpecResult: DocSpecResult,
    duplicateResult: DuplicateCheckResult | null,
    verdict: DocGuardVerdict
  ): string {
    const parts: string[] = [];

    if (duplicateResult?.isDuplicate && duplicateResult.matches.length > 0) {
      const match = duplicateResult.matches[0];
      parts.push(
        `Duplicate detected: ${Math.round(match.similarity * 100)}% similar to ${match.path}`
      );
    }

    if (!docSpecResult.valid) {
      const errors = docSpecResult.violations.filter(v => v.severity === 'error');
      if (errors.length > 0) {
        parts.push(`DocSpec failed: ${errors.map(e => e.message).join('; ')}`);
      }
    }

    if (parts.length === 0) {
      return verdict === 'ALLOW' 
        ? 'Document passes all checks'
        : 'Document has warnings';
    }

    return parts.join('. ');
  }

  private buildRecommendedActions(
    docSpecResult: DocSpecResult,
    duplicateResult: DuplicateCheckResult | null,
    targetPath: string
  ): DocGuardResult['recommendedActions'] {
    const actions: DocGuardResult['recommendedActions'] = [];

    // Duplicate-related actions
    if (duplicateResult?.isDuplicate && duplicateResult.canonicalTarget) {
      const action = duplicateResult.mergeAction;
      
      if (action === 'merge') {
        actions.push({
          action: `Merge content into ${duplicateResult.canonicalTarget}`,
          priority: 'high',
        });
        actions.push({
          action: `Delete duplicate file: ${targetPath}`,
          priority: 'high',
        });
      } else if (action === 'update') {
        actions.push({
          action: `Update existing doc: ${duplicateResult.canonicalTarget}`,
          priority: 'high',
        });
      } else if (action === 'link') {
        actions.push({
          action: `Add link to existing doc: ${duplicateResult.canonicalTarget}`,
          priority: 'medium',
        });
      }
    }

    // DocSpec-related actions
    for (const violation of docSpecResult.violations) {
      if (violation.suggestion) {
        actions.push({
          action: violation.suggestion,
          priority: violation.severity === 'error' ? 'high' : 'medium',
        });
      }
    }

    // Add anchors suggestion if low count
    if (docSpecResult.metrics.anchorCount < this.config.minAnchors) {
      const anchorsNeeded = this.config.minAnchors - docSpecResult.metrics.anchorCount;
      actions.push({
        action: `Add ${anchorsNeeded} more anchor(s): file paths, commands, or API endpoints`,
        priority: 'high',
      });
    }

    return actions;
  }

  private async generateMergePatch(
    newContent: string,
    canonicalPath: string,
    newPath: string
  ): Promise<MergePatch> {
    // Try to read the canonical doc
    let existingContent = '';
    try {
      const fullPath = path.join(this.projectRoot, canonicalPath);
      existingContent = await fs.readFile(fullPath, 'utf-8');
    } catch {
      // Canonical doc doesn't exist, can't merge
      return {
        operation: 'append',
        targetPath: canonicalPath,
        content: newContent,
      };
    }

    // Extract new anchors from new content
    const newAnchors = extractAnchors(newContent);
    const existingAnchors = extractAnchors(existingContent);
    
    // Find anchors that are new
    const newAnchorValues = newAnchors
      .map(a => a.value)
      .filter(v => !existingAnchors.some(e => e.value === v));

    // Find the main new content (skip duplicate headers)
    const newLines = newContent.split('\n');
    const existingLines = existingContent.split('\n');
    
    // Find first non-duplicate section
    let contentToAdd = '';
    let inNewSection = false;
    
    for (const line of newLines) {
      if (line.startsWith('#')) {
        // Check if this heading exists in canonical
        const headingText = line.replace(/^#+\s*/, '').toLowerCase();
        const existsInCanonical = existingLines.some(l => 
          l.replace(/^#+\s*/, '').toLowerCase() === headingText
        );
        inNewSection = !existsInCanonical;
      }
      
      if (inNewSection) {
        contentToAdd += line + '\n';
      }
    }

    // Determine best operation
    if (contentToAdd.trim()) {
      return {
        operation: 'add-section',
        targetPath: canonicalPath,
        content: contentToAdd.trim(),
        anchorsToAdd: newAnchorValues,
      };
    }

    // Fall back to append
    return {
      operation: 'append',
      targetPath: canonicalPath,
      content: `\n\n<!-- Merged from ${newPath} -->\n${newContent}`,
      anchorsToAdd: newAnchorValues,
    };
  }

  private buildReceiptsFooter(
    request: DocGuardRequest,
    docSpecResult: DocSpecResult
  ): DocGuardResult['receiptsFooter'] {
    return {
      commit: request.gitContext?.commit,
      touchedFiles: docSpecResult.anchors
        .filter(a => a.type === 'file')
        .map(a => a.value),
      owner: undefined, // Can be extracted from git blame if needed
    };
  }

  private createAllowResult(reason: string): DocGuardResult {
    return {
      verdict: 'ALLOW',
      reason,
      recommendedActions: [],
    };
  }

  // ============================================================================
  // Public Utilities
  // ============================================================================

  /**
   * Get the canonical doc for a given topic
   */
  async findCanonicalDoc(topic: string): Promise<string | undefined> {
    await this.initialize();
    
    const allDocs = this.registry.getAllDocs();
    
    // Search by title or tags
    const matches = allDocs.filter(doc => 
      doc.title?.toLowerCase().includes(topic.toLowerCase()) ||
      doc.tags.some(t => t.includes(topic.toLowerCase()))
    );

    return matches[0]?.canonicalPath;
  }

  /**
   * Suggest where new content should go
   */
  async suggestLocation(content: string): Promise<{
    existingDoc: string | undefined;
    suggestedPath: string | undefined;
    reason: string;
  }> {
    await this.initialize();

    const anchors = extractAnchors(content);
    
    // Check if content references existing files
    const fileAnchors = anchors.filter(a => a.type === 'file');
    
    for (const anchor of fileAnchors) {
      const docs = this.registry.findDocsByAnchor(anchor.value);
      if (docs.length > 0) {
        return {
          existingDoc: docs[0].canonicalPath,
          suggestedPath: undefined,
          reason: `Content references ${anchor.value}, which is documented in ${docs[0].canonicalPath}`,
        };
      }
    }

    // No existing doc found, suggest based on content
    const hasApiRefs = anchors.some(a => a.type === 'api');
    const hasCommands = anchors.some(a => a.type === 'command');

    if (hasApiRefs) {
      return {
        existingDoc: undefined,
        suggestedPath: 'docs/api/README.md',
        reason: 'Content contains API references',
      };
    }

    if (hasCommands) {
      return {
        existingDoc: undefined,
        suggestedPath: 'docs/guides/README.md',
        reason: 'Content contains CLI commands',
      };
    }

    return {
      existingDoc: undefined,
      suggestedPath: 'docs/README.md',
      reason: 'General documentation',
    };
  }

  /**
   * Get configuration
   */
  getConfig(): DocGuardConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<DocGuardConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createDocGuard(options: DocGuardEngineOptions): DocGuardEngine {
  return new DocGuardEngine(options);
}
