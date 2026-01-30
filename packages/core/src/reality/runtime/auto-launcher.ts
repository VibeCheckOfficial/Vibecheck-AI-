/**
 * Auto Launcher for Reality Mode (Enhanced Production Edition)
 * 
 * Improvements over base version:
 * - Structured error diagnostics with error codes
 * - Health check endpoint detection (not just port)
 * - Framework-specific readiness detection
 * - Smarter retry logic with exponential backoff
 * - Proper process tree cleanup (kills child processes)
 * - AbortController support for cancellation
 * - Better monorepo package detection
 * - Output streaming with log rotation
 * - Graceful degradation strategies
 */

import { spawn, type ChildProcess, exec, execSync } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as net from 'net';
import * as http from 'http';
import * as https from 'https';
import { EventEmitter } from 'events';

const execAsync = promisify(exec);

// ============================================================================
// Types
// ============================================================================

export interface ProjectInfo {
  type: ProjectType;
  packageManager: PackageManager;
  startCommand: string;
  allStartCommands: string[];
  expectedPort: number | null;
  framework?: string;
  packageJsonPath: string;
  monorepo?: MonorepoInfo;
  mainEntry?: string;
  /** Detected health check endpoints */
  healthEndpoints: string[];
  /** Framework-specific ready patterns in stdout */
  readyPatterns: RegExp[];
  /** Environment variables needed */
  requiredEnv: string[];
}

export interface MonorepoInfo {
  type: 'turborepo' | 'lerna' | 'nx' | 'pnpm-workspaces' | 'npm-workspaces';
  rootPath: string;
  packages: string[];
  /** Best package to run for web app */
  webPackage?: string;
}

export type ProjectType = 
  | 'nextjs'
  | 'react-cra'
  | 'react-vite'
  | 'vue-vite'
  | 'vue-cli'
  | 'nuxt'
  | 'express'
  | 'fastify'
  | 'nestjs'
  | 'hono'
  | 'koa'
  | 'remix'
  | 'astro'
  | 'sveltekit'
  | 'angular'
  | 'gatsby'
  | 'eleventy'
  | 'docusaurus'
  | 'vitepress'
  | 'node-vanilla'
  | 'unknown';

export type PackageManager = 'npm' | 'yarn' | 'pnpm' | 'bun';

export enum LaunchErrorCode {
  PROJECT_NOT_FOUND = 'PROJECT_NOT_FOUND',
  PACKAGE_JSON_INVALID = 'PACKAGE_JSON_INVALID',
  DEPENDENCY_INSTALL_FAILED = 'DEPENDENCY_INSTALL_FAILED',
  NO_START_SCRIPT = 'NO_START_SCRIPT',
  PORT_UNAVAILABLE = 'PORT_UNAVAILABLE',
  SERVER_CRASHED = 'SERVER_CRASHED',
  SERVER_TIMEOUT = 'SERVER_TIMEOUT',
  HEALTH_CHECK_FAILED = 'HEALTH_CHECK_FAILED',
  CANCELLED = 'CANCELLED',
  UNKNOWN = 'UNKNOWN',
}

export interface LaunchError {
  code: LaunchErrorCode;
  message: string;
  details?: string;
  command?: string;
  output?: string[];
  suggestion?: string;
}

export interface LaunchResult {
  success: boolean;
  baseUrl: string;
  port: number;
  process: ChildProcess | null;
  projectInfo: ProjectInfo;
  error?: LaunchError;
  cleanup: () => Promise<void>;
  successfulCommand?: string;
  startedByUs: boolean;
  /** Time to ready in ms */
  startupTime?: number;
  /** Logs from server startup */
  logs: ServerLog[];
}

export interface ServerLog {
  timestamp: Date;
  stream: 'stdout' | 'stderr';
  message: string;
}

export interface AutoLaunchOptions {
  projectRoot: string;
  preferredPort?: number;
  startupTimeout?: number;
  skipIfRunning?: boolean;
  env?: Record<string, string>;
  verbose?: boolean;
  autoInstall?: boolean;
  maxAttempts?: number;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
  /** Custom health check path */
  healthCheckPath?: string;
  /** Callback for log streaming */
  onLog?: (log: ServerLog) => void;
  /** Whether to run health checks */
  healthCheck?: boolean;
  /** Retry strategy */
  retryStrategy?: 'linear' | 'exponential';
}

// ============================================================================
// Constants
// ============================================================================

const COMMON_PORTS = [
  3000, 3001, 3002, 3003,
  5173, 5174, 5175,
  8080, 8081, 8000, 8888,
  4200, 4000, 4001,
  9000, 9001, 1234, 8443,
];

const DEFAULT_STARTUP_TIMEOUT = 120000; // 2 minutes
const DEFAULT_MAX_ATTEMPTS = 5;
const MAX_LOGS = 1000; // Rotate logs after this many

/** Health check endpoints by framework */
const HEALTH_ENDPOINTS: Record<string, string[]> = {
  nextjs: ['/', '/api/health', '/_next/static'],
  nuxt: ['/', '/api/health', '/_nuxt'],
  remix: ['/', '/healthcheck'],
  express: ['/', '/health', '/api/health', '/healthz'],
  fastify: ['/', '/health', '/healthz'],
  nestjs: ['/', '/health', '/api/health'],
  'react-vite': ['/', '/index.html'],
  'vue-vite': ['/', '/index.html'],
  astro: ['/', '/index.html'],
  default: ['/', '/health', '/healthz', '/api/health'],
};

