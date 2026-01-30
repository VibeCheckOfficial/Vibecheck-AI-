import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

// ═══════════════════════════════════════════════════════════════════════════════
// Types & Interfaces
// ═══════════════════════════════════════════════════════════════════════════════

export interface PromptTemplate {
  id: string;
  name: string;
  category: PromptCategory;
  description: string;
  icon: string;
  keywords: string[];
  template: string;
  contextQuestions: ContextQuestion[];
  outputSections: string[];
  popularity?: number;
  isNew?: boolean;
  isPro?: boolean;
}

export interface ContextQuestion {
  id: string;
  label: string;
  placeholder: string;
  type: 'select' | 'text' | 'multiselect' | 'boolean';
  options?: { label: string; value: string; default?: boolean }[];
  required: boolean;
  dependsOn?: string;
}

export interface WorkspaceContext {
  projectName: string;
  hasTypeScript: boolean;
  hasNextJs: boolean;
  hasReact: boolean;
  hasVue: boolean;
  hasSvelte: boolean;
  hasAngular: boolean;
  hasVite: boolean;
  hasExpress: boolean;
  hasFastify: boolean;
  hasNestJs: boolean;
  hasPrisma: boolean;
  hasDrizzle: boolean;
  hasMongoDB: boolean;
  hasPostgres: boolean;
  hasSupabase: boolean;
  hasFirebase: boolean;
  hasClerk: boolean;
  hasNextAuth: boolean;
  hasAuthJs: boolean;
  hasTailwind: boolean;
  hasShadcn: boolean;
  hasRadix: boolean;
  packageManager: 'npm' | 'yarn' | 'pnpm' | 'bun';
  framework: string;
  language: 'typescript' | 'javascript';
  testFramework: string | null;
  hasDocker: boolean;
  hasGit: boolean;
  hasTurbo: boolean;
  isMonorepo: boolean;
  currentFile?: string;
  currentFileLanguage?: string;
  selectedText?: string;
}

export interface BuiltPrompt {
  id: string;
  timestamp: Date;
  originalInput: string;
  category: PromptCategory;
  template: string;
  expandedPrompt: string;
  context: Record<string, string>;
  quality: PromptQuality;
  isFavorite?: boolean;
}

export interface PromptQuality {
  score: number;
  completeness: number;
  specificity: number;
  clarity: number;
  suggestions: string[];
}

export interface SmartSuggestion {
  type: 'template' | 'enhancement' | 'context';
  title: string;
  description: string;
  action: string;
  data?: unknown;
}

export type PromptCategory =
  | 'authentication'
  | 'api'
  | 'database'
  | 'frontend'
  | 'backend'
  | 'testing'
  | 'deployment'
  | 'refactoring'
  | 'debugging'
  | 'performance'
  | 'security'
  | 'documentation'
  | 'ai-ml'
  | 'mobile'
  | 'general';

// ═══════════════════════════════════════════════════════════════════════════════
// Smart Variables
// ═══════════════════════════════════════════════════════════════════════════════

const SMART_VARIABLES: Record<string, (ctx: WorkspaceContext) => string> = {
  '{{PROJECT_NAME}}': ctx => ctx.projectName,
  '{{FRAMEWORK}}': ctx => ctx.framework,
  '{{LANGUAGE}}': ctx => ctx.language === 'typescript' ? 'TypeScript' : 'JavaScript',
  '{{CURRENT_FILE}}': ctx => ctx.currentFile || 'N/A',
  '{{FILE_LANGUAGE}}': ctx => ctx.currentFileLanguage || 'unknown',
  '{{SELECTION}}': ctx => ctx.selectedText || '',
  '{{PACKAGE_MANAGER}}': ctx => ctx.packageManager,
  '{{DATABASE}}': ctx => {
    if (ctx.hasSupabase) return 'Supabase';
    if (ctx.hasPrisma && ctx.hasPostgres) return 'PostgreSQL with Prisma';
    if (ctx.hasDrizzle) return 'Drizzle ORM';
    if (ctx.hasMongoDB) return 'MongoDB';
    if (ctx.hasFirebase) return 'Firebase';
    return 'PostgreSQL';
  },
  '{{AUTH_LIBRARY}}': ctx => {
    if (ctx.hasClerk) return 'Clerk';
    if (ctx.hasNextAuth || ctx.hasAuthJs) return 'NextAuth.js / Auth.js';
    if (ctx.hasSupabase) return 'Supabase Auth';
    if (ctx.hasFirebase) return 'Firebase Auth';
    return 'NextAuth.js';
  },
  '{{UI_LIBRARY}}': ctx => {
    if (ctx.hasShadcn) return 'shadcn/ui';
    if (ctx.hasRadix) return 'Radix UI';
    if (ctx.hasTailwind) return 'Tailwind CSS';
    return 'Tailwind CSS';
  },
  '{{TEST_FRAMEWORK}}': ctx => ctx.testFramework || 'Vitest',
};

// ═══════════════════════════════════════════════════════════════════════════════
// Prompt Templates - Comprehensive Collection
// ═══════════════════════════════════════════════════════════════════════════════

