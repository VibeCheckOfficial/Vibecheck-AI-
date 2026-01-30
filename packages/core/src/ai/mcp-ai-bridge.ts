/**
 * MCP AI Bridge
 * 
 * Bridges the auto-fix engine with AI capabilities via MCP.
 * Generates fix prompts and parses AI responses into patches.
 * 
 * Includes comprehensive input validation, sanitization, and security checks.
 */

import type {
  Issue,
  Patch,
  FixContext,
  AutoFixPolicy,
} from '../autofix/types.js';
import { 
  normalizePolicy, 
  sanitizeFilePath, 
  SAFETY_LIMITS,
  isIssueType,
} from '../autofix/types.js';
import { PatchGenerator } from '../autofix/patch-generator.js';

/**
 * AI fix suggestion from the model
 */
export interface AIFixSuggestion {
  description: string;
  codeChanges: CodeChange[];
  confidence: number;
  reasoning: string;
  alternatives?: string[];
}

/**
 * A single code change suggestion
 */
export interface CodeChange {
  filePath: string;
  action: 'modify' | 'create' | 'delete';
  originalCode?: string;
  newCode?: string;
  startLine?: number;
  endLine?: number;
}

/**
 * Request to the AI for a fix
 */
export interface AIFixRequest {
  issue: Issue;
  context: FixContext;
  fileContent?: string;
  constraints?: FixConstraints;
}

/**
 * Constraints for AI-generated fixes
 */
export interface FixConstraints {
  maxLinesChanged: number;
  allowNewFiles: boolean;
  allowDependencyChanges: boolean;
  styleGuide?: string;
  prohibitedPatterns?: string[];
}

/**
 * Validation result for an AI fix
 */
export interface AIFixValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  policyViolations: string[];
}

/**
 * MCP tool call interface (simplified)
 */
export interface MCPToolCall {
  name: string;
  parameters: Record<string, unknown>;
}

/**
 * MCP tool result interface
 */
export interface MCPToolResult {
  content: Array<{
    type: string;
    text: string;
  }>;
}

/**
 * Dangerous patterns to detect in AI-generated code
 */
