/**
 * CLI Version - injected at build time by tsup
 * 
 * @module lib/version
 */

// Build-time constants injected by tsup
declare const __CLI_VERSION__: string;
declare const __CLI_NAME__: string;

/**
 * CLI version string (e.g., "1.0.7")
 * Falls back to package.json version if build-time injection fails
 */
export const CLI_VERSION = typeof __CLI_VERSION__ !== 'undefined' ? __CLI_VERSION__ : '1.0.7';

/**
 * CLI package name (e.g., "vibecheck-ai")
 */
export const CLI_NAME = typeof __CLI_NAME__ !== 'undefined' ? __CLI_NAME__ : 'vibecheck-ai';
