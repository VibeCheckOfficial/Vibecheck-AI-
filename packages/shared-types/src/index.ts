/**
 * Shared TypeScript types for the monorepo
 * 
 * This module provides:
 * - Type definitions for all domain entities
 * - Runtime type guards for validation
 * - Utility types for common patterns
 * - Constants and enums
 * - Sanitization utilities for secure data handling
 */

// ============================================================================
// API Response Types
// ============================================================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: ApiMeta;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  field?: string;
  retryable?: boolean;
}

export interface ApiMeta {
  requestId?: string;
  timestamp?: string;
  duration?: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  totalPages?: number;
}

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

export type HttpStatus = (typeof HTTP_STATUS)[keyof typeof HTTP_STATUS];

// ============================================================================
// User & Auth Types
// ============================================================================

export const TIERS = ['free', 'pro', 'enterprise'] as const;
export type Tier = (typeof TIERS)[number];

export const ROLES = ['owner', 'admin', 'developer', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

export interface User {
  id: string;
  email: string;
  name: string | null;
  tier: Tier;
  emailVerified: boolean;
  avatarUrl?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  tokenType?: string;
}

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
}

// ============================================================================
// Team Types
// ============================================================================

export interface Team {
  id: string;
  name: string;
  slug?: string;
  ownerId: string;
  tier: Tier;
  seatLimit: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface TeamMember {
  id: string;
  teamId: string;
  userId: string;
  role: Role;
  joinedAt: Date;
  user?: Pick<User, 'id' | 'email' | 'name' | 'avatarUrl'>;
}

export interface TeamInvitation {
  token: string;
  teamId: string;
  teamName: string;
  email: string;
  role: Role;
  expiresAt: Date;
  invitedBy?: string;
}

// ============================================================================
// Project Types
// ============================================================================

export interface Project {
  id: string;
  name: string;
  description: string | null;
  repoUrl: string | null;
  defaultBranch: string | null;
  truthpack: TruthpackData | null;
  policy: ProjectPolicy | null;
  settings: ProjectSettings | null;
  lastScannedAt: Date | null;
  ownerId: string | null;
  teamId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectPolicy {
  blockOnError?: boolean;
  blockOnWarning?: boolean;
  allowedPatterns?: string[];
  deniedPatterns?: string[];
  customRules?: PolicyRule[];
}

export interface PolicyRule {
  id: string;
  name: string;
  severity: FindingSeverity;
  pattern: string;
  message: string;
  enabled: boolean;
}

export interface ProjectSettings {
  autoScanOnPush?: boolean;
  autoScanOnPR?: boolean;
  defaultScanType?: ScanType;
  notifyOnBlock?: boolean;
  slackWebhook?: string;
  discordWebhook?: string;
}

// ============================================================================
// Truthpack Types
// ============================================================================

export interface TruthpackData {
  version?: string;
  generatedAt?: Date;
  routes: RouteDefinition[];
  env: EnvVarDefinition[];
  auth: AuthConfig;
  contracts: ContractDefinition[];
}

export interface RouteDefinition {
  path: string;
  method: HttpMethod;
  handler?: string;
  file?: string;
  line?: number;
  auth?: RouteAuth;
  params?: RouteParam[];
  description?: string;
  middleware?: string[];
}

export interface RouteAuth {
  required: boolean;
  roles?: string[];
  scopes?: string[];
}

export interface RouteParam {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'uuid';
  required: boolean;
  description?: string;
}

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

export interface EnvVarDefinition {
  name: string;
  required: boolean;
  description?: string;
  defaultValue?: string;
  usedIn?: string[];
  sensitive?: boolean;
}

export interface AuthConfig {
  protectedRoutes?: string[];
  roles?: string[];
  middleware?: string[];
  providers?: string[];
}

export interface ContractDefinition {
  name: string;
  type: 'interface' | 'type' | 'class' | 'enum' | 'schema';
  file?: string;
  line?: number;
  schema?: Record<string, unknown>;
  description?: string;
}

// ============================================================================
// Scan Types
// ============================================================================

export const SCAN_STATUSES = ['pending', 'running', 'completed', 'failed', 'cancelled'] as const;
export type ScanStatus = (typeof SCAN_STATUSES)[number];

export const SCAN_TYPES = ['full', 'incremental', 'quick'] as const;
export type ScanType = (typeof SCAN_TYPES)[number];

export const SCAN_VERDICTS = ['SHIP', 'WARN', 'BLOCK'] as const;
export type ScanVerdict = (typeof SCAN_VERDICTS)[number];

export interface Scan {
  id: string;
  projectId: string;
  triggeredBy: string | null;
  status: ScanStatus;
  scanType: ScanType;
  branch: string | null;
  commitSha: string | null;
  prNumber?: number | null;
  summary: ScanSummary | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
}

export interface ScanSummary {
  totalFindings: number;
  bySeverity: FindingSeverityCounts;
  byType: Record<string, number>;
  verdict: ScanVerdict;
  duration?: number;
  filesScanned?: number;
  cancelled?: boolean;
  error?: string;
}

/** @deprecated Use SeverityCounts from command-result.ts for the 4-tier system */
export interface FindingSeverityCounts {
  error: number;
  warning: number;
  info: number;
}

// ============================================================================
// Finding Types
// ============================================================================

export const FINDING_SEVERITIES = ['error', 'warning', 'info'] as const;
export type FindingSeverity = (typeof FINDING_SEVERITIES)[number];

export const FINDING_TYPES = [
  'ghost_route',
  'ghost_env',
  'ghost_import',
  'ghost_type',
  'auth_drift',
  'contract_violation',
  'security_issue',
  'code_quality',
  'convention_violation',
  'mock_data',
  'mock_credentials',
  'mock_auth_bypass',
  'debug_code',
  'placeholder_content',
] as const;
export type FindingType = (typeof FINDING_TYPES)[number];

export interface Finding {
  id: string;
  scanId: string;
  projectId: string;
  type: FindingType | string;
  severity: FindingSeverity;
  message: string;
  file: string | null;
  line: number | null;
  column: number | null;
  endLine?: number | null;
  endColumn?: number | null;
  evidence: FindingEvidence | null;
  suggestion: string | null;
  autoFixable?: boolean;
  resolved: boolean;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  createdAt: Date;
}

export interface FindingEvidence {
  expected?: unknown;
  actual?: unknown;
  context?: string;
  references?: string[];
}

export interface FindingStats {
  total: number;
  bySeverity: FindingSeverityCounts;
  byType: Record<string, number>;
  resolved: number;
  unresolved: number;
  autoFixable: number;
}

// ============================================================================
// Agent Activity Types
// ============================================================================

export const AGENT_VERDICTS = ['allowed', 'warned', 'blocked'] as const;
export type AgentVerdict = (typeof AGENT_VERDICTS)[number];

export const AGENT_ACTIONS = ['read', 'write', 'delete', 'execute'] as const;
export type AgentAction = (typeof AGENT_ACTIONS)[number];

export interface AgentActivity {
  id: string;
  timestamp: Date;
  agentId: string;
  agentName: string;
  action: AgentAction;
  target: string;
  verdict: AgentVerdict;
  violations: string[];
  diff?: string;
  duration: number;
  correlationId?: string;
}

// ============================================================================
// Firewall Types
// ============================================================================

export const FIREWALL_MODES = ['observe', 'enforce', 'lockdown'] as const;
export type FirewallMode = (typeof FIREWALL_MODES)[number];

export interface FirewallConfig {
  mode: FirewallMode;
  strictMode: boolean;
  allowPartialMatches: boolean;
  maxClaimsPerRequest: number;
}

export interface FirewallResult {
  allowed: boolean;
  mode: FirewallMode;
  violations: FirewallViolation[];
  claims: number;
  evidence: number;
  duration: number;
  auditId: string;
}

export interface FirewallViolation {
  policy: string;
  message: string;
  severity: FindingSeverity;
  suggestion?: string;
}

// ============================================================================
// Billing Types
// ============================================================================

export interface BillingInfo {
  tier: Tier;
  limits: TierLimits;
  subscription: SubscriptionInfo | null;
  usage: UsageMetrics;
}

export interface TierLimits {
  scansPerMonth: number;
  projects: number;
  seats: number;
  apiCallsPerMinute: number;
  retentionDays: number;
}

export const TIER_LIMITS: Record<Tier, TierLimits> = {
  free: {
    scansPerMonth: 100,
    projects: 3,
    seats: 1,
    apiCallsPerMinute: 30,
    retentionDays: 7,
  },
  pro: {
    scansPerMonth: 1000,
    projects: 20,
    seats: 10,
    apiCallsPerMinute: 120,
    retentionDays: 30,
  },
  enterprise: {
    scansPerMonth: -1, // Unlimited
    projects: -1,
    seats: -1,
    apiCallsPerMinute: 600,
    retentionDays: 365,
  },
};

export const SUBSCRIPTION_STATUSES = ['active', 'canceled', 'past_due', 'trialing', 'paused'] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export interface SubscriptionInfo {
  id: string;
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  planId?: string;
}

export interface UsageMetrics {
  month: string;
  scans: UsageItem;
  projects: UsageItem;
  apiCalls?: UsageItem;
}

export interface UsageItem {
  used: number;
  limit: number;
  remaining: number;
  percentage: number;
}

// ============================================================================
// RBAC Permission Types
// ============================================================================

export const PERMISSIONS = {
  PROJECT_CREATE: 'project:create',
  PROJECT_READ: 'project:read',
  PROJECT_UPDATE: 'project:update',
  PROJECT_DELETE: 'project:delete',
  SCAN_TRIGGER: 'scan:trigger',
  SCAN_READ: 'scan:read',
  SCAN_CANCEL: 'scan:cancel',
  FINDING_READ: 'finding:read',
  FINDING_RESOLVE: 'finding:resolve',
  TEAM_READ: 'team:read',
  TEAM_MANAGE: 'team:manage',
  TEAM_INVITE: 'team:invite',
  BILLING_VIEW: 'billing:view',
  BILLING_MANAGE: 'billing:manage',
  SETTINGS_READ: 'settings:read',
  SETTINGS_MANAGE: 'settings:manage',
  API_KEY_CREATE: 'apikey:create',
  API_KEY_READ: 'apikey:read',
  API_KEY_DELETE: 'apikey:delete',
  AGENT_VIEW: 'agent:view',
  AGENT_MANAGE: 'agent:manage',
  AUDIT_VIEW: 'audit:view',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  owner: Object.values(PERMISSIONS),
  admin: [
    PERMISSIONS.PROJECT_CREATE,
    PERMISSIONS.PROJECT_READ,
    PERMISSIONS.PROJECT_UPDATE,
    PERMISSIONS.PROJECT_DELETE,
    PERMISSIONS.SCAN_TRIGGER,
    PERMISSIONS.SCAN_READ,
    PERMISSIONS.SCAN_CANCEL,
    PERMISSIONS.FINDING_READ,
    PERMISSIONS.FINDING_RESOLVE,
    PERMISSIONS.TEAM_READ,
    PERMISSIONS.TEAM_MANAGE,
    PERMISSIONS.TEAM_INVITE,
    PERMISSIONS.BILLING_VIEW,
    PERMISSIONS.SETTINGS_READ,
    PERMISSIONS.SETTINGS_MANAGE,
    PERMISSIONS.API_KEY_CREATE,
    PERMISSIONS.API_KEY_READ,
    PERMISSIONS.API_KEY_DELETE,
    PERMISSIONS.AGENT_VIEW,
    PERMISSIONS.AGENT_MANAGE,
    PERMISSIONS.AUDIT_VIEW,
  ],
  developer: [
    PERMISSIONS.PROJECT_READ,
    PERMISSIONS.SCAN_TRIGGER,
    PERMISSIONS.SCAN_READ,
    PERMISSIONS.FINDING_READ,
    PERMISSIONS.FINDING_RESOLVE,
    PERMISSIONS.TEAM_READ,
    PERMISSIONS.SETTINGS_READ,
    PERMISSIONS.API_KEY_CREATE,
    PERMISSIONS.API_KEY_READ,
    PERMISSIONS.AGENT_VIEW,
  ],
  viewer: [
    PERMISSIONS.PROJECT_READ,
    PERMISSIONS.SCAN_READ,
    PERMISSIONS.FINDING_READ,
    PERMISSIONS.TEAM_READ,
    PERMISSIONS.AGENT_VIEW,
  ],
} as const;

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if a value is a valid tier
 */
export function isTier(value: unknown): value is Tier {
  return typeof value === 'string' && TIERS.includes(value as Tier);
}

/**
 * Check if a value is a valid role
 */
export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && ROLES.includes(value as Role);
}

/**
 * Check if a value is a valid HTTP method
 */
export function isHttpMethod(value: unknown): value is HttpMethod {
  return typeof value === 'string' && HTTP_METHODS.includes(value as HttpMethod);
}

/**
 * Check if a value is a valid scan status
 */
export function isScanStatus(value: unknown): value is ScanStatus {
  return typeof value === 'string' && SCAN_STATUSES.includes(value as ScanStatus);
}

/**
 * Check if a value is a valid scan verdict
 */
export function isScanVerdict(value: unknown): value is ScanVerdict {
  return typeof value === 'string' && SCAN_VERDICTS.includes(value as ScanVerdict);
}

/**
 * Check if a value is a valid finding severity
 */
export function isFindingSeverity(value: unknown): value is FindingSeverity {
  return typeof value === 'string' && FINDING_SEVERITIES.includes(value as FindingSeverity);
}

/**
 * Check if a value is a valid finding type
 */
export function isFindingType(value: unknown): value is FindingType {
  return typeof value === 'string' && FINDING_TYPES.includes(value as FindingType);
}

/**
 * Check if a value is a valid firewall mode
 */
export function isFirewallMode(value: unknown): value is FirewallMode {
  return typeof value === 'string' && FIREWALL_MODES.includes(value as FirewallMode);
}

/**
 * Check if a value is a valid agent verdict
 */
export function isAgentVerdict(value: unknown): value is AgentVerdict {
  return typeof value === 'string' && AGENT_VERDICTS.includes(value as AgentVerdict);
}

/**
 * Check if a value is a valid permission
 */
export function isPermission(value: unknown): value is Permission {
  return typeof value === 'string' && Object.values(PERMISSIONS).includes(value as Permission);
}

/**
 * Check if value is a non-null object
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Check if value is a valid UUID
 */
export function isUUID(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Check if value is a valid email
 */
export function isEmail(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  // More comprehensive email regex
  if (value.length > 254) return false; // Max email length per RFC 5321
  return /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/.test(value);
}

/**
 * Check if value is a valid URL
 */
export function isValidUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Check if value is a safe string (no control characters)
 */
export function isSafeString(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  // eslint-disable-next-line no-control-regex
  return !/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(value);
}

/**
 * Check if value is a valid file path (no traversal)
 */
export function isSafeFilePath(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  // No path traversal
  if (value.includes('..')) return false;
  // No absolute paths starting with /
  if (value.startsWith('/')) return false;
  // No Windows absolute paths
  if (/^[a-zA-Z]:/.test(value)) return false;
  // No null bytes
  if (value.includes('\x00')) return false;
  return true;
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Make selected properties required
 */
export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

/**
 * Make selected properties optional
 */
export type OptionalFields<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * Make all properties nullable
 */
export type Nullable<T> = { [K in keyof T]: T[K] | null };

/**
 * Deep partial type
 */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

/**
 * Deep readonly type
 */
export type DeepReadonly<T> = {
  readonly [K in keyof T]: T[K] extends object ? DeepReadonly<T[K]> : T[K];
};

/**
 * Extract non-nullable properties
 */
export type NonNullableFields<T> = {
  [K in keyof T]: NonNullable<T[K]>;
};

/**
 * Create input type (without id and timestamps)
 */
export type CreateInput<T> = Omit<T, 'id' | 'createdAt' | 'updatedAt'>;

/**
 * Create update input type (partial without id and timestamps)
 */
export type UpdateInput<T> = Partial<Omit<T, 'id' | 'createdAt' | 'updatedAt'>>;

/**
 * Async function type
 */
export type AsyncFunction<TArgs extends unknown[], TResult> = (...args: TArgs) => Promise<TResult>;

/**
 * Result type for operations that can fail
 */
export type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

/**
 * Create a success result
 */
export function success<T>(data: T): Result<T, never> {
  return { success: true, data };
}

/**
 * Create an error result
 */
export function failure<E>(error: E): Result<never, E> {
  return { success: false, error };
}

// ============================================================================
// Permission Helpers
// ============================================================================

/**
 * Check if a role has a specific permission
 */
export function hasPermission(role: Role, permission: Permission): boolean {
  const permissions = ROLE_PERMISSIONS[role];
  return permissions.includes(permission);
}

/**
 * Check if a role has all specified permissions
 */
export function hasAllPermissions(role: Role, permissions: Permission[]): boolean {
  return permissions.every(p => hasPermission(role, p));
}

/**
 * Check if a role has any of the specified permissions
 */
export function hasAnyPermission(role: Role, permissions: Permission[]): boolean {
  return permissions.some(p => hasPermission(role, p));
}

/**
 * Get all permissions for a role
 */
export function getPermissions(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}

// ============================================================================
// Tier Helpers
// ============================================================================

/**
 * Get limits for a tier
 */
export function getTierLimits(tier: Tier): TierLimits {
  return TIER_LIMITS[tier];
}

/**
 * Check if usage is within limits
 */
export function isWithinLimits(usage: number, limit: number): boolean {
  return limit === -1 || usage < limit;
}

/**
 * Calculate usage percentage
 */
export function calculateUsagePercentage(used: number, limit: number): number {
  if (limit === -1) return 0; // Unlimited
  if (limit === 0) return 100;
  return Math.min(100, Math.round((used / limit) * 100));
}

// ============================================================================
// Date Helpers
// ============================================================================

/**
 * Parse a date from various formats
 */
export function parseDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }
  return null;
}

/**
 * Format a date as ISO string or return null
 */
export function formatDate(date: Date | null | undefined): string | null {
  return date?.toISOString() ?? null;
}

// ============================================================================
// Sanitization Utilities
// ============================================================================

/**
 * Maximum string length for various fields
 */
export const MAX_LENGTHS = {
  NAME: 100,
  EMAIL: 254,
  DESCRIPTION: 1000,
  MESSAGE: 5000,
  PATH: 500,
  URL: 2083, // IE max URL length, widely used as standard
  ID: 36, // UUID length
  SLUG: 50,
  TOKEN: 500,
} as const;

/**
 * Sanitize a string by removing control characters and trimming
 */
export function sanitizeString(value: unknown, maxLength?: number): string {
  if (typeof value !== 'string') return '';
  
  let result = value
    // Remove control characters except newline and tab
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim();
  
  if (maxLength && result.length > maxLength) {
    result = result.slice(0, maxLength);
  }
  
  return result;
}

/**
 * Sanitize a name (alphanumeric, spaces, hyphens, underscores)
 */
export function sanitizeName(value: unknown, maxLength: number = MAX_LENGTHS.NAME): string {
  if (typeof value !== 'string') return '';
  
  return value
    .replace(/[^a-zA-Z0-9\s\-_]/g, '')
    .trim()
    .slice(0, maxLength);
}

/**
 * Sanitize a slug (lowercase alphanumeric and hyphens)
 */
export function sanitizeSlug(value: unknown, maxLength: number = MAX_LENGTHS.SLUG): string {
  if (typeof value !== 'string') return '';
  
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, maxLength);
}

