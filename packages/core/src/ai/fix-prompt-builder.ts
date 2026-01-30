/**
 * Fix Prompt Builder
 * 
 * Builds structured prompts for AI-assisted code fixes.
 * Provides templates and utilities for common fix scenarios.
 * 
 * Includes input validation and sanitization to prevent prompt injection.
 */

import type { Issue, FixContext, TruthpackData } from '../autofix/types.js';
import { sanitizeFilePath, isIssueType } from '../autofix/types.js';

/**
 * Prompt template configuration
 */
export interface PromptTemplate {
  id: string;
  name: string;
  issueTypes: string[];
  template: string;
  examples?: PromptExample[];
}

/**
 * Example for few-shot prompting
 */
export interface PromptExample {
  issue: string;
  context: string;
  solution: string;
}

/**
 * Built prompt ready for AI
 */
export interface BuiltPrompt {
  system: string;
  user: string;
  examples: PromptExample[];
  metadata: Record<string, unknown>;
}

/**
 * Maximum sizes for prompt content
 */
const MAX_CODE_CONTEXT_LINES = 100;
const MAX_FILE_CONTENT_CHARS = 50000;
const MAX_TEMPLATE_LENGTH = 10000;
const MAX_CUSTOM_INSTRUCTIONS = 5;
const MAX_INSTRUCTION_LENGTH = 500;

/**
 * Default prompt templates for common issue types
 */
const DEFAULT_TEMPLATES: PromptTemplate[] = [
  {
    id: 'silent-failure',
    name: 'Silent Failure Fix',
    issueTypes: ['silent-failure', 'fake-success'],
    template: `
You need to fix a silent failure in the code. Silent failures occur when errors are caught but not properly handled, leading to unexpected behavior.

## Issue Details
- **Type:** {{issueType}}
- **File:** {{filePath}}
- **Line:** {{line}}
- **Message:** {{message}}

## Code Context
\`\`\`{{language}}
{{codeContext}}
\`\`\`

## Requirements
1. Ensure all errors are properly caught and handled
2. Add appropriate error logging
3. Propagate errors to callers or handle them gracefully
4. Avoid silent failures that hide problems from users

## Response Format
Provide the fixed code in a code block, followed by a brief explanation.
`,
    examples: [
      {
        issue: 'Empty catch block swallowing errors',
        context: 'try { doSomething(); } catch (e) {}',
        solution: 'try { doSomething(); } catch (error) { console.error("Operation failed:", error); throw error; }',
      },
    ],
  },
  {
    id: 'auth-gap',
    name: 'Authentication Gap Fix',
    issueTypes: ['auth-gap'],
    template: `
You need to add missing authentication to a route or endpoint.

## Issue Details
- **Type:** {{issueType}}
- **File:** {{filePath}}
- **Route:** {{routePath}}
- **Message:** {{message}}

## Current Code
\`\`\`{{language}}
{{codeContext}}
\`\`\`

## Auth Context
{{#if authProviders}}
- **Providers:** {{authProviders}}
{{/if}}
{{#if protectedPaths}}
- **Protected Patterns:** {{protectedPaths}}
{{/if}}

## Requirements
1. Add appropriate authentication middleware or guard
2. Follow existing authentication patterns in the codebase
3. Return 401 Unauthorized for unauthenticated requests
4. Optionally check for specific roles/permissions if applicable

## Response Format
Provide the fixed code in a code block, showing where to add the auth check.
`,
    examples: [
      {
        issue: 'Express route missing auth middleware',
        context: "app.get('/admin/users', (req, res) => { ... })",
        solution: "app.get('/admin/users', requireAuth, (req, res) => { ... })",
      },
    ],
  },
  {
    id: 'env-var',
    name: 'Environment Variable Fix',
    issueTypes: ['ghost-env'],
    template: `
You need to fix an undefined environment variable usage.

## Issue Details
- **Variable:** {{envVarName}}
- **File:** {{filePath}}
- **Message:** {{message}}

## Usage Context
\`\`\`{{language}}
{{codeContext}}
\`\`\`

## Known Environment Variables
{{#if knownEnvVars}}
{{knownEnvVars}}
{{else}}
No environment variables documented in truthpack.
{{/if}}

## Requirements
1. Add the variable to .env.example with appropriate documentation
2. Add a fail-fast check if the variable is required
3. Provide a sensible default if appropriate
4. Consider if the variable should be marked as sensitive

## Response Format
Provide both:
1. The .env.example entry
2. The code changes (fail-fast check or default value)
`,
    examples: [
      {
        issue: 'Undeclared API_KEY usage',
        context: 'const apiKey = process.env.API_KEY;',
        solution: `
// .env.example
API_KEY=<REQUIRED>  # API key for external service

// Code
const apiKey = process.env.API_KEY;
if (!apiKey) {
  throw new Error('API_KEY environment variable is required');
}
`,
      },
    ],
  },
  {
    id: 'ghost-route',
    name: 'Missing Route Fix',
    issueTypes: ['ghost-route'],
    template: `
You need to fix a reference to a non-existent route.

## Issue Details
- **Route:** {{routePath}}
- **Method:** {{method}}
- **Referenced In:** {{filePath}}
- **Message:** {{message}}

## Known Routes
{{#if knownRoutes}}
{{knownRoutes}}
{{else}}
No routes documented in truthpack.
{{/if}}

## Context
\`\`\`{{language}}
{{codeContext}}
\`\`\`

## Requirements
1. Create a stub handler for the missing route
2. Return an appropriate response (501 Not Implemented is acceptable for stubs)
3. Add TODO comment for implementation
4. Follow existing route patterns in the codebase

## Response Format
Provide the route handler code in the appropriate format for the framework.
`,
    examples: [
      {
        issue: 'Missing /api/users route',
        context: 'fetch("/api/users")',
        solution: `
// routes/users.ts
router.get('/users', (req, res) => {
  // TODO: Implement user listing
  res.status(501).json({ error: 'Not Implemented' });
});
`,
      },
    ],
  },
];

