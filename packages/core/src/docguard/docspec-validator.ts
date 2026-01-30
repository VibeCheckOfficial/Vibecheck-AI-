/**
 * DocSpec Validator
 * 
 * Enforces documentation quality rules to prevent "slop docs":
 * - Must have purpose statement
 * - Must have reality anchors (file paths, commands, examples)
 * - Must have concrete examples
 * - Must define scope
 * - No fluff (overly verbose, generic content)
 */

import type {
  DocSpecResult,
  DocSpecViolation,
  DocSpecRule,
  DocAnchor,
  DocGuardConfig,
} from './types.js';
import { extractAnchors } from './anchor-extractor.js';

// ============================================================================
// Fluff Detection
// ============================================================================

/**
 * Generic template phrases that indicate AI slop
 */
const GENERIC_PHRASES = [
  'in this guide we will explore',
  'in this document we will',
  'this guide provides an overview',
  'this document describes',
  'the following sections will cover',
  'let\'s dive into',
  'let\'s take a look at',
  'as you can see',
  'it is important to note',
  'it should be noted that',
  'please note that',
  'in order to',
  'for the purpose of',
  'in conclusion',
  'to summarize',
  'in summary',
  'as mentioned above',
  'as discussed earlier',
  'moving forward',
  'going forward',
  'at the end of the day',
  'best practices suggest',
  'industry standard',
  'state of the art',
  'cutting edge',
  'next generation',
  'world class',
  'enterprise grade',
  'highly scalable',
  'robust and reliable',
  'seamlessly integrates',
  'leverages the power of',
  'utilizes advanced',
];

/**
 * Fluff words that add no value
 */
const FLUFF_WORDS = [
  'very', 'really', 'actually', 'basically', 'essentially',
  'literally', 'simply', 'just', 'quite', 'rather',
  'somewhat', 'fairly', 'extremely', 'incredibly', 'absolutely',
  'definitely', 'certainly', 'obviously', 'clearly', 'naturally',
  'importantly', 'significantly', 'tremendously', 'fundamentally',
  'comprehensive', 'robust', 'seamless', 'cutting-edge', 'state-of-the-art',
  'innovative', 'revolutionary', 'groundbreaking', 'game-changing',
  'powerful', 'elegant', 'beautiful', 'amazing', 'awesome',
];

/**
 * Calculate fluff ratio (fluff words / total words)
 */
function calculateFluffRatio(content: string): number {
  const words = content.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  if (words.length === 0) return 0;

  let fluffCount = 0;
  for (const word of words) {
    if (FLUFF_WORDS.includes(word)) {
      fluffCount++;
    }
  }

  return fluffCount / words.length;
}

/**
 * Count generic template phrases
 */
function countGenericPhrases(content: string): number {
  const lowerContent = content.toLowerCase();
  let count = 0;

  for (const phrase of GENERIC_PHRASES) {
    if (lowerContent.includes(phrase)) {
      count++;
    }
  }

  return count;
}

// ============================================================================
// Content Extraction
// ============================================================================

/**
 * Extract the purpose statement (first paragraph after first heading)
 */
function extractPurpose(content: string): string | null {
  const lines = content.split('\n');
  let foundHeading = false;
  const purposeLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith('#')) {
      if (foundHeading && purposeLines.length > 0) break; // Stop at next heading
      foundHeading = true;
      continue;
    }
    
    if (foundHeading) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('```')) {
        purposeLines.push(trimmed);
      }
      if (purposeLines.length > 0 && !trimmed) {
        break; // End of first paragraph
      }
    }
  }

  const purpose = purposeLines.join(' ').trim();
  return purpose.length > 0 ? purpose : null;
}

/**
 * Check if doc has a scope section
 */
function hasScope(content: string): boolean {
  const scopePatterns = [
    /^#+\s*(?:scope|coverage|what this (?:doc|guide) covers)/im,
    /^#+\s*(?:out of scope|not covered|limitations)/im,
    /\*\*(?:scope|covers|does not cover)\*\*/i,
    /^-\s*(?:covers|does not cover|scope):/im,
  ];

  return scopePatterns.some(pattern => pattern.test(content));
}

