/**
 * Evidence Pack Generator
 * 
 * Generates comprehensive evidence packs for auditing and verification.
 * Bundles all relevant information about a validation or firewall decision.
 */

import * as fs from 'fs/promises';
import * as path from 'path';

export interface EvidencePack {
  id: string;
  generatedAt: Date;
  type: 'firewall_decision' | 'validation' | 'security_audit' | 'review';
  summary: PackSummary;
  context: ContextSnapshot;
  evidence: EvidenceItem[];
  decision: DecisionRecord;
  artifacts: Artifact[];
  metadata: Record<string, unknown>;
}

export interface PackSummary {
  title: string;
  description: string;
  result: 'approved' | 'rejected' | 'warning';
  confidence: number;
  keyFindings: string[];
}

export interface ContextSnapshot {
  file?: string;
  content?: string;
  truthpackVersion?: string;
  truthpackSections: string[];
  intent?: {
    id: string;
    description: string;
    scope: string;
  };
  environment: {
    timestamp: Date;
    mode: string;
    projectRoot: string;
  };
}

export interface EvidenceItem {
  id: string;
  type: 'claim' | 'verification' | 'rule_match' | 'truthpack_entry' | 'code_snippet';
  title: string;
  description: string;
  data: unknown;
  confidence: number;
  source: string;
}

export interface DecisionRecord {
  allowed: boolean;
  reason: string;
  violations: Array<{
    rule: string;
    severity: string;
    message: string;
  }>;
  suggestions: string[];
  overridable: boolean;
}

export interface Artifact {
  name: string;
  type: 'json' | 'text' | 'diff' | 'log';
  content: string;
}

export interface PackConfig {
  outputDirectory: string;
  includeCodeSnippets: boolean;
  includeTruthpackSnapshot: boolean;
  maxContentLength: number;
  compressOldPacks: boolean;
}

const DEFAULT_CONFIG: PackConfig = {
  outputDirectory: '.vibecheck/evidence-packs',
  includeCodeSnippets: true,
  includeTruthpackSnapshot: true,
  maxContentLength: 10000,
  compressOldPacks: false,
};

export class EvidencePackGenerator {
  private config: PackConfig;
  private projectRoot: string;

