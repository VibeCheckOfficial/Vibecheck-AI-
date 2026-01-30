/**
 * Review Pipeline
 * 
 * Manages the flow of fixes from proposal to application,
 * implementing the auto-apply vs suggest logic and providing
 * interfaces for human review.
 * 
 * Includes comprehensive validation, state management, and error handling.
 */

import type {
  ProposedFix,
  FixResult,
  FixAction,
  AutoFixPolicy,
  Patch,
  ApplyResult,
} from './types.js';
import { 
  normalizePolicy, 
  SAFETY_LIMITS,
  sanitizeFilePath 
} from './types.js';
import { PatchApplier } from './patch-applier.js';
import { PatchGenerator } from './patch-generator.js';

/**
 * Review status for a proposed fix
 */
export type ReviewStatus = 
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'applied'
  | 'failed'
  | 'skipped';

/**
 * All valid review statuses
 */
const REVIEW_STATUSES: readonly ReviewStatus[] = [
  'pending', 'approved', 'rejected', 'applied', 'failed', 'skipped'
] as const;

/**
 * Type guard for ReviewStatus
 */
function isReviewStatus(value: unknown): value is ReviewStatus {
  return typeof value === 'string' && REVIEW_STATUSES.includes(value as ReviewStatus);
}

/**
 * A fix in the review queue
 */
export interface ReviewItem {
  id: string;
  fix: ProposedFix;
  status: ReviewStatus;
  addedAt: Date;
  reviewedAt?: Date;
  reviewedBy?: string;
  comment?: string;
  applyResult?: ApplyResult;
  retryCount?: number;
}

/**
 * Summary of review pipeline state
 */
export interface ReviewSummary {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  applied: number;
  failed: number;
  skipped: number;
  oldestPendingAge?: number;
}

/**
 * Options for applying approved fixes
 */
export interface ApplyApprovedOptions {
  dryRun?: boolean;
  createBackup?: boolean;
  maxConcurrent?: number;
  maxRetries?: number;
  stopOnFirstFailure?: boolean;
}

/**
 * Output format for review
 */
export type OutputFormat = 'markdown' | 'json' | 'patch' | 'diff';

/**
 * Default options for applying
 */
const DEFAULT_APPLY_OPTIONS: Readonly<ApplyApprovedOptions> = Object.freeze({
  dryRun: false,
  createBackup: true,
  maxConcurrent: SAFETY_LIMITS.MAX_CONCURRENT_APPLIES,
  maxRetries: 2,
  stopOnFirstFailure: false,
});

/**
 * ReviewPipeline manages the review workflow for proposed fixes
 */
export class ReviewPipeline {
  private readonly queue: Map<string, ReviewItem> = new Map();
  private readonly policy: AutoFixPolicy;
  private readonly patchApplier: PatchApplier;
  private readonly patchGenerator: PatchGenerator;
  private readonly maxQueueSize: number;
  private isApplying = false;

  constructor(projectRoot: string, policy?: Partial<AutoFixPolicy>) {
    if (!projectRoot || typeof projectRoot !== 'string') {
      throw new Error('Project root is required');
    }
    
    this.policy = normalizePolicy(policy);
    this.patchApplier = new PatchApplier(projectRoot);
    this.patchGenerator = new PatchGenerator();
    this.maxQueueSize = SAFETY_LIMITS.MAX_HISTORY_ENTRIES;
  }

  /**
   * Check if pipeline is currently applying fixes
   */
  get applying(): boolean {
    return this.isApplying;
  }

