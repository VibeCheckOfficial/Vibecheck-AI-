<div align="center">

# 🛡️ Vibecheck — Agent Firewall

### Stop AI Context Drift Before It Ships

**Proof-carry-change for Cursor, Copilot, Claude, and Windsurf**

[![VS Code Version](https://img.shields.io/badge/VS%20Code-1.85%2B-blue?style=flat-square&logo=visual-studio-code)](https://code.visualstudio.com/)
[![Version](https://img.shields.io/badge/version-5.0.0-blue?style=flat-square)](https://marketplace.visualstudio.com/items?itemName=Vibecheck-AI.vibecheck-AI)
[![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)
[![GitHub](https://img.shields.io/github/stars/vibecheck-oss/vibecheck?style=flat-square&logo=github)](https://github.com/vibecheck-oss/vibecheck)

[Marketplace](https://marketplace.visualstudio.com/items?itemName=Vibecheck-AI.vibecheck-AI) · [Documentation](https://vibecheckai.dev/docs) · [Report Issue](https://github.com/vibecheck-oss/vibecheck/issues) · [Website](https://vibecheck.ai)

</div>

---

## 🎯 The Problem

AI coding tools write fast, but **context drift ships bugs**. Most failures aren't hallucinations—they're drift:

- 🚫 UI calls routes that don't exist
- 🔑 `process.env.*` appears with no schema or validation
- 🔐 Frontend claims don't match backend enforcement
- 📝 Types and contracts drift silently over time
- ✅ Toast says "Saved" but nothing actually changes

**Vibecheck enforces Proof-Carry-Change: if the agent can't prove it, it can't ship it.**

---

## ✨ What Vibecheck Does

### 🛡️ Agent Firewall — Three-Layer Protection

| Layer | Protection | Status |
|-------|-----------|--------|
| **MCP Interceptor** | Blocks AI tool calls at protocol level | ✅ Active |
| **File System Hook** | Intercepts all file writes | ✅ Toggle in status bar |
| **Git Pre-Commit** | Validates staged changes before commit | ✅ Auto-installed |

### 🔒 Repo Lock Mode — Enforce Truth

When enabled, Vibecheck becomes a strict bouncer:

- ✅ **No Ghost Routes** — UI → API must match reality
- ✅ **No Ghost Env Vars** — Every env must be declared + validated
- ✅ **No Auth Drift** — Frontend claims must match backend enforcement
- ✅ **No Contract Drift** — Request/response shapes stay consistent
- ✅ **No Fake Success** — Success must correlate to real mutations

### 📊 Real-Time Intelligence

- **Dashboard** — Workspace health at a glance
- **Findings Panel** — All issues organized by severity
- **Truthpack Viewer** — Live index of routes, env vars, auth rules
- **History** — Track changes and verification over time
- **Score Badge** — Production readiness score in status bar
- **Inline Diagnostics** — Problems appear in Problems panel
- **CodeLens Warnings** — Contextual warnings above functions

---

## 🚀 Quick Start

### Step 1: Install the Extension

Install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=Vibecheck-AI.vibecheck-AI) or run:

```bash
code --install-extension Vibecheck-AI.vibecheck-AI
```

### Step 2: Install CLI (Required)

```bash
npm i -g @vibecheckai/cli
```

### Step 3: Initialize Your Repo

```bash
vibecheck link
```

### Step 4: Generate AI Rules (or use Kickoff)

**Option A: Quick Start (Recommended)**
```bash
vibecheck kickoff
```
This runs a 60-second guided flow: link → forge → audit → ship

**Option B: Manual Setup**
```bash
vibecheck forge
```
This generates AI IDE rules with your repo's context: routes, env vars, auth rules, contracts, and patterns.

### Step 5: Enable Agent Firewall

Click the **🛡️ Firewall** indicator in VS Code's status bar (bottom right) to toggle protection on/off.

**Or use the command:**

```bash
vibecheck shield enforce
```

---

## 💡 How It Works

### 1. Truthpack (Repo Reality Index)

Vibecheck builds a live index of your repository:

```
routes/          → All API endpoints
env/             → Environment variable schema
auth/            → Authentication & authorization rules
contracts/       → Request/response shapes
ui-flows/        → User interaction patterns
```

### 2. Change Packet (Proof Required)

Before an AI edit lands, the agent must submit:

- **Intent** — What the change does
- **Claims** — What it claims to use (routes/env/auth)
- **Evidence** — Pointers to truthpack entries
- **Verification Plan** — How to verify the change

### 3. Firewall Verdict

| Verdict | Meaning | Action |
|---------|---------|--------|
| ✅ **ALLOW** | Proof is real | Change proceeds |
| ⚠️ **WARN** | Soft claims unverified | Change allowed with warning |
| 🚫 **BLOCK** | Hard claims unproven | Change blocked |

---

## 📖 Examples

### Example 1: Ghost Endpoint

**AI tries to add:**

```typescript
await fetch("/api/legal/acceptance")
```

**Result:** 🚫 **BLOCKED** — Route not found in truthpack

**Fix:** Add route registration + schema + auth + test, then regenerate truthpack.

### Example 2: Ghost Environment Variable

**AI tries to add:**

```typescript
const secret = process.env.AUTH_SECRET
```

**Result:** 🚫 **BLOCKED** — Not declared in env schema or `.env.example`

**Fix:** Declare in `.env.example` + add validation on boot.

### Example 3: Auth Drift

**UI says:** "Admin only"  
**API says:** No auth check

**Result:** 🚫 **BLOCKED** — Privilege boundary mismatch

**Fix:** Add auth middleware to API endpoint or remove UI restriction.

---

## 🎮 VS Code Features

### Status Bar Integration

- **🛡️ Firewall Toggle** — One-click enable/disable protection
- **Score Badge** — Production readiness at a glance
- **Quick Actions Menu** — Right-click for common commands

### Commands Palette

| Command | Shortcut | Description |
|---------|----------|-------------|
| **Vibecheck: Scan Workspace** | `Ctrl+Shift+G` | Full workspace scan |
| **Vibecheck: Show Dashboard** | — | Open health dashboard |
| **Vibecheck: Verify Selected Code** | `Ctrl+Shift+V` | Check selected AI code |
| **Vibecheck: Verify AI Output** | `Ctrl+Shift+V` | Verify clipboard content |
| **Vibecheck: Toggle Firewall** | — | Enable/disable firewall |
| **Vibecheck: Ship Check** | `Ctrl+Shift+S` | Final production readiness check |
| **Vibecheck: Show Findings** | `Ctrl+Shift+F` | View all issues |

### Sidebar Panels

- **Dashboard** — Real-time workspace health
- **Verdict** — Ship/Warn/Block status
- **Findings** — All issues organized by severity
- **Truthpack** — Live repo reality index
- **History** — Change tracking and verification

### Quick Fixes

Click the 💡 lightbulb icon on any highlighted code to see quick fixes:

- Add missing route registration
- Declare environment variables
- Fix auth mismatches
- Update contract definitions

---

## ⚙️ Configuration

### Settings

Open VS Code settings (`Ctrl+,`) and search for "Vibecheck":

| Setting | Default | Description |
|---------|---------|-------------|
| `vibecheck.enabled` | `true` | Enable vibecheck analysis |
| `vibecheck.analyzeOnSave` | `true` | Run analysis when files are saved |
| `vibecheck.showInlineHints` | `true` | Show inline decorations for issues |
| `vibecheck.notifyOnCritical` | `true` | Show notifications for critical findings |
| `vibecheck.firewallQuietMode` | `false` | Suppress firewall popup notifications |

### Repo Lock Mode Policy

Create `.vibecheck/policy.json`:

```json
{
  "rules": {
    "blockGhostRoutes": true,
    "blockGhostEnvVars": true,
    "blockAuthDrift": true,
    "blockContractDrift": true,
    "requireVerificationForSideEffects": true
  },
  "severity": {
    "CG001": "error",
    "CG002": "error",
    "CG003": "warning"
  }
}
```

---

## 🔧 CLI Commands (v4.0)

### Setup & Analysis (FREE)

| Command | Description |
|---------|-------------|
| `vibecheck link` | Initialize vibecheck in your repo |
| `vibecheck kickoff` | 60-second guided onboarding with auto-detection |
| `vibecheck forge` | Generate AI IDE rules (.cursorrules, .windsurf, MDC) |
| `vibecheck audit` | Static analysis (routes/env/auth/contracts/security) |
| `vibecheck doctor` | Environment health check with auto-fix |
| `vibecheck watch` | Continuous mode - re-runs on changes |
| `vibecheck safelist` | Manage finding suppressions with justification |
| `vibecheck packs` | Generate artifacts (evidence, reports, graphs) |
| `vibecheck labs` | Access experimental features |

### Agent Firewall & Proof (PRO)

| Command | Description |
|---------|-------------|
| `vibecheck shield` | Agent Firewall - intercept, validate, enforce |
| `vibecheck shield status` | Show firewall status |
| `vibecheck shield enforce` | Enable enforcement mode |
| `vibecheck shield observe` | Observe-only mode |
| `vibecheck intent` | Declare and manage AI session intent |
| `vibecheck approve` | Authority verdicts - PROCEED/STOP/DEFER |
| `vibecheck ship` | Final verdict: SHIP / WARN / BLOCK |
| `vibecheck prove` | Full proof loop: audit → reality → ship |
| `vibecheck reality` | Browser-based runtime verification |
| `vibecheck fix` | AI-powered auto-fix (plan/apply/loop modes) |
| `vibecheck checkpoint` | Compare baseline vs current state |
| `vibecheck launch` | CI/CD enforcement - preflight checks |
| `vibecheck seal` | Generate verification seal/badge |
| `vibecheck polish` | Code polish and cleanup |

## 🛠️ MCP Tools (v4.0)

Vibecheck provides **17 MCP tools** for AI agents (Cursor, Claude, Windsurf):

### FREE Tier (10 tools)
- `vibecheck.link` - One-time project setup
- `vibecheck.kickoff` - Interactive guided onboarding
- `vibecheck.doctor` - Environment health check
- `vibecheck.audit` - Analyze codebase for issues
- `vibecheck.forge` - Generate IDE rules and AI context
- `vibecheck.shield` - Agent Firewall (observe mode)
- `vibecheck.intent` - Declare and manage AI session intent
- `vibecheck.packs` - Generate shareable artifact packs
- `vibecheck.safelist` - Manage finding safelist
- `vibecheck.auth` - Authentication management

### PRO Tier (7 tools)
- `vibecheck.ship` - Verdict engine with evidence
- `vibecheck.fix` - AI-powered auto-fix
- `vibecheck.prove` - Full proof loop with runtime verification
- `vibecheck.reality` - Browser-based runtime verification
- `vibecheck.checkpoint` - Baseline comparison
- `vibecheck.launch` - CI/CD enforcement
- `vibecheck.seal` - Generate verification seal/badge
- `vibecheck.approve` - Authority verdicts
- `vibecheck.polish` - Code polish and cleanup

---

## 🎯 Use Cases

### ✅ Perfect For

- **AI-Assisted Development** — Cursor, Copilot, Claude, Windsurf users
- **Team Collaboration** — Prevent context drift across team members
- **CI/CD Integration** — Block bad code before it merges
- **Legacy Codebases** — Document and enforce existing patterns
- **Microservices** — Keep contracts and routes in sync

### 🚫 Not For

- Static site generators (no runtime verification)
- Pure frontend apps without backend contracts
- Projects without AI coding tools

---

## 🌟 Enterprise Features

Available with [Vibecheck Enterprise](https://vibecheck.ai/pricing):

- **Compliance Dashboard** — SOC 2, GDPR, HIPAA compliance tracking
- **Security Scanner** — Advanced vulnerability detection
- **Performance Monitor** — Real-time performance insights
- **Change Impact Analyzer** — Understand code change effects
- **AI Code Explainer** — Explain complex code patterns
- **Team Collaboration** — Shared findings and evidence packs
- **MDC Generator** — Generate Model Context Protocol files
- **Authority System** — Multi-agent coordination and conflict resolution
- **Conductor** — Orchestrate multiple AI agents safely

---

## 📚 Resources

- 📖 [Full Documentation](https://vibecheckai.dev/docs)
- 🎥 [Video Tutorials](https://vibecheckai.dev/tutorials)
- 💬 [Discord Community](https://discord.gg/vibecheck)
- 🐛 [Report Issues](https://github.com/vibecheck-oss/vibecheck/issues)
- 💡 [Feature Requests](https://github.com/vibecheck-oss/vibecheck/issues/new)

---

## 🤝 Contributing

We welcome contributions! See our [Contributing Guide](https://github.com/vibecheck-oss/vibecheck/blob/main/CONTRIBUTING.md) for details.

---

## 📄 License

This extension is licensed under the MIT License. See [LICENSE](LICENSE) for details.

---

<div align="center">

**Made with ❤️ by the Vibecheck team**

[Website](https://vibecheck.ai) · [Documentation](https://vibecheckai.dev/docs) · [GitHub](https://github.com/vibecheck-oss/vibecheck)

</div>
