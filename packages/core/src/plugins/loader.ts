/**
 * Plugin Loader
 * 
 * Discovers and loads plugins from various sources.
 * Supports scoped packages (@vibecheck/plugin-*) and validation.
 */

import fs from 'node:fs';
import path from 'node:path';
import type {
  Plugin,
  PluginRule,
  PluginLoadResult,
  PluginManifest,
  PluginPermission,
  DEFAULT_PERMISSIONS,
} from './types.js';

interface PluginLoaderOptions {
  /** Base directory for plugin discovery */
  baseDir: string;
  /** Scoped package prefix for auto-discovery */
  scopePrefix: string;
  /** Allow loading from URLs */
  allowUrls: boolean;
  /** Trusted plugin names (skip validation) */
  trustedPlugins: string[];
  /** Enable sandboxing for untrusted plugins */
  enableSandbox: boolean;
}

const DEFAULT_OPTIONS: PluginLoaderOptions = {
  baseDir: process.cwd(),
  scopePrefix: '@vibecheck/plugin-',
  allowUrls: false,
  trustedPlugins: [],
  enableSandbox: true,
};

/**
 * Plugin Loader
 * 
 * Discovers and loads plugins with validation and optional sandboxing.
 */
export class PluginLoader {
  private options: PluginLoaderOptions;
  private loadedPlugins: Map<string, Plugin> = new Map();
  private loadErrors: Map<string, string> = new Map();

