/**
 * Auto-Fix Orchestrator
 * 
 * Coordinates the end-to-end auto-fix process:
 * 1. Aggregates issues from various sources
 * 2. Selects fix strategies for each issue
 * 3. Dispatches to appropriate fix modules
 * 4. Validates and merges patches
 * 5. Applies or suggests fixes based on confidence
 * 
 * Includes rate limiting, circuit breaker, and comprehensive error handling.
 */

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, resolve } from 'path';
import type {
  Issue,
  IssueType,
  Patch,
  ProposedFix,
  FixResult,
  FixError,
  FixContext,
  FixStrategy,
  AutoFixPolicy,
  TruthpackData,
  ConfidenceScore,
  IssueSeverity,
} from './types.js';
import { 
  DEFAULT_AUTOFIX_POLICY, 
  normalizePolicy, 
  validateIssue,
  SAFETY_LIMITS,
  isIssueType,
  isIssueSeverity,
  ISSUE_TYPES,
} from './types.js';
import { PatchGenerator, PatchGenerationError } from './patch-generator.js';
import { PatchApplier, PatchApplicationError } from './patch-applier.js';
import type { BaseFixModule } from './modules/base-fix-module.js';
import type { PolicyViolation } from '../firewall/policy-engine.js';
import type { DriftItem } from '../validation/drift-detector.js';

/**
 * Configuration for the orchestrator
 */
export interface OrchestratorConfig {
  projectRoot: string;
  truthpackPath?: string;
  policy?: Partial<AutoFixPolicy>;
  dryRun?: boolean;
  verbose?: boolean;
  /** Maximum issues to process per run (default: 100) */
  maxIssuesPerRun?: number;
  /** Timeout for fix generation in ms (default: 30000) */
  fixTimeoutMs?: number;
  /** Enable circuit breaker for failing modules (default: true) */
  enableCircuitBreaker?: boolean;
}

/**
 * Statistics about the fix process
 */
export interface FixStats {
  totalIssues: number;
  fixableIssues: number;
  autoApplied: number;
  suggested: number;
  rejected: number;
  failed: number;
  skipped: number;
  duration?: number;
}

/**
 * Circuit breaker state for modules
 */
interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  isOpen: boolean;
}

/**
 * Default orchestrator limits
 */
const DEFAULT_LIMITS = {
  maxIssuesPerRun: 100,
  fixTimeoutMs: 30000,
  circuitBreakerThreshold: 5,
  circuitBreakerResetMs: 60000,
} as const;

/**
 * AutoFixOrchestrator coordinates the entire auto-fix process
 */
export class AutoFixOrchestrator {
  private readonly config: Required<OrchestratorConfig>;
  private readonly policy: AutoFixPolicy;
  private readonly patchGenerator: PatchGenerator;
  private readonly patchApplier: PatchApplier;
  private readonly fixModules: Map<IssueType, BaseFixModule> = new Map();
  private readonly circuitBreakers: Map<string, CircuitBreakerState> = new Map();
  private truthpack: TruthpackData | null = null;
  private isProcessing = false;
  private abortController: AbortController | null = null;

  constructor(config: OrchestratorConfig) {
    if (!config.projectRoot || typeof config.projectRoot !== 'string') {
      throw new Error('Project root is required');
    }

    this.config = {
      projectRoot: resolve(config.projectRoot),
      truthpackPath: config.truthpackPath ?? '.vibecheck/truthpack',
      dryRun: config.dryRun ?? false,
      verbose: config.verbose ?? false,
      maxIssuesPerRun: Math.min(
        config.maxIssuesPerRun ?? DEFAULT_LIMITS.maxIssuesPerRun,
        SAFETY_LIMITS.MAX_PATCHES_PER_TRANSACTION * 2
      ),
      fixTimeoutMs: Math.max(1000, config.fixTimeoutMs ?? DEFAULT_LIMITS.fixTimeoutMs),
      enableCircuitBreaker: config.enableCircuitBreaker ?? true,
      policy: config.policy,
    };

    this.policy = normalizePolicy(config.policy);
    this.patchGenerator = new PatchGenerator();
    this.patchApplier = new PatchApplier(this.config.projectRoot);
  }

