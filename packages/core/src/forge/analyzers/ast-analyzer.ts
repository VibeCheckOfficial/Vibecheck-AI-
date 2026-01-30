/**
 * AST Analyzer - Self-Aware Forge Engine
 *
 * Parses TypeScript/JavaScript files and extracts:
 * - Function signatures and complexity
 * - Import graphs
 * - Component prop types
 * - Hook usage patterns
 * - Error handling patterns
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import type {
  FileASTAnalysis,
  FunctionAnalysis,
  ImportAnalysis,
  ExportAnalysis,
  ComponentPropsAnalysis,
  ErrorPattern,
  ComplexityMetrics,
} from '../types.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const SUPPORTED_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

// Regex patterns for AST-like analysis without full parser
const PATTERNS = {
  // Imports
  import: /import\s+(?:type\s+)?(?:(\{[^}]+\})|(\*\s+as\s+\w+)|(\w+))(?:\s*,\s*(?:(\{[^}]+\})|(\w+)))?\s+from\s+['"]([^'"]+)['"]/g,
  importType: /import\s+type\s+/,

  // Exports
  exportNamed: /export\s+(?:const|let|var|function|class|interface|type|enum)\s+(\w+)/g,
  exportDefault: /export\s+default\s+(?:function\s+)?(\w+)?/g,
  reExport: /export\s+(?:\*|\{[^}]+\})\s+from\s+['"]([^'"]+)['"]/g,

  // Functions
  functionDecl: /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/g,
  arrowFunction: /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*(?::\s*\w+(?:<[^>]+>)?)?\s*=>/g,
  methodDecl: /(?:async\s+)?(\w+)\s*\(([^)]*)\)\s*(?::\s*[^{]+)?\s*\{/g,

  // React components
  componentProps: /interface\s+(\w+Props)\s*(?:extends\s+[^{]+)?\s*\{([^}]+)\}/gs,
  propsType: /type\s+(\w+Props)\s*=\s*\{([^}]+)\}/gs,

  // Hooks
  hookUsage: /use[A-Z]\w+\s*\(/g,
  customHook: /(?:export\s+)?(?:const|function)\s+(use[A-Z]\w+)/g,

  // Error handling
  tryCatch: /try\s*\{/g,
  throwStatement: /throw\s+(?:new\s+)?(\w+)?/g,
  promiseCatch: /\.catch\s*\(/g,
  errorBoundary: /componentDidCatch|ErrorBoundary/g,

  // Complexity indicators
  ifStatement: /\bif\s*\(/g,
  elseIfStatement: /\belse\s+if\s*\(/g,
  switchStatement: /\bswitch\s*\(/g,
  ternary: /\?\s*[^:]+\s*:/g,
  logicalOr: /\|\|/g,
  logicalAnd: /&&/g,
  forLoop: /\bfor\s*\(/g,
  whileLoop: /\bwhile\s*\(/g,
  doWhile: /\bdo\s*\{/g,
};

// ============================================================================
// FILE ANALYSIS
// ============================================================================

/**
 * Analyze a single file
 */
export async function analyzeFile(filePath: string): Promise<FileASTAnalysis | null> {
  if (!SUPPORTED_EXTENSIONS.includes(path.extname(filePath))) {
    return null;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const fileHash = crypto.createHash('md5').update(content).digest('hex').substring(0, 12);

    const functions = extractFunctions(content);
    const imports = extractImports(content);
    const exports = extractExports(content);
    const componentProps = extractComponentProps(content);
    const hooksUsed = extractHooksUsed(content);
    const errorPatterns = extractErrorPatterns(content);
    const complexity = calculateFileComplexity(content, functions);

    return {
      filePath,
      fileHash,
      functions,
      imports,
      exports,
      componentProps,
      hooksUsed,
      errorPatterns,
      complexity,
    };
  } catch {
    return null;
  }
}

/**
 * Analyze multiple files
 */
export async function analyzeFiles(filePaths: string[]): Promise<Map<string, FileASTAnalysis>> {
  const results = new Map<string, FileASTAnalysis>();

  await Promise.all(
    filePaths.map(async (filePath) => {
      const analysis = await analyzeFile(filePath);
      if (analysis) {
        results.set(filePath, analysis);
      }
    })
  );

  return results;
}

// ============================================================================
// EXTRACTION FUNCTIONS
// ============================================================================

/**
 * Extract function declarations
 */
