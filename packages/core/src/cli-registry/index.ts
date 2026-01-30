/**
 * CLI Registry
 * 
 * Centralized command registration and metadata management.
 * Features:
 * - Single source of truth for commands
 * - Tier gating (FREE/TEAM/ENTERPRISE)
 * - Shell completion generation (bash, zsh, fish)
 * - Alias support
 * - Fuzzy matching for suggestions
 */

export * from './types.js';
export * from './registry.js';
export * from './tier-gating.js';
export * from './completions.js';
export * from './upgrade-prompts.js';