/**
 * Semantic Context Analyzer
 *
 * Understands what a file DOES, not just what it contains.
 * This enables context-aware analysis where findings can be
 * adjusted based on file purpose and sensitivity.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';
import { Cache } from '../utils/cache.js';
import { getLogger, type Logger } from '../utils/logger.js';
import type { Finding, FindingSeverity } from '@repo/shared-types';
import type {
  FileContext,
  FilePurpose,
  FileSensitivity,
  FileType,
  SemanticAnalysisResult,
  ProjectInsight,
} from './types.js';

interface AnalyzerConfig {
  cacheTtlMs: number;
  maxFileSize: number;
  includeImports: boolean;
  includeExports: boolean;
}

const DEFAULT_CONFIG: AnalyzerConfig = {
  cacheTtlMs: 5 * 60 * 1000, // 5 minutes
  maxFileSize: 500 * 1024, // 500KB
  includeImports: true,
  includeExports: true,
};

// Pattern definitions for file type detection
const FILE_TYPE_PATTERNS: Array<{
  type: FileType;
  patterns: Array<{
    match: 'path' | 'content' | 'both';
    pathPattern?: RegExp;
    contentPatterns?: RegExp[];
    weight: number;
  }>;
}> = [
  {
    type: 'component',
    patterns: [
      { match: 'path', pathPattern: /components?\/.*\.(tsx|jsx)$/, weight: 0.9 },
      { match: 'content', contentPatterns: [/export\s+(default\s+)?function\s+[A-Z]/, /React\.FC/, /<[A-Z][a-zA-Z]+/], weight: 0.8 },
      { match: 'path', pathPattern: /\.tsx$/, weight: 0.5 },
    ],
  },
  {
    type: 'hook',
    patterns: [
      { match: 'path', pathPattern: /hooks?\/use[A-Z]/, weight: 0.95 },
      { match: 'content', contentPatterns: [/export\s+(const|function)\s+use[A-Z]/, /useState|useEffect|useMemo|useCallback/], weight: 0.85 },
    ],
  },
  {
    type: 'page',
    patterns: [
      { match: 'path', pathPattern: /pages?\/.*\.(tsx|jsx|ts|js)$/, weight: 0.9 },
      { match: 'path', pathPattern: /app\/.*\/page\.(tsx|jsx|ts|js)$/, weight: 0.95 },
      { match: 'path', pathPattern: /routes?\/.*\.(tsx|jsx)$/, weight: 0.85 },
    ],
  },
  {
    type: 'api',
    patterns: [
      { match: 'path', pathPattern: /api\/.*\.(ts|js)$/, weight: 0.9 },
      { match: 'path', pathPattern: /routes?\/.*\.(ts|js)$/, weight: 0.7 },
      { match: 'content', contentPatterns: [/app\.(get|post|put|patch|delete)\(/, /router\.(get|post|put|patch|delete)\(/], weight: 0.85 },
      { match: 'content', contentPatterns: [/export\s+(async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)/], weight: 0.95 },
    ],
  },
  {
    type: 'middleware',
    patterns: [
      { match: 'path', pathPattern: /middleware\.(ts|js)$/, weight: 0.95 },
      { match: 'path', pathPattern: /middlewares?\//, weight: 0.85 },
      { match: 'content', contentPatterns: [/NextRequest|NextResponse/, /req,\s*res,\s*next/], weight: 0.7 },
    ],
  },
  {
    type: 'service',
    patterns: [
      { match: 'path', pathPattern: /services?\//, weight: 0.9 },
      { match: 'path', pathPattern: /Service\.(ts|js)$/, weight: 0.85 },
      { match: 'content', contentPatterns: [/class\s+\w+Service/, /export\s+const\s+\w+Service/], weight: 0.8 },
    ],
  },
  {
    type: 'repository',
    patterns: [
      { match: 'path', pathPattern: /repositor(y|ies)\//, weight: 0.95 },
      { match: 'path', pathPattern: /Repository\.(ts|js)$/, weight: 0.9 },
      { match: 'path', pathPattern: /dal\/|data-access\//, weight: 0.85 },
    ],
  },
  {
    type: 'utility',
    patterns: [
      { match: 'path', pathPattern: /utils?\//, weight: 0.85 },
      { match: 'path', pathPattern: /helpers?\//, weight: 0.85 },
      { match: 'path', pathPattern: /lib\//, weight: 0.7 },
    ],
  },
  {
    type: 'config',
    patterns: [
      { match: 'path', pathPattern: /\.config\.(ts|js|mjs|cjs)$/, weight: 0.95 },
      { match: 'path', pathPattern: /config\//, weight: 0.85 },
      { match: 'path', pathPattern: /\.(env|json|yaml|yml)$/, weight: 0.8 },
    ],
  },
  {
    type: 'test',
    patterns: [
      { match: 'path', pathPattern: /\.(test|spec)\.(ts|tsx|js|jsx)$/, weight: 0.95 },
      { match: 'path', pathPattern: /__tests__\//, weight: 0.95 },
      { match: 'content', contentPatterns: [/describe\(|it\(|test\(|expect\(/], weight: 0.9 },
    ],
  },
  {
    type: 'type',
    patterns: [
      { match: 'path', pathPattern: /\.d\.ts$/, weight: 0.95 },
      { match: 'path', pathPattern: /types?\//, weight: 0.85 },
      { match: 'path', pathPattern: /\.types?\.(ts|js)$/, weight: 0.9 },
      { match: 'content', contentPatterns: [/^(export\s+)?(interface|type)\s+\w+/m], weight: 0.7 },
    ],
  },
  {
    type: 'constant',
    patterns: [
      { match: 'path', pathPattern: /constants?\//, weight: 0.9 },
      { match: 'path', pathPattern: /\.constants?\.(ts|js)$/, weight: 0.9 },
      { match: 'content', contentPatterns: [/export\s+const\s+[A-Z_]+\s*=/], weight: 0.7 },
    ],
  },
  {
    type: 'style',
    patterns: [
      { match: 'path', pathPattern: /\.(css|scss|sass|less|styled)\.(ts|js)?$/, weight: 0.95 },
      { match: 'path', pathPattern: /styles?\//, weight: 0.85 },
    ],
  },
];

// Purpose detection patterns
const PURPOSE_PATTERNS: Array<{
  purpose: FilePurpose;
  contentPatterns: RegExp[];
  pathPatterns?: RegExp[];
  weight: number;
}> = [
  {
    purpose: 'authentication',
    contentPatterns: [/signIn|signOut|login|logout|authenticate|session|jwt|token|password/i],
    pathPatterns: [/auth/i],
    weight: 0.9,
  },
  {
    purpose: 'authorization',
    contentPatterns: [/permission|role|access|authorize|can[A-Z]|isAllowed|hasPermission/i],
    pathPatterns: [/rbac|acl|permission/i],
    weight: 0.9,
  },
  {
    purpose: 'data-fetching',
    contentPatterns: [/fetch\(|axios\.|useSWR|useQuery|getServerSideProps|getStaticProps/],
    weight: 0.85,
  },
  {
    purpose: 'data-mutation',
    contentPatterns: [/useMutation|\.post\(|\.put\(|\.patch\(|\.delete\(|create|update|delete|remove/i],
    weight: 0.8,
  },
  {
    purpose: 'state-management',
    contentPatterns: [/createStore|useReducer|createSlice|atom|selector|zustand|jotai|recoil/i],
    pathPatterns: [/store|state/i],
    weight: 0.85,
  },
  {
    purpose: 'form-handling',
    contentPatterns: [/useForm|handleSubmit|onSubmit|formik|react-hook-form|validation/i],
    weight: 0.85,
  },
  {
    purpose: 'validation',
    contentPatterns: [/zod|yup|joi|validate|schema|parse/i],
    pathPatterns: [/validation|validator|schema/i],
    weight: 0.85,
  },
  {
    purpose: 'error-handling',
    contentPatterns: [/ErrorBoundary|catch\s*\(|try\s*{|\.catch\(|onError|handleError/],
    pathPatterns: [/error/i],
    weight: 0.8,
  },
  {
    purpose: 'logging',
    contentPatterns: [/logger\.|console\.|winston|pino|bunyan|log\(/i],
    pathPatterns: [/log/i],
    weight: 0.8,
  },
  {
    purpose: 'caching',
    contentPatterns: [/cache|redis|memcache|lru|ttl/i],
    pathPatterns: [/cache/i],
    weight: 0.85,
  },
  {
    purpose: 'ui-rendering',
    contentPatterns: [/return\s*\(?\s*</],
    weight: 0.6,
  },
  {
    purpose: 'navigation',
    contentPatterns: [/useRouter|useNavigate|Link|navigate\(|push\(|redirect/i],
    pathPatterns: [/navigation|router/i],
    weight: 0.8,
  },
  {
    purpose: 'integration',
    contentPatterns: [/api\.|webhook|integration|third.?party/i],
    pathPatterns: [/integration/i],
    weight: 0.8,
  },
];

// Sensitivity indicators
const SENSITIVITY_INDICATORS = {
  critical: [
    /password|secret|key|token|credential|private/i,
    /encrypt|decrypt|hash|salt/i,
    /payment|billing|stripe|paypal/i,
    /admin|superuser|root/i,
  ],
  high: [
    /auth|session|permission|role/i,
    /user|account|profile/i,
    /database|db|sql|query/i,
    /api\/.*\.(ts|js)$/,
  ],
  medium: [
    /config|setting|option/i,
    /service|repository/i,
    /middleware/i,
  ],
};

/**
 * Semantic Context Analyzer
 */
