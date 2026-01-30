# VS Code Extension: Duplicate Command Registration Audit

This document identifies duplicate command registrations in the VibeCheck VS Code extension and provides recommendations for cleanup.

## Overview

The extension registers commands in multiple locations, leading to duplicate registrations. When VS Code encounters duplicate command registrations, the last registration wins, which can cause inconsistent behavior and confusion during development.

## Identified Duplicates

| Command ID | Registration Locations | Recommendation |
|------------|------------------------|----------------|
| `vibecheck.watch.toggle` | `extension.ts:414`, `watch-mode.ts:260` | Keep in `watch-mode.ts`, remove from `extension.ts` |
| `vibecheck.refreshFindings` | `extension.ts:558`, `findings-tree-provider.ts:416` | Keep in `findings-tree-provider.ts`, remove from `extension.ts` |
| `vibecheck.clearFindings` | `extension.ts:564`, `findings-tree-provider.ts:423` | Keep in `findings-tree-provider.ts`, remove from `extension.ts` |
| `vibecheck.truthpack.refresh` | `extension.ts:632`, `truthpack-viewer.ts:470` | Keep in `truthpack-viewer.ts`, remove from `extension.ts` |
| `vibecheck.truthpack.generate` | `extension.ts:639`, `truthpack-viewer.ts:491` | Keep in `truthpack-viewer.ts`, remove from `extension.ts` |

## Recommended Actions

### 1. Consolidate Registration Strategy

Choose one of these approaches:

**Option A: Feature-Module Registration (Recommended)**
- Each feature module (watch-mode, findings-tree-provider, truthpack-viewer) registers its own commands
- `extension.ts` only registers commands that don't belong to a specific feature
- Pros: Better encapsulation, commands are defined near their implementation
- Cons: Commands scattered across files

**Option B: Centralized Registration**
- All commands registered in `extension.ts`
- Feature modules export handler functions but don't register commands
- Pros: Single source of truth for all commands
- Cons: `extension.ts` becomes large, tighter coupling

### 2. Remove Duplicates from extension.ts

The following commands should be removed from `extension.ts` since they are already registered by their respective feature modules:

```typescript
// REMOVE these from extension.ts registerCommands():

// Watch mode commands - registered in watch-mode.ts
// vscode.commands.registerCommand('vibecheck.watch.toggle', ...)

// Findings commands - registered in findings-tree-provider.ts
// vscode.commands.registerCommand('vibecheck.refreshFindings', ...)
// vscode.commands.registerCommand('vibecheck.clearFindings', ...)

// Truthpack commands - registered in truthpack-viewer.ts
// vscode.commands.registerCommand('vibecheck.truthpack.refresh', ...)
// vscode.commands.registerCommand('vibecheck.truthpack.generate', ...)
```

### 3. Missing Command Registrations

The following commands were identified as missing:

| Command ID | Issue | Status |
|------------|-------|--------|
| `vibecheck.openReport` | Used in status-bar.ts and dashboard-webview.ts but not registered | **FIXED** - Added to extension.ts and package.json |
| `vibecheck.polish` | Defined in package.json but not registered | NOT REGISTERED - add to extension.ts or mark as experimental |
| `vibecheck.forge` | Defined in package.json but not registered | NOT REGISTERED - add to extension.ts or mark as experimental |

### 4. Placeholder Commands

The following commands are registered but show placeholder messages:

- `vibecheck.realityMode` - Shows "Coming soon!" message
- `vibecheck.runTests` - Shows "Coming soon!" message

Consider either implementing these or removing them from the command palette to avoid user confusion.

## Command Registry System

The extension has a command registry system in `registry/commands.ts` that is not currently used for actual registration. Consider using this registry to:

1. Generate package.json command definitions automatically
2. Validate that all defined commands are registered
3. Provide a single source of truth for command metadata

## Testing for Duplicates

To detect duplicate registrations in the future, add this check to your test suite:

```typescript
import * as vscode from 'vscode';

describe('Command Registration', () => {
  it('should not have duplicate command registrations', () => {
    const commandIds = new Set<string>();
    const duplicates: string[] = [];
    
    // Get all registered commands
    const commands = vscode.commands.getCommands(true);
    commands.then(cmds => {
      cmds.filter(c => c.startsWith('vibecheck.')).forEach(cmd => {
        if (commandIds.has(cmd)) {
          duplicates.push(cmd);
        }
        commandIds.add(cmd);
      });
      
      expect(duplicates).toHaveLength(0);
    });
  });
});
```

## Related Documentation

- `docs/VSCODE_EXTENSION_FIX.md` - User-facing troubleshooting for duplicate extension installations
- `vscode-extension/src/registry/commands.ts` - Command registry definitions
