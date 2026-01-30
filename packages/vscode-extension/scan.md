# 🔍 Scan Your Workspace

Vibecheck analyzes your entire codebase for:

- **🎭 Fake Features** — Functions that look real but do nothing
- **📦 Mock Data** — Hardcoded test data that shouldn't ship
- **🤖 AI Hallucinations** — Non-existent imports and phantom APIs
- **🔐 Security Issues** — Hardcoded secrets and credentials
- **⚠️ Code Smells** — Silent catches, async without await, etc.

## How it works

1. Press `Cmd+Shift+G` (Mac) or `Ctrl+Shift+G` (Windows/Linux)
2. Vibecheck scans all supported files in your workspace
3. Issues appear in the Problems panel with severity levels
4. Click any issue to jump to the code

## What you'll see

```
🛡️ Vibecheck Score: 73/100

Issues Found:
- 🔴 3 Critical (blocks ship)
- 🟡 7 Warnings (should fix)
- 💡 12 Hints (consider fixing)
```

The score tells you if your code is production-ready at a glance.
