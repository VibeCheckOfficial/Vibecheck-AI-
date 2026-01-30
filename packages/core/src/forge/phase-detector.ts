/**
 * Phase Detector - Self-Aware Forge Engine
 *
 * Detects the current project lifecycle phase using 8 weighted signals:
 * 1. File count (15%)
 * 2. Git history - commit frequency and age (15%)
 * 3. Test ratio - test files vs source files (15%)
 * 4. CI/CD presence (10%)
 * 5. Complexity score - average cyclomatic complexity (15%)
 * 6. Type coverage - % files with explicit types (10%)
 * 7. Documentation - README completeness, JSDoc (10%)
 * 8. Dependency age - how old are dependencies (10%)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import type {
  ProjectPhase,
  PhaseSignal,
  PhaseDetectionResult,
  PhaseDetectorConfig,
  ForgeContextMemory,
} from './types.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const SIGNAL_WEIGHTS = {
  fileCount: 0.15,
  gitHistory: 0.15,
  testRatio: 0.15,
  cicdPresence: 0.10,
  complexityScore: 0.15,
  typeCoverage: 0.10,
  documentation: 0.10,
  dependencyAge: 0.10,
} as const;

const IGNORED_DIRS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.nuxt',
  '.vibecheck',
  'coverage',
  '.turbo',
  '.cache',
];

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.vue', '.svelte'];
const TEST_PATTERNS = ['.test.', '.spec.', '__tests__', 'test/', 'tests/'];

// ============================================================================
// PHASE DETECTION
// ============================================================================

/**
 * Detect the current project phase
 */
export async function detectPhase(
  config: PhaseDetectorConfig,
  contextMemory?: ForgeContextMemory
): Promise<PhaseDetectionResult> {
  const signals: PhaseSignal[] = [];

  // Collect all signals in parallel where possible
  const [
    fileCountSignal,
    gitHistorySignal,
    testRatioSignal,
    cicdSignal,
    complexitySignal,
    typeCoverageSignal,
    docSignal,
    depAgeSignal,
  ] = await Promise.all([
    analyzeFileCount(config.projectPath),
    config.analyzeGitHistory ? analyzeGitHistory(config.projectPath) : createDefaultGitSignal(),
    analyzeTestRatio(config.projectPath),
    analyzeCICDPresence(config.projectPath),
    analyzeComplexity(config.projectPath),
    analyzeTypeCoverage(config.projectPath),
    analyzeDocumentation(config.projectPath),
    analyzeDependencyAge(config.projectPath),
  ]);

  signals.push(
    fileCountSignal,
    gitHistorySignal,
    testRatioSignal,
    cicdSignal,
    complexitySignal,
    typeCoverageSignal,
    docSignal,
    depAgeSignal
  );

  // Calculate phase scores
  const phaseScores = calculatePhaseScores(signals);

  // Determine phase with highest score
  const entries = Object.entries(phaseScores) as Array<[ProjectPhase, number]>;
  entries.sort((a, b) => b[1] - a[1]);
  const [detectedPhase, highestScore] = entries[0];

  // Calculate confidence
  const secondHighest = entries[1]?.[1] ?? 0;
  const confidence = calculateConfidence(highestScore, secondHighest, signals);

  // Check if phase changed
  const previousPhase = contextMemory?.currentPhase;
  const phaseChanged = previousPhase !== undefined && previousPhase !== detectedPhase;

  return {
    phase: detectedPhase,
    confidence,
    signals,
    phaseScores,
    detectedAt: new Date().toISOString(),
    phaseChanged,
    previousPhase: phaseChanged ? previousPhase : undefined,
  };
}

// ============================================================================
// SIGNAL ANALYZERS
// ============================================================================

/**
 * Signal 1: File Count (15%)
 * - < 20 files → scaffold
 * - 20-50 files → prototype
 * - 50-200 files → active-dev
 * - 200-500 files → stabilization/production
 * - > 500 files → maintenance
 */
