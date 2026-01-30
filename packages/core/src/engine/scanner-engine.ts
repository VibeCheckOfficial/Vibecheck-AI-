/**
 * OPTIMIZED SCANNER ENGINE
 * 
 * Unified entry point for high-performance scanning.
 * Combines:
 * - Parallel engine execution (up to 4x speedup)
 * - File content caching (read once)
 * - Incremental scanning (changed files only)
 * - Streaming results for immediate feedback
 * 
 * @module engine/scanner-engine
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { createHash } from 'crypto';
import {
  getPerformanceScanner,
  quickScan,
  formatMetrics,
  type PerformanceScannerConfig,
  type ScanResult,
} from '../performance/index.js';
import type {
  CachedFinding,
  ScanProgressEvent,
  PerformanceMetrics,
} from '../performance/types.js';
import { getLogger, type Logger } from '../utils/logger.js';

// ============================================================================
// TYPES
// ============================================================================

export interface FileContext {
  path: string;
  content: string;
  hash: string;
  lines: string[];
  ext: string;
}

export interface ScanContext {
  files: Map<string, FileContext>;
  projectRoot: string;
  timings: Map<string, number>;
  cache: Map<string, unknown>;
}

export interface EngineDefinition {
  name: string;
  tier: 'free' | 'pro';
  patterns: string[];
  run: (ctx: ScanContext) => Promise<EngineFinding[]>;
}

export interface EngineFinding {
  id: string;
  engine: string;
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  file: string;
  line: number;
  column?: number;
  message: string;
  confidence: number;
  suggestion?: string;
}

export interface EngineResult {
  engine: string;
  findings: EngineFinding[];
  durationMs: number;
  success: boolean;
  error?: string;
}

export interface ScanEngineOptions {
  /** Project root directory */
  projectRoot: string;
  /** Enable incremental scanning (only changed files) */
  incremental?: boolean;
  /** Enable parallel engine execution */
  parallel?: boolean;
  /** Number of concurrent workers */
  workers?: number;
  /** Timeout per engine (ms) */
  engineTimeout?: number;
  /** Progress callback */
  onProgress?: (progress: ScanProgressEvent) => void;
  /** Finding callback (for streaming) */
  onFinding?: (finding: EngineFinding) => void;
  /** File patterns to include */
  includePatterns?: string[];
  /** File patterns to exclude */
  excludePatterns?: string[];
}

