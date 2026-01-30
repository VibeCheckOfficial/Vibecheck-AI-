// src/scanner/engines/mock-detector/types.ts

export type Severity = 'critical' | 'high' | 'medium' | 'low';

export type Category =
  | 'credentials'
  | 'fake-auth'
  | 'mock-data'
  | 'placeholder-content'
  | 'fake-user-data'
  | 'stub-response'
  | 'debug-code'
  | 'hardcoded-config'
  | 'placeholder-ids'
  | 'fake-dates'
  | 'test-in-prod'
  | 'pii-exposure'
  | 'financial-mock'
  | 'healthcare-mock';

export type Confidence = 'certain' | 'likely' | 'possible';

export interface Pattern {
  id: string;
  category: Category;
  severity: Severity;
  pattern: RegExp;
  description: string;
  fix?: string;
  autoFixable?: boolean;
  autoFixTemplate?: string;
  confidence: Confidence;
  tags?: string[];
  cwe?: string;
  docs?: string;
}

export interface Finding {
  id: string;
  file: string;
  line: number;
  endLine?: number;
  column: number;
  endColumn?: number;
  code: string;
  context?: string;
  category: Category;
  severity: Severity;
  description: string;
  fix?: string;
  autoFixable: boolean;
  autoFixCode?: string;
  confidence: Confidence;
  tags?: string[];
  cwe?: string;
  hash?: string;
}

export interface ScanResult {
  findings: Finding[];
  summary: ScanSummary;
  scannedFiles: number;
  skippedFiles?: number;
  duration: number;
  cacheHits?: number;
  timestamp: string;
  baselineFiltered?: number;
}

export interface ScanSummary {
  total: number;
  bySeverity: Record<Severity, number>;
  byCategory: Record<Category, number>;
  autoFixable: number;
}

export interface ScanOptions {
  rootDir: string;
  include?: string[];
  exclude?: string[];
  severityThreshold?: Severity;
  enableAstAnalysis?: boolean;
  enableSemanticAnalysis?: boolean;
  enableAutoFix?: boolean;
  useCache?: boolean;
  maxFileSize?: number;
  timeout?: number;
  industries?: Industry[];
}

export type Industry = 'fintech' | 'healthcare' | 'ecommerce' | 'saas' | 'general';

export interface FileCache {
  hash: string;
  findings: Finding[];
  timestamp: number;
}
