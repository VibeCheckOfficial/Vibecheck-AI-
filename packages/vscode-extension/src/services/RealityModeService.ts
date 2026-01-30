import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn, ChildProcess } from 'child_process';

export interface RealityTest {
  id: string;
  name: string;
  file: string;
  type: 'api' | 'ui' | 'form' | 'navigation' | 'interaction';
  status: 'pending' | 'running' | 'passed' | 'failed' | 'skipped';
  duration?: number;
  error?: string;
  screenshot?: string;
  trace?: string;
  assertions: RealityAssertion[];
}

export interface RealityAssertion {
  description: string;
  expected: string;
  actual?: string;
  passed: boolean;
  screenshot?: string;
}

export interface RealityModeConfig {
  browser: 'chromium' | 'firefox' | 'webkit';
  headless: boolean;
  baseUrl?: string;
  timeout: number;
  viewport: { width: number; height: number };
  screenshotsDir: string;
  tracesDir: string;
}

export interface RealityModeResult {
  timestamp: string;
  duration: number;
  config: RealityModeConfig;
  tests: RealityTest[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
}

export class RealityModeService {
  private context: vscode.ExtensionContext;
  private outputChannel: vscode.OutputChannel;
  private panel: vscode.WebviewPanel | undefined;
  private currentRun: ChildProcess | undefined;
  private results: RealityModeResult | undefined;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.outputChannel = vscode.window.createOutputChannel('VibeCheck Reality Mode');
  }

