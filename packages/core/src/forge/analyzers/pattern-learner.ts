/**
 * Pattern Learner - Self-Aware Forge Engine
 *
 * Detects recurring patterns in the codebase:
 * - Naming conventions (actual, not assumed)
 * - File organization patterns
 * - Common function signatures
 * - Error handling styles
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { LearnedPattern, PatternLearningResult } from '../types.js';
import { analyzeFile } from './ast-analyzer.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const MIN_FREQUENCY_THRESHOLD = 0.3; // Pattern must appear in 30%+ of relevant files
const MIN_EXAMPLES = 3; // Need at least 3 examples to learn a pattern

const IGNORED_DIRS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.nuxt',
  '.vibecheck',
  'coverage',
];

// ============================================================================
// PATTERN LEARNING
// ============================================================================

/**
 * Learn patterns from a project
 */
export async function learnPatterns(projectPath: string): Promise<PatternLearningResult> {
  const files = await collectFiles(projectPath);

  // Learn different pattern types in parallel
  const [
    namingConventions,
    fileOrganization,
    commonSignatures,
    errorHandlingStyle,
    allPatterns,
  ] = await Promise.all([
    learnNamingConventions(files),
    learnFileOrganization(projectPath, files),
    learnCommonSignatures(files),
    learnErrorHandlingStyle(files),
    learnAllPatterns(files),
  ]);

  return {
    patterns: allPatterns,
    namingConventions,
    fileOrganization,
    commonSignatures,
    errorHandlingStyle,
  };
}

// ============================================================================
// NAMING CONVENTIONS
// ============================================================================

/**
 * Learn naming conventions from files
 */
async function learnNamingConventions(files: string[]): Promise<PatternLearningResult['namingConventions']> {
  const fileNames: string[] = [];
  const componentNames: string[] = [];
  const functionNames: string[] = [];
  const variablePatterns: string[] = [];
  const typeNames: string[] = [];

  for (const file of files) {
    // File naming
    const fileName = path.basename(file, path.extname(file));
    fileNames.push(fileName);

    // Analyze file content
    const analysis = await analyzeFile(file);
    if (!analysis) continue;

    // Component names (PascalCase .tsx files)
    if (file.endsWith('.tsx') && /^[A-Z]/.test(fileName)) {
      componentNames.push(fileName);
    }

    // Function names
    for (const func of analysis.functions) {
      functionNames.push(func.name);
    }

    // Type names from exports
    for (const exp of analysis.exports) {
      if (exp.isTypeOnly || /^[A-Z]/.test(exp.name)) {
        typeNames.push(exp.name);
      }
    }
  }

  return {
    files: detectNamingPattern(fileNames),
    components: detectNamingPattern(componentNames),
    functions: detectNamingPattern(functionNames),
    variables: detectVariablePattern(functionNames), // Use function names as proxy
    types: detectNamingPattern(typeNames),
  };
}

/**
 * Detect naming pattern from a list of names
 */
function detectNamingPattern(names: string[]): string {
  if (names.length === 0) return 'unknown';

  const patterns = {
    PascalCase: 0,
    camelCase: 0,
    'kebab-case': 0,
    snake_case: 0,
    SCREAMING_SNAKE_CASE: 0,
  };

  for (const name of names) {
    if (/^[A-Z][a-zA-Z0-9]*$/.test(name)) patterns.PascalCase++;
    else if (/^[a-z][a-zA-Z0-9]*$/.test(name)) patterns.camelCase++;
    else if (/^[a-z]+(-[a-z]+)*$/.test(name)) patterns['kebab-case']++;
    else if (/^[a-z]+(_[a-z]+)*$/.test(name)) patterns.snake_case++;
    else if (/^[A-Z]+(_[A-Z]+)*$/.test(name)) patterns.SCREAMING_SNAKE_CASE++;
  }

  // Find dominant pattern
  const entries = Object.entries(patterns) as Array<[string, number]>;
  entries.sort((a, b) => b[1] - a[1]);

  const [topPattern, topCount] = entries[0];
  const ratio = topCount / names.length;

  if (ratio > MIN_FREQUENCY_THRESHOLD) {
    return topPattern;
  }

  return 'mixed';
}

/**
 * Detect variable naming pattern
 */
