/**
 * Flow Tracing Parser
 * 
 * Parses TypeScript/JavaScript source code and extracts data flow nodes.
 * Uses regex-based pattern matching for fast, lightweight analysis.
 * 
 * @module flow-tracing/parser
 */

import type {
  FlowNode,
  FlowNodeType,
  SourceCategory,
  SinkCategory,
  SourcePattern,
  SinkPattern,
  ValidationPattern,
} from './types.js';
import { randomUUID } from 'node:crypto';

const generateId = () => randomUUID().slice(0, 12);

// ============================================================================
// Types
// ============================================================================

interface ParseOptions {
  sourcePatterns: SourcePattern[];
  sinkPatterns: SinkPattern[];
  validationPatterns: ValidationPattern[];
}

interface ParseResult {
  nodes: FlowNode[];
  variables: Map<string, FlowNode>;
  functions: Map<string, { params: string[]; returnNode?: FlowNode }>;
}

// ============================================================================
// Parser Implementation
// ============================================================================

/**
 * Parse source code and extract flow nodes
 */
export function parseSourceCode(
  code: string,
  filePath: string,
  options: ParseOptions
): ParseResult {
  const nodes: FlowNode[] = [];
  const variables = new Map<string, FlowNode>();
  const functions = new Map<string, { params: string[]; returnNode?: FlowNode }>();
  
  const lines = code.split('\n');
  
  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];
    const lineNumber = lineNum + 1;
    
    // Skip comments and empty lines
    if (isCommentOrEmpty(line)) {
      continue;
    }
    
    // Check for sources
    for (const pattern of options.sourcePatterns) {
      const match = matchPattern(line, pattern.patterns);
      if (match) {
        const node = createSourceNode(
          line,
          filePath,
          lineNumber,
          match,
          pattern.category,
          pattern.name
        );
        nodes.push(node);
        
        // Track variable assignment
        const varName = extractVariableName(line);
        if (varName) {
          variables.set(varName, node);
        }
      }
    }
    
    // Check for sinks
    for (const pattern of options.sinkPatterns) {
      const match = matchPattern(line, pattern.patterns);
      if (match) {
        const node = createSinkNode(
          line,
          filePath,
          lineNumber,
          match,
          pattern.category,
          pattern.name,
          pattern.riskLevel
        );
        nodes.push(node);
      }
    }
    
    // Check for validations
    for (const pattern of options.validationPatterns) {
      const match = matchPattern(line, pattern.patterns);
      if (match) {
        const node = createValidationNode(
          line,
          filePath,
          lineNumber,
          match,
          pattern.name
        );
        nodes.push(node);
        
        // Track validated variables
        const varName = extractVariableName(line);
        if (varName && variables.has(varName)) {
          variables.get(varName)!.hasValidation = true;
        }
      }
    }
    
    // Track variable declarations and assignments
    const varDecl = extractVariableDeclaration(line, filePath, lineNumber);
    if (varDecl && !nodes.some(n => n.location.line === lineNumber)) {
      nodes.push(varDecl);
      variables.set(varDecl.label, varDecl);
    }
    
    // Track function definitions
    const funcDef = extractFunctionDefinition(line, filePath, lineNumber);
    if (funcDef) {
      functions.set(funcDef.name, { params: funcDef.params });
      for (const param of funcDef.paramNodes) {
        nodes.push(param);
        variables.set(param.label, param);
      }
    }
    
    // Track return statements
    const returnNode = extractReturnStatement(line, filePath, lineNumber);
    if (returnNode) {
      nodes.push(returnNode);
    }
  }
  
  return { nodes, variables, functions };
}

// ============================================================================
// Pattern Matching
// ============================================================================

function matchPattern(line: string, patterns: string[]): string | null {
  for (const pattern of patterns) {
    if (line.includes(pattern)) {
      return pattern;
    }
  }
  return null;
}

function isCommentOrEmpty(line: string): boolean {
  const trimmed = line.trim();
  return (
    trimmed === '' ||
    trimmed.startsWith('//') ||
    trimmed.startsWith('/*') ||
    trimmed.startsWith('*') ||
    trimmed.startsWith('#')
  );
}

// ============================================================================
// Node Creation
// ============================================================================

function createSourceNode(
  line: string,
  filePath: string,
  lineNumber: number,
  matchedPattern: string,
  category: SourceCategory,
  patternName: string
): FlowNode {
  return {
    id: generateId(),
    type: 'source',
    label: `${patternName} (${category})`,
    location: {
      file: filePath,
      line: lineNumber,
      column: line.indexOf(matchedPattern) + 1,
    },
    code: line.trim(),
    sourceCategory: category,
    metadata: {
      pattern: matchedPattern,
      patternName,
    },
  };
}

