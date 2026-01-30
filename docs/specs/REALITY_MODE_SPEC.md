# REALITY_MODE_SPEC.md - Technical Specification

> **Phase 1 Deliverable**: Detailed specification for Reality Mode in VibeCheck-Real
> 
> **Date**: 2026-01-29
> **Version**: 1.0.0

---

## A. What Reality Mode Does in VibeCheck-Real

### A.1 Overview

Reality Mode provides **runtime verification** that catches "convincing wrongness" by:
1. Actually executing the application in a browser
2. Crawling routes from the truthpack
3. Collecting evidence (screenshots, traces, network logs)
4. Detecting fake data, mock APIs, and broken functionality
5. Producing tamper-evident proof receipts tied to findings

### A.2 Inputs

```typescript
interface RealityModeInput {
  /** Absolute path to repository root */
  repoRoot: string;
  
  /** Route list from truthpack */
  routes: RouteDefinition[];
  
  /** Environment configuration from truthpack */
  envMap: Record<string, EnvVariable>;
  
  /** Optional authentication state */
  authContext?: AuthContext;
  
  /** Runtime configuration */
  config: RealityModeConfig;
}

interface RouteDefinition {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  auth?: { required: boolean; roles?: string[] };
  source?: { file: string; line: number };
}

interface AuthContext {
  type: 'cookie' | 'header' | 'form' | 'basic';
  credentials: Record<string, string>;
  loginUrl?: string;
  loginSelectors?: {
    username?: string;
    password?: string;
    submit?: string;
  };
}

interface RealityModeConfig {
  /** Base URL of the running application */
  baseUrl: string;
  
  /** URL allowlist patterns */
  allowlist: string[];
  
  /** Timeouts */
  timeouts: {
    perAction: number;     // Default: 10000ms
    perPage: number;       // Default: 30000ms
    globalRun: number;     // Default: 300000ms (5min)
    networkRequest: number; // Default: 15000ms
  };
  
  /** Concurrency limits */
  concurrency: {
    maxPages: number;      // Default: 2, Max: 4
    maxRoutes: number;     // Default: 50, Max: 200
    maxRequests: number;   // Default: 10, Max: 20
  };
  
  /** Evidence collection options */
  evidence: {
    screenshots: boolean;  // Default: true
    traces: boolean;       // Default: false (large files)
    networkLogs: boolean;  // Default: true
    consoleErrors: boolean; // Default: true
  };
  
  /** Browser options */
  browser: {
    headless: boolean;     // Default: true
    viewport: { width: number; height: number }; // Default: 1280x720
  };
  
  /** Sampling for large route lists */
  sampling: {
    enabled: boolean;      // Default: true if routes > 50
    strategy: 'random' | 'priority' | 'coverage';
    maxRoutes: number;     // Max routes to verify
  };
}
```

### A.3 Outputs

```typescript
interface RealityModeOutput {
  /** Findings with evidence attachments */
  findings: RealityFinding[];
  
  /** Artifacts folder structure */
  artifactsIndex: ArtifactsIndex;
  
  /** Proof receipts for each verified route */
  receipts: ProofReceipt[];
  
  /** Run summary */
  summary: RunSummary;
}

interface RealityFinding {
  /** Stable finding ID (hash of ruleId + route + evidence) */
  id: string;
  
  /** Rule that generated this finding */
  ruleId: string;
  
  /** Human-readable rule name */
  ruleName: string;
  
  /** Severity level */
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  
  /** Finding message */
  message: string;
  
  /** Route that was verified */
  route: {
    method: string;
    path: string;
    actualUrl: string;
  };
  
  /** Evidence pointers */
  evidence: {
    screenshotPath?: string;
    tracePath?: string;
    networkSummary?: NetworkSummary;
    consoleErrors?: string[];
  };
  
  /** Timing information */
  timing: {
    startedAt: string;
    completedAt: string;
    durationMs: number;
  };
}

interface ArtifactsIndex {
  /** Run identifier */
  runId: string;
  
  /** Base directory for artifacts */
  baseDir: string;
  
  /** Index of all artifacts */
  artifacts: Array<{
    route: string;
    routeHash: string;
    type: 'screenshot' | 'trace' | 'network' | 'console';
    path: string;
    sizeBytes: number;
    timestamp: string;
  }>;
  
  /** Summary statistics */
  stats: {
    totalArtifacts: number;
    totalSizeBytes: number;
    screenshotCount: number;
    traceCount: number;
  };
}

interface NetworkSummary {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  blockedDomains: string[];
  statusCodes: Record<number, number>;
  avgResponseTime: number;
}

interface RunSummary {
  runId: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  routesTotal: number;
  routesVerified: number;
  routesSkipped: number;
  routesFailed: number;
  findingsTotal: number;
  findingsBySeverity: Record<string, number>;
  verdict: 'pass' | 'warn' | 'fail';
}
```

