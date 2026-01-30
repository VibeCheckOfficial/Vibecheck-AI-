/**
 * Plugin Sandbox
 * 
 * Security isolation for untrusted plugins.
 * Uses restricted context to prevent access to sensitive APIs.
 */

import type {
  Plugin,
  PluginRule,
  RuleContext,
  NodeVisitor,
  PluginPermission,
  SourceCode,
} from './types.js';

interface SandboxOptions {
  /** Allowed permissions */
  permissions: PluginPermission[];
  /** Timeout for rule execution (ms) */
  timeoutMs: number;
  /** Maximum memory usage (bytes) */
  maxMemoryBytes: number;
  /** Enable console output */
  allowConsole: boolean;
}

const DEFAULT_SANDBOX_OPTIONS: SandboxOptions = {
  permissions: ['read-ast', 'read-source', 'report', 'config'],
  timeoutMs: 5000,
  maxMemoryBytes: 50 * 1024 * 1024, // 50MB
  allowConsole: false,
};

/**
 * Sandboxed Rule Context
 * 
 * Wraps RuleContext with permission checks.
 */
class SandboxedRuleContext implements RuleContext {
  private inner: RuleContext;
  private permissions: Set<PluginPermission>;
  private reportCount = 0;
  private maxReports = 100;

  constructor(inner: RuleContext, permissions: PluginPermission[]) {
    this.inner = inner;
    this.permissions = new Set(permissions);
  }

  get id(): string {
    return this.inner.id;
  }

  get options(): unknown[] {
    if (!this.permissions.has('config')) {
      return [];
    }
    return this.inner.options;
  }

  get settings(): Record<string, unknown> {
    if (!this.permissions.has('config')) {
      return {};
    }
    return this.inner.settings;
  }

  get parserOptions(): Record<string, unknown> {
    return this.inner.parserOptions;
  }

  get filename(): string {
    return this.inner.filename;
  }

  get cwd(): string {
    return this.inner.cwd;
  }

  getSourceCode(): SourceCode {
    if (!this.permissions.has('read-source') && !this.permissions.has('read-ast')) {
      throw new Error('Permission denied: read-source or read-ast required');
    }
    return this.inner.getSourceCode();
  }

  report(descriptor: Parameters<RuleContext['report']>[0]): void {
    if (!this.permissions.has('report')) {
      throw new Error('Permission denied: report required');
    }

    // Limit number of reports to prevent DoS
    if (this.reportCount >= this.maxReports) {
      return;
    }
    this.reportCount++;

    // Check fix permission
    if (descriptor.fix && !this.permissions.has('fix')) {
      const { fix, ...rest } = descriptor;
      this.inner.report(rest);
      return;
    }

    // Check suggest permission
    if (descriptor.suggest && !this.permissions.has('suggest')) {
      const { suggest, ...rest } = descriptor;
      this.inner.report(rest);
      return;
    }

    this.inner.report(descriptor);
  }

  getAncestors(): unknown[] {
    if (!this.permissions.has('read-ast')) {
      throw new Error('Permission denied: read-ast required');
    }
    return this.inner.getAncestors();
  }

  getDeclaredVariables(node: unknown): unknown[] {
    if (!this.permissions.has('read-ast')) {
      throw new Error('Permission denied: read-ast required');
    }
    return this.inner.getDeclaredVariables(node);
  }

  getScope(): unknown {
    if (!this.permissions.has('read-ast')) {
      throw new Error('Permission denied: read-ast required');
    }
    return this.inner.getScope();
  }

  markVariableAsUsed(name: string): boolean {
    return this.inner.markVariableAsUsed(name);
  }
}

/**
 * Plugin Sandbox
 * 
 * Executes plugin rules in a restricted environment.
 */
export class PluginSandbox {
  private options: SandboxOptions;

  constructor(options: Partial<SandboxOptions> = {}) {
    this.options = { ...DEFAULT_SANDBOX_OPTIONS, ...options };
  }

