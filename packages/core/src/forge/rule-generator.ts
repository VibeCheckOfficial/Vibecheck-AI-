/**
 * Forge - Minimal Rules Generator
 *
 * "Minimal but lethal" - generates the smallest set of rules with the biggest impact.
 * Uses impact scoring to prioritize rules that matter most.
 */

import * as crypto from 'node:crypto';
import type { ForgeRule, RuleCategory, RuleTier, RuleDiff, ProjectAnalysis } from './types.js';

interface MinimalRulesOptions {
  maxRules: number;
  tier: RuleTier;
  features: string[];
  diff: RuleDiff | null;
}

// Impact weights for different rule categories
const CATEGORY_IMPACT_WEIGHTS: Record<RuleCategory, number> = {
  architecture: 100,
  workflow: 98, // High priority - affects all AI interactions
  avoid: 95,
  security: 90,
  types: 85,
  authentication: 80,
  components: 75,
  authorization: 75,
  database: 70,
  testing: 70,
  state: 65,
  'data-flow': 60,
  'error-handling': 60,
  'api-patterns': 55,
  performance: 55,
  hooks: 50,
  environment: 45,
  accessibility: 45,
  caching: 40,
  logging: 35,
  i18n: 30,
};

/**
 * Generate minimal but lethal rules based on project analysis
 */
export function generateMinimalRules(
  analysis: ProjectAnalysis,
  options: MinimalRulesOptions
): ForgeRule[] {
  const { maxRules, features, diff } = options;

  // Generate all possible rules for this tier
  const allRules = generateAllRules(analysis, features);

  // Score each rule by impact
  const scoredRules = allRules.map((rule) => ({
    ...rule,
    impact: scoreRuleImpact(rule, analysis),
  }));

  // Sort by impact (descending)
  scoredRules.sort((a, b) => b.impact - a.impact);

  // If we have a diff, prioritize changed rules
  if (diff) {
    return prioritizeWithDiff(scoredRules, diff, maxRules);
  }

  // Take top N rules
  const selectedRules = scoredRules.slice(0, maxRules);

  // Mark all as non-incremental (full generation)
  return selectedRules.map((rule) => ({ ...rule, incremental: false }));
}

/**
 * Score a rule's impact based on the project
 */
export function scoreRuleImpact(rule: ForgeRule, analysis: ProjectAnalysis): number {
  let score = CATEGORY_IMPACT_WEIGHTS[rule.category] || 50;

  const patterns = analysis.patterns || ({} as Partial<ProjectAnalysis['patterns']>);
  const stats = analysis.stats || { totalFiles: 0 };

  // Architecture rules get boosted for larger projects
  if (rule.category === 'architecture') {
    if (stats.totalFiles > 100) score += 10;
    if (stats.totalFiles > 500) score += 10;
    if (analysis.monorepo?.isMonorepo) score += 15;
  }

  // Types rules get boosted for TypeScript projects
  if (rule.category === 'types') {
    if (analysis.language === 'TypeScript') score += 20;
    if ((analysis.types?.interfaces?.length || 0) > 10) score += 10;
  }

  // Components rules get boosted for UI-heavy projects
  if (rule.category === 'components') {
    if ((analysis.components?.length || 0) > 20) score += 15;
    if ((patterns.styling?.length || 0) > 0) score += 5;
  }

  // API rules get boosted for backend/API projects
  if (rule.category === 'api-patterns' || rule.category === 'data-flow') {
    if ((analysis.apiRoutes?.length || 0) > 10) score += 15;
    if ((patterns.dataFetching?.length || 0) > 0) score += 10;
  }

  // State rules get boosted if state management detected
  if (rule.category === 'state') {
    if (patterns.stateManagement) score += 20;
  }

  // Testing rules get boosted if tests exist
  if (rule.category === 'testing') {
    if ((patterns.testing?.length || 0) > 0) score += 20;
  }

  // Security rules get boosted if auth detected
  if (rule.category === 'security' || rule.category === 'authentication') {
    if (patterns.authentication) score += 15;
  }

  // Hooks rules get boosted for React projects
  if (rule.category === 'hooks') {
    if ((patterns.hooks?.length || 0) > 5) score += 15;
  }

  // Environment rules get boosted if env vars detected
  if (rule.category === 'environment') {
    if ((analysis.envVars?.variables?.length || 0) > 5) score += 10;
    if ((analysis.envVars?.sensitive?.length || 0) > 0) score += 15;
  }

  // Avoid rules get boosted if anti-patterns detected
  if (rule.category === 'avoid') {
    if ((patterns.antiPatterns?.length || 0) > 0) score += 20;
  }

  // Cap at 100
  return Math.min(score, 100);
}

