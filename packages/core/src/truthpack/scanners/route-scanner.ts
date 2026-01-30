/**
 * Route Scanner
 * 
 * Scans codebase to extract route definitions from various frameworks
 * (Express, Fastify, Next.js, Hono, Koa, NestJS).
 * 
 * Features:
 * - Multi-framework support
 * - Parameter extraction and type inference
 * - Middleware and auth detection
 * - Parallel file processing
 * - Performance tracking
 */

import { glob } from 'glob';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { RouteDefinition } from '../schemas/routes.schema.js';
import { getLogger, type Logger } from '../../utils/logger.js';
import { PerformanceTracker } from '../../utils/performance.js';
import { parallelLimit } from '../../utils/performance.js';
import { wrapError } from '../../utils/errors.js';

export interface RouteScannerConfig {
  frameworks: ('express' | 'fastify' | 'nextjs' | 'hono' | 'koa' | 'nestjs')[];
  includePatterns: string[];
  excludePatterns: string[];
  maxFileSize: number;
  parallelLimit: number;
}

const DEFAULT_CONFIG: RouteScannerConfig = {
  frameworks: ['express', 'nextjs', 'fastify', 'hono'],
  includePatterns: ['**/*.ts', '**/*.js', '**/route.ts', '**/route.js'],
  excludePatterns: ['node_modules/**', 'dist/**', 'build/**', '.next/**', 'coverage/**', '**/*.test.*', '**/*.spec.*'],
  maxFileSize: 512 * 1024, // 512KB
  parallelLimit: 20,
};

// HTTP methods to detect
const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'] as const;
type HttpMethod = typeof HTTP_METHODS[number];

// Common auth middleware patterns
const AUTH_PATTERNS = /(?:auth|authenticate|requireAuth|isAuthenticated|protect|guard|verify(?:Token|JWT|Session)|ensureLoggedIn|passport\.authenticate)/i;

// Common middleware patterns
const MIDDLEWARE_PATTERNS = [
  /(\w+Middleware)/g,
  /(authenticate|authorize|validate\w*|rateLimit|cors|helmet|compression|bodyParser|multer|passport|session|csrf|sanitize)/gi,
];

export class RouteScanner {
  private projectRoot: string;
  private config: RouteScannerConfig;
  private logger: Logger;
  private performanceTracker: PerformanceTracker;
  private fileCache: Map<string, string> = new Map();

  constructor(projectRoot: string, config: Partial<RouteScannerConfig> = {}) {
    this.projectRoot = projectRoot;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = getLogger('route-scanner');
    this.performanceTracker = new PerformanceTracker();
  }

  /**
   * Scan project for route definitions
   */
  async scan(): Promise<RouteDefinition[]> {
    const startTime = performance.now();
    const routes: RouteDefinition[] = [];

    this.logger.info('Starting route scan', {
      projectRoot: this.projectRoot,
      frameworks: this.config.frameworks,
    });

    try {
      // Scan for each framework in parallel
      const scanPromises = this.config.frameworks.map(async (framework) => {
        const { result: frameworkRoutes, durationMs } = await this.performanceTracker.time(
          `scan_${framework}`,
          async () => {
            switch (framework) {
              case 'express':
                return this.scanExpress();
              case 'fastify':
                return this.scanFastify();
              case 'nextjs':
                return this.scanNextJs();
              case 'hono':
                return this.scanHono();
              case 'koa':
                return this.scanKoa();
              case 'nestjs':
                return this.scanNestJs();
              default:
                return [];
            }
          }
        );

        this.logger.debug(`Scanned ${framework}`, {
          routeCount: frameworkRoutes.length,
          durationMs: Math.round(durationMs),
        });

        return frameworkRoutes;
      });

      const allRoutes = await Promise.all(scanPromises);
      routes.push(...allRoutes.flat());

      // Deduplicate routes
      const deduped = this.deduplicateRoutes(routes);
      const durationMs = performance.now() - startTime;

      this.logger.info('Route scan complete', {
        totalRoutes: deduped.length,
        duplicatesRemoved: routes.length - deduped.length,
        durationMs: Math.round(durationMs),
      });

      return deduped;
    } catch (error) {
      this.logger.error('Route scan failed', error as Error);
      throw wrapError(error, { component: 'RouteScanner', operation: 'scan' });
    } finally {
      // Clear file cache to free memory
      this.fileCache.clear();
    }
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): Record<string, unknown> {
    return this.performanceTracker.export();
  }

