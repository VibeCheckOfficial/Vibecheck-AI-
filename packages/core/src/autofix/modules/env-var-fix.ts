/**
 * Env Var Fix Module
 * 
 * Fixes undefined environment variable issues:
 * - Adds missing vars to .env.example
 * - Adds fail-fast runtime checks
 * - Provides sensible defaults where appropriate
 */

import * as parser from '@babel/parser';
import _traverse from '@babel/traverse';

const traverse = (_traverse as unknown as { default: typeof _traverse }).default ?? _traverse;
import * as t from '@babel/types';
import type { Issue, Patch, FixContext, IssueType, ConfidenceLevel } from '../types.js';
import { BaseFixModule } from './base-fix-module.js';

/**
 * Information about an environment variable
 */
interface EnvVarInfo {
  name: string;
  type?: 'string' | 'number' | 'boolean' | 'url' | 'secret';
  required: boolean;
  defaultValue?: string;
  description?: string;
  usedIn?: string[];
  sensitive?: boolean;
}

/**
 * Common env var patterns and their types
 */
const ENV_VAR_PATTERNS: Record<string, Partial<EnvVarInfo>> = {
  API_KEY: { type: 'secret', sensitive: true, description: 'API key for external service' },
  SECRET: { type: 'secret', sensitive: true, description: 'Secret key' },
  TOKEN: { type: 'secret', sensitive: true, description: 'Authentication token' },
  PASSWORD: { type: 'secret', sensitive: true, description: 'Password' },
  URL: { type: 'url', description: 'URL endpoint' },
  HOST: { type: 'string', description: 'Host address' },
  PORT: { type: 'number', defaultValue: '3000', description: 'Port number' },
  DATABASE: { type: 'url', sensitive: true, description: 'Database connection string' },
  DB_: { type: 'string', description: 'Database configuration' },
  NODE_ENV: { type: 'string', defaultValue: 'development', description: 'Node environment' },
  DEBUG: { type: 'boolean', defaultValue: 'false', description: 'Debug mode' },
  LOG_LEVEL: { type: 'string', defaultValue: 'info', description: 'Logging level' },
};

/**
 * EnvVarFixModule handles undefined environment variable issues
 */
export class EnvVarFixModule extends BaseFixModule {
  readonly id = 'env-var-fix';
  readonly name = 'Environment Variable Fix';
  readonly issueTypes: IssueType[] = ['ghost-env'];
  readonly confidence: ConfidenceLevel = 'high';

  /**
   * Check if this module can fix the given issue
   */
  canFix(issue: Issue): boolean {
    return this.issueTypes.includes(issue.type);
  }

  /**
   * Generate a fix for the given issue
   */
  async generateFix(issue: Issue, context: FixContext): Promise<Patch | null> {
    const envVarName = this.getIssueValue(issue);
    if (!envVarName) {
      return null;
    }

    // Determine what kind of fix to apply
    const envInfo = this.analyzeEnvVar(envVarName, context);
    
    // Try to fix .env.example first
    const envExamplePatch = await this.fixEnvExample(envVarName, envInfo, context);
    if (envExamplePatch) {
      return envExamplePatch;
    }

    // If no .env.example, try to add fail-fast check in code
    const filePath = this.getIssueFilePath(issue);
    if (filePath) {
      return this.addFailFastCheck(filePath, envVarName, envInfo, context, issue.id);
    }

    return null;
  }

  /**
   * Get a human-readable description of the fix
   */
  getFixDescription(issue: Issue): string {
    const envVarName = this.getIssueValue(issue) ?? 'environment variable';
    return `Add ${envVarName} to .env.example and add validation`;
  }

  /**
   * Get module description
   */
  protected getModuleDescription(): string {
    return 'Fixes undefined environment variables by adding them to .env.example and adding runtime validation';
  }

  /**
   * Analyze an environment variable to determine its type and properties
   */
  private analyzeEnvVar(name: string, context: FixContext): EnvVarInfo {
    const info: EnvVarInfo = {
      name,
      required: true,
      sensitive: false,
    };

    // Check truthpack for existing info
    const envData = context.truthpack?.env?.find((e) => e.name === name);
    if (envData) {
      return {
        name,
        type: envData.type as EnvVarInfo['type'],
        required: envData.required,
        defaultValue: envData.defaultValue,
        description: envData.description,
        sensitive: envData.sensitive,
      };
    }

    // Infer from name patterns
    const upperName = name.toUpperCase();
    
    for (const [pattern, defaults] of Object.entries(ENV_VAR_PATTERNS)) {
      if (upperName.includes(pattern)) {
        Object.assign(info, defaults);
        break;
      }
    }

    // Generate description if not set
    if (!info.description) {
      info.description = this.generateDescription(name);
    }

    return info;
  }

