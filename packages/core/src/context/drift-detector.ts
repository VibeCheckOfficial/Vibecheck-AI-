/**
 * Drift Detector
 * 
 * Detects drift between:
 * - Task intent and actual changes (task drift)
 * - Established patterns and new code (pattern drift)
 * - Truthpack and codebase state (truthpack drift)
 */

import * as fs from 'fs/promises';
import * as path from 'path';

export interface DriftReport {
  hasDrift: boolean;
  taskDrift: TaskDriftResult;
  patternDrift: PatternDriftResult;
  truthpackDrift: TruthpackDriftResult;
  severity: 'low' | 'medium' | 'high' | 'critical';
  recommendations: string[];
}

export interface TaskDriftResult {
  drifted: boolean;
  originalIntent: string;
  actualChanges: string[];
  driftIndicators: DriftIndicator[];
  driftPercent: number;
}

export interface PatternDriftResult {
  drifted: boolean;
  violations: PatternViolation[];
  newPatterns: string[];
  deprecatedPatterns: string[];
}

export interface TruthpackDriftResult {
  drifted: boolean;
  newRoutes: string[];
  removedRoutes: string[];
  newEnvVars: string[];
  removedEnvVars: string[];
  authChanges: string[];
}

export interface DriftIndicator {
  type: 'scope_expansion' | 'unrelated_change' | 'missing_change' | 'excessive_change';
  description: string;
  severity: 'low' | 'medium' | 'high';
  location?: string;
}

export interface PatternViolation {
  pattern: string;
  violation: string;
  file: string;
  suggestion: string;
}

export interface DriftConfig {
  projectRoot: string;
  truthpackPath: string;
  maxScopeExpansion: number;
  patternStrictness: 'loose' | 'moderate' | 'strict';
}

const DEFAULT_CONFIG: DriftConfig = {
  projectRoot: process.cwd(),
  truthpackPath: '.vibecheck/truthpack',
  maxScopeExpansion: 50,
  patternStrictness: 'moderate',
};

