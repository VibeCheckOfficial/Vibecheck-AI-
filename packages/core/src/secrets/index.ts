/**
 * Secrets Detection Module
 * 
 * Detects leaked secrets, API keys, and sensitive data in source code.
 * Features:
 * - 20+ pattern categories (AWS, GitHub, Stripe, etc.)
 * - Shannon entropy calculation for unknown secrets
 * - Contextual risk adjustment by file path
 * - Git history scanning
 * - Allowlist management for false positives
 */

export * from './types.js';
export * from './patterns.js';
export * from './entropy.js';
export * from './contextual-risk.js';
export * from './scanner.js';
export * from './git-scanner.js';
export * from './allowlist.js';
