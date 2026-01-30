/**
 * Contextual Risk Adjustment
 * 
 * Adjusts secret severity based on file path and code context.
 * Production files get elevated severity, test files get reduced severity.
 */

import type { 
  SecretSeverity, 
  FileContext, 
  ContextualRiskAdjustment 
} from './types.js';

// ============================================================================
// File Context Detection
// ============================================================================

/**
 * Patterns for identifying example/template files
 */
const EXAMPLE_PATTERNS = [
  /\.example$/i,
  /\.template$/i,
  /\.sample$/i,
  /\.demo$/i,
  /\/examples?\//i,
  /\/templates?\//i,
  /\/demo\//i,
  /\/fixtures?\//i,
  /\.env\.example$/i,
  /\.env\.template$/i,
  /\.env\.sample$/i,
  /\.env\.local\.example$/i,
];

/**
 * Patterns for identifying test files
 */
const TEST_PATTERNS = [
  /\.test\.[jt]sx?$/i,
  /\.spec\.[jt]sx?$/i,
  /\/__tests__\//i,
  /\/__mocks__\//i,
  /\/test\//i,
  /\/tests\//i,
  /\.stories\.[jt]sx?$/i,
  /\.story\.[jt]sx?$/i,
  /cypress\//i,
  /e2e\//i,
  /playwright\//i,
];

/**
 * Patterns for identifying production context files
 */
const PRODUCTION_PATTERNS = [
  /\.env$/,
  /\.env\.production$/i,
  /\.env\.prod$/i,
  /\/config\/production\./i,
  /\/config\/prod\./i,
  /\/src\/config\//i,
  /\/lib\/config\//i,
  /\/app\/config\//i,
  /\/server\//i,
  /\/api\//i,
  /\.production\.[jt]sx?$/i,
];

/**
 * Patterns for identifying documentation files
 */
const DOCUMENTATION_PATTERNS = [
  /\.md$/i,
  /\.mdx$/i,
  /\.rst$/i,
  /\.adoc$/i,
  /\.txt$/i,
  /\/docs?\//i,
  /README/i,
  /CHANGELOG/i,
  /CONTRIBUTING/i,
];

/**
 * Patterns for identifying configuration files
 */
const CONFIG_PATTERNS = [
  /\.config\.[jt]sx?$/i,
  /\.rc$/i,
  /\.json$/i,
  /\.yaml$/i,
  /\.yml$/i,
  /\.toml$/i,
  /\/config\//i,
  /\.eslintrc/i,
  /\.prettierrc/i,
  /tsconfig/i,
];

/**
 * Determine the context of a file based on its path
 * 
 * @param filePath - The file path to analyze
 * @returns The determined file context
 */
export function getFileContext(filePath: string): FileContext {
  const normalizedPath = filePath.replace(/\\/g, '/');
  
  // Check patterns in order of specificity
  if (EXAMPLE_PATTERNS.some(p => p.test(normalizedPath))) {
    return 'example';
  }
  
  if (TEST_PATTERNS.some(p => p.test(normalizedPath))) {
    return 'test';
  }
  
  if (DOCUMENTATION_PATTERNS.some(p => p.test(normalizedPath))) {
    return 'documentation';
  }
  
  if (CONFIG_PATTERNS.some(p => p.test(normalizedPath))) {
    return 'configuration';
  }
  
  if (PRODUCTION_PATTERNS.some(p => p.test(normalizedPath))) {
    return 'production';
  }
  
  // Check for development-specific paths
  if (/\/dev\//i.test(normalizedPath) || /\.dev\./i.test(normalizedPath)) {
    return 'development';
  }
  
  return 'unknown';
}

/**
 * Check if a file is in a test context
 * 
 * @param filePath - The file path to check
 * @returns true if the file is a test file
 */
export function isTestFile(filePath: string): boolean {
  const context = getFileContext(filePath);
  return context === 'test' || context === 'example';
}

/**
 * Check if a file is in a production context
 * 
 * @param filePath - The file path to check
 * @returns true if the file is a production file
 */
export function isProductionFile(filePath: string): boolean {
  return getFileContext(filePath) === 'production';
}

// ============================================================================
// Risk Adjustment
// ============================================================================

