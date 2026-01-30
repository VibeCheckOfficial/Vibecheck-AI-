/**
 * Drift Detector
 *
 * Detects when the codebase has drifted from the truthpack,
 * indicating that regeneration or manual updates are needed.
 *
 * World-class implementation for detecting:
 * - New/removed/changed routes
 * - Environment variable drift
 * - Auth configuration changes
 * - Type/contract drift
 * 
 * Includes comprehensive input validation and safety limits.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';
import { getLogger, type Logger } from '../utils/logger.js';

/**
 * Safety limits to prevent DoS and excessive resource usage
 */
const SAFETY_LIMITS = {
  MAX_FILES_TO_SCAN: 5000,
  MAX_FILE_SIZE_BYTES: 1024 * 1024, // 1MB
  MAX_DRIFT_ITEMS: 500,
  MAX_ROUTES: 1000,
  MAX_ENV_VARS: 200,
  MAX_TYPES: 500,
  SCAN_TIMEOUT_MS: 60000, // 1 minute
} as const;

export interface DriftItem {
  type: 'added' | 'removed' | 'modified';
  category: 'route' | 'env' | 'auth' | 'type' | 'component' | 'api';
  identifier: string;
  details: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  location?: {
    file: string;
    line?: number;
  };
  truthpackValue?: string;
  codebaseValue?: string;
}

export interface DriftReport {
  hasDrift: boolean;
  items: DriftItem[];
  summary: {
    added: number;
    removed: number;
    modified: number;
    totalDrift: number;
    criticalCount: number;
    highCount: number;
  };
  recommendations: string[];
  lastTruthpackUpdate: Date | null;
  codebaseLastModified: Date | null;
  scanDuration: number;
}

export interface DriftDetectorConfig {
  truthpackPath: string;
  projectRoot: string;
  ignorePatterns: string[];
  routePatterns: string[];
  envPatterns: string[];
  authPatterns: string[];
}

const DEFAULT_CONFIG: DriftDetectorConfig = {
  truthpackPath: '.vibecheck/truthpack',
  projectRoot: process.cwd(),
  ignorePatterns: ['node_modules/**', 'dist/**', 'build/**', '.next/**', '*.test.ts', '*.spec.ts'],
  routePatterns: [
    '**/app/**/route.ts',
    '**/app/**/page.tsx',
    '**/pages/api/**/*.ts',
    '**/routes/**/*.ts',
    '**/api/**/*.ts',
  ],
  envPatterns: ['.env', '.env.*', '**/*.env'],
  authPatterns: [
    '**/middleware.ts',
    '**/auth/**/*.ts',
    '**/*auth*.ts',
    '**/*guard*.ts',
  ],
};

// Route extraction patterns for different frameworks
const ROUTE_FRAMEWORKS = {
  nextjs_app: {
    pattern: /app\/(.+?)\/(?:route|page)\.(ts|tsx|js|jsx)$/,
    extractMethod: (content: string): string[] => {
      const methods: string[] = [];
      const httpMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
      for (const method of httpMethods) {
        if (new RegExp(`export\\s+(?:async\\s+)?function\\s+${method}\\b`).test(content)) {
          methods.push(method);
        }
      }
      return methods.length > 0 ? methods : ['GET']; // Default for pages
    },
  },
  nextjs_pages: {
    pattern: /pages\/api\/(.+?)\.(ts|tsx|js|jsx)$/,
    extractMethod: (): string[] => ['*'], // Pages API handles all methods in handler
  },
  express: {
    extractRoutes: (content: string): Array<{ method: string; path: string }> => {
      const routes: Array<{ method: string; path: string }> = [];
      const routeRegex = /\.(get|post|put|patch|delete|all)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
      let match;
      while ((match = routeRegex.exec(content)) !== null) {
        routes.push({ method: match[1].toUpperCase(), path: match[2] });
      }
      return routes;
    },
  },
  fastify: {
    extractRoutes: (content: string): Array<{ method: string; path: string }> => {
      const routes: Array<{ method: string; path: string }> = [];
      const routeRegex = /fastify\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
      let match;
      while ((match = routeRegex.exec(content)) !== null) {
        routes.push({ method: match[1].toUpperCase(), path: match[2] });
      }
      return routes;
    },
  },
};

export class DriftDetector {
  private config: DriftDetectorConfig;
  private logger: Logger;
  private truthpack: {
    routes?: TruthpackRoutes;
    env?: TruthpackEnv;
    auth?: TruthpackAuth;
    contracts?: TruthpackContracts;
  } = {};
  private isScanning = false;