/**
 * Generate all possible rules based on analysis
 */
function generateAllRules(analysis: ProjectAnalysis, features: string[]): ForgeRule[] {
  const rules: ForgeRule[] = [];
  const shouldInclude = (category: RuleCategory) =>
    features.includes('*') || features.includes(category);

  // ARCHITECTURE RULE (always high priority)
  if (shouldInclude('architecture')) {
    rules.push(generateArchitectureRule(analysis));
  }

  // WORKFLOW RULE - Completion Tracking (always high priority for vibe coding)
  if (shouldInclude('workflow')) {
    rules.push(generateCompletionTrackingRule());
  }

  // AVOID RULE (always high priority)
  if (shouldInclude('avoid')) {
    rules.push(generateAvoidRule(analysis));
  }

  // TYPES RULE
  if (shouldInclude('types') && analysis.language === 'TypeScript') {
    rules.push(generateTypesRule(analysis));
  }

  // COMPONENTS RULE
  if (shouldInclude('components') && (analysis.components?.length || 0) > 0) {
    rules.push(generateComponentsRule(analysis));
  }

  // TESTING RULE
  if (shouldInclude('testing') && (analysis.patterns?.testing?.length || 0) > 0) {
    rules.push(generateTestingRule(analysis));
  }

  // STATE RULE
  if (shouldInclude('state') && analysis.patterns?.stateManagement) {
    rules.push(generateStateRule(analysis));
  }

  // DATA-FLOW RULE
  if (shouldInclude('data-flow') && (analysis.apiRoutes?.length || 0) > 0) {
    rules.push(generateDataFlowRule(analysis));
  }

  // ENVIRONMENT RULE
  if (shouldInclude('environment') && (analysis.envVars?.variables?.length || 0) > 0) {
    rules.push(generateEnvironmentRule(analysis));
  }

  // HOOKS RULE
  if (shouldInclude('hooks') && (analysis.patterns?.hooks?.length || 0) > 0) {
    rules.push(generateHooksRule(analysis));
  }

  // API-PATTERNS RULE
  if (shouldInclude('api-patterns') && (analysis.apiRoutes?.length || 0) > 0) {
    rules.push(generateAPIPatternRule(analysis));
  }

  // SECURITY RULE
  if (shouldInclude('security')) {
    rules.push(generateSecurityRule());
  }

  // AUTHENTICATION RULE
  if (shouldInclude('authentication') && analysis.patterns?.authentication) {
    rules.push(generateAuthenticationRule(analysis));
  }

  // DATABASE RULE
  if (shouldInclude('database') && (analysis.models?.length || 0) > 0) {
    rules.push(generateDatabaseRule(analysis));
  }

  // ERROR-HANDLING RULE
  if (shouldInclude('error-handling')) {
    rules.push(generateErrorHandlingRule());
  }

  // PERFORMANCE RULE
  if (shouldInclude('performance')) {
    rules.push(generatePerformanceRule());
  }

  return rules;
}

/**
 * Prioritize rules considering diff (incremental mode)
 */
