/**
 * Incremental Analysis Engine
 *
 * Only analyzes what changed - enables 10-100x faster scans on large codebases.
 * Uses content hashing, dependency tracking, and git integration.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { createHash } from 'crypto';
import { glob } from 'glob';
import { execSync } from 'child_process';
import { getLogger, type Logger } from '../utils/logger.js';
import type {
  CachedFinding,
  ChangeSet,
  DependencyNode,
  FileHash,
  IncrementalConfig,
  IncrementalState,
  DEFAULT_INCREMENTAL_CONFIG,
} from './types.js';

const DEFAULT_CONFIG: IncrementalConfig = {
  statePath: '.vibecheck/incremental-state.json',
  trackDependencies: true,
  useGitDiff: true,
  maxCacheAge: 24 * 60 * 60 * 1000,
  includePatterns: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
  excludePatterns: ['node_modules/**', 'dist/**', 'build/**', '.next/**', 'coverage/**'],
};

interface StoredState {
  version: string;
  lastScanTimestamp: number;
  fileHashes: Array<[string, FileHash]>;
  dependencyGraph: Array<[string, string[]]>;
  cachedResults: Array<[string, CachedFinding[]]>;
  projectRoot: string;
}

/**
 * Incremental Analysis Engine
 */
export class IncrementalEngine {
  private config: IncrementalConfig;
  private projectRoot: string;
  private state: IncrementalState | null = null;
  private logger: Logger;

  constructor(projectRoot: string, config: Partial<IncrementalConfig> = {}) {
    this.projectRoot = projectRoot;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = getLogger('incremental-engine');
  }

  /**
   * Initialize the engine - loads existing state or creates new
   */
  async initialize(): Promise<void> {
    await this.loadState();

    if (!this.state) {
      this.state = this.createEmptyState();
    }

    this.logger.debug('Incremental engine initialized', {
      cachedFiles: this.state.fileHashes.size,
      cachedResults: this.state.cachedResults.size,
    });
  }

  /**
   * Get files that need to be re-analyzed
   */
  async getChangedFiles(): Promise<ChangeSet> {
    await this.ensureInitialized();

    const changeSet: ChangeSet = {
      added: [],
      modified: [],
      deleted: [],
      affected: [],
    };

    // Get current files
    const currentFiles = await this.getAllFiles();
    const currentFileSet = new Set(currentFiles);

    // Use git diff if enabled and available
    if (this.config.useGitDiff && this.state) {
      const gitChanges = await this.getGitChanges(this.state.lastScanTimestamp);
      if (gitChanges) {
        // Verify git changes with hash comparison
        for (const file of gitChanges.modified) {
          if (currentFileSet.has(file)) {
            const currentHash = await this.hashFile(file);
            const cachedHash = this.state.fileHashes.get(file)?.hash;

            if (currentHash !== cachedHash) {
              changeSet.modified.push(file);
            }
          }
        }

        changeSet.added = gitChanges.added.filter((f) => currentFileSet.has(f));
        changeSet.deleted = gitChanges.deleted;

        // Propagate dependencies
        if (this.config.trackDependencies) {
          changeSet.affected = this.propagateDependencies([
            ...changeSet.modified,
            ...changeSet.added,
          ]);
        }

        return this.deduplicateChangeSet(changeSet);
      }
    }

    // Fall back to hash-based change detection
    return this.detectChangesByHash(currentFiles);
  }

  /**
   * Get cached results for unchanged files
   */
  getCachedResults(unchangedFiles: string[]): Map<string, CachedFinding[]> {
    const results = new Map<string, CachedFinding[]>();

    if (!this.state) return results;

    for (const file of unchangedFiles) {
      const cached = this.state.cachedResults.get(file);
      if (cached) {
        results.set(file, cached);
      }
    }

    return results;
  }

