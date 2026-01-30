import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext): void {
  // Register the hello world command
  const helloWorldDisposable = vscode.commands.registerCommand(
    'myExtension.helloWorld',
    handleHelloWorld
  );
  context.subscriptions.push(helloWorldDisposable);

  // Register the activate command
  const activateDisposable = vscode.commands.registerCommand(
    'myExtension.activate',
    handleActivate
  );
  context.subscriptions.push(activateDisposable);
}

async function handleHelloWorld(): Promise<void> {
  await vscode.window.showInformationMessage('Hello World from My Extension!');
}

async function handleActivate(): Promise<void> {
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Activating extension...',
      cancellable: false,
    },
    async (progress) => {
      progress.report({ increment: 50, message: 'Loading...' });

      // Simulate async initialization
      await new Promise((resolve) => setTimeout(resolve, 1000));

      progress.report({ increment: 50, message: 'Complete!' });
    }
  );

  await vscode.window.showInformationMessage('Extension activated!');
}

function getConfiguration<T>(key: string, defaultValue: T): T {
  const config = vscode.workspace.getConfiguration('myExtension');
  return config.get<T>(key, defaultValue);
}

export function deactivate(): void {
  // Clean up resources
}
