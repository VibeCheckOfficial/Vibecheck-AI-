/**
 * Task Planner
 * 
 * Breaks down complex tasks into smaller, verifiable sub-tasks.
 * Each sub-task can be independently verified against the truthpack.
 */

export interface Task {
  id: string;
  description: string;
  type: 'create' | 'modify' | 'delete' | 'refactor' | 'test' | 'document';
  scope: {
    files: string[];
    modules: string[];
  };
  dependencies: string[];
  verificationPoints: VerificationPoint[];
  estimatedComplexity: 'trivial' | 'simple' | 'moderate' | 'complex';
}

export interface VerificationPoint {
  id: string;
  type: 'import' | 'export' | 'type' | 'api' | 'env' | 'test' | 'lint';
  description: string;
  checkCommand?: string;
  expectedOutcome: string;
}

export interface TaskPlan {
  originalTask: string;
  tasks: Task[];
  executionOrder: string[];
  totalComplexity: 'trivial' | 'simple' | 'moderate' | 'complex';
  warnings: string[];
  requiredContext: string[];
}

export interface PlannerConfig {
  maxTasksPerPlan: number;
  includeTests: boolean;
  includeDocumentation: boolean;
  verboseVerification: boolean;
}

const DEFAULT_CONFIG: PlannerConfig = {
  maxTasksPerPlan: 10,
  includeTests: true,
  includeDocumentation: false,
  verboseVerification: true,
};

// Task type patterns
const TASK_PATTERNS = {
  create: /\b(create|add|implement|build|make|generate|write)\b/i,
  modify: /\b(update|change|modify|edit|fix|improve|enhance|refactor)\b/i,
  delete: /\b(remove|delete|drop|clear|clean)\b/i,
  refactor: /\b(refactor|restructure|reorganize|optimize|simplify)\b/i,
  test: /\b(test|spec|coverage|verify)\b/i,
  document: /\b(document|comment|readme|docs)\b/i,
};

// Scope indicators
const SCOPE_PATTERNS = {
  component: /\b(component|widget|element|ui)\b/i,
  service: /\b(service|provider|manager|handler)\b/i,
  api: /\b(api|endpoint|route|controller)\b/i,
  model: /\b(model|schema|type|interface|entity)\b/i,
  util: /\b(util|helper|function|method)\b/i,
  config: /\b(config|setting|option|env)\b/i,
  test: /\b(test|spec|mock)\b/i,
};

export class TaskPlanner {
  private config: PlannerConfig;