const PROMPT_TEMPLATES: PromptTemplate[] = [
  // ─────────────────────────────────────────────────────────────────────────────
  // AUTHENTICATION (Most Popular)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'auth-oauth',
    name: 'OAuth Login (Google, GitHub, etc.)',
    category: 'authentication',
    description: 'Social login with multiple OAuth providers',
    icon: '🔐',
    keywords: ['login', 'signin', 'sign in', 'oauth', 'google', 'github', 'auth', 'authentication', 'social login', 'sso'],
    popularity: 100,
    contextQuestions: [
      {
        id: 'providers',
        label: 'OAuth Providers',
        placeholder: 'Select providers to integrate',
        type: 'multiselect',
        options: [
          { label: 'Google', value: 'google', default: true },
          { label: 'GitHub', value: 'github', default: true },
          { label: 'Discord', value: 'discord' },
          { label: 'Twitter/X', value: 'twitter' },
          { label: 'Apple', value: 'apple' },
          { label: 'Microsoft', value: 'microsoft' },
          { label: 'LinkedIn', value: 'linkedin' },
          { label: 'Spotify', value: 'spotify' },
          { label: 'Twitch', value: 'twitch' },
        ],
        required: true,
      },
      {
        id: 'authLibrary',
        label: 'Auth Library',
        placeholder: 'Select authentication library',
        type: 'select',
        options: [
          { label: 'NextAuth.js / Auth.js', value: 'nextauth', default: true },
          { label: 'Clerk', value: 'clerk' },
          { label: 'Supabase Auth', value: 'supabase' },
          { label: 'Firebase Auth', value: 'firebase' },
          { label: 'Lucia', value: 'lucia' },
          { label: 'Passport.js', value: 'passport' },
        ],
        required: true,
      },
      {
        id: 'features',
        label: 'Additional Features',
        placeholder: 'Select features to include',
        type: 'multiselect',
        options: [
          { label: 'Role-based access (RBAC)', value: 'rbac' },
          { label: 'Email/password fallback', value: 'credentials' },
          { label: 'Magic link login', value: 'magic-link' },
          { label: '2FA / MFA', value: '2fa' },
          { label: 'Account linking', value: 'account-linking' },
          { label: 'Session management', value: 'sessions' },
          { label: 'Remember me', value: 'remember-me' },
        ],
        required: false,
      },
    ],
    outputSections: ['Plan', 'Files', 'Code', 'Env Variables', 'Provider Setup', 'Test Checklist', 'Security Notes'],
    template: `You are a senior full-stack engineer. I need you to IMPLEMENT (not just explain) a production-ready authentication system with **{{providers}}** OAuth.

## Project Context
- **Framework**: {{frontend}}
- **Backend**: {{backend}}
- **Database**: {{database}}
- **Auth Library**: {{authLibrary}}
- **TypeScript**: {{typescript}}
- **UI**: {{styling}}
{{#if features}}
- **Features**: {{features}}
{{/if}}

## Goal
Build a complete authentication flow with:

### Core Requirements
1. **Login Page** at \`/login\` with:
   - Provider buttons for: {{providers}}
   - Clean, accessible UI with loading states
   - Error handling (OAuth denied, callback errors)
   - Redirect to dashboard on success

2. **Auth Callbacks** for each provider:
   - Proper state/nonce validation
   - PKCE flow if supported
   - Error boundary handling

3. **Session Management**:
   - Secure cookie configuration (HttpOnly, Secure, SameSite)
   - Session persistence across refreshes
   - Token refresh handling

4. **Protected Routes**:
   - Middleware for route protection
   - Example: \`/dashboard\` (authenticated only)
   - Redirect unauthenticated users to login

5. **Sign Out**:
   - Clear session and tokens
   - Redirect to home/login
   - Invalidate server session

{{#if features}}
### Additional Features
{{featuresList}}
{{/if}}

## Non-Negotiable Requirements
1. **Use official libraries only** — no custom OAuth implementations
2. **File-by-file implementation** with exact paths and complete code
3. **.env.example** with all required variables and descriptions
4. **Provider setup checklist** for each OAuth provider:
   - Console URLs for setup
   - Exact redirect URIs for dev and prod
   - Required scopes (minimal)
5. **Security best practices**:
   - CSRF protection
   - Secure cookie settings
   - Redirect URL validation
   - Rate limiting recommendations
6. **Error handling** for all failure modes
7. **TypeScript types** for all auth-related code

## Output Format
Provide your response in this exact structure:

### A) Implementation Plan
- Max 10 bullet points summarizing the approach

### B) Files to Create
- List each file with its purpose

### C) Complete Code
- Full implementation for each file (copy-paste ready)
- Include all imports and types
- No placeholders or TODOs

### D) Environment Variables
\`\`\`env
# .env.example with descriptions
\`\`\`

### E) Provider Setup Guide
Step-by-step for each provider

### F) Testing Checklist
How to verify each flow works

### G) Common Issues & Fixes
Top 8 failure scenarios with solutions

## Start Implementation
Begin with the plan, then provide complete, production-ready code.`,
  },

  {
    id: 'auth-credentials',
    name: 'Email & Password Auth',
    category: 'authentication',
    description: 'Traditional email/password with verification',
    icon: '📧',
    keywords: ['email', 'password', 'register', 'signup', 'sign up', 'login', 'credentials', 'verification'],
    popularity: 95,
    contextQuestions: [
      {
        id: 'features',
        label: 'Features',
        placeholder: 'Select authentication features',
        type: 'multiselect',
        options: [
          { label: 'Registration', value: 'registration', default: true },
          { label: 'Email verification', value: 'email-verification', default: true },
          { label: 'Password reset', value: 'password-reset', default: true },
          { label: 'Remember me', value: 'remember-me' },
          { label: 'Account lockout', value: 'lockout' },
          { label: 'Password strength meter', value: 'password-strength' },
          { label: '2FA with TOTP', value: '2fa' },
          { label: 'Email change flow', value: 'email-change' },
        ],
        required: true,
      },
      {
        id: 'emailProvider',
        label: 'Email Provider',
        placeholder: 'Select email service',
        type: 'select',
        options: [
          { label: 'Resend', value: 'resend', default: true },
          { label: 'SendGrid', value: 'sendgrid' },
          { label: 'AWS SES', value: 'ses' },
          { label: 'Postmark', value: 'postmark' },
          { label: 'Nodemailer (SMTP)', value: 'nodemailer' },
        ],
        required: true,
      },
    ],
    outputSections: ['Plan', 'Files', 'Code', 'Schema', 'Email Templates', 'Security', 'Tests'],
    template: `You are a senior full-stack engineer. IMPLEMENT a production-ready email/password authentication system.

## Context
- **Framework**: {{frontend}}
- **Backend**: {{backend}}
- **Database**: {{database}}
- **Email Service**: {{emailProvider}}
- **TypeScript**: {{typescript}}

## Features to Implement
{{featuresList}}

## Security Requirements
- Password hashing: bcrypt with 12+ rounds
- Minimum password: 8 chars, uppercase, lowercase, number
- Account lockout: 5 failed attempts = 15 min cooldown
- Verification tokens: 24-hour expiry
- Reset tokens: 1-hour expiry
- Session expiry: 7 days (configurable)
- CSRF protection on all forms
- Rate limiting on auth endpoints

## Required Components
1. **Registration Form** - Email, password, confirm password
2. **Login Form** - Email, password, remember me
3. **Email Verification** - Token-based verification flow
4. **Password Reset** - Forgot password + reset flow
5. **Protected Route Middleware**
6. **User Profile Page** with email/password change

## Output Format
A) Plan (10 bullets max)
B) Database schema/migration
C) Complete code for each file
D) Email templates (verification, reset)
E) Security configuration
F) Testing checklist

Provide complete, copy-paste ready code.`,
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // API DEVELOPMENT
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'api-rest-crud',
    name: 'REST API with CRUD',
    category: 'api',
    description: 'Full CRUD API with validation and error handling',
    icon: '🔌',
    keywords: ['api', 'rest', 'crud', 'endpoint', 'route', 'backend', 'resource'],
    popularity: 90,
    contextQuestions: [
      {
        id: 'resource',
        label: 'Resource Name',
        placeholder: 'e.g., users, products, posts, orders',
        type: 'text',
        required: true,
      },
      {
        id: 'operations',
        label: 'Operations',
        placeholder: 'Select CRUD operations',
        type: 'multiselect',
        options: [
          { label: 'Create (POST)', value: 'create', default: true },
          { label: 'Read One (GET /:id)', value: 'read-one', default: true },
          { label: 'Read All (GET /)', value: 'read-all', default: true },
          { label: 'Update (PATCH)', value: 'update', default: true },
          { label: 'Delete (DELETE)', value: 'delete', default: true },
          { label: 'Search & Filter', value: 'search' },
          { label: 'Pagination', value: 'pagination', default: true },
          { label: 'Sorting', value: 'sorting' },
          { label: 'Bulk Operations', value: 'bulk' },
        ],
        required: true,
      },
      {
        id: 'features',
        label: 'API Features',
        placeholder: 'Select additional features',
        type: 'multiselect',
        options: [
          { label: 'Authentication required', value: 'auth' },
          { label: 'Rate limiting', value: 'rate-limit' },
          { label: 'Request logging', value: 'logging' },
          { label: 'OpenAPI/Swagger docs', value: 'openapi' },
          { label: 'Response caching', value: 'caching' },
          { label: 'Soft deletes', value: 'soft-delete' },
          { label: 'Audit logging', value: 'audit' },
        ],
        required: false,
      },
    ],
    outputSections: ['Plan', 'Schema', 'Routes', 'Validation', 'Code', 'Tests', 'Docs'],
    template: `You are a senior backend engineer. IMPLEMENT a production-ready REST API for **{{resource}}**.

## Context
- **Backend**: {{backend}}
- **Database**: {{database}}
- **Validation**: Zod
- **TypeScript**: {{typescript}}

## API Endpoints
\`\`\`
POST   /api/{{resource}}           # Create
GET    /api/{{resource}}           # List (paginated)
GET    /api/{{resource}}/:id       # Get by ID
PATCH  /api/{{resource}}/:id       # Update
DELETE /api/{{resource}}/:id       # Delete
{{#if search}}
GET    /api/{{resource}}/search    # Search/filter
{{/if}}
{{#if bulk}}
POST   /api/{{resource}}/bulk      # Bulk create
DELETE /api/{{resource}}/bulk      # Bulk delete
{{/if}}
\`\`\`

## Operations to Implement
{{operationsList}}

## Features
{{featuresList}}

## Requirements
1. **Zod schemas** for request/response validation
2. **Proper HTTP status codes** (200, 201, 400, 401, 403, 404, 409, 500)
3. **Consistent error format**:
   \`\`\`json
   { "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [...] } }
   \`\`\`
4. **Type-safe** throughout with TypeScript
5. **Database transactions** for multi-record operations
6. **Input sanitization** for security

## Output Format
A) Plan (10 bullets)
B) Database schema
C) Zod validation schemas
D) Route handlers (complete code)
E) Error handling middleware
F) API documentation (endpoint examples)
G) Test examples (cURL commands)

Provide complete, production-ready code.`,
  },

  {
    id: 'api-graphql',
    name: 'GraphQL API',
    category: 'api',
    description: 'Type-safe GraphQL with queries, mutations, subscriptions',
    icon: '◈',
    keywords: ['graphql', 'api', 'query', 'mutation', 'subscription', 'apollo', 'schema', 'resolver'],
    popularity: 75,
    contextQuestions: [
      {
        id: 'resource',
        label: 'Primary Type',
        placeholder: 'e.g., User, Product, Post',
        type: 'text',
        required: true,
      },
      {
        id: 'library',
        label: 'GraphQL Library',
        placeholder: 'Select GraphQL implementation',
        type: 'select',
        options: [
          { label: 'Pothos (code-first)', value: 'pothos', default: true },
          { label: 'Apollo Server', value: 'apollo' },
          { label: 'GraphQL Yoga', value: 'yoga' },
          { label: 'TypeGraphQL', value: 'typegraphql' },
        ],
        required: true,
      },
      {
        id: 'features',
        label: 'Features',
        placeholder: 'Select GraphQL features',
        type: 'multiselect',
        options: [
          { label: 'Queries', value: 'queries', default: true },
          { label: 'Mutations', value: 'mutations', default: true },
          { label: 'Subscriptions', value: 'subscriptions' },
          { label: 'DataLoader (N+1)', value: 'dataloader', default: true },
          { label: 'Authentication', value: 'auth' },
          { label: 'File uploads', value: 'uploads' },
          { label: 'Pagination (Relay)', value: 'relay-pagination' },
        ],
        required: true,
      },
    ],
    outputSections: ['Plan', 'Schema', 'Types', 'Resolvers', 'DataLoaders', 'Code', 'Queries'],
    template: `You are a senior backend engineer. IMPLEMENT a production-ready GraphQL API for **{{resource}}**.

## Context
- **Backend**: {{backend}}
- **Database**: {{database}}
- **GraphQL**: {{library}}
- **TypeScript**: {{typescript}}

## Features
{{featuresList}}

## Requirements
1. **Type-safe** schema with {{library}}
2. **N+1 prevention** with DataLoader
3. **Proper error handling** with GraphQL error extensions
4. **Input validation** on all mutations
5. **Authentication context** in resolvers

## Output Format
A) Plan
B) GraphQL schema
C) Type definitions
D) Resolver implementations
E) DataLoader setup
F) Example queries/mutations

Provide complete code with Prisma integration.`,
  },

  {
    id: 'api-trpc',
    name: 'tRPC API',
    category: 'api',
    description: 'End-to-end typesafe APIs with tRPC',
    icon: '🔷',
    keywords: ['trpc', 'api', 'typesafe', 'rpc', 'procedure', 'router'],
    popularity: 80,
    isNew: true,
    contextQuestions: [
      {
        id: 'resource',
        label: 'Router Name',
        placeholder: 'e.g., user, post, product',
        type: 'text',
        required: true,
      },
      {
        id: 'procedures',
        label: 'Procedures',
        placeholder: 'Select procedure types',
        type: 'multiselect',
        options: [
          { label: 'Query (read)', value: 'query', default: true },
          { label: 'Mutation (write)', value: 'mutation', default: true },
          { label: 'Subscription (realtime)', value: 'subscription' },
          { label: 'Infinite query', value: 'infinite' },
        ],
        required: true,
      },
    ],
    outputSections: ['Plan', 'Router', 'Procedures', 'Client', 'Hooks', 'Code'],
    template: `You are a senior full-stack engineer. IMPLEMENT a tRPC router for **{{resource}}**.

## Context
- **Framework**: {{frontend}}
- **Database**: {{database}}
- **TypeScript**: yes (required for tRPC)

## Procedures
{{proceduresList}}

## Requirements
1. **Zod validation** for all inputs
2. **Protected procedures** with auth middleware
3. **Error handling** with TRPCError
4. **React Query integration** on client

## Output Format
A) Router definition
B) Procedure implementations
C) Client setup
D) React hooks usage examples
E) Error handling patterns

Provide complete, type-safe code.`,
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // FRONTEND
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'frontend-component',
    name: 'React Component',
    category: 'frontend',
    description: 'Production-ready React component with variants',
    icon: '⚛️',
    keywords: ['react', 'component', 'ui', 'frontend', 'tsx', 'jsx'],
    popularity: 95,
    contextQuestions: [
      {
        id: 'componentName',
        label: 'Component Name',
        placeholder: 'e.g., DataTable, Modal, Sidebar, Card',
        type: 'text',
        required: true,
      },
      {
        id: 'componentType',
        label: 'Component Type',
        placeholder: 'Select component type',
        type: 'select',
        options: [
          { label: 'UI Component', value: 'ui', default: true },
          { label: 'Layout', value: 'layout' },
          { label: 'Form', value: 'form' },
          { label: 'Data Display', value: 'data' },
          { label: 'Navigation', value: 'navigation' },
          { label: 'Feedback', value: 'feedback' },
          { label: 'Overlay (Modal/Dialog)', value: 'overlay' },
        ],
        required: true,
      },
      {
        id: 'features',
        label: 'Component Features',
        placeholder: 'Select features',
        type: 'multiselect',
        options: [
          { label: 'TypeScript props', value: 'typescript', default: true },
          { label: 'Accessibility (ARIA)', value: 'a11y', default: true },
          { label: 'Keyboard navigation', value: 'keyboard' },
          { label: 'Dark mode', value: 'dark-mode', default: true },
          { label: 'Responsive', value: 'responsive', default: true },
          { label: 'Animations', value: 'animation' },
          { label: 'Loading state', value: 'loading' },
          { label: 'Error state', value: 'error' },
          { label: 'Empty state', value: 'empty' },
          { label: 'Variants (CVA)', value: 'variants' },
          { label: 'Compound component', value: 'compound' },
          { label: 'Storybook', value: 'storybook' },
          { label: 'Unit tests', value: 'tests' },
        ],
        required: false,
      },
    ],
    outputSections: ['Plan', 'API Design', 'Code', 'Variants', 'Usage', 'Tests'],
    template: `You are a senior frontend engineer. IMPLEMENT a production-ready React component: **{{componentName}}**.

## Context
- **Framework**: {{frontend}}
- **Styling**: {{styling}}
- **TypeScript**: {{typescript}}
- **Type**: {{componentType}}

## Features
{{featuresList}}

## Requirements
1. **TypeScript** with comprehensive props interface
2. **Accessible** with proper ARIA attributes
3. **Composable** using forwardRef and proper patterns
4. **CVA** for variant management (if variants selected)
5. **shadcn/ui patterns** - matches existing component library style

## Component API Design
- Use \`forwardRef\` for DOM access
- Support \`className\` for customization
- Use \`data-*\` attributes for styling states
- Controlled/uncontrolled patterns where applicable

## Output Format
A) Props interface with JSDoc
B) Component implementation
C) Variant definitions (if applicable)
D) Usage examples (3-5 scenarios)
E) Accessibility notes
F) Tests (if requested)

Provide complete, copy-paste ready code.`,
  },

  {
    id: 'frontend-form',
    name: 'Form with Validation',
    category: 'frontend',
    description: 'React Hook Form + Zod with all edge cases',
    icon: '📝',
    keywords: ['form', 'validation', 'input', 'submit', 'react-hook-form', 'zod'],
    popularity: 90,
    contextQuestions: [
      {
        id: 'formName',
        label: 'Form Purpose',
        placeholder: 'e.g., User Registration, Contact, Checkout',
        type: 'text',
        required: true,
      },
      {
        id: 'fields',
        label: 'Form Fields',
        placeholder: 'e.g., name, email, password, phone',
        type: 'text',
        required: true,
      },
      {
        id: 'features',
        label: 'Form Features',
        placeholder: 'Select features',
        type: 'multiselect',
        options: [
          { label: 'Real-time validation', value: 'realtime', default: true },
          { label: 'Server validation', value: 'server-validation' },
          { label: 'Multi-step wizard', value: 'multi-step' },
          { label: 'File upload', value: 'file-upload' },
          { label: 'Autosave draft', value: 'autosave' },
          { label: 'Conditional fields', value: 'conditional' },
          { label: 'Array fields', value: 'array-fields' },
          { label: 'Form persistence', value: 'persistence' },
        ],
        required: false,
      },
    ],
    outputSections: ['Plan', 'Schema', 'Component', 'Validation', 'Submit', 'Usage'],
    template: `You are a senior frontend engineer. IMPLEMENT a production-ready form: **{{formName}}**.

## Context
- **Framework**: {{frontend}}
- **Form Library**: React Hook Form + Zod
- **Styling**: {{styling}}
- **Fields**: {{fields}}

## Features
{{featuresList}}

## Requirements
1. **Zod schema** matching form values exactly
2. **Accessible** with proper labels and error announcements
3. **UX best practices**: inline validation, clear errors, focus management
4. **Submit handling** with loading states and error display

## Output Format
A) Zod validation schema
B) Form component code
C) Submit handler
D) Usage example
E) Validation rules reference

Provide complete code with all edge cases handled.`,
  },

  {
    id: 'frontend-data-table',
    name: 'Data Table',
    category: 'frontend',
    description: 'TanStack Table with sorting, filtering, pagination',
    icon: '📊',
    keywords: ['table', 'data', 'grid', 'tanstack', 'sorting', 'filtering', 'pagination'],
    popularity: 85,
    isNew: true,
    contextQuestions: [
      {
        id: 'dataType',
        label: 'Data Type',
        placeholder: 'e.g., users, products, orders',
        type: 'text',
        required: true,
      },
      {
        id: 'features',
        label: 'Table Features',
        placeholder: 'Select features',
        type: 'multiselect',
        options: [
          { label: 'Sorting', value: 'sorting', default: true },
          { label: 'Filtering', value: 'filtering', default: true },
          { label: 'Pagination', value: 'pagination', default: true },
          { label: 'Row selection', value: 'selection' },
          { label: 'Column visibility', value: 'column-visibility' },
          { label: 'Column resizing', value: 'resize' },
          { label: 'Row expansion', value: 'expansion' },
          { label: 'Inline editing', value: 'editing' },
          { label: 'Export (CSV)', value: 'export' },
          { label: 'Server-side', value: 'server-side' },
        ],
        required: true,
      },
    ],
    outputSections: ['Plan', 'Types', 'Columns', 'Table', 'Toolbar', 'Code'],
    template: `You are a senior frontend engineer. IMPLEMENT a production-ready data table for **{{dataType}}**.

## Context
- **Framework**: {{frontend}}
- **Table Library**: TanStack Table v8
- **Styling**: {{styling}}

## Features
{{featuresList}}

## Requirements
1. **Type-safe** column definitions
2. **Performance optimized** for large datasets
3. **Accessible** with keyboard navigation
4. **Server-side ready** (if selected)

## Output Format
A) Type definitions
B) Column definitions
C) Table component
D) Toolbar (filters, search)
E) Pagination component
F) Usage example

Provide complete, copy-paste ready code.`,
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // DATABASE
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'database-schema',
    name: 'Database Schema Design',
    category: 'database',
    description: 'Complete schema with relationships and indexes',
    icon: '🗄️',
    keywords: ['database', 'schema', 'model', 'table', 'migration', 'prisma', 'drizzle', 'sql'],
    popularity: 85,
    contextQuestions: [
      {
        id: 'domain',
        label: 'Domain/Feature',
        placeholder: 'e.g., e-commerce, blog, SaaS, social',
        type: 'text',
        required: true,
      },
      {
        id: 'entities',
        label: 'Main Entities',
        placeholder: 'e.g., users, products, orders, reviews',
        type: 'text',
        required: true,
      },
      {
        id: 'orm',
        label: 'ORM',
        placeholder: 'Select ORM',
        type: 'select',
        options: [
          { label: 'Prisma', value: 'prisma', default: true },
          { label: 'Drizzle ORM', value: 'drizzle' },
          { label: 'TypeORM', value: 'typeorm' },
          { label: 'Raw SQL', value: 'raw' },
        ],
        required: true,
      },
      {
        id: 'features',
        label: 'Features',
        placeholder: 'Select schema features',
        type: 'multiselect',
        options: [
          { label: 'Soft deletes', value: 'soft-delete' },
          { label: 'Timestamps', value: 'timestamps', default: true },
          { label: 'Full-text search', value: 'full-text' },
          { label: 'Audit logging', value: 'audit-log' },
          { label: 'Multi-tenancy', value: 'multi-tenant' },
          { label: 'Versioning', value: 'versioning' },
        ],
        required: false,
      },
    ],
    outputSections: ['Plan', 'ERD', 'Schema', 'Migrations', 'Seeds', 'Queries', 'Indexes'],
    template: `You are a senior database architect. DESIGN and IMPLEMENT a schema for **{{domain}}**.

## Context
- **Database**: {{database}}
- **ORM**: {{orm}}
- **Entities**: {{entities}}

## Features
{{featuresList}}

## Requirements
1. **Normalized** (3NF minimum)
2. **Proper relationships** with foreign keys
3. **Strategic indexes** for common queries
4. **Appropriate types** (not varchar(255) everywhere)

## Output Format
A) Plan with design decisions
B) ERD diagram (Mermaid)
C) Complete schema file
D) Migration files
E) Seed data
F) Example queries
G) Index strategy

Provide complete {{orm}} schema.`,
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // TESTING
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'testing-unit',
    name: 'Unit Tests',
    category: 'testing',
    description: 'Comprehensive unit tests with edge cases',
    icon: '🧪',
    keywords: ['test', 'unit', 'jest', 'vitest', 'testing', 'spec', 'coverage'],
    popularity: 80,
    contextQuestions: [
      {
        id: 'target',
        label: 'Code to Test',
        placeholder: 'Describe the function/component',
        type: 'text',
        required: true,
      },
      {
        id: 'framework',
        label: 'Test Framework',
        placeholder: 'Select framework',
        type: 'select',
        options: [
          { label: 'Vitest', value: 'vitest', default: true },
          { label: 'Jest', value: 'jest' },
          { label: 'Node Test Runner', value: 'node' },
        ],
        required: true,
      },
      {
        id: 'coverage',
        label: 'Coverage Goals',
        placeholder: 'Select coverage areas',
        type: 'multiselect',
        options: [
          { label: 'Happy path', value: 'happy-path', default: true },
          { label: 'Edge cases', value: 'edge-cases', default: true },
          { label: 'Error cases', value: 'error-cases', default: true },
          { label: 'Async behavior', value: 'async' },
          { label: 'Mocking', value: 'mocking' },
          { label: 'Snapshots', value: 'snapshots' },
        ],
        required: true,
      },
    ],
    outputSections: ['Test Plan', 'Tests', 'Mocks', 'Utilities', 'Coverage'],
    template: `You are a senior QA engineer. WRITE comprehensive unit tests for: **{{target}}**.

## Context
- **Framework**: {{framework}}
- **Coverage**: {{coverage}}

## Test Categories
1. **Happy Path** - Normal expected flows
2. **Edge Cases** - Empty, null, max values
3. **Error Cases** - Invalid inputs, failures
4. **Async** - Promises, timeouts

## Requirements
1. **AAA pattern**: Arrange, Act, Assert
2. **Isolated tests** - Each test independent
3. **Descriptive names** - "should X when Y"
4. **80%+ coverage** target

## Output Format
A) Test plan (list of cases)
B) Complete test files
C) Mock implementations
D) Test utilities

Provide complete, runnable tests.`,
  },

  {
    id: 'testing-e2e',
    name: 'E2E Tests (Playwright)',
    category: 'testing',
    description: 'End-to-end tests with Playwright',
    icon: '🎭',
    keywords: ['e2e', 'playwright', 'testing', 'browser', 'automation', 'integration'],
    popularity: 75,
    contextQuestions: [
      {
        id: 'feature',
        label: 'Feature to Test',
        placeholder: 'e.g., Login flow, Checkout, User profile',
        type: 'text',
        required: true,
      },
      {
        id: 'scenarios',
        label: 'Scenarios',
        placeholder: 'Select scenarios',
        type: 'multiselect',
        options: [
          { label: 'Happy path', value: 'happy-path', default: true },
          { label: 'Error handling', value: 'errors', default: true },
          { label: 'Form validation', value: 'validation' },
          { label: 'Authentication', value: 'auth' },
          { label: 'Mobile viewport', value: 'mobile' },
          { label: 'Accessibility', value: 'a11y' },
          { label: 'Visual regression', value: 'visual' },
        ],
        required: true,
      },
    ],
    outputSections: ['Plan', 'Page Objects', 'Tests', 'Fixtures', 'Config', 'CI'],
    template: `You are a senior QA engineer. WRITE E2E tests for: **{{feature}}**.

## Context
- **Framework**: Playwright
- **URL**: http://localhost:3000

## Scenarios
{{scenariosList}}

## Requirements
1. **Page Object Model** for maintainability
2. **Proper selectors** (data-testid preferred)
3. **No arbitrary waits** - use proper assertions
4. **Test isolation** - independent tests

## Output Format
A) Test plan
B) Page objects
C) Test specs
D) Fixtures
E) playwright.config.ts
F) CI workflow

Provide complete, runnable tests.`,
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // DEPLOYMENT & DEVOPS
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'deployment-docker',
    name: 'Docker Setup',
    category: 'deployment',
    description: 'Optimized Docker for dev and production',
    icon: '🐳',
    keywords: ['docker', 'container', 'dockerfile', 'compose', 'deployment'],
    popularity: 80,
    contextQuestions: [
      {
        id: 'appType',
        label: 'Application Type',
        placeholder: 'Select app type',
        type: 'select',
        options: [
          { label: 'Next.js', value: 'nextjs', default: true },
          { label: 'Node.js', value: 'node' },
          { label: 'Python', value: 'python' },
          { label: 'Go', value: 'go' },
          { label: 'Monorepo', value: 'monorepo' },
        ],
        required: true,
      },
      {
        id: 'services',
        label: 'Services',
        placeholder: 'Select additional services',
        type: 'multiselect',
        options: [
          { label: 'PostgreSQL', value: 'postgres' },
          { label: 'Redis', value: 'redis' },
          { label: 'MongoDB', value: 'mongodb' },
          { label: 'Elasticsearch', value: 'elasticsearch' },
          { label: 'RabbitMQ', value: 'rabbitmq' },
          { label: 'MinIO (S3)', value: 'minio' },
        ],
        required: false,
      },
      {
        id: 'features',
        label: 'Features',
        placeholder: 'Select Docker features',
        type: 'multiselect',
        options: [
          { label: 'Multi-stage build', value: 'multi-stage', default: true },
          { label: 'Health checks', value: 'healthcheck', default: true },
          { label: 'Hot reload (dev)', value: 'hot-reload' },
          { label: 'Production optimized', value: 'production', default: true },
        ],
        required: false,
      },
    ],
    outputSections: ['Plan', 'Dockerfile', 'Compose Dev', 'Compose Prod', 'Scripts', 'Commands'],
    template: `You are a senior DevOps engineer. CREATE Docker configuration for **{{appType}}**.

## Services
{{servicesList}}

## Features
{{featuresList}}

## Requirements
1. **Multi-stage build** for minimal production image
2. **Non-root user** in production
3. **.dockerignore** to exclude unnecessary files
4. **Health checks** for all services

## Output Format
A) Plan
B) Dockerfile (optimized)
C) docker-compose.yml (dev)
D) docker-compose.prod.yml
E) .dockerignore
F) Common commands

Provide complete, production-ready configs.`,
  },

  {
    id: 'deployment-cicd',
    name: 'CI/CD Pipeline',
    category: 'deployment',
    description: 'GitHub Actions with testing and deployment',
    icon: '🔄',
    keywords: ['ci', 'cd', 'github actions', 'pipeline', 'deployment', 'automation'],
    popularity: 85,
    contextQuestions: [
      {
        id: 'deployTarget',
        label: 'Deploy Target',
        placeholder: 'Select deployment target',
        type: 'select',
        options: [
          { label: 'Vercel', value: 'vercel', default: true },
          { label: 'AWS', value: 'aws' },
          { label: 'Google Cloud', value: 'gcp' },
          { label: 'Railway', value: 'railway' },
          { label: 'Fly.io', value: 'fly' },
          { label: 'Docker Registry', value: 'docker' },
        ],
        required: true,
      },
      {
        id: 'stages',
        label: 'Pipeline Stages',
        placeholder: 'Select stages',
        type: 'multiselect',
        options: [
          { label: 'Lint', value: 'lint', default: true },
          { label: 'Type check', value: 'typecheck', default: true },
          { label: 'Unit tests', value: 'unit-tests', default: true },
          { label: 'E2E tests', value: 'e2e-tests' },
          { label: 'Build', value: 'build', default: true },
          { label: 'Security scan', value: 'security' },
          { label: 'Preview deploy', value: 'preview' },
          { label: 'Production deploy', value: 'production', default: true },
        ],
        required: true,
      },
    ],
    outputSections: ['Plan', 'Workflow', 'Secrets', 'Branch Strategy', 'Commands'],
    template: `You are a senior DevOps engineer. CREATE a CI/CD pipeline.

## Deploy Target
{{deployTarget}}

## Stages
{{stagesList}}

## Requirements
1. **Parallel jobs** where possible
2. **Caching** for dependencies
3. **Environment secrets** handling
4. **Branch protection** recommendations

## Output Format
A) Plan
B) Complete workflow file(s)
C) Required secrets list
D) Branch strategy
E) Troubleshooting guide

Provide complete GitHub Actions workflow.`,
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // DEBUGGING & PERFORMANCE
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'debug-error',
    name: 'Debug Error',
    category: 'debugging',
    description: 'Systematic error diagnosis and fix',
    icon: '🐛',
    keywords: ['debug', 'error', 'bug', 'fix', 'troubleshoot', 'crash', 'issue'],
    popularity: 90,
    contextQuestions: [
      {
        id: 'errorMessage',
        label: 'Error Message',
        placeholder: 'Paste the error message or stack trace',
        type: 'text',
        required: true,
      },
      {
        id: 'context',
        label: 'When it occurs',
        placeholder: 'Describe when the error happens',
        type: 'text',
        required: true,
      },
      {
        id: 'attempted',
        label: 'Already tried',
        placeholder: 'What have you already tried?',
        type: 'text',
        required: false,
      },
    ],
    outputSections: ['Analysis', 'Root Cause', 'Solution', 'Prevention', 'Testing'],
    template: `You are a senior debugging specialist. DIAGNOSE and FIX this error:

## Error
\`\`\`
{{errorMessage}}
\`\`\`

## Context
- **When**: {{context}}
- **Stack**: {{frontend}} + {{backend}} + {{database}}
{{#if attempted}}
- **Already tried**: {{attempted}}
{{/if}}

## Your Task
1. **Analyze** the error message and trace
2. **Identify** the root cause
3. **Provide** the exact fix (code, not explanation)
4. **Explain** why this happened
5. **Prevent** similar issues

## Output Format
A) Error Analysis
B) Root Cause
C) Solution (exact code fix)
D) Prevention strategy
E) Test to verify fix

Provide the exact fix, not just suggestions.`,
  },

  {
    id: 'performance-optimize',
    name: 'Performance Optimization',
    category: 'performance',
    description: 'Identify and fix performance issues',
    icon: '⚡',
    keywords: ['performance', 'optimize', 'slow', 'speed', 'fast', 'memory', 'cpu'],
    popularity: 70,
    contextQuestions: [
      {
        id: 'issue',
        label: 'Performance Issue',
        placeholder: 'Describe the performance problem',
        type: 'text',
        required: true,
      },
      {
        id: 'area',
        label: 'Area',
        placeholder: 'Select affected area',
        type: 'select',
        options: [
          { label: 'Page load time', value: 'page-load', default: true },
          { label: 'API response time', value: 'api' },
          { label: 'Database queries', value: 'database' },
          { label: 'Memory usage', value: 'memory' },
          { label: 'Bundle size', value: 'bundle' },
          { label: 'React rendering', value: 'react' },
        ],
        required: true,
      },
    ],
    outputSections: ['Analysis', 'Bottlenecks', 'Optimizations', 'Code', 'Metrics'],
    template: `You are a senior performance engineer. OPTIMIZE: **{{issue}}**.

## Context
- **Area**: {{area}}
- **Framework**: {{frontend}}
- **Backend**: {{backend}}

## Requirements
1. **Profile first** - identify actual bottlenecks
2. **Measure impact** - quantify improvements
3. **Implement** the optimization (full code)
4. **Verify** performance improvement

## Output Format
A) Performance analysis
B) Identified bottlenecks
C) Optimization strategy
D) Code changes
E) Expected improvement metrics

Provide specific, implementable optimizations.`,
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // REFACTORING
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'refactor-code',
    name: 'Refactor Code',
    category: 'refactoring',
    description: 'Improve code quality and maintainability',
    icon: '♻️',
    keywords: ['refactor', 'clean', 'improve', 'restructure', 'optimize', 'dry'],
    popularity: 75,
    contextQuestions: [
      {
        id: 'goals',
        label: 'Refactoring Goals',
        placeholder: 'Select goals',
        type: 'multiselect',
        options: [
          { label: 'Improve readability', value: 'readability', default: true },
          { label: 'Reduce duplication', value: 'dry' },
          { label: 'Separation of concerns', value: 'soc' },
          { label: 'Add TypeScript types', value: 'types' },
          { label: 'Performance', value: 'performance' },
          { label: 'Testability', value: 'testability' },
          { label: 'Security', value: 'security' },
        ],
        required: true,
      },
    ],
    outputSections: ['Analysis', 'Plan', 'Before/After', 'Code', 'Tests'],
    template: `You are a senior software architect. REFACTOR the code with these goals:

## Goals
{{goalsList}}

## Requirements
1. **Preserve functionality** - don't change behavior
2. **Small changes** - each change testable
3. **Show before/after** for major changes
4. **Complete code** - not just snippets

## Output Format
A) Code analysis (current issues)
B) Refactoring plan
C) Before/After comparisons
D) Complete refactored code
E) Tests to verify behavior

Provide complete refactored code.`,
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // GENERAL
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'general-feature',
    name: 'Implement Feature',
    category: 'general',
    description: 'Build any feature with best practices',
    icon: '✨',
    keywords: ['feature', 'implement', 'build', 'create', 'add', 'make'],
    popularity: 100,
    contextQuestions: [
      {
        id: 'feature',
        label: 'Feature Description',
        placeholder: 'Describe what you want to build',
        type: 'text',
        required: true,
      },
      {
        id: 'acceptance',
        label: 'Acceptance Criteria',
        placeholder: 'What defines "done"?',
        type: 'text',
        required: false,
      },
    ],
    outputSections: ['Plan', 'Files', 'Code', 'Tests', 'Documentation'],
    template: `You are a senior full-stack engineer. IMPLEMENT: **{{feature}}**.

## Context
- **Frontend**: {{frontend}}
- **Backend**: {{backend}}
- **Database**: {{database}}
- **TypeScript**: {{typescript}}

{{#if acceptance}}
## Acceptance Criteria
{{acceptance}}
{{/if}}

## Requirements
1. **Production-ready** code
2. **Type-safe** with TypeScript
3. **Error handling** for all edge cases
4. **File-by-file** implementation

## Output Format
A) Plan (10 bullets max)
B) Files to create
C) Complete code for each file
D) Tests
E) Usage example

Provide complete, copy-paste ready code.`,
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // AI/ML
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'ai-integration',
    name: 'AI Integration',
    category: 'ai-ml',
    description: 'Integrate OpenAI, Anthropic, or other AI APIs',
    icon: '🤖',
    keywords: ['ai', 'openai', 'gpt', 'claude', 'anthropic', 'llm', 'chatbot', 'embedding'],
    popularity: 85,
    isNew: true,
    contextQuestions: [
      {
        id: 'provider',
        label: 'AI Provider',
        placeholder: 'Select provider',
        type: 'select',
        options: [
          { label: 'OpenAI (GPT-4)', value: 'openai', default: true },
          { label: 'Anthropic (Claude)', value: 'anthropic' },
          { label: 'Vercel AI SDK', value: 'vercel-ai' },
          { label: 'Replicate', value: 'replicate' },
          { label: 'Hugging Face', value: 'huggingface' },
        ],
        required: true,
      },
      {
        id: 'useCase',
        label: 'Use Case',
        placeholder: 'Select use case',
        type: 'select',
        options: [
          { label: 'Chat interface', value: 'chat', default: true },
          { label: 'Text generation', value: 'generation' },
          { label: 'Embeddings/RAG', value: 'embeddings' },
          { label: 'Image generation', value: 'images' },
          { label: 'Code generation', value: 'code' },
        ],
        required: true,
      },
      {
        id: 'features',
        label: 'Features',
        placeholder: 'Select features',
        type: 'multiselect',
        options: [
          { label: 'Streaming responses', value: 'streaming', default: true },
          { label: 'Conversation history', value: 'history' },
          { label: 'Rate limiting', value: 'rate-limit' },
          { label: 'Token counting', value: 'tokens' },
          { label: 'Error handling', value: 'errors', default: true },
          { label: 'Caching', value: 'caching' },
        ],
        required: false,
      },
    ],
    outputSections: ['Plan', 'API Setup', 'Client', 'UI', 'Code', 'Error Handling'],
    template: `You are a senior AI engineer. IMPLEMENT **{{useCase}}** with **{{provider}}**.

## Context
- **Framework**: {{frontend}}
- **Provider**: {{provider}}

## Features
{{featuresList}}

## Requirements
1. **Type-safe** API integration
2. **Streaming** support (if chat)
3. **Error handling** with retries
4. **Rate limiting** to stay within quotas
5. **Secure** API key handling

## Output Format
A) Plan
B) API client setup
C) React hooks/components
D) UI implementation
E) Error handling
F) Usage examples

Provide complete, production-ready code.`,
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// Prompt Quality Analyzer
// ═══════════════════════════════════════════════════════════════════════════════

function analyzePromptQuality(prompt: string, template: PromptTemplate): PromptQuality {
  const suggestions: string[] = [];

  // Completeness (are all sections present?)
  let completeness = 0;
  const expectedSections = template.outputSections.length;
  const foundSections = template.outputSections.filter(s =>
    prompt.toLowerCase().includes(s.toLowerCase())
  ).length;
  completeness = Math.round((foundSections / expectedSections) * 100);

  // Specificity (does it have concrete details?)
  let specificity = 50;
  if (prompt.includes('```')) specificity += 15;
  if (prompt.includes('.env')) specificity += 10;
  if (prompt.match(/\d+/)) specificity += 10;
  if (prompt.includes('TypeScript')) specificity += 10;
  specificity = Math.min(specificity, 100);

  // Clarity (length and structure)
  let clarity = 70;
  const wordCount = prompt.split(/\s+/).length;
  if (wordCount > 500) clarity += 10;
  if (wordCount > 1000) clarity += 10;
  if (prompt.includes('## ')) clarity += 10;
  clarity = Math.min(clarity, 100);

  // Overall score
  const score = Math.round((completeness + specificity + clarity) / 3);

  // Generate suggestions
  if (completeness < 80) {
    suggestions.push('Add more output sections for comprehensive results');
  }
  if (specificity < 70) {
    suggestions.push('Include more specific requirements (versions, exact paths)');
  }
  if (clarity < 80) {
    suggestions.push('Consider adding code examples or format specifications');
  }
  if (!prompt.includes('TypeScript')) {
    suggestions.push('Specify TypeScript requirement for type safety');
  }

  return { score, completeness, specificity, clarity, suggestions };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Service Implementation
// ═══════════════════════════════════════════════════════════════════════════════

export class PromptBuilderService {
  private context: vscode.ExtensionContext;
  private history: BuiltPrompt[] = [];
  private favorites: Set<string> = new Set();

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.loadHistory();
    this.loadFavorites();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────────

  getTemplates(): PromptTemplate[] {
    return PROMPT_TEMPLATES.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
  }

  getTemplatesByCategory(category: PromptCategory): PromptTemplate[] {
    return PROMPT_TEMPLATES.filter(t => t.category === category);
  }

  getCategories(): { category: PromptCategory; count: number; icon: string }[] {
    const categoryMeta: Record<PromptCategory, { icon: string; order: number }> = {
      authentication: { icon: '🔐', order: 1 },
      api: { icon: '🔌', order: 2 },
      frontend: { icon: '⚛️', order: 3 },
      database: { icon: '🗄️', order: 4 },
      testing: { icon: '🧪', order: 5 },
      deployment: { icon: '🚀', order: 6 },
      debugging: { icon: '🐛', order: 7 },
      performance: { icon: '⚡', order: 8 },
      refactoring: { icon: '♻️', order: 9 },
      security: { icon: '🛡️', order: 10 },
      'ai-ml': { icon: '🤖', order: 11 },
      mobile: { icon: '📱', order: 12 },
      backend: { icon: '⚙️', order: 13 },
      documentation: { icon: '📚', order: 14 },
      general: { icon: '✨', order: 15 },
    };

    const counts = new Map<PromptCategory, number>();
    for (const template of PROMPT_TEMPLATES) {
      counts.set(template.category, (counts.get(template.category) || 0) + 1);
    }

    return Array.from(counts.entries())
      .map(([category, count]) => ({
        category,
        count,
        icon: categoryMeta[category]?.icon || '📁',
        order: categoryMeta[category]?.order || 99,
      }))
      .sort((a, b) => a.order - b.order);
  }

  detectTemplate(input: string): PromptTemplate | null {
    const normalizedInput = input.toLowerCase();
    let bestMatch: PromptTemplate | null = null;
    let bestScore = 0;

    for (const template of PROMPT_TEMPLATES) {
      let score = 0;

      for (const keyword of template.keywords) {
        if (normalizedInput.includes(keyword)) {
          score += keyword.length * 2;
          // Bonus for word boundary match
          if (new RegExp(`\\b${keyword}\\b`).test(normalizedInput)) {
            score += 5;
          }
        }
      }

      // Boost popular templates slightly
      score += (template.popularity || 0) / 20;

      if (score > bestScore) {
        bestScore = score;
        bestMatch = template;
      }
    }

    return bestScore > 8 ? bestMatch : null;
  }

  async detectWorkspaceContext(): Promise<WorkspaceContext> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const rootPath = workspaceFolder?.uri.fsPath || '';
    const activeEditor = vscode.window.activeTextEditor;

    const context: WorkspaceContext = {
      projectName: workspaceFolder?.name || 'project',
      hasTypeScript: false,
      hasNextJs: false,
      hasReact: false,
      hasVue: false,
      hasSvelte: false,
      hasAngular: false,
      hasVite: false,
      hasExpress: false,
      hasFastify: false,
      hasNestJs: false,
      hasPrisma: false,
      hasDrizzle: false,
      hasMongoDB: false,
      hasPostgres: false,
      hasSupabase: false,
      hasFirebase: false,
      hasClerk: false,
      hasNextAuth: false,
      hasAuthJs: false,
      hasTailwind: false,
      hasShadcn: false,
      hasRadix: false,
      packageManager: 'npm',
      framework: 'unknown',
      language: 'javascript',
      testFramework: null,
      hasDocker: false,
      hasGit: false,
      hasTurbo: false,
      isMonorepo: false,
      currentFile: activeEditor?.document.uri.fsPath,
      currentFileLanguage: activeEditor?.document.languageId,
      selectedText: activeEditor?.document.getText(activeEditor.selection),
    };

    if (!rootPath) return context;

    // Check package.json
    const packageJsonPath = path.join(rootPath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        const allDeps = { ...packageJson.dependencies, ...packageJson.devDependencies };

        // Framework detection
        context.hasTypeScript = !!allDeps.typescript;
        context.hasNextJs = !!allDeps.next;
        context.hasReact = !!allDeps.react;
        context.hasVue = !!allDeps.vue;
        context.hasSvelte = !!allDeps.svelte;
        context.hasAngular = !!allDeps['@angular/core'];
        context.hasVite = !!allDeps.vite;
        context.hasExpress = !!allDeps.express;
        context.hasFastify = !!allDeps.fastify;
        context.hasNestJs = !!allDeps['@nestjs/core'];

        // Database
        context.hasPrisma = !!allDeps['@prisma/client'] || !!allDeps.prisma;
        context.hasDrizzle = !!allDeps['drizzle-orm'];
        context.hasMongoDB = !!allDeps.mongoose || !!allDeps.mongodb;
        context.hasPostgres = !!allDeps.pg || !!allDeps['@vercel/postgres'];
        context.hasSupabase = !!allDeps['@supabase/supabase-js'];
        context.hasFirebase = !!allDeps.firebase || !!allDeps['firebase-admin'];

        // Auth
        context.hasClerk = !!allDeps['@clerk/nextjs'] || !!allDeps['@clerk/clerk-react'];
        context.hasNextAuth = !!allDeps['next-auth'];
        context.hasAuthJs = !!allDeps['@auth/core'];

        // UI
        context.hasTailwind = !!allDeps.tailwindcss;
        context.hasShadcn = fs.existsSync(path.join(rootPath, 'components.json'));
        context.hasRadix = Object.keys(allDeps).some(k => k.startsWith('@radix-ui'));

        // Tooling
        context.hasTurbo = !!allDeps.turbo;
        context.isMonorepo = fs.existsSync(path.join(rootPath, 'pnpm-workspace.yaml')) ||
          !!packageJson.workspaces;

        context.language = context.hasTypeScript ? 'typescript' : 'javascript';

        // Test framework
        if (allDeps.vitest) context.testFramework = 'vitest';
        else if (allDeps.jest) context.testFramework = 'jest';
        else if (allDeps['@playwright/test']) context.testFramework = 'playwright';

        // Determine primary framework
        if (context.hasNextJs) context.framework = 'Next.js';
        else if (context.hasVite && context.hasReact) context.framework = 'React + Vite';
        else if (context.hasNestJs) context.framework = 'NestJS';
        else if (context.hasFastify) context.framework = 'Fastify';
        else if (context.hasExpress) context.framework = 'Express';
        else if (context.hasVue) context.framework = 'Vue';
        else if (context.hasSvelte) context.framework = 'SvelteKit';
        else if (context.hasReact) context.framework = 'React';
      } catch {
        // Ignore parse errors
      }
    }

    // Package manager detection
    if (fs.existsSync(path.join(rootPath, 'bun.lockb'))) context.packageManager = 'bun';
    else if (fs.existsSync(path.join(rootPath, 'pnpm-lock.yaml'))) context.packageManager = 'pnpm';
    else if (fs.existsSync(path.join(rootPath, 'yarn.lock'))) context.packageManager = 'yarn';

    // Docker & Git
    context.hasDocker = fs.existsSync(path.join(rootPath, 'Dockerfile')) ||
      fs.existsSync(path.join(rootPath, 'docker-compose.yml'));
    context.hasGit = fs.existsSync(path.join(rootPath, '.git'));

    return context;
  }

  buildPrompt(
    template: PromptTemplate,
    userInput: string,
    answers: Record<string, string | string[]>,
    workspaceContext: WorkspaceContext
  ): BuiltPrompt {
    // Build context from workspace and answers
    const context: Record<string, string> = {
      appType: 'Web app',
      frontend: this.detectFrontend(workspaceContext),
      backend: this.detectBackend(workspaceContext),
      database: this.detectDatabase(workspaceContext),
      typescript: workspaceContext.hasTypeScript ? 'yes' : 'no',
      language: workspaceContext.language,
      styling: workspaceContext.hasTailwind ? 'Tailwind CSS' : 'CSS',
      baseUrl: 'http://localhost:3000',
    };

    // Add answers
    for (const [key, value] of Object.entries(answers)) {
      if (Array.isArray(value)) {
        context[key] = value.join(', ');
        context[`${key}List`] = value.map((v, i) => `${i + 1}. ${v}`).join('\n');
      } else {
        context[key] = value;
      }
    }

    // Process template
    let expandedPrompt = template.template;

    // Replace smart variables
    for (const [variable, resolver] of Object.entries(SMART_VARIABLES)) {
      expandedPrompt = expandedPrompt.replace(new RegExp(variable, 'g'), resolver(workspaceContext));
    }

    // Replace {{variable}}
    expandedPrompt = expandedPrompt.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      return context[key] || `[${key}]`;
    });

    // Handle {{#if variable}} ... {{/if}}
    expandedPrompt = expandedPrompt.replace(
      /\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
      (_, key, content) => context[key] ? content : ''
    );

    // Handle {{#each variableList}} ... {{/each}}
    expandedPrompt = expandedPrompt.replace(
      /\{\{#each (\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g,
      (_, key, content) => {
        const listKey = key.endsWith('List') ? key : `${key}List`;
        const items = context[listKey]?.split('\n').filter(Boolean) || [];
        return items.map((item, index) => {
          let itemContent = content;
          itemContent = itemContent.replace(/\{\{this\}\}/g, item);
          itemContent = itemContent.replace(/\{\{@index\}\}/g, String(index + 1));
          return itemContent;
        }).join('');
      }
    );

    // Clean up whitespace
    expandedPrompt = expandedPrompt.replace(/\n{3,}/g, '\n\n').trim();

    // Analyze quality
    const quality = analyzePromptQuality(expandedPrompt, template);

    const builtPrompt: BuiltPrompt = {
      id: this.generateId(),
      timestamp: new Date(),
      originalInput: userInput,
      category: template.category,
      template: template.id,
      expandedPrompt,
      context,
      quality,
      isFavorite: false,
    };

    this.addToHistory(builtPrompt);
    return builtPrompt;
  }

  getSmartSuggestions(input: string, context: WorkspaceContext): SmartSuggestion[] {
    const suggestions: SmartSuggestion[] = [];

    // Template suggestions based on current file
    if (context.currentFileLanguage === 'typescriptreact' || context.currentFileLanguage === 'javascriptreact') {
      suggestions.push({
        type: 'template',
        title: 'Create Component',
        description: 'Build a React component with props and tests',
        action: 'selectTemplate',
        data: 'frontend-component',
      });
    }

    if (context.currentFile?.includes('api') || context.currentFile?.includes('route')) {
      suggestions.push({
        type: 'template',
        title: 'Create API Endpoint',
        description: 'Build a REST or GraphQL endpoint',
        action: 'selectTemplate',
        data: 'api-rest-crud',
      });
    }

    // Enhancement suggestions
    if (input && input.length > 20) {
      if (!input.toLowerCase().includes('typescript')) {
        suggestions.push({
          type: 'enhancement',
          title: 'Add TypeScript',
          description: 'Specify TypeScript for better type safety',
          action: 'enhance',
          data: 'typescript',
        });
      }

      if (!input.toLowerCase().includes('test')) {
        suggestions.push({
          type: 'enhancement',
          title: 'Include Tests',
          description: 'Add unit or integration tests',
          action: 'enhance',
          data: 'tests',
        });
      }
    }

    return suggestions;
  }

  getHistory(): BuiltPrompt[] {
    return this.history;
  }

  getFavorites(): BuiltPrompt[] {
    return this.history.filter(p => this.favorites.has(p.id));
  }

  toggleFavorite(id: string): boolean {
    if (this.favorites.has(id)) {
      this.favorites.delete(id);
    } else {
      this.favorites.add(id);
    }
    this.saveFavorites();
    return this.favorites.has(id);
  }

  clearHistory(): void {
    this.history = [];
    this.saveHistory();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Private Methods
  // ─────────────────────────────────────────────────────────────────────────────

  private detectFrontend(ctx: WorkspaceContext): string {
    if (ctx.hasNextJs) return 'Next.js App Router';
    if (ctx.hasVite && ctx.hasReact) return 'React + Vite';
    if (ctx.hasVue) return 'Vue 3';
    if (ctx.hasSvelte) return 'SvelteKit';
    if (ctx.hasReact) return 'React';
    return 'Next.js App Router';
  }

  private detectBackend(ctx: WorkspaceContext): string {
    if (ctx.hasNextJs) return 'Next.js API Routes';
    if (ctx.hasNestJs) return 'NestJS';
    if (ctx.hasFastify) return 'Fastify';
    if (ctx.hasExpress) return 'Express';
    return 'Next.js API Routes';
  }

  private detectDatabase(ctx: WorkspaceContext): string {
    if (ctx.hasSupabase) return 'Supabase (PostgreSQL)';
    if (ctx.hasFirebase) return 'Firebase';
    if (ctx.hasPrisma && ctx.hasPostgres) return 'PostgreSQL + Prisma';
    if (ctx.hasDrizzle) return 'Drizzle ORM';
    if (ctx.hasPrisma) return 'Prisma';
    if (ctx.hasMongoDB) return 'MongoDB';
    if (ctx.hasPostgres) return 'PostgreSQL';
    return 'PostgreSQL + Prisma';
  }

  private generateId(): string {
    return `pb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private addToHistory(prompt: BuiltPrompt): void {
    this.history.unshift(prompt);
    if (this.history.length > 100) {
      this.history = this.history.slice(0, 100);
    }
    this.saveHistory();
  }

  private loadHistory(): void {
    try {
      const stored = this.context.globalState.get<BuiltPrompt[]>('promptBuilder.history');
      if (stored) {
        this.history = stored.map(p => ({
          ...p,
          timestamp: new Date(p.timestamp),
        }));
      }
    } catch {
      this.history = [];
    }
  }

  private saveHistory(): void {
    void this.context.globalState.update('promptBuilder.history', this.history);
  }

  private loadFavorites(): void {
    try {
      const stored = this.context.globalState.get<string[]>('promptBuilder.favorites');
      if (stored) {
        this.favorites = new Set(stored);
      }
    } catch {
      this.favorites = new Set();
    }
  }

  private saveFavorites(): void {
    void this.context.globalState.update('promptBuilder.favorites', Array.from(this.favorites));
  }
}
