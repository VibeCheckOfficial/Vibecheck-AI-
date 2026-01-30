# Configuration Guide

This document describes all environment variables used across VibeCheck components (CLI, MCP Server, API Server, Extension, Dashboard).

## Overview

VibeCheck uses a centralized configuration system (`@repo/shared-config`) that:
- Validates all environment variables with Zod schemas
- Normalizes types (numbers, booleans, URLs)
- Provides safe defaults in development only
- Fails fast on missing critical config in production
- Redacts secrets when printing config for debugging

## Quick Start

### Development

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Fill in your values (optional in dev - safe defaults provided)

3. Start services - config loads automatically

### Production

1. Set all required environment variables (see below)

2. **Never** use `.env` files in production - set env vars directly

3. Generate strong secrets:
   ```bash
   openssl rand -base64 32  # For JWT_SECRET, COOKIE_SECRET, etc.
   ```

## Environment Variables

### Server Configuration

| Variable | Type | Default | Required (Prod) | Description |
|----------|------|---------|-----------------|-------------|
| `NODE_ENV` | enum | `development` | Yes | Environment: `development`, `production`, `test` |
| `PORT` | number | `3001` | No | Server port (1-65535) |
| `HOST` | string | `0.0.0.0` | No | Server host |

### Database

| Variable | Type | Default | Required (Prod) | Description |
|----------|------|---------|-----------------|-------------|
| `DATABASE_URL` | URL | Dev default | **Yes** | PostgreSQL connection string |

**Development Default:** `postgres://vibecheck:vibecheck@localhost:5432/vibecheck`

**Production:** Must be set to a valid PostgreSQL URL

### Redis

| Variable | Type | Default | Required (Prod) | Description |
|----------|------|---------|-----------------|-------------|
| `REDIS_URL` | URL | `redis://localhost:6379` | No | Redis connection string |

### JWT Configuration

| Variable | Type | Default | Required (Prod) | Description |
|----------|------|---------|-----------------|-------------|
| `JWT_SECRET` | string (min 32) | Dev default | **Yes** | JWT signing secret |
| `JWT_REFRESH_SECRET` | string (min 32) | Dev default | **Yes** | JWT refresh token secret |
| `JWT_ACCESS_EXPIRY` | string | `1h` | No | Access token expiry (e.g., `1h`, `30m`) |
| `JWT_REFRESH_EXPIRY` | string | `7d` | No | Refresh token expiry (e.g., `7d`, `30d`) |

**Development Defaults:** Auto-generated weak secrets (warned)

**Production:** Must be strong random strings (min 32 chars)

### Cookie Configuration

| Variable | Type | Default | Required (Prod) | Description |
|----------|------|---------|-----------------|-------------|
| `COOKIE_SECRET` | string (min 32) | Dev default | **Yes** | Cookie signing secret |
| `COOKIE_DOMAIN` | string | - | No | Cookie domain (e.g., `.example.com`) |

**Production:** Must be strong random string (min 32 chars)

### OAuth - Google

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `GOOGLE_CLIENT_ID` | string | - | No | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | string | - | No | Google OAuth client secret |

**Note:** Both must be set for Google OAuth to work

### OAuth - GitHub

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `GITHUB_CLIENT_ID` | string | - | No | GitHub OAuth client ID |
| `GITHUB_CLIENT_SECRET` | string | - | No | GitHub OAuth client secret |

**Note:** Both must be set for GitHub OAuth to work

### GitHub App

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `GITHUB_APP_ID` | string | - | No | GitHub App ID |
| `GITHUB_APP_PRIVATE_KEY` | string | - | No | GitHub App private key (PEM format) |
| `GITHUB_WEBHOOK_SECRET` | string | - | No | GitHub webhook secret |

**Note:** All three must be set for GitHub App integration

### Stripe (Billing)

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `STRIPE_SECRET_KEY` | string | - | No | Stripe secret key (starts with `sk_`) |
| `STRIPE_WEBHOOK_SECRET` | string | - | No | Stripe webhook signing secret |
| `STRIPE_TEAM_PRICE_ID` | string | - | No | Stripe price ID for Team plan |
| `STRIPE_ENTERPRISE_PRICE_ID` | string | - | No | Stripe price ID for Enterprise plan |

