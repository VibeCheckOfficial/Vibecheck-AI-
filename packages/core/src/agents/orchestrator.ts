/**
 * Orchestrator
 * 
 * Coordinates multiple specialized agents to handle complex
 * code generation tasks with hallucination prevention.
 * 
 * Features:
 * - Multi-stage pipeline execution
 * - Automatic retry with exponential backoff
 * - Circuit breakers for agent failures
 * - Comprehensive audit trail
 * - Performance tracking
 * - Timeout protection
 */

import type { ArchitectAgent, ArchitectureDecision } from './architect-agent.js';
import type { ContextAgent, ContextGatheringResult } from './context-agent.js';
import type { CoderAgent, CodeGenerationResult } from './coder-agent.js';
import type { VerifierAgent, VerificationResult } from './verifier-agent.js';
import { getLogger, type Logger } from '../utils/logger.js';
import { PerformanceTracker } from '../utils/performance.js';
import { withTimeout, withRetry, CircuitBreaker, sleep } from '../utils/retry.js';
import { wrapError, VibeCheckError, TimeoutError } from '../utils/errors.js';
import { validateOrThrow, string, oneOf, object, optional } from '../utils/validation.js';

export interface OrchestratorConfig {
  maxRetries: number;
  timeoutMs: number;
  stageTimeoutMs: number;
  parallelAgents: boolean;
  strictVerification: boolean;
  retryDelayMs: number;
  maxRetryDelayMs: number;
  enableCircuitBreakers: boolean;
  enablePerformanceTracking: boolean;
}

export interface AgentTask {
  id: string;
  type: 'generate' | 'modify' | 'review' | 'explain';
  description: string;
  targetFile?: string;
  context?: Record<string, unknown>;
  priority?: 'low' | 'normal' | 'high';
  correlationId?: string;
}

export interface OrchestratorResult {
  success: boolean;
  task: AgentTask;
  stages: {
    architecture?: ArchitectureDecision;
    context?: ContextGatheringResult;
    generation?: CodeGenerationResult;
    verification?: VerificationResult;
  };
  finalOutput?: string;
  errors: string[];
  warnings: string[];
  auditTrail: AuditEntry[];
  metrics: {
    totalDurationMs: number;
    stageDurations: Record<string, number>;
    retryCount: number;
  };
}

export interface AuditEntry {
  timestamp: Date;
  agent: string;
  action: string;
  result: 'success' | 'failure' | 'retry' | 'skipped' | 'timeout';
  details: Record<string, unknown>;
  durationMs?: number;
}

type StageType = 'architecture' | 'context' | 'generation' | 'verification';

const DEFAULT_CONFIG: OrchestratorConfig = {
  maxRetries: 3,
  timeoutMs: 120000, // 2 minutes total
  stageTimeoutMs: 30000, // 30 seconds per stage
  parallelAgents: false,
  strictVerification: true,
  retryDelayMs: 1000,
  maxRetryDelayMs: 10000,
  enableCircuitBreakers: true,
  enablePerformanceTracking: true,
};

// Validation schemas
const taskTypeValidator = oneOf(['generate', 'modify', 'review', 'explain'] as const);

export class Orchestrator {
  private config: OrchestratorConfig;
  private auditTrail: AuditEntry[] = [];
  private logger: Logger;
  private performanceTracker: PerformanceTracker;
  private circuitBreakers: Map<string, CircuitBreaker>;
  private currentTask: AgentTask | null = null;
  private disposed = false;

  constructor(config: Partial<OrchestratorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = getLogger('orchestrator');
    this.performanceTracker = new PerformanceTracker();
    
    // Initialize circuit breakers for each stage
    this.circuitBreakers = new Map([
      ['architecture', new CircuitBreaker('architecture', {
        failureThreshold: 3,
        successThreshold: 2,
        openDurationMs: 30000,
        onStateChange: (from, to) => this.logger.info('Circuit breaker state change', { stage: 'architecture', from, to }),
      })],
      ['context', new CircuitBreaker('context', {
        failureThreshold: 3,
        successThreshold: 2,
        openDurationMs: 30000,
        onStateChange: (from, to) => this.logger.info('Circuit breaker state change', { stage: 'context', from, to }),
      })],
      ['generation', new CircuitBreaker('generation', {
        failureThreshold: 2,
        successThreshold: 1,
        openDurationMs: 60000,
        onStateChange: (from, to) => this.logger.info('Circuit breaker state change', { stage: 'generation', from, to }),
      })],
      ['verification', new CircuitBreaker('verification', {
        failureThreshold: 3,
        successThreshold: 2,
        openDurationMs: 30000,
        onStateChange: (from, to) => this.logger.info('Circuit breaker state change', { stage: 'verification', from, to }),
      })],
    ]);

    this.logger.info('Orchestrator initialized', {
      maxRetries: this.config.maxRetries,
      timeoutMs: this.config.timeoutMs,
      strictVerification: this.config.strictVerification,
    });
  }