function extractFunctions(content: string): FunctionAnalysis[] {
  const functions: FunctionAnalysis[] = [];
  const lines = content.split('\n');

  // Function declarations
  let match: RegExpExecArray | null;

  // Reset regex state
  PATTERNS.functionDecl.lastIndex = 0;
  while ((match = PATTERNS.functionDecl.exec(content)) !== null) {
    const name = match[1];
    const params = match[2];
    const startLine = getLineNumber(content, match.index);
    const isAsync = content.substring(match.index - 10, match.index).includes('async');
    const isExported = content.substring(match.index - 15, match.index).includes('export');

    const funcBody = extractFunctionBody(content, match.index + match[0].length);
    const lineCount = funcBody.split('\n').length;
    const endLine = startLine + lineCount - 1;

    functions.push({
      name,
      type: 'function',
      isAsync,
      isExported,
      paramCount: countParams(params),
      lineCount,
      cyclomaticComplexity: calculateCyclomaticComplexity(funcBody),
      cognitiveComplexity: calculateCognitiveComplexity(funcBody),
      startLine,
      endLine,
    });
  }

  // Arrow functions
  PATTERNS.arrowFunction.lastIndex = 0;
  while ((match = PATTERNS.arrowFunction.exec(content)) !== null) {
    const name = match[1];
    const startLine = getLineNumber(content, match.index);
    const isAsync = content.substring(match.index - 10, match.index + 20).includes('async');
    const isExported = content.substring(match.index - 15, match.index).includes('export');

    // Find the arrow and extract body
    const arrowIndex = content.indexOf('=>', match.index);
    if (arrowIndex !== -1) {
      const funcBody = extractFunctionBody(content, arrowIndex + 2);
      const lineCount = funcBody.split('\n').length;
      const endLine = startLine + lineCount - 1;

      functions.push({
        name,
        type: 'arrow',
        isAsync,
        isExported,
        paramCount: 0, // Would need more parsing
        lineCount,
        cyclomaticComplexity: calculateCyclomaticComplexity(funcBody),
        cognitiveComplexity: calculateCognitiveComplexity(funcBody),
        startLine,
        endLine,
      });
    }
  }

  return functions;
}

/**
 * Extract imports
 */
function extractImports(content: string): ImportAnalysis[] {
  const imports: ImportAnalysis[] = [];
  let match: RegExpExecArray | null;

  PATTERNS.import.lastIndex = 0;
  while ((match = PATTERNS.import.exec(content)) !== null) {
    const namedImports1 = match[1]; // { foo, bar }
    const namespaceImport = match[2]; // * as foo
    const defaultImport1 = match[3]; // foo
    const namedImports2 = match[4]; // { foo, bar } (after default)
    const defaultImport2 = match[5]; // foo (after named)
    const modulePath = match[6];

    const isTypeOnly = PATTERNS.importType.test(match[0]);
    const isRelative = modulePath.startsWith('.') || modulePath.startsWith('/');

    const namedImports: string[] = [];

    // Parse named imports
    const namedStr = namedImports1 ?? namedImports2;
    if (namedStr) {
      const cleaned = namedStr.replace(/[{}]/g, '');
      const names = cleaned.split(',').map((n) => n.trim().split(/\s+as\s+/)[0]);
      namedImports.push(...names.filter(Boolean));
    }

    // Namespace import
    if (namespaceImport) {
      const nsName = namespaceImport.replace('* as ', '').trim();
      namedImports.push(`* as ${nsName}`);
    }

    imports.push({
      module: modulePath,
      isRelative,
      namedImports,
      defaultImport: defaultImport1 ?? defaultImport2,
      isTypeOnly,
    });
  }

  return imports;
}

/**
 * Extract exports
 */
function extractExports(content: string): ExportAnalysis[] {
  const exports: ExportAnalysis[] = [];
  let match: RegExpExecArray | null;

  // Named exports
  PATTERNS.exportNamed.lastIndex = 0;
  while ((match = PATTERNS.exportNamed.exec(content)) !== null) {
    const name = match[1];
    const isTypeOnly = /export\s+(?:interface|type)/.test(match[0]);

    exports.push({
      name,
      type: 'named',
      isTypeOnly,
    });
  }

  // Default exports
  PATTERNS.exportDefault.lastIndex = 0;
  while ((match = PATTERNS.exportDefault.exec(content)) !== null) {
    const name = match[1] ?? 'default';
    exports.push({
      name,
      type: 'default',
      isTypeOnly: false,
    });
  }

  // Re-exports
  PATTERNS.reExport.lastIndex = 0;
  while ((match = PATTERNS.reExport.exec(content)) !== null) {
    exports.push({
      name: `from ${match[1]}`,
      type: 're-export',
      isTypeOnly: false,
    });
  }

  return exports;
}

