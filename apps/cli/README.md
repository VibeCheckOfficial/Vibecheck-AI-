<p align="center">
  <img src="https://vibecheckai.dev/logo.png" alt="VibeCheck Logo" width="120" />
</p>

<h1 align="center">VibeCheck CLI</h1>

<p align="center">
  <strong>Hallucination prevention for AI-assisted development</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/vibecheck-ai"><img src="https://img.shields.io/npm/v/vibecheck-ai.svg?style=flat-square&color=blue" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/vibecheck-ai"><img src="https://img.shields.io/npm/dm/vibecheck-ai.svg?style=flat-square&color=green" alt="npm downloads" /></a>
  <a href="https://github.com/vibecheckai/vibecheck/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square" alt="license" /></a>
  <a href="https://vibecheckai.dev/discord"><img src="https://img.shields.io/discord/1234567890?style=flat-square&color=5865F2&label=discord" alt="discord" /></a>
</p>

<p align="center">
  <a href="https://vibecheckai.dev">Website</a> •
  <a href="https://vibecheckai.dev/docs">Documentation</a> •
  <a href="https://vibecheckai.dev/discord">Discord</a> •
  <a href="https://twitter.com/vibecheckai">Twitter</a>
</p>

---

## The Problem

AI coding assistants are incredibly powerful, but they hallucinate. They invent APIs that don't exist, reference outdated documentation, and make assumptions about your codebase that aren't true.

**VibeCheck solves this.** It creates a "truth layer" for your project—a source of verified facts that AI assistants can reference to stay grounded in reality.

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                    Your Codebase                            │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                 VibeCheck Truthpack                         │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐               │
│  │  Routes   │  │   Env     │  │   Auth    │  ...          │
│  │  Schema   │  │  Schema   │  │  Config   │               │
│  └───────────┘  └───────────┘  └───────────┘               │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              AI Assistant (Cursor, Copilot, etc.)           │
│                                                             │
│  "Based on the truthpack, I can see your API uses          │
│   JWT auth with these exact routes..."                      │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

### Installation

```bash
# Install globally
npm install -g vibecheck-ai

# Or use with npx
npx vibecheck-ai
```

### Initialize Your Project

```bash
# Navigate to your project
cd your-project

# Initialize VibeCheck
vibecheck init
```

This creates a `.vibecheck/` directory with your project's truthpack—a verified snapshot of your codebase's reality.

### Validate AI Suggestions

```bash
# Check for hallucinations in staged changes
vibecheck check

# Validate a specific file
vibecheck validate src/api/routes.ts

# Run full analysis
vibecheck analyze
```

## Commands

| Command | Description |
|---------|-------------|
| `vibecheck init` | Initialize VibeCheck in your project |
| `vibecheck scan` | Scan codebase and generate truthpack |
| `vibecheck check` | Run hallucination and drift detection |
| `vibecheck validate [file]` | Validate files against truthpack |
| `vibecheck ship` | Pre-deployment security checks with auto-fix |
| `vibecheck fix` | Apply auto-fixes for detected issues |
| `vibecheck report` | Generate enterprise-grade HTML/PDF reports |
| `vibecheck doctor` | Validate system dependencies and configuration |
| `vibecheck config` | View or edit configuration |
| `vibecheck watch` | Watch for changes and validate continuously |
| `vibecheck menu` | Interactive menu for all features |

### Ship Command (Pre-deployment Checks)

The `ship` command runs comprehensive security analysis before deployment:

```bash
# Run all pre-deployment checks
vibecheck ship

# Auto-fix issues before shipping  
vibecheck ship --fix

# Force ship despite warnings
vibecheck ship --force
```

**Checks include:**
- **Ultimate Scanner** — 80+ security patterns (credentials, SQLi, XSS, SSRF, etc.)
- **Truthpack validation** — Routes, env vars, auth patterns
- **Drift detection** — Changes from verified baseline
- **Secrets scanning** — API keys, tokens, passwords
- **Code quality** — Dead code, TODO comments, debug statements

## Features

### 🎯 Truthpack Generation

Automatically extract and verify facts about your codebase:

- **Routes** — API endpoints with methods, paths, and handlers
- **Environment** — Required env vars with types and defaults
- **Authentication** — Auth strategies and protected routes
- **Database** — Schema definitions and relationships
- **Dependencies** — Package versions and compatibility

### 🔍 Hallucination Detection

Catch AI mistakes before they become bugs:

- Invented API endpoints
- Non-existent environment variables
- Outdated package versions
- Incorrect type assumptions
- Missing error handling

### 🛡️ Ultimate Security Scanner

Industry-leading security detection with **80+ patterns**:

