// [SCANNER_ENGINES] Enhancement
// File: packages/core/src/reality/runtime/engine.ts
// Changes:
// - Added comprehensive JSDoc documentation with examples
// - Added explicit return types to all functions
// - Extracted magic numbers/strings to named constants
// - Added input validation for public functions
// - Improved error handling with contextual messages
// - Added TODO comments for improvements
// Warnings:
// - Consider adding circuit breaker for external URL checks
// - Consider retry logic for flaky network requests

/**
 * Reality Mode Runtime Engine Module
 *
 * Main entry point for runtime verification of web applications.
 * Orchestrates browser automation, evidence collection, and rule execution
 * to verify application behavior matches expectations.
 *
 * @module reality/runtime/engine
 *
 * @example
 * ```typescript
 * import { runRealityMode, runRealityModeSeamless, quickVerify } from '@vibecheck/core/reality';
 *
 * // Full control mode
 * const result = await runRealityMode({
 *   repoRoot: '/path/to/project',
 *   routes: [{ method: 'GET', path: '/' }],
 *   config: { baseUrl: 'http://localhost:3000' },
 * });
 *
 * // Seamless mode (auto-starts server)
 * const result = await runRealityModeSeamless({
 *   repoRoot: '/path/to/project',
 *   routes: [],
 * });
 *
 * // Quick verify (minimal config)
 * const result = await quickVerify('/path/to/project');
 * ```
 */

import { createHash, randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import type {
  RouteDefinition,
  RuntimeConfig,
  AuthContext,
  RealityModeOutput,
  RuntimeFinding,
  ArtifactsIndex,
  RunSummary,
  RuntimeVerdict,
  ProofReceipt,
  NetworkLogEntry,
  NetworkSummary,
} from '../types.js';
import { SafetyGuard, type SafetyGuardConfig } from '../safety/index.js';
import { EvidenceCollector, type CollectedEvidence } from './evidence-collector.js';
import { getAllRuntimeRules, executeRules } from './rules/index.js';
import { createProofReceipt } from '../proof/receipt.js';
import { autoLaunch, type LaunchResult, type ProjectInfo } from './auto-launcher.js';
import { generateHtmlReport, openReport } from './report-generator.js';
import { AIChaosAgent, type ChaosAgentConfig, type ChaosSession } from './ai-chaos-agent.js';

// ============================================================================
// Constants
// ============================================================================

/** Run ID prefix for identification */
const RUN_ID_PREFIX = 'run_';

/** Hash algorithm for finding IDs */
const HASH_ALGORITHM = 'sha256';

/** Length of hash substring for IDs */
const HASH_LENGTH = 16;

/** Route hash length for file naming */
const ROUTE_HASH_LENGTH = 8;

/** Default timeout for page navigation (ms) */
const DEFAULT_PAGE_TIMEOUT = 15_000;

/** Default timeout for startup in seamless mode (ms) */
const DEFAULT_STARTUP_TIMEOUT = 60_000;

/** Maximum routes for auto-discovery */
const MAX_DISCOVERED_ROUTES = 20;

/** Maximum auto-launch attempts */
const MAX_LAUNCH_ATTEMPTS = 5;

/** Default video recording dimensions */
const VIDEO_DIMENSIONS = { width: 1280, height: 720 };

/** User agent string for browser */
const BROWSER_USER_AGENT = 'VibeCheck-Reality-Mode/1.0';

/** Common routes to check during auto-discovery */
const COMMON_ROUTES = [
  '/api',
  '/api/health',
  '/health',
  '/about',
  '/login',
  '/signup',
  '/dashboard',
  '/settings',
] as const;

/** HTTP method ordering for deterministic sorting */
const METHOD_ORDER: Record<string, number> = {
  GET: 0,
  POST: 1,
  PUT: 2,
  PATCH: 3,
  DELETE: 4,
};

// ============================================================================
// Types
// ============================================================================

/**
 * Input configuration for Reality Mode verification.
 */
export interface RealityModeInput {
  /** Absolute path to repository root */
  repoRoot: string;
  /** Route list from truthpack */
  routes: RouteDefinition[];
  /** Environment configuration */
  envMap?: Record<string, unknown>;
  /** Optional authentication state */
  authContext?: AuthContext;
  /** Runtime configuration */
  config: RuntimeConfig;
}

/**
 * Result of verifying a single route.
 */
interface VerifyRouteResult {
  /** Findings detected during verification */
  findings: RuntimeFinding[];
  /** Proof receipt for the verification */
  receipt: ProofReceipt;
  /** Evidence collected during verification */
  evidence: CollectedEvidence;
}

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default runtime configuration for Reality Mode.
 *
 * These defaults provide a balanced configuration suitable for most
 * web applications. Override specific values as needed.
 */
export const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
  baseUrl: 'http://localhost:3000',
  allowlist: [],
  timeouts: {
    perAction: 10_000,
    perPage: 30_000,
    globalRun: 300_000,
    networkRequest: 15_000,
  },
  concurrency: {
    maxPages: 2,
    maxRoutes: 50,
    maxRequests: 10,
  },
  evidence: {
    screenshots: true,
    traces: false,
    networkLogs: true,
    consoleErrors: true,
    videos: true,
  },
  browser: {
    headless: true,
    viewport: VIDEO_DIMENSIONS,
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generates a unique run ID.
 *
 * @returns A unique run identifier string
 *
 * @example
 * ```typescript
 * const runId = generateRunId();
 * // Returns: 'run_1699123456789_a1b2c3d4'
 * ```
 */
function generateRunId(): string {
  const timestamp = Date.now();
  const random = randomUUID().slice(0, 8);
  return `${RUN_ID_PREFIX}${timestamp}_${random}`;
}

/**
 * Generates a stable finding ID from components.
 *
 * @param ruleId - The rule that generated the finding
 * @param route - The route being verified
 * @param evidence - Evidence string for uniqueness
 * @returns A deterministic finding ID
 */
function generateFindingId(
  ruleId: string,
  route: RouteDefinition,
  evidence: string
): string {
  const content = `${ruleId}:${route.method}:${route.path}:${evidence}`;
  return createHash(HASH_ALGORITHM).update(content).digest('hex').slice(0, HASH_LENGTH);
}

/**
 * Gets a stable hash for a route.
 *
 * @param route - The route to hash
 * @returns A short hash string for the route
 */
function getRouteHash(route: RouteDefinition): string {
  const normalized = `${route.method}:${route.path}`.toLowerCase();
  return createHash(HASH_ALGORITHM).update(normalized).digest('hex').slice(0, ROUTE_HASH_LENGTH);
}

/**
 * Sorts routes for deterministic ordering.
 *
 * Routes are sorted by HTTP method (GET < POST < PUT < PATCH < DELETE),
 * then alphabetically by path.
 *
 * @param routes - Array of routes to sort
 * @returns Sorted copy of routes array
 */
function sortRoutes(routes: RouteDefinition[]): RouteDefinition[] {
  return [...routes].sort((a, b) => {
    const methodDiff = (METHOD_ORDER[a.method] ?? 5) - (METHOD_ORDER[b.method] ?? 5);
    if (methodDiff !== 0) return methodDiff;
    return a.path.localeCompare(b.path);
  });
}

/**
 * Samples routes if the total exceeds configuration limits.
 *
 * @param routes - All routes to potentially sample
 * @param config - Runtime configuration with sampling settings
 * @returns Sampled routes array (or original if under limit)
 */
function sampleRoutes(routes: RouteDefinition[], config: RuntimeConfig): RouteDefinition[] {
  if (!config.sampling?.enabled || routes.length <= config.sampling.maxRoutes) {
    return routes;
  }

  // Random sampling for now
  // TODO: Consider stratified sampling by method type
  const shuffled = [...routes].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, config.sampling.maxRoutes);
}

/**
 * Calculates overall verdict from findings.
 *
 * @param findings - Array of findings to analyze
 * @returns The overall verdict
 */
function calculateVerdict(findings: RuntimeFinding[]): RuntimeVerdict {
  const hasCritical = findings.some(f => f.severity === 'critical');
  const hasHigh = findings.some(f => f.severity === 'high');

  if (hasCritical || hasHigh) return 'fail';
  if (findings.length > 0) return 'warn';
  return 'pass';
}

/**
 * Counts findings by severity level.
 *
 * @param findings - Array of findings to count
 * @returns Object with counts per severity level
 */
function countFindingsBySeverity(findings: RuntimeFinding[]): Record<string, number> {
  const counts: Record<string, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };

  for (const finding of findings) {
    counts[finding.severity] = (counts[finding.severity] ?? 0) + 1;
  }

  return counts;
}

