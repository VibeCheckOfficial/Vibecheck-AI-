/**
 * Forge - Project Analyzer
 *
 * Analyzes project structure for rule generation.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ProjectAnalysis, ForgeConfig } from './types.js';

/**
 * Analyze a project for Forge rule generation
 */
export async function analyzeProject(
  projectPath: string,
  _config: ForgeConfig
): Promise<ProjectAnalysis> {
  return standaloneAnalysis(projectPath);
}

/**
 * Standalone analysis implementation
 */
function standaloneAnalysis(projectPath: string): ProjectAnalysis {
  const analysis: ProjectAnalysis = {
    name: path.basename(projectPath),
    framework: detectFramework(projectPath),
    language: detectLanguage(projectPath),
    architecture: detectArchitecture(projectPath),
    directories: detectDirectories(projectPath),
    components: detectComponents(projectPath),
    apiRoutes: detectAPIRoutes(projectPath),
    models: detectModels(projectPath),
    types: detectTypes(projectPath),
    envVars: detectEnvVars(projectPath),
    patterns: detectPatterns(projectPath),
    monorepo: detectMonorepo(projectPath),
    stats: calculateStats(projectPath),
  };

  return analysis;
}

// ============================================================================
// DETECTION FUNCTIONS
// ============================================================================

function detectFramework(projectPath: string): string {
  const packageJsonPath = path.join(projectPath, 'package.json');

  if (fs.existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };

      if (deps['next']) return 'Next.js';
      if (deps['@remix-run/react']) return 'Remix';
      if (deps['gatsby']) return 'Gatsby';
      if (deps['nuxt']) return 'Nuxt';
      if (deps['@angular/core']) return 'Angular';
      if (deps['vue']) return 'Vue';
      if (deps['svelte']) return 'Svelte';
      if (deps['react']) return 'React';
      if (deps['express']) return 'Express';
      if (deps['fastify']) return 'Fastify';
      if (deps['koa']) return 'Koa';
      if (deps['@nestjs/core']) return 'NestJS';
    } catch {
      // Ignore parse errors
    }
  }

  return 'Unknown';
}

function detectLanguage(projectPath: string): string {
  const tsconfigPath = path.join(projectPath, 'tsconfig.json');
  if (fs.existsSync(tsconfigPath)) {
    return 'TypeScript';
  }
  return 'JavaScript';
}

function detectArchitecture(projectPath: string): string {
  try {
    const dirs = fs
      .readdirSync(projectPath, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    if (dirs.includes('app') || dirs.includes('pages')) {
      return 'Pages Router / App Router';
    }
    if (dirs.includes('src')) {
      return 'Standard src layout';
    }
  } catch {
    // Ignore errors
  }
  return 'Flat structure';
}

function detectDirectories(projectPath: string): string[] {
  const ignoreDirs = ['node_modules', '.git', '.next', 'dist', 'build', '.vibecheck'];

  try {
    return fs
      .readdirSync(projectPath, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !ignoreDirs.includes(d.name) && !d.name.startsWith('.'))
      .map((d) => d.name);
  } catch {
    return [];
  }
}

function detectComponents(projectPath: string): ProjectAnalysis['components'] {
  const components: ProjectAnalysis['components'] = [];
  const componentDirs = ['components', 'src/components', 'app/components'];

  for (const dir of componentDirs) {
    const fullPath = path.join(projectPath, dir);
    if (fs.existsSync(fullPath)) {
      const files = findFiles(fullPath, ['.tsx', '.jsx']);
      for (const file of files) {
        const name = path.basename(file, path.extname(file));
        if (name[0] === name[0].toUpperCase()) {
          components.push({
            name,
            path: file.replace(projectPath, '').replace(/^[/\\]/, ''),
            type: 'component',
          });
        }
      }
    }
  }

  return components;
}

function detectAPIRoutes(projectPath: string): ProjectAnalysis['apiRoutes'] {
  const routes: ProjectAnalysis['apiRoutes'] = [];
  const apiDirs = ['api', 'pages/api', 'app/api', 'src/api', 'routes'];

  for (const dir of apiDirs) {
    const fullPath = path.join(projectPath, dir);
    if (fs.existsSync(fullPath)) {
      const files = findFiles(fullPath, ['.ts', '.js']);
      for (const file of files) {
        const relativePath = file.replace(projectPath, '').replace(/^[/\\]/, '');
        routes.push({
          path: '/' + relativePath.replace(/\.(ts|js)$/, '').replace(/\\/g, '/'),
          method: 'GET',
          handler: path.basename(file, path.extname(file)),
          file: relativePath,
        });
      }
    }
  }

  return routes;
}

function detectModels(projectPath: string): ProjectAnalysis['models'] {
  const models: ProjectAnalysis['models'] = [];
  const prismaSchemaPath = path.join(projectPath, 'prisma', 'schema.prisma');

  if (fs.existsSync(prismaSchemaPath)) {
    try {
      const schema = fs.readFileSync(prismaSchemaPath, 'utf-8');
      const modelRegex = /model\s+(\w+)\s*\{([^}]+)\}/g;
      let match;

      while ((match = modelRegex.exec(schema)) !== null) {
        const name = match[1];
        const body = match[2];
        const fields = body
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line && !line.startsWith('@@'))
          .map((line) => line.split(/\s+/)[0])
          .filter(Boolean);

        models.push({
          name,
          path: 'prisma/schema.prisma',
          fields,
        });
      }
    } catch {
      // Ignore parse errors
    }
  }

  return models;
}