/** Framework-specific "ready" patterns in stdout/stderr */
const READY_PATTERNS: Record<string, RegExp[]> = {
  nextjs: [
    /ready started server/i,
    /Local:\s+http/i,
    /started server on/i,
    /▲ Next\.js/i,
  ],
  vite: [
    /VITE.*ready/i,
    /Local:\s+http/i,
    /➜\s+Local:/i,
  ],
  nuxt: [
    /Listening on/i,
    /Local:\s+http/i,
    /Nuxt.*ready/i,
  ],
  remix: [
    /Express server listening/i,
    /Remix App Server started/i,
  ],
  express: [
    /listening on port/i,
    /server started/i,
    /server running/i,
  ],
  nestjs: [
    /Nest application successfully started/i,
    /Listening at/i,
  ],
  angular: [
    /Compiled successfully/i,
    /Angular Live Development Server/i,
  ],
  default: [
    /listening on/i,
    /server started/i,
    /ready/i,
    /Local:\s+http/i,
  ],
};

const WEBAPP_SUBDIRS = [
  'frontend', 'front-end', 'client', 'web', 'webapp', 'web-app',
  'app', 'ui', 'site', 'www', 'public',
  'apps/web', 'apps/frontend', 'apps/client', 'apps/app', 'apps/site',
  'packages/web', 'packages/frontend', 'packages/client', 'packages/app', 'packages/ui',
  'apps/nextjs', 'apps/next', 'apps/remix', 'apps/nuxt', 'apps/vite',
  'services/web', 'services/frontend', 'services/ui',
  'src/web', 'src/frontend', 'src/client',
];

const FRAMEWORK_PATTERNS: Array<{
  name: string;
  deps: string[];
  type: ProjectType;
  defaultPort: number;
  startCommands: string[];
  portEnvVar?: string;
  healthEndpoints?: string[];
  readyPatterns?: RegExp[];
}> = [
  // Meta-frameworks
  { 
    name: 'nextjs',
    deps: ['next'],
    type: 'nextjs',
    defaultPort: 3000,
    startCommands: ['next dev', 'next start'],
    portEnvVar: 'PORT',
    healthEndpoints: ['/', '/api/health'],
    readyPatterns: [/ready started server/i, /Local:\s+http/i],
  },
  {
    name: 'nuxt',
    deps: ['nuxt'],
    type: 'nuxt',
    defaultPort: 3000,
    startCommands: ['nuxt dev', 'nuxi dev'],
    portEnvVar: 'NUXT_PORT',
    readyPatterns: [/Listening on/i, /Nuxt.*ready/i],
  },
  {
    name: 'remix',
    deps: ['@remix-run/react'],
    type: 'remix',
    defaultPort: 3000,
    startCommands: ['remix dev'],
    portEnvVar: 'PORT',
  },
  {
    name: 'astro',
    deps: ['astro'],
    type: 'astro',
    defaultPort: 4321,
    startCommands: ['astro dev'],
    portEnvVar: 'PORT',
  },
  {
    name: 'sveltekit',
    deps: ['@sveltejs/kit'],
    type: 'sveltekit',
    defaultPort: 5173,
    startCommands: ['vite dev', 'svelte-kit dev'],
    portEnvVar: 'PORT',
  },
  {
    name: 'gatsby',
    deps: ['gatsby'],
    type: 'gatsby',
    defaultPort: 8000,
    startCommands: ['gatsby develop'],
    portEnvVar: 'PORT',
  },
  {
    name: 'docusaurus',
    deps: ['@docusaurus/core'],
    type: 'docusaurus',
    defaultPort: 3000,
    startCommands: ['docusaurus start'],
  },
  {
    name: 'vitepress',
    deps: ['vitepress'],
    type: 'vitepress',
    defaultPort: 5173,
    startCommands: ['vitepress dev'],
  },
  {
    name: 'eleventy',
    deps: ['@11ty/eleventy'],
    type: 'eleventy',
    defaultPort: 8080,
    startCommands: ['eleventy --serve'],
  },
  // Backend frameworks
  {
    name: 'nestjs',
    deps: ['@nestjs/core'],
    type: 'nestjs',
    defaultPort: 3000,
    startCommands: ['nest start --watch', 'nest start'],
    portEnvVar: 'PORT',
    readyPatterns: [/Nest application successfully started/i],
  },
  {
    name: 'fastify',
    deps: ['fastify'],
    type: 'fastify',
    defaultPort: 3000,
    startCommands: ['fastify start'],
    portEnvVar: 'PORT',
  },
  {
    name: 'hono',
    deps: ['hono'],
    type: 'hono',
    defaultPort: 3000,
    startCommands: [],
    portEnvVar: 'PORT',
  },
  {
    name: 'koa',
    deps: ['koa'],
    type: 'koa',
    defaultPort: 3000,
    startCommands: [],
    portEnvVar: 'PORT',
  },
  {
    name: 'express',
    deps: ['express'],
    type: 'express',
    defaultPort: 3000,
    startCommands: [],
    portEnvVar: 'PORT',
    readyPatterns: [/listening on port/i, /server started/i],
  },
  // Frontend frameworks
  {
    name: 'angular',
    deps: ['@angular/core'],
    type: 'angular',
    defaultPort: 4200,
    startCommands: ['ng serve'],
    portEnvVar: 'PORT',
    readyPatterns: [/Compiled successfully/i],
  },
  {
    name: 'react-cra',
    deps: ['react-scripts'],
    type: 'react-cra',
    defaultPort: 3000,
    startCommands: ['react-scripts start'],
    portEnvVar: 'PORT',
  },
  {
    name: 'vue-cli',
    deps: ['@vue/cli-service'],
    type: 'vue-cli',
    defaultPort: 8080,
    startCommands: ['vue-cli-service serve'],
    portEnvVar: 'PORT',
  },
  {
    name: 'react-vite',
    deps: ['react', 'vite'],
    type: 'react-vite',
    defaultPort: 5173,
    startCommands: ['vite'],
    portEnvVar: 'VITE_PORT',
    readyPatterns: [/VITE.*ready/i, /Local:\s+http/i],
  },
  {
    name: 'vue-vite',
    deps: ['vue', 'vite'],
    type: 'vue-vite',
    defaultPort: 5173,
    startCommands: ['vite'],
    portEnvVar: 'VITE_PORT',
    readyPatterns: [/VITE.*ready/i, /Local:\s+http/i],
  },
];