const DANGEROUS_PATTERNS: readonly RegExp[] = [
  /\beval\s*\(/i,
  /\bnew\s+Function\s*\(/i,
  /\bexec\s*\(/i,
  /\bspawn\s*\(/i,
  /\bexecSync\s*\(/i,
  /\bchild_process/i,
  /\brequire\s*\(\s*['"]child_process['"]\s*\)/i,
  /\bimport\s+.*from\s+['"]child_process['"]/i,
  /\b__dirname\s*\+/i,
  /\b__filename\s*\+/i,
  /process\.env\.[A-Z_]+\s*=/i, // Writing to process.env
  /\bfs\.(unlink|rmdir|rm)Sync?\s*\(/i, // File deletion
];

/**
 * Patterns that look like hardcoded secrets
 */
const SECRET_PATTERNS: readonly RegExp[] = [
  /(?:api[_-]?key|apikey)\s*[:=]\s*['"][^'"]{15,}['"]/i,
  /(?:secret|password|token)\s*[:=]\s*['"][^'"]{10,}['"]/i,
  /(?:aws|azure|gcp)[_-]?(?:key|secret|token)\s*[:=]\s*['"][^'"]+['"]/i,
  /Bearer\s+[A-Za-z0-9\-._~+/]+=*/i,
  /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/i,
];

/**
 * Maximum sizes for AI responses
 */
const MAX_RESPONSE_LENGTH = 100000; // 100KB
const MAX_CODE_CHANGE_SIZE = 50000; // 50KB per file
const MAX_CODE_CHANGES = 10;

/**
 * MCPAIBridge connects the auto-fix engine with AI capabilities
 */
export class MCPAIBridge {
  private readonly patchGenerator: PatchGenerator;
  private readonly policy: AutoFixPolicy;

  constructor(policy: AutoFixPolicy) {
    this.patchGenerator = new PatchGenerator();
    this.policy = normalizePolicy(policy);
  }

  /**
   * Request an AI-generated fix for an issue
   * This method builds the prompt and is designed to be called
   * by an MCP client that will route to the appropriate AI model
   */
  async buildFixRequest(request: AIFixRequest): Promise<{
    prompt: string;
    systemPrompt: string;
    metadata: Record<string, unknown>;
  }> {
    const { issue, context, fileContent, constraints } = request;

    const systemPrompt = this.buildSystemPrompt(context, constraints);
    const prompt = this.buildFixPrompt(issue, context, fileContent);

    return {
      prompt,
      systemPrompt,
      metadata: {
        issueId: issue.id,
        issueType: issue.type,
        filePath: issue.filePath,
        severity: issue.severity,
      },
    };
  }

  /**
   * Parse an AI response into code changes with comprehensive validation
   */
  parseResponse(response: string): AIFixSuggestion | null {
    // Input validation
    if (!response || typeof response !== 'string') {
      return null;
    }

    // Size check
    if (response.length > MAX_RESPONSE_LENGTH) {
      console.warn(`AI response exceeds maximum length (${MAX_RESPONSE_LENGTH})`);
      response = response.slice(0, MAX_RESPONSE_LENGTH);
    }

    try {
      // Try to parse as JSON first
      const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        // Validate JSON size before parsing
        if (jsonMatch[1].length > MAX_RESPONSE_LENGTH) {
          console.warn('JSON block too large');
          return null;
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(jsonMatch[1]);
        } catch (jsonError) {
          console.warn('Failed to parse JSON from AI response:', jsonError);
          return this.parseNaturalLanguageResponse(response);
        }

        const normalized = this.normalizeAIResponse(parsed);
        return normalized ? this.sanitizeSuggestion(normalized) : null;
      }

      // Try to extract code blocks and descriptions
      const suggestion = this.parseNaturalLanguageResponse(response);
      return suggestion ? this.sanitizeSuggestion(suggestion) : null;
    } catch (error) {
      console.error('Failed to parse AI response:', error);
      return null;
    }
  }

  /**
   * Sanitize an AI suggestion to remove dangerous content
   */
  private sanitizeSuggestion(suggestion: AIFixSuggestion): AIFixSuggestion | null {
    // Limit number of code changes
    if (suggestion.codeChanges.length > MAX_CODE_CHANGES) {
      console.warn(`Too many code changes (${suggestion.codeChanges.length}), limiting to ${MAX_CODE_CHANGES}`);
      suggestion.codeChanges = suggestion.codeChanges.slice(0, MAX_CODE_CHANGES);
    }

    // Sanitize each code change
    const sanitizedChanges: CodeChange[] = [];
    
    for (const change of suggestion.codeChanges) {
      // Validate file path
      if (!change.filePath || typeof change.filePath !== 'string') {
        continue;
      }

      // Sanitize file path
      const sanitizedPath = sanitizeFilePath(change.filePath);
      
      // Skip protected paths
      if (this.isProtectedPath(sanitizedPath)) {
        console.warn(`Skipping protected path: ${sanitizedPath}`);
        continue;
      }

      // Validate code size
      if (change.newCode && change.newCode.length > MAX_CODE_CHANGE_SIZE) {
        console.warn(`Code change too large for ${sanitizedPath}`);
        continue;
      }

      // Check for dangerous patterns
      if (change.newCode) {
        const dangerousPatterns = this.detectDangerousPatterns(change.newCode);
        if (dangerousPatterns.length > 0) {
          console.warn(`Dangerous patterns detected in ${sanitizedPath}:`, dangerousPatterns);
          // Don't skip, but lower confidence
          suggestion.confidence = Math.min(suggestion.confidence, 0.3);
        }

        // Check for potential secrets
        if (this.containsPotentialSecrets(change.newCode)) {
          console.warn(`Potential secrets detected in ${sanitizedPath}`);
          suggestion.confidence = Math.min(suggestion.confidence, 0.2);
        }
      }

      sanitizedChanges.push({
        ...change,
        filePath: sanitizedPath,
        // Ensure line numbers are valid
        startLine: typeof change.startLine === 'number' && change.startLine > 0 
          ? Math.floor(change.startLine) : undefined,
        endLine: typeof change.endLine === 'number' && change.endLine > 0 
          ? Math.floor(change.endLine) : undefined,
      });
    }

    if (sanitizedChanges.length === 0) {
      return null;
    }

    return {
      ...suggestion,
      codeChanges: sanitizedChanges,
      // Clamp confidence to valid range
      confidence: Math.max(0, Math.min(1, suggestion.confidence)),
      // Sanitize text fields
      description: this.sanitizeText(suggestion.description, 500),
      reasoning: this.sanitizeText(suggestion.reasoning, 1000),
      alternatives: suggestion.alternatives?.map((a) => this.sanitizeText(a, 200)),
    };
  }

  /**
   * Check if a path is protected from AI modifications
   */
  private isProtectedPath(filePath: string): boolean {
    const protectedPatterns = [
      /\.env(?:\.[^/]*)?$/i,
      /\.git\//i,
      /node_modules\//i,
      /package-lock\.json$/i,
      /pnpm-lock\.yaml$/i,
      /yarn\.lock$/i,
      /\.pem$/i,
      /\.key$/i,
      /credentials/i,
      /secrets/i,
    ];

    return protectedPatterns.some((pattern) => pattern.test(filePath));
  }

  /**
   * Detect dangerous patterns in code
   */
  private detectDangerousPatterns(code: string): string[] {
    const detected: string[] = [];
    
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(code)) {
        detected.push(pattern.source);
      }
    }
    
    return detected;
  }

  /**
   * Check if code contains potential secrets
   */
  private containsPotentialSecrets(code: string): boolean {
    return SECRET_PATTERNS.some((pattern) => pattern.test(code));
  }

  /**
   * Sanitize text to prevent injection and limit length
   */
  private sanitizeText(text: string, maxLength: number): string {
    if (!text || typeof text !== 'string') {
      return '';
    }
    
    return text
      .slice(0, maxLength)
      .replace(/[<>]/g, '') // Remove potential HTML/XML tags
      .trim();
  }

  /**
   * Convert AI suggestion to patches
   */
  suggestionToPatches(
    suggestion: AIFixSuggestion,
    issueId: string
  ): Patch[] {
    const patches: Patch[] = [];

    for (const change of suggestion.codeChanges) {
      if (change.action === 'delete') {
        // For deletions, create an empty patch
        patches.push({
          filePath: change.filePath,
          hunks: [],
          originalContent: change.originalCode ?? '',
          newContent: '',
          issueId,
          moduleId: 'ai-assisted',
        });
      } else {
        const patch = this.patchGenerator.generatePatch(
          change.filePath,
          change.originalCode ?? '',
          change.newCode ?? '',
          issueId,
          'ai-assisted'
        );
        patches.push(patch);
      }
    }

    return patches;
  }

  /**
   * Validate an AI-generated fix against policy with comprehensive checks
   */
  validateFix(
    suggestion: AIFixSuggestion,
    policy: AutoFixPolicy
  ): AIFixValidation {
    const errors: string[] = [];
    const warnings: string[] = [];
    const policyViolations: string[] = [];

    // Validate input
    if (!suggestion || typeof suggestion !== 'object') {
      errors.push('Invalid suggestion object');
      return { valid: false, errors, warnings, policyViolations };
    }

    if (!Array.isArray(suggestion.codeChanges)) {
      errors.push('Suggestion has no code changes');
      return { valid: false, errors, warnings, policyViolations };
    }

    // Normalize policy
    const normalizedPolicy = normalizePolicy(policy);

    // Check total lines changed
    let totalLines = 0;
    let totalBytes = 0;
    
    for (const change of suggestion.codeChanges) {
      if (change.newCode) {
        const lines = change.newCode.split('\n').length;
        const bytes = Buffer.byteLength(change.newCode, 'utf-8');
        totalLines += lines;
        totalBytes += bytes;
      }
    }

    if (totalLines > normalizedPolicy.maxLinesPerFix) {
      policyViolations.push(
        `Fix changes ${totalLines} lines, exceeding limit of ${normalizedPolicy.maxLinesPerFix}`
      );
    }

    if (totalBytes > SAFETY_LIMITS.MAX_PATCH_SIZE_BYTES) {
      policyViolations.push(
        `Fix size (${totalBytes} bytes) exceeds maximum allowed`
      );
    }

    // Check files affected
    const filesAffected = new Set(
      suggestion.codeChanges
        .map((c) => c.filePath)
        .filter((p) => p && typeof p === 'string')
    );
    
    if (filesAffected.size > normalizedPolicy.maxFilesPerFix) {
      policyViolations.push(
        `Fix affects ${filesAffected.size} files, exceeding limit of ${normalizedPolicy.maxFilesPerFix}`
      );
    }

    // Check blocked paths
    for (const change of suggestion.codeChanges) {
      if (!change.filePath) continue;
      
      const sanitizedPath = sanitizeFilePath(change.filePath);
      
      for (const blockedPath of normalizedPolicy.blockedPaths) {
        try {
          // Escape special regex characters except *
          const escaped = blockedPath.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
          const pattern = escaped.replace(/\*/g, '.*');
          if (new RegExp(pattern, 'i').test(sanitizedPath)) {
            policyViolations.push(
              `Fix attempts to modify blocked path: ${sanitizedPath}`
            );
            break;
          }
        } catch {
          // Invalid pattern, skip
        }
      }

      // Check for protected paths
      if (this.isProtectedPath(sanitizedPath)) {
        policyViolations.push(
          `Fix attempts to modify protected path: ${sanitizedPath}`
        );
      }
    }

    // Check confidence
    if (suggestion.confidence < 0.3) {
      errors.push('AI confidence is too low for any action');
    } else if (suggestion.confidence < 0.5) {
      warnings.push('AI confidence is low - manual review strongly recommended');
    }

    // Check for common issues in AI-generated code
    for (const change of suggestion.codeChanges) {
      if (!change.newCode) continue;

      // Check for TODO/FIXME left by AI
      if (/\b(TODO|FIXME|HACK|XXX)\b/i.test(change.newCode)) {
        warnings.push(`AI-generated code contains TODO/FIXME markers in ${change.filePath}`);
      }

      // Check for placeholder values
      const placeholderPatterns = [
        /YOUR_[A-Z_]+/,
        /REPLACE_[A-Z_]+/,
        /\bxxx+\b/i,
        /<INSERT_[A-Z_]+>/,
        /\[YOUR[^]]*\]/i,
        /\{YOUR[^}]*\}/i,
      ];
      
      for (const pattern of placeholderPatterns) {
        if (pattern.test(change.newCode)) {
          errors.push(`AI-generated code contains placeholder values in ${change.filePath}`);
          break;
        }
      }

      // Check for console.log in production code
      if (
        /console\.(log|debug|info)\s*\(/g.test(change.newCode) &&
        !change.filePath.includes('test') &&
        !change.filePath.includes('debug') &&
        !change.filePath.includes('.test.') &&
        !change.filePath.includes('.spec.')
      ) {
        warnings.push(`AI-generated code contains console statements in ${change.filePath}`);
      }

      // Check for dangerous patterns
      const dangerous = this.detectDangerousPatterns(change.newCode);
      if (dangerous.length > 0) {
        errors.push(`AI-generated code contains dangerous patterns in ${change.filePath}`);
      }

      // Check for potential secrets
      if (this.containsPotentialSecrets(change.newCode)) {
        errors.push(`AI-generated code may contain hardcoded secrets in ${change.filePath}`);
      }

      // Check for any type usage
      if (/:\s*any\b/.test(change.newCode)) {
        warnings.push(`AI-generated code uses 'any' type in ${change.filePath}`);
      }

      // Check for disabled lint rules
      if (/\/\/\s*@ts-ignore|\/\/\s*eslint-disable|\/\*\s*eslint-disable/.test(change.newCode)) {
        warnings.push(`AI-generated code disables lint rules in ${change.filePath}`);
      }
    }

    return {
      valid: errors.length === 0 && policyViolations.length === 0,
      errors,
      warnings,
      policyViolations,
    };
  }

  /**
   * Build the system prompt for AI
   */
  private buildSystemPrompt(
    context: FixContext,
    constraints?: FixConstraints
  ): string {
    const lines: string[] = [
      'You are an expert code fixer for the VibeCheck auto-fix system.',
      'Your task is to generate precise, minimal fixes for code issues.',
      '',
      '## Guidelines:',
      '1. Make the smallest possible change that fixes the issue',
      '2. Follow existing code style and conventions',
      '3. Do not introduce new dependencies unless absolutely necessary',
      '4. Preserve existing functionality',
      '5. Add appropriate error handling',
      '',
      '## Response Format:',
      'Respond with a JSON object containing:',
      '- description: Brief description of the fix',
      '- confidence: Number 0-1 indicating confidence in the fix',
      '- reasoning: Why this fix is appropriate',
      '- codeChanges: Array of changes with filePath, action, originalCode, newCode',
      '',
      '```json',
      '{',
      '  "description": "Fix description",',
      '  "confidence": 0.85,',
      '  "reasoning": "Explanation",',
      '  "codeChanges": [',
      '    {',
      '      "filePath": "path/to/file.ts",',
      '      "action": "modify",',
      '      "originalCode": "old code",',
      '      "newCode": "new code"',
      '    }',
      '  ]',
      '}',
      '```',
    ];

    // Add constraints if provided
    if (constraints) {
      lines.push('');
      lines.push('## Constraints:');
      lines.push(`- Maximum lines to change: ${constraints.maxLinesChanged}`);
      lines.push(`- New files allowed: ${constraints.allowNewFiles}`);
      lines.push(`- Dependency changes allowed: ${constraints.allowDependencyChanges}`);
      
      if (constraints.prohibitedPatterns) {
        lines.push(`- Prohibited patterns: ${constraints.prohibitedPatterns.join(', ')}`);
      }
    }

    // Add project context from truthpack
    if (context.truthpack) {
      lines.push('');
      lines.push('## Project Context:');
      
      if (context.truthpack.routes && context.truthpack.routes.length > 0) {
        lines.push(`- Known routes: ${context.truthpack.routes.length}`);
      }
      
      if (context.truthpack.env && context.truthpack.env.length > 0) {
        const envNames = context.truthpack.env.map((e) => e.name).slice(0, 10);
        lines.push(`- Environment variables: ${envNames.join(', ')}${context.truthpack.env.length > 10 ? '...' : ''}`);
      }
      
      if (context.truthpack.auth) {
        lines.push(`- Auth providers: ${context.truthpack.auth.providers.join(', ')}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Build the fix prompt for an issue
   */
  private buildFixPrompt(
    issue: Issue,
    context: FixContext,
    fileContent?: string
  ): string {
    const lines: string[] = [
      `## Issue to Fix`,
      '',
      `**Type:** ${issue.type}`,
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
      lines.push('');
      lines.push(`**Suggestion:** ${issue.suggestion}`);
    }

    // Add file content if available
    if (fileContent) {
      lines.push('');
      lines.push('## Current File Content:');
      lines.push('');
      lines.push('```typescript');
      
      // If we have a specific line, show context around it
      if (issue.line) {
        const contentLines = fileContent.split('\n');
        const startLine = Math.max(0, issue.line - 10);
        const endLine = Math.min(contentLines.length, issue.line + 10);
        
        for (let i = startLine; i < endLine; i++) {
          const lineNum = i + 1;
          const marker = lineNum === issue.line ? '>>> ' : '    ';
          lines.push(`${marker}${lineNum}: ${contentLines[i]}`);
        }
      } else {
        // Show first 50 lines
        const contentLines = fileContent.split('\n').slice(0, 50);
        lines.push(contentLines.map((l, i) => `${i + 1}: ${l}`).join('\n'));
        if (fileContent.split('\n').length > 50) {
          lines.push('... (truncated)');
        }
      }
      
      lines.push('```');
    }

    // Add specific instructions based on issue type
    lines.push('');
    lines.push('## Task:');
    lines.push(this.getIssueTypeInstructions(issue.type));

    return lines.join('\n');
  }

  /**
   * Get specific instructions for each issue type
   */
  private getIssueTypeInstructions(issueType: string): string {
    const instructions: Record<string, string> = {
      'silent-failure': 
        'Fix the silent failure by ensuring errors are properly caught, logged, and propagated. ' +
        'The user should be informed of any failures, and errors should not be swallowed.',
      
      'fake-success':
        'Fix the fake success pattern by ensuring success indicators are only shown when ' +
        'operations actually succeed. Add proper error handling to prevent false positives.',
      
      'auth-gap':
        'Add the missing authentication/authorization check. Use the existing auth patterns ' +
        'in the codebase. Ensure the check is appropriate for the route/resource type.',
      
      'ghost-env':
        'Fix the undefined environment variable issue. Either add the variable to .env.example ' +
        'with appropriate documentation, or add a fail-fast check in the code.',
      
      'ghost-route':
        'Fix the missing route reference. Either create a stub handler that returns a proper ' +
        'response, or remove/update the reference if it\'s incorrect.',
      
      'ghost-import':
        'Fix the unverified import. Either add the package to dependencies, correct the import ' +
        'path, or remove the unused import.',
      
      'ghost-type':
        'Fix the undefined type reference. Either define the type, import it from the correct ' +
        'location, or use an appropriate existing type.',
      
      'ghost-file':
        'Fix the missing file reference. Either create the file with appropriate content, ' +
        'correct the file path, or remove the invalid reference.',
    };

    return instructions[issueType] ?? 
      'Generate a fix for this issue following best practices and the project\'s coding style.';
  }

  /**
   * Normalize AI response to standard format with validation
   */
  private normalizeAIResponse(parsed: unknown): AIFixSuggestion | null {
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    const response = parsed as Record<string, unknown>;

    // Validate required fields
    if (!response.codeChanges || !Array.isArray(response.codeChanges)) {
      return null;
    }

    // Limit array size
    const codeChanges = response.codeChanges.slice(0, MAX_CODE_CHANGES);

    // Validate confidence is a reasonable number
    let confidence = 0.5;
    if (typeof response.confidence === 'number' && Number.isFinite(response.confidence)) {
      confidence = Math.max(0, Math.min(1, response.confidence));
    }

    const normalizedChanges: CodeChange[] = [];
    
    for (const change of codeChanges) {
      if (!change || typeof change !== 'object') {
        continue;
      }

      const c = change as Record<string, unknown>;
      
      // Skip if no file path
      if (!c.filePath || typeof c.filePath !== 'string') {
        continue;
      }

      // Validate action
      const validActions = ['modify', 'create', 'delete'] as const;
      const action = validActions.includes(c.action as typeof validActions[number])
        ? (c.action as 'modify' | 'create' | 'delete')
        : 'modify';

      // Truncate code if too large
      let originalCode: string | undefined;
      if (c.originalCode && typeof c.originalCode === 'string') {
        originalCode = c.originalCode.slice(0, MAX_CODE_CHANGE_SIZE);
      }

      let newCode: string | undefined;
      if (c.newCode && typeof c.newCode === 'string') {
        newCode = c.newCode.slice(0, MAX_CODE_CHANGE_SIZE);
      }

      // Validate line numbers
      const startLine = typeof c.startLine === 'number' && Number.isFinite(c.startLine) && c.startLine > 0
        ? Math.floor(c.startLine)
        : undefined;
      const endLine = typeof c.endLine === 'number' && Number.isFinite(c.endLine) && c.endLine > 0
        ? Math.floor(c.endLine)
        : undefined;

      normalizedChanges.push({
        filePath: String(c.filePath),
        action,
        originalCode,
        newCode,
        startLine,
        endLine,
      });
    }

    if (normalizedChanges.length === 0) {
      return null;
    }

    // Sanitize string fields
    const description = typeof response.description === 'string'
      ? response.description.slice(0, 500)
      : 'AI-generated fix';
    
    const reasoning = typeof response.reasoning === 'string'
      ? response.reasoning.slice(0, 2000)
      : '';

    let alternatives: string[] | undefined;
    if (Array.isArray(response.alternatives)) {
      alternatives = response.alternatives
        .filter((a): a is string => typeof a === 'string')
        .slice(0, 5)
        .map((a) => a.slice(0, 200));
    }

    return {
      description,
      confidence,
      reasoning,
      codeChanges: normalizedChanges,
      alternatives,
    };
  }

  /**
   * Parse a natural language response with code blocks
   */
  private parseNaturalLanguageResponse(response: string): AIFixSuggestion | null {
    const codeChanges: CodeChange[] = [];

    // Extract code blocks with file paths
    const codeBlockRegex = /```(\w+)?(?:\s+([^\n]+))?\n([\s\S]*?)```/g;
    let match;

    while ((match = codeBlockRegex.exec(response)) !== null) {
      const [, language, filePath, code] = match;
      
      if (filePath && code) {
        codeChanges.push({
          filePath: filePath.trim(),
          action: 'modify',
          newCode: code.trim(),
        });
      }
    }

    if (codeChanges.length === 0) {
      return null;
    }

    // Extract description from the text before the first code block
    const firstBlockIndex = response.indexOf('```');
    const description = firstBlockIndex > 0
      ? response.slice(0, firstBlockIndex).trim()
      : 'AI-generated fix';

    return {
      description,
      confidence: 0.5, // Lower confidence for natural language parsing
      reasoning: 'Parsed from natural language response',
      codeChanges,
    };
  }

  /**
   * Format the AI fix suggestion for display
   */
  static formatSuggestion(suggestion: AIFixSuggestion): string {
    const lines: string[] = [
      '## AI Fix Suggestion',
      '',
      `**Description:** ${suggestion.description}`,
      `**Confidence:** ${Math.round(suggestion.confidence * 100)}%`,
      '',
      `**Reasoning:** ${suggestion.reasoning}`,
      '',
      '### Code Changes:',
      '',
    ];

    for (const change of suggestion.codeChanges) {
      lines.push(`#### ${change.filePath} (${change.action})`);
      lines.push('');
      
      if (change.originalCode) {
        lines.push('**Before:**');
        lines.push('```');
        lines.push(change.originalCode);
        lines.push('```');
        lines.push('');
      }
      
      if (change.newCode) {
        lines.push('**After:**');
        lines.push('```');
        lines.push(change.newCode);
        lines.push('```');
        lines.push('');
      }
    }

    if (suggestion.alternatives && suggestion.alternatives.length > 0) {
      lines.push('### Alternatives:');
      for (const alt of suggestion.alternatives) {
        lines.push(`- ${alt}`);
      }
    }

    return lines.join('\n');
  }
}