function prioritizeWithDiff(
  scoredRules: ForgeRule[],
  diff: RuleDiff,
  maxRules: number
): ForgeRule[] {
  const result: ForgeRule[] = [];
  const modifiedIds = new Set(diff.modified.map((r) => r.id));
  const addedIds = new Set(diff.added.map((r) => r.id));

  // First, add all modified rules (they need regeneration)
  for (const rule of scoredRules) {
    if (modifiedIds.has(rule.id)) {
      result.push({ ...rule, incremental: true });
    }
  }

  // Then, add new rules by impact
  for (const rule of scoredRules) {
    if (result.length >= maxRules) break;
    if (!modifiedIds.has(rule.id) && addedIds.has(rule.id)) {
      if (!result.find((r) => r.id === rule.id)) {
        result.push({ ...rule, incremental: true });
      }
    }
  }

  // Fill remaining slots with highest impact rules
  for (const rule of scoredRules) {
    if (result.length >= maxRules) break;
    if (!result.find((r) => r.id === rule.id)) {
      result.push({ ...rule, incremental: false });
    }
  }

  return result;
}

// ============================================================================
// RULE GENERATORS
// ============================================================================

function generateArchitectureRule(analysis: ProjectAnalysis): ForgeRule {
  const monorepoSection = analysis.monorepo?.isMonorepo
    ? `
### Monorepo Structure (${analysis.monorepo.type})

Workspaces:
${analysis.monorepo.workspaces
  .slice(0, 10)
  .map((w) => `- \`${w.path}\` - ${w.name}`)
  .join('\n')}

Shared Packages:
${
  analysis.monorepo.sharedPackages
    ?.slice(0, 5)
    .map((p) => `- ${p.name} (used in ${p.usedIn.length} workspaces)`)
    .join('\n') || '- None detected'
}
`
    : '';

  const content = `# Architecture Guidelines

## Project Type: ${analysis.framework || 'JavaScript/TypeScript'}

${monorepoSection}

### Directory Purpose
${analysis.directories
  .slice(0, 10)
  .map((d) => `- \`${d}/\` - Project files`)
  .join('\n')}

### Import Aliases
- Use \`@/\` for src directory imports
- Never use relative imports deeper than \`../\`

### Key Conventions
- Framework: ${analysis.framework || 'Not detected'}
- Language: ${analysis.language}
- Architecture: ${analysis.architecture}
`;

  return {
    id: 'architecture',
    category: 'architecture',
    name: 'Architecture',
    description: 'Project structure, conventions, and architecture patterns',
    frontmatter: {
      description: 'Project structure and architecture patterns',
      globs: ['**/*.{ts,tsx,js,jsx}'],
      alwaysApply: true,
      priority: 100,
    },
    content,
    impact: 0,
    hash: hashContent(content),
    incremental: false,
  };
}

function generateAvoidRule(analysis: ProjectAnalysis): ForgeRule {
  const antiPatterns = analysis.patterns?.antiPatterns || [];

  const detectedSection =
    antiPatterns.length > 0
      ? `
## Detected Issues
${antiPatterns
  .map((ap) => {
    const icon = ap.severity === 'error' ? '🔴' : ap.severity === 'warning' ? '🟡' : '🔵';
    return `${icon} **${ap.severity.toUpperCase()}:** ${ap.message}${ap.file ? ` (${ap.file})` : ''}`;
  })
  .join('\n')}
`
      : '';

  const content = `# Patterns to Avoid

${detectedSection}

## General
- ❌ No \`any\` type - use proper TypeScript types or \`unknown\`
- ❌ No hardcoded secrets - use environment variables
- ❌ No console.log in production - use proper logging
- ❌ No mock data in production - use real API endpoints

## Code Quality
- ❌ No commented-out code blocks
- ❌ No magic numbers/strings - use constants
- ❌ No deeply nested callbacks - use async/await
- ❌ No mutating function parameters

## Security
- ❌ Never store secrets in code
- ❌ Never trust user input without validation
- ❌ Never expose internal errors to users
- ❌ Never skip authentication checks

## Performance
- ❌ No synchronous file operations in request handlers
- ❌ No unbounded loops without limits
- ❌ No memory leaks (missing cleanup)
`;

  return {
    id: 'avoid',
    category: 'avoid',
    name: 'Patterns to Avoid',
    description: 'Anti-patterns and code smells to avoid',
    frontmatter: {
      description: 'Anti-patterns and forbidden code patterns',
      globs: ['**/*.{ts,tsx,js,jsx}'],
      alwaysApply: true,
      priority: 95,
    },
    content,
    impact: 0,
    hash: hashContent(content),
    incremental: false,
  };
}