const SCRIPT_PRIORITY = [
  'dev', 'start:dev', 'start', 'serve', 'develop',
  'watch', 'server', 'web', 'run', 'preview',
];

// ============================================================================
// Logger
// ============================================================================

class ServerLogger {
  private logs: ServerLog[] = [];
  private maxLogs: number;
  private onLog?: (log: ServerLog) => void;

  constructor(maxLogs: number = MAX_LOGS, onLog?: (log: ServerLog) => void) {
    this.maxLogs = maxLogs;
    this.onLog = onLog;
  }

  add(stream: 'stdout' | 'stderr', message: string): void {
    const log: ServerLog = {
      timestamp: new Date(),
      stream,
      message: message.trim(),
    };

    this.logs.push(log);
    
    // Rotate logs
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs / 2);
    }

    this.onLog?.(log);
  }

  getLogs(): ServerLog[] {
    return [...this.logs];
  }

  getLastN(n: number): ServerLog[] {
    return this.logs.slice(-n);
  }

  getOutput(): string {
    return this.logs.map(l => l.message).join('\n');
  }

  matchesPattern(patterns: RegExp[]): boolean {
    const output = this.getOutput();
    return patterns.some(p => p.test(output));
  }
}

// ============================================================================
// Project Detection
// ============================================================================

async function findWebappDirectory(
  projectRoot: string,
  options: { verbose?: boolean } = {}
): Promise<{ path: string; isSubdir: boolean } | null> {
  const rootPackageJson = path.join(projectRoot, 'package.json');
  
  try {
    const rootPkg = JSON.parse(await fs.readFile(rootPackageJson, 'utf-8'));
    const scripts = rootPkg.scripts ?? {};
    const deps = { ...rootPkg.dependencies, ...rootPkg.devDependencies };
    
    const hasWebScripts = scripts.dev || scripts.start || scripts.serve;
    const hasWebDeps = deps.react || deps.vue || deps.next || deps.nuxt || 
                       deps.vite || deps.webpack || deps.parcel || 
                       deps.express || deps.fastify || deps['@angular/core'];
    
    if (hasWebScripts && hasWebDeps) {
      return { path: projectRoot, isSubdir: false };
    }
  } catch {
    // No root package.json
  }
  
  // Search subdirectories
  for (const subdir of WEBAPP_SUBDIRS) {
    const subdirPath = path.join(projectRoot, subdir);
    const subdirPackageJson = path.join(subdirPath, 'package.json');
    
    try {
      const pkg = JSON.parse(await fs.readFile(subdirPackageJson, 'utf-8'));
      const scripts = pkg.scripts ?? {};
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      
      const hasWebScripts = scripts.dev || scripts.start || scripts.serve;
      const hasWebDeps = deps.react || deps.vue || deps.next || deps.nuxt || 
                         deps.vite || deps.webpack || deps.parcel ||
                         deps.express || deps.fastify || deps['@angular/core'];
      
      if (hasWebScripts || hasWebDeps) {
        if (options.verbose) {
          console.log(`[AutoLauncher] Found webapp in: ${subdir}`);
        }
        return { path: subdirPath, isSubdir: true };
      }
    } catch {
      continue;
    }
  }
  
  // Fallback
  try {
    await fs.access(rootPackageJson);
    return { path: projectRoot, isSubdir: false };
  } catch {
    return null;
  }
}

export async function detectProject(projectRoot: string): Promise<ProjectInfo> {
  const packageJsonPath = path.join(projectRoot, 'package.json');
  
  let packageJson: Record<string, unknown>;
  try {
    const content = await fs.readFile(packageJsonPath, 'utf-8');
    packageJson = JSON.parse(content);
  } catch (err) {
    return createDefaultProjectInfo(projectRoot);
  }
  
  const packageManager = await detectPackageManager(projectRoot);
  const monorepo = await detectMonorepo(projectRoot, packageJson);
  
  const allDeps = {
    ...((packageJson.dependencies ?? {}) as Record<string, string>),
    ...((packageJson.devDependencies ?? {}) as Record<string, string>),
    ...((packageJson.peerDependencies ?? {}) as Record<string, string>),
  };
  
  // Detect framework
  let projectType: ProjectType = 'unknown';
  let framework: string | undefined;
  let defaultPort = 3000;
  let frameworkCommands: string[] = [];
  let healthEndpoints: string[] = HEALTH_ENDPOINTS.default;
  let readyPatterns: RegExp[] = READY_PATTERNS.default;
  
  for (const pattern of FRAMEWORK_PATTERNS) {
    if (pattern.deps.every(dep => dep in allDeps)) {
      projectType = pattern.type;
      framework = pattern.name;
      defaultPort = pattern.defaultPort;
      frameworkCommands = pattern.startCommands;
      healthEndpoints = pattern.healthEndpoints ?? HEALTH_ENDPOINTS[pattern.name] ?? HEALTH_ENDPOINTS.default;
      readyPatterns = pattern.readyPatterns ?? READY_PATTERNS[pattern.name] ?? READY_PATTERNS.default;
      break;
    }
  }
  
  const scripts = (packageJson.scripts ?? {}) as Record<string, string>;
  const allStartCommands = buildStartCommands(scripts, packageManager, frameworkCommands);
  const startCommand = allStartCommands[0] ?? `${packageManager} start`;
  const expectedPort = await findExpectedPort(projectRoot, scripts, projectType, defaultPort);
  const mainEntry = detectMainEntry(packageJson);
  const requiredEnv = detectRequiredEnv(projectRoot, scripts);
  
  return {
    type: projectType,
    packageManager,
    startCommand,
    allStartCommands,
    expectedPort,
    framework,
    packageJsonPath,
    monorepo,
    mainEntry,
    healthEndpoints,
    readyPatterns,
    requiredEnv,
  };
}

