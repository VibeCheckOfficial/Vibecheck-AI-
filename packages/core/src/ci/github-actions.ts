/**
 * GitHub Actions Workflow Generator
 * 
 * Generates GitHub Actions workflow configurations for VibeCheck.
 */

// ============================================================================
// Types
// ============================================================================

export interface WorkflowOptions {
  /** Workflow name */
  name?: string;
  /** Trigger on push */
  onPush?: boolean;
  /** Trigger on pull request */
  onPullRequest?: boolean;
  /** Branches to trigger on */
  branches?: string[];
  /** Node.js version */
  nodeVersion?: string;
  /** Package manager (npm, pnpm, yarn) */
  packageManager?: 'npm' | 'pnpm' | 'yarn';
  /** Upload SARIF to GitHub Security */
  uploadSarif?: boolean;
  /** Run secrets scan */
  runSecretsScan?: boolean;
  /** Run vulnerability scan */
  runVulnScan?: boolean;
  /** Fail on findings */
  failOnFindings?: boolean;
  /** Upload HTML report as artifact */
  uploadReport?: boolean;
  /** Additional commands to run */
  additionalCommands?: string[];
}

export interface WorkflowOutput {
  /** The generated YAML content */
  yaml: string;
  /** File path relative to repo root */
  path: string;
}

// ============================================================================
// Default Options
// ============================================================================

const DEFAULT_OPTIONS: Required<WorkflowOptions> = {
  name: 'VibeCheck Security Scan',
  onPush: true,
  onPullRequest: true,
  branches: ['main', 'master'],
  nodeVersion: '20',
  packageManager: 'npm',
  uploadSarif: true,
  runSecretsScan: true,
  runVulnScan: true,
  failOnFindings: true,
  uploadReport: true,
  additionalCommands: [],
};

// ============================================================================
// Workflow Generator
// ============================================================================

/**
 * Generate a GitHub Actions workflow for VibeCheck
 */
