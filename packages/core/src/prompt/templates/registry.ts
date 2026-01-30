/**
 * Prompt Template Registry
 *
 * Centralized registry of all prompt templates.
 * Templates are organized by category with Pro tier gating.
 */

import type { PromptTemplate, PromptCategory, WorkspaceContext } from './types.js';

// ============================================================================
// SMART VARIABLES
// ============================================================================

export const SMART_VARIABLES: Record<string, (ctx: WorkspaceContext) => string> = {
  '{{PROJECT_NAME}}': (ctx) => ctx.projectName,
  '{{FRAMEWORK}}': (ctx) => ctx.framework,
  '{{LANGUAGE}}': (ctx) => (ctx.language === 'typescript' ? 'TypeScript' : 'JavaScript'),
  '{{CURRENT_FILE}}': (ctx) => ctx.currentFile || 'N/A',
  '{{FILE_LANGUAGE}}': (ctx) => ctx.currentFileLanguage || 'unknown',
  '{{SELECTION}}': (ctx) => ctx.selectedText || '',
  '{{PACKAGE_MANAGER}}': (ctx) => ctx.packageManager,
  '{{DATABASE}}': (ctx) => {
    if (ctx.hasSupabase) return 'Supabase';
    if (ctx.hasPrisma && ctx.hasPostgres) return 'PostgreSQL with Prisma';
    if (ctx.hasDrizzle) return 'Drizzle ORM';
    if (ctx.hasMongoDB) return 'MongoDB';
    if (ctx.hasFirebase) return 'Firebase';
    return 'PostgreSQL';
  },
  '{{AUTH_LIBRARY}}': (ctx) => {
    if (ctx.hasClerk) return 'Clerk';
    if (ctx.hasNextAuth || ctx.hasAuthJs) return 'NextAuth.js / Auth.js';
    if (ctx.hasSupabase) return 'Supabase Auth';
    if (ctx.hasFirebase) return 'Firebase Auth';
    return 'NextAuth.js';
  },
  '{{UI_LIBRARY}}': (ctx) => {
    if (ctx.hasShadcn) return 'shadcn/ui';
    if (ctx.hasRadix) return 'Radix UI';
    if (ctx.hasTailwind) return 'Tailwind CSS';
    return 'Tailwind CSS';
  },
  '{{TEST_FRAMEWORK}}': (ctx) => ctx.testFramework || 'Vitest',
};

// ============================================================================
// FREE TIER TEMPLATES (5 core templates)
// ============================================================================

