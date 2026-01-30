# Security Integration Guide

This document describes how to integrate the security hardening measures into the MCP server.

## Overview

The security module provides:
- Path validation and sanitization
- Input size and structure validation
- Rate limiting
- Error sanitization
- Timeout enforcement
- Regex validation (ReDoS protection)
- Concurrency limiting

## Integration Steps

### 1. Initialize Security Middleware

Update `src/server.ts`:

```typescript
import { createSecurityMiddleware } from './security/security-middleware.js';

export class VibeCheckServer {
  private securityMiddleware: SecurityMiddleware;

  constructor() {
    // ... existing code ...

    // Initialize security middleware
    const projectRoot = process.env.VIBECHECK_PROJECT_ROOT || process.cwd();
    this.securityMiddleware = createSecurityMiddleware({
      projectRoot,
      allowedDirs: ['.vibecheck'], // Only allow operations in .vibecheck directory
      rateLimiting: true,
      inputValidation: true,
      pathValidation: true,
      timeout: true,
      concurrencyLimiting: true,
    });

    // ... rest of constructor ...
  }
}
```

### 2. Wrap Tool Execution

For each tool registration, wrap the handler with security checks:

```typescript
// Example: context_for_file tool
server.tool(
  'context_for_file',
  'Get relevant context for editing a specific file',
  {
    filePath: z.string().describe('Path to the file'),
    // ... other params
  },
  async (params) => {
    return await this.securityMiddleware.wrapToolExecution(
      {
        clientId: this.getClientId(), // Extract from context
        toolName: 'context_for_file',
        parameters: params,
      },
      async () => {
        // Original tool logic here
        const validation = await this.pathValidator.validate(params.filePath);
        if (!validation.valid) {
          throw new Error(validation.error);
        }
        // ... rest of tool logic
      }
    );
  }
);
```

### 3. Update Transport Layer for Rate Limiting

Update `src/transport/index.ts`:

```typescript
import { createDefaultRateLimiter } from '../security/rate-limiter.js';

export class HTTPTransport extends EventEmitter implements Transport {
  private rateLimiter = createDefaultRateLimiter();

  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    // Extract client ID (could be IP, API key, etc.)
    const clientId = req.socket.remoteAddress || 'unknown';

    // Check rate limit
    const rateLimitResult = this.rateLimiter.check(clientId);
    if (!rateLimitResult.allowed) {
      res.writeHead(429, {
        'Content-Type': 'application/json',
        'Retry-After': String(rateLimitResult.retryAfter || 60),
      });
      res.end(JSON.stringify({
        error: {
          code: 'E_RATE_LIMIT_EXCEEDED',
          message: 'Rate limit exceeded',
        },
      }));
      return;
    }

    // ... rest of request handling
  }
}
```

### 4. Update Tools to Use Security Wrappers

For file operations, use `wrapFileOperation`:

```typescript
// In context-tools.ts
import { securityMiddleware } from '../server.js'; // Or pass as parameter

async ({ filePath }) => {
  return await securityMiddleware.wrapFileOperation(filePath, async () => {
    const validation = await securityMiddleware.getPathValidator().validate(filePath);
    if (!validation.valid) {
      return securityMiddleware.getErrorHandler().createErrorResponse(
        new Error(validation.error),
        { tool: 'context_for_file' }
      );
    }

    const normalizedPath = validation.normalizedPath!;
    const content = await fs.readFile(normalizedPath, 'utf-8');
    // ... rest of logic
  });
}
```

For glob operations, use `wrapGlobOperation`:

```typescript
// In context-tools.ts
async ({ depth }) => {
  return await securityMiddleware.wrapGlobOperation(async () => {
    const files = await glob('**/*.{ts,tsx}', {
      cwd: projectRoot,
      maxDepth: depth || 3,
    });
    // ... rest of logic
  });
}
```

### 5. Update Error Handling

Replace error handling throughout tools:

```typescript
// Before
catch (err) {
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        error: err instanceof Error ? err.message : 'Unknown error',
      }),
    }],
  };
}

// After
catch (err) {
  return securityMiddleware.getErrorHandler().createErrorResponse(err, {
    tool: 'tool_name',
  });
}
```

### 6. Update Regex Usage

For tools using regex filters:

```typescript
// Before
const filterRegex = new RegExp(filter.replace(/\*/g, '.*'), 'i');

// After
const regexValidator = securityMiddleware.getRegexValidator();
const validation = regexValidator.globToRegex(filter);
if (!validation.valid) {
  return securityMiddleware.getErrorHandler().createErrorResponse(
    new Error(validation.error),
    { tool: 'truthpack_query' }
  );
}
const filterRegex = new RegExp(validation.normalizedPath || filter, 'i');
```

## Configuration

Security can be configured via environment variables:

```bash
# Disable rate limiting (not recommended)
VIBECHECK_SECURITY_RATE_LIMITING=false

# Adjust input size limits
VIBECHECK_SECURITY_MAX_CONTENT_SIZE=20971520  # 20MB

# Adjust timeouts
VIBECHECK_SECURITY_TOOL_TIMEOUT=60000  # 60 seconds
```

## Testing

Run security tests:

```bash
pnpm test:security
```

## Rollback Plan

If security measures cause issues:

1. **Disable specific features**:
   ```typescript
   this.securityMiddleware = createSecurityMiddleware({
     projectRoot,
     rateLimiting: false, // Disable rate limiting
     inputValidation: false, // Disable input validation
     // ... etc
   });
   ```

2. **Revert to previous version**:
   ```bash
   git revert <security-commit>
   ```

3. **Gradual rollout**:
   - Enable path validation first
   - Enable input validation second
   - Enable rate limiting last

## Performance Impact

Expected performance impact:
- Path validation: <1ms per request
- Input validation: <1ms per request
- Rate limiting: <0.5ms per request
- Total overhead: ~2-3ms per request

## Monitoring

Monitor these metrics:
- Rate limit rejections
- Path validation failures
- Input validation failures
- Timeout occurrences
- Concurrency limit hits

## Next Steps

1. Integrate security middleware into server constructor
2. Update all tools to use security wrappers
3. Update transport layer for rate limiting
4. Run security tests
5. Monitor in production
6. Gradually enable all security features