  /**
   * Generate a description for an env var based on its name
   */
  private generateDescription(name: string): string {
    // Convert SCREAMING_SNAKE_CASE to words
    const words = name.toLowerCase().split('_');
    const readable = words.join(' ');
    return `${readable.charAt(0).toUpperCase() + readable.slice(1)} configuration`;
  }

  /**
   * Fix by adding to .env.example
   */
  private async fixEnvExample(
    envVarName: string,
    envInfo: EnvVarInfo,
    context: FixContext
  ): Promise<Patch | null> {
    // Check common .env example file names
    const envExampleFiles = ['.env.example', '.env.sample', '.env.template', 'example.env'];
    
    let envExamplePath: string | null = null;
    let envExampleContent: string | null = null;

    for (const filename of envExampleFiles) {
      envExampleContent = await this.readFile(context, filename);
      if (envExampleContent !== null) {
        envExamplePath = filename;
        break;
      }
    }

    // If no env example file exists, create .env.example
    if (envExamplePath === null) {
      envExamplePath = '.env.example';
      envExampleContent = '# Environment Variables\n# Copy this file to .env and fill in the values\n\n';
    }

    // Check if variable already exists
    if (envExampleContent.includes(`${envVarName}=`)) {
      return null;
    }

    // Build the new entry
    const entry = this.buildEnvEntry(envVarName, envInfo);

    // Find the appropriate section to add the variable
    const newContent = this.addToEnvFile(envExampleContent, entry, envInfo);

    return this.createPatch(
      envExamplePath,
      envExampleContent.startsWith('#') ? envExampleContent : '',
      newContent,
      `env-${envVarName}`
    );
  }

