/**
 * Evidence Resolver
 * 
 * Resolves evidence for claims by querying multiple sources
 * (truthpack, filesystem, package.json, AST).
 * 
 * Features:
 * - Parallel evidence resolution
 * - Intelligent caching with TTL
 * - Multiple fallback sources
 * - Performance tracking
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';
import type { Claim, ClaimType } from './claim-extractor.js';
import { getLogger, type Logger } from '../utils/logger.js';
import { Cache } from '../utils/cache.js';
import { PerformanceTracker } from '../utils/performance.js';
import { withTimeout, withRetry } from '../utils/retry.js';
import { parallelLimit } from '../utils/performance.js';
import { wrapError, ResourceNotFoundError } from '../utils/errors.js';

export type EvidenceSource = 'truthpack' | 'filesystem' | 'package_json' | 'ast' | 'git';

export interface Evidence {
  claimId: string;
  found: boolean;
  source: EvidenceSource;
  location?: {
    file: string;
    line?: number;
  };
  confidence: number;
  details: Record<string, unknown>;
  resolvedAt?: number;
  cacheHit?: boolean;
}

export interface ResolverConfig {
  sources: EvidenceSource[];
  truthpackPath: string;
  projectRoot: string;
  timeout: number;
  enableCaching: boolean;
  cacheTtlMs: number;
  parallelLimit: number;
  maxFileSize: number;
}

const DEFAULT_CONFIG: ResolverConfig = {
  sources: ['truthpack', 'filesystem', 'package_json', 'ast'],
  truthpackPath: '.vibecheck/truthpack',
  projectRoot: process.cwd(),
  timeout: 5000,
  enableCaching: true,
  cacheTtlMs: 5 * 60 * 1000, // 5 minutes
  parallelLimit: 10,
  maxFileSize: 1024 * 1024, // 1MB
};

// Cache for loaded truthpack data
interface TruthpackCache {
  routes?: { routes: Array<{ path: string; method: string; file: string; line: number }> };
  env?: { variables: Array<{ name: string; usedIn?: Array<{ file: string; line: number }> }> };
  contracts?: { contracts: Array<{ path: string; method: string }> };
  auth?: { protectedResources: Array<{ path: string; method?: string; requiredRoles: string[] }> };
  loadedAt?: number;
}

// Node.js built-in modules
const BUILTIN_MODULES = new Set([
  'fs', 'path', 'os', 'crypto', 'http', 'https', 'url', 'util',
  'stream', 'buffer', 'events', 'child_process', 'cluster',
  'dns', 'net', 'readline', 'tls', 'zlib', 'assert', 'async_hooks',
  'fs/promises', 'path/posix', 'path/win32', 'querystring',
  'timers', 'timers/promises', 'perf_hooks', 'worker_threads',
  'v8', 'vm', 'inspector', 'trace_events', 'string_decoder',
]);

export class EvidenceResolver {
  private config: ResolverConfig;
  private truthpackCache: TruthpackCache = {};
  private packageJsonCache: Record<string, unknown> | null = null;
  private evidenceCache: Cache<Evidence>;
  private fileExistsCache: Cache<boolean>;
  private logger: Logger;
  private performanceTracker: PerformanceTracker;

  constructor(config: Partial<ResolverConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = getLogger('evidence-resolver');
    this.performanceTracker = new PerformanceTracker();
    
    this.evidenceCache = new Cache<Evidence>({
      maxSize: 1000,
      defaultTtlMs: this.config.cacheTtlMs,
    });
    
    this.fileExistsCache = new Cache<boolean>({
      maxSize: 500,
      defaultTtlMs: 30000, // 30 seconds for file existence
    });
  }

  /**
   * Resolve evidence for a single claim
   */
  async resolve(claim: Claim): Promise<Evidence> {
    const cacheKey = this.getCacheKey(claim);
    
    // Check cache first
    if (this.config.enableCaching) {
      const cached = this.evidenceCache.get(cacheKey);
      if (cached) {
        this.logger.debug('Evidence cache hit', { claimId: claim.id, type: claim.type });
        return { ...cached, cacheHit: true };
      }
    }

    const resolvers = this.getResolversForType(claim.type);
    const startTime = performance.now();

    for (const resolver of resolvers) {
      try {
        const evidence = await withTimeout(
          () => resolver(claim),
          this.config.timeout,
          { component: 'EvidenceResolver', operation: 'resolve' }
        );
        
        if (evidence.found) {
          evidence.resolvedAt = Date.now();
          
          // Cache successful resolution
          if (this.config.enableCaching) {
            this.evidenceCache.set(cacheKey, evidence);
          }
          
          this.logger.debug('Evidence found', {
            claimId: claim.id,
            source: evidence.source,
            durationMs: Math.round(performance.now() - startTime),
          });
          
          return evidence;
        }
      } catch (error) {
        this.logger.debug('Resolver failed, trying next', {
          claimId: claim.id,
          resolver: resolver.name,
          error: error instanceof Error ? error.message : 'Unknown',
        });
        // Continue to next resolver if one fails
      }
    }

    const notFoundEvidence = this.createNotFoundEvidence(claim);
    notFoundEvidence.resolvedAt = Date.now();
    
    this.logger.debug('Evidence not found', {
      claimId: claim.id,
      type: claim.type,
      value: claim.value.slice(0, 50),
    });
    
    return notFoundEvidence;
  }

  /**
   * Resolve evidence for multiple claims in parallel
   */
  async resolveAll(claims: Claim[]): Promise<Evidence[]> {
    if (claims.length === 0) return [];

    const startTime = performance.now();
    
    this.logger.debug('Resolving evidence for claims', { count: claims.length });

    // Resolve in parallel with concurrency limit
    const results = await parallelLimit(
      claims,
      this.config.parallelLimit,
      async (claim) => {
        try {
          return await this.resolve(claim);
        } catch (error) {
          this.logger.warn('Failed to resolve claim', {
            claimId: claim.id,
            error: error instanceof Error ? error.message : 'Unknown',
          });
          return this.createNotFoundEvidence(claim);
        }
      }
    );

    const durationMs = performance.now() - startTime;
    const foundCount = results.filter(e => e.found).length;
    
    this.logger.info('Evidence resolution complete', {
      total: claims.length,
      found: foundCount,
      notFound: claims.length - foundCount,
      durationMs: Math.round(durationMs),
    });

    this.performanceTracker.record('resolveAll', durationMs);
    
    return results;
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.truthpackCache = {};
    this.packageJsonCache = null;
    this.evidenceCache.clear();
    this.fileExistsCache.clear();
    this.logger.debug('Caches cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    evidence: { size: number; hitRate: number };
    fileExists: { size: number; hitRate: number };
  } {
    const evidenceStats = this.evidenceCache.getStats();
    const fileStats = this.fileExistsCache.getStats();
    
    return {
      evidence: { size: evidenceStats.size, hitRate: evidenceStats.hitRate },
      fileExists: { size: fileStats.size, hitRate: fileStats.hitRate },
    };
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): Record<string, unknown> {
    return this.performanceTracker.export();
  }

  private getCacheKey(claim: Claim): string {
    return `${claim.type}:${claim.value}`;
  }

  private getResolversForType(type: ClaimType): Array<(claim: Claim) => Promise<Evidence>> {
    const resolverMap: Record<ClaimType, Array<(claim: Claim) => Promise<Evidence>>> = {
      import: [
        this.resolveFromPackageJson.bind(this),
        this.resolveFromFilesystem.bind(this),
      ],
      function_call: [
        this.resolveFromTruthpack.bind(this),
        this.resolveFromAst.bind(this),
      ],
      type_reference: [
        this.resolveFromTruthpack.bind(this),
        this.resolveFromAst.bind(this),
      ],
      api_endpoint: [
        this.resolveFromTruthpack.bind(this),
      ],
      env_variable: [
        this.resolveFromTruthpack.bind(this),
        this.resolveFromFilesystem.bind(this),
      ],
      file_reference: [
        this.resolveFromFilesystem.bind(this),
      ],
      package_dependency: [
        this.resolveFromPackageJson.bind(this),
      ],
    };

    return resolverMap[type] ?? [];
  }

  /**
   * Load a truthpack file with caching and retry
   */
  private async loadTruthpack<T>(name: string): Promise<T | null> {
    const filePath = path.join(this.config.projectRoot, this.config.truthpackPath, `${name}.json`);
    
    try {
      return await withRetry(
        async () => {
          const content = await fs.readFile(filePath, 'utf-8');
          return JSON.parse(content) as T;
        },
        { maxAttempts: 2, initialDelayMs: 50 }
      );
    } catch {
      return null;
    }
  }

  /**
   * Resolve claim from truthpack data
   */
  private async resolveFromTruthpack(claim: Claim): Promise<Evidence> {
    // Check if truthpack is stale (reload after 5 minutes)
    const now = Date.now();
    if (this.truthpackCache.loadedAt && now - this.truthpackCache.loadedAt > 5 * 60 * 1000) {
      this.truthpackCache = {};
    }

    switch (claim.type) {
      case 'api_endpoint':
        return this.resolveApiEndpointFromTruthpack(claim);
      case 'env_variable':
        return this.resolveEnvFromTruthpack(claim);
      case 'function_call':
      case 'type_reference':
        return this.resolveDefinitionFromTruthpack(claim);
      default:
        return this.createNotFoundEvidence(claim);
    }
  }

  /**
   * Resolve API endpoint from routes truthpack
   */
  private async resolveApiEndpointFromTruthpack(claim: Claim): Promise<Evidence> {
    if (!this.truthpackCache.routes) {
      this.truthpackCache.routes = await this.loadTruthpack<TruthpackCache['routes']>('routes') ?? undefined;
      this.truthpackCache.loadedAt = Date.now();
    }

    const routes = this.truthpackCache.routes;
    if (!routes?.routes || routes.routes.length === 0) {
      return this.createNotFoundEvidence(claim);
    }

    const claimedPath = claim.value;

    // Check for exact match or parameterized match
    for (const route of routes.routes) {
      if (this.pathsMatch(claimedPath, route.path)) {
        return {
          claimId: claim.id,
          found: true,
          source: 'truthpack',
          location: {
            file: route.file,
            line: route.line,
          },
          confidence: 1.0,
          details: {
            matchedRoute: route.path,
            method: route.method,
            exactMatch: claimedPath === route.path,
          },
        };
      }
    }

    return this.createNotFoundEvidence(claim);
  }

  /**
   * Check if two paths match (handling route parameters)
   */
  private pathsMatch(claimed: string, defined: string): boolean {
    // Exact match
    if (claimed === defined) return true;

    // Normalize paths
    const claimedParts = claimed.split('/').filter(Boolean);
    const definedParts = defined.split('/').filter(Boolean);

    if (claimedParts.length !== definedParts.length) return false;

    for (let i = 0; i < claimedParts.length; i++) {
      const c = claimedParts[i];
      const d = definedParts[i];

      // If defined part is a parameter (e.g., :id, [id], {id}), it matches any value
      if (d.startsWith(':') || d.startsWith('[') || d.startsWith('{')) continue;
      
      // Check for wildcard segments
      if (d === '*' || d === '**') continue;
      
      if (c !== d) return false;
    }

    return true;
  }

  /**
   * Resolve environment variable from truthpack
   */
  private async resolveEnvFromTruthpack(claim: Claim): Promise<Evidence> {
    if (!this.truthpackCache.env) {
      this.truthpackCache.env = await this.loadTruthpack<TruthpackCache['env']>('env') ?? undefined;
    }

    const env = this.truthpackCache.env;
    if (!env?.variables) {
      return this.createNotFoundEvidence(claim);
    }

    // Normalize variable name (remove process.env. prefix if present)
    const varName = claim.value.replace(/^process\.env\./, '');
    
    const variable = env.variables.find(v => v.name === varName);
    if (variable) {
      const location = variable.usedIn?.[0];
      return {
        claimId: claim.id,
        found: true,
        source: 'truthpack',
        location: location ? { file: location.file, line: location.line } : undefined,
        confidence: 1.0,
        details: {
          variableName: variable.name,
          usageCount: variable.usedIn?.length ?? 0,
        },
      };
    }

    return this.createNotFoundEvidence(claim);
  }

  /**
   * Resolve function/type definition from truthpack contracts
   */
  private async resolveDefinitionFromTruthpack(claim: Claim): Promise<Evidence> {
    if (!this.truthpackCache.contracts) {
      this.truthpackCache.contracts = await this.loadTruthpack<TruthpackCache['contracts']>('contracts') ?? undefined;
    }

    // For now, return not found - would need more sophisticated analysis
    return this.createNotFoundEvidence(claim);
  }

  /**
   * Resolve claim from filesystem
   */
  private async resolveFromFilesystem(claim: Claim): Promise<Evidence> {
    switch (claim.type) {
      case 'file_reference':
        return this.resolveFileReference(claim);
      case 'import':
        return this.resolveImportFromFilesystem(claim);
      case 'env_variable':
        return this.resolveEnvFromFilesystem(claim);
      default:
        return this.createNotFoundEvidence(claim);
    }
  }

  /**
   * Check if a file exists with caching
   */
  private async fileExists(filePath: string): Promise<boolean> {
    // Check cache
    const cached = this.fileExistsCache.get(filePath);
    if (cached !== undefined) return cached;

    try {
      await fs.access(filePath);
      this.fileExistsCache.set(filePath, true);
      return true;
    } catch {
      this.fileExistsCache.set(filePath, false);
      return false;
    }
  }

  /**
   * Resolve file reference by checking existence
   */
  private async resolveFileReference(claim: Claim): Promise<Evidence> {
    const filePath = path.resolve(this.config.projectRoot, claim.value);

    if (await this.fileExists(filePath)) {
      return {
        claimId: claim.id,
        found: true,
        source: 'filesystem',
        location: { file: claim.value },
        confidence: 1.0,
        details: { resolvedPath: filePath },
      };
    }

    // Try with common extensions if no extension provided
    if (!path.extname(claim.value)) {
      const extensions = ['.ts', '.tsx', '.js', '.jsx', '.json', '.mjs', '.cjs'];
      for (const ext of extensions) {
        const fullPath = filePath + ext;
        if (await this.fileExists(fullPath)) {
          return {
            claimId: claim.id,
            found: true,
            source: 'filesystem',
            location: { file: claim.value + ext },
            confidence: 0.9,
            details: { resolvedPath: fullPath, addedExtension: ext },
          };
        }
      }

      // Also try index files
      const indexExtensions = ['/index.ts', '/index.tsx', '/index.js', '/index.jsx'];
      for (const ext of indexExtensions) {
        const fullPath = filePath + ext;
        if (await this.fileExists(fullPath)) {
          return {
            claimId: claim.id,
            found: true,
            source: 'filesystem',
            location: { file: claim.value + ext },
            confidence: 0.85,
            details: { resolvedPath: fullPath, addedIndex: ext },
          };
        }
      }
    }

    return this.createNotFoundEvidence(claim);
  }

  /**
   * Resolve import from filesystem (for relative imports)
   */
  private async resolveImportFromFilesystem(claim: Claim): Promise<Evidence> {
    const importPath = claim.value;

    // Only handle relative imports
    if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
      return this.createNotFoundEvidence(claim);
    }

    const basePath = path.resolve(this.config.projectRoot, importPath);
    const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '/index.ts', '/index.tsx', '/index.js', '/index.jsx'];

    for (const ext of extensions) {
      const fullPath = basePath + ext;
      if (await this.fileExists(fullPath)) {
        return {
          claimId: claim.id,
          found: true,
          source: 'filesystem',
          location: { file: importPath + ext },
          confidence: 1.0,
          details: { resolvedPath: fullPath },
        };
      }
    }

    return this.createNotFoundEvidence(claim);
  }

  /**
   * Resolve environment variable from .env files
   */
  private async resolveEnvFromFilesystem(claim: Claim): Promise<Evidence> {
    const envFiles = ['.env', '.env.local', '.env.development', '.env.production', '.env.example', '.env.test'];
    const varName = claim.value.replace(/^process\.env\./, '');

    for (const envFile of envFiles) {
      const filePath = path.join(this.config.projectRoot, envFile);
      
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          
          // Skip comments
          if (line.startsWith('#')) continue;
          
          // Match variable definition
          const match = line.match(new RegExp(`^${varName}\\s*=`));
          if (match) {
            return {
              claimId: claim.id,
              found: true,
              source: 'filesystem',
              location: { file: envFile, line: i + 1 },
              confidence: 1.0,
              details: { foundIn: envFile, isExample: envFile.includes('example') },
            };
          }
        }
      } catch {
        continue;
      }
    }

    return this.createNotFoundEvidence(claim);
  }

  /**
   * Resolve claim from package.json
   */
  private async resolveFromPackageJson(claim: Claim): Promise<Evidence> {
    if (!this.packageJsonCache) {
      try {
        const content = await fs.readFile(
          path.join(this.config.projectRoot, 'package.json'),
          'utf-8'
        );
        this.packageJsonCache = JSON.parse(content);
      } catch {
        return this.createNotFoundEvidence(claim);
      }
    }

    const pkg = this.packageJsonCache as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };

    // Extract package name (handle scoped packages and subpaths)
    let packageName = claim.value;

    // Handle node: protocol
    if (packageName.startsWith('node:')) {
      packageName = packageName.slice(5);
    }

    // Handle subpath imports like 'lodash/get' -> 'lodash'
    if (!packageName.startsWith('@')) {
      packageName = packageName.split('/')[0];
    } else {
      // Scoped package: @scope/package/subpath -> @scope/package
      const parts = packageName.split('/');
      packageName = parts.slice(0, 2).join('/');
    }

    // Check if it's a Node.js built-in module
    if (BUILTIN_MODULES.has(packageName)) {
      return {
        claimId: claim.id,
        found: true,
        source: 'package_json',
        confidence: 1.0,
        details: {
          packageName,
          isBuiltin: true,
          originalImport: claim.value,
        },
      };
    }

    // Check in dependencies
    const allDeps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
      ...pkg.peerDependencies,
    };

    if (packageName in allDeps) {
      const version = allDeps[packageName];
      const depType = pkg.dependencies?.[packageName]
        ? 'dependencies'
        : pkg.devDependencies?.[packageName]
          ? 'devDependencies'
          : 'peerDependencies';

      return {
        claimId: claim.id,
        found: true,
        source: 'package_json',
        location: { file: 'package.json' },
        confidence: 1.0,
        details: {
          packageName,
          version,
          dependencyType: depType,
          originalImport: claim.value,
        },
      };
    }

    return this.createNotFoundEvidence(claim);
  }

  /**
   * Resolve claim using AST analysis
   */
  private async resolveFromAst(claim: Claim): Promise<Evidence> {
    const searchPatterns = this.getSearchPatternsForClaim(claim);
    if (searchPatterns.length === 0) {
      return this.createNotFoundEvidence(claim);
    }

    try {
      // Find TypeScript/JavaScript files
      const files = await glob('**/*.{ts,tsx,js,jsx}', {
        cwd: this.config.projectRoot,
        ignore: ['node_modules/**', 'dist/**', 'build/**', '.next/**', 'coverage/**'],
        absolute: true,
      });

      // Limit files to search for performance
      const filesToSearch = files.slice(0, 500);

      for (const filePath of filesToSearch) {
        try {
          // Check file size before reading
          const stat = await fs.stat(filePath);
          if (stat.size > this.config.maxFileSize) continue;

          const content = await fs.readFile(filePath, 'utf-8');
          const lines = content.split('\n');

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            for (const pattern of searchPatterns) {
              if (pattern.test(line)) {
                return {
                  claimId: claim.id,
                  found: true,
                  source: 'ast',
                  location: {
                    file: path.relative(this.config.projectRoot, filePath),
                    line: i + 1,
                  },
                  confidence: 0.9,
                  details: {
                    matchedLine: line.trim().slice(0, 100),
                    searchedValue: claim.value,
                  },
                };
              }
            }
          }
        } catch {
          continue;
        }
      }
    } catch (error) {
      this.logger.debug('AST search failed', { error: error instanceof Error ? error.message : 'Unknown' });
    }

    return this.createNotFoundEvidence(claim);
  }

  /**
   * Get regex patterns to search for a claim
   */
  private getSearchPatternsForClaim(claim: Claim): RegExp[] {
    const value = claim.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // Escape regex

    switch (claim.type) {
      case 'function_call':
        return [
          new RegExp(`function\\s+${value}\\s*\\(`),
          new RegExp(`const\\s+${value}\\s*=\\s*(?:async\\s+)?(?:function|\\()`),
          new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${value}`),
          new RegExp(`${value}\\s*:\\s*(?:async\\s+)?\\([^)]*\\)\\s*=>`),
          new RegExp(`(?:export\\s+)?const\\s+${value}\\s*=\\s*\\(`),
        ];
      case 'type_reference':
        return [
          new RegExp(`(?:interface|type|class|enum)\\s+${value}\\b`),
          new RegExp(`export\\s+(?:interface|type|class|enum)\\s+${value}\\b`),
        ];
      default:
        return [];
    }
  }

  private createNotFoundEvidence(claim: Claim): Evidence {
    return {
      claimId: claim.id,
      found: false,
      source: 'truthpack',
      confidence: 0,
      details: {
        searchedValue: claim.value,
        searchedType: claim.type,
      },
    };
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.evidenceCache.dispose();
    this.fileExistsCache.dispose();
  }
}
