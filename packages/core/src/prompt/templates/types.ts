/**
 * Prompt Template Types
 *
 * Shared type definitions for the unified Prompt Template Builder.
 */

// ============================================================================
// TEMPLATE TYPES
// ============================================================================

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

export interface PromptTemplate {
  /** Unique template identifier (stable across versions) */
  id: string;
  /** Human-readable name */
  name: string;
  /** Template category */
  category: PromptCategory;
  /** Short description */
  description: string;
  /** Emoji icon */
  icon: string;
  /** Keywords for matching/search */
  keywords: string[];
  /** Template body with variable placeholders */
  template: string;
  /** Questions to ask user for context */
  contextQuestions: ContextQuestion[];
  /** Expected output sections */
  outputSections: string[];
  /** Popularity score (for sorting) */
  popularity?: number;
  /** Mark as new */
  isNew?: boolean;
  /** Requires Pro tier */
  isPro?: boolean;
}

export interface ContextQuestion {
  /** Question identifier */
  id: string;
  /** Display label */
  label: string;
  /** Placeholder text */
  placeholder: string;
  /** Input type */
  type: 'select' | 'text' | 'multiselect' | 'boolean';
  /** Options for select/multiselect */
  options?: Array<{ label: string; value: string; default?: boolean }>;
  /** Whether answer is required */
  required: boolean;
  /** Conditional display based on another question */
  dependsOn?: string;
}

// ============================================================================
// WORKSPACE CONTEXT
// ============================================================================

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

// ============================================================================
// BUILT PROMPT
// ============================================================================

export interface BuiltPrompt {
  /** Unique instance ID */
  id: string;
  /** When the prompt was built */
  timestamp: Date;
  /** Original user input */
  originalInput: string;
  /** Template category */
  category: PromptCategory;
  /** Template ID used */
  templateId: string;
  /** Expanded prompt text */
  expandedPrompt: string;
  /** Context values used */
  context: Record<string, string>;
  /** Quality assessment */
  quality: PromptQuality;
  /** Favorite flag */
  isFavorite?: boolean;
}

export interface PromptQuality {
  /** Overall score 0-100 */
  score: number;
  /** Completeness 0-100 */
  completeness: number;
  /** Specificity 0-100 */
  specificity: number;
  /** Clarity 0-100 */
  clarity: number;
  /** Suggestions for improvement */
  suggestions: string[];
}

// ============================================================================
// SMART SUGGESTION
// ============================================================================

export interface SmartSuggestion {
  type: 'template' | 'enhancement' | 'context';
  title: string;
  description: string;
  action: string;
  data?: unknown;
}

// ============================================================================
// CATEGORY METADATA
// ============================================================================

export interface CategoryMetadata {
  id: PromptCategory;
  name: string;
  icon: string;
  description: string;
  templateCount: number;
}

export const CATEGORY_METADATA: Record<PromptCategory, Omit<CategoryMetadata, 'templateCount'>> = {
  authentication: {
    id: 'authentication',
    name: 'Authentication',
    icon: '🔐',
    description: 'Login, signup, OAuth, session management',
  },
  api: {
    id: 'api',
    name: 'API',
    icon: '🔌',
    description: 'REST, GraphQL, tRPC endpoints',
  },
  database: {
    id: 'database',
    name: 'Database',
    icon: '🗄️',
    description: 'Schema design, migrations, queries',
  },
  frontend: {
    id: 'frontend',
    name: 'Frontend',
    icon: '⚛️',
    description: 'Components, forms, state management',
  },
  backend: {
    id: 'backend',
    name: 'Backend',
    icon: '⚙️',
    description: 'Server logic, middleware, services',
  },
  testing: {
    id: 'testing',
    name: 'Testing',
    icon: '🧪',
    description: 'Unit, integration, E2E tests',
  },
  deployment: {
    id: 'deployment',
    name: 'Deployment',
    icon: '🚀',
    description: 'Docker, CI/CD, infrastructure',
  },
  refactoring: {
    id: 'refactoring',
    name: 'Refactoring',
    icon: '♻️',
    description: 'Code cleanup, optimization',
  },
  debugging: {
    id: 'debugging',
    name: 'Debugging',
    icon: '🐛',
    description: 'Error analysis, troubleshooting',
  },
  performance: {
    id: 'performance',
    name: 'Performance',
    icon: '⚡',
    description: 'Optimization, profiling',
  },
  security: {
    id: 'security',
    name: 'Security',
    icon: '🛡️',
    description: 'Vulnerabilities, hardening',
  },
  documentation: {
    id: 'documentation',
    name: 'Documentation',
    icon: '📚',
    description: 'README, API docs, comments',
  },
  'ai-ml': {
    id: 'ai-ml',
    name: 'AI/ML',
    icon: '🤖',
    description: 'AI integrations, ML pipelines',
  },
  mobile: {
    id: 'mobile',
    name: 'Mobile',
    icon: '📱',
    description: 'React Native, mobile apps',
  },
  general: {
    id: 'general',
    name: 'General',
    icon: '✨',
    description: 'Feature implementation, misc',
  },
};
