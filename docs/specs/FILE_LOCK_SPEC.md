# File Lock Feature Specification

## Overview

Prevent the extension (and agent workflows) from modifying protected files unless explicitly allowed. Provides granular control over file protection with audit logging.

---

## Lock Types

### 1. Explicit File Lock
- User explicitly locks a specific file
- Stored in lock registry
- Visible via file decoration

### 2. Explicit Folder Lock  
- User locks an entire folder
- All children inherit lock
- Children show inherited lock indicator

### 3. Pattern-Based Lock (Sensitive Files)
- Glob patterns for common sensitive files
- Default patterns (configurable):
  - `.env*` - Environment files
  - `**/credentials*` - Credential files
  - `**/*.key`, `**/*.pem` - Key files
  - `**/secrets*` - Secret files
  - `*lock.json`, `*lock.yaml` - Lock files
  - `.git/**` - Git internals

---

## Lock Registry

### Data Structure

```typescript
interface LockedItem {
  path: string;           // Absolute path
  type: 'file' | 'folder';
  lockedAt: string;       // ISO timestamp
  reason?: string;        // User-provided reason
  lockedBy: 'user' | 'pattern' | 'system';
}

interface TempUnlock {
  path: string;
  unlockedAt: string;     // ISO timestamp
  expiresAt: string;      // ISO timestamp
  scope: 'once' | 'timed' | 'session';
}

interface LockConfig {
  patterns: string[];     // Glob patterns for auto-lock
  enablePatternLock: boolean;
  defaultPatterns: boolean; // Use built-in sensitive file patterns
}
```

### Storage

| Location | Data | Purpose |
|----------|------|---------|
| `workspaceState['vibecheck.locks']` | `LockedItem[]` | Persistent lock registry |
| `workspaceState['vibecheck.tempUnlocks']` | `TempUnlock[]` | Temporary unlocks |
| `.vibecheck/locks.json` | `LockedItem[]` | Human-readable backup |
| Settings | `LockConfig` | Pattern configuration |

---

## UX Flow

### Lock File Flow

```
User right-clicks file in Explorer
         │
         ▼
┌─────────────────────────┐
│ Context Menu            │
│ ├── VibeCheck          │
│ │   ├── 🔒 Lock File   │◀── Click
│ │   └── ...            │
└─────────────────────────┘
         │
         ▼
File locked → Decoration appears → Toast notification
```

### Blocked Write Flow

```
Extension attempts file write (e.g., autofix)
         │
         ▼
SaveInterceptor.onWillSave() called
         │
         ▼
LockService.isLocked(uri) → true
         │
         ▼
┌─────────────────────────────────────┐
│  🔒 File Protected                  │
│                                     │
│  "config.ts" is locked and cannot   │
│  be modified by VibeCheck.          │
│                                     │
│  Locked: 2 hours ago                │
│  Reason: Production config          │
│                                     │
│  [Unlock Once] [Unlock 10 min]      │
│  [Unlock Session] [Open Settings]   │
└─────────────────────────────────────┘
         │
         ├── "Unlock Once" → Write proceeds, re-locks after
         ├── "Unlock 10 min" → TempUnlock created, write proceeds
         ├── "Unlock Session" → Session unlock, write proceeds
         └── Dismissed/Settings → Write blocked, audit logged
```

---

## Enforcement Points

### 1. SaveInterceptor Integration

Modify `save-interceptor.ts` to check locks BEFORE firewall evaluation:

```typescript
onWillSave(event: TextDocumentWillSaveEvent): void {
  // 1. Check if file is locked (NEW)
  if (this.lockService.isLocked(event.document.uri)) {
    // Only block extension-initiated saves
    if (this.isExtensionInitiated(event)) {
      const result = await this.lockService.requestAccess(
        event.document.uri,
        'File save requested'
      );
      if (!result) {
        // Block the save
        event.waitUntil(Promise.reject(new Error('File is locked')));
        return;
      }
    }
  }

  // 2. Existing firewall checks...
}
```

### 2. Extension-Initiated Detection

Only block writes initiated by the extension, NOT user edits:

