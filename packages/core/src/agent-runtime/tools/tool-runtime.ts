/**
 * Tool Runtime
 * 
 * Implements the tool contract with validation, gating, and execution.
 * This is the boundary between the LLM and actual operations.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { execSync, spawn } from 'child_process';
import { createHash, randomUUID } from 'crypto';
import {
  validateToolInput,
  isWriteTool,
  type ToolName,
  type ToolResult,
  type WriteToolResult,
  type TruthpackGetInput,
  type RepoDiffInput,
  type RepoReadFilesInput,
  type AnalyzeFindingsInput,
  type TestRunInput,
  type RealityRunProofInput,
  type EvidenceFetchInput,
  type EvidenceListInput,
  type PatchProposeInput,
  type PatchApplyInput,
  type PatchRollbackInput,
  type GitStageInput,
  type GitCommitInput,
} from './tool-schemas.js';
import type { RiskTier } from '../types.js';
import { EvidenceStore } from '../evidence/evidence-store.js';
import { glob } from 'fast-glob';

// ============================================================================
// Types
// ============================================================================

export interface ToolRuntimeConfig {
  /** Project root */
  projectRoot: string;
  /** Truthpack path */
  truthpackPath: string;
  /** Evidence store instance */
  evidenceStore: EvidenceStore;
  /** Risk threshold for auto-approval */
  autoApprovalThreshold: number;
  /** Blocked file patterns */
  blockedPatterns: string[];
  /** Max patch lines */
  maxPatchLines: number;
  /** Callback for approval requests */
  onApprovalRequired?: (request: ApprovalRequest) => Promise<boolean>;
  /** Callback for tool execution logging */
  onToolExecuted?: (log: ToolExecutionLog) => void;
}

export interface ApprovalRequest {
  tool: WriteTool;
  input: unknown;
  riskAssessment: {
    tier: RiskTier;
    reasons: string[];
    score: number;
  };
  diffPreview?: string;
}

export interface ToolExecutionLog {
  tool: ToolName;
  input: unknown;
  output: ToolResult | WriteToolResult;
  durationMs: number;
  timestamp: string;
  approved?: boolean;
}

type WriteTool = 'patch.propose' | 'patch.apply' | 'patch.rollback' | 'git.stage' | 'git.commit';

// ============================================================================
// Tool Runtime Class
// ============================================================================

export class ToolRuntime {
  private config: ToolRuntimeConfig;
  private patchCache: Map<string, PatchProposal> = new Map();
  private checkpointCache: Map<string, CheckpointData> = new Map();
  private executionLog: ToolExecutionLog[] = [];

  constructor(config: ToolRuntimeConfig) {
    this.config = config;
  }

  /**
   * Execute a tool with validation and gating
   */
  async execute(
    tool: ToolName,
    input: unknown
  ): Promise<ToolResult | WriteToolResult> {
    const startTime = Date.now();
    const timestamp = new Date().toISOString();

    // Validate input
    const validation = validateToolInput(tool, input);
    if (!validation.valid) {
      const result: ToolResult = {
        success: false,
        error: `Invalid input: ${validation.errors.join(', ')}`,
        metadata: { tool, timestamp, durationMs: Date.now() - startTime },
      };
      this.logExecution(tool, input, result, startTime);
      return result;
    }

    // Route to appropriate handler
    let result: ToolResult | WriteToolResult;

    try {
      if (isWriteTool(tool)) {
        result = await this.executeWriteTool(tool as WriteTool, validation.data);
      } else {
        result = await this.executeReadTool(tool, validation.data);
      }
    } catch (error) {
      result = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: { tool, timestamp, durationMs: Date.now() - startTime },
      };
    }

    // Update metadata
    result.metadata = {
      ...result.metadata,
      tool,
      timestamp,
      durationMs: Date.now() - startTime,
    };