  /**
   * Update state with new scan results
   */
  async updateState(
    scannedFiles: string[],
    findings: CachedFinding[]
  ): Promise<void> {
    await this.ensureInitialized();

    if (!this.state) return;

    // Update file hashes for scanned files
    for (const file of scannedFiles) {
      const hash = await this.hashFile(file);
      const stat = await this.getFileStat(file);

      this.state.fileHashes.set(file, {
        path: file,
        hash,
        size: stat?.size ?? 0,
        mtime: stat?.mtime ?? Date.now(),
      });
    }

    // Update cached results
    const findingsByFile = new Map<string, CachedFinding[]>();
    for (const finding of findings) {
      const list = findingsByFile.get(finding.file) ?? [];
      list.push(finding);
      findingsByFile.set(finding.file, list);
    }

    for (const [file, fileFindings] of findingsByFile) {
      this.state.cachedResults.set(file, fileFindings);
    }

    // Update dependency graph for scanned files
    if (this.config.trackDependencies) {
      await this.updateDependencyGraph(scannedFiles);
    }

    // Update timestamp
    this.state.lastScanTimestamp = Date.now();

    // Save state
    await this.saveState();
  }

  /**
   * Invalidate cache for specific files
   */
  invalidateFiles(files: string[]): void {
    if (!this.state) return;

    for (const file of files) {
      this.state.fileHashes.delete(file);
      this.state.cachedResults.delete(file);
      this.state.dependencyGraph.delete(file);
    }
  }

  /**
   * Clear all cached state
   */
  async clearState(): Promise<void> {
    this.state = this.createEmptyState();
    await this.saveState();
    this.logger.info('Incremental state cleared');
  }

  /**
   * Get statistics about the incremental state
   */
  getStats(): {
    cachedFiles: number;
    cachedFindings: number;
    dependencyNodes: number;
    stateAge: number;
    stateSize: number;
  } {
    if (!this.state) {
      return {
        cachedFiles: 0,
        cachedFindings: 0,
        dependencyNodes: 0,
        stateAge: 0,
        stateSize: 0,
      };
    }

    let totalFindings = 0;
    for (const findings of this.state.cachedResults.values()) {
      totalFindings += findings.length;
    }

    return {
      cachedFiles: this.state.fileHashes.size,
      cachedFindings: totalFindings,
      dependencyNodes: this.state.dependencyGraph.size,
      stateAge: Date.now() - this.state.lastScanTimestamp,
      stateSize: this.estimateStateSize(),
    };
  }