function generateTypesRule(analysis: ProjectAnalysis): ForgeRule {
  const types = analysis.types || { interfaces: [], types: [], enums: [] };

  const content = `# Type Definitions

## Project Types

### Interfaces (${types.interfaces?.length || 0})
${
  types.interfaces
    ?.slice(0, 10)
    .map((i) => `- \`${i.name}\` - \`${i.path}\``)
    .join('\n') || '- None detected'
}

### Type Aliases (${types.types?.length || 0})
${
  types.types
    ?.slice(0, 10)
    .map((t) => `- \`${t.name}\` - \`${t.path}\``)
    .join('\n') || '- None detected'
}

## Type Guidelines

### Required
- All function parameters must have explicit types
- All function return types must be explicit
- Use \`interface\` for object shapes that may be extended
- Use \`type\` for unions, intersections, and mapped types

### Forbidden
- Never use \`any\` - use \`unknown\` if type is truly unknown
- Never use \`@ts-ignore\` without explanation comment
- Never cast with \`as\` unless absolutely necessary

### Conventions
- Interface names: PascalCase (e.g., \`UserProfile\`)
- Type aliases: PascalCase (e.g., \`ApiResponse\`)
- Generic type params: Single uppercase or descriptive (e.g., \`T\`, \`TData\`)
`;

  return {
    id: 'types',
    category: 'types',
    name: 'Types',
    description: 'TypeScript type definitions and conventions',
    frontmatter: {
      description: 'TypeScript type definitions and type safety rules',
      globs: ['**/*.d.ts', '**/types/**', '**/*.types.ts'],
      alwaysApply: false,
      priority: 85,
    },
    content,
    impact: 0,
    hash: hashContent(content),
    incremental: false,
  };
}

function generateComponentsRule(analysis: ProjectAnalysis): ForgeRule {
  const components = analysis.components || [];
  const styling = analysis.patterns?.styling || [];

  const content = `# Component Guidelines

## Component Registry (${components.length})
${components
  .slice(0, 15)
  .map((c) => `- \`${c.name}\` - \`${c.path}\` (${c.type})`)
  .join('\n')}
${components.length > 15 ? `\n... and ${components.length - 15} more` : ''}

## Styling
${styling.length > 0 ? styling.map((s) => `- ${s}`).join('\n') : '- No styling framework detected'}

## Component Patterns

### Structure
- One component per file
- Component name matches filename
- Props interface exported alongside component

### Required
- All props must be typed
- Use destructuring for props
- Document complex props with JSDoc

### Forbidden
- No inline styles (use CSS modules or styled-components)
- No direct DOM manipulation
- No business logic in components (use hooks)
`;

  return {
    id: 'components',
    category: 'components',
    name: 'Components',
    description: 'UI component patterns and conventions',
    frontmatter: {
      description: 'UI component patterns and conventions',
      globs: ['**/components/**/*.{tsx,jsx}'],
      alwaysApply: false,
      priority: 75,
    },
    content,
    impact: 0,
    hash: hashContent(content),
    incremental: false,
  };
}

function generateTestingRule(analysis: ProjectAnalysis): ForgeRule {
  const testing = analysis.patterns?.testing || [];

  const content = `# Testing Guidelines

## Testing Frameworks
${testing.length > 0 ? testing.map((t) => `- ${t}`).join('\n') : '- No testing framework detected'}

## Test Structure

### File Naming
- Unit tests: \`*.test.ts\` or \`*.spec.ts\`
- Integration tests: \`*.integration.test.ts\`
- E2E tests: \`*.e2e.ts\` or in \`e2e/\` directory

### Test Organization
\`\`\`typescript
describe('ComponentName', () => {
  describe('method or scenario', () => {
    it('should do something specific', () => {
      // Arrange
      // Act
      // Assert
    });
  });
});
\`\`\`

## Required
- All new features must have tests
- All bug fixes must have regression tests
- Maintain >80% coverage for critical paths

## Forbidden
- No skipped tests without explanation
- No tests that depend on execution order
- No tests that mutate global state
`;

  return {
    id: 'testing',
    category: 'testing',
    name: 'Testing',
    description: 'Testing patterns and conventions',
    frontmatter: {
      description: 'Testing patterns and conventions',
      globs: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}'],
      alwaysApply: false,
      priority: 70,
    },
    content,
    impact: 0,
    hash: hashContent(content),
    incremental: false,
  };
}