/**
 * FixPromptBuilder creates structured prompts for AI fixes
 */
export class FixPromptBuilder {
  private readonly templates: Map<string, PromptTemplate> = new Map();
  private customInstructions: string[] = [];

  constructor() {
    // Load default templates
    for (const template of DEFAULT_TEMPLATES) {
      this.templates.set(template.id, template);
    }
  }

  /**
   * Add a custom template with validation
   */
  addTemplate(template: PromptTemplate): void {
    if (!template || typeof template !== 'object') {
      throw new Error('Invalid template');
    }
    if (!template.id || typeof template.id !== 'string') {
      throw new Error('Template must have a valid id');
    }
    if (!template.name || typeof template.name !== 'string') {
      throw new Error('Template must have a valid name');
    }
    if (!Array.isArray(template.issueTypes) || template.issueTypes.length === 0) {
      throw new Error('Template must have at least one issue type');
    }
    if (!template.template || typeof template.template !== 'string') {
      throw new Error('Template must have template content');
    }
    if (template.template.length > MAX_TEMPLATE_LENGTH) {
      throw new Error(`Template content exceeds maximum length (${MAX_TEMPLATE_LENGTH})`);
    }

    // Sanitize the template
    const sanitized: PromptTemplate = {
      id: this.sanitizeId(template.id),
      name: this.sanitizeText(template.name, 100),
      issueTypes: template.issueTypes
        .filter((t) => typeof t === 'string')
        .map((t) => this.sanitizeId(t)),
      template: template.template, // Keep template as-is for flexibility
      examples: template.examples?.slice(0, 5).map((e) => ({
        issue: this.sanitizeText(e.issue, 200),
        context: this.sanitizeText(e.context, 1000),
        solution: this.sanitizeText(e.solution, 2000),
      })),
    };

    this.templates.set(sanitized.id, sanitized);
  }

  /**
   * Remove a template
   */
  removeTemplate(id: string): boolean {
    if (!id || typeof id !== 'string') {
      return false;
    }
    return this.templates.delete(this.sanitizeId(id));
  }

  /**
   * Add custom instructions to all prompts with validation
   */
  addCustomInstructions(instructions: string): void {
    if (!instructions || typeof instructions !== 'string') {
      return;
    }

    if (this.customInstructions.length >= MAX_CUSTOM_INSTRUCTIONS) {
      // Remove oldest instruction
      this.customInstructions.shift();
    }

    // Sanitize and limit length
    const sanitized = this.sanitizeText(instructions, MAX_INSTRUCTION_LENGTH);
    if (sanitized) {
      this.customInstructions.push(sanitized);
    }
  }

  /**
   * Clear custom instructions
   */
  clearCustomInstructions(): void {
    this.customInstructions = [];
  }

  /**
   * Build a prompt for an issue with validation
   */
  build(
    issue: Issue,
    context: FixContext,
    fileContent?: string
  ): BuiltPrompt {
    // Validate inputs
    if (!issue || typeof issue !== 'object') {
      throw new Error('Invalid issue');
    }
    if (!context || typeof context !== 'object') {
      throw new Error('Invalid context');
    }

    // Sanitize file content if provided
    let sanitizedContent: string | undefined;
    if (fileContent && typeof fileContent === 'string') {
      sanitizedContent = fileContent.slice(0, MAX_FILE_CONTENT_CHARS);
    }

    // Find matching template
    const template = this.findTemplate(issue.type);
    
    // Build variables with sanitization
    const variables = this.buildVariables(issue, context, sanitizedContent);
    
    // Render template
    const userPrompt = template
      ? this.renderTemplate(template.template, variables)
      : this.buildGenericPrompt(issue, context, sanitizedContent);
    
    // Build system prompt
    const systemPrompt = this.buildSystemPrompt(context);

    return {
      system: systemPrompt,
      user: userPrompt,
      examples: template?.examples ?? [],
      metadata: {
        templateId: template?.id,
        issueType: issue.type,
        filePath: issue.filePath ? sanitizeFilePath(issue.filePath) : undefined,
      },
    };
  }

