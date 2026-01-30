/**
 * Checkpoint Manager
 * 
 * Core CRUD operations for creating, restoring, and managing checkpoints.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

import type {
  Checkpoint,
  CheckpointFile,
  CheckpointSummary,
  CreateCheckpointOptions,
  RestoreOptions,
  RestoreResult,
  DiffResult,
  FileDiff,
  PruneOptions,
  PruneResult,
  StorageOptions,
} from './types.js';
import { DEFAULT_STORAGE_SETTINGS, CHECKPOINT_REASONS } from './types.js';
import { CheckpointStorage, hashFile, hashContent, formatBytes } from './storage.js';
import { getGitState, getModifiedFiles } from './git-integration.js';
import { CheckpointError } from '../utils/errors.js';

// ============================================================================
// Checkpoint Manager
// ============================================================================

export class CheckpointManager {
  private projectRoot: string;
  private storage: CheckpointStorage;

  constructor(projectRoot: string, storageOptions?: StorageOptions) {
    this.projectRoot = projectRoot;
    this.storage = new CheckpointStorage(projectRoot, storageOptions);
  }

  // ============================================================================
  // Create Checkpoint
  // ============================================================================

  /**
   * Create a new checkpoint
   */
  async create(options: CreateCheckpointOptions): Promise<Checkpoint> {
    const { files, reason, tag, command, context } = options;

    // Generate checkpoint ID
    const id = this.generateCheckpointId(tag);

    // Get git state
    const gitState = getGitState(this.projectRoot);

    // Determine files to backup
    let filesToBackup: string[];
    if (files && files.length > 0) {
      filesToBackup = files;
    } else {
      // Default: backup modified files (if in git repo) or all source files
      filesToBackup = gitState.isRepo
        ? getModifiedFiles(this.projectRoot)
        : this.getDefaultFiles();
    }

    // Filter to existing files
    filesToBackup = filesToBackup.filter(f => {
      const fullPath = path.isAbsolute(f) ? f : path.join(this.projectRoot, f);
      return fs.existsSync(fullPath) && fs.statSync(fullPath).isFile();
    });

    if (filesToBackup.length === 0) {
      throw new CheckpointError('No files to checkpoint', {
        operation: 'create',
        recoveryHint: 'Specify files to backup or ensure there are modified files',
      });
    }

    // Store files
    const checkpointFiles: CheckpointFile[] = [];
    let totalSize = 0;

    for (const file of filesToBackup) {
      const fullPath = path.isAbsolute(file) ? file : path.join(this.projectRoot, file);
      const relativePath = path.isAbsolute(file)
        ? path.relative(this.projectRoot, file)
        : file;

      try {
        const content = fs.readFileSync(fullPath);
        const { hash, size } = await this.storage.storeFile(id, relativePath, content);

        checkpointFiles.push({
          path: relativePath,
          originalHash: hash,
          size,
          modified: true,
        });

        totalSize += size;
      } catch (error) {
        // Skip files that can't be read
        // File read error - non-critical, continue processing
        // eslint-disable-next-line no-console
        console.warn(`Skipping file ${file}: ${error}`);
      }
    }

    // Create checkpoint manifest
    const checkpoint: Checkpoint = {
      id,
      timestamp: new Date().toISOString(),
      reason,
      tag,
      files: checkpointFiles,
      metadata: {
        command: command ?? 'manual',
        cwd: this.projectRoot,
        gitBranch: gitState.branch,
        gitCommit: gitState.commit,
        gitDirty: gitState.dirty,
        nodeVersion: process.version,
        platform: process.platform,
        totalSize,
        compressed: this.storage['options']?.compress ?? false,
      },
    };

    // Store manifest
    this.storage.storeManifest(id, checkpoint);

    // Add to index
    this.storage.addToIndex({
      id,
      timestamp: checkpoint.timestamp,
      reason,
      tag,
      fileCount: checkpointFiles.length,
      totalSize,
    });

    // Auto-prune if needed
    await this.autoPrune();

    return checkpoint;
  }

  // ============================================================================
  // Restore Checkpoint
  // ============================================================================

  /**
   * Restore files from a checkpoint
   */
  async restore(checkpointId: string, options: RestoreOptions = {}): Promise<RestoreResult> {
    const { onlyFiles, dryRun = false, backupFirst = true } = options;

    // Resolve checkpoint ID (supports 'latest', tags)
    const resolvedId = this.resolveCheckpointId(checkpointId);

    // Get checkpoint manifest
    const checkpoint = this.storage.readManifest<Checkpoint>(resolvedId);
    if (!checkpoint) {
      throw new CheckpointError(`Checkpoint not found: ${checkpointId}`, {
        operation: 'restore',
        checkpointId,
        recoveryHint: 'Use "checkpoint list" to see available checkpoints',
      });
    }

    // Create backup before restore if requested
    let backupCheckpointId: string | undefined;
    if (backupFirst && !dryRun) {
      const backup = await this.create({
        reason: 'DESTRUCTIVE_OP',
        tag: `before-restore-${resolvedId.slice(0, 8)}`,
        command: `restore ${checkpointId}`,
      });
      backupCheckpointId = backup.id;
    }

    // Determine files to restore
    const filesToRestore = onlyFiles
      ? checkpoint.files.filter(f => onlyFiles.includes(f.path))
      : checkpoint.files;

    const restoredFiles: string[] = [];
    const skippedFiles: string[] = [];

    for (const file of filesToRestore) {
      if (dryRun) {
        restoredFiles.push(file.path);
        continue;
      }

      // Retrieve file content
      const content = await this.storage.retrieveFile(resolvedId, file.path);
      if (!content) {
        skippedFiles.push(file.path);
        continue;
      }

      // Restore file
      const fullPath = path.join(this.projectRoot, file.path);
      const dir = path.dirname(fullPath);

      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(fullPath, content);
      restoredFiles.push(file.path);
    }

    return {
      checkpointId: resolvedId,
      restoredFiles,
      skippedFiles,
      dryRun,
      backupCheckpointId,
    };
  }

  // ============================================================================
  // Diff Checkpoint
  // ============================================================================

  /**
   * Compare current state with a checkpoint
   */
  async diff(checkpointId: string): Promise<DiffResult> {
    const resolvedId = this.resolveCheckpointId(checkpointId);

    const checkpoint = this.storage.readManifest<Checkpoint>(resolvedId);
    if (!checkpoint) {
      throw new CheckpointError(`Checkpoint not found: ${checkpointId}`, {
        operation: 'diff',
        checkpointId,
      });
    }

    const changedFiles: FileDiff[] = [];
    const addedFiles: string[] = [];
    const deletedFiles: string[] = [];
    let unchangedCount = 0;

    // Check each file in the checkpoint
    for (const file of checkpoint.files) {
      const fullPath = path.join(this.projectRoot, file.path);

      if (!fs.existsSync(fullPath)) {
        deletedFiles.push(file.path);
        continue;
      }

      const currentHash = hashFile(fullPath);

      if (currentHash !== file.originalHash) {
        changedFiles.push({
          path: file.path,
          checkpointHash: file.originalHash,
          currentHash,
        });
      } else {
        unchangedCount++;
      }
    }

    // Check for new files (simplified - would need git status or file listing)
    // For now, we only track files that were in the checkpoint

    return {
      checkpointId: resolvedId,
      changedFiles,
      addedFiles,
      deletedFiles,
      summary: {
        changed: changedFiles.length,
        added: addedFiles.length,
        deleted: deletedFiles.length,
        unchanged: unchangedCount,
      },
    };
  }

  // ============================================================================
  // List & Get Checkpoints
  // ============================================================================

  /**
   * List all checkpoints
   */
  list(limit?: number): CheckpointSummary[] {
    const index = this.storage.readIndex();
    const sorted = [...index.checkpoints].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    return limit ? sorted.slice(0, limit) : sorted;
  }

  /**
   * Get a specific checkpoint
   */
  get(checkpointId: string): Checkpoint | null {
    const resolvedId = this.resolveCheckpointId(checkpointId);
    return this.storage.readManifest<Checkpoint>(resolvedId);
  }

  /**
   * Get the latest checkpoint
   */
  getLatest(): Checkpoint | null {
    const checkpoints = this.list(1);
    if (checkpoints.length === 0) {
      return null;
    }
    return this.get(checkpoints[0].id);
  }

  // ============================================================================
  // Delete & Prune
  // ============================================================================

  /**
   * Delete a checkpoint
   */
  delete(checkpointId: string): boolean {
    const resolvedId = this.resolveCheckpointId(checkpointId);
    return this.storage.deleteCheckpoint(resolvedId);
  }

  /**
   * Prune old checkpoints
   */
  async prune(options: PruneOptions = {}): Promise<PruneResult> {
    const { keep = 10, olderThanDays, dryRun = false } = options;

    const checkpoints = this.list();
    const now = Date.now();
    const msPerDay = 24 * 60 * 60 * 1000;

    const prunedCheckpoints: string[] = [];
    let spaceFreed = 0;

    // Determine which checkpoints to prune
    for (let i = 0; i < checkpoints.length; i++) {
      const cp = checkpoints[i];
      let shouldPrune = false;

      // Keep the first N checkpoints
      if (i >= keep) {
        shouldPrune = true;
      }

      // Check age
      if (olderThanDays) {
        const age = (now - new Date(cp.timestamp).getTime()) / msPerDay;
        if (age > olderThanDays) {
          shouldPrune = true;
        }
      }

      if (shouldPrune) {
        const size = this.storage.getCheckpointSize(cp.id);
        prunedCheckpoints.push(cp.id);
        spaceFreed += size;

        if (!dryRun) {
          this.storage.deleteCheckpoint(cp.id);
        }
      }
    }

    return {
      prunedCheckpoints,
      spaceFreed,
      dryRun,
    };
  }

  /**
   * Auto-prune based on settings
   */
  private async autoPrune(): Promise<void> {
    const index = this.storage.readIndex();
    const { maxCheckpoints, maxStorageBytes, autoPrune } = index.settings;

    if (!autoPrune) {
      return;
    }

    const checkpoints = this.list();
    const totalSize = this.storage.getTotalSize();

    // Prune if exceeds limits
    if (checkpoints.length > maxCheckpoints || totalSize > maxStorageBytes) {
      await this.prune({
        keep: Math.min(maxCheckpoints, checkpoints.length - 1),
        dryRun: false,
      });
    }
  }

  // ============================================================================
  // Status
  // ============================================================================

  /**
   * Get storage status
   */
  status() {
    return this.storage.getStatus();
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  /**
   * Generate a unique checkpoint ID
   */
  private generateCheckpointId(tag?: string): string {
    const timestamp = new Date().toISOString().replace(/[:\-T.Z]/g, '').slice(0, 14);
    const random = crypto.randomBytes(4).toString('hex');
    const tagPart = tag ? `_${tag.replace(/[^a-zA-Z0-9]/g, '')}` : '';
    return `CP_${timestamp}_${random}${tagPart}`;
  }

  /**
   * Resolve checkpoint ID from alias (latest, tag name, or actual ID)
   */
  private resolveCheckpointId(idOrAlias: string): string {
    if (idOrAlias === 'latest') {
      const latest = this.list(1);
      if (latest.length === 0) {
        throw new CheckpointError('No checkpoints available', {
          operation: 'resolve',
          recoveryHint: 'Create a checkpoint first',
        });
      }
      return latest[0].id;
    }

    // Check if it's a tag
    const checkpoints = this.list();
    const byTag = checkpoints.find(c => c.tag === idOrAlias);
    if (byTag) {
      return byTag.id;
    }

    // Check if ID exists
    const byId = checkpoints.find(c => c.id === idOrAlias || c.id.startsWith(idOrAlias));
    if (byId) {
      return byId.id;
    }

    // Return as-is and let caller handle not found
    return idOrAlias;
  }

  /**
   * Get default files to backup (source files)
   */
  private getDefaultFiles(): string[] {
    const files: string[] = [];
    const extensions = ['.ts', '.tsx', '.js', '.jsx', '.json', '.yaml', '.yml', '.md'];
    const excludeDirs = ['node_modules', 'dist', 'build', '.git', '.vibecheck'];

    const walk = (dir: string) => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (excludeDirs.includes(entry.name)) continue;

          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            walk(fullPath);
          } else if (extensions.some(ext => entry.name.endsWith(ext))) {
            files.push(path.relative(this.projectRoot, fullPath));
          }
        }
      } catch {
        // Skip inaccessible directories
      }
    };

    walk(this.projectRoot);
    return files.slice(0, 100); // Limit to prevent huge checkpoints
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Create a checkpoint manager for a project
 */
export function createCheckpointManager(
  projectRoot: string,
  options?: StorageOptions
): CheckpointManager {
  return new CheckpointManager(projectRoot, options);
}
