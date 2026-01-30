/**
 * CI/CD Integration Module
 *
 * Detects CI/CD platform and generates appropriate workflow files
 * to integrate VibeCheck into the pipeline.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

// ============================================================================
// TYPES
// ============================================================================

export type CIPlatform =
  | 'github-actions'
  | 'gitlab-ci'
  | 'circleci'
  | 'azure-pipelines'
  | 'jenkins'
  | 'bitbucket-pipelines'
  | 'travis-ci'
  | 'vercel'
  | 'netlify'
  | 'unknown';

export interface CIDetectionResult {
  platform: CIPlatform;
  configFile?: string;
  existing: boolean;
  canIntegrate: boolean;
  message: string;
}

export interface CIIntegrationResult {
  success: boolean;
  platform: CIPlatform;
  filesCreated: string[];
  filesModified: string[];
  instructions: string[];
  errors?: string[];
}

export interface CIIntegrationOptions {
  /** Project root path */
  projectPath: string;
  /** Include check command */
  includeCheck?: boolean;
  /** Include ship command (pre-deploy gate) */
  includeShip?: boolean;
  /** Include Forge rule generation */
  includeForge?: boolean;
  /** Branch to run on (default: main, master) */
  branches?: string[];
  /** Node version (default: 20) */
  nodeVersion?: string;
  /** Package manager (auto-detected) */
  packageManager?: 'npm' | 'yarn' | 'pnpm' | 'bun';
  /** Fail build on VibeCheck errors */
  failOnError?: boolean;
  /** Run on pull requests */
  runOnPR?: boolean;
}

// ============================================================================
// DETECTION
// ============================================================================

/**
 * Detect CI/CD platform from project files
 */
export async function detectCIPlatform(projectPath: string): Promise<CIDetectionResult> {
  const checks: Array<{
    platform: CIPlatform;
    paths: string[];
    configFile: string;
  }> = [
    {
      platform: 'github-actions',
      paths: ['.github/workflows'],
      configFile: '.github/workflows/vibecheck.yml',
    },
    {
      platform: 'gitlab-ci',
      paths: ['.gitlab-ci.yml'],
      configFile: '.gitlab-ci.yml',
    },
    {
      platform: 'circleci',
      paths: ['.circleci/config.yml', '.circleci'],
      configFile: '.circleci/config.yml',
    },
    {
      platform: 'azure-pipelines',
      paths: ['azure-pipelines.yml', '.azure-pipelines'],
      configFile: 'azure-pipelines.yml',
    },
    {
      platform: 'jenkins',
      paths: ['Jenkinsfile'],
      configFile: 'Jenkinsfile',
    },
    {
      platform: 'bitbucket-pipelines',
      paths: ['bitbucket-pipelines.yml'],
      configFile: 'bitbucket-pipelines.yml',
    },
    {
      platform: 'travis-ci',
      paths: ['.travis.yml'],
      configFile: '.travis.yml',
    },
    {
      platform: 'vercel',
      paths: ['vercel.json', '.vercel'],
      configFile: 'vercel.json',
    },
    {
      platform: 'netlify',
      paths: ['netlify.toml'],
      configFile: 'netlify.toml',
    },
  ];

  for (const check of checks) {
    for (const checkPath of check.paths) {
      const fullPath = path.join(projectPath, checkPath);
      try {
        await fs.access(fullPath);

        // Check if vibecheck is already integrated
        const isDir = (await fs.stat(fullPath)).isDirectory();
        let existing = false;

        if (!isDir) {
          const content = await fs.readFile(fullPath, 'utf-8');
          existing = content.includes('vibecheck');
        } else if (check.platform === 'github-actions') {
          // Check for existing vibecheck workflow
          try {
            await fs.access(path.join(projectPath, '.github/workflows/vibecheck.yml'));
            existing = true;
          } catch {
            // Not found
          }
        }

        return {
          platform: check.platform,
          configFile: check.configFile,
          existing,
          canIntegrate: true,
          message: existing
            ? `${check.platform} detected with existing VibeCheck integration`
            : `${check.platform} detected, ready for integration`,
        };
      } catch {
        // Path doesn't exist, continue checking
      }
    }
  }

  // Check for git repo (could set up GitHub Actions)
  try {
    await fs.access(path.join(projectPath, '.git'));
    return {
      platform: 'github-actions',
      configFile: '.github/workflows/vibecheck.yml',
      existing: false,
      canIntegrate: true,
      message: 'Git repository detected. Will set up GitHub Actions workflow.',
    };
  } catch {
    // No git
  }

  return {
    platform: 'unknown',
    existing: false,
    canIntegrate: false,
    message: 'No CI/CD platform detected. Initialize a git repository first.',
  };
}