function createSinkNode(
  line: string,
  filePath: string,
  lineNumber: number,
  matchedPattern: string,
  category: SinkCategory,
  patternName: string,
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
): FlowNode {
  return {
    id: generateId(),
    type: 'sink',
    label: `${patternName} (${category})`,
    location: {
      file: filePath,
      line: lineNumber,
      column: line.indexOf(matchedPattern) + 1,
    },
    code: line.trim(),
    sinkCategory: category,
    riskLevel,
    metadata: {
      pattern: matchedPattern,
      patternName,
    },
  };
}

function createValidationNode(
  line: string,
  filePath: string,
  lineNumber: number,
  matchedPattern: string,
  patternName: string
): FlowNode {
  return {
    id: generateId(),
    type: 'validation',
    label: `Validation: ${patternName}`,
    location: {
      file: filePath,
      line: lineNumber,
      column: line.indexOf(matchedPattern) + 1,
    },
    code: line.trim(),
    hasValidation: true,
    metadata: {
      pattern: matchedPattern,
      patternName,
    },
  };
}

// ============================================================================
// Variable Extraction
// ============================================================================

function extractVariableName(line: string): string | null {
  // Match: const/let/var name = ...
  const declMatch = line.match(/(?:const|let|var)\s+(\w+)\s*=/);
  if (declMatch) {
    return declMatch[1];
  }
  
  // Match: name = ...
  const assignMatch = line.match(/^\s*(\w+)\s*=/);
  if (assignMatch) {
    return assignMatch[1];
  }
  
  // Match destructuring: const { name } = ...
  const destructMatch = line.match(/(?:const|let|var)\s*\{([^}]+)\}/);
  if (destructMatch) {
    const names = destructMatch[1].split(',').map(s => s.trim().split(':')[0].trim());
    return names[0]; // Return first destructured name
  }
  
  return null;
}

function extractVariableDeclaration(
  line: string,
  filePath: string,
  lineNumber: number
): FlowNode | null {
  const match = line.match(/(?:const|let|var)\s+(\w+)\s*=\s*(.+)/);
  if (!match) return null;
  
  const [, varName, value] = match;
  
  return {
    id: generateId(),
    type: 'variable',
    label: varName,
    location: {
      file: filePath,
      line: lineNumber,
      column: line.indexOf(varName) + 1,
    },
    code: line.trim(),
    metadata: {
      initialValue: value.trim(),
    },
  };
}

// ============================================================================
// Function Extraction
// ============================================================================

interface FunctionInfo {
  name: string;
  params: string[];
  paramNodes: FlowNode[];
}

function extractFunctionDefinition(
  line: string,
  filePath: string,
  lineNumber: number
): FunctionInfo | null {
  // Match: function name(params) or name = (params) => or name(params) {
  const patterns = [
    /function\s+(\w+)\s*\(([^)]*)\)/,
    /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*=>/,
    /(\w+)\s*\(([^)]*)\)\s*(?::\s*\w+)?\s*\{/,
  ];
  
  for (const pattern of patterns) {
    const match = line.match(pattern);
    if (match) {
      const [, funcName, paramsStr] = match;
      const params = paramsStr
        .split(',')
        .map(p => p.trim().split(':')[0].trim())
        .filter(p => p.length > 0);
      
      const paramNodes: FlowNode[] = params.map((param, index) => ({
        id: generateId(),
        type: 'parameter' as FlowNodeType,
        label: param,
        location: {
          file: filePath,
          line: lineNumber,
          column: line.indexOf(param) + 1,
        },
        code: param,
        metadata: {
          functionName: funcName,
          paramIndex: index,
        },
      }));
      
      return { name: funcName, params, paramNodes };
    }
  }
  
  return null;
}

function extractReturnStatement(
  line: string,
  filePath: string,
  lineNumber: number
): FlowNode | null {
  const match = line.match(/\breturn\s+(.+)/);
  if (!match) return null;
  
  return {
    id: generateId(),
    type: 'return',
    label: 'return',
    location: {
      file: filePath,
      line: lineNumber,
      column: line.indexOf('return') + 1,
    },
    code: line.trim(),
    metadata: {
      returnValue: match[1].trim(),
    },
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Find variables referenced in a line of code
 */
export function findReferencedVariables(
  line: string,
  knownVariables: Set<string>
): string[] {
  const referenced: string[] = [];
  
  for (const varName of knownVariables) {
    // Match variable name as a word boundary
    const regex = new RegExp(`\\b${varName}\\b`);
    if (regex.test(line)) {
      referenced.push(varName);
    }
  }
  
  return referenced;
}

/**
 * Check if a line contains a function call
 */
export function extractFunctionCalls(line: string): string[] {
  const calls: string[] = [];
  const regex = /(\w+)\s*\(/g;
  let match;
  
  while ((match = regex.exec(line)) !== null) {
    const funcName = match[1];
    // Filter out keywords
    if (!['if', 'while', 'for', 'switch', 'catch', 'function', 'return'].includes(funcName)) {
      calls.push(funcName);
    }
  }
  
  return calls;
}