  /**
   * Validate a task before execution
   */
  private validateTask(task: AgentTask): void {
    validateOrThrow(task.id, string({ minLength: 1, maxLength: 100 }), {
      component: 'Orchestrator',
      operation: 'validateTask',
      field: 'id',
    });

    validateOrThrow(task.type, taskTypeValidator, {
      component: 'Orchestrator',
      operation: 'validateTask',
      field: 'type',
    });

    validateOrThrow(task.description, string({ minLength: 1, maxLength: 5000 }), {
      component: 'Orchestrator',
      operation: 'validateTask',
      field: 'description',
    });
  }

  /**
   * Execute a task through the agent pipeline
   */
  async execute(task: AgentTask): Promise<OrchestratorResult> {
    this.assertNotDisposed();
    this.validateTask(task);
    
    const startTime = performance.now();
    this.auditTrail = [];
    this.currentTask = task;
    
    const errors: string[] = [];
    const warnings: string[] = [];
    const stages: OrchestratorResult['stages'] = {};
    const stageDurations: Record<string, number> = {};

    this.logger.info('Starting task execution', {
      taskId: task.id,
      type: task.type,
      correlationId: task.correlationId,
    });

    try {
      // Wrap entire execution in timeout
      await withTimeout(
        async () => {
          // Stage 1: Architecture planning
          const archResult = await this.runStageWithProtection(
            'architecture',
            async () => this.runArchitectureStage(task),
            stageDurations
          );
          
          if (archResult.success) {
            stages.architecture = archResult.result;
          } else {
            warnings.push(`Architecture stage: ${archResult.error}`);
            // Use default architecture for recovery
            stages.architecture = this.getDefaultArchitecture();
          }

          // Stage 2: Context gathering
          const contextResult = await this.runStageWithProtection(
            'context',
            async () => this.runContextStage(task, stages.architecture!),
            stageDurations
          );

          if (contextResult.success) {
            stages.context = contextResult.result;
          } else {
            warnings.push(`Context stage: ${contextResult.error}`);
            stages.context = this.getDefaultContext();
          }

          // Stage 3: Code generation
          const genResult = await this.runStageWithProtection(
            'generation',
            async () => this.runGenerationStage(task, stages.architecture!, stages.context!),
            stageDurations
          );

          if (genResult.success) {
            stages.generation = genResult.result;
          } else {
            errors.push(`Generation stage failed: ${genResult.error}`);
            throw new VibeCheckError('Code generation failed', {
              code: 'INTERNAL_ERROR',
              component: 'Orchestrator',
              operation: 'execute',
              details: { taskId: task.id, stage: 'generation' },
            });
          }

          // Stage 4: Verification
          const verifyResult = await this.runStageWithProtection(
            'verification',
            async () => this.runVerificationStage(stages.generation!, stages.context!),
            stageDurations
          );

          if (verifyResult.success) {
            stages.verification = verifyResult.result;
          } else {
            warnings.push(`Verification stage: ${verifyResult.error}`);
            stages.verification = this.getDefaultVerification();
          }
        },
        this.config.timeoutMs,
        { component: 'Orchestrator', operation: 'execute' }
      );

      // Handle verification failures
      if (stages.verification && !stages.verification.passed && this.config.strictVerification) {
        errors.push(...stages.verification.issues);
        
        this.logger.warn('Task verification failed', {
          taskId: task.id,
          issues: stages.verification.issues,
        });

        return this.createResult(false, task, stages, errors, warnings, startTime, stageDurations, 0);
      }

      this.logger.info('Task execution completed successfully', {
        taskId: task.id,
        durationMs: Math.round(performance.now() - startTime),
      });

      return this.createResult(true, task, stages, errors, warnings, startTime, stageDurations, 0);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      errors.push(errorMessage);
      
      this.logger.error('Task execution failed', error as Error, {
        taskId: task.id,
        durationMs: Math.round(performance.now() - startTime),
      });

      return this.createResult(false, task, stages, errors, warnings, startTime, stageDurations, 0);
    } finally {
      this.currentTask = null;
    }
  }

