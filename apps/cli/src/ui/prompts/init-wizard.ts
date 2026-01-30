/**
 * Interactive initialization wizard using Clack prompts
 */

import * as p from '@clack/prompts';
import chalk from 'chalk';
import { generateConfigTemplate, type VibeCheckConfig } from '../../lib/config.js';
import { shouldPrompt } from '../../lib/environment.js';

export interface InitWizardResult {
  template: 'minimal' | 'standard' | 'strict';
  rules: string[];
  strict: boolean;
  configContent: string;
}

/**
 * Run the interactive initialization wizard
 */
export async function runInitWizard(): Promise<InitWizardResult | null> {
  if (!shouldPrompt()) {
    // Non-interactive mode - return defaults
    return {
      template: 'standard',
      rules: ['routes', 'env', 'auth', 'contracts'],
      strict: false,
      configContent: generateConfigTemplate('standard'),
    };
  }

  p.intro(chalk.cyan('vibecheck init'));

  const template = await p.select({
    message: 'Choose a configuration template:',
    options: [
      {
        value: 'minimal',
        label: 'Minimal',
        hint: 'Basic routes and env scanning',
      },
      {
        value: 'standard',
        label: 'Standard',
        hint: 'Recommended for most projects',
      },
      {
        value: 'strict',
        label: 'Strict',
        hint: 'Maximum validation, fail-fast enabled',
      },
    ],
    initialValue: 'standard',
  });

  if (p.isCancel(template)) {
    p.cancel('Setup cancelled.');
    return null;
  }

  const rules = await p.multiselect({
    message: 'Select scanners to enable:',
    options: [
      { value: 'routes', label: 'Routes', hint: 'API routes and endpoints' },
      { value: 'env', label: 'Environment', hint: 'Environment variables' },
      { value: 'auth', label: 'Auth', hint: 'Authentication patterns' },
      { value: 'contracts', label: 'Contracts', hint: 'API contracts and types' },
      { value: 'ui', label: 'UI Graph', hint: 'Component relationships' },
    ],
    initialValues: template === 'minimal' 
      ? ['routes', 'env'] 
      : ['routes', 'env', 'auth', 'contracts'],
    required: true,
  });

  if (p.isCancel(rules)) {
    p.cancel('Setup cancelled.');
    return null;
  }

  const strict = await p.confirm({
    message: 'Enable strict mode?',
    initialValue: template === 'strict',
  });

  if (p.isCancel(strict)) {
    p.cancel('Setup cancelled.');
    return null;
  }

  const configContent = generateConfigTemplate(template as 'minimal' | 'standard' | 'strict');

  p.outro(chalk.green('Configuration ready!'));

  return {
    template: template as 'minimal' | 'standard' | 'strict',
    rules: rules as string[],
    strict: strict as boolean,
    configContent,
  };
}

/**
 * Prompt for confirmation before overwriting existing config
 */
export async function confirmOverwrite(path: string): Promise<boolean> {
  if (!shouldPrompt()) {
    return false; // Don't overwrite in non-interactive mode
  }

  const confirmed = await p.confirm({
    message: `Config file already exists at ${chalk.cyan(path)}. Overwrite?`,
    initialValue: false,
  });

  if (p.isCancel(confirmed)) {
    return false;
  }

  return confirmed as boolean;
}