/**
 * Detect package manager
 */
export async function detectPackageManager(
  projectPath: string
): Promise<'npm' | 'yarn' | 'pnpm' | 'bun'> {
  const lockFiles = [
    { file: 'pnpm-lock.yaml', manager: 'pnpm' as const },
    { file: 'yarn.lock', manager: 'yarn' as const },
    { file: 'bun.lockb', manager: 'bun' as const },
    { file: 'package-lock.json', manager: 'npm' as const },
  ];

  for (const { file, manager } of lockFiles) {
    try {
      await fs.access(path.join(projectPath, file));
      return manager;
    } catch {
      // Continue
    }
  }

  return 'npm';
}

// ============================================================================
// WORKFLOW GENERATORS
// ============================================================================

/**
 * Generate GitHub Actions workflow
 */
function generateGitHubActionsWorkflow(options: CIIntegrationOptions): string {
  const pm = options.packageManager ?? 'npm';
  const nodeVersion = options.nodeVersion ?? '20';
  const branches = options.branches ?? ['main', 'master'];
  const failFlag = options.failOnError !== false ? '' : ' || true';

  const installCmd = {
    npm: 'npm ci',
    yarn: 'yarn install --frozen-lockfile',
    pnpm: 'pnpm install --frozen-lockfile',
    bun: 'bun install --frozen-lockfile',
  }[pm];

  const runCmd = {
    npm: 'npx',
    yarn: 'yarn',
    pnpm: 'pnpm exec',
    bun: 'bunx',
  }[pm];

  let workflow = `# VibeCheck CI/CD Integration
# Auto-generated by vibecheck init --connect
# Learn more: https://vibecheck.dev/docs/ci-cd

name: VibeCheck

on:
  push:
    branches: [${branches.map((b) => `"${b}"`).join(', ')}]
`;

  if (options.runOnPR !== false) {
    workflow += `  pull_request:
    branches: [${branches.map((b) => `"${b}"`).join(', ')}]
`;
  }

  workflow += `
jobs:
  vibecheck:
    name: VibeCheck Validation
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Full history for better analysis

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '${nodeVersion}'
          cache: '${pm}'

      - name: Install dependencies
        run: ${installCmd}

      - name: Install VibeCheck
        run: npm install -g vibecheck-ai
`;

  if (options.includeForge) {
    workflow += `
      - name: Generate AI Context Rules
        run: ${runCmd} vibecheck scan --forge${failFlag}
        env:
          VIBECHECK_CI: true
`;
  }

  if (options.includeCheck !== false) {
    workflow += `
      - name: Run VibeCheck
        run: ${runCmd} vibecheck check${failFlag}
        env:
          VIBECHECK_CI: true

      - name: Upload VibeCheck Report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: vibecheck-report
          path: .vibecheck/reports/
          retention-days: 7
`;
  }

  if (options.includeShip) {
    workflow += `
      - name: Ship Gate (Pre-deploy Validation)
        if: github.ref == 'refs/heads/main' || github.ref == 'refs/heads/master'
        run: ${runCmd} vibecheck ship${failFlag}
        env:
          VIBECHECK_CI: true
`;
  }

  return workflow;
}

/**
 * Generate GitLab CI configuration
 */