export interface ScanEngineResult {
  findings: EngineFinding[];
  metrics: PerformanceMetrics;
  engineResults: EngineResult[];
  timings: Map<string, number>;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_OPTIONS: Omit<ScanEngineOptions, 'projectRoot'> = {
  incremental: true,
  parallel: true,
  workers: 4,
  engineTimeout: 30000,
  includePatterns: [
    '**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx',
    '**/*.json', '**/*.yaml', '**/*.yml', '**/*.env*',
  ],
  excludePatterns: [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/.git/**',
    '**/coverage/**',
    '**/.next/**',
    '**/*.min.js',
    '**/*.bundle.js',
  ],
};

const HASH_CACHE_PATH = '.vibecheck/file-hashes.json';

// ============================================================================
// FILE CACHING LAYER
// ============================================================================

const FILE_CONTENT_CACHE = new Map<string, FileContext>();

/**
 * Hash file content for cache invalidation
 */
function hashContent(content: string): string {
  return createHash('md5').update(content).digest('hex');
}

/**
 * Load hash cache from disk for incremental detection
 */
async function loadHashCache(projectPath: string): Promise<Map<string, string>> {
  try {
    const cachePath = path.join(projectPath, HASH_CACHE_PATH);
    const data = await fs.readFile(cachePath, 'utf-8');
    return new Map(Object.entries(JSON.parse(data)));
  } catch {
    return new Map();
  }
}

/**
 * Save hash cache to disk
 */
async function saveHashCache(projectPath: string, hashes: Map<string, string>): Promise<void> {
  const cacheDir = path.join(projectPath, '.vibecheck');
  await fs.mkdir(cacheDir, { recursive: true });
  await fs.writeFile(
    path.join(cacheDir, 'file-hashes.json'),
    JSON.stringify(Object.fromEntries(hashes), null, 2)
  );
}

/**
 * Load files with caching and hash-based change detection
 */
async function loadFiles(
  projectPath: string,
  patterns: string[],
  excludePatterns: string[],
  incremental: boolean,
  logger: Logger
): Promise<Map<string, FileContext>> {
  const files = new Map<string, FileContext>();
  const oldHashes = incremental ? await loadHashCache(projectPath) : new Map();
  const newHashes = new Map<string, string>();
  
  // Dynamic import for fast-glob
  const fg = await import('fast-glob');
  const glob = fg.default || fg;
  
  const filePaths = await glob(patterns, {
    cwd: projectPath,
    absolute: true,
    ignore: excludePatterns,
  });
  
  logger.debug(`Found ${filePaths.length} files to load`);
  
  // Read files with concurrency limit
  const CONCURRENCY = 50;
  const chunks: string[][] = [];
  for (let i = 0; i < filePaths.length; i += CONCURRENCY) {
    chunks.push(filePaths.slice(i, i + CONCURRENCY));
  }
  
  for (const chunk of chunks) {
    await Promise.all(chunk.map(async (filePath) => {
      try {
        // Check memory cache first
        if (FILE_CONTENT_CACHE.has(filePath)) {
          const cached = FILE_CONTENT_CACHE.get(filePath)!;
          files.set(filePath, cached);
          newHashes.set(filePath, cached.hash);
          return;
        }
        
        const content = await fs.readFile(filePath, 'utf-8');
        const hash = hashContent(content);
        newHashes.set(filePath, hash);
        
        // Skip if unchanged (incremental mode)
        if (incremental && oldHashes.get(filePath) === hash) {
          return;
        }
        
        const ctx: FileContext = {
          path: filePath,
          content,
          hash,
          lines: content.split('\n'),
          ext: path.extname(filePath).toLowerCase(),
        };
        
        FILE_CONTENT_CACHE.set(filePath, ctx);
        files.set(filePath, ctx);
      } catch (error) {
        // Skip files that can't be read (binary, permission issues, etc.)
        logger.debug(`Skipped file: ${filePath}`);
      }
    }));
  }
  
  // Save new hashes for next incremental scan
  if (incremental) {
    await saveHashCache(projectPath, newHashes);
  }
  
  return files;
}

// ============================================================================
// ENGINE EXECUTION
// ============================================================================

/**
 * Run a single engine with timeout
 */
async function runEngine(
  engine: EngineDefinition,
  ctx: ScanContext,
  timeout: number,
  logger: Logger
): Promise<EngineResult> {
  const startTime = Date.now();
  
  try {
    const findings = await Promise.race([
      engine.run(ctx),
      new Promise<EngineFinding[]>((_, reject) =>
        setTimeout(() => reject(new Error('Engine timeout')), timeout)
      ),
    ]);
    
    const durationMs = Date.now() - startTime;
    ctx.timings.set(engine.name, durationMs);
    
    return {
      engine: engine.name,
      findings,
      durationMs,
      success: true,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    ctx.timings.set(engine.name, durationMs);
    
    logger.warn(`Engine ${engine.name} failed:`, error);
    
    return {
      engine: engine.name,
      findings: [],
      durationMs,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Run multiple engines in parallel with concurrency limit
 */
async function runEnginesParallel(
  engines: EngineDefinition[],
  ctx: ScanContext,
  timeout: number,
  maxConcurrent: number,
  logger: Logger
): Promise<EngineResult[]> {
  const results: EngineResult[] = [];
  
  // Process in batches
  for (let i = 0; i < engines.length; i += maxConcurrent) {
    const batch = engines.slice(i, i + maxConcurrent);
    const batchResults = await Promise.all(
      batch.map(engine => runEngine(engine, ctx, timeout, logger))
    );
    results.push(...batchResults);
  }
  
  return results;
}

/**
 * Run engines sequentially
 */
async function runEnginesSequential(
  engines: EngineDefinition[],
  ctx: ScanContext,
  timeout: number,
  logger: Logger
): Promise<EngineResult[]> {
  const results: EngineResult[] = [];
  
  for (const engine of engines) {
    const result = await runEngine(engine, ctx, timeout, logger);
    results.push(result);
  }
  
  return results;
}

// ============================================================================
// MAIN SCANNER ENGINE
// ============================================================================

/**
 * Run a full scan with all optimizations
 */
export async function runScanEngine(
  engines: EngineDefinition[],
  options: ScanEngineOptions
): Promise<ScanEngineResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const logger = getLogger('scanner-engine');
  const startTime = Date.now();
  
  logger.info(`Starting scan of ${opts.projectRoot}`);
  logger.debug('Options:', {
    incremental: opts.incremental,
    parallel: opts.parallel,
    workers: opts.workers,
    engineCount: engines.length,
  });
  
  // 1. Load files with caching
  const loadStart = Date.now();
  const files = await loadFiles(
    opts.projectRoot,
    opts.includePatterns ?? DEFAULT_OPTIONS.includePatterns!,
    opts.excludePatterns ?? DEFAULT_OPTIONS.excludePatterns!,
    opts.incremental ?? true,
    logger
  );
  const loadDuration = Date.now() - loadStart;
  
  logger.info(`Loaded ${files.size} files in ${loadDuration}ms`);
  
  // 2. Create scan context
  const ctx: ScanContext = {
    files,
    projectRoot: opts.projectRoot,
    timings: new Map(),
    cache: new Map(),
  };
  
  ctx.timings.set('fileLoading', loadDuration);
  
  // 3. Run engines
  const engineStart = Date.now();
  const engineResults = opts.parallel
    ? await runEnginesParallel(
        engines,
        ctx,
        opts.engineTimeout ?? 30000,
        opts.workers ?? 4,
        logger
      )
    : await runEnginesSequential(
        engines,
        ctx,
        opts.engineTimeout ?? 30000,
        logger
      );
  
  ctx.timings.set('engineExecution', Date.now() - engineStart);
  
  // 4. Aggregate findings
  const allFindings: EngineFinding[] = [];
  for (const result of engineResults) {
    allFindings.push(...result.findings);
    
    // Notify via callback if provided
    if (opts.onFinding) {
      for (const finding of result.findings) {
        opts.onFinding(finding);
      }
    }
  }
  
  // 5. Build metrics
  const totalDuration = Date.now() - startTime;
  const metrics: PerformanceMetrics = {
    scanId: `scan-${Date.now()}`,
    startTime,
    endTime: Date.now(),
    durationMs: totalDuration,
    files: {
      total: files.size,
      scanned: files.size,
      fromCache: FILE_CONTENT_CACHE.size - files.size,
      skipped: 0,
    },
    cache: {
      hits: FILE_CONTENT_CACHE.size - files.size,
      misses: files.size,
      hitRate: FILE_CONTENT_CACHE.size > 0 
        ? (FILE_CONTENT_CACHE.size - files.size) / FILE_CONTENT_CACHE.size 
        : 0,
      savedMs: (FILE_CONTENT_CACHE.size - files.size) * 5, // Estimate 5ms per cached file
    },
    workers: {
      used: opts.parallel ? (opts.workers ?? 4) : 1,
      avgTaskMs: engines.length > 0 
        ? Array.from(ctx.timings.values()).reduce((a, b) => a + b, 0) / engines.length 
        : 0,
      throughput: totalDuration > 0 ? (files.size * 1000) / totalDuration : 0,
    },
    memory: {
      peakMb: process.memoryUsage?.()?.heapUsed 
        ? Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
        : 0,
      avgMb: 0,
    },
    breakdown: {
      parseMs: loadDuration,
      analyzeMs: ctx.timings.get('engineExecution') ?? 0,
      verifyMs: 0,
      reportMs: 0,
    },
  };
  
  logger.info(`Scan complete: ${allFindings.length} findings in ${totalDuration}ms`);
  
  return {
    findings: allFindings,
    metrics,
    engineResults,
    timings: ctx.timings,
  };
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Clear file content cache
 */
export function clearFileCache(): void {
  FILE_CONTENT_CACHE.clear();
}

/**
 * Get file cache statistics
 */
export function getFileCacheStats(): { size: number; entries: number } {
  let totalSize = 0;
  for (const ctx of FILE_CONTENT_CACHE.values()) {
    totalSize += ctx.content.length;
  }
  return {
    size: totalSize,
    entries: FILE_CONTENT_CACHE.size,
  };
}

/**
 * Convert EngineFinding to CachedFinding for compatibility with performance scanner
 */
export function toCachedFinding(finding: EngineFinding): CachedFinding {
  return {
    id: finding.id,
    type: finding.type,
    severity: finding.severity,
    message: finding.message,
    file: finding.file,
    line: finding.line,
    column: finding.column ?? null,
    hash: '',
  };
}

/**
 * Format engine timings for display
 */
export function formatEngineTimings(timings: Map<string, number>): string {
  const lines: string[] = [];
  const sorted = Array.from(timings.entries()).sort((a, b) => b[1] - a[1]);
  
  for (const [name, ms] of sorted) {
    const bar = '█'.repeat(Math.min(20, Math.round(ms / 100)));
    lines.push(`  ${name.padEnd(20)} ${String(ms).padStart(6)}ms ${bar}`);
  }
  
  return lines.join('\n');
}

// Re-export from performance module for convenience
export {
  getPerformanceScanner,
  quickScan,
  formatMetrics,
  type PerformanceScannerConfig,
  type ScanResult,
  type CachedFinding,
  type ScanProgressEvent,
  type PerformanceMetrics,
};