/**
 * Count code examples in the doc
 */
function countExamples(content: string): number {
  // Count code blocks
  const codeBlocks = (content.match(/```[\s\S]*?```/g) || []).length;
  
  // Count inline code that looks like commands or function calls
  const inlineCommands = (content.match(/`[^`]+\([^)]*\)`/g) || []).length;
  const inlineShell = (content.match(/`(?:npm|yarn|pnpm|npx|git|vibecheck)\s+[^`]+`/g) || []).length;

  return codeBlocks + Math.floor((inlineCommands + inlineShell) / 3);
}

/**
 * Check if doc references any entities (files, functions, etc.)
 */
function hasEntityReferences(content: string): boolean {
  // Check for backtick references
  const backtickRefs = content.match(/`[^`]+`/g) || [];
  
  // Filter for likely entity references
  const entityRefs = backtickRefs.filter(ref => {
    const inner = ref.slice(1, -1);
    // Looks like a path
    if (inner.includes('/') || inner.includes('.')) return true;
    // Looks like a function
    if (inner.includes('(')) return true;
    // Looks like a variable/class (PascalCase or camelCase)
    if (/^[A-Z][a-zA-Z]+$/.test(inner) || /^[a-z][a-zA-Z]+$/.test(inner)) return true;
    return false;
  });

  return entityRefs.length > 0;
}

// ============================================================================
// DocSpec Validator
// ============================================================================

export interface DocSpecValidatorOptions {
  config: DocGuardConfig;
}

export class DocSpecValidator {
  private config: DocGuardConfig;

  constructor(options: DocSpecValidatorOptions) {
    this.config = options.config;
  }

  /**
   * Validate document content against DocSpec rules
   */
  validate(content: string, changedFiles?: string[]): DocSpecResult {
    const violations: DocSpecViolation[] = [];
    const anchors = extractAnchors(content);
    
    // Calculate metrics
    const wordCount = content.split(/\s+/).filter(w => w.length > 0).length;
    const anchorCount = anchors.length;
    const exampleCount = countExamples(content);
    const fluffRatio = calculateFluffRatio(content);
    const genericPhraseCount = countGenericPhrases(content);

    // Rule: has-purpose
    const purpose = extractPurpose(content);
    if (!purpose) {
      violations.push({
        rule: 'has-purpose',
        message: 'Document must have a clear purpose statement after the title',
        severity: 'error',
        suggestion: 'Add 1-2 sentences explaining why this document exists',
      });
    } else if (purpose.length > 300) {
      violations.push({
        rule: 'has-purpose',
        message: 'Purpose statement is too long (max 300 chars)',
        severity: 'warning',
        suggestion: 'Keep the purpose statement concise - save details for later sections',
      });
    }

    // Rule: has-anchors (minimum reality anchors)
    if (anchorCount < this.config.minAnchors) {
      violations.push({
        rule: 'has-anchors',
        message: `Document has ${anchorCount} anchors, minimum required: ${this.config.minAnchors}`,
        severity: 'error',
        suggestion: 'Add file paths, commands, API endpoints, or config references',
      });
    }

    // Rule: min-anchors - check for specific anchor types
    const anchorTypes = new Set(anchors.map(a => a.type));
    if (anchorCount > 0 && anchorTypes.size === 1 && wordCount > 200) {
      violations.push({
        rule: 'min-anchors',
        message: 'Document only has one type of anchor - add variety',
        severity: 'warning',
        suggestion: 'Include different anchor types: file paths, commands, API endpoints',
      });
    }

    // Rule: has-example
    if (exampleCount === 0 && wordCount > 100) {
      violations.push({
        rule: 'has-example',
        message: 'Document has no code examples',
        severity: 'error',
        suggestion: 'Add at least one runnable code snippet or command example',
      });
    }

    // Rule: has-scope
    if (wordCount > 500 && !hasScope(content)) {
      violations.push({
        rule: 'has-scope',
        message: 'Long document missing scope definition',
        severity: 'warning',
        suggestion: 'Add a "Scope" or "What This Covers" section',
      });
    }

    // Rule: no-fluff
    if (fluffRatio > this.config.maxFluffRatio) {
      violations.push({
        rule: 'no-fluff',
        message: `Fluff ratio ${(fluffRatio * 100).toFixed(1)}% exceeds maximum ${(this.config.maxFluffRatio * 100).toFixed(1)}%`,
        severity: 'warning',
        suggestion: 'Remove filler words like "very", "really", "basically"',
      });
    }

    // Rule: no-generic-phrases
    if (genericPhraseCount > 2) {
      violations.push({
        rule: 'no-generic-phrases',
        message: `Found ${genericPhraseCount} generic template phrases`,
        severity: 'warning',
        suggestion: 'Replace generic phrases with specific, concrete statements',
      });
    }

    // Rule: no-orphan-doc (if git context available)
    if (changedFiles && changedFiles.length > 0) {
      const hasRelevantAnchor = anchors.some(anchor => 
        changedFiles.some(file => 
          file.includes(anchor.value) || anchor.value.includes(file.split('/').pop()!)
        )
      );

      if (!hasRelevantAnchor && !hasEntityReferences(content)) {
        violations.push({
          rule: 'no-orphan-doc',
          message: 'New doc does not reference any changed files',
          severity: 'error',
          suggestion: 'Docs should reference the code they document - add relevant file paths',
        });
      }
    }

    // Determine overall validity
    const hasErrors = violations.some(v => v.severity === 'error');
    const valid = this.config.strictMode 
      ? violations.length === 0 
      : !hasErrors;

    return {
      valid,
      violations,
      anchors,
      metrics: {
        wordCount,
        anchorCount,
        exampleCount,
        fluffRatio,
        genericPhraseCount,
      },
    };
  }

  /**
   * Quick check for obvious slop
   */
  quickSlopCheck(content: string): { isSlop: boolean; reasons: string[] } {
    const reasons: string[] = [];

    const fluffRatio = calculateFluffRatio(content);
    const genericPhraseCount = countGenericPhrases(content);
    const anchorCount = extractAnchors(content).length;
    const wordCount = content.split(/\s+/).length;

    // High fluff ratio
    if (fluffRatio > 0.15) {
      reasons.push(`High fluff ratio: ${(fluffRatio * 100).toFixed(1)}%`);
    }

    // Too many generic phrases
    if (genericPhraseCount > 3) {
      reasons.push(`${genericPhraseCount} generic template phrases detected`);
    }

    // Long doc with no anchors
    if (wordCount > 200 && anchorCount === 0) {
      reasons.push('No file paths, commands, or API references found');
    }

    // Suspiciously short
    if (wordCount < 50 && anchorCount === 0) {
      reasons.push('Document too short with no concrete references');
    }

    return {
      isSlop: reasons.length >= 2, // Multiple signals = likely slop
      reasons,
    };
  }

  /**
   * Suggest improvements for a doc
   */
  suggestImprovements(content: string): string[] {
    const suggestions: string[] = [];
    const result = this.validate(content);

    // Group suggestions by priority
    const errorSuggestions = result.violations
      .filter(v => v.severity === 'error' && v.suggestion)
      .map(v => v.suggestion!);

    const warningSuggestions = result.violations
      .filter(v => v.severity === 'warning' && v.suggestion)
      .map(v => v.suggestion!);

    suggestions.push(...errorSuggestions, ...warningSuggestions);

    // Additional suggestions based on metrics
    if (result.metrics.exampleCount === 0) {
      suggestions.push('Add a "Quick Start" or "Example" section with runnable code');
    }

    if (result.metrics.anchorCount < 3) {
      suggestions.push('Reference specific files, functions, or API endpoints');
    }

    return [...new Set(suggestions)]; // Deduplicate
  }
}
