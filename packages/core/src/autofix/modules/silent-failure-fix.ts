/**
 * Silent Failure Fix Module
 * 
 * Detects and fixes silent failures such as:
 * - Empty catch blocks
 * - Catch blocks that only log without re-throwing or handling
 * - Success messages shown without checking for errors
 * - Ignored promise rejections
 */

import * as parser from '@babel/parser';
import _traverse from '@babel/traverse';

const traverse = (_traverse as unknown as { default: typeof _traverse }).default ?? _traverse;
import * as t from '@babel/types';
import type { Issue, Patch, FixContext, IssueType, ConfidenceLevel } from '../types.js';
import { BaseFixModule } from './base-fix-module.js';

/**
 * Pattern detected in code
 */
interface SilentFailurePattern {
  type: 'empty-catch' | 'log-only-catch' | 'success-after-try' | 'unhandled-promise';
  startLine: number;
  endLine: number;
  code: string;
  context?: string;
}

/**
 * SilentFailureFixModule handles silent failure patterns
 */
export class SilentFailureFixModule extends BaseFixModule {
  readonly id = 'silent-failure-fix';
  readonly name = 'Silent Failure Fix';
  readonly issueTypes: IssueType[] = ['silent-failure', 'fake-success'];
  readonly confidence: ConfidenceLevel = 'medium';

  /**
   * Check if this module can fix the given issue
   */
  canFix(issue: Issue): boolean {
    // Must have a file path
    if (!issue.filePath) {
      return false;
    }

    // Only handle TypeScript/JavaScript files
    const ext = issue.filePath.split('.').pop()?.toLowerCase();
    if (!ext || !['ts', 'tsx', 'js', 'jsx'].includes(ext)) {
      return false;
    }

    return this.issueTypes.includes(issue.type);
  }

  /**
   * Generate a fix for the given issue
   */
  async generateFix(issue: Issue, context: FixContext): Promise<Patch | null> {
    const filePath = this.getIssueFilePath(issue);
    if (!filePath) {
      return null;
    }

    const content = await this.readFile(context, filePath);
    if (!content) {
      return null;
    }

    try {
      // Parse the file
      const ast = this.parseCode(content, filePath);
      if (!ast) {
        return null;
      }

      // Find silent failure patterns
      const patterns = this.findSilentFailures(ast, content);
      
      if (patterns.length === 0) {
        // If issue has line info, try to fix at that location
        if (issue.line) {
          const fixedContent = this.fixAtLine(content, issue.line, issue);
          if (fixedContent !== content) {
            return this.createPatch(filePath, content, fixedContent, issue.id);
          }
        }
        return null;
      }

      // Apply fixes for all patterns
      let fixedContent = content;
      
      // Sort patterns by line number descending to avoid offset issues
      patterns.sort((a, b) => b.startLine - a.startLine);

      for (const pattern of patterns) {
        fixedContent = this.applyFix(fixedContent, pattern);
      }

      if (fixedContent === content) {
        return null;
      }

      return this.createPatch(filePath, content, fixedContent, issue.id);
    } catch (error) {
      // Error generating fix - return null to skip this fix
      // eslint-disable-next-line no-console
      console.error('Error generating silent failure fix:', error);
      return null;
    }
  }

  /**
   * Get a human-readable description of the fix
   */
  getFixDescription(issue: Issue): string {
    return `Fix silent failure: Add proper error handling at ${issue.filePath}:${issue.line ?? '?'}`;
  }

  /**
   * Get module description
   */
  protected getModuleDescription(): string {
    return 'Detects and fixes silent failures like empty catch blocks and fake success patterns';
  }

  /**
   * Parse code into AST
   */
  private parseCode(content: string, filePath: string): t.File | null {
    try {
      const isTypeScript = filePath.endsWith('.ts') || filePath.endsWith('.tsx');
      const isJSX = filePath.endsWith('.tsx') || filePath.endsWith('.jsx');

      return parser.parse(content, {
        sourceType: 'module',
        plugins: [
          isTypeScript ? 'typescript' : null,
          isJSX ? 'jsx' : null,
          'decorators-legacy',
          'classProperties',
          'optionalChaining',
          'nullishCoalescingOperator',
        ].filter(Boolean) as parser.ParserPlugin[],
      });
    } catch {
      return null;
    }
  }