  constructor(config: Partial<DriftDetectorConfig> = {}) {
    // Validate and normalize config
    this.config = this.validateConfig({ ...DEFAULT_CONFIG, ...config });
    this.logger = getLogger('drift-detector');
  }

  /**
   * Validate and normalize configuration
   */
  private validateConfig(config: DriftDetectorConfig): DriftDetectorConfig {
    // Sanitize paths
    const sanitizePath = (p: string): string => {
      return p
        .replace(/\.\.\//g, '') // Remove path traversal
        .replace(/^\//, ''); // Remove leading slash for relative paths
    };

    return {
      ...config,
      truthpackPath: sanitizePath(config.truthpackPath),
      projectRoot: config.projectRoot || process.cwd(),
      ignorePatterns: [
        ...DEFAULT_CONFIG.ignorePatterns,
        ...(config.ignorePatterns ?? []),
      ].filter((p) => typeof p === 'string'),
      routePatterns: (config.routePatterns ?? DEFAULT_CONFIG.routePatterns)
        .filter((p) => typeof p === 'string')
        .slice(0, 20), // Limit patterns
      envPatterns: (config.envPatterns ?? DEFAULT_CONFIG.envPatterns)
        .filter((p) => typeof p === 'string')
        .slice(0, 10),
      authPatterns: (config.authPatterns ?? DEFAULT_CONFIG.authPatterns)
        .filter((p) => typeof p === 'string')
        .slice(0, 20),
    };
  }

  /**
   * Detect drift between truthpack and codebase
   */
  async detect(): Promise<DriftReport> {
    // Prevent concurrent scans
    if (this.isScanning) {
      throw new Error('Drift detection already in progress');
    }

    this.isScanning = true;
    const startTime = Date.now();
    
    try {
      const items: DriftItem[] = [];

      // Load truthpack with error handling
      try {
        await this.loadTruthpack();
      } catch (error) {
        this.logger.warn('Failed to load truthpack', {
          error: error instanceof Error ? error.message : 'Unknown',
        });
        // Continue with empty truthpack
      }

      // Detect drift in parallel with timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Drift detection timed out')), SAFETY_LIMITS.SCAN_TIMEOUT_MS);
      });

      const [routeDrift, envDrift, authDrift, typeDrift] = await Promise.race([
        Promise.all([
          this.detectRouteDrift().catch((e) => {
            this.logger.warn('Route drift detection failed', { error: e });
            return [] as DriftItem[];
          }),
          this.detectEnvDrift().catch((e) => {
            this.logger.warn('Env drift detection failed', { error: e });
            return [] as DriftItem[];
          }),
          this.detectAuthDrift().catch((e) => {
            this.logger.warn('Auth drift detection failed', { error: e });
            return [] as DriftItem[];
          }),
          this.detectTypeDrift().catch((e) => {
            this.logger.warn('Type drift detection failed', { error: e });
            return [] as DriftItem[];
          }),
        ]),
        timeoutPromise,
      ]);

      items.push(...routeDrift, ...envDrift, ...authDrift, ...typeDrift);

      // Enforce limit on drift items
      const limitedItems = items.slice(0, SAFETY_LIMITS.MAX_DRIFT_ITEMS);
      if (items.length > SAFETY_LIMITS.MAX_DRIFT_ITEMS) {
        this.logger.warn(`Drift items truncated from ${items.length} to ${SAFETY_LIMITS.MAX_DRIFT_ITEMS}`);
      }

      const scanDuration = Date.now() - startTime;
      return this.generateReport(limitedItems, scanDuration);
    } finally {
      this.isScanning = false;
    }
  }

  /**
   * Quick check if any drift exists
   */
  async hasDrift(): Promise<boolean> {
    try {
      // Quick check: compare truthpack modification time with key files
      const truthpackStat = await this.getTruthpackStat();
      if (!truthpackStat) return true; // No truthpack = definitely drift

      // Check if any route files are newer than truthpack
      const routeFiles = await glob(this.config.routePatterns, {
        cwd: this.config.projectRoot,
        ignore: this.config.ignorePatterns,
      });

      for (const file of routeFiles.slice(0, 10)) {
        const filePath = path.join(this.config.projectRoot, file);
        const stat = await fs.stat(filePath);
        if (stat.mtimeMs > truthpackStat.mtimeMs) {
          return true;
        }
      }

      return false;
    } catch {
      return true; // Error = assume drift
    }
  }

