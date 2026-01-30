/**
 * Centralized File Discovery
 * 
 * Single module for file discovery used by all scanners.
 * Optimizations:
 * - Uses fast-glob for performance
 * - Applies ignore patterns early
 * - Caches file list for reuse
 * - Supports incremental updates
 * 
 * @module discovery/file-walker
 */

import fg from 'fast-glob';
import * as path from 'path';
import * as fs from 'fs/promises';
import { createHash } from 'crypto';

// ============================================================================
// Types
// ============================================================================

/**
 * Options for file discovery
 */
export interface FileWalkerOptions {
  /** Root directory to scan */
  rootDir: string;
  /** Glob patterns to include (default: ts, tsx, js, jsx files) */
  includePatterns?: string[];
  /** Glob patterns to exclude (default: standard ignore patterns) */
  excludePatterns?: string[];
  /** Maximum depth to traverse (default: unlimited) */
  maxDepth?: number;
  /** Follow symbolic links (default: false) */
  followSymlinks?: boolean;
  /** Use cache if available (default: true) */
  useCache?: boolean;
}

/**
 * Result of file discovery
 */
export interface FileWalkerResult {
  /** List of discovered file paths (absolute) */
  files: string[];
  /** Number of files discovered */
  count: number;
  /** Time taken in milliseconds */
  durationMs: number;
  /** Whether result was from cache */
  fromCache: boolean;
  /** Hash of the file list (for cache invalidation) */
  hash: string;
}

/**
 * File metadata for caching
 */