function createDefaultProjectInfo(projectRoot: string): ProjectInfo {
  return {
    type: 'unknown',
    packageManager: 'npm',
    startCommand: 'npm start',
    allStartCommands: ['npm start', 'node index.js', 'node server.js', 'node app.js'],
    expectedPort: 3000,
    packageJsonPath: path.join(projectRoot, 'package.json'),
    healthEndpoints: HEALTH_ENDPOINTS.default,
    readyPatterns: READY_PATTERNS.default,
    requiredEnv: [],
  };
}

async function detectPackageManager(projectRoot: string): Promise<PackageManager> {
  const lockFiles: Array<{ file: string; manager: PackageManager }> = [
    { file: 'bun.lockb', manager: 'bun' },
    { file: 'pnpm-lock.yaml', manager: 'pnpm' },
    { file: 'yarn.lock', manager: 'yarn' },
    { file: 'package-lock.json', manager: 'npm' },
  ];
  
  // Check current and parent directories
  let currentDir = projectRoot;
  for (let i = 0; i < 5; i++) {
    for (const { file, manager } of lockFiles) {
      try {
        await fs.access(path.join(currentDir, file));
        return manager;
      } catch {
        continue;
      }
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }
  
  return 'npm';
}

async function detectMonorepo(
  projectRoot: string,
  packageJson: Record<string, unknown>
): Promise<MonorepoInfo | undefined> {
  const workspaces = packageJson.workspaces as string[] | { packages: string[] } | undefined;
  
  // Check for various monorepo tools
  const checks: Array<{ file: string; type: MonorepoInfo['type'] }> = [
    { file: 'turbo.json', type: 'turborepo' },
    { file: 'nx.json', type: 'nx' },
    { file: 'lerna.json', type: 'lerna' },
    { file: 'pnpm-workspace.yaml', type: 'pnpm-workspaces' },
  ];
  
  for (const { file, type } of checks) {
    try {
      await fs.access(path.join(projectRoot, file));
      const packages = await findWorkspacePackages(projectRoot, workspaces);
      const webPackage = await findBestWebPackage(projectRoot, packages);
      return { type, rootPath: projectRoot, packages, webPackage };
    } catch {
      continue;
    }
  }
  
  if (workspaces) {
    const packages = await findWorkspacePackages(projectRoot, workspaces);
    const webPackage = await findBestWebPackage(projectRoot, packages);
    return { type: 'npm-workspaces', rootPath: projectRoot, packages, webPackage };
  }
  
  return undefined;
}

async function findWorkspacePackages(
  projectRoot: string,
  workspaces: string[] | { packages: string[] } | undefined
): Promise<string[]> {
  const patterns = Array.isArray(workspaces) 
    ? workspaces 
    : workspaces?.packages ?? [];
  
  const packages: string[] = [];
  
  for (const pattern of patterns) {
    const basePath = pattern.replace(/\/\*$/, '');
    try {
      const entries = await fs.readdir(path.join(projectRoot, basePath), { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          packages.push(path.join(basePath, entry.name));
        }
      }
    } catch {
      continue;
    }
  }
  
  return packages;
}

/** Find the best web package in a monorepo */
async function findBestWebPackage(
  projectRoot: string,
  packages: string[]
): Promise<string | undefined> {
  // Priority order for web packages
  const webNames = ['web', 'frontend', 'client', 'app', 'site', 'ui'];
  
  for (const name of webNames) {
    const match = packages.find(p => p.endsWith(`/${name}`) || p === name);
    if (match) {
      try {
        const pkgPath = path.join(projectRoot, match, 'package.json');
        const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf-8'));
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        
        // Verify it's actually a web package
        if (deps.react || deps.vue || deps.next || deps.nuxt || deps.vite) {
          return match;
        }
      } catch {
        continue;
      }
    }
  }
  
  // Fallback: find any package with web dependencies
  for (const pkgName of packages) {
    try {
      const pkgPath = path.join(projectRoot, pkgName, 'package.json');
      const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf-8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      
      if (deps.react || deps.vue || deps.next || deps.nuxt || deps.vite) {
        return pkgName;
      }
    } catch {
      continue;
    }
  }
  
  return undefined;
}

function buildStartCommands(
  scripts: Record<string, string>,
  packageManager: PackageManager,
  frameworkCommands: string[]
): string[] {
  const commands: string[] = [];
  const seen = new Set<string>();
  
  const addCommand = (cmd: string) => {
    if (!seen.has(cmd)) {
      seen.add(cmd);
      commands.push(cmd);
    }
  };
  
  // Add scripts in priority order
  for (const scriptName of SCRIPT_PRIORITY) {
    if (scripts[scriptName]) {
      addCommand(`${packageManager} run ${scriptName}`);
    }
  }
  
  // Add other promising scripts
  for (const [name, script] of Object.entries(scripts)) {
    if (!SCRIPT_PRIORITY.includes(name)) {
      const lower = script.toLowerCase();
      if (lower.includes('start') || lower.includes('serve') || 
          lower.includes('dev') || lower.includes('vite') || 
          lower.includes('next') || lower.includes('node')) {
        addCommand(`${packageManager} run ${name}`);
      }
    }
  }
  
  // Framework-specific commands
  for (const cmd of frameworkCommands) {
    addCommand(`npx ${cmd}`);
  }
  
  // Fallbacks
  addCommand(`${packageManager} start`);
  addCommand(`node index.js`);
  addCommand(`node server.js`);
  addCommand(`node app.js`);
  addCommand(`node src/index.js`);
  addCommand(`node dist/index.js`);
  
  return commands;
}

async function findExpectedPort(
  projectRoot: string,
  scripts: Record<string, string>,
  projectType: ProjectType,
  defaultPort: number
): Promise<number | null> {
  // Check scripts for port
  for (const script of Object.values(scripts)) {
    const portMatch = script.match(/(?:--port[=\s]|-p\s*|PORT=|:)(\d{4,5})\b/i);
    if (portMatch) {
      const port = parseInt(portMatch[1], 10);
      if (port >= 1024 && port <= 65535) {
        return port;
      }
    }
  }
  
  // Check config files
  const configFiles = [
    'vite.config.ts', 'vite.config.js', 'vite.config.mjs',
    'next.config.js', 'next.config.mjs', 'next.config.ts',
    'nuxt.config.ts', 'nuxt.config.js',
  ];
  
  for (const configFile of configFiles) {
    try {
      const config = await fs.readFile(path.join(projectRoot, configFile), 'utf-8');
      const portMatch = config.match(/port:\s*(\d+)/);
      if (portMatch) {
        return parseInt(portMatch[1], 10);
      }
    } catch {
      continue;
    }
  }
  
  // Check .env files
  for (const envFile of ['.env', '.env.local', '.env.development', '.env.dev']) {
    try {
      const env = await fs.readFile(path.join(projectRoot, envFile), 'utf-8');
      const portMatch = env.match(/^PORT=(\d+)/m);
      if (portMatch) {
        return parseInt(portMatch[1], 10);
      }
    } catch {
      continue;
    }
  }
  
  return defaultPort;
}

function detectMainEntry(packageJson: Record<string, unknown>): string | undefined {
  const main = packageJson.main as string | undefined;
  if (main) return main;
  
  const bin = packageJson.bin;
  if (typeof bin === 'string') return bin;
  if (typeof bin === 'object' && bin) {
    const values = Object.values(bin);
    if (values.length > 0) return values[0] as string;
  }
  
  return undefined;
}

function detectRequiredEnv(projectRoot: string, scripts: Record<string, string>): string[] {
  const required: string[] = [];
  
  // Check scripts for env var usage
  for (const script of Object.values(scripts)) {
    const matches = script.match(/\$\{?([A-Z_][A-Z0-9_]*)\}?/g);
    if (matches) {
      required.push(...matches.map(m => m.replace(/[${}]/g, '')));
    }
  }
  
  return [...new Set(required)];
}

// ============================================================================
// Port & Health Checks
// ============================================================================

export function isPortInUse(port: number, host = 'localhost'): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(2000);
    
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
    
    socket.connect(port, host);
  });
}

