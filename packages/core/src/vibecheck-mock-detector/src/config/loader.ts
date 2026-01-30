// src/config/loader.ts

import * as fs from 'fs/promises';
import * as path from 'path';
import { z } from 'zod';
import { cosmiconfig } from 'cosmiconfig';

const configSchema = z.object({
  team: z.string().optional(),
  project: z.string().optional(),
  failOn: z.enum(['critical', 'high', 'medium', 'low']).default('high'),
  industries: z.array(z.enum(['fintech', 'healthcare', 'ecommerce', 'saas', 'general'])).default(['general']),
  rules: z.array(z.object({
    id: z.string(),
    pattern: z.string(),
    severity: z.enum(['critical', 'high', 'medium', 'low']),
    category: z.string(),
    description: z.string(),
    fix: z.string().optional(),
  })).optional(),
  rulesFile: z.string().optional(),
  suppressions: z.array(z.object({
    rule: z.string(),
    file: z.string().optional(),
    line: z.number().optional(),
    reason: z.string(),
    expires: z.string().optional(),
  })).optional(),
  include: z.array(z.string()).default(['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx']),
  exclude: z.array(z.string()).default([]),
  enableAst: z.boolean().default(true),
  enableMl: z.boolean().default(true),
  apiKey: z.string().optional(),
  apiEndpoint: z.string().optional(),
  reportFormat: z.enum(['text', 'json', 'sarif', 'markdown']).default('text'),
  reportOutput: z.string().optional(),
});

export type VibeCheckConfig = z.infer<typeof configSchema>;

const explorer = cosmiconfig('vibecheck', {
  searchPlaces: [
    'package.json',
    '.vibecheckrc',
    '.vibecheckrc.json',
    '.vibecheckrc.yaml',
    '.vibecheckrc.yml',
    '.vibecheckrc.js',
    '.vibecheckrc.cjs',
    'vibecheck.config.js',
    'vibecheck.config.cjs',
    'vibecheck.config.mjs',
  ],
});

export async function loadConfig(rootDir: string): Promise<VibeCheckConfig> {
  const result = await explorer.search(rootDir);

  if (!result || result.isEmpty) {
    return configSchema.parse({});
  }

  const config = configSchema.parse(result.config);

  if (config.rulesFile) {
    const rulesPath = path.resolve(rootDir, config.rulesFile);
    try {
      const rulesContent = await fs.readFile(rulesPath, 'utf-8');
      const externalRules = JSON.parse(rulesContent);
      config.rules = [...(config.rules || []), ...externalRules];
    } catch (error) {
      console.warn(`Warning: Could not load rules file ${rulesPath}`);
    }
  }

  if (config.suppressions) {
    const now = new Date();
    config.suppressions = config.suppressions.filter(s => {
      if (!s.expires) return true;
      return new Date(s.expires) > now;
    });
  }

  return config;
}

export async function syncTeamConfig(
  config: VibeCheckConfig,
  apiKey: string
): Promise<VibeCheckConfig> {
  if (!config.team || !apiKey) return config;

  const endpoint = config.apiEndpoint || 'https://api.vibecheck.dev';

  try {
    const rulesResponse = await fetch(`${endpoint}/api/teams/${config.team}/rules`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });

    if (rulesResponse.ok) {
      const { custom } = await rulesResponse.json();
      config.rules = [...(config.rules || []), ...custom];
    }

    const suppressionsResponse = await fetch(`${endpoint}/api/teams/${config.team}/suppressions`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });

    if (suppressionsResponse.ok) {
      const teamSuppressions = await suppressionsResponse.json();
      config.suppressions = [...(config.suppressions || []), ...teamSuppressions];
    }
  } catch (error) {
    console.warn('Failed to sync team config:', error);
  }

  return config;
}

export { configSchema };
