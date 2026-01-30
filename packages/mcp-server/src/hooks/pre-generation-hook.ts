/**
 * Pre-Generation Hook
 * 
 * Runs before code generation to prepare context and validate intent.
 * Loads truthpack data, analyzes tasks, and generates context injections.
 * 
 * @module mcp-server/hooks/pre-generation-hook
 * 
 * @example
 * ```ts
 * const hook = new PreGenerationHook();
 * const result = await hook.execute({
 *   task: 'Add a new API endpoint for user profiles',
 *   targetFile: 'src/api/routes/users.ts',
 * });
 * 
 * if (result.proceed) {
 *   // Use result.enhancedContext and result.injectedPrompt
 * }
 * ```
 */

import { loadConfig } from '@repo/shared-config';

/**
 * Context provided to the pre-generation hook.
 */
export interface PreGenerationContext {
  /** The task description or prompt */
  task: string;
  /** Optional target file path for the generation */
  targetFile?: string;
  /** Optional existing code in the target file */
  existingCode?: string;
}

/**
 * Result returned by the pre-generation hook.
 */
export interface PreGenerationResult {
  /** Whether generation should proceed */
  proceed: boolean;
  /** Enhanced context with truthpack data */
  enhancedContext: Record<string, unknown>;
  /** Warnings about the task */
  warnings: string[];
  /** Prompt to inject with context */
  injectedPrompt?: string;
}

/**
 * Hook that runs before code generation.
 * Prepares context, validates intent, and enhances prompts.
 */
export class PreGenerationHook {
  /**
   * Execute pre-generation checks and enhancements.
   * Loads truthpack data, analyzes the task, and prepares context injection.
   * 
   * @param context - The generation context including task and target
   * @returns Result with enhanced context and whether to proceed
   * @throws {Error} If context is invalid
   */
  async execute(context: PreGenerationContext): Promise<PreGenerationResult> {
    // Validate input
    if (!context || typeof context.task !== 'string') {
      return {
        proceed: false,
        enhancedContext: {},
        warnings: ['Invalid context: task is required'],
      };
    }
    const warnings: string[] = [];
    const enhancedContext: Record<string, unknown> = {};

    // Load relevant truthpack data
    const truthpack = await this.loadRelevantTruthpack(context);
    enhancedContext.truthpack = truthpack;

    // Analyze task for potential issues
    const taskAnalysis = this.analyzeTask(context.task);
    if (taskAnalysis.concerns.length > 0) {
      warnings.push(...taskAnalysis.concerns);
    }

    // Load conventions
    const conventions = await this.loadConventions(context);
    enhancedContext.conventions = conventions;

    // Generate enhanced prompt
    const injectedPrompt = this.generateInjectedPrompt(context, truthpack, conventions);

    return {
      proceed: warnings.filter(w => w.startsWith('BLOCK:')).length === 0,
      enhancedContext,
      warnings,
      injectedPrompt,
    };
  }

  /**
   * Load relevant truthpack data based on task keywords.
   * 
   * @param context - The generation context
   * @returns Truthpack data relevant to the task
   */
  private async loadRelevantTruthpack(context: PreGenerationContext): Promise<Record<string, unknown>> {
    const truthpack: Record<string, unknown> = {};
    const config = loadConfig();
    const projectRoot = config.VIBECHECK_PROJECT_ROOT || process.cwd();
    const truthpackPath = `${projectRoot}/.vibecheck/truthpack`;
    const { readFile } = await import('fs/promises');

    // Determine what to load based on task keywords
    const task = context.task.toLowerCase();
    const needsRoutes = task.includes('api') || task.includes('route') || task.includes('endpoint') || task.includes('fetch');
    const needsEnv = task.includes('env') || task.includes('config') || task.includes('secret') || task.includes('variable');
    const needsAuth = task.includes('auth') || task.includes('login') || task.includes('permission') || task.includes('role');
    const needsContracts = task.includes('type') || task.includes('schema') || task.includes('interface') || task.includes('contract');

    try {
      // Always load routes summary (most common hallucination)
      if (needsRoutes || !needsEnv && !needsAuth && !needsContracts) {
        const routesData = await readFile(`${truthpackPath}/routes.json`, 'utf-8').catch(() => '{}');
        const routes = JSON.parse(routesData);
        if (routes.routes?.length > 0) {
          truthpack.routes = routes.routes.slice(0, 20).map((r: { method: string; path: string }) => `${r.method} ${r.path}`);
          truthpack.routeCount = routes.routes.length;
        }
      }

      // Load env vars if relevant
      if (needsEnv) {
        const envData = await readFile(`${truthpackPath}/env.json`, 'utf-8').catch(() => '{}');
        const env = JSON.parse(envData);
        if (env.variables?.length > 0) {
          truthpack.envVars = env.variables.slice(0, 15).map((v: { name: string; required: boolean }) => 
            `${v.name}${v.required ? ' (required)' : ''}`
          );
        }
      }

      // Load auth if relevant
      if (needsAuth) {
        const authData = await readFile(`${truthpackPath}/auth.json`, 'utf-8').catch(() => '{}');
        const auth = JSON.parse(authData);
        if (auth.roles?.length > 0) {
          truthpack.roles = auth.roles.map((r: { name: string }) => r.name);
        }
        if (auth.protectedResources?.length > 0) {
          truthpack.protectedPaths = auth.protectedResources.slice(0, 10).map((r: { path: string }) => r.path);
        }
      }

      // Load contracts if relevant
      if (needsContracts) {
        const contractsData = await readFile(`${truthpackPath}/contracts.json`, 'utf-8').catch(() => '{}');
        const contracts = JSON.parse(contractsData);
        if (contracts.contracts?.length > 0) {
          truthpack.contracts = contracts.contracts.slice(0, 10).map((c: { path: string; method?: string }) => 
            `${c.method || 'ANY'} ${c.path}`
          );
        }
      }
    } catch {
      // Truthpack may not exist
    }

    return truthpack;
  }