### A.4 Artifacts Folder Structure

```
.vibecheck/artifacts/reality/<runId>/
├── index.json                    # ArtifactsIndex
├── summary.json                  # RunSummary
├── receipts/
│   ├── <routeHash>-receipt.json  # ProofReceipt per route
│   └── all-receipts.json         # Consolidated receipts
├── screenshots/
│   ├── <routeHash>-page.png      # Full page screenshot
│   └── <routeHash>-failure.png   # Failure screenshot (if any)
├── traces/
│   └── <routeHash>-trace.zip     # Playwright trace (if enabled)
├── network/
│   └── <routeHash>-network.json  # Network summary per route
└── logs/
    ├── console.json              # Aggregated console errors
    └── run.log                   # Execution log
```

### A.5 Receipts JSON Schema

```typescript
interface ProofReceipt {
  /** Schema version for forward compatibility */
  schemaVersion: 'vibecheck.proof.v2';
  
  /** Unique proof ID */
  id: string;
  
  /** Human-readable title */
  title: string;
  
  /** Category of verification */
  category: 'route_hit' | 'auth_gate' | 'ui_flow' | 'api_response' | 'error_handling';
  
  /** Pass/Fail verdict */
  verdict: 'PASS' | 'FAIL' | 'SKIP' | 'TIMEOUT' | 'ERROR';
  
  /** Human-readable explanation */
  reason: string;
  
  /** Failure details (if verdict is FAIL) */
  failureDetail?: {
    expected: string;
    actual: string;
    diff?: string;
  };
  
  /** Subject of verification */
  subject: {
    type: 'route' | 'page' | 'api';
    identifier: string;
    method?: string;
    url?: string;
  };
  
  /** Pointers to evidence artifacts */
  traces: Array<{
    type: 'screenshot' | 'trace' | 'network' | 'log';
    path: string;
    offset?: number;
    timestamp?: string;
  }>;
  
  /** Timing information */
  timing: {
    startedAt: string;
    completedAt: string;
    durationMs: number;
  };
  
  /** Assertions that were checked */
  assertions: Array<{
    description: string;
    passed: boolean;
    expected?: string;
    actual?: string;
  }>;
  
  /** Confidence score 0-100 */
  confidence: number;
  
  /** SHA-256 signature for tamper detection */
  signature: string;
}
```

---

## B. Threat Model & Safety Controls

### B.1 Threat Model

| Threat | Impact | Likelihood | Mitigation |
|--------|--------|------------|------------|
| **SSRF via crafted URL** | Critical | Medium | URL allowlist + IP blocklist |
| **Credential leakage in logs** | High | High | Automatic redaction |
| **Resource exhaustion (DoS)** | Medium | Medium | Timeouts + concurrency limits |
| **Infinite redirect loop** | Low | Medium | Max redirect limit (5) |
| **Malicious script execution** | Medium | Low | Sandboxed browser context |
| **File system access** | Critical | Low | Scoped to artifacts dir only |

### B.2 URL Allowlist

```typescript
interface UrlAllowlistConfig {
  /** User-defined allowed patterns */
  patterns: string[];
  
  /** Default safe patterns (always included) */
  defaultPatterns: [
    'localhost:*',
    '127.0.0.1:*',
    '0.0.0.0:*',
  ];
  
  /** Block all requests not matching allowlist */
  blockUnlisted: boolean; // Default: true
}

function isUrlAllowed(url: string, config: UrlAllowlistConfig): boolean {
  const parsed = new URL(url);
  const allPatterns = [...config.defaultPatterns, ...config.patterns];
  
  for (const pattern of allPatterns) {
    if (matchesPattern(parsed.host, pattern)) {
      return true;
    }
  }
  
  return !config.blockUnlisted;
}
```

