/**
 * Configuration Schema
 * 
 * Defines all environment variables with validation, types, and defaults.
 */

import { z } from 'zod';

/**
 * Complete configuration schema for all VibeCheck components
 */
export const configSchema = z.object({
  // ============================================================================
  // Server Configuration
  // ============================================================================
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  HOST: z.string().default('0.0.0.0'),

  // ============================================================================
  // Database Configuration
  // ============================================================================
  DATABASE_URL: z.string().url().optional(),

  // ============================================================================
  // Redis Configuration
  // ============================================================================
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  REDIS_PASSWORD: z.string().optional(), // Redis password (if not in URL)

  // ============================================================================
  // JWT Configuration
  // ============================================================================
  JWT_SECRET: z.string().min(32).optional(),
  JWT_REFRESH_SECRET: z.string().min(32).optional(),
  JWT_ACCESS_EXPIRY: z.string().default('1h'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),

  // ============================================================================
  // Cookie Configuration
  // ============================================================================
  COOKIE_SECRET: z.string().min(32).optional(),
  COOKIE_DOMAIN: z.string().optional(),

  // ============================================================================
  // OAuth - Google
  // ============================================================================
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  // ============================================================================
  // OAuth - GitHub
  // ============================================================================
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),

  // ============================================================================
  // GitHub App Configuration
  // ============================================================================
  GITHUB_APP_ID: z.string().optional(),
  GITHUB_APP_PRIVATE_KEY: z.string().optional(),
  GITHUB_WEBHOOK_SECRET: z.string().optional(),

  // ============================================================================
  // Stripe Configuration
  // ============================================================================
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_TEAM_PRICE_ID: z.string().optional(),
  STRIPE_ENTERPRISE_PRICE_ID: z.string().optional(),

  // ============================================================================
  // URL Configuration
  // ============================================================================
  API_URL: z.string().url().default('http://localhost:3001'),
  WEB_URL: z.string().url().default('http://localhost:5173'),

  // ============================================================================
  // Rate Limiting
  // ============================================================================
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60000),

  // ============================================================================
  // Logging
  // ============================================================================
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // ============================================================================
  // Security
  // ============================================================================
  MAX_REQUEST_SIZE: z.coerce.number().int().min(1024).default(1048576), // 1MB default
  REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).default(30000), // 30s default
  CONNECTION_TIMEOUT_MS: z.coerce.number().int().min(1000).default(10000), // 10s default
  HEALTH_CHECK_TOKEN: z.string().min(16).optional(), // Token for detailed health check authentication

  // ============================================================================
  // MCP Server Configuration
  // ============================================================================
  VIBECHECK_MODE: z.enum(['local', 'cloud', 'hybrid']).default('local'),
  VIBECHECK_TRANSPORT: z.enum(['stdio', 'http', 'websocket']).optional(),
  VIBECHECK_PORT: z.coerce.number().int().min(1).max(65535).optional(),
  VIBECHECK_HOST: z.string().optional(),
  VIBECHECK_PATH: z.string().optional(),
  VIBECHECK_PROJECT_ROOT: z.string().optional(),

  // ============================================================================
  // Monitoring & Observability
  // ============================================================================
  SENTRY_DSN: z.string().url().optional(),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),
  PROMETHEUS_PORT: z.coerce.number().int().min(1).max(65535).default(9090),

  // ============================================================================
  // CORS Configuration
  // ============================================================================
  CORS_ORIGIN: z.string().optional(),

  // ============================================================================
  // Email Configuration (Resend)
  // ============================================================================
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().email().default('noreply@vibecheckai.dev'),

  // ============================================================================
  // CLI Configuration
  // ============================================================================
  VIBECHECK_DEBUG: z.coerce.boolean().default(false),
  VIBECHECK_VERBOSE: z.coerce.boolean().default(false),
  VIBECHECK_QUIET: z.coerce.boolean().default(false),
  VIBECHECK_NO_COLOR: z.coerce.boolean().default(false),
  VIBECHECK_NO_UNICODE: z.coerce.boolean().default(false),
  VIBECHECK_UNICODE: z.coerce.boolean().default(false),

  // ============================================================================
  // Object Storage (S3/R2/MinIO compatible)
  // Used for storing reality mode video recordings and screenshots
  // ============================================================================
  STORAGE_PROVIDER: z.enum(['s3', 'r2', 'minio', 'local']).default('local'),
  STORAGE_BUCKET: z.string().default('vibecheck-artifacts'),
  STORAGE_REGION: z.string().default('auto'),
  STORAGE_ENDPOINT: z.string().url().optional(),
  STORAGE_ACCESS_KEY_ID: z.string().optional(),
  STORAGE_SECRET_ACCESS_KEY: z.string().optional(),
  STORAGE_PUBLIC_URL: z.string().url().optional(), // CDN or public URL prefix for serving files
  STORAGE_PATH_PREFIX: z.string().default('reality-checks'), // Prefix for all uploaded files

  // Cloudflare R2 specific (uses same S3 API)
  CLOUDFLARE_ACCOUNT_ID: z.string().optional(), // Required for R2 endpoint auto-config
});

export type ConfigSchema = z.infer<typeof configSchema>;

/**
 * Critical secrets that must be set in production
 */
export const CRITICAL_SECRETS = [
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'COOKIE_SECRET',
  'DATABASE_URL',
] as const;

/**
 * Secrets that should be redacted when printing config
 */
export const SECRET_KEYS = [
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'COOKIE_SECRET',
  'GOOGLE_CLIENT_SECRET',
  'GITHUB_CLIENT_SECRET',
  'GITHUB_APP_PRIVATE_KEY',
  'GITHUB_WEBHOOK_SECRET',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'DATABASE_URL', // Contains credentials
  'REDIS_URL', // May contain credentials
  'SENTRY_DSN', // Contains sensitive tokens
  'RESEND_API_KEY', // Email service API key
  'STORAGE_ACCESS_KEY_ID', // Object storage credentials
  'STORAGE_SECRET_ACCESS_KEY', // Object storage credentials
] as const;
