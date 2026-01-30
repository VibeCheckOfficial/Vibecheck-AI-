/**
 * Discovery Module
 * 
 * Centralized file discovery for all scanners.
 * 
 * @module discovery
 */

export {
  // Main functions
  discoverFiles,
  discoverFilesWithMeta,
  discoverFilesInDirs,
  getChangedFilesSince,
  // Cache management
  clearFileCache,
  getFileCacheStats,
  // Utilities
  shouldExclude,
  getFileExtension,
  isTypeScriptFile,
  isJavaScriptFile,
  getRelativePath,
  // Constants
  DEFAULT_EXCLUDE_PATTERNS,
  DEFAULT_INCLUDE_PATTERNS,
  // Default instance
  fileWalker,
} from './file-walker.js';

export type {
  FileWalkerOptions,
  FileWalkerResult,
  FileMeta,
} from './file-walker.js';
