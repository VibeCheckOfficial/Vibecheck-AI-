/**
 * Contract Scanner
 * 
 * Scans codebase to extract API contracts from various sources
 * (OpenAPI specs, Zod schemas, TypeScript types).
 */

import { glob } from 'glob';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { ApiContract } from '../schemas/contracts.schema.js';

export interface ContractScannerConfig {
  sources: ('openapi' | 'zod' | 'typescript' | 'jsdoc')[];
  patterns: string[];
  excludePatterns: string[];
}

const DEFAULT_CONFIG: ContractScannerConfig = {
  sources: ['zod', 'typescript', 'openapi'],
  patterns: ['**/*.ts', '**/*.yaml', '**/*.json', '**/*.yml'],
  excludePatterns: ['node_modules/**', 'dist/**', 'build/**'],
};

export class ContractScanner {
  private projectRoot: string;
  private config: ContractScannerConfig;

  constructor(projectRoot: string, config: Partial<ContractScannerConfig> = {}) {
    this.projectRoot = projectRoot;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get files matching a specific pattern
   */
  private async getFiles(patterns: string[]): Promise<string[]> {
    const files: string[] = [];
    for (const pattern of patterns) {
      const matches = await glob(pattern, {
        cwd: this.projectRoot,
        ignore: this.config.excludePatterns,
        absolute: true,
      });
      files.push(...matches);
    }
    return [...new Set(files)];
  }

  /**
   * Scan project for API contracts
   */
  async scan(): Promise<ApiContract[]> {
    const contracts: ApiContract[] = [];

    for (const source of this.config.sources) {
      switch (source) {
        case 'openapi':
          contracts.push(...await this.scanOpenApi());
          break;
        case 'zod':
          contracts.push(...await this.scanZodSchemas());
          break;
        case 'typescript':
          contracts.push(...await this.scanTypeScriptTypes());
          break;
        case 'jsdoc':
          contracts.push(...await this.scanJsDoc());
          break;
      }
    }

    return this.mergeContracts(contracts);
  }

  /**
   * Scan for OpenAPI/Swagger specifications
   */
  private async scanOpenApi(): Promise<ApiContract[]> {
    const contracts: ApiContract[] = [];
    const files = await this.getFiles([
      '**/openapi.yaml', '**/openapi.yml', '**/openapi.json',
      '**/swagger.yaml', '**/swagger.yml', '**/swagger.json',
      '**/api-spec.yaml', '**/api-spec.json',
    ]);

    for (const filePath of files) {
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        let spec: Record<string, unknown>;

        // Parse YAML or JSON
        if (filePath.endsWith('.json')) {
          spec = JSON.parse(content);
        } else {
          // Simple YAML parsing for common patterns
          spec = this.parseSimpleYaml(content);
        }

        // Extract paths from OpenAPI spec
        const paths = (spec.paths || {}) as Record<string, Record<string, unknown>>;
        
        for (const [pathKey, pathValue] of Object.entries(paths)) {
          for (const [method, operation] of Object.entries(pathValue)) {
            if (['get', 'post', 'put', 'patch', 'delete', 'options', 'head'].includes(method)) {
              const op = operation as Record<string, unknown>;
              
              contracts.push({
                path: pathKey,
                method: method.toUpperCase(),
                operationId: op.operationId as string | undefined,
                summary: op.summary as string | undefined,
                description: op.description as string | undefined,
                tags: op.tags as string[] | undefined,
                request: this.extractOpenApiRequest(op),
                responses: this.extractOpenApiResponses(op),
              });
            }
          }
        }
      } catch {
        // Skip files that can't be parsed
      }
    }

    return contracts;
  }

  /**
   * Simple YAML parser for common patterns (basic implementation)
   */
  private parseSimpleYaml(content: string): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const lines = content.split('\n');
    let currentPath: string[] = [];
    let currentIndent = 0;

