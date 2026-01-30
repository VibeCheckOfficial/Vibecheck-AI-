/**
 * Chaos Replay System
 * 
 * Records chaos agent sessions and enables replay.
 * Supports export to Playwright test format.
 * 
 * @module reality/chaos/replay
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Recorded action in a chaos session
 */
export interface RecordedAction {
  /** Unique action ID */
  id: string;
  /** Sequence number */
  sequence: number;
  /** Timestamp of action */
  timestamp: string;
  /** Action type */
  type: string;
  /** Target selector */
  selector?: string;
  /** Input value */
  value?: string;
  /** Target URL */
  url?: string;
  /** Screenshot path (taken before action) */
  screenshotBefore?: string;
  /** Screenshot path (taken after action) */
  screenshotAfter?: string;
  /** Action result */
  result: 'success' | 'failure' | 'skipped';
  /** Error message if failed */
  error?: string;
  /** Duration in milliseconds */
  durationMs: number;
  /** Element information */
  element?: {
    tagName: string;
    textContent?: string;
    attributes?: Record<string, string>;
  };
  /** Risk classification */
  riskLevel?: string;
}

/**
 * Chaos session recording
 */
export interface ChaosSessionRecording {
  /** Session ID */
  id: string;
  /** Session seed for reproducibility */
  seed: number;
  /** Start time */
  startTime: string;
  /** End time */
  endTime?: string;
  /** Total duration in milliseconds */
  durationMs?: number;
  /** Starting URL */
  startUrl: string;
  /** Project ID */
  projectId: string;
  /** Recorded actions */
  actions: RecordedAction[];
  /** Summary statistics */
  summary: SessionSummary;
  /** Environment information */
  environment: SessionEnvironment;
  /** Configuration used */
  config: SessionConfig;
}

/**
 * Session summary statistics
 */
export interface SessionSummary {
  /** Total actions recorded */
  totalActions: number;
  /** Successful actions */
  successfulActions: number;
  /** Failed actions */
  failedActions: number;
  /** Skipped actions */
  skippedActions: number;
  /** Pages visited */
  pagesVisited: number;
  /** Forms submitted */
  formsSubmitted: number;
  /** Issues discovered */
  issuesFound: number;
}

/**
 * Session environment information
 */
export interface SessionEnvironment {
  /** Browser used */
  browser: string;
  /** Browser version */
  browserVersion?: string;
  /** Viewport size */
  viewport: { width: number; height: number };
  /** User agent */
  userAgent?: string;
  /** Platform */
  platform: string;
}

/**
 * Session configuration snapshot
 */
export interface SessionConfig {
  /** Safe mode enabled */
  safeMode: boolean;
  /** Max actions limit */
  maxActions: number;
  /** Max runtime in seconds */
  maxRuntime: number;
  /** AI provider used */
  aiProvider?: string;
  /** AI model used */
  aiModel?: string;
}

// ============================================================================
// Session Recorder Class
// ============================================================================

/**
 * Records chaos agent sessions
 */
export class ChaosSessionRecorder {
  private session: ChaosSessionRecording;
  private actionSequence: number = 0;

  constructor(options: {
    sessionId: string;
    seed: number;
    startUrl: string;
    projectId: string;
    config: SessionConfig;
    environment: SessionEnvironment;
  }) {
    this.session = {
      id: options.sessionId,
      seed: options.seed,
      startTime: new Date().toISOString(),
      startUrl: options.startUrl,
      projectId: options.projectId,
      actions: [],
      summary: {
        totalActions: 0,
        successfulActions: 0,
        failedActions: 0,
        skippedActions: 0,
        pagesVisited: 0,
        formsSubmitted: 0,
        issuesFound: 0,
      },
      environment: options.environment,
      config: options.config,
    };
  }

  /**
   * Record an action
   */
  recordAction(action: Omit<RecordedAction, 'id' | 'sequence' | 'timestamp'>): RecordedAction {
    const recorded: RecordedAction = {
      ...action,
      id: `action_${this.actionSequence + 1}`,
      sequence: ++this.actionSequence,
      timestamp: new Date().toISOString(),
    };

    this.session.actions.push(recorded);
    this.updateSummary(recorded);

    return recorded;
  }

  /**
   * Update session summary
   */
  private updateSummary(action: RecordedAction): void {
    this.session.summary.totalActions++;

    switch (action.result) {
      case 'success':
        this.session.summary.successfulActions++;
        break;
      case 'failure':
        this.session.summary.failedActions++;
        this.session.summary.issuesFound++;
        break;
      case 'skipped':
        this.session.summary.skippedActions++;
        break;
    }

    if (action.type === 'navigate') {
      this.session.summary.pagesVisited++;
    }

    if (action.type === 'submit') {
      this.session.summary.formsSubmitted++;
    }
  }

  /**
   * Mark session as complete
   */
  complete(): ChaosSessionRecording {
    const endTime = new Date();
    this.session.endTime = endTime.toISOString();
    this.session.durationMs = endTime.getTime() - new Date(this.session.startTime).getTime();
    return this.getRecording();
  }

