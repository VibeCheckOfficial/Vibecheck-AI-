import * as vscode from 'vscode';
import { spawn } from 'child_process';
import { Logger } from '../utils/Logger';
import { ConfigService } from './ConfigService';

export type FirewallMode = 'off' | 'observe' | 'enforce';

export interface FirewallStatus {
  mode: FirewallMode;
  enabled: boolean;
  violationCount: number;
  blockedCount: number;
  lastCheck?: string;
}

export interface FirewallVerdict {
  allowed: boolean;
  verdict: 'ALLOW' | 'WARN' | 'BLOCK';
  violations: FirewallViolation[];
  unblockPlan?: UnblockPlan;
}

export interface FirewallViolation {
  type: string;
  rule: string;
  message: string;
  file?: string;
  line?: number;
  severity: 'critical' | 'error' | 'warning' | 'info';
}

export interface UnblockPlan {
  reason: string;
  steps: UnblockStep[];
  estimatedTime?: string;
}

export interface UnblockStep {
  action: string;
  description: string;
  completed?: boolean;
}

export interface ShieldCheckResult {
  passed: boolean;
  score: number;
  verdict: 'SHIP' | 'WARN' | 'BLOCK';
  findings: ShieldFinding[];
  truthpack?: {
    routes: number;
    envVars: number;
    contracts: number;
  };
}

export interface ShieldFinding {
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  file?: string;
  line?: number;
  howToFix?: string;
}

export interface Intent {
  summary: string;
  constraints: string[];
  timestamp?: string;
  sessionId?: string;
  hash?: string;
}

export interface IntentTemplate {
  name: string;
  summary: string;
  constraints: string[];
}

/** CLI status response */
interface CliStatusResponse {
  mode?: FirewallMode;
  violationCount?: number;
  blockedCount?: number;
  lastCheck?: string;
}

/** CLI check response */
interface CliCheckResponse {
  passed?: boolean;
  score?: number;
  verdict?: 'SHIP' | 'WARN' | 'BLOCK';
  findings?: ShieldFinding[];
  truthpack?: {
    routes: number;
    envVars: number;
    contracts: number;
  };
}

/** CLI verify response */
interface CliVerifyResponse {
  allowed?: boolean;
  verdict?: 'ALLOW' | 'WARN' | 'BLOCK';
  violations?: FirewallViolation[];
  unblockPlan?: UnblockPlan;
}

// Pre-defined intent templates for common tasks
export const INTENT_TEMPLATES: IntentTemplate[] = [
  {
    name: 'Add Auth',
    summary: 'Add authentication feature',
    constraints: ['Use existing auth middleware', 'No new environment variables', 'Do not change billing code'],
  },
  {
    name: 'Add Route',
    summary: 'Add new API route',
    constraints: ['No new env vars unless declared', 'No auth changes', 'Follow existing route patterns'],
  },
  {
    name: 'Bug Fix',
    summary: 'Fix a specific bug',
    constraints: ['Minimal code changes', 'No new dependencies', 'No refactoring unrelated code'],
  },
  {
    name: 'Refactor',
    summary: 'Refactor existing code',
    constraints: ['No behavior changes', 'Preserve all tests', 'No new features'],
  },
  {
    name: 'Add Feature',
    summary: 'Add new feature',
    constraints: ['Use existing patterns', 'Add tests for new code', 'Update documentation'],
  },
  {
    name: 'Payment Flow',
    summary: 'Modify payment/billing code',
    constraints: ['No auth changes', 'Preserve existing integrations', 'Add audit logging'],
  },
];

export class FirewallService {
  private _cliCommand: string = 'vibecheck';
  private _cliChecked: boolean = false;
  private _shieldAvailable: boolean = false;
  private _mode: FirewallMode = 'off';
  private _violationCount: number = 0;
  private _blockedCount: number = 0;
  private _currentIntent: Intent | null = null;
  private _onStatusChange: vscode.EventEmitter<FirewallStatus> = new vscode.EventEmitter();
  private _onIntentChange: vscode.EventEmitter<Intent | null> = new vscode.EventEmitter();

  public readonly onStatusChange = this._onStatusChange.event;
  public readonly onIntentChange = this._onIntentChange.event;

  constructor(private readonly _configService: ConfigService) {
    void this._detectCli();
    void this._checkInitialStatus();
    void this._loadCurrentIntent();
  }