/**
 * Builds network summary from log entries.
 *
 * @param logs - Array of network log entries
 * @returns Summary statistics for network activity
 */
function buildNetworkSummary(logs: NetworkLogEntry[]): NetworkSummary {
  const statusCodes: Record<number, number> = {};
  let totalResponseTime = 0;
  let successCount = 0;
  let failCount = 0;
  const blockedDomains: string[] = [];

  for (const log of logs) {
    statusCodes[log.status] = (statusCodes[log.status] ?? 0) + 1;
    totalResponseTime += log.responseTime;

    if (log.status >= 200 && log.status < 400) {
      successCount++;
    } else if (log.status >= 400) {
      failCount++;
    }

    if (log.blocked) {
      try {
        const domain = new URL(log.url).hostname;
        if (!blockedDomains.includes(domain)) {
          blockedDomains.push(domain);
        }
      } catch {
        // Ignore URL parse errors
      }
    }
  }

  return {
    totalRequests: logs.length,
    successfulRequests: successCount,
    failedRequests: failCount,
    blockedDomains,
    statusCodes,
    avgResponseTime: logs.length > 0 ? Math.round(totalResponseTime / logs.length) : 0,
  };
}

/**
 * Attempts to load Playwright dynamically.
 *
 * Tries @playwright/test first, then falls back to playwright.
 *
 * @returns Playwright module or null if not available
 */
async function loadPlaywright(): Promise<unknown | null> {
  try {
    return await import('@playwright/test');
  } catch {
    try {
      return await import('playwright');
    } catch {
      return null;
    }
  }
}

/**
 * Sets up authentication in browser context.
 *
 * Supports multiple authentication types:
 * - cookie: Sets cookies directly
 * - header: Adds HTTP headers to all requests
 * - basic: Adds Basic auth header
 * - form: Performs login form submission
 *
 * @param context - Browser context to configure
 * @param authContext - Authentication configuration
 * @param baseUrl - Base URL for cookie domain extraction
 */