function generateGitLabCI(options: CIIntegrationOptions): string {
  const pm = options.packageManager ?? 'npm';
  const nodeVersion = options.nodeVersion ?? '20';
  const failFlag = options.failOnError !== false ? '' : ' || true';

  const installCmd = {
    npm: 'npm ci',
    yarn: 'yarn install --frozen-lockfile',
    pnpm: 'pnpm install --frozen-lockfile',
    bun: 'bun install --frozen-lockfile',
  }[pm];

  const runCmd = {
    npm: 'npx',
    yarn: 'yarn',
    pnpm: 'pnpm exec',
    bun: 'bunx',
  }[pm];

  let config = `# VibeCheck GitLab CI Integration
# Auto-generated by vibecheck init --connect

image: node:${nodeVersion}

stages:
  - validate
${options.includeShip ? '  - ship\n' : ''}
variables:
  VIBECHECK_CI: "true"

cache:
  key: \${CI_COMMIT_REF_SLUG}
  paths:
    - node_modules/
    - .vibecheck/

vibecheck:
  stage: validate
  script:
    - ${installCmd}
    - npm install -g vibecheck-ai
`;

  if (options.includeForge) {
    config += `    - ${runCmd} vibecheck scan --forge${failFlag}
`;
  }

  if (options.includeCheck !== false) {
    config += `    - ${runCmd} vibecheck check${failFlag}
`;
  }

  config += `  artifacts:
    paths:
      - .vibecheck/reports/
    expire_in: 1 week
    when: always
`;

  if (options.includeShip) {
    config += `
ship-gate:
  stage: ship
  script:
    - ${installCmd}
    - npm install -g vibecheck-ai
    - ${runCmd} vibecheck ship${failFlag}
  only:
    - main
    - master
  when: manual
`;
  }

  return config;
}

/**
 * Generate CircleCI configuration
 */
function generateCircleCI(options: CIIntegrationOptions): string {
  const pm = options.packageManager ?? 'npm';
  const nodeVersion = options.nodeVersion ?? '20';
  const failFlag = options.failOnError !== false ? '' : ' || true';

  const installCmd = {
    npm: 'npm ci',
    yarn: 'yarn install --frozen-lockfile',
    pnpm: 'pnpm install --frozen-lockfile',
    bun: 'bun install --frozen-lockfile',
  }[pm];

  const runCmd = {
    npm: 'npx',
    yarn: 'yarn',
    pnpm: 'pnpm exec',
    bun: 'bunx',
  }[pm];

  let config = `# VibeCheck CircleCI Integration
# Auto-generated by vibecheck init --connect

version: 2.1

orbs:
  node: circleci/node@5.2

jobs:
  vibecheck:
    docker:
      - image: cimg/node:${nodeVersion}
    environment:
      VIBECHECK_CI: "true"
    steps:
      - checkout
      - node/install-packages:
          pkg-manager: ${pm}
      - run:
          name: Install VibeCheck
          command: npm install -g vibecheck-ai
`;

  if (options.includeForge) {
    config += `      - run:
          name: Generate AI Context Rules
          command: ${runCmd} vibecheck scan --forge${failFlag}
`;
  }

  if (options.includeCheck !== false) {
    config += `      - run:
          name: Run VibeCheck
          command: ${runCmd} vibecheck check${failFlag}
`;
  }

  config += `      - store_artifacts:
          path: .vibecheck/reports/
          destination: vibecheck-reports
`;

  if (options.includeShip) {
    config += `
  ship-gate:
    docker:
      - image: cimg/node:${nodeVersion}
    environment:
      VIBECHECK_CI: "true"
    steps:
      - checkout
      - node/install-packages:
          pkg-manager: ${pm}
      - run:
          name: Install VibeCheck
          command: npm install -g vibecheck-ai
      - run:
          name: Ship Gate
          command: ${runCmd} vibecheck ship${failFlag}
`;
  }

  config += `
workflows:
  version: 2
  validate:
    jobs:
      - vibecheck
`;

  if (options.includeShip) {
    config += `      - ship-gate:
          requires:
            - vibecheck
          filters:
            branches:
              only:
                - main
                - master
`;
  }

  return config;
}

/**
 * Generate Azure Pipelines configuration
 */