  /**
   * Analyze the task for potential issues or concerns.
   * 
   * @param task - The task description
   * @returns Object containing any concerns about the task
   */
  private analyzeTask(task: string): { concerns: string[] } {
    const concerns: string[] = [];

    // Check for vague tasks
    if (task.length < 20) {
      concerns.push('Task description is very short - consider providing more detail');
    }

    // Check for potentially dangerous operations
    if (task.toLowerCase().includes('delete all') || task.toLowerCase().includes('drop')) {
      concerns.push('BLOCK: Task contains potentially dangerous operations');
    }

    // Check for ambiguous references
    if (task.includes('the function') || task.includes('that file')) {
      concerns.push('Task contains ambiguous references - specify exact names');
    }

    return { concerns };
  }

  /**
   * Load project conventions from the vibecheck knowledge base.
   * 
   * @param _context - The generation context (unused but available for future use)
   * @returns Array of convention strings
   */
  private async loadConventions(_context: PreGenerationContext): Promise<string[]> {
    const conventions: string[] = [];
    const config = loadConfig();
    const projectRoot = config.VIBECHECK_PROJECT_ROOT || process.cwd();
    const { readFile } = await import('fs/promises');

    try {
      const conventionsData = await readFile(`${projectRoot}/.vibecheck/knowledge/conventions.json`, 'utf-8');
      const data = JSON.parse(conventionsData);
      
      if (data.conventions?.length > 0) {
        for (const conv of data.conventions.slice(0, 10)) {
          conventions.push(`- [${conv.category}] ${conv.rule}`);
        }
      }
    } catch {
      // Conventions file may not exist - provide defaults
      conventions.push('- [naming] Use camelCase for variables and functions');
      conventions.push('- [naming] Use PascalCase for types and interfaces');
      conventions.push('- [imports] Use named exports, avoid default exports');
      conventions.push('- [types] Avoid `any` type, use `unknown` if unsure');
    }

    return conventions;
  }

  /**
   * Generate the prompt to inject with context and conventions.
   * 
   * @param _context - The generation context (unused but available)
   * @param truthpack - The loaded truthpack data
   * @param conventions - The loaded conventions
   * @returns The formatted prompt injection string
   */
  private generateInjectedPrompt(
    _context: PreGenerationContext,
    truthpack: Record<string, unknown>,
    conventions: string[]
  ): string {
    const sections: string[] = [];

    sections.push(`## VibeCheck Context Injection

The following information is verified ground truth. Use ONLY these facts.
Do NOT invent APIs, types, or endpoints not listed here.`);

    if (Object.keys(truthpack).length > 0) {
      sections.push(`### Verified Truthpack
${JSON.stringify(truthpack, null, 2)}`);
    }

    if (conventions.length > 0) {
      sections.push(`### Project Conventions
${conventions.join('\n')}`);
    }

    sections.push(`### Verification Requirements
Before generating code:
1. Verify all imports exist in package.json or as local files
2. Verify all API endpoints exist in the truthpack
3. Verify all types match truthpack schemas
4. Follow all listed conventions`);

    return sections.join('\n\n');
  }
}
