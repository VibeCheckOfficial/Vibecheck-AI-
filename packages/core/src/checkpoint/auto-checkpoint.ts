/**
 * Auto-Checkpoint
 * 
 * Automatically creates checkpoints before destructive operations.
 */

import type { Checkpoint, CheckpointReason } from './types.js';
import { CheckpointManager } from './checkpoint-manager.js';

// ============================================================================
// Auto-Checkpoint Configuration
// ============================================================================

export interface AutoCheckpointConfig {
  /** Enable auto-checkpoints */
  enabled: boolean;
  /** Commands that trigger auto-checkpoint */
  triggers: string[];
  /** Maximum files to include in auto-checkpoint */
  maxFiles: number;
  /** Create checkpoint even if no changes detected */
  forceCreate: boolean;
}

export const DEFAULT_AUTO_CHECKPOINT_CONFIG: AutoCheckpointConfig = {
  enabled: true,
  triggers: ['fix', 'polish', 'refactor', 'upgrade', 'delete', 'remove'],
  maxFiles: 50,
  forceCreate: false,
};

// ============================================================================
// Auto-Checkpoint Functions
// ============================================================================

/**
 * Create an auto-checkpoint before a command
 * 
 * @param manager - Checkpoint manager
 * @param command - Command being executed
 * @param files - Files that will be affected
 * @param config - Auto-checkpoint configuration
 * @returns Created checkpoint or null if skipped
 */
export async function autoCheckpoint(
  manager: CheckpointManager,
  command: string,
  files?: string[],
  config: Partial<AutoCheckpointConfig> = {}
): Promise<Checkpoint | null> {
  const fullConfig = { ...DEFAULT_AUTO_CHECKPOINT_CONFIG, ...config };

  if (!fullConfig.enabled) {
    return null;
  }

  // Check if command triggers auto-checkpoint
  const shouldTrigger = fullConfig.triggers.some(trigger =>
    command.toLowerCase().includes(trigger.toLowerCase())
  );

  if (!shouldTrigger) {
    return null;
  }

  // Determine reason based on command
  const reason = getReasonFromCommand(command);

  try {
    const checkpoint = await manager.create({
      reason,
      tag: `auto-${command.split(' ')[0]}`,
      command,
      files: files?.slice(0, fullConfig.maxFiles),
    });

    return checkpoint;
  } catch {
    // Auto-checkpoint failures should not block the main operation
    return null;
  }
}

/**
 * Determine checkpoint reason from command
 */
function getReasonFromCommand(command: string): CheckpointReason {
  const lower = command.toLowerCase();

  if (lower.includes('fix')) {
    return 'FIX_APPLY';
  }
  if (lower.includes('polish')) {
    return 'POLISH_APPLY';
  }
  if (lower.includes('refactor')) {
    return 'BEFORE_REFACTOR';
  }
  if (lower.includes('upgrade') || lower.includes('update')) {
    return 'BEFORE_UPGRADE';
  }
  if (lower.includes('delete') || lower.includes('remove')) {
    return 'DESTRUCTIVE_OP';
  }

  return 'AUTO_SAVE';
}

// ============================================================================
// Rollback Support
// ============================================================================

/**
 * Rollback to the last auto-checkpoint
 * 
 * @param manager - Checkpoint manager
 * @param reason - Optional reason filter
 * @returns Restored checkpoint ID or null
 */
export async function rollbackToLastAuto(
  manager: CheckpointManager,
  reason?: CheckpointReason
): Promise<string | null> {
  const checkpoints = manager.list();

  // Find the most recent auto-checkpoint
  const autoCheckpoint = checkpoints.find(cp => {
    if (reason && cp.reason !== reason) {
      return false;
    }
    return cp.tag?.startsWith('auto-');
  });

  if (!autoCheckpoint) {
    return null;
  }

  const result = await manager.restore(autoCheckpoint.id, {
    dryRun: false,
    backupFirst: true,
  });

  return result.checkpointId;
}

// ============================================================================
// Checkpoint Hooks
// ============================================================================

export type CheckpointHook = (checkpoint: Checkpoint) => void | Promise<void>;

const beforeHooks: CheckpointHook[] = [];
const afterHooks: CheckpointHook[] = [];

/**
 * Register a hook to run before checkpoint creation
 */
export function onBeforeCheckpoint(hook: CheckpointHook): void {
  beforeHooks.push(hook);
}

/**
 * Register a hook to run after checkpoint creation
 */
export function onAfterCheckpoint(hook: CheckpointHook): void {
  afterHooks.push(hook);
}

/**
 * Run before-checkpoint hooks
 */
export async function runBeforeHooks(checkpoint: Checkpoint): Promise<void> {
  for (const hook of beforeHooks) {
    await hook(checkpoint);
  }
}

/**
 * Run after-checkpoint hooks
 */
export async function runAfterHooks(checkpoint: Checkpoint): Promise<void> {
  for (const hook of afterHooks) {
    await hook(checkpoint);
  }
}

/**
 * Clear all hooks
 */
export function clearHooks(): void {
  beforeHooks.length = 0;
  afterHooks.length = 0;
}

// ============================================================================
// Time Machine Utilities
// ============================================================================

/**
 * Get age of a checkpoint in human-readable format
 */
export function getCheckpointAge(timestamp: string): string {
  const created = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - created.getTime();

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }
  if (hours > 0) {
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }
  if (minutes > 0) {
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }
  return 'just now';
}

/**
 * Format checkpoint for display
 */
export function formatCheckpointDisplay(
  checkpoint: Checkpoint | { id: string; timestamp: string; reason: CheckpointReason; tag?: string; fileCount: number }
): string {
  const age = getCheckpointAge(checkpoint.timestamp);
  const tag = checkpoint.tag ? ` [${checkpoint.tag}]` : '';
  const files = 'fileCount' in checkpoint ? checkpoint.fileCount : checkpoint.files.length;

  return `${checkpoint.id}${tag} - ${checkpoint.reason} (${files} files, ${age})`;
}