  /**
   * Abort any ongoing processing
   */
  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  /**
   * Check if orchestrator is currently processing
   */
  get processing(): boolean {
    return this.isProcessing;
  }

  /**
   * Register a fix module for handling specific issue types
   */
  registerModule(module: BaseFixModule): void {
    if (!module || typeof module !== 'object') {
      throw new Error('Invalid module');
    }

    if (!module.id || typeof module.id !== 'string') {
      throw new Error('Module must have a valid id');
    }

    if (!Array.isArray(module.issueTypes) || module.issueTypes.length === 0) {
      throw new Error(`Module ${module.id} must handle at least one issue type`);
    }

    for (const issueType of module.issueTypes) {
      if (!isIssueType(issueType)) {
        throw new Error(`Invalid issue type '${issueType}' in module ${module.id}`);
      }
      
      // Check for duplicate registration (warning only)
      if (this.fixModules.has(issueType) && this.config.verbose) {
        const existing = this.fixModules.get(issueType);
        console.warn(
          `Warning: Module ${module.id} overriding ${existing?.id} for issue type ${issueType}`
        );
      }
      
      this.fixModules.set(issueType, module);
    }

    // Initialize circuit breaker for this module
    if (this.config.enableCircuitBreaker) {
      this.circuitBreakers.set(module.id, {
        failures: 0,
        lastFailure: 0,
        isOpen: false,
      });
    }
  }