interface HealthCheckResult {
  healthy: boolean;
  statusCode?: number;
  responseTime?: number;
  endpoint?: string;
}

async function performHealthCheck(
  port: number,
  endpoints: string[],
  host = 'localhost',
  timeout = 5000
): Promise<HealthCheckResult> {
  for (const endpoint of endpoints) {
    const startTime = Date.now();
    try {
      const result = await httpGet(`http://${host}:${port}${endpoint}`, timeout);
      if (result.statusCode && result.statusCode < 500) {
        return {
          healthy: true,
          statusCode: result.statusCode,
          responseTime: Date.now() - startTime,
          endpoint,
        };
      }
    } catch {
      continue;
    }
  }
  
  return { healthy: false };
}

function httpGet(
  url: string,
  timeout: number
): Promise<{ statusCode?: number; body?: string }> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    
    const req = client.get(url, { timeout }, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, body }));
    });
    
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
  });
}

export async function findFreePort(
  preferredPort = 3000,
  maxAttempts = 20
): Promise<number> {
  if (!(await isPortInUse(preferredPort))) {
    return preferredPort;
  }
  
  for (let i = 1; i < maxAttempts; i++) {
    const port = preferredPort + i;
    if (!(await isPortInUse(port))) {
      return port;
    }
  }
  
  // Try random high ports
  for (let i = 0; i < 10; i++) {
    const port = 10000 + Math.floor(Math.random() * 50000);
    if (!(await isPortInUse(port))) {
      return port;
    }
  }
  
  throw new Error(`Could not find free port starting from ${preferredPort}`);
}

export async function findRunningServer(
  ports: number[] = COMMON_PORTS,
  options: { verbose?: boolean; healthEndpoints?: string[] } = {}
): Promise<{ port: number; url: string } | null> {
  const checks = ports.map(async (port) => {
    if (!(await isPortInUse(port))) return null;
    
    const health = await performHealthCheck(
      port,
      options.healthEndpoints ?? HEALTH_ENDPOINTS.default
    );
    
    if (health.healthy) {
      return { port, url: `http://localhost:${port}` };
    }
    return null;
  });
  
  const results = await Promise.all(checks);
  return results.find(Boolean) ?? null;
}

// ============================================================================
// Dependency Installation
// ============================================================================

async function hasNodeModules(projectRoot: string): Promise<boolean> {
  try {
    await fs.access(path.join(projectRoot, 'node_modules'));
    return true;
  } catch {
    return false;
  }
}

