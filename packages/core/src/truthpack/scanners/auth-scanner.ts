/**
 * Auth Scanner
 * 
 * Scans codebase to extract authentication and authorization patterns.
 * Analyzes source files to identify:
 * - Role definitions
 * - Protected routes
 * - Auth providers (JWT, OAuth, sessions, etc.)
 * - Permission structures
 * 
 * @module truthpack/scanners/auth-scanner
 */

import { glob } from 'glob';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { AuthConfig, Role, ProtectedResource, AuthProvider } from '../schemas/auth.schema.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration options for the AuthScanner
 */
export interface AuthScannerConfig {
  /** Glob patterns for files to scan */
  patterns: string[];
  /** Glob patterns for files to exclude */
  excludePatterns: string[];
  /** Known auth middleware function names to detect */
  knownMiddleware: string[];
}

// ============================================================================
// Constants
// ============================================================================

/** Default scanner configuration */
const DEFAULT_CONFIG: AuthScannerConfig = {
  patterns: ['**/*.ts', '**/*.js'],
  excludePatterns: ['node_modules/**', 'dist/**', 'build/**'],
  knownMiddleware: [
    'authenticate', 'requireAuth', 'isAuthenticated',
    'authorize', 'requireRole', 'checkPermission',
    'authMiddleware', 'auth', 'protect', 'guard',
    'verifyToken', 'verifyJWT', 'ensureAuthenticated',
  ],
};

// ============================================================================
// Scanner Class
// ============================================================================

/**
 * Scans a codebase to extract authentication configuration.
 * 
 * Analyzes source files to detect auth patterns including:
 * - Role definitions (enums, constants, types)
 * - Protected routes with middleware
 * - Auth provider configurations
 * 
 * @example
 * const scanner = new AuthScanner('/path/to/project');
 * const authConfig = await scanner.scan();
 * console.log(authConfig.roles); // [{ name: 'admin', permissions: [...] }]
 */
export class AuthScanner {
  private readonly projectRoot: string;
  private readonly config: AuthScannerConfig;

  /**
   * Creates a new AuthScanner instance.
   * 
   * @param projectRoot - Absolute path to the project root directory
   * @param config - Optional configuration overrides
   */
  constructor(projectRoot: string, config: Partial<AuthScannerConfig> = {}) {
    if (!projectRoot) {
      throw new Error('Project root path is required');
    }
    this.projectRoot = projectRoot;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Gets all files matching the configured patterns.
   * 
   * @returns Promise resolving to array of absolute file paths
   * @throws {Error} If glob operation fails
   */
  private async getFiles(): Promise<string[]> {
    try {
      const files: string[] = [];
      for (const pattern of this.config.patterns) {
        const matches = await glob(pattern, {
          cwd: this.projectRoot,
          ignore: this.config.excludePatterns,
          absolute: true,
        });
        files.push(...matches);
      }
      // Remove duplicates
      return [...new Set(files)];
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to scan files: ${errorMessage}`);
    }
  }

  /**
   * Scans the project for authentication configuration.
   * 
   * Performs comprehensive analysis of the codebase to extract:
   * - Role definitions and their permissions
   * - Protected routes and required authorization
   * - Authentication provider configurations
   * - Public paths that don't require auth
   * 
   * @returns Promise resolving to partial auth configuration
   * @throws {Error} If scanning fails
   * 
   * @example
   * const scanner = new AuthScanner('/project');
   * const config = await scanner.scan();
   * console.log(`Found ${config.roles?.length} roles`);
   */
  async scan(): Promise<Partial<AuthConfig>> {
    try {
      const roles = await this.scanRoles();
      const protectedResources = await this.scanProtectedResources();
      const providers = await this.scanAuthProviders();

      return {
        roles,
        protectedResources,
        providers,
        publicPaths: this.inferPublicPaths(protectedResources),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Auth scan failed: ${errorMessage}`);
    }
  }