  /**
   * Execute with automatic retry on verification failure
   */
  async executeWithRetry(task: AgentTask): Promise<OrchestratorResult> {
    this.assertNotDisposed();
    
    let lastResult: OrchestratorResult | null = null;
    let retryCount = 0;
    let delay = this.config.retryDelayMs;

    this.logger.info('Starting task execution with retry', {
      taskId: task.id,
      maxRetries: this.config.maxRetries,
    });

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      this.audit('orchestrator', `Attempt ${attempt}/${this.config.maxRetries}`, {
        taskId: task.id,
        attempt,
      });

      lastResult = await this.execute(task);

      if (lastResult.success) {
        this.logger.info('Task succeeded', {
          taskId: task.id,
          attempt,
          totalRetries: retryCount,
        });
        return lastResult;
      }

      retryCount++;

      // Don't wait after the last attempt
      if (attempt < this.config.maxRetries) {
        this.logger.debug('Retrying after delay', {
          taskId: task.id,
          delayMs: delay,
          nextAttempt: attempt + 1,
        });

        await sleep(delay);

        // Exponential backoff with jitter
        delay = Math.min(
          delay * 2 + Math.random() * 500,
          this.config.maxRetryDelayMs
        );

        // Enhance task context with failure information for retry
        task = {
          ...task,
          context: {
            ...task.context,
            previousAttempt: {
              attempt,
              errors: lastResult.errors,
              verification: lastResult.stages.verification,
              warnings: lastResult.warnings,
            },
          },
        };
      }
    }

    // Update metrics with final retry count
    if (lastResult) {
      lastResult.metrics.retryCount = retryCount;
    }

    this.logger.warn('Task failed after all retries', {
      taskId: task.id,
      totalRetries: retryCount,
      errors: lastResult?.errors,
    });

