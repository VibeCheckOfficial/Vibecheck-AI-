import * as vscode from 'vscode';

export class ConfigService {
  private readonly _section = 'vibecheck';

  public get<T>(key: string): T | undefined {
    return vscode.workspace.getConfiguration(this._section).get<T>(key);
  }

  public async set(key: string, value: unknown, global = false): Promise<void> {
    await vscode.workspace
      .getConfiguration(this._section)
      .update(key, value, global ? vscode.ConfigurationTarget.Global : vscode.ConfigurationTarget.Workspace);
  }

  public isEnabled(): boolean {
    return this.get<boolean>('enabled') ?? true;
  }

  public isScanOnSaveEnabled(): boolean {
    return this.get<boolean>('scanOnSave') ?? true;
  }

  public isScanOnOpenEnabled(): boolean {
    return this.get<boolean>('scanOnOpen') ?? false;
  }

  public isWatchModeEnabled(): boolean {
    return this.get<boolean>('watchMode') ?? false;
  }

  public getWatchModeDelay(): number {
    return this.get<number>('watchModeDelay') ?? 1000;
  }

  public getEnabledEngines(): string[] {
    return this.get<string[]>('engines') ?? ['fake-feature', 'security', 'hallucination', 'dependency'];
  }

  public getIgnorePaths(): string[] {
    return this.get<string[]>('ignorePaths') ?? ['node_modules', 'dist', 'build', '.git', 'coverage'];
  }

  public getCliPath(): string | undefined {
    return this.get<string>('cliPath');
  }

  public getApiKey(): string | undefined {
    return this.get<string>('apiKey');
  }

  public isAutoFixEnabled(): boolean {
    return this.get<boolean>('autoFix.enabled') ?? true;
  }

  public getAutoFixProvider(): 'anthropic' | 'openai' | 'local' {
    return this.get<'anthropic' | 'openai' | 'local'>('autoFix.provider') ?? 'anthropic';
  }

  public getRealityModeBrowser(): 'chromium' | 'firefox' | 'webkit' {
    return this.get<'chromium' | 'firefox' | 'webkit'>('realityMode.browser') ?? 'chromium';
  }

  public isRealityModeHeadless(): boolean {
    return this.get<boolean>('realityMode.headless') ?? true;
  }

  public isTelemetryEnabled(): boolean {
    return this.get<boolean>('telemetry') ?? true;
  }

  public areDecorationsEnabled(): boolean {
    return this.get<boolean>('decorations.enabled') ?? true;
  }

  public areInlineHintsEnabled(): boolean {
    return this.get<boolean>('showInlineHints') ?? true;
  }
}
