/**
 * Flow Tracing Engine
 * 
 * Main entry point for flow tracing analysis. Coordinates parsing,
 * analysis, and report generation.
 * 
 * @module flow-tracing/engine
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import fg from 'fast-glob';
import type {
  FlowGraph,
  FlowPath,
  FlowIssue,
  FlowReport,
  FlowTracingConfig,
  FlowNode,
  FlowEdge,
} from './types.js';
import { analyzeFile } from './analyzer.js';
import { getDefaultConfig } from './patterns.js';

// ============================================================================
// Types
// ============================================================================

export interface FlowTracingOptions {
  /** Root directory to analyze */
  rootDir: string;
  /** File patterns to include */
  include?: string[];
  /** File patterns to exclude */
  exclude?: string[];
  /** Maximum path depth for tracing */
  maxPathDepth?: number;
  /** Whether to trace across file boundaries */
  crossFileTracing?: boolean;
  /** Custom configuration */
  config?: Partial<FlowTracingConfig>;
}

export interface FlowTracingResult {
  /** Full report */
  report: FlowReport;
  /** Whether analysis was successful */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

// ============================================================================
// Flow Tracing Engine
// ============================================================================

export class FlowTracingEngine {
  private options: Required<FlowTracingOptions>;
  
  constructor(options: FlowTracingOptions) {
    this.options = {
      rootDir: options.rootDir,
      include: options.include ?? ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
      exclude: options.exclude ?? [
        '**/node_modules/**',
        '**/dist/**',
        '**/build/**',
        '**/*.test.*',
        '**/*.spec.*',
        '**/__tests__/**',
      ],
      maxPathDepth: options.maxPathDepth ?? 20,
      crossFileTracing: options.crossFileTracing ?? false,
      config: options.config ?? {},
    };
  }
  
  /**
   * Run flow tracing analysis
   */
  async analyze(): Promise<FlowTracingResult> {
    const startTime = Date.now();
    
    try {
      // Find all files to analyze
      const files = await this.findFiles();
      
      if (files.length === 0) {
        return {
          success: true,
          report: this.createEmptyReport(startTime),
        };
      }
      
      // Analyze each file
      const allNodes: FlowNode[] = [];
      const allEdges: FlowEdge[] = [];
      const allPaths: FlowPath[] = [];
      const allIssues: FlowIssue[] = [];
      
      for (const file of files) {
        try {
          const code = await fs.readFile(file, 'utf-8');
          const result = analyzeFile(code, file, {
            maxPathDepth: this.options.maxPathDepth,
          });
          
          allNodes.push(...result.graph.nodes);
          allEdges.push(...result.graph.edges);
          allPaths.push(...result.paths);
          allIssues.push(...result.issues);
        } catch (err) {
          // Log but continue with other files
          console.warn(`Failed to analyze ${file}: ${err}`);
        }
      }
      
      // Build combined graph
      const graph: FlowGraph = {
        nodes: allNodes,
        edges: allEdges,
        metadata: {
          files,
          analyzedAt: new Date().toISOString(),
          sourceCount: allNodes.filter(n => n.type === 'source').length,
          sinkCount: allNodes.filter(n => n.type === 'sink').length,
          unvalidatedPaths: allPaths.filter(p => !p.hasValidation).length,
        },
      };
      
      // Build report
      const report = this.buildReport(graph, allPaths, allIssues, files.length, startTime);
      
      return { success: true, report };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        report: this.createEmptyReport(startTime),
      };
    }
  }
  
  /**
   * Analyze a single file
   */
  async analyzeFile(filePath: string): Promise<FlowTracingResult> {
    const startTime = Date.now();
    
    try {
      const code = await fs.readFile(filePath, 'utf-8');
      const result = analyzeFile(code, filePath, {
        maxPathDepth: this.options.maxPathDepth,
      });
      
      const report = this.buildReport(
        result.graph,
        result.paths,
        result.issues,
        1,
        startTime
      );
      
      return { success: true, report };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        report: this.createEmptyReport(startTime),
      };
    }
  }
  
  /**
   * Find all files to analyze
   */
  private async findFiles(): Promise<string[]> {
    const files = await fg(this.options.include, {
      cwd: this.options.rootDir,
      ignore: this.options.exclude,
      absolute: true,
      onlyFiles: true,
    });
    
    return files;
  }
  
  /**
   * Build the final report
   */
  private buildReport(
    graph: FlowGraph,
    paths: FlowPath[],
    issues: FlowIssue[],
    filesAnalyzed: number,
    startTime: number
  ): FlowReport {
    const endTime = Date.now();
    
    // Count issues by severity
    const issuesBySeverity = {
      info: issues.filter(i => i.severity === 'info').length,
      warning: issues.filter(i => i.severity === 'warning').length,
      error: issues.filter(i => i.severity === 'error').length,
      critical: issues.filter(i => i.severity === 'critical').length,
    };
    
    return {
      summary: {
        filesAnalyzed,
        sourcesFound: graph.metadata.sourceCount,
        sinksFound: graph.metadata.sinkCount,
        pathsTraced: paths.length,
        unvalidatedPaths: paths.filter(p => !p.hasValidation).length,
        issuesFound: issues.length,
        issuesBySeverity,
      },
      graph,
      paths,
      issues,
      metadata: {
        startedAt: new Date(startTime).toISOString(),
        completedAt: new Date(endTime).toISOString(),
        durationMs: endTime - startTime,
        version: '1.0.0',
      },
    };
  }
  
  /**
   * Create an empty report
   */
  private createEmptyReport(startTime: number): FlowReport {
    const endTime = Date.now();
    
    return {
      summary: {
        filesAnalyzed: 0,
        sourcesFound: 0,
        sinksFound: 0,
        pathsTraced: 0,
        unvalidatedPaths: 0,
        issuesFound: 0,
        issuesBySeverity: {
          info: 0,
          warning: 0,
          error: 0,
          critical: 0,
        },
      },
      graph: {
        nodes: [],
        edges: [],
        metadata: {
          files: [],
          analyzedAt: new Date().toISOString(),
          sourceCount: 0,
          sinkCount: 0,
          unvalidatedPaths: 0,
        },
      },
      paths: [],
      issues: [],
      metadata: {
        startedAt: new Date(startTime).toISOString(),
        completedAt: new Date(endTime).toISOString(),
        durationMs: endTime - startTime,
        version: '1.0.0',
      },
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new flow tracing engine
 */
export function createFlowTracingEngine(options: FlowTracingOptions): FlowTracingEngine {
  return new FlowTracingEngine(options);
}

/**
 * Quick analysis of a single file
 */
export async function traceFile(filePath: string): Promise<FlowTracingResult> {
  const engine = new FlowTracingEngine({
    rootDir: path.dirname(filePath),
  });
  return engine.analyzeFile(filePath);
}

/**
 * Quick analysis of a directory
 */
export async function traceDirectory(dirPath: string): Promise<FlowTracingResult> {
  const engine = new FlowTracingEngine({
    rootDir: dirPath,
  });
  return engine.analyze();
}