/**
 * Extract component props
 */
function extractComponentProps(content: string): ComponentPropsAnalysis | undefined {
  // Try interface first
  PATTERNS.componentProps.lastIndex = 0;
  let match = PATTERNS.componentProps.exec(content);

  if (!match) {
    PATTERNS.propsType.lastIndex = 0;
    match = PATTERNS.propsType.exec(content);
  }

  if (!match) return undefined;

  const propsTypeName = match[1];
  const propsBody = match[2];

  // Parse individual props
  const propLines = propsBody.split(';').filter(Boolean);
  const props: ComponentPropsAnalysis['props'] = [];

  for (const line of propLines) {
    const propMatch = /(\w+)(\?)?:\s*(.+)/.exec(line.trim());
    if (propMatch) {
      props.push({
        name: propMatch[1],
        type: propMatch[3].trim(),
        required: !propMatch[2],
      });
    }
  }

  return {
    propsTypeName,
    props,
  };
}

/**
 * Extract hooks used
 */
function extractHooksUsed(content: string): string[] {
  const hooks: string[] = [];
  let match: RegExpExecArray | null;

  PATTERNS.hookUsage.lastIndex = 0;
  while ((match = PATTERNS.hookUsage.exec(content)) !== null) {
    const hookName = match[0].replace('(', '').trim();
    if (!hooks.includes(hookName)) {
      hooks.push(hookName);
    }
  }

  return hooks;
}

/**
 * Extract error handling patterns
 */