### B.3 SSRF Defenses (Private/Link-Local/Metadata IP Ranges)

```typescript
const BLOCKED_IP_RANGES: Array<{ cidr: string; description: string }> = [
  // IPv4 Private Ranges
  { cidr: '10.0.0.0/8', description: 'Private Class A' },
  { cidr: '172.16.0.0/12', description: 'Private Class B' },
  { cidr: '192.168.0.0/16', description: 'Private Class C' },
  
  // IPv4 Link-Local
  { cidr: '169.254.0.0/16', description: 'Link-Local' },
  
  // Cloud Metadata Services
  { cidr: '169.254.169.254/32', description: 'AWS/GCP Metadata' },
  { cidr: '100.100.100.200/32', description: 'Alibaba Metadata' },
  { cidr: '192.0.0.192/32', description: 'Oracle Metadata' },
  
  // IPv4 Loopback (except localhost which is allowlisted)
  // Note: 127.0.0.1 is allowed via allowlist for local testing
  
  // IPv6 Private/Link-Local
  { cidr: '::1/128', description: 'IPv6 Localhost' },
  { cidr: 'fc00::/7', description: 'IPv6 Unique Local' },
  { cidr: 'fe80::/10', description: 'IPv6 Link-Local' },
  { cidr: 'fd00::/8', description: 'IPv6 Private' },
];

function isBlockedIp(ip: string): { blocked: boolean; reason?: string } {
  for (const range of BLOCKED_IP_RANGES) {
    if (ipInCidr(ip, range.cidr)) {
      return { blocked: true, reason: range.description };
    }
  }
  return { blocked: false };
}

// DNS rebinding protection: resolve hostname before request
async function resolveAndValidate(hostname: string): Promise<string> {
  const addresses = await dns.resolve(hostname);
  for (const addr of addresses) {
    const check = isBlockedIp(addr);
    if (check.blocked) {
      throw new Error(`DNS resolved to blocked IP range: ${check.reason}`);
    }
  }
  return addresses[0];
}
```

### B.4 No Remote Code Execution

- Browser runs in **sandboxed context** (Playwright default)
- No `eval()` or dynamic code execution
- No shell command execution from browser context
- File writes **only** to `.vibecheck/artifacts/` directory

### B.5 Redaction Rules

```typescript
const REDACTION_RULES: Array<{ pattern: RegExp; replacement: string }> = [
  // JWT tokens
  { 
    pattern: /Bearer\s+[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+/g,
    replacement: 'Bearer [REDACTED_JWT]'
  },
  
  // API keys (various formats)
  { 
    pattern: /api[_-]?key[=:]\s*["']?[A-Za-z0-9\-_]{20,}/gi,
    replacement: 'api_key=[REDACTED_API_KEY]'
  },
  
  // Passwords
  { 
    pattern: /password[=:]\s*["']?[^"'\s&]+/gi,
    replacement: 'password=[REDACTED]'
  },
  
  // Secrets
  { 
    pattern: /secret[=:]\s*["']?[^"'\s&]+/gi,
    replacement: 'secret=[REDACTED]'
  },
  
  // Generic tokens
  { 
    pattern: /token[=:]\s*["']?[A-Za-z0-9\-_]{20,}/gi,
    replacement: 'token=[REDACTED_TOKEN]'
  },
  
  // Session IDs
  { 
    pattern: /session[_-]?id[=:]\s*["']?[A-Za-z0-9\-_]+/gi,
    replacement: 'session_id=[REDACTED]'
  },
  
  // Cookie values (in Set-Cookie headers)
  { 
    pattern: /Set-Cookie:\s*[^;]+/gi,
    replacement: 'Set-Cookie: [REDACTED]'
  },
  
  // Authorization headers
  { 
    pattern: /Authorization:\s*.+/gi,
    replacement: 'Authorization: [REDACTED]'
  },
];

function redactSensitive(text: string): string {
  let result = text;
  for (const rule of REDACTION_RULES) {
    result = result.replace(rule.pattern, rule.replacement);
  }
  return result;
}
```