  /**
   * Build an entry for the .env file
   */
  private buildEnvEntry(name: string, info: EnvVarInfo): string {
    const lines: string[] = [];

    // Add description comment
    if (info.description) {
      lines.push(`# ${info.description}`);
    }

    // Add required/optional indicator
    if (!info.required) {
      lines.push('# Optional');
    }

    // Build the value placeholder
    let value: string;
    if (info.defaultValue) {
      value = info.defaultValue;
    } else if (info.sensitive) {
      value = '<REQUIRED_SECRET>';
    } else {
      switch (info.type) {
        case 'url':
          value = 'https://example.com';
          break;
        case 'number':
          value = '0';
          break;
        case 'boolean':
          value = 'false';
          break;
        default:
          value = info.required ? '<REQUIRED>' : '';
      }
    }

    lines.push(`${name}=${value}`);
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Add entry to env file in appropriate section
   */
  private addToEnvFile(content: string, entry: string, info: EnvVarInfo): string {
    const lines = content.split('\n');
    
    // Try to find a section based on the var name pattern
    const sectionPatterns: Record<string, string[]> = {
      '# Database': ['DB_', 'DATABASE', 'POSTGRES', 'MYSQL', 'MONGO'],
      '# API': ['API_', 'ENDPOINT', 'URL'],
      '# Authentication': ['AUTH', 'JWT', 'SESSION', 'TOKEN', 'SECRET'],
      '# Server': ['PORT', 'HOST', 'SERVER'],
    };

    // Find matching section
    let targetSection: string | null = null;
    for (const [section, patterns] of Object.entries(sectionPatterns)) {
      if (patterns.some((p) => info.name.toUpperCase().includes(p))) {
        targetSection = section;
        break;
      }
    }

    if (targetSection) {
      // Find the section in the file
      const sectionIndex = lines.findIndex((line) => line.startsWith(targetSection));
      
      if (sectionIndex !== -1) {
        // Find the end of the section (next section header or end of file)
        let endIndex = sectionIndex + 1;
        while (endIndex < lines.length) {
          if (lines[endIndex].startsWith('#') && lines[endIndex].trim().length > 1) {
            break;
          }
          endIndex++;
        }
        
        // Insert before the end of section
        lines.splice(endIndex, 0, entry);
        return lines.join('\n');
      }
    }

    // No matching section found, add at the end
    // Ensure there's a newline before adding
    if (lines[lines.length - 1]?.trim() !== '') {
      lines.push('');
    }
    lines.push(entry);

    return lines.join('\n');
  }

  /**
   * Add fail-fast check to source code
   */
  private async addFailFastCheck(
    filePath: string,
    envVarName: string,
    envInfo: EnvVarInfo,
    context: FixContext,
    issueId: string
  ): Promise<Patch | null> {
    const content = await this.readFile(context, filePath);
    if (!content) {
      return null;
    }

    // Only modify config/initialization files
    const isConfigFile = 
      filePath.includes('config') ||
      filePath.includes('env') ||
      filePath.includes('init') ||
      filePath.includes('index');

    if (!isConfigFile) {
      // For non-config files, we'd need to add the check at the usage site
      // which is more complex - return null for now
      return null;
    }

    try {
      const ast = this.parseCode(content, filePath);
      if (!ast) {
        return null;
      }

      // Check if there's already a check for this env var
      if (this.hasEnvCheck(ast, envVarName)) {
        return null;
      }

      // Find where process.env is accessed and add validation
      const fixedContent = this.addEnvValidation(content, envVarName, envInfo, filePath);

      if (fixedContent === content) {
        return null;
      }

      return this.createPatch(filePath, content, fixedContent, issueId);
    } catch {
      return null;
    }
  }

  /**
   * Check if the code already has a check for the env var
   */
  private hasEnvCheck(ast: t.File, envVarName: string): boolean {
    let hasCheck = false;

    traverse(ast, {
      IfStatement: (path) => {
        const test = path.node.test;
        
        // Check for !process.env.VAR_NAME
        if (
          t.isUnaryExpression(test, { operator: '!' }) &&
          t.isMemberExpression(test.argument)
        ) {
          const member = test.argument;
          if (
            t.isMemberExpression(member.object) &&
            t.isIdentifier(member.object.object, { name: 'process' }) &&
            t.isIdentifier(member.object.property, { name: 'env' }) &&
            t.isIdentifier(member.property, { name: envVarName })
          ) {
            hasCheck = true;
          }
        }
      },
      CallExpression: (path) => {
        // Check for validation libraries like zod, joi, etc.
        const callee = path.node.callee;
        if (
          t.isMemberExpression(callee) &&
          t.isIdentifier(callee.property)
        ) {
          const method = callee.property.name;
          if (['parse', 'validate', 'check', 'assert'].includes(method)) {
            // Check if envVarName is mentioned in the arguments
            const argsStr = JSON.stringify(path.node.arguments);
            if (argsStr.includes(envVarName)) {
              hasCheck = true;
            }
          }
        }
      },
    });

    return hasCheck;
  }

  /**
   * Add env validation code
   */
  private addEnvValidation(
    content: string,
    envVarName: string,
    envInfo: EnvVarInfo,
    filePath: string
  ): string {
    const lines = content.split('\n');
    const indent = this.detectIndentation(content);
    const indentStr = indent.char.repeat(indent.size);

    // Build the validation code
    let validationCode: string;

    if (envInfo.required) {
      if (envInfo.defaultValue) {
        validationCode = `
const ${this.toCamelCase(envVarName)} = process.env.${envVarName} ?? '${envInfo.defaultValue}';
`;
      } else {
        validationCode = `
if (!process.env.${envVarName}) {
${indentStr}throw new Error('${envVarName} environment variable is required but not set');
}
const ${this.toCamelCase(envVarName)} = process.env.${envVarName};
`;
      }
    } else {
      validationCode = `
const ${this.toCamelCase(envVarName)} = process.env.${envVarName}${envInfo.defaultValue ? ` ?? '${envInfo.defaultValue}'` : ''};
`;
    }

    // Find the right place to insert the validation
    // Look for existing env var accesses or near the top of the file after imports
    const lastImportLine = this.findLastImportLine(lines);
    
    // Check if there's already a section for env validation
    let insertIndex = lastImportLine + 1;
    
    for (let i = lastImportLine + 1; i < lines.length; i++) {
      if (lines[i].includes('process.env')) {
        insertIndex = i;
        break;
      }
    }

    // Skip any blank lines after imports
    while (insertIndex < lines.length && lines[insertIndex].trim() === '') {
      insertIndex++;
    }

    // Insert the validation code
    lines.splice(insertIndex, 0, validationCode.trim());

    return lines.join('\n');
  }

  /**
   * Convert SCREAMING_SNAKE_CASE to camelCase
   */
  private toCamelCase(name: string): string {
    return name
      .toLowerCase()
      .split('_')
      .map((word, index) => 
        index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)
      )
      .join('');
  }

  /**
   * Parse code into AST
   */
  private parseCode(content: string, filePath: string): t.File | null {
    try {
      const isTypeScript = filePath.endsWith('.ts') || filePath.endsWith('.tsx');

      return parser.parse(content, {
        sourceType: 'module',
        plugins: isTypeScript
          ? ['typescript', 'decorators-legacy']
          : ['decorators-legacy'],
      });
    } catch {
      return null;
    }
  }

  /**
   * Find the last import line in the file
   */
  private findLastImportLine(lines: string[]): number {
    let lastImport = -1;
    
    for (let i = 0; i < lines.length; i++) {
      if (
        lines[i].trimStart().startsWith('import ') ||
        (lines[i].includes('require(') && lines[i].trimStart().startsWith('const '))
      ) {
        lastImport = i;
      }
    }
    
    return lastImport;
  }
}
