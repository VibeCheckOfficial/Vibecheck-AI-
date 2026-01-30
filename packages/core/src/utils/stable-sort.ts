/**
 * Stable Sorting Utilities
 * 
 * Provides deterministic sorting for findings and other scan results.
 * Ensures consistent output order across runs.
 * 
 * @module stable-sort
 * @example
 * ```typescript
 * const sorted = sortFindings(findings);
 * const sortedBySeverity = sortFindingsBySeverity(findingsWithSeverity);
 * ```
 */

/**
 * Base interface for findings that can be sorted.
 * Supports both `filePath` and `file` properties for flexibility.
 */
export interface SortableFinding {
  /** Full path to the file (preferred) */
  filePath?: string;
  /** Alternative file property (for compatibility) */
  file?: string;
  /** Line number of the finding (1-indexed) */
  line: number;
  /** Column number of the finding (1-indexed, optional) */
  column?: number;
  /** ID of the rule that triggered this finding */
  ruleId: string;
  /** Allow additional properties */
  [key: string]: unknown;
}

/**
 * Finding with severity for priority sorting.
 */
export interface SortableFindingWithSeverity extends SortableFinding {
  /** Severity level: 'error', 'warning', or 'info' */
  severity: string;
}

/** Severity ordering for consistent sorting */
const SEVERITY_ORDER: Readonly<Record<string, number>> = Object.freeze({
  error: 0,
  warning: 1,
  info: 2,
});

/** Default severity order for unknown severities */
const DEFAULT_SEVERITY_ORDER = 99;

/**
 * Sort findings by stable criteria for deterministic output.
 * 
 * Sorting order:
 * 1. File path (alphabetical, case-sensitive)
 * 2. Line number (ascending)
 * 3. Column number (ascending, defaults to 1)
 * 4. Rule ID (alphabetical, case-sensitive)
 * 
 * @typeParam T - Type extending SortableFinding
 * @param findings - Array of findings to sort
 * @returns A new sorted array (does not mutate input)
 * @throws {TypeError} If findings is not an array
 * 
 * @example
 * ```typescript
 * const findings = [
 *   { filePath: 'src/b.ts', line: 10, ruleId: 'no-any' },
 *   { filePath: 'src/a.ts', line: 5, ruleId: 'no-console' },
 * ];
 * const sorted = sortFindings(findings);
 * // Result: sorted by filePath first, then line, then ruleId
 * ```
 * 
 * @remarks
 * This function is pure - it does not mutate the input array.
 * The same input always produces the same output order.
 * 
 * @see sortFindingsBySeverity for severity-first sorting
 */
export function sortFindings<T extends SortableFinding>(findings: T[]): T[] {
  // Input validation
  if (!Array.isArray(findings)) {
    throw new TypeError('findings must be an array');
  }

  // Return empty array for empty input (no work needed)
  if (findings.length === 0) {
    return [];
  }

  return [...findings].sort((a, b) => {
    // 1. File path (alphabetical) - handle both filePath and file
    const pathA = a.filePath ?? a.file ?? '';
    const pathB = b.filePath ?? b.file ?? '';
    const pathCompare = pathA.localeCompare(pathB);
    if (pathCompare !== 0) {
      return pathCompare;
    }
    
    // 2. Line number (ascending)
    if (a.line !== b.line) {
      return a.line - b.line;
    }
    
    // 3. Column number (ascending) - handle optional column
    const colA = a.column ?? 1;
    const colB = b.column ?? 1;
    if (colA !== colB) {
      return colA - colB;
    }
    
    // 4. Rule ID (alphabetical)
    return a.ruleId.localeCompare(b.ruleId);
  });
}

/**
 * Sort findings by severity first, then by stable criteria.
 * 
 * Sorting order:
 * 1. Severity (error > warning > info > unknown)
 * 2. File path (alphabetical)
 * 3. Line number (ascending)
 * 4. Column number (ascending)
 * 5. Rule ID (alphabetical)
 * 
 * @typeParam T - Type extending SortableFinding with severity
 * @param findings - Array of findings with severity to sort
 * @returns A new sorted array (does not mutate input)
 * @throws {TypeError} If findings is not an array
 * 
 * @example
 * ```typescript
 * const findings = [
 *   { filePath: 'src/a.ts', line: 1, ruleId: 'r1', severity: 'warning' },
 *   { filePath: 'src/a.ts', line: 2, ruleId: 'r2', severity: 'error' },
 * ];
 * const sorted = sortFindingsBySeverity(findings);
 * // Result: error first, then warning
 * ```
 * 
 * @remarks
 * Unknown severities are sorted last (order 99).
 * This function is pure - it does not mutate the input array.
 * 
 * @see sortFindings for location-first sorting
 */
export function sortFindingsBySeverity<T extends SortableFindingWithSeverity>(
  findings: T[]
): T[] {
  // Input validation
  if (!Array.isArray(findings)) {
    throw new TypeError('findings must be an array');
  }

  // Return empty array for empty input
  if (findings.length === 0) {
    return [];
  }

  return [...findings].sort((a, b) => {
    // First by severity
    const severityA = SEVERITY_ORDER[a.severity] ?? DEFAULT_SEVERITY_ORDER;
    const severityB = SEVERITY_ORDER[b.severity] ?? DEFAULT_SEVERITY_ORDER;
    if (severityA !== severityB) {
      return severityA - severityB;
    }
    
    // Then by file path
    const pathA = a.filePath ?? a.file ?? '';
    const pathB = b.filePath ?? b.file ?? '';
    const pathCompare = pathA.localeCompare(pathB);
    if (pathCompare !== 0) {
      return pathCompare;
    }

    // Then by line
    if (a.line !== b.line) {
      return a.line - b.line;
    }

    // Then by column
    const colA = a.column ?? 1;
    const colB = b.column ?? 1;
    if (colA !== colB) {
      return colA - colB;
    }

    // Finally by ruleId
    return a.ruleId.localeCompare(b.ruleId);
  });
}