  /**
   * Get specific drift for a category
   */
  async getDriftForCategory(category: DriftItem['category']): Promise<DriftItem[]> {
    switch (category) {
      case 'route':
        return this.detectRouteDrift();
      case 'env':
        return this.detectEnvDrift();
      case 'auth':
        return this.detectAuthDrift();
      case 'type':
        return this.detectTypeDrift();
      default:
        return [];
    }
  }

  // ============================================================================
  // Private Methods - Truthpack Loading
  // ============================================================================

  private async loadTruthpack(): Promise<void> {
    const truthpackDir = path.join(this.config.projectRoot, this.config.truthpackPath);

    try {
      // Load routes.json
      const routesPath = path.join(truthpackDir, 'routes.json');
      try {
        const routesContent = await fs.readFile(routesPath, 'utf-8');
        this.truthpack.routes = JSON.parse(routesContent) as TruthpackRoutes;
      } catch {
        this.truthpack.routes = { routes: [], version: '1.0.0' };
      }

      // Load env.json
      const envPath = path.join(truthpackDir, 'env.json');
      try {
        const envContent = await fs.readFile(envPath, 'utf-8');
        this.truthpack.env = JSON.parse(envContent) as TruthpackEnv;
      } catch {
        this.truthpack.env = { variables: [], version: '1.0.0' };
      }

      // Load auth.json
      const authPath = path.join(truthpackDir, 'auth.json');
      try {
        const authContent = await fs.readFile(authPath, 'utf-8');
        this.truthpack.auth = JSON.parse(authContent) as TruthpackAuth;
      } catch {
        this.truthpack.auth = { rules: [], version: '1.0.0' };
      }

      // Load contracts.json
      const contractsPath = path.join(truthpackDir, 'contracts.json');
      try {
        const contractsContent = await fs.readFile(contractsPath, 'utf-8');
        this.truthpack.contracts = JSON.parse(contractsContent) as TruthpackContracts;
      } catch {
        this.truthpack.contracts = { endpoints: [], types: [], version: '1.0.0' };
      }
    } catch (error) {
      this.logger.warn('Failed to load truthpack', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
    }
  }

  private async getTruthpackStat(): Promise<{ mtimeMs: number } | null> {
    const truthpackDir = path.join(this.config.projectRoot, this.config.truthpackPath);

    try {
      const stat = await fs.stat(truthpackDir);
      return { mtimeMs: stat.mtimeMs };
    } catch {
      return null;
    }
  }

  // ============================================================================
  // Private Methods - Route Drift Detection
  // ============================================================================

  private async detectRouteDrift(): Promise<DriftItem[]> {
    const items: DriftItem[] = [];
    const truthpackRoutes = this.truthpack.routes?.routes ?? [];

    // Scan codebase for current routes
    const codebaseRoutes = await this.scanCodebaseRoutes();

    // Build lookup maps
    const truthpackMap = new Map<string, TruthpackRoute>();
    for (const route of truthpackRoutes) {
      const key = `${route.method}:${route.path}`;
      truthpackMap.set(key, route);
    }

    const codebaseMap = new Map<string, CodebaseRoute>();
    for (const route of codebaseRoutes) {
      const key = `${route.method}:${route.path}`;
      codebaseMap.set(key, route);
    }

    // Find added routes (in codebase but not in truthpack)
    for (const [key, route] of codebaseMap) {
      if (!truthpackMap.has(key)) {
        items.push({
          type: 'added',
          category: 'route',
          identifier: key,
          details: `New route found: ${route.method} ${route.path}`,
          severity: 'medium',
          location: { file: route.file, line: route.line },
          codebaseValue: `${route.method} ${route.path}`,
        });
      }
    }

    // Find removed routes (in truthpack but not in codebase)
    for (const [key, route] of truthpackMap) {
      if (!codebaseMap.has(key)) {
        items.push({
          type: 'removed',
          category: 'route',
          identifier: key,
          details: `Route removed: ${route.method} ${route.path}`,
          severity: 'high', // Removed routes are more serious
          truthpackValue: `${route.method} ${route.path}`,
        });
      }
    }

    // Find modified routes (different handlers or middleware)
    for (const [key, codebaseRoute] of codebaseMap) {
      const truthpackRoute = truthpackMap.get(key);
      if (truthpackRoute) {
        // Check if handler changed
        if (codebaseRoute.handler !== truthpackRoute.handler) {
          items.push({
            type: 'modified',
            category: 'route',
            identifier: key,
            details: `Handler changed for ${codebaseRoute.method} ${codebaseRoute.path}`,
            severity: 'medium',
            location: { file: codebaseRoute.file, line: codebaseRoute.line },
            truthpackValue: truthpackRoute.handler,
            codebaseValue: codebaseRoute.handler,
          });
        }
      }
    }

    return items;
  }

  private async scanCodebaseRoutes(): Promise<CodebaseRoute[]> {
    const routes: CodebaseRoute[] = [];

    // Find all route files with limit
    let files: string[];
    try {
      files = await glob(this.config.routePatterns, {
        cwd: this.config.projectRoot,
        ignore: this.config.ignorePatterns,
      });
    } catch (error) {
      this.logger.warn('Failed to glob route patterns', { error });
      return routes;
    }

    // Limit files to scan
    const limitedFiles = files.slice(0, SAFETY_LIMITS.MAX_FILES_TO_SCAN);
    if (files.length > SAFETY_LIMITS.MAX_FILES_TO_SCAN) {
      this.logger.warn(`Route files truncated from ${files.length} to ${SAFETY_LIMITS.MAX_FILES_TO_SCAN}`);
    }

    for (const file of limitedFiles) {
      // Validate file path
      if (file.includes('..') || path.isAbsolute(file)) {
        continue; // Skip suspicious paths
      }

      const filePath = path.join(this.config.projectRoot, file);
      
      // Ensure file is within project root
      if (!filePath.startsWith(this.config.projectRoot)) {
        continue;
      }

      try {
        // Check file size before reading
        const stat = await fs.stat(filePath);
        if (stat.size > SAFETY_LIMITS.MAX_FILE_SIZE_BYTES) {
          this.logger.debug('Skipping large file', { file, size: stat.size });
          continue;
        }

        const content = await fs.readFile(filePath, 'utf-8');

        // Try Next.js App Router pattern
        const appMatch = ROUTE_FRAMEWORKS.nextjs_app.pattern.exec(file);
        if (appMatch) {
          const routePath = '/' + appMatch[1].replace(/\[([^\]]+)\]/g, ':$1');
          const methods = ROUTE_FRAMEWORKS.nextjs_app.extractMethod(content);

          for (const method of methods) {
            routes.push({
              method,
              path: routePath,
              file,
              handler: `${file}:${method}`,
            });
          }
          continue;
        }

        // Try Next.js Pages API pattern
        const pagesMatch = ROUTE_FRAMEWORKS.nextjs_pages.pattern.exec(file);
        if (pagesMatch) {
          const routePath = '/api/' + pagesMatch[1].replace(/\[([^\]]+)\]/g, ':$1');
          routes.push({
            method: '*',
            path: routePath,
            file,
            handler: `${file}:handler`,
          });
          continue;
        }

        // Try Express/Fastify patterns
        const expressRoutes = ROUTE_FRAMEWORKS.express.extractRoutes(content);
        for (const route of expressRoutes) {
          routes.push({
            method: route.method,
            path: route.path,
            file,
            handler: `${file}:${route.method}:${route.path}`,
          });
        }

        const fastifyRoutes = ROUTE_FRAMEWORKS.fastify.extractRoutes(content);
        for (const route of fastifyRoutes) {
          routes.push({
            method: route.method,
            path: route.path,
            file,
            handler: `${file}:${route.method}:${route.path}`,
          });
        }
      } catch (error) {
        this.logger.debug('Failed to scan route file', { file, error });
      }
    }