async function installDependencies(
  projectRoot: string,
  packageManager: PackageManager,
  options: { verbose?: boolean; signal?: AbortSignal } = {}
): Promise<{ success: boolean; error?: string }> {
  if (options.signal?.aborted) {
    return { success: false, error: 'Cancelled' };
  }
  
  if (options.verbose) {
    console.log(`[AutoLauncher] Installing dependencies with ${packageManager}...`);
  }
  
  const commands: Record<PackageManager, string> = {
    yarn: 'yarn install --frozen-lockfile || yarn install',
    pnpm: 'pnpm install --frozen-lockfile || pnpm install',
    bun: 'bun install',
    npm: 'npm ci || npm install',
  };
  
  try {
    const { stdout, stderr } = await execAsync(commands[packageManager], {
      cwd: projectRoot,
      timeout: 600000,
      shell: true,
    });
    
    if (options.verbose) {
      console.log(`[AutoLauncher] Dependencies installed`);
    }
    return { success: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, error: msg };
  }
}

// ============================================================================
// Process Management
// ============================================================================

/**
 * Kill process and all children (cross-platform)
 */
async function killProcessTree(pid: number): Promise<void> {
  const isWindows = process.platform === 'win32';
  
  try {
    if (isWindows) {
      // Windows: use taskkill with /T for tree
      execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' });
    } else {
      // Unix: use pkill or process group
      try {
        // Try killing process group
        process.kill(-pid, 'SIGTERM');
      } catch {
        // Fallback to direct kill
        process.kill(pid, 'SIGTERM');
      }
      
      // Give it time to cleanup
      await sleep(500);
      
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // Already dead
      }
    }
  } catch {
    // Process already dead or permission denied
  }
}

export async function stopServer(serverProcess: ChildProcess): Promise<void> {
  if (!serverProcess || serverProcess.killed) return;
  
  const pid = serverProcess.pid;
  if (!pid) return;
  
  return new Promise((resolve) => {
    const forceKillTimeout = setTimeout(async () => {
      await killProcessTree(pid);
      resolve();
    }, 5000);
    
    serverProcess.on('close', () => {
      clearTimeout(forceKillTimeout);
      resolve();
    });
    
    // Start graceful shutdown
    try {
      serverProcess.kill('SIGTERM');
    } catch {
      // Ignore
    }
  });
}

// ============================================================================
// Server Launch with Retries
// ============================================================================

interface StartServerResult {
  success: boolean;
  process?: ChildProcess;
  port?: number;
  command?: string;
  error?: LaunchError;
  logs: ServerLog[];
}

async function startServerWithRetries(
  projectRoot: string,
  projectInfo: ProjectInfo,
  options: {
    port: number;
    env?: Record<string, string>;
    verbose?: boolean;
    maxAttempts?: number;
    startupTimeout?: number;
    signal?: AbortSignal;
    healthEndpoints?: string[];
    onLog?: (log: ServerLog) => void;
    retryStrategy?: 'linear' | 'exponential';
  }
): Promise<StartServerResult> {
  const {
    port,
    env: extraEnv,
    verbose = false,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    startupTimeout = DEFAULT_STARTUP_TIMEOUT,
    signal,
    healthEndpoints = projectInfo.healthEndpoints,
    onLog,
    retryStrategy = 'exponential',
  } = options;
  
  const { allStartCommands, packageManager, readyPatterns } = projectInfo;
  const logger = new ServerLogger(MAX_LOGS, onLog);
  
  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    PORT: String(port),
    VITE_PORT: String(port),
    NUXT_PORT: String(port),
    DEV_PORT: String(port),
    NODE_ENV: 'development',
    BROWSER: 'none',
    FORCE_COLOR: '1',
    ...extraEnv,
  };
  
  const attemptCount = Math.min(allStartCommands.length, maxAttempts);
  
  for (let i = 0; i < attemptCount; i++) {
    if (signal?.aborted) {
      return {
        success: false,
        error: { code: LaunchErrorCode.CANCELLED, message: 'Launch cancelled' },
        logs: logger.getLogs(),
      };
    }
    
    const command = allStartCommands[i];
    if (!command) continue;
    
    // Calculate timeout for this attempt (exponential backoff gives more time to later attempts)
    const attemptTimeout = retryStrategy === 'exponential'
      ? Math.min(startupTimeout * Math.pow(1.5, i) / attemptCount, startupTimeout * 0.8)
      : startupTimeout / attemptCount;
    
    if (verbose) {
      console.log(`[AutoLauncher] Attempt ${i + 1}/${attemptCount}: ${command} (timeout: ${Math.round(attemptTimeout / 1000)}s)`);
    }
    
    const [cmd, ...args] = parseCommand(command, packageManager);
    
    // Spawn with process group for clean kill
    const serverProcess = spawn(cmd, args, {
      cwd: projectRoot,
      env,
      shell: true,
      stdio: 'pipe',
      detached: process.platform !== 'win32', // Process group on Unix
    });
    
    // Capture output
    serverProcess.stdout?.on('data', (data) => {
      logger.add('stdout', data.toString());
      if (verbose) {
        console.log(`[stdout] ${data.toString().trim()}`);
      }
    });
    
    serverProcess.stderr?.on('data', (data) => {
      logger.add('stderr', data.toString());
      if (verbose) {
        console.log(`[stderr] ${data.toString().trim()}`);
      }
    });
    
    // Wait for server to be ready
    const result = await waitForServerReady(
      serverProcess,
      port,
      readyPatterns,
      healthEndpoints,
      attemptTimeout,
      logger,
      signal,
      { verbose }
    );
    
    if (result.ready) {
      if (verbose) {
        console.log(`[AutoLauncher] Server started with: ${command}`);
      }
      return {
        success: true,
        process: serverProcess,
        port,
        command,
        logs: logger.getLogs(),
      };
    }
    
    // Cleanup failed attempt
    await stopServer(serverProcess);
    
    // Analyze failure
    const errorAnalysis = analyzeFailure(logger.getLastN(50));
    
    if (errorAnalysis.fatal) {
      // Don't retry fatal errors
      return {
        success: false,
        error: errorAnalysis.error,
        logs: logger.getLogs(),
      };
    }
    
    if (verbose && errorAnalysis.error) {
      console.log(`[AutoLauncher] Attempt failed: ${errorAnalysis.error.message}`);
    }
  }
  
  return {
    success: false,
    error: {
      code: LaunchErrorCode.SERVER_TIMEOUT,
      message: `Failed to start server after ${attemptCount} attempts`,
      output: logger.getLastN(20).map(l => l.message),
      suggestion: 'Try running the start command manually to see full error output',
    },
    logs: logger.getLogs(),
  };
}

