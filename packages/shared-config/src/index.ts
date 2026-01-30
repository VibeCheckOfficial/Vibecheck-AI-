/**
 * Centralized Configuration System
 * 
 * Single source of truth for all environment variables and configuration.
 * Provides type-safe, validated configuration with:
 * - Schema validation via Zod
 * - Type normalization (numbers, booleans, URLs)
 * - Safe defaults for dev only
 * - Fail-fast in production
 * - Secret redaction for debugging
 */

export { loadConfig, printConfig, type Config, type ConfigOptions } from './loader.js';
export { configSchema, type ConfigSchema } from './schema.js';
export { redactSecrets } from './redaction.js';
