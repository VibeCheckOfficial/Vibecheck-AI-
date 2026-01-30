/**
 * Complexity Calculator - Self-Aware Forge Engine
 *
 * Calculates various complexity metrics:
 * - Cyclomatic complexity per function
 * - Cognitive complexity (nested complexity)
 * - Module coupling (imports between modules)
 * - Dependency depth
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ComplexityMetrics, FileASTAnalysis } from '../types.js';
import { analyzeFile } from './ast-analyzer.js';

// ============================================================================
// TYPES
// ============================================================================

export interface ModuleComplexity {
  /** File path */
  filePath: string;
  /** File-level complexity */
  fileComplexity: ComplexityMetrics;
  /** Function-level complexities */
  functionComplexities: Array<{
    name: string;
    cyclomatic: number;
    cognitive: number;
    loc: number;
  }>;
  /** Import count */
  importCount: number;
  /** Export count */
  exportCount: number;
  /** Coupling score (0-100) */
  coupling: number;
}

export interface ProjectComplexityReport {
  /** Total files analyzed */
  totalFiles: number;
  /** Average file complexity */
  averageComplexity: ComplexityMetrics;
  /** Files by complexity tier */
  complexityTiers: {
    low: string[];      // Complexity < 10
    medium: string[];   // 10-20
    high: string[];     // 20-50
    critical: string[]; // > 50
  };
  /** Most complex files */
  hotspots: Array<{
    filePath: string;
    complexity: number;
    reason: string;
  }>;
  /** Module coupling graph */
  couplingGraph: Map<string, string[]>;
  /** Overall health score (0-100) */
  healthScore: number;
}

// ============================================================================
// MODULE COMPLEXITY
// ============================================================================

/**
 * Calculate complexity for a single module
 */
export async function calculateModuleComplexity(filePath: string): Promise<ModuleComplexity | null> {
  const analysis = await analyzeFile(filePath);
  if (!analysis) return null;

  const functionComplexities = analysis.functions.map((f) => ({
    name: f.name,
    cyclomatic: f.cyclomaticComplexity,
    cognitive: f.cognitiveComplexity,
    loc: f.lineCount,
  }));

  // Calculate coupling based on imports
  const externalImports = analysis.imports.filter((i) => !i.isRelative).length;
  const internalImports = analysis.imports.filter((i) => i.isRelative).length;
  const totalImports = analysis.imports.length;

  // Coupling score: higher = more coupled
  // External deps are weighted less than internal coupling
  const coupling = Math.min(100, (internalImports * 10) + (externalImports * 2));

  return {
    filePath,
    fileComplexity: analysis.complexity,
    functionComplexities,
    importCount: totalImports,
    exportCount: analysis.exports.length,
    coupling,
  };
}

/**
 * Calculate complexity for multiple modules
 */
export async function calculateProjectComplexity(
  projectPath: string,
  fileList?: string[]
): Promise<ProjectComplexityReport> {
  const files = fileList ?? await collectSourceFiles(projectPath);

  const moduleComplexities: ModuleComplexity[] = [];

  for (const file of files) {
    const complexity = await calculateModuleComplexity(file);
    if (complexity) {
      moduleComplexities.push(complexity);
    }
  }

  return generateComplexityReport(moduleComplexities);
}

// ============================================================================
// COMPLEXITY REPORT
// ============================================================================

/**
 * Generate complexity report from module analyses
 */
function generateComplexityReport(modules: ModuleComplexity[]): ProjectComplexityReport {
  if (modules.length === 0) {
    return createEmptyReport();
  }

  // Calculate averages
  const totalCyclomatic = modules.reduce((sum, m) => sum + m.fileComplexity.cyclomatic, 0);
  const totalCognitive = modules.reduce((sum, m) => sum + m.fileComplexity.cognitive, 0);
  const totalLoc = modules.reduce((sum, m) => sum + m.fileComplexity.loc, 0);
  const totalLloc = modules.reduce((sum, m) => sum + m.fileComplexity.lloc, 0);
  const totalDepth = modules.reduce((sum, m) => sum + m.fileComplexity.maxNestingDepth, 0);

  const averageComplexity: ComplexityMetrics = {
    cyclomatic: Math.round(totalCyclomatic / modules.length),
    cognitive: Math.round(totalCognitive / modules.length),
    loc: Math.round(totalLoc / modules.length),
    lloc: Math.round(totalLloc / modules.length),
    maxNestingDepth: Math.round(totalDepth / modules.length),
  };

  // Categorize by complexity
  const complexityTiers = {
    low: [] as string[],
    medium: [] as string[],
    high: [] as string[],
    critical: [] as string[],
  };

  for (const module of modules) {
    const score = module.fileComplexity.cyclomatic + (module.fileComplexity.cognitive / 2);

    if (score < 10) {
      complexityTiers.low.push(module.filePath);
    } else if (score < 20) {
      complexityTiers.medium.push(module.filePath);
    } else if (score < 50) {
      complexityTiers.high.push(module.filePath);
    } else {
      complexityTiers.critical.push(module.filePath);
    }
  }

  // Find hotspots
  const hotspots = modules
    .map((m) => {
      const score = m.fileComplexity.cyclomatic + (m.fileComplexity.cognitive / 2);
      let reason = '';

      if (m.fileComplexity.cyclomatic > 30) {
        reason = 'High cyclomatic complexity';
      } else if (m.fileComplexity.cognitive > 50) {
        reason = 'High cognitive complexity';
      } else if (m.fileComplexity.maxNestingDepth > 5) {
        reason = 'Deep nesting';
      } else if (m.fileComplexity.loc > 500) {
        reason = 'Large file';
      } else if (m.coupling > 50) {
        reason = 'High coupling';
      }

      return {
        filePath: m.filePath,
        complexity: score,
        reason,
      };
    })
    .filter((h) => h.complexity > 20 || h.reason)
    .sort((a, b) => b.complexity - a.complexity)
    .slice(0, 10);

  // Build coupling graph
  const couplingGraph = new Map<string, string[]>();

  // Calculate health score
  const lowRatio = complexityTiers.low.length / modules.length;
  const criticalRatio = complexityTiers.critical.length / modules.length;
  const avgCoupling = modules.reduce((sum, m) => sum + m.coupling, 0) / modules.length;

  // Health score: 100 = perfect, 0 = terrible
  let healthScore = 100;
  healthScore -= (1 - lowRatio) * 30; // Penalize for non-simple files
  healthScore -= criticalRatio * 40; // Heavy penalty for critical files
  healthScore -= avgCoupling / 2; // Penalize for coupling
  healthScore -= (averageComplexity.maxNestingDepth - 2) * 5; // Penalize deep nesting
  healthScore = Math.max(0, Math.min(100, Math.round(healthScore)));

  return {
    totalFiles: modules.length,
    averageComplexity,
    complexityTiers,
    hotspots,
    couplingGraph,
    healthScore,
  };
}