export class SemanticContextAnalyzer {
  private config: AnalyzerConfig;
  private projectRoot: string;
  private contextCache: Cache<FileContext>;
  private logger: Logger;

  constructor(projectRoot: string, config: Partial<AnalyzerConfig> = {}) {
    this.projectRoot = projectRoot;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.contextCache = new Cache<FileContext>({
      maxSize: 500,
      defaultTtlMs: this.config.cacheTtlMs,
    });
    this.logger = getLogger('semantic-context');
  }

  /**
   * Analyze a file and determine its context
   */
  async analyzeFile(filePath: string): Promise<FileContext> {
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.join(this.projectRoot, filePath);
    const relativePath = path.relative(this.projectRoot, absolutePath);

    // Check cache
    const cached = this.contextCache.get(relativePath);
    if (cached) {
      return cached;
    }

    let content = '';
    let stat: { mtime: Date } | null = null;

    try {
      stat = await fs.stat(absolutePath);

      if (stat && (stat as unknown as { size: number }).size <= this.config.maxFileSize) {
        content = await fs.readFile(absolutePath, 'utf-8');
      }
    } catch {
      // File doesn't exist or can't be read
    }

    const fileType = this.inferFileType(relativePath, content);
    const purpose = this.inferPurpose(relativePath, content);
    const sensitivity = this.inferSensitivity(relativePath, content);

    const context: FileContext = {
      filePath: relativePath,
      fileType,
      purpose,
      sensitivity,
      dependencies: this.config.includeImports ? this.extractImports(content) : [],
      exports: this.config.includeExports ? this.extractExports(content) : [],
      imports: this.config.includeImports ? this.extractImports(content) : [],
      hasTests: await this.checkHasTests(relativePath),
      complexity: this.estimateComplexity(content),
      lastModified: stat?.mtime ?? new Date(),
      analyzedAt: new Date(),
    };

    this.contextCache.set(relativePath, context);
    return context;
  }

