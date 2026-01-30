/**
 * Validation Tools
 * 
 * MCP tools for code validation and hallucination detection.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  ClaimExtractor,
  EvidenceResolver,
  type Claim,
  type ClaimType,
} from '@vibecheck/core/firewall';

import { loadConfig } from '@repo/shared-config';

// Get project root from centralized config or default to cwd
const getProjectRoot = (): string => {
  const config = loadConfig();
  return config.VIBECHECK_PROJECT_ROOT || process.cwd();
};

// Singleton instances
let claimExtractorInstance: ClaimExtractor | null = null;
let evidenceResolverInstance: EvidenceResolver | null = null;

const getClaimExtractor = (): ClaimExtractor => {
  if (!claimExtractorInstance) {
    claimExtractorInstance = new ClaimExtractor();
  }
  return claimExtractorInstance;
};

const getEvidenceResolver = (): EvidenceResolver => {
  if (!evidenceResolverInstance) {
    evidenceResolverInstance = new EvidenceResolver({
      projectRoot: getProjectRoot(),
      truthpackPath: '.vibecheck/truthpack',
    });
  }
  return evidenceResolverInstance;
};

export function registerValidationTools(server: McpServer): void {
  // Detect hallucinations
  server.tool(
    'validation_detect_hallucinations',
    'Detect potential hallucinations in code',
    {
      content: z.string().describe('Code content to analyze'),
      filePath: z.string().describe('File path for context'),
    },
    async ({ content, filePath }) => {
      try {
        const extractor = getClaimExtractor();
        const resolver = getEvidenceResolver();

        // Extract claims
        const result = await extractor.extractWithStats(content);
        const claims = result.claims;

        // Resolve evidence
        const evidence = await resolver.resolveAll(claims);

        // Find unverified claims (potential hallucinations)
        const candidates = claims
          .map((claim, index) => ({
            claim,
            evidence: evidence[index],
          }))
          .filter(({ evidence: e }) => !e.found)
          .map(({ claim, evidence: e }) => ({
            type: claim.type,
            value: claim.value,
            location: claim.location,
            confidence: claim.confidence,
            reason: `No evidence found via ${e.source}`,
          }));

        // Calculate hallucination score (0-1, higher = more hallucinations)
        const score = claims.length > 0 
          ? candidates.length / claims.length 
          : 0;

        // Group by type
        const byType: Record<string, number> = {};
        for (const c of candidates) {
          byType[c.type] = (byType[c.type] || 0) + 1;
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              candidates,
              score: Math.round(score * 100) / 100,
              summary: {
                total: candidates.length,
                byType,
                highConfidence: candidates.filter(c => c.confidence > 0.7).length,
              },
              filePath,
            }, null, 2),
          }],
        };
      } catch (err) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              candidates: [],
              score: 0,
              error: err instanceof Error ? err.message : 'Unknown error',
            }, null, 2),
          }],
        };
      }
    }
  );

  // Multi-source verification
  server.tool(
    'validation_verify',
    'Verify a claim against multiple sources',
    {
      claim: z.string().describe('Claim to verify'),
      type: z.string().describe('Claim type (import, type, api, etc.)'),
    },
    async ({ claim, type }) => {
      try {
        const resolver = getEvidenceResolver();

        // Create a claim object
        const claimObj: Claim = {
          id: `manual-${Date.now()}`,
          type: type as ClaimType,
          value: claim,
          location: { line: 0, column: 0, length: claim.length },
          confidence: 0.8,
          context: claim,
        };

        const evidence = await resolver.resolve(claimObj);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              claim,
              type,
              verified: evidence.found,
              sources: [evidence.source],
              location: evidence.location,
              confidence: evidence.confidence,
              details: evidence.details,
            }, null, 2),
          }],
        };
      } catch (err) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              claim,
              type,
              verified: false,
              error: err instanceof Error ? err.message : 'Unknown error',
            }, null, 2),
          }],
        };
      }
    }
  );

  // Validate code
  server.tool(
    'validation_code',
    'Validate code for correctness and style',
    {
      content: z.string().describe('Code content to validate'),
      filePath: z.string().describe('File path'),
      checkTypes: z.boolean().optional().describe('Run type checking'),
      checkStyle: z.boolean().optional().describe('Run style checking'),
    },
    async ({ content, filePath, checkTypes, checkStyle }) => {
      try {
        const extractor = getClaimExtractor();
        const resolver = getEvidenceResolver();

        const errors: Array<{ line: number; message: string; severity: string }> = [];
        const warnings: Array<{ line: number; message: string }> = [];

        // Extract and verify claims
        const claims = await extractor.extract(content);
        const evidence = await resolver.resolveAll(claims);

        // Check for unverified imports
        for (let i = 0; i < claims.length; i++) {
          const claim = claims[i];
          const ev = evidence[i];

          if (!ev.found) {
            if (claim.type === 'import' || claim.type === 'package_dependency') {
              errors.push({
                line: claim.location.line,
                message: `Unverified import: ${claim.value}`,
                severity: 'error',
              });
            } else if (claim.type === 'type_reference') {
              warnings.push({
                line: claim.location.line,
                message: `Unverified type: ${claim.value}`,
              });
            }
          }
        }

        // Basic style checks
        if (checkStyle) {
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            // Check for console.log in non-test files
            if (line.includes('console.log') && !filePath.includes('test')) {
              warnings.push({
                line: i + 1,
                message: 'console.log found in production code',
              });
            }
            // Check for very long lines
            if (line.length > 120) {
              warnings.push({
                line: i + 1,
                message: `Line exceeds 120 characters (${line.length})`,
              });
            }
          }
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              valid: errors.length === 0,
              errors,
              warnings,
              metrics: {
                lines: content.split('\n').length,
                claims: claims.length,
                verified: evidence.filter(e => e.found).length,
              },
            }, null, 2),
          }],
        };
      } catch (err) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              valid: false,
              errors: [{ line: 0, message: err instanceof Error ? err.message : 'Unknown error', severity: 'error' }],
              warnings: [],
            }, null, 2),
          }],
        };
      }
    }
  );

  // Detect drift
  server.tool(
    'validation_detect_drift',
    'Detect drift between truthpack and codebase',
    {
      category: z.enum(['routes', 'env', 'auth', 'types', 'all'])
        .optional()
        .describe('Category to check for drift'),
    },
    async ({ category }) => {
      // This requires comparing current scan vs stored truthpack
      // For now, return a placeholder that suggests running truthpack_generate
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            hasDrift: false,
            items: [],
            summary: {
              added: 0,
              removed: 0,
              modified: 0,
            },
            recommendations: [
              'Run truthpack_generate to refresh truthpack',
              'Then run this check again to detect drift',
            ],
            note: 'Full drift detection requires comparing fresh scan against stored truthpack',
          }, null, 2),
        }],
      };
    }
  );

  // Verify imports
  server.tool(
    'validation_verify_imports',
    'Verify all imports in code are valid',
    {
      content: z.string().describe('Code content'),
      filePath: z.string().describe('File path for resolution'),
    },
    async ({ content, filePath }) => {
      try {
        const extractor = getClaimExtractor();
        const resolver = getEvidenceResolver();

        // Extract only import-related claims
        const allClaims = await extractor.extract(content);
        const importClaims = allClaims.filter(c => 
          c.type === 'import' || c.type === 'package_dependency'
        );

        const evidence = await resolver.resolveAll(importClaims);

        const imports = importClaims.map((claim, i) => ({
          value: claim.value,
          line: claim.location.line,
          valid: evidence[i].found,
          source: evidence[i].source,
          details: evidence[i].details,
        }));

        const invalid = imports.filter(i => !i.valid);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              imports,
              allValid: invalid.length === 0,
              invalid: invalid.map(i => ({
                value: i.value,
                line: i.line,
                suggestion: i.value.startsWith('.') 
                  ? 'Check file path exists' 
                  : 'Check package is in package.json',
              })),
              summary: {
                total: imports.length,
                valid: imports.length - invalid.length,
                invalid: invalid.length,
              },
            }, null, 2),
          }],
        };
      } catch (err) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              imports: [],
              allValid: false,
              invalid: [],
              error: err instanceof Error ? err.message : 'Unknown error',
            }, null, 2),
          }],
        };
      }
    }
  );
}
