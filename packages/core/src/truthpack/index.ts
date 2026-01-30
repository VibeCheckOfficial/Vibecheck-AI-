/**
 * Truthpack Module - Ground truth extraction and validation
 * 
 * Extracts and maintains verified facts about the codebase
 * to serve as authoritative context for AI generation.
 */

export { TruthpackGenerator, type TruthpackConfig, type GenerationTimings } from './generator.js';
export { IncrementalScanner, type IncrementalScanResult, type FileMetadata } from './incremental-scanner.js';
export { TruthpackValidators, type ValidationResult } from './validators.js';

// Schemas
export { RoutesSchema, type RouteDefinition } from './schemas/routes.schema.js';
export { EnvSchema, type EnvVariable } from './schemas/env.schema.js';
export { AuthSchema, type AuthConfig } from './schemas/auth.schema.js';
export { ContractsSchema, type ApiContract } from './schemas/contracts.schema.js';
export { UiGraphSchema, type UiComponent } from './schemas/ui-graph.schema.js';

// Scanners
export { RouteScanner } from './scanners/route-scanner.js';
export { EnvScanner } from './scanners/env-scanner.js';
export { AuthScanner } from './scanners/auth-scanner.js';
export { ContractScanner } from './scanners/contract-scanner.js';