  /**
   * Process a list of issues and generate/apply fixes
   */
  async processIssues(issues: Issue[]): Promise<FixResult> {
    const startTime = Date.now();
    
    // Prevent concurrent processing
    if (this.isProcessing) {
      throw new Error('Orchestrator is already processing issues');
    }

    this.isProcessing = true;
    this.abortController = new AbortController();

    const result: FixResult = {
      totalIssues: 0,
      fixableIssues: 0,
      appliedFixes: [],
      suggestedFixes: [],
      rejectedFixes: [],
      unfixableIssues: [],
      errors: [],
    };

    try {
      // Input validation
      if (!Array.isArray(issues)) {
        result.errors.push({
          issueId: 'input',
          phase: 'detection',
          message: 'Issues must be an array',
        });
        return result;
      }

      // Filter and validate issues
      const validIssues: Issue[] = [];
      for (let i = 0; i < issues.length; i++) {
        const validated = validateIssue(issues[i]);
        if (validated) {
          validIssues.push(validated);
        } else if (this.config.verbose) {
          console.warn(`Skipping invalid issue at index ${i}`);
        }
      }

      result.totalIssues = validIssues.length;

      if (validIssues.length === 0) {
        return result;
      }

      if (!this.policy.enabled) {
        result.unfixableIssues = validIssues;
        return result;
      }

      // Enforce issue limit
      const issuesToProcess = validIssues.slice(0, this.config.maxIssuesPerRun);
      if (validIssues.length > this.config.maxIssuesPerRun) {
        result.errors.push({
          issueId: 'limit',
          phase: 'detection',
          message: `Processing limited to ${this.config.maxIssuesPerRun} issues (${validIssues.length} total)`,
        });
      }

      // Load truthpack for context
      await this.loadTruthpack();

      // Create fix context
      const context = this.createFixContext();

      // Process each issue with timeout and abort support
      for (const issue of issuesToProcess) {
        // Check for abort
        if (this.abortController.signal.aborted) {
          result.errors.push({
            issueId: issue.id,
            phase: 'generation',
            message: 'Processing aborted',
          });
          break;
        }

        try {
          const proposedFix = await this.processIssueWithTimeout(issue, context);
          
          if (!proposedFix) {
            result.unfixableIssues.push(issue);
            continue;
          }

          result.fixableIssues++;

          // Determine action based on confidence and policy
          const action = this.determineAction(proposedFix, issue);

          switch (action) {
            case 'auto_apply':
              if (!this.config.dryRun) {
                try {
                  const applyResult = await this.patchApplier.apply(proposedFix.patch);
                  if (applyResult.success) {
                    result.appliedFixes.push(proposedFix);
                    this.recordModuleSuccess(proposedFix.moduleId);
                  } else {
                    result.errors.push({
                      issueId: issue.id,
                      phase: 'application',
                      message: applyResult.error ?? 'Unknown error applying patch',
                    });
                    result.suggestedFixes.push(proposedFix);
                  }
                } catch (applyError) {
                  result.errors.push({
                    issueId: issue.id,
                    phase: 'application',
                    message: applyError instanceof Error ? applyError.message : String(applyError),
                  });
                  result.suggestedFixes.push(proposedFix);
                }
              } else {
                // In dry run, treat as applied
                result.appliedFixes.push(proposedFix);
              }
              break;

            case 'suggest':
              result.suggestedFixes.push(proposedFix);
              break;

            case 'reject':
              result.rejectedFixes.push(proposedFix);
              break;
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          
          result.errors.push({
            issueId: issue.id,
            phase: 'generation',
            message: errorMessage,
            stack: error instanceof Error ? error.stack : undefined,
          });
          result.unfixableIssues.push(issue);

          // Record module failure for circuit breaker
          const module = this.fixModules.get(issue.type);
          if (module) {
            this.recordModuleFailure(module.id);
          }
        }
      }

      // Merge patches for the same file if not in dry run
      if (!this.config.dryRun && result.appliedFixes.length > 1) {
        this.mergeAppliedPatches(result);
      }

      return result;
    } finally {
      this.isProcessing = false;
      this.abortController = null;
      
      if (this.config.verbose) {
        console.log(`Processing completed in ${Date.now() - startTime}ms`);
      }
    }
  }

  /**
   * Process a single issue with timeout
   */
  private async processIssueWithTimeout(
    issue: Issue,
    context: FixContext
  ): Promise<ProposedFix | null> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Fix generation timed out after ${this.config.fixTimeoutMs}ms`));
      }, this.config.fixTimeoutMs);

      this.processIssue(issue, context)
        .then((result) => {
          clearTimeout(timeout);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }

  /**
   * Record a successful fix for circuit breaker
   */
  private recordModuleSuccess(moduleId: string): void {
    if (!this.config.enableCircuitBreaker) return;

    const state = this.circuitBreakers.get(moduleId);
    if (state) {
      state.failures = Math.max(0, state.failures - 1);
      state.isOpen = false;
    }
  }

  /**
   * Record a module failure for circuit breaker
   */
  private recordModuleFailure(moduleId: string): void {
    if (!this.config.enableCircuitBreaker) return;

    const state = this.circuitBreakers.get(moduleId);
    if (state) {
      state.failures++;
      state.lastFailure = Date.now();
      
      if (state.failures >= DEFAULT_LIMITS.circuitBreakerThreshold) {
        state.isOpen = true;
        if (this.config.verbose) {
          console.warn(`Circuit breaker opened for module ${moduleId}`);
        }
      }
    }
  }

  /**
   * Check if a module's circuit breaker is open
   */
  private isCircuitBreakerOpen(moduleId: string): boolean {
    if (!this.config.enableCircuitBreaker) return false;

    const state = this.circuitBreakers.get(moduleId);
    if (!state || !state.isOpen) return false;

    // Check if enough time has passed to try again
    if (Date.now() - state.lastFailure > DEFAULT_LIMITS.circuitBreakerResetMs) {
      state.isOpen = false;
      state.failures = 0;
      return false;
    }

    return true;
  }

  /**
   * Process a single issue and generate a fix
   */
  private async processIssue(
    issue: Issue,
    context: FixContext
  ): Promise<ProposedFix | null> {
    // Validate issue
    if (!issue || !issue.id || !issue.type) {
      return null;
    }

    // Check if issue type is blocked
    if (this.isBlocked(issue)) {
      if (this.config.verbose) {
        console.log(`Issue ${issue.id} blocked by policy`);
      }
      return null;
    }

    // Select fix strategy
    const strategy = this.selectStrategy(issue);

    // Get the appropriate fix module
    const module = this.fixModules.get(issue.type);
    
    if (!module) {
      // No module available, try AI-assisted fix if allowed
      if (strategy === 'ai-assisted' && this.policy.allowAIFixes) {
        return this.generateAIFix(issue, context);
      }
      if (this.config.verbose) {
        console.log(`No module available for issue type: ${issue.type}`);
      }
      return null;
    }

    // Check circuit breaker
    if (this.isCircuitBreakerOpen(module.id)) {
      if (this.config.verbose) {
        console.warn(`Circuit breaker open for module ${module.id}, skipping issue ${issue.id}`);
      }
      return null;
    }

    // Check if module can fix this issue
    try {
      if (!module.canFix(issue)) {
        if (this.config.verbose) {
          console.log(`Module ${module.id} cannot fix issue ${issue.id}`);
        }
        return null;
      }
    } catch (canFixError) {
      if (this.config.verbose) {
        console.warn(`Error checking if module can fix: ${canFixError}`);
      }
      return null;
    }

    // Generate the fix
    let patch: Patch | null;
    try {
      patch = await module.generateFix(issue, context);
    } catch (generateError) {
      this.recordModuleFailure(module.id);
      throw generateError;
    }
    
    if (!patch) {
      if (this.config.verbose) {
        console.log(`Module ${module.id} returned no patch for issue ${issue.id}`);
      }
      return null;
    }

    // Validate the patch
    let validation: { valid: boolean; errors: string[] };
    try {
      validation = await module.validate(patch);
    } catch (validateError) {
      if (this.config.verbose) {
        console.warn(`Patch validation error for ${issue.id}:`, validateError);
      }
      validation = { valid: false, errors: [String(validateError)] };
    }
    
    if (!validation.valid) {
      if (this.config.verbose) {
        console.warn(`Patch validation failed for ${issue.id}:`, validation.errors);
      }
      return null;
    }

    // Score confidence
    const confidence = this.scoreConfidence(patch, issue, module, strategy);

    // Generate unique fix ID
    const fixId = `fix-${issue.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    return {
      id: fixId,
      issue,
      patch,
      strategy,
      confidence,
      moduleId: module.id,
      description: module.getFixDescription(issue),
      provenance: `Rule: ${issue.type} | Module: ${module.id}`,
    };
  }

  /**
   * Generate an AI-assisted fix (placeholder - will be implemented with MCP bridge)
   */
  private async generateAIFix(
    issue: Issue,
    context: FixContext
  ): Promise<ProposedFix | null> {
    // This will be implemented in the mcp-ai-bridge todo
    // For now, return null to indicate no AI fix available
    if (this.config.verbose) {
      console.log(`AI-assisted fix requested for ${issue.id} but not yet implemented`);
    }
    return null;
  }

  /**
   * Select the appropriate fix strategy for an issue
   */
  selectStrategy(issue: Issue): FixStrategy {
    // Rule-based for known, well-defined issue types
    const ruleBased: IssueType[] = [
      'ghost-env',
      'ghost-import',
      'ghost-file',
    ];

    if (ruleBased.includes(issue.type)) {
      return 'rule-based';
    }

    // AI-assisted for complex issues
    const aiAssisted: IssueType[] = [
      'silent-failure',
      'fake-success',
      'auth-gap',
    ];

    if (aiAssisted.includes(issue.type) && this.policy.allowAIFixes) {
      return 'ai-assisted';
    }

    // Check if we have a module
    if (this.fixModules.has(issue.type)) {
      return 'rule-based';
    }

    return 'manual';
  }

  /**
   * Determine the action to take for a proposed fix
   */
  private determineAction(
    fix: ProposedFix,
    issue: Issue
  ): 'auto_apply' | 'suggest' | 'reject' {
    // Check confidence threshold
    if (fix.confidence.value < 0.3) {
      return 'reject';
    }

    // Check policy thresholds by severity
    const severityAction = this.policy.severityThresholds[issue.severity];
    
    if (severityAction === 'suggest') {
      return 'suggest';
    }

    // For auto_apply, also check confidence
    if (severityAction === 'auto_apply') {
      if (fix.confidence.value >= this.policy.confidenceThreshold) {
        return 'auto_apply';
      }
      return 'suggest';
    }

    return fix.confidence.recommendation;
  }

  /**
   * Score the confidence of a fix
   */
  private scoreConfidence(
    patch: Patch,
    issue: Issue,
    module: BaseFixModule,
    strategy: FixStrategy
  ): ConfidenceScore {
    const factors: ConfidenceScore['factors'] = [];
    let totalWeight = 0;
    let weightedSum = 0;

    // Factor 1: Fix origin (rule-based vs AI)
    const originWeight = 0.3;
    const originValue = strategy === 'rule-based' ? 1.0 : 0.6;
    factors.push({
      name: 'fix_origin',
      weight: originWeight,
      value: originValue,
      description: strategy === 'rule-based' ? 'Deterministic rule-based fix' : 'AI-generated fix',
    });
    totalWeight += originWeight;
    weightedSum += originWeight * originValue;

    // Factor 2: Issue severity (lower severity = higher confidence in fix safety)
    const severityWeight = 0.2;
    const severityMap = { low: 1.0, medium: 0.8, high: 0.5, critical: 0.3 };
    const severityValue = severityMap[issue.severity];
    factors.push({
      name: 'issue_severity',
      weight: severityWeight,
      value: severityValue,
      description: `Severity: ${issue.severity}`,
    });
    totalWeight += severityWeight;
    weightedSum += severityWeight * severityValue;

    // Factor 3: Change scope (smaller changes = higher confidence)
    const scopeWeight = 0.25;
    const linesChanged = patch.newContent.split('\n').length;
    const scopeValue = Math.max(0, 1 - (linesChanged / this.policy.maxLinesPerFix));
    factors.push({
      name: 'change_scope',
      weight: scopeWeight,
      value: scopeValue,
      description: `${linesChanged} lines affected`,
    });
    totalWeight += scopeWeight;
    weightedSum += scopeWeight * scopeValue;

    // Factor 4: Module reliability (based on module's declared confidence)
    const moduleWeight = 0.25;
    const moduleConfidence = module.confidence;
    const moduleValue = moduleConfidence === 'high' ? 1.0 : moduleConfidence === 'medium' ? 0.7 : 0.4;
    factors.push({
      name: 'module_reliability',
      weight: moduleWeight,
      value: moduleValue,
      description: `Module confidence: ${moduleConfidence}`,
    });
    totalWeight += moduleWeight;
    weightedSum += moduleWeight * moduleValue;

    // Calculate final score
    const finalValue = totalWeight > 0 ? weightedSum / totalWeight : 0;
    
    // Determine level
    let level: ConfidenceScore['level'];
    if (finalValue >= 0.8) {
      level = 'high';
    } else if (finalValue >= 0.5) {
      level = 'medium';
    } else {
      level = 'low';
    }

    // Determine recommendation
    let recommendation: ConfidenceScore['recommendation'];
    if (finalValue >= 0.9 || (issue.severity === 'low' && finalValue >= 0.7)) {
      recommendation = 'auto_apply';
    } else if (finalValue >= 0.3) {
      recommendation = 'suggest';
    } else {
      recommendation = 'reject';
    }

    return {
      value: finalValue,
      level,
      factors,
      recommendation,
    };
  }

  /**
   * Check if an issue is blocked by policy
   */
  private isBlocked(issue: Issue): boolean {
    // Check blocked paths
    if (issue.filePath) {
      for (const pattern of this.policy.blockedPaths) {
        if (this.matchesPattern(issue.filePath, pattern)) {
          return true;
        }
      }
    }

    // Check if severity threshold is 'off' (represented by missing from object)
    // The current AutoFixPolicy doesn't have 'off', but we can treat undefined as off
    
    return false;
  }

  /**
   * Simple pattern matching for blocked paths
   */
  private matchesPattern(path: string, pattern: string): boolean {
    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    
    return new RegExp(regexPattern).test(path);
  }

  /**
   * Group issues by type for batch processing
   */
  private groupIssuesByType(issues: Issue[]): Map<IssueType, Issue[]> {
    const grouped = new Map<IssueType, Issue[]>();
    
    for (const issue of issues) {
      const existing = grouped.get(issue.type) ?? [];
      existing.push(issue);
      grouped.set(issue.type, existing);
    }
    
    return grouped;
  }

  /**
   * Merge applied patches that touch the same files
   */
  private mergeAppliedPatches(result: FixResult): void {
    const patches = result.appliedFixes.map((f) => f.patch);
    const merged = this.patchGenerator.mergePatches(patches);
    
    // Update the patches in applied fixes
    // Note: This is a simplified merge - in production, we'd need to handle
    // the relationship between fixes and their patches more carefully
    if (merged.length < patches.length) {
      if (this.config.verbose) {
        console.log(`Merged ${patches.length} patches into ${merged.length}`);
      }
    }
  }

  /**
   * Create the fix context with all necessary data
   */
  private createFixContext(): FixContext {
    const existingPatches = this.patchApplier.getAppliedPatches();
    
    return {
      projectRoot: this.config.projectRoot,
      truthpackPath: this.config.truthpackPath ?? '.vibecheck/truthpack',
      truthpack: this.truthpack,
      policy: this.policy,
      existingPatches,
    };
  }

  /**
   * Load truthpack data for context
   */
  private async loadTruthpack(): Promise<void> {
    const truthpackPath = join(
      this.config.projectRoot,
      this.config.truthpackPath ?? '.vibecheck/truthpack'
    );

    this.truthpack = {
      routes: await this.loadJson(join(truthpackPath, 'routes.json'), 'routes'),
      env: await this.loadJson(join(truthpackPath, 'env.json'), 'variables'),
      auth: await this.loadJson(join(truthpackPath, 'auth.json'), null),
      contracts: await this.loadJson(join(truthpackPath, 'contracts.json'), 'contracts'),
    };
  }

  /**
   * Load a JSON file from truthpack
   */
  private async loadJson<T>(filePath: string, key: string | null): Promise<T | undefined> {
    if (!existsSync(filePath)) {
      return undefined;
    }

    try {
      const content = await readFile(filePath, 'utf-8');
      const data = JSON.parse(content);
      return key ? data[key] : data;
    } catch {
      return undefined;
    }
  }

  /**
   * Convert policy violations to issues with validation
   */
  static violationsToIssues(violations: PolicyViolation[]): Issue[] {
    if (!Array.isArray(violations)) {
      return [];
    }

    const issues: Issue[] = [];
    const timestamp = Date.now();

    for (let index = 0; index < violations.length; index++) {
      const violation = violations[index];
      
      if (!violation || typeof violation !== 'object') {
        continue;
      }

      // Map policy name to issue type
      let issueType: IssueType;
      const policyName = String(violation.policy || '').toLowerCase();
      
      if (policyName.includes('env')) {
        issueType = 'ghost-env';
      } else if (policyName.includes('route') || policyName.includes('endpoint')) {
        issueType = 'ghost-route';
      } else if (policyName.includes('auth')) {
        issueType = 'auth-gap';
      } else if (policyName.includes('type')) {
        issueType = 'ghost-type';
      } else if (policyName.includes('import')) {
        issueType = 'ghost-import';
      } else if (ISSUE_TYPES.includes(policyName as IssueType)) {
        issueType = policyName as IssueType;
      } else {
        issueType = 'low-confidence';
      }

      // Map severity
      let severity: IssueSeverity;
      const violationSeverity = String(violation.severity || '').toLowerCase();
      if (violationSeverity === 'error' || violationSeverity === 'critical') {
        severity = 'high';
      } else if (violationSeverity === 'warning') {
        severity = 'medium';
      } else {
        severity = 'low';
      }

      issues.push({
        id: `violation-${index}-${timestamp}-${Math.random().toString(36).slice(2, 6)}`,
        type: issueType,
        severity,
        message: String(violation.message || 'Policy violation'),
        suggestion: violation.suggestion ? String(violation.suggestion) : undefined,
        source: 'policy-violation',
        violation,
        metadata: {
          claim: violation.claim,
          originalPolicy: violation.policy,
        },
      });
    }

    return issues;
  }

  /**
   * Convert drift items to issues with validation
   */
  static driftItemsToIssues(items: DriftItem[]): Issue[] {
    if (!Array.isArray(items)) {
      return [];
    }

    const typeMap: Record<string, IssueType> = {
      route: 'ghost-route',
      env: 'ghost-env',
      auth: 'auth-gap',
      type: 'ghost-type',
      component: 'ghost-file',
    };

    const issues: Issue[] = [];
    const timestamp = Date.now();

    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      
      if (!item || typeof item !== 'object') {
        continue;
      }

      const category = String(item.category || '').toLowerCase();
      const issueType = typeMap[category] || 'ghost-file';

      // Validate and normalize severity
      let severity: IssueSeverity;
      if (isIssueSeverity(item.severity)) {
        severity = item.severity;
      } else {
        severity = 'medium';
      }

      issues.push({
        id: `drift-${index}-${timestamp}-${Math.random().toString(36).slice(2, 6)}`,
        type: issueType,
        severity,
        message: String(item.details || `Drift detected in ${category}`),
        source: 'drift-detection',
        driftItem: item,
        metadata: {
          driftType: item.type,
          identifier: item.identifier,
          category,
        },
      });
    }

    return issues;
  }

