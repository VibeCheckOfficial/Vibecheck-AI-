/**
 * Dependency Check Hook
 * 
 * Checks for dependency issues, vulnerabilities, and compatibility.
 * Validates that imports match package.json and checks for security issues.
 * 
 * @module core/hooks/dependency-check-hook
 * 
 * @example
 * ```ts
 * const hook = new DependencyCheckHook({
 *   projectRoot: '/path/to/project',
 *   checkUnused: true,
 *   checkMissing: true,
 *   checkSecurity: true,
 * });
 * 
 * const result = await hook.execute();
 * if (!result.passed) {
 *   console.log('Dependency issues found:', result.issues);
 * }
 * ```
 */

import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Result returned by the dependency check hook.
 */
export interface DependencyCheckResult {
  /** Whether the check passed without errors */
  passed: boolean;
  /** List of dependency issues found */
  issues: DependencyIssue[];
  /** Summary of dependencies */
  dependencies: DependencySummary;
  /** Recommendations for fixing issues */
  recommendations: string[];
  /** Time taken for check in milliseconds */
  duration: number;
}

/**
 * A dependency issue found during the check.
 */
export interface DependencyIssue {
  /** Severity level of the issue */
  severity: 'error' | 'warning' | 'info';
  /** Type of dependency issue */
  type: 'missing' | 'unused' | 'outdated' | 'security' | 'conflict';
  /** Package name */
  package: string;
  /** Human-readable issue message */
  message: string;
  /** Suggested fix for the issue */
  suggestion?: string;
}

/**
 * Summary of project dependencies.
 */
export interface DependencySummary {
  /** Total number of dependencies */
  total: number;
  /** Number of production dependencies */
  production: number;
  /** Number of development dependencies */
  development: number;
  /** List of unused dependencies */
  unused: string[];
  /** List of missing dependencies */
  missing: string[];
}

/**
 * Configuration options for the DependencyCheckHook.
 */
export interface DependencyCheckConfig {
  /** Root directory of the project */
  projectRoot: string;
  /** Whether to check for unused dependencies */
  checkUnused: boolean;
  /** Whether to check for missing dependencies */
  checkMissing: boolean;
  /** Whether to check for security vulnerabilities */
  checkSecurity: boolean;
  /** List of known vulnerable packages */
  knownVulnerable: string[];
}

const DEFAULT_CONFIG: DependencyCheckConfig = {
  projectRoot: process.cwd(),
  checkUnused: true,
  checkMissing: true,
  checkSecurity: true,
  knownVulnerable: [
    'event-stream@3.3.6',
    'flatmap-stream',
    'ua-parser-js@0.7.29',
  ],
};

// Common Node.js builtins
const BUILTINS = new Set([
  'fs', 'path', 'os', 'crypto', 'http', 'https', 'url', 'util',
  'stream', 'events', 'buffer', 'child_process', 'cluster', 'net',
  'dns', 'tls', 'zlib', 'readline', 'assert', 'fs/promises',
  'node:fs', 'node:path', 'node:crypto', 'node:util', 'node:events',
]);

/**
 * Hook that checks for dependency issues.
 * Validates imports, checks for unused packages, and scans for vulnerabilities.
 */
export class DependencyCheckHook {
  private config: DependencyCheckConfig;