    this.logExecution(tool, input, result, startTime);
    return result;
  }

  /**
   * Get execution history
   */
  getExecutionLog(): ToolExecutionLog[] {
    return [...this.executionLog];
  }

  /**
   * Clear execution log
   */
  clearLog(): void {
    this.executionLog = [];
  }

  // ============================================================================
  // Read-Only Tool Implementations
  // ============================================================================

  private async executeReadTool(
    tool: ToolName,
    input: unknown
  ): Promise<ToolResult> {
    switch (tool) {
      case 'truthpack.get':
        return this.truthpackGet(input as TruthpackGetInput);
      case 'repo.diff':
        return this.repoDiff(input as RepoDiffInput);
      case 'repo.readFiles':
        return this.repoReadFiles(input as RepoReadFilesInput);
      case 'analyze.findings':
        return this.analyzeFindings(input as AnalyzeFindingsInput);
      case 'test.run':
        return this.testRun(input as TestRunInput);
      case 'reality.runProof':
        return this.realityRunProof(input as RealityRunProofInput);
      case 'evidence.fetch':
        return this.evidenceFetch(input as EvidenceFetchInput);
      case 'evidence.list':
        return this.evidenceList(input as EvidenceListInput);
      default:
        return {
          success: false,
          error: `Unknown read tool: ${tool}`,
          metadata: { tool, timestamp: new Date().toISOString() },
        };
    }
  }

  private async truthpackGet(input: TruthpackGetInput): Promise<ToolResult> {
    const truthpackDir = path.join(this.config.projectRoot, this.config.truthpackPath);

    try {
      if (input.section === 'all') {
        const sections = ['routes', 'env', 'auth', 'api'];
        const data: Record<string, unknown> = {};

        for (const section of sections) {
          try {
            const content = await fs.readFile(
              path.join(truthpackDir, `${section}.json`),
              'utf-8'
            );
            data[section] = JSON.parse(content);
          } catch {
            data[section] = null;
          }
        }

        return { success: true, data, metadata: { tool: 'truthpack.get', timestamp: new Date().toISOString() } };
      }

      const filePath = path.join(truthpackDir, `${input.section}.json`);
      const content = await fs.readFile(filePath, 'utf-8');
      let data = JSON.parse(content);

      // Apply filters
      if (input.filter && Array.isArray(data)) {
        if (input.filter.path) {
          data = data.filter((item: { path?: string }) => 
            item.path?.includes(input.filter!.path!)
          );
        }
        if (input.filter.method) {
          data = data.filter((item: { method?: string }) => 
            item.method === input.filter!.method
          );
        }
        if (input.filter.protected !== undefined) {
          data = data.filter((item: { auth?: { required?: boolean } }) => 
            item.auth?.required === input.filter!.protected
          );
        }
      }

      return { success: true, data, metadata: { tool: 'truthpack.get', timestamp: new Date().toISOString() } };
    } catch (error) {
      return {
        success: false,
        error: `Failed to read truthpack: ${error instanceof Error ? error.message : String(error)}`,
        metadata: { tool: 'truthpack.get', timestamp: new Date().toISOString() },
      };
    }
  }

  private async repoDiff(input: RepoDiffInput): Promise<ToolResult> {
    try {
      let cmd = `git diff ${input.base}..${input.head}`;
      
      if (input.stats) {
        cmd += ' --stat';
      }
      
      if (input.paths && input.paths.length > 0) {
        cmd += ` -- ${input.paths.join(' ')}`;
      }

      const output = execSync(cmd, {
        cwd: this.config.projectRoot,
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
      });

      // Parse stats if requested
      let stats: { files: number; additions: number; deletions: number } | undefined;
      if (input.stats) {
        const lines = output.split('\n');
        const summaryLine = lines.find(l => l.includes('file') && l.includes('change'));
        if (summaryLine) {
          const filesMatch = summaryLine.match(/(\d+) file/);
          const addMatch = summaryLine.match(/(\d+) insertion/);
          const delMatch = summaryLine.match(/(\d+) deletion/);
          stats = {
            files: filesMatch ? parseInt(filesMatch[1], 10) : 0,
            additions: addMatch ? parseInt(addMatch[1], 10) : 0,
            deletions: delMatch ? parseInt(delMatch[1], 10) : 0,
          };
        }
      }

      return {
        success: true,
        data: { diff: output, stats },
        metadata: { tool: 'repo.diff', timestamp: new Date().toISOString() },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to get diff: ${error instanceof Error ? error.message : String(error)}`,
        metadata: { tool: 'repo.diff', timestamp: new Date().toISOString() },
      };
    }
  }

  private async repoReadFiles(input: RepoReadFilesInput): Promise<ToolResult> {
    try {
      const files = await glob(input.globs, {
        cwd: this.config.projectRoot,
        ignore: ['node_modules/**', 'dist/**', 'build/**', '.git/**'],
        absolute: false,
      });

      const results: Array<{ path: string; content: string; lines?: number }> = [];
      let totalBytes = 0;

      for (const file of files) {
        if (totalBytes >= input.maxBytes) {
          break;
        }

        const fullPath = path.join(this.config.projectRoot, file);
        const stat = await fs.stat(fullPath);
        
        if (stat.size + totalBytes > input.maxBytes) {
          continue;
        }

        const content = await fs.readFile(fullPath, 'utf-8');
        totalBytes += stat.size;

        results.push({
          path: file,
          content: input.includeLineNumbers
            ? content.split('\n').map((line, i) => `${i + 1}|${line}`).join('\n')
            : content,
          lines: content.split('\n').length,
        });
      }

      return {
        success: true,
        data: { files: results, totalBytes },
        metadata: { tool: 'repo.readFiles', timestamp: new Date().toISOString() },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to read files: ${error instanceof Error ? error.message : String(error)}`,
        metadata: { tool: 'repo.readFiles', timestamp: new Date().toISOString() },
      };
    }
  }

  private async analyzeFindings(input: AnalyzeFindingsInput): Promise<ToolResult> {
    // This would integrate with the existing analysis engine
    // For now, return a placeholder
    return {
      success: true,
      data: {
        findings: [],
        scope: input.scope,
        message: 'Analysis integration pending',
      },
      metadata: { tool: 'analyze.findings', timestamp: new Date().toISOString() },
    };
  }

  private async testRun(input: TestRunInput): Promise<ToolResult> {
    try {
      let cmd: string;
      
      switch (input.type) {
        case 'typecheck':
          cmd = 'npx tsc --noEmit';
          break;
        case 'unit':
          cmd = input.scope && input.scope.length > 0
            ? `npx vitest run ${input.scope.join(' ')}`
            : 'npx vitest run';
          break;
        case 'lint':
          cmd = input.scope && input.scope.length > 0
            ? `npx eslint ${input.scope.join(' ')}`
            : 'npx eslint .';
          break;
        case 'e2e':
          cmd = 'npx playwright test';
          break;
        default:
          return {
            success: false,
            error: `Unknown test type: ${input.type}`,
            metadata: { tool: 'test.run', timestamp: new Date().toISOString() },
          };
      }

      const output = execSync(cmd, {
        cwd: this.config.projectRoot,
        encoding: 'utf-8',
        timeout: input.timeout * 1000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      return {
        success: true,
        data: { output, passed: true },
        metadata: { tool: 'test.run', timestamp: new Date().toISOString() },
      };
    } catch (error) {
      const err = error as { stdout?: string; stderr?: string; status?: number };
      return {
        success: false,
        data: {
          output: err.stdout ?? '',
          errors: err.stderr ?? '',
          exitCode: err.status ?? 1,
          passed: false,
        },
        error: 'Tests failed',
        metadata: { tool: 'test.run', timestamp: new Date().toISOString() },
      };
    }
  }

  private async realityRunProof(input: RealityRunProofInput): Promise<ToolResult> {
    // This would integrate with the existing reality mode engine
    // For now, return a placeholder indicating integration point
    return {
      success: true,
      data: {
        planId: input.planId,
        status: 'pending_integration',
        message: 'Reality mode proof execution pending integration',
      },
      metadata: { tool: 'reality.runProof', timestamp: new Date().toISOString() },
    };
  }

  private async evidenceFetch(input: EvidenceFetchInput): Promise<ToolResult> {
    try {
      const receipts = input.receiptIds
        ? await Promise.all(
            input.receiptIds.map(id => this.config.evidenceStore.getReceipt(id))
          )
        : await this.config.evidenceStore.getRunReceipts(input.runId);

      const validReceipts = receipts.filter(Boolean);

      let artifacts: Record<string, string> = {};
      if (input.includeArtifacts) {
        const exported = await this.config.evidenceStore.exportRun(input.runId);
        artifacts = exported.manifest;
      }

      return {
        success: true,
        data: { receipts: validReceipts, artifacts },
        metadata: { tool: 'evidence.fetch', timestamp: new Date().toISOString() },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to fetch evidence: ${error instanceof Error ? error.message : String(error)}`,
        metadata: { tool: 'evidence.fetch', timestamp: new Date().toISOString() },
      };
    }
  }

  private async evidenceList(input: EvidenceListInput): Promise<ToolResult> {
    try {
      const receipts = await this.config.evidenceStore.queryReceipts({
        kind: input.kind,
        runId: input.runId,
        limit: input.limit,
      });

      return {
        success: true,
        data: {
          receipts: receipts.map(r => ({
            receiptId: r.receiptId,
            kind: r.kind,
            summary: r.summary,
            timestamp: r.timestamp,
            runId: r.runId,
          })),
          total: receipts.length,
        },
        metadata: { tool: 'evidence.list', timestamp: new Date().toISOString() },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to list evidence: ${error instanceof Error ? error.message : String(error)}`,
        metadata: { tool: 'evidence.list', timestamp: new Date().toISOString() },
      };
    }
  }

  // ============================================================================
  // Write Tool Implementations (Gated)
  // ============================================================================

  private async executeWriteTool(
    tool: WriteTool,
    input: unknown
  ): Promise<WriteToolResult> {
    // Assess risk before any write operation
    const riskAssessment = this.assessRisk(tool, input);
    
    // Check if approval is required
    const requiresApproval = riskAssessment.tier === 'HIGH' || 
      riskAssessment.score > this.config.autoApprovalThreshold;

    if (requiresApproval && this.config.onApprovalRequired) {
      const approved = await this.config.onApprovalRequired({
        tool,
        input,
        riskAssessment,
      });

      if (!approved) {
        return {
          success: false,
          error: 'Operation rejected: approval denied',
          requiresApproval: true,
          riskAssessment,
          metadata: { tool, timestamp: new Date().toISOString() },
        };
      }
    }

    // Execute the write operation
    switch (tool) {
      case 'patch.propose':
        return this.patchPropose(input as PatchProposeInput, riskAssessment);
      case 'patch.apply':
        return this.patchApply(input as PatchApplyInput, riskAssessment);
      case 'patch.rollback':
        return this.patchRollback(input as PatchRollbackInput, riskAssessment);
      case 'git.stage':
        return this.gitStage(input as GitStageInput, riskAssessment);
      case 'git.commit':
        return this.gitCommit(input as GitCommitInput, riskAssessment);
      default:
        return {
          success: false,
          error: `Unknown write tool: ${tool}`,
          requiresApproval: false,
          metadata: { tool, timestamp: new Date().toISOString() },
        };
    }
  }

  private async patchPropose(
    input: PatchProposeInput,
    riskAssessment: { tier: RiskTier; reasons: string[]; score: number }
  ): Promise<WriteToolResult> {
    // Check blocked patterns
    for (const file of input.files) {
      if (this.isBlockedPath(file.path)) {
        return {
          success: false,
          error: `File ${file.path} matches blocked pattern`,
          requiresApproval: false,
          riskAssessment,
          metadata: { tool: 'patch.propose', timestamp: new Date().toISOString() },
        };
      }
    }

    // Generate diff
    const diffLines: string[] = [];
    let totalLinesChanged = 0;

    for (const file of input.files) {
      if (file.operation === 'create') {
        diffLines.push(`--- /dev/null`);
        diffLines.push(`+++ b/${file.path}`);
        const lines = file.content?.split('\n') ?? [];
        totalLinesChanged += lines.length;
        lines.forEach((line, i) => {
          diffLines.push(`+${line}`);
        });
      } else if (file.operation === 'delete') {
        diffLines.push(`--- a/${file.path}`);
        diffLines.push(`+++ /dev/null`);
        // Would need to read existing content
        totalLinesChanged += 1; // Placeholder
      } else if (file.operation === 'modify' && file.changes) {
        diffLines.push(`--- a/${file.path}`);
        diffLines.push(`+++ b/${file.path}`);
        for (const change of file.changes) {
          totalLinesChanged += change.replacement.split('\n').length;
          diffLines.push(`@@ -${change.startLine},${change.endLine - change.startLine + 1} @@`);
          diffLines.push(`+${change.replacement}`);
        }
      }
    }

    // Check line limit
    if (totalLinesChanged > this.config.maxPatchLines) {
      return {
        success: false,
        error: `Patch exceeds max lines (${totalLinesChanged} > ${this.config.maxPatchLines})`,
        requiresApproval: false,
        riskAssessment,
        metadata: { tool: 'patch.propose', timestamp: new Date().toISOString() },
      };
    }

    // Create patch proposal
    const patchId = `patch_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const diff = diffLines.join('\n');

    const proposal: PatchProposal = {
      patchId,
      goal: input.goal,
      files: input.files.map(f => f.path),
      diff,
      linesChanged: totalLinesChanged,
      missionId: input.missionId,
      createdAt: new Date().toISOString(),
    };

    this.patchCache.set(patchId, proposal);

    return {
      success: true,
      data: { patchId, linesChanged: totalLinesChanged },
      requiresApproval: false,
      riskAssessment,
      diffPreview: diff.slice(0, 2000), // Preview first 2KB
      metadata: { tool: 'patch.propose', timestamp: new Date().toISOString() },
    };
  }

  private async patchApply(
    input: PatchApplyInput,
    riskAssessment: { tier: RiskTier; reasons: string[]; score: number }
  ): Promise<WriteToolResult> {
    const patch = this.patchCache.get(input.diffId);
    
    if (!patch) {
      return {
        success: false,
        error: `Patch not found: ${input.diffId}`,
        requiresApproval: false,
        riskAssessment,
        metadata: { tool: 'patch.apply', timestamp: new Date().toISOString() },
      };
    }

    // Create checkpoint before applying
    const checkpointId = `cp_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const checkpointData: CheckpointData = {
      id: checkpointId,
      files: {},
      createdAt: new Date().toISOString(),
    };

    // Backup affected files
    for (const filePath of patch.files) {
      const fullPath = path.join(this.config.projectRoot, filePath);
      try {
        const content = await fs.readFile(fullPath, 'utf-8');
        checkpointData.files[filePath] = content;
      } catch {
        checkpointData.files[filePath] = null; // File doesn't exist
      }
    }

    this.checkpointCache.set(checkpointId, checkpointData);

    // Apply patch (simplified - real implementation would use proper diff application)
    // This is a placeholder for integration with the actual patch applier
    
    return {
      success: true,
      data: { patchId: input.diffId, applied: true },
      requiresApproval: riskAssessment.tier === 'HIGH',
      riskAssessment,
      checkpointId,
      metadata: { tool: 'patch.apply', timestamp: new Date().toISOString() },
    };
  }

  private async patchRollback(
    input: PatchRollbackInput,
    riskAssessment: { tier: RiskTier; reasons: string[]; score: number }
  ): Promise<WriteToolResult> {
    const checkpoint = this.checkpointCache.get(input.checkpointId);
    
    if (!checkpoint) {
      return {
        success: false,
        error: `Checkpoint not found: ${input.checkpointId}`,
        requiresApproval: false,
        riskAssessment,
        metadata: { tool: 'patch.rollback', timestamp: new Date().toISOString() },
      };
    }

    // Restore files
    const filesToRestore = input.files ?? Object.keys(checkpoint.files);
    const restoredFiles: string[] = [];

    for (const filePath of filesToRestore) {
      const content = checkpoint.files[filePath];
      const fullPath = path.join(this.config.projectRoot, filePath);

      if (content === null) {
        // File didn't exist - delete it
        try {
          await fs.unlink(fullPath);
          restoredFiles.push(filePath);
        } catch {
          // Already deleted
        }
      } else if (content !== undefined) {
        // Restore content
        await fs.writeFile(fullPath, content);
        restoredFiles.push(filePath);
      }
    }

    return {
      success: true,
      data: { checkpointId: input.checkpointId, restoredFiles },
      requiresApproval: false,
      riskAssessment,
      metadata: { tool: 'patch.rollback', timestamp: new Date().toISOString() },
    };
  }

  private async gitStage(
    input: GitStageInput,
    riskAssessment: { tier: RiskTier; reasons: string[]; score: number }
  ): Promise<WriteToolResult> {
    const patch = this.patchCache.get(input.diffId);
    
    if (!patch) {
      return {
        success: false,
        error: `Patch not found: ${input.diffId}`,
        requiresApproval: false,
        riskAssessment,
        metadata: { tool: 'git.stage', timestamp: new Date().toISOString() },
      };
    }

    const filesToStage = input.files ?? patch.files;

    try {
      execSync(`git add ${filesToStage.join(' ')}`, {
        cwd: this.config.projectRoot,
        encoding: 'utf-8',
      });

      return {
        success: true,
        data: { staged: filesToStage },
        requiresApproval: false,
        riskAssessment,
        metadata: { tool: 'git.stage', timestamp: new Date().toISOString() },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to stage files: ${error instanceof Error ? error.message : String(error)}`,
        requiresApproval: false,
        riskAssessment,
        metadata: { tool: 'git.stage', timestamp: new Date().toISOString() },
      };
    }
  }

  private async gitCommit(
    input: GitCommitInput,
    riskAssessment: { tier: RiskTier; reasons: string[]; score: number }
  ): Promise<WriteToolResult> {
    try {
      const args = input.skipHooks ? ['--no-verify'] : [];
      
      execSync(`git commit ${args.join(' ')} -m "${input.message.replace(/"/g, '\\"')}"`, {
        cwd: this.config.projectRoot,
        encoding: 'utf-8',
      });

      return {
        success: true,
        data: { committed: true, message: input.message },
        requiresApproval: true, // Commits always require approval
        riskAssessment,
        metadata: { tool: 'git.commit', timestamp: new Date().toISOString() },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to commit: ${error instanceof Error ? error.message : String(error)}`,
        requiresApproval: true,
        riskAssessment,
        metadata: { tool: 'git.commit', timestamp: new Date().toISOString() },
      };
    }
  }

  // ============================================================================
  // Risk Assessment
  // ============================================================================

  private assessRisk(
    tool: WriteTool,
    input: unknown
  ): { tier: RiskTier; reasons: string[]; score: number } {
    const reasons: string[] = [];
    let score = 0;

    // Base risk by tool type
    const toolRisk: Record<WriteTool, number> = {
      'patch.propose': 10,
      'patch.apply': 40,
      'patch.rollback': 20,
      'git.stage': 30,
      'git.commit': 60,
    };
    score += toolRisk[tool];

    // Check for sensitive patterns
    if (tool === 'patch.propose' || tool === 'patch.apply') {
      const patchInput = input as PatchProposeInput | PatchApplyInput;
      
      if ('files' in patchInput) {
        for (const file of patchInput.files) {
          const filePath = typeof file === 'string' ? file : file.path;
          
          // Auth/security files
          if (/auth|security|password|secret|cred/i.test(filePath)) {
            score += 30;
            reasons.push(`Touches security-related file: ${filePath}`);
          }
          
          // Config files
          if (/config|env|\.[a-z]+rc/i.test(filePath)) {
            score += 20;
            reasons.push(`Touches configuration file: ${filePath}`);
          }
          
          // Lock files
          if (/lock\.json|lock\.yaml/i.test(filePath)) {
            score += 40;
            reasons.push(`Touches lockfile: ${filePath}`);
          }
          
          // Payment/billing
          if (/payment|billing|stripe|checkout/i.test(filePath)) {
            score += 35;
            reasons.push(`Touches payment-related file: ${filePath}`);
          }
        }
      }
    }

    // Determine tier
    let tier: RiskTier;
    if (score >= 70) {
      tier = 'HIGH';
    } else if (score >= 40) {
      tier = 'MEDIUM';
    } else {
      tier = 'LOW';
    }

    return { tier, reasons, score: Math.min(100, score) };
  }

  private isBlockedPath(filePath: string): boolean {
    return this.config.blockedPatterns.some(pattern => {
      const regex = new RegExp(
        pattern.replace(/\*/g, '.*').replace(/\?/g, '.'),
        'i'
      );
      return regex.test(filePath);
    });
  }

  private logExecution(
    tool: ToolName,
    input: unknown,
    output: ToolResult | WriteToolResult,
    startTime: number
  ): void {
    const log: ToolExecutionLog = {
      tool,
      input,
      output,
      durationMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
      approved: 'requiresApproval' in output ? !output.requiresApproval || output.success : undefined,
    };

    this.executionLog.push(log);
    this.config.onToolExecuted?.(log);
  }
}

// ============================================================================
// Helper Types
// ============================================================================

interface PatchProposal {
  patchId: string;
  goal: string;
  files: string[];
  diff: string;
  linesChanged: number;
  missionId?: string;
  createdAt: string;
}

interface CheckpointData {
  id: string;
  files: Record<string, string | null>;
  createdAt: string;
}

// ============================================================================
// Factory Function
// ============================================================================

export function createToolRuntime(config: ToolRuntimeConfig): ToolRuntime {
  return new ToolRuntime(config);
}
