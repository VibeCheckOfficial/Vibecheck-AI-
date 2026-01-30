/**
 * Doctor Fixes
 * 
 * Auto-fix functions for common issues.
 */

import * as fs from 'fs';
import * as path from 'path';

import type { Fix, FixResult } from './types.js';

// ============================================================================
// Built-in Fixes
// ============================================================================

/**
 * Create default configuration file
 */
export const createConfigFix: Fix = {
  id: 'create-config',
  name: 'Create Configuration',
  description: 'Create default .vibecheck/config.json',
  
  apply: async (): Promise<FixResult> => {
    const configDir = path.join(process.cwd(), '.vibecheck');
    const configPath = path.join(configDir, 'config.json');

    try {
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      const defaultConfig = {
        version: '1.0.0',
        scan: {
          include: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
          exclude: ['node_modules/**', 'dist/**', 'build/**'],
        },
        secrets: {
          enabled: true,
          allowlist: '.vibecheck/secrets.allowlist',
        },
        output: {
          format: 'console',
          colors: true,
        },
      };

      fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2), 'utf-8');

      return {
        success: true,
        message: 'Created default configuration',
        changes: [configPath],
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to create config: ${error}`,
      };
    }
  },

  preview: async (): Promise<string> => {
    return `Will create .vibecheck/config.json with default settings`;
  },
};

/**
 * Fix invalid configuration file
 */
export const fixConfigFix: Fix = {
  id: 'fix-config',
  name: 'Fix Configuration',
  description: 'Replace invalid config.json with default',
  
  apply: async (): Promise<FixResult> => {
    const configPath = path.join(process.cwd(), '.vibecheck', 'config.json');
    const backupPath = path.join(process.cwd(), '.vibecheck', 'config.json.bak');

    try {
      // Backup existing file
      if (fs.existsSync(configPath)) {
        fs.copyFileSync(configPath, backupPath);
      }

      // Apply create-config fix
      return createConfigFix.apply();
    } catch (error) {
      return {
        success: false,
        message: `Failed to fix config: ${error}`,
      };
    }
  },

  preview: async (): Promise<string> => {
    return `Will backup existing config and create new default configuration`;
  },
};

/**
 * Create .gitignore entries
 */
export const createGitignoreFix: Fix = {
  id: 'gitignore',
  name: 'Update .gitignore',
  description: 'Add .vibecheck entries to .gitignore',
  
  apply: async (): Promise<FixResult> => {
    const gitignorePath = path.join(process.cwd(), '.gitignore');
    const entries = [
      '',
      '# VibeCheck',
      '.vibecheck/checkpoints/',
      '.vibecheck/cache/',
      '.vibecheck/*.log',
    ];

    try {
      let content = '';
      
      if (fs.existsSync(gitignorePath)) {
        content = fs.readFileSync(gitignorePath, 'utf-8');
        
        // Check if already present
        if (content.includes('# VibeCheck')) {
          return {
            success: true,
            message: '.gitignore already contains VibeCheck entries',
          };
        }
      }

      content += entries.join('\n') + '\n';
      fs.writeFileSync(gitignorePath, content, 'utf-8');

      return {
        success: true,
        message: 'Added VibeCheck entries to .gitignore',
        changes: [gitignorePath],
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to update .gitignore: ${error}`,
      };
    }
  },

  preview: async (): Promise<string> => {
    return [
      'Will add to .gitignore:',
      '  .vibecheck/checkpoints/',
      '  .vibecheck/cache/',
      '  .vibecheck/*.log',
    ].join('\n');
  },
};

/**
 * Initialize secrets allowlist
 */
export const createAllowlistFix: Fix = {
  id: 'create-allowlist',
  name: 'Create Secrets Allowlist',
  description: 'Create .vibecheck/secrets.allowlist file',
  
  apply: async (): Promise<FixResult> => {
    const dir = path.join(process.cwd(), '.vibecheck');
    const filePath = path.join(dir, 'secrets.allowlist');

    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const content = [
        '# VibeCheck Secrets Allowlist',
        '# Add SHA256 fingerprints of false positives to suppress',
        '# One fingerprint per line',
        '',
      ].join('\n');

      fs.writeFileSync(filePath, content, 'utf-8');

      return {
        success: true,
        message: 'Created secrets allowlist',
        changes: [filePath],
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to create allowlist: ${error}`,
      };
    }
  },

  preview: async (): Promise<string> => {
    return 'Will create .vibecheck/secrets.allowlist';
  },
};

// ============================================================================
// All Built-in Fixes
// ============================================================================

export const BUILT_IN_FIXES: Fix[] = [
  createConfigFix,
  fixConfigFix,
  createGitignoreFix,
  createAllowlistFix,
];

// ============================================================================
// Fix Runner
// ============================================================================

/**
 * Get fix by ID
 */
export function getFix(
  fixId: string,
  fixes: Fix[] = BUILT_IN_FIXES
): Fix | undefined {
  return fixes.find(f => f.id === fixId);
}

/**
 * Apply a fix by ID
 */
export async function applyFix(
  fixId: string,
  fixes: Fix[] = BUILT_IN_FIXES
): Promise<FixResult | null> {
  const fix = getFix(fixId, fixes);
  
  if (!fix) {
    return null;
  }

  return fix.apply();
}

/**
 * Preview a fix by ID
 */
export async function previewFix(
  fixId: string,
  fixes: Fix[] = BUILT_IN_FIXES
): Promise<string | null> {
  const fix = getFix(fixId, fixes);
  
  if (!fix || !fix.preview) {
    return null;
  }

  return fix.preview();
}

/**
 * List all available fixes
 */
export function listFixes(fixes: Fix[] = BUILT_IN_FIXES): Fix[] {
  return fixes;
}
