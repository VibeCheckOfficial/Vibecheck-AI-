/**
 * Evidence Collector for Reality Mode
 * 
 * Collects screenshots, network logs, console errors, and traces
 * during runtime verification.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { NetworkLogEntry } from '../types.js';

// ============================================================================
// Types
// ============================================================================

export interface EvidenceCollectorConfig {
  /** Output directory for artifacts */
  outputDir: string;
  /** Route hash for file naming */
  routeHash: string;
  /** Collect screenshots */
  collectScreenshots: boolean;
  /** Collect network logs */
  collectNetworkLogs: boolean;
  /** Collect console errors */
  collectConsoleErrors: boolean;
  /** Collect traces (Playwright) */
  collectTraces?: boolean;
}

export interface CollectedEvidence {
  /** Path to screenshot file */
  screenshotPath?: string;
  /** Path to network log file */
  networkLogPath?: string;
  /** Path to trace file */
  tracePath?: string;
  /** Path to console log file */
  consoleLogPath?: string;
  /** Network logs (in memory) */
  networkLogs?: NetworkLogEntry[];
  /** Console errors (in memory) */
  consoleErrors?: string[];
}

export interface ScreenshotOptions {
  /** Full page screenshot */
  fullPage?: boolean;
  /** Screenshot type */
  type?: 'png' | 'jpeg';
  /** Quality (for jpeg) */
  quality?: number;
  /** Custom suffix for filename */
  suffix?: string;
}

// ============================================================================
// Evidence Collector Class
// ============================================================================

export class EvidenceCollector {
  private config: EvidenceCollectorConfig;
  private networkLogs: NetworkLogEntry[] = [];
  private consoleErrors: string[] = [];
  private screenshotPaths: string[] = [];

  constructor(config: EvidenceCollectorConfig) {
    this.config = config;
  }

  /**
   * Add a network log entry
   */
  addNetworkLog(entry: NetworkLogEntry): void {
    if (this.config.collectNetworkLogs) {
      this.networkLogs.push(entry);
    }
  }

  /**
   * Add multiple network log entries
   */
  addNetworkLogs(entries: NetworkLogEntry[]): void {
    if (this.config.collectNetworkLogs) {
      this.networkLogs.push(...entries);
    }
  }

  /**
   * Add a console error
   */
  addConsoleError(error: string): void {
    if (this.config.collectConsoleErrors) {
      this.consoleErrors.push(error);
    }
  }

  /**
   * Save a screenshot
   */
  async saveScreenshot(
    buffer: Buffer,
    options: ScreenshotOptions = {}
  ): Promise<string | undefined> {
    if (!this.config.collectScreenshots) {
      return undefined;
    }

    const suffix = options.suffix ?? 'page';
    const ext = options.type ?? 'png';
    const filename = `${this.config.routeHash}-${suffix}.${ext}`;
    const screenshotPath = path.join(this.config.outputDir, 'screenshots', filename);

    await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
    await fs.writeFile(screenshotPath, buffer);

    this.screenshotPaths.push(screenshotPath);
    return screenshotPath;
  }

  /**
   * Save network logs to file
   */
  async saveNetworkLogs(): Promise<string | undefined> {
    if (!this.config.collectNetworkLogs || this.networkLogs.length === 0) {
      return undefined;
    }

    const filename = `${this.config.routeHash}-network.json`;
    const logPath = path.join(this.config.outputDir, 'network', filename);

    await fs.mkdir(path.dirname(logPath), { recursive: true });
    await fs.writeFile(logPath, JSON.stringify(this.networkLogs, null, 2));

    return logPath;
  }

  /**
   * Save console errors to file
   */
  async saveConsoleErrors(): Promise<string | undefined> {
    if (!this.config.collectConsoleErrors || this.consoleErrors.length === 0) {
      return undefined;
    }

    const filename = `${this.config.routeHash}-console.json`;
    const logPath = path.join(this.config.outputDir, 'logs', filename);

    await fs.mkdir(path.dirname(logPath), { recursive: true });
    await fs.writeFile(logPath, JSON.stringify(this.consoleErrors, null, 2));

    return logPath;
  }

  /**
   * Finalize and save all collected evidence
   */
  async finalize(): Promise<CollectedEvidence> {
    const [networkLogPath, consoleLogPath] = await Promise.all([
      this.saveNetworkLogs(),
      this.saveConsoleErrors(),
    ]);

    return {
      screenshotPath: this.screenshotPaths[0],
      networkLogPath,
      consoleLogPath,
      networkLogs: this.networkLogs,
      consoleErrors: this.consoleErrors,
    };
  }

  /**
   * Get network logs (in memory)
   */
  getNetworkLogs(): NetworkLogEntry[] {
    return [...this.networkLogs];
  }

  /**
   * Get console errors (in memory)
   */
  getConsoleErrors(): string[] {
    return [...this.consoleErrors];
  }

  /**
   * Get total evidence size in bytes
   */
  async getTotalSize(): Promise<number> {
    let totalSize = 0;

    for (const screenshotPath of this.screenshotPaths) {
      try {
        const stats = await fs.stat(screenshotPath);
        totalSize += stats.size;
      } catch {
        // File doesn't exist
      }
    }

    // Estimate in-memory data size
    totalSize += JSON.stringify(this.networkLogs).length;
    totalSize += JSON.stringify(this.consoleErrors).length;

    return totalSize;
  }

  /**
   * Clear all collected evidence
   */
  clear(): void {
    this.networkLogs = [];
    this.consoleErrors = [];
    this.screenshotPaths = [];
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Create an evidence collector
 */
export function createEvidenceCollector(
  config: EvidenceCollectorConfig
): EvidenceCollector {
  return new EvidenceCollector(config);
}

/**
 * Format evidence for display
 */
export function formatEvidenceForDisplay(evidence: CollectedEvidence): string {
  const lines: string[] = [];

  if (evidence.screenshotPath) {
    lines.push(`Screenshot: ${evidence.screenshotPath}`);
  }

  if (evidence.networkLogs && evidence.networkLogs.length > 0) {
    lines.push(`Network requests: ${evidence.networkLogs.length}`);
    
    // Show failed requests
    const failed = evidence.networkLogs.filter(l => l.status >= 400);
    if (failed.length > 0) {
      lines.push(`  Failed: ${failed.length}`);
      for (const req of failed.slice(0, 3)) {
        lines.push(`    ${req.status} ${req.method} ${req.url}`);
      }
      if (failed.length > 3) {
        lines.push(`    ... and ${failed.length - 3} more`);
      }
    }
  }

  if (evidence.consoleErrors && evidence.consoleErrors.length > 0) {
    lines.push(`Console errors: ${evidence.consoleErrors.length}`);
    for (const error of evidence.consoleErrors.slice(0, 3)) {
      lines.push(`  ${error.slice(0, 100)}`);
    }
    if (evidence.consoleErrors.length > 3) {
      lines.push(`  ... and ${evidence.consoleErrors.length - 3} more`);
    }
  }

  return lines.join('\n');
}