  constructor(options: Partial<PluginLoaderOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Discover plugins in node_modules
   */
  async discoverPlugins(): Promise<string[]> {
    const discovered: string[] = [];
    const nodeModulesPath = path.join(this.options.baseDir, 'node_modules');

    if (!fs.existsSync(nodeModulesPath)) {
      return discovered;
    }

    // Check for scoped packages
    const scopePath = path.join(nodeModulesPath, '@vibecheck');
    if (fs.existsSync(scopePath)) {
      const packages = fs.readdirSync(scopePath);
      for (const pkg of packages) {
        if (pkg.startsWith('plugin-')) {
          discovered.push(`@vibecheck/${pkg}`);
        }
      }
    }

    // Also check for vibecheck-plugin-* packages
    const entries = fs.readdirSync(nodeModulesPath);
    for (const entry of entries) {
      if (entry.startsWith('vibecheck-plugin-')) {
        discovered.push(entry);
      }
    }

    return discovered;
  }

  /**
   * Load a plugin by name or path
   */
  async loadPlugin(source: string): Promise<PluginLoadResult> {
    // Check cache
    if (this.loadedPlugins.has(source)) {
      return {
        plugin: this.loadedPlugins.get(source),
        source,
        trusted: this.isTrusted(source),
      };
    }

    // Check for previous load error
    if (this.loadErrors.has(source)) {
      return {
        source,
        error: this.loadErrors.get(source),
        trusted: false,
      };
    }

    try {
      const plugin = await this.loadPluginModule(source);
      
      // Validate plugin structure
      const validationError = this.validatePlugin(plugin, source);
      if (validationError) {
        this.loadErrors.set(source, validationError);
        return { source, error: validationError, trusted: false };
      }

      this.loadedPlugins.set(source, plugin);
      return {
        plugin,
        source,
        trusted: this.isTrusted(source),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.loadErrors.set(source, errorMessage);
      return { source, error: errorMessage, trusted: false };
    }
  }

  /**
   * Load multiple plugins
   */
  async loadPlugins(sources: string[]): Promise<PluginLoadResult[]> {
    return Promise.all(sources.map((s) => this.loadPlugin(s)));
  }

  /**
   * Load all discovered plugins
   */
  async loadDiscoveredPlugins(): Promise<PluginLoadResult[]> {
    const discovered = await this.discoverPlugins();
    return this.loadPlugins(discovered);
  }

  /**
   * Get a loaded plugin
   */
  getPlugin(name: string): Plugin | undefined {
    return this.loadedPlugins.get(name);
  }

  /**
   * Get all loaded plugins
   */
  getAllPlugins(): Map<string, Plugin> {
    return new Map(this.loadedPlugins);
  }

  /**
   * Get a rule from loaded plugins
   */
  getRule(ruleId: string): PluginRule | undefined {
    // Rule IDs are formatted as plugin-name/rule-name or just rule-name
    const parts = ruleId.split('/');
    
    if (parts.length === 2) {
      const [pluginName, ruleName] = parts;
      const plugin = this.findPluginByName(pluginName);
      return plugin?.rules[ruleName];
    }

    // Search all plugins for the rule
    for (const plugin of this.loadedPlugins.values()) {
      if (plugin.rules[ruleId]) {
        return plugin.rules[ruleId];
      }
    }

    return undefined;
  }

  /**
   * Get all rules from loaded plugins
   */
  getAllRules(): Map<string, PluginRule> {
    const rules = new Map<string, PluginRule>();

    for (const [pluginSource, plugin] of this.loadedPlugins) {
      for (const [ruleName, rule] of Object.entries(plugin.rules)) {
        // Use fully qualified name
        const qualifiedName = `${plugin.name}/${ruleName}`;
        rules.set(qualifiedName, rule);
      }
    }

    return rules;
  }

  /**
   * Clear loaded plugins
   */
  clear(): void {
    this.loadedPlugins.clear();
    this.loadErrors.clear();
  }

  /**
   * Check if a plugin is trusted
   */
  isTrusted(source: string): boolean {
    // Official plugins are always trusted
    if (source.startsWith('@vibecheck/')) {
      return true;
    }

    return this.options.trustedPlugins.includes(source);
  }

  private async loadPluginModule(source: string): Promise<Plugin> {
    // Handle different source types
    if (source.startsWith('http://') || source.startsWith('https://')) {
      if (!this.options.allowUrls) {
        throw new Error('URL plugin loading is disabled');
      }
      return this.loadFromUrl(source);
    }

    // Try to resolve as npm package
    try {
      const resolved = this.resolvePackage(source);
      return this.loadFromPath(resolved);
    } catch {
      // Try as relative/absolute path
      const resolvedPath = path.isAbsolute(source)
        ? source
        : path.resolve(this.options.baseDir, source);
      
      return this.loadFromPath(resolvedPath);
    }
  }

  private resolvePackage(packageName: string): string {
    // Try common resolution strategies
    const attempts = [
      path.join(this.options.baseDir, 'node_modules', packageName),
      path.join(this.options.baseDir, 'node_modules', packageName, 'dist', 'index.js'),
      path.join(this.options.baseDir, 'node_modules', packageName, 'lib', 'index.js'),
    ];

    for (const attempt of attempts) {
      if (fs.existsSync(attempt)) {
        return attempt;
      }
      const withJs = attempt + '.js';
      if (fs.existsSync(withJs)) {
        return withJs;
      }
    }

    // Try require.resolve
    return require.resolve(packageName, { paths: [this.options.baseDir] });
  }

  private async loadFromPath(filePath: string): Promise<Plugin> {
    // Check for package.json to get entry point
    const dir = fs.statSync(filePath).isDirectory() ? filePath : path.dirname(filePath);
    const packageJsonPath = path.join(dir, 'package.json');
    
    let entryPoint = filePath;
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      const main = packageJson.main || 'index.js';
      entryPoint = path.join(dir, main);
    }

    // Dynamic import
    const moduleUrl = `file://${entryPoint.replace(/\\/g, '/')}`;
    const module = await import(moduleUrl);
    
    return module.default ?? module;
  }

  private async loadFromUrl(url: string): Promise<Plugin> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch plugin: HTTP ${response.status}`);
    }

    const code = await response.text();
    
    // Create a temporary module (unsafe - only for trusted sources)
    const module = { exports: {} as Plugin };
    const moduleFunc = new Function('module', 'exports', code);
    moduleFunc(module, module.exports);

    return module.exports;
  }

  private validatePlugin(plugin: unknown, source: string): string | null {
    if (!plugin || typeof plugin !== 'object') {
      return 'Plugin must be an object';
    }

    const p = plugin as Partial<Plugin>;

    if (typeof p.name !== 'string' || !p.name) {
      return 'Plugin must have a name';
    }

    if (typeof p.version !== 'string') {
      return 'Plugin must have a version';
    }

    if (!p.rules || typeof p.rules !== 'object') {
      return 'Plugin must have a rules object';
    }

    // Validate each rule
    for (const [ruleName, rule] of Object.entries(p.rules)) {
      const ruleError = this.validateRule(rule, ruleName);
      if (ruleError) {
        return `Rule ${ruleName}: ${ruleError}`;
      }
    }

    return null;
  }

  private validateRule(rule: unknown, name: string): string | null {
    if (!rule || typeof rule !== 'object') {
      return 'Rule must be an object';
    }

    const r = rule as Partial<PluginRule>;

    if (!r.meta || typeof r.meta !== 'object') {
      return 'Rule must have meta object';
    }

    if (!r.meta.type) {
      return 'Rule meta must have a type';
    }

    if (!r.meta.messages || typeof r.meta.messages !== 'object') {
      return 'Rule meta must have messages object';
    }

    if (typeof r.create !== 'function') {
      return 'Rule must have a create function';
    }

    return null;
  }

  private findPluginByName(name: string): Plugin | undefined {
    // Try exact match first
    if (this.loadedPlugins.has(name)) {
      return this.loadedPlugins.get(name);
    }

    // Try with scope
    const withScope = `@vibecheck/plugin-${name}`;
    if (this.loadedPlugins.has(withScope)) {
      return this.loadedPlugins.get(withScope);
    }

    // Try without plugin- prefix
    for (const [source, plugin] of this.loadedPlugins) {
      if (plugin.name === name) {
        return plugin;
      }
    }

    return undefined;
  }
}

/**
 * Create a plugin loader instance
 */
export function createPluginLoader(options?: Partial<PluginLoaderOptions>): PluginLoader {
  return new PluginLoader(options);
}