async function analyzeFileCount(projectPath: string): Promise<PhaseSignal> {
  const count = countSourceFiles(projectPath);

  let score: number;
  let explanation: string;

  if (count < 20) {
    score = 10; // Points toward scaffold
    explanation = `Very few files (${count}) - early stage project`;
  } else if (count < 50) {
    score = 30; // Points toward prototype
    explanation = `Small project (${count} files) - likely prototype phase`;
  } else if (count < 200) {
    score = 60; // Points toward active-dev
    explanation = `Medium project (${count} files) - active development`;
  } else if (count < 500) {
    score = 80; // Points toward stabilization/production
    explanation = `Large project (${count} files) - mature codebase`;
  } else {
    score = 90; // Points toward maintenance
    explanation = `Very large project (${count} files) - likely maintenance mode`;
  }

  return {
    name: 'fileCount',
    weight: SIGNAL_WEIGHTS.fileCount,
    rawValue: count,
    score,
    explanation,
  };
}

/**
 * Signal 2: Git History (15%)
 * - Commit frequency and project age
 */
async function analyzeGitHistory(projectPath: string): Promise<PhaseSignal> {
  try {
    // Check if git repo exists
    const gitDir = path.join(projectPath, '.git');
    if (!fs.existsSync(gitDir)) {
      return createDefaultGitSignal();
    }

    // Get commit count
    const commitCount = parseInt(
      execSync('git rev-list --count HEAD', { cwd: projectPath, encoding: 'utf-8' }).trim(),
      10
    );

    // Get project age in days
    const firstCommitDate = execSync('git log --reverse --format=%ci | head -1', {
      cwd: projectPath,
      encoding: 'utf-8',
      shell: 'cmd.exe',
    }).trim();

    const projectAgeDays = firstCommitDate
      ? Math.floor((Date.now() - new Date(firstCommitDate).getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    // Get recent commit frequency (commits in last 30 days)
    const recentCommits = parseInt(
      execSync('git rev-list --count --since="30 days ago" HEAD', {
        cwd: projectPath,
        encoding: 'utf-8',
      }).trim(),
      10
    );

    // Calculate score based on maturity indicators
    let score: number;
    let explanation: string;

    const commitsPerDay = projectAgeDays > 0 ? commitCount / projectAgeDays : commitCount;
    const recentActivity = recentCommits / 30;

    if (commitCount < 10 || projectAgeDays < 7) {
      score = 15;
      explanation = `New project (${commitCount} commits, ${projectAgeDays} days old)`;
    } else if (commitCount < 50 && recentActivity > 1) {
      score = 35;
      explanation = `Active early development (${recentCommits} commits in last 30 days)`;
    } else if (recentActivity > 0.5) {
      score = 60;
      explanation = `Active development (avg ${commitsPerDay.toFixed(1)} commits/day)`;
    } else if (recentActivity > 0.1) {
      score = 75;
      explanation = `Stabilizing (${recentCommits} commits in last 30 days)`;
    } else {
      score = 90;
      explanation = `Low activity (${recentCommits} commits in last 30 days) - maintenance mode`;
    }

    return {
      name: 'gitHistory',
      weight: SIGNAL_WEIGHTS.gitHistory,
      rawValue: commitCount,
      score,
      explanation,
    };
  } catch {
    return createDefaultGitSignal();
  }
}

function createDefaultGitSignal(): PhaseSignal {
  return {
    name: 'gitHistory',
    weight: SIGNAL_WEIGHTS.gitHistory,
    rawValue: 0,
    score: 50, // Neutral
    explanation: 'Git history not available',
  };
}

/**
 * Signal 3: Test Ratio (15%)
 * - % of test files relative to source files
 */
async function analyzeTestRatio(projectPath: string): Promise<PhaseSignal> {
  const sourceFiles = countSourceFiles(projectPath);
  const testFiles = countTestFiles(projectPath);

  const ratio = sourceFiles > 0 ? testFiles / sourceFiles : 0;

  let score: number;
  let explanation: string;

  if (ratio < 0.05) {
    score = 20;
    explanation = `Very few tests (${testFiles}/${sourceFiles} = ${(ratio * 100).toFixed(1)}%)`;
  } else if (ratio < 0.15) {
    score = 40;
    explanation = `Some tests (${testFiles}/${sourceFiles} = ${(ratio * 100).toFixed(1)}%)`;
  } else if (ratio < 0.3) {
    score = 60;
    explanation = `Good test coverage (${testFiles}/${sourceFiles} = ${(ratio * 100).toFixed(1)}%)`;
  } else if (ratio < 0.5) {
    score = 80;
    explanation = `High test coverage (${testFiles}/${sourceFiles} = ${(ratio * 100).toFixed(1)}%)`;
  } else {
    score = 95;
    explanation = `Excellent test coverage (${testFiles}/${sourceFiles} = ${(ratio * 100).toFixed(1)}%)`;
  }

  return {
    name: 'testRatio',
    weight: SIGNAL_WEIGHTS.testRatio,
    rawValue: ratio,
    score,
    explanation,
  };
}

/**
 * Signal 4: CI/CD Presence (10%)
 * - Check for CI/CD configuration files
 */
async function analyzeCICDPresence(projectPath: string): Promise<PhaseSignal> {
  const cicdIndicators = [
    '.github/workflows',
    '.gitlab-ci.yml',
    'Jenkinsfile',
    '.circleci',
    'azure-pipelines.yml',
    'vercel.json',
    'netlify.toml',
    'railway.json',
    'fly.toml',
    'render.yaml',
    'Dockerfile',
    'docker-compose.yml',
    '.dockerignore',
  ];

  let foundCount = 0;
  const found: string[] = [];

  for (const indicator of cicdIndicators) {
    const fullPath = path.join(projectPath, indicator);
    if (fs.existsSync(fullPath)) {
      foundCount++;
      found.push(indicator);
    }
  }

  let score: number;
  let explanation: string;

  if (foundCount === 0) {
    score = 20;
    explanation = 'No CI/CD configuration found';
  } else if (foundCount === 1) {
    score = 50;
    explanation = `Basic CI/CD setup (${found.join(', ')})`;
  } else if (foundCount <= 3) {
    score = 75;
    explanation = `Good CI/CD setup (${found.join(', ')})`;
  } else {
    score = 95;
    explanation = `Comprehensive CI/CD (${foundCount} configurations)`;
  }

  return {
    name: 'cicdPresence',
    weight: SIGNAL_WEIGHTS.cicdPresence,
    rawValue: foundCount,
    score,
    explanation,
  };
}

/**
 * Signal 5: Complexity Score (15%)
 * - Estimate average complexity from file sizes and nesting
 */
async function analyzeComplexity(projectPath: string): Promise<PhaseSignal> {
  const complexityIndicators = estimateComplexity(projectPath);

  let score: number;
  let explanation: string;

  if (complexityIndicators.averageFileSize < 50) {
    score = 25;
    explanation = `Simple codebase (avg ${complexityIndicators.averageFileSize} lines/file)`;
  } else if (complexityIndicators.averageFileSize < 150) {
    score = 50;
    explanation = `Moderate complexity (avg ${complexityIndicators.averageFileSize} lines/file)`;
  } else if (complexityIndicators.averageFileSize < 300) {
    score = 70;
    explanation = `Growing complexity (avg ${complexityIndicators.averageFileSize} lines/file)`;
  } else {
    score = 85;
    explanation = `High complexity (avg ${complexityIndicators.averageFileSize} lines/file)`;
  }

  return {
    name: 'complexityScore',
    weight: SIGNAL_WEIGHTS.complexityScore,
    rawValue: complexityIndicators.averageFileSize,
    score,
    explanation,
  };
}

/**
 * Signal 6: Type Coverage (10%)
 * - % of files using TypeScript or JSDoc types
 */
async function analyzeTypeCoverage(projectPath: string): Promise<PhaseSignal> {
  const hasTypeScript = fs.existsSync(path.join(projectPath, 'tsconfig.json'));
  const tsFiles = countFilesByExtension(projectPath, ['.ts', '.tsx']);
  const jsFiles = countFilesByExtension(projectPath, ['.js', '.jsx']);
  const totalFiles = tsFiles + jsFiles;

  let score: number;
  let explanation: string;

  if (!hasTypeScript && tsFiles === 0) {
    score = 20;
    explanation = 'No TypeScript usage';
  } else if (tsFiles > 0 && totalFiles > 0) {
    const tsRatio = tsFiles / totalFiles;
    if (tsRatio > 0.9) {
      score = 95;
      explanation = `Full TypeScript (${(tsRatio * 100).toFixed(0)}% TS files)`;
    } else if (tsRatio > 0.5) {
      score = 70;
      explanation = `Mostly TypeScript (${(tsRatio * 100).toFixed(0)}% TS files)`;
    } else {
      score = 45;
      explanation = `Partial TypeScript (${(tsRatio * 100).toFixed(0)}% TS files)`;
    }
  } else {
    score = 30;
    explanation = 'TypeScript configured but no TS files found';
  }

  return {
    name: 'typeCoverage',
    weight: SIGNAL_WEIGHTS.typeCoverage,
    rawValue: tsFiles,
    score,
    explanation,
  };
}

/**
 * Signal 7: Documentation (10%)
 * - README presence and completeness
 */
async function analyzeDocumentation(projectPath: string): Promise<PhaseSignal> {
  const readmePath = path.join(projectPath, 'README.md');
  const hasReadme = fs.existsSync(readmePath);

  let score: number;
  let explanation: string;

  if (!hasReadme) {
    score = 10;
    explanation = 'No README found';
  } else {
    const content = fs.readFileSync(readmePath, 'utf-8');
    const lines = content.split('\n').length;
    const hasInstall = /install|setup|getting started/i.test(content);
    const hasUsage = /usage|how to|example/i.test(content);
    const hasApi = /api|reference|documentation/i.test(content);
    const hasContributing = /contribut/i.test(content);

    const docScore = [hasInstall, hasUsage, hasApi, hasContributing].filter(Boolean).length;

    if (lines < 20 && docScore < 2) {
      score = 30;
      explanation = 'Minimal README';
    } else if (docScore >= 3 || lines > 100) {
      score = 85;
      explanation = `Comprehensive README (${lines} lines, ${docScore}/4 sections)`;
    } else {
      score = 55;
      explanation = `Basic README (${lines} lines, ${docScore}/4 sections)`;
    }
  }

  return {
    name: 'documentation',
    weight: SIGNAL_WEIGHTS.documentation,
    rawValue: score,
    score,
    explanation,
  };
}

/**
 * Signal 8: Dependency Age (10%)
 * - How recent are the dependencies
 */
async function analyzeDependencyAge(projectPath: string): Promise<PhaseSignal> {
  const packageJsonPath = path.join(projectPath, 'package.json');

  if (!fs.existsSync(packageJsonPath)) {
    return {
      name: 'dependencyAge',
      weight: SIGNAL_WEIGHTS.dependencyAge,
      rawValue: 0,
      score: 50,
      explanation: 'No package.json found',
    };
  }

  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    const deps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    const depCount = Object.keys(deps).length;

    // Check for modern vs legacy patterns
    const modernIndicators = [
      'next',
      'react',
      'vue',
      'svelte',
      'vite',
      'vitest',
      'typescript',
      'tailwindcss',
      '@tanstack/react-query',
      'zod',
      'trpc',
    ];

    const legacyIndicators = [
      'jquery',
      'backbone',
      'angular',
      'grunt',
      'gulp',
      'bower',
      'moment',
    ];

    let modernCount = 0;
    let legacyCount = 0;

    for (const dep of Object.keys(deps)) {
      if (modernIndicators.some((m) => dep.includes(m))) modernCount++;
      if (legacyIndicators.some((l) => dep.includes(l))) legacyCount++;
    }

    let score: number;
    let explanation: string;

    if (legacyCount > modernCount) {
      score = 85; // Points toward maintenance
      explanation = `Legacy stack detected (${legacyCount} legacy, ${modernCount} modern deps)`;
    } else if (modernCount > 0 && legacyCount === 0) {
      score = 40; // Points toward active-dev
      explanation = `Modern stack (${modernCount} modern deps)`;
    } else {
      score = 60;
      explanation = `Mixed stack (${depCount} total dependencies)`;
    }

    return {
      name: 'dependencyAge',
      weight: SIGNAL_WEIGHTS.dependencyAge,
      rawValue: depCount,
      score,
      explanation,
    };
  } catch {
    return {
      name: 'dependencyAge',
      weight: SIGNAL_WEIGHTS.dependencyAge,
      rawValue: 0,
      score: 50,
      explanation: 'Could not parse package.json',
    };
  }
}

// ============================================================================
// PHASE SCORING
// ============================================================================

/**
 * Calculate phase scores from signals
 */
function calculatePhaseScores(signals: PhaseSignal[]): Record<ProjectPhase, number> {
  // Phase score matrices - how each signal score maps to phase likelihood
  const phaseMatrices: Record<ProjectPhase, (score: number) => number> = {
    scaffold: (score) => {
      // Low scores indicate scaffold phase
      if (score < 30) return 90;
      if (score < 50) return 60;
      if (score < 70) return 30;
      return 10;
    },
    prototype: (score) => {
      // Low-medium scores indicate prototype
      if (score < 20) return 70;
      if (score < 40) return 85;
      if (score < 60) return 60;
      return 20;
    },
    'active-dev': (score) => {
      // Medium scores indicate active development
      if (score < 30) return 30;
      if (score < 50) return 70;
      if (score < 70) return 90;
      if (score < 85) return 60;
      return 30;
    },
    stabilization: (score) => {
      // Medium-high scores indicate stabilization
      if (score < 40) return 20;
      if (score < 60) return 50;
      if (score < 80) return 85;
      return 70;
    },
    production: (score) => {
      // High scores indicate production
      if (score < 50) return 15;
      if (score < 70) return 40;
      if (score < 85) return 70;
      return 90;
    },
    maintenance: (score) => {
      // Very high scores or specific patterns indicate maintenance
      if (score < 60) return 10;
      if (score < 80) return 40;
      if (score < 90) return 70;
      return 85;
    },
  };

  const phases: ProjectPhase[] = [
    'scaffold',
    'prototype',
    'active-dev',
    'stabilization',
    'production',
    'maintenance',
  ];

  const scores: Record<ProjectPhase, number> = {
    scaffold: 0,
    prototype: 0,
    'active-dev': 0,
    stabilization: 0,
    production: 0,
    maintenance: 0,
  };

  // Calculate weighted scores for each phase
  for (const phase of phases) {
    let weightedSum = 0;
    for (const signal of signals) {
      const phaseScore = phaseMatrices[phase](signal.score);
      weightedSum += phaseScore * signal.weight;
    }
    scores[phase] = Math.round(weightedSum);
  }

  // Apply signal-specific phase boosts
  for (const signal of signals) {
    // File count specific adjustments
    if (signal.name === 'fileCount') {
      if (signal.rawValue < 20) scores.scaffold += 15;
      if (signal.rawValue > 300) scores.maintenance += 10;
    }

    // Test ratio specific adjustments
    if (signal.name === 'testRatio') {
      if (signal.rawValue > 0.3) {
        scores.stabilization += 10;
        scores.production += 15;
      }
      if (signal.rawValue < 0.1) {
        scores.prototype += 10;
      }
    }

    // CI/CD specific adjustments
    if (signal.name === 'cicdPresence') {
      if (signal.rawValue >= 2) {
        scores.production += 15;
        scores.stabilization += 10;
      }
    }

    // Dependency age specific adjustments
    if (signal.name === 'dependencyAge' && signal.score > 80) {
      scores.maintenance += 15;
    }
  }

  return scores;
}

/**
 * Calculate confidence based on score difference and signal consistency
 */
function calculateConfidence(
  highestScore: number,
  secondHighest: number,
  signals: PhaseSignal[]
): number {
  // Base confidence from score gap
  const scoreGap = highestScore - secondHighest;
  let confidence = Math.min(scoreGap / 30, 0.5); // Max 0.5 from score gap

  // Add confidence from signal consistency
  const scores = signals.map((s) => s.score);
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((sum, s) => sum + Math.pow(s - avgScore, 2), 0) / scores.length;
  const stdDev = Math.sqrt(variance);

  // Lower variance = higher confidence
  const consistencyBonus = Math.max(0, 0.3 - stdDev / 100);
  confidence += consistencyBonus;

  // Add confidence from high-weight signals agreement
  const highWeightSignals = signals.filter((s) => s.weight >= 0.15);
  const highWeightAvg =
    highWeightSignals.reduce((sum, s) => sum + s.score, 0) / highWeightSignals.length;
  if (Math.abs(highWeightAvg - avgScore) < 15) {
    confidence += 0.15;
  }

  return Math.min(Math.max(confidence, 0.1), 0.95);
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function countSourceFiles(projectPath: string): number {
  return countFilesRecursive(projectPath, SOURCE_EXTENSIONS, IGNORED_DIRS, false);
}

function countTestFiles(projectPath: string): number {
  return countFilesRecursive(projectPath, SOURCE_EXTENSIONS, IGNORED_DIRS, true);
}

function countFilesByExtension(projectPath: string, extensions: string[]): number {
  return countFilesRecursive(projectPath, extensions, IGNORED_DIRS, false);
}

function countFilesRecursive(
  dir: string,
  extensions: string[],
  ignoreDirs: string[],
  testOnly: boolean
): number {
  let count = 0;

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!ignoreDirs.includes(entry.name)) {
          count += countFilesRecursive(fullPath, extensions, ignoreDirs, testOnly);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (extensions.includes(ext)) {
          const isTest = TEST_PATTERNS.some((p) => fullPath.includes(p));
          if (testOnly ? isTest : !isTest) {
            count++;
          }
        }
      }
    }
  } catch {
    // Ignore permission errors
  }

  return count;
}

