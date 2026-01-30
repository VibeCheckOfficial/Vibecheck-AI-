import * as vscode from 'vscode';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import { Issue } from '../providers/DiagnosticsProvider';
import { ConfigService } from './ConfigService';
import { Logger } from '../utils/Logger';

const execAsync = promisify(exec);

/** CLI finding format from vibecheck CLI (legacy) */
interface CliFindingRaw {
  id?: string;
  type?: string;
  rule?: string;
  file?: string;
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
  title?: string;
  description?: string;
  message?: string;
  severity?: string;
  howToFix?: string;
  suggestion?: string;
  snippet?: string;
  fix?: {
    range: { start: { line: number; column: number }; end: { line: number; column: number } };
    replacement: string;
  };
}

/** Hallucination finding from new vibecheck-ai CLI */
interface CliHallucination {
  id: string;
  ruleId: string;
  type: string;
  value?: string;
  confidence?: number;
  location: {
    file: string;
    line: number;
    column: number;
  };
  reason: string;
}

/** New CLI check result format */
interface CliCheckResult {
  success: boolean;
  hallucinations?: CliHallucination[];
  drift?: {
    hasDrift: boolean;
    items: unknown[];
  };
  counts?: {
    findingsTotal: number;
    findingsBySeverity: {
      critical: number;
      high: number;
      medium: number;
      low: number;
    };
  };
  verdict?: {
    status: 'SHIP' | 'WARN' | 'BLOCK';
    reasons: string[];
  };
}

export class ScannerService {
  private _isScanning = false;
  private _cliAvailable: boolean | null = null;
  private _cliCommand: string = 'vibecheck'; // Will be updated if npx is needed

  constructor(private readonly _configService: ConfigService) { }

  public get isScanning(): boolean {
    return this._isScanning;
  }

  public async scanFile(filePath: string, content?: string): Promise<Issue[]> {
    if (this._isScanning) {
      Logger.warn('Scan already in progress');
      return [];
    }

    this._isScanning = true;

    try {
      // Check if CLI is available
      if (this._cliAvailable === null) {
        this._cliAvailable = await this._checkCliAvailable();
      }

      let issues: Issue[];

      if (this._cliAvailable) {
        issues = await this._scanWithCli(filePath);
      } else {
        issues = await this._scanBuiltIn(filePath, content);
      }

      Logger.info(`Scan complete: ${issues.length} issues found`);
      return issues;
    } catch (error) {
      Logger.error('Scan failed:', error);
      throw error;
    } finally {
      this._isScanning = false;
    }
  }

