/**
 * IDE Detector
 *
 * Detects which IDE/editor is being used to avoid generating
 * unnecessary rule files and reduce repository bloat.
 */

import * as fs from 'fs';
import * as path from 'path';

export type DetectedIDE = 'cursor' | 'windsurf' | 'vscode' | 'unknown';

export interface IDEDetectionResult {
  /** Primary detected IDE */
  ide: DetectedIDE;
  /** Confidence level 0-1 */
  confidence: number;
  /** All detected IDEs (user might have multiple) */
  allDetected: DetectedIDE[];
  /** Detection signals that were found */
  signals: IDESignal[];
  /** Recommended platforms to generate rules for */
  recommendedPlatforms: DetectedIDE[];
}

interface IDESignal {
  ide: DetectedIDE;
  signal: string;
  weight: number;
}

/**
 * Detect which IDE is currently being used
 *
 * Detection methods (in order of confidence):
 * 1. Environment variables set by the IDE
 * 2. Process/terminal context
 * 3. Existing config directories in project
 * 4. MCP server context
 */
export function detectIDE(projectPath: string): IDEDetectionResult {
  const signals: IDESignal[] = [];

  // 1. Check environment variables (highest confidence)
  signals.push(...detectFromEnvironment());

  // 2. Check process context
  signals.push(...detectFromProcess());

  // 3. Check existing project directories
  signals.push(...detectFromProjectStructure(projectPath));

  // 4. Check MCP context
  signals.push(...detectFromMCPContext());

  // Calculate scores per IDE
  const scores: Record<DetectedIDE, number> = {
    cursor: 0,
    windsurf: 0,
    vscode: 0,
    unknown: 0,
  };

  for (const signal of signals) {
    scores[signal.ide] += signal.weight;
  }

  // Determine primary IDE
  const sortedIDEs = (Object.entries(scores) as [DetectedIDE, number][])
    .filter(([ide]) => ide !== 'unknown')
    .sort((a, b) => b[1] - a[1]);

  const [primaryIDE, primaryScore] = sortedIDEs[0] ?? ['unknown', 0];
  const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
  const confidence = totalScore > 0 ? primaryScore / totalScore : 0;

  // Determine all detected IDEs (score > 0)
  const allDetected = sortedIDEs
    .filter(([, score]) => score > 0)
    .map(([ide]) => ide);

  // Recommend platforms
  const recommendedPlatforms = determineRecommendedPlatforms(
    primaryIDE,
    allDetected,
    confidence
  );

  return {
    ide: primaryIDE,
    confidence: Math.round(confidence * 100) / 100,
    allDetected,
    signals,
    recommendedPlatforms,
  };
}

function detectFromEnvironment(): IDESignal[] {
  const signals: IDESignal[] = [];

  // Cursor-specific environment variables
  if (process.env.CURSOR_SESSION_ID || process.env.CURSOR_TRACE_ID) {
    signals.push({ ide: 'cursor', signal: 'CURSOR_SESSION_ID env var', weight: 100 });
  }
  if (process.env.CURSOR_CHANNEL) {
    signals.push({ ide: 'cursor', signal: 'CURSOR_CHANNEL env var', weight: 80 });
  }

  // Windsurf-specific environment variables
  if (process.env.WINDSURF_SESSION_ID) {
    signals.push({ ide: 'windsurf', signal: 'WINDSURF_SESSION_ID env var', weight: 100 });
  }
  if (process.env.CODEIUM_API_KEY) {
    signals.push({ ide: 'windsurf', signal: 'CODEIUM_API_KEY env var (Windsurf)', weight: 60 });
  }

  // VS Code environment variables
  if (process.env.VSCODE_PID || process.env.VSCODE_CWD) {
    signals.push({ ide: 'vscode', signal: 'VSCODE_PID env var', weight: 50 });
  }
  if (process.env.TERM_PROGRAM === 'vscode') {
    signals.push({ ide: 'vscode', signal: 'TERM_PROGRAM=vscode', weight: 70 });
  }

  // Check for Cursor in terminal program (Cursor is VS Code-based)
  if (process.env.TERM_PROGRAM?.toLowerCase().includes('cursor')) {
    signals.push({ ide: 'cursor', signal: 'TERM_PROGRAM contains cursor', weight: 90 });
  }

  // Check parent process name in environment
  const parentProcess = process.env._ ?? '';
  if (parentProcess.toLowerCase().includes('cursor')) {
    signals.push({ ide: 'cursor', signal: 'Parent process is Cursor', weight: 85 });
  } else if (parentProcess.toLowerCase().includes('windsurf')) {
    signals.push({ ide: 'windsurf', signal: 'Parent process is Windsurf', weight: 85 });
  }

  return signals;
}