    return routes;
  }

  // ============================================================================
  // Private Methods - Environment Drift Detection
  // ============================================================================

  private async detectEnvDrift(): Promise<DriftItem[]> {
    const items: DriftItem[] = [];
    const truthpackEnv = this.truthpack.env?.variables ?? [];

    // Scan codebase for env var usage
    const codebaseEnvUsage = await this.scanEnvUsage();

    // Scan .env files for definitions
    const envFileVars = await this.scanEnvFiles();

    // Build lookup maps
    const truthpackMap = new Map<string, TruthpackEnvVar>();
    for (const envVar of truthpackEnv) {
      truthpackMap.set(envVar.name, envVar);
    }

    // Check for used but undefined variables
    for (const [name, usage] of codebaseEnvUsage) {
      if (!truthpackMap.has(name) && !envFileVars.has(name)) {
        items.push({
          type: 'added',
          category: 'env',
          identifier: name,
          details: `Environment variable "${name}" used but not in truthpack or .env`,
          severity: usage.isRequired ? 'critical' : 'high',
          location: usage.locations[0],
          codebaseValue: `Used in ${usage.locations.length} places`,
        });
      }
    }

    // Check for defined but unused variables
    for (const [name, envVar] of truthpackMap) {
      if (!codebaseEnvUsage.has(name) && envVar.required) {
        items.push({
          type: 'removed',
          category: 'env',
          identifier: name,
          details: `Environment variable "${name}" defined but not used`,
          severity: 'low',
          truthpackValue: envVar.description ?? 'Required variable',
        });
      }
    }

    // Check for type/format changes
    for (const [name, truthpackVar] of truthpackMap) {
      const usage = codebaseEnvUsage.get(name);
      if (usage && usage.inferredType !== truthpackVar.type) {
        items.push({
          type: 'modified',
          category: 'env',
          identifier: name,
          details: `Type mismatch for "${name}": truthpack says ${truthpackVar.type}, code suggests ${usage.inferredType}`,
          severity: 'medium',
          truthpackValue: truthpackVar.type,
          codebaseValue: usage.inferredType,
        });
      }
    }

    return items;
  }

  private async scanEnvUsage(): Promise<Map<string, EnvUsage>> {
    const usage = new Map<string, EnvUsage>();

    const files = await glob(['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'], {
      cwd: this.config.projectRoot,
      ignore: this.config.ignorePatterns,
    });

    for (const file of files) {
      const filePath = path.join(this.config.projectRoot, file);

      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.split('\n');

        // Find process.env.VAR_NAME patterns
        const envRegex = /process\.env\.([A-Z][A-Z0-9_]*)/g;
        let match;

        while ((match = envRegex.exec(content)) !== null) {
          const varName = match[1];
          const lineNum = content.slice(0, match.index).split('\n').length;

          const existing = usage.get(varName);
          if (existing) {
            existing.locations.push({ file, line: lineNum });
          } else {
            // Infer if required (no fallback provided)
            const line = lines[lineNum - 1] ?? '';
            const isRequired = !line.includes('??') && !line.includes('||');

            // Infer type from context
            const inferredType = this.inferEnvType(line, varName);

            usage.set(varName, {
              name: varName,
              locations: [{ file, line: lineNum }],
              isRequired,
              inferredType,
            });
          }
        }
      } catch {
        // Skip files that can't be read
      }
    }

    return usage;
  }

  private inferEnvType(line: string, varName: string): string {
    // Check for number conversion
    if (line.includes('parseInt') || line.includes('Number(') || line.includes('parseFloat')) {
      return 'number';
    }

    // Check for boolean conversion
    if (line.includes('=== "true"') || line.includes('=== \'true\'')) {
      return 'boolean';
    }

    // Check for URL patterns
    if (varName.includes('URL') || varName.includes('ENDPOINT')) {
      return 'url';
    }

    // Check for secret patterns
    if (varName.includes('SECRET') || varName.includes('KEY') || varName.includes('TOKEN')) {
      return 'secret';
    }

    return 'string';
  }

  private async scanEnvFiles(): Promise<Set<string>> {
    const vars = new Set<string>();

    const envFiles = await glob(this.config.envPatterns, {
      cwd: this.config.projectRoot,
      dot: true,
    });

    for (const file of envFiles) {
      const filePath = path.join(this.config.projectRoot, file);

      try {
        const content = await fs.readFile(filePath, 'utf-8');

        for (const line of content.split('\n')) {
          const match = /^([A-Z][A-Z0-9_]*)=/.exec(line.trim());
          if (match) {
            vars.add(match[1]);
          }
        }
      } catch {
        // Skip files that can't be read
      }
    }

    return vars;
  }

  // ============================================================================
  // Private Methods - Auth Drift Detection
  // ============================================================================

  private async detectAuthDrift(): Promise<DriftItem[]> {
    const items: DriftItem[] = [];
    const truthpackAuth = this.truthpack.auth?.rules ?? [];

    // Scan codebase for auth patterns
    const codebaseAuth = await this.scanAuthPatterns();

    // Build lookup maps
    const truthpackMap = new Map<string, TruthpackAuthRule>();
    for (const rule of truthpackAuth) {
      truthpackMap.set(rule.path, rule);
    }

    // Find routes with changed auth requirements
    for (const [routePath, codebaseRule] of codebaseAuth) {
      const truthpackRule = truthpackMap.get(routePath);

      if (!truthpackRule) {
        // New auth rule found
        if (codebaseRule.requiresAuth) {
          items.push({
            type: 'added',
            category: 'auth',
            identifier: routePath,
            details: `New auth requirement added for "${routePath}"`,
            severity: 'medium',
            location: codebaseRule.location,
            codebaseValue: `Requires: ${codebaseRule.roles?.join(', ') ?? 'auth'}`,
          });
        }
      } else {
        // Check for changes
        if (codebaseRule.requiresAuth !== truthpackRule.requiresAuth) {
          items.push({
            type: 'modified',
            category: 'auth',
            identifier: routePath,
            details: truthpackRule.requiresAuth
              ? `Auth requirement REMOVED for "${routePath}" - SECURITY CONCERN`
              : `Auth requirement ADDED for "${routePath}"`,
            severity: truthpackRule.requiresAuth ? 'critical' : 'medium',
            location: codebaseRule.location,
            truthpackValue: truthpackRule.requiresAuth ? 'Protected' : 'Public',
            codebaseValue: codebaseRule.requiresAuth ? 'Protected' : 'Public',
          });
        }

        // Check for role changes
        const truthpackRoles = new Set(truthpackRule.roles ?? []);
        const codebaseRoles = new Set(codebaseRule.roles ?? []);

        const removedRoles = [...truthpackRoles].filter((r) => !codebaseRoles.has(r));
        const addedRoles = [...codebaseRoles].filter((r) => !truthpackRoles.has(r));

        if (removedRoles.length > 0) {
          items.push({
            type: 'modified',
            category: 'auth',
            identifier: routePath,
            details: `Roles removed from "${routePath}": ${removedRoles.join(', ')} - PERMISSION ESCALATION RISK`,
            severity: 'critical',
            truthpackValue: [...truthpackRoles].join(', '),
            codebaseValue: [...codebaseRoles].join(', '),
          });
        }

        if (addedRoles.length > 0) {
          items.push({
            type: 'modified',
            category: 'auth',
            identifier: routePath,
            details: `Roles added to "${routePath}": ${addedRoles.join(', ')}`,
            severity: 'low',
            truthpackValue: [...truthpackRoles].join(', '),
            codebaseValue: [...codebaseRoles].join(', '),
          });
        }
      }
    }

    // Find removed auth rules (were protected, now might be public)
    for (const [routePath, truthpackRule] of truthpackMap) {
      if (!codebaseAuth.has(routePath) && truthpackRule.requiresAuth) {
        items.push({
          type: 'removed',
          category: 'auth',
          identifier: routePath,
          details: `Auth rule for "${routePath}" no longer found - was protected, verify still secure`,
          severity: 'high',
          truthpackValue: `Protected with: ${truthpackRule.roles?.join(', ') ?? 'auth'}`,
        });
      }
    }

    return items;
  }

  private async scanAuthPatterns(): Promise<Map<string, CodebaseAuthRule>> {
    const rules = new Map<string, CodebaseAuthRule>();

    const files = await glob(this.config.authPatterns, {
      cwd: this.config.projectRoot,
      ignore: this.config.ignorePatterns,
    });

    for (const file of files) {
      const filePath = path.join(this.config.projectRoot, file);

      try {
        const content = await fs.readFile(filePath, 'utf-8');

        // Check for middleware auth patterns
        const middlewarePatterns = [
          // Next.js middleware matcher
          /config\s*=\s*{\s*matcher:\s*\[([^\]]+)\]/g,
          // Express/Fastify auth middleware
          /(?:app|router|fastify)\.(get|post|put|delete)\s*\(\s*['"]([^'"]+)['"][^)]*(?:auth|protect|guard)/gi,
          // Route-level auth decorators
          /@(?:Auth|Protected|RequireAuth|Guard)\s*\([^)]*\)[^}]*(?:path|route)\s*[:=]\s*['"]([^'"]+)['"]/gi,
        ];

        for (const pattern of middlewarePatterns) {
          let match;
          while ((match = pattern.exec(content)) !== null) {
            const paths = this.extractPaths(match);
            const lineNum = content.slice(0, match.index).split('\n').length;

            for (const routePath of paths) {
              rules.set(routePath, {
                path: routePath,
                requiresAuth: true,
                roles: this.extractRoles(content, match.index),
                location: { file, line: lineNum },
              });
            }
          }
        }
      } catch {
        // Skip files that can't be read
      }
    }

    return rules;
  }

  private extractPaths(match: RegExpExecArray): string[] {
    const paths: string[] = [];

    // Try to extract paths from the match
    for (let i = 1; i < match.length; i++) {
      if (match[i]) {
        // Check if it looks like a path or path array
        const value = match[i];
        if (value.includes(',')) {
          // Multiple paths
          const pathMatches = value.match(/['"]([^'"]+)['"]/g);
          if (pathMatches) {
            paths.push(...pathMatches.map((p) => p.replace(/['"]/g, '')));
          }
        } else if (value.startsWith('/') || value.startsWith("'") || value.startsWith('"')) {
          paths.push(value.replace(/['"]/g, ''));
        }
      }
    }

    return paths;
  }

  private extractRoles(content: string, startIndex: number): string[] | undefined {
    // Look for role definitions near the auth check
    const context = content.slice(startIndex, startIndex + 500);
    const roleMatch = /roles?\s*[:=]\s*\[([^\]]+)\]/i.exec(context);

    if (roleMatch) {
      const roles = roleMatch[1].match(/['"]([^'"]+)['"]/g);
      if (roles) {
        return roles.map((r) => r.replace(/['"]/g, ''));
      }
    }

    return undefined;
  }

  // ============================================================================
  // Private Methods - Type Drift Detection
  // ============================================================================

  private async detectTypeDrift(): Promise<DriftItem[]> {
    const items: DriftItem[] = [];
    const truthpackContracts = this.truthpack.contracts;

    if (!truthpackContracts) return items;

    // Scan for type definitions
    const codebaseTypes = await this.scanTypeDefinitions();

    // Check endpoint contracts
    for (const endpoint of truthpackContracts.endpoints ?? []) {
      const codebaseType = codebaseTypes.get(endpoint.responseType);

      if (!codebaseType) {
        items.push({
          type: 'removed',
          category: 'type',
          identifier: endpoint.responseType,
          details: `Response type "${endpoint.responseType}" for ${endpoint.method} ${endpoint.path} not found`,
          severity: 'high',
          truthpackValue: endpoint.responseType,
        });
      }
    }

    // Check shared types
    for (const truthpackType of truthpackContracts.types ?? []) {
      const codebaseType = codebaseTypes.get(truthpackType.name);

      if (!codebaseType) {
        items.push({
          type: 'removed',
          category: 'type',
          identifier: truthpackType.name,
          details: `Type "${truthpackType.name}" no longer exists`,
          severity: 'medium',
          truthpackValue: JSON.stringify(truthpackType.schema, null, 2),
        });
      } else {
        // Check for significant changes (simplified comparison)
        const truthpackFields = Object.keys(truthpackType.schema ?? {});
        const codebaseFields = codebaseType.fields ?? [];

        const removedFields = truthpackFields.filter((f) => !codebaseFields.includes(f));
        const addedFields = codebaseFields.filter((f) => !truthpackFields.includes(f));

        if (removedFields.length > 0) {
          items.push({
            type: 'modified',
            category: 'type',
            identifier: truthpackType.name,
            details: `Fields removed from "${truthpackType.name}": ${removedFields.join(', ')}`,
            severity: 'high',
            location: codebaseType.location,
            truthpackValue: truthpackFields.join(', '),
            codebaseValue: codebaseFields.join(', '),
          });
        }

        if (addedFields.length > 0) {
          items.push({
            type: 'modified',
            category: 'type',
            identifier: truthpackType.name,
            details: `Fields added to "${truthpackType.name}": ${addedFields.join(', ')}`,
            severity: 'low',
            location: codebaseType.location,
            truthpackValue: truthpackFields.join(', '),
            codebaseValue: codebaseFields.join(', '),
          });
        }
      }
    }

    return items;
  }

  private async scanTypeDefinitions(): Promise<Map<string, CodebaseType>> {
    const types = new Map<string, CodebaseType>();

    const files = await glob(['**/*.ts', '**/*.tsx'], {
      cwd: this.config.projectRoot,
      ignore: this.config.ignorePatterns,
    });

    for (const file of files) {
      const filePath = path.join(this.config.projectRoot, file);

      try {
        const content = await fs.readFile(filePath, 'utf-8');

        // Find interface definitions
        const interfaceRegex = /(?:export\s+)?interface\s+(\w+)\s*(?:extends\s+[^{]+)?\s*{([^}]*)}/g;
        let match;

        while ((match = interfaceRegex.exec(content)) !== null) {
          const name = match[1];
          const body = match[2];
          const lineNum = content.slice(0, match.index).split('\n').length;

          const fields = this.extractFieldNames(body);

          types.set(name, {
            name,
            kind: 'interface',
            fields,
            location: { file, line: lineNum },
          });
        }

        // Find type definitions
        const typeRegex = /(?:export\s+)?type\s+(\w+)\s*=\s*{([^}]*)}/g;

        while ((match = typeRegex.exec(content)) !== null) {
          const name = match[1];
          const body = match[2];
          const lineNum = content.slice(0, match.index).split('\n').length;

          const fields = this.extractFieldNames(body);

          types.set(name, {
            name,
            kind: 'type',
            fields,
            location: { file, line: lineNum },
          });
        }
      } catch {
        // Skip files that can't be read
      }
    }

    return types;
  }

  private extractFieldNames(body: string): string[] {
    const fields: string[] = [];
    const fieldRegex = /(\w+)\s*[?:]?\s*:/g;
    let match;

    while ((match = fieldRegex.exec(body)) !== null) {
      fields.push(match[1]);
    }

    return fields;
  }

  // ============================================================================
  // Private Methods - Report Generation
  // ============================================================================

  private generateReport(items: DriftItem[], scanDuration: number): DriftReport {
    const added = items.filter((i) => i.type === 'added').length;
    const removed = items.filter((i) => i.type === 'removed').length;
    const modified = items.filter((i) => i.type === 'modified').length;
    const criticalCount = items.filter((i) => i.severity === 'critical').length;
    const highCount = items.filter((i) => i.severity === 'high').length;

    const recommendations: string[] = [];

    if (criticalCount > 0) {
      recommendations.push(
        `⚠️ CRITICAL: ${criticalCount} critical security/auth issues require immediate attention`
      );
    }

    if (added > 0) {
      recommendations.push(`Run 'vibecheck scan' to add ${added} new items to truthpack`);
    }

    if (removed > 0) {
      recommendations.push(
        `Review ${removed} removed items - they may indicate breaking changes or security issues`
      );
    }

    if (modified > 0) {
      recommendations.push(`Validate ${modified} modified items for correctness`);
    }

    if (items.some((i) => i.category === 'auth' && i.severity === 'critical')) {
      recommendations.push(
        '🔒 SECURITY: Auth drift detected - verify all protected routes remain secure'
      );
    }

    if (items.some((i) => i.category === 'env' && i.severity === 'critical')) {
      recommendations.push(
        '🔑 ENV: Missing environment variables may cause runtime failures'
      );
    }

    return {
      hasDrift: items.length > 0,
      items,
      summary: {
        added,
        removed,
        modified,
        totalDrift: items.length,
        criticalCount,
        highCount,
      },
      recommendations,
      lastTruthpackUpdate: null, // TODO: Read from truthpack metadata
      codebaseLastModified: null, // TODO: Get from git or filesystem
      scanDuration,
    };
  }
}

// ============================================================================
// Types
// ============================================================================

interface TruthpackRoutes {
  routes: TruthpackRoute[];
  version: string;
}

interface TruthpackRoute {
  method: string;
  path: string;
  handler: string;
  middleware?: string[];
}

interface TruthpackEnv {
  variables: TruthpackEnvVar[];
  version: string;
}

interface TruthpackEnvVar {
  name: string;
  type: string;
  required: boolean;
  description?: string;
  default?: string;
}

interface TruthpackAuth {
  rules: TruthpackAuthRule[];
  version: string;
}

interface TruthpackAuthRule {
  path: string;
  requiresAuth: boolean;
  roles?: string[];
}

interface TruthpackContracts {
  endpoints: TruthpackEndpoint[];
  types: TruthpackType[];
  version: string;
}

interface TruthpackEndpoint {
  method: string;
  path: string;
  requestType?: string;
  responseType: string;
}

interface TruthpackType {
  name: string;
  schema: Record<string, unknown>;
}

interface CodebaseRoute {
  method: string;
  path: string;
  file: string;
  line?: number;
  handler: string;
}

interface EnvUsage {
  name: string;
  locations: Array<{ file: string; line: number }>;
  isRequired: boolean;
  inferredType: string;
}

interface CodebaseAuthRule {
  path: string;
  requiresAuth: boolean;
  roles?: string[];
  location: { file: string; line: number };
}

interface CodebaseType {
  name: string;
  kind: 'interface' | 'type';
  fields: string[];
  location: { file: string; line: number };
}

// ============================================================================
// Export singleton helper
// ============================================================================

let globalDetector: DriftDetector | null = null;

export function getDriftDetector(
  config?: Partial<DriftDetectorConfig>
): DriftDetector {
  if (!globalDetector) {
    globalDetector = new DriftDetector(config);
  }
  return globalDetector;
}