function detectTypes(projectPath: string): ProjectAnalysis['types'] {
  const types: ProjectAnalysis['types'] = {
    interfaces: [],
    types: [],
    enums: [],
  };

  const typeDirs = ['types', 'src/types', '@types'];

  for (const dir of typeDirs) {
    const fullPath = path.join(projectPath, dir);
    if (fs.existsSync(fullPath)) {
      const files = findFiles(fullPath, ['.ts', '.d.ts']);
      for (const file of files) {
        try {
          const content = fs.readFileSync(file, 'utf-8');
          const relativePath = file.replace(projectPath, '').replace(/^[/\\]/, '');

          // Find interfaces
          const interfaceRegex = /interface\s+(\w+)/g;
          let match;
          while ((match = interfaceRegex.exec(content)) !== null) {
            types.interfaces.push({ name: match[1], path: relativePath });
          }

          // Find type aliases
          const typeRegex = /type\s+(\w+)\s*=/g;
          while ((match = typeRegex.exec(content)) !== null) {
            types.types.push({ name: match[1], path: relativePath });
          }

          // Find enums
          const enumRegex = /enum\s+(\w+)/g;
          while ((match = enumRegex.exec(content)) !== null) {
            types.enums.push({ name: match[1], path: relativePath });
          }
        } catch {
          // Ignore read errors
        }
      }
    }
  }

  return types;
}

function detectEnvVars(projectPath: string): ProjectAnalysis['envVars'] {
  const envVars: ProjectAnalysis['envVars'] = {
    variables: [],
    sensitive: [],
    missing: [],
  };

  const envFiles = ['.env.example', '.env.template', '.env.local.example'];

  for (const envFile of envFiles) {
    const envPath = path.join(projectPath, envFile);
    if (fs.existsSync(envPath)) {
      try {
        const content = fs.readFileSync(envPath, 'utf-8');
        const lines = content.split('\n');

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#')) {
            const [key] = trimmed.split('=');
            if (key) {
              envVars.variables.push(key.trim());

              // Check if sensitive
              const sensitivePatterns = [/SECRET/i, /KEY/i, /TOKEN/i, /PASSWORD/i, /PRIVATE/i];
              if (sensitivePatterns.some((p) => p.test(key))) {
                envVars.sensitive.push(key.trim());
              }
            }
          }
        }
      } catch {
        // Ignore read errors
      }
    }
  }

  return envVars;
}

function detectPatterns(projectPath: string): ProjectAnalysis['patterns'] {
  const patterns: ProjectAnalysis['patterns'] = {
    hooks: [],
    stateManagement: '',
    dataFetching: [],
    styling: [],
    testing: [],
    validation: '',
    authentication: '',
    antiPatterns: [],
  };

  const packageJsonPath = path.join(projectPath, 'package.json');

  if (fs.existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };

      // State management
      if (deps['zustand']) patterns.stateManagement = 'Zustand';
      else if (deps['@reduxjs/toolkit'] || deps['redux']) patterns.stateManagement = 'Redux';
      else if (deps['recoil']) patterns.stateManagement = 'Recoil';
      else if (deps['jotai']) patterns.stateManagement = 'Jotai';
      else if (deps['mobx']) patterns.stateManagement = 'MobX';

      // Data fetching
      if (deps['@tanstack/react-query']) patterns.dataFetching.push('React Query');
      if (deps['swr']) patterns.dataFetching.push('SWR');
      if (deps['axios']) patterns.dataFetching.push('Axios');
      if (deps['graphql-request']) patterns.dataFetching.push('GraphQL');

      // Styling
      if (deps['tailwindcss']) patterns.styling.push('Tailwind CSS');
      if (deps['styled-components']) patterns.styling.push('Styled Components');
      if (deps['@emotion/react']) patterns.styling.push('Emotion');
      if (deps['sass']) patterns.styling.push('Sass');

      // Testing
      if (deps['jest']) patterns.testing.push('Jest');
      if (deps['vitest']) patterns.testing.push('Vitest');
      if (deps['@testing-library/react']) patterns.testing.push('React Testing Library');
      if (deps['playwright'] || deps['@playwright/test']) patterns.testing.push('Playwright');
      if (deps['cypress']) patterns.testing.push('Cypress');

      // Validation
      if (deps['zod']) patterns.validation = 'Zod';
      else if (deps['yup']) patterns.validation = 'Yup';
      else if (deps['joi']) patterns.validation = 'Joi';

      // Authentication
      if (deps['next-auth']) patterns.authentication = 'NextAuth';
      else if (deps['@clerk/nextjs']) patterns.authentication = 'Clerk';
      else if (deps['passport']) patterns.authentication = 'Passport';
      else if (deps['@auth0/nextjs-auth0']) patterns.authentication = 'Auth0';
    } catch {
      // Ignore parse errors
    }
  }

  // Detect custom hooks
  const hooksDirs = ['hooks', 'src/hooks'];
  for (const dir of hooksDirs) {
    const fullPath = path.join(projectPath, dir);
    if (fs.existsSync(fullPath)) {
      const files = findFiles(fullPath, ['.ts', '.tsx']);
      for (const file of files) {
        const name = path.basename(file, path.extname(file));
        if (name.startsWith('use')) {
          patterns.hooks.push(name);
        }
      }
    }
  }

  return patterns;
}