  /**
   * Get files matching patterns with caching
   */
  private async getFiles(patterns: string[]): Promise<string[]> {
    const files: string[] = [];
    
    for (const pattern of patterns) {
      try {
        const matches = await glob(pattern, {
          cwd: this.projectRoot,
          ignore: this.config.excludePatterns,
          absolute: true,
          nodir: true,
        });
        files.push(...matches);
      } catch (error) {
        this.logger.warn(`Glob pattern failed: ${pattern}`, { error: error instanceof Error ? error.message : 'Unknown' });
      }
    }

    return [...new Set(files)];
  }

  /**
   * Read file with caching and size limit
   */
  private async readFile(filePath: string): Promise<string | null> {
    // Check cache
    const cached = this.fileCache.get(filePath);
    if (cached !== undefined) return cached;

    try {
      // Check file size
      const stat = await fs.stat(filePath);
      if (stat.size > this.config.maxFileSize) {
        this.logger.debug(`Skipping large file: ${filePath}`, { size: stat.size });
        return null;
      }

      const content = await fs.readFile(filePath, 'utf-8');
      this.fileCache.set(filePath, content);
      return content;
    } catch {
      return null;
    }
  }

  /**
   * Extract route parameters from path (e.g., :id, [id])
   */
  private extractParameters(routePath: string): RouteDefinition['parameters'] {
    const params: NonNullable<RouteDefinition['parameters']> = [];

    // Express/Fastify style: :param or :param?
    const colonParams = routePath.match(/:(\w+)\??/g);
    if (colonParams) {
      for (const param of colonParams) {
        const name = param.replace(/[:?]/g, '');
        params.push({
          name,
          type: this.inferParamType(name),
          required: !param.endsWith('?'),
        });
      }
    }

    // Next.js style: [param] or [[...param]] or [...param]
    const bracketParams = routePath.match(/\[+\.{0,3}(\w+)\]+/g);
    if (bracketParams) {
      for (const param of bracketParams) {
        const name = param.replace(/[\[\]\.]/g, '');
        const isCatchAll = param.includes('...');
        const isOptional = param.startsWith('[[');
        params.push({
          name,
          type: isCatchAll ? 'string' : this.inferParamType(name),
          required: !isOptional,
        });
      }
    }

    // Fastify style: :param(regex)
    const regexParams = routePath.match(/:(\w+)\([^)]+\)/g);
    if (regexParams) {
      for (const param of regexParams) {
        const name = param.match(/:(\w+)/)?.[1] ?? param;
        if (!params.some(p => p.name === name)) {
          params.push({
            name,
            type: this.inferParamType(name),
            required: true,
          });
        }
      }
    }