function generateAzurePipelines(options: CIIntegrationOptions): string {
  const pm = options.packageManager ?? 'npm';
  const nodeVersion = options.nodeVersion ?? '20';
  const branches = options.branches ?? ['main', 'master'];
  const failFlag = options.failOnError !== false ? '' : ' || true';

  const installCmd = {
    npm: 'npm ci',
    yarn: 'yarn install --frozen-lockfile',
    pnpm: 'pnpm install --frozen-lockfile',
    bun: 'bun install --frozen-lockfile',
  }[pm];

  const runCmd = {
    npm: 'npx',
    yarn: 'yarn',
    pnpm: 'pnpm exec',
    bun: 'bunx',
  }[pm];

  let config = `# VibeCheck Azure Pipelines Integration
# Auto-generated by vibecheck init --connect

trigger:
  branches:
    include:
${branches.map((b) => `      - ${b}`).join('\n')}

pool:
  vmImage: 'ubuntu-latest'

variables:
  VIBECHECK_CI: 'true'

stages:
  - stage: Validate
    displayName: 'VibeCheck Validation'
    jobs:
      - job: VibeCheck
        displayName: 'Run VibeCheck'
        steps:
          - task: NodeTool@0
            inputs:
              versionSpec: '${nodeVersion}.x'
            displayName: 'Install Node.js'

          - script: ${installCmd}
            displayName: 'Install dependencies'

          - script: npm install -g vibecheck-ai
            displayName: 'Install VibeCheck'
`;

  if (options.includeForge) {
    config += `
          - script: ${runCmd} vibecheck scan --forge${failFlag}
            displayName: 'Generate AI Context Rules'
`;
  }

  if (options.includeCheck !== false) {
    config += `
          - script: ${runCmd} vibecheck check${failFlag}
            displayName: 'Run VibeCheck'

          - task: PublishBuildArtifacts@1
            inputs:
              pathToPublish: '.vibecheck/reports/'
              artifactName: 'vibecheck-reports'
            condition: always()
`;
  }

  if (options.includeShip) {
    config += `
  - stage: Ship
    displayName: 'Ship Gate'
    dependsOn: Validate
    condition: and(succeeded(), eq(variables['Build.SourceBranch'], 'refs/heads/main'))
    jobs:
      - job: ShipGate
        displayName: 'Pre-deploy Validation'
        steps:
          - task: NodeTool@0
            inputs:
              versionSpec: '${nodeVersion}.x'

          - script: ${installCmd}
            displayName: 'Install dependencies'

          - script: npm install -g vibecheck-ai
            displayName: 'Install VibeCheck'

          - script: ${runCmd} vibecheck ship${failFlag}
            displayName: 'Ship Gate'
`;
  }

  return config;
}

/**
 * Generate Vercel configuration
 */
function generateVercelConfig(options: CIIntegrationOptions): string {
  const pm = options.packageManager ?? 'npm';
  const runCmd = {
    npm: 'npx',
    yarn: 'yarn',
    pnpm: 'pnpm exec',
    bun: 'bunx',
  }[pm];

  return `{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "buildCommand": "${runCmd} vibecheck check && ${pm === 'npm' ? 'npm run' : pm} build",
  "installCommand": "${pm} install && npm install -g vibecheck-ai",
  "framework": null,
  "env": {
    "VIBECHECK_CI": "true"
  }
}
`;
}

/**
 * Generate Netlify configuration
 */
function generateNetlifyConfig(options: CIIntegrationOptions): string {
  const pm = options.packageManager ?? 'npm';
  const runCmd = {
    npm: 'npx',
    yarn: 'yarn',
    pnpm: 'pnpm exec',
    bun: 'bunx',
  }[pm];

  return `# VibeCheck Netlify Integration
# Auto-generated by vibecheck init --connect

[build]
  command = "npm install -g vibecheck-ai && ${runCmd} vibecheck check && ${pm === 'npm' ? 'npm run' : pm} build"

[build.environment]
  VIBECHECK_CI = "true"
  NODE_VERSION = "${options.nodeVersion ?? '20'}"

# Run VibeCheck on deploy previews
[context.deploy-preview]
  command = "npm install -g vibecheck-ai && ${runCmd} vibecheck check && ${pm === 'npm' ? 'npm run' : pm} build"

# Run ship gate on production
[context.production]
  command = "npm install -g vibecheck-ai && ${runCmd} vibecheck ship && ${pm === 'npm' ? 'npm run' : pm} build"
`;
}

