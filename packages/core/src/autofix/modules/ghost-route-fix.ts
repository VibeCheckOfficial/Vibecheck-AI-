/**
 * Ghost Route Fix Module
 * 
 * Fixes invalid or missing route issues:
 * - Generates stub route handlers (501 Not Implemented)
 * - Creates placeholder page components
 * - Flags dead links for removal
 */

import { join, dirname, basename } from 'path';
import type { Issue, Patch, FixContext, IssueType, ConfidenceLevel } from '../types.js';
import { BaseFixModule } from './base-fix-module.js';

/**
 * Framework detection result
 */
type Framework = 'express' | 'nextjs-pages' | 'nextjs-app' | 'fastify' | 'hono' | 'unknown';

/**
 * Route information parsed from the issue
 */
interface RouteInfo {
  method: string;
  path: string;
  isApiRoute: boolean;
  isPageRoute: boolean;
}

/**
 * Route templates for different frameworks
 */
const ROUTE_TEMPLATES = {
  express: (route: RouteInfo) => `
/**
 * ${route.method.toUpperCase()} ${route.path}
 * TODO: Implement this endpoint
 */
router.${route.method.toLowerCase()}('${route.path}', (req, res) => {
  res.status(501).json({
    error: 'Not Implemented',
    message: 'This endpoint is not yet implemented',
    path: '${route.path}',
  });
});
`,

  fastify: (route: RouteInfo) => `
/**
 * ${route.method.toUpperCase()} ${route.path}
 * TODO: Implement this endpoint
 */
fastify.${route.method.toLowerCase()}('${route.path}', async (request, reply) => {
  return reply.status(501).send({
    error: 'Not Implemented',
    message: 'This endpoint is not yet implemented',
    path: '${route.path}',
  });
});
`,

  'nextjs-pages-api': (route: RouteInfo) => `
import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * ${route.method.toUpperCase()} ${route.path}
 * TODO: Implement this endpoint
 */
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== '${route.method.toUpperCase()}') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  
  return res.status(501).json({
    error: 'Not Implemented',
    message: 'This endpoint is not yet implemented',
    path: '${route.path}',
  });
}
`,

  'nextjs-app-api': (route: RouteInfo) => `
import { NextResponse } from 'next/server';

/**
 * ${route.method.toUpperCase()} ${route.path}
 * TODO: Implement this endpoint
 */
export async function ${route.method.toUpperCase()}() {
  return NextResponse.json(
    {
      error: 'Not Implemented',
      message: 'This endpoint is not yet implemented',
      path: '${route.path}',
    },
    { status: 501 }
  );
}
`,

  'nextjs-page': (route: RouteInfo) => `
/**
 * ${route.path} Page
 * TODO: Implement this page
 */
export default function Page() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Page Not Implemented</h1>
        <p className="text-gray-600">This page is under construction.</p>
        <p className="text-sm text-gray-400">${route.path}</p>
      </div>
    </div>
  );
}
`,

  'nextjs-app-page': (route: RouteInfo) => `
/**
 * ${route.path} Page
 * TODO: Implement this page
 */
export default function Page() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Page Not Implemented</h1>
        <p className="text-gray-600">This page is under construction.</p>
        <p className="text-sm text-gray-400">${route.path}</p>
      </div>
    </div>
  );
}
`,
};

/**
 * GhostRouteFixModule handles missing route issues
 */
export class GhostRouteFixModule extends BaseFixModule {
  readonly id = 'ghost-route-fix';
  readonly name = 'Ghost Route Fix';
  readonly issueTypes: IssueType[] = ['ghost-route'];
  readonly confidence: ConfidenceLevel = 'medium';

  /**
   * Check if this module can fix the given issue
   */
  canFix(issue: Issue): boolean {
    // Need the route path to generate a fix
    const routePath = this.getIssueValue(issue);
    return this.issueTypes.includes(issue.type) && !!routePath;
  }

  /**
   * Generate a fix for the given issue
   */
  async generateFix(issue: Issue, context: FixContext): Promise<Patch | null> {
    const routePath = this.getIssueValue(issue);
    if (!routePath) {
      return null;
    }

    // Parse the route info
    const routeInfo = this.parseRouteInfo(routePath);

    // Detect the framework
    const framework = await this.detectFramework(context);

    // Generate the appropriate fix
    switch (framework) {
      case 'express':
        return this.generateExpressFix(routeInfo, context, issue.id);

      case 'nextjs-pages':
        return this.generateNextJsPagesFix(routeInfo, context, issue.id);

      case 'nextjs-app':
        return this.generateNextJsAppFix(routeInfo, context, issue.id);

      case 'fastify':
        return this.generateFastifyFix(routeInfo, context, issue.id);

      default:
        // Generate a generic stub
        return this.generateGenericFix(routeInfo, context, issue.id);
    }
  }

