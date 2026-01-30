/**
 * Intent Store
 * 
 * Manages declared intents for the agent firewall.
 * Intents define the allowed scope and operations for AI actions.
 */

export interface DeclaredIntent {
  id: string;
  description: string;
  allowedPaths: string[];
  allowedOperations: ('read' | 'write' | 'modify' | 'delete' | 'execute')[];
  scope: 'file' | 'directory' | 'module' | 'project';
  targetFiles?: string[];
  excludedPaths?: string[];
  metadata?: Record<string, unknown>;
  declaredAt: Date;
  expiresAt?: Date;
}

export interface IntentDeclaration {
  description: string;
  allowedPaths?: string[];
  allowedOperations?: ('read' | 'write' | 'modify' | 'delete' | 'execute')[];
  scope?: 'file' | 'directory' | 'module' | 'project';
  targetFiles?: string[];
  excludedPaths?: string[];
  expiresInMs?: number;
  metadata?: Record<string, unknown>;
}

export interface IntentCheckResult {
  allowed: boolean;
  intent: DeclaredIntent | null;
  reason: string;
  violations: string[];
}

export class IntentStore {
  private currentIntent: DeclaredIntent | null = null;
  private intentHistory: DeclaredIntent[] = [];
  private maxHistorySize = 100;

  /**
   * Declare a new intent
   */
  declare(declaration: IntentDeclaration): DeclaredIntent {
    const intent: DeclaredIntent = {
      id: this.generateId(),
      description: declaration.description,
      allowedPaths: declaration.allowedPaths ?? ['**/*'],
      allowedOperations: declaration.allowedOperations ?? ['read', 'write', 'modify'],
      scope: declaration.scope ?? 'file',
      targetFiles: declaration.targetFiles,
      excludedPaths: declaration.excludedPaths ?? ['node_modules/**', '.git/**'],
      metadata: declaration.metadata,
      declaredAt: new Date(),
      expiresAt: declaration.expiresInMs 
        ? new Date(Date.now() + declaration.expiresInMs)
        : undefined,
    };

    // Archive current intent if exists
    if (this.currentIntent) {
      this.intentHistory.push(this.currentIntent);
      if (this.intentHistory.length > this.maxHistorySize) {
        this.intentHistory.shift();
      }
    }

    this.currentIntent = intent;
    return intent;
  }

  /**
   * Get the current active intent
   */
  getCurrent(): DeclaredIntent | null {
    // Check if intent has expired
    if (this.currentIntent?.expiresAt && new Date() > this.currentIntent.expiresAt) {
      this.intentHistory.push(this.currentIntent);
      this.currentIntent = null;
    }
    return this.currentIntent;
  }

  /**
   * Clear the current intent
   */
  clear(): DeclaredIntent | null {
    const cleared = this.currentIntent;
    if (cleared) {
      this.intentHistory.push(cleared);
    }
    this.currentIntent = null;
    return cleared;
  }

  /**
   * Get intent history
   */
  getHistory(limit?: number): DeclaredIntent[] {
    const history = [...this.intentHistory];
    if (limit) {
      return history.slice(-limit);
    }
    return history;
  }

  /**
   * Check if an action is allowed under the current intent
   */
  checkAction(
    action: 'read' | 'write' | 'modify' | 'delete' | 'execute',
    targetPath: string
  ): IntentCheckResult {
    const intent = this.getCurrent();

    // If no intent declared, use permissive default
    if (!intent) {
      return {
        allowed: true,
        intent: null,
        reason: 'No intent declared - all actions allowed',
        violations: [],
      };
    }

    const violations: string[] = [];

    // Check operation is allowed
    if (!intent.allowedOperations.includes(action)) {
      violations.push(`Operation "${action}" not in allowed operations: ${intent.allowedOperations.join(', ')}`);
    }

    // Check path is allowed
    if (!this.isPathAllowed(targetPath, intent)) {
      violations.push(`Path "${targetPath}" not in allowed paths`);
    }

    // Check path is not excluded
    if (this.isPathExcluded(targetPath, intent)) {
      violations.push(`Path "${targetPath}" is explicitly excluded`);
    }

    // Check if target file is in the specified target files (if any)
    if (intent.targetFiles && intent.targetFiles.length > 0) {
      if (!this.isInTargetFiles(targetPath, intent.targetFiles)) {
        violations.push(`Path "${targetPath}" not in declared target files`);
      }
    }

    return {
      allowed: violations.length === 0,
      intent,
      reason: violations.length === 0 
        ? 'Action matches declared intent'
        : `Intent violation: ${violations.join('; ')}`,
      violations,
    };
  }