**Note:** Required for billing features

### URLs

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `API_URL` | URL | `http://localhost:3001` | No | Public API URL |
| `WEB_URL` | URL | `http://localhost:5173` | No | Public web dashboard URL |

### Rate Limiting

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `RATE_LIMIT_MAX` | number | `100` | No | Max requests per window |
| `RATE_LIMIT_WINDOW_MS` | number | `60000` | No | Rate limit window in milliseconds |

### Logging

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `LOG_LEVEL` | enum | `info` | No | Log level: `fatal`, `error`, `warn`, `info`, `debug`, `trace` |

### Security

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `MAX_REQUEST_SIZE` | number | `1048576` | No | Max request body size in bytes (1MB default) |
| `REQUEST_TIMEOUT_MS` | number | `30000` | No | Request timeout in milliseconds (30s default) |
| `CONNECTION_TIMEOUT_MS` | number | `10000` | No | Connection timeout in milliseconds (10s default) |

### MCP Server Configuration

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `VIBECHECK_MODE` | enum | `local` | No | Mode: `local`, `cloud`, `hybrid` |
| `VIBECHECK_TRANSPORT` | enum | - | No | Transport: `stdio`, `http`, `websocket` |
| `VIBECHECK_PORT` | number | - | No | Port for HTTP/WebSocket transport |
| `VIBECHECK_HOST` | string | - | No | Host for HTTP/WebSocket transport |
| `VIBECHECK_PATH` | string | - | No | Path for HTTP transport |
| `VIBECHECK_PROJECT_ROOT` | string | `process.cwd()` | No | Project root directory |

### Monitoring & Observability

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `SENTRY_DSN` | URL | - | No | Sentry DSN for error tracking |
| `SENTRY_TRACES_SAMPLE_RATE` | number | `0.1` | No | Sentry trace sample rate (0-1) |
| `PROMETHEUS_PORT` | number | `9090` | No | Prometheus metrics port |

### CORS

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `CORS_ORIGIN` | string | - | No | Comma-separated list of allowed origins |

**Default:** Uses `WEB_URL` if not set

### CLI Configuration

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `VIBECHECK_DEBUG` | boolean | `false` | No | Enable debug mode |
| `VIBECHECK_VERBOSE` | boolean | `false` | No | Enable verbose output |
| `VIBECHECK_QUIET` | boolean | `false` | No | Suppress non-error output |
| `VIBECHECK_NO_COLOR` | boolean | `false` | No | Disable colored output |
| `VIBECHECK_NO_UNICODE` | boolean | `false` | No | Disable Unicode symbols |
| `VIBECHECK_UNICODE` | boolean | `false` | No | Force Unicode symbols |

## Usage Examples

### Basic Development Setup

```bash
# .env file (development only)
NODE_ENV=development
DATABASE_URL=postgres://vibecheck:vibecheck@localhost:5432/vibecheck
REDIS_URL=redis://localhost:6379
```

### Production Setup

```bash
# Set environment variables (never use .env in production)
export NODE_ENV=production
export DATABASE_URL=postgres://user:pass@db.example.com:5432/vibecheck
export REDIS_URL=redis://redis.example.com:6379
export JWT_SECRET=$(openssl rand -base64 32)
export JWT_REFRESH_SECRET=$(openssl rand -base64 32)
export COOKIE_SECRET=$(openssl rand -base64 32)
```

### Docker Compose

```yaml
services:
  api:
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
      - JWT_SECRET=${JWT_SECRET}
      # ... other vars
```

### Kubernetes

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: vibecheck-secrets
type: Opaque
stringData:
  JWT_SECRET: <base64-encoded-secret>
  DATABASE_URL: <connection-string>
  # ... other secrets
```

## Configuration Loading

### In Code

```typescript
import { loadConfig, printConfig } from '@repo/shared-config';

// Load config (cached after first call)
const config = loadConfig({
  loadEnvFile: true,      // Load .env in dev (default: true in dev, false in prod)
  useDefaults: true,      // Use safe defaults (default: true in dev)
  failFast: false,        // Fail on missing secrets (default: true in prod)
});