function generateStateRule(analysis: ProjectAnalysis): ForgeRule {
  const stateManagement = analysis.patterns?.stateManagement || 'Not detected';

  let statePatternContent = `
- Use appropriate state management for scope
- Lift state up only when necessary
- Consider context for medium-scale sharing
`;

  if (stateManagement === 'Zustand') {
    statePatternContent = `
- Define stores in \`store/\` directory
- Use selectors to prevent unnecessary re-renders
- Keep stores small and focused
`;
  } else if (stateManagement === 'Redux') {
    statePatternContent = `
- Use Redux Toolkit for slice creation
- Define slices in \`store/slices/\` directory
- Use RTK Query for API state
`;
  }

  const content = `# State Management

## State Library: ${stateManagement}

## State Patterns

### Local State
- Use \`useState\` for component-local state
- Use \`useReducer\` for complex state logic

### Global State
${statePatternContent}

### Server State
- Use React Query/SWR for server state
- Separate server state from client state
- Implement optimistic updates where appropriate

## Forbidden
- No prop drilling beyond 2 levels
- No global state for component-local concerns
- No derived state that should be computed
`;

  return {
    id: 'state',
    category: 'state',
    name: 'State Management',
    description: 'State management patterns and conventions',
    frontmatter: {
      description: 'State management patterns',
      globs: ['**/store/**', '**/state/**', '**/context/**'],
      alwaysApply: false,
      priority: 65,
    },
    content,
    impact: 0,
    hash: hashContent(content),
    incremental: false,
  };
}

function generateDataFlowRule(analysis: ProjectAnalysis): ForgeRule {
  const apiRoutes = analysis.apiRoutes || [];
  const dataFetching = analysis.patterns?.dataFetching || [];

  const content = `# Data Flow Guidelines

## API Routes (${apiRoutes.length})
${apiRoutes
  .slice(0, 10)
  .map((r) => `- \`${r.method} ${r.path}\` - \`${r.file}\``)
  .join('\n')}
${apiRoutes.length > 10 ? `\n... and ${apiRoutes.length - 10} more routes` : ''}

## Data Fetching
${dataFetching.length > 0 ? dataFetching.map((d) => `- ${d}`).join('\n') : '- No data fetching pattern detected'}

## Data Flow Patterns

### API Calls
- Centralize API calls in \`lib/api/\` or \`services/\`
- Use typed request/response interfaces
- Handle errors at the appropriate level

### Required
- All API calls must handle loading/error states
- All mutations must handle optimistic updates or loading
- All sensitive data must be validated server-side

### Forbidden
- No direct fetch calls in components
- No hardcoded API URLs
- No unhandled promise rejections
`;

  return {
    id: 'data-flow',
    category: 'data-flow',
    name: 'Data Flow',
    description: 'API and data fetching patterns',
    frontmatter: {
      description: 'API and data fetching patterns',
      globs: ['**/api/**', '**/lib/**', '**/services/**', '**/hooks/**'],
      alwaysApply: false,
      priority: 60,
    },
    content,
    impact: 0,
    hash: hashContent(content),
    incremental: false,
  };
}

function generateEnvironmentRule(analysis: ProjectAnalysis): ForgeRule {
  const envVars = analysis.envVars || { variables: [], sensitive: [], missing: [] };

  const sensitiveSection =
    (envVars.sensitive?.length || 0) > 0
      ? `
## Sensitive Variables
${envVars.sensitive.map((v) => `- 🔒 \`${v}\``).join('\n')}
`
      : '';

  const missingSection =
    (envVars.missing?.length || 0) > 0
      ? `
