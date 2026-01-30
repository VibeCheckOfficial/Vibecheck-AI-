/**
 * Crash-Safe Temporary File Cleanup
 * 
 * Provides cross-platform temporary file management with:
 * - Automatic cleanup on process exit
 * - Startup cleanup of orphaned files
 * - Max age cleanup for stale files
 * - Cross-platform path handling
 */

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

export interface TempFileOptions {
  /** Prefix for temp file names */
  prefix?: string;
  /** Suffix for temp file names */
  suffix?: string;
  /** Directory for temp files (defaults to os.tmpdir()) */
  dir?: string;
  /** Max age in milliseconds before cleanup (default: 24 hours) */
  maxAgeMs?: number;
}

export interface TempFileInfo {
  path: string;
  createdAt: number;
}

// Registry of temp files created by this process
const tempFiles = new Set<string>();

// Cleanup interval (runs every hour)
let cleanupInterval: NodeJS.Timeout | null = null;

/**
 * Get the temp directory for VibeCheck
 * Cross-platform safe: uses os.tmpdir() which handles Windows correctly
 */
export function getTempDir(): string {
  const baseTemp = os.tmpdir();
  const vibecheckTemp = path.join(baseTemp, 'vibecheck');
  return vibecheckTemp;
}

/**
 * Ensure temp directory exists
 */
async function ensureTempDir(dir: string): Promise<void> {
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (error) {
    // Ignore if directory already exists
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw error;
    }
  }
}

/**
 * Generate a unique temp file path
 * Cross-platform safe: uses path.join() for proper path construction
 */
export async function createTempFile(options: TempFileOptions = {}): Promise<string> {
  const {
    prefix = 'vibecheck',
    suffix = '.tmp',
    dir = getTempDir(),
    maxAgeMs = 24 * 60 * 60 * 1000, // 24 hours
  } = options;

  // Ensure temp directory exists
  await ensureTempDir(dir);

  // Generate unique filename with timestamp and random component
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  const filename = `${prefix}-${timestamp}-${random}${suffix}`;
  const filePath = path.join(dir, filename);

  // Register for cleanup
  tempFiles.add(filePath);

  // Start cleanup interval if not already started
  if (!cleanupInterval) {
    startCleanupInterval(maxAgeMs);
  }

  return filePath;
}

/**
 * Register a temp file for cleanup
 */
export function registerTempFile(filePath: string): void {
  tempFiles.add(filePath);
}

/**
 * Unregister a temp file (when manually cleaned up)
 */
export function unregisterTempFile(filePath: string): void {
  tempFiles.delete(filePath);
}

/**
 * Clean up a specific temp file
 */
export async function cleanupTempFile(filePath: string): Promise<boolean> {
  try {
    await fs.unlink(filePath);
    unregisterTempFile(filePath);
    return true;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    // Ignore if file doesn't exist
    if (err.code === 'ENOENT') {
      unregisterTempFile(filePath);
      return true;
    }
    // Log but don't throw - cleanup failures shouldn't crash the app
    // eslint-disable-next-line no-console
    console.warn(`Failed to cleanup temp file ${filePath}:`, err.message);
    return false;
  }
}

/**
 * Clean up all registered temp files
 */
export async function cleanupAllTempFiles(): Promise<number> {
  let cleaned = 0;
  const filesToClean = Array.from(tempFiles);

  for (const filePath of filesToClean) {
    if (await cleanupTempFile(filePath)) {
      cleaned++;
    }
  }

  return cleaned;
}

/**
 * Clean up orphaned temp files older than maxAge
 */
export async function cleanupOrphanedFiles(maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<number> {
  const tempDir = getTempDir();
  let cleaned = 0;

  try {
    const files = await fs.readdir(tempDir);
    const now = Date.now();

    for (const file of files) {
      // Only process vibecheck temp files
      if (!file.startsWith('vibecheck-')) {
        continue;
      }

      const filePath = path.join(tempDir, file);

      try {
        const stats = await fs.stat(filePath);
        const age = now - stats.mtimeMs;

        // Clean up if older than maxAge
        if (age > maxAgeMs) {
          await fs.unlink(filePath);
          cleaned++;
        }
      } catch (error) {
        // File may have been deleted, ignore
        const err = error as NodeJS.ErrnoException;
        if (err.code !== 'ENOENT') {
          // eslint-disable-next-line no-console
          console.warn(`Failed to check temp file ${filePath}:`, err.message);
        }
      }
    }
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    // If temp dir doesn't exist, that's fine
    if (err.code !== 'ENOENT') {
      // eslint-disable-next-line no-console
      console.warn(`Failed to cleanup orphaned files:`, err.message);
    }
  }

  return cleaned;
}

/**
 * Start periodic cleanup interval
 */
function startCleanupInterval(maxAgeMs: number): void {
  // Run cleanup every hour
  cleanupInterval = setInterval(async () => {
    try {
      await cleanupOrphanedFiles(maxAgeMs);
    } catch (error) {
      // Don't let cleanup errors crash the process
      // eslint-disable-next-line no-console
      console.warn('Periodic temp cleanup failed:', error);
    }
  }, 60 * 60 * 1000); // 1 hour
}

/**
 * Stop cleanup interval
 */
export function stopCleanupInterval(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

/**
 * Initialize temp cleanup system
 * Should be called at application startup
 */
export async function initTempCleanup(maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<void> {
  // Clean up orphaned files on startup
  const cleaned = await cleanupOrphanedFiles(maxAgeMs);
  if (cleaned > 0) {
    // eslint-disable-next-line no-console
    console.log(`Cleaned up ${cleaned} orphaned temp files`);
  }

  // Register cleanup on process exit
  // Use standard process handlers for cross-platform compatibility
  const cleanup = async () => {
    await cleanupAllTempFiles();
    stopCleanupInterval();
  };

  // Sync cleanup on exit (for immediate cleanup)
  process.on('exit', () => {
    for (const filePath of tempFiles) {
      try {
        require('fs').unlinkSync(filePath);
      } catch {
        // Ignore errors on exit
      }
    }
  });

  // Async cleanup on signals
  process.on('SIGINT', async () => {
    await cleanup();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await cleanup();
    process.exit(0);
  });

  // Windows-specific
  if (process.platform === 'win32') {
    process.on('SIGHUP', async () => {
      await cleanup();
      process.exit(0);
    });
  }
}

/**
 * Get stats about temp files
 */
export function getTempFileStats(): {
  registered: number;
  tempDir: string;
} {
  return {
    registered: tempFiles.size,
    tempDir: getTempDir(),
  };
}