  /**
   * Extend the current intent with additional permissions
   */
  extend(extension: Partial<IntentDeclaration>): DeclaredIntent | null {
    if (!this.currentIntent) return null;

    // Merge extensions with current intent
    if (extension.allowedPaths) {
      this.currentIntent.allowedPaths = [
        ...new Set([...this.currentIntent.allowedPaths, ...extension.allowedPaths])
      ];
    }

    if (extension.allowedOperations) {
      this.currentIntent.allowedOperations = [
        ...new Set([...this.currentIntent.allowedOperations, ...extension.allowedOperations])
      ] as DeclaredIntent['allowedOperations'];
    }

    if (extension.targetFiles) {
      this.currentIntent.targetFiles = [
        ...new Set([...(this.currentIntent.targetFiles ?? []), ...extension.targetFiles])
      ];
    }

    if (extension.expiresInMs) {
      this.currentIntent.expiresAt = new Date(Date.now() + extension.expiresInMs);
    }

    return this.currentIntent;
  }

  /**
   * Restrict the current intent
   */
  restrict(restriction: Partial<IntentDeclaration>): DeclaredIntent | null {
    if (!this.currentIntent) return null;

    if (restriction.allowedPaths) {
      this.currentIntent.allowedPaths = restriction.allowedPaths;
    }

    if (restriction.allowedOperations) {
      this.currentIntent.allowedOperations = restriction.allowedOperations;
    }

    if (restriction.excludedPaths) {
      this.currentIntent.excludedPaths = [
        ...new Set([...(this.currentIntent.excludedPaths ?? []), ...restriction.excludedPaths])
      ];
    }

    return this.currentIntent;
  }

  private isPathAllowed(path: string, intent: DeclaredIntent): boolean {
    return intent.allowedPaths.some(pattern => this.matchPath(path, pattern));
  }

  private isPathExcluded(path: string, intent: DeclaredIntent): boolean {
    if (!intent.excludedPaths) return false;
    return intent.excludedPaths.some(pattern => this.matchPath(path, pattern));
  }

  private isInTargetFiles(path: string, targetFiles: string[]): boolean {
    return targetFiles.some(target => 
      path === target || 
      path.endsWith(target) ||
      this.matchPath(path, target)
    );
  }

  private matchPath(path: string, pattern: string): boolean {
    // Normalize paths
    const normalizedPath = path.replace(/\\/g, '/');
    const normalizedPattern = pattern.replace(/\\/g, '/');

    // Exact match
    if (normalizedPath === normalizedPattern) return true;

    // Wildcard matching
    if (normalizedPattern.includes('*')) {
      const regexPattern = normalizedPattern
        .replace(/\*\*/g, '<<<GLOBSTAR>>>')
        .replace(/\*/g, '[^/]*')
        .replace(/<<<GLOBSTAR>>>/g, '.*');
      
      const regex = new RegExp(`^${regexPattern}$`);
      return regex.test(normalizedPath);
    }

    // Directory matching
    if (normalizedPattern.endsWith('/')) {
      return normalizedPath.startsWith(normalizedPattern);
    }

    return false;
  }

  private generateId(): string {
    return `intent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}

// Singleton instance for global state
let globalIntentStore: IntentStore | null = null;

export function getIntentStore(): IntentStore {
  if (!globalIntentStore) {
    globalIntentStore = new IntentStore();
  }
  return globalIntentStore;
}

export function resetIntentStore(): void {
  globalIntentStore = null;
}