    return params;
  }

  /**
   * Infer parameter type from its name
   */
  private inferParamType(name: string): 'string' | 'number' | 'boolean' | 'uuid' {
    const nameLower = name.toLowerCase();
    
    // UUID patterns
    if (nameLower === 'id' || nameLower === 'uuid' || nameLower.endsWith('id') || nameLower.endsWith('uuid')) {
      return 'uuid';
    }
    
    // Number patterns
    if (
      nameLower.includes('count') ||
      nameLower.includes('page') ||
      nameLower.includes('limit') ||
      nameLower.includes('offset') ||
      nameLower.includes('index') ||
      nameLower.includes('number') ||
      nameLower.includes('size') ||
      nameLower.includes('year') ||
      nameLower.includes('month') ||
      nameLower.includes('day')
    ) {
      return 'number';
    }

    // Boolean patterns
    if (
      nameLower.includes('active') ||
      nameLower.includes('enabled') ||
      nameLower.includes('flag')
    ) {
      return 'boolean';
    }

    return 'string';
  }

  /**
   * Extract middleware names from a line
   */
  private extractMiddleware(content: string): string[] {
    const middleware: string[] = [];

    for (const pattern of MIDDLEWARE_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const name = match[1];
        if (name && !middleware.includes(name)) {
          middleware.push(name);
        }
      }
    }

    return middleware;
  }

  /**
   * Find line number for a position in content
   */
  private findLineNumber(content: string, position: number): number {
    let lineNumber = 1;
    let charCount = 0;
    
    for (const line of content.split('\n')) {
      charCount += line.length + 1;
      if (charCount > position) break;
      lineNumber++;
    }
    
    return lineNumber;
  }

  /**
   * Scan for Express routes
   */
  private async scanExpress(): Promise<RouteDefinition[]> {
    const routes: RouteDefinition[] = [];
    const files = await this.getFiles(['**/*.ts', '**/*.js']);

    // Patterns to match Express routes
    const routePatterns = [
      // app.METHOD or router.METHOD
      /(?:app|router)\.(get|post|put|patch|delete|options|head|all)\s*\(\s*['"`]([^'"`]+)['"`]/gi,
      // Route with array of paths
      /(?:app|router)\.(get|post|put|patch|delete|options|head)\s*\(\s*\[\s*['"`]([^'"`]+)['"`]/gi,
    ];

    await parallelLimit(files, this.config.parallelLimit, async (filePath) => {
      const content = await this.readFile(filePath);
      if (!content) return;

      // Check if file uses express
      if (!content.includes('express') && !content.includes('Router') && !content.includes('router.')) {
        return;
      }

      const relativePath = path.relative(this.projectRoot, filePath);

      for (const pattern of routePatterns) {
        pattern.lastIndex = 0;
        let match;
        
        while ((match = pattern.exec(content)) !== null) {
          const method = (match[1] || 'get').toUpperCase() as HttpMethod;
          const routePath = match[2] || match[1];
          const lineNumber = this.findLineNumber(content, match.index);

          // Get surrounding context for middleware detection
          const lineStart = content.lastIndexOf('\n', match.index) + 1;
          const lineEnd = content.indexOf('\n', match.index);
          const lineContent = content.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);

          // Extract handler name
          const afterMatch = content.slice(match.index + match[0].length, match.index + match[0].length + 200);
          const handlerMatch = afterMatch.match(/,\s*(\w+)|,\s*(?:async\s+)?(?:function\s+)?(\w+)/);
          const handler = handlerMatch ? (handlerMatch[1] || handlerMatch[2] || 'anonymous') : 'anonymous';

          // Check for auth middleware
          const hasAuth = AUTH_PATTERNS.test(lineContent);

          routes.push({
            path: routePath,
            method: method === 'ALL' ? 'GET' : method,
            handler,
            file: relativePath,
            line: lineNumber,
            parameters: this.extractParameters(routePath),
            middleware: this.extractMiddleware(lineContent),
            auth: hasAuth ? { required: true } : undefined,
          });
        }
      }
    });

    return routes;
  }

  /**
   * Scan for Fastify routes
   */
  private async scanFastify(): Promise<RouteDefinition[]> {
    const routes: RouteDefinition[] = [];
    const files = await this.getFiles(['**/*.ts', '**/*.js']);

    const routePatterns = [
      // fastify.METHOD('/path', ...)
      /(?:fastify|app|server)\.(get|post|put|patch|delete|options|head)\s*\(\s*['"`]([^'"`]+)['"`]/gi,
      // .route({ method: 'GET', url: '/path' })
      /\.route\s*\(\s*\{[^}]*method\s*:\s*['"`](\w+)['"`][^}]*url\s*:\s*['"`]([^'"`]+)['"`]/gi,
      // Reverse order in route config
      /\.route\s*\(\s*\{[^}]*url\s*:\s*['"`]([^'"`]+)['"`][^}]*method\s*:\s*['"`](\w+)['"`]/gi,
    ];

    await parallelLimit(files, this.config.parallelLimit, async (filePath) => {
      const content = await this.readFile(filePath);
      if (!content) return;

      if (!content.includes('fastify') && !content.includes('Fastify')) {
        return;
      }

      const relativePath = path.relative(this.projectRoot, filePath);

      for (const pattern of routePatterns) {
        pattern.lastIndex = 0;
        let match;
        
        while ((match = pattern.exec(content)) !== null) {
          // Handle different match orders
          let method: string;
          let routePath: string;
          
          if (pattern.source.includes('url.*method')) {
            routePath = match[1];
            method = match[2];
          } else {
            method = match[1];
            routePath = match[2];
          }

          routes.push({
            path: routePath,
            method: method.toUpperCase() as HttpMethod,
            handler: 'handler',
            file: relativePath,
            line: this.findLineNumber(content, match.index),
            parameters: this.extractParameters(routePath),
          });
        }
      }
    });

    return routes;
  }

  /**
   * Scan for Next.js App Router routes
   */
  private async scanNextJs(): Promise<RouteDefinition[]> {
    const routes: RouteDefinition[] = [];
    
    // Look for route.ts/route.js files in app directory
    const routeFiles = await this.getFiles(['**/app/**/route.ts', '**/app/**/route.js', '**/pages/api/**/*.ts', '**/pages/api/**/*.js']);

    await parallelLimit(routeFiles, this.config.parallelLimit, async (filePath) => {
      const content = await this.readFile(filePath);
      if (!content) return;

      const relativePath = path.relative(this.projectRoot, filePath);
      const routePath = this.filePathToNextJsRoute(filePath);

      // Check for App Router route handlers
      if (filePath.includes('/app/')) {
        for (const method of HTTP_METHODS) {
          // Match: export async function GET, export function POST, export const GET
          const patterns = [
            new RegExp(`export\\s+(?:async\\s+)?function\\s+${method}\\b`, 'i'),
            new RegExp(`export\\s+const\\s+${method}\\s*=`, 'i'),
          ];

          for (const pattern of patterns) {
            const match = content.match(pattern);
            if (match) {
              routes.push({
                path: routePath,
                method,
                handler: method,
                file: relativePath,
                line: this.findLineNumber(content, match.index || 0),
                parameters: this.extractParameters(routePath),
              });
              break;
            }
          }
        }
      } else {
        // Pages API routes - default export handles all methods
        const hasExport = /export\s+default\s+(?:async\s+)?function|module\.exports\s*=/.test(content);
        if (hasExport) {
          // Try to detect which methods are handled
          const handledMethods: HttpMethod[] = [];
          
          for (const method of HTTP_METHODS) {
            if (new RegExp(`req\\.method\\s*===?\\s*['"\`]${method}['"\`]`, 'i').test(content)) {
              handledMethods.push(method);
            }
          }

          // If no specific methods detected, assume GET
          if (handledMethods.length === 0) {
            handledMethods.push('GET');
          }

          for (const method of handledMethods) {
            routes.push({
              path: routePath,
              method,
              handler: 'default',
              file: relativePath,
              line: 1,
              parameters: this.extractParameters(routePath),
            });
          }
        }
      }
    });

    return routes;
  }

  /**
   * Convert Next.js file path to route path
   */
  private filePathToNextJsRoute(filePath: string): string {
    // App Router: app/api/users/[id]/route.ts -> /api/users/[id]
    const appMatch = filePath.match(/[/\\]app[/\\](.+)[/\\]route\.[tj]s$/i);
    if (appMatch) {
      let routePath = '/' + appMatch[1].replace(/\\/g, '/');
      routePath = routePath.replace(/\[\[\.\.\.(\w+)\]\]/g, '[...$1]');
      return routePath;
    }

    // Pages API: pages/api/users/[id].ts -> /api/users/[id]
    const pagesMatch = filePath.match(/[/\\]pages[/\\]api[/\\](.+)\.[tj]s$/i);
    if (pagesMatch) {
      let routePath = '/api/' + pagesMatch[1].replace(/\\/g, '/');
      // Handle index files
      routePath = routePath.replace(/\/index$/, '');
      return routePath || '/api';
    }

    return '/';
  }

  /**
   * Scan for Hono routes
   */
  private async scanHono(): Promise<RouteDefinition[]> {
    const routes: RouteDefinition[] = [];
    const files = await this.getFiles(['**/*.ts', '**/*.js']);

    const routePatterns = [
      /(?:app|hono)\.(get|post|put|patch|delete|options|head|all)\s*\(\s*['"`]([^'"`]+)['"`]/gi,
    ];

    await parallelLimit(files, this.config.parallelLimit, async (filePath) => {
      const content = await this.readFile(filePath);
      if (!content) return;

      if (!content.includes('Hono') && !content.includes('hono')) {
        return;
      }

      const relativePath = path.relative(this.projectRoot, filePath);

      for (const pattern of routePatterns) {
        pattern.lastIndex = 0;
        let match;
        
        while ((match = pattern.exec(content)) !== null) {
          const method = match[1].toUpperCase() as HttpMethod;
          const routePath = match[2];

          routes.push({
            path: routePath,
            method: method === 'ALL' ? 'GET' : method,
            handler: 'handler',
            file: relativePath,
            line: this.findLineNumber(content, match.index),
            parameters: this.extractParameters(routePath),
          });
        }
      }
    });

    return routes;
  }

  /**
   * Scan for Koa routes
   */
  private async scanKoa(): Promise<RouteDefinition[]> {
    const routes: RouteDefinition[] = [];
    const files = await this.getFiles(['**/*.ts', '**/*.js']);

    const routePatterns = [
      // koa-router style
      /router\.(get|post|put|patch|delete|options|head|all)\s*\(\s*['"`]([^'"`]+)['"`]/gi,
    ];

    await parallelLimit(files, this.config.parallelLimit, async (filePath) => {
      const content = await this.readFile(filePath);
      if (!content) return;

      if (!content.includes('koa-router') && !content.includes('@koa/router')) {
        return;
      }

      const relativePath = path.relative(this.projectRoot, filePath);

      for (const pattern of routePatterns) {
        pattern.lastIndex = 0;
        let match;
        
        while ((match = pattern.exec(content)) !== null) {
          const method = match[1].toUpperCase() as HttpMethod;
          const routePath = match[2];

          routes.push({
            path: routePath,
            method: method === 'ALL' ? 'GET' : method,
            handler: 'handler',
            file: relativePath,
            line: this.findLineNumber(content, match.index),
            parameters: this.extractParameters(routePath),
          });
        }
      }
    });

    return routes;
  }

  /**
   * Scan for NestJS routes
   */
  private async scanNestJs(): Promise<RouteDefinition[]> {
    const routes: RouteDefinition[] = [];
    const files = await this.getFiles(['**/*.controller.ts', '**/*.controller.js']);

    await parallelLimit(files, this.config.parallelLimit, async (filePath) => {
      const content = await this.readFile(filePath);
      if (!content) return;

      const relativePath = path.relative(this.projectRoot, filePath);

      // Extract controller path
      const controllerMatch = content.match(/@Controller\s*\(\s*['"`]([^'"`]*)['"`]\s*\)/);
      const basePath = controllerMatch ? `/${controllerMatch[1]}` : '';

      // Find method decorators
      const methodPatterns = [
        /@(Get|Post|Put|Patch|Delete|Options|Head)\s*\(\s*['"`]?([^'"`)\s]*)['"`]?\s*\)/gi,
      ];

      for (const pattern of methodPatterns) {
        pattern.lastIndex = 0;
        let match;
        
        while ((match = pattern.exec(content)) !== null) {
          const method = match[1].toUpperCase() as HttpMethod;
          const methodPath = match[2] || '';
          const fullPath = `${basePath}/${methodPath}`.replace(/\/+/g, '/') || '/';

          // Find the method name (next line typically has the method definition)
          const afterDecorator = content.slice(match.index + match[0].length, match.index + match[0].length + 200);
          const methodNameMatch = afterDecorator.match(/(?:async\s+)?(\w+)\s*\(/);
          const handler = methodNameMatch?.[1] ?? 'handler';

          routes.push({
            path: fullPath,
            method,
            handler,
            file: relativePath,
            line: this.findLineNumber(content, match.index),
            parameters: this.extractParameters(fullPath),
          });
        }
      }
    });

    return routes;
  }

  private deduplicateRoutes(routes: RouteDefinition[]): RouteDefinition[] {
    const seen = new Map<string, RouteDefinition>();
    
    for (const route of routes) {
      const key = `${route.method}:${route.path}`;
      
      // Keep the first occurrence (usually more detailed)
      if (!seen.has(key)) {
        seen.set(key, route);
      }
    }
    
    return Array.from(seen.values());
  }
}
