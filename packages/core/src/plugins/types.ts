/**
 * Plugin Types
 * 
 * ESLint-style plugin interface with meta + create pattern.
 */

import type { z } from 'zod';

export type RuleType = 'security' | 'quality' | 'style' | 'performance' | 'compatibility';
export type RuleSeverity = 'error' | 'warning' | 'info' | 'off';
export type FixType = 'code' | 'whitespace';

/**
 * Rule metadata
 */
export interface RuleMeta {
  /** Rule type/category */
  type: RuleType;
  /** Documentation */
  docs: {
    /** Rule description */
    description: string;
    /** Documentation URL */
    url?: string;
    /** Recommended severity */
    recommended?: RuleSeverity;
    /** Categories */
    category?: string;
  };
  /** Configuration schema (Zod) */
  schema?: z.ZodSchema;
  /** Message templates with IDs */
  messages: Record<string, string>;
  /** Whether this rule can provide fixes */
  fixable?: FixType;
  /** Whether this rule needs whole program analysis */
  requiresTypeChecking?: boolean;
  /** Deprecated message if rule is deprecated */
  deprecated?: string;
  /** Replacement rules if deprecated */
  replacedBy?: string[];
}

/**
 * Source code representation
 */
export interface SourceCode {
  /** Full source text */
  text: string;
  /** Lines array */
  lines: string[];
  /** AST root node */
  ast: unknown;
  /** Get text for a node */
  getText(node?: unknown, beforeCount?: number, afterCount?: number): string;
  /** Get line at index (1-based) */
  getLine(lineNumber: number): string;
  /** Get token before a node */
  getTokenBefore(node: unknown): unknown;
  /** Get token after a node */
  getTokenAfter(node: unknown): unknown;
  /** Get all comments */
  getAllComments(): unknown[];
}

/**
 * Location in source code
 */
export interface SourceLocation {
  start: { line: number; column: number };
  end: { line: number; column: number };
}

/**
 * Fix object for auto-fixes
 */
export interface Fix {
  range: [number, number];
  text: string;
}

/**
 * Report descriptor for reporting violations
 */
export interface ReportDescriptor {
  /** Node where violation occurred */
  node?: unknown;
  /** Location if no node */
  loc?: SourceLocation | { line: number; column: number };
  /** Message ID from meta.messages */
  messageId?: string;
  /** Direct message (if not using messageId) */
  message?: string;
  /** Data for message interpolation */
  data?: Record<string, string | number>;
  /** Fix function */
  fix?: (fixer: RuleFixer) => Fix | Fix[] | null;
  /** Suggestions for manual fixes */
  suggest?: Array<{
    messageId?: string;
    message?: string;
    data?: Record<string, string | number>;
    fix: (fixer: RuleFixer) => Fix | Fix[] | null;
  }>;
}

/**
 * Fixer for creating fixes
 */
export interface RuleFixer {
  insertTextAfter(nodeOrToken: unknown, text: string): Fix;
  insertTextAfterRange(range: [number, number], text: string): Fix;
  insertTextBefore(nodeOrToken: unknown, text: string): Fix;
  insertTextBeforeRange(range: [number, number], text: string): Fix;
  remove(nodeOrToken: unknown): Fix;
  removeRange(range: [number, number]): Fix;
  replaceText(nodeOrToken: unknown, text: string): Fix;
  replaceTextRange(range: [number, number], text: string): Fix;
}

/**
 * Rule context passed to create()
 */
export interface RuleContext {
  /** Rule ID */
  id: string;
  /** Rule options from config */
  options: unknown[];
  /** Shared settings */
  settings: Record<string, unknown>;
  /** Parser options */
  parserOptions: Record<string, unknown>;
  /** Current filename */
  filename: string;
  /** Current working directory */
  cwd: string;
  /** Get source code */
  getSourceCode(): SourceCode;
  /** Report a violation */
  report(descriptor: ReportDescriptor): void;
  /** Get ancestors of current node */
  getAncestors(): unknown[];
  /** Get declared variables in scope */
  getDeclaredVariables(node: unknown): unknown[];
  /** Get scope for node */
  getScope(): unknown;
  /** Mark a variable as used */
  markVariableAsUsed(name: string): boolean;
}

/**
 * Node visitor returned by create()
 */
export type NodeVisitor = {
  [nodeType: string]: (node: unknown) => void;
};

/**
 * Plugin rule definition
 */
export interface PluginRule {
  /** Rule metadata */
  meta: RuleMeta;
  /** Create rule visitor */
  create(context: RuleContext): NodeVisitor;
}

/**
 * Plugin definition
 */
export interface Plugin {
  /** Plugin name */
  name: string;
  /** Plugin version */
  version: string;
  /** Rules provided by this plugin */
  rules: Record<string, PluginRule>;
  /** Configs/presets provided by this plugin */
  configs?: Record<string, PluginConfig>;
  /** Processors for non-JS files */
  processors?: Record<string, PluginProcessor>;
  /** Plugin metadata */
  meta?: {
    /** Plugin description */
    description?: string;
    /** Homepage URL */
    homepage?: string;
    /** Is this an official plugin */
    official?: boolean;
  };
}

/**
 * Plugin configuration preset
 */
export interface PluginConfig {
  /** Rules to enable/configure */
  rules?: Record<string, RuleSeverity | [RuleSeverity, ...unknown[]]>;
  /** Other plugins required */
  plugins?: string[];
  /** Settings */
  settings?: Record<string, unknown>;
  /** Extends other configs */
  extends?: string[];
}

/**
 * Processor for handling non-JS files
 */
export interface PluginProcessor {
  /** Extract code blocks from file */
  preprocess?: (text: string, filename: string) => Array<string | { text: string; filename: string }>;
  /** Combine results after processing */
  postprocess?: (messages: unknown[][], filename: string) => unknown[];
  /** Whether processor supports auto-fix */
  supportsAutofix?: boolean;
}

/**
 * Plugin manifest for permission declarations
 */
export interface PluginManifest {
  /** Plugin name */
  name: string;
  /** Plugin version */
  version: string;
  /** Required permissions */
  permissions: PluginPermission[];
  /** Entry point */
  main: string;
  /** Is this plugin sandboxed */
  sandboxed?: boolean;
}

export type PluginPermission = 
  | 'read-ast'      // Can read AST
  | 'read-source'   // Can read source code
  | 'report'        // Can report findings
  | 'config'        // Can access configuration
  | 'fix'           // Can provide auto-fixes
  | 'suggest';      // Can provide suggestions

export const DEFAULT_PERMISSIONS: PluginPermission[] = [
  'read-ast',
  'read-source',
  'report',
  'config',
];

/**
 * Plugin load result
 */
export interface PluginLoadResult {
  /** Plugin instance */
  plugin?: Plugin;
  /** Source path */
  source: string;
  /** Load error if any */
  error?: string;
  /** Is plugin trusted/official */
  trusted: boolean;
}
