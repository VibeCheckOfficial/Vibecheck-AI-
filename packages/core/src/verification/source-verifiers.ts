/**
 * Source Verifiers
 *
 * Individual verification implementations for each source type.
 * These are the building blocks of the multi-source verification system.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';
import { createHash } from 'crypto';
import type { Claim, ClaimType } from '../firewall/claim-extractor.js';
import type {
  SourceEvidence,
  SourceVerifier,
  VerificationContext,
  VerificationSource,
} from './types.js';

// ============================================================================
// Truthpack Verifier
// ============================================================================

interface TruthpackData {
  routes?: Array<{
    path: string;
    method: string;
    file?: string;
    line?: number;
  }>;
  env?: {
    variables: Array<{
      name: string;
      required?: boolean;
      usedIn?: Array<{ file: string; line: number }>;
    }>;
  };
  contracts?: Array<{
    name: string;
    type: string;
    file?: string;
  }>;
  auth?: {
    protectedResources: Array<{
      path: string;
      requiredRoles?: string[];
    }>;
  };
}

let truthpackCache: { data: TruthpackData | null; loadedAt: number } = {
  data: null,
  loadedAt: 0,
};

async function loadTruthpack(
  projectRoot: string,
  truthpackPath: string
): Promise<TruthpackData> {
  const now = Date.now();
  // Cache for 5 minutes
  if (truthpackCache.data && now - truthpackCache.loadedAt < 5 * 60 * 1000) {
    return truthpackCache.data;
  }

  const data: TruthpackData = {};
  const basePath = path.join(projectRoot, truthpackPath);

  const files = ['routes.json', 'env.json', 'contracts.json', 'auth.json'];

  for (const file of files) {
    try {
      const content = await fs.readFile(path.join(basePath, file), 'utf-8');
      const key = file.replace('.json', '') as keyof TruthpackData;
      data[key] = JSON.parse(content);
    } catch {
      // File doesn't exist, skip
    }
  }

  truthpackCache = { data, loadedAt: now };
  return data;
}

export const truthpackVerifier: SourceVerifier = {
  name: 'truthpack',

  supports(claimType: ClaimType): boolean {
    return ['api_endpoint', 'env_variable', 'type_reference'].includes(claimType);
  },

  async verify(context: VerificationContext): Promise<SourceEvidence> {
    const startTime = performance.now();
    const { claim, projectRoot, truthpackPath } = context;

    try {
      const truthpack = await loadTruthpack(projectRoot, truthpackPath);

      switch (claim.type) {
        case 'api_endpoint':
          return verifyApiEndpoint(claim, truthpack, startTime);
        case 'env_variable':
          return verifyEnvVariable(claim, truthpack, startTime);
        case 'type_reference':
          return verifyTypeReference(claim, truthpack, startTime);
        default:
          return createEvidence('truthpack', false, 0, startTime, {
            reason: `Claim type ${claim.type} not supported by truthpack`,
          });
      }
    } catch (error) {
      return createEvidence('truthpack', false, 0, startTime, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },
};

function verifyApiEndpoint(
  claim: Claim,
  truthpack: TruthpackData,
  startTime: number
): SourceEvidence {
  if (!truthpack.routes?.length) {
    return createEvidence('truthpack', false, 0.5, startTime, {
      reason: 'No routes found in truthpack',
    });
  }

  const claimedPath = claim.value;

  for (const route of truthpack.routes) {
    if (pathsMatch(claimedPath, route.path)) {
      return createEvidence('truthpack', true, 1.0, startTime, {
        matchedRoute: route.path,
        method: route.method,
        location: route.file ? { file: route.file, line: route.line } : undefined,
        exactMatch: claimedPath === route.path,
      });
    }
  }

  return createEvidence('truthpack', false, 0.95, startTime, {
    reason: 'Route not found in truthpack',
    searchedValue: claimedPath,
    availableRoutes: truthpack.routes.slice(0, 5).map((r) => r.path),
  });
}

function verifyEnvVariable(
  claim: Claim,
  truthpack: TruthpackData,
  startTime: number
): SourceEvidence {
  if (!truthpack.env?.variables?.length) {
    return createEvidence('truthpack', false, 0.5, startTime, {
      reason: 'No env variables found in truthpack',
    });
  }

  const varName = claim.value.replace(/^process\.env\./, '').replace(/^import\.meta\.env\./, '');
  const variable = truthpack.env.variables.find((v) => v.name === varName);

  if (variable) {
    const location = variable.usedIn?.[0];
    return createEvidence('truthpack', true, 1.0, startTime, {
      variableName: variable.name,
      required: variable.required,
      location: location ? { file: location.file, line: location.line } : undefined,
    });
  }

  return createEvidence('truthpack', false, 0.95, startTime, {
    reason: 'Environment variable not found in truthpack',
    searchedValue: varName,
  });
}

function verifyTypeReference(
  claim: Claim,
  truthpack: TruthpackData,
  startTime: number
): SourceEvidence {
  if (!truthpack.contracts?.length) {
    return createEvidence('truthpack', false, 0.3, startTime, {
      reason: 'No contracts/types found in truthpack',
    });
  }

  const typeName = claim.value;
  const contract = truthpack.contracts.find((c) => c.name === typeName);

  if (contract) {
    return createEvidence('truthpack', true, 1.0, startTime, {
      typeName: contract.name,
      contractType: contract.type,
      location: contract.file ? { file: contract.file } : undefined,
    });
  }

  return createEvidence('truthpack', false, 0.7, startTime, {
    reason: 'Type not found in truthpack contracts',
    searchedValue: typeName,
  });
}

function pathsMatch(claimed: string, defined: string): boolean {
  if (claimed === defined) return true;

  const claimedParts = claimed.split('/').filter(Boolean);
  const definedParts = defined.split('/').filter(Boolean);

  if (claimedParts.length !== definedParts.length) return false;

  for (let i = 0; i < claimedParts.length; i++) {
    const c = claimedParts[i];
    const d = definedParts[i];

    // Parameter patterns: :id, [id], {id}
    if (d.startsWith(':') || d.startsWith('[') || d.startsWith('{')) continue;
    if (d === '*' || d === '**') continue;
    if (c !== d) return false;
  }

  return true;
}

// ============================================================================
// Package.json Verifier
// ============================================================================

const BUILTIN_MODULES = new Set([
  'fs', 'path', 'os', 'crypto', 'http', 'https', 'url', 'util',
  'stream', 'buffer', 'events', 'child_process', 'cluster',
  'dns', 'net', 'readline', 'tls', 'zlib', 'assert', 'async_hooks',
  'fs/promises', 'path/posix', 'path/win32', 'querystring',
  'timers', 'timers/promises', 'perf_hooks', 'worker_threads',
  'v8', 'vm', 'inspector', 'trace_events', 'string_decoder',
  'node:fs', 'node:path', 'node:crypto', 'node:http', 'node:https',
  'node:url', 'node:util', 'node:stream', 'node:buffer', 'node:events',
]);

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

let packageJsonCache: { data: PackageJson | null; path: string; loadedAt: number } = {
  data: null,
  path: '',
  loadedAt: 0,
};

async function loadPackageJson(projectRoot: string): Promise<PackageJson | null> {
  const pkgPath = path.join(projectRoot, 'package.json');
  const now = Date.now();

  if (
    packageJsonCache.data &&
    packageJsonCache.path === pkgPath &&
    now - packageJsonCache.loadedAt < 60000
  ) {
    return packageJsonCache.data;
  }

  try {
    const content = await fs.readFile(pkgPath, 'utf-8');
    const data = JSON.parse(content) as PackageJson;
    packageJsonCache = { data, path: pkgPath, loadedAt: now };
    return data;
  } catch {
    return null;
  }
}

export const packageJsonVerifier: SourceVerifier = {
  name: 'package_json',

  supports(claimType: ClaimType): boolean {
    return ['import', 'package_dependency'].includes(claimType);
  },

  async verify(context: VerificationContext): Promise<SourceEvidence> {
    const startTime = performance.now();
    const { claim, projectRoot } = context;

    try {
      let packageName = claim.value;

      // Handle node: protocol
      if (packageName.startsWith('node:')) {
        packageName = packageName.slice(5);
      }

      // Check built-in modules
      if (BUILTIN_MODULES.has(packageName) || BUILTIN_MODULES.has(`node:${packageName}`)) {
        return createEvidence('package_json', true, 1.0, startTime, {
          packageName,
          isBuiltin: true,
          originalImport: claim.value,
        });
      }

      // Handle subpath imports: lodash/get -> lodash, @scope/pkg/sub -> @scope/pkg
      if (!packageName.startsWith('@')) {
        packageName = packageName.split('/')[0];
      } else {
        const parts = packageName.split('/');
        packageName = parts.slice(0, 2).join('/');
      }

      const pkg = await loadPackageJson(projectRoot);
      if (!pkg) {
        return createEvidence('package_json', false, 0.5, startTime, {
          reason: 'Could not load package.json',
        });
      }

      const allDeps = {
        ...pkg.dependencies,
        ...pkg.devDependencies,
        ...pkg.peerDependencies,
      };

      if (packageName in allDeps) {
        const version = allDeps[packageName];
        const depType = pkg.dependencies?.[packageName]
          ? 'dependencies'
          : pkg.devDependencies?.[packageName]
            ? 'devDependencies'
            : 'peerDependencies';

        return createEvidence('package_json', true, 1.0, startTime, {
          packageName,
          version,
          dependencyType: depType,
          originalImport: claim.value,
          location: { file: 'package.json' },
        });
      }

      return createEvidence('package_json', false, 0.99, startTime, {
        reason: 'Package not found in dependencies',
        packageName,
        originalImport: claim.value,
      });
    } catch (error) {
      return createEvidence('package_json', false, 0, startTime, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },
};

// ============================================================================
// Filesystem Verifier
// ============================================================================

export const filesystemVerifier: SourceVerifier = {
  name: 'filesystem',

  supports(claimType: ClaimType): boolean {
    return ['file_reference', 'import', 'env_variable'].includes(claimType);
  },

  async verify(context: VerificationContext): Promise<SourceEvidence> {
    const startTime = performance.now();
    const { claim, projectRoot } = context;

    try {
      switch (claim.type) {
        case 'file_reference':
        case 'import':
          return verifyFileExists(claim, projectRoot, startTime);
        case 'env_variable':
          return verifyEnvFileExists(claim, projectRoot, startTime);
        default:
          return createEvidence('filesystem', false, 0, startTime, {
            reason: `Claim type ${claim.type} not supported`,
          });
      }
    } catch (error) {
      return createEvidence('filesystem', false, 0, startTime, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },
};

async function verifyFileExists(
  claim: Claim,
  projectRoot: string,
  startTime: number
): Promise<SourceEvidence> {
  const importPath = claim.value;

  // Skip non-relative imports (handled by package_json verifier)
  if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
    return createEvidence('filesystem', false, 0.3, startTime, {
      reason: 'Non-relative import, delegating to package_json verifier',
    });
  }

  const basePath = path.resolve(projectRoot, importPath);
  const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json'];
  const indexExtensions = ['/index.ts', '/index.tsx', '/index.js', '/index.jsx'];

  // Try direct path with extensions
  for (const ext of extensions) {
    const fullPath = basePath + ext;
    if (await fileExists(fullPath)) {
      return createEvidence('filesystem', true, 1.0, startTime, {
        resolvedPath: fullPath,
        addedExtension: ext || undefined,
        location: { file: path.relative(projectRoot, fullPath) },
      });
    }
  }

  // Try index files
  for (const ext of indexExtensions) {
    const fullPath = basePath + ext;
    if (await fileExists(fullPath)) {
      return createEvidence('filesystem', true, 0.9, startTime, {
        resolvedPath: fullPath,
        resolvedAsIndex: true,
        location: { file: path.relative(projectRoot, fullPath) },
      });
    }
  }

  return createEvidence('filesystem', false, 0.85, startTime, {
    reason: 'File not found',
    searchedPath: importPath,
    triedExtensions: [...extensions, ...indexExtensions],
  });
}

async function verifyEnvFileExists(
  claim: Claim,
  projectRoot: string,
  startTime: number
): Promise<SourceEvidence> {
  const varName = claim.value.replace(/^process\.env\./, '').replace(/^import\.meta\.env\./, '');
  const envFiles = ['.env', '.env.local', '.env.development', '.env.production', '.env.example'];

  for (const envFile of envFiles) {
    const filePath = path.join(projectRoot, envFile);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('#')) continue;

        const match = line.match(new RegExp(`^${varName}\\s*=`));
        if (match) {
          return createEvidence('filesystem', true, 1.0, startTime, {
            foundIn: envFile,
            line: i + 1,
            isExample: envFile.includes('example'),
            location: { file: envFile, line: i + 1 },
          });
        }
      }
    } catch {
      continue;
    }
  }

  return createEvidence('filesystem', false, 0.85, startTime, {
    reason: 'Environment variable not found in any .env file',
    searchedFiles: envFiles,
  });
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// AST Verifier
// ============================================================================

export const astVerifier: SourceVerifier = {
  name: 'ast',

  supports(claimType: ClaimType): boolean {
    return ['function_call', 'type_reference'].includes(claimType);
  },

  async verify(context: VerificationContext): Promise<SourceEvidence> {
    const startTime = performance.now();
    const { claim, projectRoot } = context;

    try {
      const patterns = getSearchPatterns(claim);
      if (patterns.length === 0) {
        return createEvidence('ast', false, 0.3, startTime, {
          reason: 'No search patterns for claim type',
        });
      }

      const files = await glob('**/*.{ts,tsx,js,jsx}', {
        cwd: projectRoot,
        ignore: ['node_modules/**', 'dist/**', 'build/**', '.next/**', 'coverage/**', '**/*.d.ts'],
        absolute: true,
      });

      const filesToSearch = files.slice(0, 500); // Limit for performance
      let filesSearched = 0;

      for (const filePath of filesToSearch) {
        try {
          const stat = await fs.stat(filePath);
          if (stat.size > 1024 * 1024) continue; // Skip files > 1MB

          const content = await fs.readFile(filePath, 'utf-8');
          const lines = content.split('\n');
          filesSearched++;

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            for (const pattern of patterns) {
              if (pattern.test(line)) {
                return createEvidence('ast', true, 0.9, startTime, {
                  matchedLine: line.trim().slice(0, 100),
                  pattern: pattern.source,
                  location: {
                    file: path.relative(projectRoot, filePath),
                    line: i + 1,
                  },
                  filesSearched,
                });
              }
            }
          }
        } catch {
          continue;
        }
      }

      return createEvidence('ast', false, 0.9, startTime, {
        reason: 'Definition not found in codebase',
        filesSearched,
        searchedValue: claim.value,
      });
    } catch (error) {
      return createEvidence('ast', false, 0, startTime, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },
};

