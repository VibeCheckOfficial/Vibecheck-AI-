/**
 * Claim Extractor
 * 
 * Extracts verifiable claims from AI-generated content
 * that need to be validated against ground truth.
 */

export type ClaimType =
  | 'import'
  | 'function_call'
  | 'type_reference'
  | 'api_endpoint'
  | 'env_variable'
  | 'file_reference'
  | 'package_dependency';

import { generateFindingId } from '../utils/deterministic-ids.js';

export interface Claim {
  id: string;  // Stable claim ID
  type: ClaimType;
  value: string;
  location: {
    line: number;
    column: number;
    length: number;
  };
  confidence: number;
  context: string;
}

export interface ExtractionResult {
  claims: Claim[];
  unverifiable: string[];
  statistics: {
    totalClaims: number;
    byType: Record<ClaimType, number>;
    avgConfidence: number;
  };
}

export class ClaimExtractor {
  /**
   * Extract all claims from content
   */
  async extract(content: string): Promise<Claim[]> {
    const claims: Claim[] = [];

    claims.push(...this.extractImports(content));
    claims.push(...this.extractFunctionCalls(content));
    claims.push(...this.extractTypeReferences(content));
    claims.push(...this.extractApiEndpoints(content));
    claims.push(...this.extractEnvVariables(content));
    claims.push(...this.extractFileReferences(content));
    claims.push(...this.extractPackageDependencies(content));

    return claims;
  }

  /**
   * Extract with full statistics
   */
  async extractWithStats(content: string): Promise<ExtractionResult> {
    const claims = await this.extract(content);
    
    const byType: Record<ClaimType, number> = {
      import: 0,
      function_call: 0,
      type_reference: 0,
      api_endpoint: 0,
      env_variable: 0,
      file_reference: 0,
      package_dependency: 0,
    };

    let totalConfidence = 0;
    for (const claim of claims) {
      byType[claim.type]++;
      totalConfidence += claim.confidence;
    }

    return {
      claims,
      unverifiable: [],
      statistics: {
        totalClaims: claims.length,
        byType,
        avgConfidence: claims.length > 0 ? totalConfidence / claims.length : 0,
      },
    };
  }

  private extractImports(content: string): Claim[] {
    const claims: Claim[] = [];
    const importRegex = /import\s+(?:{[^}]+}|\*\s+as\s+\w+|\w+)\s+from\s+['"]([^'"]+)['"]/g;
    
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      claims.push(this.createClaim('import', match[1], match.index, content));
    }

    return claims;
  }

  private extractFunctionCalls(content: string): Claim[] {
    const claims: Claim[] = [];
    // TODO: Implement function call extraction using AST
    return claims;
  }

  private extractTypeReferences(content: string): Claim[] {
    const claims: Claim[] = [];
    const typeRegex = /:\s*(\w+)(?:<[^>]+>)?/g;
    
    let match;
    while ((match = typeRegex.exec(content)) !== null) {
      const typeName = match[1];
      if (!this.isBuiltinType(typeName)) {
        claims.push(this.createClaim('type_reference', typeName, match.index, content));
      }
    }

    return claims;
  }

  private extractApiEndpoints(content: string): Claim[] {
    const claims: Claim[] = [];
    const endpointRegex = /['"`](\/api\/[^'"`]+)['"`]/g;
    
    let match;
    while ((match = endpointRegex.exec(content)) !== null) {
      claims.push(this.createClaim('api_endpoint', match[1], match.index, content));
    }

    return claims;
  }

  private extractEnvVariables(content: string): Claim[] {
    const claims: Claim[] = [];
    const envRegex = /process\.env\.(\w+)|import\.meta\.env\.(\w+)/g;
    
    let match;
    while ((match = envRegex.exec(content)) !== null) {
      const varName = match[1] || match[2];
      claims.push(this.createClaim('env_variable', varName, match.index, content));
    }

    return claims;
  }

  private extractFileReferences(content: string): Claim[] {
    const claims: Claim[] = [];
    const fileRegex = /['"`](\.\.?\/[^'"`]+\.[a-z]+)['"`]/gi;
    
    let match;
    while ((match = fileRegex.exec(content)) !== null) {
      claims.push(this.createClaim('file_reference', match[1], match.index, content));
    }

    return claims;
  }

  private extractPackageDependencies(content: string): Claim[] {
    const claims: Claim[] = [];
    const importRegex = /from\s+['"]([^./][^'"]+)['"]/g;
    
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      claims.push(this.createClaim('package_dependency', match[1], match.index, content));
    }

    return claims;
  }

  private createClaim(type: ClaimType, value: string, index: number, content: string): Claim {
    const lines = content.slice(0, index).split('\n');
    const line = lines.length;
    const column = (lines[lines.length - 1]?.length ?? 0) + 1;
    const filePath = 'unknown';  // Will be set by caller if available

    return {
      id: generateFindingId(`claim-${type}`, filePath, line, column, value),
      type,
      value,
      location: { line, column, length: value.length },
      confidence: 0.8,
      context: content.slice(Math.max(0, index - 50), index + value.length + 50),
    };
  }

  private isBuiltinType(type: string): boolean {
    const builtins = [
      'string', 'number', 'boolean', 'void', 'null', 'undefined',
      'any', 'unknown', 'never', 'object', 'Array', 'Promise',
      'Record', 'Partial', 'Required', 'Pick', 'Omit',
    ];
    return builtins.includes(type);
  }
}
