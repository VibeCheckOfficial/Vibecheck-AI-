/**
 * Verifier Agent
 * 
 * Verifies generated code against truthpack and context,
 * detecting potential hallucinations and issues.
 */

import type { ContextGatheringResult } from './context-agent.js';

export interface VerificationResult {
  passed: boolean;
  issues: string[];
  hallucinationScore: number;
  suggestions: string[];
  details: VerificationDetails;
}

export interface VerificationDetails {
  importsVerified: ImportVerification[];
  typesVerified: TypeVerification[];
  apisVerified: ApiVerification[];
  conventionsChecked: ConventionCheck[];
}

export interface ImportVerification {
  import: string;
  verified: boolean;
  source?: 'package.json' | 'local' | 'truthpack';
}

export interface TypeVerification {
  type: string;
  verified: boolean;
  expectedShape?: string;
}

export interface ApiVerification {
  endpoint: string;
  verified: boolean;
  truthpackMatch?: string;
}

export interface ConventionCheck {
  convention: string;
  passed: boolean;
  violation?: string;
}

export interface VerifierAgentConfig {
  strictMode: boolean;
  hallucinationThreshold: number;
  checkImports: boolean;
  checkTypes: boolean;
  checkApis: boolean;
}

const DEFAULT_CONFIG: VerifierAgentConfig = {
  strictMode: true,
  hallucinationThreshold: 0.2,
  checkImports: true,
  checkTypes: true,
  checkApis: true,
};

export class VerifierAgent {
  private config: VerifierAgentConfig;

  constructor(config: Partial<VerifierAgentConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Verify generated code
   */
  async verify(
    code: string,
    context: ContextGatheringResult
  ): Promise<VerificationResult> {
    const issues: string[] = [];
    const suggestions: string[] = [];

    // Verify imports
    const importsVerified = this.config.checkImports
      ? await this.verifyImports(code, context)
      : [];

    // Verify types
    const typesVerified = this.config.checkTypes
      ? await this.verifyTypes(code, context)
      : [];

    // Verify API calls
    const apisVerified = this.config.checkApis
      ? await this.verifyApis(code, context)
      : [];

    // Check conventions
    const conventionsChecked = await this.checkConventions(code, context);

    // Collect issues
    for (const imp of importsVerified) {
      if (!imp.verified) {
        issues.push(`Unverified import: ${imp.import}`);
        suggestions.push(`Verify "${imp.import}" exists in package.json or as a local file`);
      }
    }

    for (const type of typesVerified) {
      if (!type.verified) {
        issues.push(`Unverified type: ${type.type}`);
        suggestions.push(`Check truthpack/contracts.json for type "${type.type}"`);
      }
    }

    for (const api of apisVerified) {
      if (!api.verified) {
        issues.push(`Unverified API endpoint: ${api.endpoint}`);
        suggestions.push(`Check truthpack/routes.json for endpoint "${api.endpoint}"`);
      }
    }

    for (const conv of conventionsChecked) {
      if (!conv.passed) {
        issues.push(`Convention violation: ${conv.violation}`);
        suggestions.push(`Follow convention: ${conv.convention}`);
      }
    }

    // Calculate hallucination score
    const hallucinationScore = this.calculateHallucinationScore(
      importsVerified,
      typesVerified,
      apisVerified
    );

    const passed = this.config.strictMode
      ? issues.length === 0 && hallucinationScore < this.config.hallucinationThreshold
      : hallucinationScore < this.config.hallucinationThreshold;

    return {
      passed,
      issues,
      hallucinationScore,
      suggestions,
      details: {
        importsVerified,
        typesVerified,
        apisVerified,
        conventionsChecked,
      },
    };
  }

  /**
   * Quick hallucination check
   */
  async quickCheck(code: string): Promise<{ safe: boolean; concerns: string[] }> {
    const concerns: string[] = [];

    // Check for suspicious patterns
    const suspiciousPatterns = [
      { pattern: /import .* from ['"]@(?!vibecheck|repo)[^\/]+\/[^'"]+['"]/, concern: 'Unusual scoped package import' },
      { pattern: /process\.env\.\w{30,}/, concern: 'Suspiciously long env var name' },
      { pattern: /\/api\/v\d+\/\w+\/\w+\/\w+\/\w+/, concern: 'Overly nested API path' },
    ];

    for (const { pattern, concern } of suspiciousPatterns) {
      if (pattern.test(code)) {
        concerns.push(concern);
      }
    }

    return {
      safe: concerns.length === 0,
      concerns,
    };
  }

  private async verifyImports(
    code: string,
    context: ContextGatheringResult
  ): Promise<ImportVerification[]> {
    const results: ImportVerification[] = [];
    const importRegex = /import .* from ['"]([^'"]+)['"]/g;

    let match;
    while ((match = importRegex.exec(code)) !== null) {
      const importPath = match[1];
      const verified = await this.verifyImport(importPath, context);
      results.push(verified);
    }

    return results;
  }

  private async verifyImport(
    importPath: string,
    context: ContextGatheringResult
  ): Promise<ImportVerification> {
    // Check local imports
    if (importPath.startsWith('./') || importPath.startsWith('../')) {
      // TODO: Check if file exists
      return { import: importPath, verified: true, source: 'local' };
    }

    // Check internal packages
    if (importPath.startsWith('@vibecheck/') || importPath.startsWith('@repo/')) {
      return { import: importPath, verified: true, source: 'local' };
    }

    // TODO: Check package.json for external packages
    return { import: importPath, verified: false };
  }

  private async verifyTypes(
    code: string,
    context: ContextGatheringResult
  ): Promise<TypeVerification[]> {
    const results: TypeVerification[] = [];
    
    // TODO: Implement type verification against truthpack/contracts.json
    // - Extract type references from code
    // - Check against contracts.json schemas

    return results;
  }

  private async verifyApis(
    code: string,
    context: ContextGatheringResult
  ): Promise<ApiVerification[]> {
    const results: ApiVerification[] = [];
    const apiRegex = /['"`](\/api\/[^'"`]+)['"`]/g;

    let match;
    while ((match = apiRegex.exec(code)) !== null) {
      const endpoint = match[1];
      // TODO: Check against truthpack/routes.json
      results.push({
        endpoint,
        verified: false,
      });
    }

    return results;
  }

  private async checkConventions(
    code: string,
    context: ContextGatheringResult
  ): Promise<ConventionCheck[]> {
    const results: ConventionCheck[] = [];

    // Check naming conventions
    const hasDefaultExport = /export default/.test(code);
    if (hasDefaultExport) {
      results.push({
        convention: 'Use named exports instead of default exports',
        passed: false,
        violation: 'Found default export',
      });
    }

    // Check for any type
    const hasAnyType = /:\s*any\b/.test(code);
    if (hasAnyType) {
      results.push({
        convention: 'Avoid using any type',
        passed: false,
        violation: 'Found any type annotation',
      });
    }

    // Check for console.log
    const hasConsoleLog = /console\.log/.test(code);
    if (hasConsoleLog) {
      results.push({
        convention: 'Remove console.log statements',
        passed: false,
        violation: 'Found console.log',
      });
    }

    return results;
  }

  private calculateHallucinationScore(
    imports: ImportVerification[],
    types: TypeVerification[],
    apis: ApiVerification[]
  ): number {
    const totalChecks = imports.length + types.length + apis.length;
    if (totalChecks === 0) return 0;

    const unverified = 
      imports.filter(i => !i.verified).length +
      types.filter(t => !t.verified).length +
      apis.filter(a => !a.verified).length;

    return unverified / totalChecks;
  }
}