function detectFromProcess(): IDESignal[] {
  const signals: IDESignal[] = [];

  // Check process.title or argv for IDE indicators
  const processTitle = process.title?.toLowerCase() ?? '';
  const argv = process.argv.join(' ').toLowerCase();

  if (processTitle.includes('cursor') || argv.includes('cursor')) {
    signals.push({ ide: 'cursor', signal: 'Process context contains cursor', weight: 70 });
  }
  if (processTitle.includes('windsurf') || argv.includes('windsurf')) {
    signals.push({ ide: 'windsurf', signal: 'Process context contains windsurf', weight: 70 });
  }

  // Check if running inside an extension host
  if (process.env.VSCODE_IPC_HOOK_EXTHOST) {
    // This is set when running as a VS Code extension
    // Could be Cursor or VS Code
    const hook = process.env.VSCODE_IPC_HOOK_EXTHOST.toLowerCase();
    if (hook.includes('cursor')) {
      signals.push({ ide: 'cursor', signal: 'Extension host is Cursor', weight: 95 });
    } else if (hook.includes('windsurf')) {
      signals.push({ ide: 'windsurf', signal: 'Extension host is Windsurf', weight: 95 });
    } else {
      signals.push({ ide: 'vscode', signal: 'Extension host detected', weight: 40 });
    }
  }

  return signals;
}

function detectFromProjectStructure(projectPath: string): IDESignal[] {
  const signals: IDESignal[] = [];

  // Check for existing IDE-specific directories
  const cursorDir = path.join(projectPath, '.cursor');
  const windsurfDir = path.join(projectPath, '.windsurf');
  const vscodeDir = path.join(projectPath, '.vscode');

  if (fs.existsSync(cursorDir)) {
    signals.push({ ide: 'cursor', signal: '.cursor directory exists', weight: 30 });

    // Check for Cursor-specific files
    if (fs.existsSync(path.join(cursorDir, 'rules'))) {
      signals.push({ ide: 'cursor', signal: '.cursor/rules directory exists', weight: 20 });
    }
    if (fs.existsSync(path.join(cursorDir, 'mcp.json'))) {
      signals.push({ ide: 'cursor', signal: '.cursor/mcp.json exists', weight: 25 });
    }
  }

  if (fs.existsSync(windsurfDir)) {
    signals.push({ ide: 'windsurf', signal: '.windsurf directory exists', weight: 30 });

    if (fs.existsSync(path.join(windsurfDir, 'rules'))) {
      signals.push({ ide: 'windsurf', signal: '.windsurf/rules directory exists', weight: 20 });
    }
  }

  if (fs.existsSync(vscodeDir)) {
    signals.push({ ide: 'vscode', signal: '.vscode directory exists', weight: 15 });
  }

  // Check for .cursorrules file (legacy but indicates Cursor user)
  if (fs.existsSync(path.join(projectPath, '.cursorrules'))) {
    signals.push({ ide: 'cursor', signal: '.cursorrules file exists', weight: 25 });
  }

  return signals;
}

function detectFromMCPContext(): IDESignal[] {
  const signals: IDESignal[] = [];

  // Check MCP-related environment variables that might indicate the client
  if (process.env.MCP_CLIENT_NAME) {
    const client = process.env.MCP_CLIENT_NAME.toLowerCase();
    if (client.includes('cursor')) {
      signals.push({ ide: 'cursor', signal: 'MCP_CLIENT_NAME is Cursor', weight: 100 });
    } else if (client.includes('windsurf')) {
      signals.push({ ide: 'windsurf', signal: 'MCP_CLIENT_NAME is Windsurf', weight: 100 });
    }
  }

  // Check if we're running as a specific MCP server
  if (process.env.VIBECHECK_MCP_CLIENT) {
    const client = process.env.VIBECHECK_MCP_CLIENT.toLowerCase();
    if (client === 'cursor') {
      signals.push({ ide: 'cursor', signal: 'VIBECHECK_MCP_CLIENT is cursor', weight: 100 });
    } else if (client === 'windsurf') {
      signals.push({ ide: 'windsurf', signal: 'VIBECHECK_MCP_CLIENT is windsurf', weight: 100 });
    }
  }

  return signals;
}

function determineRecommendedPlatforms(
  primaryIDE: DetectedIDE,
  allDetected: DetectedIDE[],
  confidence: number
): DetectedIDE[] {
  // High confidence in primary IDE - only generate for that
  if (confidence >= 0.7 && primaryIDE !== 'unknown') {
    return [primaryIDE];
  }

  // Medium confidence - generate for primary and any others detected
  if (confidence >= 0.4 && primaryIDE !== 'unknown') {
    const platforms = new Set([primaryIDE, ...allDetected]);
    return Array.from(platforms).filter((ide) => ide !== 'unknown');
  }

  // Low confidence or unknown - check project structure
  if (allDetected.length > 0) {
    return allDetected.filter((ide) => ide !== 'unknown');
  }

  // Fallback: if truly unknown, generate for Cursor (most common AI-first IDE)
  return ['cursor'];
}

/**
 * Get user-friendly IDE name
 */
export function getIDEDisplayName(ide: DetectedIDE): string {
  switch (ide) {
    case 'cursor':
      return 'Cursor';
    case 'windsurf':
      return 'Windsurf';
    case 'vscode':
      return 'VS Code';
    default:
      return 'Unknown IDE';
  }
}

/**
 * Check if we should generate rules for a specific platform
 */
export function shouldGenerateForPlatform(
  platform: DetectedIDE,
  detection: IDEDetectionResult,
  forceAll: boolean = false
): boolean {
  if (forceAll) {
    return platform === 'cursor' || platform === 'windsurf';
  }
  return detection.recommendedPlatforms.includes(platform);
}