### B.6 Resource Caps

| Resource | Default | Maximum | Rationale |
|----------|---------|---------|-----------|
| Max pages open | 2 | 4 | Memory constraints |
| Max routes per run | 50 | 200 | Time constraints |
| Max requests per page | 100 | 500 | Prevent DoS |
| Max response body size | 5MB | 10MB | Memory constraints |
| Max screenshot size | 2MB | 5MB | Storage constraints |
| Max trace size | 50MB | 100MB | Storage constraints |
| Max total artifacts | 500MB | 1GB | Disk constraints |

---

## C. Performance Strategy

### C.1 Route Sampling for Large Repos

```typescript
interface SamplingStrategy {
  /** Sampling method */
  method: 'random' | 'priority' | 'coverage';
  
  /** Max routes to sample */
  maxRoutes: number;
  
  /** Priority weights (for 'priority' method) */
  priorityWeights?: {
    authRequired: number;    // Prioritize auth-protected routes
    hasParameters: number;   // Prioritize parameterized routes
    recentlyChanged: number; // Prioritize recently changed
    criticalPath: number;    // Prioritize critical user flows
  };
}

function sampleRoutes(
  routes: RouteDefinition[],
  strategy: SamplingStrategy
): RouteDefinition[] {
  if (routes.length <= strategy.maxRoutes) {
    return routes;
  }
  
  switch (strategy.method) {
    case 'random':
      return shuffleArray(routes).slice(0, strategy.maxRoutes);
      
    case 'priority':
      return routes
        .map(r => ({ route: r, score: calculatePriorityScore(r, strategy.priorityWeights) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, strategy.maxRoutes)
        .map(r => r.route);
        
    case 'coverage':
      // Select routes to maximize path coverage
      return selectForCoverage(routes, strategy.maxRoutes);
      
    default:
      return routes.slice(0, strategy.maxRoutes);
  }
}
```

### C.2 Cache Key

```typescript
interface CacheKey {
  /** Hash of repo state (git SHA or file hashes) */
  repoHash: string;
  
  /** Hash of runtime config */
  configHash: string;
  
  /** Reality Mode engine version */
  engineVersion: string;
  
  /** Routes hash (sorted, normalized) */
  routesHash: string;
}

function computeCacheKey(
  repoRoot: string,
  config: RealityModeConfig,
  routes: RouteDefinition[]
): string {
  const repoHash = getGitSha(repoRoot) || hashDirectory(repoRoot);
  const configHash = hashObject(config);
  const routesHash = hashObject(normalizeRoutes(routes));
  
  return createHash('sha256')
    .update(`${repoHash}:${configHash}:${ENGINE_VERSION}:${routesHash}`)
    .digest('hex')
    .slice(0, 16);
}
```

### C.3 Warm-Run Behavior

```typescript
interface WarmRunOptions {
  /** Reuse artifacts if cache key matches */
  reuseIfValid: boolean;
  
  /** Max age of cached artifacts (ms) */
  maxAge: number; // Default: 3600000 (1 hour)
  
  /** Force full run even if cache is valid */
  forceFullRun: boolean;
}

async function checkWarmRun(
  cacheKey: string,
  options: WarmRunOptions
): Promise<{ warm: boolean; artifacts?: ArtifactsIndex }> {
  if (options.forceFullRun) {
    return { warm: false };
  }
  
  const cachedIndex = await loadCachedArtifactsIndex(cacheKey);
  if (!cachedIndex) {
    return { warm: false };
  }
  
  const age = Date.now() - new Date(cachedIndex.summary.completedAt).getTime();
  if (age > options.maxAge) {
    return { warm: false };
  }
  
  return { warm: true, artifacts: cachedIndex };
}
```

---

## D. Determinism Requirements

### D.1 Stable Route Ordering

```typescript
function sortRoutes(routes: RouteDefinition[]): RouteDefinition[] {
  return [...routes].sort((a, b) => {
    // Primary: method (GET < POST < PUT < PATCH < DELETE)
    const methodOrder = { GET: 0, POST: 1, PUT: 2, PATCH: 3, DELETE: 4 };
    const methodDiff = (methodOrder[a.method] ?? 5) - (methodOrder[b.method] ?? 5);
    if (methodDiff !== 0) return methodDiff;
    
    // Secondary: path (lexicographic)
    return a.path.localeCompare(b.path);
  });
}
```

