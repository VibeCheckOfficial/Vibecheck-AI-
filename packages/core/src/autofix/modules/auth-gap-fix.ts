/**
 * Auth Gap Fix Module
 * 
 * Detects and fixes missing authentication/authorization checks:
 * - Express routes without auth middleware
 * - Next.js pages/API routes without auth guards
 * - Protected paths without proper access control
 * 
 * @module autofix/modules/auth-gap-fix
 */

import * as parser from '@babel/parser';
import _traverse from '@babel/traverse';
import * as t from '@babel/types';

const traverse = (_traverse as unknown as { default: typeof _traverse }).default ?? _traverse;
import type { Issue, Patch, FixContext, IssueType, ConfidenceLevel } from '../types.js';
import { BaseFixModule } from './base-fix-module.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Supported web frameworks for auth detection
 */
type Framework = 'express' | 'nextjs' | 'fastify' | 'hono' | 'unknown';

/**
 * Route information requiring auth fix
 */
interface RouteToFix {
  /** Line number in the source file */
  line: number;
  /** Route path string */
  route: string;
}

/**
 * Auth middleware templates
 */
const AUTH_MIDDLEWARE_TEMPLATES = {
  express: {
    middleware: `
/**
 * Authentication middleware
 * Verifies that the request has a valid authentication token
 */
export const requireAuth = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  try {
    // TODO: Verify token and attach user to request
    // const user = verifyToken(token);
    // req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid authentication token' });
  }
};
`,
    import: "const { requireAuth } = require('./middleware/auth');",
    importES: "import { requireAuth } from './middleware/auth.js';",
  },
  nextjs: {
    middleware: `
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Middleware to protect routes
 */
export function middleware(request: NextRequest) {
  const token = request.cookies.get('token')?.value;
  
  // Define protected paths
  const protectedPaths = ['/admin', '/dashboard', '/api/admin'];
  const isProtectedPath = protectedPaths.some(path => 
    request.nextUrl.pathname.startsWith(path)
  );
  
  if (isProtectedPath && !token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/dashboard/:path*', '/api/admin/:path*'],
};
`,
    apiGuard: `
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function requireAuth(req) {
  const session = await getServerSession(authOptions);
  
  if (!session) {
    throw new Error('Unauthorized');
  }
  
  return session;
}
`,
  },
};

// ============================================================================
// Module Implementation
// ============================================================================

/**
 * AuthGapFixModule handles missing authentication issues.
 * 
 * Analyzes code to detect unprotected routes and generates patches
 * to add appropriate authentication middleware based on the framework.
 * 
 * Supported frameworks:
 * - Express.js
 * - Next.js (App Router and Pages Router)
 * - Fastify
 * - Hono
 * 
 * @example
 * const module = new AuthGapFixModule();
 * if (module.canFix(issue)) {
 *   const patch = await module.generateFix(issue, context);
 * }
 */
export class AuthGapFixModule extends BaseFixModule {
  readonly id = 'auth-gap-fix';
  readonly name = 'Auth Gap Fix';
  readonly issueTypes: IssueType[] = ['auth-gap'];
  readonly confidence: ConfidenceLevel = 'medium';

  /**
   * Determines if this module can fix the given issue.
   * 
   * @param issue - The issue to evaluate
   * @returns True if this module can generate a fix for the issue
   * 
   * @example
   * if (module.canFix(issue)) {
   *   // Proceed with fix generation
   * }
   */
  canFix(issue: Issue): boolean {
    if (!issue.filePath) {
      return false;
    }

    const ext = issue.filePath.split('.').pop()?.toLowerCase();
    const supportedExtensions = ['ts', 'tsx', 'js', 'jsx'];
    if (!ext || !supportedExtensions.includes(ext)) {
      return false;
    }

    return this.issueTypes.includes(issue.type);
  }

