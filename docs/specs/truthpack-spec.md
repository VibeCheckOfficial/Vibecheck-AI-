# Truthpack Specification

## Overview

A Truthpack is a collection of JSON files that serve as the authoritative source of truth about a codebase. It contains verified facts that the AI can rely on without risk of hallucination.

## Structure

```
.vibecheck/truthpack/
├── routes.json      # API route definitions
├── env.json         # Environment variables
├── auth.json        # Authentication configuration
├── contracts.json   # API contracts and schemas
└── ui-graph.json    # UI component hierarchy
```

## Routes Truthpack

Defines all API endpoints in the codebase.

### Schema

```typescript
interface RoutesTruthpack {
  version: string;
  generatedAt: string;
  routes: RouteDefinition[];
  summary: {
    totalRoutes: number;
    byMethod: Record<string, number>;
    protectedRoutes: number;
    publicRoutes: number;
  };
}

interface RouteDefinition {
  path: string;                    // e.g., "/api/users/:id"
  method: HttpMethod;              // GET, POST, PUT, PATCH, DELETE
  handler: string;                 // Handler function name
  file: string;                    // File containing handler
  line: number;                    // Line number
  parameters?: RouteParameter[];   // URL parameters
  middleware?: string[];           // Applied middleware
  auth?: {
    required: boolean;
    roles?: string[];
  };
  description?: string;
}
```

### Example

```json
{
  "version": "1.0.0",
  "generatedAt": "2026-01-28T00:00:00.000Z",
  "routes": [
    {
      "path": "/api/users/:id",
      "method": "GET",
      "handler": "getUserById",
      "file": "src/api/users.ts",
      "line": 42,
      "parameters": [
        { "name": "id", "type": "uuid", "required": true }
      ],
      "middleware": ["authenticate"],
      "auth": { "required": true, "roles": ["user", "admin"] }
    }
  ]
}
```

## Environment Truthpack

Defines all environment variables used in the codebase.

### Schema

```typescript
interface EnvTruthpack {
  version: string;
  generatedAt: string;
  variables: EnvVariable[];
  environments: Environment[];
  summary: {
    totalVariables: number;
    required: number;
    optional: number;
    sensitive: number;
  };
}

interface EnvVariable {
  name: string;                    // e.g., "DATABASE_URL"
  type: 'string' | 'number' | 'boolean' | 'url' | 'secret';
  required: boolean;
  defaultValue?: string;
  description?: string;
  usedIn?: { file: string; line: number }[];
  sensitive: boolean;              // Contains secrets
  validationPattern?: string;      // Regex pattern
}
```

### Example

```json
{
  "version": "1.0.0",
  "generatedAt": "2026-01-28T00:00:00.000Z",
  "variables": [
    {
      "name": "DATABASE_URL",
      "type": "url",
      "required": true,
      "description": "PostgreSQL connection string",
      "usedIn": [
        { "file": "src/db/client.ts", "line": 5 }
      ],
      "sensitive": true
    },
    {
      "name": "PORT",
      "type": "number",
      "required": false,
      "defaultValue": "3000",
      "description": "Server port"
    }
  ]
}
```

## Auth Truthpack

Defines authentication and authorization configuration.

### Schema

```typescript
interface AuthTruthpack {
  version: string;
  generatedAt: string;
  providers: AuthProvider[];
  roles: Role[];
  protectedResources: ProtectedResource[];
  publicPaths: string[];
  summary: {
    totalRoles: number;
    totalPermissions: number;
    protectedEndpoints: number;
    publicEndpoints: number;
  };
}

interface Role {
  name: string;
  permissions: string[];
  inherits?: string[];             // Inherited roles
  description?: string;
}

interface ProtectedResource {
  path: string;
  method?: string;
  requiredRoles: string[];
  requiredPermissions?: string[];
}
```

### Example

```json
{
  "version": "1.0.0",
  "generatedAt": "2026-01-28T00:00:00.000Z",
  "roles": [
    {
      "name": "admin",
      "permissions": ["users:read", "users:write", "users:delete"],
      "description": "Full system access"
    },
    {
      "name": "user",
      "permissions": ["users:read"],
      "description": "Standard user access"
    }
  ],
  "protectedResources": [
    {
      "path": "/api/users",
      "method": "DELETE",
      "requiredRoles": ["admin"],
      "requiredPermissions": ["users:delete"]
    }
  ],
  "publicPaths": ["/api/health", "/api/auth/login"]
}
```