  /**
   * Get statistics about the fix process
   */
  getStats(result: FixResult): FixStats {
    return {
      totalIssues: result.totalIssues,
      fixableIssues: result.fixableIssues,
      autoApplied: result.appliedFixes.length,
      suggested: result.suggestedFixes.length,
      rejected: result.rejectedFixes.length,
      failed: result.errors.length,
      skipped: result.unfixableIssues.length,
    };
  }

  /**
   * Format fix result as a summary string
   */
  formatSummary(result: FixResult): string {
    const stats = this.getStats(result);
    const lines: string[] = [
      '## Auto-Fix Summary',
      '',
      `- **Total Issues:** ${stats.totalIssues}`,
      `- **Fixable:** ${stats.fixableIssues}`,
      `- **Auto-Applied:** ${stats.autoApplied}`,
      `- **Suggested for Review:** ${stats.suggested}`,
      `- **Rejected:** ${stats.rejected}`,
      `- **Failed:** ${stats.failed}`,
      `- **Unfixable:** ${stats.skipped}`,
    ];

    if (result.appliedFixes.length > 0) {
      lines.push('', '### Applied Fixes:');
      for (const fix of result.appliedFixes) {
        lines.push(`- ${fix.description} (${fix.patch.filePath})`);
      }
    }

    if (result.suggestedFixes.length > 0) {
      lines.push('', '### Suggested Fixes (Review Required):');
      for (const fix of result.suggestedFixes) {
        lines.push(`- ${fix.description} (${fix.patch.filePath})`);
      }
    }

    if (result.errors.length > 0) {
      lines.push('', '### Errors:');
      for (const error of result.errors) {
        lines.push(`- ${error.phase}: ${error.message}`);
      }
    }

    return lines.join('\n');
  }
}