  /**
   * Get current recording
   */
  getRecording(): ChaosSessionRecording {
    return { ...this.session };
  }

  /**
   * Get seed for replay
   */
  getSeed(): number {
    return this.session.seed;
  }
}

// ============================================================================
// Playwright Export
// ============================================================================

/**
 * Export session to Playwright test
 */
export function exportToPlaywright(session: ChaosSessionRecording): string {
  const lines: string[] = [];

  // Header
  lines.push(`// Playwright test generated from VibeCheck Chaos Session`);
  lines.push(`// Session ID: ${session.id}`);
  lines.push(`// Seed: ${session.seed}`);
  lines.push(`// Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push(`import { test, expect } from '@playwright/test';`);
  lines.push('');
  lines.push(`test('Chaos Session Replay - ${session.id}', async ({ page }) => {`);
  lines.push(`  // Session seed: ${session.seed}`);
  lines.push(`  // Original start time: ${session.startTime}`);
  lines.push('');
  
  // Navigate to start URL
  lines.push(`  // Navigate to starting URL`);
  lines.push(`  await page.goto('${escapeString(session.startUrl)}');`);
  lines.push('');

  // Generate actions
  for (const action of session.actions) {
    lines.push(`  // Action ${action.sequence}: ${action.type}`);
    
    if (action.result === 'skipped') {
      lines.push(`  // Skipped in original session`);
      continue;
    }

    const playwrightCode = actionToPlaywright(action);
    if (playwrightCode) {
      lines.push(`  ${playwrightCode}`);
      
      // Add small wait between actions
      lines.push(`  await page.waitForTimeout(100);`);
    }
    lines.push('');
  }

  lines.push('});');

  return lines.join('\n');
}

/**
 * Convert a recorded action to Playwright code
 */
function actionToPlaywright(action: RecordedAction): string | null {
  switch (action.type) {
    case 'click':
      if (action.selector) {
        return `await page.click('${escapeString(action.selector)}');`;
      }
      break;

    case 'type':
      if (action.selector && action.value) {
        return `await page.fill('${escapeString(action.selector)}', '${escapeString(action.value)}');`;
      }
      break;

    case 'navigate':
      if (action.url) {
        return `await page.goto('${escapeString(action.url)}');`;
      }
      break;

    case 'scroll':
      return `await page.evaluate(() => window.scrollBy(0, 300));`;

    case 'hover':
      if (action.selector) {
        return `await page.hover('${escapeString(action.selector)}');`;
      }
      break;

    case 'submit':
      if (action.selector) {
        return `await page.click('${escapeString(action.selector)}');`;
      }
      break;

    case 'select':
      if (action.selector && action.value) {
        return `await page.selectOption('${escapeString(action.selector)}', '${escapeString(action.value)}');`;
      }
      break;

    default:
      return `// Unsupported action type: ${action.type}`;
  }

  return null;
}

/**
 * Escape string for JavaScript
 */
function escapeString(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

// ============================================================================
// Session Replay
// ============================================================================

/**
 * Options for replaying a session
 */
export interface ReplayOptions {
  /** Speed multiplier (1 = original speed, 2 = 2x faster) */
  speed: number;
  /** Stop on first failure */
  stopOnFailure: boolean;
  /** Skip actions that originally failed */
  skipOriginalFailures: boolean;
  /** Custom delay between actions in ms */
  actionDelay?: number;
}

/**
 * Default replay options
 */
export const DEFAULT_REPLAY_OPTIONS: ReplayOptions = {
  speed: 1,
  stopOnFailure: false,
  skipOriginalFailures: true,
  actionDelay: undefined,
};

/**
 * Session replay result
 */
export interface ReplayResult {
  /** Whether replay completed */
  completed: boolean;
  /** Actions replayed */
  actionsReplayed: number;
  /** Actions that succeeded */
  successes: number;
  /** Actions that failed */
  failures: number;
  /** Duration of replay */
  durationMs: number;
  /** Differences from original session */
  differences: ReplayDifference[];
}

/**
 * Difference between original and replay
 */
export interface ReplayDifference {
  /** Action sequence number */
  actionSequence: number;
  /** Original result */
  originalResult: string;
  /** Replay result */
  replayResult: string;
  /** Description of difference */
  description: string;
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a chaos session recorder
 */
export function createSessionRecorder(options: {
  sessionId: string;
  seed: number;
  startUrl: string;
  projectId: string;
  config: SessionConfig;
  environment: SessionEnvironment;
}): ChaosSessionRecorder {
  return new ChaosSessionRecorder(options);
}

/**
 * Generate a deterministic seed from input
 */
export function generateSeed(input?: string): number {
  if (input) {
    // Generate seed from input string
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }
  
  // Generate random seed
  return Math.floor(Math.random() * 2147483647);
}

/**
 * Parse a session recording from JSON
 */
export function parseSessionRecording(json: string): ChaosSessionRecording {
  return JSON.parse(json) as ChaosSessionRecording;
}

/**
 * Serialize a session recording to JSON
 */
export function serializeSessionRecording(session: ChaosSessionRecording): string {
  return JSON.stringify(session, null, 2);
}
