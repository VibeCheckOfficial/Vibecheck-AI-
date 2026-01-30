/**
 * Context Sync
 * 
 * Watches for file changes and triggers truthpack regeneration.
 * Keeps context fresh and synchronized with the codebase.
 */

import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';

export interface SyncEvent {
  type: 'change' | 'add' | 'unlink' | 'refresh';
  path: string;
  section?: string;
  timestamp: Date;
}

export interface SyncConfig {
  projectRoot: string;
  truthpackPath: string;
  watchPatterns: string[];
  ignorePatterns: string[];
  debounceMs: number;
  autoRefresh: boolean;
  refreshCallback?: (sections: string[]) => Promise<void>;
}

export interface SyncStatus {
  watching: boolean;
  lastSync: Date | null;
  pendingRefresh: string[];
  watchedFiles: number;
  changesSinceSync: number;
}

const DEFAULT_CONFIG: SyncConfig = {
  projectRoot: process.cwd(),
  truthpackPath: '.vibecheck/truthpack',
  watchPatterns: [
    'src/**/*.ts',
    'src/**/*.tsx',
    'src/**/*.js',
    'src/**/*.jsx',
    'api/**/*.ts',
    'routes/**/*.ts',
    '.env',
    '.env.*',
    'package.json',
  ],
  ignorePatterns: [
    'node_modules/**',
    'dist/**',
    'build/**',
    '.git/**',
    '*.d.ts',
  ],
  debounceMs: 2000,
  autoRefresh: true,
};

// Map file patterns to truthpack sections
const SECTION_MAPPINGS: Array<{ pattern: RegExp; sections: string[] }> = [
  { pattern: /\/(api|routes?|controllers?)\//i, sections: ['routes'] },
  { pattern: /\.env(\..*)?$/i, sections: ['env'] },
  { pattern: /\/(auth|middleware)\//i, sections: ['auth', 'routes'] },
  { pattern: /\/(types?|schemas?|contracts?)\//i, sections: ['contracts'] },
  { pattern: /package\.json$/i, sections: ['routes', 'contracts'] },
];

export class ContextSync extends EventEmitter {
  private config: SyncConfig;
  private watcher: fs.FSWatcher | null = null;
  private status: SyncStatus;
  private pendingSections: Set<string> = new Set();
  private debounceTimer: NodeJS.Timeout | null = null;
  private watchedPaths: Set<string> = new Set();

  constructor(config: Partial<SyncConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.status = {
      watching: false,
      lastSync: null,
      pendingRefresh: [],
      watchedFiles: 0,
      changesSinceSync: 0,
    };
  }

  /**
   * Start watching for file changes
   */
  start(): void {
    if (this.status.watching) {
      return;
    }

    try {
      // Use recursive watching on the project root
      this.watcher = fs.watch(
        this.config.projectRoot,
        { recursive: true },
        (eventType, filename) => {
          if (filename) {
            this.handleFileChange(eventType as 'change' | 'rename', filename);
          }
        }
      );

      this.watcher.on('error', (error) => {
        this.emit('error', error);
      });

      this.status.watching = true;
      this.emit('started');
    } catch (error) {
      this.emit('error', error);
    }
  }

  /**
   * Stop watching for file changes
   */
  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    this.status.watching = false;
    this.emit('stopped');
  }

  /**
   * Get current sync status
   */
  getStatus(): SyncStatus {
    return {
      ...this.status,
      pendingRefresh: Array.from(this.pendingSections),
    };
  }

  /**
   * Manually trigger refresh for specific sections
   */
  async refresh(sections?: string[]): Promise<void> {
    const toRefresh = sections || Array.from(this.pendingSections);
    
    if (toRefresh.length === 0) {
      toRefresh.push('routes', 'env', 'auth', 'contracts');
    }

    this.emit('refreshing', toRefresh);

    try {
      if (this.config.refreshCallback) {
        await this.config.refreshCallback(toRefresh);
      }

      this.pendingSections.clear();
      this.status.lastSync = new Date();
      this.status.changesSinceSync = 0;

      this.emit('refreshed', toRefresh);
    } catch (error) {
      this.emit('error', error);
    }
  }

  /**
   * Set the refresh callback
   */
  setRefreshCallback(callback: (sections: string[]) => Promise<void>): void {
    this.config.refreshCallback = callback;
  }

  /**
   * Check if a file should trigger refresh
   */
  shouldRefresh(filePath: string): boolean {
    // Check ignore patterns
    for (const pattern of this.config.ignorePatterns) {
      if (this.matchGlob(filePath, pattern)) {
        return false;
      }
    }

    // Check watch patterns
    for (const pattern of this.config.watchPatterns) {
      if (this.matchGlob(filePath, pattern)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get sections affected by a file change
   */
  getAffectedSections(filePath: string): string[] {
    const sections: string[] = [];

    for (const mapping of SECTION_MAPPINGS) {
      if (mapping.pattern.test(filePath)) {
        sections.push(...mapping.sections);
      }
    }

    // Default: if we can't determine, refresh all
    if (sections.length === 0 && this.shouldRefresh(filePath)) {
      sections.push('routes', 'contracts');
    }

    return [...new Set(sections)];
  }

  /**
   * Handle a file change event
   */
  private handleFileChange(eventType: 'change' | 'rename', filename: string): void {
    const filePath = path.join(this.config.projectRoot, filename);

    // Check if we should process this file
    if (!this.shouldRefresh(filename)) {
      return;
    }

    // Determine affected sections
    const sections = this.getAffectedSections(filename);
    
    // Add to pending
    for (const section of sections) {
      this.pendingSections.add(section);
    }

    this.status.changesSinceSync++;

    // Emit change event
    const event: SyncEvent = {
      type: eventType === 'rename' ? 'add' : 'change',
      path: filePath,
      section: sections[0],
      timestamp: new Date(),
    };
    this.emit('change', event);

    // Debounce refresh
    if (this.config.autoRefresh) {
      this.debounceRefresh();
    }
  }

  /**
   * Debounce refresh to avoid too many regenerations
   */
  private debounceRefresh(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.refresh();
    }, this.config.debounceMs);
  }

  /**
   * Simple glob matching
   */
  private matchGlob(filePath: string, pattern: string): boolean {
    // Normalize paths
    const normalizedPath = filePath.replace(/\\/g, '/');
    const normalizedPattern = pattern.replace(/\\/g, '/');

    // Convert glob to regex
    const regexPattern = normalizedPattern
      .replace(/\*\*/g, '<<<GLOBSTAR>>>')
      .replace(/\*/g, '[^/]*')
      .replace(/<<<GLOBSTAR>>>/g, '.*')
      .replace(/\./g, '\\.')
      .replace(/\?/g, '.');

    const regex = new RegExp(`^${regexPattern}$|/${regexPattern}$`);
    return regex.test(normalizedPath);
  }
}

/**
 * Create a context sync instance with truthpack regeneration
 */
export function createContextSync(
  projectRoot: string,
  regenerateTruthpack: (sections: string[]) => Promise<void>
): ContextSync {
  const sync = new ContextSync({
    projectRoot,
    refreshCallback: regenerateTruthpack,
  });

  return sync;
}