/**
 * Sanitize HTML to prevent XSS (basic escaping)
 */
export function escapeHtml(value: unknown): string {
  if (typeof value !== 'string') return '';
  
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Sanitize a file path to prevent traversal
 */
export function sanitizeFilePath(value: unknown): string {
  if (typeof value !== 'string') return '';
  
  return value
    // Remove null bytes
    .replace(/\x00/g, '')
    // Normalize path separators
    .replace(/\\/g, '/')
    // Remove path traversal attempts
    .replace(/\.\.\/?/g, '')
    // Remove leading slashes (make relative)
    .replace(/^\/+/, '')
    // Remove Windows drive letters
    .replace(/^[a-zA-Z]:/, '')
    // Limit length
    .slice(0, MAX_LENGTHS.PATH);
}

/**
 * Sanitize an environment variable name
 */
export function sanitizeEnvVarName(value: unknown): string {
  if (typeof value !== 'string') return '';
  
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, '_')
    .replace(/^[0-9]/, '_$&') // Can't start with number
    .slice(0, 100);
}

// ============================================================================
// Validation Utilities
// ============================================================================

/**
 * Validation error
 */
export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

/**
 * Validation result
 */
export type ValidationResult = 
  | { valid: true }
  | { valid: false; errors: ValidationError[] };