    for (const line of lines) {
      if (line.trim().startsWith('#') || !line.trim()) continue;

      const indent = line.search(/\S/);
      const trimmed = line.trim();
      
      // Handle key: value pairs
      const kvMatch = trimmed.match(/^(\w+):\s*(.*)$/);
      if (kvMatch) {
        const [, key, value] = kvMatch;
        
        // Adjust current path based on indentation
        while (currentPath.length > 0 && indent <= currentIndent) {
          currentPath.pop();
          currentIndent -= 2;
        }
        
        if (value) {
          // Simple value
          this.setNestedValue(result, [...currentPath, key], value.replace(/^['"]|['"]$/g, ''));
        } else {
          // Object/array starts
          currentPath.push(key);
          currentIndent = indent;
          this.setNestedValue(result, currentPath, {});
        }
      }
    }

    return result;
  }

  /**
   * Set a nested value in an object
   */
  private setNestedValue(obj: Record<string, unknown>, path: string[], value: unknown): void {
    let current: Record<string, unknown> = obj;
    for (let i = 0; i < path.length - 1; i++) {
      if (!current[path[i]]) {
        current[path[i]] = {};
      }
      current = current[path[i]] as Record<string, unknown>;
    }
    current[path[path.length - 1]] = value;
  }

  /**
   * Extract request info from OpenAPI operation
   */
  private extractOpenApiRequest(operation: Record<string, unknown>): ApiContract['request'] {
    const request: ApiContract['request'] = {};
    
    // Extract parameters
    const params = operation.parameters as Array<Record<string, unknown>> | undefined;
    if (params) {
      for (const param of params) {
        const location = param.in as string;
        const name = param.name as string;
        const schema = param.schema as Record<string, unknown> | undefined;
        
        if (location === 'path') {
          request.params = request.params || {};
          request.params[name] = {
            type: (schema?.type as string) || 'string',
            required: param.required as boolean || false,
            description: param.description as string | undefined,
          };
        } else if (location === 'query') {
          request.query = request.query || {};
          request.query[name] = {
            type: (schema?.type as string) || 'string',
            required: param.required as boolean || false,
            description: param.description as string | undefined,
          };
        } else if (location === 'header') {
          request.headers = request.headers || {};
          request.headers[name] = {
            type: 'string',
            required: param.required as boolean || false,
            description: param.description as string | undefined,
          };
        }
      }
    }

    // Extract request body
    const requestBody = operation.requestBody as Record<string, unknown> | undefined;
    if (requestBody) {
      const content = requestBody.content as Record<string, Record<string, unknown>> | undefined;
      const jsonContent = content?.['application/json'];
      if (jsonContent?.schema) {
        request.body = this.schemaToProperty(jsonContent.schema as Record<string, unknown>);
      }
    }

    return request;
  }

  /**
   * Extract responses from OpenAPI operation
   */
  private extractOpenApiResponses(operation: Record<string, unknown>): ApiContract['responses'] {
    const responses: ApiContract['responses'] = [];
    const opResponses = operation.responses as Record<string, Record<string, unknown>> | undefined;

    if (opResponses) {
      for (const [statusCode, response] of Object.entries(opResponses)) {
        const content = response.content as Record<string, Record<string, unknown>> | undefined;
        const jsonContent = content?.['application/json'];
        
        responses.push({
          statusCode: parseInt(statusCode, 10) || 200,
          description: response.description as string | undefined,
          body: jsonContent?.schema ? this.schemaToProperty(jsonContent.schema as Record<string, unknown>) : undefined,
        });
      }
    }

    return responses;
  }

  /**
   * Convert OpenAPI schema to our property format
   */
  private schemaToProperty(schema: Record<string, unknown>): unknown {
    const type = schema.type as string;
    return {
      type: type || 'object',
      required: schema.required as boolean | undefined,
      description: schema.description as string | undefined,
      properties: schema.properties,
      items: schema.items,
      enum: schema.enum,
    };
  }

  /**
   * Scan for Zod schema definitions
   */
  private async scanZodSchemas(): Promise<ApiContract[]> {
    const contracts: ApiContract[] = [];
    const files = await this.getFiles(['**/*.ts', '**/*.js']);

    // Patterns to find Zod schemas that look like API contracts
    const schemaPatterns = [
      // export const userSchema = z.object({...})
      /export\s+const\s+(\w+(?:Schema|Request|Response|Body|Params|Query))\s*=\s*z\.object\s*\(\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}\s*\)/gi,
      // const requestSchema = z.object({...})
      /const\s+(\w+(?:Request|Body|Params|Query)Schema)\s*=\s*z\.object\s*\(\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}\s*\)/gi,
    ];

    // Pattern to find routes that use these schemas
    const routeSchemaPatterns = [
      // .input(schema) or .body(schema)
      /\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`][^)]*\)\.(?:input|body)\s*\(\s*(\w+)\s*\)/gi,
      // validate(schema) as middleware
      /\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*validate\s*\(\s*(\w+)\s*\)/gi,
    ];

    for (const filePath of files) {
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const relativePath = path.relative(this.projectRoot, filePath);

        // Skip files without zod
        if (!content.includes('zod') && !content.includes('z.')) {
          continue;
        }

        // Extract schema definitions
        const schemas = new Map<string, string>();
        for (const pattern of schemaPatterns) {
          pattern.lastIndex = 0;
          let match;
          while ((match = pattern.exec(content)) !== null) {
            const schemaName = match[1];
            const schemaContent = match[2];
            schemas.set(schemaName, schemaContent);
          }
        }

        // If schemas found, try to link them to routes
        if (schemas.size > 0) {
          // Look for routes in the same file or related files
          for (const routePattern of routeSchemaPatterns) {
            routePattern.lastIndex = 0;
            let match;
            while ((match = routePattern.exec(content)) !== null) {
              const method = match[1].toUpperCase();
              const routePath = match[2];
              const schemaRef = match[3];

              const schemaContent = schemas.get(schemaRef);
              
              contracts.push({
                path: routePath,
                method,
                description: `Schema: ${schemaRef}`,
                request: schemaContent ? {
                  body: this.parseZodSchemaContent(schemaContent),
                } : {},
                responses: [{
                  statusCode: 200,
                  description: 'Success',
                }],
              });
            }
          }

          // Also create contracts for standalone schemas (might be used elsewhere)
          for (const [schemaName, schemaContent] of schemas) {
            // Infer if it's a request or response schema
            const isRequest = /request|body|input|params|query/i.test(schemaName);
            const isResponse = /response|output|result/i.test(schemaName);
            
            // Try to infer the path from the schema name
            const pathMatch = schemaName.match(/(\w+?)(?:Request|Response|Schema|Body)/i);
            const inferredPath = pathMatch ? `/api/${pathMatch[1].toLowerCase()}` : undefined;

            if (inferredPath && !contracts.find(c => c.path === inferredPath)) {
              contracts.push({
                path: inferredPath,
                method: isRequest ? 'POST' : 'GET',
                description: `Inferred from schema: ${schemaName}`,
                request: isRequest ? { body: this.parseZodSchemaContent(schemaContent) } : {},
                responses: isResponse ? [{
                  statusCode: 200,
                  body: this.parseZodSchemaContent(schemaContent),
                }] : [],
              });
            }
          }
        }
      } catch {
        // Skip files that can't be read
      }
    }

    return contracts;
  }

  /**
   * Parse Zod schema content into a simplified structure
   */
  private parseZodSchemaContent(content: string): unknown {
    const properties: Record<string, unknown> = {};
    
    // Match field definitions like: name: z.string(), age: z.number().optional()
    const fieldPattern = /(\w+)\s*:\s*z\.(\w+)\(\)(?:\.(\w+)\(\))?/g;
    let match;
    while ((match = fieldPattern.exec(content)) !== null) {
      const [, fieldName, zodType, modifier] = match;
      properties[fieldName] = {
        type: this.zodTypeToJsonType(zodType),
        required: modifier !== 'optional' && modifier !== 'nullable',
      };
    }

    return {
      type: 'object',
      properties,
    };
  }

  /**
   * Convert Zod type to JSON schema type
   */
  private zodTypeToJsonType(zodType: string): string {
    const mapping: Record<string, string> = {
      string: 'string',
      number: 'number',
      boolean: 'boolean',
      array: 'array',
      object: 'object',
      date: 'string',
      bigint: 'number',
      null: 'null',
      undefined: 'null',
      any: 'object',
      unknown: 'object',
    };
    return mapping[zodType.toLowerCase()] || 'string';
  }

  /**
   * Scan for TypeScript interface/type definitions
   */
  private async scanTypeScriptTypes(): Promise<ApiContract[]> {
    const contracts: ApiContract[] = [];
    const files = await this.getFiles(['**/*.ts', '**/*.tsx']);

    // Patterns to find API-related type definitions
    const typePatterns = [
      // interface UserRequest { ... }
      /interface\s+(\w+(?:Request|Response|Params|Query|Body))\s*\{([^}]+)\}/gi,
      // type UserRequest = { ... }
      /type\s+(\w+(?:Request|Response|Params|Query|Body))\s*=\s*\{([^}]+)\}/gi,
    ];

    for (const filePath of files) {
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const relativePath = path.relative(this.projectRoot, filePath);

        for (const pattern of typePatterns) {
          pattern.lastIndex = 0;
          let match;
          while ((match = pattern.exec(content)) !== null) {
            const typeName = match[1];
            const typeContent = match[2];

            // Parse the type content
            const properties = this.parseTypeScriptTypeContent(typeContent);
            
            // Infer path and method from type name
            const pathMatch = typeName.match(/(\w+?)(?:Request|Response|Params|Query|Body)/i);
            const isRequest = /request|body|params|query/i.test(typeName);
            const inferredPath = pathMatch ? `/api/${pathMatch[1].toLowerCase()}` : undefined;

            if (inferredPath) {
              const existingContract = contracts.find(c => c.path === inferredPath);
              
              if (existingContract) {
                // Merge with existing
                if (isRequest) {
                  existingContract.request = { ...existingContract.request, body: properties };
                } else {
                  existingContract.responses = existingContract.responses || [];
                  existingContract.responses.push({ statusCode: 200, body: properties });
                }
              } else {
                contracts.push({
                  path: inferredPath,
                  method: isRequest ? 'POST' : 'GET',
                  description: `Inferred from type: ${typeName}`,
                  request: isRequest ? { body: properties } : {},
                  responses: isRequest ? [] : [{ statusCode: 200, body: properties }],
                });
              }
            }
          }
        }
      } catch {
        // Skip files that can't be read
      }
    }

    return contracts;
  }

  /**
   * Parse TypeScript type content into a simplified structure
   */
  private parseTypeScriptTypeContent(content: string): unknown {
    const properties: Record<string, unknown> = {};
    
    // Match field definitions like: name: string; age?: number;
    const fieldPattern = /(\w+)(\??)\s*:\s*([^;,\n]+)/g;
    let match;
    while ((match = fieldPattern.exec(content)) !== null) {
      const [, fieldName, optional, fieldType] = match;
      properties[fieldName] = {
        type: this.tsTypeToJsonType(fieldType.trim()),
        required: optional !== '?',
      };
    }

    return {
      type: 'object',
      properties,
    };
  }

  /**
   * Convert TypeScript type to JSON schema type
   */
  private tsTypeToJsonType(tsType: string): string {
    const cleanType = tsType.toLowerCase().replace(/\s/g, '');
    
    if (cleanType.includes('string')) return 'string';
    if (cleanType.includes('number')) return 'number';
    if (cleanType.includes('boolean')) return 'boolean';
    if (cleanType.includes('[]') || cleanType.includes('array')) return 'array';
    if (cleanType.includes('null')) return 'null';
    if (cleanType.includes('date')) return 'string';
    
    return 'object';
  }

  /**
   * Scan JSDoc comments for API documentation
   */
  private async scanJsDoc(): Promise<ApiContract[]> {
    const contracts: ApiContract[] = [];
    const files = await this.getFiles(['**/*.ts', '**/*.js']);

    // Pattern to find JSDoc blocks with API annotations
    const jsdocPattern = /\/\*\*[\s\S]*?@(?:api|route|endpoint)[\s\S]*?\*\//g;

    for (const filePath of files) {
      try {
        const content = await fs.readFile(filePath, 'utf-8');

        let match;
        while ((match = jsdocPattern.exec(content)) !== null) {
          const docBlock = match[0];

          // Extract API info from JSDoc
          const methodMatch = docBlock.match(/@(?:method|httpMethod)\s+(\w+)/i);
          const pathMatch = docBlock.match(/@(?:route|path|endpoint|api)\s+(\S+)/i);
          const descMatch = docBlock.match(/@(?:description|desc|summary)\s+(.+)/i);
          
          if (pathMatch) {
            const contract: ApiContract = {
              path: pathMatch[1],
              method: methodMatch?.[1]?.toUpperCase() || 'GET',
              description: descMatch?.[1],
              request: {},
              responses: [],
            };

            // Extract @param annotations
            const paramMatches = docBlock.matchAll(/@param\s+\{([^}]+)\}\s+(\w+)(?:\s+-\s*(.+))?/gi);
            for (const paramMatch of paramMatches) {
              const [, type, name, desc] = paramMatch;
              contract.request.params = contract.request.params || {};
              contract.request.params[name] = {
                type: this.tsTypeToJsonType(type),
                description: desc,
              };
            }

            // Extract @returns annotation
            const returnsMatch = docBlock.match(/@returns?\s+\{([^}]+)\}(?:\s+(.+))?/i);
            if (returnsMatch) {
              contract.responses.push({
                statusCode: 200,
                description: returnsMatch[2],
                body: { type: this.tsTypeToJsonType(returnsMatch[1]) },
              });
            }

            contracts.push(contract);
          }
        }
      } catch {
        // Skip files that can't be read
      }
    }

    return contracts;
  }

  /**
   * Merge contracts from different sources
   */
  private mergeContracts(contracts: ApiContract[]): ApiContract[] {
    const merged = new Map<string, ApiContract>();

    for (const contract of contracts) {
      const key = `${contract.method}:${contract.path}`;
      const existing = merged.get(key);

      if (existing) {
        merged.set(key, this.mergeTwo(existing, contract));
      } else {
        merged.set(key, contract);
      }
    }

    return Array.from(merged.values());
  }

  /**
   * Merge two contracts
   */
  private mergeTwo(a: ApiContract, b: ApiContract): ApiContract {
    return {
      ...a,
      ...b,
      description: a.description || b.description,
      summary: a.summary || b.summary,
      tags: [...new Set([...(a.tags || []), ...(b.tags || [])])],
      request: {
        headers: { ...a.request.headers, ...b.request.headers },
        params: { ...a.request.params, ...b.request.params },
        query: { ...a.request.query, ...b.request.query },
        body: a.request.body || b.request.body,
      },
      responses: this.mergeResponses(a.responses, b.responses),
    };
  }

  /**
   * Merge response arrays, avoiding duplicates by status code
   */
  private mergeResponses(
    a: ApiContract['responses'],
    b: ApiContract['responses']
  ): ApiContract['responses'] {
    const byStatus = new Map<number, ApiContract['responses'][0]>();
    
    for (const resp of [...a, ...b]) {
      const existing = byStatus.get(resp.statusCode);
      if (existing) {
        byStatus.set(resp.statusCode, {
          ...existing,
          ...resp,
          description: existing.description || resp.description,
        });
      } else {
        byStatus.set(resp.statusCode, resp);
      }
    }

    return Array.from(byStatus.values());
  }
}