  /**
   * Analyze multiple files
   */
  async analyzeFiles(filePaths: string[]): Promise<Map<string, FileContext>> {
    const results = new Map<string, FileContext>();

    for (const filePath of filePaths) {
      try {
        const context = await this.analyzeFile(filePath);
        results.set(filePath, context);
      } catch (error) {
        this.logger.warn('Failed to analyze file', {
          file: filePath,
          error: error instanceof Error ? error.message : 'Unknown',
        });
      }
    }

    return results;
  }

  /**
   * Adjust finding severity based on file context
   */
  adjustFindingSeverity(
    finding: {
      severity: FindingSeverity;
      type: string;
      file: string | null;
      message?: string;
    },
    context: FileContext
  ): { severity: FindingSeverity; reason?: string } {
    let adjustedSeverity = finding.severity;
    let reason: string | undefined;

    // Test file: lower severity for most findings
    if (context.fileType === 'test') {
      if (finding.type === 'ghost_env' || finding.type === 'secret') {
        adjustedSeverity = 'info';
        reason = 'Test file context - likely mock data';
      }
    }

    // Config file: secrets are critical
    if (context.fileType === 'config' && finding.type === 'secret') {
      adjustedSeverity = 'error';
      reason = 'Secret in configuration file is critical';
    }

    // API route without auth: escalate
    if (
      context.fileType === 'api' &&
      context.purpose === 'data-mutation' &&
      finding.type === 'auth_drift'
    ) {
      adjustedSeverity = 'error';
      reason = 'Unprotected mutation endpoint is critical';
    }

    // Critical sensitivity: escalate warnings
    if (context.sensitivity === 'critical' && finding.severity === 'warning') {
      adjustedSeverity = 'error';
      reason = `File handles sensitive data (${context.purpose})`;
    }

    // Style files: lower severity for most code issues
    if (context.fileType === 'style') {
      adjustedSeverity = 'info';
      reason = 'Style file context';
    }

    return { severity: adjustedSeverity, reason };
  }

