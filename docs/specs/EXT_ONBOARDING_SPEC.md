# Extension Onboarding Wizard Specification

## Overview

A 4-step guided onboarding flow inside VS Code that gets users to first value fast.

---

## UX Flow

### State Machine

```
┌─────────────┐
│   START     │
└──────┬──────┘
       │ First run detected OR command triggered
       ▼
┌─────────────┐    Skip clicked    ┌─────────────┐
│   STEP 1    │───────────────────▶│   SKIPPED   │
│   Auth      │                    └──────┬──────┘
└──────┬──────┘                           │
       │ Signed in                        │ Can resume later
       ▼                                  │
┌─────────────┐                           │
│   STEP 2    │◀──────────────────────────┘
│   CLI       │
└──────┬──────┘
       │ CLI verified
       ▼
┌─────────────┐
│   STEP 3    │
│   Scan      │
└──────┬──────┘
       │ Scan complete
       ▼
┌─────────────┐
│   STEP 4    │
│   Results   │
└──────┬──────┘
       │ Dismissed
       ▼
┌─────────────┐
│  COMPLETED  │
└─────────────┘
```

### Step Details

#### Step 1: Connect / Sign In
- **Goal**: Verify user has valid session or API key
- **UI Elements**:
  - Status indicator (connected/not connected)
  - "Sign In" button → Opens auth flow
  - "Use API Key" link → Opens settings input
  - "Continue Offline" option (limited features)
- **Completion Signal**: `vibecheck.apiKey` exists in SecretStorage OR user clicks offline
- **Offline Handling**: Allow proceeding with warning badge

#### Step 2: Install/Verify CLI
- **Goal**: Ensure CLI is available for scans
- **UI Elements**:
  - Auto-detect CLI status on load
  - Show detected version if found
  - Install command with copy button: `npm install -g @vibecheck/cli`
  - "Verify Installation" button → Re-checks CLI
  - Platform-specific commands shown
- **Completion Signal**: `CLIService.isInstalled()` returns true
- **Fallback**: "Skip CLI" option with explanation of limited functionality

#### Step 3: Run First Scan
- **Goal**: User experiences core value
- **UI Elements**:
  - "Scan Project" button → Triggers `vibecheck.runScan`
  - Progress indicator during scan
  - Real-time status updates
- **Completion Signal**: Scan completes (success or with findings)
- **Error Handling**: Show retry option, explain common issues

#### Step 4: View Results
- **Goal**: User sees actionable output
- **UI Elements**:
  - Summary of findings (if any)
  - "Open Dashboard" button → `vibecheck.openDashboard` OR opens sidebar
  - "Enable Firewall" toggle (pre-checked)
  - "Complete Setup" button
- **Completion Signal**: User clicks complete OR dismisses panel

---

## Screens

### Panel Layout

```
┌────────────────────────────────────────────────────────┐
│  [Logo]  Welcome to VibeCheck                          │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Step Progress: ● ○ ○ ○                          │  │
│  │  ─────────────────────────────────────────────── │  │
│  │                                                  │  │
│  │  [Current Step Content]                          │  │
│  │                                                  │  │
│  │                                                  │  │
│  │                                                  │  │
│  └──────────────────────────────────────────────────┘  │
│                                                        │
│  [Skip for now]                    [Primary Button]    │
└────────────────────────────────────────────────────────┘
```

### Step 1: Auth Screen

```
┌──────────────────────────────────────────────────┐
│  🔐 Connect Your Account                         │
│                                                  │
│  Sign in to unlock all features including:       │
│  • Cloud-synced truthpacks                       │
│  • Team dashboards                               │
│  • Advanced AI analysis                          │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │     [  Sign In with VibeCheck  ]           │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  ─────────── or ───────────                      │
│                                                  │
│  [Enter API Key]     [Continue Offline →]        │
└──────────────────────────────────────────────────┘
```

### Step 2: CLI Screen

```
┌──────────────────────────────────────────────────┐
│  🔧 Install VibeCheck CLI                        │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │  ❌ CLI not detected                       │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  Run this command in your terminal:              │
│  ┌────────────────────────────────────────────┐  │
│  │  npm install -g @vibecheck/cli       [📋]  │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  [  Verify Installation  ]   [Skip CLI →]        │
└──────────────────────────────────────────────────┘
```

### Step 3: Scan Screen