interface WaitResult {
  ready: boolean;
  reason?: string;
}

async function waitForServerReady(
  serverProcess: ChildProcess,
  port: number,
  readyPatterns: RegExp[],
  healthEndpoints: string[],
  timeout: number,
  logger: ServerLogger,
  signal?: AbortSignal,
  options: { verbose?: boolean } = {}
): Promise<WaitResult> {
  const startTime = Date.now();
  let processExited = false;
  let exitCode: number | null = null;
  
  serverProcess.on('exit', (code) => {
    processExited = true;
    exitCode = code;
  });
  
  while (Date.now() - startTime < timeout) {
    if (signal?.aborted) {
      return { ready: false, reason: 'cancelled' };
    }
    
    if (processExited) {
      return { ready: false, reason: `process exited with code ${exitCode}` };
    }
    
    // Check for ready pattern in output
    if (logger.matchesPattern(readyPatterns)) {
      // Verify with health check
      const health = await performHealthCheck(port, healthEndpoints);
      if (health.healthy) {
        return { ready: true };
      }
    }
    
    // Also check port directly
    if (await isPortInUse(port)) {
      // Wait a moment for full startup
      await sleep(500);
      
      const health = await performHealthCheck(port, healthEndpoints);
      if (health.healthy) {
        return { ready: true };
      }
    }
    
    // Adaptive polling interval
    const elapsed = Date.now() - startTime;
    const interval = elapsed < 5000 ? 200 : elapsed < 30000 ? 500 : 1000;
    await sleep(interval);
  }
  
  return { ready: false, reason: 'timeout' };
}

interface FailureAnalysis {
  fatal: boolean;
  error?: LaunchError;
}

function analyzeFailure(logs: ServerLog[]): FailureAnalysis {
  const output = logs.map(l => l.message.toLowerCase()).join('\n');
  
  // Fatal errors - don't retry
  if (output.includes('command not found') || output.includes('not recognized')) {
    return {
      fatal: true,
      error: {
        code: LaunchErrorCode.NO_START_SCRIPT,
        message: 'Command not found',
        suggestion: 'Ensure the package is installed or use a different start command',
      },
    };
  }
  
  if (output.includes('enoent') && output.includes('package.json')) {
    return {
      fatal: true,
      error: {
        code: LaunchErrorCode.PROJECT_NOT_FOUND,
        message: 'package.json not found',
        suggestion: 'Make sure you are in the correct project directory',
      },
    };
  }
  
  if (output.includes('cannot find module') || output.includes('module not found')) {
    return {
      fatal: false, // May succeed after install
      error: {
        code: LaunchErrorCode.DEPENDENCY_INSTALL_FAILED,
        message: 'Missing module',
        suggestion: 'Try running npm install first',
      },
    };
  }
  
  // Transient errors - can retry
  if (output.includes('eaddrinuse') || output.includes('address already in use')) {
    return {
      fatal: false,
      error: {
        code: LaunchErrorCode.PORT_UNAVAILABLE,
        message: 'Port already in use',
        suggestion: 'Try a different port or stop the existing server',
      },
    };
  }
  
  if (output.includes('syntax error') || output.includes('unexpected token')) {
    return {
      fatal: true,
      error: {
        code: LaunchErrorCode.SERVER_CRASHED,
        message: 'Syntax error in code',
        output: logs.slice(-10).map(l => l.message),
        suggestion: 'Fix the syntax error and try again',
      },
    };
  }
  
  return { fatal: false };
}

// ============================================================================
// Main Entry Point
// ============================================================================