  /**
   * Find silent failure patterns in the AST
   */
  private findSilentFailures(ast: t.File, content: string): SilentFailurePattern[] {
    const patterns: SilentFailurePattern[] = [];
    const lines = content.split('\n');

    traverse(ast, {
      CatchClause: (path) => {
        const node = path.node;
        const body = node.body;

        // Check for empty catch block
        if (body.body.length === 0) {
          patterns.push({
            type: 'empty-catch',
            startLine: node.loc?.start.line ?? 0,
            endLine: node.loc?.end.line ?? 0,
            code: this.getNodeCode(node, lines),
          });
          return;
        }

        // Check for log-only catch (console.log/warn/error without re-throwing)
        const hasOnlyLogging = this.hasOnlyLogging(body);
        const hasThrow = this.hasThrowStatement(body);
        const hasReturn = this.hasReturnOrErrorHandling(body);

        if (hasOnlyLogging && !hasThrow && !hasReturn) {
          patterns.push({
            type: 'log-only-catch',
            startLine: node.loc?.start.line ?? 0,
            endLine: node.loc?.end.line ?? 0,
            code: this.getNodeCode(node, lines),
          });
        }
      },

      TryStatement: (path) => {
        const node = path.node;
        const parent = path.parent;

        // Check for success message after try without proper error handling
        if (t.isBlockStatement(parent)) {
          const siblings = parent.body;
          const tryIndex = siblings.indexOf(node);

          // Look for success call after try
          for (let i = tryIndex + 1; i < siblings.length; i++) {
            const sibling = siblings[i];
            if (this.isSuccessCall(sibling)) {
              patterns.push({
                type: 'success-after-try',
                startLine: node.loc?.start.line ?? 0,
                endLine: (sibling.loc?.end.line ?? node.loc?.end.line) ?? 0,
                code: this.getNodeCode(node, lines),
                context: this.getNodeCode(sibling, lines),
              });
              break;
            }
          }
        }
      },

      CallExpression: (path) => {
        const node = path.node;

        // Check for .catch(() => {}) or .catch(e => {}) with empty handler
        if (
          t.isMemberExpression(node.callee) &&
          t.isIdentifier(node.callee.property, { name: 'catch' })
        ) {
          const handler = node.arguments[0];
          if (
            (t.isArrowFunctionExpression(handler) || t.isFunctionExpression(handler)) &&
            t.isBlockStatement(handler.body) &&
            handler.body.body.length === 0
          ) {
            patterns.push({
              type: 'unhandled-promise',
              startLine: node.loc?.start.line ?? 0,
              endLine: node.loc?.end.line ?? 0,
              code: this.getNodeCode(node, lines),
            });
          }
        }
      },
    });

    return patterns;
  }

  /**
   * Check if a block only contains logging statements
   */
  private hasOnlyLogging(block: t.BlockStatement): boolean {
    if (block.body.length === 0) return false;

    return block.body.every((stmt) => {
      if (!t.isExpressionStatement(stmt)) return false;
      const expr = stmt.expression;
      
      if (!t.isCallExpression(expr)) return false;
      const callee = expr.callee;
      
      if (!t.isMemberExpression(callee)) return false;
      if (!t.isIdentifier(callee.object, { name: 'console' })) return false;
      
      const method = callee.property;
      return (
        t.isIdentifier(method) &&
        ['log', 'warn', 'error', 'info', 'debug'].includes(method.name)
      );
    });
  }

  /**
   * Check if a block contains a throw statement
   */
  private hasThrowStatement(block: t.BlockStatement): boolean {
    let hasThrow = false;
    
    traverse(
      t.file(t.program([t.expressionStatement(t.arrowFunctionExpression([], block))])),
      {
        ThrowStatement: () => {
          hasThrow = true;
        },
        noScope: true,
      }
    );
    
    return hasThrow;
  }

  /**
   * Check if a block has return statement or proper error handling
   */
  private hasReturnOrErrorHandling(block: t.BlockStatement): boolean {
    return block.body.some((stmt) => {
      // Return statement
      if (t.isReturnStatement(stmt)) return true;
      
      // If statement (conditional handling)
      if (t.isIfStatement(stmt)) return true;
      
      // Assignment to error state
      if (t.isExpressionStatement(stmt) && t.isAssignmentExpression(stmt.expression)) {
        return true;
      }
      
      // Call to error handler function
      if (t.isExpressionStatement(stmt) && t.isCallExpression(stmt.expression)) {
        const callee = stmt.expression.callee;
        if (t.isIdentifier(callee)) {
          const name = callee.name.toLowerCase();
          return (
            name.includes('error') ||
            name.includes('handle') ||
            name.includes('notify') ||
            name.includes('show') ||
            name.includes('report')
          );
        }
      }
      
      return false;
    });
  }