## Missing Variables (used but not declared)
${envVars.missing.map((v) => `- ⚠️ \`${v}\``).join('\n')}
`
      : '';

  const content = `# Environment Variables

## Variables (${envVars.variables?.length || 0})
${envVars.variables?.slice(0, 15).map((v) => `- \`${v}\``).join('\n') || '- None detected'}

${sensitiveSection}
${missingSection}

## Environment Guidelines

### Required
- All env vars must be documented in \`.env.example\`
- All env vars must have validation at startup
- Sensitive vars must use secrets management in production

### Forbidden
- Never commit \`.env\` files
- Never hardcode environment-specific values
- Never expose secrets to client-side code

### Conventions
- Use SCREAMING_SNAKE_CASE
- Prefix client-safe vars with \`NEXT_PUBLIC_\` or equivalent
- Group related vars with common prefix
`;

  return {
    id: 'environment',
    category: 'environment',
    name: 'Environment',
    description: 'Environment variable management',
    frontmatter: {
      description: 'Environment variable management',
      globs: ['**/*.env*', '**/config/**'],
      alwaysApply: false,
      priority: 45,
    },
    content,
    impact: 0,
    hash: hashContent(content),
    incremental: false,
  };
}

function generateHooksRule(analysis: ProjectAnalysis): ForgeRule {
  const hooks = analysis.patterns?.hooks || [];

  const content = `# Custom Hooks

## Project Hooks (${hooks.length})
${hooks.slice(0, 15).map((h) => `- \`${h}\``).join('\n')}
${hooks.length > 15 ? `\n... and ${hooks.length - 15} more` : ''}

## Hook Guidelines

### Naming
- Always prefix with \`use\`
- Name describes what the hook does (e.g., \`useUserProfile\`)

### Structure
\`\`\`typescript
export function useHookName(params: HookParams): HookReturn {
  // State declarations
  // Effects
  // Callbacks (memoized)
  // Return value
}
\`\`\`

### Required
- Return type must be explicitly defined
- Dependencies array must be complete
- Cleanup functions for subscriptions/timers

### Forbidden
- No conditional hook calls
- No hooks inside loops
- No side effects outside useEffect
`;

  return {
    id: 'hooks',
    category: 'hooks',
    name: 'Custom Hooks',
    description: 'React hooks patterns and conventions',
    frontmatter: {
      description: 'React hooks patterns',
      globs: ['**/hooks/**/*.{ts,tsx}', '**/use*.{ts,tsx}'],
      alwaysApply: false,
      priority: 50,
    },
    content,
    impact: 0,
    hash: hashContent(content),
    incremental: false,
  };
}

function generateAPIPatternRule(analysis: ProjectAnalysis): ForgeRule {
  const apiRoutes = analysis.apiRoutes || [];

  const content = `# API Patterns

## Endpoints (${apiRoutes.length})
${apiRoutes
  .slice(0, 10)
  .map((r) => `- \`${r.method} ${r.path}\``)
  .join('\n')}

## API Design Guidelines

### RESTful Conventions
- Use nouns for resources (\`/users\`, \`/posts\`)
- Use HTTP methods appropriately (GET, POST, PUT, DELETE)
- Use proper status codes (200, 201, 400, 401, 404, 500)

### Required
- All endpoints must have input validation
- All endpoints must have proper error handling
- All endpoints must have appropriate auth checks

### Response Format
\`\`\`typescript
// Success
{ data: T, meta?: { page, total } }

// Error
{ error: { code: string, message: string, details?: object } }
\`\`\`

### Forbidden
- No business logic in route handlers
- No direct database queries in handlers
- No unvalidated user input
`;

  return {
    id: 'api-patterns',
    category: 'api-patterns',
    name: 'API Patterns',
    description: 'API design patterns and conventions',
    frontmatter: {
      description: 'API design patterns',
      globs: ['**/api/**', '**/routes/**', '**/controllers/**'],
      alwaysApply: false,
      priority: 55,
    },
    content,
    impact: 0,
    hash: hashContent(content),
    incremental: false,
  };
}