// Access typed config
console.log(config.PORT);        // number
console.log(config.API_URL);      // string (URL)
console.log(config.VIBECHECK_DEBUG); // boolean

// Print config with secrets redacted (for debugging)
printConfig();
```

### Config Print (Doctor/Debug)

```bash
# Print current config with secrets redacted
node -e "require('@repo/shared-config').printConfig()"
```

Output example:
```json
{
  "NODE_ENV": "development",
  "PORT": 3001,
  "DATABASE_URL": "postgres://***REDACTED***@localhost:5432/vibecheck",
  "JWT_SECRET": "deve***REDACTED***chars",
  "STRIPE_SECRET_KEY": "***REDACTED***"
}
```

## Validation Rules

### Production Requirements

In production (`NODE_ENV=production`), the following are **required**:

1. `DATABASE_URL` - Must be set and valid PostgreSQL URL
2. `JWT_SECRET` - Must be at least 32 characters, not contain "development"
3. `JWT_REFRESH_SECRET` - Must be at least 32 characters, not contain "development"
4. `COOKIE_SECRET` - Must be at least 32 characters, not contain "development"

The config loader will **fail fast** if these are missing or weak.

### Development Defaults

In development, safe defaults are provided:
- Weak secrets (warned but allowed)
- Local database URL
- Development-friendly settings

**Warning:** Never use development defaults in production!

## Type Normalization

The config loader automatically normalizes types:

- **Numbers:** `PORT=3001` → `config.PORT` is `number` (not string)
- **Booleans:** `VIBECHECK_DEBUG=true` → `config.VIBECHECK_DEBUG` is `boolean`
- **URLs:** Validated as proper URLs
- **Enums:** Validated against allowed values

## Secret Redaction

Secrets are automatically redacted when:
- Printing config (`printConfig()`)
- Logging errors
- Debug output

Redacted secrets show as:
- `***REDACTED***` for short values
- `first4***REDACTED***last4` for longer values
- URLs have credentials removed: `postgres://***REDACTED***@host/db`

## Troubleshooting

### "Missing or weak secrets in production"

**Error:** `Production requires strong secrets: JWT_SECRET, COOKIE_SECRET`

**Solution:** Set strong random secrets:
```bash
export JWT_SECRET=$(openssl rand -base64 32)
export COOKIE_SECRET=$(openssl rand -base64 32)
```

### "Invalid configuration"

**Error:** `Invalid configuration: PORT: Expected number, received string`

**Solution:** Check your `.env` file - ensure numbers are not quoted:
```bash
# ❌ Bad
PORT="3001"

# ✅ Good
PORT=3001
```

### ".env file not loading"

**Check:**
1. File exists at project root (or path specified)
2. `NODE_ENV` is not `production` (`.env` files disabled in prod)
3. File format is correct (KEY=VALUE, no spaces around `=`)

## Migration Guide

### From Direct `process.env` Usage

**Before:**
```typescript
const port = parseInt(process.env.PORT ?? '3001', 10);
const dbUrl = process.env.DATABASE_URL;
```

**After:**
```typescript
import { loadConfig } from '@repo/shared-config';
const config = loadConfig();
const port = config.PORT;        // Already a number!
const dbUrl = config.DATABASE_URL; // Already validated!
```

### From Old Config Files

If you have existing config files (`packages/api-server/src/config.ts`), they should now import from `@repo/shared-config`:

```typescript
import { loadConfig, type Config } from '@repo/shared-config';
export const env: Config = loadConfig();
```

## Security Best Practices

1. **Never commit `.env` files** - Add to `.gitignore`
2. **Never use `.env` in production** - Set environment variables directly
3. **Use strong secrets** - Minimum 32 characters, random
4. **Rotate secrets regularly** - Especially after security incidents
5. **Use secret management** - AWS Secrets Manager, HashiCorp Vault, etc.
6. **Validate in CI/CD** - Ensure production secrets are set before deployment

## See Also

- [Architecture Documentation](./ARCHITECTURE.md)
- [Security Guide](./SECURITY.md)
- [Deployment Guide](./docs/deployment.md)
