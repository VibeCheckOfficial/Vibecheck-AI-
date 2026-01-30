/**
 * Environment Scanner
 * 
 * Scans codebase to extract environment variable usage
 * and validate against .env files.
 */

import { glob } from 'glob';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { EnvVariable } from '../schemas/env.schema.js';

export interface EnvScannerConfig {
  envFiles: string[];
  codePatterns: string[];
  excludePatterns: string[];
}

const DEFAULT_CONFIG: EnvScannerConfig = {
  envFiles: ['.env', '.env.local', '.env.development', '.env.production', '.env.example'],
  codePatterns: ['**/*.ts', '**/*.js', '**/*.tsx', '**/*.jsx'],
  excludePatterns: ['node_modules/**', 'dist/**', 'build/**'],
};

export class EnvScanner {
  private projectRoot: string;
  private config: EnvScannerConfig;

  constructor(projectRoot: string, config: Partial<EnvScannerConfig> = {}) {
    this.projectRoot = projectRoot;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Scan project for environment variable definitions and usage
   */
  async scan(): Promise<EnvVariable[]> {
    const definedVars = await this.scanEnvFiles();
    const usedVars = await this.scanCodeUsage();

    return this.mergeVariables(definedVars, usedVars);
  }

  /**
   * Parse .env files to extract variable definitions
   */
  private async scanEnvFiles(): Promise<Map<string, Partial<EnvVariable>>> {
    const variables = new Map<string, Partial<EnvVariable>>();

    for (const envFile of this.config.envFiles) {
      const filePath = path.join(this.projectRoot, envFile);
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const parsed = this.parseEnvFile(content, envFile);
        
        for (const [name, info] of parsed) {
          // Merge with existing, preferring non-example files
          const existing = variables.get(name);
          if (!existing || !envFile.includes('example')) {
            variables.set(name, { ...existing, ...info });
          }
        }
      } catch {
        // File doesn't exist, skip
      }
    }

    return variables;
  }

  /**
   * Parse a single .env file content
   */
  private parseEnvFile(content: string, fileName: string): Map<string, Partial<EnvVariable>> {
    const variables = new Map<string, Partial<EnvVariable>>();
    const lines = content.split('\n');
    let currentComment = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Handle comments (may be description for next variable)
      if (line.startsWith('#')) {
        currentComment = line.slice(1).trim();
        continue;
      }

      // Skip empty lines
      if (!line) {
        currentComment = '';
        continue;
      }

      // Parse KEY=value
      const match = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/i);
      if (match) {
        const name = match[1];
        let value = match[2];

        // Remove quotes from value
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }

        // Determine if this is from an example file (making it required)
        const isExample = fileName.includes('example');

        variables.set(name, {
          name,
          type: this.inferType(name),
          required: isExample, // Variables in .env.example are typically required
          defaultValue: isExample ? undefined : value,
          description: currentComment || undefined,
          sensitive: this.isSensitive(name),
        });

        currentComment = '';
      }
    }

    return variables;
  }

  /**
   * Scan code files for environment variable usage
   */
  private async scanCodeUsage(): Promise<Map<string, { file: string; line: number }[]>> {
    const usage = new Map<string, { file: string; line: number }[]>();

    // Get all code files
    const files: string[] = [];
    for (const pattern of this.config.codePatterns) {
      const matches = await glob(pattern, {
        cwd: this.projectRoot,
        ignore: this.config.excludePatterns,
        absolute: true,
      });
      files.push(...matches);
    }

    // Patterns to match env variable access
    const envPatterns = [
      // process.env.VAR_NAME or process.env['VAR_NAME']
      /process\.env\.([A-Z_][A-Z0-9_]*)/gi,
      /process\.env\[['"]([A-Z_][A-Z0-9_]*)['"]\]/gi,
      // import.meta.env.VAR_NAME (Vite)
      /import\.meta\.env\.([A-Z_][A-Z0-9_]*)/gi,
      // Deno.env.get('VAR_NAME')
      /Deno\.env\.get\(['"]([A-Z_][A-Z0-9_]*)['"]\)/gi,
      // env('VAR_NAME') or getenv('VAR_NAME')
      /(?:env|getenv)\(['"]([A-Z_][A-Z0-9_]*)['"]\)/gi,
    ];

    for (const filePath of files) {
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.split('\n');
        const relativePath = path.relative(this.projectRoot, filePath);

        for (const pattern of envPatterns) {
          pattern.lastIndex = 0;
          let match;
          while ((match = pattern.exec(content)) !== null) {
            const varName = match[1];
            
            // Find line number
            const position = match.index;
            let lineNumber = 1;
            let charCount = 0;
            for (const line of lines) {
              charCount += line.length + 1;
              if (charCount > position) break;
              lineNumber++;
            }

            // Add to usage map
            const existingUsage = usage.get(varName) || [];
            existingUsage.push({ file: relativePath, line: lineNumber });
            usage.set(varName, existingUsage);
          }
        }
      } catch {
        // Skip files that can't be read
      }
    }

    return usage;
  }

  /**
   * Merge defined and used variables
   */
  private mergeVariables(
    defined: Map<string, Partial<EnvVariable>>,
    used: Map<string, { file: string; line: number }[]>
  ): EnvVariable[] {
    const merged: EnvVariable[] = [];

    // Combine defined and used variables
    const allNames = new Set([...defined.keys(), ...used.keys()]);

    for (const name of allNames) {
      const def = defined.get(name) ?? {};
      const usedIn = used.get(name) ?? [];

      merged.push({
        name,
        type: def.type ?? this.inferType(name),
        required: def.required ?? usedIn.length > 0,
        defaultValue: def.defaultValue,
        description: def.description,
        usedIn,
        sensitive: this.isSensitive(name),
      });
    }

    // Sort by name for consistent output
    return merged.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Infer the type of an environment variable from its name
   */
  private inferType(name: string): 'string' | 'number' | 'boolean' | 'url' | 'secret' {
    const nameLower = name.toLowerCase();
    
    if (nameLower.includes('url') || nameLower.includes('uri') || nameLower.includes('endpoint')) {
      return 'url';
    }
    if (nameLower.includes('port') || nameLower.includes('count') || nameLower.includes('size') || 
        nameLower.includes('limit') || nameLower.includes('timeout') || nameLower.includes('max') ||
        nameLower.includes('min')) {
      return 'number';
    }
    if (nameLower.includes('enabled') || nameLower.includes('debug') || nameLower.includes('is_') ||
        nameLower.includes('has_') || nameLower.includes('use_') || nameLower.includes('allow')) {
      return 'boolean';
    }
    if (this.isSensitive(name)) {
      return 'secret';
    }
    
    return 'string';
  }

  /**
   * Check if a variable name indicates sensitive data
   */
  private isSensitive(name: string): boolean {
    const sensitivePatterns = [
      'secret', 'password', 'passwd', 'pwd',
      'token', 'key', 'api_key', 'apikey', 'api-key',
      'private', 'credential', 'auth',
      'access_token', 'refresh_token',
      'client_secret', 'signing_key',
      'encryption', 'decrypt', 'cert',
    ];
    const nameLower = name.toLowerCase();
    return sensitivePatterns.some((p) => nameLower.includes(p));
  }
}