function generateSecurityRule(): ForgeRule {
  const content = `# Security Guidelines

## Critical Rules

### Authentication
- Always verify user identity before protected operations
- Use secure session management
- Implement proper logout/session invalidation

### Authorization
- Check permissions at every protected endpoint
- Never trust client-side permission checks alone
- Implement role-based access control (RBAC)

### Input Validation
- Validate all user input on the server
- Sanitize data before database queries
- Use parameterized queries (never string concatenation)

### Secrets Management
- Never commit secrets to version control
- Use environment variables for sensitive config
- Rotate secrets regularly

## Forbidden
- ❌ Never store passwords in plain text
- ❌ Never expose stack traces to users
- ❌ Never use eval() with user input
- ❌ Never disable SSL verification
- ❌ Never hardcode API keys or credentials

## Required
- ✅ Use HTTPS everywhere
- ✅ Implement rate limiting
- ✅ Log security-relevant events
- ✅ Keep dependencies updated
`;

  return {
    id: 'security',
    category: 'security',
    name: 'Security',
    description: 'Security best practices and requirements',
    frontmatter: {
      description: 'Security best practices',
      globs: ['**/*.{ts,tsx,js,jsx}'],
      alwaysApply: false,
      priority: 90,
    },
    content,
    impact: 0,
    hash: hashContent(content),
    incremental: false,
  };
}

function generateAuthenticationRule(analysis: ProjectAnalysis): ForgeRule {
  const auth = analysis.patterns?.authentication || 'Not detected';

  const content = `# Authentication

## Auth Provider: ${auth}

## Authentication Patterns

### Session Management
- Use HTTP-only cookies for session tokens
- Implement proper session expiration
- Support session revocation

### Password Security
- Use bcrypt or argon2 for password hashing
- Enforce strong password requirements
- Implement account lockout after failed attempts

### OAuth/SSO
- Use established libraries (e.g., NextAuth, Passport)
- Validate redirect URLs
- Store tokens securely

## Required
- All protected routes must check authentication
- All auth state changes must be logged
- All password resets must use secure tokens

## Forbidden
- No custom crypto implementations
- No password storage without hashing
- No session tokens in URLs
`;

  return {
    id: 'authentication',
    category: 'authentication',
    name: 'Authentication',
    description: 'Authentication patterns and security',
    frontmatter: {
      description: 'Authentication patterns',
      globs: ['**/auth/**', '**/login/**', '**/session/**'],
      alwaysApply: false,
      priority: 80,
    },
    content,
    impact: 0,
    hash: hashContent(content),
    incremental: false,
  };
}

function generateDatabaseRule(analysis: ProjectAnalysis): ForgeRule {
  const models = analysis.models || [];

  const content = `# Database Guidelines

## Models (${models.length})
${models
  .slice(0, 10)
  .map((m) => `- \`${m.name}\` - \`${m.path}\``)
  .join('\n')}

## Database Patterns

### Query Safety
- Always use parameterized queries
- Never concatenate user input into queries
- Use an ORM or query builder

### Performance
- Add indexes for frequently queried columns
- Use pagination for large result sets
- Avoid N+1 query patterns

### Migrations
- Always create migrations for schema changes
- Test migrations in staging first
- Have a rollback plan

## Required
- All database access through repository/service layer
- All queries must have timeout limits
- All sensitive data must be encrypted at rest

## Forbidden
- No raw SQL with user input concatenation
- No unbounded queries (always use LIMIT)
- No direct database access from controllers
`;

  return {
    id: 'database',
    category: 'database',
    name: 'Database',
    description: 'Database patterns and conventions',
    frontmatter: {
      description: 'Database patterns',
      globs: ['**/prisma/**', '**/models/**', '**/db/**', '**/repositories/**'],
      alwaysApply: false,
      priority: 70,
    },
    content,
    impact: 0,
    hash: hashContent(content),
    incremental: false,
  };
}

function generateErrorHandlingRule(): ForgeRule {
  const content = `# Error Handling

## Error Handling Patterns

