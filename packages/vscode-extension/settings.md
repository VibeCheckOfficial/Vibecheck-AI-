# ⚙️ Configure Vibecheck

Customize Vibecheck to match your workflow.

## Settings

Open Settings (`Cmd+,` / `Ctrl+,`) and search for "Vibecheck":

| Setting | Default | Description |
|---------|---------|-------------|
| `Vibecheck.enabled` | `true` | Enable/disable analysis |
| `Vibecheck.analyzeOnSave` | `true` | Auto-analyze when you save |
| `Vibecheck.analyzeOnType` | `false` | Real-time analysis (heavier) |
| `Vibecheck.showInlineHints` | `true` | Show decorations in editor |

## Rule Severity

Configure severity per-rule in `Vibecheck.severity`:

```json
{
  "Vibecheck.severity": {
    "CG001": "error",    // Hardcoded mock data
    "CG002": "error",    // Fake features
    "CG003": "warning",  // TODOs
    "CG010": "off"       // Disable console warnings
  }
}
```

**Levels:** `error`, `warning`, `hint`, `off`

## Ignore Paths

Skip files from analysis:

```json
{
  "Vibecheck.ignorePaths": [
    "**/node_modules/**",
    "**/test/**",
    "**/*.test.ts"
  ]
}
```

## Project Config

Create `.Vibecheck.json` in your project root for team-wide settings:

```json
{
  "extends": "strict",
  "rules": {
    "CG001": "error",
    "CG010": "off"
  },
  "ignore": ["**/fixtures/**"]
}
```