### D.2 Stable Artifact Names

```typescript
function getArtifactName(
  route: RouteDefinition,
  type: 'screenshot' | 'trace' | 'network'
): string {
  // Normalize route for hashing
  const normalized = `${route.method}:${route.path}`.toLowerCase();
  const hash = createHash('sha256')
    .update(normalized)
    .digest('hex')
    .slice(0, 8);
  
  const extensions = {
    screenshot: 'png',
    trace: 'zip',
    network: 'json',
  };
  
  return `${hash}-${type}.${extensions[type]}`;
}
```

### D.3 Stable Finding IDs

```typescript
function generateFindingId(
  ruleId: string,
  route: RouteDefinition,
  evidenceHash: string
): string {
  const content = [
    ruleId,
    route.method,
    route.path,
    evidenceHash,
  ].join(':');
  
  return createHash('sha256')
    .update(content)
    .digest('hex')
    .slice(0, 16);
}
```

---

## E. Entitlements (Feature Gating)

### E.1 Mapping to Existing Entitlement Keys

Reality Mode features map to **existing** entitlement keys only:

| Feature | Entitlement Key | Tier |
|---------|----------------|------|
| Basic runtime verification | `CLOUD_SYNC` | Free (limited) |
| Full runtime verification | `ENTERPRISE_REPORTS` | Pro |
| Trace collection | `ENTERPRISE_REPORTS` | Pro |
| Extended route limits | `ENTERPRISE_REPORTS` | Pro |

### E.2 Free Tier Limits

```typescript
const FREE_TIER_LIMITS = {
  maxRoutesPerRun: 10,
  maxArtifactSize: 50 * 1024 * 1024, // 50MB
  tracesEnabled: false,
  screenshotsEnabled: true,
  networkLogsEnabled: true,
};
```

### E.3 Pro Tier Limits

```typescript
const PRO_TIER_LIMITS = {
  maxRoutesPerRun: 200,
  maxArtifactSize: 1024 * 1024 * 1024, // 1GB
  tracesEnabled: true,
  screenshotsEnabled: true,
  networkLogsEnabled: true,
};
```

### E.4 Server-Side Enforcement

Runtime proof results are validated server-side before accepting:

```typescript
interface ProofValidation {
  /** Verify signature matches content */
  signatureValid: boolean;
  
  /** Verify within entitlement limits */
  withinLimits: boolean;
  
  /** Verify timestamp is recent (within 24h) */
  timestampValid: boolean;
  
  /** Overall acceptance */
  accepted: boolean;
}
```

---

## F. Runtime Rules (Ported from Old Project)

### F.1 Fake Domain Detection

```typescript
const RULE_FAKE_DOMAIN: RuntimeRule = {
  id: 'reality/fake-domain',
  name: 'Fake Domain Usage',
  description: 'Detects requests to known fake/mock API domains',
  severity: 'critical',
  
  check: async (context: RuleContext) => {
    const blockedDomains = context.networkLogs
      .filter(req => !isUrlAllowed(req.url, context.allowlist))
      .map(req => new URL(req.url).hostname);
    
    if (blockedDomains.length > 0) {
      return {
        pass: false,
        message: `Requests to non-allowlisted domains: ${[...new Set(blockedDomains)].join(', ')}`,
        evidence: { blockedDomains },
      };
    }
    
    return { pass: true };
  },
};
```

### F.2 Fake Success Detection

```typescript
const RULE_FAKE_SUCCESS: RuntimeRule = {
  id: 'reality/fake-success',
  name: 'Fake Success UI',
  description: 'Detects success UI displayed despite network failures',
  severity: 'high',
  
  check: async (context: RuleContext) => {
    const failedRequests = context.networkLogs.filter(r => r.status >= 400);
    const hasSuccessUI = await context.page.evaluate(() => {
      const successIndicators = [
        '.success', '.alert-success', '[data-success]',
        '.toast-success', '.notification-success',
      ];
      return successIndicators.some(sel => document.querySelector(sel));
    });
    
    if (failedRequests.length > 0 && hasSuccessUI) {
      return {
        pass: false,
        message: 'Success UI shown but network requests failed',
        evidence: {
          failedRequests: failedRequests.map(r => ({ url: r.url, status: r.status })),
          hasSuccessUI: true,
        },
      };
    }
    
    return { pass: true };
  },
};
```

