/**
 * Dependency Tracker
 * 
 * Builds and maintains a dependency graph for cache invalidation.
 * Uses reverse-dependency mapping for efficient cascade invalidation.
 */

import path from 'node:path';
import type { DependencyMap, InvalidationResult } from './types.js';

interface DependencyTrackerOptions {
  /** Base directory for resolving relative paths */
  baseDir: string;
}

export class DependencyTracker {
  private baseDir: string;
  private dependencies: DependencyMap = {
    forward: new Map(),
    reverse: new Map(),
  };
  private invalidationCount = 0;

  constructor(options: DependencyTrackerOptions) {
    this.baseDir = options.baseDir;
  }

  /**
   * Register dependencies for a file
   */
  setDependencies(filePath: string, imports: string[]): void {
    const normalizedFile = this.normalizePath(filePath);
    const normalizedImports = imports.map((i) => this.normalizePath(i));

    // Clear old forward dependencies
    const oldDeps = this.dependencies.forward.get(normalizedFile);
    if (oldDeps) {
      for (const dep of oldDeps) {
        const reverse = this.dependencies.reverse.get(dep);
        if (reverse) {
          reverse.delete(normalizedFile);
        }
      }
    }

    // Set new forward dependencies
    this.dependencies.forward.set(normalizedFile, new Set(normalizedImports));

    // Update reverse dependencies
    for (const dep of normalizedImports) {
      let reverse = this.dependencies.reverse.get(dep);
      if (!reverse) {
        reverse = new Set();
        this.dependencies.reverse.set(dep, reverse);
      }
      reverse.add(normalizedFile);
    }
  }

  /**
   * Get files that directly import the given file
   */
  getDirectDependents(filePath: string): string[] {
    const normalizedFile = this.normalizePath(filePath);
    const dependents = this.dependencies.reverse.get(normalizedFile);
    return dependents ? Array.from(dependents) : [];
  }

  /**
   * Get all files that depend on the given file (transitively)
   */
  getAllDependents(filePath: string): string[] {
    const normalizedFile = this.normalizePath(filePath);
    const visited = new Set<string>();
    const queue = [normalizedFile];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const dependents = this.dependencies.reverse.get(current);

      if (dependents) {
        for (const dep of dependents) {
          if (!visited.has(dep)) {
            visited.add(dep);
            queue.push(dep);
          }
        }
      }
    }