  /**
   * Merge new results with cached results
   */
  mergeResults(
    cached: CachedFinding[],
    fresh: CachedFinding[],
    changedFiles: Set<string>
  ): CachedFinding[] {
    // Keep cached results for unchanged files
    const unchanged = cached.filter((f) => !changedFiles.has(f.file));

    // Combine with fresh results
    return [...unchanged, ...fresh];
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async ensureInitialized(): Promise<void> {
    if (!this.state) {
      await this.initialize();
    }
  }

  private createEmptyState(): IncrementalState {
    return {
      version: '1.0.0',
      lastScanTimestamp: 0,
      fileHashes: new Map(),
      dependencyGraph: new Map(),
      cachedResults: new Map(),
      projectRoot: this.projectRoot,
    };
  }

  private async loadState(): Promise<void> {
    const statePath = path.join(this.projectRoot, this.config.statePath);

    try {
      const content = await fs.readFile(statePath, 'utf-8');
      const stored = JSON.parse(content) as StoredState;

      // Validate version and project root
      if (stored.projectRoot !== this.projectRoot) {
        this.logger.debug('State project root mismatch, creating new state');
        return;
      }

      // Check if state is too old
      if (Date.now() - stored.lastScanTimestamp > this.config.maxCacheAge) {
        this.logger.debug('State too old, creating new state');
        return;
      }

      this.state = {
        version: stored.version,
        lastScanTimestamp: stored.lastScanTimestamp,
        fileHashes: new Map(stored.fileHashes),
        dependencyGraph: new Map(
          stored.dependencyGraph.map(([k, v]) => [k, new Set(v)])
        ),
        cachedResults: new Map(stored.cachedResults),
        projectRoot: stored.projectRoot,
      };

      this.logger.debug('Loaded incremental state', {
        files: this.state.fileHashes.size,
        age: Date.now() - this.state.lastScanTimestamp,
      });
    } catch {
      // No existing state
      this.state = null;
    }
  }

  private async saveState(): Promise<void> {
    if (!this.state) return;

    const statePath = path.join(this.projectRoot, this.config.statePath);
    const dir = path.dirname(statePath);

    try {
      await fs.mkdir(dir, { recursive: true });

      const stored: StoredState = {
        version: this.state.version,
        lastScanTimestamp: this.state.lastScanTimestamp,
        fileHashes: Array.from(this.state.fileHashes.entries()),
        dependencyGraph: Array.from(this.state.dependencyGraph.entries()).map(
          ([k, v]) => [k, Array.from(v)]
        ),
        cachedResults: Array.from(this.state.cachedResults.entries()),
        projectRoot: this.state.projectRoot,
      };

      await fs.writeFile(statePath, JSON.stringify(stored), 'utf-8');
      this.logger.debug('Saved incremental state');
    } catch (error) {
      this.logger.warn('Failed to save incremental state', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
    }
  }

  private async getAllFiles(): Promise<string[]> {
    const files = await glob(this.config.includePatterns, {
      cwd: this.projectRoot,
      ignore: this.config.excludePatterns,
      absolute: false,
    });

    return files;
  }

  private async hashFile(relativePath: string): Promise<string> {
    const absolutePath = path.join(this.projectRoot, relativePath);

    try {
      const content = await fs.readFile(absolutePath);
      return createHash('sha256').update(content).digest('hex').slice(0, 16);
    } catch {
      return '';
    }
  }

  private async getFileStat(
    relativePath: string
  ): Promise<{ size: number; mtime: number } | null> {
    const absolutePath = path.join(this.projectRoot, relativePath);

    try {
      const stat = await fs.stat(absolutePath);
      return {
        size: stat.size,
        mtime: stat.mtimeMs,
      };
    } catch {
      return null;
    }
  }

  private async getGitChanges(
    sinceTimestamp: number
  ): Promise<{ added: string[]; modified: string[]; deleted: string[] } | null> {
    try {
      // Check if we're in a git repo
      execSync('git rev-parse --git-dir', {
        cwd: this.projectRoot,
        stdio: 'ignore',
      });

      const sinceDate = new Date(sinceTimestamp).toISOString();

      // Get changes since last scan
      const diffOutput = execSync(
        `git diff --name-status --since="${sinceDate}" HEAD 2>/dev/null || git diff --name-status HEAD`,
        { cwd: this.projectRoot, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
      );

      const added: string[] = [];
      const modified: string[] = [];
      const deleted: string[] = [];

      for (const line of diffOutput.split('\n').filter(Boolean)) {
        const [status, ...fileParts] = line.split('\t');
        const file = fileParts.join('\t');

        if (!file) continue;

        // Filter to included patterns
        const matchesInclude = this.config.includePatterns.some((pattern) => {
          const regex = new RegExp(
            pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*')
          );
          return regex.test(file);
        });

        const matchesExclude = this.config.excludePatterns.some((pattern) => {
          const regex = new RegExp(
            pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*')
          );
          return regex.test(file);
        });

        if (!matchesInclude || matchesExclude) continue;

        switch (status[0]) {
          case 'A':
            added.push(file);
            break;
          case 'M':
          case 'R':
          case 'C':
            modified.push(file);
            break;
          case 'D':
            deleted.push(file);
            break;
        }
      }

      return { added, modified, deleted };
    } catch {
      return null;
    }
  }

  private async detectChangesByHash(currentFiles: string[]): Promise<ChangeSet> {
    const changeSet: ChangeSet = {
      added: [],
      modified: [],
      deleted: [],
      affected: [],
    };

    if (!this.state) {
      changeSet.added = currentFiles;
      return changeSet;
    }

    const currentFileSet = new Set(currentFiles);
    const cachedFileSet = new Set(this.state.fileHashes.keys());

    // Find added files
    for (const file of currentFiles) {
      if (!cachedFileSet.has(file)) {
        changeSet.added.push(file);
      }
    }

    // Find deleted files
    for (const file of cachedFileSet) {
      if (!currentFileSet.has(file)) {
        changeSet.deleted.push(file);
      }
    }

    // Find modified files (hash changed)
    const filesToCheck = currentFiles.filter(
      (f) => !changeSet.added.includes(f)
    );

    // Check in parallel for performance
    const batchSize = 50;
    for (let i = 0; i < filesToCheck.length; i += batchSize) {
      const batch = filesToCheck.slice(i, i + batchSize);
      const hashChecks = await Promise.all(
        batch.map(async (file) => {
          const currentHash = await this.hashFile(file);
          const cachedHash = this.state!.fileHashes.get(file)?.hash;
          return { file, changed: currentHash !== cachedHash };
        })
      );

      for (const { file, changed } of hashChecks) {
        if (changed) {
          changeSet.modified.push(file);
        }
      }
    }

    // Propagate dependencies
    if (this.config.trackDependencies) {
      changeSet.affected = this.propagateDependencies([
        ...changeSet.modified,
        ...changeSet.added,
      ]);
    }

    return this.deduplicateChangeSet(changeSet);
  }

  private propagateDependencies(changedFiles: string[]): string[] {
    if (!this.state) return [];

    const affected = new Set<string>();
    const toVisit = [...changedFiles];
    const visited = new Set<string>();

    while (toVisit.length > 0) {
      const file = toVisit.pop()!;
      if (visited.has(file)) continue;
      visited.add(file);

      // Find files that depend on this file
      for (const [dependent, dependencies] of this.state.dependencyGraph) {
        if (dependencies.has(file) && !visited.has(dependent)) {
          affected.add(dependent);
          toVisit.push(dependent);
        }
      }
    }

    // Remove files that are already in the changed set
    const changedSet = new Set(changedFiles);
    return Array.from(affected).filter((f) => !changedSet.has(f));
  }

  private deduplicateChangeSet(changeSet: ChangeSet): ChangeSet {
    const allChanged = new Set([
      ...changeSet.added,
      ...changeSet.modified,
      ...changeSet.deleted,
    ]);

    return {
      ...changeSet,
      affected: changeSet.affected.filter((f) => !allChanged.has(f)),
    };
  }

  private async updateDependencyGraph(files: string[]): Promise<void> {
    if (!this.state) return;

    for (const file of files) {
      try {
        const dependencies = await this.extractDependencies(file);
        this.state.dependencyGraph.set(file, new Set(dependencies));
      } catch {
        // Skip files that can't be parsed
      }
    }
  }

  private async extractDependencies(relativePath: string): Promise<string[]> {
    const absolutePath = path.join(this.projectRoot, relativePath);
    const dependencies: string[] = [];

    try {
      const content = await fs.readFile(absolutePath, 'utf-8');

      // Extract import statements
      const importRegex = /import\s+(?:{[^}]+}|\*\s+as\s+\w+|\w+)\s+from\s+['"]([^'"]+)['"]/g;
      let match;

      while ((match = importRegex.exec(content)) !== null) {
        const importPath = match[1];

        // Only track relative imports
        if (importPath.startsWith('.')) {
          const resolved = this.resolveRelativeImport(relativePath, importPath);
          if (resolved) {
            dependencies.push(resolved);
          }
        }
      }

      // Extract require statements
      const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
      while ((match = requireRegex.exec(content)) !== null) {
        const requirePath = match[1];

        if (requirePath.startsWith('.')) {
          const resolved = this.resolveRelativeImport(relativePath, requirePath);
          if (resolved) {
            dependencies.push(resolved);
          }
        }
      }
    } catch {
      // Ignore parse errors
    }

    return dependencies;
  }

  private resolveRelativeImport(
    fromFile: string,
    importPath: string
  ): string | null {
    const fromDir = path.dirname(fromFile);
    const resolved = path.normalize(path.join(fromDir, importPath));

    // Try common extensions
    const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js', '/index.jsx'];

    for (const ext of extensions) {
      const withExt = resolved + ext;
      if (this.state?.fileHashes.has(withExt)) {
        return withExt;
      }
    }

    return null;
  }

  private estimateStateSize(): number {
    if (!this.state) return 0;

    let size = 0;

    // File hashes
    for (const hash of this.state.fileHashes.values()) {
      size += hash.path.length + hash.hash.length + 16;
    }

    // Dependency graph
    for (const [file, deps] of this.state.dependencyGraph) {
      size += file.length;
      for (const dep of deps) {
        size += dep.length;
      }
    }

    // Cached results
    for (const [file, findings] of this.state.cachedResults) {
      size += file.length;
      for (const finding of findings) {
        size += JSON.stringify(finding).length;
      }
    }

    return size;
  }
}

// ============================================================================
// Singleton
// ============================================================================

let globalEngine: IncrementalEngine | null = null;

export async function getIncrementalEngine(
  projectRoot: string,
  config?: Partial<IncrementalConfig>
): Promise<IncrementalEngine> {
  if (!globalEngine || globalEngine['projectRoot'] !== projectRoot) {
    globalEngine = new IncrementalEngine(projectRoot, config);
    await globalEngine.initialize();
  }
  return globalEngine;
}

export async function resetIncrementalEngine(): Promise<void> {
  globalEngine = null;
}