    return lastResult!;
  }

  /**
   * Run a stage with circuit breaker and timeout protection
   */
  private async runStageWithProtection<T>(
    stage: StageType,
    fn: () => Promise<T>,
    stageDurations: Record<string, number>
  ): Promise<{ success: boolean; result?: T; error?: string }> {
    const startTime = performance.now();
    const circuitBreaker = this.circuitBreakers.get(stage);

    try {
      let result: T;

      if (this.config.enableCircuitBreakers && circuitBreaker) {
        result = await circuitBreaker.execute(async () => {
          return withTimeout(
            fn,
            this.config.stageTimeoutMs,
            { component: 'Orchestrator', operation: stage }
          );
        });
      } else {
        result = await withTimeout(
          fn,
          this.config.stageTimeoutMs,
          { component: 'Orchestrator', operation: stage }
        );
      }

      const duration = performance.now() - startTime;
      stageDurations[stage] = duration;

      this.audit(stage, `Stage completed`, {
        durationMs: Math.round(duration),
        success: true,
      });

      if (this.config.enablePerformanceTracking) {
        this.performanceTracker.record(`stage_${stage}`, duration);
      }

      return { success: true, result };
    } catch (error) {
      const duration = performance.now() - startTime;
      stageDurations[stage] = duration;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const isTimeout = error instanceof TimeoutError;

      this.audit(stage, isTimeout ? 'Stage timed out' : 'Stage failed', {
        durationMs: Math.round(duration),
        error: errorMessage,
        timeout: isTimeout,
      });

      this.logger.warn(`Stage ${stage} failed`, {
        stage,
        error: errorMessage,
        isTimeout,
        durationMs: Math.round(duration),
      });

      return { success: false, error: errorMessage };
    }
  }

  /**
   * Create a standardized result object
   */
  private createResult(
    success: boolean,
    task: AgentTask,
    stages: OrchestratorResult['stages'],
    errors: string[],
    warnings: string[],
    startTime: number,
    stageDurations: Record<string, number>,
    retryCount: number
  ): OrchestratorResult {
    return {
      success,
      task,
      stages,
      finalOutput: success ? stages.generation?.code : undefined,
      errors,
      warnings,
      auditTrail: [...this.auditTrail],
      metrics: {
        totalDurationMs: performance.now() - startTime,
        stageDurations,
        retryCount,
      },
    };
  }

  private async runArchitectureStage(task: AgentTask): Promise<ArchitectureDecision> {
    this.audit('architect', 'Analyzing task requirements', { taskId: task.id });

    // Simulate architecture analysis (would use actual ArchitectAgent)
    await sleep(100); // Simulate processing

    return {
      approach: task.type === 'modify' ? 'incremental' : 'direct',
      components: this.inferComponents(task),
      dependencies: [],
      risks: this.assessRisks(task),
      confidence: 0.8,
    };
  }

  private async runContextStage(
    task: AgentTask,
    architecture: ArchitectureDecision
  ): Promise<ContextGatheringResult> {
    this.audit('context', 'Gathering relevant context', {
      taskId: task.id,
      componentCount: architecture.components.length,
    });

    // Simulate context gathering (would use actual ContextAgent)
    await sleep(100);

    return {
      truthpack: {},
      relatedFiles: task.targetFile ? [task.targetFile] : [],
      conventions: [],
      totalTokens: 0,
    };
  }

  private async runGenerationStage(
    task: AgentTask,
    architecture: ArchitectureDecision,
    context: ContextGatheringResult
  ): Promise<CodeGenerationResult> {
    this.audit('coder', 'Generating code', {
      taskId: task.id,
      approach: architecture.approach,
    });

    // Simulate code generation (would use actual CoderAgent)
    await sleep(200);

    return {
      code: `// Generated code for: ${task.description}\n// Task type: ${task.type}`,
      explanation: `Code generated using ${architecture.approach} approach`,
      confidence: architecture.confidence * 0.9,
    };
  }

  private async runVerificationStage(
    generation: CodeGenerationResult,
    context: ContextGatheringResult
  ): Promise<VerificationResult> {
    this.audit('verifier', 'Verifying generated code', {
      codeLength: generation.code.length,
      confidence: generation.confidence,
    });

    // Simulate verification (would use actual VerifierAgent)
    await sleep(100);

    const issues: string[] = [];
    const hallucinationScore = generation.confidence < 0.5 ? 0.6 : 0.1;

    if (hallucinationScore > 0.5) {
      issues.push('Low confidence in generated code');
    }

    return {
      passed: issues.length === 0,
      issues,
      hallucinationScore,
      suggestions: issues.length > 0 ? ['Consider adding more context'] : [],
    };
  }

  /**
   * Infer components from task
   */
  private inferComponents(task: AgentTask): string[] {
    const components: string[] = [];

    if (task.targetFile) {
      components.push(task.targetFile);
    }

    // Infer from description
    const keywords = task.description.toLowerCase();
    if (keywords.includes('api') || keywords.includes('endpoint')) {
      components.push('api');
    }
    if (keywords.includes('test')) {
      components.push('tests');
    }
    if (keywords.includes('database') || keywords.includes('db')) {
      components.push('database');
    }

    return components;
  }

  /**
   * Assess risks from task
   */
  private assessRisks(task: AgentTask): string[] {
    const risks: string[] = [];
    const description = task.description.toLowerCase();

    if (description.includes('delete') || description.includes('remove')) {
      risks.push('Destructive operation');
    }
    if (description.includes('auth') || description.includes('security')) {
      risks.push('Security-sensitive change');
    }
    if (description.includes('database') || description.includes('migration')) {
      risks.push('Database modification');
    }

    return risks;
  }

  /**
   * Get default architecture for fallback
   */
  private getDefaultArchitecture(): ArchitectureDecision {
    return {
      approach: 'direct',
      components: [],
      dependencies: [],
      risks: ['Architecture analysis skipped'],
      confidence: 0.5,
    };
  }

  /**
   * Get default context for fallback
   */
  private getDefaultContext(): ContextGatheringResult {
    return {
      truthpack: {},
      relatedFiles: [],
      conventions: [],
      totalTokens: 0,
    };
  }

  /**
   * Get default verification for fallback
   */
  private getDefaultVerification(): VerificationResult {
    return {
      passed: false,
      issues: ['Verification was skipped due to errors'],
      hallucinationScore: 1,
      suggestions: ['Manual review recommended'],
    };
  }

  /**
   * Add an audit entry
   */
  private audit(
    agent: string,
    action: string,
    details: Record<string, unknown> = {}
  ): void {
    const entry: AuditEntry = {
      timestamp: new Date(),
      agent,
      action,
      result: 'success',
      details: {
        ...details,
        taskId: this.currentTask?.id,
        correlationId: this.currentTask?.correlationId,
      },
    };

    this.auditTrail.push(entry);
    this.logger.debug(`[${agent}] ${action}`, details);
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): Record<string, unknown> {
    return this.performanceTracker.export();
  }

  /**
   * Get circuit breaker states
   */
  getCircuitBreakerStates(): Record<string, string> {
    const states: Record<string, string> = {};
    for (const [name, breaker] of this.circuitBreakers) {
      states[name] = breaker.getState();
    }
    return states;
  }

  /**
   * Reset all circuit breakers
   */
  resetCircuitBreakers(): void {
    for (const breaker of this.circuitBreakers.values()) {
      breaker.reset();
    }
    this.logger.info('Circuit breakers reset');
  }

  /**
   * Assert orchestrator is not disposed
   */
  private assertNotDisposed(): void {
    if (this.disposed) {
      throw new VibeCheckError('Orchestrator has been disposed', {
        code: 'INTERNAL_ERROR',
        component: 'Orchestrator',
        operation: 'assertNotDisposed',
        recoveryHint: 'Create a new Orchestrator instance',
      });
    }
  }

  /**
   * Dispose and clean up resources
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.currentTask = null;
    this.auditTrail = [];
    this.logger.info('Orchestrator disposed');
  }
}
