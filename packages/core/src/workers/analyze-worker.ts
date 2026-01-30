/**
 * File Analysis Worker
 * 
 * Worker entry point for parallel file analysis.
 * Handles AST parsing and rule evaluation within the worker thread.
 */

import type { AnalysisTask, AnalysisResult, Finding, ParseError } from './types.js';

/**
 * Analyze a single file
 * This is the main entry point called by the worker pool
 */
export async function analyzeFile(task: AnalysisTask): Promise<AnalysisResult> {
  const startTime = Date.now();
  const findings: Finding[] = [];
  const parseErrors: ParseError[] = [];

  try {
    // Parse the file content
    const ast = await parseSource(task.filePath, task.content);

    if (ast.errors && ast.errors.length > 0) {
      parseErrors.push(...ast.errors.map((e: { message: string; line?: number; column?: number }) => ({
        message: e.message,
        file: task.filePath,
        line: e.line,
        column: e.column,
      })));
    }

    // Run each rule against the AST
    for (const ruleId of task.rules) {
      try {
        const ruleFindings = await runRule(ruleId, task.filePath, task.content, ast.ast, task.config);
        findings.push(...ruleFindings);
      } catch (error) {
        // Log rule execution error but continue with other rules
        parseErrors.push({
          message: `Rule ${ruleId} failed: ${error instanceof Error ? error.message : String(error)}`,
          file: task.filePath,
        });
      }
    }
  } catch (error) {
    parseErrors.push({
      message: error instanceof Error ? error.message : String(error),
      file: task.filePath,
    });
  }

  return {
    filePath: task.filePath,
    findings,
    parseErrors,
    durationMs: Date.now() - startTime,
    cached: false,
  };
}

/**
 * Parse source code into an AST
 */
async function parseSource(
  filePath: string,
  content: string
): Promise<{ ast: unknown; errors: Array<{ message: string; line?: number; column?: number }> }> {
  const errors: Array<{ message: string; line?: number; column?: number }> = [];
  let ast: unknown = null;

  // Determine file type from extension
  const ext = filePath.split('.').pop()?.toLowerCase();

  try {
    if (ext === 'ts' || ext === 'tsx' || ext === 'js' || ext === 'jsx' || ext === 'mjs' || ext === 'cjs') {
      // Use @babel/parser for JavaScript/TypeScript
      const { parse } = await import('@babel/parser');
      
      const plugins: Array<'typescript' | 'jsx' | 'decorators-legacy' | 'classProperties' | 'dynamicImport'> = [
        'decorators-legacy',
        'classProperties',
        'dynamicImport',
      ];

      if (ext === 'ts' || ext === 'tsx') {
        plugins.push('typescript');
      }
      if (ext === 'tsx' || ext === 'jsx') {
        plugins.push('jsx');
      }

      ast = parse(content, {
        sourceType: 'module',
        plugins,
        errorRecovery: true,
      });
    } else if (ext === 'json') {
      // JSON parsing
      ast = JSON.parse(content);
    } else if (ext === 'yaml' || ext === 'yml') {
      // YAML parsing (if available)
      try {
        const yaml = await import('js-yaml');
        ast = yaml.load(content);
      } catch {
        // js-yaml not available
        errors.push({ message: 'YAML parsing not available' });
      }
    } else {
      // Text-based analysis for unknown file types
      ast = { type: 'text', content, lines: content.split('\n') };
    }
  } catch (error) {
    if (error instanceof SyntaxError) {
      const match = error.message.match(/\((\d+):(\d+)\)/);
      errors.push({
        message: error.message,
        line: match ? parseInt(match[1], 10) : undefined,
        column: match ? parseInt(match[2], 10) : undefined,
      });
    } else {
      errors.push({
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { ast, errors };
}

/**
 * Run a single rule against parsed content
 */
async function runRule(
  ruleId: string,
  filePath: string,
  content: string,
  ast: unknown,
  config?: Record<string, unknown>
): Promise<Finding[]> {
  const findings: Finding[] = [];
  const lines = content.split('\n');

  // Built-in rules (can be extended via plugin system)
  switch (ruleId) {
    case 'no-console': {
      // Detect console.log statements
      const consoleRegex = /console\.(log|warn|error|info|debug)\s*\(/g;
      let lineNum = 0;
      for (const line of lines) {
        lineNum++;
        let match;
        while ((match = consoleRegex.exec(line)) !== null) {
          findings.push({
            ruleId,
            severity: 'warning',
            message: `Unexpected console.${match[1]} statement`,
            file: filePath,
            line: lineNum,
            column: match.index + 1,
            lineContent: line.trim(),
            suggestion: 'Remove console statement or use a logger',
          });
        }
      }
      break;
    }

    case 'no-hardcoded-secrets': {
      // Detect potential hardcoded secrets
      const secretPatterns = [
        { pattern: /(?:api[_-]?key|apikey)\s*[=:]\s*['"][^'"]{20,}['"]/gi, type: 'API Key' },
        { pattern: /(?:password|passwd|pwd)\s*[=:]\s*['"][^'"]+['"]/gi, type: 'Password' },
        { pattern: /(?:secret|token)\s*[=:]\s*['"][^'"]{10,}['"]/gi, type: 'Secret/Token' },
        { pattern: /(?:aws_secret|aws_key)\s*[=:]\s*['"][^'"]+['"]/gi, type: 'AWS Credential' },
        { pattern: /ghp_[a-zA-Z0-9]{36}/g, type: 'GitHub Token' },
        { pattern: /sk-[a-zA-Z0-9]{48}/g, type: 'OpenAI API Key' },
      ];

      let lineNum = 0;
      for (const line of lines) {
        lineNum++;
        for (const { pattern, type } of secretPatterns) {
          pattern.lastIndex = 0;
          if (pattern.test(line)) {
            findings.push({
              ruleId,
              severity: 'error',
              message: `Potential hardcoded ${type} detected`,
              file: filePath,
              line: lineNum,
              lineContent: line.trim().substring(0, 50) + '...',
              suggestion: 'Use environment variables for sensitive data',
            });
          }
        }
      }
      break;
    }

    case 'no-eval': {
      // Detect dangerous eval usage
      const evalRegex = /\beval\s*\(|new\s+Function\s*\(/g;
      let lineNum = 0;
      for (const line of lines) {
        lineNum++;
        let match;
        while ((match = evalRegex.exec(line)) !== null) {
          findings.push({
            ruleId,
            severity: 'error',
            message: 'Dangerous use of eval() or new Function()',
            file: filePath,
            line: lineNum,
            column: match.index + 1,
            lineContent: line.trim(),
            suggestion: 'Avoid eval() and new Function() - they can execute arbitrary code',
          });
        }
      }
      break;
    }

    case 'no-any': {
      // Detect 'any' type usage in TypeScript
      if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
        const anyRegex = /:\s*any\b(?!\s*\[)/g;
        let lineNum = 0;
        for (const line of lines) {
          lineNum++;
          // Skip comments
          if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;
          
          let match;
          while ((match = anyRegex.exec(line)) !== null) {
            findings.push({
              ruleId,
              severity: 'warning',
              message: 'Avoid using "any" type',
              file: filePath,
              line: lineNum,
              column: match.index + 1,
              lineContent: line.trim(),
              suggestion: 'Use "unknown" or a more specific type',
            });
          }
        }
      }
      break;
    }

    default:
      // Unknown rule - skip
      break;
  }

  return findings;
}

// Export for direct worker usage and Piscina worker threads
export default analyzeFile;