  /**
   * Get a human-readable description of the fix
   */
  getFixDescription(issue: Issue): string {
    const routePath = this.getIssueValue(issue) ?? 'route';
    return `Create stub handler for missing route: ${routePath}`;
  }

  /**
   * Get module description
   */
  protected getModuleDescription(): string {
    return 'Creates stub handlers for missing routes to prevent 404 errors';
  }

  /**
   * Parse route information from the path
   */
  private parseRouteInfo(path: string): RouteInfo {
    // Extract method if present (e.g., "GET /api/users" or just "/api/users")
    let method = 'GET';
    let routePath = path;

    const methodMatch = path.match(/^(GET|POST|PUT|DELETE|PATCH)\s+(.+)$/i);
    if (methodMatch) {
      method = methodMatch[1].toUpperCase();
      routePath = methodMatch[2];
    }

    // Determine if it's an API route or page route
    const isApiRoute = routePath.includes('/api/') || routePath.startsWith('/api');
    const isPageRoute = !isApiRoute;

    return {
      method,
      path: routePath,
      isApiRoute,
      isPageRoute,
    };
  }

  /**
   * Detect the framework being used
   */
  private async detectFramework(context: FixContext): Promise<Framework> {
    // Check for Next.js app directory
    if (
      this.fileExists(context, 'app') ||
      this.fileExists(context, 'src/app')
    ) {
      return 'nextjs-app';
    }

    // Check for Next.js pages directory
    if (
      this.fileExists(context, 'pages') ||
      this.fileExists(context, 'src/pages')
    ) {
      return 'nextjs-pages';
    }

    // Check truthpack for route framework hints
    const routes = context.truthpack?.routes;
    if (routes && routes.length > 0) {
      const firstRoute = routes[0];
      if (firstRoute.file?.includes('express') || firstRoute.middleware?.some(m => m.includes('express'))) {
        return 'express';
      }
      if (firstRoute.file?.includes('fastify')) {
        return 'fastify';
      }
    }

    // Default to express for API-style routes
    return 'express';
  }

  /**
   * Generate fix for Express routes
   */
  private async generateExpressFix(
    route: RouteInfo,
    context: FixContext,
    issueId: string
  ): Promise<Patch | null> {
    // Find the main routes file
    const routesPaths = [
      'src/routes/index.ts',
      'src/routes/index.js',
      'routes/index.ts',
      'routes/index.js',
      'src/api/index.ts',
      'src/api/index.js',
    ];

    let routesFile: string | null = null;
    let routesContent: string | null = null;

    for (const path of routesPaths) {
      routesContent = await this.readFile(context, path);
      if (routesContent !== null) {
        routesFile = path;
        break;
      }
    }

    if (!routesFile || !routesContent) {
      // Create a new routes file
      routesFile = 'src/routes/index.ts';
      const newContent = this.generateExpressRoutesFile(route);
      return this.createNewFilePatch(routesFile, newContent, issueId);
    }

    // Add the route to the existing file
    const routeCode = ROUTE_TEMPLATES.express(route).trim();
    const newContent = this.appendToFile(routesContent, routeCode);

    return this.createPatch(routesFile, routesContent, newContent, issueId);
  }

  /**
   * Generate a complete Express routes file
   */
  private generateExpressRoutesFile(route: RouteInfo): string {
    return `
import express from 'express';

const router = express.Router();

${ROUTE_TEMPLATES.express(route).trim()}

export default router;
`.trim() + '\n';
  }

  /**
   * Generate fix for Next.js pages directory
   */
  private async generateNextJsPagesFix(
    route: RouteInfo,
    context: FixContext,
    issueId: string
  ): Promise<Patch | null> {
    // Determine the file path
    const basePath = this.fileExists(context, 'src/pages') ? 'src/pages' : 'pages';
    
    let filePath: string;
    let content: string;

    if (route.isApiRoute) {
      // API route: /api/users -> pages/api/users.ts
      const apiPath = route.path.replace(/^\/api/, '');
      filePath = join(basePath, 'api', `${apiPath || 'index'}.ts`);
      content = ROUTE_TEMPLATES['nextjs-pages-api'](route).trim() + '\n';
    } else {
      // Page route: /about -> pages/about.tsx
      const pagePath = route.path === '/' ? 'index' : route.path.slice(1);
      filePath = join(basePath, `${pagePath}.tsx`);
      content = ROUTE_TEMPLATES['nextjs-page'](route).trim() + '\n';
    }

    // Check if file already exists
    const existingContent = await this.readFile(context, filePath);
    if (existingContent !== null) {
      // File exists, return null to avoid overwriting
      return null;
    }

    return this.createNewFilePatch(filePath, content, issueId);
  }