  /**
   * Generates a fix patch for the given authentication gap issue.
   * 
   * Analyzes the file to detect the framework being used and applies
   * the appropriate fix strategy.
   * 
   * @param issue - The auth-gap issue to fix
   * @param context - Fix context including truthpack data
   * @returns Promise resolving to the patch, or null if fix cannot be generated
   * @throws Never throws - returns null on errors
   * 
   * @example
   * const patch = await module.generateFix(issue, context);
   * if (patch) {
   *   await applyPatch(patch);
   * }
   */
  async generateFix(issue: Issue, context: FixContext): Promise<Patch | null> {
    const filePath = this.getIssueFilePath(issue);
    if (!filePath) {
      return null;
    }

    const content = await this.readFile(context, filePath);
    if (!content) {
      return null;
    }

    try {
      // Detect framework from content and file path
      const framework = this.detectFramework(content, filePath, context);

      // Get the route/path that needs protection
      const routePath = this.getIssueValue(issue);

      // Apply framework-specific fix
      let fixedContent: string;
      
      switch (framework) {
        case 'express':
          fixedContent = await this.fixExpressRoute(content, filePath, routePath, context);
          break;
        
        case 'nextjs':
          fixedContent = await this.fixNextJsRoute(content, filePath, routePath, context);
          break;
        
        case 'fastify':
          fixedContent = this.fixFastifyRoute(content, routePath);
          break;
        
        default:
          // Generic fix: add a TODO comment
          fixedContent = this.addAuthTodo(content, issue);
      }

      if (fixedContent === content) {
        return null;
      }

      return this.createPatch(filePath, content, fixedContent, issue.id);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      // eslint-disable-next-line no-console
      console.error('Error generating auth gap fix:', errorMessage);
      return null;
    }
  }

  /**
   * Gets a human-readable description of the fix.
   * 
   * @param issue - The issue being fixed
   * @returns Description string for display to users
   */
  getFixDescription(issue: Issue): string {
    const routePath = this.getIssueValue(issue) ?? 'route';
    return `Add authentication check to ${routePath}`;
  }

  /**
   * Gets the module description for documentation.
   * 
   * @returns Module description string
   */
  protected getModuleDescription(): string {
    return 'Adds authentication middleware to unprotected routes and pages';
  }

  /**
   * Detect which framework is being used
   */
  private detectFramework(
    content: string,
    filePath: string,
    context: FixContext
  ): Framework {
    // Check for Next.js patterns
    if (
      filePath.includes('/pages/') ||
      filePath.includes('/app/') ||
      content.includes('next/') ||
      content.includes('NextResponse') ||
      content.includes('NextRequest')
    ) {
      return 'nextjs';
    }

    // Check for Express patterns
    if (
      content.includes('express') ||
      content.includes('app.get(') ||
      content.includes('app.post(') ||
      content.includes('router.get(') ||
      content.includes('router.post(')
    ) {
      return 'express';
    }

    // Check for Fastify patterns
    if (content.includes('fastify') || content.includes('fastify.get(')) {
      return 'fastify';
    }

    // Check for Hono patterns
    if (content.includes('Hono') || content.includes('hono')) {
      return 'hono';
    }

    return 'unknown';
  }

