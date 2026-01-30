import * as vscode from 'vscode';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { Logger } from '../utils/Logger';
import { ConfigService } from './ConfigService';

const execAsync = promisify(exec);

/** Finding from CLI audit */
export interface CliFinding {
  id: string;
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title?: string;
  description?: string;
  message?: string;
  file: string;
  line?: number;
  howToFix?: string;
}

/** Manifest from CLI audit */
export interface CliManifest {
  version?: string;
  project?: string;
  timestamp?: string;
  config?: Record<string, unknown>;
}

export interface CliResult {
  success: boolean;
  data?: AuditResult | DoctorResult | ShipResult | Record<string, unknown>;
  error?: string;
  output?: string;
}

export interface AuditResult {
  version: string;
  timestamp: string;
  attackScore: number;
  findings: CliFinding[];
  summary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  manifest?: CliManifest;
}

export interface DoctorResult {
  healthy: boolean;
  checks: {
    name: string;
    status: 'pass' | 'warn' | 'fail';
    message: string;
  }[];
}

export interface ShipResult {
  verdict: 'SHIP' | 'WARN' | 'BLOCK';
  score: number;
  reasons: string[];
  blockers?: string[];
}

export class CliService {
  private _cliCommand: string = 'vibecheck';
  private _isAvailable: boolean | null = null;

  constructor(private readonly _configService: ConfigService) {
    const configPath = _configService.get<string>('cliPath');
    if (configPath) {
      this._cliCommand = configPath;
    }
  }

  public async isAvailable(): Promise<boolean> {
    if (this._isAvailable !== null) {
      return this._isAvailable;
    }

    // Try configured path first
    const configPath = this._configService.get<string>('cliPath');
    if (configPath) {
      try {
        await execAsync(`${configPath} --version`);
        this._cliCommand = configPath;
        this._isAvailable = true;
        Logger.info(`VibeCheck CLI found at: ${configPath}`);
        return true;
      } catch {
        // Continue to try other options
      }
    }

    // Try direct vibecheck
    try {
      await execAsync('vibecheck --version');
      this._cliCommand = 'vibecheck';
      this._isAvailable = true;
      Logger.info('VibeCheck CLI is available (global)');
      return true;
    } catch {
      // Not found, try npx
    }

    // Try npx vibecheck
    try {
      await execAsync('npx vibecheck --version');
      this._cliCommand = 'npx vibecheck';
      this._isAvailable = true;
      Logger.info('VibeCheck CLI is available via npx');
      return true;
    } catch {
      this._isAvailable = false;
      Logger.warn('VibeCheck CLI not found');
      return false;
    }
  }

  public async getVersion(): Promise<string | null> {
    if (!await this.isAvailable()) return null;

    try {
      const { stdout } = await execAsync(`${this._cliCommand} --version`);
      const match = stdout.match(/v?(\d+\.\d+\.\d+)/);
      return match ? match[1] : stdout.trim();
    } catch {
      return null;
    }
  }

  /**
   * Run doctor command - health check
   */
  public async doctor(): Promise<CliResult> {
    return this._runCommand(['doctor', '--json']);
  }

  /**
   * Run audit/check command - full security audit
   * New CLI uses 'check' command for hallucination/drift detection
   */
  public async audit(path?: string): Promise<CliResult> {
    // Try 'check' first (new vibecheck-ai CLI), fall back to 'audit' (legacy)
    const args = ['check', '--json'];
    const result = await this._runCommand(args);
    
    // If check command fails (not found), try legacy audit command
    if (!result.success && result.error?.includes('unknown command')) {
      const legacyArgs = ['audit', '--json'];
      if (path) {
        legacyArgs.push('--path', path);
      }
      return this._runCommand(legacyArgs);
    }
    
    return result;
  }

  /**
   * Run scan command to generate truthpack (new CLI)
   */
  public async generateTruthpack(): Promise<CliResult> {
    return this._runCommand(['scan', '--json']);
  }

  /**
   * Run forge command - generate AI rules
   * Note: New CLI may not have this command - returns graceful message
   */
  public async forge(outputPath?: string): Promise<CliResult> {
    const args = ['forge', '--json'];
    if (outputPath) {
      args.push('--output', outputPath);
    }
    const result = await this._runCommand(args);
    
    // If forge doesn't exist, return helpful message
    if (!result.success && result.error?.includes('unknown command')) {
      return {
        success: false,
        error: 'Forge command not available in this CLI version. Use vibecheck scan to generate a truthpack instead.',
      };
    }
    
    return result;
  }

  /**
   * Run ship command - get ship verdict (PRO)
   */
  public async ship(): Promise<CliResult> {
    return this._runCommand(['ship', '--json']);
  }

  /**
   * Run fix command - plan fixes (shows what would be fixed)
   */
  public async fixPlan(): Promise<CliResult> {
    return this._runCommand(['fix', '--plan-only']);
  }

