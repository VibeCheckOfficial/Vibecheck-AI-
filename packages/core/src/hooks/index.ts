/**
 * Hooks Module - IDE integration hooks for hallucination prevention
 * 
 * Provides hooks for various IDE and development workflow events.
 * These hooks validate code changes, check dependencies, and enforce conventions.
 * 
 * @module core/hooks
 * 
 * @example
 * ```ts
 * import { HooksManager, PostSaveHook, PreCommitHook } from '@repo/core/hooks';
 * 
 * // Use HooksManager for coordinated hook execution
 * const manager = new HooksManager({ projectRoot: '/path/to/project' });
 * const results = await manager.runAll();
 * 
 * // Or use individual hooks
 * const postSave = new PostSaveHook();
 * const result = await postSave.execute('/path/to/file.ts');
 * ```
 */

// Post-Save Hook
export { PostSaveHook } from './post-save-hook.js';
export type { PostSaveConfig, PostSaveResult, PostSaveIssue } from './post-save-hook.js';

// Pre-Commit Hook
export { PreCommitHook } from './pre-commit-hook.js';
export type { PreCommitConfig, PreCommitResult, PreCommitIssue } from './pre-commit-hook.js';

// Dependency Check Hook
export { DependencyCheckHook } from './dependency-check-hook.js';
export type {
  DependencyCheckConfig,
  DependencyCheckResult,
  DependencyIssue,
  DependencySummary,
} from './dependency-check-hook.js';

// Hooks Manager
export { HooksManager } from './hooks-manager.js';
export type {
  HooksConfig,
  HooksStatus,
  HookRunResult,
} from './hooks-manager.js';