  public async scanWorkspace(): Promise<Map<string, Issue[]>> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      throw new Error('No workspace folder open');
    }

    const results = new Map<string, Issue[]>();

    // Check if CLI is available
    if (this._cliAvailable === null) {
      this._cliAvailable = await this._checkCliAvailable();
    }

    // If CLI is available, use the audit command for bulk scanning (much faster)
    if (this._cliAvailable) {
      return this._scanWorkspaceWithCli(workspaceFolders[0].uri.fsPath);
    }

    // Fallback to file-by-file scanning with built-in scanner
    const ignorePaths = this._configService.get<string[]>('ignorePaths') ?? [];

    const files = await vscode.workspace.findFiles(
      '**/*.{ts,tsx,js,jsx,py,go,rs}',
      `{${ignorePaths.join(',')}}`
    );

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'VibeCheck: Scanning workspace...',
        cancellable: true,
      },
      async (progress, token) => {
        let processed = 0;
        const total = files.length;

        for (const file of files) {
          if (token.isCancellationRequested) {
            break;
          }

          progress.report({
            message: `${processed}/${total} files`,
            increment: (1 / total) * 100,
          });

          try {
            const issues = await this._scanBuiltIn(file.fsPath);
            if (issues.length > 0) {
              results.set(file.fsPath, issues);
            }
          } catch (error) {
            Logger.error(`Failed to scan ${file.fsPath}:`, error);
          }

          processed++;
        }
      }
    );

    return results;
  }

  /**
   * Scan entire workspace using CLI audit command with SARIF output (much faster than file-by-file)
   */
  private async _scanWorkspaceWithCli(workspacePath: string): Promise<Map<string, Issue[]>> {
    const results = new Map<string, Issue[]>();
    const timeout = 120000; // 2 minute timeout for full workspace

    return new Promise((resolve) => {
      const cmdParts = this._cliCommand.split(' ');
      const cmd = cmdParts[0];
      // Use --sarif for structured output
      const cmdArgs = cmdParts.slice(1).concat(['audit', '--sarif']);

      Logger.info(`Running workspace audit: ${this._cliCommand} audit --sarif`);

      const proc = spawn(cmd, cmdArgs, { shell: true, cwd: workspacePath });
      let stdout = '';
      let stderr = '';
      let killed = false;

      const timeoutId = setTimeout(() => {
        killed = true;
        proc.kill('SIGKILL');
        Logger.warn('Workspace scan timeout');
        resolve(results);
      }, timeout);

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        clearTimeout(timeoutId);

        if (killed) {
          return;
        }

        try {
          // Parse SARIF output
          const sarif = JSON.parse(stdout);
          const sarifResults = sarif?.runs?.[0]?.results || [];

          // Convert SARIF results to our Issue format
          for (const result of sarifResults) {
            const location = result.locations?.[0]?.physicalLocation;
            const filePath = location?.artifactLocation?.uri || 'unknown';
            const line = location?.region?.startLine || 1;

            // Make file path absolute
            const absolutePath = path.isAbsolute(filePath)
              ? filePath
              : path.join(workspacePath, filePath);

            const issue: Issue = {
              id: `${result.ruleId}-${line}`,
              file: absolutePath,
              line: line,
              column: location?.region?.startColumn || 1,
              endLine: location?.region?.endLine,
              endColumn: location?.region?.endColumn,
              message: result.message?.text?.split('\n')[0] || 'Unknown issue',
              severity: this._mapSarifLevel(result.level),
              rule: result.ruleId || 'unknown',
              engine: this._mapCliType(result.ruleId),
              suggestion: result.message?.text?.includes('How to fix:')
                ? result.message.text.split('How to fix:')[1]?.trim()
                : undefined,
              fixable: false,
            };

            if (!results.has(absolutePath)) {
              results.set(absolutePath, []);
            }
            results.get(absolutePath)!.push(issue);
          }

          Logger.info(`Workspace audit complete: ${sarifResults.length} findings in ${results.size} files`);
        } catch (parseError) {
          Logger.error('Failed to parse SARIF output:', parseError);
          Logger.debug('Raw output:', stdout.substring(0, 500));
        }

        resolve(results);
      });

      proc.on('error', (err) => {
        clearTimeout(timeoutId);
        Logger.error('Audit process error:', err);
        resolve(results);
      });
    });
  }

  /**
   * Map SARIF level to our severity
   */
  private _mapSarifLevel(level: string): 'error' | 'warning' | 'info' | 'hint' {
    switch (level?.toLowerCase()) {
      case 'error':
        return 'error';
      case 'warning':
        return 'warning';
      case 'note':
        return 'info';
      default:
        return 'warning';
    }
  }

  public async getAiFix(issue: Issue, content: string): Promise<string | null> {
    const provider = this._configService.get<string>('autoFix.provider') ?? 'anthropic';
    const apiKey = this._configService.get<string>('apiKey');

    if (!apiKey && provider !== 'local') {
      void vscode.window.showWarningMessage(
        'VibeCheck: API key required for AI fixes. Configure in settings.'
      );
      return null;
    }

    // TODO: Implement AI fix call
    // For now, return the suggestion if available
    return issue.suggestion ?? null;
  }

  private async _checkCliAvailable(): Promise<boolean> {
    const cliPath = this._configService.get<string>('cliPath');

    // If user specified a path, use that
    if (cliPath) {
      try {
        await execAsync(`${cliPath} --version`);
        this._cliCommand = cliPath;
        Logger.info(`VibeCheck CLI detected at: ${cliPath}`);
        return true;
      } catch {
        Logger.warn(`Configured CLI path not found: ${cliPath}`);
      }
    }

    // Try direct vibecheck command
    try {
      await execAsync('vibecheck --version');
      this._cliCommand = 'vibecheck';
      Logger.info('VibeCheck CLI detected (global)');
      return true;
    } catch {
      // Not found directly, try npx
    }

    // Try npx vibecheck
    try {
      await execAsync('npx vibecheck --version');
      this._cliCommand = 'npx vibecheck';
      Logger.info('VibeCheck CLI detected via npx');
      return true;
    } catch {
      Logger.info('VibeCheck CLI not found, using built-in scanner');
      return false;
    }
  }

  private async _scanWithCli(filePath: string): Promise<Issue[]> {
    const timeout = 30000; // 30 second timeout per file

    return new Promise((resolve, reject) => {
      // New CLI uses 'check --json' for hallucination detection
      const args = ['check', '--json'];

      // Use the detected CLI command (could be 'vibecheck' or 'npx vibecheck')
      const cmdParts = this._cliCommand.split(' ');
      const cmd = cmdParts[0];
      const cmdArgs = cmdParts.slice(1).concat(args);
      const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

      const proc = spawn(cmd, cmdArgs, { 
        shell: true,
        cwd: workspacePath 
      });
      let stdout = '';
      let stderr = '';
      let killed = false;

      // Set timeout to kill hung processes
      const timeoutId = setTimeout(() => {
        killed = true;
        proc.kill('SIGKILL');
        Logger.warn(`Scan timeout for ${filePath}`);
        resolve([]); // Return empty on timeout instead of failing
      }, timeout);

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        clearTimeout(timeoutId);

        if (killed) {
          return; // Already resolved via timeout
        }

        // New CLI returns exit code 1 when issues found, which is fine
        if (code !== 0 && code !== 1) {
          Logger.warn(`CLI exited with code ${code} for ${filePath}`);
          resolve([]); // Return empty instead of rejecting
          return;
        }

        try {
          // New CLI outputs JSONL (log lines) then final JSON object
          // Extract the JSON object (starts with { and ends with })
          const jsonMatch = stdout.match(/\{[\s\S]*"commandName"[\s\S]*\}$/);
          if (!jsonMatch) {
            // Try legacy format
            const legacyResult = JSON.parse(stdout) as { findings?: CliFindingRaw[]; issues?: CliFindingRaw[] };
            const findings: CliFindingRaw[] = legacyResult.findings || legacyResult.issues || [];
            const issues: Issue[] = findings.map((f) => this._mapLegacyFinding(f, filePath));
            resolve(issues);
            return;
          }

          const result = JSON.parse(jsonMatch[0]) as CliCheckResult;
          
          // Map hallucinations to our Issue format
          const hallucinations = result.hallucinations || [];
          const issues: Issue[] = hallucinations
            .filter(h => {
              // Filter to only issues in the requested file (or all if scanning workspace)
              if (!filePath || filePath === '') return true;
              return h.location.file.includes(path.basename(filePath));
            })
            .map((h) => ({
              id: h.id,
              file: h.location.file,
              line: h.location.line,
              column: h.location.column,
              message: h.reason,
              severity: 'error' as const, // Hallucinations are high severity
              rule: h.ruleId,
              engine: 'hallucination',
              suggestion: `Check if "${h.value || h.type}" actually exists`,
            }));
          
          resolve(issues);
        } catch (parseError) {
          Logger.warn(`Failed to parse CLI output: ${parseError}`);
          // Fall back to built-in scanner instead of failing
          resolve([]);
        }
      });

      proc.on('error', (err) => {
        clearTimeout(timeoutId);
        Logger.warn(`CLI error: ${err.message}`);
        resolve([]); // Return empty instead of rejecting
      });
    });
  }

  private _mapLegacyFinding(f: CliFindingRaw, filePath: string): Issue {
    return {
      id: f.id || `${f.type}-${f.line}`,
      file: f.file || filePath,
      line: f.line || 1,
      column: f.column || 1,
      endLine: f.endLine,
      endColumn: f.endColumn,
      message: f.title || f.description || f.message || 'Unknown issue',
      severity: this._mapCliSeverity(f.severity || 'warning'),
      rule: f.type || f.rule || 'unknown',
      engine: this._mapCliType(f.type || 'unknown'),
      suggestion: f.howToFix || f.suggestion,
      codeSnippet: f.snippet,
      fixable: Boolean(f.fix),
      fix: f.fix,
    };
  }

  private _mapCliSeverity(severity: string): 'error' | 'warning' | 'info' | 'hint' {
    switch (severity?.toLowerCase()) {
      case 'critical':
      case 'high':
        return 'error';
      case 'medium':
        return 'warning';
      case 'low':
        return 'info';
      default:
        return 'warning';
    }
  }

  private _mapCliType(type: string): string {
    // Map CLI finding types to engine names
    switch (type?.toUpperCase()) {
      case 'SILENT_FAIL':
      case 'EMPTY_FUNCTION':
      case 'TODO_FIXME':
      case 'MOCK_DATA':
        return 'fake-feature';
      case 'SQL_INJECTION':
      case 'XSS':
      case 'HARDCODED_SECRET':
      case 'INSECURE_RANDOM':
        return 'security';
      case 'HALLUCINATION':
      case 'NONEXISTENT_API':
      case 'WRONG_SYNTAX':
        return 'hallucination';
      default:
        return 'security';
    }
  }

  private async _scanBuiltIn(filePath: string, content?: string): Promise<Issue[]> {
    // Built-in scanner for when CLI is not available
    const issues: Issue[] = [];
    const engines = this._configService.get<string[]>('engines') ?? [];

    // Get content if not provided
    if (!content) {
      try {
        const doc = await vscode.workspace.openTextDocument(filePath);
        content = doc.getText();
      } catch {
        return [];
      }
    }

    const lines = content.split('\n');
    const ext = path.extname(filePath);

    // Run enabled engines
    if (engines.includes('fake-feature')) {
      issues.push(...this._detectFakeFeatures(filePath, lines, ext));
    }

    if (engines.includes('security')) {
      issues.push(...this._detectSecurityIssues(filePath, lines, ext));
    }

    if (engines.includes('hallucination')) {
      issues.push(...this._detectHallucinations(filePath, lines, ext));
    }

    // Enrich issues with code snippets and additional metadata
    return issues.map(issue => ({
      ...issue,
      codeSnippet: this._extractCodeSnippet(lines, issue.line - 1),
      aiFixAvailable: Boolean(issue.suggestion),
      documentationUrl: `https://vibecheck.dev/rules/${issue.rule}`,
    }));
  }

  private _extractCodeSnippet(lines: string[], lineIndex: number, contextLines: number = 1): string {
    const start = Math.max(0, lineIndex - contextLines);
    const end = Math.min(lines.length - 1, lineIndex + contextLines);

    const snippet: string[] = [];
    for (let i = start; i <= end; i++) {
      const lineNum = (i + 1).toString().padStart(3, ' ');
      const marker = i === lineIndex ? '>' : ' ';
      snippet.push(`${marker} ${lineNum} | ${lines[i]}`);
    }

    return snippet.join('\n');
  }

  private _detectFakeFeatures(filePath: string, lines: string[], ext: string): Issue[] {
    const issues: Issue[] = [];
    const isJS = ['.js', '.jsx', '.ts', '.tsx'].includes(ext);
    const isPython = ext === '.py';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Empty function bodies
      if (isJS) {
        if (/^\s*(async\s+)?function\s+\w+\s*\([^)]*\)\s*\{\s*\}/.test(line)) {
          issues.push({
            id: `fake-feature-empty-fn-${lineNum}`,
            file: filePath,
            line: lineNum,
            column: 1,
            message: 'Empty function body - this function does nothing',
            severity: 'error',
            rule: 'no-empty-function',
            engine: 'fake-feature',
            suggestion: 'Implement the function body or remove if unused',
            fixable: false,
          });
        }

        // TODO comments without implementation
        if (/\/\/\s*TODO:?\s*(implement|add|fix)/i.test(line)) {
          issues.push({
            id: `fake-feature-todo-${lineNum}`,
            file: filePath,
            line: lineNum,
            column: line.indexOf('TODO'),
            message: 'TODO comment indicates unfinished implementation',
            severity: 'warning',
            rule: 'no-unfinished-todo',
            engine: 'fake-feature',
            suggestion: 'Complete the implementation or track in issue tracker',
            fixable: false,
          });
        }

        // console.log placeholders
        if (/console\.log\s*\(\s*['"`](implement|todo|fixme)/i.test(line)) {
          issues.push({
            id: `fake-feature-placeholder-log-${lineNum}`,
            file: filePath,
            line: lineNum,
            column: line.indexOf('console.log'),
            message: 'Placeholder console.log instead of actual implementation',
            severity: 'error',
            rule: 'no-placeholder-log',
            engine: 'fake-feature',
            fixable: true,
          });
        }

        // Hardcoded returns that look like placeholders
        if (/return\s+['"`](success|ok|done|placeholder)['"`]/i.test(line)) {
          issues.push({
            id: `fake-feature-hardcoded-return-${lineNum}`,
            file: filePath,
            line: lineNum,
            column: line.indexOf('return'),
            message: 'Hardcoded placeholder return value',
            severity: 'warning',
            rule: 'no-hardcoded-placeholder',
            engine: 'fake-feature',
          });
        }

        // Arrow functions with no body that should have one
        if (/=>\s*\{\s*\}/.test(line) && !/@callback|@param.*\{Function\}/.test(lines[i - 1] || '')) {
          issues.push({
            id: `fake-feature-empty-arrow-${lineNum}`,
            file: filePath,
            line: lineNum,
            column: line.indexOf('=>'),
            message: 'Empty arrow function body',
            severity: 'warning',
            rule: 'no-empty-arrow',
            engine: 'fake-feature',
          });
        }
      }

      if (isPython) {
        // pass statements that might be placeholders
        if (/^\s+pass\s*(#.*)?$/.test(line)) {
          const prevLine = lines[i - 1] || '';
          if (/def\s+\w+/.test(prevLine)) {
            issues.push({
              id: `fake-feature-pass-${lineNum}`,
              file: filePath,
              line: lineNum,
              column: line.indexOf('pass'),
              message: 'Function contains only pass - not implemented',
              severity: 'error',
              rule: 'no-pass-only',
              engine: 'fake-feature',
            });
          }
        }
      }
    }

    return issues;
  }

  private _detectSecurityIssues(filePath: string, lines: string[], ext: string): Issue[] {
    const issues: Issue[] = [];
    const isJS = ['.js', '.jsx', '.ts', '.tsx'].includes(ext);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      if (isJS) {
        // eval usage
        if (/\beval\s*\(/.test(line)) {
          issues.push({
            id: `security-eval-${lineNum}`,
            file: filePath,
            line: lineNum,
            column: line.indexOf('eval'),
            message: 'Dangerous use of eval() - potential code injection',
            severity: 'error',
            rule: 'no-eval',
            engine: 'security',
            suggestion: 'Use safer alternatives like JSON.parse() or Function constructor',
          });
        }

        // innerHTML with variables
        if (/\.innerHTML\s*=\s*[^'"`]/.test(line)) {
          issues.push({
            id: `security-innerhtml-${lineNum}`,
            file: filePath,
            line: lineNum,
            column: line.indexOf('innerHTML'),
            message: 'Potential XSS vulnerability - innerHTML with dynamic content',
            severity: 'error',
            rule: 'no-unsafe-innerhtml',
            engine: 'security',
            suggestion: 'Use textContent or sanitize input with DOMPurify',
          });
        }

        // Hardcoded secrets
        if (/(api[_-]?key|password|secret|token)\s*[:=]\s*['"`][^'"`]{8,}/i.test(line)) {
          issues.push({
            id: `security-hardcoded-secret-${lineNum}`,
            file: filePath,
            line: lineNum,
            column: 1,
            message: 'Potential hardcoded secret detected',
            severity: 'error',
            rule: 'no-hardcoded-secrets',
            engine: 'security',
            suggestion: 'Use environment variables instead',
          });
        }

        // SQL injection potential
        if (/query\s*\(\s*['"`].*\$\{|query\s*\(\s*['"`].*\+/.test(line)) {
          issues.push({
            id: `security-sql-injection-${lineNum}`,
            file: filePath,
            line: lineNum,
            column: line.indexOf('query'),
            message: 'Potential SQL injection - use parameterized queries',
            severity: 'error',
            rule: 'no-sql-injection',
            engine: 'security',
          });
        }
      }
    }

    return issues;
  }

  private _detectHallucinations(filePath: string, lines: string[], ext: string): Issue[] {
    const issues: Issue[] = [];
    const isJS = ['.js', '.jsx', '.ts', '.tsx'].includes(ext);

    // Common AI hallucinations
    const fakeApis = [
      { pattern: /require\(['"`]ai-utils['"`]\)/, name: 'ai-utils' },
      { pattern: /from ['"`]@anthropic\/helpers['"`]/, name: '@anthropic/helpers' },
      { pattern: /import.*from ['"`]react-native-ai['"`]/, name: 'react-native-ai' },
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      if (isJS) {
        // Check for commonly hallucinated packages
        for (const fakeApi of fakeApis) {
          if (fakeApi.pattern.test(line)) {
            issues.push({
              id: `hallucination-fake-import-${lineNum}`,
              file: filePath,
              line: lineNum,
              column: 1,
              message: `Potentially non-existent package: ${fakeApi.name}`,
              severity: 'error',
              rule: 'no-hallucinated-import',
              engine: 'hallucination',
              suggestion: 'Verify this package exists on npm before using',
            });
          }
        }

        // Suspicious API patterns (methods that don't exist on common objects)
        if (/Array\.(flatSort|uniqueBy|asyncMap|parallelMap)/.test(line)) {
          issues.push({
            id: `hallucination-fake-method-${lineNum}`,
            file: filePath,
            line: lineNum,
            column: line.indexOf('Array.'),
            message: 'Non-existent Array method detected',
            severity: 'error',
            rule: 'no-hallucinated-method',
            engine: 'hallucination',
          });
        }

        // Suspicious React hooks
        if (/use(AutoSave|Persistence|GlobalState)\s*\(/.test(line)) {
          issues.push({
            id: `hallucination-fake-hook-${lineNum}`,
            file: filePath,
            line: lineNum,
            column: 1,
            message: 'Potentially non-existent React hook',
            severity: 'warning',
            rule: 'verify-custom-hook',
            engine: 'hallucination',
            suggestion: 'Ensure this custom hook is defined in your codebase',
          });
        }
      }
    }

    return issues;
  }
}