### Error Types
- \`ValidationError\` - Input validation failures
- \`AuthError\` - Authentication/authorization failures
- \`NotFoundError\` - Resource not found
- \`InternalError\` - Unexpected server errors

### Error Structure
\`\`\`typescript
interface AppError {
  code: string;
  message: string;
  statusCode: number;
  details?: Record<string, unknown>;
}
\`\`\`

### Required
- All async operations must have try/catch
- All errors must be logged with context
- All user-facing errors must be sanitized

### Forbidden
- No swallowing errors silently
- No exposing internal error details to users
- No using generic catch-all without re-throwing

## Error Boundaries
- Implement error boundaries for UI components
- Provide fallback UI for error states
- Log client-side errors to monitoring service
`;

  return {
    id: 'error-handling',
    category: 'error-handling',
    name: 'Error Handling',
    description: 'Error handling patterns and conventions',
    frontmatter: {
      description: 'Error handling patterns',
      globs: ['**/*.{ts,tsx,js,jsx}'],
      alwaysApply: false,
      priority: 60,
    },
    content,
    impact: 0,
    hash: hashContent(content),
    incremental: false,
  };
}

function generatePerformanceRule(): ForgeRule {
  const content = `# Performance Guidelines

## Frontend Performance

### Code Splitting
- Use dynamic imports for large dependencies
- Split routes into separate bundles
- Lazy load below-the-fold content

### Rendering
- Memoize expensive computations
- Avoid unnecessary re-renders
- Use virtual lists for large datasets

### Assets
- Optimize images (WebP, lazy loading)
- Minimize bundle size
- Use CDN for static assets

## Backend Performance

### Database
- Index frequently queried columns
- Use connection pooling
- Implement query caching where appropriate

### API
- Implement response caching
- Use pagination for list endpoints
- Compress responses (gzip/brotli)

## Forbidden
- No synchronous operations blocking event loop
- No unbounded data fetching
- No memory leaks from uncleaned subscriptions
`;

  return {
    id: 'performance',
    category: 'performance',
    name: 'Performance',
    description: 'Performance optimization guidelines',
    frontmatter: {
      description: 'Performance optimization',
      globs: ['**/*.{ts,tsx,js,jsx}'],
      alwaysApply: false,
      priority: 55,
    },
    content,
    impact: 0,
    hash: hashContent(content),
    incremental: false,
  };
}

function generateCompletionTrackingRule(): ForgeRule {
  const content = `# Completion Tracking Protocol

After every implementation action, provide a clear status update.

## Required Format

End implementation responses with:

\`\`\`
## ✅ Completed
- [What was just done]

## 🔲 Remaining
- [Next step needed]
- [Other pending items]

## 🎯 Feature Complete When
- [Specific criteria for "done"]
\`\`\`

## Rules

1. **Never leave status ambiguous** - Always state what's done vs pending
2. **Be specific** - "Add error handling to submitForm()" not "finish the form"
3. **Include acceptance criteria** - What proves this feature works?
4. **Update on every action** - Even small changes get status updates

## Example

After adding a new API endpoint:

\`\`\`
## ✅ Completed
- Created POST /api/users endpoint
- Added request validation with Zod
- Connected to database

## 🔲 Remaining
- Add error handling for duplicate emails
- Write integration tests
- Update API documentation

## 🎯 Feature Complete When
- Endpoint returns 201 on success, 400 on validation error, 409 on duplicate
- Tests cover happy path + error cases
- Swagger docs updated
\`\`\`

## When Feature is 100% Done

\`\`\`
## ✅ Feature Complete!
All acceptance criteria met:
- [x] Criterion 1
- [x] Criterion 2
- [x] Criterion 3

Ready for: code review / testing / deployment
\`\`\`
`;

  return {
    id: 'completion-tracking',
    category: 'workflow',
    name: 'Completion Tracking',
    description: 'Always communicate what is complete and what remains',
    frontmatter: {
      description: 'Always communicate what is complete and what remains',
      globs: ['**/*'],
      alwaysApply: true,
      priority: 98,
    },
    content,
    impact: 98,
    hash: hashContent(content),
    incremental: false,
  };
}

// ============================================================================
// UTILITIES
// ============================================================================

function hashContent(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 12);
}