### F.3 Missing Route Detection

```typescript
const RULE_MISSING_ROUTE: RuntimeRule = {
  id: 'reality/missing-route',
  name: 'Missing Route Behavior',
  description: 'Detects routes that return 404 at runtime but exist in truthpack',
  severity: 'high',
  
  check: async (context: RuleContext) => {
    if (context.response.status === 404) {
      return {
        pass: false,
        message: `Route ${context.route.path} returned 404 but is declared in truthpack`,
        evidence: {
          expectedRoute: context.route,
          actualStatus: context.response.status,
        },
      };
    }
    
    return { pass: true };
  },
};
```

### F.4 Auth Drift Detection

```typescript
const RULE_AUTH_DRIFT: RuntimeRule = {
  id: 'reality/auth-drift',
  name: 'Auth Drift',
  description: 'Detects protected pages that render without auth gate',
  severity: 'critical',
  
  check: async (context: RuleContext) => {
    if (!context.route.auth?.required) {
      return { pass: true }; // Not an auth-required route
    }
    
    // Check if page rendered content without redirect to login
    const hasContent = await context.page.evaluate(() => {
      const mainContent = document.querySelector('main, [role="main"], #app, #root');
      return mainContent && mainContent.textContent.trim().length > 100;
    });
    
    const wasRedirected = context.response.url.includes('login') || 
                          context.response.url.includes('signin');
    
    if (hasContent && !wasRedirected && !context.authContext) {
      return {
        pass: false,
        message: `Protected route ${context.route.path} rendered content without authentication`,
        evidence: {
          route: context.route,
          expectedAuthRequired: true,
          actuallyProtected: false,
        },
      };
    }
    
    return { pass: true };
  },
};
```

---

## G. Entry Point API

```typescript
/**
 * Main entry point for Reality Mode
 */
export async function runRealityMode(
  input: RealityModeInput
): Promise<RealityModeOutput> {
  // 1. Validate inputs
  validateInput(input);
  
  // 2. Check cache for warm run
  const cacheKey = computeCacheKey(input.repoRoot, input.config, input.routes);
  const warmCheck = await checkWarmRun(cacheKey, input.config.warmRun);
  if (warmCheck.warm) {
    return loadCachedResults(warmCheck.artifacts);
  }
  
  // 3. Sample routes if needed
  const routesToVerify = input.config.sampling.enabled
    ? sampleRoutes(input.routes, input.config.sampling)
    : input.routes;
  
  // 4. Sort routes for determinism
  const sortedRoutes = sortRoutes(routesToVerify);
  
  // 5. Initialize browser with safety controls
  const browser = await initBrowser(input.config.browser);
  const safetyGuard = new SafetyGuard(input.config);
  
  // 6. Create artifacts directory
  const runId = generateRunId();
  const artifactsDir = createArtifactsDir(input.repoRoot, runId);
  
  // 7. Run verification with timeout
  const results = await withGlobalTimeout(
    input.config.timeouts.globalRun,
    async () => {
      const findings: RealityFinding[] = [];
      const receipts: ProofReceipt[] = [];
      
      for (const route of sortedRoutes) {
        const result = await verifyRoute(route, {
          browser,
          safetyGuard,
          config: input.config,
          authContext: input.authContext,
          artifactsDir,
        });
        
        findings.push(...result.findings);
        receipts.push(result.receipt);
      }
      
      return { findings, receipts };
    }
  );
  
  // 8. Generate artifacts index
  const artifactsIndex = await generateArtifactsIndex(artifactsDir, runId);
  
  // 9. Clean up
  await browser.close();
  
  // 10. Return results
  return {
    findings: results.findings,
    artifactsIndex,
    receipts: results.receipts,
    summary: generateSummary(results, sortedRoutes, runId),
  };
}
```

---

*End of REALITY_MODE_SPEC.md*