// Common patterns to check
const CODE_PATTERNS = {
  naming: {
    camelCase: /^[a-z][a-zA-Z0-9]*$/,
    PascalCase: /^[A-Z][a-zA-Z0-9]*$/,
    SCREAMING_SNAKE: /^[A-Z][A-Z0-9_]*$/,
  },
  imports: {
    namedExport: /export\s+(?:const|function|class|type|interface)\s+\w+/,
    defaultExport: /export\s+default/,
  },
  async: {
    asyncAwait: /async\s+\w+.*await/,
    thenCatch: /\.then\s*\(.*\.catch\s*\(/,
  },
};

export class DriftDetector {
  private config: DriftConfig;

  constructor(config: Partial<DriftConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Detect all types of drift
   */
  async detectDrift(
    originalIntent: string,
    changedFiles: Array<{ path: string; content: string; previousContent?: string }>
  ): Promise<DriftReport> {
    const [taskDrift, patternDrift, truthpackDrift] = await Promise.all([
      this.detectTaskDrift(originalIntent, changedFiles),
      this.detectPatternDrift(changedFiles),
      this.detectTruthpackDrift(changedFiles),
    ]);

    const hasDrift = taskDrift.drifted || patternDrift.drifted || truthpackDrift.drifted;
    const severity = this.calculateSeverity(taskDrift, patternDrift, truthpackDrift);
    const recommendations = this.generateRecommendations(taskDrift, patternDrift, truthpackDrift);

    return {
      hasDrift,
      taskDrift,
      patternDrift,
      truthpackDrift,
      severity,
      recommendations,
    };
  }

  /**
   * Detect task drift - changes that don't align with original intent
   */
  async detectTaskDrift(
    originalIntent: string,
    changedFiles: Array<{ path: string; content: string; previousContent?: string }>
  ): Promise<TaskDriftResult> {
    const driftIndicators: DriftIndicator[] = [];
    const actualChanges: string[] = [];

    // Extract intent keywords
    const intentKeywords = this.extractKeywords(originalIntent);
    
    // Analyze each changed file
    for (const file of changedFiles) {
      actualChanges.push(`Modified: ${file.path}`);

      // Check if file is relevant to intent
      const fileRelevance = this.calculateRelevance(file.path, intentKeywords);
      
      if (fileRelevance < 0.3) {
        driftIndicators.push({
          type: 'unrelated_change',
          description: `File "${file.path}" may not be related to the intended task`,
          severity: 'medium',
          location: file.path,
        });
      }

      // Check for scope expansion
      if (file.previousContent) {
        const changeSize = this.calculateChangeSize(file.previousContent, file.content);
        
        if (changeSize > this.config.maxScopeExpansion) {
          driftIndicators.push({
            type: 'excessive_change',
            description: `Change in "${file.path}" is ${changeSize}% larger than expected`,
            severity: changeSize > 100 ? 'high' : 'medium',
            location: file.path,
          });
        }
      }
    }

    // Check for missing expected changes
    const expectedFiles = this.inferExpectedFiles(originalIntent);
    for (const expected of expectedFiles) {
      const found = changedFiles.some(f => 
        f.path.includes(expected) || f.path.endsWith(expected)
      );
      
      if (!found) {
        driftIndicators.push({
          type: 'missing_change',
          description: `Expected change to "${expected}" based on intent`,
          severity: 'low',
        });
      }
    }

    // Check for scope expansion
    if (changedFiles.length > 5) {
      driftIndicators.push({
        type: 'scope_expansion',
        description: `${changedFiles.length} files changed - consider if all are necessary`,
        severity: changedFiles.length > 10 ? 'high' : 'medium',
      });
    }

    const driftPercent = driftIndicators.length > 0
      ? Math.min(100, driftIndicators.length * 20)
      : 0;

    return {
      drifted: driftIndicators.length > 0,
      originalIntent,
      actualChanges,
      driftIndicators,
      driftPercent,
    };
  }

  /**
   * Detect pattern drift - violations of established patterns
   */
  async detectPatternDrift(
    changedFiles: Array<{ path: string; content: string }>
  ): Promise<PatternDriftResult> {
    const violations: PatternViolation[] = [];
    const newPatterns: string[] = [];
    const deprecatedPatterns: string[] = [];

    for (const file of changedFiles) {
      // Check naming conventions
      const namingViolations = this.checkNamingPatterns(file.content, file.path);
      violations.push(...namingViolations);

      // Check import patterns
      const importViolations = this.checkImportPatterns(file.content, file.path);
      violations.push(...importViolations);

      // Check async patterns
      const asyncViolations = this.checkAsyncPatterns(file.content, file.path);
      violations.push(...asyncViolations);

      // Detect new patterns
      const detected = this.detectNewPatterns(file.content);
      newPatterns.push(...detected);
    }

    // Filter based on strictness
    const filteredViolations = this.filterByStrictness(violations);

    return {
      drifted: filteredViolations.length > 0,
      violations: filteredViolations,
      newPatterns: [...new Set(newPatterns)],
      deprecatedPatterns,
    };
  }

  /**
   * Detect truthpack drift - codebase changes that aren't reflected in truthpack
   */
  async detectTruthpackDrift(
    changedFiles: Array<{ path: string; content: string }>
  ): Promise<TruthpackDriftResult> {
    const newRoutes: string[] = [];
    const removedRoutes: string[] = [];
    const newEnvVars: string[] = [];
    const removedEnvVars: string[] = [];
    const authChanges: string[] = [];

    // Load current truthpack
    const truthpack = await this.loadTruthpack();

    for (const file of changedFiles) {
      // Check for new routes
      const routePatterns = [
        /app\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/gi,
        /router\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/gi,
      ];

      for (const pattern of routePatterns) {
        let match;
        while ((match = pattern.exec(file.content)) !== null) {
          const route = `${match[1].toUpperCase()} ${match[2]}`;
          
          if (truthpack.routes && !this.routeExists(truthpack.routes, match[1], match[2])) {
            newRoutes.push(route);
          }
        }
      }

      // Check for new env vars
      const envPattern = /process\.env\.(\w+)|import\.meta\.env\.(\w+)/g;
      let envMatch;
      while ((envMatch = envPattern.exec(file.content)) !== null) {
        const envVar = envMatch[1] || envMatch[2];
        
        if (truthpack.env && !this.envExists(truthpack.env, envVar)) {
          newEnvVars.push(envVar);
        }
      }

      // Check for auth changes
      const authPatterns = [
        /requireAuth|isAuthenticated|checkPermission|requireRole/g,
        /@Authorized|@RequireAuth|@Protected/g,
      ];

      for (const pattern of authPatterns) {
        if (pattern.test(file.content)) {
          authChanges.push(`Auth pattern found in ${file.path}`);
        }
      }
    }

    return {
      drifted: newRoutes.length > 0 || newEnvVars.length > 0,
      newRoutes: [...new Set(newRoutes)],
      removedRoutes,
      newEnvVars: [...new Set(newEnvVars)],
      removedEnvVars,
      authChanges: [...new Set(authChanges)],
    };
  }

  private extractKeywords(text: string): string[] {
    const words = text.toLowerCase().split(/\W+/);
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for']);
    return words.filter(w => w.length > 2 && !stopWords.has(w));
  }

  private calculateRelevance(filePath: string, keywords: string[]): number {
    const pathLower = filePath.toLowerCase();
    let matches = 0;
    
    for (const keyword of keywords) {
      if (pathLower.includes(keyword)) {
        matches++;
      }
    }

    return keywords.length > 0 ? matches / keywords.length : 1;
  }

  private calculateChangeSize(previous: string, current: string): number {
    const prevLines = previous.split('\n').length;
    const currLines = current.split('\n').length;
    
    if (prevLines === 0) return 100;
    return Math.abs(((currLines - prevLines) / prevLines) * 100);
  }

  private inferExpectedFiles(intent: string): string[] {
    const files: string[] = [];
    const lower = intent.toLowerCase();

    if (lower.includes('component')) files.push('component');
    if (lower.includes('service')) files.push('service');
    if (lower.includes('api') || lower.includes('route')) files.push('route', 'controller');
    if (lower.includes('test')) files.push('.test.', '.spec.');
    if (lower.includes('type') || lower.includes('interface')) files.push('types');

    return files;
  }

  private checkNamingPatterns(content: string, filePath: string): PatternViolation[] {
    const violations: PatternViolation[] = [];

    // Check for any type usage
    if (/:\s*any\b/.test(content)) {
      violations.push({
        pattern: 'no-any-type',
        violation: 'Uses "any" type',
        file: filePath,
        suggestion: 'Use specific types or "unknown"',
      });
    }

    return violations;
  }

  private checkImportPatterns(content: string, filePath: string): PatternViolation[] {
    const violations: PatternViolation[] = [];

    // Check for default exports (if convention is named exports)
    if (CODE_PATTERNS.imports.defaultExport.test(content)) {
      violations.push({
        pattern: 'named-exports',
        violation: 'Uses default export',
        file: filePath,
        suggestion: 'Use named exports for better refactoring support',
      });
    }

    return violations;
  }

  private checkAsyncPatterns(content: string, filePath: string): PatternViolation[] {
    const violations: PatternViolation[] = [];

    // Check for .then().catch() when async/await could be used
    if (CODE_PATTERNS.async.thenCatch.test(content) && !CODE_PATTERNS.async.asyncAwait.test(content)) {
      violations.push({
        pattern: 'async-await',
        violation: 'Uses .then().catch() instead of async/await',
        file: filePath,
        suggestion: 'Consider using async/await for better readability',
      });
    }

    return violations;
  }

  private detectNewPatterns(content: string): string[] {
    const patterns: string[] = [];

    if (/useQuery|useMutation/.test(content)) {
      patterns.push('react-query');
    }
    if (/createSlice|configureStore/.test(content)) {
      patterns.push('redux-toolkit');
    }
    if (/z\.object|z\.string/.test(content)) {
      patterns.push('zod');
    }

    return patterns;
  }

  private filterByStrictness(violations: PatternViolation[]): PatternViolation[] {
    if (this.config.patternStrictness === 'loose') {
      return violations.filter(v => v.pattern === 'no-any-type');
    }
    if (this.config.patternStrictness === 'moderate') {
      return violations;
    }
    // strict - return all
    return violations;
  }

  private async loadTruthpack(): Promise<{
    routes?: Array<{ method: string; path: string }>;
    env?: Array<{ name: string }>;
  }> {
    const result: {
      routes?: Array<{ method: string; path: string }>;
      env?: Array<{ name: string }>;
    } = {};

    try {
      const routesPath = path.join(this.config.projectRoot, this.config.truthpackPath, 'routes.json');
      const routesContent = await fs.readFile(routesPath, 'utf-8');
      const routesData = JSON.parse(routesContent);
      result.routes = routesData.routes;
    } catch {
      // Routes don't exist
    }

    try {
      const envPath = path.join(this.config.projectRoot, this.config.truthpackPath, 'env.json');
      const envContent = await fs.readFile(envPath, 'utf-8');
      const envData = JSON.parse(envContent);
      result.env = envData.variables;
    } catch {
      // Env doesn't exist
    }

    return result;
  }

  private routeExists(
    routes: Array<{ method: string; path: string }>,
    method: string,
    routePath: string
  ): boolean {
    return routes.some(r => 
      r.method.toLowerCase() === method.toLowerCase() &&
      r.path === routePath
    );
  }

  private envExists(env: Array<{ name: string }>, varName: string): boolean {
    return env.some(e => e.name === varName);
  }

  private calculateSeverity(
    taskDrift: TaskDriftResult,
    patternDrift: PatternDriftResult,
    truthpackDrift: TruthpackDriftResult
  ): 'low' | 'medium' | 'high' | 'critical' {
    let score = 0;

    // Task drift scoring
    if (taskDrift.driftPercent > 50) score += 3;
    else if (taskDrift.driftPercent > 25) score += 2;
    else if (taskDrift.driftPercent > 0) score += 1;

    // Pattern drift scoring
    score += patternDrift.violations.length;

    // Truthpack drift scoring
    score += truthpackDrift.newRoutes.length;
    score += truthpackDrift.newEnvVars.length;

    if (score >= 8) return 'critical';
    if (score >= 5) return 'high';
    if (score >= 2) return 'medium';
    return 'low';
  }

  private generateRecommendations(
    taskDrift: TaskDriftResult,
    patternDrift: PatternDriftResult,
    truthpackDrift: TruthpackDriftResult
  ): string[] {
    const recommendations: string[] = [];

    if (taskDrift.drifted) {
      recommendations.push('Review changes to ensure they align with original intent');
      
      for (const indicator of taskDrift.driftIndicators) {
        if (indicator.type === 'scope_expansion') {
          recommendations.push('Consider splitting this change into smaller, focused commits');
        }
        if (indicator.type === 'unrelated_change') {
          recommendations.push(`Verify "${indicator.location}" should be part of this change`);
        }
      }
    }

    if (patternDrift.drifted) {
      recommendations.push('Address pattern violations before committing');
      
      for (const violation of patternDrift.violations.slice(0, 3)) {
        recommendations.push(`${violation.file}: ${violation.suggestion}`);
      }
    }

    if (truthpackDrift.drifted) {
      if (truthpackDrift.newRoutes.length > 0) {
        recommendations.push(`Regenerate truthpack to include new routes: ${truthpackDrift.newRoutes.join(', ')}`);
      }
      if (truthpackDrift.newEnvVars.length > 0) {
        recommendations.push(`Add new env vars to .env.example: ${truthpackDrift.newEnvVars.join(', ')}`);
      }
    }

    if (recommendations.length === 0) {
      recommendations.push('No drift detected - changes align with intent and patterns');
    }

    return recommendations;
  }
}