/**
 * Adjust severity based on file context and entropy
 * 
 * @param severity - Original severity
 * @param filePath - File path for context
 * @param entropy - Calculated entropy of the secret
 * @returns Adjustment result with new severity and reason
 */
export function adjustRiskByContext(
  severity: SecretSeverity,
  filePath: string,
  entropy: number
): ContextualRiskAdjustment {
  const context = getFileContext(filePath);
  
  // Example/template files: downgrade unless very high entropy
  if (context === 'example') {
    if (entropy >= 5.0) {
      // Very high entropy even in example file - might be real
      return {
        originalSeverity: severity,
        adjustedSeverity: severity,
        context,
        reason: 'High entropy secret in example file - verify manually',
      };
    }
    
    const downgraded = downgradeSeverity(severity);
    return {
      originalSeverity: severity,
      adjustedSeverity: downgraded,
      context,
      reason: 'Downgraded: found in example/template file',
    };
  }
  
  // Test files: downgrade severity
  if (context === 'test') {
    if (entropy >= 5.0) {
      return {
        originalSeverity: severity,
        adjustedSeverity: severity,
        context,
        reason: 'High entropy secret in test file - verify manually',
      };
    }
    
    const downgraded = downgradeSeverity(severity);
    return {
      originalSeverity: severity,
      adjustedSeverity: downgraded,
      context,
      reason: 'Downgraded: found in test file',
    };
  }
  
  // Documentation: downgrade significantly
  if (context === 'documentation') {
    const downgraded = downgradeSeverity(downgradeSeverity(severity));
    return {
      originalSeverity: severity,
      adjustedSeverity: downgraded,
      context,
      reason: 'Downgraded: found in documentation file',
    };
  }
  
  // Production context: potentially upgrade if high entropy
  if (context === 'production') {
    if (entropy >= 4.5 && severity === 'medium') {
      return {
        originalSeverity: severity,
        adjustedSeverity: 'high',
        context,
        reason: 'Upgraded: high entropy secret in production file',
      };
    }
    
    return {
      originalSeverity: severity,
      adjustedSeverity: severity,
      context,
      reason: 'Production file - no adjustment',
    };
  }
  
  // No adjustment for other contexts
  return {
    originalSeverity: severity,
    adjustedSeverity: severity,
    context,
    reason: 'No context-based adjustment',
  };
}

/**
 * Downgrade severity by one level
 */
function downgradeSeverity(severity: SecretSeverity): SecretSeverity {
  switch (severity) {
    case 'critical': return 'high';
    case 'high': return 'medium';
    case 'medium': return 'low';
    case 'low': return 'low';
  }
}

// ============================================================================
// Line Context Analysis
// ============================================================================

/**
 * Patterns that indicate the line is safe (env var reference, type definition, etc.)
 */
const SAFE_LINE_PATTERNS = [
  // Environment variable references
  /process\.env\.\w+/,
  /import\.meta\.env\.\w+/,
  /\$\{\s*\w+\s*\}/,
  /os\.environ/,
  /getenv\s*\(/,
  
  // Type definitions
  /:\s*string\s*[;,)]/,
  /type\s+\w+\s*=/,
  /interface\s+\w+/,
  /<string>/,
  
  // Import/require statements
  /^import\s+/,
  /require\s*\(/,
  
  // Comments with example indicators
  /\/\/.*example/i,
  /\/\/.*sample/i,
  /\/\/.*demo/i,
  /@example/i,
  /@param/i,
];

/**
 * Check if a line context indicates a false positive
 * 
 * @param line - The line content
 * @returns true if the line is likely a false positive
 */
export function isSafeLineContext(line: string): boolean {
  return SAFE_LINE_PATTERNS.some(p => p.test(line));
}

/**
 * Get a description of the file context
 * 
 * @param context - The file context
 * @returns Human-readable description
 */
export function getContextDescription(context: FileContext): string {
  switch (context) {
    case 'production': return 'Production code';
    case 'development': return 'Development code';
    case 'test': return 'Test file';
    case 'example': return 'Example/template file';
    case 'documentation': return 'Documentation';
    case 'configuration': return 'Configuration file';
    case 'unknown': return 'Unknown context';
  }
}