  /**
   * Check if a statement is a success call
   */
  private isSuccessCall(stmt: t.Statement): boolean {
    if (!t.isExpressionStatement(stmt)) return false;
    const expr = stmt.expression;
    
    if (!t.isCallExpression(expr)) return false;
    const callee = expr.callee;
    
    if (t.isIdentifier(callee)) {
      const name = callee.name.toLowerCase();
      return name.includes('success') || name.includes('showsuccess');
    }
    
    if (t.isMemberExpression(callee) && t.isIdentifier(callee.property)) {
      const name = callee.property.name.toLowerCase();
      return name.includes('success');
    }
    
    return false;
  }

  /**
   * Get the source code for a node
   */
  private getNodeCode(node: t.Node, lines: string[]): string {
    if (!node.loc) return '';
    
    const startLine = node.loc.start.line - 1;
    const endLine = node.loc.end.line;
    
    return lines.slice(startLine, endLine).join('\n');
  }

  /**
   * Apply a fix for a silent failure pattern
   */
  private applyFix(content: string, pattern: SilentFailurePattern): string {
    const lines = content.split('\n');
    const indent = this.detectIndentation(content);
    const indentStr = indent.char.repeat(indent.size);

    switch (pattern.type) {
      case 'empty-catch':
        return this.fixEmptyCatch(lines, pattern, indentStr);
      
      case 'log-only-catch':
        return this.fixLogOnlyCatch(lines, pattern, indentStr);
      
      case 'success-after-try':
        return this.fixSuccessAfterTry(lines, pattern, indentStr);
      
      case 'unhandled-promise':
        return this.fixUnhandledPromise(lines, pattern, indentStr);
      
      default:
        return content;
    }
  }