  /**
   * Generate fix for Next.js app directory
   */
  private async generateNextJsAppFix(
    route: RouteInfo,
    context: FixContext,
    issueId: string
  ): Promise<Patch | null> {
    // Determine the file path
    const basePath = this.fileExists(context, 'src/app') ? 'src/app' : 'app';
    
    let filePath: string;
    let content: string;

    if (route.isApiRoute) {
      // API route: /api/users -> app/api/users/route.ts
      const apiPath = route.path.replace(/^\/api/, '');
      const segments = apiPath.split('/').filter(Boolean);
      filePath = join(basePath, 'api', ...segments, 'route.ts');
      content = ROUTE_TEMPLATES['nextjs-app-api'](route).trim() + '\n';
    } else {
      // Page route: /about -> app/about/page.tsx
      const segments = route.path.split('/').filter(Boolean);
      filePath = join(basePath, ...segments, 'page.tsx');
      content = ROUTE_TEMPLATES['nextjs-app-page'](route).trim() + '\n';
    }

    // Check if file already exists
    const existingContent = await this.readFile(context, filePath);
    if (existingContent !== null) {
      return null;
    }

    return this.createNewFilePatch(filePath, content, issueId);
  }

  /**
   * Generate fix for Fastify routes
   */
  private async generateFastifyFix(
    route: RouteInfo,
    context: FixContext,
    issueId: string
  ): Promise<Patch | null> {
    // Similar to Express, find routes file
    const routesPaths = [
      'src/routes/index.ts',
      'src/routes/index.js',
      'routes/index.ts',
    ];

    let routesFile: string | null = null;
    let routesContent: string | null = null;

    for (const path of routesPaths) {
      routesContent = await this.readFile(context, path);
      if (routesContent !== null) {
        routesFile = path;
        break;
      }
    }

    if (!routesFile || !routesContent) {
      routesFile = 'src/routes/index.ts';
      const newContent = this.generateFastifyRoutesFile(route);
      return this.createNewFilePatch(routesFile, newContent, issueId);
    }

    const routeCode = ROUTE_TEMPLATES.fastify(route).trim();
    const newContent = this.appendToFile(routesContent, routeCode);

    return this.createPatch(routesFile, routesContent, newContent, issueId);
  }

  /**
   * Generate a complete Fastify routes file
   */
  private generateFastifyRoutesFile(route: RouteInfo): string {
    return `
import type { FastifyInstance } from 'fastify';

export default async function routes(fastify: FastifyInstance) {
${ROUTE_TEMPLATES.fastify(route).trim()}
}
`.trim() + '\n';
  }

  /**
   * Generate a generic fix when framework is unknown
   */
  private async generateGenericFix(
    route: RouteInfo,
    context: FixContext,
    issueId: string
  ): Promise<Patch | null> {
    // Create a standalone handler file
    const fileName = route.path
      .split('/')
      .filter(Boolean)
      .join('-') || 'index';
    
    const filePath = `src/handlers/${fileName}.ts`;

    const content = `
/**
 * Handler for ${route.method.toUpperCase()} ${route.path}
 * TODO: Implement this handler and register it with your framework
 */

export interface Request {
  method: string;
  path: string;
  body?: unknown;
  query?: Record<string, string>;
  params?: Record<string, string>;
}

export interface Response {
  status: number;
  body: unknown;
}

export async function handle(req: Request): Promise<Response> {
  return {
    status: 501,
    body: {
      error: 'Not Implemented',
      message: 'This endpoint is not yet implemented',
      path: '${route.path}',
    },
  };
}
`.trim() + '\n';

    return this.createNewFilePatch(filePath, content, issueId);
  }

  /**
   * Append code to the end of a file (before the last export if present)
   */
  private appendToFile(content: string, code: string): string {
    const lines = content.split('\n');
    
    // Find the last export default statement
    let insertIndex = lines.length;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].includes('export default')) {
        insertIndex = i;
        break;
      }
    }

    // Insert before the export or at the end
    lines.splice(insertIndex, 0, '', code, '');

    return lines.join('\n');
  }
}