const FREE_TEMPLATES: PromptTemplate[] = [
  // General - Implement Feature
  {
    id: 'general-feature',
    name: 'Implement Feature',
    category: 'general',
    description: 'Build a new feature from scratch',
    icon: '✨',
    keywords: ['feature', 'implement', 'build', 'create', 'add', 'new'],
    popularity: 100,
    isPro: false,
    contextQuestions: [
      {
        id: 'feature',
        label: 'Feature Description',
        placeholder: 'What feature do you want to build?',
        type: 'text',
        required: true,
      },
      {
        id: 'scope',
        label: 'Scope',
        placeholder: 'Select implementation scope',
        type: 'select',
        options: [
          { label: 'Full Stack', value: 'fullstack', default: true },
          { label: 'Frontend Only', value: 'frontend' },
          { label: 'Backend Only', value: 'backend' },
        ],
        required: true,
      },
    ],
    outputSections: ['Plan', 'Files', 'Code', 'Tests'],
    template: `You are a senior engineer. IMPLEMENT the following feature:

**Feature**: {{feature}}

## Project Context
- **Framework**: {{FRAMEWORK}}
- **Language**: {{LANGUAGE}}
- **Database**: {{DATABASE}}
- **Scope**: {{scope}}

## Requirements
1. Production-ready code with proper error handling
2. TypeScript types for all code
3. Follow existing project patterns
4. Include validation where needed

## Output Format
A) Implementation Plan (10 bullets max)
B) Files to Create/Modify
C) Complete Code for each file
D) Testing suggestions

Provide complete, copy-paste ready code.`,
  },

  // Debugging - Fix Error
  {
    id: 'debugging-error',
    name: 'Debug Error',
    category: 'debugging',
    description: 'Analyze and fix an error',
    icon: '🐛',
    keywords: ['error', 'bug', 'fix', 'debug', 'issue', 'problem', 'crash'],
    popularity: 95,
    isPro: false,
    contextQuestions: [
      {
        id: 'error',
        label: 'Error Message',
        placeholder: 'Paste the error message/stack trace',
        type: 'text',
        required: true,
      },
      {
        id: 'context',
        label: 'What were you trying to do?',
        placeholder: 'Describe the action that caused the error',
        type: 'text',
        required: true,
      },
    ],
    outputSections: ['Analysis', 'Root Cause', 'Fix', 'Prevention'],
    template: `You are a senior debugging expert. Analyze and fix this error:

**Error**:
\`\`\`
{{error}}
\`\`\`

**Context**: {{context}}

## Project Context
- **Framework**: {{FRAMEWORK}}
- **Language**: {{LANGUAGE}}
{{#if CURRENT_FILE}}
- **Current File**: {{CURRENT_FILE}}
{{/if}}

## Output Format
A) Error Analysis - What the error means
B) Root Cause - Why it happened
C) Fix - Exact code changes needed
D) Prevention - How to avoid in future

Be specific with line numbers and file paths.`,
  },

  // Refactoring
  {
    id: 'refactoring-code',
    name: 'Refactor Code',
    category: 'refactoring',
    description: 'Improve code quality and structure',
    icon: '♻️',
    keywords: ['refactor', 'improve', 'clean', 'optimize', 'restructure'],
    popularity: 85,
    isPro: false,
    contextQuestions: [
      {
        id: 'goal',
        label: 'Refactoring Goal',
        placeholder: 'What do you want to improve?',
        type: 'select',
        options: [
          { label: 'Readability', value: 'readability', default: true },
          { label: 'Performance', value: 'performance' },
          { label: 'Type Safety', value: 'type-safety' },
          { label: 'Extract Component/Function', value: 'extract' },
          { label: 'Remove Duplication', value: 'dedup' },
        ],
        required: true,
      },
    ],
    outputSections: ['Analysis', 'Changes', 'Code'],
    template: `You are a senior engineer. Refactor this code for **{{goal}}**:

{{#if SELECTION}}
**Code to Refactor**:
\`\`\`{{FILE_LANGUAGE}}
{{SELECTION}}
\`\`\`
{{/if}}

## Project Context
- **Framework**: {{FRAMEWORK}}
- **Language**: {{LANGUAGE}}
{{#if CURRENT_FILE}}
- **File**: {{CURRENT_FILE}}
{{/if}}

## Output Format
A) Current Issues
B) Proposed Changes
C) Refactored Code (complete)
D) Benefits of changes

Maintain functionality while improving {{goal}}.`,
  },

  // Testing - Basic Unit Tests
  {
    id: 'testing-basic',
    name: 'Write Unit Tests',
    category: 'testing',
    description: 'Create unit tests for code',
    icon: '🧪',
    keywords: ['test', 'unit', 'testing', 'spec', 'coverage'],
    popularity: 80,
    isPro: false,
    contextQuestions: [
      {
        id: 'target',
        label: 'Code to Test',
        placeholder: 'Describe function/component to test',
        type: 'text',
        required: true,
      },
    ],
    outputSections: ['Test Plan', 'Tests', 'Coverage'],
    template: `You are a senior QA engineer. Write comprehensive unit tests:

**Target**: {{target}}

{{#if SELECTION}}
**Code**:
\`\`\`{{FILE_LANGUAGE}}
{{SELECTION}}
\`\`\`
{{/if}}

## Project Context
- **Framework**: {{FRAMEWORK}}
- **Test Framework**: {{TEST_FRAMEWORK}}

## Requirements
1. Cover happy path
2. Cover edge cases
3. Cover error cases
4. Use descriptive test names

## Output Format
A) Test Plan - What to test
B) Complete Test File
C) Coverage notes

Provide complete, runnable tests.`,
  },

  // Documentation
  {
    id: 'documentation-readme',
    name: 'Generate README',
    category: 'documentation',
    description: 'Create or update README documentation',
    icon: '📚',
    keywords: ['readme', 'documentation', 'docs', 'document'],
    popularity: 70,
    isPro: false,
    contextQuestions: [
      {
        id: 'type',
        label: 'README Type',
        placeholder: 'Select README type',
        type: 'select',
        options: [
          { label: 'Project README', value: 'project', default: true },
          { label: 'API Documentation', value: 'api' },
          { label: 'Component Documentation', value: 'component' },
        ],
        required: true,
      },
    ],
    outputSections: ['README'],
    template: `Generate a professional {{type}} README for:

**Project**: {{PROJECT_NAME}}
**Framework**: {{FRAMEWORK}}
**Language**: {{LANGUAGE}}

Include:
- Project description
- Installation instructions
- Usage examples
- API reference (if applicable)
- Contributing guidelines
- License

Use proper markdown formatting with badges.`,
  },
];