  private async _detectCli(): Promise<void> {
    if (this._cliChecked) return;

    const configPath = this._configService.get<string>('cliPath');
    const { execSync } = require('child_process');

    const tryCommand = (cmd: string): boolean => {
      try {
        execSync(`${cmd} --version`, { stdio: 'ignore' });
        return true;
      } catch {
        return false;
      }
    };

    const checkShieldAvailable = (cmd: string): boolean => {
      try {
        const output = execSync(`${cmd} --help`, { encoding: 'utf-8' });
        return output.includes('shield');
      } catch {
        return false;
      }
    };

    if (configPath && tryCommand(configPath)) {
      this._cliCommand = configPath;
      this._shieldAvailable = checkShieldAvailable(configPath);
    } else if (tryCommand('vibecheck')) {
      this._cliCommand = 'vibecheck';
      this._shieldAvailable = checkShieldAvailable('vibecheck');
    } else if (tryCommand('npx vibecheck')) {
      this._cliCommand = 'npx vibecheck';
      this._shieldAvailable = checkShieldAvailable('npx vibecheck');
    }

    this._cliChecked = true;
  }

  /**
   * Check if shield commands are available in the CLI
   */
  public isShieldAvailable(): boolean {
    return this._shieldAvailable;
  }

  private async _checkInitialStatus(): Promise<void> {
    const status = await this.getStatus();
    this._mode = status.mode;
  }

  /**
   * Get firewall status
   */
  public async getStatus(): Promise<FirewallStatus> {
    const result = await this._runCommand(['shield', 'status', '--json']);

    if (result.success && result.data) {
      const data = result.data as CliStatusResponse;
      this._mode = data.mode || 'off';
      return {
        mode: this._mode,
        enabled: this._mode !== 'off',
        violationCount: data.violationCount ?? this._violationCount,
        blockedCount: data.blockedCount ?? this._blockedCount,
        lastCheck: data.lastCheck,
      };
    }

    return {
      mode: this._mode,
      enabled: this._mode !== 'off',
      violationCount: this._violationCount,
      blockedCount: this._blockedCount,
    };
  }

  /**
   * Set firewall mode (observe/enforce/off)
   */
  public async setMode(mode: FirewallMode): Promise<boolean> {
    await this._detectCli();
    
    if (!this._shieldAvailable) {
      Logger.info('Shield commands not available in current CLI version');
      // Still update local mode for UI consistency
      this._mode = mode;
      this._onStatusChange.fire(await this.getStatus());
      return false;
    }

    let command: string[];

    switch (mode) {
      case 'enforce':
        command = ['shield', 'enforce'];
        break;
      case 'observe':
        command = ['shield', 'observe'];
        break;
      default:
        // Turn off by setting observe then manually updating
        command = ['shield', 'observe'];
        break;
    }

    const result = await this._runCommand(command);

    if (result.success) {
      this._mode = mode;
      this._onStatusChange.fire(await this.getStatus());
      return true;
    }

    return false;
  }

  /**
   * Run shield check (comprehensive verification)
   */
  public async check(): Promise<ShieldCheckResult | null> {
    await this._detectCli();
    
    if (!this._shieldAvailable) {
      Logger.info('Shield commands not available in current CLI version');
      return null;
    }

    const result = await this._runCommand(['shield', 'check', '--json']);

    if (result.success && result.data) {
      const data = result.data as CliCheckResponse;
      return {
        passed: data.passed ?? data.verdict === 'SHIP',
        score: data.score || 0,
        verdict: data.verdict || 'WARN',
        findings: data.findings || [],
        truthpack: data.truthpack,
      };
    }

    return null;
  }

  /**
   * Verify AI claims
   */
  public async verify(): Promise<FirewallVerdict | null> {
    const result = await this._runCommand(['shield', 'verify', '--claims', '--json']);

    if (result.success && result.data) {
      const data = result.data as CliVerifyResponse;
      return {
        allowed: data.allowed ?? true,
        verdict: data.verdict || 'ALLOW',
        violations: data.violations || [],
        unblockPlan: data.unblockPlan,
      };
    }

    return null;
  }

  /**
   * Install IDE hooks
   */
  public async installHooks(): Promise<boolean> {
    const result = await this._runCommand(['shield', 'install']);
    return result.success;
  }

  /**
   * Get current mode
   */
  public getMode(): FirewallMode {
    return this._mode;
  }

