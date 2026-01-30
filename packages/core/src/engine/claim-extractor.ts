/**
 * Claim Extractor
 *
 * Extracts verifiable claims from code and AI prompts/responses.
 * Claims are statements that can be verified against the truthpack
 * and other sources to detect hallucinations.
 */

import { getLogger, type Logger } from '../utils/logger.js';

export interface ExtractedClaim {
  id: string;
  type: ClaimType;
  claim: string;
  context: string;
  confidence: number;
  location?: {
    line: number;
    column: number;
    endLine?: number;
    endColumn?: number;
  };
  metadata?: Record<string, unknown>;
}

export type ClaimType =
  | 'import'
  | 'api_endpoint'
  | 'function_call'
  | 'type_reference'
  | 'env_variable'
  | 'file_reference'
  | 'route'
  | 'database_operation'
  | 'external_service'
  | 'configuration'
  | 'assertion';

export interface ClaimExtractionResult {
  claims: ExtractedClaim[];
  summary: {
    totalClaims: number;
    byType: Record<ClaimType, number>;
    highConfidence: number;
    mediumConfidence: number;
    lowConfidence: number;
  };
  extractionTime: number;
}

// ============================================================================
// Extraction Patterns
// ============================================================================

interface ExtractionPattern {
  type: ClaimType;
  pattern: RegExp;
  extract: (match: RegExpExecArray, content: string) => Partial<ExtractedClaim>;
  confidence: number;
}

