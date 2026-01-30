# VibeCheck Mock Detector

🔍 **Detect and eliminate mock, fake, and placeholder data from your codebase**

The most comprehensive scanner for finding hardcoded mock data, fake credentials, placeholder content, and debug code that shouldn't ship to production.

## Features

- **100+ Detection Patterns** - Credentials, fake users, placeholder content, debug code, and more
- **AST-Based Analysis** - Deep semantic analysis beyond regex matching
- **AI-Powered Remediation** - Automatic fix suggestions using Claude
- **Baseline Mode** - Track only new issues, ignore known technical debt
- **Monorepo Support** - Scan multiple packages with per-package configuration
- **Industry Patterns** - Specialized rules for fintech, healthcare, ecommerce
- **CI/CD Integration** - GitHub Action, pre-commit hooks, SARIF output

## Installation

```bash
npm install -g @vibecheck/cli
# or
npx vibecheck
```

## Quick Start

```bash
# Initialize in your project
vibecheck init

# Scan your codebase
vibecheck scan:mocks

# Create a baseline of existing issues
vibecheck baseline create

# Auto-remediate with AI
vibecheck remediate --interactive
```

## Commands

### `vibecheck scan:mocks`

Scan codebase for mock/fake data.

```bash
vibecheck scan:mocks [options]

Options:
  -d, --dir <path>       Directory to scan (default: cwd)
  -f, --format <format>  Output format: text|json|sarif|markdown
  -s, --severity <level> Minimum severity to report
  --fail-on <level>      Exit with error if findings at severity
  --baseline <path>      Baseline file to filter known issues
  --no-ast               Disable AST analysis
  --industries <list>    Comma-separated industries
```

### `vibecheck baseline`

Manage baseline of known issues.

```bash
# Create baseline from current scan
vibecheck baseline create

# Show new issues not in baseline
vibecheck baseline diff

# Remove fixed issues from baseline
vibecheck baseline prune

# Show baseline contents
vibecheck baseline show
```

### `vibecheck remediate`

AI-powered auto-remediation.

```bash
vibecheck remediate [options]

Options:
  --auto           Auto-apply high-confidence fixes
  --interactive    Review and approve each fix
  --dry-run        Show fixes without applying
  --severity       Only remediate at or above severity
  --max-fixes      Maximum fixes to apply
```

### `vibecheck hooks`

Manage Git hooks.

```bash
# Install pre-commit hook
vibecheck hooks install --fail-on high

# Remove hook
vibecheck hooks uninstall
```

## Configuration

Create `.vibecheckrc.yaml` in your project root:

```yaml
# Severity threshold for CI failures
failOn: high

# Industry-specific patterns
industries:
  - fintech
  - saas

# Files to scan
include:
  - "**/*.ts"
  - "**/*.tsx"

# Files to exclude
exclude:
  - "**/*.test.*"
  - "**/__mocks__/**"

# Custom rules
rules:
  - id: my-custom-rule
    pattern: "INTERNAL_API_KEY"
    severity: critical
    category: credentials
    description: "Internal API key detected"
    fix: "Use environment variable"

# Suppressions
suppressions:
  - rule: mock-variable
    file: "src/mocks/**"
    reason: "Intentional mock directory"
```

## GitHub Action

```yaml
name: VibeCheck
on: [push, pull_request]

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: vibecheck/mock-detector-action@v1
        with:
          fail-on: high
          sarif: true
          comment: true
```

## Detection Categories

| Category | Severity | Examples |
|----------|----------|----------|
| `credentials` | Critical | API keys, passwords, JWT tokens |
| `fake-auth` | Critical | Auth bypass, hardcoded sessions |
| `mock-data` | High | Mock variables, faker imports |
| `fake-user-data` | High | John Doe, test@example.com |
| `stub-response` | Medium | Empty returns, "not implemented" |
| `placeholder-content` | Medium | Lorem ipsum, "TBD" |
| `debug-code` | Medium | console.log, debugger |
| `hardcoded-config` | Medium | localhost URLs, hardcoded ports |

## AI Remediation

VibeCheck uses Claude to generate intelligent fix suggestions:

```bash
# Set your API key
export ANTHROPIC_API_KEY=your-key

# Run remediation
vibecheck remediate --interactive
```

Example output:
```
📍 src/api/users.ts:42
   Rule: hardcoded-localhost
   Severity: high

   Original:
   const API_URL = "http://localhost:3000/api";

   Suggested fix:
   const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api";

   Explanation: Wrapped localhost URL with environment variable fallback
   Confidence: high

   Apply this fix? (y/n):
```

## Baseline Mode

Track only new issues while ignoring existing technical debt:

```bash
# Create initial baseline
vibecheck baseline create

# Run scan with baseline (only shows new issues)
vibecheck scan:mocks --baseline .vibecheck-baseline.json

# In CI: fail only on new issues
vibecheck baseline diff --fail-on high
```

## Monorepo Support

VibeCheck automatically detects npm/yarn/pnpm workspaces, Lerna, Nx, and Turborepo:

```bash
# Scan all packages
vibecheck scan:mocks

# Scan specific packages
vibecheck scan:mocks --packages "web,api"

# Parallel scanning
vibecheck scan:mocks --parallel
```

Per-package configuration:
```
my-monorepo/
├── .vibecheckrc.yaml        # Root config
├── packages/
│   ├── web/
│   │   └── .vibecheckrc.yaml  # Package-specific overrides
│   └── api/
│       └── .vibecheckrc.yaml
```

## VS Code Extension

Install the VibeCheck VS Code extension for real-time detection:

- Inline diagnostics with squiggly lines
- Quick fix actions
- Code lens for issue counts
- AI-powered fix suggestions

## License

MIT