  /**
   * Fix an empty catch block
   */
  private fixEmptyCatch(
    lines: string[],
    pattern: SilentFailurePattern,
    indentStr: string
  ): string {
    // Find the line with the empty catch
    for (let i = pattern.startLine - 1; i < pattern.endLine; i++) {
      const line = lines[i];
      
      // Match empty catch block: catch (e) {} or catch {}
      const emptyMatch = line.match(/catch\s*\([^)]*\)\s*\{\s*\}/);
      if (emptyMatch) {
        // Get the indentation of the catch line
        const lineIndent = line.match(/^(\s*)/)?.[1] ?? '';
        const bodyIndent = lineIndent + indentStr;
        
        // Replace with proper error handling
        const errorParam = line.match(/catch\s*\(([^)]*)\)/)?.[1] ?? 'error';
        const paramName = errorParam.trim() || 'error';
        
        lines[i] = line.replace(
          /catch\s*\([^)]*\)\s*\{\s*\}/,
          `catch (${paramName}) {\n${bodyIndent}console.error('Operation failed:', ${paramName});\n${bodyIndent}throw ${paramName};\n${lineIndent}}`
        );
        break;
      }
      
      // Match multi-line empty catch
      if (line.match(/catch\s*\([^)]*\)\s*\{/) && lines[i + 1]?.trim() === '}') {
        const lineIndent = line.match(/^(\s*)/)?.[1] ?? '';
        const bodyIndent = lineIndent + indentStr;
        const errorParam = line.match(/catch\s*\(([^)]*)\)/)?.[1] ?? 'error';
        const paramName = errorParam.trim() || 'error';
        
        // Insert error handling
        lines.splice(
          i + 1,
          0,
          `${bodyIndent}console.error('Operation failed:', ${paramName});`,
          `${bodyIndent}throw ${paramName};`
        );
        break;
      }
    }

    return lines.join('\n');
  }

  /**
   * Fix a catch block that only logs
   */
  private fixLogOnlyCatch(
    lines: string[],
    pattern: SilentFailurePattern,
    indentStr: string
  ): string {
    // Find the closing brace of the catch block and add a throw before it
    let braceCount = 0;
    let inCatch = false;
    
    for (let i = pattern.startLine - 1; i < pattern.endLine; i++) {
      const line = lines[i];
      
      if (line.includes('catch')) {
        inCatch = true;
      }
      
      if (inCatch) {
        braceCount += (line.match(/\{/g) || []).length;
        braceCount -= (line.match(/\}/g) || []).length;
        
        if (braceCount === 0) {
          // Found the closing brace
          const lineIndent = lines[pattern.startLine - 1].match(/^(\s*)/)?.[1] ?? '';
          const bodyIndent = lineIndent + indentStr;
          
          // Get the error parameter name
          const catchLine = lines.slice(pattern.startLine - 1, i + 1).join('\n');
          const errorParam = catchLine.match(/catch\s*\(([^)]*)\)/)?.[1]?.trim() ?? 'error';
          
          // Insert throw statement before the closing brace
          const closingLine = lines[i];
          const closingIndent = closingLine.match(/^(\s*)/)?.[1] ?? '';
          
          lines[i] = `${bodyIndent}throw ${errorParam};\n${closingLine}`;
          break;
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * Fix success message shown after try block
   */
  private fixSuccessAfterTry(
    lines: string[],
    pattern: SilentFailurePattern,
    indentStr: string
  ): string {
    // This pattern needs to move the success call inside the try block
    // This is complex and may need manual review, so we add a comment for now
    
    const tryLineIndex = pattern.startLine - 1;
    const lineIndent = lines[tryLineIndex].match(/^(\s*)/)?.[1] ?? '';
    
    // Add a warning comment
    lines.splice(
      tryLineIndex,
      0,
      `${lineIndent}// TODO: Move success indicator inside try block to avoid showing success on failure`
    );

    return lines.join('\n');
  }

  /**
   * Fix unhandled promise rejection
   */
  private fixUnhandledPromise(
    lines: string[],
    pattern: SilentFailurePattern,
    indentStr: string
  ): string {
    // Find and fix empty .catch() handler
    for (let i = pattern.startLine - 1; i < pattern.endLine; i++) {
      const line = lines[i];
      
      // Match .catch(() => {}) or .catch((e) => {})
      const emptyMatch = line.match(/\.catch\(\s*\(?([^)]*)\)?\s*=>\s*\{\s*\}\s*\)/);
      if (emptyMatch) {
        const errorParam = emptyMatch[1]?.trim() || 'error';
        const paramName = errorParam || 'error';
        
        lines[i] = line.replace(
          /\.catch\(\s*\(?[^)]*\)?\s*=>\s*\{\s*\}\s*\)/,
          `.catch((${paramName}) => { console.error('Promise rejected:', ${paramName}); throw ${paramName}; })`
        );
        break;
      }

      // Match .catch(function() {}) or .catch(function(e) {})
      const funcMatch = line.match(/\.catch\(\s*function\s*\(([^)]*)\)\s*\{\s*\}\s*\)/);
      if (funcMatch) {
        const errorParam = funcMatch[1]?.trim() || 'error';
        
        lines[i] = line.replace(
          /\.catch\(\s*function\s*\([^)]*\)\s*\{\s*\}\s*\)/,
          `.catch(function(${errorParam}) { console.error('Promise rejected:', ${errorParam}); throw ${errorParam}; })`
        );
        break;
      }
    }

    return lines.join('\n');
  }

  /**
   * Fix at a specific line when no AST pattern is found
   */
  private fixAtLine(content: string, line: number, issue: Issue): string {
    const lines = content.split('\n');
    const targetLine = lines[line - 1];
    
    if (!targetLine) {
      return content;
    }

    const indent = this.detectIndentation(content);
    const lineIndent = targetLine.match(/^(\s*)/)?.[1] ?? '';

    // Check for common patterns
    if (targetLine.includes('catch') && targetLine.includes('{}')) {
      // Empty catch on single line
      lines[line - 1] = targetLine.replace(
        /catch\s*\([^)]*\)\s*\{\s*\}/,
        'catch (error) {\n' +
          lineIndent + indent.char.repeat(indent.size) + "console.error('Operation failed:', error);\n" +
          lineIndent + indent.char.repeat(indent.size) + 'throw error;\n' +
          lineIndent + '}'
      );
    } else if (targetLine.includes('.catch') && targetLine.includes('{}')) {
      // Empty promise catch
      lines[line - 1] = targetLine.replace(
        /\.catch\(\s*\(?[^)]*\)?\s*=>\s*\{\s*\}\s*\)/,
        ".catch((error) => { console.error('Promise rejected:', error); throw error; })"
      );
    }

    return lines.join('\n');
  }
}