```
┌──────────────────────────────────────────────────┐
│  🔍 Run Your First Scan                          │
│                                                  │
│  Scan your project to detect:                    │
│  • Ghost imports & fake APIs                     │
│  • Security vulnerabilities                      │
│  • AI hallucinations                             │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │     [  🚀 Scan Project  ]                  │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  This typically takes 10-30 seconds              │
└──────────────────────────────────────────────────┘
```

### Step 4: Results Screen

```
┌──────────────────────────────────────────────────┐
│  ✅ Setup Complete!                              │
│                                                  │
│  Scan Results:                                   │
│  ┌────────────────────────────────────────────┐  │
│  │  📊 3 files scanned                        │  │
│  │  ⚠️ 2 warnings found                       │  │
│  │  ✅ No critical issues                     │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  [✓] Enable Firewall Protection (recommended)    │
│                                                  │
│  [  View Details  ]    [  Complete Setup  ]      │
└──────────────────────────────────────────────────┘
```

---

## Storage Keys

### GlobalState

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `vibecheck.onboardingCompleted` | boolean | false | True when user completes or skips |
| `vibecheck.onboardingStep` | number | 0 | Current step (0-4), 0 = not started |
| `vibecheck.onboardingSkippedAt` | string? | undefined | ISO timestamp if skipped |

### SecretStorage (Existing)

| Key | Type | Description |
|-----|------|-------------|
| `vibecheck.apiKey` | string | API key for auth |
| `vibecheck.token` | string | Auth session token |

---

## Commands

### New Commands

| Command | Title | Description |
|---------|-------|-------------|
| `vibecheck.showWelcome` | VibeCheck: Get Started | Opens onboarding panel (existing in package.json, needs registration) |

### Existing Commands Used

| Command | Step | Purpose |
|---------|------|---------|
| `vibecheck.runScan` | 3 | Trigger project scan |
| `vibecheck.refreshTruthpack` | 3 | Generate truthpack after scan |

---

## Message Passing

### Webview → Extension

```typescript
interface OnboardingMessage {
  command: 
    | 'startAuth'        // User clicked sign in
    | 'enterApiKey'      // User wants to enter API key
    | 'continueOffline'  // User chose offline mode
    | 'verifyCli'        // Check CLI installation
    | 'skipCli'          // Skip CLI step
    | 'runScan'          // Start project scan
    | 'viewResults'      // Open results panel
    | 'enableFirewall'   // Toggle firewall on
    | 'complete'         // Finish onboarding
    | 'skip';            // Skip entire onboarding
}
```

### Extension → Webview

```typescript
interface OnboardingUpdate {
  command: 
    | 'updateStep'       // Move to next step
    | 'updateAuthStatus' // Auth state changed
    | 'updateCliStatus'  // CLI detection result
    | 'scanProgress'     // Scan progress update
    | 'scanComplete'     // Scan finished
    | 'error';           // Error occurred
  data: {
    step?: number;
    authStatus?: 'connected' | 'disconnected' | 'offline';
    cliInstalled?: boolean;
    cliVersion?: string;
    scanProgress?: number;
    scanResult?: { files: number; warnings: number; critical: number };
    error?: string;
  };
}
```

---

## Integration Points

### First-Run Detection (extension.ts)

```typescript
// In activate()
const onboardingCompleted = context.globalState.get('vibecheck.onboardingCompleted', false);
const showWelcome = vscode.workspace.getConfiguration('vibecheck').get('showWelcomeOnStartup', true);

if (!onboardingCompleted && showWelcome) {
  // Defer to avoid blocking activation
  setTimeout(() => {
    WelcomePanel.show(context.extensionUri);
  }, 1000);
}
```

### Resume Onboarding (SidebarPanel)

Add "Resume Setup" CTA in sidebar when `onboardingCompleted === false`:

```html
<div class="resume-onboarding">
  <span>Setup incomplete</span>
  <button onclick="resumeOnboarding()">Resume →</button>
</div>
```

---

## Offline/Unauthed Handling

| State | Behavior |
|-------|----------|
| No API key, chose "Continue Offline" | Proceed with warning, mark as offline mode |
| Auth fails | Show error, retry option, offline fallback |
| CLI not installed + skipped | Proceed with extension-only features |
| Scan fails | Show error details, retry button, manual refresh option |

---

## Accessibility

- All interactive elements have focus indicators
- Keyboard navigation between steps
- Screen reader labels on progress indicators
- High contrast mode support via VS Code theme colors
