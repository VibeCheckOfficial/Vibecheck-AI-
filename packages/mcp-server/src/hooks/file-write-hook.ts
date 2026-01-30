/**
 * File Write Hook
 * 
 * Intercepts file write operations to validate before committing changes.
 * Creates audit entries for all file operations and validates content.
 * 
 * @module mcp-server/hooks/file-write-hook
 * 
 * @example
 * ```ts
 * const hook = new FileWriteHook();
 * const result = await hook.execute({
 *   filePath: '/path/to/file.ts',
 *   content: 'const x = 1;',
 *   action: 'modify',
 *   previousContent: 'const x = 0;',
 * });
 * 
 * if (!result.allowed) {
 *   console.log('Write blocked:', result.auditEntry);
 * }
 * ```
 */

/**
 * Context for a file write operation.
 */
export interface FileWriteContext {
  /** The path to the file being written */
  filePath: string;
  /** The new content to write */
  content: string;
  /** The type of file operation */
  action: 'create' | 'modify' | 'delete';
  /** Previous file content (for modifications) */
  previousContent?: string;
}

/**
 * Result of a file write validation.
 */
export interface FileWriteResult {
  /** Whether the write is allowed */
  allowed: boolean;
  /** The content to write (may be original or modified) */
  content: string;
  /** List of changes detected */
  changes: Change[];
  /** Audit entry for this operation */
  auditEntry: AuditEntry;
}

/**
 * A change detected in a file write operation.
 */
export interface Change {
  /** Type of change */
  type: 'added' | 'removed' | 'modified';
  /** Human-readable description of the change */
  description: string;
  /** Whether the change has been verified as safe */
  verified: boolean;
}

/**
 * Audit log entry for a file write operation.
 */
export interface AuditEntry {
  /** When the operation occurred */
  timestamp: Date;
  /** Path to the affected file */
  filePath: string;
  /** The action performed */
  action: string;
  /** Result of the validation */
  result: 'allowed' | 'blocked' | 'modified';
  /** Hash of the content */
  hash: string;
  /** Changes included in the operation */
  changes: Change[];
}

/**
 * Hook that validates file write operations.
 * Creates audit entries and validates content for security issues.
 */
export class FileWriteHook {
  /** Internal audit log storage */
  private auditLog: AuditEntry[] = [];

  /**
   * Execute file write validation.
   * Analyzes changes, validates content, and creates audit entry.
   * 
   * @param context - The file write context
   * @returns Validation result with audit entry
   */
  async execute(context: FileWriteContext): Promise<FileWriteResult> {
    // Validate input
    if (!context || typeof context.filePath !== 'string' || typeof context.content !== 'string') {
      const auditEntry: AuditEntry = {
        timestamp: new Date(),
        filePath: context?.filePath ?? 'unknown',
        action: context?.action ?? 'unknown',
        result: 'blocked',
        hash: '',
        changes: [],
      };
      return {
        allowed: false,
        content: '',
        changes: [],
        auditEntry,
      };
    }
    const changes = this.analyzeChanges(context);
    
    // Validate all changes
    const validationResult = await this.validateChanges(context, changes);
    
    // Generate audit entry
    const auditEntry = this.createAuditEntry(context, changes, validationResult.allowed);
    this.auditLog.push(auditEntry);

    // Save audit to disk
    await this.saveAudit(auditEntry);

    return {
      allowed: validationResult.allowed,
      content: validationResult.allowed ? context.content : (context.previousContent ?? ''),
      changes,
      auditEntry,
    };
  }

  /**
   * Get the audit log of all file write operations.
   * Returns a copy to prevent external modification.
   * 
   * @returns Array of audit entries
   */
  getAuditLog(): AuditEntry[] {
    return [...this.auditLog];
  }

  /**
   * Analyze changes between previous and new content.
   * 
   * @param context - The file write context
   * @returns Array of detected changes
   */
  private analyzeChanges(context: FileWriteContext): Change[] {
    const changes: Change[] = [];

    if (context.action === 'create') {
      changes.push({
        type: 'added',
        description: `New file: ${context.filePath}`,
        verified: false,
      });
    } else if (context.action === 'delete') {
      changes.push({
        type: 'removed',
        description: `Deleted file: ${context.filePath}`,
        verified: false,
      });
    } else if (context.previousContent) {
      // Analyze diff
      const addedLines = this.countAddedLines(context.previousContent, context.content);
      const removedLines = this.countRemovedLines(context.previousContent, context.content);

      if (addedLines > 0) {
        changes.push({
          type: 'added',
          description: `Added ${addedLines} lines`,
          verified: false,
        });
      }
      if (removedLines > 0) {
        changes.push({
          type: 'removed',
          description: `Removed ${removedLines} lines`,
          verified: false,
        });
      }
    }

    return changes;
  }

  /**
   * Validate changes for security and safety issues.
   * 
   * @param context - The file write context
   * @param _changes - The detected changes (unused but available)
   * @returns Object with allowed status and any issues found
   */
  private async validateChanges(
    context: FileWriteContext,
    _changes: Change[]
  ): Promise<{ allowed: boolean; issues: string[] }> {
    const issues: string[] = [];

    // Check for suspicious patterns in new content
    if (context.content.includes('rm -rf')) {
      issues.push('Contains potentially dangerous shell command');
    }

    // Check for credential patterns
    if (/(?:password|secret|api_key)\s*=\s*['"][^'"]+['"]/i.test(context.content)) {
      issues.push('Contains potential hardcoded credentials');
    }

    // TODO: Additional validation
    // - Check imports against package.json
    // - Verify types against truthpack
    // - Check for convention violations

    return {
      allowed: issues.length === 0,
      issues,
    };
  }

  /**
   * Create an audit entry for a file write operation.
   * 
   * @param context - The file write context
   * @param changes - The detected changes
   * @param allowed - Whether the write was allowed
   * @returns The created audit entry
   */
  private createAuditEntry(
    context: FileWriteContext,
    changes: Change[],
    allowed: boolean
  ): AuditEntry {
    return {
      timestamp: new Date(),
      filePath: context.filePath,
      action: context.action,
      result: allowed ? 'allowed' : 'blocked',
      hash: this.hashContent(context.content),
      changes,
    };
  }

  /**
   * Save audit entry to disk.
   * 
   * @param _entry - The audit entry to save
   * @returns Promise that resolves when save is complete
   */
  // TODO: Implement audit persistence
  private async saveAudit(_entry: AuditEntry): Promise<void> {
    // TODO: Save to .vibecheck/audit/changes/[timestamp]-[hash].json
  }

  /**
   * Count the number of lines added between two versions.
   * 
   * @param previous - The previous content
   * @param current - The current content
   * @returns Number of added lines
   */
  private countAddedLines(previous: string, current: string): number {
    const prevLines = previous.split('\n').length;
    const currLines = current.split('\n').length;
    return Math.max(0, currLines - prevLines);
  }

  /**
   * Count the number of lines removed between two versions.
   * 
   * @param previous - The previous content
   * @param current - The current content
   * @returns Number of removed lines
   */
  private countRemovedLines(previous: string, current: string): number {
    const prevLines = previous.split('\n').length;
    const currLines = current.split('\n').length;
    return Math.max(0, prevLines - currLines);
  }

  /**
   * Generate a simple hash of content for audit purposes.
   * Note: This is a simple hash, not cryptographically secure.
   * 
   * @param content - The content to hash
   * @returns Base36 hash string
   */
  private hashContent(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }
}