async function setupAuth(
  context: unknown,
  authContext: AuthContext,
  baseUrl: string
): Promise<void> {
  const browserContext = context as {
    addCookies: (cookies: Array<{ name: string; value: string; domain: string; path: string }>) => Promise<void>;
    setExtraHTTPHeaders: (headers: Record<string, string>) => Promise<void>;
    newPage: () => Promise<{
      goto: (url: string) => Promise<void>;
      fill: (selector: string, value: string) => Promise<void>;
      click: (selector: string) => Promise<void>;
      waitForNavigation: (options?: { waitUntil?: string }) => Promise<void>;
      close: () => Promise<void>;
    }>;
  };

  const hostname = new URL(baseUrl).hostname;

  switch (authContext.type) {
    case 'cookie':
      const cookies = Object.entries(authContext.credentials).map(([name, value]) => ({
        name,
        value,
        domain: hostname,
        path: '/',
      }));
      await browserContext.addCookies(cookies);
      break;

    case 'header':
      await browserContext.setExtraHTTPHeaders(authContext.credentials);
      break;

    case 'basic':
      const { username, password } = authContext.credentials;
      await browserContext.setExtraHTTPHeaders({
        'Authorization': `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
      });
      break;

    case 'form':
      if (authContext.loginUrl && authContext.loginSelectors) {
        const page = await browserContext.newPage();
        try {
          await page.goto(`${baseUrl}${authContext.loginUrl}`);

          if (authContext.loginSelectors.username && authContext.credentials.username) {
            await page.fill(authContext.loginSelectors.username, authContext.credentials.username);
          }
          if (authContext.loginSelectors.password && authContext.credentials.password) {
            await page.fill(authContext.loginSelectors.password, authContext.credentials.password);
          }
          if (authContext.loginSelectors.submit) {
            await page.click(authContext.loginSelectors.submit);
            await page.waitForNavigation({ waitUntil: 'networkidle' });
          }
        } finally {
          await page.close();
        }
      }
      break;
  }
}

/**
 * Creates output for pattern-only mode when Playwright is unavailable.
 *
 * @param runId - The run identifier
 * @param startedAt - When the run started
 * @param routes - Routes that would have been verified
 * @param artifactsDir - Path to artifacts directory
 * @returns A RealityModeOutput indicating Playwright is needed
 */
function createPatternOnlyOutput(
  runId: string,
  startedAt: Date,
  routes: RouteDefinition[],
  artifactsDir: string
): RealityModeOutput {
  const completedAt = new Date();
  const defaultRoute = routes[0] ?? { method: 'GET', path: '/' };

  return {
    findings: [{
      id: generateFindingId('reality/no-playwright', defaultRoute, 'not-installed'),
      ruleId: 'reality/no-playwright',
      ruleName: 'Playwright Not Installed',
      severity: 'info',
      message: 'Playwright is not installed. Runtime verification requires Playwright. Install with: npm install -D @playwright/test && npx playwright install',
      route: { method: 'GET', path: '/', actualUrl: '' },
      evidence: {},
      timing: {
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs: completedAt.getTime() - startedAt.getTime(),
      },
    }],
    artifactsIndex: {
      runId,
      baseDir: artifactsDir,
      artifacts: [],
      stats: { totalArtifacts: 0, totalSizeBytes: 0, screenshotCount: 0, traceCount: 0 },
    },
    receipts: [],
    summary: {
      runId,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs: completedAt.getTime() - startedAt.getTime(),
      routesTotal: routes.length,
      routesVerified: 0,
      routesSkipped: routes.length,
      routesFailed: 0,
      findingsTotal: 1,
      findingsBySeverity: { info: 1 },
      verdict: 'warn',
    },
  };
}

// ============================================================================
// Route Verification
// ============================================================================

/**
 * Verifies a single route by navigating to it and running rules.
 *
 * @param route - The route to verify
 * @param context - Browser context
 * @param config - Runtime configuration
 * @param safetyGuard - Safety guard instance
 * @param artifactsDir - Directory for artifacts
 * @param authContext - Optional auth context
 * @returns Verification result with findings and evidence
 */
async function verifyRoute(
  route: RouteDefinition,
  context: unknown,
  config: RuntimeConfig,
  safetyGuard: SafetyGuard,
  artifactsDir: string,
  authContext?: AuthContext
): Promise<VerifyRouteResult> {
  const startedAt = new Date();
  const routeHash = getRouteHash(route);
  const routeUrl = `${config.baseUrl}${route.path}`;

  // Check URL safety first
  const urlCheck = await safetyGuard.isUrlSafe(routeUrl);
  if (!urlCheck.safe) {
    return {
      findings: [{
        id: generateFindingId('reality/blocked-url', route, urlCheck.reason ?? ''),
        ruleId: 'reality/blocked-url',
        ruleName: 'Blocked URL',
        severity: 'high',
        message: `Route URL blocked: ${urlCheck.reason}`,
        route: { method: route.method, path: route.path, actualUrl: routeUrl },
        evidence: {},
        timing: {
          startedAt: startedAt.toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: Date.now() - startedAt.getTime(),
        },
      }],
      receipt: createProofReceipt({
        route,
        verdict: 'SKIP',
        reason: `URL blocked: ${urlCheck.reason}`,
        assertions: [],
        traces: [],
      }),
      evidence: {},
    };
  }

  // Create evidence collector
  const evidenceCollector = new EvidenceCollector({
    outputDir: artifactsDir,
    routeHash,
    collectScreenshots: config.evidence.screenshots,
    collectNetworkLogs: config.evidence.networkLogs,
    collectConsoleErrors: config.evidence.consoleErrors,
  });

  // Navigate to page
  const browserContext = context as { newPage: () => Promise<unknown> };
  const page = await browserContext.newPage();

  try {
    // Set up network interception
    const networkLogs: NetworkLogEntry[] = [];
    const consoleErrors: string[] = [];

    // Type assertion for Playwright page
    const playwrightPage = page as {
      on: (event: string, handler: (arg: unknown) => void) => void;
      goto: (url: string, options?: { timeout?: number; waitUntil?: string }) => Promise<{ status: () => number; url: () => string; headers: () => Record<string, string> } | null>;
      screenshot: (options?: { path?: string; fullPage?: boolean }) => Promise<Buffer>;
      close: () => Promise<void>;
      evaluate: <T>(fn: () => T) => Promise<T>;
    };

    playwrightPage.on('console', (msg: { type: () => string; text: () => string }) => {
      if (msg.type() === 'error') {
        consoleErrors.push(safetyGuard.redact(msg.text()));
      }
    });

    playwrightPage.on('response', (response: { url: () => string; status: () => number; request: () => { method: () => string; resourceType: () => string; timing: () => { responseEnd: number; requestStart: number } } }) => {
      const timing = response.request().timing();
      networkLogs.push({
        url: safetyGuard.redact(response.url()),
        method: response.request().method(),
        status: response.status(),
        responseTime: timing ? timing.responseEnd - timing.requestStart : 0,
        timestamp: new Date().toISOString(),
        resourceType: response.request().resourceType(),
      });
    });

    // Navigate with timeout
    const response = await safetyGuard.timeoutManager.withPageTimeout(
      () => playwrightPage.goto(routeUrl, {
        timeout: config.timeouts.perPage,
        waitUntil: 'networkidle',
      }),
      `Navigate to ${route.path}`
    );

    const pageStatus = response?.status() ?? 0;
    const pageUrl = response?.url() ?? routeUrl;
    const pageHeaders = response?.headers() ?? {};

    // Take screenshot
    let screenshotPath: string | undefined;
    if (config.evidence.screenshots) {
      screenshotPath = path.join(artifactsDir, 'screenshots', `${routeHash}-page.png`);
      await playwrightPage.screenshot({ path: screenshotPath, fullPage: true });
    }

    // Save network logs
    let networkLogPath: string | undefined;
    if (config.evidence.networkLogs && networkLogs.length > 0) {
      networkLogPath = path.join(artifactsDir, 'network', `${routeHash}-network.json`);
      await fs.writeFile(networkLogPath, JSON.stringify(networkLogs, null, 2));
    }

    // Build rule context
    const ruleContext = {
      route,
      response: {
        url: pageUrl,
        status: pageStatus,
        headers: pageHeaders,
      },
      networkLogs,
      consoleErrors,
      allowlist: config.allowlist,
      authContext,
      page: playwrightPage,
    };

    // Execute rules
    const rules = getAllRuntimeRules();
    const ruleResults = await executeRules(rules, ruleContext);

    // Convert rule results to findings
    const findings: RuntimeFinding[] = [];
    const assertions: Array<{ description: string; passed: boolean; expected?: string; actual?: string }> = [];

    for (const result of ruleResults) {
      assertions.push({
        description: result.rule.description,
        passed: result.passed,
      });

      if (!result.passed && result.message) {
        findings.push({
          id: generateFindingId(result.rule.id, route, result.message),
          ruleId: result.rule.id,
          ruleName: result.rule.name,
          severity: result.rule.severity,
          message: result.message,
          route: { method: route.method, path: route.path, actualUrl: pageUrl },
          evidence: {
            screenshotPath: screenshotPath ? path.relative(artifactsDir, screenshotPath) : undefined,
            networkSummary: buildNetworkSummary(networkLogs),
            consoleErrors: consoleErrors.slice(0, 10),
            context: result.evidence,
          },
          timing: {
            startedAt: startedAt.toISOString(),
            completedAt: new Date().toISOString(),
            durationMs: Date.now() - startedAt.getTime(),
          },
        });
      }
    }

    // Determine receipt verdict
    const hasCritical = findings.some(f => f.severity === 'critical');
    const hasHigh = findings.some(f => f.severity === 'high');
    const receiptVerdict = hasCritical || hasHigh ? 'FAIL' :
                          findings.length > 0 ? 'PASS' : 'PASS';

    // Create receipt
    const receipt = createProofReceipt({
      route,
      verdict: receiptVerdict,
      reason: findings.length > 0
        ? `${findings.length} issue(s) found`
        : 'All checks passed',
      assertions,
      traces: screenshotPath
        ? [{ type: 'screenshot', path: path.relative(artifactsDir, screenshotPath) }]
        : [],
    });

    return {
      findings,
      receipt,
      evidence: {
        screenshotPath,
        networkLogPath,
        networkLogs,
        consoleErrors,
      },
    };
  } finally {
    const playwrightPage = page as { close: () => Promise<void> };
    await playwrightPage.close();
  }
}

// ============================================================================
// Main Entry Points
// ============================================================================

/**
 * Main entry point for Reality Mode runtime verification.
 *
 * Performs browser-based verification of routes against defined rules,
 * collecting evidence (screenshots, network logs, console errors) and
 * generating a comprehensive report.
 *
 * @param input - Configuration for the verification run
 * @returns Complete verification output with findings, artifacts, and summary
 * @throws {Error} When repoRoot is invalid or config is missing
 *
 * @example
 * ```typescript
 * const result = await runRealityMode({
 *   repoRoot: '/path/to/project',
 *   routes: [
 *     { method: 'GET', path: '/' },
 *     { method: 'GET', path: '/api/health' },
 *   ],
 *   config: {
 *     baseUrl: 'http://localhost:3000',
 *     evidence: { screenshots: true, networkLogs: true },
 *   },
 * });
 *
 * console.log(`Verdict: ${result.summary.verdict}`);
 * console.log(`Findings: ${result.findings.length}`);
 * ```
 */
export async function runRealityMode(
  input: RealityModeInput
): Promise<RealityModeOutput> {
  // Input validation
  if (!input.repoRoot || typeof input.repoRoot !== 'string') {
    throw new Error('repoRoot is required and must be a non-empty string');
  }

  if (!input.config) {
    throw new Error('config is required');
  }

  const config = { ...DEFAULT_RUNTIME_CONFIG, ...input.config };

  // Generate run ID
  const runId = generateRunId();
  const startedAt = new Date();

  // Create artifacts directory structure
  const artifactsDir = path.join(input.repoRoot, '.vibecheck', 'artifacts', 'reality', runId);
  await fs.mkdir(artifactsDir, { recursive: true });
  await fs.mkdir(path.join(artifactsDir, 'screenshots'), { recursive: true });
  await fs.mkdir(path.join(artifactsDir, 'network'), { recursive: true });
  await fs.mkdir(path.join(artifactsDir, 'receipts'), { recursive: true });

  // Check if we're testing localhost
  const isLocalhost = config.baseUrl.includes('localhost') || config.baseUrl.includes('127.0.0.1');

  // Initialize safety guard (allow loopback for local testing)
  const safetyGuard = new SafetyGuard({
    urlAllowlist: { patterns: config.allowlist },
    ssrfGuard: { allowLoopback: isLocalhost },
    timeouts: config.timeouts,
    concurrency: config.concurrency,
  });

  // Sample routes if needed
  const routesToVerify = sampleRoutes(input.routes, config);

  // Sort routes for deterministic ordering
  const sortedRoutes = sortRoutes(routesToVerify);

  // Results collectors
  const allFindings: RuntimeFinding[] = [];
  const allReceipts: ProofReceipt[] = [];
  const allArtifacts: ArtifactsIndex['artifacts'] = [];
  let routesVerified = 0;
  let routesFailed = 0;
  let routesSkipped = 0;
  let totalArtifactSize = 0;

  // Start run timeout
  let aborted = false;
  safetyGuard.startRun(() => {
    aborted = true;
  });

  try {
    // Try to load Playwright
    const playwright = await loadPlaywright();

    if (!playwright) {
      // Playwright not available - run in pattern-only mode
      return createPatternOnlyOutput(
        runId,
        startedAt,
        input.routes,
        artifactsDir
      );
    }

    // Create videos directory
    const videosDir = path.join(artifactsDir, 'videos');
    await fs.mkdir(videosDir, { recursive: true });

    // Launch browser
    const browser = await playwright.chromium.launch({
      headless: config.browser.headless,
    });

    try {
      // Create browser context with video recording
      const contextOptions: Record<string, unknown> = {
        viewport: config.browser.viewport,
        userAgent: BROWSER_USER_AGENT,
      };

      // Enable video recording if configured
      if (config.evidence.videos) {
        contextOptions.recordVideo = {
          dir: videosDir,
          size: VIDEO_DIMENSIONS,
        };
      }

      const context = await browser.newContext(contextOptions);

      // Set up authentication if provided
      if (input.authContext) {
        await setupAuth(context, input.authContext, config.baseUrl);
      }

      // Process routes
      for (const route of sortedRoutes) {
        // Check if we should abort
        const abortCheck = safetyGuard.shouldAbort();
        if (abortCheck.abort || aborted) {
          routesSkipped += sortedRoutes.length - routesVerified - routesFailed;
          break;
        }

        // Acquire page slot
        await safetyGuard.concurrencyLimiter.acquirePage();

        try {
          const result = await verifyRoute(
            route,
            context,
            config,
            safetyGuard,
            artifactsDir,
            input.authContext
          );

          allFindings.push(...result.findings);
          allReceipts.push(result.receipt);

          // Track artifacts
          if (result.evidence.screenshotPath) {
            const stats = await fs.stat(result.evidence.screenshotPath).catch(() => ({ size: 0 }));
            allArtifacts.push({
              route: `${route.method}:${route.path}`,
              routeHash: getRouteHash(route),
              type: 'screenshot',
              path: path.relative(artifactsDir, result.evidence.screenshotPath),
              sizeBytes: stats.size,
              timestamp: new Date().toISOString(),
            });
            totalArtifactSize += stats.size;
          }

          if (result.evidence.networkLogPath) {
            const stats = await fs.stat(result.evidence.networkLogPath).catch(() => ({ size: 0 }));
            allArtifacts.push({
              route: `${route.method}:${route.path}`,
              routeHash: getRouteHash(route),
              type: 'network',
              path: path.relative(artifactsDir, result.evidence.networkLogPath),
              sizeBytes: stats.size,
              timestamp: new Date().toISOString(),
            });
            totalArtifactSize += stats.size;
          }

          if (result.receipt.verdict === 'FAIL' || result.receipt.verdict === 'ERROR') {
            routesFailed++;
          } else {
            routesVerified++;
          }

          safetyGuard.concurrencyLimiter.markRouteVerified();
        } catch (error) {
          routesFailed++;

          // Create error receipt
          const errorReceipt = createProofReceipt({
            route,
            verdict: 'ERROR',
            reason: error instanceof Error ? error.message : 'Unknown error',
            assertions: [],
            traces: [],
          });
          allReceipts.push(errorReceipt);
        } finally {
          safetyGuard.concurrencyLimiter.releasePage();
        }
      }

      await context.close();
    } finally {
      await browser.close();
    }
  } finally {
    safetyGuard.stopRun();
  }

  const completedAt = new Date();
  const durationMs = completedAt.getTime() - startedAt.getTime();

  // Calculate verdict
  const verdict = calculateVerdict(allFindings);

  // Build artifacts index
  const artifactsIndex: ArtifactsIndex = {
    runId,
    baseDir: artifactsDir,
    artifacts: allArtifacts,
    stats: {
      totalArtifacts: allArtifacts.length,
      totalSizeBytes: totalArtifactSize,
      screenshotCount: allArtifacts.filter(a => a.type === 'screenshot').length,
      traceCount: allArtifacts.filter(a => a.type === 'trace').length,
    },
  };

  // Build summary
  const summary: RunSummary = {
    runId,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs,
    routesTotal: input.routes.length,
    routesVerified,
    routesSkipped,
    routesFailed,
    findingsTotal: allFindings.length,
    findingsBySeverity: countFindingsBySeverity(allFindings),
    verdict,
  };

  // Save artifacts index
  await fs.writeFile(
    path.join(artifactsDir, 'index.json'),
    JSON.stringify(artifactsIndex, null, 2)
  );

  // Save summary
  await fs.writeFile(
    path.join(artifactsDir, 'summary.json'),
    JSON.stringify(summary, null, 2)
  );

  // Save all receipts
  await fs.writeFile(
    path.join(artifactsDir, 'receipts', 'all-receipts.json'),
    JSON.stringify(allReceipts, null, 2)
  );

  // Generate HTML report
  const reportPath = await generateHtmlReport(
    {
      findings: allFindings,
      artifactsIndex,
      receipts: allReceipts,
      summary,
    },
    {
      title: 'Reality Mode Report',
      projectName: path.basename(input.repoRoot),
      baseUrl: config.baseUrl,
      artifactsDir,
    }
  );

  // Collect video artifacts
  let videoArtifacts: RealityModeOutput['videoArtifacts'];
  const videosDir = path.join(artifactsDir, 'videos');
  try {
    const videoFiles = await fs.readdir(videosDir);
    const videoFile = videoFiles.find(f => f.endsWith('.webm') || f.endsWith('.mp4'));
    if (videoFile) {
      const videoPath = path.join(videosDir, videoFile);
      const videoStats = await fs.stat(videoPath);
      // Estimate duration: ~500KB per second for webm at 720p
      const estimatedDuration = Math.round(videoStats.size / 500000);
      
      videoArtifacts = {
        localPath: videoPath,
        duration: estimatedDuration > 0 ? estimatedDuration : undefined,
        screenshots: allArtifacts
          .filter(a => a.type === 'screenshot')
          .map((a, idx) => ({
            url: path.join(artifactsDir, a.path),
            timestamp: idx * 1000, // Estimate timestamp based on order
            route: a.route,
          })),
      };
    }
  } catch {
    // No videos recorded
  }

  return {
    findings: allFindings,
    artifactsIndex,
    receipts: allReceipts,
    reportPath,
    summary,
    videoArtifacts,
    artifactsDir,
  };
}

// ============================================================================
// Seamless Mode Types
// ============================================================================

/**
 * Options for seamless Reality Mode execution.
 */
export interface SeamlessOptions {
  /** Project root directory */
  repoRoot: string;
  /** Routes to verify (from truthpack) */
  routes: RouteDefinition[];
  /** Optional auth context */
  authContext?: AuthContext;
  /** Runtime config overrides */
  config?: Partial<RuntimeConfig>;
  /** Skip if server already running */
  skipIfRunning?: boolean;
  /** Startup timeout (ms) */
  startupTimeout?: number;
  /** Environment variables for server */
  serverEnv?: Record<string, string>;
  /** Verbose logging */
  verbose?: boolean;
  /** Callback when server starts */
  onServerStart?: (info: { url: string; port: number; projectInfo: ProjectInfo }) => void;
  /** Callback when verification starts */
  onVerificationStart?: (info: { routeCount: number }) => void;
  /** Callback on progress */
  onProgress?: (info: { current: number; total: number; route: string }) => void;
  /** Enable AI Chaos Agent */
  chaos?: boolean;
  /** Chaos agent config */
  chaosConfig?: Partial<ChaosAgentConfig>;
}

/**
 * Result from seamless Reality Mode execution.
 */
export interface SeamlessResult extends RealityModeOutput {
  /** Project info that was detected */
  projectInfo: ProjectInfo;
  /** Whether we started the server (vs found existing) */
  serverStarted: boolean;
  /** Base URL that was used */
  baseUrl: string;
  /** Port that was used */
  port: number;
  /** Chaos agent session (if enabled) */
  chaosSession?: ChaosSession;
}

// ============================================================================
// Route Discovery
// ============================================================================

/**
 * Auto-discovers routes by crawling the application.
 *
 * Aggressively discovers routes by:
 * 1. Always including root "/"
 * 2. Loading the homepage and extracting all internal links
 * 3. Adding common route patterns
 *
 * @param baseUrl - The base URL to crawl
 * @param verbose - Whether to log discovery progress
 * @returns Array of discovered routes (limited to MAX_DISCOVERED_ROUTES)
 */
async function discoverRoutes(
  baseUrl: string,
  verbose: boolean = false
): Promise<RouteDefinition[]> {
  const routes: RouteDefinition[] = [];
  const seen = new Set<string>();

  const addRoute = (routePath: string, method: string = 'GET'): void => {
    const normalized = routePath.startsWith('/') ? routePath : `/${routePath}`;
    const key = `${method}:${normalized}`;
    if (!seen.has(key)) {
      seen.add(key);
      routes.push({ method: method as RouteDefinition['method'], path: normalized });
    }
  };

  // Always include root
  addRoute('/');

  // Try to crawl homepage for links
  try {
    const playwright = await loadPlaywright();
    if (playwright) {
      const browser = await (playwright as { chromium: { launch: (opts: { headless: boolean }) => Promise<unknown> } })
        .chromium.launch({ headless: true });

      try {
        const browserObj = browser as { newContext: () => Promise<unknown> };
        const context = await browserObj.newContext();
        const contextObj = context as { newPage: () => Promise<unknown>; close: () => Promise<void> };
        const page = await contextObj.newPage();
        const pageObj = page as {
          goto: (url: string, opts?: { timeout?: number; waitUntil?: string }) => Promise<unknown>;
          evaluate: <T>(fn: () => T) => Promise<T>;
          close: () => Promise<void>;
        };

        await pageObj.goto(baseUrl, { timeout: DEFAULT_PAGE_TIMEOUT, waitUntil: 'domcontentloaded' });

        // Extract all internal links
        const links = await pageObj.evaluate(() => {
          const anchors = document.querySelectorAll('a[href]');
          const hrefs: string[] = [];
          anchors.forEach(a => {
            const href = a.getAttribute('href');
            if (href) {
              // Filter internal links
              if (
                href.startsWith('/') ||
                href.startsWith(window.location.origin) ||
                (!href.startsWith('http') && !href.startsWith('mailto:') && !href.startsWith('tel:') && !href.startsWith('#'))
              ) {
                let linkPath = href;
                if (href.startsWith(window.location.origin)) {
                  linkPath = href.slice(window.location.origin.length);
                }
                if (!linkPath.startsWith('/')) {
                  linkPath = '/' + linkPath;
                }
                // Remove hash and query
                linkPath = linkPath.split('#')[0].split('?')[0];
                if (linkPath && linkPath !== '/') {
                  hrefs.push(linkPath);
                }
              }
            }
          });
          return [...new Set(hrefs)];
        });

        for (const link of links) {
          addRoute(link);
        }

        if (verbose && links.length > 0) {
          // Using console for verbose CLI output
          // eslint-disable-next-line no-console
          console.log(`   Discovered ${links.length} link(s) from homepage`);
        }

        await pageObj.close();
        await contextObj.close();
      } finally {
        const browserClose = browser as { close: () => Promise<void> };
        await browserClose.close();
      }
    }
  } catch (error) {
    if (verbose) {
      const errorMsg = error instanceof Error ? error.message : 'unknown error';
      // Using console for verbose CLI output
      // eslint-disable-next-line no-console
      console.log(`   Could not crawl homepage: ${errorMsg}`);
    }
  }

  // Add common routes as fallbacks
  for (const route of COMMON_ROUTES) {
    addRoute(route);
  }

  // Limit to reasonable number
  return routes.slice(0, MAX_DISCOVERED_ROUTES);
}

// ============================================================================
// Seamless Mode Entry Point
// ============================================================================

/**
 * Runs Reality Mode seamlessly with auto-detection and server management.
 *
 * This "magic" mode handles everything automatically:
 * 1. Detects project type (Next.js, React, Vue, Express, etc.)
 * 2. Finds or starts the dev server
 * 3. Discovers the running port
 * 4. Auto-discovers routes if none provided
 * 5. Runs runtime verification
 * 6. Cleans up (stops server if we started it)
 *
 * @param options - Seamless mode options
 * @returns Extended result with project and server info
 * @throws {Error} When auto-launch fails or project cannot be started
 *
 * @example
 * ```typescript
 * const result = await runRealityModeSeamless({
 *   repoRoot: '/path/to/project',
 *   routes: [],
 *   verbose: true,
 *   onServerStart: (info) => console.log(`Server at ${info.url}`),
 * });
 *
 * console.log(`Project type: ${result.projectInfo.type}`);
 * console.log(`Server started by us: ${result.serverStarted}`);
 * ```
 */
export async function runRealityModeSeamless(
  options: SeamlessOptions
): Promise<SeamlessResult> {
  const {
    repoRoot,
    routes: providedRoutes,
    authContext,
    config: configOverrides,
    skipIfRunning = true,
    startupTimeout = DEFAULT_STARTUP_TIMEOUT,
    serverEnv,
    verbose = false,
    onServerStart,
    onVerificationStart,
    onProgress,
  } = options;

  // Input validation
  if (!repoRoot || typeof repoRoot !== 'string') {
    throw new Error('repoRoot is required and must be a non-empty string');
  }

  // Auto-launch the project
  if (verbose) {
    // Using console for verbose CLI output
    // eslint-disable-next-line no-console
    console.log('\n🚀 Reality Mode - Seamless Launch');
    // eslint-disable-next-line no-console
    console.log('━'.repeat(40));
  }

  let launchResult: LaunchResult;
  try {
    launchResult = await autoLaunch({
      projectRoot: repoRoot,
      skipIfRunning,
      startupTimeout,
      env: serverEnv,
      verbose,
      autoInstall: true,
      maxAttempts: MAX_LAUNCH_ATTEMPTS,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(`Auto-launch failed: ${errorMsg}`);
  }

  if (!launchResult.success) {
    throw new Error(`Failed to start project: ${launchResult.error}`);
  }

  // Notify server started
  if (onServerStart) {
    onServerStart({
      url: launchResult.baseUrl,
      port: launchResult.port,
      projectInfo: launchResult.projectInfo,
    });
  }

  if (verbose) {
    const serverStatus = launchResult.startedByUs ? 'started' : 'found existing';
    // Using console for verbose CLI output
    // eslint-disable-next-line no-console
    console.log(`✓ Server ${serverStatus} at ${launchResult.baseUrl}`);
    // eslint-disable-next-line no-console
    console.log(`  Project: ${launchResult.projectInfo.type}`);
    // eslint-disable-next-line no-console
    console.log(`  Package manager: ${launchResult.projectInfo.packageManager}`);
    if (launchResult.successfulCommand) {
      // eslint-disable-next-line no-console
      console.log(`  Command: ${launchResult.successfulCommand}`);
    }
    // eslint-disable-next-line no-console
    console.log('');
  }

  try {
    // Build runtime config with auto-detected URL
    const runtimeConfig: RuntimeConfig = {
      ...DEFAULT_RUNTIME_CONFIG,
      ...configOverrides,
      baseUrl: launchResult.baseUrl,
      allowlist: [
        ...(configOverrides?.allowlist ?? []),
        `localhost:${launchResult.port}`,
        `127.0.0.1:${launchResult.port}`,
      ],
    };

    // Auto-discover routes if none provided
    let routes = providedRoutes;
    if (!routes || routes.length === 0) {
      if (verbose) {
        // eslint-disable-next-line no-console
        console.log('📡 No routes in truthpack, auto-discovering...');
      }
      routes = await discoverRoutes(launchResult.baseUrl, verbose);
      if (verbose) {
        // eslint-disable-next-line no-console
        console.log(`   Found ${routes.length} route(s) to verify`);
      }
    }

    // Notify verification starting
    if (onVerificationStart) {
      onVerificationStart({ routeCount: routes.length });
    }

    if (verbose) {
      // eslint-disable-next-line no-console
      console.log(`🔍 Verifying ${routes.length} route(s)...`);
    }

    // Run the actual verification
    const result = await runRealityMode({
      repoRoot,
      routes,
      authContext,
      config: runtimeConfig,
    });

    if (verbose) {
      // eslint-disable-next-line no-console
      console.log('');
      // eslint-disable-next-line no-console
      console.log('━'.repeat(40));
      // eslint-disable-next-line no-console
      console.log('✓ Verification complete');
      // eslint-disable-next-line no-console
      console.log(`  Routes verified: ${result.summary.routesVerified}/${result.summary.routesTotal}`);
      // eslint-disable-next-line no-console
      console.log(`  Findings: ${result.summary.findingsTotal}`);
      // eslint-disable-next-line no-console
      console.log(`  Verdict: ${result.summary.verdict.toUpperCase()}`);
      if (result.reportPath) {
        // eslint-disable-next-line no-console
        console.log(`  Report: ${result.reportPath}`);
      }
    }

    // Run AI Chaos Agent if enabled
    let chaosSession: ChaosSession | undefined;
    const chaosProvider = options.chaosConfig?.provider ?? 'ollama';
    const needsApiKey = chaosProvider === 'anthropic' || chaosProvider === 'openai';
    const hasRequiredConfig = needsApiKey ? !!options.chaosConfig?.apiKey : true;

    if (options.chaos && hasRequiredConfig) {
      if (verbose) {
        // eslint-disable-next-line no-console
        console.log('');
        // eslint-disable-next-line no-console
        console.log('━'.repeat(40));
        // eslint-disable-next-line no-console
        console.log('🤖 Starting AI Chaos Agent...');
      }

      try {
        const playwright = await loadPlaywright();
        if (playwright) {
          const playwrightObj = playwright as {
            chromium: {
              launch: (opts: { headless: boolean }) => Promise<{
                newContext: () => Promise<{
                  newPage: () => Promise<unknown>;
                  close: () => Promise<void>;
                }>;
                close: () => Promise<void>;
              }>;
            };
          };

          const browser = await playwrightObj.chromium.launch({
            headless: runtimeConfig.browser.headless,
          });

          try {
            const context = await browser.newContext();
            const page = await context.newPage();

            const agent = new AIChaosAgent({
              ...options.chaosConfig,
              artifactsDir: path.join(repoRoot, '.vibecheck', 'artifacts', 'reality'),
              verbose,
            });

            chaosSession = await agent.run(page as unknown as import('playwright').Page, launchResult.baseUrl);

            // Add chaos findings to main findings
            for (const chaosFinding of chaosSession.findings) {
              result.findings.push({
                id: chaosFinding.id,
                ruleName: `chaos-${chaosFinding.type}`,
                route: { method: 'GET', path: chaosFinding.url },
                severity: chaosFinding.severity,
                message: chaosFinding.description,
                evidence: {
                  screenshotPath: chaosFinding.screenshot,
                  consoleErrors: chaosFinding.consoleErrors,
                },
                timestamp: chaosFinding.timestamp,
              });
            }

            if (verbose) {
              // eslint-disable-next-line no-console
              console.log('✓ Chaos Agent complete');
              // eslint-disable-next-line no-console
              console.log(`  Actions: ${chaosSession.totalActions}`);
              // eslint-disable-next-line no-console
              console.log(`  Findings: ${chaosSession.findings.length}`);
            }

            await context.close();
          } finally {
            await browser.close();
          }
        }
      } catch (chaosError) {
        if (verbose) {
          // eslint-disable-next-line no-console
          console.log(`⚠️ Chaos Agent error: ${chaosError}`);
        }
      }
    }

    return {
      ...result,
      projectInfo: launchResult.projectInfo,
      serverStarted: launchResult.startedByUs,
      baseUrl: launchResult.baseUrl,
      port: launchResult.port,
      chaosSession,
    };
  } finally {
    // Always cleanup (stop server if we started it)
    await launchResult.cleanup();
  }
}

// ============================================================================
// Quick Verify Entry Point
// ============================================================================

/**
 * Quick verification with minimal configuration.
 *
 * Just point it at a project and let it do everything automatically.
 *
 * @param projectRoot - Path to the project root
 * @param options - Optional configuration
 * @returns Complete verification result
 *
 * @example
 * ```typescript
 * // Absolute minimum - just a path
 * const result = await quickVerify('/path/to/project');
 *
 * // With some options
 * const result = await quickVerify('/path/to/project', {
 *   verbose: true,
 *   routes: [{ method: 'GET', path: '/api/health' }],
 * });
 * ```
 */
export async function quickVerify(
  projectRoot: string,
  options: {
    verbose?: boolean;
    routes?: RouteDefinition[];
  } = {}
): Promise<SeamlessResult> {
  // Input validation
  if (!projectRoot || typeof projectRoot !== 'string') {
    throw new Error('projectRoot is required and must be a non-empty string');
  }

  const { verbose = false, routes } = options;

  // If no routes provided, create a basic home route
  const routesToVerify = routes ?? [
    { method: 'GET' as const, path: '/' },
  ];

  return runRealityModeSeamless({
    repoRoot: projectRoot,
    routes: routesToVerify,
    verbose,
  });
}