  /**
   * Check if firewall is enabled
   */
  public isEnabled(): boolean {
    return this._mode !== 'off';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INTENT MANAGEMENT - "Intent First" Agent Firewall
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Load current intent from CLI
   */
  private async _loadCurrentIntent(): Promise<void> {
    const intent = await this.getIntent();
    this._currentIntent = intent;
  }

  /**
   * Get current intent from CLI
   */
  public async getIntent(): Promise<Intent | null> {
    const result = await this._runCommand(['intent', 'show', '--json']);

    if (result.success && result.data) {
      const data = result.data as { summary?: string; intent?: string; constraints?: string[]; timestamp?: string; sessionId?: string; hash?: string };
      const intent: Intent = {
        summary: data.summary || data.intent || '',
        constraints: data.constraints || [],
        timestamp: data.timestamp,
        sessionId: data.sessionId,
        hash: data.hash,
      };

      if (intent.summary) {
        this._currentIntent = intent;
        return intent;
      }
    }

    // Try parsing non-JSON output
    if (result.output && result.output.includes('Intent:')) {
      const summaryMatch = result.output.match(/Intent:\s*(.+)/);
      if (summaryMatch) {
        const intent: Intent = {
          summary: summaryMatch[1].trim(),
          constraints: [],
        };
        this._currentIntent = intent;
        return intent;
      }
    }

    this._currentIntent = null;
    return null;
  }

  /**
   * Set intent with summary and constraints
   */
  public async setIntent(summary: string, constraints: string[] = []): Promise<boolean> {
    // Build command args
    const args = ['intent', 'set', '-s', summary];

    // Add constraints
    for (const constraint of constraints) {
      args.push('--constraint', constraint);
    }

    const result = await this._runCommand(args);

    if (result.success) {
      this._currentIntent = { summary, constraints, timestamp: new Date().toISOString() };
      this._onIntentChange.fire(this._currentIntent);

      // Auto-enable observe mode if off
      if (this._mode === 'off') {
        await this.setMode('observe');
      }

      return true;
    }

    return false;
  }

  /**
   * Set intent from a template
   */
  public async setIntentFromTemplate(template: IntentTemplate, customSummary?: string): Promise<boolean> {
    const summary = customSummary || template.summary;
    return this.setIntent(summary, template.constraints);
  }

  /**
   * Clear current intent
   */
  public async clearIntent(): Promise<boolean> {
    const result = await this._runCommand(['intent', 'clear']);

    if (result.success) {
      this._currentIntent = null;
      this._onIntentChange.fire(null);
      return true;
    }

    return false;
  }

  /**
   * Get current intent (cached)
   */
  public getCurrentIntent(): Intent | null {
    return this._currentIntent;
  }

  /**
   * Check if intent is set
   */
  public hasIntent(): boolean {
    return this._currentIntent !== null && this._currentIntent.summary.length > 0;
  }

  /**
   * Get intent templates
   */
  public getTemplates(): IntentTemplate[] {
    return INTENT_TEMPLATES;
  }

  /**
   * Prompt for intent if not set and mode is enforce
   * Returns true if intent exists or was set, false if blocked
   */
  public async requireIntent(): Promise<boolean> {
    if (this.hasIntent()) {
      return true;
    }

    if (this._mode === 'enforce') {
      // In enforce mode, we MUST have intent
      return false;
    }

    // In observe mode, warn but allow
    return true;
  }

  /**
   * Run CLI command
   */
  private async _runCommand(args: string[]): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string; output?: string }> {
    await this._detectCli(); // Ensure CLI is detected
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    return new Promise((resolve) => {
      // Handle commands like 'npx vibecheck' by splitting
      const cmdParts = this._cliCommand.split(' ');
      const cmd = cmdParts[0];
      const cmdArgs = cmdParts.slice(1).concat(args);

      const process = spawn(cmd, cmdArgs, {
        cwd: workspacePath,
        shell: true,
      });

      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        let data: Record<string, unknown> | undefined = undefined;
        try {
          const jsonMatch = stdout.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            data = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
          }
        } catch {
          Logger.debug('Could not parse JSON from shield output');
        }

        resolve({
          success: code === 0 || code === 1,
          data,
          output: stdout,
          error: stderr || undefined,
        });
      });

      process.on('error', (err) => {
        resolve({
          success: false,
          error: err.message,
        });
      });
    });
  }
}