```typescript
// Track extension-initiated operations
private extensionOperationInProgress = false;

// Called before extension performs file write
async performExtensionWrite(uri: Uri, content: string): Promise<void> {
  this.extensionOperationInProgress = true;
  try {
    const edit = new vscode.WorkspaceEdit();
    edit.replace(uri, fullRange, content);
    await vscode.workspace.applyEdit(edit);
  } finally {
    this.extensionOperationInProgress = false;
  }
}

isExtensionInitiated(event: TextDocumentWillSaveEvent): boolean {
  // Heuristic: If reason is AfterDelay or FocusOut, it's user-initiated
  if (event.reason === vscode.TextDocumentSaveReason.AfterDelay ||
      event.reason === vscode.TextDocumentSaveReason.FocusOut) {
    return false;
  }
  return this.extensionOperationInProgress;
}
```

### 3. Force Save Command

Bypass for users who need to save locked files:

```typescript
// vibecheck.forceSave command
async function forceSave(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;

  const uri = editor.document.uri;
  if (lockService.isLocked(uri)) {
    const result = await vscode.window.showWarningMessage(
      'This file is locked. Force save will bypass protection.',
      'Force Save', 'Cancel'
    );
    if (result !== 'Force Save') return;
    
    // Temporarily unlock for this save
    lockService.grantTempAccess(uri, 'once');
  }

  await editor.document.save();
}
```

---

## Unlock Options

### Unlock Once
- Grants one-time write permission
- Automatically revoked after write completes
- No timer, immediate re-lock

### Unlock 10 Minutes
- Grants timed access (configurable, default 10 min)
- Timer stored in `tempUnlocks`
- Auto-expires, cleanup on interval

### Unlock for Session
- Grants access until VS Code restarts
- Stored in memory only (not persisted)
- Cleared on deactivate()

---

## Visual Indicators

### File Decoration

```typescript
provideFileDecoration(uri: Uri): FileDecoration | undefined {
  if (!this.lockService.isLocked(uri)) return undefined;

  const isDirectLock = this.lockService.isDirectlyLocked(uri);
  const lockInfo = this.lockService.getLockInfo(uri);

  return {
    badge: '🔒',  // Or 'L' for compatibility
    tooltip: this.buildTooltip(uri, isDirectLock, lockInfo),
    color: new vscode.ThemeColor('vibecheck.lockedFile'),
    propagate: isDirectLock && lockInfo?.type === 'folder',
  };
}
```

### Status Bar (When locked file is open)

```
[🔒 File Locked] - Click to manage
```

---

## Audit Logging

### Output Channel

Create dedicated output channel: `VibeCheck File Lock Audit`

### Log Format

```
[2026-01-29T12:34:56.789Z] BLOCKED | path=/src/config.ts | action=write | rule=explicit | reason="Production config"
[2026-01-29T12:35:00.123Z] UNLOCKED | path=/src/config.ts | scope=timed | duration=600s
[2026-01-29T12:35:01.456Z] ALLOWED | path=/src/config.ts | action=write | unlock=timed
[2026-01-29T12:45:01.789Z] RELOCK | path=/src/config.ts | reason=timeout
```

### Audit Entry

```typescript
interface AuditEntry {
  timestamp: string;
  event: 'BLOCKED' | 'ALLOWED' | 'UNLOCKED' | 'LOCKED' | 'RELOCK';
  path: string;
  action?: string;
  rule?: 'explicit' | 'folder' | 'pattern';
  scope?: 'once' | 'timed' | 'session';
  duration?: number;
  reason?: string;
}

// Log function - NO secrets, NO file contents
function audit(entry: AuditEntry): void {
  const line = `[${entry.timestamp}] ${entry.event} | path=${entry.path}`;
  // ... add other fields
  outputChannel.appendLine(line);
}
```

---

## Commands

### New Commands

| Command | Title | Context |
|---------|-------|---------|
| `vibecheck.lockFile` | Lock File | Explorer context menu, editor title |
| `vibecheck.lockFolder` | Lock Folder | Explorer context menu |
| `vibecheck.unlockFile` | Unlock File | Explorer context menu (when locked) |
| `vibecheck.unlockFolder` | Unlock Folder | Explorer context menu (when locked) |
| `vibecheck.toggleLock` | Toggle Lock | Explorer context menu, keybinding |
| `vibecheck.showLockedFiles` | Show Locked Files | Command palette |
| `vibecheck.unlockAll` | Unlock All Files | Command palette |
| `vibecheck.forceSave` | Force Save | Command palette (existing, needs registration) |

---

## Configuration

### package.json contributions