  /**
   * Sanitize an ID string
   */
  private sanitizeId(id: string): string {
    return id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 50);
  }

  /**
   * Sanitize text to prevent injection
   */
  private sanitizeText(text: string, maxLength: number): string {
    if (!text || typeof text !== 'string') {
      return '';
    }
    
    return text
      .slice(0, maxLength)
      .replace(/[<>]/g, '') // Remove potential tags
      .replace(/\{\{/g, '{ {') // Prevent template injection
      .replace(/\}\}/g, '} }')
      .trim();
  }

  /**
   * Find a template for an issue type
   */
  private findTemplate(issueType: string): PromptTemplate | undefined {
    for (const template of this.templates.values()) {
      if (template.issueTypes.includes(issueType)) {
        return template;
      }
    }
    return undefined;
  }

  /**
   * Build template variables with sanitization
   */
  private buildVariables(
    issue: Issue,
    context: FixContext,
    fileContent?: string
  ): Record<string, string> {
    // Sanitize all values to prevent template injection
    const sanitize = (val: string | undefined, maxLen = 500): string => {
      if (!val || typeof val !== 'string') return '';
      return val
        .slice(0, maxLen)
        .replace(/\{\{/g, '{ {')
        .replace(/\}\}/g, '} }');
    };

    const variables: Record<string, string> = {
      issueType: sanitize(issue.type, 50),
      message: sanitize(issue.message, 1000),
      severity: sanitize(issue.severity, 20),
      filePath: sanitize(issue.filePath ? sanitizeFilePath(issue.filePath) : 'unknown', 200),
      line: issue.line?.toString() ?? '',
      language: this.detectLanguage(issue.filePath),
    };

    // Add code context
    if (fileContent) {
      variables.codeContext = this.extractContext(fileContent, issue.line);
    }

    // Add route-specific variables with validation
    if (issue.metadata?.route && typeof issue.metadata.route === 'string') {
      variables.routePath = sanitize(issue.metadata.route, 200);
    }
    if (issue.metadata?.method && typeof issue.metadata.method === 'string') {
      const validMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
      const method = issue.metadata.method.toUpperCase();
      variables.method = validMethods.includes(method) ? method : 'GET';
    }

    // Add env var specific variables with validation
    const envVarName = issue.violation?.claim?.value ?? issue.driftItem?.identifier;
    if (envVarName && typeof envVarName === 'string') {
      // Env var names should be alphanumeric with underscores
      variables.envVarName = envVarName.replace(/[^A-Z0-9_]/gi, '').slice(0, 100);
    }

    // Add truthpack context with limits
    if (context.truthpack) {
      variables.knownRoutes = this.formatRoutes(context.truthpack.routes);
      variables.knownEnvVars = this.formatEnvVars(context.truthpack.env);
      
      if (context.truthpack.auth?.providers) {
        variables.authProviders = context.truthpack.auth.providers
          .filter((p) => typeof p === 'string')
          .slice(0, 10)
          .map((p) => sanitize(p, 50))
          .join(', ');
      } else {
        variables.authProviders = '';
      }
      
      if (context.truthpack.auth?.protectedResources) {
        variables.protectedPaths = context.truthpack.auth.protectedResources
          .filter((r) => r && typeof r.path === 'string')
          .slice(0, 20)
          .map((r) => sanitize(r.path, 100))
          .join(', ');
      } else {
        variables.protectedPaths = '';
      }
    }

    return variables;
  }

  /**
   * Render a template with variables
   */
  private renderTemplate(
    template: string,
    variables: Record<string, string>
  ): string {
    let rendered = template;

    // Simple variable replacement
    for (const [key, value] of Object.entries(variables)) {
      rendered = rendered.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }

    // Handle conditionals (simple implementation)
    rendered = rendered.replace(
      /{{#if (\w+)}}([\s\S]*?){{\/if}}/g,
      (_, key, content) => (variables[key] ? content : '')
    );

    // Clean up any remaining template markers
    rendered = rendered.replace(/{{[\w#\/]+}}/g, '');

    return rendered.trim();
  }

  /**
   * Build a generic prompt when no template matches
   */
  private buildGenericPrompt(
    issue: Issue,
    context: FixContext,
    fileContent?: string
  ): string {
    const lines: string[] = [
      '## Fix Request',
      '',
      `**Issue Type:** ${issue.type}`,
      `**Severity:** ${issue.severity}`,
      `**Message:** ${issue.message}`,
    ];

    if (issue.filePath) {
      lines.push(`**File:** ${issue.filePath}`);
    }

    if (issue.line) {
      lines.push(`**Line:** ${issue.line}`);
    }

    if (issue.suggestion) {
      lines.push(`**Suggestion:** ${issue.suggestion}`);
    }

    if (fileContent) {
      lines.push('');
      lines.push('## Code Context');
      lines.push('```');
      lines.push(this.extractContext(fileContent, issue.line));
      lines.push('```');
    }

    lines.push('');
    lines.push('## Instructions');
    lines.push('Please provide a fix for this issue:');
    lines.push('1. Make the minimal change needed to fix the issue');
    lines.push('2. Follow existing code style and patterns');
    lines.push('3. Explain your reasoning');

    return lines.join('\n');
  }

  /**
   * Build the system prompt
   */
  private buildSystemPrompt(context: FixContext): string {
    const lines: string[] = [
      'You are an expert code fixer for VibeCheck, an automated code analysis and fixing system.',
      '',
      '## Your Role',
      '- Generate precise, minimal fixes for code issues',
      '- Follow best practices and existing code patterns',
      '- Prioritize safety and correctness',
      '',
      '## Guidelines',
      '- Make the smallest change that fixes the issue',
      '- Do not refactor unrelated code',
      '- Preserve existing functionality',
      '- Add appropriate error handling',
      '- Follow the project\'s coding style',
      '',
      '## Response Format',
      'Always respond with:',
      '1. A brief explanation of the fix',
      '2. The code changes in appropriate code blocks',
      '3. Any caveats or considerations',
    ];

    // Add custom instructions
    if (this.customInstructions.length > 0) {
      lines.push('');
      lines.push('## Custom Instructions');
      lines.push(...this.customInstructions);
    }

    return lines.join('\n');
  }

  /**
   * Extract code context around a line with limits
   */
  private extractContext(content: string, line?: number): string {
    if (!content || typeof content !== 'string') {
      return '';
    }

    const lines = content.split('\n');
    
    // Limit total lines to prevent huge prompts
    const maxLinesToShow = Math.min(MAX_CODE_CONTEXT_LINES, lines.length);
    
    if (!line || line < 1 || line > lines.length) {
      // Return first lines with limit
      const contextLines = lines.slice(0, Math.min(30, maxLinesToShow));
      const result = contextLines
        .map((l, i) => `${i + 1}: ${l.slice(0, 200)}`) // Limit line length
        .join('\n');
      
      if (lines.length > 30) {
        return result + '\n... (truncated)';
      }
      return result;
    }

    // Get 10 lines before and after, respecting limits
    const contextSize = Math.min(10, Math.floor(maxLinesToShow / 2));
    const start = Math.max(0, line - contextSize);
    const end = Math.min(lines.length, line + contextSize);
    
    return lines
      .slice(start, end)
      .map((l, i) => {
        const lineNum = start + i + 1;
        const marker = lineNum === line ? '>>> ' : '    ';
        // Limit individual line length to prevent excessively long lines
        const truncatedLine = l.length > 200 ? l.slice(0, 200) + '...' : l;
        return `${marker}${lineNum}: ${truncatedLine}`;
      })
      .join('\n');
  }

  /**
   * Detect language from file path
   */
  private detectLanguage(filePath?: string): string {
    if (!filePath) return 'typescript';
    
    const ext = filePath.split('.').pop()?.toLowerCase();
    const langMap: Record<string, string> = {
      ts: 'typescript',
      tsx: 'tsx',
      js: 'javascript',
      jsx: 'jsx',
      py: 'python',
      java: 'java',
      go: 'go',
      rs: 'rust',
      rb: 'ruby',
      php: 'php',
    };
    
    return langMap[ext ?? ''] ?? 'typescript';
  }

  /**
   * Format routes for prompt
   */
  private formatRoutes(routes?: TruthpackData['routes']): string {
    if (!routes || routes.length === 0) {
      return '';
    }

    return routes
      .slice(0, 10)
      .map((r) => `- ${r.method.toUpperCase()} ${r.path}`)
      .join('\n');
  }

  /**
   * Format env vars for prompt
   */
  private formatEnvVars(envVars?: TruthpackData['env']): string {
    if (!envVars || envVars.length === 0) {
      return '';
    }

    return envVars
      .slice(0, 10)
      .map((e) => `- ${e.name}${e.required ? ' (required)' : ''}${e.description ? `: ${e.description}` : ''}`)
      .join('\n');
  }

  /**
   * Get all registered templates
   */
  getTemplates(): PromptTemplate[] {
    return Array.from(this.templates.values());
  }
}
