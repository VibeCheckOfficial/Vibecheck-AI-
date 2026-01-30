import * as vscode from 'vscode';

class LoggerClass {
  private readonly _outputChannel: vscode.OutputChannel;
  private _debugMode = false;

  constructor() {
    this._outputChannel = vscode.window.createOutputChannel('VibeCheck');
  }

  public setDebugMode(enabled: boolean): void {
    this._debugMode = enabled;
  }

  public info(message: string, ...args: unknown[]): void {
    this._log('INFO', message, ...args);
  }

  public warn(message: string, ...args: unknown[]): void {
    this._log('WARN', message, ...args);
  }

  public error(message: string, ...args: unknown[]): void {
    this._log('ERROR', message, ...args);
  }

  public debug(message: string, ...args: unknown[]): void {
    if (this._debugMode) {
      this._log('DEBUG', message, ...args);
    }
  }

  public show(): void {
    this._outputChannel.show();
  }

  private _log(level: string, message: string, ...args: unknown[]): void {
    const timestamp = new Date().toISOString();
    const formattedArgs = args.length > 0 ? ' ' + this._safeStringify(args) : '';
    const logMessage = `[${timestamp}] [${level}] ${message}${formattedArgs}`;

    this._outputChannel.appendLine(logMessage);

    if (level === 'ERROR') {
      console.error(logMessage);
    } else if (this._debugMode) {
      console.log(logMessage);
    }
  }

  private _safeStringify(obj: unknown): string {
    const seen = new WeakSet();
    return JSON.stringify(obj, (key, value) => {
      // Handle Error objects specially
      if (value instanceof Error) {
        return {
          name: value.name,
          message: value.message,
          stack: value.stack,
        };
      }
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return '[Circular]';
        }
        seen.add(value);
      }
      // Handle Timeout objects
      if (value && typeof value === 'object' && value.constructor?.name === 'Timeout') {
        return '[Timeout]';
      }
      return value;
    });
  }

  public dispose(): void {
    this._outputChannel.dispose();
  }
}

export const Logger = new LoggerClass();
