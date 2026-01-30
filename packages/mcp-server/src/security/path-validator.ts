/**
 * Path Validator
 * 
 * Validates and sanitizes file paths to prevent path traversal attacks.
 * All paths must be relative to the project root and cannot escape it.
 */

import * as path from 'path';
import * as fs from 'fs/promises';

export interface PathValidationResult {
  valid: boolean;
  normalizedPath: string | null;
  error?: string;
  errorCode?: string;
}

export class PathValidator {
  private readonly projectRoot: string;
  private readonly allowedDirs: Set<string>;

  constructor(projectRoot: string, allowedDirs: string[] = []) {
    this.projectRoot = path.resolve(projectRoot);
    this.allowedDirs = new Set(allowedDirs.map(d => path.resolve(projectRoot, d)));
  }

  /**
   * Validate and normalize a file path
   */
  async validate(inputPath: string, allowOutsideProject = false): Promise<PathValidationResult> {
    try {
      // Reject null/undefined
      if (!inputPath || typeof inputPath !== 'string') {
        return {
          valid: false,
          normalizedPath: null,
          error: 'Path must be a non-empty string',
          errorCode: 'E_PATH_INVALID',
        };
      }

      // Reject paths longer than 4096 characters (filesystem limit)
      if (inputPath.length > 4096) {
        return {
          valid: false,
          normalizedPath: null,
          error: 'Path exceeds maximum length',
          errorCode: 'E_PATH_TOO_LONG',
        };
      }

      // Reject paths containing null bytes
      if (inputPath.includes('\0')) {
        return {
          valid: false,
          normalizedPath: null,
          error: 'Path contains invalid characters',
          errorCode: 'E_PATH_INVALID',
        };
      }

      // Normalize the path
      let normalized: string;
      
      if (path.isAbsolute(inputPath)) {
        // For absolute paths, resolve relative to project root
        normalized = path.resolve(this.projectRoot, path.relative(this.projectRoot, inputPath));
      } else {
        // For relative paths, resolve against project root
        normalized = path.resolve(this.projectRoot, inputPath);
      }

      // Ensure the resolved path is within project root
      const relativePath = path.relative(this.projectRoot, normalized);
      
      if (!allowOutsideProject && (relativePath.startsWith('..') || path.isAbsolute(relativePath))) {
        return {
          valid: false,
          normalizedPath: null,
          error: 'Path traversal detected',
          errorCode: 'E_PATH_TRAVERSAL',
        };
      }

      // If allowlist is configured, check against it
      if (this.allowedDirs.size > 0) {
        const isAllowed = Array.from(this.allowedDirs).some(allowedDir => {
          const relative = path.relative(allowedDir, normalized);
          return !relative.startsWith('..') && !path.isAbsolute(relative);
        });

        if (!isAllowed) {
          return {
            valid: false,
            normalizedPath: null,
            error: 'Path not in allowed directories',
            errorCode: 'E_PATH_NOT_ALLOWED',
          };
        }
      }

      // Normalize separators and resolve any remaining . or .. segments
      normalized = path.normalize(normalized);

      // Final check: ensure still within project root
      const finalRelative = path.relative(this.projectRoot, normalized);
      if (!allowOutsideProject && (finalRelative.startsWith('..') || path.isAbsolute(finalRelative))) {
        return {
          valid: false,
          normalizedPath: null,
          error: 'Path traversal detected after normalization',
          errorCode: 'E_PATH_TRAVERSAL',
        };
      }

      return {
        valid: true,
        normalizedPath: normalized,
      };
    } catch (error) {
      return {
        valid: false,
        normalizedPath: null,
        error: error instanceof Error ? error.message : 'Unknown path validation error',
        errorCode: 'E_PATH_VALIDATION_ERROR',
      };
    }
  }

  /**
   * Validate that a path is within a specific subdirectory
   */
  async validateWithinSubdir(inputPath: string, subdir: string): Promise<PathValidationResult> {
    const subdirPath = path.resolve(this.projectRoot, subdir);
    const validator = new PathValidator(subdirPath);
    return validator.validate(inputPath, false);
  }

  /**
   * Check if a path exists and is accessible
   */
  async checkAccess(filePath: string): Promise<{ exists: boolean; accessible: boolean; error?: string }> {
    try {
      const validation = await this.validate(filePath);
      if (!validation.valid) {
        return {
          exists: false,
          accessible: false,
          error: validation.error,
        };
      }

      const normalized = validation.normalizedPath!;
      
      try {
        await fs.access(normalized, fs.constants.F_OK);
        return { exists: true, accessible: true };
      } catch {
        return { exists: false, accessible: false };
      }
    } catch (error) {
      return {
        exists: false,
        accessible: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get project root
   */
  getProjectRoot(): string {
    return this.projectRoot;
  }
}

/**
 * Create a path validator instance
 */
export function createPathValidator(projectRoot: string, allowedDirs: string[] = []): PathValidator {
  return new PathValidator(projectRoot, allowedDirs);
}