export function generateWorkflow(options: WorkflowOptions = {}): WorkflowOutput {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const lines: string[] = [];

  // Header
  lines.push(`name: ${opts.name}`);
  lines.push('');

  // Triggers
  lines.push('on:');
  
  if (opts.onPush) {
    lines.push('  push:');
    lines.push('    branches:');
    for (const branch of opts.branches) {
      lines.push(`      - ${branch}`);
    }
  }
  
  if (opts.onPullRequest) {
    lines.push('  pull_request:');
    lines.push('    branches:');
    for (const branch of opts.branches) {
      lines.push(`      - ${branch}`);
    }
  }
  
  lines.push('');

  // Permissions for SARIF upload
  if (opts.uploadSarif) {
    lines.push('permissions:');
    lines.push('  contents: read');
    lines.push('  security-events: write');
    lines.push('');
  }

  // Jobs
  lines.push('jobs:');
  lines.push('  security-scan:');
  lines.push('    name: Security Scan');
  lines.push('    runs-on: ubuntu-latest');
  lines.push('');
  lines.push('    steps:');
  
  // Checkout
  lines.push('      - name: Checkout code');
  lines.push('        uses: actions/checkout@v4');
  lines.push('');
  
  // Setup Node.js
  lines.push('      - name: Setup Node.js');
  lines.push('        uses: actions/setup-node@v4');
  lines.push('        with:');
  lines.push(`          node-version: '${opts.nodeVersion}'`);
  
  if (opts.packageManager === 'pnpm') {
    lines.push('');
    lines.push('      - name: Install pnpm');
    lines.push('        uses: pnpm/action-setup@v2');
    lines.push('        with:');
    lines.push("          version: 'latest'");
  }
  
  lines.push('');
  
  // Cache
  lines.push('      - name: Cache dependencies');
  if (opts.packageManager === 'pnpm') {
    lines.push('        uses: actions/cache@v4');
    lines.push('        with:');
    lines.push('          path: ~/.pnpm-store');
    lines.push("          key: ${{ runner.os }}-pnpm-${{ hashFiles('**/pnpm-lock.yaml') }}");
    lines.push('          restore-keys: |');
    lines.push('            ${{ runner.os }}-pnpm-');
  } else if (opts.packageManager === 'yarn') {
    lines.push('        uses: actions/cache@v4');
    lines.push('        with:');
    lines.push('          path: ~/.yarn/cache');
    lines.push("          key: ${{ runner.os }}-yarn-${{ hashFiles('**/yarn.lock') }}");
    lines.push('          restore-keys: |');
    lines.push('            ${{ runner.os }}-yarn-');
  } else {
    lines.push('        uses: actions/cache@v4');
    lines.push('        with:');
    lines.push('          path: ~/.npm');
    lines.push("          key: ${{ runner.os }}-npm-${{ hashFiles('**/package-lock.json') }}");
    lines.push('          restore-keys: |');
    lines.push('            ${{ runner.os }}-npm-');
  }
  lines.push('');
  
  // Install dependencies
  lines.push('      - name: Install dependencies');
  const installCmd = getInstallCommand(opts.packageManager);
  lines.push(`        run: ${installCmd}`);
  lines.push('');
  
  // Install VibeCheck
  lines.push('      - name: Install VibeCheck');
  const globalInstallCmd = getGlobalInstallCommand(opts.packageManager);
  lines.push(`        run: ${globalInstallCmd} vibecheck-ai`);
  lines.push('');
  
  // Run security scan
  const scanFlags: string[] = [];
  if (opts.uploadSarif || opts.uploadReport) {
    scanFlags.push('--output sarif');
    scanFlags.push('--output-file vibecheck-results.sarif');
  }
  if (!opts.failOnFindings) {
    scanFlags.push('|| true');
  }
  
  lines.push('      - name: Run VibeCheck scan');
  lines.push(`        run: vibecheck scan ${scanFlags.join(' ')}`);
  
  if (opts.failOnFindings) {
    lines.push('        continue-on-error: true');
    lines.push('        id: scan');
  }
  lines.push('');
  
  // Secrets scan
  if (opts.runSecretsScan) {
    lines.push('      - name: Run secrets scan');
    lines.push('        run: vibecheck secrets --output sarif --output-file secrets-results.sarif || true');
    lines.push('');
  }
  
  // Upload SARIF
  if (opts.uploadSarif) {
    lines.push('      - name: Upload SARIF to GitHub Security');
    lines.push('        uses: github/codeql-action/upload-sarif@v3');
    lines.push('        if: always()');
    lines.push('        with:');
    lines.push('          sarif_file: vibecheck-results.sarif');
    lines.push('          category: vibecheck');
    lines.push('');
    
    if (opts.runSecretsScan) {
      lines.push('      - name: Upload secrets SARIF');
      lines.push('        uses: github/codeql-action/upload-sarif@v3');
      lines.push('        if: always()');
      lines.push('        with:');
      lines.push('          sarif_file: secrets-results.sarif');
      lines.push('          category: vibecheck-secrets');
      lines.push('');
    }
  }
  
  // Generate HTML report
  if (opts.uploadReport) {
    lines.push('      - name: Generate HTML report');
    lines.push('        run: vibecheck report --output html --output-file vibecheck-report.html');
    lines.push('');
    
    lines.push('      - name: Upload report artifact');
    lines.push('        uses: actions/upload-artifact@v4');
    lines.push('        if: always()');
    lines.push('        with:');
    lines.push('          name: vibecheck-report');
    lines.push('          path: vibecheck-report.html');
    lines.push('          retention-days: 30');
    lines.push('');
  }
  
  // Additional commands
  for (const cmd of opts.additionalCommands) {
    lines.push(`      - name: Run ${cmd.split(' ')[0]}`);
    lines.push(`        run: ${cmd}`);
    lines.push('');
  }
  
  // Check scan result
  if (opts.failOnFindings) {
    lines.push('      - name: Check scan results');
    lines.push("        if: steps.scan.outcome == 'failure'");
    lines.push('        run: |');
    lines.push('          echo "::error::VibeCheck found security issues"');
    lines.push('          exit 1');
  }

  return {
    yaml: lines.join('\n'),
    path: '.github/workflows/vibecheck.yml',
  };
}

// ============================================================================
// Helpers
// ============================================================================

function getInstallCommand(packageManager: 'npm' | 'pnpm' | 'yarn'): string {
  switch (packageManager) {
    case 'pnpm': return 'pnpm install --frozen-lockfile';
    case 'yarn': return 'yarn install --frozen-lockfile';
    default: return 'npm ci';
  }
}

function getGlobalInstallCommand(packageManager: 'npm' | 'pnpm' | 'yarn'): string {
  switch (packageManager) {
    case 'pnpm': return 'pnpm add -g';
    case 'yarn': return 'yarn global add';
    default: return 'npm install -g';
  }
}

// ============================================================================
// Pre-built Templates
// ============================================================================

/**
 * Minimal workflow template
 */
export function generateMinimalWorkflow(): WorkflowOutput {
  return generateWorkflow({
    name: 'VibeCheck',
    uploadSarif: false,
    uploadReport: false,
    runSecretsScan: false,
    runVulnScan: false,
    failOnFindings: false,
  });
}

/**
 * Full security workflow template
 */
export function generateFullWorkflow(): WorkflowOutput {
  return generateWorkflow({
    name: 'VibeCheck Security Suite',
    uploadSarif: true,
    uploadReport: true,
    runSecretsScan: true,
    runVulnScan: true,
    failOnFindings: true,
  });
}

/**
 * PR-only workflow template
 */
export function generatePRWorkflow(): WorkflowOutput {
  return generateWorkflow({
    name: 'VibeCheck PR Check',
    onPush: false,
    onPullRequest: true,
    uploadSarif: true,
    uploadReport: false,
    failOnFindings: true,
  });
}