// ============================================================================
// PRO TIER TEMPLATES (20+ templates)
// ============================================================================

const PRO_TEMPLATES: PromptTemplate[] = [
  // Authentication - OAuth
  {
    id: 'auth-oauth',
    name: 'OAuth Login (Google, GitHub)',
    category: 'authentication',
    description: 'Social login with OAuth providers',
    icon: '🔐',
    keywords: ['login', 'oauth', 'google', 'github', 'auth', 'social'],
    popularity: 100,
    isPro: true,
    contextQuestions: [
      {
        id: 'providers',
        label: 'OAuth Providers',
        placeholder: 'Select providers',
        type: 'multiselect',
        options: [
          { label: 'Google', value: 'google', default: true },
          { label: 'GitHub', value: 'github', default: true },
          { label: 'Discord', value: 'discord' },
          { label: 'Microsoft', value: 'microsoft' },
        ],
        required: true,
      },
      {
        id: 'authLibrary',
        label: 'Auth Library',
        placeholder: 'Select library',
        type: 'select',
        options: [
          { label: 'NextAuth.js', value: 'nextauth', default: true },
          { label: 'Clerk', value: 'clerk' },
          { label: 'Supabase Auth', value: 'supabase' },
        ],
        required: true,
      },
    ],
    outputSections: ['Plan', 'Files', 'Code', 'Env', 'Setup'],
    template: `You are a senior full-stack engineer. IMPLEMENT OAuth authentication with **{{providers}}**.

## Context
- **Framework**: {{FRAMEWORK}}
- **Auth Library**: {{authLibrary}}
- **Database**: {{DATABASE}}

## Requirements
1. Login page with provider buttons
2. Proper callback handling
3. Session management
4. Protected routes
5. Sign out functionality

## Output Format
A) Implementation Plan
B) Files to Create
C) Complete Code
D) Environment Variables
E) Provider Setup Guide

Provide production-ready code.`,
  },

  // Authentication - Email/Password
  {
    id: 'auth-credentials',
    name: 'Email & Password Auth',
    category: 'authentication',
    description: 'Traditional email/password with verification',
    icon: '📧',
    keywords: ['email', 'password', 'register', 'signup', 'login'],
    popularity: 95,
    isPro: true,
    contextQuestions: [
      {
        id: 'features',
        label: 'Features',
        placeholder: 'Select features',
        type: 'multiselect',
        options: [
          { label: 'Registration', value: 'registration', default: true },
          { label: 'Email verification', value: 'verification', default: true },
          { label: 'Password reset', value: 'reset', default: true },
          { label: '2FA', value: '2fa' },
        ],
        required: true,
      },
    ],
    outputSections: ['Plan', 'Schema', 'Code', 'Email', 'Security'],
    template: `Implement email/password authentication with {{features}}.

## Context
- **Framework**: {{FRAMEWORK}}
- **Database**: {{DATABASE}}

## Security Requirements
- Password hashing: bcrypt 12+ rounds
- Verification tokens: 24hr expiry
- Reset tokens: 1hr expiry
- Rate limiting on auth endpoints

Provide complete implementation.`,
  },

  // API - REST CRUD
  {
    id: 'api-rest-crud',
    name: 'REST API with CRUD',
    category: 'api',
    description: 'Full CRUD API with validation',
    icon: '🔌',
    keywords: ['api', 'rest', 'crud', 'endpoint'],
    popularity: 90,
    isPro: true,
    contextQuestions: [
      {
        id: 'resource',
        label: 'Resource Name',
        placeholder: 'e.g., users, products',
        type: 'text',
        required: true,
      },
      {
        id: 'operations',
        label: 'Operations',
        placeholder: 'Select operations',
        type: 'multiselect',
        options: [
          { label: 'Create', value: 'create', default: true },
          { label: 'Read', value: 'read', default: true },
          { label: 'Update', value: 'update', default: true },
          { label: 'Delete', value: 'delete', default: true },
          { label: 'Pagination', value: 'pagination', default: true },
        ],
        required: true,
      },
    ],
    outputSections: ['Plan', 'Schema', 'Routes', 'Code', 'Tests'],
    template: `Implement REST API for **{{resource}}** with {{operations}}.

## Context
- **Framework**: {{FRAMEWORK}}
- **Database**: {{DATABASE}}

## Requirements
- Zod validation
- Proper HTTP status codes
- Error handling
- TypeScript types

Provide complete implementation.`,
  },

  // API - tRPC
  {
    id: 'api-trpc',
    name: 'tRPC API',
    category: 'api',
    description: 'End-to-end typesafe APIs',
    icon: '🔷',
    keywords: ['trpc', 'api', 'typesafe'],
    popularity: 80,
    isPro: true,
    isNew: true,
    contextQuestions: [
      {
        id: 'resource',
        label: 'Router Name',
        placeholder: 'e.g., user, post',
        type: 'text',
        required: true,
      },
    ],
    outputSections: ['Router', 'Procedures', 'Client', 'Hooks'],
    template: `Implement tRPC router for **{{resource}}**.

## Context
- **Framework**: {{FRAMEWORK}}
- **Database**: {{DATABASE}}

Provide router, procedures, and React Query hooks.`,
  },

  // Frontend - React Component
  {
    id: 'frontend-component',
    name: 'React Component',
    category: 'frontend',
    description: 'Production-ready component',
    icon: '⚛️',
    keywords: ['react', 'component', 'ui'],
    popularity: 95,
    isPro: true,
    contextQuestions: [
      {
        id: 'componentName',
        label: 'Component Name',
        placeholder: 'e.g., DataTable, Modal',
        type: 'text',
        required: true,
      },
      {
        id: 'features',
        label: 'Features',
        placeholder: 'Select features',
        type: 'multiselect',
        options: [
          { label: 'TypeScript', value: 'typescript', default: true },
          { label: 'Accessibility', value: 'a11y', default: true },
          { label: 'Dark mode', value: 'dark', default: true },
          { label: 'Variants (CVA)', value: 'variants' },
        ],
        required: false,
      },
    ],
    outputSections: ['Props', 'Code', 'Variants', 'Usage'],
    template: `Create React component: **{{componentName}}** with {{features}}.

## Context
- **Framework**: {{FRAMEWORK}}
- **Styling**: {{UI_LIBRARY}}

## Requirements
- TypeScript props interface
- forwardRef pattern
- Accessible (ARIA)
- CVA variants if requested

Provide complete implementation.`,
  },

  // Frontend - Form
  {
    id: 'frontend-form',
    name: 'Form with Validation',
    category: 'frontend',
    description: 'React Hook Form + Zod',
    icon: '📝',
    keywords: ['form', 'validation', 'input'],
    popularity: 90,
    isPro: true,
    contextQuestions: [
      {
        id: 'formName',
        label: 'Form Purpose',
        placeholder: 'e.g., Registration, Contact',
        type: 'text',
        required: true,
      },
      {
        id: 'fields',
        label: 'Fields',
        placeholder: 'e.g., name, email, password',
        type: 'text',
        required: true,
      },
    ],
    outputSections: ['Schema', 'Component', 'Validation', 'Usage'],
    template: `Create form: **{{formName}}** with fields: {{fields}}.

## Context
- **Framework**: {{FRAMEWORK}}
- **Styling**: {{UI_LIBRARY}}

Use React Hook Form + Zod. Include validation and error handling.`,
  },

  // Database - Schema
  {
    id: 'database-schema',
    name: 'Database Schema',
    category: 'database',
    description: 'Schema with relationships',
    icon: '🗄️',
    keywords: ['database', 'schema', 'model'],
    popularity: 85,
    isPro: true,
    contextQuestions: [
      {
        id: 'domain',
        label: 'Domain',
        placeholder: 'e.g., e-commerce, blog',
        type: 'text',
        required: true,
      },
      {
        id: 'entities',
        label: 'Entities',
        placeholder: 'e.g., users, products',
        type: 'text',
        required: true,
      },
    ],
    outputSections: ['ERD', 'Schema', 'Migrations', 'Seeds'],
    template: `Design database schema for **{{domain}}** with entities: {{entities}}.

## Context
- **Database**: {{DATABASE}}

## Requirements
- Normalized (3NF)
- Proper relationships
- Strategic indexes

Provide complete Prisma/Drizzle schema.`,
  },

  // Testing - E2E
  {
    id: 'testing-e2e',
    name: 'E2E Tests (Playwright)',
    category: 'testing',
    description: 'End-to-end test suite',
    icon: '🎭',
    keywords: ['e2e', 'playwright', 'integration'],
    popularity: 75,
    isPro: true,
    contextQuestions: [
      {
        id: 'flow',
        label: 'User Flow',
        placeholder: 'e.g., Login, Checkout',
        type: 'text',
        required: true,
      },
    ],
    outputSections: ['Test Plan', 'Page Objects', 'Tests'],
    template: `Create Playwright E2E tests for **{{flow}}** user flow.

## Context
- **Framework**: {{FRAMEWORK}}

Include page objects, fixtures, and test cases.`,
  },

  // Deployment - Docker
  {
    id: 'deployment-docker',
    name: 'Docker Setup',
    category: 'deployment',
    description: 'Dockerfile and compose',
    icon: '🐳',
    keywords: ['docker', 'container', 'deployment'],
    popularity: 80,
    isPro: true,
    contextQuestions: [
      {
        id: 'services',
        label: 'Services',
        placeholder: 'Select services',
        type: 'multiselect',
        options: [
          { label: 'App', value: 'app', default: true },
          { label: 'Database', value: 'db', default: true },
          { label: 'Redis', value: 'redis' },
          { label: 'Nginx', value: 'nginx' },
        ],
        required: true,
      },
    ],
    outputSections: ['Dockerfile', 'Compose', 'Scripts'],
    template: `Create Docker setup for {{services}}.

## Context
- **Framework**: {{FRAMEWORK}}
- **Database**: {{DATABASE}}

Include multi-stage Dockerfile and docker-compose.yml.`,
  },

  // Deployment - CI/CD
  {
    id: 'deployment-cicd',
    name: 'CI/CD Pipeline',
    category: 'deployment',
    description: 'GitHub Actions workflow',
    icon: '🔄',
    keywords: ['ci', 'cd', 'github', 'actions', 'pipeline'],
    popularity: 75,
    isPro: true,
    contextQuestions: [
      {
        id: 'platform',
        label: 'CI Platform',
        placeholder: 'Select platform',
        type: 'select',
        options: [
          { label: 'GitHub Actions', value: 'github', default: true },
          { label: 'GitLab CI', value: 'gitlab' },
        ],
        required: true,
      },
      {
        id: 'deployTarget',
        label: 'Deploy Target',
        placeholder: 'Select target',
        type: 'select',
        options: [
          { label: 'Vercel', value: 'vercel', default: true },
          { label: 'AWS', value: 'aws' },
          { label: 'Docker', value: 'docker' },
        ],
        required: true,
      },
    ],
    outputSections: ['Workflow', 'Stages', 'Secrets'],
    template: `Create {{platform}} CI/CD pipeline deploying to {{deployTarget}}.

## Context
- **Framework**: {{FRAMEWORK}}

Include lint, test, build, and deploy stages.`,
  },

  // Performance - Optimization
  {
    id: 'performance-optimize',
    name: 'Performance Optimization',
    category: 'performance',
    description: 'Analyze and optimize performance',
    icon: '⚡',
    keywords: ['performance', 'optimize', 'speed', 'slow'],
    popularity: 70,
    isPro: true,
    contextQuestions: [
      {
        id: 'area',
        label: 'Optimization Area',
        placeholder: 'Select area',
        type: 'select',
        options: [
          { label: 'Bundle Size', value: 'bundle', default: true },
          { label: 'Runtime Performance', value: 'runtime' },
          { label: 'Database Queries', value: 'database' },
          { label: 'API Response Time', value: 'api' },
        ],
        required: true,
      },
    ],
    outputSections: ['Analysis', 'Recommendations', 'Implementation'],
    template: `Analyze and optimize **{{area}}** performance.

## Context
- **Framework**: {{FRAMEWORK}}

{{#if SELECTION}}
**Code**:
\`\`\`
{{SELECTION}}
\`\`\`
{{/if}}

Provide specific, actionable improvements.`,
  },

  // Security - Audit
  {
    id: 'security-audit',
    name: 'Security Audit',
    category: 'security',
    description: 'Security review and fixes',
    icon: '🛡️',
    keywords: ['security', 'audit', 'vulnerability'],
    popularity: 65,
    isPro: true,
    contextQuestions: [
      {
        id: 'scope',
        label: 'Audit Scope',
        placeholder: 'Select scope',
        type: 'select',
        options: [
          { label: 'Full Application', value: 'full', default: true },
          { label: 'Authentication', value: 'auth' },
          { label: 'API Endpoints', value: 'api' },
          { label: 'Dependencies', value: 'deps' },
        ],
        required: true,
      },
    ],
    outputSections: ['Findings', 'Severity', 'Fixes'],
    template: `Perform security audit on **{{scope}}**.

## Context
- **Framework**: {{FRAMEWORK}}

Check for:
- OWASP Top 10 vulnerabilities
- Hardcoded secrets
- Insecure configurations
- Dependency vulnerabilities

Provide findings with severity and fixes.`,
  },

  // AI Integration
  {
    id: 'ai-integration',
    name: 'AI Integration',
    category: 'ai-ml',
    description: 'OpenAI/Anthropic integration',
    icon: '🤖',
    keywords: ['ai', 'openai', 'llm', 'chatgpt', 'claude'],
    popularity: 85,
    isPro: true,
    isNew: true,
    contextQuestions: [
      {
        id: 'provider',
        label: 'AI Provider',
        placeholder: 'Select provider',
        type: 'select',
        options: [
          { label: 'OpenAI', value: 'openai', default: true },
          { label: 'Anthropic', value: 'anthropic' },
          { label: 'Vercel AI SDK', value: 'vercel-ai' },
        ],
        required: true,
      },
      {
        id: 'feature',
        label: 'Feature Type',
        placeholder: 'Select feature',
        type: 'select',
        options: [
          { label: 'Chat Interface', value: 'chat', default: true },
          { label: 'Text Generation', value: 'generation' },
          { label: 'RAG/Embeddings', value: 'rag' },
          { label: 'Streaming', value: 'streaming' },
        ],
        required: true,
      },
    ],
    outputSections: ['Setup', 'API', 'UI', 'Error Handling'],
    template: `Implement {{feature}} using {{provider}}.

## Context
- **Framework**: {{FRAMEWORK}}

## Requirements
- Type-safe API client
- Error handling with retries
- Rate limiting consideration
- Cost optimization tips

Provide complete implementation.`,
  },
];