  /**
   * Get project-wide insights
   */
  async getProjectInsights(
    analyzedFiles: Map<string, FileContext>
  ): Promise<ProjectInsight[]> {
    const insights: ProjectInsight[] = [];

    // Group files by type
    const byType = new Map<FileType, FileContext[]>();
    for (const context of analyzedFiles.values()) {
      const list = byType.get(context.fileType) ?? [];
      list.push(context);
      byType.set(context.fileType, list);
    }

    // Check for untested critical files
    const criticalFiles = Array.from(analyzedFiles.values()).filter(
      (f) => f.sensitivity === 'critical' || f.sensitivity === 'high'
    );
    const untestedCritical = criticalFiles.filter((f) => !f.hasTests);

    if (untestedCritical.length > 0) {
      insights.push({
        type: 'risk',
        title: 'Untested Critical Files',
        description: `${untestedCritical.length} critical/high sensitivity files have no associated tests`,
        severity: 'warning',
        affectedFiles: untestedCritical.map((f) => f.filePath),
        suggestedAction: 'Add tests for these critical files',
        confidence: 0.9,
      });
    }

    // Check for high complexity files
    const highComplexity = Array.from(analyzedFiles.values()).filter(
      (f) => f.complexity && f.complexity > 50
    );

    if (highComplexity.length > 0) {
      insights.push({
        type: 'improvement',
        title: 'High Complexity Files',
        description: `${highComplexity.length} files have high cyclomatic complexity`,
        severity: 'info',
        affectedFiles: highComplexity.map((f) => f.filePath),
        suggestedAction: 'Consider refactoring to reduce complexity',
        confidence: 0.8,
      });
    }

    // Check for auth files without tests
    const authFiles = Array.from(analyzedFiles.values()).filter(
      (f) => f.purpose === 'authentication' || f.purpose === 'authorization'
    );
    const untestedAuth = authFiles.filter((f) => !f.hasTests);

    if (untestedAuth.length > 0) {
      insights.push({
        type: 'risk',
        title: 'Untested Authentication Code',
        description: `${untestedAuth.length} auth-related files have no tests`,
        severity: 'critical',
        affectedFiles: untestedAuth.map((f) => f.filePath),
        suggestedAction: 'Add comprehensive tests for authentication logic',
        confidence: 0.95,
      });
    }

    return insights;
  }

  /**
   * Clear context cache
   */
  clearCache(): void {
    this.contextCache.clear();
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.contextCache.dispose();
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private inferFileType(filePath: string, content: string): FileType {
    let bestMatch: { type: FileType; score: number } = { type: 'unknown', score: 0 };

    for (const { type, patterns } of FILE_TYPE_PATTERNS) {
      let score = 0;

      for (const pattern of patterns) {
        if (pattern.match === 'path' && pattern.pathPattern) {
          if (pattern.pathPattern.test(filePath)) {
            score += pattern.weight;
          }
        } else if (pattern.match === 'content' && pattern.contentPatterns && content) {
          for (const cp of pattern.contentPatterns) {
            if (cp.test(content)) {
              score += pattern.weight / pattern.contentPatterns.length;
            }
          }
        }
      }

      if (score > bestMatch.score) {
        bestMatch = { type, score };
      }
    }

    return bestMatch.type;
  }

  private inferPurpose(filePath: string, content: string): FilePurpose {
    let bestMatch: { purpose: FilePurpose; score: number } = { purpose: 'unknown', score: 0 };

    for (const { purpose, contentPatterns, pathPatterns, weight } of PURPOSE_PATTERNS) {
      let score = 0;

      // Check path patterns
      if (pathPatterns) {
        for (const pp of pathPatterns) {
          if (pp.test(filePath)) {
            score += weight * 0.4;
          }
        }
      }

      // Check content patterns
      if (content) {
        for (const cp of contentPatterns) {
          if (cp.test(content)) {
            score += weight * 0.6 / contentPatterns.length;
          }
        }
      }

      if (score > bestMatch.score) {
        bestMatch = { purpose, score };
      }
    }

    return bestMatch.purpose;
  }

  private inferSensitivity(filePath: string, content: string): FileSensitivity {
    const combined = `${filePath}\n${content}`;

    for (const pattern of SENSITIVITY_INDICATORS.critical) {
      if (pattern.test(combined)) {
        return 'critical';
      }
    }

    for (const pattern of SENSITIVITY_INDICATORS.high) {
      if (pattern.test(combined)) {
        return 'high';
      }
    }

    for (const pattern of SENSITIVITY_INDICATORS.medium) {
      if (pattern.test(combined)) {
        return 'medium';
      }
    }

    return 'low';
  }

  private extractImports(content: string): string[] {
    const imports: string[] = [];
    const importRegex = /import\s+(?:{[^}]+}|\*\s+as\s+\w+|\w+)\s+from\s+['"]([^'"]+)['"]/g;

    let match;
    while ((match = importRegex.exec(content)) !== null) {
      imports.push(match[1]);
    }

    // Also check require statements
    const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((match = requireRegex.exec(content)) !== null) {
      imports.push(match[1]);
    }

    return [...new Set(imports)];
  }

