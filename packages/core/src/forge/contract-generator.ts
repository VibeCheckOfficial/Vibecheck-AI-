/**
 * Forge - AI Contract Generator
 *
 * Generates an "AI Contract" that defines what the agent may and may not do.
 * This reduces guessing and enforces boundaries.
 */

import type { AIContract, ForgeRule, ProjectAnalysis } from './types.js';

/**
 * Attribution footer for AI Contract
 */
const VIBECHECK_ATTRIBUTION = `
---
<!-- vibecheck:attribution -->
*Verified by VibeCheck ✓*`;

/**
 * Generate an AI Contract based on project analysis and rules
 */
export function generateAIContract(analysis: ProjectAnalysis, rules: ForgeRule[]): AIContract {
  const contract: AIContract = {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    projectId: analysis.name,

    allowed: generateAllowedActions(analysis),
    forbidden: generateForbiddenActions(analysis, rules),
    requiresConfirmation: generateConfirmationActions(analysis),

    fileBoundaries: generateFileBoundaries(analysis),
    codeStandards: generateCodeStandards(analysis, rules),
    safetyRules: generateSafetyRules(),
    contextRules: generateContextRules(),
  };

  return contract;
}

/**
 * Validate an AI Contract for completeness
 */
export function validateContract(contract: AIContract): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  if (contract.allowed.length === 0) {
    issues.push('No allowed actions defined');
  }

  if (contract.forbidden.length === 0) {
    issues.push('No forbidden actions defined');
  }

  if (contract.safetyRules.critical.length === 0) {
    issues.push('No critical safety rules defined');
  }

  if (contract.fileBoundaries.mayNotModify.length === 0) {
    issues.push('No protected files defined');
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

// ============================================================================
// CONTRACT GENERATORS
// ============================================================================

function generateAllowedActions(analysis: ProjectAnalysis): string[] {
  const allowed: string[] = [
    'Create new files in appropriate directories',
    'Modify existing source code files',
    'Add or update dependencies via package manager',
    'Create and run tests',
    'Update documentation',
    'Refactor code for clarity and performance',
    'Add TypeScript types and interfaces',
    'Create React components and hooks',
    'Add API endpoints following project patterns',
    'Fix bugs and security issues',
    'Optimize performance',
    'Add error handling',
  ];

  // Add framework-specific allowances
  if (analysis.framework?.includes('Next.js')) {
    allowed.push('Create pages in pages/ or app/ directory');
    allowed.push('Create API routes in api/ directory');
    allowed.push('Configure Next.js settings in next.config.js');
  }

  if (analysis.framework?.includes('React')) {
    allowed.push('Create React components with proper typing');
    allowed.push('Use React hooks following rules of hooks');
    allowed.push('Implement React patterns (render props, HOCs, compound components)');
  }

  if (analysis.patterns?.stateManagement) {
    allowed.push(`Create ${analysis.patterns.stateManagement} stores and selectors`);
  }

  if ((analysis.models?.length || 0) > 0) {
    allowed.push('Create database migrations');
    allowed.push('Update Prisma schema (requires confirmation)');
  }

  return allowed;
}

function generateForbiddenActions(analysis: ProjectAnalysis, rules: ForgeRule[]): string[] {
  const forbidden: string[] = [
    // Security
    'Commit secrets, API keys, or credentials to code',
    'Disable security checks or authentication',
    'Execute arbitrary shell commands without confirmation',
    'Modify production database directly',
    'Expose internal error details to end users',
    'Use eval() or similar dynamic code execution',

    // Code Quality
    'Use `any` type in TypeScript',
    'Leave console.log in production code',
    'Skip error handling in async operations',
    'Create circular dependencies',
    'Ignore TypeScript errors with @ts-ignore without comment',

    // Architecture
    'Bypass established architectural patterns',
    'Create files in wrong directories',
    'Import from internal/private modules directly',
    'Modify generated/auto-generated files',

    // Safety
    'Delete files without confirmation',
    'Modify .env files containing secrets',
    'Change authentication or authorization logic without review',
    'Modify database schema without migration',
    'Push directly to main/master branch',
    'Merge without passing CI checks',
  ];

  // Add rule-specific forbidden actions
  const avoidRule = rules.find((r) => r.category === 'avoid');
  if (avoidRule && analysis.patterns?.antiPatterns) {
    for (const ap of analysis.patterns.antiPatterns) {
      if (ap.severity === 'error') {
        forbidden.push(`${ap.message}`);
      }
    }
  }

  // Add project-specific forbidden actions
  if (analysis.monorepo?.isMonorepo) {
    forbidden.push('Modify workspace configurations without understanding impact');
    forbidden.push('Create cross-workspace dependencies without explicit approval');
  }

  return forbidden;
}

function generateConfirmationActions(analysis: ProjectAnalysis): string[] {
  const requiresConfirmation: string[] = [
    // Destructive operations
    'Delete any file or directory',
    'Rename files that may be referenced elsewhere',
    'Remove dependencies from package.json',

    // Database
    'Run database migrations',
    'Modify database schema',
    'Create destructive migrations (drop table, remove column)',

    // Configuration
    'Modify environment configuration',
    'Change CI/CD pipeline configuration',
    'Update security-related settings',

    // External
    'Make external API calls to production services',
    'Modify webhook configurations',
    'Change authentication providers',

    // Architecture
    'Create new workspace in monorepo',
    'Modify shared packages',
    'Change import aliases or module resolution',
  ];

  // Add framework-specific confirmations
  if (analysis.framework?.includes('Next.js')) {
    requiresConfirmation.push('Modify next.config.js');
    requiresConfirmation.push('Add middleware');
  }

  return requiresConfirmation;
}

function generateFileBoundaries(analysis: ProjectAnalysis): AIContract['fileBoundaries'] {
  return {
    mayCreate: generateMayCreatePatterns(analysis),
    mayNotModify: generateMayNotModifyPatterns(),
    restrictedPatterns: generateRestrictedPatterns(),
  };
}

function generateMayCreatePatterns(analysis: ProjectAnalysis): string[] {
  const patterns: string[] = [
    'src/**/*.ts',
    'src/**/*.tsx',
    'src/**/*.css',
    'src/**/*.module.css',
    'tests/**/*.test.ts',
    'tests/**/*.test.tsx',
    'docs/**/*.md',
  ];

  // Add framework-specific patterns
  if (analysis.framework?.includes('Next.js')) {
    patterns.push('pages/**/*.tsx');
    patterns.push('app/**/*.tsx');
    patterns.push('api/**/*.ts');
  }

  // Add detected directories
  for (const dir of analysis.directories.slice(0, 10)) {
    patterns.push(`${dir}/**/*`);
  }

  return patterns;
}

function generateMayNotModifyPatterns(): string[] {
  return [
    // Environment and secrets
    '.env',
    '.env.local',
    '.env.production',
    '**/*.pem',
    '**/*.key',
    '**/secrets/**',
    '**/credentials/**',

    // Lock files
    'package-lock.json',
    'pnpm-lock.yaml',
    'yarn.lock',

    // Generated files
    '**/generated/**',
    '**/*.generated.*',
    '**/dist/**',
    '**/build/**',
    '**/.next/**',
    '**/node_modules/**',

    // CI/CD (requires confirmation)
    '.github/workflows/**',
    '.gitlab-ci.yml',
    'Dockerfile',
    'docker-compose*.yml',

    // Git
    '.git/**',
    '.gitignore',
    '.gitattributes',
  ];
}

function generateRestrictedPatterns(): string[] {
  return [
    // Config files - extra caution
    'tsconfig.json',
    'next.config.js',
    'next.config.mjs',
    'vite.config.ts',
    'webpack.config.js',

    // Package management
    'package.json',

    // Database
    'prisma/schema.prisma',
    '**/migrations/**',

    // Authentication
    '**/auth/**',
    '**/middleware/**',
  ];
}

function generateCodeStandards(
  analysis: ProjectAnalysis,
  rules: ForgeRule[]
): AIContract['codeStandards'] {
  const mustFollow: string[] = [
    'Use TypeScript for all new files',
    'Follow existing code style and formatting',
    'Use meaningful variable and function names',
    'Write self-documenting code with clear intent',
    'Handle all error cases explicitly',
    'Add JSDoc comments for public APIs',
  ];

  const mustAvoid: string[] = [
    'any type in TypeScript',
    'Hardcoded magic numbers or strings',
    'Deeply nested code (max 3 levels)',
    'Functions longer than 50 lines',
    'Files longer than 500 lines',
    'Commented-out code blocks',
    'TODO comments without issue references',
  ];

  const preferredPatterns: string[] = [];

  // Add detected patterns
  if (analysis.patterns?.stateManagement) {
    mustFollow.push(`Use ${analysis.patterns.stateManagement} for state management`);
  }

  if ((analysis.patterns?.dataFetching?.length || 0) > 0) {
    mustFollow.push(`Use ${analysis.patterns.dataFetching[0]} for data fetching`);
  }

  if ((analysis.patterns?.styling?.length || 0) > 0) {
    mustFollow.push(`Use ${analysis.patterns.styling[0]} for styling`);
  }

  if ((analysis.patterns?.testing?.length || 0) > 0) {
    mustFollow.push(`Use ${analysis.patterns.testing[0]} for testing`);
  }

  // Add from rules
  for (const rule of rules) {
    if (rule.category === 'components') {
      preferredPatterns.push('Functional components over class components');
      preferredPatterns.push('Composition over inheritance');
    }
    if (rule.category === 'hooks') {
      preferredPatterns.push('Extract logic into custom hooks');
      preferredPatterns.push('Keep hooks small and focused');
    }
    if (rule.category === 'api-patterns') {
      preferredPatterns.push('RESTful API design');
      preferredPatterns.push('Consistent error response format');
    }
  }

  return { mustFollow, mustAvoid, preferredPatterns };
}

function generateSafetyRules(): AIContract['safetyRules'] {
  return {
    critical: [
      'Never commit secrets, API keys, or credentials',
      'Never disable authentication or authorization checks',
      'Never execute untrusted code or user input',
      'Never modify production data without confirmation',
      'Never bypass security middleware',
      'Never expose internal system details in errors',
      'Always validate and sanitize user input',
      'Always use parameterized database queries',
    ],

    high: [
      'Always handle errors explicitly',
      'Always use HTTPS for external requests',
      'Always implement rate limiting for public endpoints',
      'Always log security-relevant events',
      'Never store sensitive data in localStorage',
      'Never trust client-side validation alone',
      'Test security-critical code paths',
    ],

    standard: [
      'Follow principle of least privilege',
      'Keep dependencies up to date',
      'Use environment variables for configuration',
      'Implement proper session management',
      'Use secure cookie settings',
      'Implement CORS properly',
      'Add security headers (CSP, HSTS, etc.)',
    ],
  };
}

function generateContextRules(): AIContract['contextRules'] {
  const byFileType: Record<string, string[]> = {
    '*.test.ts': [
      'Focus on testing behavior, not implementation',
      'Use meaningful test descriptions',
      'Follow AAA pattern (Arrange, Act, Assert)',
      'Mock external dependencies',
    ],
    '*.tsx': [
      'Keep components focused and small',
      'Extract logic into hooks',
      'Use proper TypeScript props typing',
      'Handle loading and error states',
    ],
    '*.ts (api)': [
      'Validate all input',
      'Return consistent response format',
      'Handle all error cases',
      'Check authentication/authorization',
    ],
    '*.css': [
      'Use CSS variables for theming',
      'Follow BEM or project naming convention',
      'Keep specificity low',
    ],
  };

  const byDirectory: Record<string, string[]> = {
    'components/': [
      'One component per file',
      'Export props interface',
      'Use composition patterns',
    ],
    'hooks/': ['Prefix with "use"', 'Return typed values', 'Document dependencies'],
    'api/': ['Validate request body', 'Use proper HTTP status codes', 'Log requests for debugging'],
    'lib/': ['Keep functions pure when possible', 'Export TypeScript types', 'Document public APIs'],
    'store/': [
      'Keep stores focused',
      'Use selectors for derived state',
      'Avoid side effects in reducers',
    ],
  };

  return { byFileType, byDirectory };
}

/**
 * Format AI Contract as human-readable Markdown
 */
export function formatContractAsMarkdown(contract: AIContract): string {
  return `# AI Contract

> This document defines what AI agents may and may not do in this repository.
> Generated by Forge v1.0

## Permissions

### Allowed Actions
${contract.allowed.map((a) => `- ✅ ${a}`).join('\n')}

### Forbidden Actions
${contract.forbidden.map((f) => `- ❌ ${f}`).join('\n')}

### Requires Confirmation
${contract.requiresConfirmation.map((r) => `- ⚠️ ${r}`).join('\n')}

## File Boundaries

### May Create
${contract.fileBoundaries.mayCreate.map((p) => `- \`${p}\``).join('\n')}

### May Not Modify
${contract.fileBoundaries.mayNotModify.map((p) => `- \`${p}\``).join('\n')}

### Restricted Patterns
${contract.fileBoundaries.restrictedPatterns.map((p) => `- \`${p}\``).join('\n')}

## Code Standards

### Must Follow
${contract.codeStandards.mustFollow.map((s) => `- ${s}`).join('\n')}

### Must Avoid
${contract.codeStandards.mustAvoid.map((s) => `- ${s}`).join('\n')}

### Preferred Patterns
${contract.codeStandards.preferredPatterns.map((p) => `- ${p}`).join('\n')}

## Safety Rules

### Critical (Never Violate)
${contract.safetyRules.critical.map((r) => `- 🔴 ${r}`).join('\n')}

### High Priority
${contract.safetyRules.high.map((r) => `- 🟠 ${r}`).join('\n')}

### Standard
${contract.safetyRules.standard.map((r) => `- 🟡 ${r}`).join('\n')}

---
*Generated at: ${new Date().toISOString()}*
*Contract Version: ${contract.version}*
${VIBECHECK_ATTRIBUTION}
`;
}