  constructor(config: Partial<PlannerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Create a plan from a task description
   */
  plan(taskDescription: string): TaskPlan {
    const warnings: string[] = [];
    const requiredContext: string[] = [];

    // Analyze the task
    const taskType = this.detectTaskType(taskDescription);
    const scope = this.detectScope(taskDescription);
    const complexity = this.estimateComplexity(taskDescription, scope);

    // Check for ambiguous or risky tasks
    const riskAnalysis = this.analyzeRisks(taskDescription);
    warnings.push(...riskAnalysis.warnings);

    // Determine required context
    if (scope.includes('api')) {
      requiredContext.push('routes', 'contracts');
    }
    if (scope.includes('config') || taskDescription.toLowerCase().includes('env')) {
      requiredContext.push('env');
    }
    if (scope.includes('service') || scope.includes('model')) {
      requiredContext.push('auth');
    }

    // Break down into sub-tasks
    const tasks = this.breakdownTask(taskDescription, taskType, scope, complexity);

    // Determine execution order based on dependencies
    const executionOrder = this.determineExecutionOrder(tasks);

    // Calculate total complexity
    const totalComplexity = this.aggregateComplexity(tasks);

    return {
      originalTask: taskDescription,
      tasks,
      executionOrder,
      totalComplexity,
      warnings,
      requiredContext,
    };
  }

  private detectTaskType(description: string): Task['type'] {
    for (const [type, pattern] of Object.entries(TASK_PATTERNS)) {
      if (pattern.test(description)) {
        return type as Task['type'];
      }
    }
    return 'modify';
  }

  private detectScope(description: string): string[] {
    const scopes: string[] = [];
    
    for (const [scope, pattern] of Object.entries(SCOPE_PATTERNS)) {
      if (pattern.test(description)) {
        scopes.push(scope);
      }
    }

    return scopes.length > 0 ? scopes : ['general'];
  }

  private estimateComplexity(
    description: string, 
    scope: string[]
  ): Task['estimatedComplexity'] {
    let score = 0;

    if (description.length > 200) score += 2;
    else if (description.length > 100) score += 1;

    score += scope.length;

    const complexKeywords = [
      'multiple', 'all', 'entire', 'database', 'migration',
      'authentication', 'authorization', 'security', 'performance',
      'refactor', 'restructure', 'integration',
    ];

    for (const keyword of complexKeywords) {
      if (description.toLowerCase().includes(keyword)) {
        score += 1;
      }
    }

    if (score <= 1) return 'trivial';
    if (score <= 3) return 'simple';
    if (score <= 5) return 'moderate';
    return 'complex';
  }

  private analyzeRisks(description: string): { warnings: string[] } {
    const warnings: string[] = [];

    if (description.length < 20) {
      warnings.push('Task description is very short - consider adding more detail');
    }

    if (/\b(the|that|this)\s+(function|file|component|class)\b/i.test(description)) {
      warnings.push('Task contains ambiguous references - specify exact names');
    }

    if (/\b(all|every|entire)\s+(file|component|function)/i.test(description)) {
      warnings.push('Task scope is very broad - consider breaking into smaller tasks');
    }

    if (description.toLowerCase().includes('delete all') || description.toLowerCase().includes('drop')) {
      warnings.push('Task involves destructive operations - verify intent');
    }

    if ((description.match(/\band\b/gi) || []).length > 2) {
      warnings.push('Task may be doing too many things - consider splitting');
    }

    return { warnings };
  }

  private breakdownTask(
    description: string,
    taskType: Task['type'],
    scope: string[],
    complexity: Task['estimatedComplexity']
  ): Task[] {
    const tasks: Task[] = [];
    const taskId = () => `task-${tasks.length + 1}`;

    if (complexity === 'trivial' || complexity === 'simple') {
      tasks.push(this.createTask(taskId(), description, taskType, scope, []));
      return tasks;
    }

    if (taskType === 'create' || taskType === 'modify') {
      tasks.push(this.createTask(
        taskId(),
        `Analyze requirements and identify affected files for: ${description}`,
        'modify',
        scope,
        []
      ));
    }

    if (scope.includes('model') || scope.includes('api')) {
      tasks.push(this.createTask(
        taskId(),
        'Define or update type definitions and interfaces',
        taskType,
        ['model'],
        [tasks[tasks.length - 1]?.id].filter(Boolean)
      ));
    }

    tasks.push(this.createTask(
      taskId(),
      `Implement core changes: ${description}`,
      taskType,
      scope,
      tasks.map(t => t.id)
    ));

    if (scope.length > 1 || scope.includes('api') || scope.includes('service')) {
      tasks.push(this.createTask(
        taskId(),
        'Integrate changes and update imports/exports',
        'modify',
        scope,
        [tasks[tasks.length - 1].id]
      ));
    }

    if (this.config.includeTests && taskType !== 'test') {
      tasks.push(this.createTask(
        taskId(),
        'Add or update tests for the changes',
        'test',
        ['test'],
        [tasks[tasks.length - 1].id]
      ));
    }

    if (this.config.includeDocumentation) {
      tasks.push(this.createTask(
        taskId(),
        'Update documentation and comments',
        'document',
        ['general'],
        [tasks[tasks.length - 1].id]
      ));
    }

    return tasks.slice(0, this.config.maxTasksPerPlan);
  }

  private createTask(
    id: string,
    description: string,
    type: Task['type'],
    scope: string[],
    dependencies: string[]
  ): Task {
    const verificationPoints = this.generateVerificationPoints(type, scope);
    
    return {
      id,
      description,
      type,
      scope: {
        files: this.inferFiles(description, scope),
        modules: scope,
      },
      dependencies,
      verificationPoints,
      estimatedComplexity: this.estimateComplexity(description, scope),
    };
  }

  private generateVerificationPoints(
    type: Task['type'],
    scope: string[]
  ): VerificationPoint[] {
    const points: VerificationPoint[] = [];
    const pointId = () => `verify-${points.length + 1}`;

    points.push({
      id: pointId(),
      type: 'lint',
      description: 'Code passes linting',
      checkCommand: 'pnpm lint',
      expectedOutcome: 'No lint errors',
    });

    if (scope.includes('model') || scope.includes('api')) {
      points.push({
        id: pointId(),
        type: 'type',
        description: 'TypeScript compiles without errors',
        checkCommand: 'pnpm check-types',
        expectedOutcome: 'No type errors',
      });
    }

    if (type === 'create' || type === 'modify') {
      points.push({
        id: pointId(),
        type: 'import',
        description: 'All imports resolve to existing modules',
        expectedOutcome: 'No ghost imports',
      });
    }

    if (scope.includes('api')) {
      points.push({
        id: pointId(),
        type: 'api',
        description: 'API endpoints match truthpack routes',
        expectedOutcome: 'All routes exist in truthpack',
      });
    }

    if (scope.includes('config')) {
      points.push({
        id: pointId(),
        type: 'env',
        description: 'Environment variables are declared',
        expectedOutcome: 'All env vars in .env.example',
      });
    }

    if (type === 'test' || this.config.includeTests) {
      points.push({
        id: pointId(),
        type: 'test',
        description: 'Tests pass',
        checkCommand: 'pnpm test',
        expectedOutcome: 'All tests pass',
      });
    }

    return points;
  }

  private inferFiles(description: string, scope: string[]): string[] {
    const files: string[] = [];

    const filePatterns = [
      /`([^`]+\.(ts|tsx|js|jsx))`/g,
      /['"]([^'"]+\.(ts|tsx|js|jsx))['"]/g,
      /\b(\w+\.(?:ts|tsx|js|jsx))\b/g,
    ];

    for (const pattern of filePatterns) {
      let match;
      while ((match = pattern.exec(description)) !== null) {
        files.push(match[1]);
      }
    }

    const scopeToDir: Record<string, string> = {
      component: 'src/components/',
      service: 'src/services/',
      api: 'src/api/',
      model: 'src/types/',
      util: 'src/utils/',
      config: 'src/config/',
      test: '__tests__/',
    };

    for (const s of scope) {
      if (scopeToDir[s]) {
        files.push(`${scopeToDir[s]}**/*`);
      }
    }

    return [...new Set(files)];
  }

  private determineExecutionOrder(tasks: Task[]): string[] {
    const order: string[] = [];
    const remaining = new Set(tasks.map(t => t.id));
    const completed = new Set<string>();

    while (remaining.size > 0) {
      let progress = false;

      for (const task of tasks) {
        if (!remaining.has(task.id)) continue;

        const depsCompleted = task.dependencies.every(d => completed.has(d));
        
        if (depsCompleted) {
          order.push(task.id);
          completed.add(task.id);
          remaining.delete(task.id);
          progress = true;
        }
      }

      if (!progress && remaining.size > 0) {
        for (const id of remaining) {
          order.push(id);
        }
        break;
      }
    }

    return order;
  }

  private aggregateComplexity(tasks: Task[]): Task['estimatedComplexity'] {
    if (tasks.length === 0) return 'trivial';
    if (tasks.length <= 2) return 'simple';
    if (tasks.length <= 4) return 'moderate';
    return 'complex';
  }

  /**
   * Generate a prompt for a specific task
   */
  generateTaskPrompt(task: Task, truthpackContext?: Record<string, unknown>): string {
    const sections: string[] = [];

    sections.push(`## Task: ${task.description}`);
    sections.push('');
    sections.push(`**Type:** ${task.type}`);
    sections.push(`**Complexity:** ${task.estimatedComplexity}`);
    sections.push(`**Scope:** ${task.scope.modules.join(', ')}`);
    
    if (task.scope.files.length > 0) {
      sections.push(`**Files:** ${task.scope.files.join(', ')}`);
    }

    sections.push('');
    sections.push('### Verification Requirements');
    sections.push('');
    
    for (const point of task.verificationPoints) {
      sections.push(`- [ ] ${point.description}`);
      if (point.checkCommand) {
        sections.push(`      Command: \`${point.checkCommand}\``);
      }
    }

    if (truthpackContext && Object.keys(truthpackContext).length > 0) {
      sections.push('');
      sections.push('### Context from Truthpack');
      sections.push('');
      sections.push('```json');
      sections.push(JSON.stringify(truthpackContext, null, 2));
      sections.push('```');
    }

    return sections.join('\n');
  }
}
