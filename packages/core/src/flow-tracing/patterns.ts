/**
 * Flow Tracing Patterns
 * 
 * Default patterns for identifying data sources, sinks, and validations.
 * These patterns are used by the flow analyzer to track data flow.
 * 
 * @module flow-tracing/patterns
 */

import type { SourcePattern, SinkPattern, ValidationPattern } from './types.js';

// ============================================================================
// Source Patterns
// ============================================================================

/**
 * Default patterns for identifying data sources
 */
export const DEFAULT_SOURCE_PATTERNS: SourcePattern[] = [
  // User Input
  {
    name: 'request_body',
    category: 'user_input',
    patterns: [
      'req.body',
      'request.body',
      'ctx.request.body',
      'event.body',
    ],
    description: 'HTTP request body data',
  },
  {
    name: 'query_params',
    category: 'user_input',
    patterns: [
      'req.query',
      'request.query',
      'ctx.query',
      'searchParams',
      'URLSearchParams',
    ],
    description: 'URL query parameters',
  },
  {
    name: 'route_params',
    category: 'user_input',
    patterns: [
      'req.params',
      'request.params',
      'ctx.params',
      'params.',
    ],
    description: 'URL route parameters',
  },
  {
    name: 'form_data',
    category: 'user_input',
    patterns: [
      'formData',
      'FormData',
      'req.files',
      'req.file',
    ],
    description: 'Form data and file uploads',
  },
  {
    name: 'headers',
    category: 'user_input',
    patterns: [
      'req.headers',
      'request.headers',
      'ctx.headers',
      'getHeader',
    ],
    description: 'HTTP headers',
  },
  {
    name: 'cookies',
    category: 'user_input',
    patterns: [
      'req.cookies',
      'request.cookies',
      'ctx.cookies',
      'getCookie',
    ],
    description: 'HTTP cookies',
  },
  // API Responses
  {
    name: 'fetch_response',
    category: 'api_response',
    patterns: [
      'fetch(',
      '.json()',
      'axios.',
      'got.',
      'request(',
    ],
    description: 'External API responses',
  },
  // Database
  {
    name: 'database_query',
    category: 'database',
    patterns: [
      '.query(',
      '.findOne(',
      '.findMany(',
      '.find(',
      '.select(',
      'prisma.',
      'db.query',
    ],
    description: 'Database query results',
  },
  // Environment
  {
    name: 'env_vars',
    category: 'environment',
    patterns: [
      'process.env',
      'import.meta.env',
      'Deno.env',
    ],
    description: 'Environment variables',
  },
  // File System
  {
    name: 'file_read',
    category: 'file_system',
    patterns: [
      'readFile',
      'readFileSync',
      'createReadStream',
      'fs.read',
    ],
    description: 'File system reads',
  },
];

// ============================================================================
// Sink Patterns
// ============================================================================

/**
 * Default patterns for identifying data sinks
 */
export const DEFAULT_SINK_PATTERNS: SinkPattern[] = [
  // Database Writes
  {
    name: 'database_insert',
    category: 'database_write',
    patterns: [
      '.insert(',
      '.create(',
      '.save(',
      '.insertMany(',
      'INSERT INTO',
    ],
    riskLevel: 'high',
    description: 'Database insertions',
  },
  {
    name: 'database_update',
    category: 'database_write',
    patterns: [
      '.update(',
      '.updateMany(',
      '.upsert(',
      'UPDATE ',
    ],
    riskLevel: 'high',
    description: 'Database updates',
  },
  {
    name: 'database_delete',
    category: 'database_write',
    patterns: [
      '.delete(',
      '.deleteMany(',
      '.remove(',
      'DELETE FROM',
    ],
    riskLevel: 'high',
    description: 'Database deletions',
  },
  // SQL Queries (Injection Risk)
  {
    name: 'raw_sql',
    category: 'sql_query',
    patterns: [
      '.raw(',
      '.rawQuery(',
      'db.execute(',
      'sql`',
      'query(`',
    ],
    riskLevel: 'critical',
    description: 'Raw SQL queries - potential injection risk',
  },
  // HTML/XSS
  {
    name: 'html_render',
    category: 'html_render',
    patterns: [
      'innerHTML',
      'outerHTML',
      'dangerouslySetInnerHTML',
      'document.write',
      'insertAdjacentHTML',
    ],
    riskLevel: 'critical',
    description: 'HTML rendering - potential XSS',
  },
  // Shell Execution
  {
    name: 'shell_exec',
    category: 'shell_exec',
    patterns: [
      'exec(',
      'execSync(',
      'spawn(',
      'spawnSync(',
      'child_process',
      '$(',
    ],
    riskLevel: 'critical',
    description: 'Shell command execution',
  },
  // Eval
  {
    name: 'eval',
    category: 'eval',
    patterns: [
      'eval(',
      'Function(',
      'setTimeout(string',
      'setInterval(string',
    ],
    riskLevel: 'critical',
    description: 'Dynamic code evaluation',
  },
  // API Calls
  {
    name: 'api_request',
    category: 'api_call',
    patterns: [
      'fetch(',
      'axios.post',
      'axios.put',
      'axios.patch',
      'request.post',
    ],
    riskLevel: 'medium',
    description: 'Outbound API requests',
  },
  // File Writes
  {
    name: 'file_write',
    category: 'file_write',
    patterns: [
      'writeFile',
      'writeFileSync',
      'appendFile',
      'createWriteStream',
      'fs.write',
    ],
    riskLevel: 'high',
    description: 'File system writes',
  },
  // HTTP Response
  {
    name: 'http_response',
    category: 'response',
    patterns: [
      'res.send(',
      'res.json(',
      'res.write(',
      'reply.send(',
      'ctx.body',
    ],
    riskLevel: 'medium',
    description: 'HTTP response output',
  },
  // Logging (Info Leak)
  {
    name: 'logging',
    category: 'log',
    patterns: [
      'console.log',
      'console.info',
      'console.warn',
      'console.error',
      'logger.',
    ],
    riskLevel: 'low',
    description: 'Logging - potential information leak',
  },
];