  private extractExports(content: string): string[] {
    const exports: string[] = [];

    // Named exports
    const namedExportRegex = /export\s+(?:const|let|var|function|class|interface|type|enum)\s+(\w+)/g;
    let match;
    while ((match = namedExportRegex.exec(content)) !== null) {
      exports.push(match[1]);
    }

    // Export { ... }
    const exportBraceRegex = /export\s+\{([^}]+)\}/g;
    while ((match = exportBraceRegex.exec(content)) !== null) {
      const names = match[1].split(',').map((n) => n.trim().split(/\s+as\s+/)[0].trim());
      exports.push(...names.filter(Boolean));
    }

    // Default export
    if (/export\s+default\s+/.test(content)) {
      exports.push('default');
    }

    return [...new Set(exports)];
  }

  private async checkHasTests(filePath: string): Promise<boolean> {
    // Skip if already a test file
    if (/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(filePath)) {
      return true;
    }

    const basename = path.basename(filePath, path.extname(filePath));
    const dir = path.dirname(filePath);
    const ext = path.extname(filePath);

    // Check common test file patterns
    const testPatterns = [
      path.join(dir, `${basename}.test${ext}`),
      path.join(dir, `${basename}.spec${ext}`),
      path.join(dir, '__tests__', `${basename}${ext}`),
      path.join(dir, '__tests__', `${basename}.test${ext}`),
    ];

    for (const testPath of testPatterns) {
      try {
        await fs.access(path.join(this.projectRoot, testPath));
        return true;
      } catch {
        continue;
      }
    }

    return false;
  }

  private estimateComplexity(content: string): number {
    if (!content) return 0;

    // Simple cyclomatic complexity estimate
    let complexity = 1;

    // Count decision points
    const patterns = [
      /\bif\s*\(/g,
      /\belse\s+if\s*\(/g,
      /\bfor\s*\(/g,
      /\bwhile\s*\(/g,
      /\bswitch\s*\(/g,
      /\bcase\s+/g,
      /\bcatch\s*\(/g,
      /\?\s*[^:]/g, // Ternary
      /&&/g,
      /\|\|/g,
    ];

    for (const pattern of patterns) {
      const matches = content.match(pattern);
      if (matches) {
        complexity += matches.length;
      }
    }

    return complexity;
  }
}

// ============================================================================
// Singleton
// ============================================================================

let globalAnalyzer: SemanticContextAnalyzer | null = null;

export function getSemanticAnalyzer(
  projectRoot: string,
  config?: Partial<AnalyzerConfig>
): SemanticContextAnalyzer {
  if (!globalAnalyzer || globalAnalyzer['projectRoot'] !== projectRoot) {
    globalAnalyzer = new SemanticContextAnalyzer(projectRoot, config);
  }
  return globalAnalyzer;
}

export function resetSemanticAnalyzer(): void {
  if (globalAnalyzer) {
    globalAnalyzer.dispose();
    globalAnalyzer = null;
  }
}