  /**
   * Fix an Express route by adding auth middleware
   */
  private async fixExpressRoute(
    content: string,
    filePath: string,
    routePath: string | undefined,
    context: FixContext
  ): Promise<string> {
    const ast = this.parseCode(content, filePath);
    if (!ast) {
      return content;
    }

    let modified = content;
    const lines = content.split('\n');
    const indent = this.detectIndentation(content);

    // Check if requireAuth is already imported
    const hasAuthImport = content.includes('requireAuth');
    
    // Find route definitions that need auth
    const routesToFix: { line: number; route: string }[] = [];

    traverse(ast, {
      CallExpression: (path) => {
        const node = path.node;
        const callee = node.callee;

        // Match app.get(), app.post(), router.get(), etc.
        if (
          t.isMemberExpression(callee) &&
          t.isIdentifier(callee.property) &&
          ['get', 'post', 'put', 'delete', 'patch'].includes(callee.property.name)
        ) {
          const args = node.arguments;
          
          // First argument should be the route path
          if (args.length >= 2 && t.isStringLiteral(args[0])) {
            const route = args[0].value;
            
            // Check if this route needs auth
            if (this.routeNeedsAuth(route, routePath, context)) {
              // Check if auth middleware is already present
              if (!this.hasAuthMiddleware(args)) {
                routesToFix.push({
                  line: node.loc?.start.line ?? 0,
                  route,
                });
              }
            }
          }
        }
      },
    });

    if (routesToFix.length === 0) {
      return content;
    }

    // Add import if needed
    if (!hasAuthImport) {
      const importLine = this.isESModule(content)
        ? AUTH_MIDDLEWARE_TEMPLATES.express.importES
        : AUTH_MIDDLEWARE_TEMPLATES.express.import;
      
      // Find where to add import
      const lastImportLine = this.findLastImportLine(lines);
      lines.splice(lastImportLine + 1, 0, importLine);
      
      // Adjust line numbers for the splice
      routesToFix.forEach((r) => {
        if (r.line > lastImportLine) {
          r.line++;
        }
      });
    }

    // Add requireAuth middleware to routes (process in reverse order)
    routesToFix.sort((a, b) => b.line - a.line);
    
    for (const routeInfo of routesToFix) {
      const lineIndex = routeInfo.line - 1;
      const line = lines[lineIndex];
      
      if (!line) continue;

      // Insert requireAuth after the route path
      // Match: app.get('/path', (req, res) => {
      // Result: app.get('/path', requireAuth, (req, res) => {
      const routeMatch = line.match(
        /((?:app|router)\.\w+\s*\(\s*['"`][^'"`]+['"`])\s*,\s*/
      );
      
      if (routeMatch) {
        lines[lineIndex] = line.replace(
          routeMatch[0],
          `${routeMatch[1]}, requireAuth, `
        );
      }
    }

    return lines.join('\n');
  }

  /**
   * Fix a Next.js route by adding auth guard
   */
  private async fixNextJsRoute(
    content: string,
    filePath: string,
    routePath: string | undefined,
    context: FixContext
  ): Promise<string> {
    const isApiRoute = filePath.includes('/api/') || filePath.includes('/app/api/');
    const isPageRoute = filePath.includes('/pages/') || filePath.includes('/app/');
    
    if (isApiRoute) {
      return this.fixNextJsApiRoute(content, filePath);
    } else if (isPageRoute) {
      return this.fixNextJsPage(content, filePath, context);
    }

    return content;
  }

  /**
   * Fix a Next.js API route
   */
  private fixNextJsApiRoute(content: string, filePath: string): string {
    const lines = content.split('\n');
    const indent = this.detectIndentation(content);
    const indentStr = indent.char.repeat(indent.size);

    // Check if getServerSession is already imported
    const hasSessionImport = content.includes('getServerSession');
    
    // Find the handler function
    const handlerMatch = content.match(
      /export\s+(?:default\s+)?(?:async\s+)?function\s+(\w+)?\s*\(/
    );
    
    if (!handlerMatch) {
      // Try arrow function export
      const arrowMatch = content.match(/export\s+(?:default\s+)?\s*(?:const\s+\w+\s*=\s*)?async\s*\([^)]*\)\s*=>/);
      if (!arrowMatch) {
        return content;
      }
    }

    // Add session check import if needed
    if (!hasSessionImport) {
      const importLine = "import { getServerSession } from 'next-auth';";
      const authOptionsImport = "import { authOptions } from '@/lib/auth';";
      
      const lastImportLine = this.findLastImportLine(lines);
      lines.splice(lastImportLine + 1, 0, importLine, authOptionsImport);
    }

    // Find the handler and add auth check at the start
    let inHandler = false;
    let braceCount = 0;
    let handlerStartLine = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      if (
        line.includes('export') &&
        (line.includes('function') || line.includes('=>'))
      ) {
        inHandler = true;
        handlerStartLine = i;
      }

      if (inHandler) {
        if (line.includes('{')) {
          braceCount++;
          if (braceCount === 1) {
            // Insert auth check after the opening brace
            const authCheck = [
              '',
              `${indentStr}// Authentication check`,
              `${indentStr}const session = await getServerSession(authOptions);`,
              `${indentStr}if (!session) {`,
              `${indentStr}${indentStr}return Response.json({ error: 'Unauthorized' }, { status: 401 });`,
              `${indentStr}}`,
              '',
            ].join('\n');
            
            // Check if auth check already exists
            if (!content.includes('getServerSession(authOptions)')) {
              lines.splice(i + 1, 0, authCheck);
            }
            break;
          }
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * Fix a Next.js page by creating/updating middleware
   */
  private async fixNextJsPage(
    content: string,
    filePath: string,
    context: FixContext
  ): Promise<string> {
    // For pages, we typically need to create middleware.ts
    // Check if middleware already exists
    const middlewarePath = 'middleware.ts';
    const existingMiddleware = await this.readFile(context, middlewarePath);

    if (existingMiddleware) {
      // TODO: Update existing middleware to protect this path
      // For now, add a comment
      return this.addAuthTodo(content, {
        id: 'auth-page',
        type: 'auth-gap',
        severity: 'high',
        message: `Page needs auth protection - update ${middlewarePath}`,
        source: 'static-analysis',
      });
    }

    // Add client-side auth check for now
    const lines = content.split('\n');
    const indent = this.detectIndentation(content);
    const indentStr = indent.char.repeat(indent.size);

    // Check if useSession is already imported
    if (!content.includes('useSession')) {
      const lastImportLine = this.findLastImportLine(lines);
      lines.splice(lastImportLine + 1, 0, "import { useSession } from 'next-auth/react';");
    }

    // Find the component function and add session check
    const componentMatch = content.match(
      /export\s+(?:default\s+)?function\s+(\w+)/
    );
    
    if (componentMatch) {
      // Find the opening brace of the component
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(componentMatch[0]) || lines[i].includes('function')) {
          // Find the opening brace
          for (let j = i; j < lines.length; j++) {
            if (lines[j].includes('{')) {
              // Check if session check already exists
              if (!content.includes('useSession()')) {
                const sessionCheck = [
                  '',
                  `${indentStr}const { data: session, status } = useSession();`,
                  '',
                  `${indentStr}if (status === 'loading') {`,
                  `${indentStr}${indentStr}return <div>Loading...</div>;`,
                  `${indentStr}}`,
                  '',
                  `${indentStr}if (!session) {`,
                  `${indentStr}${indentStr}return <div>Access Denied. Please sign in.</div>;`,
                  `${indentStr}}`,
                ].join('\n');
                
                lines.splice(j + 1, 0, sessionCheck);
              }
              break;
            }
          }
          break;
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * Fix a Fastify route
   */
  private fixFastifyRoute(content: string, routePath: string | undefined): string {
    // Add preHandler hook for auth
    const lines = content.split('\n');
    
    // Find route registration and add preHandler
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Match fastify.get('/path', opts, handler)
      const routeMatch = line.match(
        /(fastify\.\w+\s*\(\s*['"`][^'"`]+['"`])\s*,/
      );
      
      if (routeMatch && (!routePath || line.includes(routePath))) {
        // Check if preHandler already exists
        if (!line.includes('preHandler')) {
          lines[i] = line.replace(
            routeMatch[0],
            `${routeMatch[1]}, { preHandler: [fastify.authenticate] },`
          );
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * Add a TODO comment for auth requirement
   */
  private addAuthTodo(content: string, issue: Issue): string {
    const lines = content.split('\n');
    const routePath = this.getIssueValue(issue) ?? 'this route';
    
    // Add TODO at the top of the file
    lines.splice(0, 0, `// TODO: Add authentication check for ${routePath}`);
    
    return lines.join('\n');
  }

  /**
   * Check if a route needs authentication
   */
  private routeNeedsAuth(
    route: string,
    targetRoute: string | undefined,
    context: FixContext
  ): boolean {
    // If specific route is targeted, check for match
    if (targetRoute && route !== targetRoute) {
      return false;
    }

    // Check against protected patterns from truthpack
    const protectedResources = context.truthpack?.auth?.protectedResources ?? [];
    const publicPaths = context.truthpack?.auth?.publicPaths ?? [];

    // Check if route is in public paths
    if (publicPaths.some((p) => route.startsWith(p))) {
      return false;
    }

    // Check if route matches protected patterns
    if (protectedResources.some((r) => route.startsWith(r.path))) {
      return true;
    }

    // Default protection for admin/dashboard paths
    const protectedPatterns = ['/admin', '/dashboard', '/api/admin', '/api/private'];
    return protectedPatterns.some((p) => route.startsWith(p));
  }

  /**
   * Check if route already has auth middleware
   */
  private hasAuthMiddleware(args: t.Node[]): boolean {
    // Check if any argument is an auth-related identifier
    return args.some((arg) => {
      if (t.isIdentifier(arg)) {
        const name = arg.name.toLowerCase();
        return (
          name.includes('auth') ||
          name.includes('authenticate') ||
          name.includes('require') ||
          name.includes('protect') ||
          name.includes('guard')
        );
      }
      return false;
    });
  }

  /**
   * Parse code into AST
   */
  private parseCode(content: string, filePath: string): t.File | null {
    try {
      const isTypeScript = filePath.endsWith('.ts') || filePath.endsWith('.tsx');
      const isJSX = filePath.endsWith('.tsx') || filePath.endsWith('.jsx');

      return parser.parse(content, {
        sourceType: 'module',
        plugins: [
          isTypeScript ? 'typescript' : null,
          isJSX ? 'jsx' : null,
          'decorators-legacy',
          'classProperties',
        ].filter(Boolean) as parser.ParserPlugin[],
      });
    } catch {
      return null;
    }
  }

  /**
   * Check if content uses ES modules
   */
  private isESModule(content: string): boolean {
    return content.includes('import ') || content.includes('export ');
  }

  /**
   * Find the last import line in the file
   */
  private findLastImportLine(lines: string[]): number {
    let lastImport = -1;
    
    for (let i = 0; i < lines.length; i++) {
      if (
        lines[i].startsWith('import ') ||
        lines[i].startsWith('const ') && lines[i].includes('require(')
      ) {
        lastImport = i;
      }
    }
    
    return lastImport;
  }
}