function detectVariablePattern(names: string[]): string {
  // Variables are typically camelCase
  const camelCount = names.filter((n) => /^[a-z][a-zA-Z0-9]*$/.test(n)).length;
  const ratio = camelCount / names.length;

  if (ratio > 0.7) return 'camelCase';
  if (ratio > 0.5) return 'mostly camelCase';
  return 'mixed';
}

// ============================================================================
// FILE ORGANIZATION
// ============================================================================

/**
 * Learn file organization patterns
 */
async function learnFileOrganization(
  projectPath: string,
  files: string[]
): Promise<PatternLearningResult['fileOrganization']> {
  const relativePaths = files.map((f) => path.relative(projectPath, f).replace(/\\/g, '/'));

  // Detect structure type
  const hasFeatureFolders = relativePaths.some((p) => /features?\/\w+\//.test(p));
  const hasTypeBasedFolders = relativePaths.some((p) =>
    /(components|hooks|utils|services|types|models)\//.test(p)
  );
  const hasDomainFolders = relativePaths.some((p) =>
    /(domain|modules|entities)\/\w+\//.test(p)
  );
  const isFlat = relativePaths.every((p) => p.split('/').length <= 2);

  let structure: PatternLearningResult['fileOrganization']['structure'];
  const patterns: string[] = [];

  if (hasFeatureFolders) {
    structure = 'feature-based';
    patterns.push('Features are organized in dedicated folders');

    // Find feature folder pattern
    const featureMatch = relativePaths.find((p) => /features?\/\w+\//.test(p));
    if (featureMatch) {
      const featurePath = featureMatch.match(/features?\/\w+/)?.[0];
      if (featurePath) patterns.push(`Feature folders at: ${featurePath.split('/')[0]}/`);
    }
  } else if (hasDomainFolders) {
    structure = 'domain-driven';
    patterns.push('Code is organized by domain/module');
  } else if (hasTypeBasedFolders) {
    structure = 'type-based';
    patterns.push('Files are grouped by type (components, hooks, etc.)');

    // Detect specific type folders
    const typeFolders = ['components', 'hooks', 'utils', 'services', 'types', 'models', 'lib'];
    for (const folder of typeFolders) {
      if (relativePaths.some((p) => p.includes(`${folder}/`))) {
        patterns.push(`${folder}/ folder for ${folder}`);
      }
    }
  } else if (isFlat) {
    structure = 'flat';
    patterns.push('Flat file structure with minimal nesting');
  } else {
    structure = 'type-based'; // Default
    patterns.push('Standard project structure');
  }

  // Detect co-location patterns
  const hasColocatedTests = relativePaths.some((p) =>
    relativePaths.some((q) => q === p.replace(/\.\w+$/, '.test$&'))
  );
  if (hasColocatedTests) {
    patterns.push('Tests are co-located with source files');
  }

  const hasColocatedStyles = relativePaths.some((p) =>
    relativePaths.some((q) => {
      const base = p.replace(/\.\w+$/, '');
      return q === `${base}.css` || q === `${base}.scss` || q === `${base}.module.css`;
    })
  );
  if (hasColocatedStyles) {
    patterns.push('Styles are co-located with components');
  }

  return { structure, patterns };
}

// ============================================================================
// COMMON SIGNATURES
// ============================================================================

/**
 * Learn common function signatures
 */
async function learnCommonSignatures(
  files: string[]
): Promise<PatternLearningResult['commonSignatures']> {
  const signatures = new Map<string, { count: number; examples: string[] }>();

  for (const file of files) {
    const analysis = await analyzeFile(file);
    if (!analysis) continue;

    for (const func of analysis.functions) {
      // Create signature pattern
      const pattern = createSignaturePattern(func.name, func.paramCount, func.isAsync);

      const existing = signatures.get(pattern);
      if (existing) {
        existing.count++;
        if (existing.examples.length < 5) {
          existing.examples.push(func.name);
        }
      } else {
        signatures.set(pattern, { count: 1, examples: [func.name] });
      }
    }
  }

  // Filter and sort by frequency
  return Array.from(signatures.entries())
    .filter(([_, data]) => data.count >= MIN_EXAMPLES)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10)
    .map(([pattern, data]) => ({
      pattern,
      frequency: data.count / files.length,
      examples: data.examples,
    }));
}

/**
 * Create a signature pattern from function info
 */
function createSignaturePattern(name: string, paramCount: number, isAsync: boolean): string {
  // Detect common patterns
  if (/^use[A-Z]/.test(name)) {
    return `Custom hook: use*()${isAsync ? ' async' : ''}`;
  }

  if (/^handle[A-Z]/.test(name)) {
    return `Event handler: handle*()`;
  }

  if (/^on[A-Z]/.test(name)) {
    return `Callback: on*()`;
  }

  if (/^get[A-Z]/.test(name)) {
    return `Getter: get*()${isAsync ? ' async' : ''}`;
  }

  if (/^set[A-Z]/.test(name)) {
    return `Setter: set*(value)`;
  }

  if (/^fetch[A-Z]/.test(name) || /^load[A-Z]/.test(name)) {
    return `Data fetcher: fetch*/load*() async`;
  }

  if (/^create[A-Z]/.test(name)) {
    return `Factory: create*(options)`;
  }

  if (/^is[A-Z]/.test(name) || /^has[A-Z]/.test(name) || /^can[A-Z]/.test(name)) {
    return `Boolean check: is*/has*/can*()`;
  }

  if (/^validate[A-Z]/.test(name) || /^check[A-Z]/.test(name)) {
    return `Validator: validate*/check*()`;
  }

  if (/^render[A-Z]/.test(name)) {
    return `Render helper: render*()`;
  }

  // Generic patterns
  if (paramCount === 0) {
    return `No-arg function${isAsync ? ' async' : ''}`;
  }

  if (paramCount === 1) {
    return `Single-arg function${isAsync ? ' async' : ''}`;
  }

  return `Multi-arg function (${paramCount} params)${isAsync ? ' async' : ''}`;
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

/**
 * Learn error handling style
 */
async function learnErrorHandlingStyle(
  files: string[]
): Promise<PatternLearningResult['errorHandlingStyle']> {
  let tryCatchCount = 0;
  let resultTypeCount = 0;
  let callbackCount = 0;

  for (const file of files) {
    const analysis = await analyzeFile(file);
    if (!analysis) continue;

    for (const pattern of analysis.errorPatterns) {
      if (pattern.type === 'try-catch' || pattern.type === 'promise-catch') {
        tryCatchCount++;
      }
    }

    // Check for Result type pattern
    const content = fs.readFileSync(file, 'utf-8');
    if (/Result<.*>|Either<.*>|\.ok\(|\.err\(/.test(content)) {
      resultTypeCount++;
    }

    // Check for callback-style error handling
    if (/callback\(err|callback\(error|cb\(err/.test(content)) {
      callbackCount++;
    }
  }

  const total = tryCatchCount + resultTypeCount + callbackCount || 1;

  if (resultTypeCount / total > 0.5) {
    return 'result-type';
  }

  if (callbackCount / total > 0.5) {
    return 'callback';
  }

  if (tryCatchCount / total > 0.5) {
    return 'try-catch';
  }

  return 'mixed';
}

// ============================================================================
// ALL PATTERNS
// ============================================================================

/**
 * Learn all patterns and return as LearnedPattern array
 */
async function learnAllPatterns(files: string[]): Promise<LearnedPattern[]> {
  const patterns: LearnedPattern[] = [];
  let patternId = 0;

  // Component patterns
  const componentPatterns = await learnComponentPatterns(files);
  patterns.push(...componentPatterns);

  // Import patterns
  const importPatterns = await learnImportPatterns(files);
  patterns.push(...importPatterns);

  // Hook patterns
  const hookPatterns = await learnHookPatterns(files);
  patterns.push(...hookPatterns);

  // Assign IDs
  for (const pattern of patterns) {
    pattern.id = `pattern-${++patternId}`;
  }

  return patterns.filter((p) => p.confidence >= MIN_FREQUENCY_THRESHOLD);
}

/**
 * Learn component patterns
 */
async function learnComponentPatterns(files: string[]): Promise<LearnedPattern[]> {
  const patterns: LearnedPattern[] = [];
  const componentFiles = files.filter((f) => f.endsWith('.tsx'));

  // Props interface pattern
  const propsFiles: string[] = [];
  const propsExamples: string[] = [];

  for (const file of componentFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    if (/interface \w+Props/.test(content)) {
      propsFiles.push(file);
      const match = content.match(/interface (\w+Props)/);
      if (match && propsExamples.length < 5) {
        propsExamples.push(match[1]);
      }
    }
  }

  if (propsFiles.length >= MIN_EXAMPLES) {
    patterns.push({
      id: '',
      category: 'component',
      description: 'Props interface pattern: interface *Props',
      matcher: 'interface \\w+Props',
      examples: propsExamples,
      frequency: propsFiles.length / componentFiles.length,
      confidence: propsFiles.length / componentFiles.length,
      foundIn: propsFiles.slice(0, 5),
    });
  }

  // Default export component pattern
  const defaultExportFiles: string[] = [];

  for (const file of componentFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    if (/export default function \w+/.test(content) || /export default \w+/.test(content)) {
      defaultExportFiles.push(file);
    }
  }

  if (defaultExportFiles.length >= MIN_EXAMPLES) {
    const frequency = defaultExportFiles.length / componentFiles.length;
    patterns.push({
      id: '',
      category: 'component',
      description: 'Default export for components',
      matcher: 'export default',
      examples: defaultExportFiles.slice(0, 5).map((f) => path.basename(f)),
      frequency,
      confidence: frequency,
      foundIn: defaultExportFiles.slice(0, 5),
    });
  }

  return patterns;
}

/**
 * Learn import patterns
 */
async function learnImportPatterns(files: string[]): Promise<LearnedPattern[]> {
  const patterns: LearnedPattern[] = [];

  // Type-only imports
  const typeImportFiles: string[] = [];

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    if (/import type \{/.test(content)) {
      typeImportFiles.push(file);
    }
  }

  if (typeImportFiles.length >= MIN_EXAMPLES) {
    patterns.push({
      id: '',
      category: 'import',
      description: 'Type-only imports: import type { ... }',
      matcher: 'import type \\{',
      examples: ['import type { User }', 'import type { Props }'],
      frequency: typeImportFiles.length / files.length,
      confidence: typeImportFiles.length / files.length,
      foundIn: typeImportFiles.slice(0, 5),
    });
  }

  // Path alias imports
  const aliasImportFiles: string[] = [];

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    if (/@\/|~\//.test(content)) {
      aliasImportFiles.push(file);
    }
  }

  if (aliasImportFiles.length >= MIN_EXAMPLES) {
    patterns.push({
      id: '',
      category: 'import',
      description: 'Path aliases: @/ or ~/',
      matcher: "from ['\"][@~]/",
      examples: ["from '@/components'", "from '~/utils'"],
      frequency: aliasImportFiles.length / files.length,
      confidence: aliasImportFiles.length / files.length,
      foundIn: aliasImportFiles.slice(0, 5),
    });
  }

  return patterns;
}

/**
 * Learn hook patterns
 */
async function learnHookPatterns(files: string[]): Promise<LearnedPattern[]> {
  const patterns: LearnedPattern[] = [];
  const hookUsage = new Map<string, { count: number; files: string[] }>();

  for (const file of files) {
    const analysis = await analyzeFile(file);
    if (!analysis) continue;

    for (const hook of analysis.hooksUsed) {
      const existing = hookUsage.get(hook);
      if (existing) {
        existing.count++;
        if (existing.files.length < 5) existing.files.push(file);
      } else {
        hookUsage.set(hook, { count: 1, files: [file] });
      }
    }
  }

  // Find common custom hooks (not standard React hooks)
  const standardHooks = ['useState', 'useEffect', 'useCallback', 'useMemo', 'useRef', 'useContext'];

  for (const [hook, data] of hookUsage) {
    if (!standardHooks.includes(hook) && data.count >= MIN_EXAMPLES) {
      patterns.push({
        id: '',
        category: 'function',
        description: `Custom hook: ${hook}`,
        matcher: hook,
        examples: [hook],
        frequency: data.count / files.length,
        confidence: Math.min(1, data.count / (files.length * 0.1)), // Expect 10% usage
        foundIn: data.files,
      });
    }
  }

  return patterns;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

/**
 * Collect source files
 */
async function collectFiles(projectPath: string): Promise<string[]> {
  const files: string[] = [];

  function scan(dir: string): void {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory() && !IGNORED_DIRS.includes(entry.name)) {
          scan(fullPath);
        } else if (entry.isFile() && SOURCE_EXTENSIONS.includes(path.extname(entry.name))) {
          files.push(fullPath);
        }
      }
    } catch {
      // Ignore permission errors
    }
  }

  scan(projectPath);
  return files;
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  learnNamingConventions,
  learnFileOrganization,
  learnCommonSignatures,
  learnErrorHandlingStyle,
  learnComponentPatterns,
  learnImportPatterns,
  learnHookPatterns,
};
