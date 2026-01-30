/**
 * Truthpack Generator
 * 
 * Orchestrates the generation of truthpack files by running
 * scanners and consolidating results into verified ground truth.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { RouteScanner } from './scanners/route-scanner.js';
import { EnvScanner } from './scanners/env-scanner.js';
import { AuthScanner } from './scanners/auth-scanner.js';
import { ContractScanner } from './scanners/contract-scanner.js';
import { PerformanceTracker, getPerformanceTracker } from '../utils/performance.js';
import { IncrementalScanner } from './incremental-scanner.js';
import type { RouteDefinition } from './schemas/routes.schema.js';
import type { EnvVariable } from './schemas/env.schema.js';
import type { AuthConfig } from './schemas/auth.schema.js';
import type { ApiContract } from './schemas/contracts.schema.js';

export interface TruthpackConfig {
  projectRoot: string;
  outputDir: string;
  scanners: {
    routes: boolean;
    env: boolean;
    auth: boolean;
    contracts: boolean;
    uiGraph: boolean;
  };
  watchMode: boolean;
  watchDebounceMs: number;
  /** Enable incremental scanning (default: true) */
  incremental?: boolean;
}

export interface TruthpackResult {
  version: string;
  routes: RouteDefinition[];
  env: EnvVariable[];
  auth: Partial<AuthConfig>;
  contracts: ApiContract[];
  uiGraph?: unknown;
  generatedAt: Date;
  hash: string;
}

export interface TruthpackMeta {
  version: string;
  generatedAt: string;
  hash: string;
  scannerVersions: Record<string, string>;
  summary: {
    routes: number;
    envVars: number;
    authRules: number;
    contracts: number;
  };
}

export interface ValidationResult {
  valid: boolean;
  stale: boolean;
  drifts: DriftItem[];
  missing: DriftItem[];
  extra: DriftItem[];
}

export interface DriftItem {
  type: 'route' | 'env' | 'auth' | 'contract';
  identifier: string;
  expected?: unknown;
  actual?: unknown;
  message: string;
}

const DEFAULT_CONFIG: TruthpackConfig = {
  projectRoot: process.cwd(),
  outputDir: '.vibecheck/truthpack',
  scanners: {
    routes: true,
    env: true,
    auth: true,
    contracts: true,
    uiGraph: false,
  },
  watchMode: false,
  watchDebounceMs: 1000,
};

const VERSION = '1.0.0';

export interface GenerationTimings {
  routeScan?: number;
  envScan?: number;
  authScan?: number;
  contractScan?: number;
  hashComputation?: number;
  total?: number;
}

export class TruthpackGenerator {
  private config: TruthpackConfig;
  private routeScanner: RouteScanner;
  private envScanner: EnvScanner;
  private authScanner: AuthScanner;
  private contractScanner: ContractScanner;
  private watchAbortController: AbortController | null = null;
  private cachedResult: TruthpackResult | null = null;
  private performanceTracker: PerformanceTracker;
  private lastTimings: GenerationTimings = {};
  private incrementalScanner: IncrementalScanner | null = null;

  constructor(config: Partial<TruthpackConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, incremental: true, ...config };
    this.routeScanner = new RouteScanner(this.config.projectRoot);
    this.envScanner = new EnvScanner(this.config.projectRoot);
    this.authScanner = new AuthScanner(this.config.projectRoot);
    this.contractScanner = new ContractScanner(this.config.projectRoot);
    this.performanceTracker = getPerformanceTracker();
    