  /**
   * Execute a rule in the sandbox
   */
  executeRule(
    rule: PluginRule,
    context: RuleContext
  ): NodeVisitor {
    // Wrap context with permission checks
    const sandboxedContext = new SandboxedRuleContext(
      context,
      this.options.permissions
    );

    // Create the visitor with timeout protection
    const startTime = Date.now();
    
    try {
      const visitor = rule.create(sandboxedContext);

      // Wrap visitor methods with timeout check
      return this.wrapVisitor(visitor, startTime);
    } catch (error) {
      // Swallow errors from sandboxed plugins
      if (this.options.allowConsole) {
        console.error(`Plugin error in rule ${context.id}:`, error);
      }
      return {};
    }
  }

  /**
   * Validate plugin permissions
   */
  validatePermissions(
    requested: PluginPermission[],
    allowed: PluginPermission[]
  ): { valid: boolean; denied: PluginPermission[] } {
    const allowedSet = new Set(allowed);
    const denied: PluginPermission[] = [];

    for (const perm of requested) {
      if (!allowedSet.has(perm)) {
        denied.push(perm);
      }
    }

    return {
      valid: denied.length === 0,
      denied,
    };
  }

  /**
   * Create a sandboxed version of a plugin
   */
  sandboxPlugin(plugin: Plugin): Plugin {
    const sandboxedRules: Record<string, PluginRule> = {};

    for (const [name, rule] of Object.entries(plugin.rules)) {
      sandboxedRules[name] = this.sandboxRule(rule);
    }

    return {
      ...plugin,
      rules: sandboxedRules,
    };
  }

  /**
   * Create a sandboxed version of a rule
   */
  sandboxRule(rule: PluginRule): PluginRule {
    const sandbox = this;

    return {
      meta: { ...rule.meta },
      create(context: RuleContext): NodeVisitor {
        return sandbox.executeRule(rule, context);
      },
    };
  }

  private wrapVisitor(visitor: NodeVisitor, startTime: number): NodeVisitor {
    const wrapped: NodeVisitor = {};

    for (const [nodeType, handler] of Object.entries(visitor)) {
      if (typeof handler !== 'function') continue;

      wrapped[nodeType] = (node: unknown) => {
        // Check timeout
        if (Date.now() - startTime > this.options.timeoutMs) {
          throw new Error('Plugin execution timeout');
        }

        try {
          return handler(node);
        } catch (error) {
          if (this.options.allowConsole) {
            console.error(`Error in visitor ${nodeType}:`, error);
          }
          // Swallow visitor errors
        }
      };
    }

    return wrapped;
  }
}

/**
 * Create a plugin sandbox instance
 */
export function createPluginSandbox(options?: Partial<SandboxOptions>): PluginSandbox {
  return new PluginSandbox(options);
}

/**
 * Frozen global objects for sandboxed context
 * These can be used when creating truly isolated execution environments
 */
export const FROZEN_GLOBALS = Object.freeze({
  // Safe globals
  Array,
  Boolean,
  Date,
  Error,
  JSON,
  Map,
  Math,
  Number,
  Object,
  Promise,
  RegExp,
  Set,
  String,
  Symbol,
  WeakMap,
  WeakSet,
  
  // Type checking
  isNaN,
  isFinite,
  parseFloat,
  parseInt,
  
  // Encoding
  decodeURI,
  decodeURIComponent,
  encodeURI,
  encodeURIComponent,
});

/**
 * Blocked globals that should not be accessible in sandboxed plugins
 */
export const BLOCKED_GLOBALS = [
  'process',
  'require',
  'module',
  'exports',
  '__dirname',
  '__filename',
  'Buffer',
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'Worker',
  'SharedWorker',
  'Atomics',
  'SharedArrayBuffer',
  'eval',
  'Function',
] as const;