export interface FileMeta {
  path: string;
  size: number;
  mtime: number;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default patterns to exclude from scanning
 * These are applied early to avoid traversing unnecessary directories
 */
export const DEFAULT_EXCLUDE_PATTERNS = [
  // Package managers
  '**/node_modules/**',
  '**/bower_components/**',
  
  // Build outputs
  '**/dist/**',
  '**/build/**',
  '**/out/**',
  '**/.next/**',
  '**/.nuxt/**',
  '**/coverage/**',
  
  // Version control
  '**/.git/**',
  '**/.svn/**',
  '**/.hg/**',
  
  // IDE and editor
  '**/.idea/**',
  '**/.vscode/**',
  '**/.vs/**',
  
  // Cache directories
  '**/.cache/**',
  '**/__pycache__/**',
  '**/.pytest_cache/**',
  
  // VibeCheck
  '**/.vibecheck/**',
  
  // Temporary files
  '**/tmp/**',
  '**/temp/**',
  '**/*.tmp',
  '**/*.temp',
  
  // Lock files and logs
  '**/package-lock.json',
  '**/yarn.lock',
  '**/pnpm-lock.yaml',
  '**/*.log',
  
  // Vendor directories
  '**/vendor/**',
  '**/third_party/**',
] as const;

/**
 * Default patterns to include
 */
export const DEFAULT_INCLUDE_PATTERNS = [
  '**/*.ts',
  '**/*.tsx',
  '**/*.js',
  '**/*.jsx',
  '**/*.mjs',
  '**/*.cjs',
] as const;

// ============================================================================
// Cache
// ============================================================================

interface CacheEntry {
  files: string[];
  hash: string;
  timestamp: number;
  rootDir: string;
  patterns: string;
}

// In-memory cache for file lists
const fileListCache = new Map<string, CacheEntry>();

// Cache TTL in milliseconds (5 minutes)
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Generate cache key from options
 */
function getCacheKey(options: FileWalkerOptions): string {
  const patterns = JSON.stringify({
    include: options.includePatterns || DEFAULT_INCLUDE_PATTERNS,
    exclude: options.excludePatterns || DEFAULT_EXCLUDE_PATTERNS,
    maxDepth: options.maxDepth,
  });
  return `${options.rootDir}:${patterns}`;
}

/**
 * Check if cache entry is valid
 */
function isCacheValid(entry: CacheEntry): boolean {
  const age = Date.now() - entry.timestamp;
  return age < CACHE_TTL_MS;
}

/**
 * Clear the file list cache
 */
export function clearFileCache(): void {
  fileListCache.clear();
}

/**
 * Get cache statistics
 */
export function getFileCacheStats(): { entries: number; totalFiles: number } {
  let totalFiles = 0;
  for (const entry of fileListCache.values()) {
    totalFiles += entry.files.length;
  }
  return { entries: fileListCache.size, totalFiles };
}

// ============================================================================
// File Discovery
// ============================================================================

/**
 * Discover files matching patterns in a directory
 * 
 * @param options - Discovery options
 * @returns Promise resolving to discovery result
 */
export async function discoverFiles(
  options: FileWalkerOptions
): Promise<FileWalkerResult> {
  const startTime = Date.now();
  
  const {
    rootDir,
    includePatterns = [...DEFAULT_INCLUDE_PATTERNS],
    excludePatterns = [...DEFAULT_EXCLUDE_PATTERNS],
    maxDepth,
    followSymlinks = false,
    useCache = true,
  } = options;

  // Check cache
  if (useCache) {
    const cacheKey = getCacheKey(options);
    const cached = fileListCache.get(cacheKey);
    
    if (cached && isCacheValid(cached)) {
      return {
        files: cached.files,
        count: cached.files.length,
        durationMs: Date.now() - startTime,
        fromCache: true,
        hash: cached.hash,
      };
    }
  }

  // Use fast-glob for discovery
  const files = await fg(includePatterns, {
    cwd: rootDir,
    absolute: true,
    ignore: excludePatterns,
    followSymbolicLinks: followSymlinks,
    deep: maxDepth,
    onlyFiles: true,
    dot: false, // Don't include dotfiles by default
    suppressErrors: true, // Don't throw on permission errors
  });

  // Sort for deterministic output
  files.sort();

  // Generate hash of file list
  const hash = createHash('md5')
    .update(files.join('\n'))
    .digest('hex')
    .slice(0, 16);

  // Update cache
  if (useCache) {
    const cacheKey = getCacheKey(options);
    fileListCache.set(cacheKey, {
      files,
      hash,
      timestamp: Date.now(),
      rootDir,
      patterns: JSON.stringify({ includePatterns, excludePatterns }),
    });
  }

  return {
    files,
    count: files.length,
    durationMs: Date.now() - startTime,
    fromCache: false,
    hash,
  };
}

/**
 * Discover files with metadata (for caching)
 * 
 * @param options - Discovery options
 * @returns Promise resolving to files with metadata
 */
export async function discoverFilesWithMeta(
  options: FileWalkerOptions
): Promise<{ files: FileMeta[]; durationMs: number }> {
  const startTime = Date.now();
  
  const result = await discoverFiles(options);
  
  // Get metadata for each file
  const filesWithMeta: FileMeta[] = await Promise.all(
    result.files.map(async (filePath) => {
      try {
        const stat = await fs.stat(filePath);
        return {
          path: filePath,
          size: stat.size,
          mtime: stat.mtimeMs,
        };
      } catch {
        // File may have been deleted since discovery
        return {
          path: filePath,
          size: 0,
          mtime: 0,
        };
      }
    })
  );

  return {
    files: filesWithMeta.filter(f => f.size > 0), // Filter out deleted files
    durationMs: Date.now() - startTime,
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if a file should be excluded based on patterns
 */
export function shouldExclude(filePath: string, patterns: string[]): boolean {
  const normalizedPath = filePath.replace(/\\/g, '/');
  
  for (const pattern of patterns) {
    if (matchGlob(normalizedPath, pattern)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Simple glob matching (for quick checks)
 */
function matchGlob(filePath: string, pattern: string): boolean {
  // Convert glob pattern to regex
  const regexPattern = pattern
    .replace(/\*\*/g, '<<<DOUBLESTAR>>>')
    .replace(/\*/g, '[^/]*')
    .replace(/<<<DOUBLESTAR>>>/g, '.*')
    .replace(/\?/g, '.');
  
  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(filePath);
}

/**
 * Get file extension
 */
export function getFileExtension(filePath: string): string {
  const ext = path.extname(filePath);
  return ext.toLowerCase();
}

/**
 * Check if file is a TypeScript file
 */
export function isTypeScriptFile(filePath: string): boolean {
  const ext = getFileExtension(filePath);
  return ext === '.ts' || ext === '.tsx';
}

/**
 * Check if file is a JavaScript file
 */
export function isJavaScriptFile(filePath: string): boolean {
  const ext = getFileExtension(filePath);
  return ext === '.js' || ext === '.jsx' || ext === '.mjs' || ext === '.cjs';
}

/**
 * Get relative path from root
 */
export function getRelativePath(filePath: string, rootDir: string): string {
  return path.relative(rootDir, filePath).replace(/\\/g, '/');
}

// ============================================================================
// Batch Operations
// ============================================================================

/**
 * Discover files in multiple directories
 */
export async function discoverFilesInDirs(
  dirs: string[],
  options: Omit<FileWalkerOptions, 'rootDir'>
): Promise<Map<string, FileWalkerResult>> {
  const results = new Map<string, FileWalkerResult>();
  
  // Run discovery in parallel
  await Promise.all(
    dirs.map(async (dir) => {
      const result = await discoverFiles({ ...options, rootDir: dir });
      results.set(dir, result);
    })
  );
  
  return results;
}

/**
 * Get changed files since a given timestamp
 */
export async function getChangedFilesSince(
  options: FileWalkerOptions,
  since: number
): Promise<string[]> {
  const { files } = await discoverFilesWithMeta(options);
  
  return files
    .filter(f => f.mtime > since)
    .map(f => f.path);
}

// ============================================================================
// Export default instance
// ============================================================================

/**
 * Default file walker with standard options
 */
export const fileWalker = {
  discover: discoverFiles,
  discoverWithMeta: discoverFilesWithMeta,
  clearCache: clearFileCache,
  getCacheStats: getFileCacheStats,
  getChangedSince: getChangedFilesSince,
};

export default fileWalker;