```json
{
  "vibecheck.fileLock.enabled": {
    "type": "boolean",
    "default": true,
    "description": "Enable file lock protection"
  },
  "vibecheck.fileLock.patterns": {
    "type": "array",
    "default": [],
    "description": "Additional glob patterns for auto-locking files"
  },
  "vibecheck.fileLock.defaultPatterns": {
    "type": "boolean",
    "default": true,
    "description": "Protect sensitive files by default (.env, credentials, etc.)"
  },
  "vibecheck.fileLock.tempUnlockDuration": {
    "type": "number",
    "default": 600,
    "description": "Duration in seconds for timed unlock (default: 10 minutes)"
  }
}
```

### Default Sensitive Patterns

```typescript
const DEFAULT_SENSITIVE_PATTERNS = [
  '**/.env',
  '**/.env.*',
  '**/credentials*',
  '**/secrets*',
  '**/*.key',
  '**/*.pem',
  '**/*.p12',
  '**/*.pfx',
  '**/id_rsa*',
  '**/id_ed25519*',
  '**/.npmrc',
  '**/.pypirc',
  '**/package-lock.json',
  '**/pnpm-lock.yaml',
  '**/yarn.lock',
  '**/.git/**',
];
```

---

## Threat Model

### Potential Bypasses

| Threat | Risk | Mitigation |
|--------|------|------------|
| User saves file normally | Low | By design - locks only affect extension |
| Extension uses different write API | Medium | Wrap ALL write paths through LockService |
| External process modifies file | N/A | Out of scope - extension can't control |
| Race condition: check-then-write | Medium | Use atomic lock check in write wrapper |
| Clear localStorage/state | Low | File-based backup in `.vibecheck/locks.json` |
| Modify locks.json directly | Low | Reload on focus, validate on load |
| MCP tool bypasses extension | Medium | Document: MCP must call extension API |

### Security Properties

1. **Defense in Depth**: Locks complement firewall, not replace
2. **Fail Secure**: If lock check fails, default to BLOCKED
3. **No Secret Leakage**: Audit logs contain paths only, no contents
4. **User Override**: Force save available for legitimate needs

---

## State Machine

```
File State Machine:
                                    
     ┌──────────────────────────────┐
     │                              │
     ▼                              │
┌─────────┐  lock()   ┌─────────┐   │ unlock()
│ UNLOCKED│──────────▶│ LOCKED  │───┘
└─────────┘           └────┬────┘
                           │
              requestAccess()
                           │
         ┌─────────────────┼─────────────────┐
         ▼                 ▼                 ▼
   ┌──────────┐     ┌──────────┐      ┌──────────┐
   │TEMP_ONCE │     │TEMP_TIMED│      │TEMP_SESSION│
   └────┬─────┘     └────┬─────┘      └─────┬─────┘
        │                │                  │
    write done       timer expires      session ends
        │                │                  │
        └────────────────┴──────────────────┘
                         │
                         ▼
                    ┌─────────┐
                    │ LOCKED  │
                    └─────────┘
```

---

## API Surface

### LockService Public Methods

```typescript
class LockService {
  // Core operations
  lock(uri: Uri, reason?: string): Promise<boolean>;
  unlock(uri: Uri): Promise<boolean>;
  toggleLock(uri: Uri): Promise<boolean>;
  unlockAll(): Promise<void>;

  // Query
  isLocked(uri: Uri): boolean;
  isDirectlyLocked(uri: Uri): boolean;
  getLockInfo(uri: Uri): LockedItem | undefined;
  getAllLocks(): LockedItem[];
  getLockedPaths(): Set<string>;

  // Access control
  requestAccess(uri: Uri, reason: string): Promise<boolean>;
  grantTempAccess(uri: Uri, scope: 'once' | 'timed' | 'session'): void;
  checkModification(uri: Uri, reason: string): Promise<boolean>;

  // Events
  readonly onLocksChanged: Event<void>;

  // Lifecycle
  dispose(): void;
}
```

---

## Error Handling

| Error | User Message | Action |
|-------|--------------|--------|
| Lock file corrupted | "Lock registry corrupted, resetting" | Reset to workspaceState backup |
| Path normalization fails | (Silent) | Log error, treat as unlocked |
| Storage write fails | "Failed to save lock state" | Retry, keep in-memory state |
| Decoration fails | (Silent) | Log error, hide decoration |