  /**
   * Run fix command - apply fixes with checkpoints (PRO)
   */
  public async fixApply(): Promise<CliResult> {
    return this._runCommand(['fix', '--apply']);
  }

  /**
   * Run fix command for specific mission
   */
  public async fixMission(missionId: string, apply: boolean = false): Promise<CliResult> {
    const args = ['fix', '--mission', missionId];
    if (apply) {
      args.push('--apply');
    }
    return this._runCommand(args);
  }

  /**
   * Run fix command - auto-fix issues (PRO) - legacy
   */
  public async fix(findingId?: string): Promise<CliResult> {
    const args = ['fix'];
    if (findingId) {
      args.push('--mission', findingId);
    }
    args.push('--apply');
    return this._runCommand(args);
  }

  /**
   * Run checkpoint command - create snapshot
   */
  public async checkpoint(action: 'create' | 'restore' | 'list' = 'create', id?: string): Promise<CliResult> {
    const args = ['checkpoint', action, '--json'];
    if (id) {
      args.push(id);
    }
    return this._runCommand(args);
  }

  /**
   * Run packs/report command - generate report bundle
   * New CLI uses 'report' command
   */
  public async packs(format: 'html' | 'zip' | 'json' = 'html'): Promise<CliResult> {
    // Try 'report' first (new CLI), fall back to 'packs' (legacy)
    const args = ['report', '--json'];
    const result = await this._runCommand(args);
    
    if (!result.success && result.error?.includes('unknown command')) {
      const legacyArgs = ['packs', '--format', format, '--json'];
      return this._runCommand(legacyArgs);
    }
    
    return result;
  }

  /**
   * Run reality command - browser-based testing (PRO)
   */
  public async reality(url: string): Promise<CliResult> {
    const args = ['reality', '--url', url, '--json'];
    return this._runCommand(args);
  }

  /**
   * Run any CLI command in a visible terminal
   */
  public async runInTerminal(command: string, args: string[] = []): Promise<vscode.Terminal> {
    await this.isAvailable(); // Ensure _cliCommand is set
    const terminalName = `VibeCheck ${command.charAt(0).toUpperCase() + command.slice(1)}`;
    const terminal = vscode.window.createTerminal({
      name: terminalName,
      cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
    });
    terminal.show();
    const fullCommand = args.length > 0 
      ? `${this._cliCommand} ${command} ${args.join(' ')}`
      : `${this._cliCommand} ${command}`;
    terminal.sendText(fullCommand);
    return terminal;
  }

  /**
   * Run watch command in terminal
   */
  public async startWatch(): Promise<vscode.Terminal> {
    return this.runInTerminal('watch');
  }

  /**
   * Run doctor command in terminal
   */
  public async runDoctorInTerminal(): Promise<vscode.Terminal> {
    return this.runInTerminal('doctor');
  }

  /**
   * Run audit/check command in terminal
   */
  public async runAuditInTerminal(): Promise<vscode.Terminal> {
    return this.runInTerminal('check');
  }

  /**
   * Run forge command in terminal
   */
  public async runForgeInTerminal(): Promise<vscode.Terminal> {
    return this.runInTerminal('forge');
  }

  /**
   * Run ship command in terminal
   */
  public async runShipInTerminal(): Promise<vscode.Terminal> {
    return this.runInTerminal('ship');
  }

  /**
   * Run checkpoint command in terminal
   */
  public async runCheckpointInTerminal(): Promise<vscode.Terminal> {
    return this.runInTerminal('checkpoint');
  }

  /**
   * Run packs/report command in terminal
   */
  public async runPacksInTerminal(): Promise<vscode.Terminal> {
    return this.runInTerminal('report');
  }

  /**
   * Run prove command in terminal
   */
  public async runProveInTerminal(): Promise<vscode.Terminal> {
    return this.runInTerminal('prove');
  }

  /**
   * Run fix command in terminal
   */
  public async runFixInTerminal(plan: boolean = false): Promise<vscode.Terminal> {
    return this.runInTerminal('fix', plan ? ['--plan'] : ['--apply']);
  }

  /**
   * Run any arbitrary CLI command by name (public wrapper)
   */
  public async runCommand(command: string, args: string[] = []): Promise<CliResult> {
    return this._runCommand([command, '--json', ...args]);
  }

  /**
   * Run any CLI command
   */
  private async _runCommand(args: string[], cwd?: string): Promise<CliResult> {
    await this.isAvailable(); // Ensure _cliCommand is set
    const workspacePath = cwd || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

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
        // Try to extract JSON from output (CLI may include banners)
        let data: Record<string, unknown> | undefined = undefined;
        try {
          // Find JSON in output (may be surrounded by banners)
          const jsonMatch = stdout.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            data = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
          }
        } catch {
          Logger.debug('Could not parse JSON from CLI output');
        }

        if (code === 0 || code === 1) {
          resolve({
            success: true,
            data,
            output: stdout,
          });
        } else {
          resolve({
            success: false,
            error: stderr || `CLI exited with code ${code}`,
            output: stdout,
          });
        }
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
