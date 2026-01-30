/**
 * Proof Receipt Generator for Reality Mode
 * 
 * Creates tamper-evident proof receipts for verified routes.
 */

import { createHash, randomUUID } from 'crypto';
import type {
  ProofReceipt,
  ProofVerdict,
  ProofCategory,
  TracePointer,
  RouteDefinition,
} from '../types.js';

// ============================================================================
// Types
// ============================================================================

export interface CreateReceiptOptions {
  /** Route that was verified */
  route: RouteDefinition;
  /** Verification verdict */
  verdict: ProofVerdict;
  /** Reason for the verdict */
  reason: string;
  /** Failure details (if verdict is FAIL) */
  failureDetail?: {
    expected: string;
    actual: string;
    diff?: string;
  };
  /** Assertions that were checked */
  assertions: Array<{
    description: string;
    passed: boolean;
    expected?: string;
    actual?: string;
  }>;
  /** Trace pointers to evidence */
  traces: TracePointer[];
  /** Custom timing (if not using now) */
  timing?: {
    startedAt: string;
    completedAt: string;
  };
}

// ============================================================================
// Proof Receipt Generator
// ============================================================================

/**
 * Create a proof receipt for a verified route
 */
export function createProofReceipt(options: CreateReceiptOptions): ProofReceipt {
  const {
    route,
    verdict,
    reason,
    failureDetail,
    assertions,
    traces,
    timing,
  } = options;
  
  const now = new Date().toISOString();
  const startedAt = timing?.startedAt ?? now;
  const completedAt = timing?.completedAt ?? now;
  
  // Generate proof ID
  const id = generateProofId();
  
  // Determine category based on route
  const category = determineCategory(route);
  
  // Calculate confidence score
  const confidence = calculateConfidence(verdict, assertions, traces);
  
  // Build the receipt (without signature)
  const receipt: Omit<ProofReceipt, 'signature'> = {
    schemaVersion: 'vibecheck.proof.v2',
    id,
    title: `Verify ${route.method} ${route.path}`,
    category,
    verdict,
    reason,
    failureDetail,
    subject: {
      type: 'route',
      identifier: `${route.method}:${route.path}`,
      method: route.method,
      url: route.path,
    },
    traces,
    timing: {
      startedAt,
      completedAt,
      durationMs: new Date(completedAt).getTime() - new Date(startedAt).getTime(),
    },
    assertions,
    confidence,
  };
  
  // Generate signature
  const signature = signReceipt(receipt);
  
  return {
    ...receipt,
    signature,
  };
}

/**
 * Generate a unique proof ID
 */
function generateProofId(): string {
  const timestamp = Date.now();
  const random = randomUUID().slice(0, 8);
  return `proof_${timestamp}_${random}`;
}

/**
 * Determine proof category from route
 */
function determineCategory(route: RouteDefinition): ProofCategory {
  if (route.auth?.required) {
    return 'auth_gate';
  }
  
  if (route.method === 'GET') {
    return 'route_hit';
  }
  
  return 'api_response';
}

/**
 * Calculate confidence score
 */
function calculateConfidence(
  verdict: ProofVerdict,
  assertions: CreateReceiptOptions['assertions'],
  traces: TracePointer[]
): number {
  let score = 0;
  
  // Base score from verdict
  switch (verdict) {
    case 'PASS':
      score += 40;
      break;
    case 'FAIL':
      score += 30; // Still confident in failure detection
      break;
    case 'SKIP':
      score += 10;
      break;
    case 'TIMEOUT':
    case 'ERROR':
      score += 5;
      break;
  }
  
  // Score from evidence
  if (traces.length > 0) {
    score += Math.min(30, traces.length * 10);
  }
  
  // Score from assertions
  if (assertions.length > 0) {
    const passedCount = assertions.filter(a => a.passed).length;
    const passRate = passedCount / assertions.length;
    score += Math.round(passRate * 30);
  }
  
  return Math.min(100, score);
}

/**
 * Sign a receipt for tamper detection
 */
function signReceipt(receipt: Omit<ProofReceipt, 'signature'>): string {
  const content = JSON.stringify({
    id: receipt.id,
    verdict: receipt.verdict,
    reason: receipt.reason,
    timing: receipt.timing,
    subject: receipt.subject,
  });
  
  return createHash('sha256').update(content).digest('hex').slice(0, 32);
}

/**
 * Verify a receipt's signature
 */
export function verifyReceiptSignature(receipt: ProofReceipt): boolean {
  const content = JSON.stringify({
    id: receipt.id,
    verdict: receipt.verdict,
    reason: receipt.reason,
    timing: receipt.timing,
    subject: receipt.subject,
  });
  
  const expectedSignature = createHash('sha256').update(content).digest('hex').slice(0, 32);
  return receipt.signature === expectedSignature;
}

/**
 * Format a receipt for display
 */
export function formatReceipt(receipt: ProofReceipt): string {
  const icon = {
    PASS: '✅',
    FAIL: '❌',
    SKIP: '⏭️',
    TIMEOUT: '⏱️',
    ERROR: '💥',
  }[receipt.verdict];
  
  const lines = [
    `${icon} ${receipt.title}`,
    `   ID: ${receipt.id}`,
    `   Verdict: ${receipt.verdict}`,
    `   Reason: ${receipt.reason}`,
    `   Duration: ${receipt.timing.durationMs}ms`,
    `   Confidence: ${receipt.confidence}%`,
  ];
  
  if (receipt.traces.length > 0) {
    lines.push(`   Evidence: ${receipt.traces.length} trace(s)`);
  }
  
  if (receipt.failureDetail) {
    lines.push(`   Expected: ${receipt.failureDetail.expected}`);
    lines.push(`   Actual: ${receipt.failureDetail.actual}`);
  }
  
  return lines.join('\n');
}

/**
 * Calculate summary statistics from receipts
 */
export function calculateReceiptSummary(receipts: ProofReceipt[]): {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  timedOut: number;
  errors: number;
  passRate: number;
  avgConfidence: number;
  totalDuration: number;
} {
  const total = receipts.length;
  const passed = receipts.filter(r => r.verdict === 'PASS').length;
  const failed = receipts.filter(r => r.verdict === 'FAIL').length;
  const skipped = receipts.filter(r => r.verdict === 'SKIP').length;
  const timedOut = receipts.filter(r => r.verdict === 'TIMEOUT').length;
  const errors = receipts.filter(r => r.verdict === 'ERROR').length;
  const totalDuration = receipts.reduce((sum, r) => sum + r.timing.durationMs, 0);
  const avgConfidence = total > 0
    ? Math.round(receipts.reduce((sum, r) => sum + r.confidence, 0) / total)
    : 0;
  
  return {
    total,
    passed,
    failed,
    skipped,
    timedOut,
    errors,
    passRate: total > 0 ? Math.round((passed / total) * 100) : 0,
    avgConfidence,
    totalDuration,
  };
}
