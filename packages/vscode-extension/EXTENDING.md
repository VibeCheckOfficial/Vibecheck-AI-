# How to Extend the Vibecheck Extension

This guide explains how to add new commands to the VS Code extension.

## Architecture Overview

```
src/
  registry/
    commands.ts    # Canonical command definitions (SINGLE SOURCE OF TRUTH)
    tiers.ts       # Tier definitions (free/pro)
  entitlements/
    entitlements.ts  # Tier verification and gating
  cli/
    runner.ts      # Central CLI executor
    locate.ts      # Find CLI installation
  lib/
    errors.ts      # Error types and envelopes
  extension.ts     # Activation and command registration
```

## Adding a New Command (3 Steps)

### Step 1: Add to Registry (`src/registry/commands.ts`)

Add the command ID to the `CommandId` union type:

```typescript
export type CommandId =
  // ... existing commands
  | 'vibecheck.myNewCommand';
```

Add the command definition to `COMMANDS`:

```typescript
'vibecheck.myNewCommand': {
  id: 'vibecheck.myNewCommand',
  title: 'My New Command',
  category: 'proof',           // setup, proof, output, truth, authority, account, automation, ui, labs
  tier: 'pro',                 // null (FREE) or 'pro' (PRO)
  cliEquivalent: 'my-command', // CLI command name, or null for UI-only
  cliArgs: ['--json'],         // Default CLI arguments
  description: 'What this command does',
  icon: '$(symbol-method)',    // VS Code codicon
  telemetryEvent: 'command.myNew',
  timeout: 60000,              // Optional: override default timeout
  related: ['vibecheck.scan'], // Optional: related commands
},
```

### Step 2: Register Handler (`src/extension.ts`)

In the `activate` function, register the command:

```typescript
vscode.commands.registerCommand("vibecheck.myNewCommand", async () => {
  // 1. Check tier (if required)
  if (!(await requireTier('vibecheck.myNewCommand'))) {
    return;
  }
  
  // 2. Check workspace (if required)
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    vscode.window.showWarningMessage("Open a workspace to use this command.");
    return;
  }
  
  // 3. Execute CLI using the central runner
  const result = await runCommand('vibecheck.myNewCommand', ['--extra-arg']);
  
  // 4. Handle result
  if (result.success) {
    vscode.window.showInformationMessage("Command completed!");
  } else {
    vscode.window.showErrorMessage(`Failed: ${result.error?.message}`);
  }
}),
```

### Step 3: Add to `package.json`

Add the command to `contributes.commands`:

```json
{
  "command": "vibecheck.myNewCommand",
  "title": "My New Command",
  "category": "vibecheck",
  "icon": "$(symbol-method)"
}
```

Optionally add keybindings, menus, etc.

## Tier Enforcement

Commands with `tier: 'pro'` in the registry MUST call `requireTier()`:

```typescript
// REQUIRED for all PRO commands
if (!(await requireTier('vibecheck.myNewCommand'))) {
  return; // User was shown upgrade prompt
}
```

The `requireTier()` function:
1. Fetches entitlements from CLI/API (cached 5 min)
2. Checks if user's tier meets requirement
3. Shows appropriate UI if blocked (upgrade prompt)
4. Returns `true` if allowed, `false` if blocked

**NEVER** skip tier checks for PRO commands.

## Using the CLI Runner

Always use the central CLI runner (`src/cli/runner.ts`):

```typescript
import { runCLI, runCommand } from './cli';

// Run by registry command ID (preferred)
const result = await runCommand('vibecheck.scan');

// Run by CLI command name directly
const result = await runCLI('scan', ['--profile', 'full'], {
  json: true,
  timeout: 120000,
  onStdout: (chunk) => console.log(chunk),
});
```

Features:
- Spawn-based (not exec) for streaming and cancellation
- Automatic timeout per command type
- VS Code CancellationToken support
- JSON mode enforcement
- Safe output parsing with ErrorEnvelope
- Buffer overflow protection

## Error Handling

Use the error envelope pattern:

```typescript
import { createErrorEnvelope, formatErrorForUser, type ErrorEnvelope } from './lib';

// Create error
const error = createErrorEnvelope('CLI_ERROR', 'Something went wrong', {
  reason: 'The CLI returned an unexpected response',
  suggestion: 'Try running vibecheck doctor',
});

// Show to user
vscode.window.showErrorMessage(formatErrorForUser(error));
```

## Testing

Add tests to `src/test/`:

```typescript
import { describe, it, expect } from 'vitest';
import { requiresPro, getCommand } from '../registry';

describe('My New Command', () => {
  it('should be defined in registry', () => {
    const cmd = getCommand('vibecheck.myNewCommand');
    expect(cmd).toBeDefined();
    expect(cmd?.tier).toBe('pro');
  });
  
  it('should have CLI equivalent', () => {
    const cmd = getCommand('vibecheck.myNewCommand');
    expect(cmd?.cliEquivalent).toBe('my-command');
  });
});
```

## Checklist for New Commands

- [ ] Added to `CommandId` union type
- [ ] Added to `COMMANDS` registry with all required fields
- [ ] Registered handler in `extension.ts`
- [ ] Added to `package.json` contributes.commands
- [ ] Added `requireTier()` check if PRO command
- [ ] Uses central CLI runner (not ad-hoc exec/spawn)
- [ ] Has appropriate error handling
- [ ] Has tests
- [ ] Works offline (graceful degradation)