/**
 * Create a validation error
 */
export function validationError(field: string, message: string, code: string): ValidationError {
  return { field, message, code };
}

/**
 * Combine multiple validation results
 */
export function combineValidations(...results: ValidationResult[]): ValidationResult {
  const errors: ValidationError[] = [];
  
  for (const result of results) {
    if (!result.valid && 'errors' in result) {
      errors.push(...result.errors);
    }
  }
  
  return errors.length === 0 
    ? { valid: true } 
    : { valid: false, errors };
}

/**
 * Validate required fields
 */
export function validateRequired<T extends Record<string, unknown>>(
  obj: T,
  fields: (keyof T)[]
): ValidationResult {
  const errors: ValidationError[] = [];
  
  for (const field of fields) {
    const value = obj[field];
    if (value === undefined || value === null || value === '') {
      errors.push(validationError(
        String(field),
        `${String(field)} is required`,
        'REQUIRED'
      ));
    }
  }
  
  return errors.length === 0 
    ? { valid: true } 
    : { valid: false, errors };
}

/**
 * Validate string length
 */
export function validateLength(
  value: unknown,
  field: string,
  min: number,
  max: number
): ValidationResult {
  if (typeof value !== 'string') {
    return { valid: false, errors: [validationError(field, `${field} must be a string`, 'TYPE')] };
  }
  
  if (value.length < min) {
    return { valid: false, errors: [validationError(field, `${field} must be at least ${min} characters`, 'MIN_LENGTH')] };
  }
  
  if (value.length > max) {
    return { valid: false, errors: [validationError(field, `${field} must be at most ${max} characters`, 'MAX_LENGTH')] };
  }
  
  return { valid: true };
}

