/**
 * Authentication Schema
 * 
 * Defines the Zod validation schemas for authentication configuration
 * in the truthpack. These schemas ensure type safety when reading and
 * writing auth-related truthpack data.
 * 
 * @module truthpack/schemas/auth.schema
 * 
 * @example
 * import { AuthConfigSchema } from './auth.schema';
 * 
 * const config = AuthConfigSchema.parse(rawData);
 * // config is now typed as AuthConfig
 */

import { z } from 'zod';

// ============================================================================
// Sub-Schemas
// ============================================================================

/**
 * Schema for role definitions in the auth configuration.
 * 
 * Roles define groups of permissions that can be assigned to users.
 * Supports inheritance from other roles.
 * 
 * @example
 * const role: Role = {
 *   name: 'admin',
 *   permissions: ['read', 'write', 'delete'],
 *   inherits: ['user'],
 *   description: 'Administrator with full access',
 * };
 */
export const RoleSchema = z.object({
  /** Role identifier */
  name: z.string(),
  /** Permissions granted to this role */
  permissions: z.array(z.string()),
  /** Optional roles this role inherits from */
  inherits: z.array(z.string()).optional(),
  /** Human-readable description */
  description: z.string().optional(),
});

/**
 * Schema for authentication provider configuration.
 * 
 * Defines the type and configuration of authentication providers
 * used in the application.
 * 
 * @example
 * const provider: AuthProvider = {
 *   type: 'jwt',
 *   config: { algorithm: 'RS256', expiresIn: '1h' },
 * };
 */
export const AuthProviderSchema = z.object({
  /** Provider type identifier */
  type: z.enum(['jwt', 'session', 'oauth', 'api-key', 'custom']),
  /** Provider-specific configuration */
  config: z.record(z.unknown()),
});

/**
 * Schema for protected resource definitions.
 * 
 * Defines which routes/paths require authentication and what
 * roles/permissions are needed to access them.
 * 
 * @example
 * const resource: ProtectedResource = {
 *   path: '/api/admin/*',
 *   method: 'POST',
 *   requiredRoles: ['admin'],
 *   requiredPermissions: ['admin:write'],
 * };
 */
export const ProtectedResourceSchema = z.object({
  /** URL path pattern */
  path: z.string(),
  /** HTTP method (GET, POST, etc.) - optional for all methods */
  method: z.string().optional(),
  /** Roles required to access this resource */
  requiredRoles: z.array(z.string()),
  /** Specific permissions required (optional) */
  requiredPermissions: z.array(z.string()).optional(),
  /** Custom authorization check function name (optional) */
  customCheck: z.string().optional(),
});

// ============================================================================
// Main Schema
// ============================================================================

/**
 * Schema for the complete authentication configuration.
 * 
 * Contains all auth-related information extracted from the codebase
 * including providers, roles, and protected resources.
 * 
 * @example
 * const config = AuthConfigSchema.parse(truthpackData.auth);
 */
export const AuthConfigSchema = z.object({
  /** Schema version for compatibility */
  version: z.string(),
  /** ISO timestamp of when config was generated */
  generatedAt: z.string(),
  /** Authentication providers configured in the app */
  providers: z.array(AuthProviderSchema),
  /** Role definitions */
  roles: z.array(RoleSchema),
  /** Protected routes and their requirements */
  protectedResources: z.array(ProtectedResourceSchema),
  /** Public paths that don't require authentication */
  publicPaths: z.array(z.string()),
  /** Summary statistics */
  summary: z.object({
    /** Total number of roles defined */
    totalRoles: z.number(),
    /** Total unique permissions across all roles */
    totalPermissions: z.number(),
    /** Number of protected endpoints */
    protectedEndpoints: z.number(),
    /** Number of public endpoints */
    publicEndpoints: z.number(),
  }),
});

// ============================================================================
// Type Exports
// ============================================================================

/**
 * Complete authentication configuration type
 */
export type AuthConfig = z.infer<typeof AuthConfigSchema>;

/**
 * Role definition type
 */
export type Role = z.infer<typeof RoleSchema>;

/**
 * Protected resource definition type
 */
export type ProtectedResource = z.infer<typeof ProtectedResourceSchema>;

/**
 * Authentication provider configuration type
 */
export type AuthProvider = z.infer<typeof AuthProviderSchema>;

// ============================================================================
// Aliases
// ============================================================================

/**
 * Alias for AuthConfigSchema (backward compatibility)
 * @deprecated Use AuthConfigSchema instead
 */
export const AuthSchema = AuthConfigSchema;
