/**
 * Truthpack Validators
 *
 * Validates truthpack data against schemas and performs
 * cross-reference checks for consistency.
 *
 * World-class implementation with comprehensive validation.
 */

import { z } from 'zod';

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  score: number; // 0-100 quality score
}

export interface ValidationError {
  path: string;
  message: string;
  code: string;
  severity: 'error' | 'critical';
}

export interface ValidationWarning {
  path: string;
  message: string;
  code: string;
  suggestion?: string;
}

// ============================================================================
// Zod Schemas
// ============================================================================

const RouteSchema = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', '*']),
  path: z.string().min(1).startsWith('/'),
  handler: z.string().min(1),
  middleware: z.array(z.string()).optional(),
  auth: z.object({
    required: z.boolean(),
    roles: z.array(z.string()).optional(),
  }).optional(),
  rateLimit: z.object({
    requests: z.number().positive(),
    window: z.string(),
  }).optional(),
  description: z.string().optional(),
  deprecated: z.boolean().optional(),
});

const RoutesSchema = z.object({
  version: z.string(),
  generatedAt: z.string().optional(),
  routes: z.array(RouteSchema),
});

const EnvVarSchema = z.object({
  name: z.string().regex(/^[A-Z][A-Z0-9_]*$/, 'Must be SCREAMING_SNAKE_CASE'),
  type: z.enum(['string', 'number', 'boolean', 'url', 'secret', 'json']),
  required: z.boolean(),
  default: z.string().optional(),
  description: z.string().optional(),
  example: z.string().optional(),
  sensitive: z.boolean().optional(),
  environments: z.array(z.enum(['development', 'staging', 'production', 'test'])).optional(),
});

const EnvSchema = z.object({
  version: z.string(),
  generatedAt: z.string().optional(),
  variables: z.array(EnvVarSchema),
});

const AuthRuleSchema = z.object({
  path: z.string().min(1),
  pattern: z.enum(['exact', 'prefix', 'regex']).optional().default('exact'),
  requiresAuth: z.boolean(),
  roles: z.array(z.string()).optional(),
  permissions: z.array(z.string()).optional(),
  rateLimit: z.object({
    authenticated: z.number().positive().optional(),
    anonymous: z.number().positive().optional(),
    window: z.string(),
  }).optional(),
});

const AuthSchema = z.object({
  version: z.string(),
  generatedAt: z.string().optional(),
  provider: z.string().optional(),
  rules: z.array(AuthRuleSchema),
  roles: z.record(z.object({
    inherits: z.array(z.string()).optional(),
    permissions: z.array(z.string()).optional(),
    description: z.string().optional(),
  })).optional(),
});

const EndpointSchema = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  path: z.string().min(1).startsWith('/'),
  requestType: z.string().optional(),
  responseType: z.string(),
  errorTypes: z.array(z.string()).optional(),
  description: z.string().optional(),
});

const TypeFieldSchema = z.object({
  name: z.string(),
  type: z.string(),
  required: z.boolean().optional(),
  description: z.string().optional(),
});

const TypeSchema = z.object({
  name: z.string().regex(/^[A-Z][a-zA-Z0-9]*$/, 'Must be PascalCase'),
  kind: z.enum(['interface', 'type', 'enum']).optional(),
  fields: z.array(TypeFieldSchema).optional(),
  schema: z.record(z.unknown()).optional(),
  description: z.string().optional(),
});

const ContractsSchema = z.object({
  version: z.string(),
  generatedAt: z.string().optional(),
  endpoints: z.array(EndpointSchema),
  types: z.array(TypeSchema),
});

// ============================================================================
// Validator Class
// ============================================================================

export class TruthpackValidators {
  /**
   * Validate routes truthpack
   */
  static validateRoutes(data: unknown): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Schema validation
    const parseResult = RoutesSchema.safeParse(data);

    if (!parseResult.success) {
      for (const issue of parseResult.error.issues) {
        errors.push({
          path: issue.path.join('.'),
          message: issue.message,
          code: 'SCHEMA_INVALID',
          severity: 'error',
        });
      }
      return { valid: false, errors, warnings, score: 0 };
    }