function extractErrorPatterns(content: string): ErrorPattern[] {
  const patterns: ErrorPattern[] = [];
  let match: RegExpExecArray | null;

  // Try-catch
  PATTERNS.tryCatch.lastIndex = 0;
  while ((match = PATTERNS.tryCatch.exec(content)) !== null) {
    const line = getLineNumber(content, match.index);
    const block = extractBlock(content, match.index + match[0].length - 1);

    // Check if there's specific error handling
    const hasSpecificType = /catch\s*\(\s*\w+\s*:\s*\w+/.test(block);
    const hasRecovery = /catch[^{]*\{[^}]*(?:return|throw|console\.error|logger)/.test(block);

    patterns.push({
      type: 'try-catch',
      line,
      hasSpecificType,
      hasRecovery,
    });
  }

  // Promise catch
  PATTERNS.promiseCatch.lastIndex = 0;
  while ((match = PATTERNS.promiseCatch.exec(content)) !== null) {
    patterns.push({
      type: 'promise-catch',
      line: getLineNumber(content, match.index),
      hasSpecificType: false,
      hasRecovery: true,
    });
  }

  // Throw statements
  PATTERNS.throwStatement.lastIndex = 0;
  while ((match = PATTERNS.throwStatement.exec(content)) !== null) {
    patterns.push({
      type: 'throw',
      line: getLineNumber(content, match.index),
      hasSpecificType: !!match[1],
      hasRecovery: false,
    });
  }

  // Error boundaries
  if (PATTERNS.errorBoundary.test(content)) {
    patterns.push({
      type: 'error-boundary',
      line: 0,
      hasSpecificType: true,
      hasRecovery: true,
    });
  }

  return patterns;
}

// ============================================================================
// COMPLEXITY CALCULATION
// ============================================================================

/**
 * Calculate cyclomatic complexity for a code block
 */
function calculateCyclomaticComplexity(code: string): number {
  let complexity = 1; // Base complexity

  // Count decision points
  complexity += (code.match(PATTERNS.ifStatement) ?? []).length;
  complexity += (code.match(PATTERNS.elseIfStatement) ?? []).length;
  complexity += (code.match(PATTERNS.switchStatement) ?? []).length;
  complexity += (code.match(/\bcase\s+/g) ?? []).length;
  complexity += (code.match(PATTERNS.forLoop) ?? []).length;
  complexity += (code.match(PATTERNS.whileLoop) ?? []).length;
  complexity += (code.match(PATTERNS.doWhile) ?? []).length;
  complexity += (code.match(PATTERNS.ternary) ?? []).length;
  complexity += (code.match(PATTERNS.logicalAnd) ?? []).length;
  complexity += (code.match(PATTERNS.logicalOr) ?? []).length;
  complexity += (code.match(/\?\?/g) ?? []).length; // Nullish coalescing

  return complexity;
}

/**
 * Calculate cognitive complexity (nested complexity)
 */
function calculateCognitiveComplexity(code: string): number {
  let complexity = 0;
  let nestingLevel = 0;

  const lines = code.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // Increase nesting for control structures
    if (/^(if|for|while|switch|try)\s*\(/.test(trimmed) || /\bdo\s*\{/.test(trimmed)) {
      complexity += 1 + nestingLevel; // Base + nesting penalty
      nestingLevel++;
    }

    // Handle else/catch (no base increment, just nesting)
    if (/^(else|catch|finally)\s*/.test(trimmed)) {
      complexity += nestingLevel;
    }

    // Track brace nesting
    const openBraces = (line.match(/\{/g) ?? []).length;
    const closeBraces = (line.match(/\}/g) ?? []).length;

    // Decrease nesting when closing control structures
    if (closeBraces > openBraces) {
      nestingLevel = Math.max(0, nestingLevel - (closeBraces - openBraces));
    }

    // Ternary adds complexity without nesting
    complexity += (line.match(PATTERNS.ternary) ?? []).length;

    // Logical operators add complexity
    complexity += (line.match(PATTERNS.logicalAnd) ?? []).length;
    complexity += (line.match(PATTERNS.logicalOr) ?? []).length;
  }

  return complexity;
}

/**
 * Calculate file-level complexity
 */
function calculateFileComplexity(
  content: string,
  functions: FunctionAnalysis[]
): ComplexityMetrics {
  const lines = content.split('\n');
  const loc = lines.length;

  // Lines of logic (excluding blanks and comments)
  const lloc = lines.filter((line) => {
    const trimmed = line.trim();
    return (
      trimmed.length > 0 &&
      !trimmed.startsWith('//') &&
      !trimmed.startsWith('/*') &&
      !trimmed.startsWith('*')
    );
  }).length;

  // Max nesting depth
  let maxDepth = 0;
  let currentDepth = 0;

  for (const line of lines) {
    const opens = (line.match(/\{/g) ?? []).length;
    const closes = (line.match(/\}/g) ?? []).length;
    currentDepth += opens - closes;
    maxDepth = Math.max(maxDepth, currentDepth);
  }

  // Aggregate function complexity
  const totalCyclomatic = functions.reduce((sum, f) => sum + f.cyclomaticComplexity, 0);
  const totalCognitive = functions.reduce((sum, f) => sum + f.cognitiveComplexity, 0);

  return {
    cyclomatic: totalCyclomatic || calculateCyclomaticComplexity(content),
    cognitive: totalCognitive || calculateCognitiveComplexity(content),
    loc,
    lloc,
    maxNestingDepth: maxDepth,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get line number for a character index
 */
function getLineNumber(content: string, index: number): number {
  return content.substring(0, index).split('\n').length;
}

/**
 * Count parameters in a parameter string
 */
function countParams(params: string): number {
  if (!params || !params.trim()) return 0;
  return params.split(',').filter(Boolean).length;
}

/**
 * Extract function body (simplified)
 */
function extractFunctionBody(content: string, startIndex: number): string {
  // Find the opening brace
  let braceIndex = content.indexOf('{', startIndex);
  if (braceIndex === -1) {
    // Might be arrow function with expression body
    const arrowBody = content.substring(startIndex, startIndex + 500);
    const endMatch = arrowBody.match(/[;\n]/);
    return endMatch ? arrowBody.substring(0, endMatch.index) : arrowBody;
  }

  return extractBlock(content, braceIndex);
}

/**
 * Extract a block starting from opening brace
 */
function extractBlock(content: string, startIndex: number): string {
  let depth = 0;
  let endIndex = startIndex;

  for (let i = startIndex; i < content.length; i++) {
    if (content[i] === '{') depth++;
    if (content[i] === '}') depth--;

    if (depth === 0) {
      endIndex = i + 1;
      break;
    }
  }

  return content.substring(startIndex, endIndex);
}

// ============================================================================
// ANALYSIS CACHE
// ============================================================================

const analysisCache = new Map<string, { hash: string; analysis: FileASTAnalysis }>();

/**
 * Analyze file with caching
 */
export async function analyzeFileCached(filePath: string): Promise<FileASTAnalysis | null> {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const hash = crypto.createHash('md5').update(content).digest('hex').substring(0, 12);

    const cached = analysisCache.get(filePath);
    if (cached && cached.hash === hash) {
      return cached.analysis;
    }

    const analysis = await analyzeFile(filePath);
    if (analysis) {
      analysisCache.set(filePath, { hash, analysis });
    }

    return analysis;
  } catch {
    return null;
  }
}

/**
 * Clear analysis cache
 */
export function clearAnalysisCache(): void {
  analysisCache.clear();
}

/**
 * Remove specific file from cache
 */
export function invalidateCache(filePath: string): void {
  analysisCache.delete(filePath);
}