function detectMonorepo(projectPath: string): ProjectAnalysis['monorepo'] {
  const result: ProjectAnalysis['monorepo'] = {
    isMonorepo: false,
    type: '',
    workspaces: [],
    sharedPackages: [],
  };

  // Check for pnpm workspaces
  const pnpmWorkspacePath = path.join(projectPath, 'pnpm-workspace.yaml');
  if (fs.existsSync(pnpmWorkspacePath)) {
    result.isMonorepo = true;
    result.type = 'pnpm';
  }

  // Check for yarn/npm workspaces
  const packageJsonPath = path.join(projectPath, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      if (pkg.workspaces) {
        result.isMonorepo = true;
        result.type = result.type || 'npm/yarn';

        const workspacePatterns = Array.isArray(pkg.workspaces)
          ? pkg.workspaces
          : pkg.workspaces.packages || [];

        for (const pattern of workspacePatterns) {
          const basePath = pattern.replace('/*', '').replace('/**', '');
          const fullPath = path.join(projectPath, basePath);
          if (fs.existsSync(fullPath)) {
            try {
              const dirs = fs
                .readdirSync(fullPath, { withFileTypes: true })
                .filter((d) => d.isDirectory())
                .map((d) => d.name);

              for (const dir of dirs) {
                const workspacePkgPath = path.join(fullPath, dir, 'package.json');
                if (fs.existsSync(workspacePkgPath)) {
                  try {
                    const workspacePkg = JSON.parse(fs.readFileSync(workspacePkgPath, 'utf-8'));
                    result.workspaces.push({
                      name: workspacePkg.name || dir,
                      path: `${basePath}/${dir}`,
                    });
                  } catch {
                    result.workspaces.push({
                      name: dir,
                      path: `${basePath}/${dir}`,
                    });
                  }
                }
              }
            } catch {
              // Ignore directory read errors
            }
          }
        }
      }
    } catch {
      // Ignore parse errors
    }
  }

  // Check for turborepo
  const turboPath = path.join(projectPath, 'turbo.json');
  if (fs.existsSync(turboPath)) {
    result.isMonorepo = true;
    result.type = 'turborepo';
  }

  return result;
}

function calculateStats(projectPath: string): ProjectAnalysis['stats'] {
  const stats: ProjectAnalysis['stats'] = {
    totalFiles: 0,
    totalLines: 0,
    filesByExtension: {},
  };

  const ignoreDirs = ['node_modules', '.git', '.next', 'dist', 'build', '.vibecheck'];

  function countFiles(dir: string): void {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          if (!ignoreDirs.includes(entry.name) && !entry.name.startsWith('.')) {
            countFiles(fullPath);
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);
          if (['.ts', '.tsx', '.js', '.jsx', '.css', '.scss', '.md', '.json'].includes(ext)) {
            stats.totalFiles++;
            stats.filesByExtension[ext] = (stats.filesByExtension[ext] || 0) + 1;

            try {
              const content = fs.readFileSync(fullPath, 'utf-8');
              stats.totalLines += content.split('\n').length;
            } catch {
              // Ignore read errors
            }
          }
        }
      }
    } catch {
      // Ignore directory read errors
    }
  }

  countFiles(projectPath);
  return stats;
}

// ============================================================================
// UTILITIES
// ============================================================================

function findFiles(dir: string, extensions: string[]): string[] {
  const files: string[] = [];

  function walk(currentDir: string): void {
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);

        if (entry.isDirectory()) {
          if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
            walk(fullPath);
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);
          if (extensions.includes(ext)) {
            files.push(fullPath);
          }
        }
      }
    } catch {
      // Ignore directory read errors
    }
  }

  walk(dir);
  return files;
}