  /**
   * Scan for role definitions
   */
  private async scanRoles(): Promise<Role[]> {
    const roles: Role[] = [];
    const files = await this.getFiles();

    // Patterns to find role definitions
    const rolePatterns = [
      // const ROLES = { admin: {...}, user: {...} }
      /(?:const|let|var)\s+(?:ROLES|Roles|roles|USER_ROLES)\s*=\s*\{([^}]+)\}/gi,
      // enum Role { Admin = 'admin', User = 'user' }
      /enum\s+(?:Role|Roles|UserRole)\s*\{([^}]+)\}/gi,
      // type Role = 'admin' | 'user'
      /type\s+Role\s*=\s*([^;]+);/gi,
      // const roles = ['admin', 'user'] as const
      /(?:const|let|var)\s+roles\s*=\s*\[([^\]]+)\]/gi,
    ];

    // Patterns to find permissions
    const permissionPatterns = [
      // permissions: ['read', 'write']
      /permissions\s*:\s*\[([^\]]+)\]/gi,
      // PERMISSIONS = { ... }
      /(?:const|let|var)\s+PERMISSIONS\s*=\s*\{([^}]+)\}/gi,
    ];

    for (const filePath of files) {
      try {
        const content = await fs.readFile(filePath, 'utf-8');

        // Extract role names
        for (const pattern of rolePatterns) {
          pattern.lastIndex = 0;
          let match;
          while ((match = pattern.exec(content)) !== null) {
            const roleContent = match[1];
            const roleNames = this.extractIdentifiers(roleContent);
            
            for (const roleName of roleNames) {
              // Check if role already exists
              if (!roles.find(r => r.name.toLowerCase() === roleName.toLowerCase())) {
                // Try to find associated permissions
                const permissions = this.findPermissionsForRole(content, roleName);
                
                roles.push({
                  name: roleName,
                  permissions,
                  description: this.inferRoleDescription(roleName),
                });
              }
            }
          }
        }

        // Also look for role definitions in comments or JSDoc
        const docRoleMatch = content.match(/@role\s+(\w+)/gi);
        if (docRoleMatch) {
          for (const match of docRoleMatch) {
            const roleName = match.replace(/@role\s+/i, '');
            if (!roles.find(r => r.name.toLowerCase() === roleName.toLowerCase())) {
              roles.push({
                name: roleName,
                permissions: [],
              });
            }
          }
        }
      } catch {
        // Skip files that can't be read
      }
    }

    // Add common default roles if none found
    if (roles.length === 0) {
      return [
        { name: 'admin', permissions: ['*'], description: 'Administrator with full access' },
        { name: 'user', permissions: ['read'], description: 'Standard user' },
      ];
    }

    return roles;
  }

  /**
   * Extract identifiers from a code snippet
   */
  private extractIdentifiers(content: string): string[] {
    const identifiers: string[] = [];
    
    // Match quoted strings
    const quotedMatch = content.match(/['"](\w+)['"]/g);
    if (quotedMatch) {
      identifiers.push(...quotedMatch.map(m => m.replace(/['"]/g, '')));
    }

    // Match object keys
    const keyMatch = content.match(/(\w+)\s*:/g);
    if (keyMatch) {
      identifiers.push(...keyMatch.map(m => m.replace(/\s*:/g, '')));
    }

    // Match enum values
    const enumMatch = content.match(/(\w+)\s*=/g);
    if (enumMatch) {
      identifiers.push(...enumMatch.map(m => m.replace(/\s*=/g, '')));
    }

    return [...new Set(identifiers)].filter(id => 
      !['true', 'false', 'null', 'undefined', 'const', 'let', 'var'].includes(id.toLowerCase())
    );
  }

  /**
   * Find permissions associated with a role
   */
  private findPermissionsForRole(content: string, roleName: string): string[] {
    const permissions: string[] = [];
    
    // Look for role definition with permissions
    const roleDefPattern = new RegExp(
      `${roleName}\\s*:\\s*\\{[^}]*permissions\\s*:\\s*\\[([^\\]]+)\\]`,
      'gi'
    );
    const match = roleDefPattern.exec(content);
    if (match) {
      const permContent = match[1];
      const perms = permContent.match(/['"]([^'"]+)['"]/g);
      if (perms) {
        permissions.push(...perms.map(p => p.replace(/['"]/g, '')));
      }
    }

    return permissions;
  }

  /**
   * Infer role description from name
   */
  private inferRoleDescription(roleName: string): string | undefined {
    const descriptions: Record<string, string> = {
      admin: 'Administrator with full system access',
      administrator: 'Administrator with full system access',
      user: 'Standard user with basic permissions',
      guest: 'Guest user with limited access',
      moderator: 'Moderator with content management permissions',
      editor: 'Editor with content creation and editing permissions',
      viewer: 'Read-only access',
      superadmin: 'Super administrator with unrestricted access',
    };
    return descriptions[roleName.toLowerCase()];
  }

  /**
   * Scan for protected resources (routes with auth middleware)
   */
  private async scanProtectedResources(): Promise<ProtectedResource[]> {
    const resources: ProtectedResource[] = [];
    const files = await this.getFiles();

    // Build regex pattern for known middleware
    const middlewarePattern = new RegExp(
      `(${this.config.knownMiddleware.join('|')})`,
      'gi'
    );

    for (const filePath of files) {
      try {
        const content = await fs.readFile(filePath, 'utf-8');

        // Look for routes with auth middleware
        // Pattern: app.get('/path', authMiddleware, handler)
        const routePatterns = [
          /(?:app|router)\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*([^,)]+)/gi,
          /\.route\s*\(\s*['"`]([^'"`]+)['"`]\s*\)[^;]*\.(get|post|put|patch|delete)\s*\(\s*([^)]+)\)/gi,
        ];

        for (const pattern of routePatterns) {
          pattern.lastIndex = 0;
          let match;
          while ((match = pattern.exec(content)) !== null) {
            const method = match[1]?.toUpperCase() || match[2]?.toUpperCase();
            const routePath = match[2] || match[1];
            const middlewareSection = match[3];

            // Check if auth middleware is used
            if (middlewarePattern.test(middlewareSection)) {
              // Try to extract required roles
              const roles = this.extractRolesFromMiddleware(middlewareSection);
              
              resources.push({
                path: routePath,
                method,
                requiredRoles: roles,
              });
            }
          }
        }

        // Look for @Authorized decorators (TypeScript decorators)
        const decoratorPattern = /@(?:Authorized|RequireAuth|Auth|Protected)\s*\(\s*(?:\[([^\]]+)\]|['"]([^'"]+)['"])?\s*\)/gi;
        let decoratorMatch;
        while ((decoratorMatch = decoratorPattern.exec(content)) !== null) {
          const roles: string[] = [];
          if (decoratorMatch[1]) {
            const roleMatches = decoratorMatch[1].match(/['"]([^'"]+)['"]/g);
            if (roleMatches) {
              roles.push(...roleMatches.map(r => r.replace(/['"]/g, '')));
            }
          } else if (decoratorMatch[2]) {
            roles.push(decoratorMatch[2]);
          }

          // Find the associated route path (look ahead for route decorator)
          const afterDecorator = content.slice(decoratorMatch.index);
          const routeMatch = afterDecorator.match(/@(?:Get|Post|Put|Patch|Delete)\s*\(\s*['"]([^'"]+)['"]\)/i);
          if (routeMatch) {
            const methodMatch = afterDecorator.match(/@(Get|Post|Put|Patch|Delete)/i);
            resources.push({
              path: routeMatch[1],
              method: methodMatch ? methodMatch[1].toUpperCase() : undefined,
              requiredRoles: roles,
            });
          }
        }

        // Look for Next.js middleware or route protection patterns
        const nextAuthPattern = /getServerSession|useSession|withAuth/gi;
        if (nextAuthPattern.test(content)) {
          // This file likely has auth protection
          const routeMatch = filePath.match(/app\/(.+)\/(?:route|page)\.[tj]sx?$/);
          if (routeMatch) {
            const routePath = '/' + routeMatch[1].replace(/\\/g, '/');
            if (!resources.find(r => r.path === routePath)) {
              resources.push({
                path: routePath,
                requiredRoles: [],
              });
            }
          }
        }
      } catch {
        // Skip files that can't be read
      }
    }

    return resources;
  }

  /**
   * Extract role names from middleware call
   */
  private extractRolesFromMiddleware(middlewareSection: string): string[] {
    const roles: string[] = [];
    
    // Look for role specifications like requireRole('admin') or authorize(['admin', 'user'])
    const rolePatterns = [
      /requireRole\s*\(\s*['"]([^'"]+)['"]\s*\)/gi,
      /authorize\s*\(\s*\[([^\]]+)\]\s*\)/gi,
      /roles?\s*:\s*\[([^\]]+)\]/gi,
    ];

    for (const pattern of rolePatterns) {
      let match;
      while ((match = pattern.exec(middlewareSection)) !== null) {
        const roleContent = match[1];
        const extracted = roleContent.match(/['"]([^'"]+)['"]/g);
        if (extracted) {
          roles.push(...extracted.map(r => r.replace(/['"]/g, '')));
        } else if (!roleContent.includes(',')) {
          roles.push(roleContent.trim());
        }
      }
    }

    return [...new Set(roles)];
  }

  /**
   * Scan for authentication providers
   * Returns providers with types matching schema: 'jwt' | 'session' | 'oauth' | 'api-key' | 'custom'
   */
  private async scanAuthProviders(): Promise<{ type: 'jwt' | 'session' | 'oauth' | 'api-key' | 'custom'; config: Record<string, unknown> }[]> {
    const providers: { type: 'jwt' | 'session' | 'oauth' | 'api-key' | 'custom'; config: Record<string, unknown> }[] = [];
    const files = await this.getFiles();

    for (const filePath of files) {
      try {
        const content = await fs.readFile(filePath, 'utf-8');

        // Detect JWT
        if (/jsonwebtoken|jwt\.sign|jwt\.verify|JwtModule/i.test(content)) {
          if (!providers.find(p => p.type === 'jwt')) {
            providers.push({
              type: 'jwt',
              config: {
                detected: true,
                file: path.relative(this.projectRoot, filePath),
              },
            });
          }
        }

        // Detect OAuth/OAuth2 (including passport, NextAuth, Clerk - they use OAuth under the hood)
        if (/oauth|passport|OAuth2Client|google-auth|facebook-auth|next-auth|NextAuth|clerk|@clerk/i.test(content)) {
          if (!providers.find(p => p.type === 'oauth')) {
            const oauthProviders: string[] = [];
            if (/google/i.test(content)) oauthProviders.push('google');
            if (/facebook/i.test(content)) oauthProviders.push('facebook');
            if (/github/i.test(content)) oauthProviders.push('github');
            if (/twitter/i.test(content)) oauthProviders.push('twitter');
            if (/next-auth|NextAuth/i.test(content)) oauthProviders.push('nextauth');
            if (/clerk|@clerk/i.test(content)) oauthProviders.push('clerk');
            
            providers.push({
              type: 'oauth',
              config: {
                providers: oauthProviders,
                file: path.relative(this.projectRoot, filePath),
              },
            });
          }
        }

        // Detect Session-based auth
        if (/express-session|cookie-session|session\s*\(/i.test(content)) {
          if (!providers.find(p => p.type === 'session')) {
            providers.push({
              type: 'session',
              config: {
                detected: true,
                file: path.relative(this.projectRoot, filePath),
              },
            });
          }
        }

        // Detect API Key auth
        if (/api[_-]?key|x-api-key|apiKey/i.test(content) && /middleware|auth/i.test(filePath)) {
          if (!providers.find(p => p.type === 'api-key')) {
            providers.push({
              type: 'api-key',
              config: {
                detected: true,
                file: path.relative(this.projectRoot, filePath),
              },
            });
          }
        }

        // Detect custom auth implementations
        if (/custom[_-]?auth|authenticate|verifyCredentials/i.test(content) && /middleware|auth/i.test(filePath)) {
          if (!providers.find(p => p.type === 'custom')) {
            providers.push({
              type: 'custom',
              config: {
                detected: true,
                file: path.relative(this.projectRoot, filePath),
              },
            });
          }
        }
      } catch {
        // Skip files that can't be read
      }
    }

    return providers;
  }

  /**
   * Infer public paths based on common patterns
   */
  private inferPublicPaths(protectedResources: ProtectedResource[]): string[] {
    const publicPaths: string[] = [
      '/api/health',
      '/api/status',
      '/api/ping',
      '/health',
      '/healthz',
      '/ready',
      '/api/public',
      '/login',
      '/register',
      '/signup',
      '/api/auth/login',
      '/api/auth/register',
      '/api/auth/callback',
    ];

    // Add any paths that are explicitly public (no auth middleware)
    // This would require more sophisticated analysis
    
    return publicPaths;
  }
}
