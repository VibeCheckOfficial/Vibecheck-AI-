/**
 * Hallucination Detector
 * 
 * Detects potential hallucinations in AI-generated content
 * by comparing against known ground truth.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { generateFindingId } from '../utils/deterministic-ids.js';
import { sortFindings } from '../utils/stable-sort.js';

export interface HallucinationCandidate {
  id: string;  // Stable finding ID
  ruleId: string;  // Rule that generated this finding
  type: 'api' | 'import' | 'type' | 'function' | 'file' | 'config' | 'env';
  value: string;
  confidence: number;
  location: {
    file: string;
    line: number;
    column: number;
  };
  reason: string;
}

export interface HallucinationReport {
  candidates: HallucinationCandidate[];
  score: number; // 0-1, where 0 is no hallucinations
  summary: {
    total: number;
    byType: Record<string, number>;
    highConfidence: number;
  };
  passed: boolean;
}

export interface DetectorConfig {
  strictness: 'low' | 'medium' | 'high';
  truthpackPath: string;
  projectRoot: string;
}

interface TruthpackRoutes {
  routes: Array<{ method: string; path: string }>;
}

interface TruthpackEnv {
  variables: Array<{ name: string }>;
}

interface TruthpackContracts {
  contracts: Array<{ path: string; method?: string }>;
}

const DEFAULT_CONFIG: DetectorConfig = {
  strictness: 'medium',
  truthpackPath: '.vibecheck/truthpack',
  projectRoot: process.cwd(),
};

// Built-in types that are always valid
const BUILTIN_TYPES = new Set([
  'string', 'number', 'boolean', 'void', 'null', 'undefined',
  'any', 'unknown', 'never', 'object', 'symbol', 'bigint',
  'Array', 'Object', 'String', 'Number', 'Boolean', 'Function',
  'Promise', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Date', 'Error',
  'RegExp', 'JSON', 'Math', 'Record', 'Partial', 'Required',
  'Pick', 'Omit', 'Exclude', 'Extract', 'NonNullable', 'ReturnType',
  'Parameters', 'Awaited', 'ReadonlyArray', 'Readonly',
  'Request', 'Response', 'Headers', 'URL', 'URLSearchParams',
  'Event', 'EventTarget', 'HTMLElement', 'Document', 'Window',
]);

// Well-known env vars
const WELLKNOWN_ENV = new Set([
  'NODE_ENV', 'PORT', 'HOST', 'DEBUG', 'TZ', 'PATH', 'HOME',
  'CI', 'VERCEL', 'NETLIFY', 'AWS_REGION',
]);

export class HallucinationDetector {
  private config: DetectorConfig;
  private routesCache: TruthpackRoutes | null = null;
  private envCache: TruthpackEnv | null = null;
  private contractsCache: TruthpackContracts | null = null;
  private packageJsonCache: Record<string, unknown> | null = null;

  constructor(config: Partial<DetectorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Load truthpack data
   */
  private async loadTruthpack<T>(name: string): Promise<T | null> {
    const filePath = path.join(this.config.projectRoot, this.config.truthpackPath, `${name}.json`);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as T;
    } catch {
      return null;
    }
  }

  /**
   * Load package.json
   */
  private async loadPackageJson(): Promise<Record<string, unknown>> {
    if (this.packageJsonCache) return this.packageJsonCache;
    
    try {
      const content = await fs.readFile(
        path.join(this.config.projectRoot, 'package.json'),
        'utf-8'
      );
      this.packageJsonCache = JSON.parse(content);
    } catch {
      this.packageJsonCache = {};
    }
    return this.packageJsonCache;
  }

  /**
   * Get line and column from content position
   */
  private getLocation(content: string, index: number, filePath: string): HallucinationCandidate['location'] {
    const lines = content.slice(0, index).split('\n');
    return {
      file: filePath,
      line: lines.length,
      column: (lines[lines.length - 1]?.length || 0) + 1,
    };
  }

  /**
   * Detect hallucinations in content
   */
  async detect(content: string, filePath: string): Promise<HallucinationReport> {
    const candidates: HallucinationCandidate[] = [];

    // Run all detections in parallel
    const [apiCandidates, importCandidates, typeCandidates, envCandidates] = await Promise.all([
      this.detectApiHallucinations(content, filePath),
      this.detectImportHallucinations(content, filePath),
      this.detectTypeHallucinations(content, filePath),
      this.detectEnvHallucinations(content, filePath),
    ]);

    candidates.push(...apiCandidates, ...importCandidates, ...typeCandidates, ...envCandidates);

    // Sort candidates for deterministic output
    const sortedCandidates = sortFindings(candidates);

    return this.generateReport(sortedCandidates);
  }

  /**
   * Quick check for obvious hallucinations
   */
  async quickCheck(content: string): Promise<boolean> {
    // Check for common hallucination patterns
    const suspiciousPatterns = [
      /process\.env\.\w{25,}/g, // Suspiciously long env vars
      /\/api\/v\d+(?:\/[a-z]+){5,}/g, // Overly nested API paths
      /from ['"]@[a-z]{20,}\//g, // Suspiciously long scoped package names
      /\.(fetchData|getData|sendRequest)\(\)/g, // Common hallucinated method names
    ];

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(content)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Detect API endpoint hallucinations
   */
  private async detectApiHallucinations(
    content: string,
    filePath: string
  ): Promise<HallucinationCandidate[]> {
    const candidates: HallucinationCandidate[] = [];
    
    // Load routes truthpack
    if (!this.routesCache) {
      this.routesCache = await this.loadTruthpack<TruthpackRoutes>('routes');
    }
    
    const routes = this.routesCache?.routes || [];
    const routePaths = new Set(routes.map(r => this.normalizePath(r.path)));

    // Find API endpoint references
    const apiPatterns = [
      /fetch\s*\(\s*['"`](\/api\/[^'"`]+)['"`]/g,
      /['"`](\/api\/[^'"`]+)['"`]/g,
      /axios\.\w+\s*\(\s*['"`](\/api\/[^'"`]+)['"`]/g,
    ];

    for (const pattern of apiPatterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const endpoint = match[1];
        const normalizedEndpoint = this.normalizePath(endpoint);
        
        // Check if endpoint exists in truthpack
        const exists = this.matchesRoute(normalizedEndpoint, routes);
        
        if (!exists) {
          const location = this.getLocation(content, match.index, filePath);
          candidates.push({
            id: generateFindingId('ghost-route', location.file, location.line, location.column, endpoint),
            ruleId: 'ghost-route',
            type: 'api',
            value: endpoint,
            confidence: this.getConfidenceForStrictness(0.9),
            location,
            reason: `GHOST ROUTE: Endpoint "${endpoint}" not found in truthpack`,
          });
        }
      }
    }

    return candidates;
  }

  /**
   * Check if path matches any route (including parameterized routes)
   */
  private matchesRoute(claimed: string, routes: Array<{ method: string; path: string }>): boolean {
    for (const route of routes) {
      if (this.pathsMatch(claimed, route.path)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Normalize API path
   */
  private normalizePath(urlPath: string): string {
    return urlPath.split('?')[0].replace(/\/+/g, '/').replace(/\/$/, '');
  }

  /**
   * Check if paths match (handling parameters)
   */
  private pathsMatch(claimed: string, defined: string): boolean {
    const claimedParts = claimed.split('/').filter(Boolean);
    const definedParts = defined.split('/').filter(Boolean);

    if (claimedParts.length !== definedParts.length) return false;

    return claimedParts.every((part, i) => {
      const defPart = definedParts[i];
      if (defPart.startsWith(':') || defPart.startsWith('[')) return true;
      return part === defPart;
    });
  }

  /**
   * Detect import hallucinations
   */
  private async detectImportHallucinations(
    content: string,
    filePath: string
  ): Promise<HallucinationCandidate[]> {
    const candidates: HallucinationCandidate[] = [];
    
    const pkg = await this.loadPackageJson();
    const deps = {
      ...(pkg.dependencies as Record<string, string> || {}),
      ...(pkg.devDependencies as Record<string, string> || {}),
    };

    // Node.js builtins
    const nodeBuiltins = new Set([
      'fs', 'path', 'os', 'crypto', 'http', 'https', 'url', 'util',
      'stream', 'events', 'buffer', 'child_process', 'cluster', 'net',
      'dns', 'tls', 'zlib', 'readline', 'assert', 'fs/promises',
    ]);

    // Find imports
    const importPattern = /import\s+(?:{[^}]*}|\*\s+as\s+\w+|\w+)\s+from\s+['"]([^'"]+)['"]/g;
    
    let match;
    while ((match = importPattern.exec(content)) !== null) {
      const importPath = match[1];
      
      // Skip relative imports (would need filesystem check)
      if (importPath.startsWith('.') || importPath.startsWith('/')) {
        continue;
      }

      // Skip node: protocol
      if (importPath.startsWith('node:')) {
        continue;
      }

      // Get package name
      const packageName = importPath.startsWith('@')
        ? importPath.split('/').slice(0, 2).join('/')
        : importPath.split('/')[0];

      // Check if it's a builtin or installed package
      const isBuiltin = nodeBuiltins.has(packageName);
      const isInstalled = packageName in deps;

      if (!isBuiltin && !isInstalled) {
        const location = this.getLocation(content, match.index, filePath);
        candidates.push({
          id: generateFindingId('ghost-import', location.file, location.line, location.column, packageName),
          ruleId: 'ghost-import',
          type: 'import',
          value: packageName,
          confidence: this.getConfidenceForStrictness(0.85),
          location,
          reason: `GHOST IMPORT: Package "${packageName}" not found in package.json`,
        });
      }
    }

    return candidates;
  }

  /**
   * Detect type reference hallucinations
   */
  private async detectTypeHallucinations(
    content: string,
    filePath: string
  ): Promise<HallucinationCandidate[]> {
    const candidates: HallucinationCandidate[] = [];
    
    // Load contracts
    if (!this.contractsCache) {
      this.contractsCache = await this.loadTruthpack<TruthpackContracts>('contracts');
    }

    // Extract type annotations
    const typePattern = /:\s*([A-Z][a-zA-Z0-9_]*)\b(?![<(])/g;
    
    let match;
    while ((match = typePattern.exec(content)) !== null) {
      const typeName = match[1];
      
      // Skip builtins
      if (BUILTIN_TYPES.has(typeName)) continue;

      // Check if type is imported
      const importRegex = new RegExp(`import\\s+(?:{[^}]*\\b${typeName}\\b[^}]*}|type\\s*{[^}]*\\b${typeName}\\b[^}]*})\\s+from`, 'g');
      if (importRegex.test(content)) continue;

      // Check if type is defined locally
      const defRegex = new RegExp(`(?:interface|type|class|enum)\\s+${typeName}\\b`);
      if (defRegex.test(content)) continue;

      // Only flag with lower confidence since we can't fully verify
      if (this.config.strictness === 'high') {
        const location = this.getLocation(content, match.index, filePath);
        candidates.push({
          id: generateFindingId('ghost-type', location.file, location.line, location.column, typeName),
          ruleId: 'ghost-type',
          type: 'type',
          value: typeName,
          confidence: this.getConfidenceForStrictness(0.6),
          location,
          reason: `GHOST TYPE: Type "${typeName}" may not be defined or imported`,
        });
      }
    }

    return candidates;
  }

  /**
   * Detect environment variable hallucinations
   */
  private async detectEnvHallucinations(
    content: string,
    filePath: string
  ): Promise<HallucinationCandidate[]> {
    const candidates: HallucinationCandidate[] = [];
    
    // Load env truthpack
    if (!this.envCache) {
      this.envCache = await this.loadTruthpack<TruthpackEnv>('env');
    }
    
    const envVars = new Set(this.envCache?.variables?.map(v => v.name) || []);

    // Find env var references
    const envPatterns = [
      /process\.env\.([A-Z_][A-Z0-9_]*)/g,
      /process\.env\[['"]([A-Z_][A-Z0-9_]*)['"]\]/g,
      /import\.meta\.env\.([A-Z_][A-Z0-9_]*)/g,
    ];

    for (const pattern of envPatterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const varName = match[1];
        
        // Skip well-known vars
        if (WELLKNOWN_ENV.has(varName)) continue;
        
        // Skip NEXT_PUBLIC_ and VITE_ prefixed (framework-specific)
        if (varName.startsWith('NEXT_PUBLIC_') || varName.startsWith('VITE_')) {
          continue;
        }

        // Check if in truthpack
        if (!envVars.has(varName)) {
          const location = this.getLocation(content, match.index, filePath);
          candidates.push({
            id: generateFindingId('ghost-env', location.file, location.line, location.column, varName),
            ruleId: 'ghost-env',
            type: 'env',
            value: varName,
            confidence: this.getConfidenceForStrictness(0.9),
            location,
            reason: `GHOST ENV: Environment variable "${varName}" not declared in truthpack`,
          });
        }
      }
    }

    return candidates;
  }

  /**
   * Adjust confidence based on strictness
   */
  private getConfidenceForStrictness(baseConfidence: number): number {
    const multipliers: Record<DetectorConfig['strictness'], number> = {
      low: 0.7,
      medium: 1.0,
      high: 1.2,
    };
    return Math.min(1, baseConfidence * multipliers[this.config.strictness]);
  }

  /**
   * Generate hallucination report
   */
  private generateReport(candidates: HallucinationCandidate[]): HallucinationReport {
    const byType: Record<string, number> = {};
    let highConfidence = 0;

    for (const candidate of candidates) {
      byType[candidate.type] = (byType[candidate.type] ?? 0) + 1;
      if (candidate.confidence > 0.7) highConfidence++;
    }

    const score = candidates.length > 0
      ? candidates.reduce((sum, c) => sum + c.confidence, 0) / candidates.length
      : 0;

    // Determine pass threshold based on strictness
    const passThresholds: Record<DetectorConfig['strictness'], number> = {
      low: 0.5,
      medium: 0.3,
      high: 0.1,
    };
    const passed = score < passThresholds[this.config.strictness];

    return {
      candidates,
      score,
      summary: {
        total: candidates.length,
        byType,
        highConfidence,
      },
      passed,
    };
  }

  /**
   * Clear caches
   */
  clearCache(): void {
    this.routesCache = null;
    this.envCache = null;
    this.contractsCache = null;
    this.packageJsonCache = null;
  }
}