    if (this.config.incremental) {
      this.incrementalScanner = new IncrementalScanner(this.config.projectRoot);
    }
  }

  /**
   * Get last generation timings
   */
  getLastTimings(): GenerationTimings {
    return { ...this.lastTimings };
  }

  /**
   * Get the output directory path
   */
  getOutputDir(): string {
    return path.isAbsolute(this.config.outputDir)
      ? this.config.outputDir
      : path.join(this.config.projectRoot, this.config.outputDir);
  }

  /**
   * Generate complete truthpack
   */
  async generate(): Promise<TruthpackResult> {
    const generateStart = Date.now();
    const timings: GenerationTimings = {};
    
    const result: TruthpackResult = {
      version: VERSION,
      routes: [],
      env: [],
      auth: {},
      contracts: [],
      generatedAt: new Date(),
      hash: '',
    };

    // Run scanners in parallel for performance, tracking timing
    const scanPromises: Promise<void>[] = [];

    if (this.config.scanners.routes) {
      scanPromises.push(
        this.performanceTracker.time('truthpack.scan.routes', async () => {
          const routes = await this.routeScanner.scan();
          result.routes = routes;
        }).then(timing => {
          timings.routeScan = timing.durationMs;
        })
      );
    }

    if (this.config.scanners.env) {
      scanPromises.push(
        this.performanceTracker.time('truthpack.scan.env', async () => {
          const env = await this.envScanner.scan();
          result.env = env;
        }).then(timing => {
          timings.envScan = timing.durationMs;
        })
      );
    }

    if (this.config.scanners.auth) {
      scanPromises.push(
        this.performanceTracker.time('truthpack.scan.auth', async () => {
          const auth = await this.authScanner.scan();
          result.auth = auth;
        }).then(timing => {
          timings.authScan = timing.durationMs;
        })
      );
    }

    if (this.config.scanners.contracts) {
      scanPromises.push(
        this.performanceTracker.time('truthpack.scan.contracts', async () => {
          const contracts = await this.contractScanner.scan();
          result.contracts = contracts;
        }).then(timing => {
          timings.contractScan = timing.durationMs;
        })
      );
    }

    await Promise.all(scanPromises);

    // Compute hash with timing
    const hashTiming = await this.performanceTracker.time('truthpack.hash', async () => {
      result.hash = this.computeHash(result);
    });
    timings.hashComputation = hashTiming.durationMs;
    
    timings.total = Date.now() - generateStart;
    this.lastTimings = timings;
    this.cachedResult = result;

    return result;
  }

  /**
   * Load existing truthpack from disk (for incremental updates)
   */
  async loadExisting(): Promise<TruthpackResult | null> {
    try {
      return await this.load();
    } catch {
      return null;
    }
  }

  /**
   * Generate and save to disk
   */
  async generateAndSave(): Promise<string> {
    // Try incremental update if enabled and existing truthpack exists
    if (this.config.incremental && this.incrementalScanner) {
      const existing = await this.loadExisting();
      if (existing) {
        // Check if we can do incremental update
        // For now, always do full scan, but cache individual file results
        // Future: implement true incremental merge
      }
    }
    
    const result = await this.generate();
    const outputDir = this.getOutputDir();

    // Ensure output directory exists
    await fs.mkdir(outputDir, { recursive: true });

    // Save individual truthpack files
    const savePromises: Promise<void>[] = [];

    // Routes
    if (this.config.scanners.routes) {
      savePromises.push(
        fs.writeFile(
          path.join(outputDir, 'routes.json'),
          JSON.stringify({
            version: VERSION,
            generatedAt: result.generatedAt.toISOString(),
            routes: result.routes,
            summary: {
              totalRoutes: result.routes.length,
              byMethod: this.countByMethod(result.routes),
              protectedRoutes: result.routes.filter(r => r.auth?.required).length,
              publicRoutes: result.routes.filter(r => !r.auth?.required).length,
            },
          }, null, 2)
        )
      );
    }

    // Environment variables
    if (this.config.scanners.env) {
      savePromises.push(
        fs.writeFile(
          path.join(outputDir, 'env.json'),
          JSON.stringify({
            version: VERSION,
            generatedAt: result.generatedAt.toISOString(),
            variables: result.env,
            summary: {
              totalVariables: result.env.length,
              required: result.env.filter(e => e.required).length,
              optional: result.env.filter(e => !e.required).length,
              sensitive: result.env.filter(e => e.sensitive).length,
            },
          }, null, 2)
        )
      );
    }

    // Auth configuration
    if (this.config.scanners.auth) {
      savePromises.push(
        fs.writeFile(
          path.join(outputDir, 'auth.json'),
          JSON.stringify({
            version: VERSION,
            generatedAt: result.generatedAt.toISOString(),
            ...result.auth,
            summary: {
              totalRoles: result.auth.roles?.length ?? 0,
              protectedEndpoints: result.auth.protectedResources?.length ?? 0,
              publicEndpoints: result.auth.publicPaths?.length ?? 0,
              providers: result.auth.providers?.length ?? 0,
            },
          }, null, 2)
        )
      );
    }

    // Contracts
    if (this.config.scanners.contracts) {
      savePromises.push(
        fs.writeFile(
          path.join(outputDir, 'contracts.json'),
          JSON.stringify({
            version: VERSION,
            generatedAt: result.generatedAt.toISOString(),
            contracts: result.contracts,
            summary: {
              totalContracts: result.contracts.length,
              byMethod: this.countContractsByMethod(result.contracts),
            },
          }, null, 2)
        )
      );
    }

    // Save meta file
    const meta: TruthpackMeta = {
      version: VERSION,
      generatedAt: result.generatedAt.toISOString(),
      hash: result.hash,
      scannerVersions: {
        routes: '1.0.0',
        env: '1.0.0',
        auth: '1.0.0',
        contracts: '1.0.0',
      },
      summary: {
        routes: result.routes.length,
        envVars: result.env.length,
        authRules: result.auth.protectedResources?.length ?? 0,
        contracts: result.contracts.length,
      },
    };

    savePromises.push(
      fs.writeFile(
        path.join(outputDir, 'meta.json'),
        JSON.stringify(meta, null, 2)
      )
    );

    await Promise.all(savePromises);

    return outputDir;
  }

  /**
   * Load existing truthpack from disk
   */
  async load(): Promise<TruthpackResult | null> {
    const outputDir = this.getOutputDir();

    try {
      const [routesData, envData, authData, contractsData, metaData] = await Promise.all([
        fs.readFile(path.join(outputDir, 'routes.json'), 'utf-8').catch(() => '{"routes":[]}'),
        fs.readFile(path.join(outputDir, 'env.json'), 'utf-8').catch(() => '{"variables":[]}'),
        fs.readFile(path.join(outputDir, 'auth.json'), 'utf-8').catch(() => '{}'),
        fs.readFile(path.join(outputDir, 'contracts.json'), 'utf-8').catch(() => '{"contracts":[]}'),
        fs.readFile(path.join(outputDir, 'meta.json'), 'utf-8').catch(() => '{}'),
      ]);

      const routes = JSON.parse(routesData);
      const env = JSON.parse(envData);
      const auth = JSON.parse(authData);
      const contracts = JSON.parse(contractsData);
      const meta = JSON.parse(metaData);

      return {
        version: meta.version || VERSION,
        routes: routes.routes || [],
        env: env.variables || [],
        auth,
        contracts: contracts.contracts || [],
        generatedAt: new Date(meta.generatedAt || Date.now()),
        hash: meta.hash || '',
      };
    } catch {
      return null;
    }
  }

  /**
   * Start watch mode for incremental updates
   */
  async watch(onChange: (result: TruthpackResult) => void): Promise<() => void> {
    this.watchAbortController = new AbortController();
    const { signal } = this.watchAbortController;

    // Patterns to watch
    const watchPatterns = [
      '**/*.ts', '**/*.js', '**/*.tsx', '**/*.jsx',
      '**/.env', '**/.env.*',
      '**/openapi.yaml', '**/openapi.json',
    ];

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let isGenerating = false;

    const triggerRegenerate = async () => {
      if (isGenerating || signal.aborted) return;

      isGenerating = true;
      try {
        const result = await this.generate();
        
        // Check if hash changed (actual content change)
        if (this.cachedResult && this.cachedResult.hash !== result.hash) {
          await this.generateAndSave();
          onChange(result);
        } else if (!this.cachedResult) {
          await this.generateAndSave();
          onChange(result);
        }
      } catch (error) {
        // Log error but don't crash watch mode
        console.error('Truthpack generation error:', error);
      } finally {
        isGenerating = false;
      }
    };

    const debouncedTrigger = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(triggerRegenerate, this.config.watchDebounceMs);
    };

    // Initial generation
    await triggerRegenerate();

    // Set up file watching using fs.watch (native Node.js)
    const watchers: fs.FileHandle[] = [];
    
    // Watch the project root recursively
    const setupWatch = async () => {
      try {
        const watcher = fs.watch(this.config.projectRoot, { 
          recursive: true,
          signal,
        });

        for await (const event of watcher) {
          if (signal.aborted) break;
          
          // Filter by relevant file types
          const filename = event.filename || '';
          const isRelevant = 
            filename.endsWith('.ts') ||
            filename.endsWith('.js') ||
            filename.endsWith('.tsx') ||
            filename.endsWith('.jsx') ||
            filename.includes('.env') ||
            filename.includes('openapi') ||
            filename.includes('swagger');

          if (isRelevant && !filename.includes('node_modules') && !filename.includes('.vibecheck')) {
            debouncedTrigger();
          }
        }
      } catch (error) {
        if (!signal.aborted) {
          console.error('Watch error:', error);
        }
      }
    };

    // Start watching (don't await - runs in background)
    setupWatch();

    // Return stop function
    return () => {
      this.watchAbortController?.abort();
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }

  /**
   * Stop watching
   */
  stopWatch(): void {
    this.watchAbortController?.abort();
    this.watchAbortController = null;
  }

  /**
   * Validate existing truthpack against current codebase
   */
  async validate(existingTruthpack?: TruthpackResult): Promise<ValidationResult> {
    const truthpack = existingTruthpack || await this.load();
    
    if (!truthpack) {
      return {
        valid: false,
        stale: true,
        drifts: [],
        missing: [{
          type: 'route',
          identifier: '*',
          message: 'No truthpack found. Run `vibecheck truth` to generate.',
        }],
        extra: [],
      };
    }

    // Generate fresh data to compare
    const current = await this.generate();
    
    const drifts: DriftItem[] = [];
    const missing: DriftItem[] = [];
    const extra: DriftItem[] = [];

    // Compare routes
    const currentRouteKeys = new Set(current.routes.map(r => `${r.method}:${r.path}`));
    const truthpackRouteKeys = new Set(truthpack.routes.map(r => `${r.method}:${r.path}`));

    for (const route of current.routes) {
      const key = `${route.method}:${route.path}`;
      if (!truthpackRouteKeys.has(key)) {
        missing.push({
          type: 'route',
          identifier: key,
          actual: route,
          message: `Route ${key} exists in codebase but not in truthpack`,
        });
      }
    }

    for (const route of truthpack.routes) {
      const key = `${route.method}:${route.path}`;
      if (!currentRouteKeys.has(key)) {
        extra.push({
          type: 'route',
          identifier: key,
          expected: route,
          message: `Route ${key} in truthpack but not found in codebase`,
        });
      }
    }

    // Compare env vars
    const currentEnvKeys = new Set(current.env.map(e => e.name));
    const truthpackEnvKeys = new Set(truthpack.env.map(e => e.name));

    for (const envVar of current.env) {
      if (!truthpackEnvKeys.has(envVar.name)) {
        missing.push({
          type: 'env',
          identifier: envVar.name,
          actual: envVar,
          message: `Env var ${envVar.name} used in codebase but not in truthpack`,
        });
      }
    }

    for (const envVar of truthpack.env) {
      if (!currentEnvKeys.has(envVar.name)) {
        extra.push({
          type: 'env',
          identifier: envVar.name,
          expected: envVar,
          message: `Env var ${envVar.name} in truthpack but not used in codebase`,
        });
      }
    }

    // Check if truthpack is stale (hash mismatch)
    const isStale = truthpack.hash !== current.hash;

    return {
      valid: drifts.length === 0 && missing.length === 0 && extra.length === 0,
      stale: isStale,
      drifts,
      missing,
      extra,
    };
  }

  /**
   * Compute SHA-256 hash of truthpack content
   */
  private computeHash(result: Omit<TruthpackResult, 'hash' | 'generatedAt'>): string {
    const content = JSON.stringify({
      routes: result.routes,
      env: result.env,
      auth: result.auth,
      contracts: result.contracts,
    }, null, 0); // No formatting for consistent hash

    return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
  }

  /**
   * Count routes by HTTP method
   */
  private countByMethod(routes: RouteDefinition[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const route of routes) {
      counts[route.method] = (counts[route.method] || 0) + 1;
    }
    return counts;
  }

  /**
   * Count contracts by HTTP method
   */
  private countContractsByMethod(contracts: ApiContract[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const contract of contracts) {
      if (contract.method) {
        counts[contract.method] = (counts[contract.method] || 0) + 1;
      }
    }
    return counts;
  }

  /**
   * Get cached result (if available)
   */
  getCachedResult(): TruthpackResult | null {
    return this.cachedResult;
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cachedResult = null;
  }
}