    const routes = parseResult.data;

    // Semantic validation
    const routeMap = new Map<string, typeof routes.routes[0]>();

    for (const route of routes.routes) {
      const key = `${route.method}:${route.path}`;

      // Check for duplicate routes
      if (routeMap.has(key)) {
        errors.push({
          path: `routes[${key}]`,
          message: `Duplicate route: ${route.method} ${route.path}`,
          code: 'ROUTE_DUPLICATE',
          severity: 'error',
        });
      } else {
        routeMap.set(key, route);
      }

      // Check for conflicting patterns
      for (const [existingKey, existingRoute] of routeMap) {
        if (existingKey !== key && this.routesConflict(route, existingRoute)) {
          warnings.push({
            path: `routes[${key}]`,
            message: `Route "${route.path}" may conflict with "${existingRoute.path}"`,
            code: 'ROUTE_CONFLICT',
            suggestion: 'Ensure route ordering is intentional',
          });
        }
      }

      // Check for deprecated routes without replacement
      if (route.deprecated && !route.description?.includes('replaced by')) {
        warnings.push({
          path: `routes[${key}].deprecated`,
          message: `Deprecated route "${route.path}" has no replacement specified`,
          code: 'ROUTE_DEPRECATED_NO_REPLACEMENT',
          suggestion: 'Add replacement route to description',
        });
      }

      // Check for auth on sensitive paths
      const sensitivePatterns = ['/admin', '/api/admin', '/internal', '/user', '/account'];
      if (sensitivePatterns.some((p) => route.path.includes(p)) && !route.auth?.required) {
        warnings.push({
          path: `routes[${key}].auth`,
          message: `Sensitive route "${route.path}" may need authentication`,
          code: 'ROUTE_SENSITIVE_NO_AUTH',
          suggestion: 'Add auth requirement for sensitive endpoints',
        });
      }
    }

    const score = this.calculateScore(errors.length, warnings.length, routes.routes.length);