// ============================================================================
// INTEGRATION
// ============================================================================

/**
 * Integrate VibeCheck into CI/CD
 */
export async function integrateWithCI(
  options: CIIntegrationOptions
): Promise<CIIntegrationResult> {
  const detection = await detectCIPlatform(options.projectPath);
  const pm = options.packageManager ?? (await detectPackageManager(options.projectPath));

  const result: CIIntegrationResult = {
    success: false,
    platform: detection.platform,
    filesCreated: [],
    filesModified: [],
    instructions: [],
    errors: [],
  };

  if (!detection.canIntegrate) {
    result.errors = [detection.message];
    return result;
  }

  // Merge detected package manager
  const fullOptions: CIIntegrationOptions = {
    ...options,
    packageManager: pm,
    includeCheck: options.includeCheck ?? true,
    runOnPR: options.runOnPR ?? true,
    failOnError: options.failOnError ?? true,
  };

  try {
    switch (detection.platform) {
      case 'github-actions': {
        const workflowDir = path.join(options.projectPath, '.github', 'workflows');
        const workflowFile = path.join(workflowDir, 'vibecheck.yml');

        await fs.mkdir(workflowDir, { recursive: true });
        await fs.writeFile(workflowFile, generateGitHubActionsWorkflow(fullOptions), 'utf-8');

        result.filesCreated.push('.github/workflows/vibecheck.yml');
        result.instructions.push(
          'GitHub Actions workflow created',
          'Push to GitHub to activate the workflow',
          'View results in the Actions tab'
        );
        break;
      }

      case 'gitlab-ci': {
        const configFile = path.join(options.projectPath, '.gitlab-ci.yml');

        if (detection.existing) {
          // Append to existing file
          const existing = await fs.readFile(configFile, 'utf-8');
          const vibeCheckConfig = generateGitLabCI(fullOptions);

          // Remove the image line from vibecheck config since it's appending
          const configToAppend = vibeCheckConfig
            .split('\n')
            .filter((line) => !line.startsWith('image:'))
            .join('\n');

          await fs.writeFile(configFile, existing + '\n\n' + configToAppend, 'utf-8');
          result.filesModified.push('.gitlab-ci.yml');
        } else {
          await fs.writeFile(configFile, generateGitLabCI(fullOptions), 'utf-8');
          result.filesCreated.push('.gitlab-ci.yml');
        }

        result.instructions.push(
          'GitLab CI configuration updated',
          'Push to GitLab to activate the pipeline',
          'View results in CI/CD > Pipelines'
        );
        break;
      }

      case 'circleci': {
        const configDir = path.join(options.projectPath, '.circleci');
        const configFile = path.join(configDir, 'config.yml');

        if (detection.existing) {
          result.errors?.push('CircleCI config exists. Manual integration recommended.');
          result.instructions.push(
            'Add the following job to your CircleCI config:',
            'See: https://vibecheck.dev/docs/ci-cd/circleci'
          );
        } else {
          await fs.mkdir(configDir, { recursive: true });
          await fs.writeFile(configFile, generateCircleCI(fullOptions), 'utf-8');
          result.filesCreated.push('.circleci/config.yml');
        }

        result.instructions.push(
          'CircleCI configuration created',
          'Connect your repo to CircleCI to activate',
          'View results in CircleCI dashboard'
        );
        break;
      }

      case 'azure-pipelines': {
        const configFile = path.join(options.projectPath, 'azure-pipelines.yml');

        if (detection.existing) {
          result.errors?.push('Azure Pipelines config exists. Manual integration recommended.');
        } else {
          await fs.writeFile(configFile, generateAzurePipelines(fullOptions), 'utf-8');
          result.filesCreated.push('azure-pipelines.yml');
        }

        result.instructions.push(
          'Azure Pipelines configuration created',
          'Create a pipeline in Azure DevOps pointing to this file',
          'View results in Pipelines dashboard'
        );
        break;
      }

      case 'vercel': {
        const configFile = path.join(options.projectPath, 'vercel.json');

        if (detection.existing) {
          // Read and merge
          const existing = JSON.parse(await fs.readFile(configFile, 'utf-8'));
          const vibeCheckConfig = JSON.parse(generateVercelConfig(fullOptions));

          const merged = {
            ...existing,
            buildCommand: vibeCheckConfig.buildCommand,
            installCommand: vibeCheckConfig.installCommand,
            env: {
              ...existing.env,
              ...vibeCheckConfig.env,
            },
          };

          await fs.writeFile(configFile, JSON.stringify(merged, null, 2), 'utf-8');
          result.filesModified.push('vercel.json');
        } else {
          await fs.writeFile(configFile, generateVercelConfig(fullOptions), 'utf-8');
          result.filesCreated.push('vercel.json');
        }

        result.instructions.push(
          'Vercel configuration updated',
          'VibeCheck will run before each build',
          'View results in Vercel deployment logs'
        );
        break;
      }

      case 'netlify': {
        const configFile = path.join(options.projectPath, 'netlify.toml');

        if (detection.existing) {
          result.errors?.push('Netlify config exists. Please add VibeCheck manually.');
          result.instructions.push(
            'Add to your build command: vibecheck check &&',
            'See: https://vibecheck.dev/docs/ci-cd/netlify'
          );
        } else {
          await fs.writeFile(configFile, generateNetlifyConfig(fullOptions), 'utf-8');
          result.filesCreated.push('netlify.toml');
        }

        result.instructions.push(
          'Netlify configuration created',
          'VibeCheck will run before each build',
          'View results in Netlify deploy logs'
        );
        break;
      }

      default:
        result.errors?.push(
          `Platform ${detection.platform} is not yet supported for automatic integration`
        );
        result.instructions.push(
          'You can manually integrate VibeCheck by adding these commands to your CI:',
          '  npm install -g vibecheck-ai',
          '  vibecheck check',
          'See: https://vibecheck.dev/docs/ci-cd'
        );
    }

    result.success = result.filesCreated.length > 0 || result.filesModified.length > 0;
  } catch (error) {
    result.errors?.push(error instanceof Error ? error.message : String(error));
  }

  return result;
}