## Contracts Truthpack

Defines API request/response schemas.

### Schema

```typescript
interface ContractsTruthpack {
  version: string;
  generatedAt: string;
  contracts: ApiContract[];
  summary: {
    totalEndpoints: number;
    byTag: Record<string, number>;
  };
}

interface ApiContract {
  path: string;
  method: string;
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  request: {
    headers?: Record<string, SchemaProperty>;
    params?: Record<string, SchemaProperty>;
    query?: Record<string, SchemaProperty>;
    body?: SchemaProperty;
  };
  responses: ResponseSchema[];
  examples?: Example[];
}
```

### Example

```json
{
  "version": "1.0.0",
  "generatedAt": "2026-01-28T00:00:00.000Z",
  "contracts": [
    {
      "path": "/api/users/:id",
      "method": "GET",
      "operationId": "getUserById",
      "request": {
        "params": {
          "id": { "type": "string", "required": true, "description": "User UUID" }
        }
      },
      "responses": [
        {
          "statusCode": 200,
          "body": {
            "type": "object",
            "properties": {
              "id": { "type": "string" },
              "email": { "type": "string" },
              "name": { "type": "string" }
            }
          }
        },
        {
          "statusCode": 404,
          "body": {
            "type": "object",
            "properties": {
              "error": { "type": "string" }
            }
          }
        }
      ]
    }
  ]
}
```

## UI Graph Truthpack

Defines UI component hierarchy and relationships.

### Schema

```typescript
interface UiGraphTruthpack {
  version: string;
  generatedAt: string;
  components: UiComponent[];
  pages?: Page[];
  layouts?: Layout[];
  summary: {
    totalComponents: number;
    totalPages: number;
    maxDepth: number;
  };
}

interface UiComponent {
  name: string;
  file: string;
  line: number;
  type: 'function' | 'class' | 'forwardRef' | 'memo';
  props: PropDefinition[];
  dependencies: ComponentDependency[];
  children?: string[];
  hooks?: string[];
  contexts?: string[];
  description?: string;
}
```

### Example

```json
{
  "version": "1.0.0",
  "generatedAt": "2026-01-28T00:00:00.000Z",
  "components": [
    {
      "name": "UserProfile",
      "file": "src/components/UserProfile.tsx",
      "line": 10,
      "type": "function",
      "props": [
        { "name": "userId", "type": "string", "required": true },
        { "name": "showAvatar", "type": "boolean", "required": false, "defaultValue": true }
      ],
      "dependencies": [
        { "name": "Avatar", "type": "render", "path": "./Avatar" },
        { "name": "useUser", "type": "hook", "path": "../hooks/useUser" }
      ],
      "hooks": ["useState", "useEffect", "useUser"]
    }
  ]
}
```

## Generation

Truthpacks are generated by scanning the codebase:

```typescript
import { TruthpackGenerator } from '@vibecheck/core/truthpack';

const generator = new TruthpackGenerator({
  projectRoot: process.cwd(),
  outputDir: '.vibecheck/truthpack',
  scanners: {
    routes: true,
    env: true,
    auth: true,
    contracts: true,
    uiGraph: true,
  },
});

await generator.generateAndSave();
```

## Validation

Truthpacks should be validated regularly:

```typescript
import { TruthpackValidators } from '@vibecheck/core/truthpack';

const result = TruthpackValidators.crossValidate({
  routes: routesTruthpack,
  env: envTruthpack,
  auth: authTruthpack,
  contracts: contractsTruthpack,
});

if (!result.valid) {
  console.log('Validation errors:', result.errors);
}
```

## Best Practices

1. **Regenerate Often** - Keep truthpack in sync with code changes
2. **Version Control** - Commit truthpack files for change tracking
3. **Validate Before Use** - Always validate truthpack consistency
4. **Don't Edit Manually** - Use generators to ensure accuracy
5. **Review Changes** - Check truthpack diffs in PRs