const EXTRACTION_PATTERNS: ExtractionPattern[] = [
  // Import claims
  {
    type: 'import',
    pattern: /import\s+(?:{[^}]+}|\*\s+as\s+\w+|\w+)?\s*(?:,\s*{[^}]+})?\s*from\s+['"]([^'"]+)['"]/g,
    extract: (match) => ({
      claim: `Package "${match[1]}" exists and exports the specified members`,
      context: match[0],
      metadata: { packageName: match[1] },
    }),
    confidence: 0.9,
  },

  // Require claims
  {
    type: 'import',
    pattern: /(?:const|let|var)\s+(?:{[^}]+}|\w+)\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    extract: (match) => ({
      claim: `Package "${match[1]}" exists and can be required`,
      context: match[0],
      metadata: { packageName: match[1] },
    }),
    confidence: 0.9,
  },

  // API endpoint claims (fetch)
  {
    type: 'api_endpoint',
    pattern: /fetch\s*\(\s*['"`]([^'"`]+)['"`]/g,
    extract: (match) => ({
      claim: `API endpoint "${match[1]}" exists and is accessible`,
      context: match[0],
      metadata: { url: match[1], method: 'GET' },
    }),
    confidence: 0.85,
  },

  // API endpoint claims (axios)
  {
    type: 'api_endpoint',
    pattern: /axios\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/gi,
    extract: (match) => ({
      claim: `API endpoint "${match[2]}" exists and accepts ${match[1].toUpperCase()} requests`,
      context: match[0],
      metadata: { url: match[2], method: match[1].toUpperCase() },
    }),
    confidence: 0.85,
  },

  // Function/method call claims
  {
    type: 'function_call',
    pattern: /(?:await\s+)?(\w+)\.(\w+)\s*\(/g,
    extract: (match) => ({
      claim: `Object "${match[1]}" has method "${match[2]}"`,
      context: match[0],
      metadata: { object: match[1], method: match[2] },
    }),
    confidence: 0.7,
  },

  // Type reference claims
  {
    type: 'type_reference',
    pattern: /:\s*(\w+)(?:<[^>]+>)?(?:\s*\[\s*\])?(?:\s*\||\s*&|\s*,|\s*\)|\s*=|\s*{|\s*;)/g,
    extract: (match) => ({
      claim: `Type "${match[1]}" is defined`,
      context: match[0],
      metadata: { typeName: match[1] },
    }),
    confidence: 0.75,
  },

  // Environment variable claims
  {
    type: 'env_variable',
    pattern: /process\.env\.([A-Z][A-Z0-9_]*)/g,
    extract: (match) => ({
      claim: `Environment variable "${match[1]}" is defined`,
      context: match[0],
      metadata: { varName: match[1] },
    }),
    confidence: 0.9,
  },

  // File reference claims (relative imports)
  {
    type: 'file_reference',
    pattern: /from\s+['"](\.[^'"]+)['"]/g,
    extract: (match) => ({
      claim: `File "${match[1]}" exists`,
      context: match[0],
      metadata: { filePath: match[1] },
    }),
    confidence: 0.95,
  },

  // Route definition claims (Next.js/Express style)
  {
    type: 'route',
    pattern: /(?:app|router)\.(get|post|put|patch|delete)\s*\(\s*['"]([^'"]+)['"]/gi,
    extract: (match) => ({
      claim: `Route "${match[1].toUpperCase()} ${match[2]}" is defined`,
      context: match[0],
      metadata: { method: match[1].toUpperCase(), path: match[2] },
    }),
    confidence: 0.85,
  },

  // Database operation claims
  {
    type: 'database_operation',
    pattern: /(?:prisma|db|knex|sequelize|mongoose)\.(\w+)\.(\w+)\s*\(/g,
    extract: (match) => ({
      claim: `Database model "${match[1]}" has operation "${match[2]}"`,
      context: match[0],
      metadata: { model: match[1], operation: match[2] },
    }),
    confidence: 0.8,
  },

  // External service claims
  {
    type: 'external_service',
    pattern: /new\s+(Stripe|Twilio|AWS|Firebase|Supabase|Redis|Clerk)\s*\(/gi,
    extract: (match) => ({
      claim: `External service "${match[1]}" is configured and available`,
      context: match[0],
      metadata: { service: match[1] },
    }),
    confidence: 0.7,
  },

  // Configuration claims
  {
    type: 'configuration',
    pattern: /(?:config|settings|options)\.(\w+)(?:\.(\w+))?/g,
    extract: (match) => ({
      claim: `Configuration "${match[1]}${match[2] ? '.' + match[2] : ''}" is defined`,
      context: match[0],
      metadata: { configKey: match[1], subKey: match[2] },
    }),
    confidence: 0.6,
  },
];

// Prompt-specific patterns for extracting claims from AI responses
const PROMPT_PATTERNS: ExtractionPattern[] = [
  // "You can use X" claims
  {
    type: 'assertion',
    pattern: /(?:you can|you should|use the|using the)\s+['"`]?(\w+(?:\.\w+)*)['"`]?\s+(?:package|library|module|method|function)/gi,
    extract: (match) => ({
      claim: `"${match[1]}" is a valid package/method that can be used`,
      context: match[0],
      metadata: { reference: match[1] },
    }),
    confidence: 0.7,
  },

  // "Import from X" suggestions
  {
    type: 'import',
    pattern: /import\s+.*\s+from\s+['"]([^'"]+)['"]/g,
    extract: (match) => ({
      claim: `Package "${match[1]}" exists and can be imported`,
      context: match[0],
      metadata: { packageName: match[1] },
    }),
    confidence: 0.85,
  },

  // API endpoint suggestions
  {
    type: 'api_endpoint',
    pattern: /(?:endpoint|route|api|url)(?:\s+is|\s*:)?\s*['"`]?(\/[^\s'"`]+)['"`]?/gi,
    extract: (match) => ({
      claim: `Endpoint "${match[1]}" exists`,
      context: match[0],
      metadata: { endpoint: match[1] },
    }),
    confidence: 0.6,
  },

  // "This will..." claims
  {
    type: 'assertion',
    pattern: /this\s+(?:will|would|should|can)\s+([^.]+)\./gi,
    extract: (match) => ({
      claim: match[0].trim(),
      context: match[0],
    }),
    confidence: 0.5,
  },
];

// ============================================================================
// Claim Extractor Class
// ============================================================================

export class ClaimExtractor {
  private logger: Logger;
  private customPatterns: ExtractionPattern[] = [];

  constructor() {
    this.logger = getLogger('claim-extractor');
  }

  /**
   * Extract claims from code content
   */
  extractFromCode(content: string, filePath?: string): ClaimExtractionResult {
    const startTime = Date.now();
    const claims: ExtractedClaim[] = [];
    const lines = content.split('\n');

    for (const pattern of [...EXTRACTION_PATTERNS, ...this.customPatterns]) {
      const regex = new RegExp(pattern.pattern.source, pattern.pattern.flags);
      let match;

      while ((match = regex.exec(content)) !== null) {
        const extracted = pattern.extract(match, content);
        const lineNum = this.getLineNumber(content, match.index);
        const column = match.index - content.lastIndexOf('\n', match.index - 1);

        // Skip common built-in types
        if (pattern.type === 'type_reference') {
          const typeName = (extracted.metadata as Record<string, unknown>)?.typeName as string;
          if (this.isBuiltinType(typeName)) continue;
        }

        // Skip if confidence is too low
        if (pattern.confidence < 0.5) continue;

        claims.push({
          id: `claim-${claims.length}-${Date.now()}`,
          type: pattern.type,
          claim: extracted.claim ?? '',
          context: extracted.context ?? match[0],
          confidence: extracted.confidence ?? pattern.confidence,
          location: {
            line: lineNum,
            column,
          },
          metadata: {
            ...extracted.metadata,
            filePath,
          },
        });
      }
    }

    // Deduplicate similar claims
    const uniqueClaims = this.deduplicateClaims(claims);

    return this.buildResult(uniqueClaims, startTime);
  }

  /**
   * Extract claims from AI prompt/response
   */
  extractFromPrompt(content: string): ClaimExtractionResult {
    const startTime = Date.now();
    const claims: ExtractedClaim[] = [];

    // Use both code and prompt patterns
    const allPatterns = [...EXTRACTION_PATTERNS, ...PROMPT_PATTERNS, ...this.customPatterns];

    for (const pattern of allPatterns) {
      const regex = new RegExp(pattern.pattern.source, pattern.pattern.flags);
      let match;

      while ((match = regex.exec(content)) !== null) {
        const extracted = pattern.extract(match, content);

        // Lower confidence for prompt extraction (more uncertain)
        const adjustedConfidence = (extracted.confidence ?? pattern.confidence) * 0.9;

        if (adjustedConfidence < 0.4) continue;

        claims.push({
          id: `prompt-claim-${claims.length}-${Date.now()}`,
          type: pattern.type,
          claim: extracted.claim ?? '',
          context: extracted.context ?? match[0],
          confidence: adjustedConfidence,
          metadata: extracted.metadata,
        });
      }
    }

    // Deduplicate
    const uniqueClaims = this.deduplicateClaims(claims);

    return this.buildResult(uniqueClaims, startTime);
  }

  /**
   * Extract claims from diff/patch content
   */
  extractFromDiff(diffContent: string): ClaimExtractionResult {
    const startTime = Date.now();
    const claims: ExtractedClaim[] = [];

    // Extract only from added lines (lines starting with +)
    const addedLines = diffContent
      .split('\n')
      .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
      .map((line) => line.slice(1))
      .join('\n');

    const codeResult = this.extractFromCode(addedLines);

    // Mark all claims as from diff
    for (const claim of codeResult.claims) {
      claim.metadata = { ...claim.metadata, source: 'diff' };
    }

    return codeResult;
  }

  /**
   * Add custom extraction pattern
   */
  addPattern(pattern: ExtractionPattern): void {
    this.customPatterns.push(pattern);
  }

  /**
   * Get high-confidence claims only
   */
  getHighConfidenceClaims(result: ClaimExtractionResult, threshold = 0.8): ExtractedClaim[] {
    return result.claims.filter((c) => c.confidence >= threshold);
  }

  /**
   * Get claims by type
   */
  getClaimsByType(result: ClaimExtractionResult, type: ClaimType): ExtractedClaim[] {
    return result.claims.filter((c) => c.type === type);
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private getLineNumber(content: string, index: number): number {
    return content.slice(0, index).split('\n').length;
  }

  private isBuiltinType(typeName: string): boolean {
    const builtins = new Set([
      'string', 'number', 'boolean', 'object', 'any', 'unknown', 'never', 'void',
      'null', 'undefined', 'Array', 'Object', 'Function', 'Date', 'Error',
      'Promise', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Symbol', 'BigInt',
      'Record', 'Partial', 'Required', 'Readonly', 'Pick', 'Omit', 'Exclude',
      'Extract', 'NonNullable', 'ReturnType', 'Parameters', 'ConstructorParameters',
      'InstanceType', 'ThisType', 'Awaited',
      'HTMLElement', 'HTMLDivElement', 'Event', 'MouseEvent', 'KeyboardEvent',
      'React', 'ReactNode', 'ReactElement', 'FC', 'Component',
    ]);

    return builtins.has(typeName);
  }

  private deduplicateClaims(claims: ExtractedClaim[]): ExtractedClaim[] {
    const seen = new Map<string, ExtractedClaim>();

    for (const claim of claims) {
      const key = `${claim.type}:${claim.claim}`;

      if (!seen.has(key) || (seen.get(key)!.confidence < claim.confidence)) {
        seen.set(key, claim);
      }
    }

    return Array.from(seen.values());
  }

  private buildResult(claims: ExtractedClaim[], startTime: number): ClaimExtractionResult {
    const byType: Record<ClaimType, number> = {
      import: 0,
      api_endpoint: 0,
      function_call: 0,
      type_reference: 0,
      env_variable: 0,
      file_reference: 0,
      route: 0,
      database_operation: 0,
      external_service: 0,
      configuration: 0,
      assertion: 0,
    };

    let highConfidence = 0;
    let mediumConfidence = 0;
    let lowConfidence = 0;

    for (const claim of claims) {
      byType[claim.type]++;

      if (claim.confidence >= 0.8) highConfidence++;
      else if (claim.confidence >= 0.6) mediumConfidence++;
      else lowConfidence++;
    }

    return {
      claims,
      summary: {
        totalClaims: claims.length,
        byType,
        highConfidence,
        mediumConfidence,
        lowConfidence,
      },
      extractionTime: Date.now() - startTime,
    };
  }
}

// ============================================================================
// Singleton and Helpers
// ============================================================================

let globalExtractor: ClaimExtractor | null = null;

export function getClaimExtractor(): ClaimExtractor {
  if (!globalExtractor) {
    globalExtractor = new ClaimExtractor();
  }
  return globalExtractor;
}

/**
 * Quick helper to extract claims from code
 */
export function extractClaimsFromCode(
  content: string,
  filePath?: string
): ClaimExtractionResult {
  return getClaimExtractor().extractFromCode(content, filePath);
}

/**
 * Quick helper to extract claims from prompt/response
 */
export function extractClaimsFromPrompt(content: string): ClaimExtractionResult {
  return getClaimExtractor().extractFromPrompt(content);
}