/**
 * Get integration instructions without writing files
 */
export function getIntegrationInstructions(platform: CIPlatform): string {
  const instructions: Record<CIPlatform, string> = {
    'github-actions': `
# GitHub Actions Integration

1. Create .github/workflows/vibecheck.yml
2. Add the workflow configuration
3. Push to GitHub

The workflow will run on every push and PR.
`,
    'gitlab-ci': `
# GitLab CI Integration

1. Edit .gitlab-ci.yml
2. Add the VibeCheck job
3. Push to GitLab

The job will run in your CI pipeline.
`,
    'circleci': `
# CircleCI Integration

1. Create .circleci/config.yml
2. Add the VibeCheck job
3. Connect repo to CircleCI

The job will run on every commit.
`,
    'azure-pipelines': `
# Azure Pipelines Integration

1. Create azure-pipelines.yml
2. Create pipeline in Azure DevOps
3. Point to the YAML file

The pipeline will run automatically.
`,
    'jenkins': `
# Jenkins Integration

Add to your Jenkinsfile:

pipeline {
  stages {
    stage('VibeCheck') {
      steps {
        sh 'npm install -g vibecheck-ai'
        sh 'vibecheck check'
      }
    }
  }
}
`,
    'bitbucket-pipelines': `
# Bitbucket Pipelines Integration

Add to bitbucket-pipelines.yml:

pipelines:
  default:
    - step:
        name: VibeCheck
        script:
          - npm install -g vibecheck-ai
          - vibecheck check
`,
    'travis-ci': `
# Travis CI Integration

Add to .travis.yml:

script:
  - npm install -g vibecheck-ai
  - vibecheck check
`,
    vercel: `
# Vercel Integration

Update vercel.json buildCommand to include:
vibecheck check && your-build-command
`,
    netlify: `
# Netlify Integration

Update netlify.toml build command to include:
vibecheck check && your-build-command
`,
    unknown: `
# Manual CI Integration

Add these commands to your CI pipeline:

1. npm install -g vibecheck-ai
2. vibecheck check

For pre-deploy validation:
3. vibecheck ship
`,
  };

  return instructions[platform] ?? instructions.unknown;
}