// ============================================================================
// REGISTRY
// ============================================================================

/** All registered templates */
export const PROMPT_TEMPLATES: PromptTemplate[] = [...FREE_TEMPLATES, ...PRO_TEMPLATES];

/** Get templates by category */
export function getTemplatesByCategory(category: PromptCategory): PromptTemplate[] {
  return PROMPT_TEMPLATES.filter((t) => t.category === category).sort(
    (a, b) => (b.popularity || 0) - (a.popularity || 0)
  );
}

/** Get free tier templates only */
export function getFreeTemplates(): PromptTemplate[] {
  return PROMPT_TEMPLATES.filter((t) => !t.isPro);
}

/** Get Pro tier templates only */
export function getProTemplates(): PromptTemplate[] {
  return PROMPT_TEMPLATES.filter((t) => t.isPro);
}

/** Get template by ID */
export function getTemplateById(id: string): PromptTemplate | undefined {
  return PROMPT_TEMPLATES.find((t) => t.id === id);
}

/** Get all categories with template counts */
export function getCategoriesWithCounts(): Array<{ category: PromptCategory; count: number }> {
  const counts = new Map<PromptCategory, number>();
  for (const template of PROMPT_TEMPLATES) {
    counts.set(template.category, (counts.get(template.category) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
}

/** Search templates by keyword */
export function searchTemplates(query: string): PromptTemplate[] {
  const q = query.toLowerCase();
  return PROMPT_TEMPLATES.filter(
    (t) =>
      t.name.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.keywords.some((k) => k.includes(q))
  ).sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
}

/** Detect template from user input */
export function detectTemplate(input: string): PromptTemplate | null {
  const q = input.toLowerCase();

  for (const template of PROMPT_TEMPLATES.sort((a, b) => (b.popularity || 0) - (a.popularity || 0))) {
    for (const keyword of template.keywords) {
      if (q.includes(keyword)) {
        return template;
      }
    }
  }

  return null;
}