// ============================================================================
// Validation Patterns
// ============================================================================

/**
 * Default patterns for identifying data validations
 */
export const DEFAULT_VALIDATION_PATTERNS: ValidationPattern[] = [
  // Schema Validation
  {
    name: 'zod_validation',
    patterns: [
      '.parse(',
      '.safeParse(',
      'z.string()',
      'z.number()',
      'z.object(',
    ],
    protectsAgainst: ['type_coercion', 'missing_validation'],
    description: 'Zod schema validation',
  },
  {
    name: 'joi_validation',
    patterns: [
      'Joi.validate',
      '.validate(',
      'Joi.string()',
      'Joi.number()',
    ],
    protectsAgainst: ['type_coercion', 'missing_validation'],
    description: 'Joi schema validation',
  },
  {
    name: 'yup_validation',
    patterns: [
      'yup.string()',
      'yup.number()',
      '.validate(',
      '.isValid(',
    ],
    protectsAgainst: ['type_coercion', 'missing_validation'],
    description: 'Yup schema validation',
  },
  // Type Checks
  {
    name: 'type_check',
    patterns: [
      'typeof ',
      'instanceof ',
      'Array.isArray(',
      'Number.isNaN(',
      'Number.isFinite(',
    ],
    protectsAgainst: ['type_coercion'],
    description: 'JavaScript type checks',
  },
  // Sanitization
  {
    name: 'sanitization',
    patterns: [
      'sanitize',
      'escape(',
      'encodeURIComponent',
      'encodeURI(',
      'DOMPurify',
      'xss(',
    ],
    protectsAgainst: ['unsafe_sink', 'missing_sanitization'],
    description: 'Data sanitization',
  },
  // Null Checks
  {
    name: 'null_check',
    patterns: [
      '!= null',
      '!== null',
      '!= undefined',
      '!== undefined',
      '?.', // Optional chaining
      '??', // Nullish coalescing
    ],
    protectsAgainst: ['null_propagation'],
    description: 'Null/undefined checks',
  },
  // Length/Bounds Checks
  {
    name: 'bounds_check',
    patterns: [
      '.length >',
      '.length <',
      '.length ===',
      '.length !==',
      'min:',
      'max:',
    ],
    protectsAgainst: ['missing_validation'],
    description: 'Length and bounds validation',
  },
  // SQL Parameterization
  {
    name: 'parameterized_query',
    patterns: [
      '$1',
      '$2',
      '?',
      ':param',
      'bind(',
    ],
    protectsAgainst: ['unsafe_sink'],
    description: 'Parameterized SQL queries',
  },
];

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Get default flow tracing configuration
 */
export function getDefaultConfig(): {
  sourcePatterns: SourcePattern[];
  sinkPatterns: SinkPattern[];
  validationPatterns: ValidationPattern[];
} {
  return {
    sourcePatterns: DEFAULT_SOURCE_PATTERNS,
    sinkPatterns: DEFAULT_SINK_PATTERNS,
    validationPatterns: DEFAULT_VALIDATION_PATTERNS,
  };
}
