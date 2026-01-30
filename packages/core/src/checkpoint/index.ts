/**
 * Checkpoint System (Time Machine)
 * 
 * Create, restore, and manage checkpoints for fearless experimentation.
 * Features:
 * - Delta storage (only backs up modified files)
 * - Git-aware (captures branch, commit, dirty state)
 * - Optional compression
 * - Auto-checkpoint before destructive operations
 * - Tag system for easy reference
 */

export * from './types.js';
export * from './checkpoint-manager.js';
export * from './storage.js';
export * from './git-integration.js';
export * from './auto-checkpoint.js';