**Credentials:**
- Stripe, AWS, GitHub, Google, Azure, npm tokens
- OpenAI, Anthropic, SendGrid, Twilio API keys
- Private keys, JWT secrets, database passwords

**Security Vulnerabilities:**
- SQL Injection, XSS, Command Injection
- SSRF, Path Traversal, Open Redirect
- CORS misconfig, Missing CSP, Clickjacking
- Timing attacks, Insecure cookies

**AI Hallucinations:**
- Fake npm packages
- Deprecated APIs (React 18, moment.js)
- Placeholder URLs (example.com, localhost)
- Made-up methods

**Framework-Specific:**
- Next.js server actions, API route auth
- React hooks issues, setState in render
- Express without Helmet, trust-proxy issues

### 🛡️ Code Firewall

Protect critical files from AI modifications:

```typescript
// vibecheck.config.mjs
export default {
  firewall: {
    locked: ['src/core/**', '.env*'],
    warn: ['package.json', 'tsconfig.json'],
  }
};
```

### 📊 Beautiful Reports

Get clear, actionable feedback:

```
┌─────────────────────────────────────────────────────────┐
│  VibeCheck Analysis Complete                            │
├─────────────────────────────────────────────────────────┤
│  ✓ 47 files analyzed                                    │
│  ✓ 12 routes validated                                  │
│  ⚠ 2 potential hallucinations detected                  │
│  ✗ 1 critical issue found                               │
└─────────────────────────────────────────────────────────┘

Critical: src/api/payments.ts:42
  → References 'stripe.customers.delete()' but Stripe SDK
    version 14.x uses 'stripe.customers.del()'
```

## Configuration

Create `vibecheck.config.mjs` in your project root:

```javascript
/** @type {import('vibecheck-ai').VibeCheckConfig} */
export default {
  // Project info
  project: {
    name: 'my-app',
    type: 'nextjs',
  },
  
  // What to analyze
  include: ['src/**/*.ts', 'src/**/*.tsx'],
  exclude: ['**/*.test.ts', '**/node_modules/**'],
  
  // Hallucination detection sensitivity
  analysis: {
    strictness: 'standard', // 'relaxed' | 'standard' | 'paranoid'
    checkDependencies: true,
    checkEnvVars: true,
    checkRoutes: true,
  },
  
  // File protection
  firewall: {
    locked: ['.env*', 'src/core/**'],
    warn: ['package.json'],
  },
};
```

## IDE Integration

### Cursor

VibeCheck works seamlessly with Cursor. Install the MCP server for real-time validation:

```bash
npm install -g @vibecheckai/mcp-server
```

Add to your Cursor settings:

```json
{
  "mcpServers": {
    "vibecheck": {
      "command": "vibecheck-mcp"
    }
  }
}
```

### VS Code

Install the [VibeCheck extension](https://marketplace.visualstudio.com/items?itemName=vibecheckai.vibecheck) for inline validation and truthpack browsing.

## CI/CD Integration

### GitHub Actions

```yaml
name: VibeCheck
on: [push, pull_request]

jobs:
  vibecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm install -g vibecheck-ai
      - run: vibecheck check --ci
```

### Pre-commit Hook

```bash
# Add to your package.json
{
  "husky": {
    "hooks": {
      "pre-commit": "vibecheck check"
    }
  }
}
```

## Why VibeCheck?

| Without VibeCheck | With VibeCheck |
|-------------------|----------------|
| AI invents non-existent APIs | AI references verified truthpack |
| Outdated code patterns | Current codebase reality |
| Runtime errors from hallucinations | Compile-time hallucination detection |
| Manual code review for AI output | Automated validation |
| "It worked on my machine" | Consistent truth across team |

## Pricing

| Tier | Price | Features |
|------|-------|----------|
| **Free** | $0 | CLI commands, local analysis, basic truthpack |
| **Pro** | $29/mo | Unlimited projects, CI/CD, team features, priority support |
| **Enterprise** | Custom | SSO, audit logs, custom policies, dedicated support |

All CLI commands are **free forever**. Pro unlocks cloud features and team collaboration.

## Community

- **Discord** — [Join our community](https://vibecheckai.dev/discord)
- **Twitter** — [@vibecheckai](https://twitter.com/vibecheckai)
- **GitHub** — [vibecheckai/vibecheck](https://github.com/vibecheckai/vibecheck)

## Contributing

We welcome contributions! See [CONTRIBUTING.md](https://github.com/vibecheckai/vibecheck/blob/main/CONTRIBUTING.md) for guidelines.

## License

MIT © [VibeCheck AI](https://vibecheckai.dev)

---

<p align="center">
  <strong>Stop hallucinations. Ship with confidence.</strong>
</p>

<p align="center">
  <a href="https://vibecheckai.dev">Get Started →</a>
</p>
