/**
 * Plugin System
 * 
 * ESLint-style plugin architecture with security sandboxing.
 */

export * from './types.js';
export { PluginLoader, createPluginLoader } from './loader.js';
export {
  PluginSandbox,
  createPluginSandbox,
  FROZEN_GLOBALS,
  BLOCKED_GLOBALS,
} from './sandbox.js';

import { PluginLoader, createPluginLoader } from './loader.js';
import { PluginSandbox, createPluginSandbox } from './sandbox.js';
import type {
  Plugin,
  PluginRule,
  PluginConfig,
  PluginLoadResult,
  RuleContext,
  NodeVisitor,
  SourceCode,
  ReportDescriptor,
  RuleFixer,
  Fix,
  PluginPermission,
} from './types.js';

interface PluginManagerOptions {
  /** Base directory */
  baseDir?: string;
  /** Trusted plugins (skip sandboxing) */
  trustedPlugins?: string[];
  /** Enable auto-discovery */
  autoDiscover?: boolean;
  /** Enable sandboxing */
  enableSandbox?: boolean;
  /** Default permissions */
  defaultPermissions?: PluginPermission[];
}

/**
 * Plugin Manager
 * 
 * High-level interface for plugin loading and execution.
 */
export class PluginManager {
  private loader: PluginLoader;
  private sandbox: PluginSandbox;
  private options: PluginManagerOptions;
  private initialized = false;

  constructor(options: PluginManagerOptions = {}) {
    this.options = {
      autoDiscover: true,
      enableSandbox: true,
      defaultPermissions: ['read-ast', 'read-source', 'report', 'config'],
      ...options,
    };

    this.loader = createPluginLoader({
      baseDir: options.baseDir,
      trustedPlugins: options.trustedPlugins ?? [],
      enableSandbox: options.enableSandbox ?? true,
    });

    this.sandbox = createPluginSandbox({
      permissions: this.options.defaultPermissions,
    });
  }

  /**
   * Initialize and load plugins
   */
  async initialize(): Promise<PluginLoadResult[]> {
    if (this.initialized) {
      return Array.from(this.loader.getAllPlugins().entries()).map(([source, plugin]) => ({
        plugin,
        source,
        trusted: this.loader.isTrusted(source),
      }));
    }

    const results: PluginLoadResult[] = [];

    if (this.options.autoDiscover) {
      const discovered = await this.loader.loadDiscoveredPlugins();
      results.push(...discovered);
    }

    this.initialized = true;
    return results;
  }

  /**
   * Load a specific plugin
   */
  async loadPlugin(source: string): Promise<PluginLoadResult> {
    return this.loader.loadPlugin(source);
  }

  /**
   * Get a plugin by name
   */
  getPlugin(name: string): Plugin | undefined {
    return this.loader.getPlugin(name);
  }

  /**
   * Get all loaded plugins
   */
  getAllPlugins(): Map<string, Plugin> {
    return this.loader.getAllPlugins();
  }

  /**
   * Get a rule by ID (plugin/rule or just rule)
   */
  getRule(ruleId: string): PluginRule | undefined {
    return this.loader.getRule(ruleId);
  }

  /**
   * Get all rules from all plugins
   */
  getAllRules(): Map<string, PluginRule> {
    return this.loader.getAllRules();
  }

  /**
   * Execute a rule on source code
   */
  executeRule(
    ruleId: string,
    context: RuleContext
  ): NodeVisitor | undefined {
    const rule = this.getRule(ruleId);
    if (!rule) return undefined;

    // Check if plugin is trusted
    const pluginName = ruleId.includes('/') ? ruleId.split('/')[0] : undefined;
    const isTrusted = pluginName ? this.loader.isTrusted(pluginName) : false;

    // Execute with or without sandbox
    if (this.options.enableSandbox && !isTrusted) {
      return this.sandbox.executeRule(rule, context);
    }

    return rule.create(context);
  }

  /**
   * Create a rule context
   */
  createContext(options: {
    ruleId: string;
    filename: string;
    sourceCode: SourceCode;
    settings?: Record<string, unknown>;
    ruleOptions?: unknown[];
    onReport: (descriptor: ReportDescriptor) => void;
  }): RuleContext {
    return {
      id: options.ruleId,
      options: options.ruleOptions ?? [],
      settings: options.settings ?? {},
      parserOptions: {},
      filename: options.filename,
      cwd: this.options.baseDir ?? process.cwd(),
      getSourceCode: () => options.sourceCode,
      report: options.onReport,
      getAncestors: () => [],
      getDeclaredVariables: () => [],
      getScope: () => ({}),
      markVariableAsUsed: () => true,
    };
  }

  /**
   * Create a fixer helper
   */
  createFixer(sourceCode: SourceCode): RuleFixer {
    return {
      insertTextAfter(nodeOrToken: { range?: [number, number] }, text: string): Fix {
        const range = nodeOrToken.range ?? [0, 0];
        return { range: [range[1], range[1]], text };
      },
      insertTextAfterRange(range: [number, number], text: string): Fix {
        return { range: [range[1], range[1]], text };
      },
      insertTextBefore(nodeOrToken: { range?: [number, number] }, text: string): Fix {
        const range = nodeOrToken.range ?? [0, 0];
        return { range: [range[0], range[0]], text };
      },
      insertTextBeforeRange(range: [number, number], text: string): Fix {
        return { range: [range[0], range[0]], text };
      },
      remove(nodeOrToken: { range?: [number, number] }): Fix {
        const range = nodeOrToken.range ?? [0, 0];
        return { range, text: '' };
      },
      removeRange(range: [number, number]): Fix {
        return { range, text: '' };
      },
      replaceText(nodeOrToken: { range?: [number, number] }, text: string): Fix {
        const range = nodeOrToken.range ?? [0, 0];
        return { range, text };
      },
      replaceTextRange(range: [number, number], text: string): Fix {
        return { range, text };
      },
    };
  }

  /**
   * Register a built-in rule
   */
  registerBuiltinRule(pluginName: string, ruleName: string, rule: PluginRule): void {
    let plugin = this.loader.getPlugin(pluginName);
    
    if (!plugin) {
      // Create a new plugin for built-in rules
      plugin = {
        name: pluginName,
        version: '1.0.0',
        rules: {},
        meta: { official: true },
      };
    }

    plugin.rules[ruleName] = rule;
  }

  /**
   * Clear all loaded plugins
   */
  clear(): void {
    this.loader.clear();
    this.initialized = false;
  }
}

// Global plugin manager instance
let globalManager: PluginManager | null = null;

/**
 * Get or create the global plugin manager
 */
export function getPluginManager(options?: PluginManagerOptions): PluginManager {
  if (!globalManager) {
    globalManager = new PluginManager(options);
  }
  return globalManager;
}

/**
 * Create a new plugin manager instance
 */
export function createPluginManager(options?: PluginManagerOptions): PluginManager {
  return new PluginManager(options);
}

/**
 * Reset the global plugin manager
 */
export function resetPluginManager(): void {
  if (globalManager) {
    globalManager.clear();
    globalManager = null;
  }
}

/**
 * Define a plugin (helper for plugin authors)
 */
export function definePlugin(plugin: Plugin): Plugin {
  return plugin;
}

/**
 * Define a rule (helper for plugin authors)
 */
export function defineRule(rule: PluginRule): PluginRule {
  return rule;
}