function getSearchPatterns(claim: Claim): RegExp[] {
  const value = claim.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  switch (claim.type) {
    case 'function_call':
      return [
        new RegExp(`function\\s+${value}\\s*[(<]`),
        new RegExp(`(?:const|let|var)\\s+${value}\\s*=\\s*(?:async\\s+)?(?:function|\\()`),
        new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${value}\\b`),
        new RegExp(`${value}\\s*[=:]\\s*(?:async\\s+)?\\([^)]*\\)\\s*=>`),
      ];
    case 'type_reference':
      return [
        new RegExp(`(?:interface|type|class|enum)\\s+${value}\\b`),
        new RegExp(`export\\s+(?:interface|type|class|enum)\\s+${value}\\b`),
      ];
    default:
      return [];
  }
}

// ============================================================================
// Git Verifier
// ============================================================================

export const gitVerifier: SourceVerifier = {
  name: 'git',

  supports(claimType: ClaimType): boolean {
    return ['file_reference', 'function_call', 'type_reference'].includes(claimType);
  },

  async verify(context: VerificationContext): Promise<SourceEvidence> {
    const startTime = performance.now();
    const { claim, projectRoot } = context;

    try {
      // Use simple file existence check for git-tracked files
      // This is a simplified implementation - full git integration would use git commands
      const gitDir = path.join(projectRoot, '.git');
      const gitExists = await fileExists(gitDir);

      if (!gitExists) {
        return createEvidence('git', false, 0.3, startTime, {
          reason: 'Not a git repository',
        });
      }

      // For now, delegate to filesystem verifier for file checks
      // Full implementation would check git history
      if (claim.type === 'file_reference') {
        const filePath = path.resolve(projectRoot, claim.value);
        if (await fileExists(filePath)) {
          return createEvidence('git', true, 0.8, startTime, {
            tracked: true,
            location: { file: claim.value },
          });
        }
      }

      return createEvidence('git', false, 0.7, startTime, {
        reason: 'Could not verify via git',
      });
    } catch (error) {
      return createEvidence('git', false, 0, startTime, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },
};

// ============================================================================
// TypeScript Compiler Verifier
// ============================================================================

export const typescriptVerifier: SourceVerifier = {
  name: 'typescript_compiler',

  supports(claimType: ClaimType): boolean {
    return ['type_reference', 'import', 'function_call'].includes(claimType);
  },

  async verify(context: VerificationContext): Promise<SourceEvidence> {
    const startTime = performance.now();
    const { claim, projectRoot } = context;

    try {
      // Check if tsconfig.json exists
      const tsconfigPath = path.join(projectRoot, 'tsconfig.json');
      const hasTsConfig = await fileExists(tsconfigPath);

      if (!hasTsConfig) {
        return createEvidence('typescript_compiler', false, 0.3, startTime, {
          reason: 'No tsconfig.json found',
        });
      }

      // For type references, search for definition files
      if (claim.type === 'type_reference') {
        const typeName = claim.value;
        const dtsFiles = await glob('**/*.d.ts', {
          cwd: projectRoot,
          ignore: ['node_modules/**'],
          absolute: true,
        });

        for (const dtsFile of dtsFiles.slice(0, 50)) {
          try {
            const content = await fs.readFile(dtsFile, 'utf-8');
            const typePattern = new RegExp(`(?:interface|type|class|enum)\\s+${typeName}\\b`);
            if (typePattern.test(content)) {
              const lines = content.split('\n');
              for (let i = 0; i < lines.length; i++) {
                if (typePattern.test(lines[i])) {
                  return createEvidence('typescript_compiler', true, 0.98, startTime, {
                    definedAt: path.relative(projectRoot, dtsFile),
                    line: i + 1,
                    location: { file: path.relative(projectRoot, dtsFile), line: i + 1 },
                  });
                }
              }
            }
          } catch {
            continue;
          }
        }
      }

      // For imports, check node_modules types
      if (claim.type === 'import') {
        let packageName = claim.value;
        if (!packageName.startsWith('@')) {
          packageName = packageName.split('/')[0];
        } else {
          packageName = packageName.split('/').slice(0, 2).join('/');
        }

        const typesPath = path.join(projectRoot, 'node_modules', '@types', packageName);
        const pkgTypesPath = path.join(projectRoot, 'node_modules', packageName);

        if (await fileExists(typesPath) || await fileExists(path.join(pkgTypesPath, 'index.d.ts'))) {
          return createEvidence('typescript_compiler', true, 0.95, startTime, {
            hasTypes: true,
            packageName,
          });
        }
      }

      return createEvidence('typescript_compiler', false, 0.5, startTime, {
        reason: 'Could not verify via TypeScript compiler',
      });
    } catch (error) {
      return createEvidence('typescript_compiler', false, 0, startTime, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },
};

// ============================================================================
// Runtime Verifier (for reality mode)
// ============================================================================

export const runtimeVerifier: SourceVerifier = {
  name: 'runtime',

  supports(claimType: ClaimType): boolean {
    return ['api_endpoint', 'env_variable'].includes(claimType);
  },

  async verify(context: VerificationContext): Promise<SourceEvidence> {
    const startTime = performance.now();
    const { claim } = context;

    // Runtime verification is inherently risky and should be opt-in
    // This is a placeholder for actual runtime checks

    if (claim.type === 'env_variable') {
      const varName = claim.value.replace(/^process\.env\./, '').replace(/^import\.meta\.env\./, '');
      const value = process.env[varName];

      if (value !== undefined) {
        return createEvidence('runtime', true, 0.99, startTime, {
          exists: true,
          hasValue: value.length > 0,
          // Never expose actual values
        });
      }

      return createEvidence('runtime', false, 0.99, startTime, {
        reason: 'Environment variable not set at runtime',
      });
    }

    // API endpoint verification would require making actual HTTP requests
    // which is too risky for automated verification
    return createEvidence('runtime', false, 0.3, startTime, {
      reason: 'Runtime verification not available for this claim type',
    });
  },
};

// ============================================================================
// Utility Functions
// ============================================================================

function createEvidence(
  source: VerificationSource,
  verified: boolean,
  confidence: number,
  startTime: number,
  details: Record<string, unknown>
): SourceEvidence {
  return {
    source,
    verified,
    confidence,
    details,
    timestamp: new Date(),
    durationMs: performance.now() - startTime,
  };
}

// ============================================================================
// Export all verifiers
// ============================================================================

export const ALL_VERIFIERS: SourceVerifier[] = [
  truthpackVerifier,
  packageJsonVerifier,
  filesystemVerifier,
  astVerifier,
  gitVerifier,
  typescriptVerifier,
  runtimeVerifier,
];

export function getVerifiersForClaimType(claimType: ClaimType): SourceVerifier[] {
  return ALL_VERIFIERS.filter((v) => v.supports(claimType));
}

/**
 * Clear all caches (useful for testing or after file changes)
 */
export function clearVerifierCaches(): void {
  truthpackCache = { data: null, loadedAt: 0 };
  packageJsonCache = { data: null, path: '', loadedAt: 0 };
}