/**
 * Validate a number is within range
 */
export function validateRange(
  value: unknown,
  field: string,
  min: number,
  max: number
): ValidationResult {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return { valid: false, errors: [validationError(field, `${field} must be a number`, 'TYPE')] };
  }
  
  if (value < min || value > max) {
    return { valid: false, errors: [validationError(field, `${field} must be between ${min} and ${max}`, 'RANGE')] };
  }
  
  return { valid: true };
}

/**
 * Validate email format
 */
export function validateEmail(value: unknown, field: string = 'email'): ValidationResult {
  if (!isEmail(value)) {
    return { valid: false, errors: [validationError(field, 'Invalid email format', 'EMAIL')] };
  }
  return { valid: true };
}

/**
 * Validate UUID format
 */
export function validateUUID(value: unknown, field: string = 'id'): ValidationResult {
  if (!isUUID(value)) {
    return { valid: false, errors: [validationError(field, 'Invalid UUID format', 'UUID')] };
  }
  return { valid: true };
}

// ============================================================================
// Safe Numeric Operations
// ============================================================================

/**
 * Clamp a number to a range
 */
export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

/**
 * Safe division that returns default on divide by zero
 */
export function safeDivide(numerator: number, denominator: number, defaultValue: number = 0): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return defaultValue;
  }
  return numerator / denominator;
}

/**
 * Parse an integer safely
 */
export function safeParseInt(value: unknown, defaultValue: number = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.floor(value);
  }
  if (typeof value === 'string') {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : defaultValue;
  }
  return defaultValue;
}

/**
 * Parse a float safely
 */
export function safeParseFloat(value: unknown, defaultValue: number = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : defaultValue;
  }
  return defaultValue;
}

// ============================================================================
// Re-export Entitlements Module
// ============================================================================

export * from './entitlements.js';

// ============================================================================
// Ship Score Types
// ============================================================================

export * from './ship-score.js';

// ============================================================================
// Reality Receipt Types
// ============================================================================

export * from './receipts.js';

// ============================================================================
// Fix Missions Types
// ============================================================================

export * from './missions.js';

// ============================================================================
// Command Result Types (Canonical CLI Output Contract)
// ============================================================================

export * from './command-result.js';

// ============================================================================
// Mission Intent Types (Intent-Centric Architecture)
// ============================================================================

export * from './mission-intent.js';