interface ComplexityIndicators {
  averageFileSize: number;
  largeFileCount: number;
  totalLines: number;
}

function estimateComplexity(projectPath: string): ComplexityIndicators {
  let totalLines = 0;
  let fileCount = 0;
  let largeFileCount = 0;

  function scan(dir: string): void {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory() && !IGNORED_DIRS.includes(entry.name)) {
          scan(fullPath);
        } else if (entry.isFile() && SOURCE_EXTENSIONS.includes(path.extname(entry.name))) {
          try {
            const content = fs.readFileSync(fullPath, 'utf-8');
            const lines = content.split('\n').length;
            totalLines += lines;
            fileCount++;
            if (lines > 300) largeFileCount++;
          } catch {
            // Skip unreadable files
          }
        }
      }
    } catch {
      // Ignore permission errors
    }
  }

  scan(projectPath);

  return {
    averageFileSize: fileCount > 0 ? Math.round(totalLines / fileCount) : 0,
    largeFileCount,
    totalLines,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  SIGNAL_WEIGHTS,
  analyzeFileCount,
  analyzeGitHistory,
  analyzeTestRatio,
  analyzeCICDPresence,
  analyzeComplexity,
  analyzeTypeCoverage,
  analyzeDocumentation,
  analyzeDependencyAge,
  calculatePhaseScores,
};