  /**
   * Creates a new DependencyCheckHook instance.
   * 
   * @param config - Configuration options (merged with defaults)
   */
  constructor(config: Partial<DependencyCheckConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Execute the dependency check.
   * Scans the codebase and validates against package.json.
   * 
   * @returns Check result with issues and recommendations
   */
  async execute(): Promise<DependencyCheckResult> {
    const startTime = Date.now();
    const issues: DependencyIssue[] = [];
    const recommendations: string[] = [];

    // Load package.json
    const pkg = await this.loadPackageJson();
    if (!pkg) {
      return {
        passed: false,
        issues: [{
          severity: 'error',
          type: 'missing',
          package: 'package.json',
          message: 'package.json not found',
        }],
        dependencies: {
          total: 0,
          production: 0,
          development: 0,
          unused: [],
          missing: [],
        },
        recommendations: ['Create a package.json file'],
        duration: Date.now() - startTime,
      };
    }

    const deps = pkg.dependencies || {};
    const devDeps = pkg.devDependencies || {};
    const allDeps = new Set([...Object.keys(deps), ...Object.keys(devDeps)]);

    // Find used imports in codebase
    const usedImports = await this.findUsedImports();

    // Check for missing dependencies
    if (this.config.checkMissing) {
      const missing = this.findMissingDependencies(usedImports, allDeps);
      for (const pkg of missing) {
        issues.push({
          severity: 'error',
          type: 'missing',
          package: pkg,
          message: `Package "${pkg}" is used but not in package.json`,
          suggestion: `Run: pnpm add ${pkg}`,
        });
      }
    }

    // Check for unused dependencies
    if (this.config.checkUnused) {
      const unused = this.findUnusedDependencies(usedImports, allDeps);
      for (const pkg of unused) {
        issues.push({
          severity: 'info',
          type: 'unused',
          package: pkg,
          message: `Package "${pkg}" appears unused`,
          suggestion: `Consider removing: pnpm remove ${pkg}`,
        });
      }
    }

    // Check for known vulnerable packages
    if (this.config.checkSecurity) {
      for (const dep of Object.keys(deps)) {
        const version = deps[dep];
        const withVersion = `${dep}@${version.replace(/^[\^~]/, '')}`;
        
        if (this.config.knownVulnerable.includes(dep) || 
            this.config.knownVulnerable.includes(withVersion)) {
          issues.push({
            severity: 'error',
            type: 'security',
            package: dep,
            message: `Package "${dep}" has known vulnerabilities`,
            suggestion: `Update or replace this package`,
          });
        }
      }
    }

    // Generate summary
    const summary: DependencySummary = {
      total: allDeps.size,
      production: Object.keys(deps).length,
      development: Object.keys(devDeps).length,
      unused: issues.filter(i => i.type === 'unused').map(i => i.package),
      missing: issues.filter(i => i.type === 'missing').map(i => i.package),
    };

    // Add recommendations
    if (summary.unused.length > 5) {
      recommendations.push('Consider auditing dependencies - many appear unused');
    }
    if (summary.missing.length > 0) {
      recommendations.push(`Install missing packages: pnpm add ${summary.missing.join(' ')}`);
    }

    const errorCount = issues.filter(i => i.severity === 'error').length;

    return {
      passed: errorCount === 0,
      issues,
      dependencies: summary,
      recommendations,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Load and parse the project's package.json.
   * 
   * @returns Parsed package.json or null if not found
   */
  private async loadPackageJson(): Promise<{
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  } | null> {
    try {
      const pkgPath = path.join(this.config.projectRoot, 'package.json');
      const content = await fs.readFile(pkgPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  /**
   * Find all imports used in the codebase.
   * Scans src directory and root-level files.
   * 
   * @returns Set of package names that are imported
   */
  private async findUsedImports(): Promise<Set<string>> {
    const imports = new Set<string>();
    const srcDir = path.join(this.config.projectRoot, 'src');

    try {
      await this.scanDirectoryForImports(srcDir, imports);
    } catch {
      // src directory might not exist
    }

    // Also check root-level files
    try {
      const files = await fs.readdir(this.config.projectRoot);
      for (const file of files) {
        if (/\.(ts|tsx|js|jsx|mjs)$/.test(file)) {
          const filePath = path.join(this.config.projectRoot, file);
          await this.extractImports(filePath, imports);
        }
      }
    } catch {
      // Ignore errors
    }

    return imports;
  }

  /**
   * Recursively scan a directory for imports.
   * 
   * @param dir - Directory path to scan
   * @param imports - Set to collect found imports
   */
  private async scanDirectoryForImports(dir: string, imports: Set<string>): Promise<void> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          await this.scanDirectoryForImports(fullPath, imports);
        } else if (entry.isFile() && /\.(ts|tsx|js|jsx|mjs)$/.test(entry.name)) {
          await this.extractImports(fullPath, imports);
        }
      }
    } catch {
      // Directory doesn't exist or can't be read
    }
  }

  /**
   * Extract import statements from a file.
   * 
   * @param filePath - Path to the file to scan
   * @param imports - Set to collect found imports
   */
  private async extractImports(filePath: string, imports: Set<string>): Promise<void> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      
      // Match import statements
      const importPattern = /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+)?['"]([^'"]+)['"]/g;
      const requirePattern = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

      let match;
      
      while ((match = importPattern.exec(content)) !== null) {
        const importPath = match[1];
        const packageName = this.getPackageName(importPath);
        if (packageName) {
          imports.add(packageName);
        }
      }

      while ((match = requirePattern.exec(content)) !== null) {
        const importPath = match[1];
        const packageName = this.getPackageName(importPath);
        if (packageName) {
          imports.add(packageName);
        }
      }
    } catch {
      // File can't be read
    }
  }

  /**
   * Extract package name from an import path.
   * Handles scoped packages and relative imports.
   * 
   * @param importPath - The import path to parse
   * @returns Package name or null if not a package import
   */
  private getPackageName(importPath: string): string | null {
    // Skip relative imports
    if (importPath.startsWith('.') || importPath.startsWith('/')) {
      return null;
    }

    // Skip Node.js builtins
    if (BUILTINS.has(importPath) || importPath.startsWith('node:')) {
      return null;
    }

    // Handle scoped packages
    if (importPath.startsWith('@')) {
      const parts = importPath.split('/');
      return parts.slice(0, 2).join('/');
    }

    // Regular package
    return importPath.split('/')[0];
  }

  /**
   * Find dependencies that are used but not declared.
   * 
   * @param used - Set of used package names
   * @param declared - Set of declared package names
   * @returns Array of missing package names
   */
  private findMissingDependencies(used: Set<string>, declared: Set<string>): string[] {
    const missing: string[] = [];

    for (const pkg of used) {
      if (!declared.has(pkg) && !this.isTypePackage(pkg)) {
        missing.push(pkg);
      }
    }

    return missing;
  }

  /**
   * Find dependencies that are declared but not used.
   * 
   * @param used - Set of used package names
   * @param declared - Set of declared package names
   * @returns Array of unused package names
   */
  private findUnusedDependencies(used: Set<string>, declared: Set<string>): string[] {
    const unused: string[] = [];

    // Packages that are commonly used indirectly
    const indirectlyUsed = new Set([
      'typescript', 'eslint', 'prettier', 'jest', 'vitest',
      '@types/node', '@types/react', '@types/jest',
      'tslib', 'esbuild', 'vite', 'webpack',
    ]);

    for (const pkg of declared) {
      if (!used.has(pkg) && 
          !indirectlyUsed.has(pkg) && 
          !pkg.startsWith('@types/')) {
        unused.push(pkg);
      }
    }

    return unused;
  }

  /**
   * Check if a package is a TypeScript type package.
   * 
   * @param pkg - Package name to check
   * @returns True if package is a @types/ package
   */
  private isTypePackage(pkg: string): boolean {
    return pkg.startsWith('@types/');
  }
}
