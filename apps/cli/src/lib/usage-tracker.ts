/**
 * Usage Tracker
 * 
 * Tracks CLI scan usage for free tier limits.
 * Stores usage data locally and syncs with cloud when authenticated.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { getConfigDir } from './credentials.js';
import { PLAN_DEFINITIONS } from '@repo/shared-types';

// ============================================================================
// Types
// ============================================================================

interface UsageData {
  /** Current month key (YYYY-MM) */
  currentMonth: string;
  /** Number of scans this month */
  scansThisMonth: number;
  /** Timestamps of recent scans */
  recentScans: string[];
  /** Last check timestamp */
  lastUpdated: string;
}

interface UsageCheckResult {
  /** Whether the user can perform a scan */
  allowed: boolean;
  /** Current scan count */
  current: number;
  /** Maximum allowed scans */
  limit: number;
  /** Remaining scans */
  remaining: number;
  /** Message to show user */
  message?: string;
  /** Whether to show upgrade prompt */
  showUpgrade: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const USAGE_FILE = 'usage.json';
const FREE_SCAN_LIMIT = PLAN_DEFINITIONS.free.limits.scansPerMonth;

// ============================================================================
// Helper Functions
// ============================================================================

function getCurrentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getUsagePath(): string {
  return path.join(getConfigDir(), USAGE_FILE);
}

async function loadUsage(): Promise<UsageData> {
  try {
    const data = await fs.readFile(getUsagePath(), 'utf-8');
    return JSON.parse(data);
  } catch {
    // Return fresh data if file doesn't exist
    return {
      currentMonth: getCurrentMonthKey(),
      scansThisMonth: 0,
      recentScans: [],
      lastUpdated: new Date().toISOString(),
    };
  }
}

async function saveUsage(usage: UsageData): Promise<void> {
  const dir = getConfigDir();
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(getUsagePath(), JSON.stringify(usage, null, 2));
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Check if user can perform a scan
 */
export async function checkScanAllowed(tier: 'free' | 'pro' | 'enterprise'): Promise<UsageCheckResult> {
  // Pro and Enterprise have unlimited scans
  if (tier !== 'free') {
    return {
      allowed: true,
      current: 0,
      limit: -1,
      remaining: -1,
      showUpgrade: false,
    };
  }

  const usage = await loadUsage();
  const currentMonth = getCurrentMonthKey();

  // Reset if new month
  if (usage.currentMonth !== currentMonth) {
    usage.currentMonth = currentMonth;
    usage.scansThisMonth = 0;
    usage.recentScans = [];
    await saveUsage(usage);
  }

  const remaining = FREE_SCAN_LIMIT - usage.scansThisMonth;
  const allowed = remaining > 0;

  // Determine message based on remaining scans
  let message: string | undefined;
  let showUpgrade = false;

  if (!allowed) {
    message = `You've used all ${FREE_SCAN_LIMIT} scans this month. Upgrade to Pro for unlimited scans.`;
    showUpgrade = true;
  } else if (remaining <= 3) {
    message = `${remaining} scan${remaining === 1 ? '' : 's'} remaining this month.`;
    showUpgrade = true;
  } else if (remaining <= 5) {
    message = `${remaining} scans remaining this month.`;
    showUpgrade = false;
  }

  return {
    allowed,
    current: usage.scansThisMonth,
    limit: FREE_SCAN_LIMIT,
    remaining,
    message,
    showUpgrade,
  };
}

/**
 * Record a scan (call after successful scan)
 */
export async function recordScan(): Promise<void> {
  const usage = await loadUsage();
  const currentMonth = getCurrentMonthKey();

  // Reset if new month
  if (usage.currentMonth !== currentMonth) {
    usage.currentMonth = currentMonth;
    usage.scansThisMonth = 0;
    usage.recentScans = [];
  }

  usage.scansThisMonth += 1;
  usage.recentScans.push(new Date().toISOString());
  usage.lastUpdated = new Date().toISOString();

  // Keep only last 50 scan timestamps
  if (usage.recentScans.length > 50) {
    usage.recentScans = usage.recentScans.slice(-50);
  }

  await saveUsage(usage);
}

/**
 * Get current usage stats
 */
export async function getUsageStats(): Promise<{
  scansThisMonth: number;
  limit: number;
  remaining: number;
  resetDate: string;
}> {
  const usage = await loadUsage();
  const currentMonth = getCurrentMonthKey();

  // Reset if new month
  if (usage.currentMonth !== currentMonth) {
    return {
      scansThisMonth: 0,
      limit: FREE_SCAN_LIMIT,
      remaining: FREE_SCAN_LIMIT,
      resetDate: getNextMonthFirstDay(),
    };
  }

  return {
    scansThisMonth: usage.scansThisMonth,
    limit: FREE_SCAN_LIMIT,
    remaining: Math.max(0, FREE_SCAN_LIMIT - usage.scansThisMonth),
    resetDate: getNextMonthFirstDay(),
  };
}

function getNextMonthFirstDay(): string {
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return nextMonth.toISOString().split('T')[0];
}

/**
 * Reset usage (for testing or admin purposes)
 */
export async function resetUsage(): Promise<void> {
  const usage: UsageData = {
    currentMonth: getCurrentMonthKey(),
    scansThisMonth: 0,
    recentScans: [],
    lastUpdated: new Date().toISOString(),
  };
  await saveUsage(usage);
}
