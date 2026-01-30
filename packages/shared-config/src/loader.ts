/**
 * Configuration Loader
 * 
 * Loads and validates configuration from environment variables.
 * Supports .env files in development only (never in production).
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { configSchema, type ConfigSchema, CRITICAL_SECRETS } from './schema.js';
import { redactSecrets } from './redaction.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export type Config = ConfigSchema;

export interface ConfigOptions {
  /**
   * Whether to load .env files (default: true in dev, false in prod)
   */
  loadEnvFile?: boolean;
  
  /**
   * Path to .env file (default: searches for .env in project root)
   */
  envFilePath?: string;
  
  /**
   * Whether to fail fast on missing critical config (default: true in prod)
   */
  failFast?: boolean;
  
  /**
   * Whether to use safe defaults for dev (default: true in dev)
   */
  useDefaults?: boolean;
}

let cachedConfig: Config | null = null;

/**
 * Parse .env file content into key-value pairs
 */
function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    
    // Parse KEY=VALUE format
    const match = trimmed.match(/^([^#=]+)=(.*)$/);
    if (match && match[1] && match[2] !== undefined) {
      const key = match[1].trim();
      let value = match[2].trim();
      
      // Remove quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      
      result[key] = value;
    }
  }
  
  return result;
}

/**
 * Find .env file in project root
 */
function findEnvFile(startPath: string = process.cwd()): string | null {
  const searchPaths = [
    resolve(startPath, '.env'),
    resolve(startPath, '.env.local'),
    resolve(startPath, '.env.development'),
  ];
  
  for (const path of searchPaths) {
    if (existsSync(path)) {
      return path;
    }
  }
  
  return null;
}

/**
 * Load environment variables from .env file (dev only)
 */
function loadEnvFile(filePath?: string): Record<string, string> {
  const nodeEnv = process.env.NODE_ENV || 'development';
  
  // Never load .env files in production
  if (nodeEnv === 'production') {
    return {};
  }
  
  const envPath = filePath || findEnvFile();
  if (!envPath) {
    return {};
  }
  
  try {
    const content = readFileSync(envPath, 'utf-8');
    return parseEnvFile(content);
  } catch (error) {
    // Silently fail if .env file doesn't exist or can't be read
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return {};
    }
    throw new Error(`Failed to load .env file at ${envPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Merge environment variables (process.env takes precedence over .env file)
 */
function mergeEnvVars(envFileVars: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = { ...envFileVars };
  
  // Only copy defined values from process.env
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  
  return result;
}

/**
 * Apply safe defaults for development
 */
function applyDefaults(config: Partial<ConfigSchema>, isProduction: boolean): ConfigSchema {
  if (isProduction) {
    // In production, don't apply defaults for critical secrets
    return configSchema.parse(config);
  }
  
  // In development, apply safe defaults
  const defaults: Partial<ConfigSchema> = {
    JWT_SECRET: config.JWT_SECRET ?? 'development-jwt-secret-change-in-production-32chars',
    JWT_REFRESH_SECRET: config.JWT_REFRESH_SECRET ?? 'development-refresh-secret-change-in-prod-32chars',
    COOKIE_SECRET: config.COOKIE_SECRET ?? 'development-cookie-secret-change-in-production',
    DATABASE_URL: config.DATABASE_URL ?? 'postgres://vibecheck:vibecheck@localhost:5432/vibecheck',
  };
  
  return configSchema.parse({
    ...defaults,
    ...config,
  });
}

/**
 * Validate critical secrets in production
 */
function validateProductionSecrets(config: ConfigSchema, failFast: boolean): void {
  const nodeEnv = config.NODE_ENV;
  
  if (nodeEnv !== 'production') {
    return;
  }
  
  const missingSecrets: string[] = [];
  
  for (const secret of CRITICAL_SECRETS) {
    const value = config[secret];
    
    if (!value) {
      missingSecrets.push(secret);
      continue;
    }
    
    // Check for development defaults
    if (typeof value === 'string') {
      if (value.includes('development') || value.length < 32) {
        missingSecrets.push(secret);
      }
    }
  }
  
  if (missingSecrets.length > 0) {
    const errorMessage = [
      '⚠️  SECURITY WARNING: Missing or weak secrets in production!',
      `   Required secrets: ${missingSecrets.join(', ')}`,
      '   Set strong, random secrets as environment variables.',
      '   Generate secrets: openssl rand -base64 32',
    ].join('\n');
    
    if (failFast) {
      throw new Error(`Production requires strong secrets: ${missingSecrets.join(', ')}\n${errorMessage}`);
    }
    
    // eslint-disable-next-line no-console
    console.error(errorMessage);
  }
}

/**
 * Load and validate configuration
 */
export function loadConfig(options: ConfigOptions = {}): Config {
  // Return cached config if available
  if (cachedConfig) {
    return cachedConfig;
  }
  
  // Read NODE_ENV directly (before loading .env) to determine defaults
  const nodeEnv = process.env.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';
  
  const {
    loadEnvFile: shouldLoadEnvFile = !isProduction,
    envFilePath,
    failFast = isProduction,
    useDefaults = !isProduction,
  } = options;
  
  // Load .env file if enabled
  const envFileVars = shouldLoadEnvFile ? loadEnvFile(envFilePath) : {};
  
  // Merge environment variables (process.env takes precedence)
  const envVars = mergeEnvVars(envFileVars);
  
  // Parse and validate with Zod
  const parseResult = configSchema.safeParse(envVars);
  
  if (!parseResult.success) {
    const errors = parseResult.error.errors
      .map((err) => {
        const path = err.path.join('.');
        return `  • ${path || 'root'}: ${err.message}`;
      })
      .join('\n');
    
    throw new Error(`Invalid configuration:\n${errors}`);
  }
  
  // Apply defaults if enabled
  const config = useDefaults
    ? applyDefaults(parseResult.data, isProduction)
    : parseResult.data;
  
  // Validate production secrets
  validateProductionSecrets(config, failFast);
  
  // Cache the config
  cachedConfig = config;
  
  return config;
}

/**
 * Print configuration (with secret redaction)
 */
export function printConfig(config?: Config, options: { redactSecrets?: boolean } = {}): void {
  const configToPrint = config || loadConfig();
  const { redactSecrets: shouldRedact = true } = options;
  
  const output = shouldRedact
    ? redactSecrets(configToPrint)
    : configToPrint;
  
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(output, null, 2));
}

/**
 * Clear cached configuration (useful for testing)
 */
export function clearConfigCache(): void {
  cachedConfig = null;
}

/**
 * Get config value by key (type-safe)
 */
export function getConfigValue<K extends keyof Config>(key: K): Config[K] {
  const config = loadConfig();
  return config[key];
}
