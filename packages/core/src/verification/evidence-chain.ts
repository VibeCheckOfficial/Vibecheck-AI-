/**
 * Evidence Chain Builder
 *
 * Builds explainable evidence chains that document the reasoning
 * behind each verification decision. This is key to achieving
 * "zero false positives" - every decision can be traced and explained.
 */

import type { Claim, ClaimType } from '../firewall/claim-extractor.js';
import type {
  EvidenceChain,
  EvidenceStep,
  SourceEvidence,
  VerificationSource,
  VerificationVerdict,
  VERDICT_THRESHOLDS,
  SOURCE_RELIABILITY,
} from './types.js';

export interface ChainBuilderConfig {
  /** Include detailed metadata in steps */
  includeMetadata: boolean;

  /** Maximum reasoning length */
  maxReasoningLength: number;

  /** Verbose mode for debugging */
  verbose: boolean;
}

const DEFAULT_CONFIG: ChainBuilderConfig = {
  includeMetadata: true,
  maxReasoningLength: 500,
  verbose: false,
};

/**
 * Builds evidence chains with human-readable reasoning
 */
export class EvidenceChainBuilder {
  private config: ChainBuilderConfig;

  constructor(config: Partial<ChainBuilderConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Build an evidence chain from source evidence
   */
  build(
    claim: Claim,
    sourceEvidence: SourceEvidence[],
    startTime: number
  ): EvidenceChain {
    const id = this.generateChainId(claim);
    const steps = this.buildSteps(claim, sourceEvidence);
    const confidence = this.calculateOverallConfidence(sourceEvidence);
    const verdict = this.determineVerdict(confidence, sourceEvidence);
    const reasoning = this.generateReasoning(claim, steps, verdict, confidence);

    return {
      id,
      claimId: claim.id,
      claimType: claim.type,
      claimValue: claim.value,
      verdict,
      confidence,
      chain: steps,
      reasoning,
      createdAt: new Date(),
      durationMs: performance.now() - startTime,
    };
  }

  /**
   * Build individual evidence steps
   */
  private buildSteps(claim: Claim, sourceEvidence: SourceEvidence[]): EvidenceStep[] {
    return sourceEvidence.map((evidence, index) => ({
      step: index + 1,
      source: evidence.source,
      claim: this.formatClaimDescription(claim),
      evidence: this.formatEvidenceDescription(evidence, claim),
      supports: evidence.verified,
      confidence: evidence.confidence,
      location: this.extractLocation(evidence),
      metadata: this.config.includeMetadata ? evidence.details : undefined,
    }));
  }

  /**
   * Format a human-readable claim description
   */
  private formatClaimDescription(claim: Claim): string {
    const typeDescriptions: Record<ClaimType, (value: string) => string> = {
      import: (v) => `Code imports module '${v}'`,
      function_call: (v) => `Code calls function '${v}'`,
      type_reference: (v) => `Code references type '${v}'`,
      api_endpoint: (v) => `Code calls API endpoint '${v}'`,
      env_variable: (v) => `Code uses environment variable '${v}'`,
      file_reference: (v) => `Code references file '${v}'`,
      package_dependency: (v) => `Code depends on package '${v}'`,
    };

    return typeDescriptions[claim.type]?.(claim.value) ?? `Code claims '${claim.value}'`;
  }

  /**
   * Format a human-readable evidence description
   */
  private formatEvidenceDescription(evidence: SourceEvidence, claim: Claim): string {
    if (evidence.error) {
      return `Error during verification: ${evidence.error}`;
    }

    const sourceDescriptions: Record<VerificationSource, (e: SourceEvidence, c: Claim) => string> = {
      truthpack: (e, c) => {
        if (e.verified) {
          const location = e.details.location as { file?: string; line?: number } | undefined;
          return location
            ? `Found in truthpack at ${location.file}:${location.line}`
            : `Found in truthpack (${c.type} registry)`;
        }
        return `Not found in truthpack (searched ${c.type} definitions)`;
      },

      ast: (e, c) => {
        if (e.verified) {
          const match = e.details.matchedLine as string | undefined;
          return match
            ? `Found via AST analysis: "${match.slice(0, 60)}..."`
            : `Found via AST analysis in codebase`;
        }
        return `Not found via AST analysis (searched ${e.details.filesSearched ?? 'N/A'} files)`;
      },

      filesystem: (e, c) => {
        if (e.verified) {
          const path = e.details.resolvedPath as string | undefined;
          return path ? `File exists at: ${path}` : `File found in filesystem`;
        }
        return `File not found in filesystem`;
      },

      git: (e, c) => {
        if (e.verified) {
          return `Found in git history (commit: ${(e.details.commit as string)?.slice(0, 7) ?? 'unknown'})`;
        }
        return `Not found in git history`;
      },

      package_json: (e, c) => {
        if (e.verified) {
          const version = e.details.version as string | undefined;
          const depType = e.details.dependencyType as string | undefined;
          if (e.details.isBuiltin) {
            return `Node.js built-in module`;
          }
          return version
            ? `Found in ${depType ?? 'dependencies'}: version ${version}`
            : `Found in package.json`;
        }
        return `Not found in package.json dependencies`;
      },

      typescript_compiler: (e, c) => {
        if (e.verified) {
          const definedAt = e.details.definedAt as string | undefined;
          return definedAt
            ? `TypeScript confirms: defined at ${definedAt}`
            : `TypeScript compiler verified the reference`;
        }
        return `TypeScript compiler could not resolve the reference`;
      },

      runtime: (e, c) => {
        if (e.verified) {
          return `Runtime verification confirmed (actual execution test)`;
        }
        return `Runtime verification failed: ${e.details.error ?? 'resource not accessible'}`;
      },
    };

    return (
      sourceDescriptions[evidence.source]?.(evidence, claim) ??
      (evidence.verified ? 'Verified' : 'Not verified')
    );
  }

  /**
   * Extract location info from evidence
   */
  private extractLocation(evidence: SourceEvidence): EvidenceStep['location'] | undefined {
    const details = evidence.details;

    if (details.location && typeof details.location === 'object') {
      const loc = details.location as { file?: string; line?: number; column?: number };
      if (loc.file) {
        return {
          file: loc.file,
          line: loc.line,
          column: loc.column,
        };
      }
    }

    if (details.file || details.resolvedPath) {
      return {
        file: (details.file ?? details.resolvedPath) as string,
        line: details.line as number | undefined,
      };
    }

    return undefined;
  }

  /**
   * Calculate overall confidence from all sources
   * Uses weighted average based on source reliability
   */
  private calculateOverallConfidence(sourceEvidence: SourceEvidence[]): number {
    if (sourceEvidence.length === 0) return 0;

    const reliabilityWeights: Record<VerificationSource, number> = {
      runtime: 0.99,
      package_json: 0.99,
      typescript_compiler: 0.98,
      truthpack: 0.95,
      ast: 0.90,
      filesystem: 0.85,
      git: 0.80,
    };

    let weightedSum = 0;
    let totalWeight = 0;

    for (const evidence of sourceEvidence) {
      if (evidence.error) continue; // Skip errored sources

      const weight = reliabilityWeights[evidence.source] ?? 0.5;
      const effectiveConfidence = evidence.verified ? evidence.confidence : 1 - evidence.confidence;

      weightedSum += effectiveConfidence * weight;
      totalWeight += weight;
    }

    if (totalWeight === 0) return 0;

    return weightedSum / totalWeight;
  }

  /**
   * Determine the verification verdict based on confidence and evidence
   */
  private determineVerdict(
    confidence: number,
    sourceEvidence: SourceEvidence[]
  ): VerificationVerdict {
    const verifiedCount = sourceEvidence.filter((e) => e.verified && !e.error).length;
    const totalValid = sourceEvidence.filter((e) => !e.error).length;

    // If no valid evidence, uncertain
    if (totalValid === 0) return 'uncertain';

    // Calculate verification ratio
    const verificationRatio = verifiedCount / totalValid;

    // Determine verdict based on confidence and ratio
    if (confidence >= 0.9 && verificationRatio >= 0.8) {
      return 'confirmed';
    } else if (confidence >= 0.7 && verificationRatio >= 0.6) {
      return 'likely';
    } else if (confidence >= 0.3 && verificationRatio >= 0.3) {
      return 'uncertain';
    } else if (confidence >= 0.1) {
      return 'unlikely';
    } else {
      return 'dismissed';
    }
  }

  /**
   * Generate human-readable reasoning for the verdict
   */
  private generateReasoning(
    claim: Claim,
    steps: EvidenceStep[],
    verdict: VerificationVerdict,
    confidence: number
  ): string {
    const parts: string[] = [];

    // Opening statement
    const claimDesc = this.formatClaimDescription(claim);
    parts.push(`The claim "${claim.value}" (${claim.type}) was ${verdict}.`);

    // Evidence summary
    const supporting = steps.filter((s) => s.supports);
    const opposing = steps.filter((s) => !s.supports);

    if (supporting.length > 0) {
      const sources = supporting.map((s) => s.source).join(', ');
      parts.push(`Supporting evidence from: ${sources}.`);
    }

    if (opposing.length > 0) {
      const sources = opposing.map((s) => s.source).join(', ');
      parts.push(`No evidence found in: ${sources}.`);
    }

    // Confidence explanation
    const confidencePercent = Math.round(confidence * 100);
    parts.push(`Overall confidence: ${confidencePercent}%.`);

    // Verdict-specific reasoning
    switch (verdict) {
      case 'confirmed':
        parts.push('Multiple reliable sources confirm this claim is valid.');
        break;
      case 'likely':
        parts.push('Evidence suggests this claim is probably valid, but could not be fully confirmed.');
        break;
      case 'uncertain':
        parts.push('Insufficient evidence to determine validity. Manual review recommended.');
        break;
      case 'unlikely':
        parts.push('Limited supporting evidence found. This may be a hallucination.');
        break;
      case 'dismissed':
        parts.push('No supporting evidence found. This is likely a hallucination that should be fixed.');
        break;
    }

    // Truncate if too long
    let reasoning = parts.join(' ');
    if (reasoning.length > this.config.maxReasoningLength) {
      reasoning = reasoning.slice(0, this.config.maxReasoningLength - 3) + '...';
    }

    return reasoning;
  }

  /**
   * Generate a unique chain ID
   */
  private generateChainId(claim: Claim): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2, 6);
    return `chain-${claim.type}-${timestamp}-${random}`;
  }

  /**
   * Format an evidence chain for display (CLI/logs)
   */
  formatForDisplay(chain: EvidenceChain): string {
    const lines: string[] = [];

    lines.push(`┌─ Evidence Chain: ${chain.id}`);
    lines.push(`│  Claim: ${chain.claimValue} (${chain.claimType})`);
    lines.push(`│  Verdict: ${chain.verdict.toUpperCase()} (${Math.round(chain.confidence * 100)}% confidence)`);
    lines.push(`│`);

    for (const step of chain.chain) {
      const icon = step.supports ? '✓' : '✗';
      const confidenceStr = `${Math.round(step.confidence * 100)}%`;
      lines.push(`│  ${step.step}. [${icon}] ${step.source} (${confidenceStr})`);
      lines.push(`│     Claim: ${step.claim}`);
      lines.push(`│     Evidence: ${step.evidence}`);
      if (step.location) {
        lines.push(`│     Location: ${step.location.file}${step.location.line ? `:${step.location.line}` : ''}`);
      }
    }

    lines.push(`│`);
    lines.push(`│  Reasoning: ${chain.reasoning}`);
    lines.push(`└─ Duration: ${Math.round(chain.durationMs)}ms`);

    return lines.join('\n');
  }

  /**
   * Convert chain to JSON-serializable format
   */
  toJSON(chain: EvidenceChain): Record<string, unknown> {
    return {
      id: chain.id,
      claimId: chain.claimId,
      claimType: chain.claimType,
      claimValue: chain.claimValue,
      verdict: chain.verdict,
      confidence: chain.confidence,
      chain: chain.chain.map((step) => ({
        step: step.step,
        source: step.source,
        claim: step.claim,
        evidence: step.evidence,
        supports: step.supports,
        confidence: step.confidence,
        location: step.location,
      })),
      reasoning: chain.reasoning,
      createdAt: chain.createdAt.toISOString(),
      durationMs: chain.durationMs,
    };
  }
}

/**
 * Helper to create a simple evidence chain for quick verification
 */
export function createQuickChain(
  claim: Claim,
  verified: boolean,
  source: VerificationSource,
  details: string
): EvidenceChain {
  const builder = new EvidenceChainBuilder();
  const evidence: SourceEvidence = {
    source,
    verified,
    confidence: verified ? 0.95 : 0.05,
    details: { description: details },
    timestamp: new Date(),
    durationMs: 0,
  };

  return builder.build(claim, [evidence], performance.now());
}
