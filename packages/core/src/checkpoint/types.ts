/**
 * Checkpoint System Type Definitions
 */

// ============================================================================
// Checkpoint Types
// ============================================================================

export interface Checkpoint {
  /** Unique checkpoint ID (e.g., CP_20240115_abc123) */
  id: string;
  /** ISO timestamp of creation */
  timestamp: string;
  /** Reason for creating the checkpoint */
  reason: CheckpointReason;
  /** Optional human-readable tag */
  tag?: string;
  /** Files included in the checkpoint */
  files: CheckpointFile[];
  /** Metadata about the checkpoint context */
  metadata: CheckpointMetadata;
}

export interface CheckpointFile {
  /** Relative path from project root */
  path: string;
  /** SHA256 hash of original content */
  originalHash: string;
  /** Size in bytes */
  size: number;
  /** Whether the file was modified from a previous checkpoint */
  modified: boolean;
}

export interface CheckpointMetadata {
  /** Command that triggered the checkpoint */
  command: string;
  /** Working directory */
  cwd: string;
  /** Current git branch (if in repo) */
  gitBranch?: string;
  /** Current git commit hash */
  gitCommit?: string;
  /** Whether there were uncommitted changes */
  gitDirty?: boolean;
  /** Node.js version */
  nodeVersion?: string;
  /** Platform info */
  platform?: string;
  /** Total size of backed up files */
  totalSize?: number;
  /** Whether compression was used */
  compressed?: boolean;
}

export type CheckpointReason =
  | 'MANUAL'
  | 'FIX_APPLY'
  | 'POLISH_APPLY'
  | 'DESTRUCTIVE_OP'
  | 'BEFORE_REFACTOR'
  | 'BEFORE_UPGRADE'
  | 'AUTO_SAVE';

// ============================================================================
// Checkpoint Operations
// ============================================================================

export interface CreateCheckpointOptions {
  /** Files to include (paths relative to cwd) */
  files?: string[];
  /** Reason for the checkpoint */
  reason: CheckpointReason;
  /** Optional tag for easy reference */
  tag?: string;
  /** Command that triggered this checkpoint */
  command?: string;
  /** Additional context */
  context?: Record<string, unknown>;
}

export interface RestoreOptions {
  /** Only restore specific files */
  onlyFiles?: string[];
  /** Dry run - show what would be restored without doing it */
  dryRun?: boolean;
  /** Create a backup before restoring */
  backupFirst?: boolean;
}

export interface RestoreResult {
  /** Checkpoint that was restored */
  checkpointId: string;
  /** Files that were restored */
  restoredFiles: string[];
  /** Files that were skipped (not found in checkpoint) */
  skippedFiles: string[];
  /** Whether this was a dry run */
  dryRun: boolean;
  /** Backup checkpoint created before restore (if backupFirst was true) */
  backupCheckpointId?: string;
}

export interface DiffResult {
  /** Checkpoint being compared */
  checkpointId: string;
  /** Files that have changed since checkpoint */
  changedFiles: FileDiff[];
  /** Files that were added since checkpoint */
  addedFiles: string[];
  /** Files that were deleted since checkpoint */
  deletedFiles: string[];
  /** Summary statistics */
  summary: {
    changed: number;
    added: number;
    deleted: number;
    unchanged: number;
  };
}

export interface FileDiff {
  /** File path */
  path: string;
  /** Hash at checkpoint time */
  checkpointHash: string;
  /** Current hash */
  currentHash: string;
}

// ============================================================================
// Storage Types
// ============================================================================

export interface StorageOptions {
  /** Enable gzip compression for stored files */
  compress?: boolean;
  /** Compression level (1-9, default: 6) */
  compressionLevel?: number;
}

export interface CheckpointIndex {
  /** Version of the index format */
  version: number;
  /** List of all checkpoints */
  checkpoints: CheckpointSummary[];
  /** Storage settings */
  settings: StorageSettings;
}

export interface CheckpointSummary {
  /** Checkpoint ID */
  id: string;
  /** Creation timestamp */
  timestamp: string;
  /** Reason */
  reason: CheckpointReason;
  /** Optional tag */
  tag?: string;
  /** Number of files */
  fileCount: number;
  /** Total size in bytes */
  totalSize: number;
}

export interface StorageSettings {
  /** Maximum number of checkpoints to keep */
  maxCheckpoints: number;
  /** Maximum total storage size in bytes */
  maxStorageBytes: number;
  /** Auto-prune old checkpoints */
  autoPrune: boolean;
}

// ============================================================================
// Prune Types
// ============================================================================

export interface PruneOptions {
  /** Keep this many most recent checkpoints */
  keep?: number;
  /** Remove checkpoints older than this many days */
  olderThanDays?: number;
  /** Dry run - show what would be pruned */
  dryRun?: boolean;
}

export interface PruneResult {
  /** Checkpoints that were (or would be) removed */
  prunedCheckpoints: string[];
  /** Space freed (or would be freed) in bytes */
  spaceFreed: number;
  /** Whether this was a dry run */
  dryRun: boolean;
}

// ============================================================================
// Status Types
// ============================================================================

export interface StorageStatus {
  /** Storage directory path */
  storagePath: string;
  /** Total number of checkpoints */
  totalCheckpoints: number;
  /** Total storage used in bytes */
  totalSize: number;
  /** Oldest checkpoint date */
  oldestCheckpoint?: string;
  /** Newest checkpoint date */
  newestCheckpoint?: string;
  /** Storage settings */
  settings: StorageSettings;
}

// ============================================================================
// Constants
// ============================================================================

export const DEFAULT_STORAGE_SETTINGS: StorageSettings = {
  maxCheckpoints: 20,
  maxStorageBytes: 100 * 1024 * 1024, // 100MB
  autoPrune: true,
};

export const CHECKPOINT_REASONS: Record<CheckpointReason, string> = {
  MANUAL: 'Manual checkpoint',
  FIX_APPLY: 'Before applying fix',
  POLISH_APPLY: 'Before applying polish',
  DESTRUCTIVE_OP: 'Before destructive operation',
  BEFORE_REFACTOR: 'Before refactoring',
  BEFORE_UPGRADE: 'Before upgrade',
  AUTO_SAVE: 'Auto-save checkpoint',
};