  /**
   * Process a fix result and route fixes appropriately
   */
  async process(result: FixResult): Promise<{
    autoApplied: ProposedFix[];
    queued: ReviewItem[];
    rejected: ProposedFix[];
    errors: string[];
  }> {
    const autoApplied: ProposedFix[] = [];
    const queued: ReviewItem[] = [];
    const rejected: ProposedFix[] = [];
    const errors: string[] = [];

    // Input validation
    if (!result || typeof result !== 'object') {
      errors.push('Invalid fix result');
      return { autoApplied, queued, rejected, errors };
    }

    // Process fixes that were marked for auto-apply
    if (Array.isArray(result.appliedFixes)) {
      for (const fix of result.appliedFixes) {
        if (this.isValidFix(fix)) {
          autoApplied.push(fix);
        }
      }
    }

    // Queue fixes that need review
    if (Array.isArray(result.suggestedFixes)) {
      for (const fix of result.suggestedFixes) {
        if (!this.isValidFix(fix)) {
          errors.push(`Invalid suggested fix: ${fix?.id || 'unknown'}`);
          continue;
        }

        try {
          const item = this.addToQueue(fix);
          queued.push(item);
        } catch (error) {
          errors.push(`Failed to queue fix ${fix.id}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    // Track rejected fixes
    if (Array.isArray(result.rejectedFixes)) {
      for (const fix of result.rejectedFixes) {
        if (this.isValidFix(fix)) {
          rejected.push(fix);
        }
      }
    }

    return { autoApplied, queued, rejected, errors };
  }

  /**
   * Validate a proposed fix
   */
  private isValidFix(fix: unknown): fix is ProposedFix {
    if (!fix || typeof fix !== 'object') {
      return false;
    }

    const f = fix as Partial<ProposedFix>;
    
    return (
      typeof f.id === 'string' &&
      f.id.length > 0 &&
      f.issue !== undefined &&
      f.patch !== undefined &&
      typeof f.patch.filePath === 'string'
    );
  }

  /**
   * Add a fix to the review queue with validation
   */
  addToQueue(fix: ProposedFix): ReviewItem {
    if (!this.isValidFix(fix)) {
      throw new Error('Invalid fix: missing required fields');
    }

    // Check queue size limit
    if (this.queue.size >= this.maxQueueSize) {
      // Remove oldest pending item to make room
      const oldestPending = this.findOldestPending();
      if (oldestPending) {
        this.queue.delete(oldestPending.id);
      } else {
        throw new Error('Queue is full and has no pending items to remove');
      }
    }

    // Check for duplicate
    if (this.queue.has(fix.id)) {
      const existing = this.queue.get(fix.id)!;
      // Update if existing is still pending
      if (existing.status === 'pending') {
        existing.fix = fix;
        return existing;
      }
      // Otherwise, create a new ID
      fix = { ...fix, id: `${fix.id}-${Date.now()}` };
    }

    const item: ReviewItem = {
      id: fix.id,
      fix,
      status: 'pending',
      addedAt: new Date(),
      retryCount: 0,
    };

    this.queue.set(fix.id, item);
    return item;
  }

  /**
   * Find the oldest pending item
   */
  private findOldestPending(): ReviewItem | null {
    let oldest: ReviewItem | null = null;
    
    for (const item of this.queue.values()) {
      if (item.status === 'pending') {
        if (!oldest || item.addedAt < oldest.addedAt) {
          oldest = item;
        }
      }
    }
    
    return oldest;
  }

  /**
   * Approve a fix in the queue
   */
  approve(fixId: string, reviewer?: string, comment?: string): boolean {
    const item = this.queue.get(fixId);
    if (!item || item.status !== 'pending') {
      return false;
    }

    item.status = 'approved';
    item.reviewedAt = new Date();
    item.reviewedBy = reviewer;
    item.comment = comment;

    return true;
  }

  /**
   * Reject a fix in the queue
   */
  reject(fixId: string, reviewer?: string, comment?: string): boolean {
    const item = this.queue.get(fixId);
    if (!item || item.status !== 'pending') {
      return false;
    }

    item.status = 'rejected';
    item.reviewedAt = new Date();
    item.reviewedBy = reviewer;
    item.comment = comment;

    return true;
  }

  /**
   * Skip a fix (defer for later)
   */
  skip(fixId: string): boolean {
    const item = this.queue.get(fixId);
    if (!item || item.status !== 'pending') {
      return false;
    }

    item.status = 'skipped';
    return true;
  }

  /**
   * Approve all pending fixes
   */
  approveAll(reviewer?: string): number {
    let count = 0;
    
    for (const item of this.queue.values()) {
      if (item.status === 'pending') {
        item.status = 'approved';
        item.reviewedAt = new Date();
        item.reviewedBy = reviewer;
        count++;
      }
    }

    return count;
  }

  /**
   * Reject all pending fixes
   */
  rejectAll(reviewer?: string, comment?: string): number {
    let count = 0;
    
    for (const item of this.queue.values()) {
      if (item.status === 'pending') {
        item.status = 'rejected';
        item.reviewedAt = new Date();
        item.reviewedBy = reviewer;
        item.comment = comment;
        count++;
      }
    }

    return count;
  }

  /**
   * Apply all approved fixes with concurrency control
   */
  async applyApproved(options: ApplyApprovedOptions = {}): Promise<ApplyResult[]> {
    // Prevent concurrent applications
    if (this.isApplying) {
      throw new Error('Application already in progress');
    }

    const opts = { ...DEFAULT_APPLY_OPTIONS, ...options };
    const results: ApplyResult[] = [];
    const approved = this.getApproved();

    if (approved.length === 0) {
      return results;
    }

    this.isApplying = true;

    try {
      // Apply with concurrency limit
      const maxConcurrent = Math.min(opts.maxConcurrent!, approved.length);
      const chunks: ReviewItem[][] = [];
      
      for (let i = 0; i < approved.length; i += maxConcurrent) {
        chunks.push(approved.slice(i, i + maxConcurrent));
      }

      for (const chunk of chunks) {
        const chunkPromises = chunk.map(async (item) => {
          return this.applyItem(item, opts);
        });

        const chunkResults = await Promise.allSettled(chunkPromises);
        
        for (let i = 0; i < chunkResults.length; i++) {
          const settled = chunkResults[i];
          const item = chunk[i];
          
          if (settled.status === 'fulfilled') {
            results.push(settled.value);
            
            if (!settled.value.success && opts.stopOnFirstFailure) {
              // Mark remaining items as skipped
              for (const remaining of approved.filter((a) => a.status === 'approved')) {
                remaining.status = 'skipped';
              }
              return results;
            }
          } else {
            // Promise rejected
            const errorResult: ApplyResult = {
              success: false,
              filePath: item.fix.patch.filePath,
              error: settled.reason instanceof Error ? settled.reason.message : String(settled.reason),
            };
            item.applyResult = errorResult;
            item.status = 'failed';
            results.push(errorResult);
            
            if (opts.stopOnFirstFailure) {
              return results;
            }
          }
        }
      }

      return results;
    } finally {
      this.isApplying = false;
    }
  }

  /**
   * Apply a single review item with retry support
   */
  private async applyItem(
    item: ReviewItem,
    options: ApplyApprovedOptions
  ): Promise<ApplyResult> {
    const maxRetries = options.maxRetries ?? DEFAULT_APPLY_OPTIONS.maxRetries!;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.patchApplier.apply(item.fix.patch, {
          dryRun: options.dryRun,
          createBackup: options.createBackup ?? true,
        });

        item.applyResult = result;
        item.status = result.success ? 'applied' : 'failed';
        item.retryCount = attempt;
        
        if (result.success || attempt === maxRetries) {
          return result;
        }

        // Wait before retry (exponential backoff)
        await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 100));
      } catch (error) {
        if (attempt === maxRetries) {
          const errorResult: ApplyResult = {
            success: false,
            filePath: item.fix.patch.filePath,
            error: error instanceof Error ? error.message : String(error),
          };
          item.applyResult = errorResult;
          item.status = 'failed';
          item.retryCount = attempt;
          return errorResult;
        }
        
        // Wait before retry
        await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 100));
      }
    }

    // Should not reach here, but TypeScript needs this
    const fallbackResult: ApplyResult = {
      success: false,
      filePath: item.fix.patch.filePath,
      error: 'Max retries exceeded',
    };
    item.applyResult = fallbackResult;
    item.status = 'failed';
    return fallbackResult;
  }

  /**
   * Get all items in the queue
   */
  getAll(): ReviewItem[] {
    return Array.from(this.queue.values());
  }

  /**
   * Get pending items
   */
  getPending(): ReviewItem[] {
    return this.getAll().filter((item) => item.status === 'pending');
  }

  /**
   * Get approved items
   */
  getApproved(): ReviewItem[] {
    return this.getAll().filter((item) => item.status === 'approved');
  }

  /**
   * Get rejected items
   */
  getRejected(): ReviewItem[] {
    return this.getAll().filter((item) => item.status === 'rejected');
  }

  /**
   * Get applied items
   */
  getApplied(): ReviewItem[] {
    return this.getAll().filter((item) => item.status === 'applied');
  }

  /**
   * Get a specific item
   */
  getItem(fixId: string): ReviewItem | undefined {
    return this.queue.get(fixId);
  }

  /**
   * Get summary of queue state
   */
  getSummary(): ReviewSummary {
    const items = this.getAll();
    const now = Date.now();
    
    // Find oldest pending item age
    let oldestPendingAge: number | undefined;
    const pendingItems = items.filter((i) => i.status === 'pending');
    
    if (pendingItems.length > 0) {
      const oldest = pendingItems.reduce((min, item) => 
        item.addedAt < min.addedAt ? item : min
      );
      oldestPendingAge = now - oldest.addedAt.getTime();
    }
    
    return {
      total: items.length,
      pending: pendingItems.length,
      approved: items.filter((i) => i.status === 'approved').length,
      rejected: items.filter((i) => i.status === 'rejected').length,
      applied: items.filter((i) => i.status === 'applied').length,
      failed: items.filter((i) => i.status === 'failed').length,
      skipped: items.filter((i) => i.status === 'skipped').length,
      oldestPendingAge,
    };
  }

  /**
   * Get items filtered by criteria
   */
  getFiltered(filter: {
    status?: ReviewStatus | ReviewStatus[];
    minConfidence?: number;
    maxConfidence?: number;
    issueType?: string;
    filePath?: string;
  }): ReviewItem[] {
    let items = this.getAll();

    if (filter.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      items = items.filter((item) => statuses.includes(item.status));
    }

    if (typeof filter.minConfidence === 'number') {
      items = items.filter((item) => item.fix.confidence.value >= filter.minConfidence!);
    }

    if (typeof filter.maxConfidence === 'number') {
      items = items.filter((item) => item.fix.confidence.value <= filter.maxConfidence!);
    }

    if (filter.issueType) {
      items = items.filter((item) => item.fix.issue.type === filter.issueType);
    }

    if (filter.filePath) {
      const normalizedFilter = sanitizeFilePath(filter.filePath);
      items = items.filter((item) => 
        sanitizeFilePath(item.fix.patch.filePath).includes(normalizedFilter)
      );
    }

    return items;
  }

  /**
   * Clear the queue
   */
  clear(): void {
    this.queue.clear();
  }

  /**
   * Format queue for output
   */
  format(format: OutputFormat = 'markdown'): string {
    switch (format) {
      case 'json':
        return this.formatAsJson();
      case 'patch':
        return this.formatAsPatch();
      case 'diff':
        return this.formatAsDiff();
      case 'markdown':
      default:
        return this.formatAsMarkdown();
    }
  }

  /**
   * Format as Markdown
   */
  private formatAsMarkdown(): string {
    const summary = this.getSummary();
    const lines: string[] = [
      '# VibeCheck Auto-Fix Review',
      '',
      '## Summary',
      '',
      `- **Total Fixes:** ${summary.total}`,
      `- **Pending Review:** ${summary.pending}`,
      `- **Approved:** ${summary.approved}`,
      `- **Applied:** ${summary.applied}`,
      `- **Rejected:** ${summary.rejected}`,
      '',
    ];

    // Pending items
    const pending = this.getPending();
    if (pending.length > 0) {
      lines.push('## Pending Review');
      lines.push('');
      
      for (const item of pending) {
        lines.push(this.formatItemAsMarkdown(item));
        lines.push('');
      }
    }

    // Applied items
    const applied = this.getApplied();
    if (applied.length > 0) {
      lines.push('## Applied Fixes');
      lines.push('');
      
      for (const item of applied) {
        lines.push(`- ✅ ${item.fix.description} (${item.fix.patch.filePath})`);
      }
      lines.push('');
    }

    // Rejected items
    const rejected = this.getRejected();
    if (rejected.length > 0) {
      lines.push('## Rejected Fixes');
      lines.push('');
      
      for (const item of rejected) {
        lines.push(`- ❌ ${item.fix.description}${item.comment ? ` - ${item.comment}` : ''}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Format a single item as Markdown
   */
  private formatItemAsMarkdown(item: ReviewItem): string {
    const fix = item.fix;
    const lines: string[] = [
      `### ${fix.description}`,
      '',
      `**File:** \`${fix.patch.filePath}\``,
      `**Issue:** ${fix.issue.message}`,
      `**Confidence:** ${Math.round(fix.confidence.value * 100)}% (${fix.confidence.level})`,
      `**Strategy:** ${fix.strategy}`,
      '',
      '**Diff:**',
      '```diff',
      this.patchGenerator.formatAsUnifiedDiff(fix.patch),
      '```',
    ];

    return lines.join('\n');
  }

  /**
   * Format as JSON
   */
  private formatAsJson(): string {
    const items = this.getAll().map((item) => ({
      id: item.id,
      status: item.status,
      file: item.fix.patch.filePath,
      description: item.fix.description,
      confidence: item.fix.confidence,
      issue: {
        type: item.fix.issue.type,
        message: item.fix.issue.message,
        severity: item.fix.issue.severity,
      },
      reviewedAt: item.reviewedAt,
      reviewedBy: item.reviewedBy,
      comment: item.comment,
    }));

    return JSON.stringify({ items, summary: this.getSummary() }, null, 2);
  }

  /**
   * Format as patch file
   */
  private formatAsPatch(): string {
    const patches = this.getPending().map((item) => item.fix.patch);
    return patches
      .map((patch) => this.patchGenerator.formatAsUnifiedDiff(patch))
      .join('\n\n');
  }

  /**
   * Format as unified diff
   */
  private formatAsDiff(): string {
    return this.formatAsPatch();
  }

  /**
   * Export queue state for persistence
   */
  export(): {
    items: Array<{
      id: string;
      fixId: string;
      status: ReviewStatus;
      reviewedAt?: string;
      reviewedBy?: string;
      comment?: string;
    }>;
    policy: AutoFixPolicy;
  } {
    return {
      items: this.getAll().map((item) => ({
        id: item.id,
        fixId: item.fix.id,
        status: item.status,
        reviewedAt: item.reviewedAt?.toISOString(),
        reviewedBy: item.reviewedBy,
        comment: item.comment,
      })),
      policy: this.policy,
    };
  }

  /**
   * Generate a PR comment body
   */
  generatePRComment(): string {
    const summary = this.getSummary();
    const lines: string[] = [
      '## 🔧 VibeCheck Auto-Fix Report',
      '',
    ];

    if (summary.applied > 0) {
      lines.push(`✅ **${summary.applied} fix(es) auto-applied**`);
      lines.push('');
      
      for (const item of this.getApplied()) {
        lines.push(`- ${item.fix.description} (\`${item.fix.patch.filePath}\`)`);
      }
      lines.push('');
    }

    if (summary.pending > 0) {
      lines.push(`⏳ **${summary.pending} fix(es) pending review**`);
      lines.push('');
      lines.push('<details>');
      lines.push('<summary>Click to expand</summary>');
      lines.push('');
      
      for (const item of this.getPending()) {
        lines.push(`### ${item.fix.description}`);
        lines.push('');
        lines.push(`**Confidence:** ${Math.round(item.fix.confidence.value * 100)}%`);
        lines.push('');
        lines.push('```diff');
        lines.push(this.patchGenerator.formatAsUnifiedDiff(item.fix.patch));
        lines.push('```');
        lines.push('');
      }
      
      lines.push('</details>');
      lines.push('');
    }

    if (summary.rejected > 0) {
      lines.push(`❌ **${summary.rejected} fix(es) rejected** (low confidence)`);
      lines.push('');
    }

    if (summary.total === 0) {
      lines.push('✨ No issues found that require auto-fixes.');
    }

    lines.push('');
    lines.push('---');
    lines.push('*Generated by VibeCheck Auto-Fix Engine*');

    return lines.join('\n');
  }

  /**
   * Create interactive review prompts for CLI
   */
  getInteractivePrompts(): Array<{
    id: string;
    message: string;
    diff: string;
    confidence: number;
  }> {
    return this.getPending().map((item) => ({
      id: item.id,
      message: `${item.fix.description} (${item.fix.patch.filePath})`,
      diff: this.patchGenerator.formatAsUnifiedDiff(item.fix.patch),
      confidence: item.fix.confidence.value,
    }));
  }
}