    return { valid: errors.length === 0, errors, warnings, score };
  }

  /**
   * Validate environment variables truthpack
   */
  static validateEnv(data: unknown): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Schema validation
    const parseResult = EnvSchema.safeParse(data);

    if (!parseResult.success) {
      for (const issue of parseResult.error.issues) {
        errors.push({
          path: issue.path.join('.'),
          message: issue.message,
          code: 'SCHEMA_INVALID',
          severity: 'error',
        });
      }
      return { valid: false, errors, warnings, score: 0 };
    }

    const env = parseResult.data;
    const varNames = new Set<string>();

    for (const variable of env.variables) {
      // Check for duplicate names
      if (varNames.has(variable.name)) {
        errors.push({
          path: `variables[${variable.name}]`,
          message: `Duplicate environment variable: ${variable.name}`,
          code: 'ENV_DUPLICATE',
          severity: 'error',
        });
      } else {
        varNames.add(variable.name);
      }

      // Check for required variables without defaults
      if (variable.required && !variable.default && !variable.sensitive) {
        warnings.push({
          path: `variables[${variable.name}]`,
          message: `Required variable "${variable.name}" has no default`,
          code: 'ENV_REQUIRED_NO_DEFAULT',
          suggestion: 'Add a development default or document required value',
        });
      }

      // Check for sensitive variables with defaults (security risk)
      if (variable.sensitive && variable.default) {
        errors.push({
          path: `variables[${variable.name}].default`,
          message: `Sensitive variable "${variable.name}" should not have a default value`,
          code: 'ENV_SENSITIVE_DEFAULT',
          severity: 'critical',
        });
      }

      // Check for missing descriptions
      if (!variable.description) {
        warnings.push({
          path: `variables[${variable.name}].description`,
          message: `Variable "${variable.name}" has no description`,
          code: 'ENV_NO_DESCRIPTION',
          suggestion: 'Add a description for documentation',
        });
      }

      // Check for url type without example
      if (variable.type === 'url' && !variable.example) {
        warnings.push({
          path: `variables[${variable.name}].example`,
          message: `URL variable "${variable.name}" should have an example`,
          code: 'ENV_URL_NO_EXAMPLE',
          suggestion: 'Add an example URL for validation',
        });
      }

      // Check naming conventions for secrets
      const secretPatterns = ['SECRET', 'KEY', 'TOKEN', 'PASSWORD', 'PRIVATE'];
      const looksLikeSecret = secretPatterns.some((p) => variable.name.includes(p));
      if (looksLikeSecret && !variable.sensitive && variable.type !== 'secret') {
        warnings.push({
          path: `variables[${variable.name}].sensitive`,
          message: `Variable "${variable.name}" looks sensitive but is not marked as such`,
          code: 'ENV_SENSITIVE_NOT_MARKED',
          suggestion: 'Set sensitive: true and type: "secret"',
        });
      }
    }

    const score = this.calculateScore(errors.length, warnings.length, env.variables.length);

    return { valid: errors.length === 0, errors, warnings, score };
  }

  /**
   * Validate auth configuration truthpack
   */
  static validateAuth(data: unknown): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Schema validation
    const parseResult = AuthSchema.safeParse(data);

    if (!parseResult.success) {
      for (const issue of parseResult.error.issues) {
        errors.push({
          path: issue.path.join('.'),
          message: issue.message,
          code: 'SCHEMA_INVALID',
          severity: 'error',
        });
      }
      return { valid: false, errors, warnings, score: 0 };
    }

    const auth = parseResult.data;
    const definedRoles = new Set(Object.keys(auth.roles ?? {}));

    for (const rule of auth.rules) {
      // Check for roles that aren't defined
      for (const role of rule.roles ?? []) {
        if (auth.roles && !definedRoles.has(role)) {
          errors.push({
            path: `rules[${rule.path}].roles`,
            message: `Role "${role}" is not defined in roles section`,
            code: 'AUTH_ROLE_UNDEFINED',
            severity: 'error',
          });
        }
      }

      // Check for overly permissive paths
      if (rule.path === '/' || rule.path === '/*' || rule.path === '/**') {
        if (!rule.requiresAuth) {
          warnings.push({
            path: `rules[${rule.path}]`,
            message: 'Wildcard path is public - ensure this is intentional',
            code: 'AUTH_WILDCARD_PUBLIC',
            suggestion: 'Consider requiring auth for sensitive subpaths',
          });
        }
      }

      // Check for auth without roles (any authenticated user)
      if (rule.requiresAuth && (!rule.roles || rule.roles.length === 0) && (!rule.permissions || rule.permissions.length === 0)) {
        warnings.push({
          path: `rules[${rule.path}]`,
          message: `Auth required but no specific roles/permissions - any authenticated user can access`,
          code: 'AUTH_NO_ROLES',
          suggestion: 'Add specific role requirements if needed',
        });
      }
    }

    // Check for circular role inheritance
    if (auth.roles) {
      for (const [roleName, roleConfig] of Object.entries(auth.roles)) {
        const visited = new Set<string>();
        const queue = [...(roleConfig.inherits ?? [])];

        while (queue.length > 0) {
          const inherited = queue.shift()!;
          if (inherited === roleName) {
            errors.push({
              path: `roles[${roleName}].inherits`,
              message: `Circular inheritance detected for role "${roleName}"`,
              code: 'AUTH_CIRCULAR_INHERITANCE',
              severity: 'critical',
            });
            break;
          }
          if (!visited.has(inherited)) {
            visited.add(inherited);
            const inheritedRole = auth.roles[inherited];
            if (inheritedRole?.inherits) {
              queue.push(...inheritedRole.inherits);
            }
          }
        }
      }
    }

    const score = this.calculateScore(errors.length, warnings.length, auth.rules.length);

    return { valid: errors.length === 0, errors, warnings, score };
  }

  /**
   * Validate API contracts truthpack
   */
  static validateContracts(data: unknown): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Schema validation
    const parseResult = ContractsSchema.safeParse(data);

    if (!parseResult.success) {
      for (const issue of parseResult.error.issues) {
        errors.push({
          path: issue.path.join('.'),
          message: issue.message,
          code: 'SCHEMA_INVALID',
          severity: 'error',
        });
      }
      return { valid: false, errors, warnings, score: 0 };
    }

    const contracts = parseResult.data;
    const definedTypes = new Set(contracts.types.map((t) => t.name));
    const usedTypes = new Set<string>();

    // Validate endpoints
    for (const endpoint of contracts.endpoints) {
      const key = `${endpoint.method} ${endpoint.path}`;

      // Track used types
      if (endpoint.requestType) {
        usedTypes.add(endpoint.requestType);
        if (!definedTypes.has(endpoint.requestType) && !this.isBuiltinType(endpoint.requestType)) {
          errors.push({
            path: `endpoints[${key}].requestType`,
            message: `Request type "${endpoint.requestType}" is not defined`,
            code: 'CONTRACT_TYPE_UNDEFINED',
            severity: 'error',
          });
        }
      }

      usedTypes.add(endpoint.responseType);
      if (!definedTypes.has(endpoint.responseType) && !this.isBuiltinType(endpoint.responseType)) {
        errors.push({
          path: `endpoints[${key}].responseType`,
          message: `Response type "${endpoint.responseType}" is not defined`,
          code: 'CONTRACT_TYPE_UNDEFINED',
          severity: 'error',
        });
      }

      // Check error types
      for (const errorType of endpoint.errorTypes ?? []) {
        usedTypes.add(errorType);
        if (!definedTypes.has(errorType) && !this.isBuiltinType(errorType)) {
          warnings.push({
            path: `endpoints[${key}].errorTypes`,
            message: `Error type "${errorType}" is not defined`,
            code: 'CONTRACT_ERROR_TYPE_UNDEFINED',
            suggestion: 'Define the error type or use a standard error type',
          });
        }
      }

      // Check for missing description
      if (!endpoint.description) {
        warnings.push({
          path: `endpoints[${key}].description`,
          message: `Endpoint ${key} has no description`,
          code: 'CONTRACT_NO_DESCRIPTION',
          suggestion: 'Add a description for API documentation',
        });
      }
    }

    // Check for unused types
    for (const type of contracts.types) {
      if (!usedTypes.has(type.name)) {
        warnings.push({
          path: `types[${type.name}]`,
          message: `Type "${type.name}" is defined but not used in any endpoint`,
          code: 'CONTRACT_TYPE_UNUSED',
          suggestion: 'Remove unused types or add endpoints that use them',
        });
      }

      // Check type has fields or schema
      if (!type.fields && !type.schema) {
        errors.push({
          path: `types[${type.name}]`,
          message: `Type "${type.name}" has no fields or schema`,
          code: 'CONTRACT_TYPE_EMPTY',
          severity: 'error',
        });
      }
    }

    const score = this.calculateScore(errors.length, warnings.length, contracts.endpoints.length + contracts.types.length);

    return { valid: errors.length === 0, errors, warnings, score };
  }

  /**
   * Cross-validate all truthpacks for consistency
   */
  static crossValidate(truthpack: {
    routes?: unknown;
    env?: unknown;
    auth?: unknown;
    contracts?: unknown;
  }): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Parse each truthpack
    const routes = RoutesSchema.safeParse(truthpack.routes);
    const auth = AuthSchema.safeParse(truthpack.auth);
    const contracts = ContractsSchema.safeParse(truthpack.contracts);

    if (!routes.success || !auth.success) {
      // Can't cross-validate if base validation fails
      return {
        valid: false,
        errors: [{
          path: '',
          message: 'Cannot cross-validate - base validation failed',
          code: 'CROSS_VALIDATION_SKIPPED',
          severity: 'error',
        }],
        warnings: [],
        score: 0,
      };
    }

    // Build route map
    const routeMap = new Map<string, typeof routes.data.routes[0]>();
    for (const route of routes.data.routes) {
      routeMap.set(route.path, route);
    }

    // Check auth rules reference valid routes
    for (const rule of auth.data.rules) {
      if (rule.pattern === 'exact' && !routeMap.has(rule.path)) {
        const similar = this.findSimilarPath(rule.path, [...routeMap.keys()]);
        if (similar) {
          warnings.push({
            path: `auth.rules[${rule.path}]`,
            message: `Auth rule for "${rule.path}" doesn't match any route`,
            code: 'CROSS_AUTH_NO_ROUTE',
            suggestion: `Did you mean "${similar}"?`,
          });
        }
      }
    }

    // Check routes with auth have corresponding auth rules
    for (const route of routes.data.routes) {
      if (route.auth?.required) {
        const hasAuthRule = auth.data.rules.some((r) =>
          r.path === route.path ||
          (r.pattern === 'prefix' && route.path.startsWith(r.path)) ||
          (r.pattern === 'regex' && new RegExp(r.path).test(route.path))
        );

        if (!hasAuthRule) {
          warnings.push({
            path: `routes[${route.path}].auth`,
            message: `Route "${route.path}" has auth config but no matching auth rule`,
            code: 'CROSS_ROUTE_NO_AUTH_RULE',
            suggestion: 'Add a corresponding auth rule for centralized management',
          });
        }
      }
    }

    // Check contracts reference valid routes
    if (contracts.success) {
      for (const endpoint of contracts.data.endpoints) {
        const routeKey = `${endpoint.method}:${endpoint.path}`;
        const matchingRoute = routes.data.routes.find(
          (r) => r.method === endpoint.method && r.path === endpoint.path
        );

        if (!matchingRoute) {
          errors.push({
            path: `contracts.endpoints[${endpoint.method} ${endpoint.path}]`,
            message: `Contract endpoint "${endpoint.method} ${endpoint.path}" has no matching route`,
            code: 'CROSS_CONTRACT_NO_ROUTE',
            severity: 'error',
          });
        }
      }
    }

    const itemCount = routes.data.routes.length + auth.data.rules.length + (contracts.data?.endpoints.length ?? 0);
    const score = this.calculateScore(errors.length, warnings.length, itemCount);

    return { valid: errors.length === 0, errors, warnings, score };
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private static routesConflict(a: { path: string; method: string }, b: { path: string; method: string }): boolean {
    if (a.method !== b.method && a.method !== '*' && b.method !== '*') {
      return false;
    }

    // Check if paths could match the same URL
    const aSegments = a.path.split('/');
    const bSegments = b.path.split('/');

    if (aSegments.length !== bSegments.length) {
      return false;
    }

    for (let i = 0; i < aSegments.length; i++) {
      const aIsParam = aSegments[i].startsWith(':') || aSegments[i].startsWith('[');
      const bIsParam = bSegments[i].startsWith(':') || bSegments[i].startsWith('[');

      if (!aIsParam && !bIsParam && aSegments[i] !== bSegments[i]) {
        return false;
      }
    }

    return true;
  }

  private static isBuiltinType(type: string): boolean {
    const builtins = new Set([
      'string', 'number', 'boolean', 'null', 'undefined', 'void', 'any', 'unknown', 'never',
      'object', 'Object', 'Array', 'Date', 'Error', 'Promise', 'Record', 'Partial', 'Required',
      'string[]', 'number[]', 'boolean[]',
    ]);

    return builtins.has(type) || type.endsWith('[]') || type.startsWith('Record<') || type.startsWith('Partial<');
  }

  private static findSimilarPath(path: string, paths: string[]): string | null {
    for (const p of paths) {
      // Simple similarity check
      if (this.levenshteinDistance(path, p) <= 3) {
        return p;
      }
    }
    return null;
  }

  private static levenshteinDistance(a: string, b: string): number {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }

  private static calculateScore(errorCount: number, warningCount: number, itemCount: number): number {
    if (itemCount === 0) return 100;

    const errorPenalty = errorCount * 10;
    const warningPenalty = warningCount * 2;

    return Math.max(0, Math.min(100, 100 - errorPenalty - warningPenalty));
  }
}