/**
 * Create empty report
 */
function createEmptyReport(): ProjectComplexityReport {
  return {
    totalFiles: 0,
    averageComplexity: {
      cyclomatic: 0,
      cognitive: 0,
      loc: 0,
      lloc: 0,
      maxNestingDepth: 0,
    },
    complexityTiers: { low: [], medium: [], high: [], critical: [] },
    hotspots: [],
    couplingGraph: new Map(),
    healthScore: 100,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const IGNORED_DIRS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.nuxt',
  '.vibecheck',
  'coverage',
];

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

/**
 * Collect source files from a project
 */
async function collectSourceFiles(projectPath: string): Promise<string[]> {
  const files: string[] = [];

  function scan(dir: string): void {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory() && !IGNORED_DIRS.includes(entry.name)) {
          scan(fullPath);
        } else if (entry.isFile() && SOURCE_EXTENSIONS.includes(path.extname(entry.name))) {
          files.push(fullPath);
        }
      }
    } catch {
      // Ignore permission errors
    }
  }

  scan(projectPath);
  return files;
}

// ============================================================================
// COMPLEXITY THRESHOLDS
// ============================================================================

export const COMPLEXITY_THRESHOLDS = {
  cyclomatic: {
    good: 10,
    warning: 20,
    critical: 40,
  },
  cognitive: {
    good: 15,
    warning: 30,
    critical: 60,
  },
  nesting: {
    good: 3,
    warning: 5,
    critical: 7,
  },
  loc: {
    good: 200,
    warning: 400,
    critical: 800,
  },
  coupling: {
    good: 20,
    warning: 40,
    critical: 70,
  },
};

/**
 * Get complexity level for a metric
 */
export function getComplexityLevel(
  metric: keyof typeof COMPLEXITY_THRESHOLDS,
  value: number
): 'good' | 'warning' | 'critical' {
  const thresholds = COMPLEXITY_THRESHOLDS[metric];

  if (value <= thresholds.good) return 'good';
  if (value <= thresholds.warning) return 'warning';
  return 'critical';
}

/**
 * Get recommendations for reducing complexity
 */
export function getComplexityRecommendations(module: ModuleComplexity): string[] {
  const recommendations: string[] = [];

  if (module.fileComplexity.cyclomatic > COMPLEXITY_THRESHOLDS.cyclomatic.warning) {
    recommendations.push('Consider breaking down complex functions into smaller, focused functions');
  }

  if (module.fileComplexity.cognitive > COMPLEXITY_THRESHOLDS.cognitive.warning) {
    recommendations.push('Reduce nested conditionals by using early returns or guard clauses');
  }

  if (module.fileComplexity.maxNestingDepth > COMPLEXITY_THRESHOLDS.nesting.warning) {
    recommendations.push('Extract nested logic into separate functions to reduce nesting depth');
  }

  if (module.fileComplexity.loc > COMPLEXITY_THRESHOLDS.loc.warning) {
    recommendations.push('Consider splitting this file into multiple modules based on responsibility');
  }

  if (module.coupling > COMPLEXITY_THRESHOLDS.coupling.warning) {
    recommendations.push('Reduce internal dependencies by using dependency injection or shared modules');
  }

  // Check individual functions
  const complexFunctions = module.functionComplexities.filter(
    (f) => f.cyclomatic > COMPLEXITY_THRESHOLDS.cyclomatic.warning
  );

  if (complexFunctions.length > 0) {
    recommendations.push(
      `Functions needing refactoring: ${complexFunctions.map((f) => f.name).join(', ')}`
    );
  }

  return recommendations;
}