  constructor(projectRoot: string, config: Partial<PackConfig> = {}) {
    this.projectRoot = projectRoot;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Generate an evidence pack for a firewall decision
   */
  async generateForFirewallDecision(data: {
    filePath: string;
    content: string;
    claims: Array<{ type: string; value: string; confidence: number }>;
    evidence: Array<{ claimId: string; found: boolean; source: string; details?: unknown }>;
    decision: {
      allowed: boolean;
      reason: string;
      violations: Array<{ policy: string; message: string; severity: string }>;
    };
    mode: string;
    intent?: { id: string; description: string; scope: string };
  }): Promise<EvidencePack> {
    const pack: EvidencePack = {
      id: this.generateId(),
      generatedAt: new Date(),
      type: 'firewall_decision',
      summary: {
        title: `Firewall Decision: ${data.decision.allowed ? 'Approved' : 'Rejected'}`,
        description: data.decision.reason,
        result: data.decision.allowed ? 'approved' : 'rejected',
        confidence: this.calculateConfidence(data.claims, data.evidence),
        keyFindings: this.extractKeyFindings(data),
      },
      context: {
        file: data.filePath,
        content: this.truncateContent(data.content),
        truthpackSections: this.getTruthpackSections(data.claims),
        intent: data.intent,
        environment: {
          timestamp: new Date(),
          mode: data.mode,
          projectRoot: this.projectRoot,
        },
      },
      evidence: this.buildEvidenceItems(data.claims, data.evidence),
      decision: {
        allowed: data.decision.allowed,
        reason: data.decision.reason,
        violations: data.decision.violations.map(v => ({
          rule: v.policy,
          severity: v.severity,
          message: v.message,
        })),
        suggestions: this.generateSuggestions(data.decision.violations),
        overridable: data.decision.violations.every(v => v.severity !== 'critical'),
      },
      artifacts: this.generateArtifacts(data),
      metadata: {
        claimCount: data.claims.length,
        evidenceCount: data.evidence.length,
        violationCount: data.decision.violations.length,
      },
    };

    // Save the pack
    await this.savePack(pack);

    return pack;
  }

  /**
   * Generate an evidence pack for a code review
   */
  async generateForReview(data: {
    filePath: string;
    content: string;
    issues: Array<{ severity: string; category: string; message: string; line?: number }>;
    suggestions: Array<{ type: string; description: string }>;
    score: number;
    approved: boolean;
  }): Promise<EvidencePack> {
    const pack: EvidencePack = {
      id: this.generateId(),
      generatedAt: new Date(),
      type: 'review',
      summary: {
        title: `Code Review: ${data.approved ? 'Approved' : 'Changes Requested'}`,
        description: `Score: ${data.score}/100 with ${data.issues.length} issues found`,
        result: data.approved ? 'approved' : 'rejected',
        confidence: data.score / 100,
        keyFindings: data.issues.slice(0, 5).map(i => `[${i.severity}] ${i.message}`),
      },
      context: {
        file: data.filePath,
        content: this.truncateContent(data.content),
        truthpackSections: [],
        environment: {
          timestamp: new Date(),
          mode: 'review',
          projectRoot: this.projectRoot,
        },
      },
      evidence: data.issues.map((issue, i) => ({
        id: `issue-${i}`,
        type: 'rule_match' as const,
        title: issue.category,
        description: issue.message,
        data: { line: issue.line, severity: issue.severity },
        confidence: issue.severity === 'error' ? 1 : 0.8,
        source: 'code-reviewer',
      })),
      decision: {
        allowed: data.approved,
        reason: data.approved ? 'Code review passed' : 'Code review found issues',
        violations: data.issues.filter(i => i.severity === 'error').map(i => ({
          rule: i.category,
          severity: i.severity,
          message: i.message,
        })),
        suggestions: data.suggestions.map(s => s.description),
        overridable: !data.issues.some(i => i.severity === 'error'),
      },
      artifacts: [
        {
          name: 'issues.json',
          type: 'json',
          content: JSON.stringify(data.issues, null, 2),
        },
      ],
      metadata: {
        score: data.score,
        issueCount: data.issues.length,
        suggestionCount: data.suggestions.length,
      },
    };

    await this.savePack(pack);
    return pack;
  }

  /**
   * Load an evidence pack by ID
   */
  async loadPack(id: string): Promise<EvidencePack | null> {
    const packDir = path.join(this.projectRoot, this.config.outputDirectory);
    const packPath = path.join(packDir, `${id}.json`);

    try {
      const content = await fs.readFile(packPath, 'utf-8');
      const pack = JSON.parse(content) as EvidencePack;
      pack.generatedAt = new Date(pack.generatedAt);
      pack.context.environment.timestamp = new Date(pack.context.environment.timestamp);
      return pack;
    } catch {
      return null;
    }
  }

  /**
   * List recent evidence packs
   */
  async listPacks(limit = 20): Promise<Array<{ id: string; type: string; generatedAt: Date; result: string }>> {
    const packDir = path.join(this.projectRoot, this.config.outputDirectory);
    const results: Array<{ id: string; type: string; generatedAt: Date; result: string }> = [];

    try {
      const files = await fs.readdir(packDir);
      const jsonFiles = files.filter(f => f.endsWith('.json')).sort().reverse();

      for (const file of jsonFiles.slice(0, limit)) {
        try {
          const content = await fs.readFile(path.join(packDir, file), 'utf-8');
          const pack = JSON.parse(content) as EvidencePack;
          results.push({
            id: pack.id,
            type: pack.type,
            generatedAt: new Date(pack.generatedAt),
            result: pack.summary.result,
          });
        } catch {
          // Skip invalid files
        }
      }
    } catch {
      // Directory doesn't exist
    }

    return results;
  }

  /**
   * Save evidence pack to disk
   */
  private async savePack(pack: EvidencePack): Promise<void> {
    const packDir = path.join(this.projectRoot, this.config.outputDirectory);
    await fs.mkdir(packDir, { recursive: true });

    const packPath = path.join(packDir, `${pack.id}.json`);
    await fs.writeFile(packPath, JSON.stringify(pack, null, 2), 'utf-8');
  }

  private generateId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2, 8);
    return `evp-${timestamp}-${random}`;
  }

  private truncateContent(content: string): string {
    if (content.length <= this.config.maxContentLength) {
      return content;
    }
    return content.slice(0, this.config.maxContentLength) + '\n... (truncated)';
  }

  private calculateConfidence(
    claims: Array<{ confidence: number }>,
    evidence: Array<{ found: boolean }>
  ): number {
    if (claims.length === 0) return 1;

    const avgClaimConfidence = claims.reduce((a, c) => a + c.confidence, 0) / claims.length;
    const evidenceRate = evidence.filter(e => e.found).length / evidence.length;

    return (avgClaimConfidence + evidenceRate) / 2;
  }

  private extractKeyFindings(data: {
    claims: Array<{ type: string; value: string }>;
    evidence: Array<{ found: boolean }>;
    decision: { violations: Array<{ message: string }> };
  }): string[] {
    const findings: string[] = [];

    // Add violations
    for (const v of data.decision.violations.slice(0, 3)) {
      findings.push(v.message);
    }

    // Add unverified claims
    const unverifiedCount = data.evidence.filter(e => !e.found).length;
    if (unverifiedCount > 0) {
      findings.push(`${unverifiedCount} claim(s) could not be verified`);
    }

    return findings;
  }

  private getTruthpackSections(claims: Array<{ type: string }>): string[] {
    const sections = new Set<string>();
    
    const typeToSection: Record<string, string> = {
      api_endpoint: 'routes',
      env_variable: 'env',
      import: 'contracts',
      type_reference: 'contracts',
    };

    for (const claim of claims) {
      const section = typeToSection[claim.type];
      if (section) {
        sections.add(section);
      }
    }

    return Array.from(sections);
  }

  private buildEvidenceItems(
    claims: Array<{ type: string; value: string; confidence: number }>,
    evidence: Array<{ claimId: string; found: boolean; source: string; details?: unknown }>
  ): EvidenceItem[] {
    return claims.map((claim, i) => {
      const ev = evidence.find(e => e.claimId === `claim-${i}`) || evidence[i];

      return {
        id: `evidence-${i}`,
        type: 'verification' as const,
        title: `${claim.type}: ${claim.value}`,
        description: ev?.found ? 'Verified' : 'Not found',
        data: {
          claim,
          evidence: ev,
        },
        confidence: ev?.found ? claim.confidence : 0,
        source: ev?.source || 'unknown',
      };
    });
  }

  private generateSuggestions(violations: Array<{ policy: string; message: string }>): string[] {
    const suggestions: string[] = [];

    for (const v of violations) {
      if (v.policy.includes('ghost')) {
        suggestions.push('Verify the referenced item exists in the codebase');
      }
      if (v.policy.includes('security')) {
        suggestions.push('Review security implications of this change');
      }
      if (v.policy.includes('drift')) {
        suggestions.push('Regenerate truthpack to sync with codebase');
      }
    }

    return [...new Set(suggestions)];
  }

  private generateArtifacts(data: {
    claims: unknown;
    evidence: unknown;
    decision: unknown;
  }): Artifact[] {
    return [
      {
        name: 'claims.json',
        type: 'json',
        content: JSON.stringify(data.claims, null, 2),
      },
      {
        name: 'evidence.json',
        type: 'json',
        content: JSON.stringify(data.evidence, null, 2),
      },
      {
        name: 'decision.json',
        type: 'json',
        content: JSON.stringify(data.decision, null, 2),
      },
    ];
  }
}
