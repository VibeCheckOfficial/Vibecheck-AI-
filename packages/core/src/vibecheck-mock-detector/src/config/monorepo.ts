// src/config/monorepo.ts

import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';
import { loadConfig, type VibeCheckConfig } from './loader';

export interface MonorepoPackage {
  name: string;
  path: string;
  config: VibeCheckConfig;
}

export interface MonorepoConfig {
  isMonorepo: boolean;
  rootConfig: VibeCheckConfig;
  packages: MonorepoPackage[];
  workspaceGlobs: string[];
}

export async function detectMonorepo(rootDir: string): Promise<MonorepoConfig> {
  const rootConfig = await loadConfig(rootDir);
  const workspaceGlobs = await detectWorkspaces(rootDir);

  if (workspaceGlobs.length === 0) {
    return {
      isMonorepo: false,
      rootConfig,
      packages: [{
        name: 'root',
        path: rootDir,
        config: rootConfig,
      }],
      workspaceGlobs: [],
    };
  }

  const packages: MonorepoPackage[] = [];

  for (const pattern of workspaceGlobs) {
    const packageDirs = await glob(pattern, {
      cwd: rootDir,
      absolute: true,
      onlyDirectories: true,
    });

    for (const packageDir of packageDirs) {
      const packageJsonPath = path.join(packageDir, 'package.json');
      if (!await fileExists(packageJsonPath)) continue;

      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
      const packageName = packageJson.name || path.basename(packageDir);
      const packageConfig = await loadPackageConfig(packageDir, rootConfig);

      packages.push({
        name: packageName,
        path: packageDir,
        config: packageConfig,
      });
    }
  }

  const hasRootSrc = await fileExists(path.join(rootDir, 'src'));
  if (hasRootSrc) {
    packages.unshift({
      name: 'root',
      path: rootDir,
      config: rootConfig,
    });
  }

  return {
    isMonorepo: true,
    rootConfig,
    packages,
    workspaceGlobs,
  };
}

async function detectWorkspaces(rootDir: string): Promise<string[]> {
  const packageJsonPath = path.join(rootDir, 'package.json');
  if (await fileExists(packageJsonPath)) {
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));

    if (packageJson.workspaces) {
      const workspaces = Array.isArray(packageJson.workspaces)
        ? packageJson.workspaces
        : packageJson.workspaces.packages || [];

      if (workspaces.length > 0) {
        return workspaces;
      }
    }
  }

  const pnpmWorkspacePath = path.join(rootDir, 'pnpm-workspace.yaml');
  if (await fileExists(pnpmWorkspacePath)) {
    const yaml = await import('yaml');
    const content = await fs.readFile(pnpmWorkspacePath, 'utf-8');
    const config = yaml.parse(content);

    if (config.packages) {
      return config.packages;
    }
  }

  const lernaPath = path.join(rootDir, 'lerna.json');
  if (await fileExists(lernaPath)) {
    const lernaConfig = JSON.parse(await fs.readFile(lernaPath, 'utf-8'));

    if (lernaConfig.packages) {
      return lernaConfig.packages;
    }
  }

  const nxPath = path.join(rootDir, 'nx.json');
  if (await fileExists(nxPath)) {
    return ['apps/*', 'packages/*', 'libs/*'];
  }

  const turboPath = path.join(rootDir, 'turbo.json');
  if (await fileExists(turboPath)) {
    return ['apps/*', 'packages/*'];
  }

  return [];
}

async function loadPackageConfig(
  packageDir: string,
  rootConfig: VibeCheckConfig
): Promise<VibeCheckConfig> {
  const packageConfig = await loadConfig(packageDir);
  return mergeConfigs(rootConfig, packageConfig);
}

function mergeConfigs(
  base: VibeCheckConfig,
  override: VibeCheckConfig
): VibeCheckConfig {
  return {
    ...base,
    ...override,
    rules: [...(base.rules || []), ...(override.rules || [])],
    suppressions: [...(base.suppressions || []), ...(override.suppressions || [])],
    include: override.include?.length ? override.include : base.include,
    exclude: [...(base.exclude || []), ...(override.exclude || [])],
    industries: override.industries?.length ? override.industries : base.industries,
  };
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