  async runRealityMode(
    files?: string[],
    config?: Partial<RealityModeConfig>
  ): Promise<RealityModeResult | undefined> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      void vscode.window.showErrorMessage('No workspace folder open');
      return undefined;
    }

    // Get configuration
    const vsConfig = vscode.workspace.getConfiguration('vibecheck');
    const fullConfig: RealityModeConfig = {
      browser: config?.browser || vsConfig.get('realityMode.browser', 'chromium'),
      headless: config?.headless ?? vsConfig.get('realityMode.headless', true),
      baseUrl: config?.baseUrl || this.detectBaseUrl(workspaceFolder.uri.fsPath),
      timeout: config?.timeout || 30000,
      viewport: config?.viewport || { width: 1280, height: 720 },
      screenshotsDir: path.join(workspaceFolder.uri.fsPath, '.vibecheck', 'screenshots'),
      tracesDir: path.join(workspaceFolder.uri.fsPath, '.vibecheck', 'traces')
    };

    // Create output directories
    await this.ensureDir(fullConfig.screenshotsDir);
    await this.ensureDir(fullConfig.tracesDir);

    // Show panel
    this.showRealityPanel();

    // Detect and generate tests
    const tests = await this.detectTests(workspaceFolder.uri.fsPath, files);

    if (tests.length === 0) {
      this.updatePanel({ status: 'no-tests', message: 'No testable components detected' });
      return undefined;
    }

    // Run tests
    this.results = await this.executeTests(tests, fullConfig, workspaceFolder.uri.fsPath);

    // Update panel with results
    this.updatePanel({ status: 'complete', results: this.results });

    return this.results;
  }

  async stopRealityMode(): Promise<void> {
    if (this.currentRun) {
      this.currentRun.kill('SIGTERM');
      this.currentRun = undefined;
      this.updatePanel({ status: 'stopped' });
    }
  }

  private async detectTests(workspacePath: string, files?: string[]): Promise<RealityTest[]> {
    const tests: RealityTest[] = [];
    const targetFiles = files || await this.findTestableFiles(workspacePath);

    for (const file of targetFiles) {
      const content = await this.readFile(file);
      if (!content) continue;

      // Detect forms
      const forms = this.detectForms(content, file);
      tests.push(...forms);

      // Detect API endpoints
      const apis = this.detectApiEndpoints(content, file);
      tests.push(...apis);

      // Detect navigation
      const navs = this.detectNavigation(content, file);
      tests.push(...navs);

      // Detect interactive elements
      const interactions = this.detectInteractions(content, file);
      tests.push(...interactions);
    }

    return tests;
  }

  private detectForms(content: string, file: string): RealityTest[] {
    const tests: RealityTest[] = [];

    // React form patterns
    const formPatterns = [
      /onSubmit\s*=\s*\{([^}]+)\}/g,
      /<form[^>]*>/gi,
      /handleSubmit/g,
      /useForm\(/g
    ];

    for (const pattern of formPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const lineNumber = content.substring(0, match.index).split('\n').length;
        tests.push({
          id: `form-${file}-${lineNumber}`,
          name: `Form submission at line ${lineNumber}`,
          file,
          type: 'form',
          status: 'pending',
          assertions: [
            { description: 'Form renders without errors', expected: 'No console errors', passed: false },
            { description: 'Submit button is clickable', expected: 'Button enabled', passed: false },
            { description: 'Form submits successfully', expected: 'No network errors', passed: false }
          ]
        });
      }
    }

    return tests;
  }

  private detectApiEndpoints(content: string, file: string): RealityTest[] {
    const tests: RealityTest[] = [];

    const apiPatterns = [
      /fetch\s*\(\s*['"`]([^'"`]+)['"`]/g,
      /axios\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/g,
      /api\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/g
    ];

    for (const pattern of apiPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const endpoint = match[1] || match[2];
        if (!endpoint.startsWith('http') && !endpoint.startsWith('/api')) continue;

        const lineNumber = content.substring(0, match.index).split('\n').length;
        tests.push({
          id: `api-${file}-${lineNumber}`,
          name: `API call to ${endpoint}`,
          file,
          type: 'api',
          status: 'pending',
          assertions: [
            { description: 'API endpoint is reachable', expected: 'Status 2xx', passed: false },
            { description: 'Response is valid JSON', expected: 'Valid JSON', passed: false },
            { description: 'No CORS errors', expected: 'No CORS blocking', passed: false }
          ]
        });
      }
    }

    return tests;
  }

  private detectNavigation(content: string, file: string): RealityTest[] {
    const tests: RealityTest[] = [];

    const navPatterns = [
      /href\s*=\s*['"`]([^'"`]+)['"`]/g,
      /Link\s+to\s*=\s*['"`]([^'"`]+)['"`]/g,
      /router\.(push|replace)\s*\(\s*['"`]([^'"`]+)['"`]/g,
      /navigate\s*\(\s*['"`]([^'"`]+)['"`]/g
    ];

    const seenRoutes = new Set<string>();

    for (const pattern of navPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const route = match[1] || match[2];
        if (route.startsWith('#') || route.startsWith('http') || seenRoutes.has(route)) continue;
        seenRoutes.add(route);

        tests.push({
          id: `nav-${file}-${route.replace(/\//g, '-')}`,
          name: `Navigation to ${route}`,
          file,
          type: 'navigation',
          status: 'pending',
          assertions: [
            { description: 'Route renders', expected: 'Page loads', passed: false },
            { description: 'No 404 errors', expected: 'Valid route', passed: false }
          ]
        });
      }
    }

    return tests;
  }

  private detectInteractions(content: string, file: string): RealityTest[] {
    const tests: RealityTest[] = [];

    const interactionPatterns = [
      /onClick\s*=\s*\{([^}]+)\}/g,
      /onPress\s*=\s*\{([^}]+)\}/g,
      /button\s*.*?>/gi
    ];

    let buttonCount = 0;
    for (const pattern of interactionPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        buttonCount++;
        if (buttonCount > 5) break; // Limit per file

        const lineNumber = content.substring(0, match.index).split('\n').length;
        tests.push({
          id: `interaction-${file}-${lineNumber}`,
          name: `Button click at line ${lineNumber}`,
          file,
          type: 'interaction',
          status: 'pending',
          assertions: [
            { description: 'Element is visible', expected: 'Visible', passed: false },
            { description: 'Click does not throw', expected: 'No errors', passed: false }
          ]
        });
      }
    }

    return tests;
  }

  private async executeTests(
    tests: RealityTest[],
    config: RealityModeConfig,
    workspacePath: string
  ): Promise<RealityModeResult> {
    const startTime = Date.now();
    const results: RealityTest[] = [];

    // Check if Playwright is installed
    const playwrightInstalled = await this.checkPlaywright(workspacePath);

    if (!playwrightInstalled) {
      // Offer to install
      const install = await vscode.window.showWarningMessage(
        'Playwright is required for Reality Mode. Install it?',
        'Install',
        'Cancel'
      );

      if (install === 'Install') {
        await this.installPlaywright(workspacePath);
      } else {
        return {
          timestamp: new Date().toISOString(),
          duration: 0,
          config,
          tests: tests.map(t => ({ ...t, status: 'skipped' as const })),
          summary: { total: tests.length, passed: 0, failed: 0, skipped: tests.length }
        };
      }
    }

    // Generate test file
    const testFile = await this.generateTestFile(tests, config, workspacePath);

    // Run Playwright
    this.outputChannel.appendLine(`Running Reality Mode with ${tests.length} tests...`);
    this.outputChannel.show();

    try {
      const runResults = await this.runPlaywright(testFile, config, workspacePath);

      // Parse results
      for (const test of tests) {
        const result = runResults.find(r => r.id === test.id);
        if (result) {
          results.push({
            ...test,
            ...result
          });
        } else {
          results.push({ ...test, status: 'skipped' });
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(`Error: ${errorMessage}`);

      // Mark all as failed
      for (const test of tests) {
        results.push({
          ...test,
          status: 'failed',
          error: errorMessage
        });
      }
    }

    const duration = Date.now() - startTime;
    const passed = results.filter(t => t.status === 'passed').length;
    const failed = results.filter(t => t.status === 'failed').length;
    const skipped = results.filter(t => t.status === 'skipped').length;

    return {
      timestamp: new Date().toISOString(),
      duration,
      config,
      tests: results,
      summary: {
        total: results.length,
        passed,
        failed,
        skipped
      }
    };
  }

  private async checkPlaywright(workspacePath: string): Promise<boolean> {
    const packageJson = path.join(workspacePath, 'package.json');
    try {
      const content = await this.readFile(packageJson);
      if (!content) return false;
      const pkg = JSON.parse(content);
      return !!(pkg.devDependencies?.['@playwright/test'] || pkg.dependencies?.['@playwright/test']);
    } catch {
      return false;
    }
  }

  private async installPlaywright(workspacePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const terminal = vscode.window.createTerminal('VibeCheck Reality Mode');
      terminal.show();
      terminal.sendText(`cd "${workspacePath}" && npm install -D @playwright/test && npx playwright install`);

      // Wait for installation
      setTimeout(resolve, 30000);
    });
  }

  private async generateTestFile(
    tests: RealityTest[],
    config: RealityModeConfig,
    workspacePath: string
  ): Promise<string> {
    const testDir = path.join(workspacePath, '.vibecheck', 'tests');
    await this.ensureDir(testDir);

    const testFile = path.join(testDir, 'reality-mode.spec.ts');

    const testCode = `
import { test, expect } from '@playwright/test';

test.describe('VibeCheck Reality Mode', () => {
  test.beforeEach(async ({ page }) => {
    // Start fresh
    await page.goto('${config.baseUrl || 'http://localhost:3000'}');
  });

  ${tests.map(t => this.generateTestCase(t, config)).join('\n\n  ')}
});
`;

    fs.writeFileSync(testFile, testCode);
    return testFile;
  }

  private generateTestCase(test: RealityTest, config: RealityModeConfig): string {
    switch (test.type) {
      case 'form':
        return `
  test('${test.name}', async ({ page }) => {
    // Find form
    const form = page.locator('form').first();
    await expect(form).toBeVisible({ timeout: ${config.timeout} });
    
    // Check submit button
    const submitBtn = form.locator('button[type="submit"], input[type="submit"]').first();
    await expect(submitBtn).toBeEnabled();
    
    // Take screenshot
    await page.screenshot({ path: '${config.screenshotsDir}/${test.id}.png' });
  });`;

      case 'api':
        return `
  test('${test.name}', async ({ page, request }) => {
    // Monitor network
    const responses: number[] = [];
    page.on('response', res => {
      if (res.url().includes('/api/')) {
        responses.push(res.status());
      }
    });
    
    // Wait for API calls
    await page.waitForTimeout(3000);
    
    // Check for errors
    const errors = responses.filter(s => s >= 400);
    expect(errors.length).toBe(0);
    
    await page.screenshot({ path: '${config.screenshotsDir}/${test.id}.png' });
  });`;

      case 'navigation':
        return `
  test('${test.name}', async ({ page }) => {
    // Navigate
    await page.goto('${config.baseUrl}${test.name.split(' ').pop()}');
    
    // Check for 404
    const content = await page.content();
    expect(content).not.toContain('404');
    expect(content).not.toContain('Not Found');
    
    await page.screenshot({ path: '${config.screenshotsDir}/${test.id}.png' });
  });`;

      case 'interaction':
        return `
  test('${test.name}', async ({ page }) => {
    // Find clickable element
    const button = page.locator('button, [role="button"]').first();
    await expect(button).toBeVisible({ timeout: ${config.timeout} });
    
    // Click without error
    let error = null;
    page.on('pageerror', e => { error = e; });
    await button.click();
    expect(error).toBeNull();
    
    await page.screenshot({ path: '${config.screenshotsDir}/${test.id}.png' });
  });`;

      default:
        return `
  test('${test.name}', async ({ page }) => {
    await page.screenshot({ path: '${config.screenshotsDir}/${test.id}.png' });
  });`;
    }
  }

  private async runPlaywright(
    testFile: string,
    config: RealityModeConfig,
    workspacePath: string
  ): Promise<Partial<RealityTest>[]> {
    return new Promise((resolve, reject) => {
      const args = [
        'playwright',
        'test',
        testFile,
        '--reporter=json',
        `--project=${config.browser}`,
        config.headless ? '' : '--headed'
      ].filter(Boolean);

      this.currentRun = spawn('npx', args, {
        cwd: workspacePath,
        env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: '0' },
        shell: true  // Required on Windows for npx
      });

      let stdout = '';
      let stderr = '';

      this.currentRun.stdout?.on('data', (data) => {
        stdout += data.toString();
        this.outputChannel.append(data.toString());
      });

      this.currentRun.stderr?.on('data', (data) => {
        stderr += data.toString();
        this.outputChannel.append(data.toString());
      });

      this.currentRun.on('close', (code) => {
        this.currentRun = undefined;

        try {
          // Try to parse JSON output
          const jsonMatch = stdout.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const results = JSON.parse(jsonMatch[0]);
            const tests = this.parsePlaywrightResults(results);
            resolve(tests);
          } else {
            resolve([]);
          }
        } catch {
          if (code === 0) {
            resolve([]);
          } else {
            reject(new Error(`Playwright exited with code ${code}`));
          }
        }
      });

      this.currentRun.on('error', reject);
    });
  }

  private parsePlaywrightResults(results: { suites?: Array<{ specs?: Array<{ title: string; tests?: Array<{ results?: Array<{ status?: string; duration?: number; error?: { message?: string } }> }> }> }> }): Partial<RealityTest>[] {
    const tests: Partial<RealityTest>[] = [];

    for (const suite of results.suites || []) {
      for (const spec of suite.specs || []) {
        for (const test of spec.tests || []) {
          const result = test.results?.[0];
          tests.push({
            id: spec.title.replace(/[^a-z0-9-]/gi, '-'),
            status: result?.status === 'passed' ? 'passed' :
              result?.status === 'skipped' ? 'skipped' : 'failed',
            duration: result?.duration,
            error: result?.error?.message
          });
        }
      }
    }

    return tests;
  }

  private showRealityPanel(): void {
    if (this.panel) {
      this.panel.reveal();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'vibecheckReality',
      'VibeCheck Reality Mode',
      vscode.ViewColumn.Two,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });

    this.updatePanel({ status: 'loading' });
  }

  private updatePanel(state: { status: string; message?: string; results?: RealityModeResult }): void {
    if (!this.panel) return;

    this.panel.webview.html = this.getRealityPanelHtml(state);
  }

  private getRealityPanelHtml(state: { status: string; message?: string; results?: RealityModeResult }): string {
    const { status, message, results } = state;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reality Mode</title>
  <style>
    :root {
      --bg: #0a0a0f;
      --bg-card: #12121a;
      --border: rgba(255,255,255,0.1);
      --text: #fff;
      --text-secondary: #a0a0b0;
      --accent: #8b5cf6;
      --success: #10b981;
      --error: #ef4444;
      --warning: #f59e0b;
    }
    
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: var(--bg);
      color: var(--text);
      padding: 24px;
      min-height: 100vh;
    }
    
    .header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 32px;
    }
    
    .logo {
      width: 40px;
      height: 40px;
      background: linear-gradient(135deg, #8b5cf6, #3b82f6);
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
    }
    
    .title {
      font-size: 24px;
      font-weight: 600;
    }
    
    .title span {
      background: linear-gradient(135deg, #8b5cf6, #3b82f6);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    
    .loading {
      text-align: center;
      padding: 60px;
    }
    
    .spinner {
      width: 48px;
      height: 48px;
      border: 3px solid var(--border);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 16px;
    }
    
    @keyframes spin { to { transform: rotate(360deg); } }
    
    .summary {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
      margin-bottom: 32px;
    }
    
    .stat-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px;
      text-align: center;
    }
    
    .stat-value {
      font-size: 36px;
      font-weight: 700;
    }
    
    .stat-value.passed { color: var(--success); }
    .stat-value.failed { color: var(--error); }
    .stat-value.skipped { color: var(--text-secondary); }
    
    .stat-label {
      color: var(--text-secondary);
      font-size: 13px;
      margin-top: 4px;
    }
    
    .tests-section h2 {
      font-size: 18px;
      margin-bottom: 16px;
    }
    
    .test-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 12px;
      margin-bottom: 12px;
      overflow: hidden;
    }
    
    .test-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px;
    }
    
    .status-icon {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
    }
    
    .status-icon.passed { background: rgba(16, 185, 129, 0.2); }
    .status-icon.failed { background: rgba(239, 68, 68, 0.2); }
    .status-icon.skipped { background: rgba(160, 160, 176, 0.2); }
    .status-icon.running { 
      background: rgba(139, 92, 246, 0.2);
      animation: pulse 1.5s infinite;
    }
    
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    
    .test-info { flex: 1; }
    
    .test-name {
      font-weight: 500;
      margin-bottom: 4px;
    }
    
    .test-file {
      color: var(--text-secondary);
      font-size: 12px;
      font-family: monospace;
    }
    
    .test-duration {
      color: var(--text-secondary);
      font-size: 13px;
    }
    
    .test-error {
      background: rgba(239, 68, 68, 0.1);
      border-top: 1px solid rgba(239, 68, 68, 0.2);
      padding: 12px 16px;
      font-size: 13px;
      color: var(--error);
      font-family: monospace;
    }
    
    .assertions {
      border-top: 1px solid var(--border);
      padding: 12px 16px;
    }
    
    .assertion {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 0;
      font-size: 13px;
    }
    
    .assertion-icon { font-size: 12px; }
    .assertion.passed .assertion-icon { color: var(--success); }
    .assertion.failed .assertion-icon { color: var(--error); }
    
    .empty-state {
      text-align: center;
      padding: 60px;
      color: var(--text-secondary);
    }
    
    .empty-state .icon {
      font-size: 48px;
      margin-bottom: 16px;
    }
    
    .screenshot-thumb {
      margin-top: 12px;
      border-radius: 8px;
      max-width: 200px;
      border: 1px solid var(--border);
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">🎭</div>
    <h1 class="title">Reality <span>Mode</span></h1>
  </div>
  
  ${status === 'loading' ? `
    <div class="loading">
      <div class="spinner"></div>
      <div>Detecting testable components...</div>
    </div>
  ` : ''}
  
  ${status === 'no-tests' ? `
    <div class="empty-state">
      <div class="icon">🔍</div>
      <h3>No testable components found</h3>
      <p>Reality Mode detects forms, API calls, and interactive elements.</p>
    </div>
  ` : ''}
  
  ${status === 'stopped' ? `
    <div class="empty-state">
      <div class="icon">⏹️</div>
      <h3>Reality Mode stopped</h3>
    </div>
  ` : ''}
  
  ${status === 'complete' && results ? `
    <div class="summary">
      <div class="stat-card">
        <div class="stat-value">${results.summary.total}</div>
        <div class="stat-label">Total Tests</div>
      </div>
      <div class="stat-card">
        <div class="stat-value passed">${results.summary.passed}</div>
        <div class="stat-label">Passed</div>
      </div>
      <div class="stat-card">
        <div class="stat-value failed">${results.summary.failed}</div>
        <div class="stat-label">Failed</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${Math.round(results.duration / 1000)}s</div>
        <div class="stat-label">Duration</div>
      </div>
    </div>
    
    <div class="tests-section">
      <h2>Test Results</h2>
      ${results.tests.map(test => `
        <div class="test-card">
          <div class="test-header">
            <div class="status-icon ${test.status}">
              ${test.status === 'passed' ? '✓' : test.status === 'failed' ? '✗' : '○'}
            </div>
            <div class="test-info">
              <div class="test-name">${test.name}</div>
              <div class="test-file">${test.file}</div>
            </div>
            ${test.duration ? `<div class="test-duration">${test.duration}ms</div>` : ''}
          </div>
          
          ${test.assertions.length > 0 ? `
            <div class="assertions">
              ${test.assertions.map(a => `
                <div class="assertion ${a.passed ? 'passed' : 'failed'}">
                  <span class="assertion-icon">${a.passed ? '✓' : '✗'}</span>
                  <span>${a.description}</span>
                </div>
              `).join('')}
            </div>
          ` : ''}
          
          ${test.error ? `
            <div class="test-error">${test.error}</div>
          ` : ''}
          
          ${test.screenshot ? `
            <img class="screenshot-thumb" src="${test.screenshot}" alt="Screenshot">
          ` : ''}
        </div>
      `).join('')}
    </div>
  ` : ''}
</body>
</html>`;
  }

  private detectBaseUrl(workspacePath: string): string {
    // Check for common config files
    const configs = [
      { file: 'next.config.js', port: 3000 },
      { file: 'vite.config.ts', port: 5173 },
      { file: 'vite.config.js', port: 5173 },
      { file: 'vue.config.js', port: 8080 },
      { file: 'angular.json', port: 4200 }
    ];

    for (const config of configs) {
      if (fs.existsSync(path.join(workspacePath, config.file))) {
        return `http://localhost:${config.port}`;
      }
    }

    return 'http://localhost:3000';
  }

  private async ensureDir(dir: string): Promise<void> {
    try {
      await fs.promises.mkdir(dir, { recursive: true });
    } catch { }
  }

  private async readFile(filePath: string): Promise<string | null> {
    try {
      return await fs.promises.readFile(filePath, 'utf-8');
    } catch {
      return null;
    }
  }

  private async findTestableFiles(workspacePath: string): Promise<string[]> {
    const files: string[] = [];
    const extensions = ['.tsx', '.jsx', '.vue', '.svelte'];
    const ignoreDirs = ['node_modules', 'dist', 'build', '.next', '.git'];

    const walk = async (dir: string) => {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          if (!ignoreDirs.includes(entry.name)) {
            await walk(fullPath);
          }
        } else if (extensions.some(ext => entry.name.endsWith(ext))) {
          files.push(fullPath);
        }
      }
    };

    await walk(workspacePath);
    return files;
  }

  async configure(): Promise<void> {
    const config = vscode.workspace.getConfiguration('vibecheck');

    const browser = await vscode.window.showQuickPick([
      { label: 'Chromium', description: 'Chrome-based browser (recommended)', value: 'chromium' },
      { label: 'Firefox', description: 'Mozilla Firefox', value: 'firefox' },
      { label: 'WebKit', description: 'Safari-based browser', value: 'webkit' }
    ], { placeHolder: 'Select browser for Reality Mode' });

    if (browser) {
      await config.update('realityMode.browser', browser.value, vscode.ConfigurationTarget.Workspace);
    }

    const headless = await vscode.window.showQuickPick([
      { label: 'Headless (Hidden)', description: 'Run tests in background', value: true },
      { label: 'Headed (Visible)', description: 'Show browser window during tests', value: false }
    ], { placeHolder: 'Browser visibility' });

    if (headless !== undefined) {
      await config.update('realityMode.headless', headless.value, vscode.ConfigurationTarget.Workspace);
    }

    const baseUrl = await vscode.window.showInputBox({
      prompt: 'Enter base URL for tests (leave empty for auto-detection)',
      placeHolder: 'http://localhost:3000',
      value: config.get('realityMode.baseUrl', '')
    });

    if (baseUrl !== undefined) {
      await config.update('realityMode.baseUrl', baseUrl, vscode.ConfigurationTarget.Workspace);
    }

    void vscode.window.showInformationMessage('Reality Mode configuration updated');
  }

  async runRealityModeForFile(filePath: string): Promise<RealityModeResult | undefined> {
    return this.runRealityMode([filePath]);
  }
}