    return Array.from(visited);
  }

  /**
   * Get files that the given file directly imports
   */
  getDirectDependencies(filePath: string): string[] {
    const normalizedFile = this.normalizePath(filePath);
    const deps = this.dependencies.forward.get(normalizedFile);
    return deps ? Array.from(deps) : [];
  }

  /**
   * Check if a file has any dependents
   */
  hasDependents(filePath: string): boolean {
    const normalizedFile = this.normalizePath(filePath);
    const dependents = this.dependencies.reverse.get(normalizedFile);
    return dependents !== undefined && dependents.size > 0;
  }

  /**
   * Invalidate a file and all its dependents
   * Returns the list of files that should be invalidated
   */
  invalidate(filePath: string, reason: InvalidationResult['reason'] = 'changed'): InvalidationResult {
    const normalizedFile = this.normalizePath(filePath);
    const allDependents = this.getAllDependents(normalizedFile);

    // Include the file itself
    const invalidated = [normalizedFile, ...allDependents];
    this.invalidationCount += invalidated.length;

    return {
      invalidated,
      reason,
    };
  }

  /**
   * Remove a file from the dependency graph
   */
  removeFile(filePath: string): void {
    const normalizedFile = this.normalizePath(filePath);

    // Remove from forward map
    const deps = this.dependencies.forward.get(normalizedFile);
    if (deps) {
      for (const dep of deps) {
        const reverse = this.dependencies.reverse.get(dep);
        if (reverse) {
          reverse.delete(normalizedFile);
        }
      }
      this.dependencies.forward.delete(normalizedFile);
    }

    // Remove from reverse map
    const dependents = this.dependencies.reverse.get(normalizedFile);
    if (dependents) {
      for (const dependent of dependents) {
        const forward = this.dependencies.forward.get(dependent);
        if (forward) {
          forward.delete(normalizedFile);
        }
      }
      this.dependencies.reverse.delete(normalizedFile);
    }
  }

  /**
   * Get statistics about the dependency graph
   */
  getStats(): {
    totalFiles: number;
    totalDependencies: number;
    averageDependencies: number;
    maxDependents: number;
    invalidationCount: number;
  } {
    const totalFiles = this.dependencies.forward.size;
    let totalDeps = 0;
    let maxDependents = 0;

    for (const deps of this.dependencies.forward.values()) {
      totalDeps += deps.size;
    }

    for (const dependents of this.dependencies.reverse.values()) {
      if (dependents.size > maxDependents) {
        maxDependents = dependents.size;
      }
    }

    return {
      totalFiles,
      totalDependencies: totalDeps,
      averageDependencies: totalFiles > 0 ? totalDeps / totalFiles : 0,
      maxDependents,
      invalidationCount: this.invalidationCount,
    };
  }

  /**
   * Clear all dependency tracking data
   */
  clear(): void {
    this.dependencies.forward.clear();
    this.dependencies.reverse.clear();
    this.invalidationCount = 0;
  }

  /**
   * Export the dependency map (for persistence)
   */
  export(): { forward: [string, string[]][]; reverse: [string, string[]][] } {
    return {
      forward: Array.from(this.dependencies.forward.entries()).map(([k, v]) => [k, Array.from(v)]),
      reverse: Array.from(this.dependencies.reverse.entries()).map(([k, v]) => [k, Array.from(v)]),
    };
  }

  /**
   * Import a dependency map (for restoration)
   */
  import(data: { forward: [string, string[]][]; reverse: [string, string[]][] }): void {
    this.dependencies.forward = new Map(
      data.forward.map(([k, v]) => [k, new Set(v)])
    );
    this.dependencies.reverse = new Map(
      data.reverse.map(([k, v]) => [k, new Set(v)])
    );
  }

  /**
   * Find circular dependencies
   */
  findCircularDependencies(): string[][] {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const cycles: string[][] = [];

    const dfs = (node: string, path: string[]): void => {
      visited.add(node);
      recursionStack.add(node);

      const deps = this.dependencies.forward.get(node);
      if (deps) {
        for (const dep of deps) {
          if (!visited.has(dep)) {
            dfs(dep, [...path, dep]);
          } else if (recursionStack.has(dep)) {
            // Found a cycle
            const cycleStart = path.indexOf(dep);
            if (cycleStart !== -1) {
              cycles.push(path.slice(cycleStart));
            }
          }
        }
      }

      recursionStack.delete(node);
    };

    for (const file of this.dependencies.forward.keys()) {
      if (!visited.has(file)) {
        dfs(file, [file]);
      }
    }

    return cycles;
  }

  private normalizePath(filePath: string): string {
    // Make path relative to base directory for consistency
    const absolute = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(this.baseDir, filePath);
    return path.normalize(absolute);
  }
}

/**
 * Create a dependency tracker instance
 */
export function createDependencyTracker(baseDir: string = process.cwd()): DependencyTracker {
  return new DependencyTracker({ baseDir });
}

/**
 * Extract imports from TypeScript/JavaScript source code
 * Simple regex-based extraction (for basic use cases)
 */
export function extractImports(sourceCode: string): string[] {
  const imports: string[] = [];
  
  // Match ES6 imports
  const es6ImportRegex = /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+)?['"]([^'"]+)['"]/g;
  let match;
  while ((match = es6ImportRegex.exec(sourceCode)) !== null) {
    imports.push(match[1]);
  }

  // Match CommonJS requires
  const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = requireRegex.exec(sourceCode)) !== null) {
    imports.push(match[1]);
  }

  // Match dynamic imports
  const dynamicImportRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = dynamicImportRegex.exec(sourceCode)) !== null) {
    imports.push(match[1]);
  }

  // Filter out node_modules and return unique imports
  return [...new Set(imports)].filter(
    (imp) => !imp.startsWith('node:') && !isNodeModule(imp)
  );
}

/**
 * Check if an import path is a node module (not a relative/absolute path)
 */
function isNodeModule(importPath: string): boolean {
  return (
    !importPath.startsWith('.') &&
    !importPath.startsWith('/') &&
    !importPath.startsWith('@/') &&
    !path.isAbsolute(importPath)
  );
}