export async function autoLaunch(options: AutoLaunchOptions): Promise<LaunchResult> {
  const {
    projectRoot,
    preferredPort,
    startupTimeout = DEFAULT_STARTUP_TIMEOUT,
    skipIfRunning = true,
    env,
    verbose = false,
    autoInstall = true,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    signal,
    healthCheckPath,
    onLog,
    healthCheck = true,
    retryStrategy = 'exponential',
  } = options;
  
  const startTime = Date.now();
  const allLogs: ServerLog[] = [];
  
  const log = (level: 'stdout' | 'stderr', msg: string) => {
    const logEntry: ServerLog = { timestamp: new Date(), stream: level, message: msg };
    allLogs.push(logEntry);
    onLog?.(logEntry);
    if (verbose) console.log(`[AutoLauncher] ${msg}`);
  };
  
  // Check for cancellation
  if (signal?.aborted) {
    return createFailedResult(
      { code: LaunchErrorCode.CANCELLED, message: 'Launch cancelled' },
      projectRoot,
      undefined,
      allLogs
    );
  }
  
  // ========== Step 1: Find Project Directory ==========
  log('stdout', `Searching for webapp in: ${projectRoot}`);
  
  const webappDir = await findWebappDirectory(projectRoot, { verbose });
  if (!webappDir) {
    return createFailedResult(
      {
        code: LaunchErrorCode.PROJECT_NOT_FOUND,
        message: 'No webapp found in project',
        suggestion: 'Ensure your project has a package.json with web dependencies',
      },
      projectRoot,
      undefined,
      allLogs
    );
  }
  
  const actualProjectRoot = webappDir.path;
  if (webappDir.isSubdir) {
    log('stdout', `Using subdirectory: ${path.relative(projectRoot, actualProjectRoot)}`);
  }
  
  // ========== Step 2: Detect Project ==========
  let projectInfo: ProjectInfo;
  try {
    projectInfo = await detectProject(actualProjectRoot);
  } catch (error) {
    return createFailedResult(
      {
        code: LaunchErrorCode.PACKAGE_JSON_INVALID,
        message: `Project detection failed: ${error instanceof Error ? error.message : String(error)}`,
      },
      actualProjectRoot,
      undefined,
      allLogs
    );
  }
  
  // Add custom health endpoint if provided
  if (healthCheckPath) {
    projectInfo.healthEndpoints = [healthCheckPath, ...projectInfo.healthEndpoints];
  }
  
  log('stdout', `Detected: ${projectInfo.type} (${projectInfo.framework ?? 'unknown'})`);
  log('stdout', `Package manager: ${projectInfo.packageManager}`);
  
  // ========== Step 3: Check for Existing Server ==========
  if (skipIfRunning) {
    const portsToCheck = [
      ...(preferredPort ? [preferredPort] : []),
      ...(projectInfo.expectedPort ? [projectInfo.expectedPort] : []),
      ...COMMON_PORTS,
    ];
    
    const existingServer = await findRunningServer(
      [...new Set(portsToCheck)],
      { verbose, healthEndpoints: projectInfo.healthEndpoints }
    );
    
    if (existingServer) {
      log('stdout', `Found existing server at ${existingServer.url}`);
      
      return {
        success: true,
        baseUrl: existingServer.url,
        port: existingServer.port,
        process: null,
        projectInfo,
        cleanup: async () => {},
        startedByUs: false,
        startupTime: Date.now() - startTime,
        logs: allLogs,
      };
    }
  }
  
  // ========== Step 4: Install Dependencies ==========
  if (autoInstall && !(await hasNodeModules(actualProjectRoot))) {
    log('stdout', 'Installing dependencies...');
    
    const installResult = await installDependencies(
      actualProjectRoot,
      projectInfo.packageManager,
      { verbose, signal }
    );
    
    if (!installResult.success) {
      // Try npm as fallback
      log('stdout', 'Retrying with npm...');
      const retryResult = await installDependencies(actualProjectRoot, 'npm', { verbose, signal });
      
      if (!retryResult.success) {
        return createFailedResult(
          {
            code: LaunchErrorCode.DEPENDENCY_INSTALL_FAILED,
            message: 'Failed to install dependencies',
            details: retryResult.error,
            suggestion: 'Try running npm install manually',
          },
          actualProjectRoot,
          projectInfo,
          allLogs
        );
      }
    }
    
    await sleep(1000); // Let filesystem settle
  }
  
  // ========== Step 5: Find Free Port ==========
  const targetPort = preferredPort ?? projectInfo.expectedPort ?? 3000;
  let port: number;
  
  try {
    port = await findFreePort(targetPort);
    if (port !== targetPort) {
      log('stdout', `Port ${targetPort} in use, using ${port}`);
    }
  } catch (error) {
    return createFailedResult(
      {
        code: LaunchErrorCode.PORT_UNAVAILABLE,
        message: `Could not find free port: ${error instanceof Error ? error.message : String(error)}`,
      },
      actualProjectRoot,
      projectInfo,
      allLogs
    );
  }
  
  // ========== Step 6: Start Server ==========
  log('stdout', `Starting server on port ${port}...`);
  
  const result = await startServerWithRetries(actualProjectRoot, projectInfo, {
    port,
    env,
    verbose,
    maxAttempts,
    startupTimeout,
    signal,
    healthEndpoints: healthCheck ? projectInfo.healthEndpoints : ['/'],
    onLog: (logEntry) => {
      allLogs.push(logEntry);
      onLog?.(logEntry);
    },
    retryStrategy,
  });
  
  if (!result.success) {
    return createFailedResult(
      result.error ?? { code: LaunchErrorCode.UNKNOWN, message: 'Unknown error' },
      actualProjectRoot,
      projectInfo,
      [...allLogs, ...result.logs]
    );
  }
  
  const baseUrl = `http://localhost:${port}`;
  const startupTime = Date.now() - startTime;
  
  log('stdout', `Server ready at ${baseUrl} (${startupTime}ms)`);
  
  return {
    success: true,
    baseUrl,
    port,
    process: result.process!,
    projectInfo,
    successfulCommand: result.command,
    startedByUs: true,
    startupTime,
    logs: [...allLogs, ...result.logs],
    cleanup: async () => {
      if (verbose) {
        console.log(`[AutoLauncher] Stopping server...`);
      }
      await stopServer(result.process!);
      if (verbose) {
        console.log(`[AutoLauncher] Server stopped`);
      }
    },
  };
}

// ============================================================================
// Helpers
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseCommand(command: string, packageManager: PackageManager): string[] {
  const parts = command.split(/\s+/);
  if (parts[0] === 'npm' && packageManager !== 'npm') {
    parts[0] = packageManager;
  }
  return parts;
}

function createFailedResult(
  error: LaunchError,
  projectRoot: string,
  projectInfo?: ProjectInfo,
  logs: ServerLog[] = []
): LaunchResult {
  return {
    success: false,
    baseUrl: '',
    port: 0,
    process: null,
    projectInfo: projectInfo ?? createDefaultProjectInfo(projectRoot),
    error,
    cleanup: async () => {},
    startedByUs: false,
    logs,
  };
}

// ============================================================================
// Exports for Testing
// ============================================================================

export {
  findWebappDirectory,
  installDependencies,
  performHealthCheck,
  killProcessTree,
  ServerLogger,
};
